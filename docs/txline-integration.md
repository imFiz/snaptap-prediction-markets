# TxLINE Integration Engineering Spec

## 1. Program Addresses

| Network | Program ID | USDT Mint | TxL Mint |
|---------|-----------|-----------|---------|
| Devnet  | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` | `ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh` | `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG` |
| Mainnet | `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA` | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | `Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL` |

## 2. Demo-USDC Approach

SnapTap uses a **self-created SPL Token mint** (classic token program, NOT Token-2022) as the stake currency rather than the TxLINE devnet USDT. This sidesteps:
- TxLINE faucet rate limits and co-signing requirements
- Token-2022 complexity in the settlement program

Deployment steps:
1. `spl-token create-token --decimals 6` -- saves mint address, update `Anchor.toml [test.validator]`
2. `spl-token mint <MINT> <AMOUNT> <USER_ATA>` for test funding
3. Pass that mint to `initialize_market`

The SnapTap program enforces NO specific mint -- any SPL token works. Change to real USDT later by just swapping the mint address passed to `initialize_market`.

## 3. validateStat CPI

### 3.1 Instruction discriminator

```
[107, 197, 232, 90, 191, 136, 105, 185]
```

Source: IDL `validate_stat.discriminator` (confirmed from devnet.md IDL).

### 3.2 Accounts

Only ONE account required:

| Index | Name | Access |
|-------|------|--------|
| 0     | `daily_scores_merkle_roots` | read-only |

This is a PDA owned by the TxLINE program (see section 4 for derivation).

### 3.3 Arguments (exact order, Borsh-encoded)

| Order | Name | Type |
|-------|------|------|
| 1 | `ts` | `i64` |
| 2 | `fixture_summary` | `ScoresBatchSummary` |
| 3 | `fixture_proof` | `Vec<ProofNode>` |
| 4 | `main_tree_proof` | `Vec<ProofNode>` |
| 5 | `predicate` | `TraderPredicate` |
| 6 | `stat_a` | `StatTerm` |
| 7 | `stat_b` | `Option<StatTerm>` |
| 8 | `op` | `Option<BinaryExpression>` |

### 3.4 Reading the bool return

After invoking via `invoke()` or `invoke_signed()`:

```rust
use anchor_lang::solana_program::program::get_return_data;

if let Some((program_id, data)) = get_return_data() {
    assert_eq!(program_id, TXLINE_PROGRAM_ID);
    let result = data[0] != 0; // bool is 1 byte in Borsh
    require!(result, SnapTapError::ValidationFailed);
}
```

IMPORTANT: `get_return_data()` only works immediately after the CPI returns, before any other CPI is made.

### 3.5 ComputeBudget requirement

The caller MUST include a `SetComputeUnitLimit` instruction. Recommended: 1,400,000 CU. The Merkle proof verification is compute-heavy.

```typescript
const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
// prepend to the resolve transaction
```

## 4. daily_scores_roots PDA Derivation

Seeds (confirmed from addresses.md + onchain-validation.md):

```typescript
const epochDay = Math.floor(ts_millis / (24 * 60 * 60 * 1000)); // milliseconds!
const [pda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("daily_scores_roots"),
    new BN(epochDay).toArrayLike(Buffer, "le", 2)  // u16, little-endian
  ],
  TXLINE_PROGRAM_ID
);
```

In Rust (called from SnapTap's resolve instruction):

```rust
// epoch_day = ts_milliseconds / 86_400_000  (NOT unix seconds / 86400)
// UNVERIFIED: The onchain-validation.md example uses:
//   Math.floor(targetTs / (24 * 60 * 60 * 1000))
// where targetTs = validation.summary.updateStats.minTimestamp
// This suggests minTimestamp is in MILLISECONDS, not Unix seconds.
// MUST VERIFY at runtime: print epoch_day and compare to expected PDA.
let epoch_day: u16 = (ts_ms / 86_400_000) as u16;
let seeds = &[b"daily_scores_roots", &epoch_day.to_le_bytes()];
```

**UNVERIFIED:** Whether `ts` passed to `validateStat` is in milliseconds or seconds. The TypeScript sample uses milliseconds. Anchor `Clock::get()?.unix_timestamp` returns seconds. The `ts` arg may need to be the raw millisecond timestamp from the API response (stored off-chain and passed in by the resolver).

## 5. /api/scores/stat-validation Endpoint

**Base URL (devnet):** `https://txline-dev.txodds.com/api/`

