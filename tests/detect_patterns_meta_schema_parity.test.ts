/**
 * `detect_patterns` の `meta` に**実際に載せているキー**と、出力スキーマが**宣言している
 * キー**が一致することを、`DetectPatternsOutputSchema.parse()` を**通した結果**で固定する。
 *
 * ## なぜ要るか
 *
 * `ok(summary, data, meta)` の戻り値は返す直前に `DetectPatternsOutputSchema.parse()` を通る。
 * Zod の object は既定で **未宣言のキーを黙って strip する**（エラーにならない）ため、
 * `meta` に足したフィールドを出力スキーマに宣言し忘れると、
 * **parse は成功したまま、そのフィールドだけがどのクライアントにも届かない。**
 *
 * 同じ欠陥を 3 回踏んでいる:
 * - #155 / PR #159 — `debug.candidates[].status`
 * - #160 / PR #161 — `debug.candidates[].breakoutDirection`
 * - #184 — `meta.effective_params`（**#114 以前から載っていて一度も届いていなかった**）
 *
 * 3 回ともレビューでは見つからなかった。人手で気づけないクラスなので機械で固定する。
 *
 * ## 検証方式
 *
 * `parse()` を spy して**入力（= ツールが実際に載せた meta）**と**出力（= 宣言されていて
 * 生き残った meta）**の両方を取り、キーパスの集合が一致することを見る。
 * 配列は要素をまたいでキーパスを合算するので、`debug.candidates[].status` のような
 * **配列要素の中の strip** も検出できる（#155 / #160 がまさにこれ）。
 *
 * 値の一致は見ない——本テストの対象は「宣言漏れによる消失」であって値の正しさではない。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../tools/analyze_indicators.js', () => ({ default: vi.fn() }));

import { DetectPatternsOutputSchema } from '../src/schemas.js';
import analyzeIndicators from '../tools/analyze_indicators.js';
import detectPatterns from '../tools/detect_patterns.js';
import { asMockResult } from './_assertResult.js';
import { expectNoStrippedKeys, keyPaths } from './_schemaKeyParity.js';

type Candle = { isoTime: string; open: number; high: number; low: number; close: number; volume: number };

/**
 * 多数の種別の候補が同時に立つ、揺れの大きい価格列
 * （`tests/detect_patterns_debug.test.ts` の `buildNoisyCandles` と同じ意図）。
 * 単調な系列だと `debug.candidates` が空になり、配列要素のキーを一つも検証できない。
 */
