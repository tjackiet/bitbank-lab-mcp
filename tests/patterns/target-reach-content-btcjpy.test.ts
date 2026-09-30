/**
 * tests/patterns/target-reach-content-btcjpy.test.ts
 *
 * issue #288 Phase 2 — ターゲット行の**実データによる固定**。
 *
 * 合成データでの網羅（3 形 + 出力なし、交絡の並び、素の JSON の消費者）は
 * `tests/patterns/target-reach.test.ts` と `tests/detectPatternsViewsHandler.test.ts` が持つ。
 * 本ファイルが押さえるのは 3 点:
 *
 * 1. **実データ B（`btc_jpy_1hour_2026_08`、365 本・既定パラメータ）で、到達済み 1 件と
 *    未到達 1 件の行が本数・日時込みで固定される。** 表示層だけを直したつもりで検出器側の
 *    数え方（初到達 vs 極値）がずれたら、ここが落ちる。
 * 2. **`targetReachedPct` が 100 を超える entry でも、その数字が content に出ない。**
 *    実データ B には 530 と 999（上限）の 2 件があり、どちらも旧実装は
 *    `ターゲット進捗: 530%（ブレイク後60本以内に到達）` と出していた（issue #288 の症状）。
 * 3. **交絡の申告が実データでも「全件には付かない」。** Phase 1 の実測では走査窓に他パターンの
 *    ブレイクがある実体が 94.7% なので、素朴な申告に戻ると 10 件中ほぼ全件に付く。
 *
 * 期待値は `data.patterns` のベースライン
 * （`tests/fixtures/detect_patterns_1hour_data_patterns_baseline.json`）と同じ呼び出しから出る。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asMockResult, assertOk } from '../_assertResult.js';

vi.mock('../../tools/analyze_indicators.js', () => ({ default: vi.fn() }));

import { toolDef as detectPatternsTool } from '../../src/handlers/detectPatternsHandler.js';
import analyzeIndicators from '../../tools/analyze_indicators.js';
import detectPatterns from '../../tools/detect_patterns.js';
import { buildBtcJpy1hour202608Candles } from '../fixtures/btc_jpy_1hour_2026_08.js';

afterEach(() => {
	vi.restoreAllMocks();
});

/** 実データ B の 365 本をそのまま既定オプションで流す（ベースラインと同じ呼び出し）。 */
async function liveContent(view: string): Promise<string> {
	const candles = buildBtcJpy1hour202608Candles();
	vi.mocked(analyzeIndicators).mockResolvedValueOnce(
		asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
	);
	const res = (await detectPatternsTool.handler({ pair: 'btc_jpy', type: '1hour', limit: candles.length, view })) as {
		content?: Array<{ text?: string }>;
	};
	const text = res?.content?.[0]?.text;
	// **`?? ''` で畳まない。** 空文字に落とすと `not.toContain` 側が
	// 「ハンドラが content を返さなかった」ときにも通ってしまう。
	if (typeof text !== 'string') throw new Error(`view=${view} の content[0].text が取れない`);
	return text;
}

/** `   - ターゲット: …` 行だけを取り出す（`ターゲット価格:` 行とは別）。 */
function targetLines(text: string): string[] {
	return text.split('\n').filter((line) => line.startsWith('   - ターゲット: '));
}

const TARGET_LABEL = '   - ターゲット: ';

