/**
 * Triple Top / Triple Bottom 検出（完成済み＋形成中）
 * detect_patterns.ts Section 6 / 6b から抽出
 */
import { generatePatternDiagram, type PatternDiagramData } from '../../lib/pattern-diagrams.js';
import { MIN_CONFIDENCE } from '../patterns/config.js';
import { patternBarRange } from './bar-thresholds.js';
import { finalizeConf, periodScoreBars } from './helpers.js';
import { clamp01, relDev } from './regression.js';
import { applyReversalGate, buildStructureGate } from './reversal-gate.js';
import { averageDefinedAxes, breakoutQualityScore, retracementScore } from './scoring.js';
import {
	levelSpreadDetailsFrom,
	levelSpreadMetrics,
	necklineSideDetailsFrom,
	type ReversalSide,
	validateLevelSpread,
	validateMainPointsNecklineSide,
	validatePatternSize,
} from './structural.js';
import type { Pivot } from './swing.js';
import type { CandleData, DeduplicablePattern, DetectContext, DetectResult, PatternScoreBreakdown } from './types.js';
import { pushCand } from './types.js';

// ── 定数 ──

/**
 * ネックライン（triple_top なら 2 谷、triple_bottom なら 2 山）の傾きの上限。
 * **完成済み 4 経路（strict / relaxed × top / bottom）すべてで共通**、かつ
 * **ネックライン構成 2 点に掛かる唯一の水平性の閾値**（issue #186）。
 *
 * #186 以前は strict だけが同じ 2 点を `tolerancePct` でも測っていた（`valleysNear` /
 * `peaksNear`）。**分子も分母も本定数の判定式と完全に同一**で閾値だけが違ったため、
 * 実効的な上限は `min(tolerancePct, NECKLINE_SLOPE_LIMIT)`。`tolerancePct` の時間軸オートは
 * すべて 0.03 以上（`getDefaultToleranceForTf`）で本定数より緩いので、**既定パスでは常に
 * 本定数が律速**し、`tolerancePct` は棄却理由コードのラベルを分けているだけだった。
 * 「`valleys_not_equal` なら `tolerancePct` を緩めれば通る」と読めてしまい、実際には通らない
 * （本定数が先に効くのでコード名が `neckline_slope_excess` に変わるだけ）ため削除した。
 *
 * その結果、**`tolerancePct` を 0.02 未満で明示したときだけ判定が緩む**
 * （旧: `min(tolerancePct, 0.02)` → 新: `0.02`）。スキーマは `min(0)` なので指定自体は可能だが、
 * 時間軸オートでは到達しない。ガードは `tests/patterns/detect_triples.test.ts`。
 *
 * **完成済みトリプルに残る価格水準基準の固定閾値はこれだけ**（#178 項目 2 で `MAX_VALLEY_SPREAD`
 * を削除した）。主構成点（3 山 / 3 谷）のばらつきは `tolerancePct` と、高さで正規化した
 * `MAX_LEVEL_SPREAD_RATIO`（`patterns/structural.ts`）が受け持つ。
 */
const NECKLINE_SLOPE_LIMIT = 0.02;
/**
 * 形成中トリプルトップ / ボトムの形成期間の日数由来。**実効値はバー数**で、
 * `getTripleFormingBarParams` が `patterns/bar-thresholds.ts` の換算を通して決める。
 * ここの日数は「その値がどこから来たか」を示す注記であって、暦日数の要件ではない。
 */
export const FORMING_MIN_DAYS = 21;
const FORMING_MAX_DAYS = 90;

const FORMING_TOLERANCE_MULTIPLIER = 1.2;
/**
 * 形成中 Triple Top / Bottom の完成度の下限。
 *
 * **top 側では到達しない。** `completion = min(1, 0.66 + min(1, currentPrice / avgPeakPrice) * 0.34)`
 * で価格は正なので `progress > 0`、つまり `completion > 0.66` になり 0.4 を下回れない
 * （#155 の `detect_hs.ts` `FORMING_MIN_COMPLETION` と同じ事情）。重み側（0.66 / 0.34）を
 * 触ったときに効き始めるガードとして残してある。
 *
 * **bottom 側は到達する。** あちらの `progress` は
 * `(currentPrice - avgValleyPrice) / (avgPeakPrice - avgValleyPrice)` で**負を取りうる**
 * （現在値が谷水準をわずかに下回るケース）。山と谷の差が小さい浅いパターンでは
 * `progress < -0.7647` になり `completion < 0.4` に落ちる。
 *
 * `patterns/min-bars.ts` と同じく、到達性テストが参照するため export する。
 */
export const FORMING_MIN_COMPLETION = 0.4;
const FORMING_MIN_CONFIDENCE = 0.5;
// 形成中トリプル: 3 点目が現在価格で暫定のため、完成済みより上限を厳しくする。
// confidence < 0.6（detectPatternsViewsHandler の低信頼ラベル境界）に抑え、
// 「標準的な形状（0.7-0.8）」として扱われないようにする。
const FORMING_MAX_CONFIDENCE = 0.59;
// 形成中トリプル: 3 山（peak1, peak2, 現在価格）/ 3 谷の max-min 水平性チェック。
// tripleTolerancePct（既定 4.8% = 0.04 × 1.2）と揃え、階段状の切り上がり/切り下がりを弾く。
// 完成済みは 3 山すべてに near() が掛かるため、forming でも同等の制約を入れる。
const FORMING_LEVEL_SPREAD_FACTOR = 1.0; // tripleTolerancePct × 1.0
// 形成中トリプル: ネックライン構成点（peak3 用の 2 谷 / valley3 用の 2 山）の水平性。
// tolerancePct × FACTOR。
//
// **完成済み側の対応物は固定値 `NECKLINE_SLOPE_LIMIT`（2%）の 1 段だけ**（#186 で
// `tolerancePct` の同水準判定 `valleysNear` / `peaksNear` を削除した——同じ式を 2 回測って
// 別の名前を付けていただけだった）。forming はそちらを使わず `tolerancePct` 基準にする
// （既定 4%）。3 点目が現在足で暫定であるぶんノイズが残り、固定 2% まで要求すると
// 形成中に拾えないため。
//
// #178 項目 2 以前はここに「完成済みは 1.5%（`MAX_VALLEY_SPREAD`）と非常に厳しい」と
// 書いてあったが、**あの定数が見ていたのはネックラインではなく triple_bottom の 3 谷**で、
// 本 FACTOR の対応物ではなかった。3 点側の対応物は `FORMING_LEVEL_SPREAD_FACTOR` で、
// 完成済み側は `tolerancePct` の `nearAll` と高さ相対の `validateLevelSpread` の 2 段。
const FORMING_NECKLINE_SPREAD_FACTOR = 1.0; // tolerancePct × 1.0
// 形成中トリプル: 完全に単調な切り上がり / 切り下がり（peak1 < peak2 < current 等）
// は triple ではなく上昇継続 / 下降継続として扱うため、累積ステップがこれを超えると弾く。
const FORMING_STAIR_STEP_LIMIT = 0.02;
// ネックラインブレイク判定（detect_doubles と同じ値）
const BREAKOUT_BUFFER_PCT = 0.015;
const MAX_BARS_FROM_EXTREMUM = 20;

/**
 * 形成中トリプルが要求する形成バー数のレンジ（`formationBars = lastIdx - 最初のピボット`）。
 *
 * 旧実装は `patternDays = Math.round(formationBars × daysPerBar)` を作って 21〜90 日で
 * 判定していたため、`1hour` では 492 本、`1min` では 29520 本の形成を要求し、
 * `limit` のスキーマ上限（365）でも到達不能だった（issue #118 問題 2）。
 *
 * `patterns/min-bars.ts` が「時間足 → 最小要求バー数」を導出するのに参照するため export する。
 */
export function getTripleFormingBarParams(tf: string): { minBars: number; maxBars: number } {
	return patternBarRange(tf, FORMING_MIN_DAYS, FORMING_MAX_DAYS);
}

type Pcand = (arg: Parameters<typeof pushCand>[1]) => void;

/**
 * 同水準判定で落ちた候補の診断値（issue #138）。計測値の整形は
 * {@link levelSpreadDetailsFrom}（`structural.ts`。double と共有）。
 *
 * 本ラッパは計測前の呼び出し側用で、triple の `levelTolerancePct` は strict では
 * `tolerancePct`、relaxed では `tolerancePct × factor`。
 */
function levelSpreadDetails(
	mainPoints: ReadonlyArray<Pivot>,
	allPoints: ReadonlyArray<Pivot | null>,
	levelTolerancePct: number,
): Record<string, unknown> {
	return levelSpreadDetailsFrom(levelSpreadMetrics(mainPoints, allPoints), levelTolerancePct);
}

// ── Helper: ネックラインブレイクインデックスを検出 ──
// detect_doubles.ts と同じロジック（終値ベース、1.5% バッファ、20 バーまで）

function findBreakoutIdx(
	candles: CandleData[],
	afterIdx: number,
	necklinePrice: number,
	direction: 'below' | 'above',
): number {
	const end = Math.min(afterIdx + MAX_BARS_FROM_EXTREMUM + 1, candles.length);
	for (let k = afterIdx + 1; k < end; k++) {
		const closeK = Number(candles[k]?.close ?? NaN);
		if (!Number.isFinite(closeK)) continue;
		if (direction === 'below' && closeK < necklinePrice * (1 - BREAKOUT_BUFFER_PCT)) return k;
		if (direction === 'above' && closeK > necklinePrice * (1 + BREAKOUT_BUFFER_PCT)) return k;
	}
	return -1;
}

