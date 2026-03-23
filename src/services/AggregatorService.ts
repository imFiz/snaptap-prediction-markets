export type MarketCategory = 'Crypto' | 'World' | 'Sports' | 'Tech';
export type Currency = 'SOL' | 'USDC' | 'USDT' | 'SKR';

export interface Market {
  id: string;
  provider: 'Drift' | 'Jupiter';
  title: string;
  category: MarketCategory;
  poolSize: number;
  closingTime: string;
  yesProbability: number;
  noProbability: number;
  resolved?: boolean;
}

// Mock conversion rates (1 unit to USDC)
const CONVERSION_RATES: Record<Currency, number> = {
  USDC: 1,
  USDT: 1,
  SOL: 150.25,
  SKR: 0.05,
};

// Realistic mock data reflecting actual Drift and Jupiter prediction markets
const mockMarkets: Market[] = [
  {
    id: 'drift-btc-100k',
    provider: 'Drift',
    title: 'Will Bitcoin hit $100k by end of 2026?',
    category: 'Crypto',
    poolSize: 1250000,
    closingTime: '2026-12-31T23:59:59Z',
    yesProbability: 0.65,
    noProbability: 0.35,
  },
  {
    id: 'jup-sol-eth',
    provider: 'Jupiter',
    title: 'Solana to surpass Ethereum in daily active users?',
    category: 'Crypto',
    poolSize: 3400000,
    closingTime: '2026-12-31T23:59:59Z',
    yesProbability: 0.55,
    noProbability: 0.45,
  },
  {
    id: 'drift-eth-etf',
    provider: 'Drift',
    title: 'Ethereum ETF net inflows > $5B in 2026?',
    category: 'Crypto',
    poolSize: 890000,
    closingTime: '2026-12-31T23:59:59Z',
    yesProbability: 0.48,
    noProbability: 0.52,
  },
  {
    id: 'jup-doge-1',
    provider: 'Jupiter',
    title: 'Dogecoin to reach $1 in 2026?',
    category: 'Crypto',
    poolSize: 5600000,
    closingTime: '2026-12-31T23:59:59Z',
    yesProbability: 0.15,
    noProbability: 0.85,
  },
  {
    id: 'drift-fed-rates',
    provider: 'Drift',
    title: 'US Fed to cut rates in Q3 2026?',
    category: 'World',
    poolSize: 2100000,
    closingTime: '2026-09-30T23:59:59Z',
    yesProbability: 0.78,
    noProbability: 0.22,
  },
  {
    id: 'jup-spacex-mars',
    provider: 'Jupiter',
    title: 'SpaceX to land uncrewed Starship on Mars in 2026?',
    category: 'World',
    poolSize: 1450000,
    closingTime: '2026-12-31T23:59:59Z',
    yesProbability: 0.35,
    noProbability: 0.65,
  },
  {
    id: 'drift-tiktok-ban',
    provider: 'Drift',
    title: 'TikTok banned in the US by end of 2026?',
    category: 'World',
    poolSize: 3200000,
    closingTime: '2026-12-31T23:59:59Z',
    yesProbability: 0.62,
    noProbability: 0.38,
  },
  {
    id: 'jup-apple-ar',
    provider: 'Jupiter',
    title: 'Apple to announce AR Glasses in WWDC 2026?',
    category: 'Tech',
    poolSize: 850000,
    closingTime: '2026-06-10T17:00:00Z',
    yesProbability: 0.42,
    noProbability: 0.58,
  },
  {
    id: 'drift-openai-gpt5',
    provider: 'Drift',
    title: 'OpenAI to release GPT-5 by Q2 2026?',
    category: 'Tech',
    poolSize: 4100000,
    closingTime: '2026-06-30T23:59:59Z',
    yesProbability: 0.88,
    noProbability: 0.12,
  },
  {
    id: 'jup-nvidia-4t',
    provider: 'Jupiter',
    title: 'Nvidia market cap to exceed $4 Trillion?',
    category: 'Tech',
    poolSize: 2750000,
    closingTime: '2026-12-31T23:59:59Z',
    yesProbability: 0.71,
    noProbability: 0.29,
  },
  {
    id: 'drift-madrid-ucl',
    provider: 'Drift',
    title: 'Real Madrid to win Champions League 2026?',
    category: 'Sports',
    poolSize: 500000,
    closingTime: '2026-05-30T20:00:00Z',
    yesProbability: 0.30,
    noProbability: 0.70,
  },
  {
    id: 'jup-lebron-retire',
    provider: 'Jupiter',
    title: 'LeBron James to retire after 25/26 season?',
    category: 'Sports',
    poolSize: 1100000,
    closingTime: '2026-06-30T23:59:59Z',
    yesProbability: 0.82,
    noProbability: 0.18,
  },
  {
    id: 'drift-world-cup',
    provider: 'Drift',
    title: 'Brazil to win FIFA World Cup 2026?',
    category: 'Sports',
    poolSize: 6800000,
    closingTime: '2026-07-19T20:00:00Z',
    yesProbability: 0.18,
    noProbability: 0.82,
  }
];

export class AggregatorService {
  static async fetchMarkets(): Promise<Market[]> {
    // In a production environment, this would fetch from:
    // 1. Drift API: https://mainnet-beta.api.drift.trade/markets
    // 2. Jupiter API/SDK
    // For this prototype, we simulate the network delay and return normalized data.
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(mockMarkets);
      }, 1000);
    });
  }

  static getConversionRate(from: Currency, to: Currency): number {
    const fromRate = CONVERSION_RATES[from];
    const toRate = CONVERSION_RATES[to];
    return fromRate / toRate;
  }

  static async placeBet(
    marketId: string, 
    outcome: 'Yes' | 'No', 
    amount: number, 
    currency: Currency,
    walletAddress: string
  ): Promise<{success: boolean, txId: string, convertedAmount: number, targetCurrency: string}> {
    
    // Determine target currency
    const targetCurrency = marketId.startsWith('drift') ? 'USDC' : 'USDC';
    
    // Calculate conversion
    const rate = this.getConversionRate(currency, targetCurrency as Currency);
    const convertedAmount = amount * rate;

    console.log(`[Aggregator] Routing bet to ${marketId.startsWith('drift') ? 'Drift' : 'Jupiter'}`);
    console.log(`[Aggregator] Converting ${amount} ${currency} -> ${convertedAmount.toFixed(2)} ${targetCurrency}`);

    // Simulate transaction routing and confirmation
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          txId: `tx_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`,
          convertedAmount,
          targetCurrency
        });
      }, 1500);
    });
  }
}
