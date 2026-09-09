# 形成中 double の「形成中」の定義が top / bottom で違う件の実測（issue #262 Phase 1）

`scripts/measure_forming_double_asymmetry_262.ts` の出力（§12 に verbatim）に、読み方（§1）・
結論（§2）・問題設定（§3）・目視判定（§8）・契約の棚卸し（§9）・案の比較（§11）を足したメモ。

**検出器・`structural.ts`・`config.ts`・ベースライン・`status` の enum は 1 行も変更していない。**
本 Phase の成果物はスクリプトと本メモと issue コメントだけで、**決定はしない**。

計測ハーネスは PR #265（`scripts/measure_forming_triple_level_spread_178.ts`）に倣った。
コーパス・ケース数・「延べ / 構造 / 実体」の定義は
[`forming-triple-level-spread-178.md`](./forming-triple-level-spread-178.md) §1 が単一ソース。

## 1. 読み方

- **経路の同定を理由コードの名前でやっていない。** 形成中経路の棄却理由には完成済み経路と
  共有のものがある（`prior_trend_mismatch:*` と `validateReversalStructure` の 5 コード）。
  名前で振り分けると完成済みの棄却が混ざるので、**形成中 1 経路を丸ごと `return null` に
  差し替えた対照ビルド**を置き、同じケースの `debugCandidates` の差集合を取っている。
  形成中経路は `detectDoubles` の最後で呼ばれ `debugCandidates` に積む以外の副作用が無いので、
  対照ビルドの候補列は base の候補列の**部分列**になる。部分列であることを毎ケース検算しており、
  崩れたらその場で例外になる。

  | ビルド | 中身 | 用途 |
  |---|---|---|
  | `base` | 本体は 1 文字も変えない（末尾に `export { … }` を 1 行足すだけ） | §4 / §5 の分布 |
  | `noTop` | `tryFormingDoubleTop` を `return null` に | 形成中 top 経路の候補を差分で同定する対照 |
  | `noBottom` | `tryFormingDoubleBottom` を `return null` に | 同、bottom 経路 |
  | `ablA` | `tryFormingDoubleBottom` を top の流儀へ組み替え | §6 |
  | `ablB` | `tryFormingDoubleTop` を bottom の流儀へ組み替え | §7 |
  | `pr` | 作業ツリーそのまま | §13（Phase 2 の実装との突き合わせ） |

  **Phase 2（PR #270）以降、上の 5 ビルドは `detect_doubles.ts` を `main` から取る**
  （strip ビルド）。作業ツリーには `tryFormingDoubleBottom` がもう無いので、
  ablation のアンカーが取れないだけでなく、§4〜§7 が Phase 1 と別物の測定になってしまうため。
  §12-0 の「展開ビルド ≡ 作業ツリー」の検算は `pr` ビルドが担い、strip ≡ `main` は
  「この PR が `tools/patterns/` で触ったのは `detect_doubles.ts` だけ」の検算で担保する（§13）。

  `ablA` の bottom 経路は `noBottom` を対照に取れる（`ablA` は bottom しか触っていないので、
  そこを潰せば `noBottom` と同一のビルドになる）。`ablB` と `noTop` も同じ関係。

- **ablation は「符号反転しただけの写し」で、閾値・係数は 1 つも変えていない。**
  `ablA` は `tryFormingDoubleTop` を、`ablB` は `tryFormingDoubleBottom` を、それぞれ
  上下反転して書き写しただけ。したがって片方にしか無い検査は反転先でも**そのまま無い / ある**:

  | 検査 | 現行 top | 現行 bottom | `ablA`（bottom を top 流儀） | `ablB`（top を bottom 流儀） |
  |---|---|---|---|---|
  | 両脚の高さ（`forming_pattern_height_below_min`） | 無 | 有 | **無** | **有** |
  | `checkPostPivotInvalidation`（#126 G5） | 無 | 有 | **無** | **有** |
  | 終端 status（`expired` / `invalid`） | 無 | 有 | **無** | **有** |
  | `pivots` の点数 | 2 | 3 | **2** | **3** |

  「A では検査が減り B では増える」のは ablation の恣意ではなく、**現行の 2 経路がその差を
  持っているから**。混ぜて「A は緩いから accepted が増えるはず」と読まないこと（実際は §6 のとおり
  A は 0 件になる）。

- **accepted な候補と `PatternEntry` の突き合わせは `type` だけでは足りない。** 同じケースで
  完成済みと形成中が**同じ構成点 3 点**で同時に返ることがある（実データ C / D の `1hour`
  idx 174-177-184 が実例で、案 B では `completed` と `expired` が同時に出る）。
  ハーネスは `type` + `status` + 構成点の 3 つで引き、引けなかった件数を §12-0 で申告する
  （実測 0 件）。**案 B / C を採るなら `globalDedup` がこの重複をどう畳むかを Phase 2 で確認すること。**

- **ファネル表は自己検算付き。** 段階の並びに載らない理由コードが 1 つでも出れば「未分類」行が
  立ち、残差と accepted の延べが食い違えば警告行が出る。初回の走行で
  `no_neckline_cross_before_trough1`（構造ゲートのコード）の取りこぼしがこれで見つかっている。
  §12 の出力に警告行は 1 つも無い。

- **実データ B / C / D は独立系列ではない。** 同じ btc_jpy 1 時間足履歴の重なる窓なので、
  構造の実体数を言うときは絶対時刻で畳む（「実体」列）。標準コーパスの「実データ A 96」は
  `btc_jpy_1day_2026` の同じ 90 本に `tf` ラベルを付け替えたもので、時間足別の内訳は
  独立系列ではない（#178）。

## 2. 結論（計測結果の要約。対策の決定は含まない）

1. **形成中 `double_top` が 0 件になる律速は `forming_bars_out_of_range` で、`DOUBLE_LEVEL_MAX_PCT`
   ではない。** 12,104 ケースで top 経路が積んだ候補 11,528 件のうち、同水準判定
   （`forming_peaks_not_level`）で落ちるのは 172 件（1.5%）。構成点が揃った 4,303 件のうち
   **4,159 件（96.7%）が `forming_bars_out_of_range` で落ち、しかも全件が下限割れ**
   （`formationBars` は p50 11 本 / max 38 本、要求は 1day 23 / 1hour 34 / 4hour 42 本）。
   残った 144 件をサイズ検査（134 件）と構造ゲート（10 件）が全部落として 0 になる。
2. **原因は「形成中」の定義そのもの。** top は左の主構成点に**最新の確定山**を取るので
   `formationBars = 最新足 − 最新の確定山` が構造的に小さい。要求を満たすには「直近 23〜42 本に
   山が 1 つも無く、かつ現値がその古い山と 3% 以内」という両立しにくい条件が要る。
   bottom は左の主構成点が**谷ペアの左側**なので `formationBars` が構造全体を張り（p50 230 本）、
   同じ閾値が普通に通る。
3. **ablation A（bottom を top の流儀へ）は全母集団で accepted 0 件になる。** 現行 bottom の
   accepted（`forming` 6 実体 / `expired` 9 実体 / `invalid` 5 実体）が**全部消える**。
   落ち方も top と同型で、`forming_bars_out_of_range` 3,869 件が**全件下限割れ**
   （`formationBars` p50 12 本 / max 35 本）。**top の 0 件は top 固有の事情ではなく、
   「最終構成点が形成中」という定義を double に当てると起きる**ことが確定した。
4. **ablation B（top を bottom の流儀へ）は 0 件 → 13 実体になる。**
   `expired` 8 実体 / `invalid` 5 実体 / `forming` **2 実体**（延べは 1,466 / 59 / 11）。
   既定（`includeInvalid: false`）で利用者に見えるのは `forming` の 2 実体だけ。
5. **目視判定（§8）**: 10 形（13 実体を値動きで畳んだもの）のうち **呼べる 3 / 保留 2 / 呼べない 5**。
   **`forming` として現れる 2 実体は両方とも「呼べる」**。「呼べない」5 形の内訳は
   谷が山1 の隣接足 2 形、山2 以降に新高値 1 形（重複 1）、谷の深さが 1 本の値幅未満 2 形。
6. **追跡（§7-2）**: `ablB` で形成中になった 5 構造は、後続の窓で 1 つも `completed` にならず
   全部 `expired` / `invalid` になった。現行 bottom の 7 構造も同じ（0 completed / 7 終端）。
   **ローリング窓の範囲では、形成中 double が完成に至った例は top / bottom どちらにも無い。**
7. **`near_completion` は既に「構造完成・ブレイク待ち」の意味で使われている**（`detect_triples` /
   `detect_hs` の完成済み経路でブレイクが見つからなかった場合）。**double 2 型だけがこの status を
   一度も出さない。** 現行 `tryFormingDoubleBottom` の `forming` は、triple / H&S の語彙では
   `near_completion` に相当する（§9-2 / §10）。

## 3. 問題設定（コードの事実）

issue #262 の本文は「主構成点の取り方が非対称」と書いているが、`tools/patterns/detect_doubles.ts` を
読むと **2 経路は「形成中」の段階そのものが違う**。主構成点の取り方の差はその帰結であって原因ではない。

| | `tryFormingDoubleTop` | `tryFormingDoubleBottom` |
|---|---|---|
| 確定ピボット | 山1 + 谷（**2 点**） | 谷1 + 山 + 谷2（**3 点。構造は完成済みと同じ**） |
| 最新足の役割 | **山2 の暫定値**（`forming_peak`。同水準判定・サイズ検査の対象） | 有効性判定（`forming_current_below_valley_zone`）と完成度にのみ使う |
| 探索の形 | ループ無し。最新の確定山を 1 つ取って直線的にガードを並べる | 谷ペアを回すループ |
| 意味 | 「2 つ目の山を作っている途中」 | 「構造は揃い、ネックライン突破を待っている」 |
| 終端 status | 無し（`forming` のみ） | `invalid`（#126 G5）/ `expired`（#126 G4） |
| `pivots` | 2 点（`view=full` の pivot 明細が出ない） | 3 点 |
| 同水準判定 | `isSameLevel(current, leftPeak, DOUBLE_LEVEL_MAX_PCT)` = **未確定の最新足に完成済みと同じ上限** | `forming_valleys_not_level`（確定 2 谷） |

**同じ `status: 'forming'` が別の段階を指している。** top は「最終構成点が形成中」
（triple / H&S の形成中と同じ流儀）、bottom は「構造完成・ブレイク待ち」（完成済みの手前の段階）。

### 3-1. `formationBars` の意味が経路で違う（計測中に判明した本質）

両経路とも `formationBars = lastIdx − 左の主構成点.idx` を `getDoubleFormingBarParams(tf)` の
レンジと突き合わせる。**式は同じだが「左の主構成点」の意味が違う。**

| 経路 | 左の主構成点 | `formationBars` が測るもの |
|---|---|---|
| top | `[...allPeaks].reverse().find(p => p.idx < lastIdx - 2)` = **最新の確定山** | 最新の山から今までの距離 |
| bottom | `confirmedValleys[j-1]` = **谷ペアの左側** | パターン全体の長さ |

top 側は「最新の山」を取るので、間に山ができた瞬間に左の主構成点がそちらへ移り、
`formationBars` が小さいままリセットされる。閾値（1day 23 / 1hour 34 / 4hour 42 本）は
「パターン全体の長さ」を想定した値なので、top ではほぼ到達できない。§4 の実測がこれを裏づける。

## 4. 現行 `tryFormingDoubleTop` の棄却理由 — 0 件の律速（計測仕様 1）

全母集団（12,104 ケース）で **accepted 0 件**。全母集団を足し合わせた棄却の内訳:

| # | 段階（コード順） | 到達（延べ） | 棄却（延べ） | 通過率 |
|---:|---|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 11,528 | 0 | 100% |
| 2 | `forming_no_valley_after_peak` | 11,528 | 5,733 | 50.3% |
| 3 | `forming_peak_level_out_of_tolerance` | 5,795 | 342 | 94.1% |
| 4 | `forming_peaks_not_level` | 5,453 | 172 | 96.8% |
| 5 | `forming_current_at_or_below_valley` | 5,281 | 978 | 81.5% |
| 6 | `forming_completion_below_min` | 4,303 | 0 | 100% |
| 7 | **`forming_bars_out_of_range`** | **4,303** | **4,159** | **3.3%** |
| 8 | `prior_trend_mismatch:*` | 144 | 0 | 100% |
| 9 | サイズ（`forming_pattern_too_small` / `forming_valley_too_shallow`） | 144 | 134 | 6.9% |
| 10 | 構造ゲート（#126） | 10 | 10 | 0% |
| 11 | `forming_peaks_below_neckline` | 0 | 0 | — |
| — | **accepted** | **0** | — | — |

> 母集団ごとの内訳は §12 の §1-1〜§1-7。**プールしない**のが原則なので、この合計表は
> 「律速がどれか」を 1 つの数字で言うためだけに使う。個々の母集団でも律速は同じで、
> §1-3（実データ C 固定窓）だけは段階 2 で全滅するため段階 7 に到達しない。

### 4-1. 律速は `forming_bars_out_of_range`、しかも全件が下限割れ

```text
`forming_bars_out_of_range` の内訳（全母集団）: 下限割れ 4159 件 / 上限超え 0 件。
`formationBars` は min 3 / p50 11 / max 38。
```

要求される `minBars` は `1day` 23 / `4hour` 42 / `1hour` 34 本（`getDoubleFormingBarParams`。
日数 14〜90 日は由来の注記で、実効値は `patterns/bar-thresholds.ts` の clamp を通したバー数）。
**max 38 本は `1day` の 23 本しか超えられない**ので、`1hour` / `4hour` では 1 件も通らない。

### 4-2. 「issue が疑っていた `DOUBLE_LEVEL_MAX_PCT` は律速ではない」

issue #262 と #178 項目 1 は「未確定の最新足に完成済みと同じ 3% 上限を掛けているのが一因では
ないか」と書いていたが、実測では:

- `forming_peaks_not_level`（= `isSameLevel(current, leftPeak, DOUBLE_LEVEL_MAX_PCT)`）の棄却は
  **172 件**。段階 4 に到達した 5,453 件の 3.2%。
- その前段の `forming_peak_level_out_of_tolerance`（±5%）も 342 件（5.9%）。
- 2 つを足しても 514 件で、`forming_bars_out_of_range` の 4,159 件とは桁が違う。

**同水準判定を緩めても 0 件は動かない。** 段階 7 で 96.7% が落ちるため、上流を緩めた分は
そこで吸収される。#178 項目 1 が「形成中 double は本 issue に混ぜない」と判断したのは結果的に
正しかったが、理由は「double の同水準判定が厳しすぎるから」ではなく
**「同水準判定は double の形成中の律速ですらないから」**。

## 5. 現行 `tryFormingDoubleBottom` のベースライン

全母集団の accepted: **`expired` 延べ 1,182 / 構造 16 / 実体 9**、
**`forming` 延べ 73 / 構造 10 / 実体 6**、**`invalid` 延べ 114 / 構造 11 / 実体 5**。

> issue #262 本文の「形成中 `double_bottom` は 73 延べ / 4 実体、`expired` は 1,182 延べ」と
> 延べの数字は一致する。実体が 4 ではなく 6 なのは畳み方の違いで、本メモは
> `(時間足, type, 確定構成点の絶対時刻)` で畳んでいる（同じ値動きでも時間足ラベルが違えば別実体）。

