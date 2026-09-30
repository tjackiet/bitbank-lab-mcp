/**
 * PR4 の実データ回帰。BTC/JPY 1hour / 4hour の triple 候補は、既存の
 * ネックライン側ゲートより先に先行トレンドを検証するため、横ばい先行の候補を
 * 出力しないことを固定する。形成中・完成待ち・content の各経路で同じ契約を確認する。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../tools/analyze_indicators.js', () => ({ default: vi.fn() }));

import { toolDef as detectPatternsTool } from '../src/handlers/detectPatternsHandler.js';
import analyzeIndicators from '../tools/analyze_indicators.js';
import detectPatterns from '../tools/detect_patterns.js';
import { asMockResult, assertOk } from './_assertResult.js';
import { buildBtcJpy1hour202608Candles } from './fixtures/btc_jpy_1hour_2026_08.js';

/** 実データ B（`btc_jpy` 1hour）を `analyze_indicators` の応答として 1 回分差し込む。 */
function mockCandles() {
	vi.mocked(analyzeIndicators).mockResolvedValueOnce(
		asMockResult({ ok: true, summary: 'ok', data: { chart: { candles: buildBtcJpy1hour202608Candles() } } }),
	);
}

/** `includeForming: true` で `detect_patterns` を走らせ、ok を確認して返す。 */
async function runForming(tf = '1hour') {
	mockCandles();
	const res = await detectPatterns('btc_jpy', tf, 365, { includeForming: true });
	assertOk(res);
	return res;
}

describe('detect_patterns: triple の先行トレンド方向ゲート（実データ B）', () => {
	it('横ばい先行の near_completion triple_bottom は PR4 の方向ゲートで除外される', async () => {
		const res = await runForming();
		const tb = res.data.patterns.find((p) => p.type === 'triple_bottom' && p.status === 'near_completion');
		expect(tb).toBeUndefined();
	});

	it('横ばい先行の forming triple_top は PR4 の方向ゲートで除外される', async () => {
		const res = await runForming('4hour');
		const tt = res.data.patterns.find((p) => p.type === 'triple_top' && p.status === 'forming');
		expect(tt).toBeUndefined();
	});

	/**
	 * 上の表の注記の裏取り（issue #261）。`1hour` に出ていた forming `triple_bottom`
	 * 313-331-364 が**消えたこと**だけでは、理由が #261 のゲートなのか別の変更なのかが読めない。
	 */
	it('1hour の forming triple_bottom は PR4 の先行トレンドゲートで落ちる', async () => {
		mockCandles();
		const res = await detectPatterns('btc_jpy', '1hour', 365, {
			includeForming: true,
			view: 'debug',
			patterns: ['triple_bottom'],
		});
		assertOk(res);
		expect(res.data.patterns.filter((p) => p.type === 'triple_bottom' && p.status === 'forming')).toHaveLength(0);

		const meta = res.meta as { debug?: { candidates?: Array<Record<string, unknown>> } } | undefined;
		const hit = (meta?.debug?.candidates ?? []).find(
			(c) =>
				c.reason === 'prior_trend_mismatch:sideways' && String((c.indices as number[])?.join('-')) === '313-331-364',
		);
		expect(hit).toBeDefined();
	});

	it('triple 以外の反転系の pivots 点数は従来どおり（完成済み H&S は 5 点、double は 3 点）', async () => {
		const res = await runForming();
		const lengths = res.data.patterns
			.filter((p) => p.status !== 'forming')
			.filter((p) => /head_and_shoulders|double_/.test(String(p.type)))
			.map((p) => `${p.type}:${(p.pivots ?? []).length}`);
		expect(lengths.length).toBeGreaterThan(0);
		expect(lengths.filter((l) => l.includes('head_and_shoulders')).every((l) => l.endsWith(':5'))).toBe(true);
		expect(lengths.filter((l) => l.startsWith('double_')).every((l) => l.endsWith(':3'))).toBe(true);
	});

	/** `view=full` の content を 1 回分取る。 */
	async function fullContent(tf: string): Promise<string> {
		mockCandles();
		const out = (await detectPatternsTool.handler({
			pair: 'btc_jpy',
			type: tf,
			limit: 365,
			includeForming: true,
			view: 'full',
		})) as { content: Array<{ text: string }> };
		return out.content[0].text;
	}

	it('content: 横ばい先行の triple_bottom は出力されない（1hour）', async () => {
		expect(await fullContent('1hour')).not.toContain('triple_bottom');
	});

	it('content: 横ばい先行の forming triple_top も出力されない（4hour）', async () => {
		expect(await fullContent('4hour')).not.toContain('triple_top');
	});
});
