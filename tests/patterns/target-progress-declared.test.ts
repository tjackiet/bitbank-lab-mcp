/**
 * tests/patterns/target-progress-declared.test.ts
 *
 * issue #224 症状 2 の受け入れ条件を機械的に固定する:
 * **`breakoutTarget` を出しているのに、進捗行も理由行も content に無いパターンが 0 件。**
 *
 * `content[0].text` が LLM への唯一のチャネルなので、進捗行が消えると LLM は
 * 「進捗 0%」なのか「測っていない」のかを区別できない。
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
 * ライブ実例が出た系列（実データ B = `btc_jpy` 1hour）を**ネイティブの時間足のまま**使う。
 * `detect_patterns` をツール境界で叩く 3 本は、`globalDedup` や #218 の排他を通った後の
 * 実際の `data.patterns` / content を見たいので実データでしか組めない。
 *
 * 完成済み triple の進捗配線は、方向ゲートを通過する合成 fixture で下のテストが固定する。
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
	getHsShoulderMaxPctForTf,
	getSizeThresholdsForTf,
} from '../../tools/patterns/config.js';
import { detectTriples } from '../../tools/patterns/detect_triples.js';
import { linearRegressionWithR2 } from '../../tools/patterns/regression.js';
import { detectSwingPoints, type Pivot } from '../../tools/patterns/swing.js';
import type { CandleData, DetectContext, PatternEntry } from '../../tools/patterns/types.js';
import { asMockResult, assertOk } from '../_assertResult.js';
import { buildBtcJpy1hour202608Candles } from '../fixtures/btc_jpy_1hour_2026_08.js';
import { buildCompletedTripleTopCandles } from '../fixtures/synthetic_pattern_candles.js';

/**
 * `detect_patterns.ts` と同じ組み方の triple 用 `DetectContext`
 * （`tests/patterns/target-reach-window-invariance.test.ts` の `buildHsCtx` と同じ idiom）。
 * 実効パラメータは**ハードコードせず `config.ts` から解決する**——手書きすると
 * 時間軸オート表を変えたときにテストだけ古い値で通り続ける。
 */
