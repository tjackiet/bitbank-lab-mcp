/**
 * patterns/structural.ts - パターン構造検証ユーティリティ
 *
 * 反転パターン（double_top / double_bottom / head_and_shoulders /
 * inverse_head_and_shoulders）の検出に「形として失格な候補を hard reject
 * する層」を入れるための純粋関数群。
 *
 * 本ファイルは純粋関数のみ。detect_doubles.ts / detect_hs.ts への配線は
 * 別 PR で行う。
 *
 * regression.ts の `relDev`（分母 `Math.max(1, Math.max(a, b))`）には
 * 依存させず、構造検証の観点で純粋な相対差を返す `relDiff` を独立に持つ。
 */

import { linearRegressionWithR2 } from './regression.js';
import type { Pivot } from './swing.js';

// ---------- 定数 ----------

/** double_top / double_bottom の2点（山-山、谷-谷）同水準の構造上限 */
export const DOUBLE_LEVEL_MAX_PCT = 0.03;

/** H&S / IHS の左右肩同水準の構造上限 */
export const HS_SHOULDER_MAX_PCT = 0.05;

/** H&S / IHS のネックライン構成点（p1, p3）同水準の構造上限 */
export const HS_NECKLINE_MAX_PCT = 0.05;

/** 前提トレンド判定で「横ばい」とみなす priorReturn の範囲 */
export const PRIOR_TREND_SIDEWAYS_PCT = 0.05;

/** 前提トレンド判定の lookback バー数（min / max） */
export const PRIOR_TREND_LOOKBACK_MIN = 10;
export const PRIOR_TREND_LOOKBACK_MAX = 30;

/** 前提トレンド判定で「方向性のあるトレンド」とみなす efficiency 下限 */
export const PRIOR_TREND_MIN_EFFICIENCY = 0.55;

/** 前提トレンド判定で「方向性のあるトレンド」とみなす R² 下限 */
export const PRIOR_TREND_MIN_R2 = 0.35;

// ---------- 純粋関数 ----------

/**
 * 2値の相対差。`Math.max(a, b)` を分母にとり、`|a-b| / max(a, b)` を返す。
 *
 * 両方 0 のときはゼロ除算を避けるため 0 を返す。
 */
export function relDiff(a: number, b: number): number {
	const max = Math.max(a, b);
	if (max === 0) return 0;
	return Math.abs(a - b) / max;
}

/** 2値が `maxPct` 以内に収まっているか（hard cap 用） */
export function isSameLevel(a: number, b: number, maxPct: number): boolean {
	return relDiff(a, b) <= maxPct;
}

/** ネックライン構成2点の水平性検証結果 */
export interface NecklineHorizontalityResult {
	ok: boolean;
	diffPct: number;
}

/**
 * ネックライン構成2点の水平性検証。
 *
 * H&S / IHS の `neckline = [{x:p1.idx,y:p1.price},{x:p3.idx,y:p3.price}]`
 * の y 同士を `maxPct` 以内で同水準とみなす。
 */
export function validateHorizontalNeckline(
	p1Price: number,
	p3Price: number,
	maxPct: number,
): NecklineHorizontalityResult {
	const diffPct = relDiff(p1Price, p3Price);
	return { ok: diffPct <= maxPct, diffPct };
}

export type PriorTrendExpected = 'up_or_sideways' | 'down_or_sideways';

export type PriorTrendClassification = 'up' | 'down' | 'sideways' | 'insufficient_data';

export interface PriorTrendResult {
	ok: boolean;
	priorReturn: number;
	lookbackBars: number;
	/** lookback window 先頭の candle index（= `max(0, startIdx - lookbackBars)`） */
	priorStartIdx: number;
	classification: PriorTrendClassification;
	reason?: string;
	rangePct?: number;
	efficiency?: number;
	r2?: number;
}

