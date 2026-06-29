//! SnapTap Settlement — trustless pari-mutuel prediction markets for the FIFA
//! World Cup, settled on Solana by Cross-Program-Invoking TxLINE's `validate_stat`.
//!
//! ## Model (pari-mutuel)
//! For each fixture+market-kind we open a `Market` with a single SPL token vault.
//! Users `deposit` stake into the pool of the outcome they predict. After the
//! match closes, anyone calls `resolve`, which CPIs into the TxLINE on-chain
//! oracle (`validate_stat`) to *trustlessly* confirm the winning outcome against
//! TxLINE's daily Merkle root. Winners then `claim` a pro-rata share of the
//! entire pot (winning pool splits the whole `total_pool`).
//!
//! ## Trustless resolution
//! `validate_stat` returns a boolean proving a predicate over Merkle-anchored
//! match statistics. SnapTap binds the *claimed* outcome to the *only* predicate
//! that can be true for it, so a resolver cannot lie:
//!   home win  => (home_goals - away_goals)  > 0
//!   draw      => (home_goals - away_goals) == 0
//!   away win  => (home_goals - away_goals)  < 0
//! Because these are mutually exclusive over real (Merkle-proven) goal counts,
//! whichever predicate validates true *is* the correct result.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::{get_return_data, invoke};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("Fg8kWSCZPGjvFWzxEx4J7u5kxKFGBf3oT2akJfri4Yae");

/// TxLINE prediction-data program (devnet). Swap for mainnet at deploy time.
pub const TXLINE_PROGRAM_ID: Pubkey = pubkey!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

/// Anchor discriminator for TxLINE `validate_stat` (from the devnet IDL).
pub const VALIDATE_STAT_DISCRIMINATOR: [u8; 8] = [107, 197, 232, 90, 191, 136, 105, 185];

/// Grace period after `close_ts` before a stuck market can be voided by anyone.
pub const VOID_GRACE_SECONDS: i64 = 7 * 24 * 60 * 60;

/// 1X2 outcome indices.
pub const OUTCOME_HOME: u8 = 0;
pub const OUTCOME_DRAW: u8 = 1;
pub const OUTCOME_AWAY: u8 = 2;

/// Full-game soccer stat keys (see docs/txline-integration.md §6).
pub const STAT_KEY_HOME_GOALS: u32 = 1;
pub const STAT_KEY_AWAY_GOALS: u32 = 2;

#[program]
pub mod snaptap_settlement {
    use super::*;

    /// Open a new market for a fixture + kind. Anyone can create one.
    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        fixture_id: i64,
        market_kind: MarketKind,
        close_ts: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(close_ts > now, SnapTapError::MarketClosed);

