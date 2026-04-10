export type MarketCategory = string;
export type Currency = 'SOL' | 'USDC' | 'USDT' | 'SKR';

export interface MarketOption {
  id: string;
  title: string;
  yesProbability: number;
  noProbability: number;
  status: 'active' | 'closed' | 'resolved';
  resolution?: string | null;
}

export interface Market {
  id: string;
  provider: 'Jupiter';
  title: string;
  category: MarketCategory;
  poolSize: number;
  closingTime: string;
  status: 'active' | 'closed' | 'resolved';
  rules: string;
  imageUrl?: string | null;
  options: MarketOption[];
}

// Mock conversion rates (1 unit to USDC)
const CONVERSION_RATES: Record<Currency, number> = {
  USDC: 1,
  USDT: 1,
  SOL: 150.25,
  SKR: 0.05,
};

export class AggregatorService {
  static getConversionRate(from: Currency, to: Currency): number {
    const fromRate = CONVERSION_RATES[from];
    const toRate = CONVERSION_RATES[to];
    return fromRate / toRate;
  }

  // 1. Workflow: Betting & Referral Injection (Input) - API Data Fetching
  static async fetchMarkets(): Promise<Market[]> {
    try {
      // Call our backend API which handles Jupiter integration and caching
      const response = await fetch('/api/markets');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Failed to fetch markets from backend, using fallback:', error);
    }
    
    // Fallback data in case the backend is unreachable (e.g., static hosting)
    return [
      {
        id: 'jup-sol-eth-2026',
        provider: 'Jupiter',
        title: 'Solana to surpass Ethereum in daily active users by end of 2026?',
        category: 'Crypto',
        poolSize: 3400000,
        closingTime: '2026-12-31T23:59:59Z',
        status: 'active',
        rules: 'This market resolves to Yes if Solana has more daily active users than Ethereum on December 31, 2026.',
        options: [
          {
            id: 'opt-1',
            title: 'Yes / No',
            yesProbability: 0.55,
            noProbability: 0.45,
            status: 'active'
          }
        ]
      },
      {
        id: 'jup-doge-1',
        provider: 'Jupiter',
        title: 'Dogecoin to reach $1 in 2026?',
        category: 'Crypto',
        poolSize: 5600000,
        closingTime: '2026-12-31T23:59:59Z',
        status: 'active',
        rules: 'Resolves to Yes if Dogecoin hits $1.00 on any major exchange.',
        options: [
          {
            id: 'opt-2',
            title: 'Yes / No',
            yesProbability: 0.15,
            noProbability: 0.85,
            status: 'active'
          }
        ]
      }
    ];
  }

  // Transaction Construction & Referral Injection
  static async buildBetTransaction(
    marketId: string, 
    outcome: 'Yes' | 'No', 
    amount: number, 
    currency: Currency,
    userPubkey: string
  ): Promise<{ base64Tx: string }> {
    console.log(`[Frontend] Requesting bet transaction from backend for ${marketId}`);
    
    try {
      const response = await fetch('/api/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId,
          outcome,
          amount,
          currency,
          userPubkey
        })
      });

      if (!response.ok) {
        throw new Error('Backend failed to construct transaction');
      }

      const data = await response.json();
      return { base64Tx: data.base64Tx };

    } catch (error) {
      console.error('Failed to build transaction via backend:', error);
      throw error;
    }
  }

  // 2. Workflow: Monitoring & Payout (Output) - Claim Transaction
  static async buildClaimTransaction(
    positionId: string,
    userPubkey: string
  ): Promise<{ base64Tx: string }> {
    console.log(`[Frontend] Requesting claim/settle tx from backend for position ${positionId}`);
    
    try {
      const response = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionId,
          userPubkey
        })
      });

      if (!response.ok) {
        throw new Error('Backend failed to construct claim transaction');
      }

      const data = await response.json();
      return { base64Tx: data.base64Tx };

    } catch (error) {
      console.error('Failed to build claim transaction via backend:', error);
      throw error;
    }
  }
}
