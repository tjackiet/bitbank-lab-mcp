# Changelog

本プロジェクトの主な変更履歴です。
形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠しています。

---

## [Unreleased]

### 読む順（`detect_patterns` 系の一連の変更。#114 → 本 PR）

**以下の `detect_patterns` 系エントリは 1 本の連続した作業で、起点は #114 の「スキャン窓を直近 `limit` 本に一致させた」変更。** 個々のエントリは新しい順に並んでいるため、逆順に全部読まないと話が再構成できない。ここに時系列の索引を置く（**各エントリの本文は削っていない**——判断根拠と却下案がリリース後に効く資産なので）。

| 順 | PR | 変更 | `data.patterns` |
|---|---|---|---|
| 1 | #114 | **起点。** スキャン窓を `limit + 199` 本から直近 `limit` 本に一致させた。以降の「窓が狭い」系の問題はすべてここから派生する | 減る |
| 2 | #117 | 窓が構造上狭すぎるとき `limit_too_small_for_timeframe` を申告 | 変わらない |
| 3 | #119 | ツール description に検出の意味論を明記 | 変わらない |
| 4 | #120 | 検出器ごとの最小要求バー数を単一ソース化し、到達性を機械的に固定 | 変わらない |
| 5 | #121 | 閾値のプリミティブを日数からバー数に統一し、上限クランプを入れた | 変わる |
| 6 | #122 | 形成中 double / H&S の手書き `daysPerBar` を廃止しバー基準に統一 | 変わる |
| 7 | #123 | `limit` を**上げる**方向の使い分けをツール表面に明記 | 変わらない |
| 8 | #128 | `view=debug` の可観測性（#124）と pivot の価格基準の透明化（#125 前半）、用語の陳腐化（#127 の一部） | 変わらない |
| 9 | #131 | ダブルトップ / ボトムの構造ゲート、`status='expired'`、`include*` の独立化、実データ回帰 fixture | 変わる |
| 10 | #132 | ダブルボトムの偽陰性を 3 つの原因ごとに解消 | 増える |
| 11 | #135 | dedup の勝者選択を `statusScore` 最優先に揃えた | 変わる |
| 12 | #136 | 構造的ピボット間隔の床（`= 5`）の妥当性を実測で判定し据え置きを確定 | 変わらない |
| 13 | #137 | 三角形の分類前 candidate ラベルを umbrella 化（#129）、`limit=180` の判定と CI ジョブ名の注記（#127 の残り） | 変わらない |
| 14 | #139 | triple / H&S にサイズ検査を横展開（#138 欠陥 2-2） | 減る |
| 15 | #140 | triple / H&S に構造ゲートを横展開（#138 欠陥 2-1） | 減る |
| 16 | #141 | 三角形の外れ値除去に除去率の上限を入れた | 実データで**減る**（合成 fixture は変わらない） |
| 17 | #148 | H&S の窓生成から交互列要求を外した（#146） | 実データで**増える**（合成 fixture は変わらない） |
| 18 | 本 PR | H&S の `tolerancePct` が頭の突出率としても使われ意味が反転していたのを `headProminencePct` に分離（#149） | **変わらない**（既定値のまま） |

### Fixed（`detect_hs` の `tolerancePct` が頭の判定でだけ意味が反転していたのを `headProminencePct` に分離。#149）

PR #146 の実例（BTC/JPY 1時間足、左肩 12,582,009 / 頭 12,851,000 / 右肩 12,617,817）で
Claude Desktop から実運用したところ、`tolerancePct` を 0.06 → 0.05 → 0.02 と**下げて緩めよう**
としたユーザー操作が逆に効き、一貫して `head_not_higher` で落ち続けた。

原因は `tools/patterns/detect_hs.ts` の頭の判定:

```ts
const headLower  = p2.price < Math.min(p0.price, p4.price) * (1 - tolerancePct);
const headHigher = p2.price > Math.max(p0.price, p4.price) * (1 + tolerancePct);
```

`tolerancePct` が「頭が両肩よりどれだけ突出していなければならないかの最小要求率」として使われており、
**大きくするほど判定が厳しくなる。** 一方 double / triple / triangle 系の `tolerancePct` は
「同水準判定の許容誤差」——**大きいほど緩い。** 同じスキーマ・同じパラメータ名の 1 つの数値が、
種別によって「許容度」にも「要求の厳しさ」にもなっていた。

#### 追加で判明した事実（issue 未記載）

**`tolerancePct` は H&S の中で実は 2 つの異なる役割を同時に持っていた。**

```ts
const shouldersNear = near(p0.price, p4.price) && isSameLevel(p0.price, p4.price, HS_SHOULDER_MAX_PCT);
//                    ^^^^ tolerancePct 経由（ctx.near、他種別と同じ「小さいほど厳しい」）
const headLower = p2.price < Math.min(p0.price, p4.price) * (1 - tolerancePct);
//                                                                ^^^^^^^^^^^^ 同じ tolerancePct が「大きいほど厳しい」で効く
```

**同じ 1 つの値が、肩の判定では「小さいほど厳格」、頭の判定では「大きいほど厳格」として
同時にかかっていた。** ユーザーが片方（頭を緩めたい）を意図して動かすと、必ずもう片方（肩）が
逆に動く。これは「description に明記する」（issue の方針 B）では解消できない構造的な理由——
2 つの役割が同じ変数に同居していること自体が問題であり、分離（方針 A）でしか根治しない。

#### 方針 A（専用パラメータへの分離）を採用

上記の理由で方針 A を採用し、頭の突出率を新パラメータ `headProminencePct` に切り出した。

- `tolerancePct` は H&S でも**肩の同水準判定（`near` / `shouldersNear`）にのみ残る**
  （他種別と同じ「大きいほど緩い」の意味に統一される）。
- `headProminencePct` が `headLower` / `headHigher`（strict 経路）と、relaxed fallback の
  頭の緩和項（`tolerancePct * factors.head` だった箇所）を担う。
- 数式の向き（`(1 ± X)`）はあえて反転させず、**名前で正しく説明する**方を選んだ
  （issue が挙げたもう一方の選択肢）。反転させるには「突出率の上限」のような根拠のない
  定数から引き算する形にせざるを得ず、複雑さの割に得るものがない。`headProminencePct` は
  「最小要求」を表す名前で、`tolerancePct`（許容誤差）とは異なる種類の量だと明示すれば、
  「大きいほど厳しい」という向きそのものは不自然ではない。
- 既定値は未指定なら `tolerancePct` と同じ時間軸オート表（1hour/4hour=0.05, 8/12hour=0.045,
  15/30min=0.06, 1week=0.035, 1month=0.03, 他=0.04）を使う（`resolveParams`）。
  `tolerancePct` を明示的に変更しても `headProminencePct` には影響しない
  ——両者は完全に独立した既定値解決を持つ。

#### issue が確認を求めた 2 点

1. **`necklineDiffPct`（ネックライン水平度）の閾値は `tolerancePct` でよいか？**
   → 確認の結果、**現状もこの先も `tolerancePct` には依存しない。** `validateHorizontalNeckline`
   は固定定数 `HS_NECKLINE_MAX_PCT`（0.05）だけを見ており、呼び出し側は `tolerancePct` を渡していない
   （`tools/patterns/structural.ts`）。「肩の同水準判定・ネックライン水平度に tolerancePct を残す」という
   issue の記述はネックライン側は実装上該当せず、今回は何も変えていない。
2. **`shouldersNear` の二重ゲート（`near()` と `isSameLevel(.., HS_SHOULDER_MAX_PCT=0.05)`）は
   どちらで律速するか？** → 時間軸オートの `tolerancePct` が 0.05 未満（1day/8h/12h/1week/1month）
   なら `near()` が binding。0.05 と一致する 1hour/4hour は同値でどちらも同時に効く。0.05 を超える
   15min/30min（オート値 0.06）は固定上限 `HS_SHOULDER_MAX_PCT` が binding になり、`tolerancePct`
   をそれ以上緩めても肩の許容は 5% で頭打ちになる（`tests/patterns/detect_hs.test.ts` の
   `tolerancePct=0.06` 系テストが既にこの境界を固定している）。

#### 併せて対応（issue の「併せて検討」）

候補生成の時点で落ちたもの（`head_not_higher` 等、`status` を持たない）と、構造ゲート通過後に
`status=invalid`/`expired` になったもの（`includeInvalid=true` で拾える）は別カテゴリだが、
この区別自体がツールの説明文にも `content` にも出ていなかった。別 issue には切らず本 PR で対応した:

- `src/schema/patterns.ts` の `includeInvalid` / `view=debug` の description に区別を明記
  （H&S 固有ではなく `detect_patterns` 全種別に共通の説明なので、全パターン種別に効く）。
- `formatDebugView`（`view=debug` の実際の content 生成部）の【Candidates】見出し直下に
  `❌ = 候補段階の棄却（status なし。理由は [reason]。includeInvalid では拾えない）` を追加。
  LLM は `structuredContent` を読めず `content[0].text` だけを見るため（`.claude/rules/tools.md`）、
  description だけでなく content 側にも明示した。

#### 実測（704 ケース比較 + ablation）

`tests/detect_patterns_fixtures.test.ts` の fixture 22 件 × オプション 8 通り
（`includeForming` / `includeCompleted` / `includeInvalid`）× 時間足 2 種（`1day` / `1hour`）×
`swingDepth` 2 種（2 / 3）= **704 ケース**を、変更前後で走らせて突き合わせた
（#131 以降と同じ手順・同じ 704 ケース。`tolerancePct` / `headProminencePct` はどちらも未指定＝
時間軸オートのまま）。

| 項目 | 結果 |
|---|---|
| 変化したケース | **0 / 704**。全ケース完全一致（パターン合計 296 件で一致） |
| 実データ回帰（`tests/fixtures/btc_jpy_1day_2026.ts`、時間足 3 種 × `swingDepth` 4 種 × オプション 8 通り = 96 ケース） | **0 / 96**。全ケース完全一致（パターン合計 336 件で一致） |

**0/704 は「配線されていない」ことを意味しない。** `headProminencePct` を強制的に 0.5（頭が
両肩より 50% 突出必須）に差し替える ablation を同じ 704 ケースで走らせたところ:

| ablation | 変化したケース | 内訳 |
|---|---|---|
| `headProminencePct` を常に 0.5 に固定 | **32 / 704** | `head_and_shoulders` 16 件・`inverse_head_and_shoulders` 16 件が**全滅**。他の 11 種別（double / triple / triangle / wedge / flag / pennant）は**1 件も変化しない** |

`headProminencePct` が H&S / 逆 H&S にのみ配線されており、既定値のままなら旧実装と数値上
完全に等価であることの両方を確認した。

#### 受け入れ条件の確認（issue の実例）

`tests/patterns/detect_hs.test.ts` の `buildIssue146Ctx`（#146 実例の座標をそのまま使う既存 fixture）
に 2 テストを追加した:

- `tolerancePct` を 0.005 〜 0.1（スキーマ全域）で振っても、`headProminencePct` を固定していれば
  `head_not_higher` の判定は変わらない（`tolerancePct` は頭の判定に無関係になったことの確認）。
- `headProminencePct` を既定 0.05 から 0.01 まで緩めると、1.85% の頭マージン不足による
  `head_not_higher` が解消する（新パラメータが実際に効くことの確認）。

#### 変更ファイル

- `tools/patterns/config.ts`: `resolveParams` に `headProminencePct` の解決を追加
  （未指定時は `tolerancePct` と同じ時間軸オート表）。
- `tools/patterns/types.ts`: `DetectContext.headProminencePct` を追加。
- `tools/detect_patterns.ts`: `opts.headProminencePct` を受け取り `ctx` へ配線。
- `tools/patterns/detect_hs.ts`: `findStrictHS` / `findStrictInverseHS` の `headHigher` /
  `headLower`、および relaxed fallback（`findRelaxedHS` / `findRelaxedInverseHS`）の頭の緩和項を
  `headProminencePct` に切り替え。debug candidates の詳細に `tolerancePct` と `headProminencePct`
  を分けて出すようにした（旧 `thresholdPct` は削除）。
- `src/schema/patterns.ts`: `headProminencePct` パラメータを新設。`tolerancePct` に H&S での
  スコープを明記する description を追加。`includeInvalid` / `view=debug` に候補段階棄却との
  区別を追記。
- `src/handlers/detectPatternsViewsHandler.ts`: `formatDebugView` の Candidates セクションに
  区別の説明行を追加。

### Fixed（`detect_hs` の**窓生成**から交互列要求を外した。**目視で明らかな H&S が候補にすら残らない偽陰性**が解消。#146）

`detect_hs` の strict 経路は `pivots` の**配列上で連続する 5 点**を取り、それが `H-L-H-L-H`
（逆 H&S は `L-H-L-H-L`）であることを要求していた。この「交互列要求」は実データの 2 通りの
崩れ方に脆い:

- 浅い谷が `swingDepth` の粒度で消え、左肩と頭が `H→H` で連続する
- 頭の直後に別の高値が挟まり、頭より右の交互が崩れる

どちらの場合も**頭を中心とした窓が一度も生成されない**。#130 / #138 / #141 で潰してきた
偽陰性はすべて「候補は生成されるが判定で落ちる」クラスで、`view=debug` の candidates に
棄却理由が残った。本件は**候補が生成されない**クラスなので、#145 で整備した debug の
導線でも見えない。

同じ「複数の山＋谷」構造を扱う `detect_triples` は交互列を要求していない（山リストと谷リストを
別々に扱うので、余計なピボットの挟み込みに耐性がある）。そこで窓生成をそちらへ寄せた:
**肩リストから肩 2 つを取り、その間の最高値（逆 H&S は最安値）を頭に、谷は「肩と頭の間」の
各区間から取る**（`enumerateHsWindows`）。

**新しい窓生成の窓は旧実装の窓の上位集合で、それは交互列が崩れていない区間でも同じ。**
肩リスト上で隣り合う組（`gap=2`）は旧実装と同じ 5 点になるが、**間に肩を跨ぐ組（`gap>=3`）は
旧実装が作れなかった窓**で、これは `H L H L H L H` のように厳密に交互する列でも出る
（肩 `h0 h1 h2 h3` の `(h0, h3)` は、間の最高値 `max(h1, h2)` を頭に、肩 1 つと谷 1 つを跨いだ 5 点になる）。
**#146 の 5 点自体が `gap=3` の窓**（肩リスト `[左肩, 頭, 余計な高値, 右肩]` の第 1 と第 4）なので、
`gap=2` に限れば本 issue は解けない。

増えるのは**窓であって検出ではない**。**緩めた分の品質保証は窓生成ではなく後段のゲート**
（サイズ検査 #139 / 構造ゲート #140 / 先行トレンド / ネックライン水平性）が担う。

#### 肩の取り違えを窓生成で弾く（`outerShoulderOk`）

肩を跨ぐ窓を許すと、**跨いだ先の山のほうが肩より高い**読みまで作れてしまう。
`H100-L80-H130-L80-H120-L80-H100` で `(H100, H100)` を肩に取ると、頭 130 / 肩 100・100 で
一見きれいに揃うが、谷2 と右肩の間に**右肩より 20% 高い山 120** がある。その山こそが右肩で、
外側の 100 を右肩と読むのは肩の取り違え。**外側の脚（肩 ↔ 隣のネックライン点）に肩を明確に
超える肩がある組は窓にしない。**

取り違えていない読みは別の組として列挙されるので、これは**パターンを落とすのではなく
誤った anchor を落とす**だけ。

**「明確に超える」を `HS_SHOULDER_MAX_PCT`（5%）で測るのが肝。** 単純な `>` で実装すると、
双子の山（実データ BTC/JPY 日足の idx 38 と 42 は差 **0.08%**）で肩がわずかに低い側に当たった
だけで窓が消え、**実在する H&S を落とす**——実測では下記 96 ケースの改善が 8 件 → **0 件**に
全消えした。同水準なら「幅のある肩」の一部として通し、肩として別格に高いものだけを弾く。

#### 設計判断: 適用は strict の 2 経路だけ。relaxed の 2 経路は旧実装のまま

窓生成が同型なのは strict 2 経路（H&S / 逆 H&S）と relaxed 2 経路の計 4 箇所
（**形成中の 2 経路は元から「確定ピークの最高値を頭に取る」形で、交互列を要求していない**）。
このうち **strict の 2 経路にだけ適用した**。

relaxed は `RELAXED_FACTORS` を厳しい段（`x1.6_0.6`）から順に試し、**最初に条件を満たした窓で
早期 `return`** する。窓が増えると、緩い段へ落ちる前に厳しい段が別の窓を拾うため、
実データで**完成済み H&S が `near_completion` に置き換わって消える**。実測（下記 96 ケース）:

| 適用範囲 | 変化したケース | パターン総数 | 増えた実体 | 消えた実体 |
|---|---|---|---|---|
| **strict 2 経路のみ（採用）** | **8 / 96** | 328 → **336** | 2 種 | **0 種** |
| strict + relaxed 4 経路 | 40 / 96 | 328 → 348 | 7 種 | **3 種**（うち 1 種は完成済み H&S） |

4 経路に広げても **#146 の 5 点は strict の許容誤差で通る**ので、本 issue の解決には寄与しない。
「差分は追加のみ・消失ゼロ」を保てる strict のみを採り、relaxed への横展開は見送った
（早期 `return` の段選択そのものを見直す必要があり、それは窓生成とは別の判断。
計測値は上記に残したので、着手する際は 0 から測り直す必要はない）。

#### 受け入れ条件の確認（issue #146 の 5 点）

issue が実測として報告したピボット列（`… H20 L26 H31 H34 L38 H45 …`。頭の直後に
余計な高値 12,726,672 が挟まる）を入力にすると:

| | 頭 12,851,000 を中心とする窓 | `view=debug` の結論 |
|---|---|---|
| main | **0 件**（生成されない） | 痕跡なし |
| 本 PR | **1 件** `[左肩 20 / 谷1 26 / 頭 31 / 谷2 38 / 右肩 45]` | `head_not_higher` |

issue の受け入れ条件は「completed で検出される」ことではなく**「候補が評価されて理由付きで
結論が出る」こと**で、それを満たしている。結論が `head_not_higher` になるのは正しい——
**頭 12,851,000 は右肩 12,617,817 を 1.85% しか上回っておらず**、strict が要求する頭のマージン
（`1hour` の `tolerancePct` = 5%）に届かないため。issue の「頭が両肩より高い ✓」は
大小関係の話で、マージンの話ではない。`tolerancePct` を頭の要求マージンに流用している設計の
是非は本 PR の範囲外（別 issue）。

回帰は `tests/patterns/detect_hs.test.ts` の「交互列が崩れたピボット列からの窓生成（issue #146）」で固定した。

#### 実測（704 ケース比較）

`tests/detect_patterns_fixtures.test.ts` の **fixture 22 件 × オプション 8 通り（`includeForming` /
`includeCompleted` / `includeInvalid`）× 時間足 2 種（`1day` / `1hour`）× `swingDepth` 2 種（2 / 3）
= 704 ケース**を、`main`（10b802c）と本ブランチの双方で走らせて突き合わせた
（#131 / #132 / #135 / #136 / #139 / #140 / #141 と同じ手順・同じ 704 ケース）。

| 指標 | 結果 |
|---|---|
| 変化したケース | **0 / 704**。全ケース完全一致 |
| パターン総数 | 296 → **296**（種別内訳も全て不変） |

**0 / 704 は「窓が変わっていない」ことを意味しない。** 同じ 704 ケースで
**H&S / 逆 H&S の候補窓の総数は 904 → 440 に変わっている**（増えたケース 0 / 同数 512 /
減ったケース 192）。内訳は 2 方向で、差引きで減っている:

- **増える方向**: 肩を跨ぐ組（`gap>=3`）の窓。交互列でも出る（上記）
- **減る方向**: 頭が肩を超えない組と、外側の脚に肩を超える肩がある組（`outerShoulderOk`）を
  窓にしなくなった分。旧実装ではこれが `head_not_higher` / `shoulders_not_near` の棄却として
  debug に載っていたが、どう読んでも H&S でない / 肩を取り違えているだけの組なので候補にしない

**窓は変わったが、後段のゲートと dedup を通った `data.patterns` は完全一致した**というのが
0 / 704 の内容。配線は **ablation でも確認した**——`enumerateHsWindows` が常に空を返すように
して同じ 704 ケースを走らせた結果:

| ablation | 変化したケース | 内訳 |
|---|---|---|
| `enumerateHsWindows` が常に `[]` | **16 / 704** | strict 経路の H&S が消え、`relaxed_hs_*` / `relaxed_ihs_*` のフォールバックに置き換わる（整合度 1 / 0.99 → 0.96）。**704 ケースの H&S / 逆 H&S は全件が新しい窓生成を通っている** |

#### 実測（BTC/JPY 日足 90 本の実データ）

`tests/fixtures/btc_jpy_1day_2026.ts`（上記 704 ケースの外）を **時間足 3 種（`1day` / `4hour` /
`1hour`）× `swingDepth` 4 種（既定 / 2 / 3 / 6）× オプション 8 通り = 96 ケース**で突き合わせた。
合成 fixture と違い、ピボット列に `H→H` の連続や余計な高値の挟み込みが実在する。

| 指標 | 結果 |
|---|---|
| 変化したケース | **8 / 96** |
| パターン総数 | 328 → **336** |
| 種別内訳 | `head_and_shoulders` 20 → **28**。**他の種別は 1 件も動かない** |
| 差分の向き | **追加のみ。消えたパターンは 0 件** |

##### 増えた 2 実体と、それが正しい検出である理由

どちらも **#139 の CHANGELOG が「実在する H&S」として既定 `swingDepth` で固定したのと同じ値動き**
（頭 10,849,999 / 谷 10,002,960 / 右肩 10,191,324）。既定 `swingDepth` では左肩-頭の間に谷ピボットが
無く、`tryFormingHS` が**頭-戻り-右肩の 3 点に縮退**して読んでいた。`swingDepth` を 2 / 3 に
落とすと谷 45 がピボットとして現れるが、ピボット列が `… H38 H42 L45 H47 H53 L66 H73 …` と
交互が崩れているため、**旧実装では 5 点の窓が生成できなかった**。

| 増えたパターン | 構成点 | 整合度 | ケース数 |
|---|---|---|---|
| `head_and_shoulders` / `near_completion` | 左肩 38 / 谷 45 / 頭 53 / 谷 66 / 右肩 73 | 0.82 | 4 |
| `head_and_shoulders` / `near_completion` | 左肩 38 / 谷 45 / 頭 53 / 谷 66 / 右肩 70 | 0.87 | 4 |

つまり**新しい値動きを拾ったのではなく、既知の実在パターンを縮退した 4 点ではなく
5 点の構造として読めるようになった**もの。`status` が `near_completion` なのは
ネックライン突破が未確認だからで、`includeForming: false` の既定出力は変わらない。

##### 増えた検出がゲートを通過している記録

| 検査 | 値 | 閾値 | 判定 |
|---|---|---|---|
| 構造ゲート 戻り率（#140） | **0.3923** | `[0.20, 0.90]` | 通過（`skipped` ではなく実際に評価） |
| 構造ゲート ネックライン交差（#140） | `necklineCrossIdx` = **9** | 存在すること | 通過 |
| 構造ゲート 先行極値 | `priorExtremeIdx` = **33**（9,401,000） | — | 素通しでないことの証拠 |
| サイズ検査 パターン高さ（#139） | **10.55%**（10,903,000 − 9,752,246） | ≥ 3% | 通過 |
| サイズ検査 谷1 の押し（#139） | **5.95%** | ≥ 5% | 通過 |
| サイズ検査 谷2 の押し（#139） | **8.27%** | ≥ 5% | 通過 |

`tests/patterns/structural-gates-triple-hs.test.ts` の `swingDepth=3` のテストは、**期待値を緩めずに**
「縮退した 4 点の読み（左肩 47）は `neckline_below_pre_decline_low` で落ちたまま・5 点の読みは
ゲートを通って残る」という形に書き換えた（#133 → #132 と同じ扱い）。

#### 探索量

窓生成は肩リストの全ペアを見るので組数は肩の数の 2 乗で増える。`limit` のスキーマ上限 365 本を
最小の `swingDepth=2` で走らせても肩は 90 個前後で 4,000 組ほど。上限 `HS_MAX_SHOULDER_PAIRS = 5000`
を歯止めとして置いた（実運用では到達しない。病的な入力で探索が発散しないため）。
704 ケース / 96 ケースとも実行時間は main と変わらない。

### Fixed（`detect_triangles` の外れ値除去に**除去率の上限**を入れた。**窓全体に線を引いただけの三角形が減る**。#141）

`robustFit` は初回の R² が閾値に届かないとき、最悪残差の点を 1 つずつ捨てて再フィットする。除去の上限は `pts.length - minPoints`（= `minPoints` 個が残るまで）だけで、**除去率の上限が無かった**。ループは `line.r2 >= minR2` になった時点で止まるので、**「閾値をぎりぎり超えるまで捨てた線」**が成立する。

BTC/JPY 日足 90 本の実測では、スキャン窓の 88%（idx 0〜81）を占める `triangle_symmetrical` が `r2Upper 0.602 / r2Lower 0.648`（閾値 `minR2 = 0.6` の直上）で、**34 点中 18 点を捨てて**成立していた。閾値 0.6 は「18 点を捨てた後の当てはまり」なので、指標として機能していない。

**`minPoints`（= 3）は歯止めにならない。** 3 点はほぼ常に直線に乗るので、`minPoints` まで捨てれば R² は自動的に高くなる。実測でも上ライン 8 点中 5 点を捨てた候補が `r2Upper = 0.961` を得ている（走査窓 `1day [15,50]`）——**R² が高いこと自体が「捨てすぎ」の症状**という転倒が起きていた。

そこで「何点残ったか」ではなく**「何割捨てたか」**を hard reject する（#131 以降の原則「構造として成立していないものはスコア減点ではなく hard reject」に従い、confidence の減点にはしない）。棄却は `view=debug` に理由コード `excessive_outlier_removal` で出る。分類前の棄却なので umbrella ラベル `'triangle'` で積む（`poor_trendline_fit` と同じ契約。`tests/detect_patterns_debug.test.ts` の `PRE_CLASSIFICATION_REASONS` に登録した）。

#### 設計判断: 上下ラインを**独立に**判定する（どちらか一方でも超えたら棄却）

`robustFit` は上ライン（peaks）と下ライン（valleys）で別々に呼ばれるので、除去率はライン単位の量になる。**合算した除去率で見ると、当てはまりの良いラインが破綻したラインを覆い隠す:**

| 候補 | 上ライン | 下ライン | 合算 | 合算 50% 上限 | ライン単位 50% 上限 |
|---|---|---|---|---|---|
| `1day [15,50]` | **5/8（63%）** | 1/8（13%） | 6/16（38%） | 素通り | **棄却** |
| `4hour [40,88]` | 1/10（10%） | **8/12（67%）** | 9/22（41%） | 素通り | **棄却** |
| `1day [0,80]`（本件） | 6/15（40%） | **12/19（63%）** | 18/34（53%） | 棄却 | **棄却** |

`1day [15,50]` の「水平なレジスタンス」は 8 点中 3 点だけを根拠にしている。合算で見るとこれが下ラインの良さに薄まって通ってしまう。よって**どちらか一方でも上限を超えたら候補ごと棄却**する。棄却がどちら側で起きたかは debug の `exceededSide`（`upper` / `lower` / `both`）に出る。

#### 閾値 `maxOutlierRemovalRate = 0.5` の根拠（実データの分布）

BTC/JPY 日足 90 本を 3 時間足 × `swingDepth` 4 種 × オプション 8 通りで走らせ、**採用された三角形候補 27 件のライン単位除去率**を集計した:

| ライン単位の最大除去率 | 件数 | r2Upper / r2Lower の様子 |
|---|---|---|
| 0.58 〜 0.77 | 9 | **閾値 0.6 の直上に張り付く**（0.602 / 0.61 / 0.619 / 0.648 …）か、残り 3 点で 0.96 に跳ねる |
| 0.00 〜 0.50 | 18 | 0.87 〜 1.00 が大半 |

**0.50 と 0.58 の間が空帯**になっており、閾値はここに置ける。0.5 は「各ラインが自分のアンカー点の**半分以上**を残すこと」と言い換えられる。

- **0.5 より緩められない**: 本件（走査窓 `1day [0,80]`）が下ライン 0.632 なので、0.63 以上にすると落ちない
- **0.5 より厳しくできない**: 除去数 3 点の良質な候補 `1day [39,62]`（peaks 3/6）と、#141 が「捨てられている高整合度の候補」として挙げた `4hour [10,46]`（valleys 4/8、confidence 0.90）がちょうど 0.50。0.45 にするとこの 2 件を巻き添えにする
- 境界は**通す**側に倒した（ちょうど 50% は通る）。上の 2 件がその境界にいるため

時間足でスケールさせていない。除去率は本数ではなく割合なので、窓幅が変わっても意味が変わらない。

#### 実測（704 ケース比較）

`tests/detect_patterns_fixtures.test.ts` の **fixture 22 件 × オプション 8 通り（`includeForming` / `includeCompleted` / `includeInvalid`）× 時間足 2 種（`1day` / `1hour`）× `swingDepth` 2 種（2 / 3）= 704 ケース**を、`main`（24a7e93）と本ブランチの双方で走らせて突き合わせた（#131 / #132 / #135 / #136 / #139 / #140 と同じ手順・同じ 704 ケース）。

| 指標 | 結果 |
|---|---|
| 変化したケース | **0 / 704**。全ケース完全一致 |
| パターン総数 | 296 → **296**（種別内訳も全て不変） |
| 除去数の分布（before / after） | どちらも `{除去0: 23件, 除去1: 8件}`。**最大除去数 1** |

**0 / 704 は「上限が死んでいる」ことを意味しない。** 合成 fixture は三角形を意図した形で組んでいるため、除去率が最大でも 14.3%（1/7）にしか達しない。上限が全経路に配線されていることは **ablation で確認した**——定数だけを差し替えて同じ 704 ケースを走らせた結果:

| ablation | 変化したケース | パターン総数 | 内訳 |
|---|---|---|---|
| `maxOutlierRemovalRate` を 1（上限なし = main 相当）に | **0 / 704** | 296 → 296 | main と完全一致。**上限以外の挙動を変えていないことの確認** |
| `maxOutlierRemovalRate` を 0（1 点でも捨てたら棄却）に | **24 / 704** | 296 → **288** | `triangle_descending` 16 → **8**。`excessive_outlier_removal` が **272 件**立つ |

#### 実測（BTC/JPY 日足 90 本の実データ）

`tests/fixtures/btc_jpy_1day_2026.ts`（上記 704 ケースの外）を **時間足 3 種（`1day` / `4hour` / `1hour`）× `swingDepth` 4 種（既定 / 2 / 3 / 6）× オプション 8 通り = 96 ケース**で突き合わせた。合成 fixture と違い、実際の値動きなので除去が効く。

