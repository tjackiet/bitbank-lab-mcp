/**
 * issue #216 Phase 1（H&S 分・**再計測**）: H&S 系の主構成点（左肩 p0 / 頭 p2 / 右肩 p4）が
 * ネックラインの**正しい側**にあるかを、`necklineAt`（`tools/patterns/detect_hs.ts`）を基準に測る。
 *
 * ## なぜ再計測なのか（旧計測を流用しない）
 *
 * `docs/internal/structural-neckline-main-points-216.md`（Phase 1）の H&S の数値は
 * **#211 より前**に取ったもので、ネックラインを 3 通り（`scalar` / `line` / `clamped`）で
 * 並べて比べる形だった。`clamped` は「#211 が入ったらこうなる」という**参考値**で、
 * 母集団も #211 前の検出結果（外挿ブレイクで `completed` になっていた候補を含む）だった。
 *
 * **#211 は PR #239 でマージ済み**で、`necklineAt` 自体が定義点 `[p1.idx, p3.idx]` へ
 * クランプする。ブレイク検出・スコアリング・ターゲット投影の 3 消費者がすべてこの
 * 1 つの値を見るようになったので、Phase 2（H&S 分）の基準は `necklineAt` で確定する。
 * 母集団も #211 後の検出結果に変わっている（実データ B の `data.patterns` は H&S 系
 * 4 件 → 2 件）。**無検証で旧数値を流用すると #198 と同じ事故になる**ので測り直す。
 *
 * ## 基準: `necklineAt(neckline, point.idx)` — 点ごとの値
 *
 * triple / double のネックラインは水平スカラーなので 1 つの値で足りたが、H&S の strict 経路は
 * 傾きを持つ。**主構成点ごとに、その点の `idx` で `necklineAt` を評価した値と比較する。**
 * `necklineAt` は #211 で `[p1.idx, p3.idx]` にクランプされているので、実質:
 *
 * | 主構成点 | idx の位置 | `necklineAt` の実質的な意味 |
 * |---|---|---|
 * | 左肩 (p0) | `p1.idx` より前（区間の外） | クランプで `p1.y` に頭打ち＝**谷1 の水準と比較** |
 * | 頭 (p2) | `p1.idx`〜`p3.idx` の内側 | 真の内挿値（傾きを反映） |
 * | 右肩 (p4) | `p3.idx` より後（区間の外） | クランプで `p3.y` に頭打ち＝**谷2 の水準と比較** |
 *
 * **この非対称性は #211 の設計そのもの**で、実装ミスではない。
 *
 * ## 母集団: ゲートを置く位置に到達した候補（4 経路）
 *
 * `detect_hs.ts` の**完成済み 4 経路**（strict / relaxed × top / bottom）で、
 * `applyReversalGate` を通過し `findHsBreakoutIdx` に入る直前の候補を全件記録する。
 * ここが Phase 2 でゲートを置く位置なので、**そこに到達した候補 = ゲートが見る母集団**。
 * 検出器が emit したパターンだけを見ると、ブレイク不成立で捨てられた候補
 * （`buildHsCompletionFields` が `null` を返す経路）が母集団から落ちる。
 *
 * **形成中経路（`tryFormingHS` / `tryFormingInverseHS`）は対象外。** triple / double と同じく
 * 形成途中の右肩は暫定値なので、確定していない点を hard reject の材料にしない。
 *
 * ## ハーネス（`detect_hs.ts` は 1 行も変更しない）
 *
 * `measure_neckline_clamp_211.ts` と同じ流儀で、`detect_hs.ts` の**ソースを読んで複製を作り**、
 * 4 経路の `findHsBreakoutIdx` 呼び出しの直前に記録フック（`__record216`）を注入する。
 * `--gate` 変異ではさらに hard reject（`continue`）を注入し、`data.patterns` への影響を測る。
 *
 * - **`record` 変異**: 記録のみ。パターン出力は本物と全キー一致するはず（毎ケース検算する）。
 * - **`gated` 変異**: 記録 + hard reject。`record` との差分が「ゲートを入れたら何が消えるか」。
 *
 * **本スクリプトを Phase 2 実装後の `main` で走らせると**、注入位置（`findHsBreakoutIdx` の
 * 直前）は本物のゲートの**後ろ**になるので、`record` 変異の母集団は「本物のゲートを通過した
 * 候補」に変わり、`gated` 変異は冪等な no-op になる（＝ゲートの冪等性の検算にはなるが、
 * Phase 1 の差分は出ない）。**Phase 1 の数値は #239 マージ時点の `main` で取得したもの。**
 *
 * ## 使い方
 *
 * ```bash
 * npx tsx scripts/measure_hs_neckline_side_216.ts            # Markdown を stdout へ
 * npx tsx scripts/measure_hs_neckline_side_216.ts --json /tmp/216hs.json
 * ```
 *
 * コーパスは #211 / #227 / #228 と同じ組み方（**標準コーパス 800 + 実データ B 96**）で、
 * **実データ B は標準コーパスにプールしない**（#219）。
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildBtcJpy2026Candles } from '../tests/fixtures/btc_jpy_1day_2026.js';
import { buildBtcJpy1hour202608Candles } from '../tests/fixtures/btc_jpy_1hour_2026_08.js';
import * as synth from '../tests/fixtures/synthetic_pattern_candles.js';
import { getSizeThresholdsForTf, resolveParams } from '../tools/patterns/config.js';
import { detectDoubles } from '../tools/patterns/detect_doubles.js';
import { detectHeadAndShoulders, necklineAt, necklineProjectionHeight } from '../tools/patterns/detect_hs.js';
import { detectPennantsFlags } from '../tools/patterns/detect_pennants.js';
import { detectTriangles } from '../tools/patterns/detect_triangles.js';
import { detectTriples } from '../tools/patterns/detect_triples.js';
import { detectWedges } from '../tools/patterns/detect_wedges.js';
import { globalDedup } from '../tools/patterns/helpers.js';
import { excludeTriplesSharingHsMainPoints } from '../tools/patterns/mutual-exclusion.js';
import { linearRegressionWithR2, near as nearFn, pct as pctFn } from '../tools/patterns/regression.js';
import { type Candle, detectSwingPoints, filterPeaks, filterValleys } from '../tools/patterns/swing.js';
import type { CandDebugEntry, DeduplicablePattern, DetectContext } from '../tools/patterns/types.js';

const ROOT = resolve(import.meta.dirname, '..');

// ── 記録フック付き `detect_hs.ts` の生成 ──

type NecklinePt = { x: number; y: number };

/** 記録 1 件（注入したフックが 1 候補につき 1 回積む）。 */
interface RawRec {
	type: 'head_and_shoulders' | 'inverse_head_and_shoulders';
	side: 'top' | 'bottom';
	path: 'strict' | 'relaxed';
	neckline: NecklinePt[];
	/** 構成点 5 点の添字（`[p0, p1, p2, p3, p4]`）。**構造の同一性キーに使う** */
	indices: number[];
	points: Array<{ role: 'p0' | 'p2' | 'p4'; idx: number; price: number }>;
}

