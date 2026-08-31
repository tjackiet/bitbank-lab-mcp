/**
 * Head & Shoulders / Inverse Head & Shoulders 検出（完成済み＋形成中）
 * detect_patterns.ts Section 3 から抽出
 *
 * 完成済み構造の右肩形成後にネックライン突破が確認できた場合は
 * confirmation = 'neckline_breakout' を立てて status = 'completed' を付与する
 * （detect_doubles / detect_triples と同方針）。未確認の場合は
 * status = 'near_completion' + confirmation = 'not_confirmed' で返し、
 * detect_patterns 側の `!p.status` フォールバックで誤って completed 扱い
 * されるのを防ぐ。ネックラインは 2 点を結ぶ傾きつきラインとして外挿する。
 */
import { generatePatternDiagram } from '../../lib/pattern-diagrams.js';
import { patternBarRange } from './bar-thresholds.js';
import { computeTargetReach, finalizeConf, periodScoreDays } from './helpers.js';
import { clamp01, marginFromRelDev, relDev } from './regression.js';
import { applyReversalGate, buildStructureGate } from './reversal-gate.js';
import {
	HS_NECKLINE_MAX_PCT,
	HS_SHOULDER_MAX_PCT,
	isSameLevel,
	type PriorTrendResult,
	validateHorizontalNeckline,
	validatePatternSize,
	validatePriorTrend,
} from './structural.js';
import type { Pivot } from './swing.js';
import type {
	CandleData,
	DeduplicablePattern,
	DetectContext,
	DetectResult,
	PatternConfirmation,
	PatternPrecedingTrend,
} from './types.js';

// ── Helper: PriorTrendResult → PatternPrecedingTrend ──

function buildPrecedingTrend(
	candles: CandleData[],
	trend: PriorTrendResult,
	startIdx: number,
): PatternPrecedingTrend | undefined {
	const startIso = candles[trend.priorStartIdx]?.isoTime;
	const endIso = candles[startIdx]?.isoTime;
	if (!startIso || !endIso) return undefined;
	return {
		start: startIso,
		end: endIso,
		direction: trend.classification,
		returnPct: Number((trend.priorReturn * 100).toFixed(2)),
		lookbackBars: trend.lookbackBars,
	};
}

// ── 定数 ──

const RELAXED_FACTORS = [
	{ shoulder: 1.6, head: 0.6, tag: 'x1.6_0.6' },
	{ shoulder: 2.0, head: 0.4, tag: 'x2.0_0.4' },
] as const;

const FORMING_RIGHT_TOLERANCE_PCT = 0.08;
/**
 * 形成中 H&S / 逆 H&S の形成期間の上限の日数由来。**実効値はバー数**で、
 * `getHsFormingBarParams` が `patterns/bar-thresholds.ts` の換算を通して決める。
 */
const FORMING_MAX_DAYS = 90;
/**
 * 形成中 H&S / 逆 H&S の形成期間の下限の日数由来。**実効値はバー数**で、
 * `getHsFormingBarParams` が `patterns/bar-thresholds.ts` の換算を通して決める。
 * ここの日数は「その値がどこから来たか」を示す注記であって、暦日数の要件ではない。
 */
export const FORMING_MIN_DAYS = 21;
/**
 * 形成中 H&S / 逆 H&S の完成度の下限。
 *
 * **現行の定数では到達しない。** `completion = min(1, (0.75 + 0.25 * progress) * (暫定右肩なら 0.9))`
 * で `progress ∈ [0, 1]` なので最小値は `0.75 * 0.9 = 0.675` になり、0.4 を下回れない
 * （実測でも合成 704 + 実データ 96 ケースで発火 0）。重み側（0.75 / 0.25 / 0.9）を触ったときに
 * 効き始めるガードとして残してあり、`completion_below_min` の理由コードもそのために積む。
 */
export const FORMING_MIN_COMPLETION = 0.4;
// detect_triples.ts と同値。形状不十分な forming 候補を上位表示させないための最低 confidence。
const FORMING_MIN_CONFIDENCE = 0.5;

/**
 * 形成中 H&S / 逆 H&S が要求する形成バー数のレンジ
 * （`formationBars = 右肩.idx - 左肩.idx`）。
 *
 * 旧実装は `patternDays = Math.round(formationBars × 手書き daysPerBar)` を作って 21〜90 日で
 * 判定していた。手書きの換算（`1day`→1 / `1week`→7 / **それ以外→1**）は intraday と `1month` を
 * 「1 日 / 本」に落とすため、`1month` は 21 バー = 21 ヶ月を要求し、intraday では日数閾値が
 * 偶然そのままバー数閾値として効いていた（issue #118 問題 3）。
 *
 * `detect_triples` の形成中判定（`getTripleFormingBarParams`）と同じ換算に統一してある
 * （日数由来も 21〜90 日で同値なので、両者の値は時間足を問わず一致する）。
 * `patterns/min-bars.ts` が「時間足 → 最小要求バー数」を導出するのに参照するため export する。
 */
export function getHsFormingBarParams(tf: string): { minBars: number; maxBars: number } {
	return patternBarRange(tf, FORMING_MIN_DAYS, FORMING_MAX_DAYS);
}

/**
 * 形成中 H&S / 逆 H&S の頭候補を**新しい順**に並べる（issue #154）。
 *
 * 旧実装は頭を「スキャン窓全体の最高値ピーク（逆 H&S は最安値の谷）」1 点に決め打ちし、
 * 他の頭候補を一切試さなかった。この決め方は**スキャン窓の左端に依存する**ため、
 * `limit` を上げて窓を広げると頭が過去側へ飛び、狭い窓で見えていた形成中パターンが
 * **候補として列挙されすらしなくなる**（#154 の症状: 1day で limit=90 → 1 件 /
 * limit=200 → 0 件）。窓を広げただけで検出が消えるのは利用者の期待に反する。
 *
 * **新しい順に列挙するのが単調性の鍵。** ピボット判定は前後 `swingDepth` 本だけを見る局所判定
 * なので、窓を左へ広げて増えるのは**より古い**頭候補だけで、既存の候補列の後ろに積まれる。
 * 列挙順が新しい順なら、広い窓は狭い窓の列挙を**接頭辞として含む**——狭い窓で見つかった
 * パターンは広い窓でも同じ頭から同じように見つかる。
 */
function headCandidatesNewestFirst<T extends Pivot>(list: readonly T[]): T[] {
	return [...list].sort((a, b) => b.idx - a.idx);
}

/**
 * 頭が**その形成区間の極値である**ことを検査する（issue #154）。
 *
 * 旧実装は頭を「窓全体の最高値ピーク / 最安値の谷」に決め打ちしていたため、この条件は
 * **暗黙に成立していた**（窓全体の極値は当然その部分区間の極値でもある）。頭候補を総当たりに
 * 変えるとこの暗黙の保証が外れ、`[左肩, 右肩]` の内側に頭より極端な同種ピボットがあっても
 * 通ってしまう（実測: `completed_falling_wedge` fixture が頭 idx 12=112 で逆 H&S として通り、
 * 同区間に idx 33=100 が居た）。区間内により極端な同種ピボットがあるなら、それは頭の取り違え。
 *
 * **判定は区間の内側だけを見るのでスキャン窓に依存しない**——単調性を壊さずに暗黙の保証を戻す。
 *
 * **比較は `price`（終値）で行い、`extremePrice`（ヒゲ）では行わない。** 戻そうとしている暗黙の
 * 保証が `confirmedPeaks.reduce((best, p) => p.price > best.price ? ...)`、すなわち**終値基準の
 * 極値**だったため。ヒゲ基準にすると別の（より厳しい）不変条件を課すことになり、旧実装が通していた
 * 読みを落としかねない。`swing.ts` が「判定は high/low、格納価格は close（ヒゲ影響を回避）」と
 * 定めているとおり、本ファイルの構造比較（左肩の 3% 判定・右肩の近接判定）もすべて `price` 側で
 * 揃っている。実測でも両者の差は出ない——合成 704 ケース + 実データ 288 ケースのいずれも差分 0。
 */
function headIsExtremeInSpan(
	sameKindPivots: readonly Pivot[],
	head: Pivot,
	fromIdx: number,
	toIdx: number,
	isTop: boolean,
): boolean {
	return !sameKindPivots.some(
		(p) =>
			p.idx > fromIdx && p.idx < toIdx && p.idx !== head.idx && (isTop ? p.price > head.price : p.price < head.price),
	);
}

// ── ネックラインブレイク検出（detect_doubles / detect_triples と同値の 1.5% バッファ） ──
// H&S は傾きつきネックライン（谷1→谷2 / 山1→山2）を外挿して判定する。
const HS_BREAKOUT_BUFFER_PCT = 0.015;
// 右肩から最大何バー後までブレイクをスキャンするか。aftermath.ts と同じ 30 を採用。
// 例: 日足で右肩から約 4 週間後までのブレイクを拾える。
const HS_BREAKOUT_MAX_BARS = 30;

// ── Helper: ネックライン補間 ──

type NecklinePt = { x: number; y: number };

function necklineAt(neckline: NecklinePt[] | undefined, i: number): number {
	if (!Array.isArray(neckline) || neckline.length < 2) return NaN;
	const [a, b] = neckline;
	if (!(Number.isFinite(a?.x) && Number.isFinite(b?.x) && Number.isFinite(a?.y) && Number.isFinite(b?.y))) return NaN;
	if (b.x === a.x) return a.y;
	return a.y + ((b.y - a.y) * (i - a.x)) / (b.x - a.x);
}

// ── Helper: 右肩後のネックラインブレイクインデックスを検出 ──
// direction='below': H&S（close < necklineAt * (1 - buffer)）
// direction='above': 逆H&S（close > necklineAt * (1 + buffer)）

function findHsBreakoutIdx(
	candles: CandleData[],
	neckline: NecklinePt[],
	rightShoulderIdx: number,
	direction: 'below' | 'above',
): number {
	const end = Math.min(rightShoulderIdx + HS_BREAKOUT_MAX_BARS + 1, candles.length);
	for (let k = rightShoulderIdx + 1; k < end; k++) {
		const closeK = Number(candles[k]?.close ?? NaN);
		if (!Number.isFinite(closeK)) continue;
		const nlPrice = necklineAt(neckline, k);
		if (!Number.isFinite(nlPrice)) continue;
		if (direction === 'below' && closeK < nlPrice * (1 - HS_BREAKOUT_BUFFER_PCT)) return k;
		if (direction === 'above' && closeK > nlPrice * (1 + HS_BREAKOUT_BUFFER_PCT)) return k;
	}
	return -1;
}

