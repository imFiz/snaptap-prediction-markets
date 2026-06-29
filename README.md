# SnapTap — Trustless World Cup Prediction Markets on Solana

SnapTap turns the FIFA World Cup into a set of **decentralized, pari-mutuel
prediction markets** whose outcomes are settled **trustlessly on-chain** using
the **TxLINE** data layer. There is no oracle to trust and no house: users stake
USDC into the pool of the outcome they predict, and after the match a settlement
instruction CPIs into TxLINE's `validate_stat` program to confirm the result
against TxLINE's cryptographic Merkle root published on Solana. Winners then
claim a pro-rata share of the pot.

> Built for the **TxODDS "Prediction Markets and Settlement"** World Cup track.

---

## Why this fits the track

| Track ask | SnapTap |
|-----------|---------|
| Use TxLINE as the **primary data source** | Fixtures, odds and scores all come from TxLINE; settlement is driven by TxLINE Merkle proofs |
| **Custom on-chain settlement engine** that CPIs into `validate_stat` | `snaptap_settlement` Anchor program does exactly this |
| **Permissionless results validation** / smart-contract escrow | Pari-mutuel USDC escrow PDAs, anyone can resolve, trustlessly |
| **Verifiable resolution UI** (Merkle receipt) | Resolved markets display the on-chain proof root + resolve tx |
| Settle in coins **other than the TxL token** | Stake/settle in an SPL "demo USDC" |

---

## Architecture

```
┌────────────┐    fixtures / odds / scores (REST + SSE)   ┌──────────────────┐
│  Frontend  │ ◀───────────────────────────────────────── │ Backend (Express)│
│ React +    │    stat-validation proof (Merkle bundle)    │  TxLINE proxy +  │
│ wallet     │ ─────────────────────────────────────────▶ │  Solana sig auth │
└─────┬──────┘                                             └──────────────────┘
      │ deposit / resolve / claim  (signed txs)
      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  snaptap_settlement  (Anchor, Solana devnet)                              │
│   • Market / Position / Vault PDAs   • pari-mutuel pools                  │
│   • resolve()  ── CPI ──▶  TxLINE validate_stat  (returns bool)           │
└──────────────────────────────────────────────────────────────────────────┘
                                   │ reads
                                   ▼
                    TxLINE program  (daily_scores Merkle roots)
```

- **On-chain program** (`program/`): the settlement engine. See
  [`program/programs/snaptap_settlement/src/lib.rs`](program/programs/snaptap_settlement/src/lib.rs).
- **Backend** (`server.ts`): proxies TxLINE (keeps the API token server-side),
  exposes the `stat-validation` proof bundle, streams live data (SSE) and
  authenticates wallets via signature.
- **Frontend** (`src/`): market list, bet slip, activity/portfolio, the
  verifiable-resolution receipt, and a live Match Center (bonus, ESPN-enriched).

### Trustless resolution (the core idea)

`validate_stat` proves a *predicate* over a Merkle-anchored match statistic and
returns a boolean. SnapTap binds the **claimed outcome** to the **only predicate
that can be true** for it, so a resolver cannot lie:

| 1X2 outcome | predicate over `home_goals − away_goals` |
|-------------|------------------------------------------|
| Home win    | `> 0` (`Comparison::GreaterThan`, threshold 0) |
| Draw        | `== 0` (`EqualTo`) |
| Away win    | `< 0` (`LessThan`) |

These are mutually exclusive over real (proven) goal counts, so whichever
predicate validates `true` *is* the correct result. The program also pins the
stat keys (home goals = key 1, away goals = key 2) so a resolver can't swap
sides. Implementation: `resolve()` in `lib.rs`.

---

## TxLINE endpoints used

REST / streaming (devnet base `https://txline-dev.txodds.com/api/`):
- `POST /auth/guest/start` — guest JWT session
- `GET  /api/fixtures/snapshot` — World Cup fixtures
- `GET  /api/odds/snapshot/:fixtureId` — consensus 1X2 odds (implied probabilities)
- `GET  /api/scores/...` + **SSE scores stream** — live scores / events
- **SSE odds stream** — live odds movement
- `GET  /api/scores/stat-validation?fixtureId&seq&statKey[&statKey2]` — the
  three-stage Merkle proof bundle used to build the on-chain `resolve` tx

On-chain (TxLINE devnet program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`):
- `validate_stat` — CPI'd from `snaptap_settlement.resolve()` to confirm outcomes

Full integration notes: [`docs/txline-integration.md`](docs/txline-integration.md).

---

## On-chain program — instructions

| Instruction | What it does |
|-------------|--------------|
| `initialize_market` | Open a market for a fixture + kind (1X2), create the USDC vault |
| `deposit` | Stake USDC on an outcome; updates the pari-mutuel pool |
| `resolve` | CPI into TxLINE `validate_stat`; trustlessly set the winning outcome |
| `claim` | Winner withdraws pro-rata share of the whole pot |
| `void_market` / `refund` | Permissionless escape hatch if a market can't be resolved |

Program ID (devnet): _set after deploy_ · Stake mint (demo USDC, devnet): _set after deploy_

---

## Build, deploy & run

### On-chain program (devnet)
```bash
cd program
anchor keys sync          # writes the real program id into lib.rs + Anchor.toml
anchor build
anchor deploy --provider.cluster devnet
```

### App
```bash
npm install
cp .env.example .env      # set TxLINE token + program/mint ids
npm run dev               # Express + Vite on :4005
```

---

## TxLINE API feedback

**Liked most**
- A single normalised JSON schema across fixtures/odds/scores made ingestion
  trivial — one adapter shape scaled to the whole tournament.
- The on-chain Merkle primitives (`validate_stat`, daily score roots) are a
  genuinely novel building block: settling against a *verifiable* feed instead
  of a trusted oracle is exactly what on-chain prediction markets need.

**Friction**
- The exact unit of the `ts` argument to `validate_stat` (ms vs s) and the
  `daily_scores_roots` epoch-day derivation took trial-and-error to confirm.
- `validate_stat` is documented via `.view()` simulation; confirming the
  return-data read path works from an **on-chain CPI** required experimentation
  (compute budget + `get_return_data`).
- A worked end-to-end Rust CPI example (not just TS `.view()`) would have saved
  time.

---

## Disclaimer

Devnet demo for a hackathon. Not gambling with real funds; participants are
responsible for compliance with local law. Not affiliated with FIFA.