| 指標 | 結果 |
|---|---|
| 変化したケース | **32 / 96** |
| パターン総数 | 296 → **328** |
| 種別内訳 | `triangle_symmetrical` 96 → **112** / `triangle_ascending` 0 → **16**。三角形以外（double / triple / H&S / wedge / pennant）は **1 件も動かない** |
| 除去数の分布（before） | `{0:2, 1:9, 3:3, 4:1, 6:3, 9:1, 10:1, 12:1, 14:2, 15:1, 17:2, 18:1}`（採用候補 27 件・**最大 18**） |
| 除去数の分布（after） | `{0:2, 1:9, 3:3, 4:1, 6:2, 12:1}`（採用候補 18 件・**最大 12**） |

**総数が増えているのは、巨大な候補が dedup で他を押し出していたため。** 消えたのは 1 件だけで、その枠に質の高い候補が 3 件入った。

##### 消えた 1 件と、それが誤検出だった理由

| 消えたパターン | 期間 | confidence | 除去数 | r2 | 誤検出である理由 |
|---|---|---|---|---|---|
| `triangle_symmetrical` | 2026-05-29 → 2026-08-19（idx 0〜82） | 0.82 | **18 / 34**（下ライン 12/19 = 63%） | 0.602 / 0.648 | **走査窓 90 本のほぼ全域を 1 つの三角形が占める**（回帰した窓は idx 0〜80 の 81 本、報告される期間はブレイク足まで含めて idx 0〜82）。 収束形ではなく窓全体に回帰線を 2 本引いた状態で、`double_bottom`（idx 65/72/76）や `head_and_shoulders`（37/52/65/72）と完全に重なる同じ値動きの重複報告。r2 は閾値 0.6 の直上で、これは 18 点を捨てた後の値 |

##### 入れ替わりに残った 3 件（いずれも #141 が「捨てられている」と指摘したもの）

| パターン | 期間 | confidence | 除去数 |
|---|---|---|---|
| `triangle_symmetrical` | 2026-06-08 → 2026-07-14（idx 10〜46） | **0.91** | 6 / 15 |
| `triangle_symmetrical` | 2026-07-28 → 2026-08-18（idx 60〜81） | **0.87** | 1 / 9 |
| `triangle_ascending` | 2026-07-02 → 2026-07-21（idx 34〜53） | 0.71 | 1 / 8 |

##### `data.patterns` の before / after（`1day`・既定 `swingDepth`・`includeForming` + `includeInvalid`）

| before | after |
|---|---|
| `falling_wedge` 07-08→08-17（0.95） | `falling_wedge` 07-08→08-17（0.95） |
| **`triangle_symmetrical` 05-29→08-19（0.82）** | **`triangle_symmetrical` 06-08→07-14（0.91）** |
| — | **`triangle_symmetrical` 07-28→08-18（0.87）** |
| `double_bottom` 08-03→08-19（0.96） | `double_bottom` 08-03→08-19（0.96） |
| `double_bottom` 06-05→07-21（0.65） | `double_bottom` 06-05→07-21（0.65） |
| `head_and_shoulders` 07-06→08-10（0.78） | `head_and_shoulders` 07-06→08-10（0.78） |

三角形以外の 4 件は完全に不変で、窓全体を覆っていた 1 件が実際に収束している 2 件に置き換わっている。

**消えた候補（0.82）より高い confidence の候補が 2 件復活している。** #141 が「勝者選択の問題」として別 issue（#142）に切り出した症状は、少なくともこの実データでは本 PR で解消している。

##### 残る既知の限界

`1day` の ascending 候補（報告期間 idx 24〜82 の 58 本、上 6/12・下 6/14 = 上下ともちょうど 50%）は**上限を通る**。除去数は 12 点で、after の分布の最大値 12 はこれ。除去数の絶対値ではなく**割合**で切っている以上ここは残る——絶対数で切ると窓幅の広い正しい三角形まで落ちる。窓幅そのものを構造要件にする話は本 issue の範囲外なので手を付けていない。

ただし**最終出力には出ていない**——dedup が同じ区間のより質の高い候補を選ぶため、`data.patterns` に残るのは下表の 3 件（+ 三角形以外）である。あくまで候補段階に残るという話。

#### `view=debug` に除去率の分母を出した

`outlierPeaksRemoved` / `outlierValleysRemoved` は出ていたが**母数が無く、除去率が計算できなかった**（#141 の実測は `touchCount` から母数を逆算している）。採用候補の details に `peaksTotal` / `valleysTotal` を足した。棄却側（`excessive_outlier_removal`）には率そのもの（`upperRemovalRate` / `lowerRemovalRate`）と `maxOutlierRemovalRate` / `exceededSide` を出す。

#### `pivots` の同一 idx は**重複ではない**（#141 併記分。修正しない）

issue #141 は「`pivots` 34 点中ユニーク 33」を併せて報告していたが、実データを確認した結果**これは重複ではないと判断した**。

配列のキーは `idx` ではなく `(idx, kind)` である。`detect_triangles` は独自の relaxed swing（`swingDepth=1`）を使うため、**外側バー**（前後 2 本の値幅を包む足）は `high > 前後の high` と `low < 前後の low` を同時に満たし、高値としても安値としても極値になる。

実例は BTC/JPY 日足 fixture の idx=38（2026-07-06）:

| | idx 37 | **idx 38** | idx 39 |
|---|---|---|---|
| high | 10,320,632 | **10,470,583** | 10,419,235 |
| low | 10,080,000 | **9,952,759** | 10,146,602 |

`pivots` に入る 2 件は `kind: 'H'` が 10,470,583、`kind: 'L'` が 9,952,759 と**価格が違う**。dedup すると片方の極値が消える。`touchCount` が 2 と数えるのも同じ理由で、その足は上ラインを高値で、下ラインを安値で実際に触っている。**別 issue にも切らない**（挙動は正しい）。将来「重複」として再修正されないよう、`detect_triangles.ts` の `allPivots` 組み立て箇所にコメントで根拠を残し、`tests/patterns/outlier-cap-btcjpy.test.ts` で固定した。

なお #141 が挙げた 1hour / 4hour の例（`idx=[…,36,36,…]` / `[52,52,…]`）は当該の生データを持っていないため個別には確認していないが、同じ `swingDepth=1` の relaxed swing を通る同一の経路である。

### Fixed（`detect_patterns` の triple / H&S に構造ゲートを横展開した。**構造として成立しない形が減る**。#138 欠陥 2-1）

**#131 が double にだけ入れた「構造として成立していない候補は整合度の減点ではなく hard reject で落とす」という原則を、triple / H&S へ広げた。** #131 は `tools/patterns/structural.ts` に `validateReversalStructure` を切り出したものの、呼んでいるのは `detect_doubles.ts` だけで、「head_and_shoulders / triple への適用は本 PR では行っていない——検出件数への影響の確認が別途要るため」と明記して保留していた。本 PR はその回収。

ゲートが見るのは 2 つ（`structural.ts` の docstring が単一ソース。**閾値・判定式には一切触れていない**）:

- **戻り率**が帯 `[RETRACEMENT_MIN(0.2), RETRACEMENT_MAX(0.9)]` に入ること。1.0 超は「ネックラインが先行下落 / 上昇の起点の外」＝定義上そのパターンではないので固定 reject
- 第1構成点より前に、ネックライン水準を**終値で**抜けたバーが実在すること。無ければ「抜け返す」という事象が定義できない

#### 設計判断: 構成点 5 つに対する `first` / `mid` の取り方

double（谷1-山-谷2）では自明だが、triple（谷1-山1-谷2-山2-谷3）と H&S（左肩-谷1-頭-谷2-右肩）は構成点が 5 つあり、issue #138 が「先行トレンドの起点をどこの手前に取るか」を着手前の宿題にしていた。**`validatePatternSize`（#139）に渡す構成点列の先頭 2 点**に固定した（`tools/patterns/reversal-gate.ts` の冒頭に根拠）:

| 経路 | `side` | `first` | `mid` | ネックライン水準 |
|---|---|---|---|---|
| triple_top（strict / relaxed） | top | 山1 | 谷1 | `(v1.price + v2.price) / 2` |
| triple_bottom（strict / relaxed） | bottom | 谷1 | 山1 | `(p1.price + p2.price) / 2` |
| triple 形成中 | 同上 | 山1 / 谷1 | 谷1 / 山1 | `avgValley` / `avgPeakPrice` |
| H&S / 逆 H&S（strict） | top / bottom | 左肩 | 谷1 / 山1 | `(p1.price + p3.price) / 2` |
| H&S / 逆 H&S（relaxed） | 同上 | 左肩 | 谷1 / 山1 | `nlY`（水平線。`findHsBreakoutIdx` に渡すのと同一） |
| H&S / 逆 H&S 形成中 | 同上 | 左肩（先行谷 / 山が無ければ頭） | 先行谷 / 山（無ければ頭の後の谷 / 山） | `neckline[0].y` |

- **`first` は「先行トレンドが終わった点」**、**`mid` は「先行トレンドに対する最初の戻り」**。戻り率は `first → mid` の 1 脚で測る量なので、構成点が 5 つに増えても測る脚は変わらない。頭や第3構成点まで含めた全振幅で測ると「先行値幅に対する戻り」ではなく「パターン全体の大きさ」という別の量になる
- サイズ検査と**同じ配列の先頭 2 点**にしたので、形成中 H&S のように先行谷が取れず 3 点（頭-戻り-右肩）に縮む経路でも、縮んだ配列の先頭 2 点が自動的に正しい `first` / `mid` になる（実際にこの縮退経路で 1 件落ちている。下表 B）
- **ネックライン水準は検出器がブレイク判定に使うのと同じ値**を呼び出し側が渡す（#131 の `ReversalStructureInput.necklinePrice` の設計）。strict H&S だけはブレイク判定が p1 / p3 を結ぶ**傾きつき**の線なので、ゲートには 2 点の平均を渡している——ゲートは第1構成点より 60 本手前まで遡るので**スカラーの水準**が要り、傾きを外挿すると外挿誤差が水準そのものより大きくなり得るため。`validateHorizontalNeckline` が既に `|p1 - p3| <= HS_NECKLINE_MAX_PCT`(5%) を課しているので、平均が線の代表値になる

#### 設計判断: 谷ゾーン再進入（`detectTroughZoneReentry`）は**適用しない**

issue #138 が「triple は 3 つ目の谷が定義上存在するので、double の `reclassified_as_triple_bottom` と同じ判定が意味を成すか要検討」としていた件。**実測したうえで本 PR では適用しない判断にした。**

triple の第3構成点の後・ネックライン突破前について、double と同じ形（`first` = 谷1 / `mid` = 山1 / `second` = 谷3）で再進入を計測したところ、**704 ケースで accepted な triple の約半分（strict 経路で triple_top 32 / 64・triple_bottom 32 / 64）が「再進入あり」になった**。適用すれば構造ゲート本体（24 ケース）より大きな挙動変化になる。適用を見送った理由:

- **再分類先が無い。** double の再進入は `reclassify`（`detect_triples` に委ねて何も出さない）か `invalid` かに分岐するが、`reclassify` が成立するのは受け皿の `detect_triples` があるから。triple には `detect_quadruples` に相当する受け皿が無く、`invalid` として終端 status を新設するか黙って落とすかの二択になる——**status enum・ranking・aftermath に波及する別種の変更**
- **`mid` の取り方でゾーンの高さが変わる。** 再進入水準は `mid.extremePrice` から高さを出すが、triple のネックラインは 2 山（2 谷）の平均で、どちらの山を `mid` にするかで水準が動く。戻り率と違い、この選択を決める根拠がまだ無い
- **走査窓が double と非対称。** double は突破バーまでを見るが、`near_completion` の triple は最終足まで見ることになり、窓の長さだけで再進入率が上がる

計測値は上記のとおり残したので、着手する際は 0 から測り直す必要はない。

#### 実測（704 ケース比較）

`tests/detect_patterns_fixtures.test.ts` の **fixture 22 件 × オプション 8 通り（`includeForming` / `includeCompleted` / `includeInvalid`）× 時間足 2 種（`1day` / `1hour`）× `swingDepth` 2 種（2 / 3）= 704 ケース**を、`main`（049607f）と本ブランチの双方で走らせて突き合わせた（#131 / #132 / #135 / #136 / #139 と同じ手順・同じ 704 ケース）。

| | 結果 |
|---|---|
| 変化したケース | **24 / 704**（3.4%）。残り 680 は完全一致 |
| パターン総数 | **320 → 296**（-24） |
| 種別内訳 | `triple_bottom` 48 → **32** / `triple_top` 48 → **40** / 他 11 種はすべて不変（`head_and_shoulders` 16 / `inverse_head_and_shoulders` 16 / `double_top` 16 / `double_bottom` 16 / `triangle_symmetrical` 48 / `falling_wedge` 32 / `rising_wedge` 24 / `triangle_ascending` 16 / `triangle_descending` 16 / `bull_pennant` 16 / `bull_flag` 8） |
| 増えたパターン | **0 件** |
| status / 整合度 / `range` が動いた生存パターン | **0 件**（差分は削除のみ） |

**消えた 24 件は 3 つのパターンが 8 通りのオプションに現れたもの。** 実体は 3 つで、いずれも**三角形の fixture が triple として二重に読まれていたもの**:

| # | 種別 | 整合度 | 構成点 idx | fixture | 戻り率 | 誤検出である理由 |
|---|---|---|---|---|---|---|
| A | `triple_top` | 0.73 | 7 / 12 / 16 | `descendingTriangleInvalidBreakout`（1hour, ×8） | **1.000** | 下降三角形（水平な安値 100 前後・切り下がる高値 130 → 125 → 120）。ネックライン（谷の平均）が**先行上昇の起点そのもの**（idx 4 の安値 97）と一致する＝山1 に向かう上昇が丸ごと吐き出されており、先行上昇が存在しない。同じ窓の `triangle_descending` は**残る**（16 → 16） |
| B | `triple_bottom` | 0.73 | 7 / 14 / 21 | `formingAscendingTriangle`（1day, ×8） | **1.000** | 上昇三角形（水平な抵抗 127・**切り上がる安値** 112 → 114 → 117）。「3 つの谷が同水準」という triple の前提を満たしていないのに `near()` の許容で通っていた。ネックライン 127 は先行下落の起点（idx 4 の高値 130）と同水準。同じ窓の `triangle_ascending` は**残る**（16 → 16） |
| C | `triple_bottom` | 0.76 | 7 / 14 / 21 | `formingAscendingTriangle`（1hour, ×8） | **1.000** | B と同一実体の 1hour 側 |

3 件とも `retracement_out_of_band`（戻り率 1.0 > `RETRACEMENT_MAX` 0.9）で落ちる。**「三角形として正しく検出されている窓が、同時に反転パターンとしても報告される」という重複が消えて、三角形側だけが残った。**

#### 配線の網羅性（ablation）

704 ケースの生存パターンは**ほぼ全件が `skipped: 'no_prior_extreme'` で素通しされている**（合成 fixture はパターンの第1構成点がスキャン窓のほぼ先頭にあり、その手前に反対種別のピボットが無い）。閾値をいじる ablation では配線を確認できないため、`validateReversalStructure` を**常に不合格にする** ablation で全経路を確認した:

| ablation | 変化したケース | パターン総数 | 種別内訳 |
|---|---|---|---|
| `validateReversalStructure` が常に `ok: false` | 266 / 704 | 320 → **160** | `triple_top` 48 → **0** / `triple_bottom` 48 → **0** / `head_and_shoulders` 16 → **0** / `inverse_head_and_shoulders` 16 → **0**（+ double 16 / 16 → 0。#131 で配線済み）。三角形 / ウェッジ / 旗は 1 件も動かない |

**新設した 12 経路すべてを通っている**（通らない経路が残っていれば、その経路の検出が残存する）。棄却理由の内訳は `triple_top` 240 / `triple_bottom` 304 / `head_and_shoulders` 96 / `inverse_head_and_shoulders` 96 件。

#### 実測（実データ fixture）

`tests/fixtures/btc_jpy_1day_2026.ts`（BTC/JPY 日足 90 本、上記 704 ケースの外）を **`swingDepth` 4 種（既定 6 / 明示 2 / 3 / 6）× オプション 8 通り = 32 ケース**で突き合わせた。合成 fixture と違い、パターンの手前に実際のスイングがあるのでゲートが実際に判定に効く。

| | 結果 |
|---|---|
| 変化したケース | **18 / 32** |
| パターン総数 | **84 → 76**（-8） |
| 種別内訳 | `head_and_shoulders` 12 → **8** / `triple_top` 4 → **0** / 他は不変（`double_bottom` 24 / `inverse_head_and_shoulders` 8 / `falling_wedge` 16 / `triangle_symmetrical` 16 / `triple_bottom` 4） |
| 増えたパターン | **0 件** |
| status / 整合度が動いた生存パターン | **0 件** |
| `structureGate` が新たに付いた生存パターン | **20 件**（`head_and_shoulders` 8 / `inverse_head_and_shoulders` 8 / `triple_bottom` 4）＝ゲートが**適用されたうえで通っている** |

消えた 2 件と、それが誤検出だった理由:

| # | 種別 | status | 整合度 | 構成点 idx | 条件 | 棄却理由 | 誤検出である理由 |
|---|---|---|---|---|---|---|---|
| A | `triple_top` | completed | 0.75 | 9 / 17 / 24 | `swingDepth: 2`（×4） | `no_neckline_cross_before_peak1` | ネックライン 10,166,847 円（2 谷の終値平均）が**山1 の終値 10,159,661 円より上**にある。山1 より前の 60 本でこの水準を終値で上抜けたバーが 1 本も無く、「下抜け」という事象が定義できない。山1 は高値 10,290,000 円でネックラインを超えるが**終値は超えない**——ヒゲだけで立った山。戻り率 0.747 は帯の中なので、落ちたのは交差の不在 |
| B | `head_and_shoulders` | forming | 0.63 | 47 / 53 / 66 / 73 | `swingDepth: 3`（×4） | `neckline_below_pre_decline_low` | 左肩 47 と頭 53 の間に谷ピボットが無く、サイズ検査ともども**頭-戻り-右肩の 3 点に縮退**する（`first` = 頭）。頭への上昇は 851,964 円（起点 idx 45 の安値 10,051,036 円）なのに、頭から谷までの下落は 1,150,754 円で**戻り率 1.351**。ネックライン 10,002,960 円は上昇の起点より**下**にあり、割ったところで「上昇を支えていた水準を割った」ことにならない |

**#139 が「実在する H&S を落としていないことの確認」として固定した形成中 `head_and_shoulders`（左肩 idx 38 / 頭 53 / 谷 66 / 右肩 73、整合度 0.78）は既定 `swingDepth` で残る。** しかも**素通しではなくゲートを通って残る**（戻り率 0.766 / 先行極値 idx 33 @ 9,401,000 / ネックライン交差 idx 9）。B で落ちるのは**同じ頭・谷・右肩を左肩 idx 47 で読んだ縮退版**で、5 点そろう読みは残り、3 点に縮んだ読みだけが落ちる関係になっている。

`double_bottom` は **32 ケースすべてで main と完全一致**（谷 8/3 → 山 8/10 → 谷 8/14、整合度 0.96、戻り率 0.528）。#131 で配線済みの double には触れていない。

- **`view=debug` の棄却理由**は double と同じコード（`retracement_out_of_band` / `neckline_above_pre_decline_high` / `neckline_below_pre_decline_low` / `no_neckline_cross_before_trough1` / `no_neckline_cross_before_peak1`）で `candidates[].reason` に出る。`details` に `retracementRatio` / `priorExtremeIdx` / `priorExtremePrice` / `firstIdx` / `midIdx` / `necklinePrice` を載せたので、**どの脚をどう測って落としたか**が呼び出し側で検算できる。通った候補は `PatternEntry.structureGate` に同じ値が出る（schema は #131 の時点で全種別共通）。
- **配線層は `tools/patterns/reversal-gate.ts` に新設した。** `structural.ts`（純粋関数）は `debugCandidates` も `PatternEntry` も知らないままにしてある。判定ロジックは持たず、戻り値を棄却理由と `structureGate` に変換するだけ。
- **どの経路でも「既存の棄却検査をすべて通過した後」（`validatePatternSize` の直後）に置いた。** 理由は #139 と同じで、前に置くと既に固有の理由コードを持つ候補の `reason` を横取りする。ネックライン水準の算出だけは副作用が無いのでゲートの手前へ引き上げてある。
- **`tests/patterns/size-gates-triple-hs.test.ts` の過剰棄却の回帰テストを書き換えた。** 旧版は「振幅 15.4% の**純粋なレンジ往復**なら triple_top / triple_bottom が返る」ことを見ていたが、先行トレンドの無いレンジは本 PR の構造ゲートで落ちる（戻り率がちょうど 1.0 になる）。**落ちる理由がサイズ検査から構造ゲートに移っただけ**なので、サイズ検査の過剰棄却は「サイズ系の理由コード（`pattern_too_small` / `valley_too_shallow` / `peak_too_shallow`）が 1 件も出ないこと」で直接見るように変えた。期待値を緩めたのではなく、測る対象を理由コードに寄せてある。
- ガードは `tests/patterns/structural-gates-triple-hs.test.ts`（8 本）。合成側は**先行下落 → 3 点の底 → ネックライン上抜け**という反転の形を作り、(1) その `triple_bottom` が残って `structureGate.retracementRatio` が帯の中に出ること、(2) **同じ窓の逆向きの読み（`triple_top`）が戻り率 1.0 で落ちること**を固定する（top / bottom 対称に 2 組）。issue #138 欠陥 2 の「同一の窓で triple_top と triple_bottom が両方検出される」がこの形で解消される。閾値そのものの妥当性は合成では担保できないので、上表 A / B と #139 の H&S を実データ側で固定した。
- **本 PR は #138 欠陥 2-1 のみを扱う。** 欠陥 1 / 項目 2（triangle の per-line タッチゲート）は**実測で片側偏重が観測できなかったため着手しない判断**、項目 3（タッチ / 同水準の判定基準がパターン高さに対して転倒している）は影響範囲が大きいため対象外。#138 は項目 3 が残るので閉じない。

### Fixed（`detect_patterns` の triple / H&S にサイズ検査を追加した。**小さすぎる形が減る**。#138 欠陥 2-2）

**高さ 1.6% のレンジ往復が `triple_top` と `triple_bottom` として同時に検出されていた。** `detect_doubles.ts` だけが `MIN_PATTERN_HEIGHT_PCT`（3%）/ `MIN_DEPTH_PCT`（5%）のサイズ検査を持ち、`detect_triples.ts` / `detect_hs.ts` には相当する検査が 1 つも無かった（#130 の調査で確認済み）。**double なら弾かれる小ささでも triple / H&S は通る**状態で、レンジ相場の上端と下端が別々に拾われて反転パターン 2 つとして報告される。

issue #138 が観測した実例（BTC/JPY 1時間足, 2026-08-27）は `triple_top`（idx 40/49/59）と `triple_bottom`（idx 26/46/54）が idx 40〜54 で重なっており、実体は 12,521,114〜12,726,672 の約 1.6% レンジの往復。`triple_bottom` のパターン高さは 1.66% で、**double の閾値なら弾かれている**。

- **定数と検査本体を `tools/patterns/structural.ts` に引き上げた。** `MIN_PATTERN_HEIGHT_PCT` / `MIN_DEPTH_PCT` は `detect_doubles.ts` のローカル定数だったものをそのまま移設（**値は変えていない**）。double は自分の `validateTopSize` / `validateBottomSize` を持ったまま定数だけを import する——検出結果を 1 件も動かさないため、式には触れていない。新しい `validatePatternSize(side, points)` を triple / H&S が使う。
  - **パターン高さ**は全構成点の最大 − 最小。issue #138 が実例の高さを「12,734,408 − 12,526,411 ≈ 1.66%」と全振幅で測ったのに合わせた
  - **戻りの深さ**は内側の点それぞれを**その両隣の平均**と比べる。double の `peakAvg = (a + c) / 2`（谷を挟む 2 山の平均）を構成点が増えた場合へ延長したもので、3 点なら double の式に一致する。山の全体平均にしないのは、**H&S で頭が平均を押し上げて肩-ネックライン間の浅さを隠す**ため
  - 価格基準は `Pivot.extremePrice`（高安）。値幅の評価だからで、#131 / #132 の結論（値幅系は `extremePrice`、水準同一性とライン系は終値）の横展開。形成中の 3 点目 / 暫定右肩は極値判定を通っていないので `extremePrice = 現在足の終値` で渡す（既存の形成中 H&S の暫定右肩と同じ扱い）
- **配線は 12 箇所**（triple: strict / relaxed / forming の top・bottom 各 3 = 6、H&S: 同じく IHS 含めて 6）。
- **どの経路でも「既存の棄却検査をすべて通過した後」に置いた。** 前に置くと、既に固有の理由コードを持つ候補の `reason` を横取りして `view=debug` の診断が変わる（実際、最初に前へ置いた版では `forming_neckline_not_horizontal` を検査していた既存テストが `valley_too_shallow` に化けて落ちた）。この位置なら **「これまで accepted だった候補だけを落とす」ことが位置から保証される**。
- 棄却理由コードは double と同じ命名（`pattern_too_small` / `valley_too_shallow` / `peak_too_shallow`）で `view=debug` の `candidates[].reason` に出る。

#### 実測（704 ケース比較）

`tests/detect_patterns_fixtures.test.ts` の **fixture 22 件 × オプション 8 通り（`includeForming` / `includeCompleted` / `includeInvalid`）× 時間足 2 種（`1day` / `1hour`）× `swingDepth` 2 種（2 / 3）= 704 ケース**を、`main`（cfe24ef）と本ブランチの双方で走らせて突き合わせた（#131 / #132 / #135 / #136 と同じ手順・同じ 704 ケース）。

| | 結果 |
|---|---|
| 変化したケース | **0 / 704**。全ケース完全一致 |
| パターン総数 | **320 → 320**（増減なし） |
| 種別内訳 | `triple_top` 48 → 48 / `triple_bottom` 48 → 48 / `head_and_shoulders` 16 → 16 / `inverse_head_and_shoulders` 16 → 16 / `double_top` 16 → 16 / `double_bottom` 16 → 16 / `triangle_symmetrical` 48 / `falling_wedge` 32 / `rising_wedge` 24 / `triangle_ascending` 16 / `triangle_descending` 16 / `bull_pennant` 16 / `bull_flag` 8（いずれも不変） |
| 消えたパターン | **0 件**（したがって「誤検出だった理由」を要する 1 件も無い） |

**0 / 704 は「ゲートが死んでいる」ことを意味しない。** 合成 fixture は `100 → 130` のように**振幅が 20〜30% ある系列**ばかりで、3% / 5% の下限を全ケースで大きく上回る。ゲートが全経路に配線されていることは **ablation で確認した**——定数だけを差し替えて同じ 704 ケースを走らせた結果:

| ablation | 変化したケース | パターン総数 | 出た棄却理由 |
|---|---|---|---|
| `MIN_PATTERN_HEIGHT_PCT` を 0.99 に | 140 / 704 | 320 → **160** | `pattern_too_small`: triple_top 240 / triple_bottom 304 / H&S 96 / IHS 96（+ double 3,168） |
| `MIN_DEPTH_PCT` を 0.99 に | 132 / 704 | 320 → **168** | `valley_too_shallow` / `peak_too_shallow`: triple_top 240 / triple_bottom 304 / H&S 96 / IHS 96（+ double 1,584） |

どちらの ablation でも `triple_top` / `triple_bottom` / `head_and_shoulders` / `inverse_head_and_shoulders` が **48 / 48 / 16 / 16 → すべて 0** になる。704 ケースで検出されるこれら 4 種は**全件が新しいゲートを通っている**（通らない経路が残っていれば残存する）。

#### 実測（issue の実例に相当する系列）

実 API を叩けないため、issue #138 の実例と**同じ構造**の系列を合成して測った（谷 12,525,000 / 山 12,720,000 を 10 本ずつで往復する 91 本、`1hour`、`includeForming` + `includeCompleted`）。全振幅 1.55% で、実例の 1.6% と同水準。

| | main（cfe24ef） | 本ブランチ |
|---|---|---|
| 返るパターン | **5 件** | **0 件** |

消えた 5 件と、それが誤検出だった理由:

| # | 種別 | status | 整合度 | 構成点 idx | 誤検出である理由 |
|---|---|---|---|---|---|
| 1 | `triple_top` | near_completion | 0.91 | 10 / 30 / 50 @ 12,720,000 | 実体は 1.55% レンジの上端。**同じ系列の下端が #3 / #4 として `triple_bottom` にもなっており、1 本の系列が上下両方向の反転パターンを名乗る**。パターン高さ 1.55% < 3% |
| 2 | `triple_top` | near_completion | 0.91 | 30 / 50 / 70 @ 12,720,000 | 同上。#1 と 1 山ずらしただけの同一レンジ |
| 3 | `triple_bottom` | near_completion | 0.91 | 20 / 40 / 60 @ 12,525,000 | 同じレンジの下端。#1 / #2 と期間が重なる |
| 4 | `triple_bottom` | near_completion | 0.91 | 40 / 60 / 80 @ 12,525,000 | 同上。#3 と 1 谷ずらしただけ |
| 5 | `triple_top` | forming | 0.59 | 50 / 70 + 現在足 | 上と同じ上端を形成中として重複報告したもの |

**5 件とも `pattern_too_small`（高さ 1.55% < 3%）で落ちる。** 同じ系列で `double_top` / `double_bottom` も **main の時点から同じ `pattern_too_small` で落ちている**——「double なら弾かれる小ささが triple では通る」という issue の指摘そのものが、この 1 系列の中で確認できる。

#### 実測（実データ fixture）

`tests/fixtures/btc_jpy_1day_2026.ts`（BTC/JPY 日足 90 本、上記 704 ケースの外）は `includeForming` × `includeInvalid` の 4 通りすべてで **main と完全一致**。とくに形成中 `head_and_shoulders`（左肩 10,373,443 / 頭 10,849,999 / 谷 10,002,960 / 右肩 10,191,324、整合度 0.78）は**残る**——実在する H&S を落としていないことの確認。

- ガードは `tests/patterns/size-gates-triple-hs.test.ts`（`validatePatternSize` の単体検査 7 本 + 上記 1.55% 系列で triple が出ないこと・棄却理由が `view=debug` に出ること + **同じ形状で振幅を 15.4% に広げれば triple が出続けること**（過剰棄却の回帰））。合成データなので閾値そのものの妥当性は担保できない（閾値に合わせて作れてしまう）。固定しているのは「double と同じ値で弾かれること」と「弾く方向に振りすぎていないこと」の 2 点。
- **本 PR は #138 の欠陥 2-2 のみを扱う。** 欠陥 1（triangle の per-line タッチゲート）、記録 A（タッチ / 同水準の判定基準がパターン高さに対して転倒している）、欠陥 2-1（構造ゲートの triple / H&S 横展開）には手を付けていない。#138 の訂正コメントが定めた優先順で最優先の 1 件。

### Changed（`detect_patterns` の三角形の分類前 candidate ラベルを umbrella 化した。**`data.patterns` は変わらない**。#129）

