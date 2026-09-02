# `targetReachedPct` の異常値（issue #210・Phase 1 計測ログと Phase 2 前後比較）

[issue #210](https://github.com/tjackiet/bitbank-lab-mcp/issues/210) の 3 つの部分問題
——(1) 到達側だけ上限が無い / (2) 分母が潰れる / (3) 走査の時間窓が無制限——を
標準コーパスで計測し、3 つとも実装した記録。

**`breakoutTarget` の算出式は 1 行も触っていない**（#211 の対象）。変わるのは
`computeTargetReach` の出力（= target **進捗**系フィールド）だけ。

## 結論（断定）

1. **分母が潰れるのは H&S / doubles だけ。** `targetDistance / patternHeight` は
   triangles / wedges / pennants / flags で **0.9844〜1.0103**（`Math.round(breakoutTarget)` の
   丸めぶんしか動かない）。`breakoutTarget = ブレイク価格 ± patternHeight` という式の帰結で、
   構造上潰れない。H&S / doubles だけがネックラインから投影するので、ブレイク足が
   ネックラインから値幅ぶん走ると分母だけが潰れ、**比が 0.0033 まで落ちる**
   （[計測 2](#計測-2-targetdistance--patternheight)）。
   **issue 本文の「H&S 固有ではない」は症状（大きな数値）としては正しいが、原因は 2 系統に分かれる。**
2. **`falling_wedge` の 5,102% / `triangle_ascending` の 1,719% は分母の退化ではない。**
   比はどちらもちょうど 1.0——**本当に高さの 51 倍 / 17 倍動いた**という値。ただし
   「動いた」の測り方が壊れていて、**系列全体の最高値に張り付いていた**（結論 3）。
3. **`limit` では値は動かない。動かすのは系列の末尾（＝いつ問い合わせたか）。**
   issue 起票時の補足は「`limit` を変えると `targetReachedPct` が変わる」としていたが、
   実測では**先頭切り詰め（＝ `limit` そのもの）は総当たり 7 通りで差分 0**。
   `limit` は「直近 N 本」なので先頭を切るが、走査はブレイク足より**後ろ**しか見ないため
   共通するパターンの pct は元々動かない。動くのは**末尾**を切ったとき、つまり
   「同じクエリを過去に叩いた」ときで、実データ B の 4 構造が
   209,921% → 240,033% / 4,473% → 5,102% のように動いた
   （[計測 3](#計測-3-窓依存の実測)）。**欠陥のクラスは #154 と同じ**（同じ構造なのに窓次第で答えが変わる）
   だが、**軸は窓の大きさではなく観測時点**。
4. **走査窓 60 本で `targetReached` はほとんど動かない。** 到達済み 2,576 行の初到達までのバー数は
   p50 = 12 / p95 = 52 / p99 = 72 で、**60 本以内が 96.3%**。構造単位では 75 → 72 件（−3）。
5. **上の 2 つを入れた後、上限 999 に当たるのは構造単位 1 件だけ。** (1) は本質ではなく安全網、
   という issue の見立てが実測でも裏づいた。

## 計測条件

| 項目 | 値 |
|---|---|
| 計測日 | 2026-09-02 |
| 対象コミット | `266de65`（#209 マージ後の `main`）と、その上に本変更を載せたもの |
| 対象 | `detect_patterns()` をツール境界で呼ぶ（6 検出器ファミリ 12 箇所の `computeTargetReach` をすべて通す）。`analyze_indicators` はモックして fixture の candles をそのまま返す |
| コーパス | **標準コーパス 800**（合成 704 = `tests/detect_patterns_fixtures.test.ts` の fixture 22 件 × オプション 8 通り（`includeForming` / `includeCompleted` / `includeInvalid`）× 時間足 2 種（`1day` / `1hour`）× `swingDepth` 2 種（2 / 3）、実データ A 96 = `tests/fixtures/btc_jpy_1day_2026.ts` × 時間足 3 種 × `swingDepth` 4 種 × オプション 8 通り）**＋ 実データ B 96**（`tests/fixtures/btc_jpy_1hour_2026_08.ts` × 同上）= **896 ケース**。#204 / #208 と同じ組み方 |
| 生の行数 | `computeTargetReach` の呼び出し **5,000 行** / `data.patterns` に出た **1,456 行** |
| 構造単位 | 系列 × type × `breakoutIdx` × `target` で重複排除して **152 件** |

`computeTargetReach` を呼ぶのは 12 箇所（doubles 4 / H&S 4 / wedges 2 / triangles 1 / pennants 1）だが、
**relaxed 経路（doubles 2 / H&S 2）は本コーパスで 1 度も accept しない**（#204 Phase 1 の結論と同じ）ため、
以下の実測はすべて strict / forming 経路のもの。

### 「時間足」はパラメータのラベルであってリサンプリングではない

標準コーパスは 1 本の価格系列に `tf` を差し替えて呼ぶ組み方で足を再集計しない（#204 / #208 と同じ限界）。
解釈の錨には**ネイティブ時間足サブセット**（実データ B × `1hour`）を使う。

---

## Phase 1

### 計測 1: `targetReachedPct` の分布（type 別。生 5,000 行）

| type | n | p50 | p90 | p99 | max | >100 | >=1000 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `triangle_ascending` | 1,024 | 114 | 1,762 | 2,366 | **2,366** | 576 | 160 |
| `triangle_descending` | 816 | 233 | 4,696 | 5,599 | **5,599** | 672 | 320 |
| `head_and_shoulders` | 696 | 9 | 62 | 335 | 335 | 40 | 0 |
| `inverse_head_and_shoulders` | 624 | 419 | 14,871 | 240,033 | **240,033** | 584 | 128 |
| `triangle_symmetrical` | 464 | 20 | 302 | 302 | 302 | 192 | 0 |
| `falling_wedge` | 352 | 275 | 3,040 | 5,102 | **5,102** | 192 | 96 |
| `rising_wedge` | 320 | 100 | 106 | 117 | 117 | 160 | 0 |
| `bull_pennant` | 256 | 12 | 14 | 14 | 14 | 0 | 0 |
| `bear_pennant` | 160 | 0 | 0 | 0 | 0 | 0 | 0 |
| `double_bottom` | 120 | 335 | 350 | 350 | 350 | 120 | 0 |
| `bull_flag` | 96 | 22 | 26 | 26 | 26 | 0 | 0 |
| `double_top` | 72 | 717 | 717 | 717 | 717 | 40 | 0 |
| **全体** | **5,000** | **104** | **2,307** | **43,177** | **240,033** | **2,576** | **704** |

`>= 1000` が 704 行（14.1%）。**桁の爆発は逆 H&S に限らない。**

### 計測 2: `targetDistance / patternHeight`

| type | n | min | p1 | p50 | max | <0.5 | <0.1 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `triangle_ascending` | 1,024 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0 | 0 |
| `triangle_descending` | 816 | 0.9987 | 0.9987 | 1.0000 | 1.0073 | 0 | 0 |
| `triangle_symmetrical` | 464 | 0.9922 | 0.9922 | 1.0000 | 1.0103 | 0 | 0 |
| `falling_wedge` | 352 | 0.9844 | 0.9844 | 1.0000 | 1.0000 | 0 | 0 |
| `rising_wedge` / `bull_pennant` / `bear_pennant` / `bull_flag` | 832 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0 | 0 |
| `head_and_shoulders` | 696 | 0.4232 | 0.4232 | 0.4896 | 0.8276 | 624 | 0 |
| `inverse_head_and_shoulders` | 624 | **0.0033** | 0.0033 | 0.4390 | 1.1993 | 344 | **88** |
| `double_top` | 72 | 0.2027 | 0.2027 | 0.2027 | 0.6667 | 40 | 0 |
| `double_bottom` | 120 | 0.1379 | 0.1379 | 3.5324 | 3.5324 | 16 | 0 |

**仮説どおり triangles / wedges / pennants / flags は常に 1.0**（丸めぶんの ±0.016 のみ）。
以降の対策 (2) から外せる。

H&S / doubles の 1,512 行の分位: p0 = 0.0033 / p5 = 0.0955 / p10 = 0.2027 / **p50 = 0.4896** /
p90 = 0.8276 / p100 = 3.5324。**中央値でも既に値幅の半分はブレイク足で走り終えている。**

比が小さい順（構造単位。`pct` は当時＝走査無制限のもの）:

| 比 | type | `targetDistance` | パターン高さ | `pct` |
|---:|---|---:|---:|---:|
| 0.00333 | `inverse_head_and_shoulders` | 669 | 200,996 | **43,177** |
| 0.00676 | `inverse_head_and_shoulders` | 1,106 | 163,537 | **240,033** |
| 0.01213 | `inverse_head_and_shoulders` | 2,865 | 236,118 | 10,082 |
| 0.09553 | `inverse_head_and_shoulders` | 17,852 | 186,870 | 14,871 |
| 0.10119 | `inverse_head_and_shoulders` | 19,060 | 188,356 | 13,928 |
| 0.10591 | `inverse_head_and_shoulders` | 33,775 | 318,917 | 7,707 |
| 0.13793 | `double_bottom` | 2 | 14 | 350 |
| 0.20269 | `double_top` | 67,647 | 333,748 | 717 |

issue 本文の 2 件（240,033 / 43,177）は比 0.68% / 0.33%——起票時の補足にある「退化 2 件が
0.33% / 0.68%」と全桁一致する。ただしそれは**ベースライン fixture（実データ B × `1hour` ×
既定オプション）に出る 2 件**で、コーパス全体では比 0.0121 の 3 件目があり、
0.0955 / 0.1012 / 0.1059 まで含めると 6 件になる。

閾値を振ったときの効果（除外は H&S / doubles にしか掛からない）:

| 閾値 | 除外行 | 除外構造 | 残る H&S/doubles の `pct` max | 全体の `pct` max（走査 60 本適用時） |
|---:|---:|---:|---:|---:|
| 0.02 | 64 | 3 | 14,871 | 7,707 |
| 0.10 | 88 | 4 | 13,928 | 7,707 |
| **0.12** | 128 | 6 | **817** | **1,572** |
| **0.15** | **144** | **7** | **817** | **1,572** |
| 0.25 | 248 | 10 | 817 | 1,572 |

**膝は 0.12。** 0.15 はそのすぐ上の丸い値（除外 2.9%）で、0.25 まで上げても効果は増えない。
0.15 を採用した。意味は「**ブレイク足の終値が既に想定値幅の 85% 以上を走り終えている**」。

### 計測 3: 窓依存の実測

実データ B（`1hour` 365 本）と実データ A（`1day` 90 本）を 2 方向に切り、
`(type, breakoutDate, breakoutTarget)` が一致する構造の `targetReachedPct` / `targetReached` を突き合わせた。

**(a) 先頭切り詰め（= ツールの `limit` そのもの）— 差分 0**

| 比較 | 共通 | 差分 |
|---|---:|---:|
| B `limit` 120 / 150 / 200 / 250 / 300 vs 365 | 1 / 4 / 5 / 5 / 5 | **0 / 0 / 0 / 0 / 0** |
| A `limit` 60 / 90 vs 90 | 2 / 6 | **0 / 0** |

**`limit` は pct を動かさない。** 走査がブレイク足より後ろしか見ないので当然の帰結。
`limit` を絞ると**パターンごと検出されなくなる**（B の 365→200 で 14 件 → 11 件）が、
残った構造の値は同じ。

**(b) 末尾切り詰め（= 同じクエリを過去に叩いた）— 差分 17 行**

| 比較 | 共通 | 差分 | 内容 |
|---|---:|---:|---|
| B 240 / 260 / 280 vs 365 | 5 / 6 / 6 | **4 / 4 / 4** | 下表 |
| B 296 vs 365 | 10 | 1 | `triangle_ascending` 17% → 18%（ブレイク足が末尾） |
| B 300 / 330 vs 365 | 9 / 10 | 0 | — |
| A 60 / 75 vs 90 | 2 / 2 | **2 / 2** | `double_bottom` 8% → **330%**、`triangle_symmetrical` 31% → **207%**（`targetReached` が false → true に反転） |

B の 4 件（240 本 → 365 本）:

| type | ブレイク | 240 本 | 365 本 | `targetReachedPrice` |
|---|---|---:|---:|---|
| `falling_wedge` | 2026-08-17T15:00Z | 4,473% | **5,102%** | 12,600,000 → **12,933,047** |
| `inverse_head_and_shoulders` | 2026-08-17T18:00Z | 209,921% | **240,033%** | 同上 |
| `triangle_ascending`（target 10,387,692） | — | 1,507% | **1,719%** | 同上 |
| `triangle_ascending`（target 11,671,022） | — | 382% | **483%** | 同上 |

**4 件とも `targetReachedPrice` が 12,933,047（idx 294 = 2026-08-25T02:00Z）= 系列全体の最高値。**
8/17 にブレイクしたパターンが 8/25 の高値で採点されている。

### 計測 4: ブレイクからの経過バー数

**extremum まで**（全 5,000 行）: p10 = 1 / p25 = 2 / **p50 = 6** / p75 = 37 / **p90 = 179** /
p99 = 250 / max = 251。ブレイク足自身が extremum なのが 392 行（7.8%）。
**p50 と p90 が 30 倍離れている**のが計測 3 の症状の正体で、右の裾はブレイクとは無関係な後日の高値。

**初到達まで**（到達済み 2,576 行）: p25 = 2 / **p50 = 12** / p75 = 37 / p90 = 47 / **p95 = 52** /
p99 = 72 / max = 72。

| 上限 N | N 本以内に初到達 | `targetReached` 構造単位（∞ = 75） |
|---:|---:|---:|
| 10 | 48.4% | 35（−40） |
| 20 | 58.4% | 42（−33） |
| 30 | 66.8% | 49（−26） |
| 40 | 81.4% | 60（−15） |
| 50 | 93.8% | 70（−5） |
| **60** | **96.3%** | **72（−3）** |
| 90 | 100.0% | 75（**−0**） |

type 別の初到達 p50 は `double_top` 0 / `inverse_head_and_shoulders` 1 / `head_and_shoulders` 2 /
`falling_wedge` 3 / `rising_wedge` 5 / `triangle_ascending` 10 / `triangle_symmetrical` 20 /
`triangle_descending` 41。

**60 を採った理由。** 90 なら `targetReached` の増減が 0 になるが、**90 本ぶんの先が揃う行が
29.4% しかない**（60 本なら 39.5%）——窓が揃うまでは値が暫定なので、揃うのが遅いほど
計測 3 の症状が残る時間が延びる。60 は「reached を 96.3% 保ったまま、揃うのが最も早い」点。

---

## Phase 2: 実装と効果

3 つを同じ PR に入れた。**効果は分けて報告する。**

| # | 実装 | 場所 |
|---|---|---|
| (1) | 到達側を `TARGET_REACHED_PCT_CAP = 999` でクランプ | `targetReachedPct` の算出 |
| (2) | `targetDistance < patternHeight × MIN_TARGET_DISTANCE_HEIGHT_RATIO`（= 0.15）なら **target 進捗系を出さず `targetProgressOmittedReason` で申告** | `computeTargetReach` の入口 |
| (3) | 走査を `TARGET_REACH_MAX_BARS = 60` 本で打ち切り | extremum の走査ループ |

`computeTargetReach` は **`patternHeight` を受け取る形に変えた**（(2) に必要）。12 箇所の呼び出し側が
渡す高さは、triangles / wedges / pennants がそれぞれの `patternHeight` / `poleRange`、
H&S が `necklineProjectionHeight()`（`necklineProjectionTarget` が使う高さと同一。#208 で 1 本に
揃えたものをさらに切り出した）、doubles が `buildDoubleScore` に渡している値と同じ式。

戻り値は `{ kind: 'measured' | 'omitted' }` の判別共用体にし、`PatternEntry` への載せ替えは
`targetReachFields()` に集約した（**12 箇所に同じ spread を書き写していたのを 1 箇所に**）。

実装は `tools/patterns/helpers.ts` から `tools/patterns/target-reach.ts` に切り出した。
**`src/schema/patterns.ts` が 3 つの定数を import して description に埋めるため**——
数値を description 側に書き写すと振る舞いと宣言が黙ってずれる。`helpers.ts` ごと import すると
dayjs / indicators までスキーマの依存に入るので、依存が型だけの単位に分けた。

### 効果 1: `data.patterns` の不変性

標準コーパス 896 ケースで `data.patterns` に出た **1,456 行を位置対応で全フィールド突き合わせ**
（`structureDiagram.svg` / `.artifact.title` は tz 依存の表示物なので `artifact.identifier` に落として比較）:

| 比較対象 | 差分 |
|---|---:|
| 行数 | 1,456 → 1,456 |
| **target 進捗系（4 フィールド）と `targetProgressOmittedReason` 以外のすべて** | **0 行** |
| `type` / `status` / `confidence` / `range` / `pivots` / `neckline` / `scoreComponents` / `structureGate` / `breakoutBarIndex` / `breakoutTarget` / `targetMethod` / `outcome` / `aftermath` | **0 行** |
| `targetReachedPct` / `targetReachedPrice` / `targetReachedDate` | 244 行 |
| `targetReached` | 68 行 |
| `targetProgressOmittedReason`（新規） | 52 行 |

**検出そのものには一切波及していない。** `aftermath.targetReached`（wedges だけが top-level と
整合させている）も本コーパスでは 0 行。

### 効果 2: (2) 分母の退化ガード

| | 値 |
|---|---:|
| 進捗を出さなかった行 | **52 / 1,456**（生の呼び出しでは 144 / 5,000） |
| 内訳 | `inverse_head_and_shoulders` 44 / `double_bottom` 8 |
| triangles / wedges / pennants / flags | **0 行**（構造上掛からない。計測 2 のとおり） |

**issue 本文の 240,033% / 43,177% はどちらもここで消える。** `breakoutTarget` は出るので、
「target は 10,277,171 円。ただし進捗は測れない（理由つき）」という応答になる。

### 効果 3: (3) 走査窓 60 本

計測 3 の突き合わせを修正後にやり直した:

| | before | after |
|---|---:|---:|
| 先頭切り詰め（`limit`）7 通りの差分合計 | 0 | **0** |
| 末尾切り詰め 8 通りの差分合計 | **17** | **5** |

**残る 5 件はすべて「短いほうで 60 本ぶんの足がまだ無い」行**（ブレイクからの残りが
0 / 6 / 13 / 21 / 28 本）。窓が揃った後は不変、という設計どおりの残り方で、
**窓が揃っている構造の差分は 0**。回帰は `tests/patterns/target-reach-window-invariance.test.ts`
が固定する（修正前は 4 テストすべて失敗する）。

### 効果 4: (1) 上限 999

(2)(3) を入れた後の残り（4,856 行）で `pct` が 999 を超えるのは **32 行 / 構造単位 1 件**、max は 1,572
（`falling_wedge`、比 1.0 = 本当に高さの 15 倍動いた行）。**安全網として機能する規模。**

出力全体の分布:

| | before | after |
|---|---:|---:|
| `targetReachedPct` が出た行 | 1,084 | 1,032 |
| p50 | 117 | 111 |
| p90 | **2,582** | **475** |
| p99 | **240,033** | **999** |
| max | **240,033** | **999** |
| `> 100` の行 | 596 | 536 |
| `targetReached: true` | 604 | 536 |

### 効果 5: content と description

`content[0].text` が LLM への唯一のチャネルなので、**走査窓が有限であること・上限に当たったこと・
出さなかったこと**を行そのものに出す（`formatTargetProgressLine()`。
`tools/detect_patterns.ts` と `src/handlers/detectPatternsViewsHandler.ts` の共通実装）。

```text
before: - ターゲット進捗: 240033%（到達済み）
after : - ターゲット進捗: 出力なし（ブレイク足が想定値幅の85%以上を消化済みで、残り距離が短く進捗率が意味を持たないため）

before: - ターゲット進捗: 5102%（到達済み）
after : - ターゲット進捗: 999%以上（ブレイク後60本以内に到達）

before: - ターゲット進捗: 60%
after : - ターゲット進捗: 60%（ブレイク後60本以内は未到達）
```

`src/schema/patterns.ts` の `targetReachedPct` は `z.number().optional()` だけで
description も値域も無かったので、**値域（0〜99 / 100〜999）・999 が「以上」であること・
出ない 3 条件**を宣言した。`targetReached` / `targetReachedDate` / `targetReachedPrice` にも
走査窓を明記し、`targetProgressOmittedReason` を新設して Zod に宣言した
（未宣言だと `parse()` が黙って剥がす——#155 / #160 / #184 / #189 で 4 回）。

## 触っていないもの

- **`breakoutTarget` の算出式**（#211 の対象。`necklineProjectionTarget` の投影の起点＝
  `necklineAt` の無クランプ外挿は据え置き）
- `necklineAt` / `findHsBreakoutIdx` / `confidence` の式 / 検出器のゲート
- `aftermath` の `targetReached` **の定義**（`tools/patterns/aftermath.ts` の独自計算。
  wedges の `aftermath.targetReached` だけが top-level と整合させているので、進捗を出さない
  ケースでは false に倒す——boolean 固定で「不明」を表せないため、到達したと名乗らない側に寄せた）

## 積み残し

- **走査窓が揃うまでは値が暫定**という性質は残る（構造的に消せない——未来は見えない）。
  本 PR は「揃った後は不変」を保証するところまで。揃っていないことを per-pattern に
  申告するかは、実測で 60.5% の行が該当するため**行の大半に付く申告**になり、
  content のノイズと引き合わない判断で見送った。必要なら別 issue で。
- **`double_bottom` の比 3.5324**（`targetDistance` がパターン高さの 3.5 倍）は退化の逆側で、
  「ブレイク足がネックラインの**手前**にある」＝ target が遠すぎるケース。
  進捗率としては正常に働く（分母が大きいので pct は小さく出る）ので本 issue の対象外。
