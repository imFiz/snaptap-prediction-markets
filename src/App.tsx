import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { WorldCupScreen } from './screens/WorldCupScreen';
import { SettingsHub } from './screens/SettingsHub';
import { ActivityScreen } from './screens/ActivityScreen';
import { Logo } from './components/Logo';
import { Settings, Activity, Trophy, FlaskConical, Droplets } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WalletContextProvider } from './components/WalletContextProvider';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { AppProvider, useAppContext } from './context/AppContext';
import { feedback } from './utils/feedback';
import { TermsModal, UsernameModal } from './components/OnboardingModals';
import { useWallet } from '@solana/wallet-adapter-react';
import { useStakeBalance } from './lib/useStakeBalance';
import { useDevnetSwitch } from './lib/useDevnetSwitch';

const DesktopWalletPanel = () => {
  const { isTestMode } = useAppContext();
  const { connected, publicKey } = useWallet();
  const { balance, refresh } = useStakeBalance();
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);

  const handleFaucet = async () => {
    if (!publicKey || faucetLoading) return;
    setFaucetLoading(true);
    setFaucetMsg(null);
    try {
      const res = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pubkey: publicKey.toString() }),
      });
      if (res.status === 429) {
        setFaucetMsg('Faucet cooldown');
      } else if (res.ok) {
        setFaucetMsg('1000 demo-USDC sent!');
        setTimeout(refresh, 2000);
      } else {
        setFaucetMsg('Faucet error');
      }
    } catch {
      setFaucetMsg('Network error');
    }
    setFaucetLoading(false);
    setTimeout(() => setFaucetMsg(null), 4000);
  };

  return (
    <div className="mt-auto desktop-wallet flex flex-col gap-2">
      {connected && !isTestMode && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-mono text-ink-light">{balance.toFixed(2)} USDC</span>
          <button
            onClick={handleFaucet}
            disabled={faucetLoading}
            title="Get 1000 demo-USDC"
            className="p-1.5 rounded-full bg-pearl hover:bg-pearl-dark text-ink-light hover:text-ink transition-colors disabled:opacity-40 flex items-center gap-1 text-xs"
          >
            <Droplets size={14} />
            Faucet
          </button>
        </div>
      )}
      {faucetMsg && (
        <p className="text-[10px] text-ink-light text-center">{faucetMsg}</p>
      )}
      <WalletMultiButton />
    </div>
  );
};

const Navigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isTestMode } = useAppContext();

  const navItems = [
    { path: '/', icon: Trophy, label: 'World Cup' },
    { path: '/activity', icon: Activity, label: 'Activity' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  const handleNav = (path: string) => {
    if (location.pathname !== path) {
      feedback.playClick();
      navigate(path);
    }
  };

  return (
    <>
      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-6 left-6 right-6 glass-card p-2 flex justify-between items-center z-50">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => handleNav(item.path)}
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
      <div className="hidden lg:flex flex-col w-64 h-screen sticky top-0 p-6 border-r border-pearl-dark/50">
        <div className="flex items-center gap-3 mb-12 px-4">
          <Logo className="w-16 h-16" />
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight text-ink leading-tight">SnapTap</h1>
            {isTestMode && (
              <span className="text-[10px] font-bold text-warning flex items-center gap-1 mt-0.5">
                <FlaskConical size={10} />
                TEST MODE
              </span>
            )}
          </div>
        </div>
        
        <nav className="flex flex-col gap-2 flex-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
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
        
        <DesktopWalletPanel />
      </div>
    </>
  );
};

const Header = () => {
  const { isTestMode } = useAppContext();
  const { connected, publicKey } = useWallet();
  const { balance, refresh } = useStakeBalance();
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);

  const handleFaucet = async () => {
    if (!publicKey || faucetLoading) return;
    setFaucetLoading(true);
    setFaucetMsg(null);
    try {
      const res = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pubkey: publicKey.toString() }),
      });
      if (res.status === 429) {
        setFaucetMsg('Faucet cooldown — try again later');
      } else if (res.ok) {
        setFaucetMsg('1000 demo-USDC sent!');
        setTimeout(refresh, 2000);
      } else {
        setFaucetMsg('Faucet error, try again');
      }
    } catch {
      setFaucetMsg('Network error');
    }
    setFaucetLoading(false);
    setTimeout(() => setFaucetMsg(null), 4000);
  };

  return (
    <header className="px-6 py-5 flex justify-between items-center z-10 bg-cream/80 backdrop-blur-md sticky top-0 lg:hidden">
      <div className="flex items-center gap-3">
        <Logo className="w-14 h-14" />
        <div className="flex flex-col">
          <h1 className="text-xl font-bold tracking-tight text-ink leading-tight">SnapTap</h1>
          {isTestMode && (
            <span className="text-[10px] font-bold text-warning flex items-center gap-1">
              <FlaskConical size={10} />
              TEST MODE
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {connected && !isTestMode && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-ink-light">
              {balance.toFixed(2)} USDC
            </span>
            <button
              onClick={handleFaucet}
              disabled={faucetLoading}
              title="Get 1000 demo-USDC"
              className="p-2 rounded-full bg-pearl hover:bg-pearl-dark text-ink-light hover:text-ink transition-colors disabled:opacity-40"
            >
              <Droplets size={16} />
            </button>
          </div>
        )}
        {faucetMsg && (
          <span className="text-[10px] text-ink-light bg-pearl px-2 py-1 rounded-full whitespace-nowrap">
            {faucetMsg}
          </span>
        )}
        <WalletMultiButton />
      </div>
    </header>
  );
};

