/**
 * tests/patterns/target-reach.test.ts
 *
 * `computeTargetReach` / `targetReachFields` / `formatTargetProgressLine`（`patterns/target-reach.ts`）。
 * 元は `tests/patterns/helpers.test.ts` にあったが、issue #210 で実装を
 * `patterns/helpers.ts` から切り出したのに合わせて移した。
 *
 * #210 で入った 3 つの振る舞いはそれぞれ独立に固定する:
 *   (1) 到達側の上限 `TARGET_REACHED_PCT_CAP`
 *   (2) 分母の退化（`targetDistance < patternHeight * MIN_TARGET_DISTANCE_HEIGHT_RATIO`）で出力しない
 *   (3) 走査窓 `TARGET_REACH_MAX_BARS` 本
 */
import { describe, expect, it } from 'vitest';
import {
	computeTargetReach,
	formatTargetProgressLine,
	MIN_TARGET_DISTANCE_HEIGHT_RATIO,
	TARGET_REACH_MAX_BARS,
	TARGET_REACHED_PCT_CAP,
	type TargetReachInfo,
	type TargetReachResult,
	targetReachFields,
} from '../../tools/patterns/target-reach.js';
import type { CandleData } from '../../tools/patterns/types.js';

/** candle factory: high / low を明示指定可能 */
function c(high: number, low: number, close: number, iso?: string): CandleData {
	return { open: close, high, low, close, isoTime: iso ?? '2026-01-01T00:00:00.000Z' };
}

/** `kind: 'measured'` であることを表明して絞り込む。 */
function measured(r: TargetReachResult | undefined): TargetReachInfo {
	expect(r?.kind).toBe('measured');
	return r as TargetReachInfo;
}

