import type { RunRecord, GlobalStats } from './leaderboard';

/** backend API(Cloudflare Pages Functions, same-origin /api). When all fail, return null; the caller falls back to local data. */
const BASE = '/api';
const DEVICE_KEY = 'animal-survivors:deviceId';

function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export interface RunSubmit {
  name: string;
  character: string;
  time: number;
  kills: number;
  level: number;
  gold: number;
  won: boolean;
  difficulty: string;
}

/** Submit one run's results (fire-and-forget; ignore if offline/failed) */
export async function submitRun(run: RunSubmit): Promise<void> {
  try {
    await fetch(`${BASE}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...run, deviceId: deviceId() }),
    });
  } catch {
    /* Ignore if offline */
  }
}

/** Fetch the global leaderboard; optional difficulty filter; on failure return null */
export async function fetchLeaderboard(limit = 10, difficulty?: string): Promise<RunRecord[] | null> {
  try {
    const q = difficulty ? `&difficulty=${encodeURIComponent(difficulty)}` : '';
    const res = await fetch(`${BASE}/leaderboard?limit=${limit}${q}`);
    if (!res.ok) return null;
    return (await res.json()) as RunRecord[];
  } catch {
    return null;
  }
}

/** Report heartbeat (called periodically during play to mark you online); ignore on failure */
export async function sendHeartbeat(): Promise<void> {
  try {
    await fetch(`${BASE}/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId() }),
    });
  } catch {
    /* Ignore if offline */
  }
}

/** Get the current online player count; on failure return null */
export async function fetchOnline(): Promise<number | null> {
  try {
    const res = await fetch(`${BASE}/online`);
    if (!res.ok) return null;
    const data = (await res.json()) as { online: number };
    return data.online ?? 0;
  } catch {
    return null;
  }
}

/** Message-board post */
export interface Message {
  id: number;
  name: string;
  text: string;
  at: number;
}

/** Fetch the latest messages; on failure return null */
export async function fetchMessages(): Promise<Message[] | null> {
  try {
    const res = await fetch(`${BASE}/messages`);
    if (!res.ok) return null;
    return (await res.json()) as Message[];
  } catch {
    return null;
  }
}

/** Post a message; on success return true */
export async function postMessage(name: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, text, deviceId: deviceId() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetch global cumulative stats; on failure return null */
export async function fetchStats(): Promise<GlobalStats | null> {
  try {
    const res = await fetch(`${BASE}/stats`);
    if (!res.ok) return null;
    return (await res.json()) as GlobalStats;
  } catch {
    return null;
  }
}
