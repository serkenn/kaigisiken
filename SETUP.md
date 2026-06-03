# セットアップ手順（Debian / Docker + cloudflared + Cloudflare Access）

Debian サーバーでコンテナを常時起動し、Cloudflare Tunnel で公開、前段を Cloudflare Access で認証する構成のセットアップ手順です。順番にやれば完成します。

所要時間の目安: 20〜30分（Cloudflare側の設定込み）。

---

## 0. 前提の確認（Debian）

### Docker Engine + Compose プラグイン
```bash
# 公式の簡易インストール（Debian/Ubuntu）
curl -fsSL https://get.docker.com | sudo sh
sudo apt-get install -y docker-compose-plugin

# 自分を docker グループに（sudo無しで docker を使う／再ログインで反映）
sudo usermod -aG docker "$USER"

docker version && docker compose version    # 動作確認
```

### このリポジトリと benkyo
```bash
git clone https://github.com/serkenn/kaigisiken.git
cd kaigisiken

# benkyo（ロードマップ用CLI）。Debian なら pipx か uv で:
sudo apt-get install -y pipx && pipx ensurepath && pipx install benkyo
#   または: curl -LsSf https://astral.sh/uv/install.sh | sh && uv tool install benkyo

benkyo --version
```

- Cloudflare に**独自ドメイン（ゾーン）**があること（例 `example.com`）
- codex-everywhere の **APIキー**

### benkyo の DB（重要）
ロードマップは benkyo の DB を読みます。**この Debian ホスト上に DB と対象プロジェクトが必要**です。

```bash
benkyo info | grep db_path        # Debian の既定: /home/<user>/.local/share/benkyo/db.sqlite
benkyo project list | grep prj21  # 対象プロジェクトがあるか
```

- まだ何も無い場合は、このホストで benkyo を使って学習プロジェクトを作る（Claude Code / Codex の benkyo スキル）。
- **学習を別マシン（例: Mac）で行っている場合**は、その DB をこのホストへコピーする:
  ```bash
  # 例（Mac側のパス → Debian側の既定パス）
  scp "/Users/serken/Library/Application Support/benkyo/db.sqlite" \
      user@debian:~/.local/share/benkyo/db.sqlite
  ```
  以後も最新にしたいときは同じ scp を都度実行（or rsync）。

> ロードマップに出す benkyo プロジェクトは既定 `prj21`。変更は `.env` の `BENKYO_PROJECT`。

---

## 1. Cloudflare Tunnel を作る（→ TUNNEL_TOKEN）

1. https://one.dash.cloudflare.com/ （Zero Trust）→ **Networks → Tunnels → Create a tunnel**
2. **Cloudflared** を選択 → 名前（例 `kaigisiken`）→ Save
3. 表示される **トークン**（`eyJ...` の長い文字列）をコピー → あとで `.env` の `TUNNEL_TOKEN` に貼る
   - 「Install and run a connector」のコマンド内 `--token eyJ...` の値がトークンです
4. 同じ画面の **Public Hostnames → Add a public hostname**:
   | 項目 | 値 |
   |---|---|
   | Subdomain | `kaigi`（好きな名前） |
   | Domain | あなたのドメイン（例 `example.com`） |
   | Type | `HTTP` |
   | URL | **`app:8080`** |
   - これで `https://kaigi.example.com` → コンテナ（composeのサービス名 `app` のポート8080）に届きます。

> ※ cloudflared は docker-compose 内のネットワークで `app` に到達するため、URL は `localhost` ではなく **`app:8080`** にします。

---

## 2. Cloudflare Access で保護する（→ ACCESS_TEAM_DOMAIN / ACCESS_AUD）

1. Zero Trust → **Access → Applications → Add an application → Self-hosted**
2. **Application domain** = `kaigi.example.com`（手順1と同じホスト名）
3. **Policies** … 例として「Emails」に自分のメールアドレスを許可するポリシーを1つ作る
4. 作成後、そのアプリの **Overview** にある **Application Audience (AUD) Tag**（長い16進文字列）をコピー → `.env` の `ACCESS_AUD`
5. **チーム名ドメイン** を確認: Zero Trust → **Settings → Custom Pages**（または Team domain）に表示される
   `yourteam.cloudflareaccess.com` → `.env` の `ACCESS_TEAM_DOMAIN`

