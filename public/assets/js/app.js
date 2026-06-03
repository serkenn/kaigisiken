// =============================================================
// 海技試験 管理ツール — アプリ本体
// =============================================================
import {
  RULES, SYSTEMS, GRADES, STRATEGIES, EXAMS, getExam, examKey,
} from './data.js';
import * as store from './store.js';
import * as auth from './auth.js';

// ---------- 認証・同期の状態 ----------
let currentUser = null;
let syncMode = 'local'; // 'server' | 'local'
let applyingRemote = false;
let syncTimer = null;
let accessLogoutUrl = null; // Cloudflare Access のログアウトURL（あれば）

// ---------- ユーティリティ ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s + (s.length === 10 ? 'T00:00:00' : ''));
  return isNaN(d) ? null : d;
}
function fmtDate(d) {
  if (!d) return '—';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
function daysUntil(d) {
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

const SUBJECT_STATUS = {
  none: { label: '未着手', cls: 'st-none' },
  planned: { label: '受験予定', cls: 'st-planned' },
  studying: { label: '学習中', cls: 'st-studying' },
  passed: { label: '合格', cls: 'st-passed' },
  failed: { label: '不合格', cls: 'st-failed' },
};

// ---------- ルーター ----------
const TABS = [
  { id: 'dashboard', label: 'ダッシュボード', icon: '🧭' },
  { id: 'plan', label: '受験プラン', icon: '🗂️' },
  { id: 'roadmap', label: 'ロードマップ', icon: '🛣️' },
  { id: 'subjects', label: '科目・細目', icon: '📚' },
  { id: 'ai', label: 'AI相談', icon: '🤖' },
  { id: 'settings', label: '設定', icon: '⚙️' },
];
let activeTab = location.hash.replace('#', '') || 'dashboard';
if (!TABS.some((t) => t.id === activeTab)) activeTab = 'dashboard';

function navigate(tab) {
  activeTab = tab;
  history.replaceState(null, '', `#${tab}`);
  render();
}

// ---------- レンダリング ----------
const appEl = () => $('#app');

function render() {
  const s = store.getState();
  document.body.innerHTML = `
    <header class="topbar">
      <div class="brand">⚓ 海技試験ナビ</div>
      <div class="target-pill">${esc(targetLabel(s))}</div>
      <div class="auth-area">
        ${syncMode === 'server'
          ? `<span class="sync-chip ok" title="サーバー同期中">☁ ${esc(currentUser?.name || 'ログイン中')}</span><button class="btn-mini" id="btn-logout">ログアウト</button>`
          : `<span class="sync-chip local" title="この端末にのみ保存">📴 ローカル</span><button class="btn-mini" id="btn-signin">サインイン</button>`}
      </div>
    </header>
    <nav class="tabs">
      ${TABS.map((t) => `
        <button class="tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">
          <span class="tab-icon">${t.icon}</span><span>${t.label}</span>
        </button>`).join('')}
    </nav>
    <main id="app"></main>
    <footer class="foot">${esc(RULES.source)} ／ ${esc(RULES.officialNote)}</footer>
  `;
  $$('.tab').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.tab)));

  const logoutBtn = $('#btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    if (accessLogoutUrl) { window.location.href = accessLogoutUrl; return; } // Cloudflare Access
    await auth.logout();
    currentUser = null; syncMode = 'local';
    render();
  });
  const signinBtn = $('#btn-signin');
  if (signinBtn) signinBtn.addEventListener('click', () => showGate('guest'));

  const view = {
    dashboard: renderDashboard,
    plan: renderPlan,
    roadmap: renderRoadmap,
    subjects: renderSubjects,
    ai: renderAI,
    settings: renderSettings,
  }[activeTab];
  view(s);
}

function targetLabel(s) {
  const exam = getExam(s.profile.system, s.profile.grade);
  const strat = STRATEGIES.find((x) => x.id === s.profile.strategy);
  return `${exam ? exam.title : '未設定'}・${strat ? strat.name : ''}`;
}

