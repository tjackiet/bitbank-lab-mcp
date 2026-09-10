/**
 * issue #262 Phase 1: **形成中 double の「形成中」の定義が top / bottom で違う**件を実測する。
 * **検出器・`structural.ts`・`config.ts`・ベースラインは 1 行も変更しない**（計測とドキュメントだけ）。
 *
 * ## 問題設定（コードの事実）
 *
 * issue #262 本文は「主構成点の取り方が非対称」と書いているが、`tools/patterns/detect_doubles.ts` を
 * 読むと **2 経路は「形成中」の段階そのものが違う**。
 *
 * | | `tryFormingDoubleTop` | `tryFormingDoubleBottom` |
 * |---|---|---|
 * | 確定ピボット | 山1 + 谷（2 点） | 谷1 + 山 + 谷2（**3 点。構造は完成済みと同じ**） |
 * | 最新足の役割 | **山2 の暫定値**（`forming_peak`） | 有効性判定と完成度にのみ使う |
 * | 意味 | 「2 つ目の山を作っている途中」 | 「構造は揃い、ネックライン突破を待っている」 |
 * | 終端 status | 無し（`forming` のみ） | `invalid` / `expired`（#126 G4 / G5） |
 * | `pivots` | 2 点 | 3 点 |
 *
 * 主構成点の取り方の差は**この定義の差の帰結**であって、原因ではない。
 *
 * ## 出すもの（issue #262 の計測仕様 1〜4）
 *
 * | § | 内容 |
 * |---|---|
 * | 1 | 現行 `tryFormingDoubleTop` の棄却理由の分布（cap 前の生データ）。**0 件の律速を確定する** |
 * | 2 | 現行 `tryFormingDoubleBottom` のベースライン（accepted / `expired` / `invalid` と棄却理由） |
 * | 3 | **ablation A**: bottom を top の流儀（最終構成点が形成中）に組み替えた複製 |
 * | 4 | **ablation B**: top を bottom の流儀（構造完成・ブレイク待ち）に組み替えた複製。**主指標** |
 * | 5 | ローリング窓での追跡（A / B で accepted になった構造のその後。#260 §8 と同じ 3 分類） |
 * | 6 | 目視判定の材料（B で新たに accepted になる `double_top` の実体の明細） |
 * | 7 | `view=debug` の cap=200 への影響 |
 *
 * 契約への影響の棚卸し（仕様 6）と triple / H&S との整合（仕様 7）はコードを読んで書く静的な表なので
 * 本スクリプトでは出さない。`docs/internal/forming-double-asymmetry-262.md` §7 / §8 を参照。
 *
 * ## ハーネス
 *
 * `scripts/measure_forming_triple_level_spread_178.ts`（PR #265 の版）に倣い、
 * **`tools/patterns/` をディレクトリごと**一時領域へ展開して読む。検出器 1 ファイルだけを写すと
 * `./structural.js` が作業ツリーへ解決され、ablation ビルドに現行実装が混ざる。
 *
 * 展開するビルドは 5 つ。
 *
 * | ビルド | 中身 | 用途 |
 * |---|---|---|
 * | `base` | **本体は 1 文字も変えない**（末尾に `export { … }` を 1 行足すだけ） | §1 / §2 の分布。作業ツリーと全ケースで一致することを §0 が検算する |
 * | `noTop` | `tryFormingDoubleTop` の本体を `return null` に差し替え | 形成中 top 経路の候補を**差分で同定する**ための対照 |
 * | `noBottom` | `tryFormingDoubleBottom` の本体を `return null` に差し替え | 同、bottom 経路 |
 * | `ablA` | `tryFormingDoubleBottom` を top の流儀へ組み替え | §3 |
 * | `ablB` | `tryFormingDoubleTop` を bottom の流儀へ組み替え | §4 |
 *
 * ### 経路の同定を「理由コードの名前」でやらない理由
 *
 * 形成中経路の棄却理由には**完成済み経路と共有のもの**がある（`prior_trend_mismatch:*` と
 * `validateReversalStructure` のゲート理由）。名前で振り分けると完成済みの棄却が混ざる。
 * そこで `noTop` / `noBottom` を対照に置き、**同じケースの `debugCandidates` の差集合**を取る。
 * 形成中経路は `detectDoubles` の最後で呼ばれ `debugCandidates` に積む以外の副作用が無いので、
 * 対照ビルドの候補列は base の候補列の**部分列**になる。部分列であることを毎ケース検算し、
 * 崩れたらその場で落ちる（差分の帰属が保証されなくなるため）。
 *
 * ## コーパス
 *
 * `measure_forming_triple_level_spread_178.ts` と**同じ 12,104 ケース**
 * （標準 800 = 合成 704 + 実データ A 96、実データ B / C / D 各 96、ローリング窓 3,672 × 3）。
 * **プールしない**（#219）。
 *
 * 実データ B / C / D は同じ btc_jpy 1 時間足履歴の**重なる窓**なので、
 * 構造の実体数を言うときは**絶対時刻で畳む**（本スクリプトの「実体」列）。
 *
 * **注意（#178 より）**: 標準コーパスの「実データ A 96」は `btc_jpy_1day_2026` の同じ 90 本に
 * `tf` ラベルを付け替えたもので、時間足別の内訳は独立系列ではない。
 *
 * ## 使い方
 *
 * ```bash
 * # **形成中 double の 2 経路が両方残っている ref を渡す**（{@link STRIP_REF_BOTH_FORMING_PATHS}）。
 * # `tryFormingDoubleBottom` は #262（PR #270）、`tryFormingDoubleTop` は #268 案 C で削除済みなので、
 * # 既定の `main` がそれらを取り込んだ後は `--strip-ref` 無しでは走らない（起動時に案内して落ちる）。
 * npx tsx scripts/measure_forming_double_asymmetry_262.ts --strip-ref a920019
 * npx tsx scripts/measure_forming_double_asymmetry_262.ts --strip-ref a920019 --json /tmp/262.json
 * npx tsx scripts/measure_forming_double_asymmetry_262.ts --strip-ref a920019 --no-rolling  # 短時間確認用
 * ```
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nowIso } from '../lib/datetime.js';
import { buildBtcJpy2026Candles } from '../tests/fixtures/btc_jpy_1day_2026.js';
import { buildBtcJpy1hour202608Candles } from '../tests/fixtures/btc_jpy_1hour_2026_08.js';
import { buildBtcJpy1hour202609Candles } from '../tests/fixtures/btc_jpy_1hour_2026_09.js';
import { buildBtcJpy1hour20260905Candles } from '../tests/fixtures/btc_jpy_1hour_2026_09_05.js';
import * as synth from '../tests/fixtures/synthetic_pattern_candles.js';
import { filterCandidatesByWant } from '../tools/patterns/candidate-filter.js';
import { getHsShoulderMaxPctForTf, getSizeThresholdsForTf, resolveParams } from '../tools/patterns/config.js';
import { detectDoubles as realDetectDoubles } from '../tools/patterns/detect_doubles.js';
import { detectTriples as realDetectTriples } from '../tools/patterns/detect_triples.js';
import { TRIPLE_HS_EXCLUSION_REASON } from '../tools/patterns/mutual-exclusion.js';
import { linearRegressionWithR2, near as nearFn, pct as pctFn } from '../tools/patterns/regression.js';
import { type Candle, detectSwingPoints, filterPeaks, filterValleys } from '../tools/patterns/swing.js';
import type { CandDebugEntry, DeduplicablePattern, DetectContext } from '../tools/patterns/types.js';

const ROOT = resolve(import.meta.dirname, '..');
const TMP_DIR = mkdtempSync(join(tmpdir(), 'forming-double-262-'));

type Detector = (ctx: DetectContext) => { patterns: DeduplicablePattern[] };

/**
 * 1 ビルドぶんの検出器と、そのビルドが実際に持っている形成中の係数。
 *
 * **係数は検出器と同じ展開ディレクトリから読む。** 作業ツリーから取ると、ablation ビルドの
 * 表示だけが別ソースの値になる（PR #253 の CodeRabbit 指摘と同じ穴）。
 */
interface Build {
	detectDoubles: Detector;
	detectTriples: Detector;
	DOUBLE_LEVEL_MAX_PCT: number;
	MIN_FORMING_COMPLETION: number;
	MIN_PATTERN_DAYS: number;
	FORMING_PEAK_TOLERANCE_PCT: number;
	/** #262 Phase 2 で削除。strip ビルド（`main`）にだけ在る。 */
	FORMING_TOLERANCE_MULTIPLIER?: number;
	/** 同上。 */
	FORMING_VALLEY_INVALID_PCT?: number;
	FORMING_EXPIRY_BARS: number;
	getDoubleFormingBarParams: (tf: string) => { minBars: number; maxBars: number };
}

/**
 * 展開先のファイル末尾に足す export（ファイル名 → 追記する 1 行）。
 *
 * **既に export されている宣言は書かない**（`MIN_FORMING_COMPLETION` / `MIN_PATTERN_DAYS` /
 * `getDoubleFormingBarParams`）——重複 export は構文エラーになる。追記するのはモジュール内で
 * 閉じていた `const` だけで、**宣言に名前を付け直すだけなので判定は 1 ミリも変わらない。**
 * それを §0 の検算が全ケースで確かめる。
 */
/**
 * 展開ビルドの末尾に足す `export { … }`。**そのソースに実在する識別子だけを並べる。**
 *
 * `FORMING_TOLERANCE_MULTIPLIER` / `FORMING_VALLEY_INVALID_PCT` は `tryFormingDoubleBottom` 専用の
 * 係数で、issue #262 Phase 2 で同関数ごと削除された。strip ビルド（`main` のソース）には在って
 * 作業ツリーには無いので、固定文字列で書くと**どちらかのビルドが必ず読み込みに失敗する。**
 */
const DOUBLES_INTERNAL_SYMBOLS = [
	'FORMING_PEAK_TOLERANCE_PCT',
	'FORMING_TOLERANCE_MULTIPLIER',
	'FORMING_VALLEY_INVALID_PCT',
	'FORMING_EXPIRY_BARS',
] as const;

/** {@link DOUBLES_INTERNAL_SYMBOLS} のうち、そのソースに実在するものだけの `export { … }` を返す。 */
function internalExportsFor(name: string, src: string): string {
	if (name !== 'detect_doubles.ts') return '';
	const present = DOUBLES_INTERNAL_SYMBOLS.filter(
		(sym) => src.includes(`const ${sym} `) || src.includes(`const ${sym}=`),
	);
	return present.length > 0 ? `\nexport { ${present.join(', ')} };\n` : '';
}

// ── 形成中 2 経路の差し替え（ablation / 対照ビルド） ──

/**
 * 形成中 2 経路の**関数まるごと**の差し替え範囲。
 *
 * 波括弧の対応で末尾を探さない——本ファイルの docstring には `{@link …}` や
 * `{ extremePrice: 最新足の終値 }` が入っていて、コメントを読み飛ばさない素朴な数え上げは必ず壊れる。
 * 代わりに**関数シグネチャ**から**次の節コメント**までを範囲に取り、
 * 両アンカーがそれぞれちょうど 1 回現れることと前後関係を差し替え前に確認する。
 */
const FN_SPANS = {
	top: {
		start: 'function tryFormingDoubleTop(ctx: DetectContext): PatternEntry | null {',
		end: '\n// ── Helper: 形成中ダブルボトム検索 ──',
	},
	bottom: {
		start: 'function tryFormingDoubleBottom(ctx: DetectContext): PatternEntry | null {',
		end: '\n// ── Main ──',
	},
} as const;

type Side = keyof typeof FN_SPANS;

/** 差し替えたビルドに埋める目印。差し替え後にちょうど 1 回現れることを確認する。 */
const MARKERS = {
	disableTop: '__off262_top',
	disableBottom: '__off262_bottom',
	ablA: '__abl262A',
	ablB: '__abl262B',
} as const;

/** 形成中経路を丸ごと黙らせる対照ビルドの本体（差分で経路を同定するための対照）。 */
function disabledBody(side: Side, marker: string): string {
	const jp = side === 'top' ? 'ダブルトップ' : 'ダブルボトム';
	return [
		FN_SPANS[side].start,
		`\t// [対照ビルド issue #262] 形成中${jp}経路を丸ごと無効化した。`,
		'\t// 計測ハーネスが差し替えた本体で、作業ツリーには存在しない。この経路が積む候補は',
		'\t// base との差集合として同定される（スクリプト冒頭の docstring）。',
		'\tvoid ctx;',
		`\t// ${marker}`,
		'\treturn null;',
		'}',
		'',
	].join('\n');
}

/**
 * **ablation A**: `tryFormingDoubleBottom` を `tryFormingDoubleTop` の流儀（最終構成点が形成中）へ
 * 組み替えた本体。`tryFormingDoubleTop` を符号反転しただけで、閾値・係数は 1 つも変えていない。
 */
