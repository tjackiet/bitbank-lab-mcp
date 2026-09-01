/**
 * issue #178 項目 4 — double の「同水準」判定に高さ相対の hard gate を足した件の回帰テスト。
 *
 * 元の欠陥は triple（#138 / PR #176）とまったく同じ形で、**同水準を価格水準の % だけで
 * 測っていた**こと（`near` の `tolerancePct` と `isSameLevel` の `DOUBLE_LEVEL_MAX_PCT`。
 * どちらも分母が価格水準で、パターン自身の高さと無関係）。
 *
 * ## double では指標が意味を持つ（H&S との違い）
 *
 * `mainPoints = [山1, 山2]` / `allPoints = [山1, 谷, 山2]` なので **分子の端点が分母の端点**。
 * `spreadRatio` は「2 山の差がパターンの深さの何割か」という自己完結した命題になる。
 * H&S（#178 項目 3）で同じゲートを足さなかったのは、あちらは `heightAbs` が頭と谷で決まり
 * **肩（分子）が分母の端点にならない**ため指標として意味が薄いから。
 *
 * ## 本テストが固定するもの
 *
 * 1. `validateLevelDiff` の閾値・境界・欠損時の挙動（triple の `validateLevelSpread` と同一式）
 * 2. **理由コードの語彙が triple と別**であること（#193 / PR #194 の `▼ reason 横断合計` で
 *    「3 点のばらつき」と「2 点の差」が 1 つの数字に潰れないようにするため）
 * 3. 完成済み 4 経路（strict top / strict bottom / relaxed top / relaxed bottom）で効くこと
 * 4. **呼び出し位置が最後**であること——手前の検査で落ちる候補の `reason` を横取りしない
 * 5. `spreadRatio` の上界が **時間足に依らず 1.0** であること（#178 項目 4 の測定の中核。
 *    「`1hour` では 4.8 倍ずれた double が通りえる」という理論上界は到達不能）
 */
import { describe, expect, it, vi } from 'vitest';
import { dayjs } from '../../lib/datetime.js';
import { getSizeThresholdsForTf } from '../../tools/patterns/config.js';
import {
	DOUBLE_LEVEL_MAX_PCT,
	levelSpreadMetrics,
	MAX_LEVEL_SPREAD_RATIO,
	relDiff,
	validateLevelDiff,
	validateLevelSpread,
	validatePatternSize,
} from '../../tools/patterns/structural.js';
import { asMockResult } from '../_assertResult.js';

vi.mock('../../tools/analyze_indicators.js', () => ({ default: vi.fn() }));

import analyzeIndicators from '../../tools/analyze_indicators.js';
import detectPatterns from '../../tools/detect_patterns.js';

type Candidate = { type: string; accepted: boolean; reason?: string; details?: Record<string, number | null> };

/**
 * ヒゲ 0 のローソク（`extremePrice === price`）。
 *
 * **ヒゲを付けると `heightAbs`（高安基準）だけが伸びて `spreadRatio`（分子は終値基準）が
 * 下がる**ので、ゲートを踏ませたい合成データではヒゲ 0 が最も条件が厳しい側になる。
 */
function mkCandle(i: number, close: number) {
	return {
		isoTime: dayjs.utc('2026-01-01T00:00:00Z').add(i, 'hour').toISOString(),
		open: close,
		high: close,
		low: close,
		close,
		volume: 100,
	};
}

async function detectOn(closes: number[], opts: { tf?: string; swingDepth?: number } = {}) {
	const candles = closes.map((c, i) => mkCandle(i, c));
	vi.mocked(analyzeIndicators).mockResolvedValueOnce(
		asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
	);
	const res = (await detectPatterns('btc_jpy', opts.tf ?? '1hour', candles.length, {
		swingDepth: opts.swingDepth ?? 2,
		includeCompleted: true,
		includeForming: false,
		view: 'debug',
	})) as {
		data?: { patterns?: Array<{ type: string }> };
		meta?: { debug?: { candidates?: Candidate[] } };
	};
	return { patterns: res.data?.patterns ?? [], candidates: res.meta?.debug?.candidates ?? [] };
}