// =============================================================
// ダッシュボード
// =============================================================
function renderDashboard(s) {
  const exam = getExam(s.profile.system, s.profile.grade);
  if (!exam) {
    appEl().innerHTML = noDataCard(s);
    bindNoData();
    return;
  }

  // 次の試験
  const upcoming = s.sittings
    .map((sit) => ({ sit, sch: store.findSchedule(sit.scheduleId) }))
    .map((x) => ({ ...x, date: parseDate(x.sit.type === 'oral' ? x.sch?.oralDate : x.sch?.writtenDate) }))
    .filter((x) => x.date && daysUntil(x.date) >= 0)
    .sort((a, b) => a.date - b.date);
  const next = upcoming[0];

  // 進捗集計（筆記対象科目のみ）
  const writtenSubjects = exam.subjects.filter((sub) => subjectHasWritten(sub));
  const counts = { passed: 0, total: writtenSubjects.length };
  writtenSubjects.forEach((sub) => {
    if (store.subjectProgress(sub.id).status === 'passed') counts.passed++;
  });

  // 科目合格 有効期限アラート
  const expiryAlerts = exam.subjects
    .map((sub) => ({ sub, exp: store.subjectPassExpiry(sub.id) }))
    .filter((x) => x.exp)
    .map((x) => ({ ...x, days: daysUntil(x.exp) }))
    .sort((a, b) => a.days - b.days);

  appEl().innerHTML = `
    <div class="grid">
      <section class="card hero">
        <div class="card-h">次の試験まで</div>
        ${next ? `
          <div class="countdown">${daysUntil(next.date)}<span>日</span></div>
          <div class="muted">${esc(next.sit.label)}・${next.sit.type === 'oral' ? '口述' : '筆記'}（${fmtDate(next.date)}）</div>
          <div class="chips">${next.sit.subjectIds.map((id) => chip(subjShort(exam, id))).join('')}</div>
        ` : `
          <div class="countdown muted">—</div>
          <div class="muted">試験日が未設定です。<a href="#plan" data-nav="plan">受験プラン</a>で日付を入力してください。</div>
        `}
      </section>

      <section class="card">
        <div class="card-h">筆記科目の進捗</div>
        <div class="progress-num">${counts.passed} / ${counts.total} <span class="muted">科目合格</span></div>
        <div class="bar"><div class="bar-fill" style="width:${counts.total ? (counts.passed / counts.total) * 100 : 0}%"></div></div>
        <div class="subj-mini">
          ${writtenSubjects.map((sub) => {
            const st = store.subjectProgress(sub.id).status;
            const meta = SUBJECT_STATUS[st] || SUBJECT_STATUS.none;
            return `<span class="badge ${meta.cls}">${esc(sub.short)}：${meta.label}</span>`;
          }).join('')}
        </div>
      </section>

      <section class="card">
        <div class="card-h">科目合格の有効期限</div>
        ${expiryAlerts.length ? `
          <ul class="alert-list">
            ${expiryAlerts.map((a) => `
              <li class="${a.days < 180 ? 'warn' : ''}">
                <b>${esc(a.sub.short)}</b> 合格 → ${fmtDate(a.exp)} まで有効
                <span class="muted">（残り${a.days >= 0 ? a.days + '日' : '期限切れ'}）</span>
              </li>`).join('')}
          </ul>
          <p class="hint">有効期間は <b>${RULES.subjectPassValidYears}年</b>。期限内に残り科目＋口述を終える計画を。</p>
        ` : `<p class="muted">合格済み科目はまだありません。合格を登録すると有効期限を自動表示します。</p>`}
      </section>

      <section class="card span2">
        <div class="card-h">この試験の要点（${esc(exam.title)}）</div>
        <ul class="facts">
          <li>筆記科目：${writtenSubjects.map((x) => esc(x.short)).join('・') || '—'}</li>
          <li>口述試験：${exam.hasOral ? 'あり' : 'なし'}${exam.requiresPhysical ? '／身体検査あり' : ''}</li>
          <li>定期試験：年4回（${RULES.examMonths.map((m) => m + '月').join('・')}）</li>
          <li>一部科目合格は <b>${RULES.subjectPassValidYears}年</b> 有効・全科目合格は <b>${RULES.writtenFullPassValidYears}年</b> 有効</li>
        </ul>
        <p class="hint">※ <b>三級航海</b>では「法規」の筆記対象は〈衝突予防法・海交法・港則法／船員法／海防法〉のみ、それ以外と「英語」は口述試験のみの対象です。<a href="#subjects" data-nav="subjects">科目・細目</a>で確認できます。</p>
      </section>
    </div>
  `;
  $$('[data-nav]').forEach((a) =>
    a.addEventListener('click', (e) => { e.preventDefault(); navigate(a.dataset.nav); }));
}

function chip(t) { return `<span class="chip">${esc(t)}</span>`; }
function subjShort(exam, id) {
  const sub = exam.subjects.find((x) => x.id === id);
  return sub ? sub.short : id;
}
function subjectHasWritten(sub) {
  if (sub.exam === 'written') return true;
  if (sub.exam === 'oral') return false;
  return sub.categories.some((c) =>
    c.exam === 'written' || (c.topics || []).some((t) => t.exam === 'written'));
}

