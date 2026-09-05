# 反転パターンの「最終構成点 → ブレイク」経路の実測（issue #242 Phase 1）

`scripts/measure_reversal_path_242.ts` の出力をそのまま貼ったもの（**実装より先に、
`main`（PR #241 マージ時点）の 3 検出器に対して取得**）。判定は `structural.ts` の
`detectPivotBeforeBreakout` / `detectTroughZoneReentry` の**本物**を呼んでいる
——計測用の再実装を作ると「測った判定」と「入れた判定」がずれても誰も気づかない。

## 読み方

- **母集団** = 完成済み 12 経路（double 4 / triple 4 / H&S 4）で、既存の棄却検査をすべて
  通過し、ブレイクが確定した候補。**ここがゲートを置く位置そのもの**なので、
  「棄却理由の帰属が変わる候補」は定義上 0 件（後述の検算で確認）。
- **構造** = `(系列, 時間足, type, 経路, 構成点 idx, ブレイク idx)` で畳んだ単位。
  オプション 8 通り・同じピボット列を生む `swingDepth` の重複を除く。
- コーパスは **プールしない**（#219）。標準 800 / 実データ B / 実データ C を別表で見る。
- **実データ D（`btc_jpy_1hour_2026_09_05`）は本計測に入っていない。** 取得環境から
  bitbank public API へ到達できず fixture を追加できていない（`scripts/measure_reversal_path_242.ts`
  は fixture が置かれれば自動的に 4 つ目の表を出す）。

## 結論（実装の判断）

| # | 結論 |
|---|---|
| 1 | **double の経路ゲート（PR 1）で落ちるのは実データ C の 1 構造だけ**（延べ 16 / 384）。標準コーパス・実データ B は 0 件。起票時のライブ実例と同型（山2 の後に山を 1 つ作ってから割る） |
| 2 | **triple / H&S の経路ゲート（PR 2）は実データ C で `head_and_shoulders` −56 / `triple_top` −12**（延べ）。標準コーパスでは type 別の増減 0 だが **20 行が入れ替わる**（下記） |
| 3 | **再進入チェックの横展開（PR 2）は標準コーパスの 4 構造だけ**。実データ B / C は 0 件。経路ゲートと**別の形**を捕まえている（両方に当たる構造は標準コーパスに 2 件） |
| 4 | **棄却理由の帰属が変わる候補は 0 件**。ゲートは各経路の最後に置いてあり、記録位置がそれと一致している |
| 5 | **増えた type は無い。** 標準コーパスの `inverse_head_and_shoulders` は件数が同じまま構造が入れ替わる——`findStrictInverseHS` は肩の組を総当たりするので、1 つ落ちると**同じ頭・同じ谷を共有する別の右肩の窓**が `globalDedup` を勝ち抜いて出てくる（下の removed / added を突き合わせると `…-53-56` → `…-53-80` のように右肩だけが動いている）。**新しい形が生まれているのではなく、同じ構造の右肩の取り方が 1 つ後ろにずれている** |

## 再現

```bash
npx tsx scripts/measure_reversal_path_242.ts
npx tsx scripts/measure_reversal_path_242.ts --json /tmp/242.json
```

**実装後に走らせると数値は出ない。** ゲートが本物の検出器に入っているぶん母集団が
「本物のゲートを通過した候補」に変わり、注入したゲートは冪等な no-op になる
（＝冪等性の検算にはなるが Phase 1 の差分は再現しない）。本ページの数値は
**#241 マージ時点の `main`** で取得したもの。

---

判定は `structural.ts` の `detectPivotBeforeBreakout` / `detectTroughZoneReentry` をそのまま呼ぶ。3 検出器のソースは 1 行も変更していない——記録フックと試算用のゲートは実行時に生成した複製にだけ効く。

## 0. ハーネスと検算

| 項目 | 値 |
|---|---:|
| ケース数 | 992 |
| ゲート位置に到達した候補（延べ） | 1608 |
| **記録フック版が本物の検出器と食い違ったケース** | **0** |
| accepted 合計（ゲート無し） | 1176 |

記録フック版は全ケースで本物の 3 検出器と JSON 全キー一致した。以降の差分はすべて注入したゲートによるもの。