// ── Helper: ブレイク確認済み / 未確認に応じた完成フィールド ──
//
// 確認済み: status='completed', confirmation=neckline_breakout, breakout 系メタ一式 + outcome='success'
// 未確認:   status='near_completion', confirmation=not_confirmed
//
// `!p.status` を completed 扱いする detect_patterns.ts のフォールバック対策として
// 未確認時にも status を明示的に設定する。

type HsCompletionFields = {
	status: 'completed' | 'near_completion';
	confirmation: PatternConfirmation;
	breakout?: { idx: number; price: number };
	breakoutBarIndex?: number;
	breakoutDate?: string;
	breakoutDirection?: 'up' | 'down';
	outcome?: 'success';
	rangeEnd: string;
};

function buildHsCompletionFields(
	candles: CandleData[],
	breakoutIdx: number,
	direction: 'down' | 'up',
	structureEndIso: string,
): HsCompletionFields | null {
	if (breakoutIdx < 0) {
		return {
			status: 'near_completion',
			confirmation: { type: 'not_confirmed' },
			rangeEnd: structureEndIso,
		};
	}
	const breakoutDate = candles[breakoutIdx]?.isoTime;
	const breakoutPrice = Number(candles[breakoutIdx]?.close ?? NaN);
	if (!breakoutDate || !Number.isFinite(breakoutPrice)) return null;
	return {
		status: 'completed',
		confirmation: {
			type: 'neckline_breakout',
			date: breakoutDate,
			idx: breakoutIdx,
			price: breakoutPrice,
		},
		breakout: { idx: breakoutIdx, price: breakoutPrice },
		breakoutBarIndex: breakoutIdx,
		breakoutDate,
		breakoutDirection: direction === 'down' ? 'down' : 'up',
		outcome: 'success',
		rangeEnd: breakoutDate,
	};
}

// ── Helper: 候補 5 点窓の生成（issue #146） ──

/** 候補 5 点窓。`p0`=左肩 / `p1`=谷1 / `p2`=頭 / `p3`=谷2 / `p4`=右肩（逆 H&S は谷↔山が入れ替わる）。 */
interface HsWindow {
	p0: Pivot;
	p1: Pivot;
	p2: Pivot;
	p3: Pivot;
	p4: Pivot;
}

/**
 * 探索する肩の組（左肩 × 右肩）の上限。
 *
 * 窓生成は肩リストの**全ペア**を見るので組数は肩の数の 2 乗で増える。`limit` の
 * スキーマ上限 365 本を最小の `swingDepth=2` で走らせても肩は 90 個前後（2 本に 1 つが
 * ピボット、その半分が肩）で 4,000 組ほどにしかならないため、実運用では到達しない。
 * 病的な入力（極端に多いピボット）で探索が発散しないための歯止めとして置く。
 */
const HS_MAX_SHOULDER_PAIRS = 5000;

/**
 * `list`（idx 昇順）から `(loIdx, hiIdx)` の**開区間**にある極値ピボットを返す。
 * `lower=true` なら最安値、`false` なら最高値。該当が無ければ `null`。
 *
 * 価格基準が `price`（終値）なのは `detect_triples` の谷 / 山の採用（`v.price < m.price`）と、
 * 既存の relaxed / 形成中 H&S の頭の採用（`p.price > best.price`）に合わせるため。
 * 後段の `headHigher` / `shouldersNear` / ネックラインも同じ `price` を見る。
 */
function extremeBetween(list: ReadonlyArray<Pivot>, loIdx: number, hiIdx: number, lower: boolean): Pivot | null {
	let best: Pivot | null = null;
	for (const p of list) {
		if (p.idx <= loIdx) continue;
		if (p.idx >= hiIdx) break;
		if (!best || (lower ? p.price < best.price : p.price > best.price)) best = p;
	}
	return best;
}

/**
 * 外側の脚（肩 ↔ 隣のネックライン点）に、`shoulder` を**明確に超える**肩が無いかを見る。
 *
 * 「明確に超える」は `HS_SHOULDER_MAX_PCT` を超えて高い（逆 H&S は低い）こと。同水準なら
 * 幅のある肩の一部として通す——双子の山で肩がわずかに低い側に当たっただけで窓が消えると、
 * 実在する H&S を落とすため（`enumerateHsWindows` の呼び出し箇所のコメント）。
 */
function outerShoulderOk(
	shoulders: ReadonlyArray<Pivot>,
	shoulder: Pivot,
	loIdx: number,
	hiIdx: number,
	isTop: boolean,
): boolean {
	const outer = extremeBetween(shoulders, loIdx, hiIdx, !isTop);
	if (!outer) return true;
	const beyond = isTop ? outer.price > shoulder.price : outer.price < shoulder.price;
	if (!beyond) return true;
	return isSameLevel(outer.price, shoulder.price, HS_SHOULDER_MAX_PCT);
}

/**
 * 肩が同水準でないときの棄却理由コード（issue #172）。
 *
 * 肩の判定は**同じ指標（左右肩の相対差）を 2 つの閾値で測る AND**で、実効閾値は
 * `min(tolerancePct, HS_SHOULDER_MAX_PCT)`。ところが理由コードが `shoulders_not_near`
 * の 1 種類しかなかったため、**`view=debug` を `reason` で集計するとどちらのゲートで
 * 落ちたかが消えていた**。#152 / #167 はこれを見て「`HS_SHOULDER_MAX_PCT` が律速」と
 * 帰属し、存在しない偽陰性を追って issue が 2 本立った（実測では `HS_SHOULDER_MAX_PCT`
 * 律速は全時間足で 0 件、支配的なのは `:both`）。`view=debug` は LLM が理由コードで
 * 集計する導線（#144 / #145）なので、同じ誤読を LLM もする。
 *
 * 接尾辞はファイル内の既存 idiom（`prior_trend_mismatch:${classification}`）に合わせる。
 *
 * | コード | 意味 | 緩めれば通るか |
 * |---|---|---|
 * | `shoulders_not_near:tolerance` | `tolerancePct` のみ超過 | `tolerancePct` を緩めれば通る |
 * | `shoulders_not_near:cap` | {@link HS_SHOULDER_MAX_PCT} のみ超過 | 定数を緩めれば通る |
 * | `shoulders_not_near:both` | 両方超過 | **どちらを緩めても通らない** |
 *
 * `:cap` は `tolerancePct > HS_SHOULDER_MAX_PCT` のときしか発火しない。tf-auto でそう
 * なるのは `15min` / `30min`（0.06 > 0.05）だけで、他の時間足では呼び出し側が
 * `tolerancePct` を 0.05 超で明示したときに限る（{@link HS_SHOULDER_MAX_PCT} の docstring）。
 */
function shouldersNotNearReason(withinTolerance: boolean, withinCap: boolean): string {
	if (!withinTolerance && !withinCap) return 'shoulders_not_near:both';
	return withinTolerance ? 'shoulders_not_near:cap' : 'shoulders_not_near:tolerance';
}

/**
 * H&S / 逆 H&S の候補 5 点窓を列挙する（issue #146）。
 *
 * 旧実装は `pivots` の**配列上で連続する 5 点**を取り、それが `H-L-H-L-H`（逆は `L-H-L-H-L`）
 * であることを要求していた。この「交互列要求」は 2 通りの実データの崩れ方に脆い:
 *
 * - 浅い谷が `swingDepth` の粒度で消え、左肩と頭が `H→H` で連続する
 * - 頭の直後に別の高値が挟まり、頭より右の交互が崩れる
 *
 * どちらも**頭を中心とした窓が一度も生成されない**ため、`view=debug` の candidates にも
 * 棄却理由が残らない（「候補は生成されるが判定で落ちる」#138 / #139 / #140 とは別クラスの偽陰性）。
 *
 * そこで `detect_triples` の窓生成（山リストだけを見て 3 山を取り、間に何が挟まっても窓は作る）に
 * 寄せる。**肩リストから肩 2 つを取り、その間の最高値（逆 H&S は最安値）を頭に、
 * 谷は「肩と頭の間」の各区間から取る。**
 *
 * **本関数の窓は旧実装の窓の上位集合で、それは交互列が崩れていない区間でも同じ。**
 * 肩 2 つの間に肩が 1 つだけの組（`gap=2`）は旧実装と同じ 5 点になるが、
 * **間に肩を跨ぐ組（`gap>=3`）は旧実装が作れなかった窓**で、これは厳密に交互する列
 * （`H L H L H L H`）でも出る。例えば肩 `h0 h1 h2 h3` の `(h0, h3)` は、間の最高値
 * `max(h1, h2)` を頭に、`h1`（または `h2`）と間の谷 1 つを跨いだ 5 点になる。
 * **#146 の 5 点自体が `gap=3` の窓**（肩リスト `[左肩, 頭, 余計な高値, 右肩]` の第 1 と第 4）なので、
 * `gap=2` に限れば本 issue は解けない。
 *
 * 増えるのは窓であって検出ではない。品質保証は窓生成ではなく後段のゲート
 * （サイズ検査 #139 / 構造ゲート #140 / 先行トレンド / ネックライン水平性）が担う設計で、
 * 実測でも合成 fixture 704 ケースの `data.patterns` は完全一致・実データ 96 ケースは
 * 追加のみ・消失ゼロだった（CHANGELOG）。
 *
 * **列挙順は「肩リスト上の間隔（`gap`）が狭い順」。** 旧実装が作れた窓は必ず `gap=2` なので、
 * これで**狭い（＝より具体的な）読みが先に並ぶ**。窓を全件評価する strict 経路では
 * 順序は結果に効かないが、順序依存の呼び出し元を後から足したときに
 * 「まず狭い窓を見る」ことが保証されるようにしてある。
 *
 * **本関数を使うのは strict の 2 経路だけで、`findRelaxedHS` / `findRelaxedInverseHS` は
 * 旧実装のまま**（意図的な限定。#146）。relaxed は `RELAXED_FACTORS` を厳しい段から
 * 順に試して**最初に条件を満たした窓で早期 `return`** するため、窓が増えると緩い段へ
 * 落ちる前に厳しい段が別の窓を拾い、実データで**完成済み H&S が `near_completion` に
 * 置き換わって消える**（実測は CHANGELOG）。strict だけなら実データ 96 ケースで
 * 差分は**追加のみ・消失ゼロ**。#146 の 5 点は strict の許容誤差で通るので、
 * relaxed へ広げなくても本 issue は解ける。
 *
 * 窓にしない組は 2 つ:
 * - 谷が片側でも取れない組（ネックラインの 2 点が張れない）
 * - 肩が窓の最高値（逆 H&S は最安値）になる組。どう読んでも H&S ではないので
 *   候補にせず `view=debug` も汚さない。**許容誤差のマージン不足はここでは落とさない**
 *   ——それは窓生成ではなく判定の問題で、`head_not_higher` として debug に残す価値がある
 */
