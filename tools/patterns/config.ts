import {
	HS_SHOULDER_MAX_PCT,
	MIN_DEPTH_PCT,
	MIN_PATTERN_HEIGHT_PCT,
	PRIOR_TREND_LOOKBACK_MAX,
	PRIOR_TREND_LOOKBACK_MIN,
	PRIOR_TREND_SIDEWAYS_PCT,
	type PriorTrendParams,
	type SizeThresholds,
} from './structural.js';

// triple だけなのは意図的。double / H&S には下限を置かない（#206）。
// 0.6 は detect_triples.ts の FORMING_MAX_CONFIDENCE（0.59）と、detectPatternsViewsHandler の低整合度ラベル（< 0.6）にそろえている。
export const MIN_CONFIDENCE: Record<string, number> = {
	triple_top: 0.6,
	triple_bottom: 0.6,
};

// src/schema/patterns.ts の .default() と同じ値にそろえている。
export const SCHEMA_DEFAULTS = {
	swingDepth: 7,
	minBarsBetweenSwings: 5,
	tolerancePct: 0.04,
} as const;

// lookback は時間足で伸ばさない。伸ばすと 1hour の標準窓でほぼ全候補が insufficient_data になる（#297）。
// ATR 比は 1day = 1.0 で、getSizeThresholdsForTf / getHsShoulderMaxPctForTf / getHeadProminenceForTf の表も同じ比から作っている。
// 実行時の ATR には連動させない。閾値が limit の関数になると、窓を広げたのに検出が減る（#154）。
// TODO: 1hour 以外の ATR 比は √t 推定。4hour の ATR を実測したら、この比と 3 つの表の 4hour を差し替える。
export function getPriorTrendParamsForTf(tf: string): PriorTrendParams {
	const atrScaleByTf: Record<string, number> = {
		'1min': 0.0264,
		'5min': 0.0589,
		'15min': 0.1021,
		'30min': 0.1443,
		'1hour': 0.2073,
		'4hour': 0.4082,
		'8hour': 0.5774,
		'12hour': Math.SQRT1_2,
	};
	const atrScale = atrScaleByTf[tf] ?? 1;
	const sidewaysPct = Number((PRIOR_TREND_SIDEWAYS_PCT * atrScale).toFixed(4));
	return {
		sidewaysPct,
		lookbackMin: PRIOR_TREND_LOOKBACK_MIN,
		lookbackMax: PRIOR_TREND_LOOKBACK_MAX,
	};
}

export function getDefaultParamsForTf(tf: string): { swingDepth: number; minBarsBetweenSwings: number } {
	if (tf === '1hour') return { swingDepth: 3, minBarsBetweenSwings: 2 };
	if (tf === '4hour') return { swingDepth: 5, minBarsBetweenSwings: 3 };
	if (tf === '8hour') return { swingDepth: 5, minBarsBetweenSwings: 3 };
	if (tf === '12hour') return { swingDepth: 5, minBarsBetweenSwings: 3 };
	if (tf === '1day') return { swingDepth: 6, minBarsBetweenSwings: 4 };
	if (tf === '1week') return { swingDepth: 7, minBarsBetweenSwings: 5 };
	if (tf === '1month') return { swingDepth: 8, minBarsBetweenSwings: 6 };
	if (tf === '30min') return { swingDepth: 3, minBarsBetweenSwings: 2 };
	if (tf === '15min') return { swingDepth: 3, minBarsBetweenSwings: 2 };
	if (tf === '5min') return { swingDepth: 2, minBarsBetweenSwings: 1 };
	if (tf === '1min') return { swingDepth: 2, minBarsBetweenSwings: 1 };
	return { swingDepth: 6, minBarsBetweenSwings: 4 };
}

// 短い足ほど緩いのは意図的（#244）。同水準判定の締めは getHsShoulderMaxPctForTf と MAX_LEVEL_SPREAD_RATIO が担う。
export function getDefaultToleranceForTf(tf: string): number {
	if (tf === '1hour' || tf === '4hour') return 0.05; // 5%
	if (tf === '8hour' || tf === '12hour') return 0.045; // 4.5%
	if (tf === '15min' || tf === '30min') return 0.06; // 6%
	if (tf === '1week') return 0.035; // 3.5%
	if (tf === '1month') return 0.03; // 3.0%
	return 0.04; // 1day 他
}

// double / triple / H&S で値を分けない（#139）。
export function getSizeThresholdsForTf(tf: string): SizeThresholds {
	if (tf === '1min') return { heightPct: 0.0008, depthPct: 0.0013 };
	if (tf === '5min') return { heightPct: 0.0018, depthPct: 0.0029 };
	if (tf === '15min') return { heightPct: 0.0031, depthPct: 0.0051 };
	if (tf === '30min') return { heightPct: 0.0043, depthPct: 0.0072 };
	if (tf === '1hour') return { heightPct: 0.0062, depthPct: 0.0104 };
	if (tf === '4hour') return { heightPct: 0.0122, depthPct: 0.0204 }; // 推定（4hour の ATR は未実測）
	if (tf === '8hour') return { heightPct: 0.0173, depthPct: 0.0289 };
	if (tf === '12hour') return { heightPct: 0.0212, depthPct: 0.0354 };
	// 1week / 1month は √t で伸ばすと締まる方向になるので、1day の値を据え置く（#152）。
	return { heightPct: MIN_PATTERN_HEIGHT_PCT, depthPct: MIN_DEPTH_PCT };
}

