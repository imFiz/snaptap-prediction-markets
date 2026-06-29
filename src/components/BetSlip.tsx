import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Receipt, X, Trash2, ArrowRight, Zap, Loader2, ExternalLink } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { feedback } from '../utils/feedback';
import { useConnection, useAnchorWallet, useWallet } from '@solana/wallet-adapter-react';
import {
  getProgram,
  fetchMarket,
  initializeMarket,
  deposit,
  STAKE_MINT,
  OUTCOME_HOME,
  OUTCOME_DRAW,
  OUTCOME_AWAY,
} from '../lib/snaptapClient';
import { useStakeBalance } from '../lib/useStakeBalance';

const QUICK_AMOUNTS_TEST = [100, 500, 1000, 5000];
const QUICK_AMOUNTS_REAL = [1, 5, 10, 50];

export const BetSlip = () => {
  const { betSlip, removeFromBetSlip, clearBetSlip, placeExpressBet, addBet, isTestMode, testBalance } = useAppContext();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { connected } = useWallet();
  const { balance: stakeBalance, refresh: refreshBalance } = useStakeBalance();

  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState(isTestMode ? 100 : 10);
  const [txLoading, setTxLoading] = useState(false);
  const [txResult, setTxResult] = useState<{ sig: string } | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const isRealMode = !isTestMode && connected && !!anchorWallet;
  const isExpress = betSlip.length > 1;

  useEffect(() => {
    setAmount(isTestMode ? 100 : 10);
  }, [isTestMode]);

  // Clear tx feedback when slip or mode changes
  useEffect(() => {
    setTxResult(null);
    setTxError(null);
  }, [betSlip, isTestMode]);

  if (betSlip.length === 0) return null;

  const totalOdds = betSlip.reduce((acc, item) => acc * item.odds, 1);
  const potentialPayout = (amount * totalOdds).toFixed(2);
  const profit = (amount * totalOdds - amount).toFixed(2);
  const QUICK_AMOUNTS = isTestMode ? QUICK_AMOUNTS_TEST : QUICK_AMOUNTS_REAL;

  const canPlace = amount > 0 && !isNaN(amount) && !txLoading &&
    (!isTestMode || amount <= testBalance) &&
    (isTestMode || !isRealMode || amount <= stakeBalance);

  const handlePlaceBet = async () => {
    if (!canPlace) return;
    setTxResult(null);
    setTxError(null);

    // Test mode OR wallet not connected: use existing express/local flow
    if (isTestMode || !connected || !anchorWallet) {
      placeExpressBet(amount, isTestMode ? 'TEST' : 'USDC', isTestMode);
      setIsOpen(false);
      return;
    }

    // Real mode with wallet
    if (isExpress) {
      // Multi-leg express cannot map to a single on-chain market
      setTxError('Express bets are test-mode only. Switch to Test Mode or select a single match.');
      return;
    }

    // Single-leg real deposit
    const leg = betSlip[0];
    const outcomeIndex =
      leg.outcome === 'home' ? OUTCOME_HOME :
      leg.outcome === 'draw' ? OUTCOME_DRAW : OUTCOME_AWAY;

    setTxLoading(true);
    try {
      const program = getProgram(connection, anchorWallet);

      // Ensure market exists
      let marketExists = false;
      try {
        const m = await fetchMarket(program, leg.fixtureId);
        marketExists = m !== null && m !== undefined;
      } catch {
        marketExists = false;
      }

      if (!marketExists) {
        // Initialize market first; closeTs = match start (best-effort)
        const closeTs = Math.floor(Date.now() / 1000) + 3600; // fallback: 1h from now
        await initializeMarket(program, {
          fixtureId: leg.fixtureId,
          closeTs,
          stakeMint: STAKE_MINT,
        });
      }

      const sig = await deposit(program, {
        fixtureId: leg.fixtureId,
        outcome: outcomeIndex,
        amount: Math.round(amount * 1e6),
      });

      feedback.playSuccess();
      setTxResult({ sig });
      refreshBalance();

      const outcomeLabel = leg.outcome === 'home' ? leg.homeTeam : leg.outcome === 'away' ? leg.awayTeam : 'Draw';
      addBet({
        marketId: `wc-${leg.fixtureId}-${leg.outcome}`,
        marketTitle: `${leg.homeTeam} vs ${leg.awayTeam} — ${outcomeLabel}`,
        outcome: 'Yes',
        amount,
        currency: 'USDC',
        potentialPayout: parseFloat(potentialPayout),
        isTestBet: false,
        fixtureIds: [leg.fixtureId],
        legs: [...betSlip],
      });

      clearBetSlip();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTxError(msg.length > 120 ? msg.slice(0, 120) + '…' : msg);
    }
    setTxLoading(false);
  };

  const addQuickAmount = (val: number) => {
    feedback.playClick();
    setAmount(prev => prev + val);
  };

  const setMaxAmount = () => {
    feedback.playClick();
    if (isTestMode) {
      setAmount(Math.floor(testBalance));
    } else if (isRealMode) {
      setAmount(Math.floor(stakeBalance));
    } else {
      setAmount(1000);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            onClick={() => { feedback.playClick(); setIsOpen(true); }}
            className="fixed bottom-20 right-6 z-40 bg-ink text-cream p-4 rounded-full shadow-2xl flex items-center gap-3 hover:scale-105 transition-transform"
          >
            <div className="relative">
              <Receipt size={24} />
              <span className="absolute -top-2 -right-2 bg-warning text-ink text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                {betSlip.length}
              </span>
            </div>
            {isExpress && (
              <span className="text-xs font-bold text-cream/80">
                Express ×{totalOdds.toFixed(2)}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Slip Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-cream border-t border-pearl-dark rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="p-4 border-b border-pearl-dark flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Receipt size={20} className="text-ink" />
                  <h3 className="font-bold text-ink text-lg">Bet Slip</h3>
                  {isExpress && (
                    <span className="bg-warning/20 text-warning text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      Express
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <button onClick={() => { feedback.playClick(); clearBetSlip(); }} className="text-danger p-2 hover:bg-danger/10 rounded-full">
                    <Trash2 size={18} />
                  </button>
                  <button onClick={() => { feedback.playClick(); setIsOpen(false); }} className="text-ink-light p-2 hover:bg-pearl rounded-full">
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Selections */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {betSlip.map(item => (
                  <div key={item.fixtureId} className="bg-pearl/50 border border-pearl-dark rounded-xl p-3 relative">
                    <button
                      onClick={() => removeFromBetSlip(item.fixtureId)}
                      className="absolute top-2 right-2 text-ink-light hover:text-danger"
                    >
                      <X size={16} />
                    </button>
                    <p className="text-xs text-ink-light font-medium mb-1 pr-6">
                      {item.homeTeam} vs {item.awayTeam}
                    </p>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-ink text-sm capitalize">
                        {item.outcome === 'draw' ? 'Draw' : item.outcome === 'home' ? item.homeTeam : item.awayTeam}
                      </span>
                      <span className="font-bold text-ink text-sm bg-pearl-dark px-2 py-0.5 rounded-md">
                        {item.odds.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Panel */}
              <div className="p-5 border-t border-pearl-dark bg-pearl/30 flex flex-col gap-4">
                {/* Total Odds */}
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-ink-light">
                    {isExpress ? 'Total Odds' : 'Odds'}
                  </span>
                  <span className="text-2xl font-black text-ink">×{totalOdds.toFixed(2)}</span>
                </div>

                {/* Amount input */}
                <div>
                  <label className="text-xs text-ink-light font-medium block mb-2">
                    Bet Amount ({isTestMode ? 'TEST' : 'USDC'})
                    {isTestMode && (
                      <span className="ml-2 text-ink-light/60">Balance: {testBalance.toFixed(0)}</span>
                    )}
                    {isRealMode && !isTestMode && (
                      <span className="ml-2 text-ink-light/60">Balance: {stakeBalance.toFixed(2)} USDC</span>
                    )}
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(Number(e.target.value))}
                    className="w-full bg-pearl border border-pearl-dark rounded-xl p-3 font-mono font-bold text-ink outline-none focus:border-ink text-lg"
                  />
                </div>

                {/* Quick amounts */}
                <div className="flex gap-2">
                  {QUICK_AMOUNTS.map(val => (
                    <button
                      key={val}
                      onClick={() => addQuickAmount(val)}
                      className="flex-1 py-1.5 text-xs font-bold bg-ink/5 hover:bg-ink/10 text-ink-light rounded-lg transition-colors"
                    >
                      +{val >= 1000 ? `${val/1000}K` : val}
                    </button>
                  ))}

                  <button
                    onClick={setMaxAmount}
                    className="flex-1 py-1.5 text-xs font-bold bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <Zap size={10} />
                    MAX
                  </button>
                </div>

                {/* Express warning in real mode */}
                {isRealMode && isExpress && (
                  <p className="text-xs text-warning bg-warning/10 rounded-xl p-3 text-center">
                    Express bets are test-mode only. Single match deposits supported on-chain.
                  </p>
                )}

                {/* Payout preview */}
                <div className="bg-success/8 border border-success/15 rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-ink-light">Potential Payout</p>
                    <p className="text-xl font-black text-success">{potentialPayout}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink-light">Estimated Profit</p>
                    <p className="text-base font-bold text-success">+{profit}</p>
                  </div>
                </div>

                {/* Tx error */}
                {txError && (
                  <p className="text-xs text-danger bg-danger/10 rounded-xl p-3 break-all">
                    {txError}
                  </p>
                )}

                {/* Tx success */}
                {txResult && (
                  <a
                    href={`https://explorer.solana.com/tx/${txResult.sig}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 text-xs text-ink-light underline bg-success/8 rounded-xl p-3"
                  >
                    Bet confirmed — view on Explorer
                    <ExternalLink size={12} />
                  </a>
                )}

                {/* Place bet button */}
                <button
                  onClick={handlePlaceBet}
                  disabled={!canPlace}
                  className="w-full bg-ink text-cream font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-ink/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed text-base"
                >
                  {txLoading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Sending transaction...
                    </>
                  ) : (
                    <>
                      Place {isExpress ? 'Express' : ''} Bet — {amount} {isTestMode ? 'TEST' : 'USDC'}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
