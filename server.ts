import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import os from "os";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PORT = 4005;
const TXLINE_API_BASE =
  process.env.TXLINE_API_BASE || "https://txline.txodds.com";
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret";

// Devnet demo-USDC faucet. The mint authority is the server's Solana keypair
// (also the program deploy wallet). Public mint address — safe to hardcode.
const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const STAKE_MINT_ADDR =
  process.env.VITE_STAKE_MINT || "EmoE5KS1riKrxMwap5sUAcPfw4x9SLwTj6k2Yq5B9WR";
const FAUCET_AMOUNT = 1_000_000_000; // 1000 demo-USDC (6 decimals)
const faucetLastClaim = new Map<string, number>();
const FAUCET_COOLDOWN_MS = 60 * 1000;

let faucetKeypair: Keypair | null = null;
function getFaucetKeypair(): Keypair {
  if (faucetKeypair) return faucetKeypair;
  const keyPath =
    process.env.SOLANA_KEYPAIR || path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  faucetKeypair = Keypair.fromSecretKey(new Uint8Array(secret));
  return faucetKeypair;
}

// NOTE: on-chain positions are the real source of truth for user balances.
// The JSON-file endpoints below are kept for test-mode / demo only.

// ---------------------------------------------------------------------------
// TxLINE guest-JWT cache
// ---------------------------------------------------------------------------

interface JwtCache {
  token: string;
  fetchedAt: number;
}

let jwtCache: JwtCache | null = null;
const JWT_TTL_MS = 25 * 60 * 1000; // refresh after 25 minutes

