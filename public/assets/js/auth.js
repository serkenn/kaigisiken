// =============================================================
// フロント側 パスキー認証（WebAuthn）
//   - 初回: registerPasskey() でパスキー作成
//   - 再アクセス: checkSession() でログイン状態判定
//   - 別端末: loginPasskey()（「サインイン」ボタン）でパスキー選択ログイン
//   @simplewebauthn/browser は CDN(ESM) から読み込む（フロントのビルド不要）。
// =============================================================
import {
  startRegistration, startAuthentication,
} from 'https://esm.sh/@simplewebauthn/browser@13';

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `${r.status}`);
  return data;
}

// 'authed' | 'guest'（未ログイン・関数あり）| 'unavailable'（関数未デプロイ等）
export async function checkSession() {
  try {
    const r = await fetch('/api/me');
    if (r.status === 401) return { state: 'guest' };
    if (!r.ok) return { state: 'unavailable' };
    const { user } = await r.json();
    return { state: 'authed', user };
  } catch {
    return { state: 'unavailable' };
  }
}

export async function registerPasskey(name) {
  const { options } = await postJSON('/api/auth/register-options', { name });
  const att = await startRegistration({ optionsJSON: options });
  const { user } = await postJSON('/api/auth/register-verify', { response: att });
  return user;
}

export async function loginPasskey() {
  const { options } = await postJSON('/api/auth/login-options', {});
  const asr = await startAuthentication({ optionsJSON: options });
  const { user } = await postJSON('/api/auth/login-verify', { response: asr });
  return user;
}

export async function logout() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch { /* noop */ }
}

export function webauthnSupported() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

// ---- 認証ゲート画面 ----
// opts: { state, onAuthed(user), onLocal() }
export function renderGate(opts) {
  const supported = webauthnSupported();
  const unavailable = opts.state === 'unavailable';
  document.body.innerHTML = `
    <div class="gate">
      <div class="gate-card">
        <div class="gate-brand">⚓ 海技試験ナビ</div>
        <p class="gate-lead">学習・受験データをパスキーで安全に管理します。</p>

        ${unavailable ? `
          <div class="gate-note warn">
            サーバー認証に接続できませんでした（Functions未デプロイ／ローカルで関数未起動の可能性）。
            ローカル保存のみで利用できます。
          </div>` : ''}

        ${!supported ? `
          <div class="gate-note warn">このブラウザはパスキー(WebAuthn)に対応していません。ローカル保存でご利用ください。</div>` : ''}

        ${supported && !unavailable ? `
          <div class="gate-block">
            <h3>はじめての方</h3>
            <label class="gate-field">表示名（任意）
              <input id="reg-name" type="text" placeholder="例: 自分" maxlength="40">
            </label>
            <button id="btn-register" class="btn primary">パスキーを作成して開始</button>
          </div>
          <div class="gate-sep">または</div>
          <div class="gate-block">
            <h3>登録済み・別端末の方</h3>
            <button id="btn-login" class="btn">サインイン（パスキー）</button>
          </div>
        ` : ''}

        <div class="gate-sep">${supported && !unavailable ? '' : ''}</div>
        <button id="btn-local" class="btn ghost">ローカル保存だけで使う（同期なし）</button>
        <p id="gate-msg" class="gate-msg"></p>
      </div>
    </div>`;

  const msg = (t, err = false) => {
    const el = document.getElementById('gate-msg');
    el.textContent = t; el.classList.toggle('err', err);
  };

  const reg = document.getElementById('btn-register');
  if (reg) reg.addEventListener('click', async () => {
    reg.disabled = true; msg('パスキーを作成中…');
    try {
      const user = await registerPasskey(document.getElementById('reg-name').value);
      opts.onAuthed(user);
    } catch (e) { msg('登録に失敗: ' + e.message, true); reg.disabled = false; }
  });

  const login = document.getElementById('btn-login');
  if (login) login.addEventListener('click', async () => {
    login.disabled = true; msg('サインイン中…');
    try {
      const user = await loginPasskey();
      opts.onAuthed(user);
    } catch (e) { msg('サインインに失敗: ' + e.message, true); login.disabled = false; }
  });

  document.getElementById('btn-local').addEventListener('click', () => opts.onLocal());
}
