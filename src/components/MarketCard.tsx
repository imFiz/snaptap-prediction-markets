import React, { useState, useEffect } from 'react';
import { Currency, Market, AggregatorService } from '../services/AggregatorService';
import { motion, AnimatePresence } from 'motion/react';
import { Fingerprint, CheckCircle2, Loader2, X, Wallet, AlertTriangle, Info } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { feedback } from '../utils/feedback';
import { useAppContext } from '../context/AppContext';

interface MarketCardProps {
  market: Market;
  onBet: (eventId: string, optionId: string, outcome: 'Yes' | 'No', amount: number, currency: Currency) => Promise<void>;
}

export const MarketCard: React.FC<MarketCardProps> = ({ market, onBet }) => {
  const { connected, publicKey } = useWallet();
  const { isTestMode, testBalance, addBet } = useAppContext();
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<'Yes' | 'No' | null>(null);
  const [amount, setAmount] = useState<number>(100);
  const [currency, setCurrency] = useState<Currency>('USDC');
  const [isSigning, setIsSigning] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showRules, setShowRules] = useState(false);

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

  const handleBetClick = (optionId: string, outcome: 'Yes' | 'No', isActive: boolean) => {
    if (isSigning || isSuccess || !isActive) return;
    feedback.playClick();
    setSelectedOptionId(optionId);
    setSelectedOutcome(outcome);
  };

  const handleSign = async () => {
    if (!selectedOptionId || !selectedOutcome) return;
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
      const option = market.options.find(o => o.id === selectedOptionId);
      const price = selectedOutcome === 'Yes' ? option!.yesProbability : option!.noProbability;
      const potentialPayout = amount / price;
      
      addBet({
        marketId: selectedOptionId,
        marketTitle: `${market.title} - ${option!.title}`,
        outcome: selectedOutcome,
        amount,
        currency: 'STcoin',
        potentialPayout,
        isTestBet: true
      });
    } else {
      await onBet(market.id, selectedOptionId, selectedOutcome, amount, currency);
    }
    
    setIsSigning(false);
    setIsSuccess(true);
    feedback.playSuccess();
    
    setTimeout(() => {
      setIsSuccess(false);
      setSelectedOutcome(null);
      setSelectedOptionId(null);
    }, 3000);
  };

  const targetCurrency = market.provider === 'Drift' ? 'USDC' : 'USDC';
  const conversionRate = isTestMode ? 1 : AggregatorService.getConversionRate(currency, targetCurrency as Currency);
  const convertedAmount = amount * conversionRate;

  const isActive = market.status === 'active';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card p-5 mb-4 w-full flex flex-col relative overflow-hidden ${isTestMode ? 'border-warning/30' : ''} ${!isActive ? 'opacity-70' : ''}`}
    >
      {isTestMode && (
        <div className="absolute top-0 right-0 bg-warning text-cream text-[10px] font-bold px-3 py-1 rounded-bl-xl z-10 flex items-center gap-1">
          <AlertTriangle size={10} />
          TEST MODE
        </div>
      )}

      <div className="flex justify-between items-center mb-3 mt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wider uppercase text-ink-light bg-pearl px-2 py-1 rounded-md">
            {market.category}
          </span>
          {!isActive && (
            <span className="text-xs font-semibold tracking-wider uppercase text-danger bg-danger/10 px-2 py-1 rounded-md">
              {market.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-ink-light opacity-60">
            via {market.provider}
          </span>
        </div>
      </div>
      
      <h3 className="text-lg font-medium leading-tight mb-4 text-ink">
        {market.title}
      </h3>

      <button 
        onClick={() => setShowRules(!showRules)}
        className="flex items-center gap-2 text-sm font-medium text-ink bg-pearl hover:bg-pearl-dark transition-colors px-4 py-2.5 rounded-xl mb-5 w-full justify-center border border-pearl-dark shadow-sm"
      >
        <Info size={16} className="text-ink-light" />
        {showRules ? 'Hide Rules & Conditions' : 'View Rules & Conditions'}
      </button>

      <AnimatePresence>
        {showRules && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-5"
          >
            <div className="bg-pearl/50 rounded-xl p-4 text-sm text-ink-light leading-relaxed border border-pearl-dark">
              <p className="font-semibold mb-2 text-ink">Resolution Rules:</p>
              <p className="whitespace-pre-wrap">{market.rules || 'No specific rules provided.'}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="flex flex-col gap-3 mb-5 max-h-[300px] overflow-y-auto hide-scrollbar pr-1">
        {[...market.options].sort((a, b) => {
          const aIsActive = a.status === 'active' && a.yesProbability > 0 && a.yesProbability < 100;
          const bIsActive = b.status === 'active' && b.yesProbability > 0 && b.yesProbability < 100;
          if (aIsActive && !bIsActive) return -1;
          if (!aIsActive && bIsActive) return 1;
          if (aIsActive && bIsActive) return b.yesProbability - a.yesProbability;
          return 0;
        }).map(option => {
          const isOptionActive = option.status === 'active' && option.yesProbability > 0 && option.yesProbability < 100;
          const isSelectedYes = selectedOptionId === option.id && selectedOutcome === 'Yes';
          const isSelectedNo = selectedOptionId === option.id && selectedOutcome === 'No';

          return (
            <div key={option.id} className={`flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 rounded-xl border transition-colors ${!isOptionActive ? 'bg-pearl/30 border-pearl/50 opacity-70' : 'bg-pearl/50 border-pearl-dark hover:border-pearl-dark/80'}`}>
              <div className="font-medium text-sm text-ink mb-3 sm:mb-0 pr-4 flex flex-wrap items-center gap-2">
                {option.title}
                {!isOptionActive && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${option.status === 'resolved' ? 'bg-success/20 text-success' : 'bg-danger/10 text-danger'}`}>
                    {option.status === 'resolved' ? `Resolved: ${option.resolution?.toUpperCase() || 'DONE'}` : 'Closed'}
                  </span>
                )}
              </div>
              <div className="flex gap-2 w-full sm:w-auto shrink-0">
                <button 
                  onClick={() => handleBetClick(option.id, 'Yes', isOptionActive)}
                  disabled={!isOptionActive}
                  className={`flex-1 sm:w-20 py-2 rounded-lg border transition-all duration-200 flex flex-col items-center justify-center ${
                    isSelectedYes 
                      ? 'bg-ink text-cream border-ink shadow-md scale-[1.02]' 
                      : `bg-cream border-pearl-dark text-ink ${isOptionActive ? 'hover:bg-pearl-dark' : 'cursor-not-allowed'}`
                  }`}
                >
                  <span className="font-semibold text-xs">Buy Yes</span>
                  <span className="text-[10px] opacity-70 mt-0.5">{option.yesProbability}%</span>
                </button>
                
                <button 
                  onClick={() => handleBetClick(option.id, 'No', isOptionActive)}
                  disabled={!isOptionActive}
                  className={`flex-1 sm:w-20 py-2 rounded-lg border transition-all duration-200 flex flex-col items-center justify-center ${
                    isSelectedNo 
                      ? 'bg-ink text-cream border-ink shadow-md scale-[1.02]' 
                      : `bg-cream border-pearl-dark text-ink ${isOptionActive ? 'hover:bg-pearl-dark' : 'cursor-not-allowed'}`
                  }`}
                >
                  <span className="font-semibold text-xs">Buy No</span>
                  <span className="text-[10px] opacity-70 mt-0.5">{option.noProbability}%</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center text-xs text-ink-light font-mono opacity-70">
        <span>Pool: {formatCurrency(market.poolSize)}</span>
        <span>Ends: {new Date(market.closingTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      </div>

      {/* Betting Overlay */}
      <AnimatePresence>
        {selectedOutcome && selectedOptionId && !isSuccess && isActive && (
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
                    setSelectedOptionId(null);
                  }
                }}
                className="absolute top-2 right-2 text-ink-light p-1 hover:text-ink transition-colors"
              >
                <X size={16} />
              </button>

              <div className="text-center mb-4 px-6">
                <p className="text-sm font-medium text-ink mb-1">{market.options.find(o => o.id === selectedOptionId)?.title}</p>
                <p className="text-xs text-ink-light">Outcome: <span className={`font-bold ${selectedOutcome === 'Yes' ? 'text-success' : 'text-danger'}`}>{selectedOutcome}</span></p>
              </div>

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
