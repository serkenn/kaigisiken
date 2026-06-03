// =============================================================
// benkyo ブリッジ — ローカルAPIサーバー
//   Webアプリ（ブラウザ）から benkyo CLI を安全に呼び出すための薄い橋。
//   benkyo はローカルのPython CLIなので、ここがアプリとの境界になる。
//
//   起動:  node bridge/server.mjs   （または npm run bridge）
//   既定ポート: 8970（環境変数 BENKYO_BRIDGE_PORT で変更可）
//
//   セキュリティ:
//     - execFile（シェル無し）＋ 引数を配列で渡しコマンドインジェクションを防ぐ
//     - project/node ID は厳格なパターンのみ許可
//     - CORS は既定で localhost / *.pages.dev / 環境変数 ALLOW_ORIGIN を許可
// =============================================================
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const PORT = Number(process.env.BENKYO_BRIDGE_PORT || 8970);
const BENKYO = process.env.BENKYO_BIN || 'benkyo';
const EXTRA_ORIGIN = process.env.ALLOW_ORIGIN || '';

const ID_RE = /^[a-z]+[0-9]+$/;          // 例: prj21, p114, c134
const FORMATS = new Set(['mermaid', 'dot']);
const SCOPES = new Set(['window', 'project', 'graph']);

function corsHeaders(origin) {
  const ok =
    !origin ||
    /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
    /\.pages\.dev$/.test(new URL(origin).hostname || '') ||
    (EXTRA_ORIGIN && origin === EXTRA_ORIGIN);
  return {
    'Access-Control-Allow-Origin': ok ? origin || '*' : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// benkyo を実行し、JSON出力ならパースして返す。テキスト（render等）はそのまま。
async function runBenkyo(args, { json = true } = {}) {
  const { stdout } = await execFileP(BENKYO, args, { maxBuffer: 8 * 1024 * 1024 });
  if (!json) return stdout;
  try { return JSON.parse(stdout); } catch { return { raw: stdout }; }
}

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object';
  res.writeHead(status, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' }, cors);

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const q = url.searchParams;
  const project = q.get('project') || '';
  const node = q.get('node') || '';

  try {
    switch (url.pathname) {
      case '/health':
        return send(res, 200, { ok: true, service: 'benkyo-bridge', version: await benkyoVersion() }, cors);

      case '/projects': {
        const data = await runBenkyo(['project', 'list']);
        return send(res, 200, data, cors);
      }

      case '/render': {
        if (!ID_RE.test(project)) return send(res, 400, { error: 'invalid project id' }, cors);
        const format = FORMATS.has(q.get('format')) ? q.get('format') : 'mermaid';
        const scope = SCOPES.has(q.get('scope')) ? q.get('scope') : 'window';
        const text = await runBenkyo(
          ['render', '--project', project, '--format', format, '--scope', scope],
          { json: false },
        );
        return send(res, 200, { project, format, scope, text }, cors);
      }

      case '/export': {
        if (!ID_RE.test(project)) return send(res, 400, { error: 'invalid project id' }, cors);
        const data = await runBenkyo(['export', 'project', project]);
        return send(res, 200, data, cors);
      }

      case '/frontier': {
        if (!ID_RE.test(project)) return send(res, 400, { error: 'invalid project id' }, cors);
        const data = await runBenkyo(['frontier', '--project', project]);
        return send(res, 200, data, cors);
      }

      case '/breakdown': {
        if (!ID_RE.test(project) || !ID_RE.test(node))
          return send(res, 400, { error: 'invalid project/node id' }, cors);
        const data = await runBenkyo(['breakdown', '--project', project, '--node', node]);
        return send(res, 200, data, cors);
      }

      default:
        return send(res, 404, { error: 'not found', paths: ['/health', '/projects', '/render', '/export', '/frontier', '/breakdown'] }, cors);
    }
  } catch (err) {
    return send(res, 500, { error: 'benkyo execution failed', detail: String(err.stderr || err.message || err) }, cors);
  }
});

async function benkyoVersion() {
  try { return (await runBenkyo(['--version'], { json: false })).trim(); }
  catch { return 'unknown'; }
}

server.listen(PORT, () => {
  console.log(`benkyo bridge listening on http://localhost:${PORT}`);
  console.log(`  try: http://localhost:${PORT}/render?project=prj21&format=mermaid`);
});
