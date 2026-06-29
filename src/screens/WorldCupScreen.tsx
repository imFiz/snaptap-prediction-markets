import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Clock, AlertCircle, FlaskConical, Zap, RefreshCw, Search, X, Bell } from 'lucide-react';
import { txOddsAdapter, Fixture, OddsOffer } from '../adapters/txodds';
import { eventsApi } from '../adapters/eventsApi';
import { ResultsDB } from '../adapters/resultsDb';
import { feedback } from '../utils/feedback';
import { useAppContext } from '../context/AppContext';
import { BetSlip } from '../components/BetSlip';
import { MatchCenter } from '../components/MatchCenter';

// Country flag helper using flagcdn.com by ISO 3166-1 alpha-2
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
  'Slovenia': 'si', 'Georgia': 'ge', 'Cape Verde': 'cv', 'Cabo Verde': 'cv',
  'Congo DR': 'cd', 'DR Congo': 'cd', 'Mali': 'ml', 'Ivory Coast': 'ci',
  "Côte d'Ivoire": 'ci', 'South Africa': 'za', 'Tanzania': 'tz', 'Sudan': 'sd',
  'Ethiopia': 'et', 'Kenya': 'ke', 'Guatemala': 'gt', 'El Salvador': 'sv',
  'Haiti': 'ht', 'Cuba': 'cu', 'Dominican Republic': 'do', 'Italy': 'it',
  'Russia': 'ru', 'Finland': 'fi', 'Iceland': 'is', 'Israel': 'il',
};