/**
 * 形成前トレンド方向の検証。
 *
 * - `lookbackBars = clamp(round(patternBars * 0.5), PRIOR_TREND_LOOKBACK_MIN, PRIOR_TREND_LOOKBACK_MAX)`
 * - `priorStart  = max(0, startIdx - lookbackBars)`
 * - `priorReturn = (close[startIdx] - close[priorStart]) / close[priorStart]`
 *
 * 補助指標（lookback window 内の close 集合に対する集計）:
 * - `rangePct   = (maxClose - minClose) / priorClose`
 * - `efficiency = |startClose - priorClose| / (maxClose - minClose)`
 * - `r2`         = lookback window の (idx, close) に対する線形回帰 R²
 *
 * 分類ルール:
 * - データ不足（`startIdx < lookbackBars`）は `classification='insufficient_data'` で
 *   `ok=true`（hard reject しない）
 * - `|priorReturn| <= PRIOR_TREND_SIDEWAYS_PCT` は `classification='sideways'`
 * - `|priorReturn| > PRIOR_TREND_SIDEWAYS_PCT` でも、
 *   `efficiency >= PRIOR_TREND_MIN_EFFICIENCY` も `r2 >= PRIOR_TREND_MIN_R2` も
 *   満たさない場合は `classification='sideways'`（レンジ内の端点移動を弾く）
 * - 上記を満たす場合のみ `priorReturn > 0 → 'up'` / `priorReturn < 0 → 'down'`
 *
 * `ok` 判定:
 * - `expected='up_or_sideways'`  → `up` / `sideways` / `insufficient_data` を OK
 * - `expected='down_or_sideways'` → `down` / `sideways` / `insufficient_data` を OK
 *
 * close 欠損や window 不正の場合は安全側に `sideways` または `insufficient_data` に倒す。
 */
export function validatePriorTrend(
	candles: ReadonlyArray<{ close: number }>,
	startIdx: number,
	patternBars: number,
	expected: PriorTrendExpected,
): PriorTrendResult {
	const lookbackBars = Math.max(
		PRIOR_TREND_LOOKBACK_MIN,
		Math.min(PRIOR_TREND_LOOKBACK_MAX, Math.round(patternBars * 0.5)),
	);
	const priorStart = Math.max(0, startIdx - lookbackBars);
	const startCloseRaw = candles[startIdx]?.close;
	const priorCloseRaw = candles[priorStart]?.close;
	const startClose = typeof startCloseRaw === 'number' && Number.isFinite(startCloseRaw) ? startCloseRaw : 0;
	const priorClose = typeof priorCloseRaw === 'number' && Number.isFinite(priorCloseRaw) ? priorCloseRaw : 0;
	const priorReturn = priorClose === 0 ? 0 : (startClose - priorClose) / priorClose;

	if (startIdx < lookbackBars) {
		return {
			ok: true,
			priorReturn,
			lookbackBars,
			priorStartIdx: priorStart,
			classification: 'insufficient_data',
			reason: 'startIdx < lookbackBars',
		};
	}

	// 両端の close が欠損／不正な場合は安全側に sideways
	if (priorClose === 0 || startClose === 0) {
		const okMissing = expected === 'up_or_sideways' || expected === 'down_or_sideways';
		return {
			ok: okMissing,
			priorReturn,
			lookbackBars,
			priorStartIdx: priorStart,
			classification: 'sideways',
			reason: 'missing_close',
		};
	}

	// |priorReturn| が sideways 範囲内なら早期 return（補助指標の計算は不要）
	if (Math.abs(priorReturn) <= PRIOR_TREND_SIDEWAYS_PCT) {
		return {
			ok: true,
			priorReturn,
			lookbackBars,
			priorStartIdx: priorStart,
			classification: 'sideways',
		};
	}

	// lookback window の集計（priorStart .. startIdx を含む両端）
	const points: Array<{ x: number; y: number }> = [];
	let maxClose = Number.NEGATIVE_INFINITY;
	let minClose = Number.POSITIVE_INFINITY;
	let hasMissingClose = false;
	for (let i = priorStart; i <= startIdx; i++) {
		const c = candles[i]?.close;
		if (typeof c !== 'number' || !Number.isFinite(c)) {
			hasMissingClose = true;
			continue;
		}
		if (c > maxClose) maxClose = c;
		if (c < minClose) minClose = c;
		points.push({ x: i, y: c });
	}

	// window 内に欠損があれば安全側に sideways
	if (hasMissingClose || points.length < 2 || !Number.isFinite(maxClose) || !Number.isFinite(minClose)) {
		return {
			ok: true,
			priorReturn,
			lookbackBars,
			priorStartIdx: priorStart,
			classification: 'sideways',
			reason: 'invalid_window',
		};
	}

	const range = maxClose - minClose;
	const rangePct = range / priorClose;
	const efficiency = range > 0 ? Math.abs(startClose - priorClose) / range : 0;
	const { r2 } = linearRegressionWithR2(points);

	let classification: PriorTrendClassification;
	const isDirectional = efficiency >= PRIOR_TREND_MIN_EFFICIENCY || r2 >= PRIOR_TREND_MIN_R2;
	if (!isDirectional) {
		classification = 'sideways';
	} else if (priorReturn > 0) {
		classification = 'up';
	} else {
		classification = 'down';
	}

	const ok =
		expected === 'up_or_sideways'
			? classification === 'up' || classification === 'sideways'
			: classification === 'down' || classification === 'sideways';

	return { ok, priorReturn, lookbackBars, priorStartIdx: priorStart, classification, rangePct, efficiency, r2 };
}

