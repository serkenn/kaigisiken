// =============================================================
// 海技試験 管理ツール — 参照データ
// 出典: 国土交通省告示「海技士国家試験の試験科目及び細目」
//       国海技第207号（平成26年2月24日 / 一部改正 平成27年1月30日）
// 制度: 海技士国家試験は年4回の定期試験（2月・4月・7月・10月）。
//       筆記試験の一部科目合格は3年間有効（科目免除）。
//       筆記試験 全科目合格は15年間有効（同種試験の筆記免除）。
//       ※ 各データの exam フラグ:
//          'written' = 筆記試験の対象 / 'oral' = 口述試験のみの対象（告示の※印）
//          'mixed'   = カテゴリ内に筆記・口述が混在（topics 個別の exam を参照）
// 注意: 出願期間・正確な試験日は所轄の地方運輸局で必ず確認すること。
// =============================================================

export const RULES = {
  // 一部科目合格（筆記）の有効期間
  subjectPassValidYears: 3,
  // 筆記 全科目合格の有効期間（再受験時の筆記免除）
  writtenFullPassValidYears: 15,
  // 定期試験の月
  examMonths: [2, 4, 7, 10],
  source: '国土交通省告示 国海技第207号（H26.2.24 / 一部改正 H27.1.30）',
  officialNote:
    '出願期間・正確な試験日・身体検査基準・乗船履歴要件は所轄の地方運輸局で必ず確認してください。',
  links: [
    { label: '海技士国家試験日程（関東運輸局 例）', url: 'https://wwwtb.mlit.go.jp/kanto/kaiji_sinkou/senin/exnittei/index.html' },
  ],
};

export const SYSTEMS = [
  { id: 'navigation', name: '航海', desc: '甲板部（航海士）' },
  { id: 'engine', name: '機関', desc: '機関部（機関士）' },
];

export const GRADES = [1, 2, 3, 4, 5, 6];

// 受験戦略
export const STRATEGIES = [
  { id: 'all-at-once', name: '一気に全科目', desc: '1回の定期試験で全筆記科目を受験' },
  { id: 'subject-pass', name: '科目合格を狙う', desc: '複数回に分けて科目ごとに合格を積み上げ（合格科目は3年間免除）' },
];

// =============================================================
// 科目構成データ
//   現状は「三級海技士（航海）」を細目まで収録。
//   他の級・系統は後から exams[キー] を追加して汎用化できる構造。
//   キー形式:  `${system}-${grade}`  例: 'navigation-3'
// =============================================================