function buildNoisyCandles(): Candle[] {
	return Array.from({ length: 120 }, (_, i) => {
		const close = 100 + Math.sin(i / 3) * 12 + Math.cos(i / 7) * 8 + (i % 5);
		return {
			isoTime: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
			open: close,
			high: close + 1 + ((i * 3) % 9),
			low: close - 1 - ((i * 4) % 9),
			close,
			volume: 100,
		};
	});
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** spy を張る前の素の `parse`。spy の実装から呼ぶので、bind しておかないと再帰する。 */
const originalParse = DetectPatternsOutputSchema.parse.bind(DetectPatternsOutputSchema);

/**
 * `detect_patterns` を 1 回走らせ、parse の**入力**と**出力**を返す。
 *
 * `DetectPatternsOutputSchema.parse` を spy して素通しする。ツール側は
 * `import` した同じスキーマオブジェクトのメソッドを呼び出し時に解決するので、
 * ここで差し替えた実装がそのまま効く。
 */
async function runAndCapture(opts: Record<string, unknown> = {}) {
	const candles = buildNoisyCandles();
	vi.mocked(analyzeIndicators).mockResolvedValueOnce(
		asMockResult({
			ok: true,
			summary: 'ok',
			data: { chart: { candles } },
			// 上流 warning の 2 系統（取得層 = warning / 計算層 = warnings）も meta に載る経路なので、
			// フィクスチャで両方立てておく。落とすと `meta.warning` / `meta.warnings` が
			// キー比較の対象から外れてしまう。
			meta: { warning: '取得層: 一部の足が欠損しています', warnings: ['計算層: SMA_200 はデータ不足'] },
		}),
	);

	const captured: { input?: unknown; output?: unknown } = {};
	const spy = vi.spyOn(DetectPatternsOutputSchema, 'parse').mockImplementation((value: unknown) => {
		// 素通し。実装本体は spy を張る前に bind しておいた元の parse（再帰しない）。
		const parsed = originalParse(value);
		// ツールは最後に 1 回だけ parse する（早期 return の fail 経路は本テストでは通らない）。
		captured.input = value;
		captured.output = parsed;
		return parsed;
	});

	try {
		await detectPatterns('btc_jpy', '1day', candles.length, { includeForming: true, ...opts });
	} finally {
		spy.mockRestore();
	}

	if (!captured.input || !captured.output) throw new Error('parse が呼ばれていない');
	return captured as { input: Record<string, unknown>; output: Record<string, unknown> };
}

function metaOf(result: Record<string, unknown>): Record<string, unknown> {
	const meta = result.meta;
	if (!isPlainObject(meta)) throw new Error('meta がオブジェクトではない');
	return meta;
}

/**
 * `data.patterns[]` 側で**既に** strip されているキー。本テストで見つかったが、#184 では直さない
 * ——宣言を足すと `data.patterns` の中身が増える（＝出力が変わる）ためで、#184 の「やらないこと」に
 * 「検出結果を変えない」がある。別 issue で「意図的な非公開なのか宣言漏れなのか」を判断する。
 *
 * - `patterns[]._method` — 検出経路のラベル（`forming_double_top` 等）。先頭の `_` から
 *   内部フィールドとして意図的に非公開の可能性が高い（`detect_doubles` / `detect_hs` / `detect_triples` /
 *   `detect_wedges` の形成中パスが付ける）。
 * - `patterns[].breakout` / `.idx` / `.price` — 検出器内部のブレイク位置。公開されている
 *   `breakoutBarIndex` / `confirmation` と情報が重複しており、こちらは宣言されていない。
 *
 * **allowlist は「見つけたが直さない」の記録であって免罪符ではない。** 新しい strip が増えれば
 * このリストに無いので落ちる。逆にどれかが宣言されたら「実際には strip されていない」で落ちる。
 */
const KNOWN_DATA_STRIPS = [
	'patterns[].breakout',
	'patterns[].breakout.idx',
	'patterns[].breakout.price',
	'patterns[]._method',
] as const;

describe('detect_patterns: meta に載せたキーが出力スキーマで strip されない', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('parse の前後で meta のキーパス集合が一致する', async () => {
		const { input, output } = await runAndCapture();

		// フィクスチャが空振り（キーが数個しか無い）していないことを先に固定する。
		// 空集合どうしの一致は何も検証していないのと同じ。
		const before = keyPaths(metaOf(input));
		expect(before.has('effective_params.tolerancePct.value')).toBe(true);
		expect(before.has('debug.candidates[].type')).toBe(true);
		expect(before.has('debug.swings[].isoTime')).toBe(true);
		expect(before.size).toBeGreaterThan(20);

		expectNoStrippedKeys(metaOf(input), metaOf(output), 'detect_patterns meta');
	});

	it('parse の前後で data のキーパス集合も一致する（既知の欠落を除く）', async () => {
		// `meta` と同じ欠陥は `data` 側でも起こりうる（`data.patterns[]` のフィールドは 40 以上ある）。
		// 同じヘルパをそのまま当てられるので、こちらも固定しておく。
		const { input, output } = await runAndCapture();
		const dataOf = (result: Record<string, unknown>) => {
			const data = result.data;
			if (!isPlainObject(data)) throw new Error('data がオブジェクトではない');
			return data;
		};
		expect(keyPaths(dataOf(input)).has('patterns[].confidence')).toBe(true);
		expectNoStrippedKeys(dataOf(input), dataOf(output), 'detect_patterns data', KNOWN_DATA_STRIPS);
	});

	it('effective_params の 4 パラメータが value / source ごと生き残る（#184 欠陥 D / A）', async () => {
		const { output } = await runAndCapture();
		const eff = metaOf(output).effective_params as Record<string, { value: number; source: string }>;
		expect(eff).toBeDefined();
		expect(Object.keys(eff).sort()).toEqual([
			'headProminencePct',
			'minBarsBetweenSwings',
			'swingDepth',
			'tolerancePct',
		]);
		for (const [name, entry] of Object.entries(eff)) {
			expect(typeof entry.value, `${name}.value`).toBe('number');
			expect(['auto', 'explicit'], `${name}.source`).toContain(entry.source);
		}
	});

	it('明示指定したパラメータも parse 後に source=explicit で残る', async () => {
		// sentinel（7 / 5 / 0.04）以外を渡すと explicit になる。auto しか出ない
		// フィクスチャだと `source` の enum が片側しか検証できない。
		const { output } = await runAndCapture({ swingDepth: 4, tolerancePct: 0.07, headProminencePct: 0.02 });
		const eff = metaOf(output).effective_params as Record<string, { value: number; source: string }>;
		expect(eff.swingDepth).toEqual({ value: 4, source: 'explicit' });
		expect(eff.tolerancePct).toEqual({ value: 0.07, source: 'explicit' });
		expect(eff.headProminencePct).toEqual({ value: 0.02, source: 'explicit' });
		// 渡していないものは時間軸オート（1day = 4）のまま
		expect(eff.minBarsBetweenSwings).toEqual({ value: 4, source: 'auto' });
	});
});
