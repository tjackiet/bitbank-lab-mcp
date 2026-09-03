# 主構成点とネックラインの位置関係の hard gate（issue #216 Phase 2・実測ログ）

[issue #216](https://github.com/tjackiet/bitbank-lab-mcp/issues/216) Phase 2 として、

> `triple_*` / `double_*` の**主構成点がすべてネックラインの正しい側にある**ことを要求する。
> top なら全点が上、bottom なら全点が下。等号は失格。

を実装した。**閾値（許容幅）を 1 つも導入していない。** 判定は `point.price` と
`necklinePrice` の大小比較だけで、つまみが増えていない。
判断の根拠は [Phase 1 のログ](./structural-neckline-main-points-216.md)。

## スコープ: triple / double のみ。H&S 系は触っていない

Phase 1 の結論 2 は「基準（価格基準 × ネックラインの取り方）で件数が 2 桁動くので、
基準の意味から先に決める必要がある」としていた。**その依存は H&S にしか無い**:

| | ネックライン | 構造ゲートに渡る値 | ブレイク判定が使う値 | 基準の選択で結果が動くか |
|---|---|---|---|---|
| `triple_*` | 2 つの中間構成点の**平均**（水平スカラー） | `nlAvg` | 同じ `nlAvg` | **動かない**（線として評価しても同値） |
| `double_*` | 中間構成点**そのもの**（水平スカラー） | `b.price` | 同じ `b.price` | **動かない** |
| H&S 系 | 傾きつきの線 | スカラー（2 谷平均 / 水平線） | `necklineAt` の**線**（右肩は定義 2 点の外側＝外挿） | **動く**（同じ構造がスカラーで「上に外れ」・線で「下に収まる」） |

Phase 1 の 1-3 章でも `triple` / `double` の件数は **4 基準すべてで同一**
（`triple_top` 第3構成点 88/152 が `price × scalar` と `price × line` で一致）。
**基準で動いているのは H&S だけ**なので、H&S 系 4 経路は
[#211](https://github.com/tjackiet/bitbank-lab-mcp/issues/211)（`necklineAt` の外挿クランプ）の
是非が決まってから別 PR とし、本 PR では 1 行も触っていない。

**形成中経路も対象外。** 別式・別構造（ネックラインの引き方も暫定構成点の扱いも違う）で、
Phase 1 も本文の母集団から外して参考値に分けている。

## 価格基準は `price`（終値）。`extremePrice` は採らない

1. **ネックラインが終値から作られている。** `nlAvg` は中間構成点の `price`（終値）の平均。
   終値由来の線に高安を突き合わせるのは #178 項目 4 / `spreadRatio` と同じ**基準混在**。
2. **ブレイク判定が終値。** `findBreakoutIdx` は終値で `nlAvg` 割れを判定する。
   `ReversalStructureInput.necklinePrice` の docstring が要求する
   「ゲートとブレイク判定は同じ値を使う」に揃う。
3. **`extremePrice` 基準では triple の誤側が 0 件**（Phase 1 1-3 章）＝ゲートが no-op になる。
   ヒゲは定義上、山なら上・谷なら下へ伸びるので、高安で測ると「誤った側」がほぼ消える。

## 許容幅を置かない（ゼロ許容）

Phase 1 の結論 4 が根拠。**`double` / `triple` の逸脱量は最小がパターン高さの 2.96%**
（絶対額 2,147〜20,213 円）で、`inverse_head_and_shoulders` の最小 0.012%（31 円）のような
ゼロ近傍の集団が無い。**つまみを増やさずに切れる**——これが H&S を分離したもう 1 つの利点。

## 実装

| ファイル | 追加したもの |
|---|---|
| `tools/patterns/structural.ts` | `validateMainPointsNecklineSide` / `necklineSideDetailsFrom` / `MainPointNecklineSideRejectReason` |
| `tools/patterns/detect_triples.ts` | 完成済み 4 経路（strict / relaxed × top / bottom）に配線 |
| `tools/patterns/detect_doubles.ts` | 完成済み 4 経路に `rejectByNecklineSide` 経由で配線 |

### 主構成点の取り方

| type | `pivots` | 検査する点 | 除く点 |
|---|---|---|---|
| `triple_*` | `[a, b, c]` | **3 点すべて** | — |
| `double_*` | `[a, b, c]` | `[0]` と `[2]` | `b` = **ネックラインの定義点そのもの**（`necklinePrice = b.price`） |

**`double` の `b` を渡すと `deviation === 0` で必ず失格になる**（等号は失格なので全 double が落ちる）。
実測でもそうなっている——落ちた `double_bottom` 285-287-288 の中間構成点 287 は
ネックライン 12,536,893 と**終値が完全一致**する（下の一覧）。

**中間の主構成点は除外していない。** Phase 1 では誤側に来るのは実質「構成点列の最後の 1 点」だけ
（`triple` の第2構成点は 4 基準とも 0 件）だったが、除外する理由が無く、除外すると条件が複雑になる。
**実際、本ゲートは第2構成点が誤側の構造を 1 つ落としている**（`triple_top` 204-**211**-219。
Phase 1 の母集団では `confidence_below_min` で先に落ちていたため 0 件に見えていた）。

### 置いた位置

```text
three_peaks_not_level → valleys_missing → neckline_slope_excess
  → サイズ検査 → applyReversalGate → validateLevelSpread → ★本ゲート → findBreakoutIdx → confidence
```

`validatePatternSize` / `validateLevelSpread` の docstring の
「**既存の棄却検査をすべて通過した後**に置く（固有の理由コードを持つ候補の `reason` を横取りしない）」
に従う。`detect_doubles.ts` も同じく `rejectByLevelDiff` の直後（＝既存検査の最後尾）。

**`confidence_below_min` より前**である点は Phase 1 のシミュレーションと違う
（あちらは confidence の後ろに置いていた）。帰属が変わる候補数は[下に報告する](#3-棄却理由の帰属の変化)。

### 理由コード

既存の語彙（`peak_spread_vs_height_excess` / `valley_spread_vs_height_excess`、
`peaks_diff_vs_height_excess` / `valleys_diff_vs_height_excess`）に倣い **side ごとに分ける**。
`view=debug` の「reason 横断合計」行（#193 / PR #194）で
「山がネックラインを割った」と「谷がネックラインを超えた」——**符号が逆の 2 つの破綻**が
1 つの数字に潰れないようにするため。

| side | コード |
|---|---|
| top | `peaks_below_neckline` |
| bottom | `valleys_above_neckline` |

`details` には**どの点がどれだけ外れたかを 1 点ずつ**載せる
（`necklinePrice` / `offenders[].idx` / `.price` / `.deviation` / `.deviationPct` / `maxDeviation`）。

## 計測条件

| 項目 | 値 |
|---|---|
| 計測日 | 2026-09-03 |
| 対象コミット | `49e5d01`（#222 マージ後の `main`）と本 PR の差分 |
| コーパス | **標準コーパス 800**（合成 704 = `tests/detect_patterns_fixtures.test.ts` の fixture 22 件 × オプション 8 通り × 時間足 2 種 × `swingDepth` 2 種、実データ A 96 = `tests/fixtures/btc_jpy_1day_2026.ts` × 時間足 3 種 × `swingDepth` 4 種 × オプション 8 通り）**＋ 実データ B 96**（`tests/fixtures/btc_jpy_1hour_2026_08.ts` × 同上）**＋ 補助スイープ 44**（実データ B × 全 11 時間足 × `swingDepth` 4 種）= **940 ケース**。#205 / #206 / #213 / #216 Phase 1 と同じ組み方 |
| view | `data.patterns` は `view` で変わらないため **`view=full` と同値** |
| 件数の 3 段階 | **生の行数**（検出器が emit した行。`globalDedup` 前）/ **構造単位** `(系列, tf, type, 構成点の idx)` / **`data.patterns`**（940 ケース延べ） |

### ハーネスの検算

ベースライン側で既存の実測ログと突き合わせた。**全項目一致**:

| 出典 | 項目 | 記載値 | 本ハーネス |
|---|---|---:|---:|
| #213 | 940 ケースの `data.patterns` 合計 | 1,968 | **1,968**（#222 の型間排他 25 件を戻した値。実測は 1,943 + 25） |
| #213 | 同 `head_and_shoulders` / `inverse_head_and_shoulders` | 166 / 162 | **166 / 162** |
| #216 Phase 1 | `triple_top` 219-223-232 の逸脱量 | 3,273.5 円 | **3,273.5 円** |

## 1. `data.patterns` の増減（Phase 1 の試算との突き合わせ）

**Phase 1 4 章の試算と完全一致した。**

| type | Phase 1 の試算 | 実測 before → after | Δ |
|---|---:|---|---:|
| `double_top` | 0 | 40 → 40 | **0** |
| `double_bottom` | −4 | 88 → 84 | **−4** |
| `triple_top` | −44 | 112 → 68 | **−44** |
| `triple_bottom` | −12 | 83 → 71 | **−12** |
| **合計** | **−60** | 1,943 → 1,883 | **−60** |

**他の 10 type は 1 件も動いていない**——
`bear_pennant` 16 / `bull_flag` 8 / `bull_pennant` 40 / `falling_wedge` 264 /
`head_and_shoulders` 166 / `inverse_head_and_shoulders` 162 / `rising_wedge` 216 /
`triangle_ascending` 392 / `triangle_descending` 188 / `triangle_symmetrical` 168 が
before / after とも同値（issue の検証 2「H&S は 1 件も動かないはず」を満たす）。

### 絶対値が Phase 1 の表とずれる理由（Δ はずれない）

Phase 1 は `5bdfa1f`（#218 Phase 2 の**前**）で測っているので、ベースラインの絶対値が違う:

| | Phase 1 の before | 本実測の before | 差 |
|---|---:|---:|---:|
| `triple_bottom` | 108 | 83 | **−25** |
| `data.patterns` 全体 | 1,968 | 1,943 | **−25** |

差の 25 は**すべて #222 の型間排他**（`meta.reduction.tripleHsExcluded` の 25 件）で、
`triple_bottom` にしか掛かっていない。**Δ は両者で完全に一致する**——
本ゲートが落とす構造と排他が落とす構造に重なりが無いため（[2 章](#triplehsexcluded-は減らなかったissue-の検証-3-の予想と違う)）。

Phase 1 の `data.patterns` 全体 Δ が **−65** で本実測が **−60** なのは、あちらが H&S 系にも
ゲートを掛けた試算（`scalar` 基準で `inverse_head_and_shoulders` −5）だから。
**`double` / `triple` の 4 type だけを見ると −60 で一致する。**

### 検出器層（`globalDedup` 前）

**こちらも Phase 1 の試算と一致**（`price` × `scalar`。`triple` / `double` は
`line` / `clamped` でも同値なので Phase 1 の 3 表とも同じ数字）:

| type | Phase 1 生の行数 Δ | 実測 | Phase 1 構造単位 Δ | 実測 |
|---|---:|---:|---:|---:|
| `double_bottom` | −4 | **−4** | −2 | **−2** |
| `double_top` | 0 | **0** | 0 | **0** |
| `triple_top` | −88 | **−88** | −12 | **−12** |
| `triple_bottom` | −20 | **−20** | −2 | **−2** |
| **合計** | **−112** | **−112** | | |

> 構造単位は Phase 1 と同じ `(系列, tf, type, 構成点の idx)`。本ハーネスは実データ B を
> 「実データ B 96」と「補助スイープ 44」の 2 層で回すが、**どちらも同じ価格系列**なので
> 系列を畳んで数える（畳まないと `triple_top` が −16 に見える）。

## 2. `meta.reduction` の段ごとの増減

| 段 | before | after | Δ |
|---|---:|---:|---:|
| `detected` | 7,433 | 7,321 | **−112** |
| `dedupMerged` | 4,052 | 4,032 | **−20** |
| `currentFiltered` | 0 | 0 | 0 |
| `lifecycleExcluded` | 1,413 | 1,381 | **−32** |
| `tripleHsExcluded` | 25 | 25 | **0** |
| `output` | 1,943 | 1,883 | **−60** |

waterfall は成立している（`−112 = −20 + 0 + −32 + 0 + −60`）。

### `tripleHsExcluded` は減らなかった（issue の検証 3 の予想と違う）

issue は「#222 の型間排他は本ゲートの後段にあるので、triple が先に落ちれば排他の対象も減る」
と予想していたが、**940 ケース全件で 25 件のまま**（発火したケース集合も完全に同一。
ケース単位で差が出たケース数 0）。

**2 つのゲートが別の構造を落としているため。** 排他が落とすのは
`triple_bottom` 242-249-272（実データ B × `1hour`）で、その 3 谷は
ネックライン 12,306,892.5 に対し **−87,023.5 / −231,137.5 / −93,795.5** ——
**3 点とも正しい側にある**ので本ゲートには掛からない。逆に本ゲートが落とす
`triple_top` 219-223-232 は、出力に残る 2 件の `head_and_shoulders`
（主構成点 265-294-322 / 204-294-322）と主構成点を 1 点も共有しないので排他の対象外。

**重なりが無いことは偶然ではない。** 排他の根拠は「H&S の `headProminencePct` が
中央の突出を検証済み＝ 3 点同水準と両立しない」で、本ゲートの根拠は
「主構成点がネックラインを割っている」。前者は**中央が他の 2 点から離れている**形、
後者は**端の点がネックラインを跨いでいる**形で、破綻している箇所が違う。

## 3. 棄却理由の帰属の変化

新コードが付いた候補を `(ケース, type, 構成点の idx)` で数え、ベースラインでの `reason` と
突き合わせた（`view=debug` の cap=200 を通さない無制限集計）:

| ベースラインでの帰属 | 候補 | 中身 |
|---|---:|---|
| `accepted` | **155** | 「これまで accepted だった候補だけを落とす」——配置が最後尾であることの帰結 |
| `confidence_below_min` | **33** | **横取り**。#199 候補 1 で confidence ゲートが最後尾へ移ったため、本ゲートより後ろにいる |
| **計** | **188** | 生の行数では 368（strict 1 + relaxed 2 段が同じ 3 山を拾い直すため） |

**`confidence_below_min` の横取り 33 件はすべて `triple_top` 204-211-219**（第2構成点が誤側の構造）。
`triple_top|confidence_below_min` は 33 → **0** になり、`triple_bottom|confidence_below_min` は
26 のまま動かない。**`data.patterns` には影響しない**——どちらのコードで落ちても出力からは消える。

issue の指示（`validateLevelSpread` の直後）に従った結果で、Phase 1 のシミュレーション
（confidence の後ろに置いた）とは意図的に違う。**後ろに置き直せば横取りは 0 になるが、
`view=debug` の診断が「汎用の confidence 不足」に化ける**——#199 が
`confidence_below_min` を後ろへ動かした理由（固有の診断を汎用コードで潰さない）と逆行する。

### relaxed 経路が余分に走ることによる棄却行の増加

strict が対象 type を 0 件にすると relaxed フォールバック（factor 1.25 / 2.0）が走るため、
**ベースラインには存在しなかった候補キーが 88 件**現れる（relaxed のループが
early-return せずに後続候補まで評価するようになるため）。Phase 1 4-3 章が
「連鎖はすべて relaxed フォールバックの発火」と書いたものと同じ現象で、
**`data.patterns` には出ない**（relaxed が拾い直した候補も本ゲートか既存ゲートで落ちる）。

## 4. 落ちた構造（1 件ずつ）

**件数ではなく形で判断できるように、全主構成点の位置関係を出す。**
価格系列上の構造は **6 つ**で、すべて実データ B（`btc_jpy_1hour_2026_08`）。
`tf` 欄は同じ価格系列に対するパラメータのラベル（リサンプリングではない。#205 と同じ限界）。

```text
double_bottom  構成点 idx 285-287-288
range: 2026-08-24T17:00:00.000Z → 2026-08-24T20:00:00.000Z
tf: 1min, 5min
nlAvg: 12,536,893.0
  idx  285  2026-08-24T17:00:00.000Z  close     12,529,686   正側            -7207.0  (-0.0575%)
  idx  287  2026-08-24T19:00:00.000Z  close     12,536,893   NL定義点            +0.0  (0.0000%)
  idx  288  2026-08-24T20:00:00.000Z  close     12,557,106   誤側           +20213.0  (0.1612%)

triple_bottom  構成点 idx 205-214-220
range: 2026-08-21T09:00:00.000Z → 2026-08-22T00:00:00.000Z
tf: 15min, 1hour, 1min, 30min, 4hour, 5min
nlAvg: 12,352,951.5
  idx  205  2026-08-21T09:00:00.000Z  close     12,351,281   正側            -1670.5  (-0.0135%)
  idx  214  2026-08-21T18:00:00.000Z  close     12,250,416   正側          -102535.5  (-0.8300%)
  idx  220  2026-08-22T00:00:00.000Z  close     12,355,098   誤側            +2146.5  (0.0174%)

triple_bottom  構成点 idx 313-316-321
range: 2026-08-25T21:00:00.000Z → 2026-08-26T05:00:00.000Z
tf: 15min, 1min, 30min, 5min
nlAvg: 12,576,170.5
  idx  313  2026-08-25T21:00:00.000Z  close     12,521,114   正側           -55056.5  (-0.4378%)
  idx  316  2026-08-26T00:00:00.000Z  close     12,530,000   正側           -46170.5  (-0.3671%)
  idx  321  2026-08-26T05:00:00.000Z  close     12,577,780   誤側            +1609.5  (0.0128%)

triple_top  構成点 idx 204-211-219
range: 2026-08-21T08:00:00.000Z → 2026-08-21T23:00:00.000Z
tf: 15min, 1hour, 1min, 30min, 4hour, 5min
nlAvg: 12,300,848.5
  idx  204  2026-08-21T08:00:00.000Z  close     12,571,740   正側          -270891.5  (-2.2022%)
  idx  211  2026-08-21T15:00:00.000Z  close     12,260,243   誤側           +40605.5  (0.3301%)
  idx  219  2026-08-21T23:00:00.000Z  close     12,445,660   正側          -144811.5  (-1.1772%)

triple_top  構成点 idx 204-219-236
range: 2026-08-21T08:00:00.000Z → 2026-08-22T16:00:00.000Z
tf: 15min, 1hour, 1min, 30min, 4hour, 5min
nlAvg: 12,283,640.0
  idx  204  2026-08-21T08:00:00.000Z  close     12,571,740   正側          -288100.0  (-2.3454%)
  idx  219  2026-08-21T23:00:00.000Z  close     12,445,660   正側          -162020.0  (-1.3190%)
  idx  236  2026-08-22T16:00:00.000Z  close     12,275,104   誤側            +8536.0  (0.0695%)

triple_top  構成点 idx 219-223-232
range: 2026-08-21T23:00:00.000Z → 2026-08-22T12:00:00.000Z
tf: 15min, 1hour, 1min, 30min, 4hour, 5min
nlAvg: 12,285,548.5
  idx  219  2026-08-21T23:00:00.000Z  close     12,445,660   正側          -160111.5  (-1.3033%)
  idx  223  2026-08-22T03:00:00.000Z  close     12,460,820   正側          -175271.5  (-1.4266%)
  idx  232  2026-08-22T12:00:00.000Z  close     12,282,275   誤側            +3273.5  (0.0266%)
```

**6 つのうち Phase 1 が「emit される誤側構造」として数えた 4 つ**は
`double_bottom` 285-287-288 / `triple_bottom` 205-214-220 / `triple_top` 204-219-236 /
`triple_top` 219-223-232 で、逸脱量 2,147〜20,213 円という Phase 1 の帯もこの 4 つのもの。
残る 2 つは**ベースラインでは `data.patterns` に到達していなかった**構造:

| 構造 | ベースラインでの扱い |
|---|---|
| `triple_top` 204-211-219 | `confidence_below_min` で棄却（[3 章](#3-棄却理由の帰属の変化)） |
| `triple_bottom` 313-316-321 | `accepted` だが全件 `near_completion` で、`includeForming=false` では `detectTriples` が返さない（Phase 1 4-2-1 章の「emit されない候補 43」と同じ理由） |

### 形として成立していないと言える理由

- `triple_top` 219-223-232（**issue 本文の実例と同型**）: 山1 / 山2 はネックラインの
  1.30% / 1.43% 上にあるのに、**山3 だけが 0.027% 下**。水平なレジスタンスに 3 回当たった形なら
  3 つの山はすべて支持線の上にあるはずで、1 つが割っている時点で「3 山」ではなく
  「2 山＋切り下がり」。
- `triple_top` 204-211-219: **真ん中の山がネックラインを 0.33% 割っている。**
  山 → 谷 → 山の交互列で中央の山が谷の水準より下にある＝**構成点の役割が入れ替わっている。**
- `double_bottom` 285-287-288: 谷2（12,557,106）が**ネックライン（中間の山 idx 287 の終値
  12,536,893）より 20,213 円上**。`heightProj` 基準で 310.83%——Phase 1 が「分母が退化している」と書いた構造で、
  高さ 6,503 円に対し逸脱が 3 倍ある。

## 5. 受け入れ条件（issue の検証 4）

起票時のライブ実例（btc_jpy `1hour` の `triple_top` conf 0.95、
ネックライン 12,741,832 / 山3 12,725,937 = **−15,895**）は**ライブデータなので固定できない**。
**同型のケースを 2 通りで回帰テストに固定した**（`tests/patterns/neckline-side-triple-double.test.ts`）:

1. **合成 fixture**（`1hour`・34 本）: 山1 / 山2 = 100.0、山3 = **95.6**、ネックライン **96.0**。
   - before: `triple_top`（conf 0.67）と `double_top`（conf 0.69）が**二重に出力**
   - after: `triple_top` は `peaks_below_neckline` で落ち、**`double_top` は残る**
     （double の主構成点は 2 点ともネックラインより上）＝**二重出力が解消する**
2. **凍結済み実データ**（`btc_jpy_1hour_2026_08`）: `triple_top` 219-223-232 が
   `peaks_below_neckline` で落ちる（逸脱 3,273.5 円）。top / bottom × triple / double の
   4 通りすべてを実データの候補で押さえてある。

ベースライン（`tests/fixtures/detect_patterns_1hour_data_patterns_baseline.json`）は
**13 → 12**。消えたのは `triple_top` 219-223-232（conf 0.70）1 件だけで、
**残り 12 件は全フィールド不変**（差分は純粋な削除 101 行のみ）。

## 6. 限界

- **該当する価格系列は実データ B の 6 構造だけ。** 標本が薄いという Phase 1 の限界がそのまま付く。
  ただし本ゲートは閾値を持たないので、**標本の薄さが閾値選択のバイアスにならない**
  （#218 Phase 1 が深さ比の閾値を却下した理由と対照的）。
- **H&S 系は未対応。** #211 の (i)（ブレイク検出のクランプ）の是非が決まってから別 PR。
  Phase 1 の実測では、H&S にゲートを掛けた場合の `data.patterns` Δ は基準によって
  −5 / −9 / −10 と動く。
- **形成中経路は対象外。** ネックラインの引き方と暫定構成点の扱いが完成済みと違うので、
  同じ判定をそのまま持ち込めない。
- **標準コーパスの「時間足」はリサンプリングではなくパラメータのラベル**（#205 の同名の注記と同じ）。
