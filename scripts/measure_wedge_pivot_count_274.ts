/**
 * issue #274 Phase 1: **`wedge_*` の `pivots` 点数**を、案 A 相当の絞り方ごとに実測する。
 * **検出器・`helpers.ts`・`buildTouchPivots`・ベースラインは 1 行も変更しない**
 * （唯一の `tools/` 差分は `detect_wedges.ts` の `preparePivots` / `PivotData` に `export` を
 * 足したことだけで、本体のロジックには手が入っていない）。
 *
 * ## 問題設定（コードの事実）
 *
 * PR #273（#252）で `wedge_*` に `pivots` が出るようになった。中身は
 * **上下トレンドラインの非ブレイクタッチ点すべて**（`buildTouchPivots`）で、`price` は高安。
 * タッチ判定は `evaluateTouchesEx`（`helpers.ts`）が**ラインから 0.5% 以内**で行うため、
 * 収束して上下幅が 0.5% を切った区間では**ほぼ全バーが構成点**になる。実データ 4 件で
 * 31 / 37 / 68 / 107 点（`triangle_*` は 7〜9 点）。
 *
 * **今すぐ困る消費者は無い**（#243 案 C で型間排他は見送り、`view=full` の pivot 明細も
 * wedge には出ない）。本スクリプトは「直すか」を決めるための計測で、**採否は決めない**。
 *
 * ## 計測する絞り方（案 A の変種）
 *
 * どれも `evaluateTouchesEx` の結果か `ctx` にある点の部分集合で、**新しい判定を足さない**。
 *
 * | 変種 | 中身 |
 * |---|---|
 * | **A0**（現行） | 非ブレイクタッチ点すべて（= `entry.pivots` そのもの） |
 * | **A1** | そのウェッジの**トレンドラインを引くのに使った入力点**（回帰パスは `lrWithR2` に渡した `highsIn` / `lowsIn`、形成中パスは `findUpperTrendlineF` / `findLowerTrendlineF` に渡した窓内の点） |
 * | **A2** | A0 のうち `ctx.pivots`（`detectSwingPoints` の H / L）と `(idx, kind)` が一致する点 |
 * | **A3** | A0 の**連続タッチ**（`idx` が連続する同 `kind` の走）を走ごとに 1 点に畳んだもの |
 *
 * ### A1 の `price` 基準は 2 つのパスで違う（メモ §4 の論点）
 *
 * - **回帰パス**: `preparePivots` の `sgPeaks` / `sgValleys` は `price` に**終値**を入れており
 *   （`candles[i].close`）、`useSmoothed` が false のときの `origHighs` / `origLows` も
 *   `Pivot.price` = 終値。したがって A1 の `price` は**終値**で、
 *   PR #273 の「`price` は高安」不変条件を**満たさない**。
 * - **形成中パス**: `highsForWindow` / `lowsForWindow` は `price` に `candles[i].high` /
 *   `.low` を入れているので、A1 の `price` は**高安**で不変条件を満たす。
 *
 * この非対称そのものが計測結果の 1 つなので、スクリプトは**両方をそのまま数える**。
 *
 * ## 復元のやり方（写しを作らない）
 *
 * A1 と「終端での上下幅」には**そのウェッジのトレンドライン**が要るが、線も窓も出力に
 * 載っていない。**同じ式をスクリプトに写すのではなく、候補を並べて A0 と突き合わせて
 * 特定する**（{@link reconstruct}）:
 *
 * 1. 候補の窓（回帰パスは `generateWindows`、形成中パスは窓長スイープ）と候補の線
 *    （回帰パスは `lrWithR2(highsIn)`、形成中パスは窓内の点 2 つを通る直線の総当たり）を並べる。
 * 2. 各候補に**本物の `evaluateTouchesEx`** を当て、非ブレイクタッチ点の `(idx, kind)` 列が
 *    **エントリの `pivots`（A0）と完全一致**するものだけを残す。
 * 3. さらに `calcApex(upper, lower, endIdx).barsToApex` が**エントリの `daysToApex` と一致**
 *    することを要求する（出力に載っている値を鍵に使う）。
 *
 * 選択規則（`findUpperTrendlineF` のスコアリング、`validateRegressionCandidate` のゲート）は
 * **1 行も写していない**——写しているのは候補空間だけで、どれが選ばれたかは**本物の出力**が
 * 決める。**検出器側が動けば一致しなくなって「復元できない」件数に出る**（黙って嘘の数字を
 * 出さない）。復元できたぶんは `debug.candidates` の申告値（回帰パスの `slopeHigh` /
 * `slopeLow` / `converge.gapEnd`）と突き合わせて検算する（§0 の「食い違い」）。
 *
 * **A0 / A2 / A3 は復元を必要としない**（A0 は出力そのもの、A2 は `ctx.pivots` との突き合わせ、
 * A3 は A0 の `idx` の連続性だけ）。復元に失敗しても落ちるのは A1 と上下幅だけ。
 *
 * ## コーパス
 *
 * `scripts/measure_wick_only_second_peak_245.ts` と同じ——標準 800（合成 704 + 実データ A 96）
 * ＋ 実データ B / C / D 各 96 ＋ ローリング窓 3,672 × 3 = **12,104 ケース**。
 * **プールしない**（#219）。実体は `(group, type, range.start, range.end)` の絶対時刻で畳む。
 *
 * `--strip-ref` は不要（検出器を変えないので削除済み経路のアンカーが無い）。
 * `includeForming` は全ケースで true、`want` は空（`rising_wedge` / `falling_wedge` 両方）。
 *
 * ## 使い方
 *
 * ```bash
 * npx tsx scripts/measure_wedge_pivot_count_274.ts
 * npx tsx scripts/measure_wedge_pivot_count_274.ts --json /tmp/274.json
 * npx tsx scripts/measure_wedge_pivot_count_274.ts --no-rolling   # 短時間確認用
 * ```
 */

import { writeFileSync } from 'node:fs';
import { nowIso } from '../lib/datetime.js';
import { buildBtcJpy2026Candles } from '../tests/fixtures/btc_jpy_1day_2026.js';
import { buildBtcJpy1hour202608Candles } from '../tests/fixtures/btc_jpy_1hour_2026_08.js';
import { buildBtcJpy1hour202609Candles } from '../tests/fixtures/btc_jpy_1hour_2026_09.js';
import { buildBtcJpy1hour20260905Candles } from '../tests/fixtures/btc_jpy_1hour_2026_09_05.js';
import * as synth from '../tests/fixtures/synthetic_pattern_candles.js';
import { getHsShoulderMaxPctForTf, getSizeThresholdsForTf, resolveParams } from '../tools/patterns/config.js';
import { detectDoubles } from '../tools/patterns/detect_doubles.js';
import { detectHeadAndShoulders } from '../tools/patterns/detect_hs.js';
import { detectPennantsFlags } from '../tools/patterns/detect_pennants.js';
import { detectTriangles } from '../tools/patterns/detect_triangles.js';
import { detectTriples } from '../tools/patterns/detect_triples.js';
// #274 計測用に `preparePivots` だけ export を足してある（本体は不変）。
import { detectWedges, getWedgeBarParams, type PivotData, preparePivots } from '../tools/patterns/detect_wedges.js';
import { calcApex, evaluateTouchesEx, generateWindows, globalDedup } from '../tools/patterns/helpers.js';
import { excludeTriplesSharingHsMainPoints } from '../tools/patterns/mutual-exclusion.js';
import { linearRegressionWithR2, near as nearFn, pct as pctFn } from '../tools/patterns/regression.js';
import { type Candle, detectSwingPoints, filterPeaks, filterValleys, type Pivot } from '../tools/patterns/swing.js';
import type { CandDebugEntry, CandleData, DeduplicablePattern, DetectContext } from '../tools/patterns/types.js';

// ── 検出器のローカル定数の写し（本物を神託にして検算する） ──

/**
 * `detect_wedges.ts` の `MIN_SG_PIVOTS` の写し。`useSmoothed`（回帰パスが SG ピボットを使うか、
 * `ctx.pivots` にフォールバックするか）の分岐に要る。
 *
 * 本物は module-local な `const` で export されていない。**A1 の入力点はこの分岐で切り替わる**
 * ので写さざるを得ないが、写しがずれれば {@link reconstruct} の A0 一致が取れなくなって
 * 「復元できない」件数に出る（黙って別の点集合を A1 として数えることはない）。
 */
const MIN_SG_PIVOTS = 6;

