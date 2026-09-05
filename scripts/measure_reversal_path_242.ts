/**
 * issue #242 Phase 1: 反転パターンの「最終構成点 → ブレイク」経路を実測する。
 *
 * 測るのは 1 つだけ——**最終構成点（山2 / 山3 / 右肩）とネックライン突破バーの間
 * （両端を含まない）に、同種のピボット（top なら `kind='H'`、bottom なら `'L'`）があるか。**
 * 判定は `structural.ts` の `detectPivotBeforeBreakout` をそのまま呼ぶ（計測用の別実装を作らない）。
 * 併せて、既存の `detectTroughZoneReentry` を triple / H&S に横展開したときに落ちる件数も測る
 * （double には既に配線済みなので、横展開の対象は triple / H&S だけ）。
 *
 * ## 母集団: ゲートを置く位置に到達した候補（完成済み 12 経路）
 *
 * | 検出器 | 経路 | ゲートを置く位置 |
 * |---|---|---|
 * | `detect_doubles` | strict / relaxed × top / bottom | `rejectByNecklineSide` の直後 |
 * | `detect_triples` | strict / relaxed × top / bottom | `confidence_below_min` の直後（`isCompleted` のときだけ） |
 * | `detect_hs` | strict / relaxed × H&S / 逆H&S | `buildHsCompletionFields` の直後（ブレイク確定時だけ） |
 *
 * いずれも**既存の棄却検査をすべて通過した後**（`validatePatternSize` / `applyReversalGate` の
 * docstring の原則。固有の理由コードを持つ候補の `reason` を横取りしない）。**ここに到達した
 * 候補 = ゲートが見る集合**なので、記録位置と将来のゲート位置を一致させてある——これにより
 * 「棄却理由の帰属が変わる候補」は定義上 0 件になり、本スクリプトはそれを検算として出す。
 *
 * **形成中経路は対象外。** ブレイクが無いので「最終構成点 → ブレイクの経路」が定義できない。
 *
 * ## ハーネス（検出器のソースは 1 行も変更しない）
 *
 * `measure_hs_neckline_side_216.ts` と同じ流儀で、3 検出器の**ソースを読んで複製を作り**、
 * 上表の位置にフック（`__hook242`）を注入する。フックは 1 回の呼び出しで
 * 「記録」と「棄却するか否か」の両方を返し、**どのゲートを効かせるかは実行時の
 * `globalThis.__cfg242`** で切り替える（複製は 1 種類だけ作ればよい）。
 *
 * - `gate='off'`: 記録のみ。パターン出力は本物と全キー一致するはず（毎ケース検算する）。
 * - `gate='path'`: 記録 + 経路ゲートで hard reject。
 * - `gate='reentry'`: 記録 + `detectTroughZoneReentry` で hard reject（triple / H&S の横展開分）。
 * - `gate='both'`: 両方。
 *
 * **本実装は `status: 'invalid'` で出す（`re_entered_trough_zone` と同じ扱い）が、
 * 計測用の変異は `continue` で落とす。** 差分は `includeInvalid: true` のときに
 * `invalid` エントリが残るかどうかだけで、**accepted（`completed` / status 無し）の集合は
 * 両者で一致する**ため、本スクリプトの差分は accepted 集合に限定して取る。
 *
 * ## 使い方
 *
 * ```bash
 * npx tsx scripts/measure_reversal_path_242.ts
 * npx tsx scripts/measure_reversal_path_242.ts --json /tmp/242.json
 * ```
 *
 * コーパスは #211 / #216 / #227 と同じ組み方（標準コーパス 800 = 合成 704 + 実データ A 96）に、
 * 実データ B 96 / C 96 / D 96 を**別建て**で並べる。**プールしない**（#219）。
 * 実データ D（`btc_jpy_1hour_2026_09_05`）が未追加の環境では自動的に省略する。
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildBtcJpy2026Candles } from '../tests/fixtures/btc_jpy_1day_2026.js';
import { buildBtcJpy1hour202608Candles } from '../tests/fixtures/btc_jpy_1hour_2026_08.js';
import { buildBtcJpy1hour202609Candles } from '../tests/fixtures/btc_jpy_1hour_2026_09.js';
import * as synth from '../tests/fixtures/synthetic_pattern_candles.js';
import { getSizeThresholdsForTf, resolveParams } from '../tools/patterns/config.js';
import { detectPennantsFlags } from '../tools/patterns/detect_pennants.js';
import { detectTriangles } from '../tools/patterns/detect_triangles.js';
import { globalDedup } from '../tools/patterns/helpers.js';
import { excludeTriplesSharingHsMainPoints } from '../tools/patterns/mutual-exclusion.js';
import { linearRegressionWithR2, near as nearFn, pct as pctFn } from '../tools/patterns/regression.js';
import { type Candle, detectSwingPoints, filterPeaks, filterValleys } from '../tools/patterns/swing.js';
import type { CandDebugEntry, DeduplicablePattern, DetectContext } from '../tools/patterns/types.js';

const ROOT = resolve(import.meta.dirname, '..');

// ── 注入するフック ──

type DetectorKey = 'double' | 'triple' | 'hs';
type GateMode = 'off' | 'path' | 'reentry' | 'both';

/** 記録 1 件（フックが 1 候補につき 1 回積む）。 */
interface RawRec {
	detector: DetectorKey;
	type: string;
	side: 'top' | 'bottom';
	path: 'strict' | 'relaxed';
	/** 構成点の添字（double は 3 点、triple / H&S は 5 点）。**構造の同一性キーに使う** */
	indices: number[];
	lastPivotIdx: number;
	breakoutIdx: number;
	/** 区間 `(lastPivotIdx, breakoutIdx)` にある同種ピボット（全件） */
	between: Array<{ idx: number; price: number; extremePrice: number; isoTime?: string }>;
	/** `detectTroughZoneReentry` がゾーン再進入と判定したか */
	reentered: boolean;
	reentryIdx?: number;
	reentryLevel: number;
}

