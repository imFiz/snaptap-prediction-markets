import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, User, Flag, Flame, AlertCircle } from 'lucide-react';
import { Fixture } from '../adapters/txodds';
import { eventsApi, LiveEvent, LivePlayer, LiveTeamRoster, LiveStats } from '../adapters/eventsApi';
import { getTeamRoster, Player } from '../utils/rosterData';
import { feedback } from '../utils/feedback';

const COUNTRY_ISO: Record<string, string> = {
  'England': 'gb-eng', 'France': 'fr', 'Germany': 'de', 'Spain': 'es',
  'Portugal': 'pt', 'Brazil': 'br', 'Argentina': 'ar', 'Croatia': 'hr',
  'Netherlands': 'nl', 'Belgium': 'be', 'Uruguay': 'uy', 'Japan': 'jp',
  'South Korea': 'kr', 'Morocco': 'ma', 'Senegal': 'sn', 'Ghana': 'gh',
  'Cameroon': 'cm', 'Nigeria': 'ng', 'Egypt': 'eg', 'Algeria': 'dz',
  'Tunisia': 'tn', 'Colombia': 'co', 'Mexico': 'mx', 'USA': 'us',
  'Canada': 'ca', 'Ecuador': 'ec', 'Peru': 'pe', 'Chile': 'cl',
  'Paraguay': 'py', 'Bolivia': 'bo', 'Venezuela': 've', 'Panama': 'pa',
  'Costa Rica': 'cr', 'Honduras': 'hn', 'Jamaica': 'jm', 'Trinidad and Tobago': 'tt',
  'Iran': 'ir', 'Saudi Arabia': 'sa', 'Qatar': 'qa', 'Australia': 'au',
  'New Zealand': 'nz', 'China': 'cn', 'Indonesia': 'id', 'Vietnam': 'vn',
  'Uzbekistan': 'uz', 'Jordan': 'jo', 'Iraq': 'iq', 'Syria': 'sy',
  'Kuwait': 'kw', 'Bahrain': 'bh', 'Switzerland': 'ch', 'Austria': 'at',
  'Denmark': 'dk', 'Sweden': 'se', 'Norway': 'no', 'Poland': 'pl',
  'Czech Republic': 'cz', 'Serbia': 'rs', 'Slovakia': 'sk', 'Hungary': 'hu',
  'Romania': 'ro', 'Greece': 'gr', 'Turkey': 'tr', 'Ukraine': 'ua',
  'Scotland': 'gb-sct', 'Wales': 'gb-wls', 'Ireland': 'ie', 'Albania': 'al',
  'Slovenia': 'si', 'Georgia': 'ge', 'South Africa': 'za'
};

const TeamFlag = ({ name, size = 16 }: { name: string; size?: number }) => {
  const iso = COUNTRY_ISO[name];
  if (!iso) return <span className="text-xs">🏳️</span>;
  return (
    <img 
      src={`https://flagcdn.com/w80/${iso}.png`} 
      alt={name} 
      style={{ width: size, height: Math.round(size * 0.65) }}
      className="inline-block object-cover rounded-xs border border-white/20"
    />
  );
};

const FIFA_CODES: Record<string, string> = {
  'Argentina': 'ARG', 'France': 'FRA', 'Brazil': 'BRA', 'England': 'ENG',
  'Germany': 'GER', 'Spain': 'ESP', 'Portugal': 'POR', 'South Africa': 'RSA',
  'Canada': 'CAN', 'Croatia': 'CRO', 'Netherlands': 'NED', 'Belgium': 'BEL',
  'Uruguay': 'URU', 'Japan': 'JPN', 'South Korea': 'KOR', 'Morocco': 'MAR',
  'Senegal': 'SEN', 'USA': 'USA', 'Mexico': 'MEX', 'Italy': 'ITA',
  'Ukraine': 'UKR', 'Poland': 'POL', 'Sweden': 'SWE', 'Denmark': 'DEN',
  'Switzerland': 'SUI'
};

const getFifaCode = (teamName: string): string => {
  const normalized = Object.keys(FIFA_CODES).find(k => k.toLowerCase() === teamName.toLowerCase());
  if (normalized) return FIFA_CODES[normalized];
  return teamName.slice(0, 3).toUpperCase();
};

interface MatchCenterProps {
  fixture: Fixture;
  isTestMode: boolean;
  onScoreUpdate?: (score: { home: number; away: number }) => void;
}

