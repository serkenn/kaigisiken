// パスキー登録: 検証してユーザー作成＋セッション発行
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import {
  getKV, getRP, readBody, json, parseCookies, takeChallenge, signSession, cookie, bytesToB64url,
} from '../../../lib/auth.js';

const SESSION_MAX_AGE = 30 * 24 * 3600;

export async function onRequestPost(context) {
  const { request, env } = context;
  const { response } = await readBody(request);
  const sid = parseCookies(request).kw_chal;
  const challenge = await takeChallenge(env, sid);
  const kv = getKV(env);
  const pendingRaw = sid ? await kv.get(`pending:${sid}`) : null;
  if (!challenge || !pendingRaw) return json({ error: 'チャレンジが無効です。やり直してください。' }, 400);
  const pending = JSON.parse(pendingRaw);
  await kv.delete(`pending:${sid}`);

  const { rpID, origin } = getRP(request);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (e) {
    return json({ error: '検証に失敗しました: ' + e.message }, 400);
  }
  if (!verification.verified || !verification.registrationInfo) {
    return json({ error: 'パスキーの検証に失敗しました。' }, 400);
  }

  const cred = verification.registrationInfo.credential;
  const user = {
    id: pending.uid,
    name: pending.name,
    createdAt: Date.now(),
    credentials: [{
      id: cred.id,
      publicKey: bytesToB64url(cred.publicKey),
      counter: cred.counter || 0,
      transports: cred.transports || [],
    }],
  };
  await kv.put(`user:${user.id}`, JSON.stringify(user));
  await kv.put(`cred:${cred.id}`, user.id);

  const token = await signSession(env, user.id);
  return json({ user: { id: user.id, name: user.name } }, 200,
    { 'Set-Cookie': cookie('kw_sess', token, { maxAge: SESSION_MAX_AGE }) });
}
