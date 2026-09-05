/**
 * issue #243 Phase 1: `double_*`（反転）と `triangle_*` / `wedge_*`（継続）の共存を実測する。
 *
 * 測るのは**出力集合**だけ——`detect_patterns` が返す `data.patterns` の中に、accepted な
 * `double_*` と期間が 70% 以上重なる `triangle_*` / `wedge_*` が同居しているか。
 * 検出器の内部は一切覗かない（#242 の計測と違い**フック注入は無い**）。
 * `mutual-exclusion.ts` の設計原則（排他の根拠は「呼び出し側が実際に受け取る出力集合」に
 * 閉じる）と母集団を揃えるためで、内部の候補を数えても排他の材料にはならない。
 *
 * ## 母集団は #242 の**後**
 *
 * issue 本文の実例（`double_top 41-46-50` × `triangle_ascending`）は #242 の経路ゲートで
 * 既に `invalid` になっている。#243 が見たいのは「#242 の後にまだ残っている共存」なので、
 * 既定の母集団は**作業ツリー（#242 実装後）の出力集合**。#242 前との差は計測 4 で出す。
 *
 * ## 検出器のソース（#242 の計測スクリプトと同じ仕組み）
 *
 * - 既定（`--baseline-rev` 省略）: 現行 = 作業ツリー、ベースライン = `b49a08e`
 *   （PR #241 のマージ＝ #242 実装前の `main`）を `git show` で読む。
 * - `--baseline-rev worktree`: 両方とも作業ツリー。**差分が 0 になるのが正しい**（冪等性の検算）。
 *
 * ベースライン側は **`tools/patterns/` をディレクトリごと**当該リビジョンから展開する
 * （{@link materializePatternsDir}）。検出器 6 ファイルだけを写すと、検出器が import する
 * `./reversal-gate.js` / `./structural.js` が作業ツリーへ解決されて「#242 前」に #242 後の
 * 実装が混ざる。**ベースラインが既に #242 実装後だった場合は落ちる**——差分が常に 0 なのに
 * 数字だけ出るという最悪の壊れ方を避けるため。変更ファイル一覧は検算として 0 章に出す。
 *
 * ## 使い方
 *
 * ```bash
 * npx tsx scripts/measure_double_triangle_243.ts
 * npx tsx scripts/measure_double_triangle_243.ts --json /tmp/243.json
 * npx tsx scripts/measure_double_triangle_243.ts --baseline-rev worktree
 * ```
 *
 * コーパスは #242 と同じ組み方（標準コーパス 800 = 合成 704 + 実データ A 96）に、
 * 実データ B 96 / C 96 / D 96 を**別建て**で並べる。**プールしない**（#219）。
 * 実データ D（`btc_jpy_1hour_2026_09_05`）が未追加の環境では自動的に省略する。
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildBtcJpy2026Candles } from '../tests/fixtures/btc_jpy_1day_2026.js';
import { buildBtcJpy1hour202608Candles } from '../tests/fixtures/btc_jpy_1hour_2026_08.js';
import { buildBtcJpy1hour202609Candles } from '../tests/fixtures/btc_jpy_1hour_2026_09.js';
import * as synth from '../tests/fixtures/synthetic_pattern_candles.js';
import { getSizeThresholdsForTf, resolveParams } from '../tools/patterns/config.js';
import { globalDedup } from '../tools/patterns/helpers.js';
import { excludeTriplesSharingHsMainPoints } from '../tools/patterns/mutual-exclusion.js';
import { linearRegressionWithR2, near as nearFn, pct as pctFn } from '../tools/patterns/regression.js';
import { type Candle, detectSwingPoints, filterPeaks, filterValleys } from '../tools/patterns/swing.js';
import type { CandDebugEntry, DeduplicablePattern, DetectContext } from '../tools/patterns/types.js';

const ROOT = resolve(import.meta.dirname, '..');

// ── 検出器のロード（ソースは 1 行も変更しない） ──

type DetectorKey = 'double' | 'hs' | 'triangle' | 'wedge' | 'pennant' | 'triple';
type Detector = (ctx: DetectContext) => { patterns: DeduplicablePattern[] };
type DetectorSet = Record<DetectorKey, Detector>;

const DETECTOR_FILES: ReadonlyArray<readonly [DetectorKey, string, string]> = [
	['double', 'detect_doubles.ts', 'detectDoubles'],
	['hs', 'detect_hs.ts', 'detectHeadAndShoulders'],
	['triangle', 'detect_triangles.ts', 'detectTriangles'],
	['wedge', 'detect_wedges.ts', 'detectWedges'],
	['pennant', 'detect_pennants.ts', 'detectPennantsFlags'],
	['triple', 'detect_triples.ts', 'detectTriples'],
];

/**
 * #242 の実装が入る前の `main`（PR #241 のマージ）。計測 4 のベースライン。
 *
 * **作業ツリーを既定にしてはいけない**——#242 実装後の作業ツリーを「前」として使うと
 * 差分が常に 0 になり、「#242 でどれだけ共存が消えたか」を測っていないのに数字だけは出る。
 * `--baseline-rev worktree` を明示したときだけ作業ツリーを読む（そのときは差分 0 が正しい）。
 */
const DEFAULT_BASELINE_REV = 'b49a08e';

/** #242 の本番ゲートが入っているソースを検出するための印。 */
const PRODUCTION_GATE_MARKERS = ['checkBreakoutPath', 'applyPostBreakoutGates'];

const TMP_DIR = mkdtempSync(join(tmpdir(), 'double-triangle-243-'));