**Auth:** `Authorization: Bearer <jwt>` + `X-Api-Token: <api_token>`

**Request:**
```
GET /api/scores/stat-validation
  ?fixtureId=<i32>
  &seq=<i32>         -- sequence number of the score event
  &statKey=<i32>     -- primary stat key (e.g. 1 for home goals full game)
  &statKey2=<i32>    -- optional second stat key (for two-stat predicates)
```

**Response schema `ScoresStatValidation`:**

```typescript
{
  ts: number,                     // timestamp (likely milliseconds)
  statToProve: ScoreStat,         // { key: u32, value: i32, period: i32 }
  eventStatRoot: string,          // base64 or hex [u8;32]
  summary: ScoresBatchSummary,    // { fixtureId, updateStats, eventStatsSubTreeRoot }
  statProof: ProofNode[],         // inner proof: stat -> event root
  subTreeProof: ProofNode[],      // mid proof: event -> fixture sub-tree root
  mainTreeProof: ProofNode[],     // outer proof: fixture -> main on-chain root
  // Optional (only if statKey2 provided):
  statToProve2?: ScoreStat,
  statProof2?: ProofNode[]
}
```

Note: the API field is `eventStatsSubTreeRoot` (camelCase) which maps to on-chain `events_sub_tree_root` in `ScoresBatchSummary`.

**Mapping to validateStat args:**

```typescript
const stat1: StatTerm = {
  statToProve: validation.statToProve,         // ScoreStat { key, value, period }
  eventStatRoot: toBytes32(validation.eventStatRoot),
  statProof: toProofNodes(validation.statProof),
};
const fixtureSummary: ScoresBatchSummary = {
  fixtureId: new BN(validation.summary.fixtureId),
  updateStats: { ... },
  eventsSubTreeRoot: toBytes32(validation.summary.eventStatsSubTreeRoot),
};
// fixtureProof = validation.subTreeProof
// mainTreeProof = validation.mainTreeProof
```

## 6. Soccer StatKey Table

From soccer-feed.md (confirmed):

**Formula:** `statKey = (period_multiplier * 1000) + base_key`

**Base keys:**

| Key | Statistic |
|-----|-----------|
| 1   | Participant 1 (home) Total Goals |
| 2   | Participant 2 (away) Total Goals |
| 3   | Participant 1 Yellow Cards |
| 4   | Participant 2 Yellow Cards |
| 5   | Participant 1 Red Cards |
| 6   | Participant 2 Red Cards |
| 7   | Participant 1 Corners |
| 8   | Participant 2 Corners |

**Period multipliers:**

| Multiplier | Period |
|-----------|--------|
| 0         | Full game (no prefix) |
| 1000      | First Half (H1) |
| 2000      | Second Half (H2) |
| 3000      | Extra Time 1 |
| 4000      | Extra Time 2 |
| 5000      | Penalty Shootout |

**Examples:**
- Key 1 = Home team total goals (full game)
- Key 2 = Away team total goals (full game)
- Key 1001 = Home team H1 goals
- Key 1002 = Away team H1 goals (from onchain-validation.md example -- `statKey: 1002`)
- Key 1003 = UNVERIFIED, likely another H1 stat; the two-stat example uses 1002+1003

