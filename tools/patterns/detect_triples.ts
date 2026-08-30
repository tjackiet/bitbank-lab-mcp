/**
 * Triple Top / Triple Bottom 検出（完成済み＋形成中）
 * detect_patterns.ts Section 6 / 6b から抽出
 */
import { generatePatternDiagram, type PatternDiagramData } from '../../lib/pattern-diagrams.js';
import { MIN_CONFIDENCE } from '../patterns/config.js';
import { patternBarRange } from './bar-thresholds.js';
import { finalizeConf, periodScoreDays } from './helpers.js';
import { clamp01, relDev } from './regression.js';
import { applyReversalGate, buildStructureGate } from './reversal-gate.js';
import { validatePatternSize } from './structural.js';
import type { CandleData, DeduplicablePattern, DetectContext, DetectResult } from './types.js';
import { pushCand } from './types.js';

// ── 定数 ──

const NECKLINE_SLOPE_LIMIT = 0.02;
const MAX_VALLEY_SPREAD = 0.015;
/**
 * 形成中トリプルトップ / ボトムの形成期間の日数由来。**実効値はバー数**で、
 * `getTripleFormingBarParams` が `patterns/bar-thresholds.ts` の換算を通して決める。
 * ここの日数は「その値がどこから来たか」を示す注記であって、暦日数の要件ではない。
 */
export const FORMING_MIN_DAYS = 21;
const FORMING_MAX_DAYS = 90;

const FORMING_TOLERANCE_MULTIPLIER = 1.2;
/**
 * 形成中 Triple Top / Bottom の完成度の下限。
 *
 * **top 側では到達しない。** `completion = min(1, 0.66 + min(1, currentPrice / avgPeakPrice) * 0.34)`
 * で価格は正なので `progress > 0`、つまり `completion > 0.66` になり 0.4 を下回れない
 * （#155 の `detect_hs.ts` `FORMING_MIN_COMPLETION` と同じ事情）。重み側（0.66 / 0.34）を
 * 触ったときに効き始めるガードとして残してある。
 *
 * **bottom 側は到達する。** あちらの `progress` は
 * `(currentPrice - avgValleyPrice) / (avgPeakPrice - avgValleyPrice)` で**負を取りうる**
 * （現在値が谷水準をわずかに下回るケース）。山と谷の差が小さい浅いパターンでは
 * `progress < -0.7647` になり `completion < 0.4` に落ちる。
 *
 * `patterns/min-bars.ts` と同じく、到達性テストが参照するため export する。
 */
export const FORMING_MIN_COMPLETION = 0.4;
const FORMING_MIN_CONFIDENCE = 0.5;
// 形成中トリプル: 3 点目が現在価格で暫定のため、完成済みより上限を厳しくする。
// confidence < 0.6（detectPatternsViewsHandler の低信頼ラベル境界）に抑え、
// 「標準的な形状（0.7-0.8）」として扱われないようにする。
const FORMING_MAX_CONFIDENCE = 0.59;
// 形成中トリプル: 3 山（peak1, peak2, 現在価格）/ 3 谷の max-min 水平性チェック。
// tripleTolerancePct（既定 4.8% = 0.04 × 1.2）と揃え、階段状の切り上がり/切り下がりを弾く。
// 完成済みは 3 山すべてに near() が掛かるため、forming でも同等の制約を入れる。
const FORMING_LEVEL_SPREAD_FACTOR = 1.0; // tripleTolerancePct × 1.0
// 形成中トリプル: 谷（peak3 用）/ 山（valley3 用）の水平性。tolerancePct × FACTOR。
// 完成済みは 1.5%（MAX_VALLEY_SPREAD）と非常に厳しいが、forming はノイズが残るため
// tolerancePct（既定 4%）に緩和する。
const FORMING_NECKLINE_SPREAD_FACTOR = 1.0; // tolerancePct × 1.0
// 形成中トリプル: 完全に単調な切り上がり / 切り下がり（peak1 < peak2 < current 等）
// は triple ではなく上昇継続 / 下降継続として扱うため、累積ステップがこれを超えると弾く。
const FORMING_STAIR_STEP_LIMIT = 0.02;
// ネックラインブレイク判定（detect_doubles と同じ値）
const BREAKOUT_BUFFER_PCT = 0.015;
const MAX_BARS_FROM_EXTREMUM = 20;

/**
 * 形成中トリプルが要求する形成バー数のレンジ（`formationBars = lastIdx - 最初のピボット`）。
 *
 * 旧実装は `patternDays = Math.round(formationBars × daysPerBar)` を作って 21〜90 日で
 * 判定していたため、`1hour` では 492 本、`1min` では 29520 本の形成を要求し、
 * `limit` のスキーマ上限（365）でも到達不能だった（issue #118 問題 2）。
 *
 * `patterns/min-bars.ts` が「時間足 → 最小要求バー数」を導出するのに参照するため export する。
 */
export function getTripleFormingBarParams(tf: string): { minBars: number; maxBars: number } {
	return patternBarRange(tf, FORMING_MIN_DAYS, FORMING_MAX_DAYS);
}

type Pcand = (arg: Parameters<typeof pushCand>[1]) => void;

// ── Helper: ネックラインブレイクインデックスを検出 ──
// detect_doubles.ts と同じロジック（終値ベース、1.5% バッファ、20 バーまで）

function findBreakoutIdx(
	candles: CandleData[],
	afterIdx: number,
	necklinePrice: number,
	direction: 'below' | 'above',
): number {
	const end = Math.min(afterIdx + MAX_BARS_FROM_EXTREMUM + 1, candles.length);
	for (let k = afterIdx + 1; k < end; k++) {
		const closeK = Number(candles[k]?.close ?? NaN);
		if (!Number.isFinite(closeK)) continue;
		if (direction === 'below' && closeK < necklinePrice * (1 - BREAKOUT_BUFFER_PCT)) return k;
		if (direction === 'above' && closeK > necklinePrice * (1 + BREAKOUT_BUFFER_PCT)) return k;
	}
	return -1;
}

// ── Helper: Strict Triple Top ──