function enumerateHsWindows(ctx: DetectContext, side: 'top' | 'bottom'): HsWindow[] {
	const { pivots, minDist } = ctx;
	const isTop = side === 'top';
	const shoulders = pivots.filter((p) => p.kind === (isTop ? 'H' : 'L'));
	const mids = pivots.filter((p) => p.kind === (isTop ? 'L' : 'H'));
	const windows: HsWindow[] = [];
	let pairs = 0;

	// gap = 肩リスト上の左肩 → 右肩の距離。間に肩が 1 つ以上要るので 2 から始める。
	for (let gap = 2; gap < shoulders.length; gap++) {
		for (let i = 0; i + gap < shoulders.length; i++) {
			if (++pairs > HS_MAX_SHOULDER_PAIRS) return windows;
			const p0 = shoulders[i];
			const p4 = shoulders[i + gap];
			// 頭は肩 2 つの間の最高値（逆 H&S は最安値）。
			const p2 = extremeBetween(shoulders, p0.idx, p4.idx, !isTop);
			if (!p2) continue;
			if (isTop ? !(p2.price > p0.price && p2.price > p4.price) : !(p2.price < p0.price && p2.price < p4.price))
				continue;
			// ネックラインの 2 点は「肩と頭の間」の各区間の最安値（逆 H&S は最高値）。
			const p1 = extremeBetween(mids, p0.idx, p2.idx, isTop);
			const p3 = extremeBetween(mids, p2.idx, p4.idx, isTop);
			if (!p1 || !p3) continue;
			// **外側の脚（肩 ↔ 隣のネックライン点）に、肩を明確に超える肩があってはならない。**
			// 超えているなら、その肩こそが左肩 / 右肩であって、この組は肩を取り違えた読みでしかない
			// （取り違えていない読みは別の組として列挙されるので、パターンを落とすのではなく
			// 誤った anchor を落とすだけ）。
			//
			// **「明確に超える」を `HS_SHOULDER_MAX_PCT` で測るのが肝。** 単純な `>` にすると、
			// 双子の山（実データの BTC/JPY 日足 idx 38 と 42 は差 0.08%）で肩がわずかに低い側に
			// 当たっただけで窓が消え、**実在する H&S を落とす**（実測で実データの改善が全て消えた）。
			// 同水準なら「幅のある肩」の一部とみなして通し、肩として別格に高いものだけを弾く。
			if (!outerShoulderOk(shoulders, p0, p0.idx, p1.idx, isTop)) continue;
			if (!outerShoulderOk(shoulders, p4, p3.idx, p4.idx, isTop)) continue;
			if (
				p1.idx - p0.idx < minDist ||
				p2.idx - p1.idx < minDist ||
				p3.idx - p2.idx < minDist ||
				p4.idx - p3.idx < minDist
			)
				continue;
			windows.push({ p0, p1, p2, p3, p4 });
		}
	}
	return windows;
}

// ── Helper: Strict Inverse H&S (L-H-L-H-L) ──

function findStrictInverseHS(ctx: DetectContext): { patterns: DeduplicablePattern[]; found: boolean } {
	const { candles, pivots, tolerancePct, headProminencePct, near, debugCandidates } = ctx;
	const patterns: DeduplicablePattern[] = [];
	let found = false;

	for (const { p0, p1, p2, p3, p4 } of enumerateHsWindows(ctx, 'bottom')) {
		// 肩は 2 ゲートの AND。どちらの conjunct で落ちたかを `reason` に出すため短絡評価をやめて
		// 別々に評価する（`near` / `isSameLevel` とも副作用の無い純粋比較なので判定は不変。issue #172）。
		const shouldersWithinTolerance = near(p0.price, p4.price);
		const shouldersWithinCap = isSameLevel(p0.price, p4.price, HS_SHOULDER_MAX_PCT);
		const shouldersNear = shouldersWithinTolerance && shouldersWithinCap;
		const headLower = p2.price < Math.min(p0.price, p4.price) * (1 - headProminencePct);
		const necklineCheck = validateHorizontalNeckline(p1.price, p3.price, HS_NECKLINE_MAX_PCT);
		if (shouldersNear && headLower && necklineCheck.ok) {
			const start = candles[p0.idx].isoTime;
			const end = candles[p4.idx].isoTime;
			if (start && end) {
				const trend = validatePriorTrend(candles, p0.idx, p4.idx - p0.idx, 'down_or_sideways');
				if (!trend.ok) {
					debugCandidates.push({
						type: 'inverse_head_and_shoulders',
						accepted: false,
						reason: `prior_trend_mismatch:${trend.classification}`,
						indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
					});
					continue;
				}
				if (trend.classification === 'insufficient_data') {
					debugCandidates.push({
						type: 'inverse_head_and_shoulders',
						accepted: true,
						reason: 'prior_trend_insufficient_data',
						indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
					});
				}
				// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
				const sizeReason = validatePatternSize('bottom', [p0, p1, p2, p3, p4], ctx.sizeThresholds);
				if (sizeReason) {
					debugCandidates.push({
						type: 'inverse_head_and_shoulders',
						accepted: false,
						reason: sizeReason,
						indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
					});
					continue;
				}
				const neckline = [
					{ x: p1.idx, y: p1.price },
					{ x: p3.idx, y: p3.price },
				];
				const nlAvg = (Number(p1.price) + Number(p3.price)) / 2;

				// ネックライン水準は**ブレイク判定（findHsBreakoutIdx）に渡す線と同じ**ものを構造ゲートへ渡す
				// （`ReversalStructureInput.necklinePrice` の docstring）。線は p1 / p3 の 2 点で張るが、
				// ゲートは第1構成点より手前を遡るので**スカラーの水準**が要る。`validateHorizontalNeckline` が
				// 既に |p1 - p3| <= HS_NECKLINE_MAX_PCT を課しているため、2 点の平均が線の代表値になる。
				// 傾きを外挿して遡ると、探索窓 60 本ぶんの外挿誤差が水準そのものより大きくなり得る。
				// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
				// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
				const gate = applyReversalGate({
					candles,
					pivots,
					side: 'bottom',
					first: p0,
					mid: p1,
					necklinePrice: nlAvg,
					type: 'inverse_head_and_shoulders',
					indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
					debugCandidates,
				});
				if (!gate) continue;
				const structureGate = buildStructureGate(gate);

				const tolMargin = marginFromRelDev(relDev(p0.price, p4.price), tolerancePct);
				const symmetry = clamp01(1 - relDev(p0.price, p4.price));
				const per = periodScoreDays(start, end);
				const base = (tolMargin + symmetry + per) / 3;
				const confidence = finalizeConf(base, 'inverse_head_and_shoulders');
				// 右肩後のネックライン上抜けを確認する。
				const breakoutIdx = findHsBreakoutIdx(candles, neckline, p4.idx, 'above');
				const completion = buildHsCompletionFields(candles, breakoutIdx, 'up', end);
				if (!completion) continue;
				const rangeEnd = completion.rangeEnd;
				const diagram = generatePatternDiagram(
					'inverse_head_and_shoulders',
					[
						{ ...p0, date: candles[p0.idx]?.isoTime },
						{ ...p1, date: candles[p1.idx]?.isoTime },
						{ ...p2, date: candles[p2.idx]?.isoTime },
						{ ...p3, date: candles[p3.idx]?.isoTime },
						{ ...p4, date: candles[p4.idx]?.isoTime },
					],
					{ price: nlAvg },
					{ start, end: rangeEnd },
				);
				// ターゲットはブレイク日（または右肩日）時点のネックライン値を基準に算出する。
				const targetAnchorIdx = breakoutIdx >= 0 ? breakoutIdx : p4.idx;
				const nlAtAnchor = necklineAt(neckline, targetAnchorIdx);
				const ihsTarget = Math.round(
					(Number.isFinite(nlAtAnchor) ? nlAtAnchor : nlAvg) +
						((Number.isFinite(nlAtAnchor) ? nlAtAnchor : nlAvg) - p2.price),
				);
				const ihsReach = completion.breakout
					? computeTargetReach(candles, breakoutIdx, completion.breakout.price, ihsTarget, 'up')
					: undefined;
				const ihsPrecedingTrend = buildPrecedingTrend(candles, trend, p0.idx);

				patterns.push({
					type: 'inverse_head_and_shoulders',
					confidence,
					range: { start, end: rangeEnd },
					structureRange: { start, end },
					status: completion.status,
					confirmation: completion.confirmation,
					...(completion.breakout ? { breakout: completion.breakout } : {}),
					...(completion.breakoutBarIndex !== undefined ? { breakoutBarIndex: completion.breakoutBarIndex } : {}),
					...(completion.breakoutDate ? { breakoutDate: completion.breakoutDate } : {}),
					...(completion.breakoutDirection ? { breakoutDirection: completion.breakoutDirection } : {}),
					...(completion.outcome ? { outcome: completion.outcome } : {}),
					...(ihsPrecedingTrend ? { precedingTrend: ihsPrecedingTrend } : {}),
					pivots: [p0, p1, p2, p3, p4],
					neckline,
					...(structureGate ? { structureGate } : {}),
					trendlineLabel: 'ネックライン',
					breakoutTarget: ihsTarget,
					targetMethod: 'neckline_projection' as const,
					...(ihsReach
						? {
								targetReachedPct: ihsReach.targetReachedPct,
								targetReached: ihsReach.targetReached,
								...(ihsReach.targetReachedDate ? { targetReachedDate: ihsReach.targetReachedDate } : {}),
								targetReachedPrice: ihsReach.targetReachedPrice,
							}
						: {}),
					structureDiagram: diagram,
				});
				found = true;
				debugCandidates.push({
					type: 'inverse_head_and_shoulders',
					accepted: true,
					indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
					points: [
						{ role: 'left_shoulder', idx: p0.idx, price: p0.price, isoTime: candles[p0.idx]?.isoTime },
						{ role: 'peak1', idx: p1.idx, price: p1.price, isoTime: candles[p1.idx]?.isoTime },
						{ role: 'head', idx: p2.idx, price: p2.price, isoTime: candles[p2.idx]?.isoTime },
						{ role: 'peak2', idx: p3.idx, price: p3.price, isoTime: candles[p3.idx]?.isoTime },
						{ role: 'right_shoulder', idx: p4.idx, price: p4.price, isoTime: candles[p4.idx]?.isoTime },
					],
				});
			}
		} else {
			const reason = !shouldersNear
				? shouldersNotNearReason(shouldersWithinTolerance, shouldersWithinCap)
				: !headLower
					? 'head_not_lower'
					: !necklineCheck.ok
						? 'neckline_not_horizontal'
						: 'unknown';
			debugCandidates.push({
				type: 'inverse_head_and_shoulders',
				accepted: false,
				reason,
				details: {
					leftShoulder: p0.price,
					rightShoulder: p4.price,
					shouldersDiff: Math.abs(p0.price - p4.price),
					shouldersDiffPct: Math.abs(p0.price - p4.price) / Math.max(1, Math.max(p0.price, p4.price)),
					shoulderMaxPct: HS_SHOULDER_MAX_PCT,
					tolerancePct,
					head: p2.price,
					headProminencePct,
					necklineP1: p1.price,
					necklineP3: p3.price,
					necklineDiffPct: necklineCheck.diffPct,
					necklineMaxPct: HS_NECKLINE_MAX_PCT,
				},
				indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
			});
		}
	}

	return { patterns, found };
}

