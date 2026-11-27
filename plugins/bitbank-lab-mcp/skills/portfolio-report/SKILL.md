---
name: portfolio-report
description: |
  ユーザー自身の bitbank 口座の資産状況（現在の残高、月次・年次の資産推移、保有銘柄の騰落、
  構成比、入出金）を視覚化するスキル。bitbank の API キー（参照権限）の設定が必要。
  「私の資産どうなってる？」「ポートフォリオを見せて」「今月の資産の増減は？」
  「保有している銘柄の調子は？」「口座の状況をまとめて」のような、自分の口座について知りたい発話で使う。
metadata:
  author: bitbank-aiforge
  version: "1.0"
---

# ポートフォリオ分析レポート

`analyze_my_portfolio` の結果だけを使い、口座の資産状況を視覚化するスキル。
MCP ツール（bitbank-lab-mcp）が使える前提で動く。

## 実行の前提（API キー）

- `analyze_my_portfolio` は、bitbank の API キーを設定したときだけ使えるツール。キーが無いとツール自体が表示されない。
- ツール一覧に `analyze_my_portfolio` が無い、または呼べないときは、
  「API キーが設定されていないため、口座の情報は取得できません」と伝えて止める。
  公開データのツールで代用したり、残高や損益を推測したりしない。
- 続けて、設定方法を短く案内する。
  - Claude Desktop: MCP サーバーの設定の `env` に `BITBANK_API_KEY` と `BITBANK_API_SECRET` の両方を書き、再起動する
  - Claude Code の plugin: `/plugin` の設定画面で `api_key` と `api_secret` を入力する
  - キーの権限は「参照」だけで足りる。「出金」権限は付けない
- API キーやシークレットをチャットに貼らせない。貼られても使わず、設定に書くよう案内する。
- ユーザーが HTML ファイルでほしいと言ったときは、下の「mode=html」の手順で出す。

<!-- 下の prompt:start 〜 prompt:end は MCP Prompt「💼 ポートフォリオ分析レポート」の本文に埋め込まれる。編集後は npx tsx scripts/gen_skill_prompts.ts を実行する。 -->
<!-- prompt:start -->
【出力】
- デフォルト: Visualizer（show_widget）でインライン可視化。レイアウト・配色は読みやすく整える。
- mode=html のときのみ: create_file → present_files（Tailwind ダークテーマ、最大幅800px。.claude/rules/html.md 準拠）
- ツール content / summary の数値・時刻・期間は推測せずそのまま表記する

【ツール（1つのみ）】
analyze_my_portfolio(include_pnl=true, include_technical=true, include_deposit_withdrawal=true)

【データ】ツール content テキストのみ参照（structuredContent は見えない）。末尾 JSON の data を使う:
- グラフ: **monthly_equity_series**（月次タブ・日次全点）/ **yearly_equity_series**（年次タブ・月次全点）
- 月初比/年初比の2点（monthly_performance / yearly_performance の start→current）だけで折れ線を描かない
- equity_series は include_pnl=true なら常に populated。summary 先頭の「※ 資産推移シリーズ:...」警告行（jpy_only / fallback_only / partial_fallback）はそのままユーザー向け注記に転載する
- 現在の資産残高（total_jpy_value）、holdings_performance、technical
- トップに含み損・account_return・全履歴実現損益は出さない

【資産推移グラフ（重要）】
visualizer は「月次推移」「年次推移」2タブ。**同じ図の使い回し禁止。** JSON 配列をタブごとに別チャートへ全点プロット。

| タブ | 配列（content JSON） | 増減表示 | X軸 |
| 月次推移 | monthly_equity_series[] | monthly_performance.change_jpy / change_pct | 月初→現在 |
| 年次推移 | yearly_equity_series[] | yearly_performance.change_jpy / change_pct | 年初→現在 |

【セクション】
1. ヘッダー（取得時刻・入出金分析バッジ）
2. 現在の資産残高（大きく + JPY残高 + 前日比）
3. 資産推移グラフ（上記ルール）
4. 保有銘柄のパフォーマンス（月次・年次騰落率）
5. 資産構成比率（横棒、銘柄色分け）
6. テクニカル（technical がある場合のみ）
7. 入出金サマリー（available 時: 年次・月次2カード）
8. 注意書き（指標定義・税務免責: 所得税計算に使えない）

---
⚠️ 免責事項：この分析は参考情報であり、解釈には誤差が含まれる場合があります。
板情報は秒単位で変動するため、実際のトレード前には最新状況を再確認してください。
投資判断はご自身の責任でお願いします。
⚠️ 本レポートの数値は所得税計算に使用できません。
<!-- prompt:end -->
