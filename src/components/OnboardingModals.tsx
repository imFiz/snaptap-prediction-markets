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
        
        <h2 className="text-2xl font-bold text-ink mb-2">Privacy & Terms</h2>
        <p className="text-sm text-ink-light mb-6 shrink-0">Please read and accept our terms before using SnapTap.</p>
        
        <div className="flex-1 overflow-y-auto hide-scrollbar bg-pearl/30 rounded-2xl p-5 mb-6 text-sm text-ink-light space-y-4 border border-pearl-dark/50">
          <div>
            <h4 className="font-bold text-ink mb-1">1. Non-Custodial Nature</h4>
            <p>SnapTap is a non-custodial aggregator. We do not hold, manage, or have access to your funds. All transactions are executed directly between your wallet and decentralized protocols.</p>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">2. No KYC & Data Collection</h4>
            <p>We do not collect Personally Identifiable Information (PII). We only store your chosen username and wallet address locally or on decentralized networks to provide the service.</p>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">3. Blockchain Immutability</h4>
            <p>All transactions on the Solana blockchain are permanent and public. SnapTap cannot reverse, refund, or modify any transaction once confirmed.</p>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">4. Assumption of Risk</h4>
            <p>Trading prediction markets involves significant financial risk. Smart contract vulnerabilities, regulatory actions, or extreme market volatility may result in total loss of funds. You are solely responsible for your decisions.</p>
          </div>
          <p className="text-xs font-mono mt-4 pt-4 border-t border-pearl-dark/50">Effective Date: March 25, 2026</p>
        </div>

        <button 
          onClick={handleAccept}
          className="w-full py-4 bg-ink text-cream rounded-full font-bold text-sm flex items-center justify-center gap-2 hover:bg-ink-light transition-colors shrink-0"
        >
          <Check className="w-5 h-5" />
          I Accept & Understand
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
      feedback.playClick(); // play error sound ideally, but click is fine
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
        
        <h2 className="text-2xl font-bold text-ink mb-2">Choose Username</h2>
        <p className="text-sm text-ink-light mb-6">Set your identity on the SnapTap network.</p>
        
        <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 mb-6 flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-warning font-medium leading-relaxed">
            Warning: Your username is permanently linked to your wallet address and cannot be changed later.
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
