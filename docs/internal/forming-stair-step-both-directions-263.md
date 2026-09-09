# 形成中 triple の単調性ゲートを両向きにした実測（issue #263）

`scripts/measure_forming_triple_level_spread_178.ts` の **§7** の出力をそのまま貼ったもの（§3）に、
読み方（§1）と #178 §8 の目視判定との突き合わせ（§2）を足したメモ。

計測ハーネスは PR #260（#178 項目 1 Phase 1）のものをそのまま使い、**#263 の ablation を足しただけ**。
コーパス・ケース数・「延べ / 構造 / 実体」の定義は
[`forming-triple-level-spread-178.md`](./forming-triple-level-spread-178.md) §1 が単一ソース。

## 1. 読み方

- **strip ビルドを 2 つ作って 2 つのゲートを切り分ける。** #261 も #263 も既に作業ツリーに入って
  いるので、`base` は両方入った状態。

  | ビルド | #261（ネックライン側） | #263（単調性の両向き化） | 対応する `main` |
  |---|---|---|---|
  | `stripBoth` | 外す | 外す | d86fb2b（#260 マージ直後） |
  | `strip263` | **入り** | 外す | 56432d8（#264 マージ直後） |
  | `base` | 入り | **入り** | #263 実装後 |

  **§6 は `stripBoth → strip263`**（#261 だけ）、**§7 は `strip263 → base`**（#263 だけ）。
  こう分けないと、あとから入った #263 が §6 の「配線前」に混ざって #261 の効果が測れない。

- **strip ビルドは実物と一致する。** 別チェックアウトで同スクリプトを走らせた出力と突き合わせた:

  | 指標 | `main` d86fb2b | `stripBoth` | `main` 56432d8 | `strip263` |
  |---|---:|---:|---:|---:|
  | accepted な形成中 triple（延べ / 構造 / 実体） | 7,581 / 111 / 48 | 7,581 / 111 / 48 | 5,818 / 99 / 43 | 5,818 / 99 / 43 |
  | うち `spreadRatio > 0.5`（延べ / 実体） | 2,625 / 34 | 2,625 / 34 | 1,051 / 18 | 1,051 / 18 |

  §6 が PR #264 の報告値（`48 → 43` / `34 → 18`）をそのまま再現していることも確認できる。

- **`strip263` は判定式を 1 行差し替えるだけ。** `rejectFormingStairStep` の
  `const monotonic = ascending || descending;` を
  `const monotonic = type === 'triple_top' ? ascending : descending;`（#263 以前の片側判定）に戻す。
  閾値・理由コード・積む点は一切変えないので、**差分は「見る向きが増えたこと」だけに帰属する。**
  ハーネスは `stripBoth` / `strip263` のどちらでも**新しい向きが 0 件**であることを毎回検算する。

- **理由コードは向きの名前で、type の名前ではない。** #263 が足したのは
  `triple_top:forming_stair_step_down` と `triple_bottom:forming_stair_step_up` の 2 通り。
  元からあった `triple_top:forming_stair_step_up` / `triple_bottom:forming_stair_step_down` と
  区別して数えている。

## 2. #178 §8（目視判定）との突き合わせ

**#263 は向きを増やしただけで `FORMING_STAIR_STEP_LIMIT`（2%）を動かしていない。**
そのため §8 が「単調な階段」と判定した実体のうち、落ちるのは閾値を超えている #14 だけ。

| §8 | 形 | ステップ | #263 で落ちるか |
|---|---|---:|---|
| **#14** | `triple_top` の**切り下がり** | **2.77%** | ✅ 落ちる（新しい向き） |
| #20 | `triple_top` の切り上がり | 1.86% | ❌ 閾値の直下。**元から見ていた向き**なので #263 とは無関係 |
| #23 | `triple_bottom` の切り上がり | 1.52% | ❌ 新しい向きだが閾値の直下 |

> **依頼文は #20 も「切り下がり」としていたが、§8 の本文は「12,302,815 → 12,357,128 → 12,531,708 の
> **単調な切り上がり 1.86%**」。** #20 は元から見ていた向きで、閾値の直下をすり抜けている。
> #263 の新しい向きに該当するのは #14 と #23 の 2 つで、うち閾値を超えるのは #14 だけ。

