import { describe, expect, it } from 'vitest';
import type { Candle } from '../../tools/patterns/swing.js';
import { detectSwingPoints, filterPeaks, filterValleys } from '../../tools/patterns/swing.js';

/** V字のローソク足データを生成するヘルパー */
function makeCandles(prices: number[]): Candle[] {
	return prices.map((p) => ({
		open: p,
		close: p,
		high: p + 1,
		low: p - 1,
	}));
}

describe('detectSwingPoints', () => {
	it('空配列は空を返す', () => {
		expect(detectSwingPoints([], { swingDepth: 2 })).toEqual([]);
	});

	it('データが少なすぎる場合は空を返す', () => {
		const candles = makeCandles([100, 110, 100]);
		expect(detectSwingPoints(candles, { swingDepth: 3 })).toEqual([]);
	});

	it('明確なスイングハイを検出する', () => {
		// 上昇→ピーク→下降
		const prices = [100, 110, 120, 130, 120, 110, 100];
		const candles = makeCandles(prices);
		const pivots = detectSwingPoints(candles, { swingDepth: 2 });
		const peaks = pivots.filter((p) => p.kind === 'H');
		expect(peaks.length).toBeGreaterThanOrEqual(1);
		expect(peaks[0].idx).toBe(3);
	});

	it('明確なスイングローを検出する', () => {
		// 下降→ボトム→上昇
		const prices = [130, 120, 110, 100, 110, 120, 130];
		const candles = makeCandles(prices);
		const pivots = detectSwingPoints(candles, { swingDepth: 2 });
		const valleys = pivots.filter((p) => p.kind === 'L');
		expect(valleys.length).toBeGreaterThanOrEqual(1);
		expect(valleys[0].idx).toBe(3);
	});

	it('strictPivots=false で緩和モードを使用', () => {
		const prices = [100, 110, 120, 130, 125, 120, 100];
		const candles = makeCandles(prices);
		const pivots = detectSwingPoints(candles, { swingDepth: 2, strictPivots: false });
		// 緩和モードでもスイングを検出
		expect(pivots.length).toBeGreaterThanOrEqual(1);
	});

	it('ピボットの価格は close を使用する', () => {
		const candles: Candle[] = [
			{ open: 100, close: 100, high: 105, low: 95 },
			{ open: 110, close: 110, high: 115, low: 105 },
			{ open: 120, close: 125, high: 130, low: 115 },
			{ open: 110, close: 110, high: 115, low: 105 },
			{ open: 100, close: 100, high: 105, low: 95 },
		];
		const pivots = detectSwingPoints(candles, { swingDepth: 1 });
		const peaks = pivots.filter((p) => p.kind === 'H');
		if (peaks.length > 0) {
			// price は close 値（125）であって high（130）ではない
			expect(peaks[0].price).toBe(125);
		}
	});
});

describe('filterPeaks', () => {
	it('H のみをフィルタする', () => {
		const pivots = [
			{ idx: 0, price: 100, kind: 'H' as const, extremePrice: 100 },
			{ idx: 1, price: 90, kind: 'L' as const, extremePrice: 90 },
			{ idx: 2, price: 110, kind: 'H' as const, extremePrice: 110 },
		];
		const peaks = filterPeaks(pivots);
		expect(peaks).toHaveLength(2);
		expect(peaks.every((p) => p.kind === 'H')).toBe(true);
	});

	it('空配列は空を返す', () => {
		expect(filterPeaks([])).toEqual([]);
	});
});

describe('filterValleys', () => {
	it('L のみをフィルタする', () => {
		const pivots = [
			{ idx: 0, price: 100, kind: 'H' as const, extremePrice: 100 },
			{ idx: 1, price: 90, kind: 'L' as const, extremePrice: 90 },
			{ idx: 2, price: 85, kind: 'L' as const, extremePrice: 85 },
		];
		const valleys = filterValleys(pivots);
		expect(valleys).toHaveLength(2);
		expect(valleys.every((p) => p.kind === 'L')).toBe(true);
	});

	it('空配列は空を返す', () => {
		expect(filterValleys([])).toEqual([]);
	});
});