/**
 * 完成済みトリプルの整合度サブスコア（issue #199 候補 1）。
 *
 * 旧実装は `(tolMargin + symmetry + per) / 3`。**`symmetry` は
 * `1 − relDev(最小の構成点, 最大の構成点)` という恒等式**で、`tolMargin` が既に使っている
 * 3 つの pairwise relDev のうち最大のものを、許容幅で正規化せずに足し直しているだけだった
 * （新しい情報が無い）。Phase 1（PR #203）の実測では 109 サンプル全件で 0.9752〜0.9997 に
 * 収まり、confidence の起伏にほぼ寄与していない。
 *
 * `detect_doubles.ts` の `buildDoubleScore` と**同じ 4 軸構成**にする。ただし
 * **double とは逆に、捨てるのは `symmetry` で `tolMargin`（= `levelMargin`）を残す**:
 *
 * | 軸 | Phase 1 の実測レンジ | 判断 |
 * |---|---|---|
 * | `tolMargin`（3 ペアの relDev 平均を許容幅で正規化） | 0.586〜0.996 | **残す**——唯一レンジを持つ |
 * | `symmetry`（= 1 − 最大 relDev） | 0.9752〜0.9997 | **捨てる**——ほぼ定数 |
 *
 * double が `symmetry` 側を残したのは、あちらが 2 点しか無く「2 点の relDev そのもの」で
 * 情報が同じだったため。triple の `tolMargin` は 3 ペアの平均なので中間点の情報も拾っている。
 *
 * **`duration` は triple だけ `periodScoreBars`（バー数基準）で計算する**（issue #199 候補 2）。
 * `double` / H&S は `periodScoreDays`（暦日基準）のまま——**同じ `scoreComponents.duration` が
 * type によって別の基準で計算される。** triple だけ移したのは、暦日版の `per` が triple でのみ
 * 実質定数（#203 Phase 1 で 109/109 が 0.6）で、`double` / H&S では 4 値すべてが出るため。
 * バケット境界の根拠は `periodScoreBars` の docstring と
 * `docs/internal/triple-period-score-bars-199.md`。
 */
function buildTripleScore(opts: {
	/** 主構成点 3 点の `price`（top なら 3 山、bottom なら 3 谷。並び順は結果に影響しない） */
	points: readonly [number, number, number];
	/** 同水準判定に使ったのと同じ許容幅。strict は `tolerancePct`、relaxed は `tolerancePct × factor` */
	levelTolerancePct: number;
	necklinePrice: number;
	/** ブレイク足の終値。**未ブレイク（`near_completion`）では `NaN`** を渡す */
	breakoutClose: number;
	side: ReversalSide;
	retracementRatio?: number;
	durationScore: number;
}): { components: PatternScoreBreakdown; base: number } {
	const [p1, p2, p3] = opts.points;
	const devs = [relDev(p1, p2), relDev(p2, p3), relDev(p1, p3)];
	const levelMargin = clamp01(
		1 - devs.reduce((s, v) => s + v, 0) / devs.length / Math.max(1e-12, opts.levelTolerancePct),
	);
	const retracement = retracementScore(opts.retracementRatio);
	// パターン高さは double と同じ「主構成点の平均とネックラインの距離」。
	// triple なので平均は 3 点（double は 2 点）。
	const avgLevel = (p1 + p2 + p3) / 3;
	const patternHeight = opts.side === 'bottom' ? opts.necklinePrice - avgLevel : avgLevel - opts.necklinePrice;
	const breakoutQuality = breakoutQualityScore(opts.necklinePrice, opts.breakoutClose, patternHeight, opts.side);
	const components: PatternScoreBreakdown = {
		levelMargin: Number(levelMargin.toFixed(4)),
		...(retracement !== undefined ? { retracement: Number(retracement.toFixed(4)) } : {}),
		...(breakoutQuality !== undefined ? { breakoutQuality: Number(breakoutQuality.toFixed(4)) } : {}),
		duration: Number(opts.durationScore.toFixed(4)),
	};
	// 算出できなかった軸は平均から外す（0 として混ぜると欠測が減点になる）。
	// `levelMargin` は常に数値なので `averageDefinedAxes` が `undefined` を返すことはない。
	const base = averageDefinedAxes([levelMargin, retracement, breakoutQuality, opts.durationScore]) ?? levelMargin;
	return { components, base };
}

// ── Helper: Strict Triple Top ──

