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

describe('detect_patterns: data.patterns の実データスナップショット（issue #200 起点。#202 / #199 / #208 で更新）', () => {
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
