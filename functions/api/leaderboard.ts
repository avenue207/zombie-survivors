import { type FnContext, json } from './_lib';

interface RunRow {
  name: string;
  character: string;
  time: number;
  kills: number;
  level: number;
  gold: number;
  won: number;
  difficulty: string;
  created_at: number;
}

/** GET /api/leaderboard?limit=10&difficulty=hard — 依存活時間取全球前 N（可選難度過濾） */
export const onRequestGet = async ({ request, env }: FnContext): Promise<Response> => {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 10, 1), 50);
  const difficulty = url.searchParams.get('difficulty');
  try {
    const stmt = difficulty
      ? env.DB
          .prepare(
            'SELECT name,character,time,kills,level,gold,won,difficulty,created_at FROM runs WHERE difficulty=? ORDER BY time DESC LIMIT ?',
          )
          .bind(difficulty, limit)
      : env.DB
          .prepare('SELECT name,character,time,kills,level,gold,won,difficulty,created_at FROM runs ORDER BY time DESC LIMIT ?')
          .bind(limit);
    const { results } = await stmt.all<RunRow>();
    const list = results.map((r) => ({
      name: r.name,
      character: r.character,
      time: r.time,
      kills: r.kills,
      level: r.level,
      gold: r.gold,
      won: !!r.won,
      difficulty: r.difficulty,
      at: r.created_at,
    }));
    return json(list);
  } catch {
    return json({ error: 'db error' }, 500);
  }
};
