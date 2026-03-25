import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { feedback } from '../utils/feedback';

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
}

export interface UserLevel {
  name: string;
  currentVolume: number;
  nextTierVolume: number | null;
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const MOCK_INITIAL_BETS: Bet[] = [
  {
    id: 'mock-1',
    marketId: 'jup-sol-eth-2026',
    marketTitle: 'Solana to surpass Ethereum in daily active users by end of 2026?',
    outcome: 'Yes',
    amount: 50,
    currency: 'USDC',
    timestamp: Date.now() - 86400000 * 2,
    status: 'Active',
    potentialPayout: 90.9,
    isTestBet: false,
  },
  {
    id: 'mock-2',
    marketId: 'jup-doge-1',
    marketTitle: 'Dogecoin to reach $1 in 2026?',
    outcome: 'No',
    amount: 100,
    currency: 'USDC',
    timestamp: Date.now() - 86400000 * 5,
    status: 'Won',
    potentialPayout: 117.6,
    isTestBet: false,
  },
  {
    id: 'mock-test-1',
    marketId: 'jup-apple-ar',
    marketTitle: 'Apple to announce AR Glasses in WWDC 2026?',
    outcome: 'Yes',
    amount: 500,
    currency: 'STcoin',
    timestamp: Date.now() - 86400000 * 1,
    status: 'Active',
    potentialPayout: 1190.5,
    isTestBet: true,
  }
];

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [isDark, setIsDark] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [bets, setBets] = useState<Bet[]>(MOCK_INITIAL_BETS);
  
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(() => localStorage.getItem('termsAccepted') === 'true');
  const [username, setUsernameState] = useState<string | null>(() => localStorage.getItem('username'));
  
  const [isTestMode, setIsTestMode] = useState(() => localStorage.getItem('testMode') === 'true');
  const [testBalance, setTestBalance] = useState(() => {
    const saved = localStorage.getItem('testBalance');
    return saved ? parseFloat(saved) : 10000;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    feedback.syncSettings(soundEnabled, vibrationEnabled);
  }, [soundEnabled, vibrationEnabled]);

  useEffect(() => {
    localStorage.setItem('testMode', isTestMode.toString());
  }, [isTestMode]);

  useEffect(() => {
    localStorage.setItem('testBalance', testBalance.toString());
  }, [testBalance]);

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

  const addBet = (betData: Omit<Bet, 'id' | 'timestamp' | 'status'>) => {
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

  const userLevel: UserLevel = {
    name: levelName,
    currentVolume: totalVolume,
    nextTierVolume: nextTier
  };

  return (
    <AppContext.Provider value={{ 
      isDark, toggleTheme, 
      soundEnabled, toggleSound, 
      vibrationEnabled, toggleVibration, 
      bets, addBet, claimReward,
      hasAcceptedTerms, acceptTerms,
      username, setUsername,
      userLevel,
      isTestMode, toggleTestMode, testBalance, addTestBalance
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