function buildTripleCtxFor(candles: CandleData[], tf: string, swingDepthOverride?: number): DetectContext {
	const auto = getDefaultParamsForTf(tf);
	const swingDepth = swingDepthOverride ?? auto.swingDepth;
	const tol = getDefaultToleranceForTf(tf);
	const pivots = detectSwingPoints(candles, { swingDepth });
	return {
		candles,
		pivots,
		allPeaks: pivots.filter((p: Pivot) => p.kind === 'H'),
		allValleys: pivots.filter((p: Pivot) => p.kind === 'L'),
		tolerancePct: tol,
		headProminencePct: getHeadProminenceForTf(tf),
		sizeThresholds: getSizeThresholdsForTf(tf),
		hsShoulderMaxPct: getHsShoulderMaxPctForTf(tf),
		minDist: auto.minBarsBetweenSwings,
		want: new Set(['triple_top', 'triple_bottom']),
		includeForming: false,
		debugCandidates: [],
		type: tf,
		swingDepth,
		near: (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * tol,
		pct: (a: number, b: number) => ((b - a) / Math.max(1, a)) * 100,
		lrWithR2: (pts) => linearRegressionWithR2(pts),
	};
}

/** ライブ実例（実データ B = `btc_jpy` 1hour）の ctx。 */
function buildTripleCtx(): DetectContext {
	return buildTripleCtxFor(buildBtcJpy1hour202608Candles() as CandleData[], '1hour');
}

const TARGET_PRICE_LABEL = '   - ターゲット価格: ';
// 行頭ラベルは issue #288 Phase 2 で `ターゲット進捗:` → `ターゲット:` に変わった
// （100% 超の数字を「進捗」と名乗らせないため）。**`ターゲット価格:` とは別の文字列なので
// 件数の突き合わせはそのまま成立する。**
const TARGET_PROGRESS_LABEL = '   - ターゲット: ';

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
// 両方回す。**片方だけだと未ブレイク（`not_broken_out`）と完成済み（進捗が出る）のどちらかを
// 見逃す**——#228 以前は後者が `not_computed_by_detector` を名乗る側だった。
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
		// **行数で見る**——「進捗行がどこかにある」だと、1 件でも欠けたときに通ってしまう。
		//
		// **等号ではなく `進捗/理由行 === 申告した件数`。** #288 Phase 2 まで進捗行を価格行のガードの
		// 中で組んでいたため、両者は必ず等しかった——そのせいで `breakoutTarget` を持たない
		// `not_broken_out` / `no_target` の理由行が黙って消えていた（実データ B の
		// `includeForming: true` に `near_completion` の `triangle_ascending` が 1 件実在する）。
		// いまは価格行と独立に出るので、**申告したパターンの件数**と突き合わせる。
		const declared = (res.data.patterns as unknown as Array<Record<string, unknown>>).filter(
			(p) => p.targetReachedPct != null || p.targetProgressOmittedReason != null,
		).length;
		expect(countOccurrences(text, TARGET_PRICE_LABEL)).toBeGreaterThan(0);
		expect(declared).toBeGreaterThan(0);
		expect(countOccurrences(text, TARGET_PROGRESS_LABEL)).toBe(declared);
		expect(countOccurrences(text, TARGET_PROGRESS_LABEL)).toBeGreaterThanOrEqual(
			countOccurrences(text, TARGET_PRICE_LABEL),
		);
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
			// **理由行は価格行より多くなりうる**（#288 Phase 2 で価格行のガードから切り離した）。
			// 件数の厳密な一致は下の 1 件ずつの検算が持つ——こちらは view が明細を間引くので
			// `data.patterns` の件数とは合わない。
			expect(
				countOccurrences(text, TARGET_PROGRESS_LABEL),
				`${label} で進捗/理由行が欠けている`,
			).toBeGreaterThanOrEqual(prices);
		}
		// `formatPatternLine` を直接叩く経路（`view` を跨いだ 1 件ずつの検算）。
		// **`breakoutTarget` の有無で絞らない**——絞ると、価格が無いまま理由だけを名乗るべき
		// パターン（`not_broken_out` / `no_target`）が検算から丸ごと外れる。
		let checked = 0;
		for (const view of ['summary', 'detailed', 'full'] as const) {
			for (const p of pats) {
				const declares = p.targetReachedPct != null || p.targetProgressOmittedReason != null;
				if (!declares) continue;
				const line = formatPatternLine(p, 0, view, meta, 'Asia/Tokyo', '1hour');
				expect(line, `${view} / ${p.type}`).toContain(TARGET_PROGRESS_LABEL);
				// **価格行の有無は `breakoutTarget` と 1 対 1。** 「あるときに出る」だけでなく
				// 「無いときに出ない」も同時に固定する（分岐で書くと後者が抜ける）。
				expect(line.includes(TARGET_PRICE_LABEL), `${view} / ${p.type}: 価格行の有無が breakoutTarget と食い違う`).toBe(
					p.breakoutTarget != null,
				);
				checked++;
			}
		}
		expect(checked, '検算対象が 1 件も無い（空振り）').toBeGreaterThan(0);
	});

	/**
	 * **#225/#228 の進捗配線回帰は、方向ゲートを通過する合成 fixture で検証する。**
	 * 実データ B の triple は PR4 の横ばい先行ゲートで除外されるため、ライブ系列では
	 * 「不要な候補が進捗表示へ進まない」ことを確認する。
	 *
	 * **検出器を直接呼ぶ**（`data.patterns` は見ない）。完成済み triple の進捗契約を
	 * globalDedup や型間排他の代表選択から独立して検証する。
	 */
	it('横ばい先行のライブ実例 triple は方向ゲートで除外される', () => {
		const patterns = detectTriples(buildTripleCtx()).patterns as unknown as Array<Record<string, unknown>>;
		const completed = patterns.filter((p) => p.status === 'completed');
		expect(completed).toHaveLength(0);
	});

	it('完成済み triple の 4 経路が理由コード not_computed_by_detector を返さない（#228 の配線の回帰）', () => {
		// こちらは**理由コードが復活しないこと**を、コーパス側（合成 fixture の完成済み triple。
		// strict top 経路）で押さえる。
		const candles = buildCompletedTripleTopCandles() as CandleData[];
		const patterns = detectTriples(buildTripleCtxFor(candles, '1day', 2)).patterns as unknown as Array<
			Record<string, unknown>
		>;
		const completed = patterns.filter((p) => p.status === 'completed');
		expect(completed.length).toBeGreaterThan(0);
		expect(
			completed.map((t) => ({ omittedReason: t.targetProgressOmittedReason, pct: typeof t.targetReachedPct })),
		).toEqual(completed.map(() => ({ omittedReason: undefined, pct: 'number' })));
	});

	/**
	 * **`no_target` はターゲット価格が出せなかったことの申告**なので、この理由を名乗るべき
	 * 唯一のケースでは `breakoutTarget` が必ず無い。価格行のガードの中に進捗行を入れていると、
	 * その 1 経路だけが content から消える（#224 症状 2 と同じ形が呼び出し側に残っていた。
	 * #288 Phase 2 のレビュー指摘）。
	 *
	 * 標準コーパスでは `no_target` の発生が 0 件なので、**合成の entry で経路を直接叩く。**
	 * 実データ待ちにすると、この経路は永久に踏まれない。
	 */
	it.each([
		'summary',
		'detailed',
		'full',
	] as const)('view=%s: breakoutTarget が無くても理由行を出す（no_target を黙らせない）', (view) => {
		const entry = {
			type: 'head_and_shoulders',
			confidence: 0.8,
			range: { start: '2026-01-01T00:00:00.000Z', end: '2026-01-20T00:00:00.000Z' },
			status: 'completed',
			targetProgressOmittedReason: 'no_target',
		} as unknown as PatternEntry;
		const line = formatPatternLine(entry, 0, view, {} as Parameters<typeof formatFullView>[4], 'Asia/Tokyo', '1hour');
		expect(line).not.toContain(TARGET_PRICE_LABEL);
		expect(line).toContain(`${TARGET_PROGRESS_LABEL}出力なし（`);
		expect(line).toContain('ターゲット価格またはパターン高さが算出できないため');
	});

	it('res.summary（tools/detect_patterns.ts）でも breakoutTarget 無しの理由行を出す', async () => {
		// `detect_patterns` の summary 生成は views handler と**別実装**なので、両方を押さえる
		// （#224 症状 2 が 2 箇所を別々に直す必要があったのと同じ理由）。
		// 実データ B の `includeForming: true` には、`breakoutTarget` を持たないまま
		// `not_broken_out` を名乗る `near_completion` が実在する（旧実装ではこの行が消えていた）。
		const res = await run({ includeForming: true });
		const priceless = (res.data.patterns as unknown as Array<Record<string, unknown>>).filter(
			(p) => p.breakoutTarget == null && p.targetProgressOmittedReason != null,
		);
		expect(priceless.length, '価格が無いまま理由を名乗るパターンがコーパスに無い（空振り）').toBeGreaterThan(0);
		expect(countOccurrences(res.summary, TARGET_PROGRESS_LABEL)).toBe(
			countOccurrences(res.summary, TARGET_PRICE_LABEL) + priceless.length,
		);
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
		expect(res.summary).toContain('ターゲット: 出力なし（未ブレイクのため未算出）');
	});
});