/**
 * ベースラインのリビジョンの `tools/patterns/` を**ディレクトリごと**一時領域へ展開する。
 *
 * ## 検出器 6 ファイルだけを写してはいけない（PR #250 のレビュー指摘）
 *
 * ベースラインの `detect_hs` / `detect_triples` は `./reversal-gate.js` を、
 * `detect_doubles` / `detect_hs` / `detect_triples` は `./structural.js` を import する。
 * 検出器だけを写して `./` を作業ツリーへ書き換えると、**「#242 前」の実行が #242 後の
 * `reversal-gate.ts` / `structural.ts` を呼ぶ。** 今回の #242 の差分がたまたま純増
 * （`structural.ts` は +92 / −0、`reversal-gate.ts` は +113 / −1 でどれも新規 export）
 * だったので数値は変わらないが、**それはハーネスが保証している性質ではない**。
 * 別のリビジョンを渡した瞬間に「#242 前」に現在の実装が混ざり、しかも黙って数字だけ出る。
 *
 * そこで同ディレクトリの依存も含めて丸ごと展開し、`./` の import は**展開先の中で**解決させる。
 * ディレクトリ外（`../../lib/` 等）は #242 の差分に含まれないので作業ツリーの絶対パスへ向ける。
 *
 * `package.json`（`{"type":"module"}`）を置くのは、拡張子 `.ts` のまま ESM として読ませるため
 * （一時ディレクトリには親の `package.json` が無く、置かないと CJS 扱いになる）。
 *
 * @returns 展開先ディレクトリの絶対パス
 * @throws リビジョンが解決できない場合と、ベースラインに #242 の本番ゲートが入っていた場合
 */