const ABLATION_A_BODY = `function tryFormingDoubleBottom(ctx: DetectContext): PatternEntry | null {
	// [ablation issue #262 案 A] __abl262A
	// 形成中ダブルボトムを **top の流儀**（最終構成点が形成中）へ組み替えたビルド。
	// 計測ハーネスが差し替えた本体で、作業ツリーには存在しない。
	//
	// \`tryFormingDoubleTop\` を符号反転しただけの写し。したがって:
	//   - 確定ピボットは 谷1 + 山 の 2 点。谷2 は**最新足の終値の暫定値**（role \`forming_valley\`）
	//   - 現行 bottom が持つ両脚の高さチェック（\`forming_pattern_height_below_min\`）は**無い**
	//     ——top の流儀には対応する検査が無く、右脚の極値がまだ確定していないため
	//   - \`checkPostPivotInvalidation\` / \`expired\` / \`invalid\` も**無い**（top の流儀には終端 status が無い）
	//   - \`pivots\` は 2 点
	const { candles, allPeaks, allValleys, want } = ctx;
	if (!(want.size === 0 || want.has('double_bottom')) || allValleys.length < 1 || allPeaks.length < 1) return null;

	const lastIdx = candles.length - 1;
	const currentPrice = Number(candles[lastIdx]?.close ?? NaN);
	const isoAt = (i: number) => candles[i]?.isoTime || '';

	const lastConfirmedValley = [...allValleys].reverse().find((v) => v.idx < lastIdx - 2);
	if (!lastConfirmedValley) {
		pushCand(ctx, { type: 'double_bottom', accepted: false, reason: 'forming_no_confirmed_valley' });
		return null;
	}
	const peakAfterValley = allPeaks.find((p) => p.idx > lastConfirmedValley.idx && p.idx < lastIdx - 1);
	if (!peakAfterValley || peakAfterValley.idx <= lastConfirmedValley.idx) {
		pushCand(ctx, {
			type: 'double_bottom',
			accepted: false,
			reason: 'forming_no_peak_after_valley',
			idxs: [lastConfirmedValley.idx],
			pts: [{ role: 'valley1', idx: lastConfirmedValley.idx, price: lastConfirmedValley.price }],
		});
		return null;
	}

	const leftValley = lastConfirmedValley;
	const peak = peakAfterValley;
	const formingPts = [
		{ role: 'valley1', idx: leftValley.idx, price: leftValley.price },
		{ role: 'peak', idx: peak.idx, price: peak.price },
		{ role: 'forming_valley', idx: lastIdx, price: currentPrice },
	];
	const formingIdxs = [leftValley.idx, peak.idx, lastIdx];
	const rejectForming = (reason: string) => {
		pushCand(ctx, { type: 'double_bottom', accepted: false, reason, idxs: formingIdxs, pts: formingPts });
	};

	const leftPct = currentPrice / Math.max(1, leftValley.price);
	if (leftPct < 1 - FORMING_PEAK_TOLERANCE_PCT || leftPct > 1 + FORMING_PEAK_TOLERANCE_PCT) {
		rejectForming('forming_valley_level_out_of_tolerance');
		return null;
	}
	if (!isSameLevel(currentPrice, leftValley.price, DOUBLE_LEVEL_MAX_PCT)) {
		rejectForming('forming_valleys_not_level');
		return null;
	}
	if (currentPrice >= peak.price) {
		rejectForming('forming_current_at_or_above_peak');
		return null;
	}

	const ratio = (peak.price - currentPrice) / Math.max(EPSILON, peak.price - leftValley.price);
	const progress = Math.max(0, Math.min(1, ratio));
	const completion = Math.min(1, FORMING_BASE_COMPLETION + progress * FORMING_COMPLETION_RANGE);
	if (completion < MIN_FORMING_COMPLETION) {
		rejectForming('forming_completion_below_min');
		return null;
	}

	const formationBars = Math.max(0, lastIdx - leftValley.idx);
	const formingBars = getDoubleFormingBarParams(ctx.type);
	if (formationBars < formingBars.minBars || formationBars > formingBars.maxBars) {
		rejectForming('forming_bars_out_of_range');
		return null;
	}

	const trend = validatePriorTrend(candles, leftValley.idx, lastIdx - leftValley.idx, 'down_or_sideways');
	if (!trend.ok) {
		ctx.debugCandidates.push({
			type: 'double_bottom',
			accepted: false,
			reason: \`prior_trend_mismatch:\${trend.classification}\`,
			indices: [leftValley.idx, peak.idx, lastIdx],
			points: [
				{ role: 'valley1', idx: leftValley.idx, price: leftValley.price, isoTime: candles[leftValley.idx]?.isoTime },
				{ role: 'peak', idx: peak.idx, price: peak.price, isoTime: candles[peak.idx]?.isoTime },
				{ role: 'forming_valley', idx: lastIdx, price: currentPrice, isoTime: candles[lastIdx]?.isoTime },
			],
		});
		return null;
	}
	if (trend.classification === 'insufficient_data') {
		ctx.debugCandidates.push({
			type: 'double_bottom',
			accepted: true,
			reason: 'prior_trend_insufficient_data',
			indices: [leftValley.idx, peak.idx, lastIdx],
		});
	}

	const sizeReason = validateBottomSize(leftValley, peak, { extremePrice: currentPrice }, ctx.sizeThresholds);
	if (sizeReason) {
		rejectForming(formingSizeReason(sizeReason));
		return null;
	}

	const gate = validateReversalStructure({
		candles,
		pivots: ctx.pivots,
		first: leftValley,
		mid: peak,
		necklinePrice: peak.price,
		side: 'bottom',
	});
	if (!gate.ok) {
		ctx.debugCandidates.push({
			type: 'double_bottom',
			accepted: false,
			reason: gate.reason,
			indices: [leftValley.idx, peak.idx, lastIdx],
			points: [
				{ role: 'valley1', idx: leftValley.idx, price: leftValley.price, isoTime: candles[leftValley.idx]?.isoTime },
				{ role: 'peak', idx: peak.idx, price: peak.price, isoTime: candles[peak.idx]?.isoTime },
			],
		});
		return null;
	}

	if (
		rejectFormingNecklineSide('bottom', 'double_bottom', [leftValley], peak.price, formingIdxs, formingPts, (arg) =>
			pushCand(ctx, arg),
		)
	) {
		return null;
	}

	const neckline = [
		{ x: leftValley.idx, y: peak.price },
		{ x: lastIdx, y: peak.price },
	];
	const confBase = Math.min(1, Math.max(0, (1 - Math.abs(leftPct - 1)) * 0.6 + progress * 0.4));
	const confidence = Math.round(confBase * 100) / 100;
	const start = isoAt(leftValley.idx);
	const end = isoAt(lastIdx);
	const formDbTarget = Math.round(peak.price + (peak.price - leftValley.price));
	const structureRange = start && end ? { start, end } : undefined;
	const precedingTrend = buildPrecedingTrend(candles, trend, leftValley.idx);
	const structureGate = buildStructureGate(gate);

	pushCand(ctx, {
		type: 'double_bottom',
		accepted: true,
		status: 'forming',
		idxs: formingIdxs,
		pts: formingPts,
	});

	return {
		type: 'double_bottom',
		confidence,
		scoreComponents: {
			symmetry: Number(clamp01(1 - relDev(leftValley.price, currentPrice)).toFixed(4)),
			...(retracementScore(gate.retracementRatio) !== undefined
				? { retracement: Number((retracementScore(gate.retracementRatio) as number).toFixed(4)) }
				: {}),
		},
		...(structureGate ? { structureGate } : {}),
		range: { start, end },
		...(structureRange ? { structureRange } : {}),
		confirmation: { type: 'not_confirmed' },
		...(precedingTrend ? { precedingTrend } : {}),
		status: 'forming',
		pivots: [
			{ idx: leftValley.idx, price: leftValley.price, kind: 'L' as const, extremePrice: leftValley.extremePrice },
			{ idx: peak.idx, price: peak.price, kind: 'H' as const, extremePrice: peak.extremePrice },
		],
		neckline,
		trendlineLabel: 'ネックライン',
		breakoutTarget: formDbTarget,
		targetMethod: 'neckline_projection' as const,
		...targetReachFields(omittedTargetReach('not_broken_out')),
		completionPct: Math.round(completion * 100),
		_method: 'forming_double_bottom',
	};
}
`;

/**
 * **ablation B**: `tryFormingDoubleTop` を `tryFormingDoubleBottom` の流儀（構造完成・ブレイク待ち）へ
 * 組み替えた本体。`tryFormingDoubleBottom` を符号反転しただけで、閾値・係数は 1 つも変えていない。
 */
const ABLATION_B_BODY = `function tryFormingDoubleTop(ctx: DetectContext): PatternEntry | null {
	// [ablation issue #262 案 B] __abl262B
	// 形成中ダブルトップを **bottom の流儀**（構造完成・ブレイク待ち）へ組み替えたビルド。
	// 計測ハーネスが差し替えた本体で、作業ツリーには存在しない。
	//
	// \`tryFormingDoubleBottom\` を符号反転しただけの写し。したがって:
	//   - 確定ピボットは 山1 + 谷 + 山2 の 3 点（構造は完成済みと同じ）
	//   - 最新足は有効性判定（\`forming_current_above_peak_zone\`）と完成度にのみ使う
	//   - 両脚の高さチェック / \`checkPostPivotInvalidation\` / \`expired\` / \`invalid\` が付く
	//   - \`pivots\` は 3 点（\`view=full\` の pivot 明細が出るようになる）
	const { candles, allPeaks, allValleys, tolerancePct, want, minDist } = ctx;
	if (!(want.size === 0 || want.has('double_top')) || allPeaks.length < 2) return null;

	const lastIdx = candles.length - 1;
	const currentPrice = Number(candles[lastIdx]?.close ?? NaN);
	const isoAt = (i: number) => candles[i]?.isoTime || '';
	const formingBars = getDoubleFormingBarParams(ctx.type);

	const confirmedPeaks = allPeaks.filter((p) => p.idx < lastIdx - 2);
	if (confirmedPeaks.length < 2) return null;

	for (let j = confirmedPeaks.length - 1; j >= 1; j--) {
		const rightPeak = confirmedPeaks[j];
		const leftPeak = confirmedPeaks[j - 1];
		if (rightPeak.idx - leftPeak.idx < minDist) continue;

		const valleysBetween = allValleys.filter((v) => v.idx > leftPeak.idx && v.idx < rightPeak.idx);
		if (!valleysBetween.length) continue;
		const midValley = valleysBetween.reduce((best, v) => (v.price < best.price ? v : best), valleysBetween[0]);

		const formingIdxs = [leftPeak.idx, midValley.idx, rightPeak.idx, lastIdx];
		const formingPts = [
			{ role: 'peak1', idx: leftPeak.idx, price: leftPeak.price },
			{ role: 'valley', idx: midValley.idx, price: midValley.price },
			{ role: 'peak2', idx: rightPeak.idx, price: rightPeak.price },
			{ role: 'current', idx: lastIdx, price: currentPrice },
		];
		const rejectForming = (reason: string) => {
			pushCand(ctx, { type: 'double_top', accepted: false, reason, idxs: formingIdxs, pts: formingPts });
		};

		const leftHeight = (leftPeak.extremePrice - midValley.extremePrice) / Math.max(EPSILON, leftPeak.extremePrice);
		const rightHeight = (rightPeak.extremePrice - midValley.extremePrice) / Math.max(EPSILON, rightPeak.extremePrice);
		if (!(leftHeight >= ctx.sizeThresholds.heightPct && rightHeight >= ctx.sizeThresholds.heightPct)) {
			rejectForming('forming_pattern_height_below_min');
			continue;
		}

		const peakDiff =
			Math.abs(leftPeak.price - rightPeak.price) / Math.max(1, Math.max(leftPeak.price, rightPeak.price));
		if (peakDiff > Math.min(tolerancePct * FORMING_TOLERANCE_MULTIPLIER, DOUBLE_LEVEL_MAX_PCT)) {
			rejectForming('forming_peaks_not_level');
			continue;
		}
		if (currentPrice > rightPeak.price * (1 + FORMING_VALLEY_INVALID_PCT)) {
			rejectForming('forming_current_above_peak_zone');
			continue;
		}

		const downRatio = (rightPeak.price - currentPrice) / Math.max(EPSILON, rightPeak.price - midValley.price);
		const progress = Math.max(0, Math.min(1, downRatio));
		const completion = Math.min(1, 0.66 + 0.34 * progress);
		if (completion < 0.4) {
			rejectForming('forming_completion_below_min');
			continue;
		}

		const formationBars = Math.max(0, lastIdx - leftPeak.idx);
		if (formationBars < formingBars.minBars || formationBars > formingBars.maxBars) {
			rejectForming('forming_bars_out_of_range');
			continue;
		}

		const trend = validatePriorTrend(candles, leftPeak.idx, lastIdx - leftPeak.idx, 'up_or_sideways');
		if (!trend.ok) {
			ctx.debugCandidates.push({
				type: 'double_top',
				accepted: false,
				reason: \`prior_trend_mismatch:\${trend.classification}\`,
				indices: [leftPeak.idx, midValley.idx, rightPeak.idx, lastIdx],
				points: [
					{ role: 'peak1', idx: leftPeak.idx, price: leftPeak.price, isoTime: candles[leftPeak.idx]?.isoTime },
					{ role: 'valley', idx: midValley.idx, price: midValley.price, isoTime: candles[midValley.idx]?.isoTime },
					{ role: 'peak2', idx: rightPeak.idx, price: rightPeak.price, isoTime: candles[rightPeak.idx]?.isoTime },
				],
			});
			continue;
		}
		if (trend.classification === 'insufficient_data') {
			ctx.debugCandidates.push({
				type: 'double_top',
				accepted: true,
				reason: 'prior_trend_insufficient_data',
				indices: [leftPeak.idx, midValley.idx, rightPeak.idx, lastIdx],
			});
		}

		const sizeReason = validateTopSize(leftPeak, midValley, rightPeak, ctx.sizeThresholds);
		if (sizeReason) {
			rejectForming(formingSizeReason(sizeReason));
			continue;
		}

		const gate = validateReversalStructure({
			candles,
			pivots: ctx.pivots,
			first: leftPeak,
			mid: midValley,
			necklinePrice: midValley.price,
			side: 'top',
		});
		if (!gate.ok) {
			ctx.debugCandidates.push({
				type: 'double_top',
				accepted: false,
				reason: gate.reason,
				indices: [leftPeak.idx, midValley.idx, rightPeak.idx, lastIdx],
				points: [
					...(gate.priorExtreme
						? [
								{
									role: 'prior_extreme',
									idx: gate.priorExtreme.idx,
									price: gate.priorExtreme.extremePrice,
									isoTime: candles[gate.priorExtreme.idx]?.isoTime,
								},
							]
						: []),
					{ role: 'peak1', idx: leftPeak.idx, price: leftPeak.price, isoTime: candles[leftPeak.idx]?.isoTime },
					{ role: 'valley', idx: midValley.idx, price: midValley.price, isoTime: candles[midValley.idx]?.isoTime },
					{ role: 'peak2', idx: rightPeak.idx, price: rightPeak.price, isoTime: candles[rightPeak.idx]?.isoTime },
				],
			});
			continue;
		}

		const post = checkPostPivotInvalidation({
			candles,
			pivots: ctx.pivots,
			a: leftPeak,
			b: midValley,
			c: rightPeak,
			untilIdx: lastIdx,
			side: 'top',
		});
		if (post.verdict === 'reclassify') {
			ctx.debugCandidates.push({
				type: 'double_top',
				accepted: false,
				reason: 'reclassified_as_triple_top',
				indices: [leftPeak.idx, midValley.idx, rightPeak.idx, lastIdx],
			});
			continue;
		}

		if (
			rejectFormingNecklineSide(
				'top',
				'double_top',
				[leftPeak, rightPeak],
				midValley.price,
				formingIdxs,
				formingPts,
				(arg) => pushCand(ctx, arg),
			)
		) {
			continue;
		}

		const barsSinceRightPeak = lastIdx - rightPeak.idx;
		const terminal: { status: string; invalidReason: string } | null =
			post.verdict === 'invalid'
				? { status: 'invalid', invalidReason: post.reason }
				: barsSinceRightPeak > FORMING_EXPIRY_BARS
					? { status: 'expired', invalidReason: 'forming_expired' }
					: null;

		const neckline = [
			{ x: midValley.idx, y: midValley.price },
			{ x: lastIdx, y: midValley.price },
		];
		const confidence = Number(Math.min(1, 0.5 + 0.5 * progress).toFixed(2));
		const start = isoAt(leftPeak.idx);
		const end = isoAt(lastIdx);
		const formDtAvgPeak = (leftPeak.price + rightPeak.price) / 2;
		const formDtTarget = Math.round(midValley.price - (formDtAvgPeak - midValley.price));
		const structStart = isoAt(leftPeak.idx);
		const structEnd = isoAt(rightPeak.idx);
		const structureRange = structStart && structEnd ? { start: structStart, end: structEnd } : undefined;
		const precedingTrend = buildPrecedingTrend(candles, trend, leftPeak.idx);
		const structureGate = buildStructureGate(gate);

		pushCand(ctx, {
			type: 'double_top',
			accepted: true,
			status: terminal ? terminal.status : 'forming',
			idxs: formingIdxs,
			pts: formingPts,
		});

		return {
			type: 'double_top',
			confidence,
			scoreComponents: {
				symmetry: Number(clamp01(1 - relDev(leftPeak.price, rightPeak.price)).toFixed(4)),
				...(retracementScore(gate.retracementRatio) !== undefined
					? { retracement: Number((retracementScore(gate.retracementRatio) as number).toFixed(4)) }
					: {}),
			},
			...(structureGate ? { structureGate } : {}),
			range: { start, end },
			...(structureRange ? { structureRange } : {}),
			confirmation: { type: 'not_confirmed' },
			...(precedingTrend ? { precedingTrend } : {}),
			status: terminal ? terminal.status : 'forming',
			...(terminal ? { invalidReason: terminal.invalidReason } : {}),
			pivots: [
				{ idx: leftPeak.idx, price: leftPeak.price, kind: 'H' as const, extremePrice: leftPeak.extremePrice },
				{ idx: midValley.idx, price: midValley.price, kind: 'L' as const, extremePrice: midValley.extremePrice },
				{ idx: rightPeak.idx, price: rightPeak.price, kind: 'H' as const, extremePrice: rightPeak.extremePrice },
			],
			neckline,
			trendlineLabel: 'ネックライン',
			breakoutTarget: formDtTarget,
			targetMethod: 'neckline_projection' as const,
			...targetReachFields(omittedTargetReach('not_broken_out')),
			completionPct: Math.round(completion * 100),
			_method: 'forming_double_top',
		};
	}
	return null;
}
`;

