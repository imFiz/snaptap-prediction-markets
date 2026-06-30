import { useWallet } from '@solana/wallet-adapter-react';
import { useCallback } from 'react';

/**
 * Ask the connected wallet to switch its active network to Solana Devnet.
 * Tries, in order:
 *   1. Phantom native provider:  window.solana.request({ method: 'changeNetwork', params: { network: 'devnet' } })
 *   2. Wallet Standard feature:   wallet.features['solana:changeChain'].changeChain('solana:devnet')
 * Returns true if a switch request was accepted, false if unsupported/rejected.
 * Either path pops the wallet's own confirmation UI ("Allow this site to switch network?").
 */
export function useDevnetSwitch() {
  const { wallet } = useWallet();

  const switchToDevnet = useCallback(async (): Promise<boolean> => {
    // 1) Phantom (and forks) native API
    try {
      const provider = (window as any).solana;
      if (provider && typeof provider.request === 'function') {
        await provider.request({ method: 'changeNetwork', params: { network: 'devnet' } });
        return true;
      }
    } catch (e) {
      // fall through to wallet-standard
    }

    // 2) Wallet Standard `solana:changeChain` feature
    try {
      const standardWallet = (wallet?.adapter as any)?.wallet;
      const feature = standardWallet?.features?.['solana:changeChain'];
      const changeChain = feature?.changeChain;
      if (typeof changeChain === 'function') {
        // Different wallets accept either a string or an object — try both shapes.
        try {
          await changeChain('solana:devnet');
        } catch {
          await changeChain({ chain: 'solana:devnet' });
        }
        return true;
      }
    } catch (e) {
      // unsupported or rejected
    }

    return false;
  }, [wallet]);

  return { switchToDevnet };
}