// ── Helper: Strict H&S (H-L-H-L-H) ──

function findStrictHS(ctx: DetectContext): { patterns: DeduplicablePattern[]; found: boolean } {
	const { candles, pivots, tolerancePct, headProminencePct, near, debugCandidates } = ctx;
	const patterns: DeduplicablePattern[] = [];
	let found = false;

	for (const { p0, p1, p2, p3, p4 } of enumerateHsWindows(ctx, 'top')) {
		// 肩は 2 ゲートの AND。どちらの conjunct で落ちたかを `reason` に出すため短絡評価をやめて
		// 別々に評価する（`near` / `isSameLevel` とも副作用の無い純粋比較なので判定は不変。issue #172）。
		const shouldersWithinTolerance = near(p0.price, p4.price);
		const shouldersWithinCap = isSameLevel(p0.price, p4.price, HS_SHOULDER_MAX_PCT);
		const shouldersNear = shouldersWithinTolerance && shouldersWithinCap;
		const headHigher = p2.price > Math.max(p0.price, p4.price) * (1 + headProminencePct);
		const necklineCheck = validateHorizontalNeckline(p1.price, p3.price, HS_NECKLINE_MAX_PCT);
		if (shouldersNear && headHigher && necklineCheck.ok) {
			const start = candles[p0.idx].isoTime;
			const end = candles[p4.idx].isoTime;
			if (start && end) {
				const trend = validatePriorTrend(candles, p0.idx, p4.idx - p0.idx, 'up_or_sideways');
				if (!trend.ok) {
					debugCandidates.push({
						type: 'head_and_shoulders',
						accepted: false,
						reason: `prior_trend_mismatch:${trend.classification}`,
						indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
					});
					continue;
				}
				if (trend.classification === 'insufficient_data') {
					debugCandidates.push({
						type: 'head_and_shoulders',
						accepted: true,
						reason: 'prior_trend_insufficient_data',
						indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
					});
				}
				// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
				const sizeReason = validatePatternSize('top', [p0, p1, p2, p3, p4], ctx.sizeThresholds);
				if (sizeReason) {
					debugCandidates.push({
						type: 'head_and_shoulders',
						accepted: false,
						reason: sizeReason,
						indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
					});
					continue;
				}
				const neckline = [
					{ x: p1.idx, y: p1.price },
					{ x: p3.idx, y: p3.price },
				];
				const nlAvg = (Number(p1.price) + Number(p3.price)) / 2;

				// ネックライン水準は**ブレイク判定（findHsBreakoutIdx）に渡す線と同じ**ものを構造ゲートへ渡す
				// （`ReversalStructureInput.necklinePrice` の docstring）。線は p1 / p3 の 2 点で張るが、
				// ゲートは第1構成点より手前を遡るので**スカラーの水準**が要る。`validateHorizontalNeckline` が
				// 既に |p1 - p3| <= HS_NECKLINE_MAX_PCT を課しているため、2 点の平均が線の代表値になる。
				// 傾きを外挿して遡ると、探索窓 60 本ぶんの外挿誤差が水準そのものより大きくなり得る。
				// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
				// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
				const gate = applyReversalGate({
					candles,
					pivots,
					side: 'top',
					first: p0,
					mid: p1,
					necklinePrice: nlAvg,
					type: 'head_and_shoulders',
					indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
					debugCandidates,
				});
				if (!gate) continue;
				const structureGate = buildStructureGate(gate);

				const tolMargin = marginFromRelDev(relDev(p0.price, p4.price), tolerancePct);
				const symmetry = clamp01(1 - relDev(p0.price, p4.price));
				const per = periodScoreDays(start, end);
				const base = (tolMargin + symmetry + per) / 3;
				const confidence = finalizeConf(base, 'head_and_shoulders');
				// 右肩後のネックライン下抜けを確認する。
				const breakoutIdx = findHsBreakoutIdx(candles, neckline, p4.idx, 'below');
				const completion = buildHsCompletionFields(candles, breakoutIdx, 'down', end);
				if (!completion) continue;
				const rangeEnd = completion.rangeEnd;
				const diagram = generatePatternDiagram(
					'head_and_shoulders',
					[
						{ ...p0, date: candles[p0.idx]?.isoTime },
						{ ...p1, date: candles[p1.idx]?.isoTime },
						{ ...p2, date: candles[p2.idx]?.isoTime },
						{ ...p3, date: candles[p3.idx]?.isoTime },
						{ ...p4, date: candles[p4.idx]?.isoTime },
					],
					{ price: nlAvg },
					{ start, end: rangeEnd },
				);
				// ターゲットはブレイク日（または右肩日）時点のネックライン値を基準に算出する。
				const targetAnchorIdx = breakoutIdx >= 0 ? breakoutIdx : p4.idx;
				const nlAtAnchor = necklineAt(neckline, targetAnchorIdx);
				const hsTarget = Math.round(
					(Number.isFinite(nlAtAnchor) ? nlAtAnchor : nlAvg) -
						(p2.price - (Number.isFinite(nlAtAnchor) ? nlAtAnchor : nlAvg)),
				);
				const hsReach = completion.breakout
					? computeTargetReach(candles, breakoutIdx, completion.breakout.price, hsTarget, 'down')
					: undefined;
				const hsPrecedingTrend = buildPrecedingTrend(candles, trend, p0.idx);

				patterns.push({
					type: 'head_and_shoulders',
					confidence,
					range: { start, end: rangeEnd },
					structureRange: { start, end },
					status: completion.status,
					confirmation: completion.confirmation,
					...(completion.breakout ? { breakout: completion.breakout } : {}),
					...(completion.breakoutBarIndex !== undefined ? { breakoutBarIndex: completion.breakoutBarIndex } : {}),
					...(completion.breakoutDate ? { breakoutDate: completion.breakoutDate } : {}),
					...(completion.breakoutDirection ? { breakoutDirection: completion.breakoutDirection } : {}),
					...(completion.outcome ? { outcome: completion.outcome } : {}),
					...(hsPrecedingTrend ? { precedingTrend: hsPrecedingTrend } : {}),
					pivots: [p0, p1, p2, p3, p4],
					neckline,
					...(structureGate ? { structureGate } : {}),
					trendlineLabel: 'ネックライン',
					breakoutTarget: hsTarget,
					targetMethod: 'neckline_projection' as const,
					...(hsReach
						? {
								targetReachedPct: hsReach.targetReachedPct,
								targetReached: hsReach.targetReached,
								...(hsReach.targetReachedDate ? { targetReachedDate: hsReach.targetReachedDate } : {}),
								targetReachedPrice: hsReach.targetReachedPrice,
							}
						: {}),
					structureDiagram: diagram,
				});
				found = true;
				debugCandidates.push({
					type: 'head_and_shoulders',
					accepted: true,
					indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
					points: [
						{ role: 'left_shoulder', idx: p0.idx, price: p0.price, isoTime: candles[p0.idx]?.isoTime },
						{ role: 'valley1', idx: p1.idx, price: p1.price, isoTime: candles[p1.idx]?.isoTime },
						{ role: 'head', idx: p2.idx, price: p2.price, isoTime: candles[p2.idx]?.isoTime },
						{ role: 'valley2', idx: p3.idx, price: p3.price, isoTime: candles[p3.idx]?.isoTime },
						{ role: 'right_shoulder', idx: p4.idx, price: p4.price, isoTime: candles[p4.idx]?.isoTime },
					],
				});
			}
		} else {
			const reason = !shouldersNear
				? shouldersNotNearReason(shouldersWithinTolerance, shouldersWithinCap)
				: !headHigher
					? 'head_not_higher'
					: !necklineCheck.ok
						? 'neckline_not_horizontal'
						: 'unknown';
			debugCandidates.push({
				type: 'head_and_shoulders',
				accepted: false,
				reason,
				details: {
					leftShoulder: p0.price,
					rightShoulder: p4.price,
					shouldersDiff: Math.abs(p0.price - p4.price),
					shouldersDiffPct: Math.abs(p0.price - p4.price) / Math.max(1, Math.max(p0.price, p4.price)),
					shoulderMaxPct: HS_SHOULDER_MAX_PCT,
					tolerancePct,
					head: p2.price,
					headProminencePct,
					necklineP1: p1.price,
					necklineP3: p3.price,
					necklineDiffPct: necklineCheck.diffPct,
					necklineMaxPct: HS_NECKLINE_MAX_PCT,
				},
				indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
			});
		}
	}

	return { patterns, found };
}

// ── Helper: Relaxed H&S fallback ──

