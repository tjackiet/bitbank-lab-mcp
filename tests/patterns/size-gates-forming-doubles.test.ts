/**
 * issue #169 の回帰テスト — 形成中 double のサイズ検査。
 *
 * 反転パターンの形成中パスのうち、**double の 2 経路だけが完成済みと揃っていなかった**。
 * 形成中ダブルボトムは両脚の高さしか見ておらず深さ（`depthPct`）が無く、
 * 形成中ダブルトップは**サイズ検査そのものが無かった**（下限がゼロ）。
 * triple / H&S の形成中パスは #139 で `validatePatternSize`（高さ + 深さ）に揃っている。
 *
 * 「形成中は早期警告なので緩くてよい」は一般には正しく、同じ関数の
 * `FORMING_TOLERANCE_MULTIPLIER = 1.5`（水準一致判定の緩和）は**意図的な設計として残す**。
 * 緩めてよいのは「同水準か」の判定で、「そもそも形と呼べる大きさか」ではない
 * （#138 欠陥 2-2 / #139 が決めた原則）。
 *
 * ## この fixture が **ヒゲ無し**（`high = low = close`）なのはなぜか
 *
 * サイズ検査の価格基準は `Pivot.extremePrice`（高安）だが、`extremePrice` と終値が
 * ずれているとテストに書いた % がコードの計算と一致しなくなる。ここで固定したいのは
 * 「閾値の境界でどちらの検査が発火するか」なので、`extremePrice === close` にして
 * 期待値を素の割り算で読めるようにしてある。**`extremePrice` を使う根拠そのもの**
 * （終値基準だと値幅が実際の 1/3 に見える）は `detect_doubles.ts` の
 * `validateTopSize` の docstring と #130 / #131 が担保している。
 *
 * ## 時間足
 *
 * サイズ検査そのものの回帰はアンカーの `1day`（`heightPct` 3% / `depthPct` 5% で据え置き）で見る。
 * `1hour` は 0.62% / 1.04% なので**同じ値動きが通る**——issue #152 / PR #168 で入った
 * 時間足別テーブルとサイズ検査の関係も同じ fixture で固定してある。
 */
import { describe, expect, it, vi } from 'vitest';
import { dayjs } from '../../lib/datetime.js';
import { getSizeThresholdsForTf } from '../../tools/patterns/config.js';
import { asMockResult } from '../_assertResult.js';

vi.mock('../../tools/analyze_indicators.js', () => ({ default: vi.fn() }));

import analyzeIndicators from '../../tools/analyze_indicators.js';
import detectPatterns from '../../tools/detect_patterns.js';

type Candle = { isoTime: string; open: number; high: number; low: number; close: number; volume: number };

const DAY = getSizeThresholdsForTf('1day');
const HOUR = getSizeThresholdsForTf('1hour');

/** 固定の起点から i 本後。相対時刻にしないのは実行日でパターンが動かないようにするため。 */
function isoAt(i: number): string {
	return dayjs.utc('2026-01-01T00:00:00Z').add(i, 'day').toISOString();
}

/** ヒゲ無しのローソク（`extremePrice === close`）。理由はファイル冒頭の docstring を参照。 */
function mkCandle(i: number, close: number): Candle {
	return { isoTime: isoAt(i), open: close, high: close, low: close, close, volume: 100 };
}

/**
 * 形成中ダブルトップ: 山1（idx=3, 高値 100）→ 谷（idx=8, 安値 `valley`）→ 暫定の山2（最終足の終値 `last`）。
 *
 * 谷より後は最終足まで単調増加なので、確定ピボットは山1 と谷の 2 点だけになる
 * （＝完成済みパスは走らず、形成中パスだけを見られる）。`lastIdx = 40` は
 * `formationBars = lastIdx - 山1.idx = 37` を `1day`（23〜148 本）と `1hour`（34〜219 本）の
 * **両方の形成バー数レンジに入れる**ため。
 */
function buildFormingDoubleTop(valley: number, last = 100, lastIdx = 40): Candle[] {
	const closes: number[] = [94, 96, 98, 100];
	for (let i = 1; i <= 5; i++) closes.push(100 - ((100 - valley) * i) / 5); // idx 4..8 → 谷は idx=8
	const n = lastIdx - 8;
	for (let i = 1; i <= n; i++) closes.push(valley + ((last - valley) * i) / n);
	return closes.map((c, i) => mkCandle(i, c));
}