/** 展開ビルドの作り分け。 */
interface BuildVariantOpts {
	/** `tryFormingDoubleTop` の本体を差し替える（`disable` = 無効化 / `ablB` = 案 B の流儀へ）。 */
	top?: 'disable' | 'ablB';
	/** `tryFormingDoubleBottom` の本体を差し替える。 */
	bottom?: 'disable' | 'ablA';
	/**
	 * `tools/patterns/` を作業ツリーではなくこの git ref から取る（**strip ビルド**）。
	 *
	 * #264 / #265 と同じ様式。Phase 1 の 5 ビルドはこの PR より前の検出器で測った数字なので、
	 * 作業ツリーから組むと ablation のアンカー（削除済みの `tryFormingDoubleBottom` /
	 * `tryFormingDoubleTop`）を見失うだけでなく、§1〜§7 が Phase 1 と別物の測定になってしまう。
	 *
	 * **#268 案 C で `detect_doubles.ts` 1 ファイルから `tools/patterns/` 全ファイルへ広げた。**
	 * 元は他のファイルを作業ツリーのまま使い、「この PR が触ったのは `detect_doubles.ts` だけ」を
	 * {@link verifyStripScope} が検算する組み方だったが、案 C は `min-bars.ts` /
	 * `structural.ts` も触るのでその前提が成り立たない（当時のエラーメッセージが案内していた対処）。
	 */
	fromRef?: string;
}

/**
 * strip ビルドの組み方の検算（#264 / #265 の様式）。
 *
 * **#268 案 C 以降、strip は `tools/patterns/` を丸ごと ref から取る**ので、本関数が返す一覧は
 * 「作業ツリーとの差分の申告」（メモの §0 に出す）であって等価性のゲートではない。
 * ゲートとして残しているのは**ファイル構成のずれ**だけ——ref にしか無い / 作業ツリーにしか無い
 * ファイルがあると、ref から取った側の import が解決できない（または黙って古い構成で走る）。
 */
function verifyStripScope(ref: string): string[] {
	const changed = execFileSync('git', ['diff', '--name-only', ref, '--', 'tools/patterns/'], {
		cwd: ROOT,
		encoding: 'utf8',
	})
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean);
	const added = execFileSync('git', ['diff', '--name-only', '--diff-filter=AD', ref, '--', 'tools/patterns/'], {
		cwd: ROOT,
		encoding: 'utf8',
	})
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean);
	if (added.length > 0) {
		throw new Error(
			`strip ビルドが '${ref}' と組めない: ${added.join(', ')} が追加 / 削除されている。` +
				'ファイル構成がずれると、ref から取った側の import が解決できない（または黙って古い構成で走る）。' +
				'ファイルの追加 / 削除をまたぐ ref を strip に使わないこと。',
		);
	}
	return changed;
}

/**
 * **形成中 double の 2 経路が両方残っている最後の ref**（#267 のマージ commit）。
 *
 * 本スクリプトの §1〜§7 は `tryFormingDoubleTop` と `tryFormingDoubleBottom` の**両方**を
 * 差し替える（`noTop` / `noBottom` / `ablA` / `ablB`）ので、どちらかが欠けた ref では組めない。
 * `tryFormingDoubleBottom` は #262（PR #270）で、`tryFormingDoubleTop` は #268 案 C で削除した。
 *
 * **#271 のマージ commit は使えない**——#270 の後なので `tryFormingDoubleBottom` が無い。
 */
const STRIP_REF_BOTH_FORMING_PATHS = 'a920019';

/**
 * strip-ref 側の `detect_doubles.ts` に差し替えのアンカーがあることを**起動時に**確認する。
 * 無ければ**数字を 1 つも出さずに落とす。**
 *
 * 読むのは `materializePatternsDir` が実際に差し替える対象と同じもの（= strip-ref 側）。
 * 作業ツリーを見て判定すると、正しい ref を渡した場合まで落としてしまう。
 *
 * 黙って部分結果を出さないのは PR #260 のレビューで直した「コーパスが縮んだまま正常終了」と
 * 同じ原則。アンカーが無いまま走らせると ablation が現行実装のコピーになり、
 * §1〜§7 が「全段 0 件」として静かに壊れる。
 */
function requireFormingAnchors(ref: string): void {
	const path = 'tools/patterns/detect_doubles.ts';
	const src = execFileSync('git', ['show', `${ref}:${path}`], { cwd: ROOT, encoding: 'utf8' });
	const missing = (['top', 'bottom'] as const).filter((side) => !src.includes(FN_SPANS[side].start));
	if (missing.length === 0) return;
	throw new Error(
		[
			'',
			`'${ref}' の ${path} に ${missing.map((side) => `tryFormingDouble${side === 'top' ? 'Top' : 'Bottom'}`).join(' / ')} が無いので、`,
			'本スクリプトの ablation（base / noTop / noBottom / ablA / ablB）を組めません。',
			'',
			'形成中 double の 2 経路は段階的に削除されました:',
			'  - tryFormingDoubleBottom … issue #262（PR #270）',
			'  - tryFormingDoubleTop    … issue #268 案 C',
			'',
			'**計測は再計測の根拠として残してあるので、両方が残っている ref を渡してください**:',
			'',
			`  npx tsx scripts/measure_forming_double_asymmetry_262.ts --strip-ref ${STRIP_REF_BOTH_FORMING_PATHS}`,
			'',
			`  ${STRIP_REF_BOTH_FORMING_PATHS} = PR #267（#262 Phase 1）のマージ commit。`,
			'  #271 のマージ commit は **使えません**（#270 の後なので tryFormingDoubleBottom が無い）。',
			'',
			'部分結果は出しません。',
			'',
		].join('\n'),
	);
}

/** 差し替え 1 件ぶんの「置換後の本体」と「埋める目印」。 */
function replacementFor(side: Side, mode: 'disable' | 'ablA' | 'ablB'): { body: string; marker: string } {
	if (mode === 'disable') {
		const marker = side === 'top' ? MARKERS.disableTop : MARKERS.disableBottom;
		return { body: disabledBody(side, marker), marker };
	}
	if (mode === 'ablA') return { body: ABLATION_A_BODY, marker: MARKERS.ablA };
	return { body: ABLATION_B_BODY, marker: MARKERS.ablB };
}

/**
 * `detect_doubles.ts` の形成中 1 経路を**関数まるごと**差し替える。
 *
 * 差し替え前に、開始アンカー（関数シグネチャ）と終了アンカー（次の節コメント）が
 * **それぞれちょうど 1 回**現れ、かつ開始が終了より前にあることを確認する。
 * 差し替え後は目印が**ちょうど 1 回**現れることを確認する。
 * どれか 1 つでも崩れたらその場で落ちる——黙って別の範囲を潰すより、計測を止めるほうが安い。
 */
function swapFormingFn(src: string, side: Side, mode: 'disable' | 'ablA' | 'ablB'): string {
	const span = FN_SPANS[side];
	const startHits = src.split(span.start).length - 1;
	if (startHits !== 1) {
		throw new Error(
			`関数アンカー '${span.start}' が detect_doubles.ts に ${startHits} 回現れる（期待 1 回）。` +
				'形成中経路の実装が変わったので、アンカーを取り直すこと。',
		);
	}
	const endHits = src.split(span.end).length - 1;
	if (endHits !== 1) {
		throw new Error(`節アンカー '${span.end.trim()}' が detect_doubles.ts に ${endHits} 回現れる（期待 1 回）。`);
	}
	const from = src.indexOf(span.start);
	const to = src.indexOf(span.end);
	if (!(from < to)) throw new Error(`関数アンカーが節アンカーより後ろにある（side=${side}）。`);

	const { body, marker } = replacementFor(side, mode);
	const out = `${src.slice(0, from)}${body}${src.slice(to)}`;
	const markerHits = out.split(marker).length - 1;
	if (markerHits !== 1) throw new Error(`差し替えの目印 '${marker}' が ${markerHits} 回現れる（期待 1 回）。`);
	return out;
}

/**
 * `tools/patterns/` を**ディレクトリごと**一時領域へ展開する
 * （`measure_forming_triple_level_spread_178.ts` の同名関数と同じ流儀）。
 * `opts.fromRef` を渡すと**全ファイル**をその ref から取る（{@link BuildVariantOpts.fromRef}）。
 */