- **`view=debug` の `candidates[].type` が変わる。** `detect_triangles` は 3 種（ascending / descending / symmetrical）の分類が確定する**前**にも候補を棄却するが、その 2 箇所（`poor_trendline_fit` / `classification_failed`）が `type: 'triangle_symmetrical'` をハードコードしていた。対称三角形とは限らない候補に対称三角形のラベルが付くため、`tools/patterns/candidate-filter.ts` の絞り込みで落ち、**`patterns=["triangle_ascending"]` / `["triangle_descending"]` には分類前の棄却理由が 1 件も届かなかった**（検出器は実際に走査・棄却している）。umbrella ラベル `'triangle'` に変えた。`CANDIDATE_LABEL_COVERAGE.triangle` が三角形 3 種を覆うので、3 種のどれを要求しても届く。
  - **実測**（fixture 22 件 × オプション 8 通り × 時間足 2 種 × `swingDepth` 2 種 × `patterns` 7 通り = **4,928 ケース**を変更前後でダンプ）:

    | | 変更前 → 変更後 |
    |---|---|
    | `data.patterns` の差分 | **0 ケース**（全ケースで deep equal） |
    | `patterns` 未指定の candidates | 件数・`accepted` / `reason` / `indices` の列とも **完全一致**。`type` 文字列のみ `triangle_symmetrical` 756 → `triangle` 480 + `triangle_symmetrical` 276 |
    | `patterns=["triangle_ascending"]` | 108 件 → **1,020 件**（`poor_trendline_fit` 480 / `classification_failed` 432 が新たに届く） |
    | `patterns=["triangle_descending"]` | 80 件 → **1,088 件**（同 480 / 528） |
    | `patterns=["triangle_symmetrical"]` / `["triangle"]` | 件数不変（1,012 / 944。umbrella ラベルが同じ集合を覆うため） |

- **あわせて棄却理由を `classification_failed` と `type_not_requested` に分けた（レビュー指摘）。** 分類判定（`detect_triangles.ts`）は `want` をゲートに含んでいる——`flatThreshold`(0.03) > `moveThreshold`(0.015) なので `upperFlat` と `upperFalling` は同時に真になりうる（相対傾き -0.03〜-0.015）。1 つの窓が複数の分岐条件を満たすため、`want` を外すと**選ばれる型が変わる**（= `patterns` 指定の有無で検出結果が変わる）。したがって `triangleType === null` には「形が成立しない」と「形は成立するが要求外」が混ざる。
  - umbrella ラベル化の前は後者もフィルタで落ちていたが、**ラベルを `'triangle'` にした結果それが通過し、正常に分類できる窓が `classification_failed` として届くようになっていた**（`patterns=["triangle_ascending"]` に対称三角形の窓が「分類失敗」で届く）。可観測性を上げるはずの変更が偽の理由を足していた。
  - `want` を外した分類を**別に**取って振り分ける形にした。形が成立する → `type_not_requested` を**具体型ラベル**で積む（`detect_wedges` の同名 reason と同じ idiom。要求外の型なので候補フィルタで落ち、要求した型のノイズにならない）。形も成立しない → `classification_failed` を umbrella ラベルで積む。**検出に使う `triangleType` は `want` ゲート込みのまま**なので `data.patterns` は 1 件も動かない。
  - 実測（同じ 4,928 ケース）: 偽の `classification_failed` が `patterns=["triangle_ascending"]` で 432 → **0 件**、`["triangle_descending"]` で 528 → **0 件**、`["triangle_symmetrical"]` で 224 → **0 件**。本来の目的だった `poor_trendline_fit` 480 件は 3 種すべてに届いたまま。`patterns` 未指定の candidates は件数・理由コードとも main から不変（全種別が要求されているので `type_not_requested` は 1 件も出ない）。
  - **`want` ゲートを外して分類を独立させる案は採らなかった。** 分岐条件が重なる以上、`patterns` 指定の有無で `data.patterns` が変わる検出セマンティクスの変更になる。本エントリの受け入れ条件（検出結果ゼロ変更）を外れるため、`want` ゲート自体は維持し、理由コードの振り分けだけを直した。
  - **`candidate-filter.ts` 側で `triangle_symmetrical` を 3 種に被覆させる案は採らなかった。** それをすると対称三角形を要求していない呼び出しに、分類**後**の棄却・採用まで含む対称三角形の候補が返ってしまい、規約「`want` に含まれない種別の candidate が出ない」に反する。直すのはラベル側。
  - **#128 で分けた理由と、今回実施できる理由。** #128 の受け入れ条件は「`patterns` **未指定**時の candidates が変更前と同一」で、`type` 文字列が変わるラベル変更はこれに抵触した。本エントリはその制約を持たないので実施できる（**件数と理由コードは不変**、変わるのは `type` 文字列のみ）。
  - **`detect_wedges` は対象外。** #129 と `candidate-filter.ts` の docstring は「`detect_triangles` / `detect_wedges` が具体型で積んでいる」と書いていたが、`detect_wedges` の該当 push は `validateRegressionCandidate` の引数 `wedgeType`（`'rising_wedge' | 'falling_wedge'`）で、呼び出し元で**分類済み**。ラベルは実際の型と一致している。docstring を実態に合わせて訂正した。
  - **別のラベルずれを見つけたが、本 PR では直していない。** `detectRegressionWedges`（`tools/patterns/detect_wedges.ts`）には**同じ傾き推定でラベルを決めている push が 2 箇所**あり（`r2_below_threshold` と `type_classification_failed`）、どちらも傾きの向きが揃わない窓を `triangle_symmetrical` として積む。**ウェッジ走査の棄却なのに三角形のラベルが付く**ため、`patterns=["triangle_symmetrical"]` にウェッジ窓の棄却が混ざり、`patterns=["rising_wedge"]` / `["falling_wedge"]` からは同じ棄却が抜ける。#129 は「分類前の棄却に umbrella ラベルを使う」話でこちらは「別種別のラベルを流用している」話なので原因が違い、直すには umbrella の `'wedge'` を `PatternFilterEnum` に足すか（公開契約の追加）を先に決める必要がある。`docs/tools.md` と `candidate-filter.ts` の docstring に既知として明記するに留めた（**2 箇所とも直す必要がある**ことも併記した——片方だけ直すと同じ推論が残って症状が半分だけ残る）。
  - ガードは `tests/patterns/candidate-filter.test.ts`（umbrella ラベルが同ファミリの出力 type を接頭辞で過不足なく覆うドリフト検出）と `tests/detect_patterns_debug.test.ts`（分類前の棄却が具体型で積まれていないこと / 具体型ラベルに分類前の理由が付かないこと / `patterns` 未指定と `patterns=["triangle"]` で三角形系候補の件数・理由コードが一致すること）。

### Changed（#127 の残り: プロンプトの `limit` 判定と CI ジョブ名の注記。**挙動変更なし**）

- **`src/prompts/intermediate.ts` の「中級：BTCのパターン分析をして」の `limit=180` は据え置いた。** #114 以前この呼び出しは指標 warmup 込みの 379 本を走査していて、実効的な観測期間が 379 → 180 本に半減していた。`limit=180` と `limit=360` を比較して判定した結果、**このプロンプトのオプションでは出力が一致する**。
  - 決め手は `requireCurrentInPattern=true` + `currentRelevanceDays=80`。`range.end` が 80 日以内のものしか残らず、1day で検出されうる span は有界（形成中 double 148 本 / 形成中ウェッジ 138 本 / 完成済みウェッジ・三角形の窓 90 本 / flag・pennant 46 本。`patterns/bar-thresholds.ts`）なので、**形成中は最大 149 本、完成済みは「経過 80 + 窓 90」= 170 本**あれば足りる。どちらも 180 に収まる。
  - **span が有界な種別については 360 本にしても結果は増えない**——増える検出は `range.end` が 80 日より古く、プロンプト自身の relevance フィルタが落とす（合成系列 6 本で実測。フィルタを外すと 360 側だけ 241 本前のパターンが 1 件増える）。
  - **ただし「360 でも必ず同じ答え」ではない（レビュー指摘）。** 完成済み double / triple / H&S は構成点間隔に上限が無く、relevance フィルタが見るのは `range.end` だけなので、**構成点が 180 本超にまたがっていて `range.end` が直近 80 日以内**というパターンは 360 でだけ出る。180 に対する 360 の増分はここに限られる。
  - それでも据え置くのは、そのマクロなパターンがこのプロンプトの対象ではないため（「完成後80日超 → 無視」「完成後40日超 → 最大🟡中」という核心ルールは直近の形を見る設計で、数ヶ月にまたがる構成点の大型パターンを扱うなら `currentRelevanceDays` ごと設計し直す話になる）。全呼び出しの取得コストを倍にして得られるのがその一種類だけなら割に合わない。判定の根拠はプロンプト定義の直上にコメントとして残した。
- **`.github/workflows/ci.yml` の唯一のジョブ名 `typecheck` にコメントを入れた。** このジョブは lint / format-check / banned-patterns / `npm test` / `test:coverage` をすべて実行しており、**チェック名が実態を過小に表しているせいで「CI でテストが走っていないのでは」と実際にレビューで誤解された**（PR #131）。`ci` 等への改名はブランチ保護の required check 名に影響し、リポジトリ設定の更新とセットでないと PR がマージ不能になるため、**本 PR では改名しない**。名前を据え置く理由をワークフローに明記するに留めた。
- **CHANGELOG の `[Unreleased]` は集約ではなく索引にした**（本セクション冒頭「読む順」）。各エントリの本文には却下案と実測が入っていて、要約すると根拠が落ちるため。

### Changed（構造的ピボット間隔の床（`STRUCTURAL_PIVOT_GAP_FLOOR_BARS = 5`）の妥当性を実測で判定し、据え置きを確定した。**検出結果は変わらない**。#134）

**床を外した場合の増分 +72 件を 1 件ずつ判定した結果、誤検出側が多数（ケース数で 誤検出・冗長 48 / 灰色 16 / 正しい検出 8）だったため、値は据え置いた。** コード変更は docstring のみ（#132 が「未検証」と明記していた箇所を判定結果で置き換えた）。`docs/tools.md` の 2 表・`patterns/min-bars.ts` の導出値・到達性テストは値が変わらないため更新なし。

#### 実測（704 ケース比較の再実施）

`pivotGapBars = minBarsBetweenSwings`（床なし）でビルドし、PR #131 / #132 / #135 と同じ **fixture 22 件 × オプション 8 通り × 時間足 2 種 × `swingDepth` 2 種 = 704 ケース**を `main`（24db879）と突き合わせた。床が効く経路はすべて `structuralFloorBars`（= `assessScanWindow(0, …).minViableLimit`）経由で、床を外すと構造的下限が `1day` 23 → 21 / `1hour` 17 → 11、上限の基数 `patternBarsCap` が `1day` 46 → 42 / `1hour` 34 → 22 に縮む。

| | 値 |
|---|---|
| パターン総数 | 320 → **392**（純増 **+72**。#132 時点の切り分け実測 312 → 384 と同じ増分） |
| 純増の実体 | **9 パターン × オプション 8 ケース = 72** |
| 既存パターンの range 付け替え | **10 実体 × 8 = 80 ケース**（wedge / triangle の窓サイズ集合が変わり開始 / 終了がずれる。種別・status・件数は不変） |
| 整合度のみの変化 | **8 ケース**（`DescendingTriangleInvalidBreakout` 1day の invalid triangle、0.82 → 0.85） |

#### 純増 9 実体の判定（種別 × 時間足 × fixture）

| 種別（status, 整合度） | 時間足 | fixture | 判定 | 根拠 |
|---|---|---|---|---|
| double_bottom（forming, 0.93） | 1hour | FormingDoubleBottom | **正しい（唯一）** | 1day で検出済みの同一構成点（谷 77 / 78 = Δ0.99%、山 104、ネックライン 101、formationBars 25）。1hour は形成バー数下限が cap に吸収されて 34 本になっており、床なしで 22 本に下がると通る |
| rising_wedge（forming, 0.90） | 1hour | AsymmetricNecklineIHS | 誤検出 | 素の安値列 80 → 64 → 80 は切り上がっておらず、平滑化後の回帰だけが成立させる。データは hard reject 済みの非対称ネックライン逆三尊 |
| triangle_ascending（forming, 0.64） | 1hour | RectangleRange | 誤検出 | 「三角形と誤検出しない」ことを固定するための矩形 fixture（安値 97〜99 は水平）。三角形の最小窓 17 → 11 で 12 本窓（idx 9..20）が走査対象になり、ノイズ傾きが「上昇サポート」に化ける |
| triangle_symmetrical（completed, 0.75） | 1day | AsymmetricNecklineHS | 誤検出寄り | H&S の谷1-頭-谷2-右肩（97 / 143 / 105 / 123）をタッチ 2+2 の最小構成で三角形と読み替えたもの。下方「ブレイク」は H&S 完成の値動きそのもの |
| triangle_symmetrical（completed, 0.67） | 1day | CompletedHeadAndShoulders | 誤検出（冗長） | 同一区間に head_and_shoulders completed（整合度 0.99）が既に居る。頭 → 右肩（143 → 129 / 谷 107 → 109）への重複ラベル |
| triangle_symmetrical（completed, 0.91）× 2 実体 | 1hour | BullPennantSuccess / BullPennantFailure | 灰色 | 収束・タッチ交互は本物（高値 168 → 160.8 切り下げ / 安値 151 → 154 切り上げ）だが、正しいラベルは 1day と同じ bull_pennant。1hour では旗竿 6 本 < `poleMinBars` 22 で pennant が床の有無と無関係に到達不能なため三角形として出る。Failure 側は下方ブレイクが「success」になり、pennant の「failure（ダマシ）」と意味が逆転する |
| triple_top（forming, 0.59） | 1day | FormingAscendingTriangle | 誤検出（冗長） | 同 fixture には triple_top near_completion（0.98、127 の水平レジスタンス 3 山）が既に居る。同じレジスタンスの後ろ 2 山（idx 11 / 18）だけを取り直した低整合度の重複。範囲重複 36% で `globalDedup`（70% 閾値）を素通しする |
| triple_top（forming, 0.59） | 1hour | UptrendThenFakeDoubleBottom | 誤検出寄り | 上昇トレンド終端の 2 山 245 / 246（山1 はレジスタンス拒否の実績が無いトレンド終端）に対し、直近終値 248 が既に両山の上。3 山目の拒否を予告する forming として弱い |

#132 の切り分け（「増加は double と無関係」）への補足: #132 で検出器のピボット間隔を `ctx.minDist` に統一した後の現行 main では、増分に 1hour の forming double_bottom（上表 1 行目）が 1 実体加わる。

#### 据え置きの帰結と残した観測

- 唯一の正しい検出（1hour の形成中 double）を塞いでいる直接の壁は床そのものではなく、**日数 → バー換算が intraday で cap（= 床 × 2）に吸収され、形成バー数の「下限」が cap と同値になる**こと（`patternBarRange('1hour', 14, 90)` の minBars = 34 は `raw 336` のクランプ結果）。床を動かさずに intraday の形成バー数下限だけを狙って直す余地はある（#118 系の残件として観測のみ。実装しない）。
- あわせて **#125 後半（`priceBasis: "close" | "extreme"` パラメータ）は導入しない**と判断した（根拠は #125 のコメント）。#131 / #132 で価格基準は判定カテゴリごとに固定済み——値幅系（サイズ検査・戻り率・谷ゾーン）は `extremePrice`、水準同一性（同水準判定）とライン系（ネックライン・ブレイク確認）は終値。この使い分け自体が #131 の実測から導かれたもので、パイプライン全体を単一基準に切り替えるパラメータはその実測結果と両立しない。

### Fixed（`detect_patterns` の dedup が status を見ず、形成中が完成済みを押し出していた。#133）

**`includeForming: true` + `includeCompleted: true` のとき、同一構成点に完成済みと形成中の両方が成立すると、ネックライン突破が確定済みでも形成中だけが返っていた。** BTC/JPY 日足の実データ（構成点 8/3 → 8/10 → 8/14、突破 8/19 = idx 82）で、明示的に完成済みを要求した呼び出し側が `forming`（整合度 1.00）を受け取り、完成済み（同 0.96）は捨てられていた（#132 で「既知の不整合」としてテストに凍結していたもの）。

原因は同じツール内で優先順位の規則が食い違っていたこと。`rankPatterns`（`patterns/ranking.ts`）は `statusScore` を最優先するが、その**前段**で走る dedup 2 つが status を一切見ていなかったため、rankPatterns に届く前に完成済みが捨てられていた。両方の勝者選択に statusScore を最優先で入れた:

| 関数 | 旧 | 新 |
|---|---|---|
| `deduplicatePatterns`（各検出器内） | **`range.end` が新しい** → confidence → 高さ | **statusScore** → `range.end` が新しい → confidence → 高さ |
| `globalDedup`（全種別統合後） | **confidence** → `range.end` が新しい | **statusScore** → confidence → `range.end` が新しい |

- `deduplicatePatterns` の `range.end` 最優先は、形成中の `range.end` が常に最新足（完成済みは突破確定足）である以上、**形成中が構造的に必ず勝つ**規則だった。statusScore の後ろに下げ、**同 status 内でのみ**「より新しい形を採る」という元の意図を残した。同 status どうしの勝者は旧実装と完全に一致する。
- **`statusScore` は `ranking.ts` から export して単一ソース化した**（completed=3 / 未設定=2 / forming・near_completion=1 / invalid・expired=0）。dedup 2 関数と `rankPatterns` の 3 箇所が同じ関数を参照し、スケール自体は `tests/patterns/ranking.test.ts` で固定した。
- 着手前の切り分け（issue の指示）: 実データの double_bottom を捨てていたのは **`globalDedup`**。doubles は形成中候補を `deduplicatePatterns` の**後**に追加するため、そこでは衝突しない。一方 triangle / wedge / pennant は `includeForming: true` のとき形成中と完成済みが `deduplicatePatterns` を**一緒に**通るので、`globalDedup` だけ直すと種別によって規則が食い違う。**両方を同時に揃えた。**

#### 検出結果の変化量（全 fixture 前後比較）

`tests/detect_patterns_fixtures.test.ts` の fixture 22 件 × オプション 8 通り × 時間足 2 種 × `swingDepth` 2 種 = **704 ケース**を、`main`（161645b）と本ブランチの双方で走らせて突き合わせた結果（#131 / #132 と同じ手順・同じ 704 ケース）。

| | 値 |
|---|---|
| 変化したケース | **0 / 704**。全ケース完全一致 |
| パターン総数 | 320 → **320**（種別内訳も完全一致） |
| status が変わった件数 | **0 件** |

合成 fixture には同一構成点で形成中と完成済みが同時に成立するケースが 1 つも無いため、dedup の規則変更は現れない（#132 が「実データは 704 ケースの外」と記録したのと同じ関係）。

**実データ（`tests/fixtures/btc_jpy_1day_2026.ts`、90 本 × オプション 8 通り × `swingDepth` 2 種 = 16 ケース）では 4 ケースが変化した。** すべて `swingDepth: 3` かつ `includeForming: true` の側（この fixture の完成済み double_bottom は `swingDepth: 2` ではピボット列が変わり検出されないため、衝突自体が起きない）:

| ケース | before | after | 正当性 |
|---|---|---|---|
| `includeForming: true` + `includeCompleted: true`（± `includeInvalid` の 2 ケース） | forming の double_bottom（整合度 1.00、`range.end` 8/26、突破なし） | **完成済みの double_bottom（整合度 0.96、突破 8/19 = idx 82、status 未設定）** | #133 の症状そのもの。突破が確定した構造を「形成中」と報告するのは事実に反し、`rankPatterns` の定義（completed 系 > forming）とも矛盾していた |
| `includeForming: true` + `includeCompleted: false`（± `includeInvalid` の 2 ケース） | forming の double_bottom（同上。ほか 2 種の forming と計 3 件） | **double_bottom は返らない**（ほか 2 種の forming は従来どおり） | dedup で完成済みが勝ち、`includeCompleted: false` の status フィルタで落ちる。この forming 候補は**突破が 8/19 に確定済みの構造**を「まだ形成中」として報告する stale な像で、「形成中の double_bottom は存在しない」が正しい情報。形成中だけを購読する呼び出し側に、完成した構造を形成中と偽って出し続けるほうが有害 |

status が変わったのは **forming → 完成済み（status 未設定）が 1 実体 × 2 ケース**。消えた / 増えたパターンは上表の 4 ケース以外に無い。**`includeForming: false` の既定挙動は 704 + 16 の全ケースで不変**（実データの完成済み double_bottom が既定で突破 8/19 として返ることも従来どおり）。

#### テスト

- `tests/patterns/structural-gates-btcjpy.test.ts` の「【既知の不整合 #133】…」は、**期待値を緩めずに原因を潰して**「#133 修正済み: includeForming: true でも完成済み（突破 8/19）が形成中に押し出されない」に書き換えた（#130 → #132 と同じ扱い）。status のアサーションは issue の文言どおりの `'completed'` ではなく **undefined + 突破確定（`breakoutBarIndex` 82 / `confirmation` neckline_breakout）**で固定している——完成済み double は status を付与しない既存契約（「status 未設定は完成済み扱い」、`ranking.ts` の statusScore=2）のため。`status: 'completed'` を付与して合わせる案は、`includeForming: false` の既定出力（全完成済み double の payload）が変わって「既定挙動が変わらないこと」という受け入れ条件と衝突するため本 PR では行わない（付与するなら別 issue で 704 ケースの再計測とセットで行う）。
- `tests/patterns/helpers.test.ts` に dedup 2 関数の status 優先の単体テスト（形成中が confidence / `range.end` で勝っていても完成済みが残る・invalid は完成済みに勝てない・同 status 内は従来規則・入力順に依存しない）を追加した。
- `tests/patterns/ranking.test.ts` に statusScore のスケール（3 / 2 / 1 / 0）を固定するテストを追加した。dedup とソートが共有する単一ソースなので、序列の変更はここで顕在化する。

### Fixed（`detect_patterns` のダブルボトム偽陰性を潰した。**検出件数が増える**。#130 / #126）

**BTC/JPY 日足 2026-08-03 → 08-10 → 08-14（安値切り上げ型）が完成済み `double_bottom` として検出され、ネックライン突破が 2026-08-19（idx 82）で確定するようになった。** #131 で偽陽性を潰したときに残していた偽陰性で、構造ゲート（#126）は当時からこの形を通していた（`ok: true` / 戻り率 0.528 / `necklineCrossIdx` 実在）。落としていたのは **3 つの別々の検査**で、**どれか 1 つでも残すと検出されない**（3 通りの ablation で確認済み）。

| # | 原因 | 修正 |
|---|---|---|
| 1 | ピボット間の最小間隔が検出器ローカル定数 `MIN_PIVOT_DISTANCE_BARS = 5` で、`ctx.minDist` を無視していた（山 → 谷2 は 4 本） | 定数を削除し `ctx.minDist` を使う |
| 2 | サイズ検査（`validateTopSize` / `validateBottomSize`）が**終値基準**（高さ 1.85% / 山の高さ 1.67% で閾値 3% / 5% を割る。高安基準なら 5.87% / 5.13%） | `extremePrice`（高安）基準に統一 |
| 3 | 完成済み / relaxed の走査ループが `i < pivots.length - 3`（4 ピボットぶんの端点）で、**窓の最後の 3 ピボットが走査されない**。谷2 はこの窓の最後のピボット | `i + 2 < pivots.length` に修正 |

**原因 3 は issue #130 が挙げていない。** 1 と 2 を直しただけでは完成済みパスに乗らず、形成中候補としてしか出ない（＝ブレイクが確定しない）。`detect_triples` は `i <= n - 3`、`detect_hs` は 5 ピボットに対し `i < n - 4` で正しく、**double だけが 3 ピボットに 4 ピボットぶんの端点を要求していた**。第2構成点が窓の最後のピボットになる形——つまり**最も直近のダブルトップ / ボトム**が構造的に検出できない状態だった。

**原因 2 は #131 の価格基準の結論の横展開。** 値幅の評価は `extremePrice` で測る（`structural.ts` の `ReversalSide` docstring / 本ファイルの #126 エントリ）。サイズ検査は「パターンの値幅が十分か」を見るものなので同じ結論がそのまま適用できる。**同水準判定（`near` / `isSameLevel(a.price, c.price)`）とネックラインの線は終値基準のまま**——水準の一致と線の位置は値幅とは別の問題で、ヒゲ 1 本で動くのを避ける意図的な設計。形成中ダブルボトムの `leftDepth` / `rightDepth`（同じ `MIN_PATTERN_HEIGHT_PCT` を使う）も**基準を揃えた**。揃えないと「形成中は通るのに完成した瞬間にサイズ検査で落ちる」候補ができる。

#### 検出結果の変化量（全 fixture 前後比較）

`tests/detect_patterns_fixtures.test.ts` の **fixture 22 件 × オプション 8 通り（`includeForming` / `includeCompleted` / `includeInvalid`）× 時間足 2 種（`1day` / `1hour`）× `swingDepth` 2 種 = 704 ケース**を、`main`（8079fa2）と本ブランチの双方で走らせて突き合わせた結果（#131 と同じ手順・同じ 704 ケース）。

| | 値 |
|---|---|
| 変化したケース | **8 / 704**（1.1%）。残り 696 は完全一致 |
| パターン総数 | 312 → **320**（のべ **+8**、すべて `double_bottom`） |
| 消えたパターン | **0 件** |
| 既存パターンの `status` / 整合度の変化 | **なし**（差分は追加のみで、置換・削除は 1 件も無い） |

**増えた 8 件は 1 つのパターンが 8 通りのオプションに現れたもの**で、内訳は 1 fixture × 1 時間足 × `swingDepth` 2 種 × `includeCompleted: true` の 4 通り。実体は 1 つ:

| fixture | 時間足 | 構成点 | 突破 | 整合度 |
|---|---|---|---|---|
| `DescendingTriangleInvalidBreakout` | `1hour` | idx 18 / 20 / 22 | idx 24 | 0.74 |

**これが正しい検出である根拠**（`1hour` の既定 `minBarsBetweenSwings` は **2**）:

- **間隔**: 18 → 20 → 22 はいずれも 2 本で、**呼び出し側が指定した最小間隔ちょうど**。旧実装が要求していた 5 本は、この時間足では公開パラメータの 2.5 倍にあたる勝手な上書きだった。
- **同水準**: 2 つの谷の終値は 100 と 101 で差 **0.99%**（`1hour` の既定 `tolerancePct` は 5%）。
- **値幅**: 高安基準で高さ **17.80%** / 山の高さ **21.03%**（閾値 3% / 5%）。**終値基準でも 13.04% で通る**——この件は原因 2 とは無関係で、原因 1 だけで説明が付く（実際、原因 1 のみを適用した測定でも同じ 8 件・同じ +8 になる）。
- **突破**: ネックライン 115 に対しバッファ込みの閾値は 116.72。idx 23（107）は届かず idx 24（**128**）で初めて超えるので、突破足は一意。
- **形として妥当**: この fixture は下降三角形なので**安値が水平**（100 / 100 / 101 / 100 / 101）に並ぶ。最後の 2 つの安値がダブルボトムを成すのは定義上ありうる読みで、同じ窓の `triangle_descending` と `triple_top` は**引き続き両方とも検出される**（消えたパターンが 0 件なのはこのため）。

**原因 2（高安基準）と原因 3（ループ端）は 704 ケースでは 1 件も変化を生まない。** 合成 fixture は `high = close + 3` / `low = close - 3` で対称にヒゲを付けており終値と高安の値幅比がほぼ変わらないこと、および全 fixture がパターンの後ろにもう 1 つピボットを持つことによる。**実データ（`tests/fixtures/btc_jpy_1day_2026.ts`）は上記 704 ケースの外**で、そちらは `double_bottom` が「形成中 0 件・完成済み 0 件」→ **完成済み 1 件（突破 8/19、整合度 0.96）**になる。

#### `MIN_PIVOT_DISTANCE_BARS` の二重管理を解消した（片方だけ）

この定数は `patterns/scan-window.ts` が `pivotGapBars = max(minBarsBetweenSwings, MIN_PIVOT_DISTANCE_BARS)` として import しており、「検出器側の 5」と「式側の max」の二重管理になっていた。**切り分けた結果、2 つは同じものではなかった。**

- **検出器側の 5 は取り残し。** 同じ反転系の `detect_triples` / `detect_hs` は当時から `ctx.minDist` をそのまま使っており、値の根拠を書いた comment もテストも無い。公開パラメータ `minBarsBetweenSwings` が double にだけ効かない状態だったので、**`ctx.minDist` に寄せて定数を削除した**。
- **式側の max は検出器の写しではなく、別の役割で load-bearing。** `assessScanWindow` の `minViableLimit` は `patterns/bar-thresholds.ts` の `structuralFloorBars` の**唯一の入力**で、そこから `patternMinBars` / `patternBarsCap` を経由して**全検出器のパターンサイズ閾値**（`docs/tools.md` §2 の表）が決まる。床を外すと `minBarsBetweenSwings < 5` の 9 時間足で構造的下限が縮み、**double と無関係の triangle / wedge / triple が一斉に緩む**（実測: 704 ケース中 **104 ケース**が変化、パターン総数 312 → **384**）。

そこで**床は据え置き、所有権だけ移した**。`detect_doubles` からの再 export をやめ、`scan-window.ts` 自身が `STRUCTURAL_PIVOT_GAP_FLOOR_BARS` として持つ。値も `docs/tools.md` の 2 つの表も `patterns/min-bars.ts` の導出値も**変わらない**。「検出器のピボット間隔＝`minBarsBetweenSwings`」「パターンサイズ閾値の基準点＝床付きの構造的下限」と意味が 1 つずつになったので、二重管理そのものは解消している。**床を外すかどうかは #130 のスコープ外**として **#134 に分離**した（外す場合は 2 つの表・`min-bars.ts`・到達性テストが同時に動き、増える 72 件の妥当性検証が別途要る）。据え置きに伴い、`STRUCTURAL_PIVOT_GAP_FLOOR_BARS` の docstring に**この 5 が現在どの検出器の要件にも対応していないこと・#121 の閾値調整がこの床を前提にしているため据え置いていること・根拠は構造的必然ではなく経験的であること**を明記した（名前が「構造的」と読めるため、不変量と誤解されるか根拠を探して時間が溶けるのを防ぐ）。副作用として §1 の構造的下限は `minBarsBetweenSwings < 5` の時間足で実際の検出器より 1〜4 本ぶん保守的になる（警告としては安全側）。

#### 既知の挙動: `includeForming: true` は完成済みを隠す（#133 に分離）

同じ構成点で完成済み（整合度 0.96）と形成中（同 1.00）の両方が出る場合、`globalDedup`（`patterns/helpers.ts`）は **`status` を見ずに整合度が高い方を残す**ため、形成中が完成済みを押し出す。BTC/JPY の当該パターンも `includeForming: true` では `forming` として返る（既定の `includeForming: false` では突破確定済みの完成済みが返る）。`rankPatterns` は `status` を最優先するので**同じツール内で 2 つの規則が食い違っている**。本 PR の修正で初めて同一構成点の両方が同時に出るようになったため顕在化したもので、`globalDedup` は**全パターン種別を通る共通経路**——修正すると triangle / wedge / triple / H&S / flag にも波及し、704 ケースの再計測と増減 1 件ごとの正当性説明がいる。本 PR の検証済みの状態（8/704・差分は追加のみ）を壊さないため **#133 に分離**し、現状を `tests/patterns/structural-gates-btcjpy.test.ts` に**「既知の不整合」と明記したうえで**固定した（#133 の修正時にそのアサーションを `completed` へ反転させる）。