/**
 * 形成中ダブルボトム: 谷1（idx=4, 安値 100）→ 山（idx=14, 高値 `peak`）→ 谷2（idx=24, 安値 100）
 * → 直近は上昇中。構成点 3 点はすべて確定ピボットで、最新足は構成点ではない。
 *
 * 谷2 からの反発を速くしてあるのは、谷ゾーン（谷 + パターン高さ × `TROUGH_REENTRY_FRACTION`）を
 * 1 本目で抜けないと `re_entered_trough_zone` で `invalid` になり、サイズ検査より前に
 * 別の理由で落ちてしまうため。`lastIdx = 42` は `formationBars = 38` を `1day` / `1hour` の
 * 両方のレンジに入れつつ、谷2 からの経過（18 本）を `FORMING_EXPIRY_BARS = 20` 以内に収める。
 */
function buildFormingDoubleBottom(peak: number, lastIdx = 42): Candle[] {
	const closes: number[] = [106, 104, 102, 101, 100];
	for (let i = 1; i <= 10; i++) closes.push(100 + ((peak - 100) * i) / 10); // idx 5..14 → 山は idx=14
	for (let i = 1; i <= 10; i++) closes.push(peak - ((peak - 100) * i) / 10); // idx 15..24 → 谷2 は idx=24
	const n = lastIdx - 24;
	const tail = peak - 1;
	for (let i = 1; i <= n; i++) closes.push(100 + (tail - 100) * (0.6 + (0.4 * i) / n));
	return closes.map((c, i) => mkCandle(i, c));
}

/**
 * {@link buildFormingDoubleTop} と**同じ 3 水準**（100 / `valley` / 100）を、
 * 3 点目も確定ピボットにした完成済み形状。形成中と完成済みで同じ判定になることの比較用。
 */
function buildCompletedShapeDoubleTop(valley: number): Candle[] {
	const closes: number[] = [94, 96, 98, 100];
	for (let i = 1; i <= 5; i++) closes.push(100 - ((100 - valley) * i) / 5); // idx 4..8 → 谷は idx=8
	for (let i = 1; i <= 5; i++) closes.push(valley + ((100 - valley) * i) / 5); // idx 9..13 → 山2 は idx=13
	for (let i = 1; i <= 12; i++) closes.push(100 - i); // idx 14..25 下落
	return closes.map((c, i) => mkCandle(i, c));
}

async function detect(candles: Candle[], tf: string, want: 'double_top' | 'double_bottom') {
	vi.mocked(analyzeIndicators).mockResolvedValueOnce(
		asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
	);
	const res = (await detectPatterns('btc_jpy', tf, candles.length, {
		patterns: [want],
		swingDepth: 2,
		includeForming: true,
		includeCompleted: true,
		view: 'debug',
	})) as {
		ok: boolean;
		data?: { patterns?: Array<{ type: string; status?: string }> };
		meta?: { debug?: { candidates?: Array<{ type: string; accepted: boolean; reason?: string; status?: string }> } };
	};
	expect(res.ok).toBe(true);
	const candidates = res.meta?.debug?.candidates ?? [];
	return {
		patterns: res.data?.patterns ?? [],
		reasons: candidates.filter((c) => !c.accepted).map((c) => c.reason),
		acceptedStatuses: candidates.filter((c) => c.accepted).map((c) => c.status),
	};
}

