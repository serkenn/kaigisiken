// AI相談プロキシ（要ログイン）。OpenAI / Anthropic を環境変数で切替。
//   AI_PROVIDER = 'openai'（既定）| 'anthropic'
//   OPENAI_API_KEY / ANTHROPIC_API_KEY
//   AI_MODEL（任意。未指定時は各プロバイダの既定）
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
    if (provider === 'anthropic') {
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
          max_tokens: 1024,
          system: system || '',
          messages: msgs.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
        }),
      });
      const data = await r.json();
      if (!r.ok) return json({ error: 'AI APIエラー', detail: data }, 502);
      const reply = (data.content || []).map((b) => b.text || '').join('').trim();
      return json({ reply });
    }

    // 既定: OpenAI 互換 Chat Completions
    if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY が未設定です。' }, 503);
    const model = env.AI_MODEL || 'gpt-4o-mini';
    const r = await fetch((env.OPENAI_BASE_URL || 'https://api.openai.com/v1') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...msgs,
        ],
      }),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: 'AI APIエラー', detail: data }, 502);
    const reply = (data.choices?.[0]?.message?.content || '').trim();
    return json({ reply });
  } catch (e) {
    return json({ error: 'AI呼び出しに失敗しました', detail: String(e.message || e) }, 502);
  }
}