function findStrictTripleTop(ctx: DetectContext): DeduplicablePattern[] {
	const { candles, pivots, allValleys, tolerancePct, minDist, near } = ctx;
	const pcand: Pcand = (arg) => pushCand(ctx, arg);
	const patterns: DeduplicablePattern[] = [];
	const highsOnly = pivots.filter((p) => p.kind === 'H');
	if (highsOnly.length < 3) return patterns;

	for (let i = 0; i <= highsOnly.length - 3; i++) {
		const a = highsOnly[i],
			b = highsOnly[i + 1],
			c = highsOnly[i + 2];
		if (b.idx - a.idx < minDist || c.idx - b.idx < minDist) continue;

		// 谷の探索を同水準判定より**前**に出してある（issue #138）。**判定順は変えていない**
		// （`three_peaks_not_level` → `valleys_missing` の順で棄却する）。先に引くのは、
		// 3 山が同水準でないときの棄却エントリにパターン高さ（5 点の全振幅）を載せるため。
		const v1cands = allValleys.filter((v: { idx: number }) => v.idx > a.idx && v.idx < b.idx);
		const v2cands = allValleys.filter((v: { idx: number }) => v.idx > b.idx && v.idx < c.idx);
		const v1 = v1cands.length ? v1cands.reduce((m, v) => (v.price < m.price ? v : m)) : null;
		const v2 = v2cands.length ? v2cands.reduce((m, v) => (v.price < m.price ? v : m)) : null;

		const nearAll = near(a.price, b.price) && near(b.price, c.price) && near(a.price, c.price);
		if (!nearAll) {
			// issue #138: ここは #174 以前の relaxed 肩落ちと同じ「無音の continue」だった。
			// 新しい高さ相対ゲートの計測にも、この段で何件落ちているかの baseline が要る。
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'three_peaks_not_level',
				idxs: [a.idx, b.idx, c.idx],
				details: levelSpreadDetails([a, b, c], [a, v1, b, v2, c], tolerancePct),
			});
			continue;
		}
		const start = candles[a.idx].isoTime;
		const structureEnd = candles[c.idx].isoTime;
		if (!(start && structureEnd)) continue;

		// Additional strict checks: valleys equality and neckline slope
		if (!(v1 && v2)) {
			pcand({ type: 'triple_top', accepted: false, reason: 'valleys_missing', idxs: [a.idx, b.idx, c.idx] });
			continue;
		}
		// ネックライン（2 谷）の水平性は {@link NECKLINE_SLOPE_LIMIT} の 1 本だけで測る（issue #186）。
		// #186 以前はここに `tolerancePct` 基準の `valleysNear` が並んでいたが、**判定式が
		// 分子・分母とも下の `necklineSlope` と完全に同一**で閾値だけが違い、既定の
		// `tolerancePct`（時間軸オートは最小でも 0.03）は本定数より緩いので常に本定数が律速していた。
		// 棄却理由 `valleys_not_equal` は「`tolerancePct` を緩めれば通る」と読めるが実際には通らず、
		// **間違ったつまみを指していた**ため理由コードごと削除した。
		const necklineSlope = Math.abs(v1.price - v2.price) / Math.max(1, Math.max(v1.price, v2.price));
		if (necklineSlope > NECKLINE_SLOPE_LIMIT) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'neckline_slope_excess',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}
		// **整合度の算出とゲートはブレイク検出の後**（issue #199 候補 1）。`breakoutQuality` 軸が
		// ブレイク足の終値を要るため。理由の帰属が変わる点は {@link buildTripleScore} の
		// 呼び出し側コメントを参照。

		// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
		const sizeReason = validatePatternSize('top', [a, v1, b, v2, c], ctx.sizeThresholds);
		if (sizeReason) {
			pcand({ type: 'triple_top', accepted: false, reason: sizeReason, idxs: [a.idx, b.idx, c.idx] });
			continue;
		}

		// ネックラインは 2 つの谷の平均。**ブレイク判定に渡すのと同じ値**を構造ゲートにも渡す
		// （`ReversalStructureInput.necklinePrice` の docstring）。
		const nlAvg = (Number(v1.price) + Number(v2.price)) / 2;

		// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
		// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
		const gate = applyReversalGate({
			candles,
			pivots,
			side: 'top',
			first: a,
			mid: v1,
			necklinePrice: nlAvg,
			type: 'triple_top',
			indices: [a.idx, b.idx, c.idx],
			debugCandidates: ctx.debugCandidates,
		});
		if (!gate) continue;

		// 高さ相対の同水準検査（issue #138）。**既存の棄却検査（構造ゲートを含む）をすべて
		// 通過した後**に置く——`validatePatternSize` の docstring と同じ理由で、
		// 前に置くと固有の理由コードを持つ候補の `reason` を横取りする。
		const topSpread = levelSpreadMetrics([a, b, c], [a, v1, b, v2, c]);
		const topSpreadReason = validateLevelSpread('top', topSpread);
		if (topSpreadReason) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: topSpreadReason,
				idxs: [a.idx, b.idx, c.idx],
				details: levelSpreadDetailsFrom(topSpread, tolerancePct),
			});
			continue;
		}

		// 主構成点とネックラインの位置関係（issue #216 Phase 2）。**`validateLevelSpread` の直後**
		// ——配置の理由は `validatePatternSize` の docstring（「既存の棄却検査をすべて通過した後」）と
		// 同じで、固有の理由コードを持つ候補の `reason` を横取りしないため。判定の実体と根拠は
		// `validateMainPointsNecklineSide` の docstring が単一ソース。
		//
		// **3 山 / 3 谷の全点を検査する**（`pivots` の [a, b, c] そのもの）。Phase 1 は
		// 「誤側に来るのは実質、構成点列の最後の 1 点だけ」と実測したが、それは emit された
		// 候補だけを見た母集団の話で、**本ゲートは第2構成点が誤側の構造も実際に落としている**
		// （実データ B の `triple_top` 204-**211**-219。あちらでは `confidence_below_min` が
		// 先に拾っていた）。中間点を除外する理由が無く、除外すると条件が複雑になる。
		const strictTopSide = validateMainPointsNecklineSide('top', [a, b, c], nlAvg);
		if (strictTopSide.reason) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: strictTopSide.reason,
				idxs: [a.idx, b.idx, c.idx],
				details: necklineSideDetailsFrom(nlAvg, strictTopSide.offenders),
			});
			continue;
		}

		const structureGate = buildStructureGate(gate);

		// ネックライン下抜けを検出（c.idx 以降、最大 MAX_BARS_FROM_EXTREMUM バー）
		const breakoutIdx = findBreakoutIdx(candles, c.idx, nlAvg, 'below');
		const isCompleted = breakoutIdx >= 0;
		const rangeEnd = isCompleted ? candles[breakoutIdx]?.isoTime : structureEnd;
		if (!rangeEnd) continue;
		const breakoutPrice = isCompleted ? Number(candles[breakoutIdx]?.close ?? NaN) : NaN;

		// 整合度（issue #199 候補 1）。**`confidence_below_min` はここまで下りてきた**
		// ——`breakoutQuality` 軸がブレイク足の終値を要るため、`validatePatternSize` /
		// 構造ゲート / `validateLevelSpread` より後ろになる。`validatePatternSize` の
		// docstring の「固有の理由コードを持つ候補の reason を横取りしない」という原則に照らすと、
		// `confidence_below_min` は汎用的な理由なので後ろに回るほうが原則に沿う
		// （旧配置では、サイズ不足やスプレッド超過という固有の診断が付くはずの候補に
		// `confidence_below_min` という汎用コードが付いていた）。
		const per = periodScoreBars(c.idx - a.idx);
		const { components: scoreComponents, base } = buildTripleScore({
			points: [a.price, b.price, c.price],
			levelTolerancePct: tolerancePct,
			necklinePrice: nlAvg,
			breakoutClose: breakoutPrice,
			side: 'top',
			retracementRatio: gate.retracementRatio,
			durationScore: per,
		});
		const confidence = finalizeConf(base, 'triple_top');
		if (confidence < (MIN_CONFIDENCE.triple_top ?? 0)) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'confidence_below_min',
				idxs: [a.idx, b.idx, c.idx],
				// 閾値を再検討するには「いくつで落ちたか」が要る（#138 が `levelSpreadDetails` で
				// 入れたのと同じ理由）。#199 で軸構成を変えた際、旧実装は棄却された候補の
				// confidence をどこにも出しておらず、`MIN_CONFIDENCE = 0.7` が何を切っているかを
				// コードを書き換えずに測れなかった。
				details: { confidence, threshold: MIN_CONFIDENCE.triple_top ?? 0, ...scoreComponents },
			});
			continue;
		}

		const neckline = [
			{ x: a.idx, y: nlAvg },
			{ x: isCompleted ? breakoutIdx : c.idx, y: nlAvg },
		];
		const diagram: PatternDiagramData = generatePatternDiagram(
			'triple_top',
			[
				{ ...a, date: candles[a.idx]?.isoTime },
				{ ...v1, date: candles[v1.idx]?.isoTime },
				{ ...b, date: candles[b.idx]?.isoTime },
				{ ...v2, date: candles[v2.idx]?.isoTime },
				{ ...c, date: candles[c.idx]?.isoTime },
			],
			{ price: nlAvg },
			{ start, end: rangeEnd },
			{ tz: ctx.tz },
		);
		const ttAvgPeak = (a.price + b.price + c.price) / 3;
		const ttTarget = Math.round(nlAvg - (ttAvgPeak - nlAvg));
		const completionFields = isCompleted
			? {
					status: 'completed' as const,
					confirmation: {
						type: 'neckline_breakout' as const,
						date: rangeEnd,
						idx: breakoutIdx,
						price: breakoutPrice,
					},
					breakout: { idx: breakoutIdx, price: breakoutPrice },
					breakoutBarIndex: breakoutIdx,
					breakoutDate: rangeEnd,
					breakoutDirection: 'down' as const,
					outcome: 'success' as const,
				}
			: {
					status: 'near_completion' as const,
					confirmation: { type: 'not_confirmed' as const },
				};

		patterns.push({
			type: 'triple_top',
			confidence,
			scoreComponents,
			range: { start, end: rangeEnd },
			structureRange: { start, end: structureEnd },
			...completionFields,
			pivots: [a, b, c],
			neckline,
			...(structureGate ? { structureGate } : {}),
			trendlineLabel: 'ネックライン',
			breakoutTarget: ttTarget,
			targetMethod: 'neckline_projection' as const,
			...(diagram ? { structureDiagram: diagram } : {}),
		});
		pcand({
			type: 'triple_top',
			accepted: true,
			idxs: isCompleted ? [a.idx, b.idx, c.idx, breakoutIdx] : [a.idx, b.idx, c.idx],
			pts: [
				{ role: 'peak1', idx: a.idx, price: a.price },
				{ role: 'peak2', idx: b.idx, price: b.price },
				{ role: 'peak3', idx: c.idx, price: c.price },
				...(isCompleted ? [{ role: 'breakout', idx: breakoutIdx, price: breakoutPrice }] : []),
			],
		});
	}

	return patterns;
}

// ── Helper: Strict Triple Bottom ──