/** `evaluateTouchesEx` のタッチ閾値（`helpers.ts` の `touchThresholdPct`）。**プリフィルタ専用**。 */
const TOUCH_THRESHOLD_PCT = 0.005;

/**
 * §2 で「収束区間ではほぼ全バーが構成点」を判定するための上下幅の境目。
 *
 * **これは計測用の区切りで、検出器のどこにも存在しない。** `evaluateTouchesEx` の
 * タッチ閾値がラインの ±0.5% なので、**上下幅がその 0.5% を切ると 1 本のバーが上下
 * 両方のラインに同時に届きうる**——issue が原因として挙げている状態そのもの。
 */
const NARROW_BAND_PCT = 0.5;

// ── コーパス（#178 / #242 / #243 / #244 / #245 / #249 と同じ組み方） ──

type Group = 'synthetic' | 'realA' | 'realB' | 'realC' | 'realD';

interface Series {
	group: Group;
	name: string;
	candles: Candle[];
}

interface CaseSpec {
	series: Series;
	tf: string;
	swingDepth: number | undefined;
	/** ローリング窓の終端 idx（フル系列なら `candles.length - 1`）。 */
	windowEnd: number;
	/** ローリング窓か（集計を分けるため）。 */
	rolling: boolean;
}

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

/**
 * 178 の `OPTS8` に相当する枠。**本 Phase も 8 通りを回さず全部固定する**（`includeForming` は
 * true、`want` は空）。ケース数の単位を 178 / 245 と揃えるため、ケースの並び
 * （時間足 × `swingDepth` × 8）はそのまま残してある。
 */
const OPTS_SLOTS = 8;

/** 実データ系列 1 本ぶんのケース（時間足 3 種 × `swingDepth` 4 種 × 8 = 96）。 */
function realCases(series: Series): CaseSpec[] {
	const out: CaseSpec[] = [];
	const windowEnd = series.candles.length - 1;
	for (const tf of ['1day', '4hour', '1hour']) {
		for (const swingDepth of [undefined, 2, 3, 6]) {
			for (let s = 0; s < OPTS_SLOTS; s++) out.push({ series, tf, swingDepth, windowEnd, rolling: false });
		}
	}
	return out;
}

/** ローリング窓の最小の窓長（末尾 60 本から 1 本ずつ伸ばす）。 */
const ROLLING_MIN_BARS = 60;

/** 実データ 1 系列のローリング窓ケース。窓は**先頭固定・終端を 1 本ずつ動かす**（#178 §2 と同じ）。 */
function rollingCases(series: Series): CaseSpec[] {
	const out: CaseSpec[] = [];
	for (let end = ROLLING_MIN_BARS - 1; end < series.candles.length; end++) {
		for (const tf of ['1day', '4hour', '1hour']) {
			for (const swingDepth of [undefined, 2, 3, 6])
				out.push({ series, tf, swingDepth, windowEnd: end, rolling: true });
		}
	}
	return out;
}

interface CorpusPart {
	label: string;
	cases: CaseSpec[];
}

/**
 * その `(系列, 時間足)` の組が**時間足別の結論に使える**か（#178 の注意）。
 *
 * 実データ B / C / D は実 1 時間足に `1day` / `4hour` / `1hour` のラベルを付け替えたもので、
 * 実データ A は `btc_jpy_1day_2026` の付け替え。合成はどのラベルでも実データではない。
 */
const isTfAuthoritative = (group: Group, tf: string): boolean =>
	group === 'realB' || group === 'realC' || group === 'realD' ? tf === '1hour' : group === 'realA' && tf === '1day';

/** 標準コーパス 800 と実データ B / C / D、およびそれぞれのローリング窓。**プールしない**（#219）。 */
function buildCorpus(includeRolling: boolean): CorpusPart[] {
	const standard: CaseSpec[] = [];
	for (const [name, build] of SYNTHETIC_BUILDERS) {
		const series: Series = { group: 'synthetic', name, candles: build() };
		const windowEnd = series.candles.length - 1;
		for (const tf of ['1day', '1hour']) {
			for (const swingDepth of [2, 3]) {
				for (let s = 0; s < OPTS_SLOTS; s++) standard.push({ series, tf, swingDepth, windowEnd, rolling: false });
			}
		}
	}
	const realA: Series = { group: 'realA', name: 'btc_jpy_1day_2026', candles: buildBtcJpy2026Candles() as Candle[] };
	standard.push(...realCases(realA));

	const realB: Series = {
		group: 'realB',
		name: 'btc_jpy_1hour_2026_08',
		candles: buildBtcJpy1hour202608Candles() as Candle[],
	};
	const realC: Series = {
		group: 'realC',
		name: 'btc_jpy_1hour_2026_09',
		candles: buildBtcJpy1hour202609Candles() as Candle[],
	};
	// **実データ D は必須**（PR #260 の CodeRabbit 指摘。動的 import + catch にするとコーパスが
	// 黙って縮んだまま正常終了する）。
	const realD: Series = {
		group: 'realD',
		name: 'btc_jpy_1hour_2026_09_05',
		candles: buildBtcJpy1hour20260905Candles() as Candle[],
	};

	const out: CorpusPart[] = [
		{ label: `標準コーパス ${standard.length}（合成 704 + 実データ A 96）`, cases: standard },
		{ label: '実データ B 96（`btc_jpy_1hour_2026_08`）', cases: realCases(realB) },
		{ label: '実データ C 96（`btc_jpy_1hour_2026_09`）', cases: realCases(realC) },
		{ label: '実データ D 96（`btc_jpy_1hour_2026_09_05`）', cases: realCases(realD) },
	];
	if (includeRolling) {
		for (const s of [realB, realC, realD]) {
			const cases = rollingCases(s);
			out.push({
				label:
					`ローリング窓 ${cases.length}（\`${s.name}\` の末尾 ${ROLLING_MIN_BARS}〜${s.candles.length} 本 ` +
					'× 時間足 3 × swingDepth 4）',
				cases,
			});
		}
	}
	return out;
}

// ── パイプライン（`detect_patterns.ts` の縮小段の再現） ──

/** 1 ケース分の再現に要る文脈（`ctx` そのものと、復元に使う派生物）。 */
interface CaseCtx {
	spec: CaseSpec;
	candles: Candle[];
	ctx: DetectContext;
	debugCandidates: CandDebugEntry[];
	pivotData: PivotData;
	barParams: ReturnType<typeof getWedgeBarParams>;
	/** `isoTime` → idx（`range` から窓の位置を引くため）。 */
	isoToIdx: Map<string, number>;
}

/** `detect_patterns.ts` と同じ順序で `DetectContext` を組む（#245 の `buildCtx` と同型）。 */
function buildCaseCtx(spec: CaseSpec): CaseCtx {
	const candles = spec.series.candles.slice(0, spec.windowEnd + 1);
	const resolved = resolveParams(spec.tf, spec.swingDepth === undefined ? {} : { swingDepth: spec.swingDepth });
	const pivots = detectSwingPoints(candles, { swingDepth: resolved.swingDepth, strictPivots: true });
	const debugCandidates: CandDebugEntry[] = [];
	const ctx: DetectContext = {
		candles,
		pivots,
		allPeaks: filterPeaks(pivots),
		allValleys: filterValleys(pivots),
		tolerancePct: resolved.tolerancePct,
		headProminencePct: resolved.headProminencePct,
		sizeThresholds: getSizeThresholdsForTf(spec.tf),
		hsShoulderMaxPct: getHsShoulderMaxPctForTf(spec.tf),
		minDist: resolved.minBarsBetweenSwings,
		want: new Set(),
		includeForming: true,
		debugCandidates,
		type: spec.tf,
		swingDepth: resolved.swingDepth,
		near: (a: number, b: number) => nearFn(a, b, resolved.tolerancePct),
		pct: pctFn,
		lrWithR2: linearRegressionWithR2,
		tz: 'Asia/Tokyo',
	};
	const isoToIdx = new Map<string, number>();
	candles.forEach((c, i) => {
		if (c.isoTime) isoToIdx.set(String(c.isoTime), i);
	});
	return {
		spec,
		candles,
		ctx,
		debugCandidates,
		// **`preparePivots` は本体の関数をそのまま呼ぶ**（写しではない）。
		pivotData: preparePivots(ctx),
		barParams: getWedgeBarParams(spec.tf),
		isoToIdx,
	};
}

