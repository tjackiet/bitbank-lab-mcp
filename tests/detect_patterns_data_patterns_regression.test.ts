/**
 * `detect_patterns` の `data.patterns`（BTC/JPY 1hour 実データ・デフォルトオプション）を
 * **スナップショットとして固定する**回帰テスト。手書きの期待値ではなく、実際の出力を
 * `tests/fixtures/detect_patterns_1hour_data_patterns_baseline.json` に凍結したもの。
 *
 * ## ベースラインは「#200 着手前」ではない（名乗りを実態に合わせた履歴）
 *
 * 初版（#200）は「縮小段の申告 E / 時刻表示 F-1 / 構造図 tz 修正 F-2 の**前後で不変**」を
 * 主張するテストで、ベースラインは #200 着手前の実装から取っていた。その後 2 度更新している:
 *
 * | 更新 | 理由 |
 * |---|---|
 * | #202 | `headProminencePct` の時間軸オート値を `tolerancePct` の表から切り離し、1hour の H&S が検出されるようになった |
 * | #199 候補 1 | triple の整合度を多軸化し、`scoreComponents` が付いて `confidence` が変わった |
 * | #208 | H&S の `breakoutTarget` の高さを「頭の真下のネックライン」基準に直した（target 系のみ変化） |
 * | #210 | `targetReachedPct` に走査窓（ブレイク後 60 本）・退化ガード・上限 999 を入れた（target 進捗系のみ変化） |
 * | #204 Phase 2 | H&S の整合度を多軸化し、`scoreComponents` が付いて `confidence` が変わった。**`globalDedup` の代表が入れ替わり、H&S 4 件のうち 3 件が別の構造になった** |
 * | #199 候補 2 | triple の `duration` を暦日基準（`periodScoreDays`）からバー数基準（`periodScoreBars`）に移した。triple 2 件の `confidence` と `rankPatterns` の並びが変わった |
 * | #218 Phase 2 | `triple_*` と H&S 系が主構成点を 2 点以上共有していたら triple を落とす型間排他を入れた。**本ベースラインで初めて件数が動く**（14 → 13。`triple_bottom` 1 件の純減） |
 * | #216 Phase 2 | `triple_*` / `double_*` の主構成点がネックラインの誤った側にあったら落とす構造ゲートを入れた（13 → 12。`triple_top` 1 件の純減） |
 *
 * **#206 では更新していない**（`MIN_CONFIDENCE` から未配線の 4 エントリを消しただけで、
 * `data.patterns` は 940 ケース全件で完全一致。行を足す必要が無かった）。
 *
 * **#226 でも更新していない**（relaxed H&S / 逆 H&S の構造図が描くネックライン水準を
 * `nlAvg` から `nlY` へ直した表示層のみの修正。実データ A / B それぞれ 1,520 ケースで
 * `data.patterns` の判定フィールドは全件一致し、**本 fixture が含む H&S 系 4 件は
 * すべて strict 経路**なので SVG も 1 バイト動いていない。回帰は
 * `tests/detect_patterns_hs_neckline_diagram_btcjpy.test.ts` と
 * `tests/patterns/hs-neckline-diagram-consistency.test.ts` が持つ）。
 *
 * **#224 症状 3 でも更新していない**（`triple_*` の `pivots` にネックライン定義点 v1 / v2 を
 * 足した変更。940 ケースの実測では `pivots` が動くのは `triple_top` 68 件 / `triple_bottom` 71 件
 * の全件で、他の 13 type は 1 バイトも動かない（`bear_flag` はコーパスに 0 件）が、**本 fixture は #216 / #218 以降 triple を
 * 1 件も含まない**（H&S 系 4 / wedge 4 / triangle 4）ので差分が出ない。triple の実データ回帰は
 * `tests/detect_patterns_triple_neckline_pivots_btcjpy.test.ts`（実データ B × `includeForming`）が持つ）。
 *
 * **#234 でも更新していない**（`content` の pivot 明細行を `triple_*` / H&S 系にも出すように
 * した表示層のみの変更。`src/handlers/detectPatternsViewsHandler.ts` の役割ラベル表引きだけを
 * 触っており、検出ロジックにも `data.patterns` のどのフィールドにも手が入っていない。
 * 本 fixture は `data.patterns` だけを凍結していて `content` を含まないので差分も出ない。
 * 明細行の実データ以外の回帰は `tests/detectPatternsViewsHandler.test.ts`（役割ラベルの
 * 表引き。形成中 H&S の「頭」が 2 番目に来る非対称を含む）と
 * `tests/view-content-superset.test.ts`（規約 3: `full` が `detailed` の上位集合のまま）が持つ）。
 *
 * **#228 でも更新していない**（`detect_triples.ts` の完成済み 4 経路（strict / relaxed ×
 * top / bottom）に `computeTargetReach` を配線し、`targetProgressOmittedReason:
 * 'not_computed_by_detector'` を実際の進捗値に置き換えた変更。**動くのは target 進捗系
 * 4 フィールドだけ**で、判定ロジックには手が入っていない——940 ケースの実測で
 * `detectTriples()` が返す 200 パターンが、進捗系 5 キーを除いて**バイト単位で完全一致**した
 * （`scripts/measure_triple_target_reach_228.ts` と同じコーパス）。本 fixture は #216 / #218 以降
 * triple を 1 件も含まない（H&S 系 4 / wedge 4 / triangle 4）ので、そもそも差分が出る余地が無い。
 * triple の完成済み経路の回帰は `tests/patterns/target-progress-declared.test.ts`
 * （実データ B のライブ実例＋合成 fixture）が持ち、実データのパイプライン回帰は
 * `tests/detect_patterns_triple_neckline_pivots_btcjpy.test.ts` が持つ）。
 *
 * **#224 症状 1 でも更新していない**（`meta.reduction` に `tripleHsCandidateCount` を足し、
 * 「検出内訳:」行に `（比較対象 H&S 無し）` の注記を付けた申告のみの変更。判定ロジックは
 * 触っておらず `data.patterns` は不変。本 fixture は `data.patterns` だけを凍結していて
 * `meta.reduction` を含まないので差分も出ない。新フィールドの実データ回帰は
 * `tests/detect_patterns_triple_hs_exclusion.test.ts` と
 * `tests/detect_patterns_meta_schema_parity.test.ts` が持つ）。
 *
 * つまり**「不変であること」を主張できるのは各 PR の中だけ**で、ファイルとしては
 * 「現在の出力のスナップショット」に役割が変わっている。**名乗りを更新せずに中身だけ
 * 差し替えると、テスト名が嘘になる**（#202 で一度そうなった）ので、ベースラインを
 * 更新するときはこの表に 1 行足すこと。
 *
 * ## 構造図（`structureDiagram.svg` / `.artifact.title`）を比較から除く理由
 *
 * #200 の F-2 が構造図の日付表示を `.utc()` 固定から呼び出し側 tz へ修正した
 * （`lib/pattern-diagrams.ts`）。SVG 内の日付ラベルと `artifact.title` は**意図的に**変わる
 * （JST 09:00 より前のピボットの日付が 1 日ずれていたバグの修正そのもの）。
 * 一方 `artifact.identifier` は tz を通さない値なので、他のフィールドと同じく
 * 完全一致の対象に含める（issue #200:「artifact.identifier は触らない」の回帰）。
 *
 * ## #199 候補 1 時点のスナップショットの中身
 *
 * 検出件数は 14 件で**変わっていない**（triple は 1 件も消えていない）。変わったのは
 * triple 2 件の `confidence` と、それに伴う `rankPatterns` の並び:
 *
 * | パターン | before | after |
 * |---|---:|---:|
 * | `triple_bottom`（2026-08-22T22:00Z〜） | 0.85 | **0.73** |
 * | `triple_top`（2026-08-21T23:00Z〜） | 0.84 | **0.68** |
 *
 * 後者は issue #199 本文のケース 3（報告値 0.84。「目視ではトリプルに見えないのに高得点」）
 * そのもので、`retracement` 0.18（中間構成点が許容帯の端）が効いて下がっている。
 *
 * ## #208 時点のスナップショットの中身
 *
 * 検出件数は 14 件で**変わっていない**。`confidence` も全件不変で、変わったのは H&S 系 4 件の
 * `breakoutTarget` / `targetReachedPct` / `targetReached` だけ:
 *
 * | パターン | `breakoutTarget` | `targetReached` |
 * |---|---|---|
 * | `head_and_shoulders`（2026-08-23T21:00Z〜） | 12,446,657 → **12,176,203** | true → **false** |
 * | `head_and_shoulders`（2026-08-21T08:00Z〜） | 12,427,825 → **12,177,311** | true → **false** |
 * | `inverse_head_and_shoulders`（2026-08-21T23:00Z〜） | 12,809,302 → **12,643,525** | true（据置） |
 * | `inverse_head_and_shoulders`（2026-08-13T02:00Z〜） | 10,261,999 → **10,277,171** | true（据置） |
 *
 * 上 2 件が issue #208 の症状そのもの——下抜けブレイクなのに target がブレイク終値（12,407,578）
 * より上に着地し、`targetReached` がブレイク直後に無条件で立っていた。
 *
 * ## #210 時点のスナップショットの中身
 *
 * 検出件数は 14 件で**変わっていない**。`confidence` / `status` / `pivots` / `range` /
 * `breakoutTarget` / `aftermath` も全件不変で、変わったのは target **進捗**系 5 件だけ:
 *
 * | パターン | before | after |
 * |---|---|---|
 * | `inverse_head_and_shoulders`（2026-08-22T22:00Z〜） | `targetReachedPct: 43177` | 進捗系を出さず `targetProgressOmittedReason: 'degenerate_target_distance'` |
 * | `inverse_head_and_shoulders`（2026-08-13T16:00Z〜） | `targetReachedPct: 240033` | 同上 |
 * | `falling_wedge`（2026-08-14T21:00Z〜） | 5,102% / 12,933,047 | **999%（上限）** / 11,063,169 |
 * | `triangle_ascending`（2026-08-16T12:00Z〜） | 1,719% / 12,933,047 | **530%** / 11,063,169 |
 * | `triangle_ascending`（2026-08-19T16:00Z〜） | 483% / 12,933,047 | **382%** / 12,600,000 |
 *
 * 上 2 件が issue #210 本文の 240,033% / 43,177%。分母 `|target − ブレイク価格|` が
 * パターン高さの 0.68% / 0.33% まで潰れていて達成度を測れないので、**値を出さずに理由を申告する**側に倒した。
 * 下 3 件は分母は正常（比 1.0）で、`targetReachedPrice` が**系列全体の最高値 12,933,047
 * （2026-08-25T02:00Z）に張り付いていた**のが直っている——走査がブレイク足から 60 本で止まるため。
 *
 * ## #204 Phase 2 時点のスナップショットの中身
 *
 * 検出件数は 14 件で**変わっていない**。H&S 以外の 10 件も全フィールド不変。
 * 変わったのは H&S 系 4 件で、**うち 3 件は「値が動いた」のではなく別の構造に入れ替わっている**:
 *
 * | before（5 点 idx / confidence） | after | |
 * |---|---|---|
 * | `head_and_shoulders` 204-249-294-313-**318** / 0.95 | `head_and_shoulders` 204-249-294-313-**322** / **0.69** | 右肩が 1 本先の候補に入れ替わり |
 * | `inverse_head_and_shoulders` 242-245-249-265-272 / 0.95 | `inverse_head_and_shoulders` **230-232**-249-265-272 / **0.74** | 左肩・山1 が入れ替わり |
 * | `inverse_head_and_shoulders` 20-26-42-106-109 / 0.94 | `inverse_head_and_shoulders` **3-9**-42-**118-137** / **0.80** | 同じ頭（idx 42）を持つ、より広い構造に入れ替わり |
 * | `head_and_shoulders` 265-272-294-313-322 / 0.82 | 同じ構造 / **0.85** | 構造は据え置きで得点だけ上昇 |
 *
 * ## #199 候補 2 時点のスナップショットの中身
 *
 * 検出件数は 14 件で**変わっていない**。**構造の集合も同一**（`pivots` の idx が 14 件すべて一致）で、
 * 代表の入れ替わりも起きていない。変わったのは triple 2 件の `duration` / `confidence` と、
 * それに伴う `rankPatterns` の並びだけ:
 *
 * | パターン（3 構成点 idx） | 構成バー数 | `duration` | `confidence` |
 * |---|--:|---|---|
 * | `triple_bottom` 242-249-**272** | 30 | 0.6 → **0.9** | 0.73 → **0.81** |
 * | `triple_top` 219-223-**232** | 13 | 0.6 → **0.7** | 0.68 → **0.70** |
 *
 * 暦日基準では 30 バー = 30 時間 / 13 バー = 13 時間でどちらも「5 日未満」に落ち、
 * **1hour では全 triple が 0.6 に張り付いていた**（#203 Phase 1 の実測どおり）。
 * バー数基準にすると 30 本と 13 本が別のバケットに分かれる。
 * triple 以外の 12 件は全フィールド不変。
 *
 * ## #218 Phase 2 時点のスナップショットの中身
 *
 * **初めて検出件数が動いた更新**（14 → 13）。消えたのは `triple_bottom` 242-249-**272**（conf 0.81）
 * 1 件だけで、**残り 13 件は全フィールド不変**（`confidence` / `range` / `pivots` /
 * `breakoutTarget` / `aftermath` とも。`globalDedup` の代表入れ替わりも起きていない）。
 *
 * | 落ちた triple | 共有した H&S 系 | 共有点 |
 * |---|---|---|
 * | `triple_bottom` 242-249-272（conf 0.81） | `inverse_head_and_shoulders` 230-232-249-265-272（conf 0.74。主構成点は左肩 230 / 頭 249 / 右肩 272） | **249・272 の 2 点** |
 *
 * これが issue #218 が挙げた実例そのもの（「triple の谷2・谷3 が逆 H&S の頭・右肩と一致」）で、
 * **本 issue の受け入れ条件**。逆 H&S は `headProminencePct` のゲートを通過している
 * ＝ 中央（idx 249）が両隣と明確に違うことが検証済みなので、「3 点が同水準」を前提にする
 * triple とは両立しない。**H&S 側は 1 件も落ちていない**（`head_and_shoulders` 2 件 /
 * `inverse_head_and_shoulders` 2 件は据え置き）。
 *
 * `triple_top` 219-223-232 が残っているのは、その主構成点（219 / 223 / 232）が
 * 出力に残る 2 件の `head_and_shoulders`（主構成点 265-294-322 と 204-294-322）と
 * **1 点も共有しないから**。「triple を全部落とす」変更ではない。
 *
 * **H&S に confidence の下限ゲートは無い**（#204 Phase 2 時点は「`MIN_CONFIDENCE` に
 * エントリはあるが誰も読んでいない」状態で、#206 でそのエントリごと削除した）ので、
 * 得点が下がってパターンが消えたのではない。入れ替わりの原因は `globalDedup` で、
 * 期間の重なりが 70% 以上の候補群から `statusScore` → **`confidence`** の順に代表を選ぶため、
 * 得点の順序が変われば**別の `range` を持つ候補が残る**。
 * つまり `confidence` だけでなく `range` / `structureRange` / `pivots` / `breakoutTarget` /
 * `targetReachedPct` も連動して変わる（本ベースラインの差分の大半はこれ）。
 *
 * ## #216 Phase 2 時点のスナップショットの中身
 *
 * **2 度目の件数変動**（13 → 12）。消えたのは `triple_top` 219-223-**232**（conf 0.70）
 * 1 件だけで、**残り 12 件は全フィールド不変**（差分は純粋な削除 101 行のみ。
 * `globalDedup` の代表入れ替わりも起きていない）。
 *
 * | 落ちた triple | ネックライン | 誤った側の主構成点 | 逸脱量 |
 * |---|---:|---|---:|
 * | `triple_top` 219-223-**232**（conf 0.70） | 12,285,548.5 | 山3（idx 232 / 終値 12,282,275） | **−3,273.5 円**（0.027%） |
 *
 * これは #216 Phase 1 が issue 本文の実例として実測したその構造で、**山3 がネックラインを
 * 割っている**——水平なレジスタンスに 3 回当たった形として読めない。**H&S 系は 1 件も
 * 動いていない**（本 PR は triple / double にしかゲートを配線していない。H&S は #211 の
 * 外挿クランプの是非が決まってから別 PR）。
 *
 * **#218 Phase 2 の型間排他（`meta.reduction.tripleHsExcluded`）は 1 のまま**。
 * 本ゲートが落とした `triple_top` 219-223-232 は排他の対象ではなく（出力に残る 2 件の
 * `head_and_shoulders` と主構成点を 1 点も共有しない）、排他が落とす
 * `triple_bottom` 242-249-272 は 3 谷ともネックラインの正しい側にある——**2 つのゲートは
 * 別の構造を落としている。**
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../tools/analyze_indicators.js', () => ({ default: vi.fn() }));

import analyzeIndicators from '../tools/analyze_indicators.js';
import detectPatterns from '../tools/detect_patterns.js';
import { asMockResult, assertOk } from './_assertResult.js';
import { buildBtcJpy1hour202608Candles } from './fixtures/btc_jpy_1hour_2026_08.js';
import baseline from './fixtures/detect_patterns_1hour_data_patterns_baseline.json' with { type: 'json' };

/** `structureDiagram` を identifier だけ残して比較対象から除く（F-2 が意図的に変える svg / title を落とす）。 */
function stripStructureDiagram(patterns: ReadonlyArray<Record<string, unknown>>): unknown[] {
	return patterns.map((p) => {
		const diagram = p.structureDiagram as { artifact?: { identifier?: string } } | undefined;
		if (!diagram) return p;
		return { ...p, structureDiagram: { artifact: { identifier: diagram.artifact?.identifier } } };
	});
}