function findRelaxedHS(ctx: DetectContext): DeduplicablePattern | null {
	const { candles, pivots, allValleys, tolerancePct, headProminencePct, minDist, debugCandidates } = ctx;

	for (const factors of RELAXED_FACTORS) {
		for (let i = 0; i < pivots.length - 4; i++) {
			const p0 = pivots[i],
				p1 = pivots[i + 1],
				p2 = pivots[i + 2],
				p3 = pivots[i + 3],
				p4 = pivots[i + 4];
			if (!(p0.kind === 'H' && p1.kind === 'L' && p2.kind === 'H' && p3.kind === 'L' && p4.kind === 'H')) continue;
			if (
				p1.idx - p0.idx < minDist ||
				p2.idx - p1.idx < minDist ||
				p3.idx - p2.idx < minDist ||
				p4.idx - p3.idx < minDist
			)
				continue;
			const shouldersNearRelaxed =
				Math.abs(p0.price - p4.price) / Math.max(1, Math.max(p0.price, p4.price)) <= tolerancePct * factors.shoulder &&
				isSameLevel(p0.price, p4.price, HS_SHOULDER_MAX_PCT);
			const headHigherRelaxed = p2.price > Math.max(p0.price, p4.price) * (1 + headProminencePct * factors.head);
			const necklineCheck = validateHorizontalNeckline(p1.price, p3.price, HS_NECKLINE_MAX_PCT);
			if (!shouldersNearRelaxed || !headHigherRelaxed || !necklineCheck.ok) {
				if (shouldersNearRelaxed && headHigherRelaxed && !necklineCheck.ok) {
					debugCandidates.push({
						type: 'head_and_shoulders',
						accepted: false,
						reason: 'neckline_not_horizontal',
						details: {
							leftShoulder: p0.price,
							rightShoulder: p4.price,
							head: p2.price,
							necklineP1: p1.price,
							necklineP3: p3.price,
							necklineDiffPct: necklineCheck.diffPct,
							necklineMaxPct: HS_NECKLINE_MAX_PCT,
						},
						indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
					});
				}
				continue;
			}
			const start = candles[p0.idx].isoTime;
			const end = candles[p4.idx].isoTime;
			if (!start || !end) continue;
			const trend = validatePriorTrend(candles, p0.idx, p4.idx - p0.idx, 'up_or_sideways');
			if (!trend.ok) {
				debugCandidates.push({
					type: 'head_and_shoulders',
					accepted: false,
					reason: `prior_trend_mismatch:${trend.classification}`,
					indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
				});
				continue;
			}
			if (trend.classification === 'insufficient_data') {
				debugCandidates.push({
					type: 'head_and_shoulders',
					accepted: true,
					reason: 'prior_trend_insufficient_data',
					indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
				});
			}
			// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
			const sizeReason = validatePatternSize('top', [p0, p1, p2, p3, p4], ctx.sizeThresholds);
			if (sizeReason) {
				debugCandidates.push({
					type: 'head_and_shoulders',
					accepted: false,
					reason: sizeReason,
					indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
				});
				continue;
			}
			const valleyBetween = allValleys.filter((v: { idx: number }) => v.idx > p0.idx && v.idx < p4.idx);
			const postValleys = allValleys.filter((v: { idx: number }) => v.idx > p2.idx);
			const minValley = valleyBetween.length
				? valleyBetween.reduce((m, v) => (v.price < m.price ? v : m))
				: postValleys.length
					? postValleys.reduce((m, v) => (v.price < m.price ? v : m))
					: null;
			const nlY = minValley ? minValley.price : Math.min(p1.price, p3.price);
			const neckline = [
				{ x: p1.idx, y: nlY },
				{ x: p3.idx, y: nlY },
			];

			// relaxed 経路のネックラインは `nlY` の水平線（`findHsBreakoutIdx` に渡すのと同一）。
			// ブレイク判定と同じ値をそのまま構造ゲートへ渡す。
			// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
			// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
			const gate = applyReversalGate({
				candles,
				pivots,
				side: 'top',
				first: p0,
				mid: p1,
				necklinePrice: nlY,
				type: 'head_and_shoulders',
				indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
				debugCandidates,
			});
			if (!gate) continue;
			const structureGate = buildStructureGate(gate);

			const tolMargin = marginFromRelDev(relDev(p0.price, p4.price), tolerancePct * factors.shoulder);
			const symmetry = clamp01(1 - relDev(p0.price, p4.price));
			const per = periodScoreDays(start, end);
			const base = (tolMargin + symmetry + per) / 3;
			const confidence = finalizeConf(base * 0.95, 'head_and_shoulders');
			const nlAvg = (Number(p1.price) + Number(p3.price)) / 2;
			// 右肩後のネックライン下抜けを確認する。
			const breakoutIdx = findHsBreakoutIdx(candles, neckline, p4.idx, 'below');
			const completion = buildHsCompletionFields(candles, breakoutIdx, 'down', end);
			if (!completion) continue;
			const rangeEnd = completion.rangeEnd;
			const diagram = generatePatternDiagram(
				'head_and_shoulders',
				[
					{ ...p0, date: candles[p0.idx]?.isoTime },
					{ ...p1, date: candles[p1.idx]?.isoTime },
					{ ...p2, date: candles[p2.idx]?.isoTime },
					{ ...p3, date: candles[p3.idx]?.isoTime },
					{ ...p4, date: candles[p4.idx]?.isoTime },
				],
				{ price: nlAvg },
				{ start, end: rangeEnd },
			);
			// nlY は水平ネックラインの y。breakout 時点でも同値なので nlY を直接使う。
			// TODO: relaxed H&S も strict と同じく 谷1→谷2 の傾きつきネックラインを使うべき。
			//       別 PR で検討（今回の主目的は target reached の high/low 化）。
			const hsRelTarget = Math.round(nlY - (p2.price - nlY));
			const hsRelReach = completion.breakout
				? computeTargetReach(candles, breakoutIdx, completion.breakout.price, hsRelTarget, 'down')
				: undefined;
			const hsRelPrecedingTrend = buildPrecedingTrend(candles, trend, p0.idx);
			debugCandidates.push({
				type: 'head_and_shoulders',
				accepted: true,
				reason: 'fallback_relaxed',
				indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
			});
			return {
				type: 'head_and_shoulders',
				confidence,
				range: { start, end: rangeEnd },
				structureRange: { start, end },
				status: completion.status,
				confirmation: completion.confirmation,
				...(completion.breakout ? { breakout: completion.breakout } : {}),
				...(completion.breakoutBarIndex !== undefined ? { breakoutBarIndex: completion.breakoutBarIndex } : {}),
				...(completion.breakoutDate ? { breakoutDate: completion.breakoutDate } : {}),
				...(completion.breakoutDirection ? { breakoutDirection: completion.breakoutDirection } : {}),
				...(completion.outcome ? { outcome: completion.outcome } : {}),
				...(hsRelPrecedingTrend ? { precedingTrend: hsRelPrecedingTrend } : {}),
				pivots: [p0, p1, p2, p3, p4],
				neckline,
				...(structureGate ? { structureGate } : {}),
				trendlineLabel: 'ネックライン',
				breakoutTarget: hsRelTarget,
				targetMethod: 'neckline_projection' as const,
				...(hsRelReach
					? {
							targetReachedPct: hsRelReach.targetReachedPct,
							targetReached: hsRelReach.targetReached,
							...(hsRelReach.targetReachedDate ? { targetReachedDate: hsRelReach.targetReachedDate } : {}),
							targetReachedPrice: hsRelReach.targetReachedPrice,
						}
					: {}),
				structureDiagram: diagram,
				_fallback: `relaxed_hs_${factors.tag}`,
			};
		}
	}
	return null;
}

// ── Helper: Relaxed Inverse H&S fallback ──