/**
 * `detect_patterns.ts` の縮小段を再現して `data.patterns` 相当を返す（#245 の `runPipeline` と同型）。
 *
 * 段の順序は本体と同じ: 検出 → `globalDedup` → ライフサイクル絞り込み →
 * `excludeTriplesSharingHsMainPoints`。**ライフサイクル絞り込みは `includeForming` /
 * `includeCompleted` / `includeInvalid` を全部 true にしているので恒等**。
 * `rankPatterns` は並べ替えるだけで集合を変えないため省く。
 */
function runPipeline(cc: CaseCtx): DeduplicablePattern[] {
	const { ctx } = cc;
	let patterns: DeduplicablePattern[] = [];
	patterns.push(...detectDoubles(ctx).patterns);
	patterns.push(...detectHeadAndShoulders(ctx).patterns);
	patterns.push(...detectTriangles(ctx).patterns);
	patterns.push(...detectWedges(ctx).patterns);
	patterns.push(...detectPennantsFlags(ctx).patterns);
	patterns.push(...detectTriples(ctx).patterns);
	patterns = globalDedup(patterns);
	return excludeTriplesSharingHsMainPoints(patterns).kept;
}

/** accepted な status（`detect_patterns.ts` のライフサイクル分類の completed / forming バケット）。 */
const ACCEPTED_STATUSES = new Set(['completed', 'near_completion', 'forming']);
const statusOf = (p: DeduplicablePattern): string => String(p.status ?? 'completed');
const isWedge = (p: DeduplicablePattern): boolean => p.type === 'rising_wedge' || p.type === 'falling_wedge';

/** 検出経路。**`status` ではなくエントリを組んだ関数**で分ける（issue の「完成済み / 形成中」）。 */
type Path = 'regression' | 'forming';
const pathOf = (p: DeduplicablePattern): Path => (p._method === 'forming_relaxed' ? 'forming' : 'regression');
const PATH_LABEL: Readonly<Record<Path, string>> = {
	regression: '完成済み（buildRegressionEntry）',
	forming: '形成中（detectFormingWedges）',
};

// ── トレンドラインと入力点の復元 ──

interface Line {
	slope: number;
	intercept: number;
	valueAt: (x: number) => number;
}

/** A1 の入力点。`price` の基準がパスで違うので、どちらだったかを併せて持つ。 */
interface InputPt {
	idx: number;
	price: number;
	kind: 'H' | 'L';
	/** `price` に入っている値の基準（`close` = 終値 / `extreme` = 高安）。 */
	basis: 'close' | 'extreme';
}

interface Recon {
	/** 窓の始端（= `range.start` の idx）。 */
	startIdx: number;
	/** タッチ走査の終端（回帰パスは窓終端、形成中パスは `range.end` の idx）。**最後に構成点になりうるバー**。 */
	touchEndIdx: number;
	/** 線を決めた窓の終端（形成中パスではブレイクより先にありうる）。 */
	lineEndIdx: number;
	upper: Line;
	lower: Line;
	inputs: InputPt[];
	/** 同じ A0 を再現する候補が複数あり、終端の上下幅が一致しなかったか。 */
	ambiguous: boolean;
	/** 候補間で終端の上下幅がどれだけ割れたか（絶対値。一意なら 0）。 */
	gapSpread: number;
}

/** `(kind, idx)` 列。A0 との突き合わせの鍵。 */
const sigOf = (pts: ReadonlyArray<{ idx: number; kind: 'H' | 'L' }>, kind: 'H' | 'L'): string =>
	pts
		.filter((p) => p.kind === kind)
		.map((p) => p.idx)
		.join(',');

/** `evaluateTouchesEx` の非ブレイクタッチ点の idx 列（`buildTouchPivots` が組む配列と同じ順序）。 */
function touchSig(touches: ReadonlyArray<{ index: number; isBreak: boolean }>): string {
	return touches
		.filter((t) => !t.isBreak)
		.map((t) => t.index)
		.join(',');
}

/** `helpers.ts` の上側タッチ条件（**プリフィルタ専用**。採否は本物の `evaluateTouchesEx` が決める）。 */
function touchesUpperAt(candles: readonly CandleData[], line: Line, i: number): boolean {
	const c = candles[i];
	if (!c) return false;
	const u = line.valueAt(i);
	const thr = Math.abs(u) * TOUCH_THRESHOLD_PCT;
	return Math.abs(c.high - u) < thr && c.high <= u + thr;
}

/** 同上（下側）。 */
function touchesLowerAt(candles: readonly CandleData[], line: Line, i: number): boolean {
	const c = candles[i];
	if (!c) return false;
	const l = line.valueAt(i);
	const thr = Math.abs(l) * TOUCH_THRESHOLD_PCT;
	return Math.abs(c.low - l) < thr && c.low >= l - thr;
}

const FLAT_LINE: Line = { slope: 0, intercept: 0, valueAt: () => 0 };

/** 2 点を通る直線（`detect_wedges.ts` の `makeLineF` と同じ式。**候補空間を作るためだけ**に使う）。 */
function lineThrough(p1: { idx: number; price: number }, p2: { idx: number; price: number }): Line {
	const slope = (p2.price - p1.price) / Math.max(1, p2.idx - p1.idx);
	const intercept = p1.price - slope * p1.idx;
	return { slope, intercept, valueAt: (x: number) => slope * x + intercept };
}

/**
 * 回帰パスのウェッジのトレンドライン・窓・入力点を復元する。
 *
 * 候補は `generateWindows` のうち `startIdx` が一致するものだけ。各候補で
 * `lrWithR2(highsIn)` / `lrWithR2(lowsIn)` を組み、**本物の `evaluateTouchesEx`** を
 * `[startIdx, endIdx]` に当てて A0 と一致するものを残す。
 */
function reconstructRegression(cc: CaseCtx, entry: DeduplicablePattern, startIdx: number): Recon | null {
	const { candles, ctx, pivotData, barParams } = cc;
	const a0 = entry.pivots ?? [];
	const wantH = sigOf(a0, 'H');
	const wantL = sigOf(a0, 'L');
	const daysToApex = typeof entry.daysToApex === 'number' ? entry.daysToApex : null;

	const origHighs = ctx.pivots.filter((p) => p.kind === 'H').map((p) => ({ index: p.idx, price: p.price }));
	const origLows = ctx.pivots.filter((p) => p.kind === 'L').map((p) => ({ index: p.idx, price: p.price }));
	const useSmoothed = pivotData.sgPeaks.length >= MIN_SG_PIVOTS && pivotData.sgValleys.length >= MIN_SG_PIVOTS;
	const swingHighs = useSmoothed ? pivotData.sgPeaks : origHighs;
	const swingLows = useSmoothed ? pivotData.sgValleys : origLows;
	const basis: InputPt['basis'] = 'close';

	const hits: Recon[] = [];
	for (const w of generateWindows(
		candles.length,
		barParams.windowSizeMin,
		barParams.windowSizeMax,
		barParams.windowStep,
	)) {
		if (w.startIdx !== startIdx) continue;
		const highsIn = swingHighs.filter((s) => s.index >= w.startIdx && s.index <= w.endIdx);
		const lowsIn = swingLows.filter((s) => s.index >= w.startIdx && s.index <= w.endIdx);
		if (highsIn.length < 4 || lowsIn.length < 4) continue;
		const upper = linearRegressionWithR2(highsIn.map((s) => ({ x: s.index, y: s.price })));
		const lower = linearRegressionWithR2(lowsIn.map((s) => ({ x: s.index, y: s.price })));
		const touches = evaluateTouchesEx(candles, upper, lower, w.startIdx, w.endIdx);
		if (touchSig(touches.upperTouches) !== wantH || touchSig(touches.lowerTouches) !== wantL) continue;
		if (daysToApex !== null && calcApex(upper, lower, w.endIdx).barsToApex !== daysToApex) continue;
		hits.push({
			startIdx: w.startIdx,
			touchEndIdx: w.endIdx,
			lineEndIdx: w.endIdx,
			upper,
			lower,
			inputs: [
				...highsIn.map((s) => ({ idx: s.index, price: s.price, kind: 'H' as const, basis })),
				...lowsIn.map((s) => ({ idx: s.index, price: s.price, kind: 'L' as const, basis })),
			],
			ambiguous: false,
			gapSpread: 0,
		});
	}
	return pickRecon(hits);
}

/**
 * 形成中パスのウェッジのトレンドライン・窓・入力点を復元する。
 *
 * タッチ走査は `[startIdx, actualEndIdx]` で、`actualEndIdx` は `range.end` の idx なので既知。
 * 線を決めた**理論上の窓終端**（`endIdx`）はブレイクで打ち切られると出力に残らないので、
 * 窓長スイープの候補すべてを見る。線の候補は「窓内の点 2 つを通る直線」の総当たりで、
 * `findUpperTrendlineF` の**選択規則は写していない**。
 */
