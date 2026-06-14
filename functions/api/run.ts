import { type FnContext, json, clampNum, clampInt, sanitizeText } from './_lib';

/** POST /api/run — 送出一場結算，驗證後寫入 runs 並累加全球統計 */
export const onRequestPost = async ({ request, env }: FnContext): Promise<Response> => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  /** 合理性驗證（純前端分數可偽造，這裡做基本上限過濾） */
  const time = clampNum(body.time, 0, 3600);
  const kills = clampInt(body.kills, 0, Math.ceil(time * 25) + 50);
  const level = clampInt(body.level, 1, 999);
  const gold = clampInt(body.gold, 0, 1_000_000);
  const won = body.won ? 1 : 0;
  const name = sanitizeText(body.name, 16) || '倖存者';
  const character = sanitizeText(body.character, 16) || '?';
  const difficulty = sanitizeText(body.difficulty, 16) || 'easy';
  const deviceId = sanitizeText(body.deviceId, 64);
  const now = Date.now();

  try {
    await env.DB.batch([
      env.DB
        .prepare(
          'INSERT INTO runs (device_id,name,character,time,kills,level,gold,won,difficulty,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(deviceId, name, character, time, kills, level, gold, won, difficulty, now),
      env.DB
        .prepare('UPDATE stats SET plays=plays+1, total_time=total_time+?, total_kills=total_kills+? WHERE id=1')
        .bind(time, kills),
    ]);
  } catch {
    return json({ error: 'db error' }, 500);
  }

  return json({ ok: true });
};
