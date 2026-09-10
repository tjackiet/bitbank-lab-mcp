# 形成中 `double_top` の `formationBars` を「パターン長」で測る計測（issue #268 Phase 1）

`scripts/measure_forming_double_top_268.ts` の出力（§13 に verbatim）に、読み方（§1）・結論（§2）・
問題設定（§3）・目視判定（§7）・契約への影響（§11）・案の比較（§12）を足したメモ。

**検出器・`structural.ts`・`config.ts`・ベースライン・`status` の enum は 1 行も変更していない。**
本 Phase の成果物はスクリプトと本メモと issue コメントだけで、**決定はしない**。

計測ハーネスは PR #267 / PR #270（`scripts/measure_forming_double_asymmetry_262.ts`）に倣った。
コーパス・ケース数・「延べ / 構造 / 実体」の定義は
[`forming-triple-level-spread-178.md`](./forming-triple-level-spread-178.md) §1 が単一ソース。
前提となる実測は [`forming-double-asymmetry-262.md`](./forming-double-asymmetry-262.md)
§4（ファネル）/ §8-2（目視の数値基準）/ §13（PR #270 の実測）。

## 1. 読み方

- **経路の同定を理由コードの名前でやっていない。** 形成中経路の棄却理由には完成済み経路と
  共有のものがある（`prior_trend_mismatch:*` と `validateReversalStructure` の 5 コード）。
  名前で振り分けると完成済みの棄却が混ざるので、**`tryFormingDoubleTop` を丸ごと `return null` に
  差し替えた対照ビルド**（`noTop`）を置き、同じケースの `debugCandidates` の差集合を取っている。
  部分列であることを毎ケース検算しており、崩れたらその場で例外になる。

  | ビルド | 中身 | 用途 |
  |---|---|---|
  | `base` | 本体は 1 文字も変えない（末尾に `export { … }` を 1 行足すだけ） | §4 の分布。作業ツリーとの一致を §13-0 が全ケースで検算 |
  | `noTop` | `tryFormingDoubleTop` を `return null` に | 形成中 top 経路の候補を差分で同定する対照 |
  | `ablP` | **左の山の探索だけ**を差し替え | §5（主指標） |
  | `ablP+minDist` | `ablP` ＋ 中間構成点の `minDist`（#269） | §6 |

- **ablation は「探索だけ」の差し替えで、関数の書き写しではない。** `ablP` が置き換えるのは
  `tryFormingDoubleTop` の「`lastConfirmedPeak` を取る行」から「`const valley = valleyAfterPeak;`」
  までの**範囲**だけで、**それ以外は作業ツリーとバイト単位で同一**。同水準判定・完成度・
  `formationBars` の式・トレンド・サイズ検査・構造ゲート・ネックライン側判定・戻り値の組み立ては
  1 バイトも動いていない。閾値（`DOUBLE_LEVEL_MAX_PCT` / `getDoubleFormingBarParams` /
  `FORMING_*`）も 1 つも動かしていない。アンカーはすべて「ちょうど 1 回現れる」ことを
  差し替え前に確認する（PR #270 のハーネスと同じ流儀）。

  `ablP+minDist` はこれに加えて `ctx` の分割代入 1 行と、構成点が揃った直後のゲート 1 ブロックを足す。

- **`ablP` の探索の仕様**（issue #268 の計測仕様どおり）:

  1. 確定山（`p.idx < lastIdx - 2`）を**新しい順**に回す
  2. `isSameLevel(current, peak, DOUBLE_LEVEL_MAX_PCT)` を満たす最初の山を左の山にする
  3. 谷はその山と最新足の間の**最安値の谷**（strict / 形成中 triple と同じ取り方）
  4. **最新足より高い山が現れた時点で探索を止める**（既定。理由は §3-2）
  5. `formationBars = lastIdx − leftPeak.idx` は式も閾値もそのまま（**意味だけが変わる**）

- **`ablP` では既存の 2 つの同水準判定が構造的に 0 件になる。** 探索が
  `isSameLevel(…, DOUBLE_LEVEL_MAX_PCT)` を保証するので、`forming_peak_level_out_of_tolerance`
  （±5%）も `forming_peaks_not_level`（3%）も**もう発火しない**。ファネル表の 0 はバグではなく
  この帰結で、**案 A を採るならこの 2 分岐は死にコードになる**（§11-2 / §12）。

- **実データ B / C / D は独立系列ではない。** 同じ btc_jpy 1 時間足履歴の重なる窓なので、
  構造の実体数を言うときは絶対時刻で畳む（「実体」列）。標準コーパスの「実データ A 96」は
  `btc_jpy_1day_2026` の同じ 90 本に `tf` ラベルを付け替えたもので、時間足別の内訳は
  独立系列ではない（#178）。

- **ファネル表は自己検算付き。** 段階の並びに載らない理由コードが 1 つでも出れば「未分類」行が
  立ち、残差と accepted の延べが食い違えば警告行が出る。§13 の出力に警告行は 1 つも無い。

## 2. 結論（計測結果の要約。対策の決定は含まない）

1. **`base` のファネルは #262 Phase 1 §4 と延べまで一致する。** 候補 11,528 →
   `forming_bars_out_of_range` に到達した 4,303 のうち 4,159（96.7%）が落ち、**全件が下限割れ**
   （`formationBars` min 3 / p50 11 / max 38）→ accepted 0。ハーネスの互換性が取れている。
2. **`ablP` は accepted 0 → `forming` 延べ 129 / 構造 21 / 実体 8 になる。** ただし出るのは
   **ローリング窓だけ**で、**値動きとしては 3 つ**（実データ B の idx で 山1–谷 =
   204-249 / 219-249 / 265-272）。実データ B / C / D は同じ履歴の重なる窓なので 3 系列すべてに
   同じ 3 形が出て、構造 21 はそれを時間足ラベル込みで数えたもの、実体 8 は絶対時刻で畳んだもの。
   **標準コーパス 800 と固定窓 4 母集団では 0 件のまま。**
3. **`formationBars` の意味は狙いどおり変わった。** accepted の `formationBars` は
   **min 34 / p50 76 / max 94**。`base` の棄却分布（p50 11）とは桁が違う。
   ただし削除前の `tryFormingDoubleBottom`（p50 230）よりは短い。
4. **律速は `forming_bars_out_of_range` のまま。** `ablP` でも到達 8,206 の **86.1%（7,068 件）**が
   ここで落ち、**全件が下限割れ**。探索を変えても下限割れが主因なのは変わらない——
   「最新足と同水準の山」を新しい順に探すと近い山が先に当たるうえ、遡行は
   `forming_search_blocked_by_higher_peak` で 274 件止まる（§5-2）。
5. **#269（中間構成点の `minDist`）は accepted を 1 件も落とさない。** `ablP` と `ablP+minDist` の
   accepted は**どちらも延べ 129 / 構造 21 / 実体 8 で完全に同じ**。谷が山1 の隣接足である候補は
   `ablP` の 10,664 件中 **1,079 件（10.1%）**あり、`minDist` ゲート自体は **2,641 件（24.8%）**を
   落とすが、**accepted になったものの `gap1` は min 7 / p50 30**（`gap2` は min 27 / p50 46）で、
   隣接足の形は下流のゲートが既に全部落としている（§6）。
6. **目視判定は 8 実体すべて「保留」。「呼べる」は 0 件で、しかも構造的に出ない。**
   #262 Phase 1 §8-2 の基準 2 / 4 は「第2構成点より後」を見るが、形成中 top では第2構成点が
   最新足そのものなので走査区間が空になる。加えて **8 実体すべてで最新足の高値が山1 の高値を
   超えている**（例: 12,933,047 > 12,600,000）——値動きとしては天井の 2 山目ではなく、
   上昇途中の新高値を「2 つ目の山」と呼んでいる。後続 30 本まで見た補助判定では
   **4 実体が「呼べない」（基準 2）/ 4 実体が「保留」**で、ここでも「呼べる」は 0（§7）。
7. **追跡でも completed に至らない。** `ablP` で形成中になった 8 構造は、後続の窓で
   `completed` 0 / `near_completion` 0 / 終端 status 0 ——**どれにもならなかった**（§8）。
   #262 Phase 1 の「ローリング窓の範囲で形成中 double が完成に至った例は無い」は `ablP` でも同じ。
8. **二重出力（両方が `data.patterns` に残る）は 0 件。ただし逆向きの副作用がある。**
   形成中 accepted 延べ 129 のうち、同じ窓に完成済み経路の `double_top` が並ぶのは 39 ペア
   （すべて `invalid`）。`globalDedup` は **39 ペアすべてを畳み、残るのは形成中のほう**
   （statusScore は `forming` 1 > `invalid` 0）。つまり **`ablP` の形成中が完成済み経路の構造を
   押し出す**。しかも 39 ペアのうち主構成点を 2 点とも共有するのは 3 ペアだけで、
   残り 36 ペアは**別の構造**（`forming[204-249]` が `invalid[265-272-283]` を飲み込む）。
   形成中の `range` が山1 から最新足まで伸びる（p50 76 本）ため、期間 70% 重複で
   無関係な構造まで畳まれる（§9）。
9. **`view=debug` の cap は 1 件も増えない。** 候補総数の p50 / max / cap 超過ケース数は
   3 ビルドで完全に同一。**1 回の呼び出しで積む候補は高々 1 件**（実測 max 1）で、
   #158 の積み方（ループの中では積まず、探索が終わってから 1 件だけ積む）は守れている（§10）。
10. **標準コーパス 800 の `data.patterns` は 1 ケースも動かない。** 差が出るのは実データ B の
    ローリング窓 129 ケースだけ。**合成フィクスチャの行は 0 行。** 一方、ablation を作業ツリーへ
    一時的に当てて `npx vitest run` を回すと **3 件が失敗**する（`ablP` / `ablP+minDist` とも同じ 3 件。
    すべて #158 の理由コード最小ケース。5,696 / 5,699 passed）(§11-1)。

## 3. 問題設定（コードの事実）

### 3-1. 現行の探索と `formationBars` の意味

`tryFormingDoubleTop` は PR #270 後に残った**唯一の形成中 double 経路**で、
「2 つ目の山を作っている途中」（山1 + 谷 + 最新足 = 暫定山2）を出す。

```ts
const lastConfirmedPeak = [...allPeaks].reverse().find((p) => p.idx < lastIdx - 2);   // 最新の確定山 1 つだけ
const valleyAfterPeak = allValleys.find((v) => v.idx > lastConfirmedPeak.idx && v.idx < lastIdx - 1); // その後の最初の谷
…
const formationBars = Math.max(0, lastIdx - leftPeak.idx);   // = 直近の山からの距離
```