function findStrictTripleBottom(ctx: DetectContext): DeduplicablePattern[] {
	const { candles, pivots, allPeaks, tolerancePct, minDist, near } = ctx;
	const pcand: Pcand = (arg) => pushCand(ctx, arg);
	const patterns: DeduplicablePattern[] = [];
	const lowsOnly = pivots.filter((p) => p.kind === 'L');
	if (lowsOnly.length < 3) return patterns;

	for (let i = 0; i <= lowsOnly.length - 3; i++) {
		const a = lowsOnly[i],
			b = lowsOnly[i + 1],
			c = lowsOnly[i + 2];
		if (b.idx - a.idx < minDist || c.idx - b.idx < minDist) continue;

		// 山の探索を同水準判定より**前**に出してある（issue #138）。理由は
		// `findStrictTripleTop` の同じ箇所のコメントを参照（判定順は変えていない）。
		const p1cands = allPeaks.filter((v: { idx: number }) => v.idx > a.idx && v.idx < b.idx);
		const p2cands = allPeaks.filter((v: { idx: number }) => v.idx > b.idx && v.idx < c.idx);
		const p1 = p1cands.length ? p1cands.reduce((m, v) => (v.price > m.price ? v : m)) : null;
		const p2 = p2cands.length ? p2cands.reduce((m, v) => (v.price > m.price ? v : m)) : null;

		const nearAll = near(a.price, b.price) && near(b.price, c.price) && near(a.price, c.price);
		if (!nearAll) {
			// issue #138: top 側と同じ無音の continue だった。
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'three_valleys_not_level',
				idxs: [a.idx, b.idx, c.idx],
				details: levelSpreadDetails([a, b, c], [a, p1, b, p2, c], tolerancePct),
			});
			continue;
		}
		const start = candles[a.idx].isoTime;
		const structureEnd = candles[c.idx].isoTime;
		if (!(start && structureEnd)) continue;

		// Additional strict checks: neckline slope limit.
		//
		// **3 谷の同水準判定はここには無い。** 2 段に分かれて前後にある:
		// 段 1 = 上の `nearAll`（`tolerancePct` 基準。落ちた候補は `three_valleys_not_level`）、
		// 段 3 = 下の `validateLevelSpread`（パターン高さで正規化した hard gate。issue #138）。
		// ここで三たび評価しても段 1 で `continue` 済みなので常に `true` にしかならず、
		// 到達不能な理由コードが増えるだけになる（`valleyNearStrict` がまさにそれで、
		// `'valleys_not_equal'` は一度も出なかった。issue #138 の確認事項 C）。
		//
		// 段 1 と段 3 のあいだには `MAX_VALLEY_SPREAD`（1.5%）があったが #178 項目 2 で削除した。
		// 価格水準基準で、しかも完成済み 4 経路のうち本関数にしか無い閾値だった。外しても
		// `data.patterns` は 896 ケースで不変——止めていた 21 実体はすべて段 3 / 構造ゲート /
		// ネックライン傾き / サイズ検査 / 山の同水準のいずれかが受け止める（`accepted` が
		// 増えた実体は 0 で、棄却理由が入れ替わるだけ）。**#186 以降、この一覧の「山の同水準」
		// （旧 `peaks_not_equal`）は「ネックライン傾き」に統合された**——両者は同じ式を測っていた。
		if (!(p1 && p2)) {
			pcand({ type: 'triple_bottom', accepted: false, reason: 'peaks_missing', idxs: [a.idx, b.idx, c.idx] });
			continue;
		}
		// ネックライン（2 山）の水平性は {@link NECKLINE_SLOPE_LIMIT} の 1 本だけで測る（issue #186）。
		// 削除した `peaksNear` の事情は `findStrictTripleTop` の同じ箇所のコメントと同じ。
		const necklineSlope = Math.abs(p1.price - p2.price) / Math.max(1, Math.max(p1.price, p2.price));
		if (necklineSlope > NECKLINE_SLOPE_LIMIT) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'neckline_slope_excess',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}
		// **整合度の算出とゲートはブレイク検出の後**（issue #199 候補 1）。理由は
		// `findStrictTripleTop` の同じ箇所のコメントを参照。

		// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
		const sizeReason = validatePatternSize('bottom', [a, p1, b, p2, c], ctx.sizeThresholds);
		if (sizeReason) {
			pcand({ type: 'triple_bottom', accepted: false, reason: sizeReason, idxs: [a.idx, b.idx, c.idx] });
			continue;
		}

		// ネックラインは 2 つの山の平均。**ブレイク判定に渡すのと同じ値**を構造ゲートにも渡す
		// （`ReversalStructureInput.necklinePrice` の docstring）。
		const nlAvg = (Number(p1.price) + Number(p2.price)) / 2;

		// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
		// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
		const gate = applyReversalGate({
			candles,
			pivots,
			side: 'bottom',
			first: a,
			mid: p1,
			necklinePrice: nlAvg,
			type: 'triple_bottom',
			indices: [a.idx, b.idx, c.idx],
			debugCandidates: ctx.debugCandidates,
		});
		if (!gate) continue;

		// 高さ相対の同水準検査（issue #138）。配置の理由は `findStrictTripleTop` の同じ箇所を参照。
		// **top と対称。** 導入時は「`MAX_VALLEY_SPREAD` は bottom にしか無い」という非対称
		// （#138 確認事項 B）が併存していて本ゲートだけが対称だったが、#178 項目 2 でその定数を
		// 削除したので、現在は完成済み triple の水準ばらつき判定そのものが top / bottom 対称。
		const bottomSpread = levelSpreadMetrics([a, b, c], [a, p1, b, p2, c]);
		const bottomSpreadReason = validateLevelSpread('bottom', bottomSpread);
		if (bottomSpreadReason) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: bottomSpreadReason,
				idxs: [a.idx, b.idx, c.idx],
				details: levelSpreadDetailsFrom(bottomSpread, tolerancePct),
			});
			continue;
		}

		// 主構成点とネックラインの位置関係（issue #216 Phase 2）。**`validateLevelSpread` の直後**
		// ——配置の理由は `findStrictTripleTop` の同じ箇所のコメントを参照。
		const strictBottomSide = validateMainPointsNecklineSide('bottom', [a, b, c], nlAvg);
		if (strictBottomSide.reason) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: strictBottomSide.reason,
				idxs: [a.idx, b.idx, c.idx],
				details: necklineSideDetailsFrom(nlAvg, strictBottomSide.offenders),
			});
			continue;
		}

		const structureGate = buildStructureGate(gate);

		// ネックライン上抜けを検出（c.idx 以降、最大 MAX_BARS_FROM_EXTREMUM バー）
		const breakoutIdx = findBreakoutIdx(candles, c.idx, nlAvg, 'above');
		const isCompleted = breakoutIdx >= 0;
		const rangeEnd = isCompleted ? candles[breakoutIdx]?.isoTime : structureEnd;
		if (!rangeEnd) continue;
		const breakoutPrice = isCompleted ? Number(candles[breakoutIdx]?.close ?? NaN) : NaN;

		// 整合度（issue #199 候補 1）。配置と帰属の変化は `findStrictTripleTop` の同じ箇所を参照。
		const per = periodScoreBars(c.idx - a.idx);
		const { components: scoreComponents, base } = buildTripleScore({
			points: [a.price, b.price, c.price],
			levelTolerancePct: tolerancePct,
			necklinePrice: nlAvg,
			breakoutClose: breakoutPrice,
			side: 'bottom',
			retracementRatio: gate.retracementRatio,
			durationScore: per,
		});
		const confidence = finalizeConf(base, 'triple_bottom');
		if (confidence < (MIN_CONFIDENCE.triple_bottom ?? 0)) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'confidence_below_min',
				idxs: [a.idx, b.idx, c.idx],
				// 閾値を再検討するには「いくつで落ちたか」が要る（#138 が `levelSpreadDetails` で
				// 入れたのと同じ理由）。#199 で軸構成を変えた際、旧実装は棄却された候補の
				// confidence をどこにも出しておらず、`MIN_CONFIDENCE = 0.7` が何を切っているかを
				// コードを書き換えずに測れなかった。
				details: { confidence, threshold: MIN_CONFIDENCE.triple_bottom ?? 0, ...scoreComponents },
			});
			continue;
		}

		const neckline = [
			{ x: a.idx, y: nlAvg },
			{ x: isCompleted ? breakoutIdx : c.idx, y: nlAvg },
		];
		const diagram: PatternDiagramData = generatePatternDiagram(
			'triple_bottom',
			[
				{ ...a, date: candles[a.idx]?.isoTime },
				{ ...p1, date: candles[p1.idx]?.isoTime },
				{ ...b, date: candles[b.idx]?.isoTime },
				{ ...p2, date: candles[p2.idx]?.isoTime },
				{ ...c, date: candles[c.idx]?.isoTime },
			],
			{ price: nlAvg },
			{ start, end: rangeEnd },
			{ tz: ctx.tz },
		);
		const tbAvgValley = (a.price + b.price + c.price) / 3;
		const tbTarget = Math.round(nlAvg + (nlAvg - tbAvgValley));
		const completionFields = isCompleted
			? {
					status: 'completed' as const,
					confirmation: {
						type: 'neckline_breakout' as const,
						date: rangeEnd,
						idx: breakoutIdx,
						price: breakoutPrice,
					},
					breakout: { idx: breakoutIdx, price: breakoutPrice },
					breakoutBarIndex: breakoutIdx,
					breakoutDate: rangeEnd,
					breakoutDirection: 'up' as const,
					outcome: 'success' as const,
				}
			: {
					status: 'near_completion' as const,
					confirmation: { type: 'not_confirmed' as const },
				};

		patterns.push({
			type: 'triple_bottom',
			confidence,
			scoreComponents,
			range: { start, end: rangeEnd },
			structureRange: { start, end: structureEnd },
			...completionFields,
			pivots: [a, b, c],
			neckline,
			...(structureGate ? { structureGate } : {}),
			trendlineLabel: 'ネックライン',
			breakoutTarget: tbTarget,
			targetMethod: 'neckline_projection' as const,
			...(diagram ? { structureDiagram: diagram } : {}),
		});
		pcand({
			type: 'triple_bottom',
			accepted: true,
			idxs: isCompleted ? [a.idx, b.idx, c.idx, breakoutIdx] : [a.idx, b.idx, c.idx],
			pts: [
				{ role: 'valley1', idx: a.idx, price: a.price },
				{ role: 'valley2', idx: b.idx, price: b.price },
				{ role: 'valley3', idx: c.idx, price: c.price },
				...(isCompleted ? [{ role: 'breakout', idx: breakoutIdx, price: breakoutPrice }] : []),
			],
		});
	}

	return patterns;
}

// ── Helper: Relaxed Triple Top fallback ──

