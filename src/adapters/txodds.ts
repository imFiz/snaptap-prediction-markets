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
  private mapFixture(item: Record<string, unknown>): Fixture {
    const startMs = item.StartTime as number;
    const now = Date.now();
    const isApiLive = item.StatusCode === 1 || item.Status === 'live' || item.Status === 'in-play';
    const isTimeLive = now >= startMs && now <= startMs + 120 * 60 * 1000;
    const isLive = isApiLive || isTimeLive;

    let status: Fixture['status'] = 'PreMatch';
    if (isLive) status = 'Live';

    const isTimeFinished = now > startMs + 180 * 60 * 1000; // 3 hours
    if (
      (item.StatusCode as number) >= 2 ||
      item.Status === 'finished' ||
      item.Status === 'ended' ||
      isTimeFinished
    ) {
      status = 'Finished';
    }

    const rawScore = item.Score as { Participant1?: number; Participant2?: number } | undefined;
    let parsedScore: { home: number; away: number } | undefined = rawScore
      ? { home: rawScore.Participant1 ?? 0, away: rawScore.Participant2 ?? 0 }
      : undefined;

    if (status === 'Finished') {
      if (parsedScore) {
        ResultsDB.saveScore(item.Participant1 as string, item.Participant2 as string, parsedScore);
      } else {
        parsedScore = ResultsDB.getScore(item.Participant1 as string, item.Participant2 as string);
      }
    }

    return {
      id: item.FixtureId as number,
      homeTeam: item.Participant1 as string,
      awayTeam: item.Participant2 as string,
      homeTeamId: item.Participant1Id as number,
      awayTeamId: item.Participant2Id as number,
      startTime: new Date(startMs).toISOString(),
      startTimeMs: startMs,
      status,
      competition: (item.Competition as string) ?? 'World Cup',
      competitionId: (item.CompetitionId as number) ?? 72,
      groupId: item.FixtureGroupId as number | undefined,
      score: parsedScore,
    };
  }

  // Fetch World Cup Fixtures via backend proxy
  async getLiveFixtures(): Promise<Fixture[]> {
    try {
      const response = await fetch('/api/txline/fixtures', { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const allFixtures: Record<string, unknown>[] = await response.json();
      if (!allFixtures || allFixtures.length === 0) return [];

      const mappedFixtures: Fixture[] = allFixtures.map((item) => this.mapFixture(item));

      return mappedFixtures.sort((a, b) => {
        if (a.status === 'Finished' && b.status !== 'Finished') return 1;
        if (a.status !== 'Finished' && b.status === 'Finished') return -1;
        if (a.status === 'Finished') return b.startTimeMs - a.startTimeMs;
        return a.startTimeMs - b.startTimeMs;
      });
    } catch (error) {
      console.error('Failed to fetch fixtures:', error);
      return this.getMockFixtures();
    }
  }

  // Fetch odds for a specific fixture via backend proxy
  async getOdds(fixtureId: number): Promise<OddsOffer | null> {
    try {
      const response = await fetch(`/api/txline/odds/${fixtureId}`, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: Record<string, unknown>[] = await response.json();
      if (!data || data.length === 0) return null;

      const matchWinner = (data.find((o) => {
        const t = o.SuperOddsType as string | undefined;
        const p = o.MarketPeriod as string | undefined;
        return (
          (t === '1X2_PARTICIPANT_RESULT' || t?.includes('1X2') || t?.includes('MATCH')) &&
          (!p || p === null || p === 'RegularTime')
        );
      }) ?? data[0]) as Record<string, unknown> | undefined;

      if (!matchWinner) return null;

      let homeOdds = 2.0;
      let drawOdds: number | undefined = 3.0;
      let awayOdds = 2.0;

      const prices = matchWinner.Prices as number[] | undefined;
      if (prices && Array.isArray(prices) && prices.length >= 2) {
        homeOdds = (prices[0] ?? 2000) / 1000;
        drawOdds = prices.length > 2 ? (prices[1] ?? 3000) / 1000 : undefined;
        awayOdds = prices.length > 2 ? (prices[2] ?? 2000) / 1000 : (prices[1] ?? 2000) / 1000;
      } else {
        const outcomes = (matchWinner.Outcomes ?? matchWinner.outcomes ?? []) as Record<string, number>[];
        homeOdds = outcomes[0]?.Price ?? outcomes[0]?.price ?? 2.0;
        drawOdds = outcomes[1]?.Price ?? outcomes[1]?.price;
        awayOdds = outcomes[2]?.Price ?? outcomes[2]?.price ?? 2.0;
      }

      const msgId = matchWinner.MessageId as string | number | undefined;
      return {
        id: msgId ? parseInt(String(msgId).split(':')[0], 10) : Date.now(),
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

    const seed1 = (fixtureId * 9301 + 49297) % 233280;
    const rand1 = seed1 / 233280;
    const seed2 = (seed1 * 9301 + 49297) % 233280;
    const rand2 = seed2 / 233280;

    const home = 1.1 + rand1 * 4;
    const away = 1.1 + rand2 * 4;
    const draw = 2.5 + ((rand1 + rand2) / 2) * 2;

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

// Convenience top-level exports (used by WorldCupScreen)
export const getLiveFixtures = () => txOddsAdapter.getLiveFixtures();
export const getOdds = (fixtureId: number) => txOddsAdapter.getOdds(fixtureId);