/**
 * 複製の先頭に差し込むヘルパ。
 *
 * 判定そのものは `structural.ts` の本物（`detectPivotBeforeBreakout` /
 * `detectTroughZoneReentry`）を呼ぶ。**計測用の再実装は作らない**——再実装すると
 * 「計測した判定」と「実装した判定」がずれても誰も気づかない。
 */
const HOOK_HELPER = `
import {
	detectPivotBeforeBreakout as __dpb242,
	detectTroughZoneReentry as __dtz242,
} from '${ROOT}/tools/patterns/structural.js';

function __hook242(r: {
	detector: 'double' | 'triple' | 'hs';
	type: string;
	side: 'top' | 'bottom';
	path: 'strict' | 'relaxed';
	indices: number[];
	lastPivotIdx: number;
	breakoutIdx: number;
	pivots: ReadonlyArray<Pivot>;
	candles: CandleData[];
	first: Pivot;
	mid: Pivot;
	second: Pivot;
}): boolean {
	const g = globalThis as unknown as {
		__rec242?: (rec: unknown) => void;
		__cfg242?: { gate: 'off' | 'path' | 'reentry' | 'both'; detectors: string[] };
	};
	const kind = r.side === 'top' ? 'H' : 'L';
	const between = r.pivots
		.filter((p) => p.kind === kind && p.idx > r.lastPivotIdx && p.idx < r.breakoutIdx)
		.map((p) => ({
			idx: p.idx,
			price: p.price,
			extremePrice: p.extremePrice,
			isoTime: r.candles[p.idx]?.isoTime,
		}));
	const pathRes = __dpb242({
		pivots: r.pivots,
		lastPivotIdx: r.lastPivotIdx,
		breakoutIdx: r.breakoutIdx,
		side: r.side,
	});
	const reentry = __dtz242({
		candles: r.candles,
		first: r.first,
		mid: r.mid,
		second: r.second,
		untilIdx: r.breakoutIdx - 1,
		side: r.side,
	});
	g.__rec242?.({
		detector: r.detector,
		type: r.type,
		side: r.side,
		path: r.path,
		indices: r.indices,
		lastPivotIdx: r.lastPivotIdx,
		breakoutIdx: r.breakoutIdx,
		between,
		reentered: reentry.reentered,
		reentryIdx: reentry.idx,
		reentryLevel: reentry.level,
	});
	const cfg = g.__cfg242;
	if (!cfg || !cfg.detectors.includes(r.detector)) return false;
	if ((cfg.gate === 'path' || cfg.gate === 'both') && pathRes.found) return true;
	if ((cfg.gate === 'reentry' || cfg.gate === 'both') && reentry.reentered) return true;
	return false;
}
`;

/** 注入点 1 つ。`fn` の本体内で `anchor` が**ちょうど 1 回**現れることを検算する。 */
interface Site {
	file: 'detect_doubles.ts' | 'detect_triples.ts' | 'detect_hs.ts';
	fn: string;
	label: string;
	/** 本体内で一意なアンカー（この直後に注入する） */
	anchor: string;
	indent: string;
	/** 注入する式（`__hook242({...})` の引数） */
	arg: string;
	/** ブレイク確定でないときは呼ばない条件（triple / H&S）。空なら無条件 */
	guard?: string;
	/** アンカーの**直前**に注入する（配列リテラルの途中に入れないため） */
	before?: boolean;
}

const DOUBLE_ARG = (type: string, side: 'top' | 'bottom', path: 'strict' | 'relaxed') =>
	`{ detector: 'double', type: '${type}', side: '${side}', path: '${path}', indices: [a.idx, b.idx, c.idx], lastPivotIdx: c.idx, breakoutIdx, pivots, candles, first: a, mid: b, second: c }`;

const TRIPLE_ARG = (type: string, side: 'top' | 'bottom', path: 'strict' | 'relaxed', mid: string, v2: string) =>
	`{ detector: 'triple', type: '${type}', side: '${side}', path: '${path}', indices: [a.idx, ${mid}.idx, b.idx, ${v2}.idx, c.idx], lastPivotIdx: c.idx, breakoutIdx, pivots, candles, first: a, mid: ${mid}, second: c }`;

