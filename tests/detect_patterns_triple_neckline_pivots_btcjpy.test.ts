/**
 * `triple_*` の `pivots` にネックライン定義点（v1 / v2）が入ることを**実データのパイプライン全体**で
 * 固定する（issue #224 症状 3）。
 *
 * 症状: `triple_top` / `triple_bottom` の `pivots` は主構成点 3 点（形成中は 2 点）しか持たず、
 * content に `ネックライン: 12,285,548円（水平）` と書いてあっても、消費者は報告された点から
 * その値を検算できなかった（`neckline[].y` は v1 / v2 の `price` の平均で決まるのに、v1 / v2 が
 * どこにも出ていない）。H&S（p1 / p3）と double（b）は入っていて、**triple だけが例外**だった。
 *
 * ここで固定するのは実データ B（`btc_jpy` 1hour）を**ネイティブのまま**見た値（#219）:
 *
 * | パターン | `pivots`（idx / kind） | `neckline.y` | 検算 |
 * |---|---|---:|---|
 * | `triple_bottom` near_completion | 305 L / **308 H** / 313 L / **318 H** / 331 L | 12,601,128 | (12,617,817 + 12,584,439) / 2 |
 * | `triple_bottom` forming | 313 L / **318 H** / 331 L / **355 H** | 12,691,733.5 | (12,584,439 + 12,799,028) / 2 |
 *
 * 形成中の 3 谷目は現在価格の暫定値なので `pivots` に**入らない**（従来どおり）。
 *
 * 判定フィールド（`confidence` / `status` / `neckline` / `breakoutTarget` / `aftermath` /
 * `meta.reduction.tripleHsExcluded`）が動いていないことは 940 ケースの実測で確認済み
 * （CHANGELOG の読む順 50）。既定オプションの回帰ベースライン
 * （`tests/detect_patterns_data_patterns_regression.test.ts`）には #216 / #218 以降 triple が
 * 1 件も残っていないため、本ファイルが triple の実データ回帰を持つ。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../tools/analyze_indicators.js', () => ({ default: vi.fn() }));

import { toolDef as detectPatternsTool } from '../src/handlers/detectPatternsHandler.js';
import analyzeIndicators from '../tools/analyze_indicators.js';
import detectPatterns from '../tools/detect_patterns.js';
import { asMockResult, assertOk } from './_assertResult.js';
import { buildBtcJpy1hour202608Candles } from './fixtures/btc_jpy_1hour_2026_08.js';

type PivotLike = { idx: number; price: number; kind: 'H' | 'L' };

/** 実データ B（`btc_jpy` 1hour）を `analyze_indicators` の応答として 1 回分差し込む。 */
function mockCandles() {
	vi.mocked(analyzeIndicators).mockResolvedValueOnce(
		asMockResult({ ok: true, summary: 'ok', data: { chart: { candles: buildBtcJpy1hour202608Candles() } } }),
	);
}

/** `includeForming: true` で `detect_patterns` を走らせ、ok を確認して返す。 */
async function runForming() {
	mockCandles();
	const res = await detectPatterns('btc_jpy', '1hour', 365, { includeForming: true });
	assertOk(res);
	return res;
}

/** 水平ネックラインの y を、報告された `pivots` の中間側 `kind` 2 点の平均から再現する。 */
function necklineFromPivots(pivots: PivotLike[], mainKind: 'H' | 'L'): number {
	const mids = pivots.filter((p) => p.kind !== mainKind);
	expect(mids).toHaveLength(2);
	return (mids[0].price + mids[1].price) / 2;
}

describe('detect_patterns: triple の pivots がネックライン定義点を含む（issue #224 症状 3。実データ B 1hour）', () => {
	it('near_completion の triple_bottom は 5 点（L-H-L-H-L）で、2 山の平均が neckline の y に一致する', async () => {
		const res = await runForming();
		const tb = res.data.patterns.find((p) => p.type === 'triple_bottom' && p.status === 'near_completion');
		expect(tb).toBeDefined();
		const pivots = tb?.pivots as PivotLike[];
		expect(pivots.map((p) => [p.idx, p.kind])).toEqual([
			[305, 'L'],
			[308, 'H'],
			[313, 'L'],
			[318, 'H'],
			[331, 'L'],
		]);
		// 検算: (12,617,817 + 12,584,439) / 2 = 12,601,128
		expect(necklineFromPivots(pivots, 'L')).toBe(12_601_128);
		expect(tb?.neckline?.map((n) => n.y)).toEqual([12_601_128, 12_601_128]);
		// 主構成点は kind で取る（位置ではない）。3 谷は据え置き。
		expect(pivots.filter((p) => p.kind === 'L').map((p) => p.idx)).toEqual([305, 313, 331]);
	});

	it('forming の triple_bottom は 4 点（L-H-L-H）で、暫定 3 谷目（現在価格）は含まない', async () => {
		const res = await runForming();
		const tb = res.data.patterns.find((p) => p.type === 'triple_bottom' && p.status === 'forming');
		expect(tb).toBeDefined();
		const pivots = tb?.pivots as PivotLike[];
		expect(pivots.map((p) => [p.idx, p.kind])).toEqual([
			[313, 'L'],
			[318, 'H'],
			[331, 'L'],
			[355, 'H'],
		]);
		// 検算: (12,584,439 + 12,799,028) / 2 = 12,691,733.5
		expect(necklineFromPivots(pivots, 'L')).toBe(12_691_733.5);
		expect(tb?.neckline?.map((n) => n.y)).toEqual([12_691_733.5, 12_691_733.5]);
		expect(pivots.filter((p) => p.kind === 'L')).toHaveLength(2);
	});

	it('triple 以外の反転系の pivots 点数は従来どおり（完成済み H&S は 5 点、double は 3 点）', async () => {
		const res = await runForming();
		const lengths = res.data.patterns
			.filter((p) => p.status !== 'forming')
			.filter((p) => /head_and_shoulders|double_/.test(String(p.type)))
			.map((p) => `${p.type}:${(p.pivots ?? []).length}`);
		expect(lengths.length).toBeGreaterThan(0);
		expect(lengths.filter((l) => l.includes('head_and_shoulders')).every((l) => l.endsWith(':5'))).toBe(true);
		expect(lengths.filter((l) => l.startsWith('double_')).every((l) => l.endsWith(':3'))).toBe(true);
	});

	it('content: 価格範囲がネックライン定義点を含んだ幅になり、形成中の暫定注記は引き続き出る', async () => {
		mockCandles();
		const out = (await detectPatternsTool.handler({
			pair: 'btc_jpy',
			type: '1hour',
			limit: 365,
			includeForming: true,
			view: 'full',
		})) as { content: Array<{ text: string }> };
		const text = out.content[0].text;
		// near_completion: before は 3 谷だけの 12,449,981 - 12,531,708 円だった。山 308（12,617,817）が上限に入る。
		expect(text).toContain('価格範囲: 12,449,981円 - 12,617,817円');
		// forming: before は 2 谷だけの 12,449,981 - 12,521,114 円だった。山 355（12,799,028）が上限に入る。
		expect(text).toContain('価格範囲: 12,449,981円 - 12,799,028円');
		// 形成中 triple の注記は `status === 'forming'` で判定する（`pivots.length === 2` に依存しない）。
		expect(text).toContain('3 谷目は現在価格を暫定');
	});
});