function reconstructForming(
	cc: CaseCtx,
	entry: DeduplicablePattern,
	startIdx: number,
	actualEndIdx: number,
): Recon | null {
	const { candles, pivotData, barParams } = cc;
	const a0 = entry.pivots ?? [];
	const wantH = sigOf(a0, 'H');
	const wantL = sigOf(a0, 'L');
	const daysToApex = typeof entry.daysToApex === 'number' ? entry.daysToApex : null;
	const lastIdx = candles.length - 1;

	// 理論上の窓終端の候補（`detectFormingWedges` の窓生成と同じ枠。**採否のゲートは写していない**）。
	const endCands = new Set<number>();
	for (let size = barParams.formingWindowMin; size <= barParams.formingWindowMax; size += barParams.windowStep) {
		if (startIdx + size < candles.length) endCands.add(startIdx + size);
		if (Math.max(0, lastIdx - size) === startIdx) endCands.add(lastIdx);
	}
	if (endCands.size === 0) return null;
	const maxEnd = Math.max(...endCands);

	// `smoothHigh` / `smoothLow` からのリラックスピボット（`swingDepth=1` 相当）。
	const { smoothHigh, smoothLow } = pivotData;
	const peaks: Array<{ idx: number; price: number }> = [];
	const valleys: Array<{ idx: number; price: number }> = [];
	for (let i = Math.max(1, startIdx); i <= Math.min(maxEnd, candles.length - 2); i++) {
		if (smoothHigh[i] > smoothHigh[i - 1] && smoothHigh[i] > smoothHigh[i + 1])
			peaks.push({ idx: i, price: Number(candles[i]?.high) });
		if (smoothLow[i] < smoothLow[i - 1] && smoothLow[i] < smoothLow[i + 1])
			valleys.push({ idx: i, price: Number(candles[i]?.low) });
	}

	const upperHits = matchLines(candles, peaks, wantH, 'H', startIdx, actualEndIdx);
	const lowerHits = matchLines(candles, valleys, wantL, 'L', startIdx, actualEndIdx);
	if (upperHits.length === 0 || lowerHits.length === 0) return null;

	const hits: Recon[] = [];
	for (const u of upperHits) {
		for (const l of lowerHits) {
			for (const endIdx of endCands) {
				// 線を決めた 2 点は理論上の窓の中にある。
				if (Math.max(u.maxIdx, l.maxIdx) > endIdx) continue;
				if (daysToApex !== null && calcApex(u.line, l.line, endIdx).barsToApex !== daysToApex) continue;
				const hs = peaks.filter((p) => p.idx >= startIdx && p.idx <= endIdx);
				const ls = valleys.filter((p) => p.idx >= startIdx && p.idx <= endIdx);
				if (hs.length < 2 || ls.length < 2) continue;
				const basis: InputPt['basis'] = 'extreme';
				hits.push({
					startIdx,
					touchEndIdx: actualEndIdx,
					lineEndIdx: endIdx,
					upper: u.line,
					lower: l.line,
					inputs: [
						...hs.map((p) => ({ idx: p.idx, price: p.price, kind: 'H' as const, basis })),
						...ls.map((p) => ({ idx: p.idx, price: p.price, kind: 'L' as const, basis })),
					],
					ambiguous: false,
					gapSpread: 0,
				});
			}
		}
	}
	return pickRecon(hits);
}

/** 窓内の点 2 つを通る直線のうち、A0 の片側と一致するものを列挙する。 */
function matchLines(
	candles: readonly Candle[],
	pts: ReadonlyArray<{ idx: number; price: number }>,
	want: string,
	kind: 'H' | 'L',
	startIdx: number,
	endIdx: number,
): Array<{ line: Line; maxIdx: number }> {
	// **タッチ点が 1 つも無い側は線を特定できない**（どんな線でも空列を再現しうる）。
	const wantIdxs = want === '' ? [] : want.split(',').map(Number);
	if (wantIdxs.length === 0) return [];
	const first = wantIdxs[0];
	const last = wantIdxs[wantIdxs.length - 1];
	const out: Array<{ line: Line; maxIdx: number }> = [];
	for (let i = 0; i < pts.length; i++) {
		for (let j = i + 1; j < pts.length; j++) {
			if (!Number.isFinite(pts[i].price) || !Number.isFinite(pts[j].price)) continue;
			const line = lineThrough(pts[i], pts[j]);
			// プリフィルタ: 最初と最後のタッチ点で条件を満たさない線は全走査するまでもない。
			const near = kind === 'H' ? touchesUpperAt : touchesLowerAt;
			if (!near(candles, line, first) || !near(candles, line, last)) continue;
			const t = evaluateTouchesEx(
				candles,
				kind === 'H' ? line : FLAT_LINE,
				kind === 'H' ? FLAT_LINE : line,
				startIdx,
				endIdx,
			);
			const sig = touchSig(kind === 'H' ? t.upperTouches : t.lowerTouches);
			if (sig === want) out.push({ line, maxIdx: Math.max(pts[i].idx, pts[j].idx) });
		}
	}
	return out;
}

/**
 * 候補から 1 つ選ぶ。**終端の上下幅が一致しない候補が複数あれば `ambiguous`** を立てる
 * （数字を黙って 1 つに決めない）。
 */
function pickRecon(hits: readonly Recon[]): Recon | null {
	if (hits.length === 0) return null;
	const first = hits[0];
	const gap = (r: Recon): number => r.upper.valueAt(r.touchEndIdx) - r.lower.valueAt(r.touchEndIdx);
	const gaps = hits.map(gap);
	const g0 = gaps[0];
	const gapSpread = Math.max(...gaps) - Math.min(...gaps);
	const ambiguous = gapSpread > Math.max(1e-6, Math.abs(g0) * 1e-9);
	return { ...first, ambiguous, gapSpread };
}

/** エントリから復元を試みる。`range` が引けなければ `null`。 */
function reconstruct(cc: CaseCtx, entry: DeduplicablePattern): Recon | null {
	const startIdx = cc.isoToIdx.get(String(entry.range?.start));
	const endIdx = cc.isoToIdx.get(String(entry.range?.end));
	if (startIdx === undefined || endIdx === undefined) return null;
	return pathOf(entry) === 'forming'
		? reconstructForming(cc, entry, startIdx, endIdx)
		: reconstructRegression(cc, entry, startIdx);
}

/**
 * 回帰パスの復元を `debug.candidates` の申告値で検算する。
 *
 * `buildRegressionEntry` が積む accepted 候補は `details.slopeHigh` / `slopeLow` /
 * `converge.gapEnd` を持つ。復元した線がこれと一致しなければ**別の窓を掴んでいる**。
 *
 * @returns 突き合わせできて一致 = `'ok'` / 食い違い = `'mismatch'` / 神託が引けない = `'none'`
 */
function verifyAgainstDebug(cc: CaseCtx, entry: DeduplicablePattern, recon: Recon): 'ok' | 'mismatch' | 'none' {
	const startIdx = cc.isoToIdx.get(String(entry.range?.start));
	const endIdx = cc.isoToIdx.get(String(entry.range?.end));
	if (startIdx === undefined || endIdx === undefined) return 'none';
	const cands = cc.debugCandidates.filter(
		(d) =>
			d.accepted === true &&
			d.type === entry.type &&
			Array.isArray(d.indices) &&
			d.indices[0] === startIdx &&
			d.indices[1] === endIdx &&
			typeof (d.details as { slopeHigh?: unknown } | undefined)?.slopeHigh === 'number',
	);
	if (cands.length !== 1) return 'none';
	const det = cands[0].details as {
		slopeHigh: number;
		slopeLow: number;
		converge?: { gapEnd?: number };
	};
	const gapEnd = recon.upper.valueAt(recon.lineEndIdx) - recon.lower.valueAt(recon.lineEndIdx);
	const close = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-9);
	if (!close(recon.upper.slope, det.slopeHigh) || !close(recon.lower.slope, det.slopeLow)) return 'mismatch';
	if (typeof det.converge?.gapEnd === 'number' && !close(gapEnd, det.converge.gapEnd)) return 'mismatch';
	return 'ok';
}

// ── 変種（A0 / A1 / A2 / A3） ──