const HS_ARG = (type: string, side: 'top' | 'bottom', path: 'strict' | 'relaxed') =>
	`{ detector: 'hs', type: '${type}', side: '${side}', path: '${path}', indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx], lastPivotIdx: p4.idx, breakoutIdx, pivots, candles, first: p0, mid: p1, second: p4 }`;

const SITES: Site[] = [
	// ── double: `rejectByNecklineSide` の直後（既存の棄却検査の最後） ──
	{
		file: 'detect_doubles.ts',
		fn: 'findRelaxedDoubleTop',
		label: 'double_top / relaxed',
		anchor: "if (rejectByNecklineSide('top', 'double_top', a, b, c, necklinePrice, pcand)) continue;",
		indent: '\t\t',
		arg: DOUBLE_ARG('double_top', 'top', 'relaxed'),
	},
	{
		file: 'detect_doubles.ts',
		fn: 'findRelaxedDoubleBottom',
		label: 'double_bottom / relaxed',
		anchor: "if (rejectByNecklineSide('bottom', 'double_bottom', a, b, c, necklinePrice, pcand)) continue;",
		indent: '\t\t',
		arg: DOUBLE_ARG('double_bottom', 'bottom', 'relaxed'),
	},
	{
		file: 'detect_doubles.ts',
		fn: 'detectDoubles',
		label: 'double_top / strict',
		anchor: "if (rejectByNecklineSide('top', 'double_top', a, b, c, necklinePrice, pcand)) continue;",
		indent: '\t\t\t\t',
		arg: DOUBLE_ARG('double_top', 'top', 'strict'),
	},
	{
		file: 'detect_doubles.ts',
		fn: 'detectDoubles',
		label: 'double_bottom / strict',
		anchor: "if (rejectByNecklineSide('bottom', 'double_bottom', a, b, c, necklinePrice, pcand)) continue;",
		indent: '\t\t\t\t',
		arg: DOUBLE_ARG('double_bottom', 'bottom', 'strict'),
	},
	// ── triple: `confidence_below_min` の直後（`const neckline = [` の直前） ──
	{
		file: 'detect_triples.ts',
		fn: 'findStrictTripleTop',
		label: 'triple_top / strict',
		anchor: 'const neckline = [',
		indent: '\t\t',
		before: true,
		arg: TRIPLE_ARG('triple_top', 'top', 'strict', 'v1', 'v2'),
		guard: 'isCompleted',
	},
	{
		file: 'detect_triples.ts',
		fn: 'findStrictTripleBottom',
		label: 'triple_bottom / strict',
		anchor: 'const neckline = [',
		indent: '\t\t',
		before: true,
		arg: TRIPLE_ARG('triple_bottom', 'bottom', 'strict', 'p1', 'p2'),
		guard: 'isCompleted',
	},
	{
		file: 'detect_triples.ts',
		fn: 'findRelaxedTripleTop',
		label: 'triple_top / relaxed',
		anchor: 'const neckline = [',
		indent: '\t\t',
		before: true,
		arg: TRIPLE_ARG('triple_top', 'top', 'relaxed', 'v1', 'v2'),
		guard: 'isCompleted',
	},
	{
		file: 'detect_triples.ts',
		fn: 'findRelaxedTripleBottom',
		label: 'triple_bottom / relaxed',
		anchor: 'const neckline = [',
		indent: '\t\t',
		before: true,
		arg: TRIPLE_ARG('triple_bottom', 'bottom', 'relaxed', 'p1', 'p2'),
		guard: 'isCompleted',
	},
	// ── H&S: `buildHsCompletionFields` の直後（ブレイク確定時だけ） ──
	{
		file: 'detect_hs.ts',
		fn: 'findStrictInverseHS',
		label: '逆H&S / strict',
		anchor: 'const rangeEnd = completion.rangeEnd;',
		indent: '\t\t\t\t',
		arg: HS_ARG('inverse_head_and_shoulders', 'bottom', 'strict'),
		guard: 'breakoutIdx >= 0',
	},
	{
		file: 'detect_hs.ts',
		fn: 'findStrictHS',
		label: 'H&S / strict',
		anchor: 'const rangeEnd = completion.rangeEnd;',
		indent: '\t\t\t\t',
		arg: HS_ARG('head_and_shoulders', 'top', 'strict'),
		guard: 'breakoutIdx >= 0',
	},
	{
		file: 'detect_hs.ts',
		fn: 'findRelaxedHS',
		label: 'H&S / relaxed',
		anchor: 'const rangeEnd = completion.rangeEnd;',
		indent: '\t\t\t',
		arg: HS_ARG('head_and_shoulders', 'top', 'relaxed'),
		guard: 'breakoutIdx >= 0',
	},
	{
		file: 'detect_hs.ts',
		fn: 'findRelaxedInverseHS',
		label: '逆H&S / relaxed',
		anchor: 'const rangeEnd = completion.rangeEnd;',
		indent: '\t\t\t',
		arg: HS_ARG('inverse_head_and_shoulders', 'bottom', 'relaxed'),
		guard: 'breakoutIdx >= 0',
	},
];

