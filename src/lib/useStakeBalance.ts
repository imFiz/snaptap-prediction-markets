import { useState, useCallback, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { STAKE_MINT, STAKE_DECIMALS } from './snaptapClient';

export function useStakeBalance(): { balance: number; refresh: () => void } {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState(0);

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setBalance(0);
      return;
    }
    try {
      const ata = await getAssociatedTokenAddress(STAKE_MINT, publicKey, false);
      const acct = await getAccount(connection, ata);
      setBalance(Number(acct.amount) / Math.pow(10, STAKE_DECIMALS));
    } catch {
      // ATA doesn't exist yet — balance is 0
      setBalance(0);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balance, refresh };
}
