/**
 * tests/detect_patterns_debug.test.ts
 *
 * `view=debug` の可観測性の契約（#124 / #125）。
 *
 * 1. `patterns` を指定したとき、candidates が**要求種別の棄却理由**になる
 *    （以前は各検出器が want を「分類・出力の時点」でしか見ておらず、
 *     走査中に積まれた他種別の候補が cap=200 を食い潰していた）
 * 2. `patterns` 未指定時の candidates は絞られない
 * 3. `data.patterns` は `patterns` フィルタの有無で変わらない
 *    （候補フィルタは debug 出力だけに効き、検出結果には触らない）
 * 4. pivot は極値判定に使った値（`extremePrice`）を持ち、`price` は終値
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asMockResult, assertOk } from './_assertResult.js';

vi.mock('../tools/analyze_indicators.js', () => ({
	default: vi.fn(),
}));

import { formatDebugView } from '../src/handlers/detectPatternsViewsHandler.js';
import analyzeIndicators from '../tools/analyze_indicators.js';
import detectPatterns from '../tools/detect_patterns.js';

type Candle = { isoTime: string; open: number; high: number; low: number; close: number; volume: number };

function makeIso(dayOffset: number): string {
	return new Date(Date.UTC(2026, 0, 1 + dayOffset)).toISOString();
}

/** close と high/low を明確にずらした足（価格基準の検証に要る） */
function makeCandle(dayOffset: number, close: number): Candle {
	return {
		isoTime: makeIso(dayOffset),
		open: close,
		high: close + 3,
		low: close - 3,
		close,
		volume: 100,
	};
}

function indicatorsOk(candles: Candle[]) {
	return { ok: true, summary: 'ok', data: { chart: { candles } } };
}

/**
 * 多数の種別の候補が同時に立つ、揺れの大きい価格列。
 * 単一パターンの fixture だと「他種別の候補が押し出す」状況自体が再現しない。
 */
function buildNoisyCandles(): Candle[] {
	return Array.from({ length: 120 }, (_, i) =>
		makeCandle(i, 100 + Math.sin(i / 3) * 12 + Math.cos(i / 7) * 8 + (i % 5)),
	);
}

const mockedAnalyzeIndicators = vi.mocked(analyzeIndicators);

async function run(candles: Candle[], opts: Record<string, unknown>) {
	mockedAnalyzeIndicators.mockResolvedValueOnce(asMockResult(indicatorsOk(candles)));
	return detectPatterns('btc_jpy', '1day', candles.length, opts);
}