/** 関数本体の範囲（`function <name>(` から次のトップレベル `function` まで）。 */
function fnBodyRange(src: string, fn: string): [number, number] {
	const startPatterns = [`\nfunction ${fn}(`, `\nexport function ${fn}(`];
	let start = -1;
	for (const p of startPatterns) {
		const i = src.indexOf(p);
		if (i >= 0) {
			if (start >= 0) throw new Error(`関数 ${fn} の定義が複数ある`);
			start = i;
		}
	}
	if (start < 0) throw new Error(`関数 ${fn} が見つからない`);
	let end = src.length;
	for (const p of ['\nfunction ', '\nexport function ']) {
		const i = src.indexOf(p, start + 1);
		if (i >= 0 && i < end) end = i;
	}
	return [start, end];
}

/** `fn` の本体内で一意なアンカーの直前 / 直後に `insertion` を差し込む。 */
function inject(src: string, fn: string, anchor: string, insertion: string, before: boolean): string {
	const [start, end] = fnBodyRange(src, fn);
	const body = src.slice(start, end);
	const hits = body.split(anchor).length - 1;
	if (hits !== 1) throw new Error(`${fn} 内のアンカー「${anchor}」が ${hits} 箇所（期待 1）`);
	const replaced = before ? `${insertion}${anchor}` : `${anchor}${insertion}`;
	return src.slice(0, start) + body.replace(anchor, replaced) + src.slice(end);
}

type Detector = (ctx: DetectContext) => { patterns: DeduplicablePattern[] };

const TMP_DIR = mkdtempSync(join(tmpdir(), 'reversal-path-242-'));

/**
 * 検出器のソースを読む既定のリビジョン。**#242 の実装が入る前の `main`**（PR #241 のマージ）。
 *
 * ## 作業ツリーから読んではいけない理由
 *
 * `gate='off'` が無効化するのは**注入したフックだけ**で、複製元のソースが本番のゲート
 * （`checkBreakoutPath` / `applyPostBreakoutGates`）を持っていればベースライン自体が
 * 既にゲート済みになる。その状態で走らせると差分は常に 0 になり、**「ゲートを入れると
 * 何が消えるか」を測ったことにならないのに数字だけは出てしまう**——最も危険な壊れ方。
 *
 * そこで既定では `git show <rev>:<path>` でこのリビジョンのソースを読む。
 * `--baseline-rev <rev>` で明示指定でき、`--baseline-rev worktree` を渡したときだけ
 * 作業ツリーを読む（実装後の冪等性の検算用。**その場合は差分が 0 になるのが正しい**）。
 */
const DEFAULT_BASELINE_REV = 'b49a08e';

/** 本番のゲートが入っているソースを検出するための印。 */
const PRODUCTION_GATE_MARKERS = ['checkBreakoutPath', 'applyPostBreakoutGates'];

/**
 * 検出器のソースを取り出す。`rev === 'worktree'` 以外は `git show` で当該リビジョンから読む。
 *
 * @throws リビジョンが解決できない場合（メッセージに理由と対処を書く）
 */
function readDetectorSource(rev: string, file: string): string {
	if (rev === 'worktree') return readFileSync(join(ROOT, 'tools/patterns', file), 'utf8');
	try {
		return execFileSync('git', ['show', `${rev}:tools/patterns/${file}`], {
			cwd: ROOT,
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
		});
	} catch (e) {
		const detail = e instanceof Error ? e.message.split('\n')[0] : String(e);
		throw new Error(
			`ベースラインのリビジョン '${rev}' から tools/patterns/${file} を読めない（${detail}）。` +
				'--baseline-rev で #242 実装前のリビジョンを指定するか、' +
				'冪等性の検算をしたい場合だけ --baseline-rev worktree を渡すこと。',
		);
	}
}

/** 同じベースラインから作る 2 組の検出器。 */
interface Variants {
	/** 記録フック + 試算用ゲートを注入した版（計測に使う） */
	hooked: Record<DetectorKey, Detector>;
	/**
	 * **注入していない**同一ソースの版（検算に使う）。
	 *
	 * ハーネスの前提は「`gate='off'` の注入版は素のソースと同じ結果を返す」。比較相手を
	 * **作業ツリーから import した本物**にすると、ベースラインを過去のリビジョンに固定した
	 * 時点で**必ず食い違う**（実装が入っているのだから当然）ので検算にならない。
	 * **同じリビジョンの素の複製**と突き合わせる。
	 */
	pristine: Record<DetectorKey, Detector>;
}