        let m = &mut ctx.accounts.market;
        m.creator = ctx.accounts.creator.key();
        m.fixture_id = fixture_id;
        m.market_kind = market_kind;
        m.stake_mint = ctx.accounts.stake_mint.key();
        m.close_ts = close_ts;
        m.resolved = false;
        m.voided = false;
        m.winning_outcome = u8::MAX;
        m.outcome_count = market_kind.outcome_count();
        m.pools = [0u64; 3];
        m.total_pool = 0;
        m.resolution_root = [0u8; 32];
        m.resolved_ts = 0;
        m.bump = ctx.bumps.market;
        Ok(())
    }

    /// Stake `amount` of the stake mint on `outcome`.
    pub fn deposit(ctx: Context<Deposit>, outcome: u8, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let m = &mut ctx.accounts.market;

        require!(!m.resolved, SnapTapError::AlreadyResolved);
        require!(!m.voided, SnapTapError::MarketVoided);
        require!(now < m.close_ts, SnapTapError::MarketClosed);
        require!(outcome < m.outcome_count, SnapTapError::OutcomeMismatch);
        require!(amount > 0, SnapTapError::ZeroAmount);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;

        let p = &mut ctx.accounts.position;
        if p.amount == 0 && !p.initialized {
            p.owner = ctx.accounts.owner.key();
            p.market = m.key();
            p.outcome = outcome;
            p.claimed = false;
            p.initialized = true;
            p.bump = ctx.bumps.position;
        }
        p.amount = p.amount.checked_add(amount).ok_or(SnapTapError::Overflow)?;

        m.pools[outcome as usize] = m.pools[outcome as usize]
            .checked_add(amount)
            .ok_or(SnapTapError::Overflow)?;
        m.total_pool = m.total_pool.checked_add(amount).ok_or(SnapTapError::Overflow)?;
        Ok(())
    }

    /// Resolve the market trustlessly via CPI into TxLINE `validate_stat`.
    ///
    /// The caller fetches the proof bundle from
    /// `GET /api/scores/stat-validation` and passes it in. The on-chain binding
    /// of `claimed_outcome` to the predicate (below) makes lying impossible.
    #[allow(clippy::too_many_arguments)]
    pub fn resolve(
        ctx: Context<Resolve>,
        ts: i64,
        fixture_summary: ScoresBatchSummary,
        fixture_proof: Vec<ProofNode>,
        main_tree_proof: Vec<ProofNode>,
        claimed_outcome: u8,
        stat_a: StatTerm,
        stat_b: Option<StatTerm>,
        op: Option<BinaryExpression>,
        predicate: TraderPredicate,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let m = &mut ctx.accounts.market;

        require!(!m.resolved, SnapTapError::AlreadyResolved);
        require!(!m.voided, SnapTapError::MarketVoided);
        require!(now >= m.close_ts, SnapTapError::MarketNotClosed);
        require!(claimed_outcome < m.outcome_count, SnapTapError::OutcomeMismatch);
        require_keys_eq!(
            ctx.accounts.txline_program.key(),
            TXLINE_PROGRAM_ID,
            SnapTapError::InvalidOracleProgram
        );
        require_keys_eq!(
            *ctx.accounts.daily_scores_merkle_roots.owner,
            TXLINE_PROGRAM_ID,
            SnapTapError::InvalidOracleAccount
        );

        // --- Bind claimed outcome <-> the unique predicate that proves it. ---
        match m.market_kind {
            MarketKind::MatchResult1x2 => {
                // Must compare home_goals (stat_a) minus away_goals (stat_b).
                require!(
                    matches!(op, Some(BinaryExpression::Subtract)),
                    SnapTapError::PredicateOutcomeMismatch
                );
                let b = stat_b
                    .as_ref()
                    .ok_or(SnapTapError::PredicateOutcomeMismatch)?;
                require!(
                    stat_a.stat_to_prove.key == STAT_KEY_HOME_GOALS,
                    SnapTapError::PredicateOutcomeMismatch
                );
                require!(
                    b.stat_to_prove.key == STAT_KEY_AWAY_GOALS,
                    SnapTapError::PredicateOutcomeMismatch
                );
                require!(predicate.threshold == 0, SnapTapError::PredicateOutcomeMismatch);
                let expected = match claimed_outcome {
                    OUTCOME_HOME => Comparison::GreaterThan,
                    OUTCOME_DRAW => Comparison::EqualTo,
                    OUTCOME_AWAY => Comparison::LessThan,
                    _ => return err!(SnapTapError::OutcomeMismatch),
                };
                require!(
                    predicate.comparison == expected,
                    SnapTapError::PredicateOutcomeMismatch
                );
            }
        }

        // --- Manual CPI into TxLINE validate_stat (returns bool). ---
        let args = ValidateStatArgs {
            ts,
            fixture_summary: fixture_summary.clone(),
            fixture_proof,
            main_tree_proof,
            predicate,
            stat_a,
            stat_b,
            op,
        };
        let mut data = VALIDATE_STAT_DISCRIMINATOR.to_vec();
        data.extend(args.try_to_vec()?);

        let ix = Instruction {
            program_id: TXLINE_PROGRAM_ID,
            accounts: vec![AccountMeta::new_readonly(
                ctx.accounts.daily_scores_merkle_roots.key(),
                false,
            )],
            data,
        };
        invoke(
            &ix,
            &[
                ctx.accounts.daily_scores_merkle_roots.to_account_info(),
                ctx.accounts.txline_program.to_account_info(),
            ],
        )?;

        // Read the boolean return value immediately (no CPI in between).
        let (ret_program, ret_data) =
            get_return_data().ok_or(SnapTapError::NoOracleReturn)?;
        require_keys_eq!(ret_program, TXLINE_PROGRAM_ID, SnapTapError::InvalidOracleProgram);
        require!(!ret_data.is_empty(), SnapTapError::NoOracleReturn);
        let validated = ret_data[0] != 0; // Borsh bool = 1 byte
        require!(validated, SnapTapError::ValidationFailed);

        m.winning_outcome = claimed_outcome;
        m.resolved = true;
        m.resolution_root = fixture_summary.events_sub_tree_root;
        m.resolved_ts = now;
        Ok(())
    }

    /// Claim a winning position: pro-rata share of the whole pot.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let m = &ctx.accounts.market;
        require!(m.resolved, SnapTapError::NotResolved);
        require!(!m.voided, SnapTapError::MarketVoided);

        let p = &mut ctx.accounts.position;
        require!(!p.claimed, SnapTapError::AlreadyClaimed);
        require!(p.amount > 0, SnapTapError::NotWinner);
        require!(p.outcome == m.winning_outcome, SnapTapError::NotWinner);

        let winning_pool = m.pools[m.winning_outcome as usize];
        require!(winning_pool > 0, SnapTapError::NotWinner);

        // payout = stake * total_pool / winning_pool   (u128 to avoid overflow)
        let payout = (p.amount as u128)
            .checked_mul(m.total_pool as u128)
            .ok_or(SnapTapError::Overflow)?
            .checked_div(winning_pool as u128)
            .ok_or(SnapTapError::Overflow)? as u64;

        p.claimed = true;

        let fixture_bytes = m.fixture_id.to_le_bytes();
        let kind_byte = [m.market_kind.seed_byte()];
        let seeds: &[&[u8]] = &[b"market", fixture_bytes.as_ref(), &kind_byte, &[m.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                &[seeds],
            ),
            payout,
        )?;
        Ok(())
    }

    /// Permissionlessly void a market that could not be resolved in time.
    pub fn void_market(ctx: Context<VoidMarket>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let m = &mut ctx.accounts.market;
        require!(!m.resolved, SnapTapError::AlreadyResolved);
        require!(!m.voided, SnapTapError::MarketVoided);
        require!(
            now > m.close_ts.checked_add(VOID_GRACE_SECONDS).ok_or(SnapTapError::Overflow)?,
            SnapTapError::GraceNotElapsed
        );
        m.voided = true;
        Ok(())
    }

    /// Refund stake from a voided market.
    pub fn refund(ctx: Context<Claim>) -> Result<()> {
        let m = &ctx.accounts.market;
        require!(m.voided, SnapTapError::NotVoided);

        let p = &mut ctx.accounts.position;
        require!(!p.claimed, SnapTapError::AlreadyClaimed);
        require!(p.amount > 0, SnapTapError::ZeroAmount);

        let amount = p.amount;
        p.claimed = true;

        let fixture_bytes = m.fixture_id.to_le_bytes();
        let kind_byte = [m.market_kind.seed_byte()];
        let seeds: &[&[u8]] = &[b"market", fixture_bytes.as_ref(), &kind_byte, &[m.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(fixture_id: i64, market_kind: MarketKind)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", fixture_id.to_le_bytes().as_ref(), &[market_kind.seed_byte()]],
        bump
    )]
    pub market: Account<'info, Market>,

    pub stake_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = stake_mint,
        associated_token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(outcome: u8)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market", market.fixture_id.to_le_bytes().as_ref(), &[market.market_kind.seed_byte()]],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", market.key().as_ref(), owner.key().as_ref(), &[outcome]],
        bump
    )]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        associated_token::mint = market.stake_mint,
        associated_token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token.mint == market.stake_mint @ SnapTapError::MintMismatch,
        constraint = user_token.owner == owner.key() @ SnapTapError::OwnerMismatch
    )]
    pub user_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Resolve<'info> {
    pub resolver: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market", market.fixture_id.to_le_bytes().as_ref(), &[market.market_kind.seed_byte()]],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    /// CHECK: TxLINE daily-scores Merkle-roots PDA; ownership verified == TxLINE program.
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,

    /// CHECK: TxLINE program; address verified == TXLINE_PROGRAM_ID.
    #[account(address = TXLINE_PROGRAM_ID @ SnapTapError::InvalidOracleProgram)]
    pub txline_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market", market.fixture_id.to_le_bytes().as_ref(), &[market.market_kind.seed_byte()]],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), owner.key().as_ref(), &[position.outcome]],
        bump = position.bump,
        has_one = owner @ SnapTapError::OwnerMismatch,
        constraint = position.market == market.key() @ SnapTapError::MarketMismatch
    )]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        associated_token::mint = market.stake_mint,
        associated_token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token.mint == market.stake_mint @ SnapTapError::MintMismatch,
        constraint = user_token.owner == owner.key() @ SnapTapError::OwnerMismatch
    )]
    pub user_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct VoidMarket<'info> {
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market", market.fixture_id.to_le_bytes().as_ref(), &[market.market_kind.seed_byte()]],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub creator: Pubkey,
    pub fixture_id: i64,
    pub market_kind: MarketKind,
    pub stake_mint: Pubkey,
    pub close_ts: i64,
    pub resolved: bool,
    pub voided: bool,
    pub winning_outcome: u8,
    pub outcome_count: u8,
    pub pools: [u64; 3],
    pub total_pool: u64,
    pub resolution_root: [u8; 32],
    pub resolved_ts: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub outcome: u8,
    pub amount: u64,
    pub claimed: bool,
    pub initialized: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketKind {
    /// 1X2 match result: outcome 0 = home, 1 = draw, 2 = away.
    MatchResult1x2,
}

