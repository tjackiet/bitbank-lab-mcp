/**
 * detectPatternsViewsHandler ブランチカバレッジテスト
 * 純粋関数群を直接テスト（mock 不要）
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	buildDetectionRouteLine,
	buildTypeSummary,
	formatDebugView,
	formatDetailedView,
	formatFullView,
	formatPatternLine,
	formatSummaryView,
	REJECTION_CROSS_TOTAL_LABEL,
} from '../src/handlers/detectPatternsViewsHandler.js';
import { TARGET_REACH_MAX_BARS, TARGET_REACHED_PCT_CAP } from '../tools/patterns/target-reach.js';
import type { PatternEntry } from '../tools/patterns/types.js';

afterEach(() => {
	vi.resetAllMocks();
});

// ── helpers ──

function makePattern(overrides: Partial<PatternEntry> = {}): PatternEntry {
	return {
		type: 'double_top',
		confidence: 0.75,
		range: { start: '2026-01-01T00:00:00.000Z', end: '2026-01-20T00:00:00.000Z' },
		pivots: [
			{ idx: 0, price: 100000, kind: 'H', extremePrice: 101000 },
			{ idx: 5, price: 90000, kind: 'L', extremePrice: 89000 },
			{ idx: 10, price: 100000, kind: 'H', extremePrice: 101000 },
		],
		...overrides,
	};
}

// `effective_params` は #184 で per-parameter の `{ value, source }` になった
// （旧: `{ tolerancePct: 0.04 }`）。**入力値ではなく解決後の実効値**を持つ。
const emptyMeta = {
	debug: { swings: [], candidates: [] },
	effective_params: {
		swingDepth: { value: 6, source: 'auto' as const },
		minBarsBetweenSwings: { value: 4, source: 'auto' as const },
		tolerancePct: { value: 0.04, source: 'auto' as const },
		headProminencePct: { value: 0.04, source: 'auto' as const },
	},
};

const emptyRes = {
	ok: true,
	summary: 'ok',
	data: { patterns: [], overlays: null },
	meta: {},
};

// buildPeriodLine（現 buildPatternSpanLine）は tools/patterns/period.ts へ移設した。
// テストは tests/patterns/period.test.ts を参照。

// ── buildTypeSummary ──

describe('buildTypeSummary', () => {
	it('種別別カウントを返す', () => {
		const pats = [makePattern(), makePattern({ type: 'pennant' }), makePattern()];
		const result = buildTypeSummary(pats);
		expect(result).toContain('double_top×2');
		expect(result).toContain('pennant×1');
	});

	it('type が undefined のとき unknown にグループ化する', () => {
		const pats = [{} as PatternEntry];
		expect(buildTypeSummary(pats)).toContain('unknown×1');
	});
});

// ── formatCandidateDetails (formatDebugView 経由で間接テスト) ──

function makeDebugViewRes() {
	return {
		ok: true as const,
		summary: 'debug',
		data: { patterns: [], overlays: null },
		meta: {},
	};
}

// biome-ignore lint/suspicious/noExplicitAny: test fixture
function makeMeta(candidates: any[]) {
	return {
		debug: {
			swings: [{ kind: 'peak', idx: 3, price: 100000, isoTime: '2026-01-03T00:00:00.000Z' }],
			candidates,
		},
	};
}

describe('formatDebugView / formatCandidateDetails', () => {
	it('details がない候補を "details: none" と表示する', () => {
		const meta = makeMeta([{ type: 'wedge', accepted: false, reason: 'probe_window' }]);
		const res = formatDebugView('hdr', meta, [], makeDebugViewRes());
		const text = res.content[0].text;
		expect(text).toContain('details: none');
	});

	it('type_classification_failed の詳細を表示する', () => {
		const meta = makeMeta([
			{
				type: 'wedge',
				accepted: false,
				reason: 'type_classification_failed',
				details: { failureReason: 'slope diverges', slopeHigh: 0.001, slopeLow: -0.002, slopeRatio: 0.5 },
			},
		]);
		const res = formatDebugView('hdr', meta, [], makeDebugViewRes());
		const text = res.content[0].text;
		expect(text).toContain('failureReason: slope diverges');
		expect(text).toContain('slopeRatio: 0.500');
	});

	it('probe_window の詳細を表示する', () => {
		const meta = makeMeta([
			{
				type: 'triangle',
				accepted: false,
				reason: 'probe_window',
				details: {
					slopeHigh: 0.002,
					slopeLow: 0.001,
					priceRange: 5000,
					barsSpan: 20,
					minMeaningfulSlope: 0.0005,
					highsIn: [{ index: 0, price: 100000 }],
					lowsIn: [{ index: 2, price: 95000 }],
				},
			},
		]);
		const res = formatDebugView('hdr', meta, [], makeDebugViewRes());
		const text = res.content[0].text;
		expect(text).toContain('upper.slope');
		expect(text).toContain('barsSpan');
	});

	it('declining_highs の詳細を表示する', () => {
		const meta = makeMeta([
			{
				type: 'wedge',
				accepted: false,
				reason: 'declining_highs',
				details: { highsCount: 5, firstAvg: 102000, secondAvg: 98000, ratio: 0.96 },
			},
		]);
		const res = formatDebugView('hdr', meta, [], makeDebugViewRes());
		const text = res.content[0].text;
		expect(text).toContain('declining_highs: true');
		expect(text).toContain('1st half avg');
	});

	it('declining_highs_probe の詳細を表示する', () => {
		const meta = makeMeta([
			{
				type: 'wedge',
				accepted: false,
				reason: 'declining_highs_probe',
				details: { highsCount: 4, firstAvg: 101000, secondAvg: 99000, ratio: 0.98 },
			},
		]);
		const res = formatDebugView('hdr', meta, [], makeDebugViewRes());
		const text = res.content[0].text;
		expect(text).toContain('declining_highs_probe: metrics');
	});

	it('rising_probe の詳細を表示する', () => {
		const meta = makeMeta([
			{
				type: 'wedge',
				accepted: false,
				reason: 'rising_probe',
				details: {
					r2High: 0.9,
					r2Low: 0.85,
					slopeHigh: 0.001234,
					slopeLow: 0.000567,
					slopeRatioLH: 2.1,
					priceRange: 10000,
					barsSpan: 30,
					minMeaningfulSlope: 0.00012,
					highsIn: [],
					lowsIn: [],
					firstAvg: 100000,
					secondAvg: 105000,
					ratio: 1.05,
				},
			},
		]);
		const res = formatDebugView('hdr', meta, [], makeDebugViewRes());
		const text = res.content[0].text;
		expect(text).toContain('r2: hi=');
		expect(text).toContain('slopeRatioLH');
	});

	it('post_filter_rising_highs_not_declining の詳細を表示する', () => {
		const meta = makeMeta([
			{
				type: 'wedge',
				accepted: false,
				reason: 'post_filter_rising_highs_not_declining',
				details: { highsCount: 6, firstAvg: 98000, secondAvg: 103000, ratio: 1.05 },
			},
		]);
		const res = formatDebugView('hdr', meta, [], makeDebugViewRes());
		const text = res.content[0].text;
		expect(text).toContain('post_filter: rising highs not declining');
	});

	it('post_filter_falling_lows_not_rising の詳細を表示する', () => {
		const meta = makeMeta([
			{
				type: 'wedge',
				accepted: false,
				reason: 'post_filter_falling_lows_not_rising',
				details: { lowsCount: 5, firstAvg: 99000, secondAvg: 94000, ratio: 0.95 },
			},
		]);
		const res = formatDebugView('hdr', meta, [], makeDebugViewRes());
		const text = res.content[0].text;
		expect(text).toContain('post_filter: falling lows not rising');
	});

	// default ケース（専用フォーマッタを持たない reason）: details の実フィールドを列挙する。
	// 以前は存在しないフィールド名（spreadStart / hiSlope 等）を決め打ちで読んでいたため、
	// 実際の検出器の details（r2 / touches / score …）が 1 つも表示されず
	// `spread: n/a` としか出なかった（#124）。
	it('default ケース: details の実フィールドを列挙する', () => {
		const meta = makeMeta([
			{
				type: 'rising_wedge',
				accepted: false,
				reason: 'r2_below_threshold',
				details: { r2High: 0.31, r2Low: 0.42, slopeHigh: 0.001, slopeLow: -0.001, r2MinRequired: 0.5 },
			},
		]);
		const res = formatDebugView('hdr', meta, [], makeDebugViewRes());
		const text = res.content[0].text;
		expect(text).toContain('r2High: 0.31');
		expect(text).toContain('r2Low: 0.42');
		expect(text).toContain('r2MinRequired: 0.5');
		expect(text).toContain('slopeHigh: 0.001');
	});

	it('default ケース: 存在しないフィールドを n/a として捏造しない', () => {
		const meta = makeMeta([
			{
				type: 'rising_wedge',
				accepted: false,
				reason: 'insufficient_touches',
				details: { upperTouches: 1, lowerTouches: 2, minRequired: 3 },
			},
		]);
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;
		expect(text).toContain('upperTouches: 1');
		expect(text).not.toContain('spread');
		expect(text).not.toContain('n/a');
	});

	it('default ケース: details が空オブジェクトなら (no fields)', () => {
		const meta = makeMeta([{ type: 'rising_wedge', accepted: false, reason: 'unknown_reason', details: {} }]);
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;
		expect(text).toContain('details: (no fields)');
	});

	it('default ケース: 価格スケールの値は丸めて表示し、ネストは短縮 JSON にする', () => {
		const meta = makeMeta([
			{
				type: 'rising_wedge',
				accepted: false,
				reason: 'score_below_threshold',
				details: { priceRange: 1234567.891, components: { fit: 0.4, touch: 0.2 } },
			},
		]);
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;
		expect(text).toContain('priceRange: 1,234,568');
		expect(text).toContain('components: {"fit":0.4,"touch":0.2}');
	});

	it('accepted=true の候補に ✅ を付与する', () => {
		const meta = makeMeta([
			{ type: 'wedge', accepted: true, reason: 'ok', points: [{ role: 'hi', idx: 3, price: 100000 }] },
		]);
		const res = formatDebugView('hdr', meta, [], makeDebugViewRes());
		expect(res.content[0].text).toContain('✅');
	});

	it('スイングなし・候補なしのとき "なし" を表示する', () => {
		const meta = { debug: { swings: [], candidates: [] } };
		const res = formatDebugView('hdr', meta, [], makeDebugViewRes());
		const text = res.content[0].text;
		expect(text).toContain('なし');
	});
});

// ── cap トリムの申告行（issue #180） ──

describe('formatDebugView: cap トリムの申告行（#180）', () => {
	const cands = [
		{ type: 'triple_bottom', accepted: true },
		{ type: 'triple_bottom', accepted: false, reason: 'peaks_missing_relaxed' },
	];

	it('省略があるとき「N / 全 M 件（K 件省略）」と落ちた側の説明を出す', () => {
		const meta = {
			debug: {
				swings: [{ kind: 'peak', idx: 3, price: 100000, isoTime: '2026-01-03T00:00:00.000Z' }],
				candidates: cands,
				candidatesTotal: 289,
				candidatesOmitted: 287,
				swingsTotal: 5,
				swingsOmitted: 4,
			},
		};
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;
		// candidates は accepted 優先で残すので落ちるのは棄却理由、
		// swings は先頭から残すので落ちるのは直近側。**逆向き**であることまで出す。
		expect(text).toContain(
			'【Candidates】 2 / 全 289 件（287 件省略。accepted は全件残っているため省略分はすべて棄却理由）',
		);
		expect(text).toContain('【Swings】 1 / 全 5 件（4 件省略。先頭から残すため省略分はすべて直近側のスイング）');
	});

	/**
	 * トリムは `[...accepted, ...rejected]` を先頭から cap 件残すだけなので、**accepted が cap を
	 * 超えれば accepted も押し出される**。返却分が全件 accepted のときがその状態で、
	 * 「省略分はすべて棄却理由」と言い切ると嘘になる（本 PR が直そうとしている種類の嘘）。
	 */
	it('返却分が全件 accepted のときは「棄却理由だけ」と言い切らない', () => {
		const meta = {
			debug: {
				swings: [],
				candidates: [
					{ type: 'triple_bottom', accepted: true },
					{ type: 'triple_top', accepted: true },
				],
				candidatesTotal: 300,
				candidatesOmitted: 298,
				swingsTotal: 0,
				swingsOmitted: 0,
			},
		};
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;
		expect(text).toContain(
			'【Candidates】 2 / 全 300 件（298 件省略。accepted が cap を埋めており省略分に accepted も含まれうる）',
		);
		expect(text).not.toContain('すべて棄却理由');
	});

	it('省略が 0 のとき「省略なし」と明示する', () => {
		const meta = {
			debug: {
				swings: [],
				candidates: cands,
				candidatesTotal: 2,
				candidatesOmitted: 0,
				swingsTotal: 0,
				swingsOmitted: 0,
			},
		};
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;
		expect(text).toContain('【Candidates】 2 / 全 2 件（省略なし）');
		expect(text).toContain('【Swings】 0 / 全 0 件（省略なし）');
	});

	/**
	 * 件数が分からないときに「省略なし」と書くと、本 issue が直そうとしている嘘
	 * （切られたのに切られたと分からない）をそのまま再導入することになる。
	 * 申告フィールドが無い meta では**行ごと出さない**。
	 */
	it('申告フィールドが無い meta では件数行を出さない', () => {
		const meta = makeMeta(cands);
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;
		expect(text).toContain('【Candidates】\n');
		expect(text).toContain('【Swings】\n');
		expect(text).not.toContain('省略なし');
		expect(text).not.toContain('件省略');
	});
});

