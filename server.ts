import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

const JUPITER_REFERRAL_ACCOUNT = 'AJdZhryzpDMmnSM7ymLVSJuBP1ARYfoiq1YMPXtsVj63';
const JUPITER_PREDICTION_API = 'https://api.jup.ag/prediction/v1'; // Target API

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // 1. Workflow: Betting & Referral Injection (Input) - API Data Fetching
  app.get("/api/markets", async (req, res) => {
    try {
      // Attempt to fetch from Jupiter Prediction Markets API
      // Performance: In a real Next.js/Vercel app, this would be cached via fetch options
      const response = await fetch(`${JUPITER_PREDICTION_API}/markets`);
      
      if (response.ok) {
        const data = await response.json();
        // Normalize response to Snaptap format
        const normalized = data.map((m: any) => ({
          id: m.id,
          provider: 'Jupiter',
          title: m.question,
          category: m.category || 'Crypto',
          poolSize: m.volume || 0,
          closingTime: m.endTime,
          yesProbability: m.odds?.yes || 0.5,
          noProbability: m.odds?.no || 0.5,
          resolved: m.status === 'resolved'
        }));
        return res.json(normalized);
      }
    } catch (error) {
      console.warn('Jupiter Prediction API unreachable, using cached/fallback markets.');
    }

    // Fallback data in case the Jupiter Prediction API is unreachable
    res.json([
      {
        id: 'jup-sol-eth-2026',
        provider: 'Jupiter',
        title: 'Solana to surpass Ethereum in daily active users by end of 2026?',
        category: 'Crypto',
        poolSize: 3400000,
        closingTime: '2026-12-31T23:59:59Z',
        yesProbability: 0.55,
        noProbability: 0.45,
      },
      {
        id: 'jup-doge-1',
        provider: 'Jupiter',
        title: 'Dogecoin to reach $1 in 2026?',
        category: 'Crypto',
        poolSize: 5600000,
        closingTime: '2026-12-31T23:59:59Z',
        yesProbability: 0.15,
        noProbability: 0.85,
      },
      {
        id: 'jup-spacex-mars',
        provider: 'Jupiter',
        title: 'SpaceX to land uncrewed Starship on Mars in 2026?',
        category: 'World',
        poolSize: 1450000,
        closingTime: '2026-12-31T23:59:59Z',
        yesProbability: 0.35,
        noProbability: 0.65,
      },
      {
        id: 'jup-apple-ar',
        provider: 'Jupiter',
        title: 'Apple to announce AR Glasses in WWDC 2026?',
        category: 'Tech',
        poolSize: 850000,
        closingTime: '2026-06-15T23:59:59Z',
        yesProbability: 0.42,
        noProbability: 0.58,
      }
    ]);
  });

  // 1. Workflow: Transaction Construction & Referral Injection
  app.post("/api/bet", async (req, res) => {
    const { marketId, outcome, amount, userPubkey } = req.body;

    if (!marketId || !outcome || !amount || !userPubkey) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    console.log(`[Backend] Constructing bet for ${marketId} - Outcome: ${outcome}`);
    console.log(`[Backend] Injecting Referral Key: ${JUPITER_REFERRAL_ACCOUNT}`);

    try {
      // In a real implementation, we call the Jupiter endpoint to build the transaction
      // POST https://api.jup.ag/prediction/v1/bet
      /*
      const response = await fetch(`${JUPITER_PREDICTION_API}/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId,
          outcome,
          amount,
          userPubkey,
          feeAccount: JUPITER_REFERRAL_ACCOUNT // <-- Referral Injection
        })
      });
      const { swapTransaction } = await response.json();
      return res.json({ base64Tx: swapTransaction });
      */

      // SIMULATION OF THE BACKEND RESPONSE (Base64 Transaction)
      // We simulate the backend returning a serialized transaction ready for Seed Vault
      const mockBase64Tx = Buffer.from(`mock_serialized_transaction_data_with_referral_${JUPITER_REFERRAL_ACCOUNT}`).toString('base64');
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      res.json({ base64Tx: mockBase64Tx });
    } catch (error) {
      console.error('Failed to build transaction:', error);
      res.status(500).json({ error: 'Transaction construction failed' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
