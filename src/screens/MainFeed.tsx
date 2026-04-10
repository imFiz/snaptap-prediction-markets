import React, { useEffect, useState, useMemo } from 'react';
import { AggregatorService, Currency, Market, MarketCategory } from '../services/AggregatorService';
import { MarketCard } from '../components/MarketCard';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { motion } from 'motion/react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAppContext } from '../context/AppContext';

export const MainFeed = () => {
  const { publicKey } = useWallet();
  const { addBet, isTestMode } = useAppContext();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [marketStatusFilter, setMarketStatusFilter] = useState<'active' | 'completed'>('active');

  const categories = useMemo(() => {
    const cats = new Set(markets.map(m => m.category));
    return Array.from(cats).sort();
  }, [markets]);

  useEffect(() => {
    const loadMarkets = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await AggregatorService.fetchMarkets();
        setMarkets(data);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to load markets');
      } finally {
        setLoading(false);
      }
    };
    loadMarkets();
  }, []);

  const handleBet = async (eventId: string, optionId: string, outcome: 'Yes' | 'No', amount: number, currency: Currency) => {
    if (!publicKey) {
      alert("Please connect your wallet first.");
      return;
    }
    
    const market = markets.find(m => m.id === eventId);
    if (!market) return;

    const option = market.options.find(o => o.id === optionId);
    if (!option) return;

    if (option.status !== 'active') {
      alert("This option is no longer active.");
      return;
    }

    console.log(`Initiating bet: ${amount} ${currency} on ${outcome} for option ${optionId}`);
    
    try {
      // 1. Transaction Construction & Referral Injection (Backend Call)
      const { base64Tx } = await AggregatorService.buildBetTransaction(
        optionId, outcome, amount, currency, publicKey.toBase58()
      );

      // 2. Seed Vault Signing (Frontend)
      console.log('Received Base64 Tx from backend:', base64Tx);
      console.log('Prompting Seed Vault / Wallet Adapter for biometric signature...');
      
      // In a real app:
      // const txBuffer = Buffer.from(base64Tx, 'base64');
      // const transaction = VersionedTransaction.deserialize(txBuffer);
      // const signature = await sendTransaction(transaction, connection);
      
      // Simulate wallet approval delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      console.log('Transaction signed and sent successfully!');

      const probability = outcome === 'Yes' ? option.yesProbability : option.noProbability;
      const potentialPayout = amount / probability;

      // 3. UX Confirmation
      addBet({
        marketId: optionId,
        marketTitle: `${market.title} - ${option.title}`,
        outcome,
        amount,
        currency,
        potentialPayout
      });
      
    } catch (err) {
      console.error('Betting failed:', err);
    }
  };

  const filteredMarkets = markets.filter(m => {
    const matchesCategory = activeCategory === 'All' || m.category === activeCategory;
    const isCompleted = m.status === 'closed' || m.status === 'resolved';
    const matchesStatus = marketStatusFilter === 'active' ? m.status === 'active' : isCompleted;
    return matchesCategory && matchesStatus;
  });

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar px-5 pt-4 pb-24">
      <div className="flex flex-col gap-4 mb-4">
        {/* Status Toggle */}
        <div className="flex bg-pearl rounded-full p-1 w-full max-w-xs mx-auto">
          <button
            onClick={() => setMarketStatusFilter('active')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-full transition-colors ${
              marketStatusFilter === 'active' ? 'bg-ink text-cream shadow-sm' : 'text-ink-light'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setMarketStatusFilter('completed')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-full transition-colors ${
              marketStatusFilter === 'completed' ? 'bg-ink text-cream shadow-sm' : 'text-ink-light'
            }`}
          >
            History
          </button>
        </div>

        {/* Category Filter */}
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar w-full">
          <button 
            onClick={() => setActiveCategory('All')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
              activeCategory === 'All' ? 'bg-ink text-cream' : 'bg-pearl text-ink-light'
            }`}
          >
            All Markets
          </button>
          {categories.map(cat => (
            <button 
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                activeCategory === cat ? 'bg-ink text-cream' : 'bg-pearl text-ink-light'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {loading ? (
          <>
            <SkeletonLoader />
            <SkeletonLoader />
            <SkeletonLoader />
          </>
        ) : error ? (
          <div className="glass-card p-6 text-center mt-4">
            <p className="text-danger font-medium mb-2">Error Loading Markets</p>
            <p className="text-sm text-ink-light">{error}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="mt-4 px-4 py-2 bg-pearl text-ink rounded-full text-sm font-medium hover:bg-pearl-dark transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : filteredMarkets.length === 0 ? (
          <div className="glass-card p-6 text-center mt-4">
            <p className="text-ink-light">No markets found in this category.</p>
          </div>
        ) : (
          filteredMarkets.map((market, index) => (
            <motion.div
              key={market.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <MarketCard market={market} onBet={handleBet} />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};
