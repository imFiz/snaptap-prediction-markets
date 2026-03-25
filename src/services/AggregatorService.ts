export type MarketCategory = 'Crypto' | 'World' | 'Sports' | 'Tech';
export type Currency = 'SOL' | 'USDC' | 'USDT' | 'SKR';

export interface Market {
  id: string;
  provider: 'Jupiter';
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
      console.error('Failed to fetch markets from backend:', error);
    }
    
    return [];
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
      throw new Error('Transaction construction failed');
    }
  }

  // 2. Workflow: Monitoring & Payout (Output) - Claim Transaction
  static async buildClaimTransaction(
    positionId: string,
    userPubkey: string
  ): Promise<{ base64Tx: string }> {
    console.log(`[Frontend] Constructing claim/settle tx for position ${positionId}`);
    
    // Simulate backend generating a Settle/Redeem transaction
    const mockBase64Tx = btoa('mock_claim_transaction_data');
    
    return new Promise((resolve) => {
      setTimeout(() => resolve({ base64Tx: mockBase64Tx }), 800);
    });
  }
}
