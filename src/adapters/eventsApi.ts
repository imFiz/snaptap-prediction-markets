import axios from 'axios';
import { Fixture } from './txodds';

export interface LiveEvent {
  id: string;
  time: number | string;
  type: string;
  text: string;
  icon: string;
}

export interface LiveScore {
  home: number;
  away: number;
}

export interface LivePlayer {
  name: string;
  number: number;
  position: 'GK' | 'DF' | 'MF' | 'FW';
  subPosition: string;
  starter: boolean;
}

export interface LiveTeamRoster {
  formation: string;
  players: LivePlayer[];
}

export interface LiveStats {
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  corners: { home: number; away: number };
  fouls: { home: number; away: number };
  yellowCards: { home: number; away: number };
  redCards: { home: number; away: number };
}

export interface LiveData {
  events: LiveEvent[];
  score: LiveScore | null;
  rosters: { home: LiveTeamRoster; away: LiveTeamRoster } | null;
  stats: LiveStats | null;
  goals?: { home: string[]; away: string[] } | null;
}

const mapPosition = (abbrev: string, name: string): 'GK' | 'DF' | 'MF' | 'FW' => {
  const n = name.toLowerCase();
  const a = abbrev.toLowerCase();
  if (a === 'g' || n.includes('goalkeeper')) return 'GK';
  if (a.includes('d') || n.includes('defender') || n.includes('back')) return 'DF';
  if (a.includes('m') || n.includes('midfielder')) return 'MF';
  if (a.includes('f') || a.includes('s') || n.includes('forward') || n.includes('striker') || n.includes('wing')) return 'FW';
  return 'MF';
};

const mapSubPosition = (abbrev: string): string => {
  const a = abbrev.toUpperCase();
  if (a === 'G') return 'GK';
  if (a === 'CD' || a === 'CB') return 'CB';
  return a;
};

class EventsApiAdapter {
  private baseUrl = 'https://site.api.espn.com/apis/site/v2/sports/soccer/all';
  private matchIdCache: Record<number, string> = {};