**#178 項目 1 Phase 2 の残差は 18 実体 → 17 実体。** 落ちたのは §8 #14
（`1hour / triple_top / 2026-08-25T02:00 + 2026-08-25T16:00`）1 件で、
**§8 が「呼べる」と判定した 3 実体（#27 / #28 / #30）は 3 件とも残差に残っている。**

## 3. 計測スクリプトの出力（そのまま）

### 7. issue #263 — 形成中 triple の単調性ゲートを両向きにした効果

`strip263`（#261 入り / #263 の両向き化なし = `main` 56432d8）→ `base`（両方入り）。#263 以前は `triple_top` の切り上がりと `triple_bottom` の切り下がりしか見ておらず、**`triple_top` の単調な切り下がりと `triple_bottom` の単調な切り上がりが素通り**していた。

#### 7-1. 新しい向きの発火

| 数え方 | 件数 |
|---|---:|
| 新しい向きの発火（延べ） | 36242 |
| 同、構造 | 470 |
| 同、実体 | 226 |
| うち `triple_top` の切り下がり（`forming_stair_step_down`） | 17092 |
| うち `triple_bottom` の切り上がり（`forming_stair_step_up`） | 19150 |

配線前（`strip263`）に accepted だった形成中 triple のうち、配線後に accepted でなくなったのは **延べ 109 件 / 構造 6 件 / 実体 3 件**。

| 指標 | 配線前（`strip263`） | 配線後（`base`） | 差 |
|---|---:|---:|---:|
| 延べ | 5818 | 5763 | -55 |
| 構造 | 99 | 100 | +1 |
| **実体** | 43 | 43 | +0 |
| 実体のうち `spreadRatio > 0.5` | 18 | 17 | -1 |
| 延べのうち `spreadRatio > 0.5` | 1051 | 978 | -73 |

#### 7-2. #178 の残差（`spreadRatio > 0.5` の実体）との突き合わせ

#261 配線後の残差（`strip263` で `spreadRatio > 0.5` の実体）を、`spreadRatio` の降順で出す。`§8` 列は `docs/internal/forming-triple-level-spread-178.md` §8 の行番号（主構成点の時刻で対応付け）。**実体は延べの OR で生き残る**（#264 の教訓）ので、実体の生死ではなく**`spreadRatio > 0.5` の延べが 1 件も残らなくなったか**で数える。

残差: **18 実体**

