/**
 * tests/patterns/default-limit-detection.test.ts
 *
 * issue #118 問題 1 / 2 の回帰テスト。
 *
 * `tests/patterns/invariants.test.ts` の不変条件 9（到達性）は「閾値がスキャン窓に収まるか」
 * という**算術**だけを見る。閾値が収まっていても検出器が実際に候補を返すとは限らないので、
 * ここでは合成データを既定 `limit`（90 本）ぶん与えて **detectWedges / detectTriples が
 * 実際にパターンを返すこと**を時間足ごとに固定する。
 *
 * 本 PR 以前の値では次のとおり 0 件だった（`limit` を上げても `4hour` の 151 本要求までは
 * 届かず、`1hour` の 601 本要求はスキーマ上限 365 でも到達不能）:
 *
 * | 時間足 | 完成済み wedge | 形成中 triple |
 * |---|---|---|
 * | `1day`  | 1 件 | 1 件 |
 * | `4hour` | **0 件** | **0 件** |
 * | `1hour` | **0 件** | **0 件** |
 */
import { describe, expect, it } from 'vitest';
import { dayjs } from '../../lib/datetime.js';
import { getDefaultParamsForTf, getDefaultToleranceForTf } from '../../tools/patterns/config.js';
import { detectTriples } from '../../tools/patterns/detect_triples.js';
import { detectWedges } from '../../tools/patterns/detect_wedges.js';
import { linearRegressionWithR2 } from '../../tools/patterns/regression.js';
import { detectSwingPoints } from '../../tools/patterns/swing.js';
import type { CandleData, DetectContext } from '../../tools/patterns/types.js';

/** `DetectPatternsInputSchema.shape.limit` の既定値。invariants.test.ts が 90 であることを固定している。 */
const DEFAULT_SCAN_WINDOW = 90;

/** 受け入れ基準が名指ししている時間足。 */
const TIMEFRAMES = ['1day', '4hour', '1hour'] as const;

function mkCandle(index: number, o: number, h: number, l: number, c: number): CandleData {
	return { open: o, high: h, low: l, close: c, isoTime: dayjs.utc('2026-01-01').add(index, 'day').toISOString() };
}

/**
 * スキャン窓と同じ本数のローソク足から `DetectContext` を組む。
 * `detect_patterns.ts` と同じく時間足の既定パラメータ（`getDefaultParamsForTf` /
 * `getDefaultToleranceForTf`）を使い、呼び出し側のオプションは与えない。
 */
function buildCtx(tf: string, candles: CandleData[], includeForming: boolean): DetectContext {
	const { swingDepth, minBarsBetweenSwings } = getDefaultParamsForTf(tf);
	const tolerancePct = getDefaultToleranceForTf(tf);
	const pivots = detectSwingPoints(candles, { swingDepth });
	return {
		candles,
		pivots,
		allPeaks: pivots.filter((p) => p.kind === 'H'),
		allValleys: pivots.filter((p) => p.kind === 'L'),
		tolerancePct,
		minDist: minBarsBetweenSwings,
		want: new Set<string>(),
		includeForming,
		debugCandidates: [],
		type: tf,
		swingDepth,
		near: (a, b) => Math.abs(a - b) <= Math.max(a, b) * tolerancePct,
		pct: (a, b) => ((b - a) / Math.max(1, a)) * 100,
		lrWithR2: (pts) => linearRegressionWithR2(pts),
	};
}

/**
 * Falling Wedge 形状（`tests/patterns/detect_wedges.test.ts` と同じ生成則）。
 *   upper(i) = 200 - 0.5*i（急な下落） / lower(i) = 180 - 0.25*i（緩やかな下落 → 収束）
 * period=8 の振動で上下のトレンドラインにタッチを作る。
 */
function buildFallingWedgeCandles(nBars: number): CandleData[] {
	const candles: CandleData[] = [];
	for (let i = 0; i < nBars; i++) {
		const upper = 200 - 0.5 * i;
		const lower = 180 - 0.25 * i;
		const mid = (upper + lower) / 2;
		const period = i % 8;
		let h: number;
		let l: number;
		let c: number;
		if (period === 0 || period === 1) {
			h = upper;
			l = mid - 2;
			c = mid + 1;
		} else if (period === 4 || period === 5) {
			h = mid + 2;
			l = lower;
			c = mid - 1;
		} else {
			h = mid + 3;
			l = mid - 3;
			c = mid;
		}
		candles.push(mkCandle(i, mid, h, l, c));
	}
	return candles;
}

/**
 * 形成中 Triple Top 形状。確定済みの山を 2 つ（idx=12 / idx=52）置き、
 * 直近足を同じ水準まで戻して 3 山目を「現在価格」で暫定にする。
 * formationBars = 89 - 12 = 77 で、`1day`[23,99] / `4hour`[42,180] / `1hour`[34,146] の
 * いずれのレンジにも収まる。
 */
function buildFormingTripleTopCandles(nBars: number): CandleData[] {
	const peak1 = 12;
	const peak2 = 52;
	const valley1 = 32;
	const valley2 = 72;
	const ramp = 6;
	const bump = (i: number, center: number, width: number) => Math.max(0, 1 - Math.abs(i - center) / width);

	const candles: CandleData[] = [];
	for (let i = 0; i < nBars; i++) {
		let close = 100 + 20 * (bump(i, peak1, 8) + bump(i, peak2, 8)) - 18 * (bump(i, valley1, 10) + bump(i, valley2, 10));
		// 直近 ramp 本で山の水準まで戻す（3 山目 = 現在価格）
		if (i >= nBars - ramp - 1) close = 100 + 20 * ((i - (nBars - ramp - 1)) / ramp);
		candles.push(mkCandle(i, close, close + 0.6, close - 0.6, close));
	}
	return candles;
}

describe('既定 limit（90 本）での検出可能性 — issue #118 問題 1 / 2', () => {
	for (const tf of TIMEFRAMES) {
		it(`${tf}: 完成済み wedge が既定スキャン窓で検出できる`, () => {
			const candles = buildFallingWedgeCandles(DEFAULT_SCAN_WINDOW);
			expect(candles).toHaveLength(DEFAULT_SCAN_WINDOW);

			const result = detectWedges(buildCtx(tf, candles, false));
			const completed = result.patterns.filter((p) => p.type === 'falling_wedge');
			expect(completed.length, `${tf}: 完成済み falling_wedge が 0 件`).toBeGreaterThanOrEqual(1);
			// includeForming=false なので forming / near_completion は落ちている
			expect(completed.every((p) => p.status === 'completed')).toBe(true);
		});

		it(`${tf}: 形成中 triple が既定スキャン窓で検出できる`, () => {
			const candles = buildFormingTripleTopCandles(DEFAULT_SCAN_WINDOW);
			expect(candles).toHaveLength(DEFAULT_SCAN_WINDOW);

			const result = detectTriples(buildCtx(tf, candles, true));
			const forming = result.patterns.filter((p) => p.type === 'triple_top' && p.status === 'forming');
			expect(forming.length, `${tf}: 形成中 triple_top が 0 件`).toBeGreaterThanOrEqual(1);
		});
	}
});
