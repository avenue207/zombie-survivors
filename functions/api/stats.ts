import { type FnContext, json } from './_lib';

interface StatsRow {
  plays: number;
  total_time: number;
  total_kills: number;
}

/** GET /api/stats — 全球累計統計 */
export const onRequestGet = async ({ env }: FnContext): Promise<Response> => {
  try {
    const s = await env.DB.prepare('SELECT plays,total_time,total_kills FROM stats WHERE id=1').first<StatsRow>();
    return json({
      plays: s?.plays ?? 0,
      totalTime: s?.total_time ?? 0,
      totalKills: s?.total_kills ?? 0,
    });
  } catch {
    return json({ error: 'db error' }, 500);
  }
};