#### テスト

- `tests/patterns/structural-gates-btcjpy.test.ts` の「未検出の原因は構造ゲートではなく、最小ピボット間隔とサイズ検査の価格基準にある」は、**期待値を緩めずに原因を潰して**書き換えた。同じ数値（間隔 4 本 / 終値基準は閾値割れ / 高安基準は通る）を「なぜその修正が要ったか」の側から固定し直し、**受け入れ条件そのもの**（完成済み検出 + 突破 idx 82）を新しい `it` として足してある。**不等号の向きも閾値も 1 つも変えていない。**
- 「偽陽性 7/13 → 7/21 → 8/3 の棄却理由が debug candidates に残る」は、**その候補がそもそも組まれなくなった**ため書き換えた。この候補を作っていたのは形成中パスだけ（7/13 と 8/3 は隣接ピボットではないので完成済みパスの走査に乗らない）で、`tryFormingDoubleBottom` は谷ペアを新しい順に見て**最初に成立したところで return する**。偽陰性を潰した今は手前で正しい形が成立するので、偽陽性は検査されない。構造ゲート自体がこの形を弾くことは、同ファイルが `validateReversalStructure` を直接呼んで引き続き固定している。
- `tests/detect_doubles.test.ts` に 3 つの原因それぞれの回帰ケースを足した。どれか 1 つを戻すと必ず落ちることを確認済み。

### Changed（`detect_patterns` のダブルトップ / ボトムに構造ゲートを入れた。**検出件数が変わる**。#126）

**構造として成立していない候補を、整合度の減点ではなく hard reject で落とす層を前段に置いた。** 落ちた候補は 1 件も出力されず、棄却理由は `view=debug` の `candidates` に理由コード付きで残る。BTC/JPY 日足 2026-05-29〜08-26 の実データでは、**整合度 1.00 で「形成中」と報告されていた 7/13 → 7/21 → 8/3 の候補が `neckline_above_pre_decline_high` で棄却される**（戻り率 2.046）。

- **`neckline_above_pre_decline_high` / `neckline_below_pre_decline_low`（G1 / G2）** — ネックラインが先行値幅の起点を越えている、すなわち**戻り率 > 1.0**。「下抜けたものを抜け返す」という事象が定義できず、定義上そのパターンではないので**固定 reject**（閾値の調整対象にしない）。上記の偽陽性はここで落ちる。
- **`no_neckline_cross_before_trough1` / `no_neckline_cross_before_peak1`（G1）** — 第1構成点より前に、ネックライン水準を**終値で**抜けたバーが実在すること。「その水準より下にあった」ではなく「上から下へ抜けた」を要求する——抜けていない線を抜け返しても反転シグナルにならない。ヒゲだけの一時的な割り込みを数えないよう終値基準。探索窓が 10 本未満で「交差が無い」を立証できない場合は素通しする（`validatePriorTrend` の `insufficient_data` と同じ安全側の倒し方）。
- **`retracement_out_of_band`（G2）** — 戻り率が **0.20〜0.90** の外。
- **`re_entered_trough_zone`（G5）** — 第2構成点の確定後、ネックライン突破前に終値が谷（山）ゾーン（パターン高さの下位 25%）へ戻ったもの。`status='invalid'` + `invalidReason` として出す。同水準の第3構成点があれば triple 側に委ね、`reclassified_as_triple_bottom` / `_top` として何も出さない。

**価格基準は `extremePrice`（高安）を選んだ。**「共通ゲートに生の `price` を渡さない」という #126 / #128 の設計指針に加えて、実測が裏付けている。BTC/JPY 日足の実在パターン（先行高値 7/21 → 谷1 8/3 → 山 8/10）の戻り率は:

| 基準 | preDeclineHigh | trough1 | peak | 戻り率 | 下限 0.20 までの余裕 |
|---|---|---|---|---|---|
| 終値 | 10,849,999 | 10,002,960 | 10,191,324 | **0.222** | 2.2 ポイント |
| 高安 | 10,903,000 |  9,752,246 | 10,359,897 | **0.528** | 32.8 ポイント |

終値基準では、**検出すべき正しいパターンが下限まで 2 ポイントしか余裕を持たない**。谷ゾーン再進入（G5）も同じで、終値基準でゾーンを組むとこの正しいパターンが 8/16 の終値で無効化される（終値基準のゾーン上限 10,050,051 に対し 8/16 終値 10,014,831。高安基準なら上限 9,904,159 で入らない）。

**ネックラインの「線」だけは呼び出し側から明示的に受け取る。** 値幅の評価（戻り率）は基準の統一された `extremePrice` で測るが、ネックラインは線であって値幅ではなく、**後でブレイクを判定するのと同じ線**を検査しないと意味が無い。`detect_doubles` は `findBreakoutIdx` と `neckline` 配列に渡すのと同じ `b.price` を渡している。`Pivot` から導出させると、`price` の基準が検出器ごとに違う（#128）ぶんだけ共通ゲートの意味が呼び出し元ごとにずれる。

**帯の上限 0.90 は実測では決まらない。** 実データが直接決めているのは「1.0 超は棄却」と「0.528 は通す」の 2 点だけ。0.90 にしたのは (a) 戻り率 0.90 以上ではネックラインが先行値幅の起点の 10% 以内に入り上値抵抗として意味を成さない、(b) 対称三角形は収束につれて戻り率が 0.79 → 0.91 と連続的に動くため 0.85 に置くと**同じ 1 つの三角形の中で通る脚と落ちる脚が混在する**（構造の切れ目でない場所に hard reject を置くことになる）、(c) 帯の内側の良し悪しは `scoreComponents.retracement` が連続的に評価するので hard reject 側を絞りすぎる必要がない、の 3 点による。レビュー提案値の 0.85 はそのまま採らなかった。

**共通ユーティリティとして `tools/patterns/structural.ts` に置いた**（`validateReversalStructure` / `detectTroughZoneReentry` / `findNecklineCross` / `findPriorExtreme`）。double_top へは符号反転でそのまま適用済み。**head_and_shoulders / triple への適用は本 PR では行っていない**——検出件数への影響の確認が別途要るため。

**ゲートの位置は `validatePriorTrend` の後ろ。** 前に置くと既存の棄却理由（`no_breakout` / `prior_trend_mismatch:*`）が構造ゲートの理由に置き換わり、debug の理由コード契約が黙って変わる。「スコアの前段」という要件は満たしつつ、既存の理由コードは温存している。

#### 検出結果の変化量（全 fixture 前後比較）

`tests/detect_patterns_fixtures.test.ts` の **fixture 22 件 × オプション 8 通り（`includeForming` / `includeCompleted` / `includeInvalid`）× 時間足 2 種 × `swingDepth` 2 種 = 704 ケース**を、`main`（0b4b23c）と本ブランチの双方で走らせて突き合わせた結果。

| | 値 |
|---|---|
| 変化したケース | **32 / 704**（4.5%）。残り 672 は完全一致 |
| パターン総数 | 312 → **296**（のべ **-16**、すべて `double_bottom`） |
| 増えたパターン | **0 件** |
| `status` の変化 | **なし** |
| 整合度が動いたパターン | のべ **16 件**（すべて `double_top`）。**全件が下振れ**、変化幅は **-0.17 〜 -0.18** |

**消えた 16 件はすべて三角形 fixture で double_bottom が誤ラベルされていたもの**で、過剰棄却ではない。内訳は 2 fixture × 8 オプション:

| fixture | 棄却理由 | 妥当性 |
|---|---|---|
| `DescendingTriangleInvalidBreakout` | `reclassified_as_triple_bottom` | 下降三角形は定義上**安値が水平**なので同水準の谷が 3 つ以上ある。triple 側に委ねるのが正しい |
| `FormingAscendingTriangle` | `retracement_out_of_band` | 上昇三角形は**高値が水平**なので中間の山が先行高値に肉薄し、戻り率が帯を外れる。同 fixture は `triple_bottom` / `triangle_ascending` として引き続き検出されるので、形自体が消えたわけではない |

**整合度の下振れ（0.91 / 0.90 → 0.73）は新しい `breakoutQuality` 軸によるもの。** `CompletedDoubleTop` fixture の実測サブスコアは `symmetry` 0.992 / `breakoutQuality` **0.308** / `duration` 0.900 で、**突破足の終値がネックラインをパターン高さの 3 割しか超えていない**ことを新軸が拾っている。旧スコアは `tolMargin` と `symmetry` が同じ軸だったためこれを見ていなかった。なお同 fixture は先行極値が窓外（ピボットが idx 5 から始まる）のため `retracement` は算出されず、**算出できなかった軸は平均から外している**（0 として混ぜると欠測が減点になるため）。

**実データ（`tests/fixtures/btc_jpy_1day_2026.ts`）は上記 704 ケースの外。** こちらは `double_bottom` forming 1 件（整合度 1.00）→ **0 件**。これが #126 が報告した偽陽性そのもの。

#### 既存 fixture を変更した 2 件は、閾値の変更とは独立に必要だった

`tests/detect_doubles.test.ts` の形成中ダブルボトム fixture 2 件で、谷1 より前の終値をネックライン(130)より上に変えた。**新しいゲートを通すためにテストデータを変えるのは過剰棄却を隠しうる操作**なので、旧 fixture が本当に退化していたかを確認した:

- 宣言されたネックライン（`price: 130`）が**その足の終値（128）と一致していない**。fixture のピボット配列は高値を `price` に入れており、`detectSwingPoints` の意味論（`price` = 終値）と矛盾していた。
- ベースライン 50 本の終値が**すべてちょうど 130** で、ネックライン水準を上回って終えた足が 1 本も無い。「下抜けたものを抜け返す」という事象が定義できない。
- さらに、宣言された「2 つの谷の間の山」（終値 128 / 高値 130）は**ベースライン足（終値 130 / 高値 135）より低い**。価格列上はそもそも極大点ですらない。

**閾値の変更とは独立であることも確認した。** `RETRACEMENT_MAX` を 0.85 のままにして新 fixture で走らせると `tests/detect_doubles.test.ts` は 32/32 通る（fixture 変更だけで足りる）。逆に 0.90 が要るのは `tests/patterns/invariants.test.ts` の対称三角形 whipsaw（戻り率 0.897）だけで、こちらの fixture は変更していない。**2 つの変更は別々の失敗に対応していて、二重に効かせてはいない。**

### Added（`detect_patterns` の `status` に `expired`、整合度にサブスコア。#126）

- **`status='expired'` を追加した（G4）。** 第2構成点の確定から突破確認窓（`MAX_BARS_FROM_EXTREMUM` = 20 本）を過ぎた形成中候補は、以後どれだけ待っても `completed` にならない。それを `forming` と報告するのは「まだ完成しうる」という誤った含意になる。**`invalid` と同義ではない**（形が崩れたのではなく成立する時間を使い切った）ため、#126 の提案にあった `invalidated` は新語を作らず既存の `invalid` を使い、追加したのは期限切れの 1 値のみ。既定では出力されず `includeInvalid: true` で `invalid` と一緒に現れる。期限を突破探索窓と同じ値にしてあるのは、「形成中＝まだ完成しうる」を両パスで一致させるにはそれしかないため。
- **`data.patterns[*].scoreComponents` を露出した（G3）。** `symmetry` / `retracement` / `breakoutQuality` / `duration`。旧実装の `(tolMargin + symmetry + per) / 3` は `tolMargin` と `symmetry` がどちらも「2 点が同水準か」を測る同じ軸で、実質 2 軸だった。**戻り率**と**ブレイク品質**を独立軸として足した 4 軸平均に変えたので、**完成済み double の整合度が変わる**。
- **`data.patterns[*].structureGate` を露出した。** `retracementRatio` / `priorExtremeIdx` / `priorExtremePrice` / `necklineCrossIdx`。棄却されなかった理由を呼び出し側が検算できるようにするため。
- **`data.patterns[*].invalidReason` を追加した。** `status` が `invalid` / `expired` になった理由コード。
- いずれも `.claude/rules/tools.md` 規約 2 の「足す」に該当し、既存フィールドは 1 つも削っていない。
- **整合度の説明文に注記を入れた。** `content` の「0.8以上＝教科書的」の直前に、整合度が**ゲート通過を前提とした形状の良さ**であって構造的妥当性の指標ではないこと、構造的に無効な形は整合度が下がるのではなく出力されないことを明記した。

### Fixed（`include*` の 3 フラグを独立した包含スイッチにした。#126 / PR #131 レビュー指摘）

- **`includeCompleted: false` + `includeInvalid: true` が「どちらも返さない」到達不能な組み合わせになっていた。** 旧実装は「completed バケットに `invalid` を入れてから `includeInvalid` で引き算する」二段構えで、`includeCompleted` が false の時点で `invalid` が先に落ちていた。`includeInvalid` の説明文は「含める」と読めるので契約違反。
  - **本 PR の `expired` 追加でこの穴が悪化する。** 新しい説明文が「`includeInvalid: true` で `invalid` と一緒に現れる」と約束しているのに、`includeCompleted: false` では現れない。
  - status を `forming | near_completion` / `completed | 未設定` / `invalid | expired` の **3 つの排他バケット**に分け、対応する `include*` が立っているものだけ残す形に変えた。**既定（`includeCompleted` のみ true）の出力は変わらない。** 変わるのは `includeCompleted: false` + `includeInvalid: true` の組み合わせだけで、これまで常に空だったものが invalid / expired を返すようになる。
  - ガードは `tests/patterns/structural-gates-btcjpy.test.ts` の「`include*` の独立性」3 件。

### Fixed（回帰テストを実データで固定した。#126）

- **`tests/fixtures/btc_jpy_1day_2026.ts`** に BTC/JPY 日足 2026-05-29〜08-26 の 90 本（`detect_patterns('btc_jpy','1day',90)` が実際にスキャンする窓そのもの）を凍結した。**合成 fixture では閾値の妥当性を検証できない**（閾値に合わせて合成できてしまう）ため、戻り率の帯・ネックライン交差・谷ゾーン再進入は `tests/patterns/structural-gates-btcjpy.test.ts` が実データに対して固定する。
- **既知の偽陰性は残っている。** 同区間の 8/3 → 8/10 → 8/14（安値切り上げ型）は依然として未検出だが、**原因は本 PR の構造ゲートではない**。(1) `MIN_PIVOT_DISTANCE_BARS = 5` に対し 8/10 → 8/14 が 4 本、(2) サイズ検査（`validateTopSize` / `validateBottomSize`）が終値基準で、高安基準なら通る大きさ（5.87% / 5.13%）が終値基準では閾値割れ（1.85% / 1.67%）する。どちらも double_top / triple / H&S に共通する慣習なので、変更は検出件数への影響を見てから行う——**#130 に切り出した。** 原因そのものをテストで固定してあるので、#130 は期待値を緩めるのではなく原因を潰してそのテストを落とす形になる。
- `tests/detect_doubles.test.ts` の形成中ダブルボトム fixture 2 件で、谷1 より前の終値をネックライン(130)より上に変えた。旧 fixture は終値がネックラインとぴったり同値のまま横ばいで、**そもそもネックラインを下抜けたという事象が存在しない**形だった（新しい `no_neckline_cross_before_trough1` が正しく弾く）。テストが検証している契約（`completionPct` / `targetMethod` / `structureRange` の境界）は変えていない。

### Changed（`detect_patterns` の `debug` 可観測性と価格基準を透明化した。**検出結果は変わらない**）
- **`view=debug` の candidates を入力 `patterns` で絞るようにした（#124）。** 全検出器が `want` を**分類・出力の時点**でしか参照しておらず、**走査に入る時点**では見ていないため、候補は走査中に無条件で積まれていた。結果 `patterns=["double_bottom"]` を指定しても candidates は falling_wedge / rising_wedge で埋まり、`tools/detect_patterns.ts` の cap=200 トリム（accepted 優先 → rejected）で**要求した種別の棄却理由が押し出されていた**。合成データ 120 本での実測で `patterns=["double_bottom"]` の candidates は 164 件（うち falling_wedge 118 件）→ 8 件（すべて double_bottom の棄却理由）になる。
  - **絞り込みはトリム直前の 1 箇所**（`tools/patterns/candidate-filter.ts`）。各検出器の走査を `want` で早期スキップする案（計算量も減る）は採らなかった——6 ファイルに手を入れることになり「検出結果ゼロ変更」の保証が難しい。
  - **候補ラベルの被覆は入力エイリアスと一致しない。** `detect_pennants` は方向・形状の分類前の棄却をすべて `type: 'flag'` で積むため、このラベルは入力エイリアスの `flag`（= bull_flag + bear_flag）より広く **pennant も覆う**。入力側の展開（`triangle` → 3 種、`flag` / `pennant` → 各 2 種）とは別の写像として持ち、`tests/patterns/candidate-filter.test.ts` が `PatternTypeEnum` / `PatternFilterEnum` とのドリフトを機械的に検出する。
  - **`patterns` 未指定時の candidates は 1 件も変わらない**（フィルタが恒等になる）。8 fixture × 8 オプション × 2 時間足 = 128 ケースを変更前後でダンプして差分ゼロを確認済み。
  - **残件は #129 に切り出した。** `detect_triangles` / `detect_wedges` は分類前の棄却を umbrella ラベルではなく具体型 `triangle_symmetrical` で積んでいる。そのため `patterns=["triangle_descending"]` では candidates が **0 件**になる（三角形検出器は実際に 37 窓を棄却している）。`patterns=["triangle_ascending"]` も分類済みの 3 件しか出ない。ラベル側を `'triangle'` に直すのが筋だが、**`patterns` 未指定時の candidates 出力が変わる**（本エントリの受け入れ条件に反する）ため別 issue とした。flag / pennant 側は `detect_pennants` が umbrella ラベル `'flag'` を使っているので正しく動く（`patterns=["bull_pennant"]` で棄却理由 19 件）。
- **`debug` の候補詳細が「存在しないフィールド」を `n/a` として捏造していたのをやめた（#124）。** 専用フォーマッタを持たない reason（`r2_below_threshold` / `insufficient_touches` / `score_below_threshold` / `containment_violated` 等、棄却理由の大半）は default 分岐に落ちるが、そこは `spreadStart` / `spreadEnd` / `hiSlope` / `loSlope` を決め打ちで読んでいた。**この 4 つを `details` に入れる検出器は 1 つも無い**（`spreadStart` を持つ reason はすべて flag 系の専用分岐で処理される）ため、どの候補でも `spread: n/a` としか出ず、実際に入っている診断値（r2 / touches / score / ratio …）は 1 つも表示されていなかった。`details` が実際に持つフィールドを列挙する形に置き換えた（上限 16 フィールド、ネストは 160 字までの短縮 JSON）。
- **候補 0 件の表示を「なし」から理由付きに変えた。** 絞り込みの結果 0 件になりうるので、`content` に「この窓では要求種別の候補が 1 つも組まれていない。candidates は入力 patterns で絞り込まれる」と出す。**「パターンが無い」と読まれないようにするため。**

### Added（`detect_patterns` の pivot に判定価格を併記した。#125 前半）
- **`data.patterns[*].pivots[]` に `kind` と `extremePrice` を足した。** スイング検出（`tools/patterns/swing.ts`）は**極値判定を高値 / 安値で行い、`price` には終値を格納する**（ヒゲ 1 本で同水準判定・ネックラインが動くのを避けるための意図的な設計）。しかし報告される `price` が判定に使った値ではないため、**出力から判定を検算できなかった**。実際に外部レビューがこれを終値基準と誤解し「ピボット抽出器のバグ」という誤った Critical 報告に至っている（実装は正しかった）。
  - `price` = その足の終値 / `kind` = `H`（山）または `L`（谷）/ `extremePrice` = 極値判定に実際に使った値（`kind=H` なら `high`、`L` なら `low`）。`.claude/rules/tools.md` 規約 2 の「足す」に該当し、既存フィールドは 1 つも削っていない。
  - `kind` は runtime には元から載っていたが**スキーマに無いため zod の strip で落ちていた**。`extremePrice` 単体では「その値が高値なのか安値なのか」が判別できないので併せて公開する。
  - **`view=full` の content** では double_top / double_bottom の構成点 3 行に両方を出す（例: `谷1: 2026-08-03 終値 10,002,960円 / 安値 9,752,246円（判定は安値基準）`）。両者が同値のときは 1 つにまとめる。
  - **型で固定した。** `Pivot.extremePrice` を必須にし、`PatternEntry.pivots` の緩い再宣言（`Array<{ idx?; price?; kind? }>`）を `Pivot[]` に締めたので、検出器が pivot を組み直すときに落とすと typecheck が落ちる。これで検出器 19 箇所の再構築サイトが機械的にカバーされる。
  - **`triangle_*` は `price === extremePrice` になる。** 三角形の検出器は独自の relaxed swing（`swingDepth=1`）を使い、そこでの `price` が最初から高値 / 安値そのものだから。**同値であること自体が「この検出器は終値を経由していない」という情報**なので、別値を捏造せずそのまま入れている。形成中 H&S / 逆 H&S の暫定右肩（最新足の終値をそのまま置くもの）も、極値判定を通っていないので同値になる。
  - **`price` を終値に揃える案（CodeRabbit review, PR #128）は採らなかった。** 三角形はトレンドライン（`upperLine` / `lowerLine`）をこの高安列に回帰させ `neckline` もその線から取るため、`price` を終値に差し替えると構成点が自分のトレンドライン上に乗らなくなる。実測でも `data.patterns` が 128 ケース中 30 ケースで変わり、**変わった 30 件すべてで `aftermath.theoreticalTarget` が動いた**（`min` / `max(pivots[].price)` 由来。例: 123 → 119）。これは `targetReached` → `outcome` → `data.statistics.successRate` を決める値なので表示上の差ではない。**本 PR の受け入れ条件（検出結果ゼロ変更）を外れる検出セマンティクスの変更**なので別 PR の判断とし、代わりに `Pivot` の型 doc / `docs/tools.md` / テストで「`price` の基準は検出器ごとに違い、不変なのは `extremePrice` だけ」を明示・固定した。
- **`priceBasis: "close" | "extreme"` パラメータ（#125 後半）は入れていない。** 既定値の選択で検出結果が変わる大きな変更であり、#126 が終わって挙動が安定してから必要性を判断する。**#125 は透明化のみ完了で、パラメータ化は保留。**

### Fixed（用語の陳腐化。#127 の一部）
- **`tools/patterns/scan-window.ts` の `buildScanWindowWarning` の docstring が「日数ベースの閾値は別途かかる」のままだったのを修正した。** #121 で閾値のプリミティブがバー数になっている（`patterns/bar-thresholds.ts`）。このエントリを書いた PR（索引 8 行目 / #128）は #127 の残りには手を付けていない。**残り（prompts の `limit=180`、CHANGELOG 集約、CI ジョブ名）は索引 13 行目の PR で完了済み**——下の「#127 の残り」エントリを参照。

### Changed（`detect_patterns` の `limit` に「上げる」方向の使い分けを明記）
- **ツール description と `inputSchema.limit.describe()` に `limit` を上げる動機を 1 点ずつ追記した（文言のみ・挙動変更なし）。** #119 / #121 で `limit` の意味論を両方に明記したが、**いずれも下限の話しか書いていない**（`limit_too_small_for_timeframe`、構造的下限、種別が静かに 0 件になる下限の表）。「`limit` を上げると何が得られるか」「いつ上げるべきか」がツール表面のどこにも無く、LLM も利用者も既定 90 から動かす判断ができなかった。
  - **既定 `limit`（90）は「いま形成中〜完成直後のパターンを把握する」ためのウィンドウ**であって「これ以上見ると重い」という上限ではない。**過去のパターンの統計（`data.statistics` の `successRate` / `avgReturn7d` 等）や `aftermath` を調べる用途では上げる**（上限 365）。
  - **コストは `content` のトークンではなく API 呼び出し回数。** `view=summary` / `detailed` の `content` に出るのは分類内訳と上位 5 件までなので、`limit` を上げても LLM に渡る量はほとんど変わらない（全件を出す `view=full` だけが `limit` に比例する）。増えるのは `analyze_indicators` が `limit + warmup` 本を取りにいくぶんの取得コストで、**それを払うべきなのは過去分析をする呼び出しだけ**。既定値の引き上げで全呼び出しに負わせず、`limit` の明示指定に寄せている。
- **`docs/tools.md` に「`limit` を上げる動機」節を追加した**（「`limit` の実効下限」の直後）。用途 → 効くフィールド → 既定 90 での問題を表で対応付け、description 側は 1 行の要点に留めている。
- **既定 `limit` は 90 のまま**（値ではなくユースケースの選択なので動かさない）。**既定 `limit` の時間足スケーリングも入れない**（#118 の対応案 2。cap 導入で到達性は解決済みのため正しさの問題ではなくなっており、API 呼び出し増を全呼び出しに負わせる割に得るものが薄い）。
- **`src/prompts/` は変更なし。** `detect_patterns` を呼ぶプロンプトは「中級：BTCのパターン分析をして」1 件だけで、既に `limit=180` を明示している。

### Changed（**挙動変更**: `detect_doubles` / `detect_hs` の手書き `daysPerBar` を廃止し、バー基準に統一した）
- **形成中 double / H&S の 4 箇所の手書き `daysPerBar` を廃止した（#118 問題 3）。** `helpers.formingReversalDaysPerBar`（`1day`→1 / `1week`→7 / **それ以外→1**）を削除し、判定を `detect_triples` と同じ形（`formationBars ∈ [minBars, maxBars]`）に揃えた。換算は `getDoubleFormingBarParams` / `getHsFormingBarParams` から `patterns/bar-thresholds.ts` の `patternBarRange` を通す。**これで全検出器が同じ換算に乗った。**
- **受理する形成バー数レンジ**（`formationBars` = `lastIdx - 左ピボット.idx`）:

  | 時間足 | double 旧 | double 新 | H&S 旧 | H&S 新 |
  |---|---|---|---|---|
  | `1min` / `5min` | [14, 90] | **[30, 193]** | [21, 90] | **[30, 129]** |
  | `15min` / `30min` / `1hour` | [14, 90] | **[34, 219]** | [21, 90] | **[34, 146]** |
  | `4hour` / `8hour` | [14, 90] | **[42, 270]** | [21, 90] | **[42, 180]** |
  | `12hour` | [14, 90] | **[28, 180]** | [21, 90] | **[42, 180]** |
  | `1day` | [14, 90] | **[23, 148]** | [21, 90] | **[23, 99]** |
  | `1week` | [2, 12] | **[25, 161]** | [3, 12] | **[25, 107]** |
  | `1month` | [14, 90] | **[29, 186]** | [21, 90] | **[29, 124]** |

- **`1month` は「緩む」ではなく「厳しくなる」。** #118 は「`1month` は 14 バー = 14 ヶ月を要求しており、本来の 14 日 ≒ 0.47 ヶ月より約 30 倍厳しい」と記録していたが、PR B が入れた**構造的下限のクランプ**が 0.47 バーを 29 バーへ持ち上げるため、正味は 14 → 29 バー（約 2 倍**厳しく**）動く。「14 日ぶんの暦日数」に相当するバー数は月足では 3 ピボットすら張れない値なので、下限で潰すのが `patterns/bar-thresholds.ts` の設計判断そのものである。**既定 `limit`（90）では `1month` の形成中 double / H&S の検出件数は減る**（合成データの掃引で double 66 → 53 / H&S 54 → 53 ケース）。
- **実際に件数が増えるのは `1week`。** 旧実装の受理域は `formationBars ∈ [2, 12]`（double）/ `[3, 12]`（H&S）で、`1week` の構造的下限 25 本を**上限が下回っていた**。90 本の窓で形成中 double / H&S の形状を 85 通り掃引して**変更前は 0 件**、変更後は 58 件が検出される。最小側だけを見る到達性テスト（不変条件 9）は要求 3〜4 本を「到達可能」と判定しており、**最大側の潰れを見逃していた**。
- **最小側は全時間足で厳しく、最大側は全時間足で緩む。** 旧実装は `1week` 以外の全時間足で `formationBars ≤ 90` に張り付いており（`MAX_FORMING_DAYS=90` がそのままバー数として効いていた）、既定 `limit`（90）では上限が実質無効だった。既定 `limit` を超える `limit` を指定したときに差が出る（例: `limit=120` の `1day` double は旧 90 本 → 新 113 本まで受理）。
- **`docs/tools.md` の「`limit` の実効下限」§2 の表に forming double / forming H&S の列を追加した。** 表は `minBarsForDetector` からの導出値で、`tests/patterns/min-bars.test.ts` が docs をパースして一致を検証する。最小要求バー数は `1day` で double 15 → 24 / H&S 22 → 24、`1week` で 3 → 26 / 4 → 26、`1month` で 15 → 30 / 22 → 30。**全組み合わせが既定 `limit`（90）以下**なので、PR A の到達性 allowlist は空のままである。
- **`helpers.daysPerBar`（`barsPerDay` の逆数）も削除した。** 唯一の用途だった `patternDays` の算出が無くなり、production の呼び出し元が 0 になったため。`patterns/` に「バー数 → 日数」の関数を残すと、日数を閾値のプリミティブに戻す経路が開いたままになる。日数 → バー数の換算率（`barsPerDay`）は引き続き `bar-thresholds.ts` / `detect_triangles` / `detect_pennants` が使う。
- **テストの期待値更新は 3 件の fixture 延長。** いずれも `1day` の形成中 double が要求する `formationBars ≥ 23` に届かなくなったもので、形は変えず末尾 / 押し目を伸ばしただけ:
  - `tests/patterns/invariants.test.ts` の `buildFormingDoubleBottomCandles`（`formationBars` 19 → 25）。中間の山をブレイクバッファ 1.5% 込みで超えないよう末尾は 98 で頭打ちにしてある。
  - `tests/detect_patterns_fixtures.test.ts` の同名 fixture（同上）。`limit` を直値 24 から `FORMING_DOUBLE_BOTTOM_BARS` に置き換え、`range.end` の期待値も同じ定数から導出するようにした。
  - `tests/detect_patterns_fixtures.test.ts` の `buildUptrendThenFakeDoubleBottomCandles`（`formationBars` 14 → 25）。右谷までの押し目を 5 本から 16 本に伸ばした。旧 fixture では形成バー数の段で先に弾かれ、このテストが検証したい `prior_trend_mismatch` の段に届かない。
