/**
 * SnapTap on-chain settlement client layer.
 * Wraps Anchor Program for devnet pari-mutuel prediction markets.
 */

import {
  PublicKey,
  Connection,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  AnchorProvider,
  Program,
  BN,
  Idl,
  type IdlTypes,
} from '@coral-xyz/anchor';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import type { AnchorWallet } from '@solana/wallet-adapter-react';

import IDL_JSON from '../idl/snaptap_settlement.json';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PROGRAM_ID = new PublicKey('Fg8kWSCZPGjvFWzxEx4J7u5kxKFGBf3oT2akJfri4Yae');

export const TXLINE_PROGRAM_ID = new PublicKey(
  '6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J'
);

export const DEVNET_RPC =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/rpc`
    : 'https://api.devnet.solana.com';

// Demo-USDC SPL mint (devnet, 6 decimals). Public address, safe to hardcode as
// the default; can still be overridden via VITE_STAKE_MINT.
// IMPORTANT: use the STATIC `import.meta.env.VITE_*` form. Vite only inlines
// that exact token at build time; dynamic access (import.meta.env[key] or via a
// variable) is NOT replaced and is `undefined` in production builds -> crash.
const DEFAULT_STAKE_MINT = 'EmoE5KS1riKrxMwap5sUAcPfw4x9SLwTj6k2Yq5B9WR';
export const STAKE_MINT = new PublicKey(
  import.meta.env.VITE_STAKE_MINT || DEFAULT_STAKE_MINT
);
export const STAKE_DECIMALS = 6;

// Market kind byte for MatchResult1x2 (first variant = 0)
const MARKET_KIND_BYTE_1X2 = 0;

// ---------------------------------------------------------------------------
// Idl typing — cast to Idl to keep Anchor happy without generating ts types
// ---------------------------------------------------------------------------

const IDL = IDL_JSON as Idl;

// ---------------------------------------------------------------------------
// Program factory
// ---------------------------------------------------------------------------

/**
 * Build an Anchor Program bound to the caller's wallet.
 * programId is read from idl.address (Anchor 0.32).
 */
export function getProgram(
  connection: Connection,
  wallet: AnchorWallet
): Program {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  // Anchor 0.32: new Program(idl, provider) — programId comes from idl.address
  return new Program(IDL, provider);
}

// ---------------------------------------------------------------------------
// PDA helpers
// ---------------------------------------------------------------------------

/** Market PDA: seeds = ["market", i64LE(fixtureId), u8(marketKindByte)] */
export function marketPda(fixtureId: number | BN): PublicKey {
  const id = BN.isBN(fixtureId) ? fixtureId : new BN(fixtureId);
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('market'),
      id.toArrayLike(Buffer, 'le', 8),
      Buffer.from([MARKET_KIND_BYTE_1X2]),
    ],
    PROGRAM_ID
  );
  return pda;
}

/** Position PDA: seeds = ["position", market, owner, u8(outcome)] */
export function positionPda(
  market: PublicKey,
  owner: PublicKey,
  outcome: number // 0=home, 1=draw, 2=away
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('position'),
      market.toBuffer(),
      owner.toBuffer(),
      Buffer.from([outcome]),
    ],
    PROGRAM_ID
  );
  return pda;
}

/**
 * Vault = associated token account of (market PDA, mint).
 * Uses SPL ATA derivation (allowOwnerOffCurve = true is handled by getAssociatedTokenAddress).
 */
export async function vaultAta(
  market: PublicKey,
  mint: PublicKey = STAKE_MINT
): Promise<PublicKey> {
  return getAssociatedTokenAddress(
    mint,
    market,
    true // allowOwnerOffCurve — market PDA is off-curve
  );
}

/**
 * TxLINE daily_scores_roots PDA.
 * seeds = ["daily_scores_roots", u16LE(epochDay)] on TXLINE_PROGRAM_ID.
 *
 * // VERIFY at runtime: epochDay is derived from ts in MILLISECONDS.
 * Pass validation.ts (the ms timestamp from the stat-validation API response).
 */
export function dailyScoresRootsPda(tsMs: number | BN): PublicKey {
  const ms = BN.isBN(tsMs) ? tsMs.toNumber() : tsMs;
  const epochDay = Math.floor(ms / 86_400_000); // VERIFY: ts is milliseconds
  const dayBuf = Buffer.alloc(2);
  dayBuf.writeUInt16LE(epochDay, 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('daily_scores_roots'), dayBuf],
    TXLINE_PROGRAM_ID
  );
  return pda;
}

// ---------------------------------------------------------------------------
// Account fetchers
// ---------------------------------------------------------------------------

export async function fetchMarket(
  program: Program,
  fixtureId: number | BN
): Promise<Record<string, unknown>> {
  const pda = marketPda(fixtureId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program.account as any)['market'].fetch(pda) as Promise<Record<string, unknown>>;
}

export async function fetchAllMarkets(
  program: Program
): Promise<Array<{ publicKey: PublicKey; account: Record<string, unknown> }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program.account as any)['market'].all() as Promise<
    Array<{ publicKey: PublicKey; account: Record<string, unknown> }>
  >;
}

export async function fetchPosition(
  program: Program,
  market: PublicKey,
  owner: PublicKey,
  outcome: number
): Promise<Record<string, unknown>> {
  const pda = positionPda(market, owner, outcome);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program.account as any)['position'].fetch(pda) as Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Validation response types (from /api/txline/stat-validation, §5)
// ---------------------------------------------------------------------------

export interface ApiScoreStat {
  key: number;
  value: number;
  period: number;
}

export interface ApiProofNode {
  hash: string; // base64 or hex
  isRightSibling?: boolean;
  is_right_sibling?: boolean; // some API responses use snake_case
}

export interface ApiUpdateStats {
  updateCount?: number;
  update_count?: number; // VERIFY field name casing
  minTimestamp?: number;
  min_timestamp?: number;
  maxTimestamp?: number;
  max_timestamp?: number;
}

export interface ApiSummary {
  fixtureId: number;
  updateStats: ApiUpdateStats;
  eventStatsSubTreeRoot: string; // maps to events_sub_tree_root on-chain
}

export interface StatValidationResponse {
  ts: number; // milliseconds — VERIFY
  statToProve: ApiScoreStat;
  eventStatRoot: string; // base64 or hex [u8;32]
  summary: ApiSummary;
  statProof: ApiProofNode[];
  subTreeProof: ApiProofNode[];
  mainTreeProof: ApiProofNode[];
  // optional second stat (for two-key predicates)
  statToProve2?: ApiScoreStat;
  statProof2?: ApiProofNode[];
}

// ---------------------------------------------------------------------------
// Hash / proof helpers
// ---------------------------------------------------------------------------

/**
 * Decode a base64 OR hex string to a Uint8Array(32).
 * Handles both encodings that the TxLINE API may return.
 */
export function toBytes32(s: string): number[] {
  let bytes: Uint8Array;
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    // hex
    const arr = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      arr[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    }
    bytes = arr;
  } else {
    // assume base64
    const bin = atob(s);
    if (bin.length !== 32) {
      throw new Error(
        `toBytes32: expected 32 bytes after base64 decode, got ${bin.length} from "${s.slice(0, 20)}..."`
      );
    }
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  }
  return Array.from(bytes);
}

/**
 * Map API ProofNode[] to the on-chain ProofNode format.
 * Handles both camelCase and snake_case field names from the API.
 * // VERIFY: which casing the live API actually returns for is_right_sibling
 */
export function toProofNodes(
  arr: ApiProofNode[]
): Array<{ hash: number[]; isRightSibling: boolean }> {
  return arr.map((node) => ({
    hash: toBytes32(node.hash),
    // VERIFY: API may return camelCase or snake_case
    isRightSibling: node.isRightSibling ?? node.is_right_sibling ?? false,
  }));
}

// Outcome index constants
export const OUTCOME_HOME = 0;
export const OUTCOME_DRAW = 1;
export const OUTCOME_AWAY = 2;

// ---------------------------------------------------------------------------
// Transaction functions
// ---------------------------------------------------------------------------

/** Initialize a new market for a fixture. Returns transaction signature. */
export async function initializeMarket(
  program: Program,
  params: {
    fixtureId: number | BN;
    closeTs: number | BN;
    stakeMint: PublicKey;
  }
): Promise<string> {
  const { fixtureId, closeTs, stakeMint } = params;
  const id = BN.isBN(fixtureId) ? fixtureId : new BN(fixtureId);
  const ts = BN.isBN(closeTs) ? closeTs : new BN(closeTs);

  const market = marketPda(id);
  const vault = await vaultAta(market, stakeMint);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program.methods as any)
    .initializeMarket(id, { matchResult1x2: {} }, ts)
    .accounts({
      market,
      stakeMint,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/**
 * Deposit stake on an outcome. Creates the user ATA if missing.
 * Returns transaction signature.
 */
export async function deposit(
  program: Program,
  params: {
    fixtureId: number | BN;
    outcome: number; // 0=home,1=draw,2=away
    amount: number | BN; // base units
  }
): Promise<string> {
  const { fixtureId, outcome, amount } = params;
  const id = BN.isBN(fixtureId) ? fixtureId : new BN(fixtureId);
  const amt = BN.isBN(amount) ? amount : new BN(amount);

  const provider = program.provider as AnchorProvider;
  const owner = provider.wallet.publicKey;

  const market = marketPda(id);

  // Fetch stake_mint from on-chain market account
  const marketData = await fetchMarket(program, id);
  const stakeMint = marketData['stakeMint'] as PublicKey;

  const vault = await vaultAta(market, stakeMint);
  const position = positionPda(market, owner, outcome);
  const userToken = await getAssociatedTokenAddress(stakeMint, owner, false);

  // Prepend ATA creation if it doesn't exist
  const preInstructions: TransactionInstruction[] = [];
  const conn = provider.connection;
  const ataInfo = await conn.getAccountInfo(userToken);
  if (!ataInfo) {
    preInstructions.push(
      createAssociatedTokenAccountInstruction(
        owner,
        userToken,
        owner,
        stakeMint
      )
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program.methods as any)
    .deposit(outcome, amt)
    .accounts({
      owner,
      market,
      position,
      vault,
      userToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions(preInstructions)
    .rpc();
}

/** Claim winning position. Returns transaction signature. */
export async function claim(
  program: Program,
  params: {
    fixtureId: number | BN;
    outcome: number;
  }
): Promise<string> {
  const { fixtureId, outcome } = params;
  const id = BN.isBN(fixtureId) ? fixtureId : new BN(fixtureId);

  const provider = program.provider as AnchorProvider;
  const owner = provider.wallet.publicKey;

  const market = marketPda(id);
  const marketData = await fetchMarket(program, id);
  const stakeMint = marketData['stakeMint'] as PublicKey;

  const vault = await vaultAta(market, stakeMint);
  const position = positionPda(market, owner, outcome);
  const userToken = await getAssociatedTokenAddress(stakeMint, owner, false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program.methods as any)
    .claim()
    .accounts({
      owner,
      market,
      position,
      vault,
      userToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/** Refund from voided market. Returns transaction signature. */
export async function refund(
  program: Program,
  params: {
    fixtureId: number | BN;
    outcome: number;
  }
): Promise<string> {
  const { fixtureId, outcome } = params;
  const id = BN.isBN(fixtureId) ? fixtureId : new BN(fixtureId);

  const provider = program.provider as AnchorProvider;
  const owner = provider.wallet.publicKey;

  const market = marketPda(id);
  const marketData = await fetchMarket(program, id);
  const stakeMint = marketData['stakeMint'] as PublicKey;

  const vault = await vaultAta(market, stakeMint);
  const position = positionPda(market, owner, outcome);
  const userToken = await getAssociatedTokenAddress(stakeMint, owner, false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program.methods as any)
    .refund()
    .accounts({
      owner,
      market,
      position,
      vault,
      userToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/** Permissionlessly void a market that could not be resolved. Returns signature. */
export async function voidMarket(
  program: Program,
  params: { fixtureId: number | BN }
): Promise<string> {
  const id = BN.isBN(params.fixtureId) ? params.fixtureId : new BN(params.fixtureId);
  const provider = program.provider as AnchorProvider;
  const market = marketPda(id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program.methods as any)
    .voidMarket()
    .accounts({
      caller: provider.wallet.publicKey,
      market,
    })
    .rpc();
}

/**
 * Resolve market via CPI into TxLINE validate_stat.
 *
 * `validation` is the raw JSON from GET /api/txline/stat-validation (§5).
 * `claimedOutcome` is 0 (home) | 1 (draw) | 2 (away).
 *
 * Mapping for 1X2 (§7):
 *   stat_a = home goals (key 1), stat_b = away goals (key 2)
 *   op = BinaryExpression::Subtract (home - away)
 *   predicate: threshold=0, comparison depends on claimed outcome:
 *     0 home  -> GreaterThan
 *     1 draw  -> EqualTo
 *     2 away  -> LessThan
 *
 * Prepends ComputeBudget setComputeUnitLimit(1_400_000) per §3.5.
 */
export async function resolve(
  program: Program,
  params: {
    fixtureId: number | BN;
    claimedOutcome: number; // 0=home,1=draw,2=away
    validation: StatValidationResponse;
  }
): Promise<string> {
  const { fixtureId, claimedOutcome, validation } = params;
  const id = BN.isBN(fixtureId) ? fixtureId : new BN(fixtureId);
  const provider = program.provider as AnchorProvider;

  const market = marketPda(id);

  // daily_scores_roots PDA on TxLINE — uses validation.ts (milliseconds)
  // VERIFY at runtime: print epochDay = Math.floor(validation.ts / 86_400_000) and confirm PDA matches on-chain
  const dailyScoresMerkleRoots = dailyScoresRootsPda(validation.ts);

  // stat_a: home goals (key from validation.statToProve — should be key 1 for full-game home goals)
  // VERIFY: validation.statToProve.key === 1 for home goals; key 2 for away
  const statA = {
    statToProve: {
      key: validation.statToProve.key,
      value: validation.statToProve.value,
      period: validation.statToProve.period,
    },
    eventStatRoot: toBytes32(validation.eventStatRoot),
    statProof: toProofNodes(validation.statProof),
  };

  // stat_b: away goals from optional second stat, if provided
  // VERIFY: API provides statToProve2 + statProof2 when statKey2 is requested
  let statB: typeof statA | null = null;
  if (validation.statToProve2 && validation.statProof2) {
    // eventStatRoot for stat_b is not separately specified in the API schema (§5)
    // VERIFY: whether stat_b needs its own eventStatRoot or reuses the same one
    statB = {
      statToProve: {
        key: validation.statToProve2.key,
        value: validation.statToProve2.value,
        period: validation.statToProve2.period,
      },
      eventStatRoot: toBytes32(validation.eventStatRoot), // VERIFY: may need separate root for stat2
      statProof: toProofNodes(validation.statProof2),
    };
  }

  // op = BinaryExpression::Subtract (home_goals - away_goals) for 1X2
  const op = { subtract: {} }; // Anchor enum variant

  // Predicate: threshold=0, comparison determined by claimed outcome
  let comparison: Record<string, Record<string, never>>;
  if (claimedOutcome === OUTCOME_HOME) {
    comparison = { greaterThan: {} };
  } else if (claimedOutcome === OUTCOME_DRAW) {
    comparison = { equalTo: {} };
  } else if (claimedOutcome === OUTCOME_AWAY) {
    comparison = { lessThan: {} };
  } else {
    throw new Error(`Invalid claimedOutcome: ${claimedOutcome}. Must be 0, 1, or 2.`);
  }
  const predicate = { threshold: 0, comparison };

  // fixtureSummary from validation.summary
  // VERIFY: API field eventStatsSubTreeRoot maps to on-chain events_sub_tree_root
  const updateStats = validation.summary.updateStats;
  const fixtureSummary = {
    fixtureId: new BN(validation.summary.fixtureId),
    updateStats: {
      // VERIFY: API may use camelCase or snake_case field names
      updateCount: updateStats.updateCount ?? updateStats.update_count ?? 0,
      minTimestamp: new BN(updateStats.minTimestamp ?? updateStats.min_timestamp ?? 0),
      maxTimestamp: new BN(updateStats.maxTimestamp ?? updateStats.max_timestamp ?? 0),
    },
    eventsSubTreeRoot: toBytes32(validation.summary.eventStatsSubTreeRoot),
  };

  const fixtureProof = toProofNodes(validation.subTreeProof);
  const mainTreeProof = toProofNodes(validation.mainTreeProof);

  // ts as BN (milliseconds — VERIFY)
  const ts = new BN(validation.ts);

  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program.methods as any)
    .resolve(
      ts,
      fixtureSummary,
      fixtureProof,
      mainTreeProof,
      claimedOutcome,
      statA,
      statB,  // Option<StatTerm> — null becomes None in Anchor
      op      // Option<BinaryExpression>
    )
    .accounts({
      resolver: provider.wallet.publicKey,
      market,
      dailyScoresMerkleRoots,
      txlineProgram: TXLINE_PROGRAM_ID,
    })
    .preInstructions([computeBudgetIx])
    .rpc();
}