export const MatchCenter = ({ fixture, isTestMode, onScoreUpdate }: MatchCenterProps) => {
  // Real-time API States
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [liveScore, setLiveScore] = useState<{ home: number; away: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // Dynamic Roster state to allow substitutions/swaps in real-time
  const [homeRosterState, setHomeRosterState] = useState<LiveTeamRoster | null>(null);
  const [awayRosterState, setAwayRosterState] = useState<LiveTeamRoster | null>(null);

  // Persistent visual states on the pitch
  const [cardedPlayers, setCardedPlayers] = useState<Record<string, 'yellow' | 'red'>>({});
  const [substitutedPlayers, setSubsubstitutedPlayers] = useState<Record<string, string>>({}); // original -> replacement

  // Selected player for stats popover
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);

  // Pitch action highlight states
  const [highlightedPlayerName, setHighlightedPlayerName] = useState<string | null>(null);
  const [activeGoalFlash, setActiveGoalFlash] = useState<{ team: 'home' | 'away' | 'unknown'; player: string } | null>(null);
  const [activeCardFlash, setActiveCardFlash] = useState<{ type: 'yellow' | 'red'; player: string } | null>(null);
  const [activeSubFlash, setActiveSubFlash] = useState<{ playerOut: string; playerIn: string } | null>(null);
  const [activeFoulFlash, setActiveFoulFlash] = useState<string | null>(null); // player name
  const [ballAnimation, setBallAnimation] = useState<{ fromX: number; fromY: number; toX: number; toY: number } | null>(null);
  const [cornerAnimation, setCornerAnimation] = useState<{ corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' } | null>(null);

  const lastEventIdRef = useRef<string | null>(null);

  // Poll live match data if the match is Live
  useEffect(() => {
    let mounted = true;

    const fetchLiveMatchData = async () => {
      if (fixture.status !== 'Live' && fixture.status !== 'Finished') {
        setLoading(false);
        return;
      }

      try {
        const data = await eventsApi.getMatchLiveData(fixture);
        if (mounted) {
          setLiveEvents(data.events);
          setLiveStats(data.stats);
          if (data.score) {
            setLiveScore(data.score);
            if (onScoreUpdate) onScoreUpdate(data.score);
          }

          // Initialize lineups dynamically once from the live API
          if (data.rosters) {
            setHomeRosterState(prev => prev || data.rosters!.home);
            setAwayRosterState(prev => prev || data.rosters!.away);
          }

          setLoading(false);

          // Process commentary logs sequentially to build pitch annotations (cards, substitutions, etc.)
          if (data.events.length > 0) {
            // Read events in chronological order to build state up
            const sortedEvents = [...data.events].reverse();
            processEventState(sortedEvents);

            // Trigger animations for the latest event
            const latestEvent = data.events[0];
            if (latestEvent.id !== lastEventIdRef.current) {
              lastEventIdRef.current = latestEvent.id;
              triggerAnimationForEvent(latestEvent);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load match center data:', err);
        if (mounted) setLoading(false);
      }
    };

    fetchLiveMatchData();
    if (fixture.status === 'Live') {
      const interval = setInterval(fetchLiveMatchData, 15000); // Fast updates for timeline sync
      return () => {
        mounted = false;
        clearInterval(interval);
      };
    } else {
      return () => {
        mounted = false;
      };
    }
  }, [fixture.id, fixture.status]);

  // Load static lineups if not live or if API rosters are empty
  const finalHomeRoster = (homeRosterState && homeRosterState.players && homeRosterState.players.length > 0)
    ? homeRosterState
    : getTeamRoster(fixture.homeTeam);
  const finalAwayRoster = (awayRosterState && awayRosterState.players && awayRosterState.players.length > 0)
    ? awayRosterState
    : getTeamRoster(fixture.awayTeam);

  // Helper to map formations into rows
  const getMappedPlayers = (roster: LiveTeamRoster | { formation: string; players: Player[] }, team: 'home' | 'away') => {
    const players = roster.players;
    const gk = players.filter(p => p.position === 'GK');
    const df = players.filter(p => p.position === 'DF');
    const mf = players.filter(p => p.position === 'MF');
    const fw = players.filter(p => p.position === 'FW');

    const rows = team === 'home'
      ? [
          { list: gk, y: 92 },
          { list: df, y: 79 },
          { list: mf, y: 67 },
          { list: fw, y: 56 }
        ]
      : [
          { list: gk, y: 8 },
          { list: df, y: 21 },
          { list: mf, y: 33 },
          { list: fw, y: 44 }
        ];

    return rows.flatMap(row => {
      const count = row.list.length;
      return row.list.map((player, idx) => {
        const step = count > 1 ? 72 / (count - 1) : 0;
        const x = count > 1 ? 14 + idx * step : 50;
        return { player, x, y: row.y };
      });
    });
  };

  const homeFieldPlayers = getMappedPlayers(finalHomeRoster, 'home');
  const awayFieldPlayers = getMappedPlayers(finalAwayRoster, 'away');

  // Parse all past commentary events to build the persistent state (who has cards, substitutions, etc.)
  const processEventState = (events: LiveEvent[]) => {
    const cards: Record<string, 'yellow' | 'red'> = {};
    const subs: Record<string, string> = {};

    events.forEach(ev => {
      const text = ev.text;
      const lower = text.toLowerCase();

      // Find player names in card events
      if (ev.type === 'card') {
        const allPlayers = [...homeFieldPlayers, ...awayFieldPlayers];
        const matched = allPlayers.find(p => {
          const lastName = p.player.name.split(' ').pop()?.toLowerCase();
          return lastName && lower.includes(lastName);
        });

        if (matched) {
          const isRed = lower.includes('red');
          cards[matched.player.name] = isRed ? 'red' : 'yellow';
        }
      }

      // Check for substitution events: "X replaces Y" or "X subbed out for Y"
      if (ev.type === 'sub') {
        const allPlayers = [...homeFieldPlayers, ...awayFieldPlayers];
        // Try to identify both players. Usually written as "InPlayer replaces OutPlayer"
        const matchedOut = allPlayers.find(p => {
          const lastName = p.player.name.split(' ').pop()?.toLowerCase();
          return lastName && lower.includes(lastName) && (lower.includes('replaces') || lower.includes('for '));
        });

        if (matchedOut) {
          // Extract replacement name from text (naively or if capitalized)
          // Simple replacement tracker
          subs[matchedOut.player.name] = 'Substituted';
        }
      }
    });

    setCardedPlayers(cards);
  };

  // Trigger transient animations for latest event
  const triggerAnimationForEvent = (event: LiveEvent) => {
    const text = event.text;
    const lower = text.toLowerCase();
    const allPlayers = [...homeFieldPlayers, ...awayFieldPlayers];

    // Identify which player is active in this event
    const activePlayer = allPlayers.find(p => {
      const lastName = p.player.name.split(' ').pop()?.toLowerCase();
      return lastName && lower.includes(lastName);
    });

    if (activePlayer) {
      setHighlightedPlayerName(activePlayer.player.name);
      setTimeout(() => setHighlightedPlayerName(null), 3000);
    }

    if (event.type === 'goal') {
      feedback.playGoalCelebration();
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

      const team = activePlayer 
        ? (homeFieldPlayers.some(p => p.player.name === activePlayer.player.name) ? 'home' : 'away')
        : 'unknown';
      const startX = activePlayer ? activePlayer.x : 50;
      const startY = activePlayer ? activePlayer.y : 50;
      const endY = team === 'home' ? 5 : 95;

      setBallAnimation({ fromX: startX, fromY: startY, toX: 50, toY: endY });
      setTimeout(() => {
        setBallAnimation(null);
        setActiveGoalFlash({ 
          team, 
          player: activePlayer ? activePlayer.player.name : 'Goal scored!'
        });
        setTimeout(() => setActiveGoalFlash(null), 3500);
      }, 700);
    } 
    else if (event.type === 'card') {
      const isRed = lower.includes('red');
      setActiveCardFlash({
        type: isRed ? 'red' : 'yellow',
        player: activePlayer ? activePlayer.player.name : 'Player Warning'
      });
      setTimeout(() => setActiveCardFlash(null), 3000);
    }
    else if (event.type === 'sub') {
      // Show substitution exchange visual
      setActiveSubFlash({
        playerOut: activePlayer ? activePlayer.player.name : 'Player Out',
        playerIn: 'Replacement player'
      });
      setTimeout(() => setActiveSubFlash(null), 3000);
    }
    else if (event.type === 'foul') {
      if (activePlayer) {
        setActiveFoulFlash(activePlayer.player.name);
        setTimeout(() => setActiveFoulFlash(null), 2500);
      }
    }
    else if (event.type === 'corner') {
      // Flash corner based on match text
      const corner = lower.includes('left') ? 'top-left' : 'top-right';
      setCornerAnimation({ corner });
      setTimeout(() => setCornerAnimation(null), 2000);
    }
  };

  return (
    <div className="mt-4 border-t border-pearl-dark pt-5">
      {/* 2-Column Desktop Grid Layout: Pitch (Left) & Commentary/Stats (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Visual Pitch Display */}
        <div className="lg:col-span-7 flex flex-col">
          {/* TV-style Scoreboard header bar above the pitch (fluid layout with grouped center circles to prevent overlap) */}
          <div className="flex items-center justify-between bg-black/85 backdrop-blur-md text-cream text-[10px] sm:text-xs font-black px-4 py-2.5 rounded-2xl border border-white/10 mb-3 select-none">
            {/* Left: Home Team info */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-start">
              <TeamFlag name={fixture.homeTeam} size={28} />
              <span className="text-cream text-[10px] sm:text-[11px] font-mono tracking-wide truncate">
                {getFifaCode(fixture.homeTeam)} <span className="text-cream/50">({finalHomeRoster.formation})</span>
              </span>
            </div>

            {/* Center: Grouped jerseys + VS (guarantees fixed gap and zero overlap) */}
            <div className="flex items-center gap-2.5 shrink-0 px-3">
              <span className="w-5 h-5 rounded-full bg-primary border-2 border-cream shadow-xs shrink-0 flex" />
              <span className="text-[9px] text-cream/40 uppercase tracking-widest font-mono select-none">VS</span>
              <span className="w-5 h-5 rounded-full bg-cream border-2 border-primary shadow-xs shrink-0 flex" />
            </div>

            {/* Right: Away Team info */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end text-right">
              <span className="text-cream text-[10px] sm:text-[11px] font-mono tracking-wide truncate">
                {getFifaCode(fixture.awayTeam)} <span className="text-cream/50">({finalAwayRoster.formation})</span>
              </span>
              <TeamFlag name={fixture.awayTeam} size={28} />
            </div>
          </div>

          <div className="relative w-full aspect-[3/4] bg-emerald-700 rounded-3xl overflow-hidden border border-emerald-800 shadow-2xl flex flex-col p-4 select-none">
            
            {/* Grass stripes */}
            <div className="absolute inset-0 flex flex-col pointer-events-none">
              {Array.from({ length: 8 }).map((_, i) => (
                <div 
                  key={i} 
                  className={`flex-1 ${i % 2 === 0 ? 'bg-emerald-700/20' : 'bg-emerald-600/10'}`} 
                />
              ))}
            </div>

            {/* SVG line markings */}
            <svg className="absolute inset-0 w-full h-full stroke-white/40 fill-none pointer-events-none" strokeWidth="1.5">
              <rect x="12" y="12" width="calc(100% - 24px)" height="calc(100% - 24px)" />
              <line x1="12" y1="50%" x2="calc(100% - 12px)" y2="50%" />
              <circle cx="50%" cy="50%" r="40" />
              <circle cx="50%" cy="50%" r="2" fill="white" />
              {/* Penalty boxes */}
              <rect x="22%" y="12" width="56%" height="15%" />
              <rect x="35%" y="12" width="30%" height="5%" />
              <rect x="22%" y="calc(85% - 12px)" width="56%" height="15%" />
              <rect x="35%" y="calc(95% - 12px)" width="30%" height="5%" />
            </svg>

            {/* Goals */}
            <div className="absolute top-1 left-[35%] right-[35%] h-2 border-x-2 border-b-2 border-white/50 bg-white/20 rounded-b-sm" />
            <div className="absolute bottom-1 left-[35%] right-[35%] h-2 border-x-2 border-t-2 border-white/50 bg-white/20 rounded-t-sm" />

            {/* Corners visual indicator */}
            {cornerAnimation && (
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: [1, 1.4, 1], opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className={`absolute w-12 h-12 border-2 border-warning rounded-full pointer-events-none ${
                  cornerAnimation.corner === 'top-left' ? 'top-1 left-1' :
                  cornerAnimation.corner === 'top-right' ? 'top-1 right-1' :
                  cornerAnimation.corner === 'bottom-left' ? 'bottom-1 left-1' : 'bottom-1 right-1'
                }`}
              />
            )}

            {/* Home Team players */}
            {homeFieldPlayers.map(({ player, x, y }) => {
              const isHighlighted = highlightedPlayerName === player.name;
              const card = cardedPlayers[player.name];
              const isFouled = activeFoulFlash === player.name;

              return (
                <button
                  key={player.name}
                  onClick={() => {
                    feedback.playClick();
                    setSelectedPlayer(player);
                  }}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group active:scale-95 transition-transform z-10"
                >
                  <div className="relative">
                    <motion.div 
                      animate={isHighlighted ? { scale: [1, 1.25, 1], rotate: [0, 5, -5, 0] } : {}}
                      transition={{ duration: 0.5 }}
                      className={`w-7.5 h-7.5 rounded-full flex items-center justify-center text-xs font-black border-2 shadow-md transition-all ${
                        isHighlighted 
                          ? 'bg-amber-400 border-white text-ink shadow-[0_0_15px_rgba(251,191,36,0.8)] scale-110'
                          : 'bg-primary border-cream text-cream group-hover:scale-105'
                      }`}
                    >
                      {player.number}
                    </motion.div>

                    {/* Persistent Card indicators next to jersey */}
                    {card && (
                      <span className={`absolute -top-1.5 -right-1.5 w-3.5 h-4.5 rounded-xs border border-white/20 shadow-sm ${
                        card === 'red' ? 'bg-red-500' : 'bg-yellow-400'
                      }`} />
                    )}

                    {/* Temporary Foul Whistle Flasher */}
                    {isFouled && (
                      <motion.span 
                        animate={{ scale: [0.8, 1.3, 1], opacity: [0, 1, 0] }}
                        className="absolute -top-4 left-1/2 -translate-x-1/2 text-sm bg-ink/90 rounded-full px-1 py-0.5"
                      >
                        🛑
                      </motion.span>
                    )}
                  </div>
                  <span className="text-[8px] font-semibold text-cream bg-ink/75 px-1.5 py-0.5 rounded-full mt-1 border border-white/10 group-hover:bg-ink max-w-[65px] truncate">
                    {player.name.split(' ').pop()}
                  </span>
                </button>
              );
            })}

            {/* Away Team players */}
            {awayFieldPlayers.map(({ player, x, y }) => {
              const isHighlighted = highlightedPlayerName === player.name;
              const card = cardedPlayers[player.name];
              const isFouled = activeFoulFlash === player.name;

              return (
                <button
                  key={player.name}
                  onClick={() => {
                    feedback.playClick();
                    setSelectedPlayer(player);
                  }}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group active:scale-95 transition-transform z-10"
                >
                  <div className="relative">
                    <motion.div 
                      animate={isHighlighted ? { scale: [1, 1.25, 1], rotate: [0, 5, -5, 0] } : {}}
                      transition={{ duration: 0.5 }}
                      className={`w-7.5 h-7.5 rounded-full flex items-center justify-center text-xs font-black border-2 shadow-md transition-all ${
                        isHighlighted 
                          ? 'bg-amber-400 border-white text-ink shadow-[0_0_15px_rgba(251,191,36,0.8)] scale-110'
                          : 'bg-cream border-primary text-ink group-hover:scale-105'
                      }`}
                    >
                      {player.number}
                    </motion.div>

                    {/* Persistent Card indicators next to jersey */}
                    {card && (
                      <span className={`absolute -top-1.5 -right-1.5 w-3.5 h-4.5 rounded-xs border border-white/20 shadow-sm ${
                        card === 'red' ? 'bg-red-500' : 'bg-yellow-400'
                      }`} />
                    )}

                    {/* Temporary Foul Whistle Flasher */}
                    {isFouled && (
                      <motion.span 
                        animate={{ scale: [0.8, 1.3, 1], opacity: [0, 1, 0] }}
                        className="absolute -top-4 left-1/2 -translate-x-1/2 text-sm bg-ink/90 rounded-full px-1 py-0.5"
                      >
                        🛑
                      </motion.span>
                    )}
                  </div>
                  <span className="text-[8px] font-semibold text-cream bg-ink/75 px-1.5 py-0.5 rounded-full mt-1 border border-white/10 group-hover:bg-ink max-w-[65px] truncate">
                    {player.name.split(' ').pop()}
                  </span>
                </button>
              );
            })}

            {/* Travelling Soccer Ball */}
            {ballAnimation && (
              <motion.div
                initial={{ left: `${ballAnimation.fromX}%`, top: `${ballAnimation.fromY}%`, scale: 0.8 }}
                animate={{ left: `${ballAnimation.toX}%`, top: `${ballAnimation.toY}%`, scale: [0.8, 1.2, 0.9] }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-cream border border-ink rounded-full flex items-center justify-center shadow-lg pointer-events-none z-20"
              >
                ⚽
              </motion.div>
            )}

            {/* Goal Celebrations Screen Banner */}
            <AnimatePresence>
              {activeGoalFlash && (
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.4, opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-30 p-6 text-center select-none pointer-events-none"
                >
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ repeat: Infinity, duration: 0.5 }}
                    className="text-amber-400 text-6xl font-black tracking-widest drop-shadow-[0_4px_12px_rgba(245,158,11,0.5)] font-mono"
                  >
                    GOAL!
                  </motion.div>
                  <div className="text-xl font-bold text-cream mt-3">
                    ⚽ {activeGoalFlash.player}
                  </div>
                  <div className="text-xs text-cream/70 uppercase tracking-widest mt-1">
                    {activeGoalFlash.team === 'home' ? fixture.homeTeam : 
                     activeGoalFlash.team === 'away' ? fixture.awayTeam : ''}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Card Alerts Screen overlay */}
            <AnimatePresence>
              {activeCardFlash && (
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.2, opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 backdrop-blur-xs z-30 select-none pointer-events-none"
                >
                  <div className={`w-14 h-20 rounded-lg shadow-2xl flex items-center justify-center border border-white/20 ${
                    activeCardFlash.type === 'red' ? 'bg-red-500' : 'bg-yellow-400'
                  }`}>
                    <span className="text-2xl font-bold text-white">⚠️</span>
                  </div>
                  <div className="text-sm font-bold text-cream mt-3">{activeCardFlash.player}</div>
                  <div className="text-[10px] text-cream/80 uppercase tracking-widest mt-0.5">
                    {activeCardFlash.type === 'red' ? 'Red Card' : 'Yellow Card'}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Substitution Overlay */}
            <AnimatePresence>
              {activeSubFlash && (
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.2, opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-xs z-30 select-none pointer-events-none"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-600 border border-white/20 flex items-center justify-center text-3xl text-white shadow-2xl animate-spin-slow">
                    🔄
                  </div>
                  <div className="text-sm font-bold text-cream mt-4">Substitution</div>
                  <div className="text-xs text-cream/70 mt-1">{activeSubFlash.playerOut} replaced</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Selected player statistics popover */}
          <AnimatePresence>
            {selectedPlayer && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute left-6 right-6 bottom-6 bg-cream border border-pearl-dark rounded-2xl p-4 shadow-2xl z-45"
              >
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-pearl flex items-center justify-center text-xs font-bold text-ink">
                      #{selectedPlayer.number}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-ink">{selectedPlayer.name}</h4>
                      <span className="text-[10px] text-ink-light uppercase font-mono">{selectedPlayer.subPosition}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedPlayer(null)}
                    className="text-xs font-bold text-ink-light bg-pearl hover:bg-pearl-dark px-2.5 py-1 rounded-lg"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-ink">
                  <div className="bg-pearl/50 rounded-xl p-2">
                    <p className="text-[9px] text-ink-light">Position</p>
                    <p className="mt-0.5">{selectedPlayer.position}</p>
                  </div>
                  <div className="bg-pearl/50 rounded-xl p-2">
                    <p className="text-[9px] text-ink-light">Status</p>
                    <p className="mt-0.5 text-success">Starter</p>
                  </div>
                  <div className="bg-pearl/50 rounded-xl p-2">
                    <p className="text-[9px] text-ink-light">Role</p>
                    <p className="mt-0.5 text-primary">Active</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: Live Ticker Timeline & Stats (Visible Simultaneously!) */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          
          {/* Section 1: Live Play-by-Play Timeline */}
          <div className="bg-pearl/30 rounded-2xl border border-pearl-dark p-4 flex flex-col h-[280px]">
            <div className="flex items-center gap-2 pb-2 border-b border-pearl-dark mb-3">
              <Activity size={14} className="text-danger" />
              <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Live Commentary Feed</h4>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 hide-scrollbar">
              {loading ? (
                <div className="text-center text-xs text-ink-light/50 py-12 italic animate-pulse">
                  Connecting to commentary feed...
                </div>
              ) : liveEvents.length === 0 ? (
                <div className="text-center text-xs text-ink-light/50 py-12 italic flex flex-col items-center gap-1.5">
                  <AlertCircle size={16} className="text-ink-light/40" />
                  {fixture.status === 'Finished'
                    ? 'Commentary log unavailable for this match.'
                    : 'Live events will appear here when kickoff begins.'}
                </div>
              ) : (
                liveEvents.map(ev => (
                  <div key={ev.id} className="flex gap-2.5 text-xs items-start">
                    <span className="w-7 h-7 shrink-0 rounded-lg bg-pearl flex items-center justify-center text-sm shadow-xs border border-pearl-dark/50">
                      {ev.icon}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-mono font-bold text-ink">{ev.time}</span>
                      </div>
                      <p className={`leading-relaxed ${ev.type === 'goal' ? 'text-success font-black' : 'text-ink-light'}`}>
                        {ev.text}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Section 2: Real-time Stats Comparator */}
          <div className="bg-pearl/30 rounded-2xl border border-pearl-dark p-4 flex flex-col">
            <div className="pb-2.5 border-b border-pearl-dark/60 mb-3">
              <div className="flex justify-between items-center text-xs font-black text-ink font-mono">
                <div className="flex items-center gap-1.5">
                  <TeamFlag name={fixture.homeTeam} size={14} />
                  <span className="truncate tracking-wider">{getFifaCode(fixture.homeTeam)}</span>
                  <span className="w-4 h-4 rounded-full bg-primary border-2 border-cream shadow-xs shrink-0 flex" />
                </div>
                <span className="text-[10px] text-ink-light/40 uppercase tracking-widest font-mono">VS</span>
                <div className="flex items-center gap-1.5 text-right">
                  <span className="w-4 h-4 rounded-full bg-cream border-2 border-primary shadow-xs shrink-0 flex" />
                  <span className="truncate tracking-wider">{getFifaCode(fixture.awayTeam)}</span>
                  <TeamFlag name={fixture.awayTeam} size={14} />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="text-center text-xs text-ink-light/50 py-6 italic animate-pulse">
                Fetching stats...
              </div>
            ) : !liveStats ? (
              <div className="text-center text-xs text-ink-light/50 py-6 italic flex flex-col items-center gap-1">
                {fixture.status === 'Finished'
                  ? 'Stats unavailable for this match.'
                  : 'Real stats will update here during the match.'}
              </div>
            ) : (
              <div className="space-y-3.5">
                {/* Possession */}
                <div>
                  <div className="flex justify-between text-[11px] font-bold mb-1 text-ink">
                    <span>{liveStats.possession.home}%</span>
                    <span className="text-ink-light/60 font-medium">Possession</span>
                    <span>{liveStats.possession.away}%</span>
                  </div>
                  <div className="h-2 w-full bg-pearl-dark rounded-full overflow-hidden flex">
                    <div style={{ width: `${liveStats.possession.home}%` }} className="bg-primary h-full transition-all" />
                    <div style={{ width: `${liveStats.possession.away}%` }} className="bg-ink-light h-full transition-all" />
                  </div>
                </div>

                {/* Other stats comparison rows */}
                {[
                  { label: 'Total Shots', key: 'shots' },
                  { label: 'Shots on Target', key: 'shotsOnTarget' },
                  { label: 'Corners', key: 'corners' },
                  { label: 'Fouls Committed', key: 'fouls' },
                  { label: 'Yellow Cards', key: 'yellowCards' },
                ].map(item => {
                  const home = (liveStats as any)[item.key].home;
                  const away = (liveStats as any)[item.key].away;
                  const total = home + away || 1;
                  const homePct = (home / total) * 100;

                  return (
                    <div key={item.key}>
                      <div className="flex justify-between text-[11px] font-bold mb-1 text-ink">
                        <span>{home}</span>
                        <span className="text-ink-light/60 font-medium">{item.label}</span>
                        <span>{away}</span>
                      </div>
                      <div className="h-1.5 w-full bg-pearl-dark rounded-full overflow-hidden flex">
                        <div style={{ width: `${homePct}%` }} className="bg-primary h-full transition-all" />
                        <div style={{ width: `${100 - homePct}%` }} className="bg-ink-light h-full transition-all" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
