/**
 * issue #249 Phase 1: 完成済み H&S の**右肩の取り方**と**探索窓のバー数**を実測する。
 *
 * #242 の経路ゲート（`peak_after_last_pivot`）で、実データ C / D（`btc_jpy` / `1hour`）の
 * accepted な `head_and_shoulders` が 56 → 0（延べ）になった。母集団 20 構造の全件に
 * 「右肩とブレイクの間の H ピボット」があった、というのが #242 の計測結果
 * （`docs/internal/reversal-breakout-path-242.md` § 実データ D 計測 2）。
 *
 * 本スクリプトが答えるのは 3 つ:
 *
 * 1. **右肩を「ブレイク直前の同種ピボット」に取り直した 5 点は accepted になれるか**
 *    （落ちるなら strict / relaxed のどこで落ちるか）。**本 issue の主結果。**
 * 2. `HS_BREAKOUT_MAX_BARS = 30` は 1 時間足で妥当か（#242 前のバー数分布）
 * 3. #242 後、完成済み H&S は「右肩から何本以内に割れば通る」状態になっているか
 *
 * **検出器のソースは 1 行も変更しない。** Phase 1 は計測とドキュメントだけ（issue #249）。
 *
 * ## ハーネス
 *
 * PR #250 のレビューで直した版（`measure_double_triangle_243.ts` の `materializePatternsDir`）に
 * 倣い、**`tools/patterns/` をディレクトリごと**一時領域へ展開して読む。検出器 1 ファイルだけを
 * 写すと `./reversal-gate.js` / `./structural.js` が作業ツリーへ解決され、「#242 前」の実行に
 * #242 後の実装が混ざる。
 *
 * 展開先の `detect_hs.ts` には**末尾に `export { … }` の 1 行だけ**を足す
 * （{@link INTERNAL_EXPORTS}）。関数宣言に名前を付け直すだけで**本体は 1 文字も変えない**ので、
 * 計測 1 が `enumerateHsWindows` / `extremeBetween` / `outerShoulderOk` の**本物**を呼べる。
 * 計測用に窓生成を書き写すと「測った窓」と「実装の窓」がずれても誰も気づかない。
 * 展開版が本物と同じ結果を返すことは 0 章で毎ケース検算する（`detectHeadAndShoulders` の
 * JSON 全キー一致）。
 *
 * ## 使い方
 *
 * ```bash
 * npx tsx scripts/measure_hs_shoulder_window_249.ts
 * npx tsx scripts/measure_hs_shoulder_window_249.ts --json /tmp/249.json
 * npx tsx scripts/measure_hs_shoulder_window_249.ts --baseline-rev worktree
 * ```
 *
 * コーパスは #242 / #243 と同じ組み方（標準コーパス 800 = 合成 704 + 実データ A 96）に、
 * 実データ B 96 / C 96 / D 96 を**別建て**で並べる。**プールしない**（#219）。
 * 実データ D（`btc_jpy_1hour_2026_09_05`）が未追加の環境では自動的に省略する。
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildBtcJpy2026Candles } from '../tests/fixtures/btc_jpy_1day_2026.js';
import { buildBtcJpy1hour202608Candles } from '../tests/fixtures/btc_jpy_1hour_2026_08.js';
import { buildBtcJpy1hour202609Candles } from '../tests/fixtures/btc_jpy_1hour_2026_09.js';
import * as synth from '../tests/fixtures/synthetic_pattern_candles.js';
import { getSizeThresholdsForTf, resolveParams } from '../tools/patterns/config.js';
import { getHsFormingBarParams, detectHeadAndShoulders as realDetectHs } from '../tools/patterns/detect_hs.js';
import { getTripleFormingBarParams } from '../tools/patterns/detect_triples.js';
import { linearRegressionWithR2, near as nearFn, pct as pctFn } from '../tools/patterns/regression.js';
import { type Candle, detectSwingPoints, filterPeaks, filterValleys } from '../tools/patterns/swing.js';
import type { CandDebugEntry, DeduplicablePattern, DetectContext } from '../tools/patterns/types.js';

const ROOT = resolve(import.meta.dirname, '..');

/** ピボット 1 点（`swing.ts` の `Pivot`。展開版から受け取るので構造だけで受ける）。 */
interface Pv {
	idx: number;
	price: number;
	kind: 'H' | 'L';
	extremePrice: number;
}

/** 候補 5 点窓（`detect_hs.ts` の `HsWindow`）。 */
interface Win {
	p0: Pv;
	p1: Pv;
	p2: Pv;
	p3: Pv;
	p4: Pv;
}

type Detector = (ctx: DetectContext) => { patterns: DeduplicablePattern[] };

