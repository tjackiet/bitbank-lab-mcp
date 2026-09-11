/**
 * issue #288 Phase 1: **ターゲット到達の走査窓（`TARGET_REACH_MAX_BARS` = 60）の境界を実データで検証する。**
 * **検出器・`tools/patterns/target-reach.ts` の定数・表示・ベースラインは 1 行も変更しない**（計測とメモだけ）。
 *
 * ## 問題設定（コードの事実）
 *
 * `TARGET_REACH_MAX_BARS` = 60 は #210 の延べ集計（合成 fixture が大半）で
 * 「到達済み 2,576 行の初到達バー数のうち **60 本以内が 96.3%**」として決めた値。
 * これは**到達済みケースの条件付き分布**であって、
 *
 * - 到達**率**（母集団にブレイクしたが到達しなかったものを入れた割合）でもなければ、
 * - **帰無**（同じ距離のターゲットを任意のバーに置いたときの到達率）との比較でもない。
 *
 * issue #288 本文の予備監査（実データ、n=27）では、**他パターンのブレイクを挟まない自力到達は
 * 12 件すべて 20 本以内**で、**20 本超の到達 6 件は全件が別パターン経由**だった。
 * 本 Phase はこの境界が rolling 窓で構造単位を増やしても保てるかだけを確認する。
 * **決定は Phase 2。** 本スクリプトは閾値の提案をしない——「20 本」は仮置きで、確定値は計測が決める。
 *
 * ## 決まっている前提
 *
 * - **結論の錨は実データのネイティブ時間足のみ**（実データ A = `1day`、B / C / D = `1hour`）。
 *   合成 fixture は集計するが**結論に使わない**（#219）。
 * - **母集団は pool しない。** 延べ（accepted 出力 1 件 = 1）と実体（構造）を分けて出す。
 *   実体の同定は **(timeline, type, ブレイク足の絶対時刻, 方向, target を丸めた値)**。
 *   **実データ B / C / D は同じ 1 時間足履歴の重なる窓**（B = 08-12T20Z〜08-28T00Z、
 *   C = 08-20T09Z〜09-04T13Z、D = 08-21T04Z〜09-05T08Z）なので、系列別に実体を数えると
 *   同じ値動きを最大 3 回数える。実体の timeline は B / C / D を 1 本に畳んである（#245 と同じ扱い）。
 *
 * ## 量の定義（1 イベント = accepted パターン 1 件のブレイク）
 *
 * イベントになるのは `status` が `invalid` / `expired` / `forming` **以外**のパターンのうち、
 * `breakoutBarIndex ?? breakout.idx ?? confirmation.idx` と `breakoutDirection` と
 * `breakoutTarget` が**3 つとも揃う**もの。ブレイク価格は**ブレイク足の終値**、
 * `dist` = `|target − breakoutPrice|`。
 *
 * | 量 | 定義 |
 * |---|---|
 * | `avail` | ブレイク足の後に**系列**に残る本数。{@link SCAN_HORIZON} 本揃うイベントだけを到達率の母集団にする（揃わないものは打ち切りとして別集計） |
 * | `firstReach` | ブレイク足を 0 本目として、`low ≤ target`（down）/ `high ≥ target`（up）を初めて満たす本数。**上限は 60 ではなく系列末尾まで**（60 本超の到達も見る） |
 * | `otherBreakoutsBefore` | **同一系列内**で、同じ実体集合に属する他イベントのうちブレイク足が `(このブレイク, 初到達)` の間にあるもの。未到達なら `(このブレイク, +60]`。方向（同方向 / 逆方向）と本数を持つ |
 * | `selfReach` | `firstReach` が有限かつ `otherBreakoutsBefore` が空 |
 * | `bodyBackInside1_2` | ブレイク後 1 本目**または** 2 本目の終値が、ブレイクしたライン（double / triple / H&S はネックライン、三角形はブレイクした側のトレンドライン）の**内側**に戻ったか |
 *
 * ### 窓と系列を分ける（重要）
 *
 * **検出は窓（rolling）で、到達の走査は系列全体で行う。** 窓は「その時点で何が検出されるか」を
 * 決めるだけで、ブレイク後に実際に何が起きたかは凍結 fixture 側に全部入っている。
 * したがって `avail` / `firstReach` / `bodyBackInside1_2` は**窓の終端に依存しない**——
 * 同じ実体なら、どの窓で拾われても同じ値になる。ローリング窓は**構造単位を増やすためだけ**に使う。
 *
 * ### `bodyBackInside1_2` が取れない type
 *
 * ラインの値は `aftermath.ts` の `necklineValue`（2 点の線形補間。区間外はクランプ）で取る。
 * doubles / triples / H&S / triangles は `neckline` を出すので取れるが、
 * **`wedge_*` / `pennant` / `flag` は `neckline` を出さない**ので `n/a`。除外数を報告する。
 *
 * ## 自己検算（数字を 1 つも出す前に走り、合わなければ例外）
 *
 * {@link runSelfCheck} が **実データの全 365 本窓 / 90 本窓 × ネイティブ時間足 × 既定 `swingDepth`**
 * という予備監査と同じ切り出しで、
 *
 * - 実体イベント **40**
 * - `avail ≥ 60` が **27**
 * - そのうち到達（`firstReach ≤ 60`）が **18**
 * - 到達 18 件のうち `firstReach > 20` の **6 件**が
 *   `triangle_descending@22` / `triangle_descending@37` / `triangle_descending@37` /
 *   `rising_wedge@40` / `rising_wedge@40` / `triangle_ascending@47`
 *
 * を再現することを検算する。**issue 本文は「実データ B / C / D の全 365 本窓」と書いているが、
 * 実体 40 に到達するには実データ A（1day 90 本）の 4 件が要る**——A の 4 件は `avail` が
 * 8 / 9 / 43 / 44 なので `avail ≥ 60` にも到達数にも 1 件も寄与せず、27 / 18 / 6 は
 * B / C / D だけで測ったときと完全に一致する。そのため本検算は A を含めた 4 系列で行う。
 *
 * ## コーパス
 *
 * 実データ A / B / C / D × ネイティブ時間足 × `swingDepth` {auto, 2, 3, 6} × ローリング窓。
 * 1hour（B / C / D）は末尾 {@link ROLLING_MIN_BARS} 本の窓から 1 本ずつ終端を伸ばして 365 本まで、
 * 1day（A）は **90 本のまま**（系列そのものが 90 本しかない）。窓は**先頭固定**なので
 * ピボット / ブレイク足の添字が窓をまたいで安定する（#245 §2 と同じ理由）。
 *
 * 合成 fixture は**参考としてのみ**回す（#219。結論には使わない）。
 *
 * `detect_patterns` を通さず検出器を直接回すのは、`globalDedup` 後の代表の入れ替わりで構造が
 * 消えるのを避けるため（#228 の計測スクリプトと同じ配慮）。縮小段は {@link runPipeline} が
 * 本体（`tools/detect_patterns.ts`）と同じ順序で再現する。
 *
 * ## 使い方
 *
 * ```bash
 * npx tsx scripts/measure_target_reach_window_288.ts
 * npx tsx scripts/measure_target_reach_window_288.ts --json /tmp/288.json
 * npx tsx scripts/measure_target_reach_window_288.ts --no-rolling   # 短時間確認用
 * ```
 */

