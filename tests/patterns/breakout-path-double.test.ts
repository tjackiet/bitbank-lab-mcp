/**
 * tests/patterns/breakout-path-double.test.ts
 *
 * issue #242 — double の完成済み 4 経路に「最終構成点 → ブレイクの経路検証」を配線した件の
 * 回帰テスト。純粋関数そのものの単体テストは `breakout-path.test.ts` が持つ。
 *
 * 本テストが固定するのは 4 点:
 *
 * 1. 合成 fixture で**起票時の実例と同型**（山2 の後にもう 1 つ山を作ってから割る）が
 *    `status: 'invalid'` + `invalidReason: 'peak_after_last_pivot'` になること
 * 2. **同じ形から中間の山だけを取り除いた対照系列は accepted のまま**であること
 *    ——ゲートが「山2 の後にピボットがあるか」だけを見ていて、他の理由で落ちていないことの検算
 * 3. bottom 側（`trough_after_last_pivot`）が符号反転で同じ挙動になること
 * 4. 凍結済み実データ（`btc_jpy_1hour_2026_09` = 実データ C）に**同じ形が実在**し、そこでも落ちること
 * 5. **起票時のライブ実例そのもの**（実データ D の `limit=72` 窓）で `double_top` が落ち、
 *    `triangle_ascending`（`status: invalid`）だけが残ること
 *
 * **既定（`includeInvalid: false`）では `data.patterns` から消える**ので、消えた理由は
 * `view=debug` の候補（`reason: 'peak_after_last_pivot'`）に残す。`re_entered_trough_zone` は
 * 候補に積んでいないが、あちらは `status` を持つエントリが必ず 1 件出るのに対し、
 * 本ゲートは既定で痕跡がゼロになるため——理由が LLM にも利用者にも届かない。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asMockResult, assertOk } from '../_assertResult.js';

vi.mock('../../tools/analyze_indicators.js', () => ({ default: vi.fn() }));

import analyzeIndicators from '../../tools/analyze_indicators.js';
import detectPatterns from '../../tools/detect_patterns.js';
import { buildBtcJpy1hour202609Candles } from '../fixtures/btc_jpy_1hour_2026_09.js';
import {
	BTC_JPY_1HOUR_2026_09_05_ISSUE_WINDOW,
	buildBtcJpy1hour20260905Candles,
} from '../fixtures/btc_jpy_1hour_2026_09_05.js';
import { makeCandle } from '../fixtures/synthetic_pattern_candles.js';

type Candle = { isoTime: string; open: number; high: number; low: number; close: number; volume: number };
type Candidate = {
	type: string;
	accepted: boolean;
	reason?: string;
	indices?: number[];
	details?: Record<string, unknown>;
};

afterEach(() => {
	vi.restoreAllMocks();
});

/**
 * 起票時の実例（`btc_jpy` / `1hour` / 2026-09-04）と同型の合成系列。
 *
 * | 役割 | idx | 終値 |
 * |---|---:|---:|
 * | 先行安値（構造ゲートの起点） | 10 | 96 |
 * | 山1 | 15 | 130 |
 * | 谷（ネックライン） | 19 | 112 |
 * | 山2（最終構成点） | 23 | 129 |
 * | **再上昇の H ピボット** | **27** | **126** |
 * | ブレイク確認 | 29 | 108 |
 *
 * **idx 27 の終値 126 は 25% ゾーンの下限 127 に 1 だけ届かない**（アンカー = 高安 133、
 * 高さ = 133 − 109 = 24、下限 = 133 − 24 × 0.25 = 127）。実例が
 * 「ゾーン下限 12,752,699 に対し終値 12,711,037 で 0.3% 届かず」だったのと同じ配置で、
 * **既存の `detectTroughZoneReentry` では発火しない**ことをここで固定する。
 */
const WITH_PEAK_BETWEEN = [
	92, 94, 96, 98, 100, 101, 100, 99, 98, 97, 96, 102, 110, 118, 126, 130, 124, 120, 116, 112, 117, 121, 125, 129, 122,
	119, 122, 126, 120, 108, 104, 100, 98, 96,
];

