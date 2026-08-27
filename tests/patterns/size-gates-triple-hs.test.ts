/**
 * issue #138 欠陥 2-2 の回帰テスト — triple / H&S のサイズ検査。
 *
 * `detect_doubles.ts` だけが持っていた `MIN_PATTERN_HEIGHT_PCT` / `MIN_DEPTH_PCT` の
 * 検査を `structural.ts` に引き上げ、`detect_triples.ts` / `detect_hs.ts` へ横展開した。
 * 修正前は **double なら弾かれる小ささのレンジ往復が、その上端と下端を別々に拾われて
 * `triple_top` と `triple_bottom` の両方として同時に検出**されていた
 * （BTC/JPY 1時間足・パターン高さ 1.66%）。
 *
 * 合成データなので閾値そのものの妥当性は担保できない（閾値に合わせて作れてしまう）。
 * ここで固定するのは **「double と同じ値で弾かれること」と「弾く方向に振りすぎて
 * いないこと」** の 2 点。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dayjs } from '../../lib/datetime.js';
import { MIN_DEPTH_PCT, MIN_PATTERN_HEIGHT_PCT, validatePatternSize } from '../../tools/patterns/structural.js';
import { asMockResult } from '../_assertResult.js';

vi.mock('../../tools/analyze_indicators.js', () => ({ default: vi.fn() }));

import analyzeIndicators from '../../tools/analyze_indicators.js';
import detectPatterns from '../../tools/detect_patterns.js';

type Candle = { isoTime: string; open: number; high: number; low: number; close: number; volume: number };

const pv = (extremePrice: number) => ({ extremePrice });

/** 固定の起点から h 時間後。相対時刻にしないのは実行日でパターンが動かないようにするため。 */
function isoAtHour(h: number): string {
	return dayjs.utc('2026-08-24T00:00:00Z').add(h, 'hour').toISOString();
}

function mkCandle(h: number, close: number): Candle {
	const wick = Math.round(close * 0.0004);
	return { isoTime: isoAtHour(h), open: close, high: close + wick, low: close - wick, close, volume: 100 };
}

/**
 * 山 `hi` / 谷 `lo` を 10 本ずつで往復するレンジ相場を 91 本作る。
 * 端をコサインでなだらかにして、折り返し 1 本だけが極値になるようにしている。
 */
function buildRangeCandles(lo: number, hi: number): Candle[] {
	const closes: number[] = [lo];
	let up = true;
	for (let seg = 0; seg < 9; seg++) {
		const from = up ? lo : hi;
		const to = up ? hi : lo;
		for (let k = 1; k <= 10; k++) {
			const ease = 0.5 - 0.5 * Math.cos((Math.PI * k) / 10);
			closes.push(Math.round(from + (to - from) * ease));
		}
		up = !up;
	}
	return closes.map((close, i) => mkCandle(i, close));
}

async function detectOnRange(lo: number, hi: number) {
	const candles = buildRangeCandles(lo, hi);
	vi.mocked(analyzeIndicators).mockResolvedValueOnce(
		asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
	);
	const res = (await detectPatterns('btc_jpy', '1hour', candles.length, {
		includeForming: true,
		includeCompleted: true,
		view: 'debug',
	})) as {
		data?: { patterns?: Array<{ type: string }> };
		meta?: { debug?: { candidates?: Array<{ type: string; accepted: boolean; reason?: string }> } };
	};
	return {
		types: (res.data?.patterns ?? []).map((p) => p.type),
		candidates: res.meta?.debug?.candidates ?? [],
	};
}

