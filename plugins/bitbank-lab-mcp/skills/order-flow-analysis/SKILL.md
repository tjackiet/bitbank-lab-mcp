---
name: order-flow-analysis
description: |
  暗号資産（bitbank の JPY 建てペア）の直近の約定から、売買フロー
  （CVD＝累積出来高デルタ、Aggressor Ratio＝成行買いの比率、出来高スパイク）を読み、
  いま買いと売りのどちらが優勢かをまとめるスキル。
  「BTC は今買われてる？売られてる？」「ETH のフロー見て」「CVD どうなってる？」
  「成行買いが多い？」「大口っぽい約定ある？」「出来高が急に増えた？」
  「直近の地合いは？」のような発話で使う。デイトレ〜短期スイングの地合い確認向けで、
  数秒〜数分の執行タイミングの判断には使わない。
  通貨ペアはユーザーの指定に従い、指定がなければ BTC/JPY。
metadata:
  author: bitbank-aiforge
  version: "1.0"
---

# フロー分析

`get_flow_metrics`（必要なら `get_transactions`）で直近の約定を集計し、
CVD・Aggressor Ratio・出来高スパイクから買いと売りの優勢をまとめるスキル。
MCP ツール（bitbank-lab-mcp）が使える前提で動く。

## 通貨ペアの決め方

- ユーザーが言った通貨の JPY 建てペアを使う（「ETH」→ `eth_jpy`、「ソラナ」→ `sol_jpy`）。
- 指定がなければ `btc_jpy`。
- 対応は JPY 建てのみ。USDT 建てなどを求められたら、JPY 建てしか扱えないことを伝えて
  JPY 建てで進めてよいか確認する。未対応の銘柄はツールがエラーを返すので、そのまま伝える。
- 以下の `<pair>` は決めたペアに置き換える。

<!-- 下の prompt:start 〜 prompt:end は MCP Prompt「中級：BTCのフロー分析をして」の本文に埋め込まれる。編集後は npx tsx scripts/gen_skill_prompts.ts を実行する。 -->
<!-- prompt:start -->
## ツール

1. `get_flow_metrics(pair=<pair>, limit=300, bucketMs=60000, view=full, nonZeroOnly=true)`
2. `get_transactions(pair=<pair>, limit=200, view=full)` — 必要なときだけ

## 用途

- デイトレ〜短期スイングの地合い確認に使う。
- 数秒〜数分の執行タイミングの判断には鮮度が足りないので勧めない。

## 方針

- CVD のトレンド、Aggressor Ratio（50% を基準）、Volume Spike（z > 2）を見る。直近 1〜3 時間を重視する。
- 約定 300 件が何時間ぶんになるかはペアの出来高で変わる。content の実取得範囲（スパン）を読み、
  それが 1 時間に満たない、または大きく超える場合は、どの時間幅を見たかを結論に添える。
- 欠損バケット（データなし）は閑散と読まない。

## 出力

冒頭に 📸 YYYY/MM/DD HH:MM:SS JST 時点（content の実取得範囲の終わりの時刻を使い、推測しない）

- 結論（買い / 売り / 拮抗）
- CVD の推移
- スパイク（あれば）
- 価格との連動状況

最後に次の免責事項をそのまま付ける。

---
⚠️ 免責事項：この分析は参考情報であり、解釈には誤差が含まれる場合があります。
市況は刻々と変動するため、実際のトレード前には最新状況を再確認してください。
投資判断はご自身の責任でお願いします。
<!-- prompt:end -->