describe('computeTargetReach', () => {
	// direction='down' ─────────────────────────────────────

	it('direction=down: 最安 low が target を割り込む → reached=true, pct>=100', () => {
		// breakoutPrice=100, target=80, idx=2 で low=70 (<= target) → 到達
		const candles = [
			c(105, 95, 100, 'iso-0'),
			c(105, 90, 100, 'iso-1'),
			c(95, 70, 90, 'iso-2'),
			c(100, 85, 95, 'iso-3'),
		];
		const r = measured(computeTargetReach(candles, 0, 100, 80, 'down', 20));
		expect(r.targetReached).toBe(true);
		expect(r.targetReachedPct).toBeGreaterThanOrEqual(100);
		expect(r.targetReachedPrice).toBe(70);
		expect(r.targetReachedDate).toBe('iso-2');
	});

	it('direction=down: 一度到達後に close が戻っても最安 low ベースで到達扱い', () => {
		// breakoutPrice=100, target=80, idx=1 で low=75（到達） / idx=3 で close=100 へ戻し
		const candles = [
			c(102, 99, 100, 'iso-0'),
			c(95, 75, 90, 'iso-1'),
			c(110, 92, 105, 'iso-2'),
			c(115, 99, 110, 'iso-3'),
		];
		const r = measured(computeTargetReach(candles, 0, 100, 80, 'down', 20));
		expect(r.targetReached).toBe(true);
		expect(r.targetReachedPrice).toBe(75);
		expect(r.targetReachedDate).toBe('iso-1');
	});

	it('direction=down: ブレイク close が既に target を下回る（オーバーシュート）→ reached=true & pct>=100', () => {
		// breakoutPrice=70, target=80 → 既に到達済み
		const candles = [c(72, 65, 70, 'iso-0'), c(75, 60, 70, 'iso-1')];
		const r = measured(computeTargetReach(candles, 0, 70, 80, 'down', 10));
		expect(r.targetReached).toBe(true);
		expect(r.targetReachedPct).toBeGreaterThanOrEqual(100);
	});

	it('direction=down: low が target に届かない → reached=false, pct<100', () => {
		// breakoutPrice=100, target=50, 最安 low=90 → moveDistance=10, distance=50, pct=20
		const candles = [c(102, 100, 100, 'iso-0'), c(101, 90, 99, 'iso-1')];
		const r = measured(computeTargetReach(candles, 0, 100, 50, 'down', 50));
		expect(r.targetReached).toBe(false);
		expect(r.targetReachedPct).toBe(20);
		expect(r.targetReachedPrice).toBe(90);
	});

	// direction='up' ───────────────────────────────────────

	it('direction=up: 最高 high が target を超える → reached=true, pct>=100', () => {
		// breakoutPrice=100, target=120, idx=2 で high=130 (>= target) → 到達
		const candles = [c(102, 98, 100, 'iso-0'), c(110, 100, 108, 'iso-1'), c(130, 115, 125, 'iso-2')];
		const r = measured(computeTargetReach(candles, 0, 100, 120, 'up', 20));
		expect(r.targetReached).toBe(true);
		expect(r.targetReachedPct).toBeGreaterThanOrEqual(100);
		expect(r.targetReachedPrice).toBe(130);
		expect(r.targetReachedDate).toBe('iso-2');
	});

	it('direction=up: 一度到達後に close が戻っても最高 high ベースで到達扱い', () => {
		// breakoutPrice=100, target=120, idx=1 で high=125（到達） / idx=2 で close=100 へ戻し
		const candles = [c(101, 99, 100, 'iso-0'), c(125, 100, 122, 'iso-1'), c(105, 95, 100, 'iso-2')];
		const r = measured(computeTargetReach(candles, 0, 100, 120, 'up', 20));
		expect(r.targetReached).toBe(true);
		expect(r.targetReachedPrice).toBe(125);
		expect(r.targetReachedDate).toBe('iso-1');
	});

	it('direction=up: ブレイク close が既に target を超える（オーバーシュート）→ reached=true & pct>=100', () => {
		// breakoutPrice=130, target=120 → 既に到達済み
		const candles = [c(135, 125, 130, 'iso-0'), c(140, 128, 135, 'iso-1')];
		const r = measured(computeTargetReach(candles, 0, 130, 120, 'up', 10));
		expect(r.targetReached).toBe(true);
		expect(r.targetReachedPct).toBeGreaterThanOrEqual(100);
	});

	it('direction=up: high が target に届かない → reached=false, pct<100', () => {
		// breakoutPrice=100, target=150, 最高 high=110 → moveDistance=10, distance=50, pct=20
		const candles = [c(105, 98, 100, 'iso-0'), c(110, 100, 108, 'iso-1')];
		const r = measured(computeTargetReach(candles, 0, 100, 150, 'up', 50));
		expect(r.targetReached).toBe(false);
		expect(r.targetReachedPct).toBe(20);
		expect(r.targetReachedPrice).toBe(110);
	});

	// 入力不正 ─────────────────────────────────────────────

	it('breakoutPrice が NaN → undefined を返す', () => {
		const candles = [c(102, 98, 100, 'iso-0')];
		expect(computeTargetReach(candles, 0, Number.NaN, 80, 'down', 20)).toBeUndefined();
	});

	it('target が NaN → undefined を返す', () => {
		const candles = [c(102, 98, 100, 'iso-0')];
		expect(computeTargetReach(candles, 0, 100, Number.NaN, 'down', 20)).toBeUndefined();
	});

	it('breakoutIdx が candles.length 以上 → undefined を返す', () => {
		const candles = [c(102, 98, 100, 'iso-0')];
		expect(computeTargetReach(candles, 5, 100, 80, 'down', 20)).toBeUndefined();
	});

	it('breakoutIdx が負 → Math.max(0, ...) で 0 から走査', () => {
		const candles = [c(95, 70, 90, 'iso-0'), c(100, 80, 95, 'iso-1')];
		const r = measured(computeTargetReach(candles, -1, 100, 80, 'down', 20));
		expect(r.targetReached).toBe(true);
		expect(r.targetReachedPrice).toBe(70);
	});

	// 丸めの非対称性（reached=false なら 100 に丸めない） ───

	it('reached=false で raw pct が 99.x → 99 にキャップ（100 にせり上がらない）', () => {
		// breakoutPrice=100, target=0, extremeLow=0.4
		// targetReached = 0.4 <= 0 → false
		// rawPct = (100 - 0.4) / 100 * 100 = 99.6
		// round すると 100（reached=false なのに pct=100）になるので floor + 99 キャップ
		const candles = [c(101, 0.4, 100, 'iso-0')];
		const r = measured(computeTargetReach(candles, 0, 100, 0, 'down', 100));
		expect(r.targetReached).toBe(false);
		expect(r.targetReachedPct).toBe(99);
	});

	it('reached=true なら通常通り round（オーバーシュート/到達の区別を維持）', () => {
		// breakoutPrice=100, target=80, extremeLow=80（ちょうど到達）
		// rawPct = 20/20 * 100 = 100 → reached=true & pct=100
		const candles = [c(95, 80, 90, 'iso-0')];
		const r = measured(computeTargetReach(candles, 0, 100, 80, 'down', 20));
		expect(r.targetReached).toBe(true);
		expect(r.targetReachedPct).toBe(100);
	});

	// (1) 到達側の上限 ─────────────────────────────────────

	it(`到達側は ${TARGET_REACHED_PCT_CAP} で頭打ちになる（issue #210 (1)）`, () => {
		// breakoutPrice=100, target=110（distance=10）、high=100000 → rawPct=999,000%
		const candles = [c(100_000, 99, 100, 'iso-0')];
		const r = measured(computeTargetReach(candles, 0, 100, 110, 'up', 10));
		expect(r.targetReached).toBe(true);
		expect(r.targetReachedPct).toBe(TARGET_REACHED_PCT_CAP);
	});

	it('上限に届かないオーバーシュートは丸めずそのまま出る', () => {
		// breakoutPrice=100, target=110（distance=10）、high=150 → rawPct=500%
		const candles = [c(150, 99, 100, 'iso-0')];
		expect(measured(computeTargetReach(candles, 0, 100, 110, 'up', 10)).targetReachedPct).toBe(500);
	});

	// (2) 分母の退化 ───────────────────────────────────────

	it('targetDistance がパターン高さの閾値未満 → kind=omitted（進捗を出さない。issue #210 (2)）', () => {
		// distance=10 / height=1000 → 比 0.01 < 0.15
		const candles = [c(200, 90, 100, 'iso-0'), c(300, 80, 250, 'iso-1')];
		const r = computeTargetReach(candles, 0, 100, 110, 'up', 1000);
		expect(r).toEqual({ kind: 'omitted', reason: 'degenerate_target_distance' });
	});

	it('閾値ちょうどは測る（境界は「未満」で切る）', () => {
		// distance=10 / height=10/0.15 → 比はちょうど MIN_TARGET_DISTANCE_HEIGHT_RATIO
		const candles = [c(105, 95, 100, 'iso-0')];
		const r = computeTargetReach(candles, 0, 100, 110, 'up', 10 / MIN_TARGET_DISTANCE_HEIGHT_RATIO);
		expect(r?.kind).toBe('measured');
	});

	it('0 距離（breakoutPrice == target）→ kind=omitted（旧: reached=true, pct=100）', () => {
		// ブレイク時点で target と一致 = 達成度を測る余地が無い。比 0 として退化ガードに落ちる。
		const candles = [c(102, 98, 100, 'iso-0'), c(105, 95, 100, 'iso-1')];
		expect(computeTargetReach(candles, 0, 100, 100, 'down', 20)?.kind).toBe('omitted');
		expect(computeTargetReach(candles, 0, 100, 100, 'up', 20)?.kind).toBe('omitted');
	});

	it('patternHeight が 0 / 負 / NaN → kind=omitted（比を判定できない）', () => {
		const candles = [c(130, 95, 100, 'iso-0')];
		for (const h of [0, -5, Number.NaN]) {
			expect(computeTargetReach(candles, 0, 100, 120, 'up', h)?.kind).toBe('omitted');
		}
	});

	// (3) 走査窓 ───────────────────────────────────────────

	it(`走査はブレイク足から ${TARGET_REACH_MAX_BARS} 本先まで（issue #210 (3)）`, () => {
		// 窓の内側（最終足）に high=130、窓の外側にさらに高い high=500 を置く
		const candles: CandleData[] = [];
		for (let i = 0; i <= TARGET_REACH_MAX_BARS + 5; i++) {
			candles.push(c(105, 95, 100, `iso-${i}`));
		}
		candles[TARGET_REACH_MAX_BARS] = c(130, 95, 100, `iso-${TARGET_REACH_MAX_BARS}`);
		candles[TARGET_REACH_MAX_BARS + 1] = c(500, 95, 100, `iso-${TARGET_REACH_MAX_BARS + 1}`);
		const r = measured(computeTargetReach(candles, 0, 100, 120, 'up', 20));
		expect(r.targetReachedPrice).toBe(130);
		expect(r.targetReachedDate).toBe(`iso-${TARGET_REACH_MAX_BARS}`);
	});

	it('窓の外だけで到達しても reached=false（「いつか到達」ではない）', () => {
		const candles: CandleData[] = [];
		for (let i = 0; i <= TARGET_REACH_MAX_BARS + 5; i++) {
			candles.push(c(105, 95, 100, `iso-${i}`));
		}
		candles[TARGET_REACH_MAX_BARS + 1] = c(500, 95, 100, 'iso-late');
		const r = measured(computeTargetReach(candles, 0, 100, 120, 'up', 20));
		expect(r.targetReached).toBe(false);
		expect(r.targetReachedPrice).toBe(105);
	});

	it('系列が窓より短ければ末尾まで（暫定値）', () => {
		const candles = [c(105, 95, 100, 'iso-0'), c(112, 95, 110, 'iso-1')];
		const r = measured(computeTargetReach(candles, 0, 100, 120, 'up', 20));
		expect(r.targetReached).toBe(false);
		expect(r.targetReachedPrice).toBe(112);
	});
});