**Home vs Away:** Participant 1 = home (key 1), Participant 2 = away (key 2). Period is encoded in `ScoreStat.period` field as the game phase ID (H1=2, H2=4, F=5, etc. -- from soccer-feed.md game phase table), NOT the multiplier.

**UNVERIFIED:** Whether `participant1_is_home` is always true or can flip. Assumes standard convention that key 1 = home.

## 7. 1X2 Market Mapping to validateStat

For a 1X2 (Match Result) market with full-game goals:
- stat_a = home team goals: `statKey=1`, `statToProve.key=1`
- stat_b = away team goals: `statKey=2`, `statToProve.key=2`
- op = `BinaryExpression::Subtract` (stat_a - stat_b)

| Outcome | Comparison | Threshold | Meaning |
|---------|-----------|-----------|---------|
| Home Win (0) | `GreaterThan` | 0 | home_goals - away_goals > 0 |
| Away Win (2) | `LessThan` | 0 | home_goals - away_goals < 0 |
| Draw (1) | `EqualTo` | 0 | home_goals - away_goals == 0 |

**TraderPredicate construction:**

```rust
// Home win
TraderPredicate { threshold: 0, comparison: Comparison::GreaterThan }
// Away win
TraderPredicate { threshold: 0, comparison: Comparison::LessThan }
// Draw
TraderPredicate { threshold: 0, comparison: Comparison::EqualTo }
```

The SnapTap `resolve` instruction enforces this mapping on-chain: the caller cannot supply a predicate that contradicts the claimed outcome.

## 8. Type Definitions (from IDL)

### TraderPredicate
```rust
pub struct TraderPredicate {
    pub threshold: i32,
    pub comparison: Comparison,
}
pub enum Comparison { GreaterThan, LessThan, EqualTo }
```

### StatTerm
```rust
pub struct StatTerm {
    pub stat_to_prove: ScoreStat,
    pub event_stat_root: [u8; 32],
    pub stat_proof: Vec<ProofNode>,
}
pub struct ScoreStat { pub key: u32, pub value: i32, pub period: i32 }
```

### BinaryExpression
```rust
pub enum BinaryExpression { Add, Subtract }
```

### ScoresBatchSummary
```rust
pub struct ScoresBatchSummary {
    pub fixture_id: i64,
    pub update_stats: ScoresUpdateStats,
    pub events_sub_tree_root: [u8; 32],
}
pub struct ScoresUpdateStats {
    pub update_count: i32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}
```

### ProofNode
```rust
pub struct ProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}
```

## 9. Items Marked UNVERIFIED

1. **Epoch day unit:** Whether `ts` in validateStat args is milliseconds or seconds (the TypeScript sample divides by 86_400_000 suggesting ms, but Solana `unix_timestamp` is seconds). Must be confirmed by successfully resolving one market on devnet.

2. **participant1_is_home assumption:** Assumed always true for conventional soccer feeds. Verify per fixture from the Fixture account or API.

3. **statKey for home/away in two-stat setup:** The two-stat example in onchain-validation.md uses `statKey=1002` and `statKey2=1003`. Keys 1001/1002 are H1 goals. Full game keys 1/2 should work for final settlement -- verify via API response.

4. **get_return_data on-chain behavior:** Tested only via `.view()` simulation in TypeScript. Must verify that calling `get_return_data()` immediately after CPI in an on-chain instruction returns the correct data (no intermediate CPIs allowed between the validateStat CPI and reading return data).

5. **Anchor/Solana version compatibility:** The manual CPI approach (building instruction data by hand + borsh-encoding) is version-agnostic, but the `anchor_lang::solana_program::program::get_return_data` import path must match the Anchor version used at build time (0.30.x confirmed to have this API).

6. **daily_scores_roots account ownership check:** The SnapTap resolve instruction passes this account as an unchecked AccountInfo. Recommend adding an owner check (`account.owner == TXLINE_PROGRAM_ID`) at runtime if the TxLINE program does not revert on bad input.