function findStrictTripleTop(ctx: DetectContext): DeduplicablePattern[] {
	const { candles, pivots, allValleys, tolerancePct, minDist, near } = ctx;
	const pcand: Pcand = (arg) => pushCand(ctx, arg);
	const patterns: DeduplicablePattern[] = [];
	const highsOnly = pivots.filter((p) => p.kind === 'H');
	if (highsOnly.length < 3) return patterns;

	for (let i = 0; i <= highsOnly.length - 3; i++) {
		const a = highsOnly[i],
			b = highsOnly[i + 1],
			c = highsOnly[i + 2];
		if (b.idx - a.idx < minDist || c.idx - b.idx < minDist) continue;
		const nearAll = near(a.price, b.price) && near(b.price, c.price) && near(a.price, c.price);
		if (!nearAll) continue;
		const start = candles[a.idx].isoTime;
		const structureEnd = candles[c.idx].isoTime;
		if (!(start && structureEnd)) continue;

		// Additional strict checks: valleys equality and neckline slope
		const v1cands = allValleys.filter((v: { idx: number }) => v.idx > a.idx && v.idx < b.idx);
		const v2cands = allValleys.filter((v: { idx: number }) => v.idx > b.idx && v.idx < c.idx);
		const v1 = v1cands.length ? v1cands.reduce((m, v) => (v.price < m.price ? v : m)) : null;
		const v2 = v2cands.length ? v2cands.reduce((m, v) => (v.price < m.price ? v : m)) : null;
		if (!(v1 && v2)) {
			pcand({ type: 'triple_top', accepted: false, reason: 'valleys_missing', idxs: [a.idx, b.idx, c.idx] });
			continue;
		}
		const valleysNear = Math.abs(v1.price - v2.price) / Math.max(1, Math.max(v1.price, v2.price)) <= tolerancePct;
		const necklineSlope = Math.abs(v1.price - v2.price) / Math.max(1, Math.max(v1.price, v2.price));
		const necklineValid = necklineSlope <= NECKLINE_SLOPE_LIMIT;
		if (!(valleysNear && necklineValid)) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: !valleysNear ? 'valleys_not_equal' : 'neckline_slope_excess',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}
		const devs = [relDev(a.price, b.price), relDev(b.price, c.price), relDev(a.price, c.price)];
		const tolMargin = clamp01(1 - devs.reduce((s, v) => s + v, 0) / devs.length / Math.max(1e-12, tolerancePct));
		const span = Math.max(a.price, b.price, c.price) - Math.min(a.price, b.price, c.price);
		const symmetry = clamp01(1 - span / Math.max(1, Math.max(a.price, b.price, c.price)));
		const per = periodScoreDays(start, structureEnd);
		const base = (tolMargin + symmetry + per) / 3;
		const confidence = finalizeConf(base, 'triple_top');

		if (confidence < (MIN_CONFIDENCE.triple_top ?? 0)) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'confidence_below_min',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}

		// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
		const sizeReason = validatePatternSize('top', [a, v1, b, v2, c]);
		if (sizeReason) {
			pcand({ type: 'triple_top', accepted: false, reason: sizeReason, idxs: [a.idx, b.idx, c.idx] });
			continue;
		}

		// ネックラインは 2 つの谷の平均。**ブレイク判定に渡すのと同じ値**を構造ゲートにも渡す
		// （`ReversalStructureInput.necklinePrice` の docstring）。
		const nlAvg = (Number(v1.price) + Number(v2.price)) / 2;

		// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
		// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
		const gate = applyReversalGate({
			candles,
			pivots,
			side: 'top',
			first: a,
			mid: v1,
			necklinePrice: nlAvg,
			type: 'triple_top',
			indices: [a.idx, b.idx, c.idx],
			debugCandidates: ctx.debugCandidates,
		});
		if (!gate) continue;
		const structureGate = buildStructureGate(gate);

		// ネックライン下抜けを検出（c.idx 以降、最大 MAX_BARS_FROM_EXTREMUM バー）
		const breakoutIdx = findBreakoutIdx(candles, c.idx, nlAvg, 'below');
		const isCompleted = breakoutIdx >= 0;
		const rangeEnd = isCompleted ? candles[breakoutIdx]?.isoTime : structureEnd;
		if (!rangeEnd) continue;

		const neckline = [
			{ x: a.idx, y: nlAvg },
			{ x: isCompleted ? breakoutIdx : c.idx, y: nlAvg },
		];
		const diagram: PatternDiagramData = generatePatternDiagram(
			'triple_top',
			[
				{ ...a, date: candles[a.idx]?.isoTime },
				{ ...v1, date: candles[v1.idx]?.isoTime },
				{ ...b, date: candles[b.idx]?.isoTime },
				{ ...v2, date: candles[v2.idx]?.isoTime },
				{ ...c, date: candles[c.idx]?.isoTime },
			],
			{ price: nlAvg },
			{ start, end: rangeEnd },
		);
		const ttAvgPeak = (a.price + b.price + c.price) / 3;
		const ttTarget = Math.round(nlAvg - (ttAvgPeak - nlAvg));
		const breakoutPrice = isCompleted ? Number(candles[breakoutIdx]?.close ?? NaN) : NaN;
		const completionFields = isCompleted
			? {
					status: 'completed' as const,
					confirmation: {
						type: 'neckline_breakout' as const,
						date: rangeEnd,
						idx: breakoutIdx,
						price: breakoutPrice,
					},
					breakout: { idx: breakoutIdx, price: breakoutPrice },
					breakoutBarIndex: breakoutIdx,
					breakoutDate: rangeEnd,
					breakoutDirection: 'down' as const,
					outcome: 'success' as const,
				}
			: {
					status: 'near_completion' as const,
					confirmation: { type: 'not_confirmed' as const },
				};

		patterns.push({
			type: 'triple_top',
			confidence,
			range: { start, end: rangeEnd },
			structureRange: { start, end: structureEnd },
			...completionFields,
			pivots: [a, b, c],
			neckline,
			...(structureGate ? { structureGate } : {}),
			trendlineLabel: 'ネックライン',
			breakoutTarget: ttTarget,
			targetMethod: 'neckline_projection' as const,
			...(diagram ? { structureDiagram: diagram } : {}),
		});
		pcand({
			type: 'triple_top',
			accepted: true,
			idxs: isCompleted ? [a.idx, b.idx, c.idx, breakoutIdx] : [a.idx, b.idx, c.idx],
			pts: [
				{ role: 'peak1', idx: a.idx, price: a.price },
				{ role: 'peak2', idx: b.idx, price: b.price },
				{ role: 'peak3', idx: c.idx, price: c.price },
				...(isCompleted ? [{ role: 'breakout', idx: breakoutIdx, price: breakoutPrice }] : []),
			],
		});
	}

	return patterns;
}

// ── Helper: Strict Triple Bottom ──

