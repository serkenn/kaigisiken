# ⚓ 海技試験ナビ

海技士国家試験の **履修ロードマップ**（benkyo連携）と **受験スケジュール／科目合格管理** を、Webで一元管理するツール。

- **対象の初期設定**: 三級海技士（航海）・「運用」「法規」を7月定期試験で受験（科目合格狙い）
- **データ構造は汎用**: 級・系統（航海/機関）・戦略（科目合格/一気）を切り替え可能。科目データは後から追加できる
- **認証**: パスキー（WebAuthn）。初回にパスキー作成 → 再アクセスで自動判定 → 別端末は「サインイン」から
- **同期**: ログイン中はデータを Cloudflare KV に保存し、端末をまたいで共有

---

## アーキテクチャ

```
ブラウザ (public/ の静的SPA, ビルド不要)
   │
   ├── /api/*  ──────────►  Cloudflare Pages Functions (functions/)
   │                          ├ パスキー認証（@simplewebauthn/server）
   │                          ├ 個人データ同期（KV: KAIGI_KV）
   │                          └ AI相談プロキシ（OpenAI / Anthropic）
   │
   └── benkyoブリッジ ─────►  ローカルNodeサーバー (bridge/server.mjs)
        (http://localhost:8970)   └ benkyo CLI を実行（履修ロードマップ＝概念依存グラフ）
```

| 役割 | 担当 |
|---|---|
| 履修ロードマップ（概念グラフ・理解度・チュータリング） | **benkyo**（ローカルCLI）＋ブリッジ |
| 受験プラン・定期試験日程・科目合格の有効期限管理 | **Webアプリ**（このリポジトリ） |
| 科目・細目チェックリスト（筆記/口述の区分） | Webアプリ（PDF告示から収録） |
| 認証・端末間同期・AI相談 | Cloudflare Pages Functions |

> benkyo はローカルのPython CLIのため、サーバーレスな Cloudflare からは直接実行できません。
> ローカルのブリッジサーバー経由で連携します。

---

## セットアップ

### 0. 前提
- Node.js 18+
- benkyo CLI（ロードマップ用）: `uv tool install benkyo` もしくは `pipx install benkyo`
- Cloudflare アカウント（デプロイ時）

### 1. 依存インストール
```bash
npm install
```

### 2. KV ネームスペース作成（認証・同期に必須）
```bash
npx wrangler kv namespace create KAIGI_KV
```
出力された `id` を `wrangler.toml` の `KAIGI_KV` の `id` に貼り付ける。

### 3. シークレット設定
ローカル開発: `.dev.vars.example` を `.dev.vars` にコピーして編集。
本番（デプロイ後）:
```bash
npx wrangler pages secret put SESSION_SECRET
npx wrangler pages secret put OPENAI_API_KEY      # ← codex-everywhere で発行したAPIキー
```

AIプロバイダは `wrangler.toml` の `[vars]` で設定済み（**codex-everywhere / Responses API / gpt-5.5**）:
`AI_PROVIDER="openai-responses"`, `OPENAI_BASE_URL="https://codex-everywhere.com"`, `AI_MODEL="gpt-5.5"`。
別プロバイダに変えるなら `AI_PROVIDER` を `openai`（Chat Completions）や `anthropic` に切替える。

### 4. ローカル起動（2プロセス）
```bash
# ① Webアプリ（Functions込み）  → http://localhost:8788
npm run dev

# ② benkyoブリッジ（別ターミナル） → http://localhost:8970
npm run bridge
```
ブラウザで http://localhost:8788 を開く。`localhost` は安全なコンテキスト扱いなのでパスキーが使えます。

### 5. デプロイ

**A. CLI 直接アップロード**
```bash
npm install     # ローカルで node_modules を用意（Functionsの依存）
npm run deploy
```

**B. ダッシュボードでGit連携（自動デプロイ）** — Workers & Pages → Create → Pages → Connect to Git で `serkenn/kaigisiken` を選び:

| 項目 | 値 |
|---|---|
| Framework preset | None |
| **Build command** | **`npm install`** |
| Build output directory | `public` |
| Root directory | `/` |

> ⚠️ **Build command は必須**。`functions/` が `@simplewebauthn/server`（npm）を import するため、ビルド時に依存を
> インストールしないと `Could not resolve "@simplewebauthn/server"` でビルドが失敗します
> （Build command を空にすると Pages は install をスキップする）。KVバインド・`nodejs_compat`・compatibility_date は
> `wrangler.toml` から読まれるので、ダッシュボードではシークレット（`SESSION_SECRET` ほか）だけ設定する。