/**
 * 複製に注入するヘルパ。
 *
 * `__record216` は候補を `globalThis.__rec216` へ流すだけ。`__gate216` は
 * **Phase 2 で入れるゲートと同じ判定**（`necklineAt(point.idx)` に対し top は上・bottom は下、
 * 等号は失格）を再現し、`true` なら hard reject。判定材料が無い点（非有限）は検査から除く。
 */
const RECORD_HELPER = `
type Rec216Pt = { idx: number; price: number };

function __record216(
	type: string,
	side: 'top' | 'bottom',
	path: 'strict' | 'relaxed',
	neckline: NecklinePt[],
	p0: Rec216Pt,
	p1: Rec216Pt,
	p2: Rec216Pt,
	p3: Rec216Pt,
	p4: Rec216Pt,
): void {
	const sink = (globalThis as unknown as { __rec216?: (r: unknown) => void }).__rec216;
	if (!sink) return;
	sink({
		type,
		side,
		path,
		neckline: neckline.map((q) => ({ x: q.x, y: q.y })),
		indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
		points: [
			{ role: 'p0', idx: p0.idx, price: p0.price },
			{ role: 'p2', idx: p2.idx, price: p2.price },
			{ role: 'p4', idx: p4.idx, price: p4.price },
		],
	});
}

function __gate216(side: 'top' | 'bottom', neckline: NecklinePt[], pts: Rec216Pt[]): boolean {
	for (const p of pts) {
		if (!Number.isFinite(p.price)) continue;
		const nl = necklineAt(neckline, p.idx);
		if (!Number.isFinite(nl)) continue;
		const deviation = side === 'top' ? nl - p.price : p.price - nl;
		if (deviation >= 0) return true;
	}
	return false;
}
`;

/** ヘルパを差し込むアンカー（`necklineAt` の定義の直後）。 */
const HELPER_ANCHOR = '\treturn a.y + ((b.y - a.y) * (clampedI - a.x)) / (b.x - a.x);\n}\n';

/** 完成済み 4 経路の注入点。`findHsBreakoutIdx` 呼び出し行を**インデントごと**一意に指す。 */
interface Site {
	label: string;
	type: 'head_and_shoulders' | 'inverse_head_and_shoulders';
	side: 'top' | 'bottom';
	path: 'strict' | 'relaxed';
	/** 置換対象（先頭の改行とインデントを含む。4 タブ = strict、3 タブ = relaxed） */
	anchor: string;
	/** 注入する行のインデント */
	indent: string;
}