describe('形成中 double のサイズ検査（issue #169）', () => {
	describe('形成中ダブルボトム: 深さ（depthPct）', () => {
		// 谷 100 / 100、山 104 → 両脚 (104-100)/104 = 3.85% ≥ 3% で高さは通り、
		// 深さ (104-100)/100 = 4% < 5% で落ちる。
		const legPct = (104 - 100) / 104;
		const depth = (104 - 100) / 100;

		it('前提: この形は 1day の heightPct を超え depthPct を割る（帯の内側）', () => {
			expect(legPct).toBeGreaterThanOrEqual(DAY.heightPct);
			expect(depth).toBeLessThan(DAY.depthPct);
		});

		it('1day: 高さは通るが深さで落ち、forming_peak_too_shallow が記録される', async () => {
			const r = await detect(buildFormingDoubleBottom(104), '1day', 'double_bottom');
			expect(r.patterns).toHaveLength(0);
			expect(r.reasons).toContain('forming_peak_too_shallow');
			// 高さの段（両脚チェック）では落ちていない
			expect(r.reasons).not.toContain('forming_pattern_height_below_min');
		});

		it('1day: 完成済みパスは同じ 3 点を peak_too_shallow で落とす（形成中と判定が一致する）', async () => {
			const r = await detect(buildFormingDoubleBottom(104), '1day', 'double_bottom');
			// 同じ谷1 / 山 / 谷2 に対し、完成済みパスの `peak_too_shallow` と
			// 形成中パスの `forming_peak_too_shallow` が同じ候補一覧に並ぶ。
			expect(r.reasons).toContain('peak_too_shallow');
			expect(r.reasons).toContain('forming_peak_too_shallow');
		});

		it('1hour: 同じ値動きは閾値が緩いので検出される（時間足別テーブル / #152）', async () => {
			expect(depth).toBeGreaterThanOrEqual(HOUR.depthPct);
			const r = await detect(buildFormingDoubleBottom(104), '1hour', 'double_bottom');
			expect(r.patterns.map((p) => p.type)).toContain('double_bottom');
			expect(r.patterns[0]?.status).toBe('forming');
			expect(r.reasons).not.toContain('forming_peak_too_shallow');
		});

		it('1day: 深さを満たす形（山 105）はこれまでどおり検出される', async () => {
			expect((105 - 100) / 100).toBeGreaterThanOrEqual(DAY.depthPct);
			const r = await detect(buildFormingDoubleBottom(105), '1day', 'double_bottom');
			expect(r.patterns.map((p) => p.type)).toContain('double_bottom');
			expect(r.patterns[0]?.status).toBe('forming');
		});

		it('1day: 両脚の高さチェック（forming_pattern_height_below_min）は残っている（#166）', async () => {
			// 山 102 → 両脚 (102-100)/102 = 1.96% < 3%。深さの段より前に落ちる。
			expect((102 - 100) / 102).toBeLessThan(DAY.heightPct);
			const r = await detect(buildFormingDoubleBottom(102), '1day', 'double_bottom');
			expect(r.patterns).toHaveLength(0);
			expect(r.reasons).toContain('forming_pattern_height_below_min');
			expect(r.reasons).not.toContain('forming_peak_too_shallow');
		});
	});

	describe('形成中ダブルトップ: 高さ（heightPct）と深さ（depthPct）', () => {
		it('1day: 山 100 / 谷 96 / 暫定山 100 は深さ 4% < 5% で落ちる', async () => {
			expect((100 - 96) / 100).toBeGreaterThanOrEqual(DAY.heightPct);
			expect((100 - 96) / 100).toBeLessThan(DAY.depthPct);
			const r = await detect(buildFormingDoubleTop(96), '1day', 'double_top');
			expect(r.patterns).toHaveLength(0);
			expect(r.reasons).toContain('forming_valley_too_shallow');
		});

		it('1day: 山 100 / 谷 98 / 暫定山 100 は高さ 2% < 3% で落ちる（修正前は検査ゼロで通っていた）', async () => {
			expect((100 - 98) / 100).toBeLessThan(DAY.heightPct);
			const r = await detect(buildFormingDoubleTop(98), '1day', 'double_top');
			expect(r.patterns).toHaveLength(0);
			expect(r.reasons).toContain('forming_pattern_too_small');
		});

		it('1day: 深さも満たす形（谷 95）はこれまでどおり検出される', async () => {
			expect((100 - 95) / 100).toBeGreaterThanOrEqual(DAY.depthPct);
			const r = await detect(buildFormingDoubleTop(95), '1day', 'double_top');
			expect(r.patterns.map((p) => p.type)).toContain('double_top');
			expect(r.patterns[0]?.status).toBe('forming');
		});

		it('1hour: 同じ値動き（谷 96 / 谷 98）はどちらも検出される（時間足別テーブル / #152）', async () => {
			expect((100 - 98) / 100).toBeGreaterThanOrEqual(HOUR.depthPct);
			for (const valley of [96, 98]) {
				const r = await detect(buildFormingDoubleTop(valley), '1hour', 'double_top');
				expect(r.patterns.map((p) => p.type)).toContain('double_top');
				expect(r.patterns[0]?.status).toBe('forming');
			}
		});

		it('高さ検査は深さ検査の冗長ではない: 暫定山2 が山1 を上回ると深さだけでは落ちない', async () => {
			// 山1 100 / 谷 99.5 / 暫定山2 101.5。押しは 0.5% しかないのに、暫定山2 が山1 を
			// 1.5% 上回るぶん `peakAvg` が持ち上がり、深さは 1hour の 1.04% を超えてしまう。
			// 高さ（暫定点を見ない）だけがこの形を落とせる。
			const height = (100 - 99.5) / 100;
			const depth = ((100 + 101.5) / 2 - 99.5) / ((100 + 101.5) / 2);
			expect(height).toBeLessThan(HOUR.heightPct);
			expect(depth).toBeGreaterThanOrEqual(HOUR.depthPct);

			const r = await detect(buildFormingDoubleTop(99.5, 101.5), '1hour', 'double_top');
			expect(r.patterns).toHaveLength(0);
			expect(r.reasons).toContain('forming_pattern_too_small');
		});

		it('1day: 完成済みパスは同じ 3 水準を valley_too_shallow で落とす（形成中と判定が一致する）', async () => {
			const forming = await detect(buildFormingDoubleTop(96), '1day', 'double_top');
			const completed = await detect(buildCompletedShapeDoubleTop(96), '1day', 'double_top');
			expect(forming.reasons).toContain('forming_valley_too_shallow');
			expect(completed.reasons).toContain('valley_too_shallow');
			expect(completed.patterns).toHaveLength(0);
		});
	});
});