**棄却理由の帰属**: 記録位置＝ゲートを置く位置＝既存の棄却検査をすべて通過した後なので、ここに記録された候補は現状すべて出力まで到達している。したがって既存の理由コードを横取りする候補は **0 件**（下の「計測 2 の構造数」と「removed の件数」が一致することが検算）。

## 標準コーパス 800（合成 704 + 実データ A 96）（800 ケース）

### 母集団（ゲート位置に到達した候補）

| type / 経路 | 延べ行 | 構造 | 間に同種ピボット有り（構造） | ゾーン再進入（構造） |
|---|---:|---:|---:|---:|
| double_bottom / strict | 120 | 7 | 0 | 0 |
| double_top / strict | 72 | 4 | 0 | 0 |
| head_and_shoulders / strict | 32 | 2 | 0 | 0 |
| inverse_head_and_shoulders / strict | 328 | 22 | 9 | 4 |
| triple_top / strict | 32 | 2 | 0 | 0 |
| **合計** | **584** | **37** | **9** | **4** |

| 時間足 | 構造 | 間に同種ピボット有り | ゾーン再進入 |
|---|---:|---:|---:|
| 1day | 5 | 0 | 0 |
| 1hour | 21 | 5 | 2 |
| 4hour | 11 | 4 | 2 |

### 計測 2: 経路ゲートで落ちる候補（間に同種ピボットがある構造）

- **inverse_head_and_shoulders / strict** — `btc_jpy_1day_2026` / 4hour / swingDepth=2
  - 構成点 idx: `[20, 24, 27, 53, 56]` / 最終構成点 56 → ブレイク 83
  - 間の同種ピボット: idx 66（2026-08-03T00:00:00.000Z / 終値 10,002,960 / 高安 9,752,246） , idx 77（2026-08-14T00:00:00.000Z / 終値 10,044,907 / 高安 9,955,830） , idx 80（2026-08-17T00:00:00.000Z / 終値 10,278,279 / 高安 9,984,837）
  - ゾーン再進入: あり（idx 63, level 10,186,870）
- **inverse_head_and_shoulders / strict** — `btc_jpy_1day_2026` / 4hour / swingDepth=2
  - 構成点 idx: `[20, 24, 27, 53, 66]` / 最終構成点 66 → ブレイク 83
  - 間の同種ピボット: idx 77（2026-08-14T00:00:00.000Z / 終値 10,044,907 / 高安 9,955,830） , idx 80（2026-08-17T00:00:00.000Z / 終値 10,278,279 / 高安 9,984,837）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1day_2026` / 4hour / swingDepth=2
  - 構成点 idx: `[20, 24, 27, 53, 77]` / 最終構成点 77 → ブレイク 83
  - 間の同種ピボット: idx 80（2026-08-17T00:00:00.000Z / 終値 10,278,279 / 高安 9,984,837）
  - ゾーン再進入: あり（idx 78, level 10,119,373）
- **inverse_head_and_shoulders / strict** — `btc_jpy_1day_2026` / 4hour / swingDepth=3
  - 構成点 idx: `[13, 17, 27, 53, 66]` / 最終構成点 66 → ブレイク 83
  - 間の同種ピボット: idx 77（2026-08-14T00:00:00.000Z / 終値 10,044,907 / 高安 9,955,830）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1day_2026` / 1hour / swingDepth=auto
  - 構成点 idx: `[20, 24, 27, 53, 66]` / 最終構成点 66 → ブレイク 83
  - 間の同種ピボット: idx 77（2026-08-14T00:00:00.000Z / 終値 10,044,907 / 高安 9,955,830）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1day_2026` / 1hour / swingDepth=auto
  - 構成点 idx: `[13, 17, 27, 53, 66]` / 最終構成点 66 → ブレイク 83
  - 間の同種ピボット: idx 77（2026-08-14T00:00:00.000Z / 終値 10,044,907 / 高安 9,955,830）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1day_2026` / 1hour / swingDepth=auto
  - 構成点 idx: `[7, 17, 27, 53, 66]` / 最終構成点 66 → ブレイク 83
  - 間の同種ピボット: idx 77（2026-08-14T00:00:00.000Z / 終値 10,044,907 / 高安 9,955,830）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1day_2026` / 1hour / swingDepth=2
  - 構成点 idx: `[20, 24, 27, 47, 49]` / 最終構成点 49 → ブレイク 53
  - 間の同種ピボット: idx 52（2026-07-20T00:00:00.000Z / 終値 10,584,954 / 高安 10,355,755）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1day_2026` / 1hour / swingDepth=2
  - 構成点 idx: `[20, 24, 27, 53, 56]` / 最終構成点 56 → ブレイク 83
  - 間の同種ピボット: idx 66（2026-08-03T00:00:00.000Z / 終値 10,002,960 / 高安 9,752,246） , idx 77（2026-08-14T00:00:00.000Z / 終値 10,044,907 / 高安 9,955,830） , idx 80（2026-08-17T00:00:00.000Z / 終値 10,278,279 / 高安 9,984,837）
  - ゾーン再進入: あり（idx 63, level 10,186,870）