import { writeFileSync } from 'node:fs';
import { nowIso } from '../lib/datetime.js';
import { buildBtcJpy2026Candles } from '../tests/fixtures/btc_jpy_1day_2026.js';
import { buildBtcJpy1hour202608Candles } from '../tests/fixtures/btc_jpy_1hour_2026_08.js';
import { buildBtcJpy1hour202609Candles } from '../tests/fixtures/btc_jpy_1hour_2026_09.js';
import { buildBtcJpy1hour20260905Candles } from '../tests/fixtures/btc_jpy_1hour_2026_09_05.js';
import * as synth from '../tests/fixtures/synthetic_pattern_candles.js';
import { necklineValue } from '../tools/patterns/aftermath.js';
import { getHsShoulderMaxPctForTf, getSizeThresholdsForTf, resolveParams } from '../tools/patterns/config.js';
import { detectDoubles } from '../tools/patterns/detect_doubles.js';
import { detectHeadAndShoulders } from '../tools/patterns/detect_hs.js';
import { detectPennantsFlags } from '../tools/patterns/detect_pennants.js';
import { detectTriangles } from '../tools/patterns/detect_triangles.js';
import { detectTriples } from '../tools/patterns/detect_triples.js';
import { detectWedges } from '../tools/patterns/detect_wedges.js';
import { globalDedup } from '../tools/patterns/helpers.js';
import { excludeTriplesSharingHsMainPoints } from '../tools/patterns/mutual-exclusion.js';
import { linearRegressionWithR2, near as nearFn, pct as pctFn } from '../tools/patterns/regression.js';
import { type Candle, detectSwingPoints, filterPeaks, filterValleys } from '../tools/patterns/swing.js';
import { TARGET_REACH_MAX_BARS } from '../tools/patterns/target-reach.js';
import type { CandDebugEntry, DeduplicablePattern, DetectContext, PatternEntry } from '../tools/patterns/types.js';

/**
 * 現行の走査窓（`tools/patterns/target-reach.ts` の値をそのまま読む）。
 *
 * **数値を写さない。** 写すと Phase 2 で本体を変えたときに計測だけが古い境界を語る。
 * 本スクリプトはこの値を (a) 到達率の母集団条件（`avail ≥ SCAN_HORIZON`）と
 * (b) 未到達イベントの `otherBreakoutsBefore` の窓幅、の 2 箇所にだけ使う。
 * `firstReach` 自体はこの値で打ち切らない（60 本超の到達も見るのが本 Phase の目的）。
 */
const SCAN_HORIZON = TARGET_REACH_MAX_BARS;

/** 累積・到達率を出す本数。**閾値の提案ではなく、境界がどこで割れるかを見るための刻み。** */
const N_LEVELS = [5, 10, 20, 30, SCAN_HORIZON] as const;

/** ローリング窓の最小の窓長（末尾からこの本数で始め、終端を 1 本ずつ伸ばす）。#245 と同じ。 */
const ROLLING_MIN_BARS = 60;

/** `swingDepth` のスイープ（`undefined` = 既定＝時間足から解決）。 */
const SWING_DEPTHS: ReadonlyArray<number | undefined> = [undefined, 2, 3, 6];

/**
 * `status` の扱い。**ここだけは issue #288 本文の 2 箇所が食い違っているので、両方出す。**
 *
 * - 「イベントの抽出」節は **accepted パターン（`invalid` / `forming` は除く）** と書いている。
 * - 「自己検算」節が固定した予備監査の値（実体 40 / 60 本揃う 27 / 到達 18 / `firstReach > 20` が
 *   `triangle_descending@22, 37, 37` / `rising_wedge@40, 40` / `triangle_ascending@47`）は、
 *   **`invalid` を入れないと 1 つも再現しない**——`triangle_descending` の 3 件はすべて
 *   `status: 'invalid'`（下降三角形が上に抜けた形）で、accepted だけに絞ると
 *   実体 24 / 母集団 16 / 到達 10 になる。
 *
 * どちらか一方を採ると「本文どおりにしたら検算が落ちる」か「検算を通したら本文と違う母集団」に
 * なるので、**`accepted` を Ev のフラグとして持ち、集計ユニットを 2 系統に分ける**。
 * 主表は本文の定義どおり **accepted のみ**、予備監査と地続きに読むための列として
 * **`invalid` / `expired` を含む**方も併記する。Phase 2 がどちらを見るかは決めない。
 *
 * **`forming` は常に除く**（ブレイク足が無いので `breakoutBarIndex` / `breakoutTarget` が揃わず、
 * そもそもイベントにならない）。
 */
const NON_ACCEPTED_STATUSES = new Set(['invalid', 'expired']);
/** ブレイクを持ち得ない `status`。イベント抽出の手前で落とす。 */
const NO_BREAKOUT_STATUSES = new Set(['forming']);

// ── コーパス ──

type Group = 'synthetic' | 'realA' | 'realB' | 'realC' | 'realD';

interface Series {
	group: Group;
	name: string;
	/** ネイティブ時間足（合成は「ネイティブ」が無いのでラベルを 2 種類回す）。 */
	tf: string;
	/**
	 * 実体を畳む単位。**実データ B / C / D は同じ 1 時間足履歴なので 1 本に畳む。**
	 * 合成は系列ごと・時間足ラベルごとに独立。
	 */
	timeline: string;
	candles: Candle[];
}

interface CaseSpec {
	series: Series;
	tf: string;
	swingDepth: number | undefined;
	/** ローリング窓の終端 idx（フル系列なら `candles.length - 1`）。 */
	windowEnd: number;
	rolling: boolean;
}