- **実検出の回帰テストを全時間足に広げた**（`tests/patterns/default-limit-detection.test.ts`）。合成データを既定 `limit`（90 本）ぶん与えて、11 時間足すべてで形成中 double_top / head_and_shoulders が実際に返ることを固定する。到達性テスト（不変条件 9）は**最小側の算術しか見ない**ので、`1week` のような「最小側は到達可能・最大側が潰れている」ケースはここでしか捕まらない。
- **`docs/tools.md` §2 の表が「閾値そのもの」ではなく「必要なスキャン窓の本数」であることを明記した。** 表の直上の式（`clamp(round(日数 × barsPerDay), 構造的下限, 構造的下限 × 2)`）が返すのはパターンの大きさの閾値で、表はそこに各検出器の端点ぶん（形成中の反転 3 種・完成済み wedge・flag / pennant は +1、三角形は +6）を足した値。式の値をそのまま `limit` に使うと 1 本足りない（例: `1day` の forming double は式 23 に対し表 24）。この単位の取り違えは本 PR 以前からあったが、forming double / H&S の列を足したことで表面化した（CodeRabbit review, PR #122）。
- **形成中 double / H&S のバー数レンジを境界値で固定した**（`tests/patterns/default-limit-detection.test.ts`）。既定 `limit` のテストは `formationBars = 60` の 1 点しか見ないので、下限 / 上限を取り違えていても 60 を受理する限り通る。全 11 時間足 × 両検出器で `minBars - 1` / `minBars` / `maxBars` / `maxBars + 1` の受理・棄却が反転することを検証する。形状生成は `formationBars` だけを可変にしてあるので、隣り合う 2 点の差はレンジ判定に帰属できる（CodeRabbit review, PR #122）。
- **PR B の「`detect_doubles` / `detect_hs` は対象外（別 PR）」を解消した。** `patterns/min-bars.ts` は日数からの導出（`barsForFormationDays`）を持たなくなり、全検出器がバー数レンジからの導出に一本化されている。

### Changed（**挙動変更**: パターン閾値のプリミティブを日数からバー数に統一し、上限クランプを入れた）
- **`detect_triples` / `detect_wedges` / `detect_triangles` / `detect_pennants` の閾値を「日数 × `barsPerDay`」からバー数に移した（#118 問題 1 / 2）。** 換算は `tools/patterns/bar-thresholds.ts` に集約し、`minBars = clamp(round(days × barsPerDay(tf)), structuralFloorBars(tf), patternBarsCap(tf))` の 1 形に統一している。**検出件数が広く変わる。**
- **原因は閾値が小さすぎることではなく大きすぎること。** 「25 日窓」は `1hour` で 600 本、`1min` で 36000 本を要求し、既定 `limit`（90）はもちろん `limit` のスキーマ上限（365）でも到達不能だった。必要なのは floor ではなく **cap** ——`detect_wedges` の `MIN_STRUCTURAL = 15` 方式（floor のみ）では解けない。`max(15, round(25 × bpd))` の floor 側が選ばれるのは `1week` / `1month` だけで、`1day` 以下では日数換算値が必ず floor を上回るため、intraday では一度も発火しない。
- **下限は `patterns/scan-window.ts` の `assessScanWindow`（`minViableLimit`）から導出する。** 時間足ごとの `swingDepth` / `minBarsBetweenSwings` が既に効いているので「その時間足で形が成立する最小の窓」という意味が付く。マジックナンバー 15（`detect_wedges` の `MIN_STRUCTURAL`、`detect_triangles` の `minWindowBars`）は廃止した。実効値は `1min`/`5min` 15、`15min`〜`1hour` 17、`4hour`〜`12hour` 21、`1day` 23、`1week` 25、`1month` 29。
- **上限は下限の定数倍（`PATTERN_BARS_CAP_MULTIPLIER = 2`）。走査窓（`limit`）には依存させていない**——同じデータで `limit` 次第にパターンの定義が変わるのを避けるため。倍率 2 は「既定 `limit`=90 で全時間足・全種別が到達可能」を満たす**唯一の整数倍率**: 1 では上限 = 下限で clamp が潰れて日数換算値が 1 つも生き残らず、3 以上では flag / pennant が `15min` / `30min` で `3 × 17 × 2 + 1 = 103` 本 > 90 本となり再び到達不能になる。この 2 点は `tests/patterns/bar-thresholds.test.ts` が機械的に固定している。
- **日数は description の注記に降格した。** 閾値の本来の意図は「形が成立するだけの構造がある」ことであって暦日数ではない。1時間足の利用者にとって「21 暦日にまたがるトリプルトップ」は要件として意味を持たない。コード上は定数名（`FORMING_MIN_DAYS` / `WINDOW_MIN_DAYS` 等）として値の出どころを残すだけにしてある。
- **最大側は「bar 空間でも日数比を保つ」形にした**（`patternBarRange`）。最小側だけクランプすると `1week` / `1month` で `minBars > maxBars` の反転が起き、そのパターンが丸ごと 0 件になる（例: `1week` の形成中トリプルは下限 25 本・上限 13 本になっていた）。素の `round(maxDays × bpd)` を上限に使わないのは、形成中ウェッジの窓ループが走査窓長で頭打ちにならず、intraday で反復回数が爆発するため。
- **旗竿・保ち合い（`detect_pennants`）には構造的下限を掛けていない。** 下限の前提は「前後 `swingDepth` 本の除外」と「3 ピボットの最小間隔」だが、旗竿は単一のインパルス脚でピボット構造ではない。`1day` に下限 23 本を掛けると `poleMinBars`(23) > `poleMaxBars`(15) となり検出が全滅する。下限は旧実装の絶対値（旗竿 2 本 / 保ち合い 3 本）のまま、上限クランプだけを適用した。
- **パターン内部の比率は窓サイズに対する比で持つようにした。** `detect_wedges` の `windowStep` / `maxTouchGap` / `maxStartGap` / `formingMinBarsBeforeBreak` は日数換算をやめ、`windowSizeMin` に対する比（旧実装の 5/25、25/25、10/25、15/25 日）で決める。`1day` では旧値（5 / 25 / 10 / 15 本）と完全に一致する。`windowStep` の頭打ちは必須で、これが無いと `1hour` の step 120 に対して窓が 34 本しか無く、走査ウィンドウが 1 つ（`[0, 34]`）しか生成されない。
- **既定 `limit`（90）での到達性:** 到達不能だった 16 組（PR A の allowlist）が**すべて解消し、allowlist は空になった**。`tests/patterns/invariants.test.ts` の不変条件 9 は「未到達の組み合わせがゼロ」を直接固定する形に変えてある。
- **実際に検出できることも回帰テストで固定した**（`tests/patterns/default-limit-detection.test.ts`）。到達性テストは「閾値が窓に収まるか」という算術しか見ないので、合成データを 90 本与えて `1day` / `4hour` / `1hour` で完成済み wedge・形成中 triple が実際に返ることを別途検証する。変更前は `4hour` / `1hour` の両方が 0 件だった。
- **最小要求バー数の変化**（`docs/tools.md` §2 と同じ意味論。`limit` がこれ未満だとその種別だけが 0 件になる）:

  | 時間足 | 形成中 triple | 完成済み wedge | 三角形 | flag / pennant |
  |---|---|---|---|---|
  | `1min` | 29521 → **31** | 36001 → **31** | 21 → **21** | 4321 → **61** |
  | `1hour` | 493 → **35** | 601 → **35** | 21 → **23** | 73 → **59** |
  | `4hour` | 124 → **43** | 151 → **43** | 21 → **27** | 19 → **19** |
  | `1day` | 22 → **24** | 26 → **26** | 21 → **29** | 6 → **6** |
  | `1week` | 4 → **26** | 16 → **26** | 21 → **31** | 6 → **6** |
  | `1month` | 2 → **30** | 16 → **30** | 21 → **35** | 6 → **6** |

  `1week` / `1month` は**上がっている**。日数換算値（`1week` の形成中トリプルは 21 ÷ 7 = 3 バー）が
  `minDist=5` の 3 ピボットすら張れない値で、下限として機能していなかったため。

- **テストの期待値更新は 3 件。** いずれも意図的な契約変更:
  - `detect_triples` の `1hour` / `1week` の形成中判定テスト（旧: 720 本 = 30 暦日 / 8 本 = 56 暦日）を、新しい形成バー数レンジ（`1hour` [34, 146] / `1week` [25, 107]）の内側に置き直した。旧値はいずれも新レンジの**外**で、`1hour` の 720 本は既定 `limit` では取得すらできない本数だった。
  - `detect_triangles` の fixture（`buildDescendingTriangleInvalidBreakoutCandles`）を三角形本体 18 本 → 24 本に伸ばした。`1day` の最小窓が 15 → 23 本になり、旧 fixture では `windowSizes` が空になる。追加分は既存と同じ形（切り下がる高値・水平な安値）を 1 サイクル伸ばしただけ。
  - `detect_wedges` の時間軸スケーリングテストは**期待値は変えていない**が、根拠のコメントが実装と食い違うようになったため書き直した（`1hour` の 80 本で 0 件になる理由は「窓が足りない」から「収束が浅い」に変わっている）。
- **`detect_doubles` / `detect_hs` は対象外**（別 PR）。手書きの bars-per-day（`1day`→1 / `1week`→7 / それ以外→1）を持ち、`1month` で 14 バー = 14 ヶ月を要求している件（#118 問題 3）は単位の設計判断とセットで直す。既定 `limit` では両者とも到達可能なので、allowlist は空のままで良い。
- **`docs/tools.md` の「`limit` の実効下限」§2 の表を新しい値に更新した。** 表は手書きではなく `minBarsForDetector` からの導出値で、`tests/patterns/min-bars.test.ts` が docs をパースして一致を検証している（見出しも「日数閾値由来の下限」→「パターンサイズ由来の下限」に改めた）。
- **上限（`patternBarsCap`）は最小側にしか掛けない。** cap の役割は「最小要求バー数が既定 `limit`（90）に収まること」だけで、最大側は到達性に関与しない。最大側にも掛けると cap が効く時間足で `minBars === maxBars` になり、レンジ判定が等値判定に退化する（`1hour` の形成中トリプルは `formationBars` がちょうど 34 本のときだけ通り、完成済みウェッジの走査ウィンドウは 8 サイズ → 1 サイズに潰れる）。`1day` も [25, 90] → [25, 46] に狭まって本 PR 以前と同一だった挙動が壊れる。`detect_triangles` の `maxWindowBars` が cap を `Math.max` の側に置いているのも同じ理由で、実際に使うのは `effectiveMax = min(lastIdx - 5, maxWindowBars)` なので走査窓長で必ず頭打ちになる。この不変条件は `tests/patterns/bar-thresholds.test.ts` が固定している（CodeRabbit review, PR #121）。


### Added（検出器ごとの最小要求バー数を単一ソース化し、到達性を機械的に固定した）
- **「時間足 × 検出器 → 最小要求バー数」の導出を `tools/patterns/min-bars.ts` に集約した（挙動変更なし）。** #118 の 3 件は「日数閾値がスキャン窓を超え、そのパターン種別だけが静かに 0 件になる」という同一クラスの individual instance で、個別に直しても再発する。閾値は 6 ファイル（`detect_doubles` / `detect_hs` / `detect_triples` / `detect_wedges` / `detect_triangles` / `detect_pennants`）に散っていて、どの組み合わせが到達可能かを人手で追えないのが根本原因。**閾値の値は 1 つも変えず**、「その時間足でどれだけの窓が要るか」の計算だけを 1 箇所に寄せてクラスを閉じた。
- **導出は各検出器の定数を import して行う**（写経しない）。`MIN_PATTERN_DAYS`（doubles）/ `FORMING_MIN_DAYS`（H&S / triples）/ `getWedgeBarParams` / `getTriangleParams` / `getFlagParams` を export し、`min-bars.ts` がそれを参照する。閾値を動かせば導出値も自動で追随する。
- **`docs/tools.md` の「`limit` の実効下限」表を機械検証の対象にした。** `tests/patterns/min-bars.test.ts` が **docs を実際にパースして** 導出値と突き合わせる。表 1（構造的下限）は `assessScanWindow`（#117 で実装済み）、表 2（日数閾値由来の下限）は `minBarsForDetector` が出典。手書きの表が drift すると CI が落ちる。列見出しからも検出器を対応づけているので、列の入れ替えや時間足の取りこぼしも検出する。
- **到達性テストを `tests/patterns/invariants.test.ts` に追加した（不変条件 9）。** 「全時間足 × 既定 `limit`（90）で、各検出器の最小要求バー数 ≤ スキャン窓」を検証する。現状は 16 組が未到達なので **allowlist として明示**し、「allowlist の外に未到達が無いこと」を固定した（CI は今日通る）。各行に要求本数・理由・#118 の対応箇所を持たせ、閾値を下げて到達可能になった行が残っていても落ちるようにしてある（stale 検出）。16 行すべてが load-bearing（1 行消すと必ず落ちる）ことを確認済み。
- **重複していた手書きの `daysPerBar` を 1 箇所に寄せた。** `detect_doubles` / `detect_hs` の 4 箇所にあった `ctx.type === '1day' ? 1 : ctx.type === '1week' ? 7 : 1` を `helpers.formingReversalDaysPerBar` に抽出した。**式は変えていない**——これが intraday と `1month` で誤っている件（#118 問題 3）は閾値の単位の設計判断が要るため PR B の担当で、ここでは「誤っていることを 1 箇所に書いて明示する」に留める。
- **本 PR の対象は日数閾値由来の下限のみ。** 構造的下限（`swingDepth` 由来）は `patterns/scan-window.ts` が担当し、二重には持たない。時間足でスケールしない絶対ガード（`detect_pennants` / `detect_triangles` の `lastIdx < 15`、`detect_patterns.ts` の `candles.length < 20`）はいずれも 21 本以下で既定 `limit` では効かないため導出値に含めていない（理由は `min-bars.ts` のヘッダに明記）。
- **flag / pennant の要求本数は端点 1 本を含む（`poleMinBars + consMinBars + 1`）。** `detect_pennants` のスキャンループは `poleEnd = poleMinBars` から `poleEnd <= lastIdx - consMinBars` で回り、`poleEnd` は添字なので初回の反復に入るには旗竿と保ち合いの境界となる 1 本が要る。forming triple（`formationBars` の添字差）と完成済み wedge（`start + size < totalBars`）の +1 と同じ性質で、揃えて含めた。`docs/tools.md` の当該列も同時に直している（例: `1day` 5→6、`4hour` 18→19）。**到達性は変わらない**——既定 `limit`（90）の判定は全時間足で同じ結果になる。
- **検出結果（`data.patterns`）は完全一致。** 9 時間足 × 7 形状 × 4 窓長 × forming 有無 = 504 ケース・1040 パターンを変更前後で突き合わせ、byte 一致を確認した。

### Changed（`detect_patterns` の description に検出の意味論を明記）
- **ツール description に「検出の意味論」を 4 点追記した（文言のみ・挙動変更なし）。** #114 / #117 で `range.end` の意味論・スキャン窓・構造的下限を整備したが、記載先はスキーマ description と `docs/tools.md` だけで、**ツール description は #114 以前のまま**だった。スキーマや docs を読まない LLM / 利用者には一切届いていない状態だったため、要点だけを description 側にも置いた。
  - **直近の一方向トレンドはパターンを構成しないため検出対象に入らない。** 「直近の値動きが結果に出ない」は多くの場合これであってデータ欠落ではなく、実際に走査した範囲は `meta.scan`（content の「スキャン範囲」行）が示す。
  - **ピボットの確定には前後 `swingDepth` 本が要る**ため、スキャン窓の両端 `swingDepth` 本はピボットにならない（時間足ごとに自動スケール。`tools/patterns/config.ts` の `getDefaultParamsForTf`、`1hour` の実効値は 3）。
  - **`limit` はスキャン窓の本数であり、同時に「何が検出可能か」も決める。** 小さすぎる場合は `data.warnings` に `limit_too_small_for_timeframe` が載る。
  - **既知の制約として日数閾値由来の下限に 1 行触れた**（窓が狭いと特定の種別だけが静かに 0 件になる、#118）。対応方針は #118 で検討中なので、description では現状の挙動の説明に留め、下限の表は `docs/tools.md`「`limit` の実効下限」に委ねている。
- **スキーマ側の description は書き換えていない**（#114 で完了済み。重複させると LLM の context を二重に食う）。description には要点だけを置き、詳細は `inputSchema` と `docs/tools.md` に委ねる分担。

### Added（`detect_patterns` が時間足に対して `limit` が小さすぎる窓を申告する）
- **スキャン窓が構造上パターンを張れない狭さのとき `data.warnings` に `limit_too_small_for_timeframe` を載せ、`content` 先頭にも警告行を出す。** スキャン窓を `limit` 本に絞った（下記 #114）結果、`limit` をスキーマ下限の 20 付近まで下げると「0 件検出」しか返らない崖ができていた。崖の正体は `detectSwingPoints` が窓の前後 `swingDepth` 本をピボット候補から外すこと——日足の既定 `swingDepth=6` では `limit=20` に対してピボット候補が 8 本しか残らず、最小構成のダブルトップ（3 ピボット × 最小間隔 5 本 = 11 本）が張れない。`tools/detect_patterns.ts` の `candles.length < 20` ガードはこれを「ちょうど 20」で通してしまう。
- **判定は `tools/patterns/scan-window.ts` に切り出した。** 必要本数は `2 × swingDepth + 2 × max(minBarsBetweenSwings, 5) + 1`。既定パラメータでの下限は 1hour 以下が 17 本、4hour / 8hour / 12hour が 21 本、日足 23 本、週足 25 本、月足 29 本。既定 `limit=90` ではどの時間足でも発火しない。
- **`content` にも出すのは `data.warnings` が LLM から見えないため**（`.claude/rules/tools.md`）。`summary` / `detailed` / `full` / `debug` の全 view で先頭行に出る。上流 warning（取得層 / 計算層）がある場合は上流が先。`low_detection_count` は従来どおり `structuredContent` のみ（窓が足りていない状況で「`tolerancePct` を緩めろ」は的外れな助言になるため、新しい警告を先に積む）。
- **スキーマの `limit` 下限 20 は変更していない。** 公開契約の変更には alias 猶予期間が要る（`.claude/rules/tools.md` 規約 7）。代わりに `limit` の description に構造的下限を明記した。

### Fixed（**挙動変更**: `detect_patterns` のスキャン窓を直近 `limit` 本に一致させた）
- **走査範囲が `limit + 199` 本から `limit` 本になった（#114）。** `analyze_indicators` は表示窓の前に指標の warmup（`SMA_200` / `EMA_200` のぶん 199 本）を足した配列を返し、その本数を `chart.meta.pastBuffer` で伝える。表示窓が要る側が `slice(pastBuffer)` する契約（`render_chart_svg` の `items.slice(pastBuffer)` が同じ idiom）だが、`detect_patterns` だけがこれを忘れて全件を走査しており、`limit=200` の要求に 399 本を走査してヘッダの `{limit}本から` が虚偽表示になっていた。
- **検出件数が減る。** 合成データ（1day / `limit=90`）で走査 289 本 → 90 本、検出 19→8 件 / 11→5 件 / 17→9 件 / 18→8 件。要求どおりの窓で走査するようになった結果であって取りこぼしではない。`pastBuffer` が取れない場合は 0 に畳んで全件走査へフォールバックする。
- **`meta.scan`（`start` / `end` / `bars`）を追加**し、`content` に `スキャン範囲` 行を出すようにした。ヘッダの `{limit}本から`・`スキャン範囲`・`meta.scan` の 3 者が一致する。
- **ラベル改名: `検出対象期間` → `検出パターン分布期間`。** 旧ラベルはスキャン窓を指しているように読めるため「1時間足で直近1日分がスキャンされていない」という誤読を招いていた。実際は**検出されたパターンの分布**（全 `range.start` の最小 〜 全 `range.end` の最大）であって、データの終端ではない。あわせて `range.end` の意味論を description に明記した。
- **出力インデックス（`pivots[].idx` / `breakoutBarIndex` / `confirmation.idx` / `meta.debug.*`）の基準がスキャン窓で閉じた。** slice 導入前も基準は `chart.candles`（`limit + 199` 本）であって「直近 `limit` 本の中の位置」ではなかったが、`meta.scan` の示す範囲と一致するようになった。
- **副作用（未対応・別 issue）: 日数ベース閾値が窓に対して相対的に厳しくなった。** 各検出器は日数閾値を `barsPerDay` でバー数に換算しており、窓が狭まるとバー数の要求が窓を超える。4hour の既定 `limit=90` では forming triple（124 本必要）と完成済み wedge（151 本必要）が構造上出なくなり（`limit≥151` で復帰）、1hour の forming triple（493 本必要）は最大 `limit=365` でも届かなくなった（実効値は `limit` ではなく `meta.scan.bars`。`pastBuffer` が取れず全件走査にフォールバックした場合のみ `limit` を超えうるが、`analyze_indicators` は常に `pastBuffer` を返すため実運用では起きない）。`detect_doubles` / `detect_hs` の forming は独自の `daysPerBar`（`1day`→1 / `1week`→7 / それ以外→1）を持つため影響を受けていないが、これ自体が intraday と月足で誤っている。

### Changed（`analyze_my_portfolio` の期間損益の入庫件数を `_all_time` で全履歴と明示）
- **`yearly_realized_pnl` / `monthly_realized_pnl` の `priced_deposit_count` / `unpriced_deposit_count` を `priced_deposit_count_all_time` / `unpriced_deposit_count_all_time` に改名した（#85）。** 件数は #77 導入時から全履歴・全銘柄で、description にもそう書いてあった。問題は配置（期間オブジェクト内）と名前が期間スコープに読めること。実口座検証では年初来と月初来に同じ `unpriced 1` が出て、2024 年の未解決入庫が「この期間の数字も汚染されている」と誤読された。値の計算は一切変えていない（命名と description のみ）。
- **「期間内に売却があった銘柄に限定する」案は採らなかった。** 期間内に売却が無くても保有原価には影響しているため、「0 件だから期間の数字は完全」という別の誤読を生む。名前で全履歴と示す方が実態に忠実。
- **旧フィールドは alias として残す。** `priced_deposit_count` / `unpriced_deposit_count` は**同じ値**を出し続けるので、旧フィールドを読んでいるクライアントは壊れない。description に写像先と削除目標バージョン（`0.4.0`、定数は `src/schema/base.ts` の `DEPRECATED_FIELD_REMOVAL_TARGET`）を明記した。猶予期間の考え方は `view` の deprecated alias と同じ（最低 1 リリース かつ 3 ヶ月）。
- **`holdings[].unpriced_deposit_count` / `priced_deposit_count` は改名しない。** 銘柄別・全履歴で、配置と意味が一致している。`closed_positions[]` の同名フィールドも holdings と同義のまま。
- **新設キーは既存キーの後ろに出す。** 旧名は #77 当時の位置に alias として残し、canonical 名は `realized_pnl_unavailable_reason` の後ろに足した（既存消費者の JSON を中間から崩さない）。キー順・description・新旧の一致は `tests/private/unpriced-deposit-count-schema.test.ts` と `tests/private/analyze_my_portfolio.test.ts` で機械的に固定している。
- **内部の受け渡しも `_all_time` に揃えた**（`calcPeriodRealizedPnl` の戻り値 = `PeriodRealizedPnl`）。deprecated な別名は wire 上の互換のためだけに存在する。

### Added（`analyze_my_portfolio` が販売所取引の不可視性を検出・申告する）
- **背景**: bitbank の販売所（即時売買）取引は、本ツールが依拠する REST エンドポイント——約定履歴 `/v1/user/spot/trade_history`、入出金履歴 `/v1/user/{deposit,withdrawal}_history`——のいずれにも一切現れない。実口座の多段検証で確定した事実（#93）。**MCP 単独ではこれを正しく計算することは原理的に不可能**（これらのエンドポイントを組み合わせても販売所取引のデータそのものが存在しないため）なので、本変更の目的は「正しい値を出す」ことではなく「不完全であることを利用者が知れる状態にする」こと。
- **`closed_positions[]`（#92 で追加）に検出専用エントリが混在するようになった。** 入出金履歴（DONE の暗号資産入庫）はあるのに、約定履歴にも現在残高にも現れない銘柄を新たに検出する。#89 で数量不変条件により保有継続中の銘柄の乖離は検出できるようになっていたが、**約定も残高も無い銘柄はどのループにも乗らず検出できなかった**（売却が販売所だけだった銘柄の穴）。この銘柄を `closed_positions` に `{ asset, realized_pnl_unavailable_reason: 'untracked_trade_suspected' }` として追加する——`realized_pnl` を算出する入力（約定履歴）自体が無いため、`realized_pnl` / `priced_deposit_count` / `unpriced_deposit_count` はいずれも `undefined` のまま。新しい配列を作らず既存の `closed_positions` に載せたのは、消費者が読む場所を増やさないため（#92 との統合）。
- **検出は closedSuppressed（入庫日価格を解決できない別銘柄がある場合の抑止、#92）と独立に動く。** 検出エントリは `realized_pnl` を持たず合計に寄与しないため、他銘柄の抑止に道連れにする理由が無い。`closed_position_realized_pnl` / `closed_position_asset_count` が `undefined` の実行でも、検出エントリがあれば `closed_positions` 自体は `undefined` にならない。
- **約定履歴が打ち切られている実行では `untracked_trade_suspected` ではなく `history_truncated` を立てる（CodeRabbit review, PR #95）。** `tradedAssets` は約定履歴から作るため、`tradesTruncated`（件数上限による打ち切り）が立っていると実際の取引所約定の部分集合でしかない。ガード無しだと、取引所で普通に売買しただけの銘柄まで「約定に現れない」と誤検出し「販売所取引の可能性」と断定的に警告してしまう。`qtyMismatchReasonFor` が `history_truncated` を `untracked_trade_suspected` 系より優先する非対称と揃えた。
- **DONE の暗号資産出庫が 1 件でもある銘柄は検出対象から除外する（レビュー対応時に発見、issue #93 の当初スコープには無かった誤検知パス）。** 出庫（他ウォレットへの送付など）だけで残高ゼロが完全に説明できる、販売所と無関係なありふれたケースを「取得漏れの可能性あり」と誤って警告しないための保守的な判断。量の多寡は見ない——代償として、出庫と販売所処分が同一銘柄に混在するケース（例: 一部を外部送付、残りを販売所で売却）は見逃す。取得漏れを見逃す方向にのみ誤り、実在しない懸念を警告する方向には誤らない設計。
- **入出金履歴の取得自体が信頼できない実行では検出を丸ごと止める（`flowUnavailableReason` が立つ実行、CodeRabbit review, PR #95）。** 直前の出庫除外は `dw.withdrawals` の完全性が前提——取得に失敗した、または件数上限で打ち切られた入出金履歴では、除外すべき出庫を見落として誤検出する恐れがある。この実行では `closed_positions` に検出エントリを追加せず、警告も出さない（沈黙も「不完全であることの申告」の一部という判断。他の値を「確度の低いラベル付きで出す」よりも、検出自体を止める方が誤解を招かない）。
- **数量乖離の理由コードに `untracked_trade_suspected` を追加した（`PortfolioCostBasisUnavailableReasonEnum` の末尾）。** 保有継続中の銘柄で、`has_crypto_deposits` / `history_truncated` / `reconstructed_qty_negative`（#89）のいずれにも当てはまらない乖離は、従来 `unknown` に落ちていた。実口座検証の BTC（乖離 0.00041693 = 販売所の買い 3 件の合計と 8 桁一致）もこのケースだった。`qtyMismatchReasonFor` は現在この分岐で `unknown` ではなく `untracked_trade_suspected` を返す（`unknown` は他の判定経路のため enum には残す）。**断定はできない**——同じ乖離パターンは他の要因（例: 履歴に現れない出庫）でも起こりうるため、値の名前・description とも「疑い（suspected）」の強さで表現している。
- **新系統は作っていない。** 既存の `PortfolioCostBasisUnavailableReasonEnum` を 1 値拡張しただけで、`holdings[].cost_basis_unavailable_reason`（保有継続銘柄側）と `closed_positions[].realized_pnl_unavailable_reason`（ゼロ残高銘柄側、新設フィールド）の両方がこの 1 つの enum を共有する。
- **ツール description に既知の制約を明記した。** `analyze_my_portfolio` の description に「販売所（即時売買）の取引は bitbank API に含まれないため、取得原価・実現損益に反映されません」と追記し、利用者が出力を見る前に前提を知れるようにした。
- **残る限界（本 issue でも埋まらない穴）**: **入庫そのものが無く、取引所約定も無く、販売所のみで買い→売りを完結させた銘柄は検出できない。** 入出金履歴にも約定履歴にも痕跡が一切残らないため、本 issue が追加した検出経路（入出金履歴を起点にする）も、既存の数量不変条件（約定・残高を起点にする）も届かない。この限界を解消するには販売所履歴（CSV 等）の追加入力が要るが、ファイル入力の設計判断を伴うため本 issue のスコープ外とした（必要になった時点で別 issue とする）。
- キー順・検算式・独立性・検出の限界は `tests/private/closed-position-breakdown-schema.test.ts`、`tests/handlers/portfolio/calc.test.ts`（`depositOnlyAssets` / `qtyMismatchReasonFor`）、`tests/private/analyze_my_portfolio.test.ts` で機械的に固定している。

### Added（`analyze_my_portfolio` に売り切り銘柄の実現損益の銘柄別内訳を露出）
- **`closed_positions`（`Array<{ asset, realized_pnl, priced_deposit_count?, unpriced_deposit_count? }>`, optional）を追加した。** `closed_position_realized_pnl` は売り切り銘柄（保有ゼロだが約定履歴がある銘柄）ごとに算出した実現損益をループ内で合計に畳んでおり、従来は畳んだ時点で銘柄別の値を捨てていた。#84 マージ後の実口座検証で `closed_position_realized_pnl` が約 -35,867 円変化したが、件数（`closed_position_asset_count`）は不変（13→13）のため原因の切り分けが出力からは永久にできず調査が膠着した（#92）。ループ内では既に銘柄ごとの値を持っているので新規計算は不要——**捨てていたものを出力に載せるだけ**で、計算ロジック自体は一切変えていない。
- **`realized_pnl` が 0 円の銘柄も含める。** `closed_position_asset_count` は寄与のあった銘柄（`realized_pnl !== 0`）しか数えないため、除外すると「ある銘柄が非ゼロ→ゼロに、別の銘柄がゼロ→非ゼロに同時に入れ替わる」ケースで件数の変化が相殺されて見えなくなる——これはまさに本 issue が塞ぎたかった盲点そのものなので、含めないという選択肢は取らなかった。結果として `closed_positions.length` は `closed_position_asset_count` と一致しないことがある（0 円の銘柄がある実行では前者の方が大きい）。Σ `closed_positions[].realized_pnl` = `closed_position_realized_pnl` は 0 を足しても変わらないので、0 円の銘柄の有無に関わらず常に成立する。
- **抑止時（`closedSuppressed`）は内訳も `undefined` にする。** 既存の「部分和を出さない」方針（`total_realized_pnl_unavailable_reason` の description 参照）をそのまま引き継いだ。抑止されなかった銘柄だけの部分配列を出すと、合計は `undefined` なのに内訳の合計だけは計算できてしまい、部分和を「本当の合計」と誤認させるため。
- **`priced_deposit_count` / `unpriced_deposit_count`（holdings と同義）を内訳に載せる。** 売り切り銘柄は `holdings` に載らないため、この 2 フィールドの置き場が無かった（#77 で認識済みの制約）。`closed_positions` がその自然な置き場になる。一方で `cost_basis_unavailable_reason` に相当するフィールドは持たせていない——原価（ひいては `realized_pnl`）を抑止された銘柄はそもそも値を算出できず `closed_positions` に載らないため、理由コードを持つ余地が無い（抑止は「1 件でもあれば内訳全体を undefined にする」という上のルールで表現される）。
- **並び順は `realized_pnl` 降順・同値は `asset` 昇順で決定的にした。** `holdings` の「JPY 評価額降順」に倣い、寄与の大きい銘柄を先頭に出す。
- **summary テキストは変更していない。** 主目的は `structuredContent` での診断能力で、既存の集計行（`Realized PnL (Spot, ...)` / `内訳: 現在保有銘柄 ... / 売り切り銘柄 N銘柄 ...`）に銘柄名を列挙して情報量を増やすことはしない。
- キー順・検算式・並び順・0 円銘柄の扱いは `tests/private/closed-position-breakdown-schema.test.ts` と `tests/private/analyze_my_portfolio.test.ts` で機械的に固定している。

