/**
 * triple × H&S の型間排他（issue #218 Phase 2）を**実データのパイプライン全体**で固定する。
 *
 * `tests/patterns/mutual-exclusion.test.ts` が純関数の契約を見るのに対し、こちらは
 * `detect_patterns` を通したときに
 *
 * 1. PR4 の先行トレンドゲートにより、横ばい先行の `triple_bottom` 242-249-272 と
 *    逆 H&S 230-232-249-265-272 が型間排他へ到達する前に除外されること
 * 2. **落ちるのは `triple_*` と該当 H&S**で、double・wedge・triangle・pennant が動かないこと
 * 3. 新しい縮小段が `meta.reduction` と `検出内訳:` 行に申告されること（#200 の契約）
 * 4. 落ちた理由が `view=debug` から追えること（**cap トリムで押し出されない**こと込み）
 * 5. 既存の型間排他の reduction 契約が、候補ゼロのケースでも壊れないこと
 *
 * を見る。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../tools/analyze_indicators.js', () => ({ default: vi.fn() }));

import { toolDef as detectPatternsTool } from '../src/handlers/detectPatternsHandler.js';
import { TRIPLE_HS_NO_CANDIDATE_NOTE } from '../src/handlers/detectPatternsViewsHandler.js';
import analyzeIndicators from '../tools/analyze_indicators.js';
import detectPatterns from '../tools/detect_patterns.js';
import { mainPointIdxs, TRIPLE_HS_EXCLUSION_REASON } from '../tools/patterns/mutual-exclusion.js';
import type { DeduplicablePattern } from '../tools/patterns/types.js';
import { asMockResult, assertFail, assertOk } from './_assertResult.js';
import { buildBtcJpy1hour202608Candles } from './fixtures/btc_jpy_1hour_2026_08.js';

/** `type` と主構成点 idx だけに畳んだ識別キー。 */
function keyOf(p: { type?: string; pivots?: Array<{ idx: number; kind: string }> }): string {
	return `${p.type}|${(p.pivots ?? []).map((v) => `${v.kind}${v.idx}`).join('-')}`;
}

async function run(opts: Record<string, unknown> = {}) {
	const candles = buildBtcJpy1hour202608Candles();
	vi.mocked(analyzeIndicators).mockResolvedValueOnce(
		asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
	);
	const res = await detectPatterns('btc_jpy', '1hour', 365, opts);
	assertOk(res);
	return res;
}