const SITES: Site[] = [
	{
		label: 'strict 逆H&S',
		type: 'inverse_head_and_shoulders',
		side: 'bottom',
		path: 'strict',
		anchor: "\n\t\t\t\tconst breakoutIdx = findHsBreakoutIdx(candles, neckline, p4.idx, 'above');",
		indent: '\t\t\t\t',
	},
	{
		label: 'strict H&S',
		type: 'head_and_shoulders',
		side: 'top',
		path: 'strict',
		anchor: "\n\t\t\t\tconst breakoutIdx = findHsBreakoutIdx(candles, neckline, p4.idx, 'below');",
		indent: '\t\t\t\t',
	},
	{
		label: 'relaxed H&S',
		type: 'head_and_shoulders',
		side: 'top',
		path: 'relaxed',
		anchor: "\n\t\t\tconst breakoutIdx = findHsBreakoutIdx(candles, neckline, p4.idx, 'below');",
		indent: '\t\t\t',
	},
	{
		label: 'relaxed 逆H&S',
		type: 'inverse_head_and_shoulders',
		side: 'bottom',
		path: 'relaxed',
		anchor: "\n\t\t\tconst breakoutIdx = findHsBreakoutIdx(candles, neckline, p4.idx, 'above');",
		indent: '\t\t\t',
	},
];

type VariantName = 'record' | 'gated';

type Detector = (ctx: DetectContext) => { patterns: DeduplicablePattern[] };

const TMP_DIR = mkdtempSync(join(tmpdir(), 'hs-neckline-side-216-'));
const variantCache = new Map<VariantName, Promise<Detector>>();

/**
 * `detect_hs.ts` の複製を作って `detectHeadAndShoulders` を返す。
 *
 * 相対 import を絶対パスへ書き換えるので、複製をどこに置いても同じモジュール実体を見る。
 * 拡張子を `.mts` にしてあるのは、一時ディレクトリに package の `type` 宣言が無く
 * tsx が ESM だと判定できるようにするため（#211 の計測スクリプトと同じ）。
 */