/** 展開版 `detect_hs.ts` から借りる内部 API。**本体は変更せず末尾に export を 1 行足すだけ。** */
interface HsInternals {
	detectHeadAndShoulders: Detector;
	enumerateHsWindows: (ctx: DetectContext, side: 'top' | 'bottom') => Win[];
	extremeBetween: (list: ReadonlyArray<Pv>, loIdx: number, hiIdx: number, lower: boolean) => Pv | null;
	outerShoulderOk: (
		shoulders: ReadonlyArray<Pv>,
		shoulder: Pv,
		loIdx: number,
		hiIdx: number,
		isTop: boolean,
	) => boolean;
	HS_BREAKOUT_MAX_BARS: number;
	HS_MAX_SHOULDER_PAIRS: number;
}

const INTERNAL_EXPORTS =
	'\nexport { enumerateHsWindows, extremeBetween, outerShoulderOk, HS_BREAKOUT_MAX_BARS, HS_MAX_SHOULDER_PAIRS };\n';

/**
 * #242 の実装が入る前の `main`（PR #241 のマージ）。計測 2 のベースライン。
 *
 * **作業ツリーを既定にしてはいけない**——#242 後のソースで「#242 前の分布」を測ると、
 * 経路ゲートで落ちた候補が母集団から消えたぶんだけ分布が歪むのに数字だけは出る。
 * `--baseline-rev worktree` を明示したときだけ作業ツリーを読む。
 */
const DEFAULT_BASELINE_REV = 'b49a08e';

/** #242 の本番ゲートが入っているソースを検出するための印。 */
const PRODUCTION_GATE_MARKERS = ['checkBreakoutPath', 'applyPostBreakoutGates'];

const TMP_DIR = mkdtempSync(join(tmpdir(), 'hs-shoulder-249-'));

/**
 * `rev` の `tools/patterns/` を**ディレクトリごと**一時領域へ展開する
 * （`measure_double_triangle_243.ts` の同名関数と同じ流儀。PR #250 のレビュー反映版）。
 *
 * `exportInternals=true` のとき、`detect_hs.ts` の**末尾に** {@link INTERNAL_EXPORTS} を足す。
 * 既存の宣言に名前を付け直すだけなので判定は不変で、0 章の検算がそれを毎ケース確かめる。
 *
 * @param rev リビジョン。`'worktree'` なら作業ツリーのファイルをそのまま写す
 * @param exportInternals 内部 API を export するか
 * @param requirePreGate `true` なら #242 の本番ゲートが入っていた時点で落とす
 * @returns 展開先ディレクトリの絶対パス
 */