/**
 * 完成済み double top が成立する 1時間足の系列。**2 山の差 2.5 がパターン高さ 4 の 62.5%**。
 *
 * 山1 = 100（idx 10）/ 谷 = 96（idx 13）/ 山2 = 97.5（idx 16）/ ネックライン下抜け = 94（idx 19）。
 * 先行安値 88（idx 4）で戻り率 4 / 12 = 0.33（帯 [0.2, 0.9] の中）。
 *
 * **既存のゲートはすべて通る**: `spreadPct` 2.5% ≤ `DOUBLE_LEVEL_MAX_PCT` 3%、
 * `near` は `tolerancePct`（1hour の tf-auto = 5%）で通る、サイズ検査は
 * `heightPct` 4% ≥ 0.62% / 谷の深さ 2.8% ≥ 1.04%。**本ゲートを外すと confidence 0.67 で検出される。**
 *
 * `1hour` である必要がある。`1day` は `MIN_DEPTH_PCT = 5%` と `DOUBLE_LEVEL_MAX_PCT = 3%` の
 * 組み合わせで `spreadRatio > 0.5` が**幾何的に成立しない**（後述の unreachable テスト）。
 */
const HIGH_DIFF_DOUBLE_TOP = [
	95, 93, 91, 89, 88, 90, 92, 94, 96, 98, 100, 99, 97.5, 96, 96.5, 97, 97.5, 96, 95, 94, 93, 92, 91, 90,
];
/** {@link HIGH_DIFF_DOUBLE_TOP} の鏡像（`200 - x`）。谷1 = 100 / 山 = 104 / 谷2 = 102.5。 */
const HIGH_DIFF_DOUBLE_BOTTOM = HIGH_DIFF_DOUBLE_TOP.map((x) => 200 - x);

describe('validateLevelDiff（issue #178 項目 4）', () => {
	const metricsWithRatio = (ratio: number | null) => ({
		spreadAbs: 0,
		spreadPct: 0,
		heightAbs: 1,
		heightPct: 0,
		spreadRatio: ratio,
	});

	it('閾値は triple と同じ MAX_LEVEL_SPREAD_RATIO（0.5）を使い、専用の定数を作らない', () => {
		expect(MAX_LEVEL_SPREAD_RATIO).toBe(0.5);
		expect(validateLevelDiff('top', metricsWithRatio(0.5))).toBeNull();
	});

	it('閾値ちょうどは通し、超えたところで落とす（off-by-one）', () => {
		expect(validateLevelDiff('top', metricsWithRatio(MAX_LEVEL_SPREAD_RATIO))).toBeNull();
		expect(validateLevelDiff('top', metricsWithRatio(MAX_LEVEL_SPREAD_RATIO + 1e-9))).toBe(
			'peaks_diff_vs_height_excess',
		);
		expect(validateLevelDiff('bottom', metricsWithRatio(MAX_LEVEL_SPREAD_RATIO + 1e-9))).toBe(
			'valleys_diff_vs_height_excess',
		);
	});

	it('比を出せない候補は落とさない（判定材料が無いものを弾かない）', () => {
		expect(validateLevelDiff('top', metricsWithRatio(null))).toBeNull();
		expect(validateLevelDiff('bottom', metricsWithRatio(Number.NaN))).toBeNull();
	});

	it('maxRatio は経路ごとに上書きできる', () => {
		expect(validateLevelDiff('top', metricsWithRatio(0.6), 0.7)).toBeNull();
		expect(validateLevelDiff('top', metricsWithRatio(0.6), 0.5)).toBe('peaks_diff_vs_height_excess');
	});

	// #193 / PR #194 の `▼ reason 横断合計` は type を畳んで reason だけで合算するので、
	// triple と語彙を共有すると「3 山のばらつき」と「2 山の差」が 1 行に潰れる。
	it('理由コードの語彙が triple（validateLevelSpread）と重ならない', () => {
		const over = metricsWithRatio(0.9);
		const doubleCodes = [validateLevelDiff('top', over), validateLevelDiff('bottom', over)];
		const tripleCodes = [validateLevelSpread('top', over), validateLevelSpread('bottom', over)];
		expect(doubleCodes).toEqual(['peaks_diff_vs_height_excess', 'valleys_diff_vs_height_excess']);
		expect(new Set([...doubleCodes, ...tripleCodes]).size).toBe(4);
	});

	it('判定式は validateLevelSpread と同一（違うのは語彙だけ）', () => {
		for (const ratio of [0, 0.49999, 0.5, 0.50001, 0.9, null, Number.NaN]) {
			const m = metricsWithRatio(ratio);
			expect(validateLevelDiff('top', m) === null).toBe(validateLevelSpread('top', m) === null);
		}
	});
});

