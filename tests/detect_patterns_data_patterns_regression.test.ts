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
 *
 * **#206 では更新していない**（`MIN_CONFIDENCE` から未配線の 4 エントリを消しただけで、
 * `data.patterns` は 940 ケース全件で完全一致。行を足す必要が無かった）。
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
 * **H&S に confidence の下限ゲートは無い**（#204 Phase 2 時点は「`MIN_CONFIDENCE` に
 * エントリはあるが誰も読んでいない」状態で、#206 でそのエントリごと削除した）ので、
 * 得点が下がってパターンが消えたのではない。入れ替わりの原因は `globalDedup` で、
 * 期間の重なりが 70% 以上の候補群から `statusScore` → **`confidence`** の順に代表を選ぶため、
 * 得点の順序が変われば**別の `range` を持つ候補が残る**。
 * つまり `confidence` だけでなく `range` / `structureRange` / `pivots` / `breakoutTarget` /
 * `targetReachedPct` も連動して変わる（本ベースラインの差分の大半はこれ）。
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

describe('detect_patterns: data.patterns の実データスナップショット（issue #200 起点。#202 / #199 / #208 / #210 / #204 で更新）', () => {
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
