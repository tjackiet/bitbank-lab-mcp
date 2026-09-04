/**
 * issue #228: triple の完成済み 4 経路に `computeTargetReach` を配線したうえで、
 * **`tools/patterns/target-reach.ts` の 3 定数が triple でも妥当か**を計測するスクリプト。
 * 定数は 1 つも変えない（測って報告するだけ）。
 *
 * 実行:
 *
 *     npx tsx scripts/measure_triple_target_reach_228.ts            # Markdown を stdout に出す
 *     npx tsx scripts/measure_triple_target_reach_228.ts --json out.json
 *
 * ## なぜ測るのか
 *
 * 3 定数（`MIN_TARGET_DISTANCE_HEIGHT_RATIO` / `TARGET_REACHED_PCT_CAP` / `TARGET_REACH_MAX_BARS`）は
 * **H&S / doubles の実測で決めた値**（#210）。triple は同じ `neckline_projection` の族なので
 * 分母が潰れる側だが、**同じ族だから同じ値でよい、は仮説であって実測ではない**。
 * 無検証の流用は #198（時間足別テーブル）で事故になっている。
 *
 * ## コーパス
 *
 * #205 / #206 / #210 / #216 / #227 の実測ログ（`docs/internal/*.md`）と同じ組み方で **940 ケース**:
 *
 * - **標準コーパス 800** = 合成 704（`tests/fixtures/synthetic_pattern_candles.ts` の 22 系列 ×
 *   オプション 8 通り × 時間足 2 種（`1day` / `1hour`）× `swingDepth` 2 種（2 / 3））
 *   ＋ 実データ A 96（`tests/fixtures/btc_jpy_1day_2026.ts` × 時間足 3 種（`1day` / `4hour` / `1hour`）
 *   × `swingDepth` 4 種（既定 / 2 / 3 / 6）× オプション 8 通り）
 * - **実データ B 96**（`tests/fixtures/btc_jpy_1hour_2026_08.ts` × 同上）
 * - **補助スイープ 44**（実データ B × 全 11 時間足 × `swingDepth` 4 種）
 *
 * **実データ A（1day）と実データ B（1hour）はネイティブ時間足のまま個別に出す**（#219 の教訓:
 * プールした値から結論を書かない）。「時間足」はリサンプリングではなく**パラメータのラベル**
 * （#204 / #205 と同じ限界）なので、解釈の錨はネイティブ行だけに置く。
 *
 * ## ハーネス
 *
 * `detect_patterns.ts` と同じ順序で ctx を組み（`resolveParams` → `detectSwingPoints` →
 * `filterPeaks` / `filterValleys` → `getSizeThresholdsForTf`）、`detectTriples(ctx)` を**直接**呼ぶ。
 * `data.patterns` を見ないのは `globalDedup` と #218 の triple×H&S 排他で完成済み triple が
 * 代表を取れず消えることがあるため（`tests/patterns/target-progress-declared.test.ts` が
 * 同じ理由で対象を検出器層に置いているのと同じ配慮）。
 *
 * ## 比 `|target − breakoutPrice| / patternHeight` の再計算
 *
 * `computeTargetReach` は比を返さないので、**検出器の出力から同じ式で組み直す**:
 * `patternHeight` は 3 山 / 3 谷の平均とネックライン水準の差（検出器が渡している値そのもの）、
 * `breakoutPrice` は `breakout.price`、`target` は `breakoutTarget`。
 * `detect_triples.ts` の 4 経路すべてが `nlAvg` を `neckline[0].y` に載せているので復元できる。
 * 復元値が検出器の判定（`degenerate_target_distance` を名乗ったか）と矛盾しないことは
 * `assertRatioConsistency` が全行で検算する。
 */

