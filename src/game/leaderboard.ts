/** Leaderboard record (stored locally in localStorage, global comes from the backend) */
export interface RunRecord {
  /** Player nickname */
  name: string;
  character: string;
  time: number;
  kills: number;
  level: number;
  gold: number;
  won: boolean;
  /** Difficulty id(easy/normal/hard/nightmare/hell) */
  difficulty: string;
  /** Record time (ms), supplied by the caller */
  at: number;
}

const NAME_KEY = 'animal-survivors:name';
/** Player nickname (used for leaderboard entries); returns empty string if unset */
export function getPlayerName(): string {
  return (localStorage.getItem(NAME_KEY) || '').trim();
}
export function setPlayerName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name.trim().slice(0, 16));
  } catch {
    /* Ignore write failures */
  }
}

const KEY = 'animal-survivors:leaderboard:v1';
const MAX = 10;

export function loadRecords(): RunRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as RunRecord[];
  } catch {
    /* Ignore corrupted data */
  }
  return [];
}

/** Local cumulative stats (pure front-end; with no backend, these are per-device) */
export interface GlobalStats {
  plays: number;
  totalTime: number;
  totalKills: number;
}

const STATS_KEY = 'animal-survivors:stats:v1';

export function loadStats(): GlobalStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<GlobalStats>;
      return { plays: d.plays ?? 0, totalTime: d.totalTime ?? 0, totalKills: d.totalKills ?? 0 };
    }
  } catch {
    /* Ignore corrupted data */
  }
  return { plays: 0, totalTime: 0, totalKills: 0 };
}

/** Accumulate one game's stats and return the updated values */
export function recordStats(time: number, kills: number): GlobalStats {
  const s = loadStats();
  s.plays += 1;
  s.totalTime += time;
  s.totalKills += kills;
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    /* Ignore write failures */
  }
  return s;
}

/** Add an entry and return the updated list (sorted by survival time descending, take top) MAX)'s leaderboard */
export function addRecord(record: RunRecord): RunRecord[] {
  const list = loadRecords();
  list.push(record);
  list.sort((a, b) => b.time - a.time);
  const trimmed = list.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* Ignore write failures */
  }
  return trimmed;
}