// =============================================================
// 受験プラン
// =============================================================
function renderPlan(s) {
  const exam = getExam(s.profile.system, s.profile.grade);
  const year = new Date().getFullYear();
  const schedules = store.currentSchedule(year);

  appEl().innerHTML = `
    <section class="card">
      <div class="card-h">受験ターゲット</div>
      <div class="form-row">
        <label>系統
          <select id="sel-system">
            ${SYSTEMS.map((x) => `<option value="${x.id}" ${x.id === s.profile.system ? 'selected' : ''}>${x.name}（${x.desc}）</option>`).join('')}
          </select>
        </label>
        <label>級
          <select id="sel-grade">
            ${GRADES.map((g) => `<option value="${g}" ${g === s.profile.grade ? 'selected' : ''}>${g}級</option>`).join('')}
          </select>
        </label>
        <label>戦略
          <select id="sel-strategy">
            ${STRATEGIES.map((x) => `<option value="${x.id}" ${x.id === s.profile.strategy ? 'selected' : ''}>${x.name}</option>`).join('')}
          </select>
        </label>
      </div>
      <p class="hint">${esc(STRATEGIES.find((x) => x.id === s.profile.strategy)?.desc || '')}</p>
      ${!exam ? `<p class="warn-box">この級・系統の科目データはまだ収録されていません（現在は三級航海を収録）。データは後から追加できます。</p>` : ''}
    </section>

    <section class="card">
      <div class="card-h">受験回（sitting）<button class="btn-mini" id="add-sitting">＋ 受験回を追加</button></div>
      <p class="hint">どの定期試験で・どの科目を・筆記/口述どちらで受けるかを設計します。科目合格狙いなら複数回に分けます。</p>
      <div id="sittings">
        ${s.sittings.map((sit) => sittingCard(sit, exam, schedules)).join('') || '<p class="muted">受験回がありません。「＋ 受験回を追加」から作成してください。</p>'}
      </div>
    </section>

    <section class="card">
      <div class="card-h">${year}年 定期試験日程（要確認・編集可）</div>
      <p class="hint">正確な日付・出願期間は所轄の地方運輸局で確認して入力してください。${RULES.links.map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${esc(l.label)}↗</a>`).join('')}</p>
      <table class="sched">
        <thead><tr><th>定期</th><th>筆記日</th><th>口述日</th><th>出願 開始</th><th>出願 締切</th><th>メモ</th></tr></thead>
        <tbody>
          ${schedules.map((sc) => `
            <tr data-sched="${sc.id}">
              <td>${esc(sc.season)}</td>
              <td><input type="date" data-f="writtenDate" value="${esc(sc.writtenDate)}"></td>
              <td><input type="date" data-f="oralDate" value="${esc(sc.oralDate)}"></td>
              <td><input type="date" data-f="applyFrom" value="${esc(sc.applyFrom)}"></td>
              <td><input type="date" data-f="applyTo" value="${esc(sc.applyTo)}"></td>
              <td><input type="text" data-f="note" value="${esc(sc.note)}" placeholder="会場など"></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </section>
  `;

  // ターゲット変更
  $('#sel-system').addEventListener('change', (e) => store.update((st) => { st.profile.system = e.target.value; }));
  $('#sel-grade').addEventListener('change', (e) => store.update((st) => { st.profile.grade = Number(e.target.value); }));
  $('#sel-strategy').addEventListener('change', (e) => store.update((st) => { st.profile.strategy = e.target.value; }));

  // 受験回 追加
  $('#add-sitting').addEventListener('click', () => {
    store.update((st) => {
      st.sittings.push({
        id: crypto.randomUUID(),
        label: `${year}年 受験回${st.sittings.length + 1}`,
        scheduleId: schedules[0]?.id || '',
        type: 'written',
        subjectIds: [],
      });
    });
  });

  // 受験回 操作（委譲）
  $('#sittings').addEventListener('click', (e) => {
    const card = e.target.closest('[data-sitting]');
    if (!card) return;
    const id = card.dataset.sitting;
    if (e.target.matches('[data-del]')) {
      store.update((st) => { st.sittings = st.sittings.filter((x) => x.id !== id); });
    }
    if (e.target.matches('[data-subj]')) {
      const subjId = e.target.dataset.subj;
      store.update((st) => {
        const sit = st.sittings.find((x) => x.id === id);
        if (!sit) return;
        sit.subjectIds = e.target.checked
          ? [...new Set([...sit.subjectIds, subjId])]
          : sit.subjectIds.filter((x) => x !== subjId);
      });
    }
  });
  $('#sittings').addEventListener('change', (e) => {
    const card = e.target.closest('[data-sitting]');
    if (!card) return;
    const id = card.dataset.sitting;
    if (e.target.matches('[data-label]')) {
      store.update((st) => { const sit = st.sittings.find((x) => x.id === id); if (sit) sit.label = e.target.value; });
    }
    if (e.target.matches('[data-schedule]')) {
      store.update((st) => { const sit = st.sittings.find((x) => x.id === id); if (sit) sit.scheduleId = e.target.value; });
    }
    if (e.target.matches('[data-type]')) {
      store.update((st) => { const sit = st.sittings.find((x) => x.id === id); if (sit) sit.type = e.target.value; });
    }
  });

  // 日程編集
  $('.sched').addEventListener('change', (e) => {
    const row = e.target.closest('[data-sched]');
    if (!row) return;
    const f = e.target.dataset.f;
    store.update((st) => {
      const list = st.schedules[year];
      const sc = list.find((x) => x.id === row.dataset.sched);
      if (sc) sc[f] = e.target.value;
    });
  });
}

function sittingCard(sit, exam, schedules) {
  const subs = exam ? exam.subjects : [];
  return `
    <div class="sitting" data-sitting="${sit.id}">
      <div class="sitting-top">
        <input class="sitting-label" data-label type="text" value="${esc(sit.label)}">
        <button class="btn-mini danger" data-del>削除</button>
      </div>
      <div class="form-row">
        <label>定期試験
          <select data-schedule>
            ${schedules.map((sc) => `<option value="${sc.id}" ${sc.id === sit.scheduleId ? 'selected' : ''}>${esc(sc.season)}</option>`).join('')}
          </select>
        </label>
        <label>区分
          <select data-type>
            <option value="written" ${sit.type === 'written' ? 'selected' : ''}>筆記</option>
            <option value="oral" ${sit.type === 'oral' ? 'selected' : ''}>口述</option>
          </select>
        </label>
      </div>
      <div class="subj-pick">
        ${subs.map((sub) => `
          <label class="pick ${sit.subjectIds.includes(sub.id) ? 'on' : ''}">
            <input type="checkbox" data-subj="${sub.id}" ${sit.subjectIds.includes(sub.id) ? 'checked' : ''}>
            ${esc(sub.short)}
          </label>`).join('')}
      </div>
    </div>`;
}

// =============================================================
// ロードマップ（タイムライン）
// =============================================================
function renderRoadmap(s) {
  const exam = getExam(s.profile.system, s.profile.grade);
  // 受験回を日付順に並べ、各科目の合格状況・有効期限を重ねて表示
  const items = s.sittings
    .map((sit) => {
      const sch = store.findSchedule(sit.scheduleId);
      const date = parseDate(sit.type === 'oral' ? sch?.oralDate : sch?.writtenDate);
      return { sit, sch, date };
    })
    .sort((a, b) => (a.date && b.date ? a.date - b.date : a.date ? -1 : 1));

  const expiries = exam ? exam.subjects
    .map((sub) => ({ sub, exp: store.subjectPassExpiry(sub.id) }))
    .filter((x) => x.exp) : [];

  appEl().innerHTML = `
    <section class="card">
      <div class="card-h">履修ロードマップ（benkyo連携）
        <button class="btn-mini" id="bk-reload">再読込</button>
      </div>
      <p class="hint">概念依存グラフは <b>benkyo</b> が管理します。取得元: <b>${s.settings.roadmapSource === 'bridge' ? 'ローカルブリッジ' : 'サーバー（/api/roadmap）'}</b>。
        ${s.settings.roadmapSource === 'cloud' ? 'コンテナ運用ならbenkyo DBをマウントしてライブ表示、Pages運用なら <code>npm run sync</code> で同期したスナップショットを表示します。' : `ローカルブリッジ <code>${esc(s.settings.bridgeUrl)}</code> / プロジェクト <code>${esc(s.settings.benkyoProject)}</code> から取得。`}
        <span class="muted">青=深く理解 / 黄=道具として使う / 灰=試験ゴール</span></p>
      <div id="bk-graph" class="bk-graph"><div class="muted">読み込み中…</div></div>
    </section>

    <section class="card">
      <div class="card-h">受験スケジュール</div>
      ${items.length ? `
      <ol class="timeline">
        ${items.map((it) => {
          const d = daysUntil(it.date);
          const past = d !== null && d < 0;
          return `
          <li class="tl-item ${past ? 'past' : ''}">
            <div class="tl-dot ${it.sit.type === 'oral' ? 'oral' : 'written'}"></div>
            <div class="tl-body">
              <div class="tl-date">${it.date ? fmtDate(it.date) : '日付未設定'} ${d !== null ? `<span class="muted">（${past ? '済' : '残' + d + '日'}）</span>` : ''}</div>
              <div class="tl-title">${esc(it.sit.label)}・${it.sit.type === 'oral' ? '口述試験' : '筆記試験'}</div>
              <div class="chips">${it.sit.subjectIds.map((id) => chip(subjShort(exam, id))).join('') || '<span class="muted">科目未設定</span>'}</div>
            </div>
          </li>`;
        }).join('')}
        ${exam && exam.hasOral ? `
          <li class="tl-item note">
            <div class="tl-dot phys"></div>
            <div class="tl-body">
              <div class="tl-title">身体検査 ＋ 口述試験</div>
              <div class="muted">筆記の全科目に合格（または免除）後に受験。口述は ${esc(oralOnlySummary(exam))} が中心。</div>
            </div>
          </li>` : ''}
      </ol>` : `<p class="muted">受験回がありません。<a href="#plan" data-nav="plan">受験プラン</a>で追加してください。</p>`}
    </section>

    ${expiries.length ? `
    <section class="card">
      <div class="card-h">科目合格 有効期限ライン</div>
      <ul class="expiry">
        ${expiries.sort((a, b) => a.exp - b.exp).map((x) => {
          const d = daysUntil(x.exp);
          return `<li class="${d < 180 ? 'warn' : ''}"><b>${esc(x.sub.short)}</b><span class="muted">合格 ${fmtDate(parseDate(store.subjectProgress(x.sub.id).passedDate))}</span> → <b>${fmtDate(x.exp)}</b> まで（残${d}日）</li>`;
        }).join('')}
      </ul>
      <p class="hint">この期限までに「残りの筆記科目」と「口述試験」を終えないと、合格済み科目が失効します。</p>
    </section>` : ''}
  `;
  $$('[data-nav]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); navigate(a.dataset.nav); }));
  const reload = $('#bk-reload');
  if (reload) reload.addEventListener('click', loadBenkyoGraph);
  loadBenkyoGraph();
}

let mermaidMod = null;
async function renderMermaid(el, text) {
  if (!text || !text.trim()) { el.innerHTML = '<p class="muted">グラフが空です。</p>'; return; }
  if (!mermaidMod) {
    mermaidMod = (await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs')).default;
    mermaidMod.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
  }
  const { svg } = await mermaidMod.render('bkGraphSvg', text);
  el.innerHTML = svg;
}

async function loadBenkyoGraph() {
  const el = $('#bk-graph');
  if (!el) return;
  const s = store.getState();
  el.innerHTML = '<div class="muted">読み込み中…</div>';

  if (s.settings.roadmapSource === 'bridge') {
    // ローカルブリッジから取得
    const base = (s.settings.bridgeUrl || '').replace(/\/$/, '');
    const proj = s.settings.benkyoProject;
    if (!base || !proj) { el.innerHTML = '<p class="muted">設定でブリッジURLとプロジェクトIDを指定してください。</p>'; return; }
    try {
      const res = await fetch(`${base}/render?project=${encodeURIComponent(proj)}&format=mermaid`);
      if (!res.ok) throw new Error(`bridge ${res.status}`);
      const { text } = await res.json();
      await renderMermaid(el, text);
    } catch (e) {
      el.innerHTML = `
        <div class="gate-note warn">
          benkyoブリッジに接続できませんでした（${esc(e.message)}）。<br>
          Macで <code>npm run bridge</code> を起動するか、設定で取得元を「Cloudflare」に変更してください。
        </div>`;
    }
    return;
  }

  // 既定: Cloudflare KV のスナップショットから取得（端末非依存）
  try {
    const res = await fetch('/api/roadmap');
    if (res.status === 401) { el.innerHTML = '<p class="muted">ログインするとロードマップを表示できます。</p>'; return; }
    if (!res.ok) throw new Error(`api ${res.status}`);
    const { roadmap } = await res.json();
    if (!roadmap || !roadmap.mermaid) {
      el.innerHTML = `
        <div class="gate-note warn">
          まだロードマップが同期されていません。<br>
          Macで <code>npm run sync</code> を一度実行すると、ここに表示されます（以後どの端末でも閲覧可）。
        </div>`;
      return;
    }
    await renderMermaid(el, roadmap.mermaid);
    const when = new Date(roadmap.exportedAt);
    el.insertAdjacentHTML('beforeend', `<div class="muted" style="font-size:.75rem;margin-top:.4rem">最終同期: ${fmtDate(when)} ${when.toLocaleTimeString()}</div>`);
  } catch (e) {
    el.innerHTML = `<div class="gate-note warn">ロードマップの取得に失敗しました（${esc(e.message)}）。</div>`;
  }
}

function oralOnlySummary(exam) {
  const oralSubs = exam.subjects.filter((sub) => sub.exam === 'oral' || (sub.exam === 'mixed'));
  return oralSubs.map((x) => x.short).join('・');
}

// =============================================================
// 科目・細目チェックリスト
// =============================================================
let subjectFilter = 'all'; // all | written | oral

function renderSubjects(s) {
  const exam = getExam(s.profile.system, s.profile.grade);
  if (!exam) { appEl().innerHTML = noDataCard(s); bindNoData(); return; }

  appEl().innerHTML = `
    <section class="card">
      <div class="card-h">科目別 進捗 ＆ 細目チェックリスト（${esc(exam.title)}）</div>
      <div class="filters">
        <span>表示：</span>
        ${[['all', 'すべて'], ['written', '筆記対象のみ'], ['oral', '口述のみ']].map(([v, l]) =>
          `<button class="chip-btn ${subjectFilter === v ? 'on' : ''}" data-filter="${v}">${l}</button>`).join('')}
      </div>
    </section>
    ${exam.subjects.map((sub) => subjectBlock(sub)).join('')}
  `;

  $$('[data-filter]').forEach((b) => b.addEventListener('click', () => { subjectFilter = b.dataset.filter; render(); }));

  appEl().addEventListener('change', (e) => {
    // 科目ステータス・合格日
    if (e.target.matches('[data-subj-status]')) {
      const id = e.target.dataset.subjStatus;
      store.update((st) => {
        const p = st.subjects[id] || { status: 'none', examDate: '', passedDate: '', note: '' };
        p.status = e.target.value;
        st.subjects[id] = p;
      });
      render();
    }
    if (e.target.matches('[data-subj-passed]')) {
      const id = e.target.dataset.subjPassed;
      store.update((st) => {
        const p = st.subjects[id] || { status: 'passed', examDate: '', passedDate: '', note: '' };
        p.passedDate = e.target.value;
        st.subjects[id] = p;
      });
      render();
    }
    // 細目チェック
    if (e.target.matches('[data-topic]')) {
      const key = e.target.dataset.topic;
      store.update((st) => {
        if (e.target.checked) st.checklist[key] = { done: true };
        else delete st.checklist[key];
      });
    }
  });
}

function subjectBlock(sub) {
  const s = store.getState();
  const p = store.subjectProgress(sub.id);
  const exp = store.subjectPassExpiry(sub.id);
  const cats = (sub.categories || []).filter((c) => matchFilter(c));
  const examTag = sub.exam === 'oral'
    ? '<span class="tag oral">口述のみ</span>'
    : sub.exam === 'written'
      ? '<span class="tag written">筆記</span>'
      : '<span class="tag mixed">筆記＋口述</span>';

  return `
    <section class="card subject">
      <div class="subject-h">
        <h3>${esc(sub.name)} ${examTag}</h3>
        <div class="subject-ctrl">
          <select data-subj-status="${sub.id}">
            ${Object.entries(SUBJECT_STATUS).map(([v, m]) => `<option value="${v}" ${p.status === v ? 'selected' : ''}>${m.label}</option>`).join('')}
          </select>
          ${p.status === 'passed' ? `<label class="inline">合格日 <input type="date" data-subj-passed="${sub.id}" value="${esc(p.passedDate)}"></label>` : ''}
          ${exp ? `<span class="exp-note">→ ${fmtDate(exp)}まで有効</span>` : ''}
        </div>
      </div>
      ${cats.length ? cats.map((c) => categoryBlock(sub, c)).join('') : '<p class="muted">この表示条件に該当する細目はありません。</p>'}
    </section>`;
}

function matchFilter(cat) {
  if (subjectFilter === 'all') return true;
  if (cat.exam === subjectFilter) return true;
  return (cat.topics || []).some((t) => t.exam === subjectFilter);
}

function categoryBlock(sub, cat) {
  const topics = (cat.topics || []).filter((t) => subjectFilter === 'all' || t.exam === subjectFilter);
  if (!topics.length) return '';
  return `
    <div class="cat">
      <div class="cat-h">${esc(cat.name)} ${tagFor(cat.exam)}</div>
      <ul class="topics">
        ${topics.map((t, i) => {
          const key = `${sub.id}:${cat.id}:${i}`;
          const done = !!store.getState().checklist[key];
          return `<li class="${done ? 'done' : ''} ${t.exam === 'oral' ? 'is-oral' : ''}">
            <label><input type="checkbox" data-topic="${key}" ${done ? 'checked' : ''}> <span>${esc(t.text)}</span></label>
            ${t.exam === 'oral' ? '<span class="mini-tag">口述</span>' : ''}
          </li>`;
        }).join('')}
      </ul>
    </div>`;
}
function tagFor(exam) {
  if (exam === 'oral') return '<span class="tag oral sm">口述</span>';
  if (exam === 'written') return '<span class="tag written sm">筆記</span>';
  return '';
}

// =============================================================
// AI相談
// =============================================================
let chatHistory = []; // {role, content}

function renderAI(s) {
  appEl().innerHTML = `
    <section class="card">
      <div class="card-h">AI相談（学習計画・科目の質問）</div>
      <p class="hint">あなたの受験ターゲット・試験日・進捗・細目を踏まえて回答します。例：「7月までの週次学習プランを作って」「運用の操船で押さえるべき点は？」</p>
      <div class="quick">
        ${[
          '7月の筆記（運用・法規）までの週次学習プランを作って',
          '三級航海の法規で筆記対象だけを優先順に教えて',
          '科目合格狙いの場合の最短ルートを整理して',
          '口述試験に向けて今からやるべき準備は？',
        ].map((q) => `<button class="chip-btn" data-quick="${esc(q)}">${esc(q)}</button>`).join('')}
      </div>
      <div id="chat" class="chat">
        ${chatHistory.map(renderMsg).join('') || '<div class="chat-empty">質問を入力するか、上のボタンを押してください。</div>'}
      </div>
      <form id="chat-form" class="chat-form">
        <textarea id="chat-input" rows="2" placeholder="メッセージを入力（Enterで送信 / Shift+Enterで改行）"></textarea>
        <button type="submit" id="chat-send">送信</button>
      </form>
      <p id="ai-status" class="ai-status muted"></p>
    </section>
  `;

  const input = $('#chat-input');
  const form = $('#chat-form');
  $$('[data-quick]').forEach((b) => b.addEventListener('click', () => { input.value = b.dataset.quick; input.focus(); }));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await sendChat(text);
  });
  const chat = $('#chat');
  chat.scrollTop = chat.scrollHeight;
}

function renderMsg(m) {
  return `<div class="msg ${m.role}"><div class="bubble">${m.role === 'assistant' ? mdLite(m.content) : esc(m.content)}</div></div>`;
}
// 軽量Markdown（太字・改行・箇条書き）
function mdLite(t) {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/^- (.+)$/gm, '• $1')
    .replace(/\n/g, '<br>');
}