function findStrictTripleBottom(ctx: DetectContext): DeduplicablePattern[] {
	const { candles, pivots, allPeaks, tolerancePct, minDist, near } = ctx;
	const pcand: Pcand = (arg) => pushCand(ctx, arg);
	const patterns: DeduplicablePattern[] = [];
	const lowsOnly = pivots.filter((p) => p.kind === 'L');
	if (lowsOnly.length < 3) return patterns;

	for (let i = 0; i <= lowsOnly.length - 3; i++) {
		const a = lowsOnly[i],
			b = lowsOnly[i + 1],
			c = lowsOnly[i + 2];
		if (b.idx - a.idx < minDist || c.idx - b.idx < minDist) continue;
		const nearAll = near(a.price, b.price) && near(b.price, c.price) && near(a.price, c.price);
		if (!nearAll) continue;
		const start = candles[a.idx].isoTime;
		const structureEnd = candles[c.idx].isoTime;
		if (!(start && structureEnd)) continue;

		// Additional strict checks: 3 valleys near + spread limit, peaks near and neckline slope limit
		const valleyPrices = [a.price, b.price, c.price];
		const valleyNearStrict = near(a.price, b.price) && near(b.price, c.price) && near(a.price, c.price);
		const valleyMin = Math.min(...valleyPrices);
		const valleyMax = Math.max(...valleyPrices);
		const valleySpreadValid = (valleyMax - valleyMin) / Math.max(1, valleyMin) <= MAX_VALLEY_SPREAD;
		const p1cands = allPeaks.filter((v: { idx: number }) => v.idx > a.idx && v.idx < b.idx);
		const p2cands = allPeaks.filter((v: { idx: number }) => v.idx > b.idx && v.idx < c.idx);
		const p1 = p1cands.length ? p1cands.reduce((m, v) => (v.price > m.price ? v : m)) : null;
		const p2 = p2cands.length ? p2cands.reduce((m, v) => (v.price > m.price ? v : m)) : null;
		if (!(p1 && p2)) {
			pcand({ type: 'triple_bottom', accepted: false, reason: 'peaks_missing', idxs: [a.idx, b.idx, c.idx] });
			continue;
		}
		const peaksNear = Math.abs(p1.price - p2.price) / Math.max(1, Math.max(p1.price, p2.price)) <= tolerancePct;
		const necklineSlope = Math.abs(p1.price - p2.price) / Math.max(1, Math.max(p1.price, p2.price));
		const necklineValid = necklineSlope <= NECKLINE_SLOPE_LIMIT;
		if (!(valleyNearStrict && valleySpreadValid && peaksNear && necklineValid)) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: !valleyNearStrict
					? 'valleys_not_equal'
					: !valleySpreadValid
						? 'valley_spread_excess'
						: !peaksNear
							? 'peaks_not_equal'
							: 'neckline_slope_excess',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}
		const devs = [relDev(a.price, b.price), relDev(b.price, c.price), relDev(a.price, c.price)];
		const tolMargin = clamp01(1 - devs.reduce((s, v) => s + v, 0) / devs.length / Math.max(1e-12, tolerancePct));
		const span = Math.max(a.price, b.price, c.price) - Math.min(a.price, b.price, c.price);
		const symmetry = clamp01(1 - span / Math.max(1, Math.max(a.price, b.price, c.price)));
		const per = periodScoreDays(start, structureEnd);
		const base = (tolMargin + symmetry + per) / 3;
		const confidence = finalizeConf(base, 'triple_bottom');

		if (confidence < (MIN_CONFIDENCE.triple_bottom ?? 0)) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'confidence_below_min',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}

		// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
		const sizeReason = validatePatternSize('bottom', [a, p1, b, p2, c]);
		if (sizeReason) {
			pcand({ type: 'triple_bottom', accepted: false, reason: sizeReason, idxs: [a.idx, b.idx, c.idx] });
			continue;
		}

		// ネックラインは 2 つの山の平均。**ブレイク判定に渡すのと同じ値**を構造ゲートにも渡す
		// （`ReversalStructureInput.necklinePrice` の docstring）。
		const nlAvg = (Number(p1.price) + Number(p2.price)) / 2;

		// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
		// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
		const gate = applyReversalGate({
			candles,
			pivots,
			side: 'bottom',
			first: a,
			mid: p1,
			necklinePrice: nlAvg,
			type: 'triple_bottom',
			indices: [a.idx, b.idx, c.idx],
			debugCandidates: ctx.debugCandidates,
		});
		if (!gate) continue;
		const structureGate = buildStructureGate(gate);

		// ネックライン上抜けを検出（c.idx 以降、最大 MAX_BARS_FROM_EXTREMUM バー）
		const breakoutIdx = findBreakoutIdx(candles, c.idx, nlAvg, 'above');
		const isCompleted = breakoutIdx >= 0;
		const rangeEnd = isCompleted ? candles[breakoutIdx]?.isoTime : structureEnd;
		if (!rangeEnd) continue;

		const neckline = [
			{ x: a.idx, y: nlAvg },
			{ x: isCompleted ? breakoutIdx : c.idx, y: nlAvg },
		];
		const diagram: PatternDiagramData = generatePatternDiagram(
			'triple_bottom',
			[
				{ ...a, date: candles[a.idx]?.isoTime },
				{ ...p1, date: candles[p1.idx]?.isoTime },
				{ ...b, date: candles[b.idx]?.isoTime },
				{ ...p2, date: candles[p2.idx]?.isoTime },
				{ ...c, date: candles[c.idx]?.isoTime },
			],
			{ price: nlAvg },
			{ start, end: rangeEnd },
		);
		const tbAvgValley = (a.price + b.price + c.price) / 3;
		const tbTarget = Math.round(nlAvg + (nlAvg - tbAvgValley));
		const breakoutPrice = isCompleted ? Number(candles[breakoutIdx]?.close ?? NaN) : NaN;
		const completionFields = isCompleted
			? {
					status: 'completed' as const,
					confirmation: {
						type: 'neckline_breakout' as const,
						date: rangeEnd,
						idx: breakoutIdx,
						price: breakoutPrice,
					},
					breakout: { idx: breakoutIdx, price: breakoutPrice },
					breakoutBarIndex: breakoutIdx,
					breakoutDate: rangeEnd,
					breakoutDirection: 'up' as const,
					outcome: 'success' as const,
				}
			: {
					status: 'near_completion' as const,
					confirmation: { type: 'not_confirmed' as const },
				};

		patterns.push({
			type: 'triple_bottom',
			confidence,
			range: { start, end: rangeEnd },
			structureRange: { start, end: structureEnd },
			...completionFields,
			pivots: [a, b, c],
			neckline,
			...(structureGate ? { structureGate } : {}),
			trendlineLabel: 'ネックライン',
			breakoutTarget: tbTarget,
			targetMethod: 'neckline_projection' as const,
			...(diagram ? { structureDiagram: diagram } : {}),
		});
		pcand({
			type: 'triple_bottom',
			accepted: true,
			idxs: isCompleted ? [a.idx, b.idx, c.idx, breakoutIdx] : [a.idx, b.idx, c.idx],
			pts: [
				{ role: 'valley1', idx: a.idx, price: a.price },
				{ role: 'valley2', idx: b.idx, price: b.price },
				{ role: 'valley3', idx: c.idx, price: c.price },
				...(isCompleted ? [{ role: 'breakout', idx: breakoutIdx, price: breakoutPrice }] : []),
			],
		});
	}

	return patterns;
}

// ── Helper: Relaxed Triple Top fallback ──