interface CorpusPart {
	label: string;
	/** 結論に使ってよいか（合成 fixture は false。#219）。 */
	authoritative: boolean;
	cases: CaseSpec[];
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

function realSeries(): Series[] {
	return [
		{
			group: 'realA',
			name: 'btc_jpy_1day_2026',
			tf: '1day',
			timeline: 'real|1day',
			candles: buildBtcJpy2026Candles() as Candle[],
		},
		{
			group: 'realB',
			name: 'btc_jpy_1hour_2026_08',
			tf: '1hour',
			timeline: 'real|1hour',
			candles: buildBtcJpy1hour202608Candles() as Candle[],
		},
		{
			group: 'realC',
			name: 'btc_jpy_1hour_2026_09',
			tf: '1hour',
			timeline: 'real|1hour',
			candles: buildBtcJpy1hour202609Candles() as Candle[],
		},
		// **実データ D は必須**（PR #260 の CodeRabbit 指摘。動的 import + catch にすると
		// コーパスが黙って縮んだまま正常終了する）。
		{
			group: 'realD',
			name: 'btc_jpy_1hour_2026_09_05',
			tf: '1hour',
			timeline: 'real|1hour',
			candles: buildBtcJpy1hour20260905Candles() as Candle[],
		},
	];
}

/**
 * 系列 1 本ぶんのケース。
 *
 * 1hour（365 本）は {@link ROLLING_MIN_BARS} 本の窓から終端を 1 本ずつ伸ばす。
 * 1day（90 本）は**ローリングしない**——系列が 90 本しかないので、窓を刻んでも
 * 「`avail ≥ 60` のイベント」は増えず、ブレイク足が idx ≤ 29 に来た構造しか母集団に入らない。
 */
function casesFor(series: Series, includeRolling: boolean): CaseSpec[] {
	const out: CaseSpec[] = [];
	const last = series.candles.length - 1;
	const rolling = includeRolling && series.tf === '1hour' && series.candles.length > ROLLING_MIN_BARS;
	const startEnd = rolling ? ROLLING_MIN_BARS - 1 : last;
	for (let end = startEnd; end <= last; end++) {
		for (const swingDepth of SWING_DEPTHS) {
			out.push({ series, tf: series.tf, swingDepth, windowEnd: end, rolling: rolling && end < last });
		}
	}
	return out;
}

/** **プールしない**（#219）。実データは group ごと、合成は 1 パートにまとめて「参考」と明示する。 */
function buildCorpus(includeRolling: boolean): CorpusPart[] {
	const out: CorpusPart[] = [];
	for (const s of realSeries()) {
		const cases = casesFor(s, includeRolling);
		const label =
			s.tf === '1hour'
				? `実データ ${s.group.slice(4)}（\`${s.name}\`、${s.tf}）${
						includeRolling ? `: 窓 ${ROLLING_MIN_BARS}〜${s.candles.length} 本 × swingDepth ${SWING_DEPTHS.length}` : ''
					}`
				: `実データ ${s.group.slice(4)}（\`${s.name}\`、${s.tf}、${s.candles.length} 本固定）× swingDepth ${SWING_DEPTHS.length}`;
		out.push({ label, authoritative: true, cases });
	}
	const synthetic: CaseSpec[] = [];
	for (const [name, build] of SYNTHETIC_BUILDERS) {
		const candles = build();
		for (const tf of ['1day', '1hour']) {
			const series: Series = { group: 'synthetic', name, tf, timeline: `synthetic|${name}|${tf}`, candles };
			for (const swingDepth of [2, 3]) {
				synthetic.push({ series, tf, swingDepth, windowEnd: candles.length - 1, rolling: false });
			}
		}
	}
	out.push({
		label: `合成 fixture ${synthetic.length}（**参考。結論には使わない**。#219）`,
		authoritative: false,
		cases: synthetic,
	});
	return out;
}

// ── パイプライン（`detect_patterns.ts` の縮小段の再現） ──

/** `detect_patterns.ts` と同じ順序で `DetectContext` を組む（#245 の `buildCtx` と同型）。 */
function buildCtx(candles: Candle[], tf: string, swingDepth: number | undefined): DetectContext {
	const resolved = resolveParams(tf, swingDepth === undefined ? {} : { swingDepth });
	const pivots = detectSwingPoints(candles, { swingDepth: resolved.swingDepth, strictPivots: true });
	return {
		candles,
		pivots,
		allPeaks: filterPeaks(pivots),
		allValleys: filterValleys(pivots),
		tolerancePct: resolved.tolerancePct,
		headProminencePct: resolved.headProminencePct,
		sizeThresholds: getSizeThresholdsForTf(tf),
		hsShoulderMaxPct: getHsShoulderMaxPctForTf(tf),
		minDist: resolved.minBarsBetweenSwings,
		want: new Set(),
		includeForming: true,
		debugCandidates: [] as CandDebugEntry[],
		type: tf,
		swingDepth: resolved.swingDepth,
		near: (a: number, b: number) => nearFn(a, b, resolved.tolerancePct),
		pct: pctFn,
		lrWithR2: linearRegressionWithR2,
		tz: 'Asia/Tokyo',
	};
}

/**
 * `detect_patterns.ts` の縮小段を再現して `data.patterns` 相当を返す（#243 / #245 の `runPipeline` と同型）。
 *
 * 段の順序は本体と同じ: 検出 → `globalDedup` → ライフサイクル絞り込み →
 * `excludeTriplesSharingHsMainPoints`。ライフサイクル絞り込みは `include*` を全部 true に
 * しているので恒等で、`status` の扱いは {@link NON_ACCEPTED_STATUSES} の docstring を参照。
 * `rankPatterns` は並べ替えるだけで集合を変えないため省く。
 */
function runPipeline(candles: Candle[], tf: string, swingDepth: number | undefined): PatternEntry[] {
	const ctx = buildCtx(candles, tf, swingDepth);
	let patterns: DeduplicablePattern[] = [];
	patterns.push(...detectDoubles(ctx).patterns);
	patterns.push(...detectHeadAndShoulders(ctx).patterns);
	patterns.push(...detectTriangles(ctx).patterns);
	patterns.push(...detectWedges(ctx).patterns);
	patterns.push(...detectPennantsFlags(ctx).patterns);
	patterns.push(...detectTriples(ctx).patterns);
	patterns = globalDedup(patterns);
	return excludeTriplesSharingHsMainPoints(patterns).kept as PatternEntry[];
}

// ── イベント抽出 ──

interface Ev {
	group: Group;
	seriesName: string;
	timeline: string;
	tf: string;
	sd: string;
	windowEnd: number;
	rolling: boolean;
	type: string;
	status: string;
	/** `status` が `invalid` / `expired` でない（= issue 本文「イベントの抽出」節の accepted）。 */
	accepted: boolean;
	breakoutIdx: number;
	breakoutIso: string;
	dir: 'up' | 'down';
	target: number;
	breakoutPrice: number;
	dist: number;
	avail: number;
	firstReach: number | null;
	/** 取れない type は `null`（`wedge_*` / `pennant` / `flag`）。 */
	bodyBackInside: boolean | null;
	entityKey: string;
	/**
	 * **値動き単位のキー**（`target` を落とした `(timeline, type, ブレイク足の絶対時刻, 方向)`）。
	 *
	 * 実体キーは issue #288 の定義どおり `target` を含むので、**同じ値動きでも窓の長さが違うと
	 * パターン高さが変わり、別実体として 2 度 3 度数えられる**（実データ B / C / D は重なる履歴なので
	 * 常に起きる）。独立な標本数の上限を示すためにこの粒度も併記する（#245 の「値動き」と同じ役割）。
	 * **母集団の定義は実体のまま**——値動きに畳むと `avail` の代表をどう決めるかがまた分岐する。
	 */
	motionKey: string;
}

/** ブレイク足の添字を 3 経路から取る（`breakoutBarIndex` → `breakout.idx` → `confirmation.idx`）。 */
function breakoutIdxOf(p: PatternEntry): number | null {
	if (typeof p.breakoutBarIndex === 'number') return p.breakoutBarIndex;
	if (p.breakout && typeof p.breakout.idx === 'number') return p.breakout.idx;
	if (p.confirmation && p.confirmation.type === 'neckline_breakout' && Number.isFinite(p.confirmation.idx)) {
		return p.confirmation.idx;
	}
	return null;
}

/** ブレイク足を 0 本目として初めて target に触れる本数。**系列末尾まで走査する**（60 で打ち切らない）。 */
function firstReachOf(candles: readonly Candle[], b: number, target: number, dir: 'up' | 'down'): number | null {
	for (let i = b; i < candles.length; i++) {
		const c = candles[i];
		if (!c) continue;
		const v = dir === 'down' ? Number(c.low) : Number(c.high);
		if (!Number.isFinite(v)) continue;
		if (dir === 'down' ? v <= target : v >= target) return i - b;
	}
	return null;
}

/**
 * ブレイク後 1 本目 / 2 本目の終値がブレイクしたラインの内側に戻ったか。
 *
 * ラインは `necklineValue`（`aftermath.ts`）で取る。**2 点の線形補間で区間外はクランプ**なので、
 * ブレイク足が定義点より先にあっても端点の値が返る。`neckline` を出さない type は `null`。
 */
function bodyBackInsideOf(p: PatternEntry, candles: readonly Candle[], b: number, dir: 'up' | 'down'): boolean | null {
	if (!Array.isArray(p.neckline) || p.neckline.length !== 2) return null;
	let measurable = false;
	for (const k of [1, 2]) {
		const i = b + k;
		const c = candles[i];
		if (!c) continue;
		const line = necklineValue(p, i);
		const close = Number(c.close);
		if (line === null || !Number.isFinite(line) || !Number.isFinite(close)) continue;
		measurable = true;
		if (dir === 'down' ? close >= line : close <= line) return true;
	}
	return measurable ? false : null;
}

interface ExtractCounters {
	patterns: number;
	forming: number;
	nonAccepted: number;
	noBreakoutIdx: number;
	noDirection: number;
	noTarget: number;
	invalidPrice: number;
}

/** 1 ケース（系列 × 時間足 × `swingDepth` × 窓）からイベントを取り出す。 */
function eventsOfCase(spec: CaseSpec, counters: ExtractCounters): Ev[] {
	const full = spec.series.candles;
	const windowed = full.slice(0, spec.windowEnd + 1);
	const patterns = runPipeline(windowed, spec.tf, spec.swingDepth);
	const sd = String(spec.swingDepth ?? 'auto');
	const out: Ev[] = [];
	for (const p of patterns) {
		counters.patterns++;
		const status = String(p.status ?? 'completed');
		if (NO_BREAKOUT_STATUSES.has(status)) {
			counters.forming++;
			continue;
		}
		const accepted = !NON_ACCEPTED_STATUSES.has(status);
		if (!accepted) counters.nonAccepted++;
		const b = breakoutIdxOf(p);
		if (b === null || b < 0 || b >= full.length) {
			counters.noBreakoutIdx++;
			continue;
		}
		const dir = p.breakoutDirection;
		if (dir !== 'up' && dir !== 'down') {
			counters.noDirection++;
			continue;
		}
		const target = p.breakoutTarget;
		if (typeof target !== 'number' || !Number.isFinite(target)) {
			counters.noTarget++;
			continue;
		}
		const breakoutPrice = Number(full[b]?.close ?? Number.NaN);
		if (!Number.isFinite(breakoutPrice)) {
			counters.invalidPrice++;
			continue;
		}
		const breakoutIso = String(full[b]?.isoTime ?? `idx:${b}`);
		out.push({
			group: spec.series.group,
			seriesName: spec.series.name,
			timeline: spec.series.timeline,
			tf: spec.tf,
			sd,
			windowEnd: spec.windowEnd,
			rolling: spec.rolling,
			type: String(p.type),
			status,
			accepted,
			breakoutIdx: b,
			breakoutIso,
			dir,
			target,
			breakoutPrice,
			dist: Math.abs(target - breakoutPrice),
			// **窓ではなく系列全体で測る**（ファイル冒頭「窓と系列を分ける」）。
			avail: full.length - 1 - b,
			firstReach: firstReachOf(full, b, target, dir),
			bodyBackInside: bodyBackInsideOf(p, full, b, dir),
			entityKey: `${spec.series.timeline}|${p.type}|${breakoutIso}|${dir}|${Math.round(target)}`,
			motionKey: `${spec.series.timeline}|${p.type}|${breakoutIso}|${dir}`,
		});
	}
	return out;
}

// ── 実体（構造単位） ──

interface Ent {
	key: string;
	/** 代表イベント（コーパス順で最初に見たもの）。 */
	rep: Ev;
	/** この実体が現れた系列名 → その系列でのブレイク足 idx。 */
	idxBySeries: Map<string, number>;
	/** この実体が現れた group（延べの内訳用）。 */
	groups: Set<Group>;
	/** 延べ件数。 */
	raw: number;
}

/**
 * **代表は「コーパス順で最初に見た系列」**。`avail` / `firstReach` / `bodyBackInside1_2` は
 * 代表系列の値を使う。
 *
 * **系列を跨ぐと `avail` が変わる**（同じ絶対時刻のブレイクでも、B の末尾に近ければ残りが少なく、
 * D なら多い）。「残りが一番多い系列を採る」にすると母集団が実質 D に寄るので採らない——
 * コーパス順（A → B → C → D、各系列内は窓の短い順）に固定して、
 * **最初にその構造を検出できた観測点**を代表にする。{@link runSelfCheck} が同じ規則で
 * 予備監査の 27 / 18 を再現する。
 */
function buildEntities(evs: readonly Ev[]): Map<string, Ent> {
	const ents = new Map<string, Ent>();
	for (const e of evs) {
		const cur = ents.get(e.entityKey);
		if (cur) {
			cur.raw++;
			cur.groups.add(e.group);
			if (!cur.idxBySeries.has(e.seriesName)) cur.idxBySeries.set(e.seriesName, e.breakoutIdx);
			continue;
		}
		ents.set(e.entityKey, {
			key: e.entityKey,
			rep: e,
			idxBySeries: new Map([[e.seriesName, e.breakoutIdx]]),
			groups: new Set([e.group]),
			raw: 1,
		});
	}
	return ents;
}

interface OtherBreakouts {
	count: number;
	sameDir: number;
	oppositeDir: number;
}

/**
 * `otherBreakoutsBefore`。**同一系列内**（代表系列）で、区間に入る他実体のブレイクを数える。
 *
 * 区間は到達したイベントなら `(b, b + firstReach)`（両端開）、未到達なら `(b, b + SCAN_HORIZON]`
 * （右閉）。issue #288 の定義そのまま——到達したなら「到達までに挟まったか」、
 * 未到達なら「現行の走査窓の中に挟まったか」を見ている。
 */
function otherBreakoutsBefore(e: Ent, pool: readonly Ent[]): OtherBreakouts {
	const series = e.rep.seriesName;
	const b = e.idxBySeries.get(series) as number;
	const reached = e.rep.firstReach !== null;
	const hi = reached ? b + (e.rep.firstReach as number) : b + SCAN_HORIZON;
	const out: OtherBreakouts = { count: 0, sameDir: 0, oppositeDir: 0 };
	for (const o of pool) {
		if (o === e) continue;
		const oi = o.idxBySeries.get(series);
		if (oi === undefined) continue;
		if (oi <= b) continue;
		if (reached ? oi >= hi : oi > hi) continue;
		out.count++;
		if (o.rep.dir === e.rep.dir) out.sameDir++;
		else out.oppositeDir++;
	}
	return out;
}

// ── 帰無ベンチマーク ──

interface NullBench {
	/** 起点バー数（60 本先が揃うバー）。 */
	trials: number;
	/** N ごとの到達数。 */
	hits: number[];
}

/**
 * 同系列・同方向・同 `dist` のターゲットを「{@link SCAN_HORIZON} 本先が揃う全バー」を起点に置いた到達率。
 *
 * 起点バー `j` の終値を基準価格にして `target = close[j] ± dist` を置き、
 * `[j, j + N]` の high / low が触れたかを見る（イベント側と同じく**起点バー自身を 0 本目に含める**）。
 *
 * **起点は重なっているので独立ではない。** 二項 SE は「同じ本数の独立試行だったら」という
 * 下限の目安で、真の分散はこれより大きい。呼び出し側はこの注記を必ず出す。
 */
function nullBenchmark(candles: readonly Candle[], dist: number, dir: 'up' | 'down'): NullBench {
	const hits = N_LEVELS.map(() => 0);
	let trials = 0;
	const last = candles.length - 1;
	for (let j = 0; j + SCAN_HORIZON <= last; j++) {
		const base = Number(candles[j]?.close ?? Number.NaN);
		if (!Number.isFinite(base)) continue;
		trials++;
		const target = dir === 'down' ? base - dist : base + dist;
		let k: number | null = null;
		for (let i = j; i <= j + SCAN_HORIZON; i++) {
			const c = candles[i];
			if (!c) continue;
			const v = dir === 'down' ? Number(c.low) : Number(c.high);
			if (!Number.isFinite(v)) continue;
			if (dir === 'down' ? v <= target : v >= target) {
				k = i - j;
				break;
			}
		}
		if (k === null) continue;
		for (let n = 0; n < N_LEVELS.length; n++) if (k <= N_LEVELS[n]) hits[n]++;
	}
	return { trials, hits };
}

// ── 集計ユニット ──

interface UnitStats {
	label: string;
	authoritative: boolean;
	/** 延べ件数。 */
	raw: number;
	/** 実体件数。 */
	entities: number;
	/** `avail >= SCAN_HORIZON` の実体（到達率の母集団）。 */
	population: number;
	/** 実体を値動き（`target` を落とす）に畳んだときの数。**独立な標本数の上限。** */
	motions: number;
	/** 母集団を値動きに畳んだときの数。 */
	motionsPopulation: number;
	/** 打ち切り（`avail < SCAN_HORIZON`）の実体。 */
	censored: number;
	/** 母集団のうち到達（`firstReach <= SCAN_HORIZON`）。 */
	reached: number;
	/** 母集団のうち自力到達（`selfReach` かつ `firstReach <= SCAN_HORIZON`）。 */
	selfReached: number;
	/** N 別の到達数（全到達 / 自力）。 */
	reachByN: number[];
	selfReachByN: number[];
	/** 帰無。 */
	nullTrials: number;
	nullHits: number[];
	/** `firstReach` の分位（到達したものだけ。上限は系列末尾）。 */
	reachedCountAll: number;
	reachedCountSelf: number;
	quantilesAll: (number | null)[];
	quantilesSelf: (number | null)[];
	maxAll: number | null;
	maxSelf: number | null;
	/** 自力到達の最大値の「1 つ上」（全到達の中で、自力最大より大きい最小の値）。 */
	nextAboveSelfMax: number | null;
	/** 交絡。 */
	withOther60: number;
	withOpposite60: number;
	unreached: number;
	unreachedWithOpposite: number;
	/** `bodyBackInside1_2`。 */
	bodyNa: number;
	bodyTrue: number;
	bodyFalse: number;
	bodyTrueSelfReach: number;
	bodyFalseSelfReach: number;
	/** 到達したもの（母集団内）の `(type, firstReach)`。 */
	reachedList: Array<{ type: string; firstReach: number; self: boolean; iso: string }>;
}

const QUANTILES = [0.5, 0.75, 0.9, 0.95] as const;

function quantile(sorted: readonly number[], p: number): number | null {
	if (sorted.length === 0) return null;
	const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
	return sorted[idx] ?? null;
}

function computeUnit(
	label: string,
	authoritative: boolean,
	ents: readonly Ent[],
	seriesByName: ReadonlyMap<string, Series>,
): UnitStats {
	const raw = ents.reduce((a, e) => a + e.raw, 0);
	const population = ents.filter((e) => e.rep.avail >= SCAN_HORIZON);
	const censored = ents.length - population.length;

	const selfFlag = new Map<string, boolean>();
	const others = new Map<string, OtherBreakouts>();
	for (const e of ents) {
		const ob = otherBreakoutsBefore(e, ents);
		others.set(e.key, ob);
		selfFlag.set(e.key, e.rep.firstReach !== null && ob.count === 0);
	}

	const reachByN = N_LEVELS.map(() => 0);
	const selfReachByN = N_LEVELS.map(() => 0);
	const nullHits = N_LEVELS.map(() => 0);
	let nullTrials = 0;
	const allReach: number[] = [];
	const selfReach: number[] = [];
	const reachedList: UnitStats['reachedList'] = [];
	let withOther60 = 0;
	let withOpposite60 = 0;
	let unreached = 0;
	let unreachedWithOpposite = 0;
	let bodyNa = 0;
	let bodyTrue = 0;
	let bodyFalse = 0;
	let bodyTrueSelfReach = 0;
	let bodyFalseSelfReach = 0;

	for (const e of population) {
		const fr = e.rep.firstReach;
		const isSelf = selfFlag.get(e.key) === true;
		if (fr !== null) {
			allReach.push(fr);
			if (isSelf) selfReach.push(fr);
			if (fr <= SCAN_HORIZON) {
				reachedList.push({ type: e.rep.type, firstReach: fr, self: isSelf, iso: e.rep.breakoutIso });
			}
		}
		for (let n = 0; n < N_LEVELS.length; n++) {
			if (fr !== null && fr <= N_LEVELS[n]) {
				reachByN[n]++;
				if (isSelf) selfReachByN[n]++;
			}
		}
		// 交絡は**現行の走査窓 (0, 60] を固定して**見る（`otherBreakoutsBefore` の区間とは別物。
		// あちらは到達までで打ち切るので、窓の中にどれだけ他ブレイクがあるかは測れない）。
		const series = seriesByName.get(e.rep.seriesName);
		const b = e.idxBySeries.get(e.rep.seriesName) as number;
		let cnt60 = 0;
		let opp60 = 0;
		for (const o of ents) {
			if (o === e) continue;
			const oi = o.idxBySeries.get(e.rep.seriesName);
			if (oi === undefined || oi <= b || oi > b + SCAN_HORIZON) continue;
			cnt60++;
			if (o.rep.dir !== e.rep.dir) opp60++;
		}
		if (cnt60 > 0) withOther60++;
		if (opp60 > 0) withOpposite60++;
		if (!(fr !== null && fr <= SCAN_HORIZON)) {
			unreached++;
			if (opp60 > 0) unreachedWithOpposite++;
		}
		if (e.rep.bodyBackInside === null) bodyNa++;
		else if (e.rep.bodyBackInside) {
			bodyTrue++;
			if (isSelf && fr !== null && fr <= SCAN_HORIZON) bodyTrueSelfReach++;
		} else {
			bodyFalse++;
			if (isSelf && fr !== null && fr <= SCAN_HORIZON) bodyFalseSelfReach++;
		}
		if (series) {
			const nb = nullBenchmark(series.candles, e.rep.dist, e.rep.dir);
			nullTrials += nb.trials;
			for (let n = 0; n < N_LEVELS.length; n++) nullHits[n] += nb.hits[n];
		}
	}

	allReach.sort((a, b) => a - b);
	selfReach.sort((a, b) => a - b);
	const maxSelf = selfReach.length > 0 ? selfReach[selfReach.length - 1] : null;
	const nextAboveSelfMax = maxSelf === null ? null : (allReach.find((v) => v > maxSelf) ?? null);

	return {
		label,
		authoritative,
		raw,
		entities: ents.length,
		population: population.length,
		motions: new Set(ents.map((e) => e.rep.motionKey)).size,
		motionsPopulation: new Set(population.map((e) => e.rep.motionKey)).size,
		censored,
		reached: reachByN[N_LEVELS.length - 1],
		selfReached: selfReachByN[N_LEVELS.length - 1],
		reachByN,
		selfReachByN,
		nullTrials,
		nullHits,
		reachedCountAll: allReach.length,
		reachedCountSelf: selfReach.length,
		quantilesAll: QUANTILES.map((q) => quantile(allReach, q)),
		quantilesSelf: QUANTILES.map((q) => quantile(selfReach, q)),
		maxAll: allReach.length > 0 ? allReach[allReach.length - 1] : null,
		maxSelf,
		nextAboveSelfMax,
		withOther60,
		withOpposite60,
		unreached,
		unreachedWithOpposite,
		bodyNa,
		bodyTrue,
		bodyFalse,
		bodyTrueSelfReach,
		bodyFalseSelfReach,
		reachedList: reachedList.sort((a, b) => a.firstReach - b.firstReach || a.type.localeCompare(b.type)),
	};
}

// ── 自己検算 ──

interface SelfCheckOut {
	entities: number;
	population: number;
	reached: number;
	over20: string[];
	selfReached: number;
	selfReachMax: number | null;
	contributionOfRealA: { entities: number; population: number; reached: number; avails: number[] };
	acceptedOnly: { entities: number; population: number; reached: number };
}

const SELF_CHECK_EXPECT = {
	entities: 40,
	population: 27,
	reached: 18,
	over20: [
		'rising_wedge@40',
		'rising_wedge@40',
		'triangle_ascending@47',
		'triangle_descending@22',
		'triangle_descending@37',
		'triangle_descending@37',
	],
} as const;

/**
 * issue #288 本文の予備監査と同じ切り出し（実データ全系列 / ネイティブ時間足 / 既定 `swingDepth` /
 * 窓はフル）で {@link SELF_CHECK_EXPECT} を再現する。**数字を 1 つも出す前に走り、合わなければ例外。**
 *
 * **母集団は `invalid` / `expired` を含む**（{@link NON_ACCEPTED_STATUSES} の docstring を参照。
 * 予備監査の 6 件のうち 3 件が `status: 'invalid'` の `triangle_descending` なので、
 * accepted だけに絞ると検算が成立しない）。accepted だけに絞った場合の値も
 * {@link SelfCheckOut.acceptedOnly} に入れて報告する——**これは検算の対象ではなく、
 * 主表（accepted のみ）と予備監査の差がどこから来るかを示すための対照**。
 *
 * 本体の集計とは**独立に**組んである（コーパスの組み方や `--no-rolling` に影響されない）。
 */
function runSelfCheck(): SelfCheckOut {
	const series = realSeries();
	const counters: ExtractCounters = {
		patterns: 0,
		forming: 0,
		nonAccepted: 0,
		noBreakoutIdx: 0,
		noDirection: 0,
		noTarget: 0,
		invalidPrice: 0,
	};
	const evs: Ev[] = [];
	for (const s of series) {
		evs.push(
			...eventsOfCase(
				{ series: s, tf: s.tf, swingDepth: undefined, windowEnd: s.candles.length - 1, rolling: false },
				counters,
			),
		);
	}
	const ents = [...buildEntities(evs).values()];
	const population = ents.filter((e) => e.rep.avail >= SCAN_HORIZON);
	const reached = population.filter((e) => e.rep.firstReach !== null && (e.rep.firstReach as number) <= SCAN_HORIZON);
	const over20 = reached
		.filter((e) => (e.rep.firstReach as number) > 20)
		.map((e) => `${e.rep.type}@${e.rep.firstReach}`)
		.sort();
	const fail = (what: string, got: unknown, want: unknown): never => {
		throw new Error(
			`自己検算に失敗: ${what} が ${JSON.stringify(got)}（期待 ${JSON.stringify(want)}）。` +
				'issue #288 の予備監査と同じ切り出しで同じ値が出ないので、以降の数字は出さない。',
		);
	};
	if (ents.length !== SELF_CHECK_EXPECT.entities) fail('実体イベント数', ents.length, SELF_CHECK_EXPECT.entities);
	if (population.length !== SELF_CHECK_EXPECT.population) {
		fail(`avail >= ${SCAN_HORIZON} の実体数`, population.length, SELF_CHECK_EXPECT.population);
	}
	if (reached.length !== SELF_CHECK_EXPECT.reached) fail('到達数', reached.length, SELF_CHECK_EXPECT.reached);
	if (over20.join(', ') !== SELF_CHECK_EXPECT.over20.join(', ')) {
		fail('firstReach > 20 の内訳', over20, [...SELF_CHECK_EXPECT.over20]);
	}

	// 参考値（検算の対象ではない）: 自力到達と、実データ A の寄与。
	let selfReached = 0;
	let selfReachMax: number | null = null;
	for (const e of reached) {
		if (otherBreakoutsBefore(e, ents).count > 0) continue;
		selfReached++;
		const fr = e.rep.firstReach as number;
		if (selfReachMax === null || fr > selfReachMax) selfReachMax = fr;
	}
	const a = ents.filter((e) => e.rep.group === 'realA');
	const acc = [...buildEntities(evs.filter((e) => e.accepted)).values()];
	const accPop = acc.filter((e) => e.rep.avail >= SCAN_HORIZON);
	return {
		acceptedOnly: {
			entities: acc.length,
			population: accPop.length,
			reached: accPop.filter((e) => e.rep.firstReach !== null && (e.rep.firstReach as number) <= SCAN_HORIZON).length,
		},
		entities: ents.length,
		population: population.length,
		reached: reached.length,
		over20,
		selfReached,
		selfReachMax,
		contributionOfRealA: {
			entities: a.length,
			population: a.filter((e) => e.rep.avail >= SCAN_HORIZON).length,
			// **母集団の中での到達**（`avail` が足りない構造の「到達した」は打ち切りなので数えない）。
			reached: a.filter(
				(e) => e.rep.avail >= SCAN_HORIZON && e.rep.firstReach !== null && (e.rep.firstReach as number) <= SCAN_HORIZON,
			).length,
			avails: a.map((e) => e.rep.avail).sort((x, y) => x - y),
		},
	};
}

// ── 出力の小道具 ──

const pctStr = (num: number, den: number): string => (den === 0 ? '—' : `${((num / den) * 100).toFixed(1)}%`);
const se = (num: number, den: number): number | null => {
	if (den === 0) return null;
	const p = num / den;
	return Math.sqrt((p * (1 - p)) / den);
};
const sePctStr = (num: number, den: number): string => {
	const v = se(num, den);
	return v === null ? '—' : `${(v * 100).toFixed(1)}pt`;
};
const numOr = (v: number | null, suffix = ''): string => (v === null ? '—' : `${v}${suffix}`);

// ── main ──

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const jsonAt = argv.indexOf('--json');
	const jsonPath = jsonAt >= 0 ? (argv[jsonAt + 1] ?? null) : null;
	// **引数の検査は計測の前に置く**（#245 と同じ。回しきってから何も書かずに終わるのを防ぐ）。
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
	const counters: ExtractCounters = {
		patterns: 0,
		forming: 0,
		nonAccepted: 0,
		noBreakoutIdx: 0,
		noDirection: 0,
		noTarget: 0,
		invalidPrice: 0,
	};
	const seriesByName = new Map<string, Series>();
	const evs: Ev[] = [];
	let caseCount = 0;
	for (const part of corpus) {
		for (const spec of part.cases) {
			caseCount++;
			seriesByName.set(spec.series.name, spec.series);
			evs.push(...eventsOfCase(spec, counters));
		}
	}