function loadVariant(name: VariantName): Promise<Detector> {
	const cached = variantCache.get(name);
	if (cached) return cached;
	const loading = (async (): Promise<Detector> => {
		let src = readFileSync(join(ROOT, 'tools/patterns/detect_hs.ts'), 'utf8');
		src = src.replace(/from '\.\.\/\.\.\//g, `from '${ROOT}/`).replace(/from '\.\//g, `from '${ROOT}/tools/patterns/`);
		const anchorHits = src.split(HELPER_ANCHOR).length - 1;
		if (anchorHits !== 1) throw new Error(`necklineAt のアンカーが ${anchorHits} 箇所（期待 1）`);
		src = src.replace(HELPER_ANCHOR, HELPER_ANCHOR + RECORD_HELPER);
		for (const site of SITES) {
			const hits = src.split(site.anchor).length - 1;
			if (hits !== 1) throw new Error(`注入点「${site.label}」が ${hits} 箇所（期待 1）`);
			const rec = `\n${site.indent}__record216('${site.type}', '${site.side}', '${site.path}', neckline, p0, p1, p2, p3, p4);`;
			const gate =
				name === 'gated' ? `\n${site.indent}if (__gate216('${site.side}', neckline, [p0, p2, p4])) continue;` : '';
			src = src.split(site.anchor).join(rec + gate + site.anchor);
		}
		const file = join(TMP_DIR, `detect_hs_${name}.mts`);
		writeFileSync(file, src);
		const mod = (await import(pathToFileURL(file).href)) as { detectHeadAndShoulders: Detector };
		return mod.detectHeadAndShoulders;
	})();
	variantCache.set(name, loading);
	return loading;
}

/** 記録シンクを張って `fn` を走らせ、その間に積まれた記録を返す。 */
function withRecorder<T>(fn: () => T): { value: T; recs: RawRec[] } {
	const recs: RawRec[] = [];
	const g = globalThis as unknown as { __rec216?: (r: unknown) => void };
	g.__rec216 = (r) => recs.push(r as RawRec);
	try {
		return { value: fn(), recs };
	} finally {
		g.__rec216 = undefined;
	}
}

// ── コーパス（#211 / #227 / #228 と同じ組み方） ──

type Group = 'synthetic' | 'realA' | 'realB';

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

/** MCP の統合オプション 3 つの全組み合わせ（ケース数の単位を #205 / #206 / #211 と揃える）。 */
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
		const series: Series = { group: 'synthetic', name, candles: build() };
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

/**
 * `detect_patterns.ts` の縮小段を再現して `data.patterns` 相当を返す。
 *
 * 6 検出器を**同じ順序**で連結 → `globalDedup` → ライフサイクル絞り込み →
 * triple × H&S 型間排他（#218）。`requireCurrentInPattern` は既定 `false` なので現在性
 * フィルタは無条件で素通し、`rankPatterns` は並べ替えるだけなので件数に影響しない。
 */
function runPipeline(spec: CaseSpec, hsDetector: Detector): DeduplicablePattern[] {
	const ctx = buildCtx(spec);
	let patterns: DeduplicablePattern[] = [];
	patterns.push(...detectDoubles(ctx).patterns);
	patterns.push(...hsDetector(ctx).patterns);
	patterns.push(...detectTriangles(ctx).patterns);
	patterns.push(...detectWedges(ctx).patterns);
	patterns.push(...detectPennantsFlags(ctx).patterns);
	patterns.push(...detectTriples(ctx).patterns);
	patterns = globalDedup(patterns);
	patterns = patterns.filter((p) => {
		const isForming = p.status === 'forming' || p.status === 'near_completion';
		const isInvalid = p.status === 'invalid' || p.status === 'expired';
		const isCompleted = p.status === 'completed' || !p.status;
		return (
			(spec.opts.includeForming && isForming) ||
			(spec.opts.includeCompleted && isCompleted) ||
			(spec.opts.includeInvalid && isInvalid)
		);
	});
	return excludeTriplesSharingHsMainPoints(patterns).kept;
}

// ── 計測の行 ──

/** 主構成点 1 点ぶんの評価結果。 */
interface PointEval {
	role: 'p0' | 'p2' | 'p4';
	idx: number;
	price: number;
	/** `necklineAt(neckline, idx)`（#211 のクランプ後の値） */
	nl: number;
	/** `top: nl − price` / `bottom: price − nl`。**0 以上なら誤った側**（等号は失格） */
	deviation: number;
	/** 逸脱量 ÷ パターン高さ（`necklineProjectionHeight`）。高さが出せなければ `null` */
	deviationOverHeight: number | null;
}

/** 計測 1 行 = ゲートの位置に到達した候補 1 件（ケース × 経路 × 窓）。 */
interface Row {
	group: Group;
	series: string;
	tf: string;
	swingDepth: number | undefined;
	optsBits: number;
	type: 'head_and_shoulders' | 'inverse_head_and_shoulders';
	side: 'top' | 'bottom';
	path: 'strict' | 'relaxed';
	neckline: [NecklinePt, NecklinePt];
	/** ネックラインが水平か（relaxed は常に水平。strict は 2 谷が同値のときだけ） */
	horizontal: boolean;
	/** 構成点 5 点の添字（`[p0, p1, p2, p3, p4]`） */
	indices: number[];
	/** パターン高さ（`necklineProjectionHeight`。頭の真下で測る値） */
	height: number | undefined;
	points: PointEval[];
	/** 誤った側にある点（`deviation >= 0`） */
	offenders: PointEval[];
}

/**
 * 構造の同一性キー。オプション 8 通り（と同一ピボット列を生む `swingDepth`）の重複を畳む。
 *
 * **構成点 5 点すべて**を使う（#205 / #216 Phase 1 の `(系列, tf, type, 構成点の idx)` と同じ）。
 * 主構成点 `[p0, p2, p4]` だけだと、**同じ 3 点に別のネックライン定義点 `p1` / `p3` が付いた
 * 別窓が 1 つに畳まれる**——ネックラインが違えば判定も違うので、誤側の候補と正しい候補が
 * 同じキーに同居して構造単位の件数が合わなくなる。
 */
function structureKey(r: Row): string {
	return `${r.series}|${r.tf}|${r.type}|${r.path}|${r.indices.join('-')}`;
}

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

/** 記録 1 件を評価済みの行にする。 */
function evalRec(spec: CaseSpec, rec: RawRec): Row | null {
	const nl = rec.neckline;
	if (nl.length < 2) return null;
	const head = rec.points.find((p) => p.role === 'p2');
	if (!head) return null;
	const direction = rec.type === 'head_and_shoulders' ? 'down' : 'up';
	const height = necklineProjectionHeight({
		neckline: nl,
		headIdx: head.idx,
		headPrice: head.price,
		direction,
		fallbackNecklinePrice: nl[0].y,
	});
	const points: PointEval[] = rec.points.map((p) => {
		const level = necklineAt(nl, p.idx);
		const deviation = rec.side === 'top' ? level - p.price : p.price - level;
		return {
			role: p.role,
			idx: p.idx,
			price: p.price,
			nl: level,
			deviation,
			deviationOverHeight: height === undefined || !(height > 0) ? null : deviation / height,
		};
	});
	return {
		group: spec.series.group,
		series: spec.series.name,
		tf: spec.tf,
		swingDepth: spec.swingDepth,
		optsBits:
			(spec.opts.includeForming ? 1 : 0) | (spec.opts.includeCompleted ? 2 : 0) | (spec.opts.includeInvalid ? 4 : 0),
		type: rec.type,
		side: rec.side,
		path: rec.path,
		neckline: [nl[0], nl[1]],
		horizontal: nl[0].y === nl[1].y,
		indices: rec.indices,
		height,
		points,
		offenders: points.filter((p) => Number.isFinite(p.nl) && Number.isFinite(p.price) && p.deviation >= 0),
	};
}

/** ハーネスの検算カウンタ。 */
interface Audit {
	cases: number;
	recs: number;
	/** `record` 変異のパターン出力が本物の `detect_hs.ts` と JSON で食い違ったケース数（0 でなければ無効） */
	baselineMismatch: number;
	/** `data.patterns` 相当（`record` 変異）の延べ件数 */
	pipelineBase: number;
	/** 同（`gated` 変異） */
	pipelineGated: number;
}

/** `data.patterns` の差分 1 件。 */
interface PipelineDiff {
	series: string;
	tf: string;
	swingDepth: number | undefined;
	optsBits: number;
	type: string;
	pivotIdxs: string;
	status: string | undefined;
	confidence: number;
	direction: 'removed' | 'added';
}

/** パターンの同一性キー（`data.patterns` の差分を取るため）。 */
function patternKey(p: DeduplicablePattern): string {
	return `${p.type}|${(p.pivots ?? []).map((q) => q.idx).join('-')}|${p.status ?? ''}`;
}

async function runAll(
	cases: CaseSpec[],
	detectors: Record<VariantName, Detector>,
	audit: Audit,
	diffs: PipelineDiff[],
): Promise<Row[]> {
	const rows: Row[] = [];
	for (const spec of cases) {
		audit.cases++;
		// 母集団の記録は `record` 変異（ゲート無し）で取る。
		const { value: base, recs } = withRecorder(() => runPipeline(spec, detectors.record));
		audit.recs += recs.length;
		for (const rec of recs) {
			const row = evalRec(spec, rec);
			if (row) rows.push(row);
		}
		// `record` 変異の H&S 出力が本物と全キー一致することを毎ケース検算する。
		const realHs = detectHeadAndShoulders(buildCtx(spec)).patterns;
		const recHs = detectors.record(buildCtx(spec)).patterns;
		if (JSON.stringify(realHs) !== JSON.stringify(recHs)) audit.baselineMismatch++;

		const gated = runPipeline(spec, detectors.gated);
		audit.pipelineBase += base.length;
		audit.pipelineGated += gated.length;
		const baseKeys = new Map<string, DeduplicablePattern>();
		for (const p of base) baseKeys.set(patternKey(p), p);
		const gatedKeys = new Map<string, DeduplicablePattern>();
		for (const p of gated) gatedKeys.set(patternKey(p), p);
		const record = (p: DeduplicablePattern, direction: 'removed' | 'added') => {
			diffs.push({
				series: spec.series.name,
				tf: spec.tf,
				swingDepth: spec.swingDepth,
				optsBits:
					(spec.opts.includeForming ? 1 : 0) |
					(spec.opts.includeCompleted ? 2 : 0) |
					(spec.opts.includeInvalid ? 4 : 0),
				type: String(p.type),
				pivotIdxs: (p.pivots ?? []).map((q) => q.idx).join('-'),
				status: typeof p.status === 'string' ? p.status : undefined,
				confidence: Number(p.confidence),
				direction,
			});
		};
		for (const [k, p] of baseKeys) if (!gatedKeys.has(k)) record(p, 'removed');
		for (const [k, p] of gatedKeys) if (!baseKeys.has(k)) record(p, 'added');
	}
	return rows;
}

// ── 集計ユーティリティ ──

/** nearest-rank のパーセンタイル（#205 / #206 / #211 / #227 の表と同じ流儀）。 */
function percentile(sorted: number[], p: number): number | undefined {
	if (sorted.length === 0) return undefined;
	const rank = Math.max(1, Math.ceil(p * sorted.length));
	return sorted[rank - 1];
}

const DIST_HEADER = '| 対象 | n | min | p25 | p50 | p75 | p95 | max |\n|---|---:|---:|---:|---:|---:|---:|---:|';

function distRow(label: string, values: number[], digits = 3, asPct = false): string {
	const s = [...values].sort((a, b) => a - b);
	const f = (v: number | undefined) =>
		v === undefined ? '—' : asPct ? `${(v * 100).toFixed(digits)}%` : v.toFixed(digits);
	return `| ${label} | ${s.length} | ${f(s[0])} | ${f(percentile(s, 0.25))} | ${f(percentile(s, 0.5))} | ${f(percentile(s, 0.75))} | ${f(percentile(s, 0.95))} | ${f(s[s.length - 1])} |`;
}

const TYPES: Array<Row['type']> = ['head_and_shoulders', 'inverse_head_and_shoulders'];
const ROLES: Array<PointEval['role']> = ['p0', 'p2', 'p4'];
const ROLE_LABEL: Record<PointEval['role'], string> = { p0: '左肩 (p0)', p2: '頭 (p2)', p4: '右肩 (p4)' };
const TYPE_LABEL: Record<Row['type'], string> = {
	head_and_shoulders: 'H&S',
	inverse_head_and_shoulders: '逆H&S',
};

/** 母集団の内訳（type × 経路）。 */
function sectionPopulation(rows: Row[]): string {
	const out: string[] = ['| type / 経路 | 延べ行 | 構造 | 水平NL 行 | 傾きNL 行 |', '|---|---:|---:|---:|---:|'];
	for (const type of TYPES) {
		for (const path of ['strict', 'relaxed'] as const) {
			const sub = rows.filter((r) => r.type === type && r.path === path);
			if (sub.length === 0) continue;
			out.push(
				`| ${TYPE_LABEL[type]} / ${path} | ${sub.length} | ${uniqStructures(sub).length} | ${sub.filter((r) => r.horizontal).length} | ${sub.filter((r) => !r.horizontal).length} |`,
			);
		}
	}
	out.push(`| **合計** | **${rows.length}** | **${uniqStructures(rows).length}** | | |`);
	return out.join('\n');
}

/** 計測 1: 役割別の誤側件数。 */
function sectionRoleCounts(rows: Row[]): string {
	const structures = uniqStructures(rows);
	const out: string[] = ['| type・役割 | 誤側 行 / 全行 | 誤側 構造 / 全構造 |', '|---|---:|---:|'];
	for (const type of TYPES) {
		const sub = rows.filter((r) => r.type === type);
		const subS = structures.filter((r) => r.type === type);
		if (sub.length === 0) continue;
		for (const role of ROLES) {
			const bad = sub.filter((r) => r.offenders.some((o) => o.role === role)).length;
			const badS = subS.filter((r) => r.offenders.some((o) => o.role === role)).length;
			out.push(`| ${TYPE_LABEL[type]} ${ROLE_LABEL[role]} | ${bad} / ${sub.length} | ${badS} / ${subS.length} |`);
		}
	}
	return out.join('\n');
}

/** 計測 1b: ゲートで落ちる候補（頭原因 / 肩原因の内訳つき）。 */
function sectionRejectBreakdown(rows: Row[]): string {
	const structures = uniqStructures(rows);
	const out: string[] = [
		'| type / 経路 | 落ちる 行 | うち頭原因を含む | 肩のみ原因 | 落ちる 構造 | うち頭原因を含む | 肩のみ原因 |',
		'|---|---:|---:|---:|---:|---:|---:|',
	];
	const line = (label: string, all: Row[], allS: Row[]): void => {
		const bad = all.filter((r) => r.offenders.length > 0);
		const badS = allS.filter((r) => r.offenders.length > 0);
		const headOf = (rs: Row[]) => rs.filter((r) => r.offenders.some((o) => o.role === 'p2')).length;
		out.push(
			`| ${label} | ${bad.length} | ${headOf(bad)} | ${bad.length - headOf(bad)} | ${badS.length} | ${headOf(badS)} | ${badS.length - headOf(badS)} |`,
		);
	};
	for (const type of TYPES) {
		for (const path of ['strict', 'relaxed'] as const) {
			const sub = rows.filter((r) => r.type === type && r.path === path);
			if (sub.length === 0) continue;
			line(
				`${TYPE_LABEL[type]} / ${path}`,
				sub,
				structures.filter((r) => r.type === type && r.path === path),
			);
		}
	}
	line('**合計**', rows, structures);
	return out.join('\n');
}

/** 計測 2: 逸脱量の分布（絶対額 / パターン高さ相対）。**誤った側の点だけ**を対象にする。 */
function sectionDeviation(rows: Row[]): string {
	const structures = uniqStructures(rows);
	const out: string[] = ['**絶対額（円）。構造単位・誤った側の点のみ**', '', DIST_HEADER];
	for (const type of TYPES) {
		for (const role of ROLES) {
			const vals = structures
				.filter((r) => r.type === type)
				.flatMap((r) => r.offenders.filter((o) => o.role === role).map((o) => o.deviation));
			if (vals.length === 0) continue;
			out.push(distRow(`${TYPE_LABEL[type]} ${ROLE_LABEL[role]}`, vals, 1));
		}
	}
	out.push('', '**パターン高さ相対（`necklineProjectionHeight` 基準）。構造単位・誤った側の点のみ**', '', DIST_HEADER);
	for (const type of TYPES) {
		for (const role of ROLES) {
			const vals = structures
				.filter((r) => r.type === type)
				.flatMap((r) =>
					r.offenders
						.filter((o) => o.role === role && o.deviationOverHeight !== null)
						.map((o) => o.deviationOverHeight as number),
				);
			if (vals.length === 0) continue;
			out.push(distRow(`${TYPE_LABEL[type]} ${ROLE_LABEL[role]}`, vals, 3, true));
		}
	}
	return out.join('\n');
}

/**
 * 計測 3: ゼロ近傍の細密ヒストグラム（0.1% 刻み）。
 *
 * **本 issue の分岐点**——ゼロ張り付きの集団があるなら閾値なしの hard gate は
 * 「連続分布を任意の位置で切る」ことになる（#214 の非恣意性テストと同じ見方）。
 */
function sectionZeroCluster(rows: Row[]): string {
	const structures = uniqStructures(rows);
	const out: string[] = ['| type | 0〜2% の分布（0.1% 刻み） | 2% 以上 | 最小値 |', '|---|---|---:|---:|'];
	for (const type of TYPES) {
		const vals = structures
			.filter((r) => r.type === type)
			.flatMap((r) => r.offenders.filter((o) => o.deviationOverHeight !== null))
			.map((o) => o.deviationOverHeight as number)
			.sort((a, b) => a - b);
		if (vals.length === 0) {
			out.push(`| ${TYPE_LABEL[type]} | 該当 0 件 | 0 | — |`);
			continue;
		}
		const buckets = new Map<number, number>();
		let over = 0;
		for (const v of vals) {
			if (v >= 0.02) {
				over++;
				continue;
			}
			const b = Math.floor(v * 1000);
			buckets.set(b, (buckets.get(b) ?? 0) + 1);
		}
		const cells = [...buckets.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([b, n]) => `${(b / 10).toFixed(1)}-${((b + 1) / 10).toFixed(1)}%:${n}`);
		const min = vals[0];
		const minAbs = structures
			.filter((r) => r.type === type)
			.flatMap((r) => r.offenders.filter((o) => o.deviationOverHeight === min))
			.map((o) => o.deviation)[0];
		out.push(
			`| ${TYPE_LABEL[type]} | ${cells.length ? cells.join(' / ') : '**空**'} | ${over} | **${(min * 100).toFixed(3)}%**${minAbs === undefined ? '' : `（${Math.round(minAbs).toLocaleString('en-US')} 円）`} |`,
		);
	}
	return out.join('\n');
}

/** 誤った側の構造の明細（多い場合は先頭 30 件）。 */
function sectionOffenderList(rows: Row[]): string {
	const bad = uniqStructures(rows).filter((r) => r.offenders.length > 0);
	if (bad.length === 0) return '該当 0 件。';
	const out: string[] = [
		'| # | 系列 | tf | type | 経路 | 構成点 (p0..p4) | 高さ | 誤側の点 | `necklineAt` | 逸脱量 | 高さ比 |',
		'|---:|---|---|---|---|---|---:|---|---:|---:|---:|',
	];
	bad.slice(0, 30).forEach((r, i) => {
		for (const o of r.offenders) {
			out.push(
				`| ${i + 1} | ${r.series} | ${r.tf} | ${TYPE_LABEL[r.type]} | ${r.path} | ${r.indices.join('-')} | ${r.height === undefined ? '—' : Math.round(r.height).toLocaleString('en-US')} | ${ROLE_LABEL[o.role]} idx ${o.idx} / 終値 ${Math.round(o.price).toLocaleString('en-US')} | ${Math.round(o.nl).toLocaleString('en-US')} | ${Math.round(o.deviation).toLocaleString('en-US')} | ${o.deviationOverHeight === null ? '—' : `${(o.deviationOverHeight * 100).toFixed(3)}%`} |`,
			);
		}
	});
	if (bad.length > 30) out.push(`| … 他 ${bad.length - 30} 構造 | | | | | | | | | | |`);
	return out.join('\n');
}

/** 計測 4: `data.patterns` への影響。 */
function sectionPipeline(diffs: PipelineDiff[]): string {
	if (diffs.length === 0) return '`data.patterns` は 1 件も動かなかった（追加 0 / 削除 0）。';
	const out: string[] = ['| type | 削除 | 追加 |', '|---|---:|---:|'];
	const types = [...new Set(diffs.map((d) => d.type))].sort();
	for (const t of types) {
		out.push(
			`| \`${t}\` | ${diffs.filter((d) => d.type === t && d.direction === 'removed').length} | ${diffs.filter((d) => d.type === t && d.direction === 'added').length} |`,
		);
	}
	out.push(
		`| **合計** | **${diffs.filter((d) => d.direction === 'removed').length}** | **${diffs.filter((d) => d.direction === 'added').length}** |`,
	);
	out.push('');
	out.push('構造単位（系列・tf・type・構成点の組）で畳んだ明細:');
	out.push('');
	out.push('| 系列 | tf | type | 構成点 | status | conf | 増減 |');
	out.push('|---|---|---|---|---|---:|---|');
	const seen = new Set<string>();
	let shown = 0;
	for (const d of diffs) {
		const k = `${d.series}|${d.tf}|${d.type}|${d.pivotIdxs}|${d.direction}`;
		if (seen.has(k)) continue;
		seen.add(k);
		if (shown >= 30) continue;
		shown++;
		out.push(
			`| ${d.series} | ${d.tf} | \`${d.type}\` | ${d.pivotIdxs} | ${d.status ?? '—'} | ${d.confidence.toFixed(2)} | ${d.direction === 'removed' ? '**削除**' : '追加'} |`,
		);
	}
	if (seen.size > 30) out.push(`| … 他 ${seen.size - 30} 構造 | | | | | | |`);
	return out.join('\n');
}

/** 1 つの行集合について計測 1〜4 をまとめて出す。 */
function measurementBlock(label: string, rows: Row[], diffs: PipelineDiff[], level: string): string {
	const h = level;
	if (rows.length === 0) {
		return `${h} ${label}\n\n完成済み 4 経路のゲート位置に到達した候補が 1 件も無かった。`;
	}
	return [
		`${h} ${label}`,
		'',
		`ゲート位置に到達した候補 延べ ${rows.length} 行 / 構造 ${uniqStructures(rows).length} 件。`,
		'',
		`${h}# 母集団の内訳`,
		'',
		sectionPopulation(rows),
		'',
		`${h}# 計測 1: 役割別の誤側件数`,
		'',
		sectionRoleCounts(rows),
		'',
		`${h}# 計測 1b: ゲートで落ちる候補（頭原因 / 肩原因）`,
		'',
		sectionRejectBreakdown(rows),
		'',
		`${h}# 計測 2: 逸脱量の分布`,
		'',
		sectionDeviation(rows),
		'',
		`${h}# 計測 3: ゼロ近傍の細密ヒストグラム（高さ相対・0.1% 刻み）`,
		'',
		sectionZeroCluster(rows),
		'',
		`${h}# 計測 4: \`data.patterns\` への影響`,
		'',
		sectionPipeline(diffs),
		'',
		`${h}# 誤った側にある構造の明細`,
		'',
		sectionOffenderList(rows),
	].join('\n');
}

/**
 * `--json` の値を**計測を始める前に**取り出す（#211 の計測スクリプトと同じ理由）。
 *
 * @throws 値が無い、または次が別のフラグだった場合
 */
function flagValue(argv: string[], flag: string): string | undefined {
	const i = argv.indexOf(flag);
	if (i < 0) return undefined;
	const value = argv[i + 1];
	if (value === undefined || value.startsWith('--')) {
		throw new Error(`${flag} にはファイルパスが必要（受け取った値: ${value ?? 'なし'}）`);
	}
	return value;
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const jsonPath = flagValue(argv, '--json');

	const detectors: Record<VariantName, Detector> = {
		record: await loadVariant('record'),
		gated: await loadVariant('gated'),
	};

	const audit: Audit = { cases: 0, recs: 0, baselineMismatch: 0, pipelineBase: 0, pipelineGated: 0 };
	const { standard, realB } = buildCorpus();
	const standardDiffs: PipelineDiff[] = [];
	const realBDiffs: PipelineDiff[] = [];
	const standardRows = await runAll(standard, detectors, audit, standardDiffs);
	const realBRows = await runAll(realB, detectors, audit, realBDiffs);

	const md: string[] = [];
	md.push('# H&S の主構成点とネックラインの位置関係（issue #216 Phase 1・H&S 分の再計測）');
	md.push('');
	md.push(
		'基準は `necklineAt(neckline, point.idx)`（#211 で定義点 `[p1.idx, p3.idx]` にクランプ済み）。' +
			'`detect_hs.ts` は 1 行も変更していない——記録フックと試算用のゲートは実行時に生成した複製にだけ効く。',
	);
	md.push('');
	md.push('## 0. ハーネスと検算');
	md.push('');
	md.push('| 項目 | 値 |');
	md.push('|---|---:|');
	md.push(`| ケース数（標準 ${standard.length} + 実データ B ${realB.length}） | ${audit.cases} |`);
	md.push(`| ゲート位置に到達した候補（延べ） | ${audit.recs} |`);
	md.push(`| **記録フック版が本物の \`detect_hs.ts\` と食い違ったケース** | **${audit.baselineMismatch}** |`);
	md.push(`| \`data.patterns\` 相当 合計（ゲート無し） | ${audit.pipelineBase} |`);
	md.push(`| \`data.patterns\` 相当 合計（ゲート有り） | ${audit.pipelineGated} |`);
	md.push('');
	md.push(
		audit.baselineMismatch === 0
			? '記録フック版は全ケースで本物の `detect_hs.ts` と JSON 全キー一致した。以降の差分はすべて注入したゲートによるもの。'
			: '**記録フック版が本物と食い違っている。以降の数値は無効。**',
	);
	md.push('');
	md.push(measurementBlock('1. 標準コーパス 800（合成 704 + 実データ A 96）', standardRows, standardDiffs, '##'));
	md.push('');
	md.push(
		measurementBlock(
			'2. 実データ B 96（`btc_jpy_1hour_2026_08`。標準コーパスとプールしない）',
			realBRows,
			realBDiffs,
			'##',
		),
	);

	const text = md.join('\n');
	process.stdout.write(`${text}\n`);
	if (jsonPath !== undefined) {
		writeFileSync(jsonPath, JSON.stringify({ standardRows, realBRows, standardDiffs, realBDiffs, audit }, null, 2));
	}
}

await main();