describe('levelSpreadMetrics: double 形状の性質（issue #178 項目 4 の測定根拠）', () => {
	const main = (price: number) => ({ price });
	const all = (extremePrice: number) => ({ extremePrice });

	// double では `mainPoints` が 2 点なので `spreadPct` は `isSameLevel` が見る量そのもの。
	// triple（3 点のばらつき）と違い、**ゲートしている量と診断値が一致する**。
	it('spreadPct は isSameLevel が見る relDiff と一致する', () => {
		const m = levelSpreadMetrics([main(100), main(97.5)], [all(100), all(96), all(97.5)]);
		expect(m.spreadPct).toBeCloseTo(relDiff(100, 97.5), 12);
	});

	it('主構成点が全構成点に含まれるので spreadRatio の上界は 1.0（時間足に依らない）', () => {
		// 分子の端点（2 山の終値）は分母の帯 [lo, hi] の中にあるので spreadAbs <= heightAbs。
		// 「DOUBLE_LEVEL_MAX_PCT 3% ÷ getSizeThresholdsForTf('1hour').heightPct 0.62% = 4.8」
		// という上界は**到達不能**で、時間足別の maxRatio を持つ根拠にならない。
		const cases: Array<[number[], number[]]> = [
			[
				[100, 97.5],
				[100, 96, 97.5],
			],
			[
				[100, 97],
				[100, 96.9, 97],
			],
			[
				[100, 70],
				[100, 30, 70],
			],
		];
		for (const [peaks, extremes] of cases) {
			const m = levelSpreadMetrics(peaks.map(main), extremes.map(all));
			expect(m.spreadRatio).not.toBeNull();
			expect(m.spreadRatio as number).toBeLessThanOrEqual(1);
		}
	});
});

describe('完成済み double への配線（strict / relaxed の 4 経路）', () => {
	it('strict double_top を落とし、relaxed fallback も同じゲートで落とす', async () => {
		const { patterns, candidates } = await detectOn(HIGH_DIFF_DOUBLE_TOP);

		const hits = candidates.filter((c) => c.type === 'double_top' && c.reason === 'peaks_diff_vs_height_excess');
		// strict が落とす → relaxed fallback が同じ 3 点を拾い直す → そこでも落ちる。
		// **relaxed に配線しないと `_fallback` 付きで同じパターンが出てしまう**（#176 の triple と同じ構造）。
		expect(hits).toHaveLength(2);
		expect(patterns.filter((p) => p.type === 'double_top')).toHaveLength(0);

		expect(hits[0].details).toMatchObject({
			spreadAbs: 2.5,
			heightAbs: 4,
			spreadRatio: 0.625,
			// 同水準判定の実効値は min(tolerancePct=0.05, DOUBLE_LEVEL_MAX_PCT=0.03)。
			levelTolerancePct: 0.03,
		});
	});

	it('strict double_bottom を落とし、relaxed fallback も同じゲートで落とす（top と対称）', async () => {
		const { patterns, candidates } = await detectOn(HIGH_DIFF_DOUBLE_BOTTOM);

		const hits = candidates.filter((c) => c.type === 'double_bottom' && c.reason === 'valleys_diff_vs_height_excess');
		expect(hits).toHaveLength(2);
		expect(patterns.filter((p) => p.type === 'double_bottom')).toHaveLength(0);
		expect(hits[0].details).toMatchObject({ spreadAbs: 2.5, heightAbs: 4, spreadRatio: 0.625 });
	});

	// 理由コードに `_relaxed` 接尾辞を付けない。detect_doubles の `_relaxed` 接尾辞は
	// **閾値が違う検査**（`peaks_not_equal` は tolerancePct、`_relaxed` は tolerancePct × 1.3）に
	// 付いているもので、本ゲートは strict / relaxed で同じ MAX_LEVEL_SPREAD_RATIO を使う。
	// `reclassified_as_triple_top` / `prior_trend_mismatch:` が既に両経路で無印なのと同じ扱い。
	it('strict と relaxed で同じ理由コードを使う（閾値が同じなので接尾辞で分けない）', async () => {
		const { candidates } = await detectOn(HIGH_DIFF_DOUBLE_TOP);
		expect(candidates.some((c) => c.reason === 'peaks_diff_vs_height_excess_relaxed')).toBe(false);
	});
});