`forming_bars_out_of_range` の内訳は **下限割れ 7,064 件 / 上限超え 10,228 件**、
`formationBars` は min 6 / p50 230 / max 360。**両側が効いており、上限超えのほうが多い。**
top（下限割れのみ、p50 11 本）と対照的で、§3-1 の「`formationBars` の意味が違う」を数字で示している。

ファネルは母集団ごとに §12 の §2-1〜§2-7。ループ経路なので候補 1 件 = ループ 1 周であり、
**構成点 3 点が揃う前の `continue`（`minDist` 不足 / 間に山が無い）は候補に積まれない**
（#158 の cap 対策）。分母は「3 点が揃った谷ペア」であって「全ペア」ではない。

## 6. ablation A: bottom を top の流儀へ（計測仕様 2）

確定 谷1 + 山 + **最新足を谷2 の暫定値**にした複製。結果は **全母集団で accepted 0 件**。

| 経路 | accepted（実体） | `forming_bars_out_of_range` | `formationBars` |
|---|---|---|---|
| 現行 bottom | `forming` 6 / `expired` 9 / `invalid` 5 | 下限割れ 7,064 / 上限超え 10,228 | min 6 / p50 230 / max 360 |
| **ablation A** | **0** | **下限割れ 3,869 / 上限超え 0** | **min 3 / p50 12 / max 35** |

**現行 bottom の accepted が全部消える。** 落ち方は現行 top と同型で、
段階 7（`forming_bars_out_of_range`）が全件下限割れで律速する。

これで **「top の 0 件は top 固有の事情ではない」**ことが確定した。
「最終構成点が形成中」という定義を double に当てると、左の主構成点が「最新の確定ピボット」に
なり、`formationBars` がパターン長ではなく「直近のピボットからの距離」を測るようになる。
**案 A（bottom を top に揃える）を採ると、形成中 double が 2 型とも 0 件になる。**

> 現行 bottom の `expired` / `invalid` が「居場所を失う」だけでなく、`forming` 自体が消える。
> 案 A は「非対称の解消」ではなく「形成中 double の廃止」と同義になる（§11）。

## 7. ablation B: top を bottom の流儀へ（計測仕様 3。主指標）

確定 山1 + 谷 + 山2 の 3 点にし、最新足はブレイク待ちの有効性判定にだけ使う複製。

### 7-1. 件数

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `expired` | 1,466 | 18 | 8 |
| `invalid` | 59 | 9 | 5 |
| **`forming`** | **11** | **5** | **2** |

**現行 0 件 → 13 実体**（status をまたいで畳むと 13。同じ実体が窓によって `expired` と `forming` の
両方で現れるものが 2 つある）。**既定（`includeInvalid: false`）で利用者に見えるのは `forming` の
2 実体だけ**で、残り 11 実体は `includeInvalid: true` を渡したときにだけ出る。

母集団別では 標準コーパス `invalid` 2 実体 / 実データ B 0 / C `expired` 1 / D `expired` 1 /
ローリング窓 B `expired` 5・`forming` 2・`invalid` 3 / C・D も同規模（§12 の §4-1〜§4-7）。

`forming_bars_out_of_range` の内訳は **下限割れ 7,660 / 上限超え 3,200**、
`formationBars` は min 6 / p50 30 / max 360。現行 bottom と同じく両側が効く。

### 7-2. その後どうなったか（計測仕様 4）

ローリング窓で、ある構造が**初めて形成中として現れた窓より後**の窓での結末を 3 分類した
（#260 §8 と同じ）。

| 経路 | 追跡できた構造 | その後 `completed` | その後 終端 status | どちらにもならず |
|---|---:|---:|---:|---:|
| 現行 top | 0 | 0 | 0 | 0 |
| 現行 bottom | 7 | **0** | 7 | 0 |
| ablation A（bottom） | 0 | 0 | 0 | 0 |
| **ablation B（top）** | **5** | **0** | **5** | **0** |

**ローリング窓の範囲では、形成中 double が `completed` に至った例が 1 つも無い**——ablation B で
新設される 5 構造だけでなく、**現行 bottom の 7 構造も全部 `expired` / `invalid` で終わっている。**

> これは案の優劣の材料にはならない（現行 bottom も同じなので差が付かない）。**「形成中 double は
> ほぼ完成しない」という現行の性質を案 B が引き継ぐ**という読み方をすること。ローリング窓は
> 実データ B / C / D の 365 本ぶんしかないので、コーパスの短さの反映でもある。

### 7-3. `view=debug` の cap=200 への影響（計測仕様の波及確認）

`detect_patterns.ts` の並べ替え（accepted → 型間排他の棄却 → 検出器の棄却）を再現し、
**triple + double だけ**で候補総数を数えた下限値（他の検出器を足すと更に増える）。

| 母集団 | ケース | 候補総数 p50 現行 → B | max 現行 → B | cap 超過ケース 現行 → B |
|---|---:|---|---|---|
| 標準コーパス 800 | 800 | 9 → 9 | 93 → 100 | 0 → 0 |
| 実データ B 96 | 96 | 229 → 229 | 452 → 491 | 56 → 56 |
| 実データ C 96 | 96 | 193 → 209 | 486 → 527 | **44 → 56** |
| 実データ D 96 | 96 | 200 → 218 | 493 → 533 | **44 → 56** |

案 B は top をループ経路にするので、1 ケースあたりの候補が山ペアの数だけ積まれる。
**実データ C / D では cap を超えるケースが 44 → 56（+27%）に増える。** 実データ B は
現行で既に 56/96 が飽和しているので変わらない。押し出されるのは他の検出器の棄却理由なので、
**案 B を採るなら `view=debug` の cap と候補の積み方（#158）を同じ PR で見直すこと。**

## 8. 目視判定（計測仕様 5）

案 B で新たに accepted になる `double_top` **13 実体**を目視で 3 値判定した。
判定は #249 §5 / #244 §10 と同じ 3 値（**呼べる / 呼べない / 保留**）。チャートは
`render_chart_svg` にフィクスチャのローソク足を流し（`analyze_indicators` をモック）、
`overlays.ranges` / `overlays.annotations` で構成点にマーカーを重ねて描いたもの。
**独自の描画コードは書いていない**（`.claude/rules/charting.md`）。描画ハーネスは使い捨てで
コミットしていない（#244 §10 / #249 §5 と同じ扱い。再現手順は §8-4）。

### 8-1. 13 実体は 10 の値動きに畳める

実データ B / C / D は同じ値動きの別窓（**D の idx + 19 = C の idx、C の idx + 181 = B の idx**）で、
同じ構成点が時間足ラベル違いで 2 回出るものもある。

| 形 | 系列 / 構成点 idx（山1 - 谷 - 山2） | 終端 idx | §12 §6 の行 |
|---|---|---:|---|
| 01 | `forming_symmetrical_triangle` 3 - 9 - 14 | 35 | 1 |
| 02 | `uptrend_fake_double_bottom` 29 - 30 - 36 | 55 | 2 |
| 03 | C 174 - 177 - 184 | 364 | 3 |
| 04 | D 329 - 334 - 338 | 364 | 4 |
| 05 | B 9 - 20 - 26 | 59 | 5 |
| 06 | B 204 - 205 - 219 | 227 / 238 | 6, 7（`1day` / `1hour` ラベル） |
| 07 | B 219 - 230 - 236 | 253 / 261 | 8, 9（`1hour` / `4hour` ラベル） |
| 08 | B 265 - 272 - 283 | 299 | 10 |
| 09 | B 294 - 305 - 308 | 328 / 336 | 11, 12（`1hour` / `4hour` ラベル） |
| 10 | C 274 - 281 - 284 | 308 | 13 |

### 8-2. 判定の基準

**チャート画像を見なくても §8-3 の数値だけで検算できるように書いてある。** 根拠に使った量は
「構成点の終値 / 極値」と「区間の最高値 / 最安値」の 2 種類だけで、どちらも凍結フィクスチャから
直接読める（検出器も閾値も通さない）。

順に当てて、最初に当たったものを採る:

1. **谷が山1 の隣接足（間隔 1 本）** → swing ではなく 1 本の揺り戻し → **呼べない**
2. **山2 以降に両山の高値を超えた** → その時点で天井ではない → **呼べない**
3. **谷の深さ（対 山1 終値）< 0.5%** → 1 本の値幅に埋もれる。M として読めない → **呼べない**
4. 上記に当たらず、**谷の深さ ≥ 1.0% かつ山2 以降にネックラインを割った** → **呼べる**
5. それ以外 → **保留**

### 8-3. 検算用の実数値

| 形 | 山1-谷 間隔 | 谷-山2 間隔 | 谷の深さ（対 山1 終値） | 山1〜山2 の間の最高値が両山を超えるか | 山2 以降に両山の高値を超えたか | 山2 以降にネックライン（谷 終値）を割ったか |
|---|---:|---:|---:|---|---|---|
| 01 | 6 本 | 5 本 | 27.007% | — | — | — （最安 101） |
| 02 | **1 本** | 6 本 | 5.306% | — | **✅ 超えた（251）** | ✅ 割った（228） |
| 03 | 3 本 | 7 本 | **0.251%** | — | — | ✅ 割った（12,126,452） |
| 04 | 5 本 | 4 本 | 0.797% | — | — | ✅ 割った（12,302,470） |
| 05 | 11 本 | 6 本 | 1.046% | — | — | ✅ 割った（9,955,830） |
| 06 | **1 本** | 14 本 | 1.754% | — | — | ✅ 割った（12,132,786） |
| 07 | 11 本 | 6 本 | 1.845% | — | — | ✅ 割った（12,001,038） |
| 08 | 7 本 | 11 本 | 1.166% | — | **✅ 超えた（12,933,047）** | — （最安 12,491,660） |
| 09 | 11 本 | 3 本 | 2.485% | — | — | ✅ 割った（12,420,000） |
| 10 | 7 本 | 3 本 | **0.492%** | — | — | ✅ 割った（12,260,068） |

**「山1〜山2 の間の最高値が両山を超える」は 10 形とも `—`。** 中に高い山が挟まっている形は
1 つも無く、高安で見れば全部きちんと M になっている。

高さ相対の同水準指標（完成済み double 経路の `rejectByLevelDiff` が見る量。#178 項目 4）:

| 形 | `spreadPct` | `heightPct` | `spreadRatio` | `validateLevelDiff`（閾値 0.5） |
|---|---:|---:|---:|---|
| 01 | 2.190% | 30.714% | 0.070 | ✅ 通過 |
| 02 | 0.407% | 8.032% | 0.050 | ✅ 通過 |
| 03 | 0.313% | 1.965% | 0.157 | ✅ 通過 |
| 04 | 0.627% | 1.713% | 0.363 | ✅ 通過 |
| 05 | 0.403% | 1.608% | 0.250 | ✅ 通過 |
| 06 | 1.003% | 8.730% | 0.115 | ✅ 通過 |
| 07 | 1.370% | 3.133% | 0.435 | ✅ 通過 |
| 08 | 1.787% | 4.308% | 0.410 | ✅ 通過 |
| 09 | 1.815% | 3.694% | **0.488** | ✅ 通過 |
| 10 | 0.481% | 1.325% | 0.363 | ✅ 通過 |

**10 形とも完成済み経路の高さ相対ゲートを通過する**（max 0.488。閾値 0.5 の直下）。
形成中 triple で #178 項目 1 が見つけた「形成中として出るのに完成した瞬間に高さ相対で落ちる」
という破れは、**案 B の accepted 集合には 1 件も無い。**

### 8-4. 判定

| 形 | 判定 | 根拠（§8-2 の番号） |
|---|---|---|
| 01 | **保留** | 基準 1〜3 に当たらず、山2 以降にネックライン（谷 終値 99.7）を割っていない（最安 101）。137 → 100 → 134 は M として読めるが、合成の減衰振動フィクスチャで同振幅の振り子が続く（1/22 に 130、1/31 に 126）。反転パターンとして呼ぶか判断を保留する |
| 02 | **呼べない** | 基準 1（谷が山1 の隣接足）。加えて基準 2（山2 以降に 251 まで上昇。両山の高値を超える）。合成の「上昇後の偽ダブルボトム」フィクスチャで、1 本の押し目を谷と読んでいる |
| 03 | **呼べない** | 基準 3（谷の深さ 0.251%）。10 本の微細な揺れで、`heightPct` 1.965% も 1 時間足 BTC の 1 本の値幅と同程度 |
| 04 | **保留** | 基準 4 の「深さ ≥ 1.0%」を満たさない（0.797%）が基準 3 の 0.5% は超える。ネックラインは割っている。弱いが M として読める帯 |
| 05 | **呼べる** | 基準 4。深さ 1.046%、両脚 11 本 / 6 本、山2 以降に 9,955,830 までネックラインを割り、新高値なし。山の終値差 0.403%（`spreadRatio` 0.250）で最も対称 |
| 06 | **呼べない** | 基準 1（谷が山1 の隣接足）。垂直上昇の直後に 1 本だけ押した足を谷と読んでおり、その後 15 本の保ち合いを挟んで山2 を取っている |
| 07 | **呼べる** | 基準 4。深さ 1.845%、両脚 11 本 / 6 本、12,001,038 までネックラインを割り、新高値なし。**`forming` として現れる 2 実体の 1 つ** |
| 08 | **呼べない** | 基準 2（山2 以降に 12,933,047。両山の高値を大きく超える）。山2（12,582,009）が山1（12,357,128）より 1.79% 高く、上昇継続の途中を切り取っている |
| 09 | **呼べる** | 基準 4。深さ 2.485%、12,420,000 までネックラインを割り、新高値なし。谷-山2 が 3 本と短く、山の終値差 1.815%（`spreadRatio` 0.488）は閾値 0.5 の直下だが、いずれも既存の契約の内側。**`forming` として現れる 2 実体のもう 1 つ** |
| 10 | **呼べない** | 基準 3（谷の深さ 0.492%）。`heightPct` 1.325% も 1 本の値幅と同程度 |

**集計: 呼べる 3（05 / 07 / 09）/ 保留 2（01 / 04）/ 呼べない 5（02 / 03 / 06 / 08 / 10）。**

**`forming` として現れる 2 実体（形 07 と 形 09）は両方とも「呼べる」。**
「呼べない」5 形はすべて `expired` か `invalid` として出るもので、**既定では利用者に見えない。**

> 「呼べない」の 5 形のうち 2 形（02 / 06）の原因は**谷が山1 の隣接足**であること。
> `minDist`（`minBarsBetweenSwings`）は現行 bottom でも案 B でも**外側の 2 点の間**にしか
> 掛かっておらず（`rightPeak.idx - leftPeak.idx < minDist`）、中間構成点との間隔は無制約。
> これは現行 bottom にも同じようにある性質で、案 B 固有の欠陥ではない。Phase 2 で案 B を採るなら
> 別 issue として扱うこと（本 Phase では観測のみ）。

### 8-5. 再現手順（描画ハーネスを持たずに検算する）

| 何を | どこから |
|---|---|
| 実データ B / C / D のローソク足 | `tests/fixtures/btc_jpy_1hour_2026_08.ts` / `_09.ts` / `_09_05.ts` |
| 合成フィクスチャ | `tests/fixtures/synthetic_pattern_candles.ts` の `buildFormingSymmetricalTriangleCandles` / `buildUptrendThenFakeDoubleBottomCandles` |
| 構成点の idx と役割 | §8-1 の表 |
| 検出器が出した構成点 | `scripts/measure_forming_double_asymmetry_262.ts` の §6（`--json` を渡せば全件が JSON で出る） |

