// 履修ロードマップ（benkyoの概念グラフ）の配信/同期。
//   GET  … ログイン済みブラウザが取得（KV: roadmap:default）
//   PUT  … ローカルの同期スクリプトが保存。
//          認証は「ログインセッション」または「Bearer <SYNC_TOKEN>」のどちらか。
//          SYNC_TOKEN はデプロイ先のシークレットに設定する（CLIからの同期用）。
//
//   これにより benkyo はMacのローカルが唯一の真実のまま、
//   スナップショット（Mermaid/JSON）だけをKVに置いて端末非依存で閲覧できる。
import { requireUser, readBody, json, getKV } from '../../lib/auth.js';

const KEY = 'roadmap:default'; // まず自分用（単一ユーザー）。多人数化時は uid 別に。

export async function onRequestGet(context) {
  try {
    const { kv } = await requireUser(context);
    const data = await kv.get(KEY, 'json');
    return json({ roadmap: data || null });
  } catch (resp) {
    return resp instanceof Response ? resp : json({ error: 'unauthorized' }, 401);
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  // 認証: セッション or SYNC_TOKEN
  let authed = false;
  const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (env.SYNC_TOKEN && bearer && bearer === env.SYNC_TOKEN) {
    authed = true;
  } else {
    try { await requireUser(context); authed = true; } catch { authed = false; }
  }
  if (!authed) return json({ error: 'unauthorized' }, 401);

  const body = await readBody(request);
  const record = {
    project: body.project || null,
    mermaid: typeof body.mermaid === 'string' ? body.mermaid : '',
    export: body.export ?? null,
    exportedAt: Date.now(),
  };
  if (!record.mermaid) return json({ error: 'mermaid が空です' }, 400);
  await getKV(env).put(KEY, JSON.stringify(record));
  return json({ ok: true, exportedAt: record.exportedAt });
}
