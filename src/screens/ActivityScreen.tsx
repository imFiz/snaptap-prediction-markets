import React, { useState } from 'react';
import { Activity, TrendingUp, Award, Clock, CheckCircle2, XCircle, ChevronRight, FlaskConical } from 'lucide-react';
import { useAppContext, Bet } from '../context/AppContext';
import { AggregatorService } from '../services/AggregatorService';
import { useWallet } from '@solana/wallet-adapter-react';
import { feedback } from '../utils/feedback';

export const ActivityScreen = () => {
  const { bets, claimReward, isTestMode } = useAppContext();
  const { publicKey, signTransaction } = useWallet();
  const [claimingId, setClaimingId] = useState<string | null>(null);

  // Filter bets based on current mode
  const displayedBets = bets.filter(bet => isTestMode ? bet.isTestBet : !bet.isTestBet);

  // Calculate stats for displayed bets
  const totalWagered = displayedBets.reduce((sum, bet) => {
    if (isTestMode) return sum + bet.amount; // STcoin is 1:1 for display
    const rate = AggregatorService.getConversionRate(bet.currency as any, 'USDC');
    return sum + (bet.amount * rate);
  }, 0);

  const pendingRewards = displayedBets
    .filter(b => b.status === 'Won')
    .reduce((sum, bet) => {
      if (isTestMode) return sum + bet.potentialPayout;
      const rate = AggregatorService.getConversionRate(bet.currency as any, 'USDC');
      return sum + (bet.potentialPayout * rate);
    }, 0);

  const activeCount = displayedBets.filter(b => b.status === 'Active').length;
  
  const resolvedCount = displayedBets.filter(b => b.status === 'Won' || b.status === 'Lost' || b.status === 'Claimed').length;
  const wonCount = displayedBets.filter(b => b.status === 'Won' || b.status === 'Claimed').length;
  const winRate = resolvedCount > 0 ? Math.round((wonCount / resolvedCount) * 100) : 0;

  const handleClaim = async (bet: Bet) => {
    if (!isTestMode && (!publicKey || !signTransaction)) {
      alert("Please connect your wallet to claim rewards.");
      return;
    }

    feedback.playClick();
    setClaimingId(bet.id);
    try {
      if (!isTestMode) {
        // 1. Get claim transaction from backend
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { base64Tx } = await AggregatorService.buildClaimTransaction(bet.id, publicKey!.toString());
        
        // 2. In a real app, we would deserialize and sign the transaction here
        // const tx = Transaction.from(Buffer.from(base64Tx, 'base64'));
        // await signTransaction(tx);
      }
      
      // 3. Mark as claimed in UI (handles both test and real)
      claimReward(bet.id);
      feedback.playSuccess();
    } catch (error) {
      console.error("Failed to claim:", error);
      alert("Failed to claim reward. Please try again.");
    } finally {
      setClaimingId(null);
    }
  };

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

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar px-5 pt-4 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-ink">Portfolio & Activity</h2>
        {isTestMode && (
          <span className="text-[10px] font-bold bg-warning text-cream px-2 py-1 rounded-md flex items-center gap-1">
            <FlaskConical size={12} />
            TEST MODE
          </span>
        )}
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
            {isTestMode ? "No Test Bets" : "No Active Bets"}
          </h2>
          <p className="text-sm text-ink-light text-center">
            {isTestMode 
              ? "Your STcoin prediction history will appear here." 
              : "Your prediction history and active positions will appear here."}
          </p>
        </div>
      ) : (
        <>
          {/* Stats Dashboard */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            <div className="glass-card p-4 flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-light uppercase tracking-wider">Pending Rewards</span>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-success">
                  {isTestMode ? '' : '$'}{pendingRewards.toFixed(2)}
                </span>
                {isTestMode && <span className="text-xs font-mono text-ink-light mb-1">STcoin</span>}
              </div>
            </div>
            
            <div className="glass-card p-4 flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-light uppercase tracking-wider">Total Wagered</span>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-ink">
                  {isTestMode ? '' : '$'}{totalWagered.toFixed(2)}
                </span>
                {isTestMode && <span className="text-xs font-mono text-ink-light mb-1">STcoin</span>}
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

          <h3 className="text-sm font-bold text-ink-light uppercase tracking-wider mb-4">Position History</h3>
          
          <div className="flex flex-col gap-3">
            {displayedBets.map(bet => (
              <div key={bet.id} className={`glass-card p-4 flex flex-col gap-3 border ${isTestMode ? 'border-warning/20' : 'border-pearl-dark/20'}`}>
                <div className="flex justify-between items-start gap-4">
                  <h3 className="text-sm font-medium text-ink line-clamp-2 flex-1">{bet.marketTitle}</h3>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${getStatusColor(bet.status)}`}>
                    {getStatusIcon(bet.status)}
                    <span className="text-[10px] font-bold uppercase tracking-wide">
                      {bet.status}
                    </span>
                  </div>
                </div>
                
                <div className="flex justify-between items-end mt-1">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-ink-light">Wager</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${bet.outcome === 'Yes' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                        {bet.outcome}
                      </span>
                      <span className="text-sm font-mono font-medium text-ink">{bet.amount} {bet.currency}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-ink-light">
                      {bet.status === 'Lost' ? 'Payout' : 'Potential Payout'}
                    </span>
                    <span className={`text-sm font-mono font-bold ${bet.status === 'Won' || bet.status === 'Claimed' ? 'text-success' : bet.status === 'Lost' ? 'text-ink-light' : 'text-ink'}`}>
                      {bet.status === 'Lost' ? '0.00' : bet.potentialPayout.toFixed(2)} {bet.currency}
                    </span>
                  </div>
                </div>

                {/* Claim Action Button */}
                {bet.status === 'Won' && (
                  <button 
                    onClick={() => handleClaim(bet)}
                    disabled={claimingId === bet.id}
                    className="mt-2 w-full py-2.5 bg-success text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-success/90 transition-colors disabled:opacity-70"
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
                )}
                
                <div className="text-[10px] text-ink-light opacity-60 mt-1">
                  {new Date(bet.timestamp).toLocaleString(undefined, { 
                    month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