describe('detect_patterns: data.patterns の実データスナップショット（issue #200 起点。#202 / #199 / #208 / #210 / #204 / #199 候補 2 / #218 / #216 で更新）', () => {
	it('btc_jpy 1hour（デフォルトオプション）で data.patterns が構造図の svg/title を除きベースラインと一致する', async () => {
		const candles = buildBtcJpy1hour202608Candles();
		vi.mocked(analyzeIndicators).mockResolvedValueOnce(
			asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
		);

		const res = await detectPatterns('btc_jpy', '1hour', 365, {});
		assertOk(res);

		// 検出件数を先に固定する。件数がずれているなら以下の deep-equal は
		// 「どのフィールドが変わったか」ではなく「何件増減したか」を先に見せたほうが速い。
		expect(res.data.patterns).toHaveLength(baseline.length);

		expect(stripStructureDiagram(res.data.patterns)).toEqual(stripStructureDiagram(baseline));

		// artifact.identifier は tz 修正の対象外（表示ではなく成果物 ID）。個別にも明示して固定する。
		const identifiers = res.data.patterns
			.map(
				(p) =>
					(p as { structureDiagram?: { artifact?: { identifier?: string } } }).structureDiagram?.artifact?.identifier,
			)
			.filter((id): id is string => typeof id === 'string');
		const baselineIdentifiers = baseline
			.map(
				(p) =>
					(p as { structureDiagram?: { artifact?: { identifier?: string } } }).structureDiagram?.artifact?.identifier,
			)
			.filter((id): id is string => typeof id === 'string');
		expect(identifiers.length).toBeGreaterThan(0);
		expect(identifiers).toEqual(baselineIdentifiers);
	});
});
