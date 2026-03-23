import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Moon, Sun, Volume2, Vibrate, Shield, FileText, Wallet } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useAppContext } from '../context/AppContext';

const Toggle = ({ active, onChange }: { active: boolean, onChange: () => void }) => (
  <button 
    onClick={onChange}
    className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out ${active ? 'bg-ink' : 'bg-pearl-dark'}`}
  >
    <motion.div 
      className="w-4 h-4 bg-cream rounded-full shadow-sm"
      animate={{ x: active ? 24 : 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
    />
  </button>
);

const SettingRow = ({ icon: Icon, title, description, control }: any) => (
  <div className="flex items-center justify-between py-4 border-b border-pearl-dark/30 last:border-0">
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-pearl flex items-center justify-center text-ink">
        <Icon size={18} strokeWidth={1.5} />
      </div>
      <div>
        <h4 className="text-sm font-medium text-ink">{title}</h4>
        {description && <p className="text-xs text-ink-light mt-0.5">{description}</p>}
      </div>
    </div>
    {control}
  </div>
);

export const SettingsHub = () => {
  const { connected, publicKey } = useWallet();
  const { isDark, toggleTheme } = useAppContext();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar px-5 pt-4 pb-24">
      <div className="glass-card p-6 mb-6 flex flex-col items-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-ink to-ink-light p-1 mb-4 shadow-lg">
          <div className="w-full h-full rounded-full bg-cream flex items-center justify-center border-2 border-cream">
            <Wallet className="w-8 h-8 text-ink" strokeWidth={1.5} />
          </div>
        </div>
        <h2 className="text-lg font-semibold text-ink mb-2">
          {connected ? 'Seeker User' : 'Not Connected'}
        </h2>
        {connected ? (
          <p className="text-xs font-mono text-ink-light bg-pearl px-3 py-1 rounded-full">
            {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
          </p>
        ) : (
          <div className="mt-2 md:hidden">
            <WalletMultiButton />
          </div>
        )}
      </div>

      <div className="mb-8">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-light mb-2 px-2">Preferences</h3>
        <div className="glass-card px-5 py-2">
          <SettingRow 
            icon={isDark ? Moon : Sun} 
            title="Theme" 
            description="Academic Minimalism"
            control={<Toggle active={isDark} onChange={toggleTheme} />} 
          />
          <SettingRow 
            icon={Volume2} 
            title="ASMR Sound Design" 
            description="High-end clicks & chimes"
            control={<Toggle active={soundEnabled} onChange={() => setSoundEnabled(!soundEnabled)} />} 
          />
          <SettingRow 
            icon={Vibrate} 
            title="Haptics" 
            description="Precise multi-level feedback"
            control={<Toggle active={hapticsEnabled} onChange={() => setHapticsEnabled(!hapticsEnabled)} />} 
          />
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-light mb-2 px-2">Legal</h3>
        <div className="glass-card px-5 py-2">
          <SettingRow 
            icon={Shield} 
            title="Privacy Policy" 
            description="Non-custodial, No-KYC"
            control={<button className="text-xs font-medium text-ink bg-pearl px-3 py-1.5 rounded-full">View</button>} 
          />
          <SettingRow 
            icon={FileText} 
            title="Risk Disclaimer" 
            description="User responsibility"
            control={<button className="text-xs font-medium text-ink bg-pearl px-3 py-1.5 rounded-full">View</button>} 
          />
        </div>
      </div>
    </div>
  );
};
