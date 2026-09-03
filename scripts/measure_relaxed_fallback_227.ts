/**
 * issue #227 Phase 1: relaxed フォールバック（`detect_hs.ts` の `RELAXED_FACTORS`）の
 * 過剰緩和を**計測だけ**するスクリプト。閾値・段・スコアリングは 1 つも変えない。
 *
 * 実行:
 *
 *     npx tsx scripts/measure_relaxed_fallback_227.ts            # Markdown を stdout に出す
 *     npx tsx scripts/measure_relaxed_fallback_227.ts --json out.json
 *
 * ## コーパス
 *
 * #204 / #206 / #210 の実測ログ（`docs/internal/*.md`）と同じ組み方:
 *
 * - **標準コーパス 800** = 合成 704（`tests/fixtures/synthetic_pattern_candles.ts` の 22 系列 ×
 *   オプション 8 通り × 時間足 2 種（`1day` / `1hour`）× `swingDepth` 2 種（2 / 3））
 *   ＋ 実データ A 96（`tests/fixtures/btc_jpy_1day_2026.ts` × 時間足 3 種（`1day` / `4hour` / `1hour`）
 *   × `swingDepth` 4 種（既定 / 2 / 3 / 6）× オプション 8 通り）
 * - **実データ B 96**（`tests/fixtures/btc_jpy_1hour_2026_08.ts` × 同上）は**別建て**で集計する
 *   （#219 の教訓: 実データ A / B をプールしない）
 *
 * 「時間足」はリサンプリングではなく**パラメータのラベル**（#205 と同じ限界）。解釈の錨は
 * ネイティブ時間足（実データ B × `1hour`、実データ A × `1day`）。
 *
 * ## ハーネス
 *
 * `detect_patterns.ts` と同じ順序で ctx を組み（`resolveParams` → `detectSwingPoints` →
 * `filterPeaks` / `filterValleys` → `getSizeThresholdsForTf`）、`detectHeadAndShoulders(ctx)` を
 * **直接**呼ぶ。MCP 層の `meta.debug.candidates` は `cap = 200` で切られる（実データ B の 1hour で
 * 候補 1,994 件）ため、検出器層の `debugCandidates` / `patterns[]._fallback` をそのまま数える。
 * `data.patterns` に載る集合は `globalDedup` 以降で縮むが、relaxed は「strict が 0 件」のときにしか
 * 走らず同 type の strict と共存しないので、relaxed の accepted は dedup で消えない。
 *
 * ## 計測 2 の「段2 の係数を動かす」やり方（`detect_hs.ts` は変えない）
 *
 * `RELAXED_FACTORS` は定数で注入できない。代わりに **strict と relaxed が別々の入力を見る**ことを
 * 使って段2 を等価に再現する:
 *
 * - strict の肩判定は `ctx.near`、relaxed の肩判定は `ctx.tolerancePct × factors.shoulder`
 * - strict の頭判定は `ctx.headProminencePct`、relaxed は `ctx.headProminencePct × factors.head`
 *
 * よって `near = () => false`（strict を必ず 0 件にする）・`tolerancePct' = tol × 2.0 / 1.6`・
 * `headProminencePct' = g × f / 0.6` を渡すと、**段1（`x1.6_0.6`）が「段2 を係数 f で走らせたもの」と
 * 完全に同じ判定**になる（肩 `tol × 2.0`、頭 `g × f`、ネックライン・サイズ・構造ゲートは段に依存しない）。
 * f = 0.4 での再現結果が実際の段2 accepted と idx 単位で一致することを本スクリプト内で検算する
 * （不一致があれば表に出す）。
 *
 * ## 計測 4 の「strict 閾値で採点し直す」やり方
 *
 * `headProminenceScore` は非公開なので、同じ式 `clamp01(1 − gate / 実測突出率)` を本スクリプトで
 * 再計算する。出力の `scoreComponents`（4 桁丸め）から `base` を復元し、まず現行 `confidence` が
 * `finalizeConf(base × 0.95)` で再現できることを確認したうえで、`headProminence` 軸だけを
 * strict のゲート `g` で採点した値に差し替えて `confidence` を出し直す。
 */

import { writeFileSync } from 'node:fs';
import { buildBtcJpy2026Candles } from '../tests/fixtures/btc_jpy_1day_2026.js';
import { buildBtcJpy1hour202608Candles } from '../tests/fixtures/btc_jpy_1hour_2026_08.js';
import * as synth from '../tests/fixtures/synthetic_pattern_candles.js';
import { getSizeThresholdsForTf, resolveParams } from '../tools/patterns/config.js';
import { detectHeadAndShoulders } from '../tools/patterns/detect_hs.js';
import { finalizeConf } from '../tools/patterns/helpers.js';
import { clamp01, linearRegressionWithR2, near as nearFn, pct as pctFn } from '../tools/patterns/regression.js';
import {
	HS_NECKLINE_MAX_PCT,
	HS_SHOULDER_MAX_PCT,
	isSameLevel,
	validateHorizontalNeckline,
	validatePatternSize,
	validatePriorTrend,
} from '../tools/patterns/structural.js';
import { type Candle, detectSwingPoints, filterPeaks, filterValleys, type Pivot } from '../tools/patterns/swing.js';
import type { CandDebugEntry, DeduplicablePattern, DetectContext } from '../tools/patterns/types.js';

// ── 定数（detect_hs.ts の RELAXED_FACTORS を**読むだけ**。値を変える計測ではない） ──

/** `detect_hs.ts` の `RELAXED_FACTORS`（非公開なので同じ値を書き写す。検算は下の `assertFactors`） */
const RELAXED_FACTORS = [
	{ shoulder: 1.6, head: 0.6, tag: 'x1.6_0.6' },
	{ shoulder: 2.0, head: 0.4, tag: 'x2.0_0.4' },
] as const;
/** relaxed 経路の base に掛かる固定ペナルティ（`detect_hs.ts` の `finalizeConf(base * 0.95, …)`） */
const RELAXED_PENALTY = 0.95;
/** 計測 2 のスイープ範囲（issue は 0.35〜0.5。膝の有無を見るため両側に少し広げる） */
const SWEEP_FROM = 0.3;
const SWEEP_TO = 0.6;
const SWEEP_STEP = 0.01;

type HsType = 'head_and_shoulders' | 'inverse_head_and_shoulders';
const HS_TYPES: readonly HsType[] = ['head_and_shoulders', 'inverse_head_and_shoulders'];

type Group = 'synthetic' | 'realA' | 'realB';