// ── 棄却理由の集計ブロック（issue #191 A） ──

/**
 * 集計ブロックの type 行を読み戻す。**文言ではなく数字の整合を検証するため**の parser で、
 * 「行の合計 = 上に書いた rejected 件数」が崩れていないかをここで機械的に見る
 * （LLM に手集計させたときに壊れたのがまさにこの整合。#191 の起票根拠）。
 */
function parseRejectionRows(text: string): Array<{ type: string; count: number; reasons: Array<[string, number]> }> {
	const rows: Array<{ type: string; count: number; reasons: Array<[string, number]> }> = [];
	for (const line of text.split('\n')) {
		const m = line.match(/^\s+- (\S+) (\d+) 件: (.+)$/u);
		if (!m) continue;
		const reasons = m[3].split(' / ').map((part) => {
			const r = part.match(/^(.+) (\d+)$/u);
			return [r ? r[1] : part, r ? Number(r[2]) : Number.NaN] as [string, number];
		});
		rows.push({ type: m[1], count: Number(m[2]), reasons });
	}
	return rows;
}

/** 残余行（`- （他 N 種別）M 件`）。畳んだ分も合計に入れ続けることの検証に使う。 */
function parseRestRow(text: string): { types: number; count: number } | null {
	const m = text.match(/^\s+- （他 (\d+) 種別）(\d+) 件$/mu);
	return m ? { types: Number(m[1]), count: Number(m[2]) } : null;
}

/**
 * reason 単独の横断合計行（`▼ reason 横断合計（…）` の次行）を読み戻す（#193 B-1）。
 * type 行と同じく**文言ではなく数字の整合**を見る parser。行が無ければ `null`
 * （「出していない」と「合計が 0」を呼び出し側で区別できるようにする）。
 */
function parseCrossTotalRow(text: string): Array<[string, number]> | null {
	const lines = text.split('\n');
	const i = lines.findIndex((line) => line.startsWith(REJECTION_CROSS_TOTAL_LABEL));
	if (i < 0) return null;
	const m = lines[i + 1]?.match(/^\s+- (.+)$/u);
	if (!m) return null;
	return m[1].split(' / ').map((part) => {
		const r = part.match(/^(.+) (\d+)$/u);
		return [r ? r[1] : part, r ? Number(r[2]) : Number.NaN] as [string, number];
	});
}

const rejects = (type: string, reason: string | undefined, n: number) =>
	Array.from({ length: n }, () => ({ type, accepted: false, ...(reason === undefined ? {} : { reason }) }));