async function sendChat(text) {
  chatHistory.push({ role: 'user', content: text });
  renderAI(store.getState());
  const status = $('#ai-status');
  status.textContent = 'AIが回答を作成中…';
  $('#chat-send').disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: buildSystemPrompt(),
        messages: chatHistory.slice(-12),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`${res.status} ${detail}`);
    }
    const data = await res.json();
    chatHistory.push({ role: 'assistant', content: data.reply || '(空の応答)' });
    status.textContent = '';
  } catch (err) {
    chatHistory.push({
      role: 'assistant',
      content:
        '⚠️ AIに接続できませんでした。Cloudflare Pages の環境変数（APIキー）が未設定か、ローカルで関数が動いていない可能性があります。README の「AI設定」を確認してください。\n\n（詳細: ' + err.message + '）',
    });
    status.textContent = '';
  } finally {
    $('#chat-send') && ($('#chat-send').disabled = false);
    renderAI(store.getState());
  }
}

// AIに渡すコンテキスト（システムプロンプト）を状態から生成
function buildSystemPrompt() {
  const s = store.getState();
  const exam = getExam(s.profile.system, s.profile.grade);
  const strat = STRATEGIES.find((x) => x.id === s.profile.strategy);
  const lines = [];
  lines.push('あなたは日本の海技士国家試験の学習コーチです。簡潔で実用的な日本語で、具体的な行動に落として助言してください。');
  lines.push(`制度: 定期試験は年4回（2/4/7/10月）。筆記の一部科目合格は${RULES.subjectPassValidYears}年有効、全科目合格は${RULES.writtenFullPassValidYears}年有効。`);
  if (exam) {
    lines.push(`受験ターゲット: ${exam.title}／戦略: ${strat?.name}／口述試験: ${exam.hasOral ? 'あり' : 'なし'}。`);
    const written = exam.subjects.filter(subjectHasWritten).map((x) => x.short);
    const oral = exam.subjects.filter((x) => !subjectHasWritten(x)).map((x) => x.short);
    lines.push(`筆記対象科目: ${written.join('・') || 'なし'}。口述のみの科目: ${oral.join('・') || 'なし'}。`);
    // 進捗
    const prog = exam.subjects.map((sub) => {
      const p = store.subjectProgress(sub.id);
      const exp = store.subjectPassExpiry(sub.id);
      return `${sub.short}=${(SUBJECT_STATUS[p.status] || SUBJECT_STATUS.none).label}${exp ? `(有効期限${fmtDate(exp)})` : ''}`;
    });
    lines.push(`現在の科目進捗: ${prog.join(' / ')}。`);
    // 受験回
    const sits = s.sittings.map((sit) => {
      const sch = store.findSchedule(sit.scheduleId);
      const d = sit.type === 'oral' ? sch?.oralDate : sch?.writtenDate;
      return `${sit.label}[${sit.type === 'oral' ? '口述' : '筆記'}/${d || '日付未定'}]: ${sit.subjectIds.map((id) => subjShort(exam, id)).join('・') || '科目未設定'}`;
    });
    lines.push(`受験計画: ${sits.join(' | ') || 'なし'}。`);
    lines.push(`今日の日付: ${fmtDate(new Date())}。`);
  }
  lines.push('回答は箇条書き中心で、長すぎないように。制度の正確な日付は運輸局で確認するよう一言添える。');
  return lines.join('\n');
}