function findRelaxedInverseHS(ctx: DetectContext): DeduplicablePattern | null {
	const { candles, pivots, allPeaks, tolerancePct, headProminencePct, minDist, debugCandidates } = ctx;

	for (const factors of RELAXED_FACTORS) {
		for (let i = 0; i < pivots.length - 4; i++) {
			const p0 = pivots[i],
				p1 = pivots[i + 1],
				p2 = pivots[i + 2],
				p3 = pivots[i + 3],
				p4 = pivots[i + 4];
			if (!(p0.kind === 'L' && p1.kind === 'H' && p2.kind === 'L' && p3.kind === 'H' && p4.kind === 'L')) continue;
			if (
				p1.idx - p0.idx < minDist ||
				p2.idx - p1.idx < minDist ||
				p3.idx - p2.idx < minDist ||
				p4.idx - p3.idx < minDist
			)
				continue;
			const shouldersNearRelaxed =
				Math.abs(p0.price - p4.price) / Math.max(1, Math.max(p0.price, p4.price)) <= tolerancePct * factors.shoulder &&
				isSameLevel(p0.price, p4.price, HS_SHOULDER_MAX_PCT);
			const headLowerRelaxed = p2.price < Math.min(p0.price, p4.price) * (1 - headProminencePct * factors.head);
			const necklineCheck = validateHorizontalNeckline(p1.price, p3.price, HS_NECKLINE_MAX_PCT);
			if (!(shouldersNearRelaxed && headLowerRelaxed && necklineCheck.ok)) {
				if (shouldersNearRelaxed && headLowerRelaxed && !necklineCheck.ok) {
					debugCandidates.push({
						type: 'inverse_head_and_shoulders',
						accepted: false,
						reason: 'neckline_not_horizontal',
						details: {
							leftShoulder: p0.price,
							rightShoulder: p4.price,
							head: p2.price,
							necklineP1: p1.price,
							necklineP3: p3.price,
							necklineDiffPct: necklineCheck.diffPct,
							necklineMaxPct: HS_NECKLINE_MAX_PCT,
						},
						indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
					});
				}
				continue;
			}
			const start = candles[p0.idx].isoTime;
			const end = candles[p4.idx].isoTime;
			if (!start || !end) continue;
			const trend = validatePriorTrend(candles, p0.idx, p4.idx - p0.idx, 'down_or_sideways');
			if (!trend.ok) {
				debugCandidates.push({
					type: 'inverse_head_and_shoulders',
					accepted: false,
					reason: `prior_trend_mismatch:${trend.classification}`,
					indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
				});
				continue;
			}
			if (trend.classification === 'insufficient_data') {
				debugCandidates.push({
					type: 'inverse_head_and_shoulders',
					accepted: true,
					reason: 'prior_trend_insufficient_data',
					indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
				});
			}
			// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
			const sizeReason = validatePatternSize('bottom', [p0, p1, p2, p3, p4], ctx.sizeThresholds);
			if (sizeReason) {
				debugCandidates.push({
					type: 'inverse_head_and_shoulders',
					accepted: false,
					reason: sizeReason,
					indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
				});
				continue;
			}
			const peaksBetween = allPeaks.filter((v: { idx: number }) => v.idx > p0.idx && v.idx < p4.idx);
			const postPeaks = allPeaks.filter((v: { idx: number }) => v.idx > p2.idx);
			const maxPeak = peaksBetween.length
				? peaksBetween.reduce((m, v) => (v.price > m.price ? v : m))
				: postPeaks.length
					? postPeaks.reduce((m, v) => (v.price > m.price ? v : m))
					: null;
			const nlY = maxPeak ? maxPeak.price : Math.max(p1.price, p3.price);
			const neckline = [
				{ x: p1.idx, y: nlY },
				{ x: p3.idx, y: nlY },
			];

			// relaxed 経路のネックラインは `nlY` の水平線（`findHsBreakoutIdx` に渡すのと同一）。
			// ブレイク判定と同じ値をそのまま構造ゲートへ渡す。
			// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
			// サイズ検査と同じく「既存の棄却検査をすべて通過した後」に置く。
			const gate = applyReversalGate({
				candles,
				pivots,
				side: 'bottom',
				first: p0,
				mid: p1,
				necklinePrice: nlY,
				type: 'inverse_head_and_shoulders',
				indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
				debugCandidates,
			});
			if (!gate) continue;
			const structureGate = buildStructureGate(gate);

			const tolMargin = marginFromRelDev(relDev(p0.price, p4.price), tolerancePct * factors.shoulder);
			const symmetry = clamp01(1 - relDev(p0.price, p4.price));
			const per = periodScoreDays(start, end);
			const base = (tolMargin + symmetry + per) / 3;
			const confidence = finalizeConf(base * 0.95, 'inverse_head_and_shoulders');
			const nlAvg = (Number(p1.price) + Number(p3.price)) / 2;
			// 右肩後のネックライン上抜けを確認する。
			const breakoutIdx = findHsBreakoutIdx(candles, neckline, p4.idx, 'above');
			const completion = buildHsCompletionFields(candles, breakoutIdx, 'up', end);
			if (!completion) continue;
			const rangeEnd = completion.rangeEnd;
			const diagram = generatePatternDiagram(
				'inverse_head_and_shoulders',
				[
					{ ...p0, date: candles[p0.idx]?.isoTime },
					{ ...p1, date: candles[p1.idx]?.isoTime },
					{ ...p2, date: candles[p2.idx]?.isoTime },
					{ ...p3, date: candles[p3.idx]?.isoTime },
					{ ...p4, date: candles[p4.idx]?.isoTime },
				],
				{ price: nlAvg },
				{ start, end: rangeEnd },
			);
			// nlY は水平ネックラインの y。breakout 時点でも同値なので nlY を直接使う。
			// TODO: relaxed Inverse H&S も strict と同じく 山1→山2 の傾きつきネックラインを使うべき。
			//       別 PR で検討（今回の主目的は target reached の high/low 化）。
			const ihsRelTarget = Math.round(nlY + (nlY - p2.price));
			const ihsRelReach = completion.breakout
				? computeTargetReach(candles, breakoutIdx, completion.breakout.price, ihsRelTarget, 'up')
				: undefined;
			const ihsRelPrecedingTrend = buildPrecedingTrend(candles, trend, p0.idx);
			debugCandidates.push({
				type: 'inverse_head_and_shoulders',
				accepted: true,
				reason: 'fallback_relaxed',
				indices: [p0.idx, p1.idx, p2.idx, p3.idx, p4.idx],
			});
			return {
				type: 'inverse_head_and_shoulders',
				confidence,
				range: { start, end: rangeEnd },
				structureRange: { start, end },
				status: completion.status,
				confirmation: completion.confirmation,
				...(completion.breakout ? { breakout: completion.breakout } : {}),
				...(completion.breakoutBarIndex !== undefined ? { breakoutBarIndex: completion.breakoutBarIndex } : {}),
				...(completion.breakoutDate ? { breakoutDate: completion.breakoutDate } : {}),
				...(completion.breakoutDirection ? { breakoutDirection: completion.breakoutDirection } : {}),
				...(completion.outcome ? { outcome: completion.outcome } : {}),
				...(ihsRelPrecedingTrend ? { precedingTrend: ihsRelPrecedingTrend } : {}),
				pivots: [p0, p1, p2, p3, p4],
				neckline,
				...(structureGate ? { structureGate } : {}),
				trendlineLabel: 'ネックライン',
				breakoutTarget: ihsRelTarget,
				targetMethod: 'neckline_projection' as const,
				...(ihsRelReach
					? {
							targetReachedPct: ihsRelReach.targetReachedPct,
							targetReached: ihsRelReach.targetReached,
							...(ihsRelReach.targetReachedDate ? { targetReachedDate: ihsRelReach.targetReachedDate } : {}),
							targetReachedPrice: ihsRelReach.targetReachedPrice,
						}
					: {}),
				structureDiagram: diagram,
				_fallback: `relaxed_ihs_${factors.tag}`,
			};
		}
	}
	return null;
}

// ── Helper: 形成中 H&S ──

function tryFormingHS(ctx: DetectContext): DeduplicablePattern[] {
	const lastIdx = ctx.candles.length - 1;
	const confirmedPeaks = ctx.allPeaks.filter((p) => p.idx < lastIdx - 2);
	if (confirmedPeaks.length < 2) return [];

	// 頭を 1 点に決め打ちせず全候補を試す（#154）。重複は globalDedup が畳む。
	const out: DeduplicablePattern[] = [];
	for (const head of headCandidatesNewestFirst(confirmedPeaks)) {
		const found = formingHsForHead(ctx, confirmedPeaks, head);
		if (found) out.push(found);
	}
	return out;
}

/**
 * 頭候補 1 つを固定して形成中 H&S を組み立てる。組めなければ null（＝次の頭候補へ）。
 *
 * ## debug candidate の積み方（issue #155）
 *
 * 成功時に `accepted: true` を積む。**`accepted: true` は「検出器が組み立てた」であって
 * 「最終出力に残った」ではない**——`tryFormingHS` は #154 以降すべての頭候補を試すので、
 * ここで積んだ候補が後段 `detect_patterns.ts` の `globalDedup` に畳まれて `data.patterns`
 * に出ないことがある。strict パス（`findStrictHS`）も `patterns.push` の直後＝dedup 前に
 * 積んでおり、既存の約束と揃えてある。
 *
 * 棄却の理由コードは**構成点 4 点が揃った後の分岐にだけ**積む。左肩なし / 頭後の谷なし /
 * 右肩なしの 3 分岐は「まだ形が無い」段階の脱落で、`headCandidatesNewestFirst` のループが
 * 頭候補の数だけ回すぶんそのまま発火する（1hour × `limit=365` × `swingDepth=3` では確定
 * ピークが数十個あり、H&S と逆 H&S 合わせて 100 件級）。`detect_patterns.ts` の cap=200 を
 * 食い潰して**他の検出器の棄却理由を押し出す**ため積まない。積むなら頭候補ごとではなく
 * 1 回だけ集約する形が要る（別途）。
 */
