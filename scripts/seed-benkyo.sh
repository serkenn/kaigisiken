#!/usr/bin/env bash
# benkyo に「三級海技士(航海) 運用・法規(筆記)」の雛形プロジェクトを作る。
# 進捗は stderr、作成したプロジェクトIDだけを stdout に出す（setup.sh が受け取る）。
# 本格的な概念グラフは benkyo スキル(benkyo-project-init / tutoring)で拡張する前提。
set -euo pipefail
BENKYO="${BENKYO_BIN:-benkyo}"

say() { printf '%s\n' "$*" >&2; }
# benkyo の JSON 出力から最初の "id" を取り出す
jid() { grep -o '"id"[^,]*' | head -1 | sed -E 's/.*: *"([^"]+)".*/\1/'; }
addc() { "$BENKYO" concept add --name "$1" --content "$2" | jid; }
adde() { "$BENKYO" edge add --from "$1" --to "$2" --type prereq >/dev/null 2>&1 || true; }

say "▶ ゴール問題を作成"
P1=$("$BENKYO" problem add --name "三級航海 運用(筆記)" \
  --statement "三級海技士(航海) 筆記試験『運用に関する科目』に合格する" \
  --answer "合格基準点に到達する" | jid)
P2=$("$BENKYO" problem add --name "三級航海 法規(筆記)" \
  --statement "三級海技士(航海) 筆記試験『法規に関する科目』に合格する(筆記対象: 衝突予防法・海交法・港則法/船員法/海防法)" \
  --answer "合格基準点に到達する" | jid)

say "▶ 概念ノードを作成"
C_FUKU=$(addc "復原性・トリム" "重心・浮心・メタセンタ・GM・復原力・乾舷・動揺周期・喫水・満載喫水線・自由水の影響")
C_KOZO=$(addc "船体構造と各部名称" "船首尾材・舵・外板・甲板・フレーム・ビーム・キール・ビルジキール・ハッチ、船体要目")
C_SOUSEN=$(addc "操船の基本" "舵とプロペラの作用・速力・最短停止距離・旋回圏・外力の影響・相互作用・側壁影響")
C_UNYO=$(addc "一般運用(係留・びょう泊)" "入出港・係留離岸・びょう泊・いかり作業・タグ使用上の注意")
C_KISHO=$(addc "気象・海象(天気図)" "気象要素・高低気圧・前線・地上天気図の見方・暴風雨の回避")
C_TOUCHOKU=$(addc "航海当直" "甲板部における航海当直基準・航海日誌")
C_HIJOU=$(addc "非常措置" "海難の防止・衝突乗揚げ浸水火災時の措置・退船・人命救助")
C_KAMOTSU=$(addc "貨物の積付け" "貨物の積付け・保全・危険物管理・復原性への影響")
C_YOBO=$(addc "海上衝突予防法" "航法・灯火及び形象物・音響信号及び発光信号")
C_KAIKO=$(addc "海上交通安全法" "航路における航法・特定海域の規制")
C_KOSOKU=$(addc "港則法" "港内の航法・係留・危険物")
C_SENIN=$(addc "船員法" "船員法及び施行規則・船員労働安全衛生規則")
C_KAIBO=$(addc "海洋汚染防止法" "海洋汚染等及び海上災害の防止に関する法律")

say "▶ prereq エッジを作成"
for c in "$C_FUKU" "$C_KOZO" "$C_SOUSEN" "$C_UNYO" "$C_KISHO" "$C_TOUCHOKU" "$C_HIJOU" "$C_KAMOTSU"; do adde "$P1" "$c"; done
for c in "$C_YOBO" "$C_KAIKO" "$C_KOSOKU" "$C_SENIN" "$C_KAIBO"; do adde "$P2" "$c"; done
adde "$C_SOUSEN" "$C_FUKU"
adde "$C_KAMOTSU" "$C_FUKU"
adde "$C_UNYO" "$C_SOUSEN"
adde "$C_KAIKO" "$C_YOBO"
adde "$C_KOSOKU" "$C_YOBO"

say "▶ プロジェクトを作成"
PRJ=$("$BENKYO" project create --goals "$P1,$P2" \
  --metadata '{"title":"三級海技士(航海) 運用・法規(筆記)","exam":"navigation-3","note":"kaigisiken 雛形"}' | jid)

say "✅ プロジェクト ${PRJ} を作成しました (goals: ${P1},${P2})"
printf '%s\n' "$PRJ"
