/**
 * issue #244 Phase 1: **価格相対の同水準判定 3 つ**が時間足に追従していない件を実測する。
 * **閾値もソースも 1 つも変えない**（実装は Phase 2 で単独 PR）。
 *
 * ## issue 本文からの補正
 *
 * issue 本文は「同水準判定が固定パーセンテージで時間足に追従していない」と書いているが、
 * **#178 / PR #176 / PR #195 で高さ相対の無次元ゲートが既に入っている**ので、正確には
 * 本 issue の対象は**価格相対の 3 つだけ**:
 *
 * | 判定 | 基準 | 時間足追従 | 適用先 |
 * |---|---|---|---|
 * | `validateLevelSpread` / `validateLevelDiff`（`MAX_LEVEL_SPREAD_RATIO = 0.5`） | 構成点の差 ÷ パターン高さ | 無次元なので不要 | double / triple（完成済み） |
 * | `DOUBLE_LEVEL_MAX_PCT = 0.03` | 価格相対 | **固定** | double |
 * | `HS_SHOULDER_MAX_PCT = 0.05` | 価格相対 | **固定** | H&S の肩 |
 * | `tolerancePct`（`getDefaultToleranceForTf`） | 価格相対 | 1day 4% / **1hour 5% / 15min 6%**（短いほど緩い） | double / triple / H&S |
 *
 * H&S は #178 項目 3 の結論（肩は `heightAbs` の端点にならないので高さ相対の比が意味を持たない）
 * により**価格相対しか使えない**。double / triple は高さ相対ゲートが既に効いているので、
 * 価格相対の上限を締めても出力が変わらない可能性がある——**それ自体が Phase 1 の結果**。
 *
 * ## 出すもの（issue #244 Phase 1 の 1〜5）
 *
 * 1. 同水準判定の実測値の分布（accepted な完成済みのみ・時間足別・type 別）と ATR 換算、
 *    および double / triple の**律速側**（価格相対 vs 高さ相対）
 * 2. 候補テーブル（`getSizeThresholdsForTf` と同じ ATR 比）で落ちる件数と 1 件ずつの明細、
 *    および #214 と同じ基準（分布の空白帯）での非恣意性の確認
 * 3. relaxed 経路への影響（#227 と同じ集計を候補テーブルで before / after）
 * 4. 発見元ケース（実データ D の `double_top 329-334-338`）の検算
 * 5. #249 案 C（完成済み H&S に forming の `maxBars` を課した場合）の件数と明細
 *
 * ## ハーネス
 *
 * `scripts/measure_hs_shoulder_window_249.ts` に倣い、**`tools/patterns/` をディレクトリごと**
 * 一時領域へ展開して読む。検出器 1 ファイルだけを写すと `./structural.js` が作業ツリーへ
 * 解決され、候補ビルドに現行定数が混ざる。
 *
 * 展開の目的は 2 つ:
 *
 * - **`base`**: 何も書き換えずに展開したビルド。作業ツリーの本物と JSON 全キー一致することを
 *   **全ケースで**検算する（1 件でも食い違えばその場で例外）。以降の分布は全部このビルドの出力。
 * - **候補ビルド**: `structural.ts` の `DOUBLE_LEVEL_MAX_PCT` / `HS_SHOULDER_MAX_PCT` の
 *   **数値リテラルだけ**を候補値へ差し替えたビルド（ablation）。`HS_SHOULDER_MAX_PCT` の
 *   docstring にある「本定数だけを振った ablation」と同じ流儀で、書き換えるのは
 *   `= <数値>;` の 1 トークンのみ。置換が起きたことと、展開後の定数が意図した値になっている
 *   ことを import して検算する。`tolerancePct` は検出器の外（`DetectContext`）から渡る値なので
 *   **ソースは触らず** ctx で差し替える。
 *
 * **作業ツリーは 1 バイトも変えない。** 展開先は `mkdtemp` の一時ディレクトリ。
 *
 * ### 計測 2 の「落ちる件数」は 2 通り出す
 *
 * - **静的判定**（issue の指定）: 今 accepted な構造の実測 relDiff を候補閾値と比べるだけ。
 *   「今 accepted で、候補テーブルでは落ちる」の定義そのもの。
 * - **ablation**（裏取り）: 候補ビルドを実際に走らせた accepted 件数の before / after。
 *   静的判定と差が出るのは**波及**（候補が消えた結果、別 type / 別窓が拾われる等）があるとき。
 *   両方出して食い違いを明示する。
 *
 * ## コーパス
 *
 * 標準 800（合成 704 + 実データ A 96）＋ 実データ B / C / D 各 96 ＋ 実データ C の窓長スイープ 256。
 * **プールしない**（#219）。
 *
 * 窓長スイープを足してあるのは計測 3 のため。**relaxed が実際に accepted を返す設定は
 * 実データ C の窓長 120 だけ**（#227 の再計測）で、フル系列だけを見ると before / after が
 * 全部「0 → 0」になり、「relaxed 経路が消えるか」に答えられない。
 *
 * **注意（#178 より）**: 標準コーパスの「実データ A 96」は `btc_jpy_1day_2026` の同じ 90 本を
 * `tf` ラベルだけ変えたもので、時間足別の内訳は独立系列ではない。**時間足別の結論は
 * 実データ B / C / D（実 1hour 365 本）と実データ A の 1day だけから出す。**
 * 合成 704 と A の 4hour / 1hour ラベルは参考値。表には `時間足別の結論に使えるか` を明記する。
 *
 * ## 使い方
 *
 * ```bash
 * npx tsx scripts/measure_level_pct_tf_244.ts
 * npx tsx scripts/measure_level_pct_tf_244.ts --json /tmp/244.json
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
import {
	getDefaultToleranceForTf,
	getHsShoulderMaxPctForTf,
	getSizeThresholdsForTf,
	resolveParams,
} from '../tools/patterns/config.js';
import { detectDoubles as realDetectDoubles } from '../tools/patterns/detect_doubles.js';
import { detectHeadAndShoulders as realDetectHs } from '../tools/patterns/detect_hs.js';
import { detectTriples as realDetectTriples } from '../tools/patterns/detect_triples.js';
import { linearRegressionWithR2, near as nearFn, pct as pctFn } from '../tools/patterns/regression.js';
import { type Candle, detectSwingPoints, filterPeaks, filterValleys, type Pivot } from '../tools/patterns/swing.js';
import type { CandDebugEntry, DeduplicablePattern, DetectContext } from '../tools/patterns/types.js';

const ROOT = resolve(import.meta.dirname, '..');
const TMP_DIR = mkdtempSync(join(tmpdir(), 'level-pct-244-'));

type Detector = (ctx: DetectContext) => { patterns: DeduplicablePattern[] };

/** 1 ビルドぶんの検出器 3 種と、そのビルドが実際に持っている定数。 */
interface Build {
	detectDoubles: Detector;
	detectTriples: Detector;
	detectHeadAndShoulders: Detector;
	getHsFormingBarParams: (tf: string) => { minBars: number; maxBars: number };
	DOUBLE_LEVEL_MAX_PCT: number;
	HS_SHOULDER_MAX_PCT: number;
	MAX_LEVEL_SPREAD_RATIO: number;
}

// ── ATR 比テーブルと候補値 ──