/** 上の系列から idx 24〜29 の再上昇だけを取り除いた対照系列（山2 から直接割る）。 */
const WITHOUT_PEAK_BETWEEN = [
	92, 94, 96, 98, 100, 101, 100, 99, 98, 97, 96, 102, 110, 118, 126, 130, 124, 120, 116, 112, 117, 121, 125, 129, 122,
	118, 114, 108, 104, 100, 98, 96,
];

/** 水準 226 で折り返した鏡像（double_bottom 用）。`makeCandle` の高安も対称に反転する。 */
function mirror(closes: number[]): number[] {
	return closes.map((c) => 226 - c);
}

function toCandles(closes: number[]): Candle[] {
	return closes.map((close, i) => makeCandle(i, close));
}

async function detectDebug(
	candles: Candle[],
	opts: Record<string, unknown> = {},
): Promise<{ patterns: Array<Record<string, unknown>>; candidates: Candidate[] }> {
	vi.mocked(analyzeIndicators).mockResolvedValueOnce(
		asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
	);
	const res = await detectPatterns('btc_jpy', '1day', candles.length, { view: 'debug', swingDepth: 3, ...opts });
	assertOk(res);
	const meta = res.meta as { debug?: { candidates?: Candidate[] } } | undefined;
	return {
		patterns: res.data.patterns as Array<Record<string, unknown>>,
		candidates: meta?.debug?.candidates ?? [],
	};
}

const mainIdxs = (p: Record<string, unknown>) => ((p.pivots as Array<{ idx: number }>) ?? []).map((v) => v.idx);

describe('double_top: 山2 の後に山を作ってから割る形（issue #242・合成 fixture）', () => {
	it('既定では data.patterns に出ない', async () => {
		const { patterns } = await detectDebug(toCandles(WITH_PEAK_BETWEEN));
		expect(patterns.filter((p) => p.type === 'double_top')).toHaveLength(0);
	});

	it('includeInvalid: true で status=invalid + invalidReason=peak_after_last_pivot として出る', async () => {
		const { patterns } = await detectDebug(toCandles(WITH_PEAK_BETWEEN), { includeInvalid: true });
		const doubles = patterns.filter((p) => p.type === 'double_top');
		expect(doubles).toHaveLength(1);
		expect(doubles[0]).toMatchObject({ status: 'invalid', invalidReason: 'peak_after_last_pivot' });
		expect(mainIdxs(doubles[0])).toEqual([15, 19, 23]);
	});

	it('view=debug の候補に理由コードと「間のピボット」が残る', async () => {
		const { candidates } = await detectDebug(toCandles(WITH_PEAK_BETWEEN));
		const hit = candidates.find((c) => c.type === 'double_top' && c.reason === 'peak_after_last_pivot');
		expect(hit, JSON.stringify(candidates)).toBeDefined();
		expect(hit?.indices).toEqual([15, 19, 23]);
		expect(hit?.details).toMatchObject({
			lastPivotIdx: 23,
			breakoutIdx: 29,
			offenderIdx: 27,
			offenderPrice: 126,
			offenderExtremePrice: 129,
		});
	});

	it('既存の re_entered_trough_zone では拾えない配置になっている（2 つの検査は独立）', async () => {
		const { patterns, candidates } = await detectDebug(toCandles(WITH_PEAK_BETWEEN), { includeInvalid: true });
		expect(patterns.every((p) => p.invalidReason !== 're_entered_trough_zone')).toBe(true);
		expect(candidates.every((c) => c.reason !== 're_entered_trough_zone')).toBe(true);
	});

	it('中間の山を取り除いた対照系列は accepted のまま（他の理由で落ちていない）', async () => {
		const { patterns } = await detectDebug(toCandles(WITHOUT_PEAK_BETWEEN));
		const doubles = patterns.filter((p) => p.type === 'double_top');
		expect(doubles).toHaveLength(1);
		expect(doubles[0].status).toBeUndefined();
		expect(mainIdxs(doubles[0])).toEqual([15, 19, 23]);
	});
});

