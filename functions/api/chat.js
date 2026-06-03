// AI相談プロキシ（要ログイン）。プロバイダを環境変数で切替。
//   AI_PROVIDER:
//     'openai-responses'  … OpenAI Responses API（codex-everywhere 等）。base_url+"/responses"
//     'openai'            … OpenAI 互換 Chat Completions。base_url+"/chat/completions"
//     'anthropic'         … Anthropic Messages API
//   OPENAI_BASE_URL  … 例: https://codex-everywhere.com （末尾スラッシュ可）
//   OPENAI_API_KEY   … Bearer トークン（codex-everywhere で発行した APIキー）
//   AI_MODEL         … 例: gpt-5.5
//   AI_REASONING_EFFORT … 任意（responses時のみ。low/medium/high）。未設定ならモデル既定。
import { requireUser, readBody, json } from '../../lib/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    await requireUser(context);
  } catch (resp) {
    return resp instanceof Response ? resp : json({ error: 'unauthorized' }, 401);
  }

  const { system, messages } = await readBody(request);
  const msgs = Array.isArray(messages) ? messages.filter((m) => m && m.role && m.content) : [];
  const provider = (env.AI_PROVIDER || 'openai').toLowerCase();

  try {
    if (provider === 'anthropic') return await callAnthropic(env, system, msgs);
    if (provider === 'openai-responses') return await callResponses(env, system, msgs);
    return await callChatCompletions(env, system, msgs);
  } catch (e) {
    return json({ error: 'AI呼び出しに失敗しました', detail: String(e.message || e) }, 502);
  }
}

function baseUrl(env) {
  return (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
}

// ---- OpenAI Responses API（codex-everywhere 等） ----
async function callResponses(env, system, msgs) {
  if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY が未設定です。' }, 503);
  const model = env.AI_MODEL || 'gpt-5.5';
  const body = {
    model,
    instructions: system || '',
    input: msgs.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content),
    })),
    max_output_tokens: Number(env.AI_MAX_OUTPUT_TOKENS || 4000),
    reasoning: { effort: env.AI_REASONING_EFFORT || 'low' },
  };

  const r = await fetch(`${baseUrl(env)}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) return json({ error: 'AI APIエラー', detail: data }, 502);
  return json({ reply: extractResponsesText(data) });
}

// Responses API のレスポンスから本文テキストを取り出す
function extractResponsesText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of data.output || []) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const c of content) {
      if (typeof c === 'string') parts.push(c);
      else if (typeof c.text === 'string') parts.push(c.text);
      else if (c.text && typeof c.text.value === 'string') parts.push(c.text.value);
    }
  }
  const txt = parts.join('').trim();
  if (txt) return txt;
  const status = data.status || '?';
  const reason = data.incomplete_details?.reason || '';
  const types = (data.output || []).map((o) => o.type).join(',') || '(none)';
  let hint = '';
  if (reason === 'max_output_tokens') hint = ' 思考トークンが上限に達しました。AI_MAX_OUTPUT_TOKENS を増やすか AI_REASONING_EFFORT=minimal を。';
  return `⚠️ 本文が空でした (status=${status}${reason ? ', reason=' + reason : ''}, items=[${types}]).${hint}`;
}

// ---- OpenAI 互換 Chat Completions ----
async function callChatCompletions(env, system, msgs) {
  if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY が未設定です。' }, 503);
  const model = env.AI_MODEL || 'gpt-4o-mini';
  const r = await fetch(`${baseUrl(env)}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...msgs],
    }),
  });
  const data = await r.json();
  if (!r.ok) return json({ error: 'AI APIエラー', detail: data }, 502);
  return json({ reply: (data.choices?.[0]?.message?.content || '').trim() });
}

// ---- Anthropic Messages ----
async function callAnthropic(env, system, msgs) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY が未設定です。' }, 503);
  const model = env.AI_MODEL || 'claude-haiku-4-5';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: system || '',
      messages: msgs.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    }),
  });
  const data = await r.json();
  if (!r.ok) return json({ error: 'AI APIエラー', detail: data }, 502);
  return json({ reply: (data.content || []).map((b) => b.text || '').join('').trim() });
}