### Fixed（**挙動変更**: `get_candles` が上場前 chunk の 404 に巻き込まれなくなった）
- **上場初年度の銘柄をその年で取得すると、データが存在する年ごと取得失敗になっていたのを直した。** `get_candles` は JST 1 年の窓を UTC 暦年 chunk 2 本で取りに行く（JST 年頭は UTC 前年）ため、上場初年度は**古い側が必ず上場前**になり 404 が返る。旧実装はこれを実失敗に数え、2 年中 1 年の失敗で全体を `fail` にしていた。確率的な失敗ではなく**構造的な確定失敗**で、該当銘柄はその年を永久に取得できなかった（実口座検証で `analyze_my_portfolio` の `total_realized_pnl` が恒久的に算出不能になっていた）。特定銘柄・特定口座の問題ではない。
- **判定基準は「同じリクエストの他 chunk が実データを返したか」。** 「上場前だから 404」と「本来あるはずのデータが 404」は上流応答だけでは区別できない（どちらも `404 + code 10000`）ので、代理指標を置いた。1 本でも返っていれば上流は生きていて経路も正しく、隣接 chunk の 404 は「その期間に足が無い」の表明と読める → ℹ️ 注記に落として過半数判定の分母・分子から外す。1 本も返っていなければ判断材料が無いので従来どおり `fail`。過去期間の `200 + success:0`（「期間は在るが集計が未了」の応答）は実失敗のまま扱う。判定基準の全表は `docs/internal/bitbank-candle-tz.md`。
- **過半数判定の閾値を `>= totalChunks / 2` から「半数超」に直した。** 旧実装は半数ちょうどで発火しながらメッセージは「過半数が失敗」と言っており、文言が誤りだった。**文言ではなく閾値の方を過半数に寄せた**——1 年ぶんの要求は常に 2 chunk なので `>=` だと片方の失敗で必ず全体が落ち、取得できた 1 年ぶんの足ごと捨てる。半数の欠損は失敗 key と原因を列挙した ⚠️ 警告で申告する方が情報量が多い。全滅は手前の全 chunk 失敗の分類が拾うので、緩めても「何も無いのに成功を返す」経路は生まれない。
- **404 を HTTP リトライの対象から外した（`lib/http.ts`）。** 404 は何度叩いても 404 で、上場前 chunk 1 本につきリクエストが 3 倍になり、レート制限を自分で誘発して**同時に走っている他 chunk の成功率まで下げる**。408 / 429 / 5xx / タイムアウトは従来どおりリトライする。
- **影響範囲**: `get_candles` は `analyze_indicators` 経由で多数のツールから使われるため、部分失敗の扱いが変わるのは取得層全体。ただし変わるのは**従来 `fail` していたケースが警告付きの成功になる方向**だけで、成功していたケースの応答は変えていない。`analyze_my_portfolio` の入出庫日価格取得では、2 chunk のうち片方だけが一時的に落ちたケースが `chunkFetchFailed` に載らなくなる（#80 の抑止の粒度そのものは変更していない）。

### Added（`analyze_my_portfolio` に数量不変条件の判定入力を露出）
- **`holdings[].reconstructed_qty` / `qty_invariant_tolerance`（number, optional）を追加した。** `cost_basis_reliable` は「約定・入庫・出庫のリプレイで復元した数量」と「assets API の実残高」の突き合わせ結果だが、従来は**判定結果しか出力に出ておらず入力が見えなかった**ため、消費者は境界付近の判定が妥当かを評価できなかった。実口座検証では `cost_basis` / `avg_buy_price` からの逆算でしか差を追えず（`cost_basis` は整数丸め、`avg_buy_price` は #58 で丸め規則が変わっている）、「API に現れない販売所の買いが本当に落ちているのか」の切り分けが膠着した。値そのものは `calcPnl` が既に返しており、本変更は出力スキーマへの露出と description だけ——**判定ロジック・許容誤差は一切変えていない**。
- **許容誤差を値として出す（差ではなく）。** 許容誤差 `max(10^-amount_precision × 5, 実残高 × 0.1%)` は `amount_precision` から決まるが、**その桁数は出力に含まれていない**ので、式を description に書いても消費者は再現できない。差そのもの（`amount − reconstructed_qty`）は引き算で得られるため別フィールドにせず、代わりに再現できない方（許容誤差）を出した。判定は `|Number(amount) − reconstructed_qty| ≤ qty_invariant_tolerance` で、これが `cost_basis_reliable` と一致することをテストで固定している。
- **`reconstructed_qty` は丸めない。** `amount_precision` で丸めると差が最大 0.5 quanta 動き、絶対項が 5 quanta しかない境界付近で消費者の再計算が判定と食い違う。型は数値のままで `amount`（文字列）に揃えない——`amount` は API の残高文字列の透過、本値はリプレイの計算結果（IEEE754 の 2 進小数）なので、10 進文字列に化かすと存在しない精度を主張することになる。
- **原価を抑止した銘柄でも出す。** 判定の検算という目的からは抑止時こそ入力に価値がある（理由コードだけでは「どれだけ乖離したのか」が読めない）。ただし `dw_fetch_failed` / `dw_history_incomplete` / `deposit_price_fetch_failed` / `deposit_price_chunk_truncated` は**数量不変条件を評価する前**に抑止する経路なので、検算すると許容誤差内なのに `cost_basis_reliable=false` という組み合わせが出る。矛盾ではないことを両フィールドの description に明記した。原価計算の対象外（JPY / `include_pnl=false`）では従来どおり省く。
- **`reconstructed_qty` は 0 でもキーを落とさない。** 「復元したら 0 だった」は判定の入力そのもので、省くと未計算と区別できなくなる（件数フィールド `priced_deposit_count` 等の 0 省略とは別方針。理由を description に書いた）。
- **売り切り銘柄には出さない。** `holdings` に載らないのは #77 の件数フィールドと同じ制約だが、あちらと違い**申告すべき判定結果が無い**（実残高ゼロで数量不変条件の対象外）ため、警告行も足していない。
- **summary / 警告行は現状維持。** 追加先は `structuredContent` だけで、保有数量を text に列挙して増やすことはしない（`.claude/rules/sensitive-data.md` の HIGH 分類。`amount` は従来から出しているので新たな露出増にはならない）。キー順・description・出す条件は `tests/private/reconstructed-qty-schema.test.ts` と `tests/private/analyze_my_portfolio.test.ts` で機械的に固定している。

### Changed（**挙動変更**: `analyze_my_portfolio` が入庫日価格を取得できない銘柄の実現損益を出さない）
- **入庫日を含む年足 chunk を「取りに行けば解決できたはず」なのに解決できなかった銘柄では、`realized_pnl` も確定値として出さないようにした。** 従来この状態は警告行で申告するだけで数値は出していたため、**同じ口座を同じ日に叩いて異なる実現損益が返る**（実口座検証で `total_realized_pnl` が約 6 万円ぶれ、売り切り 13 銘柄の符号が反転した）。入庫 1 件が原価から落ちると移動平均法の取得原価が変わり、その銘柄の**過去の売却の実現損益まで動く**。どちらの値も確定申告に使えない以上、信頼できない数字を確定値として出さないのが正しい（#54 と同じ考え方）。
- **抑止は既存の null 化経路（`PortfolioCostBasisUnavailableReasonEnum`）に接続した。** 新設値は `deposit_price_fetch_failed`（年足 chunk の取得に失敗した。実行ごとに成否が変わる）と `deposit_price_chunk_truncated`（年 chunk が件数上限 `MAX_DEPOSIT_FLOW_PRICE_YEAR_CHUNKS=64` に達して取りに行けなかった）の 2 値で、enum の末尾に足してある（公開済みの列挙順を中間から崩さない）。**この 2 値だけは原価由来 4 フィールドに加えて `realized_pnl` も `undefined` になる**——他の理由コードとの非対称は description に明記した。数量不変条件より先に判定するので、`has_crypto_deposits` と同時に成立する構成では抑止が広いこちらが載る。
- **上限切り落としも抑止対象に含めた。** 上限は決定的（同じ入力なら同じ結果）で再現性の問題は起きないが、**原価に入るはずの入庫が落ちている**点は取得失敗と同じで、その `realized_pnl` は確定申告に使えない。境界は「取りに行けば解けたはず ＝ 抑止」「取りに行っても解けない ＝ 従来どおり値を出して件数で申告」に引いた。理由コードは 2 系統を分けてあるので、読み手は「再実行すれば直るのか」を区別できる。
- **恒久的に解決できない未算入（上場前・当日足の欠損）は抑止しない。** 抑止すると当該銘柄の取得原価が永久に出せなくなるため、#57 / #77 の「値を出して `unpriced_deposit_count` と警告行で不完全さを申告する」判断を維持する。これに合わせて `fetchFlowDatePrices` の分類も直した: `get_candles` が `errorType='user'` で失敗するケース（`No candle data returned` / `before bitbank service start` / HTTP 404 ＝ その年に足が存在しない）は**取得失敗に数えない**。従来は年 chunk が丸ごと空だとこれを取得失敗に数えており、`FlowDatePrices.chunkFetchFailed` の「上場前・データ欠損はここには入らない」という自らの規約と食い違っていた。
- **合計値は部分和を出さず、合計ごと `undefined` にする。** 抑止した銘柄を**除外しても含めても**口座の実現損益にはならない（含めれば実行ごとに変わり、除外すれば「全銘柄」を名乗る部分和になる）。対象は `total_realized_pnl` / `account_pnl.spot_realized_pnl` / `account_pnl.total` と、抑止した銘柄が**その期間に売却している**場合の `yearly_realized_pnl` / `monthly_realized_pnl` の `realized_pnl` および `yearly_account_pnl` / `monthly_account_pnl` の `spot_realized_pnl` / `total`。期間内に売却が無ければ原価が欠けても値は動かないので抑止しない（抑止範囲を必要最小限に絞る）。
- **売り切り銘柄が抑止対象なら `closed_position_realized_pnl` / `closed_position_asset_count` も `undefined` にする。** `holdings` に載らない銘柄は抑止フィールドの置き場が無く、合計を落とすことでしか申告できない。
- **検算式 `Σ holdings[].realized_pnl + closed_position_realized_pnl = total_realized_pnl` は抑止実行では成立しない。** 抑止した銘柄の項が両辺から落ちるため。壊れることと理由を `total_realized_pnl_unavailable_reason` / `holdings[].realized_pnl` / `closed_position_realized_pnl` の description に明記した。
- **抑止理由を機械可読に出す新設キーを追加した**（いずれも既存キーの後ろに宣言）: `total_realized_pnl_unavailable_reason`、`account_pnl.spot_realized_pnl_unavailable_reason`（`yearly_account_pnl` / `monthly_account_pnl` も同様）、`yearly_realized_pnl.realized_pnl_unavailable_reason`（`monthly_realized_pnl` も同様）。銘柄が理由ごとに割れる合計値では `deposit_price_fetch_failed` を優先して載せる（再現性が無い方が重い）。
- **`account_pnl.spot_realized_pnl` / `total` と `*_realized_pnl.realized_pnl` が optional になった**（従来は必須）。抑止していない実行では従来どおり値が入るので、抑止理由コードを見ないクライアントも通常時は壊れない。信用側の 4 フィールド（`margin_*`）は現物と独立に確定するので抑止時もそのまま出す。
- **既存の警告文言を実態に合わせて更新した。** 「再実行で解消すると取得原価と実現損益が変わります」は確定値を出す前提の文だったので、**確定値を出していない**ことと抑止したフィールド・銘柄名・件数（金額は出さない。`.claude/rules/sensitive-data.md` の HIGH 分類）を書く文に差し替えた。summary の `Realized PnL (Spot, …)` / `Account PnL (全履歴)` も金額の代わりに「算出不能（理由）」を出す（テキストしか読まない LLM には金額が唯一の手掛かりなので、部分和を見出しに載せない）。
- **根本対応（chunk 取得のリトライ）は別 issue。** リトライを入れても取得失敗はゼロにならないので、本変更の抑止は独立して必要。
- 判定に使う資産別内訳として `FlowPriceShortfall.depositsByAsset` を追加した（出庫は表示専用で銘柄単位の抑止対象にならないため内訳を持たない）。契約は `tests/private/unresolved-deposit-suppression-schema.test.ts`、挙動は `tests/private/analyze_my_portfolio.test.ts` / `tests/handlers/portfolio/calc.test.ts` / `tests/handlers/portfolio/fetch.test.ts` で機械的に固定している。

### Added（`analyze_my_portfolio` に原価へ算入できなかった入庫の件数を露出）
- **`holdings[].unpriced_deposit_count` / `priced_deposit_count`（number, optional）を追加した。** `calcPnl` は入庫日（`confirmed_at`）の始値を解決できた入庫だけを取得原価に算入し、解決できなかったものは**算入せず件数だけ数える**（嘘の原価を作らない設計）。従来この件数は `qtyMismatchReasonFor` の内部判定にしか使われておらず出力に出ていなかったため、消費者は「この銘柄の `cost_basis` / `realized_pnl` が何件の入庫を原価に含めずに算出されたのか」を知る術がなかった。`realized_pnl` は確定申告に使われうる数字で、同じ値でも「全入庫を原価算入した結果」と「入庫 n 件を原価ゼロ扱いで除外した結果」では意味がまったく違う。
- **`cost_basis_reliable: true` と `unpriced_deposit_count > 0` は同時に成立する。** 数量不変条件は許容誤差 `max(10^-amount_precision × 5, 実残高 × 0.1%)` 内の乖離を通すため、未算入の入庫が許容誤差に収まった銘柄では**原価が不完全でも確定値が出る**。これは矛盾ではなく本変更が可視化したい状態で、`cost_basis_reliable`（復元数量が実残高と一致するか）と `unpriced_deposit_count`（原価が全入庫を含むか）は別軸。`cost_basis_reliable` の description にも「true は『原価が全入庫を含む』ではない」旨を追記した。
- **既存の理由コード enum（`PortfolioCostBasisUnavailableReasonEnum`）とは別軸**なので値を足していない。あちらは「原価を出せなかった」理由、本フィールドは「原価は出したが不完全」の度合いを表す。
- **合計値には含める（除外しない）。** `total_cost_basis` / `total_unrealized_pnl` / `total_realized_pnl` は原価が不完全な銘柄も集計に含めたうえで、`meta.warnings` と summary の警告行（銘柄名と件数のみ、金額は出さない）で申告する。許容誤差内の微小な未算入で銘柄まるごと合計から消える方が実害が大きいための判断で、方針は各フィールドの description に明記した（数量乖離で原価を抑止した銘柄は従来どおり合計から除外する）。
- **`yearly_realized_pnl` / `monthly_realized_pnl` にも同じ 2 キーを追加した。** 移動平均法は期間開始前の入庫も原価に積むため、期間実現損益の算出条件も全履歴のリプレイで決まる。件数は全履歴・全銘柄の合計（売り切り銘柄も含むため `holdings[]` の合計より大きくなることがある）。
- **売り切り銘柄の未算入入庫も警告行に出す。** `holdings` に載らないので件数フィールドの置き場は無いが、`realized_pnl` は `closed_position_realized_pnl` / `total_realized_pnl` に入るため、算出条件の申告だけは落とさない。
- **値が 0 のときはキーごと落とす。** 入庫が 1 件も無い銘柄の出力は従来と JSON 一致する。新設キーは既存キーの後ろに宣言してあり（`z.object` の parse は宣言順でオブジェクトを組み直すため）、キー順・description・警告行は `tests/private/unpriced-deposit-count-schema.test.ts` と `tests/private/analyze_my_portfolio.test.ts` で機械的に固定している。

### Added（`analyze_my_portfolio` の信用コスト項を `_cost` サフィックスへリネーム）
- **`account_pnl.margin_interest_cost` / `margin_fee_cost` を追加した**（`yearly_account_pnl` / `monthly_account_pnl` も同様）。従来の `margin_interest` / `margin_fee` は JSON では**正値**なのに summary では `-149円` と負で表示され `total` でも減算されるため、`structuredContent` を直読みする消費者が符号規約を知らずに**足し算**してしまうリスクがあった（計算そのものは従来から正しい）。`_cost` サフィックスで「コスト = 正値・`total` では減算」という規約を名前に出す。
- **値・符号・`total` の計算は一切変えていない**（命名と description の改善のみ）。`total = spot_realized_pnl + margin_realized_pnl − margin_interest_cost − margin_fee_cost` を `total` の description に明記し、新フィールドの description には符号規約を書いた。
- **旧フィールドは alias として残す。** `margin_interest` / `margin_fee` は**同じ正値**を出し続けるので、旧フィールドを読んでいるクライアントは壊れない。description に写像先と削除目標バージョン（`0.4.0`、定数は `src/schema/base.ts` の `DEPRECATED_FIELD_REMOVAL_TARGET`）を明記した。猶予期間の考え方は `view` の deprecated alias と同じ（最低 1 リリース かつ 3 ヶ月）。
- **「負値で持つ」案は採らなかった。** 素直に足し算できる利点はあるが、**同じフィールド名で符号の意味が変わる**変更は `.claude/rules/tools.md` §7 のとおり alias では救えず、旧フィールドを読み続けるクライアントに黙って符号反転が届く。やるなら一度削除して validation error を経由させる必要があり、コストが見合わない。
- **新設キーは既存キーの後ろに出す。** `PeriodAccountPnlSchema` は `AccountPnlSchema.extend()` だと `period_start` の**手前**に新キーが入るため、shape を明示的に組み直して `period_end` の後ろに置いた（既存消費者の JSON を中間から崩さない）。キー順・description・新旧の一致は `tests/private/account-pnl-schema.test.ts` と `tests/private/analyze_my_portfolio.test.ts` で機械的に固定している。
- **summary のラベルも `Interest cost:` / `Fee cost:` に揃えた。** 表示は `total` への寄与を表すので `-` 前置は従来どおり。信用未使用（すべてゼロ）の口座では Margin 内訳行そのものが出ないため、出力は従来と一致する。
- **内部の受け渡しも `_cost` に揃えた**（`calcMarginPnl` / `calcPeriodMarginPnl` の戻り値、`buildAccountPnl` / `buildPeriodAccountPnl` の引数 = 新設の `MarginPnlTotals`）。deprecated な別名は wire 上の互換のためだけに存在する。

### Added（`analyze_my_portfolio` の資産推移に入出金フローマーカー）
- **`monthly_equity_series[].flow_jpy` / `yearly_equity_series[].flow_jpy`（number, optional）を追加した。** 資産推移シリーズは入出金があった期間でも単一の連続線として出るため、大口入金のある口座では「ずっと同額を保有していた」ように誤読される（グラフ化されると注記行は消える前提なので、フロー発生点を**データとして**返す）。正 = 純入金、負 = 純出金。
- **フローを載せる向きは「この点から次の点まで」。** `reconstructHoldingsAtDate` は「点の時刻以降」の入出金を巻き戻すため、点 P の `value_jpy` には P 以降の入出金が入っていない。この向きにすると不変条件 `value_jpy[i+1] - value_jpy[i] - flow_jpy[i] = 区間 i の市場変動` が成立し、かつ `timestamp` が入出金の発生日（月次点なら発生月）そのものを指す。最終点（現在のリアルタイム評価額）は次の点が無いため常に付かない。
- **定義は `*_performance.net_flow_jpy` と揃えた**（元本移動のみ、出金手数料を含まない）。手数料コストは上式の残差に市場変動と一緒に残る（`adjusted_change_jpy` の扱いと同じ）。暗号資産の入出庫は `resolveFlowPrice` で JPY 換算し、**入出庫日の始値を解決できなかった分は現在価格にフォールバックしたうえで計上する**（`flow_jpy` は全額が入出庫日で固定された評価額とは限らない。フォールバック件数は既存の `meta.flowValuationFallbackCount` / summary 先頭の「n 件は現在価格で仮評価」が申告する）。日付キーは `portfolioDayStartMs`（JST 暦日境界）でシリーズの点と揃える。
- **申告経路は増やしていない。** 価格を解決できなかった入出庫は計上せず、資産名は同じ期間を張る `*_performance.unpriced_flow_assets`（月次シリーズ ↔ `monthly_performance`、年次シリーズ ↔ `yearly_performance`）で申告済み。
- **入出金履歴が欠けている構成では全点でキーが落ちる。** 判定は `flowUnavailableReasonFor` と同一（取得失敗 / 一部チャネル失敗 / 件数上限による打ち切り）。取得できた部分集合だけを合計すると、`*_performance` が「純入出金: 未計測」と言っている応答で点だけが確定値を主張する自己矛盾になり、たとえば暗号資産出庫チャネルだけが落ちた構成では「入金しかない口座」に見えるため。この状態は `*_performance.flow_measured=false` / `flow_unavailable_reason` と summary の「入出金を巻き戻せていません」行が表す。
- **同じ区間の入金と出金は純額で相殺する**（日次点ならその日、月次点ならその月の純額）。フローが 1 件も無い期間の出力は従来と JSON 一致する（キーが増えない）。
- **キーの不在は「マーカーを出していない」であって「入出金が無かった」ではない。** (1) その区間に対象の入出金が無い / (2) 入金と出金が相殺して純額がゼロに丸まった / (3) その区間の入出庫がすべて価格解決できず計上対象が残らなかった / (4) 最終点（区間が空） / (5) 入出金履歴が欠けていて全点で抑止した、のいずれか。(1)〜(4) は「計測できたうえでマーカーが立たない」、(5) は「そもそも計測していない」で意味が異なり、**`flow_jpy` の有無だけでは区別できない**（区別には `*_performance.flow_measured` / `flow_unavailable_reason` を見る）。
- **summary の資産推移シリーズにマーカー行と読み方を追加した。** フローのあった点に `← 純入出金 +500,000円` を付け、見出しに「運用成績ではないのでグラフではマーカーとして扱い、線の変動として説明しない」を添える。フロー発生点が 1 つも無いシリーズでは注記もマーカーも出さず、従来と同じ行のまま。

### Changed（**挙動変更**: `analyze_my_portfolio` の暗号資産入庫を取得原価に算入する）
- **暗号資産の入庫を「入庫日（`confirmed_at`）の 1day 始値で取得した」とみなして取得原価に算入するようにした。** 従来は入庫が `calcPnl` のイベントに存在せず、入庫ぶんの保有が**原価ゼロ**で積まれていた（含み益が過大、売却時は売却収入がそのまま実現損益）。対象は `holdings[].cost_basis` / `avg_buy_price` / `unrealized_pnl` / `unrealized_pnl_pct` / `realized_pnl`、`data.total_cost_basis` / `total_unrealized_pnl`、`yearly_realized_pnl` / `monthly_realized_pnl` と口座全体 PnL。入庫は取得側のイベントなので実現損益には計上しない。
- **入庫日の始値を解決できない入庫は原価に算入しない。** 現在価格へのフォールバックは**原価には使わない**——現在価格で原価を作るとその入庫ぶんの評価損益が常にゼロ付近に貼り付き、相場連動の誤差を `cost_basis` に持ち込むため。算入しなかった入庫は従来どおり数量不変条件で検出され、`cost_basis_unavailable_reason=has_crypto_deposits` として申告される（嘘の原価を作らない）。ただし抑止が掛かるのは**復元数量が許容誤差を超えて乖離したときだけ**なので、未算入の入庫が許容誤差以内に収まる銘柄では `cost_basis` がその分だけ過小のまま出る点は従来と同じ。
- **`has_crypto_deposits` の意味が変わった。** 従来の「該当銘柄に DONE の暗号資産入庫がある」から「該当銘柄に**入庫日の始値を解決できなかった** DONE の暗号資産入庫がある」へ。入庫日の始値で算入できた入庫は数量にも原価にも入るため、乖離の説明にはならず本値は立たない。enum 値・フィールドは不変で、意味の範囲が狭まる（従来 `has_crypto_deposits` が立っていたケースの多くは、原価が確定値として出るようになる）。summary / `meta.warnings` の原因表示も「暗号資産の入庫あり」→「入庫日の価格を解決できない暗号資産の入庫あり」に変えた。
- **`include_pnl: true` のとき、入庫日価格の解決対象が全履歴の入庫に広がった。** 移動平均法は期間開始前の入庫も積み上げるため、`include_deposit_withdrawal: false` でも入庫は全履歴を換算する（出庫は従来どおり年初来のまま——全履歴で金額換算する消費者がいない）。追加取得は入庫が実在する (資産, 年) の組のみ・上限 `MAX_FLOW_PRICE_YEAR_CHUNKS = 12` で従来と同じ。
- **summary の注記行を更新した。** 「評価損益は全履歴の約定・暗号資産出庫から移動平均法で算出した取得原価ベース」→ 入出庫を含む旨と、**入庫ぶんは「入庫時点の相場で取得した」という仮定であり真の取得原価ではない**旨を明記する。現在価格フォールバックの警告行にも「取得原価には算入しない」ことを添えた。

### Changed（**挙動変更**: `analyze_my_portfolio` の暗号資産入出庫を「入出庫日の価格」で評価する）
- **暗号資産の入出庫を入出庫日（入庫: `confirmed_at` / 出庫: `requested_at`）の 1day open で JPY 換算するようにした。** 従来は現在価格での仮評価だったため、誤差が相場と連動して動く系統的バイアスになっていた（取引ゼロでも相場上昇だけで報告損益が悪化する）。対象は `deposit_withdrawal_summary.crypto_deposit_estimated_jpy` / `net_jpy_invested` / 口座全体リターン、`yearly_dw_summary` / `monthly_dw_summary` の `crypto_{deposit,withdrawal}_estimated_jpy`、`*_performance` の `net_flow_jpy` / `withdrawal_fee_jpy` / `adjusted_change_jpy`。出庫手数料も元本と同じ単価で換算する（元本だけ入出庫日・手数料だけ現在価格の混成にしない）。
- **入出庫日価格が直近 400 日窓の外にある場合は (資産, 年) 単位で 1day chunk を追加取得する。** 追加取得は入出庫が実在する組だけに絞り、上限（`MAX_FLOW_PRICE_YEAR_CHUNKS = 12`）を超えた分と取得に失敗した分は現在価格にフォールバックする。**フォールバックは黙って混ぜず件数で申告する**（下記）。
- **価格解決の下限時刻は入庫と出庫で別々。** 入庫は入出金分析セクション（純投入額・口座全体リターン）が全履歴を換算するのに対し、**出庫を金額換算する消費者は期間集計だけ**（`*_dw_summary` / 期間ネットフロー）で、`deposit_withdrawal_summary` は暗号資産出庫を `crypto_withdrawal_count` として件数しか出さない。年初より前の出庫は換算しても反映先が無いため対象外にする（`FlowValuationScope`）。
- **価格解決は換算結果を出力するセクションがあるときだけ走る。** 入出金分析セクション（全履歴）と期間ネットフロー（年初来）のどちらも消費しない構成——`include_deposit_withdrawal: false` かつ入出金履歴の部分失敗・打ち切りで純入出金が未計測になるケース——では追加取得も `*_valuation` / `meta.flowValuationBasis` の申告も行わない（どの出力にも載っていない評価額を申告しない）。
- **`include_pnl: false` + `include_deposit_withdrawal: true` でも candle を取得するようになった。** 入出金分析セクションの暗号資産入庫を入庫日価格で評価するために必要（従来この構成では candle を一切取得していなかった）。取得は入庫が実在する (資産, 年) の組のみで、上限は上記と同じ。`include_deposit_withdrawal: false` の構成では期間ネットフローに要る年初以降の入出庫だけに絞る。
- **`*_valuation`（`FlowValuation`）を追加した**: `deposit_withdrawal_summary.crypto_deposit_valuation` / `yearly_dw_summary` / `monthly_dw_summary` の `crypto_deposit_valuation` / `crypto_withdrawal_valuation` / `*_performance.flow_valuation`。`deposit_date_price_count` / `current_price_fallback_count` / `basis`（`deposit_date_price` / `current_price_fallback` / `mixed`）を持つ。暗号資産の入出庫が無い、または全件で価格を解決できなかった場合はキーごと落ちる（従来出力と JSON 一致）。
- **`meta.flowValuationBasis` / `meta.flowValuationFallbackCount` を追加した。** レスポンス全体で換算した入出庫の集計値。現在価格フォールバックが 1 件でもあると `meta.warnings` と summary 先頭に「n 件は現在価格で仮評価」を出す（各セクションの内訳は互いに部分集合なので、件数は母集合を 1 度だけ数える）。
- **`*_performance.note`（`PERFORMANCE_NOTE`）と summary の注記行の文言を更新した。** 「暗号資産入出庫は現在価格で仮評価」→「入出庫日の始値で JPY 換算し、その日の価格を取得できなかった分のみ現在価格で仮評価」。
- **「入庫時点の相場で取得した」という仮定であることは引き続き注記する**（真の取得原価ではない）。`calcPnl` への入庫原価算入は後続の変更（#57 (b) / 上記ブロック）で入った。

### Added（`analyze_my_portfolio` の数量不変条件: 復元数量 vs 実残高の突き合わせ）
- **`holdings[].cost_basis_reliable`（boolean）を追加した。** `calcPnl` が約定・出庫リプレイで復元した保有数量と assets API の実残高（`onhand_amount`）を恒久的に突き合わせ、許容誤差 `max(10^-amount_precision × 5, 実残高 × 0.1%)`（絶対項 = 端数処理・ダスト、相対項 = 浮動小数点誤差の許容）を超えて乖離した銘柄は `false` になる。乖離時は `cost_basis` / `avg_buy_price` / `unrealized_pnl` / `unrealized_pnl_pct` を確定値として出さず（#54 の null 化経路）、`total_cost_basis` / `total_unrealized_pnl` の集計からも除外して銘柄名のみを `meta.warnings` と summary の警告行で申告する。原価計算の対象外（JPY / `include_pnl=false`）では省略。フィードバックの ETH 型（約 1000 倍乖離）が確定値のまま素通りしていた検知の穴を塞ぐ。
- **理由コード enum を拡張した**（`holdings[].cost_basis_unavailable_reason`）: `has_crypto_deposits`（該当銘柄に DONE の暗号資産入庫があり原価計算に入っていない。#57 (b) 以降は「入庫日の始値を解決できなかった入庫がある」に意味が狭まる）/ `history_truncated`（約定履歴の件数上限打ち切り）/ `unknown`（原因を特定できない。例: 履歴に現れない出庫）。入出金取得起因の既存 2 値（`dw_fetch_failed` / `dw_history_incomplete`）と同一フィールドで返し、取得起因の抑止が掛かる場合はそちらが優先される。数量乖離側の 3 値は銘柄単位でのみ立ち、`total_cost_basis_unavailable_reason` / `*_performance.flow_unavailable_reason` / `meta.flowDataUnavailableReason` には現れない。