type VariantKey = 'A0' | 'A1' | 'A2' | 'A3';
const VARIANTS: readonly VariantKey[] = ['A0', 'A1', 'A2', 'A3'];
const VARIANT_LABEL: Readonly<Record<VariantKey, string>> = {
	A0: 'A0 現行（非ブレイクタッチ点すべて）',
	A1: 'A1 回帰 / トレンドラインの入力点',
	A2: 'A2 A0 ∩ ctx.pivots',
	A3: 'A3 連続タッチを走ごとに 1 点',
};

/** 変種の点集合（`price` の基準まで持つ。不変条件の判定に要る）。 */
interface VariantPt {
	idx: number;
	price: number;
	kind: 'H' | 'L';
	extremePrice: number;
}

/**
 * A3: `idx` が連続する同 `kind` の走を 1 点に畳む。
 *
 * `maxGap` は「連続」とみなす `idx` の差の上限。**`maxGap = 1` が本編（隣接のみ）**で、
 * `maxGap = 2`（1 本の飛びを許す）は付録の感度確認にだけ使う（#214 の非恣意性）。
 * 代表点は**ラインとの `distance` が最小**の点——`distance` が引けないときは走の先頭。
 */
function collapseRuns(
	pts: readonly VariantPt[],
	distance: ReadonlyMap<string, number> | null,
	maxGap: number,
): VariantPt[] {
	const out: VariantPt[] = [];
	for (const kind of ['H', 'L'] as const) {
		const side = pts.filter((p) => p.kind === kind).sort((a, b) => a.idx - b.idx);
		let run: VariantPt[] = [];
		const flush = (): void => {
			if (run.length === 0) return;
			let best = run[0];
			if (distance) {
				for (const p of run) {
					const dp = distance.get(`${p.kind}:${p.idx}`);
					const db = distance.get(`${best.kind}:${best.idx}`);
					if (dp !== undefined && (db === undefined || dp < db)) best = p;
				}
			}
			out.push(best);
			run = [];
		};
		for (const p of side) {
			if (run.length > 0 && p.idx - run[run.length - 1].idx > maxGap) flush();
			run.push(p);
		}
		flush();
	}
	return out.sort((a, b) => a.idx - b.idx);
}

// ── PR #273 の不変条件 ──

/** 判定できなかった不変条件は `null`（満たしたことにしない）。 */
interface Invariants {
	/** 点数 ≥ 4 かつ H / L それぞれ 2 点以上。 */
	minPoints: boolean;
	/** `price` が高安（`kind='H'` なら `high`）で `extremePrice` と一致する。 */
	priceIsExtreme: boolean;
	/** ブレイク足を含まない。 */
	noBreakBar: boolean | null;
	/** 全点が `range` の中。 */
	inRange: boolean | null;
}

function checkInvariants(
	pts: readonly VariantPt[],
	candles: readonly Candle[],
	entry: DeduplicablePattern,
	rangeStartIdx: number | undefined,
	rangeEndIdx: number | undefined,
): Invariants {
	const nH = pts.filter((p) => p.kind === 'H').length;
	const nL = pts.filter((p) => p.kind === 'L').length;
	const breakIdx = typeof entry.breakoutBarIndex === 'number' ? entry.breakoutBarIndex : null;
	return {
		minPoints: pts.length >= 4 && nH >= 2 && nL >= 2,
		priceIsExtreme: pts.every((p) => {
			const c = candles[p.idx];
			if (!c) return false;
			return p.price === (p.kind === 'H' ? c.high : c.low) && p.extremePrice === p.price;
		}),
		noBreakBar: breakIdx === null ? null : !pts.some((p) => p.idx === breakIdx),
		inRange:
			rangeStartIdx === undefined || rangeEndIdx === undefined
				? null
				: pts.every((p) => p.idx >= rangeStartIdx && p.idx <= rangeEndIdx),
	};
}

const INVARIANT_KEYS = ['minPoints', 'priceIsExtreme', 'noBreakBar', 'inRange'] as const;
const INVARIANT_LABEL: Readonly<Record<(typeof INVARIANT_KEYS)[number], string>> = {
	minPoints: '点数 ≥ 4（H / L 各 2 点以上）',
	priceIsExtreme: '`price` が高安と一致',
	noBreakBar: 'ブレイク足を含まない',
	inRange: '全点が `range` 内',
};

// ── 1 entry の記録 ──

interface Rec {
	group: Group;
	series: string;
	tf: string;
	tfAuthoritative: boolean;
	swingDepth: string;
	windowEnd: number;
	rolling: boolean;
	type: string;
	status: string;
	path: Path;
	/** `range` の本数（`range.start` から `range.end` まで）。 */
	rangeBars: number | null;
	/** タッチ走査の始端 / 終端（**最後に構成点になりうるバー**）。 */
	touchStartIdx: number | null;
	touchEndIdx: number | null;
	/** 終端での上下幅 ÷ 価格（%）。復元できなければ `null`。 */
	bandPct: number | null;
	/** 始端での上下幅 ÷ 価格（%）。 */
	bandStartPct: number | null;
	/** 復元候補が割れたときの終端上下幅の振れ幅（%ポイント）。一意なら 0。 */
	bandSpreadPct: number | null;
	counts: Record<VariantKey, number | null>;
	/** A0 の連続走の本数（= A3 の点数）と、1 本の飛びを許した場合の本数。 */
	runs: number;
	runsGap2: number;
	/** 「隣接のみ」/「1 本の飛びを許す」それぞれで点数 ≥ 4（H / L 各 2 点以上）を満たすか。 */
	runsMinPoints: boolean;
	runsGap2MinPoints: boolean;
	inv: Record<VariantKey, Invariants | null>;
	reconOk: boolean;
	reconAmbiguous: boolean;
	debugVerify: 'ok' | 'mismatch' | 'none';
	/** 実体キー（`(group, type, range.start, range.end)` の絶対時刻）。 */
	entity: string;
}

// ── 出力ヘルパ ──

const f2 = (v: number): string => v.toFixed(2);
const pctStr = (n: number, d: number): string => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);
/** Markdown のセル内で `|` が列区切りに化けるのを防ぐ（GFM）。 */
const mdCell = (v: string): string => v.replaceAll('|', '\\|');

/** ソート済み配列の分位点（空なら null）。178 / 245 / 268 と同じ式。 */
function quantile(sorted: readonly number[], p: number): number | null {
	if (sorted.length === 0) return null;
	return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? null;
}

/** min / p10 / p50 / p90 / max の 1 行（空なら「—」）。 */
function distCells(values: readonly number[]): string {
	if (values.length === 0) return '— | — | — | — | —';
	const s = [...values].sort((a, b) => a - b);
	return [String(s[0]), String(quantile(s, 0.1)), String(quantile(s, 0.5)), String(quantile(s, 0.9)), String(s.at(-1))]
		.map((x) => mdCell(x))
		.join(' | ');
}

const inc = <K>(m: Map<K, number>, k: K, by = 1): void => {
	m.set(k, (m.get(k) ?? 0) + by);
};

// ── §0 の自己検算 ──

/**
 * issue #274 本文の実データ 4 件。**実データ B（`btc_jpy_1hour_2026_08`）の全 365 本を
 * `1hour` × 既定オプション（`swingDepth` auto = 3）で回したとき**の accepted wedge 4 件で、
 * `tests/detect_patterns_data_patterns_regression.test.ts` のベースライン
 * （`detect_patterns_1hour_data_patterns_baseline.json`）が凍結している 4 件と同じもの。
 *
 * 4 件とも**形成中パス（`_method: 'forming_relaxed'`）由来**（回帰パス由来なら `aftermath` を持つ）。
 */
const SELF_CHECK_A0 = [31, 37, 68, 107] as const;

interface SelfCheckOut {
	series: string;
	tf: string;
	swingDepth: string;
	a0Counts: number[];
	entries: Array<{ type: string; status: string; path: Path; range: string; a0: number }>;
}