| # | 実体（tf / type / 主構成点の時刻） | 代表窓の `spreadRatio` | 単調性 | 全延べ 前 → 後 | 実体 | `> 0.5` の実体 |
|---:|---|---|---|---|---|---|
| 1 | 1hour / triple_top / 2026-08-24T15:00 + 2026-08-25T02:00 | 0.5545 | — | 302 → 302 | 残る | 残る |
| 2 | 4hour / triple_top / 2026-08-24T15:00 + 2026-08-25T02:00 | 0.6250 | — | 183 → 183 | 残る | 残る |
| 3 | 1hour / triple_top / 2026-08-25T02:00 + 2026-08-25T16:00 | 0.6111 | 切り下がり 2.51% | 188 → 104 | 残る | **落ちる** |
| 4 | 1hour / triple_top / 2026-08-24T19:00 + 2026-08-25T02:00 | 0.5746 | — | 162 → 162 | 残る | 残る |
| 5 | 1hour / triple_top / 2026-08-23T13:00 + 2026-08-23T21:00 | 0.5636 | 切り上がり 1.25% | 72 → 72 | 残る | 残る |
| 6 | 1hour / triple_top / 2026-08-13T05:00 + 2026-08-13T22:00 | 0.5333 | 切り下がり 1.22% | 94 → 94 | 残る | 残る |
| 7 | 1hour / triple_top / 2026-08-26T23:00 + 2026-08-27T09:00 | 0.5750 | — | 120 → 120 | 残る | 残る |
| 8 | 1hour / triple_top / 2026-08-30T00:00 + 2026-08-30T16:00 | 0.5675 | — | 54 → 54 | 残る | 残る |
| 9 | 1hour / triple_bottom / 2026-08-22T10:00 + 2026-08-23T05:00 | 0.5142 | — | 93 → 93 | 残る | 残る |
| 10 | 4hour / triple_top / 2026-08-21T23:00 + 2026-08-22T16:00 | 0.5283 | — | 498 → 498 | 残る | 残る |
| 11 | 1hour / triple_top / 2026-08-21T23:00 + 2026-08-22T16:00 | 0.5283 | — | 206 → 206 | 残る | 残る |
| 12 | 4hour / triple_top / 2026-08-27T09:00 + 2026-08-27T15:00 | 0.5134 | — | 232 → 232 | 残る | 残る |
| 13 | 1hour / triple_top / 2026-08-27T09:00 + 2026-08-27T15:00 | 0.5134 | — | 86 → 86 | 残る | 残る |
| 14 | 1hour / triple_bottom / 2026-08-31T08:00 + 2026-08-31T12:00 | 0.5411 | — | 49 → 49 | 残る | 残る |
| 15 | 1hour / triple_bottom / 2026-08-13T16:00 + 2026-08-14T14:00 | 0.5406 | — | 8 → 8 | 残る | 残る |
| 16 | 1hour / triple_top / 2026-08-21T15:00 + 2026-08-21T23:00 | 0.5203 | — | 27 → 27 | 残る | 残る |
| 17 | 1hour / triple_top / 2026-08-31T09:00 + 2026-08-31T19:00 | 0.5089 | — | 22 → 22 | 残る | 残る |
| 18 | 1hour / triple_bottom / 2026-08-22T22:00 + 2026-08-23T05:00 | 0.5060 | — | 216 → 216 | 残る | 残る |

| 集計（実体単位） | 件数 |
|---|---:|
| #261 配線後の残差 | 18 |
| #263 で `spreadRatio > 0.5` の延べが 1 件も残らなくなった | **1** |
| **#178 項目 1 Phase 2 に残る残差** | **17** |

#### 7-3. 既存の理由コードの増減（ケース単位）

**#261（最後尾に置くゲート）と違い、単調性ゲートは前段にある**ので、後段の理由コードから件数が移るのは設計どおり。ここでは「減ったケース数」を横取りの証拠として扱わず、**移った先が単調性ゲートであること**を別建てで確かめる。

| 理由コード | 配線前（延べ） | 配線後（延べ） | 増減 | 減ったケース数 |
|---|---:|---:|---:|---:|
| `forming_bars_out_of_range` | 128586 | 112635 | -15951 | 5863 |
| `forming_confidence_below_min` | 13870 | 9666 | -4204 | 3250 |
| `forming_neckline_points_insufficient` | 40825 | 37967 | -2858 | 2436 |
| `forming_peaks_below_neckline` | 1453 | 1373 | -80 | 80 |
| `forming_peaks_not_level` | 322 | 252 | -70 | 42 |
| `forming_stair_step_down` **(単調性)** | 4967 | 21953 | +16986 | 0 |
| `forming_stair_step_up` **(単調性)** | 13298 | 32389 | +19091 | 0 |
| `forming_valleys_above_neckline` | 2900 | 2888 | -12 | 12 |
| `forming_valleys_not_level` | 6163 | 6006 | -157 | 154 |
| `neckline_above_pre_decline_high` | 58394 | 55346 | -3048 | 2218 |
| `neckline_below_pre_decline_low` | 18842 | 18161 | -681 | 621 |
| `no_neckline_cross_before_trough1` | 1273 | 1101 | -172 | 172 |
| `pattern_too_small` | 282051 | 281642 | -409 | 278 |
| `peak_too_shallow` | 201248 | 194647 | -6601 | 3196 |
| `retracement_out_of_band` | 5469 | 5451 | -18 | 18 |
| `valley_too_shallow` | 179556 | 178068 | -1488 | 1390 |

単調性以外の理由コードが失った延べの合計は **35749**、単調性ゲートが得た延べは **36077**（差 328）。**ただし集計値の増減だけでは「どこへ移ったか」は言えない**ので、下で**候補単位**に突き合わせる。

