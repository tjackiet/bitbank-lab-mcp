import { describe, expect, it } from 'vitest';
import {
	getConvergenceFactorForTf,
	getDefaultParamsForTf,
	getDefaultToleranceForTf,
	getMinFitForTf,
	getSizeThresholdsForTf,
	getTriangleCoeffForTf,
	getTriangleWindowSize,
	MIN_CONFIDENCE,
	resolveParams,
	SCHEMA_DEFAULTS,
} from '../../tools/patterns/config.js';
import { MIN_DEPTH_PCT, MIN_PATTERN_HEIGHT_PCT } from '../../tools/patterns/structural.js';

describe('MIN_CONFIDENCE', () => {
	it('主要パターン種別が定義されている', () => {
		expect(MIN_CONFIDENCE.triple_top).toBeDefined();
		expect(MIN_CONFIDENCE.double_top).toBeDefined();
		expect(MIN_CONFIDENCE.head_and_shoulders).toBeDefined();
	});

	it('値は 0-1 の範囲', () => {
		for (const v of Object.values(MIN_CONFIDENCE)) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
		}
	});
});

describe('SCHEMA_DEFAULTS', () => {
	it('既定値が正しい', () => {
		expect(SCHEMA_DEFAULTS.swingDepth).toBe(7);
		expect(SCHEMA_DEFAULTS.minBarsBetweenSwings).toBe(5);
		expect(SCHEMA_DEFAULTS.tolerancePct).toBe(0.04);
	});
});

describe('getDefaultParamsForTf', () => {
	it('1hour は swingDepth=3 を返す', () => {
		const p = getDefaultParamsForTf('1hour');
		expect(p.swingDepth).toBe(3);
		expect(p.minBarsBetweenSwings).toBe(2);
	});

	it('1day は swingDepth=6 を返す', () => {
		const p = getDefaultParamsForTf('1day');
		expect(p.swingDepth).toBe(6);
		expect(p.minBarsBetweenSwings).toBe(4);
	});

	it('1week は swingDepth=7 を返す', () => {
		const p = getDefaultParamsForTf('1week');
		expect(p.swingDepth).toBe(7);
	});

	it('不明な時間軸はフォールバックを返す', () => {
		const p = getDefaultParamsForTf('unknown');
		expect(p.swingDepth).toBe(6);
		expect(p.minBarsBetweenSwings).toBe(4);
	});

	it('分足は低い swingDepth を返す', () => {
		expect(getDefaultParamsForTf('5min').swingDepth).toBe(2);
		expect(getDefaultParamsForTf('15min').swingDepth).toBe(3);
		expect(getDefaultParamsForTf('30min').swingDepth).toBe(3);
	});
});

describe('getDefaultToleranceForTf', () => {
	it('1hour は 0.05 を返す', () => {
		expect(getDefaultToleranceForTf('1hour')).toBe(0.05);
	});

	it('1day はフォールバックの 0.04 を返す', () => {
		expect(getDefaultToleranceForTf('1day')).toBe(0.04);
	});

	it('1week は 0.035 を返す', () => {
		expect(getDefaultToleranceForTf('1week')).toBe(0.035);
	});

	it('短期足はより広い許容誤差を返す', () => {
		expect(getDefaultToleranceForTf('15min')).toBe(0.06);
	});
});

describe('getConvergenceFactorForTf', () => {
	it('短期足は 0.6 を返す', () => {
		expect(getConvergenceFactorForTf('1hour')).toBe(0.6);
		expect(getConvergenceFactorForTf('4hour')).toBe(0.6);
	});

	it('デフォルトは 0.8', () => {
		expect(getConvergenceFactorForTf('1day')).toBe(0.8);
		expect(getConvergenceFactorForTf('1week')).toBe(0.8);
	});
});

describe('getTriangleCoeffForTf', () => {
	it('短期足のcoeffを返す', () => {
		const c = getTriangleCoeffForTf('1hour');
		expect(c.flat).toBe(1.2);
		expect(c.move).toBe(0.8);
	});

	it('デフォルトのcoeffを返す', () => {
		const c = getTriangleCoeffForTf('1day');
		expect(c.flat).toBe(0.8);
		expect(c.move).toBe(1.2);
	});
});

describe('getMinFitForTf', () => {
	it('1hour は 0.6', () => {
		expect(getMinFitForTf('1hour')).toBe(0.6);
	});

	it('1day は 0.7', () => {
		expect(getMinFitForTf('1day')).toBe(0.7);
	});

	it('デフォルトは 0.75', () => {
		expect(getMinFitForTf('1week')).toBe(0.75);
	});
});

describe('getTriangleWindowSize', () => {
	it('時間軸ごとに異なるウィンドウサイズ', () => {
		expect(getTriangleWindowSize('1month')).toBe(30);
		expect(getTriangleWindowSize('1week')).toBe(40);
		expect(getTriangleWindowSize('1day')).toBe(50);
		expect(getTriangleWindowSize('1hour')).toBe(40);
	});

	it('デフォルトは 20', () => {
		expect(getTriangleWindowSize('unknown')).toBe(20);
	});
});