/** 3 検出器の複製を作って読み込む。相対 import は絶対パスへ書き換える。 */
async function loadVariants(baselineRev: string): Promise<Variants> {
	const files: Record<DetectorKey, { file: Site['file']; exportName: string }> = {
		double: { file: 'detect_doubles.ts', exportName: 'detectDoubles' },
		triple: { file: 'detect_triples.ts', exportName: 'detectTriples' },
		hs: { file: 'detect_hs.ts', exportName: 'detectHeadAndShoulders' },
	};
	const hooked = {} as Record<DetectorKey, Detector>;
	const pristine = {} as Record<DetectorKey, Detector>;
	for (const [key, { file, exportName }] of Object.entries(files) as Array<
		[DetectorKey, { file: Site['file']; exportName: string }]
	>) {
		let src = readDetectorSource(baselineRev, file);
		// ベースラインが既にゲート済みなら**黙って 0 件を返さず落とす**（上の docstring）。
		const marker = PRODUCTION_GATE_MARKERS.find((m) => src.includes(m));
		if (marker !== undefined && baselineRev !== 'worktree') {
			throw new Error(
				`ベースライン '${baselineRev}' の ${file} に本番のゲート（${marker}）が入っている。` +
					'この状態の差分は「ゲートを入れると何が消えるか」を表さない。' +
					'--baseline-rev に #242 実装前のリビジョンを指定すること。',
			);
		}
		src = src
			.replace(/from '\.\.\/\.\.\//g, `from '${ROOT}/`)
			.replace(/from '\.\.\//g, `from '${ROOT}/tools/`)
			.replace(/from '\.\//g, `from '${ROOT}/tools/patterns/`);
		const stem = file.replace('.ts', '');
		const pristinePath = join(TMP_DIR, `${stem}_242_pristine.mts`);
		writeFileSync(pristinePath, src);
		pristine[key] = ((await import(pathToFileURL(pristinePath).href)) as Record<string, Detector>)[exportName];

		src = HOOK_HELPER + src;
		for (const site of SITES.filter((s) => s.file === file)) {
			const call = `__hook242(${site.arg})`;
			const expr = site.guard ? `if ((${site.guard}) && ${call}) continue;` : `if (${call}) continue;`;
			const insertion = site.before ? `${expr}\n${site.indent}` : `\n${site.indent}${expr}`;
			src = inject(src, site.fn, site.anchor, insertion, site.before === true);
		}
		const hookedPath = join(TMP_DIR, `${stem}_242.mts`);
		writeFileSync(hookedPath, src);
		hooked[key] = ((await import(pathToFileURL(hookedPath).href)) as Record<string, Detector>)[exportName];
	}
	return { hooked, pristine };
}

/** 記録シンクと設定を張って `fn` を走らせる。 */
function withHook<T>(cfg: { gate: GateMode; detectors: DetectorKey[] }, fn: () => T): { value: T; recs: RawRec[] } {
	const recs: RawRec[] = [];
	const g = globalThis as unknown as {
		__rec242?: (r: unknown) => void;
		__cfg242?: { gate: GateMode; detectors: string[] };
	};
	g.__rec242 = (r) => recs.push(r as RawRec);
	g.__cfg242 = cfg;
	try {
		return { value: fn(), recs };
	} finally {
		g.__rec242 = undefined;
		g.__cfg242 = undefined;
	}
}

// ── コーパス（#211 / #216 / #227 と同じ組み方） ──

type Group = 'synthetic' | 'realA' | 'realB' | 'realC' | 'realD';

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

/** MCP の統合オプション 3 つの全組み合わせ（ケース数の単位を #205 / #211 / #216 と揃える）。 */
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

/** 実データ D は別ファイル（未追加の環境がある）。動的 import で存在チェックする。 */
async function loadRealD(): Promise<Series | null> {
	try {
		const mod = (await import('../tests/fixtures/btc_jpy_1hour_2026_09_05.js')) as {
			buildBtcJpy1hour20260905Candles: () => Candle[];
		};
		return { group: 'realD', name: 'btc_jpy_1hour_2026_09_05', candles: mod.buildBtcJpy1hour20260905Candles() };
	} catch {
		return null;
	}
}

/** 標準コーパス 800（合成 704 + 実データ A 96）と実データ B / C / D。**プールしない**（#219）。 */
async function buildCorpus(): Promise<Array<{ label: string; cases: CaseSpec[] }>> {
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
	const out = [
		{ label: `標準コーパス ${standard.length}（合成 704 + 実データ A 96）`, cases: standard },
		{
			label: '実データ B 96（`btc_jpy_1hour_2026_08`）',
			cases: realCases({
				group: 'realB',
				name: 'btc_jpy_1hour_2026_08',
				candles: buildBtcJpy1hour202608Candles() as Candle[],
			}),
		},
		{
			label: '実データ C 96（`btc_jpy_1hour_2026_09`）',
			cases: realCases({
				group: 'realC',
				name: 'btc_jpy_1hour_2026_09',
				candles: buildBtcJpy1hour202609Candles() as Candle[],
			}),
		},
	];
	const realD = await loadRealD();
	if (realD) out.push({ label: '実データ D 96（`btc_jpy_1hour_2026_09_05`）', cases: realCases(realD) });
	return out;
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

/** `detect_patterns.ts` の縮小段を再現して `data.patterns` 相当を返す。 */
function runPipeline(spec: CaseSpec, d: Record<DetectorKey, Detector>): DeduplicablePattern[] {
	const ctx = buildCtx(spec);
	let patterns: DeduplicablePattern[] = [];
	patterns.push(...d.double(ctx).patterns);
	patterns.push(...d.hs(ctx).patterns);
	patterns.push(...detectTriangles(ctx).patterns);
	patterns.push(...detectWedgesRef(ctx).patterns);
	patterns.push(...detectPennantsFlags(ctx).patterns);
	patterns.push(...d.triple(ctx).patterns);
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

// ── 計測 ──

/** accepted（`completed` / status 無し）だけを見る。計測用の変異が `continue` で落とすため。 */
function isAccepted(p: DeduplicablePattern): boolean {
	return p.status === 'completed' || !p.status;
}

function patternKey(p: DeduplicablePattern): string {
	return `${p.type}|${(p.pivots ?? []).map((q) => q.idx).join('-')}`;
}

interface Row extends RawRec {
	group: Group;
	series: string;
	tf: string;
	swingDepth: number | undefined;
	optsBits: number;
}

/** 構造の同一性キー。オプション 8 通り（と同一ピボット列を生む `swingDepth`）の重複を畳む。 */
function structureKey(r: Row): string {
	return `${r.series}|${r.tf}|${r.type}|${r.path}|${r.indices.join('-')}|${r.breakoutIdx}`;
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

interface Diff {
	series: string;
	tf: string;
	swingDepth: number | undefined;
	optsBits: number;
	type: string;
	pivotIdxs: string;
	confidence: number;
	direction: 'removed' | 'added';
}

interface Audit {
	cases: number;
	recs: number;
	/**
	 * 記録フック版（gate=off）のパターン出力が、**同じリビジョンの素の複製**と JSON で
	 * 食い違ったケース数（0 でなければ以降の数値は無効）。
	 */
	baselineMismatch: number;
	acceptedBase: number;
}

interface GateRun {
	label: string;
	gate: GateMode;
	detectors: DetectorKey[];
	accepted: number;
	diffs: Diff[];
	/** type 別の accepted 件数（before / after） */
	byType: Map<string, { before: number; after: number }>;
}

const GATE_RUNS: ReadonlyArray<{ label: string; gate: GateMode; detectors: DetectorKey[] }> = [
	{ label: '経路ゲート / double のみ（PR 1）', gate: 'path', detectors: ['double'] },
	{ label: '経路ゲート / triple + H&S（PR 2）', gate: 'path', detectors: ['triple', 'hs'] },
	{ label: '再進入チェック横展開 / triple + H&S（PR 2）', gate: 'reentry', detectors: ['triple', 'hs'] },
	{ label: '全部（経路 + 再進入横展開）', gate: 'both', detectors: ['double', 'triple', 'hs'] },
];

function runCorpus(
	cases: CaseSpec[],
	d: Record<DetectorKey, Detector>,
	pristine: Record<DetectorKey, Detector>,
	audit: Audit,
): { rows: Row[]; runs: GateRun[] } {
	const rows: Row[] = [];
	const runs: GateRun[] = GATE_RUNS.map((g) => ({ ...g, accepted: 0, diffs: [], byType: new Map() }));
	for (const spec of cases) {
		audit.cases++;
		const optsBits =
			(spec.opts.includeForming ? 1 : 0) | (spec.opts.includeCompleted ? 2 : 0) | (spec.opts.includeInvalid ? 4 : 0);
		const { value: base, recs } = withHook({ gate: 'off', detectors: [] }, () => runPipeline(spec, d));
		audit.recs += recs.length;
		for (const rec of recs) {
			rows.push({
				...rec,
				group: spec.series.group,
				series: spec.series.name,
				tf: spec.tf,
				swingDepth: spec.swingDepth,
				optsBits,
			});
		}
		// 記録フック版（gate=off）が**同じリビジョンの素の複製**と全キー一致することを毎ケース検算する。
		const pristineOut = JSON.stringify([
			pristine.double(buildCtx(spec)).patterns,
			pristine.triple(buildCtx(spec)).patterns,
			pristine.hs(buildCtx(spec)).patterns,
		]);
		const hookOut = JSON.stringify([
			d.double(buildCtx(spec)).patterns,
			d.triple(buildCtx(spec)).patterns,
			d.hs(buildCtx(spec)).patterns,
		]);
		if (pristineOut !== hookOut) audit.baselineMismatch++;

		const baseAccepted = base.filter(isAccepted);
		audit.acceptedBase += baseAccepted.length;
		const baseKeys = new Map<string, DeduplicablePattern>();
		for (const p of baseAccepted) baseKeys.set(patternKey(p), p);

		for (const run of runs) {
			const gated = withHook({ gate: run.gate, detectors: run.detectors }, () => runPipeline(spec, d)).value.filter(
				isAccepted,
			);
			run.accepted += gated.length;
			const gatedKeys = new Map<string, DeduplicablePattern>();
			for (const p of gated) gatedKeys.set(patternKey(p), p);
			for (const p of baseAccepted) {
				const e = run.byType.get(String(p.type)) ?? { before: 0, after: 0 };
				e.before++;
				run.byType.set(String(p.type), e);
			}
			for (const p of gated) {
				const e = run.byType.get(String(p.type)) ?? { before: 0, after: 0 };
				e.after++;
				run.byType.set(String(p.type), e);
			}
			const record = (p: DeduplicablePattern, direction: 'removed' | 'added') =>
				run.diffs.push({
					series: spec.series.name,
					tf: spec.tf,
					swingDepth: spec.swingDepth,
					optsBits,
					type: String(p.type),
					pivotIdxs: (p.pivots ?? []).map((q) => q.idx).join('-'),
					confidence: Number(p.confidence),
					direction,
				});
			for (const [k, p] of baseKeys) if (!gatedKeys.has(k)) record(p, 'removed');
			for (const [k, p] of gatedKeys) if (!baseKeys.has(k)) record(p, 'added');
		}
	}
	return { rows, runs };
}

// ── Markdown 出力 ──

function sectionPopulation(rows: Row[]): string {
	const structures = uniqStructures(rows);
	const out: string[] = [
		'| type / 経路 | 延べ行 | 構造 | 間に同種ピボット有り（構造） | ゾーン再進入（構造） |',
		'|---|---:|---:|---:|---:|',
	];
	const types = [...new Set(rows.map((r) => r.type))].sort();
	for (const type of types) {
		for (const path of ['strict', 'relaxed'] as const) {
			const sub = rows.filter((r) => r.type === type && r.path === path);
			if (sub.length === 0) continue;
			const subS = structures.filter((r) => r.type === type && r.path === path);
			out.push(
				`| ${type} / ${path} | ${sub.length} | ${subS.length} | ${subS.filter((r) => r.between.length > 0).length} | ${subS.filter((r) => r.reentered).length} |`,
			);
		}
	}
	out.push(
		`| **合計** | **${rows.length}** | **${structures.length}** | **${structures.filter((r) => r.between.length > 0).length}** | **${structures.filter((r) => r.reentered).length}** |`,
	);
	return out.join('\n');
}

function sectionByTf(rows: Row[]): string {
	const structures = uniqStructures(rows);
	const tfs = [...new Set(rows.map((r) => r.tf))];
	const out: string[] = ['| 時間足 | 構造 | 間に同種ピボット有り | ゾーン再進入 |', '|---|---:|---:|---:|'];
	for (const tf of tfs) {
		const sub = structures.filter((r) => r.tf === tf);
		out.push(
			`| ${tf} | ${sub.length} | ${sub.filter((r) => r.between.length > 0).length} | ${sub.filter((r) => r.reentered).length} |`,
		);
	}
	return out.join('\n');
}

/** 落ちる候補の 1 件ずつの明細（構造単位）。 */
function sectionDetail(rows: Row[], pick: (r: Row) => boolean): string {
	const hits = uniqStructures(rows).filter(pick);
	if (hits.length === 0) return '該当 0 件。';
	const out: string[] = [];
	for (const r of hits) {
		out.push(
			`- **${r.type} / ${r.path}** — \`${r.series}\` / ${r.tf} / swingDepth=${r.swingDepth ?? 'auto'}`,
			`  - 構成点 idx: \`[${r.indices.join(', ')}]\` / 最終構成点 ${r.lastPivotIdx} → ブレイク ${r.breakoutIdx}`,
			`  - 間の同種ピボット: ${
				r.between.length === 0
					? 'なし'
					: r.between
							.map(
								(p) =>
									`idx ${p.idx}（${p.isoTime ?? '—'} / 終値 ${p.price.toLocaleString('en-US')} / 高安 ${p.extremePrice.toLocaleString('en-US')}）`,
							)
							.join(' , ')
			}`,
			`  - ゾーン再進入: ${r.reentered ? `あり（idx ${r.reentryIdx}, level ${Math.round(r.reentryLevel).toLocaleString('en-US')}）` : 'なし'}`,
		);
	}
	return out.join('\n');
}

function sectionRun(run: GateRun): string {
	const removed = run.diffs.filter((d) => d.direction === 'removed');
	const added = run.diffs.filter((d) => d.direction === 'added');
	const types = [...run.byType.keys()].sort();
	const out: string[] = [
		`**${run.label}** — accepted 延べ ${run.accepted}（差分 removed ${removed.length} / added ${added.length}）`,
		'',
		'| type | before | after | 増減 |',
		'|---|---:|---:|---:|',
	];
	for (const t of types) {
		const e = run.byType.get(t) as { before: number; after: number };
		if (e.before === e.after) continue;
		out.push(`| ${t} | ${e.before} | ${e.after} | ${e.after - e.before >= 0 ? '+' : ''}${e.after - e.before} |`);
	}
	if (
		types.every(
			(t) =>
				(run.byType.get(t) as { before: number; after: number }).before ===
				(run.byType.get(t) as { before: number; after: number }).after,
		)
	) {
		out.push('| （type 別の増減なし） | | | 0 |');
	}
	// **type 別の増減が 0 でも中身が入れ替わっていることがある**（H&S の strict は窓を総当たりする
	// ので、1 つ落ちると隣の窓が dedup を勝ち抜いて出てくる）。入れ替えを黙って「差分なし」と
	// 書かないため、構造キーの removed / added を必ず並べる。
	const uniq = (ds: Diff[]) => [...new Set(ds.map((x) => `${x.series}/${x.tf} ${x.type} ${x.pivotIdxs}`))].sort();
	if (removed.length > 0 || added.length > 0) {
		out.push(
			'',
			`- removed（構造）: ${
				uniq(removed).length === 0
					? 'なし'
					: uniq(removed)
							.map((x) => `\`${x}\``)
							.join(' , ')
			}`,
		);
		out.push(
			`- added（構造）: ${
				uniq(added).length === 0
					? 'なし'
					: uniq(added)
							.map((x) => `\`${x}\``)
							.join(' , ')
			}`,
		);
	}
	return out.join('\n');
}

function measurementBlock(label: string, rows: Row[], runs: GateRun[], h: string): string {
	return [
		`${h} ${label}`,
		'',
		`${h}# 母集団（ゲート位置に到達した候補）`,
		'',
		sectionPopulation(rows),
		'',
		sectionByTf(rows),
		'',
		`${h}# 計測 2: 経路ゲートで落ちる候補（間に同種ピボットがある構造）`,
		'',
		sectionDetail(rows, (r) => r.between.length > 0),
		'',
		`${h}# 計測 3: 再進入チェックの横展開で落ちる候補（triple / H&S。ゾーン再進入がある構造）`,
		'',
		sectionDetail(rows, (r) => r.reentered && r.detector !== 'double'),
		'',
		`${h}# 計測 4: ゲート別の accepted 増減`,
		'',
		runs.map(sectionRun).join('\n\n'),
	].join('\n');
}