##### 候補単位の遷移（集計値ではなく同一候補の追跡）

`(ケース, type, 構成点の idx)` で配線前後の候補を対応付ける。対象は**形成中 triple の候補だけ**——`type` が `triple_*` で、かつ `indices` が 3 点でその末尾が窓の最終足（形成中経路は必ず `[main1, main2, lastIdx]` を積む）。**完成済み経路を混ぜると対応が付かない**（strict / relaxed × 2 段が同じ `[a, b, c]` を積むのでキーが重複する）。それでも重複が残るものは対応が一意に決まらないので**別建てで数える**。

| 遷移（配線前 → 配線後） | 延べ |
|---|---:|
| 理由コードが変わらない | 269037 |
| **非単調性の理由 → 単調性の理由** | **35956** |
| 非単調性の理由 → 別の非単調性の理由 | **0** |
| 配線前だけに存在（候補ごと消えた） | **0** |
| 配線後だけに存在（ループが先へ進んで増えた） | 328 |
| 対応が一意に決まらない（同じキーが 1 ケース内に複数回） | 0 |

**理由コードが変わった候補は 1 件残らず単調性ゲートへ移っている。** 別の経路へ逃げた候補も、候補ごと消えた候補も 0 件——集計値の差 328 は「配線後だけに存在」328 件の内数で、ゲートの `continue` でループが先の（より古い）ペアまで回るぶん（§3-1 / §6-2 と同じ構造）。

依頼文が名指しした「理由が移る候補」の実測値（**横取りではなく、前段のゲートへの設計どおりの帰属変更**）:

| 移動元の理由コード | 配線前（延べ） | 配線後（延べ） | 差 |
|---|---:|---:|---:|
| `forming_peaks_not_level` | 322 | 252 | -70 |
| `forming_valleys_not_level` | 6163 | 6006 | -157 |
| `forming_peaks_below_neckline` | 1453 | 1373 | -80 |
| `forming_valleys_above_neckline` | 2900 | 2888 | -12 |

#### 7-4. 標準コーパス 800（合成 704 + 実データ A 96）の差分

全 800 ケース中、新しい向きが発火したのは **32 件**。何かが動いたケースは **32**、そのうち **`data.patterns` が動いたのは 0 ケース**。

**`data.patterns` は 1 ケースも動かない。** 動くのは `view=debug` の理由コードの帰属だけで、落ちる候補の集合は変わらない——**その候補は元から別の理由で落ちていた**（下の `移動元` 列）。