### Changed（**挙動変更**: `analyze_my_portfolio` の入出金履歴取得を `include_pnl` に紐づけた）
- **`include_deposit_withdrawal` は入出金分析セクションの表示制御だけになった。** 従来は同フラグが入出金履歴の取得可否まで握っており、`false` にすると暗号資産の出庫履歴が `calcPnl` に渡らず取得原価が過大化し、期初評価額・資産推移シリーズも入出金を巻き戻せていなかった（`include_pnl` との偽の直交性）。今後は `include_pnl: true` なら同フラグの値に関わらず入出金履歴を取得して損益計算に供給する。`false` で抑止されるのは `deposit_withdrawal_summary` / `yearly_dw_summary` / `monthly_dw_summary` / 口座全体リターンの出力のみ。
- **`include_pnl: true` のとき入出金 API の呼び出しが増える**（暗号資産入庫 / JPY 入金 / 暗号資産出庫 / JPY 出金 の最大 4 チャネル × ページネーション）。既存の並列 `Promise.all` に載せてあるためレイテンシ増は最小。`include_pnl: false` では従来どおり `include_deposit_withdrawal` が取得可否を決める。
- **`meta.dwFetchedForPnl`（boolean）を追加した。** `meta.depositWithdrawalStatus` は分析**セクション**の状態を表すため、`include_deposit_withdrawal: false` では履歴を取得済みでも `not_requested` になる。内部取得の成否はこの新フィールドで申告する。
- **理由コード `withdrawal_history_not_fetched` を削除した**（`holdings[].cost_basis_unavailable_reason` / `data.total_cost_basis_unavailable_reason` / `*_performance.flow_unavailable_reason` / `meta.flowDataUnavailableReason`）。入出金履歴を「取得していない」状態が損益出力と併存しなくなったため。取得が落ちた場合は `dw_fetch_failed` に落ちる。

### Security
- **取引系 HITL の trust-host 経路を撤去した。** `BITBANK_TRUST_HOST_APPROVAL=1` でも `confirmation_token` を `structuredContent` に載せない。SEP-1865 iframe 起源の `tools/call` をサーバー側で識別できないため、token 露出は HITL バイパスになる。execute は elicitation / MRTR のユーザー明示 accept のみ。`create_order` / `cancel_order` / `cancel_orders` の MCP handler は常に `direct_execute_forbidden` で拒否する。環境変数は設定しても無視される（後方互換のため `isHostApprovalTrusted()` は常に `false` を返す）。

### Schema (breaking)（`view` の語彙をツール間で統一）
- **`view` の語彙をツール間で統一した。** `view` は**出力量の 1 軸**のみを表し、`summary` < `detailed` < `full` の順序で、**`full` は常にそのツールの最重量**を意味する。従来は同じ語が別の重さを指していた（`get_candles` の `full` は既定の通常表示、`get_flow_metrics` の `full` は全バケット列挙で約 1,440 行、`get_transactions` の `summary` は全件列挙）。LLM が `view` からトークン量を見積れず、`src/prompts/intermediate.ts` は `get_flow_metrics` に存在しない `view=detailed` を指示していた（この 1 件は先行して修正済み）。
- **旧値は deprecated alias として受理し続ける。** ハンドラ入口で新しい指定へ正規化するので、**旧値経由の既定挙動は変わらない**。**`0.4.0` で削除予定**（最低 1 リリース かつ 3 ヶ月の猶予）。写像は以下のとおり。

  > **表の「不変」の基準は、下記「`view` は `content` のみを変え、`structuredContent` を変えない」の修正を適用した後の挙動**（= 旧値と写像先を同一リリース内で突き合わせたときに一致する、の意）。**前リリースからの wire 契約の差分は別にある**——同リリースで `get_flow_metrics(view=summary)`（**既定値**）の `structuredContent` に `data.series.buckets` が戻り、`view=compact` の `series.buckets` が全バケットになる。`structuredContent` を読むクライアントは、語彙統一の表だけでなくそちらの項も確認すること。

  | ツール | 旧値 | 新しい指定 | `content` | `structuredContent` |
  |---|---|---|---|---|
  | `get_candles` | `items` | `view=full` + `format=json` | 不変 | **変わる**（下記） |
  | `get_transactions` | `summary`（旧既定） | `view=full` | 不変 | 不変 |
  | `get_transactions` | `items` | `view=full` + `format=json` | 不変 | 不変 |
  | `get_flow_metrics` | `compact` | `view=full` + `nonZeroOnly=true` | **バケット行は不変。ヘッダ 2 行が増える** | 不変 |
  | `get_flow_metrics` | `buckets` | `view=detailed` | 不変 | 不変 |

  `compact` で増える 2 行は `PAIR Flow Metrics (bucketMs=…)` と `Totals: …`。上の「上位ビューは下位ビューの上位集合」の修正で `full` に入ったヘッダで、**減る要素は無い**。バケット行——どのバケットを出すか / 欠損の連続区間の 1 行への畳み込み（`⋯ 欠損 A〜B（Nバケット, データなし）`）/ 真のゼロの除外——は 1 バイトも変わらない。
- **量以外の軸を別パラメータへ切り出した**: `format`（`text` / `json`、`get_candles` / `get_transactions`）、`nonZeroOnly`（boolean、`get_flow_metrics`）。切り出したことで、旧 enum では表現できなかった組み合わせ（`view=detailed` + `nonZeroOnly=true` など）も表現できるようになった。`debug`（`detect_patterns`）と `beginner`（`get_volatility_metrics`）は出力を**置換**する**階梯外の値**として `view` に残す。
- **`format=json` はトークン削減オプションではない。** 同じデータを pretty JSON にすると散文の圧縮形式より必ず増える（`get_candles` の実測で約 7.4 倍）。「機械可読性のために**トークンを払う**」オプションであることを description に明記した。
- **`get_candles(view=items)` の `structuredContent` shape が変わる（本リリース唯一の shape 破壊）。** **旧 `items` だけが逸脱していたのを解消するもので、`format` が `structuredContent` を変えるようになったわけではない。** 移行後は `view` / `format` のどの組み合わせでも同一の `Result` 封筒を返す。

  | 指定 | `content[0].text` | `structuredContent` |
  |---|---|---|
  | `view=full` + `format=text`（既定） | サマリ本文 ＋ 先頭 5 本の JSON サンプル | `Result` 封筒（`ok` / `summary` / `data.{raw,normalized,keyPoints,volumeStats}` / `meta`） |
  | `view=full` + `format=json` | 全件の pretty JSON | **同上（同一）** |
  | `view=items`（deprecated alias） | 同上 | **同上（同一）** |

  **旧 `items` は `{ items, meta }` を返し `ok` / `summary` / `data.{raw,keyPoints,volumeStats}` を落としていた。旧 shape に依存するクライアントは `structuredContent.items` → `structuredContent.data.normalized` の読み替えが必要。** この 3 通りが deep-equal であることは `tests/view-structured-content-invariance.test.ts` で固定してある。（`get_transactions(view=items)` は元から封筒を保持しており、こちらは不変）
- **`get_transactions` の default が `summary` → `full` に変わる（挙動は不変）。** 従来の `summary` は「返却した全約定を 1 行 1 件で列挙」であり、実体は `full` だった。外れ値だったのは default ではなく**名前**で、名前を階梯に合わせたことで `get_candles` と default が揃う。`summary`（集計のみ）は将来別リリースで **opt-in 専用**として新設予定（既定にはしない）。**同じ語の意味を差し替えないため、`summary` は alias 期間の削除後にのみ再導入する**——旧値を送り続けたクライアントに黙って別の応答が返るのを避けるため。
- **生データ系ツール（`get_candles` / `get_transactions`）の既定は今後も全件列挙のまま。** `content[0].text` が LLM への唯一のチャネルであり（`.claude/rules/tools.md`）、既定を軽くすることは「応答を短くする」ではなく「**LLM が OHLCV / 約定明細を一切受け取らなくなる**」を意味するため。過去に `get_volatility_metrics` で軽量な一行要約を既定にして差し戻した実例がある。
- **description を統一文言に揃えた。** 各 `view` に「この view では〇〇が `content` に出ない」を明記し、deprecated 値には写像先と削除目標バージョン（`0.4.0`）を書いた。共通文言は `src/schema/base.ts`（`VIEW_CONTRACT_NOTE` / `FORMAT_PARAM_NOTE` / `deprecatedViewNote()`）を単一ソースにしている。あわせて **`detect_macd_cross` の `view` が `pair` 省略時（スクリーニングモード）でのみ有効で、`pair` 指定の単一ペア深掘りモードでは無視される**ことを明記した（従来 `inputSchema` にもハンドラの型にも書かれていなかった）。
- **`get_tickers_jpy` の `view`（`items` / `ranked`）は対象外。** 量でも形式でもなく**射影**（並び順と `data.ranked` の有無）を指しており、`view` という名前自体が誤用のため。改名は別途扱う。
- **語彙統一そのものが既定の応答を変えるツールは無い。** 本項で変わるのは deprecated alias 経由の `get_flow_metrics(compact)` で `content` のヘッダ 2 行が増える点（減る要素は無い）と、`get_candles` の `format=json` / `view=items` の `structuredContent` shape だけ。**ただしリリース全体で見ると `get_flow_metrics(view=summary)`（既定値）の `structuredContent` は変わる**——下記「`view` は `content` のみを変え、`structuredContent` を変えない」の修正で `data.series.buckets` が戻るため。
- **再発防止**: 横断テスト `tests/view-alias-mapping.test.ts` を追加し、上の写像表どおり旧値と新しい指定の応答が一致することを固定する。`get_flow_metrics` は**真のゼロと欠損区間を両方含むフィクスチャ**で検証する——「非ゼロだけにフィルタしてから全件レンダラに渡す」素朴な実装では欠損の畳み込みが失われて N 行に展開されるため、この 2 つが同時に無いと検出できない。あわせて `tests/view-content-superset.test.ts` の階梯包含テストを `detect_patterns`（`summary` ⊆ `detailed` ⊆ `full`）へ横展開し、`tests/view-structured-content-invariance.test.ts` の `get_candles` ケースを「既知の逸脱を固定する」形から他ツールと同じ deep-equal へ置き換えた。

### Fixed（`view` の階梯: 上位ビューは下位ビューの上位集合）
- **`get_flow_metrics(view=buckets / full)` の `content` に、最終約定価格・スパイク上位 3 件の詳細・4 行フッタ（含まれるもの / 含まれないもの / 補完ツール / 加工契約）が出るようになった。** 従来は上流の `res.summary` を捨てて短いヘッダ（`PAIR Flow Metrics (bucketMs=…)` ＋ `Totals:` ＋ 警告行）を組み直していたため、**軽い view（`summary` / `compact`）には出ているこれらの定型情報が、重い view でだけ消えていた**。`res.summary` をベースにバケット行を足す形（`compact` と同じ組み立て）に変更した。バケット行の直前に置く `Flow Metrics (bucketMs=…)` ヘッダと `Totals:` 行は従来どおり出る（警告行は `res.summary` が同じ文言を含むため重複させない）。
- **`get_volatility_metrics(view=detailed / full)` の `content` に 4 行フッタ（含まれるもの / 含まれないもの / ATR の定義 / 補完ツール）が出るようになった。** 従来は本文を再構築する際にフッタを落としていた。文言は `tools/get_volatility_metrics.ts` の `VOLATILITY_METRICS_FOOTER` を単一ソースにし、`summary`（上流 `res.summary` をそのまま流す）と `detailed` / `full`（ハンドラが組み立てる）で食い違わないようにした。
- **`content[0].text` は LLM への唯一のチャネル**（`.claude/rules/tools.md`）なので、上位 view で定型情報が消えるのは「表示が変わる」ではなく「LLM が最終値・スパイク詳細・『含まれないもの』『補完ツール』『加工契約』を受け取らなくなる」に等しい。`view` を上げたら情報は減らない、を契約にした。
- **既定の `content` が変わるツールは無い。** 変わるのは `get_flow_metrics` の `buckets` / `full`（既定は `summary`）と `get_volatility_metrics` の `detailed` / `full`（既定は `summary`）だけで、いずれも**増える方向のみ**——従来の出力はそのまま残り、消えていた定型情報が加わる。`structuredContent` は全 `view` で従来どおり不変。
- **階梯外の view は対象外**: `get_volatility_metrics(beginner)` と `detect_patterns(debug)` は「出力の置換」であり上位集合である必要がない。平易な言い換えである `beginner` に専門用語のフッタを足すのはその view の目的に反するため、意図的に足していない（テストで固定した）。
- **再発防止**: 横断テスト `tests/view-content-superset.test.ts` を追加し、階梯上の各 view の `content` が下位 view の定型要素を含むことを検証する。**文字列長の比較（`len(summary) ≤ len(detailed) ≤ len(full)`）は使わない**——長さは上位集合性を検証せず（フッタが落ちても明細が増えれば通る。今回の欠陥はまさにその形）、文言を 1 語変えただけで落ちる脆いテストにもなるため。代わりに定型要素（📌 フッタ行 / ⚠️・ℹ️ 注記行 / ヘッダの pair・期間・最終値）を抽出・正規化した集合の包含と、バケット行の識別キー集合の包含で検証する。

### Fixed（`view` は `content` のみを変え、`structuredContent` を変えない）
- **`get_flow_metrics(view=summary)` の `structuredContent` に `data.series.buckets` が戻った。** 従来は `buckets` を**キーごと削除**しており、`series: z.object({ buckets: ... })` を**必須**で宣言する `GetFlowMetricsDataSchemaOut` を満たさない `structuredContent` を返していた（ハンドラでの加工後に再 parse していなかったため実行時エラーにならず露見していなかった）。`data.series.buckets` を必須として読む外部クライアントは、これまで `view=summary`（**既定値**）で欠落を受け取っていたことになる。
- **`get_flow_metrics(view=compact)` の `structuredContent` が全バケットになった**（従来は「非ゼロ ∪ 欠損」でフィルタ済み）。`content` テキスト側の絞り込み表示（非ゼロバケットのみ＋欠損は `⋯ 欠損 A〜B（Nバケット, データなし）` の区間表記）は**従来どおり不変**。
- 削除・フィルタの動機はトークン削減だったが、**LLM は `structuredContent` を参照しない**（`.claude/rules/tools.md`「`content[0].text` だけが LLM に見える」）ため削減量はゼロで、非 LLM クライアント向けの契約だけが壊れていた。`view` は `content` の量を決めるパラメータであり、`structuredContent` の shape を決めるパラメータではない。
- **`content` は全 `view` で 1 バイトも変わらない。** `view=summary` / `compact` / `buckets` / `full` のテキスト出力・警告行・フッタはいずれも従来どおり。
- **再発防止**: ① `get_flow_metrics` のハンドラ出口で `GetFlowMetricsOutputSchema.parse()` を通し、以後のスキーマ drift を CI で検出する。② 横断テスト `tests/view-structured-content-invariance.test.ts` を追加し、同一入力に対し `view` を変えても `structuredContent` が deep-equal であることを `get_flow_metrics` / `get_transactions` / `get_volatility_metrics` で検証する。階梯外 view が**足す**のは許容（`detect_patterns(debug)` の `data.candidates`、`detect_patterns(detailed)` の `usage_example`、`detect_macd_cross(detailed)` の `data.resultsDetailed` / `data.screenedDetailed`）なので、これらは「既存キーが全て残っていること（下位集合でないこと）」と「足しているキーが上記に限られること」を検証する。
- **`get_candles(view=items)` の `structuredContent` 封筒（`{ items, meta }`）は本リリースでは変更しない。** `items` は後続で `view=full` + `format=json` に置き換える予定があり、そこで同時に直せば外部クライアントが受ける破壊は 1 回で済むため。現状の逸脱は上記テストで形を固定してある。

### Fixed（プロンプトが存在しない `view` 値を指示していた）
- **`中級：BTCのフロー分析をして` プロンプトが `get_flow_metrics` に存在しない `view=detailed` を指示していた問題を修正**（`view=compact` に差し替え）。同ツールの enum は `summary` / `compact` / `buckets` / `full` で `detailed` は無い。SDK v2 はハンドラ実行前に `inputSchema` で入力を検証するため、プロンプトの指示どおり呼ぶと**ツール呼び出しが validation error になる**（黙って既定値に倒れるのではなく失敗する）。差し替え先に `compact` を選んだのは、このプロンプトの用途が「CVD 推移・スパイク・直近 1-3 時間重視」で `limit=300` / `bucketMs=60000`（最大約 300 バケット）のため。`full` は 300 行で用途に対して重く、`buckets` は既定 10 件で推移を追うには短い。`compact` は非ゼロバケットのみを出しつつ欠損を区間表記で残す。
- **再発防止テストを追加**（`tests/prompts_contract.test.ts`）。全プロンプトの本文から `toolName(..., view=xxx, ...)` を抽出し、`allToolDefs` の `inputSchema` が持つ `view` の enum で受理されるかを検証する。プロンプトはテストで実行されないため、この不整合は従来どのテストにも掛からなかった。**検査対象は `view` を明示している呼び出し例に限る**（`view` を渡していない呼び出し例は対象外で、プロンプトが参照するツール名一般の実在性は検証していない）。その範囲内では、ツール名を `allToolDefs` で解決できないケースと、`view` を持たないツールに `view` を渡しているケースも失敗として報告する（黙って検査をスキップしないため）。

### Changed（プロンプトとドキュメントを新しい `view` 語彙に追従させた）
**ツールの挙動変更は無い**（旧値は alias として受理され続けるため、追従前のプロンプトもそのまま動く）。語彙は導入したが呼び出し側が旧値のまま、という状態を残さないための追従。
- **同梱プロンプトが指示する `view` を新語彙へ差し替えた。**
  - `中級：BTCのフロー分析をして`: `get_flow_metrics(view=compact)` → `view=full, nonZeroOnly=true`、`get_transactions(view=summary)` → `view=full`。いずれも上表の写像どおりで**指示内容の意味は変わらない**。
  - `detect_patterns(view=detailed)` は新語彙でも有効値のため**変更なし**。
  - `🌅 おはようレポート`: `get_candles(view="items")` → **`view="full"` のみ**（`format` は付けない）。写像表の `view=full` + `format=json` は「旧 `items` と `content` を一致させる」ための写像であって、このプロンプトが必要とするものではない。用途はスパークライン用に 24 本の close を得ることで、既定の `view=full` + `format=text` のサマリ本文が全 24 本を 1 行 1 本の圧縮形式で含む。`format=json` にすると同じ 24 本が 10 行/本の pretty JSON になり（トークン増）、しかも `content` からサマリ本文・価格レンジ・キーポイント・出来高統計・フッタが消える。**JSON を要求する理由が無く、外したほうが軽くかつ LLM が受け取る情報は多い。**
- **`docs/tools.md` に「`view` の共通語彙」節を新設した**（従来 `view` パラメータの記載はゼロだった）。階梯（`summary` < `detailed` < `full`、`full` は常に最重量）、`full` が全件列挙になるのは主対象がレコード列のツールに限ること（`get_volatility_metrics` は該当せず、`full` でも系列そのものは出ない）、`view` が `structuredContent` からフィールドを削らないこと、`format` / `nonZeroOnly` は量ではなく形式 / 絞り込みの軸であること、階梯外の値（`debug` / `beginner`）は出力の置換であること、生データ系ツールの既定が全件列挙である理由、ツール別の値と既定、**非推奨の値と写像先**を記載した。`get_tickers_jpy` の `view` が本語彙の対象外であることも明記している。
- **`.claude/rules/tools.md` に `view` の規約を追記した**（開発者向け）。新規ツール追加時に守る 7 項目——量の 1 軸であること / `structuredContent` を削らないこと（削る・足す・入力のエコーの 3 分類）/ 階梯上の view は下位の上位集合であること / 量以外の軸を `view` の値に混ぜないこと / 「この view では〇〇が `content` に出ない」を description に書くこと / 規約をテストで固定すること / enum 値を変える際の alias 手順と型導出——を、`src/schema/base.ts` の共通文言と各共通テストへの導線つきで書いた。

### Changed（**挙動変更**: `get_flow_metrics` の `date` 指定で `limit` を適用しない）
- **`get_flow_metrics(date=YYYYMMDD)` が当該 UTC 暦日の全件を集計するようになった**（従来は「その UTC 日の最新側 `limit` 件」）。`since` / `until` の導入で区間指定パラメータが 3 系統になった際、`limit` の扱いが `date` だけ不揃いになっていた（`hours` は「`limit` は無視」、`since`・`until` は「指定時は `limit` を適用しない（区間の全件を集計）」、`date` のみ適用）。既定 `limit` は 100 なので `get_flow_metrics(date=20260801)` は末尾約 20 分ぶんを返しており、日付を指定した意図とはまず一致しなかった。切り捨て自体は `meta.truncated` / `meta.totalAvailable` / warning で申告されていた（黙って壊れてはいない）が、既定の挙動として不適切だった。
  - **`date` + `limit` で少数サンプルを取っていた利用は結果が変わる。** 直近 N 件が欲しい場合は `date` を外して件数ベース取得（`date` / `hours` / `since`・`until` をどれも指定しない呼び出し）を使うこと。
  - **上限引き上げではなく `limit` の適用除外を選んだ理由**: 1 UTC 日は BTC/JPY で実測 5,609〜8,040 件あり、`limit` 上限 2000 に上げても 6〜8.5 時間分にしか届かない。上限を「1 日の最大約定数」に追随させるのは上流の出来高次第で破綻する追いかけっこであり、しかも `date` 以外の区間指定（`hours` / `since`・`until`）は既に `limit` 非適用なので、上限を上げても `date` だけが不揃いなまま残る。区間を指定したら区間の全件、という 1 本のルールに揃えた。
  - 切り捨てが起きなくなった経路では `meta.totalAvailable` / `meta.truncated` を**付けない**（`hours` / `since`・`until` と同じ）。切り捨て warning も出ない。
  - `meta.actualRange.requestedMinutes` は従来どおり当該 UTC 暦日の 1440 分。全件を集計するので `coveragePct` は通常ほぼ 100% になり、下回った場合はアーカイブ側の欠損を意味する（旧実装では `limit` による切り捨てとアーカイブ欠損が同じ数値に混ざっていた）。
  - **アーカイブ未公開（進行中・未来の UTC 日）→ latest フォールバックでも `limit` は適用しない**（= latest の全件、約60件）。ここだけ効かせると、同じ `date` 指定でもアーカイブが公開済みか否か——つまり呼んだ時刻と上流の公開タイミング——で `limit` が効いたり効かなかったりし、呼び出し側から区別できない非決定的な挙動になる。実害も無く、latest は約60件で既定 `limit`（100）を下回るため適用しても通常は何も切れず、小さい `limit` を渡したときにだけ「未公開日の警告付き結果がさらに黙って削られる」方向にしか働かない。warning には「要求した UTC 暦日の全件ではありません」を明示する。
  - **`limit` 上限 2000 は据え置き**（再評価のうえ）。`date` が `limit` から解放されたことで `limit` の用途は「直近 N 件」だけになったが、2,000 件 ≒ BTC/JPY で 6〜8.5 時間分と件数指定としては十分に長く、これより長い窓は件数ではなく時間で指定するほうが要求が一意になる。上限を上げると件数ベースの補完（`lib/tx-fetch.ts` の `fetchSupplementTxs` は `limit > 500` で 2 日ぶん = 約 11,000〜16,000 件）を超えて 3 日目以降のアーカイブ取得が必要になり、リクエスト数と rate limit を消費する割に同じ範囲は `since`・`until` で切り捨てなく取れる。下げても応答はバケット / 価格帯の集計でトークン量が件数に比例しないため実益が無く、既存の呼び出しを壊すだけ。根拠は `MAX_TX_COUNT_LIMIT`（`src/schema/base.ts`）のコメントに集約し、`get_flow_metrics` / `analyze_volume_profile` 両方の `.max()` をこの定数に寄せた（値は不変）。
  - `date` の description から「`limit` 上限より 1 日の約定数が多いので 1 日全体をカバーできない」という**自分の欠陥を回避手段で説明する**文面を削除し、「当該 UTC 暦日の全件を集計する（`limit` は適用しない）」に書き換えた。`since`/`until` への誘導は残している（複数日にまたがる区間や、UTC 暦日の境界に揃わない区間——JST の 1 日など——は `date` では表現できないため）。`limit` の description には適用範囲（件数ベース取得でのみ有効）を明記した。`analyze_volume_profile` の `limit` も同じ文面に揃えている（同ツールに `date` は無いので対象は `hours` / `since`・`until` のみ）。
  - `analyze_volume_profile` に `date` パラメータは無く、挙動変更はない（`limit` の description のみ）。

### Added（`lib/calendar.ts`: 暦日プリミティブの集約）
- **`lib/calendar.ts` を新設**。暦日（カレンダーデー）の計算がリポジトリ内に分散しており、lib-first ルールに反していた（`lib/tx-archive.ts` = UTC 暦日キーの生成・範囲列挙、`tools/get_candles.ts` = tz 暦日 window ↔ UTC chunk key 変換で約320行、`tools/analyze_candle_patterns.ts` = UTC 暦日の終端、`tools/trading_process/lib/fetch_candles.ts` と `src/handlers/portfolio/calc.ts` ほか計4ファイル = JST ハードコードの暦日境界）。分散の実害として `date` パラメータの暦基準がツール間で割れており（`get_transactions` 系は UTC 暦日、`get_candles` 系は `tz` 引数の暦日）、実機テストで取得区間の取り違えが起きている（緩和として #10 で description に明記済み）。
  - 提供する操作: 境界（`startOfDayMs` / `endOfDayMs` / `startOfYearMs` / `endOfYearMs`）、キーの生成とパース（`toDayKey` / `toYearKey` / `isDayKeyFormat` / `isYearKeyFormat` / `parseDayKey` / `parseYearKey` / `shiftDayKey`）、範囲列挙（`enumerateDayKeys` / `enumerateYearKeys`）、完了判定（`isDayKeyCompleted` / `recentCompletedDayKeys`）、tz 検証（`isSupportedTimeZone`）。
  - **tz は必ず明示引数**で受ける（`'UTC'` も普通の tz として渡す）。既定値を暗黙に `'Asia/Tokyo'` にすると、現在起きている「同じ関数名で暦の基準が違う」問題を lib 側に持ち込むことになるため。不正 tz を既定値へ倒すかは呼び出し側のポリシーなので、lib は `isSupportedTimeZone()` で判定手段だけを提供する。
  - **範囲列挙はキーの日付演算で進める**（ミリ秒に 24h を足さない）。DST で 23 時間 / 25 時間になる日、DST 開始が 00:00 で「その日の 0 時が存在しない」tz（`America/Sao_Paulo` 2017-10-15）、オフセットが 30 分だけ動く tz（`Australia/Lord_Howe`）、月末・年末・閏日を跨いでも日が飛ばず重複もしない。
  - **`parseDayKey` は実在日を検証する**。`dayjs.tz('2026-02-30', tz)` は例外を投げずに 3/2 へ繰り上げるため、tz を当てる前に UTC の strict parse で弾く。一方 `isDayKeyFormat` は形式（`/^\d{8}$/`）のみを見る（既存 `isArchiveExpectedPublished` と同じ粒度を保つため）。
  - **不正 tz / 非有限 ms は `TypeError`**。`NaN` や `'Invalid Date'` を黙って伝播させると原因の遠い場所で壊れる。キー文字列の形式不正はユーザー入力由来なので throw せず `null` / `false` を返す。
- **`lib/tx-archive.ts` を `lib/calendar.ts` の上に載せ替えた（挙動不変）**。bitbank の約定アーカイブ仕様（UTC 暦日単位・当該日完了後に公開）というドメイン知識を持つ層としては残し、中身の暦日計算だけを委譲する。既存 export（`currentUtcDayKey` / `currentUtcDayStartMs` / `isArchiveExpectedPublished` / `recentCompletedUtcDayKeys` / `completedUtcDayKeysInRange`）のシグネチャと挙動は変えていない（`tests/lib/tx-archive.test.ts` を無改変で通すことを挙動不変の証明とした）。
- **`tools/get_candles.ts` を `lib/calendar.ts` の上に載せ替えた（挙動不変）**。tz 暦日 window ↔ UTC chunk key の変換で約320行あった暦日計算のうち、**汎用の暦計算を lib へ、bitbank API 固有の chunk 戦略を `get_candles` に**残した。この分割の判断基準は「bitbank が `/candlestick` を UTC 暦日 / UTC 暦年でしか返さない」という上流仕様に依存するかどうか。`tests/get_candles.test.ts` を無改変で通すことを挙動不変の証明とした（移行 4 コミットのいずれもテストファイルを触っていない）。
  - **lib へ移した**もの: 不正 tz の判定（`isSupportedTimeZone`）、暦日 / 暦年の区間化（`parseDayKeyAllowingOverflow` / `parseYearKey`）、window と交差するキーの列挙（`enumerateDayKeys` / `enumerateYearKeys` — 自前の cursor ループと `enumerateUtcYearsIntersectingWindow` を削除）、暦年の先頭（`startOfYearMs`）、経過暦日数（`diffCalendarDays`）、現在時刻がどの暦日 / 暦年か（`toDayKey` / `toYearKey`）。結果として `get_candles` から dayjs の直接利用が無くなった。
  - **`get_candles` に残した**もの: chunk key の形式と粒度（`YEARLY_TYPES` = `YYYY` / `DAILY_TYPES` = `YYYYMMDD`）、chunk の暦が UTC 固定であること（`FETCH_CHUNK_TZ`）、`date` の文法（`YYYYMMDD` は暦日、`YYYY` は `YEARLY_TYPES` 限定の互換形式）、本数の見積り（`BARS_PER_YEAR` / `BARS_PER_DAY` / `INTERVAL_MS` による按分と `yearsNeeded`）、公開遅延のハンドリング（進行中 UTC 期間の 404 / `success:0` を「データ未生成」として実失敗と分ける処理）、不正 tz を `Asia/Tokyo` へ倒すというフォールバック方針。
  - **`computeAnchorEndMs` / `computeAnchorStartMs` を `computeAnchorSpan` に統合**した。分岐条件が同一で終端・先頭だけが違う対の関数だったため、`CalendarSpan` を返す 1 関数にまとめている。公開 API ではなくモジュール内部の関数なので外部影響はない。
  - **`date` の解釈・limit 上限・chunk 戦略・エラーメッセージはいずれも変えていない。** 実在しない `date`（`20260230` 等）を繰り上げ解釈する現行挙動も維持した（`validateDate` は形式しか見ないためこの入力は実装まで到達する）。厳密解釈へ倒すと anchor が無効化されて「最新側 limit 本」に silent に化けるため、この一点は今回の移行では踏み込まず回帰テストで固定するに留めた。
- **`lib/calendar.ts` に 2 操作を追加**（`get_candles` の移行で C-1 の API では表現できなかったもの。tz を明示引数で受ける原則は維持）。
  - `parseDayKeyAllowingOverflow`: 実在しない日付をグレゴリオ暦の繰り上げで解釈する（`20260230` → 3/2）。`lib/validate.ts` の `validateDate` のように**形式だけ**を検証する層を通った値を扱う呼び出し側のための入口で、繰り上げるかどうかを関数の選択として明示させる。既定は実在日を要求する `parseDayKey`。
  - `diffCalendarDays`: 2 つの瞬間が属する tz 暦日の差。ミリ秒差を 86400000 で割ると DST を挟む tz で 1 日ずれる（`America/New_York` の 2025-01-01 → 06-16 は ms 差が 165 日 23 時間）ため、暦日キーの日付演算で数える。