---

## 3. .env を用意する

```bash
cd ~/Desktop/kaigisiken      # クローンした場所
cp .env.example .env
```

`.env` を編集して埋める:

```ini
# 手順1
TUNNEL_TOKEN=eyJ...（コピーしたトークン）

# 手順2
ACCESS_TEAM_DOMAIN=yourteam.cloudflareaccess.com
ACCESS_AUD=（AUDタグ）

# codex-everywhere のAPIキー
OPENAI_API_KEY=（あなたの鍵）

# benkyo のデータディレクトリ（Debian の既定。<user> は自分のユーザー名に）
BENKYO_DIR=/home/<user>/.local/share/benkyo
BENKYO_PROJECT=prj21
```

`BENKYO_DIR` が正しいか確認（`db_path` の**親ディレクトリ**を指定する）:
```bash
benkyo info | grep db_path     # 例: /home/you/.local/share/benkyo/db.sqlite → BENKYO_DIR=/home/you/.local/share/benkyo
```

> `.env` は秘密情報を含むので**コミットしない**（`.gitignore` 済み）。

---

## 4. 起動する

```bash
npm run docker:up      # docker compose up -d --build（初回はイメージビルドで数分）
npm run docker:logs    # ログを確認（Ctrl+Cで抜ける）
```

ログに以下が出ていればOK:
- `app`: `kaigisiken server listening on :8080`
- `cloudflared`: `Registered tunnel connection` が数本

ブラウザで **`https://kaigi.example.com`** を開く:
1. Cloudflare Access のログイン画面 → 許可したメールでログイン
2. アプリが表示される（右上に自分のメールが出る）
3. **ロードマップ**タブ → benkyo のグラフがライブ表示（同期不要）

---

## 5. 動作確認チェックリスト

- [ ] `https://kaigi.example.com` を開くと **Accessのログイン**が出る（＝保護されている）
- [ ] ログイン後アプリが表示され、右上に**自分のメール**が出る
- [ ] **受験プラン**で級・科目・日程を編集 → リロードしても保持される（＝データ保存OK）
- [ ] **ロードマップ**にbenkyoのグラフ（c134…復原性 等）が出る
- [ ] **AI相談**で1問質問 → gpt-5.5 が返答する

---

## 運用メモ

| やりたいこと | コマンド |
|---|---|
| 起動 | `npm run docker:up` |
| 停止 | `npm run docker:down` |
| ログ | `npm run docker:logs` |
| コード更新を反映 | `git pull && npm run docker:up`（再ビルド） |
| ローカルで認証なし確認 | `DEV_BYPASS_AUTH=1 npm run dev` → http://localhost:8080 |

- **ロードマップを育てる**: 学習は今まで通り Mac の Claude Code＋benkyo スキル（`benkyo-project-init` / `benkyo-tutoring`）で行えばOK。書き込みは実DBに入り、コンテナは同じDBをマウントしているので**自動で最新**。
- 個人データ（受験プラン・進捗）は `./.appdata/<メール>.json` に保存されます（バックアップ対象）。

---

## トラブルシューティング

**`https://kaigi.example.com` が開けない / 502**
- `npm run docker:logs` で `cloudflared` が `Registered tunnel connection` を出しているか
- Tunnel の Public Hostname の URL が **`app:8080`** になっているか（`localhost:8080` は不可）

**ログインは出るがアプリが「unauthorized」**
- `.env` の `ACCESS_AUD` と `ACCESS_TEAM_DOMAIN` が正しいか（AUDはアプリのOverview、team domainは `xxx.cloudflareaccess.com`）
- `npm run docker:up` で `.env` を読み直したか（変更後は再起動）

**ロードマップが「benkyo failed」**
- `BENKYO_DIR` が実DBの親ディレクトリを指しているか（`benkyo info` で確認）
- `BENKYO_PROJECT` のIDが存在するか（`benkyo project list`）

**AI相談が 401/INVALID_API_KEY**
- `OPENAI_API_KEY` が codex-everywhere の有効な鍵か

**benkyo のDBロック警告**
- 学習中（書き込み中）に閲覧が重なると稀に出ることがあります。リロードで解消します。