function formingHsForHead(
	ctx: DetectContext,
	confirmedPeaks: readonly Pivot[],
	head: Pivot,
): DeduplicablePattern | null {
	const { candles, pivots, allPeaks, allValleys } = ctx;
	const lastIdx = candles.length - 1;
	const currentPrice = Number(candles[lastIdx]?.close ?? NaN);
	const isoAt = (i: number) => candles[i]?.isoTime || '';
	const formingBars = getHsFormingBarParams(ctx.type);

	// 左肩: 頭より左のピークで、頭より3%以上低い
	const leftCandidates = confirmedPeaks.filter((p) => p.idx < head.idx && head.price > p.price * 1.03);
	if (leftCandidates.length < 1) return null;
	const left = leftCandidates[leftCandidates.length - 1];

	// 頭後の谷を探す
	const postHeadValley = allValleys.find((v) => v.idx > head.idx && v.idx < lastIdx - 1);
	if (!postHeadValley) return null;

	// 右肩候補
	const rightPeakCandidates = allPeaks.filter(
		(p) =>
			p.idx > postHeadValley.idx &&
			p.price < head.price &&
			Math.abs(p.price - left.price) / Math.max(1, left.price) <= FORMING_RIGHT_TOLERANCE_PCT,
	);

	let rightShoulder: Pivot | null = rightPeakCandidates.length
		? rightPeakCandidates[rightPeakCandidates.length - 1]
		: null;
	let isProvisional = false;

	// 確定右肩がない場合、現在価格が左肩近傍なら暫定右肩
	if (!rightShoulder) {
		const nearLeft = Math.abs(currentPrice - left.price) / Math.max(1, left.price) <= FORMING_RIGHT_TOLERANCE_PCT;
		if (nearLeft && currentPrice < head.price && currentPrice > postHeadValley.price) {
			// 暫定右肩は確定ピボットではなく最新足の終値。極値判定（前後 swingDepth 本との比較）を
			// 通っていないので、判定に使った値＝比較に使った currentPrice そのものになる。
			rightShoulder = { idx: lastIdx, price: currentPrice, kind: 'H', extremePrice: currentPrice };
			isProvisional = true;
		}
	}
	if (!rightShoulder) return null;

	// 頭は形成区間の最高値であること（#154。総当たり化で外れた暗黙の保証を明示に戻す）
	if (!headIsExtremeInSpan(allPeaks, head, left.idx, rightShoulder.idx, true)) {
		ctx.debugCandidates.push({
			type: 'head_and_shoulders',
			accepted: false,
			reason: 'head_not_extreme_in_span',
			indices: [left.idx, head.idx, postHeadValley.idx, rightShoulder.idx],
			details: { spanFromIdx: left.idx, spanToIdx: rightShoulder.idx, headIdx: head.idx, headPrice: head.price },
		});
		return null;
	}

	// 完成度計算
	const closeness =
		1 - Math.abs(rightShoulder.price - left.price) / Math.max(1e-12, left.price * FORMING_RIGHT_TOLERANCE_PCT);
	const progress = Math.max(0, Math.min(1, closeness));
	const completion = Math.min(1, (0.75 + 0.25 * progress) * (isProvisional ? 0.9 : 1.0));
	if (completion < FORMING_MIN_COMPLETION) {
		ctx.debugCandidates.push({
			type: 'head_and_shoulders',
			accepted: false,
			reason: 'completion_below_min',
			indices: [left.idx, head.idx, postHeadValley.idx, rightShoulder.idx],
			details: { completion, threshold: FORMING_MIN_COMPLETION },
		});
		return null;
	}

	const formationBars = Math.max(0, rightShoulder.idx - left.idx);
	if (formationBars < formingBars.minBars || formationBars > formingBars.maxBars) {
		ctx.debugCandidates.push({
			type: 'head_and_shoulders',
			accepted: false,
			reason: 'formation_bars_out_of_range',
			indices: [left.idx, head.idx, postHeadValley.idx, rightShoulder.idx],
			details: { formationBars, minBars: formingBars.minBars, maxBars: formingBars.maxBars },
		});
		return null;
	}

	const trend = validatePriorTrend(candles, left.idx, rightShoulder.idx - left.idx, 'up_or_sideways');
	if (!trend.ok) {
		ctx.debugCandidates.push({
			type: 'head_and_shoulders',
			accepted: false,
			reason: `prior_trend_mismatch:${trend.classification}`,
			indices: [left.idx, head.idx, postHeadValley.idx, rightShoulder.idx],
		});
		return null;
	}
	if (trend.classification === 'insufficient_data') {
		ctx.debugCandidates.push({
			type: 'head_and_shoulders',
			accepted: true,
			reason: 'prior_trend_insufficient_data',
			indices: [left.idx, head.idx, postHeadValley.idx, rightShoulder.idx],
		});
	}

	// ネックライン
	const preHeadValleys = allValleys.filter((v) => v.idx > left.idx && v.idx < head.idx);
	const preHeadValley = preHeadValleys.length
		? preHeadValleys.reduce((best, v) => (v.price < best.price ? v : best), preHeadValleys[0])
		: null;

	const neckline = preHeadValley
		? [
				{ x: preHeadValley.idx, y: preHeadValley.price },
				{ x: postHeadValley.idx, y: postHeadValley.price },
			]
		: [
				{ x: left.idx, y: postHeadValley.price },
				{ x: postHeadValley.idx, y: postHeadValley.price },
			];

	const confBase = Math.min(1, Math.max(0, 0.6 * closeness + 0.4 * progress));
	const confidence = Math.round(confBase * (isProvisional ? 0.9 : 1.0) * 100) / 100;

	// 形状不十分な forming 候補（confidence=0.01 等）が上位表示されるのを防ぐ。
	// detect_triples.ts と同じ閾値を使う。
	if (confidence < FORMING_MIN_CONFIDENCE) {
		ctx.debugCandidates.push({
			type: 'head_and_shoulders',
			accepted: false,
			reason: 'confidence_below_min_forming',
			indices: [left.idx, head.idx, postHeadValley.idx, rightShoulder.idx],
			details: { confidence, threshold: FORMING_MIN_CONFIDENCE },
		});
		return null;
	}

	// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
	// 先行谷 / 先行山が取れないときは頭-戻り-右肩の 3 点で測る（交互列の形は保たれる）。
	const hsSizeReason = validatePatternSize(
		'top',
		preHeadValley ? [left, preHeadValley, head, postHeadValley, rightShoulder] : [head, postHeadValley, rightShoulder],
		ctx.sizeThresholds,
	);
	if (hsSizeReason) {
		ctx.debugCandidates.push({
			type: 'head_and_shoulders',
			accepted: false,
			reason: hsSizeReason,
			indices: [left.idx, head.idx, postHeadValley.idx, rightShoulder.idx],
		});
		return null;
	}

	const formHsNl = neckline[0].y;

	// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
	// `first` / `mid` は**サイズ検査に渡した構成点列の先頭 2 点**（`reversal-gate.ts` の冒頭）。
	// 先行谷が取れず 3 点（頭-戻り-右肩）に縮む経路では、縮んだ配列の先頭 2 点がそのまま
	// `first` / `mid` になる。ネックライン水準は検出器自身が使う `neckline[0].y`。
	const gate = applyReversalGate({
		candles,
		pivots,
		side: 'top',
		first: preHeadValley ? left : head,
		mid: preHeadValley ?? postHeadValley,
		necklinePrice: formHsNl,
		type: 'head_and_shoulders',
		indices: [left.idx, head.idx, postHeadValley.idx, rightShoulder.idx],
		debugCandidates: ctx.debugCandidates,
	});
	if (!gate) return null;
	const structureGate = buildStructureGate(gate);

	const start = isoAt(left.idx);
	const end = isoAt(rightShoulder.idx);

	const formHsTarget = Math.round(formHsNl - (head.price - formHsNl));
	const formHsStructureRange = start && end ? { start, end } : undefined;
	const formHsPrecedingTrend = buildPrecedingTrend(candles, trend, left.idx);

	// 成功エントリ（issue #155）。構成点は 4 点で strict の 5 点とは違うため、頭後の谷は
	// strict の `valley1` / `valley2` と混同しない専用 role で積む。先行谷（ネックラインの
	// 左端）は `points` にだけ載せる——既存の棄却エントリと `indices` の並びを揃えるため。
	// 暫定右肩は確定ピボットではなく最新足の終値なので role を分ける。
	ctx.debugCandidates.push({
		type: 'head_and_shoulders',
		accepted: true,
		status: 'forming',
		indices: [left.idx, head.idx, postHeadValley.idx, rightShoulder.idx],
		points: [
			{ role: 'left_shoulder', idx: left.idx, price: left.price, isoTime: candles[left.idx]?.isoTime },
			...(preHeadValley
				? [
						{
							role: 'pre_head_valley',
							idx: preHeadValley.idx,
							price: preHeadValley.price,
							isoTime: candles[preHeadValley.idx]?.isoTime,
						},
					]
				: []),
			{ role: 'head', idx: head.idx, price: head.price, isoTime: candles[head.idx]?.isoTime },
			{
				role: 'post_head_valley',
				idx: postHeadValley.idx,
				price: postHeadValley.price,
				isoTime: candles[postHeadValley.idx]?.isoTime,
			},
			{
				role: isProvisional ? 'right_shoulder_provisional' : 'right_shoulder',
				idx: rightShoulder.idx,
				price: rightShoulder.price,
				isoTime: candles[rightShoulder.idx]?.isoTime,
			},
		],
		details: {
			confidence,
			completionPct: Math.round(completion * 100),
			method: isProvisional ? 'forming_hs_provisional' : 'forming_hs',
		},
	});

	return {
		type: 'head_and_shoulders',
		confidence,
		range: { start, end },
		...(formHsStructureRange ? { structureRange: formHsStructureRange } : {}),
		confirmation: { type: 'not_confirmed' },
		...(formHsPrecedingTrend ? { precedingTrend: formHsPrecedingTrend } : {}),
		status: 'forming',
		pivots: [
			{ idx: left.idx, price: left.price, kind: 'H' as const, extremePrice: left.extremePrice },
			{ idx: head.idx, price: head.price, kind: 'H' as const, extremePrice: head.extremePrice },
			{
				idx: postHeadValley.idx,
				price: postHeadValley.price,
				kind: 'L' as const,
				extremePrice: postHeadValley.extremePrice,
			},
			{
				idx: rightShoulder.idx,
				price: rightShoulder.price,
				kind: 'H' as const,
				extremePrice: rightShoulder.extremePrice,
			},
		],
		neckline,
		...(structureGate ? { structureGate } : {}),
		trendlineLabel: 'ネックライン',
		breakoutTarget: formHsTarget,
		targetMethod: 'neckline_projection' as const,
		completionPct: Math.round(completion * 100),
		_method: isProvisional ? 'forming_hs_provisional' : 'forming_hs',
	};
}

// ── Helper: 形成中 Inverse H&S ──

function tryFormingInverseHS(ctx: DetectContext): DeduplicablePattern[] {
	const lastIdx = ctx.candles.length - 1;
	const confirmedValleys = ctx.allValleys.filter((v) => v.idx < lastIdx - 2);
	if (confirmedValleys.length < 2) return [];

	// 頭を 1 点に決め打ちせず全候補を試す（#154）。重複は globalDedup が畳む。
	const out: DeduplicablePattern[] = [];
	for (const head of headCandidatesNewestFirst(confirmedValleys)) {
		const found = formingInverseHsForHead(ctx, confirmedValleys, head);
		if (found) out.push(found);
	}
	return out;
}

/** 頭候補 1 つを固定して形成中 逆 H&S を組み立てる。組めなければ null（＝次の頭候補へ）。 */
/**
 * 頭候補 1 つを固定して形成中 逆 H&S を組み立てる。組めなければ null（＝次の頭候補へ）。
 * debug candidate の積み方（成功エントリの意味・理由コードを積む分岐の範囲）は
 * {@link formingHsForHead} の docstring が単一ソース。
 */
