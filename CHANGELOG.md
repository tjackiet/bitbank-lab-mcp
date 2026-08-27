# Changelog

本プロジェクトの主な変更履歴です。
形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠しています。

---

## [Unreleased]

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
- **`tools/patterns/scan-window.ts` の `buildScanWindowWarning` の docstring が「日数ベースの閾値は別途かかる」のままだったのを修正した。** #121 で閾値のプリミティブがバー数になっている（`patterns/bar-thresholds.ts`）。#127 の残り（prompts の `limit=180`、CHANGELOG 集約）は本 PR の対象外。

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