| | 左の主構成点 | `formationBars` が測るもの |
|---|---|---|
| 現行 `tryFormingDoubleTop` | **最新の確定山** | 最新の山から今までの距離 |
| 削除前の `tryFormingDoubleBottom` | 谷ペアの左側 | パターン全体の長さ（p50 230 本） |
| 形成中 triple（`detect_triples.ts:1513`） | 確定山ペアの左側 | 同上 |

閾値（`getDoubleFormingBarParams`: 1day 23 / 1hour 34 / 4hour 42 本）は「パターン全体の長さ」を
想定した値なので、top ではほぼ到達できない。#262 Phase 1 §4 の実測がこれを裏づけている。

### 3-2. 遡るときに「最新足より高い山」を挟まない（既定の理由）

`ablP` は確定山を新しい順に回すので、同水準の山に当たる前に**最新足より高い山**を通り過ぎるかを
決める必要がある。**挟まない**を既定にした。

挟むことを許すと「その高い山こそが山1 で、今の最新足はそれより低い」形になる。これは
**切り下がり（lower high）を `double_top` と呼ぶ**ことに等しく、`double_top` が要求する
「同水準の 2 山」ではなく下降トレンドの戻り高値の連続になる。形成中 triple が
`rejectFormingStairStep`（#263）で単調な階段を落としているのと同じ理由で、探索の段階で止める。

止めた回数は `forming_search_blocked_by_higher_peak` として数えてあるので、**緩めた場合に
増えうる候補の上限も読める**（全母集団で 274 件。§5-2）。

## 4. `base` のファネル再現（計測仕様 1）

全母集団（12,104 ケース / うち `includeForming: true` 11,560）で **accepted 0 件**。
全母集団を足し合わせた棄却の内訳:

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

```text
`forming_bars_out_of_range` の内訳（全母集団）: 下限割れ 4159 件 / 上限超え 0 件。
`formationBars` は min 3 / p50 11 / max 38。
```

**#262 Phase 1 §4 の表と 1 件も違わない。** 母集団ごとの内訳は §13 の §1-1〜§1-7。
プールしないのが原則なので、この合計表は「律速がどれか」を 1 つの数字で言うためだけに使う。

## 5. `ablP` のファネルと accepted（計測仕様 2）

### 5-1. 件数

**accepted: `forming` 延べ 129 / 構造 21 / 実体 8**（`base` は 0）。

| # | 段階（コード順） | 到達（延べ） | 棄却（延べ） | 通過率 |
|---:|---|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 11,528 | 0 | 100% |
| 2 | `forming_no_level_peak`（**ablation 固有**） | 11,528 | 364 | 96.8% |
| 3 | `forming_search_blocked_by_higher_peak`（**ablation 固有**） | 11,164 | 274 | 97.5% |
| 4 | `forming_no_valley_after_peak` | 10,890 | 226 | 97.9% |
| 5 | `forming_peak_level_out_of_tolerance` | 10,664 | **0** | 100% |
| 6 | `forming_peaks_not_level` | 10,664 | **0** | 100% |
| 7 | `forming_current_at_or_below_valley` | 10,664 | 2,458 | 76.9% |
| 8 | `forming_completion_below_min` | 8,206 | 0 | 100% |
| 9 | **`forming_bars_out_of_range`** | **8,206** | **7,068** | **13.9%** |
| 10 | `prior_trend_mismatch:*` | 1,138 | 0 | 100% |
| 11 | サイズ（`forming_pattern_too_small` / `forming_valley_too_shallow`） | 1,138 | 809 | 28.9% |
| 12 | 構造ゲート（#126） | 329 | 200 | 39.2% |
| 13 | `forming_peaks_below_neckline` | 129 | 0 | 100% |
| — | **accepted** | **129** | — | — |

```text
`forming_bars_out_of_range` の内訳（全母集団）: 下限割れ 7068 件 / 上限超え 0 件。
`formationBars` は min 3 / p50 13 / max 41。
accepted の `formationBars`: min 34 / p50 76 / max 94（延べ 129 件）。
```

読みどころ:

- **構成点が揃う率が上がる。** `base` は「最新の確定山の後ろに谷があるか」で 5,733 件（49.7%）を
  落としていた。`ablP` は同水準の山を探しに行くので、山1 + 谷が揃うのは
  **5,795 件（`base`）→ 10,664 件（`ablP`）**。探索の 3 分岐で落ちるのは合計 864 件だけ。
- **同水準の 2 分岐は 0 件**（§1 の 5 つ目のブレット）。探索が保証するため。
- **`formationBars` の意味は変わった。** accepted の `formationBars` は min 34 / p50 76 / max 94 で、
  `base` の棄却分布（p50 11）とは桁が違う。**「パターン長」を測るようになっている。**
- **それでも律速は `forming_bars_out_of_range`。** 到達 8,206 件の 86.1% がここで落ち、
  **全件が下限割れ**。棄却側の `formationBars` は p50 13 で `base`（p50 11）とほぼ変わらない。

### 5-2. なぜ「パターン長」にしても下限割れが残るのか

3 つの数字が理由を説明する。

| 数字 | 意味 |
|---|---|
| `forming_search_blocked_by_higher_peak` **274 件** | 遡行が「最新足より高い山」で止まった（§3-2 の既定） |
| `forming_no_level_peak` **364 件** | 最後まで遡っても最新足と同水準（3% 以内）の確定山が無かった |
| 棄却側 `formationBars` **p50 13** | 止まらずに見つかった山も、たいていは**近い山** |

「最新足と同水準の山を新しい順に探す」と、近い山が先に当たる。遠い山まで遡れるのは
「その間に最新足より高い山が 1 つも無く、かつ 3% 以内の水準が続く」ケースだけで、
これは `base` の「直近 23〜42 本に山が無い」ほどではないにせよ、やはり両立しにくい。

**下限割れが残るのは探索の取り方ではなく、`minBars`（1day 23 / 1hour 34 / 4hour 42）が
「2 山が揃った構造」を想定した値だから**、と読むのが素直。閾値を動かさないのが本計測の前提なので、
ここから先（`minBars` を形成中だけ別値にするか）は本 issue の範囲外。

### 5-3. accepted 8 実体の素性

延べ 129 の内訳は実データ B 48 / C 48 / D 33 で、**3 系列とも同じ 3 つの値動き**
（B / C / D は同じ btc_jpy 1 時間足履歴の重なる窓。D の idx + 19 = C の idx、C の idx + 181 = B の idx）。
以下は B の idx で書く。§13 §4-1 の明細表の「系列」列は**最初に当たった代表 1 件**なので B だけが出る。

| 形 | 構成点 idx（山1 - 谷。B の idx） | 代表の終端 idx | `tf` ラベル | §13 §4-1 の行 |
|---|---|---:|---|---|
| A | 204 - 249 | 294 | `1day` / `4hour` / `1hour` | 1, 2, 3 |
| B | 219 - 249 | 295 | `1day` / `4hour` / `1hour` | 4, 5, 6 |
| C | 265 - 272 | 299 / 307 | `1hour` / `4hour`（`1day` では出ない） | 7, 8 |

**3 値動きだけ。** 標準コーパス（合成 704 + 実データ A）と固定窓の 4 母集団では 1 件も出ない。
形 C は #262 Phase 1 §8 の「形 08」（山1 265 / 谷 272 / 山2 283。判定は**呼べない**、基準 2）と
**同じ山1・同じ谷**で、完成済み経路が `invalid[265-272-283]` として拾っている構造（§9）の
1 段手前を見ていることになる。

**山1 が窓ごとに入れ替わる。** 同じレーン（B / `1hour` / `sd=6`）で終端を 1 本ずつ進めると、
形成中として出る構造は `204-249`（end 294）→ `219-249`（295, 296）→ `204-249`（297, 298）→
`265-272`（299）→ `219-249`（300）→ `265-272`（301〜307）と**行き来する**（§13 §6-1 の一覧）。
探索が「最新足と同水準の最初の山」を取る以上、最新足が動けば同水準の判定も動くので、
**隣り合う窓で報告される山1 が変わりうる**。案 A を採るなら、利用者から見た構造の安定性は
この形になる。

## 6. `ablP+minDist` と issue #269（計測仕様 3）

**accepted は `ablP` と完全に同じ（延べ 129 / 構造 21 / 実体 8）。**

| ビルド | 母数（構成点が揃った候補） | `gap1` = 1 本 | `gap2` = 1 本 | `gap1` < `minDist` | `gap2` < `minDist` | どちらか < `minDist` |
|---|---:|---:|---:|---:|---:|---:|
| `ablP` 全候補 | 10,664 | **1,079** | 0 | 2,414 | 454 | **2,641** |
| `ablP` accepted | 129 | 0 | 0 | 0 | 0 | 0 |
| `ablP+minDist` accepted | 129 | 0 | 0 | 0 | 0 | 0 |

- `gap1`（山1–谷）の分布: 全候補 min 1 / p50 5 / max 45、**accepted は min 7 / p50 30 / max 45**
- `gap2`（谷–最新足）の分布: 全候補 min 2 / p50 9 / max 51、**accepted は min 27 / p50 46 / max 51**

読みどころ:

1. **「谷が山1 の隣接足」は確かに存在する。** `ablP` の候補 10,664 件のうち 1,079 件（10.1%）。
   #262 Phase 1 §8 の「呼べない」5 形のうち 2 形の原因になった形と同じもの。
2. **しかし accepted には 1 件も残らない。** `minDist` ゲートは候補 2,641 件（24.8%）を落とすが、
   それらは**下流のゲート（`forming_bars_out_of_range` / サイズ / 構造ゲート）でも落ちていた**。
   ファネルを見ると、`minDist` を足した後も accepted は 129 のまま（§13 §3）。
3. **`formationBars` の下限が事実上 `minDist` の役割を果たしている。** accepted の
   `formationBars` は min 34（= `1hour` の `minBars`）で、その内訳の `gap1` は min 7 / `gap2` は
   min 27。両脚とも `minDist`（`minBarsBetweenSwings`。`1hour` 2 / `4hour` 3 / `1day` 4 本）を
   大きく超える。

**#269 への含意**: `tryFormingDoubleTop` を残す判断（案 A / B）になっても、
**`minDist` を中間構成点に掛ける実装は、実データで拾える形を 1 件も変えない**。
「呼べない」形が accepted に混ざるのを防ぐ保険としての価値はあるが、
**本計測の範囲では効きが観測できない**。#269 は本 issue の結論に従って閉じるか、
「効きは 0 件」を根拠に文書化のみで閉じるのが素直。