チャートを描き直す場合は #249 §5 / #244 §10 と同じ手順: `analyze_indicators` をモックして
フィクスチャの窓を `render_chart_svg` に渡し（`{ ok: true, data: { chart: { candles } } }`）、
`overlays.ranges` に構成点 idx の 1 本ぶんの帯（`start` = その足の `isoTime`、`end` = 次の足の
`isoTime`）を並べる。描いた窓は §8-1 の各形について構成点の前後 30 本前後。

## 9. 契約への影響の棚卸し（計測仕様 6）

コードを読んで作った静的な表。**計測ではないので §12 の出力には出ない。**

### 9-1. `pivots` の点数と `view=full` の pivot 明細

| 経路 | `pivots` | `view=full` の pivot 明細 |
|---|---|---|
| 完成済み double 2 型 | 3 点 `[a, b, c]` | 山1 / 谷 / 山2（`pivotRoleLabels` の固定 3 ラベル） |
| 形成中 `double_top`（現行） | **2 点** `[山1, 谷]` | **出ない**（`formatPatternLine` の `p.pivots.length >= 3` で弾かれる） |
| 形成中 `double_bottom`（現行） | 3 点 | 出る |

`src/handlers/detectPatternsViewsHandler.ts` の `pivotRoleLabels` は double 2 型だけ点数で引かず
固定 3 ラベルを返す（#234 の注記「形成中 `double_top` は 2 点なので元々出ない」がこれ）。

- **案 A**（bottom を top に）→ 形成中 `double_bottom` の `pivots` が 3 → 2 点になり、
  **pivot 明細が出なくなる**（`length >= 3` の門で弾かれる）。§6 のとおり accepted 自体が 0 になるので
  実害は無いが、契約としては減る。
- **案 B**（top を bottom に）→ 形成中 `double_top` の `pivots` が 2 → 3 点になり、
  **pivot 明細が出るようになる**（純粋に additive）。`pivotRoleLabels` の注記の後半
  「形成中 `double_top` は 2 点なので元々出ない」が**嘘になるので同じ PR で直す。**
- **案 C / D** → 変化なし（C で `near_completion` を足す場合、`pivots` の点数は案 B と同じになる）。

`docs/tools.md` §「`pivots` は種別混在の構造点リスト」の表は double を `[a, b, c]` の 1 行で
書いており、**形成中 `double_top` が 2 点であることを書いていない**（triple は形成中を別行にしてある）。
案 B / C を採るなら不整合が解消するので行は増やさなくてよい。案 A / D なら**行を足すべき**。

### 9-2. `status` の enum と description

`src/schema/patterns.ts` の enum は `['forming', 'near_completion', 'completed', 'invalid', 'expired']`。
**5 値は既に揃っており、案 C を採っても enum に値を足す必要は無い。**

| status | 現行の description | 現行 double での使用 |
|---|---|---|
| `forming` | 形成途上（まだネックライン突破の余地がある） | top / bottom とも（**別の段階を指している**） |
| `near_completion` | 突破目前 | **double 2 型は一度も出さない**（triple / H&S の完成済み経路がブレイク未検出のとき出す） |
| `completed` | ネックライン突破を検出器が確認済み | 完成済み 2 型 |
| `invalid` | 構成点確定後に形が崩れて無効化された | **bottom のみ** |
| `expired` | 第2構成点の確定から突破確認窓を過ぎた | **bottom のみ** |

- **案 C の実体は「enum の追加」ではなく「`near_completion` の double への配線」**。
  `.claude/rules/tools.md` 規約 7 の alias 猶予が必要になるのは**enum 値を消す / 意味を差し替える**
  場合で、既存値を新しい種別に出すのは additive。ただし
  **「`forming` の意味が bottom で変わる」**（現行の bottom の `forming` が `near_completion` に移る）ので、
  ここは**「同じ語の意味を差し替える変更」に当たり alias では救えない**（規約 7 後半）。
  旧値を送り続けるクライアントではなく**旧値を受け取り続けるクライアント**が壊れる形なので、
  Phase 2 では `meta` での告知か CHANGELOG の破壊的変更扱いが要る。
- `expired` の description は「第2構成点の確定から突破確認窓を過ぎた」と書いてあり、
  **第2構成点が確定していることを前提にしている。** 案 A を採ると形成中の第2構成点が
  暫定値になるので、この文が double について成立しなくなる（§11 の案 A の「居場所を失う」の実体）。
- `docs/tools.md` §「`status` に `expired` がある」の表も同じ前提で書かれている。

### 9-3. テストで期待値が固定されている箇所

