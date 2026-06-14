import { type FnContext, json, sanitizeText } from './_lib';

interface MsgRow {
  id: number;
  name: string;
  text: string;
  created_at: number;
}

/** GET /api/messages — 取最新 50 則留言（新到舊） */
export const onRequestGet = async ({ env }: FnContext): Promise<Response> => {
  try {
    const { results } = await env.DB.prepare(
      'SELECT id, name, text, created_at FROM messages ORDER BY id DESC LIMIT 50',
    ).all<MsgRow>();
    return json(results.map((r) => ({ id: r.id, name: r.name, text: r.text, at: r.created_at })));
  } catch {
    return json({ error: 'db error' }, 500);
  }
};

/** POST /api/messages — 新增一則留言（暱稱≤16、內容≤200） */
export const onRequestPost = async ({ request, env }: FnContext): Promise<Response> => {
  try {
    const body = (await request.json().catch(() => ({}))) as { name?: string; text?: string; deviceId?: string };
    const name = sanitizeText(body.name, 16);
    const text = sanitizeText(body.text, 200);
    if (!name || !text) return json({ ok: false }, 400);
    const device = sanitizeText(body.deviceId, 64);
    await env.DB.prepare('INSERT INTO messages (name, text, device_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(name, text, device, Date.now())
      .run();
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 500);
  }
};