// ---------- 反転パターンの構造ゲート（issue #126） ----------

/**
 * 構造ゲートが評価する価格基準は **`Pivot.extremePrice`（極値判定に使った high / low）**
 * であって `Pivot.price` ではない。
 *
 * 理由は 2 つある:
 *
 * 1. **`price` の意味が検出器ごとに違う**（`swing.ts` の `Pivot` docstring の表）。
 *    `detectSwingPoints` 由来なら終値、`detect_triangles` の relaxed swing なら high / low、
 *    形成中 H&S の暫定右肩なら最新足の終値。本ファイルは共通ユーティリティなので、
 *    生の `price: number` を受けると別の検出器に広げた瞬間に**型は通るまま**基準が変わる。
 *    `extremePrice` だけが「判定に使った値」として全検出器で意味が統一されている（#128）。
 * 2. **終値基準では帯の余裕が無い。** BTC/JPY 日足の実在ピボットで戻り率を計算すると
 *    （preDeclineHigh=7/21, trough1=8/3, peak=8/10）:
 *
 *    | 基準 | preDeclineHigh | trough1 | peak | 戻り率 |
 *    |---|---|---|---|---|
 *    | 終値 | 10,849,999 | 10,002,960 | 10,191,324 | 22.2% |
 *    | 高安 | 10,903,000 |  9,752,246 | 10,359,897 | 52.8% |
 *
 *    検出すべき正しいパターンが、終値基準では下限 {@link RETRACEMENT_MIN} まで 2 ポイントしか
 *    余裕が無い。高安基準なら帯の中央に収まる。
 *
 * **例外が 2 つある。**
 *
 * 1. **引き金は終値。** {@link findNecklineCross} の抜け判定と {@link detectTroughZoneReentry} の
 *    再進入判定は「その事象が起きたか」を見るので**終値**で評価する——ヒゲ 1 本の一時的な
 *    割り込みを「抜けた」と数えないため。水準（level）は構造由来、引き金（trigger）は終値、
 *    という組み合わせになる。
 * 2. **ネックラインの水準だけは呼び出し側から明示的に受け取る**
 *    （{@link ReversalStructureInput.necklinePrice}）。戻り率は「値幅」なので基準の統一された
 *    `extremePrice` で測るが、ネックラインは「線」であって、**後でブレイクを判定するのと
 *    同じ線**でなければ検査に意味が無い。
 *
 * なお {@link detectTroughZoneReentry} のゾーン水準は `extremePrice` 側で正しい。終値基準で
 * 組むと、実データ（8/3 → 8/10 → 8/14）で 8/16 の終値がゾーンに入り、**検出すべきパターンを
 * 無効化してしまう**（終値基準ゾーン上限 10,050,051 に対し 8/16 終値 10,014,831。
 * 高安基準なら上限 9,904,159 で入らない）。
 */
