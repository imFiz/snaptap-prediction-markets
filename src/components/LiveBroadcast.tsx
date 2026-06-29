import React, { useState, useEffect } from 'react';
import { Radio, Activity } from 'lucide-react';
import { Fixture } from '../adapters/txodds';
import { eventsApi, LiveEvent } from '../adapters/eventsApi';

export const LiveBroadcast = ({ fixture, onScoreUpdate }: { fixture: Fixture, onScoreUpdate?: (score: { home: number, away: number }) => void }) => {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    const fetchEvents = async () => {
      const data = await eventsApi.getMatchLiveData(fixture);
      if (mounted) {
        if (data.events.length > 0) {
          setEvents(data.events);
        }
        if (data.score && onScoreUpdate) {
          onScoreUpdate(data.score);
        }
      }
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 30000); // Polling every 30 seconds for live updates
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fixture.id, fixture.homeTeam, fixture.awayTeam]);

  // Determine current match time from the first event (most recent)
  const currentTime = events.length > 0 && events[0].time ? events[0].time : 'Live';

  return (
    <div className="mt-4 border-t border-pearl-dark pt-4">
      {/* Header */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 mb-3 w-full"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-danger"></span>
        </span>
        <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Live Match Center</h4>
        <span className="text-[10px] text-ink-light font-mono ml-auto">{currentTime}'</span>
        <span className="text-ink-light text-xs">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {/* Live Ticker — always visible */}
      <div className="bg-pearl/30 rounded-xl border border-pearl-dark p-3 max-h-[160px] overflow-hidden flex flex-col relative">
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-pearl-dark/50">
          <Activity size={14} className="text-danger" />
          <span className="text-xs font-bold text-ink-light">Live Ticker</span>
          <span className="text-[10px] text-ink-light/50 ml-auto font-mono">{events.length} events</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 hide-scrollbar">
          {events.length === 0 ? (
            <div className="text-center text-xs text-ink-light/50 py-4 italic animate-pulse">
              Awaiting real-time match events...
            </div>
          ) : (
            events.map((ev, i) => (
              <div 
                key={ev.id} 
                className={`flex gap-2 text-xs py-1 transition-opacity duration-300 ${i === 0 ? 'opacity-100' : i < 3 ? 'opacity-70' : 'opacity-40'}`}
              >
                <span className="shrink-0">{ev.icon}</span>
                <span className="font-mono font-bold text-ink-light w-7 shrink-0">{ev.time}'</span>
                <span className={`flex-1 ${
                  ev.type === 'goal' ? 'text-success font-bold' : 
                  ev.type === 'card' ? 'text-warning font-semibold' : 
                  'text-ink'
                }`}>
                  {ev.text}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