describe('detect_patterns: debug candidates の要求種別フィルタ（#124）', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('patterns=[double_bottom] の candidates は double_bottom だけになる', async () => {
		const candles = buildNoisyCandles();
		const res = await run(candles, { patterns: ['double_bottom'], includeForming: true });
		assertOk(res);
		const cands = res.meta.debug?.candidates ?? [];
		expect(cands.length).toBeGreaterThan(0);
		expect([...new Set(cands.map((c) => c.type))]).toEqual(['double_bottom']);
	});

	it('要求種別の棄却理由が理由コード付きで出る', async () => {
		const candles = buildNoisyCandles();
		const res = await run(candles, { patterns: ['double_bottom'], includeForming: true });
		assertOk(res);
		const rejected = (res.meta.debug?.candidates ?? []).filter((c) => !c.accepted);
		expect(rejected.length).toBeGreaterThan(0);
		for (const c of rejected) {
			expect(typeof c.reason, JSON.stringify(c)).toBe('string');
			expect(c.reason).not.toBe('');
		}
		// 理由コードは content にも出る（LLM は structuredContent を読めない）
		const text = formatDebugView('hdr', res.meta, [], res).content[0].text;
		expect(text).toContain('double_bottom');
		for (const c of rejected) expect(text).toContain(String(c.reason));
	});

	it('要求していない種別（wedge / triangle / flag）の候補は 1 件も出ない', async () => {
		const candles = buildNoisyCandles();
		const res = await run(candles, { patterns: ['double_bottom'], includeForming: true });
		assertOk(res);
		const types = new Set<string>((res.meta.debug?.candidates ?? []).map((c) => String(c.type)));
		for (const unwanted of ['falling_wedge', 'rising_wedge', 'triangle_symmetrical', 'flag', 'double_top']) {
			expect(types.has(unwanted), `${unwanted} が残っている`).toBe(false);
		}
	});

	it('patterns 未指定時は絞らない（他種別の候補がそのまま出る）', async () => {
		const candles = buildNoisyCandles();
		const res = await run(candles, { includeForming: true });
		assertOk(res);
		const types = new Set((res.meta.debug?.candidates ?? []).map((c) => c.type));
		expect(types.size).toBeGreaterThan(1);
		expect(types.has('double_bottom') || types.has('falling_wedge')).toBe(true);
	});

	it("エイリアス 'triangle' は 3 種の候補を残す", async () => {
		const candles = buildNoisyCandles();
		const res = await run(candles, { patterns: ['triangle'], includeForming: true });
		assertOk(res);
		const types = new Set((res.meta.debug?.candidates ?? []).map((c) => c.type));
		expect(types.size).toBeGreaterThan(0);
		for (const t of types) expect(t.startsWith('triangle_')).toBe(true);
	});

	it('候補フィルタは data.patterns を変えない', async () => {
		const candles = buildNoisyCandles();
		const all = await run(candles, { includeForming: true });
		const filtered = await run(candles, { patterns: ['double_bottom'], includeForming: true });
		assertOk(all);
		assertOk(filtered);
		// patterns フィルタは検出結果側にも効くので「double_bottom 以外が消える」のは正しい。
		// 検証したいのは「残った double_bottom が絞り込み前と同一」であること。
		const pick = (r: typeof all) => r.data.patterns.filter((p) => p.type === 'double_bottom');
		expect(pick(filtered)).toEqual(pick(all));
	});

	it('候補ゼロのとき content は「絞り込みの結果かもしれない」ことを明示する', async () => {
		const candles = buildNoisyCandles();
		const res = await run(candles, { patterns: ['double_bottom'], includeForming: true });
		assertOk(res);
		// 絞り込み後に 0 件になりうるので、0 件表示が「パターンが無い」と読まれないようにする。
		// ここでは meta を空候補に差し替えて表示だけを固定する（0 件になる価格列は時間足依存で脆い）。
		const emptyMeta = { ...res.meta, debug: { ...res.meta.debug, candidates: [] } };
		const text = formatDebugView('hdr', emptyMeta, [], { ...res, meta: emptyMeta }).content[0].text;
		expect(text).toContain('なし');
		expect(text).toContain('candidates は入力 patterns で絞り込まれる');
	});
});

describe('detect_patterns: pivot の価格基準（#125）', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	/** 完成済み double_top（tests/patterns/invariants.test.ts と同じ価格列） */
	const doubleTopCloses = [
		100, 102, 105, 110, 118, 130, 126, 122, 118, 114, 112, 110, 114, 118, 122, 126, 128, 129, 123, 116, 104, 100, 95,
		100, 99, 98,
	];

	it('全 pivot が kind と extremePrice を持つ', async () => {
		const candles = buildNoisyCandles();
		const res = await run(candles, { includeForming: true, includeInvalid: true, swingDepth: 2 });
		assertOk(res);
		const pivots = res.data.patterns.flatMap((p) => p.pivots ?? []);
		expect(pivots.length).toBeGreaterThan(0);
		for (const pv of pivots) {
			expect(['H', 'L']).toContain(pv.kind);
			expect(Number.isFinite(pv.extremePrice), JSON.stringify(pv)).toBe(true);
		}
	});

	it('ピボット由来の検出器では price=終値 / extremePrice=判定に使った高安', async () => {
		const candles = doubleTopCloses.map((c, i) => makeCandle(i, c));
		const res = await run(candles, { patterns: ['double_top'], swingDepth: 2, tolerancePct: 0.02 });
		assertOk(res);
		const dt = res.data.patterns.find((p) => p.type === 'double_top');
		expect(dt?.pivots?.length).toBeGreaterThan(0);
		for (const pv of dt?.pivots ?? []) {
			const c = candles[pv.idx];
			expect(pv.price).toBe(c.close);
			expect(pv.extremePrice).toBe(pv.kind === 'H' ? c.high : c.low);
		}
	});

	it('full view の pivot 行に採用基準が出る', async () => {
		const candles = doubleTopCloses.map((c, i) => makeCandle(i, c));
		const res = await run(candles, { patterns: ['double_top'], swingDepth: 2, tolerancePct: 0.02 });
		assertOk(res);
		const { formatPatternLine } = await import('../src/handlers/detectPatternsViewsHandler.js');
		const dt = res.data.patterns.find((p) => p.type === 'double_top');
		expect(dt).toBeDefined();
		const line = formatPatternLine(dt as NonNullable<typeof dt>, 0, 'full', res.meta);
		expect(line).toContain('山1');
		expect(line).toContain('終値');
		expect(line).toContain('判定は高値基準');
		expect(line).toContain('判定は安値基準');
	});
});
