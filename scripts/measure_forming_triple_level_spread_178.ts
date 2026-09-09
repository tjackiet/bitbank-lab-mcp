/**
 * issue #178 項目 1 Phase 1: **形成中 triple の同水準判定**が価格相対のままである件を実測する。
 * **検出器・`structural.ts`・`config.ts`・ベースラインは 1 行も変更しない**（計測とドキュメントだけ）。
 *
 * ## 問題設定（コードの事実）
 *
 * `tools/patterns/detect_triples.ts` の形成中 2 経路（`tryFormingTripleTop` /
 * `tryFormingTripleBottom`）は、3 点（`peak1` / `peak2` / 最新足の終値）の同水準性を
 * **価格相対だけ**で見ている:
 *
 * ```ts
 * const levelSpreadLimit = tolerancePct * FORMING_TOLERANCE_MULTIPLIER * FORMING_LEVEL_SPREAD_FACTOR;
 * const levelSpread = (levelMax - levelMin) / Math.max(1, levelMax);   // 分母 = 価格水準
 * if (levelSpread > levelSpreadLimit) → 'forming_peaks_not_level'
 * ```
 *
 * 完成済み経路が持つ高さ相対の hard gate（`validateLevelSpread` /
 * `MAX_LEVEL_SPREAD_RATIO = 0.5`。#138 / PR #176）が**形成中には無い**。
 *
 * ## 主指標（本 Phase の答えるべき 1 つ）
 *
 * **「形成中として出力されるが、同じ 3 点で完成した瞬間に `peak_spread_vs_height_excess` で
 * 落ちる候補」の件数。** 利用者は「トリプルトップ形成中」を見せられたのに、それは定義上
 * トリプルトップとして完成できない。0 件なら「今のままでよい」で閉じる根拠になる。
 *
 * ## 出すもの（issue #178 項目 1 Phase 1 の 1〜5）
 *
 * | § | 内容 |
 * |---|---|
 * | 1 | 形成中 triple の同水準指標の分布（accepted な forming のみ。価格相対 `levelSpread` と高さ相対 `spreadRatio`） |
 * | 2 | **主指標**: `spreadRatio > MAX_LEVEL_SPREAD_RATIO` の件数と明細、およびその後の追跡 |
 * | 3 | 逆向き: `validateLevelSpread` を形成中に配線した ablation（`maxRatio` = 0.5 / 0.6 / 0.75 / 1.0） |
 * | 4 | 形成中 double の同じ量（実装対象は本 Phase では決めない） |
 * | 5 | 波及の確認（`FORMING_*` 係数の独立性 / `view=debug` の cap / `confidence` との整合） |
 *
 * ## ハーネス
 *
 * `scripts/measure_hs_shoulder_window_249.ts` / `measure_level_pct_tf_244.ts` に倣い、
 * **`tools/patterns/` をディレクトリごと**一時領域へ展開して読む。検出器 1 ファイルだけを
 * 写すと `./structural.js` が作業ツリーへ解決され、ablation ビルドに現行実装が混ざる。
 *
 * 展開の目的は 2 つ:
 *
 * - **`base`**: 末尾に `export { … }` を 1 行足すだけで**本体は 1 文字も変えない**ビルド
 *   （{@link INTERNAL_EXPORTS}）。作業ツリーの本物と `patterns` / `debugCandidates` が
 *   **全ケースで**一致することを検算する（1 件でも食い違えばその場で例外）。§1〜§2 / §4 の
 *   分布は全部このビルドの出力。
 * - **ablation ビルド**: 形成中 2 経路の**構造ゲート通過後**に `validateLevelSpread` を
 *   1 ブロック挿入したビルド（§3）。挿入点は完成済み経路の配置規約（「既存の棄却検査を
 *   すべて通過した後」）と同じで、アンカーが**ちょうど 1 回**現れることを挿入前に確認し、
 *   挿入後にマーカーが**ちょうど 2 回**（top / bottom）現れることを確認する。
 *   `maxRatio = 999`（実質無効）のビルドが `base` と全ケースで一致することも検算するので、
 *   **差分はゲートのみに帰属する**（#178 項目 3 のコメントと同じ流儀）。
 *
 * **作業ツリーは 1 バイトも変えない。** 展開先は `mkdtemp` の一時ディレクトリ。
 *
 * ### `view=debug` ではなく検出器内採取である理由
 *
 * 実データ B は `view=debug` が常に飽和する（96/96 で `candidatesOmitted > 0`、
 * `candidatesTotal` 最大 2,914 / cap 200。#178 本文）。本スクリプトは検出器を直接呼んで
 * **cap を掛けない生の `debugCandidates`** を読むので、押し出しの影響を受けない。
 * cap 自体の影響は §5 で `detect_patterns.ts` と同じ並べ替え（accepted → 型間排他 → 棄却）を
 * 再現して別途測る。
 *
 * ## コーパス
 *
 * 標準 800（合成 704 + 実データ A 96）＋ 実データ B / C / D 各 96 ＋ **ローリング窓**。
 * **プールしない**（#219）。
 *
 * 形成中は「最新足」の位置で結果が決まるので、固定窓だけでは母集団が薄い。実データ B / C / D
 * それぞれについて**窓の終端を 1 本ずつずらす**ローリング（末尾 60〜365 本。`limit` は 365 の
 * まま終端だけ動かす）を足す。#244 の窓長スイープ（8 点）より密。
 *
 * ローリングは同じ構造を何度も数えるので、集計は**構造単位**（`(系列, 時間足, type, peak1/peak2 の
 * idx)` で畳む）と**延べ**の両方を出す。
 *
 * **注意（#178 より）**: 標準コーパスの「実データ A 96」は `btc_jpy_1day_2026` の同じ 90 本に
 * `tf` ラベルを付け替えたもので、時間足別の内訳は独立系列ではない。**時間足別の結論は
 * 実データ B / C / D（実 1hour 365 本）と実データ A の 1day だけから出す。**
 *
 * ## 使い方
 *
 * ```bash
 * npx tsx scripts/measure_forming_triple_level_spread_178.ts
 * npx tsx scripts/measure_forming_triple_level_spread_178.ts --json /tmp/178.json
 * npx tsx scripts/measure_forming_triple_level_spread_178.ts --no-rolling   # ローリング窓を省く（短時間確認用）
 * ```
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nowIso } from '../lib/datetime.js';
import { buildBtcJpy2026Candles } from '../tests/fixtures/btc_jpy_1day_2026.js';
import { buildBtcJpy1hour202608Candles } from '../tests/fixtures/btc_jpy_1hour_2026_08.js';
import { buildBtcJpy1hour202609Candles } from '../tests/fixtures/btc_jpy_1hour_2026_09.js';
import * as synth from '../tests/fixtures/synthetic_pattern_candles.js';
import { filterCandidatesByWant } from '../tools/patterns/candidate-filter.js';
import { getHsShoulderMaxPctForTf, getSizeThresholdsForTf, resolveParams } from '../tools/patterns/config.js';
import { detectDoubles as realDetectDoubles } from '../tools/patterns/detect_doubles.js';
import { detectTriples as realDetectTriples } from '../tools/patterns/detect_triples.js';
import { TRIPLE_HS_EXCLUSION_REASON } from '../tools/patterns/mutual-exclusion.js';
import { linearRegressionWithR2, near as nearFn, pct as pctFn } from '../tools/patterns/regression.js';
import { type Candle, detectSwingPoints, filterPeaks, filterValleys, type Pivot } from '../tools/patterns/swing.js';
import type { CandDebugEntry, DeduplicablePattern, DetectContext } from '../tools/patterns/types.js';

const ROOT = resolve(import.meta.dirname, '..');
const TMP_DIR = mkdtempSync(join(tmpdir(), 'forming-triple-178-'));

type Detector = (ctx: DetectContext) => { patterns: DeduplicablePattern[] };

/**
 * 1 ビルドぶんの検出器と、そのビルドが実際に持っている形成中の係数。
 *
 * **係数は検出器と同じ展開ディレクトリから読む。** 作業ツリーから取ると、ablation ビルドの
 * 表示だけが別ソースの値になる（PR #253 の CodeRabbit 指摘と同じ穴）。
 */
interface Build {
	detectTriples: Detector;
	detectDoubles: Detector;
	FORMING_TOLERANCE_MULTIPLIER: number;
	FORMING_LEVEL_SPREAD_FACTOR: number;
	FORMING_NECKLINE_SPREAD_FACTOR: number;
	FORMING_STAIR_STEP_LIMIT: number;
	FORMING_MAX_CONFIDENCE: number;
	FORMING_MIN_CONFIDENCE: number;
	MAX_LEVEL_SPREAD_RATIO: number;
	levelSpreadMetrics: typeof import('../tools/patterns/structural.js').levelSpreadMetrics;
	validateMainPointsNecklineSide: typeof import('../tools/patterns/structural.js').validateMainPointsNecklineSide;
}

/**
 * 展開先のファイル末尾に足す export（ファイル名 → 追記する 1 行）。
 *
 * **既に export されている宣言は書かない**（`FORMING_MIN_DAYS` / `FORMING_MIN_COMPLETION` /
 * `getTripleFormingBarParams`）——重複 export は構文エラーになる。追記するのはモジュール内で
 * 閉じていた `const` だけで、**宣言に名前を付け直すだけなので判定は 1 ミリも変わらない。**
 * それを §0 の検算が全ケースで確かめる。
 */
const INTERNAL_EXPORTS: Readonly<Record<string, string>> = {
	'detect_triples.ts':
		'\nexport { FORMING_TOLERANCE_MULTIPLIER, FORMING_LEVEL_SPREAD_FACTOR, FORMING_NECKLINE_SPREAD_FACTOR, FORMING_STAIR_STEP_LIMIT, FORMING_MAX_CONFIDENCE, FORMING_MIN_CONFIDENCE };\n',
};

/** ablation で挿入するブロックの目印。挿入後にちょうど 2 回現れることを確認する。 */
const ABLATION_MARKER = '__abl178_levelSpread';

/**
 * ablation の挿入点。**完成済み経路と同じ配置規約**（「既存の棄却検査をすべて通過した後」）に
 * 合わせて、構造ゲート `applyReversalGate` の**後ろ**・成功エントリの**前**へ入れる。
 *
 * アンカーは各形成中経路のターゲット計算行。`detect_triples.ts` 内で**それぞれ 1 回だけ**
 * 現れることを {@link materializePatternsDir} が挿入前に確認する（相対ターゲットの
 * `ttRelTarget` / `tbRelTarget` とは別の識別子なので衝突しない）。
 */
const ABLATION_ANCHORS: ReadonlyArray<{
	readonly side: 'top' | 'bottom';
	readonly anchor: string;
	readonly type: string;
	readonly main1: string;
	readonly main2: string;
	readonly mid1: string;
	readonly mid2: string;
	readonly roles: readonly [string, string, string, string];
}> = [
	{
		side: 'top',
		anchor: 'const formTtTarget = ',
		type: 'triple_top',
		main1: 'peak1',
		main2: 'peak2',
		mid1: 'v1',
		mid2: 'v2',
		roles: ['peak1', 'valley1', 'peak2', 'valley2'],
	},
	{
		side: 'bottom',
		anchor: 'const formTbTarget = ',
		type: 'triple_bottom',
		main1: 'valley1',
		main2: 'valley2',
		mid1: 'pTop1',
		mid2: 'pTop2',
		roles: ['valley1', 'peak1', 'valley2', 'peak2'],
	},
];