describe('呼び出し位置（既存の棄却検査をすべて通過した後）', () => {
	// 手前で落ちる候補の reason を横取りしないこと。前に置くと `view=debug` の診断が変わる
	// （`validatePatternSize` / `validateLevelSpread` の docstring と同じ理由）。

	it('ネックライン未突破の候補は no_breakout のまま（ブレイク判定より後）', async () => {
		// 末尾を 95 で頭打ちにしてネックライン 96 の 1.5% バッファ（94.56）を割らせない。
		const closes = [...HIGH_DIFF_DOUBLE_TOP.slice(0, 18), 95, 95, 95, 95, 95, 95];
		const { candidates } = await detectOn(closes);
		const dt = candidates.filter((c) => c.type === 'double_top' && c.accepted === false);
		expect(dt.map((c) => c.reason)).toContain('no_breakout');
		expect(dt.map((c) => c.reason)).not.toContain('peaks_diff_vs_height_excess');
	});

	it('構造ゲートで落ちる候補は retracement_out_of_band のまま（構造ゲートより後）', async () => {
		// 先行安値を 88 → 78 に下げて先行値幅 22 にすると戻り率 4/22 = 0.18 < RETRACEMENT_MIN。
		const closes = [
			90, 86, 82, 79, 78, 82, 86, 90, 94, 98, 100, 99, 97.5, 96, 96.5, 97, 97.5, 96, 95, 94, 93, 92, 91, 90,
		];
		const { candidates } = await detectOn(closes);
		const dt = candidates.filter((c) => c.type === 'double_top' && c.accepted === false);
		expect(dt.map((c) => c.reason)).toContain('retracement_out_of_band');
		expect(dt.map((c) => c.reason)).not.toContain('peaks_diff_vs_height_excess');
	});
});

describe('到達可能な時間足（#178 項目 4 の測定 3）', () => {
	// `spreadRatio > 0.5` には `heightAbs < 2 × spreadAbs` が要る。一方サイズ検査の深さ条件は
	// 谷を挟む 2 山の**平均**から測るので `heightAbs >= depthPct × 価格水準 + spreadAbs / 2`。
	// 両立するには `spreadAbs > depthPct / 1.525 × 価格水準` が必要で、`spreadAbs` は
	// `DOUBLE_LEVEL_MAX_PCT = 3%` で上から抑えられている。つまり **`depthPct >= 4.575%` の
	// 時間足では本ゲートは発火しえない**——`1day` 以上（`MIN_DEPTH_PCT = 5%`）が該当する。
	//
	// 検出器を通さず純粋関数だけで固定するのは、`minBarsBetweenSwings` のような
	// **本件と無関係な時間足差**で合成データが落ちて主張がすり替わるのを避けるため。
	const peakLevel = 100;

	/** サイズ検査を通る範囲で `spreadRatio` を最大化する（山1 = 100 / 山2 = 100 - s / 谷 = V）。 */
	function maxAttainableRatio(tf: string): number {
		const thresholds = getSizeThresholdsForTf(tf);
		let max = 0;
		for (let s = 0.01; s <= peakLevel * DOUBLE_LEVEL_MAX_PCT + 1e-9; s += 0.01) {
			for (let v = peakLevel - 0.01; v > 0; v -= 0.01) {
				const pts = [{ extremePrice: peakLevel }, { extremePrice: v }, { extremePrice: peakLevel - s }];
				if (validatePatternSize('top', pts, thresholds)) continue;
				const m = levelSpreadMetrics(
					[{ price: peakLevel }, { price: peakLevel - s }],
					pts.map((p) => ({ extremePrice: p.extremePrice })),
				);
				if (m.spreadRatio !== null && m.spreadRatio > max) max = m.spreadRatio;
				break; // 谷が浅いほど比が大きいので、最初に通った v が s ごとの最大
			}
		}
		return max;
	}

	it('1day ではサイズ検査と 3% 上限が両立せず、閾値 0.5 に届かない', () => {
		const max = maxAttainableRatio('1day');
		expect(max).toBeLessThan(MAX_LEVEL_SPREAD_RATIO);
		expect(max).toBeCloseTo(0.467, 2);
	});

	it('1hour / 4hour / 8hour / 12hour では届く（＝ゲートが意味を持つのは短い足）', () => {
		for (const tf of ['1hour', '4hour', '8hour', '12hour']) {
			expect(maxAttainableRatio(tf)).toBeGreaterThan(MAX_LEVEL_SPREAD_RATIO);
		}
	});
});