interface Series {
	group: Group;
	name: string;
	candles: Candle[];
}

interface CaseOpts {
	includeForming: boolean;
	includeCompleted: boolean;
	includeInvalid: boolean;
}

interface CaseSpec {
	series: Series;
	tf: string;
	/** `undefined` = 時間軸オート（既定） */
	swingDepth: number | undefined;
	opts: CaseOpts;
	/**
	 * `headProminencePct` の明示指定（MCP の同名パラメータと同じ経路で `resolveParams` に渡す）。
	 * **ハーネスの陽性対照にだけ使う**（コーパスでは常に未指定 = 時間軸オート）。
	 */
	headProminencePct?: number;
}

/** 呼び出し 1 回（= ケース × type）の結果 */
interface CallResult {
	group: Group;
	series: string;
	tf: string;
	swingDepth: number | undefined;
	opts: CaseOpts;
	type: HsType;
	strictCount: number;
	/** relaxed が accepted になった pattern（無ければ null） */
	relaxed: RelaxedHit | null;
	/** `debugCandidates` の `fallback_relaxed` accepted 件数（`relaxed` との整合の検算用） */
	fallbackCandidates: number;
}

interface RelaxedHit {
	tag: string;
	stage: 1 | 2;
	indices: number[];
	status: string | undefined;
	confidence: number;
	scoreComponents: Record<string, number | undefined> | undefined;
	/** 実測の頭の突出率（検出側と同じ式。H&S: p2/max(肩)−1、逆: 1−p2/min(肩)） */
	prominence: number;
	/** strict のゲート `headProminencePct`（緩める前） */
	gate: number;
	/** `prominence / gate` */
	ratio: number;
}

// ── コーパス ──

const SYNTHETIC_BUILDERS: ReadonlyArray<readonly [string, () => Candle[]]> = [
	['completed_double_top', synth.buildCompletedDoubleTopCandles],
	['forming_double_bottom', synth.buildFormingDoubleBottomCandles],
	['descending_triangle_invalid', synth.buildDescendingTriangleInvalidBreakoutCandles],
	['rectangle_range', synth.buildRectangleRangeCandles],
	['rising_channel', synth.buildRisingChannelCandles],
	['bull_flag_failure', synth.buildBullFlagFailureCandles],
	['bull_pennant_success', synth.buildBullPennantSuccessCandles],
	['bull_pennant_failure', synth.buildBullPennantFailureCandles],
	['completed_triple_top', synth.buildCompletedTripleTopCandles],
	['forming_triple_bottom', synth.buildFormingTripleBottomCandles],
	['completed_hs', synth.buildCompletedHeadAndShouldersCandles],
	['forming_ihs', synth.buildFormingInverseHeadAndShouldersCandles],
	['forming_rising_wedge', synth.buildFormingRisingWedgeCandles],
	['completed_falling_wedge', synth.buildCompletedFallingWedgeCandles],
	['forming_ascending_triangle', synth.buildFormingAscendingTriangleCandles],
	['forming_symmetrical_triangle', synth.buildFormingSymmetricalTriangleCandles],
	['asymmetric_neckline_ihs', synth.buildAsymmetricNecklineIHSCandles],
	['asymmetric_neckline_hs', synth.buildAsymmetricNecklineHSCandles],
	['unequal_peaks_double_top', synth.buildUnequalPeaksDoubleTopCandles],
	['uptrend_fake_double_bottom', synth.buildUptrendThenFakeDoubleBottomCandles],
	['downtrend_fake_hs', synth.buildDowntrendThenFakeHSCandles],
	['unequal_valleys_double_bottom', synth.buildUnequalValleysDoubleBottomCandles],
];

const OPTS8: CaseOpts[] = Array.from({ length: 8 }, (_, b) => ({
	includeForming: (b & 1) !== 0,
	includeCompleted: (b & 2) !== 0,
	includeInvalid: (b & 4) !== 0,
}));

/** 標準コーパス 800（合成 704 + 実データ A 96）と実データ B 96 を組む。実データ A / B は別配列で返す（プールしない）。 */
function buildCorpus(): { standard: CaseSpec[]; realB: CaseSpec[] } {
	const standard: CaseSpec[] = [];
	for (const [name, build] of SYNTHETIC_BUILDERS) {
		const series: Series = { group: 'synthetic', name, candles: build() as Candle[] };
		for (const tf of ['1day', '1hour']) {
			for (const swingDepth of [2, 3]) {
				for (const opts of OPTS8) standard.push({ series, tf, swingDepth, opts });
			}
		}
	}
	const realA: Series = { group: 'realA', name: 'btc_jpy_1day_2026', candles: buildBtcJpy2026Candles() as Candle[] };
	const realB: Series = {
		group: 'realB',
		name: 'btc_jpy_1hour_2026_08',
		candles: buildBtcJpy1hour202608Candles() as Candle[],
	};
	const realCases = (series: Series): CaseSpec[] => {
		const out: CaseSpec[] = [];
		for (const tf of ['1day', '4hour', '1hour']) {
			for (const swingDepth of [undefined, 2, 3, 6]) {
				for (const opts of OPTS8) out.push({ series, tf, swingDepth, opts });
			}
		}
		return out;
	};
	standard.push(...realCases(realA));
	return { standard, realB: realCases(realB) };
}

// ── ハーネス（detect_patterns.ts と同じ ctx の組み方） ──

/** `resolveParams` に渡すオプション。`swingDepth` 未指定は時間軸オート、`headProminencePct` は陽性対照でのみ指定。 */
function resolveOpts(spec: CaseSpec): Partial<{ swingDepth: number; headProminencePct: number }> {
	return {
		...(spec.swingDepth === undefined ? {} : { swingDepth: spec.swingDepth }),
		...(spec.headProminencePct === undefined ? {} : { headProminencePct: spec.headProminencePct }),
	};
}

interface CtxOverride {
	near?: (a: number, b: number) => boolean;
	tolerancePct?: number;
	headProminencePct?: number;
	want?: Set<string>;
}