describe('resolveParams', () => {
	it('オプションなしで時間軸のデフォルト値を使用', () => {
		const result = resolveParams('1day', {});
		expect(result.swingDepth).toBe(6);
		expect(result.tolerancePct).toBe(0.04);
		expect(result.minBarsBetweenSwings).toBe(4);
		expect(result.headProminencePct).toBe(0.04);
		expect(result.autoScaled).toBe(true);
	});

	it('スキーマデフォルト値(7)は時間軸オートに置換', () => {
		const result = resolveParams('1hour', { swingDepth: 7 });
		expect(result.swingDepth).toBe(3); // 1hour のデフォルト
	});

	it('スキーマデフォルトでないカスタム値はそのまま使用', () => {
		const result = resolveParams('1day', { swingDepth: 10 });
		expect(result.swingDepth).toBe(10);
		expect(result.autoScaled).toBe(false);
	});

	it('tolerancePct のスキーマデフォルト(0.04)は時間軸オートに置換', () => {
		const result = resolveParams('1hour', { tolerancePct: 0.04 });
		expect(result.tolerancePct).toBe(0.05); // 1hour のデフォルト
	});

	it('カスタム tolerancePct はそのまま使用', () => {
		const result = resolveParams('1day', { tolerancePct: 0.1 });
		expect(result.tolerancePct).toBe(0.1);
	});

	// ── headProminencePct（issue #149） ──

	it('headProminencePct 未指定時は tolerancePct と同じ時間軸オート値を使う', () => {
		const result = resolveParams('1hour', {});
		expect(result.headProminencePct).toBe(0.05); // 1hour のデフォルト（tolAuto と同値）
		expect(result.tolerancePct).toBe(0.05);
	});

	it('カスタム headProminencePct はそのまま使用', () => {
		const result = resolveParams('1day', { headProminencePct: 0.02 });
		expect(result.headProminencePct).toBe(0.02);
	});

	it('tolerancePct を明示的に変えても headProminencePct には影響しない', () => {
		// issue #149: 旧実装は同じ値を共有していたため、tolerancePct を下げると
		// 意図とは逆に頭の判定が厳しくなった。分離後は tolerancePct を動かしても
		// headProminencePct（未指定なら時間軸オート値のまま）は変わらない。
		const result = resolveParams('1hour', { tolerancePct: 0.01 });
		expect(result.tolerancePct).toBe(0.01);
		expect(result.headProminencePct).toBe(0.05); // 1hour のオート値のまま
	});
});

describe('getSizeThresholdsForTf', () => {
	it('1day はアンカーで structural.ts の定数と一致する（issue #152 で据え置き）', () => {
		const t = getSizeThresholdsForTf('1day');
		expect(t.heightPct).toBe(MIN_PATTERN_HEIGHT_PCT);
		expect(t.depthPct).toBe(MIN_DEPTH_PCT);
	});

	it('1week / 1month / 未知の時間足も 1day と同値（緩める方向のみという前提）', () => {
		for (const tf of ['1week', '1month', 'unknown']) {
			expect(getSizeThresholdsForTf(tf)).toEqual({ heightPct: MIN_PATTERN_HEIGHT_PCT, depthPct: MIN_DEPTH_PCT });
		}
	});

	it('1hour は実測 ATR 比（0.57% / 2.75%）から導いた値', () => {
		expect(getSizeThresholdsForTf('1hour')).toEqual({ heightPct: 0.0062, depthPct: 0.0104 });
	});

	it('4hour は √t 推定値（4hour の ATR は未実測）', () => {
		expect(getSizeThresholdsForTf('4hour')).toEqual({ heightPct: 0.0122, depthPct: 0.0204 });
	});

	/**
	 * **これが本テーブルの不変条件。** 両方とも下限なので、時間足が短いほど値が小さく
	 * （＝緩く）なっていないと「下位時間足だけ緩める」という設計が成立しない。
	 * 1day を上回る値が 1 つでも入ると検出が減る方向に動き、issue #152 の受け入れ条件
	 * （減る方向の変化 0 件）が壊れる。
	 */
	it('短い時間足ほど緩く、1day を上回る値は無い（単調性）', () => {
		const order = ['1min', '5min', '15min', '30min', '1hour', '4hour', '8hour', '12hour', '1day'];
		const rows = order.map((tf) => getSizeThresholdsForTf(tf));
		for (let i = 1; i < rows.length; i++) {
			expect(rows[i].heightPct).toBeGreaterThan(rows[i - 1].heightPct);
			expect(rows[i].depthPct).toBeGreaterThan(rows[i - 1].depthPct);
		}
		for (const tf of [...order, '1week', '1month']) {
			expect(getSizeThresholdsForTf(tf).heightPct).toBeLessThanOrEqual(MIN_PATTERN_HEIGHT_PCT);
			expect(getSizeThresholdsForTf(tf).depthPct).toBeLessThanOrEqual(MIN_DEPTH_PCT);
		}
	});

	/**
	 * 導出は「1day を 1.0 とした ATR 比を 3% / 5% に掛ける」の 1 本だけ。
	 * 比が height と depth で割れていたら、片方だけ緩めて棄却理由が
	 * `valley_too_shallow` から `pattern_too_small` に移るだけ、という #152 の落とし穴に戻る。
	 */
	it('height と depth は同じ ATR 比から導出されている（片方だけ緩めていない）', () => {
		for (const tf of ['1min', '5min', '15min', '30min', '1hour', '4hour', '8hour', '12hour', '1day']) {
			const t = getSizeThresholdsForTf(tf);
			const heightRatio = t.heightPct / MIN_PATTERN_HEIGHT_PCT;
			const depthRatio = t.depthPct / MIN_DEPTH_PCT;
			// 0.0001 刻みに丸めた表なので、比の一致は丸め誤差の範囲で見る
			expect(Math.abs(heightRatio - depthRatio)).toBeLessThan(0.02);
		}
	});
});