	// **実体は scope ごとに別々に畳む。** accepted だけの集合と `invalid` / `expired` を含む集合では
	// 代表（コーパス順で最初に見た系列）が変わりうるので、畳んでから絞ると母集団が黙ってずれる。
	const acceptedEnts = [...buildEntities(evs.filter((e) => e.accepted)).values()];
	const allStatusEnts = [...buildEntities(evs).values()];

	/** 集計ユニット（**プールしない**）。実体は timeline ごと、`status` の scope ごとに出す。 */
	const units: UnitStats[] = [];
	const pick = (pool: readonly Ent[], where: (e: Ent) => boolean): Ent[] => pool.filter(where);
	const is1hour = (e: Ent): boolean => e.rep.timeline === 'real|1hour';
	const is1day = (e: Ent): boolean => e.rep.timeline === 'real|1day';
	const isSynth = (e: Ent): boolean => e.rep.group === 'synthetic';
	units.push(
		computeUnit('実データ 1hour（B / C / D）/ accepted のみ', true, pick(acceptedEnts, is1hour), seriesByName),
	);
	units.push(
		computeUnit(
			'実データ 1hour（B / C / D）/ `invalid`・`expired` 込み',
			true,
			pick(allStatusEnts, is1hour),
			seriesByName,
		),
	);
	units.push(computeUnit('実データ 1day（A）/ accepted のみ', true, pick(acceptedEnts, is1day), seriesByName));
	units.push(
		computeUnit('実データ 1day（A）/ `invalid`・`expired` 込み', true, pick(allStatusEnts, is1day), seriesByName),
	);
	units.push(computeUnit('合成 fixture / accepted のみ（参考）', false, pick(acceptedEnts, isSynth), seriesByName));
	const main1hour = units[0];
	const main1day = units[2];
	const allEnts = allStatusEnts;

