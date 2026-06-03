// =============================================================
// Cloudflare Access 認証
//   前段の Cloudflare Access が発行する JWT を検証して identity(email) を得る。
//   - ヘッダ Cf-Access-Jwt-Assertion（または Cookie CF_Authorization）にトークン
//   - 署名検証は team の JWKS、aud は Access アプリの Audience(AUD) と一致を要求
//   ローカル開発では DEV_BYPASS_AUTH=1 で検証を飛ばす。
// =============================================================
import { createRemoteJWKSet, jwtVerify } from 'jose';

const TEAM = process.env.ACCESS_TEAM_DOMAIN || ''; // 例: yourteam.cloudflareaccess.com
const AUD = process.env.ACCESS_AUD || '';
const DEV = process.env.DEV_BYPASS_AUTH === '1';

let jwks = null;
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(`https://${TEAM}/cdn-cgi/access/certs`));
  return jwks;
}

function cookieValue(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export async function getAccessUser(req) {
  if (DEV) return { email: process.env.DEV_USER || 'dev@local' };
  const token = req.headers['cf-access-jwt-assertion'] || cookieValue(req.headers.cookie, 'CF_Authorization');
  if (!token) return null;
  if (!TEAM || !AUD) throw new Error('ACCESS_TEAM_DOMAIN / ACCESS_AUD が未設定です');
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: `https://${TEAM}`,
    audience: AUD,
  });
  return { email: payload.email || payload.sub || 'unknown' };
}

export function logoutUrl() {
  return TEAM ? `https://${TEAM}/cdn-cgi/access/logout` : '/cdn-cgi/access/logout';
}
