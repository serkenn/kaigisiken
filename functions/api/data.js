// 個人データの取得/同期（端末をまたいで同じデータを使うためのKV保存）
import { requireUser, readBody, json } from '../../lib/auth.js';

export async function onRequestGet(context) {
  try {
    const { uid, kv } = await requireUser(context);
    const data = await kv.get(`data:${uid}`, 'json');
    return json({ data: data || null });
  } catch (resp) {
    return resp instanceof Response ? resp : json({ error: 'unauthorized' }, 401);
  }
}

export async function onRequestPut(context) {
  try {
    const { uid, kv } = await requireUser(context);
    const body = await readBody(context.request);
    await kv.put(`data:${uid}`, JSON.stringify(body.data ?? {}));
    return json({ ok: true });
  } catch (resp) {
    return resp instanceof Response ? resp : json({ error: 'unauthorized' }, 401);
  }
}