describe('formatDebugView: 棄却理由の集計ブロック（#191 A）', () => {
	it('cap 省略なし: 分母を書き切り、type 別 → reason 別の内訳の合計が rejected と一致する', () => {
		const candidates = [
			{ type: 'triple_top', accepted: true },
			...rejects('triple_top', 'peaks_not_equal', 5),
			...rejects('triple_top', 'valleys_missing', 3),
			...rejects('double_bottom', 'no_breakout', 2),
		];
		const meta = {
			debug: { swings: [], candidates, candidatesTotal: 11, candidatesOmitted: 0, swingsTotal: 0, swingsOmitted: 0 },
		};
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;

		// 分母は 3 つとも書く。**読み手に引き算をさせない**（#191 要件 1）
		expect(text).toContain('▼ 候補の内訳: 全 11 件 = accepted 1 件 + rejected 10 件（cap 省略なし＝全候補の内訳）');
		expect(text).toContain('▼ 棄却理由の内訳（type 別 → reason 別。合計は上の rejected 10 件と一致する）');
		expect(text).toContain('   - triple_top 8 件: peaks_not_equal 5 / valleys_missing 3');
		expect(text).toContain('   - double_bottom 2 件: no_breakout 2');

		const rows = parseRejectionRows(text);
		// 件数の多い type が先。同数なら type 名の昇順（並びは実装で固定してある）
		expect(rows.map((r) => r.type)).toEqual(['triple_top', 'double_bottom']);
		expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(10);
		for (const row of rows) expect(row.reasons.reduce((sum, [, n]) => sum + n, 0)).toBe(row.count);

		// 集計ブロックは**列挙より前**（長いリストを読み切る前に全体像が要る）
		expect(text.indexOf('▼ 候補の内訳')).toBeGreaterThan(text.indexOf('【Candidates】'));
		expect(text.indexOf('▼ 棄却理由の内訳')).toBeLessThan(text.indexOf('❌ = 候補段階の棄却'));
	});

	/**
	 * cap 飽和時（#191 要件 2 / 3）。**「棄却理由の内訳 183 件」とだけ書くと 289 件の内訳だと誤読される。**
	 * censored な内訳からの誤帰属は #152 → #167 / #172 で実際に起きているので、ここで文言を固定する。
	 */
	it('cap 飽和: 集計が「表示分のみ」であることを明記し、見出しの申告値と食い違わない', () => {
		const candidates = [
			...Array.from({ length: 17 }, () => ({ type: 'triple_top', accepted: true })),
			...rejects('rising_wedge', 'no_convergence', 100),
			...rejects('rising_wedge', 'r2_below_threshold', 43),
			...rejects('triple_bottom', 'peaks_missing', 40),
		];
		expect(candidates).toHaveLength(200);
		const meta = {
			debug: {
				swings: [],
				candidates,
				candidatesTotal: 289,
				candidatesOmitted: 89,
				swingsTotal: 0,
				swingsOmitted: 0,
			},
		};
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;

		// 見出し（#180）と集計（#191）は同じ申告値から組む。数字が食い違って見えないこと
		expect(text).toContain(
			'【Candidates】 200 / 全 289 件（89 件省略。accepted は全件残っているため省略分はすべて棄却理由）',
		);
		expect(text).toContain(
			'▼ 候補の内訳: 表示 200 件 = accepted 17 件 + rejected 183 件（全 289 件のうち 89 件は cap で省略されており、**この集計に入っていない**）',
		);
		expect(text).toContain(
			'▼ 棄却理由の内訳（type 別 → reason 別。合計は上の rejected 183 件と一致する。**全 289 件の内訳ではない**）',
		);

		// 合計は 200 − accepted であって 289 ではない（#191 要件 3）
		const rows = parseRejectionRows(text);
		expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(183);
		expect(text).not.toContain('全 289 件 = accepted');
	});

	/**
	 * 総数の申告が無い meta（ハンドラ直呼び等）。`formatTrimNote` が見出し行ごと落とすのと同じ理由で、
	 * 「全 N 件」と書くと本 issue が禁じている censored な内訳の誤帰属を再導入する。
	 */
	it('総数の申告が無い meta では「受け取った N 件」と書き、省略の有無を断定しない', () => {
		const text = formatDebugView('hdr', makeMeta(rejects('triple_top', 'peaks_not_equal', 3)), [], makeDebugViewRes())
			.content[0].text;
		expect(text).toContain(
			'▼ 候補の内訳: 受け取った 3 件 = accepted 0 件 + rejected 3 件（総数の申告が無いため cap 省略の有無は不明。この集計は受け取った分のみ）',
		);
		expect(text).not.toContain('全 3 件 =');
		expect(text).not.toContain('cap 省略なし');
	});

	it('rejected が 0 件のとき「なし（rejected 0 件）」と明示する（集計を出していないのと区別する）', () => {
		const meta = makeMeta([
			{ type: 'triple_top', accepted: true },
			{ type: 'triple_bottom', accepted: true },
		]);
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;
		expect(text).toContain('▼ 候補の内訳: 受け取った 2 件 = accepted 2 件 + rejected 0 件');
		expect(text).toContain('▼ 棄却理由の内訳: なし（rejected 0 件）');
	});

	/**
	 * `reason` だけに畳むと `triple_bottom:valleys_missing` と `double_bottom:valleys_missing` が
	 * 同じ行に潰れて帰属が読めなくなる（#191 要件 4）。**type で分けることを固定する。**
	 */
	it('type が違えば同じ reason でも行を分ける', () => {
		const meta = makeMeta([
			...rejects('triple_bottom', 'valleys_missing', 4),
			...rejects('double_bottom', 'valleys_missing', 2),
		]);
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;
		expect(text).toContain('   - triple_bottom 4 件: valleys_missing 4');
		expect(text).toContain('   - double_bottom 2 件: valleys_missing 2');
	});

	it('type 行が上限（20）を超えたら残余行に畳み、合計は rejected と一致し続ける', () => {
		// 25 種別 × それぞれ件数を変える（件数降順で 20 種が残り、5 種が畳まれる）
		const candidates = Array.from({ length: 25 }, (_, i) =>
			rejects(`type_${String(i).padStart(2, '0')}`, 'r', 25 - i),
		).flat();
		const total = candidates.length;
		const text = formatDebugView('hdr', makeMeta(candidates), [], makeDebugViewRes()).content[0].text;

		const rows = parseRejectionRows(text);
		expect(rows).toHaveLength(20);
		const rest = parseRestRow(text);
		expect(rest?.types).toBe(5);
		// 畳んだ分を落とすと合計が合わなくなる（まさに本 issue が消したい失敗）
		expect(rows.reduce((sum, r) => sum + r.count, 0) + (rest?.count ?? 0)).toBe(total);
	});

	it('reason が上限（10）を超えたら行内で畳み、合計は type の件数と一致し続ける', () => {
		const candidates = Array.from({ length: 13 }, (_, i) =>
			rejects('triple_top', `reason_${String(i).padStart(2, '0')}`, 13 - i),
		).flat();
		const text = formatDebugView('hdr', makeMeta(candidates), [], makeDebugViewRes()).content[0].text;
		const [row] = parseRejectionRows(text);
		expect(row.reasons).toHaveLength(11); // 10 種 + 残余 1
		expect(row.reasons.at(-1)?.[0]).toBe('他 3 種');
		expect(row.reasons.reduce((sum, [, n]) => sum + n, 0)).toBe(row.count);
	});

	it('reason を持たない棄却も (reason なし) として数に入れる', () => {
		const meta = makeMeta([...rejects('triple_top', undefined, 2), ...rejects('triple_top', 'peaks_not_equal', 1)]);
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;
		expect(text).toContain('   - triple_top 3 件: (reason なし) 2 / peaks_not_equal 1');
	});

	it('候補 0 件のときは集計ブロックごと出さない（列挙側の「なし（…）」と二重に言わない）', () => {
		const meta = { debug: { swings: [], candidates: [], candidatesTotal: 0, candidatesOmitted: 0 } };
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;
		expect(text).not.toContain('▼ 候補の内訳');
		expect(text).not.toContain('▼ 棄却理由の内訳');
		expect(text).not.toContain(REJECTION_CROSS_TOTAL_LABEL);
		expect(text).toContain('なし（この窓では要求種別の候補が 1 つも組まれていない');
	});
});

// ── reason 単独の横断合計（issue #193 B-1） ──

/**
 * **起票根拠はライブ実測**（btc_jpy 1hour / `view=debug` / `patterns` 無指定 / cap 飽和 200 件）。
 * 「棄却理由を多い順に 3 つ」を問うたところ LLM が 2 回外している:
 *
 * 1. type 別の数値を横断合計として提示した（`slopes_not_same_direction 58` は falling_wedge の分だけ、
 *    `weaker_slope_ratio_low 28` は rising_wedge の分だけ）
 * 2. 続けて `no_convergence(41) > slopes_not_same_direction(66)` と、**不等号が成立しない**式を書いた
 *
 * 同じ日の `patterns=["triple_top","triple_bottom"]`（62 件。reason と type がほぼ 1 対 1）では
 * 横断集計に成功している。**失敗条件は「reason が type を跨ぐこと」**なので、跨ぎが起きうる
 * ときだけ横断合計を出す。以下のフィクスチャは (1) の実測値をそのまま使い、
 * ツールが出す横断合計が 66 / 47 / 41 になる（= LLM が外した答えの正解）ことを固定する。
 */