/** {@link SELF_CHECK_A0} を再現する。食い違えばその場で例外（数字を 1 つも出す前に落とす）。 */
function runSelfCheck(): SelfCheckOut {
	const series: Series = {
		group: 'realB',
		name: 'btc_jpy_1hour_2026_08',
		candles: buildBtcJpy1hour202608Candles() as Candle[],
	};
	const spec: CaseSpec = {
		series,
		tf: '1hour',
		swingDepth: undefined,
		windowEnd: series.candles.length - 1,
		rolling: false,
	};
	const cc = buildCaseCtx(spec);
	const wedges = runPipeline(cc).filter((p) => isWedge(p) && ACCEPTED_STATUSES.has(statusOf(p)));
	const a0Counts = wedges.map((p) => (p.pivots ?? []).length).sort((a, b) => a - b);
	const want = [...SELF_CHECK_A0].join(' / ');
	if (a0Counts.join(' / ') !== want) {
		throw new Error(
			`自己検算: 実データ 4 件の A0 点数が ${a0Counts.join(' / ') || 'なし'} で、期待値 ${want} と食い違う。`,
		);
	}
	const notForming = wedges.filter((p) => pathOf(p) !== 'forming');
	if (notForming.length > 0) {
		throw new Error(`自己検算: 実データ 4 件に形成中パス以外が混ざっている（${notForming.length} 件）。`);
	}
	// 復元も自己検算の一部にする——ここで外すなら A1 / 上下幅の数字は信用できない。
	for (const w of wedges) {
		if (reconstruct(cc, w) === null) {
			throw new Error(`自己検算: 実データ 4 件のトレンドラインを復元できない（${w.type} ${w.range?.start}）。`);
		}
	}
	return {
		series: series.name,
		tf: spec.tf,
		swingDepth: 'auto',
		a0Counts,
		entries: wedges.map((p) => ({
			type: String(p.type),
			status: statusOf(p),
			path: pathOf(p),
			range: `${p.range?.start} 〜 ${p.range?.end}`,
			a0: (p.pivots ?? []).length,
		})),
	};
}