- **残る 5 ファイル 6 箇所の暦日計算を `lib/calendar.ts` に載せ替えた**（暦日計算そのものは挙動不変。唯一の挙動変更は後述の深夜跨ぎ修正）。これで `startOf('day')` / `endOf('day')` の直書きは `lib/calendar.ts` の中だけになった。`date` パラメータの暦基準の統一（破壊的変更）と当日損益の計算基準日の変更は本変更に含まない。
  - **`tools/analyze_candle_patterns.ts`**: `as_of` / `date` 指定時に「その日までの足」を切り出す UTC 暦日終端を `parseDayKeyAllowingOverflow` に委譲し、暦基準を `AS_OF_FILTER_TZ` という名前付き定数にした。繰り上げ許容版を選んだのは `normalizeDateToYYYYMMDD` が形式しか見ず実在しない日付が到達しうるため（従来の `dayjs.utc('2026-02-30')` は 3/2 へ繰り上げていた）。**この箇所の暦基準が UTC のままである点も現行維持**で、`get_candles` は同じ日付キーを `tz` 引数の暦日（既定 Asia/Tokyo）として解釈しており基準がずれているが、揃えると「どの足まで含めるか」が変わる仕様変更になるため踏み込まず、定数のコメントに残した。
  - **`tools/trading_process/lib/fetch_candles.ts`**: `start_date` / `end_date` の JST 暦日終端を `endOfDayMs` に、「今日から `start_date` まで遡る日数」を `diffCalendarDays` に委譲し、2 箇所にハードコードされていた `'Asia/Tokyo'` を `BACKTEST_CALENDAR_TZ` に集約した。遡る日数は「今日の 23:59:59.999 との ms 差を 86400000 で割って切り上げ」＝暦日差 + 1 であり、JST は DST が無いため結果は一致するが、この割り算は `diffCalendarDays` が明示的に禁じている形なので暦日差に置き換えて当日ぶんの +1 を式として見えるようにした（JST 00:00 ちょうど / 直前 / 直後を含む 8 つの現在時刻 × `start_date` -6000〜+5 日、および JST 0:00 以外の `start` の計 48,088 ケースで新旧一致を確認）。不正な日付を「Invalid date format」で弾く順序も維持している（`lib/calendar.ts` は非有限 ms に `TypeError` を投げるため、暦日終端を当てる前にチェックする）。
  - **`analyze_my_portfolio` の「JST 当日の開始」3 実装を共通化**。当日損益の起点（`portfolio/calc.ts`）、日次価格マップのキー正規化（`portfolio/fetch.ts`）、資産推移の日次点の打ち止め（`analyzeMyPortfolioHandler.ts`）が同じ計算を別々に持っていた。この 3 つは**同じ暦日境界でなければ壊れる**（日次価格は JST 0:00 の ms をキーに持ち資産推移側がその ms で lookup するため、片方だけずれると全点が現在価格フォールバックに落ちて `equitySeriesQuality` が実態と乖離する）。`src/handlers/portfolio/calendar.ts` を新設し、暦日計算は `lib/calendar.ts` に委譲したうえで基準の共有をこのモジュールに集約した。
    - **tz は定数（`PORTFOLIO_CALENDAR_TZ`）のままにした**。当日損益の計算基準は仕様であって呼び出し側の自由度ではなく、外出しするには上流 `fetchCandlePriceData` が `getCandles` に渡す tz（＝日足の区切り）と出力 ISO のオフセット前提まで一貫して通す必要があり、「当日損益の計算基準日の変更」という仕様変更とセットになるため。判断理由はモジュール冒頭のコメントに残し、`getCandles` に渡していた `'Asia/Tokyo'` リテラルも同じ定数に寄せて暦を変えるときの起点を 1 箇所にした。
    - **リクエスト中に JST 00:00 を跨ぐと資産推移に幽霊の 1 点が入る問題を修正**（本 PR で唯一の挙動変更。既存バグで、移行で持ち込んだものではない）。資産推移の日次点・月次点の終端だけが、リクエスト開始時に確定した `boundaries` ではなく**時計を読み直して**決まっていた。`boundaries` は `fetchCandlePriceData` に渡す取得条件そのものなので、API 応答を待っている間に日付が変わると「取得済みの日次価格に存在しない翌日」が 1 点増え、その点だけ現在価格フォールバックに落ちる（JST 00:00 を跨いだ瞬間に発生し、月跨ぎでは月次点にも同じことが起きる）。終端を `boundaries.dayStartMs` / `boundaries.monthStartMs` から導くようにして、ハンドラ側の 2 度目の時計読みを削除した。JST 23:59:59.9 に処理を開始し candlestick 応答中に日付を跨がせる回帰テストを追加している（修正前は日次点に `2026-08-03T00:00:00+09:00` が余分に現れることを確認済み）。
    - **当日損益の起点に境界時刻の回帰テストを追加**（従来は `getJstPeriodBoundaries` のテストが 1 件も無く、暦日境界がずれても既存テストは緑のままだった）。JST 00:00 ちょうど / 1ms 前 / 1ms 後 / 23:59:59.999、UTC 日付の変わり目（JST 09:00）の前後、JST 深夜（UTC ではまだ前日）、元日、実行環境 TZ = UTC を固定クロックで検証する。日次価格マップのキーが JST 暦日 0:00 になることも `JST 09:00 = UTC 00:00` の足で判別できる形で固定した。`PORTFOLIO_CALENDAR_TZ` を `'UTC'` に変えると 10 件落ちることを確認済み。
  - **対象外**と判定した箇所（暦日計算ではないため）: `tools/prepare_chart_data.ts`（ISO 文字列のミリ秒パース）、`tools/render_chart_svg.ts`（表示用の同日判定）、`lib/provisional-bar.ts`（月単位の加算）。

### Added（since / until による絶対時刻区間指定）
- **`get_flow_metrics` / `analyze_volume_profile` に `since` / `until` を追加**。過去の特定区間を**全件**集計できるようになった。従来は「過去の任意区間を取り切る手段が無い」状態だった: `hours`（最大24）は**現在時刻起点**の相対窓なので過去区間を指定できず、`date`（UTC 暦日）は `limit` 上限 2000 で切り捨てられる（実測 2026-08-02: `get_flow_metrics(date=20260801, limit=2000)` は UTC 8/1 の 4,781 件のうち末尾 2,000 件＝8.3 時間分のみを返した）。切り捨て自体は `meta.truncated` / warning で申告されるようになっていたが、**申告されるだけで取得する手段が無かった**。実機テストではこの制約下で LLM が「翌日 JST 09:00 以降に `date=20260802` で取り直せば全件取れる」と誤案内している（実際に返るのは UTC 8/2 の末尾 2,000 件＝JST 8/3 早朝で、欲しかった JST 8/2 午前〜午後とは重ならない）。
  - **形式はオフセット付き ISO8601 のみ**（例: `since=2026-08-01T00:00:00Z`, `until=2026-08-02T09:00:00+09:00`）。秒とミリ秒は省略可。`YYYYMMDD` を採らなかったのは、同じ `date: 'YYYYMMDD'` でも暦の基準がツール間で割れており（`get_transactions` / `get_flow_metrics` は UTC 暦日、`get_candles` / `validate_candle_data` は `tz` 引数の暦日）、実機で取得区間の取り違えが起きたため。オフセット必須にすると「どの暦で解釈されるか」が入力そのものから一意に決まる。
  - **`until` は排他**（`[since, until)`）。`since=2026-08-01T00:00:00Z, until=2026-08-02T00:00:00Z` がちょうど UTC 8/1 の 1 日で、隣接区間を続けて要求しても境界の約定が二重計上されない。省略時は現在時刻まで。
  - **`hours` / `date` とは排他**（併用は user エラー）。暗黙の優先順位を置くと、要求と異なる区間の集計値が返っても応答から気づけない。
  - **`limit` は適用しない**（`hours` 指定時と同じ）。区間の全件が `CVD` / アグレッサー比 / VWAP / POC / Value Area に入る。
  - **最大範囲は 7 日**（`MAX_TX_RANGE_DAYS`）。1 日 = 1 リクエスト・BTC/JPY で 5,600〜8,000 件のため、7 日で最大 8 リクエスト・約 56,000 件の並列取得と dedup になる。超過は user エラーで、期間の分割を案内する。
  - カバレッジ申告は**既存機構をそのまま再利用**する。`meta.actualRange.requestedMinutes` に `(until - since) / 60000` が入り、`coveragePct` / `buildTxCoverageWarning` / `buildAggregateCoverageNote` が従来どおり機能する。完了済み UTC 日のみの区間ならカバー率はほぼ 100% で警告は出ず（誤検知しない）、進行中 UTC 日にかかる区間では latest 約60件ぶんまで落ちて既存の warning が発火する。
  - `meta.mode='absolute_range'` と `meta.range`（要求区間の UTC ISO8601）を追加。`hours` 指定時の `mode='time_range'` / `meta.hours` は従来どおり。
- **過去区間のみの要求では `/transactions` (latest) を叩かなくなった**。latest は現在の約定しか返さないため、過去区間では区間外のデータしか得られずリクエストと rate limit の無駄になる。取得区間が進行中の UTC 日にかかる場合のみ叩く（`hours` 指定は終端＝現在時刻なので従来どおり常に叩く）。あわせて「進行中の UTC 日 (…) は latest で補完しています」という注記も、実際に latest を使った場合のみ出すようにした。
- **`lib/tx-fetch.ts` の `fetchTxTimeRange` を絶対区間 `{ sinceMs, untilMs }` に一般化**（挙動不変）。`hours` から `sinceMs` を内部計算していたため過去区間を取得できなかった。`hours` → 区間の変換は呼び出し側に移し、取得層は絶対区間だけを扱う。`completedUtcDayKeysInRange` には第3引数 `nowMs` を追加し、「進行中の UTC 日」の判定を区間の終端ではなく実時刻で行えるようにした（既定は従来どおり終端時刻。過去区間で渡さないと完了済みの日を進行中と誤判定して公開済みアーカイブを列挙しない）。

### Fixed（要求窓に対するカバレッジ不足の申告）
- **内部欠損が無い場合のカバレッジ不足が警告されなかった問題を修正**（`get_flow_metrics` / `analyze_volume_profile`）。カバレッジ warning は区間内部の欠損（gaps）にのみ反応していたため、窓の**先頭・末尾側**が未カバーのケース——実測では `hours=4` の窓が丸ごと進行中 UTC 日内にあり latest 約60件（≒34分、カバー率 14%）しか取れない状況——で、原因を述べる「進行中の UTC 日…」の行だけが出て**不足の大きさがどこにも定量表示されなかった**。#8 で削除した旧注記はこのケースで発火していた（カバー率 80% 未満で定量表示）ため、この 1 ケースに限っては退行でもあった。
  - 取得層 `meta.warning`: 要求窓の 80% 未満なら gaps が空でも発火し、カバー率と「実データ区間（開始〜終了）の外側 N分 は未カバー」を明示する。内部欠損と窓外未カバーが同時にある場合は併記。閾値 80% は旧注記と同じ値を踏襲（`COVERAGE_SHORTFALL_WARN_PCT`）。
  - 計算層 `meta.warnings`: 同条件で「集計値は要求した時間窓（N分）全体を代表する値ではありません」を追記。
  - 要求窓を 80% 以上満たしていれば従来どおり何も出ない（誤検知しない）。`hours` 未指定の件数ベース取得も従来どおり対象外。

### Fixed（limit による切り捨ての申告）
- **`get_flow_metrics` / `analyze_volume_profile` の件数ベース取得が `limit` による切り捨てを無言で行っていた問題を修正**。1 UTC 日は BTC/JPY で 5,600〜8,000 件あるのに `limit` 上限は 2000 のため、`date=YYYYMMDD` 指定では 1 日の 1/3 程度しか集計に入らない。にもかかわらず `meta.actualRange` は「実カバー = スパン」を報告しており、**完全にカバーしたように見えていた**（カバレッジ申告は欠損区間には反応するが、末尾切り捨てには反応しなかった）。実測では `date=20260801, limit=2000` が UTC 暦日 24 時間のうち末尾 8.3 時間分しか返さず、`buy%` / `finalCvd` がその区間のみの値であることが応答から分からなかった。
  - `meta.totalAvailable`（limit 適用前の件数）/ `meta.truncated` を追加（`get_transactions` の `totalFetched` / `truncated` と対応）。
  - 切り捨て時は取得層 `meta.warning` に件数・`limit`・対象スコープ・代替手段（`hours` 指定なら `limit` を適用しない）を明示。
  - `date` 指定時の `actualRange.requestedMinutes` を当該 UTC 暦日（1440 分）に設定。`coveragePct` に「1 日のうちどれだけを見たか」が現れる（実測相当のケースで 2〜35%）。
  - `hours` 指定時は `limit` を適用しないため `totalAvailable` / `truncated` は付かない（従来どおり）。

### Changed（`date` パラメータの暦基準を明記）
- **`date` の暦基準をパラメータ description に明記**。同じ `date: 'YYYYMMDD'` でもツールによって基準となる暦が異なる（`get_transactions` / `get_flow_metrics` は **UTC 暦日**＝bitbank の約定アーカイブ単位、`get_candles` / `validate_candle_data` は **`tz` 引数の暦日**＝既定 Asia/Tokyo）。ツール本体の description には UTC である旨の記載があったが、パラメータ側は `'YYYYMMDD; omit for latest'` のみで基準が分からず、片方の基準で他方を呼ぶと無言でズレる（実測: `get_candles(date=20260801)` を既定 tz で呼ぶと JST 8/1 23:59 = 8/1 14:59 UTC で打ち切られ、16:44 UTC の足が範囲外になる）。相互参照つきで両側に明記し、`tests/date-semantics-contract.test.ts` で契約として固定した。
- あわせて `get_flow_metrics` の `date` に、**`limit` 上限（2000）より 1 UTC 日の約定数（BTC/JPY で 5,600〜8,000 件）が多いため date 指定では 1 日全体をカバーできない**旨と、`hours` への誘導を追記。

### Changed（カバレッジのギャップ閾値）
- **`DEFAULT_TX_GAP_MS` を 5 分 → 15 分に変更**（`lib/tx-fetch.ts`）。5 分では BTC/JPY の閑散帯を毎晩「取得欠損」として誤検知していた。実測（2026-08-01）で (a) JST 深夜 00:00〜05:00 の無約定区間は 47 分に 1 回・それ以外は 485 分に 1 回と**発生頻度に約 10 倍の開き**があり（取得欠損なら時刻とこれほど相関しない）、(b) 最長の閑散区間 7.5 分（JST 01:43:40〜01:51:12）を別系統の `/candlestick` (1min) で確認すると **7 本連続で volume=0・OHLC が前足終値に張り付き**＝本当に約定が無かったことが裏付けられた。検出したい実欠損（UTC 日アーカイブの取得失敗 / 進行中 UTC 日が latest 約60件のみ）はいずれも時間スケールでしか起きないため、15 分でも取りこぼさない。この変更で誤検知ぶんが実カバー時間に算入され、`coveredMinutes` / `hasData` / Z スコアの母集団がより実態に近づく。

### Fixed（欠損バケットの扱い）
- **`get_flow_metrics` のバケットで「約定ゼロ」と「データなし」が区別できるようになった**。バケット分割は欠損区間をゼロ埋めするため、旧実装では `totalVolume: 0` のバケットが「その1分間に約定が無かった」のか「その区間を取得できていない」のか応答から判別できなかった。`FlowBucketSchema` に `hasData`（boolean, 必須）を追加し、欠損区間に完全に含まれるバケットを `false` でマークする。`view=compact` は従来「非ゼロバケットのみ」でフィルタしており**欠損区間が黙って消えていた**が、欠損バケットは残すようにした（content テキストでは連続分を `⋯ 欠損 HH:MM〜HH:MM（Nバケット, データなし）` の 1 行に畳む）。
- **Z スコア / スパイク判定の母集団から欠損バケットを除外**。旧実装は欠損区間のゼロ埋めを観測値として平均・分散に含めており、平均が押し下げられて**欠損明けの通常バケットが偽スパイクとして検出されていた**。全バケットが同一出来高のフィクスチャで、欠損明けバケットの Z スコアが 0.13 → 0.72（約5.5倍）に膨らみ `spike=warning` が誤検出されることを確認済み。欠損バケットの `zscore` / `spike` は `0` や負値ではなく `null`（観測が無い区間に Z スコアは定義できない）。
- **`analyze_market_signal` の CVD 傾きが欠損バケットを観測として扱っていた問題を修正**。欠損バケットは CVD が据え置きで引き継がれるため、直近 `horizonBuckets` 本が全て欠損だと傾き 0 ＝「フロー中立」と読まれていた（進行中 UTC 日の欠損区間が長い JST 夕方以降に発生しうる）。観測のあるバケットのみを対象にする。

### Added
- **`get_flow_metrics` / `analyze_volume_profile` にカバレッジ申告を追加**: `get_flow_metrics` の `meta.actualRange` に `coveredMinutes`（実データがある区間の合計）/ `gapMinutes` / `segments` / `requestedMinutes` / `coveragePct` / `gaps`（欠損区間を長い順に最大 3 件）を追加。`analyze_volume_profile` の `data.params.timeRange` にも `coveredMin` / `gapMin` / `segments` / `requestedMin` を追加。既存の `durationMinutes` / `durationMin` は**先頭〜末尾のスパン**（欠損区間を含む）の意味のまま残し、単独では出さず必ず実カバー時間と並記する。欠損の事実は取得層 `meta.warning`、「集計値がカバー区間のみ由来」は計算層 `meta.warnings` に分けて載せる（`.claude/rules/tools.md` の 2 系統ルール）。
- **`getTransactions` に内部呼び出し用オプション `{ unlimited: true }` を追加**（`GetTransactionsOptions`）。`limit` を適用せず取得・正規化した全件を返す。集計ツール専用の経路で、MCP public ツールとしての応答上限（1000 件）は変更していない。
- **`lib/tx-fetch.ts`**: `get_flow_metrics` / `analyze_volume_profile` に重複していた約定取得層を集約（`mergeTxResults` / `txDedupKey` / `sortTxsAsc` / `fetchTxTimeRange` / `fetchLatestTxs` / `fetchSupplementTxs` / `formatTxFailures` / `partialFailureWarning` / `computeTxCoverage`）。失敗ハンドリングの方針（全滅 fail / 過半数 fail / 部分失敗 warning）は `lib/candle-fetch.ts` と同じくツール側に残し、lib は判定材料を返すに留める。上流 fetch は `TxFetcher` として注入し、lib が `tools/` に依存しないようにした。
- **`get_transactions` に切り捨て（truncation）メタデータを追加**: `meta.totalFetched`（取得全件数・不正行 drop 除外後）/ `matched`（フィルタ後件数）/ `returned`（返却件数）/ `truncated`（limit による切り捨て発生）/ `actualRange`（返却ウィンドウの実カバー範囲・Asia/Tokyo）/ `fetchedRange`（取得できた全約定の範囲）。切り捨て発生時は `meta.warning` と content テキスト（約定行列挙より前）で明示され、「該当期間に約定がなかった」と「limit で切れた」が応答上区別可能になった。

### Fixed
- **`get_flow_metrics` / `analyze_volume_profile` の集計が全件ベースになった（内部取得の 1000 件キャップ解除）**。両ツールは内部で `getTransactions(pair, 1000, date)` を UTC 日ごとに呼んでおり、BTC/JPY の 1 UTC 日は実測 5,609〜8,040 件あるため**各日の末尾 1000 件（≒4〜5 時間分）しか集計に入っていなかった**。CVD・アグレッサー比・VWAP・POC・Value Area・約定サイズ分布が全て切り捨て後サンプル由来だったうえ、その事実が出力のどこにも現れなかった。解除の根拠は (a) 出力がバケット集計・プロファイル集計なので**トークン増加はゼロ**、(b) `getTransactions` は元々レスポンス全件をパースしており `limit` は最後の `slice` でしか効いていない（キャップは応答サイズ制限であってフェッチ制限ではない）ため**通信量も不変**、(c) メモリも 1 日 8 千行程度。`hours` 指定時の `limit`（`GetFlowMetricsInputSchema` は最大 2000）も、従来は上流キャップにより 1000 を超えられなかったが要求どおり満たせるようになった。
- **`get_flow_metrics` の `meta.actualRange.durationMinutes` が欠損区間をカバー済みとして申告していた問題を修正**。先頭〜末尾の単純差分だったため、JST 17:30 時点の `hours=24` では「直近約763分間分」と申告する一方、実データがあるのは約 5 時間分だけだった。実データのある区間をセグメント化して実カバー時間・欠損時間・欠損区間を出すようにした（無約定 5 分超をギャップと判定。BTC/JPY の平均約定間隔は 11〜15 秒）。
- **`hours` 指定時の「ℹ️ 取得できた約定は直近約N分間分です。…直近フローとして扱ってください」注記を削除**。この文言は変えられない制約（進行中 UTC 日は latest 約60件のみ取得可能）と、直せる制約（アーカイブ側の 1000 件切り捨て）を同じ言い方で覆い隠していた。後者はキャップ解除で解消したため、残る欠損を実測値（要求窓 / 実カバー / 欠損区間の時刻）で出す。進行中 UTC 日のカバレッジ制約 warning は従来どおり出る。
- **`get_transactions` の「補完ツール: get_flow_metrics」の記述が誤誘導になっていた問題を修正**。実機テストで、`get_transactions` の切り捨てを正しく検出した LLM が代替手段として「`get_flow_metrics` は件数制限の影響を受けにくい」と案内したが、旧実装では同じキャップを共有していたため誤りだった。キャップ解除により正しい代替手段として成立するようになり、footer と truncation warning にその旨を明記した。
- **`analyze_market_signal` が上流 `get_flow_metrics` の `meta.warnings`（計算層）を落としていた問題を修正**。従来は `analyze_indicators` の `warnings` のみ継承していた。あわせて `warnings` にも `meta.warning` と同じ `[flow] / [indicators]` prefix を付け、由来を追えるようにした。
- **`get_flow_metrics` / `analyze_volume_profile` の件数ベース取得で `limit` を全パスで明示適用**。従来は上流キャップに依存して暗黙に効いていたため、キャップ解除に伴い明示した（`limit` の意味は不変）。
- **`analyze_volume_profile` の価格レンジ算出を `Math.min(...prices)` からループに変更**。スプレッド引数が数万件になると RangeError になり得るため（キャップ解除で 1 UTC 日 8,000 件超を扱うようになった）。

### Changed
- **`get_transactions` の `minAmount` / `maxAmount` / `minPrice` / `maxPrice` フィルタを `limit` 適用前に移動**（filter → limit）。従来は「最新側 limit 件を取り出してから絞る」ため条件を絞るほどカバー期間が縮み、date 指定時は UTC 日アーカイブ（約 8,000 件超）の末尾 limit 件しかフィルタ対象にならなかった（直近 24 時間の大口約定分析で約 11 時間分が無警告欠落する実害）。現在は「条件に合致した約定を最新側優先で最大 limit 件」返す。フィルタはコア関数の第 4 引数（`GetTransactionsFilters`）に移動し、フィルタ未指定の内部呼び出し（`get_flow_metrics` / `analyze_volume_profile` 等）は挙動不変。
- **`get_volatility_metrics` の実現ボラ `rv_std` / `rolling[].rv_std`（および年率換算 `rv_std_ann`）が母集団分散(n) から標本分散(n-1, Bessel 補正)ベースに変わったため出力数値が変化する。破壊的変更ではない**（型・フィールド・契約は不変、同一データで `rv_std` が僅かに大きくなるのみ）。上振れ幅は**小窓ほど大きく**、aggregate は標準 limit=200 で約 +0.25%、rolling は w=14 で約 +3.78%、w=20 で約 +2.60%、w=30 で約 +1.71%。
- 上記に伴い `volatile`(≥0.8) / `calm`(≤0.3) 判定閾値および下流参照（`getVolatilityMetricsHandler` の `high_vol`/`low_vol`/`expanding_vol`/`contracting_vol`/`high_short_term_vol`、`analyze_market_signal` の `volatilityFactor` / `recommendedTimeframes`）の閾値を**再評価のうえ据え置き**。根拠: 閾値は全て年率実現ボラを基準に判定しており、(a) aggregate ベースの閾値は標本数が大きく Bessel 補正が無視可能（最小 20 本でも +2.74%）、(b) `expanding/contracting_vol` の short/long 比は Bessel 係数が相殺し残差が ±5% 中立バンド内、(c) `high_short_term_vol` の最大上振れ（w=14, +3.78%）もヒューリスティックな許容範囲内のため、いずれも判定境界を実質的に跨がない。volatile/calm の閾値は `VOLATILE_RV_ANN_THRESHOLD` / `CALM_RV_ANN_THRESHOLD` 定数として明示し、判定を純粋関数 `classifyRealizedVolTags` に集約した（挙動は不変）。

### Security
- `run_backtest` の `savePng: true` 時の `outputDir` を許可 root 配下のみに制限（`/mnt/user-data/outputs`・サーバー作業ディレクトリ配下、および環境変数 `BACKTEST_OUTPUT_DIR_ALLOWLIST` で運用側が追加した root）。許可外パスはバックテスト実行前にエラーを返す。判定は `..`・シンボリックリンクを解決した実パスで行うためトラバーサル・symlink では迂回できない。**既定設定の動作は不変**で、許可外ディレクトリへ出力していた場合のみ環境変数での明示許可が必要（#15）。
- チャートファイル名生成（`generateBacktestChartFilename`）に、パス区切り・ドット等を除去する防御的サニタイズを追加。ファイル名の安全性を上流の pair バリデーションに依存させないための多層防御（#15）。

### Schema (breaking)
- `GetOrderbookDataSchemaOut` を `{ raw, normalized }` 固定の object から `z.discriminatedUnion('mode', [Summary, Pressure, Statistics, Raw])` に変更。実装 (`tools/get_orderbook.ts`) は元々 mode 別に完全に異なる shape の `data` を返していたが、スキーマ側が追従していなかったため `z.infer<typeof GetOrderbookDataSchemaOut>` を消費する外部クライアントには契約不一致だった。これに合わせて `data.mode` を必須の discriminator として明示。`get_orderbook` 末尾で `GetOrderbookOutputSchema.parse()` 経由のリターンに切り替え、スキーマ drift が CI で検出されるようにした。
- 併せて `GetOrderbookMetaSchemaOut` の `count`（実装で一度もセットされていなかった）を削除し、実装で実際に常設している `mode` を必須フィールドに追加。
- `get_orderbook` statistics mode の `ranges[].ratio` を `number | null` に変更（旧: `number`、その後一時的に `number | Infinity`）。`askVolume === 0 && bidVolume > 0` のとき `Infinity` を返していたが `JSON.stringify(Infinity)` が `null` になり MCP wire format と乖離するため、実装側 (`tools/get_orderbook.ts` `buildStatistics`) で `null` に正規化。「買い優勢 / strong / 売り板=0 で算出不能」の意味は `interpretation` / `summary.overall` / `summary.strength` / `content` テキストで保持する。schema は `z.number().nullable()`。
- `GetTransactionsDataSchemaOut` から `raw` を削除。date 指定時に全 UTC 日分（約 8,000 件超）の生レスポンスが `structuredContent` に毎回同梱され、`limit` の意義を無効化していた。transactions の `data.raw` を参照する消費者がリポジトリ内に存在しないことは確認済み。あわせて `GetTransactionsMetaSchemaOut` に truncation メタ（`totalFetched` / `matched` / `returned` / `truncated` は必須、`actualRange` / `fetchedRange` は optional）を追加。
- `AnalyzeVolumeProfileDataSchemaOut` の `params.timeRange` に `coveredMin` / `gapMin` / `segments` を**必須**で追加（`requestedMin` は optional）。`data.params.timeRange` を消費する外部クライアントは新フィールドを受け取る（既存の `start` / `end` / `durationMin` は不変）。
- `GetFlowMetricsMetaSchemaOut` / `AnalyzeVolumeProfileMetaSchemaOut` に `totalAvailable`（number, optional）/ `truncated`（boolean, optional）を追加。件数ベース取得時のみセットされる。
- `FlowBucketSchema` に `hasData`（boolean）を**必須**で追加。`false` は「約定ゼロ」ではなく「取得できていない（欠損区間）」を意味する。`data.series.buckets` を消費する外部クライアントは新フィールドを受け取る（既存フィールドは不変）。あわせて `view=compact` の `content` テキストでも欠損バケットが（区間表記で）残るようになった（従来は黙って除外されていた）。なお `structuredContent` 側の `view=compact` のフィルタは後述の「`view` は `structuredContent` を変えない」で**全廃**しており、返却バケットは欠損に限らず全件になる。
- `GetFlowMetricsMetaSchemaOut.actualRange` を `TxCoverageRangeSchema` に差し替え（`coveredMinutes` / `gapMinutes` / `segments` が必須、`requestedMinutes` / `coveragePct` / `gaps` が optional）。既存の `start` / `end` / `durationMinutes` は不変。あわせて計算層用の `warnings`（`string[]`, optional）を追加。

## [0.1.1] - 2026-05-08

### Fixed
- bin スクリプトが `tsx` を resolve する際に CWD ではなく自身の場所を起点にするよう修正（`npx -y bitbank-lab-mcp` 経由で起動した際に `Cannot find package 'tsx'` エラーになっていた問題）。

## [0.1.0] - 2026-05-08

### Added
- 初の npm publish（[`bitbank-lab-mcp`](https://www.npmjs.com/package/bitbank-lab-mcp)）。インストールは `npx -y bitbank-lab-mcp` で完了。
- Claude Code / Cursor / Codex / Gemini CLI 向けの plugin manifest 4 種を同梱（`.claude-plugin/plugin.json` / `.cursor-plugin/plugin.json` / `.codex-plugin/plugin.json` / `gemini-extension.json`）。
- `.claude-plugin/marketplace.json` を追加して Claude Code の `/plugin install` に対応。`/plugin marketplace add tjackiet/bitbank-lab-mcp` → `/plugin install bitbank-lab-mcp@bitbank-lab` で利用可能。
- Claude Code / Gemini CLI では plugin install 時に API キー入力 UI が表示される（OS キーチェーン or `.env` に保管）。Cursor / Codex はシェル環境変数経由。

### Changed
- パッケージ名を `@tjackiet/bitbank-mcp` から `bitbank-lab-mcp` に変更（公式版 `bitbank-mcp-server` との衝突を避け、botters lab コミュニティ向け実験版である位置付けを明示）。
- README を全面再構成。Claude Desktop でのセットアップを最上段に置き、サンプルコードはすべて公開済み npm パッケージ経由（`npx -y bitbank-lab-mcp`）に統一。`git clone` ベースの手順は末尾の「開発者向け」セクションに分離。
- API キーの権限ガイドを最小権限の原則に基づいて整理。「参照のみ」「参照 + 取引」の 2 段階を明示し、「出金」権限は強い禁止表現に変更（本 MCP には出金系ツール未実装）。