function materializePatternsDir(rev: string): string {
	let files: string[];
	try {
		files = execFileSync('git', ['ls-tree', '-r', '--name-only', rev, '--', 'tools/patterns/'], {
			cwd: ROOT,
			encoding: 'utf8',
		})
			.split('\n')
			.map((s) => s.trim())
			.filter((s) => s.endsWith('.ts'));
	} catch (e) {
		const detail = e instanceof Error ? e.message.split('\n')[0] : String(e);
		throw new Error(
			`ベースラインのリビジョン '${rev}' から tools/patterns/ を読めない（${detail}）。` +
				'--baseline-rev で #242 実装前のリビジョンを指定するか、' +
				'冪等性の検算をしたい場合だけ --baseline-rev worktree を渡すこと。',
		);
	}
	if (files.length === 0) {
		throw new Error(`ベースラインのリビジョン '${rev}' の tools/patterns/ に .ts が 1 つも無い。`);
	}

	const dir = join(TMP_DIR, `patterns_${rev.replace(/[^a-z0-9]/gi, '')}`);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n');

	for (const path of files) {
		const name = path.slice('tools/patterns/'.length);
		const src = execFileSync('git', ['show', `${rev}:${path}`], {
			cwd: ROOT,
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
		});
		// 本番ゲートの混入検査は**展開したファイル全部**に掛ける。検出器 6 ファイルだけ見ると、
		// ゲート本体（`reversal-gate.ts` の `applyPostBreakoutGates`）が入った状態を見逃す。
		const marker = PRODUCTION_GATE_MARKERS.find((m) => src.includes(m));
		if (marker !== undefined) {
			throw new Error(
				`ベースライン '${rev}' の ${name} に #242 の本番ゲート（${marker}）が入っている。` +
					'この状態の差分は「#242 で共存がどれだけ消えたか」を表さない。' +
					'--baseline-rev に #242 実装前のリビジョンを指定すること。',
			);
		}
		writeFileSync(
			join(dir, name),
			src
				// ディレクトリ外への import は作業ツリーの絶対パスへ。
				.replace(/from '\.\.\/\.\.\//g, `from '${ROOT}/`)
				// `../patterns/` は**同ディレクトリの別名**（`detect_triples.ts` の `config.js`）。
				// 下の汎用 `../` 規則より先に畳まないと展開先の外へ逃げる。
				.replace(/from '\.\.\/patterns\//g, "from './")
				.replace(/from '\.\.\//g, `from '${ROOT}/tools/`),
			// `from './` は書き換えない——展開先の中で解決させるのが本関数の目的。
		);
	}
	return dir;
}

/**
 * 指定リビジョンの 6 検出器を読み込む。
 *
 * `rev === 'worktree'` のときは**作業ツリーの本物をそのまま import する**（写しを作らない）。
 * 母集団側は現行の実装そのものでなければ意味がなく、写しを挟むと写し方の誤りが混入しうる。
 */
async function loadDetectors(rev: string): Promise<DetectorSet> {
	const dir = rev === 'worktree' ? join(ROOT, 'tools/patterns') : materializePatternsDir(rev);
	const out = {} as DetectorSet;
	for (const [key, file, exportName] of DETECTOR_FILES) {
		const href = pathToFileURL(join(dir, file)).href;
		out[key] = ((await import(href)) as Record<string, Detector>)[exportName];
	}
	return out;
}

/** ベースラインと作業ツリーで実際に差があるファイル（0 章の検算に出す）。 */
function changedPatternFiles(rev: string): string[] {
	if (rev === 'worktree') return [];
	try {
		return execFileSync('git', ['diff', '--name-only', rev, 'HEAD', '--', 'tools/patterns/'], {
			cwd: ROOT,
			encoding: 'utf8',
		})
			.split('\n')
			.map((s) => s.replace('tools/patterns/', '').trim())
			.filter((s) => s.length > 0);
	} catch {
		return ['（取得できず）'];
	}
}

// ── コーパス（#242 と同じ組み方） ──

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

/** MCP の統合オプション 3 つの全組み合わせ（ケース数の単位を #211 / #216 / #242 と揃える）。 */
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

/**
 * `detect_patterns.ts` の縮小段を再現して `data.patterns` 相当を返す。
 *
 * 段の順序は本体（`tools/detect_patterns.ts`）と同じ:
 * 検出 → `globalDedup` → ライフサイクル絞り込み → `excludeTriplesSharingHsMainPoints`。
 * `requireCurrentInPattern` は既定 off なので再現しない。`rankPatterns` は並べ替えるだけで
 * 集合を変えないため省く（ペアの集合は順序に依存しない）。
 */
function runPipeline(spec: CaseSpec, d: DetectorSet): DeduplicablePattern[] {
	const ctx = buildCtx(spec);
	let patterns: DeduplicablePattern[] = [];
	patterns.push(...d.double(ctx).patterns);
	patterns.push(...d.hs(ctx).patterns);
	patterns.push(...d.triangle(ctx).patterns);
	patterns.push(...d.wedge(ctx).patterns);
	patterns.push(...d.pennant(ctx).patterns);
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

// ── ペアの抽出 ──

const DOUBLE_TYPES = new Set(['double_top', 'double_bottom']);
const CONTINUATION_TYPES = new Set([
	'triangle_ascending',
	'triangle_descending',
	'triangle_symmetrical',
	'rising_wedge',
	'falling_wedge',
]);

/**
 * `globalDedup`（`helpers.ts`）の重複率と**同じ式**。分母は短いほうの期間で、閾値も同じ 0.7。
 *
 * `helpers.ts` は式を export していないので写しになる。**本 Phase は `helpers.ts` を触らない**
 * （issue #243「やらないこと」）ので、共有化は Phase 2 で排他を実装するときに一緒にやる。
 * 写しがずれていないことは {@link countDedupFormulaMismatch} が毎ケース検算する。
 */
function overlapRatio(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
	const toMs = (iso: string): number => {
		const t = Date.parse(String(iso));
		return Number.isFinite(t) ? t : NaN;
	};
	const as = toMs(aStart);
	const ae = toMs(aEnd);
	const bs = toMs(bStart);
	const be = toMs(bEnd);
	if (!Number.isFinite(as) || !Number.isFinite(ae) || !Number.isFinite(bs) || !Number.isFinite(be)) return 0;
	const ov = Math.max(0, Math.min(ae, be) - Math.max(as, bs));
	const minD = Math.min(Math.max(1, ae - as), Math.max(1, be - bs));
	return ov / minD;
}

const DEDUP_THRESHOLD = 0.7;

/** `helpers.ts` の `categoryMap` の写し（同上。本 Phase では変更しない）。 */
const CATEGORY_MAP: Readonly<Record<string, string>> = {
	rising_wedge: 'wedge',
	falling_wedge: 'wedge',
	triangle_ascending: 'triangle',
	triangle_descending: 'triangle',
	triangle_symmetrical: 'triangle',
};

function isSameCategory(a: string, b: string): boolean {
	if (a === b) return true;
	const ca = CATEGORY_MAP[a];
	const cb = CATEGORY_MAP[b];
	return !!(ca && cb && ca === cb);
}

/**
 * {@link overlapRatio} と {@link isSameCategory} が `globalDedup` の写しとしてずれていないかを
 * **本物を呼んで**検算する。
 *
 * 2 要素だけを `globalDedup` に渡すと、その戻り値の長さが 1 になるのは
 * 「同カテゴリ かつ 重複率 ≥ 0.7」のときだけ——順序依存も勝者選択も効かない完全な神託になる。
 * 写しの判定と 1 件でも食い違えば以降の集計は無効。
 *
 * **`globalDedup` を通した後の集合に「同カテゴリで重複率 ≥ 0.7」が残っていないこと」は
 * 検算にならない。** 本物は `findIndex`（最初の 1 件）で相手を選び、勝者を**その位置に上書き**
 * するので、A と B が重ならず両方が C と重なる並びでは C が A の位置に入って B と共存しうる。
 * これは本物の順序依存であって写しのずれではない。
 *
 * @returns 写しと本物が食い違ったペアの数（0 が正常）
 */
function countDedupFormulaMismatch(patterns: DeduplicablePattern[]): number {
	let n = 0;
	for (let i = 0; i < patterns.length; i++) {
		for (let j = i + 1; j < patterns.length; j++) {
			const a = patterns[i];
			const b = patterns[j];
			const mine =
				isSameCategory(String(a?.type), String(b?.type)) &&
				overlapRatio(String(a?.range?.start), rangeEnd(a), String(b?.range?.start), rangeEnd(b)) >= DEDUP_THRESHOLD;
			const real = globalDedup([a, b]).length === 1;
			if (mine !== real) n++;
		}
	}
	return n;
}

/** 期待するブレイク方向。`null` は「向きを持たない」（対称三角形）。 */
function expectedDirection(type: string): 'up' | 'down' | null {
	switch (type) {
		case 'double_top':
			return 'down';
		case 'double_bottom':
			return 'up';
		case 'triangle_ascending':
			return 'up';
		case 'triangle_descending':
			return 'down';
		// `detect_wedges.ts` の `outcome4b` と同じ向き（falling は上抜けが順当）。
		case 'rising_wedge':
			return 'down';
		case 'falling_wedge':
			return 'up';
		default:
			return null;
	}
}

type DirCombo = 'opposite' | 'same' | 'neutral';

function dirCombo(dType: string, cType: string): DirCombo {
	const a = expectedDirection(dType);
	const b = expectedDirection(cType);
	if (a === null || b === null) return 'neutral';
	return a === b ? 'same' : 'opposite';
}

function pivotIdxs(p: DeduplicablePattern): number[] | null {
	const pivots = (p as { pivots?: Array<{ idx?: number }> }).pivots;
	if (!Array.isArray(pivots)) return null;
	const idxs = pivots.map((q) => Number(q?.idx)).filter((n) => Number.isFinite(n));
	return idxs.length === 0 ? null : idxs;
}

function rangeEnd(p: DeduplicablePattern): string {
	return String(p?.range?.end ?? p?.range?.current);
}

interface Pair {
	group: Group;
	series: string;
	tf: string;
	swingDepth: number | undefined;
	optsBits: number;
	dType: string;
	dIdxs: number[];
	dStart: string;
	dEnd: string;
	dConfidence: number;
	cType: string;
	/** `wedge_*` は `pivots` を持たない（`detect_wedges.ts` は構成点を出力しない）ので `null`。 */
	cIdxs: number[] | null;
	cStart: string;
	cEnd: string;
	cStatus: string;
	cBreakoutDirection: string | null;
	cBreakoutBarIndex: number | null;
	overlap: number;
	/**
	 * 短いほうの期間 / 長いほうの期間。
	 *
	 * `globalDedup` の重複率は**分母が短いほうの期間**なので、長い区間の中に短い区間が
	 * すっぽり入っているだけでも 100% になる。「同じ区間」と「入れ子」を重複率だけでは
	 * 区別できないため、Phase 2 の判断材料として別に出す。
	 */
	durRatio: number;
	/** 一方の期間が他方を完全に含むか。 */
	nested: boolean;
	/** double の 3 点のうち継続側の `pivots` に含まれる数。`cIdxs === null` なら `null`。 */
	shared: number | null;
	combo: DirCombo;
}

/** accepted（`completed` / status 無し）。`detect_patterns.ts` のライフサイクル分類と同じ。 */
function isAccepted(p: DeduplicablePattern): boolean {
	return p.status === 'completed' || !p.status;
}

function extractPairs(spec: CaseSpec, patterns: DeduplicablePattern[]): Pair[] {
	const optsBits =
		(spec.opts.includeForming ? 1 : 0) | (spec.opts.includeCompleted ? 2 : 0) | (spec.opts.includeInvalid ? 4 : 0);
	const doubles = patterns.filter((p) => DOUBLE_TYPES.has(String(p.type)) && isAccepted(p));
	const conts = patterns.filter((p) => CONTINUATION_TYPES.has(String(p.type)));
	const out: Pair[] = [];
	for (const dbl of doubles) {
		const dIdxs = pivotIdxs(dbl) ?? [];
		const dStart = String(dbl.range?.start);
		const dEnd = rangeEnd(dbl);
		for (const c of conts) {
			const cStart = String(c.range?.start);
			const cEnd = rangeEnd(c);
			const overlap = overlapRatio(dStart, dEnd, cStart, cEnd);
			if (overlap < DEDUP_THRESHOLD) continue;
			const cIdxs = pivotIdxs(c);
			const cSet = cIdxs === null ? null : new Set(cIdxs);
			const ds = Date.parse(dStart);
			const de = Date.parse(dEnd);
			const cs = Date.parse(cStart);
			const ce = Date.parse(cEnd);
			const dDur = Math.max(1, de - ds);
			const cDur = Math.max(1, ce - cs);
			out.push({
				group: spec.series.group,
				series: spec.series.name,
				tf: spec.tf,
				swingDepth: spec.swingDepth,
				optsBits,
				dType: String(dbl.type),
				dIdxs,
				dStart,
				dEnd,
				dConfidence: Number(dbl.confidence),
				cType: String(c.type),
				cIdxs,
				cStart,
				cEnd,
				cStatus: String(c.status ?? 'completed'),
				cBreakoutDirection: (c as { breakoutDirection?: string }).breakoutDirection ?? null,
				cBreakoutBarIndex: Number.isFinite(Number((c as { breakoutBarIndex?: number }).breakoutBarIndex))
					? Number((c as { breakoutBarIndex?: number }).breakoutBarIndex)
					: null,
				overlap,
				durRatio: Math.min(dDur, cDur) / Math.max(dDur, cDur),
				nested: (ds <= cs && ce <= de) || (cs <= ds && de <= ce),
				shared: cSet === null ? null : dIdxs.filter((i) => cSet.has(i)).length,
				combo: dirCombo(String(dbl.type), String(c.type)),
			});
		}
	}
	return out;
}

/**
 * 構造の同一性キー。オプション 8 通り（と同じピボット列を生む `swingDepth`）の重複を畳む。
 * 継続側が `pivots` を持たない場合は期間で識別する。
 */
function structureKey(p: Pair): string {
	const cId = p.cIdxs === null ? `range:${p.cStart}~${p.cEnd}` : p.cIdxs.join('-');
	return `${p.series}|${p.tf}|${p.dType}|${p.dIdxs.join('-')}|${p.cType}|${cId}`;
}

interface Structure {
	key: string;
	first: Pair;
	/** 延べ件数（ケース単位の出現数） */
	occurrences: number;
	/** 同じ構造キーで継続側の `status` が食い違った件数（0 が正常） */
	statusConflicts: number;
}

/**
 * **価格系列上の組**のキー（時間足と継続側の窓を畳む）。
 *
 * 「時間足」はパラメータ組の名前で再サンプリングではないので、同じ値動きの同じ組が
 * `1day` / `4hour` / `1hour` の 3 行に分かれて出る。継続側の窓も `swingDepth` で 1 点だけ
 * 伸び縮みするため、{@link structureKey} は同じ実体を複数に数える。**排他ルールが相手に
 * するのは値動き上の組**なので、その単位でも数えておく（#219 の「二重に数えない」）。
 */
function priceStructureKey(p: Pair): string {
	return `${p.series}|${p.dType}|${p.dIdxs.join('-')}|${p.cType}`;
}

function foldStructures(pairs: Pair[]): Structure[] {
	const map = new Map<string, Structure>();
	for (const p of pairs) {
		const key = structureKey(p);
		const cur = map.get(key);
		if (cur === undefined) {
			map.set(key, { key, first: p, occurrences: 1, statusConflicts: 0 });
			continue;
		}
		cur.occurrences++;
		if (cur.first.cStatus !== p.cStatus) cur.statusConflicts++;
	}
	return [...map.values()];
}

// ── 集計 ──

interface CorpusResult {
	label: string;
	cases: number;
	/** #242 後（作業ツリー）の accepted double 延べ件数 */
	acceptedDoubles: number;
	/** #242 後の継続パターン（`triangle_*` / `wedge_*`）延べ件数 */
	continuations: number;
	pairs: Pair[];
	structures: Structure[];
	/** #242 前（ベースライン）の同じ集計 */
	basePairs: Pair[];
	baseStructures: Structure[];
	baseAcceptedDoubles: number;
}

const STATUSES = ['completed', 'invalid', 'forming', 'near_completion', 'expired'] as const;
const COMBOS: DirCombo[] = ['opposite', 'same', 'neutral'];
const COMBO_LABEL: Record<DirCombo, string> = {
	opposite: '逆（反転と継続の期待方向が逆）',
	same: '同（期待方向が同じ）',
	neutral: '中立（対称三角形＝向きなし）',
};

function countBy<T>(items: T[], pick: (t: T) => string): Map<string, number> {
	const m = new Map<string, number>();
	for (const it of items) {
		const k = pick(it);
		m.set(k, (m.get(k) ?? 0) + 1);
	}
	return m;
}

function sectionPairCounts(pairs: Pair[], structures: Structure[]): string {
	if (pairs.length === 0) return '**共存ペア 0 件。**';
	const out: string[] = [
		'継続側の `status` × 方向の組み合わせ（延べ / 構造）。',
		'',
		`| 継続 type | status | 方向 | 延べ | 構造 |`,
		'|---|---|---|---:|---:|',
	];
	const types = [...new Set(pairs.map((p) => p.cType))].sort();
	for (const t of types) {
		for (const s of STATUSES) {
			for (const c of COMBOS) {
				const n = pairs.filter((p) => p.cType === t && p.cStatus === s && p.combo === c).length;
				if (n === 0) continue;
				const ns = structures.filter((x) => x.first.cType === t && x.first.cStatus === s && x.first.combo === c).length;
				out.push(`| ${t} | ${s} | ${COMBO_LABEL[c]} | ${n} | ${ns} |`);
			}
		}
	}
	out.push(`| **合計** | | | **${pairs.length}** | **${structures.length}** |`);
	out.push('');
	const price = [...new Set(pairs.map(priceStructureKey))].sort();
	out.push(
		`**価格系列上の組は ${price.length}**（時間足のパラメータ組と継続側の窓の伸び縮みを畳んだ単位。` +
			'排他ルールが相手にするのはこちら）:',
	);
	out.push('');
	for (const k of price) out.push(`- \`${k}\``);
	out.push('');
	out.push(
		'期間の重なり方（構造）。**重複率の分母は短いほうの期間**なので、長い区間に短い区間が' +
			'入っているだけでも 100% になる。「同じ区間の別解釈」と「入れ子」を分ける。',
	);
	out.push('');
	out.push('| 重なり方 | 構造 | うち短長比 ≥ 70% | うち短長比 < 70% |');
	out.push('|---|---:|---:|---:|');
	for (const [label, pick] of [
		['入れ子（一方が他方を完全に含む）', (s: Structure) => s.first.nested],
		['部分重なり', (s: Structure) => !s.first.nested],
	] as Array<[string, (s: Structure) => boolean]>) {
		const sub = structures.filter(pick);
		if (sub.length === 0) continue;
		out.push(
			`| ${label} | ${sub.length} | ${sub.filter((s) => s.first.durRatio >= 0.7).length} | ${sub.filter((s) => s.first.durRatio < 0.7).length} |`,
		);
	}
	out.push('');
	out.push('時間足別（構造）。');
	out.push('');
	out.push('| 時間足 | 構造 | うち status=invalid | うち方向が逆 |');
	out.push('|---|---:|---:|---:|');
	for (const tf of new Set(structures.map((s) => s.first.tf))) {
		const sub = structures.filter((s) => s.first.tf === tf);
		out.push(
			`| ${tf} | ${sub.length} | ${sub.filter((s) => s.first.cStatus === 'invalid').length} | ${sub.filter((s) => s.first.combo === 'opposite').length} |`,
		);
	}
	return out.join('\n');
}

function sectionShared(pairs: Pair[], structures: Structure[]): string {
	if (pairs.length === 0) return '共存ペアが 0 件なので該当なし。';
	const label = (n: number | null) => (n === null ? '判定不能（継続側に `pivots` が無い）' : `${n} 点`);
	const out: string[] = ['| 共有点数 | 延べ | 構造 |', '|---|---:|---:|'];
	const keys = [...new Set(pairs.map((p) => p.shared))].sort((a, b) => (a ?? -1) - (b ?? -1));
	for (const k of keys) {
		out.push(
			`| ${label(k)} | ${pairs.filter((p) => p.shared === k).length} | ${structures.filter((s) => s.first.shared === k).length} |`,
		);
	}
	out.push(`| **合計** | **${pairs.length}** | **${structures.length}** |`);
	const withPivots = structures.filter((s) => s.first.shared !== null);
	if (withPivots.length > 0) {
		const ge2 = withPivots.filter((s) => (s.first.shared ?? 0) >= 2).length;
		out.push('');
		out.push(
			`継続側が \`pivots\` を持つ構造 ${withPivots.length} のうち、**2 点以上共有は ${ge2}**（#218 の規則がそのまま使えるかの判断材料）。`,
		);
	}
	return out.join('\n');
}

function fmtIdxs(idxs: number[] | null): string {
	return idxs === null ? '（`pivots` 無し）' : `[${idxs.join(', ')}]`;
}

function sectionDetail(structures: Structure[], candlesOf: (series: string) => Candle[] | undefined): string {
	if (structures.length === 0) return '共存ペアが 0 件なので該当なし。';
	const out: string[] = [];
	for (const s of structures) {
		const p = s.first;
		const candles = candlesOf(p.series);
		const iso = (i: number) => candles?.[i]?.isoTime ?? '—';
		out.push(
			`- **${p.dType} × ${p.cType}** — \`${p.series}\` / ${p.tf} / swingDepth=${p.swingDepth ?? 'auto'}（延べ ${s.occurrences}）`,
			`  - 期間重複 ${(p.overlap * 100).toFixed(1)}%（短長比 ${(p.durRatio * 100).toFixed(1)}% / ${p.nested ? '**入れ子**' : '部分重なり'}） / 方向 ${COMBO_LABEL[p.combo]}`,
			`  - double: 構成点 ${fmtIdxs(p.dIdxs)}（${p.dIdxs.map((i) => iso(i)).join(' , ')}） / range ${p.dStart} → ${p.dEnd} / confidence ${p.dConfidence}`,
			`  - ${p.cType}: 構成点 ${fmtIdxs(p.cIdxs)} / range ${p.cStart} → ${p.cEnd} / status \`${p.cStatus}\`` +
				` / ブレイク ${p.cBreakoutDirection ?? 'なし'}${p.cBreakoutBarIndex === null ? '' : `（idx ${p.cBreakoutBarIndex} / ${iso(p.cBreakoutBarIndex)}）`}`,
			`  - 主構成点の共有: ${p.shared === null ? '判定不能（継続側に `pivots` が無い）' : `${p.shared} / 3 点`}`,
		);
		if (s.statusConflicts > 0) {
			out.push(`  - **注意: 同じ構造キーで継続側 status が ${s.statusConflicts} 回食い違った**`);
		}
	}
	return out.join('\n');
}

function sectionBaselineDiff(r: CorpusResult): string {
	const out: string[] = [
		'| 項目 | #242 前 | #242 後 | 増減 |',
		'|---|---:|---:|---:|',
		`| accepted な \`double_*\`（延べ） | ${r.baseAcceptedDoubles} | ${r.acceptedDoubles} | ${r.acceptedDoubles - r.baseAcceptedDoubles} |`,
		`| 共存ペア（延べ） | ${r.basePairs.length} | ${r.pairs.length} | ${r.pairs.length - r.basePairs.length} |`,
		`| 共存ペア（構造） | ${r.baseStructures.length} | ${r.structures.length} | ${r.structures.length - r.baseStructures.length} |`,
	];
	const byTypeBase = countBy(r.basePairs, (p) => `${p.dType} × ${p.cType}`);
	const byTypeNow = countBy(r.pairs, (p) => `${p.dType} × ${p.cType}`);
	const keys = [...new Set([...byTypeBase.keys(), ...byTypeNow.keys()])].sort();
	for (const k of keys) {
		const b = byTypeBase.get(k) ?? 0;
		const n = byTypeNow.get(k) ?? 0;
		out.push(`| └ ${k}（延べ） | ${b} | ${n} | ${n - b} |`);
	}
	const nowKeys = new Set(r.structures.map((s) => s.key));
	const baseKeys = new Set(r.baseStructures.map((s) => s.key));
	const gone = r.baseStructures.filter((s) => !nowKeys.has(s.key));
	const added = r.structures.filter((s) => !baseKeys.has(s.key));
	out.push('');
	out.push(
		`- #242 で消えた構造: ${gone.length === 0 ? 'なし' : gone.map((s) => `\`${s.key}\``).join(' , ')}`,
		`- #242 で増えた構造: ${added.length === 0 ? 'なし' : added.map((s) => `\`${s.key}\``).join(' , ')}`,
	);
	return out.join('\n');
}