// =============================================================
// 設定
// =============================================================
function renderSettings(s) {
  appEl().innerHTML = `
    <section class="card">
      <div class="card-h">データの保存場所</div>
      <p class="muted">データはこのブラウザ（localStorage）に保存されます。サーバーには送信されません（AI相談を除く）。端末をまたいで使う場合はエクスポート/インポートで移行できます。</p>
    </section>
    <section class="card">
      <div class="card-h">バックアップ</div>
      <div class="btn-row">
        <button id="btn-export" class="btn">JSONをエクスポート</button>
        <label class="btn">JSONをインポート<input type="file" id="file-import" accept="application/json" hidden></label>
        <button id="btn-reset" class="btn danger">初期化</button>
      </div>
      <textarea id="export-area" class="export-area" readonly placeholder="エクスポート結果がここに表示されます"></textarea>
    </section>
    <section class="card">
      <div class="card-h">benkyo連携（ロードマップ）</div>
      <div class="form-row">
        <label>ロードマップ取得元
          <select id="set-rmsrc">
            <option value="cloud" ${s.settings.roadmapSource === 'cloud' ? 'selected' : ''}>Cloudflare（端末非依存・要 npm run sync）</option>
            <option value="bridge" ${s.settings.roadmapSource === 'bridge' ? 'selected' : ''}>ローカルブリッジ（Macで起動）</option>
          </select>
        </label>
        <label>benkyoプロジェクトID
          <input type="text" id="set-project" value="${esc(s.settings.benkyoProject)}" placeholder="prj21">
        </label>
        <label>ブリッジURL（bridge時のみ）
          <input type="text" id="set-bridge" value="${esc(s.settings.bridgeUrl)}" placeholder="http://localhost:8970">
        </label>
      </div>
      <p class="hint"><b>Cloudflare</b>: Macで <code>npm run sync</code> するとグラフがKVに保存され、どの端末からでも閲覧できます（推奨）。<b>ローカルブリッジ</b>: 見る端末で <code>npm run bridge</code> 起動が必要。本格的な概念グラフは benkyo のスキル（benkyo-project-init / tutoring）で拡張できます。</p>
    </section>
    <section class="card">
      <div class="card-h">AI設定</div>
      <p class="muted">AIはCloudflare Pages Functions（<code>/api/chat</code>）経由で <b>codex-everywhere（Responses API・gpt-5.5）</b> を呼び出します。APIキーはデプロイ先のシークレットに設定してください（README参照）。</p>
      <ul class="facts">
        <li><code>AI_PROVIDER</code> = <code>openai-responses</code>（codex-everywhere）／<code>openai</code>／<code>anthropic</code></li>
        <li><code>OPENAI_BASE_URL</code> = <code>https://codex-everywhere.com</code>、<code>AI_MODEL</code> = <code>gpt-5.5</code></li>
        <li>シークレット: <code>OPENAI_API_KEY</code>（codex-everywhereで発行した鍵）</li>
      </ul>
    </section>
  `;

  $('#btn-export').addEventListener('click', () => { $('#export-area').value = store.exportJSON(); $('#export-area').select(); });
  $('#file-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { store.importJSON(reader.result); alert('インポートしました。'); render(); }
      catch (err) { alert('インポート失敗: ' + err.message); }
    };
    reader.readAsText(file);
  });
  $('#btn-reset').addEventListener('click', () => {
    if (confirm('すべてのデータを初期化します。よろしいですか？')) { store.resetAll(); render(); }
  });
  $('#set-rmsrc').addEventListener('change', (e) => store.update((st) => { st.settings.roadmapSource = e.target.value; }));
  $('#set-bridge').addEventListener('change', (e) => store.update((st) => { st.settings.bridgeUrl = e.target.value.trim(); }));
  $('#set-project').addEventListener('change', (e) => store.update((st) => { st.settings.benkyoProject = e.target.value.trim(); }));
}