describe('targetReachFields', () => {
	it('undefined → 空オブジェクト（ブレイクしていない等）', () => {
		expect(targetReachFields(undefined)).toEqual({});
	});

	it('omitted → targetProgressOmittedReason だけを載せる（黙って落とさない）', () => {
		expect(targetReachFields({ kind: 'omitted', reason: 'degenerate_target_distance' })).toEqual({
			targetProgressOmittedReason: 'degenerate_target_distance',
		});
	});

	it('measured → 進捗 4 フィールドを載せ、申告フィールドは出さない', () => {
		expect(
			targetReachFields({
				kind: 'measured',
				targetReachedPct: 120,
				targetReached: true,
				targetReachedDate: 'iso-1',
				targetReachedPrice: 130,
			}),
		).toEqual({
			targetReachedPct: 120,
			targetReached: true,
			targetReachedDate: 'iso-1',
			targetReachedPrice: 130,
		});
	});

	it('measured で targetReachedDate が無ければキーごと出さない', () => {
		expect(
			targetReachFields({ kind: 'measured', targetReachedPct: 50, targetReached: false, targetReachedPrice: 110 }),
		).not.toHaveProperty('targetReachedDate');
	});
});

describe('formatTargetProgressLine', () => {
	it('進捗が無ければ null', () => {
		expect(formatTargetProgressLine({})).toBeNull();
	});

	it('到達済みは走査窓の本数を明示する', () => {
		expect(formatTargetProgressLine({ targetReachedPct: 132, targetReached: true })).toBe(
			`   - ターゲット進捗: 132%（ブレイク後${TARGET_REACH_MAX_BARS}本以内に到達）`,
		);
	});

	it('未到達は「N本以内は未到達」と言い切る（無言で 47% だけ出さない）', () => {
		expect(formatTargetProgressLine({ targetReachedPct: 47, targetReached: false })).toBe(
			`   - ターゲット進捗: 47%（ブレイク後${TARGET_REACH_MAX_BARS}本以内は未到達）`,
		);
	});

	it('上限に当たった値は「以上」と申告する（#181 と同じ方針）', () => {
		expect(formatTargetProgressLine({ targetReachedPct: TARGET_REACHED_PCT_CAP, targetReached: true })).toContain(
			`${TARGET_REACHED_PCT_CAP}%以上`,
		);
	});

	it('退化して出さなかった場合は理由を content に出す', () => {
		const line = formatTargetProgressLine({ targetProgressOmittedReason: 'degenerate_target_distance' });
		expect(line).toContain('出力なし');
		expect(line).toContain('85%以上');
	});

	it('退化の申告は pct より優先する（両方あっても進捗値を名乗らない）', () => {
		const line = formatTargetProgressLine({
			targetProgressOmittedReason: 'degenerate_target_distance',
			targetReachedPct: 240033,
		});
		expect(line).not.toContain('240033');
	});
});
