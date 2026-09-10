/**
 * issue #268 Phase 1: **形成中 `double_top` の `formationBars` が「パターン長」ではなく
 * 「直近の確定山からの距離」を測っている**件を実測する。
 * **検出器・`structural.ts`・`config.ts`・ベースラインは 1 行も変更しない**（計測とドキュメントだけ）。
 *
 * ## 問題設定（コードの事実）
 *
 * `tryFormingDoubleTop`（`tools/patterns/detect_doubles.ts`）は PR #270 後に残った**唯一の形成中
 * double 経路**で、「2 つ目の山を作っている途中」（山1 + 谷 + 最新足 = 暫定山2）を出す。
 * 左の主構成点の取り方が
 *
 * ```ts
 * const lastConfirmedPeak = [...allPeaks].reverse().find((p) => p.idx < lastIdx - 2); // 最新の確定山 1 つだけ
 * ```
 *
 * なので `formationBars = lastIdx − leftPeak.idx` が**パターン長ではなく「直近の山からの距離」**になる。
 * 実測（#262 Phase 1 §4）では構成点が揃った 4,303 件のうち 4,159 件（96.7%）が
 * `forming_bars_out_of_range` の**下限割れ**で落ち、accepted は全コーパスで 0 件。
 *
 * ## ablation（`detect_doubles.ts` の複製に対して。作業ツリーは不変）
 *
 * | ビルド | 左の山の探索 | 目的 |
 * |---|---|---|
 * | `base` | 現行（最新の確定山 1 つ） | 対照。#262 Phase 1 §4 のファネルが再現すること |
 * | `noTop` | 経路ごと `return null` | 形成中 top 経路の候補を**差分で同定する**ための対照 |
 * | `ablP` | 確定山を新しい順に回し、**谷を挟んで最新足と同水準にある最初の山**を左の山とする | accepted がいくつ出るか |
 * | `ablP+minDist` | `ablP` に加え、山1–谷 / 谷–最新足に `ctx.minDist` を掛ける | #269（中間構成点が隣接足）の効き |
 *
 * **差し替えるのは探索だけ。** `ablP` は `tryFormingDoubleTop` の
 * 「`lastConfirmedPeak` を取る行」から「`const valley = valleyAfterPeak;`」までを置き換えるだけで、
 * **それ以外は作業ツリーとバイト単位で同一**（{@link SEARCH_SPAN} / {@link swapSearch}）。
 * 閾値（`DOUBLE_LEVEL_MAX_PCT` / `getDoubleFormingBarParams` / `FORMING_*`）は 1 つも動かさない。
 * `formationBars` の式も `lastIdx − leftPeak.idx` のまま（意味だけが「パターン長」に変わる）。
 *
 * ### 遡るときに「最新足より高い山」を挟まない（既定）
 *
 * `ablP` の探索は、同水準の山に当たる前に**最新足より高い確定山**が現れた時点で止まる。
 * 挟むことを許すと「その高い山こそが山1 で、今の最新足はそれより低い」形になり、
 * **切り下がり（lower high）を `double_top` と呼ぶ**ことになる。止めた回数は
 * `forming_search_blocked_by_higher_peak` として数えるので、緩めた場合の上限も読める。
 *
 * ## 出すもの（issue #268 の計測仕様 1〜8）
 *
 * | § | 内容 |
 * |---|---|
 * | 1 | `base` のファネル再現（到達 4,303 / `forming_bars_out_of_range` 4,159 全件下限割れ / accepted 0） |
 * | 2 | `ablP` のファネルと accepted、`formationBars` の分布 |
 * | 3 | `ablP+minDist` との差。#269 の「谷が山1 の隣接足」の件数と `minDist` の効き |
 * | 4 | accepted の実体の明細と 3 値判定（#262 Phase 1 §8-2 の 5 段の数値基準） |
 * | 5 | ローリング窓での追跡（`near_completion` / `completed` に至るか） |
 * | 6 | 完成済み経路 / `near_completion` との二重出力（`globalDedup` が畳むか） |
 * | 7 | `view=debug` の cap への影響と #158 の積み方（構成点が揃った後の分岐にだけ積む） |
 * | 8 | 標準コーパス 800 の `data.patterns` 差分（`includeForming: true`） |
 *
 * ## ハーネス
 *
 * `scripts/measure_forming_double_asymmetry_262.ts`（PR #270 版）の流儀をそのまま使う。
 * `tools/patterns/` を**ディレクトリごと**一時領域へ展開して読む（検出器 1 ファイルだけを写すと
 * `./structural.js` が作業ツリーへ解決され、ablation ビルドに現行実装が混ざる）。
 * `--strip-ref <ref>` を渡すと **`tools/patterns/` を 1 ファイルも残さず**その ref から取る
 * strip ビルドになる（{@link verifyStripScope} の docstring。#268 案 C で `detect_doubles.ts`
 * 1 ファイルから広げた）。
 *
 * **#268 案 C の実装後は `--strip-ref` が必須になった。** 作業ツリーの `detect_doubles.ts` から
 * `tryFormingDoubleTop` が削除されたので、ablation のアンカーが無く `base` ビルドが組めない。
 * 既定値として使うべき ref は {@link STRIP_REF_BEFORE_268C}（#271 のマージ commit）。
 * 付け忘れると {@link requireFormingTopAnchors} が起動時に落とす。
 *
 * ## コーパス
 *
 * `measure_forming_double_asymmetry_262.ts` と**同じ 12,104 ケース**
 * （標準 800 = 合成 704 + 実データ A 96、実データ B / C / D 各 96、ローリング窓 3,672 × 3）。
 * **プールしない**（#219）。実データ B / C / D は同じ btc_jpy 1 時間足履歴の**重なる窓**なので、
 * 構造の実体数を言うときは**絶対時刻で畳む**（本スクリプトの「実体」列）。
 *
 * ## 使い方
 *
 * ```bash
 * # **#268 案 C 以降は --strip-ref が必須**（理由は上の「ハーネス」）。
 * npx tsx scripts/measure_forming_double_top_268.ts --strip-ref 27337eb
 * npx tsx scripts/measure_forming_double_top_268.ts --strip-ref 27337eb --json /tmp/268.json
 * npx tsx scripts/measure_forming_double_top_268.ts --strip-ref 27337eb --no-rolling  # 短時間確認用
 *
 * # ablation の detect_doubles.ts を書き出すだけ（計測はしない）。
 * # 既存テストへの影響を測るときに作業ツリーへ一時的に当てるためのもので、
 * # **当てたら必ず `git checkout tools/patterns/detect_doubles.ts` で戻すこと。**
 * npx tsx scripts/measure_forming_double_top_268.ts --emit ablP /tmp/detect_doubles.ablP.ts
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
import { globalDedup } from '../tools/patterns/helpers.js';
import { TRIPLE_HS_EXCLUSION_REASON } from '../tools/patterns/mutual-exclusion.js';
import { linearRegressionWithR2, near as nearFn, pct as pctFn } from '../tools/patterns/regression.js';
import { type Candle, detectSwingPoints, filterPeaks, filterValleys } from '../tools/patterns/swing.js';
import type { CandDebugEntry, DeduplicablePattern, DetectContext } from '../tools/patterns/types.js';

const ROOT = resolve(import.meta.dirname, '..');
const TMP_DIR = mkdtempSync(join(tmpdir(), 'forming-double-top-268-'));

type Detector = (ctx: DetectContext) => { patterns: DeduplicablePattern[] };

/** 1 ビルドぶんの検出器と、そのビルドが実際に持っている形成中の係数。 */
interface Build {
	detectDoubles: Detector;
	detectTriples: Detector;
	DOUBLE_LEVEL_MAX_PCT: number;
	MIN_FORMING_COMPLETION: number;
	MIN_PATTERN_DAYS: number;
	FORMING_PEAK_TOLERANCE_PCT: number;
	FORMING_EXPIRY_BARS: number;
	getDoubleFormingBarParams: (tf: string) => { minBars: number; maxBars: number };
}

/**
 * 展開ビルドの末尾に足す `export { … }`。**そのソースに実在する識別子だけを並べる。**
 * 既に export されている宣言は書かない（重複 export は構文エラー）。追記するのはモジュール内で
 * 閉じていた `const` だけで、**宣言に名前を付け直すだけなので判定は 1 ミリも変わらない。**
 * それを §0 の検算が全ケースで確かめる。
 */
const DOUBLES_INTERNAL_SYMBOLS = ['FORMING_PEAK_TOLERANCE_PCT', 'FORMING_EXPIRY_BARS'] as const;

function internalExportsFor(name: string, src: string): string {
	if (name !== 'detect_doubles.ts') return '';
	const present = DOUBLES_INTERNAL_SYMBOLS.filter(
		(sym) => src.includes(`const ${sym} `) || src.includes(`const ${sym}=`),
	);
	return present.length > 0 ? `\nexport { ${present.join(', ')} };\n` : '';
}

// ── 差し替え（ablation / 対照ビルド） ──

/**
 * `tryFormingDoubleTop` の**関数まるごと**の差し替え範囲（対照ビルド `noTop` 用）。
 *
 * 波括弧の対応で末尾を探さない——`detect_doubles.ts` の docstring には `{@link …}` や
 * `{ extremePrice: 最新足の終値 }` が入っていて、コメントを読み飛ばさない素朴な数え上げは必ず壊れる。
 * 代わりに**関数シグネチャ**から**次の節コメント**までを範囲に取り、
 * 両アンカーがそれぞれちょうど 1 回現れることと前後関係を差し替え前に確認する。
 */
const FN_SPAN = {
	start: 'function tryFormingDoubleTop(ctx: DetectContext): PatternEntry | null {',
	end: '\n// ── Main ──',
} as const;

/**
 * **左の山の探索だけ**の差し替え範囲（`ablP` / `ablP+minDist` 用）。
 *
 * 「`lastConfirmedPeak` を取る行」から「`const valley = valleyAfterPeak;`」までを置き換える。
 * この範囲の外——同水準判定・完成度・`formationBars`・トレンド・サイズ・構造ゲート・
 * ネックライン側判定・戻り値の組み立て——は**作業ツリーとバイト単位で同一**のまま走る。
 * 「変えるのは探索だけ」（issue #268 の計測仕様）を関数の書き写しではなく**範囲**で担保する。
 */
const SEARCH_SPAN = {
	start: '\tconst lastConfirmedPeak = [...allPeaks].reverse().find((p) => p.idx < lastIdx - 2);',
	end: '\tconst valley = valleyAfterPeak;\n',
} as const;