describe('validatePatternSize', () => {
	it('パターン高さが MIN_PATTERN_HEIGHT_PCT 未満なら pattern_too_small', () => {
		// 全振幅 2%（< 3%）
		expect(validatePatternSize('top', [pv(100), pv(98), pv(100), pv(98), pv(100)])).toBe('pattern_too_small');
		expect(validatePatternSize('bottom', [pv(98), pv(100), pv(98), pv(100), pv(98)])).toBe('pattern_too_small');
	});

	it('高さは足りていても押しが浅ければ valley_too_shallow / peak_too_shallow', () => {
		// 高さは 1 つ目の谷で 10% 稼ぎ、2 つ目の谷の押しだけ 3%（< 5%）にする
		expect(validatePatternSize('top', [pv(100), pv(90), pv(100), pv(97), pv(100)])).toBe('valley_too_shallow');
		expect(validatePatternSize('bottom', [pv(90), pv(100), pv(90), pv(93), pv(90)])).toBe('peak_too_shallow');
	});

	it('高さも押しも足りていれば null', () => {
		expect(validatePatternSize('top', [pv(100), pv(90), pv(100), pv(90), pv(100)])).toBeNull();
		expect(validatePatternSize('bottom', [pv(90), pv(100), pv(90), pv(100), pv(90)])).toBeNull();
	});

	it('押しの深さは「両隣の平均」で測る（double の peakAvg = (a + c) / 2 の一般化）', () => {
		// 1 つ目の谷 105 の両隣は 100 / 120 → 平均 110。押しは 4.5% で不合格。
		// 山の全体平均（(100 + 120 + 140) / 3 = 120）で測ると 12.5% になり合格してしまう配置で、
		// H&S の頭が平均を押し上げて肩-ネックライン間の浅さを隠すのと同じ形。
		expect(validatePatternSize('top', [pv(100), pv(105), pv(120), pv(100), pv(140)])).toBe('valley_too_shallow');
	});

	it('3 点なら double の検査と同じ形に縮退する', () => {
		// 高さ 4%（>= 3%）だが押しが 4%（< 5%）。double の validateTopSize と同じ判定。
		expect(validatePatternSize('top', [pv(100), pv(96), pv(100)])).toBe('valley_too_shallow');
		expect(validatePatternSize('top', [pv(100), pv(90), pv(100)])).toBeNull();
	});

	it('構成点が 3 点未満 / 非有限値なら判定しない（素通し）', () => {
		expect(validatePatternSize('top', [pv(100), pv(90)])).toBeNull();
		expect(validatePatternSize('top', [pv(100), pv(Number.NaN), pv(100)])).toBeNull();
	});

	it('閾値は double と同値', () => {
		expect(MIN_PATTERN_HEIGHT_PCT).toBe(0.03);
		expect(MIN_DEPTH_PCT).toBe(0.05);
	});
});

describe('detect_patterns: triple / H&S のサイズ検査（issue #138 欠陥 2-2）', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('高さ 1.55% のレンジ往復が triple_top / triple_bottom として同時検出されない', async () => {
		// issue #138 の実例（BTC/JPY 1hour, 谷 12,521,114 〜 山 12,726,672 の約 1.6%）に相当。
		// 修正前はこの 1 本の系列から triple_top と triple_bottom が両方返っていた。
		const { types, candidates } = await detectOnRange(12_525_000, 12_720_000);

		expect(types.filter((t) => t === 'triple_top')).toHaveLength(0);
		expect(types.filter((t) => t === 'triple_bottom')).toHaveLength(0);

		// 別経路の silent reject で落ちていないことを担保するため理由コードを明示的に見る。
		// double と同じ命名で view=debug に出ること（issue #138 の受け入れ条件）。
		for (const type of ['triple_top', 'triple_bottom']) {
			expect(candidates.some((c) => c.type === type && !c.accepted && c.reason === 'pattern_too_small')).toBe(true);
		}
		// 同じ系列で double も同じ理由で落ちている＝「double なら弾かれる小ささ」の裏取り。
		expect(candidates.some((c) => c.type === 'double_top' && c.reason === 'pattern_too_small')).toBe(true);
	});

	it('同じ形でも値幅が十分ならサイズ検査では落ちない（過剰棄却の回帰）', async () => {
		// 上と同一の形状で振幅だけを 15.4% に広げたもの。**サイズ検査の理由コードが出ないこと**で
		// 過剰棄却を見る。
		//
		// 旧版はここで `types` に triple_top / triple_bottom が入ることを見ていたが、
		// #138 欠陥 2-1（構造ゲートの横展開）以降、**先行トレンドの無い純粋なレンジの往復は
		// 構造ゲート側で落ちる**（戻り率 = 1.0 → `retracement_out_of_band`）。落ちる理由が
		// サイズ検査から構造ゲートに移っただけで、サイズ検査が過剰に弾いていないことは
		// 理由コードで直接確認できる。先行トレンドを伴う形が残ることは
		// `tests/patterns/structural-gates-triple-hs.test.ts` が固定する。
		const { candidates } = await detectOnRange(11_000_000, 12_700_000);
		const sizeReasons = ['pattern_too_small', 'valley_too_shallow', 'peak_too_shallow'];
		for (const type of ['triple_top', 'triple_bottom']) {
			expect(candidates.filter((c) => c.type === type && sizeReasons.includes(String(c.reason)))).toHaveLength(0);
			// **両種別について**構成点まで到達していること（別経路の silent reject で消えている
			// わけではないこと）の裏取り。片方だけ見ると、もう片方がサイズ検査より手前で
			// 落ちていても上の「サイズ系の理由が 0 件」が空振りで通ってしまう。
			expect(candidates.some((c) => c.type === type && c.reason === 'retracement_out_of_band')).toBe(true);
		}
	});
});
