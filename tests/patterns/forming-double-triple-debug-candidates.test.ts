/**
 * tests/patterns/forming-double-triple-debug-candidates.test.ts
 *
 * 形成中 double / triple が `debug.candidates` に痕跡を残すことの回帰テスト（issue #158）。
 * #155 / PR #159 が形成中 H&S にやったことの、形成中 double top / bottom・triple top / bottom
 * 4 経路への横展開。
 *
 * カバーするもの:
 *   1. 4 経路それぞれで、`data.patterns` に出た形成中パターンと**同じ構成点**を持つ
 *      `accepted: true` / `status: 'forming'` の candidate が積まれる
 *   2. 新設した理由コードが、それぞれ発火する最小ケースを持つ
 *   3. 算術的に到達しないガード（`forming_completion_below_min` の 3 経路）は、
 *      fixture ではなく「なぜ fixture を置けないか」の境界を固定する
 *   4. `pushCand` の `status` は**渡さなければ出ない**（共有ヘルパの additive 性）
 */
import { describe, expect, it, vi } from 'vitest';
import { dayjs } from '../../lib/datetime.js';
import { asMockResult, assertOk } from '../_assertResult.js';

vi.mock('../../tools/analyze_indicators.js', () => ({
	default: vi.fn(),
}));

import analyzeIndicators from '../../tools/analyze_indicators.js';
import detectPatterns from '../../tools/detect_patterns.js';
import { MIN_FORMING_COMPLETION } from '../../tools/patterns/detect_doubles.js';
import { FORMING_MIN_COMPLETION as TRIPLE_MIN_COMPLETION } from '../../tools/patterns/detect_triples.js';
import { type CandDebugEntry, type DetectContext, pushCand } from '../../tools/patterns/types.js';
import { buildBtcJpy2026Candles } from '../fixtures/btc_jpy_1day_2026.js';

type Candle = {
	isoTime: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
};

type Candidate = {
	type: string;
	accepted: boolean;
	reason?: string;
	status?: string;
	indices?: number[];
	points?: Array<{ role: string; idx: number; price: number; isoTime?: string }>;
};

type Pattern = {
	type: string;
	status?: string;
	pivots?: Array<{ idx: number }>;
};

/** 合成列の基準日（UTC）。実データ fixture と重ならない年初に置く。 */
const SYNTHETIC_START = '2026-01-01';
const makeIso = (dayOffset: number) => dayjs.utc(SYNTHETIC_START).add(dayOffset, 'day').toISOString();

/** 終値列からローソク足を作る。ヒゲ幅は `extremePrice` 基準の検査（サイズ・深さ）に効くので固定する。 */
function fromCloses(closes: number[], wick = 3): Candle[] {
	return closes.map((close, index) => ({
		isoTime: makeIso(index),
		open: close,
		high: close + wick,
		low: close - wick,
		close,
		volume: 100,
	}));
}

/** `[bars, endPrice][]` を線形補間して終値列にする。折り返し点がそのままピボット候補になる。 */
function legs(start: number, spec: Array<[bars: number, endPrice: number]>): number[] {
	const out = [start];
	let cur = start;
	for (const [bars, end] of spec) {
		for (let i = 1; i <= bars; i++) out.push(cur + ((end - cur) * i) / bars);
		cur = end;
	}
	return out.map((v) => Math.round(v * 100) / 100);
}

/** 凍結済み BTC/JPY 日足 fixture の先頭 n 本 */
function realCandles(n: number): Candle[] {
	return buildBtcJpy2026Candles().slice(0, n);
}

async function runDebug(
	candles: Candle[],
	opts: Parameters<typeof detectPatterns>[3] = {},
): Promise<{ patterns: Pattern[]; candidates: Candidate[] }> {
	vi.mocked(analyzeIndicators).mockResolvedValueOnce(
		asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
	);
	const res = await detectPatterns('btc_jpy', '1day', candles.length, {
		includeForming: true,
		view: 'debug',
		...opts,
	});
	assertOk(res);
	return {
		patterns: res.data.patterns as unknown as Pattern[],
		candidates: (res.meta.debug?.candidates ?? []) as Candidate[],
	};
}