import { writeFileSync } from 'node:fs';
import { dayjs } from '../lib/datetime.js';
import { buildBtcJpy2026Candles } from '../tests/fixtures/btc_jpy_1day_2026.js';
import { buildBtcJpy1hour202608Candles } from '../tests/fixtures/btc_jpy_1hour_2026_08.js';
import * as synth from '../tests/fixtures/synthetic_pattern_candles.js';
import { getSizeThresholdsForTf, resolveParams } from '../tools/patterns/config.js';
import { detectTriples } from '../tools/patterns/detect_triples.js';
import { PERIOD_SCORE_BAR_BUCKETS } from '../tools/patterns/helpers.js';
import { linearRegressionWithR2, near as nearFn, pct as pctFn } from '../tools/patterns/regression.js';
import { type Candle, detectSwingPoints, filterPeaks, filterValleys, type Pivot } from '../tools/patterns/swing.js';
import {
	MIN_TARGET_DISTANCE_HEIGHT_RATIO,
	TARGET_REACH_MAX_BARS,
	TARGET_REACHED_PCT_CAP,
} from '../tools/patterns/target-reach.js';
import type { CandDebugEntry, DeduplicablePattern, DetectContext } from '../tools/patterns/types.js';

type TripleType = 'triple_top' | 'triple_bottom';
const TRIPLE_TYPES: readonly TripleType[] = ['triple_top', 'triple_bottom'];

/** 全 11 時間足（`src/schema/base.ts` の `CandleTypeEnum` と同じ並び）。補助スイープで使う。 */
const ALL_TFS = [
	'1min',
	'5min',
	'15min',
	'30min',
	'1hour',
	'4hour',
	'8hour',
	'12hour',
	'1day',
	'1week',
	'1month',
] as const;

/**
 * 計測 2 のスイープ範囲。H&S / doubles では 0.12 が「膝」だったが、**triple の比は
 * 0.8 を下回らない**（下の実測）ので、膝が無いことを見せるには現行値 0.15 の周辺だけでは足りない。
 * 最初に 1 件でも除外が出る位置まで（比の max 付近まで）振る。
 */
const SWEEP_FROM = 0;
const SWEEP_TO = 1.1;
const SWEEP_STEP = 0.01;

type Group = 'synthetic' | 'realA' | 'realB' | 'sweepB';

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
}

