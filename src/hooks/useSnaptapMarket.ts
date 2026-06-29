import { useState, useEffect, useCallback } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import { getProgram, fetchMarket } from '../lib/snaptapClient';

export interface MarketState {
  resolved: boolean;
  winningOutcome: number;
  resolutionRoot: number[];
  resolvedTs: number;
  pools: { toNumber: () => number }[];
  totalPool: { toNumber: () => number };
  closeTs: number;
  fixtureId: number;
  stakeMint: unknown;
}

interface UseSnaptapMarketResult {
  market: MarketState | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetch and cache a single on-chain Market account.
 * Refreshed on mount and whenever `refresh()` is called.
 */
export function useSnaptapMarket(
  fixtureId: number | null,
  anchorWallet: AnchorWallet | undefined
): UseSnaptapMarketResult {
  const { connection } = useConnection();
  const [market, setMarket] = useState<MarketState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (fixtureId == null || !anchorWallet) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const program = getProgram(connection, anchorWallet);
        const data = await fetchMarket(program, fixtureId);
        if (!cancelled) setMarket(data as unknown as MarketState);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [fixtureId, anchorWallet, connection, tick]);

  return { market, loading, error, refresh };
}