export type ReversalSide = 'bottom' | 'top';

/**
 * 中間構成点（ネックライン）の戻り率の下限。
 *
 * これを下回る山は「2 つの谷を分ける独立した山」ではなく、単一の底練り区間の中の
 * 揺れでしかない。下回った候補は double ではなく複合的な底（triple / 底練り）である。
 *
 * 高安基準での実測（下表）では、検出すべきパターンが 0.528 でここから十分離れている。
 * 終値基準だと同じパターンが 0.222 まで下がり、下限まで 2 ポイントしか残らない——
 * **基準を extremePrice にした根拠のひとつがこの余裕**（{@link ReversalSide} 参照）。
 */
export const RETRACEMENT_MIN = 0.2;

/**
 * 中間構成点（ネックライン）の戻り率の上限。
 *
 * これを上回るとネックラインが先行値幅の起点に肉薄し、上値抵抗がほぼ残っていない。
 * 形としては「上昇途中の押し目」であって反転の底固めではない。
 *
 * **1.0 超は設定不能で固定 reject**（{@link validateReversalStructure} が
 * `neckline_above_pre_decline_high` を返す）。定義上ダブルボトムではないため、
 * 閾値の調整対象にしない。**本定数はその内側にある「形の良し悪し」の線**であって、
 * 構造的な不可能性の線ではない。
 *
 * 値の根拠（BTC/JPY 日足 2026-05-29〜08-26 の実測、高安基準）:
 *
 * | 候補 | 構成点 | 戻り率 | あるべき判定 |
 * |---|---|---|---|
 * | 偽陽性 | 7/13 → 7/21 → 8/3 | **2.046** | 棄却（1.0 超の固定 reject で落ちる） |
 * | 正しい形 | 8/3 → 8/10 → 8/14 | **0.528** | 通過 |
 *
 * **実データが直接決めているのは「1.0 超は棄却」と「0.528 は通す」の 2 点だけ**で、
 * 0.85〜1.0 のどこに線を置くかは実測では決まらない。0.90 にしたのは:
 *
 * - 戻り率 0.90 以上はネックラインが先行値幅の起点の 10% 以内に入り、
 *   上値抵抗として意味を成さなくなる（投影ターゲットが先行高値を大きく超える）。
 * - 対称三角形は収束につれて戻り率が 0.79 → 0.91 と連続的に動く。0.85 に置くと
 *   **同じ 1 つの三角形の中で通る脚と落ちる脚が混在する**——構造の切れ目ではない場所に
 *   hard reject を置くことになる。
 * - 帯の内側の良し悪しは {@link RETRACEMENT_MIN} との中央からの距離としてスコア側
 *   （`scoreComponents.retracement`）が連続的に評価するので、hard reject 側を
 *   絞りすぎる必要がない。
 */
export const RETRACEMENT_MAX = 0.9;

/**
 * ネックライン下抜け（top なら上抜け）の探索窓のバー数。
 *
 * 「谷1 より前にネックライン水準を終値で抜けたバーが存在するか」を、谷1 から
 * この本数だけ遡って探す。無制限に遡ると遥か昔の無関係な交差でネックラインが
 * 正当化されてしまうので上限を置く。
 */
export const NECKLINE_CROSS_LOOKBACK_BARS = 60;

/**
 * 谷ゾーン（top なら山ゾーン）の高さ。パターン高さに対する比率で定義する。
 *
 * 谷2 確定後にこの水準まで戻した＝谷2 からの上昇をほぼ吐き出した、とみなす。
 * 絶対価格ではなくパターン高さの比率にしてあるので、値幅の大小に依存しない。
 */