/** `detect_patterns.ts` と同じ順序で `DetectContext` を組む。`override` は段2 の再現（`emulateStage2`）専用。 */
function buildCtx(spec: CaseSpec, override: CtxOverride = {}): DetectContext {
	const { candles } = spec.series;
	const resolved = resolveParams(spec.tf, resolveOpts(spec));
	const tolerancePct = override.tolerancePct ?? resolved.tolerancePct;
	const headProminencePct = override.headProminencePct ?? resolved.headProminencePct;
	const pivots = detectSwingPoints(candles, { swingDepth: resolved.swingDepth, strictPivots: true });
	const debugCandidates: CandDebugEntry[] = [];
	return {
		candles,
		pivots,
		allPeaks: filterPeaks(pivots),
		allValleys: filterValleys(pivots),
		tolerancePct,
		headProminencePct,
		sizeThresholds: getSizeThresholdsForTf(spec.tf),
		minDist: resolved.minBarsBetweenSwings,
		want: override.want ?? new Set(),
		includeForming: spec.opts.includeForming,
		debugCandidates,
		type: spec.tf,
		swingDepth: resolved.swingDepth,
		near: override.near ?? ((a: number, b: number) => nearFn(a, b, tolerancePct)),
		pct: pctFn,
		lrWithR2: linearRegressionWithR2,
		tz: 'Asia/Tokyo',
	};
}

/** 頭の突出率。検出側のゲートと同じ式（H&S: `p2/max(肩) − 1`、逆 H&S: `1 − p2/min(肩)`）。 */
function prominenceOf(type: HsType, pivots: ReadonlyArray<{ price: number }>): number {
	const [p0, , p2, , p4] = pivots;
	return type === 'head_and_shoulders'
		? p2.price / Math.max(p0.price, p4.price) - 1
		: 1 - p2.price / Math.min(p0.price, p4.price);
}

/** relaxed で accepted になった pattern から集計用の `RelaxedHit` を作る（段は `_fallback` の末尾で判定）。 */
function toHit(p: DeduplicablePattern, type: HsType, gate: number): RelaxedHit {
	const tag = String(p._fallback);
	const stage = tag.endsWith(RELAXED_FACTORS[1].tag) ? 2 : 1;
	const prominence = prominenceOf(type, p.pivots ?? []);
	return {
		tag,
		stage,
		indices: (p.pivots ?? []).map((q: Pivot) => q.idx),
		status: typeof p.status === 'string' ? p.status : undefined,
		confidence: Number(p.confidence),
		scoreComponents: p.scoreComponents as Record<string, number | undefined> | undefined,
		prominence,
		gate,
		ratio: prominence / gate,
	};
}

/** ケース 1 件を実行し、type ごとの strict 件数 / relaxed accepted / `fallback_relaxed` 候補数を返す。strict と relaxed の共存は不変条件違反として throw する。 */
function runCase(spec: CaseSpec): CallResult[] {
	const ctx = buildCtx(spec);
	const res = detectHeadAndShoulders(ctx);
	return HS_TYPES.map((type) => {
		const ofType = res.patterns.filter((p) => p.type === type && p.status !== 'forming');
		const strict = ofType.filter((p) => !p._fallback);
		const relaxed = ofType.filter((p) => !!p._fallback);
		if (relaxed.length > 1) throw new Error(`relaxed が 2 件以上: ${spec.series.name}/${spec.tf}/${type}`);
		if (relaxed.length === 1 && strict.length > 0) {
			throw new Error(`strict と relaxed が共存: ${spec.series.name}/${spec.tf}/${type}`);
		}
		const fallbackCandidates = ctx.debugCandidates.filter(
			(c) => c.type === type && c.accepted && c.reason === 'fallback_relaxed',
		).length;
		return {
			group: spec.series.group,
			series: spec.series.name,
			tf: spec.tf,
			swingDepth: spec.swingDepth,
			opts: spec.opts,
			type,
			strictCount: strict.length,
			relaxed: relaxed.length === 1 ? toHit(relaxed[0], type, ctx.headProminencePct) : null,
			fallbackCandidates,
		};
	});
}

/**
 * 段2 を係数 `headFactor` で走らせたときの「最初に accepted になる窓」を再現する
 * （やり方はファイル先頭の docstring）。段2 相当が通らなければ null。
 */
function emulateStage2(spec: CaseSpec, type: HsType, headFactor: number): RelaxedHit | null {
	const base = resolveParams(spec.tf, resolveOpts(spec));
	const [s1, s2] = RELAXED_FACTORS;
	const ctx = buildCtx(spec, {
		near: () => false,
		tolerancePct: (base.tolerancePct * s2.shoulder) / s1.shoulder,
		headProminencePct: (base.headProminencePct * headFactor) / s1.head,
		want: new Set([type]),
	});
	const res = detectHeadAndShoulders(ctx);
	const hit = res.patterns.find((p) => p.type === type && !!p._fallback);
	if (!hit || !String(hit._fallback).endsWith(s1.tag)) return null;
	// 突出率の比は**元のゲート**に対して出す（再現用に差し替えた headProminencePct ではなく）。
	return toHit(hit, type, base.headProminencePct);
}

/**
 * 計測 2 の窓プール: strict 0 件のケースで、段2 の**頭以外の前段ゲート**（並び・minDist・
 * 肩 `tol × 2.0` と cap・ネックライン水平度）に加え、先行トレンドとサイズ検査まで通る 5 点窓の
 * `prominence / gate`。構造ゲート（`applyReversalGate`）とブレイク確認は含まない（非公開関数）ので、
 * **段2 の頭ゲートに実際に到達する窓の上位集合**になる。
 */
function windowPool(spec: CaseSpec, type: HsType): number[] {
	const ctx = buildCtx(spec);
	const { pivots, minDist, tolerancePct, headProminencePct, candles } = ctx;
	const kinds = type === 'head_and_shoulders' ? ['H', 'L', 'H', 'L', 'H'] : ['L', 'H', 'L', 'H', 'L'];
	const side = type === 'head_and_shoulders' ? 'top' : 'bottom';
	const expected = type === 'head_and_shoulders' ? 'up_or_sideways' : 'down_or_sideways';
	const relaxedTol = tolerancePct * RELAXED_FACTORS[1].shoulder;
	const out: number[] = [];
	for (let i = 0; i < pivots.length - 4; i++) {
		const w = pivots.slice(i, i + 5);
		if (!w.every((p, k) => p.kind === kinds[k])) continue;
		if (w.some((p, k) => k > 0 && p.idx - w[k - 1].idx < minDist)) continue;
		const [p0, p1, , p3, p4] = w;
		const shoulderDiff = Math.abs(p0.price - p4.price) / Math.max(1, Math.max(p0.price, p4.price));
		if (shoulderDiff > relaxedTol || !isSameLevel(p0.price, p4.price, HS_SHOULDER_MAX_PCT)) continue;
		if (!validateHorizontalNeckline(p1.price, p3.price, HS_NECKLINE_MAX_PCT).ok) continue;
		if (!validatePriorTrend(candles, p0.idx, p4.idx - p0.idx, expected).ok) continue;
		if (validatePatternSize(side, w, ctx.sizeThresholds)) continue;
		const prominence = prominenceOf(type, w);
		if (!(prominence > 0)) continue;
		out.push(prominence / headProminencePct);
	}
	return out;
}

