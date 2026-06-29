import React, { useState, useCallback } from 'react';
import { Activity, TrendingUp, Award, Clock, CheckCircle2, XCircle, ChevronRight, FlaskConical, Trash2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useAppContext, Bet } from '../context/AppContext';
import { AggregatorService } from '../services/AggregatorService';
import { useWallet, useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { feedback } from '../utils/feedback';
import { ResultsDB } from '../adapters/resultsDb';
import {
  getProgram,
  claim,
  resolve,
  OUTCOME_HOME,
  OUTCOME_AWAY,
} from '../lib/snaptapClient';
import { fetchStatValidation } from '../lib/txlineApi';
import { useSnaptapMarket } from '../hooks/useSnaptapMarket';
import { ResolutionReceipt } from '../components/ResolutionReceipt';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the full score sequence for a fixture and extract the final home/away
 * goal counts plus the seq number to use for stat-validation.
 *
 * Strategy: use the LAST entry in the array — it represents the final state of
 * the match after all updates have been applied. Its `seq` is the one we pass
 * to /api/txline/stat-validation so the proof covers the definitive score.
 *
 * // VERIFY at runtime: the TxLINE historical endpoint returns entries in
 * chronological order (seq ascending). If not, sort by seq before picking last.
 */
async function fetchFinalScore(fixtureId: number): Promise<{
  homeGoals: number;
  awayGoals: number;
  seq: number;
}> {
  const res = await fetch(`/api/txline/scores/${fixtureId}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Scores fetch failed (${res.status}): ${body}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any[];

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No score events found for this fixture.');
  }

  // Pick the last event — it carries the final score.
  // If the array is unordered, sort ascending by seq first.
  const sorted = [...data].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const last = sorted[sorted.length - 1];

  // TxLINE soccer: Participant1 = home, Participant2 = away.
  // Field names: scoreSoccer.Participant1.Goals / scoreSoccer.Participant2.Goals
  // // VERIFY: actual field name casing from the live API response.
  const soccer = last.scoreSoccer ?? last.score ?? last;
  const homeGoals =
    soccer?.Participant1?.Goals ??
    soccer?.participant1?.goals ??
    soccer?.home ??
    0;
  const awayGoals =
    soccer?.Participant2?.Goals ??
    soccer?.participant2?.goals ??
    soccer?.away ??
    0;
  const seq: number = last.seq ?? last.Seq ?? 0;

  return { homeGoals, awayGoals, seq };
}

/**
 * Derive the 1X2 outcome index from final goals.
 * 0=home win, 1=draw, 2=away win.
 */
function goalsToOutcome(homeGoals: number, awayGoals: number): number {
  if (homeGoals > awayGoals) return OUTCOME_HOME;
  if (awayGoals > homeGoals) return OUTCOME_AWAY;
  return 1; // draw
}

/**
 * Derive the outcome index from a bet's leg/marketId.
 * A single-leg bet has exactly one BetSlipItem in legs[] with an 'outcome' field.
 * Falls back to parsing the marketId suffix (-home/-draw/-away).
 */
function betOutcomeIndex(bet: Bet): number {
  const legOutcome = bet.legs?.[0]?.outcome;
  if (legOutcome === 'home') return OUTCOME_HOME;
  if (legOutcome === 'draw') return 1;
  if (legOutcome === 'away') return OUTCOME_AWAY;
  // fallback from marketId suffix
  if (bet.marketId.endsWith('-home')) return OUTCOME_HOME;
  if (bet.marketId.endsWith('-draw')) return 1;
  if (bet.marketId.endsWith('-away')) return OUTCOME_AWAY;
  return OUTCOME_HOME; // safe default
}

// ---------------------------------------------------------------------------
// Sub-component: per-bet on-chain controls (settle + receipt)
// ---------------------------------------------------------------------------

interface BetOnChainControlsProps {
  bet: Bet;
  onSettled: () => void;
}

const BetOnChainControls: React.FC<BetOnChainControlsProps> = ({ bet, onSettled }) => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  // Primary fixtureId for single-leg bets
  const fixtureId = bet.fixtureIds?.[0] ?? bet.legs?.[0]?.fixtureId ?? null;

  const { market, loading: marketLoading, refresh } = useSnaptapMarket(
    fixtureId,
    anchorWallet
  );

  const [settling, setSettling] = useState(false);
  const [settleTxSig, setSettleTxSig] = useState<string | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);

  const handleSettle = useCallback(async () => {
    if (!anchorWallet || fixtureId == null) return;
    setSettling(true);
    setSettleError(null);
    setSettleTxSig(null);

    try {
      const { homeGoals, awayGoals, seq } = await fetchFinalScore(fixtureId);
      const claimedOutcome = goalsToOutcome(homeGoals, awayGoals);

      // Fetch both stat keys (1=home goals full game, 2=away goals full game) in one call
      const validation = await fetchStatValidation({
        fixtureId,
        seq,
        statKey: '1',
        statKey2: '2',
      });

      const program = getProgram(connection, anchorWallet);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sig = await resolve(program, { fixtureId, claimedOutcome, validation: validation as any });

      setSettleTxSig(sig);
      refresh();
      onSettled();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[SnapTap resolve] failed:', e);
      setSettleError(msg);
    } finally {
      setSettling(false);
    }
  }, [anchorWallet, fixtureId, connection, refresh, onSettled]);

  // Only show for non-test bets on a finished match whose market is not resolved yet
  if (bet.isTestBet || fixtureId == null) return null;

  const matchFinished = bet.status === 'Won' || bet.status === 'Lost' || bet.status === 'Claimed';
  const showSettleButton = matchFinished && !marketLoading && market && !market.resolved;
  const showReceipt = market?.resolved;

  return (
    <>
      {showSettleButton && (
        <div className="flex flex-col gap-2 mt-1">
          <button
            onClick={handleSettle}
            disabled={settling}
            className="w-full py-2 bg-primary/10 text-primary border border-primary/30 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-primary/20 transition-colors disabled:opacity-60"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {settling ? 'Settling on-chain...' : 'Settle on-chain'}
          </button>
          {settleError && (
            <div className="flex items-start gap-2 bg-danger/10 border border-danger/20 rounded-lg p-2">
              <AlertTriangle className="w-3.5 h-3.5 text-danger mt-0.5 shrink-0" />
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <span className="text-[10px] font-bold text-danger uppercase">Resolve failed</span>
                <span className="text-[10px] text-danger/80 break-all">{settleError}</span>
                <button
                  onClick={() => setSettleError(null)}
                  className="text-[10px] text-ink-light underline self-start"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {settleTxSig && (
            <a
              href={`https://explorer.solana.com/tx/${settleTxSig}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-mono text-primary underline truncate"
            >
              Tx: {settleTxSig.slice(0, 16)}…
            </a>
          )}
        </div>
      )}

      {showReceipt && (
        <ResolutionReceipt market={market} fixtureId={fixtureId} />
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export const ActivityScreen = () => {
  const { bets, claimReward, isTestMode, clearTestBets } = useAppContext();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimTxSigs, setClaimTxSigs] = useState<Record<string, string>>({});
  const [betFilter, setBetFilter] = useState<'all' | 'active' | 'settled' | 'won'>('all');

  const displayedBets = bets.filter(bet => {
    if (isTestMode) return bet.isTestBet;
    return !bet.isTestBet;
  });

  if (!isTestMode && !publicKey) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col px-6 min-h-[60vh]">
        <div className="w-16 h-16 rounded-full bg-pearl flex items-center justify-center mb-4">
          <Activity className="w-8 h-8 text-ink-light" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-medium text-ink mb-2">Connect Wallet</h2>
        <p className="text-sm text-ink-light text-center mb-6 max-w-sm">
          Please connect your Solana wallet to view your active predictions, rewards, and history.
        </p>
      </div>
    );
  }

  const filteredBets = displayedBets.filter(bet => {
    switch (betFilter) {
      case 'active': return bet.status === 'Active';
      case 'settled': return bet.status === 'Lost' || bet.status === 'Won' || bet.status === 'Claimed';
      case 'won': return bet.status === 'Won' || bet.status === 'Claimed';
      default: return true;
    }
  });

  const totalWagered = displayedBets.reduce((sum, bet) => {
    if (isTestMode) return sum + bet.amount;
    const rate = AggregatorService.getConversionRate(bet.currency as Parameters<typeof AggregatorService.getConversionRate>[0], 'USDC');
    return sum + (bet.amount * rate);
  }, 0);

  const pendingRewards = displayedBets
    .filter(b => b.status === 'Won')
    .reduce((sum, bet) => {
      if (isTestMode) return sum + bet.potentialPayout;
      const rate = AggregatorService.getConversionRate(bet.currency as Parameters<typeof AggregatorService.getConversionRate>[0], 'USDC');
      return sum + (bet.potentialPayout * rate);
    }, 0);

  const activeCount = displayedBets.filter(b => b.status === 'Active').length;
  const resolvedCount = displayedBets.filter(b => b.status === 'Won' || b.status === 'Lost' || b.status === 'Claimed').length;
  const wonCount = displayedBets.filter(b => b.status === 'Won' || b.status === 'Claimed').length;
  const winRate = resolvedCount > 0 ? Math.round((wonCount / resolvedCount) * 100) : 0;

  // ---------------------------------------------------------------------------
  // Real on-chain CLAIM
  // ---------------------------------------------------------------------------

  const handleClaim = async (bet: Bet) => {
    if (!isTestMode && (!publicKey || !anchorWallet)) {
      alert('Please connect your wallet to claim rewards.');
      return;
    }
    feedback.playClick();
    setClaimingId(bet.id);

    try {
      if (isTestMode) {
        // Test-mode: purely local claim (no chain interaction)
        claimReward(bet.id);
        feedback.playSuccess();
      } else {
        // Real on-chain claim via snaptapClient.claim()
        const fixtureId = bet.fixtureIds?.[0] ?? bet.legs?.[0]?.fixtureId;
        if (fixtureId == null) throw new Error('No fixtureId found on bet — cannot claim.');

        const program = getProgram(connection, anchorWallet!);
        const outcome = betOutcomeIndex(bet);
        const sig = await claim(program, { fixtureId, outcome });

        setClaimTxSigs(prev => ({ ...prev, [bet.id]: sig }));
        claimReward(bet.id);
        feedback.playSuccess();
      }
    } catch (error) {
      console.error('Failed to claim:', error);
      alert(`Failed to claim reward: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setClaimingId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Display helpers
  // ---------------------------------------------------------------------------

  const getStatusIcon = (status: Bet['status']) => {
    switch (status) {
      case 'Active': return <Clock className="w-4 h-4 text-warning" />;
      case 'Won': return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'Claimed': return <Award className="w-4 h-4 text-primary" />;
      case 'Lost': return <XCircle className="w-4 h-4 text-danger" />;
    }
  };

  const getStatusColor = (status: Bet['status']) => {
    switch (status) {
      case 'Active': return 'bg-warning/10 text-warning border-warning/20';
      case 'Won': return 'bg-success/10 text-success border-success/20';
      case 'Claimed': return 'bg-primary/10 text-primary border-primary/20';
      case 'Lost': return 'bg-danger/10 text-danger border-danger/20';
    }
  };

  const getStatusLabel = (status: Bet['status']) => {
    switch (status) {
      case 'Active': return 'Active';
      case 'Won': return 'Won';
      case 'Claimed': return 'Claimed';
      case 'Lost': return 'Lost';
    }
  };

  const getLegResult = (leg: { homeTeam: string; awayTeam: string; outcome: string }) => {
    const score = ResultsDB.getScore(leg.homeTeam, leg.awayTeam);
    if (!score) return null;
    let legWon = false;
    if (leg.outcome === 'home' && score.home > score.away) legWon = true;
    if (leg.outcome === 'away' && score.away > score.home) legWon = true;
    if (leg.outcome === 'draw' && score.home === score.away) legWon = true;
    return { score, legWon };
  };

  const FILTER_TABS = [
    { key: 'all' as const, label: 'All', count: displayedBets.length },
    { key: 'active' as const, label: 'Open', count: activeCount },
    { key: 'settled' as const, label: 'Settled', count: resolvedCount },
    { key: 'won' as const, label: 'Won', count: wonCount },
  ];

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar px-5 pt-4 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-ink">Portfolio & Activity</h2>
        <div className="flex items-center gap-2">
          {isTestMode && displayedBets.length > 0 && (
            <button
              onClick={clearTestBets}
              className="text-[10px] font-bold text-ink-light px-2 py-1 rounded-md flex items-center gap-1 hover:bg-pearl transition-colors"
              title="Clear test history"
            >
              <Trash2 size={10} />
              CLEAR
            </button>
          )}
          {isTestMode && (
            <span className="text-[10px] font-bold bg-warning text-cream px-2 py-1 rounded-md flex items-center gap-1">
              <FlaskConical size={12} />
              TEST MODE
            </span>
          )}
        </div>
      </div>

      {displayedBets.length === 0 ? (
        <div className="flex-1 flex items-center justify-center flex-col px-6 min-h-[60vh]">
          <div className="w-16 h-16 rounded-full bg-pearl flex items-center justify-center mb-4">
            {isTestMode ? (
              <FlaskConical className="w-8 h-8 text-ink-light" strokeWidth={1.5} />
            ) : (
              <Activity className="w-8 h-8 text-ink-light" strokeWidth={1.5} />
            )}
          </div>
          <h2 className="text-lg font-medium text-ink mb-2">
            {isTestMode ? 'No Test Predictions Yet' : 'No Predictions Yet'}
          </h2>
          <p className="text-sm text-ink-light text-center">
            {isTestMode
              ? 'Place a test bet on a World Cup match to see your history here.'
              : 'Place a prediction on a World Cup match to get started.'}
          </p>
        </div>
      ) : (
        <>
          {/* Stats Dashboard */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="glass-card p-4 flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-light uppercase tracking-wider">Pending Rewards</span>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-success">
                  {pendingRewards.toFixed(2)}
                </span>
                <span className="text-xs font-mono text-ink-light mb-1">{isTestMode ? 'TEST' : 'USDC'}</span>
              </div>
            </div>

            <div className="glass-card p-4 flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-light uppercase tracking-wider">Total Wagered</span>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-ink">
                  {totalWagered.toFixed(2)}
                </span>
                <span className="text-xs font-mono text-ink-light mb-1">{isTestMode ? 'TEST' : 'USDC'}</span>
              </div>
            </div>

            <div className="glass-card p-4 flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-light uppercase tracking-wider">Active Positions</span>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-warning" />
                <span className="text-xl font-bold text-ink">{activeCount}</span>
              </div>
            </div>

            <div className="glass-card p-4 flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-light uppercase tracking-wider">Win Rate</span>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-xl font-bold text-ink">{winRate}%</span>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-1.5 mb-5 overflow-x-auto no-scrollbar pb-1">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { feedback.playClick(); setBetFilter(tab.key); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                  betFilter === tab.key
                    ? 'bg-ink text-cream'
                    : 'bg-ink/5 text-ink-light hover:bg-ink/10'
                }`}
              >
                {tab.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  betFilter === tab.key ? 'bg-cream/20 text-cream' : 'bg-ink/10 text-ink-light'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <h3 className="text-sm font-bold text-ink-light uppercase tracking-wider mb-4">Position History</h3>

          <div className="flex flex-col gap-3">
            {filteredBets.length === 0 ? (
              <div className="glass-card p-6 text-center text-ink-light text-sm">
                No positions found in this category.
              </div>
            ) : (
              filteredBets.map(bet => (
                <div key={bet.id} className={`glass-card p-4 flex flex-col gap-3 border ${
                  bet.status === 'Won' ? 'border-success/30' :
                  bet.status === 'Lost' ? 'border-danger/10' :
                  isTestMode ? 'border-warning/20' : 'border-pearl-dark/20'
                }`}>
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="text-sm font-medium text-ink line-clamp-2 flex-1">
                      {bet.marketId.startsWith('express-')
                        ? bet.legs ? `Express Bet (${bet.legs.length} legs)` : bet.marketTitle
                        : bet.marketTitle}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      {bet.marketId.startsWith('express-') && (
                        <span className="text-[9px] font-bold bg-warning/20 text-warning px-1.5 py-0.5 rounded-md uppercase">Express</span>
                      )}
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${getStatusColor(bet.status)}`}>
                        {getStatusIcon(bet.status)}
                        <span className="text-[10px] font-bold uppercase tracking-wide">
                          {getStatusLabel(bet.status)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-end mt-1">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-ink-light">Wager</span>
                      <span className="text-sm font-mono font-bold text-ink">{bet.amount} {isTestMode ? 'TEST' : bet.currency}</span>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-ink-light">
                        {bet.status === 'Lost' ? 'Result' : 'Payout'}
                      </span>
                      <span className={`text-sm font-mono font-bold ${
                        bet.status === 'Won' || bet.status === 'Claimed' ? 'text-success' :
                        bet.status === 'Lost' ? 'text-danger' : 'text-ink'
                      }`}>
                        {bet.status === 'Lost' ? '0.00' : bet.potentialPayout.toFixed(2)} {isTestMode ? 'TEST' : bet.currency}
                      </span>
                    </div>
                  </div>

                  {/* Express legs with results */}
                  {bet.legs && bet.legs.length > 0 && (
                    <div className="mt-1 bg-ink/5 rounded-lg p-3 flex flex-col gap-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-ink-light uppercase tracking-wider">Selections</span>
                        <span className="text-[10px] font-bold text-ink uppercase tracking-wider">
                          Total Odds: <span className="text-primary font-mono">@{(bet.potentialPayout / bet.amount).toFixed(2)}</span>
                        </span>
                      </div>
                      {bet.legs.map((leg, i) => {
                        const result = getLegResult(leg);
                        const outcomeLabel = leg.outcome === 'home' ? leg.homeTeam : leg.outcome === 'away' ? leg.awayTeam : 'Draw';
                        return (
                          <div key={i} className="flex justify-between items-center border-b border-pearl-dark/20 last:border-0 pb-1.5 last:pb-0">
                            <div className="flex flex-col">
                              <span className="text-xs text-ink font-medium">{leg.homeTeam} vs {leg.awayTeam}</span>
                              {result && (
                                <span className="text-[10px] text-ink-light font-mono">
                                  {result.score.home}:{result.score.away} · FT
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                result
                                  ? result.legWon ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                                  : 'bg-primary/10 text-primary'
                              }`}>
                                {result ? (result.legWon ? '✓' : '✗') : ''} {outcomeLabel.toUpperCase()}
                              </span>
                              <span className="text-xs font-mono font-medium text-ink-light">@{leg.odds.toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Single bet result score */}
                  {!bet.legs && (bet.status === 'Won' || bet.status === 'Lost' || bet.status === 'Claimed') && (() => {
                    const parts = bet.marketTitle.split(' vs ');
                    if (parts.length === 2) {
                      const homeTeam = parts[0];
                      const awayTeam = parts[1].split(' —')[0];
                      const score = ResultsDB.getScore(homeTeam, awayTeam);
                      if (score) {
                        return (
                          <div className="flex items-center gap-2 text-xs text-ink-light bg-ink/5 rounded-lg px-3 py-2">
                            <span>Final Score:</span>
                            <span className="font-mono font-bold text-ink">{score.home}:{score.away}</span>
                          </div>
                        );
                      }
                    }
                    return null;
                  })()}

                  {/* On-chain settle button + resolution receipt (non-test bets only) */}
                  {!bet.isTestBet && (
                    <BetOnChainControls
                      bet={bet}
                      onSettled={() => {/* market refresh handled inside component */}}
                    />
                  )}

                  {/* Claim Button */}
                  {bet.status === 'Won' && (
                    <>
                      <button
                        onClick={() => handleClaim(bet)}
                        disabled={claimingId === bet.id}
                        className="mt-2 w-full py-2.5 bg-success text-cream rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-success/90 transition-colors disabled:opacity-70"
                      >
                        {claimingId === bet.id ? (
                          <span className="animate-pulse">Processing Claim...</span>
                        ) : (
                          <>
                            Claim {bet.potentialPayout.toFixed(2)} {bet.currency}
                            <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                      {/* Show tx link after successful non-test claim */}
                      {!isTestMode && claimTxSigs[bet.id] && (
                        <a
                          href={`https://explorer.solana.com/tx/${claimTxSigs[bet.id]}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-mono text-success underline truncate"
                        >
                          Claim tx: {claimTxSigs[bet.id].slice(0, 16)}…
                        </a>
                      )}
                    </>
                  )}

                  <div className="text-[10px] text-ink-light opacity-60 mt-1">
                    {new Date(bet.timestamp).toLocaleString(undefined, {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
