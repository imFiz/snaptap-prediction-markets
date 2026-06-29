import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { feedback } from '../utils/feedback';
import { ResultsDB } from '../adapters/resultsDb';

export interface Bet {
  id: string;
  marketId: string;
  marketTitle: string;
  outcome: 'Yes' | 'No';
  amount: number;
  currency: string;
  timestamp: number;
  status: 'Active' | 'Won' | 'Lost' | 'Claimed';
  potentialPayout: number;
  isTestBet?: boolean;
  fixtureIds?: number[];
  legs?: BetSlipItem[];
}

export interface UserLevel {
  name: string;
  currentVolume: number;
  nextTierVolume: number | null;
}

export interface BetSlipItem {
  fixtureId: number;
  marketId: string;
  marketTitle: string;
  outcome: 'home' | 'draw' | 'away';
  odds: number;
  homeTeam: string;
  awayTeam: string;
}

interface AppContextType {
  isDark: boolean;
  toggleTheme: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  vibrationEnabled: boolean;
  toggleVibration: () => void;
  bets: Bet[];
  addBet: (bet: Omit<Bet, 'id' | 'timestamp' | 'status'>) => void;
  
  // Express Bets (Bet Slip)
  betSlip: BetSlipItem[];
  addToBetSlip: (item: BetSlipItem) => void;
  removeFromBetSlip: (fixtureId: number) => void;
  clearBetSlip: () => void;
  placeExpressBet: (amount: number, currency: string, isTestBet: boolean) => void;

  claimReward: (betId: string) => void;
  hasAcceptedTerms: boolean;
  acceptTerms: () => void;
  username: string | null;
  setUsername: (name: string) => void;
  userLevel: UserLevel;
  isTestMode: boolean;
  toggleTestMode: () => void;
  testBalance: number;
  addTestBalance: (amount: number) => void;
  clearTestBets: () => void;

