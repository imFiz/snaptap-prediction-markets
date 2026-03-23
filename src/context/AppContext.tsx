import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface Bet {
  id: string;
  marketId: string;
  marketTitle: string;
  outcome: 'Yes' | 'No';
  amount: number;
  currency: string;
  timestamp: number;
  status: 'Active' | 'Resolved';
}

interface AppContextType {
  isDark: boolean;
  toggleTheme: () => void;
  bets: Bet[];
  addBet: (bet: Omit<Bet, 'id' | 'timestamp' | 'status'>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [isDark, setIsDark] = useState(false);
  const [bets, setBets] = useState<Bet[]>([]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  const addBet = (betData: Omit<Bet, 'id' | 'timestamp' | 'status'>) => {
    const newBet: Bet = {
      ...betData,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      status: 'Active'
    };
    setBets(prev => [newBet, ...prev]);
  };

  return (
    <AppContext.Provider value={{ isDark, toggleTheme, bets, addBet }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
};
