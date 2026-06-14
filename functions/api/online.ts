import { type FnContext, json } from './_lib';

/** GET /api/online — 近 45 秒內有心跳的裝置數（目前遊玩人數） */
export const onRequestGet = async ({ env }: FnContext): Promise<Response> => {
  try {
    const now = Date.now();
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM presence WHERE last_seen > ?')
      .bind(now - 45000)
      .first<{ n: number }>();
    /** 機會性清除過期列（10 分鐘前），避免表無限成長 */
    await env.DB.prepare('DELETE FROM presence WHERE last_seen < ?')
      .bind(now - 600000)
      .run();
    return json({ online: row?.n ?? 0 });
  } catch {
    return json({ online: 0 });
  }
};
