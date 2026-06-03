// パスキーでサインイン: 検証してセッション発行
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import {
  getKV, getRP, readBody, json, parseCookies, takeChallenge, signSession, cookie,
  bytesToB64url, b64urlToBytes,
} from '../../../lib/auth.js';

const SESSION_MAX_AGE = 30 * 24 * 3600;

export async function onRequestPost(context) {
  const { request, env } = context;
  const { response } = await readBody(request);
  const sid = parseCookies(request).kw_chal;
  const challenge = await takeChallenge(env, sid);
  if (!challenge) return json({ error: 'チャレンジが無効です。やり直してください。' }, 400);

  const kv = getKV(env);
  // 認証情報IDから所有ユーザーを特定（フォールバックで userHandle も参照）
  let uid = await kv.get(`cred:${response.id}`);
  if (!uid && response.response && response.response.userHandle) {
    try { uid = new TextDecoder().decode(b64urlToBytes(response.response.userHandle)); } catch { /* noop */ }
  }
  if (!uid) return json({ error: 'このパスキーに対応する登録が見つかりません。' }, 400);

  const user = await kv.get(`user:${uid}`, 'json');
  if (!user) return json({ error: 'ユーザーが見つかりません。' }, 400);
  const cred = (user.credentials || []).find((c) => c.id === response.id);
  if (!cred) return json({ error: 'このパスキーは未登録です。' }, 400);

  const { rpID, origin } = getRP(request);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.id,
        publicKey: b64urlToBytes(cred.publicKey),
        counter: cred.counter || 0,
        transports: cred.transports,
      },
      requireUserVerification: false,
    });
  } catch (e) {
    return json({ error: '検証に失敗しました: ' + e.message }, 400);
  }
  if (!verification.verified) return json({ error: 'サインインに失敗しました。' }, 400);

  cred.counter = verification.authenticationInfo.newCounter;
  await kv.put(`user:${uid}`, JSON.stringify(user));

  const token = await signSession(env, uid);
  return json({ user: { id: user.id, name: user.name } }, 200,
    { 'Set-Cookie': cookie('kw_sess', token, { maxAge: SESSION_MAX_AGE }) });
}