## 7. 目視判定（計測仕様 4）

`ablP` / `ablP+minDist` で accepted になった **8 実体**（判定は両ビルドで同一）。
方法は #262 Phase 1 §8-2 の 5 段の数値基準を順に当て、最初に当たったものを採る。
使う量は構成点の終値・極値と区間の最高安値だけで、**検出器も閾値も通していない**。

### 7-1. 基準 2 / 4 は形成中 top では定義上発火しない

| 基準 | 内容 | 形成中 top での可否 |
|---|---|---|
| 1 | 中間構成点が第1構成点の隣接足 → 呼べない | ✅ 効く |
| 2 | **第2構成点以降**に外側の極値を超えた → 呼べない | ❌ 走査区間が空 |
| 3 | 深さ < 0.5% → 呼べない | ✅ 効く |
| 4 | 深さ ≥ 1.0% **かつ第2構成点以降**にネックラインを割った → 呼べる | ❌ 走査区間が空 |
| 5 | それ以外 → 保留 | — |

**第2構成点（暫定の山2）が最新足そのもの**なので、「第2構成点の次の足から窓の終端まで」は
常に空になる。したがって**この基準で「呼べる」は構造的に出ない**——
形成中を「呼べる」と言うには、定義上まだ存在しない後続の足を見るしかない。

そこで 2 通りの数字を出した。

- **本判定**（検出器が見られる情報だけ。走査終端 = 窓の終端）: **保留 8 / 呼べる 0 / 呼べない 0**
- **補助判定**（窓の先 30 本まで走査を伸ばす。**検出器には見えない情報**）:
  **呼べない 4 / 保留 4 / 呼べる 0**

### 7-2. 検算用の実数値（値動きで畳んだ 3 形。形 C は代表の窓が 2 つあるので C / C' の 2 行）

| 形 | 山1 終値 | 谷 終値 | 現値（暫定山2） | 現値 − 山1 | 最新足の高値 vs 山1 の高値 | `gap1` | `gap2` | 深さ | 本判定 | 補助判定 |
|---|---:|---:|---:|---:|---|---:|---:|---:|---|---|
| A（204-249 / end 294） | 12,571,740 | 12,075,755 | 12,851,000 | **+2.221%** | **12,933,047 > 12,600,000** | 45 | 45 | 3.945% | 保留 | 保留 |
| B（219-249 / end 295） | 12,445,660 | 12,075,755 | 12,823,737 | **+3.038%** | **12,894,611 > 12,525,196** | 30 | 46 | 2.972% | 保留 | **呼べない**（基準 2） |
| C（265-272 / end 299） | 12,357,128 | 12,213,097 | 12,726,672 | **+2.991%** | **12,900,000 > 12,396,586** | 7 | 27 | 1.166% | 保留 | 保留 |
| C'（265-272 / end 307） | 12,357,128 | 12,213,097 | 12,663,616 | **+2.480%** | **12,663,616 > 12,396,586** | 7 | 35 | 1.166% | 保留 | **呼べない**（基準 2） |

**8 実体すべてで「最新足の高値 > 山1 の高値」。** つまり検出器が「2 つ目の山を作っている途中」と
言っている足は、**高安で見れば既に山1 を超えた新高値**になっている。#262 Phase 1 §8 の判定基準 2
（「山2 以降に両山の高値を超えた → 呼べない」）が形成中では走査区間の外に落ちるだけで、
値動きとしては同じ性質——**上昇継続の途中を切り取っている**——が全実体に出ている。

現値が山1 の終値を +2.2〜3.0% 上回っているのも同じことの別表現で、
`isSameLevel` の 3% 上限の**上側ぎりぎり**に張り付いている。

### 7-3. 判定

| 形 | 本判定 | 補助判定 | 読み |
|---|---|---|---|
| A | 保留 | 保留 | 深さ 3.945% / 両脚 45 本と形は大きいが、最新足が山1 の高値を 2.6% 超えている。上昇の途中で「2 山目」と呼んでいる |
| B | 保留 | **呼べない**（基準 2） | 終端が 1 本進んだだけで探索が別の山1（204 → 219）を掴んだもの。谷は A と同じ 249。後続 30 本で外側の高値を超える |
| C | 保留 | 保留 | 深さ 1.166% は #262 §8 の形 08（同じ 265-272）と同じ帯。形 08 の完成形は Phase 1 で**呼べない**（基準 2）と判定済み |
| C' | 保留 | **呼べない**（基準 2） | C の 8 本先の窓。同上 |

**集計: 呼べる 0 / 保留 8 / 呼べない 0（本判定）、呼べる 0 / 保留 4 / 呼べない 4（補助判定）。**

issue #268 の判断軸（「accepted が出て、目視で『呼べる』があれば直す」）に照らすと、
**accepted は出たが「呼べる」は 1 件も出ていない。**

## 8. ローリング窓での追跡（計測仕様 5）

| ビルド | 追跡できた構造 | その後 `completed` | その後 `near_completion` | その後 終端 status | どれにもならず |
|---|---:|---:|---:|---:|---:|
| `base`（現行） | 0 | 0 | 0 | 0 | 0 |
| `ablP` | 8 | **0** | **0** | 0 | 8 |
| `ablP+minDist` | 8 | **0** | **0** | 0 | 8 |

構造キーは `(type, 先頭 2 ピボットの idx)` なので、形成中（2 点）と完成済み / `near_completion`
（3 点）が同じ構造として結べる。**8 構造とも、初めて形成中として現れた窓より後の窓で
`completed` にも `near_completion` にも終端 status にもならなかった。**

issue #262 Phase 1 §7-2 の「ローリング窓の範囲では、形成中 double が完成に至った例は top / bottom
どちらにも無い」は、`ablP` でも変わらない。PR #270 で `double_top` にも `near_completion` が
出るようになったが、**`ablP` が拾う 8 構造はその段階にも到達していない。**

## 9. 完成済み経路 / `near_completion` との二重出力（計測仕様 6）

形成中 `double_top` の accepted 延べ 129 件について、同じ窓に完成済み経路の `double_top` が
並ぶかを数えた（`ablP` / `ablP+minDist` で同じ数字）。

| 同じ窓に並んだ完成済み経路の status | 延べ | うち主構成点を 1 点以上共有 | うち 2 点とも共有 |
|---|---:|---:|---:|
| `invalid` | 39 | 3 | 3 |

`near_completion` / `completed` と並んだケースは **0 件**。

| ペアの相手の status | 両方残る（**二重出力**） | 形成中だけ残る | 相手だけ残る |
|---|---:|---:|---:|
| `invalid` | **0** | **39** | 0 |

読みどころ:

1. **#262 が解消した二重出力は再導入されない。** `globalDedup` が 39 ペアすべてを畳むので、
   `data.patterns` に `double_top` が 2 本並ぶケースは 0 件。
2. **ただし残るのは形成中のほう。** `globalDedup` の勝者選択は statusScore
   （`completed` 3 > 未設定 2 > `forming` / `near_completion` 1 > `invalid` / `expired` 0）なので、
   **形成中が完成済み経路の `invalid` を押し出す**。`includeForming: true` かつ
   `includeInvalid: true` で呼ぶと、**`base` が `invalid[265-272-283]` を返していた窓で
   `ablP` は `forming[204-249]` を返す**——件数は 1 のままだが**別の構造**になる。
3. **押し出しの多くは無関係な構造。** 39 ペアのうち主構成点を 2 点とも共有するのは 3 ペアだけ
   （`forming[265-272]` と `invalid[265-272-283]`。これは「同じ構造の別段階」なので畳まれて当然）。
   残り 36 ペアは `forming[204-249]` と `invalid[265-272-283]` のように**構成点を 1 点も共有しない**。
   `ablP` の `range` は山1 から最新足まで伸びる（`formationBars` p50 76 本）ので、
   期間 70% 重複の判定に**短い構造が丸ごと入ってしまう**。

**案 A を採るなら 3 は設計の検討事項**（`range` を構造の終端で切るか、`structureRange` を
dedup に使うか）。`formationBars` を「パターン長」にすると `range` も長くなる、という
**副作用が dedup を通して出力に届く**という関係は本計測で初めて観測された。

## 10. `view=debug` の cap と #158 の積み方（計測仕様 7）

| 母集団 | ケース | 候補総数 p50 `base` → `ablP` → `+minDist` | max | cap 超過ケース |
|---|---:|---|---|---|
| 標準コーパス 800 | 800 | 9 → 9 → 9 | 86 → 86 → 86 | 0 → 0 → 0 |
| 実データ B 96 | 96 | 229 → 229 → 229 | 411 → 411 → 411 | 56 → 56 → 56 |
| 実データ C 96 | 96 | 181 → 181 → 181 | 444 → 444 → 444 | 36 → 36 → 36 |
| 実データ D 96 | 96 | 184 → 184 → 184 | 454 → 454 → 454 | 36 → 36 → 36 |

**1 件も増えない。** 理由は積み方にある。

- **1 回の呼び出しでこの経路が積む候補は高々 1 件**（3 ビルドとも実測 max 1）。
- `ablP` の探索は確定山を回すループだが、**ループの中では候補を 1 件も積まない。**
  探索が終わってから、組めなかった理由を 4 通りのうち 1 つだけ積む
  （`forming_no_confirmed_peak` / `forming_no_level_peak` /
  `forming_search_blocked_by_higher_peak` / `forming_no_valley_after_peak`）。
- これは #158 が `formingHsForHead` に置いた制約
  （「構成点が揃う前の `continue` は候補に積まない」）と同じ形。`tryFormingDoubleTop` の
  docstring は「この関数にはループが無いので全分岐に積む」と書いているが、
  **案 A ではループが入るので docstring の根拠が変わる**（§11-2）。

## 11. 契約への影響（計測仕様 8 と、コードを読んで作った棚卸し）

### 11-1. `data.patterns` と既存テスト

| `includeForming` | ケース | `ablP` で差 | `ablP+minDist` で差 |
|---|---:|---:|---:|
| `false`（既定） | 544 | 0 | 0 |
| `true` | 11,560 | 129 | 129 |

**差が出た 129 ケースはすべてローリング窓**（実データ B 48 / C 48 / D 33。同じ 3 つの値動きが
重なる窓に出たもの）で、**合成フィクスチャは 0 行**。標準コーパス 800 に含まれる合成の値動きでは
`data.patterns` が 1 ケースも動かない。