	// ── §0 検算 ──
	say('# issue #288 Phase 1: ターゲット到達の走査窓を実データで検証する');
	say();
	say(`生成: ${nowIso()}`);
	say();
	say(
		'**計測のみ。** 検出器・`tools/patterns/target-reach.ts` の定数・表示・ベースラインは 1 行も変えていない。' +
			`走査窓の現行値は \`TARGET_REACH_MAX_BARS\` = **${SCAN_HORIZON}** を本体から読んでいる（写していない）。`,
	);
	say();
	say('## 0. 検算');
	say();
	say(`- **ケース数**: ${caseCount}${includeRolling ? '' : '（`--no-rolling`）'}`);
	for (const part of corpus) say(`  - ${part.label}: ${part.cases.length}`);
	say(
		`- **検出されたパターン**: ${counters.patterns} 件。うち \`forming\` ${counters.forming} 件はブレイク足を持たないので除外、` +
			`\`invalid\` / \`expired\` ${counters.nonAccepted} 件は**イベントにはするが accepted からは外す**（§1-3）`,
	);
	say(
		`- **イベントにできなかったパターン**: ブレイク足 idx なし ${counters.noBreakoutIdx} / ` +
			`方向なし ${counters.noDirection} / target なし ${counters.noTarget} / ブレイク足の終値が非有限 ${counters.invalidPrice}`,
	);
	say(`- **イベント**: 延べ ${evs.length} / 実体 ${allEnts.length}`);
	say();
	say('### 0-1. 自己検算（issue #288 本文の予備監査と同じ切り出し）');
	say();
	say(
		'実データ全系列（A / B / C / D）× ネイティブ時間足 × 既定 `swingDepth` × フル窓で、' +
			`実体 **${selfCheck.entities}** / \`avail ≥ ${SCAN_HORIZON}\` が **${selfCheck.population}** / ` +
			`到達（\`firstReach ≤ ${SCAN_HORIZON}\`）が **${selfCheck.reached}**。` +
			`到達のうち \`firstReach > 20\` は **${selfCheck.over20.length} 件**で ${selfCheck.over20.join(' / ')}。`,
	);
	say();
	say(
		'**issue 本文は「実データ B / C / D の全 365 本窓」と書いているが、実体 40 に届くには ' +
			`実データ A（1day 90 本）の ${selfCheck.contributionOfRealA.entities} 件が要る。** A の寄与は ` +
			`\`avail ≥ ${SCAN_HORIZON}\` が ${selfCheck.contributionOfRealA.population} 件 / 母集団内の到達が ` +
			`${selfCheck.contributionOfRealA.reached} 件、つまり **${SELF_CHECK_EXPECT.population} / ${SELF_CHECK_EXPECT.reached} / ` +
			`${SELF_CHECK_EXPECT.over20.length} は B / C / D だけで測ったときと完全に一致する**` +
			`（A の \`avail\` は ${selfCheck.contributionOfRealA.avails.join(' / ')} で、どれも母集団に入らない）。`,
	);
	say();
	say(
		`参考（検算の対象外）: この切り出しでの自力到達は **${selfCheck.selfReached} 件**、その最大 \`firstReach\` は ` +
			`**${numOr(selfCheck.selfReachMax)}**。issue 本文の予備監査は 12 件と報告しているが、` +
			'`otherBreakoutsBefore` の「同一系列」を実体側でどう解決するか（B / C / D が重なる履歴なので、' +
			'実体は絶対時刻で 1 本に畳んである）が issue 本文で確定していないため 1 件ぶんずれる。' +
			'**質的な境界の主張（自力到達の最大が 20 本、20 本超の到達は全件が別パターン経由）はそのまま成り立つ。**',
	);
	say();

