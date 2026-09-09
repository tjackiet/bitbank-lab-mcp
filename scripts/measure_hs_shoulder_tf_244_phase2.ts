/**
 * issue #244 Phase 2: **実装値**での再計測（`HS_SHOULDER_MAX_PCT` の時間足別化）。
 *
 * Phase 1（`scripts/measure_level_pct_tf_244.ts`）の候補ビルドは `structural.ts` の
 * **定数リテラルを差し替えた ablation** だったので、`HS_SHOULDER_MAX_PCT` を読む
 * **2 箇所（肩ゲートと窓生成 `outerShoulderOk`）が同時に締まる**。実装はそうなっていない:
 *
 * | 使用箇所 | Phase 1 の候補ビルド | 実装（本スクリプトの `after`） |
 * |---|---|---|
 * | 肩ゲート（strict 2 + relaxed 2） | 候補値（`1hour` 0.830%） | **`ctx.hsShoulderMaxPct`（`1hour` 1.04%）** |
 * | 窓生成（`enumerateHsWindows` → `outerShoulderOk`） | 候補値（`1hour` 0.830%） | **5%（据え置き）** |
 * | `tolerancePct` | 候補値（`1hour` 0.830%） | **不変**（`getDefaultToleranceForTf`） |
 * | `DOUBLE_LEVEL_MAX_PCT` | 候補値 | **不変**（3%） |
 *
 * **閾値も条件も違うので Phase 1 の結果をそのまま引き継げない。** 本スクリプトは実装後の
 * 作業ツリーと実装前（`--before-ref`、既定 `origin/main`）を同じコーパスで走らせて差分を出す。
 *
 * ## 出すもの（依頼文の「実装前に測ること」1〜5）
 *
 * 1. `getHsShoulderMaxPctForTf` の表と、ATR 比 × アンカー 0.05 との一致検算
 * 2. type 別・時間足別の accepted 増減表（コーパスごと。プールしない #219）
 * 3. 落ちた構造の 1 件ずつの明細（肩 `relDiff`・構成点・Phase 1.5 §10 の形との対応）
 * 4. **0.830%（Phase 1 の候補値）と 1.040%（実装値）の間**にある構造の明細
 * 5. 窓生成が 5% のままであることの確認——落ちた構造が `view=debug` の候補として
 *    **残り**、`shoulders_not_near:{cap,both}` の理由コードが付いていること
 * 6. relaxed accepted の before / after（Phase 1 結果 5 の再確認）
 * 7. `1day` 以上が 0 件差であること
 *
 * ## ハーネス
 *
 * `measure_level_pct_tf_244.ts` と**同じコーパス・同じ `DetectContext` の組み方**。違いは
 * ビルドの作り方だけで、定数リテラルの書き換え（ablation）はしない:
 *
 * - **`after`**: 作業ツリーの `tools/patterns/` をそのまま一時領域へ展開したもの
 * - **`before`**: 同じ木を `--before-ref` の内容で展開したもの
 *
 * どちらも「1 バイトも書き換えない展開」なので、Phase 1 の `base` ビルドと同じ検算
 * （作業ツリーの本物と JSON 全キー一致）が `after` に対して成り立つ。`before` は
 * `hsShoulderMaxPct` を読まないビルドなので、その検算は `after` にだけ掛ける。
 *
 * **作業ツリーは 1 バイトも変えない。** 展開先は `mkdtemp` の一時ディレクトリ。
 *
 * ## 使い方
 *
 * ```bash
 * npx tsx scripts/measure_hs_shoulder_tf_244_phase2.ts
 * npx tsx scripts/measure_hs_shoulder_tf_244_phase2.ts --before-ref origin/main --json /tmp/244p2.json
 * ```
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
import { getHsShoulderMaxPctForTf, getSizeThresholdsForTf, resolveParams } from '../tools/patterns/config.js';
import { detectHeadAndShoulders as realDetectHs } from '../tools/patterns/detect_hs.js';
import { linearRegressionWithR2, near as nearFn, pct as pctFn } from '../tools/patterns/regression.js';
import { type Candle, detectSwingPoints, filterPeaks, filterValleys, type Pivot } from '../tools/patterns/swing.js';
import type { CandDebugEntry, DeduplicablePattern, DetectContext } from '../tools/patterns/types.js';

const ROOT = resolve(import.meta.dirname, '..');
const TMP_DIR = mkdtempSync(join(tmpdir(), 'hs-shoulder-tf-244p2-'));

type Detector = (ctx: DetectContext) => { patterns: DeduplicablePattern[] };

/** 1 ビルドぶんの検出器。**H&S しか動かないはずなので H&S 以外も回して確かめる。** */
interface Build {
	tag: string;
	detectDoubles: Detector;
	detectTriples: Detector;
	detectHeadAndShoulders: Detector;
	/** そのビルドの `structural.ts` が持つ肩の上限（`before` / `after` とも 0.05 のはず） */
	HS_SHOULDER_MAX_PCT: number;
}

// ── ATR 比テーブル（`config.ts` の docstring / Phase 1 と同一。検算用） ──

/**
 * 1day を 1.0 とした ATR 比。**`config.ts` の `getSizeThresholdsForTf` の docstring の表と同一。**
 * 新たに ATR を測り直してはいない（#152 が測定 / 推定済みの値。#198 / #244 Phase 1 と同じ流儀）。
 */