/**
 * 1day を 1.0 とした ATR 比。**`config.ts` の `getSizeThresholdsForTf` の docstring の表と同一。**
 * 新たに ATR を測り直してはいない（#152 が測定 / 推定済みの値をそのまま使う。#198 と同じ流儀）。
 * `1hour` のみ実測（ATR 0.57% / 2.75%）、他は √t 推定。
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

/** 時間足の ATR（%）。1day の実測に ATR 比を掛けたもの（`1hour` は実測 0.57% に一致）。 */
function atrPct(tf: string): number {
	return ATR_1DAY_PCT * atrRatio(tf);
}

/** `config.ts` の各表と同じ 4 桁丸め。 */
function round4(v: number): number {
	return Math.round(v * 1e4) / 1e4;
}

/** 候補テーブルの 1 行（時間足ごとの 3 閾値）。 */
interface Candidate {
	ratio: number;
	/** `DOUBLE_LEVEL_MAX_PCT` 候補（アンカー 0.03 × 比） */
	double: number;
	/** `HS_SHOULDER_MAX_PCT` 候補（アンカー 0.05 × 比） */
	hs: number;
	/** `tolerancePct` 候補（アンカー 0.04 × 比）。**1day 以上は現行の tf-auto 値を据え置く** */
	tol: number;
}

/**
 * 候補テーブル。**`getSizeThresholdsForTf` と同じ ATR 比を 3 つのアンカーに掛けるだけ。**
 *
 * `tolerancePct` だけは `1day` 以上で `getDefaultToleranceForTf` の現行値を据え置く
 * （アンカー 0.04 を機械的に当てると `1week` 3.5% → 4% / `1month` 3% → 4% と**緩む**方向になり、
 * #152 の約束 2「アンカーは 1day で現行値を据え置く」と本 issue の「締める方向」の両方に反する）。
 */
function candidateFor(tf: string): Candidate {
	const ratio = atrRatio(tf);
	return {
		ratio,
		double: ratio < 1 ? round4(0.03 * ratio) : 0.03,
		hs: ratio < 1 ? round4(0.05 * ratio) : 0.05,
		tol: ratio < 1 ? round4(0.04 * ratio) : getDefaultToleranceForTf(tf),
	};
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

// ── ビルドの展開 ──

/**
 * `tools/patterns/` を**ディレクトリごと**一時領域へ展開する
 * （`measure_hs_shoulder_window_249.ts` / `measure_double_triangle_243.ts` の同名関数と同じ流儀）。
 *
 * `overrides` が空なら**1 バイトも書き換えない**（`base` ビルド）。値が入っていれば
 * `structural.ts` の該当する `export const NAME = <数値>;` の**数値リテラルだけ**を差し替える。
 * 置換が 1 件も起きなければ例外（定数名や書式が変わったのに黙って現行値で計測するのを防ぐ）。
 */
function materializePatternsDir(tag: string, overrides: Readonly<Record<string, number>>): string {
	const files = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', 'tools/patterns/'], {
		cwd: ROOT,
		encoding: 'utf8',
	})
		.split('\n')
		.map((s) => s.trim())
		.filter((s) => s.endsWith('.ts'));
	if (files.length === 0) throw new Error('HEAD の tools/patterns/ に .ts が 1 つも無い。');

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
		let src = readFileSync(join(ROOT, path), 'utf8');
		if (name === 'structural.ts') {
			for (const [constName, value] of Object.entries(overrides)) {
				const re = new RegExp(`(export const ${constName} = )[0-9.]+(;)`);
				if (!re.test(src)) {
					throw new Error(
						`structural.ts に \`export const ${constName} = <数値>;\` が見つからない。` +
							'定数名か書式が変わったので ablation の書き換えを合わせ直すこと' +
							'（このまま走らせると現行値のまま「候補ビルド」を名乗る）。',
					);
				}
				src = src.replace(re, `$1${value}$2`);
			}
		}
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

/** 1 ビルドぶんの検出器と定数を、**同じ展開ディレクトリから**読む。 */
async function loadBuild(tag: string, overrides: Readonly<Record<string, number>>): Promise<Build> {
	const dir = materializePatternsDir(tag, overrides);
	const url = (f: string) => pathToFileURL(join(dir, f)).href;
	const doubles = (await import(url('detect_doubles.ts'))) as { detectDoubles: Detector };
	const triples = (await import(url('detect_triples.ts'))) as { detectTriples: Detector };
	const hs = (await import(url('detect_hs.ts'))) as {
		detectHeadAndShoulders: Detector;
		getHsFormingBarParams: (tf: string) => { minBars: number; maxBars: number };
	};
	const structural = (await import(url('structural.ts'))) as {
		DOUBLE_LEVEL_MAX_PCT: number;
		HS_SHOULDER_MAX_PCT: number;
		MAX_LEVEL_SPREAD_RATIO: number;
	};
	const build: Build = {
		detectDoubles: doubles.detectDoubles,
		detectTriples: triples.detectTriples,
		detectHeadAndShoulders: hs.detectHeadAndShoulders,
		getHsFormingBarParams: hs.getHsFormingBarParams,
		DOUBLE_LEVEL_MAX_PCT: structural.DOUBLE_LEVEL_MAX_PCT,
		HS_SHOULDER_MAX_PCT: structural.HS_SHOULDER_MAX_PCT,
		MAX_LEVEL_SPREAD_RATIO: structural.MAX_LEVEL_SPREAD_RATIO,
	};
	// 書き換えが**実際にモジュールへ効いた**ことを値で確かめる（正規表現が通っても
	// 別の宣言に当たっていれば意味が無い）。
	for (const [constName, value] of Object.entries(overrides)) {
		const got = (build as unknown as Record<string, number>)[constName];
		if (got !== value) {
			throw new Error(`候補ビルド '${tag}' の ${constName} が ${got}（期待 ${value}）。ablation は無効。`);
		}
	}
	return build;
}

// ── コーパス（#242 / #243 / #249 と同じ組み方） ──

type Group = 'synthetic' | 'realA' | 'realB' | 'realC' | 'realD';