const AppContent = () => {
  const { hasAcceptedTerms, username } = useAppContext();
  const { connected } = useWallet();

  return (
    <Router>
      <AnimatePresence>
        {!hasAcceptedTerms && <TermsModal key="terms" />}
        {hasAcceptedTerms && connected && !username && <UsernameModal key="username" />}
      </AnimatePresence>
      
      <div className="flex flex-col lg:flex-row min-h-screen max-w-7xl mx-auto w-full">
        <Navigation />
        <main className="flex-1 pb-24 lg:pb-0 lg:px-8 max-w-3xl mx-auto w-full">
          <Header />
          <DevnetBanner />
          <Routes>
            <Route path="/" element={<WorldCupScreen />} />
            <Route path="/activity" element={<ActivityScreen />} />
            <Route path="/settings" element={<SettingsHub />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

const DevnetBanner = () => {
  const { connected } = useWallet();
  const { isTestMode } = useAppContext();
  const { switchToDevnet } = useDevnetSwitch();
  const [dismissed, setDismissed] = useState(false);
  const [switching, setSwitching] = useState(false);
  // 'idle' | 'ok' | 'manual' (wallet couldn't switch -> show manual steps)
  const [state, setState] = useState<'idle' | 'ok' | 'manual'>('idle');

  const trySwitch = async () => {
    setSwitching(true);
    const ok = await switchToDevnet();
    setSwitching(false);
    setState(ok ? 'ok' : 'manual');
    if (ok) setTimeout(() => setDismissed(true), 1500);
  };

  // Auto-offer the network switch once, right after the wallet connects.
  useEffect(() => {
    if (!connected || isTestMode) return;
    if (sessionStorage.getItem('devnetSwitchTried') === 'true') return;
    sessionStorage.setItem('devnetSwitchTried', 'true');
    trySwitch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, isTestMode]);

  if (!connected || isTestMode || dismissed || state === 'ok') return null;

  return (
    <div className="mx-6 mt-4 px-4 py-3 bg-warning/10 border border-warning/30 rounded-2xl flex items-start gap-3">
      <FlaskConical size={16} className="text-warning mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-warning">Switch to Solana Devnet</p>
        <p className="text-xs text-ink-light mt-0.5">
          {state === 'manual'
            ? 'Your wallet did not switch automatically. Open Phantom → Settings → Developer Settings → Testnet Mode → Devnet, or try again below.'
            : 'SnapTap runs on Devnet. Approve the network switch in your wallet so transactions succeed.'}
        </p>
        <button
          onClick={trySwitch}
          disabled={switching}
          className="mt-2 text-xs font-bold bg-warning text-cream px-3 py-1.5 rounded-lg hover:bg-warning/90 disabled:opacity-60"
        >
          {switching ? 'Requesting…' : 'Switch to Devnet'}
        </button>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-ink-light hover:text-ink text-sm font-bold shrink-0"
      >
        ✕
      </button>
    </div>
  );
};

export default function App() {
  return (
    <WalletContextProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </WalletContextProvider>
  );
}