function findRelaxedTripleTop(ctx: DetectContext, factor: number): DeduplicablePattern | null {
	const { candles, pivots, allValleys, tolerancePct, minDist } = ctx;
	const pcand: Pcand = (arg) => pushCand(ctx, arg);
	const tolTriple = tolerancePct * factor;
	const nearTriple = (x: number, y: number) => Math.abs(x - y) / Math.max(1, Math.max(x, y)) <= tolTriple;
	const highsOnly = pivots.filter((p) => p.kind === 'H');

	for (let i = 0; i <= highsOnly.length - 3; i++) {
		const a = highsOnly[i],
			b = highsOnly[i + 1],
			c = highsOnly[i + 2];
		if (b.idx - a.idx < minDist || c.idx - b.idx < minDist) continue;
		if (!(nearTriple(a.price, b.price) && nearTriple(b.price, c.price))) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'peaks_not_equal_relaxed',
				idxs: [a.idx, b.idx, c.idx],
				pts: [
					{ role: 'peak1', idx: a.idx, price: a.price },
					{ role: 'peak2', idx: b.idx, price: b.price },
					{ role: 'peak3', idx: c.idx, price: c.price },
				],
			});
			continue;
		}
		const start = candles[a.idx].isoTime,
			structureEnd = candles[c.idx].isoTime;
		if (!start || !structureEnd) continue;
		const devs = [relDev(a.price, b.price), relDev(b.price, c.price), relDev(a.price, c.price)];
		const tolMargin = clamp01(1 - devs.reduce((s, v) => s + v, 0) / devs.length / Math.max(1e-12, tolTriple));
		const span = Math.max(a.price, b.price, c.price) - Math.min(a.price, b.price, c.price);
		const symmetry = clamp01(1 - span / Math.max(1, Math.max(a.price, b.price, c.price)));
		const per = periodScoreDays(start, structureEnd);
		const base = (tolMargin + symmetry + per) / 3;
		const confidence = finalizeConf(base * 0.95, 'triple_top');
		// valleys for neckline & diagram
		const v1cands = allValleys.filter((v: { idx: number }) => v.idx > a.idx && v.idx < b.idx);
		const v2cands = allValleys.filter((v: { idx: number }) => v.idx > b.idx && v.idx < c.idx);
		const v1 = v1cands.length ? v1cands.reduce((m, v) => (v.price < m.price ? v : m)) : null;
		const v2 = v2cands.length ? v2cands.reduce((m, v) => (v.price < m.price ? v : m)) : null;
		if (!(v1 && v2)) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'valleys_missing_relaxed',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}
		const necklineSlope = Math.abs(v1.price - v2.price) / Math.max(1, Math.max(v1.price, v2.price));
		if (necklineSlope > NECKLINE_SLOPE_LIMIT) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'neckline_slope_excess_relaxed',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}
		if (confidence < (MIN_CONFIDENCE.triple_top ?? 0)) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'confidence_below_min_relaxed',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue; // 後続候補で confidence が足りるものを探す
		}

		// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
		const sizeReason = validatePatternSize('top', [a, v1, b, v2, c]);
		if (sizeReason) {
			pcand({ type: 'triple_top', accepted: false, reason: sizeReason, idxs: [a.idx, b.idx, c.idx] });
			continue;
		}

		// ネックラインは 2 つの谷の平均。**ブレイク判定に渡すのと同じ値**を構造ゲートにも渡す
		// （`ReversalStructureInput.necklinePrice` の docstring）。
		const nlAvg = (Number(v1.price) + Number(v2.price)) / 2;

		// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
		// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
		const gate = applyReversalGate({
			candles,
			pivots,
			side: 'top',
			first: a,
			mid: v1,
			necklinePrice: nlAvg,
			type: 'triple_top',
			indices: [a.idx, b.idx, c.idx],
			debugCandidates: ctx.debugCandidates,
		});
		if (!gate) continue;
		const structureGate = buildStructureGate(gate);

		// ネックライン下抜け検出
		const breakoutIdx = findBreakoutIdx(candles, c.idx, nlAvg, 'below');
		const isCompleted = breakoutIdx >= 0;
		const rangeEnd = isCompleted ? candles[breakoutIdx]?.isoTime : structureEnd;
		if (!rangeEnd) continue;

		const neckline = [
			{ x: a.idx, y: nlAvg },
			{ x: isCompleted ? breakoutIdx : c.idx, y: nlAvg },
		];
		const diagram: PatternDiagramData = generatePatternDiagram(
			'triple_top',
			[
				{ ...a, date: candles[a.idx]?.isoTime },
				{ ...v1, date: candles[v1.idx]?.isoTime },
				{ ...b, date: candles[b.idx]?.isoTime },
				{ ...v2, date: candles[v2.idx]?.isoTime },
				{ ...c, date: candles[c.idx]?.isoTime },
			],
			{ price: nlAvg },
			{ start, end: rangeEnd },
		);
		const ttRelAvgPeak = (a.price + b.price + c.price) / 3;
		const ttRelTarget = Math.round(nlAvg - (ttRelAvgPeak - nlAvg));
		const breakoutPrice = isCompleted ? Number(candles[breakoutIdx]?.close ?? NaN) : NaN;
		const completionFields = isCompleted
			? {
					status: 'completed' as const,
					confirmation: {
						type: 'neckline_breakout' as const,
						date: rangeEnd,
						idx: breakoutIdx,
						price: breakoutPrice,
					},
					breakout: { idx: breakoutIdx, price: breakoutPrice },
					breakoutBarIndex: breakoutIdx,
					breakoutDate: rangeEnd,
					breakoutDirection: 'down' as const,
					outcome: 'success' as const,
				}
			: {
					status: 'near_completion' as const,
					confirmation: { type: 'not_confirmed' as const },
				};
		return {
			type: 'triple_top',
			confidence,
			range: { start, end: rangeEnd },
			structureRange: { start, end: structureEnd },
			...completionFields,
			pivots: [a, b, c],
			neckline,
			...(structureGate ? { structureGate } : {}),
			trendlineLabel: 'ネックライン',
			breakoutTarget: ttRelTarget,
			targetMethod: 'neckline_projection' as const,
			...(diagram ? { structureDiagram: diagram } : {}),
			_fallback: `relaxed_triple_x${factor}`,
		};
	}
	return null;
}

// ── Helper: Relaxed Triple Bottom fallback ──

