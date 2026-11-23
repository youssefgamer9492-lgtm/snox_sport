export type MatchState = 'in' | 'pre' | 'post';

export interface TeamBrief {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  logo: string;
  color: string;
  alternateColor: string;
  score: number;
  form: string;
  record: string;
  homeAway: 'home' | 'away';
}

export interface MatchListItem {
  id: string;
  leagueSlug: string;
  leagueName: string;
  date: string;
  state: MatchState;
  statusDetail: string;
  displayClock: string;
  clockSeconds: number;
  period: number;
  venue: string;
  home: TeamBrief;
  away: TeamBrief;
}

export interface StatComparison {
  key: string;
  label: string;
  homeValue: string;
  awayValue: string;
  homeNum: number;
  awayNum: number;
}

export interface PlayerMatchStats {
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  foulsCommitted: number;
  foulsSuffered: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  offsides: number;
  subIn: boolean;
  subOut: boolean;
}

export interface RosterPlayer {
  id: string;
  name: string;
  shortName: string;
  jersey: string;
  position: string;
  positionName: string;
  starter: boolean;
  subbedInMinute: number | null;
  subbedOutMinute: number | null;
  replacedById: string | null;
  jerseyImage: string | null;
  stats: PlayerMatchStats;
}

export interface TeamRoster {
  teamId: string;
  teamName: string;
  formation: string;
  players: RosterPlayer[];
}

export interface RadarPlay {
  id: string;
  sequence: number;
  minute: number;
  clockDisplay: string;
  period: number;
  teamId: string | null;
  teamSide: 'home' | 'away' | null;
  teamName: string;
  typeCode: string;
  typeText: string;
  text: string;
  scoringPlay: boolean;
  pitchX: number | null; // 0..100 (0 = Home goal, 100 = Away goal)
  pitchY: number | null; // 0..100 (0 = Top/Left touchline, 100 = Bottom/Right touchline)
  participants: string[];
}

export interface ShotEvent {
  id: string;
  minute: number;
  clockDisplay: string;
  teamSide: 'home' | 'away';
  teamName: string;
  shooter: string;
  outcome: 'goal' | 'on-target' | 'off-target' | 'blocked';
  pitchX: number;
  pitchY: number;
  text: string;
}

export interface KeyEventItem {
  id: string;
  minute: number;
  clockDisplay: string;
  teamSide: 'home' | 'away' | null;
  teamName: string;
  type: 'goal' | 'yellow-card' | 'red-card' | 'substitution' | 'other';
  typeText: string;
  text: string;
  participants: string[];
}

export interface MomentumBucket {
  label: string;
  startMinute: number;
  endMinute: number;
  homePressure: number;
  awayPressure: number;
  net: number; // positive = home dominance, negative = away dominance
  goalsHome: number;
  goalsAway: number;
}

export interface TerritorialZones {
  homeAttackThirdPct: number;
  midfieldThirdPct: number;
  awayAttackThirdPct: number;
  homeLanes: { left: number; center: number; right: number };
  awayLanes: { left: number; center: number; right: number };
  totalTrackedPlays: number;
}

export interface LastFiveMatch {
  id: string;
  date: string;
  opponent: string;
  opponentLogo: string;
  score: string;
  result: 'W' | 'D' | 'L';
  homeAway: string;
}

export interface MatchVideo {
  id: string;
  headline: string;
  description: string;
  duration: number;
  thumbnail: string | null;
  videoUrl: string | null;
  webUrl: string | null;
}

export interface MatchBroadcast {
  channel: string;
  type: string;
  region: string;
}

export interface HighlightClip extends MatchVideo {
  matchId: string;
  matchName: string;
  leagueName: string;
  scoreline: string;
}

export interface MatchDetail {
  id: string;
  leagueSlug: string;
  leagueName: string;
  date: string;
  state: MatchState;
  statusDetail: string;
  displayClock: string;
  clockSeconds: number;
  period: number;
  venue: string;
  city: string;
  attendance: number | null;
  referee: string | null;
  home: TeamBrief;
  away: TeamBrief;
  stats: StatComparison[];
  rosters: {
    home: TeamRoster | null;
    away: TeamRoster | null;
  };
  plays: RadarPlay[];
  shots: ShotEvent[];
  keyEvents: KeyEventItem[];
  momentum: MomentumBucket[];
  territorial: TerritorialZones;
  lastFive: {
    home: LastFiveMatch[];
    away: LastFiveMatch[];
  };
  winProbability: {
    homePct: number;
    drawPct: number;
    awayPct: number;
    provider: string;
  } | null;
  videos?: MatchVideo[];
  broadcasts?: MatchBroadcast[];
}

export interface StandingsRow {
  rank: number;
  teamId: string;
  teamName: string;
  shortName: string;
  logo: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  note: string | null;
  noteColor: string | null;
}

export interface StandingsData {
  leagueSlug: string;
  leagueName: string;
  seasonName: string;
  groups: {
    name: string;
    rows: StandingsRow[];
  }[];
}

export interface NewsArticle {
  id: string;
  headline: string;
  description: string;
  published: string;
  type: string;
  section: 'local' | 'africa' | 'asia' | 'world' | 'transfers';
  sourceName: string;
  leagueSlug: string;
  leagueName: string;
  imageUrl: string | null;
  linkUrl: string | null;
  category: string;
}

export interface GoalAlert {
  id: string;
  matchId: string;
  leagueName: string;
  homeName: string;
  awayName: string;
  homeLogo: string;
  awayLogo: string;
  homeScore: number;
  awayScore: number;
  scoringTeam: 'home' | 'away' | 'status';
  clock: string;
  message: string;
  timestamp: string;
  read: boolean;
}
