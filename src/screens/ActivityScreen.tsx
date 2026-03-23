import React from 'react';
import { Activity } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

export const ActivityScreen = () => {
  const { bets } = useAppContext();
  
  if (bets.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col px-6 min-h-[60vh]">
        <div className="w-16 h-16 rounded-full bg-pearl flex items-center justify-center mb-4">
          <Activity className="w-8 h-8 text-ink-light" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-medium text-ink mb-2">No Active Bets</h2>
        <p className="text-sm text-ink-light text-center">Your prediction history and active positions will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar px-5 pt-4 pb-24">
      <h2 className="text-xl font-bold text-ink mb-6">Your Activity</h2>
      <div className="flex flex-col gap-3">
        {bets.map(bet => (
          <div key={bet.id} className="glass-card p-4 flex flex-col gap-2">
            <div className="flex justify-between items-start">
              <h3 className="text-sm font-medium text-ink line-clamp-2 pr-4">{bet.marketTitle}</h3>
              <span className="text-xs font-semibold bg-pearl px-2 py-1 rounded-md text-ink-light whitespace-nowrap">
                {bet.status}
              </span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-1 rounded-md ${bet.outcome === 'Yes' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                  {bet.outcome}
                </span>
                <span className="text-sm font-mono text-ink-light">{bet.amount} {bet.currency}</span>
              </div>
              <span className="text-xs text-ink-light opacity-60">
                {new Date(bet.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