function findRelaxedTripleBottom(ctx: DetectContext, factor: number): DeduplicablePattern | null {
	const { candles, pivots, allPeaks, tolerancePct, minDist } = ctx;
	const pcand: Pcand = (arg) => pushCand(ctx, arg);
	const tolTriple = tolerancePct * factor;
	const nearTriple = (x: number, y: number) => Math.abs(x - y) / Math.max(1, Math.max(x, y)) <= tolTriple;
	const lowsOnly = pivots.filter((p) => p.kind === 'L');

	for (let i = 0; i <= lowsOnly.length - 3; i++) {
		const a = lowsOnly[i],
			b = lowsOnly[i + 1],
			c = lowsOnly[i + 2];
		if (b.idx - a.idx < minDist || c.idx - b.idx < minDist) continue;
		if (!(nearTriple(a.price, b.price) && nearTriple(b.price, c.price))) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'valleys_not_equal_relaxed',
				idxs: [a.idx, b.idx, c.idx],
				pts: [
					{ role: 'valley1', idx: a.idx, price: a.price },
					{ role: 'valley2', idx: b.idx, price: b.price },
					{ role: 'valley3', idx: c.idx, price: c.price },
				],
			});
			continue;
		}
		const start = candles[a.idx].isoTime,
			structureEnd = candles[c.idx].isoTime;
		if (!start || !structureEnd) continue;
		const devs = [relDev(a.price, b.price), relDev(b.price, c.price), relDev(a.price, c.price)];
		const tolMargin = clamp01(1 - devs.reduce((s, v) => s + v, 0) / devs.length / Math.max(1e-12, tolTriple));
		const span = Math.max(a.price, b.price, c.price) - Math.min(a.price, b.price, c.price);
		const symmetry = clamp01(1 - span / Math.max(1, Math.max(a.price, b.price, c.price)));
		const per = periodScoreDays(start, structureEnd);
		const base = (tolMargin + symmetry + per) / 3;
		const confidence = finalizeConf(base * 0.95, 'triple_bottom');
		// peaks for neckline & diagram
		const p1cands = allPeaks.filter((v: { idx: number }) => v.idx > a.idx && v.idx < b.idx);
		const p2cands = allPeaks.filter((v: { idx: number }) => v.idx > b.idx && v.idx < c.idx);
		const p1 = p1cands.length ? p1cands.reduce((m, v) => (v.price > m.price ? v : m)) : null;
		const p2 = p2cands.length ? p2cands.reduce((m, v) => (v.price > m.price ? v : m)) : null;
		if (!(p1 && p2)) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'peaks_missing_relaxed',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}
		const necklineSlope = Math.abs(p1.price - p2.price) / Math.max(1, Math.max(p1.price, p2.price));
		if (necklineSlope > NECKLINE_SLOPE_LIMIT) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'neckline_slope_excess_relaxed',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}
		if (confidence < (MIN_CONFIDENCE.triple_bottom ?? 0)) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'confidence_below_min_relaxed',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue; // 後続候補で confidence が足りるものを探す
		}

		// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
		const sizeReason = validatePatternSize('bottom', [a, p1, b, p2, c]);
		if (sizeReason) {
			pcand({ type: 'triple_bottom', accepted: false, reason: sizeReason, idxs: [a.idx, b.idx, c.idx] });
			continue;
		}

		// ネックラインは 2 つの山の平均。**ブレイク判定に渡すのと同じ値**を構造ゲートにも渡す
		// （`ReversalStructureInput.necklinePrice` の docstring）。
		const nlAvg = (Number(p1.price) + Number(p2.price)) / 2;

		// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
		// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
		const gate = applyReversalGate({
			candles,
			pivots,
			side: 'bottom',
			first: a,
			mid: p1,
			necklinePrice: nlAvg,
			type: 'triple_bottom',
			indices: [a.idx, b.idx, c.idx],
			debugCandidates: ctx.debugCandidates,
		});
		if (!gate) continue;
		const structureGate = buildStructureGate(gate);

		// ネックライン上抜け検出
		const breakoutIdx = findBreakoutIdx(candles, c.idx, nlAvg, 'above');
		const isCompleted = breakoutIdx >= 0;
		const rangeEnd = isCompleted ? candles[breakoutIdx]?.isoTime : structureEnd;
		if (!rangeEnd) continue;

		const neckline = [
			{ x: a.idx, y: nlAvg },
			{ x: isCompleted ? breakoutIdx : c.idx, y: nlAvg },
		];
		const diagram: PatternDiagramData = generatePatternDiagram(
			'triple_bottom',
			[
				{ ...a, date: candles[a.idx]?.isoTime },
				{ ...p1, date: candles[p1.idx]?.isoTime },
				{ ...b, date: candles[b.idx]?.isoTime },
				{ ...p2, date: candles[p2.idx]?.isoTime },
				{ ...c, date: candles[c.idx]?.isoTime },
			],
			{ price: nlAvg },
			{ start, end: rangeEnd },
		);
		const tbRelAvgValley = (a.price + b.price + c.price) / 3;
		const tbRelTarget = Math.round(nlAvg + (nlAvg - tbRelAvgValley));
		const breakoutPrice = isCompleted ? Number(candles[breakoutIdx]?.close ?? NaN) : NaN;
		const completionFields = isCompleted
			? {
					status: 'completed' as const,
					confirmation: {
						type: 'neckline_breakout' as const,
						date: rangeEnd,
						idx: breakoutIdx,
						price: breakoutPrice,
					},
					breakout: { idx: breakoutIdx, price: breakoutPrice },
					breakoutBarIndex: breakoutIdx,
					breakoutDate: rangeEnd,
					breakoutDirection: 'up' as const,
					outcome: 'success' as const,
				}
			: {
					status: 'near_completion' as const,
					confirmation: { type: 'not_confirmed' as const },
				};
		return {
			type: 'triple_bottom',
			confidence,
			range: { start, end: rangeEnd },
			structureRange: { start, end: structureEnd },
			...completionFields,
			pivots: [a, b, c],
			neckline,
			...(structureGate ? { structureGate } : {}),
			trendlineLabel: 'ネックライン',
			breakoutTarget: tbRelTarget,
			targetMethod: 'neckline_projection' as const,
			...(diagram ? { structureDiagram: diagram } : {}),
			_fallback: `relaxed_triple_x${factor}`,
		};
	}
	return null;
}

// ── Helper: 形成中 Triple Top ──

/**
 * 形成中 Triple Top を組み立てる。組めなければ null。
 *
 * ## debug candidate の積み方（issue #158）
 *
 * 成功時に `accepted: true` / `status: 'forming'` を積む。**`accepted: true` は「検出器が
 * 組み立てた」であって「最終出力に残った」ではない**——後段 `detect_patterns.ts` の
 * `globalDedup` に畳まれて `data.patterns` に出ないことがある（#155 と同じ約束）。
 * ループは成功で即 `return` するので、1 回の呼び出しで積まれる成功エントリは高々 1 件。
 *
 * 棄却の理由コードは**構成点が揃った後の分岐にだけ**積む。ピークペアを回すループなので、
 * 揃う前の `continue`（`minDist` 不足 / `peakDiff` 超過 / `currentDiff` 超過）はペア数ぶん
 * 発火し、`detect_patterns.ts` の cap=200 を食い潰して**他の検出器の棄却理由を押し出す**。
 * #155 が `formingHsForHead` で置いた制約と同じ。
 */