// ── 4 経路の fixture ──
// 価格は 100 前後のスケール。形成バー数の下限（1day: double 23 本 / triple 23 本）を
// 満たすために各脚を長めに取ってある——短いと `forming_bars_out_of_range` に落ちる。
const FORMING_DOUBLE_TOP = legs(100, [
	[10, 130],
	[10, 112],
	[13, 128.05],
]);
/** 形成中ダブルボトムと形成中トリプルボトムが同時に立つ列（構成点を共有する） */
const FORMING_BOTTOMS = legs(132, [
	[9, 100],
	[6, 118],
	[7, 101],
	[6, 118],
	[7, 103.6],
]);
const FORMING_TRIPLE_TOP = legs(100, [
	[9, 130],
	[6, 112],
	[7, 129],
	[6, 113],
	[7, 129.5],
]);

/**
 * その種別の**形成中パスの成功エントリ**だけを取り出す。
 * 同じ種別の strict / relaxed パスも `accepted: true` を積む（`prior_trend_insufficient_data` 等）
 * ので、`status` で絞らないと経路が混ざる。
 */
function formingAcceptedFor(candidates: Candidate[], type: string): Candidate[] {
	return candidates.filter((c) => c.accepted && c.type === type && c.status !== undefined);
}

describe('forming double / triple debug candidates (#158)', () => {
	describe('成功エントリ — data.patterns に出た形成中パターンと同じ構成点が積まれる', () => {
		it('double_top', async () => {
			const { patterns, candidates } = await runDebug(fromCloses(FORMING_DOUBLE_TOP));

			const pattern = patterns.find((p) => p.type === 'double_top' && p.status === 'forming');
			expect(pattern).toBeDefined();
			expect(pattern?.pivots?.map((p) => p.idx)).toEqual([10, 20]);

			// #158 以前はこの経路が完全に無音で、candidates に痕跡が 1 件も無かった
			const hits = formingAcceptedFor(candidates, 'double_top');
			expect(hits).toHaveLength(1);
			// 完成済みとして採用されたと誤読させないための印
			expect(hits[0].status).toBe('forming');
			// 確定ピボット 2 点 ＋ 暫定の山2（最新足）。indices は既存の棄却エントリと同じ並び
			expect(hits[0].indices).toEqual([10, 20, 33]);
			expect(hits[0].points?.map((p) => [p.role, p.idx])).toEqual([
				['peak1', 10],
				['valley', 20],
				['forming_peak', 33],
			]);
			// isoTime は pushCand が候補足から埋める
			expect(hits[0].points?.every((p) => typeof p.isoTime === 'string')).toBe(true);
		});

		it('double_bottom', async () => {
			const { patterns, candidates } = await runDebug(fromCloses(FORMING_BOTTOMS));

			const pattern = patterns.find((p) => p.type === 'double_bottom' && p.status === 'forming');
			expect(pattern).toBeDefined();
			expect(pattern?.pivots?.map((p) => p.idx)).toEqual([9, 15, 22]);

			const hits = formingAcceptedFor(candidates, 'double_bottom');
			expect(hits).toHaveLength(1);
			expect(hits[0].status).toBe('forming');
			expect(hits[0].indices).toEqual([9, 15, 22, 35]);
			expect(hits[0].points?.map((p) => [p.role, p.idx])).toEqual([
				['valley1', 9],
				['peak', 15],
				['valley2', 22],
				['current', 35],
			]);
		});

		it('triple_top', async () => {
			const { patterns, candidates } = await runDebug(fromCloses(FORMING_TRIPLE_TOP));

			const pattern = patterns.find((p) => p.type === 'triple_top' && p.status === 'forming');
			expect(pattern).toBeDefined();
			expect(pattern?.pivots?.map((p) => p.idx)).toEqual([9, 22]);

			const hits = formingAcceptedFor(candidates, 'triple_top');
			expect(hits).toHaveLength(1);
			expect(hits[0].status).toBe('forming');
			// indices は既存の棄却エントリと同じ 3 点。ネックラインを引いた 2 谷は points にだけ載る
			expect(hits[0].indices).toEqual([9, 22, 35]);
			expect(hits[0].points?.map((p) => [p.role, p.idx])).toEqual([
				['peak1', 9],
				['valley1', 15],
				['peak2', 22],
				['valley2', 28],
				['current', 35],
			]);
		});

		it('triple_bottom', async () => {
			const { patterns, candidates } = await runDebug(fromCloses(FORMING_BOTTOMS));

			const pattern = patterns.find((p) => p.type === 'triple_bottom' && p.status === 'forming');
			expect(pattern).toBeDefined();
			expect(pattern?.pivots?.map((p) => p.idx)).toEqual([9, 22]);

			const hits = formingAcceptedFor(candidates, 'triple_bottom');
			expect(hits).toHaveLength(1);
			expect(hits[0].status).toBe('forming');
			expect(hits[0].indices).toEqual([9, 22, 35]);
			expect(hits[0].points?.map((p) => [p.role, p.idx])).toEqual([
				['valley1', 9],
				['peak1', 15],
				['valley2', 22],
				['peak2', 28],
				['current', 35],
			]);
		});
	});

	describe('理由コード — 新設した各分岐が発火する最小ケース', () => {
		const REACHABLE: Array<{
			reason: string;
			type: string;
			candles: () => Candle[];
			opts?: Parameters<typeof detectPatterns>[3];
		}> = [
			// tryFormingDoubleTop の 7 分岐（うち 6 つが到達可能。残り 1 つは下の算術テスト）
			{
				reason: 'forming_no_confirmed_peak',
				type: 'double_top',
				// 最後の山が lastIdx-2 にあり「確定済み」の条件（idx < lastIdx-2）を満たさない列。
				// 既定 swingDepth では山が必ず lastIdx-swingDepth 以前になるため swingDepth=2 で作る。
				candles: () =>
					fromCloses(
						legs(100, [
							[4, 95],
							[24, 130],
							[2, 128],
						]),
					),
				opts: { swingDepth: 2 },
			},
			{
				reason: 'forming_no_valley_after_peak',
				type: 'double_top',
				candles: () => fromCloses(FORMING_BOTTOMS),
			},
			{
				reason: 'forming_peak_level_out_of_tolerance',
				type: 'double_top',
				candles: () =>
					fromCloses(
						legs(100, [
							[10, 130],
							[10, 112],
							[13, 117],
						]),
					),
			},
			{
				reason: 'forming_peaks_not_level',
				type: 'double_top',
				// 山許容（±5%）は通るが同水準判定（3%）で落ちる帯
				candles: () =>
					fromCloses(
						legs(100, [
							[10, 130],
							[10, 112],
							[13, 124.8],
						]),
					),
			},
			{
				reason: 'forming_current_at_or_below_valley',
				type: 'double_top',
				candles: () =>
					fromCloses(
						legs(100, [
							[12, 130],
							[10, 127],
							[9, 128],
							[4, 126.4],
						]),
					),
			},
			{
				reason: 'forming_bars_out_of_range',
				type: 'double_top',
				candles: () =>
					fromCloses(
						legs(100, [
							[10, 130],
							[6, 112],
							[8, 128],
						]),
					),
			},
			// tryFormingDoubleBottom（構成点 3 点が揃った後の分岐のみ）
			{
				reason: 'forming_pattern_height_below_min',
				type: 'double_bottom',
				candles: () => realCandles(72),
				opts: { swingDepth: 2 },
			},
			{
				reason: 'forming_valleys_not_level',
				type: 'double_bottom',
				candles: () =>
					fromCloses(
						legs(130, [
							[10, 100],
							[10, 120],
							[8, 90],
							[8, 100],
						]),
					),
			},
			{
				reason: 'forming_current_below_valley_zone',
				type: 'double_bottom',
				candles: () =>
					fromCloses(
						legs(112, [
							[10, 100],
							[8, 105],
							[8, 100],
							[8, 105],
							[8, 95.5],
						]),
					),
			},
			{
				reason: 'forming_bars_out_of_range',
				type: 'double_bottom',
				candles: () => fromCloses(FORMING_TRIPLE_TOP),
			},
			// tryFormingTripleTop / tryFormingTripleBottom（同上）
			{
				reason: 'forming_bars_out_of_range',
				type: 'triple_top',
				candles: () =>
					fromCloses(
						legs(100, [
							[5, 130],
							[3, 120],
							[4, 129],
							[3, 121],
							[6, 129.5],
						]),
					),
				opts: { swingDepth: 2 },
			},
			{
				reason: 'forming_confidence_below_min',
				type: 'triple_top',
				candles: () =>
					fromCloses(
						legs(100, [
							[9, 130],
							[6, 112],
							[7, 129],
							[6, 113],
							[7, 126.5],
						]),
					),
			},
			{
				reason: 'forming_bars_out_of_range',
				type: 'triple_bottom',
				candles: () =>
					fromCloses(
						legs(132, [
							[5, 100],
							[3, 112],
							[4, 101],
							[3, 112],
							[6, 100.5],
						]),
					),
				opts: { swingDepth: 2 },
			},
			{
				reason: 'forming_confidence_below_min',
				type: 'triple_bottom',
				candles: () =>
					fromCloses(
						legs(132, [
							[9, 100],
							[6, 118],
							[7, 102.3],
							[6, 118],
							[7, 103.8],
						]),
					),
			},
			{
				reason: 'forming_completion_below_min',
				type: 'triple_bottom',
				// 山と谷の差が小さく、現在値が谷水準をわずかに下回る形。progress が負に振れて
				// completion が 0.4 を割る（bottom 側だけが到達しうる。定数の docstring を参照）
				candles: () =>
					fromCloses(
						legs(112, [
							[10, 100],
							[8, 105],
							[8, 100],
							[8, 105],
							[8, 95.5],
						]),
					),
			},
		];

		for (const { reason, type, candles, opts } of REACHABLE) {
			it(`${type}: ${reason}`, async () => {
				const { candidates } = await runDebug(candles(), { includeInvalid: true, ...opts });
				const hit = candidates.find((c) => c.type === type && c.reason === reason);
				expect(hit, `${type}:${reason} が積まれていない`).toBeDefined();
				expect(hit?.accepted).toBe(false);
				// 棄却エントリに status は付かない（`includeInvalid` で拾える status とは別物）
				expect(hit?.status).toBeUndefined();
			});
		}
	});

	describe('到達しないガード — fixture ではなく算術境界を固定する', () => {
		it('double top / bottom の forming_completion_below_min は現行の重みでは発火しない', () => {
			// completion = min(1, 0.66 + progress * 0.34)、progress は [0, 1] にクランプ済み。
			// 下限は progress=0 のときの 0.66 で、しきい値 0.4 を割れない。
			const baseCompletion = 0.66;
			expect(baseCompletion).toBeGreaterThan(MIN_FORMING_COMPLETION);
		});

		it('triple top の forming_completion_below_min は現行の重みでは発火しない', () => {
			// top 側の progress = min(1, currentPrice / avgPeakPrice) は価格が正である限り正。
			// completion > 0.66 になり、しきい値を割れない（bottom 側は progress が負を取りうる）。
			const baseCompletion = 0.66;
			expect(baseCompletion).toBeGreaterThan(TRIPLE_MIN_COMPLETION);
		});
	});

	describe('pushCand の status', () => {
		function makeCtx(): { ctx: DetectContext; out: CandDebugEntry[] } {
			const out: CandDebugEntry[] = [];
			const ctx = {
				candles: [{ open: 1, high: 2, low: 0, close: 1, isoTime: '2026-01-01T00:00:00.000Z' }],
				debugCandidates: out,
			} as unknown as DetectContext;
			return { ctx, out };
		}

		it('渡さなければ status キー自体が出ない', () => {
			const { ctx, out } = makeCtx();
			pushCand(ctx, { type: 'double_top', accepted: false, reason: 'x', idxs: [0] });
			expect(out).toHaveLength(1);
			expect('status' in out[0]).toBe(false);
		});

		it('渡せばそのまま写る', () => {
			const { ctx, out } = makeCtx();
			pushCand(ctx, { type: 'double_top', accepted: true, status: 'forming', idxs: [0] });
			expect(out[0].status).toBe('forming');
		});
	});
});
