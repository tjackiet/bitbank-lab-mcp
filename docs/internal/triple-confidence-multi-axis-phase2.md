# トリプル confidence の多軸化（issue #199 Phase 2 候補 1・実測ログ）

`detect_triples.ts` の完成済み 4 経路の `base = (tolMargin + symmetry + per) / 3` から
**`symmetry` を捨て**、`retracement` / `breakoutQuality` を独立軸として足した。
[issue #199](https://github.com/tjackiet/bitbank-lab-mcp/issues/199) の
[Phase 2 方針コメント](https://github.com/tjackiet/bitbank-lab-mcp/issues/199#issuecomment-5502326126)
候補 1 の実装ログ。

Phase 1（PR #203、`triple-confidence-distribution-phase1.md`）の実測が前提。

## 変更の要旨

| | 旧 | 新 |
|---|---|---|
| 式 | `(tolMargin + symmetry + per) / 3` | 算出できた軸の相加平均（`levelMargin` / `retracement` / `breakoutQuality` / `duration`） |
| 同水準の軸 | `tolMargin`（`scoreComponents` に出ていない） | **`levelMargin`**（新フィールド。`scoreComponents` に出る） |
| 捨てた軸 | — | `symmetry`（= 1 − 最大 relDev。Phase 1 実測 0.9752〜0.9997 でほぼ定数） |
| 足した軸 | — | `retracement`（構造ゲートの戻り率）/ `breakoutQuality`（突破幅 ÷ パターン高さ） |
| confidence の算出位置 | ネックライン傾き判定の直後 | **ブレイク検出の後**（`breakoutQuality` が突破足の終値を要る） |
| `MIN_CONFIDENCE.triple_*` | 0.7 | **0.6** |

**doubles とは逆に `tolMargin`（→ `levelMargin`）を残して `symmetry` を捨てた。**
double が `symmetry` を残したのは 2 点しかなく「2 点の relDev そのもの」だったため。
triple の `tolMargin` は 3 ペアの平均なので中間点の情報も拾っており、
Phase 1 で唯一レンジを持っていた（0.586〜0.996）のもこちら。

## 変えなかったもの

- **`duration`（`periodScoreDays`）はそのまま。** Phase 1 で 109/109 が 0.6 という定数だったが、
  バー数基準への置き換えは #199 候補 2 で、バケット閾値を決めるのに追加計測が要る。
  同時に動かすと `symmetry` 除去の寄与と分離できない。
- **`finalizeConf` の triple 係数 1.05 はそのまま。** 軸構成が変われば 1.05 の根拠も変わるが、
  閾値（`MIN_CONFIDENCE`）と係数を同時に動かすと切り分けできない。
  **本 PR では触っていない**——再検討が要るなら別 issue を立てること。
- **形成中（`forming`）経路は対象外。** confidence が別式
  （`(1 − currentDiff/tol) × 0.8` 系）で、issue が扱う 4 経路に含まれない。
  実測でも forming の 9 構造はすべて 0.59 のまま不変。
- **#206（`MIN_CONFIDENCE` の H&S / double 4 エントリを誰も読んでいない）には手を出していない。**
  triple だけがゲートを持つ状態は本 PR でも変わらない。
- **副次 C（`spreadRatio` の基準混在）/ 副次 A（単調階段ゲート）も対象外**（#199 の優先順位どおり）。

## 前準備: scoring ヘルパの共有モジュール化

`retracementScore` / `breakoutQualityScore` は `detect_doubles.ts` の module-private だったので
**`tools/patterns/scoring.ts`** に切り出した（`averageDefinedAxes` も同じ場所に置いた）。

`helpers.ts` に足さなかった理由は 3 つ（`scoring.ts` 冒頭にも記載）:

1. `helpers.ts` は 700 行超の寄せ集め（バー数換算・wedge / triangle の幾何・タッチ評価・
   重複排除・`finalizeConf`）。隣の `reversal-gate.ts` / `ranking.ts` / `bar-thresholds.ts` /
   `min-bars.ts` という単機能モジュールの粒度に合わせるほうが既存の構成と揃う。
2. 本モジュールは `structural.ts`（`RETRACEMENT_MIN` / `RETRACEMENT_MAX` / `ReversalSide`）に
   依存する。`helpers.ts` は現在 `structural.ts` を import していないので、そこに置くと
   wedge / triangle / 重複排除しか使わない側にまで構造ゲートの定数が芋づるで入る。
3. #204（H&S）でも同じ 2 関数を使う予定。`detect_triples.ts` が `detect_doubles.ts` を
   import する（検出器どうしの横依存）形は避けたい。

**切り出しは挙動不変。** 標準コーパス 896 ケース（`data.patterns` / `meta.debug.candidates`）と
`detectTriples()` 直接呼び出し 156 ケース（トリム前 `debugCandidates`）の JSON が、
切り出し前後で**バイト単位で完全一致**した（コミット `f2a7ac3` 単体で確認）。

## 計測条件

| 項目 | 値 |
|---|---|
| 計測日 | 2026-09-02 |
| 比較対象 | `main` = `d388c9c`（#205 マージ後）vs 本ブランチ |
| コーパス | **標準コーパス 800**（合成 704 = `tests/detect_patterns_fixtures.test.ts` の fixture 22 件 × オプション 8 通り（`includeForming` / `includeCompleted` / `includeInvalid`）× 時間足 2 種（`1day` / `1hour`）× `swingDepth` 2 種（2 / 3）、実データ A 96 = `tests/fixtures/btc_jpy_1day_2026.ts` × 時間足 3 種 × `swingDepth` 4 種 × オプション 8 通り）**＋ 実データ B 96**（`tests/fixtures/btc_jpy_1hour_2026_08.ts` × 同上）= **896 ケース**。#187 / #203 / #204 と同じ組み方 |
| 補助スイープ | 実データ B × 全 11 時間足 × `swingDepth` 4 種（オート / 2 / 3 / 6）= 44 ケース。**検出器層のみ**（`detectTriples()` 直接呼び出し） |
| 2 層で測る理由 | コーパス層（`detectPatterns` の `data.patterns` = `globalDedup` 後）は利用者が見るもの、検出器層（`detectTriples()` 直接呼び出し）は**トリム前の `debugCandidates`** が要るため。棄却理由の帰属変化は cap=200 のトリムに埋もれる |
| view | 検出器を直接呼ぶ経路は MCP の `view` を経由しない。`data.patterns` は `view` で変わらないので `view=full` と同値 |

**「時間足」はパラメータのラベルであってリサンプリングではない**（#204 の同名の注記と同じ限界）。
1 本の価格系列に `tf` を差し替えて呼ぶ組み方なので、`sweepB:1min` は
*1 分足の実データ* ではなく *1 分足のパラメータを 1 時間足データに当てた結果*。

## 1. type 別の増減

`data.patterns`（コーパス層 896 ケースの延べ件数）:

| type | before | after | 差 |
|---|---:|---:|---:|
| `triple_top` | 100 | **88** | **−12** |
| `triple_bottom` | 100 | **92** | **−8** |
| `double_top` | 36 | 36 | 0 |
| `double_bottom` | 80 | 80 | 0 |
| `head_and_shoulders` | 116 | 116 | 0 |
| `inverse_head_and_shoulders` | 92 | 92 | 0 |
| `rising_wedge` | 128 | 128 | 0 |
| `falling_wedge` | 176 | 176 | 0 |
| `triangle_ascending` | 256 | 256 | 0 |
| `triangle_descending` | 176 | 176 | 0 |
| `triangle_symmetrical` | 160 | 160 | 0 |
| `bull_flag` / `bull_pennant` / `bear_pennant` | 8 / 32 / 16 | 8 / 32 / 16 | 0 |
| **合計** | **1,476** | **1,456** | **−20** |

**triple 以外は 1 件も動いていない**（`data.patterns` から triple を除いた JSON が 896 ケース全件で
deep-equal）。`globalDedup` の `isSameCategory`（`helpers.ts`）が triple を他 type と統合しないので
期待どおりだが、押し出しによる間接的な変化が無いことを実測で確認した。

`data.patterns` が変わったケースは **108 / 896**（合成 64 / 実データ A 0 / 実データ B 44）。
**増加は 0 件。**

## 2. 消えた / 増えた triple（構造単位で 1 件ずつ）

コーパス層で `(データ系列, tf, swingDepth, type, 3 構成点の idx)` に畳むと
before **50** キー → after **45** キー。消えた 5 キーは
**価格系列上は 2 つの構造**（同じ 3 点を複数の `tf` / `swingDepth` が拾っている）。**増えた構造は 0。**
残った 45 キーのうち 32 で `confidence` が変わった。

### 消えた構造 A — `triple_top`（実データ B。`1hour` オート / `1hour` d3 / `4hour` d3 の 3 行）

| | 値 |
|---|---|
| range / structureRange | `2026-08-21T08:00Z` 〜 `2026-08-21T23:00Z`（両者同じ。`near_completion`） |
| 山1 | idx 204（`2026-08-21T08:00Z`）close **12,571,740** |
| 谷1 | idx 205（`2026-08-21T09:00Z`）close **12,351,281** |
| 山2 | idx 211（`2026-08-21T15:00Z`）close **12,260,243** |
| 谷2 | idx 214（`2026-08-21T18:00Z`）close **12,250,416** |
| 山3 | idx 219（`2026-08-21T23:00Z`）close **12,445,660** |
| ネックライン | 12,300,848.5（2 谷の平均） |
| confidence | **0.79 → 0.51**（`levelMargin` 0.6686 / `retracement` 0.1905 / `duration` 0.6） |

**山2（12,260,243）が谷1（12,351,281）より低い。** 3 山が水平なレジスタンスに当たった形ではなく、
真ん中が 2.5% 抜け落ちた V 字。山1-山3 のばらつき 311,497 円に対して山2 の落ち込みのほうが大きい。
`retracement` 0.19 は「中間構成点が許容帯 [0.2, 0.9] の端にへばりついている」を意味し、
この形をそのまま数値化している。旧式では `symmetry ≈ 0.99` が持ち上げて 0.79 になっていた。

### 消えた構造 B — `triple_bottom`（実データ B。`1hour` オート / `1hour` d3 の 2 行）

| | 値 |
|---|---|
| range / structureRange | `2026-08-13T11:00Z` 〜 `2026-08-14T08:00Z`（`near_completion`） |
| 谷1 | idx 15（`2026-08-13T11:00Z`）close **10,110,000** |
| 山1 | idx 18（`2026-08-13T14:00Z`）close **10,165,681** |
| 谷2 | idx 20（`2026-08-13T16:00Z`）close **10,066,580** |
| 山2 | idx 26（`2026-08-13T22:00Z`）close **10,132,001** |
| 谷3 | idx 36（`2026-08-14T08:00Z`）close **10,021,680** |
| ネックライン | 10,148,841（2 山の平均） |
| confidence | **0.87 → 0.52**（`levelMargin` 0.8834 / `retracement` 0.0104 / `duration` 0.6） |

**3 谷が単調に切り下がる階段**（10,110,000 → 10,066,580 → 10,021,680。`totalStep` 0.874%）。
Phase 1 の計測 5（副次 A）が「単調 5 件」として列挙したうちの 1 件そのもの
（`2026-08-13T11:00Z`〜`2026-08-14T08:00Z`、`totalStep` 0.874%、confidence 0.86）で、
**forming の `FORMING_STAIR_STEP_LIMIT`（2%）では弾けないと確定していた形。**
`retracement` 0.0104 は中間構成点が許容帯の端（戻り率 ≈ 0.204 か 0.896）にあることを示す。

Phase 1 が「単調ゲートを足しても 1 件も弾けない」と結論した形が、**ゲートを増やさずに
スコアの解像度だけで落ちた。** 副次 A の優先度を据え置いたまま症状が改善している。

### 増えた構造

**0 件。** 判定順の変更は「合否」ではなく「棄却理由の帰属」しか動かさない
（候補は全ゲートを通過して初めて accept されるので、順序は accept 集合に影響しない）。
accept 集合が変わったのは confidence の**値**が変わったからで、実測でも
`rejected → accepted` の遷移は検出器層 0 件だった。

### confidence が上がった 1 構造（参考）

| | 値 |
|---|---|
| type / 系列 | `triple_top` / 実データ B `4hour` オート・`4hour` d6・`1hour` d6 |
| 3 山 idx | 204 / 219 / 236（`completed`） |
| confidence | **0.79 → 0.80** |
| 内訳 | `levelMargin` 0.6845 / `retracement` 0.757 / `breakoutQuality` 1 / `duration` 0.6 |

3 山のばらつきは大きい（`levelMargin` 0.68）が、**戻り率が教科書的（0.757）でブレイクも深い**。
旧式ではこの 2 つを見ていなかったので、構造 A（0.79）と同点だった。
**同点だった 2 つが 0.51 と 0.80 に分かれた**のが本変更の眼目。

## 3. 棄却理由の帰属が入れ替わった候補数

`breakoutQuality` の算出にブレイク足の終値が要るため、confidence の算出は
`validatePatternSize` / 構造ゲート / `validateLevelSpread` より**後ろ**に移った。
`validatePatternSize` の docstring にある「固有の理由コードを持つ候補の `reason` を横取りしない」
という原則に照らすと、`confidence_below_min` は汎用的な理由なので後ろに回るほうが原則に沿う
（旧配置では、サイズ不足やスプレッド超過という**固有の診断が付くはずの候補**に
`confidence_below_min` という汎用コードが付いていた）。

検出器層 156 ケース（トリム前 `debugCandidates` 8,376 件）を
`(ケース, type, indices)` で突き合わせた結果:

| 遷移 | 件数 |
|---|---:|
| 棄却 → 棄却（理由が変わった） | **33** |
| ├ `confidence_below_min_relaxed` → `retracement_out_of_band` | 14 |
| ├ `confidence_below_min_relaxed` → `peak_too_shallow` | 12 |
| ├ `confidence_below_min` → `neckline_above_pre_decline_high` | 4 |
| ├ `confidence_below_min` → `peak_too_shallow` | 2 |
| └ `confidence_below_min_relaxed` → `valley_spread_vs_height_excess` | 1 |
| 受理 → 棄却（すべて `confidence_below_min`） | 28 |
| 棄却 → 受理 | **0** |

**入れ替わりは全 33 件が「汎用コード → 固有コード」の方向**（逆方向 0 件）。
理由コード別の総数（トリム前・全 8,376 件は前後で不変）:

| reason | before | after | 差 |
|---|---:|---:|---:|
| `ACCEPTED` | 287 | 259 | −28 |
| `confidence_below_min` | 6 | 28 | +22 |
| `confidence_below_min_relaxed` | 27 | **0** | −27 |
| `retracement_out_of_band` | 38 | 52 | +14 |
| `peak_too_shallow` | 773 | 787 | +14 |
| `neckline_above_pre_decline_high` | 200 | 204 | +4 |
| `valley_spread_vs_height_excess` | 41 | 42 | +1 |
| 上記以外（24 コード） | — | — | **すべて 0** |

`confidence_below_min_relaxed` が 0 になったのは、relaxed 経路で confidence 判定まで到達した候補が
すべて 0.6 を超えたため（relaxed の候補自体は 14+12+1 = 27 件ぶん、より前段の固有コードに移った）。

## 4. `MIN_CONFIDENCE.triple_*` の再検証（0.7 → 0.6）

### 0.7 のままだと何が起きるか

軸構成が変わると confidence のスケールが変わる。旧式は 3 項のうち 2 項が実質定数
（`symmetry` 0.975〜1.000 / `per` 0.6 固定）で `base ≈ (tolMargin + 1.59) / 3`、
**算術的な下限 0.557・実測の下限 0.76**。新式は `retracement`（許容帯の中央で 1・端で 0 という定義上、
実測の中央値 0.55 / 平均 0.53）と `duration`（0.6）が平均を押し下げ、
実測レンジが **0.48〜1.00** に広がる。

同じ 0.7 を残した場合の実測（検出器層・構造単位 130 件）:

| | 旧式 + 0.7 | 新式 + 0.7 | 新式 + 0.6 |
|---|---:|---:|---:|
| ゲート棄却の構造数 | 18 / 148（12.2%） | **58 / 130（44.6%）** | 18 / 130（**13.8%**） |
| ゲート棄却の行数 | 33 / 276（12.0%） | 157 / 291（54.0%） | 28 / 243（11.5%） |
| コーパス層 `data.patterns` の triple | 200 | 132（−68） | 180（−20） |

**0.7 のままだと「形の良さの下限」だった検査が主フィルタに化ける**（棄却率が 3.6 倍）。
合成 fixture の教科書的な `triple_top`（`buildCompletedTripleTopCandles`）まで落ちる。

### 0.6 を採った根拠

**閾値を緩めたのではなく、スケールが動いたぶん同じ位置に置き直した。**
0.6 は**このリポジトリが既に持っている「形状不十分」の線**:

- `detectPatternsViewsHandler` の低 confidence 警告ラベルが `confidence < 0.6`
- `detect_patterns` が LLM に出す整合度の帯が「**0.6 未満 = 形状不十分**」
- 形成中トリプルの上限 `FORMING_MAX_CONFIDENCE = 0.59` はこの 0.6 に合わせて置かれている
  （完成済みの下限を 0.6 にすると forming ≤ 0.59 / completed ≥ 0.60 で**隣接し、帯が重ならない**。
  0.7 のままだと [0.60, 0.69] が「どちらの status も取りえない空白帯」になる）

実測による裏取り:

- **棄却率が旧ゲートと同じオーダー**（13.8% vs 12.2%）＝ floor のままでいられる。
- **切られる 18 件は全件 `retracement ≤ 0.1905`、かつ全件 `breakoutQuality` 欠測（= 未ブレイク）。**
  「中間構成点が許容帯の端にへばりついていて、しかもブレイクで裏付けられていない」という
  1 つのクラスにきれいに収まる。`levelMargin` は 0.5858〜0.9391 とばらけており、
  **同水準性だけでは切られていない**（＝旧 `tolMargin` 一本足打法とは別の切り方になっている）。
- 残る 112 件のうち `retracement ≤ 0.1905` は 11 件あるが、9 件は `completed` で
  `breakoutQuality = 1`（深いブレイクが埋め合わせている）、2 件は `levelMargin` 0.9735 で
  ちょうど 0.60。**境界のすぐ上に来るのは「他の軸が補っている」ケースだけ**で、
  クラスの分離は保たれている。

### 分布（検出器層・構造単位 130 件。ゲート判定に到達したもの全件）

0.01 刻みのヒストグラム（`|` がゲート位置）:

```
0.48:2  0.51:6  0.52:2  0.53:6  0.54:2 | 0.60:2  0.63:6  0.64:6  0.65:2  0.66:2
0.67:3  0.68:12 0.69:7  0.72:4  0.73:6  0.74:4  0.75:4  0.76:6  0.78:2  0.80:9
0.81:10 0.82:6  0.83:5  0.84:2  0.85:2  0.86:1  0.88:4  0.89:5  0.95:1  1.00:1
```

**0.55〜0.59 が空**なので、0.55〜0.60 のどこに置いても切れ方は同じ（18 件）。
0.6 はその空白の上端で、上記の 3 つの既存の線と一致する値。

閾値を動かした場合の通過件数（130 構造中）:

| 閾値 | 0.60 | 0.62 | 0.64 | 0.65 | 0.66 | 0.68 | 0.70 | 0.72 | 0.75 | 0.80 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 通過 | **112** | 110 | 104 | 98 | 96 | 91 | 72 | 72 | 58 | 46 |

### 棄却された候補の confidence を `debug` に出すようにした

旧実装は `confidence_below_min` の棄却候補に confidence をどこにも載せていなかったので、
**「0.7 が何を切っているか」をコードを書き換えずに測れなかった。**
本 PR で `details: { confidence, threshold, ...scoreComponents }` を載せた
（#138 が `levelSpreadDetails` で入れたのと同じ趣旨）。次に閾値を再検討するときは
`view=debug` の出力だけで足りる。

## 5. 受理された triple の分布（変更後）

検出器層 215 行（`completed` 55 / `near_completion` 160）:

| | n | min | p25 | median | p75 | max | mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| **confidence（before）** | 243 | 0.76 | 0.85 | 0.88 | 0.90 | 1.00 | 0.873 |
| **confidence（after）** | 215 | 0.60 | 0.68 | 0.75 | 0.81 | 1.00 | 0.751 |
| `levelMargin` | 215 | 0.6056 | 0.8532 | 0.9130 | 0.9562 | 1.0000 | 0.8973 |
| `retracement` | 187 | 0.1026 | 0.3333 | 0.5479 | 0.7570 | 0.9681 | 0.5297 |
| `breakoutQuality` | 55 | 0.1376 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.9373 |
| `duration` | 215 | 0.6 | 0.6 | 0.6 | 0.6 | 0.9 | 0.6186 |

構造単位（130 → 112）でも同じ形: confidence の中央値 0.87 → 0.75、
レンジ幅 0.24 → 0.40。**ばらつきが約 1.7 倍に広がった**＝弁別力が上がった。

### 軸ごとの所見（正直な限界を含む）

- **`retracement` が新しい主力。** レンジ 0.10〜0.97 で、旧式の `symmetry`（幅 0.025）とは
  桁違いに動く。実測で消えた 2 構造もこの軸が効いている。
- **`breakoutQuality` は本コーパスの実データでは飽和する。** 生の比（`excess / patternHeight`）は
  **1.41〜4.97** で、`clamp01` により 55 行中 **51 行が 1.0**。0.5〜1.0 の中間に落ちるのは
  合成 fixture の `buildCompletedTripleTopCandles`（0.1376）だけ。
  原因は `BREAKOUT_BUFFER_PCT`（価格の 1.5%）とパターン高さの比で、BTC/JPY 1hour では
  高さが価格の 0.6〜1.5% しかないので**バッファを超えた時点で高さを超えている**。
  日足合成 fixture では逆に高さが 18% あるのでバッファ超え = 高さの 10% にしかならない。
  **「軸は入ったが、intraday の実データでは順位付けに寄与しない」**——`symmetry` を捨てた理由と
  同じ構造の弱さが残っている。定義は doubles と揃えてあるので、直すなら doubles と一緒に
  （別 issue）。
- **`retracement` は 215 行中 28 行で欠測**（13%）。`validateReversalStructure` が
  `skipped: 'no_prior_extreme'`（第1構成点より前にスイング極値が無い＝窓の先頭に張り付いた構造）で
  素通しした場合で、`retracementRatio` そのものが出ない。**欠測は平均から外している**
  （0 として混ぜると「測れなかった」が「悪い」に化ける）。doubles と同じ扱い。
- **`duration` は相変わらずほぼ 0.6**（215 行中 mean 0.6186、0.9 になるのは合成 fixture のみ）。
  Phase 1 の結論どおりで、#199 候補 2 の対象。

### relaxed 経路について

**標準コーパスでは relaxed 経路は変更前後とも 1 件も accept していない**
（`_fallback` を持つ `data.patterns` が before / after とも 0 件）。
#204 の H&S Phase 1 と同じ状況で、**relaxed の式変更を実測できるコーパスが今は無い。**

ただし構造的な観察として、**relaxed の `levelMargin` は 0.5 前後が上限**になる。
relaxed が走るのは strict の最大ペアが `tolerancePct` を超えたときだけなので、
3 ペア平均を `tolerancePct × factor` で割った値はそこまでしか上がらない。
`× 0.95` の relaxed ペナルティと合わせると、relaxed triple は他の 3 軸で稼がないと 0.6 を超えない
（`tests/detect_patterns_meta_schema_parity.test.ts` の relaxed fixture は
`levelMargin` 0.44 / `retracement` 0.607 / `breakoutQuality` 0.640 / `duration` 0.9 で 0.65）。

## 6. スキーマ / 型の宣言

`symmetry` の description は **double 専用の文言**（「2 つの構成点（谷-谷 / 山-山）の同水準度」）で
triple の `tolMargin` とは意味が違うため、**新フィールド `levelMargin` を足した**
（`.claude/rules/tools.md` 規約 7:「同じ語の意味を差し替える変更は alias では救えない」）。

宣言箇所（#155 / #160 / #184 / #189 と同じ「Zod 未宣言で黙って strip」を避けるため両方に入れる）:

- `tools/patterns/types.ts` の `PatternScoreBreakdown`
- `src/schema/patterns.ts` の `DetectedPatternSchema.scoreComponents`

機械的な固定は `tests/detect_patterns_meta_schema_parity.test.ts` の `requiredKeys` に
`patterns[].scoreComponents.{levelMargin,retracement,breakoutQuality,duration}` を追加した。
`_fallback`（#189）と同じ「フィクスチャが経路を踏んでいないと宣言漏れを検出できない」穴があるため、
**relaxed triple フィクスチャで踏めていることを先にアサートする**形にしてある。

## 7. テスト / フィクスチャの更新

| ファイル | 変更 | 理由 |
|---|---|---|
| `tests/fixtures/detect_patterns_1hour_data_patterns_baseline.json` | 再生成 | 検出件数は 14 件で不変。triple 2 件の `confidence`（0.85 → 0.73 / 0.84 → 0.68）と `scoreComponents` の追加、`rankPatterns` の並び替え |
| `tests/detect_patterns_data_patterns_regression.test.ts` | docstring / describe 名 | 「#200 着手前のスナップショット」と名乗ったままだった（#202 で一度ずれていた）。**「現在の出力のスナップショット」＋更新履歴の表**に書き換え、次に更新する人が名乗りを直し忘れないようにした |
| `tests/detect_patterns_meta_schema_parity.test.ts` | relaxed fixture のブレイクを深くした | 既定のブレイクが浅く（`breakoutQuality` 0.18）confidence 0.53 で消え、**relaxed 経路の `_fallback` 検証が丸ごと空振りする**ため |
| `tests/patterns/detect_triples.test.ts` | `breakoutExcessOfHeight` オプションを追加し #178 の 2 テストで使用 | 既定のブレイク（バッファ +0.1%）が `breakoutQuality` を 0.1 に固定する交絡要因になっていた。両テストの主題は**谷スプレッドと top / bottom 対称性**でブレイクの深さではない |
| 同上 | `#199` の describe を追加（6 テスト） | 軸の有無・欠測時の扱い・許容幅による正規化・棄却 details・判定順 |
| `tests/patterns/level-spread-triple.test.ts` | `find` を `indices` で名指しに | `triple_bottom` 側は同じ理由コードで落ちる構造が 2 つあり、判定順が変わって**先頭一致が別構造にすり替わって落ちた**（期待 0.5219 に対し別構造の 0.5259 を検証していた）。`triple_top` 側は今回落ちていないが、同じ順序依存を抱えているので合わせて名指しにした |
| `tests/patterns/scoring.test.ts` | 新規（15 テスト） | 切り出した 3 関数の境界（欠測 / clamp / 帯の中央・端）を固定 |

`npm test` は **207 ファイル / 5,323 テスト全 pass**。

## 8. 次にやること（本 PR では決定しない）

- **#199 候補 2（`per` をバー数基準に）。** `duration` が 0.6 に張り付いたままなのは変わっていない。
  着手前に `c.idx − a.idx` の分布計測が要る。
- **`breakoutQuality` の分母。** 上記のとおり intraday の実データでは飽和する。
  `BREAKOUT_BUFFER_PCT` とパターン高さの関係を見直すなら doubles と同時に。
- **`finalizeConf` の triple 係数 1.05。** 軸構成が変わったので根拠は変わっている。
  本 PR では触っていない。
- **#206（`MIN_CONFIDENCE` の 4 エントリが読まれていない）。** 手を出していない。
