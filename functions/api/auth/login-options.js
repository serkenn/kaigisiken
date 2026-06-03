// パスキーでサインイン: 認証チャレンジ発行（別端末でも「サインイン」から利用）
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getRP, json, randomId, putChallenge, cookie } from '../../../lib/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const { rpID } = getRP(request);
  // allowCredentials を空にすることで、端末に保存された discoverable passkey を選んでログインできる
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
  const sid = randomId(18);
  await putChallenge(env, sid, options.challenge);
  return json({ options }, 200, { 'Set-Cookie': cookie('kw_chal', sid, { maxAge: 300 }) });
}