/**
 * 実データ C と D は同じ値動きの別窓（346 本重複・**D の idx + 19 = C の idx**）。
 * 両方に出る同一構造を突き合わせ、**二重に数えない**ための対応表を出す（#243 計測 5）。
 */
function sectionCdOverlap(results: CorpusResult[]): string {
	const c = results.find((r) => r.structures.some((s) => s.first.group === 'realC') || r.label.includes('実データ C'));
	const d = results.find((r) => r.structures.some((s) => s.first.group === 'realD') || r.label.includes('実データ D'));
	if (!c || !d) return '実データ C / D のどちらかが無いため突き合わせ不可。';
	const OFFSET = 19;
	/** D の構造を C の idx 空間へ写した識別子（時間足と type も含める）。 */
	const shift = (s: Structure, off: number): string => {
		const p = s.first;
		const ci = p.cIdxs === null ? 'range' : p.cIdxs.map((i) => i + off).join('-');
		return `${p.tf}|${p.dType}|${p.dIdxs.map((i) => i + off).join('-')}|${p.cType}|${ci}`;
	};
	const cKeys = new Map(c.structures.map((s) => [shift(s, 0), s]));
	const out: string[] = [
		`実データ D の idx に **+${OFFSET}** して実データ C の idx 空間へ写し、type / 時間足 / 構成点で突き合わせた。`,
		'',
		'| | 構造 |',
		'|---|---:|',
		`| 実データ C の共存構造 | ${c.structures.length} |`,
		`| 実データ D の共存構造 | ${d.structures.length} |`,
	];
	const matched = d.structures.filter((s) => cKeys.has(shift(s, OFFSET)));
	out.push(`| **両方に出る（= 同じ実体。二重に数えない）** | **${matched.length}** |`);
	out.push(`| 実データ D にだけ出る | ${d.structures.length - matched.length} |`);
	out.push(`| 実データ C にだけ出る | ${c.structures.length - matched.length} |`);
	if (matched.length > 0) {
		out.push('');
		for (const s of matched) {
			const cs = cKeys.get(shift(s, OFFSET)) as Structure;
			out.push(
				`- D \`${s.first.dType} ${s.first.dIdxs.join('-')} × ${s.first.cType} ${fmtIdxs(s.first.cIdxs)}\`（${s.first.tf}）` +
					` = C \`${cs.first.dIdxs.join('-')} × ${fmtIdxs(cs.first.cIdxs)}\``,
			);
		}
	}
	const only = (xs: Structure[], other: Map<string, Structure> | null, off: number) =>
		xs.filter((s) => (other === null ? true : !other.has(shift(s, off))));
	const dOnly = only(d.structures, cKeys, OFFSET);
	if (dOnly.length > 0) {
		out.push('');
		out.push(
			`- 実データ D にだけ出る構造: ${dOnly.map((s) => `\`${s.first.tf} ${s.first.dType} ${s.first.dIdxs.join('-')} × ${s.first.cType}\``).join(' , ')}`,
		);
	}
	const dKeys = new Set(d.structures.map((s) => shift(s, OFFSET)));
	const cOnly = c.structures.filter((s) => !dKeys.has(shift(s, 0)));
	if (cOnly.length > 0) {
		out.push(
			`- 実データ C にだけ出る構造: ${cOnly.map((s) => `\`${s.first.tf} ${s.first.dType} ${s.first.dIdxs.join('-')} × ${s.first.cType}\``).join(' , ')}`,
		);
	}
	return out.join('\n');
}

/**
 * 全コーパスを通算した構造数（共有点数別 / 方向別 / 継続 type 別）。
 *
 * **これは #219 の「プールしない」に反する分析ではない。** 分布を読むための表ではなく、
 * メモ側の目視判定表（`docs/internal/double-triangle-exclusion-243.md` §5-2 / §5-3）が
 * コーパスを跨いだ 1 本のリストで書かれているため、その**行数の手集計を機械で検算する**ための
 * チェックサム。実際 PR #250 のレビューで「3 点共有 6」（正しくは標準 5 + 実データ D 2 = 7）
 * という手集計の取り違えが見つかっており、その再発を防ぐのが目的。
 * 分布の読み取りは従来どおりコーパス別の表で行うこと。
 */
function sectionChecksum(structures: Structure[]): string {
	const label = (n: number | null) => (n === null ? '判定不能（`wedge_*`）' : `${n} 点`);
	const out: string[] = [
		`共存構造は全コーパス通算で **${structures.length}**。メモ §5 の判定表の行数はこれと一致する。`,
		'',
		'| 主構成点の共有 | 構造 |',
		'|---|---:|',
	];
	const shared = [...new Set(structures.map((s) => s.first.shared))].sort((a, b) => (a ?? -1) - (b ?? -1));
	for (const k of shared) {
		out.push(`| ${label(k)} | ${structures.filter((s) => s.first.shared === k).length} |`);
	}
	out.push('', '| 方向 | 構造 |', '|---|---:|');
	for (const c of COMBOS) {
		const n = structures.filter((s) => s.first.combo === c).length;
		if (n > 0) out.push(`| ${COMBO_LABEL[c]} | ${n} |`);
	}
	out.push('', '| 継続 type / status | 構造 |', '|---|---:|');
	const byType = countBy(structures, (s) => `${s.first.cType} / ${s.first.cStatus}`);
	for (const k of [...byType.keys()].sort()) out.push(`| ${k} | ${byType.get(k) as number} |`);
	return out.join('\n');
}

/**
 * フラグの値を**計測を始める前に**取り出す（#211 / #216 / #242 の計測スクリプトと同じ理由）。
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

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const jsonPath = flagValue(argv, '--json');
	const baselineRev = flagValue(argv, '--baseline-rev') ?? DEFAULT_BASELINE_REV;

	const current = await loadDetectors('worktree');
	const baseline = await loadDetectors(baselineRev);
	const corpora = await buildCorpus();

	const seriesCandles = new Map<string, Candle[]>();
	for (const c of corpora) for (const spec of c.cases) seriesCandles.set(spec.series.name, spec.series.candles);

	const results: CorpusResult[] = [];
	let totalCases = 0;
	let dedupFormulaMismatch = 0;
	for (const corpus of corpora) {
		const pairs: Pair[] = [];
		const basePairs: Pair[] = [];
		let acceptedDoubles = 0;
		let baseAcceptedDoubles = 0;
		let continuations = 0;
		for (const spec of corpus.cases) {
			totalCases++;
			const now = runPipeline(spec, current);
			dedupFormulaMismatch += countDedupFormulaMismatch(now);
			acceptedDoubles += now.filter((p) => DOUBLE_TYPES.has(String(p.type)) && isAccepted(p)).length;
			continuations += now.filter((p) => CONTINUATION_TYPES.has(String(p.type))).length;
			pairs.push(...extractPairs(spec, now));
			const before = runPipeline(spec, baseline);
			baseAcceptedDoubles += before.filter((p) => DOUBLE_TYPES.has(String(p.type)) && isAccepted(p)).length;
			basePairs.push(...extractPairs(spec, before));
		}
		results.push({
			label: corpus.label,
			cases: corpus.cases.length,
			acceptedDoubles,
			continuations,
			pairs,
			structures: foldStructures(pairs),
			basePairs,
			baseStructures: foldStructures(basePairs),
			baseAcceptedDoubles,
		});
	}

	const allStructures = results.flatMap((r) => r.structures);
	const statusConflicts = allStructures.reduce((a, s) => a + s.statusConflicts, 0);

	const md: string[] = [];
	md.push('# `double_*` × `triangle_*` / `wedge_*` の共存（issue #243 Phase 1）');
	md.push('');
	md.push(
		'検出器のソースは 1 行も変更していない。見ているのは `detect_patterns` の**出力集合**だけで、' +
			'内部にフックは入れていない（`mutual-exclusion.ts` の「根拠は呼び出し側が実際に受け取る出力集合に閉じる」に合わせる）。',
	);
	md.push('');
	md.push('## 0. ハーネスと検算');
	md.push('');
	md.push('| 項目 | 値 |');
	md.push('|---|---|');
	md.push(`| 現行（母集団）のソース | 作業ツリー（#242 実装後） |`);
	md.push(`| ベースラインのリビジョン | \`${baselineRev}\` |`);
	md.push(`| ケース数 | ${totalCases} |`);
	md.push(`| 期間重複の閾値 | ${DEDUP_THRESHOLD}（\`globalDedup\` と同じ） |`);
	md.push(
		`| ベースライン以降に変わった \`tools/patterns/\` | ${
			baselineRev === 'worktree' ? '（作業ツリー同士なので差分なし）' : changedPatternFiles(baselineRev).join(' , ')
		} |`,
	);
	md.push(`| **同じ構造キーで継続側 status が食い違った件数** | **${statusConflicts}** |`);
	md.push(`| **重複率・カテゴリの写しが \`globalDedup\` 本体と食い違ったペア** | **${dedupFormulaMismatch}** |`);
	md.push('');
	md.push(
		statusConflicts === 0
			? '構造キー（系列・時間足・両者の構成点）が同じなら継続側の `status` も常に同じだった。以降の「構造」単位の表は `status` を一意に決められる。'
			: '**同じ構造キーで `status` が食い違っている。構造単位の `status` 別集計は無効。**',
	);
	md.push('');
	md.push(
		dedupFormulaMismatch === 0
			? '出力集合の全ペアを 2 要素だけ `globalDedup` 本体に通して突き合わせた結果、本スクリプトの重複率の式とカテゴリ表は `helpers.ts` と 1 件も食い違わなかった。'
			: '**重複率・カテゴリの写しが `globalDedup` 本体と食い違っている。以降のペア件数は無効。**',
	);
	md.push('');
	md.push(
		'**継続側の `pivots`**: `triangle_*` は構成点を出力するが、`wedge_*`（`detect_wedges.ts`）は' +
			'`pivots` を持たない（ダイアグラム用の点は別フィールド）。共有点数はその場合 **判定不能**として別建てにする。' +
			'照合は必ず `idx` で行う——`triangle` の `pivots.price` は高安、`double` は終値で、価格では突き合わせられない' +
			'（`swing.ts` の `Pivot` docstring）。',
	);
	md.push('');
	md.push(
		'**「時間足」はパラメータ組の名前であって再サンプリングではない**（#211 / #216 / #242 と同じコーパスの組み方）。' +
			'`resolveParams(tf)` と `getSizeThresholdsForTf(tf)` を切り替えて同じローソク足列を掃いているので、' +
			'`btc_jpy_1day_2026` を `1hour` のパラメータで走らせた行が出る。明細の `isoTime` は元の系列のもの。',
	);

	for (const r of results) {
		md.push('');
		md.push(`## ${r.label}（${r.cases} ケース）`);
		md.push('');
		md.push('### 母集団');
		md.push('');
		md.push('| 項目 | 延べ |');
		md.push('|---|---:|');
		md.push(`| accepted な \`double_*\` | ${r.acceptedDoubles} |`);
		md.push(`| \`triangle_*\` / \`wedge_*\`（status 問わず） | ${r.continuations} |`);
		md.push('');
		md.push('### 計測 1: 共存ペアの件数');
		md.push('');
		md.push(sectionPairCounts(r.pairs, r.structures));
		md.push('');
		md.push('### 計測 2: 主構成点の共有数');
		md.push('');
		md.push(sectionShared(r.pairs, r.structures));
		md.push('');
		md.push('### 計測 3: 共存ペアの明細（目視判定の材料）');
		md.push('');
		md.push(sectionDetail(r.structures, (s) => seriesCandles.get(s)));
		md.push('');
		md.push('### 計測 4: #242 前後の比較');
		md.push('');
		md.push(sectionBaselineDiff(r));
	}

	md.push('');
	md.push('## 計測 5: 実データ C / D の重なりの突き合わせ');
	md.push('');
	md.push(sectionCdOverlap(results));

	md.push('');
	md.push('## 全コーパス通算（メモの手集計の検算用）');
	md.push('');
	md.push(sectionChecksum(allStructures));

	const text = md.join('\n');
	process.stdout.write(`${text}\n`);
	if (jsonPath !== undefined) {
		writeFileSync(jsonPath, JSON.stringify({ baselineRev, totalCases, results }, null, 2));
	}
}

await main();