function tryFormingTripleTop(ctx: DetectContext): DeduplicablePattern | null {
	const { candles, pivots, allPeaks, allValleys, tolerancePct, minDist } = ctx;
	const pcand: Pcand = (arg) => pushCand(ctx, arg);
	const lastIdx = candles.length - 1;
	const currentPrice = Number(candles[lastIdx]?.close ?? NaN);
	const isoAt = (i: number) => candles[i]?.isoTime || '';
	const formingBars = getTripleFormingBarParams(ctx.type);
	const tripleTolerancePct = tolerancePct * FORMING_TOLERANCE_MULTIPLIER;
	const levelSpreadLimit = tripleTolerancePct * FORMING_LEVEL_SPREAD_FACTOR;
	const necklineSpreadLimit = tolerancePct * FORMING_NECKLINE_SPREAD_FACTOR;

	if (allPeaks.length < 2) return null;
	const confirmedPeaks = allPeaks.filter((p: { idx: number }) => p.idx < lastIdx - 2);

	for (let i = confirmedPeaks.length - 1; i >= 1; i--) {
		const peak2 = confirmedPeaks[i];
		const peak1 = confirmedPeaks[i - 1];
		if (peak2.idx - peak1.idx < minDist) continue;

		const peakDiff = Math.abs(peak1.price - peak2.price) / Math.max(1, Math.max(peak1.price, peak2.price));
		if (peakDiff > tripleTolerancePct) continue;

		const avgPeakPrice = (peak1.price + peak2.price) / 2;
		const currentDiff = Math.abs(currentPrice - avgPeakPrice) / Math.max(1, avgPeakPrice);
		if (currentDiff > tripleTolerancePct || currentPrice < avgPeakPrice * 0.95) continue;

		// 階段状の切り上がり（peak1 < peak2 < current）は triple_top ではなく
		// 上昇継続として扱う。level spread より具体的な診断のため最初に評価する。
		if (peak1.price < peak2.price && peak2.price < currentPrice) {
			const totalStep = (currentPrice - peak1.price) / Math.max(1, peak1.price);
			if (totalStep > FORMING_STAIR_STEP_LIMIT) {
				pcand({
					type: 'triple_top',
					accepted: false,
					reason: 'forming_stair_step_up',
					idxs: [peak1.idx, peak2.idx, lastIdx],
					pts: [
						{ role: 'peak1', idx: peak1.idx, price: peak1.price },
						{ role: 'peak2', idx: peak2.idx, price: peak2.price },
						{ role: 'current', idx: lastIdx, price: currentPrice },
					],
				});
				continue;
			}
		}

		// 3 山（peak1, peak2, 現在価格）の水平性チェック。
		// peak1-peak2 と current-avg の個別チェックだけでは、非単調な配置
		// （例: 100 → 95 → 100）でも累積 spread が大きいケースを捉えられない。
		// 3 点の max-min spread を直接見ることで、累積した非水平性を弾く。
		const levelMax = Math.max(peak1.price, peak2.price, currentPrice);
		const levelMin = Math.min(peak1.price, peak2.price, currentPrice);
		const levelSpread = (levelMax - levelMin) / Math.max(1, levelMax);
		if (levelSpread > levelSpreadLimit) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'forming_peaks_not_level',
				idxs: [peak1.idx, peak2.idx, lastIdx],
				pts: [
					{ role: 'peak1', idx: peak1.idx, price: peak1.price },
					{ role: 'peak2', idx: peak2.idx, price: peak2.price },
					{ role: 'current', idx: lastIdx, price: currentPrice },
				],
			});
			continue;
		}

		const formationBars = Math.max(0, lastIdx - peak1.idx);
		if (formationBars < formingBars.minBars || formationBars > formingBars.maxBars) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'forming_bars_out_of_range',
				idxs: [peak1.idx, peak2.idx, lastIdx],
				pts: [
					{ role: 'peak1', idx: peak1.idx, price: peak1.price },
					{ role: 'peak2', idx: peak2.idx, price: peak2.price },
					{ role: 'current', idx: lastIdx, price: currentPrice },
				],
			});
			continue;
		}

		// ネックライン構成点: H-L-H-L-(現在足) という構造を強制するため、
		// 谷を peak1-peak2 区間と peak2-現在足 区間にそれぞれ 1 つ以上要求する。
		// 区間別に縛らず合計数だけ見ると、2 谷が両方 peak1-peak2 間にあって peak2
		// 以降に谷がない「H-L-L-H-」のようなケースが通ってしまう。
		const v1Cands = allValleys.filter((v: { idx: number }) => v.idx > peak1.idx && v.idx < peak2.idx);
		const v2Cands = allValleys.filter((v: { idx: number }) => v.idx > peak2.idx && v.idx < lastIdx);
		if (v1Cands.length === 0 || v2Cands.length === 0) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'forming_neckline_points_insufficient',
				idxs: [peak1.idx, peak2.idx, lastIdx],
			});
			continue;
		}
		// strict triple_top と同じ方針で、各区間の最安値を採用する。
		const v1 = v1Cands.reduce((m, v) => (v.price < m.price ? v : m));
		const v2 = v2Cands.reduce((m, v) => (v.price < m.price ? v : m));

		// ネックライン水平性: 採用した 2 谷の price 差をネックライン傾きとして見る。
		const valleyMax = Math.max(v1.price, v2.price);
		const valleyMin = Math.min(v1.price, v2.price);
		const valleySpread = (valleyMax - valleyMin) / Math.max(1, valleyMax);
		if (valleySpread > necklineSpreadLimit) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'forming_neckline_not_horizontal',
				idxs: [peak1.idx, peak2.idx, lastIdx],
			});
			continue;
		}

		const progress = Math.min(1, currentPrice / avgPeakPrice);
		const completion = Math.min(1, 0.66 + progress * 0.34);
		const rawConfidence = Math.round((1 - currentDiff / tripleTolerancePct) * 0.8 * 100) / 100;
		// 3 点目が現在価格で暫定のため、completed より低い上限に抑える。
		const confidence = Math.min(rawConfidence, FORMING_MAX_CONFIDENCE);

		if (completion < FORMING_MIN_COMPLETION || confidence < FORMING_MIN_CONFIDENCE) {
			// この時点ではネックラインの 2 谷まで揃っているので、成功エントリと同じ 5 点を積む
			// （同じ経路の ✅ と ❌ を並べて読めるようにするのが #158 の目的）。
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: completion < FORMING_MIN_COMPLETION ? 'forming_completion_below_min' : 'forming_confidence_below_min',
				idxs: [peak1.idx, peak2.idx, lastIdx],
				pts: [
					{ role: 'peak1', idx: peak1.idx, price: peak1.price },
					{ role: 'valley1', idx: v1.idx, price: v1.price },
					{ role: 'peak2', idx: peak2.idx, price: peak2.price },
					{ role: 'valley2', idx: v2.idx, price: v2.price },
					{ role: 'current', idx: lastIdx, price: currentPrice },
				],
			});
			continue;
		}

		// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
		const sizeReason = validatePatternSize('top', [peak1, v1, peak2, v2, { extremePrice: currentPrice }]);
		if (sizeReason) {
			pcand({ type: 'triple_top', accepted: false, reason: sizeReason, idxs: [peak1.idx, peak2.idx, lastIdx] });
			continue;
		}

		// ネックラインは v1, v2 の平均で引く（strict triple_top と同じ方針）。
		const avgValley = (v1.price + v2.price) / 2;

		// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
		// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
		const gate = applyReversalGate({
			candles,
			pivots,
			side: 'top',
			first: peak1,
			mid: v1,
			necklinePrice: avgValley,
			type: 'triple_top',
			indices: [peak1.idx, peak2.idx, lastIdx],
			debugCandidates: ctx.debugCandidates,
		});
		if (!gate) continue;
		const structureGate = buildStructureGate(gate);

		const neckline = [
			{ x: peak1.idx, y: avgValley },
			{ x: lastIdx, y: avgValley },
		];

		const formTtTarget = Math.round(avgValley - ((peak1.price + peak2.price) / 2 - avgValley));

		// 成功エントリ（issue #158）。`indices` は既存の棄却エントリと同じ 3 点に揃え、
		// ネックラインを引いた 2 谷は `points` にだけ足す（#155 の `pre_head_valley` と同じ扱い）。
		// 最新足は確定ピボットではないので role を `current` で区別する。
		pcand({
			type: 'triple_top',
			accepted: true,
			status: 'forming',
			idxs: [peak1.idx, peak2.idx, lastIdx],
			pts: [
				{ role: 'peak1', idx: peak1.idx, price: peak1.price },
				{ role: 'valley1', idx: v1.idx, price: v1.price },
				{ role: 'peak2', idx: peak2.idx, price: peak2.price },
				{ role: 'valley2', idx: v2.idx, price: v2.price },
				{ role: 'current', idx: lastIdx, price: currentPrice },
			],
		});

		return {
			type: 'triple_top',
			confidence,
			range: { start: isoAt(peak1.idx), end: isoAt(lastIdx) },
			status: 'forming',
			pivots: [
				{ idx: peak1.idx, price: peak1.price, kind: 'H' as const, extremePrice: peak1.extremePrice },
				{ idx: peak2.idx, price: peak2.price, kind: 'H' as const, extremePrice: peak2.extremePrice },
			],
			neckline,
			...(structureGate ? { structureGate } : {}),
			trendlineLabel: 'ネックライン',
			breakoutTarget: formTtTarget,
			targetMethod: 'neckline_projection' as const,
			completionPct: Math.round(completion * 100),
			_method: 'forming_triple_top',
		};
	}
	return null;
}

