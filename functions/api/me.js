// 現在のセッション確認（再アクセス時のログイン状態判定に使用）
import { requireUser, json } from '../../lib/auth.js';

export async function onRequestGet(context) {
  try {
    const { user } = await requireUser(context);
    return json({ user: { id: user.id, name: user.name } });
  } catch (resp) {
    return resp instanceof Response ? resp : json({ error: 'unauthorized' }, 401);
  }
}
