// =============================================================
// 海技試験ナビ — コンテナ用サーバー（Docker + cloudflared + Cloudflare Access）
//   - 静的SPA(public/)を配信
//   - 認証は前段の Cloudflare Access（このサーバーは identity を信頼）
//   - /api/data    … 個人データをファイル保存（メール単位）
//   - /api/roadmap … benkyo を「ライブ」render（DBはホストからマウント）
//   - /api/chat    … codex-everywhere(Responses API) へプロキシ
// =============================================================
import express from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAccessUser, logoutUrl } from './access.mjs';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '.appdata');
const BENKYO = process.env.BENKYO_BIN || 'benkyo';
const BENKYO_DB = process.env.BENKYO_DB || '';
const PROJECT_DEFAULT = process.env.BENKYO_PROJECT || 'prj21';
const ID_RE = /^[a-z]+[0-9]+$/;

const app = express();
app.use(express.json({ limit: '2mb' }));

// ---- 認証ミドルウェア（Cloudflare Access） ----
async function auth(req, res, next) {
  try {
    const user = await getAccessUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    req.user = user;
    next();
  } catch (e) {
    res.status(401).json({ error: 'unauthorized', detail: String(e.message || e) });
  }
}

app.get('/api/me', auth, (req, res) => {
  res.json({
    user: { id: req.user.email, name: req.user.email },
    authProvider: 'access',
    logoutUrl: logoutUrl(),
  });
});

// ---- 個人データ（ファイル保存・メール単位） ----
function dataFile(email) {
  return path.join(DATA_DIR, email.replace(/[^a-zA-Z0-9._@-]/g, '_') + '.json');
}
app.get('/api/data', auth, async (req, res) => {
  try {
    const t = await readFile(dataFile(req.user.email), 'utf8');
    res.json({ data: JSON.parse(t) });
  } catch {
    res.json({ data: null });
  }
});
app.put('/api/data', auth, async (req, res) => {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(dataFile(req.user.email), JSON.stringify(req.body.data ?? {}));
  res.json({ ok: true });
});

// ---- ロードマップ（benkyo ライブ） ----
async function benkyoCmd(args) {
  const full = BENKYO_DB ? ['--db', BENKYO_DB, ...args] : args;
  const { stdout } = await execFileP(BENKYO, full, { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}
app.get('/api/roadmap', auth, async (req, res) => {
  const proj = String(req.query.project || PROJECT_DEFAULT);
  if (!ID_RE.test(proj)) return res.status(400).json({ error: 'invalid project id' });
  try {
    const mermaid = await benkyoCmd(['render', '--project', proj, '--format', 'mermaid']);
    res.json({ roadmap: { project: proj, mermaid, exportedAt: Date.now(), live: true } });
  } catch (e) {
    res.status(502).json({ error: 'benkyo failed', detail: String(e.stderr || e.message || e) });
  }
});
app.get('/api/roadmap/projects', auth, async (_req, res) => {
  try { res.type('application/json').send(await benkyoCmd(['project', 'list'])); }
  catch (e) { res.status(502).json({ error: 'benkyo failed', detail: String(e.stderr || e.message || e) }); }
});

// ---- AI相談（codex-everywhere / Responses API） ----
app.post('/api/chat', auth, async (req, res) => {
  const { system, messages } = req.body || {};
  const msgs = Array.isArray(messages) ? messages.filter((m) => m && m.role && m.content) : [];
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'OPENAI_API_KEY が未設定です。' });
  const base = (process.env.OPENAI_BASE_URL || 'https://codex-everywhere.com').replace(/\/+$/, '');
  const model = process.env.AI_MODEL || 'gpt-5.5';
  try {
    const body = {
      model,
      instructions: system || '',
      input: msgs.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) })),
      // 推論モデル(gpt-5.x)は思考トークンを消費するため、本文が出るよう枠を広めに
      max_output_tokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 4000),
      // 既定は low（高にすると思考に枠を取られ本文が空になりやすい）
      reasoning: { effort: process.env.AI_REASONING_EFFORT || 'low' },
    };
    const r = await fetch(`${base}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'AI APIエラー', detail: data });
    res.json({ reply: extractResponsesText(data) });
  } catch (e) {
    res.status(502).json({ error: 'AI呼び出しに失敗しました', detail: String(e.message || e) });
  }
});

function extractResponsesText(data) {
  return extractAny(data);
}

// 複数の返却形式に対応して本文テキストを取り出す。見つからなければ生データを診断表示。
function extractAny(data) {
  if (!data || typeof data !== 'object') return String(data ?? '');
  // 1) Responses API: output_text
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  // 2) Responses API: output[].content[].text
  const parts = [];
  for (const item of data.output || []) {
    for (const c of (Array.isArray(item.content) ? item.content : [])) {
      if (typeof c === 'string') parts.push(c);
      else if (typeof c.text === 'string') parts.push(c.text);
      else if (c.text && typeof c.text.value === 'string') parts.push(c.text.value);
    }
  }
  // 3) Chat Completions 形式
  if (data.choices && data.choices[0]) {
    const ch = data.choices[0];
    if (ch.message && typeof ch.message.content === 'string') parts.push(ch.message.content);
    else if (Array.isArray(ch.message?.content)) for (const c of ch.message.content) { if (typeof c.text === 'string') parts.push(c.text); }
    else if (typeof ch.text === 'string') parts.push(ch.text);
  }
  // 4) Anthropic 風 content[].text / その他の素直なフィールド
  if (Array.isArray(data.content)) for (const c of data.content) { if (typeof c.text === 'string') parts.push(c.text); }
  for (const k of ['text', 'response', 'message', 'reply', 'content']) {
    if (typeof data[k] === 'string' && data[k].trim()) parts.push(data[k]);
  }
  const txt = parts.join('').trim();
  if (txt) return txt;
  // 見つからない: 構造を見せる（鍵と生JSONの先頭）
  const keys = Object.keys(data).join(',');
  let snip = '';
  try { snip = JSON.stringify(data).slice(0, 900); } catch { snip = '(stringify失敗)'; }
  return `⚠️ 本文を取り出せませんでした。keys=[${keys}] status=${data.status || '?'}\nraw: ${snip}`;
}

// ---- 静的配信 ----
app.use(express.static(PUBLIC));
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

app.listen(PORT, () => {
  console.log(`kaigisiken server listening on :${PORT}`);
  console.log(`  benkyo DB: ${BENKYO_DB || '(default)'} / project: ${PROJECT_DEFAULT}`);
  console.log(`  auth: ${process.env.DEV_BYPASS_AUTH === '1' ? 'DEV bypass' : 'Cloudflare Access'}`);
});