describe('formatDebugView: reason 単独の横断合計（#193 B-1）', () => {
	/** ライブ実測（cap 飽和 200 / 全 2,058）に寄せた候補列。両ウェッジに 3 reason が跨る。 */
	const liveLikeCandidates = [
		...Array.from({ length: 38 }, () => ({ type: 'rising_wedge', accepted: true })),
		...rejects('falling_wedge', 'slopes_not_same_direction', 58),
		...rejects('rising_wedge', 'slopes_not_same_direction', 8),
		...rejects('rising_wedge', 'weaker_slope_ratio_low', 28),
		...rejects('falling_wedge', 'weaker_slope_ratio_low', 19),
		...rejects('falling_wedge', 'no_convergence', 25),
		...rejects('rising_wedge', 'no_convergence', 16),
		...rejects('triple_top', 'valleys_missing', 8),
	];

	it('type を跨ぐ reason を合算し、合計が rejected と一致する（LLM が外した 66 / 47 / 41 を出す）', () => {
		const meta = makeMeta(liveLikeCandidates);
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;

		// type 別行は**残したまま**（B-1 は「足す」であって「置き換える」ではない）
		expect(text).toContain(
			'   - falling_wedge 102 件: slopes_not_same_direction 58 / no_convergence 25 / weaker_slope_ratio_low 19',
		);
		expect(text).toContain(
			'   - rising_wedge 52 件: weaker_slope_ratio_low 28 / no_convergence 16 / slopes_not_same_direction 8',
		);

		const cross = parseCrossTotalRow(text);
		// 件数降順。**58 でも 28 でもなく 66 / 47**（LLM は type 別の数値をそのまま横断合計として出した）
		expect(cross).toEqual([
			['slopes_not_same_direction', 66],
			['weaker_slope_ratio_low', 47],
			['no_convergence', 41],
			['valleys_missing', 8],
		]);
		// 不変条件: 横断合計の合計 = rejected 件数（type 別行と同じ分母）
		expect(cross?.reduce((sum, [, n]) => sum + n, 0)).toBe(162);
		expect(text).toContain('rejected 162 件');

		// 帰属は type 別行で見る、を content 側に書く（同じ reason が rising / falling で意味が違うため）
		expect(text).toContain('同じ reason でも type ごとに意味が違いうるので帰属は上の type 別行で見る');
		// 位置は type 別行の**後**（「上の type 別行」が指す先が実際に上にある）
		expect(text.indexOf(REJECTION_CROSS_TOTAL_LABEL)).toBeGreaterThan(text.indexOf('▼ 棄却理由の内訳'));
		expect(text.indexOf(REJECTION_CROSS_TOTAL_LABEL)).toBeLessThan(text.indexOf('❌ = 候補段階の棄却'));
	});

	/**
	 * cap 飽和時（#193 B-1 要件 2）。**横断合計行だけを読んだ人に「母集団の内訳」と誤読させない。**
	 * censored な内訳からの誤帰属は #152 → #167 / #172 で実際に起きているので、
	 * type 別行と**同じ** censored 警告を横断合計行にも付ける。
	 */
	it('cap 飽和: 横断合計行にも「**全 N 件の内訳ではない**」が付く', () => {
		const meta = {
			debug: {
				swings: [],
				candidates: liveLikeCandidates,
				candidatesTotal: 2058,
				candidatesOmitted: 2058 - liveLikeCandidates.length,
			},
		};
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;

		expect(text).toContain(
			`${REJECTION_CROSS_TOTAL_LABEL}（type を跨いで reason だけで合算。同じ reason でも type ごとに意味が違いうるので帰属は上の type 別行で見る。合計は上の rejected 162 件と一致する。**全 2058 件の内訳ではない**）`,
		);
		// 合計は表示分（162）であって母集団（2,058）ではない
		expect(parseCrossTotalRow(text)?.reduce((sum, [, n]) => sum + n, 0)).toBe(162);
	});

	/**
	 * 跨ぎが起こりえない実行（type 1 種別）では出さない。type 行がそのまま横断合計になるので、
	 * 出しても同じ数字を 2 度書くだけで content が太るだけ（#193 要件 4）。
	 */
	it('type が 1 種別のときは出さない（type 行がそのまま横断合計）', () => {
		const meta = makeMeta([
			...rejects('triple_top', 'three_peaks_not_level', 21),
			...rejects('triple_top', 'valleys_missing', 12),
		]);
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;
		expect(text).toContain('   - triple_top 33 件: three_peaks_not_level 21 / valleys_missing 12');
		expect(text).not.toContain(REJECTION_CROSS_TOTAL_LABEL);
	});

	it('rejected が 0 件のときは出さない（「なし（rejected 0 件）」だけ出す）', () => {
		const meta = makeMeta([
			{ type: 'triple_top', accepted: true },
			{ type: 'double_bottom', accepted: true },
		]);
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;
		expect(text).toContain('▼ 棄却理由の内訳: なし（rejected 0 件）');
		expect(text).not.toContain(REJECTION_CROSS_TOTAL_LABEL);
	});

	it('reason が上限（10）を超えたら `他 N 種 M` に畳み、合計は rejected と一致し続ける', () => {
		// 13 種の reason を 2 type に散らす（どの reason も両 type に跨る = 横断合計が意味を持つ形）
		const candidates = Array.from({ length: 13 }, (_, i) => [
			...rejects('rising_wedge', `reason_${String(i).padStart(2, '0')}`, 13 - i),
			...rejects('falling_wedge', `reason_${String(i).padStart(2, '0')}`, 1),
		]).flat();
		const text = formatDebugView('hdr', makeMeta(candidates), [], makeDebugViewRes()).content[0].text;

		const cross = parseCrossTotalRow(text);
		expect(cross).toHaveLength(11); // 10 種 + 残余 1
		expect(cross?.at(-1)?.[0]).toBe('他 3 種');
		// 畳んだ分を落とすと合計が rejected と合わなくなる（#193 要件 3）
		expect(cross?.reduce((sum, [, n]) => sum + n, 0)).toBe(candidates.length);
	});

	/**
	 * 横断合計は `byType` ではなく**全 rejected から独立に**数える。type 行が上限 20 で残余に
	 * 畳まれても、横断合計の合計は rejected と一致し続けなければならない
	 * （type 行の残余から reason を拾い直す実装にすると、ここが黙って合わなくなる）。
	 */
	it('type 行が残余に畳まれても横断合計は rejected と一致する', () => {
		// 25 種別 × 共通の reason 'r'（type 行は 20 + 残余 1 に畳まれる）
		const candidates = Array.from({ length: 25 }, (_, i) =>
			rejects(`type_${String(i).padStart(2, '0')}`, 'r', 25 - i),
		).flat();
		const text = formatDebugView('hdr', makeMeta(candidates), [], makeDebugViewRes()).content[0].text;

		expect(parseRestRow(text)?.types).toBe(5); // type 行は畳まれている
		expect(parseCrossTotalRow(text)).toEqual([['r', candidates.length]]);
	});

	it('reason を持たない棄却も (reason なし) として横断合計に入れる', () => {
		const meta = makeMeta([...rejects('triple_top', undefined, 2), ...rejects('double_bottom', 'no_breakout', 1)]);
		const text = formatDebugView('hdr', meta, [], makeDebugViewRes()).content[0].text;
		expect(parseCrossTotalRow(text)).toEqual([
			['(reason なし)', 2],
			['no_breakout', 1],
		]);
	});
});

// ── 検出経路（relaxed provenance）の申告（issue #191 B / #189） ──

describe('buildDetectionRouteLine', () => {
	it('relaxed が 0 件でも行を出す（「行が無い = relaxed なし」を推論させない）', () => {
		const pats = [makePattern(), makePattern(), makePattern()];
		expect(buildDetectionRouteLine(pats)).toBe('検出経路: 全 3 件とも strict（relaxed フォールバック由来は 0 件）');
	});

	it('relaxed 由来があるとき strict / relaxed の件数と段の内訳を出す', () => {
		const pats = [
			makePattern(),
			makePattern({ type: 'triple_top', _fallback: 'relaxed_triple_x1.25' }),
			makePattern({ type: 'triple_bottom', _fallback: 'relaxed_triple_x1.25' }),
			makePattern({ type: 'head_and_shoulders', _fallback: 'relaxed_hs_x1.6_0.6' }),
		];
		const line = buildDetectionRouteLine(pats);
		// 件数は 3 つとも書く（strict / relaxed / 段ごと）。読み手に引き算をさせない
		expect(line).toContain('検出経路: strict 1 件 / relaxed フォールバック由来 3 件');
		// 件数降順 → 値の昇順で固定（表記揺れはそのまま出す。揃えるのは別件。#190）
		expect(line).toContain('（relaxed_triple_x1.25×2, relaxed_hs_x1.6_0.6×1）');
		expect(line).toContain('summary はパターン行を出さないので件数のみ');
	});

	it('パターン 0 件では行を出さない（帰属の対象が無く、ヘッダが 0 件と言う）', () => {
		expect(buildDetectionRouteLine([])).toBe('');
	});

	it('_fallback が空文字 / 非文字列のエントリは relaxed に数えない', () => {
		const pats = [makePattern({ _fallback: '  ' }), makePattern({ _fallback: undefined })];
		expect(buildDetectionRouteLine(pats)).toBe('検出経路: 全 2 件とも strict（relaxed フォールバック由来は 0 件）');
	});
});

describe('検出経路行と provenance の view 別の出方（#191 B / 規約 §3）', () => {
	const relaxedPats = [
		makePattern({ type: 'triple_top', _fallback: 'relaxed_triple_x1.25' }),
		makePattern({ type: 'double_top' }),
	];

	it('summary / detailed / full に同一文言の検出経路行が出る（summary に出さないと §3 違反）', () => {
		const line = buildDetectionRouteLine(relaxedPats);
		const summary = formatSummaryView('hdr', relaxedPats, '', '', undefined, false, emptyRes).content[0].text;
		const detailed = formatDetailedView('hdr', relaxedPats, '', '', emptyMeta, undefined, emptyRes).content[0].text;
		const full = formatFullView('hdr', relaxedPats, '', '', emptyMeta, emptyRes).content[0].text;
		for (const [view, text] of [
			['summary', summary],
			['detailed', detailed],
			['full', full],
		] as const) {
			expect(text, `view=${view} に検出経路行が無い`).toContain(line);
		}
	});

	it('detailed / full ではパターン見出し行の末尾に provenance が付き、summary には行そのものが無い', () => {
		const detailed = formatDetailedView('hdr', relaxedPats, '', '', emptyMeta, undefined, emptyRes).content[0].text;
		const full = formatFullView('hdr', relaxedPats, '', '', emptyMeta, emptyRes).content[0].text;
		for (const text of [detailed, full]) {
			expect(text).toContain('1. triple_top (パターン整合度: 0.75) [relaxed_triple_x1.25]');
			// strict 由来には印を付けない（印の無さは検出経路行の件数が裏づける）
			expect(text).toContain('2. double_top (パターン整合度: 0.75)\n');
		}
		// summary は**パターン行を出さない view** なので、印は付きようがない。届くのは件数の集計だけ
		// （§3 は下位 view に無いものを上位が足すのを許す。逆は不可）。
		const summary = formatSummaryView('hdr', relaxedPats, '', '', undefined, false, emptyRes).content[0].text;
		expect(summary).not.toContain('[relaxed_triple_x1.25]');
		expect(summary).not.toContain('パターン整合度');
		expect(summary).toContain('検出経路: strict 1 件 / relaxed フォールバック由来 1 件（relaxed_triple_x1.25×1）');
	});

	it('debug には検出経路行を出さない（パターンを列挙しない view なので帰属の対象が出ない）', () => {
		const text = formatDebugView('hdr', emptyMeta, relaxedPats, makeDebugViewRes()).content[0].text;
		expect(text).not.toContain('検出経路');
	});
});

// ── formatPatternLine ──