describe('double_bottom: 谷2 の後に谷を作ってから抜ける形（issue #242・符号反転）', () => {
	it('invalidReason は trough_after_last_pivot（種別の接頭辞を付けない）', async () => {
		const { patterns } = await detectDebug(toCandles(mirror(WITH_PEAK_BETWEEN)), { includeInvalid: true });
		const doubles = patterns.filter((p) => p.type === 'double_bottom');
		expect(doubles).toHaveLength(1);
		expect(doubles[0]).toMatchObject({ status: 'invalid', invalidReason: 'trough_after_last_pivot' });
		expect(mainIdxs(doubles[0])).toEqual([15, 19, 23]);
	});

	it('中間の谷を取り除いた対照系列は accepted のまま', async () => {
		const { patterns } = await detectDebug(toCandles(mirror(WITHOUT_PEAK_BETWEEN)));
		const doubles = patterns.filter((p) => p.type === 'double_bottom');
		expect(doubles).toHaveLength(1);
		expect(doubles[0].status).toBeUndefined();
	});
});

describe('同じ形が凍結済み実データにも存在する（issue #242・btc_jpy_1hour_2026_09）', () => {
	/**
	 * 実データ C（`2026-08-20T09:00Z` 〜 `2026-09-04T13:00Z` の 365 本）の
	 * `1hour` / `swingDepth` 既定で出る `double_top`（構成点 idx 174-177-184）。
	 *
	 * 山2（idx 184）とネックライン突破バー（idx 198）の間に H ピボット
	 * （idx 194 / `2026-08-28T11:00Z` / 終値 12,725,937 / 高安 12,762,331）があり、
	 * **山2 から直接割っていない**。起票時のライブ実例（2026-09-04 の 12,711,037）と同型で、
	 * 計測（`scripts/measure_reversal_path_242.ts`）が実データ C で唯一落とした double。
	 */
	async function realData(opts: Record<string, unknown> = {}) {
		vi.mocked(analyzeIndicators).mockResolvedValueOnce(
			asMockResult({ ok: true, summary: 'ok', data: { chart: { candles: buildBtcJpy1hour202609Candles() } } }),
		);
		const res = await detectPatterns('btc_jpy', '1hour', 365, { view: 'debug', patterns: ['double_top'], ...opts });
		assertOk(res);
		const meta = res.meta as { debug?: { candidates?: Candidate[] } } | undefined;
		return {
			patterns: res.data.patterns as Array<Record<string, unknown>>,
			candidates: meta?.debug?.candidates ?? [],
		};
	}

	it('構成点 174-177-184 の double_top は既定で出ない', async () => {
		const { patterns } = await realData();
		expect(patterns.filter((p) => mainIdxs(p).join('-') === '174-177-184')).toHaveLength(0);
	});

	it('includeInvalid: true なら peak_after_last_pivot として出る', async () => {
		const { patterns } = await realData({ includeInvalid: true });
		const hit = patterns.find((p) => mainIdxs(p).join('-') === '174-177-184');
		expect(hit, JSON.stringify(patterns.map(mainIdxs))).toBeDefined();
		expect(hit).toMatchObject({ type: 'double_top', status: 'invalid', invalidReason: 'peak_after_last_pivot' });
	});

	it('view=debug の候補に間のピボット（idx 194）が載る', async () => {
		const { candidates } = await realData();
		const hit = candidates.find((c) => c.reason === 'peak_after_last_pivot' && c.indices?.join('-') === '174-177-184');
		expect(hit).toBeDefined();
		expect(hit?.details).toMatchObject({ lastPivotIdx: 184, breakoutIdx: 198, offenderIdx: 194 });
	});
});

