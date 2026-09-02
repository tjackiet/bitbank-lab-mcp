# 主構成点とネックラインの位置関係（issue #216 Phase 1・実測ログ）

`validateReversalStructure`（`tools/patterns/structural.ts`）に渡るのは構成点列の
**先頭 2 点（`first` / `mid`）だけ**で、それ以降の主構成点——double の第2構成点、
triple の第2 / 第3構成点、H&S の頭 / 第2中間点 / 右肩——は**一度もネックラインと
比較されない**。[issue #216](https://github.com/tjackiet/bitbank-lab-mcp/issues/216)
Phase 1 として、その主構成点がネックラインの反対側にある候補の件数と逸脱量を測る。

**本ログは計測のみで、リポジトリのコードは 1 行も変更していない。**
gate を入れるか / 許容幅を置くか / 価格基準をどちらにするかは **Phase 1 では決定しない。**

## 結論（計測結果の要約。対策の決定は含まない）

1. **誤った側にあるのは常に「構成点列の最後の主構成点」で、頭は 1 件も無い。**
   役割別の内訳（生の行数）では `triple_*` の第2構成点 0 件 / 第3構成点 108 件、
   H&S 系の頭 0〜6 件に対し右肩 116〜707 件（基準による）。
   **「頭がネックラインを割っている」形は本コーパスに存在しない**（[1-3 章](#1-3-役割別どの点が誤った側に来るのか)）。
2. **件数は価格基準とネックラインの取り方で 2 桁動く。**
   構造単位で、`price`（終値）× スカラー水準の 187 件が、`extremePrice`（高安）で 122 件、
   さらにネックラインを線で評価すると 49 件、外挿クランプ付きの線なら **4 件**まで落ちる。
   **件数の大小では対策を決められない**ので、Phase 2 は基準の意味から先に決める必要がある
   （[1-2 章](#1-2-940-ケース全体)）。
3. **H&S だけは「どのネックラインを指すか」で答えが逆転する。** `detect_hs.ts` は
   **構造ゲートにスカラー（2 谷の平均 / relaxed の水平線）を渡し、ブレイク判定には傾きつきの線**を使う。
   右肩は線の定義 2 点（p1 / p3）の**外側**にあるため外挿がかかり、同じ構造が
   スカラー基準では「上に外れ」、線基準では「下に収まる」という反転が実際に起きている
   （実データ B `inverse_head_and_shoulders` 3,9,42,118,134: スカラー基準で +22,112 円、
   線基準で −45,973 円。[1-4 章](#1-4-hs-はどのネックラインを指すかで結果が反転する)）。
   **#211（`necklineAt` の外挿クランプ）が入ると H&S の構造単位は 77/98 件 → 35/34 件になる。**
4. **逸脱量は「ゼロ近傍に張り付いている」でも「明確に分離している」でもなく、type で割れる。**
   `double` / `triple` は最小がパターン高さの **2.96%**（絶対額 2,147〜20,213 円）で
   ゼロから離れているが、`inverse_head_and_shoulders` は最小 **0.012%（31 円）** で
   ゼロに張り付いた集団（0.0〜0.1% に構造単位 5 件）がある。
   **ただし外挿クランプ後の線基準では H&S 系も最小 5.09% で、ゼロ近傍の集団が消える**
   （[2 章](#2-計測-2-逸脱量の分布)）。
5. **入り側の素通し（`insufficient_history`）は本コーパスで 0 件。実際に発火するのは
   `no_prior_extreme` で 635 行 / 構造単位 94 件。** issue が挙げた `insufficient_history` は
   到達可能だが（第1構成点が idx ≤ 8 かつ先行極値が存在するとき）実測 0。
   **`buildStructureGate` が落としている `skipped` は 2 値あり、出力に届いていないのは両方**
   （[3 章](#3-計測-3-入り側の検査を素通しした件数)）。
6. **ゼロ許容 hard gate の試算は `data.patterns` 全体で 0 〜 −70 件**（基準による。
   `extremePrice` × 外挿クランプ付きの線は完全な no-op）。
   `price` × スカラーで **−65 件**、内訳は triple −56 / double −4 / H&S −5。
   **落ちるのは価格系列上 57 構造で、うち `data.patterns` に到達していたのは 10 構造**
   （[4 章](#4-計測-4-hard-gate-として入れた場合の影響試算のみ)・[付録](#付録-誤った側にある構造の全件明細)）。
7. **`buildStructureGate` は 2 箇所に同じ実装がある。** `reversal-gate.ts` の export 版
   （triple / H&S が使用）と `detect_doubles.ts` のファイル内 private 版（doubles が使用）で、
   本文は完全に同一。**Phase 2 で `skipped` を出力に載せるなら 2 箇所直す必要がある**
   （[5-2 章](#5-2-buildstructuregate-は-2-箇所にある)）。

## 計測条件

| 項目 | 値 |
|---|---|
| 計測日 | 2026-09-02 |
| 対象コミット | `5bdfa1f`（#215 マージ後の `main`） |
| コーパス | **標準コーパス 800**（合成 704 = `tests/detect_patterns_fixtures.test.ts` の fixture 22 件 × オプション 8 通り × 時間足 2 種（`1day` / `1hour`）× `swingDepth` 2 種（2 / 3）、実データ A 96 = `tests/fixtures/btc_jpy_1day_2026.ts` × 時間足 3 種（`1day` / `4hour` / `1hour`）× `swingDepth` 4 種（既定 / 2 / 3 / 6）× オプション 8 通り）**＋ 実データ B 96**（`tests/fixtures/btc_jpy_1hour_2026_08.ts` × 同上）= **896 ケース**。**＋ 補助スイープ 44**（実データ B × 全 11 時間足 × `swingDepth` 4 種）= **940 ケース**。#205 / #206 / #213 と同じ組み方 |
| オプション 8 通り | `includeForming` × `includeCompleted` × `includeInvalid` の全組み合わせ |
| ハーネス | `detect_patterns.ts` と同じ順序で ctx を組み、6 検出器を連結 → `globalDedup` → ライフサイクル絞り込みまで再現する直接呼び出し |
| view | 検出器を直接呼ぶので MCP の `view` を経由しない。`data.patterns` は `view` で変わらないため **`view=full` と同値** |
| 母集団 | **issue が列挙した 9 つのゲート呼び出しを通る完成済み経路が出したパターン**（`detect_doubles.ts:315` の `applyStructuralGate` = 1 呼び出しを 4 経路が共有、`detect_triples.ts` の strict / relaxed 各 2 = 4 呼び出し、`detect_hs.ts` の strict / relaxed 各 2 = 4 呼び出し。**パターンを emit する箇所としては 12**）。生の行数 **4,833** / 構造単位 **914** / `globalDedup` 後 延べ **997**・構造単位 **157** / `data.patterns` **676**（全 type 合計 1,968 の内数）。**形成中経路は issue の列挙対象外**なので本文からは外し、[5-1 章](#5-1-形成中経路issue-の列挙対象外)に参考値としてまとめた |
| 件数の 3 段階 | **生の行数**（オプション × `swingDepth` × 時間足の重複を含む）/ **構造単位** `(系列, tf, type, 構成点の idx)` / **`globalDedup` 後**（ケースごとの残存を延べで合算）。#203 / #205 / #206 と同じ |
| 錨 | **ネイティブ時間足サブセット**（実データ B × `1hour`、実データ A × `1day`）。標準コーパスの「時間足」はリサンプリングではなくパラメータのラベル（#205 の同名の注記と同じ限界）。**結論はプール値で書かない** |

### ハーネスの検算（#205 / #206 / #213 の数値の再現）

新しく組んだハーネスなので、既存の実測ログと突き合わせて先に検算した。**全項目一致**:

| 出典 | 項目 | 記載値 | 本ハーネス |
|---|---|---:|---:|
| #205 | H&S 生の行数（940 ケース・`forming` 除外） | 4,349 | **4,349** |
| #205 | H&S 構造単位 | 857 | **857** |
| #205 | 標準コーパス 896 の生の行数 / `(系列,type,idx)` | 2,608 / 119 | **2,608 / 119** |
| #205 | 同 内訳（completed / near_completion） | 1,336 / 1,272 | **1,336 / 1,272** |
| #205 | 同 構造単位 | 170 | **170** |
| #205 | ネイティブ（実データ B × `1hour`）構造単位 | 89 | **89** |
| #205 | ネイティブ（実データ A × `1day`）構造単位 | 2 | **2** |
| #206 | 反転 6 種の生の行数（940 ケース延べ） | 4,833 | **4,833** |
| #206 | コーパス層 896 ケースの `triple_top` / `triple_bottom` | 88 / 92 | **88 / 92** |
| #213 | 940 ケースの `data.patterns` 合計 | 1,968 | **1,968** |
| #213 | 同 `head_and_shoulders` / `inverse_head_and_shoulders` | 166 / 162 | **166 / 162** |

issue 本文の実例（実データ B `1hour` の `triple_top` conf 0.70 で山3 がネックライン
12,285,548 より 3,274 円下）も全桁で再現した——構成点 219-223-232、
ネックライン 12,285,548.5、山3 の終値 12,282,275、差 **3,273.5 円**。

### 「誤った側」と「パターン高さ」の定義

- **誤った側**: `top` 系（`double_top` / `triple_top` / `head_and_shoulders`）は
  **点がネックラインより下**、`bottom` 系は**点がネックラインより上**。逸脱量は
  `top: NL − 点`、`bottom: 点 − NL` で、**正なら誤った側**（0 は同値扱いで数えない）。
- **価格基準**: `price`（終値。同水準判定・ネックラインの慣行）と
  `extremePrice`（高安。値幅の慣行）の**両方**で出す（`structural.ts` の
  `LevelSpreadMetrics` の表と同じ 2 系統）。
- **ネックライン**: 3 通りで出す。
  - **`scalar`** = 構造ゲートに実際に渡されるスカラー水準（double / triple はネックライン水準そのもの、
    strict H&S は 2 谷の平均 `nlAvg`、relaxed H&S は水平線 `nlY`、形成中 H&S は `neckline[0].y`）。
  - **`line`** = `necklineAt(neckline, 点の idx)`。**`findBreakoutIdx` / `findHsBreakoutIdx` が
    ブレイク判定に使うのと同じ線**。double / triple は水平なので `scalar` と一致する。
  - **`clamped`** = `line` の添字を定義 2 点の x 範囲にクランプしたもの。
    **#211（`necklineAt` の外挿クランプ）が入った場合の参考値**で、本 Phase では実装しない
    （issue の併走制約どおり、#211 の変更自体には手を付けていない）。
- **パターン高さ**: 2 通り。
  - **`heightProj`** = `|主構成点の平均 − ネックライン|`。`buildDoubleScore` /
    `buildTripleScore` の `patternHeight`、H&S は `necklineProjectionHeight`（頭の真下で測る高さ）。
    **`breakoutQualityScore` と `breakoutTarget` の射影が使っている高さ**。
  - **`heightAmp`** = 全構成点の `extremePrice` の全振幅（`validatePatternSize` /
    `levelSpreadMetrics.heightAbs` と同じ量）。triple は谷が `pivots` に載らないので
    検出器と同じ手順（区間内の最安 / 最高）で再構成し、**再構成した 2 谷の平均が
    出力のネックラインと一致することを完成済み 4,833 行の全件で検算した**（不一致 0）。

  issue 本文の「パターン高さ比 約 −2%」は上の実例で `heightProj` 基準 **2.96%** /
  `heightAmp` 基準 **0.83%** に相当する。本ログは `heightProj` を主に使う。

## 1. 計測 1: 誤った側にある候補の件数

### 1-1. どの点を見たか

| type | `first` / `mid`（検査済み） | 主構成点（未検査・本計測の対象） | 参考 |
|---|---|---|---|
| `double_*` | 第1構成点 / ネックライン | **第2構成点** | — |
| `triple_*` | 第1構成点 / 第1中間点 | **第2構成点・第3構成点** | — |
| H&S 系 | 左肩 (p0) / 第1中間点 (p1) | **頭 (p2)・右肩 (p4)** | 第2中間点 (p3) |

p3 は `mid` と同じ役割なので[別集計](#1-5-参考-p3第2中間点)にした。

### 1-2. 940 ケース全体

`price`（終値）基準・ネックライン `scalar`（構造ゲートに渡る水準）:

| type | 生の行数 n | 誤側 行 | 構造単位 n | 誤側 構造 | dedup後 延べ n | 誤側 延べ | dedup後 構造 n | 誤側 構造 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `double_top` | 76 | 0 | 6 | 0 | 76 | 0 | 6 | 0 |
| `double_bottom` | 152 | 4 | 14 | 2 | 144 | 4 | 14 | 2 |
| `triple_top` | 152 | 88 | 19 | 12 | 140 | 88 | 17 | 12 |
| `triple_bottom` | 104 | 20 | 18 | 2 | 104 | 20 | 18 | 2 |
| `head_and_shoulders` | 2,359 | 46 | 374 | 13 | 273 | 9 | 42 | 2 |
| `inverse_head_and_shoulders` | 1,990 | 615 | 483 | 158 | 260 | 45 | 60 | 12 |
| **合計** | **4,833** | **773** | **914** | **187** | **997** | **166** | **157** | **30** |

`price` 基準・ネックライン `line`（ブレイク判定と同じ線）:

| type | 生の行数 n | 誤側 行 | 構造単位 n | 誤側 構造 | dedup後 延べ n | 誤側 延べ | dedup後 構造 n | 誤側 構造 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `double_top` | 76 | 0 | 6 | 0 | 76 | 0 | 6 | 0 |
| `double_bottom` | 152 | 4 | 14 | 2 | 144 | 4 | 14 | 2 |
| `triple_top` | 152 | 88 | 19 | 12 | 140 | 88 | 17 | 12 |
| `triple_bottom` | 104 | 20 | 18 | 2 | 104 | 20 | 18 | 2 |
| `head_and_shoulders` | 2,359 | 492 | 374 | 77 | 273 | 152 | 42 | 21 |
| `inverse_head_and_shoulders` | 1,990 | 221 | 483 | 98 | 260 | 36 | 60 | 13 |
| **合計** | **4,833** | **825** | **914** | **191** | **997** | **300** | **157** | **50** |

`extremePrice`（高安）基準:

| ネックライン | 誤側 行 | 誤側 構造 | dedup後 誤側 延べ | dedup後 誤側 構造 |
|---|---:|---:|---:|---:|
| `scalar` | 458 | 122 | 46 | 13 |
| `line` | 116 | 49 | 15 | 8 |
| `clamped`（#211 参考） | 4 | 4 | 0 | 0 |

`price` × `clamped`（#211 参考）は 誤側 行 332 / 構造 85 / dedup後 延べ 150 / 構造 23。

**同じ現象を数えているのに、価格基準とネックラインの取り方の組み合わせで
構造単位が 4 〜 191 件まで動く。** 件数の大小で対策を決められる状態ではない。

### 1-3. 役割別（どの点が誤った側に来るのか）

生の行数・誤側の点の数 / その役割の点の総数:

| type・役割 | `price`×`scalar` | `price`×`line` | `extreme`×`scalar` | `extreme`×`line` |
|---|---:|---:|---:|---:|
| `triple_top` 第2構成点 | 0 / 152 | 0 / 152 | 0 / 152 | 0 / 152 |
| `triple_top` 第3構成点 | 88 / 152 | 88 / 152 | 0 / 152 | 0 / 152 |
| `triple_bottom` 第2構成点 | 0 / 104 | 0 / 104 | 0 / 104 | 0 / 104 |
| `triple_bottom` 第3構成点 | 20 / 104 | 20 / 104 | 0 / 104 | 0 / 104 |
| `double_top` 第2構成点 | 0 / 76 | 0 / 76 | 0 / 76 | 0 / 76 |
| `double_bottom` 第2構成点 | 4 / 152 | 4 / 152 | 0 / 152 | 0 / 152 |
| `head_and_shoulders` 頭 | **0 / 2,359** | **0 / 2,359** | 0 / 2,359 | 0 / 2,359 |
| `head_and_shoulders` 右肩 | 46 / 2,359 | 492 / 2,359 | 3 / 2,359 | 2 / 2,359 |
| `inverse_head_and_shoulders` 頭 | **0 / 1,990** | **6 / 1,990** | 0 / 1,990 | 0 / 1,990 |
| `inverse_head_and_shoulders` 右肩 | 615 / 1,990 | 215 / 1,990 | 455 / 1,990 | 114 / 1,990 |

**誤った側に来るのは実質「構成点列の最後の主構成点」だけ**——triple の第3構成点、
double の第2構成点、H&S の右肩。中間の第2構成点（triple）と頭（H&S）は全基準で 0 件
（例外は `price`×`line` の逆 H&S の頭 6 行で、これは[付録](#付録-誤った側にある構造の全件明細)の
No.91 / 93 / 95——頭 (idx 331) がネックライン定義点 p1 (330) と p3 (339〜355) に挟まれた
区間の端にある退化した形。`1min` ラベルのみ）。

**構造としては当然の結果**で、`first` / `mid` を起点に時間方向へ進むほどネックラインからの
乖離が蓄積する。**「頭を検査しないと危ない」という形は本コーパスに存在しない**が、
「最後の 1 点を検査していない」ことの帰結は実データで出ている。

### 1-4. H&S は「どのネックラインを指すか」で結果が反転する

`detect_hs.ts` は**構造ゲートにスカラーを渡し、ブレイク判定には傾きつきの線**を使う
（`findStrictInverseHS` のコメントが理由を書いている——「傾きを外挿して遡ると、
探索窓 60 本ぶんの外挿誤差が水準そのものより大きくなり得る」）。
右肩 p4 は線の定義 2 点 p1 / p3 の**外側**にあるので、右肩を線で評価すると必ず外挿になる。

実データ B `inverse_head_and_shoulders` 3,9,42,118,134（`1hour`・`swingDepth` 2・conf 0.80、
`data.patterns` に出ている構造）:

| 点 | idx | 終値 | 役割 |
|---|---:|---:|---|
| p0 | 3 | 10,112,502 | 左肩 |
| p1 | 9 | 10,173,012 | 第1中間点（ネックライン定義点） |
| p2 | 42 | 9,965,270 | 頭 |
| p3 | 118 | 10,278,277 | 第2中間点（ネックライン定義点） |
| p4 | 134 | 10,247,756 | 右肩 |

- スカラー水準 = (10,173,012 + 10,278,277) / 2 = **10,225,644.5** → 右肩は **22,112 円上**（誤った側）
- 線 = `necklineAt` を idx 134 で評価 = **10,293,728.7**（p3 から 16 本外挿）→ 右肩は **45,973 円下**（正しい側）

**同じ構造が、どちらのネックラインを指すかで「壊れている」と「正常」に分かれる。**
外挿クランプ（#211）を入れた場合は線が p3 の値 10,278,277 で止まるので、右肩は
30,521 円下＝正しい側になる。

この効果は集計にも表れる（構造単位・`price` 基準）:

| ネックライン | `head_and_shoulders` | `inverse_head_and_shoulders` |
|---|---:|---:|
| `scalar` | 13 | 158 |
| `line`（現行のブレイク判定と同じ） | 77 | 98 |
| `clamped`（#211 参考） | 35 | 34 |

**`head_and_shoulders` と `inverse_head_and_shoulders` で `scalar` と `line` の大小が逆転する**
（13 < 77 と 158 > 98）。上向き傾斜のネックラインを右へ外挿すると、`top` 側では線が上がって
右肩が「下に外れやすく」なり、`bottom` 側では線が上がって右肩が「上に外れにくく」なるため。

**Phase 2 は「ネックラインをどう評価するか」を先に決めないと件数の意味が決まらない。
そしてその決定は #211 と同じ関数に触る**（issue の併走制約はこの点で正しい）。

### 1-5. 参考: p3（第2中間点）

| 基準 | 誤側 行 / 全行 | 誤側 構造 / 全構造 |
|---|---:|---:|
| `price` × `scalar` | 2,101 / 4,349 | 423 / 857 |
| `price` × `line` | **0** / 4,349 | **0** / 857 |
| `extreme` × `scalar` | 2,435 / 4,349 | 511 / 857 |
| `extreme` × `line` | 4,344 / 4,349 | 855 / 857 |

**この行はどれも定義から自動的に決まる値で、構造の良し悪しを測っていない。**

- `price` × `line`: strict H&S の線は p1 / p3 の**終値**を通るので、p3 での線の値は
  p3 の終値そのもの。逸脱量は恒等的に 0。
- `price` × `scalar`: スカラーは p1 と p3 の平均なので、**2 点のうち低いほう（top なら）が
  必ず「誤った側」に落ちる**。約半分（2,101 / 4,349）という値はこの機械的な帰結。
- `extreme` × `line`: p3 は top では谷なので `extremePrice`（安値）は必ず終値以下、
  つまり線より下＝「誤った側」。4,344 / 4,349 はこの機械的な帰結。

**p3 に同じ検査を掛ける設計は取れない**（`mid` と同じ役割の点であり、ネックラインの
定義点そのものだから）。issue が「参考として別集計」としたのは妥当で、本計測でも
**Phase 2 の候補から外すべき**という以上の情報は出ない。

### 1-6. ネイティブ時間足サブセット（解釈の錨）

実データ B × `1hour` ＋ 実データ A × `1day`（32 + 32 = 64 ケース）。`price` 基準:

| type | 生の行数 n | 誤側 `scalar` | 誤側 `line` | 誤側 `clamped` | 構造単位 n | 誤側構造 `scalar` / `line` / `clamped` |
|---|---:|---:|---:|---:|---:|---|
| `double_top` | 0 | 0 | 0 | 0 | 0 | 0 / 0 / 0 |
| `double_bottom` | 56 | 0 | 0 | 0 | 5 | 0 / 0 / 0 |
| `triple_top` | 44 | 36 | 36 | 36 | 4 | 2 / 2 / 2 |
| `triple_bottom` | 51 | 12 | 12 | 12 | 4 | 1 / 1 / 1 |
| `head_and_shoulders` | 897 | 9 | 171 | 36 | 44 | 1 / 9 / 4 |
| `inverse_head_and_shoulders` | 756 | 324 | 0 | 0 | 47 | 20 / 0 / 0 |
| **合計** | **1,804** | **381** | **219** | **84** | **104** | **24 / 12 / 7** |

`extremePrice` 基準では `scalar` が 243 行 / 16 構造、`line` と `clamped` は **0 行 / 0 構造**。

**ネイティブでも triple の 3 構造（`triple_top` 2 / `triple_bottom` 1）はどの基準でも残る**
（`price` 基準。`extremePrice` では 0）。
**`inverse_head_and_shoulders` の 20 構造はスカラー基準でしか出ない**——線基準では 0 件で、
1-4 章の反転がそのまま効いている。

## 2. 計測 2: 逸脱量の分布

**ここが対策を決める。** 以下はすべて**構造単位の点**（同じ `(系列, tf, type, 構成点 idx, 役割)` は
最大の逸脱量で 1 件に畳む）。

### 2-1. 分位（940 ケース・`price` 基準・ネックライン `scalar`）

絶対額（円）:

| type | n | min | p10 | p25 | p50 | p75 | p90 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `double_bottom` | 2 | 20,213 | 20,213 | 20,213 | 20,213 | 20,213 | 20,213 | 20,213 |
| `triple_top` | 12 | 3,274 | 3,274 | 3,274 | 5,905 | 8,536 | 8,536 | 8,536 |
| `triple_bottom` | 2 | 2,147 | 2,147 | 2,147 | 2,147 | 2,147 | 2,147 | 2,147 |
| `head_and_shoulders` | 13 | 3,274 | 4,919 | 10,445 | 96,963 | 96,963 | 107,962 | 110,673 |
| `inverse_head_and_shoulders` | 158 | **30.50** | 6,037 | 22,016 | 69,568 | 108,510 | 137,773 | 213,083 |

パターン高さ比（`heightProj` = 主構成点平均 − ネックライン）:

| type | n | min | p10 | p25 | p50 | p75 | p90 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `double_bottom` | 2 | 310.83% | 310.83% | 310.83% | 310.83% | 310.83% | 310.83% | 310.83% |
| `triple_top` | 12 | **2.96%** | 2.96% | 2.96% | 4.38% | 5.80% | 5.80% | 5.80% |
| `triple_bottom` | 2 | 6.31% | 6.31% | 6.31% | 6.31% | 6.31% | 6.31% | 6.31% |
| `head_and_shoulders` | 13 | **0.88%** | 1.52% | 7.08% | 29.15% | 29.15% | 36.11% | 147.86% |
| `inverse_head_and_shoulders` | 158 | **0.01%** | 2.94% | 10.44% | 31.48% | 53.32% | 58.30% | 611.73% |

パターン高さ比（`heightAmp` = 全構成点の高安全振幅）:

| type | n | min | p25 | p50 | p75 | max |
|---|---:|---:|---:|---:|---:|---:|
| `double_bottom` | 2 | 20.01% | 20.01% | 20.01% | 20.01% | 20.01% |
| `triple_top` | 12 | 0.78% | 0.78% | 0.81% | 0.83% | 0.83% |
| `triple_bottom` | 2 | 0.21% | 0.21% | 0.21% | 0.21% | 0.21% |
| `head_and_shoulders` | 13 | 0.42% | 2.66% | 20.51% | 20.51% | 71.02% |
| `inverse_head_and_shoulders` | 158 | 0.01% | 6.52% | 13.02% | 18.88% | 33.58% |

> `double_bottom` の 310.83% と `inverse_head_and_shoulders` の 611.73% は
> **`heightProj` の分母が退化している構造**（実データ B の `double_bottom` 285,287,288 は
> 高さ 6,503 円、逆 H&S 325,330,331,355,358 は頭が第2中間点と 1 本しか離れていない）。
> `heightAmp` 基準ではそれぞれ 20.01% / 33.58% で、桁が変わる。
> **「パターン高さ比」で閾値を置くなら、どちらの高さを分母にするかが挙動を決める。**

### 2-2. ヒストグラム（構造単位の点・1% 階級・`price` 基準）

ネックライン `scalar`:

```text
double_bottom (n=2)   310-311%:2
triple_top (n=12)     2-3%:6 5-6%:6
triple_bottom (n=2)   6-7%:2
head_and_shoulders (n=13)
  0-1%:1 1-2%:1 2-3%:1 7-8%:1 19-20%:1 29-30%:5 36-37%:2 147-148%:1
inverse_head_and_shoulders (n=158)
  0-1%:14 2-3%:3 6-7%:5 7-8%:5 8-9%:5 9-10%:5 10-11%:9 13-14%:4 22-23%:9 23-24%:2
  29-30%:10 31-32%:17 35-36%:3 41-42%:10 51-52%:5 52-53%:12 53-54%:7 54-55%:7
  55-56%:10 64-65%:10 92-93%:3 317-318%:1 390-391%:1 611-612%:1
```

ネックライン `line`:

```text
double_bottom (n=2)   310-311%:2
triple_top (n=12)     2-3%:6 5-6%:6
triple_bottom (n=2)   6-7%:2
head_and_shoulders (n=77)
  2-3%:1 3-4%:20 4-5%:12 5-6%:3 18-19%:20 19-20%:5 20-21%:2 23-24%:2 33-34%:1
  41-42%:6 45-46%:2 58-59%:1 66-67%:1 96-97%:1
inverse_head_and_shoulders (n=98)
  0-1%:4 1-2%:3 2-3%:4 4-5%:10 6-7%:2 8-9%:6 9-10%:8 11-12%:4 15-16%:12 16-17%:8
  35-36%:8 36-37%:4 41-42%:8 42-43%:4 44-45%:4 50-51%:4 67-68%:2 100-101%:3
```

ネックライン `clamped`（#211 参考）:

```text
double_bottom (n=2)   310-311%:2
triple_top (n=12)     2-3%:6 5-6%:6
triple_bottom (n=2)   6-7%:2
head_and_shoulders (n=35)
  7-8%:1 13-14%:18 14-15%:2 16-17%:4 18-19%:1 21-22%:5 23-24%:2 31-32%:1 109-110%:1
inverse_head_and_shoulders (n=34)
  5-6%:4 9-10%:2 11-12%:2 13-14%:8 15-16%:4 16-17%:4 28-29%:7 100-101%:3
```

### 2-3. ゼロ近傍の細密ヒストグラム（0.1% 刻み）

**「ゼロ近傍に張り付いているか、明確に逸脱しているか」が本 issue の分岐点**なので、
0〜2% を 0.1% 刻みで割った:

| ネックライン | type | 0〜2% の分布 | 最小値 |
|---|---|---|---|
| `scalar` | `head_and_shoulders` | 0.8-0.9%:1 / 1.3-1.4%:1 / ≥2%:11 | 0.880%（4,854 円） |
| `scalar` | `inverse_head_and_shoulders` | **0.0-0.1%:5** / 0.5-0.6%:4 / 0.6-0.7%:5 / ≥2%:144 | **0.012%（31 円）** |
| `line` | `head_and_shoulders` | ≥2%:77（0〜2% は空） | 2.201%（1,698 円） |
| `line` | `inverse_head_and_shoulders` | 0.7-0.8%:4 / 1.0-1.1%:3 / ≥2%:91 | 0.705%（659 円） |
| `clamped` | `head_and_shoulders` | ≥2%:35（0〜2% は空） | **7.908%**（3,635 円） |
| `clamped` | `inverse_head_and_shoulders` | ≥2%:34（0〜2% は空） | **5.089%**（7,744 円） |

`double` / `triple` は全基準で共通（水平ネックライン）: `triple_top` 最小 **2.96%**、
`triple_bottom` **6.31%**、`double_bottom` **310.83%**（`heightAmp` 基準では 0.78% / 0.21% / 20.01%）。

### 2-4. この分布から言えること（対策の決定ではない）

- **`double` / `triple` は明確に分離している。** 最小が `heightProj` 基準 2.96%、
  絶対額 2,147 円で、0 に張り付いた集団は無い。**ゼロ許容の hard gate でも
  「誤差で落ちる」候補は出ない。** ただし**該当するのは価格系列上 4 構造だけ**で、
  すべて実データ B。標本が薄いという限界がそのまま付く。
- **H&S 系はネックラインの取り方で答えが変わる。**
  - `scalar`（現行の構造ゲートが渡す水準）: `inverse_head_and_shoulders` に
    **0.012%（31 円）のゼロ張り付き**があり、0〜1% に構造単位 14 件。
    **ゼロ許容の hard gate は連続分布を任意の位置で切ることになる。**
  - `clamped`（#211 が入った後）: **両 type とも 0〜2% が空で、最小が 5.09% / 7.91%。**
    ゼロ許容でも許容幅 2% でも切れ方が変わらない＝**閾値が非任意になる。**
  - `line`（現行のブレイク判定と同じ）: `head_and_shoulders` は 0〜2% が空
    （最小 2.20%）だが `inverse_head_and_shoulders` は 0.705% から連続。
- したがって **#214 と同じ基準（「分布に空白帯があるか」「閾値を動かすと通過集合が動くか」）で見ると、
  非任意と言えるのは `double` / `triple`（全基準）と H&S 系（`clamped` 基準のみ）**で、
  **H&S 系を現行の `scalar` で切ると値が任意のつまみになる。**
  #211 の順序が Phase 2 の設計自由度を決めている。

## 3. 計測 3: 入り側の検査を素通しした件数

### 3-1. `insufficient_history` は 0 件だった

`validateReversalStructure` は素通しを 2 通り返す:

| `skipped` | 条件 | 940 ケースの実測（完成済み 4,833 行） |
|---|---|---:|
| `no_prior_extreme` | 第1構成点より前に反対種別のピボットが無い | **635 行 / 構造単位 94 件** |
| `insufficient_history` | ネックライン交差の探索窓が `PRIOR_TREND_LOOKBACK_MIN = 10` 本未満 | **0 行** |

**issue が挙げた `insufficient_history` は本コーパスで 1 度も発火していない。**
到達不能ではない——`findNecklineCross` の窓は `[first.idx − 60, first.idx]` で
`min(first.idx, 60) + 1 < 10`、すなわち **第1構成点が idx ≤ 8** のときに `conclusive: false` になる。
ただしその手前に `findPriorExtreme` があり、idx ≤ 8 の第1構成点より前に**反対種別のピボットが
存在する**必要がある（`swingDepth` の下限からピボットは idx ≥ `swingDepth` にしか立たない）。
実測では該当が無く、その手前の `no_prior_extreme` で先に素通ししていた。

> **派生規則で代用しないこと。** 「`insufficient_history` ⟺ 第1構成点 idx ≤ 8」という
> 素朴な同値は**成り立たない**（完成済み 4,833 行のうち 562 行で不一致）。
> 本計測は `buildStructureGate` に一時的な計測フィールドを足して**実際の `skipped` を読んで**いる。

### 3-2. `no_prior_extreme` の内訳（時間足別・生の行数）

| type | 1min | 5min | 15min | 30min | 1hour | 4hour | 1day | 合計 | 構造単位 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `double_top` | 0 | 0 | 0 | 0 | 16 | 0 | 16 | 32 | 2 |
| `double_bottom` | 0 | 0 | 0 | 0 | 12 | 12 | 16 | 40 | 3 |
| `triple_top` | 0 | 0 | 0 | 0 | 24 | 0 | 24 | 48 | 4 |
| `triple_bottom` | 0 | 0 | 0 | 0 | 16 | 0 | 16 | 32 | 4 |
| `head_and_shoulders` | 1 | 0 | 0 | 0 | 16 | 0 | 16 | 33 | 3 |
| `inverse_head_and_shoulders` | 41 | 41 | 31 | 27 | 270 | 24 | 16 | 450 | 78 |
| **合計** | 42 | 41 | 31 | 27 | 354 | 36 | 104 | **635** | **94** |

`8hour` / `12hour` / `1week` / `1month` は全 type 0 件（そもそも検出が 0 件）。

### 3-3. 計測 1 との重なり

| 基準 | `no_prior_extreme` 行 | うち誤側 | 全誤側行 |
|---|---:|---:|---:|
| `price` × `scalar` | 635 | 108 | 773 |
| `price` × `line` | 635 | 36 | 825 |
| `price` × `clamped` | 635 | 6 | 332 |
| `extreme` × `scalar` | 635 | 69 | 458 |
| `extreme` × `line` | 635 | 30 | 116 |
| `extreme` × `clamped` | 635 | 0 | 4 |

**素通しした候補と誤った側にある候補は大部分が別物。**
`price` × `scalar` では誤側 773 行のうち素通しは 108 行（14.0%）で、
残り 665 行は**入り側の検査を通ったうえで出側の主構成点が反対側にある**。
**2 つは重なって見えていたわけではなく、別々の穴。**

### 3-4. 出力に届いていないもの

`buildStructureGate`（[5-2 章](#5-2-buildstructuregate-は-2-箇所にある)の 2 実装とも）が
写しているのは `retracementRatio` / `priorExtremeIdx` / `priorExtremePrice` /
`necklineCrossIdx` の 4 つで、**`skipped` は写していない。** 結果として出力側には:

| 実際の状態 | 出力に出る形 |
|---|---|
| 交差を見つけた | `structureGate.necklineCrossIdx` あり |
| 交差が無いことを立証（＝ reject） | パターン自体が出ない |
| `insufficient_history` で素通し | `structureGate` はあるが `necklineCrossIdx` が無い |
| `no_prior_extreme` で素通し | **`structureGate` そのものが出ない**（キーが 1 つも立たず `undefined` に畳まれる） |

**`necklineCrossIdx` が無い＝「検査したが交差の証拠が無い」なのか
「そもそも検査していない」なのかを呼び出し側が区別できない**という issue の指摘はそのとおりで、
さらに **`no_prior_extreme` は `structureGate` フィールドごと消える**ため、
「構造ゲートを通っていない」と「構造ゲートが無い」の区別も付かない。
本コーパスでは後者が 635 行（前者は 0 行）で、**実際に効いているのは issue が挙げたほうではない。**

## 4. 計測 4: hard gate として入れた場合の影響（試算のみ）

### 4-1. 試算の方法

**post-hoc のフィルタでは測れない**（#206 の 1 章と同じ理由——relaxed フォールバックの発火と
`globalDedup` の代表入れ替わりが起きる）ので、**検出器に実際にゲートを入れて測った。**
配置は emit 箇所 12 か所とも**既存の棄却検査をすべて通過した後**（`patterns.push` / `return` の直前。
triple では `confidence_below_min` より後ろ）で、理由コードは `main_point_wrong_side_of_neckline`。
**`enabled=false` のゲートが 940 ケース全件で `data.patterns` 合計 1,968 と
非反転 6 種の出力を完全一致させる**ことを先に確認してあるので、以下の差分は判定だけの効果。

**この試算のためのコード変更はリポジトリに含めていない**（計測用の作業コピーでのみ実施）。

### 4-2. type 別の増減

`price` 基準・ネックライン `scalar`（ゲート発火 942 候補）:

| type | 生の行数 | Δ | 構造単位 | Δ | dedup後 延べ | Δ | dedup後 構造 | Δ | `data.patterns` | Δ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `double_top` | 76 | 0 | 6 | 0 | 76 | 0 | 6 | 0 | 40 | 0 |
| `double_bottom` | 148 | −4 | 12 | −2 | 140 | −4 | 12 | −2 | 84 | **−4** |
| `triple_top` | 64 | −88 | 7 | −12 | 64 | −76 | 7 | −10 | 68 | **−44** |
| `triple_bottom` | 84 | −20 | 16 | −2 | 84 | −20 | 16 | −2 | 96 | **−12** |
| `head_and_shoulders` | 2,313 | −46 | 361 | −13 | 273 | 0 | 43 | **+1** | 166 | 0 |
| `inverse_head_and_shoulders` | 1,375 | −615 | 325 | −158 | 256 | −4 | 57 | −3 | 157 | **−5** |
| **`data.patterns` 全体（全 12 type）** | | | | | | | | | 1,903 | **−65** |

`price` × `line`（発火 994）:

| type | 生の行数 Δ | 構造単位 Δ | dedup後 延べ Δ | dedup後 構造 Δ | `data.patterns` Δ |
|---|---:|---:|---:|---:|---:|
| `double_bottom` | −4 | −2 | −4 | −2 | −4 |
| `triple_top` | −88 | −12 | −76 | −10 | −44 |
| `triple_bottom` | −20 | −2 | −20 | −2 | −12 |
| `head_and_shoulders` | −492 | −77 | −6 | **+3** | −4 |
| `inverse_head_and_shoulders` | −221 | −98 | −23 | −5 | −5 |
| **全体** | | | | | **−69** |

`price` × `clamped`（発火 501・#211 参考）:

| type | 生の行数 Δ | 構造単位 Δ | dedup後 構造 Δ | `data.patterns` Δ |
|---|---:|---:|---:|---:|
| `double_bottom` | −4 | −2 | −2 | −4 |
| `triple_top` | −88 | −12 | −10 | −44 |
| `triple_bottom` | −20 | −2 | −2 | −12 |
| `head_and_shoulders` | −141 | −35 | −1 | −2 |
| `inverse_head_and_shoulders` | −79 | −34 | −3 | −8 |
| **全体** | | | | **−70** |

`extremePrice` 基準（発火 458 / 116 / 1）:

| ネックライン | `head_and_shoulders` Δ | `inverse_head_and_shoulders` Δ | double / triple Δ | `data.patterns` 全体 Δ |
|---|---:|---:|---:|---:|
| `scalar` | 0 | −5 | **0** | **−5** |
| `line` | 0 | −2 | **0** | **−2** |
| `clamped` | 0 | 0 | **0** | **0** |

**`extremePrice` 基準では double / triple が 1 件も落ちない**——3-4 章で見たとおり、
ヒゲを含めれば主構成点はネックラインの正しい側に収まっている。
`extremePrice` × `clamped` は **完全な no-op**。

### 4-3. triple の `MIN_CONFIDENCE` と relaxed フォールバックの連鎖

**直接の棄却と連鎖する増減は分離できた。**

- **`confidence_below_min`（strict）は 1 件も動かない。** 新しいゲートを
  `confidence_below_min` より後ろに置いたため、両方に該当する候補は
  先に confidence で落ちる＝理由の帰属が変わらない。
- **連鎖はすべて relaxed フォールバックの発火。** strict が対象 type を 0 件にすると
  `detectTriples` / `detectDoubles` が relaxed 段へ落ちるため、
  relaxed 経路の棄却候補が増える:

| 棄却理由 | ベースライン | ゲート後 | Δ |
|---|---:|---:|---:|
| `valleys_missing_relaxed` | 1,625 | 3,173 | +1,548 |
| `peak_too_shallow` | 2,423 | 3,377 | +954 |
| `valley_too_shallow` | 2,138 | 2,948 | +810 |
| `peaks_missing_relaxed` | 1,096 | 1,708 | +612 |
| `pattern_too_small` | 5,809 | 6,223 | +414 |
| `neckline_slope_excess_relaxed` | 1,944 | 2,250 | +306 |
| `neckline_below_pre_decline_low` | 2,695 | 2,821 | +126 |
| `neckline_above_pre_decline_high` | 1,441 | 1,585 | +144 |
| `valleys_not_equal_relaxed` | 744 | 852 | +108 |
| `peak_spread_vs_height_excess` | 188 | 296 | +108 |
| `valley_spread_vs_height_excess` | 161 | 179 | +18 |
| **`confidence_below_min_relaxed`** | **0** | **54** | **+54** |
| `main_point_wrong_side_of_neckline` | 0 | 942 | +942 |

  この増減は **`price` の 3 モード（`scalar` / `line` / `clamped`）で完全に同一**——
  double / triple のネックラインは水平でモード間の差が無く、relaxed 発火を駆動するのは
  double / triple の棄却だけだから。`extremePrice` 基準では double / triple が落ちないので
  **`main_point_wrong_side_of_neckline` 以外の理由コードは 1 件も動かない。**
- **relaxed が accept した件数は全変種で 0**（ベースラインも 0）。#205 の
  「relaxed 経路は 1 件も accept していない」がゲート後も成り立つ。
  したがって **`confidence_below_min_relaxed` の +54 は棄却の増加であって、
  通過集合の変化ではない。**
- **`globalDedup` の代表入れ替わりは起きている。** `head_and_shoulders` は
  生の行数が −46（`scalar`）/ −492（`line`）減っているのに **dedup 後の構造単位が +1 / +3 増える**。
  低い候補が消えて別の候補が代表になり `range` が変わるため（#213 の 3-2 / #206 の 2-2 と同じ性質）。
  **「検出器層で減った数」と「出力で減った数」を足し引きで結び付けられない。**
- **非反転 6 種（三角形・ウェッジ・フラッグ・ペナント系）の `data.patterns` は
  全変種・940 ケース全件で完全一致。** `globalDedup` の `isSameCategory` が
  カテゴリを跨いで統合しないため、押し出しによる間接的な変化は無い。

### 4-4. 落ちる構造

`price` 基準で誤った側にある**価格系列上の**構造（`(系列, type, 構成点 idx)` で畳んだもの）:

| ネックライン | 構造 | うち `data.patterns` に到達していたもの | 内訳 |
|---|---:|---:|---|
| `scalar` | 57 | **10** | `triple_top` 2 (2) / `triple_bottom` 1 (1) / `double_bottom` 1 (1) / `head_and_shoulders` 8 (1) / `inverse_head_and_shoulders` 45 (5) |
| `line` | 57 | **15** | `triple_top` 2 (2) / `triple_bottom` 1 (1) / `double_bottom` 1 (1) / `head_and_shoulders` 23 (7) / `inverse_head_and_shoulders` 30 (4) |
| `clamped` | 29 | **8** | `triple_top` 2 (2) / `triple_bottom` 1 (1) / `double_bottom` 1 (1) / `head_and_shoulders` 12 (3) / `inverse_head_and_shoulders` 13 (1) |

`extremePrice` 基準では `scalar` 37 構造（到達 5）/ `line` 13 構造（到達 2）/
`clamped` 1 構造（到達 0）で、**すべて `inverse_head_and_shoulders` と
`head_and_shoulders`**（double / triple は 0）。

**全件の明細は[付録](#付録-誤った側にある構造の全件明細)に置いた**（99 行 = 構造 × 誤側の点）。
`tf`・`swingDepth` を跨いでネックライン水準と逸脱量が揺れる構造は **0 件**だったので、
明細は構造ごとに 1 行で足りる。

**件数は成果ではない**ので、`data.patterns` に到達していた 10 構造
（`price` × `scalar`）を形として読むと:

| # | 系列 | type | 構成点 idx | 誤側の点 | 逸脱 | 高さ比 | 読み |
|---|---|---|---|---|---:|---:|---|
| 99 | realB `1hour` | `triple_top` | 219,223,232 | 山3 | 3,274 円 | 3.0% | **3 山目がネックラインを終値で割った状態で「ブレイク前の triple」になっている。** 高安（12,288,043）ではネックライン上 |
| 98 | realB `1hour` | `triple_top` | 204,219,236 | 山3 | 8,536 円 | 5.8% | 同上。高安（12,303,887）ではネックライン上 |
| 97 | realB `1hour` | `triple_bottom` | 205,214,220 | 谷3 | 2,147 円 | 6.3% | 3 谷目が終値でネックラインを上抜けている。高安（12,238,000）ではネックライン下 |
| 7 | realB `1hour` | `double_bottom` | 285,287,288 | 谷2 | 20,213 円 | 310.8% | **3 本連続に近い構成点で組まれた退化したダブル**（高さ 6,503 円）。谷2 の終値がネックラインより上 |
| 3 | realA `1day` | `head_and_shoulders` | 47,49,53,56,59 | 右肩 | 5,178 円 | 1.3% | 右肩がスカラー水準の下。線基準では 129,452 円下で、こちらのほうが大きい |
| 36 / 37 | realB `1hour` | `inverse_head_and_shoulders` | 3,9,42,118,134 / …,137 | 右肩 | 22,112 / 20,684 円 | 9.2 / 8.6% | [1-4 章](#1-4-hs-はどのネックラインを指すかで結果が反転する)の実例。**線基準では正しい側** |
| 64 / 68 / 69 | realB `1hour` | `inverse_head_and_shoulders` | 61,92,100,118,137 ほか | 右肩 | 71,232〜72,660 円 | 54.7〜55.8% | 右肩がネックラインを大きく上回る。`1min` / `5min` / `15min` ラベルのみ |

**`triple` の 3 件と `double` の 1 件は「パターンとして成立していない」と読める形**
（3 山目 / 3 谷目 / 第2構成点がネックラインの反対側にあり、その時点で
「ブレイク待ち」という状態が定義できない）。
**H&S 系の 6 件は読みが割れる**——スカラー基準では壊れているが、
ブレイク判定に使われている線の基準では 2 件が正しい側に収まる。

## 5. 補足

### 5-1. 形成中経路（issue の列挙対象外）

`detect_doubles.ts:932/1147`、`detect_triples.ts:1221/1444`、`detect_hs.ts:1750/2037` は
issue が挙げた 9 経路に入っていないが、同じ構造ゲートを通り同じ穴を持つので参考値を出す。
940 ケースで生の行数 **148**（`double_bottom` 24 / `triple_top` 28 / `triple_bottom` 24 /
`head_and_shoulders` 44 / `inverse_head_and_shoulders` 28）、構造単位 22。

| 基準 | 誤側 行 / 148 | 誤側 構造 / 22 |
|---|---:|---:|
| `price` × `scalar` | 0 | 0 |
| `price` × `line` | 32 | 4 |
| `price` × `clamped` | 0 | 0 |
| `extreme` × `scalar` | 0 | 0 |
| `extreme` × `line` | 32 | 4 |
| `extreme` × `clamped` | 0 | 0 |

形成中パスの未検査の主構成点は**形成中 double では存在しない**（`pivots` が
`first` / `mid` の 2 点だけ）、形成中 triple は第2構成点、形成中 H&S は頭と暫定右肩。
`line` の 32 行 / 4 構造はすべて形成中 H&S で、**傾きつきネックラインの外挿**によるもの
（`clamped` では 0 件になる）。`no_prior_extreme` の素通しは 24 行、
`insufficient_history` は 0 行。

### 5-2. `buildStructureGate` は 2 箇所にある

- `tools/patterns/reversal-gate.ts` の export 版（`detect_triples.ts` / `detect_hs.ts` が使用）
- `tools/patterns/detect_doubles.ts` のファイル内 private 版（同ファイルの 6 経路 = 完成済み 4 + 形成中 2 が使用）

**本文は完全に同一**（`retracementRatio` / `priorExtreme*` / `necklineCrossIdx` を写し、
キーが 1 つも立たなければ `undefined` を返す）。#131 が doubles に入れたものを
#138 が triple / H&S へ横展開したときに、doubles 側の実装が残ったもの。
判定に差は無いので現状の出力は正しいが、**Phase 2 で `skipped` を出力に載せる場合は
2 箇所に同じ変更が要る**（片方だけ直すと double だけ申告が欠ける）。

### 5-3. 計測の限界

- **標準コーパスの「時間足」はリサンプリングではなくパラメータのラベル。**
  `tf` が変えるのは `swingDepth` / `minBarsBetweenSwings` / `tolerancePct` /
  `headProminencePct` / `sizeThresholds` だけで、足は再集計されない（#205 の同名の注記）。
  本文の結論は[ネイティブサブセット](#1-6-ネイティブ時間足サブセット解釈の錨)で確認したものに限り、
  プール値は補助として読むこと。
- **`double` / `triple` の該当は価格系列上 4 構造しか無い**（すべて実データ B）。
  「明確に分離している」という 2-4 章の観察はこの 4 構造に基づく。
- **`clamped` 列は #211 が入った場合の予測値であって、#211 の実装結果ではない。**
  #211 が別の畳み方（例: 外挿を許すが距離で減点する）を採れば数値は変わる。

## Phase 2 への申し送り（本 Phase では決定しない）

Phase 1 の実測から、Phase 2 が**先に決めないと件数の意味が定まらない**論点は 3 つ:

1. **ネックラインをどう評価するか（スカラー / 線 / クランプ付きの線）。**
   H&S では 3 者が同じ構造に別の答えを出し、`head_and_shoulders` と
   `inverse_head_and_shoulders` で大小が逆転する（[1-4 章](#1-4-hs-はどのネックラインを指すかで結果が反転する)）。
   **これは #211 が触る関数そのもの**なので、順序を決める必要がある。
2. **価格基準（終値 / 高安）。** `extremePrice` を採ると `double` / `triple` の該当が
   0 件になり、対策の対象が H&S 系だけになる（[4-2 章](#4-2-type-別の増減)）。
   リポジトリの慣行（同水準判定は終値、値幅は高安）は
   「ネックラインは線であって値幅ではない」→ 終値、と読めるが、
   `validateReversalStructure` 自身は `extremePrice` で戻り率を測っているので自明ではない。
3. **許容幅を置くか。** `double` / `triple` は 2.96% 未満が空なのでゼロ許容で足りるが、
   H&S 系は現行のスカラー基準だと 0.012% から連続していて、
   **ゼロ許容だと「任意の位置で連続分布を切るつまみ」になる**（#214 が
   H&S / double に `MIN_CONFIDENCE` を新設しなかったのと同じ理由が当てはまる）。
   クランプ付きの線なら 5.09% 未満が空になり、この問題は消える。

また、本 Phase の副産物として:

- **`skipped` の出力伝播**（[3-4 章](#3-4-出力に届いていないもの)）は gate の設計と独立に直せる。
  実際に効いているのは `no_prior_extreme` のほうで、こちらは
  **`structureGate` フィールドごと消えている。**
- **`buildStructureGate` の重複**（[5-2 章](#5-2-buildstructuregate-は-2-箇所にある)）は
  上の変更をするなら先に片付けたほうがよい。

## 付録: 誤った側にある構造の全件明細

`price` 基準で `scalar` / `line` / `clamped` のいずれかが誤った側になる**価格系列上の**
構造 × 誤側の点の全件（99 行）。`—` はその基準では正しい側にあることを示す。
`extreme×scalar` 列は同じ点を `extremePrice` × スカラー水準で測った逸脱量。
`高さ比(scalar)` は `heightProj` 基準。`出現 tf` はその構造を拾った時間足ラベルで、
`realB` の `1hour` と `realA` の `1day` だけがネイティブ（それ以外はパラメータのラベル）。

| # | 系列 | type | 構成点 idx | 誤側の点 | NL(scalar) | scalar 差分 | line 差分 | clamped 差分 | extreme×scalar | 高さ比(scalar) | 出現 tf | status | conf | data.patterns |
|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| 1 | realA_1day | `head_and_shoulders` | 38,45,53,56,59 | right_shoulder | 10,322,274 | — | 181,707 | 72,095 | — | — | 4hour,1hour | completed | 0.71/0.75 | — |
| 2 | realA_1day | `head_and_shoulders` | 42,45,53,56,59 | right_shoulder | 10,322,274 | — | 181,707 | 72,095 | — | — | 4hour,1hour | completed | 0.74/0.77 | 出た |
| 3 | realA_1day | `head_and_shoulders` | 47,49,53,56,59 | right_shoulder | 10,456,313 | 5,178 | 129,452 | 72,095 | — | 1.3% | 1hour | completed | 0.79 | 出た |
| 4 | realA_1day | `head_and_shoulders` | 47,49,53,66,73 | right_shoulder | 10,196,178 | 4,854 | — | — | — | 0.9% | 1hour | near_completion | 0.7 | — |
| 5 | realA_1day | `inverse_head_and_shoulders` | 20,24,27,47,52 | right_shoulder | 10,424,613 | 160,342 | 46,684 | 81,126 | — | 23.2% | 4hour,1hour | completed | 0.65/0.68 | — |
| 6 | realA_1day | `inverse_head_and_shoulders` | 56,59,66,70,80 | right_shoulder | 10,349,575 | — | 214,919 | 30,264 | — | — | 4hour,1hour | completed | 0.84/0.89 | 出た |
| 7 | realB_1hour | `double_bottom` | 285,287,288 | valley2 | 12,536,893 | 20,213 | 20,213 | 20,213 | — | 310.8% | 1min,5min | completed | 0.74 | 出た |
| 8 | realB_1hour | `head_and_shoulders` | 45,100,118,122,124 | right_shoulder | 10,124,976 | — | 1,698 | — | — | — | 1min | completed | 0.59 | — |
| 9 | realB_1hour | `head_and_shoulders` | 45,100,147,154,157 | right_shoulder | 10,128,421 | — | 6,594 | — | — | — | 1min,5min,15min | near_completion | 0.54/0.6/0.64 | — |
| 10 | realB_1hour | `head_and_shoulders` | 204,249,294,313,322 | right_shoulder | 12,298,435 | — | 17,074 | — | — | — | 4hour,1hour,1min,5min,15min,30min | completed | 0.52/0.58/0.61/0.62/0.63/0.64/0.67/0.69/0.71/0.72/0.74/0.75/0.76/0.77/0.78/0.8 | 出た |
| 11 | realB_1hour | `head_and_shoulders` | 204,249,294,325,330 | right_shoulder | 12,277,575 | — | 98,372 | 71,817 | — | — | 4hour,1hour,1min,5min,15min,30min | near_completion | 0.75/0.83/0.86/0.88/0.89/0.9 | — |
| 12 | realB_1hour | `head_and_shoulders` | 211,249,283,285,287 | right_shoulder | 12,302,721 | — | 18,011 | — | — | — | 1min,5min | completed | 0.66/0.72 | 出た |
| 13 | realB_1hour | `head_and_shoulders` | 211,249,294,313,322 | right_shoulder | 12,298,435 | — | 17,074 | — | — | — | 4hour,1hour,1min,5min,15min,30min | completed | 0.61/0.67/0.69/0.71/0.72/0.73 | — |
| 14 | realB_1hour | `head_and_shoulders` | 211,249,294,325,330 | right_shoulder | 12,277,575 | — | 98,372 | 71,817 | — | — | 4hour,1hour,1min,5min,15min,30min | near_completion | 0.7/0.75/0.77/0.78/0.79/0.8 | — |
| 15 | realB_1hour | `head_and_shoulders` | 219,220,223,230,232 | right_shoulder | 12,285,549 | 3,274 | — | — | — | 2.2% | 1min | near_completion | 0.51 | — |
| 16 | realB_1hour | `head_and_shoulders` | 219,220,223,230,236 | right_shoulder | 12,285,549 | 10,445 | — | — | — | 7.1% | 1min | near_completion | 0.48 | — |
| 17 | realB_1hour | `head_and_shoulders` | 219,220,223,230,245 | right_shoulder | 12,285,549 | 28,892 | — | — | 5,549 | 19.6% | 1min | near_completion | 0.45 | — |
| 18 | realB_1hour | `head_and_shoulders` | 219,249,294,313,322 | right_shoulder | 12,298,435 | — | 17,074 | — | — | — | 4hour,1hour,1min,5min,15min,30min | completed | 0.67/0.73/0.75/0.77/0.78/0.79 | — |
| 19 | realB_1hour | `head_and_shoulders` | 257,272,283,285,287 | right_shoulder | 12,371,392 | — | 41,499 | — | — | — | 1min,5min | completed | 0.7/0.76 | — |
| 20 | realB_1hour | `head_and_shoulders` | 257,272,294,313,322 | right_shoulder | 12,367,106 | — | 22,058 | — | — | — | 4hour,1hour,1min,5min,15min,30min | completed | 0.71/0.77/0.79/0.81/0.82/0.83 | 出た |
| 21 | realB_1hour | `head_and_shoulders` | 257,272,294,325,330 | right_shoulder | 12,346,246 | — | 96,939 | 71,817 | — | — | 4hour,1hour,1min,5min,15min,30min | near_completion | 0.85/0.89/0.91/0.92/0.93/0.94 | — |
| 22 | realB_1hour | `head_and_shoulders` | 265,272,294,313,322 | right_shoulder | 12,367,106 | — | 22,058 | — | — | — | 4hour,1hour,1min,5min,15min,30min | completed | 0.79/0.85/0.87/0.89/0.9/0.91 | 出た |
| 23 | realB_1hour | `head_and_shoulders` | 275,276,283,285,287 | right_shoulder | 12,401,067 | — | 49,957 | — | — | — | 1min,5min | completed | 0.76/0.83 | — |
| 24 | realB_1hour | `head_and_shoulders` | 275,276,294,313,322 | right_shoulder | 12,396,781 | — | 14,932 | — | — | — | 1min,5min | completed | 0.8/0.81 | — |
| 25 | realB_1hour | `head_and_shoulders` | 275,276,294,325,330 | right_shoulder | 12,375,921 | — | 92,934 | 71,817 | — | — | 1min,5min | near_completion | 0.83/0.84 | — |
| 26 | realB_1hour | `head_and_shoulders` | 283,285,294,325,330 | right_shoulder | 12,504,541 | 96,963 | 65,531 | 71,817 | — | 29.2% | 1hour,1min,5min,15min,30min | near_completion | 0.74/0.77/0.78/0.8/0.81 | — |
| 27 | realB_1hour | `head_and_shoulders` | 287,288,294,325,330 | right_shoulder | 12,518,251 | 110,673 | 61,316 | 71,817 | — | 36.1% | 1min,5min | near_completion | 0.62/0.63 | — |
| 28 | realB_1hour | `head_and_shoulders` | 314,316,318,321,322 | right_shoulder | 12,553,890 | — | 20,667 | 11,111 | — | — | 1min | completed | 0.84 | 出た |
| 29 | realB_1hour | `head_and_shoulders` | 314,316,318,325,330 | right_shoulder | 12,504,698 | 97,120 | 43,703 | 71,817 | — | 147.9% | 1min | near_completion | 0.63 | — |
| 30 | realB_1hour | `head_and_shoulders` | 334,336,339,341,344 | right_shoulder | 12,535,010 | — | 44,223 | 3,635 | — | — | 1min | near_completion | 0.76 | — |
| 31 | realB_1hour | `inverse_head_and_shoulders` | 3,9,42,54,64 | right_shoulder | 10,117,184 | — | 11,221 | — | — | — | 1min,5min,15min,30min | near_completion | 0.67/0.73/0.79/0.83 | — |
| 32 | realB_1hour | `inverse_head_and_shoulders` | 3,9,42,54,77 | right_shoulder | 10,117,184 | — | 44,214 | — | — | — | 1min,5min,15min,30min | completed | 0.83/0.88/0.92/0.96 | 出た |
| 33 | realB_1hour | `inverse_head_and_shoulders` | 3,9,42,54,86 | right_shoulder | 10,117,184 | — | 52,253 | — | — | — | 1min,5min,15min,30min | completed | 0.8/0.85/0.91/0.95 | — |
| 34 | realB_1hour | `inverse_head_and_shoulders` | 3,9,42,106,113 | right_shoulder | 10,144,521 | — | 30,050 | 25,938 | — | — | 1min,5min,15min,30min | completed | 0.8/0.83/0.85/0.87 | — |
| 35 | realB_1hour | `inverse_head_and_shoulders` | 3,9,42,118,122 | right_shoulder | 10,225,645 | 19,020 | — | — | 17,593 | 7.9% | 1hour,1min,5min,15min,30min | near_completion | 0.69/0.74/0.77/0.8/0.82 | — |
| 36 | realB_1hour | `inverse_head_and_shoulders` | 3,9,42,118,134 | right_shoulder | 10,225,645 | 22,112 | — | — | 11,546 | 9.2% | 1hour,1min,5min,15min,30min | completed | 0.8/0.84/0.86/0.89/0.91 | 出た |
| 37 | realB_1hour | `inverse_head_and_shoulders` | 3,9,42,118,137 | right_shoulder | 10,225,645 | 20,684 | — | — | 1,164 | 8.6% | 1hour,1min,5min,15min,30min | completed | 0.8/0.84/0.86/0.89/0.91 | 出た |
| 38 | realB_1hour | `inverse_head_and_shoulders` | 3,9,42,147,154 | right_shoulder | 10,251,525 | 31 | — | — | — | 0.0% | 1hour,1min,5min,15min,30min | completed | 0.78/0.82/0.85/0.87/0.89 | — |
| 39 | realB_1hour | `inverse_head_and_shoulders` | 15,18,42,54,64 | right_shoulder | 10,113,518 | — | 15,387 | — | — | — | 1min,5min,15min,30min | near_completion | 0.6/0.64/0.69/0.72 | — |
| 40 | realB_1hour | `inverse_head_and_shoulders` | 15,18,42,54,77 | right_shoulder | 10,113,518 | — | 53,798 | — | — | — | 1min,5min,15min,30min | completed | 0.67/0.71/0.75/0.78 | — |
| 41 | realB_1hour | `inverse_head_and_shoulders` | 15,18,42,54,86 | right_shoulder | 10,113,518 | — | 65,586 | — | — | — | 1min,5min,15min,30min | completed | 0.62/0.66/0.71/0.74 | — |
| 42 | realB_1hour | `inverse_head_and_shoulders` | 15,18,42,106,113 | right_shoulder | 10,140,856 | 1,113 | 29,888 | 25,938 | — | 0.6% | 1min,5min,15min,30min | completed | 0.64/0.66/0.68/0.7 | — |
| 43 | realB_1hour | `inverse_head_and_shoulders` | 20,26,42,45,47 | right_shoulder | 10,088,488 | — | 659 | — | — | — | 1min,5min,15min,30min | completed | 0.62/0.66/0.71/0.74 | — |
| 44 | realB_1hour | `inverse_head_and_shoulders` | 20,26,42,54,64 | right_shoulder | 10,096,678 | — | 11,639 | — | — | — | 1min,5min,15min,30min | near_completion | 0.72/0.76/0.81/0.84 | — |
| 45 | realB_1hour | `inverse_head_and_shoulders` | 20,26,42,54,77 | right_shoulder | 10,096,678 | — | 45,176 | — | — | — | 1min,5min,15min,30min | completed | 0.71/0.74/0.75/0.78/0.79/0.81/0.82/0.84 | 出た |
| 46 | realB_1hour | `inverse_head_and_shoulders` | 20,26,42,54,86 | right_shoulder | 10,096,678 | — | 53,590 | — | — | — | 1min,5min,15min,30min | completed | 0.66/0.69/0.71/0.73/0.75/0.78/0.79/0.81 | — |
| 47 | realB_1hour | `inverse_head_and_shoulders` | 20,26,42,92,109 | right_shoulder | 10,101,958 | — | 23,221 | 7,744 | — | — | 1min,5min,15min,30min | completed | 0.71/0.74/0.77/0.79 | — |
| 48 | realB_1hour | `inverse_head_and_shoulders` | 20,26,42,106,113 | right_shoulder | 10,124,016 | 17,953 | 27,335 | 25,938 | — | 11.0% | 1min,5min,15min,30min | completed | 0.68/0.71/0.74/0.76 | — |
| 49 | realB_1hour | `inverse_head_and_shoulders` | 28,30,42,45,47 | right_shoulder | 10,084,456 | — | 2,026 | — | — | — | 1min,5min,15min,30min | completed | 0.65/0.69/0.73/0.77 | — |
| 50 | realB_1hour | `inverse_head_and_shoulders` | 28,30,42,45,50 | right_shoulder | 10,084,456 | — | 1,005 | — | — | — | 1min,5min,15min | completed | 0.7/0.75/0.8 | 出た |
| 51 | realB_1hour | `inverse_head_and_shoulders` | 28,30,42,54,64 | right_shoulder | 10,092,646 | — | 12,484 | — | — | — | 1min,5min,15min,30min | near_completion | 0.64/0.69/0.73/0.77 | — |
| 52 | realB_1hour | `inverse_head_and_shoulders` | 28,30,42,54,77 | right_shoulder | 10,092,646 | — | 47,119 | — | — | — | 1min,5min,15min,30min | completed | 0.68/0.71/0.75/0.78 | — |
| 53 | realB_1hour | `inverse_head_and_shoulders` | 28,30,42,54,86 | right_shoulder | 10,092,646 | — | 56,295 | — | — | — | 1min,5min,15min,30min | completed | 0.63/0.68/0.73/0.76 | — |
| 54 | realB_1hour | `inverse_head_and_shoulders` | 28,30,42,106,113 | right_shoulder | 10,119,984 | 21,985 | 26,666 | 25,938 | — | 14.0% | 1min,5min,15min,30min | completed | 0.7/0.72/0.74/0.76 | — |
| 55 | realB_1hour | `inverse_head_and_shoulders` | 57,92,100,106,113 | right_shoulder | 10,093,973 | 47,996 | 3,881 | 25,938 | 18,028 | 52.3% | 1min,5min | near_completion | 0.53/0.6 | — |
| 56 | realB_1hour | `inverse_head_and_shoulders` | 57,92,100,118,122 | right_shoulder | 10,175,096 | 69,568 | — | — | 68,141 | 53.5% | 1min,5min | near_completion | 0.58/0.65 | — |
| 57 | realB_1hour | `inverse_head_and_shoulders` | 57,92,100,118,126 | right_shoulder | 10,175,096 | 40,409 | — | — | 40,409 | 31.1% | 1min,5min | near_completion | 0.6/0.67 | — |
| 58 | realB_1hour | `inverse_head_and_shoulders` | 57,92,100,118,134 | right_shoulder | 10,175,096 | 72,660 | — | — | 62,094 | 55.8% | 1min,5min | completed | 0.72/0.77 | — |
| 59 | realB_1hour | `inverse_head_and_shoulders` | 57,92,100,118,137 | right_shoulder | 10,175,096 | 71,232 | — | — | 51,712 | 54.7% | 1min,5min | completed | 0.73/0.79 | — |
| 60 | realB_1hour | `inverse_head_and_shoulders` | 61,92,100,106,113 | right_shoulder | 10,093,973 | 47,996 | 3,881 | 25,938 | 18,028 | 52.3% | 1min,5min | near_completion | 0.5/0.59 | — |
| 61 | realB_1hour | `inverse_head_and_shoulders` | 61,92,100,118,122 | right_shoulder | 10,175,096 | 69,568 | — | — | 68,141 | 53.5% | 1min,5min | near_completion | 0.54/0.64 | — |
| 62 | realB_1hour | `inverse_head_and_shoulders` | 61,92,100,118,126 | right_shoulder | 10,175,096 | 40,409 | — | — | 40,409 | 31.1% | 1min,5min | near_completion | 0.57/0.66 | — |
| 63 | realB_1hour | `inverse_head_and_shoulders` | 61,92,100,118,134 | right_shoulder | 10,175,096 | 72,660 | — | — | 62,094 | 55.8% | 1min,5min | completed | 0.69/0.77 | — |
| 64 | realB_1hour | `inverse_head_and_shoulders` | 61,92,100,118,137 | right_shoulder | 10,175,096 | 71,232 | — | — | 51,712 | 54.7% | 1min,5min | completed | 0.71/0.78 | 出た |
| 65 | realB_1hour | `inverse_head_and_shoulders` | 64,92,100,106,113 | right_shoulder | 10,093,973 | 47,996 | 3,881 | 25,938 | 18,028 | 52.3% | 1min,5min,15min | near_completion | 0.47/0.56/0.63 | — |
| 66 | realB_1hour | `inverse_head_and_shoulders` | 64,92,100,118,122 | right_shoulder | 10,175,096 | 69,568 | — | — | 68,141 | 53.5% | 1min,5min,15min | near_completion | 0.52/0.61/0.68 | — |
| 67 | realB_1hour | `inverse_head_and_shoulders` | 64,92,100,118,126 | right_shoulder | 10,175,096 | 40,409 | — | — | 40,409 | 31.1% | 1min,5min,15min | near_completion | 0.55/0.64/0.71 | — |
| 68 | realB_1hour | `inverse_head_and_shoulders` | 64,92,100,118,134 | right_shoulder | 10,175,096 | 72,660 | — | — | 62,094 | 55.8% | 1min,5min,15min | completed | 0.68/0.76/0.81 | 出た |
| 69 | realB_1hour | `inverse_head_and_shoulders` | 64,92,100,118,137 | right_shoulder | 10,175,096 | 71,232 | — | — | 51,712 | 54.7% | 1min,5min,15min | completed | 0.69/0.76/0.82 | 出た |
| 70 | realB_1hour | `inverse_head_and_shoulders` | 122,124,126,129,134 | right_shoulder | 10,259,541 | — | 3,776 | — | — | — | 1min,5min | completed | 0.7/0.78 | — |
| 71 | realB_1hour | `inverse_head_and_shoulders` | 230,232,249,283,285 | right_shoulder | 12,432,142 | 97,544 | — | — | 59,518 | 31.8% | 1hour,1min,5min,15min,30min | completed | 0.66/0.7/0.73/0.76/0.78 | — |
| 72 | realB_1hour | `inverse_head_and_shoulders` | 230,239,249,283,285 | right_shoulder | 12,439,600 | 90,087 | — | — | 52,061 | 31.5% | 1hour,1min,5min,15min,30min | completed | 0.69/0.73/0.75/0.78/0.8 | — |
| 73 | realB_1hour | `inverse_head_and_shoulders` | 230,239,249,283,288 | right_shoulder | 12,439,600 | 117,507 | — | — | 66,234 | 41.1% | 1hour,1min,5min,15min,30min | completed | 0.68/0.72/0.74/0.77/0.79 | — |
| 74 | realB_1hour | `inverse_head_and_shoulders` | 230,239,249,283,291 | right_shoulder | 12,439,600 | 117,832 | — | — | 79,995 | 41.2% | 1hour,1min,5min,15min,30min | completed | 0.67/0.71/0.74/0.77/0.79 | — |
| 75 | realB_1hour | `inverse_head_and_shoulders` | 230,232,249,294,341 | right_shoulder | 12,566,638 | 2,196 | — | — | — | 0.6% | 1hour,1min,5min,15min,30min | near_completion | 0.58/0.63/0.66/0.69/0.72 | — |
| 76 | realB_1hour | `inverse_head_and_shoulders` | 230,232,249,294,353 | right_shoulder | 12,566,638 | 108,510 | — | — | 18,444 | 29.9% | 1hour,1min,5min,15min,30min | near_completion | 0.62/0.66/0.7/0.73/0.75 | — |
| 77 | realB_1hour | `inverse_head_and_shoulders` | 230,232,249,294,358 | right_shoulder | 12,566,638 | 200,274 | — | — | 156,269 | 55.3% | 1hour,15min,30min | near_completion | 0.61/0.66/0.69 | — |
| 78 | realB_1hour | `inverse_head_and_shoulders` | 242,245,249,283,285 | right_shoulder | 12,419,333 | 110,353 | — | — | 72,327 | 51.3% | 1hour,1min,5min,15min,30min | near_completion | 0.51/0.53/0.56/0.58/0.59/0.61/0.62/0.64/0.65/0.66 | — |
| 79 | realB_1hour | `inverse_head_and_shoulders` | 242,245,249,283,288 | right_shoulder | 12,419,333 | 137,773 | — | — | 86,500 | 64.0% | 1hour,1min,5min,15min,30min | near_completion | 0.51/0.55/0.59/0.62/0.64 | — |
| 80 | realB_1hour | `inverse_head_and_shoulders` | 242,245,249,283,291 | right_shoulder | 12,419,333 | 138,098 | — | — | 100,261 | 64.2% | 1hour,1min,5min,15min,30min | near_completion | 0.5/0.55/0.58/0.61/0.64 | — |
| 81 | realB_1hour | `inverse_head_and_shoulders` | 242,245,249,294,301 | right_shoulder | 12,553,829 | 67,846 | — | — | 30,634 | 29.6% | 1hour,1min,5min,15min,30min | near_completion | 0.5/0.54/0.58/0.61/0.63 | — |
| 82 | realB_1hour | `inverse_head_and_shoulders` | 242,245,249,294,321 | right_shoulder | 12,553,829 | 23,952 | — | — | — | 10.4% | 1hour,1min,5min,15min,30min | near_completion | 0.49/0.54/0.57/0.6/0.62 | — |
| 83 | realB_1hour | `inverse_head_and_shoulders` | 242,245,249,294,341 | right_shoulder | 12,553,829 | 15,005 | — | — | — | 6.5% | 1hour,1min,5min,15min,30min | near_completion | 0.48/0.5/0.53/0.55/0.56/0.58/0.59/0.61/0.62/0.64 | — |
| 84 | realB_1hour | `inverse_head_and_shoulders` | 242,245,249,294,353 | right_shoulder | 12,553,829 | 121,319 | — | — | 31,253 | 52.9% | 1hour,1min,5min,15min,30min | near_completion | 0.48/0.5/0.53/0.55/0.56/0.58/0.59/0.61/0.62/0.63 | — |
| 85 | realB_1hour | `inverse_head_and_shoulders` | 242,245,249,294,358 | right_shoulder | 12,553,829 | 213,083 | — | — | 169,078 | 92.9% | 1hour,15min,30min | near_completion | 0.48/0.5/0.53/0.54/0.56/0.58 | — |
| 86 | realB_1hour | `inverse_head_and_shoulders` | 301,308,313,318,321 | right_shoulder | 12,601,128 | — | 3,354 | — | — | — | 1min,5min,15min | completed | 0.66/0.73/0.78 | — |
| 87 | realB_1hour | `inverse_head_and_shoulders` | 301,308,331,355,358 | right_shoulder | 12,708,423 | 58,489 | — | — | 14,484 | 22.8% | 1hour,1min,5min,15min,30min | near_completion | 0.68/0.72/0.75/0.78/0.8 | — |
| 88 | realB_1hour | `inverse_head_and_shoulders` | 305,308,331,355,358 | right_shoulder | 12,708,423 | 58,489 | — | — | 14,484 | 22.8% | 1min,5min,15min,30min | near_completion | 0.77/0.82/0.88/0.92 | — |
| 89 | realB_1hour | `inverse_head_and_shoulders` | 313,318,331,349,353 | right_shoulder | 12,669,111 | 6,037 | — | — | — | 2.9% | 1min,5min,15min | near_completion | 0.72/0.78/0.83 | — |
| 90 | realB_1hour | `inverse_head_and_shoulders` | 313,318,331,355,358 | right_shoulder | 12,691,734 | 75,178 | — | — | 31,173 | 35.8% | 1min,5min,15min | near_completion | 0.68/0.75/0.8 | — |
| 91 | realB_1hour | `inverse_head_and_shoulders` | 325,330,331,339,341 | head | 12,497,660 | — | 22,385 | 22,385 | — | — | 1min | near_completion | 0.79 | — |
| 92 | realB_1hour | `inverse_head_and_shoulders` | 325,330,331,339,341 | right_shoulder | 12,497,660 | 71,174 | — | — | 23,600 | 318.0% | 1min | near_completion | 0.79 | — |
| 93 | realB_1hour | `inverse_head_and_shoulders` | 325,330,331,349,353 | head | 12,580,680 | — | 24,182 | 24,182 | — | — | 1min | near_completion | 0.71 | — |
| 94 | realB_1hour | `inverse_head_and_shoulders` | 325,330,331,349,353 | right_shoulder | 12,580,680 | 94,467 | — | — | 4,401 | 390.7% | 1min | near_completion | 0.71 | — |
| 95 | realB_1hour | `inverse_head_and_shoulders` | 325,330,331,355,358 | head | 12,603,303 | — | 26,745 | 26,745 | — | — | 1min | near_completion | 0.7 | — |
| 96 | realB_1hour | `inverse_head_and_shoulders` | 325,330,331,355,358 | right_shoulder | 12,603,303 | 163,608 | — | — | 119,603 | 611.7% | 1min | near_completion | 0.7 | — |
| 97 | realB_1hour | `triple_bottom` | 205,214,220 | valley3 | 12,352,952 | 2,147 | 2,147 | 2,147 | — | 6.3% | 4hour,1hour | near_completion | 0.67 | 出た |
| 98 | realB_1hour | `triple_top` | 204,219,236 | peak3 | 12,283,640 | 8,536 | 8,536 | 8,536 | — | 5.8% | 4hour,1hour,1min,5min,15min,30min | completed | 0.86/0.88/0.89 | 出た |
| 99 | realB_1hour | `triple_top` | 219,223,232 | peak3 | 12,285,549 | 3,274 | 3,274 | 3,274 | — | 3.0% | 4hour,1hour,1min,5min,15min,30min | completed | 0.69/0.7/0.71 | 出た |