function findRelaxedTripleTop(ctx: DetectContext, factor: number): DeduplicablePattern | null {
	const { candles, pivots, allValleys, tolerancePct, minDist } = ctx;
	const pcand: Pcand = (arg) => pushCand(ctx, arg);
	const tolTriple = tolerancePct * factor;
	const nearTriple = (x: number, y: number) => Math.abs(x - y) / Math.max(1, Math.max(x, y)) <= tolTriple;
	const highsOnly = pivots.filter((p) => p.kind === 'H');

	for (let i = 0; i <= highsOnly.length - 3; i++) {
		const a = highsOnly[i],
			b = highsOnly[i + 1],
			c = highsOnly[i + 2];
		if (b.idx - a.idx < minDist || c.idx - b.idx < minDist) continue;
		if (!(nearTriple(a.price, b.price) && nearTriple(b.price, c.price))) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'peaks_not_equal_relaxed',
				idxs: [a.idx, b.idx, c.idx],
				pts: [
					{ role: 'peak1', idx: a.idx, price: a.price },
					{ role: 'peak2', idx: b.idx, price: b.price },
					{ role: 'peak3', idx: c.idx, price: c.price },
				],
			});
			continue;
		}
		const start = candles[a.idx].isoTime,
			structureEnd = candles[c.idx].isoTime;
		if (!start || !structureEnd) continue;
		// **整合度の算出とゲートはブレイク検出の後**（issue #199 候補 1）。理由は
		// `findStrictTripleTop` の同じ箇所のコメントを参照。
		// valleys for neckline & diagram
		const v1cands = allValleys.filter((v: { idx: number }) => v.idx > a.idx && v.idx < b.idx);
		const v2cands = allValleys.filter((v: { idx: number }) => v.idx > b.idx && v.idx < c.idx);
		const v1 = v1cands.length ? v1cands.reduce((m, v) => (v.price < m.price ? v : m)) : null;
		const v2 = v2cands.length ? v2cands.reduce((m, v) => (v.price < m.price ? v : m)) : null;
		if (!(v1 && v2)) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'valleys_missing_relaxed',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}
		const necklineSlope = Math.abs(v1.price - v2.price) / Math.max(1, Math.max(v1.price, v2.price));
		if (necklineSlope > NECKLINE_SLOPE_LIMIT) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'neckline_slope_excess_relaxed',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}
		// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
		const sizeReason = validatePatternSize('top', [a, v1, b, v2, c], ctx.sizeThresholds);
		if (sizeReason) {
			pcand({ type: 'triple_top', accepted: false, reason: sizeReason, idxs: [a.idx, b.idx, c.idx] });
			continue;
		}

		// ネックラインは 2 つの谷の平均。**ブレイク判定に渡すのと同じ値**を構造ゲートにも渡す
		// （`ReversalStructureInput.necklinePrice` の docstring）。
		const nlAvg = (Number(v1.price) + Number(v2.price)) / 2;

		// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
		// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
		const gate = applyReversalGate({
			candles,
			pivots,
			side: 'top',
			first: a,
			mid: v1,
			necklinePrice: nlAvg,
			type: 'triple_top',
			indices: [a.idx, b.idx, c.idx],
			debugCandidates: ctx.debugCandidates,
		});
		if (!gate) continue;

		// 高さ相対の同水準検査（issue #138）。**strict と同じ検査を relaxed にも掛ける。**
		// `detectTriples` は strict がその種別を 0 件にした瞬間に relaxed へフォールバックするので
		// （`detectTriples` の relaxed fallback ループ）、strict にだけ入れても relaxed が同じ 3 山を
		// `tolerancePct × factor` で拾い直し、`confidence × 0.95` の同一パターンを返す
		// ——実測で `data.patterns` は 1 件も減らず confidence が 0.80 → 0.79 に変わるだけだった。
		// 理由コードに `_relaxed` を付けないのは `validatePatternSize` の扱いと揃えるため
		// （共有の構造バリデータは経路をまたいで同じコードを返す）。
		const relaxedTopSpread = levelSpreadMetrics([a, b, c], [a, v1, b, v2, c]);
		const relaxedTopSpreadReason = validateLevelSpread('top', relaxedTopSpread);
		if (relaxedTopSpreadReason) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: relaxedTopSpreadReason,
				idxs: [a.idx, b.idx, c.idx],
				details: levelSpreadDetailsFrom(relaxedTopSpread, tolTriple),
			});
			continue;
		}

		// 主構成点とネックラインの位置関係（issue #216 Phase 2）。**`validateLevelSpread` の直後**
		// ——配置の理由は `findStrictTripleTop` の同じ箇所のコメントを参照。
		// **strict と同じ検査を relaxed にも掛ける**（`validateLevelSpread` と同じ理由——strict が
		// その種別を 0 件にすると relaxed が同じ 3 山を拾い直すため、strict にだけ入れても素通りする）。
		// 理由コードに `_relaxed` を付けないのも `validateLevelSpread` / `validatePatternSize` と同じ扱い。
		const relaxedTopSide = validateMainPointsNecklineSide('top', [a, b, c], nlAvg);
		if (relaxedTopSide.reason) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: relaxedTopSide.reason,
				idxs: [a.idx, b.idx, c.idx],
				details: necklineSideDetailsFrom(nlAvg, relaxedTopSide.offenders),
			});
			continue;
		}

		const structureGate = buildStructureGate(gate);

		// ネックライン下抜け検出
		const breakoutIdx = findBreakoutIdx(candles, c.idx, nlAvg, 'below');
		const isCompleted = breakoutIdx >= 0;
		const rangeEnd = isCompleted ? candles[breakoutIdx]?.isoTime : structureEnd;
		if (!rangeEnd) continue;
		const breakoutPrice = isCompleted ? Number(candles[breakoutIdx]?.close ?? NaN) : NaN;

		// 整合度（issue #199 候補 1）。**同水準判定の分母は relaxed の `tolTriple`**
		// （`tolerancePct × factor`）——`levelMargin` は「その経路の許容幅に対する余裕」なので、
		// 判定に使ったのと同じ幅で正規化しないと strict より甘い判定に strict の物差しを当てることになる。
		// 旧実装の `tolMargin` も同じ分母だった。
		const per = periodScoreBars(c.idx - a.idx);
		const { components: scoreComponents, base } = buildTripleScore({
			points: [a.price, b.price, c.price],
			levelTolerancePct: tolTriple,
			necklinePrice: nlAvg,
			breakoutClose: breakoutPrice,
			side: 'top',
			retracementRatio: gate.retracementRatio,
			durationScore: per,
		});
		const confidence = finalizeConf(base * 0.95, 'triple_top');
		if (confidence < (MIN_CONFIDENCE.triple_top ?? 0)) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'confidence_below_min_relaxed',
				idxs: [a.idx, b.idx, c.idx],
				// 閾値を再検討するには「いくつで落ちたか」が要る（#138 が `levelSpreadDetails` で
				// 入れたのと同じ理由）。#199 で軸構成を変えた際、旧実装は棄却された候補の
				// confidence をどこにも出しておらず、`MIN_CONFIDENCE = 0.7` が何を切っているかを
				// コードを書き換えずに測れなかった。
				details: { confidence, threshold: MIN_CONFIDENCE.triple_top ?? 0, ...scoreComponents },
			});
			continue; // 後続候補で confidence が足りるものを探す
		}

		const neckline = [
			{ x: a.idx, y: nlAvg },
			{ x: isCompleted ? breakoutIdx : c.idx, y: nlAvg },
		];
		const diagram: PatternDiagramData = generatePatternDiagram(
			'triple_top',
			[
				{ ...a, date: candles[a.idx]?.isoTime },
				{ ...v1, date: candles[v1.idx]?.isoTime },
				{ ...b, date: candles[b.idx]?.isoTime },
				{ ...v2, date: candles[v2.idx]?.isoTime },
				{ ...c, date: candles[c.idx]?.isoTime },
			],
			{ price: nlAvg },
			{ start, end: rangeEnd },
			{ tz: ctx.tz },
		);
		const ttRelAvgPeak = (a.price + b.price + c.price) / 3;
		const ttRelTarget = Math.round(nlAvg - (ttRelAvgPeak - nlAvg));
		const completionFields = isCompleted
			? {
					status: 'completed' as const,
					confirmation: {
						type: 'neckline_breakout' as const,
						date: rangeEnd,
						idx: breakoutIdx,
						price: breakoutPrice,
					},
					breakout: { idx: breakoutIdx, price: breakoutPrice },
					breakoutBarIndex: breakoutIdx,
					breakoutDate: rangeEnd,
					breakoutDirection: 'down' as const,
					outcome: 'success' as const,
				}
			: {
					status: 'near_completion' as const,
					confirmation: { type: 'not_confirmed' as const },
				};
		return {
			type: 'triple_top',
			confidence,
			scoreComponents,
			range: { start, end: rangeEnd },
			structureRange: { start, end: structureEnd },
			...completionFields,
			pivots: [a, b, c],
			neckline,
			...(structureGate ? { structureGate } : {}),
			trendlineLabel: 'ネックライン',
			breakoutTarget: ttRelTarget,
			targetMethod: 'neckline_projection' as const,
			...(diagram ? { structureDiagram: diagram } : {}),
			_fallback: `relaxed_triple_x${factor}`,
		};
	}
	return null;
}

// ── Helper: Relaxed Triple Bottom fallback ──

