# triple 完成済み 4 経路の target 進捗配線（issue #228・実測ログ）

[issue #228](https://github.com/tjackiet/bitbank-lab-mcp/issues/228) として、
`tools/patterns/detect_triples.ts` の**完成済み 4 経路**（strict / relaxed × top / bottom）で
`omittedTargetReach('not_computed_by_detector')` を `computeTargetReach(...)` に置き換えた。
**閾値・定数は 1 つも変えていない。** 本ログは「同じ族だから同じ定数でよい」を
仮説のままにしないための実測（#198 の時間足別テーブル流用と同じ事故を避ける）。

再実行:

```bash
npx tsx scripts/measure_triple_target_reach_228.ts
```

## 結論（断定）

1. **`MIN_TARGET_DISTANCE_HEIGHT_RATIO`（0.15）は triple では一度も発火しない。**
   比 `|target − breakoutPrice| / patternHeight` の下限は **0.8160**（実データ B ネイティブ）で、
   H&S / doubles の下側の裾（0.0033 / 0.0068 / 0.0121 …）とは分布そのものが別物。
   **`MIN_TARGET_DISTANCE_HEIGHT_RATIO` は triple にとって現状 no-op。**
2. **triple 側に「膝」は無い。** H&S / doubles は 0.12 を越えたところで残る `targetReachedPct` の
   最大値が 13,928% → 817% に落ちた（そこが閾値を選んだ根拠）。triple は閾値を 0.82 / 0.89 / 1.03 と
   上げて構造を 5 / 7 / 12 件と除外しても、**残る最大値は 623% のまま動かない**——
   除外しても何も改善しないので、**triple 用に別の値を置く根拠が無い。0.15 を据え置く。**
3. **`TARGET_REACHED_PCT_CAP`（999）に当たる行は 0。** 最大は実データ B ネイティブで 289%、
   補助スイープ（1min ラベル）の外れ値を入れても 623%。安全網としての位置づけは変わらない。
4. **`TARGET_REACH_MAX_BARS`（60 本）は triple の構造に対して十分。** triple の構成バー数は
   実データ B ネイティブで 30〜42（p50 36）、補助スイープ込みで 23〜42（`periodScoreBars` の
   バケット境界 `[12, 18, 26]` の上側に寄る）。ブレイク足の後ろに取れる足数は p50 84 本で、
   **60 本ぶんの先が揃う構造が実データ B で 100%**。しかも初到達までのバー数は実データ B の
   全構造で **0 本**（ブレイク足自身の high / low が既に target を越えている）なので、
   窓を伸ばしても縮めても `targetReached` は動かない。
5. **実データ A（`btc_jpy` 1day）は完成済み triple が 0 件。** #227 Phase 1 と同じ結果で、
   **1day 側は「問題なし」ではなく「材料が無い」。** プールした値から 1day の結論を書かない（#219）。
6. **配線されたのは 4 経路だが、本コーパスで走ったのは strict の 2 経路だけ。**
   13 構造すべてが strict（`_fallback` 無し）。relaxed が accept するのは同 type の strict が
   0 件のときだけで、本コーパスでは 1 度も起きない（#204 / #227 の結論と同じ）。
   **relaxed 2 経路の配線は実測で裏づいていない**——コードの形が strict と同一であること
   （同じ `computeTargetReach` の呼び出し・同じ引数の組み方）でしか担保していない。

## 判定フィールドの不変（受け入れ条件）

配線前後で `detectTriples()` の出力を 940 ケース全件ダンプし、target 進捗系 5 キー
（`targetReachedPct` / `targetReached` / `targetReachedDate` / `targetReachedPrice` /
`targetProgressOmittedReason`）を除いて比較した結果、**200 パターンがバイト単位で完全一致**。
件数・`pivots`・`confidence`・`status`・`breakoutTarget`・`neckline`・`structureGate` は動いていない。

既定オプションの回帰ベースライン（`tests/fixtures/detect_patterns_1hour_data_patterns_baseline.json`）は
#216 / #218 以降 triple を 1 件も含まない（H&S 系 4 / wedge 4 / triangle 4）ので、**更新していない**。

## 計測条件

| 項目 | 値 |
|---|---|
| 計測日 | 2026-09-04 |
| 対象 | `detectTriples(ctx)` を**検出器層で直接**呼ぶ（`data.patterns` は `globalDedup` と #218 の triple×H&S 排他で完成済み triple が消えることがあるため） |
| コーパス | **標準コーパス 800**（合成 704 + 実データ A 96）**＋ 実データ B 96 ＋ 補助スイープ 44**（実データ B × 全 11 時間足 × `swingDepth` 4 種）= **940 ケース**。#205 / #206 / #210 / #216 / #227 と同じ組み方 |
| 生の行数 | 完成済み triple **72 行**（= 配線前に `not_computed_by_detector` を名乗っていた行数と一致） |
| 構造単位 | 系列 × tf × type × `breakoutIdx` × `target` で重複排除して **13 件**（同上） |

「時間足」はリサンプリングではなく**パラメータのラベル**（#204 / #205 と同じ限界）。
解釈の錨はネイティブ時間足（実データ B × `1hour`、実データ A × `1day`）に置く。

---

計測日: 2026-09-04 / コーパス **940 ケース** / 完成済み triple の生の行数 **72** / 構造単位 **13**

定数は 1 つも変えていない（現行値: `MIN_TARGET_DISTANCE_HEIGHT_RATIO` = 0.15 / `TARGET_REACHED_PCT_CAP` = 999 / `TARGET_REACH_MAX_BARS` = 60）。

## 計測 1: `MIN_TARGET_DISTANCE_HEIGHT_RATIO`（0.15）の発火率

| 母集団 | 生の行数 | うち退化ガード発火 | 発火率 | 構造単位 | うち発火 | 発火率 |
|---|---:|---:|---:|---:|---:|---:|
| 標準コーパス 800（合成 704 + 実データ A 96） | 32 | 0 | 0.0% | 2 | 0 | 0.0% |
| 　うち合成 704 | 32 | 0 | 0.0% | 2 | 0 | 0.0% |
| 　うち実データ A 96（`btc_jpy` 1day） | 0 | 0 | — | 0 | 0 | — |
| 実データ B 96（`btc_jpy` 1hour。別建て） | 24 | 0 | 0.0% | 2 | 0 | 0.0% |
| 補助スイープ 44（実データ B × 全 11 時間足） | 16 | 0 | 0.0% | 11 | 0 | 0.0% |

### ネイティブ時間足（プールしない）

| 母集団 | 生の行数 | うち退化ガード発火 | 発火率 | 構造単位 | うち発火 | 発火率 |
|---|---:|---:|---:|---:|---:|---:|
| **実データ B ネイティブ**（1hour × 1hour） | 24 | 0 | 0.0% | 2 | 0 | 0.0% |
| **実データ A ネイティブ**（1day × 1day） | 0 | 0 | — | 0 | 0 | — |

## 計測 2: `|target − breakoutPrice| / patternHeight` の分布（構造単位）

| 母集団 | n（構造単位） | min | p05 | p10 | p25 | **p50** | p75 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 標準コーパス 800（合成 704 + 実データ A 96） | 2 | 0.8807 | 0.8807 | 0.8807 | 0.8807 | **0.8807** | 0.8807 | 0.8807 |
| 　うち合成 704 | 2 | 0.8807 | 0.8807 | 0.8807 | 0.8807 | **0.8807** | 0.8807 | 0.8807 |
| 　うち実データ A 96（`btc_jpy` 1day） | 0 | — | — | — | — | — | — | — |
| 実データ B 96（`btc_jpy` 1hour。別建て） | 2 | 0.8160 | 0.8263 | 0.8366 | 0.8675 | **0.9191** | 0.9706 | 1.0222 |
| 補助スイープ 44（実データ B × 全 11 時間足） | 11 | 0.8160 | 0.8160 | 0.8160 | 0.8160 | **1.0222** | 1.0222 | 3.9681 |

| 母集団 | n（構造単位） | min | p05 | p10 | p25 | **p50** | p75 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **実データ B ネイティブ**（1hour × 1hour） | 2 | 0.8160 | 0.8263 | 0.8366 | 0.8675 | **0.9191** | 0.9706 | 1.0222 |
| **実データ A ネイティブ**（1day × 1day） | 0 | — | — | — | — | — | — | — |

### 下側の並び（構造単位・小さい順に 20 件）

| # | 比 | 母集団 | 系列 | tf | type | 経路 | breakoutIdx | 出力 |
|---:|---:|---|---|---|---|---|---:|---|
| 1 | 0.8160 | realB | btc_jpy_1hour_2026_08 | 1hour | triple_bottom | strict | 280 | 289% |
| 2 | 0.8160 | sweepB | btc_jpy_1hour_2026_08 | 1min | triple_bottom | strict | 280 | 289% |
| 3 | 0.8160 | sweepB | btc_jpy_1hour_2026_08 | 5min | triple_bottom | strict | 280 | 289% |
| 4 | 0.8160 | sweepB | btc_jpy_1hour_2026_08 | 15min | triple_bottom | strict | 280 | 289% |
| 5 | 0.8160 | sweepB | btc_jpy_1hour_2026_08 | 30min | triple_bottom | strict | 280 | 289% |
| 6 | 0.8807 | synthetic | completed_triple_top | 1day | triple_top | strict | 26 | 119% |
| 7 | 0.8807 | synthetic | completed_triple_top | 1hour | triple_top | strict | 26 | 119% |
| 8 | 1.0222 | realB | btc_jpy_1hour_2026_08 | 1hour | triple_bottom | strict | 280 | 248% |
| 9 | 1.0222 | sweepB | btc_jpy_1hour_2026_08 | 1min | triple_bottom | strict | 280 | 248% |
| 10 | 1.0222 | sweepB | btc_jpy_1hour_2026_08 | 5min | triple_bottom | strict | 280 | 248% |
| 11 | 1.0222 | sweepB | btc_jpy_1hour_2026_08 | 15min | triple_bottom | strict | 280 | 248% |
| 12 | 1.0222 | sweepB | btc_jpy_1hour_2026_08 | 30min | triple_bottom | strict | 280 | 248% |
| 13 | 3.9681 | sweepB | btc_jpy_1hour_2026_08 | 1min | triple_bottom | strict | 115 | 623% |

### 閾値スイープ（膝を探す。全母集団の構造単位）

| 閾値 | 除外（構造単位） | 残る `targetReachedPct` の最大値 |
|---:|---:|---:|
| 0.00 | 0 | 623% |
| 0.82 | 5 | 623% |
| 0.89 | 7 | 623% |
| 1.03 | 12 | 623% |

## 計測 3: `TARGET_REACHED_PCT_CAP`（999）に当たった件数

| 母集団 | 測れた行 | `>= 999` | 構造単位 | 測れた構造の pct 最大 |
|---|---:|---:|---:|---:|
| 標準コーパス 800（合成 704 + 実データ A 96） | 32 | 0 | 0 | 119% |
| 　うち合成 704 | 32 | 0 | 0 | 119% |
| 　うち実データ A 96（`btc_jpy` 1day） | 0 | 0 | 0 | — |
| 実データ B 96（`btc_jpy` 1hour。別建て） | 24 | 0 | 0 | 289% |
| 補助スイープ 44（実データ B × 全 11 時間足） | 16 | 0 | 0 | 623% |

| 母集団 | 測れた行 | `>= 999` | 構造単位 | 測れた構造の pct 最大 |
|---|---:|---:|---:|---:|
| **実データ B ネイティブ**（1hour × 1hour） | 24 | 0 | 0 | 289% |
| **実データ A ネイティブ**（1day × 1day） | 0 | 0 | 0 | — |

## 計測 4: `TARGET_REACH_MAX_BARS`（60 本）が揃う構造の割合

`periodScoreBars` のバケット境界は `[12, 18, 26]`（バー数）。「構成バー数」は主構成点（3 山 / 3 谷）の張るバー数 = `periodScoreBars` の入力そのもの。

| 母集団 | 構造単位 | 60 本先が揃う | 割合 | ブレイク後の足数 p50 | 構成バー数 p50 | 構成バー数 min–max | 初到達バー数 p50 / p95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 標準コーパス 800（合成 704 + 実データ A 96） | 2 | 0 | 0.0% | 3 | 18 | 18–18 | 3 / 3 |
| 　うち合成 704 | 2 | 0 | 0.0% | 3 | 18 | 18–18 | 3 / 3 |
| 　うち実データ A 96（`btc_jpy` 1day） | 0 | — | — | — | — | — | — |
| 実データ B 96（`btc_jpy` 1hour。別建て） | 2 | 2 | 100.0% | 84 | 36 | 30–42 | 0 / 0 |
| 補助スイープ 44（実データ B × 全 11 時間足） | 11 | 11 | 100.0% | 84 | 30 | 23–42 | 0 / 0 |

| 母集団 | 構造単位 | 60 本先が揃う | 割合 | ブレイク後の足数 p50 | 構成バー数 p50 | 構成バー数 min–max | 初到達バー数 p50 / p95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| **実データ B ネイティブ**（1hour × 1hour） | 2 | 2 | 100.0% | 84 | 36 | 30–42 | 0 / 0 |
| **実データ A ネイティブ**（1day × 1day） | 0 | — | — | — | — | — | — |

## 参考: 構造単位の全件（母集団が小さいので全部出す）

| # | 母集団 | 系列 | tf | sd | type | 経路 | 構成バー | breakoutIdx | ブレイク後 | 60本 | 高さ | 距離 | 比 | pct | 到達 | 初到達 |
|---:|---|---|---|---|---|---|---:|---:|---:|:-:|---:|---:|---:|---:|:-:|---:|
| 1 | realB | btc_jpy_1hour_2026_08 | 1hour | 6 | triple_bottom | strict | 42 | 280 | 84 | YES | 147832 | 120626 | 0.8160 | 289% | YES | 0 |
| 2 | sweepB | btc_jpy_1hour_2026_08 | 1min | 6 | triple_bottom | strict | 42 | 280 | 84 | YES | 147832 | 120626 | 0.8160 | 289% | YES | 0 |
| 3 | sweepB | btc_jpy_1hour_2026_08 | 5min | 6 | triple_bottom | strict | 42 | 280 | 84 | YES | 147832 | 120626 | 0.8160 | 289% | YES | 0 |
| 4 | sweepB | btc_jpy_1hour_2026_08 | 15min | 6 | triple_bottom | strict | 42 | 280 | 84 | YES | 147832 | 120626 | 0.8160 | 289% | YES | 0 |
| 5 | sweepB | btc_jpy_1hour_2026_08 | 30min | 6 | triple_bottom | strict | 42 | 280 | 84 | YES | 147832 | 120626 | 0.8160 | 289% | YES | 0 |
| 6 | synthetic | completed_triple_top | 1day | 2 | triple_top | strict | 18 | 26 | 3 | — | 18 | 16 | 0.8807 | 119% | YES | 3 |
| 7 | synthetic | completed_triple_top | 1hour | 2 | triple_top | strict | 18 | 26 | 3 | — | 18 | 16 | 0.8807 | 119% | YES | 3 |
| 8 | realB | btc_jpy_1hour_2026_08 | 1hour | auto | triple_bottom | strict | 30 | 280 | 84 | YES | 137319 | 140363 | 1.0222 | 248% | YES | 0 |
| 9 | sweepB | btc_jpy_1hour_2026_08 | 1min | 3 | triple_bottom | strict | 30 | 280 | 84 | YES | 137319 | 140363 | 1.0222 | 248% | YES | 0 |
| 10 | sweepB | btc_jpy_1hour_2026_08 | 5min | 3 | triple_bottom | strict | 30 | 280 | 84 | YES | 137319 | 140363 | 1.0222 | 248% | YES | 0 |
| 11 | sweepB | btc_jpy_1hour_2026_08 | 15min | auto | triple_bottom | strict | 30 | 280 | 84 | YES | 137319 | 140363 | 1.0222 | 248% | YES | 0 |
| 12 | sweepB | btc_jpy_1hour_2026_08 | 30min | auto | triple_bottom | strict | 30 | 280 | 84 | YES | 137319 | 140363 | 1.0222 | 248% | YES | 0 |
| 13 | sweepB | btc_jpy_1hour_2026_08 | 1min | auto | triple_bottom | strict | 23 | 115 | 249 | YES | 33700 | 133723 | 3.9681 | 623% | YES | 0 |

## 参考: 理由コード別の内訳（生の行数）

| 母集団 | `（測れた）` |
|---|---:|
| 標準コーパス 800（合成 704 + 実データ A 96） | 32 |
| 　うち合成 704 | 32 |
| 　うち実データ A 96（`btc_jpy` 1day） | 0 |
| 実データ B 96（`btc_jpy` 1hour。別建て） | 24 |
| 補助スイープ 44（実データ B × 全 11 時間足） | 16 |
| **実データ B ネイティブ**（1hour × 1hour） | 24 |
| **実データ A ネイティブ**（1day × 1day） | 0 |

