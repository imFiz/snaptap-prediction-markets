import React from 'react';
import { ShieldCheck, ExternalLink } from 'lucide-react';
import type { MarketState } from '../hooks/useSnaptapMarket';
import { PROGRAM_ID, marketPda } from '../lib/snaptapClient';

interface ResolutionReceiptProps {
  market: MarketState;
  fixtureId: number;
}

const OUTCOME_LABELS: Record<number, string> = {
  0: 'Home Win',
  1: 'Draw',
  2: 'Away Win',
};

/** Convert number[32] to a hex string, showing first and last 6 chars. */
function shortHex(bytes: number[]): string {
  const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 6)}…${hex.slice(-6)}`;
}

function fullHex(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifiable on-chain resolution receipt.
 * Shows the winning outcome, Merkle resolutionRoot (truncated + copyable),
 * resolution timestamp, and a Solana Explorer deep-link for the market PDA.
 */
export const ResolutionReceipt: React.FC<ResolutionReceiptProps> = ({ market, fixtureId }) => {
  const outcomeLabel = OUTCOME_LABELS[market.winningOutcome] ?? `Outcome ${market.winningOutcome}`;
  const rootHex = fullHex(market.resolutionRoot);
  const shortRoot = shortHex(market.resolutionRoot);
  const resolvedDate = new Date(market.resolvedTs * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  // Derive market PDA address string for explorer link
  const marketAddress = marketPda(fixtureId).toBase58();
  const explorerUrl = `https://explorer.solana.com/address/${marketAddress}?cluster=devnet`;
  const programUrl = `https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`;

  const copyRoot = () => navigator.clipboard?.writeText(rootHex).catch(() => undefined);

  return (
    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 mb-1">
        <ShieldCheck className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
          Verifiable Resolution
        </span>
      </div>

      <div className="flex justify-between items-center">
        <span className="text-xs text-ink-light">Outcome</span>
        <span className="text-xs font-bold text-ink">{outcomeLabel}</span>
      </div>

      <div className="flex justify-between items-center gap-2">
        <span className="text-xs text-ink-light shrink-0">Merkle root</span>
        <button
          onClick={copyRoot}
          title="Click to copy full root"
          className="text-[10px] font-mono text-ink bg-ink/5 rounded px-1.5 py-0.5 hover:bg-ink/10 transition-colors truncate max-w-[140px]"
        >
          {shortRoot}
        </button>
      </div>

      <div className="flex justify-between items-center">
        <span className="text-xs text-ink-light">Resolved</span>
        <span className="text-[10px] font-mono text-ink">{resolvedDate}</span>
      </div>

      <div className="flex gap-2 mt-1">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
        >
          Market PDA
          <ExternalLink className="w-3 h-3" />
        </a>
        <span className="text-ink-light/40 text-[10px]">·</span>
        <a
          href={programUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] font-bold text-ink-light hover:underline"
        >
          Program
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};
