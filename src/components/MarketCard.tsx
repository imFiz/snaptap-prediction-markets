import React, { useState, useEffect } from 'react';
import { Currency, Market, AggregatorService } from '../services/AggregatorService';
import { motion, AnimatePresence } from 'motion/react';
import { Fingerprint, CheckCircle2, Loader2, X, Wallet, AlertTriangle } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { feedback } from '../utils/feedback';
import { useAppContext } from '../context/AppContext';

interface MarketCardProps {
  market: Market;
  onBet: (marketId: string, outcome: 'Yes' | 'No', amount: number, currency: Currency) => Promise<void>;
}

export const MarketCard: React.FC<MarketCardProps> = ({ market, onBet }) => {
  const { connected, publicKey } = useWallet();
  const { isTestMode, testBalance, addBet } = useAppContext();
  const [selectedOutcome, setSelectedOutcome] = useState<'Yes' | 'No' | null>(null);
  const [amount, setAmount] = useState<number>(100);
  const [currency, setCurrency] = useState<Currency>('USDC');
  const [isSigning, setIsSigning] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const CURRENCIES: Currency[] = isTestMode ? ['STcoin' as any] : ['USDC', 'SOL', 'USDT', 'SKR'];

  useEffect(() => {
    if (isTestMode) {
      setCurrency('STcoin' as any);
    } else {
      setCurrency('USDC');
    }
  }, [isTestMode]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleBetClick = (outcome: 'Yes' | 'No') => {
    if (isSigning || isSuccess) return;
    feedback.playClick();
    setSelectedOutcome(outcome);
  };

  const handleSign = async () => {
    if (!selectedOutcome) return;
    if (!connected) {
      alert("Please connect your wallet first.");
      return;
    }

    if (isTestMode && amount > testBalance) {
      feedback.playClick();
      alert("Insufficient STcoin balance!");
      return;
    }
    
    feedback.playClick();
    setIsSigning(true);
    
    // Simulate biometric delay / wallet approval
    await new Promise(resolve => setTimeout(resolve, 800));
    
    if (isTestMode) {
      // In test mode, we bypass the real onBet and just add it to context
      const price = selectedOutcome === 'Yes' ? market.yesProbability : market.noProbability;
      const potentialPayout = amount / price;
      
      addBet({
        marketId: market.id,
        marketTitle: market.title,
        outcome: selectedOutcome,
        amount,
        currency: 'STcoin',
        potentialPayout,
        isTestBet: true
      });
    } else {
      await onBet(market.id, selectedOutcome, amount, currency);
    }
    
    setIsSigning(false);
    setIsSuccess(true);
    feedback.playSuccess();
    
    setTimeout(() => {
      setIsSuccess(false);
      setSelectedOutcome(null);
    }, 3000);
  };

  const targetCurrency = market.provider === 'Drift' ? 'USDC' : 'USDC';
  const conversionRate = isTestMode ? 1 : AggregatorService.getConversionRate(currency, targetCurrency as Currency);
  const convertedAmount = amount * conversionRate;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card p-5 mb-4 w-full flex flex-col relative overflow-hidden ${isTestMode ? 'border-warning/30' : ''}`}
    >
      {isTestMode && (
        <div className="absolute top-0 right-0 bg-warning text-cream text-[10px] font-bold px-3 py-1 rounded-bl-xl z-10 flex items-center gap-1">
          <AlertTriangle size={10} />
          TEST MODE
        </div>
      )}

      <div className="flex justify-between items-center mb-3 mt-1">
        <span className="text-xs font-semibold tracking-wider uppercase text-ink-light bg-pearl px-2 py-1 rounded-md">
          {market.category}
        </span>
        <span className="text-xs font-mono text-ink-light opacity-60">
          via {market.provider}
        </span>
      </div>
      
      <h3 className="text-lg font-medium leading-tight mb-5 text-ink">
        {market.title}
      </h3>
      
      <div className="flex gap-3 mb-5 relative">
        <button 
          onClick={() => handleBetClick('Yes')}
          className={`flex-1 py-3 rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center ${
            selectedOutcome === 'Yes' 
              ? 'bg-ink text-cream border-ink shadow-lg scale-[1.02]' 
              : 'bg-pearl border-pearl-dark text-ink hover:bg-pearl-dark'
          }`}
        >
          <span className="font-semibold text-sm">Yes</span>
          <span className="text-xs opacity-70 mt-0.5">{Math.round(market.yesProbability * 100)}%</span>
        </button>
        
        <button 
          onClick={() => handleBetClick('No')}
          className={`flex-1 py-3 rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center ${
            selectedOutcome === 'No' 
              ? 'bg-ink text-cream border-ink shadow-lg scale-[1.02]' 
              : 'bg-pearl border-pearl-dark text-ink hover:bg-pearl-dark'
          }`}
        >
          <span className="font-semibold text-sm">No</span>
          <span className="text-xs opacity-70 mt-0.5">{Math.round(market.noProbability * 100)}%</span>
        </button>
      </div>

      <div className="flex justify-between items-center text-xs text-ink-light font-mono opacity-70">
        <span>Pool: {formatCurrency(market.poolSize)}</span>
        <span>Ends: {new Date(market.closingTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      </div>

      {/* Betting Overlay */}
      <AnimatePresence>
        {selectedOutcome && !isSuccess && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full flex flex-col items-center justify-center z-20 mt-4 overflow-hidden"
          >
            <div className="w-full bg-pearl/50 rounded-2xl p-4 border border-pearl-dark mb-4 shadow-sm relative">
              <button 
                onClick={() => {
                  if (!isSigning) {
                    feedback.playClick();
                    setSelectedOutcome(null);
                  }
                }}
                className="absolute top-2 right-2 text-ink-light p-1 hover:text-ink transition-colors"
              >
                <X size={16} />
              </button>

              <div className="flex justify-between items-center mb-2 pr-6">
                <label className="text-xs font-semibold text-ink-light uppercase tracking-wider">Amount</label>
                <div className="flex gap-1">
                  {CURRENCIES.map(c => (
                    <button
                      key={c}
                      onClick={() => {
                        feedback.playClick();
                        setCurrency(c);
                      }}
                      className={`text-[10px] px-2 py-1 rounded-md font-mono transition-colors ${
                        currency === c ? 'bg-ink text-cream' : 'bg-pearl text-ink-light hover:bg-pearl-dark'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full text-3xl font-medium bg-transparent outline-none text-ink placeholder:text-ink-light"
                  min="0"
                  step="0.1"
                />
                <span className="text-xl font-mono text-ink-light">{currency}</span>
              </div>
              
              {!isTestMode && currency !== targetCurrency && (
                <div className="mt-3 pt-3 border-t border-pearl-dark/50 flex justify-between items-center text-xs text-ink-light">
                  <span>Auto-converting for {market.provider}</span>
                  <span className="font-mono">≈ {convertedAmount.toFixed(2)} {targetCurrency}</span>
                </div>
              )}
              
              {isTestMode && (
                <div className="mt-3 pt-3 border-t border-pearl-dark/50 flex justify-between items-center text-xs text-ink-light">
                  <span>Test Balance</span>
                  <span className={`font-mono ${amount > testBalance ? 'text-danger font-bold' : ''}`}>
                    {testBalance.toFixed(2)} STcoin
                  </span>
                </div>
              )}
            </div>
            
            <button 
              onClick={handleSign}
              disabled={isSigning || !connected || (isTestMode && amount > testBalance)}
              className={`w-full py-4 rounded-full flex items-center justify-center gap-2 font-medium transition-all ${
                connected && (!isTestMode || amount <= testBalance)
                  ? 'bg-ink text-cream hover:bg-ink-light shadow-lg' 
                  : 'bg-pearl-dark text-ink-light cursor-not-allowed'
              }`}
            >
              {isSigning ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : connected ? (
                <>
                  <Fingerprint className="w-5 h-5" />
                  Confirm Bet
                </>
              ) : (
                <>
                  <Wallet className="w-5 h-5" />
                  Connect Wallet First
                </>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSuccess && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-success/10 backdrop-blur-md flex flex-col items-center justify-center z-20 rounded-[28px] border border-success/20"
          >
            <CheckCircle2 className="w-12 h-12 text-success mb-2" strokeWidth={1.5} />
            <p className="text-sm font-medium text-success">Bet Placed Successfully</p>
            <p className="text-xs text-success/70 font-mono mt-1">
              {isTestMode ? 'Test Mode (STcoin)' : `Routed via ${market.provider}`}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