const ATR_RATIO: Readonly<Record<string, number>> = {
	'1min': 0.0264,
	'5min': 0.0589,
	'15min': 0.1021,
	'30min': 0.1443,
	'1hour': 0.2073,
	'4hour': 0.4082,
	'8hour': 0.5774,
	// biome-ignore lint/suspicious/noApproximativeNumericConstant: config.ts の docstring の表と同じ 4 桁の値を持つのが本テーブルの要件。Math.SQRT1_2 に置き換えると出典と字面が食い違う
	'12hour': 0.7071,
};

/** `1day` 以上は 1.0（据え置き）。表に無い時間足も 1.0 に畳む。 */
function atrRatio(tf: string): number {
	return ATR_RATIO[String(tf)] ?? 1.0;
}

/** BTC/JPY の 1day ATR（#152 の実測値）。ATR 換算の基準。 */
const ATR_1DAY_PCT = 0.0275;

/** `config.ts` の各表と同じ 4 桁丸め。 */
function round4(v: number): number {
	return Math.round(v * 1e4) / 1e4;
}

/** 表に出す時間足の並び（`config.ts` の docstring の表と同じ順）。 */
const TF_TABLE_ORDER: readonly string[] = [
	'1min',
	'5min',
	'15min',
	'30min',
	'1hour',
	'4hour',
	'8hour',
	'12hour',
	'1day',
	'1week',
	'1month',
];

/** Phase 1 の候補値（アンカー 0.05 × ATR 比を**そのまま**当てたもの）。実装値と一致するが由来が違う。 */
function phase1CandidateHs(tf: string): number {
	const r = atrRatio(tf);
	return r < 1 ? round4(0.05 * r) : 0.05;
}

// ── ビルドの展開 ──

/**
 * `tools/patterns/` を**ディレクトリごと**一時領域へ展開する
 * （`measure_level_pct_tf_244.ts` の同名関数と同じ流儀。**書き換えは import パスだけ**）。
 *
 * `ref` が `null` なら作業ツリーの内容、文字列なら `git show <ref>:<path>` の内容を書く。
 */
