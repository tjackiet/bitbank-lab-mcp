/**
 * tests/patterns/target-progress-declared.test.ts
 *
 * issue #224 症状 2 の受け入れ条件を機械的に固定する:
 * **`breakoutTarget` を出しているのに、進捗行も理由行も content に無いパターンが 0 件。**
 *
 * `content[0].text` が LLM への唯一のチャネルなので、進捗行が消えると LLM は
 * 「進捗 0%」なのか「測っていない」のかを区別できない（issue 本文のライブ実例では
 * `triple_top` が `ターゲット価格: 12,644,737円` まで出しながら進捗を一切名乗らず、
 * 検証した LLM は「理由はこの出力からは分からないので、推測は避けます」と答えた）。
 *
 * ## なぜ 2 箇所で確認するのか
 *
 * ターゲット価格の行を組む場所が **2 つある**——`tools/detect_patterns.ts`（`res.summary`）と
 * `src/handlers/detectPatternsViewsHandler.ts`（`view` ごとの content）。両方が
 * `formatTargetProgressLine` を呼ぶが、**呼ぶかどうかは別々に書かれている**ので、
 * 片方だけ直すと `view` によって行が出たり出なかったりする（`.claude/rules/tools.md` 規約 3:
 * 上位 view は下位 view の内容を落とさない）。
 *
 * ## なぜ「実データで」なのか
 *
 * 合成 fixture では `not_computed_by_detector`（完成済み triple）に到達しない。
 * ライブ実例が出た系列（実データ B = `btc_jpy` 1hour）を**ネイティブの時間足のまま**使う。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../tools/analyze_indicators.js', () => ({ default: vi.fn() }));

import {
	formatDetailedView,
	formatFullView,
	formatPatternLine,
} from '../../src/handlers/detectPatternsViewsHandler.js';
import analyzeIndicators from '../../tools/analyze_indicators.js';
import detectPatterns from '../../tools/detect_patterns.js';
import {
	getDefaultParamsForTf,
	getDefaultToleranceForTf,
	getHeadProminenceForTf,
	getSizeThresholdsForTf,
} from '../../tools/patterns/config.js';
import { detectTriples } from '../../tools/patterns/detect_triples.js';
import { linearRegressionWithR2 } from '../../tools/patterns/regression.js';
import { detectSwingPoints, type Pivot } from '../../tools/patterns/swing.js';
import type { CandleData, DetectContext, PatternEntry } from '../../tools/patterns/types.js';
import { asMockResult, assertOk } from '../_assertResult.js';
import { buildBtcJpy1hour202608Candles } from '../fixtures/btc_jpy_1hour_2026_08.js';

/**
 * `detect_patterns.ts` と同じ組み方の triple 用 `DetectContext`
 * （`tests/patterns/target-reach-window-invariance.test.ts` の `buildHsCtx` と同じ idiom）。
 * 実効パラメータは**ハードコードせず `config.ts` から解決する**——手書きすると
 * 時間軸オート表を変えたときにテストだけ古い値で通り続ける。
 */