describe('起票時のライブ実例そのもの（issue #242・実データ D の limit=72 窓）', () => {
	/**
	 * issue #242 の再現手順は `detect_patterns('btc_jpy', '1hour', 72)` を 2026-09-05 に
	 * 実行したもの。その窓（`2026-09-02T04:00Z` 〜 `2026-09-05T03:00Z`）は実データ D の
	 * idx 288〜359 にあたる（`BTC_JPY_1HOUR_2026_09_05_ISSUE_WINDOW`）。
	 * **issue 本文の idx に一律 +288 すると実データ D の idx** になるので、本 describe の
	 * 期待値は issue 本文と同じ idx（窓の中の相対 idx）で書ける。
	 *
	 * | 役割 | idx | UTC | 終値 | 高安 |
	 * |---|---:|---|---:|---:|
	 * | 山1 | 41 | 09-03 21:00 | 12,718,980 | 12,807,555 |
	 * | 谷（ネックライン） | 46 | 09-04 02:00 | 12,617,594 | 12,588,132 |
	 * | 山2（最終構成点） | 50 | 09-04 06:00 | 12,639,245 | 12,800,000 |
	 * | **再上昇の H ピボット** | **55** | **09-04 11:00** | **12,711,037** | **12,731,234** |
	 * | ブレイク確認 | 56 | 09-04 12:00 | 12,396,727 | |
	 */
	async function liveWindow(opts: Record<string, unknown> = {}) {
		const { start, end } = BTC_JPY_1HOUR_2026_09_05_ISSUE_WINDOW;
		const candles = buildBtcJpy20260905Window(start, end);
		vi.mocked(analyzeIndicators).mockResolvedValueOnce(
			asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
		);
		const res = await detectPatterns('btc_jpy', '1hour', candles.length, { view: 'debug', ...opts });
		assertOk(res);
		const meta = res.meta as
			| { debug?: { candidates?: Candidate[]; swings?: Array<Record<string, unknown>> } }
			| undefined;
		return {
			patterns: res.data.patterns as Array<Record<string, unknown>>,
			candidates: meta?.debug?.candidates ?? [],
			swings: meta?.debug?.swings ?? [],
		};
	}

	function buildBtcJpy20260905Window(start: number, end: number): Candle[] {
		return buildBtcJpy1hour20260905Candles().slice(start, end);
	}

	it('スイング列が issue 本文と一致する（窓の切り出しの検算）', async () => {
		const { swings } = await liveWindow({ includeInvalid: true, includeForming: true });
		const around = swings
			.filter((s) => Number(s.idx) >= 41 && Number(s.idx) <= 58)
			.map((s) => `${s.kind}${s.idx}@${s.price}`);
		// issue 本文の `== swings ==` そのもの。
		expect(around).toEqual(['H41@12718980', 'L46@12617594', 'H50@12639245', 'H55@12711037', 'L58@12343265']);
	});

	it('double_top は既定で出ない（受け入れ条件）', async () => {
		const { patterns } = await liveWindow();
		expect(patterns.filter((p) => p.type === 'double_top')).toHaveLength(0);
	});

	it('includeInvalid: true で peak_after_last_pivot として出て、triangle_ascending invalid は残る', async () => {
		const { patterns } = await liveWindow({ includeInvalid: true });

		const doubles = patterns.filter((p) => p.type === 'double_top');
		expect(doubles).toHaveLength(1);
		expect(doubles[0]).toMatchObject({ status: 'invalid', invalidReason: 'peak_after_last_pivot' });
		expect(mainIdxs(doubles[0])).toEqual([41, 46, 50]);

		// 値動きの正しい読みはこちら（#242 本文）。**本ゲートで消えていないことを固定する。**
		const asc = patterns.filter((p) => p.type === 'triangle_ascending');
		expect(asc).toHaveLength(1);
		expect(asc[0].status).toBe('invalid');
	});

	it('view=debug の候補に issue 本文と同じ「間のピボット」が載る', async () => {
		const { candidates } = await liveWindow();
		const hit = candidates.find((c) => c.type === 'double_top' && c.reason === 'peak_after_last_pivot');
		expect(hit).toBeDefined();
		expect(hit?.indices).toEqual([41, 46, 50]);
		expect(hit?.details).toEqual({
			lastPivotIdx: 50,
			breakoutIdx: 56,
			offenderIdx: 55,
			offenderPrice: 12_711_037,
			offenderExtremePrice: 12_731_234,
		});
	});

	it('既存の再進入チェックでは拾えない（ゾーン下限に 0.3% 届かない配置）', async () => {
		const { patterns, candidates } = await liveWindow({ includeInvalid: true });
		expect(patterns.every((p) => p.invalidReason !== 're_entered_trough_zone')).toBe(true);
		expect(candidates.every((c) => c.reason !== 're_entered_trough_zone')).toBe(true);
	});
});