function findRelaxedTripleBottom(ctx: DetectContext, factor: number): DeduplicablePattern | null {
	const { candles, pivots, allPeaks, tolerancePct, minDist } = ctx;
	const pcand: Pcand = (arg) => pushCand(ctx, arg);
	const tolTriple = tolerancePct * factor;
	const nearTriple = (x: number, y: number) => Math.abs(x - y) / Math.max(1, Math.max(x, y)) <= tolTriple;
	const lowsOnly = pivots.filter((p) => p.kind === 'L');

	for (let i = 0; i <= lowsOnly.length - 3; i++) {
		const a = lowsOnly[i],
			b = lowsOnly[i + 1],
			c = lowsOnly[i + 2];
		if (b.idx - a.idx < minDist || c.idx - b.idx < minDist) continue;
		if (!(nearTriple(a.price, b.price) && nearTriple(b.price, c.price))) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'valleys_not_equal_relaxed',
				idxs: [a.idx, b.idx, c.idx],
				pts: [
					{ role: 'valley1', idx: a.idx, price: a.price },
					{ role: 'valley2', idx: b.idx, price: b.price },
					{ role: 'valley3', idx: c.idx, price: c.price },
				],
			});
			continue;
		}
		const start = candles[a.idx].isoTime,
			structureEnd = candles[c.idx].isoTime;
		if (!start || !structureEnd) continue;
		// **整合度の算出とゲートはブレイク検出の後**（issue #199 候補 1）。理由は
		// `findStrictTripleTop` の同じ箇所のコメントを参照。
		// peaks for neckline & diagram
		const p1cands = allPeaks.filter((v: { idx: number }) => v.idx > a.idx && v.idx < b.idx);
		const p2cands = allPeaks.filter((v: { idx: number }) => v.idx > b.idx && v.idx < c.idx);
		const p1 = p1cands.length ? p1cands.reduce((m, v) => (v.price > m.price ? v : m)) : null;
		const p2 = p2cands.length ? p2cands.reduce((m, v) => (v.price > m.price ? v : m)) : null;
		if (!(p1 && p2)) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'peaks_missing_relaxed',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}
		const necklineSlope = Math.abs(p1.price - p2.price) / Math.max(1, Math.max(p1.price, p2.price));
		if (necklineSlope > NECKLINE_SLOPE_LIMIT) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'neckline_slope_excess_relaxed',
				idxs: [a.idx, b.idx, c.idx],
			});
			continue;
		}
		// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
		const sizeReason = validatePatternSize('bottom', [a, p1, b, p2, c], ctx.sizeThresholds);
		if (sizeReason) {
			pcand({ type: 'triple_bottom', accepted: false, reason: sizeReason, idxs: [a.idx, b.idx, c.idx] });
			continue;
		}

		// ネックラインは 2 つの山の平均。**ブレイク判定に渡すのと同じ値**を構造ゲートにも渡す
		// （`ReversalStructureInput.necklinePrice` の docstring）。
		const nlAvg = (Number(p1.price) + Number(p2.price)) / 2;

		// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
		// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
		const gate = applyReversalGate({
			candles,
			pivots,
			side: 'bottom',
			first: a,
			mid: p1,
			necklinePrice: nlAvg,
			type: 'triple_bottom',
			indices: [a.idx, b.idx, c.idx],
			debugCandidates: ctx.debugCandidates,
		});
		if (!gate) continue;

		// 高さ相対の同水準検査（issue #138）。relaxed に掛ける理由は
		// `findRelaxedTripleTop` の同じ箇所のコメントを参照。
		const relaxedBottomSpread = levelSpreadMetrics([a, b, c], [a, p1, b, p2, c]);
		const relaxedBottomSpreadReason = validateLevelSpread('bottom', relaxedBottomSpread);
		if (relaxedBottomSpreadReason) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: relaxedBottomSpreadReason,
				idxs: [a.idx, b.idx, c.idx],
				details: levelSpreadDetailsFrom(relaxedBottomSpread, tolTriple),
			});
			continue;
		}

		// 主構成点とネックラインの位置関係（issue #216 Phase 2）。**`validateLevelSpread` の直後**
		// ——配置の理由は `findStrictTripleTop` の同じ箇所のコメントを参照。
		const relaxedBottomSide = validateMainPointsNecklineSide('bottom', [a, b, c], nlAvg);
		if (relaxedBottomSide.reason) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: relaxedBottomSide.reason,
				idxs: [a.idx, b.idx, c.idx],
				details: necklineSideDetailsFrom(nlAvg, relaxedBottomSide.offenders),
			});
			continue;
		}

		const structureGate = buildStructureGate(gate);

		// ネックライン上抜け検出
		const breakoutIdx = findBreakoutIdx(candles, c.idx, nlAvg, 'above');
		const isCompleted = breakoutIdx >= 0;
		const rangeEnd = isCompleted ? candles[breakoutIdx]?.isoTime : structureEnd;
		if (!rangeEnd) continue;
		const breakoutPrice = isCompleted ? Number(candles[breakoutIdx]?.close ?? NaN) : NaN;

		// 整合度（issue #199 候補 1）。分母が relaxed の `tolTriple` である理由は
		// `findRelaxedTripleTop` の同じ箇所のコメントを参照。
		const per = periodScoreBars(c.idx - a.idx);
		const { components: scoreComponents, base } = buildTripleScore({
			points: [a.price, b.price, c.price],
			levelTolerancePct: tolTriple,
			necklinePrice: nlAvg,
			breakoutClose: breakoutPrice,
			side: 'bottom',
			retracementRatio: gate.retracementRatio,
			durationScore: per,
		});
		const confidence = finalizeConf(base * 0.95, 'triple_bottom');
		if (confidence < (MIN_CONFIDENCE.triple_bottom ?? 0)) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'confidence_below_min_relaxed',
				idxs: [a.idx, b.idx, c.idx],
				// 閾値を再検討するには「いくつで落ちたか」が要る（#138 が `levelSpreadDetails` で
				// 入れたのと同じ理由）。#199 で軸構成を変えた際、旧実装は棄却された候補の
				// confidence をどこにも出しておらず、`MIN_CONFIDENCE = 0.7` が何を切っているかを
				// コードを書き換えずに測れなかった。
				details: { confidence, threshold: MIN_CONFIDENCE.triple_bottom ?? 0, ...scoreComponents },
			});
			continue; // 後続候補で confidence が足りるものを探す
		}

		const neckline = [
			{ x: a.idx, y: nlAvg },
			{ x: isCompleted ? breakoutIdx : c.idx, y: nlAvg },
		];
		const diagram: PatternDiagramData = generatePatternDiagram(
			'triple_bottom',
			[
				{ ...a, date: candles[a.idx]?.isoTime },
				{ ...p1, date: candles[p1.idx]?.isoTime },
				{ ...b, date: candles[b.idx]?.isoTime },
				{ ...p2, date: candles[p2.idx]?.isoTime },
				{ ...c, date: candles[c.idx]?.isoTime },
			],
			{ price: nlAvg },
			{ start, end: rangeEnd },
			{ tz: ctx.tz },
		);
		const tbRelAvgValley = (a.price + b.price + c.price) / 3;
		const tbRelTarget = Math.round(nlAvg + (nlAvg - tbRelAvgValley));
		const completionFields = isCompleted
			? {
					status: 'completed' as const,
					confirmation: {
						type: 'neckline_breakout' as const,
						date: rangeEnd,
						idx: breakoutIdx,
						price: breakoutPrice,
					},
					breakout: { idx: breakoutIdx, price: breakoutPrice },
					breakoutBarIndex: breakoutIdx,
					breakoutDate: rangeEnd,
					breakoutDirection: 'up' as const,
					outcome: 'success' as const,
				}
			: {
					status: 'near_completion' as const,
					confirmation: { type: 'not_confirmed' as const },
				};
		return {
			type: 'triple_bottom',
			confidence,
			scoreComponents,
			range: { start, end: rangeEnd },
			structureRange: { start, end: structureEnd },
			...completionFields,
			pivots: [a, b, c],
			neckline,
			...(structureGate ? { structureGate } : {}),
			trendlineLabel: 'ネックライン',
			breakoutTarget: tbRelTarget,
			targetMethod: 'neckline_projection' as const,
			...(diagram ? { structureDiagram: diagram } : {}),
			_fallback: `relaxed_triple_x${factor}`,
		};
	}
	return null;
}

// ── Helper: 形成中 Triple Top ──

/**
 * 形成中 Triple Top を組み立てる。組めなければ null。
 *
 * ## debug candidate の積み方（issue #158）
 *
 * 成功時に `accepted: true` / `status: 'forming'` を積む。**`accepted: true` は「検出器が
 * 組み立てた」であって「最終出力に残った」ではない**——後段 `detect_patterns.ts` の
 * `globalDedup` に畳まれて `data.patterns` に出ないことがある（#155 と同じ約束）。
 * ループは成功で即 `return` するので、1 回の呼び出しで積まれる成功エントリは高々 1 件。
 *
 * 棄却の理由コードは**構成点が揃った後の分岐にだけ**積む。ピークペアを回すループなので、
 * 揃う前の `continue`（`minDist` 不足 / `peakDiff` 超過 / `currentDiff` 超過）はペア数ぶん
 * 発火し、`detect_patterns.ts` の cap=200 を食い潰して**他の検出器の棄却理由を押し出す**。
 * #155 が `formingHsForHead` で置いた制約と同じ。
 */