async function getGuestJwt(): Promise<string> {
  if (jwtCache && Date.now() - jwtCache.fetchedAt < JWT_TTL_MS) {
    return jwtCache.token;
  }

  const res = await fetch(`${TXLINE_API_BASE}/auth/guest/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TxLINE guest auth failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { token: string };
  if (!data.token) throw new Error("TxLINE guest auth: missing token in response");

  jwtCache = { token: data.token, fetchedAt: Date.now() };
  return data.token;
}

/**
 * Returns headers required for every TxLINE data request.
 * The API token is read from env and NEVER forwarded to the browser.
 */
async function txlineHeaders(): Promise<Record<string, string>> {
  const jwt = await getGuestJwt();
  const apiToken =
    process.env.TXODDS_API_TOKEN || process.env.VITE_TXODDS_API_TOKEN || "";
  return {
    Authorization: `Bearer ${jwt}`,
    "X-Api-Token": apiToken,
    Accept: "application/json",
  };
}

// ---------------------------------------------------------------------------
// Nonce store for wallet-signature auth
// ---------------------------------------------------------------------------

interface NonceEntry {
  nonce: string;
  message: string;
  expiresAt: number;
}

const nonces = new Map<string, NonceEntry>();
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function pruneNonces() {
  const now = Date.now();
  for (const [key, entry] of nonces) {
    if (now > entry.expiresAt) nonces.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

/**
 * Stateless session token. Format: `<hmac>.<expMs>.<pubkey>`
 * The HMAC over `pubkey.expMs` lets us verify without a session store.
 */
function issueSessionToken(pubkey: string): string {
  const expMs = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = `${pubkey}.${expMs}`;
  const hmac = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");
  return `${hmac}.${expMs}.${pubkey}`;
}

function validateSessionToken(token: string): string | null {
  const parts = token.split(".");
  // format: <64-char hex hmac> . <expMs> . <pubkey>  (pubkey may contain dots in theory — use last two splits)
  if (parts.length < 3) return null;
  const hmac = parts[0];
  const expMs = Number(parts[1]);
  const pubkey = parts.slice(2).join(".");
  if (!expMs || Date.now() > expMs) return null;
  const expected = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(`${pubkey}.${expMs}`)
    .digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) return null;
  return pubkey;
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

declare module "express-serve-static-core" {
  interface Request {
    pubkey?: string;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((pair) => {
      const idx = pair.indexOf("=");
      if (idx === -1) return [pair.trim(), ""];
      return [pair.slice(0, idx).trim(), decodeURIComponent(pair.slice(idx + 1).trim())];
    })
  );
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Check cookie first, then Authorization header
  const cookies = parseCookies(req.headers.cookie);
  let token = cookies["snaptap_session"];

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const pubkey = validateSessionToken(token);
  if (!pubkey) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  req.pubkey = pubkey;
  next();
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

async function startServer() {
  const app = express();
  app.use(express.json());

  // -------------------------------------------------------------------------
  // /api/health
  // -------------------------------------------------------------------------

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", program: "Fg8kWSCZPGjvFWzxEx4J7u5kxKFGBf3oT2akJfri4Yae" });
  });

  // -------------------------------------------------------------------------
  // Persistence (test-mode; on-chain is the real source of truth)
  // -------------------------------------------------------------------------

  const DATA_DIR = path.join(process.cwd(), "data");
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }

  app.post("/api/save-bets", (req, res) => {
    const { wallet, bets } = req.body as { wallet?: string; bets?: unknown };
    if (!wallet || !bets) {
      return res.status(400).json({ error: "Missing wallet or bets" });
    }
    const safeWallet = wallet.replace(/[^a-zA-Z0-9]/g, "_");
    const filePath = path.join(DATA_DIR, `bets_${safeWallet}.json`);
    fs.writeFileSync(filePath, JSON.stringify(bets, null, 2));
    res.json({ success: true });
  });

  app.get("/api/load-bets", (req, res) => {
    const { wallet } = req.query;
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({ error: "Missing wallet parameter" });
    }
    const safeWallet = wallet.replace(/[^a-zA-Z0-9]/g, "_");
    const filePath = path.join(DATA_DIR, `bets_${safeWallet}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        return res.json(JSON.parse(fileContent));
      } catch {
        return res.status(500).json({ error: "Failed to parse saved bets" });
      }
    }
    res.json([]);
  });

  app.post("/api/save-balance", (req, res) => {
    const { wallet, balance } = req.body as { wallet?: string; balance?: number };
    if (!wallet || balance === undefined) {
      return res.status(400).json({ error: "Missing wallet or balance" });
    }
    const safeWallet = wallet.replace(/[^a-zA-Z0-9]/g, "_");
    const filePath = path.join(DATA_DIR, `balance_${safeWallet}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ balance }, null, 2));
    res.json({ success: true });
  });

  app.get("/api/load-balance", (req, res) => {
    const { wallet } = req.query;
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({ error: "Missing wallet parameter" });
    }
    const safeWallet = wallet.replace(/[^a-zA-Z0-9]/g, "_");
    const filePath = path.join(DATA_DIR, `balance_${safeWallet}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        return res.json(JSON.parse(fileContent));
      } catch {
        return res.status(500).json({ error: "Failed to parse saved balance" });
      }
    }
    res.json({ balance: 1000 });
  });

  // -------------------------------------------------------------------------
  // Auth: nonce + verify
  // -------------------------------------------------------------------------

  app.post("/api/auth/nonce", (req, res) => {
    pruneNonces();
    const { pubkey } = req.body as { pubkey?: string };
    if (!pubkey || typeof pubkey !== "string") {
      return res.status(400).json({ error: "Missing pubkey" });
    }
    const nonce = crypto.randomBytes(16).toString("hex");
    const message = `SnapTap login: ${nonce}`;
    nonces.set(pubkey, {
      nonce,
      message,
      expiresAt: Date.now() + NONCE_TTL_MS,
    });
    res.json({ nonce, message });
  });

  app.post("/api/auth/verify", (req, res) => {
    const { pubkey, signature } = req.body as { pubkey?: string; signature?: string };
    if (!pubkey || !signature) {
      return res.status(400).json({ error: "Missing pubkey or signature" });
    }

    const entry = nonces.get(pubkey);
    if (!entry || Date.now() > entry.expiresAt) {
      return res.status(401).json({ error: "Nonce expired or not found — request a new one" });
    }

    try {
      const messageBytes = new TextEncoder().encode(entry.message);
      const sigBytes = bs58.decode(signature);
      const pubkeyBytes = bs58.decode(pubkey);

      const valid = nacl.sign.detached.verify(messageBytes, sigBytes, pubkeyBytes);
      if (!valid) {
        return res.status(401).json({ error: "Signature verification failed" });
      }
    } catch (err) {
      return res.status(400).json({ error: "Invalid signature or pubkey encoding" });
    }

    // Consume nonce
    nonces.delete(pubkey);

    const token = issueSessionToken(pubkey);

    // httpOnly cookie (SameSite=Strict)
    const cookieMaxAge = 7 * 24 * 60 * 60; // 7 days in seconds
    res.setHeader(
      "Set-Cookie",
      `snaptap_session=${token}; HttpOnly; SameSite=Strict; Max-Age=${cookieMaxAge}; Path=/`
    );

    res.json({ token, pubkey });
  });

  // -------------------------------------------------------------------------
  // Devnet demo-USDC faucet: mint stake tokens to a user so they can bet
  // -------------------------------------------------------------------------

  app.post("/api/faucet", async (req, res) => {
    const { pubkey } = req.body as { pubkey?: string };
    if (!pubkey || typeof pubkey !== "string") {
      return res.status(400).json({ error: "Missing pubkey" });
    }
    const last = faucetLastClaim.get(pubkey) ?? 0;
    if (Date.now() - last < FAUCET_COOLDOWN_MS) {
      return res.status(429).json({ error: "Faucet cooldown — try again in a minute" });
    }
    try {
      const conn = new Connection(SOLANA_RPC, "confirmed");
      const authority = getFaucetKeypair();
      const mint = new PublicKey(STAKE_MINT_ADDR);
      const owner = new PublicKey(pubkey);
      const ata = await getOrCreateAssociatedTokenAccount(conn, authority, mint, owner);
      const sig = await mintTo(conn, authority, mint, ata.address, authority, FAUCET_AMOUNT);
      faucetLastClaim.set(pubkey, Date.now());
      res.json({ signature: sig, amount: FAUCET_AMOUNT, mint: STAKE_MINT_ADDR, ata: ata.address.toBase58() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: "Faucet failed", detail: msg });
    }
  });

  // -------------------------------------------------------------------------
  // TxLINE proxy endpoints (public read — no auth required)
  // -------------------------------------------------------------------------

  // GET /api/txline/fixtures -> /api/fixtures/snapshot
  app.get("/api/txline/fixtures", async (_req, res) => {
    try {
      const headers = await txlineHeaders();
      const upstream = await fetch(`${TXLINE_API_BASE}/api/fixtures/snapshot`, { headers });
      const body = await upstream.json();
      if (!upstream.ok) {
        return res.status(upstream.status).json(body);
      }
      res.json(body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: "Upstream fetch failed", detail: msg });
    }
  });

  // GET /api/txline/odds/:fixtureId -> /api/odds/snapshot/:fixtureId
  app.get("/api/txline/odds/:fixtureId", async (req, res) => {
    try {
      const { fixtureId } = req.params;
      const headers = await txlineHeaders();
      const upstream = await fetch(
        `${TXLINE_API_BASE}/api/odds/snapshot/${fixtureId}`,
        { headers }
      );
      const body = await upstream.json();
      if (!upstream.ok) {
        return res.status(upstream.status).json(body);
      }
      res.json(body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: "Upstream fetch failed", detail: msg });
    }
  });

  // GET /api/txline/scores/:fixtureId -> /api/scores/historical/:fixtureId
  // Returns the full sequence of score updates for a single fixture.
  // Used by the frontend to find the final score event (last entry) and its seq.
  app.get("/api/txline/scores/:fixtureId", async (req, res) => {
    try {
      const { fixtureId } = req.params;
      const headers = await txlineHeaders();
      const upstream = await fetch(
        `${TXLINE_API_BASE}/api/scores/historical/${fixtureId}`,
        { headers }
      );
      const body = await upstream.json();
      if (!upstream.ok) {
        return res.status(upstream.status).json(body);
      }
      res.json(body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: "Upstream fetch failed", detail: msg });
    }
  });

  // GET /api/txline/stat-validation -> /api/scores/stat-validation
  // Used by the frontend to build the on-chain `resolve` transaction.
  // Query params forwarded: fixtureId, seq, statKey, statKey2
  app.get("/api/txline/stat-validation", async (req, res) => {
    try {
      const { fixtureId, seq, statKey, statKey2 } = req.query as Record<string, string | undefined>;
      const params = new URLSearchParams();
      if (fixtureId) params.set("fixtureId", fixtureId);
      if (seq) params.set("seq", seq);
      if (statKey) params.set("statKey", statKey);
      if (statKey2) params.set("statKey2", statKey2);

      const headers = await txlineHeaders();
      const upstream = await fetch(
        `${TXLINE_API_BASE}/api/scores/stat-validation?${params.toString()}`,
        { headers }
      );
      const body = await upstream.json();
      if (!upstream.ok) {
        return res.status(upstream.status).json(body);
      }
      res.json(body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: "Upstream fetch failed", detail: msg });
    }
  });

  // -------------------------------------------------------------------------
  // TxLINE SSE passthrough streams
  // Upstream paths confirmed from streaming.md:
  //   /api/odds/stream   (odds updates)
  //   /api/scores/stream (score updates)
  // -------------------------------------------------------------------------

  async function ssePassthrough(upstreamPath: string, req: Request, res: Response) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let controller: AbortController | null = new AbortController();
    req.on("close", () => {
      controller?.abort();
      controller = null;
    });

    try {
      const headers = await txlineHeaders();
      const upstream = await fetch(`${TXLINE_API_BASE}${upstreamPath}`, {
        headers: {
          ...headers,
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
        signal: controller.signal,
      });

      if (!upstream.ok || !upstream.body) {
        res.write(`event: error\ndata: ${JSON.stringify({ status: upstream.status })}\n\n`);
        res.end();
        return;
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
        // Flush if supported
        if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
          (res as unknown as { flush: () => void }).flush();
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const msg = err instanceof Error ? err.message : String(err);
        res.write(`event: error\ndata: ${JSON.stringify({ detail: msg })}\n\n`);
      }
    } finally {
      res.end();
    }
  }

  app.get("/api/txline/stream/scores", (req, res) => {
    ssePassthrough("/api/scores/stream", req, res).catch(() => res.end());
  });

  app.get("/api/txline/stream/odds", (req, res) => {
    ssePassthrough("/api/odds/stream", req, res).catch(() => res.end());
  });

  // -------------------------------------------------------------------------
  // Vite dev middleware / static serving (keep at bottom)
  // -------------------------------------------------------------------------

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SnapTap server running on http://localhost:${PORT}`);
    console.log(`TxLINE API base: ${TXLINE_API_BASE}`);
    console.log(`Program: Fg8kWSCZPGjvFWzxEx4J7u5kxKFGBf3oT2akJfri4Yae`);
  });
}

startServer();