// ── 集計ユーティリティ ──

/** nearest-rank のパーセンタイル（#205 / #206 の表と同じ流儀）。空配列は `undefined`。 */
function percentile(sorted: number[], p: number): number | undefined {
	if (sorted.length === 0) return undefined;
	// nearest-rank（#205 / #206 の表と同じ）
	const rank = Math.max(1, Math.ceil(p * sorted.length));
	return sorted[rank - 1];
}

/** 数値を固定小数で整形する。`undefined` は「—」。 */
function fmtNum(v: number | undefined, digits = 4): string {
	return v === undefined ? '—' : v.toFixed(digits);
}

/** 比率を百分率の文字列にする。 */
function fmtPct(v: number, digits = 2): string {
	return `${(v * 100).toFixed(digits)}%`;
}

/** 分布 1 行（n / min / p25 / p50 / p75 / p95 / max）を Markdown の表の行にする。 */
function distRow(label: string, values: number[], asPct = false): string {
	const s = [...values].sort((a, b) => a - b);
	const f = (v: number | undefined) => (v === undefined ? '—' : asPct ? fmtPct(v, 3) : v.toFixed(3));
	return `| ${label} | ${s.length} | ${f(s[0])} | ${f(percentile(s, 0.25))} | ${f(percentile(s, 0.5))} | ${f(percentile(s, 0.75))} | ${f(percentile(s, 0.95))} | ${f(s[s.length - 1])} |`;
}

const DIST_HEADER = '| 対象 | n | min | p25 | p50 | p75 | p95 | max |\n|---|---:|---:|---:|---:|---:|---:|---:|';

/** 構造単位のキー `(系列, tf, type, idx)`。オプション 8 通り × swingDepth の重複を畳む */
function structureKey(r: CallResult): string {
	return `${r.series}|${r.tf}|${r.type}|${r.relaxed?.indices.join('-') ?? ''}`;
}

/** `(系列, tf, swingDepth, type)` のキー。オプション 8 通りの重複を畳むときに使う。 */
function comboKey(r: Pick<CallResult, 'series' | 'tf' | 'swingDepth' | 'type'>): string {
	return `${r.series}|${r.tf}|${r.swingDepth ?? 'auto'}|${r.type}`;
}

// ── 計測 1 / 3 / 5: 段別 accepted と strict 0 件の頻度 ──

interface FireStats {
	calls: number;
	strict0: number;
	byTag: Record<string, number>;
	relaxedNone: number;
	strict0Structures: Set<string>;
	acceptedStructures: Map<string, Set<string>>;
}

/** strict 0 件の呼び出し数と relaxed の段別 accepted を数える（延べと構造単位の両方）。 */
function tallyFire(results: CallResult[]): FireStats {
	const s: FireStats = {
		calls: results.length,
		strict0: 0,
		byTag: Object.fromEntries(HS_TYPES.flatMap((t) => RELAXED_FACTORS.map((f) => [tagFor(t, f.tag), 0]))),
		relaxedNone: 0,
		strict0Structures: new Set(),
		acceptedStructures: new Map(),
	};
	for (const r of results) {
		if (r.strictCount > 0) continue;
		s.strict0++;
		s.strict0Structures.add(comboKey(r));
		if (r.relaxed) {
			s.byTag[r.relaxed.tag] = (s.byTag[r.relaxed.tag] ?? 0) + 1;
			const set = s.acceptedStructures.get(r.relaxed.tag) ?? new Set<string>();
			set.add(structureKey(r));
			s.acceptedStructures.set(r.relaxed.tag, set);
		} else {
			s.relaxedNone++;
		}
	}
	return s;
}

/** `_fallback` のタグ文字列（`relaxed_hs_x1.6_0.6` 等）を組み立てる。 */
function tagFor(type: HsType, tag: string): string {
	return `relaxed_${type === 'head_and_shoulders' ? 'hs' : 'ihs'}_${tag}`;
}

/** 計測 1 / 3 の表（type 別の呼び出し数・strict 0 件率・段別 accepted）を Markdown で出す。 */
function fireTable(title: string, results: CallResult[]): string {
	const lines: string[] = [`#### ${title}`, ''];
	lines.push(
		'| type | 呼び出し | strict 0 件 | strict 0 件率 | 段1 accepted | 段2 accepted | relaxed 不発 | 段1 構造 | 段2 構造 |',
	);
	lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
	for (const type of HS_TYPES) {
		const s = tallyFire(results.filter((r) => r.type === type));
		const t1 = tagFor(type, RELAXED_FACTORS[0].tag);
		const t2 = tagFor(type, RELAXED_FACTORS[1].tag);
		lines.push(
			`| \`${type}\` | ${s.calls} | ${s.strict0} | ${s.calls ? fmtPct(s.strict0 / s.calls, 1) : '—'} | ${s.byTag[t1] ?? 0} | ${s.byTag[t2] ?? 0} | ${s.relaxedNone} | ${s.acceptedStructures.get(t1)?.size ?? 0} | ${s.acceptedStructures.get(t2)?.size ?? 0} |`,
		);
	}
	return lines.join('\n');
}

/** 計測 5 の表（時間足別）。ネイティブ時間足の行を太字にする。 */
function fireByTf(title: string, results: CallResult[], nativeTf: string): string {
	const tfs = [...new Set(results.map((r) => r.tf))];
	const lines: string[] = [`#### ${title}（時間足別。ネイティブ = \`${nativeTf}\`）`, ''];
	lines.push('| tf | type | 呼び出し | strict 0 件 | strict 0 件率 | 段1 accepted | 段2 accepted | relaxed 不発 |');
	lines.push('|---|---|---:|---:|---:|---:|---:|---:|');
	for (const tf of tfs) {
		for (const type of HS_TYPES) {
			const s = tallyFire(results.filter((r) => r.tf === tf && r.type === type));
			const t1 = tagFor(type, RELAXED_FACTORS[0].tag);
			const t2 = tagFor(type, RELAXED_FACTORS[1].tag);
			const label = tf === nativeTf ? `**\`${tf}\`**` : `\`${tf}\``;
			lines.push(
				`| ${label} | \`${type}\` | ${s.calls} | ${s.strict0} | ${s.calls ? fmtPct(s.strict0 / s.calls, 1) : '—'} | ${s.byTag[t1] ?? 0} | ${s.byTag[t2] ?? 0} | ${s.relaxedNone} |`,
			);
		}
	}
	return lines.join('\n');
}