const TeamFlag = ({ name, size = 56 }: { name: string; size?: number }) => {
  const iso = COUNTRY_ISO[name];
  const [imgError, setImgError] = useState(false);
  const abbr = name.substring(0, 3).toUpperCase();

  if (!iso || imgError) {
    return (
      <div
        style={{ width: size, height: size }}
        className="mx-auto bg-gradient-to-br from-pearl to-pearl-dark rounded-2xl flex items-center justify-center shadow-sm"
      >
        <span className="text-lg font-black text-ink">{abbr}</span>
      </div>
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className="mx-auto rounded-2xl overflow-hidden shadow-sm flex items-center justify-center bg-pearl"
    >
      <img
        src={`https://flagcdn.com/w80/${iso}.png`}
        alt={name}
        style={{ width: size, height: size, objectFit: 'cover' }}
        onError={() => setImgError(true)}
      />
    </div>
  );
};

// Countdown timer
const useCountdown = (targetMs: number) => {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const tick = () => {
      const diff = targetMs - Date.now();
      if (diff <= 0) { setTimeLeft(''); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      if (h > 24) {
        const d = Math.floor(h / 24);
        setTimeLeft(`${d}d ${h % 24}h`);
      } else if (h > 0) {
        setTimeLeft(`${h}h ${m}m`);
      } else {
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${m}m ${s}s`);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs]);
  return timeLeft;
};

// Refresh progress bar
const RefreshBar = ({ intervalMs }: { intervalMs: number }) => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      setProgress(((Date.now() - start) % intervalMs) / intervalMs * 100);
    }, 500);
    return () => clearInterval(id);
  }, [intervalMs]);
  return (
    <div className="h-0.5 w-full bg-ink/5 overflow-hidden">
      <div
        className="h-full bg-primary/40 transition-none"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
};

export const WorldCupScreen = () => {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'finished'>('upcoming');
  const [searchQuery, setSearchQuery] = useState('');
  const { isTestMode } = useAppContext();

  const fetchFixtures = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const data = await txOddsAdapter.getLiveFixtures();
      setFixtures(data);
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    fetchFixtures();
    const interval = setInterval(() => fetchFixtures(true), 30000);
    return () => clearInterval(interval);
  }, []);

  const liveCount = fixtures.filter(f => f.status === 'Live').length;

  // Filter fixtures by tab and search, merging historical ResultsDB entries for finished tab
  const filteredFixtures = useMemo(() => {
    if (activeTab === 'finished') {
      const apiFinished = fixtures.filter(f => f.status === 'Finished');
      const allDbResults = ResultsDB.getAllResults();
      const mergedFinished = [...apiFinished];
      
      const getStableId = (str: string) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash);
      };

      Object.entries(allDbResults).forEach(([key, scoreVal]) => {
        const parts = key.split('-');
        if (parts.length === 2) {
          const home = parts[0];
          const away = parts[1];
          
          const exists = apiFinished.some(f => 
            (f.homeTeam.toLowerCase() === home.toLowerCase() && f.awayTeam.toLowerCase() === away.toLowerCase()) ||
            (f.homeTeam.toLowerCase() === away.toLowerCase() && f.awayTeam.toLowerCase() === home.toLowerCase())
          );
          
          if (!exists) {
            let matchDate = new Date('2026-06-27T18:00:00Z');
            let compName = 'World Cup - Group Stage';
            
            // Customize dates for some well-known matches
            if (key === 'Jordan-Argentina' || key === 'Algeria-Austria') {
              matchDate = new Date('2026-06-28T07:00:00Z');
              compName = 'World Cup - Round of 32';
            } else if (key.includes('England') || key.includes('Croatia') || key.includes('Ghana') || key.includes('Panama')) {
              matchDate = new Date('2026-06-27T16:00:00Z');
              compName = 'World Cup - Group L';
            } else if (key.includes('Colombia') || key.includes('Portugal') || key.includes('Congo DR') || key.includes('Uzbekistan')) {
              matchDate = new Date('2026-06-27T14:00:00Z');
              compName = 'World Cup - Group K';
            }
            
            mergedFinished.push({
              id: getStableId(key),
              homeTeam: home,
              awayTeam: away,
              startTime: matchDate.toISOString(),
              startTimeMs: matchDate.getTime(),
              status: 'Finished',
              competition: compName,
              score: scoreVal
            });
          }
        }
      });

      const sortedFinished = mergedFinished.sort((a, b) => b.startTimeMs - a.startTimeMs);

      if (!searchQuery.trim()) return sortedFinished;
      const q = searchQuery.toLowerCase();
      return sortedFinished.filter(f =>
        f.homeTeam.toLowerCase().includes(q) ||
        f.awayTeam.toLowerCase().includes(q) ||
        (f.competition && f.competition.toLowerCase().includes(q))
      );
    } else {
      const upcoming = fixtures.filter(f => f.status !== 'Finished');
      if (!searchQuery.trim()) return upcoming;
      const q = searchQuery.toLowerCase();
      return upcoming.filter(f =>
        f.homeTeam.toLowerCase().includes(q) ||
        f.awayTeam.toLowerCase().includes(q) ||
        (f.competition && f.competition.toLowerCase().includes(q))
      );
    }
  }, [fixtures, activeTab, searchQuery]);

  // Group fixtures by competition/round for Results tab
  const groupedFixtures = useMemo(() => {
    if (activeTab !== 'finished') return null;
    const groups: Record<string, Fixture[]> = {};
    filteredFixtures.forEach(f => {
      const key = f.competition || 'World Cup';
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    });
    return groups;
  }, [filteredFixtures, activeTab]);

  return (
    <div className="flex flex-col gap-0 pt-4 pb-24 lg:pb-8 animate-fade-in">
      {/* Refresh Progress Bar */}
      <RefreshBar intervalMs={30000} />

      <div className="flex flex-col gap-6 pt-4">
        {/* Header */}
        <div className="px-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-ink flex items-center gap-2">
              <Trophy className="text-warning" size={28} />
              World Cup
            </h1>
            <div className="flex items-center gap-2 mt-1">
              {isTestMode ? (
                <span className="text-xs font-bold text-warning flex items-center gap-1">
                  <FlaskConical size={10} />
                  TEST MODE
                </span>
              ) : (
                <span className="text-xs text-ink-light flex items-center gap-1">
                  <Zap size={10} className="text-success" />
                  Live from TxODDS On-Chain Oracle
                </span>
              )}
              {liveCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-danger/10 text-danger text-xs font-bold flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
                  {liveCount} LIVE
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => { feedback.playClick(); fetchFixtures(); }}
            className="p-2 rounded-xl hover:bg-ink/5 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={18} className={`text-ink-light ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Test Mode Banner */}
        <AnimatePresence>
          {isTestMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mx-6 px-4 py-3 bg-warning/10 border border-warning/20 rounded-2xl flex items-start gap-3"
            >
              <FlaskConical size={16} className="text-warning mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-warning">Test Mode Active</p>
                <p className="text-xs text-ink-light mt-0.5">
                  Real match data, but bets use your test balance. No real funds at risk.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs */}
        <div className="px-6 flex gap-2">
          <button
            onClick={() => { feedback.playClick(); setActiveTab('upcoming'); }}
            className={`flex-1 py-2 text-sm font-bold rounded-xl transition-colors ${
              activeTab === 'upcoming'
                ? 'bg-ink text-cream shadow-sm'
                : 'bg-ink/5 text-ink-light hover:bg-ink/10'
            }`}
          >
            Upcoming & Live
          </button>
          <button
            onClick={() => { feedback.playClick(); setActiveTab('finished'); }}
            className={`flex-1 py-2 text-sm font-bold rounded-xl transition-colors ${
              activeTab === 'finished'
                ? 'bg-ink text-cream shadow-sm'
                : 'bg-ink/5 text-ink-light hover:bg-ink/10'
            }`}
          >
            Results
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-light" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search match or team..."
              className="w-full pl-10 pr-10 py-2.5 bg-ink/5 rounded-xl text-sm text-ink placeholder-ink-light/60 outline-none focus:bg-ink/10 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-light hover:text-ink"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Fixtures List */}
        <div className="px-6 flex flex-col gap-4">
          {loading ? (
            <div className="glass-card p-6 flex flex-col items-center justify-center min-h-[200px]">
              <div className="w-8 h-8 border-4 border-ink/20 border-t-ink rounded-full animate-spin" />
              <p className="text-sm text-ink-light mt-4">Syncing with oracle...</p>
            </div>
          ) : filteredFixtures.length === 0 ? (
            <div className="glass-card p-8 flex flex-col items-center justify-center text-center">
              <AlertCircle size={32} className="text-ink-light mb-4" />
              <h3 className="text-lg font-semibold text-ink">
                {searchQuery ? 'No Matches Found' : 'No Matches'}
              </h3>
              <p className="text-sm text-ink-light mt-1">
                {searchQuery
                  ? `No matches found matching "${searchQuery}"`
                  : activeTab === 'finished'
                    ? 'No finished matches found'
                    : 'No upcoming matches right now'}
              </p>
            </div>
          ) : activeTab === 'finished' && groupedFixtures ? (
            (Object.entries(groupedFixtures) as [string, Fixture[]][]).map(([comp, matches]) => (
              <div key={comp}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-ink-light uppercase tracking-widest">{comp}</span>
                  <div className="flex-1 h-px bg-ink/10" />
                  <span className="text-xs text-ink-light">{matches.length} {matches.length === 1 ? 'match' : 'matches'}</span>
                </div>
                <div className="flex flex-col gap-3">
                  {matches.map((fixture, index) => (
                    <MatchCard key={fixture.id} fixture={fixture} isTestMode={isTestMode} index={index} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            filteredFixtures.map((fixture, index) => (
              <MatchCard key={fixture.id} fixture={fixture} isTestMode={isTestMode} index={index} />
            ))
          )}
        </div>

        {/* Footer */}
        {lastUpdated && !loading && (
          <p className="text-center text-xs text-ink-light/60 pb-2">
            Updated {lastUpdated.toLocaleTimeString()} · Auto-refreshes every 30s
          </p>
        )}
      </div>

      <BetSlip />
    </div>
  );
};

const MatchCard = ({ fixture, isTestMode, index }: { fixture: Fixture; isTestMode: boolean; index: number }) => {
  const [odds, setOdds] = useState<OddsOffer | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<'home' | 'draw' | 'away' | null>(null);
  const [liveScore, setLiveScore] = useState<{home: number, away: number} | null>(null);
  const [isExpanded, setIsExpanded] = useState(fixture.status === 'Live');
  const { addToBetSlip, bets, betSlip, notifications, toggleNotification } = useAppContext();
  const isSubscribed = notifications?.includes(fixture.id);
  const countdown = useCountdown(fixture.startTimeMs);

  const [goals, setGoals] = useState<{ home: string[]; away: string[] } | null>(null);

  useEffect(() => {
    if (fixture.status === 'Finished') return;
    const fetchOdds = async () => {
      const data = await txOddsAdapter.getOdds(fixture.id);
      setOdds(data);
    };
    fetchOdds();
  }, [fixture.id, fixture.status]);

  useEffect(() => {
    if (fixture.status !== 'Finished') return;
    let mounted = true;
    const fetchFinishedDetails = async () => {
      try {
        const data = await eventsApi.getMatchLiveData(fixture);
        if (mounted && data.goals) {
          setGoals(data.goals);
        }
      } catch (e) {}
    };
    fetchFinishedDetails();
    return () => { mounted = false; };
  }, [fixture.id, fixture.status]);

  const handleBetClick = (outcome: 'home' | 'draw' | 'away') => {
    feedback.playClick();
    setSelectedOutcome(outcome === selectedOutcome ? null : outcome);
  };

  const handlePlaceBet = () => {
    if (!odds || !selectedOutcome) return;
    feedback.playSuccess();
    const outcomeLabel = selectedOutcome === 'home' ? fixture.homeTeam : selectedOutcome === 'away' ? fixture.awayTeam : 'Draw';
    const oddsValue = selectedOutcome === 'home' ? odds.homeOdds : selectedOutcome === 'away' ? odds.awayOdds : (odds.drawOdds ?? 3.0);
    addToBetSlip({
      fixtureId: fixture.id,
      marketId: `wc-${fixture.id}-${selectedOutcome}`,
      marketTitle: `${fixture.homeTeam} vs ${fixture.awayTeam} — ${outcomeLabel}`,
      outcome: selectedOutcome,
      odds: oddsValue,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
    });
    setSelectedOutcome(null);
  };

  const isLive = fixture.status === 'Live';
  const isFinished = fixture.status === 'Finished';
  const existingBet = bets.find(b =>
    (b.marketId.startsWith(`wc-${fixture.id}`) || b.fixtureIds?.includes(fixture.id)) &&
    b.isTestBet === isTestMode
  );
  const inBetSlip = betSlip.find(b => b.fixtureId === fixture.id);

  const startDate = new Date(fixture.startTime);
  const timeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = startDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const displayScore = liveScore || fixture.score;
  const dbScore = ResultsDB.getScore(fixture.homeTeam, fixture.awayTeam);
  const finalScore = displayScore || dbScore;

  // Determine winner for finished matches
  const getWinnerLabel = () => {
    if (!finalScore) return null;
    if (finalScore.home > finalScore.away) return `${fixture.homeTeam} Won`;
    if (finalScore.away > finalScore.home) return `${fixture.awayTeam} Won`;
    return 'Draw';
  };

  // For upcoming: is it < 2h away?
  const isSoon = !isLive && !isFinished && fixture.startTimeMs - Date.now() < 2 * 3600000 && fixture.startTimeMs > Date.now();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.25) }}
      className={`glass-card p-5 relative overflow-hidden ${isSoon ? 'ring-1 ring-warning/30' : ''}`}
    >
      {/* Status Bar */}
      <div className="flex justify-between items-center mb-4">
        <div className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
          isLive ? 'bg-danger/10 text-danger' : isSoon ? 'bg-warning/10 text-warning' : 'bg-ink/5 text-ink-light'
        }`}>
          {isLive ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
              LIVE
            </>
          ) : (
            <>
              <Clock size={11} />
              {dateStr} · {timeStr}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Countdown for upcoming matches */}
          {!isLive && !isFinished && countdown && (
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
              isSoon ? 'bg-warning/15 text-warning' : 'bg-ink/5 text-ink-light'
            }`}>
              ⏱ {countdown}
            </span>
          )}
          <span className="text-xs text-ink-light/60 font-medium">
            {isTestMode ? '🧪 Test' : 'TxLINE'}
          </span>
        </div>
      </div>

      {/* Teams and Score */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex-1 text-center">
          <TeamFlag name={fixture.homeTeam} size={56} />
          <h3 className="font-semibold text-sm text-ink leading-tight mt-2">{fixture.homeTeam}</h3>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-1">
          {(isLive || isFinished) && finalScore ? (
            <div className="text-3xl font-black text-ink tracking-widest">
              {finalScore.home} <span className="text-ink-light">—</span> {finalScore.away}
            </div>
          ) : (
            <div className="text-xl font-bold text-ink-light">vs</div>
          )}
          {isFinished && finalScore && (
            <span className="text-[10px] font-bold text-ink-light/60 uppercase tracking-wider">FT</span>
          )}
        </div>

        <div className="flex-1 text-center">
          <TeamFlag name={fixture.awayTeam} size={56} />
          <h3 className="font-semibold text-sm text-ink leading-tight mt-2">{fixture.awayTeam}</h3>
        </div>
      </div>

      {/* Finished Match Goal Scorers Display */}
      {isFinished && goals && (goals.home.length > 0 || goals.away.length > 0) ? (
        <div className="grid grid-cols-3 text-[11px] text-ink-light/80 -mt-3 mb-4 select-none px-2 border-t border-pearl-dark/20 pt-2.5">
          <div className="text-left space-y-0.5 min-w-0">
            {goals.home.map((g, i) => (
              <div key={i} className="truncate flex items-center gap-1" title={g}>
                <span className="shrink-0 text-[10px]">⚽</span> 
                <span className="truncate">{g}</span>
              </div>
            ))}
          </div>
          <div />
          <div className="text-right space-y-0.5 min-w-0">
            {goals.away.map((g, i) => (
              <div key={i} className="truncate flex items-center justify-end gap-1" title={g}>
                <span className="truncate">{g}</span>
                <span className="shrink-0 text-[10px]">⚽</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Odds / State Area */}
      {existingBet ? (
        <div className="bg-success/10 border border-success/20 rounded-xl p-4 flex flex-col items-center">
          <span className="text-xs font-bold text-success uppercase tracking-wider mb-1">Your Position</span>
          {existingBet.legs ? (
            <div className="w-full text-left mt-1">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-success uppercase tracking-wider">
                  {existingBet.legs.length > 1 ? 'Express Bet' : 'Single Bet'}
                </span>
                <span className="text-[10px] font-bold text-ink uppercase tracking-wider">
                  {existingBet.legs.length > 1 ? 'Total: ' : 'Odds: '}
                  <span className="text-primary font-mono">@{(existingBet.potentialPayout / existingBet.amount).toFixed(2)}</span>
                </span>
              </div>
              {existingBet.legs.length === 1 ? (
                <div className="w-full text-left mt-2 space-y-1.5 text-xs">
                  <div className="flex justify-between border-b border-success/5 pb-1">
                    <span className="text-ink-light">Selection:</span>
                    <span className="font-bold text-success">
                      {existingBet.legs[0].outcome === 'home' 
                        ? `${fixture.homeTeam} Win` 
                        : existingBet.legs[0].outcome === 'away' 
                          ? `${fixture.awayTeam} Win` 
                          : 'Draw'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-success/5 pb-1">
                    <span className="text-ink-light">Wager:</span>
                    <span className="font-mono font-semibold text-ink">
                      {existingBet.amount} {existingBet.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-light">Potential Payout:</span>
                    <span className="font-mono font-bold text-success">
                      {existingBet.potentialPayout} {existingBet.currency}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1 mt-2">
                  {existingBet.legs.map((leg, i) => {
                    const outcomeLabel = leg.outcome === 'home' ? leg.homeTeam : leg.outcome === 'away' ? leg.awayTeam : 'Draw';
                    return (
                      <div key={i} className={`flex justify-between items-center border-b border-success/10 pb-1 last:border-0 ${leg.fixtureId === fixture.id ? 'bg-success/10 p-1 rounded -mx-1 px-1' : ''}`}>
                        <span className={`text-[10px] ${leg.fixtureId === fixture.id ? 'font-bold text-ink' : 'text-ink-light'}`}>{leg.homeTeam} vs {leg.awayTeam}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold bg-success/20 text-success px-1.5 py-0.5 rounded">
                            {outcomeLabel}
                          </span>
                          <span className="text-[10px] font-mono font-medium text-ink">@{leg.odds.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">
                {existingBet.amount} {existingBet.currency} on {existingBet.marketTitle.split('—')[1]?.trim() || existingBet.marketTitle}
              </p>
              <p className="text-xs text-ink-light mt-1">
                Potential Payout: <span className="font-bold text-success">{existingBet.potentialPayout} {existingBet.currency}</span>
              </p>
            </>
          )}
        </div>
      ) : inBetSlip ? (
        <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 flex flex-col items-center">
          <span className="text-xs font-bold text-warning uppercase tracking-wider mb-1">In Bet Slip</span>
          <p className="text-sm font-medium text-ink">
            {inBetSlip.outcome === 'home' ? fixture.homeTeam : inBetSlip.outcome === 'away' ? fixture.awayTeam : 'Draw'} @ {inBetSlip.odds.toFixed(2)}
          </p>
        </div>
      ) : isFinished ? (
        <div className="bg-ink/5 rounded-xl p-4 flex flex-col items-center gap-1">
          <span className="text-xs font-bold text-ink-light uppercase tracking-wider">Match Finished</span>
          {finalScore ? (
            <span className="font-bold text-sm bg-success/20 text-success px-3 py-1 rounded-lg mt-1">
              {getWinnerLabel()}
            </span>
          ) : (
            <div className="text-sm text-ink-light flex items-center gap-2 opacity-60 mt-1">
              <Clock size={13} />
              <span>Awaiting final score from Oracle...</span>
            </div>
          )}
        </div>
      ) : odds ? (
        <>
          <div className="flex gap-2 mb-3">
            {[
              { key: 'home' as const, label: '1', team: fixture.homeTeam, value: odds.homeOdds },
              { key: 'draw' as const, label: 'X', team: 'Draw', value: odds.drawOdds ?? 3.0 },
              { key: 'away' as const, label: '2', team: fixture.awayTeam, value: odds.awayOdds },
            ].map(({ key, label, value }) => {
              const isSelected = selectedOutcome === key;
              return (
                <button
                  key={key}
                  onClick={() => handleBetClick(key)}
                  className={`flex-1 py-3 rounded-xl flex flex-col items-center justify-center transition-all duration-150 ${
                    isSelected
                      ? 'bg-ink text-cream shadow-md scale-[1.02]'
                      : 'bg-ink/5 hover:bg-ink/10 text-ink'
                  }`}
                >
                  <span className={`text-xs font-medium mb-1 ${isSelected ? 'text-cream/70' : 'text-ink-light'}`}>{label}</span>
                  <span className="font-bold text-base">{value.toFixed(2)}</span>
                </button>
              );
            })}
          </div>

          <AnimatePresence>
            {selectedOutcome && (
              <motion.button
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onClick={handlePlaceBet}
                className="w-full py-3 rounded-xl bg-ink text-cream font-semibold text-sm mt-1 hover:bg-ink/90 transition-colors"
              >
                Add to Bet Slip →
              </motion.button>
            )}
          </AnimatePresence>
        </>
      ) : (
        // Odds unavailable — compact with explanation
        <div className="flex items-center justify-between p-3 bg-ink/5 rounded-xl">
          <div>
            <p className="text-sm font-semibold text-ink-light">Odds unavailable</p>
            <p className="text-xs text-ink-light/60 mt-0.5">
              {fixture.startTimeMs - Date.now() > 12 * 3600000
                ? 'Line opens closer to kickoff'
                : 'Awaiting updates from Oracle...'}
            </p>
          </div>
          <button 
            onClick={() => toggleNotification(fixture.id)}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
              isSubscribed
                ? 'bg-primary text-cream hover:bg-primary/90 shadow-sm'
                : 'bg-primary/10 text-primary hover:bg-primary/15'
            }`}
          >
            <Bell size={11} className={isSubscribed ? 'fill-cream' : ''} />
            {isSubscribed ? 'Subscribed' : 'Notify Me'}
          </button>
        </div>
      )}

      {/* Expand/Collapse Match Center Trigger */}
      <button 
        onClick={() => {
          feedback.playClick();
          setIsExpanded(!isExpanded);
        }}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 mt-3.5 text-xs font-bold text-ink-light bg-pearl hover:bg-pearl-dark rounded-xl transition-all border border-pearl-dark/40"
      >
        <span>{isExpanded ? 'Hide Match Center' : 'Open Match Center'}</span>
        <span className="text-[10px]">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded Match Center */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <MatchCenter fixture={fixture} isTestMode={isTestMode} onScoreUpdate={setLiveScore} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
