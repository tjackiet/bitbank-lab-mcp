# H&S `breakoutTarget` の高さ基準を頭の真下に戻す（issue #208 案 A・前後計測ログ）

[issue #208](https://github.com/tjackiet/bitbank-lab-mcp/issues/208) の**案 A のみ**——
「値幅の**高さ**は頭の真下のネックラインで測り、**投影の起点**だけをブレイク足（forming は
最終構成点）に置く」——を実装し、標準コーパスで前後比較を取った記録。

**案 B（`necklineAt` に外挿クランプを入れる）は本 PR に含まない。** `findHsBreakoutIdx` が
同じ `necklineAt` を使うのでブレイク検出そのものが動き、`breakoutIdx` → `status` /
`range.end` / `per` / `confidence` まで連鎖する。寄与が分離できなくなるため別 issue に切る。

## 結論（断定）

1. **target 系フィールドを除く `data.patterns` のメンバと `confidence` は完全に不変。**
   2,680 行を位置対応で突き合わせて
   `series` / `tf` / `swingDepth` / オプション / `type` / `status` / 経路 / `confidence` /
   `range` / `pivots` / `breakoutBarIndex` / `breakout.price` / `outcome` の差分は **0 行**。
   変わったのは `breakoutTarget` / `targetMethod` / `targetReached` / `targetReachedPct` /
   `targetReachedDate` / `targetReachedPrice` だけ（＝案 B に踏み込んでいない）。
2. **「ブレイク直後に無条件で到達」が 824 行 → 144 行**（構造単位 42 件 → 9 件）。
   下方向 H&S は **656 行 → 0 行**で消えた。issue #208 の症状そのものが対象。
   `targetReached: true` は 1,152 行 → 640 行（構造単位 67 件 → 47 件）。
3. **残る 144 行（構造単位 9 件、すべて逆 H&S）は式の欠陥ではない。** 全 144 行で
   `(ブレイク足終値 − ネックライン) / 高さ >= 1.00`——**ブレイク足の終値そのものが値幅を
   走り抜けている**。`findHsBreakoutIdx` は右肩から最大 30 本先まで「バッファ 1.5% を超えた
   最初の終値」を拾うので、始値から大きく飛んだ足がブレイク足になれば target は本当に
   その足で到達済みになる。ただし `targetReachedPct` が発散する（実データ B で 240,033%）
   のは別の欠陥で、**本 PR の対象外**（後述）。
4. **高さ 0 以下ガードの発火は 0 件。** 頭はネックラインの 2 定義点の**間**にあり、頭の真下の値は
   内挿になって必ず両端の間に収まるため、3 経路とも構造的に到達しない。
   issue が懸念した「外挿ネックラインが頭を追い越して高さが負になる」条件
   （`p2.price − necklineAt(breakoutIdx) <= 0`）も strict 1,336 行で **0 件**だった。
5. **forming の起点を最終構成点にした副作用が 32 行（構造単位 4 件）ある。** ネックラインの
   定義区間の右端（頭後の谷）から右肩まで **7〜54 本**外挿するため、
   `necklineAt(最終構成点)` が**頭を追い越す**（＝ネックラインが頭より上に来る）。
   高さは頭の真下で測るので target の符号は正しいままだが、起点が高すぎるぶん値が上振れる。
   **これは案 B（外挿クランプ）が解く問題**で、案 A の範囲では直せない（[副作用](#forming-の起点の外挿) 参照）。

## 変更内容

`tools/patterns/detect_hs.ts` に `necklineProjectionTarget()` を追加し、
`targetMethod: 'neckline_projection'` を名乗る **6 箇所すべて**をそこに集約した。

```text
hsTarget  = necklineAt(nl, anchorIdx) − (head.price   − necklineAt(nl, head.idx))
ihsTarget = necklineAt(nl, anchorIdx) + (necklineAt(nl, head.idx) − head.price)
```

| 経路 | 高さの基準（before → after） | 投影の起点 |
|---|---|---|
| strict H&S / 逆 H&S | `necklineAt(breakoutIdx)` → **`necklineAt(head.idx)`** | `necklineAt(breakoutIdx)`（未ブレイク時は右肩）※不変 |
| relaxed H&S / 逆 H&S | `nlY`（水平線）→ **`necklineAt(head.idx)`**（水平線なので同値） | `necklineAt(breakoutIdx)`（水平線なので `nlY` と同値） |
| forming H&S / 逆 H&S | `neckline[0].y`（**左端**）→ **`necklineAt(head.idx)`** | `neckline[0].y` → **`necklineAt(rightShoulder.idx)`** |

高さが 0 以下なら `breakoutTarget` / `targetMethod` を**出さない**（下流は
`p.breakoutTarget != null` で分岐しており、triangles / wedges / pennants が既に同じ
「target が出ないことがある」形になっている）。

`necklineAt` 本体・`findHsBreakoutIdx`・`confidence` の式・triple / double の target 算出は
**1 行も触っていない。**

## 計測条件

| 項目 | 値 |
|---|---|
| 計測日 | 2026-09-02 |
| 対象コミット | `eb462e7`（#207 マージ後の `main`）と、その上に本変更を載せたもの |
| 対象関数 | `detectHeadAndShoulders()` を直接呼ぶ。`ctx` は `detect_patterns.ts` と同一の組み方（`resolveParams` → `detectSwingPoints` → `filterPeaks` / `filterValleys` → `getSizeThresholdsForTf`） |
| コーパス | **標準コーパス 800**（合成 704 = fixture 22 件 × オプション 8 通り × 時間足 2 種 × `swingDepth` 2 種、実データ A 96 = `btc_jpy_1day_2026` × 時間足 3 種 × `swingDepth` 4 種 × オプション 8 通り）**＋ 実データ B 96**（`btc_jpy_1hour_2026_08` × 同上）= **896 ケース** |
| 生の行数 | 2,680（strict 2,608 / forming 72 / relaxed 0） |
| 突き合わせ | before / after を**同一順序の位置対応**で 1 行ずつ比較（検出順は決定的） |

`docs/internal/hs-confidence-distribution-phase1.md`（#204 Phase 1）と同じ組み方で、
strict の完成済み 1,336 行 / 未確認 1,272 行という内訳も一致する。
**relaxed は本コーパスで 1 件も accept しない**（#204 Phase 1 の結論 4 と同じ）ため、
relaxed 経路の値が変わらないことは**実測ではなく式の同値性**で担保している
（水平ネックラインでは `necklineAt` がどの `i` でも `nlY` を返す）。

### 「時間足」はパラメータのラベルであってリサンプリングではない

標準コーパスは 1 本の価格系列に `tf` を差し替えて呼ぶ組み方で、足を再集計しない
（#204 Phase 1 と同じ限界）。解釈の錨には**ネイティブ時間足サブセット**
（実データ B × `1hour` = 1,464 行）を使う。

## 計測 1: target 系を除くメンバの不変性

| 比較対象 | 差分 |
|---|---:|
| 行数 | 2,680 → 2,680 |
| `series` / `tf` / `swingDepth` / オプション / `type` / `status` / 経路 / `range` / `pivots` / `headIdx` / `breakoutBarIndex` / `breakout.price` / `outcome` | **0 行** |
| `confidence` | **0 行** |
| `breakoutTarget` | 2,636 行 |
| `targetReachedPct` | 1,320 行 |
| `targetReached` true → false | 624 行 |
| `targetReached` false → true | 112 行 |

`breakoutTarget` が変わらなかった 44 行は**全行がネックライン水平**（2 定義点の y が完全一致）で、
`necklineAt(head.idx) == necklineAt(anchorIdx)` になるため新旧が同値になる行。

## 計測 2: 「無条件到達」の消滅（本 PR の実質的な効果）

「無条件到達」= ブレイク足の終値の**向こう側に target が無い**行
（下方向なら `breakoutTarget >= ブレイク終値`、上方向なら `<=`）。

### 生の行数

| 区分 | 行数 | 無条件到達 before | after | `targetReached: true` before → after |
|---|---:|---:|---:|---:|
| 全体 | 2,680 | 824 | **144** | 1,152 → **640** |
| strict | 2,608 | 824 | 144 | 1,152 → 640 |
| relaxed | 0 | — | — | — |
| forming | 72 | 0 | 0 | 0 → 0（ブレイク足が無く `targetReached` を出さない） |
| `head_and_shoulders` | 1,588 | 656 | **0** | 664 → **40** |
| `inverse_head_and_shoulders` | 1,092 | 168 | 144 | 488 → 600 |
| 合成 | 80 | 16 | 16 | 16 → 16 |
| 実データ A | 616 | 48 | **0** | 272 → 384 |
| 実データ B | 1,984 | 760 | **128** | 864 → 240 |
| 実データ B × `1hour`（ネイティブ） | 1,464 | 464 | **128** | 568 → 240 |

### 構造単位（`series` / `tf` / `type` / 5 点の idx で重複排除）

| 区分 | 件数 | 無条件到達 before → after | `targetReached: true` before → after |
|---|---:|---:|---:|
| 全体 | 182 | 42 → **9** | 67 → **47** |
| strict | 170 | 42 → 9 | 67 → 47 |
| forming | 12 | 0 → 0 | 0 → 0 |

逆 H&S で `targetReached: true` が**増えている**（488 → 600 行）のは、右上がりネックラインの
逆 H&S では旧式の高さ `nlAt(breakoutIdx) − head` が**過大**になり target が遠すぎたため。
高さを頭の真下に戻すと target が近づいて到達判定が立つ。方向が両側に出るのは想定どおりで、
「甘くした」わけでも「厳しくした」わけでもない。

## 計測 3: 高さの潰れ率と外挿距離（strict、ブレイク確認済み 1,336 行）

`旧基準 ÷ 新基準` = `(head − nlAt(breakoutIdx)) / (head − nlAt(head.idx))`。

| 統計 | 値 |
|---|---:|
| min | 0.131 |
| p10 | 0.383 |
| p25 | 0.428 |
| p50 | 0.458 |
| p75 | 1.343 |
| p90 | 2.018 |
| max | 2.346 |

中央値 0.458 = **旧式は高さを半分以下に潰していた**。issue 本文の 1hour ケース（1/2.34）は
最も潰れた側ではなく**分布の端に近い代表例**で、max = 2.346 はその逆数（＝逆 H&S 側で
高さが 2.3 倍に膨らんでいたケース）。

ブレイク足までの外挿距離（`breakoutIdx − 谷2.idx`）は min 4 / p50 **17** / max **45 本**。
`HS_BREAKOUT_MAX_BARS = 30` に加えて右肩と谷2 の間隔ぶんが乗るため 30 本を超え得る。

## 計測 4: 高さ 0 以下ガードの発火

| 条件 | 件数 |
|---|---:|
| **新式**で高さ <= 0（＝ `breakoutTarget` を出さなかった行） | **0** |
| strict で `p2.price − necklineAt(breakoutIdx) <= 0`（旧式が逆向き target を出す条件） | **0** |

**実データでは起きない。** issue 本文が懸念した「外挿ネックラインが頭を追い越して
下方向 H&S の target が上を向く」は、strict 1,336 行では 1 件も発火しなかった。
新式では頭の真下（＝ 2 定義点の内挿）で測るため構造的に起きない。ガードは
`neckline` の張り方が経路ごとに違うことへの保険として残す（テストは helper を直接呼ぶ
`tests/patterns/detect_hs.test.ts` の 3 ケース）。

## 副作用

### forming の起点の外挿

forming にはブレイク足が無いので投影の起点を**最終構成点（暫定を含む右肩）**にしたが、
ネックラインの定義区間は「先行谷 → 頭後の谷」で終わっており、そこから右肩まで
**7 / 39 / 42 / 50 / 54 本**の外挿になる。その結果:

| | 件数 |
|---|---:|
| forming 行 | 72 |
| うち `necklineAt(右肩)` が**頭を追い越す** | **32**（構造単位 4 件） |

実例（実データ B × `4hour`、`swingDepth=5`）:

```text
ネックライン  idx 272 (12,213,097) → idx 305 (12,531,708)   傾き +9,655/本
頭            idx 294  12,851,000        nlAt(294) = 12,425,504 → 高さ 425,496
暫定右肩      idx 355                    nlAt(355) = 13,014,452  ← 頭より上
before: 11,575,194（左端 12,213,097 を高さにも起点にも使用）
after:  12,588,956（起点 13,014,452 − 高さ 425,496）
```

高さ自体は頭の真下で測るので符号は正しいが、**起点が頭より上**という構造的にあり得ない
水準になっている。50 本の外挿は 33 本の定義区間より長く、傾きの外挿誤差が水準そのものを
超える。**これは案 B（`necklineAt` を定義区間でクランプする）が解く問題**で、案 A の
範囲では直せない——起点をクランプすると「ブレイク足時点のネックライン」という
strict の起点の意味も変わり、`findHsBreakoutIdx` との整合を別途決める必要がある。

案 B を切るときは **forming の起点を最優先の対象**にすること。strict の外挿は
p50 17 本 / max 45 本だが頭を追い越した行は 0 件で、forming のほうが実害が出ている。

### `targetReachedPct` の発散（本 PR の対象外）

結論 3 の「残る 144 行」では target がブレイク終値のすぐ近く（または手前）に来るため、
`computeTargetReach` の分母 `|target − breakoutPrice|` が極端に小さくなり
`targetReachedPct` が発散する。ベースラインでも `16,309% → 240,033%` に増えている。

これは**旧式でも起きていた**（16,309% は before の値）性質で、原因は
`targetReachedPct` が「ブレイク終値から target までの距離」を分母に取っていること。
target の定義を直しても消えないので、別 issue で `pct` の分母を
「パターン高さ」に変える等の検討が要る。

## ベースラインの更新

`tests/fixtures/detect_patterns_1hour_data_patterns_baseline.json` は 14 件中 4 件の
target 系フィールドが変わる（件数・`confidence` は不変）。更新履歴の表は
`tests/detect_patterns_data_patterns_regression.test.ts` の docstring に 1 行足した（#207 のルール）。

| パターン | `breakoutTarget` | `targetReached` |
|---|---|---|
| `head_and_shoulders`（2026-08-23T21:00Z〜） | 12,446,657 → **12,176,203** | true → **false** |
| `head_and_shoulders`（2026-08-21T08:00Z〜） | 12,427,825 → **12,177,311** | true → **false** |
| `inverse_head_and_shoulders`（2026-08-21T23:00Z〜） | 12,809,302 → **12,643,525** | true（据置） |
| `inverse_head_and_shoulders`（2026-08-13T02:00Z〜） | 10,261,999 → **10,277,171** | true（据置） |

1 件目が issue #208 本文のケース。issue は `12,176,202` と書いているが、これは
`nlAt(330) = 12,648,828` と高さ `472,626` を**それぞれ整数に丸めてから**引いた値で、
実装は丸めを最後に 1 回だけ行うため **12,176,203** になる（`12,648,828.90 − 472,625.54`）。
issue 本文の表も `12,176,203` を挙げており、そちらと一致する。