| # | 系列 | tf | sd | オプション（F/C/I） | `patterns` 前 → 後 | 移動元の理由コード |
|---:|---|---|---|---|---|---|
| 1 | descending_triangle_invalid | 1day | 2 | 100 | 0 → 0 | `forming_bars_out_of_range` |
| 2 | descending_triangle_invalid | 1day | 2 | 110 | 0 → 0 | `forming_bars_out_of_range` |
| 3 | descending_triangle_invalid | 1day | 2 | 101 | 0 → 0 | `forming_bars_out_of_range` |
| 4 | descending_triangle_invalid | 1day | 2 | 111 | 0 → 0 | `forming_bars_out_of_range` |
| 5 | descending_triangle_invalid | 1day | 3 | 100 | 0 → 0 | `forming_bars_out_of_range` |
| 6 | descending_triangle_invalid | 1day | 3 | 110 | 0 → 0 | `forming_bars_out_of_range` |
| 7 | descending_triangle_invalid | 1day | 3 | 101 | 0 → 0 | `forming_bars_out_of_range` |
| 8 | descending_triangle_invalid | 1day | 3 | 111 | 0 → 0 | `forming_bars_out_of_range` |
| 9 | descending_triangle_invalid | 1hour | 2 | 100 | 1 → 1 | `forming_bars_out_of_range` |
| 10 | descending_triangle_invalid | 1hour | 2 | 110 | 1 → 1 | `forming_bars_out_of_range` |
| 11 | descending_triangle_invalid | 1hour | 2 | 101 | 1 → 1 | `forming_bars_out_of_range` |
| 12 | descending_triangle_invalid | 1hour | 2 | 111 | 1 → 1 | `forming_bars_out_of_range` |
| 13 | descending_triangle_invalid | 1hour | 3 | 100 | 1 → 1 | `forming_bars_out_of_range` |
| 14 | descending_triangle_invalid | 1hour | 3 | 110 | 1 → 1 | `forming_bars_out_of_range` |
| 15 | descending_triangle_invalid | 1hour | 3 | 101 | 1 → 1 | `forming_bars_out_of_range` |
| 16 | descending_triangle_invalid | 1hour | 3 | 111 | 1 → 1 | `forming_bars_out_of_range` |
| 17 | forming_triple_bottom | 1day | 2 | 100 | 1 → 1 | `forming_bars_out_of_range` |
| 18 | forming_triple_bottom | 1day | 2 | 110 | 1 → 1 | `forming_bars_out_of_range` |
| 19 | forming_triple_bottom | 1day | 2 | 101 | 1 → 1 | `forming_bars_out_of_range` |
| 20 | forming_triple_bottom | 1day | 2 | 111 | 1 → 1 | `forming_bars_out_of_range` |
| 21 | forming_triple_bottom | 1day | 3 | 100 | 1 → 1 | `forming_bars_out_of_range` |
| 22 | forming_triple_bottom | 1day | 3 | 110 | 1 → 1 | `forming_bars_out_of_range` |
| 23 | forming_triple_bottom | 1day | 3 | 101 | 1 → 1 | `forming_bars_out_of_range` |
| 24 | forming_triple_bottom | 1day | 3 | 111 | 1 → 1 | `forming_bars_out_of_range` |
| 25 | forming_triple_bottom | 1hour | 2 | 100 | 1 → 1 | `forming_bars_out_of_range` |
| 26 | forming_triple_bottom | 1hour | 2 | 110 | 1 → 1 | `forming_bars_out_of_range` |
| 27 | forming_triple_bottom | 1hour | 2 | 101 | 1 → 1 | `forming_bars_out_of_range` |
| 28 | forming_triple_bottom | 1hour | 2 | 111 | 1 → 1 | `forming_bars_out_of_range` |
| 29 | forming_triple_bottom | 1hour | 3 | 100 | 1 → 1 | `forming_bars_out_of_range` |
| 30 | forming_triple_bottom | 1hour | 3 | 110 | 1 → 1 | `forming_bars_out_of_range` |
| 31 | forming_triple_bottom | 1hour | 3 | 101 | 1 → 1 | `forming_bars_out_of_range` |
| 32 | forming_triple_bottom | 1hour | 3 | 111 | 1 → 1 | `forming_bars_out_of_range` |

#### 7-5. `view=debug` の cap（200 件）への影響

| 母集団 | ケース | 飽和ケース（前） | 飽和ケース（後） | 新しい向きが cap 内 / 全延べ |
|---|---:|---:|---:|---|
| 標準コーパス 800（合成 704 + 実データ A 96） | 800 | 0 | 0 | 32 / 32 (100.0%) |
| 実データ B 96（`btc_jpy_1hour_2026_08`） | 96 | 56 | 56 | 64 / 212 (30.2%) |
| 実データ C 96（`btc_jpy_1hour_2026_09`） | 96 | 44 | 44 | 168 / 284 (59.2%) |
| 実データ D 96（`btc_jpy_1hour_2026_09_05`） | 96 | 44 | 44 | 108 / 212 (50.9%) |
| ローリング窓 3672（`btc_jpy_1hour_2026_08` の末尾 60〜365 本 × 時間足 3 × swingDepth 4） | 3672 | 1045 | 1045 | 4839 / 6036 (80.2%) |
| ローリング窓 3672（`btc_jpy_1hour_2026_09` の末尾 60〜365 本 × 時間足 3 × swingDepth 4） | 3672 | 956 | 956 | 11364 / 14391 (79.0%) |
| ローリング窓 3672（`btc_jpy_1hour_2026_09_05` の末尾 60〜365 本 × 時間足 3 × swingDepth 4） | 3672 | 1039 | 1039 | 11894 / 15075 (78.9%) |