function materializePatternsDir(rev: string, exportInternals: boolean, requirePreGate: boolean): string {
	const treeish = rev === 'worktree' ? 'HEAD' : rev;
	let files: string[];
	try {
		files = execFileSync('git', ['ls-tree', '-r', '--name-only', treeish, '--', 'tools/patterns/'], {
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
		throw new Error(`リビジョン '${rev}' の tools/patterns/ に .ts が 1 つも無い。`);
	}

	const dir = join(TMP_DIR, `patterns_${rev.replace(/[^a-z0-9]/gi, '')}_${exportInternals ? 'x' : 'p'}`);
	mkdirSync(dir, { recursive: true });
	// 拡張子 `.ts` のまま ESM として読ませるための最小マニフェスト（一時ディレクトリには親が無い）。
	writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n');

	// `git ls-tree -r` は再帰なので、将来サブディレクトリができるとネストしたパスが返る。
	// **そのときは書き込む前に落とす**（PR #250 のレビュー指摘）。下の import 書き換えは
	// このディレクトリがフラットである前提で、ネストした `../` は誤って解決される。
	const nested = files.find((p) => p.slice('tools/patterns/'.length).includes('/'));
	if (nested !== undefined) {
		throw new Error(
			`'${rev}' の tools/patterns/ にサブディレクトリがある（${nested}）。` +
				'本関数の import 書き換えはフラット前提なので相対パスの解決を誤る。' +
				'ネストを導入したなら書き換えを深さ対応にすること。',
		);
	}

	for (const path of files) {
		const name = path.slice('tools/patterns/'.length);
		const src =
			rev === 'worktree'
				? readFileSync(join(ROOT, path), 'utf8')
				: execFileSync('git', ['show', `${rev}:${path}`], {
						cwd: ROOT,
						encoding: 'utf8',
						maxBuffer: 64 * 1024 * 1024,
					});
		if (requirePreGate) {
			// 混入検査は**展開したファイル全部**に掛ける。検出器だけ見るとゲート本体
			// （`reversal-gate.ts` の `applyPostBreakoutGates`）が入った状態を見逃す。
			const marker = PRODUCTION_GATE_MARKERS.find((m) => src.includes(m));
			if (marker !== undefined) {
				throw new Error(
					`ベースライン '${rev}' の ${name} に #242 の本番ゲート（${marker}）が入っている。` +
						'この状態の分布は「#242 前」を表さない。' +
						'--baseline-rev に #242 実装前のリビジョンを指定すること。',
				);
			}
		}
		const rewritten = src
			// ディレクトリ外への import は作業ツリーの絶対パスへ。
			.replace(/from '\.\.\/\.\.\//g, `from '${ROOT}/`)
			// `../patterns/` は**同ディレクトリの別名**。下の汎用 `../` 規則より先に畳む。
			.replace(/from '\.\.\/patterns\//g, "from './")
			.replace(/from '\.\.\//g, `from '${ROOT}/tools/`);
		// `from './` は書き換えない——展開先の中で解決させるのが本関数の目的。
		writeFileSync(
			join(dir, name),
			exportInternals && name === 'detect_hs.ts' ? rewritten + INTERNAL_EXPORTS : rewritten,
		);
	}
	return dir;
}

async function loadHsInternals(rev: string, requirePreGate: boolean): Promise<HsInternals> {
	const dir = materializePatternsDir(rev, true, requirePreGate);
	return (await import(pathToFileURL(join(dir, 'detect_hs.ts')).href)) as unknown as HsInternals;
}

async function loadTripleDetector(rev: string, requirePreGate: boolean): Promise<Detector> {
	const dir = materializePatternsDir(rev, false, requirePreGate);
	const mod = (await import(pathToFileURL(join(dir, 'detect_triples.ts')).href)) as Record<string, Detector>;
	return mod.detectTriples;
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

// ── コーパス（#242 / #243 と同じ組み方） ──

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

/** MCP の統合オプション 3 つの全組み合わせ（ケース数の単位を #211 / #216 / #242 / #243 と揃える）。 */
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
		return {
			group: 'realD',
			name: 'btc_jpy_1hour_2026_09_05',
			candles: mod.buildBtcJpy1hour20260905Candles(),
		};
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
function buildCtx(spec: CaseSpec, debugCandidates: CandDebugEntry[]): DetectContext {
	const { candles } = spec.series;
	const resolved = resolveParams(spec.tf, spec.swingDepth === undefined ? {} : { swingDepth: spec.swingDepth });
	const pivots = detectSwingPoints(candles, { swingDepth: resolved.swingDepth, strictPivots: true });
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

// ── 計測 1: 肩の組 → 窓の対応（本物の `enumerateHsWindows` を神託にする） ──

/**
 * 肩の組 `(p0, p4)` が窓にならない理由。`enumerateHsWindows` の `continue` と 1 対 1。
 *
 * | コード | `enumerateHsWindows` の該当行 |
 * |---|---|
 * | `pair_cap` | `if (++pairs > HS_MAX_SHOULDER_PAIRS) return windows` |
 * | `no_head_between` | `const p2 = extremeBetween(shoulders, …); if (!p2) continue` |
 * | `head_not_above_shoulders` | 頭が両肩を上回らない（逆 H&S は下回らない） |
 * | `valley1_missing` / `valley2_missing` | ネックラインの 2 点が張れない |
 * | `outer_shoulder_left` / `outer_shoulder_right` | 外側の脚に肩を明確に超える肩がある |
 * | `min_dist` | 隣接構成点の間隔が `minDist` 未満 |
 */
type PairReject =
	| 'pair_cap'
	| 'no_head_between'
	| 'head_not_above_shoulders'
	| 'valley1_missing'
	| 'valley2_missing'
	| 'outer_shoulder_left'
	| 'outer_shoulder_right'
	| 'min_dist';

type PairOutcome = { ok: true; win: Win } | { ok: false; reason: PairReject };

/**
 * 肩の組 `(p0, p4)` に `enumerateHsWindows` の判定を**本物の下請け関数で**当てて、
 * 窓になるか / どこで落ちるかを返す。
 *
 * **窓生成そのものは書き写していない**（`extremeBetween` / `outerShoulderOk` は展開版の
 * 本物を呼ぶ）が、`continue` の並びだけはここに再現している。ずれていないことは
 * {@link crossCheckEnumeration} が**全ケースで**神託（本物の `enumerateHsWindows` の出力）と
 * 突き合わせて検算する。1 件でも食い違えば計測 1 は無効。
 */
function classifyPair(hs: HsInternals, ctx: DetectContext, p0: Pv, p4: Pv, isTop: boolean): PairOutcome {
	const pivots = ctx.pivots as unknown as Pv[];
	const shoulders = pivots.filter((p) => p.kind === (isTop ? 'H' : 'L'));
	const mids = pivots.filter((p) => p.kind === (isTop ? 'L' : 'H'));
	const p2 = hs.extremeBetween(shoulders, p0.idx, p4.idx, !isTop);
	if (!p2) return { ok: false, reason: 'no_head_between' };
	if (isTop ? !(p2.price > p0.price && p2.price > p4.price) : !(p2.price < p0.price && p2.price < p4.price)) {
		return { ok: false, reason: 'head_not_above_shoulders' };
	}
	const p1 = hs.extremeBetween(mids, p0.idx, p2.idx, isTop);
	if (!p1) return { ok: false, reason: 'valley1_missing' };
	const p3 = hs.extremeBetween(mids, p2.idx, p4.idx, isTop);
	if (!p3) return { ok: false, reason: 'valley2_missing' };
	if (!hs.outerShoulderOk(shoulders, p0, p0.idx, p1.idx, isTop)) return { ok: false, reason: 'outer_shoulder_left' };
	if (!hs.outerShoulderOk(shoulders, p4, p3.idx, p4.idx, isTop)) return { ok: false, reason: 'outer_shoulder_right' };
	const d = ctx.minDist;
	if (p1.idx - p0.idx < d || p2.idx - p1.idx < d || p3.idx - p2.idx < d || p4.idx - p3.idx < d) {
		return { ok: false, reason: 'min_dist' };
	}
	return { ok: true, win: { p0, p1, p2, p3, p4 } };
}

const winKey = (w: Win): string => [w.p0, w.p1, w.p2, w.p3, w.p4].map((p) => p.idx).join('-');

/**
 * {@link classifyPair} を `enumerateHsWindows` と同じ順序で全ペアに当て、出力が
 * 本物と**完全一致**することを確かめる。不一致なら計測 1 の帰属が信用できないので落とす。
 *
 * @returns 肩の組（`"p0.idx-p4.idx"`）→ 判定結果
 */
function crossCheckEnumeration(hs: HsInternals, ctx: DetectContext, isTop: boolean): Map<string, PairOutcome> {
	const pivots = ctx.pivots as unknown as Pv[];
	const shoulders = pivots.filter((p) => p.kind === (isTop ? 'H' : 'L'));
	const out = new Map<string, PairOutcome>();
	const mine: string[] = [];
	let pairs = 0;
	let capped = false;
	outer: for (let gap = 2; gap < shoulders.length; gap++) {
		for (let i = 0; i + gap < shoulders.length; i++) {
			if (++pairs > hs.HS_MAX_SHOULDER_PAIRS) {
				capped = true;
				break outer;
			}
			const p0 = shoulders[i];
			const p4 = shoulders[i + gap];
			const r = classifyPair(hs, ctx, p0, p4, isTop);
			out.set(`${p0.idx}-${p4.idx}`, r);
			if (r.ok) mine.push(winKey(r.win));
		}
	}
	const real = hs.enumerateHsWindows(ctx, isTop ? 'top' : 'bottom').map(winKey);
	if (mine.length !== real.length || mine.some((k, i) => k !== real[i])) {
		throw new Error(
			`窓の列挙が本物と食い違った（side=${isTop ? 'top' : 'bottom'} / 自前 ${mine.length} 件 / 本物 ${real.length} 件）。` +
				'計測 1 の帰属は無効なので、`classifyPair` を `enumerateHsWindows` の現行実装に合わせ直すこと。',
		);
	}
	if (capped) out.set('__capped__', { ok: false, reason: 'pair_cap' });
	return out;
}

// ── 計測 1: 右肩を取り直した候補 ──

/** #242 の経路ゲートが積む理由コード。 */
const PATH_GATE_REASONS = new Set(['peak_after_last_pivot', 'trough_after_last_pivot']);

interface RetakeRow {
	group: Group;
	series: string;
	tf: string;
	swingDepth: number | undefined;
	type: string;
	/** ゲートで落ちた元の 5 点 */
	original: number[];
	breakoutIdx: number;
	/** 右肩とブレイクの間の同種ピボット（`offender`） */
	offenders: number[];
	/** 取り直した右肩（ブレイク直前の同種ピボット） */
	retakenShoulder: number;
	/** 取り直した 5 点（頭・谷1・谷2 は据え置き） */
	target: number[];
	/** その 5 点が `enumerateHsWindows` の窓になるか */
	targetIsWindow: boolean;
	/** 窓にならないとき、肩の組 `(p0, 取り直した右肩)` が**実際に作る**窓（無ければ `null`） */
	actualWindow: number[] | null;
	/** 肩の組が窓にすらならないときの理由 */
	pairReject: PairReject | null;
	/** `target` と `actualWindow` で食い違う構成点の役割 */
	diffRoles: string[];
	/** 実際に作られた窓の行方（`view=debug` の `reason` / accepted） */
	actualOutcome: string;
	/** 実際に作られた窓が出力に出たときの `status` */
	actualStatus: string | null;
	/** 取り直した 5 点が `pivots` 上で連続しているか（relaxed 経路が組める条件） */
	targetConsecutiveInPivots: boolean;
}

/** `view=debug` の候補を `indices` で引けるようにする。1 つの窓に 2 行付くことがある。 */
function indexDebug(dbg: CandDebugEntry[]): Map<string, CandDebugEntry[]> {
	const m = new Map<string, CandDebugEntry[]>();
	for (const d of dbg) {
		const k = (d.indices ?? []).join('-');
		const cur = m.get(k);
		if (cur) cur.push(d);
		else m.set(k, [d]);
	}
	return m;
}

/** 候補 1 件ぶんの行方を 1 行の文字列にする（`accepted` / 理由コードの列）。 */
function describeOutcome(entries: CandDebugEntry[] | undefined): string {
	if (!entries || entries.length === 0) return '（候補に現れない）';
	return entries
		.map((d) => (d.accepted ? `accepted${d.reason ? `(${d.reason})` : ''}` : (d.reason ?? 'unknown')))
		.join(' → ');
}

const ROLES = ['左肩', '谷1', '頭', '谷2', '右肩'];

function collectRetakeRows(hs: HsInternals, spec: CaseSpec): RetakeRow[] {
	const dbg: CandDebugEntry[] = [];
	const ctx = buildCtx(spec, dbg);
	const res = hs.detectHeadAndShoulders(ctx);
	const byIdx = indexDebug(dbg);
	const pivots = ctx.pivots as unknown as Pv[];
	const statusOf = new Map<string, string>();
	for (const p of res.patterns) {
		const pv = (p as { pivots?: Pv[] }).pivots;
		if (Array.isArray(pv)) statusOf.set(pv.map((q) => q.idx).join('-'), String(p.status ?? 'completed'));
	}
	const pairsTop = crossCheckEnumeration(hs, ctx, true);
	const pairsBottom = crossCheckEnumeration(hs, ctx, false);

	const rows: RetakeRow[] = [];
	for (const d of dbg) {
		if (!d.reason || !PATH_GATE_REASONS.has(d.reason)) continue;
		const idxs = d.indices ?? [];
		if (idxs.length !== 5) continue;
		const details = (d.details ?? {}) as { breakoutIdx?: number };
		const breakoutIdx = Number(details.breakoutIdx);
		if (!Number.isFinite(breakoutIdx)) continue;
		const isTop = d.type === 'head_and_shoulders';
		const kind = isTop ? 'H' : 'L';
		const last = idxs[4];
		const offenders = pivots.filter((p) => p.kind === kind && p.idx > last && p.idx < breakoutIdx).map((p) => p.idx);
		if (offenders.length === 0) continue;
		const retaken = offenders[offenders.length - 1];
		const target = [idxs[0], idxs[1], idxs[2], idxs[3], retaken];
		const pairMap = isTop ? pairsTop : pairsBottom;
		const outcome = pairMap.get(`${idxs[0]}-${retaken}`);
		const actual = outcome?.ok
			? [outcome.win.p0, outcome.win.p1, outcome.win.p2, outcome.win.p3, outcome.win.p4].map((p) => p.idx)
			: null;
		const diffRoles = actual === null ? [] : ROLES.filter((_, i) => actual[i] !== target[i]);
		const actualKey = actual === null ? '' : actual.join('-');
		const order = pivots.map((p) => p.idx);
		const pos = target.map((i) => order.indexOf(i));
		rows.push({
			group: spec.series.group,
			series: spec.series.name,
			tf: spec.tf,
			swingDepth: spec.swingDepth,
			type: String(d.type),
			original: idxs,
			breakoutIdx,
			offenders,
			retakenShoulder: retaken,
			target,
			targetIsWindow: actual !== null && actualKey === target.join('-'),
			actualWindow: actual,
			pairReject: outcome === undefined ? null : outcome.ok ? null : outcome.reason,
			diffRoles,
			actualOutcome: actual === null ? '（肩の組が窓にならない）' : describeOutcome(byIdx.get(actualKey)),
			actualStatus: actual === null ? null : (statusOf.get(actualKey) ?? null),
			targetConsecutiveInPivots: pos.every((v, i) => v >= 0 && (i === 0 || v === pos[i - 1] + 1)),
		});
	}
	return rows;
}

// ── 計測 2 / 3: バー数の分布 ──

interface BarRow {
	group: Group;
	series: string;
	tf: string;
	swingDepth: number | undefined;
	type: string;
	idxs: number[];
	breakoutIdx: number;
	/** 最終構成点 → ブレイク */
	lastToBreak: number;
	/** 第1構成点 → 最終構成点（H&S なら左肩 → 右肩） */
	firstToLast: number;
	/** 最終構成点とブレイクの間の同種ピボット数 */
	betweenPivots: number;
}

const HS_TYPES = new Set(['head_and_shoulders', 'inverse_head_and_shoulders']);
const TRIPLE_TYPES = new Set(['triple_top', 'triple_bottom']);

/** accepted（`completed` / status 無し）。`detect_patterns.ts` のライフサイクル分類と同じ。 */
function isAccepted(p: DeduplicablePattern): boolean {
	return p.status === 'completed' || !p.status;
}

function collectBarRows(detector: Detector, spec: CaseSpec, types: Set<string>): BarRow[] {
	const dbg: CandDebugEntry[] = [];
	const ctx = buildCtx(spec, dbg);
	const pivots = ctx.pivots as unknown as Pv[];
	const out: BarRow[] = [];
	for (const p of detector(ctx).patterns) {
		if (!types.has(String(p.type)) || !isAccepted(p)) continue;
		const pv = (p as { pivots?: Pv[] }).pivots;
		const breakoutIdx = Number((p as { breakoutBarIndex?: number }).breakoutBarIndex);
		if (!Array.isArray(pv) || pv.length < 2 || !Number.isFinite(breakoutIdx)) continue;
		const first = pv[0];
		const last = pv[pv.length - 1];
		const kind = last.kind;
		out.push({
			group: spec.series.group,
			series: spec.series.name,
			tf: spec.tf,
			swingDepth: spec.swingDepth,
			type: String(p.type),
			idxs: pv.map((q) => q.idx),
			breakoutIdx,
			lastToBreak: breakoutIdx - last.idx,
			firstToLast: last.idx - first.idx,
			betweenPivots: pivots.filter((q) => q.kind === kind && q.idx > last.idx && q.idx < breakoutIdx).length,
		});
	}
	return out;
}

/** 構造の同一性キー（オプション 8 通り・同じピボット列を生む `swingDepth` の重複を畳む）。 */
function barStructureKey(r: BarRow): string {
	return `${r.series}|${r.tf}|${r.type}|${r.idxs.join('-')}|${r.breakoutIdx}`;
}

function foldBarRows(rows: BarRow[]): BarRow[] {
	const m = new Map<string, BarRow>();
	for (const r of rows) if (!m.has(barStructureKey(r))) m.set(barStructureKey(r), r);
	return [...m.values()];
}

/** 昇順ソート済み配列の百分位（最近傍・線形補間なし）。空なら `null`。 */
function pctl(sorted: number[], q: number): number | null {
	if (sorted.length === 0) return null;
	const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
	return sorted[i];
}

interface Dist {
	n: number;
	min: number | null;
	p25: number | null;
	p50: number | null;
	p75: number | null;
	max: number | null;
	/** 上限に張り付いた件数（`>= cap`） */
	atCap: number;
}

function dist(values: number[], cap: number): Dist {
	const s = [...values].sort((a, b) => a - b);
	return {
		n: s.length,
		min: s.length ? s[0] : null,
		p25: pctl(s, 0.25),
		p50: pctl(s, 0.5),
		p75: pctl(s, 0.75),
		max: s.length ? s[s.length - 1] : null,
		atCap: s.filter((v) => v >= cap).length,
	};
}

// ── 出力 ──

const num = (v: number | null): string => (v === null ? '—' : String(v));
const sd = (v: number | undefined): string => (v === undefined ? 'auto' : String(v));

function sectionBarDist(rows: BarRow[], cap: number, formingMax: (tf: string) => number): string[] {
	if (rows.length === 0) return ['**該当 0 件。**', ''];
	const out: string[] = [];
	const tfs = [...new Set(rows.map((r) => r.tf))].sort();
	const types = [...new Set(rows.map((r) => r.type))].sort();
	out.push(`最終構成点 → ブレイクのバー数（上限 ${cap}）。`, '');
	out.push(
		'| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | 上限張り付き |',
		'|---|---|---:|---:|---:|---:|---:|---:|---:|',
	);
	for (const t of types) {
		for (const tf of tfs) {
			const sub = rows.filter((r) => r.type === t && r.tf === tf);
			if (sub.length === 0) continue;
			const d = dist(
				sub.map((r) => r.lastToBreak),
				cap,
			);
			out.push(
				`| ${t} | ${tf} | ${d.n} | ${num(d.min)} | ${num(d.p25)} | ${num(d.p50)} | ${num(d.p75)} | ${num(d.max)} | ${d.atCap} |`,
			);
		}
	}
	out.push(
		'',
		'第1構成点 → 最終構成点のバー数（H&S なら左肩 → 右肩）。`forming maxBars` は形成中経路が課している上限。',
		'',
	);
	out.push(
		'| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | forming maxBars | 超過 |',
		'|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
	);
	for (const t of types) {
		for (const tf of tfs) {
			const sub = rows.filter((r) => r.type === t && r.tf === tf);
			if (sub.length === 0) continue;
			const fm = formingMax(tf);
			const d = dist(
				sub.map((r) => r.firstToLast),
				fm,
			);
			out.push(
				`| ${t} | ${tf} | ${d.n} | ${num(d.min)} | ${num(d.p25)} | ${num(d.p50)} | ${num(d.p75)} | ${num(d.max)} | ${fm} | ${sub.filter((r) => r.firstToLast > fm).length} |`,
			);
		}
	}
	out.push('', '最終構成点とブレイクの間の同種ピボット数。', '');
	out.push('| type | 時間足 | 0 | 1 | 2 | 3+ |', '|---|---|---:|---:|---:|---:|');
	for (const t of types) {
		for (const tf of tfs) {
			const sub = rows.filter((r) => r.type === t && r.tf === tf);
			if (sub.length === 0) continue;
			const c = (f: (n: number) => boolean) => sub.filter((r) => f(r.betweenPivots)).length;
			out.push(
				`| ${t} | ${tf} | ${c((n) => n === 0)} | ${c((n) => n === 1)} | ${c((n) => n === 2)} | ${c((n) => n >= 3)} |`,
			);
		}
	}
	out.push('');
	return out;
}

function sectionRetake(rows: RetakeRow[]): string[] {
	if (rows.length === 0) return ['**該当 0 件**（#242 の経路ゲートで落ちた完成済み候補が無い）。', ''];
	const out: string[] = [];
	const structures = new Map<string, RetakeRow>();
	for (const r of rows) {
		const k = `${r.series}|${r.tf}|${r.type}|${r.original.join('-')}|${r.retakenShoulder}`;
		if (!structures.has(k)) structures.set(k, r);
	}
	const folded = [...structures.values()];
	out.push(`延べ ${rows.length} 行 / 構造 ${folded.length} 件。`, '');
	const isWin = folded.filter((r) => r.targetIsWindow).length;
	out.push(`- 取り直した 5 点が**そのまま窓になる**: ${isWin} / ${folded.length}`);
	const causes = new Map<string, number>();
	for (const r of folded) {
		if (r.targetIsWindow) continue;
		const cause =
			r.actualWindow === null
				? `肩の組（左肩 × 取り直した右肩）が窓にならない: \`${r.pairReject ?? '不明'}\``
				: `肩の組は窓になるが構成点が別物になる（${r.diffRoles.join(' / ')} を \`extremeBetween\` が別の点に取る）`;
		causes.set(cause, (causes.get(cause) ?? 0) + 1);
	}
	if (causes.size > 0) {
		out.push('- 窓にならない内訳:');
		for (const [k, v] of [...causes.entries()].sort((a, b) => b[1] - a[1])) out.push(`  - ${k} — ${v} 件`);
	}
	out.push('');
	out.push(
		'| 系列 / 時間足 / swingDepth | type | 元の 5 点 | ブレイク | 取り直した右肩 | 取り直した 5 点 | 窓か | 肩の組が実際に作る窓 | その窓の行方 |',
		'|---|---|---|---:|---:|---|---|---|---|',
	);
	for (const r of folded) {
		out.push(
			`| ${r.series} / ${r.tf} / ${sd(r.swingDepth)} | ${r.type} | \`${r.original.join('-')}\` | ${r.breakoutIdx} | ${r.retakenShoulder} | \`${r.target.join('-')}\` | ${r.targetIsWindow ? 'なる' : `ならない（${r.actualWindow === null ? (r.pairReject ?? '不明') : `${r.diffRoles.join('/')} が別の点`}）`} | ${r.actualWindow === null ? '—' : `\`${r.actualWindow.join('-')}\``} | ${r.actualOutcome}${r.actualStatus ? ` / status=${r.actualStatus}` : ''} |`,
		);
	}
	out.push('');
	const relaxable = folded.filter((r) => r.targetConsecutiveInPivots).length;
	out.push(
		`relaxed 経路は \`pivots\` 上で**連続する 5 点**しか組まない。取り直した 5 点がその条件を満たす構造: ${relaxable} / ${folded.length}。`,
		'',
	);
	return out;
}

// ── main ──

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const jsonAt = argv.indexOf('--json');
	const jsonPath = jsonAt >= 0 ? argv[jsonAt + 1] : undefined;
	const revAt = argv.indexOf('--baseline-rev');
	const baselineRev = revAt >= 0 ? argv[revAt + 1] : DEFAULT_BASELINE_REV;

	const worktree = await loadHsInternals('worktree', false);
	const baselineHs = await loadHsInternals(baselineRev, baselineRev !== 'worktree');
	const baselineTriple = await loadTripleDetector(baselineRev, baselineRev !== 'worktree');

	const corpora = await buildCorpus();
	const lines: string[] = [];
	let cases = 0;
	let mismatches = 0;

	lines.push('# 完成済み H&S の右肩の取り方と探索窓の実測（issue #249 Phase 1）', '');
	lines.push(
		'`scripts/measure_hs_shoulder_window_249.ts` の出力をそのまま貼ったもの。',
		'**検出器のソースは 1 行も変更していない**——展開した複製の `detect_hs.ts` 末尾に',
		'`export { … }` を 1 行足して内部の窓生成（`enumerateHsWindows`）を本物のまま呼べるようにしただけで、',
		'判定は全て本物が行う。',
		'',
	);

	interface Payload {
		baselineRev: string;
		cases: number;
		mismatches: number;
		changedFiles: string[];
		retake: RetakeRow[];
		baselineHsBars: BarRow[];
		baselineTripleBars: BarRow[];
		afterHsBars: BarRow[];
	}
	const payload: Payload = {
		baselineRev,
		cases: 0,
		mismatches: 0,
		changedFiles: changedPatternFiles(baselineRev),
		retake: [],
		baselineHsBars: [],
		baselineTripleBars: [],
		afterHsBars: [],
	};

	const perCorpus: Array<{
		label: string;
		n: number;
		retake: RetakeRow[];
		baseHs: BarRow[];
		baseTriple: BarRow[];
		afterHs: BarRow[];
	}> = [];

	for (const { label, cases: specs } of corpora) {
		const retake: RetakeRow[] = [];
		const baseHs: BarRow[] = [];
		const baseTriple: BarRow[] = [];
		const afterHs: BarRow[] = [];
		for (const spec of specs) {
			cases++;
			// 0 章の検算: 展開版（export を足した版）が作業ツリーの本物と全キー一致すること。
			const dbgA: CandDebugEntry[] = [];
			const dbgB: CandDebugEntry[] = [];
			const a = JSON.stringify(worktree.detectHeadAndShoulders(buildCtx(spec, dbgA)));
			const b = JSON.stringify(realDetectHs(buildCtx(spec, dbgB)));
			if (a !== b) mismatches++;

			retake.push(...collectRetakeRows(worktree, spec));
			baseHs.push(...collectBarRows(baselineHs.detectHeadAndShoulders, spec, HS_TYPES));
			baseTriple.push(...collectBarRows(baselineTriple, spec, TRIPLE_TYPES));
			afterHs.push(...collectBarRows(worktree.detectHeadAndShoulders, spec, HS_TYPES));
		}
		perCorpus.push({ label, n: specs.length, retake, baseHs, baseTriple, afterHs });
		payload.retake.push(...retake);
		payload.baselineHsBars.push(...baseHs);
		payload.baselineTripleBars.push(...baseTriple);
		payload.afterHsBars.push(...afterHs);
	}
	payload.cases = cases;
	payload.mismatches = mismatches;

	lines.push('## 0. ハーネスと検算', '');
	lines.push('| 項目 | 値 |', '|---|---:|');
	lines.push(`| ベースラインのリビジョン（計測 2） | \`${baselineRev}\` |`);
	lines.push(`| ケース数 | ${cases} |`);
	lines.push(`| **export を足した複製が本物と食い違ったケース** | **${mismatches}** |`);
	lines.push(`| \`HS_BREAKOUT_MAX_BARS\`（作業ツリー） | ${worktree.HS_BREAKOUT_MAX_BARS} |`);
	lines.push(`| \`HS_MAX_SHOULDER_PAIRS\`（作業ツリー） | ${worktree.HS_MAX_SHOULDER_PAIRS} |`);
	lines.push('');
	lines.push(
		`ベースラインと作業ツリーで差があるファイル: ${payload.changedFiles.length === 0 ? '（なし）' : payload.changedFiles.map((f) => `\`${f}\``).join(' , ')}`,
		'',
		'窓の列挙（`enumerateHsWindows`）と `classifyPair` の突き合わせは**全ケースで実行**しており、',
		'1 件でも食い違えばスクリプトが例外で落ちる（ここまで到達している時点で一致している）。',
		'',
	);

	for (const c of perCorpus) {
		lines.push(`## ${c.label}（${c.n} ケース）`, '');
		lines.push('### 計測 1: 右肩を「ブレイク直前の同種ピボット」に取り直した候補の行方（#242 後）', '');
		lines.push(...sectionRetake(c.retake));
		lines.push('### 計測 2-a: #242 前に accepted だった完成済み H&S / 逆 H&S のバー数分布', '');
		lines.push(
			...sectionBarDist(
				foldBarRows(c.baseHs),
				worktree.HS_BREAKOUT_MAX_BARS,
				(tf) => getHsFormingBarParams(tf).maxBars,
			),
		);
		lines.push('### 計測 2-b: 同じ表を triple（`MAX_BARS_FROM_EXTREMUM = 20`）で', '');
		lines.push(...sectionBarDist(foldBarRows(c.baseTriple), 20, (tf) => getTripleFormingBarParams(tf).maxBars));
		lines.push('### 計測 3: #242 後に accepted で残っている完成済み H&S / 逆 H&S', '');
		lines.push(
			...sectionBarDist(
				foldBarRows(c.afterHs),
				worktree.HS_BREAKOUT_MAX_BARS,
				(tf) => getHsFormingBarParams(tf).maxBars,
			),
		);
	}

	const text = lines.join('\n');
	console.log(text);
	if (jsonPath) {
		writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
		console.error(`\n[json] ${jsonPath}`);
	}
}

await main();
