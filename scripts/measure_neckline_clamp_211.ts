/**
 * issue #211 Phase 1: `necklineAt`（`tools/patterns/detect_hs.ts:193`）の**無クランプ外挿**が
 * 3 系統の消費者にどれだけ効いているかを**計測だけ**するスクリプト。
 * `detect_hs.ts` は 1 行も変更しない（クランプ版は実行時に生成した複製に対してだけ効く）。
 *
 * 実行:
 *
 *     npx tsx scripts/measure_neckline_clamp_211.ts                    # Markdown を stdout に出す
 *     npx tsx scripts/measure_neckline_clamp_211.ts --json out.json    # 生の行データも保存
 *     npx tsx scripts/measure_neckline_clamp_211.ts --extra extra.json # 追加の実データ系列を個別に測る
 *
 * ## 消費者は 3 系統ある（issue #211 の再整理）
 *
 * | # | 呼び出し | 影響する出力 | 行 |
 * |---|---|---|---|
 * | **1. ブレイク検出** | `findHsBreakoutIdx` 内の `necklineAt(neckline, k)` | `breakoutIdx` → `status` / `range.end` / `confirmation` | `:424` |
 * | **2. スコアリング** | `necklinePrice: necklineAt(neckline, breakoutIdx)`（完成 4 経路） | `confidence`（`breakoutQuality` 軸） | `:835` / `:1042` / `:1303` / `:1527` |
 * | **3. ターゲット投影** | `necklineProjectionTarget` 内の `necklineAtOr(neckline, anchorIdx, …)` | `breakoutTarget` / `targetReached*` | `:247` |
 *
 * **2 は 1 の結果（`breakoutIdx`）を使うが、`necklineAt` の呼び出しとしては別**なので、
 * クランプする / しないは 3 系統それぞれ独立に選べる。よって消費者 2 は
 * **`breakoutIdx` 固定（消費者 1 は無クランプのまま）**と**`breakoutIdx` も消費者 1 でクランプ**の
 * 2 通りで測る。
 *
 * **`necklineProjectionHeight`（頭の真下の水準）はクランプの対象外。** 頭 `p2` は
 * 定義点 `p1` / `p3` の**内側**にあるので内挿であり、クランプしても値が変わらない。
 * 消費者 3 で動くのは投影の**起点**だけ。
 *
 * ## クランプ版の作り方（`detect_hs.ts` を変えずに検出器そのものを走らせる）
 *
 * `necklineAt` は module-private なので注入できない。代わりに **`detect_hs.ts` のソースを読み、
 * 相対 import を絶対パスへ書き換え、消費者ごとに 1 行ずつ差し替えた複製を一時ディレクトリに
 * `.mts` として書き出して動的 import する。** 検出器のロジックはそれ以外 1 文字も変わらないので、
 * スコアの再実装（丸め由来の誤差が入る）を経ずに `confidence` / `status` / `breakoutTarget` を
 * 検出器の生の出力として比較できる。
 *
 * 差し替えは以下の 3 箇所。**出現回数を数えて期待値と違えば throw する**（`detect_hs.ts` が
 * 変わったのに計測だけ黙って通る事故を防ぐ）。
 *
 * | 系統 | 置換前 | 期待出現回数 |
 * |---|---|---|
 * | 1 | `const nlPrice = necklineAt(neckline, k);` | 1 |
 * | 2 | `necklinePrice: necklineAt(neckline, breakoutIdx),` | 4 |
 * | 3 | `const nlAtAnchor = necklineAtOr(neckline, anchorIdx, fallbackNecklinePrice);` | 1 |
 *
 * 変異なし（3 系統とも無クランプ）の複製が**本物の `detect_hs.ts` と全キー一致**することを
 * 全ケースで検算してから比較に入る（`## 0` 章に件数を出す）。
 *
 * ## コーパス
 *
 * #227（`measure_relaxed_fallback_227.ts`）と同じ組み方:
 *
 * - **標準コーパス 800** = 合成 704（22 系列 × オプション 8 通り × 時間足 2 種 × `swingDepth` 2 種）
 *   ＋ 実データ A 96（`btc_jpy_1day_2026` × 時間足 3 種 × `swingDepth` 4 種 × オプション 8 通り）
 * - **実データ B 96**（`btc_jpy_1hour_2026_08` × 同上）は**別建て**で集計する（#219）
 *
 * ## `eth_jpy` / `xrp_jpy` / `sol_jpy`（issue の実害 4 件）について
 *
 * これらの系列はリポジトリに fixture が無く、**本実行環境は `public.bitbank.cc` への
 * 送信が組織のエグレスポリシーで拒否される**（CONNECT が 403）ため取得できない。
 * 系列を持っている環境で測れるように `--extra <file.json>` を用意してある。JSON の形は:
 *
 * ```json
 * [{ "label": "sol_jpy_1day", "tf": "1day",
 *    "candles": [{ "isoTime": "…", "open": 1, "high": 2, "low": 0.5, "close": 1.5 }] }]
 * ```
 *
 * 各系列は**標準コーパスにプールせず個別の表**に出す（#219 の教訓）。
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildBtcJpy2026Candles } from '../tests/fixtures/btc_jpy_1day_2026.js';
import { buildBtcJpy1hour202608Candles } from '../tests/fixtures/btc_jpy_1hour_2026_08.js';
import * as synth from '../tests/fixtures/synthetic_pattern_candles.js';
import { getSizeThresholdsForTf, resolveParams } from '../tools/patterns/config.js';
import { detectHeadAndShoulders, necklineProjectionHeight } from '../tools/patterns/detect_hs.js';
import { linearRegressionWithR2, near as nearFn, pct as pctFn } from '../tools/patterns/regression.js';
import { HS_NECKLINE_MAX_PCT, relDiff } from '../tools/patterns/structural.js';
import { type Candle, detectSwingPoints, filterPeaks, filterValleys } from '../tools/patterns/swing.js';
import type { CandDebugEntry, DeduplicablePattern, DetectContext } from '../tools/patterns/types.js';

// ── `detect_hs.ts` の module-private 定数（**読むだけ**。値を変える計測ではない） ──

/** `detect_hs.ts` の `HS_BREAKOUT_MAX_BARS`（右肩から何バー先までブレイクを探索するか）。 */
const HS_BREAKOUT_MAX_BARS = 30;
/** `detect_hs.ts` の `HS_BREAKOUT_BUFFER_PCT`（ブレイク判定のバッファ）。 */
const HS_BREAKOUT_BUFFER_PCT = 0.015;

// ── クランプ版 `detect_hs.ts` の生成 ──

/** どの消費者をクランプするか。3 系統は独立に選べる（issue #211 の再整理）。 */
interface ClampFlags {
	/** 消費者 1: `findHsBreakoutIdx` 内のブレイク判定 */
	breakout: boolean;
	/** 消費者 2: `buildHsScore` に渡す `necklinePrice` */
	score: boolean;
	/** 消費者 3: `necklineProjectionTarget` の投影起点 */
	target: boolean;
}