function materializePatternsDir(variant: string, opts: BuildVariantOpts = {}): string {
	// **ファイル一覧も `fromRef` 側から取る。** 作業ツリーの一覧で回すと、ref に無いファイルを
	// `git show` しようとしてそこで落ちる（`verifyStripScope` が追加 / 削除を弾くので通常は同じ）。
	const files = execFileSync('git', ['ls-tree', '-r', '--name-only', opts.fromRef ?? 'HEAD', '--', 'tools/patterns/'], {
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
		// `fromRef` を渡されたら **`tools/patterns/` を 1 ファイルも残さず ref から取る**（#268 案 C）。
		// 検出器 1 ファイルだけを ref から取る組み方は、作業ツリーが同ディレクトリの別ファイルを
		// 触った瞬間に等価性が崩れる（`verifyStripScope` の docstring）。
		let src = opts.fromRef
			? execFileSync('git', ['show', `${opts.fromRef}:${path}`], { cwd: ROOT, encoding: 'utf8' })
			: readFileSync(join(ROOT, path), 'utf8');

		if (name === 'detect_doubles.ts') {
			if (opts.top) src = swapFormingFn(src, 'top', opts.top);
			if (opts.bottom) src = swapFormingFn(src, 'bottom', opts.bottom);
		}

		const rewritten = src
			// ディレクトリ外への import は作業ツリーの絶対パスへ。
			.replace(/from '\.\.\/\.\.\//g, `from '${ROOT}/`)
			// `../patterns/` は**同ディレクトリの別名**。下の汎用 `../` 規則より先に畳む。
			.replace(/from '\.\.\/patterns\//g, "from './")
			.replace(/from '\.\.\//g, `from '${ROOT}/tools/`);
		// `from './` は書き換えない——展開先の中で解決させるのが本関数の目的。
		writeFileSync(join(dir, name), rewritten + internalExportsFor(name, src));
	}
	return dir;
}

/** 1 ビルドぶんの検出器と係数を、**同じ展開ディレクトリから**読む。 */
async function loadBuild(variant: string, opts: BuildVariantOpts = {}): Promise<Build> {
	const dir = materializePatternsDir(variant, opts);
	const doubles = (await import(pathToFileURL(join(dir, 'detect_doubles.ts')).href)) as unknown as Build;
	const triples = (await import(pathToFileURL(join(dir, 'detect_triples.ts')).href)) as unknown as {
		detectTriples: Detector;
	};
	const structural = (await import(
		pathToFileURL(join(dir, 'structural.ts')).href
	)) as unknown as typeof import('../tools/patterns/structural.js');
	return {
		detectDoubles: doubles.detectDoubles,
		detectTriples: triples.detectTriples,
		DOUBLE_LEVEL_MAX_PCT: structural.DOUBLE_LEVEL_MAX_PCT,
		MIN_FORMING_COMPLETION: doubles.MIN_FORMING_COMPLETION,
		MIN_PATTERN_DAYS: doubles.MIN_PATTERN_DAYS,
		FORMING_PEAK_TOLERANCE_PCT: doubles.FORMING_PEAK_TOLERANCE_PCT,
		FORMING_TOLERANCE_MULTIPLIER: doubles.FORMING_TOLERANCE_MULTIPLIER,
		FORMING_VALLEY_INVALID_PCT: doubles.FORMING_VALLEY_INVALID_PCT,
		FORMING_EXPIRY_BARS: doubles.FORMING_EXPIRY_BARS,
		getDoubleFormingBarParams: doubles.getDoubleFormingBarParams,
	};
}

// ── コーパス（#242 / #243 / #244 / #249 / #260 と同じ組み方） ──

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
 * **`includeForming: true` だけが形成中経路の発火を左右する**（`detect_doubles.ts` の 2b 節は
 * `if (includeForming && …)` でしか分岐しない）ので、ローリングでは 8 通りを回さず
 * **全部 true の 1 通り**に固定する。8 倍のケース数を払っても同じ候補が 8 回積まれるだけ。
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
 * 実データ 1 系列のローリング窓ケース。窓は**先頭固定・終端を 1 本ずつ動かす**。
 * 先頭固定にしてあるので**ピボットの idx が窓をまたいで安定する**——§5 の追跡が
 * 同じ構成点の idx で結べるのはこのため。
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

interface CorpusPart {
	label: string;
	/** 時間足別の結論に使える母集団か（実 1hour 系列 / 実データ A の 1day のみ true）。 */
	tfAuthoritative: boolean;
	cases: CaseSpec[];
}

/** 標準コーパス 800 と実データ B / C / D、およびそれぞれのローリング窓。**プールしない**（#219）。 */
function buildCorpus(includeRolling: boolean): CorpusPart[] {
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
	// **実データ D は必須**（PR #260 の CodeRabbit 指摘）。動的 import + `catch { return null }` に
	// すると、読み込みが壊れたときコーパスが 12,104 → 4,760 ケースに縮んだまま正常終了する。
	const realD: Series = {
		group: 'realD',
		name: 'btc_jpy_1hour_2026_09_05',
		candles: buildBtcJpy1hour20260905Candles() as Candle[],
	};

	const out: CorpusPart[] = [
		{
			label: `標準コーパス ${standard.length}（合成 704 + 実データ A 96）`,
			tfAuthoritative: false,
			cases: standard,
		},
		{ label: '実データ B 96（`btc_jpy_1hour_2026_08`）', tfAuthoritative: true, cases: realCases(realB) },
		{ label: '実データ C 96（`btc_jpy_1hour_2026_09`）', tfAuthoritative: true, cases: realCases(realC) },
		{ label: '実データ D 96（`btc_jpy_1hour_2026_09_05`）', tfAuthoritative: true, cases: realCases(realD) },
	];

	if (includeRolling) {
		for (const s of [realB, realC, realD]) {
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

// ── 走行 ──

interface RunOut {
	patterns: DeduplicablePattern[];
	cands: CandDebugEntry[];
}

/** `detectDoubles` だけを 1 ケースに走らせる（本 issue が触るのは double の 2 経路だけ）。 */
function runDoubles(build: Build, spec: CaseSpec): RunOut {
	const cands: CandDebugEntry[] = [];
	const ctx = buildCtx(spec, cands);
	const d = build.detectDoubles(ctx);
	return { patterns: d.patterns, cands };
}

/** §0 の検算用。展開ビルドと作業ツリーを triple 込みで突き合わせる。 */
function runFull(detectTriples: Detector, detectDoubles: Detector, spec: CaseSpec): RunOut {
	const cands: CandDebugEntry[] = [];
	const ctx = buildCtx(spec, cands);
	const t = detectTriples(ctx);
	const d = detectDoubles(ctx);
	return { patterns: [...t.patterns, ...d.patterns], cands };
}

const key = (v: unknown): string => JSON.stringify(v);

/**
 * base の候補列から対照ビルドの候補列を引いて、**その経路が積んだ候補だけ**を取り出す。
 *
 * 形成中経路は `detectDoubles` の最後で呼ばれ `debugCandidates` に積む以外の副作用が無いので、
 * 対照ビルドの候補列は base の候補列の**部分列**になる。部分列でなければその場で落とす——
 * 差分の帰属が保証されないまま数字を出すより、計測を止めるほうが安い。
 */
function attributeToPath(baseCands: readonly CandDebugEntry[], control: readonly CandDebugEntry[]): CandDebugEntry[] {
	const out: CandDebugEntry[] = [];
	let j = 0;
	for (const b of baseCands) {
		if (j < control.length && key(b) === key(control[j])) {
			j++;
			continue;
		}
		out.push(b);
	}
	if (j !== control.length) {
		throw new Error(
			`対照ビルドの候補列が base の部分列になっていない（${j} / ${control.length} まで一致）。` +
				'形成中経路が debugCandidates 以外に副作用を持つようになったので、差分による経路の同定は使えない。',
		);
	}
	return out;
}

// ── 経路の段階（ファネル） ──

/**
 * 形成中経路 1 つぶんの「段階」の並び。**検出器のコード順そのまま**に並べる。
 *
 * 直線的な経路（現行 top / ablation A）は 1 呼び出しにつき候補が 1 件しか出ないので、
 * この並びはそのまま**ファネル**になる（段階 k に到達した数 = 全体 − 段階 k より前で落ちた数）。
 * ループする経路（現行 bottom / ablation B）は候補 1 件 = ループ 1 周なので、
 * 同じ式が**候補単位**のファネルになる。どちらも「延べ」の分母が変わるだけで式は同じ。
 */
interface Stage {
	/** メモに出す名前（理由コード、または理由コードの束）。 */
	label: string;
	/** その段階で積まれる理由コードか。 */
	match: (reason: string) => boolean;
}

/**
 * `validateReversalStructure` が返す棄却理由（#126 の構造ゲート）。
 * `structural.ts` の `StructuralRejectReason` の全値。**増やしたらここも足す**——
 * 漏れると {@link funnelTable} が「未分類」行とファネル残差の食い違いを出して知らせる。
 */
const GATE_REASONS = new Set([
	'neckline_above_pre_decline_high',
	'neckline_below_pre_decline_low',
	'no_neckline_cross_before_trough1',
	'no_neckline_cross_before_peak1',
	'retracement_out_of_band',
]);

const eq =
	(...names: string[]) =>
	(r: string): boolean =>
		names.includes(r);

/** 現行 `tryFormingDoubleTop`（確定 1 山 + 谷、最新足が山2 の暫定値）。 */
const STAGES_BASE_TOP: Stage[] = [
	{ label: 'forming_no_confirmed_peak', match: eq('forming_no_confirmed_peak') },
	{ label: 'forming_no_valley_after_peak', match: eq('forming_no_valley_after_peak') },
	{ label: 'forming_peak_level_out_of_tolerance', match: eq('forming_peak_level_out_of_tolerance') },
	{ label: 'forming_peaks_not_level', match: eq('forming_peaks_not_level') },
	{ label: 'forming_current_at_or_below_valley', match: eq('forming_current_at_or_below_valley') },
	{ label: 'forming_completion_below_min', match: eq('forming_completion_below_min') },
	{ label: 'forming_bars_out_of_range', match: eq('forming_bars_out_of_range') },
	{ label: 'prior_trend_mismatch:*', match: (r) => r.startsWith('prior_trend_mismatch:') },
	{
		label: 'サイズ（forming_pattern_too_small / forming_valley_too_shallow）',
		match: eq('forming_pattern_too_small', 'forming_valley_too_shallow'),
	},
	{ label: '構造ゲート（#126）', match: (r) => GATE_REASONS.has(r) },
	{ label: 'forming_peaks_below_neckline', match: eq('forming_peaks_below_neckline') },
];

/** 現行 `tryFormingDoubleBottom`（確定 2 谷 + 山。最新足は主構成点ではない）。 */
const STAGES_BASE_BOTTOM: Stage[] = [
	{ label: 'forming_pattern_height_below_min', match: eq('forming_pattern_height_below_min') },
	{ label: 'forming_valleys_not_level', match: eq('forming_valleys_not_level') },
	{ label: 'forming_current_below_valley_zone', match: eq('forming_current_below_valley_zone') },
	{ label: 'forming_completion_below_min', match: eq('forming_completion_below_min') },
	{ label: 'forming_bars_out_of_range', match: eq('forming_bars_out_of_range') },
	{ label: 'prior_trend_mismatch:*', match: (r) => r.startsWith('prior_trend_mismatch:') },
	{
		label: 'サイズ（forming_pattern_too_small / forming_peak_too_shallow）',
		match: eq('forming_pattern_too_small', 'forming_peak_too_shallow'),
	},
	{ label: '構造ゲート（#126）', match: (r) => GATE_REASONS.has(r) },
	{ label: 'reclassified_as_triple_bottom', match: eq('reclassified_as_triple_bottom') },
	{ label: 'forming_valleys_above_neckline', match: eq('forming_valleys_above_neckline') },
];

/** ablation A（bottom を top の流儀へ）。現行 top の符号反転。 */
const STAGES_ABL_A: Stage[] = [
	{ label: 'forming_no_confirmed_valley', match: eq('forming_no_confirmed_valley') },
	{ label: 'forming_no_peak_after_valley', match: eq('forming_no_peak_after_valley') },
	{ label: 'forming_valley_level_out_of_tolerance', match: eq('forming_valley_level_out_of_tolerance') },
	{ label: 'forming_valleys_not_level', match: eq('forming_valleys_not_level') },
	{ label: 'forming_current_at_or_above_peak', match: eq('forming_current_at_or_above_peak') },
	{ label: 'forming_completion_below_min', match: eq('forming_completion_below_min') },
	{ label: 'forming_bars_out_of_range', match: eq('forming_bars_out_of_range') },
	{ label: 'prior_trend_mismatch:*', match: (r) => r.startsWith('prior_trend_mismatch:') },
	{
		label: 'サイズ（forming_pattern_too_small / forming_peak_too_shallow）',
		match: eq('forming_pattern_too_small', 'forming_peak_too_shallow'),
	},
	{ label: '構造ゲート（#126）', match: (r) => GATE_REASONS.has(r) },
	{ label: 'forming_valleys_above_neckline', match: eq('forming_valleys_above_neckline') },
];

/** ablation B（top を bottom の流儀へ）。現行 bottom の符号反転。 */
const STAGES_ABL_B: Stage[] = [
	{ label: 'forming_pattern_height_below_min', match: eq('forming_pattern_height_below_min') },
	{ label: 'forming_peaks_not_level', match: eq('forming_peaks_not_level') },
	{ label: 'forming_current_above_peak_zone', match: eq('forming_current_above_peak_zone') },
	{ label: 'forming_completion_below_min', match: eq('forming_completion_below_min') },
	{ label: 'forming_bars_out_of_range', match: eq('forming_bars_out_of_range') },
	{ label: 'prior_trend_mismatch:*', match: (r) => r.startsWith('prior_trend_mismatch:') },
	{
		label: 'サイズ（forming_pattern_too_small / forming_valley_too_shallow）',
		match: eq('forming_pattern_too_small', 'forming_valley_too_shallow'),
	},
	{ label: '構造ゲート（#126）', match: (r) => GATE_REASONS.has(r) },
	{ label: 'reclassified_as_triple_top', match: eq('reclassified_as_triple_top') },
	{ label: 'forming_peaks_below_neckline', match: eq('forming_peaks_below_neckline') },
];

// ── 集計 ──

/** 延べ / 構造 / 実体の 3 通りで数える 1 マス。 */
interface Cell {
	total: number;
	struct: Set<string>;
	ts: Set<string>;
}

const cell = (): Cell => ({ total: 0, struct: new Set(), ts: new Set() });

function bump(map: Map<string, Cell>, k: string, structKey: string | null, tsKey: string | null): void {
	let c = map.get(k);
	if (!c) {
		c = cell();
		map.set(k, c);
	}
	c.total++;
	if (structKey) c.struct.add(structKey);
	if (tsKey) c.ts.add(tsKey);
}

const cellOf = (map: Map<string, Cell>, k: string): Cell => map.get(k) ?? cell();

/**
 * 候補 1 件から「構造」「実体」のキーを作る。
 *
 * 構造 = `(系列, 時間足, type, 確定構成点の idx)`。**最新足の idx は外す**——ローリング窓では
 * 窓ごとに変わるので、同じ構造が窓の数だけ別物になる。
 * 実体 = `(時間足, type, 確定構成点の絶対時刻)`。実データ B / C / D は同じ 1 時間足履歴の
 * 重なる窓なので、系列をまたいで畳むにはこちらを使う。
 */
function keysOf(
	entry: CandDebugEntry,
	spec: CaseSpec,
): { struct: string | null; ts: string | null; mainIdxs: number[] } {
	const idxs = (entry.indices ?? []).filter((i) => i !== spec.windowEnd);
	if (idxs.length === 0) return { struct: null, ts: null, mainIdxs: [] };
	const isos = idxs.map((i) => spec.series.candles[i]?.isoTime ?? `#${i}`);
	return {
		struct: `${spec.series.name}|${spec.tf}|${entry.type}|${idxs.join('-')}`,
		ts: `${spec.tf}|${entry.type}|${isos.join('-')}`,
		mainIdxs: idxs,
	};
}

/** accepted な形成中候補 1 件の明細（§6 の目視判定の材料）。 */
interface AcceptedRec {
	corpus: string;
	series: string;
	tf: string;
	sd: string;
	windowEnd: number;
	rolling: boolean;
	type: string;
	status: string;
	confidence: number | null;
	completionPct: number | null;
	struct: string;
	ts: string;
	pts: Array<{ role: string; idx: number; price: number; iso: string }>;
	necklinePrice: number | null;
	currentPrice: number;
}

/** ローリング窓 1 つぶんの、その構造がどう見えていたか（§5 の追跡）。 */
interface Slice {
	end: number;
	forming: Set<string>;
	terminal: Set<string>;
	completed: Set<string>;
}

/** `patterns` から `(type, 先頭 2 ピボットの idx)` のキーを作る。 */
function patternKey(p: DeduplicablePattern): string | null {
	const pivots = (p as unknown as { pivots?: Array<{ idx: number }> }).pivots;
	if (!pivots || pivots.length < 2) return null;
	return `${p.type}|${pivots[0].idx}-${pivots[1].idx}`;
}

const laneOf = (spec: CaseSpec): string => `${spec.series.name}|${spec.tf}|${spec.swingDepth ?? 'auto'}`;

/**
 * Markdown の表のセルに入れる文字列を安全にする。
 *
 * **`|` はインラインコードの中でもセル区切りとして解釈される**（GFM）。実体キーは
 * `1day|double_top|2026-…` の形なので、そのまま書くと 10 列のヘッダに対して 12 セルの行になり、
 * 右端の 2 列が描画で落ちる（PR #267 の CodeRabbit 指摘。markdownlint MD056）。
 */
const mdCell = (v: string): string => v.replaceAll('|', '\\|');

const yen = (v: number): string => Math.round(v).toLocaleString('ja-JP');

/** 1 経路ぶんの集計。 */
interface PathAgg {
	label: string;
	stages: Stage[];
	/** `corpus|理由` → 延べ / 構造 / 実体 */
	byReason: Map<string, Cell>;
	/** `corpus` → その経路が積んだ候補の延べ（`prior_trend_insufficient_data` は除く） */
	totalByCorpus: Map<string, number>;
	/** `corpus|status` → accepted の延べ / 構造 / 実体 */
	accepted: Map<string, Cell>;
	/** 段階の並びに載らなかった理由コード（載っていれば 0 件になるはず） */
	unknown: Map<string, number>;
	/** `prior_trend_insufficient_data`（棄却ではなく注記として積まれる accepted） */
	insufficientData: number;
	acceptedRecs: AcceptedRec[];
	/**
	 * accepted な候補のうち、対応する `PatternEntry` を引けなかった件数（{@link findPatternFor}）。
	 * **0 件であるべき**——1 件でもあれば `confidence` / `completionPct` / `necklinePrice` が
	 * 欠けた行が §6 に出るので、§0 で申告する。
	 */
	unmatchedAccepted: number;
	/**
	 * `forming_bars_out_of_range` の内訳（下限割れ / 上限超え）。
	 * `formationBars = 最新足の idx − 左の主構成点の idx` を候補から復元して数える。
	 */
	barsBelowMin: number;
	barsAboveMax: number;
	formationBarsSamples: number[];
}

function newAgg(label: string, stages: Stage[]): PathAgg {
	return {
		label,
		stages,
		byReason: new Map(),
		totalByCorpus: new Map(),
		accepted: new Map(),
		unknown: new Map(),
		insufficientData: 0,
		acceptedRecs: [],
		unmatchedAccepted: 0,
		barsBelowMin: 0,
		barsAboveMax: 0,
		formationBarsSamples: [],
	};
}

/** その経路に帰属した候補列を 1 ケースぶん流し込む。 */
function feed(
	agg: PathAgg,
	entries: readonly CandDebugEntry[],
	spec: CaseSpec,
	corpus: string,
	patterns: readonly DeduplicablePattern[],
	barParams: { minBars: number; maxBars: number },
): void {
	for (const e of entries) {
		if (e.accepted && e.status === undefined) {
			// `prior_trend_insufficient_data`（棄却ではない注記）。候補の分母に入れない。
			agg.insufficientData++;
			continue;
		}
		const { struct, ts, mainIdxs } = keysOf(e, spec);
		agg.totalByCorpus.set(corpus, (agg.totalByCorpus.get(corpus) ?? 0) + 1);
		if (e.accepted) {
			const status = String(e.status ?? 'forming');
			bump(agg.accepted, `${corpus}|${status}`, struct, ts);
			const p = findPatternFor(patterns, e.type, status, mainIdxs);
			if (!p) agg.unmatchedAccepted++;
			const lastIdx = spec.windowEnd;
			agg.acceptedRecs.push({
				corpus,
				series: spec.series.name,
				tf: spec.tf,
				sd: String(spec.swingDepth ?? 'auto'),
				windowEnd: spec.windowEnd,
				rolling: spec.rolling,
				type: e.type,
				status,
				confidence: typeof p?.confidence === 'number' ? p.confidence : null,
				completionPct:
					typeof (p as unknown as { completionPct?: number } | undefined)?.completionPct === 'number'
						? (p as unknown as { completionPct: number }).completionPct
						: null,
				struct: struct ?? '',
				ts: ts ?? '',
				pts: (e.points ?? []).map((pt) => ({
					role: pt.role,
					idx: pt.idx,
					price: pt.price,
					iso: pt.isoTime ?? spec.series.candles[pt.idx]?.isoTime ?? '',
				})),
				necklinePrice: (() => {
					const nl = (p as unknown as { neckline?: Array<{ y: number }> } | undefined)?.neckline;
					return nl && nl.length > 0 ? nl[0].y : null;
				})(),
				currentPrice: Number(spec.series.candles[lastIdx]?.close ?? NaN),
			});
			continue;
		}
		const reason = String(e.reason ?? '');
		if (reason === 'forming_bars_out_of_range') {
			const first = (e.indices ?? [])[0];
			if (typeof first === 'number') {
				const formationBars = spec.windowEnd - first;
				agg.formationBarsSamples.push(formationBars);
				if (formationBars < barParams.minBars) agg.barsBelowMin++;
				else agg.barsAboveMax++;
			}
		}
		const stage = agg.stages.find((s) => s.match(reason));
		if (!stage) agg.unknown.set(reason, (agg.unknown.get(reason) ?? 0) + 1);
		bump(agg.byReason, `${corpus}|${stage ? stage.label : `未分類: ${reason}`}`, struct, ts);
	}
}

/**
 * 候補 1 件に対応する `PatternEntry` を **構成点と `status` で**引く。
 *
 * **`type` だけで引いてはいけない。** 同じケースで完成済み `double_top` と形成中 `double_top` が
 * 両方返ることがあり（`detectDoubles` の `push` は素の `arr.push` で dedup しない）、
 * 完成済みのほうが配列の前にあるので `find(x => x.type === e.type)` は別の構造を掴む。
 * その結果 `confidence` / `completionPct` / `necklinePrice` が**別の構造の値**になる
 * （PR #267 の CodeRabbit 指摘）。
 *
 * **構成点だけでも足りない。** 完成済みと形成中が**同じ 3 点**で同時に出るケースが実在し
 * （実データ C / D の `1hour` idx 174-177-184 など）、そこでは `pivots` の突き合わせも
 * 両方に当たる。完成済みには `completionPct` が無いので、掴み違えると §6 の `completion` 列が
 * `—` になる（実際になっていた）。**`status` まで見れば一意に決まる**——形成中経路は
 * `pushCand` の `status` と `PatternEntry.status` に同じ値を入れており、完成済みは
 * `completed` / `near_completion` なので衝突しない。
 *
 * 形成中経路の `pivots` は**候補の `indices` から最新足を除いた並びと厳密に一致する**
 * （top 2 点 / bottom 3 点 / ablation も同じ）。
 * **一致しなければ `undefined` を返す**——別の構造の値を黙って載せるより、`—` を出すほうが安全。
 * 取りこぼしが 0 件であることは §0 の「対応する `PatternEntry` を引けなかった accepted」で申告する。
 */
function findPatternFor(
	patterns: readonly DeduplicablePattern[],
	type: string,
	status: string,
	mainIdxs: readonly number[],
): DeduplicablePattern | undefined {
	if (mainIdxs.length === 0) return undefined;
	return patterns.find((x) => {
		if (x.type !== type) return false;
		if (String((x as unknown as { status?: string }).status ?? '') !== status) return false;
		const pv = (x as unknown as { pivots?: Array<{ idx: number }> }).pivots ?? [];
		return pv.length === mainIdxs.length && pv.every((q, i) => q.idx === mainIdxs[i]);
	});
}

/** ファネル表 1 つ（1 経路 × 1 母集団）。 */
function funnelTable(agg: PathAgg, corpus: string, say: (s?: string) => void): void {
	const total = agg.totalByCorpus.get(corpus) ?? 0;
	if (total === 0) {
		say('この母集団ではこの経路の候補が **1 件も積まれていない**。');
		say();
		return;
	}
	say('| # | 段階（コード順） | 到達（延べ） | 棄却 延べ | 棄却 構造 | 棄却 実体 |');
	say('|---:|---|---:|---:|---:|---:|');
	let reached = total;
	agg.stages.forEach((s, i) => {
		const c = cellOf(agg.byReason, `${corpus}|${s.label}`);
		say(`| ${i + 1} | \`${s.label}\` | ${reached} | ${c.total} | ${c.struct.size} | ${c.ts.size} |`);
		reached -= c.total;
	});
	const accStatuses = [...agg.accepted.keys()].filter((k) => k.startsWith(`${corpus}|`));
	const accTotal = accStatuses.reduce((n, k) => n + (agg.accepted.get(k)?.total ?? 0), 0);
	say(`| — | **accepted** | ${reached} | — | — | — |`);
	say();
	const unknownHere = [...agg.byReason.keys()].filter((k) => k.startsWith(`${corpus}|未分類: `));
	if (unknownHere.length > 0) {
		say(`⚠️ 段階の並びに無い理由コード: ${unknownHere.map((k) => `\`${k.split('|')[1]}\``).join(' / ')}`);
		say();
	}
	if (reached !== accTotal) {
		say(`⚠️ ファネルの残差 ${reached} と accepted の延べ ${accTotal} が食い違う（段階の並びが不完全）。`);
		say();
	}
	if (accTotal === 0) {
		say('accepted は **0 件**。');
	} else {
		say('| status | 延べ | 構造 | 実体 |');
		say('|---|---:|---:|---:|');
		for (const k of accStatuses.sort()) {
			const c = agg.accepted.get(k) as Cell;
			say(`| \`${k.split('|')[1]}\` | ${c.total} | ${c.struct.size} | ${c.ts.size} |`);
		}
	}
	say();
}

/** 全母集団を横断した accepted の合計（母集団はプールしないので、内訳と併記する）。 */
function acceptedSummary(agg: PathAgg, corpora: readonly CorpusPart[]): string {
	const statuses = new Map<string, { total: number; struct: Set<string>; ts: Set<string> }>();
	for (const part of corpora) {
		for (const [k, c] of agg.accepted) {
			if (!k.startsWith(`${part.label}|`)) continue;
			const st = k.split('|')[1];
			let s = statuses.get(st);
			if (!s) {
				s = { total: 0, struct: new Set(), ts: new Set() };
				statuses.set(st, s);
			}
			s.total += c.total;
			for (const v of c.struct) s.struct.add(v);
			for (const v of c.ts) s.ts.add(v);
		}
	}
	if (statuses.size === 0) return '**0 件**';
	return [...statuses.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([st, s]) => `\`${st}\` 延べ ${s.total} / 構造 ${s.struct.size} / 実体 ${s.ts.size}`)
		.join('、');
}

// ── main ──

// ── §8: 本 PR（issue #262 Phase 2）の実装 vs strip（`main`） ──

/** §8-7 の目視判定に要る、実体 1 つぶんの生データ（フィクスチャから直接読める量だけ）。 */
interface ShapeRec {
	series: Series;
	tf: string;
	sd: string;
	windowEnd: number;
	type: string;
	idxs: number[];
	necklinePrice: number;
}

/**
 * Phase 1 §8-2 の 3 値判定を**数値だけで**再現する。
 *
 * 使う量は「構成点の終値 / 極値」と「区間の最高値 / 最安値」の 2 種類だけで、
 * どちらも凍結フィクスチャから直接読める（検出器も閾値も通さない）。
 * 順に当てて最初に当たったものを採る、という Phase 1 の手順もそのまま。
 */
function judgeShape(rec: ShapeRec): { verdict: string; basis: string; gapBars: number; depthPct: number } {
	const [aIdx, bIdx, cIdx] = rec.idxs;
	const cd = rec.series.candles;
	const isTop = rec.type === 'double_top';
	const closeAt = (i: number): number => Number(cd[i]?.close ?? NaN);
	const gapBars = bIdx - aIdx;
	// 中間構成点の深さ（対 第1構成点の終値）。top は押し、bottom は戻り。
	const depthPct = Math.abs(closeAt(aIdx) - closeAt(bIdx)) / Math.max(1, Math.abs(closeAt(aIdx)));
	// 第2構成点より後（終端まで）の極値。
	let beyond = isTop ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
	let nlBroken = false;
	for (let i = cIdx + 1; i <= rec.windowEnd; i++) {
		const hi = Number(cd[i]?.high ?? NaN);
		const lo = Number(cd[i]?.low ?? NaN);
		if (isTop && Number.isFinite(hi)) beyond = Math.max(beyond, hi);
		if (!isTop && Number.isFinite(lo)) beyond = Math.min(beyond, lo);
		const cl = closeAt(i);
		if (Number.isFinite(cl) && (isTop ? cl < rec.necklinePrice : cl > rec.necklinePrice)) nlBroken = true;
	}
	const outerExtreme = isTop
		? Math.max(Number(cd[aIdx]?.high ?? NaN), Number(cd[cIdx]?.high ?? NaN))
		: Math.min(Number(cd[aIdx]?.low ?? NaN), Number(cd[cIdx]?.low ?? NaN));
	const exceeded = isTop ? beyond > outerExtreme : beyond < outerExtreme;

	if (gapBars <= 1) return { verdict: '呼べない', basis: '基準 1（中間構成点が隣接足）', gapBars, depthPct };
	if (exceeded) return { verdict: '呼べない', basis: '基準 2（第2構成点以降に外側を超えた）', gapBars, depthPct };
	if (depthPct < 0.005) return { verdict: '呼べない', basis: '基準 3（深さ < 0.5%）', gapBars, depthPct };
	if (depthPct >= 0.01 && nlBroken) return { verdict: '呼べる', basis: '基準 4', gapBars, depthPct };
	return { verdict: '保留', basis: '基準 5（該当なし）', gapBars, depthPct };
}

/** `patterns` 1 件の status（未設定は完成済み扱い。`ranking.ts` の `statusScore` と同じ規約）。 */
function statusOf(p: DeduplicablePattern): string {
	return String((p as unknown as { status?: string }).status ?? 'completed');
}

/** 未ブレイクの構造か（ブレイク足を持たない ＝ `near_completion` / `expired` / `invalid` / `forming`）。 */
function isUnbroken(p: DeduplicablePattern): boolean {
	return (p as unknown as { breakoutBarIndex?: number }).breakoutBarIndex === undefined;
}

/** `patterns` 1 件の構造キー / 実体キー（候補側の {@link keysOf} と同じ畳み方）。 */
function patternKeysOf(p: DeduplicablePattern, spec: CaseSpec): { struct: string; ts: string; idxs: number[] } {
	const idxs = ((p as unknown as { pivots?: Array<{ idx: number }> }).pivots ?? []).map((v) => v.idx);
	const isos = idxs.map((i) => spec.series.candles[i]?.isoTime ?? `#${i}`);
	return {
		struct: `${spec.series.name}|${spec.tf}|${p.type}|${idxs.join('-')}`,
		ts: `${spec.tf}|${p.type}|${isos.join('-')}`,
		idxs,
	};
}

interface Phase2Agg {
	/** `type|status` → 延べ / 構造 / 実体（PR ビルドの未ブレイク構造）。 */
	unbroken: Map<string, Cell>;
	/** strip の未ブレイク構造（現行 `tryFormingDoubleBottom` の accepted）。 */
	stripUnbroken: Map<string, Cell>;
	/**
	 * 実体キー → status の集合（1 対 1 の対応表を作るため）。
	 *
	 * **未ブレイク構造だけでなく `completed` も入れる。** strip で `forming` だった実体が
	 * PR で消えたのか `completed` になったのかは、未ブレイクだけ見ていると区別できない
	 * （旧 `tryFormingDoubleBottom` は完成済み経路と**同じ構造を二重に**出していたので、
	 * 「消えた」の多くが実は「完成済みとして 1 本だけ出るようになった」）。
	 */
	entityStrip: Map<string, Set<string>>;
	entityPr: Map<string, Set<string>>;
	/** 8-2 に出す実体（どちらかのビルドで未ブレイクとして現れたもの）。 */
	unbrokenEntities: Set<string>;
	/** PR で `near_completion` になった実体の代表 1 件（§8-6 の目視判定の材料）。 */
	nearCompletionRecs: Map<string, ShapeRec>;
	/** 実体キー → 代表ケース（メモの明細用）。 */
	entityWhere: Map<string, string>;
	/** 理由コード → 延べ（strip / PR）。 */
	reasonStrip: Map<string, number>;
	reasonPr: Map<string, number>;
	/**
	 * strip の **`tryFormingDoubleBottom` が積んだぶんだけ**の理由コード（延べ）。
	 * 差分の内訳を「削除した経路のぶん」と「未ブレイク構造が accepted に移ったぶん」に
	 * 分けるために要る——`neckline_above_pre_decline_high` のような**共有の理由コード**は
	 * 名前だけでは経路を切り分けられない（対照ビルドとの差集合で同定する）。
	 */
	reasonStripFormingBottom: Map<string, number>;
	/** `data.patterns` が食い違ったケース数（`includeForming` 別）。 */
	diffCases: Map<string, { total: number; diff: number }>;
	/** 食い違ったケースの明細（重複を畳んだもの）。 */
	diffSamples: Set<string>;
}

/** 空の {@link Phase2Agg}。1 回の走行で 1 つだけ作り、全ケースを流し込む。 */
function newPhase2Agg(): Phase2Agg {
	return {
		unbroken: new Map(),
		stripUnbroken: new Map(),
		entityStrip: new Map(),
		entityPr: new Map(),
		unbrokenEntities: new Set(),
		nearCompletionRecs: new Map(),
		entityWhere: new Map(),
		reasonStrip: new Map(),
		reasonPr: new Map(),
		reasonStripFormingBottom: new Map(),
		diffCases: new Map(),
		diffSamples: new Set(),
	};
}

/** `Map<キー, Set<値>>` に 1 件足す（同じ実体が窓ごとに別の status を取るので集合で持つ）。 */
function addTo(map: Map<string, Set<string>>, k: string, v: string): void {
	const cur = map.get(k);
	if (cur) cur.add(v);
	else map.set(k, new Set([v]));
}

/**
 * 棄却候補の理由コードを延べで数える。**accepted は数えない**——§8-3 は「棄却がどこへ移ったか」の表で、
 * accepted 側の増減は §8-1 の status 表が持つ。
 */
function countReasons(map: Map<string, number>, cands: readonly CandDebugEntry[]): void {
	for (const c of cands) {
		if (c.accepted) continue;
		const r = String(c.reason ?? '');
		map.set(r, (map.get(r) ?? 0) + 1);
	}
}

/** 1 ケースぶんの strip / PR の走行結果を §8 の集計に流す。 */
function feedPhase2(
	agg: Phase2Agg,
	spec: CaseSpec,
	corpus: string,
	strip: RunOut,
	prRun: RunOut,
	stripFormingBottom: readonly CandDebugEntry[],
): void {
	const bucket = spec.opts.includeForming ? 'includeForming: true' : 'includeForming: false（既定）';
	const cell = agg.diffCases.get(bucket) ?? { total: 0, diff: 0 };
	cell.total++;
	if (key(strip.patterns) !== key(prRun.patterns)) {
		cell.diff++;
		// **`includeForming: true` の 4 つの opts 組み合わせは double にとって同じケース**なので、
		// 同じ行を 4 回積まない（`includeInvalid` / `includeCompleted` は検出器の外の絞り込み）。
		const line =
			`${spec.series.name} / ${spec.tf} / sd=${spec.swingDepth ?? 'auto'} / end=${spec.windowEnd}` +
			` / ${bucket}: ${summarizePatterns(strip.patterns)} → ${summarizePatterns(prRun.patterns)}`;
		agg.diffSamples.add(line);
	}
	agg.diffCases.set(bucket, cell);

	countReasons(agg.reasonStrip, strip.cands);
	countReasons(agg.reasonPr, prRun.cands);
	countReasons(agg.reasonStripFormingBottom, stripFormingBottom);

	const where = `${spec.series.name} / ${spec.tf} / sd=${spec.swingDepth ?? 'auto'} / end=${spec.windowEnd}`;
	const feedSide = (
		patterns: readonly DeduplicablePattern[],
		unbrokenTally: Map<string, Cell>,
		entities: Map<string, Set<string>>,
	): void => {
		for (const p of patterns) {
			if (p.type !== 'double_top' && p.type !== 'double_bottom') continue;
			const k = patternKeysOf(p, spec);
			const status = statusOf(p);
			addTo(entities, k.ts, status);
			if (isUnbroken(p)) {
				bump(unbrokenTally, `${p.type}|${status}`, k.struct, k.ts);
				agg.unbrokenEntities.add(k.ts);
				if (!agg.entityWhere.has(k.ts)) agg.entityWhere.set(k.ts, where);
			}
			if (entities === agg.entityPr && status === 'near_completion' && !agg.nearCompletionRecs.has(k.ts)) {
				const nl = (p as unknown as { neckline?: Array<{ y: number }> }).neckline;
				agg.nearCompletionRecs.set(k.ts, {
					series: spec.series,
					tf: spec.tf,
					sd: String(spec.swingDepth ?? 'auto'),
					windowEnd: spec.windowEnd,
					type: p.type,
					idxs: k.idxs,
					necklinePrice: nl && nl.length > 0 ? nl[0].y : Number.NaN,
				});
			}
		}
	};
	feedSide(strip.patterns, agg.stripUnbroken, agg.entityStrip);
	feedSide(prRun.patterns, agg.unbroken, agg.entityPr);
	void corpus;
}

/** 差分サンプル 1 行ぶんの `patterns` の要約（`type:status` の並び）。 */
function summarizePatterns(patterns: readonly DeduplicablePattern[]): string {
	if (patterns.length === 0) return '（0 件）';
	return patterns.map((p) => `${p.type}:${statusOf(p)}`).join(', ');
}

/**
 * 全ビルドを組み、コーパスを 1 周して §0〜§8 を Markdown で標準出力へ書く。
 * `--json <path>` で accepted 候補の明細を、`--no-rolling` でローリング窓を外す。
 */
async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const jsonAt = argv.indexOf('--json');
	const jsonPath = jsonAt >= 0 ? argv[jsonAt + 1] : null;
	const includeRolling = !argv.includes('--no-rolling');
	const refAt = argv.indexOf('--strip-ref');
	// strip ビルドの参照先。既定は `main`（`--strip-ref <ref>` で上書き）。
	//
	// **`main` が #262 / #268 案 C を取り込んだ後は既定では走らない。** §1〜§7 は形成中 double の
	// 2 経路を両方差し替えるので、どちらかが削除済みの ref では ablation が組めない
	// （`requireFormingAnchors` が起動時に落として、渡すべき ref を案内する）。
	const stripRef = refAt >= 0 ? argv[refAt + 1] : 'main';
	// **数字を 1 つも出す前に**アンカーの有無を確かめる。
	requireFormingAnchors(stripRef);

	const out: string[] = [];
	const say = (s = ''): void => {
		out.push(s);
	};

	const corpus = buildCorpus(includeRolling);
	// §1〜§7 は Phase 1 の数字を再現する測定なので、**`main` の検出器（strip）**で組む。
	// §8 だけが作業ツリー（本 PR の実装）を使う。
	const stripScope = verifyStripScope(stripRef);
	const base = await loadBuild('base', { fromRef: stripRef });
	const noTop = await loadBuild('noTop', { top: 'disable', fromRef: stripRef });
	const noBottom = await loadBuild('noBottom', { bottom: 'disable', fromRef: stripRef });
	const ablA = await loadBuild('ablA', { bottom: 'ablA', fromRef: stripRef });
	const ablB = await loadBuild('ablB', { top: 'ablB', fromRef: stripRef });
	const pr = await loadBuild('pr');
	const phase2 = newPhase2Agg();

	const aggBaseTop = newAgg('現行 `tryFormingDoubleTop`', STAGES_BASE_TOP);
	const aggBaseBottom = newAgg('現行 `tryFormingDoubleBottom`', STAGES_BASE_BOTTOM);
	const aggA = newAgg('ablation A（bottom を top の流儀へ）', STAGES_ABL_A);
	const aggB = newAgg('ablation B（top を bottom の流儀へ）', STAGES_ABL_B);

	// §5 の追跡用（ローリング窓のみ）。
	const lanesBase = new Map<string, Slice[]>();
	const lanesA = new Map<string, Slice[]>();
	const lanesB = new Map<string, Slice[]>();

	// §7 の cap 用。
	const capRows: Array<{ corpus: string; base: number; ablB: number; pr: number }> = [];

	let mismatch = 0;
	let caseCount = 0;
	let formingCases = 0;

	for (const part of corpus) {
		for (const spec of part.cases) {
			caseCount++;
			// §0 検算: 展開した `pr` ビルドが作業ツリーと全キーで一致するか（triple 込み）。
			const fullBase = runFull(base.detectTriples, base.detectDoubles, spec);
			const fullPr = runFull(pr.detectTriples, pr.detectDoubles, spec);
			const fullWork = runFull(realDetectTriples, realDetectDoubles, spec);
			if (key(fullPr.patterns) !== key(fullWork.patterns) || key(fullPr.cands) !== key(fullWork.cands)) {
				mismatch++;
				if (mismatch <= 3) {
					say(
						`- ❌ 不一致: ${spec.series.name} / ${spec.tf} / sd=${spec.swingDepth ?? 'auto'} / end=${spec.windowEnd}`,
					);
				}
			}

			const bd = runDoubles(base, spec);
			const pd = runDoubles(pr, spec);
			const ct = runDoubles(noTop, spec);
			const cb = runDoubles(noBottom, spec);
			feedPhase2(phase2, spec, part.label, bd, pd, attributeToPath(bd.cands, cb.cands));
			const ra = runDoubles(ablA, spec);
			const rb = runDoubles(ablB, spec);

			// 形成中経路が積んだ候補を差分で同定する（名前ではなく対照ビルドで）。
			const barParams = base.getDoubleFormingBarParams(spec.tf);
			feed(aggBaseTop, attributeToPath(bd.cands, ct.cands), spec, part.label, bd.patterns, barParams);
			feed(aggBaseBottom, attributeToPath(bd.cands, cb.cands), spec, part.label, bd.patterns, barParams);
			feed(aggA, attributeToPath(ra.cands, cb.cands), spec, part.label, ra.patterns, barParams);
			feed(aggB, attributeToPath(rb.cands, ct.cands), spec, part.label, rb.patterns, barParams);

			if (spec.opts.includeForming) formingCases++;

			// §7: cap への圧力（triple + double のみ。他の検出器を足すと更に増える）。
			if (!spec.rolling) {
				const triplesCands = fullBase.cands.slice(0, fullBase.cands.length - bd.cands.length);
				capRows.push({
					corpus: part.label,
					base: applyDebugCapCount([...triplesCands, ...bd.cands]),
					ablB: applyDebugCapCount([...triplesCands, ...rb.cands]),
					pr: applyDebugCapCount([...triplesCands, ...pd.cands]),
				});
			}

			// §5: ローリング窓の追跡用スライス。
			if (spec.rolling) {
				const lane = laneOf(spec);
				pushSlice(lanesBase, lane, spec, bd.patterns);
				pushSlice(lanesA, lane, spec, ra.patterns);
				pushSlice(lanesB, lane, spec, rb.patterns);
			}
		}
	}

	if (mismatch > 0) {
		throw new Error(`展開ビルド（pr）が作業ツリーと ${mismatch} / ${caseCount} ケースで食い違った。計測は無効。`);
	}

	// ── §0 ──
	const header: string[] = [];
	header.push('# 形成中 double の「形成中」の定義の非対称の計測（issue #262）');
	header.push('');
	header.push(
		'**作業ツリーは 1 バイトも変更しない。** 本スクリプトは `tools/patterns/` を一時領域へ展開し、' +
			`形成中 2 経路を差し替えたビルドと、\`tools/patterns/\` を丸ごと \`${stripRef}\` から取った ` +
			'strip ビルドを別に作って走らせるだけ。**§1〜§7（Phase 1）は strip、§8（Phase 2）は作業ツリー。**',
	);
	header.push('');
	header.push('## 0. 検算');
	header.push('');
	header.push(
		'**(a) 展開ビルド ≡ 作業ツリー**: `tools/patterns/` を一時領域へディレクトリごと展開し、' +
			'`detect_doubles.ts` の末尾に `export { … }` を 1 行足しただけのビルド（**`pr`**）が、' +
			'作業ツリーの本物と `patterns` / `debugCandidates` の JSON 全キーで一致することを' +
			'**全ケースで**確かめる。',
	);
	header.push('');
	header.push(
		`**(b) strip ≡ \`${stripRef}\`**: strip 系のビルド（\`base\` / \`noTop\` / \`noBottom\` / ` +
			`\`ablA\` / \`ablB\`）は **\`tools/patterns/\` を 1 ファイルも残さず \`${stripRef}\` から取る**` +
			'（#268 案 C で `detect_doubles.ts` 1 ファイルから広げた。検出器 1 ファイルだけを差し替える' +
			'組み方は、作業ツリーが同ディレクトリの別ファイルを触った瞬間に等価性が崩れるため）。' +
			'差し替えのアンカー（形成中 2 経路の関数シグネチャ）が ref 側に在ることは起動時に確認する' +
			'——無ければ数字を 1 つも出さずに落ちる。',
	);
	header.push('');
	header.push(`- ✅ ${caseCount} ケース全件で \`pr\` ≡ 作業ツリー（\`patterns\` / \`debugCandidates\` とも）`);
	header.push(`- うち \`includeForming: true\` は ${formingCases} ケース（形成中経路が呼ばれるのはここだけ）`);
	header.push(
		`- \`${stripRef}\` と作業ツリーで中身が違うファイル: ` +
			`${stripScope.length === 0 ? 'なし' : stripScope.map((f) => `\`${f}\``).join(' / ')}` +
			'（strip はこのディレクトリを丸ごと ref から取るので、この一覧は差分の申告。' +
			'ゲートとして残しているのはファイルの追加 / 削除だけ）',
	);
	header.push(`- 展開先: \`${TMP_DIR}\`（作業ツリーは 1 バイトも変更していない）`);
	header.push(
		`- 形成中の係数（**strip ビルドから読んだ値**。§1〜§7 はこれで測っている）: ` +
			`\`DOUBLE_LEVEL_MAX_PCT\` = ${base.DOUBLE_LEVEL_MAX_PCT} / ` +
			`\`FORMING_PEAK_TOLERANCE_PCT\` = ${base.FORMING_PEAK_TOLERANCE_PCT} / ` +
			`\`FORMING_TOLERANCE_MULTIPLIER\` = ${base.FORMING_TOLERANCE_MULTIPLIER ?? '（そのビルドに無い）'} / ` +
			`\`FORMING_VALLEY_INVALID_PCT\` = ${base.FORMING_VALLEY_INVALID_PCT ?? '（そのビルドに無い）'} / ` +
			`\`FORMING_EXPIRY_BARS\` = ${base.FORMING_EXPIRY_BARS} / ` +
			`\`MIN_FORMING_COMPLETION\` = ${base.MIN_FORMING_COMPLETION}`,
	);
	header.push(
		'- 4 つの差し替えビルド（`noTop` / `noBottom` / `ablA` / `ablB`）は、対照ビルドの候補列が ' +
			'`base` の**部分列**であることを毎ケース検算している（崩れたらその場で例外）。',
	);
	{
		const unmatched = [aggBaseTop, aggBaseBottom, aggA, aggB]
			.map((a) => `${a.label} ${a.unmatchedAccepted}`)
			.join(' / ');
		header.push(`- accepted な候補のうち対応する \`PatternEntry\` を引けなかった件数（0 であるべき）: ${unmatched}`);
	}
	header.push('');
	header.push('### 形成中 double が要求する形成バー数（`getDoubleFormingBarParams`）');
	header.push('');
	header.push(
		'`formationBars = 最新足の idx − 左の主構成点の idx` がこのレンジに入らないと ' +
			'`forming_bars_out_of_range` で落ちる。**日数（`MIN_PATTERN_DAYS` = ' +
			`${base.MIN_PATTERN_DAYS} 日 / \`MAX_FORMING_DAYS\` = 90 日）は由来の注記で、実効値はバー数**` +
			'（`patterns/bar-thresholds.ts` の clamp を通した値）。',
	);
	header.push('');
	header.push('| 時間足 | minBars | maxBars |');
	header.push('|---|---:|---:|');
	for (const tf of ['1day', '4hour', '1hour']) {
		const p = base.getDoubleFormingBarParams(tf);
		header.push(`| ${tf} | ${p.minBars} | ${p.maxBars} |`);
	}
	header.push('');
	header.push('### コーパス');
	header.push('');
	header.push('| 母集団 | ケース数 | 時間足別の結論に使えるか |');
	header.push('|---|---:|---|');
	for (const part of corpus) {
		header.push(`| ${part.label} | ${part.cases.length} | ${part.tfAuthoritative ? '✅' : '参考値'} |`);
	}
	header.push('');
	header.push(
		'**実データ B / C / D は独立系列ではない。** 同じ btc_jpy 1 時間足履歴の**重なる窓**で、' +
			'C は B の idx 181 から（B∩C = 184 本）、D は C の idx 19 から（C∩D = 346 本）始まる。' +
			'**構造の実体数を言うときは絶対時刻で畳む**（本メモの「実体」列）。',
	);
	header.push('');
	out.unshift(...header);

	// ── §1 / §2 / §3 / §4 ──
	const sections: Array<{ n: string; title: string; agg: PathAgg; lead: string[] }> = [
		{
			n: '1',
			title: '現行 `tryFormingDoubleTop` の棄却理由（0 件の律速）',
			agg: aggBaseTop,
			lead: [
				'確定ピボットは**山1 + 谷の 2 点**で、最新足が山2 の暫定値（`forming_peak`）。ループが無いので',
				'1 ケースにつき候補は 1 件しか積まれない——**この表はそのままファネルになる**。',
			],
		},
		{
			n: '2',
			title: '現行 `tryFormingDoubleBottom` のベースライン',
			agg: aggBaseBottom,
			lead: [
				'確定ピボットは**谷1 + 山 + 谷2 の 3 点**（構造は完成済みと同じ）。最新足は有効性判定と',
				'完成度にしか使わない。谷ペアを回すループなので、候補 1 件 = ループ 1 周。',
				'**構成点 3 点が揃う前の `continue`（`minDist` 不足 / 間に山が無い）は候補に積まれない**ので、',
				'ファネルの分母は「3 点が揃ったペア」であって「全ペア」ではない（#158 の cap 対策）。',
			],
		},
		{
			n: '3',
			title: 'ablation A: bottom を top の流儀（最終構成点が形成中）へ組み替える',
			agg: aggA,
			lead: [
				'確定 谷1 + 山 + **最新足を谷2 の暫定値**にした複製。`tryFormingDoubleTop` の符号反転で、',
				'両脚の高さチェック・`checkPostPivotInvalidation`・`expired` / `invalid` は**無くなる**',
				'（top の流儀にそれらが無いため）。`pivots` は 2 点になる。',
			],
		},
		{
			n: '4',
			title: 'ablation B: top を bottom の流儀（構造完成・ブレイク待ち）へ組み替える — **主指標**',
			agg: aggB,
			lead: [
				'確定 山1 + 谷 + 山2 の 3 点にし、最新足はブレイク待ちの有効性判定にだけ使う複製。',
				'`tryFormingDoubleBottom` の符号反転で、両脚の高さチェック・`checkPostPivotInvalidation`・',
				'`expired` / `invalid` が付き、`pivots` は 3 点になる。**現行 0 件がいくつになるかが主指標。**',
			],
		},
	];

	for (const s of sections) {
		say(`## ${s.n}. ${s.title}`);
		say();
		for (const line of s.lead) say(line);
		say();
		say(`**全母集団の accepted 合計**: ${acceptedSummary(s.agg, corpus)}`);
		say();
		if (s.agg.formationBarsSamples.length > 0) {
			const fb = [...s.agg.formationBarsSamples].sort((a, b) => a - b);
			say(
				`\`forming_bars_out_of_range\` の内訳（全母集団）: **下限割れ ${s.agg.barsBelowMin} 件 / ` +
					`上限超え ${s.agg.barsAboveMax} 件**。\`formationBars\` は min ${fb[0]} / ` +
					`p50 ${fb[Math.floor(fb.length / 2)]} / max ${fb[fb.length - 1]}。`,
			);
			say();
		}
		if (s.agg.insufficientData > 0) {
			say(
				`（\`prior_trend_insufficient_data\` は棄却ではなく注記として ${s.agg.insufficientData} 件積まれている。` +
					'候補の分母には入れていない。）',
			);
			say();
		}
		for (const part of corpus) {
			say(`### ${s.n}-${corpus.indexOf(part) + 1}. ${part.label}${part.tfAuthoritative ? '' : '（時間足別は参考値）'}`);
			say();
			funnelTable(s.agg, part.label, say);
		}
	}

	// ── §5 追跡 ──
	say('## 5. ローリング窓での追跡（accepted になった構造のその後）');
	say();
	if (!includeRolling) {
		say('`--no-rolling` で実行したので追跡はしていない。');
		say();
	} else {
		say(
			'先頭固定・終端を 1 本ずつ動かす窓なので、ピボットの idx が窓をまたいで安定する。' +
				'ある構造が**初めて形成中として現れた窓より後**の窓で、`completed` になったか / ' +
				'終端 status（`expired` / `invalid`）になったか / どちらにもならなかったかを 3 分類する' +
				'（#260 §8 と同じ）。同じ構造は複数の `swingDepth` レーンに出るので、レーンを OR で畳む。',
		);
		say();
		say('| 経路 | 追跡できた構造 | その後 completed | その後 終端 status | どちらにもならず |');
		say('|---|---:|---:|---:|---:|');
		for (const [label, lanes] of [
			['現行 top', lanesBase] as const,
			['現行 bottom', lanesBase] as const,
			['ablation A（bottom）', lanesA] as const,
			['ablation B（top）', lanesB] as const,
		]) {
			const want = label.includes('top') ? 'double_top' : 'double_bottom';
			const f = followUp(lanes, want);
			say(`| ${label} | ${f.tracked} | ${f.completed} | ${f.terminal} | ${f.neither} |`);
		}
		say();
	}

	// ── §6 明細 ──
	say('## 6. ablation B で新たに accepted になる `double_top` の明細（目視判定の材料）');
	say();
	const bTops = aggB.acceptedRecs.filter((r) => r.type === 'double_top');
	const byTs = new Map<string, AcceptedRec[]>();
	for (const r of bTops) {
		const arr = byTs.get(r.ts);
		if (arr) arr.push(r);
		else byTs.set(r.ts, [r]);
	}
	say(`実体 **${byTs.size} 件**（延べ ${bTops.length} 件 / 構造 ${new Set(bTops.map((r) => r.struct)).size} 件）。`);
	say();
	if (byTs.size > 0) {
		const MAX_ROWS = 60;
		say(
			'| # | 実体（時間足 / 構成点の絶対時刻） | status | 系列 / sd / 終端 | 山1 終値 | 谷 終値 | 山2 終値 | 現値 | 山 relDiff | completion |',
		);
		say('|---:|---|---|---|---:|---:|---:|---:|---:|---:|');
		let i = 0;
		for (const [ts, rs] of byTs) {
			i++;
			if (i > MAX_ROWS) break;
			const r = rs[0];
			const p1 = r.pts.find((p) => p.role === 'peak1');
			const v = r.pts.find((p) => p.role === 'valley');
			const p2 = r.pts.find((p) => p.role === 'peak2');
			const relDiff = p1 && p2 ? Math.abs(p1.price - p2.price) / Math.max(1, Math.max(p1.price, p2.price)) : Number.NaN;
			say(
				`| ${i} | \`${mdCell(ts)}\` | \`${[...new Set(rs.map((x) => x.status))].sort().join(' / ')}\` | ` +
					`${[...new Set(rs.map((x) => x.series))].join(' ')} / sd=${[...new Set(rs.map((x) => x.sd))].sort().join(',')} / end=${r.windowEnd} | ` +
					`${p1 ? yen(p1.price) : '—'} | ${v ? yen(v.price) : '—'} | ${p2 ? yen(p2.price) : '—'} | ` +
					`${yen(r.currentPrice)} | ${Number.isFinite(relDiff) ? `${(relDiff * 100).toFixed(3)}%` : '—'} | ` +
					`${r.completionPct ?? '—'} |`,
			);
		}
		say();
		if (byTs.size > MAX_ROWS) say(`（先頭 ${MAX_ROWS} 件のみ。残り ${byTs.size - MAX_ROWS} 件は \`--json\` 側に出る）`);
		say();
		say('構成点の idx（フィクスチャを直接引くための検算用）:');
		say();
		say('| # | 系列 | tf | sd | 終端 idx | 山1 idx | 谷 idx | 山2 idx |');
		say('|---:|---|---|---|---:|---:|---:|---:|');
		let j = 0;
		for (const [, rs] of byTs) {
			j++;
			if (j > MAX_ROWS) break;
			const r = rs[0];
			const p1 = r.pts.find((p) => p.role === 'peak1');
			const v = r.pts.find((p) => p.role === 'valley');
			const p2 = r.pts.find((p) => p.role === 'peak2');
			say(
				`| ${j} | ${r.series} | ${r.tf} | ${r.sd} | ${r.windowEnd} | ${p1?.idx ?? '—'} | ${v?.idx ?? '—'} | ${p2?.idx ?? '—'} |`,
			);
		}
		say();
	}

	// ── §7 cap ──
	say('## 7. `view=debug` の cap=200 への影響');
	say();
	say(
		'`detect_patterns.ts` の並べ替え（accepted → 型間排他の棄却 → 検出器の棄却）を再現し、' +
			'**triple + double だけ**で候補総数を数えた（他の検出器を足すと更に増えるので、これは下限）。' +
			'ablation B は 1 ケースあたりの候補が山ペアの数だけ積まれるので、cap への圧力が上がる。' +
			'ローリング窓は同じ系列の窓違いなので、この節では固定窓のケースだけを使う。',
	);
	say();
	say('| 母集団 | ケース | 候補総数 p50 現行 → B | 候補総数 max 現行 → B | cap 超過ケース 現行 → B |');
	say('|---|---:|---|---|---|');
	for (const part of corpus) {
		const rs = capRows.filter((r) => r.corpus === part.label);
		if (rs.length === 0) continue;
		const bs = rs.map((r) => r.base).sort((a, b) => a - b);
		const as = rs.map((r) => r.ablB).sort((a, b) => a - b);
		const q = (v: number[], p: number): number => v[Math.min(v.length - 1, Math.floor(p * v.length))] ?? 0;
		say(
			`| ${part.label} | ${rs.length} | ${q(bs, 0.5)} → ${q(as, 0.5)} | ${bs[bs.length - 1]} → ${as[as.length - 1]} | ` +
				`${rs.filter((r) => r.base > DEBUG_CAP).length} → ${rs.filter((r) => r.ablB > DEBUG_CAP).length} |`,
		);
	}
	say();

	// ── §8 本 PR（#262 Phase 2）の実装 vs strip（`main`） ──
	say('## 8. 本 PR の実装 vs strip（`main`）');
	say();
	say(
		`strip は \`tools/patterns/\` を丸ごと \`${stripRef}\` から取る。` +
			'この組み方が `main` と等価であることは、**本 PR が `tools/patterns/` で触ったファイルが ' +
			'`detect_doubles.ts` だけ**であることの検算で担保している' +
			`（実測: ${stripScope.length === 0 ? '差分なし' : stripScope.map((f) => `\`${f}\``).join(' / ')}）。` +
			'§1〜§7 は strip で走らせているので Phase 1 の数字がそのまま再現される。',
	);
	say();

	say('### 8-1. 未ブレイク構造の status（延べ / 構造 / 実体）');
	say();
	say('`breakoutBarIndex` を持たない `patterns` エントリだけを数える（＝ブレイク足が無い構造）。');
	say();
	say('| type / status | strip 延べ | strip 構造 | strip 実体 | PR 延べ | PR 構造 | PR 実体 |');
	say('|---|---:|---:|---:|---:|---:|---:|');
	{
		const keys = [...new Set([...phase2.stripUnbroken.keys(), ...phase2.unbroken.keys()])].sort();
		for (const k of keys) {
			const a = cellOf(phase2.stripUnbroken, k);
			const b = cellOf(phase2.unbroken, k);
			say(
				`| \`${mdCell(k)}\` | ${a.total} | ${a.struct.size} | ${a.ts.size} | ` +
					`${b.total} | ${b.struct.size} | ${b.ts.size} |`,
			);
		}
	}
	say();

	say('### 8-2. 実体単位の対応表（strip の status → PR の status）');
	say();
	say(
		'実体キーは `(時間足, type, 構成点の絶対時刻)`。同じ実体が窓によって別の status で現れるので、' +
			'セルは**その実体に付いた status の集合**。`—` はその側に 1 件も出ないこと。' +
			'**行はどちらかのビルドで未ブレイクとして現れた実体**に絞り、セルには `completed` も含める' +
			'——旧 `tryFormingDoubleBottom` は完成済み経路と同じ構造を二重に出していたので、' +
			'「消えた」と「完成済みとして 1 本になった」を分けないと読めない。',
	);
	say();
	say('| # | 実体 | strip | PR | 代表ケース |');
	say('|---:|---|---|---|---|');
	{
		const keys = [...phase2.unbrokenEntities].sort();
		let n = 0;
		for (const k of keys) {
			n++;
			const a = phase2.entityStrip.get(k);
			const b = phase2.entityPr.get(k);
			const fmt = (v: Set<string> | undefined): string => (v ? [...v].sort().join(' / ') : '—');
			say(`| ${n} | \`${mdCell(k)}\` | ${fmt(a)} | ${fmt(b)} | ${mdCell(phase2.entityWhere.get(k) ?? '')} |`);
		}
		if (n === 0) say('| — | （未ブレイク構造が 1 件も無い） | — | — | — |');
	}
	say();

	say('### 8-3. 理由コードの差分（延べ。全母集団）');
	say();
	say('**`no_breakout` が減ったぶんが未ブレイク構造の accepted に移っていること**を確かめる。');
	say();
	say(
		'`削除経路` 列は strip の **`tryFormingDoubleBottom` が積んだぶん**（対照ビルド `noBottom` との' +
			'差集合で同定。名前では切り分けられない共有コードがあるため）。減少がこの列で説明できるなら、' +
			'**その減少は「経路を削除したぶん」であって判定が緩んだのではない。**',
	);
	say();
	say('| 理由コード | strip | うち削除経路 | PR | 差 | 残差（差 + 削除経路） |');
	say('|---|---:|---:|---:|---:|---:|');
	{
		const keys = [...new Set([...phase2.reasonStrip.keys(), ...phase2.reasonPr.keys()])].sort();
		for (const k of keys) {
			const a = phase2.reasonStrip.get(k) ?? 0;
			const b = phase2.reasonPr.get(k) ?? 0;
			if (a === b) continue;
			const del = phase2.reasonStripFormingBottom.get(k) ?? 0;
			const d = b - a;
			say(
				`| \`${mdCell(k || '(なし)')}\` | ${a} | ${del} | ${b} | ${d > 0 ? '+' : ''}${d} | ` +
					`${d + del > 0 ? '+' : ''}${d + del} |`,
			);
		}
	}
	say();

	say('### 8-4. `data.patterns` が食い違ったケース数');
	say();
	say('| `includeForming` | ケース | 食い違い |');
	say('|---|---:|---:|');
	for (const [k, v] of [...phase2.diffCases.entries()].sort()) {
		say(`| ${k} | ${v.total} | ${v.diff} |`);
	}
	say();
	if (phase2.diffSamples.size > 0) {
		const samples = [...phase2.diffSamples];
		say(`食い違ったケース（重複を畳んで ${samples.length} 行。先頭 60 行）:`);
		say();
		for (const line of samples.slice(0, 60)) say(`- ${line}`);
		say();
	}

	say('### 8-5. Phase 1 の ablation B（13 実体）との突き合わせ');
	say();
	say(
		'ablation B は **bottom のゲート集合**で top を組んだもので、本 PR は**完成済みのゲート集合**で' +
			'組んでいる。集合が違うので accepted な実体も変わりうる——`double_top` の未ブレイク構造について、' +
			'ablation B が accepted にした実体と本 PR の実体を突き合わせる（`—` はその側に無いこと）。',
	);
	say();
	say('| # | 実体 | ablation B | PR | 代表ケース |');
	say('|---:|---|---|---|---|');
	{
		const ablBEntities = new Map<string, Set<string>>();
		for (const r of aggB.acceptedRecs) {
			if (r.type !== 'double_top' || !r.ts) continue;
			addTo(ablBEntities, r.ts, r.status);
		}
		const prTopEntities = new Map<string, Set<string>>();
		for (const [k, v] of phase2.entityPr) {
			if (!k.includes('|double_top|') || !phase2.unbrokenEntities.has(k)) continue;
			prTopEntities.set(k, v);
		}
		const keys = [...new Set([...ablBEntities.keys(), ...prTopEntities.keys()])].sort();
		const fmt = (v: Set<string> | undefined): string => (v ? [...v].sort().join(' / ') : '—');
		let n = 0;
		for (const k of keys) {
			n++;
			say(
				`| ${n} | \`${mdCell(k)}\` | ${fmt(ablBEntities.get(k))} | ${fmt(prTopEntities.get(k))} | ` +
					`${mdCell(phase2.entityWhere.get(k) ?? '')} |`,
			);
		}
		if (n === 0) say('| — | （どちらにも `double_top` の未ブレイク構造が無い） | — | — | — |');
	}
	say();

	say('### 8-6. `near_completion` の実体の 3 値判定（Phase 1 §8-2 の基準をそのまま数値で当てる）');
	say();
	say(
		'**既定（`includeInvalid: false`）で利用者に見えるのは `near_completion` だけ**なので、' +
			'この集合だけを判定する。基準は Phase 1 §8-2 の 5 段を順に当て、最初に当たったものを採る' +
			'（1: 中間構成点が第1構成点の隣接足 / 2: 第2構成点以降に外側の極値を超えた / 3: 深さ < 0.5% / ' +
			'4: 深さ ≥ 1.0% かつ第2構成点以降にネックラインを抜けた / 5: それ以外は保留）。' +
			'使う量は構成点の終値・極値と区間の最高安値だけで、**検出器も閾値も通していない。**',
	);
	say();
	say('| # | 実体 | 間隔 | 深さ | 判定 | 根拠 | 代表ケース |');
	say('|---:|---|---:|---:|---|---|---|');
	{
		const keys = [...phase2.nearCompletionRecs.keys()].sort();
		const tally = new Map<string, number>();
		let n = 0;
		for (const k of keys) {
			const rec = phase2.nearCompletionRecs.get(k);
			if (!rec || rec.idxs.length < 3) continue;
			n++;
			const j = judgeShape(rec);
			tally.set(j.verdict, (tally.get(j.verdict) ?? 0) + 1);
			say(
				`| ${n} | \`${mdCell(k)}\` | ${j.gapBars} 本 | ${(j.depthPct * 100).toFixed(3)}% | ` +
					`**${j.verdict}** | ${j.basis} | ${mdCell(phase2.entityWhere.get(k) ?? '')} |`,
			);
		}
		say();
		say(
			`集計: ${[...tally.entries()]
				.sort()
				.map(([v, c]) => `**${v} ${c}**`)
				.join(' / ')}（計 ${n} 実体）`,
		);
	}
	say();

	say('### 8-7. `view=debug` の cap への影響（PR）');
	say();
	say('| 母集団 | ケース | 候補総数 p50 strip → PR | max strip → PR | cap 超過ケース strip → PR |');
	say('|---|---:|---|---|---|');
	for (const part of corpus) {
		const rs = capRows.filter((r) => r.corpus === part.label);
		if (rs.length === 0) continue;
		const bs = rs.map((r) => r.base).sort((a, b) => a - b);
		const ps = rs.map((r) => r.pr).sort((a, b) => a - b);
		const q = (v: number[], pq: number): number => v[Math.min(v.length - 1, Math.floor(pq * v.length))] ?? 0;
		say(
			`| ${part.label} | ${rs.length} | ${q(bs, 0.5)} → ${q(ps, 0.5)} | ${bs[bs.length - 1]} → ${ps[ps.length - 1]} | ` +
				`${rs.filter((r) => r.base > DEBUG_CAP).length} → ${rs.filter((r) => r.pr > DEBUG_CAP).length} |`,
		);
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
					formingCases,
					acceptedB: aggB.acceptedRecs,
					acceptedA: aggA.acceptedRecs,
					acceptedBaseTop: aggBaseTop.acceptedRecs,
					acceptedBaseBottom: aggBaseBottom.acceptedRecs.slice(0, 500),
				},
				null,
				2,
			)}\n`,
		);
	}
}

/** `detect_patterns.ts` の cap 並べ替えを再現したときの候補総数（cap 前）。 */
const DEBUG_CAP = 200;

function applyDebugCapCount(cands: readonly CandDebugEntry[]): number {
	const relevant = filterCandidatesByWant([...cands], new Set());
	const acc = relevant.filter((c) => !!c?.accepted);
	const pipelineRej = relevant.filter((c) => !c?.accepted && c?.reason === TRIPLE_HS_EXCLUSION_REASON);
	const rej = relevant.filter((c) => !c?.accepted && c?.reason !== TRIPLE_HS_EXCLUSION_REASON);
	return acc.length + pipelineRej.length + rej.length;
}

/** ローリング窓 1 つぶんの `patterns` を、その窓のスライスとして畳む。 */
function pushSlice(
	lanes: Map<string, Slice[]>,
	lane: string,
	spec: CaseSpec,
	patterns: readonly DeduplicablePattern[],
): void {
	const slice: Slice = { end: spec.windowEnd, forming: new Set(), terminal: new Set(), completed: new Set() };
	for (const p of patterns) {
		if (p.type !== 'double_top' && p.type !== 'double_bottom') continue;
		const k = patternKey(p);
		if (!k) continue;
		const status = String((p as unknown as { status?: string }).status ?? '');
		if (status === 'forming') slice.forming.add(k);
		else if (status === 'expired' || status === 'invalid') slice.terminal.add(k);
		else slice.completed.add(k);
	}
	const arr = lanes.get(lane);
	if (arr) arr.push(slice);
	else lanes.set(lane, [slice]);
}

/** §5 の 3 分類。 */
function followUp(
	lanes: Map<string, Slice[]>,
	type: string,
): { tracked: number; completed: number; terminal: number; neither: number } {
	const seen = new Map<string, { completed: boolean; terminal: boolean }>();
	for (const arr of lanes.values()) {
		const sorted = [...arr].sort((a, b) => a.end - b.end);
		const firstOf = new Map<string, number>();
		for (const s of sorted) {
			for (const k of s.forming) {
				if (!k.startsWith(`${type}|`)) continue;
				if (!firstOf.has(k)) firstOf.set(k, s.end);
			}
		}
		for (const [k, first] of firstOf) {
			const prev = seen.get(k) ?? { completed: false, terminal: false };
			for (const s of sorted) {
				if (s.end <= first) continue;
				if (s.completed.has(k)) prev.completed = true;
				if (s.terminal.has(k)) prev.terminal = true;
			}
			seen.set(k, prev);
		}
	}
	let completed = 0;
	let terminal = 0;
	let neither = 0;
	for (const v of seen.values()) {
		if (v.completed) completed++;
		else if (v.terminal) terminal++;
		else neither++;
	}
	return { tracked: seen.size, completed, terminal, neither };
}

main().catch((e) => {
	process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
	process.exit(1);
});