	// ── §1 母集団 ──
	say('## 1. 母集団');
	say();
	say(
		'**延べ**は accepted 出力 1 件を 1 と数えたもの、**実体**は ' +
			'`(timeline, type, ブレイク足の絶対時刻, 方向, target を丸めた値)` で畳んだもの。' +
			'実データ B / C / D は**同じ 1 時間足履歴の重なる窓**なので実体は 1 本の timeline に畳んである' +
			'（系列別に数えると同じ値動きを最大 3 回数える）。**pool はしない**——1hour / 1day / 合成は別の表で出す。',
	);
	say();
	say('### 1-1. group 別の延べ');
	say();
	say('| group | 時間足 | 延べイベント | 実体（この group に現れたもの） |');
	say('|---|---|---:|---:|');
	for (const g of ['realA', 'realB', 'realC', 'realD', 'synthetic'] as const) {
		const rawN = evs.filter((e) => e.group === g).length;
		const entN = allEnts.filter((e) => e.groups.has(g)).length;
		const tf = g === 'realA' ? '1day' : g === 'synthetic' ? '1day / 1hour（ラベル）' : '1hour';
		say(`| \`${g}\` | ${tf} | ${rawN} | ${entN} |`);
	}
	say();
	say('### 1-2. 到達率の母集団（実体）');
	say();
	say(
		`\`avail\`（ブレイク足の後に**系列**に残る本数）が ${SCAN_HORIZON} 本以上のイベントだけを到達率の母集団にする。` +
			'足りないものは**打ち切り**として別に数える（未到達と混ぜない）。',
	);
	say();
	say(
		`| 単位 | 延べ | 実体 | 値動き | \`avail ≥ ${SCAN_HORIZON}\`（母集団） | 母集団の値動き | 打ち切り | ` +
			`到達（≤ ${SCAN_HORIZON}） | 自力到達 |`,
	);
	say('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
	for (const u of units) {
		say(
			`| ${u.label}${u.authoritative ? '' : ' ⚠️'} | ${u.raw} | ${u.entities} | ${u.motions} | ${u.population} | ` +
				`${u.motionsPopulation} | ${u.censored} | ${u.reached} | ${u.selfReached} |`,
		);
	}
	say();
	say(
		'**値動き**は実体キーから `target` を落とした `(timeline, type, ブレイク足の絶対時刻, 方向)`。' +
			'実体キーは issue #288 の定義どおり `target` を含むので、**同じ値動きでも窓の長さでパターン高さが変わると' +
			'別実体になる**（B / C / D は重なる履歴なので常に起きる）。' +
			'**§4 の n は実体で数えているが、独立な標本数の上限は値動きの方**——SE はその意味でも楽観的。',
	);
	say();
	if (main1day.population === 0) {
		say(
			`**実データ 1day（A）は \`avail ≥ ${SCAN_HORIZON}\` のイベントが 0 件なので評価不能。** ` +
				`系列が 90 本しかなく、${SCAN_HORIZON} 本先が揃うにはブレイク足が idx ≤ ${89 - SCAN_HORIZON} に来る必要がある。` +
				'**「1day でも 60 で問題ない」ではなく「1day では測れていない」と読むこと**（#228 と同じ但し書き）。',
		);
	} else {
		say(`実データ 1day（A）の母集団は ${main1day.population} 件。**n が小さいので単独では結論に使わない。**`);
	}
	say();

	say('### 1-3. `status` の 2 系統を分けて出す理由');
	say();
	say(
		'issue #288 本文の 2 箇所が食い違っている。「イベントの抽出」節は **accepted（`invalid` / `forming` は除く）**' +
			'と書いているが、「自己検算」節が固定した予備監査の値は **`invalid` を入れないと 1 つも再現しない**——' +
			'`firstReach > 20` の 6 件のうち 3 件（`triangle_descending@22` / `@37` / `@37`）は' +
			"すべて `status: 'invalid'`（下降三角形が上に抜けた形）だから。" +
			`accepted だけに絞った同じ切り出しは実体 ${selfCheck.acceptedOnly.entities} / 母集団 ` +
			`${selfCheck.acceptedOnly.population} / 到達 ${selfCheck.acceptedOnly.reached} になる。`,
	);
	say();
	say(
		'どちらかを選ぶと「本文どおりにしたら検算が落ちる」か「検算を通したら本文と違う母集団」になるので、' +
			'**両方を別ユニットとして出す**。主表は本文の定義どおり **accepted のみ**。' +
			'**`invalid` を出力から締め出しているわけではない**点に注意——`detect_patterns` は ' +
			'`includeInvalid: true` で `invalid` を返し、そのとき `targetReachedPct` も一緒に出る。' +
			'つまり走査窓の上限は `invalid` なパターンにも効いている。**どちらの母集団で Phase 2 を判断するかは決めない。**',
	);
	say();

	// ── §2 firstReach の分布 ──
	say('## 2. `firstReach` の分布');
	say();
	say(
		'**`firstReach` は系列末尾まで走査している**（60 で打ち切っていない）ので、60 本超の到達もこの表に入る。' +
			'分位は「到達したイベント」だけの条件付き分布——#210 が 96.3% を出したのと同じ形の量で、' +
			`**到達率ではない**（到達率は §4）。母集団は \`avail ≥ ${SCAN_HORIZON}\` の実体。`,
	);
	say();
	say('| 単位 | 系列 | n | p50 | p75 | p90 | p95 | max |');
	say('|---|---|---:|---:|---:|---:|---:|---:|');
	for (const u of units) {
		const tag = u.authoritative ? '' : ' ⚠️';
		say(
			`| ${u.label}${tag} | 全到達 | ${u.reachedCountAll} | ${numOr(u.quantilesAll[0])} | ${numOr(u.quantilesAll[1])} | ` +
				`${numOr(u.quantilesAll[2])} | ${numOr(u.quantilesAll[3])} | ${numOr(u.maxAll)} |`,
		);
		say(
			`| ${u.label}${tag} | 自力到達 | ${u.reachedCountSelf} | ${numOr(u.quantilesSelf[0])} | ` +
				`${numOr(u.quantilesSelf[1])} | ${numOr(u.quantilesSelf[2])} | ${numOr(u.quantilesSelf[3])} | ` +
				`${numOr(u.maxSelf)} |`,
		);
	}
	say();

	// ── §3 自力到達の上側（境界がどこで割れるか） ──
	say('## 3. 自力到達の上側（境界がどこで割れるか）');
	say();
	say(
		'**Phase 2 で上限値を動かすなら根拠になる行。** 自力到達（`otherBreakoutsBefore` が空）の ' +
			'`firstReach` の最大値と、全到達の中でそれより大きい**最小**の値を並べる。' +
			'2 つの値の間が「自力で届く範囲」と「別パターンを経由した到達」の割れ目。',
	);
	say();
	say('| 単位 | 自力到達 n | 自力到達の max | その 1 つ上（全到達） | 割れ目 |');
	say('|---|---:|---:|---:|---|');
	for (const u of units) {
		const tag = u.authoritative ? '' : ' ⚠️';
		const gap = u.maxSelf === null || u.nextAboveSelfMax === null ? '—' : `(${u.maxSelf}, ${u.nextAboveSelfMax}]`;
		say(`| ${u.label}${tag} | ${u.reachedCountSelf} | ${numOr(u.maxSelf)} | ${numOr(u.nextAboveSelfMax)} | ${gap} |`);
	}
	say();
	say('### 3-1. 主表（実データ 1hour 実体）の到達の内訳');
	say();
	if (main1hour.reachedList.length === 0) {
		say('到達 0 件。');
	} else {
		say('| `firstReach` | type | ブレイク足（UTC） | 自力 |');
		say('|---:|---|---|---|');
		for (const r of main1hour.reachedList) {
			say(`| ${r.firstReach} | \`${r.type}\` | ${r.iso.replace('.000Z', 'Z')} | ${r.self ? '○' : '—'} |`);
		}
	}
	say();

	// ── §4 到達率と帰無ベンチマーク ──
	say('## 4. 到達率と帰無ベンチマーク');
	say();
	say(
		`**帰無**は同系列・同方向・同 \`dist\` のターゲットを「${SCAN_HORIZON} 本先が揃う全バー」を起点に置いたときの到達率。` +
			'起点バー自身を 0 本目に含めるのはパターン側と同じ。' +
			'**起点は重なっているので独立ではない**——下の二項 SE は「同じ本数の独立試行だったら」という' +
			'下限の目安で、真の分散はこれより大きい。差の SE は 2 つの SE の二乗和の平方根。',
	);
	say();
	for (const u of units) {
		const tag = u.authoritative ? '' : ' ⚠️';
		if (u.population === 0) {
			say(`### ${u.label}${tag}`);
			say();
			say(`母集団 0 件（\`avail ≥ ${SCAN_HORIZON}\` を満たす実体が無い）ので **評価不能**。`);
			say();
			continue;
		}
		say(`### ${u.label}${tag}（母集団 n = ${u.population}、帰無の試行 m = ${u.nullTrials}）`);
		say();
		say('| N | 全到達 | SE | 自力到達 | SE | 帰無 | SE | 全到達 − 帰無 | 差の SE |');
		say('|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
		for (let i = 0; i < N_LEVELS.length; i++) {
			const n = u.population;
			const m = u.nullTrials;
			const pAll = u.reachByN[i] / n;
			const pNull = m === 0 ? Number.NaN : u.nullHits[i] / m;
			const seAll = se(u.reachByN[i], n) ?? 0;
			const seNull = se(u.nullHits[i], m) ?? 0;
			const diff = Number.isFinite(pNull) ? `${((pAll - pNull) * 100).toFixed(1)}pt` : '—';
			const seDiff = Number.isFinite(pNull) ? `${(Math.sqrt(seAll ** 2 + seNull ** 2) * 100).toFixed(1)}pt` : '—';
			say(
				`| ${N_LEVELS[i]} | ${u.reachByN[i]}/${n} = ${pctStr(u.reachByN[i], n)} | ${sePctStr(u.reachByN[i], n)} | ` +
					`${u.selfReachByN[i]}/${n} = ${pctStr(u.selfReachByN[i], n)} | ${sePctStr(u.selfReachByN[i], n)} | ` +
					`${pctStr(u.nullHits[i], m)} | ${sePctStr(u.nullHits[i], m)} | ${diff} | ${seDiff} |`,
			);
		}
		say();
	}

	// ── §5 交絡 ──
	say(`## 5. 交絡（走査窓 (0, ${SCAN_HORIZON}] に他パターンのブレイクが挟まるか）`);
	say();
	say(
		`区間は**現行の走査窓に固定**した \`(ブレイク, +${SCAN_HORIZON}]\`。` +
			'`otherBreakoutsBefore` の区間は到達で打ち切るので、窓の中に何本あるかはこちらで数える。',
	);
	say();
	say('| 単位 | 母集団 | 他ブレイクあり | うち逆方向あり | 未到達 | 未到達のうち逆方向あり |');
	say('|---|---:|---:|---:|---:|---:|');
	for (const u of units) {
		const tag = u.authoritative ? '' : ' ⚠️';
		say(
			`| ${u.label}${tag} | ${u.population} | ${u.withOther60} (${pctStr(u.withOther60, u.population)}) | ` +
				`${u.withOpposite60} (${pctStr(u.withOpposite60, u.population)}) | ${u.unreached} | ` +
				`${u.unreachedWithOpposite} (${pctStr(u.unreachedWithOpposite, u.unreached)}) |`,
		);
	}
	say();

	// ── §6 bodyBackInside1_2 ──
	say('## 6. `bodyBackInside1_2`（ブレイク後 1 / 2 本目の終値が線の内側に戻ったか）');
	say();
	say(
		'線の値は `aftermath.ts` の `necklineValue`（2 点の線形補間、区間外はクランプ）で取る。' +
			'**`wedge_*` / `pennant` / `flag` は `neckline` を出さないので `n/a`。** 到達率は自力到達ベース。',
	);
	say();
	say('| 単位 | 母集団 | n/a | 戻った | うち自力到達 | 戻らなかった | うち自力到達 |');
	say('|---|---:|---:|---:|---:|---:|---:|');
	for (const u of units) {
		const tag = u.authoritative ? '' : ' ⚠️';
		say(
			`| ${u.label}${tag} | ${u.population} | ${u.bodyNa} | ${u.bodyTrue} | ` +
				`${u.bodyTrueSelfReach} (${pctStr(u.bodyTrueSelfReach, u.bodyTrue)}) | ${u.bodyFalse} | ` +
				`${u.bodyFalseSelfReach} (${pctStr(u.bodyFalseSelfReach, u.bodyFalse)}) |`,
		);
	}
	say();
	say('**決定はしていない。** Phase 2 の選択肢の比較は `docs/internal/target-reach-window-288.md` を参照。');
	say();

	const text = out.join('\n');
	process.stdout.write(`${text}\n`);
	if (jsonPath) {
		writeFileSync(jsonPath, `${JSON.stringify({ generatedAt: nowIso(), caseCount, selfCheck, units }, null, 2)}\n`);
	}
}

main().catch((e) => {
	process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
	process.exit(1);
});
