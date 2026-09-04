# scripts/

MCP ツールをコマンドラインから単体実行するためのスクリプト群。

## ビルド・コード生成

| スクリプト | npm script | 説明 |
|---|---|---|
| `gen_types.ts` | `npm run gen:types` | `src/schemas.ts` の Zod スキーマから `src/types/schemas.generated.d.ts` を生成 |

## ログ・レポート

| スクリプト | npm script | 説明 |
|---|---|---|
| `stat.ts` | `npm run stat` | `logs/` 配下の JSONL ログを集計し、成功率・エラー種別・処理時間の統計を表示 |
| `report.ts` | `npm run report` | 前日分のログから日次レポート (Markdown) を `reports/` に生成 |

```bash
# 直近 7 日間の統計
npm run stat -- --last 7d
```

## CLI ツール（`*_cli.ts`）

各 MCP ツールを `npx tsx` で直接実行できるエントリポイント。
引数パースと結果出力は `cli-utils.ts` (`parseArgs`, `runCli`) で統一されている。

| スクリプト | 説明 | 使用例 |
|---|---|---|
| `get_candles_cli.ts` | ローソク足データ取得 | `npx tsx scripts/get_candles_cli.ts btc_jpy 1hour 20240511` |
| `get_tickers_jpy_cli.ts` | 全通貨ペアの JPY ティッカー取得 | `npx tsx scripts/get_tickers_jpy_cli.ts` |
| `get_transactions_cli.ts` | 約定履歴取得 | `npx tsx scripts/get_transactions_cli.ts btc_jpy 100` |
| `get_flow_metrics_cli.ts` | 資金フローメトリクス取得 | `npx tsx scripts/get_flow_metrics_cli.ts btc_jpy 100 60000` |
| `get_volatility_metrics_cli.ts` | ボラティリティ指標取得 | `npx tsx scripts/get_volatility_metrics_cli.ts btc_jpy 1day 200 --windows=14,20,30` |
| `analyze_indicators_cli.ts` | テクニカル指標分析 | `npx tsx scripts/analyze_indicators_cli.ts btc_jpy 1day` |
| `analyze_candle_patterns_cli.ts` | ローソク足パターン検出 | `npx tsx scripts/analyze_candle_patterns_cli.ts 20251115` |
| `render_chart_svg_cli.ts` | チャート SVG 描画 | `npx tsx scripts/render_chart_svg_cli.ts btc_jpy 1day 60 --sma=5,20` |
| `render_candle_pattern_diagram_cli.ts` | ローソク足パターン図解 SVG 生成 | `npx tsx scripts/render_candle_pattern_diagram_cli.ts output.svg` |

### render_chart_svg_cli.ts の主なフラグ

| フラグ | 説明 |
|---|---|
| `--sma=5,20` | SMA 期間をカンマ区切りで指定 |
| `--with-ichimoku` | 一目均衡表を表示 |
| `--bb-mode=default\|extended` | ボリンジャーバンドのモード |
| `--style=candles\|line\|depth` | チャートスタイル |
| `--sma-only` / `--bb-only` / `--ichimoku-only` / `--candles-only` | 指定インジケータのみ表示 |

## 計測（issue の Phase 1 実測ログ用）

| スクリプト | 説明 |
|---|---|
| `measure_relaxed_fallback_227.ts` | `detect_hs.ts` の relaxed フォールバック（`RELAXED_FACTORS`）が標準コーパス 800 ＋ 実データ B 96 でどれだけ発火・accepted になるかを段別に計測し、段2 の係数スイープ・`headProminence` 軸の strict 採点試算を Markdown で出す（issue #227 Phase 1。コードは変えない） |
| `measure_triple_target_reach_228.ts` | `detect_triples.ts` の完成済み 4 経路に `computeTargetReach` を配線したうえで、`target-reach.ts` の 3 定数（退化ガード比 / 上限 pct / 走査窓バー数）が triple でも妥当かを 940 ケースで計測して Markdown で出す（issue #228。定数は変えない）。結果は `docs/internal/triple-target-reach-228.md` |

| `scan_hs_216.ts` | `detect_patterns` を H&S / 逆H&S に絞り `view=full` で複数ペア × 複数時間足に順に当て、各ペアの `検出経路:` 行だけを出す。**strict が 1 件以上出たペアで打ち切り**、そのペアの `content[0].text` を全文出す（#216 の外挿線 vs 水平基準の実害例収集用。コードは変えない） |

```bash
npx tsx scripts/measure_relaxed_fallback_227.ts                  # Markdown を stdout へ
npx tsx scripts/measure_relaxed_fallback_227.ts --json out.json  # 生データも保存

npx tsx scripts/measure_triple_target_reach_228.ts               # 同上
npx tsx scripts/measure_triple_target_reach_228.ts --json out.json
```

## バックテスト

| スクリプト | 説明 |
|---|---|
| `run_backtest_e2e.ts` | バックテストの E2E 実行。戦略: `sma_cross`, `rsi`, `macd_cross`, `bb_breakout` |

```bash
npx tsx scripts/run_backtest_e2e.ts sma_cross
npx tsx scripts/run_backtest_e2e.ts rsi
```

## 共通ユーティリティ

| スクリプト | 説明 |
|---|---|
| `cli-utils.ts` | CLI 共通ユーティリティ。`parseArgs` (引数パース)、`intArg` (整数引数取得)、`runCli` (エントリポイントラッパー) を提供 |

```bash
# 既定: eth,xrp,sol,doge,ltc,bcc を 1hour → 4hour → 1day の順
npx tsx scripts/scan_hs_216.ts
npx tsx scripts/scan_hs_216.ts --pairs=eth_jpy,xrp_jpy --types=1hour --limit=365
npx tsx scripts/scan_hs_216.ts --json   # HIT 時に pivot の生値も出す
```

`--json` は `structuredContent.data.patterns[].pivots[]` を丸めずに出す。content の pivot 明細行は
`formatPivotPrices` が `Math.round` で円単位に丸める（**4 view すべて。`view=debug` でも変わらない**）ため、
XRP のような低位価格帯では丸め幅 ±0.5円 が 0.2% 相当になり、外挿線と水平基準の上下判定が確定できない。
`idx` も出るのでバー数を日時からの換算ではなく idx 差で厳密に取れる。

`--limit` は既定 90（スキャン窓の本数）。**1hour で 0 件が続くときは先に `--limit` を上げること**——
既定の 90 本は「形成中〜完成直後」を見る窓で、数日前に完成した H&S は窓の外に落ちて静かに 0 件になる。