/** `ctx` の分割代入（`ablP+minDist` は `minDist` も要る）。 */
const CTX_DESTRUCTURE = '\tconst { candles, allPeaks, allValleys, want } = ctx;';

/** `minDist` ゲートを差し込む位置（構成点が揃った直後、既存の最初のガードの前）。 */
const MIN_DIST_ANCHOR = '\tconst leftPct = currentPrice / Math.max(1, leftPeak.price);';

/** 差し替えたビルドに埋める目印。差し替え後にちょうど 1 回現れることを確認する。 */
const MARKERS = {
	disableTop: '__off268_top',
	ablP: '__abl268P',
	ablPMinDist: '__abl268PMD',
} as const;

/** 形成中 top 経路を丸ごと黙らせる対照ビルドの本体（差分で経路を同定するための対照）。 */
function disabledBody(marker: string): string {
	return [
		FN_SPAN.start,
		'\t// [対照ビルド issue #268] 形成中ダブルトップ経路を丸ごと無効化した。',
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
 * **ablation `ablP`**: 左の山の探索を「谷を挟んで最新足と同水準にある最初の確定山」へ変える。
 *
 * 形成中 triple（`detect_triples.ts` の `tryFormingTripleTop`）と同じ流儀で確定山を新しい順に回す。
 * 谷は**その山と最新足の間の最安値の谷**（strict / 形成中 triple と同じ取り方）。
 *
 * **最新足より高い山を挟んで遡らない**（issue #268 の既定）。挟むと「その高い山こそが山1 で、
 * 今の最新足はそれより低い」形になり、切り下がりを `double_top` と呼ぶことになる。
 * 止めた回数は `forming_search_blocked_by_higher_peak` で数えるので、緩めた場合の上限も読める。
 *
 * ### 棄却エントリの積み方（#158）
 *
 * **ループの中では 1 件も積まない。** 探索が終わってから、組めなかった理由を**高々 1 件**積む
 * （現行と同じく 1 回の呼び出しで候補は 1 件）。理由コードは 4 通りに分かれる:
 *
 * | コード | 意味 |
 * |---|---|
 * | `forming_no_confirmed_peak` | 確定山が 1 つも無い（現行と同じコード） |
 * | `forming_no_level_peak` | 最後まで遡っても最新足と同水準の確定山が無い（**ablation 固有**） |
 * | `forming_search_blocked_by_higher_peak` | 同水準の山に当たる前に最新足より高い山が現れた（**ablation 固有**） |
 * | `forming_no_valley_after_peak` | 同水準の山はあったが、その山と最新足の間に谷が無い（現行と同じコード） |
 */
const ABL_P_SEARCH = `	// [ablation issue #268 ablP] ${MARKERS.ablP}
	// **左の山の探索だけ**を差し替えたビルド。計測ハーネスが差し替えた範囲で、作業ツリーには存在しない。
	// この範囲の外（同水準判定・完成度・formationBars・トレンド・サイズ・構造ゲート・戻り値）は
	// 作業ツリーとバイト単位で同一のまま走る。閾値・係数は 1 つも変えていない。
	//
	//   現行: [...allPeaks].reverse().find((p) => p.idx < lastIdx - 2) = **最新の確定山 1 つだけ**
	//   ablP: 確定山を新しい順に回し、**谷を挟んで最新足と同水準にある最初の山**を左の山とする
	//         （形成中 triple の確定山ペアのループと同じ流儀）。谷はその山と最新足の間の最安値の谷。
	//
	// **最新足より高い山を挟んで遡らない。** 挟むと切り下がり（lower high）を double_top と呼ぶ。
	// ループの中では候補を 1 件も積まない（#158）。組めなかった理由は探索の後で高々 1 件積む。
	const confirmedPeaks268 = allPeaks.filter((p) => p.idx < lastIdx - 2);
	if (confirmedPeaks268.length === 0) {
		pushCand(ctx, { type: 'double_top', accepted: false, reason: 'forming_no_confirmed_peak' });
		return null;
	}
	let foundPeak268: Pivot | null = null;
	let foundValley268: Pivot | null = null;
	let levelPeakWithoutValley268: Pivot | null = null;
	let blockedByHigherPeak268 = false;
	for (let i268 = confirmedPeaks268.length - 1; i268 >= 0; i268--) {
		const p268 = confirmedPeaks268[i268];
		if (isSameLevel(currentPrice, p268.price, DOUBLE_LEVEL_MAX_PCT)) {
			const between268 = allValleys.filter((v) => v.idx > p268.idx && v.idx < lastIdx - 1);
			if (between268.length === 0) {
				if (!levelPeakWithoutValley268) levelPeakWithoutValley268 = p268;
				continue;
			}
			foundPeak268 = p268;
			foundValley268 = between268.reduce((best, v) => (v.price < best.price ? v : best), between268[0]);
			break;
		}
		if (p268.price > currentPrice) {
			blockedByHigherPeak268 = true;
			break;
		}
	}
	if (!foundPeak268 || !foundValley268) {
		if (levelPeakWithoutValley268) {
			pushCand(ctx, {
				type: 'double_top',
				accepted: false,
				reason: 'forming_no_valley_after_peak',
				idxs: [levelPeakWithoutValley268.idx],
				pts: [{ role: 'peak1', idx: levelPeakWithoutValley268.idx, price: levelPeakWithoutValley268.price }],
			});
		} else {
			pushCand(ctx, {
				type: 'double_top',
				accepted: false,
				reason: blockedByHigherPeak268 ? 'forming_search_blocked_by_higher_peak' : 'forming_no_level_peak',
			});
		}
		return null;
	}
	const leftPeak = foundPeak268;
	const valley = foundValley268;
`;

/**
 * **ablation `ablP+minDist`** で足すゲート（issue #269）。
 *
 * 完成済み経路は `b.idx − a.idx < minDist || c.idx − b.idx < minDist` で主構成点間に
 * `ctx.minDist`（`minBarsBetweenSwings`）を掛けているが、形成中経路は中間構成点との距離を
 * 検査していない。同じ値を山1–谷 / 谷–最新足に掛ける。
 *
 * **位置は構成点が揃った直後**（既存の最初のガード `forming_peak_level_out_of_tolerance` の前）。
 * 完成済み経路でも `minDist` は最初に掛かるので位置を揃えた。後ろに置くと
 * 「他の理由で落ちるはずだった候補」を横取りして #269 の効きが読めなくなる。
 */
const MIN_DIST_GATE = `	// [ablation issue #269] ${MARKERS.ablPMinDist}
	// 中間構成点（谷）にも完成済みと同じ minDist を掛ける。計測ハーネスが差し込んだゲートで、
	// 作業ツリーには存在しない。山1–谷 / 谷–最新足の両方を見る。
	if (valley.idx - leftPeak.idx < minDist || lastIdx - valley.idx < minDist) {
		rejectForming('forming_mid_points_too_close');
		return null;
	}
`;

/** 展開ビルドの作り分け。 */
interface BuildVariantOpts {
	/** `tryFormingDoubleTop` を丸ごと `return null` に差し替える（経路同定の対照）。 */
	disableTop?: boolean;
	/** 左の山の探索を `ablP` に差し替える。 */
	search?: 'ablP';
	/** `ablP` に加えて中間構成点の `minDist` ゲートを足す（#269）。 */
	minDistGate?: boolean;
	/**
	 * `tools/patterns/` を作業ツリーではなくこの git ref から取る（**strip ビルド**）。
	 * `--strip-ref` を渡したときだけ効く。#268 案 C 以降は作業ツリーに `tryFormingDoubleTop` が
	 * 無いので、本スクリプトを走らせるには実質必須（{@link requireFormingTopAnchors}）。
	 */
	fromRef?: string;
}

/**
 * strip ビルドが指定 ref と等価であることの検算（#264 / #265 / #262 の様式）。
 *
 * ## #268 案 C で `fromRef` を `tools/patterns/` の**全ファイル**へ広げた
 *
 * 元は「`detect_doubles.ts` だけを ref から取り、残りは作業ツリー」という組み方で、
 * **作業ツリーが `tools/patterns/` の他のファイルを触っていたら等価性が崩れる**ため、
 * `detect_doubles.ts` 以外の差分を見つけたらその場で落としていた。案 C は
 * `min-bars.ts`（`forming_double` の除外）と `structural.ts`（docstring の参照先）も触るので、
 * その条件では `--strip-ref` がそもそも使えなくなる。**当時のエラーメッセージが案内していた
 * 対処（`fromRef` を全ファイルに広げる）をそのまま採った。**
 *
 * したがって strip ビルドは「`tools/patterns/` をまるごと ref から取ったもの」で、
 * **本関数は等価性のゲートではなく、差分の申告**（メモの §0 に出す）になった。
 * 落とす条件は 1 つだけ残してある: **ファイル構成が ref と作業ツリーでずれていないこと**。
 * ずれていると、ref から取った側が作業ツリーにしか無いモジュールを import して解決に失敗する
 * （逆向きなら黙って古い構成で走る）。
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
 * **#268 案 C 前の `detect_doubles.ts` を持つ ref**（#271 のマージ commit）。
 *
 * 作業ツリーには `tryFormingDoubleTop` がもう無いので、本スクリプトの ablation を組むには
 * この ref（かそれ以前で #270 マージ後のもの）を `--strip-ref` に渡す必要がある。
 * #270 マージ後であることが要るのは、`near_completion` の導入前と後で完成済み経路の
 * `status` が違い、Phase 1 の数字と比較できなくなるため。
 */
const STRIP_REF_BEFORE_268C = '27337eb';

/**
 * `detect_doubles.ts`（strip-ref 側 or 作業ツリー）に ablation のアンカーがあることを
 * **起動時に**確認する。無ければ**数字を 1 つも出さずに落とす。**
 *
 * #268 案 C（`tryFormingDoubleTop` の削除）以降、作業ツリーにはアンカーが無い。
 * これを黙って見逃すと `base` ビルドが組めないまま部分結果が出る——PR #260 のレビューで
 * 「コーパスが縮んだまま正常終了」を直したのと同じ失敗の形なので、同じ扱いにする。
 *
 * **読むのは strip-ref を渡したならその ref の中身**（`materializePatternsDir` が実際に
 * 差し替える対象と同じもの）。作業ツリーを見て判定すると、`--strip-ref` で正しく走れる場合まで
 * 落としてしまう。
 */
function requireFormingTopAnchors(ref: string | null): void {
	const path = 'tools/patterns/detect_doubles.ts';
	const src = ref
		? execFileSync('git', ['show', `${ref}:${path}`], { cwd: ROOT, encoding: 'utf8' })
		: readFileSync(join(ROOT, path), 'utf8');
	if (src.includes(FN_SPAN.start)) return;
	throw new Error(
		[
			'',
			`${ref ? `'${ref}' の` : '作業ツリーの'} ${path} に tryFormingDoubleTop が無いので、`,
			'本スクリプトの ablation（base / noTop / ablP / ablP+minDist）を組めません。',
			'',
			'issue #268 案 C で形成中 double_top の経路を削除したためです。**計測は再計測の根拠として',
			'残してあるので、削除前の ref を渡して走らせてください**:',
			'',
			`  npx tsx scripts/measure_forming_double_top_268.ts --strip-ref ${STRIP_REF_BEFORE_268C}`,
			'',
			`  ${STRIP_REF_BEFORE_268C} = PR #271（#268 Phase 1）のマージ commit。`,
			'  #270 マージ後であることが要ります（near_completion 導入前の ref だと完成済み経路の',
			'  status が違い、Phase 1 の数字と突き合わせられません）。',
			'',
			'部分結果は出しません。アンカーが無い状態で走らせると base ビルドが現行実装（形成中経路なし）',
			'になり、§1 のファネルが「全段 0 件」として静かに壊れます。',
			'',
		].join('\n'),
	);
}

/** アンカーがちょうど 1 回現れることを確認する（崩れたらその場で落とす）。 */
function requireOnce(src: string, anchor: string, what: string): void {
	const hits = src.split(anchor).length - 1;
	if (hits !== 1) {
		throw new Error(
			`${what}のアンカーが detect_doubles.ts に ${hits} 回現れる（期待 1 回）: ${anchor.trim()}。` +
				'形成中経路の実装が変わったので、アンカーを取り直すこと。',
		);
	}
}

/** `tryFormingDoubleTop` を**関数まるごと** `return null` に差し替える（対照ビルド）。 */
function swapWholeFn(src: string): string {
	requireOnce(src, FN_SPAN.start, '関数');
	requireOnce(src, FN_SPAN.end, '節コメント');
	const from = src.indexOf(FN_SPAN.start);
	const to = src.indexOf(FN_SPAN.end);
	if (!(from < to)) throw new Error('関数アンカーが節アンカーより後ろにある。');
	const out = `${src.slice(0, from)}${disabledBody(MARKERS.disableTop)}${src.slice(to)}`;
	requireOnce(out, MARKERS.disableTop, '差し替えの目印');
	return out;
}

/**
 * **左の山の探索だけ**を差し替える（`ablP` / `ablP+minDist`）。
 *
 * 差し替え範囲は {@link SEARCH_SPAN}。この関数が触るのはその範囲と、`minDistGate` のときの
 * `ctx` の分割代入 1 行 + ゲート 1 ブロックだけで、**それ以外は 1 バイトも変えない。**
 * アンカーはすべて「ちょうど 1 回」を差し替え前に確認する。
 */
function swapSearch(src: string, minDistGate: boolean): string {
	requireOnce(src, SEARCH_SPAN.start, '探索の開始');
	requireOnce(src, SEARCH_SPAN.end, '探索の終了');
	const from = src.indexOf(SEARCH_SPAN.start);
	const to = src.indexOf(SEARCH_SPAN.end);
	if (!(from < to)) throw new Error('探索の開始アンカーが終了アンカーより後ろにある。');
	let out = `${src.slice(0, from)}${ABL_P_SEARCH}${src.slice(to + SEARCH_SPAN.end.length)}`;
	requireOnce(out, MARKERS.ablP, '差し替えの目印');

	if (minDistGate) {
		requireOnce(out, CTX_DESTRUCTURE, '`ctx` の分割代入');
		out = out.replace(CTX_DESTRUCTURE, '\tconst { candles, allPeaks, allValleys, want, minDist } = ctx;');
		requireOnce(out, MIN_DIST_ANCHOR, '`minDist` ゲートの差し込み位置');
		out = out.replace(MIN_DIST_ANCHOR, `${MIN_DIST_GATE}${MIN_DIST_ANCHOR}`);
		requireOnce(out, MARKERS.ablPMinDist, '差し込みの目印');
	}
	return out;
}

/**
 * 作業ツリーの `tools/patterns/` を**ディレクトリごと**一時領域へ展開する
 * （`measure_forming_double_asymmetry_262.ts` の同名関数と同じ流儀）。
 * 検出器 1 ファイルだけを写すと `./structural.js` が作業ツリーへ解決され、
 * ablation ビルドに現行実装が混ざる。
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
			if (opts.disableTop) src = swapWholeFn(src);
			else if (opts.search === 'ablP') src = swapSearch(src, !!opts.minDistGate);
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
		FORMING_EXPIRY_BARS: doubles.FORMING_EXPIRY_BARS,
		getDoubleFormingBarParams: doubles.getDoubleFormingBarParams,
	};
}

// ── コーパス（#242 / #243 / #244 / #249 / #260 / #262 と同じ組み方） ──

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
 * **`includeForming: true` だけが形成中経路の発火を左右する**ので、ローリングでは 8 通りを回さず
 * 全部 true の 1 通りに固定する。8 倍のケース数を払っても同じ候補が 8 回積まれるだけ。
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

/** そのケースの `minDist`（`minBarsBetweenSwings`）。#269 の集計に要る。 */
function minDistOf(spec: CaseSpec): number {
	return resolveParams(spec.tf, spec.swingDepth === undefined ? {} : { swingDepth: spec.swingDepth })
		.minBarsBetweenSwings;
}

// ── 走行 ──

interface RunOut {
	patterns: DeduplicablePattern[];
	cands: CandDebugEntry[];
}

/** `detectDoubles` だけを 1 ケースに走らせる（本 issue が触るのは形成中 top 経路だけ）。 */
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
 * 形成中経路の棄却理由には**完成済み経路と共有のもの**がある（`prior_trend_mismatch:*` と
 * `validateReversalStructure` のゲート理由）。名前で振り分けると完成済みの棄却が混ざるので、
 * 経路を丸ごと潰した対照ビルドとの差集合で同定する。形成中経路は `detectDoubles` の最後で
 * 呼ばれ `debugCandidates` に積む以外の副作用が無いので、対照ビルドの候補列は base の候補列の
 * **部分列**になる。部分列でなければその場で落とす——差分の帰属が保証されないまま数字を出すより、
 * 計測を止めるほうが安い。
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
 * 3 ビルドとも 1 呼び出しにつき候補が高々 1 件なので、この並びはそのまま**ファネル**になる
 * （段階 k に到達した数 = 全体 − 段階 k より前で落ちた数）。
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

/** 構成点が揃った後の段階（3 ビルド共通。ここは 1 バイトも差し替えていない部分）。 */
const STAGES_TAIL: Stage[] = [
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

/** 現行 `tryFormingDoubleTop`（最新の確定山 1 つ + その後の最初の谷）。 */
const STAGES_BASE: Stage[] = [
	{ label: 'forming_no_confirmed_peak', match: eq('forming_no_confirmed_peak') },
	{ label: 'forming_no_valley_after_peak', match: eq('forming_no_valley_after_peak') },
	...STAGES_TAIL,
];

/** `ablP`（谷を挟んで最新足と同水準にある最初の確定山）。探索の棄却コードが 4 つに分かれる。 */
const STAGES_ABL_P: Stage[] = [
	{ label: 'forming_no_confirmed_peak', match: eq('forming_no_confirmed_peak') },
	{ label: 'forming_no_level_peak', match: eq('forming_no_level_peak') },
	{ label: 'forming_search_blocked_by_higher_peak', match: eq('forming_search_blocked_by_higher_peak') },
	{ label: 'forming_no_valley_after_peak', match: eq('forming_no_valley_after_peak') },
	...STAGES_TAIL,
];

/** `ablP+minDist`（#269 のゲートを構成点が揃った直後に足す）。 */
const STAGES_ABL_PMD: Stage[] = [
	{ label: 'forming_no_confirmed_peak', match: eq('forming_no_confirmed_peak') },
	{ label: 'forming_no_level_peak', match: eq('forming_no_level_peak') },
	{ label: 'forming_search_blocked_by_higher_peak', match: eq('forming_search_blocked_by_higher_peak') },
	{ label: 'forming_no_valley_after_peak', match: eq('forming_no_valley_after_peak') },
	{ label: 'forming_mid_points_too_close（#269）', match: eq('forming_mid_points_too_close') },
	...STAGES_TAIL,
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

/** accepted な形成中候補 1 件の明細（§4 の目視判定の材料）。 */
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
	formationBars: number;
	minDist: number;
}

/** ローリング窓 1 つぶんの、その構造がどう見えていたか（§5 の追跡）。 */
interface Slice {
	end: number;
	forming: Set<string>;
	nearCompletion: Set<string>;
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
 * **`|` はインラインコードの中でもセル区切りとして解釈される**（GFM）。実体キーは
 * `1day|double_top|2026-…` の形なので、そのまま書くと列数が合わなくなる（markdownlint MD056）。
 */
const mdCell = (v: string): string => v.replaceAll('|', '\\|');

const yen = (v: number): string => Math.round(v).toLocaleString('ja-JP');

/** ソート済み配列の分位点（空なら null）。 */
function quantile(sorted: readonly number[], p: number): number | null {
	if (sorted.length === 0) return null;
	return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? null;
}

/** min / p50 / max の 1 行（空なら「—」）。 */
function distLine(values: readonly number[]): string {
	if (values.length === 0) return '—';
	const s = [...values].sort((a, b) => a - b);
	return `min ${s[0]} / p50 ${quantile(s, 0.5)} / max ${s[s.length - 1]}`;
}

/** 中間構成点の間隔の集計（issue #269）。 */
interface GapStats {
	/** 構成点が揃った候補の延べ。 */
	assembled: number;
	/** 谷が山1 の**隣接足**（間隔 1 本）。 */
	gap1IsAdjacent: number;
	/** 最新足が谷の隣接足（間隔 1 本）。 */
	gap2IsAdjacent: number;
	/** 山1–谷 が `minDist` 未満。 */
	gap1BelowMinDist: number;
	/** 谷–最新足 が `minDist` 未満。 */
	gap2BelowMinDist: number;
	/** どちらかが `minDist` 未満（= `ablP+minDist` で落ちる）。 */
	eitherBelowMinDist: number;
	gap1Samples: number[];
	gap2Samples: number[];
}

const newGapStats = (): GapStats => ({
	assembled: 0,
	gap1IsAdjacent: 0,
	gap2IsAdjacent: 0,
	gap1BelowMinDist: 0,
	gap2BelowMinDist: 0,
	eitherBelowMinDist: 0,
	gap1Samples: [],
	gap2Samples: [],
});

function feedGap(g: GapStats, idxs: readonly number[], windowEnd: number, minDist: number): void {
	if (idxs.length < 2) return;
	const gap1 = idxs[1] - idxs[0];
	const gap2 = windowEnd - idxs[1];
	g.assembled++;
	g.gap1Samples.push(gap1);
	g.gap2Samples.push(gap2);
	if (gap1 === 1) g.gap1IsAdjacent++;
	if (gap2 === 1) g.gap2IsAdjacent++;
	if (gap1 < minDist) g.gap1BelowMinDist++;
	if (gap2 < minDist) g.gap2BelowMinDist++;
	if (gap1 < minDist || gap2 < minDist) g.eitherBelowMinDist++;
}

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
	/** accepted な候補のうち、対応する `PatternEntry` を引けなかった件数。**0 件であるべき**。 */
	unmatchedAccepted: number;
	/** `forming_bars_out_of_range` の内訳（下限割れ / 上限超え）。 */
	barsBelowMin: number;
	barsAboveMax: number;
	formationBarsSamples: number[];
	/** accepted になった候補の `formationBars`（bottom / triple と桁が揃うか）。 */
	acceptedFormationBars: number[];
	/** 中間構成点の間隔（#269）。構成点が揃った候補すべて / accepted だけ。 */
	gapAll: GapStats;
	gapAccepted: GapStats;
	/** 1 回の呼び出しでこの経路が積んだ候補の最大数（#158 の cap 対策の検算。1 であるべき）。 */
	maxPerCall: number;
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
		acceptedFormationBars: [],
		gapAll: newGapStats(),
		gapAccepted: newGapStats(),
		maxPerCall: 0,
	};
}

/**
 * 候補 1 件に対応する `PatternEntry` を **構成点と `status` で**引く。
 *
 * **`type` だけで引いてはいけない。** 同じケースで完成済み `double_top` と形成中 `double_top` が
 * 両方返ることがあり（`detectDoubles` の `push` は dedup しない）、完成済みのほうが配列の前に
 * あるので `find(x => x.type === e.type)` は別の構造を掴む（PR #267 の CodeRabbit 指摘）。
 * **構成点だけでも足りない**——完成済みと形成中が同じ点で同時に出るケースが実在する。
 * `status` まで見れば一意に決まる。一致しなければ `undefined` を返す（別の構造の値を
 * 黙って載せるより `—` を出すほうが安全）。取りこぼしが 0 件であることは §0 で申告する。
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

/** その経路に帰属した候補列を 1 ケースぶん流し込む。 */
function feed(
	agg: PathAgg,
	entries: readonly CandDebugEntry[],
	spec: CaseSpec,
	corpus: string,
	patterns: readonly DeduplicablePattern[],
	barParams: { minBars: number; maxBars: number },
): void {
	const minDist = minDistOf(spec);
	// #158 の検算: この経路が 1 回の呼び出しで積んだ候補の数（注記を除く）。
	agg.maxPerCall = Math.max(agg.maxPerCall, entries.filter((e) => !(e.accepted && e.status === undefined)).length);
	for (const e of entries) {
		if (e.accepted && e.status === undefined) {
			// `prior_trend_insufficient_data`（棄却ではない注記）。候補の分母に入れない。
			agg.insufficientData++;
			continue;
		}
		const { struct, ts, mainIdxs } = keysOf(e, spec);
		agg.totalByCorpus.set(corpus, (agg.totalByCorpus.get(corpus) ?? 0) + 1);
		// 構成点が 2 点（山1 + 谷）揃った候補だけ間隔を数える。
		if (mainIdxs.length >= 2) feedGap(agg.gapAll, mainIdxs, spec.windowEnd, minDist);

		if (e.accepted) {
			const status = String(e.status ?? 'forming');
			bump(agg.accepted, `${corpus}|${status}`, struct, ts);
			const p = findPatternFor(patterns, e.type, status, mainIdxs);
			if (!p) agg.unmatchedAccepted++;
			if (mainIdxs.length >= 2) feedGap(agg.gapAccepted, mainIdxs, spec.windowEnd, minDist);
			const formationBars = mainIdxs.length > 0 ? spec.windowEnd - mainIdxs[0] : Number.NaN;
			if (Number.isFinite(formationBars)) agg.acceptedFormationBars.push(formationBars);
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
				currentPrice: Number(spec.series.candles[spec.windowEnd]?.close ?? NaN),
				formationBars,
				minDist,
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

// ── §4 目視判定 ──

/** 目視判定に要る、実体 1 つぶんの生データ（フィクスチャから直接読める量だけ）。 */
interface ShapeRec {
	series: Series;
	tf: string;
	sd: string;
	windowEnd: number;
	type: string;
	/** 山1 / 谷 / 暫定山2（= 最新足）の idx。 */
	idxs: number[];
	necklinePrice: number;
}

interface Verdict {
	verdict: string;
	basis: string;
	gapBars: number;
	gap2Bars: number;
	depthPct: number;
	exceeded: boolean;
	nlBroken: boolean;
}

/**
 * #262 Phase 1 §8-2 の 3 値判定を**数値だけで**再現する。
 *
 * 使う量は「構成点の終値 / 極値」と「区間の最高値 / 最安値」の 2 種類だけで、
 * どちらも凍結フィクスチャから直接読める（検出器も閾値も通さない）。
 * 順に当てて最初に当たったものを採る、という Phase 1 の手順もそのまま:
 *
 * 1. 谷が山1 の隣接足（間隔 1 本） → **呼べない**
 * 2. 山2 以降に両山の高値を超えた → **呼べない**
 * 3. 谷の深さ（対 山1 終値）< 0.5% → **呼べない**
 * 4. 深さ ≥ 1.0% かつ山2 以降にネックラインを割った → **呼べる**
 * 5. それ以外 → **保留**
 *
 * @param scanEnd 基準 2 / 4 の走査終端。**形成中 top では第2構成点が最新足なので、
 *   `scanEnd = windowEnd` にすると走査区間が空になり基準 2 / 4 は定義上発火しない。**
 *   検出器が見られる情報だけで判定するときはこれが正しい（呼び出し側が `windowEnd` を渡す）。
 *   後続を見た補助判定では窓の先の idx を渡す（**検出器には見えない情報**であることを
 *   メモ側で明示すること）。
 */
function judgeShape(rec: ShapeRec, scanEnd: number): Verdict {
	const [aIdx, bIdx, cIdx] = rec.idxs;
	const cd = rec.series.candles;
	const isTop = rec.type === 'double_top';
	const closeAt = (i: number): number => Number(cd[i]?.close ?? NaN);
	const gapBars = bIdx - aIdx;
	const gap2Bars = cIdx - bIdx;
	// 中間構成点の深さ（対 第1構成点の終値）。top は押し、bottom は戻り。
	const depthPct = Math.abs(closeAt(aIdx) - closeAt(bIdx)) / Math.max(1, Math.abs(closeAt(aIdx)));
	// 第2構成点より後（走査終端まで）の極値。
	let beyond = isTop ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
	let nlBroken = false;
	for (let i = cIdx + 1; i <= scanEnd; i++) {
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

	const base = { gapBars, gap2Bars, depthPct, exceeded, nlBroken };
	if (gapBars <= 1) return { verdict: '呼べない', basis: '基準 1（中間構成点が隣接足）', ...base };
	if (exceeded) return { verdict: '呼べない', basis: '基準 2（第2構成点以降に外側を超えた）', ...base };
	if (depthPct < 0.005) return { verdict: '呼べない', basis: '基準 3（深さ < 0.5%）', ...base };
	if (depthPct >= 0.01 && nlBroken) return { verdict: '呼べる', basis: '基準 4', ...base };
	return { verdict: '保留', basis: '基準 5（該当なし）', ...base };
}

/** 後続を見た補助判定の水平線（本数）。**検出器には見えない情報**なので本判定とは別に出す。 */
const LOOKAHEAD_BARS = 30;

// ── §6 二重出力 ──

/** `patterns` 1 件の status（未設定は完成済み扱い。`ranking.ts` の `statusScore` と同じ規約）。 */
function statusOf(p: DeduplicablePattern): string {
	return String((p as unknown as { status?: string }).status ?? 'completed');
}

function pivotIdxsOf(p: DeduplicablePattern): number[] {
	return ((p as unknown as { pivots?: Array<{ idx: number }> }).pivots ?? []).map((v) => v.idx);
}

/**
 * 形成中 `double_top` と、同じ窓の完成済み経路の `double_top` の二重出力（issue #268 計測仕様 6）。
 *
 * #262 が解消した二重出力（旧 `tryFormingDoubleBottom` が完成済み経路と同じ構造を 2 本出していた）を
 * 別の形で再導入していないかの確認。`globalDedup` は**期間の 70% 重複**で同 type を畳み、
 * 勝者は statusScore（`completed` 3 > 未設定 2 > `forming` / `near_completion` 1）→ confidence →
 * `range.end` の新しさ。**`forming` と `near_completion` は同点**なので、畳まれても
 * どちらが残るかは confidence 次第になる。
 */
interface DualAgg {
	/** 形成中 top が accepted になったケースの延べ。 */
	formingCases: number;
	/** `status` → 同じ窓に並んだ完成済み経路の `double_top` の延べ。 */
	alongside: Map<string, number>;
	/** 主構成点（山1 / 谷）を 1 点以上共有する延べ。 */
	sharedAny: Map<string, number>;
	/** 主構成点（山1 / 谷）を 2 点とも共有する延べ。 */
	sharedBoth: Map<string, number>;
	/** `globalDedup` 後も形成中が残った / 畳まれた延べ。 */
	dedupKept: number;
	dedupDropped: number;
	/** 畳まれたときの勝者の status。 */
	dedupWinner: Map<string, number>;
	/**
	 * 形成中 × 同じ窓の完成済み経路の `double_top` の**ペア単位**の帰結（`status` → 件数）。
	 *
	 * **「形成中が残ったか」だけでは二重出力を判定できない。** `globalDedup` の勝者選択は
	 * statusScore（`forming` 1 > `invalid` / `expired` 0）なので、畳まれた場合でも**残るのは
	 * 形成中のほう**になりうる。利用者が 2 本受け取るのか 1 本なのかは、
	 * **ペアの両方が dedup を生き延びたか**で決まる。
	 */
	pairBoth: Map<string, number>;
	pairFormingOnly: Map<string, number>;
	pairOtherOnly: Map<string, number>;
	/** 明細（重複を畳んだもの）。 */
	samples: Set<string>;
}

const newDualAgg = (): DualAgg => ({
	formingCases: 0,
	alongside: new Map(),
	sharedAny: new Map(),
	sharedBoth: new Map(),
	dedupKept: 0,
	dedupDropped: 0,
	dedupWinner: new Map(),
	pairBoth: new Map(),
	pairFormingOnly: new Map(),
	pairOtherOnly: new Map(),
	samples: new Set(),
});

const inc = (m: Map<string, number>, k: string): void => {
	m.set(k, (m.get(k) ?? 0) + 1);
};

function feedDual(agg: DualAgg, spec: CaseSpec, patterns: readonly DeduplicablePattern[]): void {
	const formings = patterns.filter((p) => p.type === 'double_top' && statusOf(p) === 'forming');
	if (formings.length === 0) return;
	agg.formingCases += formings.length;

	// `globalDedup` は同 type / 期間 70% 重複で畳む。**double 以外の type とは畳まれない**
	// （`isSameCategory` は type 一致か wedge / triangle のカテゴリ一致のみ）ので、
	// double だけを渡しても `data.patterns` での可否と同じ答えになる。
	const doubles = patterns.filter((p) => p.type === 'double_top' || p.type === 'double_bottom');
	const deduped = globalDedup([...doubles]);
	const survived = new Set(deduped.map((p) => key(p)));

	const others = patterns.filter((p) => p.type === 'double_top' && statusOf(p) !== 'forming');
	for (const f of formings) {
		const fIdxs = pivotIdxsOf(f);
		const fSurvived = survived.has(key(f));
		for (const o of others) {
			const st = statusOf(o);
			inc(agg.alongside, st);
			const oIdxs = new Set(pivotIdxsOf(o));
			const shared = fIdxs.filter((i) => oIdxs.has(i));
			if (shared.length >= 1) inc(agg.sharedAny, st);
			if (shared.length >= 2) inc(agg.sharedBoth, st);
			// ペア単位の帰結（利用者が 2 本受け取るのか 1 本なのか）。
			const oSurvived = survived.has(key(o));
			if (fSurvived && oSurvived) inc(agg.pairBoth, st);
			else if (fSurvived) inc(agg.pairFormingOnly, st);
			else if (oSurvived) inc(agg.pairOtherOnly, st);
		}
	}

	for (const f of formings) {
		if (survived.has(key(f))) {
			agg.dedupKept++;
			continue;
		}
		agg.dedupDropped++;
		// 畳んだ相手（同 type で残った代表エントリ）の status を数える。
		const winner = deduped.find((p) => p.type === f.type);
		inc(agg.dedupWinner, winner ? statusOf(winner) : '(不明)');
	}

	const where = `${spec.series.name} / ${spec.tf} / sd=${spec.swingDepth ?? 'auto'} / end=${spec.windowEnd}`;
	agg.samples.add(
		`${where}: ${patterns
			.filter((p) => p.type === 'double_top' || p.type === 'double_bottom')
			.map((p) => `${p.type}:${statusOf(p)}[${pivotIdxsOf(p).join('-')}]`)
			.join(', ')}`,
	);
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
	const slice: Slice = {
		end: spec.windowEnd,
		forming: new Set(),
		nearCompletion: new Set(),
		terminal: new Set(),
		completed: new Set(),
	};
	for (const p of patterns) {
		if (p.type !== 'double_top' && p.type !== 'double_bottom') continue;
		const k = patternKey(p);
		if (!k) continue;
		const status = statusOf(p);
		if (status === 'forming') slice.forming.add(k);
		else if (status === 'near_completion') slice.nearCompletion.add(k);
		else if (status === 'expired' || status === 'invalid') slice.terminal.add(k);
		else slice.completed.add(k);
	}
	const arr = lanes.get(lane);
	if (arr) arr.push(slice);
	else lanes.set(lane, [slice]);
}

/**
 * §5 の追跡。ある構造が**初めて形成中として現れた窓より後**の窓でどうなったかを数える。
 *
 * 構造キーは `(type, 先頭 2 ピボットの idx)`。形成中 top の `pivots` は 山1 + 谷 の 2 点で、
 * 完成済み / `near_completion` の `pivots` は 山1 + 谷 + 山2 の 3 点なので、
 * **先頭 2 点で結べば同じ構造が追跡できる**（#262 §5 と同じ取り方）。
 * 同じ構造は複数の `swingDepth` レーンに出るので、レーンを OR で畳む。
 */
function followUp(
	lanes: Map<string, Slice[]>,
	type: string,
): { tracked: number; completed: number; near: number; terminal: number; neither: number } {
	const seen = new Map<string, { completed: boolean; near: boolean; terminal: boolean }>();
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
			const prev = seen.get(k) ?? { completed: false, near: false, terminal: false };
			for (const s of sorted) {
				if (s.end <= first) continue;
				if (s.completed.has(k)) prev.completed = true;
				if (s.nearCompletion.has(k)) prev.near = true;
				if (s.terminal.has(k)) prev.terminal = true;
			}
			seen.set(k, prev);
		}
	}
	let completed = 0;
	let near = 0;
	let terminal = 0;
	let neither = 0;
	for (const v of seen.values()) {
		// 優先順位を付けて 1 つに畳む（`completed` に至ったならそれが結論）。
		if (v.completed) completed++;
		else if (v.near) near++;
		else if (v.terminal) terminal++;
		else neither++;
	}
	return { tracked: seen.size, completed, near, terminal, neither };
}

/** 差分サンプル 1 行ぶんの `patterns` の要約（`type:status` の並び）。 */
function summarizePatterns(patterns: readonly DeduplicablePattern[]): string {
	if (patterns.length === 0) return '（0 件）';
	return patterns.map((p) => `${p.type}:${statusOf(p)}`).join(', ');
}

// ── main ──

/**
 * 全ビルドを組み、コーパスを 1 周して §0〜§8 を Markdown で標準出力へ書く。
 * `--json <path>` で accepted 候補の明細を、`--no-rolling` でローリング窓を外す。
 */
async function main(): Promise<void> {
	const argv = process.argv.slice(2);

	// `--emit <ablP|ablP+minDist> <path>`: ablation の `detect_doubles.ts` を書き出すだけで終わる。
	// **計測はしない。** 既存テストが動くかを見るために作業ツリーへ一時的に当てるとき、
	// 手で書き写して本計測と別物になるのを防ぐ（当てたら必ず `git checkout` で戻すこと）。
	const refAt = argv.indexOf('--strip-ref');
	// **#268 案 C 以降は `--strip-ref` が実質必須**（作業ツリーに `tryFormingDoubleTop` が無い）。
	// 既定を作業ツリーのままにしてあるのは、何を読んでいるかを明示的に選ばせるため——
	// 黙って別の ref を読むより、`requireFormingTopAnchors` が落ちて案内を出すほうがよい。
	const stripRef = refAt >= 0 ? argv[refAt + 1] : null;
	// **数字を 1 つも出す前に**アンカーの有無を確かめる（`--emit` も同じ差し替えを使うので前に置く）。
	requireFormingTopAnchors(stripRef);

	const emitAt = argv.indexOf('--emit');
	if (emitAt >= 0) {
		const variant = argv[emitAt + 1];
		const dest = argv[emitAt + 2];
		if (variant !== 'ablP' && variant !== 'ablP+minDist') {
			throw new Error(`--emit の variant は 'ablP' か 'ablP+minDist'（受け取った値: ${variant}）。`);
		}
		if (!dest) throw new Error('--emit には出力先パスが要る。');
		// 差し替え元は `--strip-ref` 側（無ければ作業ツリー）。本計測と同じソースを使う。
		const src = stripRef
			? execFileSync('git', ['show', `${stripRef}:tools/patterns/detect_doubles.ts`], { cwd: ROOT, encoding: 'utf8' })
			: readFileSync(join(ROOT, 'tools/patterns/detect_doubles.ts'), 'utf8');
		writeFileSync(dest, swapSearch(src, variant === 'ablP+minDist'));
		process.stdout.write(`${variant} の detect_doubles.ts を ${dest} に書き出した。\n`);
		return;
	}

	const jsonAt = argv.indexOf('--json');
	const jsonPath = jsonAt >= 0 ? argv[jsonAt + 1] : null;
	const includeRolling = !argv.includes('--no-rolling');
	const stripScope = stripRef ? verifyStripScope(stripRef) : [];
	const fromRef = stripRef ? { fromRef: stripRef } : {};

	const out: string[] = [];
	const say = (s = ''): void => {
		out.push(s);
	};

	const corpus = buildCorpus(includeRolling);
	const base = await loadBuild('base', { ...fromRef });
	const noTop = await loadBuild('noTop', { ...fromRef, disableTop: true });
	const ablP = await loadBuild('ablP', { ...fromRef, search: 'ablP' });
	const ablPmd = await loadBuild('ablPmd', { ...fromRef, search: 'ablP', minDistGate: true });
	// §0(a) の「展開ビルド ≡ 作業ツリー」で突き合わせる相手。strip を使っていないなら `base` が
	// そのまま作業ツリーの写しだが、`--strip-ref` を渡したときの `base` は**その ref** なので
	// 作業ツリーとは一致しない（#268 案 C 以降はこちらが常態）。別に作業ツリーのビルドを組む
	// ——これを怠ると「strip を渡すと §0 が必ず不一致で落ちる」ことになる（#262 版の `pr` と同じ役割）。
	const work = stripRef ? await loadBuild('work') : base;

	const aggBase = newAgg('現行 `tryFormingDoubleTop`', STAGES_BASE);
	const aggP = newAgg('ablP（谷を挟んで最新足と同水準の最初の確定山）', STAGES_ABL_P);
	const aggPmd = newAgg('ablP+minDist（中間構成点にも `minDist`）', STAGES_ABL_PMD);

	const dualP = newDualAgg();
	const dualPmd = newDualAgg();

	// §4 の目視判定に使う実体の代表 1 件（ビルド別）。
	const shapesP = new Map<string, ShapeRec>();
	const shapesPmd = new Map<string, ShapeRec>();

	// §5 の追跡用（ローリング窓のみ）。
	const lanesBase = new Map<string, Slice[]>();
	const lanesP = new Map<string, Slice[]>();
	const lanesPmd = new Map<string, Slice[]>();

	// §7 の cap 用（固定窓のみ）。
	const capRows: Array<{ corpus: string; base: number; ablP: number; ablPmd: number }> = [];

	// §8 の `data.patterns` 差分（`includeForming` 別）。
	const diffCases = new Map<string, { total: number; diffP: number; diffPmd: number }>();
	const diffSamples = new Set<string>();

	let mismatch = 0;
	let caseCount = 0;
	let formingCases = 0;

	for (const part of corpus) {
		for (const spec of part.cases) {
			caseCount++;
			// §0 検算: 展開した作業ツリービルド（`work`）が本物と全キーで一致するか（triple 込み）。
			const fullBase = runFull(base.detectTriples, base.detectDoubles, spec);
			const fullCheck = stripRef ? runFull(work.detectTriples, work.detectDoubles, spec) : fullBase;
			const fullWork = runFull(realDetectTriples, realDetectDoubles, spec);
			if (key(fullCheck.patterns) !== key(fullWork.patterns) || key(fullCheck.cands) !== key(fullWork.cands)) {
				mismatch++;
				if (mismatch <= 3) {
					say(
						`- ❌ 不一致: ${spec.series.name} / ${spec.tf} / sd=${spec.swingDepth ?? 'auto'} / end=${spec.windowEnd}`,
					);
				}
			}

			const bd = runDoubles(base, spec);
			const ct = runDoubles(noTop, spec);
			const rp = runDoubles(ablP, spec);
			const rpmd = runDoubles(ablPmd, spec);

			// 形成中 top 経路が積んだ候補を差分で同定する（名前ではなく対照ビルドで）。
			const barParams = base.getDoubleFormingBarParams(spec.tf);
			feed(aggBase, attributeToPath(bd.cands, ct.cands), spec, part.label, bd.patterns, barParams);
			feed(aggP, attributeToPath(rp.cands, ct.cands), spec, part.label, rp.patterns, barParams);
			feed(aggPmd, attributeToPath(rpmd.cands, ct.cands), spec, part.label, rpmd.patterns, barParams);

			if (spec.opts.includeForming) formingCases++;

			// §4: accepted な実体の代表 1 件を控える（目視判定の材料）。
			const collectShapes = (run: RunOut, into: Map<string, ShapeRec>): void => {
				for (const p of run.patterns) {
					if (p.type !== 'double_top' || statusOf(p) !== 'forming') continue;
					const idxs = pivotIdxsOf(p);
					if (idxs.length < 2) continue;
					const isos = idxs.map((i) => spec.series.candles[i]?.isoTime ?? `#${i}`);
					const ts = `${spec.tf}|${p.type}|${isos.join('-')}`;
					if (into.has(ts)) continue;
					const nl = (p as unknown as { neckline?: Array<{ y: number }> }).neckline;
					into.set(ts, {
						series: spec.series,
						tf: spec.tf,
						sd: String(spec.swingDepth ?? 'auto'),
						windowEnd: spec.windowEnd,
						type: p.type,
						// 山1 / 谷 / 暫定山2（= 最新足）。
						idxs: [idxs[0], idxs[1], spec.windowEnd],
						necklinePrice: nl && nl.length > 0 ? nl[0].y : Number.NaN,
					});
				}
			};
			collectShapes(rp, shapesP);
			collectShapes(rpmd, shapesPmd);

			// §6: 二重出力。
			feedDual(dualP, spec, rp.patterns);
			feedDual(dualPmd, spec, rpmd.patterns);

			// §7: cap への圧力（triple + double のみ。他の検出器を足すと更に増えるので下限）。
			if (!spec.rolling) {
				const triplesCands = fullBase.cands.slice(0, fullBase.cands.length - bd.cands.length);
				capRows.push({
					corpus: part.label,
					base: applyDebugCapCount([...triplesCands, ...bd.cands]),
					ablP: applyDebugCapCount([...triplesCands, ...rp.cands]),
					ablPmd: applyDebugCapCount([...triplesCands, ...rpmd.cands]),
				});
			}

			// §8: `data.patterns` の差分（検出器の出力段。`globalDedup` の前）。
			const bucket = spec.opts.includeForming ? 'includeForming: true' : 'includeForming: false（既定）';
			const c = diffCases.get(bucket) ?? { total: 0, diffP: 0, diffPmd: 0 };
			c.total++;
			const bk = key(bd.patterns);
			if (bk !== key(rp.patterns)) {
				c.diffP++;
				diffSamples.add(
					`${spec.series.name} / ${spec.tf} / sd=${spec.swingDepth ?? 'auto'} / end=${spec.windowEnd}` +
						` / ${bucket}: ${summarizePatterns(bd.patterns)} → ablP ${summarizePatterns(rp.patterns)}` +
						` → ablP+minDist ${summarizePatterns(rpmd.patterns)}`,
				);
			}
			if (bk !== key(rpmd.patterns)) c.diffPmd++;
			diffCases.set(bucket, c);

			// §5: ローリング窓の追跡用スライス。
			if (spec.rolling) {
				const lane = laneOf(spec);
				pushSlice(lanesBase, lane, spec, bd.patterns);
				pushSlice(lanesP, lane, spec, rp.patterns);
				pushSlice(lanesPmd, lane, spec, rpmd.patterns);
			}
		}
	}

	if (mismatch > 0) {
		throw new Error(
			`展開ビルド（${stripRef ? 'work' : 'base'}）が作業ツリーと ${mismatch} / ${caseCount} ケースで食い違った。計測は無効。`,
		);
	}

	// ── §0 ──
	const header: string[] = [];
	header.push('# 形成中 `double_top` の `formationBars` を「パターン長」で測る計測（issue #268 Phase 1）');
	header.push('');
	header.push(
		'**作業ツリーは 1 バイトも変更しない。** 本スクリプトは `tools/patterns/` を一時領域へ展開し、' +
			'`tryFormingDoubleTop` の**左の山の探索だけ**を差し替えたビルドを別に作って走らせるだけ。' +
			'閾値（`DOUBLE_LEVEL_MAX_PCT` / `getDoubleFormingBarParams` / `FORMING_*`）は 1 つも動かしていない。' +
			(stripRef
				? ` **検出器は \`${stripRef}\` から取っている**（#268 案 C で作業ツリーから ` +
					'`tryFormingDoubleTop` が削除されたため。アンカーの有無は起動時に確認済み）。'
				: ''),
	);
	header.push('');
	header.push('## 0. 検算');
	header.push('');
	header.push(
		stripRef
			? '**(a) 展開ビルド ≡ 作業ツリー**: `tools/patterns/` を一時領域へディレクトリごと展開し、' +
					'`detect_doubles.ts` の末尾に `export { … }` を 1 行足しただけの**作業ツリービルド**' +
					'（**`work`**）が、作業ツリーの本物と `patterns` / `debugCandidates` の JSON 全キーで' +
					'一致することを**全ケースで**確かめる。`base` は strip 側（下の (c)）なので比較相手にしない。'
			: '**(a) 展開ビルド ≡ 作業ツリー**: `tools/patterns/` を一時領域へディレクトリごと展開し、' +
					'`detect_doubles.ts` の末尾に `export { … }` を 1 行足しただけのビルド（**`base`**）が、' +
					'作業ツリーの本物と `patterns` / `debugCandidates` の JSON 全キーで一致することを**全ケースで**確かめる。',
	);
	header.push('');
	header.push(
		'**(b) 差し替えの範囲**: `ablP` は `tryFormingDoubleTop` の' +
			'「`lastConfirmedPeak` を取る行」から「`const valley = valleyAfterPeak;`」までを置き換えるだけで、' +
			`**それ以外は ${stripRef ? `\`${stripRef}\`` : '作業ツリー'} とバイト単位で同一**。` +
			'`ablP+minDist` はこれに加えて `ctx` の分割代入 1 行とゲート 1 ブロックだけを足す。' +
			'アンカーはすべて「ちょうど 1 回現れる」ことを差し替え前に確認しており、崩れたらその場で例外になる。' +
			(stripRef
				? ' strip ビルドは **`tools/patterns/` を 1 ファイルも残さず ref から取る**' +
					'（検出器 1 ファイルだけを差し替える組み方は、同ディレクトリの別ファイルを触った瞬間に' +
					'等価性が崩れるため。#268 案 C で広げた）。'
				: ''),
	);
	header.push('');
	header.push(
		`- ✅ ${caseCount} ケース全件で \`${stripRef ? 'work' : 'base'}\` ≡ 作業ツリー` +
			'（`patterns` / `debugCandidates` とも）',
	);
	header.push(`- うち \`includeForming: true\` は ${formingCases} ケース（形成中経路が呼ばれるのはここだけ）`);
	header.push(
		stripRef
			? `- **(c)** strip ビルド（\`--strip-ref ${stripRef}\`）が作業ツリーと違うファイル: ` +
					`${stripScope.length === 0 ? 'なし' : stripScope.map((f) => `\`${f}\``).join(' / ')}` +
					'（**strip はこのディレクトリを丸ごと ref から取る**ので、この一覧は「作業ツリーとの差分の申告」' +
					'であって等価性のゲートではない。ゲートとして残しているのはファイルの追加 / 削除だけ）'
			: '- strip ビルドは使っていない（作業ツリーがそのまま対照）',
	);
	header.push(`- 展開先: \`${TMP_DIR}\`（作業ツリーは 1 バイトも変更していない）`);
	header.push(
		'- 形成中の係数（展開ビルドから読んだ値）: ' +
			`\`DOUBLE_LEVEL_MAX_PCT\` = ${base.DOUBLE_LEVEL_MAX_PCT} / ` +
			`\`FORMING_PEAK_TOLERANCE_PCT\` = ${base.FORMING_PEAK_TOLERANCE_PCT} / ` +
			`\`FORMING_EXPIRY_BARS\` = ${base.FORMING_EXPIRY_BARS} / ` +
			`\`MIN_FORMING_COMPLETION\` = ${base.MIN_FORMING_COMPLETION}`,
	);
	header.push(
		'- 3 つの差し替えビルド（`noTop` / `ablP` / `ablP+minDist`）は、対照ビルドの候補列が ' +
			'`base` の**部分列**であることを毎ケース検算している（崩れたらその場で例外）。',
	);
	{
		const unmatched = [aggBase, aggP, aggPmd].map((a) => `${a.label} ${a.unmatchedAccepted}`).join(' / ');
		header.push(`- accepted な候補のうち対応する \`PatternEntry\` を引けなかった件数（0 であるべき）: ${unmatched}`);
	}
	header.push(
		'- **#158 の積み方**（1 回の呼び出しで積む候補は高々 1 件）: ' +
			[aggBase, aggP, aggPmd].map((a) => `${a.label} max ${a.maxPerCall}`).join(' / '),
	);
	header.push('');
	header.push('### 形成中 double が要求する形成バー数（`getDoubleFormingBarParams`）');
	header.push('');
	header.push(
		'`formationBars = 最新足の idx − 左の主構成点の idx` がこのレンジに入らないと ' +
			'`forming_bars_out_of_range` で落ちる。**日数（`MIN_PATTERN_DAYS` = ' +
			`${base.MIN_PATTERN_DAYS} 日 / \`MAX_FORMING_DAYS\` = 90 日）は由来の注記で、実効値はバー数**` +
			'（`patterns/bar-thresholds.ts` の clamp を通した値）。**`ablP` はこの式も閾値も変えない**——' +
			'変えるのは `leftPeak` の取り方だけで、その結果 `formationBars` の**意味**が「直近の山からの距離」から' +
			'「パターン長」に変わる。',
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
			'**構造の実体数を言うときは絶対時刻で畳む**（本メモの「実体」列）。' +
			'標準コーパスの「実データ A 96」は `btc_jpy_1day_2026` の同じ 90 本に `tf` ラベルを付け替えたもので、' +
			'時間足別の内訳は独立系列ではない（#178）。',
	);
	header.push('');
	out.unshift(...header);

	// ── §1 / §2 / §3 ──
	const sections: Array<{ n: string; title: string; agg: PathAgg; lead: string[] }> = [
		{
			n: '1',
			title: '`base`（現行 `tryFormingDoubleTop`）のファネル再現',
			agg: aggBase,
			lead: [
				'左の主構成点は `[...allPeaks].reverse().find((p) => p.idx < lastIdx - 2)` = **最新の確定山 1 つ**、',
				'谷はその山より後の**最初の**谷。ループが無いので 1 ケースにつき候補は 1 件しか積まれない',
				'——**この表はそのままファネルになる**。#262 Phase 1 §4 の数字が再現することを確かめる。',
			],
		},
		{
			n: '2',
			title: '`ablP`: 谷を挟んで最新足と同水準にある最初の確定山を左の山にする — **主指標**',
			agg: aggP,
			lead: [
				'確定山を新しい順に回し、`isSameLevel(current, peak, DOUBLE_LEVEL_MAX_PCT)` を満たす最初の山を',
				'左の山とする（形成中 triple と同じ流儀）。谷はその山と最新足の間の**最安値の谷**。',
				'**最新足より高い山を挟んで遡らない**（挟むと切り下がりを double_top と呼ぶことになる）。',
				'**探索以外は 1 バイトも変えていない**ので、`forming_peak_level_out_of_tolerance` と',
				'`forming_peaks_not_level` は探索が同水準を保証する結果**構造的に 0 件**になる。',
			],
		},
		{
			n: '3',
			title: '`ablP+minDist`: 中間構成点にも `minDist` を掛ける（issue #269）',
			agg: aggPmd,
			lead: [
				'`ablP` に、山1–谷 と 谷–最新足 の両方へ `ctx.minDist`（`minBarsBetweenSwings`）を掛けるゲートを',
				'構成点が揃った直後に足したビルド。完成済み経路が主構成点間に掛けているのと同じ値。',
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
			say(
				`\`forming_bars_out_of_range\` の内訳（全母集団）: **下限割れ ${s.agg.barsBelowMin} 件 / ` +
					`上限超え ${s.agg.barsAboveMax} 件**。\`formationBars\` は ${distLine(s.agg.formationBarsSamples)}。`,
			);
			say();
		}
		if (s.agg.acceptedFormationBars.length > 0) {
			say(
				`**accepted の \`formationBars\`**: ${distLine(s.agg.acceptedFormationBars)}` +
					`（延べ ${s.agg.acceptedFormationBars.length} 件）。`,
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

	// ── §3 の続き: #269 の間隔 ──
	say('## 3-x. 中間構成点の間隔（issue #269）');
	say();
	say(
		'`ablP` が組んだ候補の 山1–谷（`gap1`）と 谷–最新足（`gap2`）の間隔。**「隣接足」は間隔 1 本**で、' +
			'#262 Phase 1 §8-2 の基準 1（`forming` を「呼べない」と判定する最初の基準）そのもの。',
	);
	say();
	say(
		'| ビルド | 母数（構成点が揃った候補） | `gap1` = 1 本 | `gap2` = 1 本 | `gap1` < `minDist` | `gap2` < `minDist` | どちらか < `minDist` |',
	);
	say('|---|---:|---:|---:|---:|---:|---:|');
	for (const [label, g] of [
		['`ablP` 全候補', aggP.gapAll] as const,
		['`ablP` accepted', aggP.gapAccepted] as const,
		['`ablP+minDist` accepted', aggPmd.gapAccepted] as const,
	]) {
		say(
			`| ${label} | ${g.assembled} | ${g.gap1IsAdjacent} | ${g.gap2IsAdjacent} | ` +
				`${g.gap1BelowMinDist} | ${g.gap2BelowMinDist} | ${g.eitherBelowMinDist} |`,
		);
	}
	say();
	say(
		`\`gap1\` の分布（\`ablP\` 全候補）: ${distLine(aggP.gapAll.gap1Samples)} / ` +
			`\`gap2\`: ${distLine(aggP.gapAll.gap2Samples)}。`,
	);
	say(
		`\`gap1\` の分布（\`ablP\` accepted）: ${distLine(aggP.gapAccepted.gap1Samples)} / ` +
			`\`gap2\`: ${distLine(aggP.gapAccepted.gap2Samples)}。`,
	);
	say();

	// ── §4 明細と目視判定 ──
	say('## 4. accepted になった実体の明細と 3 値判定');
	say();
	say(
		'判定は #262 Phase 1 §8-2 の 5 段を順に当て、最初に当たったものを採る（1: 中間構成点が第1構成点の' +
			'隣接足 / 2: 第2構成点以降に外側の極値を超えた / 3: 深さ < 0.5% / 4: 深さ ≥ 1.0% かつ第2構成点以降に' +
			'ネックラインを抜けた / 5: それ以外は保留）。使う量は構成点の終値・極値と区間の最高安値だけで、' +
			'**検出器も閾値も通していない。**',
	);
	say();
	say(
		'⚠️ **形成中 top では第2構成点が最新足そのもの**なので、基準 2 / 4 の走査区間（第2構成点の次の足から' +
			'窓の終端まで）は**定義上空**になる。したがって本判定で出る値は「呼べない（基準 1 / 3）」か「保留」だけで、' +
			'**「呼べる」は構造的に出ない。** 形が実際に M になったかを見るには窓の先を見るしかないので、' +
			`後続 ${LOOKAHEAD_BARS} 本まで走査を伸ばした補助判定を併記する（**検出器には見えない情報**なので、` +
			'決定の根拠にするときはその旨を明示すること）。',
	);
	say();

	const judgeSection = (label: string, shapes: Map<string, ShapeRec>): void => {
		say(`### 4-${label === 'ablP' ? '1' : '2'}. \`${label}\``);
		say();
		if (shapes.size === 0) {
			say('accepted な実体は **0 件**。判定するものが無い。');
			say();
			return;
		}
		say(`実体 **${shapes.size} 件**。`);
		say();
		const MAX_ROWS = 60;
		say(
			'| # | 実体（時間足 / 山1 - 谷 の絶対時刻） | 系列 / sd / 終端 | 山1 終値 | 谷 終値 | 現値 | 現値 − 山1 | 最新足の高値 > 山1 の高値 | `gap1` | `gap2` | 深さ | 判定 | 根拠 | 後続を見た判定 |',
		);
		say('|---:|---|---|---:|---:|---:|---:|---|---:|---:|---:|---|---|---|');
		const tally = new Map<string, number>();
		const tallyLa = new Map<string, number>();
		let i = 0;
		for (const [ts, rec] of shapes) {
			i++;
			const j = judgeShape(rec, rec.windowEnd);
			const laEnd = Math.min(rec.series.candles.length - 1, rec.windowEnd + LOOKAHEAD_BARS);
			const la = judgeShape(rec, laEnd);
			inc(tally, j.verdict);
			inc(tallyLa, la.verdict);
			if (i > MAX_ROWS) continue;
			const cd = rec.series.candles;
			const closeAt = (k: number): number => Number(cd[k]?.close ?? NaN);
			// 「暫定の山2（＝最新足）が山1 を上回っているか」。上回っていれば、値動きとしては
			// 天井の 2 山目ではなく**上昇の途中**を切り取っている疑いが強い（#262 §8 の形 08 と同じ）。
			const overPct = (closeAt(rec.windowEnd) - closeAt(rec.idxs[0])) / Math.max(1, closeAt(rec.idxs[0]));
			const highNow = Number(cd[rec.windowEnd]?.high ?? NaN);
			const highPeak1 = Number(cd[rec.idxs[0]]?.high ?? NaN);
			say(
				`| ${i} | \`${mdCell(ts)}\` | ${rec.series.name} / sd=${rec.sd} / end=${rec.windowEnd} | ` +
					`${yen(closeAt(rec.idxs[0]))} | ${yen(closeAt(rec.idxs[1]))} | ${yen(closeAt(rec.windowEnd))} | ` +
					`${overPct >= 0 ? '+' : ''}${(overPct * 100).toFixed(3)}% | ` +
					`${highNow > highPeak1 ? `**✅ 超えている**（${yen(highNow)} > ${yen(highPeak1)}）` : '—'} | ` +
					`${j.gapBars} | ${j.gap2Bars} | ${(j.depthPct * 100).toFixed(3)}% | **${j.verdict}** | ${j.basis} | ` +
					`${la.verdict}（${la.basis}、+${laEnd - rec.windowEnd} 本） |`,
			);
		}
		say();
		if (shapes.size > MAX_ROWS) {
			say(`（先頭 ${MAX_ROWS} 件のみ。全件は \`--json\` 側に出る）`);
			say();
		}
		say(
			`集計（本判定）: ${[...tally.entries()]
				.sort()
				.map(([v, c]) => `**${v} ${c}**`)
				.join(' / ')}（計 ${shapes.size} 実体）`,
		);
		say();
		say(
			`集計（後続 ${LOOKAHEAD_BARS} 本を見た補助判定）: ${[...tallyLa.entries()]
				.sort()
				.map(([v, c]) => `**${v} ${c}**`)
				.join(' / ')}`,
		);
		say();
		say('構成点の idx（フィクスチャを直接引くための検算用）:');
		say();
		say('| # | 系列 | tf | sd | 終端 idx | 山1 idx | 谷 idx | ネックライン |');
		say('|---:|---|---|---|---:|---:|---:|---:|');
		let k = 0;
		for (const [, rec] of shapes) {
			k++;
			if (k > MAX_ROWS) break;
			say(
				`| ${k} | ${rec.series.name} | ${rec.tf} | ${rec.sd} | ${rec.windowEnd} | ${rec.idxs[0]} | ${rec.idxs[1]} | ` +
					`${Number.isFinite(rec.necklinePrice) ? yen(rec.necklinePrice) : '—'} |`,
			);
		}
		say();
	};
	judgeSection('ablP', shapesP);
	judgeSection('ablP+minDist', shapesPmd);

	// ── §5 追跡 ──
	say('## 5. ローリング窓での追跡（accepted になった構造のその後）');
	say();
	if (!includeRolling) {
		say('`--no-rolling` で実行したので追跡はしていない。');
		say();
	} else {
		say(
			'先頭固定・終端を 1 本ずつ動かす窓なので、ピボットの idx が窓をまたいで安定する。' +
				'ある構造が**初めて形成中として現れた窓より後**の窓で、`completed` / `near_completion` / ' +
				'終端 status（`expired` / `invalid`）のどれになったかを数える（複数当たったら左の優先順で 1 つに畳む）。' +
				'構造キーは `(type, 先頭 2 ピボットの idx)` なので、形成中（2 点）と完成済み（3 点）が同じ構造として結べる。' +
				'同じ構造は複数の `swingDepth` レーンに出るので、レーンを OR で畳む。',
		);
		say();
		say(
			'| ビルド | 追跡できた構造 | その後 completed | その後 near_completion | その後 終端 status | どれにもならず |',
		);
		say('|---|---:|---:|---:|---:|---:|');
		for (const [label, lanes] of [
			['`base`（現行）', lanesBase] as const,
			['`ablP`', lanesP] as const,
			['`ablP+minDist`', lanesPmd] as const,
		]) {
			const f = followUp(lanes, 'double_top');
			say(`| ${label} | ${f.tracked} | ${f.completed} | ${f.near} | ${f.terminal} | ${f.neither} |`);
		}
		say();
	}

	// ── §6 二重出力 ──
	say('## 6. 完成済み経路 / `near_completion` との二重出力');
	say();
	say(
		'`ablP` が拾う「2 つ目の山を作っている途中」と、同じ窓の完成済み経路の `double_top`' +
			'（`near_completion` / `completed` / `expired` / `invalid`）が並ぶかを数える。' +
			'#262 が解消した二重出力を別の形で再導入していないかの確認（issue #268 計測仕様 6）。',
	);
	say();
	say(
		'`globalDedup` は**期間の 70% 重複**で同 type を畳み、勝者は statusScore' +
			'（`completed` 3 > 未設定 2 > `forming` / `near_completion` 1）→ confidence → `range.end` の新しさ。' +
			'**`forming` と `near_completion` は同点**なので、畳まれてもどちらが残るかは confidence 次第になる。',
	);
	say();
	for (const [label, agg] of [['`ablP`', dualP] as const, ['`ablP+minDist`', dualPmd] as const]) {
		say(`### 6-${label === '`ablP`' ? '1' : '2'}. ${label}`);
		say();
		if (agg.formingCases === 0) {
			say('形成中 `double_top` が 1 件も出ないので二重出力は起きない。');
			say();
			continue;
		}
		say(`形成中 \`double_top\` の accepted は延べ **${agg.formingCases}** 件。`);
		say();
		say('| 同じ窓に並んだ完成済み経路の status | 延べ | うち主構成点を 1 点以上共有 | うち 2 点とも共有 |');
		say('|---|---:|---:|---:|');
		const statuses = [...new Set(agg.alongside.keys())].sort();
		for (const st of statuses) {
			say(
				`| \`${st}\` | ${agg.alongside.get(st) ?? 0} | ${agg.sharedAny.get(st) ?? 0} | ` +
					`${agg.sharedBoth.get(st) ?? 0} |`,
			);
		}
		if (statuses.length === 0) say('| （並んだものは無い） | 0 | 0 | 0 |');
		say();
		say(
			'**利用者が 2 本受け取るか 1 本か**は、そのペアの両方が `globalDedup` を生き延びたかで決まる' +
				'（形成中が残ったかだけでは判定できない——statusScore は `forming` 1 > `invalid` / `expired` 0 なので、' +
				'畳まれたときに**残るのが形成中のほう**でありうる）。',
		);
		say();
		say('| ペアの相手の status | 両方残る（**二重出力**） | 形成中だけ残る | 相手だけ残る |');
		say('|---|---:|---:|---:|');
		for (const st of statuses) {
			say(
				`| \`${st}\` | ${agg.pairBoth.get(st) ?? 0} | ${agg.pairFormingOnly.get(st) ?? 0} | ` +
					`${agg.pairOtherOnly.get(st) ?? 0} |`,
			);
		}
		if (statuses.length === 0) say('| （ペアが無い） | 0 | 0 | 0 |');
		say();
		say(
			`\`globalDedup\` 後: 形成中が**残った ${agg.dedupKept} 件 / 畳まれた ${agg.dedupDropped} 件**。` +
				(agg.dedupWinner.size > 0
					? `畳まれたときに残った代表の status: ${[...agg.dedupWinner.entries()]
							.sort()
							.map(([k, v]) => `\`${k}\` ${v}`)
							.join(' / ')}。`
					: ''),
		);
		say();
		const samples = [...agg.samples];
		if (samples.length > 0) {
			say(`形成中が出たケースの \`double_*\` 一覧（重複を畳んで ${samples.length} 行。先頭 40 行）:`);
			say();
			for (const line of samples.slice(0, 40)) say(`- ${line}`);
			say();
		}
	}

	// ── §7 cap ──
	say('## 7. `view=debug` の cap への影響');
	say();
	say(
		'`detect_patterns.ts` の並べ替え（accepted → 型間排他の棄却 → 検出器の棄却）を再現し、' +
			`**triple + double だけ**で候補総数を数えた（他の検出器を足すと更に増えるので、これは下限）。cap は ${DEBUG_CAP}。` +
			'ローリング窓は同じ系列の窓違いなので、この節では固定窓のケースだけを使う。',
	);
	say();
	say(
		'**`ablP` は探索が広がるが、積む候補は 1 呼び出しにつき高々 1 件のまま**（ループの中では 1 件も積まず、' +
			'探索が終わってから組めなかった理由を 1 件だけ積む）。§0 の「#158 の積み方」の実測がそれを示す。',
	);
	say();
	say(
		'| 母集団 | ケース | 候補総数 p50 base → ablP → +minDist | max base → ablP → +minDist | cap 超過 base → ablP → +minDist |',
	);
	say('|---|---:|---|---|---|');
	for (const part of corpus) {
		const rs = capRows.filter((r) => r.corpus === part.label);
		if (rs.length === 0) continue;
		const bs = rs.map((r) => r.base).sort((a, b) => a - b);
		const ps = rs.map((r) => r.ablP).sort((a, b) => a - b);
		const ms = rs.map((r) => r.ablPmd).sort((a, b) => a - b);
		say(
			`| ${part.label} | ${rs.length} | ${quantile(bs, 0.5)} → ${quantile(ps, 0.5)} → ${quantile(ms, 0.5)} | ` +
				`${bs[bs.length - 1]} → ${ps[ps.length - 1]} → ${ms[ms.length - 1]} | ` +
				`${rs.filter((r) => r.base > DEBUG_CAP).length} → ${rs.filter((r) => r.ablP > DEBUG_CAP).length} → ` +
				`${rs.filter((r) => r.ablPmd > DEBUG_CAP).length} |`,
		);
	}
	say();

	// ── §8 data.patterns 差分 ──
	say('## 8. `data.patterns` の差分');
	say();
	say('`detectDoubles` の出力段（`globalDedup` の前）で base と食い違ったケース数。');
	say();
	say('| `includeForming` | ケース | `ablP` で差 | `ablP+minDist` で差 |');
	say('|---|---:|---:|---:|');
	for (const [k, v] of [...diffCases.entries()].sort()) {
		say(`| ${k} | ${v.total} | ${v.diffP} | ${v.diffPmd} |`);
	}
	say();
	{
		const samples = [...diffSamples];
		const synthetic = samples.filter((s) => !s.startsWith('btc_jpy_'));
		say(
			`食い違ったケース（重複を畳んで ${samples.length} 行。うち合成フィクスチャ ${synthetic.length} 行）。` +
				'**合成フィクスチャの行は #158 / #169 のテスト期待値が動きうる箇所**なので全部出す:',
		);
		say();
		if (synthetic.length > 0) {
			for (const line of synthetic.slice(0, 80)) say(`- ${line}`);
			if (synthetic.length > 80) say(`- （合成はここまでで ${synthetic.length - 80} 行省略）`);
			say();
		}
		const real = samples.filter((s) => s.startsWith('btc_jpy_'));
		if (real.length > 0) {
			say(`実データ側（先頭 40 行 / 全 ${real.length} 行）:`);
			say();
			for (const line of real.slice(0, 40)) say(`- ${line}`);
		}
	}

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
					acceptedBase: aggBase.acceptedRecs,
					acceptedAblP: aggP.acceptedRecs.slice(0, 2000),
					acceptedAblPMinDist: aggPmd.acceptedRecs.slice(0, 2000),
					shapesAblP: [...shapesP.entries()].map(([ts, r]) => ({
						ts,
						series: r.series.name,
						tf: r.tf,
						sd: r.sd,
						windowEnd: r.windowEnd,
						idxs: r.idxs,
						necklinePrice: r.necklinePrice,
					})),
					shapesAblPMinDist: [...shapesPmd.entries()].map(([ts, r]) => ({
						ts,
						series: r.series.name,
						tf: r.tf,
						sd: r.sd,
						windowEnd: r.windowEnd,
						idxs: r.idxs,
						necklinePrice: r.necklinePrice,
					})),
					diffSamples: [...diffSamples],
				},
				null,
				2,
			)}\n`,
		);
	}
}

main().catch((e) => {
	process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
	process.exit(1);
});
