import React from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { MainFeed } from './screens/MainFeed';
import { SettingsHub } from './screens/SettingsHub';
import { ActivityScreen } from './screens/ActivityScreen';
import { Logo } from './components/Logo';
import { Home, Settings, Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { WalletContextProvider } from './components/WalletContextProvider';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { AppProvider } from './context/AppContext';

const Navigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/', icon: Home, label: 'Markets' },
    { path: '/activity', icon: Activity, label: 'Activity' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <>
      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-6 left-6 right-6 glass-card p-2 flex justify-between items-center z-50">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="relative flex-1 py-3 flex flex-col items-center justify-center"
            >
              {isActive && (
                <motion.div
                  layoutId="nav-pill-mobile"
                  className="absolute inset-0 bg-ink rounded-2xl"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon 
                size={20} 
                strokeWidth={isActive ? 2 : 1.5} 
                className={`relative z-10 transition-colors ${isActive ? 'text-cream' : 'text-ink-light'}`} 
              />
              <span className={`relative z-10 text-[10px] mt-1 font-medium ${isActive ? 'text-cream' : 'text-ink-light'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Desktop Sidebar Navigation */}
      <div className="hidden md:flex flex-col w-64 h-screen sticky top-0 p-6 border-r border-pearl-dark/50">
        <div className="flex items-center gap-3 mb-12 px-4">
          <Logo className="w-10 h-10" />
          <h1 className="text-2xl font-bold tracking-tight text-ink">SnapTap</h1>
        </div>
        
        <nav className="flex flex-col gap-2 flex-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="relative flex items-center gap-4 px-4 py-4 rounded-2xl transition-colors"
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-pill-desktop"
                    className="absolute inset-0 bg-ink rounded-2xl"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon 
                  size={24} 
                  strokeWidth={isActive ? 2 : 1.5} 
                  className={`relative z-10 transition-colors ${isActive ? 'text-cream' : 'text-ink-light'}`} 
                />
                <span className={`relative z-10 text-sm font-medium ${isActive ? 'text-cream' : 'text-ink-light'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
        
        <div className="mt-auto">
          <WalletMultiButton />
        </div>
      </div>
    </>
  );
};

const Header = () => {
  return (
    <header className="px-6 py-5 flex justify-between items-center z-10 bg-cream/80 backdrop-blur-md sticky top-0 md:hidden">
      <div className="flex items-center gap-3">
        <Logo className="w-8 h-8" />
        <h1 className="text-xl font-bold tracking-tight text-ink">SnapTap</h1>
      </div>
      <WalletMultiButton />
    </header>
  );
};

export default function App() {
  return (
    <AppProvider>
      <WalletContextProvider>
        <Router>
          <div className="flex flex-col md:flex-row min-h-screen max-w-7xl mx-auto w-full">
            <Navigation />
            <main className="flex-1 pb-24 md:pb-0 md:px-8 max-w-3xl mx-auto w-full">
              <Header />
              <Routes>
                <Route path="/" element={<MainFeed />} />
                <Route path="/activity" element={<ActivityScreen />} />
                <Route path="/settings" element={<SettingsHub />} />
              </Routes>
            </main>
          </div>
        </Router>
      </WalletContextProvider>
    </AppProvider>
  );
}