独自ドメイン or `*.pages.dev` で公開されます（パスキーのRP IDは公開ホスト名から自動導出）。
ブリッジはローカルで動かし、アプリ設定の「ブリッジURL」を指す運用です（公開する場合は要・別途保護）。

---

## 使い方

1. 初回アクセス → 表示名を入れて **「パスキーを作成して開始」**
2. **受験プラン** タブ: 系統・級・戦略を設定し、受験回（どの定期試験で何の科目を筆記/口述で受けるか）を作成。定期試験の日付を入力（年4回: 2/4/7/10月）
3. **科目・細目** タブ: 細目チェックリストで進捗管理。合格した科目は「合格」に変更し合格日を入力 → 有効期限（3年）を自動表示
4. **ロードマップ** タブ: benkyoの概念依存グラフ＋受験スケジュールのタイムライン
5. **AI相談** タブ: 受験ターゲット・進捗を踏まえた学習プラン相談
6. 別端末で使うとき → トップの **「サインイン」** からパスキーでログイン（データは同期）

### 履修ロードマップを端末非依存で見る（推奨・既定）
benkyo はMacのローカルが「真実の源」。グラフのスナップショットだけを Cloudflare KV に同期すれば、
**どの端末からでもブリッジ起動なしで**ロードマップを閲覧できます。

1. デプロイ先に同期用トークンを設定: `npx wrangler pages secret put SYNC_TOKEN`（任意の長い文字列）
2. グラフを更新したら、Macで同期を実行:
   ```bash
   KAIGI_URL=https://kaigisiken.pages.dev \
   SYNC_TOKEN=<上で設定したのと同じ値> \
   BENKYO_PROJECT=prj21 \
   npm run sync
   ```
3. アプリの **設定 → ロードマップ取得元 = Cloudflare**（既定）で、最新グラフが全端末に反映される。

> 「見る端末でローカルbenkyoを直接使いたい」場合は、設定で取得元を **ローカルブリッジ** にして、その端末で `npm run bridge` を起動する。

### 履修ロードマップ（benkyo）を本格的に作る
雛形プロジェクト `prj21`（三級航海 運用・法規）を同梱の手順で作成済みです。
概念グラフを深く育てるには、Claude Code で benkyo スキルを使ってください:
> 「三級海技士（航海）の運用と法規を7月に受けます。PDFの細目から学習を進めたい」
→ `benkyo-project-init` / `benkyo-tutoring` がグラフ拡張・理解度設定・チュータリングを担当します。

ブリッジAPI:
- `GET /health`
- `GET /projects`
- `GET /render?project=prj21&format=mermaid|dot&scope=window|project|graph`
- `GET /export?project=prj21`
- `GET /frontier?project=prj21`
- `GET /breakdown?project=prj21&node=c134`

---

## 制度メモ（要・運輸局で最終確認）

- 定期試験は **年4回（2月・4月・7月・10月）**
- 筆記の **一部科目合格は3年間有効**（その科目を免除）。全科目合格は **15年間有効**（同種試験の筆記免除）
- **三級海技士（航海）の注意**: 「法規」で**筆記対象**は〈海上衝突予防法・海上交通安全法・港則法／船員法／海洋汚染防止法〉のみ。それ以外（船職法・海難審判法・トン数法・船舶安全法・検疫法・水先法・関税法・海商法・国際公法）と「英語」は **口述試験のみ** の対象（告示の※印）
- 出典: 国土交通省告示「海技士国家試験の試験科目及び細目」国海技第207号（H26.2.24 / 一部改正 H27.1.30）
- 出願期間・正確な試験日・身体検査基準・乗船履歴要件は所轄の地方運輸局で必ず確認すること

---

## ディレクトリ
```
public/                 静的SPA（ビルド不要）
  index.html
  assets/css/styles.css
  assets/js/data.js      試験科目・細目・制度ルール（PDF告示から）
  assets/js/store.js     状態管理 + localStorage
  assets/js/auth.js      パスキー（フロント）
  assets/js/app.js       UI本体（6タブ）
functions/api/          Cloudflare Pages Functions
  auth/                  パスキー登録・サインイン
  me.js logout.js data.js chat.js
lib/auth.js              Functions共通（KV/Cookie/セッション/RP設定）
bridge/server.mjs        benkyoブリッジ（ローカルAPI）
wrangler.toml            Pages設定（KV/互換フラグ）
```
