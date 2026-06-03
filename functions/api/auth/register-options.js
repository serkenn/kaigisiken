// パスキー登録: チャレンジ発行（初回アクセス時にパスキーを作成）
import { generateRegistrationOptions } from '@simplewebauthn/server';
import {
  getKV, getRP, readBody, json, randomId, putChallenge, cookie,
} from '../../../lib/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const { name } = await readBody(request);
  const displayName = (name && String(name).trim().slice(0, 40)) || 'me';
  const { rpID, rpName } = getRP(request);
  const kv = getKV(env);

  const uid = randomId(16);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(uid),
    userName: displayName,
    userDisplayName: displayName,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });

  const sid = randomId(18);
  await putChallenge(env, sid, options.challenge);
  await kv.put(`pending:${sid}`, JSON.stringify({ uid, name: displayName }), { expirationTtl: 300 });

  return json({ options }, 200, { 'Set-Cookie': cookie('kw_chal', sid, { maxAge: 300 }) });
}
