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
 * 同じ欠陥を 4 回踏んでいる:
 * - #155 / PR #159 — `debug.candidates[].status`
 * - #160 / PR #161 — `debug.candidates[].breakoutDirection`
 * - #184 — `meta.effective_params`（**#114 以前から載っていて一度も届いていなかった**）
 * - #189 — `data.patterns[]._fallback`（**本テストが既にあったのに素通しした**。下記）
 *
 * 4 回ともレビューでは見つからなかった。人手で気づけないクラスなので機械で固定する。
 *
 * ## フィクスチャ依存という穴（#189）
 *
 * 本テストは「**実際に 1 回走らせて出たキー**」しか見ないので、**フィクスチャが踏まない経路の
 * 宣言漏れは検出できない**（`_schemaKeyParity.ts` の docstring が限界として挙げていたもの）。
 * `_fallback` がまさにそれで、単一の `buildNoisyCandles` は relaxed フォールバック経路を
 * 1 件も踏んでおらず（実測: patterns=6 / `_fallback` を持つ = 0）、
 * **宣言しても宣言しなくても本テストは通っていた。**
 *
 * 対策は 2 つ:
 *
 * 1. **経路ごとにフィクスチャを持つ**（{@link buildRelaxedTripleTopCandles}）。
 * 2. **フィクスチャが空振りしていないことを先にアサートする**（`requiredKeys`）。
 *    空集合どうしの一致は何も検証していないのと同じ。
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

/**
 * **relaxed フォールバック経路（`patterns[]._fallback`）を踏ませるための価格列**（#189）。
 *
 * relaxed は「strict がその種別を 1 件も見つけられなかったとき」だけ走る
 * （`detectTriples` / `detect_doubles` の fallback ループ）。つまり
 * **strict が落ちて relaxed が拾う入力**でないと `_fallback` は 1 件も出ない。
 * {@link buildNoisyCandles} は H&S / wedge / triangle / flag しか出さず、
 * double / triple がそもそも 0 件なのでこの経路に届かない。
 *
 * ## 設計（1day のオート値: `swingDepth=6` / `minBarsBetweenSwings=4` / `tolerancePct=0.04`）
 *
 * 3 山を 1000 / 1000 / 958 に置く。**山1-山3 の相対差 4.2% が `tolerancePct`（4%）超・
 * `tolerancePct × 1.25`（5%）以内**なので:
 *
 * - strict（3 ペアすべてに `near`）は `three_peaks_not_level` で落ちる
 * - relaxed 第 1 段（factor 1.25）は隣接 2 ペアしか見ないので拾う → `relaxed_triple_x1.25`
 *
 * 残りのゲートは余裕を持って通るように置いてある: ネックライン（2 谷とも 900）の傾き 0 <
 * `NECKLINE_SLOPE_LIMIT`（2%）、パターン高さ 11% > `heightPct`（3%）、
 * 谷の押し 9% 超 > `depthPct`（5%）、山のばらつき / 高さ = 0.38 < `MAX_LEVEL_SPREAD_RATIO`（0.5）、
 * 構造ゲートの戻り率 0.69 ∈ [0.2, 0.9]、山3 から 20 本以内にネックラインを 1.5% 割る足がある
 * （→ `status='completed'`）。山1-山3 の間隔 20 日で `periodScoreDays` が 0.9 になり
 * confidence 0.76 > `MIN_CONFIDENCE.triple_top`（0.7）。
 *
 * **既存の `buildNoisyCandles` には手を入れていない。** あちらは `debug.candidates` /
 * `debug.swings` を埋めるための「多数の種別が同時に立つ」列で、relaxed を踏ませるには
 * 逆に **strict を全滅させる**必要があり要件が衝突する（strict が 1 件でも出た瞬間に
 * relaxed は走らない）。1 つの列に両方を負わせると、どちらかの意図が壊れたことに
 * 気づけなくなる。
 */