### 計測 3: 再進入チェックの横展開で落ちる候補（triple / H&S。ゾーン再進入がある構造）

- **inverse_head_and_shoulders / strict** — `btc_jpy_1day_2026` / 4hour / swingDepth=2
  - 構成点 idx: `[20, 24, 27, 53, 56]` / 最終構成点 56 → ブレイク 83
  - 間の同種ピボット: idx 66（2026-08-03T00:00:00.000Z / 終値 10,002,960 / 高安 9,752,246） , idx 77（2026-08-14T00:00:00.000Z / 終値 10,044,907 / 高安 9,955,830） , idx 80（2026-08-17T00:00:00.000Z / 終値 10,278,279 / 高安 9,984,837）
  - ゾーン再進入: あり（idx 63, level 10,186,870）
- **inverse_head_and_shoulders / strict** — `btc_jpy_1day_2026` / 4hour / swingDepth=2
  - 構成点 idx: `[20, 24, 27, 53, 77]` / 最終構成点 77 → ブレイク 83
  - 間の同種ピボット: idx 80（2026-08-17T00:00:00.000Z / 終値 10,278,279 / 高安 9,984,837）
  - ゾーン再進入: あり（idx 78, level 10,119,373）
- **inverse_head_and_shoulders / strict** — `btc_jpy_1day_2026` / 1hour / swingDepth=auto
  - 構成点 idx: `[20, 24, 27, 53, 77]` / 最終構成点 77 → ブレイク 83
  - 間の同種ピボット: なし
  - ゾーン再進入: あり（idx 78, level 10,119,373）
- **inverse_head_and_shoulders / strict** — `btc_jpy_1day_2026` / 1hour / swingDepth=2
  - 構成点 idx: `[20, 24, 27, 53, 56]` / 最終構成点 56 → ブレイク 83
  - 間の同種ピボット: idx 66（2026-08-03T00:00:00.000Z / 終値 10,002,960 / 高安 9,752,246） , idx 77（2026-08-14T00:00:00.000Z / 終値 10,044,907 / 高安 9,955,830） , idx 80（2026-08-17T00:00:00.000Z / 終値 10,278,279 / 高安 9,984,837）
  - ゾーン再進入: あり（idx 63, level 10,186,870）

### 計測 4: ゲート別の accepted 増減

**経路ゲート / double のみ（PR 1）** — accepted 延べ 404（差分 removed 0 / added 0）

| type | before | after | 増減 |
|---|---:|---:|---:|
| （type 別の増減なし） | | | 0 |

**経路ゲート / triple + H&S（PR 2）** — accepted 延べ 404（差分 removed 20 / added 20）

| type | before | after | 増減 |
|---|---:|---:|---:|
| （type 別の増減なし） | | | 0 |

- removed（構造）: `btc_jpy_1day_2026/1hour inverse_head_and_shoulders 13-17-27-53-66` , `btc_jpy_1day_2026/1hour inverse_head_and_shoulders 20-24-27-53-56` , `btc_jpy_1day_2026/4hour inverse_head_and_shoulders 13-17-27-53-66` , `btc_jpy_1day_2026/4hour inverse_head_and_shoulders 20-24-27-53-56`
- added（構造）: `btc_jpy_1day_2026/1hour inverse_head_and_shoulders 13-17-27-53-77` , `btc_jpy_1day_2026/1hour inverse_head_and_shoulders 20-24-27-53-80` , `btc_jpy_1day_2026/4hour inverse_head_and_shoulders 13-17-27-53-77` , `btc_jpy_1day_2026/4hour inverse_head_and_shoulders 20-24-27-53-80`

