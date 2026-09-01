/**
 * Double Top / Double Bottom 検出（完成済み＋形成中）
 * detect_patterns.ts Section 2 から抽出
 */
import { EPSILON } from '../../lib/math.js';
import { generatePatternDiagram } from '../../lib/pattern-diagrams.js';
import { patternBarRange } from './bar-thresholds.js';
import { computeTargetReach, deduplicatePatterns, finalizeConf, periodScoreDays } from './helpers.js';
import { clamp01, relDev } from './regression.js';
import {
	DOUBLE_LEVEL_MAX_PCT,
	detectTroughZoneReentry,
	isSameLevel,
	levelSpreadDetailsFrom,
	levelSpreadMetrics,
	type PatternSizeRejectReason,
	type PriorTrendResult,
	RETRACEMENT_MAX,
	RETRACEMENT_MIN,
	type ReversalSide,
	type ReversalStructureResult,
	type SizeThresholds,
	validateLevelDiff,
	validatePriorTrend,
	validateReversalStructure,
} from './structural.js';
import type { Pivot } from './swing.js';
import {
	type CandleData,
	type DetectContext,
	type DetectResult,
	type PatternConfirmation,
	type PatternEntry,
	type PatternPrecedingTrend,
	type PatternScoreBreakdown,
	type PatternStructureGate,
	pushCand,
} from './types.js';

// ── Configuration ──
//
// ピボット間の最小距離の定数はここには無い。`ctx.minDist`（`resolveParams` が解決した
// `minBarsBetweenSwings`）を使う。以前は検出器ローカルの `MIN_PIVOT_DISTANCE_BARS = 5` が
// `ctx.minDist` を**無視して**いた（issue #130）。`detect_triples` / `detect_hs` は同じ反転系の
// ピボット列構造でありながら `ctx.minDist` をそのまま使っており、double だけが公開パラメータ
// `minBarsBetweenSwings` を黙って上書きしていた。時間足既定は日足 4 本 / 1時間足 2 本なので、
// **日足では 4 本間隔の構成が常に落ちていた**（BTC/JPY 2026-08-10 → 08-14 の 4 本がこれ）。
const BREAKOUT_BUFFER_PCT = 0.015;
const MAX_BARS_FROM_EXTREMUM = 20;
const RELAXED_TOLERANCE_FACTOR = 1.3;
const RELAXED_CONFIDENCE_PENALTY = 0.85;
/**
 * 形成中ダブルトップ / ボトムの形成期間の上限の日数由来。**実効値はバー数**で、
 * `getDoubleFormingBarParams` が `patterns/bar-thresholds.ts` の換算を通して決める。
 */
const MAX_FORMING_DAYS = 90;
const FORMING_PEAK_TOLERANCE_PCT = 0.05;
const FORMING_BASE_COMPLETION = 0.66;
const FORMING_COMPLETION_RANGE = 0.34;
/**
 * 形成中ダブルトップの完成度の下限。
 *
 * **現行の定数では到達しない。** `completion = min(1, FORMING_BASE_COMPLETION + progress * FORMING_COMPLETION_RANGE)`
 * で `progress ∈ [0, 1]` なので最小値は `FORMING_BASE_COMPLETION = 0.66` になり、0.4 を下回れない。
 * 重み側（0.66 / 0.34）を触ったときに効き始めるガードとして残してあり、
 * `forming_completion_below_min` の理由コードもそのために積む（issue #158。#155 の
 * `FORMING_MIN_COMPLETION`（`detect_hs.ts`）と同じ事情）。
 */
export const MIN_FORMING_COMPLETION = 0.4;
/**
 * 形成中ダブルトップ / ボトムの形成期間の下限の日数由来。**実効値はバー数**で、
 * `getDoubleFormingBarParams` が `patterns/bar-thresholds.ts` の換算を通して決める。
 * ここの日数は「その値がどこから来たか」を示す注記であって、暦日数の要件ではない。
 */
export const MIN_PATTERN_DAYS = 14;
const FORMING_TOLERANCE_MULTIPLIER = 1.5;
const FORMING_VALLEY_INVALID_PCT = 0.02;
/**
 * 形成中パターンが `forming` を名乗れる、第2構成点確定からの経過バー数の上限（issue #126 G4）。
 *
 * **{@link MAX_BARS_FROM_EXTREMUM} と同じ値であることに意味がある。** 完成済み判定の
 * `findBreakoutIdx` は第2構成点から `MAX_BARS_FROM_EXTREMUM` 本しかネックライン突破を探さない。
 * つまりそれを過ぎた候補は、以後どれだけ待っても `completed` にはならない。
 * 「形成中＝まだ完成しうる」を成立させるには、形成中側の期限を突破探索窓と一致させるしかない。
 *
 * これが無かったため、現値がネックラインを大きく上回っている状態でも「形成中」と
 * 報告され続けていた（8/25 時点で +17.8%）。
 */
const FORMING_EXPIRY_BARS = MAX_BARS_FROM_EXTREMUM;

/**
 * 形成中ダブルトップ / ボトムが要求する形成バー数のレンジ
 * （`formationBars = lastIdx - 左ピボット.idx`）。
 *
 * 旧実装は `patternDays = Math.round(formationBars × 手書き daysPerBar)` を作って 14〜90 日で
 * 判定していた。手書きの換算（`1day`→1 / `1week`→7 / **それ以外→1**）は intraday と `1month` を
 * 「1 日 / 本」に落とすため、`1month` は 14 バー = 14 ヶ月を要求し、intraday では日数閾値が
 * 偶然そのままバー数閾値として効いていた（issue #118 問題 3）。
 *
 * `detect_triples` の形成中判定（`getTripleFormingBarParams`）と同じ換算に統一してある。
 * `patterns/min-bars.ts` が「時間足 → 最小要求バー数」を導出するのに参照するため export する。
 */
export function getDoubleFormingBarParams(tf: string): { minBars: number; maxBars: number } {
	return patternBarRange(tf, MIN_PATTERN_DAYS, MAX_FORMING_DAYS);
}

type Pcand = (arg: Parameters<typeof pushCand>[1]) => void;

// ── Helper: ブレイクアウトインデックス検出 ──

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

// ── Helper: PriorTrendResult → PatternPrecedingTrend ──

function buildPrecedingTrend(
	candles: CandleData[],
	trend: PriorTrendResult,
	startIdx: number,
): PatternPrecedingTrend | undefined {
	const startIso = candles[trend.priorStartIdx]?.isoTime;
	const endIso = candles[startIdx]?.isoTime;
	if (!startIso || !endIso) return undefined;
	return {
		start: startIso,
		end: endIso,
		direction: trend.classification,
		returnPct: Number((trend.priorReturn * 100).toFixed(2)),
		lookbackBars: trend.lookbackBars,
	};
}

// ── Helper: ネックラインブレイク確認 → PatternConfirmation ──

function buildNecklineConfirmation(candles: CandleData[], breakoutIdx: number): PatternConfirmation | undefined {
	const date = candles[breakoutIdx]?.isoTime;
	if (!date) return undefined;
	return {
		type: 'neckline_breakout',
		date,
		idx: breakoutIdx,
		price: Number(candles[breakoutIdx]?.close ?? NaN),
	};
}

// ── Helper: ダブルトップ / ボトムのサイズ検証（不合格理由 or null） ──

/**
 * サイズ検査は**値幅の評価**なので、価格基準は `Pivot.extremePrice`（高安）で測る。
 *
 * #126 / #131 で構造ゲートの戻り率を `extremePrice` に寄せた判断の横展開（issue #130）。
 * 終値基準では**ヒゲの大きい区間で値幅が実際の 1/3 に見える**——BTC/JPY 日足の実在する
 * ダブルボトム（2026-08-03 → 08-10 → 08-14）は高安基準で 5.87% / 5.13% あるのに、
 * 終値基準では 1.85% / 1.67% にしか見えない。
 *
 * **この実例は 1day のもので、閾値も 1day の値（`heightPct` 3% / `depthPct` 5%）で読む**
 * （issue #152 で閾値が時間足別になった。実値は `config.ts` の `getSizeThresholdsForTf`）。
 * 1.85% < 3% かつ 1.67% < 5% で両方を割り、偽陰性になっていた。閾値が緩い下位時間足では
 * 同じ数値でも通るが、**基準を `extremePrice` にする理由は閾値と独立**——値幅を終値で測ると
 * 実際の 1/3 に見えるという歪みは、閾値をいくつにしても残る。
 *
 * **同水準判定（`near` / `isSameLevel(a.price, c.price)`）が終値基準のままなのは意図的。**
 * 「2 点が同じ水準か」は値幅ではなく水準の一致の問題で、ヒゲ 1 本で同水準判定が動くのを
 * 避けるために終値を見ている。ネックラインの「線」も同じ理由で終値基準
 * （`structural.ts` の {@link ReversalSide} の docstring を参照）。
 *
 * **引数は `Pick<Pivot, 'extremePrice'>`**（`validatePatternSize` と同じ形）。形成中パスの
 * 暫定構成点（最新足）は極値判定を通っていないので `Pivot` を組み立てられず、
 * `{ extremePrice: 最新足の終値 }` を渡す（issue #169。triple / H&S の形成中パスと同じ idiom）。
 */
function validateTopSize(
	a: Pick<Pivot, 'extremePrice'>,
	b: Pick<Pivot, 'extremePrice'>,
	c: Pick<Pivot, 'extremePrice'>,
	thresholds: SizeThresholds,
): PatternSizeRejectReason | null {
	const heightPct = Math.abs(a.extremePrice - b.extremePrice) / Math.max(1, Math.max(a.extremePrice, b.extremePrice));
	if (heightPct < thresholds.heightPct) return 'pattern_too_small';
	const peakAvg = (a.extremePrice + c.extremePrice) / 2;
	const valleyDepthPct = (peakAvg - b.extremePrice) / Math.max(1, peakAvg);
	if (valleyDepthPct < thresholds.depthPct) return 'valley_too_shallow';
	return null;
}