// ──────────────────────────────────────────────
// 価格基準の透明化（#125）
//   極値判定は high / low、格納する price は close。両者が別物であることを
//   出力から検算できるように extremePrice を持たせている。
// ──────────────────────────────────────────────
describe('detectSwingPoints: price と extremePrice の関係', () => {
	/** ヒゲの長さを指定できるローソク足（close と high/low を明確にずらす） */
	function makeWickyCandles(prices: number[], wick: number): Candle[] {
		return prices.map((p) => ({ open: p, close: p, high: p + wick, low: p - wick }));
	}

	it('スイングハイの price は終値、extremePrice は高値', () => {
		const prices = [100, 110, 120, 130, 120, 110, 100];
		const candles = makeWickyCandles(prices, 7);
		const peaks = filterPeaks(detectSwingPoints(candles, { swingDepth: 2 }));
		expect(peaks).toHaveLength(1);
		expect(peaks[0].idx).toBe(3);
		expect(peaks[0].price).toBe(candles[3].close);
		expect(peaks[0].extremePrice).toBe(candles[3].high);
		// ヒゲがある限り両者は一致しない。一致してしまうと「終値基準」との区別が付かない。
		expect(peaks[0].extremePrice).not.toBe(peaks[0].price);
	});

	it('スイングローの price は終値、extremePrice は安値', () => {
		const prices = [130, 120, 110, 100, 110, 120, 130];
		const candles = makeWickyCandles(prices, 7);
		const valleys = filterValleys(detectSwingPoints(candles, { swingDepth: 2 }));
		expect(valleys).toHaveLength(1);
		expect(valleys[0].idx).toBe(3);
		expect(valleys[0].price).toBe(candles[3].close);
		expect(valleys[0].extremePrice).toBe(candles[3].low);
		expect(valleys[0].extremePrice).not.toBe(valleys[0].price);
	});

	it('緩和モードでも extremePrice は判定に使った極値のまま', () => {
		const prices = [100, 110, 120, 130, 125, 120, 100];
		const candles = makeWickyCandles(prices, 5);
		const pivots = detectSwingPoints(candles, { swingDepth: 2, strictPivots: false });
		expect(pivots.length).toBeGreaterThan(0);
		for (const pv of pivots) {
			const c = candles[pv.idx];
			expect(pv.extremePrice).toBe(pv.kind === 'H' ? c.high : c.low);
		}
	});

	it('ヒゲが 0 の足では price と extremePrice が一致する（同値は情報であって欠損ではない）', () => {
		const prices = [100, 110, 120, 130, 120, 110, 100];
		const candles = makeWickyCandles(prices, 0);
		const peaks = filterPeaks(detectSwingPoints(candles, { swingDepth: 2 }));
		expect(peaks[0].extremePrice).toBe(peaks[0].price);
	});
});

// ──────────────────────────────────────────────
// 窓の前後 swingDepth 本の余白（#277）
//   走査範囲が [swingDepth, length − swingDepth) に閉じているので、窓の終端
//   swingDepth 本の足は**極値であってもピボットにならない**。#242 の経路ゲートは
//   このピボット列で判定するため、終端の余白にある戻しを見ない。
//   検出器を通した仕様の固定は tests/patterns/breakout-path-double.test.ts。
// ──────────────────────────────────────────────
describe('detectSwingPoints: 窓の終端 swingDepth 本はピボットにならない（issue #277）', () => {
	const DEPTH = 3;
	/** idx 5 が明確な極値。長さ 2 × DEPTH + 1 = 7 では終端の余白（idx 4/5/6）に入る。 */
	const PRICES = [100, 101, 102, 103, 104, 110, 105];

	function makeCandles(prices: number[]): Candle[] {
		return prices.map((p) => ({ open: p, close: p, high: p + 1, low: p - 1 }));
	}

	it('長さ 2 × swingDepth + 1 では、終端の余白にある極値がピボットにならない', () => {
		const candles = makeCandles(PRICES);
		expect(candles).toHaveLength(2 * DEPTH + 1);
		// 走査できる i は swingDepth だけ（i < 7 − 3 = 4）。idx 5 は範囲の外。
		expect(detectSwingPoints(candles, { swingDepth: DEPTH })).toEqual([]);
	});

	it('同じ足でも、後ろに swingDepth 本足して余白から出すとピボットになる', () => {
		const candles = makeCandles([...PRICES, 104, 103, 102]);
		const pivots = detectSwingPoints(candles, { swingDepth: DEPTH });
		expect(pivots.map((p) => `${p.kind}${p.idx}`)).toEqual(['H5']);
		expect(pivots[0].extremePrice).toBe(candles[5].high);
	});

	it('窓の先頭 swingDepth 本も同じく候補から外れる（前後は対称）', () => {
		// idx 1 が明確な極値だが、swingDepth = 3 では i < 3 を走査しない。
		const head = makeCandles([100, 110, 104, 103, 102, 101, 100, 101, 102, 103]);
		expect(detectSwingPoints(head, { swingDepth: DEPTH }).some((p) => p.idx === 1)).toBe(false);
	});
});