**再進入チェック横展開 / triple + H&S（PR 2）** — accepted 延べ 404（差分 removed 8 / added 8）

| type | before | after | 増減 |
|---|---:|---:|---:|
| （type 別の増減なし） | | | 0 |

- removed（構造）: `btc_jpy_1day_2026/1hour inverse_head_and_shoulders 20-24-27-53-56` , `btc_jpy_1day_2026/4hour inverse_head_and_shoulders 20-24-27-53-56`
- added（構造）: `btc_jpy_1day_2026/1hour inverse_head_and_shoulders 20-24-27-53-80` , `btc_jpy_1day_2026/4hour inverse_head_and_shoulders 20-24-27-53-80`

**全部（経路 + 再進入横展開）** — accepted 延べ 404（差分 removed 20 / added 20）

| type | before | after | 増減 |
|---|---:|---:|---:|
| （type 別の増減なし） | | | 0 |

- removed（構造）: `btc_jpy_1day_2026/1hour inverse_head_and_shoulders 13-17-27-53-66` , `btc_jpy_1day_2026/1hour inverse_head_and_shoulders 20-24-27-53-56` , `btc_jpy_1day_2026/4hour inverse_head_and_shoulders 13-17-27-53-66` , `btc_jpy_1day_2026/4hour inverse_head_and_shoulders 20-24-27-53-56`
- added（構造）: `btc_jpy_1day_2026/1hour inverse_head_and_shoulders 13-17-27-53-77` , `btc_jpy_1day_2026/1hour inverse_head_and_shoulders 20-24-27-53-80` , `btc_jpy_1day_2026/4hour inverse_head_and_shoulders 13-17-27-53-77` , `btc_jpy_1day_2026/4hour inverse_head_and_shoulders 20-24-27-53-80`

## 実データ B 96（`btc_jpy_1hour_2026_08`）（96 ケース）

### 母集団（ゲート位置に到達した候補）

| type / 経路 | 延べ行 | 構造 | 間に同種ピボット有り（構造） | ゾーン再進入（構造） |
|---|---:|---:|---:|---:|
| inverse_head_and_shoulders / strict | 296 | 21 | 7 | 0 |
| triple_bottom / strict | 24 | 2 | 0 | 0 |
| **合計** | **320** | **23** | **7** | **0** |

| 時間足 | 構造 | 間に同種ピボット有り | ゾーン再進入 |
|---|---:|---:|---:|
| 1hour | 23 | 7 | 0 |

### 計測 2: 経路ゲートで落ちる候補（間に同種ピボットがある構造）

- **inverse_head_and_shoulders / strict** — `btc_jpy_1hour_2026_08` / 1hour / swingDepth=auto
  - 構成点 idx: `[3, 9, 42, 118, 137]` / 最終構成点 137 → ブレイク 162
  - 間の同種ピボット: idx 154（2026-08-19T06:00:00.000Z / 終値 10,251,555 / 高安 10,234,089）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1hour_2026_08` / 1hour / swingDepth=2
  - 構成点 idx: `[230, 239, 249, 265, 272]` / 最終構成点 272 → ブレイク 280
  - 間の同種ピボット: idx 276（2026-08-24T08:00:00.000Z / 終値 12,272,447 / 高安 12,252,345）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1hour_2026_08` / 1hour / swingDepth=2
  - 構成点 idx: `[225, 239, 249, 265, 272]` / 最終構成点 272 → ブレイク 280
  - 間の同種ピボット: idx 276（2026-08-24T08:00:00.000Z / 終値 12,272,447 / 高安 12,252,345）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1hour_2026_08` / 1hour / swingDepth=2
  - 構成点 idx: `[242, 245, 249, 283, 288]` / 最終構成点 288 → ブレイク 294
  - 間の同種ピボット: idx 291（2026-08-24T23:00:00.000Z / 終値 12,557,431 / 高安 12,519,594）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1hour_2026_08` / 1hour / swingDepth=2
  - 構成点 idx: `[230, 239, 249, 283, 285]` / 最終構成点 285 → ブレイク 294
  - 間の同種ピボット: idx 288（2026-08-24T20:00:00.000Z / 終値 12,557,106 / 高安 12,505,833） , idx 291（2026-08-24T23:00:00.000Z / 終値 12,557,431 / 高安 12,519,594）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1hour_2026_08` / 1hour / swingDepth=2
  - 構成点 idx: `[230, 239, 249, 283, 288]` / 最終構成点 288 → ブレイク 294
  - 間の同種ピボット: idx 291（2026-08-24T23:00:00.000Z / 終値 12,557,431 / 高安 12,519,594）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1hour_2026_08` / 1hour / swingDepth=2
  - 構成点 idx: `[3, 9, 42, 118, 134]` / 最終構成点 134 → ブレイク 162
  - 間の同種ピボット: idx 137（2026-08-18T13:00:00.000Z / 終値 10,246,328 / 高安 10,226,808） , idx 154（2026-08-19T06:00:00.000Z / 終値 10,251,555 / 高安 10,234,089）
  - ゾーン再進入: なし