export const TROUGH_REENTRY_FRACTION = 0.25;

/** 構造ゲートの不合格理由コード。debug candidates の `reason` にそのまま載る。 */
export type StructuralRejectReason =
	/** bottom: ネックラインが先行下落の起点より上（= 戻り率 > 1.0）。下抜けという事象が存在しない */
	| 'neckline_above_pre_decline_high'
	/** top: ネックラインが先行上昇の起点より下（= 戻り率 > 1.0） */
	| 'neckline_below_pre_decline_low'
	/** bottom: 谷1 より前にネックライン水準を終値で下抜けたバーが無い */
	| 'no_neckline_cross_before_trough1'
	/** top: 山1 より前にネックライン水準を終値で上抜けたバーが無い */
	| 'no_neckline_cross_before_peak1'
	/** 戻り率が [RETRACEMENT_MIN, RETRACEMENT_MAX] の帯の外（1.0 超は上の専用コード） */
	| 'retracement_out_of_band';

/** 構造ゲートを適用しなかった理由（`ok=true` のまま素通しした場合） */
export type StructuralSkipReason =
	/** 第1構成点より前に反対種別のピボットが無く、先行値幅を張れない */
	| 'no_prior_extreme'
	/** ネックライン交差の探索窓が短すぎて「交差が無い」ことを立証できない */
	| 'insufficient_history';

export interface ReversalStructureResult {
	ok: boolean;
	reason?: StructuralRejectReason;
	skipped?: StructuralSkipReason;
	/** 先行値幅の起点（bottom なら下落の起点＝谷1 直前のスイング高値）。`extremePrice` を載せる */
	priorExtreme?: { idx: number; extremePrice: number };
	/** 先行値幅に対する中間構成点の戻り率。算出できていれば `ok=false` でも載せる */
	retracementRatio?: number;
	/** ネックライン水準を終値で抜けたバー（第1構成点より前）。ゲート通過の証拠 */
	necklineCrossIdx?: number;
}

/**
 * 第1構成点より前で、直近の反対種別ピボットを返す。
 *
 * 「先行下落の起点」は**直前の**スイング高値と定義する（谷1 に向かう最後の下落の起点）。
 * 窓内の最高値ではない——下落が切り下げ高値で構成される場合、最高値を取ると
 * 分母が膨らんで戻り率が実態より小さく出る。
 */
export function findPriorExtreme(pivots: ReadonlyArray<Pivot>, beforeIdx: number, kind: 'H' | 'L'): Pivot | undefined {
	let found: Pivot | undefined;
	for (const p of pivots) {
		if (p.idx >= beforeIdx) break;
		if (p.kind === kind) found = p;
	}
	return found;
}

/** ネックライン交差の探索結果 */
export interface NecklineCrossResult {
	/** 交差が見つかったバーの idx。見つからなければ `undefined` */
	idx?: number;
	/** 「交差が無い」ことを立証できるだけの履歴があったか */
	conclusive: boolean;
}

/**
 * `[fromIdx, toIdx]` の窓で、`level` を**終値**で `direction` 方向に抜けたバーを探す。
 *
 * 「抜けた（cross）」は「その水準より下にある（below）」ではない。`direction='down'` なら
 * **一度 `level` より上で終えたバーがあり、その後 `level` より下で終えたバーがある**ことを要求する。
 * これが無いと、そもそもその水準を上から下に割ったという事象が起きていない
 * ——上抜けを「反転シグナル」と呼べる根拠が無い。
 */