function tryFormingTripleTop(ctx: DetectContext): DeduplicablePattern | null {
	const { candles, pivots, allPeaks, allValleys, tolerancePct, minDist } = ctx;
	const pcand: Pcand = (arg) => pushCand(ctx, arg);
	const lastIdx = candles.length - 1;
	const currentPrice = Number(candles[lastIdx]?.close ?? NaN);
	const isoAt = (i: number) => candles[i]?.isoTime || '';
	const formingBars = getTripleFormingBarParams(ctx.type);
	const tripleTolerancePct = tolerancePct * FORMING_TOLERANCE_MULTIPLIER;
	const levelSpreadLimit = tripleTolerancePct * FORMING_LEVEL_SPREAD_FACTOR;
	const necklineSpreadLimit = tolerancePct * FORMING_NECKLINE_SPREAD_FACTOR;

	if (allPeaks.length < 2) return null;
	const confirmedPeaks = allPeaks.filter((p: { idx: number }) => p.idx < lastIdx - 2);

	for (let i = confirmedPeaks.length - 1; i >= 1; i--) {
		const peak2 = confirmedPeaks[i];
		const peak1 = confirmedPeaks[i - 1];
		if (peak2.idx - peak1.idx < minDist) continue;

		const peakDiff = Math.abs(peak1.price - peak2.price) / Math.max(1, Math.max(peak1.price, peak2.price));
		if (peakDiff > tripleTolerancePct) continue;

		const avgPeakPrice = (peak1.price + peak2.price) / 2;
		const currentDiff = Math.abs(currentPrice - avgPeakPrice) / Math.max(1, avgPeakPrice);
		if (currentDiff > tripleTolerancePct || currentPrice < avgPeakPrice * 0.95) continue;

		// 階段状の切り上がり（peak1 < peak2 < current）は triple_top ではなく
		// 上昇継続として扱う。level spread より具体的な診断のため最初に評価する。
		if (peak1.price < peak2.price && peak2.price < currentPrice) {
			const totalStep = (currentPrice - peak1.price) / Math.max(1, peak1.price);
			if (totalStep > FORMING_STAIR_STEP_LIMIT) {
				pcand({
					type: 'triple_top',
					accepted: false,
					reason: 'forming_stair_step_up',
					idxs: [peak1.idx, peak2.idx, lastIdx],
					pts: [
						{ role: 'peak1', idx: peak1.idx, price: peak1.price },
						{ role: 'peak2', idx: peak2.idx, price: peak2.price },
						{ role: 'current', idx: lastIdx, price: currentPrice },
					],
				});
				continue;
			}
		}

		// 3 山（peak1, peak2, 現在価格）の水平性チェック。
		// peak1-peak2 と current-avg の個別チェックだけでは、非単調な配置
		// （例: 100 → 95 → 100）でも累積 spread が大きいケースを捉えられない。
		// 3 点の max-min spread を直接見ることで、累積した非水平性を弾く。
		const levelMax = Math.max(peak1.price, peak2.price, currentPrice);
		const levelMin = Math.min(peak1.price, peak2.price, currentPrice);
		const levelSpread = (levelMax - levelMin) / Math.max(1, levelMax);
		if (levelSpread > levelSpreadLimit) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'forming_peaks_not_level',
				idxs: [peak1.idx, peak2.idx, lastIdx],
				pts: [
					{ role: 'peak1', idx: peak1.idx, price: peak1.price },
					{ role: 'peak2', idx: peak2.idx, price: peak2.price },
					{ role: 'current', idx: lastIdx, price: currentPrice },
				],
			});
			continue;
		}

		const formationBars = Math.max(0, lastIdx - peak1.idx);
		if (formationBars < formingBars.minBars || formationBars > formingBars.maxBars) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'forming_bars_out_of_range',
				idxs: [peak1.idx, peak2.idx, lastIdx],
				pts: [
					{ role: 'peak1', idx: peak1.idx, price: peak1.price },
					{ role: 'peak2', idx: peak2.idx, price: peak2.price },
					{ role: 'current', idx: lastIdx, price: currentPrice },
				],
			});
			continue;
		}

		// ネックライン構成点: H-L-H-L-(現在足) という構造を強制するため、
		// 谷を peak1-peak2 区間と peak2-現在足 区間にそれぞれ 1 つ以上要求する。
		// 区間別に縛らず合計数だけ見ると、2 谷が両方 peak1-peak2 間にあって peak2
		// 以降に谷がない「H-L-L-H-」のようなケースが通ってしまう。
		const v1Cands = allValleys.filter((v: { idx: number }) => v.idx > peak1.idx && v.idx < peak2.idx);
		const v2Cands = allValleys.filter((v: { idx: number }) => v.idx > peak2.idx && v.idx < lastIdx);
		if (v1Cands.length === 0 || v2Cands.length === 0) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'forming_neckline_points_insufficient',
				idxs: [peak1.idx, peak2.idx, lastIdx],
			});
			continue;
		}
		// strict triple_top と同じ方針で、各区間の最安値を採用する。
		const v1 = v1Cands.reduce((m, v) => (v.price < m.price ? v : m));
		const v2 = v2Cands.reduce((m, v) => (v.price < m.price ? v : m));

		// ネックライン水平性: 採用した 2 谷の price 差をネックライン傾きとして見る。
		const valleyMax = Math.max(v1.price, v2.price);
		const valleyMin = Math.min(v1.price, v2.price);
		const valleySpread = (valleyMax - valleyMin) / Math.max(1, valleyMax);
		if (valleySpread > necklineSpreadLimit) {
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: 'forming_neckline_not_horizontal',
				idxs: [peak1.idx, peak2.idx, lastIdx],
			});
			continue;
		}

		const progress = Math.min(1, currentPrice / avgPeakPrice);
		const completion = Math.min(1, 0.66 + progress * 0.34);
		const rawConfidence = Math.round((1 - currentDiff / tripleTolerancePct) * 0.8 * 100) / 100;
		// 3 点目が現在価格で暫定のため、completed より低い上限に抑える。
		const confidence = Math.min(rawConfidence, FORMING_MAX_CONFIDENCE);

		if (completion < FORMING_MIN_COMPLETION || confidence < FORMING_MIN_CONFIDENCE) {
			// この時点ではネックラインの 2 谷まで揃っているので、成功エントリと同じ 5 点を積む
			// （同じ経路の ✅ と ❌ を並べて読めるようにするのが #158 の目的）。
			pcand({
				type: 'triple_top',
				accepted: false,
				reason: completion < FORMING_MIN_COMPLETION ? 'forming_completion_below_min' : 'forming_confidence_below_min',
				idxs: [peak1.idx, peak2.idx, lastIdx],
				pts: [
					{ role: 'peak1', idx: peak1.idx, price: peak1.price },
					{ role: 'valley1', idx: v1.idx, price: v1.price },
					{ role: 'peak2', idx: peak2.idx, price: peak2.price },
					{ role: 'valley2', idx: v2.idx, price: v2.price },
					{ role: 'current', idx: lastIdx, price: currentPrice },
				],
			});
			continue;
		}

		// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
		const sizeReason = validatePatternSize(
			'top',
			[peak1, v1, peak2, v2, { extremePrice: currentPrice }],
			ctx.sizeThresholds,
		);
		if (sizeReason) {
			pcand({ type: 'triple_top', accepted: false, reason: sizeReason, idxs: [peak1.idx, peak2.idx, lastIdx] });
			continue;
		}

		// ネックラインは v1, v2 の平均で引く（strict triple_top と同じ方針）。
		const avgValley = (v1.price + v2.price) / 2;

		// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
		// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
		const gate = applyReversalGate({
			candles,
			pivots,
			side: 'top',
			first: peak1,
			mid: v1,
			necklinePrice: avgValley,
			type: 'triple_top',
			indices: [peak1.idx, peak2.idx, lastIdx],
			debugCandidates: ctx.debugCandidates,
		});
		if (!gate) continue;
		const structureGate = buildStructureGate(gate);

		const neckline = [
			{ x: peak1.idx, y: avgValley },
			{ x: lastIdx, y: avgValley },
		];

		const formTtTarget = Math.round(avgValley - ((peak1.price + peak2.price) / 2 - avgValley));

		// 成功エントリ（issue #158）。`indices` は既存の棄却エントリと同じ 3 点に揃え、
		// ネックラインを引いた 2 谷は `points` にだけ足す（#155 の `pre_head_valley` と同じ扱い）。
		// 最新足は確定ピボットではないので role を `current` で区別する。
		pcand({
			type: 'triple_top',
			accepted: true,
			status: 'forming',
			idxs: [peak1.idx, peak2.idx, lastIdx],
			pts: [
				{ role: 'peak1', idx: peak1.idx, price: peak1.price },
				{ role: 'valley1', idx: v1.idx, price: v1.price },
				{ role: 'peak2', idx: peak2.idx, price: peak2.price },
				{ role: 'valley2', idx: v2.idx, price: v2.price },
				{ role: 'current', idx: lastIdx, price: currentPrice },
			],
		});

		return {
			type: 'triple_top',
			confidence,
			range: { start: isoAt(peak1.idx), end: isoAt(lastIdx) },
			status: 'forming',
			pivots: [
				{ idx: peak1.idx, price: peak1.price, kind: 'H' as const, extremePrice: peak1.extremePrice },
				{ idx: peak2.idx, price: peak2.price, kind: 'H' as const, extremePrice: peak2.extremePrice },
			],
			neckline,
			...(structureGate ? { structureGate } : {}),
			trendlineLabel: 'ネックライン',
			breakoutTarget: formTtTarget,
			targetMethod: 'neckline_projection' as const,
			completionPct: Math.round(completion * 100),
			_method: 'forming_triple_top',
		};
	}
	return null;
}

// ── Helper: 形成中 Triple Bottom ──

/**
 * 形成中 Triple Bottom を組み立てる。組めなければ null。
 * debug candidate の積み方（成功エントリの意味・理由コードを積む分岐の範囲）は
 * {@link tryFormingTripleTop} の docstring が単一ソース。
 */