/**
 * ablation で挿入するコード。**`current` は #169 の idiom（`{ price: 終値, extremePrice: 終値 }`）**で
 * 渡す——形成中の最新足は確定ピボットではないので `extremePrice` を持たない。
 *
 * 理由コードは `forming_` 接頭辞を付けて**新設する**。完成済みの
 * `peak_spread_vs_height_excess` をそのまま流用すると、#193 / PR #194 の
 * **`▼ reason 横断合計`（type を畳んで reason だけで合算する行）で形成中と完成済みが
 * 1 つの数字に潰れる**（#178 本文の注意）。
 */
function ablationBlock(spec: (typeof ABLATION_ANCHORS)[number], maxRatio: number): string {
	const { side, type, main1, main2, mid1, mid2, roles } = spec;
	const pts = [
		`{ role: '${roles[0]}', idx: ${main1}.idx, price: ${main1}.price }`,
		`{ role: '${roles[1]}', idx: ${mid1}.idx, price: ${mid1}.price }`,
		`{ role: '${roles[2]}', idx: ${main2}.idx, price: ${main2}.price }`,
		`{ role: '${roles[3]}', idx: ${mid2}.idx, price: ${mid2}.price }`,
		`{ role: 'current', idx: lastIdx, price: currentPrice }`,
	].join(',\n\t\t\t\t\t');
	return [
		`\t\t// [ablation issue #178 項目 1 Phase 1] 形成中経路へ validateLevelSpread を配線した場合。`,
		`\t\t// 計測ハーネスが挿入したブロックで、作業ツリーには存在しない。`,
		`\t\tconst ${ABLATION_MARKER} = levelSpreadMetrics(`,
		`\t\t\t[${main1}, ${main2}, { price: currentPrice }],`,
		`\t\t\t[${main1}, ${mid1}, ${main2}, ${mid2}, { extremePrice: currentPrice }],`,
		`\t\t);`,
		`\t\tconst ${ABLATION_MARKER}Reason = validateLevelSpread('${side}', ${ABLATION_MARKER}, ${maxRatio});`,
		`\t\tif (${ABLATION_MARKER}Reason) {`,
		`\t\t\tpcand({`,
		`\t\t\t\ttype: '${type}',`,
		`\t\t\t\taccepted: false,`,
		`\t\t\t\treason: \`forming_\${${ABLATION_MARKER}Reason}\`,`,
		`\t\t\t\tidxs: [${main1}.idx, ${main2}.idx, lastIdx],`,
		`\t\t\t\tpts: [\n\t\t\t\t\t${pts},\n\t\t\t\t],`,
		`\t\t\t\tdetails: levelSpreadDetailsFrom(${ABLATION_MARKER}, levelSpreadLimit),`,
		`\t\t\t});`,
		`\t\t\tcontinue;`,
		`\t\t}`,
		'',
	].join('\n');
}

/**
 * 作業ツリーの `tools/patterns/` を**ディレクトリごと**一時領域へ展開する
 * （`measure_hs_shoulder_window_249.ts` / `measure_level_pct_tf_244.ts` の同名関数と同じ流儀）。
 *
 * @param variant 展開先ディレクトリ名の識別子
 * @param ablationMaxRatio 指定したら形成中 2 経路へ ablation ブロックを挿入する
 */
function materializePatternsDir(variant: string, ablationMaxRatio?: number): string {
	const files = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', 'tools/patterns/'], {
		cwd: ROOT,
		encoding: 'utf8',
	})
		.split('\n')
		.map((s) => s.trim())
		.filter((s) => s.endsWith('.ts'));
	if (files.length === 0) throw new Error('tools/patterns/ に .ts が 1 つも無い。');

	// `git ls-tree -r` は再帰なので、将来サブディレクトリができるとネストしたパスが返る。
	// 下の import 書き換えはフラット前提なので、**そのときは書き込む前に落とす**（PR #250 の指摘）。
	const nested = files.find((p) => p.slice('tools/patterns/'.length).includes('/'));
	if (nested !== undefined) {
		throw new Error(
			`tools/patterns/ にサブディレクトリがある（${nested}）。本関数の import 書き換えは` +
				'フラット前提なので相対パスの解決を誤る。ネストを導入したなら書き換えを深さ対応にすること。',
		);
	}

	const dir = join(TMP_DIR, `patterns_${variant}`);
	mkdirSync(dir, { recursive: true });
	// 拡張子 `.ts` のまま ESM として読ませるための最小マニフェスト（一時ディレクトリには親が無い）。
	writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n');

	for (const path of files) {
		const name = path.slice('tools/patterns/'.length);
		let src = readFileSync(join(ROOT, path), 'utf8');

		if (ablationMaxRatio !== undefined && name === 'detect_triples.ts') {
			for (const spec of ABLATION_ANCHORS) {
				const hits = src.split(spec.anchor).length - 1;
				if (hits !== 1) {
					throw new Error(
						`ablation の挿入点アンカー '${spec.anchor}' が detect_triples.ts に ${hits} 回現れる（期待 1 回）。` +
							'形成中経路の実装が変わったので、挿入点を取り直すこと。',
					);
				}
				src = src.replace(spec.anchor, `${ablationBlock(spec, ablationMaxRatio)}\t\t${spec.anchor}`);
			}
			const markers = src.split(`const ${ABLATION_MARKER} = `).length - 1;
			if (markers !== ABLATION_ANCHORS.length) {
				throw new Error(`ablation ブロックが ${markers} 箇所にしか入っていない（期待 ${ABLATION_ANCHORS.length}）。`);
			}
		}

		const rewritten = src
			// ディレクトリ外への import は作業ツリーの絶対パスへ。
			.replace(/from '\.\.\/\.\.\//g, `from '${ROOT}/`)
			// `../patterns/` は**同ディレクトリの別名**。下の汎用 `../` 規則より先に畳む。
			.replace(/from '\.\.\/patterns\//g, "from './")
			.replace(/from '\.\.\//g, `from '${ROOT}/tools/`);
		// `from './` は書き換えない——展開先の中で解決させるのが本関数の目的。
		writeFileSync(join(dir, name), rewritten + (INTERNAL_EXPORTS[name] ?? ''));
	}
	return dir;
}

/** 1 ビルドぶんの検出器と係数を、**同じ展開ディレクトリから**読む。 */
async function loadBuild(variant: string, ablationMaxRatio?: number): Promise<Build> {
	const dir = materializePatternsDir(variant, ablationMaxRatio);
	const triples = (await import(pathToFileURL(join(dir, 'detect_triples.ts')).href)) as unknown as Build;
	const doubles = (await import(pathToFileURL(join(dir, 'detect_doubles.ts')).href)) as unknown as {
		detectDoubles: Detector;
	};
	const structural = (await import(
		pathToFileURL(join(dir, 'structural.ts')).href
	)) as unknown as typeof import('../tools/patterns/structural.js');
	return {
		detectTriples: triples.detectTriples,
		detectDoubles: doubles.detectDoubles,
		FORMING_TOLERANCE_MULTIPLIER: triples.FORMING_TOLERANCE_MULTIPLIER,
		FORMING_LEVEL_SPREAD_FACTOR: triples.FORMING_LEVEL_SPREAD_FACTOR,
		FORMING_NECKLINE_SPREAD_FACTOR: triples.FORMING_NECKLINE_SPREAD_FACTOR,
		FORMING_STAIR_STEP_LIMIT: triples.FORMING_STAIR_STEP_LIMIT,
		FORMING_MAX_CONFIDENCE: triples.FORMING_MAX_CONFIDENCE,
		FORMING_MIN_CONFIDENCE: triples.FORMING_MIN_CONFIDENCE,
		MAX_LEVEL_SPREAD_RATIO: structural.MAX_LEVEL_SPREAD_RATIO,
		levelSpreadMetrics: structural.levelSpreadMetrics,
		validateMainPointsNecklineSide: structural.validateMainPointsNecklineSide,
	};
}

// ── コーパス（#242 / #243 / #244 / #249 と同じ組み方） ──

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
	/** ローリング窓の終端 idx（フル系列なら `candles.length - 1`）。 */
	windowEnd: number;
	/** ローリング窓か（集計を分けるため）。 */
	rolling: boolean;
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

/** MCP の統合オプション 3 つの全組み合わせ（ケース数の単位を #211 / #216 / #242 / #244 / #249 と揃える）。 */
const OPTS8: CaseOpts[] = Array.from({ length: 8 }, (_, b) => ({
	includeForming: (b & 1) !== 0,
	includeCompleted: (b & 2) !== 0,
	includeInvalid: (b & 4) !== 0,
}));

/**
 * ローリング窓で固定する統合オプション。
 *
 * **`includeForming: true` だけが形成中経路の発火を左右する**（`detect_triples.ts` の 6b 節は
 * `if (includeForming && …)` でしか分岐しない）ので、ローリングでは 8 通りを回さず
 * **全部 true の 1 通り**に固定する。8 倍のケース数を払っても同じ候補が 8 回積まれるだけで、
 * 構造単位の集計は変わらない。固定したことは §0 に出す。
 */
const ROLLING_OPTS: CaseOpts = { includeForming: true, includeCompleted: true, includeInvalid: true };

/** ローリング窓の最小の窓長（末尾 60 本から 1 本ずつ伸ばす）。 */
const ROLLING_MIN_BARS = 60;

/** 実データ系列 1 本ぶんのケース（時間足 3 種 × `swingDepth` 4 種 × オプション 8 通り = 96）。 */
function realCases(series: Series): CaseSpec[] {
	const out: CaseSpec[] = [];
	const windowEnd = series.candles.length - 1;
	for (const tf of ['1day', '4hour', '1hour']) {
		for (const swingDepth of [undefined, 2, 3, 6]) {
			for (const opts of OPTS8) out.push({ series, tf, swingDepth, opts, windowEnd, rolling: false });
		}
	}
	return out;
}

/**
 * 実データ 1 系列のローリング窓ケース。窓は**先頭固定・終端を 1 本ずつ動かす**
 * （`limit` は 365 のままで終端だけ動かす、という指定の実装）。
 *
 * 先頭固定にしてあるので**ピボットの idx が窓をまたいで安定する**——§2 の「その後どうなったか」の
 * 追跡が、同じ `peak1`/`peak2` の idx で結べるのはこのため。
 */