export function findNecklineCross(
	candles: ReadonlyArray<{ close: number }>,
	fromIdx: number,
	toIdx: number,
	level: number,
	direction: 'down' | 'up',
): NecklineCrossResult {
	const start = Math.max(0, fromIdx);
	const end = Math.min(candles.length - 1, toIdx);
	const windowBars = end - start + 1;
	if (windowBars < PRIOR_TREND_LOOKBACK_MIN) return { conclusive: false };

	let seenBeyond = false;
	for (let i = start; i <= end; i++) {
		const close = candles[i]?.close;
		if (typeof close !== 'number' || !Number.isFinite(close)) continue;
		if (direction === 'down') {
			if (close > level) seenBeyond = true;
			else if (seenBeyond && close < level) return { idx: i, conclusive: true };
		} else {
			if (close < level) seenBeyond = true;
			else if (seenBeyond && close > level) return { idx: i, conclusive: true };
		}
	}
	return { conclusive: true };
}

export interface ReversalStructureInput {
	candles: ReadonlyArray<{ close: number }>;
	/** 全ピボット列（先行極値の探索に使う） */
	pivots: ReadonlyArray<Pivot>;
	/** 第1構成点（bottom なら谷1、top なら山1） */
	first: Pivot;
	/** 中間構成点＝ネックライン（bottom なら山、top なら谷） */
	mid: Pivot;
	/**
	 * ネックラインの水準。**呼び出し側がブレイク判定に使うのと同じ値を渡す。**
	 *
	 * `mid` から導出せず明示的に受け取るのは、`Pivot.price` の基準が検出器ごとに違う
	 * （`swing.ts` の表）ため——ここで `mid.price` を読むと、共通ゲートが呼び出し元ごとに
	 * 違う意味の数値を評価することになる。値幅の評価（戻り率）は基準が統一されている
	 * `extremePrice` を使うが、**ネックラインは「線」であって値幅ではない**ので、
	 * 「後でブレイクを判定する線」と同一でなければ検査の意味が無い。
	 *
	 * `detect_doubles` はここに `b.price`（`findBreakoutIdx` と `neckline` 配列に渡すのと
	 * 同じ値）を渡している。
	 */
	necklinePrice: number;
	side: ReversalSide;
}

/**
 * 反転パターン（double / triple / H&S 系）の構造ゲート。**hard reject の層**であって
 * スコアの減点ではない。ここを通らない形はスコアがいくら高くても検出結果に出さない。
 *
 * 検査は 2 つ:
 *
 * - **戻り率**（{@link RETRACEMENT_MIN} 〜 {@link RETRACEMENT_MAX}）。
 *   `1.0` 超は「ネックラインが先行下落の起点より上」＝定義上そのパターンではないので固定 reject。
 * - **ネックライン交差の実在**。第1構成点より前に、ネックライン水準を終値で抜けたバーが
 *   存在すること。存在しないなら「抜け返す」という事象が定義できない。
 *
 * 判定に必要な履歴が無い場合は `ok=true` + `skipped` で素通しする
 * （{@link validatePriorTrend} の `insufficient_data` と同じ安全側の倒し方）。
 *
 * 価格基準は `extremePrice`。理由は {@link ReversalSide} の docstring を参照。
 */
