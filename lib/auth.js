// =============================================================
// バックエンド共通ヘルパー（Cloudflare Pages Functions 用）
//  - KVアクセス / Cookie / セッション(HMAC) / WebAuthnのRP設定
//  ※ このファイルはルートではない（functions/ 外）ので外部公開されない。
// =============================================================

export function getKV(env) {
  const kv = env.KAIGI_KV;
  if (!kv) throw new Error('KV namespace "KAIGI_KV" がバインドされていません。');
  return kv;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

// ---- Base64URL <-> bytes ----
export function bytesToB64url(bytes) {
  let str = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlToBytes(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- Cookie ----
export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  header.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
export function cookie(name, value, { maxAge = 0, clear = false } = {}) {
  const parts = [`${name}=${clear ? '' : encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (clear) parts.push('Max-Age=0');
  else if (maxAge) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

// ---- Relying Party (WebAuthn) 設定: リクエストのホストから導出 ----
export function getRP(request) {
  const url = new URL(request.url);
  const rpID = url.hostname; // 例: localhost, example.pages.dev
  const origin = url.origin;  // 例: http://localhost:8788, https://example.pages.dev
  return { rpID, origin, rpName: '海技試験ナビ' };
}

// ---- セッション（HMAC署名トークン） ----
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function secretOf(env) {
  return env.SESSION_SECRET || 'dev-insecure-secret-change-me';
}
export async function signSession(env, uid, days = 30) {
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify({ uid, exp: Date.now() + days * 864e5 })));
  const key = await hmacKey(secretOf(env));
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}.${bytesToB64url(new Uint8Array(sig))}`;
}
export async function verifySession(env, token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const key = await hmacKey(secretOf(env));
  const ok = await crypto.subtle.verify('HMAC', key,
    b64urlToBytes(sig), new TextEncoder().encode(payload));
  if (!ok) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
    if (!data.uid || data.exp < Date.now()) return null;
    return data.uid;
  } catch { return null; }
}

// セッション必須のエンドポイント用。未認証なら Response(401) を投げる。
export async function requireUser(context) {
  const { request, env } = context;
  const uid = await verifySession(env, parseCookies(request).kw_sess);
  if (!uid) throw json({ error: 'unauthorized' }, 401);
  const kv = getKV(env);
  const user = await kv.get(`user:${uid}`, 'json');
  if (!user) throw json({ error: 'unauthorized' }, 401);
  return { uid, user, kv };
}

// 一時チャレンジの保存/取得（KV, 5分TTL）。kw_chal Cookie でセッションIDを管理。
export async function putChallenge(env, sid, challenge) {
  await getKV(env).put(`chal:${sid}`, challenge, { expirationTtl: 300 });
}
export async function takeChallenge(env, sid) {
  if (!sid) return null;
  const kv = getKV(env);
  const c = await kv.get(`chal:${sid}`);
  if (c) await kv.delete(`chal:${sid}`);
  return c;
}
export function randomId(len = 18) {
  return bytesToB64url(crypto.getRandomValues(new Uint8Array(len)));
}