// ── 計測 4: headProminence 軸を strict 閾値で採点し直す試算 ──

const HS_AXES = ['symmetry', 'headProminence', 'timeSymmetry', 'retracement', 'breakoutQuality', 'duration'] as const;

interface Rescored {
	r: CallResult;
	hit: RelaxedHit;
	reproduced: boolean;
	headProminenceNow: number | undefined;
	headProminenceStrict: number;
	confidenceStrict: number;
	delta: number;
}

/** 計測 4: `scoreComponents` から base を復元して現行 confidence の再現を確認し、`headProminence` 軸だけを strict のゲートで採点し直した confidence を出す。 */
function rescore(r: CallResult): Rescored | null {
	const hit = r.relaxed;
	if (!hit?.scoreComponents) return null;
	const comps = HS_AXES.map((k) => hit.scoreComponents?.[k]).filter((v): v is number => typeof v === 'number');
	const base = comps.reduce((a, b) => a + b, 0) / comps.length;
	const reproduced = finalizeConf(base * RELAXED_PENALTY, r.type) === hit.confidence;
	// headProminenceScore と同じ式。strict のゲート g に対して prominence < g なら負 → clamp で 0。
	const strictScore = clamp01(1 - hit.gate / hit.prominence);
	const compsStrict = HS_AXES.map((k) => (k === 'headProminence' ? strictScore : hit.scoreComponents?.[k])).filter(
		(v): v is number => typeof v === 'number',
	);
	const baseStrict = compsStrict.reduce((a, b) => a + b, 0) / compsStrict.length;
	const confidenceStrict = finalizeConf(baseStrict * RELAXED_PENALTY, r.type);
	return {
		r,
		hit,
		reproduced,
		headProminenceNow: hit.scoreComponents.headProminence,
		headProminenceStrict: strictScore,
		confidenceStrict,
		delta: confidenceStrict - hit.confidence,
	};
}

// ── ハーネスの陽性対照（relaxed が実際に発火するケースを人工的に作り、再現法を検算する） ──

interface SelfCheckRow {
	label: string;
	realTag: string;
	emuF: number;
	emuTag: string;
	match: boolean;
}

/**
 * コーパスでは relaxed accepted が 0 件なので、`emulateStage2` の「段1 を段2 相当に読み替える」再現が
 * 正しいことを**陽性対照**で確かめる。strict が通る系列に `headProminencePct` を明示で
 * `実測突出率 ÷ k` に引き上げると、strict（ゲート `g' > 突出率`）は必ず落ち、relaxed の段は
 * `k` で選べる（`k = 0.5` → 段1 `0.6g' = 1.2×突出率` は落ち、段2 `0.4g' = 0.8×突出率` が通る。
 * `k = 0.7` → 段1 が通る）。
 */
function selfCheck(standard: CaseSpec[], realB: CaseSpec[]): SelfCheckRow[] {
	const rows: SelfCheckRow[] = [];
	const pick = (name: string, tf: string, sd: number | undefined) =>
		[...standard, ...realB].find(
			(c) => c.series.name === name && c.tf === tf && c.swingDepth === sd && !c.opts.includeForming,
		) as CaseSpec;
	const targets: Array<{ spec: CaseSpec; type: HsType }> = [
		{ spec: pick('completed_hs', '1day', 2), type: 'head_and_shoulders' },
		{ spec: pick('completed_hs', '1hour', 3), type: 'head_and_shoulders' },
		{ spec: pick('btc_jpy_1day_2026', '1day', undefined), type: 'head_and_shoulders' },
		{ spec: pick('btc_jpy_1day_2026', '4hour', 3), type: 'head_and_shoulders' },
		{ spec: pick('btc_jpy_1hour_2026_08', '1hour', undefined), type: 'head_and_shoulders' },
		{ spec: pick('btc_jpy_1hour_2026_08', '1hour', undefined), type: 'inverse_head_and_shoulders' },
	];
	for (const { spec, type } of targets) {
		const strictRes = detectHeadAndShoulders(buildCtx(spec));
		const strictHits = strictRes.patterns.filter((p) => p.type === type && !p._fallback && p.status !== 'forming');
		if (strictHits.length === 0) continue;
		const maxProm = Math.max(...strictHits.map((p) => prominenceOf(type, p.pivots ?? [])));
		for (const k of [0.5, 0.7] as const) {
			const forced: CaseSpec = { ...spec, headProminencePct: maxProm / k };
			const real = runCase(forced).find((r) => r.type === type) as CallResult;
			const realTag = real.relaxed
				? `${real.relaxed.tag} ${real.relaxed.indices.join('-')} conf ${real.relaxed.confidence}`
				: 'none';
			const label = `${spec.series.name}/${spec.tf}/sd=${spec.swingDepth ?? 'auto'}/${type} g'=${(maxProm / k).toFixed(5)}（k=${k}）`;
			if (real.relaxed?.stage === 1) {
				// 段1 で通る組は段2 が評価されない（スイープで除外する根拠）。再現の対象外
				rows.push({ label, realTag, emuF: Number.NaN, emuTag: '—（段1 で通るため対象外）', match: true });
				continue;
			}
			// 実際に段2 で通った → f = 0.4 の再現が同じ窓・同じ confidence を返し、f = 0.55（ゲート 1.1×突出率）では返さない。
			// 実際に不発 → f = 0.4 の再現も不発。
			const e4 = emulateStage2(forced, type, 0.4);
			const e55 = emulateStage2(forced, type, 0.55);
			const fmt = (e: RelaxedHit | null) => (e ? `${e.indices.join('-')} conf ${e.confidence}` : 'none');
			const match4 = real.relaxed
				? !!e4 && e4.indices.join('-') === real.relaxed.indices.join('-') && e4.confidence === real.relaxed.confidence
				: e4 === null;
			rows.push({ label, realTag, emuF: 0.4, emuTag: fmt(e4), match: match4 });
			if (real.relaxed) rows.push({ label, realTag, emuF: 0.55, emuTag: fmt(e55), match: e55 === null });
		}
	}
	return rows;
}

// ── main ──