interface Series {
	group: Group;
	name: string;
	candles: Candle[];
	/**
	 * 元 fixture の先頭から数えた、この系列の先頭バーの添字。**窓を切ったときだけ非 0**
	 * （窓ローカルの idx にこれを足すと fixture の idx になる）。#227 の同名フィールドと同じ役割。
	 */
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

/** MCP の統合オプション 3 つの全組み合わせ（ケース数の単位を #211 / #216 / #242 / #243 / #249 と揃える）。 */
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

/**
 * 実データ C の窓長スイープで使う窓の本数（= `detect_patterns` の `limit`）。**#227 と同じ値。**
 *
 * relaxed は strict が対象 type を 1 件も返さなかったときにだけ走るので、**窓の左端が
 * 発火可否を決める**（#227 の再計測。`getHeadProminenceForTf` の docstring の表）。
 * フル系列だけを見ると relaxed accepted は全コーパスで 0 になり、計測 3 の before / after が
 * 「0 → 0」しか出ない。**relaxed が実際に発火する唯一の設定**（窓長 120）を含めるために掃く。
 */
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
		{
			label: `標準コーパス ${standard.length}（合成 704 + 実データ A 96）`,
			tfAuthoritative: false,
			cases: standard,
		},
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

/**
 * `detect_patterns.ts` と同じ順序で `DetectContext` を組む。
 *
 * `tolerancePctOverride` を渡すと `tolerancePct` と `near` だけを差し替える
 * （候補テーブルの ablation 用。`getDefaultToleranceForTf` のソースは触らない）。
 */
function buildCtx(spec: CaseSpec, debugCandidates: CandDebugEntry[], tolerancePctOverride?: number): DetectContext {
	const { candles } = spec.series;
	const resolved = resolveParams(spec.tf, spec.swingDepth === undefined ? {} : { swingDepth: spec.swingDepth });
	const pivots = detectSwingPoints(candles, { swingDepth: resolved.swingDepth, strictPivots: true });
	const tolerancePct = tolerancePctOverride ?? resolved.tolerancePct;
	return {
		candles,
		pivots,
		allPeaks: filterPeaks(pivots),
		allValleys: filterValleys(pivots),
		tolerancePct,
		headProminencePct: resolved.headProminencePct,
		sizeThresholds: getSizeThresholdsForTf(spec.tf),
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

// ── 同水準の実測値 ──

type Fam = 'double' | 'triple' | 'hs';

const TYPE_FAMILY: Readonly<Record<string, Fam>> = {
	double_top: 'double',
	double_bottom: 'double',
	triple_top: 'triple',
	triple_bottom: 'triple',
	head_and_shoulders: 'hs',
	inverse_head_and_shoulders: 'hs',
};

/** 表の type 並び（`double` → `triple` → `hs`）。 */
const TYPE_ORDER: readonly string[] = [
	'double_top',
	'double_bottom',
	'triple_top',
	'triple_bottom',
	'head_and_shoulders',
	'inverse_head_and_shoulders',
];

/** `structural.ts` の `relDiff` と同式。**書き写しではなく再実装しない**ため import しても良いが、 */
/** 展開ビルドごとに参照を変えたくないので同じ 3 行をここに置く（値は定義上一意）。 */
function relDiff(a: number, b: number): number {
	const max = Math.max(a, b);
	if (max === 0) return 0;
	return Math.abs(a - b) / max;
}

/** 主構成点（同水準であるべき点）を type から取り出す。 */
function mainPointsOf(fam: Fam, pivots: Pivot[]): Pivot[] {
	if (fam === 'double') return [pivots[0], pivots[2]];
	if (fam === 'triple') return [pivots[0], pivots[2], pivots[4]];
	return [pivots[0], pivots[4]]; // hs: 左肩 / 右肩
}

/**
 * 同水準判定が実際に見ている量。
 *
 * - double: `relDiff(peak1.price, peak2.price)`（終値基準。`isSameLevel` / `near` と同じ量）
 * - triple: 3 点の pairwise `relDiff` の**最大**（検出器は 3 組すべてに `near` を掛ける）
 * - H&S: `relDiff(p0.price, p4.price)`（肩）
 */
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

/** `levelSpreadMetrics` と同じ量（高さ相対）。**H&S では意味を持たない**ので double / triple のみ算出する。 */
function spreadRatioOf(main: Pivot[], all: Pivot[]): { spreadRatio: number | null; heightPct: number | null } {
	const levels = main.map((p) => p.price);
	const spreadAbs = Math.max(...levels) - Math.min(...levels);
	const extremes = all.map((p) => p.extremePrice);
	if (!extremes.every((v) => Number.isFinite(v))) return { spreadRatio: null, heightPct: null };
	const hi = Math.max(...extremes);
	const lo = Math.min(...extremes);
	const heightAbs = hi - lo;
	return {
		spreadRatio: heightAbs > 0 ? spreadAbs / heightAbs : null,
		heightPct: heightAbs / Math.max(1, hi),
	};
}

/**
 * `_fallback` タグ（`relaxed_double_x1.3` / `relaxed_triple_x2` / `relaxed_hs_x1.6_0.6`）から
 * **肩 / 同水準に掛かる係数**を取り出す。strict（タグ無し）なら 1。
 */
function relaxedFactorOf(fallback: string | undefined): number {
	if (!fallback) return 1;
	const m = /_x([0-9.]+)/.exec(fallback);
	if (!m) throw new Error(`未知の _fallback タグ '${fallback}'。relaxed 係数を取り出せない。`);
	return Number(m[1]);
}

/** その経路の**価格相対の実効閾値**（`min` を取る相手は type によって違う）。 */
function effectivePriceThreshold(
	fam: Fam,
	tolerancePct: number,
	factor: number,
	doubleCap: number,
	hsCap: number,
): number {
	const tol = tolerancePct * factor;
	if (fam === 'double') return Math.min(tol, doubleCap);
	if (fam === 'hs') return Math.min(tol, hsCap);
	return tol; // triple は価格相対の cap を持たない（`near` 一本）
}

/** accepted（`completed` / status 無し）。`detect_patterns.ts` のライフサイクル分類と同じ。 */
function isAccepted(p: DeduplicablePattern): boolean {
	return p.status === 'completed' || !p.status;
}

interface LevelRow {
	group: Group;
	/** 構造を畳むときの系列名（窓長スイープでは元 fixture 名）。 */
	series: string;
	/** 表示用の系列名（窓長スイープでは `…@last120` のように窓が分かる名前）。 */
	seriesLabel: string;
	tf: string;
	swingDepth: number | undefined;
	/** ablation で消えた構造の理由を引き直すために、そのケースのオプションを持っておく。 */
	opts: CaseOpts;
	type: string;
	fam: Fam;
	/** relaxed 経路で拾われたか（`_fallback`） */
	fallback: string | null;
	idxs: number[];
	mainPrices: number[];
	/** 同水準判定が見ている実測値 */
	levelPct: number;
	/** 高さ相対（double / triple のみ。H&S は `null`） */
	spreadRatio: number | null;
	heightPct: number | null;
	/** 現行の価格相対の実効閾値 */
	effNow: number;
	/** 候補テーブルでの価格相対の実効閾値 */
	effCand: number;
	/** 候補テーブルで落ちるか（静的判定） */
	dropsUnderCandidate: boolean;
	/** 第1構成点 → 最終構成点のバー数（H&S なら左肩 → 右肩。計測 5 用） */
	firstToLast: number;
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

/** 1 ケースぶんの accepted な完成済みを 3 検出器から集める。 */
function collectLevelRows(build: Build, spec: CaseSpec, cand: Candidate, tolerancePct: number | undefined): LevelRow[] {
	const dbg: CandDebugEntry[] = [];
	const ctx = buildCtx(spec, dbg, tolerancePct);
	const patterns = [
		...build.detectDoubles(ctx).patterns,
		...build.detectTriples(ctx).patterns,
		...build.detectHeadAndShoulders(ctx).patterns,
	];
	const out: LevelRow[] = [];
	for (const p of patterns) {
		const type = String(p.type ?? '');
		const fam = TYPE_FAMILY[type];
		if (!fam || !isAccepted(p)) continue;
		const pv = (p as { pivots?: Pivot[] }).pivots;
		const need = fam === 'double' ? 3 : 5;
		if (!Array.isArray(pv) || pv.length !== need) continue;
		const main = mainPointsOf(fam, pv);
		const fallback = typeof p._fallback === 'string' ? p._fallback : null;
		const factor = relaxedFactorOf(fallback ?? undefined);
		const effNow = effectivePriceThreshold(
			fam,
			ctx.tolerancePct,
			factor,
			build.DOUBLE_LEVEL_MAX_PCT,
			build.HS_SHOULDER_MAX_PCT,
		);
		const effCand = effectivePriceThreshold(fam, cand.tol, factor, cand.double, cand.hs);
		const levelPct = levelPctOf(fam, main);
		const { spreadRatio, heightPct } = fam === 'hs' ? { spreadRatio: null, heightPct: null } : spreadRatioOf(main, pv);
		const off = spec.series.idxOffset ?? 0;
		out.push({
			group: spec.series.group,
			series: spec.series.foldName ?? spec.series.name,
			seriesLabel: spec.series.name,
			tf: spec.tf,
			swingDepth: spec.swingDepth,
			opts: spec.opts,
			type,
			fam,
			fallback,
			idxs: pv.map((q) => q.idx + off),
			mainPrices: main.map((q) => q.price),
			levelPct,
			spreadRatio,
			heightPct,
			effNow,
			effCand,
			dropsUnderCandidate: levelPct > effCand,
			firstToLast: pv[pv.length - 1].idx - pv[0].idx,
		});
	}
	return out;
}

// ── relaxed の集計（#227 と同じ定義） ──

const HS_TYPES = ['head_and_shoulders', 'inverse_head_and_shoulders'] as const;

interface RelaxedRow {
	tf: string;
	type: string;
	/** strict 経路が候補を 1 件も作らなかったか（= relaxed が評価される条件） */
	strictZero: boolean;
	/** relaxed が accepted を返したか */
	relaxedFired: boolean;
	/** relaxed accepted の段タグ */
	tag: string | null;
}

/**
 * #227 の集計と同じ定義。`strictCount` は「その type の `_fallback` 無し・`forming` 以外の
 * pattern 件数」（#227 の計測 3 と同じ定義。`findStrictHS` の `found` はここが 1 件以上のときに
 * 立つので、`strictZero` は relaxed が評価される条件と一致する）。
 */
function collectRelaxedRows(build: Build, spec: CaseSpec, tolerancePct: number | undefined): RelaxedRow[] {
	const dbg: CandDebugEntry[] = [];
	const ctx = buildCtx(spec, dbg, tolerancePct);
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

// ── 統計ユーティリティ ──

/** 昇順ソート済み配列の百分位（最近傍・線形補間なし）。空なら `null`。 */
function pctl(sorted: number[], q: number): number | null {
	if (sorted.length === 0) return null;
	const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
	return sorted[i];
}

interface Dist {
	n: number;
	min: number | null;
	p50: number | null;
	p90: number | null;
	max: number | null;
}

function dist(values: number[]): Dist {
	const s = [...values].sort((a, b) => a - b);
	return {
		n: s.length,
		min: s.length ? s[0] : null,
		p50: pctl(s, 0.5),
		p90: pctl(s, 0.9),
		max: s.length ? s[s.length - 1] : null,
	};
}

/**
 * #214 と同じ非恣意性の見方: 候補閾値の**直下 / 直上の最近傍値**と、その隙間。
 * 「閾値をこの帯のどこに置いても切れ方が同じ」なら値はつまみでない。
 */
interface GapReport {
	below: number | null;
	above: number | null;
	/** `above - below`（どちらか欠ければ `null`） */
	gap: number | null;
	/** 分布全体の最大の隙間とその位置 */
	maxGap: number | null;
	maxGapAt: [number, number] | null;
}

function gapReport(values: number[], threshold: number): GapReport {
	const s = [...values].sort((a, b) => a - b);
	const below = [...s].reverse().find((v) => v <= threshold) ?? null;
	const above = s.find((v) => v > threshold) ?? null;
	let maxGap: number | null = null;
	let maxGapAt: [number, number] | null = null;
	for (let i = 1; i < s.length; i++) {
		const g = s[i] - s[i - 1];
		if (maxGap === null || g > maxGap) {
			maxGap = g;
			maxGapAt = [s[i - 1], s[i]];
		}
	}
	return { below, above, gap: below !== null && above !== null ? above - below : null, maxGap, maxGapAt };
}

// ── 出力ヘルパ ──

const pct2 = (v: number | null): string => (v === null ? '—' : `${(v * 100).toFixed(3)}%`);
const num2 = (v: number | null): string => (v === null ? '—' : v.toFixed(2));
const num3 = (v: number | null): string => (v === null ? '—' : v.toFixed(3));
const sd = (v: number | undefined): string => (v === undefined ? 'auto' : String(v));
const jpy = (v: number): string => Math.round(v).toLocaleString('en-US');

/** 1 コーパスぶんの集計結果。 */
interface CorpusResult {
	label: string;
	tfAuthoritative: boolean;
	n: number;
	/** base ビルドの accepted な完成済み（構造単位に畳んだもの） */
	rows: LevelRow[];
	/** 候補ビルド（ablation）の accepted な完成済み（構造単位） */
	candRows: LevelRow[];
	relaxedNow: RelaxedRow[];
	relaxedCand: RelaxedRow[];
	/** ablation（候補ビルド）で消えた構造 */
	ablationGone: LevelRow[];
	/** ablation で新たに現れた構造 */
	ablationAdded: LevelRow[];
	/**
	 * ablation で消えたのに**静的判定では落ちない**構造（= 同水準判定以外への波及）。
	 * `reason` は候補ビルドを同じケースで再実行して `debugCandidates` から引いた棄却理由。
	 */
	ablationGoneUnexplained: UnexplainedRow[];
}

interface UnexplainedRow extends LevelRow {
	reason: string;
	/** `tolerancePct` **だけ**を候補値にしたとき、その構造がまだ accepted か */
	survivesTolOnly: boolean;
	/** 2 定数（`DOUBLE_LEVEL_MAX_PCT` / `HS_SHOULDER_MAX_PCT`）**だけ**を候補値にしたとき、同上 */
	survivesCapOnly: boolean;
}

/** その構造が、指定のビルド / `tolerancePct` で accepted のまま残るか。 */
function stillAccepted(build: Build, cases: CaseSpec[], row: LevelRow, tol: number | undefined): boolean {
	const spec = cases.find(
		(c) =>
			c.series.name === row.seriesLabel &&
			c.tf === row.tf &&
			c.swingDepth === row.swingDepth &&
			c.opts.includeForming === row.opts.includeForming &&
			c.opts.includeCompleted === row.opts.includeCompleted &&
			c.opts.includeInvalid === row.opts.includeInvalid,
	);
	if (!spec) return false;
	const off = spec.series.idxOffset ?? 0;
	const key = row.idxs.join('-');
	const ctx = buildCtx(spec, [], tol);
	const patterns = [
		...build.detectDoubles(ctx).patterns,
		...build.detectTriples(ctx).patterns,
		...build.detectHeadAndShoulders(ctx).patterns,
	];
	return patterns.some((p) => {
		if (p.type !== row.type || !isAccepted(p)) return false;
		const pv = (p as { pivots?: Pivot[] }).pivots;
		return Array.isArray(pv) && pv.map((q) => q.idx + off).join('-') === key;
	});
}

/**
 * ablation で消えた構造について、**候補ビルドを同じケースで再実行**して棄却理由を引く。
 * 「消えた」だけでは同水準判定で落ちたのか別のゲートに波及したのかが区別できない。
 */
function replayReason(build: Build, cases: CaseSpec[], row: LevelRow, tol: number): string {
	const spec = cases.find(
		(c) =>
			c.series.name === row.seriesLabel &&
			c.tf === row.tf &&
			c.swingDepth === row.swingDepth &&
			c.opts.includeForming === row.opts.includeForming &&
			c.opts.includeCompleted === row.opts.includeCompleted &&
			c.opts.includeInvalid === row.opts.includeInvalid,
	);
	if (!spec) return '（ケースを再現できない）';
	const dbg: CandDebugEntry[] = [];
	const ctx = buildCtx(spec, dbg, tol);
	build.detectDoubles(ctx);
	build.detectTriples(ctx);
	build.detectHeadAndShoulders(ctx);
	const off = spec.series.idxOffset ?? 0;
	// **構成点の完全一致では引けない。** `view=debug` の `indices` は検出器ごとに粒度が違う
	// （triple の棄却エントリは 3 山だけ、accepted はブレイク足を足した 4 点）。
	// **主構成点が全部含まれているか**で引く。
	const fam = TYPE_FAMILY[row.type];
	const mainIdxs =
		fam === 'double'
			? [row.idxs[0], row.idxs[2]]
			: fam === 'triple'
				? [row.idxs[0], row.idxs[2], row.idxs[4]]
				: [row.idxs[0], row.idxs[4]];
	const hits = dbg.filter((d) => {
		if (d.type !== row.type) return false;
		const abs = (d.indices ?? []).map((i) => i + off);
		return mainIdxs.every((i) => abs.includes(i));
	});
	if (hits.length === 0) return '（候補に現れない）';
	return [
		...new Set(hits.map((d) => (d.accepted ? `accepted${d.reason ? `(${d.reason})` : ''}` : (d.reason ?? 'unknown')))),
	].join(' / ');
}

function sectionDistribution(res: CorpusResult, build: Build): string[] {
	const out: string[] = [];
	if (res.rows.length === 0) return ['**accepted な完成済みが 0 件。**', ''];
	const tfs = [...new Set(res.rows.map((r) => r.tf))].sort();
	out.push(
		'同水準判定の実測値（double: 2 山の `relDiff` / triple: 3 山の pairwise 最大 / H&S: 左右肩の `relDiff`）。',
		'ATR 換算は `実測値 ÷ その時間足の ATR`（1day 2.75% に ATR 比を掛けたもの）。',
		'',
		'| type | 時間足 | 構造 | min | p50 | p90 | max | max の ATR 換算 | 現行実効閾値 | 同 ATR 換算 |',
		'|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
	);
	for (const t of TYPE_ORDER) {
		for (const tf of tfs) {
			const sub = res.rows.filter((r) => r.type === t && r.tf === tf);
			if (sub.length === 0) continue;
			const d = dist(sub.map((r) => r.levelPct));
			const eff = Math.max(...sub.map((r) => r.effNow));
			out.push(
				`| ${t} | ${tf} | ${d.n} | ${pct2(d.min)} | ${pct2(d.p50)} | ${pct2(d.p90)} | ${pct2(d.max)} | ${num2((d.max ?? 0) / atrPct(tf))} ATR | ${pct2(eff)} | ${num2(eff / atrPct(tf))} ATR |`,
			);
		}
	}
	out.push(
		'',
		`### 律速側（価格相対 vs 高さ相対。double / triple のみ。\`MAX_LEVEL_SPREAD_RATIO = ${build.MAX_LEVEL_SPREAD_RATIO}\`）`,
		'',
	);
	out.push(
		'「律速」= その構造にとって**先に上限へ当たる側**。使用率 `実測 ÷ 上限` が大きいほうを律速とする。',
		'',
		'| type | 時間足 | 構造 | `spreadRatio` p50 | 同 max | 価格相対の使用率 p50 | 高さ相対の使用率 p50 | 律速: 価格相対 | 律速: 高さ相対 |',
		'|---|---|---:|---:|---:|---:|---:|---:|---:|',
	);
	for (const t of TYPE_ORDER) {
		if (TYPE_FAMILY[t] === 'hs') continue;
		for (const tf of tfs) {
			const sub = res.rows.filter((r) => r.type === t && r.tf === tf && r.spreadRatio !== null);
			if (sub.length === 0) continue;
			const sr = dist(sub.map((r) => r.spreadRatio as number));
			const usePrice = sub.map((r) => r.levelPct / r.effNow);
			const useHeight = sub.map((r) => (r.spreadRatio as number) / build.MAX_LEVEL_SPREAD_RATIO);
			const priceBound = sub.filter((_, i) => usePrice[i] >= useHeight[i]).length;
			out.push(
				`| ${t} | ${tf} | ${sub.length} | ${num3(sr.p50)} | ${num3(sr.max)} | ${num3(
					pctl(
						[...usePrice].sort((a, b) => a - b),
						0.5,
					),
				)} | ${num3(
					pctl(
						[...useHeight].sort((a, b) => a - b),
						0.5,
					),
				)} | ${priceBound} | ${sub.length - priceBound} |`,
			);
		}
	}
	out.push('');
	const hsRows = res.rows.filter((r) => r.fam === 'hs');
	out.push(
		`H&S は高さ相対の比を持たない（#178 項目 3。肩は \`heightAbs\` の端点にならない）ので価格相対のみ。該当 ${hsRows.length} 構造。`,
		'',
	);
	return out;
}

function sectionCandidateDrops(res: CorpusResult): string[] {
	const out: string[] = [];
	const tfs = [...new Set(res.rows.map((r) => r.tf))].sort();
	out.push(
		'**静的判定**（今 accepted な構造の実測値を候補閾値と比べる）と **ablation**',
		'（候補ビルドを実際に走らせた accepted 構造数）を並べる。ablation 側の差が静的判定と合わないのは',
		'波及（候補が消えた結果、別の窓 / 別 type が拾われる等）があるとき。',
		'',
		'| type | 時間足 | 現行 accepted | 候補閾値 | 静的に落ちる | ablation の accepted | ablation 差 |',
		'|---|---|---:|---:|---:|---:|---:|',
	);
	for (const t of TYPE_ORDER) {
		for (const tf of tfs) {
			const sub = res.rows.filter((r) => r.type === t && r.tf === tf);
			const candSub = res.candRows.filter((r) => r.type === t && r.tf === tf);
			if (sub.length === 0 && candSub.length === 0) continue;
			const dropped = sub.filter((r) => r.dropsUnderCandidate).length;
			const eff = sub.length > 0 ? Math.max(...sub.map((r) => r.effCand)) : null;
			out.push(
				`| ${t} | ${tf} | ${sub.length} | ${eff === null ? '—' : pct2(eff)} | ${dropped} | ${candSub.length} | ${candSub.length - sub.length} |`,
			);
		}
	}
	out.push('');

	const dropped = res.rows.filter((r) => r.dropsUnderCandidate);
	if (dropped.length === 0) {
		out.push('**静的判定で落ちる構造は 0 件。**', '');
	} else {
		out.push(`### 静的に落ちる構造の明細（${dropped.length} 件）`, '');
		out.push(
			'| 系列 / 時間足 / swingDepth | type | 構成点（idx@終値） | 実測 | ATR 換算 | `spreadRatio` | 現行実効 | 候補実効 |',
			'|---|---|---|---:|---:|---:|---:|---:|',
		);
		for (const r of dropped.sort((a, b) => b.levelPct - a.levelPct)) {
			const pts = r.idxs.map((i, k) => (k % 2 === 0 ? `${i}` : `(${i})`)).join('-');
			const mains = r.mainPrices.map((p) => jpy(p)).join(' / ');
			out.push(
				`| ${r.seriesLabel} / ${r.tf} / ${sd(r.swingDepth)} | ${r.type}${r.fallback ? ` (${r.fallback})` : ''} | \`${pts}\` 主構成点 ${mains} | ${pct2(r.levelPct)} | ${num2(r.levelPct / atrPct(r.tf))} ATR | ${num3(r.spreadRatio)} | ${pct2(r.effNow)} | ${pct2(r.effCand)} |`,
			);
		}
		out.push('');
	}

	// ablation で消えた / 現れた構造（静的判定との突き合わせ）。差分は main で計算済み。
	const gone = res.ablationGone;
	const added = res.ablationAdded;
	out.push(
		`ablation で**消えた**構造 ${gone.length} 件 / **現れた**構造 ${added.length} 件。`,
		'静的判定で落ちる構造の集合と一致していれば波及は無い。',
		'',
	);
	const mismatchGone = res.ablationGoneUnexplained;
	if (mismatchGone.length > 0) {
		out.push(
			`**静的判定に現れないのに ablation で消えた構造 ${mismatchGone.length} 件**（= 同水準判定以外への波及）:`,
			'',
		);
		out.push(
			'`tolerancePct だけ` / `2 定数だけ` は、3 閾値のうちその側**だけ**を候補値にしたときに',
			'その構造が accepted のまま残るか（残る = その側は原因ではない）。',
			'',
			'| 系列 / 時間足 / swingDepth | type | 構成点 | 実測 | 候補実効 | 候補ビルドでの棄却理由 | `tolerancePct` だけ | 2 定数だけ |',
			'|---|---|---|---:|---:|---|---|---|',
		);
		for (const r of mismatchGone) {
			out.push(
				`| ${r.seriesLabel} / ${r.tf} / ${sd(r.swingDepth)} | ${r.type} | \`${r.idxs.join('-')}\` | ${pct2(r.levelPct)} | ${pct2(r.effCand)} | ${r.reason} | ${r.survivesTolOnly ? '残る' : '消える'} | ${r.survivesCapOnly ? '残る' : '消える'} |`,
			);
		}
		out.push('');
	}
	if (added.length > 0) {
		out.push(`**ablation で新たに現れた構造 ${added.length} 件**（締める変更でも増えることがある = 波及）:`, '');
		out.push('| 系列 / 時間足 / swingDepth | type | 構成点 | 実測 | 候補実効 |', '|---|---|---|---:|---:|');
		for (const r of added) {
			out.push(
				`| ${r.seriesLabel} / ${r.tf} / ${sd(r.swingDepth)} | ${r.type} | \`${r.idxs.join('-')}\` | ${pct2(r.levelPct)} | ${pct2(r.effCand)} |`,
			);
		}
		out.push('');
	}

	// #214 の非恣意性: 候補閾値の近傍に空白帯があるか
	out.push('### 候補閾値は非恣意的か（#214 と同じ基準: 分布の空白帯）', '');
	out.push(
		'| type | 時間足 | 構造 | 候補実効 | 直下の最近傍 | 直上の最近傍 | 隙間 | 分布全体の最大の隙間 |',
		'|---|---|---:|---:|---:|---:|---:|---|',
	);
	for (const t of TYPE_ORDER) {
		for (const tf of tfs) {
			const sub = res.rows.filter((r) => r.type === t && r.tf === tf);
			if (sub.length === 0) continue;
			const eff = Math.max(...sub.map((r) => r.effCand));
			const g = gapReport(
				sub.map((r) => r.levelPct),
				eff,
			);
			out.push(
				`| ${t} | ${tf} | ${sub.length} | ${pct2(eff)} | ${pct2(g.below)} | ${pct2(g.above)} | ${pct2(g.gap)} | ${g.maxGapAt ? `${pct2(g.maxGap)}（${pct2(g.maxGapAt[0])} → ${pct2(g.maxGapAt[1])}）` : '—'} |`,
			);
		}
	}
	out.push('');
	return out;
}

function sectionRelaxed(res: CorpusResult): string[] {
	const out: string[] = [];
	const tfs = [...new Set(res.relaxedNow.map((r) => r.tf))].sort();
	out.push(
		// 行頭が `#227` だと Markdown が ATX 見出しとして解釈する（markdownlint MD018）。
		// 生成物を docs/internal/ に貼るので `issue ` を前置して行頭の `#` を外す。
		'issue #227 と同じ集計（呼び出し = ケース × type）。`strict 0 件率` は relaxed が評価される割合、',
		'`relaxed accepted` は relaxed が実際に候補を返した呼び出し数。',
		'',
		'| type | 時間足 | 呼び出し | strict 0 件率（現行） | 同（候補） | relaxed accepted（現行） | 同（候補） |',
		'|---|---|---:|---:|---:|---:|---:|',
	);
	for (const t of HS_TYPES) {
		for (const tf of tfs) {
			const now = res.relaxedNow.filter((r) => r.type === t && r.tf === tf);
			const cand = res.relaxedCand.filter((r) => r.type === t && r.tf === tf);
			if (now.length === 0) continue;
			const rate = (rows: RelaxedRow[]) =>
				`${((rows.filter((r) => r.strictZero).length / rows.length) * 100).toFixed(1)}%`;
			out.push(
				`| ${t} | ${tf} | ${now.length} | ${rate(now)} | ${cand.length ? rate(cand) : '—'} | ${now.filter((r) => r.relaxedFired).length} | ${cand.filter((r) => r.relaxedFired).length} |`,
			);
		}
	}
	out.push('');
	return out;
}

function sectionFormingMaxBars(res: CorpusResult, build: Build): string[] {
	const out: string[] = [];
	const hs = res.rows.filter((r) => r.fam === 'hs');
	if (hs.length === 0) return ['**accepted な完成済み H&S / 逆 H&S が 0 件。**', ''];
	const tfs = [...new Set(hs.map((r) => r.tf))].sort();
	out.push(
		'完成済み H&S に forming の `getHsFormingBarParams(tf).maxBars` を課した場合（#249 案 C）。',
		'左肩 → 右肩のバー数が上限を超える構造を数える。**採否は Phase 2。ここでは件数と明細のみ。**',
		'',
		'| type | 時間足 | 構造 | 左肩→右肩 min | p50 | max | forming maxBars | 超過 |',
		'|---|---|---:|---:|---:|---:|---:|---:|',
	);
	for (const t of HS_TYPES) {
		for (const tf of tfs) {
			const sub = hs.filter((r) => r.type === t && r.tf === tf);
			if (sub.length === 0) continue;
			const d = dist(sub.map((r) => r.firstToLast));
			const cap = build.getHsFormingBarParams(tf).maxBars;
			out.push(
				`| ${t} | ${tf} | ${sub.length} | ${d.min} | ${d.p50} | ${d.max} | ${cap} | ${sub.filter((r) => r.firstToLast > cap).length} |`,
			);
		}
	}
	out.push('');
	const over = hs.filter((r) => r.firstToLast > build.getHsFormingBarParams(r.tf).maxBars);
	if (over.length === 0) {
		out.push('**超過する構造は 0 件。**', '');
	} else {
		out.push(`### 超過の明細（${over.length} 件）`, '');
		out.push('| 系列 / 時間足 / swingDepth | type | 構成点 | 左肩→右肩 | forming maxBars |', '|---|---|---|---:|---:|');
		for (const r of over.sort((a, b) => b.firstToLast - a.firstToLast)) {
			out.push(
				`| ${r.seriesLabel} / ${r.tf} / ${sd(r.swingDepth)} | ${r.type} | \`${r.idxs.join('-')}\` | ${r.firstToLast} | ${build.getHsFormingBarParams(r.tf).maxBars} |`,
			);
		}
		out.push('');
	}
	return out;
}

// ── 計測 4: 発見元ケース ──

/** issue #244 本文 / #242 の実例。実データ D の `double_top`。 */
const FOUNDING_IDXS = [329, 334, 338];

interface FoundingHit {
	tf: string;
	swingDepth: number | undefined;
	status: string;
	fallback: string | null;
	prices: number[];
	levelPct: number;
	spreadRatio: number | null;
	effNow: number;
	effCand: number;
}

function sectionFounding(build: Build, realD: Corpus | undefined): string[] {
	const out: string[] = [];
	if (!realD) return ['実データ D が未追加のため省略。', ''];
	const hits: FoundingHit[] = [];
	const seen = new Set<string>();
	for (const spec of realD.cases) {
		const dbg: CandDebugEntry[] = [];
		const ctx = buildCtx(spec, dbg);
		for (const p of build.detectDoubles(ctx).patterns) {
			const pv = (p as { pivots?: Pivot[] }).pivots;
			if (!Array.isArray(pv) || pv.length !== 3) continue;
			if (pv.map((q) => q.idx).join('-') !== FOUNDING_IDXS.join('-')) continue;
			const key = `${spec.tf}|${sd(spec.swingDepth)}|${String(p.status ?? 'completed')}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const main = [pv[0], pv[2]];
			const factor = relaxedFactorOf(typeof p._fallback === 'string' ? p._fallback : undefined);
			const cand = candidateFor(spec.tf);
			hits.push({
				tf: spec.tf,
				swingDepth: spec.swingDepth,
				status: String(p.status ?? 'completed'),
				fallback: typeof p._fallback === 'string' ? p._fallback : null,
				prices: main.map((q) => q.price),
				levelPct: relDiff(main[0].price, main[1].price),
				spreadRatio: spreadRatioOf(main, pv).spreadRatio,
				effNow: effectivePriceThreshold(
					'double',
					ctx.tolerancePct,
					factor,
					build.DOUBLE_LEVEL_MAX_PCT,
					build.HS_SHOULDER_MAX_PCT,
				),
				effCand: effectivePriceThreshold('double', cand.tol, factor, cand.double, cand.hs),
			});
		}
	}
	if (hits.length === 0) {
		out.push(`**\`${FOUNDING_IDXS.join('-')}\` の \`double_top\` が実データ D の候補に 1 件も現れない。**`, '');
		return out;
	}
	out.push(
		'| 時間足 / swingDepth | status | 山1 終値 | 山2 終値 | 実測 `relDiff` | ATR 換算 | `spreadRatio` | 現行実効 | 候補実効 | 候補での判定 |',
		'|---|---|---:|---:|---:|---:|---:|---:|---:|---|',
	);
	for (const h of hits) {
		out.push(
			`| ${h.tf} / ${sd(h.swingDepth)} | ${h.status} | ${jpy(h.prices[0])} | ${jpy(h.prices[1])} | ${pct2(h.levelPct)} | ${num2(h.levelPct / atrPct(h.tf))} ATR | ${num3(h.spreadRatio)} | ${pct2(h.effNow)} | ${pct2(h.effCand)} | **${h.levelPct > h.effCand ? '落ちる' : '通る'}** |`,
		);
	}
	out.push('');
	return out;
}

// ── main ──

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const jsonAt = argv.indexOf('--json');
	const jsonPath = jsonAt >= 0 ? argv[jsonAt + 1] : undefined;

	const base = await loadBuild('base', {});
	// 候補ビルドは時間足ごとに定数が違うので、`(double, hs)` の組ごとに 1 つ作って使い回す。
	const candBuilds = new Map<string, Build>();
	const buildForTf = async (tf: string): Promise<Build> => {
		const c = candidateFor(tf);
		const key = `${c.double}_${c.hs}`;
		const cached = candBuilds.get(key);
		if (cached) return cached;
		const b = await loadBuild(`cand_${key.replace(/\./g, '')}`, {
			DOUBLE_LEVEL_MAX_PCT: c.double,
			HS_SHOULDER_MAX_PCT: c.hs,
		});
		candBuilds.set(key, b);
		return b;
	};

	const corpora = await buildCorpus();
	// 使う時間足ぶんの候補ビルドを先に作る。
	for (const tf of new Set(corpora.flatMap((c) => c.cases.map((s) => s.tf)))) await buildForTf(tf);

	const results: CorpusResult[] = [];
	let cases = 0;
	for (const corpus of corpora) {
		const rows: LevelRow[] = [];
		const candRows: LevelRow[] = [];
		const relaxedNow: RelaxedRow[] = [];
		const relaxedCand: RelaxedRow[] = [];
		for (const spec of corpus.cases) {
			cases++;
			// 検算: 展開した base ビルドが作業ツリーの本物と JSON 全キー一致すること。
			// **数えるだけにせず、最初の 1 件で落とす**（PR #253 の CodeRabbit 指摘）。
			for (const [name, mine, real] of [
				['detectDoubles', base.detectDoubles, realDetectDoubles],
				['detectTriples', base.detectTriples, realDetectTriples],
				['detectHeadAndShoulders', base.detectHeadAndShoulders, realDetectHs],
			] as ReadonlyArray<readonly [string, Detector, Detector]>) {
				const a = JSON.stringify(mine(buildCtx(spec, [])));
				const b = JSON.stringify(real(buildCtx(spec, [])));
				if (a !== b) {
					throw new Error(
						`展開した base ビルドの ${name} が本物と食い違った（${corpus.label} / ${spec.series.name} / ` +
							`${spec.tf} / swingDepth=${sd(spec.swingDepth)} / opts=${JSON.stringify(spec.opts)}）。` +
							'「展開しても判定は不変」という前提が崩れているので、以降の計測は無効。',
					);
				}
			}
			const cand = candidateFor(spec.tf);
			const candBuild = await buildForTf(spec.tf);
			rows.push(...collectLevelRows(base, spec, cand, undefined));
			candRows.push(...collectLevelRows(candBuild, spec, cand, cand.tol));
			relaxedNow.push(...collectRelaxedRows(base, spec, undefined));
			relaxedCand.push(...collectRelaxedRows(candBuild, spec, cand.tol));
		}
		const folded = foldRows(rows);
		const foldedCand = foldRows(candRows);
		const beforeKeys = new Set(folded.map((r) => structureKey(r)));
		const afterKeys = new Set(foldedCand.map((r) => structureKey(r)));
		const ablationGone = folded.filter((r) => !afterKeys.has(structureKey(r)));
		const ablationAdded = foldedCand.filter((r) => !beforeKeys.has(structureKey(r)));
		const staticSet = new Set(folded.filter((r) => r.dropsUnderCandidate).map((r) => structureKey(r)));
		const ablationGoneUnexplained: UnexplainedRow[] = [];
		for (const r of ablationGone) {
			if (staticSet.has(structureKey(r))) continue;
			const cand = candidateFor(r.tf);
			const candBuild = await buildForTf(r.tf);
			ablationGoneUnexplained.push({
				...r,
				reason: replayReason(candBuild, corpus.cases, r, cand.tol),
				// 3 閾値のどれが効いたかを切り分ける。`tolerancePct` だけ / 2 定数だけ を別々に当てる。
				survivesTolOnly: stillAccepted(base, corpus.cases, r, cand.tol),
				survivesCapOnly: stillAccepted(candBuild, corpus.cases, r, undefined),
			});
		}
		results.push({
			label: corpus.label,
			tfAuthoritative: corpus.tfAuthoritative,
			n: corpus.cases.length,
			rows: folded,
			candRows: foldedCand,
			relaxedNow,
			relaxedCand,
			ablationGone,
			ablationAdded,
			ablationGoneUnexplained,
		});
	}

	const lines: string[] = [];
	lines.push('# 同水準判定（価格相対 3 つ）の時間足追従の実測（issue #244 Phase 1）', '');
	lines.push(
		'`scripts/measure_level_pct_tf_244.ts` の出力をそのまま貼ったもの。',
		'**検出器・`config.ts`・`structural.ts` は 1 行も変更していない**——候補ビルドは',
		'`tools/patterns/` を一時領域へ展開し、`structural.ts` の 2 定数の**数値リテラルだけ**を',
		'差し替えた複製で、作業ツリーには触れていない。',
		'',
	);

	lines.push('## 0. ハーネスと検算', '');
	lines.push('| 項目 | 値 |', '|---|---:|');
	lines.push(`| ケース数 | ${cases} |`);
	lines.push(`| \`DOUBLE_LEVEL_MAX_PCT\`（作業ツリー） | ${base.DOUBLE_LEVEL_MAX_PCT} |`);
	lines.push(`| \`HS_SHOULDER_MAX_PCT\`（作業ツリー） | ${base.HS_SHOULDER_MAX_PCT} |`);
	lines.push(`| \`MAX_LEVEL_SPREAD_RATIO\`（作業ツリー） | ${base.MAX_LEVEL_SPREAD_RATIO} |`);
	lines.push(`| 候補ビルド数 | ${candBuilds.size} |`);
	lines.push('');
	lines.push(
		'検算は**全ケースで実行**しており、1 件でも食い違えばスクリプトが例外で落ちる',
		'（この表が出ている時点で一致している）。',
		'',
		'1. 展開した `base` ビルドの `detectDoubles` / `detectTriples` / `detectHeadAndShoulders` が',
		'   作業ツリーの本物と JSON 全キー一致すること',
		'2. 候補ビルドの `DOUBLE_LEVEL_MAX_PCT` / `HS_SHOULDER_MAX_PCT` が意図した値で import できること',
		'   （正規表現が通っても別の宣言に当たっていれば意味が無いので、値で確かめる）',
		'',
	);

	lines.push('## 1. 候補テーブル（`getSizeThresholdsForTf` と同じ ATR 比）', '');
	lines.push(
		'| 時間足 | ATR 比 | 由来 | `DOUBLE_LEVEL_MAX_PCT` | `HS_SHOULDER_MAX_PCT` | `tolerancePct`（現行 → 候補） |',
		'|---|---:|---|---:|---:|---|',
	);
	for (const tf of TF_TABLE_ORDER) {
		const c = candidateFor(tf);
		const origin = tf === '1hour' || tf === '1day' ? '**実測**' : c.ratio === 1 ? '据え置き' : '√t 推定';
		const held = c.ratio === 1 ? '（据え置き）' : '';
		lines.push(
			`| \`${tf}\` | ${c.ratio.toFixed(4)} | ${origin} | ${pct2(c.double)}${held} | ${pct2(c.hs)}${held} | ${pct2(getDefaultToleranceForTf(tf))} → ${pct2(c.tol)}${held} |`,
		);
	}
	lines.push('');
	lines.push(
		'**`tolerancePct` の `1day` 以上は現行の tf-auto 値を据え置く。** アンカー 0.04 を機械的に当てると',
		'`1week` 3.5% → 4% / `1month` 3% → 4% と**緩む**方向になり、#152 の約束 2 と本 issue の',
		'「締める方向」の両方に反する。',
		'',
	);

	lines.push('## 2. 律速関係（strict / relaxed の価格相対の実効閾値）', '');
	lines.push(
		'`structural.ts` の 2 つの docstring が持つ律速表を、**候補テーブルでどう変わるか**まで広げたもの。',
		'relaxed の係数は `detect_doubles.ts` の `RELAXED_TOLERANCE_FACTOR = 1.3`、',
		'`detect_hs.ts` の `RELAXED_FACTORS` の `shoulder`（1.6 / 2.0）、',
		'`detect_triples.ts` の relaxed 係数（1.25 / 2.0）。',
		'',
		'| 時間足 | double strict | double relaxed(×1.3) | H&S strict | H&S relaxed(×1.6) | H&S relaxed(×2.0) | triple strict |',
		'|---|---|---|---|---|---|---|',
	);
	for (const tf of TF_TABLE_ORDER) {
		const c = candidateFor(tf);
		const now = getDefaultToleranceForTf(tf);
		const cell = (fam: Fam, factor: number) =>
			`${pct2(effectivePriceThreshold(fam, now, factor, base.DOUBLE_LEVEL_MAX_PCT, base.HS_SHOULDER_MAX_PCT))} → ${pct2(effectivePriceThreshold(fam, c.tol, factor, c.double, c.hs))}`;
		lines.push(
			`| \`${tf}\` | ${cell('double', 1)} | ${cell('double', 1.3)} | ${cell('hs', 1)} | ${cell('hs', 1.6)} | ${cell('hs', 2.0)} | ${cell('triple', 1)} |`,
		);
	}
	lines.push('');

	for (const res of results) {
		const build = base;
		lines.push(`## ${res.label}（${res.n} ケース）`, '');
		lines.push(
			res.tfAuthoritative
				? '**時間足別の結論に使える母集団**（実 1hour 365 本）。'
				: '**時間足別の結論には使えない母集団**（#178: 実データ A の `4hour` / `1hour` は同じ 1day 90 本に `tf` ラベルを付け替えたもの。合成 704 も同様）。参考値。',
			'',
		);
		lines.push('### 計測 1: 同水準判定の実測値の分布（accepted な完成済みのみ）', '');
		lines.push(...sectionDistribution(res, build));
		lines.push('### 計測 2: 候補テーブルで落ちる件数と明細', '');
		lines.push(...sectionCandidateDrops(res));
		lines.push('### 計測 3: relaxed 経路への影響', '');
		lines.push(...sectionRelaxed(res));
		lines.push('### 計測 5: #249 案 C（完成済み H&S の全長上限）', '');
		lines.push(...sectionFormingMaxBars(res, build));
	}

	lines.push('## 計測 4: 発見元ケース（実データ D の `double_top 329-334-338`）の検算', '');
	lines.push(
		...sectionFounding(
			base,
			corpora.find((c) => c.cases[0]?.series.group === 'realD'),
		),
	);

	const text = lines.join('\n');
	console.log(text);
	if (jsonPath) {
		writeFileSync(
			jsonPath,
			JSON.stringify(
				{
					cases,
					constants: {
						DOUBLE_LEVEL_MAX_PCT: base.DOUBLE_LEVEL_MAX_PCT,
						HS_SHOULDER_MAX_PCT: base.HS_SHOULDER_MAX_PCT,
						MAX_LEVEL_SPREAD_RATIO: base.MAX_LEVEL_SPREAD_RATIO,
					},
					candidateTable: Object.fromEntries(TF_TABLE_ORDER.map((tf) => [tf, candidateFor(tf)])),
					corpora: results,
				},
				null,
				2,
			),
		);
		console.error(`\n[json] ${jsonPath}`);
	}
}

await main();