export const EXAMS = {
  'navigation-3': {
    system: 'navigation',
    grade: 3,
    title: '三級海技士（航海）',
    hasOral: true, // 口述試験あり
    requiresPhysical: true, // 身体検査あり
    subjects: [
      {
        id: 'koukai',
        name: '航海に関する科目',
        short: '航海',
        exam: 'mixed',
        categories: [
          { id: 'keiki', name: '航海計器', exam: 'written',
            topics: [
              { text: '磁気コンパス（自差の原因・測定・原理・取扱い）', exam: 'written' },
              { text: 'ジャイロコンパス（原理・誤差・取扱い）', exam: 'written' },
              { text: '航海計器の原理・取扱い（操舵制御装置・コースレコーダ・方位鏡・音響測深機・ログ・六分儀・衛星航法装置・レーダー・ARPA・AIS）', exam: 'written' },
              { text: '意思決定支援のための航海計器及びシステム情報の使用', exam: 'written' },
            ] },
          { id: 'hyoshiki', name: '航路標識', exam: 'written',
            topics: [
              { text: '灯光・形象・彩色によるもの／音響によるもの／その他／電波によるもの', exam: 'written' },
            ] },
          { id: 'suiro', name: '水路図誌', exam: 'oral',
            topics: [
              { text: '海図（種類・図式・取扱い・小改補）', exam: 'oral' },
              { text: '水路書誌等の利用（水路誌・灯台表・水路図誌目録・水路通報・無線航行警報・航路情報）', exam: 'oral' },
            ] },
          { id: 'choseki', name: '潮汐及び海流', exam: 'written',
            topics: [
              { text: '潮汐に関する用語／潮汐表の使用法', exam: 'written' },
              { text: '世界の主要海流の名称・流向・流速', exam: 'written' },
            ] },
          { id: 'chibun', name: '地文航法', exam: 'written',
            topics: [
              { text: '距等圏航法・中分緯度航法・漸長緯度航法・流潮航法・大圏航法', exam: 'written' },
              { text: '地上物標による船位の測定（クロス方位法・船首倍角法・方位距離法）', exam: 'written' },
              { text: '海図による船位・針路・航程の求め方／避険線の選定及び利用', exam: 'written' },
            ] },
          { id: 'tenmon', name: '天文航法', exam: 'written',
            topics: [
              { text: '天文航法の用語／時の基準・船内時計の改正', exam: 'written' },
              { text: '天体による船位の測定', exam: 'written' },
            ] },
          { id: 'denpa', name: '電波航法', exam: 'written',
            topics: [
              { text: '電波航法装置（レーダー・衛星航法装置）による船位の測定／船位の誤差', exam: 'written' },
            ] },
          { id: 'keikaku', name: '航海計画', exam: 'written',
            topics: [
              { text: '航路の選定及び図示（一般通則に基づく航路選定を含む）', exam: 'written' },
              { text: '各種水域における航海計画（狭水道・狭視界・潮汐・分離通航・氷海・VTS・礁海）', exam: 'written' },
            ] },
        ],
      },
      {
        id: 'unyou',
        name: '運用に関する科目',
        short: '運用',
        exam: 'mixed',
        categories: [
          { id: 'kouzou', name: '船舶の構造、設備、復原性及び損傷制御', exam: 'mixed',
            topics: [
              { text: '主要な構造部材の知識・各部の名称（船首尾材・舵・外板・甲板・フレーム・ビーム・キール・ビルジキール・ハッチ）', exam: 'written' },
              { text: '船体要目（主要寸法・トン数）', exam: 'written' },
              { text: '主要設備の取扱い及び保存手入れ（操舵装置・揚びょう装置・船内通信装置）', exam: 'oral' },
              { text: '主要属具の取扱い及び保存手入れ（いかり・びょう鎖・チェーンストッパ）', exam: 'oral' },
              { text: '入出渠・入渠中の作業及び注意、船体の点検・手入れ・塗料の一般知識', exam: 'written' },
              { text: '復原性及びトリムの理論及び要素（重心・浮心・メタセンタ・GM・復原力・乾舷・動揺周期・喫水・満載喫水線・自由水）', exam: 'written' },
              { text: 'トリム及び復原性を安全に保つための措置', exam: 'written' },
              { text: '区画浸水による影響及び対応措置', exam: 'written' },
              { text: '復原性・トリム及び応力に関する図表', exam: 'written' },
              { text: '応力計算機の使用法', exam: 'oral' },
              { text: '船舶の復原性に関するIMOの勧告についての基礎知識', exam: 'oral' },
            ] },
          { id: 'touchoku', name: '当直', exam: 'written',
            topics: [
              { text: '甲板部における航海当直基準に関する事項／航海日誌を含む当直業務', exam: 'written' },
            ] },
          { id: 'kisho', name: '気象及び海象', exam: 'mixed',
            topics: [
              { text: '気象要素（気温・気圧・風・湿度・露点・雲・降水・視程）', exam: 'written' },
              { text: '各種天気系の特徴（高低気圧・前線・気圧の谷・気団・霧・突風・季節風・海陸風・天気図型）', exam: 'written' },
              { text: '地上天気図の見方及び局地的な天気の予測', exam: 'written' },
              { text: '高層天気図の見方', exam: 'oral' },
              { text: '暴風雨の中心及び危険区域の回避', exam: 'written' },
              { text: '気象海象観測並びに通報手順・記録方式', exam: 'written' },
            ] },
          { id: 'sousen', name: '操船', exam: 'mixed',
            topics: [
              { text: '操船の基本（舵・プロペラの作用、操舵心得、速力、最短停止距離、旋回圏、外力の影響、相互作用、側壁影響、減速航行、推進機関の特徴）', exam: 'written' },
              { text: '一般運用（入出港・係留離岸・びょう泊・いかり作業・タグ使用上の注意）', exam: 'written' },
              { text: '特殊運用（水先船接近・浅水域・狭水道・狭視界荒天・救命艇降下・収容・曳航・分離通航）', exam: 'written' },
            ] },
          { id: 'shutsuryoku', name: '船舶の出力装置', exam: 'mixed',
            topics: [
              { text: 'ディーゼル機関の作動原理の概要', exam: 'written' },
              { text: '主機遠隔制御装置の取扱い', exam: 'oral' },
              { text: '船舶の補機に関する基礎知識（発電機・ポンプ）', exam: 'oral' },
              { text: '機関に関する用語の一般知識（暖機・ターニング装置・試運転・出力(kW,PS)）', exam: 'oral' },
            ] },
          { id: 'kamotsu', name: '貨物の取扱い及び積付け', exam: 'mixed',
            topics: [
              { text: '貨物・漁獲物・漁具・燃料の積付け及び保全（重量物・危険物・固体ばら積み貨物の基礎を含む）', exam: 'written' },
              { text: '荷役装置及び属具の取扱い及び保存手入れ（荷役装置・ロープ・ブロック・テークル）', exam: 'oral' },
              { text: 'ロープの強度及びテークルの倍力', exam: 'written' },
              { text: '危険物の運送中の管理（基礎的なものに限る）', exam: 'written' },
              { text: 'タンカーの安全に関する基礎知識', exam: 'written' },
              { text: '船内消毒', exam: 'written' },
            ] },
          { id: 'hijou', name: '非常措置', exam: 'written',
            topics: [
              { text: '海難の防止（衝突・乗揚げ・転覆・沈没・火災・浸水等の原因と注意）', exam: 'written' },
              { text: '衝突・乗揚げ・任意乗揚げ事前措置の基礎', exam: 'written' },
              { text: '救助船・自力による引卸し／浸水の措置／防水設備・防水部署', exam: 'written' },
              { text: '旅客・乗組員の保護／火災時の損傷抑制・救助／船体放棄', exam: 'written' },
              { text: '遭難船からの人命救助／海中転落者の救助／舵・操舵装置故障時の措置', exam: 'written' },
              { text: '海洋環境の汚染の防止及び汚染防止手順', exam: 'written' },
            ] },
          { id: 'iryo', name: '医療', exam: 'oral',
            topics: [
              { text: '災害防止／救急措置（小型船医療便覧・無線医療助言の利用を含む）', exam: 'oral' },
            ] },
          { id: 'sosaku', name: '捜索及び救助', exam: 'oral',
            topics: [
              { text: 'IAMSARの利用に関する基礎知識', exam: 'oral' },
            ] },
          { id: 'tsuho', name: '船位通報制度', exam: 'oral',
            topics: [
              { text: '船位通報制度及び船舶交通業務（VTS）の運用指針・基準に基づいた報告', exam: 'oral' },
            ] },
        ],
      },
      {
        id: 'houki',
        name: '法規に関する科目',
        short: '法規',
        exam: 'mixed',
        categories: [
          { id: 'shototsu', name: '海上衝突予防法、海上交通安全法及び港則法', exam: 'written',
            topics: [
              { text: '海上衝突予防法及び同法施行規則', exam: 'written' },
              { text: '海上交通安全法並びに同法施行令及び同法施行規則', exam: 'written' },
              { text: '港則法並びに同法施行令及び同法施行規則', exam: 'written' },
            ] },
          { id: 'senin', name: '船員法及びこれに基づく命令', exam: 'written',
            topics: [
              { text: '船員法及び同法施行規則', exam: 'written' },
              { text: '船員労働安全衛生規則', exam: 'written' },
            ] },
          { id: 'shokuin', name: '船舶職員及び小型船舶操縦者法及び海難審判法', exam: 'oral',
            topics: [
              { text: '船舶職員及び小型船舶操縦者法並びに同法施行令・施行規則', exam: 'oral' },
              { text: '海難審判法', exam: 'oral' },
            ] },
          { id: 'tonsu', name: '船舶法、船舶のトン数の測度に関する法律及び船舶安全法', exam: 'oral',
            topics: [
              { text: '船舶法及び同法施行細則', exam: 'oral' },
              { text: '船舶安全法及びこれに基づく省令（船舶安全法施行規則・船舶設備規程・危険物船舶運送及び貯蔵規則・特殊貨物船舶運送規則・SOLAS証書省令・漁船特殊規則）', exam: 'oral' },
            ] },
          { id: 'kaiyo', name: '海洋汚染等及び海上災害の防止に関する法律', exam: 'written',
            topics: [
              { text: '海洋汚染等及び海上災害の防止に関する法律並びに同法施行令・施行規則', exam: 'written' },
            ] },
          { id: 'kenneki', name: '検疫法及びこれに基づく命令', exam: 'oral',
            topics: [{ text: '検疫法及び同法施行規則', exam: 'oral' }] },
          { id: 'mizusaki', name: '水先法及びこれに基づく命令', exam: 'oral',
            topics: [{ text: '水先法及び同法施行令', exam: 'oral' }] },
          { id: 'kanzei', name: '関税法及びこれに基づく命令', exam: 'oral',
            topics: [{ text: '関税法', exam: 'oral' }] },
          { id: 'kaisho', name: '海商法', exam: 'oral',
            topics: [{ text: '商法第三編海商（海上保険を除く）・国際海上物品運送法・責任制限法・船舶油濁損害賠償保障法', exam: 'oral' }] },
          { id: 'kokusai', name: '国際公法', exam: 'oral',
            topics: [{ text: 'SOLAS条約・STCW条約・国際保健規則・MARPOL条約・IMDGコード・IMSBCコードの概要', exam: 'oral' }] },
        ],
      },
      {
        id: 'eigo',
        name: '英語に関する科目',
        short: '英語',
        exam: 'oral',
        categories: [
          { id: 'jitsumu', name: '海事実務英語', exam: 'oral',
            topics: [
              { text: '水路図誌・気象情報・船舶の安全運航情報及び通報の理解、IMO標準海事通信用語集(SMCP)の理解と利用', exam: 'oral' },
              { text: '多言語の乗組員とともに船内業務を支障なく遂行できる程度', exam: 'oral' },
            ] },
        ],
      },
    ],
  },
};

// 既定の試験日程（年4回）。正確な日付は運輸局で確認のうえ編集する。
export function defaultSchedule(year) {
  return [
    { id: `${year}-02`, year, season: '2月定期', month: 2 },
    { id: `${year}-04`, year, season: '4月定期', month: 4 },
    { id: `${year}-07`, year, season: '7月定期', month: 7 },
    { id: `${year}-10`, year, season: '10月定期', month: 10 },
  ].map((s) => ({
    ...s,
    writtenDate: '', // YYYY-MM-DD（要確認・手入力）
    oralDate: '',
    applyFrom: '',
    applyTo: '',
    note: '',
  }));
}

export function examKey(system, grade) {
  return `${system}-${grade}`;
}

export function getExam(system, grade) {
  return EXAMS[examKey(system, grade)] || null;
}