// ── main ──

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const jsonAt = argv.indexOf('--json');
	const jsonPath = jsonAt >= 0 ? (argv[jsonAt + 1] ?? null) : null;
	// **引数の検査は計測の前に置く**（#245 と同じ理由。回しきってから何も書かずに終わるのを防ぐ）。
	if (jsonAt >= 0 && (jsonPath === null || jsonPath.startsWith('--'))) {
		throw new Error(`--json には出力先パスが要る（受け取った値: ${jsonPath ?? 'なし'}）。`);
	}
	const includeRolling = !argv.includes('--no-rolling');

	// **数字を 1 つも出す前に**自己検算する。
	const selfCheck = runSelfCheck();

	const out: string[] = [];
	const say = (s = ''): void => {
		out.push(s);
	};

	const corpus = buildCorpus(includeRolling);
	const recs: Rec[] = [];
	/** 実体キー → 代表 1 件（最初に見たもの）。 */
	const entities = new Map<string, Rec>();

	let caseCount = 0;
	let wedgeCount = 0;
	let reconFailed = 0;
	let reconAmbiguous = 0;
	let debugMismatch = 0;
	const byPathType = new Map<string, number>();

	for (const part of corpus) {
		for (const spec of part.cases) {
			caseCount++;
			const cc = buildCaseCtx(spec);
			const patterns = runPipeline(cc);
			const sd = String(spec.swingDepth ?? 'auto');
			const candles = cc.candles;

			for (const p of patterns) {
				if (!isWedge(p)) continue;
				const status = statusOf(p);
				if (!ACCEPTED_STATUSES.has(status)) continue;
				wedgeCount++;
				const path = pathOf(p);
				inc(byPathType, `${path}|${p.type}|${status}`);

				const rangeStartIdx = cc.isoToIdx.get(String(p.range?.start));
				const rangeEndIdx = cc.isoToIdx.get(String(p.range?.end));
				const recon = reconstruct(cc, p);
				if (recon === null) reconFailed++;
				else if (recon.ambiguous) reconAmbiguous++;
				const debugVerify = recon !== null && path === 'regression' ? verifyAgainstDebug(cc, p, recon) : 'none';
				if (debugVerify === 'mismatch') debugMismatch++;

				const a0: VariantPt[] = (p.pivots ?? []).map((v: Pivot) => ({
					idx: v.idx,
					price: v.price,
					kind: v.kind,
					extremePrice: v.extremePrice,
				}));
				const ctxKeys = new Set(cc.ctx.pivots.map((v) => `${v.kind}:${v.idx}`));
				const a2 = a0.filter((v) => ctxKeys.has(`${v.kind}:${v.idx}`));

				// ラインとの `distance`（A3 の代表点の選択にだけ使う。点数には効かない）。
				let distance: Map<string, number> | null = null;
				if (recon !== null) {
					distance = new Map();
					const t = evaluateTouchesEx(candles, recon.upper, recon.lower, recon.startIdx, recon.touchEndIdx);
					for (const u of t.upperTouches) if (!u.isBreak) distance.set(`H:${u.index}`, u.distance);
					for (const l of t.lowerTouches) if (!l.isBreak) distance.set(`L:${l.index}`, l.distance);
				}
				const a3 = collapseRuns(a0, distance, 1);
				const a3gap2 = collapseRuns(a0, distance, 2);

				const a1: VariantPt[] | null =
					recon === null
						? null
						: recon.inputs.map((v) => ({ idx: v.idx, price: v.price, kind: v.kind, extremePrice: v.price }));

				const sets: Record<VariantKey, VariantPt[] | null> = { A0: a0, A1: a1, A2: a2, A3: a3 };
				const counts = {} as Rec['counts'];
				const inv = {} as Rec['inv'];
				for (const k of VARIANTS) {
					const s = sets[k];
					counts[k] = s === null ? null : s.length;
					inv[k] = s === null ? null : checkInvariants(s, candles, p, rangeStartIdx, rangeEndIdx);
				}

				let bandPct: number | null = null;
				let bandStartPct: number | null = null;
				let bandSpreadPct: number | null = null;
				if (recon !== null) {
					const u = recon.upper.valueAt(recon.touchEndIdx);
					const l = recon.lower.valueAt(recon.touchEndIdx);
					const mid = (u + l) / 2;
					bandPct = mid > 0 ? ((u - l) / mid) * 100 : null;
					bandSpreadPct = mid > 0 ? (recon.gapSpread / mid) * 100 : null;
					const u0 = recon.upper.valueAt(recon.startIdx);
					const l0 = recon.lower.valueAt(recon.startIdx);
					const mid0 = (u0 + l0) / 2;
					bandStartPct = mid0 > 0 ? ((u0 - l0) / mid0) * 100 : null;
				}

				const rec: Rec = {
					group: spec.series.group,
					series: spec.series.name,
					tf: spec.tf,
					tfAuthoritative: isTfAuthoritative(spec.series.group, spec.tf),
					swingDepth: sd,
					windowEnd: spec.windowEnd,
					rolling: spec.rolling,
					type: String(p.type),
					status,
					path,
					rangeBars: rangeStartIdx === undefined || rangeEndIdx === undefined ? null : rangeEndIdx - rangeStartIdx + 1,
					touchStartIdx: recon?.startIdx ?? null,
					touchEndIdx: recon?.touchEndIdx ?? null,
					bandPct,
					bandStartPct,
					bandSpreadPct,
					counts,
					runs: a3.length,
					runsGap2: a3gap2.length,
					runsMinPoints: checkInvariants(a3, candles, p, rangeStartIdx, rangeEndIdx).minPoints,
					runsGap2MinPoints: checkInvariants(a3gap2, candles, p, rangeStartIdx, rangeEndIdx).minPoints,
					inv,
					reconOk: recon !== null,
					reconAmbiguous: recon?.ambiguous ?? false,
					debugVerify,
					entity: `${spec.series.group}|${p.type}|${p.range?.start}|${p.range?.end}`,
				};
				recs.push(rec);
				if (!entities.has(rec.entity)) entities.set(rec.entity, rec);
			}
		}
	}

	const entityRecs = [...entities.values()];

	// ── 出力 ──

	say('# issue #274 Phase 1: `wedge_*` の `pivots` 点数を絞り方ごとに計測する');
	say();
	say(`生成: ${nowIso()}`);
	say();
	say('## §0 前提と自己検算');
	say();
	say(`- **ケース数**: ${caseCount}${includeRolling ? '' : '（`--no-rolling`）'}`);
	say(`- **accepted wedge**: 延べ ${recs.length} / 実体 ${entityRecs.length}`);
	say(
		'- **`tools/` の差分**: `detect_wedges.ts` の `preparePivots` / `PivotData` に `export` を足しただけ' +
			'（本体のロジックは 1 行も変えていない）。',
	);
	say();
	say(
		`自己検算: 実データ B（\`${selfCheck.series}\`）の全 365 本 × \`${selfCheck.tf}\` × ` +
			`\`swingDepth\` ${selfCheck.swingDepth} で accepted wedge 4 件の A0 点数が ` +
			`**${selfCheck.a0Counts.join(' / ')}** ——issue 本文の 31 / 37 / 68 / 107 と一致。` +
			'4 件とも**形成中パス**由来で、トレンドラインの復元も 4 件とも成功した。',
	);
	say();
	say('| # | type | status | 経路 | range | A0 |');
	say('|---|---|---|---|---|---:|');
	selfCheck.entries.forEach((e, i) => {
		say(`| ${i + 1} | \`${e.type}\` | ${e.status} | ${PATH_LABEL[e.path]} | ${mdCell(e.range)} | ${e.a0} |`);
	});
	say();
	say('復元の健全性（数字の信頼度そのもの）:');
	say();
	say(`- **復元できなかった**: ${reconFailed} / ${recs.length}（${pctStr(reconFailed, recs.length)}）`);
	say(
		`- **候補が複数で終端の上下幅が割れた**: ${reconAmbiguous} / ${recs.length}（${pctStr(reconAmbiguous, recs.length)}）`,
	);
	say(
		`- **\`debug.candidates\` の申告値と食い違い**（回帰パスのみ突き合わせ可）: ${debugMismatch} 件` +
			`（突き合わせできたのは ${recs.filter((r) => r.debugVerify === 'ok').length} 件）`,
	);
	say(
		`- **候補が割れた entry の上下幅の振れ幅**: ${
			reconAmbiguous === 0
				? '—（割れた entry が無い）'
				: `最大 ${f2(
						Math.max(...recs.filter((r) => r.bandSpreadPct !== null).map((r) => r.bandSpreadPct as number)),
					)} %ポイント`
		}`,
	);
	say();
	const regressionCount = recs.filter((r) => r.path === 'regression').length;
	say(
		regressionCount === 0
			? '**回帰パス（`buildRegressionEntry`）由来の accepted wedge は本コーパスで 0 件。** ' +
					'以降の「完成済み」行はすべて空になる——実データでも合成フィクスチャでも 4b は通らない' +
					'（`tests/patterns/detect_wedges.test.ts` 冒頭の注記と一致する）。'
			: `回帰パス（\`buildRegressionEntry\`）由来は延べ ${regressionCount} 件。`,
	);
	say();
	say('経路 × type × status の内訳（延べ）:');
	say();
	say('| 経路 | type | status | 延べ |');
	say('|---|---|---|---:|');
	for (const [k, n] of [...byPathType.entries()].sort()) {
		const [path, type, status] = k.split('|');
		say(`| ${PATH_LABEL[path as Path]} | \`${type}\` | ${status} | ${n} |`);
	}
	say();

	// §1 変種 × 経路 × group の点数分布
	say('## §1 変種 × （完成済み / 形成中） × group の点数分布');
	say();
	say(
		'**母集団を pool しない**（#219）。`group` は合成 / 実データ A〜D の別で、' +
			'`—` はその組に accepted wedge が 1 件も無いことを指す。',
	);
	say();
	const GROUPS: readonly Group[] = ['synthetic', 'realA', 'realB', 'realC', 'realD'];
	for (const unit of ['延べ', '実体'] as const) {
		const pool = unit === '延べ' ? recs : entityRecs;
		say(`### §1-${unit === '延べ' ? '1' : '2'} ${unit}`);
		say();
		say('| 変種 | 経路 | group | n | min | p10 | p50 | p90 | max |');
		say('|---|---|---|---:|---:|---:|---:|---:|---:|');
		for (const v of VARIANTS) {
			for (const path of ['regression', 'forming'] as Path[]) {
				for (const g of GROUPS) {
					const sel = pool.filter((r) => r.path === path && r.group === g);
					if (sel.length === 0) continue;
					const vals = sel.map((r) => r.counts[v]).filter((x): x is number => x !== null);
					say(
						`| ${VARIANT_LABEL[v]} | ${PATH_LABEL[path]} | ${g} | ${vals.length}${
							vals.length === sel.length ? '' : ` / ${sel.length}`
						} | ${distCells(vals)} |`,
					);
				}
			}
		}
		say();
	}
	say(
		'`n` が `x / y` の形のときは、その組 `y` 件のうち **`x` 件しか値が出せなかった**' +
			'（= トレンドラインを復元できず A1 が組めなかった）ことを指す。',
	);
	say();

	// §2 上下幅と A0 の関係
	say('## §2 終端の上下幅と A0 の点数');
	say();
	say(
		'「終端」は**タッチ走査の終端**（回帰パスは窓終端、形成中パスは `range.end`）——' +
			`**最後に構成点になりうるバー**。上下幅は \`(upper − lower) ÷ 中点\` の %。` +
			`区切りの ${NARROW_BAND_PCT}% は \`evaluateTouchesEx\` のタッチ閾値そのもの` +
			'（帯がこれを切ると 1 本のバーが上下両方のラインに同時に届きうる）。',
	);
	say();
	const withBand = recs.filter((r) => r.bandPct !== null);
	const withBandEnt = entityRecs.filter((r) => r.bandPct !== null);
	// **帯は 3 つに分ける。** 上下幅が**負**になる entry があり（走査の終端が apex より先にある
	// ＝ 2 本の線が既に交差している）、`< 0.5%` に混ぜると「収束したから狭い」形と区別できない。
	const BANDS = [
		['apex 超え（負）', (r: Rec) => (r.bandPct as number) < 0],
		['0 〜 0.5%', (r: Rec) => (r.bandPct as number) >= 0 && (r.bandPct as number) < NARROW_BAND_PCT],
		['≥ 0.5%', (r: Rec) => (r.bandPct as number) >= NARROW_BAND_PCT],
	] as const;
	say('| 単位 | 上下幅が測れた | apex 超え（負） | 0 〜 0.5% | ≥ 0.5% |');
	say('|---|---:|---:|---:|---:|');
	for (const [label, pool] of [
		['延べ', withBand],
		['実体', withBandEnt],
	] as const) {
		const cells = BANDS.map(([, pred]) => {
			const n = pool.filter(pred).length;
			return `${n}（${pctStr(n, pool.length)}）`;
		});
		say(`| ${label} | ${pool.length} | ${cells.join(' | ')} |`);
	}
	say();
	say('A0 の点数を帯ごとに分けたもの:');
	say();
	say('| 単位 | 経路 | 帯 | n | min | p10 | p50 | p90 | max |');
	say('|---|---|---|---:|---:|---:|---:|---:|---:|');
	for (const [label, pool] of [
		['延べ', withBand],
		['実体', withBandEnt],
	] as const) {
		for (const path of ['regression', 'forming'] as Path[]) {
			for (const [bandLabel, pred] of BANDS) {
				const sel = pool.filter((r) => r.path === path && pred(r));
				if (sel.length === 0) continue;
				const vals = sel.map((r) => r.counts.A0 as number);
				say(`| ${label} | ${PATH_LABEL[path]} | ${bandLabel} | ${vals.length} | ${distCells(vals)} |`);
			}
		}
	}
	say();
	say('「構成点になりうるバー」に対する A0 の充填率（`A0 ÷ (走査本数 × 2)`。1.0 = 全バーが上下とも構成点）:');
	say();
	say('| 単位 | 帯 | n | p50 | p90 | max |');
	say('|---|---|---:|---:|---:|---:|');
	for (const [label, pool] of [
		['延べ', withBand],
		['実体', withBandEnt],
	] as const) {
		for (const [bandLabel, pred] of BANDS) {
			const sel = pool
				.filter((r) => pred(r) && r.touchStartIdx !== null && r.touchEndIdx !== null)
				.map((r) => (r.counts.A0 as number) / (2 * ((r.touchEndIdx as number) - (r.touchStartIdx as number) + 1)));
			if (sel.length === 0) continue;
			const s = [...sel].sort((a, b) => a - b);
			say(
				`| ${label} | ${bandLabel} | ${s.length} | ${f2(quantile(s, 0.5) as number)} | ` +
					`${f2(quantile(s, 0.9) as number)} | ${f2(s.at(-1) as number)} |`,
			);
		}
	}
	say();

	// §3 不変条件
	say('## §3 PR #273 のテスト不変条件を各変種が満たすか');
	say();
	say(
		'PR #273（`tests/patterns/detect_wedges.test.ts` の「pivots（構成点）」）が固定している 4 つを' +
			'**機械的に当てた**もの。`判定不能` は材料が無い場合（ブレイクしていないので「ブレイク足」が無い等）で、' +
			'**満たしたことにしていない**。',
	);
	say();
	const header =
		'| 変種 | 判定できた | **1 つ以上満たさない** | ' +
		INVARIANT_KEYS.map((k) => INVARIANT_LABEL[k]).join(' | ') +
		' |';
	const rule = `|---|---:|---:|${INVARIANT_KEYS.map(() => '---:').join('|')}|`;
	for (const [label, pool] of [
		['延べ', recs],
		['実体', entityRecs],
	] as const) {
		say(`### §3-${label === '延べ' ? '1' : '2'} ${label}`);
		say();
		say(header);
		say(rule);
		for (const v of VARIANTS) {
			const sel = pool.filter((r) => r.inv[v] !== null);
			const any = sel.filter((r) => INVARIANT_KEYS.some((k) => (r.inv[v] as Invariants)[k] === false));
			const cells = INVARIANT_KEYS.map((k) => {
				const judged = sel.filter((r) => (r.inv[v] as Invariants)[k] !== null);
				const bad = judged.filter((r) => (r.inv[v] as Invariants)[k] === false);
				return `${bad.length} / ${judged.length}`;
			});
			say(`| ${VARIANT_LABEL[v]} | ${sel.length} | ${any.length} | ${cells.join(' | ')} |`);
		}
		say();
	}
	say('セルは**満たさなかった件数 / 判定できた件数**。');
	say();
	say('「点数 ≥ 4」を満たさなかった理由の内訳（延べ / 実体）:');
	say();
	say('| 変種 | 総点数 < 4 | 総点数 ≥ 4 だが H / L の片側が 2 点未満 |');
	say('|---|---:|---:|');
	for (const v of VARIANTS) {
		const bad = (pool: readonly Rec[]): Rec[] =>
			pool.filter((r) => r.inv[v] !== null && (r.inv[v] as Invariants).minPoints === false);
		const cells = [(r: Rec) => (r.counts[v] as number) < 4, (r: Rec) => (r.counts[v] as number) >= 4].map(
			(pred) => `${bad(recs).filter(pred).length} / ${bad(entityRecs).filter(pred).length}`,
		);
		say(`| ${VARIANT_LABEL[v]} | ${cells.join(' | ')} |`);
	}
	say();
	say('A1 の `price` 基準を経路別に分けたもの（回帰パスは終値、形成中パスは高安）:');
	say();
	say('| 経路 | 判定できた | `price` が高安と一致しない |');
	say('|---|---:|---:|');
	for (const path of ['regression', 'forming'] as Path[]) {
		const sel = recs.filter((r) => r.path === path && r.inv.A1 !== null);
		const bad = sel.filter((r) => (r.inv.A1 as Invariants).priceIsExtreme === false);
		say(`| ${PATH_LABEL[path]} | ${sel.length} | ${bad.length}（${pctStr(bad.length, sel.length)}） |`);
	}
	say();

	// §4 付録: A3 の「走」の定義の感度
	say('## §4 付録: A3 の「走」の定義を 1 本ずらしたときの点数（#214 の非恣意性）');
	say();
	say(
		'A3 は閾値を持たないが、「走」の定義（`idx` が連続）が**新しい境界**になる。' +
			'連続の判定に**1 本の飛びを許すか**の 2 通りだけを並べる（これ以上の変種は増やさない）。',
	);
	say();
	say('| 単位 | 経路 | n | 隣接のみ p50 | 1 本の飛びを許す p50 | 隣接のみ max | 1 本の飛びを許す max |');
	say('|---|---|---:|---:|---:|---:|---:|');
	for (const [label, pool] of [
		['延べ', recs],
		['実体', entityRecs],
	] as const) {
		for (const path of ['regression', 'forming'] as Path[]) {
			const sel = pool.filter((r) => r.path === path);
			if (sel.length === 0) continue;
			const a = sel.map((r) => r.runs).sort((x, y) => x - y);
			const b = sel.map((r) => r.runsGap2).sort((x, y) => x - y);
			say(
				`| ${label} | ${PATH_LABEL[path]} | ${sel.length} | ${quantile(a, 0.5)} | ${quantile(b, 0.5)} | ` +
					`${a.at(-1)} | ${b.at(-1)} |`,
			);
		}
	}
	say();
	const movable = recs.filter((r) => r.runs !== r.runsGap2);
	say(
		`点数が動く entry は延べ ${movable.length} / ${recs.length}（${pctStr(movable.length, recs.length)}）。` +
			`動いたぶんの中央値は ${
				movable.length === 0
					? '—'
					: (quantile(
							movable.map((r) => r.runs - r.runsGap2).sort((a, b) => a - b),
							0.5,
						) as number)
			} 点。`,
	);
	say();
	const dropsBelow4 = recs.filter((r) => r.runsMinPoints && !r.runsGap2MinPoints);
	const dropsBelow4Ent = entityRecs.filter((r) => r.runsMinPoints && !r.runsGap2MinPoints);
	say(
		'「隣接のみ」では点数 ≥ 4（H / L 各 2 点以上）を満たすのに「1 本の飛びを許す」と満たさなくなる entry は ' +
			`延べ ${dropsBelow4.length} 件 / 実体 ${dropsBelow4Ent.length} 件。`,
	);
	say();

	// §5 時間足別（実データの組だけ）
	say('## §5 時間足別（ローソク足そのものが実データである組だけ）');
	say();
	say(
		'`4hour` 行が無いのは「4 時間足では出ない」ではない——**実 4 時間足の系列がコーパスに無い**' +
			'（#178 の注意）。実データ B / C / D は実 1 時間足、実データ A は実日足。',
	);
	say();
	say('| tf | 経路 | 延べ | A0 p50 | A0 max | 上下幅 < 0.5%（apex 超えの負を含む） |');
	say('|---|---|---:|---:|---:|---:|');
	for (const tf of ['1day', '1hour']) {
		for (const path of ['regression', 'forming'] as Path[]) {
			const sel = recs.filter((r) => r.tfAuthoritative && r.tf === tf && r.path === path);
			if (sel.length === 0) continue;
			const a = sel.map((r) => r.counts.A0 as number).sort((x, y) => x - y);
			const band = sel.filter((r) => r.bandPct !== null);
			const narrow = band.filter((r) => (r.bandPct as number) < NARROW_BAND_PCT);
			say(
				`| \`${tf}\` | ${PATH_LABEL[path]} | ${sel.length} | ${quantile(a, 0.5)} | ${a.at(-1)} | ` +
					`${narrow.length} / ${band.length}（${pctStr(narrow.length, band.length)}） |`,
			);
		}
	}
	say();

	// §6 具体例（メモが数字を指すためのアンカー）
	say('## §6 A0 が重い実体の上位 10 件');
	say();
	say(
		'`帯` は終端の上下幅（%）、`充填率` は `A0 ÷ (走査本数 × 2)`。' +
			'**同じ値動きが時間足ラベルと `swingDepth` を変えて複数の実体になる**ので、' +
			'この表は「重い形が何個あるか」ではなく「重い実体がどう見えるか」を示す。',
	);
	say();
	say('| # | group | tf | sd | type | range 本数 | 帯 | 充填率 | A0 | A1 | A2 | A3 |');
	say('|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|');
	[...entityRecs]
		.sort((a, b) => (b.counts.A0 as number) - (a.counts.A0 as number))
		.slice(0, 10)
		.forEach((r, i) => {
			const fill =
				r.touchStartIdx === null || r.touchEndIdx === null
					? '—'
					: f2((r.counts.A0 as number) / (2 * (r.touchEndIdx - r.touchStartIdx + 1)));
			say(
				`| ${i + 1} | ${r.group} | \`${r.tf}\` | ${r.swingDepth} | \`${r.type}\` | ${r.rangeBars ?? '—'} | ` +
					`${r.bandPct === null ? '—' : `${f2(r.bandPct)}%`} | ${fill} | ` +
					`${r.counts.A0} | ${r.counts.A1 ?? '—'} | ${r.counts.A2} | ${r.counts.A3} |`,
			);
		});
	say();

	const text = out.join('\n');
	process.stdout.write(`${text}\n`);
	if (jsonPath) {
		writeFileSync(
			jsonPath,
			`${JSON.stringify(
				{
					generatedAt: nowIso(),
					caseCount,
					includeRolling,
					selfCheck,
					counts: {
						wedges: wedgeCount,
						accepted: recs.length,
						entities: entityRecs.length,
						reconFailed,
						reconAmbiguous,
						debugMismatch,
					},
					recs,
				},
				null,
				2,
			)}\n`,
		);
	}
}

main().catch((e) => {
	process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
	process.exit(1);
});