// ── Helper: 形成中 Triple Bottom ──

/**
 * 形成中 Triple Bottom を組み立てる。組めなければ null。
 * debug candidate の積み方（成功エントリの意味・理由コードを積む分岐の範囲）は
 * {@link tryFormingTripleTop} の docstring が単一ソース。
 */
function tryFormingTripleBottom(ctx: DetectContext): DeduplicablePattern | null {
	const { candles, pivots, allPeaks, allValleys, tolerancePct, minDist } = ctx;
	const pcand: Pcand = (arg) => pushCand(ctx, arg);
	const lastIdx = candles.length - 1;
	const currentPrice = Number(candles[lastIdx]?.close ?? NaN);
	const isoAt = (i: number) => candles[i]?.isoTime || '';
	const formingBars = getTripleFormingBarParams(ctx.type);
	const tripleTolerancePct = tolerancePct * FORMING_TOLERANCE_MULTIPLIER;
	const levelSpreadLimit = tripleTolerancePct * FORMING_LEVEL_SPREAD_FACTOR;
	const necklineSpreadLimit = tolerancePct * FORMING_NECKLINE_SPREAD_FACTOR;

	if (allValleys.length < 2) return null;
	const confirmedValleys = allValleys.filter((v: { idx: number }) => v.idx < lastIdx - 2);

	for (let i = confirmedValleys.length - 1; i >= 1; i--) {
		const valley2 = confirmedValleys[i];
		const valley1 = confirmedValleys[i - 1];
		if (valley2.idx - valley1.idx < minDist) continue;

		const valleyDiff = Math.abs(valley1.price - valley2.price) / Math.max(1, Math.max(valley1.price, valley2.price));
		if (valleyDiff > tripleTolerancePct) continue;

		const avgValleyPrice = (valley1.price + valley2.price) / 2;

		// ネックライン構成点: L-H-L-H-(現在足) という構造を強制するため、
		// 山を valley1-valley2 区間と valley2-現在足 区間にそれぞれ 1 つ以上要求する。
		const p1Cands = allPeaks.filter((p: { idx: number }) => p.idx > valley1.idx && p.idx < valley2.idx);
		const p2Cands = allPeaks.filter((p: { idx: number }) => p.idx > valley2.idx && p.idx < lastIdx);
		if (p1Cands.length === 0 || p2Cands.length === 0) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'forming_neckline_points_insufficient',
				idxs: [valley1.idx, valley2.idx, lastIdx],
			});
			continue;
		}
		// strict triple_bottom と同じ方針で、各区間の最高値を採用する。
		const pTop1 = p1Cands.reduce((m, p) => (p.price > m.price ? p : m));
		const pTop2 = p2Cands.reduce((m, p) => (p.price > m.price ? p : m));

		// ネックライン水平性: 採用した 2 山の price 差をネックライン傾きとして見る。
		const peakMaxN = Math.max(pTop1.price, pTop2.price);
		const peakMinN = Math.min(pTop1.price, pTop2.price);
		const peakSpread = (peakMaxN - peakMinN) / Math.max(1, peakMaxN);
		if (peakSpread > necklineSpreadLimit) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'forming_neckline_not_horizontal',
				idxs: [valley1.idx, valley2.idx, lastIdx],
			});
			continue;
		}

		const avgPeakPrice = (pTop1.price + pTop2.price) / 2;

		// 現在価格は 3 谷目候補として valley 水準に近いことを要求する
		// （triple_top の currentDiff チェックと対称）。
		// 旧実装では currentPrice が avgValley*0.98 〜 avgPeak*1.02 まで広く許容され、
		// 「現在価格が中段にあるだけ」のケースを forming triple_bottom として拾っていた。
		const currentDiff = Math.abs(currentPrice - avgValleyPrice) / Math.max(1, avgValleyPrice);
		if (currentDiff > tripleTolerancePct || currentPrice > avgValleyPrice * 1.05) continue;

		// 階段状の切り下がり（valley1 > valley2 > current）は triple_bottom ではなく
		// 下降継続として扱う。level spread より具体的な診断のため最初に評価する。
		if (valley1.price > valley2.price && valley2.price > currentPrice) {
			const totalStep = (valley1.price - currentPrice) / Math.max(1, valley1.price);
			if (totalStep > FORMING_STAIR_STEP_LIMIT) {
				pcand({
					type: 'triple_bottom',
					accepted: false,
					reason: 'forming_stair_step_down',
					idxs: [valley1.idx, valley2.idx, lastIdx],
					pts: [
						{ role: 'valley1', idx: valley1.idx, price: valley1.price },
						{ role: 'valley2', idx: valley2.idx, price: valley2.price },
						{ role: 'current', idx: lastIdx, price: currentPrice },
					],
				});
				continue;
			}
		}

		// 3 谷（valley1, valley2, 現在価格）の水平性チェック。
		// 非単調な配置（例: 100 → 95 → 100）でも累積 spread が大きいケースを弾く。
		const levelMax = Math.max(valley1.price, valley2.price, currentPrice);
		const levelMin = Math.min(valley1.price, valley2.price, currentPrice);
		const levelSpread = (levelMax - levelMin) / Math.max(1, levelMax);
		if (levelSpread > levelSpreadLimit) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'forming_valleys_not_level',
				idxs: [valley1.idx, valley2.idx, lastIdx],
				pts: [
					{ role: 'valley1', idx: valley1.idx, price: valley1.price },
					{ role: 'valley2', idx: valley2.idx, price: valley2.price },
					{ role: 'current', idx: lastIdx, price: currentPrice },
				],
			});
			continue;
		}

		const formationBars = Math.max(0, lastIdx - valley1.idx);
		if (formationBars < formingBars.minBars || formationBars > formingBars.maxBars) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'forming_bars_out_of_range',
				idxs: [valley1.idx, valley2.idx, lastIdx],
				pts: [
					{ role: 'valley1', idx: valley1.idx, price: valley1.price },
					{ role: 'valley2', idx: valley2.idx, price: valley2.price },
					{ role: 'current', idx: lastIdx, price: currentPrice },
				],
			});
			continue;
		}

		const progress = (currentPrice - avgValleyPrice) / Math.max(1e-12, avgPeakPrice - avgValleyPrice);
		const completion = Math.min(1, 0.66 + Math.min(1, progress) * 0.34);
		const rawConfidence = Math.round((1 - valleyDiff / tripleTolerancePct) * 0.8 * 100) / 100;
		// 3 点目が現在価格で暫定のため、completed より低い上限に抑える。
		const confidence = Math.min(rawConfidence, FORMING_MAX_CONFIDENCE);

		if (completion < FORMING_MIN_COMPLETION || confidence < FORMING_MIN_CONFIDENCE) {
			// ネックラインの 2 山まで揃っているので成功エントリと同じ 5 点を積む（top 側と同じ理由）。
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: completion < FORMING_MIN_COMPLETION ? 'forming_completion_below_min' : 'forming_confidence_below_min',
				idxs: [valley1.idx, valley2.idx, lastIdx],
				pts: [
					{ role: 'valley1', idx: valley1.idx, price: valley1.price },
					{ role: 'peak1', idx: pTop1.idx, price: pTop1.price },
					{ role: 'valley2', idx: valley2.idx, price: valley2.price },
					{ role: 'peak2', idx: pTop2.idx, price: pTop2.price },
					{ role: 'current', idx: lastIdx, price: currentPrice },
				],
			});
			continue;
		}

		// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
		const sizeReason = validatePatternSize('bottom', [valley1, pTop1, valley2, pTop2, { extremePrice: currentPrice }]);
		if (sizeReason) {
			pcand({ type: 'triple_bottom', accepted: false, reason: sizeReason, idxs: [valley1.idx, valley2.idx, lastIdx] });
			continue;
		}

		// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
		// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
		const gate = applyReversalGate({
			candles,
			pivots,
			side: 'bottom',
			first: valley1,
			mid: pTop1,
			necklinePrice: avgPeakPrice,
			type: 'triple_bottom',
			indices: [valley1.idx, valley2.idx, lastIdx],
			debugCandidates: ctx.debugCandidates,
		});
		if (!gate) continue;
		const structureGate = buildStructureGate(gate);

		const neckline = [
			{ x: valley1.idx, y: avgPeakPrice },
			{ x: lastIdx, y: avgPeakPrice },
		];

		const formTbTarget = Math.round(avgPeakPrice + (avgPeakPrice - avgValleyPrice));

		// 成功エントリ（issue #158）。`indices` は既存の棄却エントリと同じ 3 点に揃え、
		// ネックラインを引いた 2 山は `points` にだけ足す。
		pcand({
			type: 'triple_bottom',
			accepted: true,
			status: 'forming',
			idxs: [valley1.idx, valley2.idx, lastIdx],
			pts: [
				{ role: 'valley1', idx: valley1.idx, price: valley1.price },
				{ role: 'peak1', idx: pTop1.idx, price: pTop1.price },
				{ role: 'valley2', idx: valley2.idx, price: valley2.price },
				{ role: 'peak2', idx: pTop2.idx, price: pTop2.price },
				{ role: 'current', idx: lastIdx, price: currentPrice },
			],
		});

		return {
			type: 'triple_bottom',
			confidence,
			range: { start: isoAt(valley1.idx), end: isoAt(lastIdx) },
			status: 'forming',
			pivots: [
				{ idx: valley1.idx, price: valley1.price, kind: 'L' as const, extremePrice: valley1.extremePrice },
				{ idx: valley2.idx, price: valley2.price, kind: 'L' as const, extremePrice: valley2.extremePrice },
			],
			neckline,
			...(structureGate ? { structureGate } : {}),
			trendlineLabel: 'ネックライン',
			breakoutTarget: formTbTarget,
			targetMethod: 'neckline_projection' as const,
			completionPct: Math.round(completion * 100),
			_method: 'forming_triple_bottom',
		};
	}
	return null;
}