export function validateReversalStructure(input: ReversalStructureInput): ReversalStructureResult {
	const { candles, pivots, first, mid, necklinePrice, side } = input;
	const isBottom = side === 'bottom';

	const priorPivot = findPriorExtreme(pivots, first.idx, isBottom ? 'H' : 'L');
	if (!priorPivot) return { ok: true, skipped: 'no_prior_extreme' };
	const priorExtreme = { idx: priorPivot.idx, extremePrice: priorPivot.extremePrice };

	// 先行値幅（起点 → 第1構成点）。bottom なら下落幅、top なら上昇幅。
	const priorRange = isBottom
		? priorPivot.extremePrice - first.extremePrice
		: first.extremePrice - priorPivot.extremePrice;
	// 中間構成点の戻り幅（第1構成点 → ネックライン）
	const retraceRange = isBottom ? mid.extremePrice - first.extremePrice : first.extremePrice - mid.extremePrice;

	const overshootReason: StructuralRejectReason = isBottom
		? 'neckline_above_pre_decline_high'
		: 'neckline_below_pre_decline_low';

	// 先行値幅が無い（起点が第1構成点を越えていない）= そもそも先行下落 / 上昇が存在しない。
	// このときネックラインは必ず起点の外側にあるので、戻り率 > 1.0 と同じ扱いで reject する。
	if (priorRange <= 0) return { ok: false, reason: overshootReason, priorExtreme };

	const retracementRatio = retraceRange / priorRange;
	if (retracementRatio > 1) return { ok: false, reason: overshootReason, priorExtreme, retracementRatio };
	if (retracementRatio < RETRACEMENT_MIN || retracementRatio > RETRACEMENT_MAX) {
		return { ok: false, reason: 'retracement_out_of_band', priorExtreme, retracementRatio };
	}

	const cross = findNecklineCross(
		candles,
		first.idx - NECKLINE_CROSS_LOOKBACK_BARS,
		first.idx,
		necklinePrice,
		isBottom ? 'down' : 'up',
	);
	if (cross.idx === undefined) {
		// 窓が短くて「交差が無い」を立証できないなら素通し（安全側）。
		if (!cross.conclusive) {
			return { ok: true, skipped: 'insufficient_history', priorExtreme, retracementRatio };
		}
		return {
			ok: false,
			reason: isBottom ? 'no_neckline_cross_before_trough1' : 'no_neckline_cross_before_peak1',
			priorExtreme,
			retracementRatio,
		};
	}

	return { ok: true, priorExtreme, retracementRatio, necklineCrossIdx: cross.idx };
}

export interface TroughZoneReentryInput {
	candles: ReadonlyArray<{ close: number }>;
	/** 第1構成点 */
	first: Pivot;
	/** 中間構成点＝ネックライン */
	mid: Pivot;
	/** 第2構成点（この足より後を走査する） */
	second: Pivot;
	/** 走査終了 idx（ネックライン突破バー、または最終足）。両端を含む */
	untilIdx: number;
	side: ReversalSide;
}

export interface TroughZoneReentryResult {
	reentered: boolean;
	/** 再進入したバーの idx */
	idx?: number;
	/** 再進入と判定する価格水準 */
	level: number;
}

/**
 * 第2構成点の確定後、ネックライン突破前に価格が谷ゾーン（top なら山ゾーン）へ
 * 戻ってしまっていないかを見る。
 *
 * 戻っているなら、その第2構成点は「反転の底」ではなく、より大きな底練り区間の
 * 途中の点でしかない。ダブルとしては無効で、triple / 複合底として扱うべき形。
 *
 * ゾーンの水準は**パターン高さの比率**（{@link TROUGH_REENTRY_FRACTION}）で決める。
 * 絶対価格や固定 % だと値幅の大小でゾーンの意味が変わる。
 * 引き金は**終値**——ヒゲで一瞬触れただけを「戻った」と数えない。
 */
export function detectTroughZoneReentry(input: TroughZoneReentryInput): TroughZoneReentryResult {
	const { candles, first, mid, second, untilIdx, side } = input;
	const isBottom = side === 'bottom';

	const anchor = isBottom
		? Math.min(first.extremePrice, second.extremePrice)
		: Math.max(first.extremePrice, second.extremePrice);
	const height = isBottom ? mid.extremePrice - anchor : anchor - mid.extremePrice;
	const level = isBottom ? anchor + height * TROUGH_REENTRY_FRACTION : anchor - height * TROUGH_REENTRY_FRACTION;

	if (!(height > 0)) return { reentered: false, level };

	const end = Math.min(candles.length - 1, untilIdx);
	for (let i = second.idx + 1; i <= end; i++) {
		const close = candles[i]?.close;
		if (typeof close !== 'number' || !Number.isFinite(close)) continue;
		if (isBottom ? close <= level : close >= level) return { reentered: true, idx: i, level };
	}
	return { reentered: false, level };
}