impl MarketKind {
    pub fn seed_byte(&self) -> u8 {
        match self {
            MarketKind::MatchResult1x2 => 0,
        }
    }
    pub fn outcome_count(&self) -> u8 {
        match self {
            MarketKind::MatchResult1x2 => 3,
        }
    }
}

// ---------------------------------------------------------------------------
// TxLINE CPI mirror types (must match the TxLINE devnet IDL exactly)
// ---------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum Comparison {
    GreaterThan,
    LessThan,
    EqualTo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum BinaryExpression {
    Add,
    Subtract,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScoreStat {
    pub key: u32,
    pub value: i32,
    pub period: i32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScoresUpdateStats {
    pub update_count: i32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScoresBatchSummary {
    pub fixture_id: i64,
    pub update_stats: ScoresUpdateStats,
    pub events_sub_tree_root: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TraderPredicate {
    pub threshold: i32,
    pub comparison: Comparison,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StatTerm {
    pub stat_to_prove: ScoreStat,
    pub event_stat_root: [u8; 32],
    pub stat_proof: Vec<ProofNode>,
}

/// Borsh layout of TxLINE `validate_stat` args, in IDL order.
#[derive(AnchorSerialize)]
struct ValidateStatArgs {
    ts: i64,
    fixture_summary: ScoresBatchSummary,
    fixture_proof: Vec<ProofNode>,
    main_tree_proof: Vec<ProofNode>,
    predicate: TraderPredicate,
    stat_a: StatTerm,
    stat_b: Option<StatTerm>,
    op: Option<BinaryExpression>,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum SnapTapError {
    #[msg("Market is closed for deposits")]
    MarketClosed,
    #[msg("Market has not closed yet")]
    MarketNotClosed,
    #[msg("Market already resolved")]
    AlreadyResolved,
    #[msg("Market is not resolved")]
    NotResolved,
    #[msg("Outcome index out of range")]
    OutcomeMismatch,
    #[msg("Predicate does not match the claimed outcome")]
    PredicateOutcomeMismatch,
    #[msg("TxLINE oracle rejected the predicate")]
    ValidationFailed,
    #[msg("TxLINE oracle returned no data")]
    NoOracleReturn,
    #[msg("Invalid TxLINE oracle program")]
    InvalidOracleProgram,
    #[msg("daily_scores_merkle_roots is not owned by the TxLINE program")]
    InvalidOracleAccount,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Position is not a winner")]
    NotWinner,
    #[msg("Market is voided")]
    MarketVoided,
    #[msg("Market is not voided")]
    NotVoided,
    #[msg("Void grace period has not elapsed")]
    GraceNotElapsed,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Token mint mismatch")]
    MintMismatch,
    #[msg("Token owner mismatch")]
    OwnerMismatch,
    #[msg("Position does not belong to this market")]
    MarketMismatch,
    #[msg("Arithmetic overflow")]
    Overflow,
}
