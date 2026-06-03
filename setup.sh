#!/usr/bin/env bash
# =============================================================
# 海技試験ナビ 一発セットアップ（Debian）
#   - Docker / benkyo を自動導入
#   - benkyo DB を自動検出、雛形プロジェクトを自動作成（無ければ）
#   - .env を対話生成（Cloudflare の値だけ貼り付け）
#   - docker compose で起動
#
#   使い方:  ./setup.sh        （リポジトリ直下で実行）
# =============================================================
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

c_blue='\033[1;36m'; c_yel='\033[1;33m'; c_red='\033[1;31m'; c_grn='\033[1;32m'; c_off='\033[0m'
step() { printf "\n${c_blue}== %s ==${c_off}\n" "$*"; }
ok()   { printf "${c_grn}✓ %s${c_off}\n" "$*"; }
warn() { printf "${c_yel}! %s${c_off}\n" "$*"; }
die()  { printf "${c_red}✘ %s${c_off}\n" "$*" >&2; exit 1; }
ask()  { local p="$1" d="${2:-}" v; if [ -n "$d" ]; then read -rp "$p [$d]: " v; echo "${v:-$d}"; else read -rp "$p: " v; echo "$v"; fi; }

# ---- sudo ヘルパー ----
SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi

# ---- 1. Docker ----
step "Docker を確認"
if ! command -v docker >/dev/null 2>&1; then
  warn "Docker 未インストール → 公式スクリプトで導入します"
  curl -fsSL https://get.docker.com | $SUDO sh
  $SUDO usermod -aG docker "$USER" 2>/dev/null || true
  warn "docker グループ反映には再ログインが必要な場合があります（この実行は sudo で継続）"
fi
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if $SUDO docker info >/dev/null 2>&1; then DOCKER="$SUDO docker"; else die "docker を実行できません"; fi
fi
if ! $DOCKER compose version >/dev/null 2>&1; then
  warn "compose プラグイン導入"
  $SUDO apt-get update -y && $SUDO apt-get install -y docker-compose-plugin
fi
ok "Docker OK ($DOCKER compose)"

# ---- 2. benkyo ----
step "benkyo を確認"
if ! command -v benkyo >/dev/null 2>&1; then
  warn "benkyo 未インストール → pipx で導入します"
  if ! command -v pipx >/dev/null 2>&1; then $SUDO apt-get update -y && $SUDO apt-get install -y pipx; fi
  pipx ensurepath || true
  pipx install benkyo
  export PATH="$HOME/.local/bin:$PATH"
fi
command -v benkyo >/dev/null 2>&1 || die "benkyo が PATH にありません。新しいシェルを開いて再実行してください。"
ok "benkyo $(benkyo --version 2>/dev/null | head -1)"

# ---- 3. benkyo DB 検出 ----
step "benkyo DB を検出"
DBPATH="$(benkyo info | grep -o '"db_path"[^,]*' | head -1 | sed -E 's/.*: *"([^"]+)".*/\1/')"
[ -n "$DBPATH" ] || die "benkyo info から db_path を取得できませんでした"
BENKYO_DIR="$(dirname "$DBPATH")"
ok "DB: $DBPATH"
ok "BENKYO_DIR: $BENKYO_DIR"

# ---- 4. プロジェクト（無ければ雛形作成） ----
step "ロードマップ用 benkyo プロジェクト"
PROJECT="$(ask 'プロジェクトID（空Enterで三級航海の雛形を自動作成）' '')"
if [ -z "$PROJECT" ]; then
  PROJECT="$(bash scripts/seed-benkyo.sh)"
  ok "雛形プロジェクトを作成: $PROJECT"
else
  if benkyo project get "$PROJECT" >/dev/null 2>&1; then ok "既存プロジェクト: $PROJECT"; else warn "$PROJECT は見つかりませんでした（後で .env を直せます）"; fi
fi

# ---- 5. .env 生成 ----
step ".env を用意"
GEN=1
if [ -f .env ]; then
  a="$(ask '.env が既にあります。上書きしますか？ y/N' 'N')"
  case "$a" in y|Y|yes) GEN=1;; *) GEN=0; ok ".env を保持します";; esac
fi
if [ "$GEN" -eq 1 ]; then
  cat <<'EOS'

  --- Cloudflare の値を用意してください（詳細は SETUP.md）---
  1) Tunnel: Zero Trust → Networks → Tunnels → Create（Cloudflared）
       → トークン(eyJ...) をコピー / Public Hostname の Service は http://app:8080
  2) Access: Zero Trust → Access → Applications → Self-hosted
       → 対象ドメインを保護し、Application Audience(AUD) タグをコピー
       → チーム名ドメイン = xxxx.cloudflareaccess.com
EOS
  TUNNEL_TOKEN="$(ask 'TUNNEL_TOKEN' '')"
  ACCESS_TEAM_DOMAIN="$(ask 'ACCESS_TEAM_DOMAIN (例 yourteam.cloudflareaccess.com)' '')"
  ACCESS_AUD="$(ask 'ACCESS_AUD' '')"
  OPENAI_API_KEY="$(ask 'OPENAI_API_KEY (codex-everywhere)' '')"
  {
    echo "TUNNEL_TOKEN=${TUNNEL_TOKEN}"
    echo "ACCESS_TEAM_DOMAIN=${ACCESS_TEAM_DOMAIN}"
    echo "ACCESS_AUD=${ACCESS_AUD}"
    echo "AI_PROVIDER=openai-responses"
    echo "OPENAI_BASE_URL=https://codex-everywhere.com"
    echo "AI_MODEL=gpt-5.5"
    echo "OPENAI_API_KEY=${OPENAI_API_KEY}"
    echo "BENKYO_DIR=${BENKYO_DIR}"
    echo "BENKYO_PROJECT=${PROJECT}"
  } > .env
  ok ".env を生成しました"
fi

# ---- 6. 起動 ----
step "コンテナをビルド・起動"
$DOCKER compose up -d --build

# ---- 7. 状態 ----
step "状態確認"
sleep 2 || true
$DOCKER compose ps || true
printf "\n${c_grn}セットアップ完了。${c_off}\n"
echo "  ・ログ:   $DOCKER compose logs -f"
echo "  ・公開URL: Cloudflare の Public Hostname（例 https://kaigi.example.com）を開く"
echo "  ・ロードマップは benkyo の実DBをマウントしてライブ表示（チュータリングはこのホストで）"
