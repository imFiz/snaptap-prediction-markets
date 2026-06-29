import axios from 'axios';

import { ResultsDB } from './resultsDb';

// Types for TxODDS Models
export interface Fixture {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  startTime: string; // ISO format
  startTimeMs: number; // Unix milliseconds
  status: 'PreMatch' | 'Live' | 'Finished';
  score?: { home: number; away: number };
  competition: string;
  competitionId: number;
  groupId?: number;
}

export interface OddsOffer {
  id: number;
  fixtureId: number;
  marketName: string;
  homeOdds: number;
  awayOdds: number;
  drawOdds?: number;
}

export class TxOddsAdapter {
  private apiToken: string | null = null;
  private jwt: string | null = null;
  private jwtExpiry: number = 0;
  private baseUrl = 'https://txline.txodds.com';
  private wsUrl = 'wss://stream.txline.txodds.com/v1'; // Expected WSS endpoint
  private useMockData = true;
  private wsConnected = false;
  private ws: WebSocket | null = null;

  constructor(token?: string) {
    const envToken = import.meta.env.VITE_TXODDS_API_TOKEN;
    const finalToken = token || envToken;

    if (finalToken) {
      this.apiToken = finalToken;
      this.useMockData = false;
    }
  }

  setToken(token: string) {
    this.apiToken = token;
    this.useMockData = false;
    this.initSocket();
  }

  // Attempt to initialize WebSocket for real-time PUSH updates
  private async initSocket() {
    if (!this.apiToken || this.wsConnected) return;
    
    try {
      const jwt = await this.getJwt();
      if (!jwt) return;

      this.ws = new WebSocket(`${this.wsUrl}?token=${jwt}&api_key=${this.apiToken}`);
      
      this.ws.onopen = () => {
        console.log('TxODDS PUSH Socket connected');
        this.wsConnected = true;
      };

      this.ws.onmessage = (event) => {
        // Handle real-time push events for odds/scores
        // Fallback to REST polling is implemented below in the React components
      };

      this.ws.onerror = (error) => {
        console.warn('TxODDS Socket unavailable or connection failed. Falling back to REST snapshot API.', error);
        this.wsConnected = false;
      };

      this.ws.onclose = () => {
        this.wsConnected = false;
      };
    } catch (e) {
      console.warn('Failed to initialize TxODDS Socket. Falling back to REST.', e);
    }
  }

  // Get a guest JWT (cached, refreshed when expired)
  private async getJwt(): Promise<string | null> {
    const now = Date.now();
    if (this.jwt && now < this.jwtExpiry - 60000) return this.jwt; // 1min buffer

    try {
      const res = await axios.post(`${this.baseUrl}/auth/guest/start`);
      this.jwt = res.data.token;
      // JWT expires in ~30 min, cache for 25 min
      this.jwtExpiry = now + 25 * 60 * 1000;
      return this.jwt;
    } catch (e) {
      console.error('Failed to get guest JWT:', e);
      return null;
    }
  }