// 値が getSizeThresholdsForTf の depthPct と一致するのは偶然。測る量も極性も違うので流用しない。
export function getHsShoulderMaxPctForTf(tf: string): number {
	if (tf === '1min') return 0.0013;
	if (tf === '5min') return 0.0029;
	if (tf === '15min') return 0.0051;
	if (tf === '30min') return 0.0072;
	if (tf === '1hour') return 0.0104;
	if (tf === '4hour') return 0.0204; // 推定（4hour の ATR は未実測。getSizeThresholdsForTf と同じ限界）
	if (tf === '8hour') return 0.0289;
	if (tf === '12hour') return 0.0354;
	return HS_SHOULDER_MAX_PCT;
}

const HEAD_PROMINENCE_PCT = 0.04;

// getDefaultToleranceForTf とは向きが逆（大きいほど厳しい）なので流用しない（#198）。
export function getHeadProminenceForTf(tf: string): number {
	if (tf === '1min') return 0.0011;
	if (tf === '5min') return 0.0024;
	if (tf === '15min') return 0.0041;
	if (tf === '30min') return 0.0058;
	if (tf === '1hour') return 0.0083;
	if (tf === '4hour') return 0.0163; // 推定（4hour の ATR は未実測。getSizeThresholdsForTf と同じ限界）
	if (tf === '8hour') return 0.0231;
	if (tf === '12hour') return 0.0283;
	return HEAD_PROMINENCE_PCT;
}

export function getConvergenceFactorForTf(tf: string): number {
	if (tf === '1hour' || tf === '4hour' || tf === '15min' || tf === '30min') return 0.6;
	return 0.8; // default
}

export function getTriangleCoeffForTf(tf: string): { flat: number; move: number } {
	if (tf === '1hour' || tf === '4hour') return { flat: 1.2, move: 0.8 };
	return { flat: 0.8, move: 1.2 };
}

export function getMinFitForTf(tf: string): number {
	if (tf === '1hour' || tf === '4hour') return 0.6;
	if (tf === '1day') return 0.7;
	return 0.75;
}

export function getTriangleWindowSize(tf: string): number {
	if (tf === '1month') return 30;
	if (tf === '1week') return 40;
	if (tf === '1day') return 50;
	if (tf === '4hour') return 30;
	if (tf === '1hour') return 40;
	if (tf === '30min') return 30;
	if (tf === '15min') return 30;
	return 20;
}

// auto は「未指定」と「スキーマ既定値の明示指定」を区別しない。.default() で届く値が同じになるため（#182）。
export type ParamSource = 'auto' | 'explicit';

export interface ResolvedParamSources {
	swingDepth: ParamSource;
	tolerancePct: ParamSource;
	minBarsBetweenSwings: ParamSource;
	headProminencePct: ParamSource;
}

export function resolveParams(
	tf: string,
	opts: Partial<{
		swingDepth: number;
		tolerancePct: number;
		minBarsBetweenSwings: number;
		headProminencePct: number;
	}>,
): {
	swingDepth: number;
	tolerancePct: number;
	minBarsBetweenSwings: number;
	headProminencePct: number;
	sources: ResolvedParamSources;
} {
	const auto = getDefaultParamsForTf(tf);
	const tolAuto = getDefaultToleranceForTf(tf);
	const headProminenceAuto = getHeadProminenceForTf(tf);

	const swingDepthExplicit =
		Number.isFinite(opts.swingDepth as number) && (opts.swingDepth as number) !== SCHEMA_DEFAULTS.swingDepth;
	const swingDepth = swingDepthExplicit ? (opts.swingDepth as number) : auto.swingDepth;

	// swingDepth と述語をそろえない。Number.isFinite にすると Infinity の扱いが変わり実効値が動く。
	const tolerancePctExplicit =
		typeof opts.tolerancePct === 'number' &&
		!Number.isNaN(opts.tolerancePct) &&
		opts.tolerancePct !== SCHEMA_DEFAULTS.tolerancePct;
	const tolerancePct = tolerancePctExplicit ? (opts.tolerancePct as number) : tolAuto;

	const minBarsExplicit =
		Number.isFinite(opts.minBarsBetweenSwings as number) &&
		(opts.minBarsBetweenSwings as number) !== SCHEMA_DEFAULTS.minBarsBetweenSwings;
	const minBarsBetweenSwings = minBarsExplicit ? (opts.minBarsBetweenSwings as number) : auto.minBarsBetweenSwings;

	// headProminencePct だけはスキーマに .default() が無いので、既定値との比較をしない。
	const headProminenceExplicit = typeof opts.headProminencePct === 'number' && !Number.isNaN(opts.headProminencePct);
	const headProminencePct = headProminenceExplicit ? (opts.headProminencePct as number) : headProminenceAuto;

	return {
		swingDepth,
		tolerancePct,
		minBarsBetweenSwings,
		headProminencePct,
		sources: {
			swingDepth: swingDepthExplicit ? 'explicit' : 'auto',
			tolerancePct: tolerancePctExplicit ? 'explicit' : 'auto',
			minBarsBetweenSwings: minBarsExplicit ? 'explicit' : 'auto',
			headProminencePct: headProminenceExplicit ? 'explicit' : 'auto',
		},
	};
}