/**
 * フラグの値を**計測を始める前に**取り出す（#211 / #216 の計測スクリプトと同じ理由）。
 *
 * @throws 値が無い、または次が別のフラグだった場合
 */
function flagValue(argv: string[], flag: string): string | undefined {
	const i = argv.indexOf(flag);
	if (i < 0) return undefined;
	const value = argv[i + 1];
	if (value === undefined || value.startsWith('--')) {
		throw new Error(`${flag} には値が必要（受け取った値: ${value ?? 'なし'}）`);
	}
	return value;
}

// `detect_wedges` は複製を作らない（本 issue の対象外）。import 順を lint に合わせるためのラッパ。
const { detectWedges: detectWedgesRef } = await import('../tools/patterns/detect_wedges.js');

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const jsonPath = flagValue(argv, '--json');
	const baselineRev = flagValue(argv, '--baseline-rev') ?? DEFAULT_BASELINE_REV;
	const detectors = await loadVariants(baselineRev);
	const corpora = await buildCorpus();

	const audit: Audit = { cases: 0, recs: 0, baselineMismatch: 0, acceptedBase: 0 };
	const results = corpora.map((c) => ({
		label: c.label,
		n: c.cases.length,
		...runCorpus(c.cases, detectors.hooked, detectors.pristine, audit),
	}));

	const md: string[] = [];
	md.push('# 反転パターンの「最終構成点 → ブレイク」経路（issue #242 Phase 1）');
	md.push('');
	md.push(
		'判定は `structural.ts` の `detectPivotBeforeBreakout` / `detectTroughZoneReentry` をそのまま呼ぶ。' +
			'3 検出器のソースは 1 行も変更していない——記録フックと試算用のゲートは実行時に生成した複製にだけ効く。',
	);
	md.push('');
	md.push('## 0. ハーネスと検算');
	md.push('');
	md.push('| 項目 | 値 |');
	md.push('|---|---:|');
	md.push(`| ベースラインのリビジョン | \`${baselineRev}\` |`);
	md.push(`| ケース数 | ${audit.cases} |`);
	md.push(`| ゲート位置に到達した候補（延べ） | ${audit.recs} |`);
	md.push(`| **記録フック版が素の複製と食い違ったケース** | **${audit.baselineMismatch}** |`);
	md.push(`| accepted 合計（ゲート無し） | ${audit.acceptedBase} |`);
	md.push('');
	md.push(
		audit.baselineMismatch === 0
			? '記録フック版は全ケースで**同じリビジョンの素の 3 検出器**と JSON 全キー一致した。以降の差分はすべて注入したゲートによるもの。'
			: '**記録フック版が素の複製と食い違っている。以降の数値は無効。**',
	);
	md.push('');
	md.push(
		'**棄却理由の帰属**: 記録位置＝ゲートを置く位置＝既存の棄却検査をすべて通過した後なので、' +
			'ここに記録された候補は現状すべて出力まで到達している。したがって既存の理由コードを' +
			'横取りする候補は **0 件**（下の「計測 2 の構造数」と「removed の件数」が一致することが検算）。',
	);
	for (const r of results) {
		md.push('');
		md.push(measurementBlock(`${r.label}（${r.n} ケース）`, r.rows, r.runs, '##'));
	}

	const text = md.join('\n');
	process.stdout.write(`${text}\n`);
	if (jsonPath !== undefined) {
		writeFileSync(jsonPath, JSON.stringify({ audit, results }, null, 2));
	}
}

await main();