  private getAuthHeaders(jwt: string) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
      'X-Api-Token': this.apiToken!,
    };
  }

  // Fetch World Cup Fixtures — always real data, isTestMode only affects betting
  async getLiveFixtures(): Promise<Fixture[]> {
    if (!this.apiToken) {
      return [];
    }

    try {
      const jwt = await this.getJwt();
      if (!jwt) return [];

      const response = await axios.get(`${this.baseUrl}/api/fixtures/snapshot`, {
        headers: this.getAuthHeaders(jwt),
        timeout: 15000,
      });

      const allFixtures: any[] = response.data;
      if (!allFixtures || allFixtures.length === 0) return [];

      const now = Date.now();

      const mappedFixtures: Fixture[] = allFixtures.map((item: any) => {
        const startMs = item.StartTime;
        // Infer live status from actual time if API is delayed
        const isApiLive = item.StatusCode === 1 || item.Status === 'live' || item.Status === 'in-play';
        const isTimeLive = now >= startMs && now <= startMs + 120 * 60 * 1000; 
        const isLive = isApiLive || isTimeLive;
        
        let status: Fixture['status'] = 'PreMatch';
        if (isLive) status = 'Live';
        
        const isTimeFinished = now > startMs + 180 * 60 * 1000; // 3 hours
        if (item.StatusCode >= 2 || item.Status === 'finished' || item.Status === 'ended' || isTimeFinished) {
          status = 'Finished';
        }
        
        let parsedScore = item.Score
          ? { home: item.Score.Participant1, away: item.Score.Participant2 }
          : undefined;

        if (status === 'Finished') {
          if (parsedScore) {
            ResultsDB.saveScore(item.Participant1, item.Participant2, parsedScore);
          } else {
            parsedScore = ResultsDB.getScore(item.Participant1, item.Participant2);
          }
        }

        return {
          id: item.FixtureId,
          homeTeam: item.Participant1,
          awayTeam: item.Participant2,
          homeTeamId: item.Participant1Id,
          awayTeamId: item.Participant2Id,
          startTime: new Date(startMs).toISOString(),
          startTimeMs: startMs,
          status,
          competition: item.Competition ?? 'World Cup',
          competitionId: item.CompetitionId ?? 72,
          groupId: item.FixtureGroupId,
          score: parsedScore,
        };
      });

      const relevant = mappedFixtures
        .sort((a, b) => {
          // Sort by time, but push Finished matches to the bottom
          if (a.status === 'Finished' && b.status !== 'Finished') return 1;
          if (a.status !== 'Finished' && b.status === 'Finished') return -1;
          // For active/future matches, sort by start time ascending (soonest first)
          // For finished matches, sort by start time descending (most recent first)
          if (a.status === 'Finished') return b.startTimeMs - a.startTimeMs;
          return a.startTimeMs - b.startTimeMs;
        });

      return relevant; // NEVER return mock fixtures if API works, even if empty
    } catch (error) {
      console.error('Failed to fetch fixtures:', error);
      return []; // Return empty array on error, NO MOCKS
    }
  }

  // Fetch odds for a specific fixture
  async getOdds(fixtureId: number): Promise<OddsOffer | null> {
    if (!this.apiToken) return null;

    try {
      const jwt = await this.getJwt();
      if (!jwt) return null;

      const response = await axios.get(`${this.baseUrl}/api/odds/snapshot/${fixtureId}`, {
        headers: this.getAuthHeaders(jwt),
        timeout: 10000,
      });

      const data: any[] = response.data;
      if (!data || data.length === 0) return null;

      // Find 1X2 market (Match Winner) — TxOdds uses SuperOddsType
      const matchWinner = data.find((o: any) =>
        (o.SuperOddsType === '1X2_PARTICIPANT_RESULT' || o.SuperOddsType?.includes('1X2') || o.SuperOddsType?.includes('MATCH')) &&
        (!o.MarketPeriod || o.MarketPeriod === null || o.MarketPeriod === 'RegularTime')
      ) || data[0];

      if (!matchWinner) return null;

      let homeOdds = 2.0;
      let drawOdds = 3.0;
      let awayOdds = 2.0;

      if (matchWinner.Prices && Array.isArray(matchWinner.Prices) && matchWinner.Prices.length >= 2) {
        homeOdds = (matchWinner.Prices[0] || 2000) / 1000;
        drawOdds = matchWinner.Prices.length > 2 ? (matchWinner.Prices[1] || 3000) / 1000 : undefined;
        awayOdds = matchWinner.Prices.length > 2 ? (matchWinner.Prices[2] || 2000) / 1000 : (matchWinner.Prices[1] || 2000) / 1000;
      } else {
        const outcomes = matchWinner.Outcomes ?? matchWinner.outcomes ?? [];
        homeOdds = outcomes[0]?.Price ?? outcomes[0]?.price ?? 2.0;
        drawOdds = outcomes[1]?.Price ?? outcomes[1]?.price;
        awayOdds = outcomes[2]?.Price ?? outcomes[2]?.price ?? 2.0;
      }

      return {
        id: matchWinner.MessageId ? parseInt(String(matchWinner.MessageId).split(':')[0], 10) : Date.now(),
        fixtureId,
        marketName: '1X2',
        homeOdds,
        drawOdds,
        awayOdds,
      };
    } catch (error) {
      console.error('Failed to fetch odds:', error);
      return this.getMockOdds(fixtureId);
    }
  }

  getMockFixtures(): Fixture[] {
    // World Cup 2026 is June 11 – July 19, 2026
    const wc2026Base = new Date('2026-07-01T15:00:00Z').getTime();
    return [
      {
        id: 101, homeTeam: 'Brazil', awayTeam: 'France',
        homeTeamId: 1, awayTeamId: 2,
        startTime: new Date(wc2026Base + 3600000).toISOString(),
        startTimeMs: wc2026Base + 3600000,
        status: 'PreMatch', competition: 'World Cup', competitionId: 72,
      },
      {
        id: 102, homeTeam: 'Argentina', awayTeam: 'Spain',
        homeTeamId: 3, awayTeamId: 4,
        startTime: new Date(wc2026Base - 1800000).toISOString(),
        startTimeMs: wc2026Base - 1800000,
        status: 'Live', score: { home: 1, away: 1 },
        competition: 'World Cup', competitionId: 72,
      },
      {
        id: 103, homeTeam: 'England', awayTeam: 'Germany',
        homeTeamId: 5, awayTeamId: 6,
        startTime: new Date(wc2026Base + 86400000).toISOString(),
        startTimeMs: wc2026Base + 86400000,
        status: 'PreMatch', competition: 'World Cup', competitionId: 72,
      },
      {
        id: 104, homeTeam: 'Portugal', awayTeam: 'Netherlands',
        homeTeamId: 7, awayTeamId: 8,
        startTime: new Date(wc2026Base + 2 * 86400000).toISOString(),
        startTimeMs: wc2026Base + 2 * 86400000,
        status: 'PreMatch', competition: 'World Cup', competitionId: 72,
      },
    ];
  }

  getMockOdds(fixtureId: number): OddsOffer {
    const oddsMap: Record<number, OddsOffer> = {
      101: { id: 1, fixtureId: 101, marketName: '1X2', homeOdds: 2.1, awayOdds: 3.5, drawOdds: 3.2 },
      102: { id: 2, fixtureId: 102, marketName: '1X2', homeOdds: 1.8, awayOdds: 4.2, drawOdds: 3.8 },
      103: { id: 3, fixtureId: 103, marketName: '1X2', homeOdds: 2.6, awayOdds: 2.8, drawOdds: 3.0 },
      104: { id: 4, fixtureId: 104, marketName: '1X2', homeOdds: 2.3, awayOdds: 3.1, drawOdds: 3.4 },
    };
    
    if (oddsMap[fixtureId]) return oddsMap[fixtureId];
    
    // Generate deterministic pseudo-random odds based on fixtureId
    const seed1 = (fixtureId * 9301 + 49297) % 233280;
    const rand1 = seed1 / 233280;
    const seed2 = (seed1 * 9301 + 49297) % 233280;
    const rand2 = seed2 / 233280;
    
    const home = 1.1 + (rand1 * 4); // 1.1 to 5.1
    const away = 1.1 + (rand2 * 4);
    const draw = 2.5 + ((rand1 + rand2) / 2 * 2); // 2.5 to 4.5
    
    return {
      id: 99 + fixtureId, 
      fixtureId, 
      marketName: '1X2',
      homeOdds: Number(home.toFixed(2)), 
      awayOdds: Number(away.toFixed(2)), 
      drawOdds: Number(draw.toFixed(2)),
    };
  }
}

// Singleton instance
export const txOddsAdapter = new TxOddsAdapter();
