import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Moon, Sun, Volume2, Vibrate, Shield, FileText, Wallet, X, FlaskConical, Plus } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useAppContext } from '../context/AppContext';
import { feedback } from '../utils/feedback';

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

const LegalModal = ({ title, content, onClose }: { title: string, content: React.ReactNode, onClose: () => void }) => (
  <motion.div 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-[100] bg-cream/95 backdrop-blur-md flex items-center justify-center p-6"
  >
    <div className="w-full max-w-lg bg-cream rounded-[32px] p-8 border border-pearl-dark shadow-2xl flex flex-col max-h-[85vh]">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-ink">{title}</h2>
        <button onClick={onClose} className="p-2 bg-pearl rounded-full text-ink hover:bg-pearl-dark transition-colors">
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto hide-scrollbar text-sm text-ink-light space-y-4 pr-2">
        {content}
      </div>
    </div>
  </motion.div>
);

export const SettingsHub = () => {
  const { connected, publicKey } = useWallet();
  const { 
    isDark, toggleTheme, 
    soundEnabled, toggleSound, 
    vibrationEnabled, toggleVibration, 
    username, userLevel,
    isTestMode, toggleTestMode,
    testBalance, addTestBalance
  } = useAppContext();
  const [activeModal, setActiveModal] = useState<'privacy' | 'terms' | null>(null);

  const openModal = (modal: 'privacy' | 'terms') => {
    feedback.playClick();
    setActiveModal(modal);
  };

  const closeModal = () => {
    feedback.playClick();
    setActiveModal(null);
  };

  const handleAddSTcoin = () => {
    feedback.playSuccess();
    addTestBalance(1000);
  };

  const privacyContent = (
    <>
      <p className="font-bold text-ink">Effective Date: March 25, 2026</p>
      <p>SnapTap is a decentralized, non-custodial platform. We prioritize your privacy and security by minimizing data collection.</p>
      <h4 className="font-bold text-ink mt-4">1. Data We Collect</h4>
      <p>We do not collect personally identifiable information (PII) such as names, emails, or physical addresses. The only data we store is your chosen username and your public wallet address.</p>
      <h4 className="font-bold text-ink mt-4">2. Non-Custodial Architecture</h4>
      <p>We do not have access to your private keys or funds. All transactions are signed by you and executed directly on the Solana blockchain.</p>
      <h4 className="font-bold text-ink mt-4">3. Blockchain Immutability</h4>
      <p>Please be aware that all transactions and interactions with smart contracts are permanently recorded on the public Solana blockchain. This data is public and cannot be altered or deleted by SnapTap.</p>
      <h4 className="font-bold text-ink mt-4">4. Local Storage</h4>
      <p>We use local storage on your device to save your preferences (theme, sound, vibration) and your acceptance of these terms. We do not use tracking cookies.</p>
    </>
  );

  const termsContent = (
    <>
      <p className="font-bold text-ink">Effective Date: March 25, 2026</p>
      <p>By using SnapTap, you agree to the following terms and acknowledge the associated risks.</p>
      <h4 className="font-bold text-ink mt-4">1. Assumption of Risk</h4>
      <p>Prediction markets and cryptocurrency trading involve a high degree of risk. Prices are highly volatile. You should never wager more than you can afford to lose.</p>
      <h4 className="font-bold text-ink mt-4">2. Smart Contract Risks</h4>
      <p>SnapTap aggregates liquidity from decentralized protocols. While these protocols are audited, smart contracts can contain vulnerabilities. SnapTap is not liable for any loss of funds due to smart contract exploits or failures.</p>
      <h4 className="font-bold text-ink mt-4">3. Regulatory Compliance</h4>
      <p>The regulatory environment for prediction markets varies by jurisdiction. It is your sole responsibility to ensure that your use of SnapTap complies with all applicable local laws and regulations.</p>
      <h4 className="font-bold text-ink mt-4">4. No Guarantees</h4>
      <p>SnapTap provides the interface "as is" without any warranties. We do not guarantee the accuracy of market data, odds, or the continuous availability of the service.</p>
    </>
  );

  return (
    <>
      <AnimatePresence>
        {activeModal === 'privacy' && <LegalModal title="Privacy Policy" content={privacyContent} onClose={closeModal} />}
        {activeModal === 'terms' && <LegalModal title="Risk Disclaimer & Terms" content={termsContent} onClose={closeModal} />}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto hide-scrollbar px-5 pt-4 pb-24">
        <div className="glass-card p-6 mb-6 flex flex-col items-center relative overflow-hidden">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-ink to-ink-light p-1 mb-4 shadow-lg relative z-10">
            <div className="w-full h-full rounded-full bg-cream flex items-center justify-center border-2 border-cream">
              <Wallet className="w-8 h-8 text-ink" strokeWidth={1.5} />
            </div>
          </div>
          
          <h2 className="text-xl font-bold text-ink mb-1 relative z-10">
            {connected ? (username || 'Anonymous') : 'Not Connected'}
          </h2>
          
          {connected ? (
            <div className="flex flex-col items-center w-full relative z-10">
              <p className="text-xs font-mono text-ink-light bg-pearl px-3 py-1 rounded-full mb-4">
                {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
              </p>
              
              <div className="w-full bg-pearl/50 rounded-2xl p-4 border border-pearl-dark/50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-ink text-cream px-2 py-1 rounded-md">
                    {userLevel.name}
                  </span>
                  <span className="text-xs font-mono text-ink-light">
                    ${userLevel.currentVolume.toFixed(0)} Vol
                  </span>
                </div>
                
                {userLevel.nextTierVolume !== null && (
                  <div className="w-full mt-3">
                    <div className="flex justify-between text-[10px] text-ink-light mb-1.5 font-mono">
                      <span>Progress to {userLevel.nextTierVolume >= 10000 ? 'Oracle' : userLevel.nextTierVolume >= 2500 ? 'Whale' : userLevel.nextTierVolume >= 500 ? 'Pro' : 'Challenger'}</span>
                      <span>${userLevel.nextTierVolume}</span>
                    </div>
                    <div className="h-1.5 w-full bg-pearl-dark rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-ink rounded-full transition-all duration-1000 ease-out" 
                        style={{ width: `${Math.min((userLevel.currentVolume / userLevel.nextTierVolume) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2 relative z-10">
              <WalletMultiButton className="!bg-ink !text-cream !rounded-full !font-bold !h-10 !px-6 hover:!bg-ink-light transition-colors" />
            </div>
          )}
        </div>

        <div className="mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-light mb-2 px-2">Preferences</h3>
          <div className="glass-card px-5 py-2">
            <SettingRow 
              icon={FlaskConical} 
              title="Test Mode" 
              description="Practice with STcoin"
              control={<Toggle active={isTestMode} onChange={toggleTestMode} />} 
            />
            {isTestMode && (
              <div className="py-3 border-b border-pearl-dark/30 flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-ink-light">STcoin Balance</span>
                  <span className="text-sm font-mono font-bold text-ink">{testBalance.toFixed(2)}</span>
                </div>
                <button 
                  onClick={handleAddSTcoin}
                  className="flex items-center gap-1 text-xs font-medium bg-warning/10 text-warning px-3 py-1.5 rounded-full hover:bg-warning/20 transition-colors"
                >
                  <Plus size={14} />
                  Get 1,000
                </button>
              </div>
            )}
            <SettingRow 
              icon={isDark ? Moon : Sun} 
              title="Theme" 
              description="Academic Minimalism"
              control={<Toggle active={isDark} onChange={toggleTheme} />} 
            />
            <SettingRow 
              icon={Volume2} 
              title="Sound" 
              description="Satisfying clicks & chimes"
              control={<Toggle active={soundEnabled} onChange={toggleSound} />} 
            />
            <SettingRow 
              icon={Vibrate} 
              title="Vibration" 
              description="Haptic feedback on actions"
              control={<Toggle active={vibrationEnabled} onChange={toggleVibration} />} 
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
              control={<button onClick={() => openModal('privacy')} className="text-xs font-medium text-ink bg-pearl px-3 py-1.5 rounded-full hover:bg-pearl-dark transition-colors">View</button>} 
            />
            <SettingRow 
              icon={FileText} 
              title="Risk Disclaimer" 
              description="User responsibility"
              control={<button onClick={() => openModal('terms')} className="text-xs font-medium text-ink bg-pearl px-3 py-1.5 rounded-full hover:bg-pearl-dark transition-colors">View</button>} 
            />
          </div>
        </div>
      </div>
    </>
  );
};
