# Changelog

本プロジェクトの主な変更履歴です。
形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠しています。

---

## [Unreleased]

### 読む順（`detect_patterns` 系の一連の変更。#114 以降）

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
| 18 | #153 | H&S の `tolerancePct` が頭の突出率としても使われ意味が反転していたのを `headProminencePct` に分離（#149） | **変わらない**（既定値のまま） |
| 19 | #156 | 形成中 H&S / 逆 H&S の頭を窓全体の極値 1 点に決め打ちしていたのを総当たりに変えた（#154） | 合成 fixture は**変わらない** / 実データは窓を広げたときだけ**増える**（＝狭い窓で出ていたものが戻る） |
| 20 | #159 | 形成中 H&S / 逆 H&S の成功候補を `debug.candidates` に積む（#155） | **変わらない** |
| 21 | #161 | candidates の `status` / `breakoutDirection` を content と出力スキーマに届ける（#160） | **変わらない** |
| 22 | #164 | 完成済みウェッジの `status` / `breakoutDirection` が候補行に出ていなかったのを修正（#162） | **変わらない** |
| 23 | #166 | 形成中 double top / bottom・triple top / bottom の成功候補を `debug.candidates` に積む（#158。#155 の 4 経路への横展開） | **変わらない** |
| 24 | #168 | サイズ検査の 2 定数（`MIN_DEPTH_PCT` / `MIN_PATTERN_HEIGHT_PCT`）を時間足別のテーブルにした（#152） | 合成 fixture は**変わらない** / 実データは 1day 未満の時間足で**増える**（+8 / 800。減少 0） |
| 25 | #170 | 形成中 double top / bottom のサイズ検査を完成済みと揃えた（#169） | 回帰コーパス（合成 704 + 実データ 96）は**変わらない**（0 / 800）/ 新 fixture では**減る** |
| 26 | #142 | 検出器内 dedup の勝者選択を `globalDedup` と同じ confidence 優先に揃えた | 実データ・合成とも**変わる**（48 / 800。入れ替え 3 実体 + 追加 1 実体） |
| 27 | #172 | `shoulders_not_near` を 2 つの conjunct ごとに分け、`HS_SHOULDER_MAX_PCT` の役割を docstring に書いた | **変わらない**（理由コード文字列と docstring のみ） |
| 28 | #174 | #172 の docstring が relaxed 経路について誤っていたのを訂正し、relaxed の肩落ちを `debug.candidates` に積む | **変わらない**（0 / 800） |
| 29 | #138 | triple の「同水準」判定に**高さ相対の hard gate**（`MAX_LEVEL_SPREAD_RATIO`）を足し、無音だった 3 点同水準の棄却を可観測化した | 実データで**減る**（−20 / 800。**増加 0**）/ 合成 fixture は変わらない |
| 30 | #180 | cap で切られた `debug.candidates` / `debug.swings` の総数と省略件数を申告する（cap の値もトリム戦略も変えない） | **変わらない**（0 / 800） |
| 31 | #182 | `swingDepth` / `tolerancePct` / `minBarsBetweenSwings` の description に**時間軸オートとスキーマ既定値の sentinel 置換**を明記した（`resolveParams` も `.default()` も触っていない） | **変わらない**（description のみ） |
| 32 | #184 | `meta.effective_params` が**出力スキーマ未宣言で毎回 strip されていた**のを宣言し、実効パラメータ行を全 view の `content` に出した。`headProminencePct` を追加し、壊れていた `autoScaled` を per-parameter の `source` に置換 | **変わらない**（`meta` / `content` のみ） |
| 33 | #187 | `MAX_VALLEY_SPREAD`（1.5%）を削除した（#178 項目 2）。top / bottom と strict / relaxed の 2 つの非対称が同時に解消し、理由コード `valley_spread_excess` が消える | **変わらない**（0 / 896） |
| 34 | #186 | strict triple のネックライン水平性が**同じ式を 2 つの名前で 2 回**測っていたのを `NECKLINE_SLOPE_LIMIT` 1 本に畳んだ。理由コード `valleys_not_equal` / `peaks_not_equal` が triple から消える（#172 / #174 の H&S と同じ失敗の横展開） | **変わらない**（0 / 896。既定パス）/ `tolerancePct < 0.02` を明示したときだけ**緩む** |
| 35 | #189 | relaxed / strict の provenance `patterns[]._fallback` が**出力スキーマ未宣言で毎回 strip され、一度もクライアントに届いていなかった**のを宣言した（#155 / #160 / #184 に続く 4 回目）。あわせて #184 の parity ガードが**フィクスチャ依存で取りこぼしていた**穴を塞いだ | **変わらない**（検出結果は不変。消えていたフィールドが `structuredContent` に残るだけ） |

### Fixed（relaxed の provenance `patterns[]._fallback` が出力スキーマ未宣言で毎回 strip され、**一度もクライアントに届いていなかった**。#189）

`detect_patterns` の relaxed フォールバック経路（許容誤差を `× factor` して拾い直す段）は、
拾ったパターンに `_fallback: 'relaxed_triple_x1.25'` のような provenance を載せていた。**6 箇所**:

    tools/patterns/detect_doubles.ts:567 / :760   _fallback: `relaxed_double_x${factor}`
    tools/patterns/detect_triples.ts:747 / :925   _fallback: `relaxed_triple_x${factor}`
    tools/patterns/detect_hs.ts:1056              _fallback: `relaxed_hs_${factors.tag}`
    tools/patterns/detect_hs.ts:1254              _fallback: `relaxed_ihs_${factors.tag}`

`DetectedPatternSchema`（`src/schema/patterns.ts`）に宣言が無く passthrough も無いので、
返す直前の `DetectPatternsOutputSchema.parse()` が**エラーにせず黙って落としていた**。
#155（`candidates[].status`）/ #160（`breakoutDirection`）/ #184（`meta.effective_params`）に続く
**4 回目**の同一クラスの欠陥で、今回は**そのために書いた parity テストがあったのにすり抜けた**（後述）。

#### 何が見えなくなっていたか

**strict で拾えたのか relaxed が拾い直したのかを、どのクライアントも判別できなかった。**
relaxed は「strict がその種別を 1 件も返さなかったとき」だけ走る fallback なので、
`_fallback` の有無は**そのパターンが本来の許容誤差を満たしていたか**そのものを指す。

これは #187 / #188 と直結する。あの 2 本は strict / relaxed の境界そのものを動かした変更
（`MAX_VALLEY_SPREAD` の削除、strict のネックライン判定の一本化）だが、
**効果を出力から検証できなかった**——境界をまたいだパターンが strict から relaxed に移っても、
出力は「同じ型のパターンが 1 件」としか言わない。

**confidence からの逆算もできない。** relaxed のペナルティ係数が検出器ごとに不揃いだからである:

| 検出器 | 係数 | 定義 |
|---|---|---|
| `detect_doubles` | 0.85 | `RELAXED_CONFIDENCE_PENALTY`（`:48`） |
| `detect_triples` | 0.95 | `:607` / `:790` にインライン |
| `detect_hs` | 0.95 | `:995` / `:1193` にインライン |

さらに `finalizeConf` の種別別係数（triple は 1.05）と小数 2 桁丸めを通るので、
**同じ 0.76 が strict 由来にも relaxed 由来にもなりうる。**

#### 採った案: 宣言を足すだけ（案 A）

`DetectedPatternSchema` に `_fallback: z.string().optional()` を追加し、`.describe()` に
「本フィールドが無い = strict で拾えた」「値は `relaxed_<検出器>_<段の係数>`」
「confidence から provenance は推測できない」を書いた。**追加なので既存クライアントを壊さない**
（`.claude/rules/tools.md` §2 の「足す」）。**検出結果は 1 件も動かない**——消えていたフィールドが
`structuredContent` に残るだけである。

**やらなかったこと**（いずれも本 PR の対象外）:

- **`content` には出さない。** LLM に見せるかは #184 の派生（実効パラメータ行）と同じ論点。
- **ペナルティ係数（0.85 / 0.95）は変えない。** 不揃いもインラインのマジックナンバーもそのまま。
- **relaxed 経路の検出ロジック・`_method` の扱いは変えない。**

#### 表記が検出器ごとに揃っていない（`.describe()` に明記した）

`_fallback` の値は 2 系統の作り方が混在している:

| 検出器 | 生成 | 出る値 |
|---|---|---|
| double / triple | `` `relaxed_triple_x${factor}` ``（数値の文字列化） | `relaxed_triple_x1.25` / **`relaxed_triple_x2`** |
| H&S / 逆 H&S | `` `relaxed_hs_${factors.tag}` ``（固定文字列のタグ） | `relaxed_hs_x1.6_0.6` / **`relaxed_hs_x2.0_0.4`** |

**triple の第 2 段は係数 `2.0` だが `x2` として出る**（`${2.0}` は `'2'`）。一方 H&S のタグは
リテラルなので `.0` が残る。値を**前方一致で判別するのは安全だが、係数の数値比較には使えない。**
統一は表記の変更＝出力の変更になるため本 PR では行わず、`.describe()` に明記して逃がした。

### Fixed（#184 の parity ガードが**フィクスチャ依存で取りこぼしていた**。#189 第 2 部）

`tests/detect_patterns_meta_schema_parity.test.ts` は #184 でまさにこのクラスの欠陥のために
書いたテストだが、**`_fallback` の宣言漏れを検出できなかった。**

原因は allowlist（`KNOWN_DATA_STRIPS`）ではなく**フィクスチャ**である。
`expectNoStrippedKeys` は「**載っているのに消えたキー**」を見るので、
**そもそも載っていないキーについては何も言わない。** 単一の `buildNoisyCandles` の実測:

    patterns = 6
    _fallback を持つ = 0        ← relaxed 経路を 1 件も踏んでいない
    _method   を持つ = 1        ← detect_wedges の forming_relaxed 1 件だけ

    head_and_shoulders[completed] | falling_wedge[completed] m=forming_relaxed
    | triangle_symmetrical[completed] ×2 | bull_flag[completed] ×2

`buildNoisyCandles` は H&S / wedge / triangle / flag しか出さず、**double / triple が 0 件**。
relaxed は strict がその種別を 1 件も見つけなかったときだけ走るので、この列はそもそも経路に届かない。
結果、**`_fallback` は宣言してもしなくてもテストが通る**状態だった。

`tests/_schemaKeyParity.ts` の docstring は「1 回の happy path では meta の全形を踏めない」
「静的解析でキーを列挙することもできない」を**限界として自分で挙げていた**。
**これがその限界が実際に穴になった最初の例**である。

#### 塞ぎ方 1: `requiredKeys` — フィクスチャが空振りしていないことを先にアサートする

`meta` 側には既にあった（`effective_params.tolerancePct.value` / `debug.candidates[].type` /
`debug.swings[].isoTime` の存在と `size > 20`）。`data` 側は `patterns[].confidence` の 1 件だけだった。
フィクスチャごとに「**踏めていないと検証が成立しないキー**」を宣言し、parity 判定の前に固定する。

#### 塞ぎ方 2: relaxed を踏むフィクスチャを足す（既存には手を入れない）

`buildRelaxedTripleTopCandles()` を**別のケースとして追加**した。既存の `buildNoisyCandles` に
追記しなかったのは、**2 つの列の要件が衝突する**ためである——あちらは「多数の種別の候補が同時に立つ」
ことで `debug.candidates` / `debug.swings` を埋める列で、relaxed を踏むには逆に
**その種別の strict を全滅させる**必要がある（strict が 1 件でも出た瞬間に relaxed は走らない）。
1 つの列に両方を負わせると、どちらかの意図が壊れたことに気づけなくなる。

設計（1day のオート値 `swingDepth=6` / `minBarsBetweenSwings=4` / `tolerancePct=0.04`）:

| | 値 | 効果 |
|---|---|---|
| 3 山 | 1000 / 1000 / 958 | 山1-山3 の相対差 **4.2%** が `tolerancePct`（4%）超・`× 1.25`（5%）以内 |
| strict | — | 3 ペアすべてに `near` を掛けるので `three_peaks_not_level` で落ちる |
| relaxed 第 1 段 | factor 1.25 | 隣接 2 ペアしか見ないので拾う → **`relaxed_triple_x1.25`** |

残りのゲート（ネックライン傾き 0 < 2%、高さ 11% > 3%、谷の押し 9% 超 > 5%、
ばらつき / 高さ 0.38 < 0.5、戻り率 0.69 ∈ [0.2, 0.9]、confidence 0.76 > 0.7）は余裕を持って通る。
副産物として **`triple_bottom` が第 2 段（`relaxed_triple_x2`）で拾われ**、
2 段とも 1 つの列で踏めている。

#### 穴が塞がったことの確認（宣言を消して落ちること）

**第 2 部のフィクスチャだけを入れ、第 1 部の宣言を消した状態**で落ちることを実際に確認した:

    × parse の前後で data のキーパス集合も一致する: 'relaxed triple（strict が落ちて relaxed が拾う）'
      AssertionError: detect_patterns data（relaxed triple…）: 載せているが出力スキーマに宣言が無く、
      parse で strip されているキー（スキーマに宣言を足すこと）: expected [ 'patterns[]._fallback' ] to deeply equal []
    × relaxed 経路の provenance（_fallback）が parse 後も残る（#189）
      AssertionError: parse 後に _fallback を持つパターンが 1 件も無い: expected 0 to be greater than 0

**同じ状態で `noisy` 側のケースは通る**——旧フィクスチャが本当に盲だったことの裏返しである。

#### `_method` の他経路は踏ませていない

allowlist の `patterns[]._method` は `detect_wedges` の `forming_relaxed` 1 件でだけ効いており、
double / triple / H&S の形成中パス（6 箇所）は踏んでいない。**踏ませていない。**
`_method` は経路によらず「宣言が無いので strip される」で同じ扱いなので、
**1 件踏めば allowlist の検証としては足りる**（`expectNoStrippedKeys` は
「allowlist にあるのに strip されていない」でも落ちるので、腐れば検出される）。
新フィクスチャも `_method` を 1 件踏んでいるため、`requiredKeys` は両ケースで同じキーを要求している。

### Fixed（`detect_triples` のテスト名が存在しない理由コードを指していた。#189 の相乗り）

