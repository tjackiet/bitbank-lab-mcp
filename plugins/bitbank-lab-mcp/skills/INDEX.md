# Skills カタログ

bitbank-lab-mcp に同梱する Agent Skill の索引。
各 skill は `skills/<name>/SKILL.md` を起点に、必要に応じて `references/` 配下に
詳細ガイドを置く。横断で参照するドキュメントは `_shared/references/` に集約する。

## 分類

- **Primitive Skill** — 単一責務。単独で完結する。
- **Recipe Skill** — 複数の skill / ツールを束ねた複合ワークフロー。
  名前を `recipe-` プレフィックスで揃える。

## 一覧

### Onboarding

| Skill | 概要 | 代表的なユーザー発話 |
|---|---|---|
| [`investment-onboarding`](./investment-onboarding/SKILL.md) | リスク許容度・運用スタイル・戦術を最小限の問い（最大 3 問）で絞り込み、該当する戦術ガイドと MCP ツールへ誘導する。 | 「何から始めればいい？」「どう運用すれば？」「bitbank で運用したい」 |

### Market Read

| Skill | 概要 | 代表的なユーザー発話 |
|---|---|---|
| [`support-resistance-analysis`](./support-resistance-analysis/SKILL.md) | 過去の反応実績（★）・板の厚み・直近の攻防からサポート / レジスタンスを評価し、シナリオと構造図にまとめる。 | 「ETH のサポレジどう？」「どこで止まりそう？」「上値の抵抗線は？」 |
| [`order-flow-analysis`](./order-flow-analysis/SKILL.md) | 直近の約定から CVD・Aggressor Ratio・出来高スパイクを読み、買いと売りのどちらが優勢かをまとめる（デイトレ〜短期スイングの地合い確認向け）。 | 「今買われてる？売られてる？」「フロー見て」「CVD どうなってる？」 |
| [`beginner-price-analysis`](./beginner-price-analysis/SKILL.md) | 最近の値動き（1 週間〜3 か月）と RSI・移動平均線・一目均衡表を、専門用語をかみ砕いて初心者向けにまとめる。 | 「最近のビットコインの動きを教えて」「初心者にも分かるように ETH を分析して」 |
| [`trending-coins`](./trending-coins/SKILL.md) | 通貨強弱スコア・24 時間上昇率・出来高の上位から、いま注目されている銘柄を紹介する。 | 「今注目のコインは？」「最近強い銘柄ある？」「出来高が多いコインは？」 |
| [`morning-report`](./morning-report/SKILL.md) | 今朝の現在値・前日比(24h)・24 時間のミニスパークライン・地合いだけを、5 秒で把握できる軽量レポートにする。 | 「おはようレポート」「今朝のビットコインどう？」「寝てる間にどうなった？」 |

### Signal & Strategy

| Skill | 概要 | 代表的なユーザー発話 |
|---|---|---|
| [`chart-pattern-analysis`](./chart-pattern-analysis/SKILL.md) | 日足のチャートパターン（形成中・完成済み）とローソク足パターンを検出し、鮮度と現在価格との距離で重要度を付ける。 | 「ダブルトップ出てる？」「三角持ち合いになってる？」「パターン分析して」 |
| [`indicator-analysis`](./indicator-analysis/SKILL.md) | RSI・MACD・移動平均線・一目均衡表・ボリンジャーバンドを横断して日足の総合判定を出し、次の転換サインを具体化する。 | 「RSI どう？」「MACD クロスしてる？」「テクニカル的に強い？」 |

### Portfolio

| Skill | 概要 | 代表的なユーザー発話 |
|---|---|---|
| [`portfolio-report`](./portfolio-report/SKILL.md) | 口座の残高・資産推移・保有銘柄の騰落・構成比・入出金を視覚化する。API キー（参照権限）が必要で、無いときはその旨と設定方法を案内する。 | 「私の資産どうなってる？」「ポートフォリオを見せて」「今月の資産の増減は？」 |

<!--
今後追加する際のカテゴリ案（CLI 側 INDEX.md と揃える）:

- Market Read — リアルタイム市況読解
- Risk & Statistics — ボラ・相関などの統計
- Signal & Strategy — シグナル探索・バックテスト
- Portfolio — 保有資産の評価
- Operations — データ品質・プロファイル管理・ペーパートレード
- Recipes — 複合ワークフロー（`recipe-*`）
-->

## 共通リファレンス

複数 skill から参照される共通ドキュメントは [`_shared/references/`](./_shared/references/) に置く。
