/**
 * tests/patterns/status-reason-label-286.test.ts
 *
 * issue #286 — `detect_patterns` の content の状態行を `status` × 理由コードで出す件の、
 * **実データによる固定**。
 *
 * 合成データでの網羅（4 つの理由コード × 種別、未知コード、`near_completion` の系統分け、
 * `expired` のラベル）は `tests/detectPatternsViewsHandler.test.ts` の
 * 「状態行: status × 理由コードの網羅」が持つ。本ファイルが押さえるのは 1 点だけ:
 *
 * **#242 / #245 の発端の形（実データ D の `limit=72` 窓 / 既定 `swingDepth`）で、
 * `invalidReason: 'peak_after_last_pivot'` の `double_top` の状態行が理由コードを併記し、
 * 「逆方向」と言わないこと。**
 *
 * これが実機（Claude Desktop / 2026-09-11）で起きた誤表示そのもの——この構造の下方ブレイクは
 * `double_top` の**期待どおりの方向**なのに、旧実装は `status='invalid'` を理由を問わず
 * 「無効（期待と逆方向にブレイク）」と書いており、LLM がそのまま誤って説明した。
 * 「期待と逆方向にブレイク」に対応する理由コードは検出器に 1 つも存在しない。
 *
 * 窓の切り出しと既定 `swingDepth`（1hour = 3）で経路ゲートが `peak_after_last_pivot` を
 * 立てる理由は `tests/patterns/breakout-path-double.test.ts`（issue #251 案 3）が仕様として
 * 固定している。`includeInvalid: true` が要るのはそのためで、既定では `data.patterns` から消える。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asMockResult } from '../_assertResult.js';

vi.mock('../../tools/analyze_indicators.js', () => ({ default: vi.fn() }));

import { toolDef as detectPatternsTool } from '../../src/handlers/detectPatternsHandler.js';
import analyzeIndicators from '../../tools/analyze_indicators.js';
import {
	BTC_JPY_1HOUR_2026_09_05_ISSUE_WINDOW,
	buildBtcJpy1hour20260905Candles,
} from '../fixtures/btc_jpy_1hour_2026_09_05.js';

afterEach(() => {
	vi.restoreAllMocks();
});

/** 実データ D の `limit=72` 窓を既定 `swingDepth` + `includeInvalid: true` で流す。 */
async function liveWindowContent(view: string): Promise<string> {
	const { start, end } = BTC_JPY_1HOUR_2026_09_05_ISSUE_WINDOW;
	const candles = buildBtcJpy1hour20260905Candles().slice(start, end);
	vi.mocked(analyzeIndicators).mockResolvedValueOnce(
		asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
	);
	const res = (await detectPatternsTool.handler({
		pair: 'btc_jpy',
		type: '1hour',
		limit: candles.length,
		view,
		includeInvalid: true,
	})) as { content?: Array<{ text?: string }> };
	const text = res?.content?.[0]?.text;
	// **`?? ''` で畳まない。** 空文字に落とすと `not.toContain` 側が
	// 「ハンドラが content を返さなかった」ときにも通ってしまう。
	if (typeof text !== 'string') throw new Error(`view=${view} の content[0].text が取れない`);
	return text;
}

describe('#286 の発端の形（実データ D の limit=72 窓 / 既定 swingDepth / includeInvalid）', () => {
	// `formatPatternLine` を呼ぶのは階梯上の 2 view（`summary` は明細を列挙せず、
	// `debug` は階梯外で明細を出さない）。
	for (const view of ['detailed', 'full'] as const) {
		it(`view=${view}: double_top の状態行が理由コードを併記する`, async () => {
			const text = await liveWindowContent(view);
			expect(text).toContain('double_top');
			expect(text).toContain('   - 状態: 無効（山2 の後に別の山を作ってから割った: peak_after_last_pivot）');
		});

		it(`view=${view}: 「逆方向」と言わない（旧実装の誤表示）`, async () => {
			const text = await liveWindowContent(view);
			expect(text).not.toContain('逆方向');
		});
	}
});