/** {@link validateTopSize} の符号反転版。価格基準・引数型の根拠は同関数の docstring を参照。 */
function validateBottomSize(
	a: Pick<Pivot, 'extremePrice'>,
	b: Pick<Pivot, 'extremePrice'>,
	c: Pick<Pivot, 'extremePrice'>,
	thresholds: SizeThresholds,
): PatternSizeRejectReason | null {
	const heightPct = Math.abs(a.extremePrice - b.extremePrice) / Math.max(1, Math.max(a.extremePrice, b.extremePrice));
	if (heightPct < thresholds.heightPct) return 'pattern_too_small';
	const valleyAvg = (a.extremePrice + c.extremePrice) / 2;
	const peakHeightPct = (b.extremePrice - valleyAvg) / Math.max(1, valleyAvg);
	if (peakHeightPct < thresholds.depthPct) return 'peak_too_shallow';
	return null;
}

/**
 * 高さ相対の同水準検査（issue #178 項目 4）。棄却したら debug candidate を積んで `true` を返す
 * （呼び出し側は `continue`）。
 *
 * ## なぜ double にも要るのか
 *
 * 既存の同水準判定は `near`（`tolerancePct`）と `isSameLevel`（{@link DOUBLE_LEVEL_MAX_PCT}）の
 * 2 段で、**どちらも分母が価格水準**——パターン自身の高さと無関係。#138 が triple で問題にした
 * 転倒がそのまま当てはまる形で、`levelSpreadMetrics` の分子（2 山 / 2 谷）は分母（全構成点の
 * 全振幅）を作る点でもあるため、**比が「2 山の差がパターンの深さの何割か」という自己完結した
 * 命題になる**（H&S の肩は分母の端点にならないので同じ指標が意味を持たず、#178 項目 3 は
 * 「不要」で決着している）。**同じ点を使うだけで、分子は終値・分母は高安**なので
 * `spreadAbs <= heightAbs` は成り立たない（比の上界は `validateLevelDiff` の docstring）。
 *
 * ## 呼び出し位置
 *
 * **既存の棄却検査をすべて通過した後**——{@link applyStructuralGate} と
 * {@link checkPostPivotInvalidation} の**両方より後**。前に置くと
 * `neckline_above_pre_decline_high` / `reclassified_as_triple_top` を持つ候補の `reason` を
 * 横取りする（`validatePatternSize` / `validateLevelSpread` の docstring と同じ理由）。
 * 最後に置けば **「これまで accepted だった候補だけを落とす」ことが位置から保証される**。
 *
 * ## 理由コードに `_relaxed` 接尾辞を付けない
 *
 * 本ファイルの `_relaxed` 接尾辞は**閾値が違う検査**に付いている（`peaks_not_equal` は
 * `tolerancePct`、`peaks_not_equal_relaxed` は `tolerancePct × RELAXED_TOLERANCE_FACTOR`）。
 * 本ゲートは strict / relaxed とも同じ `MAX_LEVEL_SPREAD_RATIO` を使うので分けない
 * ——`reclassified_as_triple_top` / `prior_trend_mismatch:` が既に両経路で無印なのと同じ。
 *
 * ## `levelTolerancePct`
 *
 * `details` に載せるのは**その経路の同水準判定の実効値**。double は `near`（または
 * `nearRelaxed`）と `isSameLevel` が**同じ量（`relDiff`）を見ている**ので、実効値は
 * 2 つの `min`。`HS_SHOULDER_MAX_PCT` の docstring が H&S の肩について書いているのと同じ構造で、
 * 現行の既定パラメータでは全時間足で {@link DOUBLE_LEVEL_MAX_PCT} 側が律速する。
 */
function rejectByLevelDiff(
	side: ReversalSide,
	type: 'double_top' | 'double_bottom',
	a: Pivot,
	b: Pivot,
	c: Pivot,
	levelTolerancePct: number,
	pcand: Pcand,
): boolean {
	const metrics = levelSpreadMetrics([a, c], [a, b, c]);
	const reason = validateLevelDiff(side, metrics);
	if (!reason) return false;
	const outerRole = side === 'top' ? 'peak' : 'valley';
	const midRole = side === 'top' ? 'valley' : 'peak';
	pcand({
		type,
		accepted: false,
		reason,
		idxs: [a.idx, b.idx, c.idx],
		pts: [
			{ role: `${outerRole}1`, idx: a.idx, price: a.price },
			{ role: midRole, idx: b.idx, price: b.price },
			{ role: `${outerRole}2`, idx: c.idx, price: c.price },
		],
		details: levelSpreadDetailsFrom(metrics, levelTolerancePct),
	});
	return true;
}

/**
 * 完成済みのサイズ検査の理由コードを、形成中パス用に `forming_` 接頭辞付きへ写す（issue #169）。
 *
 * **完成済みと同じ `pattern_too_small` / `valley_too_shallow` / `peak_too_shallow` を
 * そのまま使わない。** `view=debug` の候補一覧は完成済みと形成中の棄却が同じ配列に並ぶので、
 * 同名だとどちらの経路で落ちたかが読めなくなる。形成中の既存の理由コードが
 * `forming_` 接頭辞で揃っている（`forming_bars_out_of_range` 等）のに合わせる。
 */
function formingSizeReason(reason: PatternSizeRejectReason): string {
	return `forming_${reason}`;
}

// ── Helper: 構造ゲート（issue #126）──

/**
 * 構造ゲート（{@link validateReversalStructure}）を適用し、不合格なら debug candidate を
 * 積んで `null` を返す。
 *
 * **スコアの減点ではなく hard reject。** ここを通らない形は整合度がいくら高くても
 * 検出結果に出さない。issue #126 の 7/1〜8/3 の偽陽性（ネックラインが先行下落の起点より
 * 4.88% 上にあり「下抜け」という事象が存在しないまま整合度 1.00 が付いていた）はここで落ちる。
 *
 * 価格基準は `Pivot.extremePrice`（高安）。既存の同水準判定（`isSameLevel(a.price, c.price)`）が
 * 終値基準のままなのは意図的で、本ゲートだけが `extremePrice` を見る——
 * 理由は `structural.ts` の {@link ReversalSide} の docstring を参照。
 */
function applyStructuralGate(
	candles: CandleData[],
	pivots: ReadonlyArray<Pivot>,
	side: ReversalSide,
	a: Pivot,
	b: Pivot,
	c: Pivot,
	necklinePrice: number,
	type: 'double_top' | 'double_bottom',
	pcand: Pcand,
): ReversalStructureResult | null {
	const gate = validateReversalStructure({ candles, pivots, first: a, mid: b, necklinePrice, side });
	if (gate.ok) return gate;
	const outerRole = side === 'bottom' ? 'valley' : 'peak';
	pcand({
		type,
		accepted: false,
		reason: gate.reason,
		idxs: [a.idx, b.idx, c.idx],
		pts: [
			...(gate.priorExtreme
				? [{ role: 'prior_extreme', idx: gate.priorExtreme.idx, price: gate.priorExtreme.extremePrice }]
				: []),
			{ role: `${outerRole}1`, idx: a.idx, price: a.price },
			{ role: side === 'bottom' ? 'peak' : 'valley', idx: b.idx, price: b.price },
			{ role: `${outerRole}2`, idx: c.idx, price: c.price },
		],
	});
	return null;
}

