// =============================================================
// 状態管理 + localStorage 永続化
// バックエンド同期に拡張しやすいよう、保存/読込を1か所に集約。
// =============================================================
import { defaultSchedule, getExam } from './data.js';

const STORAGE_KEY = 'kaigisiken.v1';

function thisYear() {
  return new Date().getFullYear();
}

// 初期状態。プロフィールの初期値は本人の対象（三級航海・7月定期で運用と法規）に合わせている。
function defaultState() {
  const year = thisYear();
  return {
    profile: {
      system: 'navigation',
      grade: 3,
      strategy: 'subject-pass',
    },
    // 受験回（sitting）: どの定期試験でどの科目を受けるか
    sittings: [
      {
        id: crypto.randomUUID(),
        label: `${year}年 7月定期`,
        scheduleId: `${year}-07`,
        type: 'written', // 'written' | 'oral'
        subjectIds: ['unyou', 'houki'],
      },
    ],
    // 科目ごとの進捗  キー: subjectId
    subjects: {
      // 例: unyou: { status:'planned', examDate:'', passedDate:'', note:'' }
    },
    // 細目チェックリスト  キー: `${subjectId}:${categoryId}:${topicIndex}`
    checklist: {},
    // 学習計画タスク（カレンダー/ガント用）
    //   { id, title, subjectId, start:'YYYY-MM-DD', end:'YYYY-MM-DD', done:false }
    studyPlan: [],
    // 試験日程（年ごと）
    schedules: { [year]: defaultSchedule(year) },
    settings: {
      aiEnabled: true,
      aiTone: 'concise', // 'concise' | 'detailed'
      // ロードマップ取得元: 'cloud'=Cloudflare KV（端末非依存・要 npm run sync）/ 'bridge'=ローカルbenkyoブリッジ
      roadmapSource: 'cloud',
      // benkyo ブリッジ連携（ローカルAPI。roadmapSource='bridge' のとき使用）
      bridgeUrl: 'http://localhost:8970',
      benkyoProject: 'prj21',
    },
    meta: { version: 1, updatedAt: Date.now() },
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (e) {
    console.warn('状態の読込に失敗。初期状態を使用します。', e);
    return defaultState();
  }
}

function migrate(s) {
  // 将来のスキーマ変更に備えた最小マイグレーション
  const base = defaultState();
  return {
    ...base,
    ...s,
    profile: { ...base.profile, ...(s.profile || {}) },
    settings: { ...base.settings, ...(s.settings || {}) },
    schedules: { ...base.schedules, ...(s.schedules || {}) },
    subjects: s.subjects || {},
    checklist: s.checklist || {},
    studyPlan: Array.isArray(s.studyPlan) ? s.studyPlan : [],
    sittings: s.sittings || base.sittings,
  };
}

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  state.meta.updatedAt = Date.now();
  for (const fn of listeners) fn(state);
}

export function getState() {
  return state;
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('保存に失敗しました。', e);
  }
}

// 状態を更新して保存・通知する汎用ヘルパー
export function update(mutator) {
  mutator(state);
  save();
  notify();
}

// ---- 便利アクセサ ----
export function currentExam() {
  return getExam(state.profile.system, state.profile.grade);
}

export function currentSchedule(year = thisYear()) {
  if (!state.schedules[year]) {
    update((s) => {
      s.schedules[year] = defaultSchedule(year);
    });
  }
  return state.schedules[year];
}

export function findSchedule(scheduleId) {
  for (const year of Object.keys(state.schedules)) {
    const found = state.schedules[year].find((x) => x.id === scheduleId);
    if (found) return found;
  }
  return null;
}

// 科目進捗の取得（未登録ならデフォルト）
export function subjectProgress(subjectId) {
  return (
    state.subjects[subjectId] || {
      status: 'none', // none | planned | studying | passed | failed
      examDate: '',
      passedDate: '',
      note: '',
    }
  );
}

// 科目合格の有効期限（passedDate から3年）。passedDate が無ければ null。
export function subjectPassExpiry(subjectId) {
  const p = subjectProgress(subjectId);
  if (p.status !== 'passed' || !p.passedDate) return null;
  const d = new Date(p.passedDate);
  d.setFullYear(d.getFullYear() + 3);
  return d;
}

// エクスポート / インポート
export function exportJSON() {
  return JSON.stringify(state, null, 2);
}
export function importJSON(text) {
  const parsed = JSON.parse(text);
  state = migrate(parsed);
  save();
  notify();
}
export function resetAll() {
  state = defaultState();
  save();
  notify();
}
