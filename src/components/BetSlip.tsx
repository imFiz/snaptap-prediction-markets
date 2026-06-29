import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Receipt, X, Trash2, ArrowRight, Zap } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { feedback } from '../utils/feedback';

const QUICK_AMOUNTS = [100, 500, 1000, 5000];

export const BetSlip = () => {
  const { betSlip, removeFromBetSlip, clearBetSlip, placeExpressBet, isTestMode, testBalance } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState(isTestMode ? 100 : 10);

  useEffect(() => {
    setAmount(isTestMode ? 100 : 10);
  }, [isTestMode]);

  if (betSlip.length === 0) return null;

  const totalOdds = betSlip.reduce((acc, item) => acc * item.odds, 1);
  const potentialPayout = (amount * totalOdds).toFixed(2);
  const profit = (amount * totalOdds - amount).toFixed(2);
  const isExpress = betSlip.length > 1;

  const canPlace = amount > 0 && !isNaN(amount) && (!isTestMode || amount <= testBalance);

  const handlePlaceBet = () => {
    if (!canPlace) return;
    placeExpressBet(amount, isTestMode ? 'TEST' : 'USDC', isTestMode);
    setIsOpen(false);
  };

  const addQuickAmount = (val: number) => {
    feedback.playClick();
    setAmount(prev => prev + val);
  };

  const setMaxAmount = () => {
    feedback.playClick();
    setAmount(isTestMode ? Math.floor(testBalance) : 1000);
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

                {/* Place bet button */}
                <button
                  onClick={handlePlaceBet}
                  disabled={!canPlace}
                  className="w-full bg-ink text-cream font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-ink/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed text-base"
                >
                  Place {isExpress ? 'Express' : ''} Bet — {amount} {isTestMode ? 'TEST' : 'USDC'}
                  <ArrowRight size={18} />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
