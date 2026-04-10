import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";

const JUPITER_REFERRAL_ACCOUNT = 'AJdZhryzpDMmnSM7ymLVSJuBP1ARYfoiq1YMPXtsVj63';
const JUPITER_PREDICTION_API = 'https://api.jup.ag/prediction/v1'; // Target API

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Fetch Jupiter events on startup for debugging
  try {
    let allEvents: any[] = [];
    let start = 0;
    const maxPages = 10; // Fetch up to 100 events for debugging
    
    for (let i = 0; i < maxPages; i++) {
      const response = await fetch(`https://api.jup.ag/prediction/v1/events?start=${start}`);
      if (!response.ok) break;
      const data = await response.json();
      if (data && data.data) {
        allEvents = allEvents.concat(data.data);
      }
      if (!data.pagination?.hasNext) break;
      start += 10;
    }
    
    fs.writeFileSync('jupiter_events.json', JSON.stringify({ data: allEvents }, null, 2));
    console.log(`Jupiter Events written to jupiter_events.json (${allEvents.length} events)`);
  } catch (err) {
    console.error('Failed to fetch Jupiter events:', err);
  }

  // Cache for Jupiter API responses
  let cachedMarkets: any = null;
  let lastCacheTime = 0;
  const CACHE_TTL = 60 * 1000; // 1 minute

  // 1. Workflow: Betting & Referral Injection (Input) - API Data Fetching
  app.get("/api/markets", async (req, res) => {
    if (cachedMarkets && Date.now() - lastCacheTime < CACHE_TTL) {
      return res.json(cachedMarkets);
    }
    
    try {
      // Attempt to fetch from Jupiter Prediction Markets API
      // The API only returns 10 events per request, so we need to paginate
      let allEvents: any[] = [];
      let start = 0;
      const maxPages = 20; // Fetch up to 200 events to provide a good variety
      
      // Fetch pages concurrently in batches to speed up
      const batchSize = 5;
      for (let i = 0; i < maxPages; i += batchSize) {
        const promises = [];
        for (let j = 0; j < batchSize; j++) {
          promises.push(fetch(`https://api.jup.ag/prediction/v1/events?start=${start + j * 10}`).then(r => r.ok ? r.json() : null));
        }
        
        const results = await Promise.all(promises);
        let hasNext = false;
        
        for (const data of results) {
          if (data && data.data) {
            allEvents = allEvents.concat(data.data);
            if (data.pagination?.hasNext) hasNext = true;
          }
        }
        
        if (!hasNext) break;
        start += batchSize * 10;
        
        // Add a small delay between batches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (allEvents.length > 0) {
        // Normalize response to Snaptap format
        const normalized = [];
        
        const now = Date.now() / 1000; // Current time in seconds

        for (const event of allEvents) {
            // Only include active events (or events that have markets)
            if (!event.markets || event.markets.length === 0) continue;
            
            const options = [];
            let eventStatus: 'active' | 'closed' | 'resolved' = 'closed';
            let eventPoolSize = parseFloat(event.volumeUsd || '0') / 1000000;
            let maxCloseTime = 0;
            
            for (const market of event.markets) {
              // Calculate probabilities from pricing (microUSD)
              let yesProbability = 0.5;
              let noProbability = 0.5;
              
              if (market.pricing) {
                yesProbability = (market.pricing.buyYesPriceUsd ?? 500000) / 1000000;
                noProbability = (market.pricing.buyNoPriceUsd ?? 500000) / 1000000;
              }

              const yesProbPercent = Math.round(yesProbability * 100);
              const noProbPercent = Math.round(noProbability * 100);

              // Determine status
              let status: 'active' | 'closed' | 'resolved' = 'active';
              if (market.status === 'resolved' || market.status === 'voided') {
                status = 'resolved';
              } else if (market.status === 'closed' || (market.closeTime && market.closeTime < now) || yesProbPercent === 0 || yesProbPercent === 100) {
                status = 'closed';
              } else if (market.status === 'open') {
                status = 'active';
              } else {
                status = 'closed';
              }
              
              if (status === 'active') eventStatus = 'active';
              if (status === 'resolved' && eventStatus !== 'active') eventStatus = 'resolved';
              
              if (market.closeTime > maxCloseTime) {
                maxCloseTime = market.closeTime;
              }
              
              options.push({
                id: market.marketId,
                title: market.title || 'Yes / No',
                yesProbability: yesProbPercent,
                noProbability: noProbPercent,
                status,
                resolution: market.result
              });
            }
            
            if (options.length === 0) continue;
            
            const eventTitle = event.metadata?.title || event.title || 'Unknown Event';
            const categoryLabel = event.category ? event.category.charAt(0).toUpperCase() + event.category.slice(1) : 'Other';
            
            normalized.push({
              id: event.eventId,
              provider: 'Jupiter',
              title: eventTitle,
              category: categoryLabel,
              poolSize: eventPoolSize,
              closingTime: maxCloseTime > 0 ? new Date(maxCloseTime * 1000).toISOString() : new Date().toISOString(),
              status: eventStatus,
              rules: event.markets[0]?.rulesPrimary || event.closeCondition || 'No rules provided.',
              imageUrl: event.metadata?.imageUrl || event.markets[0]?.imageUrl || null,
              options: options
            });
        }
        
        cachedMarkets = normalized;
        lastCacheTime = Date.now();
        return res.json(normalized);
      }
    } catch (error) {
      console.warn('Jupiter Prediction API unreachable, using cached/fallback markets.');
    }

    // Fallback data in case the Jupiter Prediction API is unreachable
    res.json([
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
            yesProbability: 55,
            noProbability: 45,
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
            yesProbability: 15,
            noProbability: 85,
            status: 'active'
          }
        ]
      }
    ]);
  });

  // 1. Workflow: Transaction Construction & Referral Injection
  app.post("/api/bet", async (req, res) => {
    const { marketId, outcome, amount, userPubkey } = req.body;

    if (!marketId || !outcome || !amount || !userPubkey) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    console.log(`[Backend] Constructing bet for ${marketId} - Outcome: ${outcome}`);
    console.log(`[Backend] Injecting Referral Key: ${JUPITER_REFERRAL_ACCOUNT}`);

    try {
      // Call the real Jupiter Prediction API to build the transaction
      const response = await fetch('https://api.jup.ag/prediction/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerPubkey: userPubkey,
          marketId: marketId,
          isYes: outcome === 'Yes',
          isBuy: true,
          depositAmount: Math.floor(amount * 1_000_000), // Convert to micro-units (assuming USDC)
          depositMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mint
          referralAccount: JUPITER_REFERRAL_ACCOUNT, // Inject referral
          feeAccount: JUPITER_REFERRAL_ACCOUNT
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Jupiter API Error:', errorText);
        return res.status(response.status).json({ error: 'Failed to construct transaction from Jupiter API', details: errorText });
      }

      const data = await response.json();
      
      // The API should return a base64 encoded transaction (usually in data.transaction or data.swapTransaction)
      const base64Tx = data.transaction || data.swapTransaction || data.tx || Buffer.from(JSON.stringify(data)).toString('base64');
      
      return res.json({ base64Tx });
    } catch (error) {
      console.error('Failed to build transaction:', error);
      res.status(500).json({ error: 'Transaction construction failed' });
    }
  });

  // 2. Workflow: Monitoring & Payout (Output) - Claim Transaction
  app.post("/api/claim", async (req, res) => {
    const { positionId, userPubkey } = req.body;

    if (!positionId || !userPubkey) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    console.log(`[Backend] Constructing claim tx for position ${positionId}`);

    try {
      // Call the real Jupiter Prediction API to build the claim transaction
      const response = await fetch(`https://api.jup.ag/prediction/v1/payouts/${positionId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerPubkey: userPubkey
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Jupiter API Error (Claim):', errorText);
        return res.status(response.status).json({ error: 'Failed to construct claim transaction', details: errorText });
      }

      const data = await response.json();
      
      const base64Tx = data.transaction || data.swapTransaction || data.tx || Buffer.from(JSON.stringify(data)).toString('base64');
      
      return res.json({ base64Tx });
    } catch (error) {
      console.error('Failed to build claim transaction:', error);
      res.status(500).json({ error: 'Claim transaction construction failed' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