/** 変異 1 件（置換前 → 置換後 と期待出現回数）。 */
interface Mutation {
	from: string;
	to: string;
	count: number;
}

const ROOT = resolve(import.meta.dirname, '..');

/** 複製に注入するクランプヘルパ。定義点の区間 `[min(x), max(x)]` へ添字を丸める。 */
const CLAMP_HELPER = `
function __clampIdx211(neckline: NecklinePt[] | undefined, i: number): number {
	if (!Array.isArray(neckline) || neckline.length < 2) return i;
	const [a, b] = neckline;
	if (!(Number.isFinite(a?.x) && Number.isFinite(b?.x)) || !Number.isFinite(i)) return i;
	return Math.min(Math.max(a.x, b.x), Math.max(Math.min(a.x, b.x), i));
}
`;

/** ヘルパを差し込むアンカー（`necklineAt` の定義の直後）。 */
const HELPER_ANCHOR = '\treturn a.y + ((b.y - a.y) * (i - a.x)) / (b.x - a.x);\n}\n';

function mutationsFor(flags: ClampFlags): Mutation[] {
	const out: Mutation[] = [];
	if (flags.breakout) {
		out.push({
			from: 'const nlPrice = necklineAt(neckline, k);',
			to: 'const nlPrice = necklineAt(neckline, __clampIdx211(neckline, k));',
			count: 1,
		});
	}
	if (flags.score) {
		out.push({
			from: 'necklinePrice: necklineAt(neckline, breakoutIdx),',
			to: 'necklinePrice: necklineAt(neckline, __clampIdx211(neckline, breakoutIdx)),',
			count: 4,
		});
	}
	if (flags.target) {
		out.push({
			from: 'const nlAtAnchor = necklineAtOr(neckline, anchorIdx, fallbackNecklinePrice);',
			to: 'const nlAtAnchor = necklineAtOr(neckline, __clampIdx211(neckline, anchorIdx), fallbackNecklinePrice);',
			count: 1,
		});
	}
	return out;
}

/** 一時ディレクトリ（プロセス 1 回につき 1 つ。複製はここに `.mts` で置く）。 */
const TMP_DIR = mkdtempSync(join(tmpdir(), 'neckline-clamp-211-'));

type Detector = (ctx: DetectContext) => { patterns: DeduplicablePattern[] };

const variantCache = new Map<string, Promise<Detector>>();

function flagKey(flags: ClampFlags): string {
	return `${flags.breakout ? 1 : 0}${flags.score ? 1 : 0}${flags.target ? 1 : 0}`;
}

/**
 * `detect_hs.ts` の複製を作って `detectHeadAndShoulders` を返す。
 *
 * 相対 import を絶対パスへ書き換えるので、複製をどこに置いても同じモジュール実体
 * （`config.ts` / `scoring.ts` 等）を見る。拡張子を `.mts` にしてあるのは、
 * 一時ディレクトリには package の `type` 宣言が無く、tsx が ESM だと判定できるようにするため。
 */