function rollingCases(series: Series): CaseSpec[] {
	const out: CaseSpec[] = [];
	for (let end = ROLLING_MIN_BARS - 1; end < series.candles.length; end++) {
		for (const tf of ['1day', '4hour', '1hour']) {
			for (const swingDepth of [undefined, 2, 3, 6]) {
				out.push({ series, tf, swingDepth, opts: ROLLING_OPTS, windowEnd: end, rolling: true });
			}
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

interface CorpusPart {
	label: string;
	/** 時間足別の結論に使える母集団か（実 1hour 系列 / 実データ A の 1day のみ true）。 */
	tfAuthoritative: boolean;
	cases: CaseSpec[];
}

/** 標準コーパス 800 と実データ B / C / D、およびそれぞれのローリング窓。**プールしない**（#219）。 */
async function buildCorpus(includeRolling: boolean): Promise<CorpusPart[]> {
	const standard: CaseSpec[] = [];
	for (const [name, build] of SYNTHETIC_BUILDERS) {
		const series: Series = { group: 'synthetic', name, candles: build() };
		const windowEnd = series.candles.length - 1;
		for (const tf of ['1day', '1hour']) {
			for (const swingDepth of [2, 3]) {
				for (const opts of OPTS8) standard.push({ series, tf, swingDepth, opts, windowEnd, rolling: false });
			}
		}
	}
	const realA: Series = { group: 'realA', name: 'btc_jpy_1day_2026', candles: buildBtcJpy2026Candles() as Candle[] };
	standard.push(...realCases(realA));

	const realB: Series = {
		group: 'realB',
		name: 'btc_jpy_1hour_2026_08',
		candles: buildBtcJpy1hour202608Candles() as Candle[],
	};
	const realC: Series = {
		group: 'realC',
		name: 'btc_jpy_1hour_2026_09',
		candles: buildBtcJpy1hour202609Candles() as Candle[],
	};
	const realD = await loadRealD();

	const out: CorpusPart[] = [
		{
			label: `標準コーパス ${standard.length}（合成 704 + 実データ A 96）`,
			tfAuthoritative: false,
			cases: standard,
		},
		{ label: '実データ B 96（`btc_jpy_1hour_2026_08`）', tfAuthoritative: true, cases: realCases(realB) },
		{ label: '実データ C 96（`btc_jpy_1hour_2026_09`）', tfAuthoritative: true, cases: realCases(realC) },
	];
	if (realD)
		out.push({ label: '実データ D 96（`btc_jpy_1hour_2026_09_05`）', tfAuthoritative: true, cases: realCases(realD) });

	if (includeRolling) {
		for (const s of [realB, realC, ...(realD ? [realD] : [])]) {
			const cases = rollingCases(s);
			out.push({
				label:
					`ローリング窓 ${cases.length}（\`${s.name}\` の末尾 ${ROLLING_MIN_BARS}〜${s.candles.length} 本 ` +
					'× 時間足 3 × swingDepth 4）',
				tfAuthoritative: true,
				cases,
			});
		}
	}
	return out;
}

/** `detect_patterns.ts` と同じ順序で `DetectContext` を組む。 */
function buildCtx(spec: CaseSpec, debugCandidates: CandDebugEntry[]): DetectContext {
	const candles = spec.series.candles.slice(0, spec.windowEnd + 1);
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
		hsShoulderMaxPct: getHsShoulderMaxPctForTf(spec.tf),
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

// ── 採取した 1 件 ──

type Family = 'triple' | 'double';

/**
 * accepted な形成中候補 1 件ぶんの実測値（延べ 1 件）。
 *
 * `spreadRatio` の 2 系統は**別の問いに答える**ので両方持つ:
 *
 * | フィールド | `current` の `extremePrice` | 答える問い |
 * |---|---|---|
 * | `spreadRatio` | **終値**（#169 の idiom） | 形成中経路にゲートを置いたら何が落ちるか（§3 の ablation と同じ量） |
 * | `spreadRatioOnCompletion` | その足の**高安** | 同じ足が第 3 ピボットとして確定したら完成済みゲートは何と言うか（§2 の主指標の解釈） |
 *
 * **2 つは一致しない**（§2-3 に実測の反例が両向きある）。混ぜて 1 つの数字にしない。
 */
interface FormingRec {
	group: Group;
	/** ケースの識別子（ablation の突き合わせ用。{@link caseKeyOf} と同じ形）。 */
	caseKey: string;
	series: string;
	tf: string;
	tfAuthoritative: boolean;
	corpus: string;
	swingDepth: number | undefined;
	windowEnd: number;
	rolling: boolean;
	type: string;
	family: Family;
	/** 主構成点 1 / 2 の idx（確定ピボット）。構造キーはこの 2 つ。 */
	main1Idx: number;
	main2Idx: number;
	/** 同、絶対時刻。実データ B / C / D は同じ 1 時間足履歴の重なる窓なので、
	 *  系列をまたいだ重複を畳むにはこちらを使う（{@link tsKey}）。 */
	main1Iso: string;
	main2Iso: string;
	/** 最新足の idx。`double_bottom` の形成中経路だけは主構成点ではない（§4 参照）。 */
	currentIdx: number;
	/** その経路の同水準判定が実際に見ている価格相対の量。 */
	levelSpread: number;
	/** 同、その経路の実効上限。 */
	levelSpreadLimit: number;
	spreadAbs: number;
	heightAbs: number | null;
	heightPct: number | null;
	spreadRatio: number | null;
	spreadRatioOnCompletion: number | null;
	confidence: number | null;
	/** `detect_patterns.ts` の cap 並べ替えを再現した時の、この候補が属するケースの候補総数。 */
	candidatesTotal: number;
	/** 構成点の実値（§3-3 の目視判定用）。`current` の `extremePrice` は #169 の idiom で終値。 */
	pts: Array<{ role: string; idx: number; price: number; extremePrice: number }>;
	/**
	 * 主構成点が**ネックラインの正しい側**にあるか（`validateMainPointsNecklineSide`。#216 Phase 2）。
	 *
	 * **完成済み 4 経路には配線されているが形成中 2 経路には無い**ので、本スクリプトが静的に当てる。
	 * 高さ相対のゲートと**どれだけ重なるか**を §3-3 で見るために採る（triple のみ。double は
	 * ネックラインの取り方が違うので `null`）。
	 */
	necklineSideReason: string | null;
	/** ネックライン水準（形成中 triple は中間点 2 つの終値平均。検出器と同じ引き方）。 */
	necklinePrice: number | null;
}

const structKey = (r: FormingRec): string => `${r.series}|${r.tf}|${r.type}|${r.main1Idx}-${r.main2Idx}`;

/**
 * **系列をまたいで**構造を畳むキー（絶対時刻ベース）。
 *
 * 実データ B / C / D は**同じ btc_jpy 1 時間足履歴の重なる窓**（C は B の idx 181 から、
 * D は C の idx 19 から始まり、B∩C = 184 本 / C∩D = 346 本）。idx ベースの {@link structKey} は
 * 同じ構造を系列ごとに別物として数えるので、**実体の数を言うときはこちらで畳む**。
 */
const tsKey = (r: FormingRec): string => `${r.tf}|${r.type}|${r.main1Iso}-${r.main2Iso}`;

/** ケースの識別子。ablation ビルドの出力と base の採取結果を突き合わせるキー。 */
const caseKeyOf = (s: CaseSpec): string =>
	`${s.series.name}|${s.tf}|${s.swingDepth ?? 'auto'}|${s.windowEnd}|` +
	`${s.opts.includeForming ? 1 : 0}${s.opts.includeCompleted ? 1 : 0}${s.opts.includeInvalid ? 1 : 0}`;

// ── 統計ヘルパ ──

function quantile(sorted: readonly number[], p: number): number | null {
	if (sorted.length === 0) return null;
	return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

interface Stats {
	n: number;
	min: number | null;
	p50: number | null;
	p90: number | null;
	max: number | null;
}

function stats(values: readonly number[]): Stats {
	const s = [...values].sort((a, b) => a - b);
	return { n: s.length, min: s[0] ?? null, p50: quantile(s, 0.5), p90: quantile(s, 0.9), max: s[s.length - 1] ?? null };
}

const r2 = (v: number): string => v.toFixed(2);
const f4 = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : v.toFixed(4));
const pct4 = (v: number | null | undefined): string =>
	v === null || v === undefined ? '—' : `${(v * 100).toFixed(3)}%`;

// ── 採取 ──

/** 展開ビルド 1 つを 1 ケースに走らせて、生の `debugCandidates` と `patterns` を返す。 */
function runCase(build: Build, spec: CaseSpec): { patterns: DeduplicablePattern[]; cands: CandDebugEntry[] } {
	const cands: CandDebugEntry[] = [];
	const ctx = buildCtx(spec, cands);
	const t = build.detectTriples(ctx);
	const d = build.detectDoubles(ctx);
	return { patterns: [...t.patterns, ...d.patterns], cands };
}

/** 作業ツリーの本物を 1 ケースに走らせる（§0 の検算の神託）。 */
function runCaseWorktree(spec: CaseSpec): { patterns: DeduplicablePattern[]; cands: CandDebugEntry[] } {
	const cands: CandDebugEntry[] = [];
	const ctx = buildCtx(spec, cands);
	const t = realDetectTriples(ctx);
	const d = realDetectDoubles(ctx);
	return { patterns: [...t.patterns, ...d.patterns], cands };
}

const digest = (v: unknown): string => createHash('sha1').update(JSON.stringify(v)).digest('hex');

/**
 * `detect_patterns.ts` の cap 並べ替えを**そのまま**再現する（§5-2）。
 * 順序は `[...accepted, ...型間排他の棄却, ...検出器の棄却].slice(0, 200)`。
 */
const DEBUG_CAP = 200;

function applyDebugCap(cands: readonly CandDebugEntry[], want: Set<string>): Set<CandDebugEntry> {
	const relevant = filterCandidatesByWant([...cands], want);
	const acc = relevant.filter((c) => !!c?.accepted);
	const pipelineRej = relevant.filter((c) => !c?.accepted && c?.reason === TRIPLE_HS_EXCLUSION_REASON);
	const rej = relevant.filter((c) => !c?.accepted && c?.reason !== TRIPLE_HS_EXCLUSION_REASON);
	return new Set([...acc, ...pipelineRej, ...rej].slice(0, DEBUG_CAP));
}

/** 本 ablation が新設する理由コードか（`forming_` 接頭辞 + 高さ相対の語彙）。 */
const isNewGateReason = (reason: unknown): boolean =>
	typeof reason === 'string' && reason.startsWith('forming_') && reason.includes('_spread_vs_height_excess');

/**
 * accepted な形成中候補から実測値を組み立てる。
 *
 * 構成点の `extremePrice` は `ctx.pivots` から idx で引く——`debugCandidates` の `points` は
 * `price`（終値）しか持たないので、高さ相対の分母をそこからは作れない。
 * **`current` だけは確定ピボットではない**ので、#169 の idiom で終値を `extremePrice` に置く。
 */
function collectFromCase(
	build: Build,
	spec: CaseSpec,
	corpus: CorpusPart,
	cands: readonly CandDebugEntry[],
): FormingRec[] {
	const candles = spec.series.candles.slice(0, spec.windowEnd + 1);
	const resolved = resolveParams(spec.tf, spec.swingDepth === undefined ? {} : { swingDepth: spec.swingDepth });
	const pivots = detectSwingPoints(candles, { swingDepth: resolved.swingDepth, strictPivots: true });
	const byIdx = new Map<number, Pivot>(pivots.map((p) => [p.idx, p]));
	const out: FormingRec[] = [];

	for (const c of cands) {
		if (!c.accepted || c.status !== 'forming') continue;
		const isTriple = c.type === 'triple_top' || c.type === 'triple_bottom';
		const isDouble = c.type === 'double_top' || c.type === 'double_bottom';
		if (!isTriple && !isDouble) continue;
		const isTop = c.type.endsWith('_top');
		const roles = new Map((c.points ?? []).map((p) => [p.role, p]));
		const pivotOf = (role: string): Pivot | null => {
			const p = roles.get(role);
			return p ? (byIdx.get(p.idx) ?? null) : null;
		};

		let main1: Pivot | null = null;
		let main2: Pivot | null = null;
		let mid1: Pivot | null = null;
		let mid2: Pivot | null = null;
		let cur: { idx: number; price: number } | null = null;
		let mainPoints: Array<{ price: number }> = [];
		let allPoints: Array<{ extremePrice: number }> = [];
		let currentIsMain = true;

		if (isTriple) {
			// 形成中 triple: 主構成点 = 確定 2 ピボット + 最新足。ネックライン 2 点が中間点。
			main1 = pivotOf(isTop ? 'peak1' : 'valley1');
			main2 = pivotOf(isTop ? 'peak2' : 'valley2');
			mid1 = pivotOf(isTop ? 'valley1' : 'peak1');
			mid2 = pivotOf(isTop ? 'valley2' : 'peak2');
			const cp = roles.get('current');
			if (!main1 || !main2 || !mid1 || !mid2 || !cp) continue;
			cur = { idx: cp.idx, price: cp.price };
			mainPoints = [main1, main2, { price: cur.price }];
			allPoints = [main1, mid1, main2, mid2, { extremePrice: cur.price }];
		} else if (isTop) {
			// 形成中 double_top: 主構成点 = 確定 1 山 + 最新足（`forming_peak`）。中間点は谷 1 つ。
			main1 = pivotOf('peak1');
			mid1 = pivotOf('valley');
			const cp = roles.get('forming_peak');
			if (!main1 || !mid1 || !cp) continue;
			cur = { idx: cp.idx, price: cp.price };
			mainPoints = [main1, { price: cur.price }];
			allPoints = [main1, mid1, { extremePrice: cur.price }];
		} else {
			// 形成中 double_bottom: **主構成点は確定 2 谷**で、最新足は主構成点ではない
			// （`currentPrice` は有効性判定と完成度にしか使われない）。top 側と非対称なので
			// 完成済みと同じ 3 点（谷1 / 山 / 谷2）で測る。§4 に明記する。
			main1 = pivotOf('valley1');
			main2 = pivotOf('valley2');
			mid1 = pivotOf('peak');
			const cp = roles.get('current');
			if (!main1 || !main2 || !mid1 || !cp) continue;
			cur = { idx: cp.idx, price: cp.price };
			currentIsMain = false;
			mainPoints = [main1, main2];
			allPoints = [main1, mid1, main2];
		}

		const m = build.levelSpreadMetrics(mainPoints, allPoints);

		// 完成仮説（`current` が第 N ピボットとして確定したときの `extremePrice` = その足の高安）。
		// `current` が主構成点でない `double_bottom` では定義できないので null。
		let onCompletion: number | null = null;
		if (currentIsMain && cur) {
			const bar = candles[cur.idx];
			const outer = Number(isTop ? bar?.high : bar?.low);
			if (Number.isFinite(outer)) {
				const alt = allPoints.map((p, i) => (i === allPoints.length - 1 ? { extremePrice: outer } : p));
				onCompletion = build.levelSpreadMetrics(mainPoints, alt).spreadRatio;
			}
		}

		// ネックライン側の検査（#216 Phase 2）。**形成中経路には配線されていない**ので静的に当てる。
		// ネックラインの引き方は検出器と同じ——形成中 triple は中間点 2 つの `price`（終値）平均。
		let necklineSide: string | null = null;
		let necklinePriceVal: number | null = null;
		if (isTriple && mid1 && mid2 && main2) {
			necklinePriceVal = (mid1.price + mid2.price) / 2;
			necklineSide =
				build.validateMainPointsNecklineSide(
					isTop ? 'top' : 'bottom',
					[main1, main2, { idx: cur.idx, price: cur.price }],
					necklinePriceVal,
				).reason ?? null;
		}

		// その経路の同水準判定が実際に見ている価格相対の量と、その実効上限。
		const levels = mainPoints.map((p) => p.price);
		const levelSpread = (Math.max(...levels) - Math.min(...levels)) / Math.max(1, Math.max(...levels));
		const levelSpreadLimit = isTriple
			? resolved.tolerancePct * build.FORMING_TOLERANCE_MULTIPLIER * build.FORMING_LEVEL_SPREAD_FACTOR
			: Number.NaN; // double は経路ごとに式が違うので §4 で個別に出す

		out.push({
			group: spec.series.group,
			caseKey: caseKeyOf(spec),
			series: spec.series.name,
			tf: spec.tf,
			tfAuthoritative: corpus.tfAuthoritative,
			corpus: corpus.label,
			swingDepth: spec.swingDepth,
			windowEnd: spec.windowEnd,
			rolling: spec.rolling,
			type: c.type,
			family: isTriple ? 'triple' : 'double',
			main1Idx: main1.idx,
			main2Idx: main2 ? main2.idx : cur.idx,
			main1Iso: String(candles[main1.idx]?.isoTime ?? ''),
			main2Iso: String(candles[main2 ? main2.idx : cur.idx]?.isoTime ?? ''),
			currentIdx: cur.idx,
			levelSpread,
			levelSpreadLimit,
			spreadAbs: m.spreadAbs,
			heightAbs: m.heightAbs,
			heightPct: m.heightPct,
			spreadRatio: m.spreadRatio,
			spreadRatioOnCompletion: onCompletion,
			confidence: null,
			candidatesTotal: cands.length,
			pts: buildPointDump(isTop, main1, mid1, main2, mid2, cur, candles),
			necklineSideReason: necklineSide,
			necklinePrice: necklinePriceVal,
		});
	}
	return out;
}

/**
 * §3-3 の目視判定に要る構成点の実値をまとめる。**判定には終値も高安も要る**——
 * 分子（水準ばらつき）は終値、分母（パターン高さ）は高安なので、片方だけでは形を読めない。
 */
function buildPointDump(
	isTop: boolean,
	main1: Pivot,
	mid1: Pivot | null,
	main2: Pivot | null,
	mid2: Pivot | null,
	cur: { idx: number; price: number },
	candles: readonly Candle[],
): Array<{ role: string; idx: number; price: number; extremePrice: number }> {
	const mainRole = isTop ? 'peak' : 'valley';
	const midRole = isTop ? 'valley' : 'peak';
	const out: Array<{ role: string; idx: number; price: number; extremePrice: number }> = [
		{ role: `${mainRole}1`, idx: main1.idx, price: main1.price, extremePrice: main1.extremePrice },
	];
	if (mid1) out.push({ role: `${midRole}1`, idx: mid1.idx, price: mid1.price, extremePrice: mid1.extremePrice });
	if (main2) out.push({ role: `${mainRole}2`, idx: main2.idx, price: main2.price, extremePrice: main2.extremePrice });
	if (mid2) out.push({ role: `${midRole}2`, idx: mid2.idx, price: mid2.price, extremePrice: mid2.extremePrice });
	// `current` は確定ピボットではないので #169 の idiom（`extremePrice` = 終値）。
	// その足の実際の高安は `barExtreme` として別に出す——完成仮説の比を読むのに要る。
	const bar = candles[cur.idx];
	const barExtreme = Number(isTop ? bar?.high : bar?.low);
	out.push({ role: 'current', idx: cur.idx, price: cur.price, extremePrice: cur.price });
	if (Number.isFinite(barExtreme)) {
		out.push({ role: 'current_bar_extreme', idx: cur.idx, price: cur.price, extremePrice: barExtreme });
	}
	return out;
}

// ── §2 の追跡（同じ構造がその後どうなったか） ──

/**
 * ローリング窓の中で、ある構造（`peak1`/`peak2` の idx）がその後どうなったか。
 *
 * 判定は**同じ (系列, 時間足, swingDepth) の後続の終端**を走査して行う。窓は先頭固定なので
 * ピボットの idx が窓をまたいで安定し、`idxs[0]` / `idxs[1]` で結べる。
 */
interface FollowUp {
	/** 後続の窓で完成済み（accepted、`peak3` まで揃った）として現れたか。 */
	completed: boolean;
	/** 後続の窓で完成済み経路の高さ相対ゲートに落ちたか（理由コードで直接確認）。 */
	rejectedByHeightGate: boolean;
	/** 後続の窓で形成中としても完成済みとしても現れなくなったか。 */
	vanished: boolean;
	/** 形成中として現れた最後の終端 idx。 */
	lastFormingEnd: number;
}

const HEIGHT_GATE_REASONS = new Set(['peak_spread_vs_height_excess', 'valley_spread_vs_height_excess']);

// ── main ──

interface Row {
	spec: CaseSpec;
	corpus: CorpusPart;
	cands: CandDebugEntry[];
	patterns: DeduplicablePattern[];
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const jsonAt = argv.indexOf('--json');
	const jsonPath = jsonAt >= 0 ? argv[jsonAt + 1] : null;
	const includeRolling = !argv.includes('--no-rolling');

	const out: string[] = [];
	const say = (s = ''): void => {
		out.push(s);
	};

	const corpus = await buildCorpus(includeRolling);
	const base = await loadBuild('base');

	// ── §0 検算 ──
	say('# issue #178 項目 1 Phase 1 — 形成中 triple の levelSpread 計測');
	say();
	say('## 0. 検算（展開ビルド ≡ 作業ツリー）');
	say();
	say('`tools/patterns/` を一時領域へディレクトリごと展開し、`detect_triples.ts` の末尾に');
	say('`export { … }` を 1 行足しただけのビルド（`base`）が、作業ツリーの本物と');
	say('`patterns` / `debugCandidates` の JSON 全キーで一致することを**全ケースで**確かめる。');
	say();

	let mismatch = 0;
	let caseCount = 0;
	const recs: FormingRec[] = [];
	const byCorpusRows = new Map<string, Row[]>();

	for (const part of corpus) {
		const rows: Row[] = [];
		for (const spec of part.cases) {
			const b = runCase(base, spec);
			const w = runCaseWorktree(spec);
			if (digest(b.patterns) !== digest(w.patterns) || digest(b.cands) !== digest(w.cands)) {
				mismatch++;
				if (mismatch <= 3) {
					say(
						`- ❌ 不一致: ${spec.series.name} / ${spec.tf} / sd=${spec.swingDepth ?? 'auto'} / end=${spec.windowEnd}`,
					);
				}
			}
			caseCount++;
			rows.push({ spec, corpus: part, cands: b.cands, patterns: b.patterns });
			// confidence を patterns 側から引いて埋める（forming の entry は 1 側 1 件）。
			const collected = collectFromCase(base, spec, part, b.cands);
			for (const r of collected) {
				const p = b.patterns.find((x) => x.type === r.type && x.status === 'forming');
				r.confidence = typeof p?.confidence === 'number' ? p.confidence : null;
			}
			recs.push(...collected);
		}
		byCorpusRows.set(part.label, rows);
	}

	if (mismatch > 0) {
		throw new Error(`展開ビルドが作業ツリーと ${mismatch} / ${caseCount} ケースで食い違った。計測は無効。`);
	}
	say(`- ✅ ${caseCount} ケース全件で一致（\`patterns\` / \`debugCandidates\` とも）`);
	say(`- 展開先: \`${TMP_DIR}\`（作業ツリーは 1 バイトも変更していない）`);
	say(
		`- 形成中の係数（展開ビルドから読んだ値）: \`FORMING_TOLERANCE_MULTIPLIER\` = ${base.FORMING_TOLERANCE_MULTIPLIER} / ` +
			`\`FORMING_LEVEL_SPREAD_FACTOR\` = ${base.FORMING_LEVEL_SPREAD_FACTOR} / ` +
			`\`FORMING_NECKLINE_SPREAD_FACTOR\` = ${base.FORMING_NECKLINE_SPREAD_FACTOR} / ` +
			`\`MAX_LEVEL_SPREAD_RATIO\` = ${base.MAX_LEVEL_SPREAD_RATIO}`,
	);
	say();
	say('### コーパス');
	say();
	say('| 母集団 | ケース数 | 時間足別の結論に使えるか |');
	say('|---|---:|---|');
	for (const part of corpus) {
		say(`| ${part.label} | ${part.cases.length} | ${part.tfAuthoritative ? '✅' : '参考値'} |`);
	}
	say();
	say(
		'**実データ B / C / D は独立系列ではない。** 同じ btc_jpy 1 時間足履歴の**重なる窓**で、' +
			'C は B の idx 181 から（B∩C = 184 本）、D は C の idx 19 から（C∩D = 346 本）始まる。' +
			'**構造の実体数を言うときは絶対時刻で畳む**（本メモの「実体」列）。' +
			'系列ごとの数字はプールせずに並べる（#219）が、合計を取ると同じ構造を 2〜3 回数える。',
	);
	say();
	say(
		`ローリング窓は統合オプションを \`includeForming\`/\`includeCompleted\`/\`includeInvalid\` = ` +
			`全 true の 1 通りに固定している（形成中経路の発火を左右するのは \`includeForming\` だけなので、` +
			`8 通り回しても同じ候補が 8 回積まれるだけ）。`,
	);
	say();

	// ── §1 分布 ──
	say('## 1. 形成中 triple の同水準指標の分布（accepted な forming のみ）');
	say();
	const triples = recs.filter((r) => r.family === 'triple');
	say(
		`accepted な形成中 triple: **延べ ${triples.length} 件 / 構造 ${new Set(triples.map(structKey)).size} 件 / ` +
			`実体（絶対時刻で畳んだ数）${new Set(triples.map(tsKey)).size} 件**`,
	);
	say();

	for (const part of corpus) {
		const rs = triples.filter((r) => r.corpus === part.label);
		if (rs.length === 0) {
			say(`### ${part.label}`);
			say();
			say('accepted な形成中 triple は **0 件**。');
			say();
			continue;
		}
		say(`### ${part.label}${part.tfAuthoritative ? '' : '（時間足別は参考値）'}`);
		say();
		say(
			'| 時間足 | type | 延べ | 構造 | 価格相対 `levelSpread` min / p50 / p90 / max | 使用率 p50 / max | 高さ相対 `spreadRatio` min / p50 / p90 / max |',
		);
		say('|---|---|---:|---:|---|---|---|');
		const keys = [...new Set(rs.map((r) => `${r.tf}|${r.type}`))].sort();
		for (const k of keys) {
			const [tf, type] = k.split('|');
			const g = rs.filter((r) => r.tf === tf && r.type === type);
			const ls = stats(g.map((r) => r.levelSpread));
			const use = stats(g.map((r) => r.levelSpread / r.levelSpreadLimit));
			const sr = stats(g.filter((r) => r.spreadRatio !== null).map((r) => r.spreadRatio as number));
			say(
				`| ${tf} | ${type} | ${g.length} | ${new Set(g.map(structKey)).size} | ` +
					`${pct4(ls.min)} / ${pct4(ls.p50)} / ${pct4(ls.p90)} / ${pct4(ls.max)} | ` +
					`${f4(use.p50)} / ${f4(use.max)} | ` +
					`${f4(sr.min)} / ${f4(sr.p50)} / ${f4(sr.p90)} / ${f4(sr.max)} |`,
			);
		}
		say();
	}

	// 律速の比較（#244 結果 1 と同じ読み方）
	say('### 律速側（価格相対 vs 高さ相対）');
	say();
	say(
		'使用率 = `実測 ÷ 上限`。価格相対の上限はその経路の実効閾値' +
			'（`tolerancePct × FORMING_TOLERANCE_MULTIPLIER × FORMING_LEVEL_SPREAD_FACTOR`）、' +
			`高さ相対の上限は完成済みと同じ \`MAX_LEVEL_SPREAD_RATIO\` = ${base.MAX_LEVEL_SPREAD_RATIO}。`,
	);
	say();
	say('| 母集団 | 延べ | 価格相対の使用率 p50 | 高さ相対の使用率 p50 | 高さ相対が律速の割合 |');
	say('|---|---:|---:|---:|---:|');
	for (const part of corpus) {
		const rs = triples.filter((r) => r.corpus === part.label && r.spreadRatio !== null);
		if (rs.length === 0) continue;
		const usePrice = stats(rs.map((r) => r.levelSpread / r.levelSpreadLimit));
		const useHeight = stats(rs.map((r) => (r.spreadRatio as number) / base.MAX_LEVEL_SPREAD_RATIO));
		const heightBinds = rs.filter(
			(r) => (r.spreadRatio as number) / base.MAX_LEVEL_SPREAD_RATIO > r.levelSpread / r.levelSpreadLimit,
		).length;
		say(
			`| ${part.label} | ${rs.length} | ${f4(usePrice.p50)} | ${f4(useHeight.p50)} | ` +
				`${((heightBinds / rs.length) * 100).toFixed(1)}% (${heightBinds}/${rs.length}) |`,
		);
	}
	say();

	// ── §2 主指標 ──
	say('## 2. 主指標 — 完成しえない形成中候補');
	say();
	say(
		`accepted な形成中 triple のうち \`spreadRatio > ${base.MAX_LEVEL_SPREAD_RATIO}\`` +
			'（完成済みの `MAX_LEVEL_SPREAD_RATIO`）のもの。',
	);
	say();
	const over = triples.filter((r) => r.spreadRatio !== null && (r.spreadRatio as number) > base.MAX_LEVEL_SPREAD_RATIO);
	const overStructs = new Set(over.map(structKey));
	const allStructs = new Set(triples.map(structKey));
	say('| 母集団 | 延べ（超 / 全体） | 構造（1 件でも超 / 全体） | 構造（全延べが超） |');
	say('|---|---|---|---|');
	for (const part of corpus) {
		const rs = triples.filter((r) => r.corpus === part.label);
		if (rs.length === 0) continue;
		const o = rs.filter((r) => r.spreadRatio !== null && (r.spreadRatio as number) > base.MAX_LEVEL_SPREAD_RATIO);
		const sAll = new Set(rs.map(structKey));
		const sAny = new Set(o.map(structKey));
		const sAllOver = [...sAll].filter((k) => {
			const g = rs.filter((r) => structKey(r) === k);
			return g.every((r) => r.spreadRatio !== null && (r.spreadRatio as number) > base.MAX_LEVEL_SPREAD_RATIO);
		});
		say(`| ${part.label} | ${o.length} / ${rs.length} | ${sAny.size} / ${sAll.size} | ${sAllOver.length} |`);
	}
	say();
	say(
		`**合計: 延べ ${over.length} / ${triples.length}、構造 ${overStructs.size} / ${allStructs.size}、` +
			`実体 ${new Set(over.map(tsKey)).size} / ${new Set(triples.map(tsKey)).size}。**`,
	);
	say();

	// 構造単位の明細
	say('### 2-1. 構造単位の明細（`spreadRatio` が 1 件でも 0.5 を超えた構造）');
	say();
	if (overStructs.size === 0) {
		say('**0 件。**');
	} else {
		say('`spreadRatio` は構造内の延べの min / p50 / max。`levelSpread` は同じく p50。');
		say('「完成」列はローリング窓で後続の終端まで追跡した結果（フル系列のみの構造は `—`）。');
		say();
		const followUps = buildFollowUps(byCorpusRows, triples);
		{
			// その後の内訳（ローリング窓で追跡できた構造のみ）。**形成中 triple に `expired` は無い**
			// （`detect_doubles.ts` の形成中 double bottom にだけある）ので 3 通りしか出ない。
			const tracked = [...overStructs].map((k) => followUps.get(k)).filter((v): v is FollowUp => v !== undefined);
			const completed = tracked.filter((v) => v.completed).length;
			const bothWays = tracked.filter((v) => v.completed && v.rejectedByHeightGate).length;
			const rejOnly = tracked.filter((v) => !v.completed && v.rejectedByHeightGate).length;
			const neither = tracked.filter((v) => !v.completed && !v.rejectedByHeightGate).length;
			say('| その後（ローリング窓で追跡） | 構造 |');
			say('|---|---:|');
			say(
				`| 後続の窓で **completed** として accepted になった | ${completed}（うち ${bothWays} は高さ相対の棄却も出す） |`,
			);
			say(`| 完成せず、完成済み経路の高さ相対ゲートで落ちた | ${rejOnly} |`);
			say(`| 未完成のまま（窓の終端まで） | ${neither} |`);
			say(`| 追跡できた構造の合計 | ${tracked.length} / ${overStructs.size} |`);
			say();
			say(
				'**`expired` は出ない**——形成中 triple にそのステータスが無いため（`detect_doubles.ts` の' +
					'形成中 double bottom にだけある）。追跡は「後続の終端で同じ `peak1`/`peak2` の候補が' +
					'どの経路に現れたか」で見ている。',
			);
			say();
		}
		say(
			'| 系列 | tf | type | peak1-peak2 | 延べ | 終端の範囲 | `levelSpread` p50 | `spreadRatio` min / p50 / max | 完成仮説 `spreadRatio` p50 | 完成 |',
		);
		say('|---|---|---|---|---:|---|---|---|---|---|');
		const sorted = [...overStructs].sort((a, b) => {
			const ga = triples.filter((r) => structKey(r) === a);
			const gb = triples.filter((r) => structKey(r) === b);
			const ma = Math.max(...ga.map((r) => r.spreadRatio ?? 0));
			const mb = Math.max(...gb.map((r) => r.spreadRatio ?? 0));
			return mb - ma;
		});
		for (const k of sorted) {
			const g = triples.filter((r) => structKey(r) === k);
			const sr = stats(g.filter((r) => r.spreadRatio !== null).map((r) => r.spreadRatio as number));
			const oc = stats(
				g.filter((r) => r.spreadRatioOnCompletion !== null).map((r) => r.spreadRatioOnCompletion as number),
			);
			const ls = stats(g.map((r) => r.levelSpread));
			const ends = g.map((r) => r.windowEnd);
			const fu = followUps.get(k);
			const r0 = g[0];
			const fuText = fu
				? fu.completed
					? fu.rejectedByHeightGate
						? '✅ 完成（ただし高さ相対で棄却あり）'
						: '✅ 完成'
					: fu.rejectedByHeightGate
						? '❌ 完成済み経路で高さ相対棄却'
						: fu.vanished
							? '— 消滅'
							: '— 未完成'
				: '—';
			say(
				`| ${r0.series} | ${r0.tf} | ${r0.type} | ${r0.main1Idx}-${r0.main2Idx} | ${g.length} | ` +
					`${Math.min(...ends)}〜${Math.max(...ends)} | ${pct4(ls.p50)} | ` +
					`${f4(sr.min)} / ${f4(sr.p50)} / ${f4(sr.max)} | ${f4(oc.p50)} | ${fuText} |`,
			);
		}
	}
	say();

	const nsAll = triples.filter((r) => r.necklineSideReason !== null);
	say(
		`**参考: accepted な形成中 triple のうち ${nsAll.length} / ${triples.length} 延べ` +
			`（構造 ${new Set(nsAll.map(structKey)).size} / ${allStructs.size}、` +
			`実体 ${new Set(nsAll.map(tsKey)).size} / ${new Set(triples.map(tsKey)).size}）は、` +
			'`validateMainPointsNecklineSide`（#216 Phase 2）でも落ちる。** ' +
			'この検査は**完成済み 4 経路には配線されているが形成中 2 経路には無い**。' +
			'本 issue の対象ではないが、同じ「形成中 ⊇ 完成済みの厳しさ」の破れなので併記する。',
	);
	say();

	// 2-2: 完成仮説との比較
	say('### 2-2. 「同じ 3 点で完成したら落ちるか」— 主指標の解釈を検算する');
	say();
	say(
		'主指標は #169 の idiom（`current.extremePrice` = 終値）で測った `spreadRatio`。' +
			'一方、**完成済みゲートが実際に測るのは第 3 ピボットの `extremePrice`（高安）**なので、' +
			'「同じ足が第 3 ピボットとして確定したら完成済みゲートは何と言うか」は別の量になる。両方出す。',
	);
	say();
	const withBoth = triples.filter((r) => r.spreadRatio !== null && r.spreadRatioOnCompletion !== null);
	const upN = withBoth.filter((r) => (r.spreadRatioOnCompletion as number) > (r.spreadRatio as number) + 1e-12).length;
	const downN = withBoth.filter(
		(r) => (r.spreadRatioOnCompletion as number) < (r.spreadRatio as number) - 1e-12,
	).length;
	const sameN = withBoth.length - upN - downN;
	say('| 比較 | 延べ |');
	say('|---|---:|');
	say(`| 完成仮説のほうが **大きい**（比が上がる） | ${upN} |`);
	say(`| 完成仮説のほうが **小さい**（比が下がる） | ${downN} |`);
	say(`| 同値（その足にヒゲが無い / 高安が分母の端点にならない） | ${sameN} |`);
	say();
	if (upN > 0 && downN > 0) {
		say(
			'**両向きに動く。** 「`current` が確定すると `extremePrice` は終値より外側になるので ' +
				'`spreadRatio` は上がる方向にしか動かない」は**成立しない**——#178 項目 4 の教訓どおり、' +
				'幾何の主張は反例で崩れる。実測の反例は次の 2 件（それぞれ最大の変化幅）:',
		);
		say();
		const up = withBoth
			.filter((r) => (r.spreadRatioOnCompletion as number) > (r.spreadRatio as number))
			.sort(
				(a, b) =>
					(b.spreadRatioOnCompletion as number) -
					(b.spreadRatio as number) -
					((a.spreadRatioOnCompletion as number) - (a.spreadRatio as number)),
			)[0];
		const down = withBoth
			.filter((r) => (r.spreadRatioOnCompletion as number) < (r.spreadRatio as number))
			.sort(
				(a, b) =>
					(a.spreadRatioOnCompletion as number) -
					(a.spreadRatio as number) -
					((b.spreadRatioOnCompletion as number) - (b.spreadRatio as number)),
			)[0];
		say('| 向き | 系列 | tf | sd | 終端 | type | 構成点 | 形成中 `spreadRatio` | 完成仮説 `spreadRatio` |');
		say('|---|---|---|---|---:|---|---|---|---|');
		for (const [dir, r] of [
			['上がる', up],
			['下がる', down],
		] as const) {
			if (!r) continue;
			say(
				`| ${dir} | ${r.series} | ${r.tf} | ${r.swingDepth ?? 'auto'} | ${r.windowEnd} | ${r.type} | ` +
					`${r.main1Idx}-${r.main2Idx}-${r.currentIdx} | ${f4(r.spreadRatio)} | ${f4(r.spreadRatioOnCompletion)} |`,
			);
		}
		say();
		say(
			'**上がる向きの成り立ち**: 形成中の `allPoints` は `current.extremePrice` に終値を置くので、' +
				'その終値が 5 点の**最小**（top なら谷の安値より下）になっている構造がある。' +
				'高安に置き換えると最小が谷側へ戻り、**分母 `heightAbs` が縮んで比が上がる**。' +
				'**下がる向き**は素直で、上ヒゲが最大を押し上げて分母が伸びる。',
		);
	} else if (upN > 0 || downN > 0) {
		say(`**片方向にしか動かなかった**（上がる ${upN} / 下がる ${downN}）。ただしこれは本コーパスの性質であって、`);
		say('幾何的な上界の主張ではない（#178 項目 4 の教訓）。');
	}
	say();
	const overOnCompletion = triples.filter(
		(r) => r.spreadRatioOnCompletion !== null && (r.spreadRatioOnCompletion as number) > base.MAX_LEVEL_SPREAD_RATIO,
	);
	const overIdiomWithBoth = withBoth.filter((r) => (r.spreadRatio as number) > base.MAX_LEVEL_SPREAD_RATIO);
	say(
		`**完成仮説で 0.5 を超える延べは ${overOnCompletion.length} / ${withBoth.length} 件** ` +
			`（構造 ${new Set(overOnCompletion.map(structKey)).size} 件）。同じ母集団を形成中の idiom で数えると ` +
			`${overIdiomWithBoth.length} 件（構造 ${new Set(overIdiomWithBoth.map(structKey)).size} 件）で、` +
			`${
				overOnCompletion.length === overIdiomWithBoth.length
					? '**両者は一致した**（ヒゲが分母の端点を動かさなかった候補が多数）。'
					: '**両者は一致しない**——上の両向きの動きが閾値をまたいだ候補があるため。'
			}`,
	);
	say();

	// ── §3 ablation ──
	say('## 3. 逆向き — `validateLevelSpread` を形成中に配線した ablation');
	say();
	say(
		'形成中 2 経路の**構造ゲート通過後**（完成済みと同じ配置規約）に `validateLevelSpread` を挿入した' +
			'ビルドを実際に走らせ、accepted な形成中 triple がどれだけ落ちるかを測る。理由コードは' +
			'`forming_peak_spread_vs_height_excess` / `forming_valley_spread_vs_height_excess` として**新設**' +
			'（完成済みの語彙を流用すると `▼ reason 横断合計` で混ざる）。',
	);
	say();

	// 冪等性: maxRatio = 999 は実質無効なので base と全ケース一致するはず。
	const guard = await loadBuild('abl_999', 999);
	let guardMismatch = 0;
	for (const part of corpus) {
		for (const row of byCorpusRows.get(part.label) ?? []) {
			const g = runCase(guard, row.spec);
			if (digest(g.patterns) !== digest(row.patterns) || digest(g.cands) !== digest(row.cands)) guardMismatch++;
		}
	}
	if (guardMismatch > 0) {
		throw new Error(
			`ablation ビルド（maxRatio=999、実質無効）が base と ${guardMismatch} ケースで食い違った。` +
				'挿入が判定以外に副作用を持っている。',
		);
	}
	say(`- ✅ 冪等性検算: \`maxRatio = 999\`（実質無効）のビルドが base と全 ${caseCount} ケースで一致。`);
	say('  **差分はゲートのみに帰属する。**');
	say();

	const ABL_RATIOS = [0.5, 0.6, 0.75, 1.0];
	/** ablation 1 ビルドぶんの集計。**コーパスを 1 周するだけで §3 / §5-1 / §5-2 の材料を全部採る。** */
	interface AblResult {
		ratio: number;
		/** accepted な形成中 triple の延べ / 構造。 */
		after: number;
		afterStructs: Set<string>;
		/** 新理由コードの延べ（cap 前 / cap 後）。 */
		newReasonTotal: number;
		newReasonVisible: number;
		/** 新ゲートより前に置かれた棄却理由の件数（§5-1）。 */
		priorReasonCounts: Map<string, number>;
		/** 同、**ケース別**。base より減っているケースがあれば理由の横取り（§5-1）。 */
		priorReasonPerCase: Map<string, Map<string, number>>;
		/** 母集団別の飽和ケース数と新理由コードの可視率（§5-2）。 */
		perCorpus: Map<string, { saturated: number; newTotal: number; newVisible: number }>;
		/** base で accepted だったのに落ちた延べ。 */
		dropped: FormingRec[];
	}

	/**
	 * 新ゲートより**前**に置かれた棄却理由。ablation ビルドでこれらの件数が base と一致することが、
	 * 「挿入位置が既存の理由を横取りしていない」ことの機械的な確認になる（§5-1）。
	 */
	const PRIOR_REASONS = [
		'forming_stair_step_up',
		'forming_stair_step_down',
		'forming_peaks_not_level',
		'forming_valleys_not_level',
		'forming_neckline_not_horizontal',
		'forming_neckline_points_insufficient',
		'forming_bars_out_of_range',
		'forming_completion_below_min',
		'forming_confidence_below_min',
	];

	const runAblation = async (ratio: number): Promise<AblResult> => {
		const b = await loadBuild(`abl_${String(ratio).replace('.', '')}`, ratio);
		const res: AblResult = {
			ratio,
			after: 0,
			afterStructs: new Set(),
			newReasonTotal: 0,
			newReasonVisible: 0,
			priorReasonCounts: new Map(),
			priorReasonPerCase: new Map(),
			perCorpus: new Map(),
			dropped: [],
		};
		const survivors = new Set<string>();
		for (const part of corpus) {
			const agg = { saturated: 0, newTotal: 0, newVisible: 0 };
			for (const row of byCorpusRows.get(part.label) ?? []) {
				const r = runCase(b, row.spec);
				const perCase = new Map<string, number>();
				res.priorReasonPerCase.set(caseKeyOf(row.spec), perCase);
				const capped = applyDebugCap(r.cands, new Set());
				if (filterCandidatesByWant([...r.cands], new Set()).length > DEBUG_CAP) agg.saturated++;
				for (const c of r.cands) {
					if (c.accepted && c.status === 'forming' && (c.type === 'triple_top' || c.type === 'triple_bottom')) {
						res.after++;
						const idxs = c.indices ?? [];
						const key = `${row.spec.series.name}|${row.spec.tf}|${c.type}|${idxs[0]}-${idxs[1]}`;
						res.afterStructs.add(key);
						survivors.add(`${caseKeyOf(row.spec)}|${key}`);
					}
					if (isNewGateReason(c.reason)) {
						res.newReasonTotal++;
						agg.newTotal++;
						if (capped.has(c)) {
							res.newReasonVisible++;
							agg.newVisible++;
						}
					}
					if (typeof c.reason === 'string' && PRIOR_REASONS.includes(c.reason)) {
						res.priorReasonCounts.set(c.reason, (res.priorReasonCounts.get(c.reason) ?? 0) + 1);
						perCase.set(c.reason, (perCase.get(c.reason) ?? 0) + 1);
					}
				}
			}
			res.perCorpus.set(part.label, agg);
		}
		res.dropped = triples.filter((r) => !survivors.has(`${r.caseKey}|${structKey(r)}`));
		return res;
	};

	const ablResults = new Map<number, AblResult>();
	for (const ratio of ABL_RATIOS) ablResults.set(ratio, await runAblation(ratio));

	say(
		'| `maxRatio` | accepted な形成中 triple（延べ before → after） | 減少 | 構造（before → after） | 新理由コードの延べ |',
	);
	say('|---|---|---:|---|---:|');
	for (const ratio of ABL_RATIOS) {
		const r = ablResults.get(ratio) as AblResult;
		say(
			`| ${r2(ratio)} | ${triples.length} → ${r.after} | ${triples.length - r.after} | ` +
				`${allStructs.size} → ${r.afterStructs.size} | ${r.newReasonTotal} |`,
		);
	}
	say();
	say('### 3-1. 静的判定との突き合わせ');
	say();
	say(
		'静的判定（§2 の「`spreadRatio > maxRatio` の件数」）と ablation の減少数が一致すれば、' +
			'ゲートは「今 accepted だった候補だけを落としている」。**一致しないなら波及がある**——' +
			'形成中経路はピークペアのループで、ゲートに落ちると `continue` して**別のペアが accepted になる**ため。',
	);
	say();
	say(
		'**「消えた」と「正味の減少」は別の数字**。形成中経路はピークペアのループなので、ゲートに落ちた' +
			'ケースで**別のペアが代わりに accepted になる**（＝正味の減少は 0 なのに構造は入れ替わっている）。',
	);
	say();
	say(
		'| `maxRatio` | 静的判定（延べ） | 消えた延べ（base で accepted → ablation で非 accepted） | 差 | 入れ替わりで新たに accepted（延べ） | 正味の増減 |',
	);
	say('|---|---:|---:|---|---:|---:|');
	for (const ratio of ABL_RATIOS) {
		const staticN = triples.filter((r) => r.spreadRatio !== null && (r.spreadRatio as number) > ratio).length;
		const res = ablResults.get(ratio) as AblResult;
		const abl = res.dropped.length;
		const gained = res.after - (triples.length - abl);
		say(
			`| ${r2(ratio)} | ${staticN} | ${abl} | ${abl - staticN > 0 ? '+' : ''}${abl - staticN} | ` +
				`${gained} | ${res.after - triples.length} |`,
		);
	}
	say();

	say('### 3-2. `maxRatio = 0.5` で落ちる候補の明細（構造単位）');
	say();
	say(
		'延べは同じ構造がローリング窓の終端ぶん重複するので、**構造単位**（`(系列, 時間足, type, peak1/peak2)`）で' +
			'並べる。目視の 3 値判定（呼べる / 呼べない / 保留）はメモ側の §別表で付ける。',
	);
	say();
	{
		const dropped05 = ablResults.get(0.5)?.dropped ?? [];
		const keys = [...new Set(dropped05.map(structKey))];
		say(
			`落ちる: **延べ ${dropped05.length} 件 / 構造 ${keys.length} 件 / ` +
				`実体（絶対時刻で畳んだ数）${new Set(dropped05.map(tsKey)).size} 件**`,
		);
		say();
		if (keys.length > 0) {
			say(
				'| # | 系列 | tf | type | peak1-peak2 | 延べ | 終端の範囲 | `levelSpread` p50 | `spreadRatio` min / p50 / max | `confidence` p50 |',
			);
			say('|---:|---|---|---|---|---:|---|---|---|---|');
			const sorted = keys.sort((a, b) => {
				const ma = Math.max(...dropped05.filter((r) => structKey(r) === a).map((r) => r.spreadRatio ?? 0));
				const mb = Math.max(...dropped05.filter((r) => structKey(r) === b).map((r) => r.spreadRatio ?? 0));
				return mb - ma;
			});
			sorted.forEach((k, i) => {
				const g = dropped05.filter((r) => structKey(r) === k);
				const sr = stats(g.filter((r) => r.spreadRatio !== null).map((r) => r.spreadRatio as number));
				const ls = stats(g.map((r) => r.levelSpread));
				const cf = stats(g.filter((r) => r.confidence !== null).map((r) => r.confidence as number));
				const ends = g.map((r) => r.windowEnd);
				const r0 = g[0];
				say(
					`| ${i + 1} | ${r0.series} | ${r0.tf} | ${r0.type} | ${r0.main1Idx}-${r0.main2Idx} | ${g.length} | ` +
						`${Math.min(...ends)}〜${Math.max(...ends)} | ${pct4(ls.p50)} | ` +
						`${f4(sr.min)} / ${f4(sr.p50)} / ${f4(sr.max)} | ${f4(cf.p50)} |`,
				);
			});
		}
	}
	say();

	say('### 3-3. 落ちる実体の幾何（目視判定の材料）');
	say();
	say(
		'§3-2 の 78 構造は、実データ B / C / D が**同じ履歴の重なる窓**であるぶん重複している。' +
			'**絶対時刻で畳んだ実体**ごとに 1 行だけ出す（代表は `spreadRatio` が中央値の延べ）。' +
			'`levelSpread` は検出器が実際に見ている価格相対の量、`spreadRatio` は高さ相対。' +
			'主構成点は `終値(高安)` の順で出す——**分子が終値・分母が高安**で基準が違うため（#138）、' +
			'片方だけでは形を読めない。`押し` は `heightAbs − spreadAbs` で、`MAX_LEVEL_SPREAD_RATIO` の' +
			'docstring が言う「最低の山からネックラインまでの押し」に当たる。' +
			'**`spreadRatio > 0.5` は「水準帯が押しより厚い」と同値**なので、この 2 列を並べて読めば判定の根拠になる。' +
			'最後の `ネックライン側` は `validateMainPointsNecklineSide`（#216 Phase 2）を静的に当てた結果——' +
			'**完成済み 4 経路には配線されているが形成中 2 経路には無い**検査で、本ゲートとの重なりを見るために出す。',
	);
	say();
	{
		const dropped05 = ablResults.get(0.5)?.dropped ?? [];
		const entities = [...new Set(dropped05.map(tsKey))];
		say(`実体: **${entities.length} 件**`);
		say();
		if (entities.length > 0) {
			say(
				'| # | 実体（tf / type / 主構成点の時刻） | 代表窓 | 主構成点 `終値(高安)` | 中間点の高安 | `levelSpread` | `spreadAbs`（水準帯） | `heightAbs − spreadAbs`（押し） | `heightAbs` | `spreadRatio` | 完成仮説 | ネックライン側 |',
			);
			say('|---:|---|---|---|---|---|---:|---:|---:|---|---|---|');
			const sorted = entities.sort((a, b) => {
				const ma = Math.max(...dropped05.filter((r) => tsKey(r) === a).map((r) => r.spreadRatio ?? 0));
				const mb = Math.max(...dropped05.filter((r) => tsKey(r) === b).map((r) => r.spreadRatio ?? 0));
				return mb - ma;
			});
			sorted.forEach((k, i) => {
				const g = dropped05.filter((r) => tsKey(r) === k).sort((a, b) => (a.spreadRatio ?? 0) - (b.spreadRatio ?? 0));
				const rep = g[Math.floor(g.length / 2)];
				const mainRole = rep.type.endsWith('_top') ? 'peak' : 'valley';
				const midRole = rep.type.endsWith('_top') ? 'valley' : 'peak';
				const mains = rep.pts.filter((p) => p.role.startsWith(mainRole) || p.role === 'current');
				const mids = rep.pts.filter((p) => p.role.startsWith(midRole));
				const barExt = rep.pts.find((p) => p.role === 'current_bar_extreme');
				const push = rep.heightAbs === null ? null : rep.heightAbs - rep.spreadAbs;
				say(
					`| ${i + 1} | ${rep.tf} / ${rep.type} / ${rep.main1Iso.slice(0, 16)} + ${rep.main2Iso.slice(0, 16)} | ` +
						`${rep.series} end=${rep.windowEnd} sd=${rep.swingDepth ?? 'auto'} | ` +
						`${mains.map((p) => `${p.idx}:${Math.round(p.price)}(${Math.round(p.extremePrice)})`).join(' / ')} | ` +
						`${mids.map((p) => `${p.idx}:${Math.round(p.extremePrice)}`).join(' / ')} | ` +
						`${pct4(rep.levelSpread)} | ${Math.round(rep.spreadAbs)} | ${push === null ? '—' : Math.round(push)} | ` +
						`${rep.heightAbs === null ? '—' : Math.round(rep.heightAbs)} | ${f4(rep.spreadRatio)} | ` +
						`${f4(rep.spreadRatioOnCompletion)}${barExt ? ` (最新足の高安 ${Math.round(barExt.extremePrice)})` : ''} | ` +
						`${rep.necklineSideReason ? `❌ \`${rep.necklineSideReason}\`` : '✅'} |`,
				);
			});
			const nsBad = sorted.filter((k) => {
				const g = dropped05.filter((r) => tsKey(r) === k).sort((a, b) => (a.spreadRatio ?? 0) - (b.spreadRatio ?? 0));
				return g[Math.floor(g.length / 2)].necklineSideReason !== null;
			}).length;
			say();
			say(
				`**${nsBad} / ${sorted.length} 実体は、\`validateMainPointsNecklineSide\`（#216 Phase 2。` +
					'完成済み 4 経路には配線済み・形成中 2 経路には**未配線**）でも落ちる。** ' +
					'高さ相対のゲートと重なる範囲がこれだけあるので、Phase 2 では' +
					'**どちらの検査が本来の帰属か**を分けて考える必要がある（本メモ §7）。',
			);
		}
	}
	say();

	// ── §4 形成中 double ──
	say('## 4. 形成中 double の同じ量（実装対象は本 Phase では決めない）');
	say();
	say('**形成中 double の 2 経路は主構成点の取り方が非対称**なので、測る 3 点も経路ごとに違う:');
	say();
	say('| 経路 | 主構成点 | 全構成点 | `current` は主構成点か |');
	say('|---|---|---|---|');
	say('| `tryFormingDoubleTop` | 確定 1 山 + **最新足**（`forming_peak`） | 山1 / 谷 / 最新足 | ✅ |');
	say(
		'| `tryFormingDoubleBottom` | **確定 2 谷** | 谷1 / 山 / 谷2 | ❌（`currentPrice` は有効性判定と完成度にのみ使う） |',
	);
	say();
	say(
		'つまり `double_bottom` の形成中経路は**完成済みとまったく同じ 3 点**で測れる' +
			'（第 2 谷が既に確定ピボット）。`double_top` だけが #169 の idiom を要る。',
	);
	say();
	const doubles = recs.filter((r) => r.family === 'double');
	const dTop = doubles.filter((r) => r.type === 'double_top');
	say(
		`accepted な形成中 double: **延べ ${doubles.length} 件 / 構造 ${new Set(doubles.map(structKey)).size} 件 / ` +
			`実体 ${new Set(doubles.map(tsKey)).size} 件**（うち \`double_top\` は 延べ ${dTop.length} 件）`,
	);
	say();
	if (doubles.length > 0) {
		say('| 母集団 | 時間足 | type | 延べ | 構造 | `spreadRatio` min / p50 / p90 / max | > 0.5 の延べ |');
		say('|---|---|---|---:|---:|---|---:|');
		for (const part of corpus) {
			const rs = doubles.filter((r) => r.corpus === part.label);
			if (rs.length === 0) continue;
			for (const k of [...new Set(rs.map((r) => `${r.tf}|${r.type}`))].sort()) {
				const [tf, type] = k.split('|');
				const g = rs.filter((r) => r.tf === tf && r.type === type);
				const sr = stats(g.filter((r) => r.spreadRatio !== null).map((r) => r.spreadRatio as number));
				const ov = g.filter((r) => r.spreadRatio !== null && (r.spreadRatio as number) > base.MAX_LEVEL_SPREAD_RATIO);
				say(
					`| ${part.label} | ${tf} | ${type} | ${g.length} | ${new Set(g.map(structKey)).size} | ` +
						`${f4(sr.min)} / ${f4(sr.p50)} / ${f4(sr.p90)} / ${f4(sr.max)} | ${ov.length} |`,
				);
			}
		}
		say();
		const dOver = doubles.filter(
			(r) => r.spreadRatio !== null && (r.spreadRatio as number) > base.MAX_LEVEL_SPREAD_RATIO,
		);
		say(
			`**形成中 double で 0.5 を超えるのは 延べ ${dOver.length} / ${doubles.length} 件、構造 ${new Set(dOver.map(structKey)).size} 件。**`,
		);
	} else {
		say('accepted な形成中 double は **0 件**。');
	}
	say();

	// ── §5 波及 ──
	say('## 5. 波及の確認');
	say();
	say('### 5-1. `FORMING_*` 係数の独立性');
	say();
	say('形成中の 3 係数はいずれも `tolerancePct` から派生している:');
	say();
	say('| 係数 | 値 | 実効閾値の式 |');
	say('|---|---|---|');
	say(
		`| \`FORMING_TOLERANCE_MULTIPLIER\` | ${base.FORMING_TOLERANCE_MULTIPLIER} | \`tripleTolerancePct = tolerancePct × ${base.FORMING_TOLERANCE_MULTIPLIER}\` |`,
	);
	say(
		`| \`FORMING_LEVEL_SPREAD_FACTOR\` | ${base.FORMING_LEVEL_SPREAD_FACTOR} | \`levelSpreadLimit = tripleTolerancePct × ${base.FORMING_LEVEL_SPREAD_FACTOR}\` |`,
	);
	say(
		`| \`FORMING_NECKLINE_SPREAD_FACTOR\` | ${base.FORMING_NECKLINE_SPREAD_FACTOR} | \`necklineSpreadLimit = tolerancePct × ${base.FORMING_NECKLINE_SPREAD_FACTOR}\` |`,
	);
	say();
	say(
		'高さ相対のゲートを**足すだけ**なら他の係数に触らない。それを機械的に確かめるため、' +
			'ablation ビルドで**新ゲートより前に置かれた棄却理由の件数**を base と突き合わせる。',
	);
	say();
	const baseReasonCounts = new Map<string, number>();
	const baseReasonPerCase = new Map<string, Map<string, number>>();
	for (const part of corpus) {
		for (const row of byCorpusRows.get(part.label) ?? []) {
			const perCase = new Map<string, number>();
			baseReasonPerCase.set(caseKeyOf(row.spec), perCase);
			for (const c of row.cands) {
				if (typeof c.reason === 'string' && PRIOR_REASONS.includes(c.reason)) {
					baseReasonCounts.set(c.reason, (baseReasonCounts.get(c.reason) ?? 0) + 1);
					perCase.set(c.reason, (perCase.get(c.reason) ?? 0) + 1);
				}
			}
		}
	}
	const abl05 = ablResults.get(0.5) as AblResult;
	say(
		'**判定は「一致」ではなく「減っていないこと」。** 新ゲートは棄却時に `continue` するので、' +
			'base なら成功して `return` していたケースで**ループが先の（より古い）ペアまで回り続ける**。' +
			'その追加の周回が既存の理由コードを新たに積むため、**件数は増える方向にしか動かない**のが正常。' +
			'**減っていたら**それは新ゲートが既存の理由を横取りしている証拠になる（配置規約違反）。',
	);
	say();
	say('| 新ゲートより前の理由コード | base | ablation (0.5) | 増減 | 減ったケース数 |');
	say('|---|---:|---:|---:|---:|');
	let stolen = 0;
	for (const r of PRIOR_REASONS) {
		const a = baseReasonCounts.get(r) ?? 0;
		const b = abl05.priorReasonCounts.get(r) ?? 0;
		let decreased = 0;
		for (const [k, m] of baseReasonPerCase) {
			const n = abl05.priorReasonPerCase.get(k)?.get(r) ?? 0;
			if ((m.get(r) ?? 0) > n) decreased++;
		}
		stolen += decreased;
		say(`| \`${r}\` | ${a} | ${b} | ${b - a >= 0 ? '+' : ''}${b - a} | ${decreased} |`);
	}
	say();
	say(
		stolen === 0
			? '**減ったケースは 1 件も無い。** 新ゲートは既存の棄却理由を横取りしていない。' +
					'増加分はすべて「base では成功して `return` していた周回が、ゲートの `continue` で続いたこと」による。'
			: `**${stolen} ケースで既存理由が減った。** 挿入位置が既存の理由を横取りしている——配置を見直すこと。`,
	);
	say();

	say('### 5-2. `view=debug` の cap（200 件）への影響');
	say();
	say(
		'`detect_patterns.ts` の並べ替え（`[...accepted, ...型間排他の棄却, ...検出器の棄却].slice(0, 200)`）を' +
			'再現して、新理由コードのエントリが cap 内に残るかを測る。**新ゲートの棄却は検出器の棄却の末尾側に' +
			'積まれる**ので、飽和しているケースでは押し出される側になる。',
	);
	say();
	say(
		'| 母集団 | ケース | 飽和ケース（base） | `candidatesTotal` p50 / max（base） | 飽和ケース（abl 0.5） | 新理由コードが cap 内に残った延べ / 全延べ |',
	);
	say('|---|---:|---:|---|---:|---|');
	for (const part of corpus) {
		const rows = byCorpusRows.get(part.label) ?? [];
		if (rows.length === 0) continue;
		const totalsBase = rows.map((r) => filterCandidatesByWant([...r.cands], new Set()).length);
		const satBase = totalsBase.filter((n) => n > DEBUG_CAP).length;
		const agg = abl05.perCorpus.get(part.label) ?? { saturated: 0, newTotal: 0, newVisible: 0 };
		const st = stats(totalsBase);
		say(
			`| ${part.label} | ${rows.length} | ${satBase} | ${st.p50} / ${st.max} | ${agg.saturated} | ` +
				`${agg.newVisible} / ${agg.newTotal}` +
				`${agg.newTotal > 0 ? ` (${((agg.newVisible / agg.newTotal) * 100).toFixed(1)}%)` : ''} |`,
		);
	}
	say();

	say('### 5-3. `confidence` の採点式との整合');
	say();
	say(
		'形成中 triple の `rawConfidence = (1 − currentDiff / tripleTolerancePct) × 0.8` は**価格相対**を使っている。' +
			'ゲートを足しても採点式は変えない前提なので、「落とす候補が高 confidence 側に偏っていないか」を見る。',
	);
	say();
	const withConf = triples.filter((r) => r.confidence !== null && r.spreadRatio !== null);
	if (withConf.length > 0) {
		const overC = withConf.filter((r) => (r.spreadRatio as number) > base.MAX_LEVEL_SPREAD_RATIO);
		const underC = withConf.filter((r) => (r.spreadRatio as number) <= base.MAX_LEVEL_SPREAD_RATIO);
		const cs1 = stats(overC.map((r) => r.confidence as number));
		const cs2 = stats(underC.map((r) => r.confidence as number));
		say('| 集合 | 延べ | `confidence` min / p50 / max |');
		say('|---|---:|---|');
		say(
			`| \`spreadRatio > ${base.MAX_LEVEL_SPREAD_RATIO}\`（ゲートで落ちる側） | ${cs1.n} | ${f4(cs1.min)} / ${f4(cs1.p50)} / ${f4(cs1.max)} |`,
		);
		say(
			`| \`spreadRatio <= ${base.MAX_LEVEL_SPREAD_RATIO}\`（残る側） | ${cs2.n} | ${f4(cs2.min)} / ${f4(cs2.p50)} / ${f4(cs2.max)} |`,
		);
		say();
		const ys = withConf.map((r) => r.spreadRatio as number);
		const confCorr = pearson(
			withConf.map((r) => r.confidence as number),
			ys,
		);
		const priceCorr = pearson(
			withConf.map((r) => r.levelSpread / r.levelSpreadLimit),
			ys,
		);
		say('| 相関（ピアソン） | 値 | 読み方 |');
		say('|---|---:|---|');
		say(
			`| \`confidence\` × \`spreadRatio\` | ${confCorr.toFixed(4)} | ` +
				'0 に近いほど**採点式は高さ相対を代理できていない**（＝ゲートは採点式と独立な情報を足す） |',
		);
		say(
			`| 価格相対の使用率 × \`spreadRatio\` | ${priceCorr.toFixed(4)} | ` +
				'1 に近いほど価格相対のゲートで高さ相対を代用できる |',
		);
		say();
		say(
			'`confidence` は `currentDiff`（現在値と 2 山平均の差）だけを見ており、`spreadRatio` の分母' +
				'（パターン高さ）を一切見ていない。**採点式は変えず、ゲートを足すだけ**という前提と整合する。',
		);
	} else {
		say('accepted な形成中 triple が 0 件のため算出できない。');
	}
	say();

	const text = out.join('\n');
	process.stdout.write(`${text}\n`);
	if (jsonPath) {
		writeFileSync(
			jsonPath,
			`${JSON.stringify(
				{
					generatedAt: nowIso(),
					caseCount,
					maxLevelSpreadRatio: base.MAX_LEVEL_SPREAD_RATIO,
					records: recs,
				},
				null,
				2,
			)}\n`,
		);
		process.stderr.write(`JSON を書き出した: ${jsonPath}\n`);
	}
}

/** ピアソン相関。標準偏差が 0 なら 0 を返す。 */
function pearson(xs: readonly number[], ys: readonly number[]): number {
	const n = xs.length;
	if (n === 0) return 0;
	const mx = xs.reduce((a, b) => a + b, 0) / n;
	const my = ys.reduce((a, b) => a + b, 0) / n;
	let num = 0;
	let dx = 0;
	let dy = 0;
	for (let i = 0; i < n; i++) {
		num += (xs[i] - mx) * (ys[i] - my);
		dx += (xs[i] - mx) ** 2;
		dy += (ys[i] - my) ** 2;
	}
	return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

/**
 * ローリング窓の中で構造がその後どうなったかを組み立てる。
 *
 * 「完成」は**後続の終端で accepted な完成済みエントリ**（`peak1`/`peak2`/`peak3` の 3 点以上）が
 * 同じ `idxs[0]` / `idxs[1]` で現れたこと。「高さ相対で棄却」は完成済み経路の
 * `peak_spread_vs_height_excess` / `valley_spread_vs_height_excess` が同じ 2 点で現れたこと。
 */
function buildFollowUps(byCorpusRows: Map<string, Row[]>, triples: readonly FormingRec[]): Map<string, FollowUp> {
	// (系列, tf, sd) → 終端 → { 完成した (m1-m2) の集合, 高さ相対で落ちた (m1-m2) の集合, forming の集合 }
	interface Slice {
		end: number;
		completed: Set<string>;
		heightRejected: Set<string>;
		forming: Set<string>;
	}
	const lanes = new Map<string, Slice[]>();
	for (const rows of byCorpusRows.values()) {
		for (const row of rows) {
			if (!row.spec.rolling) continue;
			const lane = `${row.spec.series.name}|${row.spec.tf}|${row.spec.swingDepth ?? 'auto'}`;
			const slice: Slice = {
				end: row.spec.windowEnd,
				completed: new Set(),
				heightRejected: new Set(),
				forming: new Set(),
			};
			for (const c of row.cands) {
				if (c.type !== 'triple_top' && c.type !== 'triple_bottom') continue;
				const idxs = c.indices ?? [];
				if (idxs.length < 2) continue;
				const key = `${c.type}|${idxs[0]}-${idxs[1]}`;
				if (c.accepted && c.status === 'forming') slice.forming.add(key);
				else if (c.accepted) slice.completed.add(key);
				else if (typeof c.reason === 'string' && HEIGHT_GATE_REASONS.has(c.reason)) slice.heightRejected.add(key);
			}
			const arr = lanes.get(lane);
			if (arr) arr.push(slice);
			else lanes.set(lane, [slice]);
		}
	}
	for (const arr of lanes.values()) arr.sort((a, b) => a.end - b.end);

	const out = new Map<string, FollowUp>();
	for (const r of triples) {
		if (!r.rolling) continue;
		const k = structKey(r);
		if (out.has(k)) continue;
		// 同じ構造は複数の swingDepth レーンに出るので、全レーンを OR で畳む。
		let completed = false;
		let heightRejected = false;
		let stillSeen = false;
		let lastFormingEnd = r.windowEnd;
		const local = `${r.type}|${r.main1Idx}-${r.main2Idx}`;
		for (const [lane, arr] of lanes) {
			if (!lane.startsWith(`${r.series}|${r.tf}|`)) continue;
			const first = arr.find((s) => s.forming.has(local));
			if (!first) continue;
			for (const s of arr) {
				if (s.forming.has(local)) lastFormingEnd = Math.max(lastFormingEnd, s.end);
				if (s.end <= first.end) continue;
				if (s.completed.has(local)) completed = true;
				if (s.heightRejected.has(local)) heightRejected = true;
				if (s.forming.has(local) || s.completed.has(local) || s.heightRejected.has(local)) stillSeen = true;
			}
		}
		out.set(k, { completed, rejectedByHeightGate: heightRejected, vanished: !stillSeen, lastFormingEnd });
	}
	return out;
}

main().catch((e) => {
	process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
	process.exit(1);
});