既存テストへの影響は**実測した**。ablation の `detect_doubles.ts` を
`npx tsx scripts/measure_forming_double_top_268.ts --emit ablP <path>` で書き出して
作業ツリーへ一時的に当て、`npx vitest run` を回して戻した（作業ツリーは元に戻してある）。

| ビルド | 結果 | 失敗したテスト |
|---|---|---|
| `ablP` | **3 failed / 5,696 passed（225 ファイル中 1 ファイル）** | `tests/patterns/forming-double-triple-debug-candidates.test.ts` の理由コード最小ケース 3 件 |
| `ablP+minDist` | 同上（同じ 3 件） | 同上 |

失敗した 3 件はすべて #158 の「新設した理由コードが、それぞれ発火する最小ケースを持つ」:

- `double_top: forming_no_valley_after_peak` — `ablP` では「同水準の山**が見つかった上で**その後に
  谷が無い」ときにしか積まれないので、最小ケースの値動きでは発火しない
- `double_top: forming_peak_level_out_of_tolerance` — **探索が同水準を保証するので死ぬ**
- `double_top: forming_peaks_not_level` — 同上

**#158 の成功エントリ（`data.patterns` と同じ構成点の候補が積まれる）と #169 のサイズ検査は
全部通る。** 案 A を採るなら、この 3 件は「fixture を差し替える」ではなく
**「到達しないガードとして扱う」**（同テストが `forming_completion_below_min` にやっているのと同じ
扱い）か、**2 分岐をコードから消す**かの判断が要る。

### 11-2. コードを読んで作った棚卸し（計測ではない）

| 箇所 | 案 A（`ablP` で実装）を採ったときに動くもの |
|---|---|
| `tryFormingDoubleTop` の docstring | 「この関数にはループが無く…全分岐に積む」の根拠が変わる。**ループが入るので #158 の「構成点が揃う前の分岐には積まない」側の規約に移る**（実装は既にその形。§10） |
| `forming_peak_level_out_of_tolerance` / `forming_peaks_not_level` | **死にコードになる**（探索が同水準を保証するため）。消すか、到達しないガードとして固定するか |
| 理由コードの語彙 | `forming_no_level_peak` / `forming_search_blocked_by_higher_peak` の 2 つが増える。`view=debug` の `▼ reason 横断合計` に出る |
| `range` の長さ | 山1 が遠くなるぶん伸びる（`formationBars` p50 76 本）。`globalDedup` の 70% 重複判定を通して**他の `double_top` を押し出す**（§9-3） |
| `docs/tools.md` | 「`pivots` の並び」の表の `double（形成中。double_top のみ）` の行と、その直後の「`double_bottom` に形成中は無い」の注記は**そのまま**（`pivots` は 2 点のまま、構成も変わらない） |
| `pivots` の点数 | **変わらない**（山1 + 谷の 2 点）。`view=full` の pivot 明細の有無も同じ |
| `status` の enum | **変わらない**（`forming` のまま） |

案 C（経路を削除）を採ったときに動くものは #262 Phase 1 §9 の棚卸しがそのまま使える
（`docs/tools.md` の「`pivots` の並び」の表 / 形成中 triple の単調性ゲート（#263）の注記 /
ネックライン側判定（#261）の 2 つの表と「形成中 `double_top` だけは 2 つの検査で分担する」の節、
`tests/detect_doubles.test.ts` の形成中ダブルトップ 1 件、
`tests/patterns/size-gates-forming-doubles.test.ts` の形成中 top 3 件、
`tests/patterns/forming-double-triple-debug-candidates.test.ts` の double_top 系、
`tests/patterns/default-limit-detection.test.ts` の `countFormingDoubleTop`）。

## 12. Phase 2 の案（決定はしない）

| 案 | 中身 | 実データでの当たり | コスト |
|---|---|---|---|
| **A** | `ablP`（+ `minDist`）で実装 | accepted 0 → 実体 8。ただし**「呼べる」0 件**、`completed` / `near_completion` へも 0 件 | #158 のテスト 3 件、同水準 2 分岐が死にコード化、`range` 伸長による dedup 押し出し（§9-3） |
| **B** | 経路を残したまま文書化（docstring と `docs/tools.md` に「実データではほぼ発火しない。理由は `formationBars` の測り方」） | 変わらず 0 件 | 無し（テスト・契約とも無変更） |
| **C** | 経路を削除 | — | 合成テスト #158 / #169 の期待値が動く。`docs/tools.md` の「形成中 `double_top` のみ」の記述も消える |

### 推奨（Phase 2 の入口。決定ではない）

**案 B を推す。** 根拠は 3 つ。

1. **`ablP` は accepted を出すが、「呼べる」を 1 件も出さない。** #268 のコメントが置いた判断軸
   （「accepted が増え、かつ目視で『呼べる』が出るなら直す」）の後半を満たさない。
   しかも 8 実体すべてで**最新足の高値が山1 の高値を超えている**（§7-2）——
   直した結果拾えるのは「上昇継続の途中」であって天井ではない。
2. **拾える範囲が狭い。** 8 実体は**値動きとしては 3 つ**で、出るのはローリング窓だけ
   （実データ B / C / D は同じ履歴の重なる窓なので、3 系列に出ても別の値動きではない）。
   標準コーパスと固定窓の 4 母集団では 0 件のまま。追跡でも `completed` / `near_completion` に
   1 件も至らない。しかも報告される山1 は隣り合う窓で入れ替わる（§5-3）。
3. **副作用が実出力に届く。** `formationBars` を「パターン長」にすると `range` も伸び、
   `globalDedup` が無関係な `double_top` を押し出す（39 ペア中 36 ペア。§9-3）。
   案 A を採るならこの設計の始末が別途要る。

**案 C（削除）も引き続き候補。** 「実データで 0 件」に加えて「探索を直しても『呼べる』が出ない」が
本計測で分かったので、`tryFormingDoubleTop` を残す積極的な理由は
**triple / H&S との流儀の統一だけ**という #268 本文の整理がそのまま残る。
ただし削除は合成テストと `docs/tools.md` を動かすので、案 B との比較は別途。

**#269 は本計測の範囲では効きが 0 件**（§6）。案 A を採る場合でも `minDist` の追加は
accepted を変えないので、「保険として入れる」以上の根拠は本計測からは出ない。

## 13. 計測スクリプトの出力（そのまま）

再現（**#268 案 C の実装後は `--strip-ref` が必須**。下の注記を参照）:

```bash
npx tsx scripts/measure_forming_double_top_268.ts --strip-ref 27337eb                    # 本メモ §13 の出力
npx tsx scripts/measure_forming_double_top_268.ts --strip-ref 27337eb --json /tmp/268.json
npx tsx scripts/measure_forming_double_top_268.ts --strip-ref 27337eb --no-rolling       # 短時間確認用
npx tsx scripts/measure_forming_double_top_268.ts --strip-ref 27337eb --emit ablP /tmp/detect_doubles.ablP.ts
```

> **`--strip-ref 27337eb` が要る理由。** #268 案 C で `tryFormingDoubleTop` を削除したので、
> 作業ツリーの `detect_doubles.ts` には ablation のアンカーが無く `base` ビルドが組めない。
> `27337eb` は PR #271（本 Phase 1）のマージ commit で、**削除前で #270 マージ後**
> （`near_completion` 導入後なので本メモの数字と突き合わせられる）。
> 付け忘れるとスクリプトが起動時に落ち、渡すべき ref を案内する——**黙って部分結果は出さない。**
> `--strip-ref` は `tools/patterns/` を**丸ごと**その ref から取る（案 C で `min-bars.ts` /
> `structural.ts` も触ったため、検出器 1 ファイルだけの差し替えでは等価にならない）。
> §0(a) の「展開ビルド ≡ 作業ツリー」は、`--strip-ref` があるときは作業ツリービルド `work` と
> 突き合わせる（`base` は ref 側なので比較相手にならない）。
>
> **案 C 後の再計測では §1〜§7 の数字が本メモのまま再現する**（accepted 0 /
> `forming_bars_out_of_range` 下限割れ 4,159 件 / `formationBars` min 3 / p50 11 / max 38）。

最後の `--emit` は ablation の `detect_doubles.ts` を書き出すだけで計測はしない。
§11-1 のテスト実測は、これを作業ツリーへ当てて `npx vitest run` を回し、
`git checkout tools/patterns/detect_doubles.ts` で戻して取った。

<!-- ここから下はスクリプトの標準出力をそのまま貼ったもの。手で編集しないこと。 -->
**作業ツリーは 1 バイトも変更しない。** 本スクリプトは `tools/patterns/` を一時領域へ展開し、`tryFormingDoubleTop` の**左の山の探索だけ**を差し替えたビルドを別に作って走らせるだけ。閾値（`DOUBLE_LEVEL_MAX_PCT` / `getDoubleFormingBarParams` / `FORMING_*`）は 1 つも動かしていない。

### 0. 検算

**(a) 展開ビルド ≡ 作業ツリー**: `tools/patterns/` を一時領域へディレクトリごと展開し、`detect_doubles.ts` の末尾に `export { … }` を 1 行足しただけのビルド（**`base`**）が、作業ツリーの本物と `patterns` / `debugCandidates` の JSON 全キーで一致することを**全ケースで**確かめる。

**(b) 差し替えの範囲**: `ablP` は `tryFormingDoubleTop` の「`lastConfirmedPeak` を取る行」から「`const valley = valleyAfterPeak;`」までを置き換えるだけで、**それ以外は作業ツリーとバイト単位で同一**。`ablP+minDist` はこれに加えて `ctx` の分割代入 1 行とゲート 1 ブロックだけを足す。アンカーはすべて「ちょうど 1 回現れる」ことを差し替え前に確認しており、崩れたらその場で例外になる。

- ✅ 12104 ケース全件で `base` ≡ 作業ツリー（`patterns` / `debugCandidates` とも）
- うち `includeForming: true` は 11560 ケース（形成中経路が呼ばれるのはここだけ）
- strip ビルドは使っていない（検出器を変更しないので作業ツリー = `main` がそのまま対照）
- 展開先: `/tmp/forming-double-top-268-toxc5A`（作業ツリーは 1 バイトも変更していない）
- 形成中の係数（展開ビルドから読んだ値）: `DOUBLE_LEVEL_MAX_PCT` = 0.03 / `FORMING_PEAK_TOLERANCE_PCT` = 0.05 / `FORMING_EXPIRY_BARS` = 20 / `MIN_FORMING_COMPLETION` = 0.4
- 3 つの差し替えビルド（`noTop` / `ablP` / `ablP+minDist`）は、対照ビルドの候補列が `base` の**部分列**であることを毎ケース検算している（崩れたらその場で例外）。
- accepted な候補のうち対応する `PatternEntry` を引けなかった件数（0 であるべき）: 現行 `tryFormingDoubleTop` 0 / ablP（谷を挟んで最新足と同水準の最初の確定山） 0 / ablP+minDist（中間構成点にも `minDist`） 0
- **#158 の積み方**（1 回の呼び出しで積む候補は高々 1 件）: 現行 `tryFormingDoubleTop` max 1 / ablP（谷を挟んで最新足と同水準の最初の確定山） max 1 / ablP+minDist（中間構成点にも `minDist`） max 1