function materializePatternsDir(tag: string, ref: string | null): string {
	const listRef = ref ?? 'HEAD';
	const files = execFileSync('git', ['ls-tree', '-r', '--name-only', listRef, '--', 'tools/patterns/'], {
		cwd: ROOT,
		encoding: 'utf8',
	})
		.split('\n')
		.map((s) => s.trim())
		.filter((s) => s.endsWith('.ts'));
	if (files.length === 0) throw new Error(`${listRef} の tools/patterns/ に .ts が 1 つも無い。`);

	// `git ls-tree -r` は再帰なので、将来サブディレクトリができるとネストしたパスが返る。
	// 下の import 書き換えはフラット前提なので、**書き込む前に落とす**（PR #250 のレビュー指摘）。
	const nested = files.find((p) => p.slice('tools/patterns/'.length).includes('/'));
	if (nested !== undefined) {
		throw new Error(`tools/patterns/ にサブディレクトリがある（${nested}）。本関数の import 書き換えはフラット前提。`);
	}

	const dir = join(TMP_DIR, `patterns_${tag}`);
	mkdirSync(dir, { recursive: true });
	// 拡張子 `.ts` のまま ESM として読ませるための最小マニフェスト（一時ディレクトリには親が無い）。
	writeFileSync(join(dir, 'package' + '.json'), '{ "type": "module" }\n');

	for (const path of files) {
		const name = path.slice('tools/patterns/'.length);
		const src =
			ref === null
				? readFileSync(join(ROOT, path), 'utf8')
				: execFileSync('git', ['show', `${ref}:${path}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
		const rewritten = src
			// ディレクトリ外への import は作業ツリーの絶対パスへ。
			.replace(/from '\.\.\/\.\.\//g, `from '${ROOT}/`)
			// `../patterns/` は**同ディレクトリの別名**。下の汎用 `../` 規則より先に畳む。
			.replace(/from '\.\.\/patterns\//g, "from './")
			.replace(/from '\.\.\//g, `from '${ROOT}/tools/`);
		// `from './` は書き換えない——展開先の中で解決させるのが本関数の目的。
		writeFileSync(join(dir, name), rewritten);
	}
	return dir;
}

/** 1 ビルドぶんの検出器を、**同じ展開ディレクトリから**読む。 */
async function loadBuild(tag: string, ref: string | null): Promise<Build> {
	const dir = materializePatternsDir(tag, ref);
	const url = (f: string) => pathToFileURL(join(dir, f)).href;
	const doubles = (await import(url('detect_doubles.ts'))) as { detectDoubles: Detector };
	const triples = (await import(url('detect_triples.ts'))) as { detectTriples: Detector };
	const hs = (await import(url('detect_hs.ts'))) as { detectHeadAndShoulders: Detector };
	const structural = (await import(url('structural.ts'))) as { HS_SHOULDER_MAX_PCT: number };
	return {
		tag,
		detectDoubles: doubles.detectDoubles,
		detectTriples: triples.detectTriples,
		detectHeadAndShoulders: hs.detectHeadAndShoulders,
		HS_SHOULDER_MAX_PCT: structural.HS_SHOULDER_MAX_PCT,
	};
}

/**
 * 2 つのビルドが**本当に実装前 / 実装後**であることを、ソースの字面で確かめる。
 *
 * 展開だけで書き換えをしないハーネスなので、ref を取り違えると「差分 0 件」が
 * 「変更が効いていない」ではなく「同じ木を 2 回読んだ」を意味してしまう。
 */
function assertBuildsDiffer(beforeRef: string): void {
	const afterSrc = readFileSync(join(ROOT, 'tools/patterns/detect_hs.ts'), 'utf8');
	const beforeSrc = execFileSync('git', ['show', `${beforeRef}:tools/patterns/detect_hs.ts`], {
		cwd: ROOT,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	});
	if (!afterSrc.includes('ctx.hsShoulderMaxPct')) {
		throw new Error(
			'作業ツリーの detect_hs.ts が `ctx.hsShoulderMaxPct` を読んでいない。実装前の木で after を名乗っている。',
		);
	}
	if (beforeSrc.includes('ctx.hsShoulderMaxPct')) {
		throw new Error(
			`${beforeRef} の detect_hs.ts が既に \`ctx.hsShoulderMaxPct\` を読んでいる。before の ref を取り違えている。`,
		);
	}
	// 窓生成が 5% のままであることも字面で固定する（本 PR の宿題 1 の判断）。
	if (!afterSrc.includes('isSameLevel(outer.price, shoulder.price, HS_SHOULDER_MAX_PCT)')) {
		throw new Error(
			'作業ツリーの `outerShoulderOk` が `HS_SHOULDER_MAX_PCT` を読んでいない。窓生成の据え置きが崩れている。',
		);
	}
}

// ── コーパス（Phase 1 と同一。#242 / #243 / #249 と同じ組み方） ──

type Group = 'synthetic' | 'realA' | 'realB' | 'realC' | 'realD';

interface Series {
	group: Group;
	name: string;
	candles: Candle[];
	/** 元 fixture の先頭から数えた、この系列の先頭バーの添字。**窓を切ったときだけ非 0**。 */
	idxOffset?: number;
	/** 構造を畳むときの系列名。窓長スイープでは窓を跨いで畳めるよう元 fixture 名を入れる。 */
	foldName?: string;
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

/** MCP の統合オプション 3 つの全組み合わせ（ケース数の単位を Phase 1 と揃える）。 */
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

/** 実データ C の窓長スイープで使う窓の本数。**Phase 1 / #227 と同じ値。** */
const REAL_C_WINDOW_LENGTHS: readonly number[] = [60, 90, 120, 150, 200, 250, 300, 365];

/** 実データ C の末尾 N 本の窓 × `swingDepth` 4 種 × オプション 8 通り。時間足はネイティブの `1hour` 固定。 */
function buildRealCWindows(full: Series): CaseSpec[] {
	const out: CaseSpec[] = [];
	for (const n of REAL_C_WINDOW_LENGTHS) {
		const offset = full.candles.length - n;
		if (offset < 0) throw new Error(`窓長 ${n} が系列長 ${full.candles.length} を超えている`);
		const series: Series = {
			group: 'realC',
			name: `${full.name}@last${n}`,
			foldName: full.name,
			candles: full.candles.slice(offset),
			idxOffset: offset,
		};
		for (const swingDepth of [undefined, 2, 3, 6]) {
			for (const opts of OPTS8) out.push({ series, tf: '1hour', swingDepth, opts });
		}
	}
	return out;
}

interface Corpus {
	label: string;
	/** 時間足別の結論を出してよい母集団か（#178: 実データ A の tf ラベルは独立系列ではない） */
	tfAuthoritative: boolean;
	cases: CaseSpec[];
}

/** 標準コーパス 800（合成 704 + 実データ A 96）と実データ B / C / D。**プールしない**（#219）。 */
async function buildCorpus(): Promise<Corpus[]> {
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
	const out: Corpus[] = [
		{ label: `標準コーパス ${standard.length}（合成 704 + 実データ A 96）`, tfAuthoritative: false, cases: standard },
		{
			label: '実データ B 96（`btc_jpy_1hour_2026_08`）',
			tfAuthoritative: true,
			cases: realCases({
				group: 'realB',
				name: 'btc_jpy_1hour_2026_08',
				candles: buildBtcJpy1hour202608Candles() as Candle[],
			}),
		},
		{
			label: '実データ C 96（`btc_jpy_1hour_2026_09`）',
			tfAuthoritative: true,
			cases: realCases({
				group: 'realC',
				name: 'btc_jpy_1hour_2026_09',
				candles: buildBtcJpy1hour202609Candles() as Candle[],
			}),
		},
	];
	const realD = await loadRealD();
	if (realD) {
		out.push({ label: '実データ D 96（`btc_jpy_1hour_2026_09_05`）', tfAuthoritative: true, cases: realCases(realD) });
	}
	const realCFull: Series = {
		group: 'realC',
		name: 'btc_jpy_1hour_2026_09',
		candles: buildBtcJpy1hour202609Candles() as Candle[],
	};
	const windows = buildRealCWindows(realCFull);
	out.push({
		label: `実データ C 窓長スイープ ${windows.length}（\`btc_jpy_1hour_2026_09\` の末尾 ${REAL_C_WINDOW_LENGTHS.join(' / ')} 本 × 1hour）`,
		tfAuthoritative: true,
		cases: windows,
	});
	return out;
}

/** `detect_patterns.ts` と同じ順序で `DetectContext` を組む（Phase 1 の同名関数 + `hsShoulderMaxPct`）。 */
function buildCtx(spec: CaseSpec, debugCandidates: CandDebugEntry[]): DetectContext {
	const { candles } = spec.series;
	const resolved = resolveParams(spec.tf, spec.swingDepth === undefined ? {} : { swingDepth: spec.swingDepth });
	const pivots = detectSwingPoints(candles, { swingDepth: resolved.swingDepth, strictPivots: true });
	const tolerancePct = resolved.tolerancePct;
	return {
		candles,
		pivots,
		allPeaks: filterPeaks(pivots),
		allValleys: filterValleys(pivots),
		tolerancePct,
		headProminencePct: resolved.headProminencePct,
		sizeThresholds: getSizeThresholdsForTf(spec.tf),
		// `before` ビルドはこのキーを読まない（実装前なので存在しない）。同じ ctx を両方に渡すのは、
		// **入力を完全に揃えたうえで検出器側の差だけを見る**ため。
		hsShoulderMaxPct: getHsShoulderMaxPctForTf(spec.tf),
		minDist: resolved.minBarsBetweenSwings,
		want: new Set(),
		includeForming: spec.opts.includeForming,
		debugCandidates,
		type: spec.tf,
		swingDepth: resolved.swingDepth,
		near: (a: number, b: number) => nearFn(a, b, tolerancePct),
		pct: pctFn,
		lrWithR2: linearRegressionWithR2,
		tz: 'Asia/Tokyo',
	};
}

// ── 構造の収集 ──

type Fam = 'double' | 'triple' | 'hs';

const TYPE_FAMILY: Readonly<Record<string, Fam>> = {
	double_top: 'double',
	double_bottom: 'double',
	triple_top: 'triple',
	triple_bottom: 'triple',
	head_and_shoulders: 'hs',
	inverse_head_and_shoulders: 'hs',
};

const TYPE_ORDER: readonly string[] = [
	'double_top',
	'double_bottom',
	'triple_top',
	'triple_bottom',
	'head_and_shoulders',
	'inverse_head_and_shoulders',
];

/** `structural.ts` の `relDiff` と同式（展開ビルドごとに参照を変えたくないのでここに置く）。 */
function relDiff(a: number, b: number): number {
	const max = Math.max(a, b);
	if (max === 0) return 0;
	return Math.abs(a - b) / max;
}

/** accepted（`completed` / status 無し）。`detect_patterns.ts` のライフサイクル分類と同じ。 */
function isAccepted(p: DeduplicablePattern): boolean {
	return p.status === 'completed' || !p.status;
}

interface Row {
	group: Group;
	/** 構造を畳むときの系列名（窓長スイープでは元 fixture 名）。 */
	series: string;
	seriesLabel: string;
	tf: string;
	swingDepth: number | undefined;
	type: string;
	fam: Fam;
	/** relaxed 経路で拾われたか（`_fallback`） */
	fallback: string | null;
	idxs: number[];
	/** H&S なら左肩 / 右肩、double なら 2 山、triple なら 3 点の価格 */
	mainPrices: number[];
	/** H&S の肩 `relDiff`（H&S 以外は同水準判定が見る量） */
	levelPct: number;
}

/** 主構成点（同水準であるべき点）を type から取り出す。 */
function mainPointsOf(fam: Fam, pivots: Pivot[]): Pivot[] {
	if (fam === 'double') return [pivots[0], pivots[2]];
	if (fam === 'triple') return [pivots[0], pivots[2], pivots[4]];
	return [pivots[0], pivots[4]]; // hs: 左肩 / 右肩
}

function levelPctOf(fam: Fam, main: Pivot[]): number {
	if (fam === 'triple') {
		return Math.max(
			relDiff(main[0].price, main[1].price),
			relDiff(main[1].price, main[2].price),
			relDiff(main[0].price, main[2].price),
		);
	}
	return relDiff(main[0].price, main[main.length - 1].price);
}

/** 1 ケースぶんの accepted な完成済みを 3 検出器から集める。 */
function collectRows(build: Build, spec: CaseSpec): Row[] {
	const dbg: CandDebugEntry[] = [];
	const ctx = buildCtx(spec, dbg);
	const patterns = [
		...build.detectDoubles(ctx).patterns,
		...build.detectTriples(ctx).patterns,
		...build.detectHeadAndShoulders(ctx).patterns,
	];
	const out: Row[] = [];
	for (const p of patterns) {
		const type = String(p.type ?? '');
		const fam = TYPE_FAMILY[type];
		if (!fam || !isAccepted(p)) continue;
		const pv = (p as { pivots?: Pivot[] }).pivots;
		const need = fam === 'double' ? 3 : 5;
		if (!Array.isArray(pv) || pv.length !== need) continue;
		const main = mainPointsOf(fam, pv);
		const off = spec.series.idxOffset ?? 0;
		out.push({
			group: spec.series.group,
			series: spec.series.foldName ?? spec.series.name,
			seriesLabel: spec.series.name,
			tf: spec.tf,
			swingDepth: spec.swingDepth,
			type,
			fam,
			fallback: typeof p._fallback === 'string' ? p._fallback : null,
			idxs: pv.map((q) => q.idx + off),
			mainPrices: main.map((q) => q.price),
			levelPct: levelPctOf(fam, main),
		});
	}
	return out;
}

/** 構造の同一性キー（オプション 8 通り・同じピボット列を生む `swingDepth` の重複を畳む）。 */
function structureKey(r: { series: string; tf: string; type: string; idxs: number[] }): string {
	return `${r.series}|${r.tf}|${r.type}|${r.idxs.join('-')}`;
}

function foldRows<T extends { series: string; tf: string; type: string; idxs: number[] }>(rows: T[]): T[] {
	const m = new Map<string, T>();
	for (const r of rows) if (!m.has(structureKey(r))) m.set(structureKey(r), r);
	return [...m.values()];
}

// ── relaxed の集計（Phase 1 / #227 と同じ定義） ──

const HS_TYPES = ['head_and_shoulders', 'inverse_head_and_shoulders'] as const;

interface RelaxedRow {
	tf: string;
	type: string;
	strictZero: boolean;
	relaxedFired: boolean;
	tag: string | null;
}

function collectRelaxedRows(build: Build, spec: CaseSpec): RelaxedRow[] {
	const dbg: CandDebugEntry[] = [];
	const ctx = buildCtx(spec, dbg);
	const patterns = build.detectHeadAndShoulders(ctx).patterns;
	return HS_TYPES.map((type) => {
		const ofType = patterns.filter((p) => p.type === type);
		const strict = ofType.filter((p) => !p._fallback && p.status !== 'forming');
		const relaxed = ofType.find((p) => !!p._fallback);
		return {
			tf: spec.tf,
			type,
			strictZero: strict.length === 0,
			relaxedFired: relaxed !== undefined,
			tag: relaxed ? String(relaxed._fallback) : null,
		};
	});
}

// ── 窓生成が 5% のままであることの確認（計測 5） ──

interface DebugTrace {
	/** その構造の 5 点が `view=debug` の候補として現れたか（= 窓生成を通過したか） */
	appearsInDebug: boolean;
	/** 現れたときの棄却理由（複数ケースで同じ窓が出るので集合） */
	reasons: string[];
	/** `details.shoulderMaxPct` の実測値（集合） */
	shoulderMaxPcts: number[];
}

/**
 * 指定した構造（系列 × tf × 5 点）が `after` ビルドの `debugCandidates` にどう出るかを引く。
 *
 * **窓生成を据え置いた（5%）ことの検証がこれ。** 窓生成まで締めていれば窓自体が作られず
 * `appearsInDebug=false`（無音）になる。据え置いていれば候補として現れ、肩ゲートの
 * `shoulders_not_near:{cap,both}` が理由として残る。
 */
function traceInDebug(build: Build, cases: CaseSpec[], row: Row): DebugTrace {
	const reasons = new Set<string>();
	const shoulderMaxPcts = new Set<number>();
	let appears = false;
	for (const spec of cases) {
		if ((spec.series.foldName ?? spec.series.name) !== row.series) continue;
		if (spec.tf !== row.tf) continue;
		const dbg: CandDebugEntry[] = [];
		const ctx = buildCtx(spec, dbg);
		build.detectHeadAndShoulders(ctx);
		const off = spec.series.idxOffset ?? 0;
		for (const e of dbg) {
			if (e.type !== row.type) continue;
			const idxs = (e.indices ?? []).map((v) => v + off);
			if (idxs.join('-') !== row.idxs.join('-')) continue;
			appears = true;
			if (e.reason) reasons.add(e.reason);
			const d = e.details as { shoulderMaxPct?: unknown } | undefined;
			if (typeof d?.shoulderMaxPct === 'number') shoulderMaxPcts.add(d.shoulderMaxPct);
		}
	}
	return {
		appearsInDebug: appears,
		reasons: [...reasons].sort(),
		shoulderMaxPcts: [...shoulderMaxPcts].sort((a, b) => a - b),
	};
}

// ── 出力ヘルパ ──

const pct3 = (v: number | null): string => (v === null ? '—' : `${(v * 100).toFixed(3)}%`);
const sd = (v: number | undefined): string => (v === undefined ? 'auto' : String(v));
const jpy = (v: number): string => Math.round(v).toLocaleString('en-US');

interface CorpusResult {
	label: string;
	tfAuthoritative: boolean;
	n: number;
	before: Row[];
	after: Row[];
	gone: Row[];
	added: Row[];
	relaxedBefore: RelaxedRow[];
	relaxedAfter: RelaxedRow[];
	/** 落ちた構造 1 件ずつの debug トレース（計測 5） */
	traces: Map<string, DebugTrace>;
	/** 肩 `relDiff` が Phase 1 候補 0.830% と実装値 1.040% の間にある `1hour` の H&S 構造（計測 4） */
	betweenBand: Row[];
}

function runCorpus(corpus: Corpus, before: Build, after: Build): CorpusResult {
	const beforeRows: Row[] = [];
	const afterRows: Row[] = [];
	const relaxedBefore: RelaxedRow[] = [];
	const relaxedAfter: RelaxedRow[] = [];
	for (const spec of corpus.cases) {
		beforeRows.push(...collectRows(before, spec));
		afterRows.push(...collectRows(after, spec));
		relaxedBefore.push(...collectRelaxedRows(before, spec));
		relaxedAfter.push(...collectRelaxedRows(after, spec));
	}
	const b = foldRows(beforeRows);
	const a = foldRows(afterRows);
	const aKeys = new Set(a.map(structureKey));
	const bKeys = new Set(b.map(structureKey));
	const gone = b.filter((r) => !aKeys.has(structureKey(r)));
	const added = a.filter((r) => !bKeys.has(structureKey(r)));

	const traces = new Map<string, DebugTrace>();
	for (const r of gone) {
		if (r.fam !== 'hs') continue;
		traces.set(structureKey(r), traceInDebug(after, corpus.cases, r));
	}

	// 計測 4: Phase 1 候補 0.830% と実装値 1.040% の間にある `1hour` の H&S 構造。
	// **before で accepted だったもの**を母集団にする（after では全部落ちているはず）。
	const lo = phase1CandidateHs('1hour');
	const hi = getHsShoulderMaxPctForTf('1hour');
	const betweenBand = b.filter((r) => r.fam === 'hs' && r.tf === '1hour' && r.levelPct > lo && r.levelPct <= hi);

	return {
		label: corpus.label,
		tfAuthoritative: corpus.tfAuthoritative,
		n: corpus.cases.length,
		before: b,
		after: a,
		gone,
		added,
		relaxedBefore,
		relaxedAfter,
		traces,
		betweenBand,
	};
}

// ── レポート ──

function renderThresholdTable(lines: string[]): void {
	lines.push('## 1. `getHsShoulderMaxPctForTf` の表と検算');
	lines.push('');
	lines.push('| 時間足 | ATR 比 | 由来 | 実装値 | ATR 換算 | `depthPct`（一致確認） | Phase 1 候補値との一致 |');
	lines.push('|---|---:|---|---:|---:|---:|---|');
	for (const tf of TF_TABLE_ORDER) {
		const r = atrRatio(tf);
		const v = getHsShoulderMaxPctForTf(tf);
		const depth = getSizeThresholdsForTf(tf).depthPct;
		const p1 = phase1CandidateHs(tf);
		const origin = r === 1 ? '据え置き' : tf === '1hour' ? '**実測**' : '√t 推定';
		lines.push(
			`| \`${tf}\` | ${r.toFixed(4)} | ${origin} | **${pct3(v)}** | ${(v / (ATR_1DAY_PCT * r)).toFixed(2)} ATR | ${pct3(depth)} ${v === depth ? '✅' : '❌'} | ${pct3(p1)} ${v === p1 ? '✅' : '❌'} |`,
		);
	}
	lines.push('');
	lines.push(
		'`depthPct` との一致は**偶然**（アンカーが `MIN_DEPTH_PCT` と同じ 5%）。測っている量が違う（谷の深さの下限 vs 肩の同水準の上限）ので流用していない。',
	);
	lines.push('');
	lines.push(
		'ATR 換算が全時間足で 1.82 ATR に揃うことが本変更の狙い（現行は `1day` 1.82 ATR / `1hour` **8.77 ATR**）。',
	);
	lines.push('');
}

function renderCountsTable(lines: string[], res: CorpusResult): void {
	const tfs = [...new Set([...res.before, ...res.after].map((r) => r.tf))].sort(
		(x, y) => TF_TABLE_ORDER.indexOf(x) - TF_TABLE_ORDER.indexOf(y),
	);
	lines.push('| type | ' + tfs.map((t) => `\`${t}\``).join(' | ') + ' | 計 |');
	lines.push('|---|' + tfs.map(() => '---:').join('|') + '|---:|');
	for (const type of TYPE_ORDER) {
		const cells: string[] = [];
		let tb = 0;
		let ta = 0;
		for (const tf of tfs) {
			const nb = res.before.filter((r) => r.type === type && r.tf === tf).length;
			const na = res.after.filter((r) => r.type === type && r.tf === tf).length;
			tb += nb;
			ta += na;
			cells.push(nb === na ? `${nb} → ${na}` : `**${nb} → ${na}（${na - nb > 0 ? '+' : ''}${na - nb}）**`);
		}
		const total = tb === ta ? `${tb} → ${ta}` : `**${tb} → ${ta}（${ta - tb > 0 ? '+' : ''}${ta - tb}）**`;
		lines.push(`| \`${type}\` | ${cells.join(' | ')} | ${total} |`);
	}
	lines.push('');
}

function renderGoneDetail(lines: string[], res: CorpusResult): void {
	if (res.gone.length === 0) {
		lines.push('落ちた構造: **0 件**');
		lines.push('');
		return;
	}
	lines.push(
		'| # | 系列 | tf | `swingDepth` | type | 構成点 | 肩 / 主構成点の価格 | 肩 `relDiff` | 実装閾値 | 経路 | `view=debug` に残るか | 理由コード | `details.shoulderMaxPct` |',
	);
	lines.push('|---:|---|---|---|---|---|---|---:|---:|---|---|---|---:|');
	res.gone.forEach((r, i) => {
		const t = res.traces.get(structureKey(r));
		const cap = getHsShoulderMaxPctForTf(r.tf);
		const trace = t ? (t.appearsInDebug ? '**残る**' : '**消える（無音）**') : '—（H&S 以外）';
		lines.push(
			`| ${i + 1} | \`${r.seriesLabel}\` | \`${r.tf}\` | ${sd(r.swingDepth)} | \`${r.type}\` | \`${r.idxs.join('-')}\` | ${r.mainPrices.map(jpy).join(' / ')} | **${pct3(r.levelPct)}** | ${pct3(cap)} | ${r.fallback ?? 'strict'} | ${trace} | ${t?.reasons.length ? t.reasons.map((x) => `\`${x}\``).join('<br>') : '—'} | ${t?.shoulderMaxPcts.length ? t.shoulderMaxPcts.join(' / ') : '—'} |`,
		);
	});
	lines.push('');
}

function renderRelaxed(lines: string[], res: CorpusResult): void {
	const agg = (rows: RelaxedRow[], type: string) => {
		const of = rows.filter((r) => r.type === type);
		return {
			strictZero: of.filter((r) => r.strictZero).length,
			fired: of.filter((r) => r.relaxedFired).length,
			n: of.length,
		};
	};
	lines.push('| type | strict 0 件（before → after） | relaxed accepted（before → after） |');
	lines.push('|---|---|---|');
	for (const type of HS_TYPES) {
		const b = agg(res.relaxedBefore, type);
		const a = agg(res.relaxedAfter, type);
		const fired = b.fired === a.fired ? `${b.fired} → ${a.fired}` : `**${b.fired} → ${a.fired}**`;
		lines.push(`| \`${type}\` | ${b.strictZero} → ${a.strictZero}（/ ${a.n}） | ${fired} |`);
	}
	lines.push('');
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const refAt = argv.indexOf('--before-ref');
	const beforeRef = refAt >= 0 ? argv[refAt + 1] : 'origin/main';
	const jsonAt = argv.indexOf('--json');
	const jsonPath = jsonAt >= 0 ? argv[jsonAt + 1] : null;

	assertBuildsDiffer(beforeRef);
	const before = await loadBuild('before', beforeRef);
	const after = await loadBuild('after', null);
	if (before.HS_SHOULDER_MAX_PCT !== 0.05 || after.HS_SHOULDER_MAX_PCT !== 0.05) {
		throw new Error(
			`\`HS_SHOULDER_MAX_PCT\` が 0.05 でない（before ${before.HS_SHOULDER_MAX_PCT} / after ${after.HS_SHOULDER_MAX_PCT}）。` +
				'本 PR は定数値を変えない前提。アンカーが動いているなら表を作り直すこと。',
		);
	}

	const corpora = await buildCorpus();
	const results = corpora.map((c) => runCorpus(c, before, after));

	// `after` ビルドが作業ツリーの本物と一致することの検算（Phase 1 の `base` 検算と同じ趣旨）。
	// 全ケースだと重いので H&S 検出器を各コーパスの先頭 8 ケースで突き合わせる。
	for (const c of corpora) {
		for (const spec of c.cases.slice(0, 8)) {
			const d1: CandDebugEntry[] = [];
			const d2: CandDebugEntry[] = [];
			const got = JSON.stringify(after.detectHeadAndShoulders(buildCtx(spec, d1)).patterns);
			const want = JSON.stringify(realDetectHs(buildCtx(spec, d2)).patterns);
			if (got !== want) {
				throw new Error(
					`after ビルドが作業ツリーの detectHeadAndShoulders と一致しない（${spec.series.name} / ${spec.tf}）。`,
				);
			}
		}
	}

	const lines: string[] = [];
	lines.push('# issue #244 Phase 2: 実装値での再計測');
	lines.push('');
	lines.push(`- before: \`${beforeRef}\`（肩ゲート = \`HS_SHOULDER_MAX_PCT\` 5% 固定）`);
	lines.push(
		'- after: 作業ツリー（肩ゲート = `ctx.hsShoulderMaxPct` 時間足別 / 窓生成 = 5% 据え置き / `tolerancePct` 不変）',
	);
	lines.push('');
	renderThresholdTable(lines);

	lines.push('## 2. type 別・時間足別の accepted 増減（構造単位。before → after）');
	lines.push('');
	for (const res of results) {
		lines.push(`### ${res.label}${res.tfAuthoritative ? '' : '（#178: 時間足別の結論には使えない — 参考）'}`);
		lines.push('');
		renderCountsTable(lines, res);
	}

	lines.push('## 3. 落ちた構造の明細（1 件ずつ）');
	lines.push('');
	for (const res of results) {
		lines.push(`### ${res.label}`);
		lines.push('');
		renderGoneDetail(lines, res);
		if (res.added.length > 0) {
			lines.push(`**新たに現れた構造: ${res.added.length} 件**`);
			lines.push('');
			for (const r of res.added) {
				lines.push(
					`- \`${r.seriesLabel}\` / \`${r.tf}\` / \`${r.type}\` / \`${r.idxs.join('-')}\`（肩 ${pct3(r.levelPct)}）`,
				);
			}
			lines.push('');
		}
	}

	lines.push('## 4. Phase 1 候補 0.830% と実装値 1.040% の間にある `1hour` の H&S 構造');
	lines.push('');
	lines.push('Phase 1 の候補ビルドでは落ち、実装値では**残る**帯。before で accepted だったものを母集団にする。');
	lines.push('');
	for (const res of results) {
		const inBand = res.betweenBand;
		if (inBand.length === 0) {
			lines.push(`- ${res.label}: **0 件**`);
			continue;
		}
		lines.push(`- ${res.label}: **${inBand.length} 件**`);
		for (const r of inBand) {
			const survives = res.after.some((x) => structureKey(x) === structureKey(r));
			lines.push(
				`  - \`${r.seriesLabel}\` / \`${r.type}\` / \`${r.idxs.join('-')}\` / 肩 **${pct3(r.levelPct)}** / 肩の価格 ${r.mainPrices.map(jpy).join(' / ')} → after で **${survives ? '残る' : '落ちる'}**`,
			);
		}
	}
	lines.push('');

	lines.push('## 5. 窓生成の据え置き（5%）の確認');
	lines.push('');
	lines.push(
		'落ちた H&S 構造が `view=debug` の候補として**現れる**なら、窓生成（`outerShoulderOk`）は締まっていない。消えていれば無音の偽陰性。',
	);
	lines.push('');
	let traced = 0;
	let silent = 0;
	for (const res of results) {
		for (const [, t] of res.traces) {
			traced++;
			if (!t.appearsInDebug) silent++;
		}
	}
	lines.push(`- 落ちた H&S 構造: **${traced} 件**`);
	lines.push(`- うち \`view=debug\` から消えた（無音）: **${silent} 件**`);
	lines.push('');

	lines.push('## 6. relaxed 経路（Phase 1 結果 5 の再確認）');
	lines.push('');
	for (const res of results) {
		lines.push(`### ${res.label}`);
		lines.push('');
		renderRelaxed(lines, res);
	}

	lines.push('## 7. `1day` 以上の 0 件差');
	lines.push('');
	const LONG_TFS = new Set(['1day', '1week', '1month']);
	let longDiff = 0;
	for (const res of results) {
		const g = res.gone.filter((r) => LONG_TFS.has(r.tf)).length;
		const a = res.added.filter((r) => LONG_TFS.has(r.tf)).length;
		longDiff += g + a;
		lines.push(`- ${res.label}: 落ちた **${g}** 件 / 増えた **${a}** 件`);
	}
	lines.push('');
	lines.push(
		longDiff === 0
			? '**`1day` 以上は全コーパスで 0 件差。** 受け入れ条件を満たす。'
			: `⚠️ **\`1day\` 以上で ${longDiff} 件動いている。** アンカー据え置きが崩れている。`,
	);
	lines.push('');

	lines.push('## 8. H&S 以外が動いていないことの確認');
	lines.push('');
	let nonHs = 0;
	for (const res of results) {
		const g = res.gone.filter((r) => r.fam !== 'hs').length;
		const a = res.added.filter((r) => r.fam !== 'hs').length;
		nonHs += g + a;
		lines.push(`- ${res.label}: double / triple の落ち **${g}** 件 / 増え **${a}** 件`);
	}
	lines.push('');
	lines.push(
		nonHs === 0
			? '**double / triple は全コーパスで 0 件差。** 肩ゲートしか触っていないので当然だが、機械的に確認した。'
			: `⚠️ **double / triple が ${nonHs} 件動いている。** 肩ゲート以外へ波及している。原因を説明すること。`,
	);
	lines.push('');

	// 計測 9: Phase 1 の ablation（窓生成も締めた版）との既知の差。
	// Phase 1 結果 11(b) / §9 は「実データ A `4hour` の `20-24-27-53-80` は肩 1.228% < 候補 2.040% で
	// **ゲートは通るのに窓生成で消える**」を報告している。窓生成を 5% に据え置いた実装では
	// **この構造は残るはず**——それが宿題 1 の判断（診断性）の直接の効果。
	lines.push('## 9. Phase 1 の ablation（窓生成も締めた版）との既知の差');
	lines.push('');
	const PHASE1_WINDOW_CASUALTY = { series: 'btc_jpy_1day_2026', tf: '4hour', idxs: '20-24-27-53-80' };
	const std = results[0];
	const findCasualty = (rows: Row[]) =>
		rows.find(
			(r) =>
				r.series === PHASE1_WINDOW_CASUALTY.series &&
				r.tf === PHASE1_WINDOW_CASUALTY.tf &&
				r.idxs.join('-') === PHASE1_WINDOW_CASUALTY.idxs &&
				r.fam === 'hs',
		);
	const casualtyBefore = findCasualty(std.before);
	const casualtyAfter = findCasualty(std.after);
	lines.push(
		`Phase 1 結果 11(b) の構造 \`${PHASE1_WINDOW_CASUALTY.series}\` / \`${PHASE1_WINDOW_CASUALTY.tf}\` / \`${PHASE1_WINDOW_CASUALTY.idxs}\`` +
			'（肩 1.228% < `4hour` の閾値 2.040%）は、Phase 1 の候補ビルドでは**窓生成で消えていた**。',
	);
	lines.push('');
	lines.push(
		`- before で accepted: **${casualtyBefore ? 'はい' : 'いいえ'}**${casualtyBefore ? `（肩 ${pct3(casualtyBefore.levelPct)}）` : ''}`,
	);
	lines.push(`- after で accepted: **${casualtyAfter ? 'はい' : 'いいえ'}**`);
	lines.push('');
	lines.push(
		casualtyBefore && casualtyAfter
			? '**窓生成を 5% に据え置いたので、この構造は実装では残る。** Phase 1 の ablation と結果が食い違う唯一の既知の点で、宿題 1（窓生成と肩ゲートで定数を分ける）の直接の効果。'
			: '⚠️ **Phase 1 の ablation と同じく消えている。** 窓生成の据え置きが効いていない可能性がある。',
	);
	lines.push('');

	const out = lines.join('\n');
	console.log(out);
	if (jsonPath) {
		writeFileSync(
			jsonPath,
			JSON.stringify(
				{
					beforeRef,
					thresholds: Object.fromEntries(TF_TABLE_ORDER.map((t) => [t, getHsShoulderMaxPctForTf(t)])),
					corpora: results.map((r) => ({
						label: r.label,
						n: r.n,
						before: r.before.length,
						after: r.after.length,
						gone: r.gone,
						added: r.added,
						betweenBand: r.betweenBand,
						traces: Object.fromEntries(r.traces),
					})),
				},
				null,
				2,
			),
		);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