describe('detect_patterns: triple × H&S の型間排他（issue #218 Phase 2）', () => {
	it('横ばい先行の逆H&Sとtriple_bottomはいずれも方向ゲートで除外される', async () => {
		const res = await run();
		const keys = res.data.patterns.map(keyOf);

		expect(keys).not.toContain('triple_bottom|L242-H245-L249-H265-L272');
		expect(keys).not.toContain('inverse_head_and_shoulders|L230-H232-L249-H265-L272');
	});

	it('横ばい先行のH&Sを除外した後の実データ内訳を固定する', async () => {
		const res = await run();
		const byType = new Map<string, number>();
		for (const p of res.data.patterns) byType.set(p.type, (byType.get(p.type) ?? 0) + 1);
		// 実データ B の 1hour（デフォルトオプション）の内訳。PR4 の方向ゲートで
		// `triple_bottom` 242-249-272 も出力されなくなり、H&S 系 / double / triangle /
		// pennant は 1 件も動かない。wedge は正当性PR1で形成窓内部の遡及ブレイクを除外した。
		//
		// **`triple_top` 219-223-232 は #216 Phase 2 で消えた**——本段の対象外
		// （出力に残る 2 件の `head_and_shoulders` と主構成点を 1 点も共有しない）だが、
		// 山3（idx 232 / 終値 12,282,275）がネックライン 12,285,548.5 より 3,273.5 円下で、
		// **検出器層の `peaks_below_neckline` がここへ到達する前に落としている。**
		// この件数は本 issue のゲートではなく #216 Phase 2 のゲートが決めている。
		//
		// **`head_and_shoulders` 2 件は #211（`necklineAt` の外挿クランプ）で消えた**——これも
		// 本段の対象外で、ブレイクが右肩より後ろの外挿に依存していたため `near_completion` に
		// 落ち、既定 `includeForming: false` で除かれている。逆 H&S 2 件も PR9 の
		// 先頭履歴ウォームアップで除外されるため、本段の型間排他には到達しない。
		expect(Object.fromEntries([...byType].sort())).toEqual({
			rising_wedge: 2,
			triangle_ascending: 4,
		});
		expect(res.meta.count).toBe(6);
	});

	it('meta.reduction に新しい段が載り、waterfall が成立する', async () => {
		const res = await run();
		const r = res.meta.reduction as Record<string, number>;
		expect(r.tripleHsExcluded).toBe(0);
		// 既定呼び出しでは H&S 系が PR9 の履歴フィルタ後に残らず、比較対象も 0 件になる。
		expect(r.tripleHsCandidateCount).toBe(0);
		expect(r.reversalHistoryExcluded).toBeGreaterThan(0);
		expect(
			r.reversalHistoryExcluded +
				r.dedupMerged +
				r.currentFiltered +
				r.lifecycleExcluded +
				r.tripleHsExcluded +
				r.output,
		).toBe(r.detected);
		expect(r.output).toBe(res.meta.count);
	});

	// issue #224 症状 1: `tripleHsExcluded` の 0 は「比較して該当なし」と「比較対象が無く比較できなかった」の
	// 2 通りある。`patterns` で triple 系だけを要求すると H&S 検出器が走らず後者になる
	// （`mutual-exclusion.ts` 冒頭「`patterns` で絞ると排他も効かない」は仕様）。判定は変えず申告だけ足す。
	describe('patterns で絞って H&S が出力集合に無いとき（issue #224 症状 1）', () => {
		it('tripleHsExcluded=0 かつ tripleHsCandidateCount=0 になり、既定呼び出しなら落ちる triple_bottom がそのまま返る', async () => {
			const res = await run({ patterns: ['triple_bottom'] });
			const r = res.meta.reduction as Record<string, number>;
			expect(r.tripleHsExcluded).toBe(0);
			expect(r.tripleHsCandidateCount).toBe(0);
			// 方向ゲートで先に落ちるため、H&S の比較対象が無くても出力は空になる。
			expect(res.data.patterns).toHaveLength(0);
			expect(r.dedupMerged + r.currentFiltered + r.lifecycleExcluded + r.tripleHsExcluded + r.output).toBe(r.detected);
		});

		it('検出内訳行に「比較対象 H&S 無し」の注記が付く', async () => {
			const candles = buildBtcJpy1hour202608Candles();
			vi.mocked(analyzeIndicators).mockResolvedValueOnce(
				asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
			);
			const res = (await detectPatternsTool.handler({
				pair: 'btc_jpy',
				type: '1hour',
				limit: 365,
				patterns: ['triple_bottom'],
				view: 'summary',
			})) as { content: Array<{ text: string }> };
			const line = res.content[0].text.split('\n').find((l) => l.startsWith('検出内訳:'));
			expect(line).toContain(`triple×H&S排他 -0${TRIPLE_HS_NO_CANDIDATE_NOTE}`);
		});

		it('既定呼び出しでも履歴フィルタ後に H&S が無ければ注記が付く', async () => {
			const candles = buildBtcJpy1hour202608Candles();
			vi.mocked(analyzeIndicators).mockResolvedValueOnce(
				asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
			);
			const res = (await detectPatternsTool.handler({
				pair: 'btc_jpy',
				type: '1hour',
				limit: 365,
				view: 'summary',
			})) as {
				content: Array<{ text: string }>;
			};
			const line = res.content[0].text.split('\n').find((l) => l.startsWith('検出内訳:'));
			expect(line).toContain(TRIPLE_HS_NO_CANDIDATE_NOTE);
		});
	});

	it('検出内訳行に段が出る（#200 の契約。0 件でも省かない）', async () => {
		const candles = buildBtcJpy1hour202608Candles();
		vi.mocked(analyzeIndicators).mockResolvedValueOnce(
			asMockResult({ ok: true, summary: 'ok', data: { chart: { candles } } }),
		);
		const res = (await detectPatternsTool.handler({ pair: 'btc_jpy', type: '1hour', limit: 365, view: 'summary' })) as {
			content: Array<{ text: string }>;
		};
		const line = res.content[0].text.split('\n').find((l) => l.startsWith('検出内訳:'));
		expect(line).toContain('triple×H&S排他 -0');
		// 段の並びはパイプライン順（ライフサイクル絞り込みの**後**）。
		expect(line).toMatch(/ライフサイクル除外 -\d+ → triple×H&S排他 -\d+(?:（[^）]+）)? → 出力/);
	});

	it('view=debug で横ばい先行のH&Sに起因する排他が無いことを示す', async () => {
		const res = await run();
		const candidates = (res.meta.debug?.candidates ?? []) as Array<Record<string, unknown>>;
		// **cap（200 件）に対して候補は 1,900 件超ある。** 検出器の棄却理由と同じ優先度で積むと
		// 本段は最後に push されるため必ず押し出される——ここが落ちたらトリムの優先度が戻っている。
		expect(res.meta.debug?.candidatesOmitted).toBeGreaterThan(0);

		const hit = candidates.filter((c) => c.reason === TRIPLE_HS_EXCLUSION_REASON);
		expect(hit).toHaveLength(0);
	});

	// **ライフサイクル絞り込みより後に置いていることの回帰。** 先に置くと、根拠にした H&S が
	// あとから `includeForming` / `includeCompleted` / `includeInvalid` で消え、
	// **排他対象の triple も H&S も残らない**組み合わせが作れてしまう。ここでは「落とした triple の
	// `matches` が、同じ応答の `data.patterns` に実在する H&S を指している」ことを
	// 8 通りのライフサイクル組み合わせすべてで固定する。
	const LIFECYCLE_COMBOS = [false, true].flatMap((includeForming) =>
		[false, true].flatMap((includeCompleted) =>
			[false, true].map((includeInvalid) => ({ includeForming, includeCompleted, includeInvalid })),
		),
	);

	it.each(LIFECYCLE_COMBOS)('排他の根拠は出力に残る H&S だけ: %o', async (opts) => {
		const res = await run(opts);
		const outputHsMain = new Set(
			res.data.patterns
				.filter((p) => p.type === 'head_and_shoulders' || p.type === 'inverse_head_and_shoulders')
				.map((p) => mainPointIdxs(p as DeduplicablePattern).join('-')),
		);
		const hit = ((res.meta.debug?.candidates ?? []) as Array<Record<string, unknown>>).filter(
			(c) => c.reason === TRIPLE_HS_EXCLUSION_REASON,
		);
		const r = res.meta.reduction as Record<string, number>;
		expect(hit).toHaveLength(r.tripleHsExcluded);
		for (const c of hit) {
			const matches = (c.details as { matches: Array<{ hsMainIdxs: number[] }> }).matches;
			expect(matches.length).toBeGreaterThan(0);
			for (const m of matches) {
				expect(outputHsMain, `${c.type} の根拠 ${m.hsMainIdxs} が data.patterns に居ない`).toContain(
					m.hsMainIdxs.join('-'),
				);
			}
		}
	});

	it('8通りすべてで横ばい先行のH&Sに基づく排他が起きない', async () => {
		let total = 0;
		for (const opts of LIFECYCLE_COMBOS) {
			const res = await run(opts);
			total += (res.meta.reduction as Record<string, number>).tripleHsExcluded;
		}
		expect(total).toBe(0);
	}, 60_000);

	// 上流失敗の早期 return（`if (!res.ok) return fail(...)`）は本段より**前**にあるので、
	// 排他は走らず `meta.reduction` も生えない。
	//
	// **`fail` / `patterns` / `debug` 側の一般契約は
	// `tests/patterns/level-spread-triple.test.ts` が既に固定している**ので、ここでは重複させず
	// **#218 が足した 2 つだけ**を見る: `meta.reduction`（4 段目 `tripleHsExcluded` を含む）が
	// 生えないことと、排他の棄却候補が 1 件も積まれないこと。
	//
	// `ok()` を返す 2 経路（通常 / `'insufficient data'`）の `reduction` は
	// `tests/detect_patterns_meta_schema_parity.test.ts` が押さえており、**これで 3 つある
	// 出口すべてが埋まる**——早期 return に段を足し忘れる #184 決定事項 1 のクラスの穴を塞ぐ。
	it('上流がエラーなら排他まで到達せず、meta.reduction も排他候補も生えない', async () => {
		vi.mocked(analyzeIndicators).mockResolvedValueOnce(
			asMockResult({ ok: false, summary: 'Error: upstream failed', data: {}, meta: { errorType: 'network' } }),
		);

		const res = await detectPatterns('btc_jpy', '1hour', 365, { view: 'debug' });

		assertFail(res);
		expect((res.meta as { reduction?: unknown }).reduction).toBeUndefined();
		const candidates = ((res.meta as { debug?: { candidates?: Array<Record<string, unknown>> } }).debug?.candidates ??
			[]) as Array<Record<string, unknown>>;
		expect(candidates.filter((c) => c.reason === TRIPLE_HS_EXCLUSION_REASON)).toHaveLength(0);
	});
});