#### 形成中 double が要求する形成バー数（`getDoubleFormingBarParams`）

`formationBars = 最新足の idx − 左の主構成点の idx` がこのレンジに入らないと `forming_bars_out_of_range` で落ちる。**日数（`MIN_PATTERN_DAYS` = 14 日 / `MAX_FORMING_DAYS` = 90 日）は由来の注記で、実効値はバー数**（`patterns/bar-thresholds.ts` の clamp を通した値）。**`ablP` はこの式も閾値も変えない**——変えるのは `leftPeak` の取り方だけで、その結果 `formationBars` の**意味**が「直近の山からの距離」から「パターン長」に変わる。

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

**実データ B / C / D は独立系列ではない。** 同じ btc_jpy 1 時間足履歴の**重なる窓**で、C は B の idx 181 から（B∩C = 184 本）、D は C の idx 19 から（C∩D = 346 本）始まる。**構造の実体数を言うときは絶対時刻で畳む**（本メモの「実体」列）。標準コーパスの「実データ A 96」は `btc_jpy_1day_2026` の同じ 90 本に `tf` ラベルを付け替えたもので、時間足別の内訳は独立系列ではない（#178）。

### 1. `base`（現行 `tryFormingDoubleTop`）のファネル再現

左の主構成点は `[...allPeaks].reverse().find((p) => p.idx < lastIdx - 2)` = **最新の確定山 1 つ**、
谷はその山より後の**最初の**谷。ループが無いので 1 ケースにつき候補は 1 件しか積まれない
——**この表はそのままファネルになる**。#262 Phase 1 §4 の数字が再現することを確かめる。

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

### 2. `ablP`: 谷を挟んで最新足と同水準にある最初の確定山を左の山にする — **主指標**

確定山を新しい順に回し、`isSameLevel(current, peak, DOUBLE_LEVEL_MAX_PCT)` を満たす最初の山を
左の山とする（形成中 triple と同じ流儀）。谷はその山と最新足の間の**最安値の谷**。
**最新足より高い山を挟んで遡らない**（挟むと切り下がりを double_top と呼ぶことになる）。
**探索以外は 1 バイトも変えていない**ので、`forming_peak_level_out_of_tolerance` と
`forming_peaks_not_level` は探索が同水準を保証する結果**構造的に 0 件**になる。

**全母集団の accepted 合計**: `forming` 延べ 129 / 構造 21 / 実体 8

`forming_bars_out_of_range` の内訳（全母集団）: **下限割れ 7068 件 / 上限超え 0 件**。`formationBars` は min 3 / p50 13 / max 41。

**accepted の `formationBars`**: min 34 / p50 76 / max 94（延べ 129 件）。

（`prior_trend_insufficient_data` は棄却ではなく注記として 30 件積まれている。候補の分母には入れていない。）

#### 2-1. 標準コーパス 800（合成 704 + 実データ A 96）（時間足別は参考値）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 368 | 0 | 0 | 0 |
| 2 | `forming_no_level_peak` | 368 | 52 | 0 | 0 |
| 3 | `forming_search_blocked_by_higher_peak` | 316 | 208 | 0 | 0 |
| 4 | `forming_no_valley_after_peak` | 108 | 12 | 3 | 3 |
| 5 | `forming_peak_level_out_of_tolerance` | 96 | 0 | 0 | 0 |
| 6 | `forming_peaks_not_level` | 96 | 0 | 0 | 0 |
| 7 | `forming_current_at_or_below_valley` | 96 | 0 | 0 | 0 |
| 8 | `forming_completion_below_min` | 96 | 0 | 0 | 0 |
| 9 | `forming_bars_out_of_range` | 96 | 96 | 12 | 12 |
| 10 | `prior_trend_mismatch:*` | 0 | 0 | 0 | 0 |
| 11 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 0 | 0 | 0 | 0 |
| 12 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 13 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 2-2. 実データ B 96（`btc_jpy_1hour_2026_08`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 48 | 0 | 0 | 0 |
| 2 | `forming_no_level_peak` | 48 | 0 | 0 | 0 |
| 3 | `forming_search_blocked_by_higher_peak` | 48 | 0 | 0 | 0 |
| 4 | `forming_no_valley_after_peak` | 48 | 0 | 0 | 0 |
| 5 | `forming_peak_level_out_of_tolerance` | 48 | 0 | 0 | 0 |
| 6 | `forming_peaks_not_level` | 48 | 0 | 0 | 0 |
| 7 | `forming_current_at_or_below_valley` | 48 | 0 | 0 | 0 |
| 8 | `forming_completion_below_min` | 48 | 0 | 0 | 0 |
| 9 | `forming_bars_out_of_range` | 48 | 32 | 4 | 4 |
| 10 | `prior_trend_mismatch:*` | 16 | 0 | 0 | 0 |
| 11 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 16 | 8 | 1 | 1 |
| 12 | `構造ゲート（#126）` | 8 | 8 | 2 | 2 |
| 13 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 2-3. 実データ C 96（`btc_jpy_1hour_2026_09`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 48 | 0 | 0 | 0 |
| 2 | `forming_no_level_peak` | 48 | 0 | 0 | 0 |
| 3 | `forming_search_blocked_by_higher_peak` | 48 | 0 | 0 | 0 |
| 4 | `forming_no_valley_after_peak` | 48 | 0 | 0 | 0 |
| 5 | `forming_peak_level_out_of_tolerance` | 48 | 0 | 0 | 0 |
| 6 | `forming_peaks_not_level` | 48 | 0 | 0 | 0 |
| 7 | `forming_current_at_or_below_valley` | 48 | 48 | 3 | 3 |
| 8 | `forming_completion_below_min` | 0 | 0 | 0 | 0 |
| 9 | `forming_bars_out_of_range` | 0 | 0 | 0 | 0 |
| 10 | `prior_trend_mismatch:*` | 0 | 0 | 0 | 0 |
| 11 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 0 | 0 | 0 | 0 |
| 12 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 13 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 2-4. 実データ D 96（`btc_jpy_1hour_2026_09_05`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 48 | 0 | 0 | 0 |
| 2 | `forming_no_level_peak` | 48 | 0 | 0 | 0 |
| 3 | `forming_search_blocked_by_higher_peak` | 48 | 0 | 0 | 0 |
| 4 | `forming_no_valley_after_peak` | 48 | 0 | 0 | 0 |
| 5 | `forming_peak_level_out_of_tolerance` | 48 | 0 | 0 | 0 |
| 6 | `forming_peaks_not_level` | 48 | 0 | 0 | 0 |
| 7 | `forming_current_at_or_below_valley` | 48 | 0 | 0 | 0 |
| 8 | `forming_completion_below_min` | 48 | 0 | 0 | 0 |
| 9 | `forming_bars_out_of_range` | 48 | 40 | 5 | 5 |
| 10 | `prior_trend_mismatch:*` | 8 | 0 | 0 | 0 |
| 11 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 8 | 8 | 1 | 1 |
| 12 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 13 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 2-5. ローリング窓 3672（`btc_jpy_1hour_2026_08` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 3672 | 0 | 0 | 0 |
| 2 | `forming_no_level_peak` | 3672 | 312 | 0 | 0 |
| 3 | `forming_search_blocked_by_higher_peak` | 3360 | 12 | 0 | 0 |
| 4 | `forming_no_valley_after_peak` | 3348 | 129 | 21 | 21 |
| 5 | `forming_peak_level_out_of_tolerance` | 3219 | 0 | 0 | 0 |
| 6 | `forming_peaks_not_level` | 3219 | 0 | 0 | 0 |
| 7 | `forming_current_at_or_below_valley` | 3219 | 606 | 72 | 72 |
| 8 | `forming_completion_below_min` | 2613 | 0 | 0 | 0 |
| 9 | `forming_bars_out_of_range` | 2613 | 2314 | 141 | 141 |
| 10 | `prior_trend_mismatch:*` | 299 | 0 | 0 | 0 |
| 11 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 299 | 227 | 13 | 13 |
| 12 | `構造ゲート（#126）` | 72 | 24 | 4 | 4 |
| 13 | `forming_peaks_below_neckline` | 48 | 0 | 0 | 0 |
| — | **accepted** | 48 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `forming` | 48 | 8 | 8 |

#### 2-6. ローリング窓 3672（`btc_jpy_1hour_2026_09` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 3672 | 0 | 0 | 0 |
| 2 | `forming_no_level_peak` | 3672 | 0 | 0 | 0 |
| 3 | `forming_search_blocked_by_higher_peak` | 3672 | 27 | 0 | 0 |
| 4 | `forming_no_valley_after_peak` | 3645 | 37 | 9 | 9 |
| 5 | `forming_peak_level_out_of_tolerance` | 3608 | 0 | 0 | 0 |
| 6 | `forming_peaks_not_level` | 3608 | 0 | 0 | 0 |
| 7 | `forming_current_at_or_below_valley` | 3608 | 910 | 110 | 110 |
| 8 | `forming_completion_below_min` | 2698 | 0 | 0 | 0 |
| 9 | `forming_bars_out_of_range` | 2698 | 2281 | 147 | 147 |
| 10 | `prior_trend_mismatch:*` | 417 | 0 | 0 | 0 |
| 11 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 417 | 285 | 18 | 18 |
| 12 | `構造ゲート（#126）` | 132 | 84 | 8 | 8 |
| 13 | `forming_peaks_below_neckline` | 48 | 0 | 0 | 0 |
| — | **accepted** | 48 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `forming` | 48 | 8 | 8 |