/** {@link ReversalStructureResult} → `PatternEntry.structureGate` */
function buildStructureGate(gate: ReversalStructureResult): PatternStructureGate | undefined {
	const out: PatternStructureGate = {};
	if (gate.retracementRatio !== undefined) out.retracementRatio = Number(gate.retracementRatio.toFixed(4));
	if (gate.priorExtreme) {
		out.priorExtremeIdx = gate.priorExtreme.idx;
		out.priorExtremePrice = gate.priorExtreme.extremePrice;
	}
	if (gate.necklineCrossIdx !== undefined) out.necklineCrossIdx = gate.necklineCrossIdx;
	return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * 戻り率スコア。許容帯 [{@link RETRACEMENT_MIN}, {@link RETRACEMENT_MAX}] の**中央で 1、端で 0**。
 *
 * 帯の外は構造ゲートが既に弾いているので、ここに来る値は必ず帯の中にある。
 * 「帯の中央 = 教科書的な戻り」という評価であって、合否の判定ではない。
 */
function retracementScore(ratio: number | undefined): number | undefined {
	if (ratio === undefined || !Number.isFinite(ratio)) return undefined;
	const center = (RETRACEMENT_MIN + RETRACEMENT_MAX) / 2;
	const halfWidth = (RETRACEMENT_MAX - RETRACEMENT_MIN) / 2;
	if (halfWidth <= 0) return undefined;
	return clamp01(1 - Math.abs(ratio - center) / halfWidth);
}

/**
 * ブレイク品質スコア。突破足の終値がネックラインをパターン高さの何割ぶん超えたか。
 *
 * ネックラインぎりぎりの突破（`BREAKOUT_BUFFER_PCT` すれすれ）と、
 * 高さの半分ぶん一気に抜けた突破を同じ整合度にしないための軸。
 */
function breakoutQualityScore(
	necklinePrice: number,
	breakoutClose: number,
	patternHeight: number,
	side: ReversalSide,
): number | undefined {
	if (!Number.isFinite(breakoutClose) || !(patternHeight > EPSILON)) return undefined;
	const excess = side === 'bottom' ? breakoutClose - necklinePrice : necklinePrice - breakoutClose;
	return clamp01(excess / patternHeight);
}

/**
 * 完成済みダブルの整合度サブスコア。
 *
 * 旧実装は `(tolMargin + symmetry + per) / 3` で、`tolMargin` と `symmetry` は
 * どちらも「2 点が同水準か」を測る同じ軸だった（実質 2 軸）。**戻り率**と**ブレイク品質**を
 * 独立軸として足し、4 軸の平均にする。構造的に無効な形に 1.00 が付いていた問題
 * （issue #126 G3）は構造ゲート側で塞ぐが、通過後の形の良さもこれで解像度が上がる。
 */
function buildDoubleScore(opts: {
	outer1: number;
	outer2: number;
	necklinePrice: number;
	breakoutClose: number;
	patternHeight: number;
	side: ReversalSide;
	retracementRatio?: number;
	durationScore: number;
}): { components: PatternScoreBreakdown; base: number } {
	const symmetry = clamp01(1 - relDev(opts.outer1, opts.outer2));
	const retracement = retracementScore(opts.retracementRatio);
	const breakoutQuality = breakoutQualityScore(opts.necklinePrice, opts.breakoutClose, opts.patternHeight, opts.side);
	const components: PatternScoreBreakdown = {
		symmetry: Number(symmetry.toFixed(4)),
		...(retracement !== undefined ? { retracement: Number(retracement.toFixed(4)) } : {}),
		...(breakoutQuality !== undefined ? { breakoutQuality: Number(breakoutQuality.toFixed(4)) } : {}),
		duration: Number(opts.durationScore.toFixed(4)),
	};
	// 算出できなかった軸は平均から外す（0 として混ぜると欠測が減点になる）
	const values = [symmetry, retracement, breakoutQuality, opts.durationScore].filter(
		(v): v is number => v !== undefined,
	);
	const base = values.reduce((sum, v) => sum + v, 0) / values.length;
	return { components, base };
}

/**
 * 第2構成点の確定後にパターンが崩れていないかを見て、崩れていれば終端 status を返す
 * （issue #126 G5）。
 *
 * 谷ゾーンへ戻ってしまった候補は、同水準の第3構成点があれば triple への再分類対象なので
 * **何も出さない**（`detect_triples` に委ねる）。無ければ `invalid` として理由コード付きで出す。
 */
function checkPostPivotInvalidation(opts: {
	candles: CandleData[];
	pivots: ReadonlyArray<Pivot>;
	a: Pivot;
	b: Pivot;
	c: Pivot;
	untilIdx: number;
	side: ReversalSide;
}): { verdict: 'ok' } | { verdict: 'reclassify' } | { verdict: 'invalid'; reason: string; idx?: number } {
	const reentry = detectTroughZoneReentry({
		candles: opts.candles,
		first: opts.a,
		mid: opts.b,
		second: opts.c,
		untilIdx: opts.untilIdx,
		side: opts.side,
	});
	if (!reentry.reentered) return { verdict: 'ok' };

	const level = (opts.a.price + opts.c.price) / 2;
	const kind = opts.side === 'bottom' ? 'L' : 'H';
	const hasThird = opts.pivots.some(
		(p) => p.idx > opts.c.idx && p.kind === kind && isSameLevel(p.price, level, DOUBLE_LEVEL_MAX_PCT),
	);
	if (hasThird) return { verdict: 'reclassify' };
	return { verdict: 'invalid', reason: 're_entered_trough_zone', idx: reentry.idx };
}

// ── Helper: relaxed fallback ダブルトップ検索 ──

function findRelaxedDoubleTop(
	pivots: Pivot[],
	candles: CandleData[],
	tolerancePct: number,
	factor: number,
	minDist: number,
	pcand: Pcand,
	sizeThresholds: SizeThresholds,
	tz: string | undefined,
): PatternEntry | null {
	const tolRelax = tolerancePct * factor;
	const nearRelaxed = (x: number, y: number) => Math.abs(x - y) <= Math.max(x, y) * tolRelax;

	for (let i = 0; i + 2 < pivots.length; i++) {
		const a = pivots[i],
			b = pivots[i + 1],
			c = pivots[i + 2];
		if (!(a.kind === 'H' && b.kind === 'L' && c.kind === 'H')) continue;
		if (b.idx - a.idx < minDist || c.idx - b.idx < minDist) continue;

		const sizeReason = validateTopSize(a, b, c, sizeThresholds);
		if (sizeReason) {
			const reason = sizeReason === 'valley_too_shallow' ? 'valley_too_shallow_relaxed' : sizeReason;
			pcand({ type: 'double_top', accepted: false, reason, idxs: [a.idx, b.idx, c.idx] });
			continue;
		}
		if (!nearRelaxed(a.price, c.price)) {
			pcand({
				type: 'double_top',
				accepted: false,
				reason: 'peaks_not_equal_relaxed',
				idxs: [a.idx, b.idx, c.idx],
				pts: [
					{ role: 'peak1', idx: a.idx, price: a.price },
					{ role: 'peak2', idx: c.idx, price: c.price },
				],
			});
			continue;
		}
		if (!isSameLevel(a.price, c.price, DOUBLE_LEVEL_MAX_PCT)) {
			pcand({
				type: 'double_top',
				accepted: false,
				reason: 'peaks_not_equal_structural',
				idxs: [a.idx, b.idx, c.idx],
				pts: [
					{ role: 'peak1', idx: a.idx, price: a.price },
					{ role: 'peak2', idx: c.idx, price: c.price },
				],
			});
			continue;
		}

		const necklinePrice = b.price;
		const breakoutIdx = findBreakoutIdx(candles, c.idx, necklinePrice, 'below');
		if (breakoutIdx < 0) {
			pcand({
				type: 'double_top',
				accepted: false,
				reason: 'no_breakout_relaxed',
				idxs: [a.idx, b.idx, c.idx],
				pts: [
					{ role: 'peak1', idx: a.idx, price: a.price },
					{ role: 'valley', idx: b.idx, price: b.price },
					{ role: 'peak2', idx: c.idx, price: c.price },
				],
			});
			continue;
		}
		const trend = validatePriorTrend(candles, a.idx, breakoutIdx - a.idx, 'up_or_sideways');
		if (!trend.ok) {
			pcand({
				type: 'double_top',
				accepted: false,
				reason: `prior_trend_mismatch:${trend.classification}`,
				idxs: [a.idx, b.idx, c.idx],
				pts: [
					{ role: 'peak1', idx: a.idx, price: a.price },
					{ role: 'valley', idx: b.idx, price: b.price },
					{ role: 'peak2', idx: c.idx, price: c.price },
				],
			});
			continue;
		}
		if (trend.classification === 'insufficient_data') {
			pcand({
				type: 'double_top',
				accepted: true,
				reason: 'prior_trend_insufficient_data',
				idxs: [a.idx, b.idx, c.idx],
			});
		}

		const gate = applyStructuralGate(candles, pivots, 'top', a, b, c, necklinePrice, 'double_top', pcand);
		if (!gate) continue;

		const post = checkPostPivotInvalidation({
			candles,
			pivots,
			a,
			b,
			c,
			untilIdx: breakoutIdx - 1,
			side: 'top',
		});
		if (post.verdict === 'reclassify') {
			pcand({
				type: 'double_top',
				accepted: false,
				reason: 'reclassified_as_triple_top',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}
		if (rejectByLevelDiff('top', 'double_top', a, b, c, Math.min(tolRelax, DOUBLE_LEVEL_MAX_PCT), pcand)) continue;

		const start = candles[a.idx].isoTime,
			end = candles[breakoutIdx].isoTime;
		if (!start || !end) continue;

		const neckline = [
			{ x: a.idx, y: necklinePrice },
			{ x: breakoutIdx, y: necklinePrice },
		];
		const per = periodScoreDays(start, end);
		const dtRelAvgPeak = (a.price + c.price) / 2;
		const dtRelBp = Number(candles[breakoutIdx]?.close ?? NaN);
		const { components: scoreComponents, base } = buildDoubleScore({
			outer1: a.price,
			outer2: c.price,
			necklinePrice,
			breakoutClose: dtRelBp,
			patternHeight: dtRelAvgPeak - necklinePrice,
			side: 'top',
			retracementRatio: gate.retracementRatio,
			durationScore: per,
		});
		const confidence = finalizeConf(base * RELAXED_CONFIDENCE_PENALTY, 'double_top');
		const diagram = generatePatternDiagram(
			'double_top',
			[
				{ ...a, date: candles[a.idx]?.isoTime },
				{ ...b, date: candles[b.idx]?.isoTime },
				{ ...c, date: candles[c.idx]?.isoTime },
			],
			{ price: necklinePrice },
			{ start, end },
			{ tz },
		);
		const dtRelTarget = Math.round(necklinePrice - (dtRelAvgPeak - necklinePrice));
		const dtRelReach = Number.isFinite(dtRelBp)
			? computeTargetReach(candles, breakoutIdx, dtRelBp, dtRelTarget, 'down')
			: undefined;
		const structureRange =
			candles[a.idx]?.isoTime && candles[c.idx]?.isoTime
				? { start: candles[a.idx].isoTime as string, end: candles[c.idx].isoTime as string }
				: undefined;
		const confirmation = buildNecklineConfirmation(candles, breakoutIdx);
		const precedingTrend = buildPrecedingTrend(candles, trend, a.idx);

		const structureGate = buildStructureGate(gate);

		return {
			type: 'double_top',
			confidence,
			scoreComponents,
			...(structureGate ? { structureGate } : {}),
			range: { start, end },
			...(structureRange ? { structureRange } : {}),
			...(confirmation ? { confirmation } : {}),
			...(precedingTrend ? { precedingTrend } : {}),
			...(post.verdict === 'invalid' ? { status: 'invalid', invalidReason: post.reason } : {}),
			pivots: [a, b, c],
			neckline,
			trendlineLabel: 'ネックライン',
			breakout: { idx: breakoutIdx, price: dtRelBp },
			breakoutBarIndex: breakoutIdx,
			breakoutTarget: dtRelTarget,
			targetMethod: 'neckline_projection' as const,
			...(dtRelReach
				? {
						targetReachedPct: dtRelReach.targetReachedPct,
						targetReached: dtRelReach.targetReached,
						...(dtRelReach.targetReachedDate ? { targetReachedDate: dtRelReach.targetReachedDate } : {}),
						targetReachedPrice: dtRelReach.targetReachedPrice,
					}
				: {}),
			structureDiagram: diagram,
			_fallback: `relaxed_double_x${factor}`,
		};
	}
	return null;
}

// ── Helper: relaxed fallback ダブルボトム検索 ──

function findRelaxedDoubleBottom(
	pivots: Pivot[],
	candles: CandleData[],
	tolerancePct: number,
	factor: number,
	minDist: number,
	pcand: Pcand,
	sizeThresholds: SizeThresholds,
	tz: string | undefined,
): PatternEntry | null {
	const tolRelax = tolerancePct * factor;
	const nearRelaxed = (x: number, y: number) => Math.abs(x - y) <= Math.max(x, y) * tolRelax;

	for (let i = 0; i + 2 < pivots.length; i++) {
		const a = pivots[i],
			b = pivots[i + 1],
			c = pivots[i + 2];
		if (!(a.kind === 'L' && b.kind === 'H' && c.kind === 'L')) continue;
		if (b.idx - a.idx < minDist || c.idx - b.idx < minDist) continue;

		const sizeReason = validateBottomSize(a, b, c, sizeThresholds);
		if (sizeReason) {
			const reason = sizeReason === 'peak_too_shallow' ? 'peak_too_shallow_relaxed' : sizeReason;
			pcand({ type: 'double_bottom', accepted: false, reason, idxs: [a.idx, b.idx, c.idx] });
			continue;
		}
		if (!nearRelaxed(a.price, c.price)) {
			pcand({
				type: 'double_bottom',
				accepted: false,
				reason: 'valleys_not_equal_relaxed',
				idxs: [a.idx, b.idx, c.idx],
				pts: [
					{ role: 'valley1', idx: a.idx, price: a.price },
					{ role: 'valley2', idx: c.idx, price: c.price },
				],
			});
			continue;
		}
		if (!isSameLevel(a.price, c.price, DOUBLE_LEVEL_MAX_PCT)) {
			pcand({
				type: 'double_bottom',
				accepted: false,
				reason: 'valleys_not_equal_structural',
				idxs: [a.idx, b.idx, c.idx],
				pts: [
					{ role: 'valley1', idx: a.idx, price: a.price },
					{ role: 'valley2', idx: c.idx, price: c.price },
				],
			});
			continue;
		}

		const necklinePrice = b.price;
		const breakoutIdx = findBreakoutIdx(candles, c.idx, necklinePrice, 'above');
		if (breakoutIdx < 0) {
			pcand({
				type: 'double_bottom',
				accepted: false,
				reason: 'no_breakout_relaxed',
				idxs: [a.idx, b.idx, c.idx],
				pts: [
					{ role: 'valley1', idx: a.idx, price: a.price },
					{ role: 'peak', idx: b.idx, price: b.price },
					{ role: 'valley2', idx: c.idx, price: c.price },
				],
			});
			continue;
		}
		const trend = validatePriorTrend(candles, a.idx, breakoutIdx - a.idx, 'down_or_sideways');
		if (!trend.ok) {
			pcand({
				type: 'double_bottom',
				accepted: false,
				reason: `prior_trend_mismatch:${trend.classification}`,
				idxs: [a.idx, b.idx, c.idx],
				pts: [
					{ role: 'valley1', idx: a.idx, price: a.price },
					{ role: 'peak', idx: b.idx, price: b.price },
					{ role: 'valley2', idx: c.idx, price: c.price },
				],
			});
			continue;
		}
		if (trend.classification === 'insufficient_data') {
			pcand({
				type: 'double_bottom',
				accepted: true,
				reason: 'prior_trend_insufficient_data',
				idxs: [a.idx, b.idx, c.idx],
			});
		}

		const gate = applyStructuralGate(candles, pivots, 'bottom', a, b, c, necklinePrice, 'double_bottom', pcand);
		if (!gate) continue;

		const post = checkPostPivotInvalidation({
			candles,
			pivots,
			a,
			b,
			c,
			untilIdx: breakoutIdx - 1,
			side: 'bottom',
		});
		if (post.verdict === 'reclassify') {
			pcand({
				type: 'double_bottom',
				accepted: false,
				reason: 'reclassified_as_triple_bottom',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}
		if (rejectByLevelDiff('bottom', 'double_bottom', a, b, c, Math.min(tolRelax, DOUBLE_LEVEL_MAX_PCT), pcand))
			continue;

		const start = candles[a.idx].isoTime,
			end = candles[breakoutIdx].isoTime;
		if (!start || !end) continue;

		const neckline = [
			{ x: a.idx, y: necklinePrice },
			{ x: breakoutIdx, y: necklinePrice },
		];
		const per = periodScoreDays(start, end);
		const dbRelAvgValley = (a.price + c.price) / 2;
		const dbRelBp = Number(candles[breakoutIdx]?.close ?? NaN);
		const { components: scoreComponents, base } = buildDoubleScore({
			outer1: a.price,
			outer2: c.price,
			necklinePrice,
			breakoutClose: dbRelBp,
			patternHeight: necklinePrice - dbRelAvgValley,
			side: 'bottom',
			retracementRatio: gate.retracementRatio,
			durationScore: per,
		});
		const confidence = finalizeConf(base * RELAXED_CONFIDENCE_PENALTY, 'double_bottom');
		const diagram = generatePatternDiagram(
			'double_bottom',
			[
				{ ...a, date: candles[a.idx]?.isoTime },
				{ ...b, date: candles[b.idx]?.isoTime },
				{ ...c, date: candles[c.idx]?.isoTime },
			],
			{ price: necklinePrice },
			{ start, end },
			{ tz },
		);
		const dbRelTarget = Math.round(necklinePrice + (necklinePrice - dbRelAvgValley));
		const dbRelReach = Number.isFinite(dbRelBp)
			? computeTargetReach(candles, breakoutIdx, dbRelBp, dbRelTarget, 'up')
			: undefined;
		const structureRange =
			candles[a.idx]?.isoTime && candles[c.idx]?.isoTime
				? { start: candles[a.idx].isoTime as string, end: candles[c.idx].isoTime as string }
				: undefined;
		const confirmation = buildNecklineConfirmation(candles, breakoutIdx);
		const precedingTrend = buildPrecedingTrend(candles, trend, a.idx);

		const structureGate = buildStructureGate(gate);

		return {
			type: 'double_bottom',
			confidence,
			scoreComponents,
			...(structureGate ? { structureGate } : {}),
			range: { start, end },
			...(structureRange ? { structureRange } : {}),
			...(confirmation ? { confirmation } : {}),
			...(precedingTrend ? { precedingTrend } : {}),
			...(post.verdict === 'invalid' ? { status: 'invalid', invalidReason: post.reason } : {}),
			pivots: [a, b, c],
			neckline,
			trendlineLabel: 'ネックライン',
			breakout: { idx: breakoutIdx, price: dbRelBp },
			breakoutBarIndex: breakoutIdx,
			breakoutTarget: dbRelTarget,
			targetMethod: 'neckline_projection' as const,
			...(dbRelReach
				? {
						targetReachedPct: dbRelReach.targetReachedPct,
						targetReached: dbRelReach.targetReached,
						...(dbRelReach.targetReachedDate ? { targetReachedDate: dbRelReach.targetReachedDate } : {}),
						targetReachedPrice: dbRelReach.targetReachedPrice,
					}
				: {}),
			structureDiagram: diagram,
			_fallback: `relaxed_double_x${factor}`,
		};
	}
	return null;
}

// ── Helper: 形成中ダブルトップ検索 ──

/**
 * 形成中ダブルトップを組み立てる。組めなければ null。
 *
 * ## debug candidate の積み方（issue #158）
 *
 * 成功時に `accepted: true` / `status: 'forming'` を積む。**`accepted: true` は「検出器が
 * 組み立てた」であって「最終出力に残った」ではない**——後段 `detect_patterns.ts` の
 * `globalDedup` に畳まれて `data.patterns` に出ないことがある。strict / relaxed パスも
 * `patterns.push` の直後＝dedup 前に積んでおり、既存の約束と揃えてある（#155 と同じ）。
 *
 * 棄却の理由コードは**全分岐に積む**。{@link tryFormingDoubleBottom} や
 * `detect_triples.ts` の形成中 2 経路と違い**この関数にはループが無く**、
 * `lastConfirmedPeak` を 1 点だけ取って直線的にガードを並べるので、1 回の呼び出しで
 * 各分岐はたかだか 1 回しか発火しない。#155 が「構成点が揃う前の分岐には積まない」と
 * したのは頭候補ごとにループする `formingHsForHead` の cap=200 対策で、ここには当て
 * はまらない。積まないと**この経路は完全に無音**になり、なぜ形成中ダブルトップが
 * 出ないのかが debug から追えない。
 *
 * 例外は関数先頭の want / ピボット総数ガードで、これは「この種別が要求されていない」
 * 「窓にピボットが 1 つも無い」であって候補の棄却ではないため積まない。
 */
function tryFormingDoubleTop(ctx: DetectContext): PatternEntry | null {
	const { candles, allPeaks, allValleys, want } = ctx;
	if (!(want.size === 0 || want.has('double_top')) || allPeaks.length < 1 || allValleys.length < 1) return null;

	const lastIdx = candles.length - 1;
	const currentPrice = Number(candles[lastIdx]?.close ?? NaN);
	const isoAt = (i: number) => candles[i]?.isoTime || '';

	const lastConfirmedPeak = [...allPeaks].reverse().find((p) => p.idx < lastIdx - 2);
	if (!lastConfirmedPeak) {
		pushCand(ctx, { type: 'double_top', accepted: false, reason: 'forming_no_confirmed_peak' });
		return null;
	}
	const valleyAfterPeak = allValleys.find((v) => v.idx > lastConfirmedPeak.idx && v.idx < lastIdx - 1);
	if (!valleyAfterPeak || valleyAfterPeak.idx <= lastConfirmedPeak.idx) {
		pushCand(ctx, {
			type: 'double_top',
			accepted: false,
			reason: 'forming_no_valley_after_peak',
			idxs: [lastConfirmedPeak.idx],
			pts: [{ role: 'peak1', idx: lastConfirmedPeak.idx, price: lastConfirmedPeak.price }],
		});
		return null;
	}

	const leftPeak = lastConfirmedPeak;
	const valley = valleyAfterPeak;
	// 構成点 3 点（山1 / 谷 / 暫定の山2＝最新足）が確定したのでここから先は共通の形で積む。
	// 最新足は確定ピボットではないので role を `forming_peak` で区別する（既存の棄却
	// エントリと同じ role 名。同じ経路の ✅ と ❌ が並んで読めるようにするため）。
	const formingPts = [
		{ role: 'peak1', idx: leftPeak.idx, price: leftPeak.price },
		{ role: 'valley', idx: valley.idx, price: valley.price },
		{ role: 'forming_peak', idx: lastIdx, price: currentPrice },
	];
	const formingIdxs = [leftPeak.idx, valley.idx, lastIdx];
	const rejectForming = (reason: string) => {
		pushCand(ctx, { type: 'double_top', accepted: false, reason, idxs: formingIdxs, pts: formingPts });
	};

	const leftPct = currentPrice / Math.max(1, leftPeak.price);
	if (leftPct < 1 - FORMING_PEAK_TOLERANCE_PCT || leftPct > 1 + FORMING_PEAK_TOLERANCE_PCT) {
		rejectForming('forming_peak_level_out_of_tolerance');
		return null;
	}
	if (!isSameLevel(currentPrice, leftPeak.price, DOUBLE_LEVEL_MAX_PCT)) {
		rejectForming('forming_peaks_not_level');
		return null;
	}
	if (currentPrice <= valley.price) {
		rejectForming('forming_current_at_or_below_valley');
		return null;
	}

	const ratio = (currentPrice - valley.price) / Math.max(EPSILON, leftPeak.price - valley.price);
	const progress = Math.max(0, Math.min(1, ratio));
	const completion = Math.min(1, FORMING_BASE_COMPLETION + progress * FORMING_COMPLETION_RANGE);
	if (completion < MIN_FORMING_COMPLETION) {
		rejectForming('forming_completion_below_min');
		return null;
	}

	const formationBars = Math.max(0, lastIdx - leftPeak.idx);
	const formingBars = getDoubleFormingBarParams(ctx.type);
	if (formationBars < formingBars.minBars || formationBars > formingBars.maxBars) {
		rejectForming('forming_bars_out_of_range');
		return null;
	}

	const trend = validatePriorTrend(candles, leftPeak.idx, lastIdx - leftPeak.idx, 'up_or_sideways');
	if (!trend.ok) {
		ctx.debugCandidates.push({
			type: 'double_top',
			accepted: false,
			reason: `prior_trend_mismatch:${trend.classification}`,
			indices: [leftPeak.idx, valley.idx, lastIdx],
			points: [
				{ role: 'peak1', idx: leftPeak.idx, price: leftPeak.price, isoTime: candles[leftPeak.idx]?.isoTime },
				{ role: 'valley', idx: valley.idx, price: valley.price, isoTime: candles[valley.idx]?.isoTime },
				{ role: 'forming_peak', idx: lastIdx, price: currentPrice, isoTime: candles[lastIdx]?.isoTime },
			],
		});
		return null;
	}
	if (trend.classification === 'insufficient_data') {
		ctx.debugCandidates.push({
			type: 'double_top',
			accepted: true,
			reason: 'prior_trend_insufficient_data',
			indices: [leftPeak.idx, valley.idx, lastIdx],
		});
	}

	// サイズ検査（issue #169）。**完成済み double top と同じ `validateTopSize` を同じ 3 点構造で
	// 掛ける。** 3 点目（暫定の山2）は確定ピボットではないので `{ extremePrice: 最新足の終値 }` を
	// 渡す——triple / H&S の形成中パスが `validatePatternSize` へ暫定構成点を渡すのと同じ idiom
	// （`detect_triples.ts` / `detect_hs.ts`、および `validatePatternSize` の docstring）。
	//
	// **高さ（`(leftPeak − valley) / leftPeak`）は 3 点目を見ない**ので、暫定点のノイズは高さ判定に
	// 入らない。深さの分母 `peakAvg` には暫定点が入るが、これは形成中 triple / H&S と同じ扱い。
	//
	// **配置が最後なのは `validatePatternSize` の docstring の規約**（「既存の棄却検査をすべて
	// 通過した後」）に従ったもの。前に置くと固有の理由コードを持つ候補の `reason` を横取りして
	// `view=debug` の診断が変わる。最後に置けば「これまで accepted だった候補だけを落とす」ことが
	// 位置から保証される。
	const sizeReason = validateTopSize(leftPeak, valley, { extremePrice: currentPrice }, ctx.sizeThresholds);
	if (sizeReason) {
		rejectForming(formingSizeReason(sizeReason));
		return null;
	}

	// 形成中でも構造ゲートは完成済みと同じものを掛ける。ゲートを通らない形は、
	// 形成が進んでも有効なパターンにはならない（issue #126 G1 / G2）。
	// 暫定右肩（最新足）は確定ピボットではないので、第2構成点には left/valley だけで
	// 判定できる部分——先行値幅と戻り率——のみを適用する。
	const gate = validateReversalStructure({
		candles,
		pivots: ctx.pivots,
		first: leftPeak,
		mid: valley,
		// 形成中ダブルトップのネックラインは valley.price（下の neckline 配列と同じ値）
		necklinePrice: valley.price,
		side: 'top',
	});
	if (!gate.ok) {
		ctx.debugCandidates.push({
			type: 'double_top',
			accepted: false,
			reason: gate.reason,
			indices: [leftPeak.idx, valley.idx, lastIdx],
			points: [
				{ role: 'peak1', idx: leftPeak.idx, price: leftPeak.price, isoTime: candles[leftPeak.idx]?.isoTime },
				{ role: 'valley', idx: valley.idx, price: valley.price, isoTime: candles[valley.idx]?.isoTime },
			],
		});
		return null;
	}

	const neckline = [
		{ x: leftPeak.idx, y: valley.price },
		{ x: lastIdx, y: valley.price },
	];
	const confBase = Math.min(1, Math.max(0, (1 - Math.abs(leftPct - 1)) * 0.6 + progress * 0.4));
	const confidence = Math.round(confBase * 100) / 100;
	const start = isoAt(leftPeak.idx);
	const end = isoAt(lastIdx);
	const formDtTarget = Math.round(valley.price - (leftPeak.price - valley.price));
	const structureRange = start && end ? { start, end } : undefined;
	const precedingTrend = buildPrecedingTrend(candles, trend, leftPeak.idx);

	const structureGate = buildStructureGate(gate);

	// 成功エントリ（issue #158）。構成点・並びは上の棄却エントリと同じにして、
	// 同じ経路の ✅ と ❌ が並んで読めるようにする。
	pushCand(ctx, {
		type: 'double_top',
		accepted: true,
		status: 'forming',
		idxs: formingIdxs,
		pts: formingPts,
	});

	return {
		type: 'double_top',
		confidence,
		scoreComponents: {
			symmetry: Number(clamp01(1 - relDev(leftPeak.price, currentPrice)).toFixed(4)),
			...(retracementScore(gate.retracementRatio) !== undefined
				? { retracement: Number((retracementScore(gate.retracementRatio) as number).toFixed(4)) }
				: {}),
		},
		...(structureGate ? { structureGate } : {}),
		range: { start, end },
		...(structureRange ? { structureRange } : {}),
		confirmation: { type: 'not_confirmed' },
		...(precedingTrend ? { precedingTrend } : {}),
		status: 'forming',
		pivots: [
			{ idx: leftPeak.idx, price: leftPeak.price, kind: 'H' as const, extremePrice: leftPeak.extremePrice },
			{ idx: valley.idx, price: valley.price, kind: 'L' as const, extremePrice: valley.extremePrice },
		],
		neckline,
		trendlineLabel: 'ネックライン',
		breakoutTarget: formDtTarget,
		targetMethod: 'neckline_projection' as const,
		completionPct: Math.round(completion * 100),
		_method: 'forming_double_top',
	};
}

// ── Helper: 形成中ダブルボトム検索 ──

/**
 * 形成中ダブルボトムを組み立てる。組めなければ null。
 *
 * ## debug candidate の積み方（issue #158）
 *
 * 成功エントリの意味（`accepted: true` は dedup 前＝「検出器が組み立てた」）は
 * {@link tryFormingDoubleTop} の docstring が単一ソース。
 *
 * 棄却の理由コードは**構成点 3 点（谷1 / 山 / 谷2）が揃った後の分岐にだけ**積む。
 * この関数は谷ペアを回すループなので、揃う前の `continue`（`minDist` 不足 / 間に山が
 * 無い）はペア数ぶん発火し、`detect_patterns.ts` の cap=200 を食い潰して**他の検出器の
 * 棄却理由を押し出す**。#155 が `formingHsForHead` で置いた制約と同じ。
 */
function tryFormingDoubleBottom(ctx: DetectContext): PatternEntry | null {
	const { candles, allPeaks, allValleys, tolerancePct, want, minDist } = ctx;
	if (!(want.size === 0 || want.has('double_bottom')) || allValleys.length < 2) return null;

	const lastIdx = candles.length - 1;
	const currentPrice = Number(candles[lastIdx]?.close ?? NaN);
	const isoAt = (i: number) => candles[i]?.isoTime || '';
	const formingBars = getDoubleFormingBarParams(ctx.type);

	const confirmedValleys = allValleys.filter((v) => v.idx < lastIdx - 2);
	if (confirmedValleys.length < 2) return null;

	for (let j = confirmedValleys.length - 1; j >= 1; j--) {
		const rightValley = confirmedValleys[j];
		const leftValley = confirmedValleys[j - 1];
		if (rightValley.idx - leftValley.idx < minDist) continue;

		const peaksBetween = allPeaks.filter((p) => p.idx > leftValley.idx && p.idx < rightValley.idx);
		if (!peaksBetween.length) continue;
		const midPeak = peaksBetween.reduce((best, p) => (p.price > best.price ? p : best), peaksBetween[0]);

		// 構成点 3 点が揃った。以降の棄却はこの並びで積む（既存の棄却エントリと同じ
		// role 名 / indices の並びにして、同じ経路の ✅ と ❌ が並んで読めるようにする）。
		// 最新足は確定ピボットではないので role を `current` で区別する。
		const formingIdxs = [leftValley.idx, midPeak.idx, rightValley.idx, lastIdx];
		const formingPts = [
			{ role: 'valley1', idx: leftValley.idx, price: leftValley.price },
			{ role: 'peak', idx: midPeak.idx, price: midPeak.price },
			{ role: 'valley2', idx: rightValley.idx, price: rightValley.price },
			{ role: 'current', idx: lastIdx, price: currentPrice },
		];
		const rejectForming = (reason: string) => {
			pushCand(ctx, { type: 'double_bottom', accepted: false, reason, idxs: formingIdxs, pts: formingPts });
		};

		// 値幅の評価なので基準は `extremePrice`（{@link validateBottomSize} と同じ理由）。
		// 完成済みパスと同じ `sizeThresholds.heightPct` を使う以上ここだけ終値基準にすると、
		// 「形成中は通るのに完成した瞬間にサイズ検査で落ちる」候補ができる。
		//
		// **サイズ検査のうち高さだけがここにある。** 深さ（`depthPct`）は既存の棄却検査を
		// すべて通過した後（構造ゲートの直前）で `validateBottomSize` として掛ける（issue #169）。
		// 位置が分かれているのは配置規約の都合で、この両脚チェックの理由コード
		// `forming_pattern_height_below_min` は #166 のテストが名前を固定しているため改名しない。
		const leftDepth = (midPeak.extremePrice - leftValley.extremePrice) / Math.max(EPSILON, midPeak.extremePrice);
		const rightDepth = (midPeak.extremePrice - rightValley.extremePrice) / Math.max(EPSILON, midPeak.extremePrice);
		if (!(leftDepth >= ctx.sizeThresholds.heightPct && rightDepth >= ctx.sizeThresholds.heightPct)) {
			rejectForming('forming_pattern_height_below_min');
			continue;
		}

		const valleyDiff =
			Math.abs(leftValley.price - rightValley.price) / Math.max(1, Math.max(leftValley.price, rightValley.price));
		if (valleyDiff > Math.min(tolerancePct * FORMING_TOLERANCE_MULTIPLIER, DOUBLE_LEVEL_MAX_PCT)) {
			rejectForming('forming_valleys_not_level');
			continue;
		}
		if (currentPrice < rightValley.price * (1 - FORMING_VALLEY_INVALID_PCT)) {
			rejectForming('forming_current_below_valley_zone');
			continue;
		}

		const upRatio = (currentPrice - rightValley.price) / Math.max(EPSILON, midPeak.price - rightValley.price);
		const progress = Math.max(0, Math.min(1, upRatio));
		const completion = Math.min(1, 0.66 + 0.34 * progress);
		if (completion < 0.4) {
			rejectForming('forming_completion_below_min');
			continue;
		}

		const formationBars = Math.max(0, lastIdx - leftValley.idx);
		if (formationBars < formingBars.minBars || formationBars > formingBars.maxBars) {
			rejectForming('forming_bars_out_of_range');
			continue;
		}

		const trend = validatePriorTrend(candles, leftValley.idx, lastIdx - leftValley.idx, 'down_or_sideways');
		if (!trend.ok) {
			ctx.debugCandidates.push({
				type: 'double_bottom',
				accepted: false,
				reason: `prior_trend_mismatch:${trend.classification}`,
				indices: [leftValley.idx, midPeak.idx, rightValley.idx, lastIdx],
				points: [
					{ role: 'valley1', idx: leftValley.idx, price: leftValley.price, isoTime: candles[leftValley.idx]?.isoTime },
					{ role: 'peak', idx: midPeak.idx, price: midPeak.price, isoTime: candles[midPeak.idx]?.isoTime },
					{
						role: 'valley2',
						idx: rightValley.idx,
						price: rightValley.price,
						isoTime: candles[rightValley.idx]?.isoTime,
					},
				],
			});
			continue;
		}
		if (trend.classification === 'insufficient_data') {
			ctx.debugCandidates.push({
				type: 'double_bottom',
				accepted: true,
				reason: 'prior_trend_insufficient_data',
				indices: [leftValley.idx, midPeak.idx, rightValley.idx, lastIdx],
			});
		}

		// 深さ検査（issue #169）。**完成済み double bottom と同じ `validateBottomSize` を、
		// 同じ 3 点（すべて確定ピボット）に掛ける。** 形成中ダブルボトムの構成点は
		// `leftValley` / `midPeak` / `rightValley` の 3 点だけで完成した L-H-L になっており、
		// `currentPrice` は有効性判定（`forming_current_below_valley_zone`）と完成度にしか
		// 使われない**構成点ではない**ので、完成済みと同一の点に同一の検査が掛かる。
		//
		// **上の `forming_pattern_height_below_min`（両脚チェック）は残す。** `validateBottomSize`
		// の高さは `|leftValley − midPeak| / max(...)` ＝ **左脚しか見ない**ので、置き換えると
		// 右脚の要求が消える。両脚チェックを残したうえで深さを足すと、`validateBottomSize` の
		// 高さ（左脚 ≥ heightPct）は両脚チェックに包含されるため、ここで実際に発火しうるのは
		// `peak_too_shallow` だけになる。結果として **形成中 ⊇ 完成済みの厳しさ**が成立し、
		// 「形成中は通るのに完成した瞬間にサイズ検査で落ちる」候補が閉じる。
		//
		// 配置が最後なのは `validatePatternSize` の docstring の規約（「既存の棄却検査をすべて
		// 通過した後」）に従ったもの。理由は {@link tryFormingDoubleTop} の同じ検査のコメント参照。
		const sizeReason = validateBottomSize(leftValley, midPeak, rightValley, ctx.sizeThresholds);
		if (sizeReason) {
			rejectForming(formingSizeReason(sizeReason));
			continue;
		}

		const gate = validateReversalStructure({
			candles,
			pivots: ctx.pivots,
			first: leftValley,
			mid: midPeak,
			// 形成中ダブルボトムのネックラインは midPeak.price（下の neckline 配列と同じ値）
			necklinePrice: midPeak.price,
			side: 'bottom',
		});
		if (!gate.ok) {
			ctx.debugCandidates.push({
				type: 'double_bottom',
				accepted: false,
				reason: gate.reason,
				indices: [leftValley.idx, midPeak.idx, rightValley.idx, lastIdx],
				points: [
					...(gate.priorExtreme
						? [
								{
									role: 'prior_extreme',
									idx: gate.priorExtreme.idx,
									price: gate.priorExtreme.extremePrice,
									isoTime: candles[gate.priorExtreme.idx]?.isoTime,
								},
							]
						: []),
					{ role: 'valley1', idx: leftValley.idx, price: leftValley.price, isoTime: candles[leftValley.idx]?.isoTime },
					{ role: 'peak', idx: midPeak.idx, price: midPeak.price, isoTime: candles[midPeak.idx]?.isoTime },
					{
						role: 'valley2',
						idx: rightValley.idx,
						price: rightValley.price,
						isoTime: candles[rightValley.idx]?.isoTime,
					},
				],
			});
			continue;
		}

		// 谷2 確定後の再下落（issue #126 G5）。ネックライン突破前に谷ゾーンへ戻っていたら
		// ダブルとしては無効。同水準の第3の谷があれば triple 側に委ねる。
		const post = checkPostPivotInvalidation({
			candles,
			pivots: ctx.pivots,
			a: leftValley,
			b: midPeak,
			c: rightValley,
			untilIdx: lastIdx,
			side: 'bottom',
		});
		if (post.verdict === 'reclassify') {
			ctx.debugCandidates.push({
				type: 'double_bottom',
				accepted: false,
				reason: 'reclassified_as_triple_bottom',
				indices: [leftValley.idx, midPeak.idx, rightValley.idx, lastIdx],
			});
			continue;
		}

		// 期限切れ（issue #126 G4）。谷2 確定から突破探索窓を過ぎた候補は、以後
		// `completed` になりようがない——`forming` を名乗らせない。
		const barsSinceRightValley = lastIdx - rightValley.idx;
		const terminal: { status: string; invalidReason: string } | null =
			post.verdict === 'invalid'
				? { status: 'invalid', invalidReason: post.reason }
				: barsSinceRightValley > FORMING_EXPIRY_BARS
					? { status: 'expired', invalidReason: 'forming_expired' }
					: null;

		const neckline = [
			{ x: midPeak.idx, y: midPeak.price },
			{ x: lastIdx, y: midPeak.price },
		];
		const confidence = Number(Math.min(1, 0.5 + 0.5 * progress).toFixed(2));
		const start = isoAt(leftValley.idx);
		const end = isoAt(lastIdx);
		const formDbAvgValley = (leftValley.price + rightValley.price) / 2;
		const formDbTarget = Math.round(midPeak.price + (midPeak.price - formDbAvgValley));
		// 形成中ダブルボトムは確定済みの leftValley〜rightValley が構成点。
		// 現在足は構成点に含めない（range は lastIdx までを含むが、structureRange は構成点に閉じる）
		const structStart = isoAt(leftValley.idx);
		const structEnd = isoAt(rightValley.idx);
		const structureRange = structStart && structEnd ? { start: structStart, end: structEnd } : undefined;
		const precedingTrend = buildPrecedingTrend(candles, trend, leftValley.idx);

		const structureGate = buildStructureGate(gate);

		// 成功エントリ（issue #158）。`status` は組み立て時点の値なので、`terminal` が付いた
		// （= invalid / expired）ケースはその値を出す。'forming' 決め打ちにすると
		// 「まだ形成中」と誤読させる。
		pushCand(ctx, {
			type: 'double_bottom',
			accepted: true,
			status: terminal ? terminal.status : 'forming',
			idxs: formingIdxs,
			pts: formingPts,
		});

		return {
			type: 'double_bottom',
			confidence,
			scoreComponents: {
				symmetry: Number(clamp01(1 - relDev(leftValley.price, rightValley.price)).toFixed(4)),
				...(retracementScore(gate.retracementRatio) !== undefined
					? { retracement: Number((retracementScore(gate.retracementRatio) as number).toFixed(4)) }
					: {}),
			},
			...(structureGate ? { structureGate } : {}),
			range: { start, end },
			...(structureRange ? { structureRange } : {}),
			confirmation: { type: 'not_confirmed' },
			...(precedingTrend ? { precedingTrend } : {}),
			status: terminal ? terminal.status : 'forming',
			...(terminal ? { invalidReason: terminal.invalidReason } : {}),
			pivots: [
				{ idx: leftValley.idx, price: leftValley.price, kind: 'L' as const, extremePrice: leftValley.extremePrice },
				{ idx: midPeak.idx, price: midPeak.price, kind: 'H' as const, extremePrice: midPeak.extremePrice },
				{ idx: rightValley.idx, price: rightValley.price, kind: 'L' as const, extremePrice: rightValley.extremePrice },
			],
			neckline,
			trendlineLabel: 'ネックライン',
			breakoutTarget: formDbTarget,
			targetMethod: 'neckline_projection' as const,
			completionPct: Math.round(completion * 100),
			_method: 'forming_double_bottom',
		};
	}
	return null;
}

// ── Main ──

export function detectDoubles(ctx: DetectContext): DetectResult {
	const { candles, pivots, tolerancePct, want, includeForming, near, minDist } = ctx;
	const pcand: Pcand = (arg) => pushCand(ctx, arg);
	// strict 経路の同水準判定の実効値。`near`（tolerancePct）と `isSameLevel`
	// （DOUBLE_LEVEL_MAX_PCT）が同じ量を見るので min が実効閾値になる
	// （`rejectByLevelDiff` の docstring）。`details.levelTolerancePct` に載せるだけで、
	// 判定そのものには使わない。
	const levelTolerancePct = Math.min(tolerancePct, DOUBLE_LEVEL_MAX_PCT);
	const push = (arr: PatternEntry[], item: PatternEntry) => {
		arr.push(item);
	};
	let patterns: PatternEntry[] = [];

	let foundDoubleTop = false,
		foundDoubleBottom = false;
	if (want.size === 0 || want.has('double_top') || want.has('double_bottom')) {
		for (let i = 0; i + 2 < pivots.length; i++) {
			const a = pivots[i];
			const b = pivots[i + 1];
			const c = pivots[i + 2];
			if (b.idx - a.idx < minDist || c.idx - b.idx < minDist) continue;

			// ── double top: H-L-H ──
			if (a.kind === 'H' && b.kind === 'L' && c.kind === 'H') {
				const sizeReason = validateTopSize(a, b, c, ctx.sizeThresholds);
				if (sizeReason) {
					pcand({ type: 'double_top', accepted: false, reason: sizeReason, idxs: [a.idx, b.idx, c.idx] });
					continue;
				}
				if (!near(a.price, c.price)) {
					const diffPct = Math.abs(a.price - c.price) / Math.max(1, Math.max(a.price, c.price));
					if (diffPct > tolerancePct) {
						pcand({
							type: 'double_top',
							accepted: false,
							reason: 'peaks_not_equal',
							idxs: [a.idx, b.idx, c.idx],
							pts: [
								{ role: 'peak1', idx: a.idx, price: a.price },
								{ role: 'peak2', idx: c.idx, price: c.price },
							],
						});
					}
					continue;
				}
				if (!isSameLevel(a.price, c.price, DOUBLE_LEVEL_MAX_PCT)) {
					pcand({
						type: 'double_top',
						accepted: false,
						reason: 'peaks_not_equal_structural',
						idxs: [a.idx, b.idx, c.idx],
						pts: [
							{ role: 'peak1', idx: a.idx, price: a.price },
							{ role: 'peak2', idx: c.idx, price: c.price },
						],
					});
					continue;
				}
				// ネックライン下抜け（終値ベース1.5%バッファ）必須
				const necklinePrice = b.price;
				const breakoutIdx = findBreakoutIdx(candles, c.idx, necklinePrice, 'below');
				if (breakoutIdx < 0) {
					pcand({
						type: 'double_top',
						accepted: false,
						reason: 'no_breakout',
						idxs: [a.idx, b.idx, c.idx],
						pts: [
							{ role: 'peak1', idx: a.idx, price: a.price },
							{ role: 'valley', idx: b.idx, price: b.price },
							{ role: 'peak2', idx: c.idx, price: c.price },
						],
					});
					continue;
				}
				const trend = validatePriorTrend(candles, a.idx, breakoutIdx - a.idx, 'up_or_sideways');
				if (!trend.ok) {
					pcand({
						type: 'double_top',
						accepted: false,
						reason: `prior_trend_mismatch:${trend.classification}`,
						idxs: [a.idx, b.idx, c.idx],
						pts: [
							{ role: 'peak1', idx: a.idx, price: a.price },
							{ role: 'valley', idx: b.idx, price: b.price },
							{ role: 'peak2', idx: c.idx, price: c.price },
						],
					});
					continue;
				}
				if (trend.classification === 'insufficient_data') {
					pcand({
						type: 'double_top',
						accepted: true,
						reason: 'prior_trend_insufficient_data',
						idxs: [a.idx, b.idx, c.idx],
					});
				}
				const gate = applyStructuralGate(candles, pivots, 'top', a, b, c, necklinePrice, 'double_top', pcand);
				if (!gate) continue;
				const post = checkPostPivotInvalidation({
					candles,
					pivots,
					a,
					b,
					c,
					untilIdx: breakoutIdx - 1,
					side: 'top',
				});
				if (post.verdict === 'reclassify') {
					pcand({
						type: 'double_top',
						accepted: false,
						reason: 'reclassified_as_triple_top',
						idxs: [a.idx, b.idx, c.idx],
					});
					continue;
				}
				if (rejectByLevelDiff('top', 'double_top', a, b, c, levelTolerancePct, pcand)) continue;
				const start = candles[a.idx].isoTime;
				const end = candles[breakoutIdx].isoTime;
				if (!start || !end) continue;
				const neckline = [
					{ x: a.idx, y: necklinePrice },
					{ x: breakoutIdx, y: necklinePrice },
				];
				const per = periodScoreDays(start, end);
				const dtAvgPeak = (a.price + c.price) / 2;
				const dtBp = Number(candles[breakoutIdx]?.close ?? NaN);
				const { components: dtScoreComponents, base } = buildDoubleScore({
					outer1: a.price,
					outer2: c.price,
					necklinePrice,
					breakoutClose: dtBp,
					patternHeight: dtAvgPeak - necklinePrice,
					side: 'top',
					retracementRatio: gate.retracementRatio,
					durationScore: per,
				});
				const confidence = finalizeConf(base, 'double_top');
				const diagram = generatePatternDiagram(
					'double_top',
					[
						{ ...a, date: candles[a.idx]?.isoTime },
						{ ...b, date: candles[b.idx]?.isoTime },
						{ ...c, date: candles[c.idx]?.isoTime },
					],
					{ price: necklinePrice },
					{ start, end },
					{ tz: ctx.tz },
				);
				const dtTarget = Math.round(necklinePrice - (dtAvgPeak - necklinePrice));
				const dtReach = Number.isFinite(dtBp)
					? computeTargetReach(candles, breakoutIdx, dtBp, dtTarget, 'down')
					: undefined;
				const dtStructureRange =
					candles[a.idx]?.isoTime && candles[c.idx]?.isoTime
						? { start: candles[a.idx].isoTime as string, end: candles[c.idx].isoTime as string }
						: undefined;
				const dtConfirmation = buildNecklineConfirmation(candles, breakoutIdx);
				const dtPrecedingTrend = buildPrecedingTrend(candles, trend, a.idx);
				const dtStructureGate = buildStructureGate(gate);
				push(patterns, {
					type: 'double_top',
					confidence,
					scoreComponents: dtScoreComponents,
					...(dtStructureGate ? { structureGate: dtStructureGate } : {}),
					range: { start, end },
					...(dtStructureRange ? { structureRange: dtStructureRange } : {}),
					...(dtConfirmation ? { confirmation: dtConfirmation } : {}),
					...(dtPrecedingTrend ? { precedingTrend: dtPrecedingTrend } : {}),
					...(post.verdict === 'invalid' ? { status: 'invalid', invalidReason: post.reason } : {}),
					pivots: [a, b, c],
					neckline,
					trendlineLabel: 'ネックライン',
					breakout: { idx: breakoutIdx, price: dtBp },
					breakoutBarIndex: breakoutIdx,
					breakoutTarget: dtTarget,
					targetMethod: 'neckline_projection' as const,
					...(dtReach
						? {
								targetReachedPct: dtReach.targetReachedPct,
								targetReached: dtReach.targetReached,
								...(dtReach.targetReachedDate ? { targetReachedDate: dtReach.targetReachedDate } : {}),
								targetReachedPrice: dtReach.targetReachedPrice,
							}
						: {}),
					structureDiagram: diagram,
				});
				foundDoubleTop = true;
				pcand({
					type: 'double_top',
					accepted: true,
					idxs: [a.idx, b.idx, c.idx, breakoutIdx],
					pts: [
						{ role: 'peak1', idx: a.idx, price: a.price },
						{ role: 'valley', idx: b.idx, price: b.price },
						{ role: 'peak2', idx: c.idx, price: c.price },
						{ role: 'breakout', idx: breakoutIdx, price: dtBp },
					],
				});
				continue;
			}

			// ── double bottom: L-H-L ──
			if (a.kind === 'L' && b.kind === 'H' && c.kind === 'L') {
				const sizeReason = validateBottomSize(a, b, c, ctx.sizeThresholds);
				if (sizeReason) {
					pcand({ type: 'double_bottom', accepted: false, reason: sizeReason, idxs: [a.idx, b.idx, c.idx] });
					continue;
				}
				if (!near(a.price, c.price)) {
					const diffPct = Math.abs(a.price - c.price) / Math.max(1, Math.max(a.price, c.price));
					if (diffPct > tolerancePct) {
						pcand({
							type: 'double_bottom',
							accepted: false,
							reason: 'valleys_not_equal',
							idxs: [a.idx, b.idx, c.idx],
							pts: [
								{ role: 'valley1', idx: a.idx, price: a.price },
								{ role: 'valley2', idx: c.idx, price: c.price },
							],
						});
					}
					continue;
				}
				if (!isSameLevel(a.price, c.price, DOUBLE_LEVEL_MAX_PCT)) {
					pcand({
						type: 'double_bottom',
						accepted: false,
						reason: 'valleys_not_equal_structural',
						idxs: [a.idx, b.idx, c.idx],
						pts: [
							{ role: 'valley1', idx: a.idx, price: a.price },
							{ role: 'valley2', idx: c.idx, price: c.price },
						],
					});
					continue;
				}
				// ネックライン突破（終値ベース＋1.5%バッファ）を c 以降で確認
				const necklinePrice = b.price;
				const breakoutIdx = findBreakoutIdx(candles, c.idx, necklinePrice, 'above');
				if (breakoutIdx < 0) {
					pcand({
						type: 'double_bottom',
						accepted: false,
						reason: 'no_breakout',
						idxs: [a.idx, b.idx, c.idx],
						pts: [
							{ role: 'valley1', idx: a.idx, price: a.price },
							{ role: 'peak', idx: b.idx, price: b.price },
							{ role: 'valley2', idx: c.idx, price: c.price },
						],
					});
					continue;
				}
				const trend = validatePriorTrend(candles, a.idx, breakoutIdx - a.idx, 'down_or_sideways');
				if (!trend.ok) {
					pcand({
						type: 'double_bottom',
						accepted: false,
						reason: `prior_trend_mismatch:${trend.classification}`,
						idxs: [a.idx, b.idx, c.idx],
						pts: [
							{ role: 'valley1', idx: a.idx, price: a.price },
							{ role: 'peak', idx: b.idx, price: b.price },
							{ role: 'valley2', idx: c.idx, price: c.price },
						],
					});
					continue;
				}
				if (trend.classification === 'insufficient_data') {
					pcand({
						type: 'double_bottom',
						accepted: true,
						reason: 'prior_trend_insufficient_data',
						idxs: [a.idx, b.idx, c.idx],
					});
				}
				const gate = applyStructuralGate(candles, pivots, 'bottom', a, b, c, necklinePrice, 'double_bottom', pcand);
				if (!gate) continue;
				const post = checkPostPivotInvalidation({
					candles,
					pivots,
					a,
					b,
					c,
					untilIdx: breakoutIdx - 1,
					side: 'bottom',
				});
				if (post.verdict === 'reclassify') {
					pcand({
						type: 'double_bottom',
						accepted: false,
						reason: 'reclassified_as_triple_bottom',
						idxs: [a.idx, b.idx, c.idx],
					});
					continue;
				}
				if (rejectByLevelDiff('bottom', 'double_bottom', a, b, c, levelTolerancePct, pcand)) continue;
				const start = candles[a.idx].isoTime;
				const end = candles[breakoutIdx].isoTime;
				if (!start || !end) continue;
				const neckline = [
					{ x: a.idx, y: necklinePrice },
					{ x: breakoutIdx, y: necklinePrice },
				];
				const per = periodScoreDays(start, end);
				const dbAvgValley = (a.price + c.price) / 2;
				const dbBp = Number(candles[breakoutIdx]?.close ?? NaN);
				const { components: dbScoreComponents, base } = buildDoubleScore({
					outer1: a.price,
					outer2: c.price,
					necklinePrice,
					breakoutClose: dbBp,
					patternHeight: necklinePrice - dbAvgValley,
					side: 'bottom',
					retracementRatio: gate.retracementRatio,
					durationScore: per,
				});
				const confidence = finalizeConf(base, 'double_bottom');
				const diagram = generatePatternDiagram(
					'double_bottom',
					[
						{ ...a, date: candles[a.idx]?.isoTime },
						{ ...b, date: candles[b.idx]?.isoTime },
						{ ...c, date: candles[c.idx]?.isoTime },
					],
					{ price: necklinePrice },
					{ start, end },
					{ tz: ctx.tz },
				);
				const dbTarget = Math.round(necklinePrice + (necklinePrice - dbAvgValley));
				const dbReach = Number.isFinite(dbBp)
					? computeTargetReach(candles, breakoutIdx, dbBp, dbTarget, 'up')
					: undefined;
				const dbStructureRange =
					candles[a.idx]?.isoTime && candles[c.idx]?.isoTime
						? { start: candles[a.idx].isoTime as string, end: candles[c.idx].isoTime as string }
						: undefined;
				const dbConfirmation = buildNecklineConfirmation(candles, breakoutIdx);
				const dbPrecedingTrend = buildPrecedingTrend(candles, trend, a.idx);
				const dbStructureGate = buildStructureGate(gate);
				push(patterns, {
					type: 'double_bottom',
					confidence,
					scoreComponents: dbScoreComponents,
					...(dbStructureGate ? { structureGate: dbStructureGate } : {}),
					range: { start, end },
					...(dbStructureRange ? { structureRange: dbStructureRange } : {}),
					...(dbConfirmation ? { confirmation: dbConfirmation } : {}),
					...(dbPrecedingTrend ? { precedingTrend: dbPrecedingTrend } : {}),
					...(post.verdict === 'invalid' ? { status: 'invalid', invalidReason: post.reason } : {}),
					pivots: [a, b, c],
					neckline,
					trendlineLabel: 'ネックライン',
					breakout: { idx: breakoutIdx, price: dbBp },
					breakoutBarIndex: breakoutIdx,
					breakoutTarget: dbTarget,
					targetMethod: 'neckline_projection' as const,
					...(dbReach
						? {
								targetReachedPct: dbReach.targetReachedPct,
								targetReached: dbReach.targetReached,
								...(dbReach.targetReachedDate ? { targetReachedDate: dbReach.targetReachedDate } : {}),
								targetReachedPrice: dbReach.targetReachedPrice,
							}
						: {}),
					structureDiagram: diagram,
				});
				foundDoubleBottom = true;
				pcand({
					type: 'double_bottom',
					accepted: true,
					idxs: [a.idx, b.idx, c.idx],
					pts: [
						{ role: 'valley1', idx: a.idx, price: a.price },
						{ role: 'peak', idx: b.idx, price: b.price },
						{ role: 'valley2', idx: c.idx, price: c.price },
					],
				});
			}
		}
		// relaxed fallback for double top/bottom: single-stage factor 1.3
		for (const f of [RELAXED_TOLERANCE_FACTOR]) {
			if (!foundDoubleTop && (want.size === 0 || want.has('double_top'))) {
				const result = findRelaxedDoubleTop(
					pivots,
					candles,
					tolerancePct,
					f,
					minDist,
					pcand,
					ctx.sizeThresholds,
					ctx.tz,
				);
				if (result) {
					push(patterns, result);
					foundDoubleTop = true;
				}
			}
			if (!foundDoubleBottom && (want.size === 0 || want.has('double_bottom'))) {
				const result = findRelaxedDoubleBottom(
					pivots,
					candles,
					tolerancePct,
					f,
					minDist,
					pcand,
					ctx.sizeThresholds,
					ctx.tz,
				);
				if (result) {
					push(patterns, result);
					foundDoubleBottom = true;
				}
			}
		}
		// --- 重複パターンの排除（patterns/helpers.ts へ抽出済み） ---
		patterns = deduplicatePatterns(patterns);
	}

	// 2b) 形成中ダブルトップ/ボトム
	if (includeForming && (want.size === 0 || want.has('double_top') || want.has('double_bottom'))) {
		const formingTop = tryFormingDoubleTop(ctx);
		if (formingTop) push(patterns, formingTop);
		const formingBottom = tryFormingDoubleBottom(ctx);
		if (formingBottom) push(patterns, formingBottom);
	}

	return { patterns, found: { double_top: foundDoubleTop, double_bottom: foundDoubleBottom } };
}
