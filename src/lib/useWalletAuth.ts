import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';

const LS_KEY = 'walletAuthPubkey';

function getPersistedPubkey(): string | null {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

function persistPubkey(pubkey: string | null) {
  try {
    if (pubkey) {
      localStorage.setItem(LS_KEY, pubkey);
    } else {
      localStorage.removeItem(LS_KEY);
    }
  } catch {
    // ignore
  }
}

export function useWalletAuth() {
  const { publicKey, signMessage } = useWallet();

  const [authedPubkey, setAuthedPubkey] = useState<string | null>(() => getPersistedPubkey());
  const [isAuthed, setIsAuthed] = useState<boolean>(() => getPersistedPubkey() !== null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!publicKey) {
      setError('Wallet not connected');
      return false;
    }
    if (!signMessage) {
      setError('This wallet does not support message signing');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const pubkeyStr = publicKey.toBase58();

      // 1. Request nonce
      const nonceRes = await fetch('/api/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pubkey: pubkeyStr }),
      });
      if (!nonceRes.ok) throw new Error(`Nonce request failed: ${nonceRes.status}`);
      const { message } = await nonceRes.json() as { nonce: string; message: string };

      // 2. Sign the message bytes
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);

      // 3. Base58-encode the signature
      const signatureB58 = bs58.encode(signatureBytes);

      // 4. Verify signature with backend
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pubkey: pubkeyStr, signature: signatureB58 }),
      });
      if (!verifyRes.ok) throw new Error(`Verification failed: ${verifyRes.status}`);
      const { pubkey } = await verifyRes.json() as { token: string; pubkey: string };

      // 5. Persist authed state
      persistPubkey(pubkey);
      setAuthedPubkey(pubkey);
      setIsAuthed(true);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed';
      setError(msg);
      setIsAuthed(false);
      setAuthedPubkey(null);
      persistPubkey(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signMessage]);

  const signOut = useCallback(() => {
    persistPubkey(null);
    setAuthedPubkey(null);
    setIsAuthed(false);
    setError(null);
  }, []);

  return { signIn, signOut, isAuthed, isLoading, authedPubkey, error };
}