| ファイル | 何を固定しているか | 案 A | 案 B | 案 C |
|---|---|---|---|---|
| `tests/patterns/forming-double-triple-debug-candidates.test.ts` | 成功エントリの構成点（`double_top` は `peak1` / `valley` / `forming_peak` の 3 点、`double_bottom` は `valley1` / `peak` / `valley2` / `current` の 4 点）。理由コード 6 種の最小ケース（`forming_no_confirmed_peak` / `forming_no_valley_after_peak` / `forming_peak_level_out_of_tolerance` / `forming_peaks_not_level` / `forming_current_at_or_below_valley` ほか） | **要書き換え**（bottom の role 名と点数が変わる） | **要書き換え**（top の理由コードがほぼ全部入れ替わる） | B と同じ |
| `tests/patterns/size-gates-forming-doubles.test.ts` (#169 / #170) | 形成中 top は「山 / 谷 / **暫定山**」の 3 水準にサイズ検査が掛かること。「暫定山2 が山1 を上回ると深さだけでは落ちない」の対 | 影響小 | **要書き換え**（暫定山が無くなる。両脚の高さチェックが top にも付く） | B と同じ |
| `tests/patterns/neckline-side-forming-triple-double.test.ts` (#261) | 「山1 がネックライン以下の `double_top` は `forming_peaks_below_neckline`」「最新足が谷以下なら `forming_current_at_or_below_valley`（新コードに置き換わらない）」 | 影響小 | **要書き換え**（`forming_current_at_or_below_valley` が消え、主構成点が 2 山になるので `rejectFormingNecklineSide` に渡す点も変わる） | B と同じ |
| `tests/patterns/debug-candidate-status-breakout.test.ts` (#158) | `pushCand` の `status` が候補行に出ること | 影響小 | 影響小 | **`near_completion` の行が増える** |
| `tests/detect_doubles.test.ts` / `tests/detect_patterns_fixtures.test.ts` | 合成フィクスチャでの検出有無 | **要確認**（形成中 bottom が 0 件になる） | 要確認 | 要確認 |
| `tests/view-content-superset.test.ts` / `tests/view-structured-content-invariance.test.ts` | view 規約 2 / 3 | 影響小 | **要確認**（`pivots` が 3 点になり `full` の明細が増える = 足す方向なので規約上は許容） | B と同じ |
| `tests/patterns/min-bars.test.ts` | `docs/tools.md` の閾値表をパースして一致検証 | 変更なし | 変更なし | 変更なし |

**#126 の G4 / G5（`expired` / `invalid`）を直接固定しているテストは `tests/patterns/breakout-path-double.test.ts` と
`tests/patterns/structural-gates-btcjpy.test.ts` で、どちらも完成済み経路が対象。**
形成中 bottom の `expired` / `invalid` を名指しで固定しているテストは見当たらない
（`tests/fixtures/forming_neckline_side_261.ts` が形成中の fixture を持つが status は見ていない）。
つまり **案 A で終端 status が消えても CI は落ちない**——落ちないことが問題であって、
Phase 2 で案 A を採るなら**先にトリップワイヤを足すこと。**

### 9-4. `docs/tools.md` の記述

| 箇所 | 現行 | 案の影響 |
|---|---|---|
| §「`pivots` は種別混在の構造点リスト」 | double を `[a, b, c]` の 1 行で書き、形成中の点数差に触れていない | §9-1 参照 |
| §「`status` に `expired` がある」 | `expired` を「第2構成点の確定から」と定義 | §9-2 参照 |
| §「形成中 triple の単調性ゲート（#263）」 | 「**完成済み経路と形成中 double にはこのゲートは無い**（完成済みは 3 点すべてが確定ピボットで…）」 | **案 B / C を採ると形成中 double も「3 点すべてが確定ピボット」になる**ので、この括弧書きの理由づけが top について変わる |
| §「ネックライン側検査の配線状態」（#261） | 「形成中 `double_top` だけは 2 つの検査で分担する」 | **案 B / C で分担が消える**（`forming_current_at_or_below_valley` が無くなり、2 山とも `validateMainPointsNecklineSide` に渡る）。`rejectFormingNecklineSide` の docstring の表も同じ |
| §「形成中の反転パターン 3 種は同じ換算・同じ形の判定」 | `formationBars` を「double / triple は `lastIdx - 左ピボット.idx`」と書く | **式は同じでも「左ピボット」の意味が経路で違う**（§3-1）。案 B / C を採ると double 2 型で意味が揃うので、この記述に注記を足すべき |

## 10. triple / H&S の形成中との整合（計測仕様 7）

「反転パターンの形成中」が検出器間で何を指しているかの一覧。**`near_completion` の列が要点。**

| 検出器 | 形成中の主構成点 | 最新足の役割 | `pivots` | 形成中の終端 status | `near_completion` を出すか |
|---|---|---|---|---|---|
| `triple_top` / `triple_bottom`（形成中） | 確定 2 山（谷）+ **最新足** | **3 点目の暫定値** | 4 点 | 無し | — |
| `head_and_shoulders` / 逆（形成中） | 確定 左肩 + 頭 + 谷 + **最新足** | **右肩の暫定値** | 4 点 | 無し | — |
| `triple_*`（完成済み経路・ブレイク未検出） | 確定 5 点 | 使わない | 5 点 | — | **✅ `near_completion`** |
| H&S 2 型（完成済み経路・ブレイク未検出） | 確定 5 点 | 使わない | 5 点 | — | **✅ `near_completion`** |
| `double_top`（形成中・**現行**） | 確定 1 山 + **最新足** | **山2 の暫定値** | 2 点 | 無し | ❌ |
| `double_bottom`（形成中・**現行**） | **確定 3 点** | 有効性判定のみ | 3 点 | `invalid` / `expired` | ❌ |
| `double_*`（完成済み経路・ブレイク未検出） | — | — | — | — | ❌（`no_breakout` で棄却。出力に出ない） |

読み取れること:

1. **triple / H&S の形成中は 4 検出器とも「最終構成点が形成中」で統一されている。**
   現行 `double_top` はこの流儀に乗っており、**`double_bottom` だけが浮いている。**
2. **`near_completion` は triple / H&S で「構造完成・ブレイク待ち」を既に意味している。**
   現行 `double_bottom` の `forming` はこの意味であり、**語彙としては誤ラベル。**
3. **double の完成済み経路だけが「構造完成・ブレイク待ち」を出力しない**——
   `findBreakoutIdx` がブレイクを見つけられなければ `no_breakout` で棄却して終わる。
   つまり現行 `tryFormingDoubleBottom` は、**double に欠けている `near_completion` の穴を
   `forming` の名前で埋めている**、と読める。
4. **`expired` / `invalid` は double の形成中 bottom にしかない。** triple / H&S の形成中に
   終端 status が無いのは、最終構成点が未確定なので「突破確認窓を過ぎた」が定義できないため。
   **「最終構成点が形成中」の流儀と終端 status は原理的に両立しない。**

## 11. 案 A / B / C / D の比較（決定はしない）

| | 案 A: bottom を top に揃える | 案 B: top を bottom に揃える | 案 C: 両段階を持つ | 案 D: 現状維持 + 文書化 |
|---|---|---|---|---|
| **形成中の定義** | 最終構成点が形成中 | 構造完成・ブレイク待ち | `forming` = 最終構成点が形成中 / `near_completion` = 構造完成・ブレイク待ち | 経路ごとに別（現状） |
| **検出への影響（実測）** | **形成中 double が 2 型とも 0 件**（bottom の `forming` 6 実体 / `expired` 9 / `invalid` 5 が全部消える。§6） | `double_top` が 0 → 13 実体（既定で見えるのは `forming` 2 実体）。bottom は不変（§7-1） | B の accepted に加えて、A 相当の `forming` が top / bottom に付く（**未計測**。A の結果から 0 件と推定できるが、閾値を触れば動く） | 0 |
| **目視判定** | 判定対象なし（accepted が消えるだけ） | **呼べる 3 / 保留 2 / 呼べない 5**。`forming` で見える 2 実体は両方「呼べる」（§8-4） | B と同じ | — |
| **`status` の契約** | **`expired` / `invalid` が double から消える**。description が前提を失う（§9-2）。トリップワイヤが無いので CI は落ちない | 変更なし（`expired` / `invalid` が top にも付く。additive） | **`forming` の意味が bottom で差し替わる**。規約 7 の alias では救えない（§9-2） | 変更なし |
| **`pivots` の契約** | 形成中 bottom が 3 → 2 点。pivot 明細が消える（減る方向） | 形成中 top が 2 → 3 点。pivot 明細が出る（**足す方向**） | B と同じ | 変更なし |
| **triple / H&S との整合** | **4 検出器 + double 2 型がすべて「最終構成点が形成中」で揃う**（§10 の理想形）。ただし double では 0 件 | 形成中の流儀は triple / H&S とずれたままだが、**`near_completion` の語彙とは整合する** | **完全に整合**（`forming` / `near_completion` の 2 語が全検出器で同じ意味になる） | ずれたまま |
| **`view=debug` の cap** | 影響なし（候補が減る） | **cap 超過ケースが 44 → 56 に増える**母集団がある（§7-3）。#158 の積み方の見直しが要る | B と同じか、それ以上 | 変更なし |
| **テストの書き換え** | 中（bottom の role 名 / 点数。**先にトリップワイヤを足す必要あり**） | 大（top の理由コードがほぼ全入れ替え。§9-3 の 3 ファイル） | 大（B + `near_completion` の分岐） | 小（docs のみ） |
| **`docs/tools.md`** | 3 箇所（§9-4） | 4 箇所（§9-4） | 5 箇所 + `status` の説明 | 2 箇所（非対称を仕様として明記） |

### 推奨（Phase 2 の入口。決定ではない）

**案 A は採らない。** §6 が実測で示したとおり、bottom を top の流儀にすると形成中 double が
2 型とも 0 件になる。issue #262 は「top を bottom に揃えるべきか」を問うているが、
逆向きは**非対称の解消ではなく形成中 double の廃止**になる。

**案 C を本命、案 B を「案 C の第 1 段」として推す。** 理由は 3 つ:

1. **`near_completion` が既にある。** enum を増やす必要が無く、triple / H&S が同じ語を
   同じ意味で使っている（§10-2）。現行 `tryFormingDoubleBottom` の `forming` は
   その語彙では誤ラベルで、案 C はそれを直す変更になる。
2. **案 B は案 C の部分集合。** 案 B（top を bottom の流儀へ）を入れると double 2 型が
   「構造完成・ブレイク待ち」で揃う。その後に status を `forming` → `near_completion` へ
   移すのが案 C の残り。**2 段に割れば、検出結果を変える PR（B）と契約を変える PR（C の残り）を
   分離できる**——B は additive（`pivots` が増え、`expired` / `invalid` が top にも付く）で、
   契約の破壊は C の段にだけ乗る。
3. **案 B の accepted 集合が目視で妥当。** 既定で利用者に見える 2 実体が両方「呼べる」で、
   「呼べない」5 形はすべて `expired` / `invalid`（既定で非表示）。完成済み経路の高さ相対ゲートも
   10 形すべて通過する（§8-3）。**検出を悪化させる材料が出ていない。**

案 C を採る場合に Phase 2 で先に決めるべきこと:

- **`forming`（最終構成点が形成中）を double に残すか。** §6 のとおり、その定義で double を
  検出しようとすると `formationBars` の下限で全滅する。残すなら
  **`formationBars` の測り方を「最新の確定ピボットから」ではなく「構造の左端から」に変える**か、
  形成中 top 専用の下限を持つ必要がある（= `FORMING_*` 係数を触る変更。本 Phase の対象外）。
  **残さない選択（double は `near_completion` と `completed` だけを持つ）も筋が通る**——
  double は構成点が 3 点しかないので「最終構成点が形成中」の段階が短く、
  triple / H&S（構成点 5 点）ほど情報価値が無い。
- **`view=debug` の cap（§7-3）。** 案 B / C は top をループ経路にするので候補が増える。
  #158 の「構成点が揃う前の `continue` には積まない」を top にも適用したうえで、
  cap 超過の増分を測り直すこと。
- **中間構成点との `minDist`（§8-4 の注記）。** 案 B の「呼べない」5 形のうち 2 形は
  谷が山1 の隣接足であることが原因。現行 bottom にも同じ性質があるので**案 B 固有ではない**が、
  案 B は top にも同じ穴を持ち込む。別 issue として扱うこと。

**案 D（現状維持 + 文書化）は「何もしない」ではない。** 採るなら §9-4 の 2 箇所
（`pivots` の点数差、`formationBars` の「左ピボット」の意味差）を `docs/tools.md` に書き、
§9-3 のトリップワイヤ（形成中 bottom の `expired` / `invalid` が消えたら落ちるテスト）を足すこと。
**いまは非対称が仕様なのか事故なのかがコードからも docs からも読めない。**

## 12. 計測スクリプトの出力（そのまま）

`npx tsx scripts/measure_forming_double_asymmetry_262.ts` の標準出力を verbatim で貼る。
`--no-rolling` を付けると固定窓 1,088 ケースだけの短時間版になる。
`--json <path>` で accepted の全明細（構成点の実値込み）が JSON で出る。

<!-- BEGIN measure_forming_double_asymmetry_262 output -->
<!-- 本節は生成物。スクリプトを走らせ直したら丸ごと差し替えること。 -->
**形成中 double の「形成中」の定義の非対称の計測（issue #262 Phase 1）**

**検出器・ベースラインは 1 行も変更していない。** 本スクリプトは `tools/patterns/` を一時領域へ展開し、形成中 2 経路を差し替えたビルドを別に作って走らせるだけ。

### 0. 検算（展開ビルド ≡ 作業ツリー）

`tools/patterns/` を一時領域へディレクトリごと展開し、`detect_doubles.ts` の末尾に `export { … }` を 1 行足しただけのビルド（`base`）が、作業ツリーの本物と `patterns` / `debugCandidates` の JSON 全キーで一致することを**全ケースで**確かめる。

- ✅ 12104 ケース全件で一致（`patterns` / `debugCandidates` とも）
- うち `includeForming: true` は 11560 ケース（形成中経路が呼ばれるのはここだけ）
- 展開先: `/tmp/forming-double-262-6VSYuW`（作業ツリーは 1 バイトも変更していない）
- 形成中の係数（展開ビルドから読んだ値）: `DOUBLE_LEVEL_MAX_PCT` = 0.03 / `FORMING_PEAK_TOLERANCE_PCT` = 0.05 / `FORMING_TOLERANCE_MULTIPLIER` = 1.5 / `FORMING_VALLEY_INVALID_PCT` = 0.02 / `FORMING_EXPIRY_BARS` = 20 / `MIN_FORMING_COMPLETION` = 0.4
- 4 つの差し替えビルド（`noTop` / `noBottom` / `ablA` / `ablB`）は、対照ビルドの候補列が base の**部分列**であることを毎ケース検算している（崩れたらその場で例外）。
- accepted な候補のうち対応する `PatternEntry` を引けなかった件数（0 であるべき）: 現行 `tryFormingDoubleTop` 0 / 現行 `tryFormingDoubleBottom` 0 / ablation A（bottom を top の流儀へ） 0 / ablation B（top を bottom の流儀へ） 0

#### 形成中 double が要求する形成バー数（`getDoubleFormingBarParams`）

`formationBars = 最新足の idx − 左の主構成点の idx` がこのレンジに入らないと `forming_bars_out_of_range` で落ちる。**日数（`MIN_PATTERN_DAYS` = 14 日 / `MAX_FORMING_DAYS` = 90 日）は由来の注記で、実効値はバー数**（`patterns/bar-thresholds.ts` の clamp を通した値）。

| 時間足 | minBars | maxBars |
|---|---:|---:|
| 1day | 23 | 148 |
| 4hour | 42 | 270 |
| 1hour | 34 | 219 |

#### コーパス

| 母集団 | ケース数 | 時間足別の結論に使えるか |
|---|---:|---|
| 標準コーパス 800（合成 704 + 実データ A 96） | 800 | 参考値 |
| 実データ B 96（`btc_jpy_1hour_2026_08`） | 96 | ✅ |
| 実データ C 96（`btc_jpy_1hour_2026_09`） | 96 | ✅ |
| 実データ D 96（`btc_jpy_1hour_2026_09_05`） | 96 | ✅ |
| ローリング窓 3672（`btc_jpy_1hour_2026_08` の末尾 60〜365 本 × 時間足 3 × swingDepth 4） | 3672 | ✅ |
| ローリング窓 3672（`btc_jpy_1hour_2026_09` の末尾 60〜365 本 × 時間足 3 × swingDepth 4） | 3672 | ✅ |
| ローリング窓 3672（`btc_jpy_1hour_2026_09_05` の末尾 60〜365 本 × 時間足 3 × swingDepth 4） | 3672 | ✅ |

**実データ B / C / D は独立系列ではない。** 同じ btc_jpy 1 時間足履歴の**重なる窓**で、C は B の idx 181 から（B∩C = 184 本）、D は C の idx 19 から（C∩D = 346 本）始まる。**構造の実体数を言うときは絶対時刻で畳む**（本メモの「実体」列）。

### 1. 現行 `tryFormingDoubleTop` の棄却理由（0 件の律速）

確定ピボットは**山1 + 谷の 2 点**で、最新足が山2 の暫定値（`forming_peak`）。ループが無いので
1 ケースにつき候補は 1 件しか積まれない——**この表はそのままファネルになる**。

**全母集団の accepted 合計**: **0 件**

`forming_bars_out_of_range` の内訳（全母集団）: **下限割れ 4159 件 / 上限超え 0 件**。`formationBars` は min 3 / p50 11 / max 38。

#### 1-1. 標準コーパス 800（合成 704 + 実データ A 96）（時間足別は参考値）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 368 | 0 | 0 | 0 |
| 2 | `forming_no_valley_after_peak` | 368 | 140 | 19 | 17 |
| 3 | `forming_peak_level_out_of_tolerance` | 228 | 116 | 13 | 11 |
| 4 | `forming_peaks_not_level` | 112 | 16 | 2 | 2 |
| 5 | `forming_current_at_or_below_valley` | 96 | 0 | 0 | 0 |
| 6 | `forming_completion_below_min` | 96 | 0 | 0 | 0 |
| 7 | `forming_bars_out_of_range` | 96 | 96 | 12 | 12 |
| 8 | `prior_trend_mismatch:*` | 0 | 0 | 0 | 0 |
| 9 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 0 | 0 | 0 | 0 |
| 10 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 11 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 1-2. 実データ B 96（`btc_jpy_1hour_2026_08`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 48 | 0 | 0 | 0 |
| 2 | `forming_no_valley_after_peak` | 48 | 20 | 3 | 3 |
| 3 | `forming_peak_level_out_of_tolerance` | 28 | 0 | 0 | 0 |
| 4 | `forming_peaks_not_level` | 28 | 0 | 0 | 0 |
| 5 | `forming_current_at_or_below_valley` | 28 | 0 | 0 | 0 |
| 6 | `forming_completion_below_min` | 28 | 0 | 0 | 0 |
| 7 | `forming_bars_out_of_range` | 28 | 28 | 3 | 3 |
| 8 | `prior_trend_mismatch:*` | 0 | 0 | 0 | 0 |
| 9 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 0 | 0 | 0 | 0 |
| 10 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 11 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 1-3. 実データ C 96（`btc_jpy_1hour_2026_09`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 48 | 0 | 0 | 0 |
| 2 | `forming_no_valley_after_peak` | 48 | 48 | 3 | 3 |
| 3 | `forming_peak_level_out_of_tolerance` | 0 | 0 | 0 | 0 |
| 4 | `forming_peaks_not_level` | 0 | 0 | 0 | 0 |
| 5 | `forming_current_at_or_below_valley` | 0 | 0 | 0 | 0 |
| 6 | `forming_completion_below_min` | 0 | 0 | 0 | 0 |
| 7 | `forming_bars_out_of_range` | 0 | 0 | 0 | 0 |
| 8 | `prior_trend_mismatch:*` | 0 | 0 | 0 | 0 |
| 9 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 0 | 0 | 0 | 0 |
| 10 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 11 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 1-4. 実データ D 96（`btc_jpy_1hour_2026_09_05`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 48 | 0 | 0 | 0 |
| 2 | `forming_no_valley_after_peak` | 48 | 20 | 3 | 3 |
| 3 | `forming_peak_level_out_of_tolerance` | 28 | 0 | 0 | 0 |
| 4 | `forming_peaks_not_level` | 28 | 0 | 0 | 0 |
| 5 | `forming_current_at_or_below_valley` | 28 | 0 | 0 | 0 |
| 6 | `forming_completion_below_min` | 28 | 0 | 0 | 0 |
| 7 | `forming_bars_out_of_range` | 28 | 28 | 6 | 6 |
| 8 | `prior_trend_mismatch:*` | 0 | 0 | 0 | 0 |
| 9 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 0 | 0 | 0 | 0 |
| 10 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 11 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 1-5. ローリング窓 3672（`btc_jpy_1hour_2026_08` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 3672 | 0 | 0 | 0 |
| 2 | `forming_no_valley_after_peak` | 3672 | 1740 | 132 | 132 |
| 3 | `forming_peak_level_out_of_tolerance` | 1932 | 226 | 6 | 6 |
| 4 | `forming_peaks_not_level` | 1706 | 64 | 18 | 18 |
| 5 | `forming_current_at_or_below_valley` | 1642 | 283 | 57 | 57 |
| 6 | `forming_completion_below_min` | 1359 | 0 | 0 | 0 |
| 7 | `forming_bars_out_of_range` | 1359 | 1321 | 135 | 135 |
| 8 | `prior_trend_mismatch:*` | 38 | 0 | 0 | 0 |
| 9 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 38 | 38 | 5 | 5 |
| 10 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 11 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 1-6. ローリング窓 3672（`btc_jpy_1hour_2026_09` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 3672 | 0 | 0 | 0 |
| 2 | `forming_no_valley_after_peak` | 3672 | 1870 | 123 | 123 |
| 3 | `forming_peak_level_out_of_tolerance` | 1802 | 0 | 0 | 0 |
| 4 | `forming_peaks_not_level` | 1802 | 46 | 9 | 9 |
| 5 | `forming_current_at_or_below_valley` | 1756 | 351 | 76 | 76 |
| 6 | `forming_completion_below_min` | 1405 | 0 | 0 | 0 |
| 7 | `forming_bars_out_of_range` | 1405 | 1352 | 122 | 122 |
| 8 | `prior_trend_mismatch:*` | 53 | 0 | 0 | 0 |
| 9 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 53 | 48 | 4 | 4 |
| 10 | `構造ゲート（#126）` | 5 | 5 | 1 | 1 |
| 11 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 1-7. ローリング窓 3672（`btc_jpy_1hour_2026_09_05` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 3672 | 0 | 0 | 0 |
| 2 | `forming_no_valley_after_peak` | 3672 | 1895 | 123 | 123 |
| 3 | `forming_peak_level_out_of_tolerance` | 1777 | 0 | 0 | 0 |
| 4 | `forming_peaks_not_level` | 1777 | 46 | 9 | 9 |
| 5 | `forming_current_at_or_below_valley` | 1731 | 344 | 67 | 67 |
| 6 | `forming_completion_below_min` | 1387 | 0 | 0 | 0 |
| 7 | `forming_bars_out_of_range` | 1387 | 1334 | 125 | 125 |
| 8 | `prior_trend_mismatch:*` | 53 | 0 | 0 | 0 |
| 9 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 53 | 48 | 4 | 4 |
| 10 | `構造ゲート（#126）` | 5 | 5 | 1 | 1 |
| 11 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

### 2. 現行 `tryFormingDoubleBottom` のベースライン

確定ピボットは**谷1 + 山 + 谷2 の 3 点**（構造は完成済みと同じ）。最新足は有効性判定と
完成度にしか使わない。谷ペアを回すループなので、候補 1 件 = ループ 1 周。
**構成点 3 点が揃う前の `continue`（`minDist` 不足 / 間に山が無い）は候補に積まれない**ので、
ファネルの分母は「3 点が揃ったペア」であって「全ペア」ではない（#158 の cap 対策）。

**全母集団の accepted 合計**: `expired` 延べ 1182 / 構造 16 / 実体 9、`forming` 延べ 73 / 構造 10 / 実体 6、`invalid` 延べ 114 / 構造 11 / 実体 5

`forming_bars_out_of_range` の内訳（全母集団）: **下限割れ 7064 件 / 上限超え 10228 件**。`formationBars` は min 6 / p50 230 / max 360。

（`prior_trend_insufficient_data` は棄却ではなく注記として 5805 件積まれている。候補の分母には入れていない。）

#### 2-1. 標準コーパス 800（合成 704 + 実データ A 96）（時間足別は参考値）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_pattern_height_below_min` | 720 | 0 | 0 | 0 |
| 2 | `forming_valleys_not_level` | 720 | 328 | 42 | 42 |
| 3 | `forming_current_below_valley_zone` | 392 | 32 | 4 | 4 |
| 4 | `forming_completion_below_min` | 360 | 0 | 0 | 0 |
| 5 | `forming_bars_out_of_range` | 360 | 244 | 31 | 30 |
| 6 | `prior_trend_mismatch:*` | 116 | 12 | 2 | 2 |
| 7 | `サイズ（forming_pattern_too_small / forming_peak_too_shallow）` | 104 | 0 | 0 | 0 |
| 8 | `構造ゲート（#126）` | 104 | 48 | 9 | 9 |
| 9 | `reclassified_as_triple_bottom` | 56 | 24 | 4 | 4 |
| 10 | `forming_valleys_above_neckline` | 32 | 0 | 0 | 0 |
| — | **accepted** | 32 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `expired` | 8 | 2 | 2 |
| `forming` | 24 | 3 | 3 |

#### 2-2. 実データ B 96（`btc_jpy_1hour_2026_08`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_pattern_height_below_min` | 880 | 616 | 95 | 95 |
| 2 | `forming_valleys_not_level` | 264 | 48 | 8 | 8 |
| 3 | `forming_current_below_valley_zone` | 216 | 0 | 0 | 0 |
| 4 | `forming_completion_below_min` | 216 | 0 | 0 | 0 |
| 5 | `forming_bars_out_of_range` | 216 | 56 | 7 | 7 |
| 6 | `prior_trend_mismatch:*` | 160 | 32 | 4 | 4 |
| 7 | `サイズ（forming_pattern_too_small / forming_peak_too_shallow）` | 128 | 64 | 10 | 10 |
| 8 | `構造ゲート（#126）` | 64 | 44 | 8 | 8 |
| 9 | `reclassified_as_triple_bottom` | 20 | 4 | 1 | 1 |
| 10 | `forming_valleys_above_neckline` | 16 | 0 | 0 | 0 |
| — | **accepted** | 16 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `expired` | 16 | 3 | 3 |

#### 2-3. 実データ C 96（`btc_jpy_1hour_2026_09`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_pattern_height_below_min` | 1236 | 624 | 104 | 104 |
| 2 | `forming_valleys_not_level` | 612 | 60 | 8 | 8 |
| 3 | `forming_current_below_valley_zone` | 552 | 56 | 6 | 6 |
| 4 | `forming_completion_below_min` | 496 | 0 | 0 | 0 |
| 5 | `forming_bars_out_of_range` | 496 | 244 | 34 | 34 |
| 6 | `prior_trend_mismatch:*` | 252 | 0 | 0 | 0 |
| 7 | `サイズ（forming_pattern_too_small / forming_peak_too_shallow）` | 252 | 76 | 9 | 9 |
| 8 | `構造ゲート（#126）` | 176 | 132 | 20 | 20 |
| 9 | `reclassified_as_triple_bottom` | 44 | 40 | 6 | 6 |
| 10 | `forming_valleys_above_neckline` | 4 | 0 | 0 | 0 |
| — | **accepted** | 4 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `invalid` | 4 | 1 | 1 |

#### 2-4. 実データ D 96（`btc_jpy_1hour_2026_09_05`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_pattern_height_below_min` | 1296 | 668 | 111 | 111 |
| 2 | `forming_valleys_not_level` | 628 | 32 | 2 | 2 |
| 3 | `forming_current_below_valley_zone` | 596 | 12 | 1 | 1 |
| 4 | `forming_completion_below_min` | 584 | 0 | 0 | 0 |
| 5 | `forming_bars_out_of_range` | 584 | 308 | 44 | 44 |
| 6 | `prior_trend_mismatch:*` | 276 | 0 | 0 | 0 |
| 7 | `サイズ（forming_pattern_too_small / forming_peak_too_shallow）` | 276 | 72 | 8 | 8 |
| 8 | `構造ゲート（#126）` | 204 | 152 | 21 | 21 |
| 9 | `reclassified_as_triple_bottom` | 52 | 52 | 8 | 8 |
| 10 | `forming_valleys_above_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 2-5. ローリング窓 3672（`btc_jpy_1hour_2026_08` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_pattern_height_below_min` | 49456 | 33222 | 107 | 107 |
| 2 | `forming_valleys_not_level` | 16234 | 3373 | 13 | 13 |
| 3 | `forming_current_below_valley_zone` | 12861 | 15 | 2 | 2 |
| 4 | `forming_completion_below_min` | 12846 | 0 | 0 | 0 |
| 5 | `forming_bars_out_of_range` | 12846 | 3418 | 58 | 58 |
| 6 | `prior_trend_mismatch:*` | 9428 | 2101 | 11 | 11 |
| 7 | `サイズ（forming_pattern_too_small / forming_peak_too_shallow）` | 7327 | 4085 | 20 | 20 |
| 8 | `構造ゲート（#126）` | 3242 | 1753 | 20 | 20 |
| 9 | `reclassified_as_triple_bottom` | 1489 | 1181 | 5 | 5 |
| 10 | `forming_valleys_above_neckline` | 308 | 0 | 0 | 0 |
| — | **accepted** | 308 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `expired` | 275 | 4 | 4 |
| `forming` | 19 | 3 | 3 |
| `invalid` | 14 | 1 | 1 |

#### 2-6. ローリング窓 3672（`btc_jpy_1hour_2026_09` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_pattern_height_below_min` | 51987 | 25257 | 105 | 105 |
| 2 | `forming_valleys_not_level` | 26730 | 1934 | 8 | 8 |
| 3 | `forming_current_below_valley_zone` | 24796 | 1878 | 44 | 44 |
| 4 | `forming_completion_below_min` | 22918 | 0 | 0 | 0 |
| 5 | `forming_bars_out_of_range` | 22918 | 6324 | 77 | 77 |
| 6 | `prior_trend_mismatch:*` | 16594 | 1681 | 9 | 9 |
| 7 | `サイズ（forming_pattern_too_small / forming_peak_too_shallow）` | 14913 | 4089 | 20 | 20 |
| 8 | `構造ゲート（#126）` | 10824 | 8356 | 47 | 47 |
| 9 | `reclassified_as_triple_bottom` | 2468 | 2042 | 12 | 12 |
| 10 | `forming_valleys_above_neckline` | 426 | 0 | 0 | 0 |
| — | **accepted** | 426 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `expired` | 366 | 5 | 5 |
| `forming` | 15 | 2 | 2 |
| `invalid` | 45 | 5 | 5 |

#### 2-7. ローリング窓 3672（`btc_jpy_1hour_2026_09_05` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_pattern_height_below_min` | 53035 | 27086 | 111 | 111 |
| 2 | `forming_valleys_not_level` | 25949 | 216 | 2 | 2 |
| 3 | `forming_current_below_valley_zone` | 25733 | 1979 | 42 | 42 |
| 4 | `forming_completion_below_min` | 23754 | 0 | 0 | 0 |
| 5 | `forming_bars_out_of_range` | 23754 | 6698 | 77 | 77 |
| 6 | `prior_trend_mismatch:*` | 17056 | 0 | 0 | 0 |
| 7 | `サイズ（forming_pattern_too_small / forming_peak_too_shallow）` | 17056 | 4375 | 19 | 19 |
| 8 | `構造ゲート（#126）` | 12681 | 9084 | 43 | 43 |
| 9 | `reclassified_as_triple_bottom` | 3597 | 2271 | 13 | 13 |
| 10 | `forming_valleys_above_neckline` | 1326 | 743 | 2 | 2 |
| — | **accepted** | 583 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `expired` | 517 | 5 | 5 |
| `forming` | 15 | 2 | 2 |
| `invalid` | 51 | 5 | 5 |

### 3. ablation A: bottom を top の流儀（最終構成点が形成中）へ組み替える

確定 谷1 + 山 + **最新足を谷2 の暫定値**にした複製。`tryFormingDoubleTop` の符号反転で、
両脚の高さチェック・`checkPostPivotInvalidation`・`expired` / `invalid` は**無くなる**
（top の流儀にそれらが無いため）。`pivots` は 2 点になる。

**全母集団の accepted 合計**: **0 件**

`forming_bars_out_of_range` の内訳（全母集団）: **下限割れ 3869 件 / 上限超え 0 件**。`formationBars` は min 3 / p50 12 / max 35。

#### 3-1. 標準コーパス 800（合成 704 + 実データ A 96）（時間足別は参考値）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_valley` | 368 | 0 | 0 | 0 |
| 2 | `forming_no_peak_after_valley` | 368 | 228 | 27 | 17 |
| 3 | `forming_valley_level_out_of_tolerance` | 140 | 124 | 17 | 17 |
| 4 | `forming_valleys_not_level` | 16 | 16 | 2 | 2 |
| 5 | `forming_current_at_or_above_peak` | 0 | 0 | 0 | 0 |
| 6 | `forming_completion_below_min` | 0 | 0 | 0 | 0 |
| 7 | `forming_bars_out_of_range` | 0 | 0 | 0 | 0 |
| 8 | `prior_trend_mismatch:*` | 0 | 0 | 0 | 0 |
| 9 | `サイズ（forming_pattern_too_small / forming_peak_too_shallow）` | 0 | 0 | 0 | 0 |
| 10 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 11 | `forming_valleys_above_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 3-2. 実データ B 96（`btc_jpy_1hour_2026_08`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_valley` | 48 | 0 | 0 | 0 |
| 2 | `forming_no_peak_after_valley` | 48 | 28 | 3 | 3 |
| 3 | `forming_valley_level_out_of_tolerance` | 20 | 0 | 0 | 0 |
| 4 | `forming_valleys_not_level` | 20 | 16 | 3 | 3 |
| 5 | `forming_current_at_or_above_peak` | 4 | 4 | 1 | 1 |
| 6 | `forming_completion_below_min` | 0 | 0 | 0 | 0 |
| 7 | `forming_bars_out_of_range` | 0 | 0 | 0 | 0 |
| 8 | `prior_trend_mismatch:*` | 0 | 0 | 0 | 0 |
| 9 | `サイズ（forming_pattern_too_small / forming_peak_too_shallow）` | 0 | 0 | 0 | 0 |
| 10 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 11 | `forming_valleys_above_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 3-3. 実データ C 96（`btc_jpy_1hour_2026_09`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_valley` | 48 | 0 | 0 | 0 |
| 2 | `forming_no_peak_after_valley` | 48 | 0 | 0 | 0 |
| 3 | `forming_valley_level_out_of_tolerance` | 48 | 0 | 0 | 0 |
| 4 | `forming_valleys_not_level` | 48 | 0 | 0 | 0 |
| 5 | `forming_current_at_or_above_peak` | 48 | 0 | 0 | 0 |
| 6 | `forming_completion_below_min` | 48 | 0 | 0 | 0 |
| 7 | `forming_bars_out_of_range` | 48 | 48 | 3 | 3 |
| 8 | `prior_trend_mismatch:*` | 0 | 0 | 0 | 0 |
| 9 | `サイズ（forming_pattern_too_small / forming_peak_too_shallow）` | 0 | 0 | 0 | 0 |
| 10 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 11 | `forming_valleys_above_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 3-4. 実データ D 96（`btc_jpy_1hour_2026_09_05`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_valley` | 48 | 0 | 0 | 0 |
| 2 | `forming_no_peak_after_valley` | 48 | 16 | 3 | 3 |
| 3 | `forming_valley_level_out_of_tolerance` | 32 | 0 | 0 | 0 |
| 4 | `forming_valleys_not_level` | 32 | 0 | 0 | 0 |
| 5 | `forming_current_at_or_above_peak` | 32 | 0 | 0 | 0 |
| 6 | `forming_completion_below_min` | 32 | 0 | 0 | 0 |
| 7 | `forming_bars_out_of_range` | 32 | 32 | 6 | 6 |
| 8 | `prior_trend_mismatch:*` | 0 | 0 | 0 | 0 |
| 9 | `サイズ（forming_pattern_too_small / forming_peak_too_shallow）` | 0 | 0 | 0 | 0 |
| 10 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 11 | `forming_valleys_above_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 3-5. ローリング窓 3672（`btc_jpy_1hour_2026_08` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_valley` | 3672 | 0 | 0 | 0 |
| 2 | `forming_no_peak_after_valley` | 3672 | 1719 | 117 | 117 |
| 3 | `forming_valley_level_out_of_tolerance` | 1953 | 160 | 21 | 21 |
| 4 | `forming_valleys_not_level` | 1793 | 111 | 15 | 15 |
| 5 | `forming_current_at_or_above_peak` | 1682 | 497 | 88 | 88 |
| 6 | `forming_completion_below_min` | 1185 | 0 | 0 | 0 |
| 7 | `forming_bars_out_of_range` | 1185 | 1153 | 126 | 126 |
| 8 | `prior_trend_mismatch:*` | 32 | 16 | 1 | 1 |
| 9 | `サイズ（forming_pattern_too_small / forming_peak_too_shallow）` | 16 | 16 | 4 | 4 |
| 10 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 11 | `forming_valleys_above_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 3-6. ローリング窓 3672（`btc_jpy_1hour_2026_09` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_valley` | 3672 | 0 | 0 | 0 |
| 2 | `forming_no_peak_after_valley` | 3672 | 1592 | 123 | 123 |
| 3 | `forming_valley_level_out_of_tolerance` | 2080 | 15 | 3 | 3 |
| 4 | `forming_valleys_not_level` | 2065 | 191 | 15 | 15 |
| 5 | `forming_current_at_or_above_peak` | 1874 | 499 | 76 | 76 |
| 6 | `forming_completion_below_min` | 1375 | 0 | 0 | 0 |
| 7 | `forming_bars_out_of_range` | 1375 | 1299 | 133 | 133 |
| 8 | `prior_trend_mismatch:*` | 76 | 0 | 0 | 0 |
| 9 | `サイズ（forming_pattern_too_small / forming_peak_too_shallow）` | 76 | 67 | 8 | 8 |
| 10 | `構造ゲート（#126）` | 9 | 9 | 2 | 2 |
| 11 | `forming_valleys_above_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 3-7. ローリング窓 3672（`btc_jpy_1hour_2026_09_05` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_valley` | 3672 | 0 | 0 | 0 |
| 2 | `forming_no_peak_after_valley` | 3672 | 1564 | 129 | 129 |
| 3 | `forming_valley_level_out_of_tolerance` | 2108 | 15 | 3 | 3 |
| 4 | `forming_valleys_not_level` | 2093 | 191 | 15 | 15 |
| 5 | `forming_current_at_or_above_peak` | 1902 | 493 | 73 | 73 |
| 6 | `forming_completion_below_min` | 1409 | 0 | 0 | 0 |
| 7 | `forming_bars_out_of_range` | 1409 | 1337 | 133 | 133 |
| 8 | `prior_trend_mismatch:*` | 72 | 0 | 0 | 0 |
| 9 | `サイズ（forming_pattern_too_small / forming_peak_too_shallow）` | 72 | 63 | 7 | 7 |
| 10 | `構造ゲート（#126）` | 9 | 9 | 2 | 2 |
| 11 | `forming_valleys_above_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

### 4. ablation B: top を bottom の流儀（構造完成・ブレイク待ち）へ組み替える — **主指標**

確定 山1 + 谷 + 山2 の 3 点にし、最新足はブレイク待ちの有効性判定にだけ使う複製。
`tryFormingDoubleBottom` の符号反転で、両脚の高さチェック・`checkPostPivotInvalidation`・
`expired` / `invalid` が付き、`pivots` は 3 点になる。**現行 0 件がいくつになるかが主指標。**

**全母集団の accepted 合計**: `expired` 延べ 1466 / 構造 18 / 実体 8、`forming` 延べ 11 / 構造 5 / 実体 2、`invalid` 延べ 59 / 構造 9 / 実体 5

`forming_bars_out_of_range` の内訳（全母集団）: **下限割れ 7660 件 / 上限超え 3200 件**。`formationBars` は min 6 / p50 30 / max 360。

（`prior_trend_insufficient_data` は棄却ではなく注記として 4117 件積まれている。候補の分母には入れていない。）

#### 4-1. 標準コーパス 800（合成 704 + 実データ A 96）（時間足別は参考値）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_pattern_height_below_min` | 728 | 4 | 1 | 1 |
| 2 | `forming_peaks_not_level` | 724 | 352 | 48 | 48 |
| 3 | `forming_current_above_peak_zone` | 372 | 148 | 20 | 20 |
| 4 | `forming_completion_below_min` | 224 | 0 | 0 | 0 |
| 5 | `forming_bars_out_of_range` | 224 | 192 | 24 | 24 |
| 6 | `prior_trend_mismatch:*` | 32 | 0 | 0 | 0 |
| 7 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 32 | 0 | 0 | 0 |
| 8 | `構造ゲート（#126）` | 32 | 0 | 0 | 0 |
| 9 | `reclassified_as_triple_top` | 32 | 16 | 2 | 2 |
| 10 | `forming_peaks_below_neckline` | 16 | 0 | 0 | 0 |
| — | **accepted** | 16 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `invalid` | 16 | 2 | 2 |

#### 4-2. 実データ B 96（`btc_jpy_1hour_2026_08`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_pattern_height_below_min` | 1248 | 696 | 116 | 116 |
| 2 | `forming_peaks_not_level` | 552 | 56 | 8 | 8 |
| 3 | `forming_current_above_peak_zone` | 496 | 416 | 56 | 56 |
| 4 | `forming_completion_below_min` | 80 | 0 | 0 | 0 |
| 5 | `forming_bars_out_of_range` | 80 | 32 | 3 | 3 |
| 6 | `prior_trend_mismatch:*` | 48 | 0 | 0 | 0 |
| 7 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 48 | 0 | 0 | 0 |
| 8 | `構造ゲート（#126）` | 48 | 20 | 2 | 2 |
| 9 | `reclassified_as_triple_top` | 28 | 28 | 5 | 5 |
| 10 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 4-3. 実データ C 96（`btc_jpy_1hour_2026_09`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_pattern_height_below_min` | 1104 | 648 | 101 | 101 |
| 2 | `forming_peaks_not_level` | 456 | 32 | 4 | 4 |
| 3 | `forming_current_above_peak_zone` | 424 | 0 | 0 | 0 |
| 4 | `forming_completion_below_min` | 424 | 0 | 0 | 0 |
| 5 | `forming_bars_out_of_range` | 424 | 156 | 21 | 21 |
| 6 | `prior_trend_mismatch:*` | 268 | 0 | 0 | 0 |
| 7 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 268 | 76 | 11 | 11 |
| 8 | `構造ゲート（#126）` | 192 | 132 | 17 | 17 |
| 9 | `reclassified_as_triple_top` | 60 | 48 | 5 | 5 |
| 10 | `forming_peaks_below_neckline` | 12 | 0 | 0 | 0 |
| — | **accepted** | 12 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `expired` | 12 | 1 | 1 |

#### 4-4. 実データ D 96（`btc_jpy_1hour_2026_09_05`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_pattern_height_below_min` | 868 | 592 | 94 | 94 |
| 2 | `forming_peaks_not_level` | 276 | 16 | 2 | 2 |
| 3 | `forming_current_above_peak_zone` | 260 | 0 | 0 | 0 |
| 4 | `forming_completion_below_min` | 260 | 0 | 0 | 0 |
| 5 | `forming_bars_out_of_range` | 260 | 132 | 18 | 18 |
| 6 | `prior_trend_mismatch:*` | 128 | 0 | 0 | 0 |
| 7 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 128 | 56 | 7 | 7 |
| 8 | `構造ゲート（#126）` | 72 | 36 | 5 | 5 |
| 9 | `reclassified_as_triple_top` | 36 | 20 | 2 | 2 |
| 10 | `forming_peaks_below_neckline` | 16 | 0 | 0 | 0 |
| — | **accepted** | 16 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `expired` | 16 | 1 | 1 |

#### 4-5. ローリング窓 3672（`btc_jpy_1hour_2026_08` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_pattern_height_below_min` | 50325 | 32234 | 116 | 116 |
| 2 | `forming_peaks_not_level` | 18091 | 2286 | 8 | 8 |
| 3 | `forming_current_above_peak_zone` | 15805 | 8765 | 56 | 56 |
| 4 | `forming_completion_below_min` | 7040 | 0 | 0 | 0 |
| 5 | `forming_bars_out_of_range` | 7040 | 2159 | 62 | 62 |
| 6 | `prior_trend_mismatch:*` | 4881 | 0 | 0 | 0 |
| 7 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 4881 | 949 | 14 | 14 |
| 8 | `構造ゲート（#126）` | 3932 | 1475 | 22 | 22 |
| 9 | `reclassified_as_triple_top` | 2457 | 2234 | 23 | 23 |
| 10 | `forming_peaks_below_neckline` | 223 | 0 | 0 | 0 |
| — | **accepted** | 223 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `expired` | 183 | 5 | 5 |
| `forming` | 5 | 2 | 2 |
| `invalid` | 35 | 3 | 3 |

#### 4-6. ローリング窓 3672（`btc_jpy_1hour_2026_09` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_pattern_height_below_min` | 46672 | 25391 | 104 | 104 |
| 2 | `forming_peaks_not_level` | 21281 | 283 | 5 | 5 |
| 3 | `forming_current_above_peak_zone` | 20998 | 4410 | 52 | 52 |
| 4 | `forming_completion_below_min` | 16588 | 0 | 0 | 0 |
| 5 | `forming_bars_out_of_range` | 16588 | 4203 | 74 | 74 |
| 6 | `prior_trend_mismatch:*` | 12385 | 0 | 0 | 0 |
| 7 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 12385 | 2155 | 17 | 17 |
| 8 | `構造ゲート（#126）` | 10230 | 4232 | 33 | 33 |
| 9 | `reclassified_as_triple_top` | 5998 | 5387 | 27 | 27 |
| 10 | `forming_peaks_below_neckline` | 611 | 0 | 0 | 0 |
| — | **accepted** | 611 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `expired` | 599 | 6 | 6 |
| `forming` | 5 | 2 | 2 |
| `invalid` | 7 | 3 | 3 |

#### 4-7. ローリング窓 3672（`btc_jpy_1hour_2026_09_05` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_pattern_height_below_min` | 48325 | 27237 | 104 | 104 |
| 2 | `forming_peaks_not_level` | 21088 | 278 | 4 | 4 |
| 3 | `forming_current_above_peak_zone` | 20810 | 4082 | 48 | 48 |
| 4 | `forming_completion_below_min` | 16728 | 0 | 0 | 0 |
| 5 | `forming_bars_out_of_range` | 16728 | 3986 | 74 | 74 |
| 6 | `prior_trend_mismatch:*` | 12742 | 0 | 0 | 0 |
| 7 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 12742 | 2506 | 17 | 17 |
| 8 | `構造ゲート（#126）` | 10236 | 4607 | 30 | 30 |
| 9 | `reclassified_as_triple_top` | 5629 | 4971 | 24 | 24 |
| 10 | `forming_peaks_below_neckline` | 658 | 0 | 0 | 0 |
| — | **accepted** | 658 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `expired` | 656 | 7 | 7 |
| `forming` | 1 | 1 | 1 |
| `invalid` | 1 | 1 | 1 |

### 5. ローリング窓での追跡（accepted になった構造のその後）

先頭固定・終端を 1 本ずつ動かす窓なので、ピボットの idx が窓をまたいで安定する。ある構造が**初めて形成中として現れた窓より後**の窓で、`completed` になったか / 終端 status（`expired` / `invalid`）になったか / どちらにもならなかったかを 3 分類する（#260 §8 と同じ）。同じ構造は複数の `swingDepth` レーンに出るので、レーンを OR で畳む。

| 経路 | 追跡できた構造 | その後 completed | その後 終端 status | どちらにもならず |
|---|---:|---:|---:|---:|
| 現行 top | 0 | 0 | 0 | 0 |
| 現行 bottom | 7 | 0 | 7 | 0 |
| ablation A（bottom） | 0 | 0 | 0 | 0 |
| ablation B（top） | 5 | 0 | 5 | 0 |

### 6. ablation B で新たに accepted になる `double_top` の明細（目視判定の材料）

実体 **13 件**（延べ 1536 件 / 構造 27 件）。

| # | 実体（時間足 / 構成点の絶対時刻） | status | 系列 / sd / 終端 | 山1 終値 | 谷 終値 | 山2 終値 | 現値 | 山 relDiff | completion |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `1day\|double_top\|2026-01-04T00:00:00.000Z-2026-01-10T00:00:00.000Z-2026-01-15T00:00:00.000Z` | `invalid` | forming_symmetrical_triangle / sd=2,3 / end=35 | 137 | 100 | 134 | 114 | 2.190% | 86 |
| 2 | `1day\|double_top\|2026-01-30T00:00:00.000Z-2026-01-31T00:00:00.000Z-2026-02-06T00:00:00.000Z` | `invalid` | uptrend_fake_double_bottom / sd=2,3 / end=55 | 245 | 232 | 246 | 248 | 0.407% | 66 |
| 3 | `1hour\|double_top\|2026-08-27T15:00:00.000Z-2026-08-27T18:00:00.000Z-2026-08-28T01:00:00.000Z` | `expired` | btc_jpy_1hour_2026_09 btc_jpy_1hour_2026_09_05 / sd=2,3,auto / end=364 | 12,799,028 | 12,766,911 | 12,839,153 | 12,414,587 | 0.313% | 100 |
| 4 | `1hour\|double_top\|2026-09-03T21:00:00.000Z-2026-09-04T02:00:00.000Z-2026-09-04T06:00:00.000Z` | `expired` | btc_jpy_1hour_2026_09_05 / sd=2,3,6,auto / end=364 | 12,718,980 | 12,617,594 | 12,639,245 | 12,465,523 | 0.627% | 100 |
| 5 | `1hour\|double_top\|2026-08-13T05:00:00.000Z-2026-08-13T16:00:00.000Z-2026-08-13T22:00:00.000Z` | `expired` | btc_jpy_1hour_2026_08 / sd=6 / end=59 | 10,173,012 | 10,066,580 | 10,132,001 | 10,047,998 | 0.403% | 100 |
| 6 | `1day\|double_top\|2026-08-21T08:00:00.000Z-2026-08-21T09:00:00.000Z-2026-08-21T23:00:00.000Z` | `invalid` | btc_jpy_1hour_2026_08 btc_jpy_1hour_2026_09 / sd=6,auto / end=227 | 12,571,740 | 12,351,281 | 12,445,660 | 12,272,002 | 1.003% | 100 |
| 7 | `1hour\|double_top\|2026-08-21T08:00:00.000Z-2026-08-21T09:00:00.000Z-2026-08-21T23:00:00.000Z` | `invalid` | btc_jpy_1hour_2026_08 btc_jpy_1hour_2026_09 / sd=6 / end=238 | 12,571,740 | 12,351,281 | 12,445,660 | 12,253,001 | 1.003% | 100 |
| 8 | `1hour\|double_top\|2026-08-21T23:00:00.000Z-2026-08-22T10:00:00.000Z-2026-08-22T16:00:00.000Z` | `expired / forming` | btc_jpy_1hour_2026_08 btc_jpy_1hour_2026_09 btc_jpy_1hour_2026_09_05 / sd=6 / end=253 | 12,445,660 | 12,215,999 | 12,275,104 | 12,150,000 | 1.370% | 100 |
| 9 | `4hour\|double_top\|2026-08-21T23:00:00.000Z-2026-08-22T10:00:00.000Z-2026-08-22T16:00:00.000Z` | `expired` | btc_jpy_1hour_2026_08 btc_jpy_1hour_2026_09 btc_jpy_1hour_2026_09_05 / sd=6,auto / end=261 | 12,445,660 | 12,215,999 | 12,275,104 | 12,261,652 | 1.370% | 74 |
| 10 | `1hour\|double_top\|2026-08-23T21:00:00.000Z-2026-08-24T04:00:00.000Z-2026-08-24T15:00:00.000Z` | `invalid` | btc_jpy_1hour_2026_08 btc_jpy_1hour_2026_09 btc_jpy_1hour_2026_09_05 / sd=6 / end=299 | 12,357,128 | 12,213,097 | 12,582,009 | 12,726,672 | 1.787% | 66 |
| 11 | `1hour\|double_top\|2026-08-25T02:00:00.000Z-2026-08-25T13:00:00.000Z-2026-08-25T16:00:00.000Z` | `expired / forming` | btc_jpy_1hour_2026_08 btc_jpy_1hour_2026_09 btc_jpy_1hour_2026_09_05 / sd=6 / end=328 | 12,851,000 | 12,531,708 | 12,617,817 | 12,481,448 | 1.815% | 100 |
| 12 | `4hour\|double_top\|2026-08-25T02:00:00.000Z-2026-08-25T13:00:00.000Z-2026-08-25T16:00:00.000Z` | `expired` | btc_jpy_1hour_2026_08 btc_jpy_1hour_2026_09 btc_jpy_1hour_2026_09_05 / sd=6,auto / end=336 | 12,851,000 | 12,531,708 | 12,617,817 | 12,501,187 | 1.815% | 100 |
| 13 | `1hour\|double_top\|2026-08-31T19:00:00.000Z-2026-09-01T02:00:00.000Z-2026-09-01T05:00:00.000Z` | `expired` | btc_jpy_1hour_2026_09 btc_jpy_1hour_2026_09_05 / sd=2,3,auto / end=308 | 12,598,466 | 12,536,428 | 12,659,390 | 12,428,578 | 0.481% | 100 |

構成点の idx（フィクスチャを直接引くための検算用）:

| # | 系列 | tf | sd | 終端 idx | 山1 idx | 谷 idx | 山2 idx |
|---:|---|---|---|---:|---:|---:|---:|
| 1 | forming_symmetrical_triangle | 1day | 2 | 35 | 3 | 9 | 14 |
| 2 | uptrend_fake_double_bottom | 1day | 2 | 55 | 29 | 30 | 36 |
| 3 | btc_jpy_1hour_2026_09 | 1hour | auto | 364 | 174 | 177 | 184 |
| 4 | btc_jpy_1hour_2026_09_05 | 1hour | auto | 364 | 329 | 334 | 338 |
| 5 | btc_jpy_1hour_2026_08 | 1hour | 6 | 59 | 9 | 20 | 26 |
| 6 | btc_jpy_1hour_2026_08 | 1day | auto | 227 | 204 | 205 | 219 |
| 7 | btc_jpy_1hour_2026_08 | 1hour | 6 | 238 | 204 | 205 | 219 |
| 8 | btc_jpy_1hour_2026_08 | 1hour | 6 | 253 | 219 | 230 | 236 |
| 9 | btc_jpy_1hour_2026_08 | 4hour | auto | 261 | 219 | 230 | 236 |
| 10 | btc_jpy_1hour_2026_08 | 1hour | 6 | 299 | 265 | 272 | 283 |
| 11 | btc_jpy_1hour_2026_08 | 1hour | 6 | 328 | 294 | 305 | 308 |
| 12 | btc_jpy_1hour_2026_08 | 4hour | auto | 336 | 294 | 305 | 308 |
| 13 | btc_jpy_1hour_2026_09 | 1hour | auto | 308 | 274 | 281 | 284 |

### 7. `view=debug` の cap=200 への影響

`detect_patterns.ts` の並べ替え（accepted → 型間排他の棄却 → 検出器の棄却）を再現し、**triple + double だけ**で候補総数を数えた（他の検出器を足すと更に増えるので、これは下限）。ablation B は 1 ケースあたりの候補が山ペアの数だけ積まれるので、cap への圧力が上がる。ローリング窓は同じ系列の窓違いなので、この節では固定窓のケースだけを使う。

| 母集団 | ケース | 候補総数 p50 現行 → B | 候補総数 max 現行 → B | cap 超過ケース 現行 → B |
|---|---:|---|---|---|
| 標準コーパス 800（合成 704 + 実データ A 96） | 800 | 9 → 9 | 93 → 100 | 0 → 0 |
| 実データ B 96（`btc_jpy_1hour_2026_08`） | 96 | 229 → 229 | 452 → 491 | 56 → 56 |
| 実データ C 96（`btc_jpy_1hour_2026_09`） | 96 | 193 → 209 | 486 → 527 | 44 → 56 |
| 実データ D 96（`btc_jpy_1hour_2026_09_05`） | 96 | 200 → 218 | 493 → 533 | 44 → 56 |
<!-- END measure_forming_double_asymmetry_262 output -->

## 13. Phase 2 の実測（PR #270 / issue #262 の実装）

**Phase 1（§1〜§12）はコード変更なしの計測で、本節だけが実装後の測定。**
`scripts/measure_forming_double_asymmetry_262.ts` に **strip ビルド**（`detect_doubles.ts` だけを
`main` から取る）を足し、同じ 12,104 ケースで作業ツリー（本 PR）と突き合わせたもの。
`--strip-ref <ref>` で参照先を変えられる。走らせる前に `git fetch origin main` すること。

**strip ≡ `main` の担保**: strip は `detect_doubles.ts` だけを ref から取り、`tools/patterns/` の
残りは作業ツリーのままなので、**本 PR が `tools/patterns/` で他のファイルを触っていたら等価性が崩れる。**
`verifyStripScope` が `git diff --name-only <ref> -- tools/patterns/` を見て、
`detect_doubles.ts` 以外が出たらその場で落とす。

### 13-0. 読みどころ

| 何を | 実測 |
|---|---|
| 既定（`includeForming: false`）の `data.patterns` | **544 ケース全件で完全一致**。未ブレイクの構造は forming バケットなので、検出器は従来どおり `no_breakout` で抜ける |
| `includeForming: true` | 11,560 ケース中 **2,791 ケース**で変わる |
| 理由コードの減少 | `forming_*` の減少は**全件が削除した `tryFormingDoubleBottom` のぶん**（残差 0）。それ以外の減少は `no_breakout` / `no_breakout_relaxed` だけで、これは未ブレイク構造が accepted に移ったぶん |
| 既定で見える `near_completion` の 3 値判定 | **呼べる 4 / 保留 9 / 呼べない 6**（計 19 実体）。Phase 1 §8 で「呼べる」だった 形 07 / 形 09 は両方とも本 PR でも `near_completion` として出て「呼べる」のまま |
| `view=debug` の cap | 実データ C / D で **44 → 36 に減る**。Phase 1 の案 B は 44 → 56 に**増やして**いた——案 B は top をループ経路にして候補を増やす案だったのに対し、本実装は既存のループの分岐を変えるだけで、むしろ削除した `tryFormingDoubleBottom` が積んでいた候補が消えるため |

### 13-1. ハーネスの出力（そのまま）

strip は `detect_doubles.ts` だけを `main` から取り、`tools/patterns/` の残りは作業ツリー。この組み方が `main` と等価であることは、**本 PR が `tools/patterns/` で触ったファイルが `detect_doubles.ts` だけ**であることの検算で担保している（実測: `tools/patterns/detect_doubles.ts`）。§1〜§7 は strip で走らせているので Phase 1 の数字がそのまま再現される。

#### 8-1. 未ブレイク構造の status（延べ / 構造 / 実体）

`breakoutBarIndex` を持たない `patterns` エントリだけを数える（＝ブレイク足が無い構造）。

| type / status | strip 延べ | strip 構造 | strip 実体 | PR 延べ | PR 構造 | PR 実体 |
|---|---:|---:|---:|---:|---:|---:|
| `double_bottom\|expired` | 1182 | 16 | 9 | 435 | 6 | 3 |
| `double_bottom\|forming` | 73 | 10 | 6 | 0 | 0 | 0 |
| `double_bottom\|invalid` | 114 | 11 | 5 | 293 | 16 | 7 |
| `double_bottom\|near_completion` | 0 | 0 | 0 | 325 | 14 | 7 |
| `double_top\|expired` | 0 | 0 | 0 | 721 | 15 | 6 |
| `double_top\|invalid` | 0 | 0 | 0 | 328 | 20 | 11 |
| `double_top\|near_completion` | 0 | 0 | 0 | 537 | 27 | 12 |

#### 8-2. 実体単位の対応表（strip の status → PR の status）

実体キーは `(時間足, type, 構成点の絶対時刻)`。同じ実体が窓によって別の status で現れるので、セルは**その実体に付いた status の集合**。`—` はその側に 1 件も出ないこと。**行はどちらかのビルドで未ブレイクとして現れた実体**に絞り、セルには `completed` も含める——旧 `tryFormingDoubleBottom` は完成済み経路と同じ構造を二重に出していたので、「消えた」と「完成済みとして 1 本になった」を分けないと読めない。

| # | 実体 | strip | PR | 代表ケース |
|---:|---|---|---|---|
| 1 | `1day\|double_bottom\|2026-01-05T00:00:00.000Z-2026-01-11T00:00:00.000Z-2026-01-17T00:00:00.000Z` | forming | near_completion | forming_double_bottom / 1day / sd=2 / end=29 |
| 2 | `1day\|double_bottom\|2026-08-03T00:00:00.000Z-2026-08-07T00:00:00.000Z-2026-08-14T00:00:00.000Z` | forming | — | btc_jpy_1day_2026 / 1day / sd=2 / end=89 |
| 3 | `1day\|double_bottom\|2026-08-03T00:00:00.000Z-2026-08-10T00:00:00.000Z-2026-08-14T00:00:00.000Z` | completed / forming | completed | btc_jpy_1day_2026 / 1day / sd=auto / end=89 |
| 4 | `1day\|double_top\|2026-01-04T00:00:00.000Z-2026-01-10T00:00:00.000Z-2026-01-15T00:00:00.000Z` | — | invalid | forming_symmetrical_triangle / 1day / sd=2 / end=35 |
| 5 | `1day\|double_top\|2026-01-15T00:00:00.000Z-2026-01-20T00:00:00.000Z-2026-01-24T00:00:00.000Z` | — | near_completion | forming_symmetrical_triangle / 1day / sd=2 / end=35 |
| 6 | `1hour\|double_bottom\|2026-01-05T00:00:00.000Z-2026-01-11T00:00:00.000Z-2026-01-17T00:00:00.000Z` | — | near_completion | forming_double_bottom / 1hour / sd=2 / end=29 |
| 7 | `1hour\|double_bottom\|2026-06-05T00:00:00.000Z-2026-06-15T00:00:00.000Z-2026-07-01T00:00:00.000Z` | completed / expired | completed | btc_jpy_1day_2026 / 1hour / sd=6 / end=89 |
| 8 | `1hour\|double_bottom\|2026-08-13T16:00:00.000Z-2026-08-13T22:00:00.000Z-2026-08-14T14:00:00.000Z` | expired / forming | — | btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=59 |
| 9 | `1hour\|double_bottom\|2026-08-20T13:00:00.000Z-2026-08-20T17:00:00.000Z-2026-08-20T19:00:00.000Z` | expired | — | btc_jpy_1hour_2026_09 / 1hour / sd=2 / end=59 |
| 10 | `1hour\|double_bottom\|2026-08-22T10:00:00.000Z-2026-08-22T16:00:00.000Z-2026-08-23T05:00:00.000Z` | invalid | invalid | btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=255 |
| 11 | `1hour\|double_bottom\|2026-08-24T04:00:00.000Z-2026-08-24T07:00:00.000Z-2026-08-24T08:00:00.000Z` | expired | — | btc_jpy_1hour_2026_08 / 1hour / sd=2 / end=364 |
| 12 | `1hour\|double_bottom\|2026-08-25T13:00:00.000Z-2026-08-25T16:00:00.000Z-2026-08-25T21:00:00.000Z` | — | invalid / near_completion | btc_jpy_1hour_2026_08 / 1hour / sd=2 / end=315 |
| 13 | `1hour\|double_bottom\|2026-08-25T21:00:00.000Z-2026-08-26T02:00:00.000Z-2026-08-26T15:00:00.000Z` | expired / forming | — | btc_jpy_1hour_2026_08 / 1hour / sd=auto / end=364 |
| 14 | `1hour\|double_bottom\|2026-08-25T21:00:00.000Z-2026-08-26T06:00:00.000Z-2026-08-26T15:00:00.000Z` | expired / forming / invalid | expired / invalid / near_completion | btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=364 |
| 15 | `1hour\|double_bottom\|2026-08-30T23:00:00.000Z-2026-08-31T09:00:00.000Z-2026-08-31T12:00:00.000Z` | expired / invalid | expired / invalid / near_completion | btc_jpy_1hour_2026_09 / 1hour / sd=auto / end=270 |
| 16 | `1hour\|double_bottom\|2026-09-01T09:00:00.000Z-2026-09-01T14:00:00.000Z-2026-09-01T18:00:00.000Z` | — | near_completion | btc_jpy_1hour_2026_09 / 1hour / sd=auto / end=300 |
| 17 | `1hour\|double_bottom\|2026-09-01T18:00:00.000Z-2026-09-01T23:00:00.000Z-2026-09-02T01:00:00.000Z` | — | invalid / near_completion | btc_jpy_1hour_2026_09 / 1hour / sd=auto / end=307 |
| 18 | `1hour\|double_bottom\|2026-09-02T01:00:00.000Z-2026-09-02T05:00:00.000Z-2026-09-02T13:00:00.000Z` | invalid | invalid | btc_jpy_1hour_2026_09 / 1hour / sd=6 / end=322 |
| 19 | `1hour\|double_bottom\|2026-09-02T13:00:00.000Z-2026-09-02T16:00:00.000Z-2026-09-03T10:00:00.000Z` | invalid | — | btc_jpy_1hour_2026_09 / 1hour / sd=6 / end=364 |
| 20 | `1hour\|double_top\|2026-01-04T00:00:00.000Z-2026-01-10T00:00:00.000Z-2026-01-15T00:00:00.000Z` | — | invalid | forming_symmetrical_triangle / 1hour / sd=2 / end=35 |
| 21 | `1hour\|double_top\|2026-01-06T00:00:00.000Z-2026-01-08T00:00:00.000Z-2026-01-13T00:00:00.000Z` | — | invalid | forming_rising_wedge / 1hour / sd=2 / end=34 |
| 22 | `1hour\|double_top\|2026-01-13T00:00:00.000Z-2026-01-15T00:00:00.000Z-2026-01-20T00:00:00.000Z` | — | invalid | forming_rising_wedge / 1hour / sd=2 / end=34 |
| 23 | `1hour\|double_top\|2026-01-15T00:00:00.000Z-2026-01-20T00:00:00.000Z-2026-01-24T00:00:00.000Z` | — | near_completion | forming_symmetrical_triangle / 1hour / sd=2 / end=35 |
| 24 | `1hour\|double_top\|2026-01-19T00:00:00.000Z-2026-01-22T00:00:00.000Z-2026-01-26T00:00:00.000Z` | — | invalid | forming_ascending_triangle / 1hour / sd=2 / end=32 |
| 25 | `1hour\|double_top\|2026-01-20T00:00:00.000Z-2026-01-22T00:00:00.000Z-2026-01-27T00:00:00.000Z` | — | invalid | forming_rising_wedge / 1hour / sd=2 / end=34 |
| 26 | `1hour\|double_top\|2026-08-13T05:00:00.000Z-2026-08-13T16:00:00.000Z-2026-08-13T22:00:00.000Z` | — | expired | btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=59 |
| 27 | `1hour\|double_top\|2026-08-21T23:00:00.000Z-2026-08-22T10:00:00.000Z-2026-08-22T16:00:00.000Z` | — | expired / near_completion | btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=242 |
| 28 | `1hour\|double_top\|2026-08-23T21:00:00.000Z-2026-08-24T04:00:00.000Z-2026-08-24T15:00:00.000Z` | — | invalid / near_completion | btc_jpy_1hour_2026_08 / 1hour / sd=auto / end=286 |
| 29 | `1hour\|double_top\|2026-08-24T15:00:00.000Z-2026-08-24T17:00:00.000Z-2026-08-24T19:00:00.000Z` | — | invalid / near_completion | btc_jpy_1hour_2026_08 / 1hour / sd=2 / end=289 |
| 30 | `1hour\|double_top\|2026-08-25T02:00:00.000Z-2026-08-25T13:00:00.000Z-2026-08-25T16:00:00.000Z` | — | expired / near_completion | btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=314 |
| 31 | `1hour\|double_top\|2026-08-27T09:00:00.000Z-2026-08-27T13:00:00.000Z-2026-08-27T15:00:00.000Z` | — | invalid | btc_jpy_1hour_2026_08 / 1hour / sd=auto / end=364 |
| 32 | `1hour\|double_top\|2026-08-27T15:00:00.000Z-2026-08-27T18:00:00.000Z-2026-08-28T01:00:00.000Z` | invalid | invalid / near_completion | btc_jpy_1hour_2026_09 / 1hour / sd=2 / end=186 |
| 33 | `1hour\|double_top\|2026-08-31T09:00:00.000Z-2026-08-31T12:00:00.000Z-2026-08-31T19:00:00.000Z` | — | invalid | btc_jpy_1hour_2026_09 / 1hour / sd=auto / end=277 |
| 34 | `1hour\|double_top\|2026-08-31T19:00:00.000Z-2026-09-01T02:00:00.000Z-2026-09-01T05:00:00.000Z` | — | expired / near_completion | btc_jpy_1hour_2026_09 / 1hour / sd=2 / end=286 |
| 35 | `1hour\|double_top\|2026-09-03T21:00:00.000Z-2026-09-04T02:00:00.000Z-2026-09-04T06:00:00.000Z` | completed / invalid | completed / invalid / near_completion | btc_jpy_1hour_2026_09 / 1hour / sd=2 / end=359 |
| 36 | `4hour\|double_bottom\|2026-06-05T00:00:00.000Z-2026-06-15T00:00:00.000Z-2026-07-01T00:00:00.000Z` | completed / expired | completed | btc_jpy_1day_2026 / 4hour / sd=6 / end=89 |
| 37 | `4hour\|double_bottom\|2026-08-21T09:00:00.000Z-2026-08-21T23:00:00.000Z-2026-08-22T10:00:00.000Z` | expired | expired | btc_jpy_1hour_2026_09_05 / 4hour / sd=auto / end=364 |
| 38 | `4hour\|double_bottom\|2026-09-02T01:00:00.000Z-2026-09-02T05:00:00.000Z-2026-09-02T13:00:00.000Z` | — | invalid | btc_jpy_1hour_2026_09 / 4hour / sd=6 / end=322 |
| 39 | `4hour\|double_top\|2026-08-21T23:00:00.000Z-2026-08-22T10:00:00.000Z-2026-08-22T16:00:00.000Z` | — | expired / near_completion | btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=241 |
| 40 | `4hour\|double_top\|2026-08-23T21:00:00.000Z-2026-08-24T04:00:00.000Z-2026-08-24T15:00:00.000Z` | — | invalid / near_completion | btc_jpy_1hour_2026_08 / 4hour / sd=3 / end=286 |
| 41 | `4hour\|double_top\|2026-08-25T02:00:00.000Z-2026-08-25T13:00:00.000Z-2026-08-25T16:00:00.000Z` | — | expired / near_completion | btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=313 |

#### 8-3. 理由コードの差分（延べ。全母集団）

**`no_breakout` が減ったぶんが未ブレイク構造の accepted に移っていること**を確かめる。

`削除経路` 列は strip の **`tryFormingDoubleBottom` が積んだぶん**（対照ビルド `noBottom` との差集合で同定。名前では切り分けられない共有コードがあるため）。減少がこの列で説明できるなら、**その減少は「経路を削除したぶん」であって判定が緩んだのではない。**

| 理由コード | strip | うち削除経路 | PR | 差 | 残差（差 + 削除経路） |
|---|---:|---:|---:|---:|---:|
| `forming_bars_out_of_range` | 21451 | 17292 | 4159 | -17292 | 0 |
| `forming_current_below_valley_zone` | 3972 | 3972 | 0 | -3972 | 0 |
| `forming_pattern_height_below_min` | 87473 | 87473 | 0 | -87473 | 0 |
| `forming_peak_too_shallow` | 12761 | 12761 | 0 | -12761 | 0 |
| `forming_valleys_above_neckline` | 743 | 743 | 0 | -743 | 0 |
| `forming_valleys_not_level` | 5991 | 5991 | 0 | -5991 | 0 |
| `neckline_above_pre_decline_high` | 23835 | 16687 | 22958 | -877 | +15810 |
| `neckline_below_pre_decline_low` | 296 | 0 | 25401 | +25105 | +25105 |
| `no_breakout` | 55819 | 0 | 1672 | -54147 | -54147 |
| `no_breakout_relaxed` | 43940 | 0 | 1248 | -42692 | -42692 |
| `no_neckline_cross_before_peak1` | 0 | 0 | 270 | +270 | +270 |
| `no_neckline_cross_before_trough1` | 768 | 768 | 0 | -768 | 0 |
| `peaks_diff_vs_height_excess` | 0 | 0 | 184 | +184 | +184 |
| `prior_trend_mismatch:up` | 8526 | 3826 | 8518 | -8 | +3818 |
| `reclassified_as_triple_bottom` | 5662 | 5614 | 14228 | +8566 | +14180 |
| `reclassified_as_triple_top` | 88 | 0 | 26080 | +25992 | +25992 |
| `retracement_out_of_band` | 2510 | 2114 | 6084 | +3574 | +5688 |
| `valleys_diff_vs_height_excess` | 628 | 0 | 1534 | +906 | +906 |

#### 8-4. `data.patterns` が食い違ったケース数

| `includeForming` | ケース | 食い違い |
|---|---:|---:|
| includeForming: false（既定） | 544 | 0 |
| includeForming: true | 11560 | 2791 |

食い違ったケース（重複を畳んで 2713 行。**明細はハーネスの出力を参照**（本メモでは省略）。

#### 8-5. Phase 1 の ablation B（13 実体）との突き合わせ

ablation B は **bottom のゲート集合**で top を組んだもので、本 PR は**完成済みのゲート集合**で組んでいる。集合が違うので accepted な実体も変わりうる——`double_top` の未ブレイク構造について、ablation B が accepted にした実体と本 PR の実体を突き合わせる（`—` はその側に無いこと）。

| # | 実体 | ablation B | PR | 代表ケース |
|---:|---|---|---|---|
| 1 | `1day\|double_top\|2026-01-04T00:00:00.000Z-2026-01-10T00:00:00.000Z-2026-01-15T00:00:00.000Z` | invalid | invalid | forming_symmetrical_triangle / 1day / sd=2 / end=35 |
| 2 | `1day\|double_top\|2026-01-15T00:00:00.000Z-2026-01-20T00:00:00.000Z-2026-01-24T00:00:00.000Z` | — | near_completion | forming_symmetrical_triangle / 1day / sd=2 / end=35 |
| 3 | `1day\|double_top\|2026-01-30T00:00:00.000Z-2026-01-31T00:00:00.000Z-2026-02-06T00:00:00.000Z` | invalid | — |  |
| 4 | `1day\|double_top\|2026-08-21T08:00:00.000Z-2026-08-21T09:00:00.000Z-2026-08-21T23:00:00.000Z` | invalid | — |  |
| 5 | `1hour\|double_top\|2026-01-04T00:00:00.000Z-2026-01-10T00:00:00.000Z-2026-01-15T00:00:00.000Z` | — | invalid | forming_symmetrical_triangle / 1hour / sd=2 / end=35 |
| 6 | `1hour\|double_top\|2026-01-06T00:00:00.000Z-2026-01-08T00:00:00.000Z-2026-01-13T00:00:00.000Z` | — | invalid | forming_rising_wedge / 1hour / sd=2 / end=34 |
| 7 | `1hour\|double_top\|2026-01-13T00:00:00.000Z-2026-01-15T00:00:00.000Z-2026-01-20T00:00:00.000Z` | — | invalid | forming_rising_wedge / 1hour / sd=2 / end=34 |
| 8 | `1hour\|double_top\|2026-01-15T00:00:00.000Z-2026-01-20T00:00:00.000Z-2026-01-24T00:00:00.000Z` | — | near_completion | forming_symmetrical_triangle / 1hour / sd=2 / end=35 |
| 9 | `1hour\|double_top\|2026-01-19T00:00:00.000Z-2026-01-22T00:00:00.000Z-2026-01-26T00:00:00.000Z` | — | invalid | forming_ascending_triangle / 1hour / sd=2 / end=32 |
| 10 | `1hour\|double_top\|2026-01-20T00:00:00.000Z-2026-01-22T00:00:00.000Z-2026-01-27T00:00:00.000Z` | — | invalid | forming_rising_wedge / 1hour / sd=2 / end=34 |
| 11 | `1hour\|double_top\|2026-08-13T05:00:00.000Z-2026-08-13T16:00:00.000Z-2026-08-13T22:00:00.000Z` | expired | expired | btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=59 |
| 12 | `1hour\|double_top\|2026-08-21T08:00:00.000Z-2026-08-21T09:00:00.000Z-2026-08-21T23:00:00.000Z` | invalid | — |  |
| 13 | `1hour\|double_top\|2026-08-21T23:00:00.000Z-2026-08-22T10:00:00.000Z-2026-08-22T16:00:00.000Z` | expired / forming | expired / near_completion | btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=242 |
| 14 | `1hour\|double_top\|2026-08-23T21:00:00.000Z-2026-08-24T04:00:00.000Z-2026-08-24T15:00:00.000Z` | invalid | invalid / near_completion | btc_jpy_1hour_2026_08 / 1hour / sd=auto / end=286 |
| 15 | `1hour\|double_top\|2026-08-24T15:00:00.000Z-2026-08-24T17:00:00.000Z-2026-08-24T19:00:00.000Z` | — | invalid / near_completion | btc_jpy_1hour_2026_08 / 1hour / sd=2 / end=289 |
| 16 | `1hour\|double_top\|2026-08-25T02:00:00.000Z-2026-08-25T13:00:00.000Z-2026-08-25T16:00:00.000Z` | expired / forming | expired / near_completion | btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=314 |
| 17 | `1hour\|double_top\|2026-08-27T09:00:00.000Z-2026-08-27T13:00:00.000Z-2026-08-27T15:00:00.000Z` | — | invalid | btc_jpy_1hour_2026_08 / 1hour / sd=auto / end=364 |
| 18 | `1hour\|double_top\|2026-08-27T15:00:00.000Z-2026-08-27T18:00:00.000Z-2026-08-28T01:00:00.000Z` | expired | invalid / near_completion | btc_jpy_1hour_2026_09 / 1hour / sd=2 / end=186 |
| 19 | `1hour\|double_top\|2026-08-31T09:00:00.000Z-2026-08-31T12:00:00.000Z-2026-08-31T19:00:00.000Z` | — | invalid | btc_jpy_1hour_2026_09 / 1hour / sd=auto / end=277 |
| 20 | `1hour\|double_top\|2026-08-31T19:00:00.000Z-2026-09-01T02:00:00.000Z-2026-09-01T05:00:00.000Z` | expired | expired / near_completion | btc_jpy_1hour_2026_09 / 1hour / sd=2 / end=286 |
| 21 | `1hour\|double_top\|2026-09-03T21:00:00.000Z-2026-09-04T02:00:00.000Z-2026-09-04T06:00:00.000Z` | expired | completed / invalid / near_completion | btc_jpy_1hour_2026_09 / 1hour / sd=2 / end=359 |
| 22 | `4hour\|double_top\|2026-08-21T23:00:00.000Z-2026-08-22T10:00:00.000Z-2026-08-22T16:00:00.000Z` | expired | expired / near_completion | btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=241 |
| 23 | `4hour\|double_top\|2026-08-23T21:00:00.000Z-2026-08-24T04:00:00.000Z-2026-08-24T15:00:00.000Z` | — | invalid / near_completion | btc_jpy_1hour_2026_08 / 4hour / sd=3 / end=286 |
| 24 | `4hour\|double_top\|2026-08-25T02:00:00.000Z-2026-08-25T13:00:00.000Z-2026-08-25T16:00:00.000Z` | expired | expired / near_completion | btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=313 |

#### 8-6. `near_completion` の実体の 3 値判定（Phase 1 §8-2 の基準をそのまま数値で当てる）

**既定（`includeInvalid: false`）で利用者に見えるのは `near_completion` だけ**なので、この集合だけを判定する。基準は Phase 1 §8-2 の 5 段を順に当て、最初に当たったものを採る（1: 中間構成点が第1構成点の隣接足 / 2: 第2構成点以降に外側の極値を超えた / 3: 深さ < 0.5% / 4: 深さ ≥ 1.0% かつ第2構成点以降にネックラインを抜けた / 5: それ以外は保留）。使う量は構成点の終値・極値と区間の最高安値だけで、**検出器も閾値も通していない。**

| # | 実体 | 間隔 | 深さ | 判定 | 根拠 | 代表ケース |
|---:|---|---:|---:|---|---|---|
| 1 | `1day\|double_bottom\|2026-01-05T00:00:00.000Z-2026-01-11T00:00:00.000Z-2026-01-17T00:00:00.000Z` | 6 本 | 26.250% | **保留** | 基準 5（該当なし） | forming_double_bottom / 1day / sd=2 / end=29 |
| 2 | `1day\|double_top\|2026-01-15T00:00:00.000Z-2026-01-20T00:00:00.000Z-2026-01-24T00:00:00.000Z` | 5 本 | 22.388% | **保留** | 基準 5（該当なし） | forming_symmetrical_triangle / 1day / sd=2 / end=35 |
| 3 | `1hour\|double_bottom\|2026-01-05T00:00:00.000Z-2026-01-11T00:00:00.000Z-2026-01-17T00:00:00.000Z` | 6 本 | 26.250% | **保留** | 基準 5（該当なし） | forming_double_bottom / 1hour / sd=2 / end=29 |
| 4 | `1hour\|double_bottom\|2026-08-25T13:00:00.000Z-2026-08-25T16:00:00.000Z-2026-08-25T21:00:00.000Z` | 3 本 | 0.687% | **保留** | 基準 5（該当なし） | btc_jpy_1hour_2026_08 / 1hour / sd=2 / end=315 |
| 5 | `1hour\|double_bottom\|2026-08-25T21:00:00.000Z-2026-08-26T06:00:00.000Z-2026-08-26T15:00:00.000Z` | 9 本 | 0.364% | **呼べない** | 基準 3（深さ < 0.5%） | btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=364 |
| 6 | `1hour\|double_bottom\|2026-08-30T23:00:00.000Z-2026-08-31T09:00:00.000Z-2026-08-31T12:00:00.000Z` | 10 本 | 0.883% | **保留** | 基準 5（該当なし） | btc_jpy_1hour_2026_09 / 1hour / sd=auto / end=270 |
| 7 | `1hour\|double_bottom\|2026-09-01T09:00:00.000Z-2026-09-01T14:00:00.000Z-2026-09-01T18:00:00.000Z` | 5 本 | 0.286% | **呼べない** | 基準 3（深さ < 0.5%） | btc_jpy_1hour_2026_09 / 1hour / sd=auto / end=300 |
| 8 | `1hour\|double_bottom\|2026-09-01T18:00:00.000Z-2026-09-01T23:00:00.000Z-2026-09-02T01:00:00.000Z` | 5 本 | 0.445% | **呼べない** | 基準 3（深さ < 0.5%） | btc_jpy_1hour_2026_09 / 1hour / sd=auto / end=307 |
| 9 | `1hour\|double_top\|2026-01-15T00:00:00.000Z-2026-01-20T00:00:00.000Z-2026-01-24T00:00:00.000Z` | 5 本 | 22.388% | **保留** | 基準 5（該当なし） | forming_symmetrical_triangle / 1hour / sd=2 / end=35 |
| 10 | `1hour\|double_top\|2026-08-21T23:00:00.000Z-2026-08-22T10:00:00.000Z-2026-08-22T16:00:00.000Z` | 11 本 | 1.845% | **呼べる** | 基準 4 | btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=242 |
| 11 | `1hour\|double_top\|2026-08-23T21:00:00.000Z-2026-08-24T04:00:00.000Z-2026-08-24T15:00:00.000Z` | 7 本 | 1.166% | **保留** | 基準 5（該当なし） | btc_jpy_1hour_2026_08 / 1hour / sd=auto / end=286 |
| 12 | `1hour\|double_top\|2026-08-24T15:00:00.000Z-2026-08-24T17:00:00.000Z-2026-08-24T19:00:00.000Z` | 2 本 | 0.416% | **呼べない** | 基準 3（深さ < 0.5%） | btc_jpy_1hour_2026_08 / 1hour / sd=2 / end=289 |
| 13 | `1hour\|double_top\|2026-08-25T02:00:00.000Z-2026-08-25T13:00:00.000Z-2026-08-25T16:00:00.000Z` | 11 本 | 2.485% | **呼べる** | 基準 4 | btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=314 |
| 14 | `1hour\|double_top\|2026-08-27T15:00:00.000Z-2026-08-27T18:00:00.000Z-2026-08-28T01:00:00.000Z` | 3 本 | 0.251% | **呼べない** | 基準 3（深さ < 0.5%） | btc_jpy_1hour_2026_09 / 1hour / sd=2 / end=186 |
| 15 | `1hour\|double_top\|2026-08-31T19:00:00.000Z-2026-09-01T02:00:00.000Z-2026-09-01T05:00:00.000Z` | 7 本 | 0.492% | **呼べない** | 基準 3（深さ < 0.5%） | btc_jpy_1hour_2026_09 / 1hour / sd=2 / end=286 |
| 16 | `1hour\|double_top\|2026-09-03T21:00:00.000Z-2026-09-04T02:00:00.000Z-2026-09-04T06:00:00.000Z` | 5 本 | 0.797% | **保留** | 基準 5（該当なし） | btc_jpy_1hour_2026_09 / 1hour / sd=2 / end=359 |
| 17 | `4hour\|double_top\|2026-08-21T23:00:00.000Z-2026-08-22T10:00:00.000Z-2026-08-22T16:00:00.000Z` | 11 本 | 1.845% | **呼べる** | 基準 4 | btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=241 |
| 18 | `4hour\|double_top\|2026-08-23T21:00:00.000Z-2026-08-24T04:00:00.000Z-2026-08-24T15:00:00.000Z` | 7 本 | 1.166% | **保留** | 基準 5（該当なし） | btc_jpy_1hour_2026_08 / 4hour / sd=3 / end=286 |
| 19 | `4hour\|double_top\|2026-08-25T02:00:00.000Z-2026-08-25T13:00:00.000Z-2026-08-25T16:00:00.000Z` | 11 本 | 2.485% | **呼べる** | 基準 4 | btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=313 |

集計: **保留 9** / **呼べない 6** / **呼べる 4**（計 19 実体）

#### 8-7. `view=debug` の cap への影響（PR）

| 母集団 | ケース | 候補総数 p50 strip → PR | max strip → PR | cap 超過ケース strip → PR |
|---|---:|---|---|---|
| 標準コーパス 800（合成 704 + 実データ A 96） | 800 | 9 → 9 | 93 → 86 | 0 → 0 |
| 実データ B 96（`btc_jpy_1hour_2026_08`） | 96 | 229 → 229 | 452 → 411 | 56 → 56 |
| 実データ C 96（`btc_jpy_1hour_2026_09`） | 96 | 193 → 181 | 486 → 444 | 44 → 36 |
| 実データ D 96（`btc_jpy_1hour_2026_09_05`） | 96 | 200 → 184 | 493 → 454 | 44 → 36 |
