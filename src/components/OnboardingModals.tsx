import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, User, Check, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { feedback } from '../utils/feedback';

export const TermsModal = () => {
  const { acceptTerms } = useAppContext();

  const handleAccept = () => {
    feedback.playClick();
    acceptTerms();
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-cream/95 backdrop-blur-md flex items-center justify-center p-6"
    >
      <div className="w-full max-w-md bg-cream rounded-[32px] p-8 border border-pearl-dark shadow-2xl flex flex-col max-h-[85vh]">
        <div className="w-16 h-16 rounded-full bg-pearl flex items-center justify-center mb-6 shrink-0">
          <ShieldAlert className="w-8 h-8 text-ink" strokeWidth={1.5} />
        </div>
        
        <h2 className="text-2xl font-bold text-ink mb-2">Terms & Risk Disclosure</h2>
        <p className="text-sm text-ink-light mb-6 shrink-0">Please read carefully before using SnapTap.</p>
        
        <div className="flex-1 overflow-y-auto hide-scrollbar bg-pearl/30 rounded-2xl p-5 mb-6 text-sm text-ink-light space-y-4 border border-pearl-dark/50">
          <div>
            <h4 className="font-bold text-ink mb-1">1. Nature of the Platform</h4>
            <p>SnapTap is a decentralized prediction market platform on the Solana blockchain, powered by the TxODDS on-chain sports data oracle. Odds and match data are sourced from TxLINE and cryptographically verified on-chain. SnapTap is not a bookmaker and does not set odds.</p>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">2. Financial Risk</h4>
            <p>Participating in prediction markets carries significant financial risk. You may lose some or all of your wagered funds. Past win rates do not predict future results. Never wager more than you can afford to lose. This platform is not suitable for minors.</p>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">3. Non-Custodial & On-Chain</h4>
            <p>SnapTap is fully non-custodial. We do not hold, manage, or have access to your funds at any time. All bets are executed as Solana transactions directly from your wallet. Blockchain transactions are irreversible — SnapTap cannot refund, reverse, or modify any confirmed transaction.</p>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">4. Sports Data & Oracle</h4>
            <p>Match results and odds are provided by the TxODDS TxLINE Oracle, a decentralized sports data protocol on Solana. Match outcomes used for settlement are determined by on-chain oracle data, which is the final and binding source of truth. SnapTap has no ability to influence outcome settlement.</p>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">5. Test Mode</h4>
            <p>Test Mode allows you to explore the platform using a virtual balance (TEST tokens) with zero financial risk. Test Mode bets are simulated and carry no real-world value. Real match data and odds are still displayed in Test Mode.</p>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">6. Regulatory Compliance</h4>
            <p>You are solely responsible for ensuring your use of this platform complies with the laws and regulations of your jurisdiction. Users from jurisdictions where prediction markets or sports betting is prohibited must not use this platform.</p>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">7. No Warranties</h4>
            <p>SnapTap is provided "as is" without warranties of any kind. We are not responsible for losses due to smart contract bugs, network congestion, oracle delays, or any force majeure events affecting the Solana blockchain.</p>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">8. Privacy</h4>
            <p>We do not collect Personally Identifiable Information (PII). Your wallet address and username are stored locally in your browser. No data is sold to third parties. Blockchain transactions are public by nature of the Solana network.</p>
          </div>
          <p className="text-xs font-mono mt-4 pt-4 border-t border-pearl-dark/50">SnapTap · Effective Date: June 27, 2026 · Powered by TxODDS TxLINE</p>
        </div>

        <button 
          onClick={handleAccept}
          className="w-full py-4 bg-ink text-cream rounded-full font-bold text-sm flex items-center justify-center gap-2 hover:bg-ink-light transition-colors shrink-0"
        >
          <Check className="w-5 h-5" />
          I Understand the Risks — Continue
        </button>
      </div>
    </motion.div>
  );
};

export const UsernameModal = () => {
  const { setUsername } = useAppContext();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.length < 3) {
      setError('Username must be at least 3 characters');
      feedback.playClick();
      return;
    }
    if (input.length > 15) {
      setError('Username must be less than 15 characters');
      feedback.playClick();
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(input)) {
      setError('Only letters, numbers, and underscores allowed');
      feedback.playClick();
      return;
    }
    
    feedback.playSuccess();
    setUsername(input);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-cream/95 backdrop-blur-md flex items-center justify-center p-6"
    >
      <div className="w-full max-w-md bg-cream rounded-[32px] p-8 border border-pearl-dark shadow-2xl flex flex-col">
        <div className="w-16 h-16 rounded-full bg-pearl flex items-center justify-center mb-6">
          <User className="w-8 h-8 text-ink" strokeWidth={1.5} />
        </div>
        
        <h2 className="text-2xl font-bold text-ink mb-2">Choose Your Handle</h2>
        <p className="text-sm text-ink-light mb-6">Set your identity on the SnapTap network.</p>
        
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6 flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-primary font-medium leading-relaxed">
            Your username will be displayed alongside your wallet address. You can update it later in Settings.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <input 
              type="text" 
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError('');
              }}
              placeholder="Enter username"
              className="w-full bg-pearl border border-pearl-dark rounded-2xl px-5 py-4 text-ink font-medium outline-none focus:border-ink transition-colors"
              autoFocus
            />
            {error && <p className="text-xs text-danger mt-2 px-2">{error}</p>}
          </div>

          <button 
            type="submit"
            disabled={!input.trim()}
            className="w-full py-4 bg-ink text-cream rounded-full font-bold text-sm flex items-center justify-center gap-2 hover:bg-ink-light transition-colors disabled:opacity-50"
          >
            Confirm Username
          </button>
        </form>
      </div>
    </motion.div>
  );
};
