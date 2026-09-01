/**
 * issue #200 の受け入れ条件: `data.patterns` は本 PR（縮小段の申告 E / 時刻表示 F-1 / 構造図 tz 修正 F-2）の
 * 前後で完全一致する——**構造図（`structureDiagram.svg` / `.artifact.title`）を除く**。
 *
 * なぜ構造図だけ除くか: F-2 は構造図の日付表示を `.utc()` 固定から呼び出し側 tz へ修正する
 * （`lib/pattern-diagrams.ts`）。この修正は SVG 内の日付ラベルと `artifact.title` の文字列を
 * **意図的に**変える（JST 09:00 より前のピボットの日付が 1 日ずれていたバグの修正そのもの）。
 * 一方 `artifact.identifier` は tz を通さない値なので、こちらは他のフィールドと同じく
 * 完全一致の対象に含める（issue #200: 「artifact.identifier は触らない」の回帰）。
 *
 * ベースラインは本 PR 着手前（要件 E / F 実装前）の `tools/detect_patterns.ts` を
 * `git stash` で一時的に復元して実際に取得した実データ（`btc_jpy_1hour_2026_08` fixture、
 * デフォルトオプション）。手書きの期待値ではない。
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

describe('detect_patterns: data.patterns は縮小段申告 / 時刻表示 / 構造図 tz 修正の前後で不変（issue #200）', () => {
	it('btc_jpy 1hour（デフォルトオプション）で data.patterns が構造図の svg/title を除き完全一致する', async () => {
		const candles = buildBtcJpy1hour202608Candles();
		vi.mocked(analyzeIndicators).mockResolvedValueOnce(
			asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
		);

		const res = await detectPatterns('btc_jpy', '1hour', 365, {});
		assertOk(res);

		// 検出件数そのものが変わっていないこと（本 PR の最重要チェック）を先に固定する。
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