/** コーパスを回して Markdown を stdout へ書く。`--json <path>` で生データも保存する。 */
function main() {
	const jsonIdx = process.argv.indexOf('--json');
	const jsonPath = jsonIdx >= 0 ? process.argv[jsonIdx + 1] : undefined;

	const { standard, realB } = buildCorpus();
	const stdResults = standard.flatMap(runCase);
	const bResults = realB.flatMap(runCase);
	const all = [...stdResults, ...bResults];

	// 検算: `_fallback` 付き pattern と `fallback_relaxed` accepted 候補の件数が一致する
	const candMismatch = all.filter((r) => (r.relaxed ? 1 : 0) !== r.fallbackCandidates);

	const out: string[] = [];
	out.push('# issue #227 Phase 1: relaxed フォールバックの計測結果');
	out.push('');
	out.push(
		`- 標準コーパス: ${standard.length} ケース（合成 ${standard.filter((c) => c.series.group === 'synthetic').length} + 実データ A ${standard.filter((c) => c.series.group === 'realA').length}）、実データ B: ${realB.length} ケース。呼び出しはケース × 2 type`,
	);
	out.push(
		`- 検算: \`_fallback\` 付き pattern 件数と \`debugCandidates\` の \`fallback_relaxed\` accepted 件数の不一致 **${candMismatch.length} 件**`,
	);
	out.push('');
	out.push('### ハーネスの陽性対照（再現法の検算）');
	out.push('');
	out.push(
		'strict が通る組に `headProminencePct` を明示で `最大突出率 ÷ k` に引き上げ、strict を落として relaxed を人工的に発火させる（k = 0.5 → 段2 相当、k = 0.7 → 段1 相当）。relaxed 経路は**連続する 5 ピボット**しか見ない（strict は `enumerateHsWindows` で非連続の組も見る）ので、strict が通る系列でも relaxed が不発になることがある——その場合は「不発が再現でも不発」であることを検算する。',
	);
	out.push('');
	out.push('| ケース | 実際の relaxed | 再現 f | 再現結果 | 一致 |');
	out.push('|---|---|---:|---|---|');
	for (const row of selfCheck(standard, realB)) {
		out.push(
			`| ${row.label} | ${row.realTag} | ${Number.isNaN(row.emuF) ? '—' : row.emuF.toFixed(2)} | ${row.emuTag} | ${row.match ? 'OK' : '**NG**'} |`,
		);
	}
	out.push('');

	// ── 1 / 3 ──
	out.push('## 計測 1・3: relaxed 経路の段別 accepted と strict 0 件の頻度');
	out.push('');
	out.push('「strict 0 件」= その呼び出しで strict 経路が対象 type を 1 件も返さなかった（= relaxed が発火した）。');
	out.push(
		'「relaxed 不発」= strict 0 件かつ relaxed も 2 段とも通らなかった。「構造」= `(系列, tf, type, 5 点 idx)` で重複を畳んだ数。',
	);
	out.push('');
	out.push(fireTable('標準コーパス 800（合成 704 + 実データ A 96）', stdResults));
	out.push('');
	out.push(
		fireTable(
			'　うち合成 704',
			stdResults.filter((r) => r.group === 'synthetic'),
		),
	);
	out.push('');
	out.push(
		fireTable(
			'　うち実データ A 96（`btc_jpy` 1day）',
			stdResults.filter((r) => r.group === 'realA'),
		),
	);
	out.push('');
	out.push(fireTable('実データ B 96（`btc_jpy` 1hour。別建て）', bResults));
	out.push('');

	// ── 5 ──
	out.push('## 計測 5: 実データ A / B を native のまま時間足別に見る');
	out.push('');
	out.push(fireByTf('実データ B（`btc_jpy` 1hour 365 本）', bResults, '1hour'));
	out.push('');
	out.push(
		fireByTf(
			'実データ A（`btc_jpy` 1day 90 本）',
			stdResults.filter((r) => r.group === 'realA'),
			'1day',
		),
	);
	out.push('');
	out.push(
		fireByTf(
			'合成 704',
			stdResults.filter((r) => r.group === 'synthetic'),
			'—',
		),
	);
	out.push('');

	// ── relaxed accepted の一覧（構造単位） ──
	const hits = all.filter((r) => r.relaxed);
	const byStructure = new Map<string, CallResult[]>();
	for (const r of hits) {
		const k = structureKey(r);
		byStructure.set(k, [...(byStructure.get(k) ?? []), r]);
	}
	out.push('## relaxed accepted の構造一覧（構造単位）');
	out.push('');
	if (byStructure.size === 0) {
		out.push('relaxed accepted は 0 件。');
	} else {
		out.push('| group | 系列 | tf | swingDepth | type | 段 | 5 点 idx | status | 突出率 | gate | 比 | conf | 延べ |');
		out.push('|---|---|---|---|---|---:|---|---|---:|---:|---:|---:|---:|');
		for (const [, rs] of byStructure) {
			const r = rs[0];
			const h = r.relaxed as RelaxedHit;
			const sds = [...new Set(rs.map((x) => x.swingDepth ?? 'auto'))].join('/');
			out.push(
				`| ${r.group} | ${r.series} | ${r.tf} | ${sds} | \`${r.type}\` | ${h.stage} | ${h.indices.join('-')} | ${h.status ?? '—'} | ${fmtPct(h.prominence, 3)} | ${fmtPct(h.gate, 2)} | ${h.ratio.toFixed(3)} | ${h.confidence} | ${rs.length} |`,
			);
		}
	}
	out.push('');

	// ── 2 ──
	out.push('## 計測 2: 段2（`head: 0.4`）でのみ拾われた構造の頭の突出');
	out.push('');
	const stage2 = hits.filter((r) => r.relaxed?.stage === 2);
	const stage2Structures = [...new Map(stage2.map((r) => [structureKey(r), r])).values()];
	out.push(`段2 accepted: 延べ ${stage2.length} 件 / 構造 ${stage2Structures.length} 件。`);
	out.push('');
	out.push(DIST_HEADER);
	for (const group of ['synthetic', 'realA', 'realB'] as const) {
		const xs = stage2Structures.filter((r) => r.group === group);
		out.push(
			distRow(
				`${group} 突出率（%）`,
				xs.map((r) => (r.relaxed as RelaxedHit).prominence),
				true,
			),
		);
		out.push(
			distRow(
				`${group} 突出率 ÷ strict gate`,
				xs.map((r) => (r.relaxed as RelaxedHit).ratio),
			),
		);
	}
	const stage1Structures = [
		...new Map(hits.filter((r) => r.relaxed?.stage === 1).map((r) => [structureKey(r), r])).values(),
	];
	out.push(
		distRow(
			'（参考）段1 accepted 突出率 ÷ strict gate',
			stage1Structures.map((r) => (r.relaxed as RelaxedHit).ratio),
		),
	);
	out.push('');

	// 段2 の係数スイープ（strict 0 件の (系列, tf, swingDepth, type) ごとに 1 回）
	const strict0Combos = new Map<string, { spec: CaseSpec; type: HsType; calls: number; real: RelaxedHit | null }>();
	const specByCombo = new Map<string, CaseSpec>();
	for (const spec of [...standard, ...realB]) {
		for (const type of HS_TYPES)
			specByCombo.set(comboKey({ series: spec.series.name, tf: spec.tf, swingDepth: spec.swingDepth, type }), spec);
	}
	for (const r of all) {
		if (r.strictCount > 0) continue;
		const k = comboKey(r);
		const e = strict0Combos.get(k);
		if (e) e.calls++;
		else strict0Combos.set(k, { spec: specByCombo.get(k) as CaseSpec, type: r.type, calls: 1, real: r.relaxed });
	}

	// 検算: f = 0.4 の再現が実際の段2 と一致するか
	const emuCheck = {
		stage2Match: 0,
		stage2Mismatch: [] as string[],
		noneMatch: 0,
		noneMismatch: [] as string[],
		stage1Skipped: 0,
	};
	for (const [k, c] of strict0Combos) {
		const e = emulateStage2(c.spec, c.type, RELAXED_FACTORS[1].head);
		if (c.real === null) {
			if (e === null) emuCheck.noneMatch++;
			else emuCheck.noneMismatch.push(`${k}: 再現では ${e.indices.join('-')} が通る`);
		} else if (c.real.stage === 2) {
			if (e && e.indices.join('-') === c.real.indices.join('-') && e.confidence === c.real.confidence)
				emuCheck.stage2Match++;
			else
				emuCheck.stage2Mismatch.push(`${k}: 実 ${c.real.indices.join('-')} / 再現 ${e ? e.indices.join('-') : 'null'}`);
		} else {
			emuCheck.stage1Skipped++;
		}
	}
	out.push('### 段2 の係数 `head` を動かしたときの通過集合（strict 0 件の呼び出しに対して）');
	out.push('');
	out.push(
		`再現の検算（f = 0.4）: 実際に段2 で通った組 ${emuCheck.stage2Match} 件が idx・confidence とも一致（不一致 ${emuCheck.stage2Mismatch.length}）、relaxed 不発の組 ${emuCheck.noneMatch} 件が再現でも不発（不一致 ${emuCheck.noneMismatch.length}）。段1 で通った組 ${emuCheck.stage1Skipped} 件は段2 が評価されないため対象外。`,
	);
	for (const m of [...emuCheck.stage2Mismatch, ...emuCheck.noneMismatch]) out.push(`- 不一致: ${m}`);
	out.push('');
	out.push(
		'「発火する組」= `(系列, tf, swingDepth, type)` 単位で段2 相当が accepted になる数（延べはオプション 8 通りを掛けた呼び出し数）。',
	);
	out.push('');
	const sweepHeader =
		'| `head` | H&S 発火（組 / 延べ） | 逆H&S 発火（組 / 延べ） | H&S 構造 | 逆H&S 構造 | 通る構造の比 min | 前段との差 |';
	out.push(sweepHeader);
	out.push('|---:|---:|---:|---:|---:|---:|---|');
	const sweep: Array<{
		f: number;
		combos: Record<HsType, number>;
		calls: Record<HsType, number>;
		structures: Record<HsType, Set<string>>;
		minRatio: number | undefined;
	}> = [];
	for (let f = SWEEP_FROM; f <= SWEEP_TO + 1e-9; f += SWEEP_STEP) {
		const ff = Number(f.toFixed(2));
		const row = {
			f: ff,
			combos: { head_and_shoulders: 0, inverse_head_and_shoulders: 0 } as Record<HsType, number>,
			calls: { head_and_shoulders: 0, inverse_head_and_shoulders: 0 } as Record<HsType, number>,
			structures: { head_and_shoulders: new Set<string>(), inverse_head_and_shoulders: new Set<string>() } as Record<
				HsType,
				Set<string>
			>,
			minRatio: undefined as number | undefined,
		};
		for (const c of strict0Combos.values()) {
			if (c.real?.stage === 1) continue; // 段1 で通る組は段2 の係数に依らず段1 の結果
			const e = emulateStage2(c.spec, c.type, ff);
			if (!e) continue;
			row.combos[c.type]++;
			row.calls[c.type] += c.calls;
			row.structures[c.type].add(`${c.spec.series.name}|${c.spec.tf}|${c.type}|${e.indices.join('-')}`);
			row.minRatio = row.minRatio === undefined ? e.ratio : Math.min(row.minRatio, e.ratio);
		}
		sweep.push(row);
	}
	for (let i = 0; i < sweep.length; i++) {
		const s = sweep[i];
		const prev = sweep[i - 1];
		const diff = prev
			? `H&S ${s.combos.head_and_shoulders - prev.combos.head_and_shoulders >= 0 ? '+' : ''}${s.combos.head_and_shoulders - prev.combos.head_and_shoulders} / 逆 ${s.combos.inverse_head_and_shoulders - prev.combos.inverse_head_and_shoulders >= 0 ? '+' : ''}${s.combos.inverse_head_and_shoulders - prev.combos.inverse_head_and_shoulders}`
			: '—';
		const mark = s.f === RELAXED_FACTORS[1].head ? '**' : '';
		out.push(
			`| ${mark}${s.f.toFixed(2)}${mark} | ${s.combos.head_and_shoulders} / ${s.calls.head_and_shoulders} | ${s.combos.inverse_head_and_shoulders} / ${s.calls.inverse_head_and_shoulders} | ${s.structures.head_and_shoulders.size} | ${s.structures.inverse_head_and_shoulders.size} | ${fmtNum(s.minRatio, 3)} | ${diff} |`,
		);
	}
	out.push('');

	// 窓プールのヒストグラム（段2 の頭ゲートに到達しうる窓の突出率 ÷ gate）
	out.push('### 窓プール: 段2 の頭ゲート手前まで通る 5 点窓の `突出率 ÷ strict gate`');
	out.push('');
	out.push(
		'前段ゲート = 並び・minDist・肩 `tol × 2.0` と cap・ネックライン水平度・先行トレンド・サイズ検査。構造ゲートとブレイク確認は含まない（到達窓の上位集合）。',
	);
	out.push('');
	// strict 0 件の組だけ（relaxed が実際に評価する窓）と、全組（strict が通っている組も含む。
	// 「strict が落ちたら relaxed がどこまで拾うか」の参考）の 2 本立て。組は (系列, tf, swingDepth, type) で 1 回。
	const poolBy: Record<string, number[]> = {};
	const poolAllBy: Record<string, number[]> = {};
	const seenCombo = new Set<string>();
	for (const spec of [...standard, ...realB]) {
		for (const type of HS_TYPES) {
			const k = comboKey({ series: spec.series.name, tf: spec.tf, swingDepth: spec.swingDepth, type });
			if (seenCombo.has(k)) continue;
			seenCombo.add(k);
			const key = `${spec.series.group}|${type}`;
			const pool = windowPool(spec, type);
			poolAllBy[key] = [...(poolAllBy[key] ?? []), ...pool];
			if (strict0Combos.has(k)) poolBy[key] = [...(poolBy[key] ?? []), ...pool];
		}
	}
	out.push('strict 0 件の組のみ（relaxed が実際に評価する窓）:');
	out.push('');
	out.push(DIST_HEADER);
	for (const group of ['synthetic', 'realA', 'realB'] as const) {
		for (const type of HS_TYPES) out.push(distRow(`${group} \`${type}\``, poolBy[`${group}|${type}`] ?? []));
	}
	out.push('');
	out.push('全組（strict が通っている組も含む参考値）:');
	out.push('');
	out.push(DIST_HEADER);
	for (const group of ['synthetic', 'realA', 'realB'] as const) {
		for (const type of HS_TYPES) out.push(distRow(`${group} \`${type}\``, poolAllBy[`${group}|${type}`] ?? []));
	}
	out.push('');
	out.push('0.05 刻みヒストグラム（全組。比 < 1.0 が strict で落ちる窓。0.4 が段2、0.6 が段1 のゲート）:');
	out.push('');
	const bins = Array.from({ length: 20 }, (_, i) => i * 0.05);
	out.push(
		`| 比の区間 | ${['synthetic', 'realA', 'realB'].flatMap((g) => HS_TYPES.map((t) => `${g} ${t === 'head_and_shoulders' ? 'H&S' : '逆H&S'}`)).join(' | ')} |`,
	);
	out.push(`|---|${'---:|'.repeat(6)}`);
	const binCount = (xs: number[], lo: number, hi: number) => xs.filter((x) => x >= lo && x < hi).length;
	for (const lo of bins) {
		const hi = lo + 0.05;
		const cells = (['synthetic', 'realA', 'realB'] as const).flatMap((g) =>
			HS_TYPES.map((t) => binCount(poolAllBy[`${g}|${t}`] ?? [], lo, hi)),
		);
		const mark = lo >= 0.3 && lo < 0.6 ? '**' : '';
		out.push(`| ${mark}[${lo.toFixed(2)}, ${hi.toFixed(2)})${mark} | ${cells.join(' | ')} |`);
	}
	out.push(
		`| ≥ 1.00 | ${(['synthetic', 'realA', 'realB'] as const).flatMap((g) => HS_TYPES.map((t) => (poolAllBy[`${g}|${t}`] ?? []).filter((x) => x >= 1).length)).join(' | ')} |`,
	);
	out.push('');

	// ── 4 ──
	out.push('## 計測 4: `headProminence` 軸を strict の閾値で採点し直した試算');
	out.push('');
	const rescored = [...byStructure.values()].map((rs) => rescore(rs[0])).filter((x): x is Rescored => x !== null);
	if (rescored.length === 0) {
		out.push('relaxed accepted が 0 件のため試算対象なし。');
	} else {
		const notReproduced = rescored.filter((x) => !x.reproduced);
		out.push(
			`構造 ${rescored.length} 件。まず現行 confidence が \`finalizeConf(mean(scoreComponents) × 0.95)\` で再現できるか: 不一致 **${notReproduced.length} 件**（4 桁丸めの scoreComponents から復元しているため、丸め境界で 0.01 ずれることがある）。`,
		);
		out.push('');
		out.push(
			'| group | 系列 | tf | type | 段 | 5 点 idx | 比 | headProminence 現行 | 同 strict 採点 | conf 現行 | conf strict 採点 | Δ |',
		);
		out.push('|---|---|---|---|---:|---|---:|---:|---:|---:|---:|---:|');
		for (const x of rescored) {
			out.push(
				`| ${x.r.group} | ${x.r.series} | ${x.r.tf} | \`${x.r.type}\` | ${x.hit.stage} | ${x.hit.indices.join('-')} | ${x.hit.ratio.toFixed(3)} | ${fmtNum(x.headProminenceNow)} | ${x.headProminenceStrict.toFixed(4)} | ${x.hit.confidence} | ${x.confidenceStrict} | ${x.delta >= 0 ? '+' : ''}${x.delta.toFixed(2)}${x.reproduced ? '' : ' (†)'} |`,
			);
		}
		out.push('');
		out.push(DIST_HEADER);
		out.push(
			distRow(
				'Δ confidence（全 relaxed 構造）',
				rescored.map((x) => x.delta),
			),
		);
		out.push(
			distRow(
				'Δ confidence（段2 のみ）',
				rescored.filter((x) => x.hit.stage === 2).map((x) => x.delta),
			),
		);
		out.push(
			distRow(
				'Δ confidence（段1 のみ）',
				rescored.filter((x) => x.hit.stage === 1).map((x) => x.delta),
			),
		);
		out.push('');
		out.push(
			'† = 現行 confidence が 4 桁丸めの scoreComponents から ±0.01 で再現できなかった行（Δ は再計算同士の差なので比較としては有効）。',
		);
	}
	out.push('');

	process.stdout.write(`${out.join('\n')}\n`);

	if (jsonPath) {
		writeFileSync(
			jsonPath,
			JSON.stringify(
				{
					corpus: { standard: standard.length, realB: realB.length },
					calls: all.map((r) => ({
						...r,
						relaxed: r.relaxed ? { ...r.relaxed, scoreComponents: r.relaxed.scoreComponents } : null,
					})),
					sweep: sweep.map((s) => ({
						f: s.f,
						combos: s.combos,
						calls: s.calls,
						structures: {
							head_and_shoulders: [...s.structures.head_and_shoulders],
							inverse_head_and_shoulders: [...s.structures.inverse_head_and_shoulders],
						},
						minRatio: s.minRatio,
					})),
					pool: { strict0: poolBy, all: poolAllBy },
					rescored: rescored.map((x) => ({ key: structureKey(x.r), ...x, r: undefined })),
					emuCheck,
				},
				null,
				2,
			),
		);
		process.stderr.write(`wrote ${jsonPath}\n`);
	}
}

main();