function formingInverseHsForHead(
	ctx: DetectContext,
	confirmedValleys: readonly Pivot[],
	head: Pivot,
): DeduplicablePattern | null {
	const { candles, pivots, allPeaks, allValleys } = ctx;
	const lastIdx = candles.length - 1;
	const currentPrice = Number(candles[lastIdx]?.close ?? NaN);
	const isoAt = (i: number) => candles[i]?.isoTime || '';
	const formingBars = getHsFormingBarParams(ctx.type);

	// 左肩: 頭より左の谷で、頭より3%以上高い
	const leftCandidates = confirmedValleys.filter((v) => v.idx < head.idx && head.price < v.price * 0.97);
	if (leftCandidates.length < 1) return null;
	const left = leftCandidates[leftCandidates.length - 1];

	// 頭後のピークを探す
	const postHeadPeak = allPeaks.find((p) => p.idx > head.idx && p.idx < lastIdx - 1);
	if (!postHeadPeak) return null;

	// 右肩候補
	const rightValleyCandidates = allValleys.filter(
		(v) =>
			v.idx > postHeadPeak.idx &&
			v.price > head.price &&
			Math.abs(v.price - left.price) / Math.max(1, left.price) <= FORMING_RIGHT_TOLERANCE_PCT,
	);

	let rightShoulder: Pivot | null = rightValleyCandidates.length
		? rightValleyCandidates[rightValleyCandidates.length - 1]
		: null;
	let isProvisional = false;

	// 確定右肩がない場合、現在価格が左肩近傍なら暫定右肩
	if (!rightShoulder) {
		const nearLeft = Math.abs(currentPrice - left.price) / Math.max(1, left.price) <= FORMING_RIGHT_TOLERANCE_PCT;
		if (nearLeft && currentPrice > head.price && currentPrice < postHeadPeak.price) {
			// 暫定右肩は確定ピボットではなく最新足の終値（forming H&S 側と同じ扱い）。
			rightShoulder = { idx: lastIdx, price: currentPrice, kind: 'L', extremePrice: currentPrice };
			isProvisional = true;
		}
	}
	if (!rightShoulder) return null;

	// 頭は形成区間の最安値であること（#154。総当たり化で外れた暗黙の保証を明示に戻す）
	if (!headIsExtremeInSpan(allValleys, head, left.idx, rightShoulder.idx, false)) {
		ctx.debugCandidates.push({
			type: 'inverse_head_and_shoulders',
			accepted: false,
			reason: 'head_not_extreme_in_span',
			indices: [left.idx, head.idx, postHeadPeak.idx, rightShoulder.idx],
			details: { spanFromIdx: left.idx, spanToIdx: rightShoulder.idx, headIdx: head.idx, headPrice: head.price },
		});
		return null;
	}

	// 完成度計算
	const closeness =
		1 - Math.abs(rightShoulder.price - left.price) / Math.max(1e-12, left.price * FORMING_RIGHT_TOLERANCE_PCT);
	const progress = Math.max(0, Math.min(1, closeness));
	const completion = Math.min(1, (0.75 + 0.25 * progress) * (isProvisional ? 0.9 : 1.0));
	if (completion < FORMING_MIN_COMPLETION) {
		ctx.debugCandidates.push({
			type: 'inverse_head_and_shoulders',
			accepted: false,
			reason: 'completion_below_min',
			indices: [left.idx, head.idx, postHeadPeak.idx, rightShoulder.idx],
			details: { completion, threshold: FORMING_MIN_COMPLETION },
		});
		return null;
	}

	const formationBars = Math.max(0, rightShoulder.idx - left.idx);
	if (formationBars < formingBars.minBars || formationBars > formingBars.maxBars) {
		ctx.debugCandidates.push({
			type: 'inverse_head_and_shoulders',
			accepted: false,
			reason: 'formation_bars_out_of_range',
			indices: [left.idx, head.idx, postHeadPeak.idx, rightShoulder.idx],
			details: { formationBars, minBars: formingBars.minBars, maxBars: formingBars.maxBars },
		});
		return null;
	}

	const trend = validatePriorTrend(candles, left.idx, rightShoulder.idx - left.idx, 'down_or_sideways');
	if (!trend.ok) {
		ctx.debugCandidates.push({
			type: 'inverse_head_and_shoulders',
			accepted: false,
			reason: `prior_trend_mismatch:${trend.classification}`,
			indices: [left.idx, head.idx, postHeadPeak.idx, rightShoulder.idx],
		});
		return null;
	}
	if (trend.classification === 'insufficient_data') {
		ctx.debugCandidates.push({
			type: 'inverse_head_and_shoulders',
			accepted: true,
			reason: 'prior_trend_insufficient_data',
			indices: [left.idx, head.idx, postHeadPeak.idx, rightShoulder.idx],
		});
	}

	// ネックライン
	const preHeadPeaks = allPeaks.filter((p) => p.idx > left.idx && p.idx < head.idx);
	const preHeadPeak = preHeadPeaks.length
		? preHeadPeaks.reduce((best, p) => (p.price > best.price ? p : best), preHeadPeaks[0])
		: null;

	const neckline = preHeadPeak
		? [
				{ x: preHeadPeak.idx, y: preHeadPeak.price },
				{ x: postHeadPeak.idx, y: postHeadPeak.price },
			]
		: [
				{ x: left.idx, y: postHeadPeak.price },
				{ x: postHeadPeak.idx, y: postHeadPeak.price },
			];

	const confBase = Math.min(1, Math.max(0, 0.6 * closeness + 0.4 * progress));
	const confidence = Math.round(confBase * (isProvisional ? 0.9 : 1.0) * 100) / 100;

	if (confidence < FORMING_MIN_CONFIDENCE) {
		ctx.debugCandidates.push({
			type: 'inverse_head_and_shoulders',
			accepted: false,
			reason: 'confidence_below_min_forming',
			indices: [left.idx, head.idx, postHeadPeak.idx, rightShoulder.idx],
			details: { confidence, threshold: FORMING_MIN_CONFIDENCE },
		});
		return null;
	}

	// サイズ検査（#138 欠陥 2-2）。配置が最後なのは `validatePatternSize` の docstring を参照。
	// 先行谷 / 先行山が取れないときは頭-戻り-右肩の 3 点で測る（交互列の形は保たれる）。
	const ihsSizeReason = validatePatternSize(
		'bottom',
		preHeadPeak ? [left, preHeadPeak, head, postHeadPeak, rightShoulder] : [head, postHeadPeak, rightShoulder],
		ctx.sizeThresholds,
	);
	if (ihsSizeReason) {
		ctx.debugCandidates.push({
			type: 'inverse_head_and_shoulders',
			accepted: false,
			reason: ihsSizeReason,
			indices: [left.idx, head.idx, postHeadPeak.idx, rightShoulder.idx],
		});
		return null;
	}

	const formIhsNl = neckline[0].y;

	// 構造ゲート（#138 欠陥 2-1）。#131 が double にだけ入れたものの横展開。
	// `first` / `mid` は**サイズ検査に渡した構成点列の先頭 2 点**（`reversal-gate.ts` の冒頭）。
	// 先行山が取れず 3 点（頭-戻り-右肩）に縮む経路では、縮んだ配列の先頭 2 点がそのまま
	// `first` / `mid` になる。ネックライン水準は検出器自身が使う `neckline[0].y`。
	const gate = applyReversalGate({
		candles,
		pivots,
		side: 'bottom',
		first: preHeadPeak ? left : head,
		mid: preHeadPeak ?? postHeadPeak,
		necklinePrice: formIhsNl,
		type: 'inverse_head_and_shoulders',
		indices: [left.idx, head.idx, postHeadPeak.idx, rightShoulder.idx],
		debugCandidates: ctx.debugCandidates,
	});
	if (!gate) return null;
	const structureGate = buildStructureGate(gate);

	const start = isoAt(left.idx);
	const end = isoAt(rightShoulder.idx);

	const formIhsTarget = Math.round(formIhsNl + (formIhsNl - head.price));
	const formIhsStructureRange = start && end ? { start, end } : undefined;
	const formIhsPrecedingTrend = buildPrecedingTrend(candles, trend, left.idx);

	// 成功エントリ（issue #155）。role の付け方は formingHsForHead 側と同じ約束で、
	// 上下が反転するぶん「谷」が「山」になる。
	ctx.debugCandidates.push({
		type: 'inverse_head_and_shoulders',
		accepted: true,
		status: 'forming',
		indices: [left.idx, head.idx, postHeadPeak.idx, rightShoulder.idx],
		points: [
			{ role: 'left_shoulder', idx: left.idx, price: left.price, isoTime: candles[left.idx]?.isoTime },
			...(preHeadPeak
				? [
						{
							role: 'pre_head_peak',
							idx: preHeadPeak.idx,
							price: preHeadPeak.price,
							isoTime: candles[preHeadPeak.idx]?.isoTime,
						},
					]
				: []),
			{ role: 'head', idx: head.idx, price: head.price, isoTime: candles[head.idx]?.isoTime },
			{
				role: 'post_head_peak',
				idx: postHeadPeak.idx,
				price: postHeadPeak.price,
				isoTime: candles[postHeadPeak.idx]?.isoTime,
			},
			{
				role: isProvisional ? 'right_shoulder_provisional' : 'right_shoulder',
				idx: rightShoulder.idx,
				price: rightShoulder.price,
				isoTime: candles[rightShoulder.idx]?.isoTime,
			},
		],
		details: {
			confidence,
			completionPct: Math.round(completion * 100),
			method: isProvisional ? 'forming_ihs_provisional' : 'forming_ihs',
		},
	});

	return {
		type: 'inverse_head_and_shoulders',
		confidence,
		range: { start, end },
		...(formIhsStructureRange ? { structureRange: formIhsStructureRange } : {}),
		confirmation: { type: 'not_confirmed' },
		...(formIhsPrecedingTrend ? { precedingTrend: formIhsPrecedingTrend } : {}),
		status: 'forming',
		pivots: [
			{ idx: left.idx, price: left.price, kind: 'L' as const, extremePrice: left.extremePrice },
			{ idx: head.idx, price: head.price, kind: 'L' as const, extremePrice: head.extremePrice },
			{ idx: postHeadPeak.idx, price: postHeadPeak.price, kind: 'H' as const, extremePrice: postHeadPeak.extremePrice },
			{
				idx: rightShoulder.idx,
				price: rightShoulder.price,
				kind: 'L' as const,
				extremePrice: rightShoulder.extremePrice,
			},
		],
		neckline,
		...(structureGate ? { structureGate } : {}),
		trendlineLabel: 'ネックライン',
		breakoutTarget: formIhsTarget,
		targetMethod: 'neckline_projection' as const,
		completionPct: Math.round(completion * 100),
		_method: isProvisional ? 'forming_ihs_provisional' : 'forming_ihs',
	};
}

// ── Main ──

export function detectHeadAndShoulders(ctx: DetectContext): DetectResult {
	const { want, includeForming } = ctx;
	const patterns: DeduplicablePattern[] = [];

	// 3) Inverse H&S
	let foundInverseHS = false;
	if (want.size === 0 || want.has('inverse_head_and_shoulders')) {
		const result = findStrictInverseHS(ctx);
		patterns.push(...result.patterns);
		foundInverseHS = result.found;
	}

	// 3b) H&S
	let foundHS = false;
	if (want.size === 0 || want.has('head_and_shoulders')) {
		const result = findStrictHS(ctx);
		patterns.push(...result.patterns);
		foundHS = result.found;
	}

	// Relaxed fallback
	if (!foundHS && (want.size === 0 || want.has('head_and_shoulders'))) {
		const relaxed = findRelaxedHS(ctx);
		if (relaxed) {
			patterns.push(relaxed);
			foundHS = true;
		}
	}
	if (!foundInverseHS && (want.size === 0 || want.has('inverse_head_and_shoulders'))) {
		const relaxed = findRelaxedInverseHS(ctx);
		if (relaxed) {
			patterns.push(relaxed);
			foundInverseHS = true;
		}
	}

	// 3c) 形成中 H&S
	if (includeForming && (want.size === 0 || want.has('head_and_shoulders'))) {
		patterns.push(...tryFormingHS(ctx));
	}

	// 3d) 形成中 Inverse H&S
	if (includeForming && (want.size === 0 || want.has('inverse_head_and_shoulders'))) {
		patterns.push(...tryFormingInverseHS(ctx));
	}

	return { patterns, found: { head_and_shoulders: foundHS, inverse_head_and_shoulders: foundInverseHS } };
}