// ---------- データ未収録カード ----------
function noDataCard(s) {
  return `
    <section class="card">
      <div class="card-h">科目データが未収録です</div>
      <p>現在の対象（${esc(SYSTEMS.find((x) => x.id === s.profile.system)?.name)}・${s.profile.grade}級）の細目データはまだ収録されていません。</p>
      <p class="muted">現在収録済み：${Object.values(EXAMS).map((e) => e.title).join('、')}</p>
      <button class="btn" id="goto-plan">受験プランで対象を変更</button>
    </section>`;
}
function bindNoData() {
  const b = $('#goto-plan');
  if (b) b.addEventListener('click', () => navigate('plan'));
}

// 状態変化で再描画（フォーム入力のフォーカス維持のため一部画面は手動再描画）
store.subscribe(() => {
  if (activeTab === 'dashboard' || activeTab === 'roadmap') render();
});

// ---------- サーバー同期（ログイン時のみ） ----------
store.subscribe(() => {
  if (syncMode === 'server' && !applyingRemote) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushData, 800);
  }
});
async function pushData() {
  try {
    await fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: JSON.parse(store.exportJSON()) }),
    });
  } catch { /* オフライン時はローカルのみ */ }
}
async function pullData() {
  try {
    const r = await fetch('/api/data');
    if (!r.ok) return;
    const { data } = await r.json();
    if (data) {
      applyingRemote = true;
      store.importJSON(JSON.stringify(data));
      applyingRemote = false;
    } else {
      await pushData(); // 初回ログイン: 現在のローカルデータをサーバーへ
    }
  } catch { /* noop */ }
}

// ---------- 認証ゲート ----------
function showGate(state) {
  auth.renderGate({
    state,
    onAuthed: async (user) => { currentUser = user; syncMode = 'server'; await pullData(); render(); },
    onLocal: () => { syncMode = 'local'; render(); },
  });
}

// ---------- 起動 ----------
async function boot() {
  document.body.innerHTML = '<div class="boot">読み込み中…</div>';
  const sess = await auth.checkSession();
  if (sess.state === 'authed') {
    currentUser = sess.user; syncMode = 'server';
    accessLogoutUrl = sess.logoutUrl || null;
    await pullData();
    render();
  } else {
    // guest（未ログイン）/ unavailable（関数未デプロイ）→ ゲート表示
    showGate(sess.state);
  }
}

boot();
