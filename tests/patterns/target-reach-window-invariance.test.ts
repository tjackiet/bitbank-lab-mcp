/**
 * tests/patterns/target-reach-window-invariance.test.ts
 *
 * issue #210 (3) の回帰。**同じ構造・同じブレイク足のパターンは、系列がどこで終わっていても
 * 同じ `targetReachedPct` / `targetReached` を返す**ことを固定する（走査窓ぶんの足が揃っている限り）。
 *
 * `computeTargetReach` の走査は元々 `candles.length` まで無制限だったので、系列が伸びるほど
 * extremum が更新されて値が動いた。実データ B（`btc_jpy` 1hour 365 本）を 240 本で切ると:
 *
 * | パターン | 240 本で | 365 本で |
 * |---|---:|---:|
 * | `falling_wedge`（ブレイク 2026-08-17T15:00Z） | 4,473% | 5,102% |
 * | `inverse_head_and_shoulders`（同 2026-08-17T18:00Z） | 209,921% | 240,033% |
 * | `triangle_ascending`（target 10,387,692） | 1,507% | 1,719% |
 * | `triangle_ascending`（target 11,671,022） | 382% | 483% |
 *
 * 4 件とも `targetReachedPrice` が **系列全体の最高値 12,933,047（2026-08-25T02:00Z）** に
 * 張り付いていた——8/17 のブレイクが 8/25 の高値で採点されていた、ということ。
 * これは #154（窓を広げたのに検出が減る）と同じクラスの欠陥で、走査を
 * `TARGET_REACH_MAX_BARS` 本で止めることで解消する。
 *
 * **末尾の切り詰めで見る理由**: `limit` は「直近 N 本」を意味するので**先頭**を切り詰める。
 * 走査はブレイク足より後ろしか見ないため、先頭を切っても共通するパターンの pct は元々動かない
 * （実測でも `limit` 120 / 150 / 200 / 250 / 300 / 365 の総当たりで差分 0）。値を動かすのは
 * **系列の末尾**＝「いつ問い合わせたか」で、それがこのテストの対象。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../tools/analyze_indicators.js', () => ({ default: vi.fn() }));

import analyzeIndicators from '../../tools/analyze_indicators.js';
import detectPatterns from '../../tools/detect_patterns.js';
import { TARGET_REACH_MAX_BARS, TARGET_REACHED_PCT_CAP } from '../../tools/patterns/target-reach.js';
import { asMockResult, assertOk } from '../_assertResult.js';
import { buildBtcJpy1hour202608Candles } from '../fixtures/btc_jpy_1hour_2026_08.js';

type Candle = ReturnType<typeof buildBtcJpy1hour202608Candles>[number];

/** 与えた candles だけを見せて `detect_patterns` を 1 回叩き、`data.patterns` を返す。 */
async function runOn(candles: Candle[]) {
	vi.mocked(analyzeIndicators).mockResolvedValueOnce(
		asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
	);
	const res = await detectPatterns('btc_jpy', '1hour', candles.length, {});
	assertOk(res);
	return res.data.patterns;
}

/** 末尾の切り詰めではバー添字がずれないので、構造の同一性は添字ごと突き合わせられる。 */
function structureKey(p: Record<string, unknown>): string {
	const range = p.range as { start?: string } | undefined;
	return [p.type, range?.start, p.breakoutBarIndex, p.breakoutTarget].join('|');
}

describe('targetReachedPct は系列の末尾に依存しない（issue #210 (3)）', () => {
	it('240 本で切っても 365 本でも、走査窓が揃っている構造の進捗は完全に一致する', async () => {
		const full = buildBtcJpy1hour202608Candles();
		const truncated = full.slice(0, 240);

		const shortRun = await runOn(truncated);
		const longRun = await runOn(full);

		const byKey = new Map(longRun.map((p) => [structureKey(p as Record<string, unknown>), p]));

		let compared = 0;
		for (const s of shortRun) {
			const sp = s as Record<string, unknown>;
			const lp = byKey.get(structureKey(sp)) as Record<string, unknown> | undefined;
			if (!lp) continue;
			// 短いほうで走査窓ぶんの足が揃っていない構造は、定義上まだ暫定値なので比較しない。
			const bi = sp.breakoutBarIndex;
			if (typeof bi !== 'number' || truncated.length - 1 - bi < TARGET_REACH_MAX_BARS) continue;
			compared++;
			expect({
				key: structureKey(sp),
				targetReached: sp.targetReached,
				targetReachedPct: sp.targetReachedPct,
				targetReachedPrice: sp.targetReachedPrice,
				targetReachedDate: sp.targetReachedDate,
				targetProgressOmittedReason: sp.targetProgressOmittedReason,
			}).toEqual({
				key: structureKey(lp),
				targetReached: lp.targetReached,
				targetReachedPct: lp.targetReachedPct,
				targetReachedPrice: lp.targetReachedPrice,
				targetReachedDate: lp.targetReachedDate,
				targetProgressOmittedReason: lp.targetProgressOmittedReason,
			});
		}
		// 比較対象が 0 件だと「一致した」が空虚に成立するので、実際に突き合わせたことを固定する。
		// 修正前はこのうち 3 件が不一致だった（本ファイル冒頭の表のうち、240 本側に窓が揃う構造）。
		expect(compared).toBeGreaterThanOrEqual(3);
	});

	it('系列全体の最高値（2026-08-25T02:00Z の 12,933,047）が 8 月中旬ブレイクの採点に使われない', async () => {
		const patterns = await runOn(buildBtcJpy1hour202608Candles());
		const stuck = patterns.filter((p) => {
			const q = p as Record<string, unknown>;
			return q.targetReachedDate === '2026-08-25T02:00:00.000Z' && Number(q.breakoutBarIndex) < 200;
		});
		expect(stuck).toEqual([]);
	});

	it(`targetReachedPct は ${TARGET_REACHED_PCT_CAP} を超えない（issue #210 (1)）`, async () => {
		const patterns = await runOn(buildBtcJpy1hour202608Candles());
		const pcts = patterns
			.map((p) => (p as Record<string, unknown>).targetReachedPct)
			.filter((v): v is number => typeof v === 'number');
		expect(pcts.length).toBeGreaterThan(0);
		expect(Math.max(...pcts)).toBeLessThanOrEqual(TARGET_REACHED_PCT_CAP);
	});

	it('分母が潰れた 2 件の逆 H&S は進捗を出さず理由を申告する（issue #210 (2)。旧 240,033% / 43,177%）', async () => {
		const patterns = await runOn(buildBtcJpy1hour202608Candles());
		const omitted = patterns.filter(
			(p) => (p as Record<string, unknown>).targetProgressOmittedReason === 'degenerate_target_distance',
		);
		expect(omitted.map((p) => [p.type, p.breakoutTarget])).toEqual([
			['inverse_head_and_shoulders', 12643525],
			['inverse_head_and_shoulders', 10277171],
		]);
		for (const p of omitted) {
			const q = p as Record<string, unknown>;
			// breakoutTarget は出る（target の算出式は #210 の対象外）。進捗系だけが消える。
			expect(q.breakoutTarget).toEqual(expect.any(Number));
			expect(q.targetReached).toBeUndefined();
			expect(q.targetReachedPct).toBeUndefined();
			expect(q.targetReachedDate).toBeUndefined();
			expect(q.targetReachedPrice).toBeUndefined();
		}
	});
});
