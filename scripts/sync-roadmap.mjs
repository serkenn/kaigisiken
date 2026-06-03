// =============================================================
// 履修ロードマップ同期スクリプト
//   ローカルの benkyo グラフ（Mac上のSQLiteが真実の源）を
//   Mermaid/JSON で書き出し、Cloudflare の /api/roadmap に PUT する。
//   → 以後どの端末からでも（ブリッジ不要で）ロードマップを閲覧できる。
//
//   使い方:
//     KAIGI_URL=https://kaigisiken.pages.dev \
//     SYNC_TOKEN=<デプロイ先に設定したのと同じトークン> \
//     BENKYO_PROJECT=prj21 \
//     npm run sync
//
//   .env を使う場合は事前に export しておく（このスクリプトは環境変数のみ参照）。
// =============================================================
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const KAIGI_URL = (process.env.KAIGI_URL || '').replace(/\/+$/, '');
const SYNC_TOKEN = process.env.SYNC_TOKEN || '';
const PROJECT = process.env.BENKYO_PROJECT || 'prj21';
const BENKYO = process.env.BENKYO_BIN || 'benkyo';

function fail(msg) { console.error(`✘ ${msg}`); process.exit(1); }

if (!KAIGI_URL) fail('環境変数 KAIGI_URL が未設定です（例: https://kaigisiken.pages.dev）');
if (!SYNC_TOKEN) fail('環境変数 SYNC_TOKEN が未設定です（デプロイ先のシークレットと同じ値）');

async function benkyo(args, { json = false } = {}) {
  const { stdout } = await execFileP(BENKYO, args, { maxBuffer: 16 * 1024 * 1024 });
  return json ? JSON.parse(stdout) : stdout;
}

async function main() {
  console.log(`▶ benkyo プロジェクト ${PROJECT} を書き出し中…`);
  const mermaid = await benkyo(['render', '--project', PROJECT, '--format', 'mermaid']);
  let exported = null;
  try { exported = await benkyo(['export', 'project', PROJECT], { json: true }); } catch { /* exportは任意 */ }

  console.log(`▶ ${KAIGI_URL}/api/roadmap へ送信中…`);
  const res = await fetch(`${KAIGI_URL}/api/roadmap`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SYNC_TOKEN}` },
    body: JSON.stringify({ project: PROJECT, mermaid, export: exported }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(`同期に失敗: ${res.status} ${JSON.stringify(data)}`);
  console.log(`✅ 同期完了（exportedAt=${new Date(data.exportedAt).toLocaleString()}）`);
  console.log('   どの端末からでもロードマップが最新になりました。');
}

main().catch((e) => fail(String(e.stderr || e.message || e)));