function tryFormingTripleBottom(ctx: DetectContext): DeduplicablePattern | null {
	const { candles, pivots, allPeaks, allValleys, tolerancePct, minDist } = ctx;
	const pcand: Pcand = (arg) => pushCand(ctx, arg);
	const lastIdx = candles.length - 1;
	const currentPrice = Number(candles[lastIdx]?.close ?? NaN);
	const isoAt = (i: number) => candles[i]?.isoTime || '';
	const formingBars = getTripleFormingBarParams(ctx.type);
	const tripleTolerancePct = tolerancePct * FORMING_TOLERANCE_MULTIPLIER;
	const levelSpreadLimit = tripleTolerancePct * FORMING_LEVEL_SPREAD_FACTOR;
	const necklineSpreadLimit = tolerancePct * FORMING_NECKLINE_SPREAD_FACTOR;

	if (allValleys.length < 2) return null;
	const confirmedValleys = allValleys.filter((v: { idx: number }) => v.idx < lastIdx - 2);

	for (let i = confirmedValleys.length - 1; i >= 1; i--) {
		const valley2 = confirmedValleys[i];
		const valley1 = confirmedValleys[i - 1];
		if (valley2.idx - valley1.idx < minDist) continue;

		const valleyDiff = Math.abs(valley1.price - valley2.price) / Math.max(1, Math.max(valley1.price, valley2.price));
		if (valleyDiff > tripleTolerancePct) continue;

		const avgValleyPrice = (valley1.price + valley2.price) / 2;

		// ネックライン構成点: L-H-L-H-(現在足) という構造を強制するため、
		// 山を valley1-valley2 区間と valley2-現在足 区間にそれぞれ 1 つ以上要求する。
		const p1Cands = allPeaks.filter((p: { idx: number }) => p.idx > valley1.idx && p.idx < valley2.idx);
		const p2Cands = allPeaks.filter((p: { idx: number }) => p.idx > valley2.idx && p.idx < lastIdx);
		if (p1Cands.length === 0 || p2Cands.length === 0) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'forming_neckline_points_insufficient',
				idxs: [valley1.idx, valley2.idx, lastIdx],
			});
			continue;
		}
		// strict triple_bottom と同じ方針で、各区間の最高値を採用する。
		const pTop1 = p1Cands.reduce((m, p) => (p.price > m.price ? p : m));
		const pTop2 = p2Cands.reduce((m, p) => (p.price > m.price ? p : m));

		// ネックライン水平性: 採用した 2 山の price 差をネックライン傾きとして見る。
		const peakMaxN = Math.max(pTop1.price, pTop2.price);
		const peakMinN = Math.min(pTop1.price, pTop2.price);
		const peakSpread = (peakMaxN - peakMinN) / Math.max(1, peakMaxN);
		if (peakSpread > necklineSpreadLimit) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'forming_neckline_not_horizontal',
				idxs: [valley1.idx, valley2.idx, lastIdx],
			});
			continue;
		}

		const avgPeakPrice = (pTop1.price + pTop2.price) / 2;

		// 現在価格は 3 谷目候補として valley 水準に近いことを要求する
		// （triple_top の currentDiff チェックと対称）。
		// 旧実装では currentPrice が avgValley*0.98 〜 avgPeak*1.02 まで広く許容され、
		// 「現在価格が中段にあるだけ」のケースを forming triple_bottom として拾っていた。
		const currentDiff = Math.abs(currentPrice - avgValleyPrice) / Math.max(1, avgValleyPrice);
		if (currentDiff > tripleTolerancePct || currentPrice > avgValleyPrice * 1.05) continue;

		// 階段状の切り下がり（valley1 > valley2 > current）は triple_bottom ではなく
		// 下降継続として扱う。level spread より具体的な診断のため最初に評価する。
		if (valley1.price > valley2.price && valley2.price > currentPrice) {
			const totalStep = (valley1.price - currentPrice) / Math.max(1, valley1.price);
			if (totalStep > FORMING_STAIR_STEP_LIMIT) {
				pcand({
					type: 'triple_bottom',
					accepted: false,
					reason: 'forming_stair_step_down',
					idxs: [valley1.idx, valley2.idx, lastIdx],
					pts: [
						{ role: 'valley1', idx: valley1.idx, price: valley1.price },
						{ role: 'valley2', idx: valley2.idx, price: valley2.price },
						{ role: 'current', idx: lastIdx, price: currentPrice },
					],
				});
				continue;
			}
		}

		// 3 谷（valley1, valley2, 現在価格）の水平性チェック。
		// 非単調な配置（例: 100 → 95 → 100）でも累積 spread が大きいケースを弾く。
		const levelMax = Math.max(valley1.price, valley2.price, currentPrice);
		const levelMin = Math.min(valley1.price, valley2.price, currentPrice);
		const levelSpread = (levelMax - levelMin) / Math.max(1, levelMax);
		if (levelSpread > levelSpreadLimit) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'forming_valleys_not_level',
				idxs: [valley1.idx, valley2.idx, lastIdx],
				pts: [
					{ role: 'valley1', idx: valley1.idx, price: valley1.price },
					{ role: 'valley2', idx: valley2.idx, price: valley2.price },
					{ role: 'current', idx: lastIdx, price: currentPrice },
				],
			});
			continue;
		}

		const formationBars = Math.max(0, lastIdx - valley1.idx);
		if (formationBars < formingBars.minBars || formationBars > formingBars.maxBars) {
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: 'forming_bars_out_of_range',
				idxs: [valley1.idx, valley2.idx, lastIdx],
				pts: [
					{ role: 'valley1', idx: valley1.idx, price: valley1.price },
					{ role: 'valley2', idx: valley2.idx, price: valley2.price },
					{ role: 'current', idx: lastIdx, price: currentPrice },
				],
			});
			continue;
		}

		const progress = (currentPrice - avgValleyPrice) / Math.max(1e-12, avgPeakPrice - avgValleyPrice);
		const completion = Math.min(1, 0.66 + Math.min(1, progress) * 0.34);
		const rawConfidence = Math.round((1 - valleyDiff / tripleTolerancePct) * 0.8 * 100) / 100;
		// 3 点目が現在価格で暫定のため、completed より低い上限に抑える。
		const confidence = Math.min(rawConfidence, FORMING_MAX_CONFIDENCE);

		if (completion < FORMING_MIN_COMPLETION || confidence < FORMING_MIN_CONFIDENCE) {
			// ネックラインの 2 山まで揃っているので成功エントリと同じ 5 点を積む（top 側と同じ理由）。
			pcand({
				type: 'triple_bottom',
				accepted: false,
				reason: completion < FORMING_MIN_COMPLETION ? 'forming_completion_below_min' : 'forming_confidence_below_min',
				idxs: [valley1.idx, valley2.idx, lastIdx],
				pts: [
					{ role: 'valley1', idx: valley1.idx, price: valley1.price },
					{ role: 'peak1', idx: pTop1.idx, price: pTop1.price },
					{ role: 'valley2', idx: valley2.idx, price: valley2.price },
					{ role: 'peak2', idx: pTop2.idx, price: pTop2.price },
					{ role: 'current', idx: lastIdx, price: currentPrice },
				],
			});
			continue;
		}

		// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
		const sizeReason = validatePatternSize(
			'bottom',
			[valley1, pTop1, valley2, pTop2, { extremePrice: currentPrice }],
			ctx.sizeThresholds,
		);
		if (sizeReason) {
			pcand({ type: 'triple_bottom', accepted: false, reason: sizeReason, idxs: [valley1.idx, valley2.idx, lastIdx] });
			continue;
		}

		// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
		// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
		const gate = applyReversalGate({
			candles,
			pivots,
			side: 'bottom',
			first: valley1,
			mid: pTop1,
			necklinePrice: avgPeakPrice,
			type: 'triple_bottom',
			indices: [valley1.idx, valley2.idx, lastIdx],
			debugCandidates: ctx.debugCandidates,
		});
		if (!gate) continue;
		const structureGate = buildStructureGate(gate);

		const neckline = [
			{ x: valley1.idx, y: avgPeakPrice },
			{ x: lastIdx, y: avgPeakPrice },
		];

		const formTbTarget = Math.round(avgPeakPrice + (avgPeakPrice - avgValleyPrice));

		// 成功エントリ（issue #158）。`indices` は既存の棄却エントリと同じ 3 点に揃え、
		// ネックラインを引いた 2 山は `points` にだけ足す。
		pcand({
			type: 'triple_bottom',
			accepted: true,
			status: 'forming',
			idxs: [valley1.idx, valley2.idx, lastIdx],
			pts: [
				{ role: 'valley1', idx: valley1.idx, price: valley1.price },
				{ role: 'peak1', idx: pTop1.idx, price: pTop1.price },
				{ role: 'valley2', idx: valley2.idx, price: valley2.price },
				{ role: 'peak2', idx: pTop2.idx, price: pTop2.price },
				{ role: 'current', idx: lastIdx, price: currentPrice },
			],
		});

		return {
			type: 'triple_bottom',
			confidence,
			range: { start: isoAt(valley1.idx), end: isoAt(lastIdx) },
			status: 'forming',
			pivots: [
				{ idx: valley1.idx, price: valley1.price, kind: 'L' as const, extremePrice: valley1.extremePrice },
				{ idx: valley2.idx, price: valley2.price, kind: 'L' as const, extremePrice: valley2.extremePrice },
			],
			neckline,
			...(structureGate ? { structureGate } : {}),
			trendlineLabel: 'ネックライン',
			breakoutTarget: formTbTarget,
			targetMethod: 'neckline_projection' as const,
			completionPct: Math.round(completion * 100),
			_method: 'forming_triple_bottom',
		};
	}
	return null;
}

// ── Main ──

export function detectTriples(ctx: DetectContext): DetectResult {
	const { want, includeForming } = ctx;
	const patterns: DeduplicablePattern[] = [];

	const wantTripleTop = want.size === 0 || want.has('triple_top');
	const wantTripleBottom = want.size === 0 || want.has('triple_bottom');

	if (wantTripleTop || wantTripleBottom) {
		if (wantTripleTop) patterns.push(...findStrictTripleTop(ctx));
		if (wantTripleBottom) patterns.push(...findStrictTripleBottom(ctx));

		// relaxed fallback (multi-stage 1.25, 2.0)
		for (const f of [1.25, 2.0]) {
			if (wantTripleTop && !patterns.some((p) => p.type === 'triple_top')) {
				const relaxed = findRelaxedTripleTop(ctx, f);
				if (relaxed) patterns.push(relaxed);
			}
			if (wantTripleBottom && !patterns.some((p) => p.type === 'triple_bottom')) {
				const relaxed = findRelaxedTripleBottom(ctx, f);
				if (relaxed) patterns.push(relaxed);
			}
		}
	}

	// 6b) 形成中トリプルトップ/ボトム
	if (includeForming && (wantTripleTop || wantTripleBottom)) {
		if (wantTripleTop) {
			const forming = tryFormingTripleTop(ctx);
			if (forming) patterns.push(forming);
		}
		if (wantTripleBottom) {
			const forming = tryFormingTripleBottom(ctx);
			if (forming) patterns.push(forming);
		}
	}

	// includeForming=false のとき、未ブレイクの構造（forming / near_completion）は返さない。
	// detect_wedges.ts と同じく検出器内で先に落とす。#133 以降 dedup は statusScore 最優先なので
	// completed が forming に押し出されることは無くなったが、要求されていない status の候補を
	// dedup の比較対象に混ぜない・検出器の出力契約を includeForming に一致させる意味で残している。
	const filtered = includeForming
		? patterns
		: patterns.filter((p) => p.status !== 'forming' && p.status !== 'near_completion');

	return { patterns: filtered };
}