function loadVariant(flags: ClampFlags): Promise<Detector> {
	const key = flagKey(flags);
	const cached = variantCache.get(key);
	if (cached) return cached;
	const loading = (async (): Promise<Detector> => {
		let src = readFileSync(join(ROOT, 'tools/patterns/detect_hs.ts'), 'utf8');
		src = src.replace(/from '\.\.\/\.\.\//g, `from '${ROOT}/`).replace(/from '\.\//g, `from '${ROOT}/tools/patterns/`);
		const anchorHits = src.split(HELPER_ANCHOR).length - 1;
		if (anchorHits !== 1) throw new Error(`necklineAt のアンカーが ${anchorHits} 箇所（期待 1）`);
		src = src.replace(HELPER_ANCHOR, HELPER_ANCHOR + CLAMP_HELPER);
		for (const m of mutationsFor(flags)) {
			const hits = src.split(m.from).length - 1;
			if (hits !== m.count) throw new Error(`置換対象「${m.from}」が ${hits} 箇所（期待 ${m.count}）`);
			src = src.split(m.from).join(m.to);
		}
		const file = join(TMP_DIR, `detect_hs_${key}.mts`);
		writeFileSync(file, src);
		const mod = (await import(pathToFileURL(file).href)) as { detectHeadAndShoulders: Detector };
		return mod.detectHeadAndShoulders;
	})();
	variantCache.set(key, loading);
	return loading;
}

/** 計測する変異の組。`base` は 3 系統とも無クランプ（＝本物と一致するはずの対照）。 */
const VARIANTS = {
	base: { breakout: false, score: false, target: false },
	c1: { breakout: true, score: false, target: false },
	c2: { breakout: false, score: true, target: false },
	c1c2: { breakout: true, score: true, target: false },
	c3: { breakout: false, score: false, target: true },
} as const satisfies Record<string, ClampFlags>;

type VariantName = keyof typeof VARIANTS;
const VARIANT_NAMES = Object.keys(VARIANTS) as VariantName[];

// ── コーパス（#227 と同じ組み方） ──

type Group = 'synthetic' | 'realA' | 'realB' | 'extra';

interface Series {
	group: Group;
	name: string;
	candles: Candle[];
}

interface CaseOpts {
	includeForming: boolean;
	includeCompleted: boolean;
	includeInvalid: boolean;
}

interface CaseSpec {
	series: Series;
	tf: string;
	/** `undefined` = 時間軸オート（既定） */
	swingDepth: number | undefined;
	opts: CaseOpts;
}

const SYNTHETIC_BUILDERS: ReadonlyArray<readonly [string, () => Candle[]]> = [
	['completed_double_top', synth.buildCompletedDoubleTopCandles],
	['forming_double_bottom', synth.buildFormingDoubleBottomCandles],
	['descending_triangle_invalid', synth.buildDescendingTriangleInvalidBreakoutCandles],
	['rectangle_range', synth.buildRectangleRangeCandles],
	['rising_channel', synth.buildRisingChannelCandles],
	['bull_flag_failure', synth.buildBullFlagFailureCandles],
	['bull_pennant_success', synth.buildBullPennantSuccessCandles],
	['bull_pennant_failure', synth.buildBullPennantFailureCandles],
	['completed_triple_top', synth.buildCompletedTripleTopCandles],
	['forming_triple_bottom', synth.buildFormingTripleBottomCandles],
	['completed_hs', synth.buildCompletedHeadAndShouldersCandles],
	['forming_ihs', synth.buildFormingInverseHeadAndShouldersCandles],
	['forming_rising_wedge', synth.buildFormingRisingWedgeCandles],
	['completed_falling_wedge', synth.buildCompletedFallingWedgeCandles],
	['forming_ascending_triangle', synth.buildFormingAscendingTriangleCandles],
	['forming_symmetrical_triangle', synth.buildFormingSymmetricalTriangleCandles],
	['asymmetric_neckline_ihs', synth.buildAsymmetricNecklineIHSCandles],
	['asymmetric_neckline_hs', synth.buildAsymmetricNecklineHSCandles],
	['unequal_peaks_double_top', synth.buildUnequalPeaksDoubleTopCandles],
	['uptrend_fake_double_bottom', synth.buildUptrendThenFakeDoubleBottomCandles],
	['downtrend_fake_hs', synth.buildDowntrendThenFakeHSCandles],
	['unequal_valleys_double_bottom', synth.buildUnequalValleysDoubleBottomCandles],
];

/**
 * MCP の統合オプション 3 つの全組み合わせ。検出器に届くのは `includeForming` だけだが、
 * #204 / #206 / #210 / #227 の実測ログと**ケース数（800 / 96）の単位を揃える**ため 8 通り回す。
 */
const OPTS8: CaseOpts[] = Array.from({ length: 8 }, (_, b) => ({
	includeForming: (b & 1) !== 0,
	includeCompleted: (b & 2) !== 0,
	includeInvalid: (b & 4) !== 0,
}));

/** 実データ系列 1 本ぶんのケース（時間足 3 種 × `swingDepth` 4 種 × オプション 8 通り = 96）。 */
function realCases(series: Series): CaseSpec[] {
	const out: CaseSpec[] = [];
	for (const tf of ['1day', '4hour', '1hour']) {
		for (const swingDepth of [undefined, 2, 3, 6]) {
			for (const opts of OPTS8) out.push({ series, tf, swingDepth, opts });
		}
	}
	return out;
}

/** 標準コーパス 800（合成 704 + 実データ A 96）と実データ B 96 を組む。プールしない（#219）。 */
function buildCorpus(): { standard: CaseSpec[]; realB: CaseSpec[] } {
	const standard: CaseSpec[] = [];
	for (const [name, build] of SYNTHETIC_BUILDERS) {
		const series: Series = { group: 'synthetic', name, candles: build() as Candle[] };
		for (const tf of ['1day', '1hour']) {
			for (const swingDepth of [2, 3]) {
				for (const opts of OPTS8) standard.push({ series, tf, swingDepth, opts });
			}
		}
	}
	standard.push(
		...realCases({ group: 'realA', name: 'btc_jpy_1day_2026', candles: buildBtcJpy2026Candles() as Candle[] }),
	);
	return {
		standard,
		realB: realCases({
			group: 'realB',
			name: 'btc_jpy_1hour_2026_08',
			candles: buildBtcJpy1hour202608Candles() as Candle[],
		}),
	};
}

/** `--extra` の JSON 1 要素。時間足ラベルと OHLC 列だけを持つ最小形。 */
interface ExtraSeriesInput {
	label: string;
	tf: string;
	candles: Array<{ isoTime?: string; open: number; high: number; low: number; close: number }>;
}

/**
 * `--extra <file.json>` を読み、系列ごとに**独立したケース集合**を返す。
 * `tf` は `resolveParams` に渡すラベルで、`swingDepth` 4 種 × オプション 8 通り = 32 ケース。
 */
function buildExtraCorpus(path: string): Array<{ name: string; cases: CaseSpec[] }> {
	const parsed = JSON.parse(readFileSync(path, 'utf8')) as ExtraSeriesInput[];
	if (!Array.isArray(parsed)) throw new Error('--extra の JSON は配列であること');
	return parsed.map((s) => {
		const series: Series = { group: 'extra', name: s.label, candles: s.candles as Candle[] };
		const cases: CaseSpec[] = [];
		for (const swingDepth of [undefined, 2, 3, 6]) {
			for (const opts of OPTS8) cases.push({ series, tf: s.tf, swingDepth, opts });
		}
		return { name: s.label, cases };
	});
}

// ── ハーネス（`detect_patterns.ts` と同じ ctx の組み方） ──

/** `detect_patterns.ts` と同じ順序で `DetectContext` を組む。 */
function buildCtx(spec: CaseSpec): DetectContext {
	const { candles } = spec.series;
	const resolved = resolveParams(spec.tf, spec.swingDepth === undefined ? {} : { swingDepth: spec.swingDepth });
	const pivots = detectSwingPoints(candles, { swingDepth: resolved.swingDepth, strictPivots: true });
	const debugCandidates: CandDebugEntry[] = [];
	return {
		candles,
		pivots,
		allPeaks: filterPeaks(pivots),
		allValleys: filterValleys(pivots),
		tolerancePct: resolved.tolerancePct,
		headProminencePct: resolved.headProminencePct,
		sizeThresholds: getSizeThresholdsForTf(spec.tf),
		minDist: resolved.minBarsBetweenSwings,
		want: new Set(),
		includeForming: spec.opts.includeForming,
		debugCandidates,
		type: spec.tf,
		swingDepth: resolved.swingDepth,
		near: (a: number, b: number) => nearFn(a, b, resolved.tolerancePct),
		pct: pctFn,
		lrWithR2: linearRegressionWithR2,
		tz: 'Asia/Tokyo',
	};
}

// ── 出力の抜き出し ──

type NecklinePt = { x: number; y: number };

/** `detect_hs.ts` の `necklineAt` と**同じ式**（複製せず値を再現するためだけに使う）。 */
function necklineAtLocal(neckline: NecklinePt[], i: number): number {
	const [a, b] = neckline;
	if (b.x === a.x) return a.y;
	return a.y + ((b.y - a.y) * (i - a.x)) / (b.x - a.x);
}

/** 複製に注入するのと同じクランプ（定義点の区間へ添字を丸める）。 */
function clampIdxLocal(neckline: NecklinePt[], i: number): number {
	const [a, b] = neckline;
	return Math.min(Math.max(a.x, b.x), Math.max(Math.min(a.x, b.x), i));
}

type PathKind = 'strict' | 'relaxed' | 'forming';

/** 1 変異ぶんの出力（比較に使うフィールドだけ）。 */
interface Snap {
	status: string | undefined;
	confidence: number;
	breakoutIdx: number;
	breakoutClose: number | undefined;
	breakoutTarget: number | undefined;
	targetReached: boolean | undefined;
	targetReachedPct: number | undefined;
	rangeEnd: string | undefined;
	breakoutQuality: number | undefined;
}

function toSnap(p: DeduplicablePattern): Snap {
	const sc = p.scoreComponents as Record<string, number | undefined> | undefined;
	return {
		status: typeof p.status === 'string' ? p.status : undefined,
		confidence: Number(p.confidence),
		breakoutIdx: typeof p.breakoutBarIndex === 'number' ? p.breakoutBarIndex : -1,
		breakoutClose: p.breakout ? Number(p.breakout.price) : undefined,
		breakoutTarget: typeof p.breakoutTarget === 'number' ? p.breakoutTarget : undefined,
		targetReached: typeof p.targetReached === 'boolean' ? p.targetReached : undefined,
		targetReachedPct: typeof p.targetReachedPct === 'number' ? p.targetReachedPct : undefined,
		rangeEnd: p.range?.end,
		breakoutQuality: sc?.breakoutQuality,
	};
}

/** 計測 1 行 = （ケース × 検出された H&S 系パターン 1 件）。 */
interface Row {
	group: Group;
	series: string;
	tf: string;
	swingDepth: number | undefined;
	optsBits: number;
	type: 'head_and_shoulders' | 'inverse_head_and_shoulders';
	direction: 'down' | 'up';
	path: PathKind;
	pivotIdxs: number[];
	neckline: [NecklinePt, NecklinePt];
	/** 定義点の右端（外挿距離の基準。strict / relaxed は `p3.idx`、forming は頭後の谷 / 山） */
	defRight: number;
	/** ネックラインが水平か（`y` が一致。relaxed と一部の forming 経路。クランプは恒等） */
	horizontal: boolean;
	/** 傾き（円 / 本。符号つき） */
	slopePerBar: number;
	/** 相対傾き（`relDiff(p1, p3) / 定義点間隔`。符号は `y` の増減方向） */
	relSlopePerBar: number;
	/** その時間足での理論上界 `HS_NECKLINE_MAX_PCT / (2 × minBarsBetweenSwings)` */
	relSlopeBound: number;
	/** `resolveParams` が返した `minBarsBetweenSwings`（定義点間隔の理論最小はこの 2 倍） */
	minDist: number;
	/** パターン高さ（`necklineProjectionHeight`。クランプ不変） */
	patternHeight: number | undefined;
	/** 消費者 1 が `necklineAt` を評価する添字の範囲（`[from, to]` の閉区間） */
	scanFrom: number;
	scanTo: number;
	snaps: Record<VariantName, Snap>;
}

/** ハーネスの検算カウンタ（`## 0` 章に出す）。 */
interface Audit {
	cases: number;
	patterns: number;
	/** 変異なしの複製が本物の `detect_hs.ts` と JSON で一致しなかったケース数（0 でなければ計測は無効） */
	baselineMismatch: number;
	/** 観測した「右肩からブレイク足までのバー数」の最大（`HS_BREAKOUT_MAX_BARS` の検算） */
	maxBreakoutOffset: number;
}

/** ケース 1 件を全変異で走らせ、パターンごとの行を返す。 */
async function runCase(spec: CaseSpec, detectors: Record<VariantName, Detector>, audit: Audit): Promise<Row[]> {
	const results = {} as Record<VariantName, DeduplicablePattern[]>;
	for (const name of VARIANT_NAMES) {
		const ctx = buildCtx(spec);
		results[name] = detectors[name](ctx).patterns.filter(
			(p) => p.type === 'head_and_shoulders' || p.type === 'inverse_head_and_shoulders',
		);
	}
	const base = results.base;
	// 変異なしの複製が**本物の `detect_hs.ts`** と全キー一致することを毎ケース検算する
	// （import の書き換えとヘルパ注入が出力に影響していないことの担保）。
	const real = detectHeadAndShoulders(buildCtx(spec)).patterns.filter(
		(p) => p.type === 'head_and_shoulders' || p.type === 'inverse_head_and_shoulders',
	);
	audit.cases++;
	audit.patterns += real.length;
	if (JSON.stringify(real) !== JSON.stringify(base)) audit.baselineMismatch++;
	// **メンバは変異で動かない**（strict の受理条件はブレイクを見ず、relaxed は strict が 0 件のときだけ走る）。
	// 動いたら添字での対応づけが壊れるので、比較に入る前に落とす。
	for (const name of VARIANT_NAMES) {
		const v = results[name];
		if (v.length !== base.length)
			throw new Error(`パターン件数が変異 ${name} で変わった: ${spec.series.name}/${spec.tf}`);
		for (let i = 0; i < base.length; i++) {
			const a = base[i];
			const b = v[i];
			const ai = (a.pivots ?? []).map((q) => q.idx).join('-');
			const bi = (b.pivots ?? []).map((q) => q.idx).join('-');
			if (a.type !== b.type || ai !== bi) {
				throw new Error(`パターンの並びが変異 ${name} で変わった: ${spec.series.name}/${spec.tf} #${i}`);
			}
		}
	}
	const resolved = resolveParams(spec.tf, spec.swingDepth === undefined ? {} : { swingDepth: spec.swingDepth });
	const rows: Row[] = [];
	for (let i = 0; i < base.length; i++) {
		const p = base[i];
		const nl = p.neckline as NecklinePt[] | undefined;
		const pivots = p.pivots ?? [];
		if (!nl || nl.length < 2 || pivots.length < 4) continue;
		const type = p.type as Row['type'];
		const direction = type === 'head_and_shoulders' ? 'down' : 'up';
		const path: PathKind = p._fallback ? 'relaxed' : p.status === 'forming' ? 'forming' : 'strict';
		const headIdxPos = path === 'forming' ? 1 : 2;
		const head = pivots[headIdxPos];
		const [a, b] = nl;
		const span = b.x - a.x;
		const relSlope = span === 0 ? 0 : (relDiff(a.y, b.y) / span) * (b.y >= a.y ? 1 : -1);
		const lastPivotIdx = pivots[pivots.length - 1].idx;
		rows.push({
			group: spec.series.group,
			series: spec.series.name,
			tf: spec.tf,
			swingDepth: spec.swingDepth,
			optsBits:
				(spec.opts.includeForming ? 1 : 0) | (spec.opts.includeCompleted ? 2 : 0) | (spec.opts.includeInvalid ? 4 : 0),
			type,
			direction,
			path,
			pivotIdxs: pivots.map((q) => q.idx),
			neckline: [a, b],
			defRight: Math.max(a.x, b.x),
			horizontal: a.y === b.y,
			slopePerBar: span === 0 ? 0 : (b.y - a.y) / span,
			relSlopePerBar: relSlope,
			relSlopeBound: HS_NECKLINE_MAX_PCT / (2 * resolved.minBarsBetweenSwings),
			minDist: resolved.minBarsBetweenSwings,
			patternHeight: necklineProjectionHeight({
				neckline: nl,
				headIdx: head.idx,
				headPrice: head.price,
				direction,
				fallbackNecklinePrice: a.y,
			}),
			scanFrom: lastPivotIdx + 1,
			scanTo: Math.min(lastPivotIdx + HS_BREAKOUT_MAX_BARS, spec.series.candles.length - 1),
			snaps: Object.fromEntries(VARIANT_NAMES.map((n) => [n, toSnap(results[n][i])])) as Record<VariantName, Snap>,
		});
	}
	return rows;
}

// ── 集計ユーティリティ ──

/** nearest-rank のパーセンタイル（#205 / #206 / #227 の表と同じ流儀）。空配列は `undefined`。 */
function percentile(sorted: number[], p: number): number | undefined {
	if (sorted.length === 0) return undefined;
	const rank = Math.max(1, Math.ceil(p * sorted.length));
	return sorted[rank - 1];
}

const DIST_HEADER = '| 対象 | n | min | p25 | p50 | p75 | p95 | max |\n|---|---:|---:|---:|---:|---:|---:|---:|';

/** 分布 1 行（n / min / p25 / p50 / p75 / p95 / max）。`digits` は小数桁、`asPct` なら百分率表示。 */
function distRow(label: string, values: number[], digits = 3, asPct = false): string {
	const s = [...values].sort((a, b) => a - b);
	const f = (v: number | undefined) =>
		v === undefined ? '—' : asPct ? `${(v * 100).toFixed(digits)}%` : v.toFixed(digits);
	return `| ${label} | ${s.length} | ${f(s[0])} | ${f(percentile(s, 0.25))} | ${f(percentile(s, 0.5))} | ${f(percentile(s, 0.75))} | ${f(percentile(s, 0.95))} | ${f(s[s.length - 1])} |`;
}

/** 構造の同一性キー。オプション 8 通り（と同一ピボット列を生む `swingDepth`）の重複を畳む。 */
function structureKey(r: Row): string {
	return `${r.series}|${r.tf}|${r.type}|${r.path}|${r.pivotIdxs.join('-')}`;
}

/** 行集合を構造単位に畳む（同じ構造の最初の 1 行を代表にする）。 */
function uniqStructures(rows: Row[]): Row[] {
	const seen = new Set<string>();
	const out: Row[] = [];
	for (const r of rows) {
		const k = structureKey(r);
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(r);
	}
	return out;
}

/** 消費者 2 / 3 が `necklineAt` を評価する添字（ブレイクがあればブレイク足、無ければ最終構成点）。 */
function anchorIdxOf(r: Row, snap: Snap): number {
	return snap.breakoutIdx >= 0 ? snap.breakoutIdx : r.pivotIdxs[r.pivotIdxs.length - 1];
}

/** `target` がブレイク終値から見て**投影方向の側**にあるか（下方向なら下、上方向なら上）。 */
function targetSideCorrect(direction: 'down' | 'up', target: number, breakoutClose: number): boolean {
	return direction === 'down' ? target < breakoutClose : target > breakoutClose;
}

/** `path` 別 / `type` 別の件数を Markdown の表にする。 */
function countTable(rows: Row[], header: string): string {
	const keys = new Map<string, { total: number; sloped: number; horizontal: number; structures: Set<string> }>();
	for (const r of rows) {
		const k = `${r.type} / ${r.path}`;
		const e = keys.get(k) ?? { total: 0, sloped: 0, horizontal: 0, structures: new Set<string>() };
		e.total++;
		if (r.horizontal) e.horizontal++;
		else e.sloped++;
		e.structures.add(structureKey(r));
		keys.set(k, e);
	}
	const lines = [`| ${header} | 延べ行 | 構造 | 傾きあり | 水平（クランプ恒等） |`, '|---|---:|---:|---:|---:|'];
	for (const [k, e] of [...keys.entries()].sort()) {
		lines.push(`| ${k} | ${e.total} | ${e.structures.size} | ${e.sloped} | ${e.horizontal} |`);
	}
	if (keys.size === 0) lines.push(`| （該当 0 件） | 0 | 0 | 0 | 0 |`);
	return lines.join('\n');
}

/** 変異 2 つの間で `confidence` / `status` / `breakoutTarget` が動いた行数を数える。 */
function diffCounts(rows: Row[], from: VariantName, to: VariantName) {
	let confidence = 0;
	let status = 0;
	let breakoutIdx = 0;
	let target = 0;
	let rangeEnd = 0;
	let targetReached = 0;
	for (const r of rows) {
		const a = r.snaps[from];
		const b = r.snaps[to];
		if (a.confidence !== b.confidence) confidence++;
		if (a.status !== b.status) status++;
		if (a.breakoutIdx !== b.breakoutIdx) breakoutIdx++;
		if (a.breakoutTarget !== b.breakoutTarget) target++;
		if (a.rangeEnd !== b.rangeEnd) rangeEnd++;
		if (a.targetReached !== b.targetReached) targetReached++;
	}
	return { confidence, status, breakoutIdx, target, rangeEnd, targetReached, n: rows.length };
}

// ── 計測 1: 外挿距離・傾きの分布（3 消費者共通の基礎データ） ──

function section1(rows: Row[], h: string): string {
	const structures = uniqStructures(rows);
	const sloped = structures.filter((r) => !r.horizontal);
	const out: string[] = [];
	out.push(`${h}## 1-1 ネックラインの形状`);
	out.push('');
	out.push(countTable(rows, 'type / 経路'));
	out.push('');
	out.push(
		'relaxed 経路のネックラインは 2 点とも同じ `y`（`nlY` の水平線）なので、**クランプは恒等**（外挿しても値が変わらない）。',
	);
	out.push('forming も先行谷 / 先行山が取れない経路では水平線になる。以降の分布は**傾きのある構造だけ**を対象にする。');
	out.push('');
	out.push(`${h}## 1-2 外挿距離（定義点の右端からの本数。構造単位・傾きあり）`);
	out.push('');
	const withBreak = sloped.filter((r) => r.snaps.base.breakoutIdx >= 0);
	const noBreak = sloped.filter((r) => r.snaps.base.breakoutIdx < 0);
	out.push(DIST_HEADER);
	out.push(
		distRow(
			'消費者1: スキャン開始（最初に評価する添字）',
			sloped.map((r) => r.scanFrom - r.defRight),
			1,
		),
	);
	out.push(
		distRow(
			'消費者1: スキャン終端（最後に評価する添字）',
			sloped.map((r) => r.scanTo - r.defRight),
			1,
		),
	);
	out.push(
		distRow(
			'消費者2/3: 評価点（ブレイク済み = ブレイク足）',
			withBreak.map((r) => r.snaps.base.breakoutIdx - r.defRight),
			1,
		),
	);
	out.push(
		distRow(
			'消費者3: 評価点（未ブレイク = 最終構成点）',
			noBreak.map((r) => anchorIdxOf(r, r.snaps.base) - r.defRight),
			1,
		),
	);
	out.push('');
	out.push(`${h}## 1-3 起点のずれ（無クランプ − クランプ。消費者 2 / 3 の評価点で測る）`);
	out.push('');
	const devRows = sloped.map((r) => {
		const idx = anchorIdxOf(r, r.snaps.base);
		const raw = necklineAtLocal(r.neckline, idx);
		const clamped = necklineAtLocal(r.neckline, clampIdxLocal(r.neckline, idx));
		return {
			r,
			abs: Math.abs(raw - clamped),
			rel: Math.abs(raw - clamped) / Math.abs(clamped),
			height: r.patternHeight,
		};
	});
	out.push(DIST_HEADER);
	out.push(
		distRow(
			'ずれ（円。絶対値）',
			devRows.map((d) => d.abs),
			1,
		),
	);
	out.push(
		distRow(
			'ずれ / ネックライン水準',
			devRows.map((d) => d.rel),
			3,
			true,
		),
	);
	out.push(
		distRow(
			'ずれ / パターン高さ',
			devRows.filter((d) => d.height !== undefined && d.height > 0).map((d) => d.abs / (d.height as number)),
			3,
			true,
		),
	);
	out.push('');
	out.push(`${h}## 1-4 傾きと理論上界`);
	out.push('');
	out.push(DIST_HEADER);
	out.push(
		distRow(
			'傾きの絶対値（%/本。`relDiff(p1, p3) / 定義点間隔`）',
			sloped.map((r) => Math.abs(r.relSlopePerBar)),
			4,
			true,
		),
	);
	out.push(
		distRow(
			'傾きの絶対値 / 理論上界',
			sloped.map((r) => Math.abs(r.relSlopePerBar) / r.relSlopeBound),
			3,
		),
	);
	out.push(
		distRow(
			'定義点間隔（本）',
			sloped.map((r) => r.neckline[1].x - r.neckline[0].x),
			1,
		),
	);
	out.push(
		distRow(
			'定義点間隔 / 理論最小（2 × minBarsBetweenSwings）',
			sloped.map((r) => (r.neckline[1].x - r.neckline[0].x) / (2 * r.minDist)),
			3,
		),
	);
	out.push('');
	const bounds = [...new Set(sloped.map((r) => r.relSlopeBound))].sort((a, b) => a - b);
	out.push(
		'理論上界は `HS_NECKLINE_MAX_PCT / (2 × minBarsBetweenSwings)`' +
			'（定義点 `p1`〜`p3` は頭を挟むので、隣接ピボット間隔の最小値の 2 倍が下限になる。' +
			'issue 本文の「`minBarsBetweenSwings` で割る」は 1 ギャップぶんの数え方で、`1hour` の 1.25%/本 は実際には 0.05 / 4）。' +
			`本集合に現れた上界: ${bounds.map((b) => `${(b * 100).toFixed(4)}%/本`).join(' / ')}。`,
	);
	const negative = sloped.filter((r) => r.relSlopePerBar < 0).length;
	out.push('');
	out.push(
		`傾きの符号: 右上がり ${sloped.length - negative} 構造 / 右下がり ${negative} 構造。` +
			'（issue #211 が危険視したのは「逆 H&S × 右下がり」＝外挿で判定ラインが下がり、外挿無しでは成立しないブレイクが立つ組み合わせ。）',
	);
	return out.join('\n');
}

// ── 計測 2: 消費者 1（ブレイク検出）への影響 ──

function section2(rows: Row[]): string {
	const out: string[] = [];
	const structures = uniqStructures(rows);
	const sloped = structures.filter((r) => !r.horizontal);
	const changed = sloped.filter((r) => r.snaps.base.breakoutIdx !== r.snaps.c1.breakoutIdx);
	const lost = changed.filter((r) => r.snaps.base.breakoutIdx >= 0 && r.snaps.c1.breakoutIdx < 0);
	const gained = changed.filter((r) => r.snaps.base.breakoutIdx < 0 && r.snaps.c1.breakoutIdx >= 0);
	const later = changed.filter(
		(r) => r.snaps.base.breakoutIdx >= 0 && r.snaps.c1.breakoutIdx > r.snaps.base.breakoutIdx,
	);
	const earlier = changed.filter(
		(r) =>
			r.snaps.c1.breakoutIdx >= 0 && r.snaps.base.breakoutIdx >= 0 && r.snaps.c1.breakoutIdx < r.snaps.base.breakoutIdx,
	);
	out.push('| 集計 | 構造（傾きあり） |');
	out.push('|---|---:|');
	out.push(`| 対象 | ${sloped.length} |`);
	out.push(`| うち無クランプでブレイク済み | ${sloped.filter((r) => r.snaps.base.breakoutIdx >= 0).length} |`);
	out.push(`| うちクランプ後にブレイク済み | ${sloped.filter((r) => r.snaps.c1.breakoutIdx >= 0).length} |`);
	out.push(`| **\`breakoutIdx\` が変わる構造** | **${changed.length}** |`);
	out.push(`| ├ ブレイクが消える（外挿が作っていた） | ${lost.length} |`);
	out.push(`| ├ ブレイクが生まれる | ${gained.length} |`);
	out.push(`| ├ 後ろへ移動 | ${later.length} |`);
	out.push(`| └ 前へ移動 | ${earlier.length} |`);
	out.push('');
	const st = new Map<string, number>();
	for (const r of sloped) {
		const k = `${r.snaps.base.status ?? '—'} → ${r.snaps.c1.status ?? '—'}`;
		if (r.snaps.base.status !== r.snaps.c1.status) st.set(k, (st.get(k) ?? 0) + 1);
	}
	out.push('| `status` の遷移 | 構造 |');
	out.push('|---|---:|');
	if (st.size === 0) out.push('| （変化なし） | 0 |');
	for (const [k, v] of [...st.entries()].sort()) out.push(`| ${k} | ${v} |`);
	out.push('');
	const d = diffCounts(sloped, 'base', 'c1');
	out.push(
		`\`range.end\` が動く構造 ${d.rangeEnd} 件 / \`targetReached\` が動く構造 ${d.targetReached} 件 / ` +
			`\`confidence\` が動く構造 ${d.confidence} 件。`,
	);
	out.push('');
	out.push(
		'**この `confidence` の変化は消費者 2 をクランプした結果ではない。** 消費者 1 が `breakoutIdx` を動かすと、' +
			'消費者 2 が評価する添字（とブレイク足の終値）も変わるため `breakoutQuality` が連鎖して動く。' +
			'消費者 2 自身のクランプの効果は計測 3 で分けて測る。',
	);
	if (changed.length > 0) {
		out.push('');
		out.push(
			'| 系列 | tf | depth | type | 経路 | ピボット | 傾き(円/本) | base breakout | c1 breakout | base status | c1 status | base conf | c1 conf |',
		);
		out.push('|---|---|---|---|---|---|---:|---:|---:|---|---|---:|---:|');
		for (const r of changed.slice(0, 40)) {
			out.push(
				`| ${r.series} | ${r.tf} | ${r.swingDepth ?? 'auto'} | ${r.type === 'head_and_shoulders' ? 'H&S' : '逆H&S'} | ${r.path} | ${r.pivotIdxs.join('-')} | ${r.slopePerBar.toFixed(2)} | ${r.snaps.base.breakoutIdx} | ${r.snaps.c1.breakoutIdx} | ${r.snaps.base.status ?? '—'} | ${r.snaps.c1.status ?? '—'} | ${r.snaps.base.confidence} | ${r.snaps.c1.confidence} |`,
			);
		}
		if (changed.length > 40) out.push(`| … 他 ${changed.length - 40} 件 | | | | | | | | | | | | |`);
	}
	return out.join('\n');
}

// ── 計測 3: 消費者 2（スコアリング）への影響 ──

function scoreSubTable(rows: Row[], from: VariantName, to: VariantName, title: string): string {
	const out: string[] = [];
	const target = rows.filter((r) => !r.horizontal && r.snaps[from].breakoutIdx >= 0);
	out.push(`**${title}**（対象: 傾きあり かつ \`${from}\` でブレイク済みの構造 ${target.length} 件）`);
	out.push('');
	if (target.length === 0) {
		out.push('該当 0 件。');
		return out.join('\n');
	}
	const deltas = target.map((r) => {
		const idx = r.snaps[from].breakoutIdx;
		const raw = necklineAtLocal(r.neckline, idx);
		const clamped = necklineAtLocal(r.neckline, clampIdxLocal(r.neckline, idx));
		return {
			r,
			dNl: clamped - raw,
			dBq: (r.snaps[to].breakoutQuality ?? Number.NaN) - (r.snaps[from].breakoutQuality ?? Number.NaN),
			dConf: r.snaps[to].confidence - r.snaps[from].confidence,
		};
	});
	out.push(DIST_HEADER);
	out.push(
		distRow(
			'`necklinePrice` の変化（円。クランプ − 無クランプ）',
			deltas.map((d) => d.dNl),
			1,
		),
	);
	out.push(
		distRow(
			'`necklinePrice` の変化 / パターン高さ',
			deltas
				.filter((d) => d.r.patternHeight !== undefined && (d.r.patternHeight as number) > 0)
				.map((d) => d.dNl / (d.r.patternHeight as number)),
			3,
			true,
		),
	);
	out.push(
		distRow(
			'`breakoutQuality` の変化',
			deltas.filter((d) => Number.isFinite(d.dBq)).map((d) => d.dBq),
			4,
		),
	);
	out.push(
		distRow(
			'`confidence` の変化',
			deltas.map((d) => d.dConf),
			3,
		),
	);
	out.push('');
	const up = deltas.filter((d) => d.dConf > 0).length;
	const down = deltas.filter((d) => d.dConf < 0).length;
	const satFrom = target.filter((r) => r.snaps[from].breakoutQuality === 1).length;
	const satTo = target.filter((r) => r.snaps[to].breakoutQuality === 1).length;
	out.push(
		`\`confidence\` 上昇 ${up} 件 / 下降 ${down} 件 / 不変 ${target.length - up - down} 件。` +
			`\`breakoutQuality\` の飽和（= 1.0）は ${satFrom} → ${satTo} 件。`,
	);
	return out.join('\n');
}

function section3(rows: Row[]): string {
	const structures = uniqStructures(rows);
	const out: string[] = [];
	out.push(
		scoreSubTable(structures, 'base', 'c2', '(a) `breakoutIdx` は無クランプのまま固定（消費者 2 だけをクランプ）'),
	);
	out.push('');
	out.push(scoreSubTable(structures, 'c1', 'c1c2', '(b) `breakoutIdx` も消費者 1 でクランプ（消費者 1 + 2）'));
	out.push('');
	const dc2 = diffCounts(
		structures.filter((r) => !r.horizontal),
		'base',
		'c2',
	);
	out.push(
		`消費者 2 単独では \`status\` ${dc2.status} 件 / \`breakoutIdx\` ${dc2.breakoutIdx} 件 / ` +
			`\`breakoutTarget\` ${dc2.target} 件が変化する（\`confidence\` のみが動く経路であることの確認）。`,
	);
	return out.join('\n');
}

// ── 計測 4: 消費者 3（ターゲット投影）への影響 ──

function section4(rows: Row[]): string {
	const structures = uniqStructures(rows);
	const sloped = structures.filter((r) => !r.horizontal);
	const out: string[] = [];
	const withTarget = sloped.filter(
		(r) => r.snaps.base.breakoutTarget !== undefined && r.snaps.c3.breakoutTarget !== undefined,
	);
	const changed = withTarget.filter((r) => r.snaps.base.breakoutTarget !== r.snaps.c3.breakoutTarget);
	out.push(
		`対象: 傾きあり かつ両変異で \`breakoutTarget\` が出る構造 ${withTarget.length} 件（うち変化 ${changed.length} 件）。`,
	);
	out.push('');
	out.push(DIST_HEADER);
	out.push(
		distRow(
			'`breakoutTarget` の変化（円。クランプ − 無クランプ）',
			changed.map((r) => (r.snaps.c3.breakoutTarget as number) - (r.snaps.base.breakoutTarget as number)),
			1,
		),
	);
	out.push(
		distRow(
			'`breakoutTarget` の変化 / パターン高さ',
			changed
				.filter((r) => r.patternHeight !== undefined && (r.patternHeight as number) > 0)
				.map(
					(r) =>
						((r.snaps.c3.breakoutTarget as number) - (r.snaps.base.breakoutTarget as number)) /
						(r.patternHeight as number),
				),
			3,
			true,
		),
	);
	out.push('');
	const broke = withTarget.filter((r) => r.snaps.base.breakoutIdx >= 0 && r.snaps.base.breakoutClose !== undefined);
	let improved = 0;
	let worsened = 0;
	let keptOk = 0;
	let keptNg = 0;
	const flips: Row[] = [];
	for (const r of broke) {
		const close = r.snaps.base.breakoutClose as number;
		const a = targetSideCorrect(r.direction, r.snaps.base.breakoutTarget as number, close);
		const b = targetSideCorrect(r.direction, r.snaps.c3.breakoutTarget as number, close);
		if (a === b) {
			if (a) keptOk++;
			else keptNg++;
			continue;
		}
		flips.push(r);
		if (b) improved++;
		else worsened++;
	}
	out.push('| ブレイク終値との符号関係（`target` が投影方向の側にあるか） | 構造 |');
	out.push('|---|---:|');
	out.push(`| 対象（ブレイク済み・target あり） | ${broke.length} |`);
	out.push(`| 両方とも正しい側 | ${keptOk} |`);
	out.push(`| 両方とも逆側 | ${keptNg} |`);
	out.push(`| **クランプで改善（逆側 → 正しい側）** | **${improved}** |`);
	out.push(`| **クランプで悪化（正しい側 → 逆側）** | **${worsened}** |`);
	out.push('');
	if (flips.length > 0) {
		out.push('| 系列 | tf | depth | type | ピボット | ブレイク終値 | base target | c3 target | 判定 |');
		out.push('|---|---|---|---|---|---:|---:|---:|---|');
		for (const r of flips.slice(0, 30)) {
			const close = r.snaps.base.breakoutClose as number;
			const b = targetSideCorrect(r.direction, r.snaps.c3.breakoutTarget as number, close);
			out.push(
				`| ${r.series} | ${r.tf} | ${r.swingDepth ?? 'auto'} | ${r.type === 'head_and_shoulders' ? 'H&S' : '逆H&S'} | ${r.pivotIdxs.join('-')} | ${close} | ${r.snaps.base.breakoutTarget} | ${r.snaps.c3.breakoutTarget} | ${b ? '改善' : '悪化'} |`,
			);
		}
		if (flips.length > 30) out.push(`| … 他 ${flips.length - 30} 件 | | | | | | | | |`);
		out.push('');
	}
	const d = diffCounts(structures, 'base', 'c3');
	out.push(
		`**不変条件の確認（issue が案 C に課した受け入れ条件）**: \`confidence\` ${d.confidence} 件 / ` +
			`\`status\` ${d.status} 件 / \`breakoutIdx\` ${d.breakoutIdx} 件 / \`range.end\` ${d.rangeEnd} 件が変化。` +
			`\`targetReached\` は ${d.targetReached} 件が変化する（\`breakoutTarget\` の変化に連動する下流）。`,
	);
	return out.join('\n');
}
// ── ドライバ ──

async function runAll(cases: CaseSpec[], detectors: Record<VariantName, Detector>, audit: Audit): Promise<Row[]> {
	const rows: Row[] = [];
	for (const spec of cases) {
		const got = await runCase(spec, detectors, audit);
		for (const r of got) {
			if (r.snaps.base.breakoutIdx >= 0) {
				const offset = r.snaps.base.breakoutIdx - r.pivotIdxs[r.pivotIdxs.length - 1];
				audit.maxBreakoutOffset = Math.max(audit.maxBreakoutOffset, offset);
			}
		}
		rows.push(...got);
	}
	return rows;
}

/** 1 つの行集合について計測 1〜4 をまとめて出す（標準コーパス / 実データ B / `--extra` の各系列で同じ形）。 */
function measurementBlock(label: string, rows: Row[], level: string): string {
	const h = level;
	if (rows.length === 0) {
		return `${h} ${label}\n\nH&S 系のパターンが 1 件も検出されなかった（該当 0 件）。`;
	}
	return [
		`${h} ${label}`,
		'',
		`延べ ${rows.length} 行 / 構造 ${uniqStructures(rows).length} 件。`,
		'',
		`${h}# 計測 1: 外挿距離・傾きの分布`,
		'',
		section1(rows, h),
		'',
		`${h}# 計測 2: 消費者 1（ブレイク検出）`,
		'',
		section2(rows),
		'',
		`${h}# 計測 3: 消費者 2（スコアリング）`,
		'',
		section3(rows),
		'',
		`${h}# 計測 4: 消費者 3（ターゲット投影）`,
		'',
		section4(rows),
	].join('\n');
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const jsonFlag = argv.indexOf('--json');
	const extraFlag = argv.indexOf('--extra');

	const detectors = {} as Record<VariantName, Detector>;
	for (const name of VARIANT_NAMES) detectors[name] = await loadVariant(VARIANTS[name]);

	const audit: Audit = { cases: 0, patterns: 0, baselineMismatch: 0, maxBreakoutOffset: -1 };
	const { standard, realB } = buildCorpus();
	const standardRows = await runAll(standard, detectors, audit);
	const realBRows = await runAll(realB, detectors, audit);

	const extras: Array<{ name: string; rows: Row[] }> = [];
	if (extraFlag >= 0) {
		for (const s of buildExtraCorpus(argv[extraFlag + 1])) {
			extras.push({ name: s.name, rows: await runAll(s.cases, detectors, audit) });
		}
	}

	const md: string[] = [];
	md.push('# `necklineAt` の外挿クランプ — 消費者 3 系統の計測（issue #211 Phase 1）');
	md.push('');
	md.push('`detect_hs.ts` は 1 行も変更していない。クランプ版は実行時に生成した複製に対してだけ効く。');
	md.push('');
	md.push('## 0. ハーネスと検算');
	md.push('');
	md.push('| 項目 | 値 |');
	md.push('|---|---:|');
	md.push(
		`| ケース数（標準 ${standard.length} + 実データ B ${realB.length}${extras.length ? ' + extra' : ''}） | ${audit.cases} |`,
	);
	md.push(`| 検出された H&S 系パターン（延べ） | ${audit.patterns} |`);
	md.push(`| **変異なしの複製が本物と食い違ったケース** | **${audit.baselineMismatch}** |`);
	md.push(
		`| 観測した右肩→ブレイクの最大バー数（\`HS_BREAKOUT_MAX_BARS\` = ${HS_BREAKOUT_MAX_BARS}） | ${audit.maxBreakoutOffset} |`,
	);
	md.push(`| ブレイク判定バッファ（\`HS_BREAKOUT_BUFFER_PCT\`） | ${HS_BREAKOUT_BUFFER_PCT} |`);
	md.push('');
	md.push(
		audit.baselineMismatch === 0
			? '変異なしの複製は全ケースで本物の `detect_hs.ts` と JSON 全キー一致した。以降の差分はすべて注入したクランプによるもの。'
			: '**変異なしの複製が本物と食い違っている。以降の数値は無効。**',
	);
	md.push('');
	md.push(
		'**メンバの不変性**: 全ケースで、どの変異でもパターンの件数と（type, ピボット列）の並びが変わらないことを' +
			'比較前に検査している（変わっていれば throw して計測は完走しない）。' +
			'strict の受理条件はブレイクを見ず、relaxed は strict が 0 件のときだけ走るので構造上そうなる。' +
			'ただし `status` は動くので、`detect_patterns` 側の `includeCompleted` / `includeInvalid` による' +
			'ライフサイクル絞り込みを通した後の `data.patterns` は消費者 1 のクランプで動きうる（計測 2 の `status` 遷移表）。',
	);
	md.push('');
	md.push(measurementBlock('1. 標準コーパス 800（合成 704 + 実データ A 96）', standardRows, '##'));
	md.push('');
	md.push(measurementBlock('2. 実データ B 96（`btc_jpy_1hour_2026_08`。標準コーパスとプールしない）', realBRows, '##'));
	md.push('');
	md.push('## 3. `eth_jpy` / `xrp_jpy` / `sol_jpy`（issue #211 の実害 4 件）');
	md.push('');
	if (extras.length === 0) {
		md.push(
			'`--extra` が指定されていないため計測していない。これらの系列はリポジトリに fixture が無く、' +
				'`public.bitbank.cc` から取得する必要がある。系列を JSON で渡せば標準コーパスと同じ 4 計測を' +
				'**系列ごとに個別の表**で出す（#219 のとおりプールしない）。',
		);
	} else {
		for (const [i, e] of extras.entries()) {
			md.push(measurementBlock(`3-${i + 1}. ${e.name}`, e.rows, '###'));
			md.push('');
		}
	}

	const text = md.join('\n');
	process.stdout.write(`${text}\n`);
	if (jsonFlag >= 0) {
		writeFileSync(argv[jsonFlag + 1], JSON.stringify({ standardRows, realBRows, extras, audit }, null, 2));
	}
}

await main();