  // Notification settings
  notifications: number[];
  toggleNotification: (fixtureId: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('isDark') === 'true');
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('soundEnabled') !== 'false');
  const [vibrationEnabled, setVibrationEnabled] = useState(() => localStorage.getItem('vibrationEnabled') !== 'false');
  
  // Solana Wallet Integration
  let walletContext: any = null;
  try {
    walletContext = useWallet();
  } catch (e) {
    // Wallet provider not yet initialized or context missing
  }
  const publicKey = walletContext?.publicKey;
  const walletAddress = publicKey ? publicKey.toString() : 'guest';

  const [bets, setBets] = useState<Bet[]>([]);
  const loadedWalletRef = React.useRef(walletAddress);

  // Load wallet-specific bets and balance from server with local storage fallback
  useEffect(() => {
    let mounted = true;

    // One-time cleanup of dirty guest bets directly in the loading flow to avoid race conditions
    const cleaned = localStorage.getItem('guestBetsCleaned_v4');
    if (!cleaned) {
      localStorage.removeItem('userBets_guest');
      localStorage.setItem('guestBetsCleaned_v4', 'true');
    }

    const key = `userBets_${walletAddress}`;
    
    const syncDataFromServer = async () => {
      // First load local storage as instant placeholder
      const localSaved = localStorage.getItem(key);
      let localBets: Bet[] = [];
      if (localSaved) {
        try {
          const parsed = JSON.parse(localSaved);
          if (Array.isArray(parsed)) localBets = parsed;
        } catch (e) {}
      }
      if (mounted) {
        setBets(localBets.filter((bet: Bet) => {
          if (bet.id === 'mock-1') return false;
          if (bet.marketId?.startsWith('express-') && (!bet.legs || bet.legs.length === 0)) return false;
          if (!bet.isTestBet) return true;
          return bet.marketId?.startsWith('wc-') || bet.marketId?.startsWith('express-');
        }));
      }

      if (walletAddress === 'guest') {
        const savedBalance = localStorage.getItem('testBalance');
        if (mounted) {
          setTestBalance(savedBalance ? parseFloat(savedBalance) : 10000);
        }
        loadedWalletRef.current = 'guest';
        return;
      }

      // Load bets and balance from server
      try {
        const [betsRes, balanceRes] = await Promise.all([
          fetch(`/api/load-bets?wallet=${walletAddress}`),
          fetch(`/api/load-balance?wallet=${walletAddress}`)
        ]);

        if (betsRes.ok && mounted) {
          const serverBets = await betsRes.json();
          if (Array.isArray(serverBets)) {
            const cleanedBets = serverBets.filter((bet: Bet) => {
              if (bet.id === 'mock-1') return false;
              if (bet.marketId?.startsWith('express-') && (!bet.legs || bet.legs.length === 0)) return false;
              if (!bet.isTestBet) return true;
              return bet.marketId?.startsWith('wc-') || bet.marketId?.startsWith('express-');
            });
            setBets(cleanedBets);
            localStorage.setItem(key, JSON.stringify(cleanedBets));
          }
        }

        if (balanceRes.ok && mounted) {
          const serverBal = await balanceRes.json();
          if (serverBal && typeof serverBal.balance === 'number') {
            setTestBalance(serverBal.balance);
            localStorage.setItem('testBalance', serverBal.balance.toString());
          }
        }

        if (mounted) {
          loadedWalletRef.current = walletAddress;
        }
      } catch (e) {
        console.warn("Failed to load data from server, using local fallback", e);
        if (mounted) {
          loadedWalletRef.current = walletAddress;
        }
      }
    };

    syncDataFromServer();

    return () => {
      mounted = false;
    };
  }, [walletAddress]);

  // Save wallet-specific bets
  useEffect(() => {
    if (loadedWalletRef.current === walletAddress) {
      const key = `userBets_${walletAddress}`;
      localStorage.setItem(key, JSON.stringify(bets));

      if (walletAddress !== 'guest') {
        fetch('/api/save-bets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: walletAddress, bets })
        }).catch(e => console.warn("Failed to save bets to server:", e));
      }
    }
  }, [bets, walletAddress]);

  // Whenever a wallet connects, ensure we clear userBets_guest to prevent leaks on disconnect
  useEffect(() => {
    if (publicKey) {
      localStorage.removeItem('userBets_guest');
    }
  }, [publicKey]);

  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(() => localStorage.getItem('termsAccepted') === 'true');
  const [username, setUsernameState] = useState<string | null>(() => localStorage.getItem('username') || null);
  const [betSlip, setBetSlip] = useState<BetSlipItem[]>([]);
  
  const [isTestMode, setIsTestMode] = useState(() => localStorage.getItem('testMode') === 'true');
  const [testBalance, setTestBalance] = useState(() => {
    const saved = localStorage.getItem('testBalance');
    return saved ? parseFloat(saved) : 10000;
  });

  // Notifications state
  const [notifications, setNotifications] = useState<number[]>(() => {
    const saved = localStorage.getItem('userNotifications');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('userNotifications', JSON.stringify(notifications));
  }, [notifications]);

  const toggleNotification = (fixtureId: number) => {
    feedback.playClick();
    setNotifications(prev => {
      const isSubscribed = prev.includes(fixtureId);
      if (isSubscribed) {
        return prev.filter(id => id !== fixtureId);
      } else {
        feedback.playSuccess();
        if (navigator.vibrate) navigator.vibrate(20);
        return [...prev, fixtureId];
      }
    });
  };

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('isDark', isDark.toString());
  }, [isDark]);

  useEffect(() => {
    feedback.syncSettings(soundEnabled, vibrationEnabled);
    localStorage.setItem('soundEnabled', soundEnabled.toString());
    localStorage.setItem('vibrationEnabled', vibrationEnabled.toString());
  }, [soundEnabled, vibrationEnabled]);

  useEffect(() => {
    localStorage.setItem('testMode', isTestMode.toString());
  }, [isTestMode]);

  // Save balance to local storage and sync to server
  useEffect(() => {
    localStorage.setItem('testBalance', testBalance.toString());

    if (loadedWalletRef.current === walletAddress && walletAddress !== 'guest') {
      fetch('/api/save-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress, balance: testBalance })
      }).catch(e => console.warn("Failed to save balance to server:", e));
    }
  }, [testBalance, walletAddress]);

  useEffect(() => {
    // Periodically check if active bets have finished
    const resolveBets = () => {
      setBets(prev => {
        let changed = false;
        const newBets = prev.map(bet => {
          if (bet.status !== 'Active') return bet;
          
          let legsToResolve = bet.legs;
          if (!legsToResolve || legsToResolve.length === 0) {
            // Fallback: try parsing from marketTitle and marketId
            const titleParts = bet.marketTitle.split(' — ');
            if (titleParts.length >= 2) {
              const teamsPart = titleParts[0];
              const selectionPart = titleParts[1];
              const teams = teamsPart.split(' vs ');
              if (teams.length === 2) {
                const homeTeam = teams[0].trim();
                const awayTeam = teams[1].trim();
                
                let outcome: 'home' | 'away' | 'draw' = 'draw';
                if (selectionPart.toLowerCase() === homeTeam.toLowerCase()) {
                  outcome = 'home';
                } else if (selectionPart.toLowerCase() === awayTeam.toLowerCase()) {
                  outcome = 'away';
                } else if (
                  selectionPart.toLowerCase().includes('draw') || 
                  selectionPart.toLowerCase().includes('ничья') ||
                  selectionPart.toLowerCase().includes('x')
                ) {
                  outcome = 'draw';
                } else {
                  if (bet.marketId.endsWith('-home')) outcome = 'home';
                  else if (bet.marketId.endsWith('-away')) outcome = 'away';
                  else if (bet.marketId.endsWith('-draw')) outcome = 'draw';
                }
                
                legsToResolve = [{
                  fixtureId: 0,
                  marketId: bet.marketId,
                  marketTitle: bet.marketTitle,
                  outcome,
                  odds: bet.potentialPayout / bet.amount,
                  homeTeam,
                  awayTeam
                }];
              }
            }
          }

          if (!legsToResolve || legsToResolve.length === 0) return bet;
          
          let allWon = true;
          let anyLost = false;
          
          for (const leg of legsToResolve) {
            const score = ResultsDB.getScore(leg.homeTeam, leg.awayTeam);
            if (!score) {
              allWon = false;
              continue; // Awaiting oracle
            }
            
            let legWon = false;
            if (leg.outcome === 'home' && score.home > score.away) legWon = true;
            if (leg.outcome === 'away' && score.away > score.home) legWon = true;
            if (leg.outcome === 'draw' && score.home === score.away) legWon = true;
            
            if (!legWon) {
              anyLost = true;
              break;
            }
          }
          
          if (anyLost) {
            changed = true;
            return { ...bet, status: 'Lost' };
          } else if (allWon) {
            changed = true;
            return { ...bet, status: 'Won' };
          }
          
          return bet;
        });
        
        return changed ? newBets : prev;
      });
    };
    
    resolveBets();
    const interval = setInterval(resolveBets, 10000);
    return () => clearInterval(interval);
  }, []);

  const toggleTheme = () => {
    feedback.playClick();
    setIsDark(!isDark);
  };
  
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) feedback.playClick();
  };

  const toggleVibration = () => {
    const next = !vibrationEnabled;
    setVibrationEnabled(next);
    if (next && navigator.vibrate) navigator.vibrate(10);
  };

  const toggleTestMode = () => {
    feedback.playClick();
    setIsTestMode(!isTestMode);
  };

  const addTestBalance = (amount: number) => {
    setTestBalance(prev => prev + amount);
  };

  const clearTestBets = () => {
    feedback.playClick();
    setBets(prev => prev.filter(b => !b.isTestBet));
    setTestBalance(10000); // reset test balance
  };

  const addBet = (betData: Omit<Bet, 'id' | 'timestamp' | 'status'>) => {
    if (betData.amount <= 0 || isNaN(betData.amount)) return;
    if (betData.isTestBet && betData.amount > testBalance) return;
    
    if (betData.isTestBet) {
      setTestBalance(prev => prev - betData.amount);
    }
    
    const newBet: Bet = {
      ...betData,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      status: 'Active'
    };
    setBets(prev => [newBet, ...prev]);
  };

  const addToBetSlip = (item: BetSlipItem) => {
    feedback.playClick();
    setBetSlip(prev => {
      const filtered = prev.filter(b => b.fixtureId !== item.fixtureId);
      return [...filtered, item];
    });
  };

  const removeFromBetSlip = (fixtureId: number) => {
    feedback.playClick();
    setBetSlip(prev => prev.filter(b => b.fixtureId !== fixtureId));
  };

  const clearBetSlip = () => {
    setBetSlip([]);
  };

  const placeExpressBet = (amount: number, currency: string, isTestBet: boolean) => {
    if (betSlip.length === 0) return;
    if (amount <= 0 || isNaN(amount)) return;
    if (isTestBet && amount > testBalance) return;
    feedback.playSuccess();
    
    const totalOdds = betSlip.reduce((acc, item) => acc * item.odds, 1);
    const potentialPayout = parseFloat((amount * totalOdds).toFixed(2));
    const fixtureIds = betSlip.map(item => item.fixtureId);
    
    if (betSlip.length === 1) {
      const item = betSlip[0];
      addBet({
        marketId: `wc-${item.fixtureId}-${item.outcome}`,
        marketTitle: `${item.homeTeam} vs ${item.awayTeam} — ${item.outcome === 'home' ? item.homeTeam : item.outcome === 'away' ? item.awayTeam : 'Draw'}`,
        outcome: 'Yes',
        amount,
        currency,
        potentialPayout,
        isTestBet,
        fixtureIds,
        legs: [...betSlip]
      });
    } else {
      const titles = betSlip.map(item => `${item.homeTeam} vs ${item.awayTeam} (${item.outcome.toUpperCase()})`).join(' + ');
      const marketId = `express-${Date.now()}`;

      addBet({
        marketId,
        marketTitle: `Express: ${titles}`,
        outcome: 'Yes',
        amount,
        currency,
        potentialPayout,
        isTestBet,
        fixtureIds,
        legs: [...betSlip]
      });
    }
    
    clearBetSlip();
  };

  const claimReward = (betId: string) => {
    setBets(prev => prev.map(bet => {
      if (bet.id === betId && bet.status === 'Won') {
        if (bet.isTestBet) {
          setTestBalance(b => b + bet.potentialPayout);
        }
        return { ...bet, status: 'Claimed' };
      }
      return bet;
    }));
  };

  const acceptTerms = () => {
    localStorage.setItem('termsAccepted', 'true');
    setHasAcceptedTerms(true);
  };

  const setUsername = (name: string) => {
    localStorage.setItem('username', name);
    setUsernameState(name);
  };

  // Calculate user level based on total wagered volume (real bets only)
  const userLevel = React.useMemo(() => {
    const totalVolume = bets.filter(b => !b.isTestBet).reduce((sum, bet) => sum + bet.amount, 0);
    let levelName = "Initiate";
    let nextTier: number | null = 100;

    if (totalVolume >= 10000) {
      levelName = "Oracle";
      nextTier = null;
    } else if (totalVolume >= 2500) {
      levelName = "Whale";
      nextTier = 10000;
    } else if (totalVolume >= 500) {
      levelName = "Pro";
      nextTier = 2500;
    } else if (totalVolume >= 100) {
      levelName = "Challenger";
      nextTier = 500;
    }

    return {
      name: levelName,
      currentVolume: totalVolume,
      nextTierVolume: nextTier
    };
  }, [bets]);

  return (
    <AppContext.Provider value={{ 
      isDark, toggleTheme, 
      soundEnabled, toggleSound, 
      vibrationEnabled, toggleVibration, 
      bets, addBet, 
      betSlip, addToBetSlip, removeFromBetSlip, clearBetSlip, placeExpressBet,
      claimReward,
      hasAcceptedTerms, acceptTerms,
      username, setUsername,
      userLevel,
      isTestMode, toggleTestMode, testBalance, addTestBalance, clearTestBets,
      notifications, toggleNotification
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
};