`tests/patterns/detect_triples.test.ts` の

    it('3山の等高差が tolerance 超 → peaks_not_equal で通常は不検出', () => {

は実態と合っていない。落ちているのは 3 山の同水準判定 `nearAll` で、理由コードは
**`three_peaks_not_level`**。**`triple_top` に `peaks_not_equal` は存在したことがない**
（あちらは `triple_bottom` 側の `valleys_not_equal` の対で、それも #186 / PR #188 で削除済み）。
#188 以前から名前だけが誤っていた。名前を実態に合わせ、**再び離れないよう理由コードそのものを
アサートする 1 行を足した**（名前は検証されないが、アサートは検証される）。


### Changed（strict triple のネックライン判定を `NECKLINE_SLOPE_LIMIT` 1 本に畳んだ。#186）

`findStrictTripleTop` / `findStrictTripleBottom` は、ネックライン構成 2 点（top なら 2 谷、
bottom なら 2 山）の水平性を**分子も分母も完全に同一の式**で 2 回測っていた:

    valleysNear   = |v1 - v2| / max(1, max(v1, v2)) <= tolerancePct         // 既定 0.03〜0.06
    necklineSlope = |v1 - v2| / max(1, max(v1, v2))
    necklineValid = necklineSlope <= NECKLINE_SLOPE_LIMIT                   // 0.02

    if (!(valleysNear && necklineValid)) reject(!valleysNear ? 'valleys_not_equal' : 'neckline_slope_excess')

違うのは閾値だけで、**`tolerancePct` の時間軸オートはすべて 0.02 より大きい**
（`getDefaultToleranceForTf`: 1month 0.03 〜 15min/30min 0.06）。したがって既定パスでは
`necklineValid ⟹ valleysNear` が恒真、`if` 全体は **`necklineSlope > 0.02` と等価**で、
`tolerancePct` は**棄却理由コードのラベルを分けているだけ**だった。

#### 害は「理由コードが間違ったつまみを指す」こと

`valleys_not_equal` / `peaks_not_equal` を見た読み手（人間も LLM も）は
「`tolerancePct` を緩めれば通る」と読む。**通らない。** `NECKLINE_SLOPE_LIMIT` が先に効くので、
名前が `neckline_slope_excess` に変わるだけで結果は同じ。`view=debug` の理由コードは
「なぜ検出されなかったか」を追うための唯一の導線（#144 / #145）なので、そこが誤った再試行を
示唆するのは #172（H&S の `shoulders_not_near`）とまったく同じ失敗である。

#### 採った案: 述語を 1 本にする（#172 の接尾辞方式は採らない）

判定を `NECKLINE_SLOPE_LIMIT` だけにし、`valleysNear` / `peaksNear` を削除した。

    if (necklineSlope > NECKLINE_SLOPE_LIMIT) reject('neckline_slope_excess')

**#172 の `shoulders_not_near:{both,cap,tolerance}` 方式（接尾辞で conjunct を分ける）は採らない。**
あちらは 2 つの述語が**別の量**（肩の左右差と、その絶対上限）を測っていたので分類に意味があった。
ここは**同じ量**なので、`necklineValid ⟹ valleysNear` から `:tolerance` は既定パスで到達不能、
残る `:both` / `:cap` は「`spread > tolerancePct` か否か」を言うだけで、
**どちらも「`tolerancePct` を緩めても通らない」点で同じ**。分類が読み手の次の行動を変えない。
`min(tolerancePct, NECKLINE_SLOPE_LIMIT)` に畳む案（挙動が締まる方向）も、
既定パスでは現行と同一で `tolerancePct < 0.02` の範囲だけを締めるため、
**同じ 1 点に逆向きの変更を入れるだけ**になるので採らない。

#### 消える理由コード（`view=debug` の契約変更）

| 理由コード | 変更 |
|---|---|
| `triple_top` の `valleys_not_equal` | **消える** → `neckline_slope_excess` に再配分 |
| `triple_bottom` の `peaks_not_equal` | **消える** → `neckline_slope_excess` に再配分 |

**`double_top` / `double_bottom` の同名コード（`detect_doubles.ts`）と、triple の relaxed 経路の
`valleys_not_equal_relaxed` / `peaks_not_equal_relaxed` は対象外**（別の判定・別のコード文字列）。
relaxed 経路は逐次の `if` で述語の重複が無く、そもそも `valleysNear` 相当の検査を持たない。

#### 実測（合成 704 + 実データ A 96 + 実データ B 96 = 896 ケース。`main` = fe3a0a3 と比較）

| | before → after |
|---|---|
| `data.patterns` | **0 / 896**（全ケース JSON deep-equal。合計 1,388 件で不変） |
| `debug.candidates` の配列の中身（cap 200） | 80 / 896 で変化（合成 16 / 実データ A 64 / **実データ B 0**）。**全件が `accepted: false` の `reason` 文字列の入れ替わりで、配列長・並び・`accepted` は不変** |
| `debug.swings` | **0 / 896** |
| `accepted: true` の候補 | 5,160 → **5,160** |

理由コードの再配分（cap を外して全件を数えたもの。cap 200 のままだと押し出しで過小に見える）:

| 理由コード | before → after |
|---|---|
| `triple_bottom:peaks_not_equal` | 104 → **0**（−104） |
| `triple_bottom:neckline_slope_excess` | 288 → **392**（+104） |
| `triple_top:valleys_not_equal` | 16 → **0**（−16） |
| `triple_top:neckline_slope_excess` | 200 → **216**（+16） |
| 棄却候補の合計 | 226,328 → **226,328** |

**1:1 の置き換えなのでエントリ数は原理的に不変**（コードを消す方向で、分岐そのものは減らない）。
実測でも cap 統計は完全に不変:

| | before → after |
|---|---|
| `candidatesTotal` / `candidatesOmitted` / `swingsTotal` / `swingsOmitted` が変わったケース | **0 / 896** |
| `candidatesTotal` の合計（標準コーパス 800） | 45,636 → **45,636** |
| `candidatesOmitted > 0`（標準コーパス） | **32 / 800** で不変 |
| `candidatesTotal` の分布（標準コーパス） | min 4 / p50 39 / p95 185 / max 289 / mean 57.0 で不変 |
| 押し出し総数（標準コーパス） | **1,588 件**で不変 |

#### 2 系列で分布がまったく違う（実データ B では 1 件も動かない）

| 系列 | `valleys_not_equal` | `peaks_not_equal` | 動いた候補 |
|---|---|---|---|
| 合成 704 | 0 | 16 | 16 |
| 実データ A（`btc_jpy_1day_2026`） | 16 | 88 | 104 |
| **実データ B（`btc_jpy_1hour_2026_08`）** | **0** | **0** | **0** |

実データ B の triple 系棄却はサイズ検査が支配的で（`peak_too_shallow` 1,460 /
`pattern_too_small` 1,320 / `valley_too_shallow` 1,208）、strict のネックライン判定に
**到達する前に落ちている**。#178 項目 2 の測定で判明した「2 系列で理由コードの分布が大きく違う」が
そのまま出た形で、**片方の系列だけで測っていたら「変化なし」と誤って結論していた**。

#### `tolerancePct < 0.02` を明示したときだけ挙動が変わる（緩む）

実効上限が `min(tolerancePct, 0.02)` → `0.02` になるので、**`tolerancePct` を 0.02 未満で
明示指定した範囲だけ緩む**。スキーマは `min(0) max(0.1)` なので指定自体は可能だが、
時間軸オートは最小でも 0.03 なので**既定パスには現れない**（896 ケースで 0 / 896）。

`tolerancePct=0.01` を全ケースに明示して測り直すと:

| | before → after |
|---|---|
| `data.patterns` が変わったケース | **40 / 896**（合成 32 / 実データ A 0 / 実データ B 8） |
| パターン合計 | 1,288 → **1,296**（+8。**減少 0**） |
| うち件数が増えたケース | 8（すべて実データ B の `1hour`。`triple_bottom` `near_completion` が 1 件ずつ追加） |
| うち confidence だけ変わったケース | 32（合成。**0.96 → 1.00**） |

`tolerancePct=0.02` ちょうどでは **0 / 896**（境界も実測で固定した）。

**「緩む」の中身は 2 つあり、大半は新規検出ではない。**

1. **confidence が上がる（32 ケース）。** 旧実装では strict が弾いた直後に relaxed fallback
   （`relaxed_triple_x1.25`）が**同じ 3 点を拾い直していた**ので、`data.patterns` には
   以前から出ていた。変わるのは relaxed の 0.95 倍ペナルティが外れる点だけ。
   単体で確認すると confidence 0.90 → 0.95 / 0.96 → 1.00。
2. **新規検出が増える（8 ケース、+8 件）。** relaxed fallback は
   **strict がその種別を 0 件にしたときにしか走らず、しかも 1 件しか返さない**。
   strict が既に他の `triple_bottom` を見つけていた実データ B では fallback が発火せず、
   旧実装ではこの候補が丸ごと落ちていた。

**緩む側に倒すことの是非: 妥当と判断した。** 理由は 3 つ。

- **`tolerancePct` は「同水準判定の許容誤差」であってネックラインの水平度ではない。**
  スキーマの description も H&S について「ネックライン水平度は本パラメータに依存しない固定閾値」と
  明言しており、triple だけが strict 経路で暗黙にネックラインへも効いていた。
  **1 本化はその description に実装を合わせる方向**で、締める側（`min()`）に倒すと
  「`tolerancePct` を下げるとネックライン要件も道連れで厳しくなる」という記載外の結合が残る。
- **旧挙動は strict / relaxed の非対称を作っていた。** relaxed 経路のネックライン判定は
  もともと `NECKLINE_SLOPE_LIMIT` 一本で、`tolerancePct` を掛けていない。
  strict だけが厳しく、弾いた形を relaxed が confidence を 0.95 倍して拾い直す
  ——#187 が `MAX_VALLEY_SPREAD` で解消したのと**同じ構図**が残っていた。
- **単調で、失う検出が無い。** 896 ケース × `tolerancePct=0.01` で**減少 0 / 消えた検出 0**。
  増える 8 件はいずれも `near_completion`（未ブレイク）で、
  ブレイク済みの偽シグナルが増える変更ではない。

締めたい場合の代替は `min(tolerancePct, NECKLINE_SLOPE_LIMIT)` への 1 本化だが、
**既定パスでは現行とまったく同じで、`tolerancePct < 0.02` の範囲だけを逆向きに動かす**。
上の 3 点から採らなかった。

#### #172 / #174 との関係——**同じ失敗を triple でもやっていた**

| | #172 / #174（H&S） | 本件（triple） |
|---|---|---|
| 症状 | 1 つの理由コードが 2 つの conjunct を束ねており、どちらで落ちたか分からない | 同左（`valleys_not_equal` / `neckline_slope_excess`） |
| 2 つの述語が測る量 | **別の量**（肩の左右差 / その絶対上限） | **同じ量**（同一の式） |
| 対処 | 接尾辞で 3 分類に分ける（`shoulders_not_near:{both,cap,tolerance}`） | **述語を 1 本にして理由コードを 1 つ消す** |

**片方が他方を含意する 2 つの述語に別々の名前を付けること自体**が診断を壊していた、という点が
本件の核心で、接尾辞で説明を足しても「間違ったつまみを指す」ことは直らない。
なお命名規約（strict / relaxed の分離、`:` 区切りの接尾辞）は今回**新しいコードを増やさない**ため
出番が無かった。triple の `_relaxed` **接尾辞**の idiom は既存のまま維持している。

### Removed（完成済み `triple_bottom` の `MAX_VALLEY_SPREAD`（1.5%）を削除した。#178 項目 2）

`findStrictTripleBottom` にあった 3 谷の価格水準基準のばらつき上限

    valleySpreadValid = (valleyMax - valleyMin) / max(1, valleyMin) <= 0.015

を削除した。判定は削除後も 2 段残る:

| 段 | 実装 | 基準 | 棄却理由コード |
|---|---|---|---|
| 段 1 | `nearAll`（3 点の `near()`） | `tolerancePct`（価格水準の %。既定 4%） | `three_valleys_not_level` |
| ~~段 2~~ | ~~`MAX_VALLEY_SPREAD`~~ | ~~1.5%（価格水準の %）~~ | ~~`valley_spread_excess`~~ |
| 段 3 | `validateLevelSpread`（#138） | `MAX_LEVEL_SPREAD_RATIO`（パターン高さ比 0.5） | `valley_spread_vs_height_excess` |

削除後の三項は `!peaksNear ? 'peaks_not_equal' : 'neckline_slope_excess'` になり、
`findStrictTripleTop` の同じ位置とまったく同じ形になる（**この 2 箇所の枝の取り違えは #186 の担当**。
本 PR では 2 箇所を揃えるところまでで、条件と理由コードの対応は触っていない）。

#### 削除しても `data.patterns` は変わらない

| | before → after |
|---|---|
| `data.patterns` | **0 / 896**（全ケース JSON deep-equal。合計 1,388 件で不変） |
| `debug.candidates` の配列の中身 | 96 / 896 で変化（合成 16 / 実データ A 80。**全件が `accepted: false` の `reason` 文字列の入れ替わりで、配列長・並び・`accepted` は不変**） |
| `debug.swings` | **0 / 896** |
| `accepted: true` の候補 | 5,160 → **5,160** |

2 系列 896 ケース = 標準コーパス 800（合成 704 = `tests/detect_patterns_fixtures.test.ts` の
fixture 22 件 × オプション 8 × 時間足 2 × `swingDepth` 2、実データ A 96 =
`tests/fixtures/btc_jpy_1day_2026.ts` × 時間足 3 × `swingDepth` 4 × オプション 8）
＋ **実データ B 96** = `tests/fixtures/btc_jpy_1hour_2026_08.ts` × 時間足 3 × `swingDepth` 4 × オプション 8。

#### 2 つの非対称が同時に解消する

- **top / bottom。** #138 確認事項 B に記録済みの非対称。同形の 3 点ばらつきに対する実効上限が
  `triple_bottom` 1.5% / `triple_top` `tolerancePct`（既定 4%）だった。
- **strict / relaxed（未記録。今回判明）。** `MAX_VALLEY_SPREAD` は完成済み 4 経路
  （`findStrictTripleTop` / `findStrictTripleBottom` / relaxed top / relaxed bottom）のうち
  **`findStrictTripleBottom` にしか無かった**。同じ `triple_bottom` でも strict のほうが厳しく、
  strict が弾いた形を relaxed fallback が拾い直して**同じパターンを検出していた**
  （`_fallback: 'relaxed_triple_x1.25'` が付くだけで `data.patterns` は同じ。`_fallback` は
  出力スキーマ未宣言で `parse()` に落とされるため、外からは区別できなかった）。

**`MAX_PEAK_SPREAD` を新設して対称化する案は採らない**（価格水準基準の閾値を増やすのは #138 が
問題にしている方向そのもの）。**relaxed 側に段 2 を足して strict に揃える案も採らない**（締める方向の別変更）。

#### 消える理由コード: `valley_spread_excess`（`view=debug` の契約変更）

`view=debug` の `data.debug.candidates[].reason` から `valley_spread_excess` が消える。
`data.patterns` は変わらないので、影響を受けるのは棄却理由を読んでいる利用側だけ。

#### 段 2 が止めていた 21 実体は、すべて既存の他の検査が受け止める

段 2 が発火した候補を **(価格系列, 3 谷の `indices`) で畳んだ実体**は 21（時間足 / `swingDepth` /
オプションの重複を除いた数。合成 2 / 実データ A 6 / 実データ B 13）。**そのすべてが段 2 以外の
検査でも棄却される**——段 2 だけが止めていた実体は **0 件**:

| 受け止める検査 | 実体数（21 中） |
|---|---|
| 構造ゲート（`neckline_above_pre_decline_high` / `retracement_out_of_band`） | 15（71%） |
| **段 3**（`valley_spread_vs_height_excess`） | **10（48%）** |
| ネックライン傾き（`NECKLINE_SLOPE_LIMIT`） | 8（38%） |
| サイズ検査（`peak_too_shallow` / `pattern_too_small`） | 5（24%） |
| 山の同水準（`peaks_not_equal`） | 3（14%） |
| **どれにも掛からない** | **0** |

1 実体が複数の検査に掛かるため合計は 21 を超える。段 3 が受け止めるのが約半分で、
残りはサイズ検査・構造ゲート・ネックライン傾きが引き受ける。

**実データ B の 13 実体は `view=debug` の出力には現れない。** あちらは候補が cap（200）を超える
ケースが多く、該当エントリはトリムで押し出されている（`debug.candidates` が変化した 96 ケースに
実データ B が 1 件も入らないのはそのため）。実体の数え上げは検出器内で採取した。

#### 棄却理由は 1:1 で置き換わる（＝ cap 統計は原理的に不変）

`debug.candidates` に積まれる**エントリの位置・件数・`accepted` は一切変わらず**、`reason` の
文字列だけが入れ替わる。896 ケースの実測（トリム後）:

| 理由コード | before → after |
|---|---|
| `triple_bottom:valley_spread_excess` | 192 → **0**（−192） |
| `triple_bottom:neckline_slope_excess` | 80 → **188**（+108） |
| `triple_bottom:peaks_not_equal` | 40 → **80**（+40） |
| `triple_bottom:retracement_out_of_band` | 112 → **144**（+32） |
| `triple_bottom:valley_spread_vs_height_excess` | 12 → **24**（+12） |
| 棄却候補の合計 | 58,088 → **58,088** |

`+108 + 40 + 32 + 12 = 192` で差し引き 0。トリムは「先頭 `cap` 件を残す」だけなので、
**件数が変わらない以上 cap 統計は原理的に不変**。実測でも変化 0:

| | before → after |
|---|---|
| `candidatesTotal` / `candidatesOmitted` / `swingsTotal` / `swingsOmitted` が変わったケース | **0 / 896** |
| `candidatesTotal` の合計 | 231,488 → **231,488** |
| `candidatesOmitted > 0`（標準コーパス） | 32 / 800（合成 0 / 704・実データ A 32 / 96）で不変 |
| `candidatesTotal` の分布（標準コーパス） | min 4 / p50 39 / p95 185 / max 289 / mean 57.0 で不変 |
| 押し出し総数（標準コーパス） | 1,588 件で不変 |

#### テストの追随

`tests/patterns/detect_triples.test.ts` の「谷スプレッド超過 → `valley_spread_excess` rejected」は
**入力を引き継いで受理側のテストに書き換えた**。v1=100 / v2=101 / v3=103 のばらつき 3% は
段 1（`tolerancePct` 4%）も段 3（高さ 20 に対し 3 / 20 = 0.15）も通るので、削除後は strict が受理する。
**削除前もこの入力は `data.patterns` に出ていた**（strict が弾いて relaxed fallback が拾い直していた）
ので、tool 表面の挙動は変わらず、strict / relaxed の非対称だけが消える。
top / bottom の対称性（同形の `triple_top` と同じ confidence・同じ経路で出ること）も併せて固定した。

### Fixed（`meta.effective_params` が出力スキーマ未宣言で毎回 strip され、**どのクライアントにも届いていなかった**。#184）

**根本原因は D（出力スキーマ未宣言）。** `tools/detect_patterns.ts` は #114 以前から `meta.effective_params`
を載せていたが、`src/schema/patterns.ts` の `meta` に宣言が無かった。Zod の object は未宣言のキーを
**エラーにせず黙って落とす**ので、`DetectPatternsOutputSchema.parse()` を通した時点で消えていた。

    parse ok = true
    meta keys after parse = count,pair,type,visualization_hints
    effective_params survived = false

**parse は成功する。** だから壊れていることが出力にもテストにも現れない。実質デッドコードだった
（`effective_params` は本リポジトリの履歴の起点から載っており、#114 より前からずっと届いていない）。

本 issue の 5 つの欠陥（D / E / A / B / C）は全部この 1 面の話で、**D を直さない限り A / B / C を
実装しても 1 バイトも届かない**。順に D → E → A → B → C で直した。

#### D. 出力スキーマに宣言した（+ 再発防止）

`meta` の宣言は `pair` / `type` / `count` / `scan` / `visualization_hints` / `debug` / `warning` /
`warnings` の 8 つだけだった。9 つ目として `effective_params` を宣言し、`.describe()` に
**「解決後の実効値であって入力値ではない」「sentinel 置換により入力値と一致しないことがある」**（#182）を明記した。

**これは #155（`debug.candidates[].status`）/ #160（同 `breakoutDirection`）に続く 3 回目。**
3 回ともレビューで見つかっていない。人手で気づけないクラスなので機械で固定した:

`tests/detect_patterns_meta_schema_parity.test.ts` — `DetectPatternsOutputSchema.parse` を spy して
**入力（ツールが実際に載せた meta）と出力（宣言されていて生き残った meta）のキーパス集合が一致する**
ことを検証する。配列は `[]` を挟んで全要素を合算するので `debug.candidates[].status` のような
**配列要素の中の strip** も捕まえる。実際に宣言を消して確認した:

    // effective_params の宣言を消したとき
    AssertionError: … strip されているキー: [ 'effective_params', 'effective_params.swingDepth', … 13 件 ]
    // candidates の status 宣言を消したとき（= #155 の再現）
    AssertionError: … strip されているキー: [ 'debug.candidates[].status' ]

**横断テスト（全ツール一括）にはしていない。** 理由は 3 つで、いずれも現状の作りに由来する:

1. **`ToolDefinition`（`src/tool-definition.ts`）が `outputSchema` を持たない。** 出力スキーマは各ツールの
   モジュール内部でしか参照されないので、`tool-registry` からツールを列挙しても schema に手が届かない。
2. **上流フィクスチャがツールごとに違う。** `parse` を通すには実際に走らせる必要があり、bitbank REST の
   応答（candlestick / ticker / depth / transactions / pairs）をツールごとに用意することになる。
   `OutputSchema.parse` を持つ 40 ファイルのうち 16 は Private 系で、API キーと HMAC 署名クライアントの
   モックも要る。
3. **`meta` は条件付きで組まれる**（`...(scan ? { scan } : {})` 等）ので、1 回の happy path では
   meta の全形を踏めない。動的なので静的解析でキーを列挙することもできない。

無理に一般化すると「全ツールを浅く 1 回走らせて、たまたま出たキーだけ見る」テストになり、
**落ちないが守ってもいない**状態になる。代わりに**横展開しやすい形**にした——判定ロジックを
`tests/_schemaKeyParity.ts`（`keyPaths` / `expectNoStrippedKeys`）に切り出したので、
新しいツールの parity テストは「上流モック + `parse` の spy + `expectNoStrippedKeys`」の 3 ステップで書ける。

同じヘルパを `data` 側にも当てたところ、**別クラスの既知欠落が 4 件見つかった**
（`patterns[]._method` / `patterns[].breakout{,.idx,.price}`）。宣言を足すと `data.patterns` の中身が
変わるため #184 では直さず、`KNOWN_DATA_STRIPS` として**理由つきで記録**した。allowlist は増えれば落ちるし、
逆に宣言されても（「実際には strip されていない」で）落ちる。

#### E. 0 件時メッセージが生入力値を出し、それを基準に緩和を助言していた

`src/handlers/detectPatternsViewsHandler.ts` の旧実装:

    const effTol = meta?.effective_params?.tolerancePct ?? tolerancePct ?? 'default';

D により第 1 項は**常に `undefined`**。第 2 項の**生入力値**に落ちていた。1hour・パラメータ未指定での実測:

    パターンは検出されませんでした（tolerancePct=0.04）。
    ・必要に応じて tolerance を 0.03-0.06 に緩和してください

**実効値は 0.05 なのに 0.04 と表示し、その 0.04 を基準に緩和を助言していた。** これが #182 の誤報告
（LLM が「0.04 → 0.05 に緩めて再検出した」と報告したが、1hour では前後とも実効 0.05 で no-op）を誘発した。
助言の「0.03-0.06」も実効 0.05 に対しては**半分が締める方向**を指していた。

値の表示は C の共通行に一本化し、`effTol` のフォールバックごと消した（`formatDetailedView` の
`tolerancePct` 引数も削除）。助言は実効値基準に書き換えた:

    パターンは検出されませんでした。
    ・検討パターン: 既定セット
    ・緩めるなら tolerancePct に実効値 0.05 より大きい値を指定してください（上限 0.1）。0.05 以下は締める方向です（スキーマ既定値 0.04 は sentinel なので時間軸オート値に戻ります）

**実効値を持たない meta では数値を主張しない**（`実効値は上の実効パラメータ行を参照` に落とす）。
今回の欠陥はまさに「実効値が無いときに入力値で代用した」ことなので、そこを回帰テストで固定した。

#### A. `headProminencePct` を `effective_params` に足した

`resolveParams` は #149 / PR #153 の時点で返しており、`detect_patterns.ts` でも分割代入済みだったが、
`effective_params` に載せる 4 つ目として足されていなかった（追随漏れ）。D のスキーマ宣言にも含めてある。

#### B. `autoScaled` を廃止し、per-parameter の `source` にした（案 B-2）

旧 `autoScaled` は `swingDepth` / `minBarsBetweenSwings` が**どちらも未指定**のときだけ `true` になる
集約フラグだった。ところが MCP 経路では 3 パラメータとも `.default()` が埋まるため
`opts.swingDepth === undefined` の経路が**存在しない**。実測:

    {"pair":"btc_jpy","type":"1hour"}                -> opts 7/5/0.04 -> resolved 3/2/0.05 | autoScaled = false
    {"pair":"btc_jpy","type":"1hour","swingDepth":4} -> opts 4/5/0.04 -> resolved 4/2/0.05 | autoScaled = false
    直接呼び resolveParams("1hour", {})                                      | autoScaled = true

1 行目が問題で、**何も指定していない（解決値が完全に時間軸オート）のに `false`** を返していた。
集約フラグでは「どのパラメータが auto でどれが明示か」も表現できず、C で LLM に見せたい情報にも足りない。

そこで `resolveParams` の戻り値を `autoScaled: boolean` → `sources: { <param>: 'auto' | 'explicit' }` に
変え、`meta.effective_params` も**パラメータごとに `{ value, source }`** にした。

**shape 変更だが破壊的ではない。** D により `effective_params` は**外部に一度も出たことがない**ので、
既存クライアントは壊れない。規約 2（`structuredContent` からフィールドを削らない）にも抵触しない
——届いていなかったものは「既存の契約」ではないため。**shape を変えるなら今が唯一のタイミング**だった。

`.default()` がある限り「未指定」と「既定値を明示指定」は区別できないので、`auto` はその 2 つを畳んでいる
（本 PR では区別しない——どちらでも実効値は同じで、見せたいのは実効値のほう）。区別が要るなら
issue #182 案 B（`.default()` 除去）が前提。`headProminencePct` だけは `.default()` が無いので
`auto` = 未指定と同義。

**実効値の計算は 1 行も変えていない。** 入れ子三項を `xxxExplicit` の平坦な述語に書き換えたが、
**パラメータごとの述語は元のまま**にしてある（`swingDepth` / `minBarsBetweenSwings` は `Number.isFinite`、
`tolerancePct` / `headProminencePct` は `typeof number && !NaN`）。揃えると `Infinity` の扱いが変わって
実効値が動くため。`Infinity` / `NaN` のエッジケースもテストで固定した。

再発防止として、**`DetectPatternsInputSchema.parse()` を通した値で**検証するテストを足した
（`tests/patterns/config.test.ts`）。既存テストが `resolveParams` の直接呼びだけだったことが、
「MCP 経路では `.default()` が埋まる」を見逃した原因。

#### C. 実効パラメータ行を `content` に出した（本丸）

**LLM は `structuredContent` を読めない**（`.claude/rules/tools.md`）。`meta` に載せるだけでは
目的を達しないので、**4 つの view すべて**のヘッダ直下に 1 行出す:

    実効パラメータ（入力値ではない）: swingDepth=3(auto) / minBarsBetweenSwings=2(auto) / tolerancePct=0.05(auto) / headProminencePct=0.05(auto) ※auto=1hour の時間軸オート値（スキーマ既定値 7/5/0.04 の明示指定も auto）

- **常に出す。** 「行が無い = 渡した値がそのまま効いた」を LLM に推論させるのは不確実なため。
  **足が 20 本未満で `'insufficient data'` に落ちる経路も含む。** `ok()` を返す経路は 2 つあり、
  当初は早期 return 側に `effective_params` を足しておらず、`meta` の形が candle 本数に依存していた
  （PR レビューで指摘されて修正。欠陥 A と同じ追随漏れのクラス）。パラメータは早期 return より
  **前**に解決済みなので、足りなかった側でも実効値は申告できる。構築を `resolveParams` 直後の
  1 箇所に集約し、両経路で同じオブジェクトを渡すことで足し忘れの余地を消した。
- **sentinel 置換が可視になる。** `swingDepth=7` を渡して `swingDepth=3(auto)` と出るのがその状態。
  `※` 注記は `auto` が 1 つも無い呼び出し（全パラメータ明示）では出さない——存在しない印の説明はしない。
- **`debug` にも出す。** 階梯外（出力の置換）なので上位集合規約の対象外だが、診断が目的の view で
  いちばん要る情報で、規約は「出してはいけない」とは言っていない。
- 行は `detectPatternsHandler` で**1 回だけ**組んで 4 view に配る。view ごとに組み直すと文言がずれ、
  上位集合テストが意味を失う。

固定費は `auto` を含む場合 **175 文字 + 改行 1**（全パラメータ明示なら 116 文字）。同じ view にある
`trustNote`（200 文字超）より軽い。`summary` にも入れてあり（入れないと規約 §3 違反）、
`tests/view-content-superset.test.ts` の**定型要素**に新しい抽出子として追加した。

#### 触っていないもの

- `resolveParams` の sentinel 置換ロジック（実効値の**計算**）— 述語は元のまま
- `.default()`（#182 案 B）/ `getDefaultParamsForTf` / `getDefaultToleranceForTf`
- 検出結果

**`data.patterns` は変わらない。** `meta` と `content` にしか触っていないため、800 ケース測定は行っていない
（合成 fixture の回帰テストは全件通過）。

### Fixed（スイング検出 3 パラメータの**スキーマ既定値が sentinel** であることがどこにも書かれていなかった。#182）

**`swingDepth=7` / `tolerancePct=0.04` / `minBarsBetweenSwings=5` を明示的に渡すと、時間軸オート値に
置換される。** `resolveParams`（`tools/patterns/config.ts`）が「スキーマ既定値と等しいか」で未指定を
判定しているためで、**この 3 値だけは固定値として要求できない。**

    // swingDepth: スキーマ既定値(7)が来た場合は時間軸オートに置換
    const swingDepth = Number.isFinite(opts.swingDepth as number)
        ? (opts.swingDepth as number) === SCHEMA_DEFAULTS.swingDepth
            ? auto.swingDepth
            : (opts.swingDepth as number)
        : auto.swingDepth;

挙動自体は意図的で `tests/patterns/config.test.ts` が既に固定している。**問題はどこにも書かれて
いなかったこと**で、`swingDepth` と `minBarsBetweenSwings` には `.describe()` すら無く、
`tolerancePct` の `.describe()` は #149 の H&S 意味論しか書いていなかった。

| 呼び出し | `1hour` | `4hour` | `1day` |
|---|---|---|---|
| `{swingDepth: 7, tolerancePct: 0.04, minBarsBetweenSwings: 5}` | 3 / 0.05 / 2 | 5 / 0.05 / 3 | 6 / 0.04 / 4 |
| `{swingDepth: 6, tolerancePct: 0.041, minBarsBetweenSwings: 4}` | 6 / 0.041 / 4 | 6 / 0.041 / 4 | 6 / 0.041 / 4 |

**1 だけずらせば通る。ちょうど既定値のときだけ通らない。**

#### 実害: LLM が「緩めて再検出した」と報告するが、実効値は前後とも同じ

Claude Desktop の実機テストで、LLM が「`tolerancePct` を 0.04 → 0.05 に緩めて再検出した」と報告した。
`1hour` では **0.04 も 0.05 に解決される**ので、実効値は前後とも 0.05。**何も緩んでいない。**
`tolerancePct` は description があるぶんかえって危険で、「大きいほど緩い」と書いてあるため
0.04 → 0.05 が効くと読める。#172 / #174 と同じ、**description が LLM に誤った結論を出させるクラス**。

#### `headProminencePct` だけが既に正解の形だった

`headProminencePct`（#149 / PR #153）はこの問題を持たない。理由は 2 つ:

1. **`.default()` を付けていない。** `undefined` が正規の sentinel になるので、明示値はすべてそのまま通る
   （`config.ts` の同パラメータのコメントに理由がある）。
2. **description に時間軸オートの表を書いてある。**

本変更は**この 2 つ目だけを 3 パラメータに横展開した**。`.default()` の除去（#182 案 B）は入れていない
——外すと「既定値を明示指定したのに置換される」は消えるが、**入力スキーマの契約変更**になるため別途。

#### 変更点（`src/schema/patterns.ts` の description のみ）

| 対象 | 変更 |
|---|---|
| `swingDepth`（`.describe()` 新規） | 意味 ＋ 時間軸オート表（1min/5min=2, 15min/30min/1hour=3, 4hour/8hour/12hour=5, 1day=6, 1week=7, 1month=8）＋ **既定値 7 は sentinel** |
| `minBarsBetweenSwings`（`.describe()` 新規） | 意味 ＋ 時間軸オート表（1min/5min=1, 15min/30min/1hour=2, 4hour/8hour/12hour=3, 1day=4, 1week=5, 1month=6）＋ **既定値 5 は sentinel** |
| `tolerancePct`（既存 `.describe()` に追記） | **#149 の H&S 意味論はそのまま残し**、後ろに時間軸オート表（`headProminencePct` と同一文言）＋ **既定値 0.04 は sentinel** ＋ 上記 no-op の実例 |
| `patterns` の推奨行 | `- double_top/double_bottom: default (swingDepth=7, tolerancePct=0.04, minBarsBetweenSwings=5)` が**字面として sentinel 値そのもの**だったので「未指定のままにせよ」に書き換え。`≈` の推奨値が時間軸オートと衝突しうる旨も 1 行足した（`1hour`/`4hour` で `tolerancePct≈0.05` は no-op、`15min`/`30min` では**締める**側） |

表は 2 パラメータそれぞれに**値そのものを書いた**（片方から参照させない）。LLM は 1 パラメータの
description だけを読んで判断しうるため。

`docs/tools.md` の「detect_patterns 詳細ガイド」にも同じ表と置換の説明を足した（数値は schema と同一）。

#### 触っていないもの

- `resolveParams` / `getDefaultParamsForTf` / `getDefaultToleranceForTf` — 1 バイトも変えていない
- `.default()` — 3 つとも残している（#182 案 B）
- `content` / `meta` の出力（`effective_params` に `headProminencePct` が漏れている件も含めて別 PR）

**`data.patterns` は変わらない。** #172（docstring のみ）と同じ扱いで、description 文字列に依存する
テストも無いため 800 ケース測定は行っていない。

### Fixed（`view=debug` の `debug.candidates` が cap=200 で黙って切られ、切られたことが出力から分からなかった。#180 案 1）

`debug.candidates` / `debug.swings` は cap=200 で打ち切られるが、**打ち切られたことが出力のどこにも
現れなかった**（総数も省略件数も無い）。呼び出し側は 200 件を受け取ってもそれが全件か一部か判別できない。

トリムは `[...accepted, ...rejected]` を先頭から cap 件残すので、**押し出しは棄却理由から始まる**。
`view=debug` の目的（なぜ検出されなかったかを理由コードで追う。#144 / #145）はまさにその棄却理由なので、
目的の情報から先に選択的に消える。censored な内訳から誤帰属した実例が #152 → #167 / #172 で、
censored かどうかは出力から分からなかった。

**cap の値もトリム戦略も変えていない。申告だけ**（#180 の案 2〜5 は本 PR の対象外。下の実測を見てから判断する）。

#### 変更点

1. **`meta.debug` に `candidatesTotal` / `candidatesOmitted` / `swingsTotal` / `swingsOmitted`**
   （`tools/detect_patterns.ts`）。
2. **出力スキーマ（`src/schema/patterns.ts` の `debug`）に 4 つとも宣言した。**
   宣言が無いと `DetectPatternsOutputSchema.parse` が**黙って strip する**（#155 / PR #159 の
   `status`、#160 / PR #161 の `breakoutDirection` で 2 回踏んだ）。回帰は
   `tests/detect_patterns_debug.test.ts` の「cap トリムの申告（#180）」で固定した。
3. **`content[0].text` に 1 行**（`formatDebugView`）。**LLM は `structuredContent` を見ない**
   （`.claude/rules/tools.md`）ので `meta` に足すだけでは目的を達しない。見出しに直付けする:

       【Candidates】 200 / 全 289 件（89 件省略。accepted は全件残っているため省略分はすべて棄却理由）
       【Swings】 23 / 全 23 件（省略なし）

   **省略 0 でも「省略なし」を明示する。** 「200 件」だけだと飽和しているのか偶然 200 なのか読めない。
   `swings` は**先頭から**残すので落ちるのは直近側で、`candidates` とは落ちる側が逆になる。文言も分けた。
   **「省略分はすべて棄却理由」は無条件には書かない。** accepted が cap を超えれば accepted も
   押し出されるので、**返した配列に `accepted: false` が 1 件でも残っているとき**（＝accepted が
   全件収まったことが確定するとき）だけそう書き、全件 accepted のときは「accepted も含まれうる」に
   切り替える。判別は返却済みの配列だけでできるのでフィールドは増やしていない。
   申告フィールドを持たない meta（ハンドラを直接呼ぶ経路）では**件数行ごと出さない**——件数が分からない
   のに「省略なし」と書けば、本 issue が直そうとしている嘘をそのまま再導入することになる。
4. `view` の debug 節（LLM に届く文言）に申告フィールドの存在を明記した。

#### 総数は「絞り込み**後**」を数える

`candidatesTotal` は `filterCandidatesByWant`（#124）で入力 `patterns` に絞った**後**の
`relevantCandidates.length`。トリムされる母集団そのものなので「自分が要求した種別の棄却理由が
censored されたか」に直接答える。

**絞り込み前（`debugCandidates.length`）は出さない。** 絞り込みは cap を守るための仕組みなので、
「`patterns` を広げればもっと見える」は偽（広げるほど押し出しは増える）。混乱を招くだけで行動に繋がらない。
どちらを数えたかはスキーマの description に書いてある。

#### 実測（合成 704 + 実データ 96 = 800 ケース。`main` = 056ecc2 と比較）

合成 704 = `tests/detect_patterns_fixtures.test.ts` の fixture 22 件 × オプション 8 通り
（`includeForming` / `includeCompleted` / `includeInvalid`）× 時間足 2 種（`1day` / `1hour`）×
`swingDepth` 2 種（2 / 3）、実データ 96 = `tests/fixtures/btc_jpy_1day_2026.ts` × 時間足 3 種
（`1day` / `4hour` / `1hour`）× `swingDepth` 4 種（既定 / 2 / 3 / 6）× オプション 8 通り。
手順・ケース数とも #131 以降と同じ 800 ケース。

| | before → after |
|---|---|
| `data.patterns` | **0 / 800**（全ケース deep-equal。合計 636 件） |
| `debug.candidates` の配列の中身 | **0 / 800**（JSON 完全一致。総数 45,636 も不変） |
| `debug.swings` の配列の中身 | **0 / 800** |
| 新フィールドが出力に届いたケース | 0 / 800 → **800 / 800**（strip なし） |

**申告値がトリムの実挙動と一致することも突き合わせた。** cap を一時的に外して全候補を採取し、
`candidatesTotal` = 実際の総数、`candidatesOmitted` = 総数 − 200、返っている配列 = 全候補の先頭 200 件、
が 32 ケースすべてで一致した（不一致 0）。

##### `candidatesTotal` の分布（800 ケース）

| min | p25 | p50 | p75 | p90 | p95 | p99 | max | mean |
|---|---|---|---|---|---|---|---|---|
| 4 | 31 | 39 | 56 | 105 | 180 | 259 | **289** | 57.0 |

##### 押し出しの実態

| | 値 |
|---|---|
| `candidatesOmitted > 0` のケース | **32 / 800**（合成 **0 / 704** / 実データ **32 / 96**） |
| 押し出し総数 | **1,588 件**。**全件 `accepted: false`**（＝棄却理由） |
| 1 ケースあたりの `accepted` 件数 | **最大 20 件**（cap 超過 32 ケースでは 10〜20）。accepted が cap を超えたケースは **0** |
| `swingsOmitted > 0` のケース | **0 / 800**（`swingsTotal` は min 0 / p50 5 / p95 15 / **max 23**） |
| ちょうど 200 件（偶然の飽和） | **0 件**（`>= 200` と `> 200` が同数） |

押し出しの理由コード内訳（上位 10。合計 1,588）:

| 件数 | 種別 : 理由コード |
|---|---|
| 208 | `triple_bottom` : `peaks_missing_relaxed` |
| 164 | `triple_bottom` : `neckline_slope_excess_relaxed` |
| 136 | `triple_top` : `valleys_missing_relaxed` |
| 116 | `triangle_symmetrical` : `r2_below_threshold` |
| 112 | `triple_top` : `neckline_slope_excess_relaxed` |
| 104 | `triple_bottom` : `forming_neckline_not_horizontal` |
| 80 | `flag` : `insufficient_consolidation_swings` |
| 80 | `triple_bottom` : `three_valleys_not_level` |
| 76 | `triple_bottom` : `valley_spread_vs_height_excess` |
| 72 | `rising_wedge` : `r2_below_threshold` |

種別で畳むと `triple_bottom` 740 / `triple_top` 436 / `flag` 224 / `triangle_symmetrical` 116 /
`rising_wedge` 72。**偏りは実在する**（#180 の案 4「トリムを賢くする」の判断材料）。

**押し出しは全 32 ケースが実データ側**（`btc_jpy_1day_2026`）で、内訳は `swingDepth: 2` の
3 時間足 × オプション 8 = 24 と `swingDepth: 3` × `1day` × オプション 8 = 8。
**合成 704 ケースは 1 件も cap に届いていない**（最大 180）。合成 fixture だけを見て
「cap は効いていない」と判断すると誤る。

#### **今後の「cap 到達」はこの定義で測る**

**cap 到達ケース = `meta.debug.candidatesOmitted > 0` のケース数。**
`swings` 側は `meta.debug.swingsOmitted > 0` で**別に**数える（配列が違うので合算しない）。
`debug.candidates` の**配列長が 200**であることは指標にしない——偶然 200 と飽和 200 を区別できない。

**過去 4 PR の数値とは一致しない。定義が違うため。** #159 が 36、#166 が 5 → 6、#175 が 86、
そして #176 が 20 → 32 を「cap 到達 / 超過ケース」として記録しているが、#175（86）と #176（20）は
**同じ標準コーパスで #176 の baseline が #175 を含む `main`** なので、同じ指標なら一致していなければ
ならなかった。本定義での `main` の実測は **32** で #176 の after と一致する（押し出し 1,588 件も一致）。
**以後は申告フィールドを読むこと。手で数え直さない。**

#### やらなかったこと（#180 の残り）

- **`cap = 200` の値の変更（案 2）** / **`view` 依存のトリム（案 3）** / **トリム戦略の変更（案 4）**。
  上の実測を見てから判断する。
- **`swings` の「先頭 200」問題の修正。** `debugSwings.slice(0, cap)` は古いほうから 200 件を残すので
  ピボットが 200 を超えると**直近のスイングが落ちる**。**申告で可視化するに留めた**——どちらを残すかを
  変えるのは `debug.swings` の中身が変わる変更で、「配列の中身は 1 件も変えない」という本 PR の前提と
  衝突する。本コーパスでは `swingsTotal` の最大が 23 で**一度も cap に届いていない**（issue #180 に報告）。
- **`meta.omitted: ['field.path']` 形式の採用。** `.claude/rules/tools.md` 規約 2 のあれは「どのフィールドを
  落としたか」の宣言で、配列の切り詰めとは形が違う。原則（黙って削らない）は同じだが、形は件数が適切。

### Fixed（triple の「同水準」判定が価格水準基準で、パターン自身の高さと無関係だった。#138）

完成済み triple の同水準判定は `near`（`|a−b| / max(a,b) <= tolerancePct`）だけで、**分母が価格水準**
だった。許容幅がパターン自身の高さと無関係なので、起票時の実例（BTC/JPY 1hour、レンジ相場）では

| | 値 |
|---|---|
| `tolerancePct`（1hour の tf-auto） | 5% |
| 許容幅 = 12,726,672 × 5% | ≈ 636,000 円 |
| パターン高さ | ≈ 208,000 円 |

**「同水準」の許容幅がパターン高さの 3 倍**あり、3 山が高さの 68% ばらついて単調に切り下がっていても
通っていた。#138 が「サイズ検査が高さの下限を保証するので緊急性は下がる」として記録に留めていた
問題だが、**#152 / PR #168 がその下限を 1hour で 4.8 倍緩めた**（`MIN_PATTERN_HEIGHT_PCT` 3% →
0.62%、`MIN_DEPTH_PCT` 5% → 1.04%）ため根拠が外れた。

#### 対応: 高さで正規化した独立の hard reject（`MAX_LEVEL_SPREAD_RATIO = 0.5`）

    spreadRatio = (max(主構成点) - min(主構成点)) / パターン高さ

- **主構成点は `price`（終値）、パターン高さは `extremePrice`（高安）** で測る。#131 / #132 の
  「水準同一性は終値・値幅は高安」をそれぞれの既存慣行のまま使った形。`extremePrice` 基準の
  全振幅は `price` 基準以上なので **比は保守的（小さめ）に出る＝新しい棄却は控えめになる**。
- **`tolerancePct` は触らない。** 公開パラメータで description に契約があり、全検出器が共有し、
  `headProminencePct` の既定値も同じ表から来ている（#152 で確定）。実効的な水準ばらつきの上限は
  `min(tolerancePct × 価格水準, 0.5 × パターン高さ)` になる。
- **時間足別テーブルを持たない。** 高さで正規化しているのでボラティリティの水準に依らない
  （`getSizeThresholdsForTf` が時間足別なのは、あちらが価格水準の % を絶対的な下限として使っており
  ATR に対する難易度が揃わなかったため。本比は無次元でその問題が無い）。
- **上下で対称。** 既存の `MAX_VALLEY_SPREAD`（0.015）は bottom にしか無く、実効的なばらつき上限が
  `triple_bottom` 1.5% / `triple_top` 5% と非対称だったが、**本ゲートはその非対称を持ち込まない**。
  `MAX_VALLEY_SPREAD` 自体は**残した**——同じ転倒（分母が `valleyMin`）を持つが、外すと `triple_bottom`
  が緩む方向に動き、「下限を足すだけなので単調に減るか不変」という本 PR の前提が壊れる。
  `MAX_PEAK_SPREAD` を新設して対称化する案も採らない（価格水準基準の閾値を増やすのは #138 が
  問題にしている方向そのもの）。

  > **追記（#178 項目 2 / PR #187）**: この「外すと `triple_bottom` が緩む方向に動く」という前提は
  > 実測で否定された。`MAX_VALLEY_SPREAD` を削除しても 2 系列 896 ケースで `data.patterns` の変化は
  > **0 件**（`accepted` 候補も 5,160 で不変）。段 2 が止めていた 21 実体はすべて段 3 / サイズ検査 /
  > 構造ゲート / ネックライン傾きが受け止めており、棄却理由が 1:1 で入れ替わるだけだった。
  > **削除済み**（`MAX_PEAK_SPREAD` を新設しない、という上の判断はそのまま維持している）。
- 配置は `validatePatternSize` の docstring の規約に従い、**既存の棄却検査をすべて通過した後**
  （構造ゲート `validateReversalStructure` よりも後）。前に置くと固有の理由コードを持つ候補の
  `reason` を横取りする。

#### 適用範囲: strict + **完成済み relaxed**。strict だけでは 1 件も減らない

`detectTriples` は **strict がその種別を 1 件も出さなかったときに relaxed へフォールバックする**。
relaxed は同じ 3 山を `tolerancePct × {1.25, 2.0}` で拾い直し、`confidence × 0.95` で
**同じ範囲・同じ構成点のパターン**を返すので、strict にだけゲートを入れても検出は減らない:

| | main | strict のみ | **strict + relaxed（採用）** |
|---|---|---|---|
| `data.patterns` 合計 | 656 | **656** | **636** |
| 変化したケース | — | 8（**減少 0**） | 12（**全て減少**） |

strict のみの 8 ケースの中身は `triple_top` の **confidence 0.80 → 0.79 だけ**で、誤検出はそのまま
残る。**形成中（forming）経路は据え置き**——`levelSpread` が同じ転倒を持つのは既知だが、範囲を分ける。

理由コードに `_relaxed` 接尾辞を付けないのは `validatePatternSize` の扱いと揃えるため
（共有の構造バリデータは経路をまたいで同じコードを返す）。

#### 無音だった 3 点同水準判定を可観測化した（#174 の relaxed 肩落ちと同じクラスの穴）

`findStrictTripleTop:112` / `findStrictTripleBottom:273`（行番号は `main` 時点）の `nearAll` は **`debugCandidates` に何も
積まずに `continue`** していた。新しいゲートの効きを計測する baseline が取れないので、まず
`three_peaks_not_level` / `three_valleys_not_level` を積むようにした（既存の `valleys_not_equal` /
`peaks_not_equal` は**別の 2 点**——ネックライン構成点——を指すので、紛れない名前にしてある）。
`details` に `spreadAbs` / `spreadPct` / `heightAbs` / `heightPct` / `spreadRatio` /
`levelTolerancePct` を載せる（`CandDebugArg` に `details` の写経路が無かったので `pushCand` に追加。
`status` と同じく**渡さなければキー自体を出さない**ので既存出力に対しては純粋に additive）。

**#155 の制約は守っている**——構成点 3 点が揃った後の分岐にだけ積み、`minDist` で落ちる分には積まない。
谷 / 山の探索を同水準判定より前に出したのは棄却エントリに**パターン高さを載せるため**で、
判定順（`three_*_not_level` → `*_missing`）は変えていない。

#### 到達不能だった分岐を除去した

`findStrictTripleBottom` の `valleyNearStrict`（`main` の `:281`）は `nearAll`（`:273`）と**式が完全に同一**で、
`:274` で `!nearAll` が `continue` 済みなので常に `true`。したがって `'valleys_not_equal'` は
**永久に発火しなかった**（main の 800 ケースで実測 **0 件**）。3 谷の非同水準は
`three_valleys_not_level` が受け持つので分岐ごと削除した。`triple_top` 側の `valleys_not_equal`
（谷 2 点）は別物で**到達可能**——同じ 800 ケースでトリム前 16 件（本コーパスではすべて cap で
押し出されるが、生成はされている）。

#### 閾値の決め方（合成 704 + 実データ 96 = 800 ケースの実測）

`spread / height` の分布（オプション軸を畳んだ 100 通り）:

| | n | min | p25 | p50 | p75 | max |
|---|---|---|---|---|---|---|
| strict の `accepted` | 18 | 0.000 | 0.000 | 0.040 | 0.063 | **0.5414** |
| `nearAll` で棄却 | 102 | 0.163 | 0.238 | 0.323 | 0.447 | 0.550 |

**`accepted` 側は 0.063 と 0.5414 の間が完全に空**なので、0.07〜0.54 のどの閾値も同じ結果になる。
起票時の実例（142,233 / 208,000 = **0.684**）はコーパスのどの候補よりも上。閾値 0.5 を採ったのは
`spreadRatio > 0.5` に構造的な意味があるため——top では
`高さ = ばらつき + 最低の山からネックラインまでの押し` なので、**0.5 超は「山の水準帯が、その山から
谷までの押しより厚い」**を意味する。水平なレジスタンスに 3 回当たった形としては読めない。
0.6 にすると本コーパスでは 1 件も落ちない（下の 3 構造がすべて 0.55 未満）。

#### 実測（合成 704 + 実データ 96 = 800 ケース。`main` = e985825 と比較）

合成 704 = fixture 22 件 × オプション 8 通り × 時間足 2 種（`1day` / `1hour`）× `swingDepth` 2 種（2 / 3）、
実データ 96 = `tests/fixtures/btc_jpy_1day_2026.ts` × 時間足 3 種（`1day` / `4hour` / `1hour`）×
`swingDepth` 4 種（既定 / 2 / 3 / 6）× オプション 8 通り。#131 以降と同じ手順・同じ 800 ケース。

| | main | 本変更 |
|---|---|---|
| `data.patterns` 合計 | 656 | **636（−20）** |
| 変化したケース | — | **12 / 800（すべて減少。増加 0 / 追加された検出 0）** |
| 合成 704 | — | **0 / 704**（`data.patterns` も candidates の内訳も完全一致） |
| `accepted` 候補（トリム前） | 2,852 | 2,836（−16） |
| 候補総数（トリム前） | 44,068 | 45,636 |

**減った 20 件は 3 構造**（すべて BTC/JPY 実データ、`swingDepth=2`）。構成点は `price`（終値）:

| 構造 | 時間足 × ケース | 構成点（主） | `spreadAbs` | パターン高さ | `spreadRatio` |
|---|---|---|---|---|---|
| `triple_top` idx 47/53/59 | `4hour` 4 + `1hour` 4 | 10,503,828 / **10,849,999** / 10,451,135 | 398,864（3.68%） | 736,794（6.76%） | **0.5414** |
| `triple_bottom` idx 33/45/49 | `4hour` 4 + `1hour` 4 | **9,743,581** / 10,121,318 / 10,389,396 | 645,815（6.22%） | 1,227,945（11.55%） | **0.5259** |
| `triple_bottom` idx 56/66/77 | `1day` 4 | **10,523,230** / 10,002,960 / 10,044,907 | 520,270（4.94%） | 996,962（9.28%） | **0.5219** |

**なぜ誤検出か（1 件ずつ）。** 3 つとも「同水準であるべき 3 点」がパターン全体の値幅の半分以上に
散っており、水平なレジスタンス / サポートに 3 回当たった形として読めない。

- **`triple_top` 47/53/59**: 中央の山が 3 番目より 3.7% 高く、パターン高さ 6.76% の **54% を
  1 点で使っている**。水平なレジスタンスではなく**頭の突出した H&S 形状**で、
  `neckline_projection` の目標値（`ネックライン − (山の平均 − ネックライン)`）に意味が無い。
  しかも**この検出は #152 / PR #168 が露出させたもの**で、谷2 の押しが 3.449% しかなく
  旧 `MIN_DEPTH_PCT`（5%）なら `valley_too_shallow` で落ちていた。#138 が「#168 が優先度を
  下げていた根拠を外した」と書いた状況の実物。
- **`triple_bottom` 33/45/49**: 3 谷が 9,743,581 → 10,121,318 → 10,389,396 と**単調に切り上がり**、
  1 番目と 3 番目の差がパターン高さの 53%。これは反転の「底」ではなく**上昇の押し目 3 回**で、
  ネックライン（山の平均）から下に投影した目標値も、谷1 の水準を「サポート」と読むことも成立しない。
- **`triple_bottom` 56/66/77**: 1 番目の谷 10,523,230 が他の 2 つ（10,002,960 / 10,044,907）より
  **5.0% 高い**。実質は 2 番目・3 番目で作る `double_bottom` に、そこから 5% 上の押し目を
  無理に 1 点目として足した形。パターン高さ 9.28% の 52% が「谷どうしの差」で埋まっている。

#### `cap = 200` の前後（**cap は上げていない**）

| | main | 本変更 |
|---|---|---|
| cap を超えたケース | 20 / 800 | **32 / 800** |
| 押し出されたエントリ | 972 | 1,588 |

新規に超えた 12 ケースはすべて `real/4hour/sd2`（8）と `real/1hour/sd2`（4）。押し出しが増えた主な
理由コードは `triple_bottom:peaks_missing_relaxed`（72 → 208）/ `triple_bottom:neckline_slope_excess_relaxed`
（80 → 164）/ `triple_top:valleys_missing_relaxed`（88 → 136）/ `triple_top:neckline_slope_excess_relaxed`
（64 → 112）/ `triple_bottom:forming_neckline_not_horizontal`（72 → 104）。**relaxed 系が増えるのは
押し出しだけが原因ではない**——strict が成功しなくなった窓で relaxed の 2 段が最後まで走るため、
候補そのものが増えている（トリム前の候補総数が 44,068 → 45,636）。新しい理由コードのトリム前の内訳は
`three_peaks_not_level` 536 / `three_valleys_not_level` 424 / `valley_spread_vs_height_excess` 88 /
`peak_spread_vs_height_excess` 48。

**cap の引き上げは本 PR では行わない**（判断を仰ぐ対象。#155 / #158 と同じ扱い）。

#### やらなかったこと

- **`tolerancePct` の基準変更 / `getDefaultToleranceForTf` の変更**（#152 で確定）
- **H&S の肩への適用。** 同じ転倒を持つが、#167 で「緩めても増える検出は 0 件」と実測済みで
  **締める方向の変更**になる。triple と影響の向きが違い、増減の帰属が読めなくなるので混ぜない
- **double（`DOUBLE_LEVEL_MAX_PCT`）への適用。** triple の結果を見てから判断する
- **形成中 triple 経路。** `levelSpread` が同じ転倒を持つのは既知だが範囲を分ける
- **サイズ検査の閾値の変更**（#152 / PR #168 で決めた値）

### Fixed（`isFinalRelaxedStage` の docstring が肩の棄却について逆を書いていた。#174 の相乗り）

`detect_hs.ts` の `isFinalRelaxedStage` の docstring 最終文が

> ネックライン水平性は段に依存しないため、落ちる窓の集合は末尾の段が上位集合になる。

と書いていたが、**これはネックラインの棄却についてのみ正しい。肩では集合の向きが逆**——肩の閾値は
末尾の段のほうが緩い（`shoulder: 1.6` → `2.0`）ので、肩で落ちる窓は `×1.6` 段のほうが多く、末尾の段は
**部分集合**になる。結論（末尾の段に寄せても取りこぼしが無い）は肩でも成立するが根拠が違い、
それは同 docstring の前段に既にある（「`×1.6` で落ちて `×2.0` で通る窓は最終的な棄却ではないので
報告すべきでない」）。**コメントのみの変更で挙動は動かない。**

### Fixed（`HS_SHOULDER_MAX_PCT` の docstring の誤りと、relaxed の肩落ちの無音。#174）

**#172 / PR #173 が付けた docstring が relaxed 経路について事実と違っていた。** docstring は
「`detect_hs.ts` の strict / relaxed 両経路は `near(p0, p4)` と `isSameLevel(p0, p4, HS_SHOULDER_MAX_PCT)`
の AND で判定する」と書いていたが、**relaxed は `near()` を呼んでいない**（`detect_hs.ts` の
`findRelaxedHS` / `findRelaxedInverseHS`）:

    const shouldersNearRelaxed =
      Math.abs(p0.price - p4.price) / Math.max(1, Math.max(p0.price, p4.price)) <= tolerancePct * factors.shoulder &&
      isSameLevel(p0.price, p4.price, HS_SHOULDER_MAX_PCT);

`RELAXED_FACTORS` は `{ shoulder: 1.6 }` / `{ shoulder: 2.0 }` の 2 段なので、relaxed の実効閾値は
`min(tolerancePct × factors.shoulder, HS_SHOULDER_MAX_PCT)`。**`×1.6` 段で `1month` 以外の全時間足、
`×2.0` 段では全時間足で `HS_SHOULDER_MAX_PCT` が律速する**——「既定パスで本定数が律速するのは
`15min` / `30min` だけ」は **strict 限定でしか成立しない。**

この式は `M = max(p0.price, p4.price) >= 1` を前提にしている（CodeRabbit 指摘）。relaxed の
インライン比較だけが分母を `Math.max(1, M)` にクランプしており `isSameLevel` は `relDiff`
（分母は素の `M`）なので、`M < 1`（1 円未満の建値）では相対差に対する実効閾値が
`min(tolerancePct × factors.shoulder / M, HS_SHOULDER_MAX_PCT)` になる。**緩むのは許容誤差側だけ**
なので本定数が律速するという結論は変わらない（むしろ強まる）。クランプ自体は本 PR では触っていない。

誤りの向きが悪い。docstring の目的は #152 → #167 の再発防止（＝将来の誤帰属を防ぐこと）なのに、
そのままだと「この定数は既定パスでほぼ効かないから消せる」という**逆向きの誤帰属**を招く。

#### なぜ #172 の実測で見えなかったか

**relaxed は肩で落ちた窓に何も積まずに `continue` していた。** `debugCandidates.push` していたのは
「肩と頭は通ってネックラインだけ落ちた」ケースだけ。したがって #172 が導入した
`shoulders_not_near:{tolerance,cap,both}` は **strict の専有**で、#167 の「`:cap` は全時間足 0 件」
という観測は **relaxed を 1 件も映していない**。この盲点自体は #172 のクローズ時に
「#155 と同じクラスの穴」として別件に送っていたが、診断性の問題ではなく **docstring の誤りを生む
原因**だった。

#### relaxed の肩落ちを積む（#155 / #159、#158 / #166 の先例と同じ形）

| 理由コード | 経路 | 「許容誤差」の実体 |
|---|---|---|
| `shoulders_not_near:{tolerance,cap,both}` | strict | `tolerancePct` |
| `relaxed_shoulders_not_near:{tolerance,cap,both}` | relaxed | `tolerancePct × factors.shoulder` |

- **接頭辞で strict と分ける。** 同じ 5 点が strict でも relaxed でも落ちうるので、混ぜると
  `view=debug` の集計が二重計上になり **#172 で直したばかりの内訳がまた壊れる**。さらに
  `:tolerance` が指す閾値の実体が経路ごとに違うため、同じコードに束ねると「`tolerancePct` を
  緩めれば通る」の意味もズレる。接頭辞は同ファイルの既存 idiom（`forming_`。#158 / PR #166）に揃えた。
  分類そのものは `shouldersNotNearSuffix` で strict と共有する。
- **積むのは `RELAXED_FACTORS` の末尾の段だけ。** ループは「段が外・窓が内」で、`×1.6` 段で全窓を
  走査し何も見つからなければ `×2.0` 段で全窓をもう一度走査する。素朴に両段で積むと (a) エントリが
  窓あたり最大 2 件になり `cap = 200` を倍速で食う、(b) **`×1.6` 段の肩落ちは最終的な棄却ではない**
  （同じ窓が `×2.0` 段で通りうる）のに「棄却」として残る、の 2 つの害がある。段は緩くなる順に走り
  成功で早期 `return` するので、**末尾の段まで到達して落ちた窓**が「relaxed でも救えなかった窓」。
  実測でも効いている（下記の ablation）。
  - トレードオフ: relaxed が成功した呼び出しでは末尾の段に到達せず棄却エントリが 1 件も残らない。
    ただしそのときは `fallback_relaxed` の `accepted: true` が積まれるうえ、**診断が完全になるのは
    relaxed が何も見つけなかったとき**——理由コードを読みたいのはまさにその場合。
- **段（`factors.tag`）は理由コードに含めない。** 末尾の段でしか積まないので常に `x2.0_0.4` になり、
  段ごとの内訳があるかのように読ませてしまう。代わりに `details` に `relaxedShoulderFactor` /
  `relaxedTolerancePct` を足した（`shouldersDiffPct` / `shoulderMaxPct` / `tolerancePct` は strict と同形）。
- **頭で落ちた窓は積んでいない**（#174 以前と同じ）。strict の `head_not_higher` / `head_not_lower` と
  件数が近く、cap を食う割に relaxed 固有の情報が無いため範囲外に置いた。
- **#155 の制約は踏襲した。** 構成点 5 点が揃った後の分岐にだけ積み、交互列 / `minDist` で落ちる分
  （構成点が揃う前）には積まない。

#### 既存の `neckline_not_horizontal` も `relaxed_` 接頭辞に揃えた

relaxed は元から `neckline_not_horizontal` を **strict と同じ名前**で積んでおり、
「`detect_hs.ts` は relaxed も同じ理由コード名を使うので、内訳の行では strict と分離できない」は
issue #168（#152）のエントリに既知として書いてあった。
**新コードだけ `relaxed_` を付けるとファイル内で不統一になる**——`relaxed_` 接頭辞を見た読み手が
「接頭辞なし = strict」と推論するのは自然で、それはネックラインについては偽。この issue が生まれた
誤帰属と同じクラスなので、同じ PR で揃えて `relaxed_neckline_not_horizontal` にした。
末尾の段でだけ積む規則も同じく適用したので、**同じ窓で 2 件出ていた重複が解消される**
（ネックライン水平度は段に依存しないため、`×1.6` で落ちる窓は `×2.0` でも必ず落ちる＝取りこぼしは無い）。

既存テスト（`tests/detect_patterns_fixtures.test.ts` の「IHS: view=debug の data.debug.candidates に
`neckline_not_horizontal` が記録される」）は **strict 由来のエントリを見ている**ので影響しない。

#### 実測（合成 704 + 実データ 96 = 800 ケース）

合成 704 = 価格列 22 系統（H&S / 逆 H&S の右肩掃引 8 段 × 上下、頭の突出不足 2、疑似乱数 4）
× オプション 8 × 時間足 2 × `swingDepth` 2、実データ 96 = `btc_jpy_1day_2026` × 時間足 3 ×
`swingDepth` 4 × オプション 8。

| | before → after |
|---|---|
| `data.patterns` | **0 変化**（800 ケースすべて deep-equal。合計 917 件） |
| candidates 総数 | 82,959 → **83,242**（+283） |
| 追加されたエントリ | **+291**（**全件 `accepted: false`**。`relaxed_shoulders_not_near:both` 186 / `:cap` 105） |
| 消えたエントリ | **8**（**全件 `accepted: false`** かつ全件が cap 到達ケース内） |
| `accepted: true` | 3,297 → **3,297**（変化なし） |
| cap 到達ケース | 86 → **86**（新規 0・解消 0） |

**`cap = 200` は上げていない**（判断を仰ぐ対象）。押し出された 8 件は
`triple_bottom / forming_neckline_not_horizontal` 4 と `triple_top / confidence_below_min_relaxed` 4。
`patterns` で絞れば `candidate-filter` がトリム前に落とすので、該当種別の理由は残る。

**末尾の段に限る対策が効いていること**も同じ corpus で確認した。ゲートを外すと追加が
**+598**（末尾の段のみなら +291）、押し出しが **20 件**（同 8 件）になる。

**`relaxed_shoulders_not_near:cap` が 105 件出た**のが本 issue の核心の裏付け——strict では
`tolerancePct <= 0.05` の格子で構造上 0 件になるコードが、relaxed では既定パスで普通に出る。

#### 律速 ≠ 出力への影響力（訂正後の docstring にも書いた）

relaxed は strict が 1 件も検出しなかったときだけ走るフォールバックなので、律速していても出力を
動かすとは限らない。**本定数だけを振った ablation**（同じ 800 ケース）:

| `HS_SHOULDER_MAX_PCT` | `data.patterns` |
|---|---|
| 0.15 / 0.10 に緩める | **917**（現行と同数。`relaxed_shoulders_not_near:cap` が消えるだけ） |
| **0.05（現行）** | **917** |
| 0.02 に締める | 902 |
| 0.01 に締める | 882 |

**緩めても動かない / 締めると動く**という非対称。#167 の「肩を 5.5% まで緩めて増える検出は 0 件」と
同じ結論で、**「律速している = 重要な定数」と読み替えないこと。**
issue #174 が引用した別セッションの ablation（1,029 ケース、514 → 514 等）は**再現していない**
——corpus が違うので件数は比較できないが、非対称の向きは一致した。

**値は変えていない**（`HS_SHOULDER_MAX_PCT` / `RELAXED_FACTORS` / `getDefaultToleranceForTf` とも据え置き）。

### Fixed（`shoulders_not_near` を conjunct ごとに分けた。#172）

**肩の判定は 2 つのゲートの AND なのに、棄却理由が 1 種類しか無かった。**

    const shouldersNear = near(p0.price, p4.price) && isSameLevel(p0.price, p4.price, HS_SHOULDER_MAX_PCT);

`near` は `|a−b| / max(a,b) <= tolerancePct`（`regression.ts`）、`isSameLevel` は `relDiff` に対する
同じ式（`structural.ts`）で、**同じ指標を 2 つの閾値で測っているだけ**。実効閾値は
`min(tolerancePct, HS_SHOULDER_MAX_PCT)` になる。`details` には `shouldersDiffPct` /
`tolerancePct` / `shoulderMaxPct` が入っているので情報は揃っていたが、
**`reason` で集計すると区別が消えていた。**

#### 実害: 存在しない偽陰性を追って issue が 2 本立った

issue #152 / #167 は「1day で `shoulders_not_near` が 73%」→「`HS_SHOULDER_MAX_PCT` が律速」と帰属した。
実測（#167 のクローズコメント）では **`HS_SHOULDER_MAX_PCT` 律速は全時間足で 0 件**で、
支配的なのは「両方超過」——どちらを緩めても通らない候補だった。境界付近 4 件を目視しても、
肩を 5.5% まで緩めて増える検出は 0 件（頭の突出かネックライン水平度で落ちる）。

`view=debug` は LLM が理由コードで集計する導線（#144 / #145）なので、**同じ誤読を LLM もする。**

#### 3 コードに分けた

接尾辞は同ファイルの既存 idiom（`prior_trend_mismatch:${classification}`）に合わせた。

| コード | 条件 | 緩めれば通るか |
|---|---|---|
| `shoulders_not_near:tolerance` | `tolerancePct` のみ超過 | `tolerancePct` を緩めれば通る |
| `shoulders_not_near:cap` | `HS_SHOULDER_MAX_PCT` のみ超過 | 定数を緩めれば通る |
| `shoulders_not_near:both` | 両方超過 | **どちらを緩めても通らない** |

対象は **strict 2 経路のみ**（`findStrictInverseHS` / `findStrictHS`）。issue 本文は
「relaxed 2 経路は別の理由コードで積んでいる」と書いていたが、**実際には relaxed は肩で
落ちたとき何も積まずに `continue` している**（`debugCandidates.push` するのは「肩と頭は通って
ネックラインだけ落ちた」ケースの `neckline_not_horizontal` だけ）。つまり `shoulders_not_near` は
strict の専有で、**relaxed の肩落ちが無音なのは #155 と同じクラスの診断性の穴**（本変更では
触っていない。別件）。

判定そのものは変えていない。`near(...)` と `isSameLevel(...)` はどちらも副作用の無い純粋比較なので、
短絡評価をやめて 2 つの `const` に分けても結果は不変。

#### 実測: 検出は 1 件も動かず、旧コードの件数は新 3 コードの合計と一致

合成グリッド 1188 ケース（5 点合成の右肩掃引 × `tolerancePct` 7 値 × 6 時間足 × 上下、
および疑似乱数ピボット列 × `includeForming`）で 3,706 件の candidate を採取し、baseline と比較した。

| | baseline | 変更後 |
|---|---|---|
| `data.patterns` 相当（590 件） | — | **完全一致（差分 0）** |
| `debug.candidates` 件数 | 3,706 | 3,706 |
| `accepted:true` / `false` | 1,210 / 2,496 | 1,210 / 2,496 |
| `reason` 以外のフィールド | — | **完全一致（差分 0）** |
| 旧 `shoulders_not_near` | **1,282** | 0 |
| `:tolerance` / `:cap` / `:both` | 0 | **124 / 268 / 890（計 1,282）** |

**旧 1,282 = 新 3 コードの合計**で、分割の取りこぼしは無い。変わったのは `reason` 文字列だけ
（1,282 件ちょうど）。**実データ（BTC/JPY）での再測はこの環境からネットワークが閉じているため
行っていない**——ただし変更は理由文字列の分岐のみで入力データに依存しないため、
合成グリッドで示した不変性がそのまま効く。

`:cap` が上表で 268 件出ているのは `tolerancePct` を 0.06 / 0.08 / 0.12 と明示した格子を
含むため。**`tolerancePct <= HS_SHOULDER_MAX_PCT` の格子（0.03 / 0.04 / 0.05）では `:cap` は
1 件も出ない**——構造上出せない（下記）。

#### `HS_SHOULDER_MAX_PCT` の docstring（`structural.ts`）

`/** H&S / IHS の左右肩同水準の構造上限 */` の 1 行だけでは「肩の許容誤差はこの定数」と読める。
実際には `getDefaultToleranceForTf` の tf-auto 値と `min` を取るので、
**既定パスでこの定数が律速するのは `15min` / `30min`（0.06 > 0.05）だけ**:

| 時間足 | `tolerancePct`（tf-auto） | `HS_SHOULDER_MAX_PCT` | 実効値 | 律速側 |
|---|---|---|---|---|
| `1hour` / `4hour` | 0.05 | 0.05 | 0.05 | 同値 |
| `1day`（他） | 0.04 | 0.05 | **0.04** | **`tolerancePct`** |
| `8hour` / `12hour` | 0.045 | 0.05 | 0.045 | `tolerancePct` |
| `1week` / `1month` | 0.035 / 0.03 | 0.05 | 0.035 / 0.03 | `tolerancePct` |
| **`15min` / `30min`** | **0.06** | 0.05 | **0.05** | **本定数** |

**この定数の役割は「呼び出し側が `tolerancePct` を明示的に緩めすぎたときの天井」。**
`resolveParams` はスキーマ既定値 0.04 のときだけ tf-auto に差し替え、明示値はそのまま通すので、
`tolerancePct: 0.08` を渡して初めて（tf-auto 0.06 の 2 足を除き）効く。

docstring には**もう 1 つの役割**も書いた——`outerShoulderOk`（窓生成）では
`tolerancePct` と AND を取らない単独の閾値として「同水準の肩」を測っている。

`HS_NECKLINE_MAX_PCT` にも対の docstring を付けた。あちらは `tolerancePct` と AND を取らない
**独立した固定閾値**で、schema の `tolerancePct` description が公開している契約でもある。
**同じ 0.05 でも効き方が違う**ので、混同しない書き方にしてある。

#### テストの一致方法を 2 通り使い分けた

- **肩ゲートそのものが主題のテスト**（「両肩が離れすぎ」「`tolerancePct=0.06` でも肩 ±6% なら
  検出しない」）は**接尾辞まで固定**する。どちらの conjunct で落ちたかがそのテストの内容だから。
- **肩の棄却が前置条件でしかないテスト**（relaxed フォールバックの 2 本）は
  **前置一致（`startsWith`）**にする。主題は relaxed 側で、接尾辞を増やしても壊すべきではない。

加えて 3 コードそれぞれの最小ケースと、「接尾辞なしの旧コードが積まれないこと」＋
「`tolerancePct <= HS_SHOULDER_MAX_PCT` では `:cap` が発火しないこと」を掃引で固定した。
`:cap` のテストは `getDefaultToleranceForTf('15min')` / `('30min')` から許容誤差を引いている——
`:cap` は `tolerancePct > HS_SHOULDER_MAX_PCT` のときしか成立せず、tf-auto でそうなるのは
この 2 足だけなので、マジックナンバーではなく tf-auto 表に結び付けた。

### Fixed（dedup の勝者選択を 2 層で揃えた。#142）

**dedup は 2 層あり、同 status 内の優先順が逆になっていた。**

| | `deduplicatePatterns`（検出器内・先に走る） | `globalDedup`（全種別横断・後） |
|---|---|---|
| 対象 | 同一 `type` のみ | `categoryMap` で同カテゴリも |
| 重複閾値 | `> 0.5` | `>= 0.7` |
| 勝者選択（修正前） | statusScore → **`range.end`** → confidence → 高さ | statusScore → **confidence** → `range.end` |

`deduplicatePatterns` は statusScore が並んだ時点で `range.end` の**最大値だけに絞り込む**ため、
そこで 1 件に決まると **confidence が一度も比較されない**。広い窓ほど終端が新しくなりやすいので、
**同じ値動きに対して最も当てはまりの悪い解釈が代表として選ばれる**。

#### #142 が報告した実例は #141 で消えている

issue は BTC/JPY 日足で「confidence 0.82 / r2 0.602・0.648 / 外れ値除去 6 + 12 = 18 点の
候補（idx 0〜81）が 0.91 / 0.88 / 0.85 を押し出す」と報告していたが、**#141 / PR #143 の
除去率上限がこの候補自体を棄却する**ようになったため、現在の `main` では再現しない
（`excessive_outlier_removal` / `lowerRemovalRate 0.632 > 0.5`。棄却側は
`tests/patterns/outlier-cap-btcjpy.test.ts` が固定済み）。

**issue の原因分析（「`globalDedup` の飲み込みの連鎖」）は誤りだった。**
`maxOutlierRemovalRate` だけを ablate（0.5 → 1.0）して #141 以前の状態を作ると実例が再現し、
押し出していたのは `deduplicatePatterns` であることが確認できる——3 候補は**すべて同一 `type`**
（`triangle_symmetrical`）なので、同カテゴリを束ねる `globalDedup` に届く前に決着していた。

    winner : triangle_symmetrical 0.82  2026-05-29→08-19  (idx [0,82])
    dropped: triangle_symmetrical 0.87  2026-07-28→08-18
             triangle_symmetrical 0.91  2026-06-08→07-14

#### 実例は消えたが機構は生きている

現行 `main`（ablation なし）で 800 ケースを走らせ、`range.end` の絞り込みが**厳密に
confidence の高い候補**を消す瞬間を計測すると **96 発火 / 6 実体**。最悪例は同じ fixture の
`rising_wedge` で、**0.95 が 0.82 に負けていた**。

#### 決定（案 D）

`deduplicatePatterns` の `range.end` と confidence を入れ替え、`globalDedup` と同じ
**statusScore → confidence → `range.end` → 高さ**にした。

- **`statusScore` 最優先の構造は触っていない。** 入れ替えは statusScore の**下**なので、
  #133 / PR #135 の不変条件（形成中が完成済みを押し出さない）は構造上通らない。
  `helpers.test.ts` に「形成中は confidence 1.0 でも完成済みに勝てない」を明示的に足した。
- **`range.end` 最優先に根拠は無かった。** 初期インポート（`0b726e1`）由来で、PR #135 は
  「『より新しい形を採る』は同 status 内に限定して**残す**」と書いており statusScore を
  上に挿しただけ。#135 の docstring が挙げる根拠（形成中は `range.end` が常に最新足）は
  **statusScore を `range.end` より前に置く根拠**であって、`range.end` を confidence より
  前に置く根拠ではない。
- **`overlapRatio` の分母（min duration）は変更していない**（案 B）。飲み込むこと自体は
  重複報告の抑止として正しく、問題は「飲み込んだあとどちらを残すか」なので勝者選択で直る。
  分母を変えると 2 層 × 全種別の挙動が動き blast radius が桁違いになる。
- **`globalDedup` の逐次置換のクラスタリング化（案 C）も見送った。** 案 D で実例が直り、
  順序依存が実際に出力を変える例が現行コーパスに無いため。必要になれば別 PR。
- **品質指標の追加（案 A）は不要だった。** 種別ごとに指標が違う（三角形の `r2` は double に
  無い）ため共通指標への正規化という新しい設計が要るが、優先順の不整合が原因だったので
  そこまで要らない。

#### 影響（800 ケース比較）

`tests/detect_patterns_fixtures.test.ts` の **fixture 22 件 × オプション 8 通り × 時間足 2 種
× `swingDepth` 2 種 = 704 ケース**と、`tests/fixtures/btc_jpy_1day_2026.ts` の
**時間足 3 種 × `swingDepth` 4 種 × オプション 8 通り = 96 ケース**を前後で突き合わせた
（#131 以降と同じ手順・同じ 800 ケース）。

| 指標 | before → after |
|---|---|
| `data.patterns` が変わったケース | **48 / 800**（合成 16 / 実データ 32） |
| 差分の実体 | **4 件**（残りは時間足 × オプション × `swingDepth` の複製） |
| パターン総数 | 640 → **656**（+16。すべて下記 1 実体の複製） |
| `accepted` 候補 / 候補総数 | 2,852 / 42,856 → **不変**（検出ロジックは触っていない） |

##### 変化した 4 実体（before → after の対）

いずれも**同一 `type`・同一 `status`** 内での入れ替えで、statusScore は一度も跨いでいない。

| # | ケース | 種別 / status | before | after | 複製数 |
|---|---|---|---|---|---|
| 1 | 実データ `1day` | `rising_wedge` / completed | （出力に無し） | **0.95** 06-23→07-13 | 16 |
| 2 | 実データ `1hour` | `triangle_symmetrical` / completed | 0.86 07-28→08-16 | **0.87** 07-26→08-14 | 16 |
| 3 | 合成 `1day` | `triangle_ascending` / forming | 0.77 01-10→02-01 | **0.78** 01-07→01-29 | 8 |
| 4 | 合成 `1hour` | `triangle_ascending` / forming | 0.73 01-15→02-01 | **0.79** 01-05→01-29 | 8 |

**2 / 3 / 4 は 1 対 1 の置換**（より当てはまりの良い候補に差し替わっただけ。件数は変わらない）。

**1 だけが純増（+1 件 × 16 ケース = +16）で、2 段目の影響を含む。** 修正前は
`deduplicatePatterns` が広い `rising_wedge` 0.82（06-18→08-20、63 日）を代表に選び、
それが後段 `globalDedup` で `falling_wedge`（07-08→08-17）と**重なり率 1.00** で衝突して
**丸ごと消えていた**（`categoryMap` で両者は同カテゴリ `wedge`）。狭い 0.95（20 日）が
代表になると `falling_wedge` との重なり率は **0.25** で閾値 0.70 に届かないため、
**2 つの別々の構造として両方残る**。

**これが #142 の言う「飲み込みの連鎖」の実体**だが、**連鎖の起点は `globalDedup` ではなく
検出器内 dedup の誤った代表選択**だった。低品質な広い窓が代表に選ばれた結果、本来無関係な
別種別と衝突して**正しいウェッジが出力から完全に失われていた**。

#### テスト

- `tests/patterns/dedup-confidence-priority-btcjpy.test.ts`（新規）— 実データで実体 1 / 2 と
  #133 の不変条件を固定。**4 アサーションすべてが旧順序で落ちることを確認済み**。
- `tests/patterns/helpers.test.ts` — 「同 status どうしでは**従来どおり** `range.end` が
  新しいほうが勝つ」を反転した。このテストは PR #135 が追加した継承挙動の characterization
  であって設計不変条件ではない（#135 自身が #133 のテストを反転したのと同じ形）。
  confidence 同点なら `range.end` が効くことと、形成中が完成済みに勝てないことも足した。

### Fixed（形成中 double のサイズ検査を完成済みと揃えた。#169 / PR #170）

**反転パターンの形成中パスのうち、double の 2 経路だけがサイズ検査を持っていなかった / 中途半端だった。** triple / H&S の形成中パスは #139 で完成済みと同じ `validatePatternSize`（高さ + 深さ）を通るようになっていたが、double の形成中 2 経路はローカル実装のまま取り残されていた。

| 経路 | 高さ（`heightPct`） | 深さ（`depthPct`） |
|---|---|---|
| 完成済み double top / bottom（`validateTopSize` / `validateBottomSize`） | ✅ | ✅ |
| 完成済み・形成中 triple / H&S（`validatePatternSize`） | ✅ | ✅ |
| 形成中 double bottom（修正前） | ✅（両脚それぞれ） | **なし** |
| **形成中 double top（修正前）** | **なし** | **なし** |

形成中 double top は**下限が 1 つも無く、どんな微細な揺れでも `double_top` を出していた**——押しが 0.5% しかない形が整合度 0.99 で報告される。形成中 double bottom は `heightPct` 以上 `depthPct` 未満の帯（1day なら 3〜5%）が「形成中は通るのに完成した瞬間に `peak_too_shallow` で落ちる」候補になっていた。

#### 決定

- **形成中 double top**: 完成済みと同じ `validateTopSize` を、同じ 3 点構造に掛ける。3 点目（暫定の山2）は確定ピボットではないので `{ extremePrice: 最新足の終値 }` を渡す——triple / H&S の形成中パスと同じ idiom。`validateTopSize` / `validateBottomSize` の引数型は `Pivot` から `Pick<Pivot, 'extremePrice'>` へ緩めた（`validatePatternSize` と同じ形）。
- **形成中 double bottom**: 現行の**両脚**の高さチェック（`forming_pattern_height_below_min`）は残したうえで、完成済みと同じ `validateBottomSize` を足した。単純に置き換えると `validateBottomSize` の高さが `|谷1 − 山| / max(…)` ＝ **左脚しか見ない**ため、**右脚の要求が消える**（片方で緩み、片方で締まる）。両脚チェックを残すと `validateBottomSize` の高さは両脚チェックに包含されるので、実際に発火しうるのは `peak_too_shallow` だけになり、**形成中 ⊇ 完成済みの厳しさ**が成立する。
- **理由コードは `forming_` 接頭辞付きの新規コード**（`forming_pattern_too_small` / `forming_valley_too_shallow` / `forming_peak_too_shallow`）。完成済みと同名にすると `view=debug` の候補一覧でどちらの経路で落ちたか読めなくなる。既存の `forming_pattern_height_below_min`（#166 のテストが名前を固定している）は**改名していない**。
- **配置は各経路の既存の棄却検査をすべて通過した後**（`validatePatternSize` の docstring の規約）。前に置くと固有の理由コードを持つ候補の `reason` を横取りする。
- **`FORMING_TOLERANCE_MULTIPLIER = 1.5`（水準一致判定の緩和）は変更していない。** 「形成中は早期警告なので緩くてよい」は意図的な設計で、緩めてよいのは「同水準か」の判定であって「そもそも形と呼べる大きさか」ではない。

#### 影響

- **回帰コーパス（合成 704 + 実データ 96 = 800 ケース）は 0 / 800 変化。** `data.patterns` / 候補内訳ともに完全一致（パターン合計 640 → 640、`accepted` 候補 2,852 → 2,852、候補総数 42,856 → 42,856）。**増える方向の変化も 0 件**（下限を足すだけなので単調に減るか不変）。
- **現行コーパスがこの分岐を踏んでいない**ことが計測で確認できた。形成中 double bottom は新しい深さ検査に 104 回到達するがすべて通過し、**形成中 double top は 368 回呼ばれてサイズ検査の位置に一度も到達しない**（全件がそれより手前の `forming_no_valley_after_peak` / `forming_peak_level_out_of_tolerance` / `forming_peaks_not_level` / `forming_bars_out_of_range` で落ちている）。減る実例は `tests/patterns/size-gates-forming-doubles.test.ts` の専用 fixture が担保する。
- `view=debug` の候補一覧に新しい理由コードが 3 つ増える。

### Changed（サイズ検査の下限を時間足別にした。#152 / PR #168）

**`MIN_DEPTH_PCT` / `MIN_PATTERN_HEIGHT_PCT` が時間足に依らない固定パーセンテージで、ボラティリティに対する難易度が時間足間で揃っていなかった。** ATR で正規化すると BTC/JPY で `MIN_DEPTH_PCT = 5%` は 1day の 1.82 ATR に対し 1hour では **8.77 ATR**、`MIN_PATTERN_HEIGHT_PCT = 3%` は 1.09 ATR に対し **5.26 ATR**。結果として **1hour では H&S が実質的に検出不能**（`limit=365` / `headProminencePct=0.01` でも 0 件）で、棄却理由の 39% がサイズ検査だった。

#### 決定

- **`getSizeThresholdsForTf(tf)`（`tools/patterns/config.ts`）を追加し、`getDefaultToleranceForTf` と同型の静的テーブルにした。** 実行時に ATR へ連動させない——閾値が実データ（＝`limit`）の関数になると #154 の「窓を広げたのに検出が減る」を再導入する（#154 / PR #156 の結論）。**値の導出にだけ ATR を使い、テーブルは凍結する。**
- **アンカーは 1day。現行値（3% / 5%）を据え置き、下位時間足のみ緩める。** 両定数とも下限なので変化は単調で、`tests/fixtures/btc_jpy_1day_2026.ts` の 1day の期待値は 1 件も動かない。
- **2 つを同時に変えた。** 深さだけを 1.82 ATR に揃えても高さが 5.26 ATR のまま（1day の 1.09 ATR より 5 倍厳しい）なので、棄却が `valley_too_shallow` から `pattern_too_small` に**移るだけ**になる。
- **種別ごとには分けない。** #139 が意図的に共通化した経緯（値が割れていたせいで BTC/JPY 1時間足の高さ 1.66% のレンジ往復が `triple_top` と `triple_bottom` に同時に化けた）を巻き戻さない。共有は維持したまま時間足依存にした。
- **`MIN_DEPTH_PCT` / `MIN_PATTERN_HEIGHT_PCT` は削除せず残した。** テーブルの 1day 値（＝アンカーであり、1week / 1month / 未知の時間足のフォールバック）としてそのまま使う。docstring に「時間足別の値は `getSizeThresholdsForTf`。本定数は 1day 相当の基準値」と明記した。

#### 導出テーブルと ATR 比

1day を 1.0 とした ATR 比を 3% / 5% に掛ける。**`4hour` は実測ではない**——BTC/JPY の 4hour ATR は測っておらず、1day の 2.75% から √t で `2.75 / √6 = 1.12%` と推定した値（比 `1/√6 = 0.4082`）を使っている。`1hour` の 0.57% は #152 の実測で、√t 整合も取れている（`0.57 × √24 = 2.79 ≈ 2.75`）。

| 時間足 | ATR 比（1day = 1.0） | 由来 | `heightPct` | `depthPct` |
|---|---|---|---|---|
| `1min` | 0.0264 | √t 推定 | 0.08% | 0.13% |
| `5min` | 0.0589 | √t 推定 | 0.18% | 0.29% |
| `15min` | 0.1021 | √t 推定 | 0.31% | 0.51% |
| `30min` | 0.1443 | √t 推定 | 0.43% | 0.72% |
| `1hour` | 0.2073 | **実測**（ATR 0.57% / 2.75%） | **0.62%** | **1.04%** |
| `4hour` | 0.4082 | **√t 推定（未実測）** | **1.22%** | **2.04%** |
| `8hour` | 0.5774 | √t 推定 | 1.73% | 2.89% |
| `12hour` | 0.7071 | √t 推定 | 2.12% | 3.54% |
| `1day` | 1.0 | **実測（アンカー）** | **3%（据え置き）** | **5%（据え置き）** |
| `1week` / `1month` / 未知 | — | 据え置き | 3% | 5% |

**`1day` 以上を据え置いたのは、√t を当てると締まる方向になるから。** 1week / 1month はボラが 1day より大きいので比が 1 を超え、「緩める方向のみ」という本変更の前提（＝検出が単調に増えるか不変）に反する。逆に **`1hour` 未満は据え置かずに √t で導出した**——据え置くとこれらの時間足には #152 の欠陥がそのまま残る（1hour より短い足は ATR 比がさらに小さいので、5% はより極端に厳しい）。テーブルの単調性（短い足ほど緩く、1day を上回る値が無いこと）と、height / depth が同じ ATR 比から出ていることは `tests/patterns/config.test.ts` が機械的に固定する。

#### 配線

`validatePatternSize`（`tools/patterns/structural.ts`）は純粋関数でモジュール定数を直接読んでおり `tf` を知らないので、**閾値を引数で受ける形にシグネチャを変えた**。`structural.ts` に `DetectContext` は持ち込まない（ファイル冒頭が「本ファイルは純粋関数のみ」と宣言している）。解決は `tf` を知っている `detect_patterns.ts` で **1 回だけ**行い、`DetectContext.sizeThresholds` に載せて各検出器へ配る。

- `validatePatternSize` の call site **12 箇所**（`detect_hs.ts` 6 / `detect_triples.ts` 6）
- `detect_doubles.ts` は `validatePatternSize` を使わずローカル関数を持つので個別に配線した: `validateTopSize` / `validateBottomSize`（引数追加。relaxed パスは `ctx` を持たないので `findRelaxedDoubleTop` / `findRelaxedDoubleBottom` にも引数を足した）、形成中ダブルボトムの深さ検査（`ctx.sizeThresholds.heightPct`）
- `detect_doubles.ts` の `validateTopSize` の docstring（実在するダブルボトムが終値基準では 1.85% / 1.67% で 2 定数を割る、という #139 の経緯）は **1day の実例であることを明記して更新**した。閾値が緩い下位時間足では同じ数値でも通るが、**基準を `extremePrice` にする理由は閾値と独立**（値幅を終値で測ると実際の 1/3 に見える歪みは閾値をいくつにしても残る）。

#### 実測（800 ケース比較）

`tests/detect_patterns_fixtures.test.ts` の **fixture 22 件 × オプション 8 通り × 時間足 2 種（`1day` / `1hour`）× `swingDepth` 2 種（2 / 3）= 704 ケース**と、`tests/fixtures/btc_jpy_1day_2026.ts` の **時間足 3 種（`1day` / `4hour` / `1hour`）× `swingDepth` 4 種（既定 / 2 / 3 / 6）× オプション 8 通り = 96 ケース**を、`main`（8051572）と本ブランチの双方で走らせて突き合わせた（#131 以降と同じ手順・同じ 800 ケース）。

| 指標 | before → after |
|---|---|
| `data.patterns` が変わったケース | **8 / 800**。**すべて増加。減少 0 / 消えた検出 0** |
| 合成 704 | **0 / 704**（`data.patterns` も candidates の内訳も完全一致） |
| 実データ 96 | `data.patterns` 8 件（`4hour`/`sd2` 4 + `1hour`/`sd2` 4）、candidates 32 件 |
| **`1day` の実データ 32 ケース** | **0 変化**（アンカーを据え置いた設計どおり） |
| パターン合計 | 632 → **640**（+8） |
| `accepted` 候補 | 2,836 → **2,852**（+16） |
| 候補総数 | 42,972 → 42,856 |

**増えた検出は 1 実体だけ**（8 ケースはその 1 件が 2 時間足 × 4 オプションで現れたもの）。

| | 値 |
|---|---|
| 種別 / 整合度 / status | `triple_top` / 0.80 / `completed` |
| 期間 | 2026-07-15 → 2026-07-31（ブレイク 7/31） |
| 構成点（`extremePrice`） | 山1 10,628,945（7/15）/ 谷1 10,166,206（7/17）/ 山2 10,903,000（7/21）/ 谷2 10,452,690（7/24）/ 山3 10,749,208（7/27） |

**なぜそれが正しい検出か**（#139 のサイズ検査と #140 の構造ゲートを実測値で通過確認）:

| 検査 | 実測値 | 判定 |
|---|---|---|
| パターン高さ（#139） | **6.758%** | 1hour 0.62% / 4hour 1.22% を大きく超える（1day の 3% すら超える） |
| 谷1 の押し（#139） | **5.571%** | 1hour 1.04% / 4hour 2.04% を超える（1day の 5% も超える） |
| 谷2 の押し（#139） | **3.449%** | 1hour / 4hour は通る。**1day の 5% を割るのがブロッカーだった唯一の項目** |
| 戻り率（#140） | **0.8007** | band 0.2〜0.9 の内側 |
| 先行極値（#140） | idx 45（2026-07-13, 10,051,036） | 取得済み（`no_prior_extreme` でスキップしていない） |
| ネックライン交差（#140） | idx 16 | 第1構成点より前にネックライン 10,456,313 の終値下抜けが存在する |
| ブレイク | idx 63（7/31）終値 9,918,187 でネックライン下抜け | `breakoutDirection: down` / `outcome: success` |

**ブロッカーは「谷2 の押しが 3.449% で 5% に届かない」の 1 点だけで、他は全部通っていた。** 三山（10.63M / 10.90M / 10.75M）と二谷（10.17M / 10.45M）が揃い、ネックラインを下抜けて完成しているトリプルトップで、押しが 3.4% しかないことだけを理由に落ちていた。1day の閾値のままなら今も落ちる（`validatePatternSize` に 1day の値を渡すと `valley_too_shallow` を返す）——アンカーは動かしていない。

#### `pattern_too_small` への移動が起きていないこと

800 ケース合計のサイズ検査由来の理由コード:

| 理由 | before | after | 差 |
|---|---|---|---|
| `pattern_too_small` | 32 | **0** | **−32** |
| `valley_too_shallow` | 76 | 4 | −72 |
| `peak_too_shallow` | 4 | 4 | ±0 |
| `forming_pattern_height_below_min` | 8 | **0** | −8 |

**`pattern_too_small` は増えるどころか 0 になった。** 高さと深さを同じ ATR 比で同時に下げたので、深さで通った候補が高さで落ちる経路が残っていない。解放された候補の移り先は件数がそのまま一致する:

- `double_bottom:pattern_too_small` −32 → `double_bottom:valleys_not_equal_structural` +32
- `double_bottom:forming_pattern_height_below_min` −8 → `double_bottom:forming_valleys_not_level` +8
- `double_top:valley_too_shallow` −40 → `double_top:peaks_not_equal_structural` +16 / `double_top:reclassified_as_triple_top` +24
- `triple_top:valley_too_shallow` −32 → `triple_top:ACCEPTED` +16 ほか。`triple_top:*_relaxed` が −56 / −56 / −16 と減っているのは **strict パスが見つかると relaxed フォールバックを走らせない**ためで、棄却が増えたのではない

#### 1hour の棄却理由内訳（合成 1hour × 5 seed）

**issue #152 本文の再現手順（bitbank public API から `1hour` を実取得）は、本実行環境が `public.bitbank.cc` への外向き接続をネットワークポリシーで塞いでいるため実行できなかった。** 代わりに **BTC/JPY 1hour の実測 ATR 0.57% に合わせた決定論的な合成系列**（LCG seed 固定・200 本・5 系統、実現 ATR 0.536〜0.593%）で、同じ呼び出し（H&S + 逆 H&S、`headProminencePct=0.01`、`includeInvalid`、`view=debug`）を前後で走らせた。候補数は 60〜130 で `cap = 200` に届いていないので内訳は censored されていない。

| seed | 実現 ATR | before 検出 | after 検出 |
|---|---|---|---|
| 1 | 0.579% | **0** | 2 |
| 7 | 0.536% | **0** | 2 |
| 42 | 0.554% | **0** | 1 |
| 1234 | 0.587% | **0** | 2 |
| 99991 | 0.593% | **0** | 2 |

**before は 5 系統すべてで 0 件**——issue #152 が報告した「1hour では H&S が実質的に検出不能」がそのまま再現する。after は 1〜2 件。理由コードの内訳（5 seed 合計）:

| 理由 | before | after | 差 |
|---|---|---|---|
| `head_not_higher` | 128 | 128 | ±0 |
| `valley_too_shallow` | 127 | **0** | −127 |
| `head_not_lower` | 119 | 119 | ±0 |
| `ACCEPTED` | 43 | 104 | +61 |
| `neckline_below_pre_decline_low` | 0 | 54 | +54 |
| `shoulders_not_near` | 36 | 36 | ±0 |
| `peak_too_shallow` | 28 | 1 | −27 |
| `retracement_out_of_band` | 0 | 18 | +18 |
| `head_not_extreme_in_span` | 16 | 16 | ±0 |
| `neckline_above_pre_decline_high` | 0 | 9 | +9 |
| `pattern_too_small` | 9 | **0** | −9 |
| `no_neckline_cross_before_trough1` | 0 | 6 | +6 |
| `formation_bars_out_of_range` | 3 | 3 | ±0 |
| `prior_trend_mismatch:up` | 1 | 1 | ±0 |

**`pattern_too_small` は 9 → 0 で、移動先になっていない。** 加えて **サイズ検査以外の既存ゲートが 1 つも動いていない**（`head_not_higher` / `head_not_lower` / `shoulders_not_near` / `head_not_extreme_in_span` / `formation_bars_out_of_range` / `prior_trend_mismatch` がすべて ±0）ことが、変更がサイズ検査だけに閉じていることの裏取りになる。解放された 163 件のうち 148 件の行き先は `ACCEPTED` +61 と **#140 の構造ゲート**（`neckline_below_pre_decline_low` +54 / `retracement_out_of_band` +18 / `neckline_above_pre_decline_high` +9 / `no_neckline_cross_before_trough1` +6）で、「緩めた分の品質保証は #140 が担う」という #152 の設計どおりに動いている。残る 15 件は候補総数そのものの減少（510 → 495）で、**strict パスが成立すると relaxed フォールバック（`findRelaxedHS` / `findRelaxedInverseHS`）を走らせない**ため relaxed が積んでいた棄却エントリが消える分（`detect_hs.ts` は relaxed も同じ理由コード名を使うので、内訳の行では strict と分離できない）。

#### #139 の形（1hour の 1.66% レンジ往復）が戻るか

**戻らない。** `tests/patterns/size-gates-triple-hs.test.ts` の高さ 1.533% のレンジ往復を 1hour で走らせると、**サイズ検査は通る**（1hour の下限の 2.5 倍 / 1.47 倍。実測 ATR 0.57% で読むと 2.69 ATR）が、`triple_bottom` は **0 件**のままで #140 の構造ゲートが `retracement_out_of_band`（レンジの往復は戻り率がちょうど 1.0）で落とす。**#139 の芯は「1 本のレンジが `triple_top` と `triple_bottom` の両方に化ける」という構造的矛盾**のほうで、そこは #140 が担保している。

`triple_top` 側は 1 件残るが、これは**スキャン窓の左端の窓**で、構造ゲートが先行極値を取れずスキップする仕様（`no_prior_extreme`）による。先行極値が取れる 2 つ目以降の窓は top 側も同じ `retracement_out_of_band` で落ちている。左端の窓が構造ゲートを通らないのは #140 の既存の性質で、本 PR で変わっていない。

テストは **1day（アンカー。閾値据え置き）でサイズ検査そのものの回帰を見る it** と、**1hour で「サイズは通るが同時検出にはならない」を固定する it** の 2 本に分けた。

#### やらなかったこと

- **肩の対称性**（`HS_SHOULDER_MAX_PCT` / `tolerancePct` / `shoulderTolerancePct`）→ #167 に分離。肩許容は**上限**パラメータで極性が逆（ATR 本数を揃えると 1hour は緩むのではなく締まる。実測で全体 −164 件）
- **`getDefaultToleranceForTf` の変更** → ATR 導出値の実測で 6 種別 −164 件。加えて `headProminencePct` の既定値が同じ表から来ていて向きが逆なので、1 つの値を動かすと 2 つの軸が反対方向に動く。`src/schema/patterns.ts:112` の description が表の値をリテラル公開しており MCP 公開契約の変更にもなる
- **実行時の ATR 連動**（#154 / PR #156 の結論）
- **`MIN_DEPTH_PCT` の種別ごと分割**（#139 の共通化を巻き戻す）
- **1day の値の変更**

### Changed（`detect_patterns` の `view=debug` の配線 4 件。**`data.patterns` は 4 件とも 1 件も変わらない**。#155 / #158 / #160 / #162）

**4 件とも「検出器が持っている情報が `view=debug` の出力まで届いていない」配線の修正で、検出結果は動いていない。** 見出しは 1 本にまとめてあるが、各 PR の却下案と実測は下に残す（要約すると根拠が落ちるため。本セクション冒頭「読む順」の方針）。

#### 形成中 H&S / 逆 H&S の成功候補を `debug.candidates` に積む（#155 / PR #159）

- **`accepted: true` は `globalDedup` の前に積む。** `tryFormingHS` は #154 以降すべての頭候補を試して複数返し、`globalDedup` は後段の `detect_patterns.ts` で走るので、**積んだ候補が `data.patterns` に出ないことがある**。strict パス（`push(patterns, …)` の直後に積む）と同じ既存の規約で、変えていない。`accepted: true` は「検出器が組み立てた」であって「最終出力に残った」ではない。
- 構成点は **4 点**（左肩 / 頭 / 頭後の谷 / 右肩）で strict の 5 点と違うため role を分けた。頭後の谷は `post_head_valley`（逆 H&S は `post_head_peak`。strict の `valley1` / `valley2` と混同させない専用 role）、暫定右肩（`isProvisional`。確定ピボットではなく最新足の終値）は `right_shoulder_provisional`。`preHeadValley` が取れているときは `pre_head_valley` を `points` にだけ足す（`indices` は 4 点のまま——同じ関数の既存の棄却エントリと並びを揃えるため）。
- **理由コードは構成点 4 点が揃った後の分岐にだけ足した**（`head_not_extreme_in_span` / `completion_below_min` / `formation_bars_out_of_range`）。**左肩なし / 頭後の谷なし / 右肩なしの 3 分岐は見送った**——`formingHsForHead` は頭候補ごとに呼ばれるので、この 3 分岐は「まだ形が無い」段階で頭候補の数だけ発火し（`1hour` × `limit=365` × `swingDepth=3` で H&S + 逆 H&S 合わせて 100 件級）、`detect_patterns.ts` の `cap = 200` を食い潰して**他の検出器の棄却理由を押し出す**。積むなら「頭候補ごとではなく 1 回だけ集約する」形が要る。理由は関数の docstring にも書いた。
- **`completion_below_min` は現行定数では到達しない。** `completion = min(1, (0.75 + 0.25 × progress) × (暫定右肩なら 0.9))` で `progress ∈ [0, 1]` なので最小値は `0.75 × 0.9 = 0.675` > `FORMING_MIN_COMPLETION = 0.4`（実測でも 800 ケースで発火 0）。理由コードは足したうえで到達不能である旨とその算術を `FORMING_MIN_COMPLETION` の docstring に明記し、**テストは fixture ではなく算術境界を固定した**（重み 0.75 / 0.25 / 0.9 を触って下限が 0.4 を割り込んだら落ちる）。cap を食わないので分岐自体は残してある。
- **`CandDebugEntry.status` が出力スキーマ（`src/schema/patterns.ts`）の candidates に無く Zod に strip されていた**のを解消した（随伴変更。積んでも出力に出ないままでは `status: 'forming'` を足す意味が無い）。副作用で `detect_wedges` が前から top-level に積んでいた `status` も届くようになる（800 ケース中 **464 エントリ**が新たに `status` を持つ。消えるフィールド・変わる値は無い）。`breakoutDirection` が同じ理由で strip されている件は**報告のみ**とし、#160 に送った。
- **double / triple の形成中パスにも同じ穴がある**が、本エントリは H&S 2 経路に閉じ **#158 に分離**した。
- **実測**（合成 704 ケース = fixture 22 × オプション 8 × 時間足 2 × `swingDepth` 2、実データ 96 ケース = `btc_jpy_1day_2026` × 時間足 3 × `swingDepth` 4 × オプション 8。計 **800**）:

  | | before → after |
  |---|---|
  | `data.patterns` | **0 変化**（800 ケースすべて deep-equal） |
  | candidates 総数 | 42,040 → **42,276**（+236） |
  | `accepted: true` | 2,700 → **2,748**（+48 = 形成中 H&S 12 + 逆 H&S 36。検出されている件数とちょうど一致） |
  | cap 到達ケース | 36 → **36**（新規 0・解消 0。もともと before の時点で 200 に達していた実データ側） |

  320 件積まれて 84 件が cap で押し出され差し引き +236。**押し出された 84 件はすべて `accepted: false`**。`cap = 200` は上げていない（判断を仰ぐ対象なので勝手に触らない）。`patterns` で絞れば `candidate-filter` がトリム前に落とすので、該当種別の理由は残る。

#### 形成中 double / triple の成功候補を `debug.candidates` に積む（#158 / PR #166）

**#155（形成中 H&S / 逆 H&S）の 4 経路への横展開**（`tryFormingDoubleTop` / `tryFormingDoubleBottom` / `tryFormingTripleTop` / `tryFormingTripleBottom`）。判断の大半は #155 のものをそのまま適用したので、ここには**#155 と事情が違った 3 点**だけを書く。

- **`pushCand` が `status` を落としていた**（`tools/patterns/types.ts`）。`CandDebugEntry` には `status` があるのに `CandDebugArg` に無く、写経路が無かった。`detect_triples` は 4 経路とも `pcand`（= `pushCand`）しか使っておらず、これを直さないと `status: 'forming'` を積めない。**`CandDebugArg` に `status?: string` を足し、渡されたときだけキーを出す**（`...(arg.status !== undefined ? { status } : {})`）。`status: undefined` を常に置くと deep-equal 比較が壊れるため spread にしてある。**#158 以前の呼び出し元は 1 つもこれを渡していない**ので追加は純粋に additive で、`types.ts` の変更だけを適用した 800 ケースの出力は main と **byte 単位で同一**（8,204,452 バイト）であることを実測した。`details` は今回使わないので足していない。**`detect_doubles` の形成中 2 経路は元から `ctx.debugCandidates.push` を直接呼んでいる**が、**本 PR が新たに積むエントリだけ** `pushCand` を使った（`isoTime` の埋め方を手書きで増やさないため）。**既存の直呼び 7 箇所（先行トレンド / 構造ゲート / reclassify）はそのまま**——出力が動かないことを保証するのが優先で、ファイル全体の API 統一は本 PR の範囲外（CodeRabbit 指摘を受けて記述を実態に合わせた）。
- **`tryFormingDoubleTop` には #155 の cap 制約を適用しなかった。** #155 が「構成点が揃った後の分岐にだけ理由コードを積む」としたのは `formingHsForHead` が**頭候補ごとに呼ばれる**ためで、`tryFormingDoubleTop` は `lastConfirmedPeak` を 1 点取って直線的にガードを並べる**ループの無い**関数なので、1 回の呼び出しで各分岐はたかだか 1 回しか発火しない。**7 つの `return null` すべてに理由コードを足した**（`forming_no_confirmed_peak` / `forming_no_valley_after_peak` / `forming_peak_level_out_of_tolerance` / `forming_peaks_not_level` / `forming_current_at_or_below_valley` / `forming_completion_below_min` / `forming_bars_out_of_range`）。**この経路は #158 以前は完全に無音**で、なぜ形成中ダブルトップが出ないのかが debug から追えなかった。関数先頭の want / ピボット総数ガードだけは「この種別が要求されていない」であって候補の棄却ではないので積んでいない。
- **残り 3 経路（すべてループ）は #155 と同じ制約を適用した。** 構成点が揃った後の分岐にだけ積み、揃う前の `continue` には積んでいない。積んだのは `tryFormingDoubleBottom` が 5 件（`forming_pattern_height_below_min` / `forming_valleys_not_level` / `forming_current_below_valley_zone` / `forming_completion_below_min` / `forming_bars_out_of_range`。**見送りは** 谷ペアの `minDist` 不足と「間に山が無い」の 2 分岐）、triple 2 経路が各 2 件（`forming_bars_out_of_range` と `forming_completion_below_min` / `forming_confidence_below_min`。**見送りは** `minDist` 不足 / `peakDiff`（`valleyDiff`）超過 / `currentDiff` 超過）。

そのほか #155 から引き継いだ点:

- **`accepted: true` の意味は変えていない**（dedup 前 ＝「検出器が組み立てた」であって「最終出力に残った」ではない）。4 経路とも成功で即 `return` するので、1 回の呼び出しで積まれる成功エントリは**各経路 1 件が上限**。
- `points` の role は**その経路の既存の棄却エントリに揃えた**（double top は `peak1` / `valley` / `forming_peak`、double bottom は `valley1` / `peak` / `valley2` / `current`、triple は `peak1` / `peak2` / `current`）ので、同じ経路の ✅ と ❌ が並んで読める。最新足の終値（確定ピボットではない）は double top の `forming_peak`、他 3 経路の `current` で区別する。triple の**ネックラインを引いた 2 点**（`valley1` / `valley2`、bottom は `peak1` / `peak2`）は `points` にだけ足した——`indices` は既存の棄却エントリと同じ 3 点のまま（#155 の `pre_head_valley` と同じ扱い）。
- **`forming_completion_below_min` は 4 経路のうち 3 経路で到達しない。** double 2 経路は `completion = min(1, 0.66 + progress × 0.34)` で `progress` が `[0, 1]` にクランプ済みなので下限 0.66 > 0.4、triple top も `progress = min(1, currentPrice / avgPeakPrice)` が価格の正値性から必ず正なので同じ。**triple bottom だけは到達する**——あちらの `progress` は `(current − avgValley) / (avgPeak − avgValley)` で**負を取りうる**ため、山谷差の小さい浅い形では `completion < 0.4` に落ちる（fixture あり）。到達しない 3 経路は #155 と同じく `MIN_FORMING_COMPLETION` / `FORMING_MIN_COMPLETION` の docstring に算術を明記し、**テストは fixture ではなく境界を固定した**。
- **`double_bottom` の成功エントリだけ `status` を `'forming'` 決め打ちにしていない。** この経路は `checkPostPivotInvalidation` と `FORMING_EXPIRY_BARS` で `invalid` / `expired` になったパターンも同じ `return` から返すので、**返すパターンと同じ式**（`terminal ? terminal.status : 'forming'`）を積む。決め打ちにすると期限切れの候補が「まだ形成中」と読める——`status` を足した目的（#155: 完成済みと誤読させない印）と逆向きになる。実測 800 ケースでは `forming` 102 / `invalid` 96 / `expired` 94。
- **実測**（合成 704 ケース = 価格列 11 系統 × パラメータ 8 × オプション 8、実データ 96 ケース = `btc_jpy_1day_2026` の窓 12 通り × オプション 8。計 **800**。#155 とは corpus の組み方が違うので件数は直接比較できない）:

  | | before → after |
  |---|---|
  | `data.patterns` | **0 変化**（800 ケースすべて deep-equal） |
  | 追加された `accepted: true` | **+436**（`double_top` 40 / `double_bottom` 292（forming 102・invalid 96・expired 94）/ `triple_top` 23 / `triple_bottom` 81） |
  | 追加された `accepted: false`（新設の理由コード） | **+1,325** |
  | 消えた候補 | **31**（**すべて `accepted: false`**。全件が cap 到達ケース内） |
  | cap 到達ケース | 5 → **6**（新規 1 件。実データ 75 本 × `swingDepth: 2`） |

  押し出された 31 件の内訳は triple の棄却理由 16 件（`forming_neckline_not_horizontal` 4 / `valleys_missing` 系 5 / ほか 7）、`rising_wedge / r2_below_threshold` 8 件、`triangle_symmetrical / r2_below_threshold` 6 件。**`cap = 200` は上げていない**（判断を仰ぐ対象）。`patterns` で絞れば `candidate-filter` がトリム前に落とすので該当種別の理由は残る。

  **`accepted: true` の増分と `data.patterns` の形成中件数がズレる経路がある。** `double_top`（40 ↔ 40）と `triple_bottom`（81 ↔ 81）は一致、`triple_top` は 23 ↔ 22 で 1 件が `globalDedup` に畳まれた。`double_bottom` は 102 ↔ 23 で差が大きく、内訳は **`globalDedup` が同じ構成点の完成済み `double_bottom` を勝たせた 70 件** と、**dedup で完成済みが勝ったあと `includeCompleted: false` で消えた 9 件**（この 9 件は before も after も `data.patterns` が空で、変わったのは candidates に痕跡が残るようになったことだけ）。これは #155 で明記した「積むのは dedup の前」の帰結で、意味は変えていない。

- **relaxed H&S / 逆 H&S の `fallback_relaxed` は `points` を持たない**（`tools/patterns/detect_hs.ts:903` / `:1083`。`indices` のみで `status` も無い）ことを確認したが、同じクラスの別経路なので**報告のみ**とし本エントリでは触っていない。

#### candidates の `status` / `breakoutDirection` を content と出力スキーマに届ける（#160 / PR #161）

- **置き場所が top-level と `details` に割れている**（`detect_triangles` / `detect_pennants` は `details.status` と `details.breakout.direction`、`detect_wedges` の形成中パスと #155 の形成中 H&S は top-level）ため、候補行は wedge / 形成中 H&S の `status` を出せず、`breakoutDirection` は **4 検出器すべてで**出ていなかった。**読む側（`formatDebugView`）で 1 回だけ解決する**形にし、候補行のヘッダに `status=` / `breakoutDirection=` を出す。**producer 6 ファイルの統一は見送った**——検出器に手が入り「検出結果ゼロ変更」の保証が重くなるため、#160 の「やらないこと」のまま据え置き。
- **`breakoutDirection: null` は欠損ではなく「この検出器が未ブレイクと判定した」という値のある答え**（`detect_wedges.ts:1027`）なので、`??` で畳まず **`!== undefined`（キーの有無）で分岐する**（CodeRabbit 指摘）。`??` のままだと top-level が `null` でも details 側に上書きされ、`status=forming breakoutDirection=down`（未ブレイクなのに方向がある）という矛盾した行が出る。現行の検出器は 2 系統を同時に積まないので**実データでは到達しない**（800 ケースの content テキストは修正前後で 1 文字も変わらない）が、ここが 2 系統を吸収する唯一の解決点で、`details.breakout` を持つ検出器が将来 top-level にも積んだ瞬間に黙って壊れるため直した。修正前の実装で実際に失敗することを確認した回帰テストを追加してある。出力スキーマの `z.string().nullish()` が欠損と `null` を畳まないことは zod v4 で実測確認済み。
- **出力スキーマに宣言が無いと `parse`（`tools/detect_patterns.ts:547`）で strip され handler に届かない。** `breakoutDirection` はこれで消えていたので、スキーマ追加はドキュメント整備ではなく**配線そのもの**（#155 の `status` と同じ構図）。`PatternEntry.breakoutDirection` の `z.enum(['up','down'])` とは揃えていない——あちらは成立したパターンの確定値、こちらは `null` が正当に入る候補時点の観測値で、enum に揃えると parse error になる。
- 二重表示を避けるため `formatCandidateDetails` の `detected` 行から `status` を外した。**消したのではなく canonical な行へ移した**（実測で triangle / pennant の内訳が 1 件も減っていないことを確認）。
- **形成中 H&S の `status: forming` と `details.method: forming_hs` は両方残した。** 冗長だが等価ではない——`method` は暫定右肩を `forming_hs_provisional` / `forming_ihs_provisional` として区別するので `status` では表現できない情報を持ち、逆に `status` を落とすと #155 のスキーマ追加が意味を失う。どちらも情報の欠損なしには落とせないので両方の存在をテストで固定した。
- **陳腐化していた説明文 4 箇所を訂正した**（`view` description は tool schema 経由で LLM に届くので実害がある）: 「candidates の各エントリは `status` を持たない」（#155 以降 誤り）/「`accepted: true` はその後パターンとして成立したことを示す」（形成中パスは dedup 前に積むので誤り）/ handler の凡例の ✅ 側（❌ 限定の記述は今も正しいが片手落ち）/ `tests/detect_patterns_debug.test.ts:177` の「型にも存在しない」（型には元からあった。アサーションは今も通るが**通る理由が変わっている**ので根拠を書き直した）。
- **実測**（合成 704 ケース + 実データ 96 ケース = 800）: `data.patterns` **0 変化** / candidates の件数・`accepted` 件数・`accepted` 内訳とも **0 変化**。content に `status` が出た候補は 296 → **424**（wedge 120 件（rising 80 / falling 40）と形成中 H&S 8 件が新規。triangle / pennant の 296 件は不変）、`breakoutDirection` は triangle 3 種・flag / pennant・wedge 2 種で計 **336 行**（H&S は検出器がこのフィールドを持たないので出ない）。
- **`detect_wedges` には 3 つ目の置き場所 `details.breakInfo.direction`（完成済みパス）がある**ことに気づいたが、本エントリでは触らず **#162 に送った**。

#### 完成済みウェッジ（`revamped_ok`）の `status` / `breakoutDirection` が候補行に出ていなかったのを修正（#162 / PR #164）

- 同じ `detect_wedges` の中で見え方が割れていた（形成中は `✅ falling_wedge status=forming breakoutDirection=up …` / 完成済みは `✅ falling_wedge (revamped_ok) indices=[…]` のみ）。**ブレイク済みのほうが方向の情報価値が高いので順序が逆**。原因は 2 つで、producer 側は計算済みの `status4b` をパターン側にだけ渡していた（`debugCandidates.push` に `status` が無い）、読む側は **3 つ目の置き場所** `details.breakInfo.direction` を見ていなかった。
- **`details.breakout: null` から `breakInfo` にフォールバックしない。** `details` 側の解決を `breakDirectionFromDetails` に切り出し、**キーが在ること自体が「この検出器が答えた」印**として先に見つかった系統で打ち切る。畳むと「未ブレイクなのに方向がある」行が出る——#160 が top-level の `null` を欠損と畳まないようにしたのと同じ規則を `details` 側にも通した。検出器が違うので実際に両方を持つエントリは無いが、優先順を暗黙にしない。
- **`status4b` の型は 3 値（`completed` / `invalid` / `near_completion`）だが、この push 地点の式は `breakInfo.detected` の 2 分岐で `completed` / `near_completion` しか返さない。** テストは**実際に返る 2 値**を固定してあり、型に合わせて緩めていない。
- **red-first で進めた。** 既存の終値列 fixture は**形成中パスにしか届かない**ため完成済みパスの候補行を検証できず、回帰パス（SG 平滑化ピボットの終値に回帰直線を当てる）に届く合成列を新規に組んだ（`buildCompletedFallingWedgeCandles`。山の終値が上限線・谷の終値が下限線に乗る 90 本 + ブレイクあり / なしの 2 種）。fixture を足すと既存アサーション（`typeof c.status === 'string'`）がそのまま赤くなることを確認してから直している。
- **実測**（合成 10 種 × `patterns` セット 7 通り × `includeForming` 2 の**全組み合わせ**。パターン 46 件 / 候補 2,881 件）: `data.patterns` と candidates の件数・`accepted` 内訳は**完全一致**。debug テキストで変わったのは **`✅ falling_wedge (revamped_ok)` の 176 行のみ**（`status=` / `breakoutDirection=` が付いた）。triangle / pennant / 形成中 wedge / 形成中 H&S の行は不変。

### Fixed（形成中 H&S / 逆 H&S の頭が「窓全体の極値」1 点に決め打ちされ、`limit` を上げると検出が消えていた。#154）

BTC/JPY 日足・H&S + 逆 H&S・`headProminencePct: 0.01`・`include*` すべて true で、
**スキャン窓を広げたのに検出が減る**（`limit=90` → 1 件 / `limit=200` → 0 件）。
どちらも「直近 `limit` 本」なので広い窓は狭い窓を包含する以上、消えるのは矛盾している。

#### 切り分け（issue #154 の 3 仮説のうち **候補 2「ピボット抽出 / 窓生成」**だった）

| 手順 | 実測 |
|---|---|
| 1. `limit=90` の検出内容 | 形成中 `head_and_shoulders`（左肩 idx 38 / 頭 53 / 谷 66 / 右肩 73、整合度 0.78、2026-07-06 → 08-10） |
| 2. `limit=200` での扱い | **候補に存在しない**（＝棄却ではなく列挙されていない） |
| 3. `globalDedup` の入出力 | 入力 **0 件** / 出力 0 件。dedup は何も飲み込んでいない |

**候補 1（`globalDedup` / #142）は否定された。** 検出器が 0 件しか出しておらず dedup に到達
していないため、本件は #142 の再観測**ではない**。#142 は保留のままでよい。
候補 3（`rankPatterns` / フィルタ段）も `includeInvalid: true` の時点で無関係だった。

原因は `tools/patterns/detect_hs.ts` の形成中パスの頭の選び方:

```ts
const head = confirmedPeaks.reduce((best, p) => (p.price > best.price ? p : best), confirmedPeaks[0]);
```

**頭を「スキャン窓全体の最高値ピーク（逆 H&S は最安値の谷）」1 点に決め打ちし、他の頭候補を
一切試していなかった。** 頭が決まると左肩・頭後の谷・右肩がすべてそこから芋づるに決まるため、
窓を広げて頭が過去側へ飛ぶと、狭い窓で見えていた構造は**候補として列挙されすらしなくなる**。

**前置きの足が窓より安くても再現する**のがこの不具合の芯で、ここが issue の仮説より一段深い。
`detectSwingPoints` は窓の両端 `swingDepth` 本をピボットにしないため、狭い窓では左端に埋もれて
いた足が、広い窓では左側の文脈を得て**ピボットに昇格する**。BTC/JPY fixture の idx 0
（2026-05-29、11,700,698）がまさにそれで、狭い窓の頭（10,849,999）より高いので頭を奪う。
つまり「広い窓で新しく高い山が入るから」ではなく、**同じ 90 本の左端の扱いが変わるだけ**で起きる。

#### 決定

頭候補を**総当たり**にした。列挙順は **`idx` の新しい順**で、これが単調性の鍵になる——
ピボット判定は前後 `swingDepth` 本だけを見る局所判定なので、窓を左へ広げて増えるのは
**より古い**頭候補だけであり、新しい順の列挙では既存の候補列の**後ろ**に積まれる。
広い窓の列挙は狭い窓の列挙を接頭辞として含むので、狭い窓で見つかった形成中パターンは
広い窓でも同じ頭から同じように見つかる。

**併せて「頭が形成区間の極値であること」を明示のゲートにした（`headIsExtremeInSpan`）。**
旧実装ではこの条件は暗黙に成立していた（窓全体の極値は当然その部分区間の極値でもある）。
総当たりにするとこの暗黙の保証が外れ、`[左肩, 右肩]` の内側に頭より極端な同種ピボットが
あっても通ってしまう。**実測で 1 件出た**——`completed_falling_wedge` fixture が
頭 idx 12（終値 112）で形成中 逆 H&S として通り、同区間に idx 33（終値 100）が居た。
頭より深い谷が形成区間の内側にあるなら、それは頭の取り違えでしかない。
この検査は**区間の内側だけを見るのでスキャン窓に依存せず**、単調性を壊さずに保証を戻す。

#### 影響範囲の計測

`tests/detect_patterns_fixtures.test.ts` の **fixture 22 件 × オプション 8 通り
（`includeForming` / `includeCompleted` / `includeInvalid`）× 時間足 2 種（`1day` / `1hour`）×
`swingDepth` 2 種（2 / 3）= 704 ケース**を、`main`（aba21f3）と本ブランチの双方で走らせて
突き合わせた（#131 / #132 / #135 / #136 / #139 / #140 / #141 / #148 と同じ手順・同じ 704 ケース）。

| 指標 | 結果 |
|---|---|
| 差分ケース | **0 / 704** |
| パターン合計 | 296 → 296 |

**0 / 704 は「総当たり化が死んでいる」ことを意味しない。** 頭の極値ゲートを入れる前の中間実装で
同じ 704 ケースを走らせると **8 ケース / +8 件**動き、その実体は上記の
`completed_falling_wedge` の偽陽性 1 件（`includeForming: true` の 4 通り × `swingDepth` 2 種）
だった。総当たり化は全経路に配線されており、極値ゲートがその 1 件だけを落としている。

#### 実測（実データ fixture）

`tests/fixtures/btc_jpy_1day_2026.ts`（BTC/JPY 日足 90 本、上記 704 ケースの外）を
**データセット 3 種 × 時間足 3 種（`1day` / `4hour` / `1hour`）× `swingDepth` 4 種
（既定 / 2 / 3 / 6）× オプション 8 通り = 288 ケース**で突き合わせた。データセットは
「fixture 90 本そのまま」と、その**手前に 110 本を継ぎ足して 200 本にしたもの 2 種**
（前置きの水準が窓の頭より安い 9.5M / 高い 11.7M）。継ぎ足しは決定論的な正弦波で、
末尾 90 本は fixture と完全に同一。

| データセット | 差分ケース | 内訳 |
|---|---|---|
| `fixture90`（90 本のまま） | **0 / 96** | 狭い窓の挙動は完全に不変 |
| `pre110@9.5M`（200 本） | 40 / 96 | すべて**増加**。消えたものは無い |
| `pre110@11.7M`（200 本） | 12 / 96 | すべて**増加**。消えたものは無い |

増えた実体は 3 つで、いずれも**狭い窓では出ていたのに広い窓で消えていたもの**が戻ったもの:

| 種別 | 整合度 | 期間 | 増えたケース数 | なぜ正しい検出か |
|---|---|---|---|---|
| `head_and_shoulders`（形成中） | 0.78 | 2026-07-06 → 08-10 | +24 | **issue #154 が報告した当のパターン。** `fixture90` の 96 ケースで検出されているものと `type` / `status` / 整合度 / 期間が完全に一致する。末尾 90 本が同一である以上、広い窓で出ないほうが誤り |
| `inverse_head_and_shoulders`（形成中） | 0.87 | 2026-06-18 → 08-14 | +16 | 同上（`fixture90` 側にも同一の実体が出ている）。頭が過去側へ飛んでいたため列挙されていなかった |
| `inverse_head_and_shoulders`（形成中） | 0.84 | 2026-06-18 → 08-17 | +12 | 同上。`swingDepth` 違いで右肩が 1 本ずれた読み |

**消えた実体は 0。** 3 件とも「狭い窓の検出が広い窓に戻った」ものであり、
新種の検出を増やしてはいない。

#### 残る窓依存（本 PR の対象外。既知として記録する）

同じ 288 ケースで「狭い窓で出たものが広い窓で消える」件数を数えると:

| 対象 | main | 本 PR |
|---|---|---|
| H&S / 逆 H&S | 60 | **8** |
| 全パターン種別 | 428 | 376 |

残った H&S 側の 8 件は**すべて同一の完成済み（`completed`）H&S**
（整合度 0.94、2026-06-07 → 06-24）で、`pre110@11.7M` でだけ消える。形成中パスではなく
`findStrictHS` 側であり、`validatePriorTrend` が**より長い履歴を得て先行トレンドを
「下降」と判定し直した**結果である。H&S は先行が `up_or_sideways` であることを要求するので、
これは**意図どおりの棄却**——`validatePriorTrend` / `applyReversalGate` はパターン開始点より
手前を遡る設計で、履歴が増えれば判定が変わるのが仕様。頭の決め打ちのような不具合ではない。

全種別の 376 件は double / wedge / triangle 側の窓依存で、本 issue の対象外。

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