#### 2-7. ローリング窓 3672（`btc_jpy_1hour_2026_09_05` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 3672 | 0 | 0 | 0 |
| 2 | `forming_no_level_peak` | 3672 | 0 | 0 | 0 |
| 3 | `forming_search_blocked_by_higher_peak` | 3672 | 27 | 0 | 0 |
| 4 | `forming_no_valley_after_peak` | 3645 | 48 | 9 | 9 |
| 5 | `forming_peak_level_out_of_tolerance` | 3597 | 0 | 0 | 0 |
| 6 | `forming_peaks_not_level` | 3597 | 0 | 0 | 0 |
| 7 | `forming_current_at_or_below_valley` | 3597 | 894 | 101 | 101 |
| 8 | `forming_completion_below_min` | 2703 | 0 | 0 | 0 |
| 9 | `forming_bars_out_of_range` | 2703 | 2305 | 149 | 149 |
| 10 | `prior_trend_mismatch:*` | 398 | 0 | 0 | 0 |
| 11 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 398 | 281 | 18 | 18 |
| 12 | `構造ゲート（#126）` | 117 | 84 | 8 | 8 |
| 13 | `forming_peaks_below_neckline` | 33 | 0 | 0 | 0 |
| — | **accepted** | 33 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `forming` | 33 | 5 | 5 |

### 3. `ablP+minDist`: 中間構成点にも `minDist` を掛ける（issue #269）

`ablP` に、山1–谷 と 谷–最新足 の両方へ `ctx.minDist`（`minBarsBetweenSwings`）を掛けるゲートを
構成点が揃った直後に足したビルド。完成済み経路が主構成点間に掛けているのと同じ値。

**全母集団の accepted 合計**: `forming` 延べ 129 / 構造 21 / 実体 8

`forming_bars_out_of_range` の内訳（全母集団）: **下限割れ 5343 件 / 上限超え 0 件**。`formationBars` は min 4 / p50 15 / max 41。

**accepted の `formationBars`**: min 34 / p50 76 / max 94（延べ 129 件）。

（`prior_trend_insufficient_data` は棄却ではなく注記として 30 件積まれている。候補の分母には入れていない。）

#### 3-1. 標準コーパス 800（合成 704 + 実データ A 96）（時間足別は参考値）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 368 | 0 | 0 | 0 |
| 2 | `forming_no_level_peak` | 368 | 52 | 0 | 0 |
| 3 | `forming_search_blocked_by_higher_peak` | 316 | 208 | 0 | 0 |
| 4 | `forming_no_valley_after_peak` | 108 | 12 | 3 | 3 |
| 5 | `forming_mid_points_too_close（#269）` | 96 | 40 | 5 | 5 |
| 6 | `forming_peak_level_out_of_tolerance` | 56 | 0 | 0 | 0 |
| 7 | `forming_peaks_not_level` | 56 | 0 | 0 | 0 |
| 8 | `forming_current_at_or_below_valley` | 56 | 0 | 0 | 0 |
| 9 | `forming_completion_below_min` | 56 | 0 | 0 | 0 |
| 10 | `forming_bars_out_of_range` | 56 | 56 | 7 | 7 |
| 11 | `prior_trend_mismatch:*` | 0 | 0 | 0 | 0 |
| 12 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 0 | 0 | 0 | 0 |
| 13 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 14 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 3-2. 実データ B 96（`btc_jpy_1hour_2026_08`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 48 | 0 | 0 | 0 |
| 2 | `forming_no_level_peak` | 48 | 0 | 0 | 0 |
| 3 | `forming_search_blocked_by_higher_peak` | 48 | 0 | 0 | 0 |
| 4 | `forming_no_valley_after_peak` | 48 | 0 | 0 | 0 |
| 5 | `forming_mid_points_too_close（#269）` | 48 | 8 | 1 | 1 |
| 6 | `forming_peak_level_out_of_tolerance` | 40 | 0 | 0 | 0 |
| 7 | `forming_peaks_not_level` | 40 | 0 | 0 | 0 |
| 8 | `forming_current_at_or_below_valley` | 40 | 0 | 0 | 0 |
| 9 | `forming_completion_below_min` | 40 | 0 | 0 | 0 |
| 10 | `forming_bars_out_of_range` | 40 | 24 | 3 | 3 |
| 11 | `prior_trend_mismatch:*` | 16 | 0 | 0 | 0 |
| 12 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 16 | 8 | 1 | 1 |
| 13 | `構造ゲート（#126）` | 8 | 8 | 2 | 2 |
| 14 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 3-3. 実データ C 96（`btc_jpy_1hour_2026_09`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 48 | 0 | 0 | 0 |
| 2 | `forming_no_level_peak` | 48 | 0 | 0 | 0 |
| 3 | `forming_search_blocked_by_higher_peak` | 48 | 0 | 0 | 0 |
| 4 | `forming_no_valley_after_peak` | 48 | 0 | 0 | 0 |
| 5 | `forming_mid_points_too_close（#269）` | 48 | 0 | 0 | 0 |
| 6 | `forming_peak_level_out_of_tolerance` | 48 | 0 | 0 | 0 |
| 7 | `forming_peaks_not_level` | 48 | 0 | 0 | 0 |
| 8 | `forming_current_at_or_below_valley` | 48 | 48 | 3 | 3 |
| 9 | `forming_completion_below_min` | 0 | 0 | 0 | 0 |
| 10 | `forming_bars_out_of_range` | 0 | 0 | 0 | 0 |
| 11 | `prior_trend_mismatch:*` | 0 | 0 | 0 | 0 |
| 12 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 0 | 0 | 0 | 0 |
| 13 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 14 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 3-4. 実データ D 96（`btc_jpy_1hour_2026_09_05`）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 48 | 0 | 0 | 0 |
| 2 | `forming_no_level_peak` | 48 | 0 | 0 | 0 |
| 3 | `forming_search_blocked_by_higher_peak` | 48 | 0 | 0 | 0 |
| 4 | `forming_no_valley_after_peak` | 48 | 0 | 0 | 0 |
| 5 | `forming_mid_points_too_close（#269）` | 48 | 8 | 1 | 1 |
| 6 | `forming_peak_level_out_of_tolerance` | 40 | 0 | 0 | 0 |
| 7 | `forming_peaks_not_level` | 40 | 0 | 0 | 0 |
| 8 | `forming_current_at_or_below_valley` | 40 | 0 | 0 | 0 |
| 9 | `forming_completion_below_min` | 40 | 0 | 0 | 0 |
| 10 | `forming_bars_out_of_range` | 40 | 32 | 4 | 4 |
| 11 | `prior_trend_mismatch:*` | 8 | 0 | 0 | 0 |
| 12 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 8 | 8 | 1 | 1 |
| 13 | `構造ゲート（#126）` | 0 | 0 | 0 | 0 |
| 14 | `forming_peaks_below_neckline` | 0 | 0 | 0 | 0 |
| — | **accepted** | 0 | — | — | — |

accepted は **0 件**。

#### 3-5. ローリング窓 3672（`btc_jpy_1hour_2026_08` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 3672 | 0 | 0 | 0 |
| 2 | `forming_no_level_peak` | 3672 | 312 | 0 | 0 |
| 3 | `forming_search_blocked_by_higher_peak` | 3360 | 12 | 0 | 0 |
| 4 | `forming_no_valley_after_peak` | 3348 | 129 | 21 | 21 |
| 5 | `forming_mid_points_too_close（#269）` | 3219 | 809 | 87 | 87 |
| 6 | `forming_peak_level_out_of_tolerance` | 2410 | 0 | 0 | 0 |
| 7 | `forming_peaks_not_level` | 2410 | 0 | 0 | 0 |
| 8 | `forming_current_at_or_below_valley` | 2410 | 347 | 43 | 43 |
| 9 | `forming_completion_below_min` | 2063 | 0 | 0 | 0 |
| 10 | `forming_bars_out_of_range` | 2063 | 1766 | 89 | 89 |
| 11 | `prior_trend_mismatch:*` | 297 | 0 | 0 | 0 |
| 12 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 297 | 225 | 12 | 12 |
| 13 | `構造ゲート（#126）` | 72 | 24 | 4 | 4 |
| 14 | `forming_peaks_below_neckline` | 48 | 0 | 0 | 0 |
| — | **accepted** | 48 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `forming` | 48 | 8 | 8 |

#### 3-6. ローリング窓 3672（`btc_jpy_1hour_2026_09` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 3672 | 0 | 0 | 0 |
| 2 | `forming_no_level_peak` | 3672 | 0 | 0 | 0 |
| 3 | `forming_search_blocked_by_higher_peak` | 3672 | 27 | 0 | 0 |
| 4 | `forming_no_valley_after_peak` | 3645 | 37 | 9 | 9 |
| 5 | `forming_mid_points_too_close（#269）` | 3608 | 879 | 91 | 91 |
| 6 | `forming_peak_level_out_of_tolerance` | 2729 | 0 | 0 | 0 |
| 7 | `forming_peaks_not_level` | 2729 | 0 | 0 | 0 |
| 8 | `forming_current_at_or_below_valley` | 2729 | 601 | 76 | 76 |
| 9 | `forming_completion_below_min` | 2128 | 0 | 0 | 0 |
| 10 | `forming_bars_out_of_range` | 2128 | 1729 | 106 | 106 |
| 11 | `prior_trend_mismatch:*` | 399 | 0 | 0 | 0 |
| 12 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 399 | 267 | 16 | 16 |
| 13 | `構造ゲート（#126）` | 132 | 84 | 8 | 8 |
| 14 | `forming_peaks_below_neckline` | 48 | 0 | 0 | 0 |
| — | **accepted** | 48 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `forming` | 48 | 8 | 8 |

#### 3-7. ローリング窓 3672（`btc_jpy_1hour_2026_09_05` の末尾 60〜365 本 × 時間足 3 × swingDepth 4）

| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |
|---:|---|---:|---:|---:|---:|
| 1 | `forming_no_confirmed_peak` | 3672 | 0 | 0 | 0 |
| 2 | `forming_no_level_peak` | 3672 | 0 | 0 | 0 |
| 3 | `forming_search_blocked_by_higher_peak` | 3672 | 27 | 0 | 0 |
| 4 | `forming_no_valley_after_peak` | 3645 | 48 | 9 | 9 |
| 5 | `forming_mid_points_too_close（#269）` | 3597 | 897 | 93 | 93 |
| 6 | `forming_peak_level_out_of_tolerance` | 2700 | 0 | 0 | 0 |
| 7 | `forming_peaks_not_level` | 2700 | 0 | 0 | 0 |
| 8 | `forming_current_at_or_below_valley` | 2700 | 584 | 68 | 68 |
| 9 | `forming_completion_below_min` | 2116 | 0 | 0 | 0 |
| 10 | `forming_bars_out_of_range` | 2116 | 1736 | 106 | 106 |
| 11 | `prior_trend_mismatch:*` | 380 | 0 | 0 | 0 |
| 12 | `サイズ（forming_pattern_too_small / forming_valley_too_shallow）` | 380 | 263 | 16 | 16 |
| 13 | `構造ゲート（#126）` | 117 | 84 | 8 | 8 |
| 14 | `forming_peaks_below_neckline` | 33 | 0 | 0 | 0 |
| — | **accepted** | 33 | — | — | — |