### 計測 3: 再進入チェックの横展開で落ちる候補（triple / H&S。ゾーン再進入がある構造）

該当 0 件。

### 計測 4: ゲート別の accepted 増減

**経路ゲート / double のみ（PR 1）** — accepted 延べ 372（差分 removed 0 / added 0）

| type | before | after | 増減 |
|---|---:|---:|---:|
| （type 別の増減なし） | | | 0 |

**経路ゲート / triple + H&S（PR 2）** — accepted 延べ 372（差分 removed 0 / added 0）

| type | before | after | 増減 |
|---|---:|---:|---:|
| （type 別の増減なし） | | | 0 |

**再進入チェック横展開 / triple + H&S（PR 2）** — accepted 延べ 372（差分 removed 0 / added 0）

| type | before | after | 増減 |
|---|---:|---:|---:|
| （type 別の増減なし） | | | 0 |

**全部（経路 + 再進入横展開）** — accepted 延べ 372（差分 removed 0 / added 0）

| type | before | after | 増減 |
|---|---:|---:|---:|
| （type 別の増減なし） | | | 0 |

## 実データ C 96（`btc_jpy_1hour_2026_09`）（96 ケース）

### 母集団（ゲート位置に到達した候補）

| type / 経路 | 延べ行 | 構造 | 間に同種ピボット有り（構造） | ゾーン再進入（構造） |
|---|---:|---:|---:|---:|
| double_top / strict | 56 | 2 | 1 | 0 |
| head_and_shoulders / strict | 432 | 20 | 20 | 0 |
| inverse_head_and_shoulders / strict | 168 | 15 | 5 | 0 |
| triple_bottom / strict | 24 | 2 | 0 | 0 |
| triple_top / strict | 24 | 1 | 1 | 0 |
| **合計** | **704** | **40** | **27** | **0** |

| 時間足 | 構造 | 間に同種ピボット有り | ゾーン再進入 |
|---|---:|---:|---:|
| 4hour | 5 | 5 | 0 |
| 1hour | 35 | 22 | 0 |

### 計測 2: 経路ゲートで落ちる候補（間に同種ピボットがある構造）

- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 4hour / swingDepth=auto
  - 構成点 idx: `[84, 91, 113, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 4hour / swingDepth=auto
  - 構成点 idx: `[76, 91, 113, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 4hour / swingDepth=auto
  - 構成点 idx: `[38, 68, 113, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 4hour / swingDepth=auto
  - 構成点 idx: `[23, 68, 113, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 4hour / swingDepth=2
  - 構成点 idx: `[30, 68, 113, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 329（2026-09-03T02:00:00.000Z / 終値 12,302,418 / 高安 12,319,998） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし
- **double_top / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=auto
  - 構成点 idx: `[174, 177, 184]` / 最終構成点 184 → ブレイク 198
  - 間の同種ピボット: idx 194（2026-08-28T11:00:00.000Z / 終値 12,725,937 / 高安 12,762,331）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=auto
  - 構成点 idx: `[231, 239, 247, 254, 293]` / 最終構成点 293 → ブレイク 313
  - 間の同種ピボット: idx 302（2026-09-01T23:00:00.000Z / 終値 12,416,308 / 高安 12,437,337） , idx 308（2026-09-02T05:00:00.000Z / 終値 12,428,578 / 高安 12,541,002）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=auto
  - 構成点 idx: `[227, 239, 247, 254, 293]` / 最終構成点 293 → ブレイク 313
  - 間の同種ピボット: idx 302（2026-09-01T23:00:00.000Z / 終値 12,416,308 / 高安 12,437,337） , idx 308（2026-09-02T05:00:00.000Z / 終値 12,428,578 / 高安 12,541,002）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=auto
  - 構成点 idx: `[231, 239, 247, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=auto
  - 構成点 idx: `[217, 219, 247, 254, 293]` / 最終構成点 293 → ブレイク 313
  - 間の同種ピボット: idx 302（2026-09-01T23:00:00.000Z / 終値 12,416,308 / 高安 12,437,337） , idx 308（2026-09-02T05:00:00.000Z / 終値 12,428,578 / 高安 12,541,002）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=auto
  - 構成点 idx: `[227, 239, 247, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=auto
  - 構成点 idx: `[207, 213, 247, 254, 293]` / 最終構成点 293 → ブレイク 313
  - 間の同種ピボット: idx 302（2026-09-01T23:00:00.000Z / 終値 12,416,308 / 高安 12,437,337） , idx 308（2026-09-02T05:00:00.000Z / 終値 12,428,578 / 高安 12,541,002）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=auto
  - 構成点 idx: `[217, 219, 247, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=auto
  - 構成点 idx: `[158, 160, 184, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=auto
  - 構成点 idx: `[102, 104, 113, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=auto
  - 構成点 idx: `[84, 91, 113, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=auto
  - 構成点 idx: `[76, 91, 113, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=auto
  - 構成点 idx: `[30, 68, 113, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=auto
  - 構成点 idx: `[23, 68, 113, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし
- **triple_top / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=auto
  - 構成点 idx: `[168, 172, 174, 177, 184]` / 最終構成点 184 → ブレイク 199
  - 間の同種ピボット: idx 194（2026-08-28T11:00:00.000Z / 終値 12,725,937 / 高安 12,762,331） , idx 198（2026-08-28T15:00:00.000Z / 終値 12,552,117 / 高安 12,771,695）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=2
  - 構成点 idx: `[49, 58, 68, 84, 91]` / 最終構成点 91 → ブレイク 99
  - 間の同種ピボット: idx 95（2026-08-24T08:00:00.000Z / 終値 12,272,447 / 高安 12,252,345）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=2
  - 構成点 idx: `[44, 58, 68, 84, 91]` / 最終構成点 91 → ブレイク 99
  - 間の同種ピボット: idx 95（2026-08-24T08:00:00.000Z / 終値 12,272,447 / 高安 12,252,345）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=2
  - 構成点 idx: `[61, 64, 68, 102, 107]` / 最終構成点 107 → ブレイク 113
  - 間の同種ピボット: idx 110（2026-08-24T23:00:00.000Z / 終値 12,557,431 / 高安 12,519,594）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=2
  - 構成点 idx: `[49, 58, 68, 102, 104]` / 最終構成点 104 → ブレイク 113
  - 間の同種ピボット: idx 107（2026-08-24T20:00:00.000Z / 終値 12,557,106 / 高安 12,505,833） , idx 110（2026-08-24T23:00:00.000Z / 終値 12,557,431 / 高安 12,519,594）
  - ゾーン再進入: なし
- **inverse_head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=2
  - 構成点 idx: `[49, 58, 68, 102, 107]` / 最終構成点 107 → ブレイク 113
  - 間の同種ピボット: idx 110（2026-08-24T23:00:00.000Z / 終値 12,557,431 / 高安 12,519,594）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=2
  - 構成点 idx: `[153, 155, 184, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 329（2026-09-03T02:00:00.000Z / 終値 12,302,418 / 高安 12,319,998） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし
- **head_and_shoulders / strict** — `btc_jpy_1hour_2026_09` / 1hour / swingDepth=6
  - 構成点 idx: `[38, 68, 113, 304, 308]` / 最終構成点 308 → ブレイク 336
  - 間の同種ピボット: idx 319（2026-09-02T16:00:00.000Z / 終値 12,268,848 / 高安 12,326,669） , idx 332（2026-09-03T05:00:00.000Z / 終値 12,260,000 / 高安 12,320,000）
  - ゾーン再進入: なし

### 計測 3: 再進入チェックの横展開で落ちる候補（triple / H&S。ゾーン再進入がある構造）

該当 0 件。

### 計測 4: ゲート別の accepted 増減

**経路ゲート / double のみ（PR 1）** — accepted 延べ 384（差分 removed 16 / added 0）

| type | before | after | 増減 |
|---|---:|---:|---:|
| double_top | 28 | 12 | -16 |

- removed（構造）: `btc_jpy_1hour_2026_09/1hour double_top 174-177-184` , `btc_jpy_1hour_2026_09/1hour double_top 348-353-357`
- added（構造）: なし

**経路ゲート / triple + H&S（PR 2）** — accepted 延べ 332（差分 removed 68 / added 0）

| type | before | after | 増減 |
|---|---:|---:|---:|
| head_and_shoulders | 56 | 0 | -56 |
| triple_top | 12 | 0 | -12 |

- removed（構造）: `btc_jpy_1hour_2026_09/1hour head_and_shoulders 207-213-247-254-293` , `btc_jpy_1hour_2026_09/1hour head_and_shoulders 217-219-247-304-308` , `btc_jpy_1hour_2026_09/1hour head_and_shoulders 23-68-113-304-308` , `btc_jpy_1hour_2026_09/1hour head_and_shoulders 30-68-113-304-308` , `btc_jpy_1hour_2026_09/1hour head_and_shoulders 38-68-113-304-308` , `btc_jpy_1hour_2026_09/1hour head_and_shoulders 84-91-113-304-308` , `btc_jpy_1hour_2026_09/1hour triple_top 168-172-174-177-184` , `btc_jpy_1hour_2026_09/4hour head_and_shoulders 23-68-113-304-308` , `btc_jpy_1hour_2026_09/4hour head_and_shoulders 30-68-113-304-308` , `btc_jpy_1hour_2026_09/4hour head_and_shoulders 38-68-113-304-308` , `btc_jpy_1hour_2026_09/4hour head_and_shoulders 84-91-113-304-308`
- added（構造）: なし

**再進入チェック横展開 / triple + H&S（PR 2）** — accepted 延べ 400（差分 removed 0 / added 0）

| type | before | after | 増減 |
|---|---:|---:|---:|
| （type 別の増減なし） | | | 0 |

**全部（経路 + 再進入横展開）** — accepted 延べ 316（差分 removed 84 / added 0）

| type | before | after | 増減 |
|---|---:|---:|---:|
| double_top | 28 | 12 | -16 |
| head_and_shoulders | 56 | 0 | -56 |
| triple_top | 12 | 0 | -12 |

- removed（構造）: `btc_jpy_1hour_2026_09/1hour double_top 174-177-184` , `btc_jpy_1hour_2026_09/1hour double_top 348-353-357` , `btc_jpy_1hour_2026_09/1hour head_and_shoulders 207-213-247-254-293` , `btc_jpy_1hour_2026_09/1hour head_and_shoulders 217-219-247-304-308` , `btc_jpy_1hour_2026_09/1hour head_and_shoulders 23-68-113-304-308` , `btc_jpy_1hour_2026_09/1hour head_and_shoulders 30-68-113-304-308` , `btc_jpy_1hour_2026_09/1hour head_and_shoulders 38-68-113-304-308` , `btc_jpy_1hour_2026_09/1hour head_and_shoulders 84-91-113-304-308` , `btc_jpy_1hour_2026_09/1hour triple_top 168-172-174-177-184` , `btc_jpy_1hour_2026_09/4hour head_and_shoulders 23-68-113-304-308` , `btc_jpy_1hour_2026_09/4hour head_and_shoulders 30-68-113-304-308` , `btc_jpy_1hour_2026_09/4hour head_and_shoulders 38-68-113-304-308` , `btc_jpy_1hour_2026_09/4hour head_and_shoulders 84-91-113-304-308`
- added（構造）: なし