// ── Main ──

export function detectTriples(ctx: DetectContext): DetectResult {
	const { want, includeForming } = ctx;
	const patterns: DeduplicablePattern[] = [];

	const wantTripleTop = want.size === 0 || want.has('triple_top');
	const wantTripleBottom = want.size === 0 || want.has('triple_bottom');

	if (wantTripleTop || wantTripleBottom) {
		if (wantTripleTop) patterns.push(...findStrictTripleTop(ctx));
		if (wantTripleBottom) patterns.push(...findStrictTripleBottom(ctx));

		// relaxed fallback (multi-stage 1.25, 2.0)
		for (const f of [1.25, 2.0]) {
			if (wantTripleTop && !patterns.some((p) => p.type === 'triple_top')) {
				const relaxed = findRelaxedTripleTop(ctx, f);
				if (relaxed) patterns.push(relaxed);
			}
			if (wantTripleBottom && !patterns.some((p) => p.type === 'triple_bottom')) {
				const relaxed = findRelaxedTripleBottom(ctx, f);
				if (relaxed) patterns.push(relaxed);
			}
		}
	}

	// 6b) 形成中トリプルトップ/ボトム
	if (includeForming && (wantTripleTop || wantTripleBottom)) {
		if (wantTripleTop) {
			const forming = tryFormingTripleTop(ctx);
			if (forming) patterns.push(forming);
		}
		if (wantTripleBottom) {
			const forming = tryFormingTripleBottom(ctx);
			if (forming) patterns.push(forming);
		}
	}

	// includeForming=false のとき、未ブレイクの構造（forming / near_completion）は返さない。
	// detect_wedges.ts と同じく検出器内で先に落とす。#133 以降 dedup は statusScore 最優先なので
	// completed が forming に押し出されることは無くなったが、要求されていない status の候補を
	// dedup の比較対象に混ぜない・検出器の出力契約を includeForming に一致させる意味で残している。
	const filtered = includeForming
		? patterns
		: patterns.filter((p) => p.status !== 'forming' && p.status !== 'near_completion');

	return { patterns: filtered };
}