| status | 延べ | 構造 | 実体 |
|---|---:|---:|---:|
| `forming` | 33 | 5 | 5 |

### 3-x. 中間構成点の間隔（issue #269）

`ablP` が組んだ候補の 山1–谷（`gap1`）と 谷–最新足（`gap2`）の間隔。**「隣接足」は間隔 1 本**で、#262 Phase 1 §8-2 の基準 1（`forming` を「呼べない」と判定する最初の基準）そのもの。

| ビルド | 母数（構成点が揃った候補） | `gap1` = 1 本 | `gap2` = 1 本 | `gap1` < `minDist` | `gap2` < `minDist` | どちらか < `minDist` |
|---|---:|---:|---:|---:|---:|---:|
| `ablP` 全候補 | 10664 | 1079 | 0 | 2414 | 454 | 2641 |
| `ablP` accepted | 129 | 0 | 0 | 0 | 0 | 0 |
| `ablP+minDist` accepted | 129 | 0 | 0 | 0 | 0 | 0 |

`gap1` の分布（`ablP` 全候補）: min 1 / p50 5 / max 45 / `gap2`: min 2 / p50 9 / max 51。
`gap1` の分布（`ablP` accepted）: min 7 / p50 30 / max 45 / `gap2`: min 27 / p50 46 / max 51。

### 4. accepted になった実体の明細と 3 値判定

判定は #262 Phase 1 §8-2 の 5 段を順に当て、最初に当たったものを採る（1: 中間構成点が第1構成点の隣接足 / 2: 第2構成点以降に外側の極値を超えた / 3: 深さ < 0.5% / 4: 深さ ≥ 1.0% かつ第2構成点以降にネックラインを抜けた / 5: それ以外は保留）。使う量は構成点の終値・極値と区間の最高安値だけで、**検出器も閾値も通していない。**

⚠️ **形成中 top では第2構成点が最新足そのもの**なので、基準 2 / 4 の走査区間（第2構成点の次の足から窓の終端まで）は**定義上空**になる。したがって本判定で出る値は「呼べない（基準 1 / 3）」か「保留」だけで、**「呼べる」は構造的に出ない。** 形が実際に M になったかを見るには窓の先を見るしかないので、後続 30 本まで走査を伸ばした補助判定を併記する（**検出器には見えない情報**なので、決定の根拠にするときはその旨を明示すること）。

#### 4-1. `ablP`

実体 **8 件**。

| # | 実体（時間足 / 山1 - 谷 の絶対時刻） | 系列 / sd / 終端 | 山1 終値 | 谷 終値 | 現値 | 現値 − 山1 | 最新足の高値 > 山1 の高値 | `gap1` | `gap2` | 深さ | 判定 | 根拠 | 後続を見た判定 |
|---:|---|---|---:|---:|---:|---:|---|---:|---:|---:|---|---|---|
| 1 | `1day\|double_top\|2026-08-21T08:00:00.000Z-2026-08-23T05:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=auto / end=294 | 12,571,740 | 12,075,755 | 12,851,000 | +2.221% | **✅ 超えている**（12,933,047 > 12,600,000） | 45 | 45 | 3.945% | **保留** | 基準 5（該当なし） | 保留（基準 5（該当なし）、+30 本） |
| 2 | `4hour\|double_top\|2026-08-21T08:00:00.000Z-2026-08-23T05:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=auto / end=294 | 12,571,740 | 12,075,755 | 12,851,000 | +2.221% | **✅ 超えている**（12,933,047 > 12,600,000） | 45 | 45 | 3.945% | **保留** | 基準 5（該当なし） | 保留（基準 5（該当なし）、+30 本） |
| 3 | `1hour\|double_top\|2026-08-21T08:00:00.000Z-2026-08-23T05:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=6 / end=294 | 12,571,740 | 12,075,755 | 12,851,000 | +2.221% | **✅ 超えている**（12,933,047 > 12,600,000） | 45 | 45 | 3.945% | **保留** | 基準 5（該当なし） | 保留（基準 5（該当なし）、+30 本） |
| 4 | `1day\|double_top\|2026-08-21T23:00:00.000Z-2026-08-23T05:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=auto / end=295 | 12,445,660 | 12,075,755 | 12,823,737 | +3.038% | **✅ 超えている**（12,894,611 > 12,525,196） | 30 | 46 | 2.972% | **保留** | 基準 5（該当なし） | 呼べない（基準 2（第2構成点以降に外側を超えた）、+30 本） |
| 5 | `4hour\|double_top\|2026-08-21T23:00:00.000Z-2026-08-23T05:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=auto / end=295 | 12,445,660 | 12,075,755 | 12,823,737 | +3.038% | **✅ 超えている**（12,894,611 > 12,525,196） | 30 | 46 | 2.972% | **保留** | 基準 5（該当なし） | 呼べない（基準 2（第2構成点以降に外側を超えた）、+30 本） |
| 6 | `1hour\|double_top\|2026-08-21T23:00:00.000Z-2026-08-23T05:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=6 / end=295 | 12,445,660 | 12,075,755 | 12,823,737 | +3.038% | **✅ 超えている**（12,894,611 > 12,525,196） | 30 | 46 | 2.972% | **保留** | 基準 5（該当なし） | 呼べない（基準 2（第2構成点以降に外側を超えた）、+30 本） |
| 7 | `1hour\|double_top\|2026-08-23T21:00:00.000Z-2026-08-24T04:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=6 / end=299 | 12,357,128 | 12,213,097 | 12,726,672 | +2.991% | **✅ 超えている**（12,900,000 > 12,396,586） | 7 | 27 | 1.166% | **保留** | 基準 5（該当なし） | 保留（基準 5（該当なし）、+30 本） |
| 8 | `4hour\|double_top\|2026-08-23T21:00:00.000Z-2026-08-24T04:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=auto / end=307 | 12,357,128 | 12,213,097 | 12,663,616 | +2.480% | **✅ 超えている**（12,663,616 > 12,396,586） | 7 | 35 | 1.166% | **保留** | 基準 5（該当なし） | 呼べない（基準 2（第2構成点以降に外側を超えた）、+30 本） |

集計（本判定）: **保留 8**（計 8 実体）

集計（後続 30 本を見た補助判定）: **保留 4** / **呼べない 4**

構成点の idx（フィクスチャを直接引くための検算用）:

| # | 系列 | tf | sd | 終端 idx | 山1 idx | 谷 idx | ネックライン |
|---:|---|---|---|---:|---:|---:|---:|
| 1 | btc_jpy_1hour_2026_08 | 1day | auto | 294 | 204 | 249 | 12,075,755 |
| 2 | btc_jpy_1hour_2026_08 | 4hour | auto | 294 | 204 | 249 | 12,075,755 |
| 3 | btc_jpy_1hour_2026_08 | 1hour | 6 | 294 | 204 | 249 | 12,075,755 |
| 4 | btc_jpy_1hour_2026_08 | 1day | auto | 295 | 219 | 249 | 12,075,755 |
| 5 | btc_jpy_1hour_2026_08 | 4hour | auto | 295 | 219 | 249 | 12,075,755 |
| 6 | btc_jpy_1hour_2026_08 | 1hour | 6 | 295 | 219 | 249 | 12,075,755 |
| 7 | btc_jpy_1hour_2026_08 | 1hour | 6 | 299 | 265 | 272 | 12,213,097 |
| 8 | btc_jpy_1hour_2026_08 | 4hour | auto | 307 | 265 | 272 | 12,213,097 |

#### 4-2. `ablP+minDist`

実体 **8 件**。