/** 完成済み triple 1 件（= `computeTargetReach` の呼び出し 1 回）の実測行。 */
interface ReachRow {
	group: Group;
	series: string;
	tf: string;
	swingDepth: number | undefined;
	type: TripleType;
	/** strict / relaxed（`_fallback` の有無） */
	path: 'strict' | 'relaxed';
	breakoutIdx: number;
	breakoutPrice: number;
	target: number;
	necklinePrice: number;
	patternHeight: number;
	/** `|target − breakoutPrice|` */
	targetDistance: number;
	/** `targetDistance / patternHeight` */
	ratio: number;
	/** 主構成点の張るバー数（`periodScoreBars` の入力そのもの） */
	structureBars: number;
	/** ブレイク足の後ろに実際に取れた足数（`candles.length − 1 − breakoutIdx`） */
	barsAfterBreakout: number;
	/** `TARGET_REACH_MAX_BARS` 本ぶんの先が揃っているか */
	windowFull: boolean;
	/** 配線後の出力（退化ガードで落ちたら `undefined`） */
	targetReachedPct: number | undefined;
	targetReached: boolean | undefined;
	omittedReason: string | undefined;
	/**
	 * 走査窓を外して系列末尾まで見たときの「初到達までのバー数」（未到達なら `undefined`）。
	 * `TARGET_REACH_MAX_BARS` が triple に足りているかを見る材料で、**出力には影響しない**。
	 */
	firstReachBars: number | undefined;
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

/** MCP の統合オプション 3 つの全組み合わせ（#227 と同じ理由でケース数の単位を揃えるために 8 通り回す）。 */
const OPTS8: CaseOpts[] = Array.from({ length: 8 }, (_, b) => ({
	includeForming: (b & 1) !== 0,
	includeCompleted: (b & 2) !== 0,
	includeInvalid: (b & 4) !== 0,
}));

/** 補助スイープのオプション（既定 = 完成済みのみ）。11 tf × sd 4 種 = 44 ケースに掛けない。 */
const OPTS_DEFAULT: CaseOpts = { includeForming: false, includeCompleted: true, includeInvalid: false };

/** 940 ケース。標準 800 / 実データ B 96 / 補助スイープ 44 を**別々の配列**で返す（プールしない）。 */
function buildCorpus(): { standard: CaseSpec[]; realB: CaseSpec[]; sweepB: CaseSpec[] } {
	const standard: CaseSpec[] = [];
	for (const [name, build] of SYNTHETIC_BUILDERS) {
		const series: Series = { group: 'synthetic', name, candles: build() as Candle[] };
		for (const tf of ['1day', '1hour']) {
			for (const swingDepth of [2, 3]) {
				for (const opts of OPTS8) standard.push({ series, tf, swingDepth, opts });
			}
		}
	}
	const seriesA: Series = { group: 'realA', name: 'btc_jpy_1day_2026', candles: buildBtcJpy2026Candles() as Candle[] };
	const seriesB: Series = {
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
	standard.push(...realCases(seriesA));
	const sweepSeries: Series = { ...seriesB, group: 'sweepB' };
	const sweepB: CaseSpec[] = [];
	for (const tf of ALL_TFS) {
		for (const swingDepth of [undefined, 2, 3, 6])
			sweepB.push({ series: sweepSeries, tf, swingDepth, opts: OPTS_DEFAULT });
	}
	return { standard, realB: realCases(seriesB), sweepB };
}

// ── ハーネス（detect_patterns.ts と同じ ctx の組み方） ──

function buildCtx(spec: CaseSpec): DetectContext {
	const { candles } = spec.series;
	const resolved = resolveParams(spec.tf, spec.swingDepth === undefined ? {} : { swingDepth: spec.swingDepth });
	const pivots = detectSwingPoints(candles, { swingDepth: resolved.swingDepth, strictPivots: true });
	const debugCandidates: CandDebugEntry[] = [];
	return {
		candles,
		pivots,
		allPeaks: filterPeaks(pivots),
		allValleys: filterValleys(pivots),
		tolerancePct: resolved.tolerancePct,
		headProminencePct: resolved.headProminencePct,
		sizeThresholds: getSizeThresholdsForTf(spec.tf),
		minDist: resolved.minBarsBetweenSwings,
		want: new Set<string>(TRIPLE_TYPES),
		includeForming: spec.opts.includeForming,
		debugCandidates,
		type: spec.tf,
		swingDepth: resolved.swingDepth,
		near: (a: number, b: number) => nearFn(a, b, resolved.tolerancePct),
		pct: pctFn,
		lrWithR2: linearRegressionWithR2,
		tz: 'Asia/Tokyo',
	};
}

/** 主構成点（top は `H`、bottom は `L`）。`pivots` は #224 症状 3 以降 5 点で、ネックライン定義点が挟まる。 */
function mainPoints(p: DeduplicablePattern, type: TripleType): Pivot[] {
	const kind = type === 'triple_top' ? 'H' : 'L';
	return (p.pivots ?? []).filter((q: Pivot) => q.kind === kind);
}

/**
 * 走査窓を外したときの「初到達までのバー数」。**判定には使わない**（`TARGET_REACH_MAX_BARS` が
 * triple の構造に対して足りているかを見るためだけの参考値）。
 */
function firstReachBars(
	candles: readonly Candle[],
	breakoutIdx: number,
	target: number,
	direction: 'up' | 'down',
): number | undefined {
	for (let i = breakoutIdx; i < candles.length; i++) {
		const c = candles[i];
		if (!c) continue;
		const v = direction === 'down' ? Number(c.low) : Number(c.high);
		if (!Number.isFinite(v)) continue;
		if (direction === 'down' ? v <= target : v >= target) return i - breakoutIdx;
	}
	return undefined;
}

/** ケース 1 件を実行し、完成済み triple の実測行を返す。 */
function runCase(spec: CaseSpec): ReachRow[] {
	const ctx = buildCtx(spec);
	const { candles } = spec.series;
	const out: ReachRow[] = [];
	for (const p of detectTriples(ctx).patterns) {
		const type = p.type as TripleType;
		if (type !== 'triple_top' && type !== 'triple_bottom') continue;
		if (p.status !== 'completed') continue;
		const breakoutIdx = Number(p.breakoutBarIndex);
		const breakoutPrice = Number((p.breakout as { price?: number } | undefined)?.price);
		const target = Number(p.breakoutTarget);
		const necklinePrice = Number((p.neckline as Array<{ y: number }> | undefined)?.[0]?.y);
		const pts = mainPoints(p, type);
		const avg = pts.reduce((s, q) => s + q.price, 0) / Math.max(1, pts.length);
		const patternHeight = type === 'triple_top' ? avg - necklinePrice : necklinePrice - avg;
		const direction = type === 'triple_top' ? 'down' : 'up';
		const targetDistance = Math.abs(target - breakoutPrice);
		const idxs = pts.map((q) => q.idx);
		out.push({
			group: spec.series.group,
			series: spec.series.name,
			tf: spec.tf,
			swingDepth: spec.swingDepth,
			type,
			path: p._fallback ? 'relaxed' : 'strict',
			breakoutIdx,
			breakoutPrice,
			target,
			necklinePrice,
			patternHeight,
			targetDistance,
			ratio: patternHeight > 0 ? targetDistance / patternHeight : Number.NaN,
			structureBars: idxs.length > 0 ? Math.max(...idxs) - Math.min(...idxs) : Number.NaN,
			barsAfterBreakout: candles.length - 1 - breakoutIdx,
			windowFull: candles.length - 1 - breakoutIdx >= TARGET_REACH_MAX_BARS,
			targetReachedPct: typeof p.targetReachedPct === 'number' ? p.targetReachedPct : undefined,
			targetReached: typeof p.targetReached === 'boolean' ? p.targetReached : undefined,
			omittedReason: typeof p.targetProgressOmittedReason === 'string' ? p.targetProgressOmittedReason : undefined,
			firstReachBars: firstReachBars(candles, breakoutIdx, target, direction),
		});
	}
	return out;
}

/**
 * 再計算した比が検出器の判定と矛盾しないことの検算。
 * ズレたら `patternHeight` の復元が誤っている（= 表の数字が信用できない）ので止める。
 */
function assertRatioConsistency(rows: ReachRow[]): void {
	for (const r of rows) {
		const expectDegenerate =
			!(r.patternHeight > 0) || r.targetDistance < r.patternHeight * MIN_TARGET_DISTANCE_HEIGHT_RATIO;
		const actualDegenerate = r.omittedReason === 'degenerate_target_distance';
		if (expectDegenerate !== actualDegenerate) {
			throw new Error(
				`比の復元が検出器の判定と不一致: ${r.series}/${r.tf}/${r.type} idx=${r.breakoutIdx} ratio=${r.ratio} reason=${r.omittedReason}`,
			);
		}
	}
}

// ── 集計 ──

/** 構造単位のキー（#210 と同じ `系列 × tf × type × breakoutIdx × target`）。 */
function structKey(r: ReachRow): string {
	return `${r.series}|${r.tf}|${r.type}|${r.breakoutIdx}|${r.target}`;
}

function uniqueStructures(rows: ReachRow[]): ReachRow[] {
	const seen = new Map<string, ReachRow>();
	for (const r of rows) if (!seen.has(structKey(r))) seen.set(structKey(r), r);
	return [...seen.values()];
}

function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) return Number.NaN;
	const pos = (sorted.length - 1) * q;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	if (lo === hi) return sorted[lo];
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function fmt(n: number, digits = 4): string {
	return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function pctStr(num: number, den: number): string {
	return den === 0 ? '—' : `${((num / den) * 100).toFixed(1)}%`;
}

interface GroupSpec {
	label: string;
	rows: ReachRow[];
}

/** 計測 1: 退化ガードの発火率（生の行数と構造単位の両方）。 */
function fireTable(groups: GroupSpec[]): string[] {
	const out: string[] = [];
	out.push(`| 母集団 | 生の行数 | うち退化ガード発火 | 発火率 | 構造単位 | うち発火 | 発火率 |`);
	out.push('|---|---:|---:|---:|---:|---:|---:|');
	for (const g of groups) {
		const s = uniqueStructures(g.rows);
		const rawFire = g.rows.filter((r) => r.omittedReason === 'degenerate_target_distance').length;
		const stFire = s.filter((r) => r.omittedReason === 'degenerate_target_distance').length;
		out.push(
			`| ${g.label} | ${g.rows.length} | ${rawFire} | ${pctStr(rawFire, g.rows.length)} | ${s.length} | ${stFire} | ${pctStr(stFire, s.length)} |`,
		);
	}
	return out;
}

/** 計測 2: 比の分布（p50 と下側の並び）。 */
function ratioTable(groups: GroupSpec[]): string[] {
	const out: string[] = [];
	out.push('| 母集団 | n（構造単位） | min | p05 | p10 | p25 | **p50** | p75 | max |');
	out.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
	for (const g of groups) {
		const vals = uniqueStructures(g.rows)
			.map((r) => r.ratio)
			.filter((v) => Number.isFinite(v))
			.sort((a, b) => a - b);
		if (vals.length === 0) {
			out.push(`| ${g.label} | 0 | — | — | — | — | — | — | — |`);
			continue;
		}
		out.push(
			`| ${g.label} | ${vals.length} | ${fmt(vals[0])} | ${fmt(quantile(vals, 0.05))} | ${fmt(quantile(vals, 0.1))} | ${fmt(quantile(vals, 0.25))} | **${fmt(quantile(vals, 0.5))}** | ${fmt(quantile(vals, 0.75))} | ${fmt(vals[vals.length - 1])} |`,
		);
	}
	return out;
}

/**
 * 計測 2b: 閾値スイープ（#210 の「膝」の探し方をそのまま triple に当てる）。
 * 閾値を上げていったときに **残る `targetReachedPct` の最大値**がどこで落ちるかを見る。
 */
function kneeTable(rows: ReachRow[]): string[] {
	const structures = uniqueStructures(rows).filter((r) => Number.isFinite(r.ratio));
	const out: string[] = [];
	out.push('| 閾値 | 除外（構造単位） | 残る `targetReachedPct` の最大値 |');
	out.push('|---:|---:|---:|');
	let prev: string | null = null;
	for (let t = SWEEP_FROM; t <= SWEEP_TO + 1e-9; t += SWEEP_STEP) {
		const kept = structures.filter((r) => r.ratio >= t);
		const excluded = structures.length - kept.length;
		// スイープは「その閾値なら出たはずの pct」を見るので、実際に測れた行の pct を使う。
		const pcts = kept.map((r) => r.targetReachedPct).filter((v): v is number => typeof v === 'number');
		const max = pcts.length > 0 ? Math.max(...pcts) : Number.NaN;
		// 除外件数か最大値のどちらかが動いた段だけ出す（0.01 刻みの全段は読めない）。
		const cell = `${excluded}|${max}`;
		if (prev !== cell) {
			out.push(`| ${t.toFixed(2)} | ${excluded} | ${Number.isFinite(max) ? `${max}%` : '—'} |`);
		}
		prev = cell;
	}
	return out;
}

/** 計測 3: 上限 999 に当たった件数。 */
function capTable(groups: GroupSpec[]): string[] {
	const out: string[] = [];
	out.push(`| 母集団 | 測れた行 | \`>= ${TARGET_REACHED_PCT_CAP}\` | 構造単位 | 測れた構造の pct 最大 |`);
	out.push('|---|---:|---:|---:|---:|');
	for (const g of groups) {
		const measured = g.rows.filter((r) => typeof r.targetReachedPct === 'number');
		const capped = measured.filter((r) => (r.targetReachedPct as number) >= TARGET_REACHED_PCT_CAP);
		const st = uniqueStructures(capped).length;
		const max = measured.length > 0 ? Math.max(...measured.map((r) => r.targetReachedPct as number)) : Number.NaN;
		out.push(
			`| ${g.label} | ${measured.length} | ${capped.length} | ${st} | ${Number.isFinite(max) ? `${max}%` : '—'} |`,
		);
	}
	return out;
}

/** 計測 4: 走査窓 60 本が揃う割合と、triple の構成バー数。 */
function windowTable(groups: GroupSpec[]): string[] {
	const out: string[] = [];
	out.push(
		`| 母集団 | 構造単位 | 60 本先が揃う | 割合 | ブレイク後の足数 p50 | 構成バー数 p50 | 構成バー数 min–max | 初到達バー数 p50 / p95 |`,
	);
	out.push('|---|---:|---:|---:|---:|---:|---:|---:|');
	for (const g of groups) {
		const s = uniqueStructures(g.rows);
		if (s.length === 0) {
			out.push(`| ${g.label} | 0 | — | — | — | — | — | — |`);
			continue;
		}
		const full = s.filter((r) => r.windowFull).length;
		const after = s.map((r) => r.barsAfterBreakout).sort((a, b) => a - b);
		const bars = s
			.map((r) => r.structureBars)
			.filter((v) => Number.isFinite(v))
			.sort((a, b) => a - b);
		const reach = s
			.map((r) => r.firstReachBars)
			.filter((v): v is number => typeof v === 'number')
			.sort((a, b) => a - b);
		out.push(
			`| ${g.label} | ${s.length} | ${full} | ${pctStr(full, s.length)} | ${quantile(after, 0.5).toFixed(0)} | ${quantile(bars, 0.5).toFixed(0)} | ${bars.length > 0 ? `${bars[0]}–${bars[bars.length - 1]}` : '—'} | ${reach.length > 0 ? `${quantile(reach, 0.5).toFixed(0)} / ${quantile(reach, 0.95).toFixed(0)}` : '—'} |`,
		);
	}
	return out;
}

/** 理由コード別の内訳（`not_computed_by_detector` が消えたことの検算を含む）。 */
function reasonTable(groups: GroupSpec[]): string[] {
	const out: string[] = [];
	const codes = [...new Set(groups.flatMap((g) => g.rows.map((r) => r.omittedReason ?? '（測れた）')))].sort();
	out.push(`| 母集団 | ${codes.map((c) => `\`${c}\``).join(' | ')} |`);
	out.push(`|---|${codes.map(() => '---:').join('|')}|`);
	for (const g of groups) {
		const cells = codes.map((c) => g.rows.filter((r) => (r.omittedReason ?? '（測れた）') === c).length);
		out.push(`| ${g.label} | ${cells.join(' | ')} |`);
	}
	return out;
}

// ── main ──

function main(): void {
	const { standard, realB, sweepB } = buildCorpus();
	const all = [...standard, ...realB, ...sweepB];
	const rows = all.flatMap(runCase);
	assertRatioConsistency(rows);

	const stdRows = rows.filter((r) => r.group === 'synthetic' || r.group === 'realA');
	const bRows = rows.filter((r) => r.group === 'realB');
	const sweepRows = rows.filter((r) => r.group === 'sweepB');
	/** ネイティブ時間足だけの行（#219: 実データ A / B をプールしない）。 */
	const nativeA = rows.filter((r) => r.group === 'realA' && r.tf === '1day');
	const nativeB = bRows.filter((r) => r.tf === '1hour');

	const groups: GroupSpec[] = [
		{ label: '標準コーパス 800（合成 704 + 実データ A 96）', rows: stdRows },
		{ label: '　うち合成 704', rows: rows.filter((r) => r.group === 'synthetic') },
		{ label: '　うち実データ A 96（`btc_jpy` 1day）', rows: rows.filter((r) => r.group === 'realA') },
		{ label: '実データ B 96（`btc_jpy` 1hour。別建て）', rows: bRows },
		{ label: '補助スイープ 44（実データ B × 全 11 時間足）', rows: sweepRows },
	];
	const natives: GroupSpec[] = [
		{ label: '**実データ B ネイティブ**（1hour × 1hour）', rows: nativeB },
		{ label: '**実データ A ネイティブ**（1day × 1day）', rows: nativeA },
	];

	const out: string[] = [];
	out.push('# issue #228: triple 完成済み 4 経路の target 進捗（配線後の実測）');
	out.push('');
	out.push(
		`計測日: ${dayjs().format('YYYY-MM-DD')} / コーパス **${all.length} ケース** / ` +
			`完成済み triple の生の行数 **${rows.length}** / 構造単位 **${uniqueStructures(rows).length}**`,
	);
	out.push('');
	out.push(
		`定数は 1 つも変えていない（現行値: \`MIN_TARGET_DISTANCE_HEIGHT_RATIO\` = ${MIN_TARGET_DISTANCE_HEIGHT_RATIO} / ` +
			`\`TARGET_REACHED_PCT_CAP\` = ${TARGET_REACHED_PCT_CAP} / \`TARGET_REACH_MAX_BARS\` = ${TARGET_REACH_MAX_BARS}）。`,
	);
	out.push('');
	out.push('## 計測 1: `MIN_TARGET_DISTANCE_HEIGHT_RATIO`（0.15）の発火率');
	out.push('');
	out.push(...fireTable(groups));
	out.push('');
	out.push('### ネイティブ時間足（プールしない）');
	out.push('');
	out.push(...fireTable(natives));
	out.push('');
	out.push('## 計測 2: `|target − breakoutPrice| / patternHeight` の分布（構造単位）');
	out.push('');
	out.push(...ratioTable(groups));
	out.push('');
	out.push(...ratioTable(natives));
	out.push('');
	out.push('### 下側の並び（構造単位・小さい順に 20 件）');
	out.push('');
	{
		const s = uniqueStructures(rows)
			.filter((r) => Number.isFinite(r.ratio))
			.sort((a, b) => a.ratio - b.ratio)
			.slice(0, 20);
		out.push('| # | 比 | 母集団 | 系列 | tf | type | 経路 | breakoutIdx | 出力 |');
		out.push('|---:|---:|---|---|---|---|---|---:|---|');
		s.forEach((r, i) => {
			const output = r.omittedReason ?? (typeof r.targetReachedPct === 'number' ? `${r.targetReachedPct}%` : '—');
			out.push(
				`| ${i + 1} | ${fmt(r.ratio)} | ${r.group} | ${r.series} | ${r.tf} | ${r.type} | ${r.path} | ${r.breakoutIdx} | ${output} |`,
			);
		});
	}
	out.push('');
	out.push('### 閾値スイープ（膝を探す。全母集団の構造単位）');
	out.push('');
	out.push(...kneeTable(rows));
	out.push('');
	out.push(`## 計測 3: \`TARGET_REACHED_PCT_CAP\`（${TARGET_REACHED_PCT_CAP}）に当たった件数`);
	out.push('');
	out.push(...capTable(groups));
	out.push('');
	out.push(...capTable(natives));
	out.push('');
	out.push(`## 計測 4: \`TARGET_REACH_MAX_BARS\`（${TARGET_REACH_MAX_BARS} 本）が揃う構造の割合`);
	out.push('');
	out.push(
		`\`periodScoreBars\` のバケット境界は \`[${PERIOD_SCORE_BAR_BUCKETS.join(', ')}]\`（バー数）。` +
			'「構成バー数」は主構成点（3 山 / 3 谷）の張るバー数 = `periodScoreBars` の入力そのもの。',
	);
	out.push('');
	out.push(...windowTable(groups));
	out.push('');
	out.push(...windowTable(natives));
	out.push('');
	out.push('## 参考: 構造単位の全件（母集団が小さいので全部出す）');
	out.push('');
	out.push(
		'| # | 母集団 | 系列 | tf | sd | type | 経路 | 構成バー | breakoutIdx | ブレイク後 | 60本 | 高さ | 距離 | 比 | pct | 到達 | 初到達 |',
	);
	out.push('|---:|---|---|---|---|---|---|---:|---:|---:|:-:|---:|---:|---:|---:|:-:|---:|');
	uniqueStructures(rows)
		.sort((a, b) => a.ratio - b.ratio)
		.forEach((r, i) => {
			out.push(
				`| ${i + 1} | ${r.group} | ${r.series} | ${r.tf} | ${r.swingDepth ?? 'auto'} | ${r.type} | ${r.path} | ` +
					`${r.structureBars} | ${r.breakoutIdx} | ${r.barsAfterBreakout} | ${r.windowFull ? 'YES' : '—'} | ` +
					`${Math.round(r.patternHeight)} | ${Math.round(r.targetDistance)} | ${fmt(r.ratio)} | ` +
					`${typeof r.targetReachedPct === 'number' ? `${r.targetReachedPct}%` : (r.omittedReason ?? '—')} | ` +
					`${r.targetReached === true ? 'YES' : r.targetReached === false ? 'no' : '?'} | ${r.firstReachBars ?? '—'} |`,
			);
		});
	out.push('');
	out.push('## 参考: 理由コード別の内訳（生の行数）');
	out.push('');
	out.push(...reasonTable([...groups, ...natives]));
	out.push('');

	const md = out.join('\n');
	const jsonFlag = process.argv.indexOf('--json');
	if (jsonFlag >= 0 && process.argv[jsonFlag + 1]) {
		writeFileSync(process.argv[jsonFlag + 1], JSON.stringify({ rows }, null, 2));
	}
	process.stdout.write(`${md}\n`);
}

main();