describe('#288 Phase 2 のターゲット行（実データ B / 365 本 / 既定パラメータ）', () => {
	// `formatPatternLine` を呼ぶのは階梯上の 2 view（`summary` は明細を列挙しない）。
	// **`detailed` は上位 5 件まで**なので、全 10 件が並ぶのは `full` だけ。

	it('view=full: 到達済みの triangle が初到達の本数と日時を出す', async () => {
		const text = await liveContent('full');
		expect(text).toContain(`${TARGET_LABEL}到達（ブレイク後 47 本目、2026-08-19 23:00）`);
	});

	it('view=full: 別の到達済み triangle も初到達日時を分まで出す', async () => {
		const text = await liveContent('full');
		expect(text).toContain(`${TARGET_LABEL}到達（ブレイク後 16 本目、2026-08-21 09:00）`);
	});

	it('view=full: 未到達（走査完了）は接近度だけを出す', async () => {
		const text = await liveContent('full');
		// ブレイク足 idx=295。系列末尾まで 69 本あるので走査は上限の 60 本で完了。
		expect(text).toContain(`${TARGET_LABEL}未到達（走査 60 本完了、目標幅の 18% まで接近）`);
	});

	it('view=full: 期待と逆向きに抜けた wedge は標準ターゲットを出さない', async () => {
		const text = await liveContent('full');
		expect(text).toContain(
			`${TARGET_LABEL}出力なし（期待方向と逆のブレイクで、標準的なパターン目標値を適用しないため）`,
		);
	});

	it('view=full: 交絡は該当した 2 件にだけ付く（全件には付かない）', async () => {
		const text = await liveContent('full');
		expect(text).toContain(
			`${TARGET_LABEL}到達（ブレイク後 47 本目、2026-08-19 23:00）。到達前に別パターンのブレイクあり（inverse_head_and_shoulders 上方 +3 本）`,
		);
		expect(text).toContain(
			`${TARGET_LABEL}未到達（走査 60 本完了、目標幅の 22% まで接近）。走査窓内に逆方向のブレイクあり（triple_bottom 上方 +42 本, rising_wedge 上方 +44 本, triangle_ascending 上方 +57 本）`,
		);
		// **Phase 1 の 94.7% と比べて限定が効いていること。** 素朴な申告に戻ればここが跳ねる。
		const lines = targetLines(text);
		expect(lines).toHaveLength(8);
		expect(lines.filter((l) => l.includes('ブレイクあり（'))).toHaveLength(2);
	});

	// ── issue #288 の症状そのもの ──────────────────────────────

	it.each(['detailed', 'full'])('view=%s: ターゲット行に 100 以上の百分率が 1 つも出ない', async (view) => {
		const text = await liveContent(view);
		const lines = targetLines(text);
		expect(lines.length).toBeGreaterThan(0);
		for (const line of lines) {
			for (const [, pct] of line.matchAll(/(\d+)%/g)) {
				expect(Number(pct), line).toBeLessThan(100);
			}
		}
	});

	it('view=full: 100 超の pct を持つ 2 件の数字が content に出ない（530 / 999）', async () => {
		const text = await liveContent('full');
		// `targetReachedPct` は 530（`triangle_ascending`）と 999（`falling_wedge`）。
		// 値そのものは `structuredContent` に残っている（契約は変えていない）が、content には出さない。
		expect(text).not.toContain('530%');
		expect(text).not.toContain('999%');
		expect(text).not.toContain('ターゲット進捗');
	});

	/**
	 * `tools/detect_patterns.ts` の `res.summary` は views handler と**別実装**なので、
	 * 日時の粒度も別々に決まる。**暦日に潰すと 1hour では 24 本が同じラベルになり、
	 * 初到達の足を特定できない**（#288 Phase 2 のレビュー指摘）。
	 */
	it('res.summary（別実装）も intraday の初到達を分まで出す', async () => {
		const candles = buildBtcJpy1hour202608Candles();
		vi.mocked(analyzeIndicators).mockResolvedValueOnce(
			asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
		);
		const res = await detectPatterns('btc_jpy', '1hour', candles.length, {});
		assertOk(res);
		expect(res.summary).toContain(`${TARGET_LABEL}到達（ブレイク後 47 本目、2026-08-19 23:00）`);
		// 暦日に潰れていた旧実装の形が残っていないこと。
		expect(res.summary).not.toContain('到達（ブレイク後 47 本目、2026-08-19）');
	});

	it('view=full: 進捗を出さなかった2件は理由を名乗る', async () => {
		const text = await liveContent('full');
		const omitted = targetLines(text).filter((l) => l.includes('出力なし'));
		expect(omitted).toHaveLength(2);
		expect(omitted.filter((line) => line.includes('残り距離が短く進捗率が意味を持たないため'))).toHaveLength(1);
		expect(
			omitted.filter((line) => line.includes('期待方向と逆のブレイクで、標準的なパターン目標値を適用しないため')),
		).toHaveLength(1);
	});
});