  async getMatchLiveData(fixture: Fixture): Promise<LiveData> {
    try {
      let eventId = this.matchIdCache[fixture.id];
      let liveScore: LiveScore | null = null;

      // Extract date parameter from fixture.startTime to fetch historical data if finished
      let dateQuery = '';
      if (fixture.startTime) {
        try {
          const cleanDate = fixture.startTime.substring(0, 10).replace(/-/g, '');
          if (cleanDate.length === 8 && /^\d+$/.test(cleanDate)) {
            dateQuery = `?dates=${cleanDate}`;
          }
        } catch (e) {}
      }

      // Always fetch scoreboard to get the latest score
      const res = await axios.get(`${this.baseUrl}/scoreboard${dateQuery}`);
      const scoreEvents = res.data.events || [];
      
      const hName = fixture.homeTeam.toLowerCase().substring(0, 4);
      const aName = fixture.awayTeam.toLowerCase().substring(0, 4);
      
      const match = scoreEvents.find((e: any) => {
        const name = e.name.toLowerCase();
        return name.includes(hName) || name.includes(aName);
      });

      if (match) {
        eventId = match.id;
        this.matchIdCache[fixture.id] = eventId;

        // Parse score
        if (match.competitions && match.competitions[0] && match.competitions[0].competitors) {
          const comps = match.competitions[0].competitors;
          const homeTeam = comps.find((c: any) => c.homeAway === 'home');
          const awayTeam = comps.find((c: any) => c.homeAway === 'away');
          if (homeTeam && awayTeam) {
            liveScore = {
              home: parseInt(homeTeam.score || '0', 10),
              away: parseInt(awayTeam.score || '0', 10)
            };
          }
        }
      } else {
        return { events: [], score: null, rosters: null, stats: null, goals: null };
      }

      // Fetch summary (commentary + stats + lineups)
      const summaryRes = await axios.get(`${this.baseUrl}/summary?event=${eventId}`);
      const commentary = summaryRes.data.commentary || [];

      // Parse Stats
      let parsedStats: LiveStats | null = null;
      if (summaryRes.data.boxscore && summaryRes.data.boxscore.teams) {
        const teams = summaryRes.data.boxscore.teams;
        const homeTeamData = teams.find((t: any) => t.homeAway === 'home');
        const awayTeamData = teams.find((t: any) => t.homeAway === 'away');
        
        if (homeTeamData && awayTeamData) {
          const getStat = (teamData: any, name: string): number => {
            const stat = teamData.statistics?.find((s: any) => s.name === name);
            if (!stat) return 0;
            return parseFloat(stat.displayValue.replace('%', '')) || 0;
          };

          parsedStats = {
            possession: {
              home: getStat(homeTeamData, 'possessionPct') || 50,
              away: getStat(awayTeamData, 'possessionPct') || 50
            },
            shots: {
              home: getStat(homeTeamData, 'totalShots'),
              away: getStat(awayTeamData, 'totalShots')
            },
            shotsOnTarget: {
              home: getStat(homeTeamData, 'shotsOnTarget'),
              away: getStat(awayTeamData, 'shotsOnTarget')
            },
            corners: {
              home: getStat(homeTeamData, 'wonCorners'),
              away: getStat(awayTeamData, 'wonCorners')
            },
            fouls: {
              home: getStat(homeTeamData, 'foulsCommitted'),
              away: getStat(awayTeamData, 'foulsCommitted')
            },
            yellowCards: {
              home: getStat(homeTeamData, 'yellowCards'),
              away: getStat(awayTeamData, 'yellowCards')
            },
            redCards: {
              home: getStat(homeTeamData, 'redCards'),
              away: getStat(awayTeamData, 'redCards')
            }
          };
        }
      }

      // Parse Rosters
      let parsedRosters: { home: LiveTeamRoster; away: LiveTeamRoster } | null = null;
      if (summaryRes.data.rosters) {
        const rosters = summaryRes.data.rosters;
        const rosterArray = Array.isArray(rosters) ? rosters : Object.values(rosters);
        
        const homeRosterData = rosterArray.find((r: any) => r.homeAway === 'home');
        const awayRosterData = rosterArray.find((r: any) => r.homeAway === 'away');
        
        if (homeRosterData && awayRosterData) {
          const mapRoster = (teamRoster: any): LiveTeamRoster => {
            const players = (teamRoster.roster || [])
              .filter((p: any) => p.starter)
              .map((p: any, i: number) => ({
                name: p.athlete?.displayName || p.athlete?.fullName || 'Unknown Player',
                number: parseInt(p.jersey) || i + 1,
                position: mapPosition(p.position?.abbreviation || 'M', p.position?.name || 'Midfielder'),
                subPosition: mapSubPosition(p.position?.abbreviation || 'CM'),
                starter: !!p.starter
              }));
            return {
              formation: teamRoster.formation || '4-3-3',
              players
            };
          };
          
          parsedRosters = {
            home: mapRoster(homeRosterData),
            away: mapRoster(awayRosterData)
          };
        }
      }

      // Parse Commentary
      const allEvents: any[] = [...commentary];
      const parsedEvents = allEvents
        .sort((a, b) => (b.sequence || 0) - (a.sequence || 0))
        .map((item: any, i: number) => {
          const text = item.text || '';
          let icon = '⚽';
          let type = 'info';

          if (text.toLowerCase().includes('yellow card')) { icon = '🟨'; type = 'card'; }
          else if (text.toLowerCase().includes('red card')) { icon = '🟥'; type = 'card'; }
          else if (text.toLowerCase().includes('goal')) { icon = '🔥'; type = 'goal'; }
          else if (text.toLowerCase().includes('foul')) { icon = '🛑'; type = 'foul'; }
          else if (text.toLowerCase().includes('corner')) { icon = '🚩'; type = 'corner'; }
          else if (text.toLowerCase().includes('substitution')) { icon = '🔄'; type = 'sub'; }
          else if (text.toLowerCase().includes('offside')) { icon = '🏳️'; type = 'offside'; }
          else if (text.toLowerCase().includes('attempt')) { icon = '⚡'; type = 'attack'; }

          return {
            id: item.sequence?.toString() || `${Date.now()}-${i}`,
            time: item.time?.displayValue || 'Live',
            type,
            text,
            icon,
          };
        })
        .slice(0, 15);

      // Extract goals from commentary
      const goals: { home: string[]; away: string[] } = { home: [], away: [] };
      commentary.forEach((item: any) => {
        const text = item.text || '';
        const playText = text.toLowerCase();
        if (playText.includes('goal!') && !playText.includes('shoot-out')) {
          const timeStr = item.time?.displayValue || '';
          
          // Find team name in parentheses (e.g. "(Argentina)" or "(Jordan)")
          const teamMatch = text.match(/\(([^)]+)\)/);
          const teamNameInParens = teamMatch ? teamMatch[1].trim().toLowerCase() : '';
          
          let scorerName = '';
          const scoreIndex = text.indexOf('.');
          if (scoreIndex !== -1) {
            const afterScore = text.substring(scoreIndex + 1);
            const parenIndex = afterScore.indexOf('(');
            if (parenIndex !== -1) {
              scorerName = afterScore.substring(0, parenIndex).trim();
            }
          }
          
          if (!scorerName) {
            const matchBeforeParen = text.match(/([A-Za-z\s'-]+)\s*\(([^)]+)\)/);
            if (matchBeforeParen) {
              scorerName = matchBeforeParen[1].replace(/Goal!|attempt|miss/gi, '').trim();
            }
          }
          
          if (scorerName) {
            const hName = fixture.homeTeam.toLowerCase().substring(0, 4);
            const aName = fixture.awayTeam.toLowerCase().substring(0, 4);
            const goalDetail = `${scorerName} (${timeStr})`;
            
            if (teamNameInParens.includes(hName) || fixture.homeTeam.toLowerCase().includes(teamNameInParens)) {
              goals.home.push(goalDetail);
            } else if (teamNameInParens.includes(aName) || fixture.awayTeam.toLowerCase().includes(teamNameInParens)) {
              goals.away.push(goalDetail);
            }
          }
        }
      });
      goals.home.reverse();
      goals.away.reverse();

      return { events: parsedEvents, score: liveScore, rosters: parsedRosters, stats: parsedStats, goals };
    } catch (e) {
      console.warn('Failed to fetch real-time events:', e);
      return { events: [], score: null, rosters: null, stats: null, goals: null };
    }
  }
}

export const eventsApi = new EventsApiAdapter();