function buildTripleCtx(): DetectContext {
	const candles = buildBtcJpy1hour202608Candles() as CandleData[];
	const { swingDepth, minBarsBetweenSwings } = getDefaultParamsForTf('1hour');
	const tol = getDefaultToleranceForTf('1hour');
	const pivots = detectSwingPoints(candles, { swingDepth });
	return {
		candles,
		pivots,
		allPeaks: pivots.filter((p: Pivot) => p.kind === 'H'),
		allValleys: pivots.filter((p: Pivot) => p.kind === 'L'),
		tolerancePct: tol,
		headProminencePct: getHeadProminenceForTf('1hour'),
		sizeThresholds: getSizeThresholdsForTf('1hour'),
		minDist: minBarsBetweenSwings,
		want: new Set(['triple_top', 'triple_bottom']),
		includeForming: false,
		debugCandidates: [],
		type: '1hour',
		swingDepth,
		near: (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * tol,
		pct: (a: number, b: number) => ((b - a) / Math.max(1, a)) * 100,
		lrWithR2: (pts) => linearRegressionWithR2(pts),
	};
}

const TARGET_PRICE_LABEL = '   - ターゲット価格: ';
const TARGET_PROGRESS_LABEL = '   - ターゲット進捗: ';

function countOccurrences(text: string, needle: string): number {
	return text.split(needle).length - 1;
}

async function run(opts: Parameters<typeof detectPatterns>[3]) {
	const candles = buildBtcJpy1hour202608Candles();
	vi.mocked(analyzeIndicators).mockResolvedValueOnce(
		asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
	);
	const res = await detectPatterns('btc_jpy', '1hour', candles.length, opts);
	assertOk(res);
	return res;
}

// `includeForming` の有無で母集団が入れ替わる（未ブレイクのパターンは既定では出ない）ので
// 両方回す。**片方だけだと `not_broken_out` か `not_computed_by_detector` のどちらかを見逃す。**
const OPTION_SETS = [
	{ label: '既定（完成済みのみ）', opts: {} },
	{ label: 'includeForming=true', opts: { includeForming: true } },
] as const;

describe('breakoutTarget を出したら進捗か理由を必ず名乗る（issue #224 症状 2）', () => {
	it.each(OPTION_SETS)('$label: data.patterns の全件が進捗か理由を持つ', async ({ opts }) => {
		const res = await run(opts);
		const withTarget = (res.data.patterns as unknown as Array<Record<string, unknown>>).filter(
			(p) => p.breakoutTarget != null,
		);
		// 「対象が 0 件」で空虚に通らないようにする。
		expect(withTarget.length).toBeGreaterThan(0);
		const silent = withTarget.filter((p) => p.targetReachedPct == null && p.targetProgressOmittedReason == null);
		expect(silent.map((p) => [p.type, p.status, p.breakoutTarget])).toEqual([]);
	});

	it.each(OPTION_SETS)('$label: res.summary（tools/detect_patterns.ts）で行数が一致する', async ({ opts }) => {
		const res = await run(opts);
		const text = res.summary;
		// **行数の一致で見る**——「進捗行がどこかにある」だと、1 件でも欠けたときに通ってしまう。
		expect(countOccurrences(text, TARGET_PRICE_LABEL)).toBeGreaterThan(0);
		expect(countOccurrences(text, TARGET_PROGRESS_LABEL)).toBe(countOccurrences(text, TARGET_PRICE_LABEL));
	});

	it.each(OPTION_SETS)('$label: views handler の 3 view でも行数が一致する', async ({ opts }) => {
		const res = await run(opts);
		const pats = res.data.patterns as unknown as PatternEntry[];
		const meta = (res.meta ?? {}) as Parameters<typeof formatFullView>[4];
		const views: Array<[string, string]> = [
			[
				'full',
				String(
					(
						formatFullView('hdr', pats, '', '', meta, res as never, 'Asia/Tokyo', '', '1hour').content[0] as {
							text: string;
						}
					).text,
				),
			],
			[
				'detailed',
				String(
					(
						formatDetailedView('hdr', pats, '', '', meta, undefined, res as never, 'Asia/Tokyo', '', '1hour')
							.content[0] as { text: string }
					).text,
				),
			],
		];
		for (const [label, text] of views) {
			const prices = countOccurrences(text, TARGET_PRICE_LABEL);
			expect(prices, `${label} にターゲット価格行が無い`).toBeGreaterThan(0);
			expect(countOccurrences(text, TARGET_PROGRESS_LABEL), `${label} で進捗/理由行が欠けている`).toBe(prices);
		}
		// `formatPatternLine` を直接叩く経路（`view` を跨いだ 1 件ずつの検算）。
		for (const view of ['summary', 'detailed', 'full'] as const) {
			for (const p of pats) {
				if (p.breakoutTarget == null) continue;
				const line = formatPatternLine(p, 0, view, meta, 'Asia/Tokyo', '1hour');
				expect(line, `${view} / ${p.type}`).toContain(TARGET_PROGRESS_LABEL);
			}
		}
	});

	it('ライブ実例（完成済み triple）が理由を名乗る: not_computed_by_detector', () => {
		// issue #224 症状 2 のライブ実例そのもの。`detect_triples.ts` の完成済み経路は
		// ブレイク足・target・パターン高さが揃っているのに `computeTargetReach` を呼んでいない。
		// **値は出さないまま理由だけを申告する**（配線は #224 のフォローアップ）。
		//
		// **検出器を直接呼ぶ**（`data.patterns` は見ない）。完成済み triple は `globalDedup` と
		// #218 の triple×H&S 排他を通ると代表を取れないことがあり、**得点式が変われば
		// 出力から消える**——`tests/patterns/target-reach-window-invariance.test.ts` が
		// 同じ理由で対象を検出器層に移したのと同じ配慮。
		const patterns = detectTriples(buildTripleCtx()).patterns as unknown as Array<Record<string, unknown>>;
		const completed = patterns.filter((p) => p.status === 'completed');
		expect(completed.length).toBeGreaterThan(0);
		for (const t of completed) {
			expect(t.targetProgressOmittedReason).toBe('not_computed_by_detector');
			expect(t.targetReachedPct).toBeUndefined();
			expect(t.targetReached).toBeUndefined();
			// `breakoutTarget` は据え置き（#224 は target の算出式を変えない）。
			expect(t.breakoutTarget).toEqual(expect.any(Number));
		}
		// content の文言は**データ条件（測れない）ではなく「算出していない」側**で言う。
		const line = formatPatternLine(
			completed[0] as unknown as PatternEntry,
			0,
			'full',
			{} as Parameters<typeof formatFullView>[4],
			'Asia/Tokyo',
			'1hour',
		);
		expect(line).toContain('ターゲット進捗: 出力なし（この検出器がターゲット進捗を算出していないため');
		expect(line).not.toContain('not_computed_by_detector');
	});

	it('未ブレイクのパターンは not_broken_out を名乗る（最多の経路）', async () => {
		const res = await run({ includeForming: true });
		const omitted = (res.data.patterns as unknown as Array<Record<string, unknown>>).filter(
			(p) => p.targetProgressOmittedReason === 'not_broken_out',
		);
		expect(omitted.length).toBeGreaterThan(0);
		for (const p of omitted) {
			// ブレイクしていないことが理由なので、ブレイク足の申告も無いはず。
			expect(p.breakoutBarIndex).toBeUndefined();
			expect(p.targetReachedPct).toBeUndefined();
		}
		expect(res.summary).toContain('ターゲット進捗: 出力なし（未ブレイクのため未算出）');
	});
});