| # | 実体（時間足 / 山1 - 谷 の絶対時刻） | 系列 / sd / 終端 | 山1 終値 | 谷 終値 | 現値 | 現値 − 山1 | 最新足の高値 > 山1 の高値 | `gap1` | `gap2` | 深さ | 判定 | 根拠 | 後続を見た判定 |
|---:|---|---|---:|---:|---:|---:|---|---:|---:|---:|---|---|---|
| 1 | `1day\|double_top\|2026-08-21T08:00:00.000Z-2026-08-23T05:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=auto / end=294 | 12,571,740 | 12,075,755 | 12,851,000 | +2.221% | **✅ 超えている**（12,933,047 > 12,600,000） | 45 | 45 | 3.945% | **保留** | 基準 5（該当なし） | 保留（基準 5（該当なし）、+30 本） |
| 2 | `4hour\|double_top\|2026-08-21T08:00:00.000Z-2026-08-23T05:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=auto / end=294 | 12,571,740 | 12,075,755 | 12,851,000 | +2.221% | **✅ 超えている**（12,933,047 > 12,600,000） | 45 | 45 | 3.945% | **保留** | 基準 5（該当なし） | 保留（基準 5（該当なし）、+30 本） |
| 3 | `1hour\|double_top\|2026-08-21T08:00:00.000Z-2026-08-23T05:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=6 / end=294 | 12,571,740 | 12,075,755 | 12,851,000 | +2.221% | **✅ 超えている**（12,933,047 > 12,600,000） | 45 | 45 | 3.945% | **保留** | 基準 5（該当なし） | 保留（基準 5（該当なし）、+30 本） |
| 4 | `1day\|double_top\|2026-08-21T23:00:00.000Z-2026-08-23T05:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=auto / end=295 | 12,445,660 | 12,075,755 | 12,823,737 | +3.038% | **✅ 超えている**（12,894,611 > 12,525,196） | 30 | 46 | 2.972% | **保留** | 基準 5（該当なし） | 呼べない（基準 2（第2構成点以降に外側を超えた）、+30 本） |
| 5 | `4hour\|double_top\|2026-08-21T23:00:00.000Z-2026-08-23T05:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=auto / end=295 | 12,445,660 | 12,075,755 | 12,823,737 | +3.038% | **✅ 超えている**（12,894,611 > 12,525,196） | 30 | 46 | 2.972% | **保留** | 基準 5（該当なし） | 呼べない（基準 2（第2構成点以降に外側を超えた）、+30 本） |
| 6 | `1hour\|double_top\|2026-08-21T23:00:00.000Z-2026-08-23T05:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=6 / end=295 | 12,445,660 | 12,075,755 | 12,823,737 | +3.038% | **✅ 超えている**（12,894,611 > 12,525,196） | 30 | 46 | 2.972% | **保留** | 基準 5（該当なし） | 呼べない（基準 2（第2構成点以降に外側を超えた）、+30 本） |
| 7 | `1hour\|double_top\|2026-08-23T21:00:00.000Z-2026-08-24T04:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=6 / end=299 | 12,357,128 | 12,213,097 | 12,726,672 | +2.991% | **✅ 超えている**（12,900,000 > 12,396,586） | 7 | 27 | 1.166% | **保留** | 基準 5（該当なし） | 保留（基準 5（該当なし）、+30 本） |
| 8 | `4hour\|double_top\|2026-08-23T21:00:00.000Z-2026-08-24T04:00:00.000Z` | btc_jpy_1hour_2026_08 / sd=auto / end=307 | 12,357,128 | 12,213,097 | 12,663,616 | +2.480% | **✅ 超えている**（12,663,616 > 12,396,586） | 7 | 35 | 1.166% | **保留** | 基準 5（該当なし） | 呼べない（基準 2（第2構成点以降に外側を超えた）、+30 本） |

集計（本判定）: **保留 8**（計 8 実体）

集計（後続 30 本を見た補助判定）: **保留 4** / **呼べない 4**

構成点の idx（フィクスチャを直接引くための検算用）:

| # | 系列 | tf | sd | 終端 idx | 山1 idx | 谷 idx | ネックライン |
|---:|---|---|---|---:|---:|---:|---:|
| 1 | btc_jpy_1hour_2026_08 | 1day | auto | 294 | 204 | 249 | 12,075,755 |
| 2 | btc_jpy_1hour_2026_08 | 4hour | auto | 294 | 204 | 249 | 12,075,755 |
| 3 | btc_jpy_1hour_2026_08 | 1hour | 6 | 294 | 204 | 249 | 12,075,755 |
| 4 | btc_jpy_1hour_2026_08 | 1day | auto | 295 | 219 | 249 | 12,075,755 |
| 5 | btc_jpy_1hour_2026_08 | 4hour | auto | 295 | 219 | 249 | 12,075,755 |
| 6 | btc_jpy_1hour_2026_08 | 1hour | 6 | 295 | 219 | 249 | 12,075,755 |
| 7 | btc_jpy_1hour_2026_08 | 1hour | 6 | 299 | 265 | 272 | 12,213,097 |
| 8 | btc_jpy_1hour_2026_08 | 4hour | auto | 307 | 265 | 272 | 12,213,097 |

### 5. ローリング窓での追跡（accepted になった構造のその後）

先頭固定・終端を 1 本ずつ動かす窓なので、ピボットの idx が窓をまたいで安定する。ある構造が**初めて形成中として現れた窓より後**の窓で、`completed` / `near_completion` / 終端 status（`expired` / `invalid`）のどれになったかを数える（複数当たったら左の優先順で 1 つに畳む）。構造キーは `(type, 先頭 2 ピボットの idx)` なので、形成中（2 点）と完成済み（3 点）が同じ構造として結べる。同じ構造は複数の `swingDepth` レーンに出るので、レーンを OR で畳む。

| ビルド | 追跡できた構造 | その後 completed | その後 near_completion | その後 終端 status | どれにもならず |
|---|---:|---:|---:|---:|---:|
| `base`（現行） | 0 | 0 | 0 | 0 | 0 |
| `ablP` | 8 | 0 | 0 | 0 | 8 |
| `ablP+minDist` | 8 | 0 | 0 | 0 | 8 |

### 6. 完成済み経路 / `near_completion` との二重出力

`ablP` が拾う「2 つ目の山を作っている途中」と、同じ窓の完成済み経路の `double_top`（`near_completion` / `completed` / `expired` / `invalid`）が並ぶかを数える。#262 が解消した二重出力を別の形で再導入していないかの確認（issue #268 計測仕様 6）。

`globalDedup` は**期間の 70% 重複**で同 type を畳み、勝者は statusScore（`completed` 3 > 未設定 2 > `forming` / `near_completion` 1）→ confidence → `range.end` の新しさ。**`forming` と `near_completion` は同点**なので、畳まれてもどちらが残るかは confidence 次第になる。

#### 6-1. `ablP`

形成中 `double_top` の accepted は延べ **129** 件。

| 同じ窓に並んだ完成済み経路の status | 延べ | うち主構成点を 1 点以上共有 | うち 2 点とも共有 |
|---|---:|---:|---:|
| `invalid` | 39 | 3 | 3 |

**利用者が 2 本受け取るか 1 本か**は、そのペアの両方が `globalDedup` を生き延びたかで決まる（形成中が残ったかだけでは判定できない——statusScore は `forming` 1 > `invalid` / `expired` 0 なので、畳まれたときに**残るのが形成中のほう**でありうる）。

| ペアの相手の status | 両方残る（**二重出力**） | 形成中だけ残る | 相手だけ残る |
|---|---:|---:|---:|
| `invalid` | 0 | 39 | 0 |

`globalDedup` 後: 形成中が**残った 129 件 / 畳まれた 0 件**。

形成中が出たケースの `double_*` 一覧（重複を畳んで 129 行。先頭 40 行）:

- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=294: double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=294: double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=294: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=294: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=294: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=295: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=295: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=295: double_top:invalid[265-272-283], double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=295: double_top:invalid[265-272-283], double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=295: double_top:invalid[265-272-283], double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=296: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=296: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=296: double_top:invalid[265-272-283], double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=296: double_top:invalid[265-272-283], double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=296: double_top:invalid[265-272-283], double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=297: double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=297: double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=297: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=297: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=297: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=298: double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=298: double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=298: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=298: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=298: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=299: double_top:invalid[265-272-283], double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=300: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=300: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=300: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=300: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=300: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=301: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=302: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=303: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=304: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=305: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=306: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=307: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=307: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=307: double_top:forming[265-272]

#### 6-2. `ablP+minDist`

形成中 `double_top` の accepted は延べ **129** 件。

| 同じ窓に並んだ完成済み経路の status | 延べ | うち主構成点を 1 点以上共有 | うち 2 点とも共有 |
|---|---:|---:|---:|
| `invalid` | 39 | 3 | 3 |

**利用者が 2 本受け取るか 1 本か**は、そのペアの両方が `globalDedup` を生き延びたかで決まる（形成中が残ったかだけでは判定できない——statusScore は `forming` 1 > `invalid` / `expired` 0 なので、畳まれたときに**残るのが形成中のほう**でありうる）。

| ペアの相手の status | 両方残る（**二重出力**） | 形成中だけ残る | 相手だけ残る |
|---|---:|---:|---:|
| `invalid` | 0 | 39 | 0 |

`globalDedup` 後: 形成中が**残った 129 件 / 畳まれた 0 件**。

形成中が出たケースの `double_*` 一覧（重複を畳んで 129 行。先頭 40 行）:

- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=294: double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=294: double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=294: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=294: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=294: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=295: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=295: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=295: double_top:invalid[265-272-283], double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=295: double_top:invalid[265-272-283], double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=295: double_top:invalid[265-272-283], double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=296: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=296: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=296: double_top:invalid[265-272-283], double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=296: double_top:invalid[265-272-283], double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=296: double_top:invalid[265-272-283], double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=297: double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=297: double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=297: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=297: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=297: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=298: double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=298: double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=298: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=298: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=298: double_top:invalid[265-272-283], double_top:forming[204-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=299: double_top:invalid[265-272-283], double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=300: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=300: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=300: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=300: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=300: double_top:forming[219-249]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=301: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=302: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=303: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=304: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=305: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=306: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=307: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=307: double_top:forming[265-272]
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=307: double_top:forming[265-272]

### 7. `view=debug` の cap への影響

`detect_patterns.ts` の並べ替え（accepted → 型間排他の棄却 → 検出器の棄却）を再現し、**triple + double だけ**で候補総数を数えた（他の検出器を足すと更に増えるので、これは下限）。cap は 200。ローリング窓は同じ系列の窓違いなので、この節では固定窓のケースだけを使う。

**`ablP` は探索が広がるが、積む候補は 1 呼び出しにつき高々 1 件のまま**（ループの中では 1 件も積まず、探索が終わってから組めなかった理由を 1 件だけ積む）。§0 の「#158 の積み方」の実測がそれを示す。

| 母集団 | ケース | 候補総数 p50 base → ablP → +minDist | max base → ablP → +minDist | cap 超過 base → ablP → +minDist |
|---|---:|---|---|---|
| 標準コーパス 800（合成 704 + 実データ A 96） | 800 | 9 → 9 → 9 | 86 → 86 → 86 | 0 → 0 → 0 |
| 実データ B 96（`btc_jpy_1hour_2026_08`） | 96 | 229 → 229 → 229 | 411 → 411 → 411 | 56 → 56 → 56 |
| 実データ C 96（`btc_jpy_1hour_2026_09`） | 96 | 181 → 181 → 181 | 444 → 444 → 444 | 36 → 36 → 36 |
| 実データ D 96（`btc_jpy_1hour_2026_09_05`） | 96 | 184 → 184 → 184 | 454 → 454 → 454 | 36 → 36 → 36 |

### 8. `data.patterns` の差分

`detectDoubles` の出力段（`globalDedup` の前）で base と食い違ったケース数。

| `includeForming` | ケース | `ablP` で差 | `ablP+minDist` で差 |
|---|---:|---:|---:|
| includeForming: false（既定） | 544 | 0 | 0 |
| includeForming: true | 11560 | 129 | 129 |

食い違ったケース（重複を畳んで 129 行。うち合成フィクスチャ 0 行）。**合成フィクスチャの行は #158 / #169 のテスト期待値が動きうる箇所**なので全部出す:

実データ側（先頭 40 行 / 全 129 行）:

- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=294 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=294 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=294 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=294 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=294 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=295 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=295 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=295 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=295 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=295 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=296 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=296 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=296 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=296 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=296 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=297 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=297 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=297 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=297 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=297 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=298 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=298 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=298 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=298 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=298 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=299 / includeForming: true: double_top:invalid → ablP double_top:invalid, double_top:forming → ablP+minDist double_top:invalid, double_top:forming
- btc_jpy_1hour_2026_08 / 1day / sd=auto / end=300 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 1day / sd=6 / end=300 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=300 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=300 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=300 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=301 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=302 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=303 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=304 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=305 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=306 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 4hour / sd=auto / end=307 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 4hour / sd=6 / end=307 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
- btc_jpy_1hour_2026_08 / 1hour / sd=6 / end=307 / includeForming: true: （0 件） → ablP double_top:forming → ablP+minDist double_top:forming