describe('formatPatternLine', () => {
	it('double_top: full view で山1/谷/山2 ラベルを出力する', () => {
		const meta = {
			debug: {
				swings: [
					{ kind: 'peak', idx: 0, price: 100000, isoTime: '2026-01-01T00:00:00.000Z' },
					{ kind: 'valley', idx: 5, price: 90000, isoTime: '2026-01-06T00:00:00.000Z' },
					{ kind: 'peak', idx: 10, price: 100000, isoTime: '2026-01-11T00:00:00.000Z' },
				],
			},
		};
		const p = makePattern({ type: 'double_top' });
		const result = formatPatternLine(p, 0, 'full', meta);
		expect(result).toContain('山1');
		expect(result).toContain('谷');
		expect(result).toContain('山2');
	});

	it('double_bottom: full view で谷1/山/谷2 ラベルを出力する', () => {
		const meta = {
			debug: {
				swings: [
					{ kind: 'valley', idx: 0, price: 90000, isoTime: '2026-01-01T00:00:00.000Z' },
					{ kind: 'peak', idx: 5, price: 100000, isoTime: '2026-01-06T00:00:00.000Z' },
					{ kind: 'valley', idx: 10, price: 90000, isoTime: '2026-01-11T00:00:00.000Z' },
				],
			},
		};
		const p = makePattern({ type: 'double_bottom' });
		const result = formatPatternLine(p, 0, 'full', meta);
		expect(result).toContain('谷1');
		expect(result).toContain('山');
		expect(result).toContain('谷2');
	});

	it('debug view でも pivot ラベルを出力する', () => {
		const p = makePattern({ type: 'double_top' });
		const result = formatPatternLine(p, 0, 'debug', emptyMeta);
		expect(result).toContain('山1');
	});

	it('summary view では pivot ラベルを出力しない', () => {
		const p = makePattern({ type: 'double_top' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).not.toContain('山1');
	});

	it('pivots が 3 未満のとき pivot ラベルなし', () => {
		const p = makePattern({
			type: 'double_top',
			pivots: [
				{ idx: 0, price: 100000, kind: 'H', extremePrice: 101000 },
				{ idx: 5, price: 90000, kind: 'L', extremePrice: 89000 },
			],
		});
		const result = formatPatternLine(p, 0, 'full', emptyMeta);
		expect(result).not.toContain('山1');
	});

	it('other type では roleLabels なし（full view）', () => {
		const p = makePattern({ type: 'pennant' });
		const result = formatPatternLine(p, 0, 'full', emptyMeta);
		expect(result).not.toContain('山1');
	});

	it('breakout: idx が存在するとき "ブレイク" 行を出力する（idxToIso あり）', () => {
		const meta = {
			debug: {
				swings: [{ kind: 'peak', idx: 10, price: 95000, isoTime: '2026-01-11T00:00:00.000Z' }],
			},
		};
		const p = makePattern({ breakout: { idx: 10, price: 95000 } });
		const result = formatPatternLine(p, 0, 'full', meta);
		expect(result).toContain('ブレイク');
		expect(result).toContain('2026-01-11');
	});

	it('breakout: idxToIso が存在しないとき "n/a" を表示する', () => {
		const p = makePattern({ breakout: { idx: 99, price: 95000 } });
		const result = formatPatternLine(p, 0, 'full', emptyMeta);
		expect(result).toContain('ブレイク');
		expect(result).toContain('n/a');
	});

	it('breakout が null のとき breakout 行なし', () => {
		const p = makePattern({ breakout: null });
		const result = formatPatternLine(p, 0, 'full', emptyMeta);
		expect(result).not.toContain('ブレイク:');
	});

	it('status: completed を日本語で表示する', () => {
		const p = makePattern({ status: 'completed' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('完成（ブレイクアウト確認済み）');
	});

	it('status: invalid を日本語で表示する', () => {
		const p = makePattern({ status: 'invalid' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('無効（期待と逆方向にブレイク）');
	});

	it('status: forming を日本語で表示する', () => {
		const p = makePattern({ status: 'forming' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('形成中');
	});

	it('status: near_completion を日本語で表示する', () => {
		const p = makePattern({ status: 'near_completion' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('ほぼ完成（apex接近）');
	});

	it('status が未知の値のときそのまま表示する', () => {
		const p = makePattern({ status: 'custom_status' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('custom_status');
	});

	it('status が未指定のとき状態行なし', () => {
		const p = makePattern({ status: undefined });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).not.toContain('状態:');
	});

	it('falling_wedge: up breakout → 強気転換（成功）', () => {
		const p = makePattern({ type: 'falling_wedge', breakoutDirection: 'up', outcome: 'success' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('強気転換');
		expect(result).toContain('成功');
	});

	it('falling_wedge: down breakout → 弱気継続（失敗）', () => {
		const p = makePattern({ type: 'falling_wedge', breakoutDirection: 'down', outcome: 'failure' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('弱気継続');
		expect(result).toContain('失敗');
	});

	it('rising_wedge: up breakout → 強気継続（失敗）', () => {
		const p = makePattern({ type: 'rising_wedge', breakoutDirection: 'up', outcome: 'failure' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('強気継続');
	});

	it('rising_wedge: down breakout → 弱気転換（成功）', () => {
		const p = makePattern({ type: 'rising_wedge', breakoutDirection: 'down', outcome: 'success' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('弱気転換');
	});

	it('triangle_ascending: up breakout → 上方ブレイク（強気）', () => {
		const p = makePattern({ type: 'triangle_ascending', breakoutDirection: 'up', outcome: 'success' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('上方ブレイク（強気）');
	});

	it('triangle_ascending: down breakout → 下方ブレイク（弱気転換）', () => {
		const p = makePattern({ type: 'triangle_ascending', breakoutDirection: 'down', outcome: 'failure' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('下方ブレイク（弱気転換）');
	});

	it('triangle_descending: down success → 下方ブレイク（弱気）', () => {
		const p = makePattern({ type: 'triangle_descending', breakoutDirection: 'down', outcome: 'success' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('下方ブレイク（弱気）');
	});

	it('triangle_descending: up failure → 上方ブレイク（強気転換）', () => {
		const p = makePattern({ type: 'triangle_descending', breakoutDirection: 'up', outcome: 'failure' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('上方ブレイク（強気転換）');
	});

	it('pennant: poleDirection=up success → トレンド継続（強気）', () => {
		const p = makePattern({
			type: 'pennant',
			breakoutDirection: 'up',
			outcome: 'success',
			poleDirection: 'up',
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('トレンド継続（強気）');
	});

	it('pennant: poleDirection=down failure → ダマシ（強気転換）', () => {
		const p = makePattern({
			type: 'pennant',
			breakoutDirection: 'down',
			outcome: 'failure',
			poleDirection: 'down',
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('ダマシ（強気転換）');
	});

	it('pennant: expectedDir なし（poleDirection undefined）→ 方向ブレイク', () => {
		const p = makePattern({
			type: 'pennant',
			breakoutDirection: 'up',
			outcome: 'success',
			poleDirection: undefined,
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('上方ブレイク');
	});

	it('breakoutDirection なしのとき outcome 行なし', () => {
		const p = makePattern({ breakoutDirection: undefined, outcome: undefined });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).not.toContain('パターン結果:');
	});

	// pennant fields
	it('pennant: 全フィールドあり（poleDirection/priorTrendDirection/flagpoleHeight/retracementRatio/isTrendContinuation）', () => {
		const p = makePattern({
			type: 'pennant',
			poleDirection: 'up',
			priorTrendDirection: 'bullish',
			flagpoleHeight: 20000,
			retracementRatio: 0.2,
			isTrendContinuation: true,
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('フラッグポール方向: 上昇');
		expect(result).toContain('先行トレンド: 強気（上昇トレンド）');
		expect(result).toContain('フラッグポール値幅');
		expect(result).toContain('戻し比率: 20%');
		expect(result).toContain('正常範囲');
		expect(result).toContain('トレンド継続: はい（成功）');
	});

	it('pennant: priorTrendDirection=bearish → 弱気（下降トレンド）', () => {
		const p = makePattern({ type: 'pennant', priorTrendDirection: 'bearish' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('弱気（下降トレンド）');
	});

	it('pennant: retracementRatio > 0.38 → 高め（トライアングル寄り）', () => {
		const p = makePattern({ type: 'pennant', retracementRatio: 0.5 });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('高め — トライアングル寄り');
	});

	it('pennant: isTrendContinuation=false → いいえ（ダマシ）', () => {
		const p = makePattern({ type: 'pennant', isTrendContinuation: false });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('いいえ（ダマシ）');
	});

	it('pennant: poleDirection=down → 下降', () => {
		const p = makePattern({ type: 'pennant', poleDirection: 'down' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('フラッグポール方向: 下降');
	});

	it('pennant: フィールドなしのとき pennantLine なし', () => {
		const p = makePattern({ type: 'pennant' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		// pennant line 自体が生成されないことを確認（crashしなければOK）
		expect(result).toContain('pennant');
	});

	// structureDiagram
	it('full view + structureDiagram.svg あり → SVG ブロックを出力する', () => {
		const p = makePattern({
			structureDiagram: {
				svg: '<svg>test</svg>',
				artifact: { identifier: 'diag-1', title: 'Test Diagram' },
			},
		});
		const result = formatPatternLine(p, 0, 'full', emptyMeta);
		expect(result).toContain('Structure Diagram (SVG)');
		expect(result).toContain('<svg>test</svg>');
		expect(result).toContain('diag-1');
	});

	it('detailed view + structureDiagram.svg あり → SVG ブロックを出力する', () => {
		const p = makePattern({
			structureDiagram: { svg: '<svg>detail</svg>' },
		});
		const result = formatPatternLine(p, 0, 'detailed', emptyMeta);
		expect(result).toContain('Structure Diagram (SVG)');
	});

	it('debug view では structureDiagram を出力しない', () => {
		const p = makePattern({
			structureDiagram: { svg: '<svg>debug</svg>' },
		});
		const result = formatPatternLine(p, 0, 'debug', emptyMeta);
		expect(result).not.toContain('Structure Diagram (SVG)');
	});

	it('structureDiagram.svg なしのとき SVG ブロックなし', () => {
		const p = makePattern({
			structureDiagram: undefined,
		});
		const result = formatPatternLine(p, 0, 'full', emptyMeta);
		expect(result).not.toContain('Structure Diagram (SVG)');
	});

	// breakoutTarget
	it('breakoutTarget あり → ターゲット価格を出力する', () => {
		const p = makePattern({
			breakoutTarget: 120000,
			targetMethod: 'flagpole_projection',
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('ターゲット価格');
		expect(result).toContain('フラッグポール値幅投影');
	});

	it('targetMethod: pattern_height → パターン高さ投影', () => {
		const p = makePattern({ breakoutTarget: 110000, targetMethod: 'pattern_height' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('パターン高さ投影');
	});

	it('targetMethod: neckline_projection → ネックライン投影', () => {
		const p = makePattern({ breakoutTarget: 110000, targetMethod: 'neckline_projection' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('ネックライン投影');
	});

	it('targetReachedPct < 100 のとき「未到達」と走査窓の本数を出す', () => {
		const p = makePattern({ breakoutTarget: 110000, targetMethod: 'pattern_height', targetReachedPct: 60 });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('60%');
		expect(result).toContain(`ブレイク後${TARGET_REACH_MAX_BARS}本以内は未到達`);
	});

	it('targetReachedPct >= 100 のとき「N本以内に到達」を表示する', () => {
		const p = makePattern({ breakoutTarget: 110000, targetMethod: 'pattern_height', targetReachedPct: 105 });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain(`ブレイク後${TARGET_REACH_MAX_BARS}本以内に到達`);
	});

	it('上限に当たった pct は「以上」と申告する（issue #210 (1)）', () => {
		const p = makePattern({
			breakoutTarget: 110000,
			targetMethod: 'pattern_height',
			targetReachedPct: TARGET_REACHED_PCT_CAP,
		});
		expect(formatPatternLine(p, 0, 'summary', emptyMeta)).toContain(`${TARGET_REACHED_PCT_CAP}%以上`);
	});

	it('退化して進捗を出さなかった場合は content に理由が出る（issue #210 (2)）', () => {
		const p = makePattern({
			breakoutTarget: 110000,
			targetMethod: 'neckline_projection',
			targetProgressOmittedReason: 'degenerate_target_distance',
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('ターゲット価格');
		expect(result).toContain('ターゲット進捗: 出力なし');
	});

	it('breakoutTarget なしのとき ターゲット価格 なし', () => {
		const p = makePattern({ breakoutTarget: undefined });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).not.toContain('ターゲット価格');
	});

	// neckline
	it('neckline が水平のとき（水平）を表示する', () => {
		const p = makePattern({ neckline: [{ y: 95000 }, { y: 95000 }] });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('水平');
	});

	it('neckline が傾斜のとき → を使用する', () => {
		const p = makePattern({ neckline: [{ y: 95000 }, { y: 97000 }] });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('→');
	});

	it('trendlineLabel を使用する', () => {
		const p = makePattern({ neckline: [{ y: 95000 }, { y: 95000 }], trendlineLabel: 'サポートライン' });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('サポートライン');
	});

	// ── 期間表示の分離（structureRange / confirmation / precedingTrend） ──

	it('新フィールドが無いとき legacy「期間」行を表示する', () => {
		const p = makePattern({ structureRange: undefined, confirmation: undefined, precedingTrend: undefined });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('期間:');
		expect(result).not.toContain('文脈期間');
		expect(result).not.toContain('形成期間');
	});

	it('structureRange あり → 形成期間 行を出力する（日付のみ YYYY-MM-DD）', () => {
		const p = makePattern({
			structureRange: { start: '2025-09-01T00:00:00.000Z', end: '2025-09-26T00:00:00.000Z' },
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('形成期間: 2025-09-01 ~ 2025-09-26（構成点）');
	});

	it('confirmation=neckline_breakout → ブレイク確認 行に日付と価格を出力する', () => {
		const p = makePattern({
			structureRange: { start: '2025-09-01T00:00:00.000Z', end: '2025-09-26T00:00:00.000Z' },
			confirmation: {
				type: 'neckline_breakout',
				date: '2025-10-02T00:00:00.000Z',
				idx: 31,
				price: 12345,
			},
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('ブレイク確認: 2025-10-02');
		expect(result).toContain('12,345円');
		// 文脈期間: precedingTrend が無い場合は structureRange.start を起点に
		expect(result).toContain('文脈期間: 2025-09-01 ~ 2025-10-02');
	});

	it('confirmation=not_confirmed → ブレイク確認: なし を表示する', () => {
		const p = makePattern({
			type: 'head_and_shoulders',
			structureRange: { start: '2025-08-01T00:00:00.000Z', end: '2025-09-30T00:00:00.000Z' },
			confirmation: { type: 'not_confirmed' },
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('ブレイク確認: なし');
	});

	it('precedingTrend → 先行トレンド 行に方向・%変化・lookback を出力する', () => {
		const p = makePattern({
			precedingTrend: {
				start: '2025-08-22T00:00:00.000Z',
				end: '2025-09-01T00:00:00.000Z',
				direction: 'down',
				returnPct: -7.5,
				lookbackBars: 10,
			},
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('先行トレンド: 2025-08-22 ~ 2025-09-01');
		expect(result).toContain('下降');
		expect(result).toContain('-7.5%');
		expect(result).toContain('lookback=10本');
	});

	it('precedingTrend.direction=insufficient_data も表示できる', () => {
		const p = makePattern({
			precedingTrend: {
				start: '2025-01-01T00:00:00.000Z',
				end: '2025-01-05T00:00:00.000Z',
				direction: 'insufficient_data',
				returnPct: 0,
				lookbackBars: 10,
			},
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('データ不足');
	});

	it('新フィールド完備 → 期間: のみの単独行は出さない（誤読防止）', () => {
		const p = makePattern({
			structureRange: { start: '2025-09-01T00:00:00.000Z', end: '2025-09-26T00:00:00.000Z' },
			confirmation: {
				type: 'neckline_breakout',
				date: '2025-10-02T00:00:00.000Z',
				idx: 31,
				price: 12345,
			},
			precedingTrend: {
				start: '2025-08-22T00:00:00.000Z',
				end: '2025-09-01T00:00:00.000Z',
				direction: 'down',
				returnPct: -7,
				lookbackBars: 10,
			},
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('文脈期間');
		expect(result).toContain('形成期間');
		expect(result).toContain('ブレイク確認');
		expect(result).toContain('先行トレンド');
		// legacy 「- 期間:」行が単独で出ないこと
		expect(result).not.toMatch(/\n\s+- 期間: 2/);
	});

	// ── 低 confidence の警告表示（形状不十分扱い） ──

	it('confidence < 0.6 → 「形状不十分」「低信頼」などの警告ラベルを表示する', () => {
		const p = makePattern({ confidence: 0.45 });
		const result = formatPatternLine(p, 0, 'detailed', emptyMeta);
		expect(result).toMatch(/形状不十分|低信頼|信頼度: 低/);
	});

	it('confidence = 0.01 は強いシグナル扱いされず警告ラベルが付く（非常に低い）', () => {
		const p = makePattern({ type: 'inverse_head_and_shoulders', confidence: 0.01 });
		const result = formatPatternLine(p, 0, 'detailed', emptyMeta);
		expect(result).toMatch(/非常に低い|除外候補/);
		expect(result).not.toMatch(/参考材料/);
	});

	it('confidence >= 0.6 → 低信頼警告は付かない', () => {
		const p = makePattern({ confidence: 0.75 });
		const result = formatPatternLine(p, 0, 'detailed', emptyMeta);
		expect(result).not.toMatch(/形状不十分|信頼度: 低|信頼度: 非常に低い/);
	});

	it('confidence < 0.3 は除外候補レベルの強い警告を出す', () => {
		const p = makePattern({ confidence: 0.2 });
		const result = formatPatternLine(p, 0, 'detailed', emptyMeta);
		expect(result).toMatch(/非常に低い|除外候補/);
	});

	it('confidence < 0.6 の警告は full view でも出る', () => {
		const p = makePattern({ confidence: 0.4 });
		const result = formatPatternLine(p, 0, 'full', emptyMeta);
		expect(result).toMatch(/形状不十分|低信頼|信頼度: 低/);
	});

	// ── forming triple_top / triple_bottom の 3 点目暫定マーカー ──
	//
	// forming triple は pivots に確定した主構成点が 2 点しか入らない（#224 症状 3 以降は
	// ネックライン定義点 2 点を挟んだ 4 点）。LLM が「3 山構造」と誤読しないよう、
	// 現在価格を 3 点目に仮置きしている旨を明示する。
	// **判定は `status === 'forming'` で行い、`pivots.length` に依存しない**——長さで判定していた
	// ときは、pivots の構成を変えた瞬間に注記が黙って消えた（#224 症状 3 で実際に起きた）。

	it('forming triple_top: 検出器の実出力どおり 4 点（H-L-H-L）でも現在価格暫定マーカーを表示する', () => {
		const p = makePattern({
			type: 'triple_top',
			status: 'forming',
			pivots: [
				{ idx: 0, price: 100, kind: 'H', extremePrice: 100 },
				{ idx: 10, price: 80, kind: 'L', extremePrice: 80 },
				{ idx: 20, price: 101, kind: 'H', extremePrice: 101 },
				{ idx: 32, price: 81, kind: 'L', extremePrice: 81 },
			],
		});
		const result = formatPatternLine(p, 0, 'detailed', emptyMeta);
		expect(result).toContain('3 山目は現在価格を暫定');
		expect(result).toContain('参考材料');
	});

	it('forming triple_bottom: 4 点（L-H-L-H）でも現在価格暫定マーカーを表示する', () => {
		const p = makePattern({
			type: 'triple_bottom',
			status: 'forming',
			pivots: [
				{ idx: 0, price: 100, kind: 'L', extremePrice: 100 },
				{ idx: 10, price: 120, kind: 'H', extremePrice: 120 },
				{ idx: 20, price: 99, kind: 'L', extremePrice: 99 },
				{ idx: 32, price: 119, kind: 'H', extremePrice: 119 },
			],
		});
		const result = formatPatternLine(p, 0, 'detailed', emptyMeta);
		expect(result).toContain('3 谷目は現在価格を暫定');
	});

	it('forming triple_top: 旧形式の 2 点（主構成点のみ）でも暫定マーカーは出る（長さに依存しない）', () => {
		const p = makePattern({
			type: 'triple_top',
			status: 'forming',
			pivots: [
				{ idx: 0, price: 100, kind: 'H', extremePrice: 100 },
				{ idx: 20, price: 101, kind: 'H', extremePrice: 101 },
			],
		});
		const result = formatPatternLine(p, 0, 'detailed', emptyMeta);
		expect(result).toContain('3 山目は現在価格を暫定');
	});

	it('completed triple_top（5 点 H-L-H-L-H）には暫定マーカーを付けない', () => {
		const p = makePattern({
			type: 'triple_top',
			status: 'completed',
			pivots: [
				{ idx: 0, price: 100, kind: 'H', extremePrice: 100 },
				{ idx: 10, price: 80, kind: 'L', extremePrice: 80 },
				{ idx: 20, price: 100, kind: 'H', extremePrice: 100 },
				{ idx: 30, price: 80, kind: 'L', extremePrice: 80 },
				{ idx: 40, price: 100, kind: 'H', extremePrice: 100 },
			],
		});
		const result = formatPatternLine(p, 0, 'detailed', emptyMeta);
		expect(result).not.toContain('現在価格を暫定');
	});

	it('near_completion の triple_top（forming ではない）には暫定マーカーを付けない', () => {
		const p = makePattern({
			type: 'triple_top',
			status: 'near_completion',
			pivots: [
				{ idx: 0, price: 100, kind: 'H', extremePrice: 100 },
				{ idx: 10, price: 80, kind: 'L', extremePrice: 80 },
				{ idx: 20, price: 100, kind: 'H', extremePrice: 100 },
				{ idx: 30, price: 80, kind: 'L', extremePrice: 80 },
				{ idx: 40, price: 100, kind: 'H', extremePrice: 100 },
			],
		});
		const result = formatPatternLine(p, 0, 'detailed', emptyMeta);
		expect(result).not.toContain('現在価格を暫定');
	});

	it('価格範囲は pivots 全点の min/max（triple_top ならネックライン定義点の谷が下限に入る）', () => {
		// #224 症状 3 で triple の pivots に谷が入ったため、価格範囲は H&S / double と同じく
		// ネックライン定義点を含んだ幅になる（3 山だけの不自然に狭い範囲ではなくなる）。
		const p = makePattern({
			type: 'triple_top',
			status: 'completed',
			pivots: [
				{ idx: 0, price: 100, kind: 'H', extremePrice: 100 },
				{ idx: 10, price: 80, kind: 'L', extremePrice: 80 },
				{ idx: 20, price: 101, kind: 'H', extremePrice: 101 },
				{ idx: 30, price: 82, kind: 'L', extremePrice: 82 },
				{ idx: 40, price: 100, kind: 'H', extremePrice: 100 },
			],
		});
		const result = formatPatternLine(p, 0, 'detailed', emptyMeta);
		expect(result).toContain('価格範囲: 80円 - 101円');
	});

	it('forming double_top には triple 用の暫定マーカーを付けない', () => {
		const p = makePattern({
			type: 'double_top',
			status: 'forming',
			pivots: [
				{ idx: 0, price: 100, kind: 'H', extremePrice: 100 },
				{ idx: 10, price: 100, kind: 'L', extremePrice: 100 },
			],
		});
		const result = formatPatternLine(p, 0, 'detailed', emptyMeta);
		expect(result).not.toContain('現在価格を暫定');
	});
});

// ── formatSummaryView ──

describe('formatSummaryView', () => {
	it('summary テキストを生成する', () => {
		const pats = [makePattern()];
		const res = formatSummaryView('Header', pats, '期間: 2026-01-01', 'double_top×1', undefined, false, emptyRes);
		expect(res.content[0].text).toContain('Header');
		expect(res.content[0].text).toContain('double_top×1');
	});

	it('includeForming=false のとき hint を表示する', () => {
		const res = formatSummaryView('H', [], '', '', undefined, false, emptyRes);
		expect(res.content[0].text).toContain('includeForming=true');
	});

	it('includeForming=true のとき hint なし', () => {
		const res = formatSummaryView('H', [], '', '', undefined, true, emptyRes);
		expect(res.content[0].text).not.toContain('includeForming=true');
	});
});

// ── formatFullView ──

describe('formatFullView', () => {
	it('overlays ありのとき overlay note を含む', () => {
		const res = formatFullView('Header', [makePattern()], '', 'double_top×1', emptyMeta, {
			...emptyRes,
			data: { patterns: [], overlays: { ranges: [] } },
		});
		expect(res.content[0].text).toContain('チャート連携');
	});

	it('overlays なしのとき overlay note なし', () => {
		const res = formatFullView('Header', [makePattern()], '', 'double_top×1', emptyMeta, emptyRes);
		expect(res.content[0].text).not.toContain('チャート連携');
	});

	it('複数パターンを出力する', () => {
		const pats = [makePattern(), makePattern({ type: 'pennant' })];
		const res = formatFullView('H', pats, '期間', 'summary', emptyMeta, emptyRes);
		expect(res.content[0].text).toContain('double_top');
		expect(res.content[0].text).toContain('pennant');
	});
});

// ── formatDetailedView ──

describe('formatDetailedView', () => {
	it('パターンあり → body を出力する', () => {
		const pats = [makePattern()];
		const res = formatDetailedView('H', pats, '', 'double_top×1', emptyMeta, undefined, emptyRes);
		expect(res.content[0].text).toContain('double_top');
	});

	it('パターン 0 件 + summary="insufficient data" → insufficient data メッセージ', () => {
		const res = formatDetailedView('H', [], '', '', emptyMeta, undefined, {
			...emptyRes,
			summary: 'insufficient data',
		});
		expect(res.content[0].text).toContain('insufficient data');
		expect(res.content[0].text).not.toContain('緩めるなら');
	});

	// ── 0 件メッセージ（#184 欠陥 E） ──
	// 旧実装は `（tolerancePct=${effTol}）` を自前で出しており、`effective_params` が
	// 出力スキーマ未宣言（欠陥 D）で常に strip されていたため**生入力値**に落ちていた。
	// 値の表示は実効パラメータ行に一本化したので、ここは値を主張しない。

	it('パターン 0 件 → 実効値を基準にした緩和の助言を出す（生入力値は出さない）', () => {
		const res = formatDetailedView('H', [], '', '', emptyMeta, ['double_top'], emptyRes);
		const text = res.content[0].text;
		expect(text).toContain('パターンは検出されませんでした。');
		expect(text).toContain('double_top');
		// 実効値（emptyMeta は 0.04）を基準に「より大きい値」を助言する。
		expect(text).toContain('実効値 0.04 より大きい値');
		// 旧文言（実効値と無関係な固定レンジ）は残っていない。1hour では半分が締める方向だった。
		expect(text).not.toContain('0.03-0.06');
		// 0 件メッセージ自体は値のラベルを持たない（実効パラメータ行に一本化した）。
		expect(text).not.toContain('（tolerancePct=');
	});

	it('パターン 0 件 + effective_params が 0.05 → 助言の基準値も 0.05 になる', () => {
		const meta = {
			...emptyMeta,
			effective_params: { ...emptyMeta.effective_params, tolerancePct: { value: 0.05, source: 'auto' as const } },
		};
		const res = formatDetailedView('H', [], '', '', meta, undefined, emptyRes);
		expect(res.content[0].text).toContain('実効値 0.05 より大きい値');
		expect(res.content[0].text).not.toContain('実効値 0.04');
	});

	// **これが #184 欠陥 E の回帰テスト。** `effective_params` を持たない meta では、
	// 実効値を知らないのだから数値を主張してはいけない（旧実装は生入力値で埋めていた）。
	it('パターン 0 件 + effective_params 無し → 数値を主張せず実効パラメータ行を参照させる', () => {
		const metaNoTol = { debug: { swings: [], candidates: [] } };
		const res = formatDetailedView('H', [], '', '', metaNoTol, undefined, emptyRes);
		const text = res.content[0].text;
		expect(text).toContain('パターンは検出されませんでした。');
		expect(text).toContain('実効値は上の実効パラメータ行を参照');
		// 数値を含む「実効値 X」の主張をしていない
		expect(text).not.toMatch(/実効値 [\d.]/u);
		expect(text).not.toContain('tolerancePct=');
	});

	it('overlays ありのとき overlay note を含む', () => {
		const res = formatDetailedView('H', [makePattern()], '', '', emptyMeta, undefined, {
			...emptyRes,
			data: { patterns: [], overlays: { ranges: [] } },
		});
		expect(res.content[0].text).toContain('チャート連携');
	});

	it('overlays なしのとき overlay note なし', () => {
		const res = formatDetailedView('H', [makePattern()], '', '', emptyMeta, undefined, emptyRes);
		expect(res.content[0].text).not.toContain('チャート連携');
	});

	it('5 件超のパターンは top5 のみ出力する', () => {
		const pats = Array.from({ length: 7 }, (_, i) => makePattern({ confidence: 0.7 + i * 0.01 }));
		const res = formatDetailedView('H', pats, '', '', emptyMeta, undefined, emptyRes);
		// 6番目、7番目は含まれない（全てconfidence違いだが型は同じなので出現数で確認）
		const matches = res.content[0].text.match(/double_top/g) ?? [];
		expect(matches.length).toBeLessThanOrEqual(5);
	});

	// ── cap トリムの申告（issue #196） ──
	// `【検出パターン】` の見出しは 6 件以上のときだけ「N / 全 M 件（K 件省略。全件は view=full）」を、
	// ちょうど 5 件のときは境界の曖昧さ（cap で切られたのか偶然 5 件なのか）を消すために
	// 「省略なし」を出す。5 件未満は slice が構造的に全件を返す＝省略が起こり得ないので、
	// 申告行自体を出さない（毎回「省略なし」を出すと明細の前が定型文で埋まる）。

	it('6 件以上検出時は【検出パターン】見出しにトリム件数を申告する（issue #196）', () => {
		const pats = Array.from({ length: 7 }, () => makePattern());
		const res = formatDetailedView('H', pats, '', '', emptyMeta, undefined, emptyRes);
		expect(res.content[0].text).toContain('【検出パターン】 5 / 全 7 件（2 件省略。全件は view=full）');
	});

	it('ちょうど 5 件検出時は【検出パターン】見出しで省略なしと明示する（issue #196）', () => {
		const pats = Array.from({ length: 5 }, () => makePattern());
		const res = formatDetailedView('H', pats, '', '', emptyMeta, undefined, emptyRes);
		expect(res.content[0].text).toContain('【検出パターン】 5 / 全 5 件（省略なし）');
	});

	it('5 件未満検出時は【検出パターン】見出しにトリム申告を出さない（issue #196）', () => {
		const pats = Array.from({ length: 3 }, () => makePattern());
		const res = formatDetailedView('H', pats, '', '', emptyMeta, undefined, emptyRes);
		const text = res.content[0].text;
		// 見出し直後が改行＝申告テキストが挟まっていないことの直接確認。
		// 「全 3 件」は検出経路行（`検出経路: 全 3 件とも strict…`）にも正当に出現するため
		// 存在チェックには使えない——見出し行そのものを固定して確認する。
		expect(text).toContain('【検出パターン】\n');
		expect(text).not.toContain('省略');
	});

	it('usage_example を structuredContent に含む', () => {
		const res = formatDetailedView('H', [], '', '', emptyMeta, undefined, emptyRes);
		const sc = res.structuredContent as Record<string, unknown>;
		expect(sc['usage_example']).toBeDefined();
	});
});

// ── tz 表示（PR-4: 表示日付の tz 整形） ──
//
// 構造化データ（range.start/end 等）は UTC ISO のまま不変。
// 表示テキストのみ tz で整形される。
// 検証点: tz=Asia/Tokyo（既定）/ tz=UTC / tz='' で表示日付が切り替わる。
//
// timezone-sensitive な timestamp として 23:30Z 系を使う:
//   2026-10-01T23:30:00.000Z → JST: 2026-10-02 08:30、UTC: 2026-10-01

describe('表示日付の tz 整形（範囲・期間）', () => {
	const startUtcLate = '2026-10-01T23:30:00.000Z'; // UTC=10/01, JST=10/02
	const endUtcLate = '2026-10-10T23:30:00.000Z'; // UTC=10/10, JST=10/11

	// buildPatternSpanLine の tz 整形は tests/patterns/period.test.ts で検証する。

	it('formatPatternLine: tz 既定で legacy 期間行が JST 暦日になる', () => {
		const p = makePattern({ range: { start: startUtcLate, end: endUtcLate } });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('期間: 2026-10-02 ~ 2026-10-11');
		// UTC 日付は出ない（tz=Asia/Tokyo 既定）
		expect(result).not.toContain('2026-10-01');
		expect(result).not.toContain('2026-10-10');
	});

	it("formatPatternLine: tz='UTC' のとき legacy 期間行が UTC 暦日になる", () => {
		const p = makePattern({ range: { start: startUtcLate, end: endUtcLate } });
		const result = formatPatternLine(p, 0, 'summary', emptyMeta, 'UTC');
		expect(result).toContain('期間: 2026-10-01 ~ 2026-10-10');
	});

	it('formatPatternLine: structureRange が tz 既定で JST 暦日になる', () => {
		const p = makePattern({
			structureRange: { start: startUtcLate, end: endUtcLate },
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('形成期間: 2026-10-02 ~ 2026-10-11（構成点）');
	});

	it("formatPatternLine: structureRange が tz='UTC' のとき UTC 暦日になる", () => {
		const p = makePattern({
			structureRange: { start: startUtcLate, end: endUtcLate },
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta, 'UTC');
		expect(result).toContain('形成期間: 2026-10-01 ~ 2026-10-10（構成点）');
	});

	it('formatPatternLine: confirmation.date が tz 既定で JST 暦日になる', () => {
		const p = makePattern({
			structureRange: { start: '2026-09-01T00:00:00.000Z', end: '2026-09-26T00:00:00.000Z' },
			confirmation: { type: 'neckline_breakout', date: startUtcLate, idx: 31, price: 12345 },
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('ブレイク確認: 2026-10-02');
	});

	it("formatPatternLine: confirmation.date が tz='UTC' のとき UTC 暦日になる", () => {
		const p = makePattern({
			structureRange: { start: '2026-09-01T00:00:00.000Z', end: '2026-09-26T00:00:00.000Z' },
			confirmation: { type: 'neckline_breakout', date: startUtcLate, idx: 31, price: 12345 },
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta, 'UTC');
		expect(result).toContain('ブレイク確認: 2026-10-01');
	});

	it('formatPatternLine: precedingTrend が tz 既定で JST 暦日になる', () => {
		const p = makePattern({
			precedingTrend: {
				start: startUtcLate,
				end: endUtcLate,
				direction: 'down',
				returnPct: -5,
				lookbackBars: 10,
			},
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta);
		expect(result).toContain('先行トレンド: 2026-10-02 ~ 2026-10-11');
	});

	it("formatPatternLine: precedingTrend が tz='UTC' のとき UTC 暦日になる", () => {
		const p = makePattern({
			precedingTrend: {
				start: startUtcLate,
				end: endUtcLate,
				direction: 'down',
				returnPct: -5,
				lookbackBars: 10,
			},
		});
		const result = formatPatternLine(p, 0, 'summary', emptyMeta, 'UTC');
		expect(result).toContain('先行トレンド: 2026-10-01 ~ 2026-10-10');
	});

	it('formatPatternLine: pivot 日付（double_top）が tz 既定で JST 暦日になる', () => {
		const meta = {
			debug: {
				swings: [
					{ kind: 'peak', idx: 0, price: 100000, isoTime: startUtcLate },
					{ kind: 'valley', idx: 5, price: 90000, isoTime: '2026-10-05T23:30:00.000Z' },
					{ kind: 'peak', idx: 10, price: 100000, isoTime: endUtcLate },
				],
			},
		};
		const p = makePattern({ type: 'double_top' });
		const result = formatPatternLine(p, 0, 'full', meta);
		expect(result).toContain('山1: 2026-10-02');
		expect(result).toContain('谷: 2026-10-06');
		expect(result).toContain('山2: 2026-10-11');
	});

	it("formatPatternLine: pivot 日付（double_top）が tz='UTC' のとき UTC 暦日になる", () => {
		const meta = {
			debug: {
				swings: [
					{ kind: 'peak', idx: 0, price: 100000, isoTime: startUtcLate },
					{ kind: 'valley', idx: 5, price: 90000, isoTime: '2026-10-05T23:30:00.000Z' },
					{ kind: 'peak', idx: 10, price: 100000, isoTime: endUtcLate },
				],
			},
		};
		const p = makePattern({ type: 'double_top' });
		const result = formatPatternLine(p, 0, 'full', meta, 'UTC');
		expect(result).toContain('山1: 2026-10-01');
		expect(result).toContain('谷: 2026-10-05');
		expect(result).toContain('山2: 2026-10-10');
	});

	it('formatPatternLine: breakout 日付が tz 既定で JST 暦日になる', () => {
		const meta = {
			debug: {
				swings: [{ kind: 'peak', idx: 10, price: 95000, isoTime: startUtcLate }],
			},
		};
		const p = makePattern({ breakout: { idx: 10, price: 95000 } });
		const result = formatPatternLine(p, 0, 'full', meta);
		expect(result).toContain('ブレイク: 2026-10-02');
	});

	it("formatPatternLine: breakout 日付が tz='UTC' のとき UTC 暦日になる", () => {
		const meta = {
			debug: {
				swings: [{ kind: 'peak', idx: 10, price: 95000, isoTime: startUtcLate }],
			},
		};
		const p = makePattern({ breakout: { idx: 10, price: 95000 } });
		const result = formatPatternLine(p, 0, 'full', meta, 'UTC');
		expect(result).toContain('ブレイク: 2026-10-01');
	});

	it('formatDebugView: swing isoTime が tz 既定で JST 暦日になる', () => {
		const meta = {
			debug: {
				swings: [{ kind: 'peak', idx: 0, price: 100000, isoTime: startUtcLate }],
				candidates: [],
			},
		};
		const res = formatDebugView('hdr', meta, [], {
			ok: true,
			summary: 'debug',
			data: { patterns: [], overlays: null },
			meta: {},
		});
		expect(res.content[0].text).toContain('(2026-10-02)');
	});

	it("formatDebugView: swing isoTime が tz='UTC' のとき UTC 暦日になる", () => {
		const meta = {
			debug: {
				swings: [{ kind: 'peak', idx: 0, price: 100000, isoTime: startUtcLate }],
				candidates: [],
			},
		};
		const res = formatDebugView(
			'hdr',
			meta,
			[],
			{ ok: true, summary: 'debug', data: { patterns: [], overlays: null }, meta: {} },
			'UTC',
		);
		expect(res.content[0].text).toContain('(2026-10-01)');
	});
});