function buildRelaxedTripleTopCandles(): Candle[] {
	// [idx, close] のアンカー。区間は線形補間する（単調区間なのでピボットはアンカー上にだけ立つ）。
	const anchors: ReadonlyArray<readonly [number, number]> = [
		[0, 990],
		[10, 850], // 先行安値（構造ゲートの先行上昇の起点 / ネックライン上抜けの証拠）
		[22, 1000], // 山1
		[27, 900], // 谷1
		[32, 1000], // 山2
		[37, 900], // 谷2
		[42, 958], // 山3 — 山1 との相対差 4.2%（strict 4% 超 / relaxed 5% 以内）
		[50, 840], // ネックライン 900 を 1.5% 超割る → completed
		[60, 880],
	];
	const lastIdx = anchors[anchors.length - 1][0];
	const closes: number[] = [];
	for (let i = 0; i <= lastIdx; i++) {
		let seg = 0;
		while (seg < anchors.length - 2 && anchors[seg + 1][0] < i) seg++;
		const [x0, y0] = anchors[seg];
		const [x1, y1] = anchors[seg + 1];
		closes.push(y0 + ((y1 - y0) * (i - x0)) / (x1 - x0));
	}
	// 高安は終値から一定幅。ピボット判定（高安基準）と同水準判定（終値基準）で
	// 同じ足が極値になるようにするため、上下対称にしてある。
	return closes.map((close, i) => ({
		isoTime: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
		open: closes[i - 1] ?? close,
		high: close + 5,
		low: close - 5,
		close,
		volume: 100,
	}));
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
async function runAndCapture(opts: Record<string, unknown> = {}, candlesOverride?: Candle[]) {
	const candles = candlesOverride ?? buildNoisyCandles();
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
 *
 * **`patterns[]._fallback` はここに載っていなかったが、意図的な除外ではない**（#189）——
 * 単に当時のフィクスチャが relaxed 経路を 1 件も踏んでおらず、strip されていることに
 * 気づけなかった。`_method` と同じ扱いになるはずだったフィールドで、#189 で宣言した
 * （relaxed / strict の provenance は confidence から逆算できないため）。
 * 同じ取りこぼしを繰り返さないよう、フィクスチャが踏むべきキーは
 * {@link DATA_PARITY_FIXTURES} の `requiredKeys` で先にアサートする。
 */
const KNOWN_DATA_STRIPS = [
	'patterns[].breakout',
	'patterns[].breakout.idx',
	'patterns[].breakout.price',
	'patterns[]._method',
] as const;

function dataOf(result: Record<string, unknown>): Record<string, unknown> {
	const data = result.data;
	if (!isPlainObject(data)) throw new Error('data がオブジェクトではない');
	return data;
}

/**
 * `data` 側の parity を見るフィクスチャと、**そのフィクスチャが踏めていないと検証が成立しない
 * キー**（#189）。
 *
 * `expectNoStrippedKeys` は「載っているのに消えたキー」を見るので、**そもそも載っていない
 * キーについては何も言わない。** つまり `_fallback` のように 1 つのフィクスチャでしか
 * 踏めない経路のフィールドは、`requiredKeys` で存在を先に固定しないと
 * **宣言があってもなくても通る**（#189 で実際にそうなっていた）。
 *
 * `KNOWN_DATA_STRIPS` に挙げたキーは `expectNoStrippedKeys` 側が
 * 「allowlist にあるのに strip されていない」で落とすため、こちらでは重ねて要求しない
 * ——ただし `_method` / `breakout` は両フィクスチャで踏めていることを意図しているので、
 * どちらのフィクスチャが欠けたのかが失敗メッセージで分かるよう明示する。
 */
const DATA_PARITY_FIXTURES = [
	{
		label: 'noisy（strict 経路中心。relaxed は踏まない）',
		build: buildNoisyCandles,
		requiredKeys: ['patterns[].confidence', 'patterns[].breakout.idx', 'patterns[]._method'],
	},
	{
		label: 'relaxed triple（strict が落ちて relaxed が拾う）',
		build: buildRelaxedTripleTopCandles,
		requiredKeys: [
			'patterns[].confidence',
			'patterns[].breakout.idx',
			'patterns[]._method',
			// #189 の本体。ここが false になったら relaxed 経路を踏めていない
			// ——`_fallback` の宣言漏れを本テストが二度と検出できなくなる。
			'patterns[]._fallback',
		],
	},
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

	it.each(DATA_PARITY_FIXTURES)('parse の前後で data のキーパス集合も一致する（既知の欠落を除く）: $label', async ({
		label,
		build,
		requiredKeys,
	}) => {
		// `meta` と同じ欠陥は `data` 側でも起こりうる（`data.patterns[]` のフィールドは 40 以上ある）。
		// 同じヘルパをそのまま当てられるので、こちらも固定しておく。
		const { input, output } = await runAndCapture({}, build());

		// フィクスチャが空振りしていないことを先に固定する（`meta` 側と同じ理由）。
		// **検証したい経路を踏めていないフィクスチャは、宣言漏れがあっても黙って通る。**
		const before = keyPaths(dataOf(input));
		for (const key of requiredKeys) {
			expect(before.has(key), `${label}: ${key} を踏んでいない（フィクスチャが経路に届いていない）`).toBe(true);
		}

		expectNoStrippedKeys(dataOf(input), dataOf(output), `detect_patterns data（${label}）`, KNOWN_DATA_STRIPS);
	});

	it('relaxed 経路の provenance（_fallback）が parse 後も残る（#189）', async () => {
		// #189 以前は宣言が無く `parse()` が黙って落としていた——**strict で拾えたのか
		// relaxed が拾い直したのかを、どのクライアントも判別できなかった。**
		// confidence からは逆算できない（ペナルティ係数が検出器ごとに 0.85 / 0.95 と不揃いで、
		// さらに `finalizeConf` の種別別係数と丸めを通る）。
		const { output } = await runAndCapture({}, buildRelaxedTripleTopCandles());
		const patterns = dataOf(output).patterns as Array<{ type: string; _fallback?: string }>;

		const withFallback = patterns.filter((p) => typeof p._fallback === 'string');
		expect(withFallback.length, 'parse 後に _fallback を持つパターンが 1 件も無い').toBeGreaterThan(0);

		// 値は `relaxed_<検出器>_<段の係数>`（スキーマの `.describe()` が説明している形）。
		for (const p of withFallback) {
			expect(p._fallback, `${p.type} の _fallback`).toMatch(/^relaxed_(double|triple|hs|ihs)_x[\d._]+$/);
		}
		// 設計どおり triple_top が relaxed 第 1 段（factor 1.25）で拾われていること。
		// ここが変わったらフィクスチャが別の経路に流れている。
		expect(patterns.find((p) => p.type === 'triple_top')?._fallback).toBe('relaxed_triple_x1.25');
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

	// **`ok()` を返す経路は 2 つある。** 通常経路と、足が 20 本未満のときの
	// `'insufficient data'` 早期 return（`tools/detect_patterns.ts`）。後者に
	// `effective_params` を足し忘れると「足が足りるときだけ実効値が出る」という
	// candle 本数依存の申告漏れになり、content の実効パラメータ行も消える
	// （#184 決定事項 1「常に出す」の穴）。CodeRabbit の指摘で見つけた。
	it("'insufficient data' の早期 return でも effective_params を申告する", async () => {
		// 20 本未満 → 検出器に入る前に早期 return する
		const few = buildNoisyCandles().slice(0, 15);
		const { input, output } = await runAndCapture({}, few);

		expect(output.summary).toBe('insufficient data');
		const eff = metaOf(output).effective_params as Record<string, { value: number; source: string }>;
		expect(eff, 'insufficient data 経路で effective_params が落ちている').toBeDefined();
		expect(Object.keys(eff).sort()).toEqual([
			'headProminencePct',
			'minBarsBetweenSwings',
			'swingDepth',
			'tolerancePct',
		]);
		// 1day の時間軸オート値。通常経路と同じ解決結果になる。
		expect(eff.swingDepth).toEqual({ value: 6, source: 'auto' });
		expect(eff.tolerancePct).toEqual({ value: 0.04, source: 'auto' });
		// この経路でも宣言漏れが無いこと
		expectNoStrippedKeys(metaOf(input), metaOf(output), 'detect_patterns meta（insufficient data）');
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
