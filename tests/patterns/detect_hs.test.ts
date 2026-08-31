import { afterEach, describe, expect, it, vi } from 'vitest';
import { dayjs } from '../../lib/datetime.js';
import { getDefaultToleranceForTf, getSizeThresholdsForTf } from '../../tools/patterns/config.js';
import { detectHeadAndShoulders } from '../../tools/patterns/detect_hs.js';
import { linearRegressionWithR2 } from '../../tools/patterns/regression.js';
import type { Pivot } from '../../tools/patterns/swing.js';
import type { CandleData, DetectContext } from '../../tools/patterns/types.js';

// ── ヘルパー ──

function iso(daysAgo: number): string {
	return dayjs().subtract(daysAgo, 'day').startOf('day').toISOString();
}

function mkCandle(daysAgo: number, o: number, h: number, l: number, c: number): CandleData {
	return { open: o, high: h, low: l, close: c, isoTime: iso(daysAgo) };
}

function buildCtx(opts: {
	candles: CandleData[];
	pivots: Pivot[];
	allPeaks?: Pivot[];
	allValleys?: Pivot[];
	tolerancePct?: number;
	/**
	 * 既定は tolerancePct に連動させず独立に 0.04（config.ts の時間軸オート表で '1day' に相当）とする。
	 * 本番の resolveParams も「未指定なら headProminencePct は tolerancePct とは無関係に時間軸オート値」
	 * という解決なので、ここで tolerancePct へフォールバックすると本番と違う結合を再現してしまう
	 * （issue #149 が解消した結合そのもの）。tolerancePct と headProminencePct の相互作用を見たい
	 * テストは両方を明示的に渡すこと（buildIssue146Ctx 等）。
	 */
	headProminencePct?: number;
	want?: Set<string>;
	includeForming?: boolean;
	type?: string;
}): DetectContext {
	const tol = opts.tolerancePct ?? 0.04;
	const headProm = opts.headProminencePct ?? 0.04;
	return {
		candles: opts.candles,
		pivots: opts.pivots,
		allPeaks: opts.allPeaks ?? opts.pivots.filter((p) => p.kind === 'H'),
		allValleys: opts.allValleys ?? opts.pivots.filter((p) => p.kind === 'L'),
		tolerancePct: tol,
		headProminencePct: headProm,
		sizeThresholds: getSizeThresholdsForTf(opts.type ?? '1day'),
		minDist: 5,
		want: opts.want ?? new Set(),
		includeForming: opts.includeForming ?? false,
		debugCandidates: [],
		type: opts.type ?? '1day',
		swingDepth: 7,
		near: (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * tol,
		pct: (a: number, b: number) => ((b - a) / Math.max(1, a)) * 100,
		lrWithR2: (pts) => linearRegressionWithR2(pts),
	};
}

/**
 * H&S ピボット: H(idx=0) → L(idx=15) → H(idx=30) → L(idx=45) → H(idx=60)
 * 左右の肩が等高、頭が高い
 */
function buildHS(opts?: {
	leftShoulder?: number;
	head?: number;
	rightShoulder?: number;
	valley1?: number;
	valley2?: number;
}) {
	const ls = opts?.leftShoulder ?? 100;
	const hd = opts?.head ?? 130;
	const rs = opts?.rightShoulder ?? 100;
	const v1 = opts?.valley1 ?? 85;
	const v2 = opts?.valley2 ?? 85;

	const candles: CandleData[] = [];
	for (let i = 0; i < 70; i++) candles.push(mkCandle(70 - i, 90, 95, 80, 90));
	candles[0] = mkCandle(70, ls - 1, ls, ls - 3, ls - 1);
	candles[15] = mkCandle(55, v1 + 1, v1 + 3, v1, v1 + 1);
	candles[30] = mkCandle(40, hd - 1, hd, hd - 3, hd - 1);
	candles[45] = mkCandle(25, v2 + 1, v2 + 3, v2, v2 + 1);
	candles[60] = mkCandle(10, rs - 1, rs, rs - 3, rs - 1);

	const pivots: Pivot[] = [
		{ idx: 0, price: ls, kind: 'H', extremePrice: ls },
		{ idx: 15, price: v1, kind: 'L', extremePrice: v1 },
		{ idx: 30, price: hd, kind: 'H', extremePrice: hd },
		{ idx: 45, price: v2, kind: 'L', extremePrice: v2 },
		{ idx: 60, price: rs, kind: 'H', extremePrice: rs },
	];

	return { candles, pivots };
}

/**
 * Inverse H&S ピボット: L(idx=0) → H(idx=15) → L(idx=30) → H(idx=45) → L(idx=60)
 * 左右の肩が等安、頭が低い
 */
function buildInverseHS(opts?: {
	leftShoulder?: number;
	head?: number;
	rightShoulder?: number;
	peak1?: number;
	peak2?: number;
}) {
	const ls = opts?.leftShoulder ?? 100;
	const hd = opts?.head ?? 70;
	const rs = opts?.rightShoulder ?? 100;
	const p1 = opts?.peak1 ?? 115;
	const p2 = opts?.peak2 ?? 115;

	const candles: CandleData[] = [];
	for (let i = 0; i < 70; i++) candles.push(mkCandle(70 - i, 90, 95, 80, 90));
	candles[0] = mkCandle(70, ls + 1, ls + 3, ls, ls + 1);
	candles[15] = mkCandle(55, p1 - 1, p1, p1 - 3, p1 - 1);
	candles[30] = mkCandle(40, hd + 1, hd + 3, hd, hd + 1);
	candles[45] = mkCandle(25, p2 - 1, p2, p2 - 3, p2 - 1);
	candles[60] = mkCandle(10, rs + 1, rs + 3, rs, rs + 1);

	const pivots: Pivot[] = [
		{ idx: 0, price: ls, kind: 'L', extremePrice: ls },
		{ idx: 15, price: p1, kind: 'H', extremePrice: p1 },
		{ idx: 30, price: hd, kind: 'L', extremePrice: hd },
		{ idx: 45, price: p2, kind: 'H', extremePrice: p2 },
		{ idx: 60, price: rs, kind: 'L', extremePrice: rs },
	];

	return { candles, pivots };
}

/**
 * H&S 構造の後にネックライン下抜けを付与したフィクスチャ。
 * - 構造: H(0)-L(15)-H(30)-L(45)-H(60) で buildHS と同じ。
 * - 右肩(idx=60) 後の `breakIdx` 以降を `breakClose` に書き換えてネックライン下抜け。
 * - `postBreakLow` を指定すると、ブレイク後の特定 idx の low を強制し、target 到達テスト用。
 */
function buildHsWithBreakout(opts?: {
	breakIdx?: number;
	breakClose?: number;
	postBreakLow?: number;
	postBreakIdx?: number;
	totalBars?: number;
}) {
	const ls = 100;
	const hd = 130;
	const rs = 100;
	const v1 = 85;
	const v2 = 85;
	const total = opts?.totalBars ?? 80;
	const breakIdx = opts?.breakIdx ?? 65;
	// neckline (v1+v2)/2 = 85; close 80 は 85*(1-0.015)=83.725 を下回る → ブレイク
	const breakClose = opts?.breakClose ?? 80;

	const candles: CandleData[] = [];
	for (let i = 0; i < total; i++) candles.push(mkCandle(total - i, 90, 95, 80, 90));
	candles[0] = mkCandle(total, ls - 1, ls, ls - 3, ls - 1);
	candles[15] = mkCandle(total - 15, v1 + 1, v1 + 3, v1, v1 + 1);
	candles[30] = mkCandle(total - 30, hd - 1, hd, hd - 3, hd - 1);
	candles[45] = mkCandle(total - 45, v2 + 1, v2 + 3, v2, v2 + 1);
	candles[60] = mkCandle(total - 60, rs - 1, rs, rs - 3, rs - 1);
	for (let i = breakIdx; i < total; i++) {
		candles[i] = mkCandle(total - i, breakClose + 2, breakClose + 5, breakClose - 3, breakClose);
	}
	// target 到達検証用に、特定 idx で low を強制
	if (opts?.postBreakLow !== undefined && opts?.postBreakIdx !== undefined) {
		const idx = opts.postBreakIdx;
		const lo = opts.postBreakLow;
		candles[idx] = mkCandle(total - idx, lo + 3, lo + 5, lo, lo + 1);
	}

	const pivots: Pivot[] = [
		{ idx: 0, price: ls, kind: 'H', extremePrice: ls },
		{ idx: 15, price: v1, kind: 'L', extremePrice: v1 },
		{ idx: 30, price: hd, kind: 'H', extremePrice: hd },
		{ idx: 45, price: v2, kind: 'L', extremePrice: v2 },
		{ idx: 60, price: rs, kind: 'H', extremePrice: rs },
	];

	return { candles, pivots };
}

/**
 * Inverse H&S 構造の後にネックライン上抜けを付与したフィクスチャ。
 * - 構造: L(0)-H(15)-L(30)-H(45)-L(60) で buildInverseHS と同じ。
 * - 右肩(idx=60) 後の `breakIdx` 以降を `breakClose` に書き換えてネックライン上抜け。
 * - `postBreakHigh` を指定すると、ブレイク後の特定 idx の high を強制し、target 到達テスト用。
 */
function buildInverseHsWithBreakout(opts?: {
	breakIdx?: number;
	breakClose?: number;
	postBreakHigh?: number;
	postBreakIdx?: number;
	totalBars?: number;
}) {
	const ls = 100;
	const hd = 70;
	const rs = 100;
	const p1 = 115;
	const p2 = 115;
	const total = opts?.totalBars ?? 80;
	const breakIdx = opts?.breakIdx ?? 65;
	// neckline (p1+p2)/2 = 115; close 120 は 115*(1+0.015)=116.725 を上回る → ブレイク
	const breakClose = opts?.breakClose ?? 120;

	const candles: CandleData[] = [];
	for (let i = 0; i < total; i++) candles.push(mkCandle(total - i, 90, 95, 80, 90));
	candles[0] = mkCandle(total, ls + 1, ls + 3, ls, ls + 1);
	candles[15] = mkCandle(total - 15, p1 - 1, p1, p1 - 3, p1 - 1);
	candles[30] = mkCandle(total - 30, hd + 1, hd + 3, hd, hd + 1);
	candles[45] = mkCandle(total - 45, p2 - 1, p2, p2 - 3, p2 - 1);
	candles[60] = mkCandle(total - 60, rs + 1, rs + 3, rs, rs + 1);
	for (let i = breakIdx; i < total; i++) {
		candles[i] = mkCandle(total - i, breakClose - 2, breakClose + 3, breakClose - 5, breakClose);
	}
	if (opts?.postBreakHigh !== undefined && opts?.postBreakIdx !== undefined) {
		const idx = opts.postBreakIdx;
		const hi = opts.postBreakHigh;
		candles[idx] = mkCandle(total - idx, hi - 5, hi, hi - 6, hi - 1);
	}

	const pivots: Pivot[] = [
		{ idx: 0, price: ls, kind: 'L', extremePrice: ls },
		{ idx: 15, price: p1, kind: 'H', extremePrice: p1 },
		{ idx: 30, price: hd, kind: 'L', extremePrice: hd },
		{ idx: 45, price: p2, kind: 'H', extremePrice: p2 },
		{ idx: 60, price: rs, kind: 'L', extremePrice: rs },
	];

	return { candles, pivots };
}

afterEach(() => {
	vi.resetAllMocks();
});

describe('detectHeadAndShoulders', () => {
	// ── H&S（完成済み） ──────────────────────────────────────

	it('H-L-H-L-H ピボット → head_and_shoulders 検出', () => {
		const { candles, pivots } = buildHS();
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.filter((p) => p.type === 'head_and_shoulders');
		expect(hs.length).toBeGreaterThanOrEqual(1);
		expect(hs[0]?.confidence).toBeGreaterThan(0);
		expect(hs[0]?.neckline).toBeDefined();
		expect(hs[0]?.breakoutTarget).toBeDefined();
		expect(hs[0]?.targetMethod).toBe('neckline_projection');
		expect(result.found?.head_and_shoulders).toBe(true);
	});

	it('H&S のターゲット価格 = neckline - (head - neckline)', () => {
		// nlAvg=(85+85)/2=85, head=130, target=85-(130-85)=40
		const { candles, pivots } = buildHS({ head: 130, valley1: 85, valley2: 85 });
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.find((p) => p.type === 'head_and_shoulders');
		expect(hs?.breakoutTarget).toBe(40);
	});

	it('頭が両肩より高くない → head_not_higher で rejected', () => {
		// head=103, shoulders=100 → 103 > 100*(1+headProminencePct=0.04)=104? No（tolerancePct は無関係。issue #149）
		const { candles, pivots } = buildHS({ head: 103 });
		const ctx = buildCtx({ candles, pivots });
		detectHeadAndShoulders(ctx);

		const rejected = ctx.debugCandidates.find(
			(d) => d.type === 'head_and_shoulders' && d.accepted === false && d.reason === 'head_not_higher',
		);
		expect(rejected).toBeDefined();
	});

	it('両肩が離れすぎ → shoulders_not_near:both で rejected', () => {
		// left=100, right=120 → |20|/120=0.167 > tolerancePct(0.04) かつ > HS_SHOULDER_MAX_PCT(0.05)
		// → どちらを緩めても通らないので :both（issue #172）
		const { candles, pivots } = buildHS({ leftShoulder: 100, rightShoulder: 120 });
		const ctx = buildCtx({ candles, pivots });
		detectHeadAndShoulders(ctx);

		const rejected = ctx.debugCandidates.find(
			(d) => d.type === 'head_and_shoulders' && d.accepted === false && d.reason === 'shoulders_not_near:both',
		);
		expect(rejected).toBeDefined();
	});

	it('ピボット間隔 < minDist → H&S スキップ', () => {
		// 間隔3本 < minDist(5)
		const candles: CandleData[] = Array.from({ length: 20 }, (_, i) => mkCandle(20 - i, 90, 95, 85, 90));
		candles[0] = mkCandle(20, 99, 100, 97, 99);
		candles[3] = mkCandle(17, 84, 86, 83, 84);
		candles[6] = mkCandle(14, 129, 130, 127, 129);
		candles[9] = mkCandle(11, 84, 86, 83, 84);
		candles[12] = mkCandle(8, 99, 100, 97, 99);

		const pivots: Pivot[] = [
			{ idx: 0, price: 100, kind: 'H', extremePrice: 100 },
			{ idx: 3, price: 85, kind: 'L', extremePrice: 85 },
			{ idx: 6, price: 130, kind: 'H', extremePrice: 130 },
			{ idx: 9, price: 85, kind: 'L', extremePrice: 85 },
			{ idx: 12, price: 100, kind: 'H', extremePrice: 100 },
		];
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.filter((p) => p.type === 'head_and_shoulders');
		expect(hs).toHaveLength(0);
	});

	// ── Inverse H&S（完成済み） ──────────────────────────────

	it('L-H-L-H-L ピボット → inverse_head_and_shoulders 検出', () => {
		const { candles, pivots } = buildInverseHS();
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const ihs = result.patterns.filter((p) => p.type === 'inverse_head_and_shoulders');
		expect(ihs.length).toBeGreaterThanOrEqual(1);
		expect(ihs[0]?.confidence).toBeGreaterThan(0);
		expect(ihs[0]?.neckline).toBeDefined();
		expect(ihs[0]?.breakoutTarget).toBeDefined();
		expect(ihs[0]?.targetMethod).toBe('neckline_projection');
		expect(result.found?.inverse_head_and_shoulders).toBe(true);
	});

	it('Inverse H&S ターゲット価格 = neckline + (neckline - head)', () => {
		// ihsNlAvg=(115+115)/2=115, head=70, target=115+(115-70)=160
		const { candles, pivots } = buildInverseHS({ head: 70, peak1: 115, peak2: 115 });
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const ihs = result.patterns.find((p) => p.type === 'inverse_head_and_shoulders');
		expect(ihs?.breakoutTarget).toBe(160);
	});

	it('頭が両肩より低くない → head_not_lower で rejected', () => {
		// head=97, shoulders=100 → 97 < 100*(1-headProminencePct=0.04)=96? No (97 > 96)（tolerancePct は無関係。issue #149）
		const { candles, pivots } = buildInverseHS({ head: 97 });
		const ctx = buildCtx({ candles, pivots });
		detectHeadAndShoulders(ctx);

		const rejected = ctx.debugCandidates.find(
			(d) => d.type === 'inverse_head_and_shoulders' && d.accepted === false && d.reason === 'head_not_lower',
		);
		expect(rejected).toBeDefined();
	});

	// ── want フィルタ ────────────────────────────────────────

	it('want に head_and_shoulders のみ → inverse はスキップ', () => {
		// Inverse パターンのデータを使う。want に head_and_shoulders のみ指定
		const { candles, pivots } = buildInverseHS();
		const ctx = buildCtx({ candles, pivots, want: new Set(['head_and_shoulders']) });
		const result = detectHeadAndShoulders(ctx);

		const ihs = result.patterns.filter((p) => p.type === 'inverse_head_and_shoulders');
		expect(ihs).toHaveLength(0);
	});

	it('want に inverse_head_and_shoulders のみ → H&S はスキップ', () => {
		const { candles, pivots } = buildHS();
		const ctx = buildCtx({ candles, pivots, want: new Set(['inverse_head_and_shoulders']) });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.filter((p) => p.type === 'head_and_shoulders');
		expect(hs).toHaveLength(0);
	});

	// ── Relaxed fallback ─────────────────────────────────────

	it('strict 不検出 → relaxed H&S (x1.6) でフォールバック検出', () => {
		// left=100, right=105 → diff/max=5/105=0.0476
		//   > strict(0.04)                  → strict は shoulders_not_near:tolerance で弾かれる
		//   <= relaxed(0.04*1.6=0.064)      → relaxed の肩許容に収まる
		//   <= HS_SHOULDER_MAX_PCT(0.05)    → relaxed でも効く hard cap を超えない
		// relaxed の許容幅は hard cap で頭打ちになるため、cap 超えの差（旧 106）では
		// relaxed も必ず落ちる（下の HS_SHOULDER_MAX_PCT テストがその境界を固定している）。
		const { candles, pivots } = buildHS({ leftShoulder: 100, rightShoulder: 105, head: 130 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.filter((p) => p.type === 'head_and_shoulders');
		expect(hs.length).toBeGreaterThan(0);
		expect(hs[0]?._fallback).toMatch(/relaxed_hs/);
		// strict パスで一度弾かれてから relaxed に落ちたことを確認する。
		// **ここは前置一致**——本テストの主題は relaxed フォールバックであって、肩がどちらの
		// conjunct で落ちたか（#172 の接尾辞）ではない。接尾辞を増やしても壊さない。
		const strictRejected = ctx.debugCandidates.some(
			(d) => d.type === 'head_and_shoulders' && (d.reason ?? '').startsWith('shoulders_not_near'),
		);
		expect(strictRejected).toBe(true);
	});

	it('strict 不検出 → relaxed Inverse H&S でフォールバック検出', () => {
		// shoulders=100,105: diff/max=5/105=0.0476 > strict(0.04)、
		// かつ relaxed(0.064) / HS_SHOULDER_MAX_PCT(0.05) の双方に収まる。
		const { candles, pivots } = buildInverseHS({ leftShoulder: 100, rightShoulder: 105, head: 70 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		const result = detectHeadAndShoulders(ctx);

		const ihs = result.patterns.filter((p) => p.type === 'inverse_head_and_shoulders');
		expect(ihs.length).toBeGreaterThan(0);
		expect(ihs[0]?._fallback).toMatch(/relaxed_ihs/);
		// 前置一致の理由は上の H&S 版と同じ（主題は relaxed フォールバック）。
		const strictRejected = ctx.debugCandidates.some(
			(d) => d.type === 'inverse_head_and_shoulders' && (d.reason ?? '').startsWith('shoulders_not_near'),
		);
		expect(strictRejected).toBe(true);
	});

	// ── shoulders_not_near の conjunct 分割（issue #172） ──
	//
	// 肩の判定は `near(tolerancePct)` と `isSameLevel(HS_SHOULDER_MAX_PCT)` の AND で、
	// 実効閾値は `min(tolerancePct, HS_SHOULDER_MAX_PCT)`。棄却理由が 1 種類しか無かったため
	// `view=debug` を reason で集計するとどちらで落ちたか消えていた（#152 / #167 の誤診の原因）。

	it('H&S: tolerancePct のみ超過 → shoulders_not_near:tolerance', () => {
		// left=100, right=104.5 → 4.5/104.5 ≈ 0.0431
		//   > tolerancePct(0.04)          → near() で fail
		//   <= HS_SHOULDER_MAX_PCT(0.05)  → isSameLevel は通る
		const { candles, pivots } = buildHS({ leftShoulder: 100, rightShoulder: 104.5, head: 130 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		detectHeadAndShoulders(ctx);

		const rejected = ctx.debugCandidates.find(
			(d) => d.type === 'head_and_shoulders' && d.accepted === false && d.reason?.startsWith('shoulders_not_near'),
		);
		expect(rejected?.reason).toBe('shoulders_not_near:tolerance');
		// details は分割前と同じ 3 値を持つ（#172 は reason 文字列だけの変更）
		const details = rejected?.details as Record<string, unknown> | undefined;
		expect(details?.tolerancePct).toBe(0.04);
		expect(details?.shoulderMaxPct).toBe(0.05);
		expect(details?.shouldersDiffPct).toBeCloseTo(4.5 / 104.5, 6);
	});

	it('Inverse H&S: tolerancePct のみ超過 → shoulders_not_near:tolerance', () => {
		const { candles, pivots } = buildInverseHS({ leftShoulder: 100, rightShoulder: 104.5, head: 70 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		detectHeadAndShoulders(ctx);

		const rejected = ctx.debugCandidates.find(
			(d) =>
				d.type === 'inverse_head_and_shoulders' && d.accepted === false && d.reason?.startsWith('shoulders_not_near'),
		);
		expect(rejected?.reason).toBe('shoulders_not_near:tolerance');
	});

	it('H&S: HS_SHOULDER_MAX_PCT のみ超過 → shoulders_not_near:cap（15min の tf-auto 許容）', () => {
		// `:cap` は `tolerancePct > HS_SHOULDER_MAX_PCT` のときしか成立しない。tf-auto で
		// そうなるのは 15min / 30min（0.06 > 0.05）だけなので、マジックナンバーではなく
		// tf-auto 表から引く（1day / 1hour では構造上この理由コードを発火させられない）。
		const tol15min = getDefaultToleranceForTf('15min');
		expect(tol15min).toBeGreaterThan(0.05);
		// left=100, right=105.5 → 5.5/105.5 ≈ 0.0521
		//   <= tolerancePct(0.06)        → near() は通る
		//   > HS_SHOULDER_MAX_PCT(0.05)  → isSameLevel で fail
		const { candles, pivots } = buildHS({ leftShoulder: 100, rightShoulder: 105.5, head: 130 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: tol15min });
		detectHeadAndShoulders(ctx);

		const rejected = ctx.debugCandidates.find(
			(d) => d.type === 'head_and_shoulders' && d.accepted === false && d.reason?.startsWith('shoulders_not_near'),
		);
		expect(rejected?.reason).toBe('shoulders_not_near:cap');
	});

	it('Inverse H&S: HS_SHOULDER_MAX_PCT のみ超過 → shoulders_not_near:cap（30min の tf-auto 許容）', () => {
		const tol30min = getDefaultToleranceForTf('30min');
		expect(tol30min).toBeGreaterThan(0.05);
		const { candles, pivots } = buildInverseHS({ leftShoulder: 100, rightShoulder: 105.5, head: 70 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: tol30min });
		detectHeadAndShoulders(ctx);

		const rejected = ctx.debugCandidates.find(
			(d) =>
				d.type === 'inverse_head_and_shoulders' && d.accepted === false && d.reason?.startsWith('shoulders_not_near'),
		);
		expect(rejected?.reason).toBe('shoulders_not_near:cap');
	});

	it('H&S: 両方超過 → shoulders_not_near:both（どちらを緩めても通らない）', () => {
		// left=100, right=112 → 12/112 ≈ 0.1071 → tolerancePct(0.04) も cap(0.05) も超過
		const { candles, pivots } = buildHS({ leftShoulder: 100, rightShoulder: 112, head: 145 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		detectHeadAndShoulders(ctx);

		const rejected = ctx.debugCandidates.find(
			(d) => d.type === 'head_and_shoulders' && d.accepted === false && d.reason?.startsWith('shoulders_not_near'),
		);
		expect(rejected?.reason).toBe('shoulders_not_near:both');
	});

	it('Inverse H&S: 両方超過 → shoulders_not_near:both', () => {
		const { candles, pivots } = buildInverseHS({ leftShoulder: 100, rightShoulder: 112, head: 60 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		detectHeadAndShoulders(ctx);

		const rejected = ctx.debugCandidates.find(
			(d) =>
				d.type === 'inverse_head_and_shoulders' && d.accepted === false && d.reason?.startsWith('shoulders_not_near'),
		);
		expect(rejected?.reason).toBe('shoulders_not_near:both');
	});

	it('接尾辞なしの shoulders_not_near は積まれない / tolerancePct <= cap では :cap も出ない', () => {
		// 右肩を掃引して strict 経路の肩棄却を集め、(a) 旧コードが残っていないこと、
		// (b) `tolerancePct <= HS_SHOULDER_MAX_PCT` では `:cap` が構造上発火しないことを固定する。
		const seen = new Set<string>();
		for (const rightShoulder of [100, 102, 104, 104.5, 105, 105.5, 106, 108, 112, 120, 135]) {
			for (const tolerancePct of [0.03, 0.04, 0.05]) {
				for (const build of [buildHS, buildInverseHS]) {
					const isTop = build === buildHS;
					const { candles, pivots } = build({ leftShoulder: 100, rightShoulder, head: isTop ? 145 : 60 });
					const ctx = buildCtx({ candles, pivots, tolerancePct });
					detectHeadAndShoulders(ctx);
					for (const d of ctx.debugCandidates) {
						const reason = d.reason ?? '';
						if (reason.startsWith('shoulders_not_near')) seen.add(reason);
					}
				}
			}
		}
		expect(seen.has('shoulders_not_near')).toBe(false);
		expect(seen.has('shoulders_not_near:cap')).toBe(false);
		expect([...seen].sort()).toEqual(['shoulders_not_near:both', 'shoulders_not_near:tolerance']);
	});

	// ── HS_SHOULDER_MAX_PCT hard cap（PR: shoulder cap 配線） ──

	it('H&S: tolerancePct=0.06 でも肩 ±6%（HS_SHOULDER_MAX_PCT 超過）なら検出しない', () => {
		// left=100, right=106 → diff/max = 6/106 ≈ 0.0566 → > 0.05 cap だが ≤ 0.06 tolerancePct
		// strict near() は通るが isSameLevel(.., 0.05) で弾かれる
		const { candles, pivots } = buildHS({ leftShoulder: 100, rightShoulder: 106, head: 130 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.06 });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.filter((p) => p.type === 'head_and_shoulders');
		expect(hs).toHaveLength(0);

		// tolerancePct(0.06) は通り HS_SHOULDER_MAX_PCT(0.05) だけ超えるので :cap。
		// **本テストの主題が cap 境界そのもの**なので接尾辞まで固定する（issue #172）。
		const rejected = ctx.debugCandidates.find(
			(d) => d.type === 'head_and_shoulders' && d.accepted === false && d.reason === 'shoulders_not_near:cap',
		);
		expect(rejected).toBeDefined();
		const details = rejected?.details as Record<string, unknown> | undefined;
		expect(details?.shoulderMaxPct).toBe(0.05);
		expect(details?.shouldersDiffPct).toBeCloseTo(6 / 106, 6);
	});

	it('Inverse H&S: tolerancePct=0.06 でも肩 ±6%（HS_SHOULDER_MAX_PCT 超過）なら検出しない', () => {
		const { candles, pivots } = buildInverseHS({ leftShoulder: 100, rightShoulder: 106, head: 70 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.06 });
		const result = detectHeadAndShoulders(ctx);

		const ihs = result.patterns.filter((p) => p.type === 'inverse_head_and_shoulders');
		expect(ihs).toHaveLength(0);

		// tolerancePct(0.06) は通り HS_SHOULDER_MAX_PCT(0.05) だけ超えるので :cap。
		// **本テストの主題が cap 境界そのもの**なので接尾辞まで固定する（issue #172）。
		const rejected = ctx.debugCandidates.find(
			(d) => d.type === 'inverse_head_and_shoulders' && d.accepted === false && d.reason === 'shoulders_not_near:cap',
		);
		expect(rejected).toBeDefined();
		const details = rejected?.details as Record<string, unknown> | undefined;
		expect(details?.shoulderMaxPct).toBe(0.05);
		expect(details?.shouldersDiffPct).toBeCloseTo(6 / 106, 6);
	});

	it('H&S: relaxed fallback でも肩 ±5% を超える候補は検出しない', () => {
		// left=100, right=106: strict(0.04) は near() で fail → relaxed パスに落ちる
		// relaxed factor.shoulder=2.0 で 0.04*2.0=0.08 → 0.0566 ≤ 0.08 で通過していたが
		// isSameLevel(100, 106, 0.05) で hard reject される
		const { candles, pivots } = buildHS({ leftShoulder: 100, rightShoulder: 106, head: 130 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.filter((p) => p.type === 'head_and_shoulders');
		expect(hs).toHaveLength(0);
	});

	it('Inverse H&S: relaxed fallback でも肩 ±5% を超える候補は検出しない', () => {
		const { candles, pivots } = buildInverseHS({ leftShoulder: 100, rightShoulder: 106, head: 70 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		const result = detectHeadAndShoulders(ctx);

		const ihs = result.patterns.filter((p) => p.type === 'inverse_head_and_shoulders');
		expect(ihs).toHaveLength(0);
	});

	it('H&S: strict 経路で肩差 5% 以内なら引き続き検出される（非退行）', () => {
		// left=100, right=104 → diff/max = 4/104 ≈ 0.0385 → < 0.05 cap, < 0.04 tolerancePct
		const { candles, pivots } = buildHS({ leftShoulder: 100, rightShoulder: 104, head: 130 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.filter((p) => p.type === 'head_and_shoulders');
		expect(hs.length).toBeGreaterThanOrEqual(1);
		expect(hs[0]?._fallback).toBeUndefined();
	});

	it('Inverse H&S: strict 経路で肩差 5% 以内なら引き続き検出される（非退行）', () => {
		const { candles, pivots } = buildInverseHS({ leftShoulder: 100, rightShoulder: 104, head: 70 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		const result = detectHeadAndShoulders(ctx);

		const ihs = result.patterns.filter((p) => p.type === 'inverse_head_and_shoulders');
		expect(ihs.length).toBeGreaterThanOrEqual(1);
		expect(ihs[0]?._fallback).toBeUndefined();
	});

	// ── relaxed 経路の肩落ち（issue #174） ──
	//
	// relaxed は `near()` を呼ばず `tolerancePct * factors.shoulder` をインラインで比較する。
	// 実効閾値は `min(tolerancePct * factors.shoulder, HS_SHOULDER_MAX_PCT)` で、
	// **既定パスではほぼ全時間足で HS_SHOULDER_MAX_PCT が律速する**（strict と逆）。
	// #173 以前は肩で落ちた窓に何も積んでいなかったため、`view=debug` の集計に relaxed が
	// 1 件も映らず、`:cap` 実測 0 件（#167）が strict の観測だと分からなくなっていた。

	it('H&S relaxed: HS_SHOULDER_MAX_PCT のみ超過 → relaxed_shoulders_not_near:cap', () => {
		// left=100, right=106.5 → diff/max = 6.5/106.5 ≈ 0.0610
		//   <= tolerancePct * 2.0 = 0.08  → relaxed の tolerance は通る
		//   >  HS_SHOULDER_MAX_PCT = 0.05 → cap だけ超過
		// **同じ窓の strict は :both**（strict の tolerance は 0.04 なので両方超過）。
		// 律速側が経路で入れ替わる実例で、混ぜて集計すると消える差そのもの。
		const { candles, pivots } = buildHS({ leftShoulder: 100, rightShoulder: 106.5, head: 130 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		const result = detectHeadAndShoulders(ctx);

		expect(result.patterns.filter((p) => p.type === 'head_and_shoulders')).toHaveLength(0);
		const relaxed = ctx.debugCandidates.filter(
			(d) => d.type === 'head_and_shoulders' && (d.reason ?? '').startsWith('relaxed_shoulders_not_near'),
		);
		expect(relaxed.map((d) => d.reason)).toEqual(['relaxed_shoulders_not_near:cap']);
		const details = relaxed[0]?.details as Record<string, unknown> | undefined;
		expect(details?.shoulderMaxPct).toBe(0.05);
		expect(details?.relaxedShoulderFactor).toBe(2.0);
		expect(details?.relaxedTolerancePct).toBeCloseTo(0.08, 12);
		expect(details?.shouldersDiffPct).toBeCloseTo(6.5 / 106.5, 12);

		// strict 由来と混ざらない（受け入れ条件: 理由コードで区別できること）
		const strict = ctx.debugCandidates.filter(
			(d) => d.type === 'head_and_shoulders' && (d.reason ?? '').startsWith('shoulders_not_near'),
		);
		expect(strict.map((d) => d.reason)).toEqual(['shoulders_not_near:both']);
	});

	it('Inverse H&S relaxed: HS_SHOULDER_MAX_PCT のみ超過 → relaxed_shoulders_not_near:cap', () => {
		const { candles, pivots } = buildInverseHS({ leftShoulder: 100, rightShoulder: 106.5, head: 70 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		const result = detectHeadAndShoulders(ctx);

		expect(result.patterns.filter((p) => p.type === 'inverse_head_and_shoulders')).toHaveLength(0);
		const relaxed = ctx.debugCandidates.filter(
			(d) => d.type === 'inverse_head_and_shoulders' && (d.reason ?? '').startsWith('relaxed_shoulders_not_near'),
		);
		expect(relaxed.map((d) => d.reason)).toEqual(['relaxed_shoulders_not_near:cap']);
		const strict = ctx.debugCandidates.filter(
			(d) => d.type === 'inverse_head_and_shoulders' && (d.reason ?? '').startsWith('shoulders_not_near'),
		);
		expect(strict.map((d) => d.reason)).toEqual(['shoulders_not_near:both']);
	});

	it('H&S relaxed: relaxed tolerance のみ超過 → relaxed_shoulders_not_near:tolerance', () => {
		// tolerancePct=0.02 → relaxed 末尾の段の tolerance は 0.04。
		// left=100, right=104.5 → 4.5/104.5 ≈ 0.0431 > 0.04 かつ <= 0.05（cap は通る）
		const { candles, pivots } = buildHS({ leftShoulder: 100, rightShoulder: 104.5, head: 130 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.02 });
		detectHeadAndShoulders(ctx);

		const relaxed = ctx.debugCandidates.filter(
			(d) => d.type === 'head_and_shoulders' && (d.reason ?? '').startsWith('relaxed_shoulders_not_near'),
		);
		expect(relaxed.map((d) => d.reason)).toEqual(['relaxed_shoulders_not_near:tolerance']);
	});

	it('H&S relaxed: 両方超過 → relaxed_shoulders_not_near:both', () => {
		// left=100, right=120 → 20/120 ≈ 0.167。0.04*2.0=0.08 も 0.05 も超える
		const { candles, pivots } = buildHS({ leftShoulder: 100, rightShoulder: 120, head: 150 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		detectHeadAndShoulders(ctx);

		const relaxed = ctx.debugCandidates.filter(
			(d) => d.type === 'head_and_shoulders' && (d.reason ?? '').startsWith('relaxed_shoulders_not_near'),
		);
		expect(relaxed.map((d) => d.reason)).toEqual(['relaxed_shoulders_not_near:both']);
	});

	it('relaxed の棄却エントリは同じ窓で 2 回積まれない（段は外・窓が内のループ）', () => {
		// `RELAXED_FACTORS` は 2 段。素朴に両段で積むと同じ 5 点が 2 件になり cap を倍速で食う。
		// 末尾の段でだけ積む実装なので、窓ごとにちょうど 1 件。
		for (const build of [buildHS, buildInverseHS]) {
			const isTop = build === buildHS;
			const { candles, pivots } = build({ leftShoulder: 100, rightShoulder: 106.5, head: isTop ? 130 : 70 });
			const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
			detectHeadAndShoulders(ctx);

			const perWindow = new Map<string, number>();
			for (const d of ctx.debugCandidates) {
				if (!(d.reason ?? '').startsWith('relaxed_')) continue;
				const key = `${d.type}|${(d.indices ?? []).join(',')}`;
				perWindow.set(key, (perWindow.get(key) ?? 0) + 1);
			}
			expect(perWindow.size).toBe(1);
			expect([...perWindow.values()]).toEqual([1]);
		}
	});

	it('x1.6 段の肩落ちは棄却として積まれない（x2.0 段で通る窓）', () => {
		// tolerancePct=0.025 → x1.6 段 = 0.04 / x2.0 段 = 0.05。
		// left=100, right=104.5 → 0.0431 は x1.6 で落ちて x2.0 で通る（cap 0.05 も通る）。
		// 末尾の段で救われる窓なので、x1.6 の落ちを積むと「棄却」の意味が壊れる。
		const { candles, pivots } = buildHS({ leftShoulder: 100, rightShoulder: 104.5, head: 130 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.025 });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.filter((p) => p.type === 'head_and_shoulders');
		expect(hs.length).toBeGreaterThan(0);
		expect(hs[0]?._fallback).toBe('relaxed_hs_x2.0_0.4');
		expect(ctx.debugCandidates.filter((d) => (d.reason ?? '').startsWith('relaxed_shoulders_not_near'))).toHaveLength(
			0,
		);
	});

	it('relaxed のネックライン棄却は relaxed_ 接頭辞で strict と分かれる', () => {
		// 谷1=85 / 谷2=95 → relDiff = 10/95 ≈ 0.105 > HS_NECKLINE_MAX_PCT(0.05)。
		// 肩と頭は strict / relaxed とも通るので、両経路がネックラインで落ちる。
		const { candles, pivots } = buildHS({ valley1: 85, valley2: 95, head: 130 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		detectHeadAndShoulders(ctx);

		const reasons = ctx.debugCandidates
			.filter((d) => d.type === 'head_and_shoulders' && (d.reason ?? '').includes('neckline_not_horizontal'))
			.map((d) => d.reason);
		expect(reasons).toContain('neckline_not_horizontal');
		expect(reasons).toContain('relaxed_neckline_not_horizontal');
		// 末尾の段でだけ積むので relaxed 側はちょうど 1 件
		expect(reasons.filter((r) => r === 'relaxed_neckline_not_horizontal')).toHaveLength(1);
	});

	it('Inverse H&S relaxed: ネックライン棄却も relaxed_ 接頭辞で積む', () => {
		const { candles, pivots } = buildInverseHS({ peak1: 115, peak2: 128, head: 70 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		detectHeadAndShoulders(ctx);

		const reasons = ctx.debugCandidates
			.filter((d) => d.type === 'inverse_head_and_shoulders' && (d.reason ?? '').includes('neckline_not_horizontal'))
			.map((d) => d.reason);
		expect(reasons).toContain('relaxed_neckline_not_horizontal');
		expect(reasons.filter((r) => r === 'relaxed_neckline_not_horizontal')).toHaveLength(1);
	});

	it('relaxed は頭で落ちた窓を積まない（#174 の対象外。cap 保護）', () => {
		// head=101 は headProminencePct=0.04 の x2.0 段（= 0.016）でも突出不足。
		// 肩は同値で通るので、肩の理由コードもネックラインの理由コードも出ない。
		const { candles, pivots } = buildHS({ leftShoulder: 100, rightShoulder: 100, head: 101 });
		const ctx = buildCtx({ candles, pivots, tolerancePct: 0.04 });
		detectHeadAndShoulders(ctx);

		expect(ctx.debugCandidates.filter((d) => (d.reason ?? '').startsWith('relaxed_'))).toHaveLength(0);
	});

	// ── 形成中 H&S ───────────────────────────────────────────

	it('includeForming=true + 右肩形成中 → forming H&S 検出', () => {
		// 66 本のローソク足を作成
		// allPeaks: 左肩(idx=5,price=100), 頭(idx=30,price=135)
		// allValleys: 頭前谷(idx=20,price=88), 頭後谷(idx=45,price=90)
		// 最終 close=102（左肩 100 近傍 → 暫定右肩）
		const total = 66;
		const candles: CandleData[] = Array.from({ length: total }, (_, i) => mkCandle(total - i, 90, 95, 85, 90));
		candles[5] = mkCandle(total - 5, 99, 100, 97, 99);
		candles[20] = mkCandle(total - 20, 87, 90, 87, 88);
		candles[30] = mkCandle(total - 30, 134, 135, 132, 134);
		candles[45] = mkCandle(total - 45, 89, 92, 89, 90);
		// 最後の 5 本を暫定右肩レベル（102）にする
		for (let i = 60; i < total; i++) {
			candles[i] = mkCandle(total - i, 101, 103, 100, 102);
		}

		const allPeaks: Pivot[] = [
			{ idx: 5, price: 100, kind: 'H', extremePrice: 100 },
			{ idx: 30, price: 135, kind: 'H', extremePrice: 135 },
		];
		const allValleys: Pivot[] = [
			{ idx: 20, price: 88, kind: 'L', extremePrice: 88 },
			{ idx: 45, price: 90, kind: 'L', extremePrice: 90 },
		];

		const ctx = buildCtx({
			candles,
			pivots: [...allPeaks, ...allValleys],
			allPeaks,
			allValleys,
			includeForming: true,
		});
		const result = detectHeadAndShoulders(ctx);

		const forming = result.patterns.filter((p) => p.type === 'head_and_shoulders' && p.status === 'forming');
		expect(forming.length).toBeGreaterThanOrEqual(1);
		expect(forming[0]?.completionPct).toBeDefined();
		expect(forming[0]?.breakoutTarget).toBeDefined();
		expect(forming[0]?.targetMethod).toBe('neckline_projection');
	});

	it('includeForming=false では forming H&S は返さない', () => {
		const total = 66;
		const candles: CandleData[] = Array.from({ length: total }, (_, i) => mkCandle(total - i, 90, 95, 85, 90));
		candles[5] = mkCandle(total - 5, 99, 100, 97, 99);
		candles[20] = mkCandle(total - 20, 87, 90, 87, 88);
		candles[30] = mkCandle(total - 30, 134, 135, 132, 134);
		candles[45] = mkCandle(total - 45, 89, 92, 89, 90);
		for (let i = 60; i < total; i++) {
			candles[i] = mkCandle(total - i, 101, 103, 100, 102);
		}

		const allPeaks: Pivot[] = [
			{ idx: 5, price: 100, kind: 'H', extremePrice: 100 },
			{ idx: 30, price: 135, kind: 'H', extremePrice: 135 },
		];
		const allValleys: Pivot[] = [
			{ idx: 20, price: 88, kind: 'L', extremePrice: 88 },
			{ idx: 45, price: 90, kind: 'L', extremePrice: 90 },
		];

		const ctx = buildCtx({
			candles,
			pivots: [...allPeaks, ...allValleys],
			allPeaks,
			allValleys,
			includeForming: false,
		});
		const result = detectHeadAndShoulders(ctx);

		const forming = result.patterns.filter((p) => p.status === 'forming');
		expect(forming).toHaveLength(0);
	});

	// ── 形成中 Inverse H&S ───────────────────────────────────

	it('includeForming=true + 右谷形成中 → forming inverse H&S 検出', () => {
		// allValleys: 左肩(idx=5,price=100), 頭(idx=30,price=60)
		// allPeaks: 頭前ピーク(idx=20,price=112), 頭後ピーク(idx=45,price=110)
		// 最終 close=98（左肩 100 近傍）
		const total = 66;
		const candles: CandleData[] = Array.from({ length: total }, (_, i) => mkCandle(total - i, 90, 95, 85, 90));
		candles[5] = mkCandle(total - 5, 100, 102, 99, 101);
		candles[20] = mkCandle(total - 20, 111, 112, 110, 111);
		candles[30] = mkCandle(total - 30, 60, 62, 59, 61);
		candles[45] = mkCandle(total - 45, 109, 110, 108, 109);
		for (let i = 60; i < total; i++) {
			candles[i] = mkCandle(total - i, 97, 99, 97, 98);
		}

		const allPeaks: Pivot[] = [
			{ idx: 20, price: 112, kind: 'H', extremePrice: 112 },
			{ idx: 45, price: 110, kind: 'H', extremePrice: 110 },
		];
		const allValleys: Pivot[] = [
			{ idx: 5, price: 100, kind: 'L', extremePrice: 100 },
			{ idx: 30, price: 60, kind: 'L', extremePrice: 60 },
		];

		const ctx = buildCtx({
			candles,
			pivots: [...allPeaks, ...allValleys],
			allPeaks,
			allValleys,
			includeForming: true,
		});
		const result = detectHeadAndShoulders(ctx);

		const forming = result.patterns.filter((p) => p.type === 'inverse_head_and_shoulders' && p.status === 'forming');
		expect(forming.length).toBeGreaterThanOrEqual(1);
		expect(forming[0]?.completionPct).toBeDefined();
		expect(forming[0]?.breakoutTarget).toBeDefined();
	});

	// ── structureRange / confirmation / precedingTrend（誤読防止のための分離フィールド） ──

	it('completed H&S: structureRange=左肩〜右肩, confirmation=not_confirmed, precedingTrend あり', () => {
		const { candles, pivots } = buildHS();
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.find((p) => p.type === 'head_and_shoulders');
		expect(hs).toBeDefined();
		if (!hs) return;

		// 左肩(idx=0) → 右肩(idx=60)
		expect(hs.structureRange?.start).toBe(candles[0].isoTime);
		expect(hs.structureRange?.end).toBe(candles[60].isoTime);

		// H&S 検出器はネックライン突破を確認しないため not_confirmed
		expect(hs.confirmation?.type).toBe('not_confirmed');

		expect(hs.precedingTrend).toBeDefined();
		expect(hs.precedingTrend?.end).toBe(candles[0].isoTime);
		expect(typeof hs.precedingTrend?.lookbackBars).toBe('number');
	});

	it('completed Inverse H&S: structureRange=左肩〜右肩, confirmation=not_confirmed, precedingTrend あり', () => {
		const { candles, pivots } = buildInverseHS();
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const ihs = result.patterns.find((p) => p.type === 'inverse_head_and_shoulders');
		expect(ihs).toBeDefined();
		if (!ihs) return;

		expect(ihs.structureRange?.start).toBe(candles[0].isoTime);
		expect(ihs.structureRange?.end).toBe(candles[60].isoTime);
		expect(ihs.confirmation?.type).toBe('not_confirmed');
		expect(ihs.precedingTrend).toBeDefined();
	});

	it('forming H&S: structureRange / confirmation=not_confirmed / precedingTrend あり', () => {
		const total = 66;
		const candles: CandleData[] = Array.from({ length: total }, (_, i) => mkCandle(total - i, 90, 95, 85, 90));
		candles[5] = mkCandle(total - 5, 99, 100, 97, 99);
		candles[20] = mkCandle(total - 20, 87, 90, 87, 88);
		candles[30] = mkCandle(total - 30, 134, 135, 132, 134);
		candles[45] = mkCandle(total - 45, 89, 92, 89, 90);
		for (let i = 60; i < total; i++) {
			candles[i] = mkCandle(total - i, 101, 103, 100, 102);
		}

		const allPeaks: Pivot[] = [
			{ idx: 5, price: 100, kind: 'H', extremePrice: 100 },
			{ idx: 30, price: 135, kind: 'H', extremePrice: 135 },
		];
		const allValleys: Pivot[] = [
			{ idx: 20, price: 88, kind: 'L', extremePrice: 88 },
			{ idx: 45, price: 90, kind: 'L', extremePrice: 90 },
		];

		const ctx = buildCtx({
			candles,
			pivots: [...allPeaks, ...allValleys],
			allPeaks,
			allValleys,
			includeForming: true,
		});
		const result = detectHeadAndShoulders(ctx);

		const forming = result.patterns.find((p) => p.type === 'head_and_shoulders' && p.status === 'forming');
		expect(forming).toBeDefined();
		if (!forming) return;

		expect(forming.structureRange).toBeDefined();
		expect(forming.confirmation?.type).toBe('not_confirmed');
		expect(forming.precedingTrend).toBeDefined();
	});

	// ── 形成中の最低 confidence ゲート（FORMING_MIN_CONFIDENCE = 0.5） ─────

	it('forming inverse H&S: 右肩が左肩から遠く confidence < 0.5 → 結果に含まれない & reject 理由が残る', () => {
		// closeness = 1 - |107 - 100| / (100 * 0.08) = 1 - 7/8 = 0.125
		// confBase = 0.6 * 0.125 + 0.4 * 0.125 = 0.125
		// confidence = round(0.125 * 0.9 * 100)/100 = 0.11  → < 0.5
		// completion = (0.75 + 0.25 * 0.125) * 0.9 = 0.703 → >= 0.4（残るのは confidence 側のみ）
		const total = 66;
		const candles: CandleData[] = Array.from({ length: total }, (_, i) => mkCandle(total - i, 90, 95, 85, 90));
		candles[5] = mkCandle(total - 5, 100, 102, 99, 100);
		candles[20] = mkCandle(total - 20, 111, 112, 110, 111);
		candles[30] = mkCandle(total - 30, 60, 62, 59, 60);
		candles[45] = mkCandle(total - 45, 109, 110, 108, 110);
		// 現在価格を 107 (左肩 100 から 7%) にして closeness を下げる
		for (let i = 60; i < total; i++) {
			candles[i] = mkCandle(total - i, 106, 108, 106, 107);
		}

		const allPeaks: Pivot[] = [
			{ idx: 20, price: 112, kind: 'H', extremePrice: 112 },
			{ idx: 45, price: 110, kind: 'H', extremePrice: 110 },
		];
		const allValleys: Pivot[] = [
			{ idx: 5, price: 100, kind: 'L', extremePrice: 100 },
			{ idx: 30, price: 60, kind: 'L', extremePrice: 60 },
		];

		const ctx = buildCtx({
			candles,
			pivots: [...allPeaks, ...allValleys],
			allPeaks,
			allValleys,
			includeForming: true,
		});
		const result = detectHeadAndShoulders(ctx);

		const forming = result.patterns.filter((p) => p.type === 'inverse_head_and_shoulders' && p.status === 'forming');
		expect(forming).toHaveLength(0);

		const rejected = ctx.debugCandidates.find(
			(d) =>
				d.type === 'inverse_head_and_shoulders' && d.accepted === false && d.reason === 'confidence_below_min_forming',
		);
		expect(rejected).toBeDefined();
		const details = rejected?.details as Record<string, unknown> | undefined;
		expect(Number(details?.threshold)).toBe(0.5);
		expect(Number(details?.confidence)).toBeLessThan(0.5);
	});

	it('forming H&S: 右肩が左肩から遠く confidence < 0.5 → 結果に含まれない & reject 理由が残る', () => {
		const total = 66;
		const candles: CandleData[] = Array.from({ length: total }, (_, i) => mkCandle(total - i, 90, 95, 85, 90));
		candles[5] = mkCandle(total - 5, 99, 100, 97, 100);
		candles[20] = mkCandle(total - 20, 87, 90, 87, 88);
		candles[30] = mkCandle(total - 30, 134, 135, 132, 135);
		candles[45] = mkCandle(total - 45, 89, 92, 89, 90);
		// 現在価格を 93 (左肩 100 から 7%) にして closeness を下げる
		for (let i = 60; i < total; i++) {
			candles[i] = mkCandle(total - i, 93, 95, 91, 93);
		}

		const allPeaks: Pivot[] = [
			{ idx: 5, price: 100, kind: 'H', extremePrice: 100 },
			{ idx: 30, price: 135, kind: 'H', extremePrice: 135 },
		];
		const allValleys: Pivot[] = [
			{ idx: 20, price: 88, kind: 'L', extremePrice: 88 },
			{ idx: 45, price: 90, kind: 'L', extremePrice: 90 },
		];

		const ctx = buildCtx({
			candles,
			pivots: [...allPeaks, ...allValleys],
			allPeaks,
			allValleys,
			includeForming: true,
		});
		const result = detectHeadAndShoulders(ctx);

		const forming = result.patterns.filter((p) => p.type === 'head_and_shoulders' && p.status === 'forming');
		expect(forming).toHaveLength(0);

		const rejected = ctx.debugCandidates.find(
			(d) => d.type === 'head_and_shoulders' && d.accepted === false && d.reason === 'confidence_below_min_forming',
		);
		expect(rejected).toBeDefined();
	});

	// ── ネックラインブレイク確認（completed への昇格） ─────────

	it('H&S: 右肩後にネックライン下抜け → status=completed, confirmation=neckline_breakout', () => {
		// neckline (85+85)/2 = 85, head 130
		// breakIdx=65 で close=80 (< 85*(1-0.015)=83.725) → 下抜け
		const { candles, pivots } = buildHsWithBreakout({ breakIdx: 65, breakClose: 80 });
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.find((p) => p.type === 'head_and_shoulders');
		expect(hs).toBeDefined();
		if (!hs) return;

		expect(hs.status).toBe('completed');
		expect(hs.confirmation?.type).toBe('neckline_breakout');
		expect(hs.breakoutDirection).toBe('down');
		expect(hs.outcome).toBe('success');
		// breakoutBarIndex は右肩(idx=60) より後
		const breakoutBarIndex = hs.breakoutBarIndex;
		expect(typeof breakoutBarIndex).toBe('number');
		if (typeof breakoutBarIndex !== 'number') return;
		expect(breakoutBarIndex).toBeGreaterThan(60);
		expect(breakoutBarIndex).toBeLessThanOrEqual(candles.length - 1);

		// range.end = ブレイク日（candles[breakoutIdx].isoTime）
		expect(hs.range?.end).toBe(candles[breakoutBarIndex]?.isoTime);
		// structureRange.end = 右肩日（candles[60].isoTime）
		expect(hs.structureRange?.end).toBe(candles[60].isoTime);
		// confirmation.date は range.end と一致（ブレイク日）
		if (hs.confirmation?.type === 'neckline_breakout') {
			expect(hs.confirmation.date).toBe(hs.range?.end);
			expect(hs.confirmation.idx).toBe(breakoutBarIndex);
		}
	});

	it('H&S: 右肩後にターゲット到達 → targetReachedPct >= 100 + targetReached=true', () => {
		// target ≈ 85 - (130-85) = 40
		// breakClose=80 → breakoutPrice=80
		// 末尾 idx=79 で low=25 (<= target=40) → 到達
		// pct = (25-80) / (40-80) * 100 = 137.5 → 138
		const total = 80;
		const { candles, pivots } = buildHsWithBreakout({
			breakIdx: 65,
			breakClose: 80,
			postBreakLow: 25,
			postBreakIdx: 79,
			totalBars: total,
		});
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.find((p) => p.type === 'head_and_shoulders');
		expect(hs).toBeDefined();
		if (!hs) return;

		expect(hs.status).toBe('completed');
		// target = neckline(85) - (head(130) - neckline(85)) = 40
		expect(hs.breakoutTarget).toBe(40);
		expect(hs.targetReachedPct).toBeGreaterThanOrEqual(100);
		expect(hs.targetReached).toBe(true);
		expect(hs.targetReachedPrice).toBe(25);
		expect(hs.targetReachedDate).toBe(candles[79].isoTime);
	});

	it('H&S: 一度 target 到達後に close が戻る → high/low ベースで targetReached=true', () => {
		// 旧 close ベース判定では、最終 close が target を上回ると未到達扱いされる。
		// 新 high/low ベースでは、ブレイク後の最安値で評価するので、戻しても到達扱いになる。
		//
		// target = 85 - (130-85) = 40, breakClose=80 → breakoutPrice=80
		// 中間 idx=70 で low=25 (<= target 40) → 到達
		// 末尾 idx=79 は close=80 (> target 40) で recovery
		// 旧 close ベース: (80-80)/(40-80)*100 = 0% → 未到達
		// 新 high/low ベース: (25-80)/(40-80)*100 = 137.5 → 138%
		const total = 80;
		const { candles, pivots } = buildHsWithBreakout({
			breakIdx: 65,
			breakClose: 80,
			postBreakLow: 25,
			postBreakIdx: 70,
			totalBars: total,
		});
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.find((p) => p.type === 'head_and_shoulders');
		expect(hs).toBeDefined();
		if (!hs) return;

		expect(hs.status).toBe('completed');
		expect(hs.confirmation?.type).toBe('neckline_breakout');
		expect(hs.breakoutTarget).toBe(40);

		// 最終 close は 80 (> target 40) だが、ブレイク後 idx=70 で low=25 が target を割り込んでいる
		expect(hs.targetReachedPct).toBeGreaterThanOrEqual(100);
		expect(hs.targetReached).toBe(true);
		expect(hs.targetReachedPrice).toBe(25);
		expect(hs.targetReachedDate).toBe(candles[70].isoTime);
		// 末尾 close は target を上回って戻っている（recovery を fixture が再現していることを念のため確認）
		const lastClose = candles[total - 1]?.close ?? Number.NaN;
		expect(lastClose).toBeGreaterThan(hs.breakoutTarget ?? Number.POSITIVE_INFINITY);
	});

	it('H&S: ブレイク後 low が target に届かない → 未到達 (targetReachedPct < 100)', () => {
		// breakClose=80 → 全 post-break candle で low=77 のみ (postBreakLow 未指定)
		// 77 > target 40 → 未到達
		// pct = (77-80)/(40-80)*100 = 7.5 → 8%
		const { candles, pivots } = buildHsWithBreakout({ breakIdx: 65, breakClose: 80 });
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.find((p) => p.type === 'head_and_shoulders');
		expect(hs).toBeDefined();
		if (!hs) return;

		expect(hs.status).toBe('completed');
		expect(hs.confirmation?.type).toBe('neckline_breakout');
		expect(hs.breakoutTarget).toBe(40);
		expect(hs.targetReachedPct).toBeLessThan(100);
		expect(hs.targetReached).toBe(false);
	});

	it('H&S: ブレイク close == target（距離ゼロ）→ targetReached=true & pct=100 を確定で返す', () => {
		// target = 40, breakClose=40 → breakoutPrice === target → targetDistance=0
		// 旧式は EPSILON ガードで undefined を返し metadata が全て落ちていた。
		// 新式は「ブレイク時点で既に到達」とみなして reached=true, pct=100 を確定で返す。
		const { candles, pivots } = buildHsWithBreakout({ breakIdx: 65, breakClose: 40 });
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.find((p) => p.type === 'head_and_shoulders');
		expect(hs).toBeDefined();
		if (!hs) return;

		expect(hs.status).toBe('completed');
		expect(hs.breakoutTarget).toBe(40);
		expect(hs.targetReached).toBe(true);
		expect(hs.targetReachedPct).toBe(100);
		expect(hs.targetReachedPrice).toBe(40);
		expect(hs.targetReachedDate).toBeDefined();
	});

	it('H&S: ブレイク close が既に target を下回る（オーバーシュート）→ targetReached=true & pct>=100', () => {
		// target = 40, breakClose=30 → breakoutPrice=30 < target 40 で既に到達済み
		// 旧式: (extremePrice - 30) / (40 - 30) は分母 +10、extremePrice<30 で分子マイナス → pct が負
		// 新式: targetDistance=Math.abs(40-30)=10, moveDistance=30-27=3, pct=30
		//       targetReached=true なので Math.max(100, 30) = 100 にクランプ
		const { candles, pivots } = buildHsWithBreakout({ breakIdx: 65, breakClose: 30 });
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.find((p) => p.type === 'head_and_shoulders');
		expect(hs).toBeDefined();
		if (!hs) return;

		expect(hs.status).toBe('completed');
		expect(hs.confirmation?.type).toBe('neckline_breakout');
		expect(hs.breakoutTarget).toBe(40);
		expect(hs.targetReached).toBe(true);
		expect(hs.targetReachedPct).toBeGreaterThanOrEqual(100);
		// 不整合（reached=true なのに pct<0）が起きていないことを明示
		expect(hs.targetReachedPct).toBeGreaterThanOrEqual(0);
	});

	it('H&S: 右肩後にブレイクしない → status=near_completion, confirmation=not_confirmed', () => {
		// 既定 buildHS の末尾は close=90 で neckline 85 を割り込まない（90 > 83.725）
		const { candles, pivots } = buildHS();
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const hs = result.patterns.find((p) => p.type === 'head_and_shoulders');
		expect(hs).toBeDefined();
		if (!hs) return;

		expect(hs.status).not.toBe('completed');
		expect(hs.status).toBe('near_completion');
		expect(hs.confirmation?.type).toBe('not_confirmed');
		// range.end = structureRange.end = 右肩日
		expect(hs.range?.end).toBe(candles[60].isoTime);
		expect(hs.structureRange?.end).toBe(candles[60].isoTime);
		expect(hs.breakoutBarIndex).toBeUndefined();
	});

	it('逆H&S: 右肩後にネックライン上抜け → status=completed, confirmation=neckline_breakout', () => {
		// neckline (115+115)/2 = 115, head 70
		// breakIdx=65 で close=120 (> 115*(1+0.015)=116.725) → 上抜け
		const { candles, pivots } = buildInverseHsWithBreakout({ breakIdx: 65, breakClose: 120 });
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const ihs = result.patterns.find((p) => p.type === 'inverse_head_and_shoulders');
		expect(ihs).toBeDefined();
		if (!ihs) return;

		expect(ihs.status).toBe('completed');
		expect(ihs.confirmation?.type).toBe('neckline_breakout');
		expect(ihs.breakoutDirection).toBe('up');
		expect(ihs.outcome).toBe('success');
		const breakoutBarIndex = ihs.breakoutBarIndex;
		expect(typeof breakoutBarIndex).toBe('number');
		if (typeof breakoutBarIndex !== 'number') return;
		expect(breakoutBarIndex).toBeGreaterThan(60);
		expect(ihs.range?.end).toBe(candles[breakoutBarIndex]?.isoTime);
		expect(ihs.structureRange?.end).toBe(candles[60].isoTime);
	});

	it('逆H&S: 右肩後にターゲット到達 → targetReachedPct >= 100 + targetReached=true', () => {
		// target ≈ 115 + (115-70) = 160
		// breakClose=120 → breakoutPrice=120, 末尾 idx=79 で high=170 (>= target 160)
		// pct = (170-120)/(160-120)*100 = 125%
		const total = 80;
		const { candles, pivots } = buildInverseHsWithBreakout({
			breakIdx: 65,
			breakClose: 120,
			postBreakHigh: 170,
			postBreakIdx: 79,
			totalBars: total,
		});
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const ihs = result.patterns.find((p) => p.type === 'inverse_head_and_shoulders');
		expect(ihs).toBeDefined();
		if (!ihs) return;

		expect(ihs.status).toBe('completed');
		// target = neckline(115) + (neckline(115) - head(70)) = 160
		expect(ihs.breakoutTarget).toBe(160);
		expect(ihs.targetReachedPct).toBeGreaterThanOrEqual(100);
		expect(ihs.targetReached).toBe(true);
		expect(ihs.targetReachedPrice).toBe(170);
		expect(ihs.targetReachedDate).toBe(candles[79].isoTime);
	});

	it('逆H&S: 一度 target 到達後に close が戻る → high/low ベースで targetReached=true', () => {
		// target = 115 + (115-70) = 160, breakClose=120 → breakoutPrice=120
		// 中間 idx=70 で high=170 (>= target 160) → 到達
		// 末尾 idx=79 は close=120 (< target 160) で recovery
		// 旧 close ベース: (120-120)/(160-120)*100 = 0% → 未到達
		// 新 high/low ベース: (170-120)/(160-120)*100 = 125%
		const total = 80;
		const { candles, pivots } = buildInverseHsWithBreakout({
			breakIdx: 65,
			breakClose: 120,
			postBreakHigh: 170,
			postBreakIdx: 70,
			totalBars: total,
		});
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const ihs = result.patterns.find((p) => p.type === 'inverse_head_and_shoulders');
		expect(ihs).toBeDefined();
		if (!ihs) return;

		expect(ihs.status).toBe('completed');
		expect(ihs.confirmation?.type).toBe('neckline_breakout');
		expect(ihs.breakoutTarget).toBe(160);

		expect(ihs.targetReachedPct).toBeGreaterThanOrEqual(100);
		expect(ihs.targetReached).toBe(true);
		expect(ihs.targetReachedPrice).toBe(170);
		expect(ihs.targetReachedDate).toBe(candles[70].isoTime);
		// 末尾 close は target を下回って戻っている（recovery を fixture が再現していることを念のため確認）
		const lastClose = candles[total - 1]?.close ?? Number.NaN;
		expect(lastClose).toBeLessThan(ihs.breakoutTarget ?? Number.NEGATIVE_INFINITY);
	});

	it('逆H&S: ブレイク後 high が target に届かない → 未到達 (targetReachedPct < 100)', () => {
		// breakClose=120 → 全 post-break candle で high=123 (= breakClose+3)
		// 123 < target 160 → 未到達
		// pct = (123-120)/(160-120)*100 = 7.5 → 8%
		const { candles, pivots } = buildInverseHsWithBreakout({ breakIdx: 65, breakClose: 120 });
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const ihs = result.patterns.find((p) => p.type === 'inverse_head_and_shoulders');
		expect(ihs).toBeDefined();
		if (!ihs) return;

		expect(ihs.status).toBe('completed');
		expect(ihs.confirmation?.type).toBe('neckline_breakout');
		expect(ihs.breakoutTarget).toBe(160);
		expect(ihs.targetReachedPct).toBeLessThan(100);
		expect(ihs.targetReached).toBe(false);
	});

	it('逆H&S: ブレイク close == target（距離ゼロ）→ targetReached=true & pct=100 を確定で返す', () => {
		// target = 160, breakClose=160 → breakoutPrice === target → targetDistance=0
		const { candles, pivots } = buildInverseHsWithBreakout({ breakIdx: 65, breakClose: 160 });
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const ihs = result.patterns.find((p) => p.type === 'inverse_head_and_shoulders');
		expect(ihs).toBeDefined();
		if (!ihs) return;

		expect(ihs.status).toBe('completed');
		expect(ihs.breakoutTarget).toBe(160);
		expect(ihs.targetReached).toBe(true);
		expect(ihs.targetReachedPct).toBe(100);
		expect(ihs.targetReachedPrice).toBe(160);
		expect(ihs.targetReachedDate).toBeDefined();
	});

	it('逆H&S: ブレイク close が既に target を上回る（オーバーシュート）→ targetReached=true & pct>=100', () => {
		// target = 160, breakClose=170 → breakoutPrice=170 > target 160 で既に到達済み
		// 旧式: (extremePrice - 170) / (160 - 170) は分母 -10、extremePrice>170 で分子プラス → pct が負
		// 新式: targetDistance=Math.abs(160-170)=10, moveDistance=173-170=3, pct=30
		//       targetReached=true なので Math.max(100, 30) = 100 にクランプ
		const { candles, pivots } = buildInverseHsWithBreakout({ breakIdx: 65, breakClose: 170 });
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const ihs = result.patterns.find((p) => p.type === 'inverse_head_and_shoulders');
		expect(ihs).toBeDefined();
		if (!ihs) return;

		expect(ihs.status).toBe('completed');
		expect(ihs.confirmation?.type).toBe('neckline_breakout');
		expect(ihs.breakoutTarget).toBe(160);
		expect(ihs.targetReached).toBe(true);
		expect(ihs.targetReachedPct).toBeGreaterThanOrEqual(100);
		expect(ihs.targetReachedPct).toBeGreaterThanOrEqual(0);
	});

	it('逆H&S: 右肩後にブレイクしない → status=near_completion, confirmation=not_confirmed', () => {
		// 既定 buildInverseHS の末尾は close=90 で neckline 115 を超えない
		const { candles, pivots } = buildInverseHS();
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);

		const ihs = result.patterns.find((p) => p.type === 'inverse_head_and_shoulders');
		expect(ihs).toBeDefined();
		if (!ihs) return;

		expect(ihs.status).not.toBe('completed');
		expect(ihs.status).toBe('near_completion');
		expect(ihs.confirmation?.type).toBe('not_confirmed');
		expect(ihs.range?.end).toBe(candles[60].isoTime);
		expect(ihs.structureRange?.end).toBe(candles[60].isoTime);
	});

	// ── ピボット不足 ─────────────────────────────────────────

	it('ピボット < 5 個では H&S/Inverse H&S とも検出しない', () => {
		const candles: CandleData[] = Array.from({ length: 30 }, (_, i) => mkCandle(30 - i, 90, 95, 85, 90));
		const pivots: Pivot[] = [
			{ idx: 0, price: 100, kind: 'H', extremePrice: 100 },
			{ idx: 10, price: 85, kind: 'L', extremePrice: 85 },
			{ idx: 20, price: 130, kind: 'H', extremePrice: 130 },
		];
		const ctx = buildCtx({ candles, pivots });
		const result = detectHeadAndShoulders(ctx);
		expect(result.patterns).toHaveLength(0);
	});

	// ── 窓生成: 交互列が崩れていても頭を中心とした窓が作られる（issue #146） ──

	describe('交互列が崩れたピボット列からの窓生成（issue #146）', () => {
		/**
		 * issue #146 が「実測済み」として報告した BTC/JPY 1時間足のピボット列。
		 * swingDepth=3（1hour の既定）では**頭の直後に別の高値 12,726,672 が挟まり**、
		 * 頭より右の交互が崩れる。旧実装は「配列上で連続する 5 ピボットが H-L-H-L-H」を
		 * 要求していたため、頭 12,851,000 を中心とする窓が**一度も生成されなかった**
		 * （`view=debug` の candidates にも棄却理由が残らない偽陰性）。
		 *
		 * **注意: これは値そのものを凍結した実データ fixture ではない。** issue が実測として
		 * 報告したピボット列（価格・間隔）を入力にしている。窓生成が読むのは `kind` / `idx` /
		 * `price` だけなので、「窓が作られるか」の回帰はこの入力で固定できる。
		 *
		 * ## `tests/patterns/hs-window-btcjpy-1hour.test.ts` との役割分担（issue #157）
		 *
		 * #157 で実データ fixture（`tests/fixtures/btc_jpy_1hour_2026_08.ts`）を凍結したが、
		 * **本 describe は置き換えず残している。守る対象が違う。**
		 *
		 * | | 入力 | 守るもの |
		 * |---|---|---|
		 * | 本 describe | 人手で書き写したピボット列 | **窓生成ロジック単体**。`enumerateHsWindows` が交互列の崩れた `kind`/`idx`/`price` から窓を作るか。`tolerancePct` / `headProminencePct` の分離（#149）の振り分けもここ |
		 * | `hs-window-btcjpy-1hour.test.ts` | 実データ OHLC 365 本 | **`detectSwingPoints` を含む配線**。実 OHLC から実際にどのピボットが出るか、スライス後の idx が窓の idx と対応するか |
		 *
		 * 実データ側に一本化すると、`detectSwingPoints` の回帰と窓生成の回帰が同じ 1 本の失敗に
		 * 潰れてどちらが壊れたか切り分けられなくなる。逆に本 describe だけでは
		 * 「`detectSwingPoints` がそのピボットを本当に出すか」が未検証のまま残る（#157 の指摘）。
		 */
		const ISSUE_146_PIVOTS: Array<[number, number, 'H' | 'L']> = [
			[8, 12_213_097, 'L'], //  起点の安値 8/24
			[20, 12_582_009, 'H'], // 左肩 8/25
			[26, 12_529_686, 'L'], // 谷1 8/25（浅い -0.42%）
			[31, 12_851_000, 'H'], // 頭 8/25
			[34, 12_726_672, 'H'], // 頭の直後の余計な高値 ← ここで交互が崩れる
			[38, 12_531_708, 'L'], // 谷2 8/25
			[45, 12_617_817, 'H'], // 右肩 8/26
		];

		const ISSUE_146_WINDOW = [20, 26, 31, 38, 45];

		function buildIssue146Ctx(opts?: { tolerancePct?: number; headProminencePct?: number }): DetectContext {
			const total = 56;
			const candles: CandleData[] = [];
			for (let i = 0; i < total; i++) {
				const c = 12_213_097 + Math.round((i / total) * 300_000);
				candles.push(mkCandle(total - i, c, c + 5000, c - 5000, c));
			}
			for (const [idx, price, kind] of ISSUE_146_PIVOTS) {
				candles[idx] = mkCandle(
					total - idx,
					price,
					kind === 'H' ? price + 8000 : price + 3000,
					kind === 'L' ? price - 8000 : price - 3000,
					price,
				);
			}
			const pivots: Pivot[] = ISSUE_146_PIVOTS.map(([idx, price, kind]) => ({
				idx,
				price,
				kind,
				extremePrice: kind === 'H' ? price + 8000 : price - 8000,
			}));
			// 1hour の既定（patterns/config.ts）: tolerancePct=0.05 / headProminencePct=0.05（未指定時は
			// tolerancePct と同じ時間軸オート値。issue #149）/ minBarsBetweenSwings=2
			const ctx = buildCtx({
				candles,
				pivots,
				tolerancePct: opts?.tolerancePct ?? 0.05,
				headProminencePct: opts?.headProminencePct ?? 0.05,
				type: '1hour',
				want: new Set(['head_and_shoulders']),
			});
			ctx.minDist = 2;
			return ctx;
		}

		const findIssueWindow = (ctx: DetectContext) =>
			ctx.debugCandidates.find(
				(d) => d.type === 'head_and_shoulders' && JSON.stringify(d.indices) === JSON.stringify(ISSUE_146_WINDOW),
			);

		it('頭 12,851,000 を中心とする 5 点が候補として生成される', () => {
			const ctx = buildIssue146Ctx();
			detectHeadAndShoulders(ctx);
			// 左肩 20 / 谷1 26 / 頭 31 / 谷2 38 / 右肩 45。頭の直後の高値 34 を挟んでも窓になる。
			expect(findIssueWindow(ctx)).toBeDefined();
		});

		it('生成された候補は理由付きで結論が出る（頭のマージン不足で head_not_higher）', () => {
			// issue の受け入れ条件は「completed で検出される」ことではなく
			// 「候補が評価されて理由付きで結論が出る」こと。この 5 点は頭が右肩を
			// **1.85% しか上回っておらず**、strict が要求する頭のマージン
			// （1hour の headProminencePct = 5%。tolerancePct ではない——issue #149）
			// に届かないので head_not_higher で棄却されるのが正しい。
			const ctx = buildIssue146Ctx();
			detectHeadAndShoulders(ctx);

			const cand = findIssueWindow(ctx);
			expect(cand?.accepted).toBe(false);
			expect(cand?.reason).toBe('head_not_higher');
			// 棄却理由を出力から検算できる（#125 / #128 の方針）。
			const details = cand?.details as { leftShoulder: number; head: number; rightShoulder: number };
			expect(details.leftShoulder).toBe(12_582_009);
			expect(details.head).toBe(12_851_000);
			expect(details.rightShoulder).toBe(12_617_817);
		});

		// ── tolerancePct / headProminencePct の分離（issue #149） ──

		it('tolerancePct をどれだけ動かしても頭の判定（head_not_higher）は変わらない', () => {
			// 肩差 0.284%（35,808 / 12,617,817）はどんな tolerancePct でも near() を通るため、
			// tolerancePct を変えても shouldersNear は常に true のまま。headProminencePct を
			// 5% に固定して tolerancePct だけを極端に振っても、頭のマージン不足（1.85% < 5%）
			// による head_not_higher は変わらないことを確認する。
			const low = buildIssue146Ctx({ tolerancePct: 0.005, headProminencePct: 0.05 });
			detectHeadAndShoulders(low);
			const high = buildIssue146Ctx({ tolerancePct: 0.1, headProminencePct: 0.05 });
			detectHeadAndShoulders(high);

			const candLow = findIssueWindow(low);
			const candHigh = findIssueWindow(high);
			expect(candLow?.reason).toBe('head_not_higher');
			expect(candHigh?.reason).toBe('head_not_higher');

			// 頭の判定に使った実際の閾値（headProminencePct）は tolerancePct に関わらず同じ。
			const detailsLow = candLow?.details as { headProminencePct: number; tolerancePct: number };
			const detailsHigh = candHigh?.details as { headProminencePct: number; tolerancePct: number };
			expect(detailsLow.headProminencePct).toBe(0.05);
			expect(detailsHigh.headProminencePct).toBe(0.05);
			// tolerancePct 自体は debug に反映される（消えたわけではなく、頭の判定に使われないだけ）。
			expect(detailsLow.tolerancePct).toBe(0.005);
			expect(detailsHigh.tolerancePct).toBe(0.1);
		});

		it('headProminencePct を既定より緩めると head_not_higher が解消する', () => {
			// 頭のマージンは 1.85%。headProminencePct を既定 5% から 1% まで下げると
			// 「大きいほど厳しい」の向きどおり要求が緩み、head_not_higher では棄却されなくなる
			// （tolerancePct は既定のまま動かしていない）。
			const ctx = buildIssue146Ctx({ headProminencePct: 0.01 });
			detectHeadAndShoulders(ctx);

			const cand = findIssueWindow(ctx);
			expect(cand?.reason).not.toBe('head_not_higher');
		});

		it('厳密に交互する列でも、肩を跨ぐ窓（gap>=3）は新たに生成される', () => {
			// **窓生成の緩和は「交互が崩れた区間だけ」に閉じていない。** 肩リスト上で
			// 間に肩を跨ぐ組（gap>=3）は旧実装が作れなかった窓で、`H L H L H L H` のように
			// 厳密に交互する列でも出る。#146 の 5 点自体が gap=3 の窓（肩リストの第 1 と第 4）
			// なので、これは仕様であって副作用ではない——ここで固定しておかないと
			// 「交互列なら旧実装と同一」という誤った不変条件が後から書き戻されうる。
			//
			// 肩 h0=0(100) / h1=20(118) / h2=40(130) / h3=60(101)。旧実装が作れた窓は
			// 配列上で連続する [0,10,20,30,40] と [20,30,40,50,60] の 2 つだけで、
			// どちらも肩が離れすぎ（100 vs 118 / 118 vs 101）。一方 (h0, h3) を肩に取ると
			// 頭 = 間の最高値 130、肩は 100 と 101 で揃う。
			const pts: Array<[number, number, 'H' | 'L']> = [
				[0, 100, 'H'],
				[10, 80, 'L'],
				[20, 118, 'H'],
				[30, 82, 'L'],
				[40, 130, 'H'],
				[50, 81, 'L'],
				[60, 101, 'H'],
			];
			const candles: CandleData[] = Array.from({ length: 70 }, (_, i) => mkCandle(70 - i, 90, 95, 85, 90));
			for (const [idx, price] of pts) candles[idx] = mkCandle(70 - idx, price, price + 2, price - 2, price);
			const pivots: Pivot[] = pts.map(([idx, price, kind]) => ({ idx, price, kind, extremePrice: price }));

			const ctx = buildCtx({ candles, pivots, want: new Set(['head_and_shoulders']) });
			detectHeadAndShoulders(ctx);

			const spanning = ctx.debugCandidates.find(
				(d) => d.type === 'head_and_shoulders' && JSON.stringify(d.indices) === JSON.stringify([0, 10, 40, 50, 60]),
			);
			expect(spanning).toBeDefined();
			expect(spanning?.accepted).toBe(true);
		});

		it('肩を跨ぐ窓でも、外側の脚に肩を明確に超える山があれば窓にしない', () => {
			// 肩を跨ぐ窓を許すと、**跨いだ先の山のほうが肩より高い**読みまで作れてしまう。
			// H100-L80-H130-L80-H120-L80-H100 では (H0, H60) を肩に取ると頭 130 / 肩 100・100 で
			// 一見きれいに揃うが、谷2(30) と右肩(60) の間に **右肩より 20% 高い山 H40(120)** がある。
			// その山こそが右肩であって、H60 を右肩と読むのは肩の取り違え。
			//
			// 同水準（`HS_SHOULDER_MAX_PCT` = 5% 以内）の山は「幅のある肩」として通すので、
			// 実データの双子の山（BTC/JPY 日足 idx 38 と 42 は差 0.08%）は落ちない。
			const pts: Array<[number, number, 'H' | 'L']> = [
				[0, 100, 'H'],
				[10, 80, 'L'],
				[20, 130, 'H'],
				[30, 80, 'L'],
				[40, 120, 'H'],
				[50, 80, 'L'],
				[60, 100, 'H'],
			];
			const candles: CandleData[] = Array.from({ length: 70 }, (_, i) => mkCandle(70 - i, 90, 95, 85, 90));
			for (const [idx, price] of pts) candles[idx] = mkCandle(70 - idx, price, price + 2, price - 2, price);
			const pivots: Pivot[] = pts.map(([idx, price, kind]) => ({ idx, price, kind, extremePrice: price }));

			const ctx = buildCtx({ candles, pivots, want: new Set(['head_and_shoulders']) });
			const result = detectHeadAndShoulders(ctx);

			expect(result.patterns.filter((p) => p.type === 'head_and_shoulders')).toHaveLength(0);
			const misAnchored = ctx.debugCandidates.find(
				(d) => d.type === 'head_and_shoulders' && JSON.stringify(d.indices) === JSON.stringify([0, 10, 20, 30, 60]),
			);
			expect(misAnchored).toBeUndefined();
		});
	});
});
