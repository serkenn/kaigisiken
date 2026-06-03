// ログアウト（セッションCookieを破棄）
import { json, cookie } from '../../lib/auth.js';

export async function onRequestPost() {
  return json({ ok: true }, 200, { 'Set-Cookie': cookie('kw_sess', '', { clear: true }) });
}
