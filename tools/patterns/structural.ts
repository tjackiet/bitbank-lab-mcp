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

/**
 * double_top / double_bottom の2点（山-山、谷-谷）同水準の構造上限。**価格水準基準。**
 *
 * `tolerancePct` の `near` と**同じ量**（{@link relDiff}）を見ているので、完成済み double の
 * 同水準の実効上限は `min(tolerancePct, 本定数) × 価格水準`。これに加えて #178 項目 4 以降は
 * **高さ相対の {@link validateLevelDiff}（`MAX_LEVEL_SPREAD_RATIO` × パターン高さ）が
 * 独立した AND 条件**として掛かる。本定数を触るときは向こうの到達可能域も動くことに注意
 * （`validateLevelDiff` の docstring に幾何の上界を書いてある）。
 */
export const DOUBLE_LEVEL_MAX_PCT = 0.03;

/**
 * H&S / IHS の左右肩同水準の構造上限。**「肩の許容誤差」そのものではない**（issue #172）。
 *
 * ## 肩の判定における役割: 許容誤差に対する天井
 *
 * `detect_hs.ts` の 4 経路（strict 2 + relaxed 2）はいずれも肩の同水準判定を
 * **「相対差が許容誤差以内」AND `isSameLevel(p0, p4, HS_SHOULDER_MAX_PCT)`** で行う。
 * どちらの conjunct も同じ指標（左右肩の相対差 {@link relDiff}）を測っているので、
 * **実効閾値は 2 つの閾値の `min`**。**ただし許容誤差の実体が strict と relaxed で違う**
 * （issue #174。#173 の docstring は両経路を同一と書いていたが誤り）:
 *
 * | 経路 | 許容誤差の式 | 実効閾値 |
 * |---|---|---|
 * | strict（`findStrictHS` / `findStrictInverseHS`） | `near(p0, p4)` = `tolerancePct` | `min(tolerancePct, HS_SHOULDER_MAX_PCT)` |
 * | relaxed（`findRelaxedHS` / `findRelaxedInverseHS`） | **`near()` を呼ばず** `tolerancePct × factors.shoulder` をインライン比較 | `min(tolerancePct × factors.shoulder, HS_SHOULDER_MAX_PCT)` |
 *
 * `factors` は `detect_hs.ts` の `RELAXED_FACTORS` の 2 段（`shoulder: 1.6` → `2.0`）。
 * `tolerancePct` は `config.ts` の `getDefaultToleranceForTf` が時間足ごとに返す
 * （`resolveParams` がスキーマ既定値 0.04 のときだけ tf-auto に差し替える）。
 *
 * **relaxed の実効閾値の式は `M = max(p0.price, p4.price) >= 1` を前提にしている。**
 * relaxed のインライン比較だけが分母を `Math.max(1, M)` にクランプしており、
 * `isSameLevel` は {@link relDiff} なので分母は素の `M`。したがって **`M < 1`
 * （1 円未満の建値）では 2 つの conjunct が別の分母を見る**——相対差に対する実効閾値は
 * `min(tolerancePct × factors.shoulder / M, HS_SHOULDER_MAX_PCT)` になる。`1/M > 1` なので
 * **緩むのは許容誤差側だけで、本定数が律速するという下表の結論は変わらない**（むしろ強まる）。
 * strict の `near()` にはこのクランプが無いため `min(tolerancePct, HS_SHOULDER_MAX_PCT)` は
 * `M` によらず厳密。`view=debug` の `details.shouldersDiffPct` は strict / relaxed とも
 * `Math.max(1, M)` で割った値なので、`M < 1` では {@link relDiff} と一致しない。
 *
 * ### strict: 既定パスで本定数が律速するのは `15min` / `30min` だけ
 *
 * | 時間足 | `tolerancePct`（tf-auto） | `HS_SHOULDER_MAX_PCT` | 実効値 | 律速側 |
 * |---|---|---|---|---|
 * | `1hour` / `4hour` | 0.05 | 0.05 | 0.05 | 同値 |
 * | `1day`（他） | 0.04 | 0.05 | **0.04** | **`tolerancePct`** |
 * | `8hour` / `12hour` | 0.045 | 0.05 | 0.045 | `tolerancePct` |
 * | `1week` / `1month` | 0.035 / 0.03 | 0.05 | 0.035 / 0.03 | `tolerancePct` |
 * | **`15min` / `30min`** | **0.06** | 0.05 | **0.05** | **本定数** |
 *
 * `resolveParams` は明示値をそのまま通すので、他の時間足では `tolerancePct: 0.08` のように
 * 呼び出し側が明示的に緩めて初めて本定数が効く。
 *
 * ### relaxed: `×1.6` 段で `1month` 以外の全時間足、`×2.0` 段では全時間足で本定数が律速する
 *
 * | 時間足 | `tolerancePct` | `× 1.6` | `× 2.0` | `×1.6` の実効値 | `×2.0` の実効値 |
 * |---|---|---|---|---|---|
 * | `1hour` / `4hour` | 0.05 | 0.08 | 0.10 | **0.05（本定数）** | **0.05（本定数）** |
 * | `1day`（他） | 0.04 | 0.064 | 0.08 | **0.05（本定数）** | **0.05（本定数）** |
 * | `8hour` / `12hour` | 0.045 | 0.072 | 0.09 | **0.05（本定数）** | **0.05（本定数）** |
 * | `1week` | 0.035 | 0.056 | 0.07 | **0.05（本定数）** | **0.05（本定数）** |
 * | `1month` | 0.03 | 0.048 | 0.06 | 0.048（`tolerancePct`） | **0.05（本定数）** |
 * | `15min` / `30min` | 0.06 | 0.096 | 0.12 | **0.05（本定数）** | **0.05（本定数）** |
 *
 * **つまり「既定パスで本定数が律速するのは `15min` / `30min` だけ」は strict 限定の話。**
 *
 * ## 実測: `:cap` 0 件は strict の観測で、relaxed を 1 件も映していない
 *
 * 「全時間足で本定数のみが律速した棄却 = 0 件」（#167 のクローズコメント。BTC/JPY
 * `limit=200` / `headProminencePct: 0.01`）は **`shoulders_not_near:cap` を数えたもの**で、
 * この理由コードは **strict の専有**。#174 以前の relaxed は肩で落ちた窓に何も積まずに
 * `continue` していたため、**relaxed 側の cap 律速は観測に 1 件も入っていなかった。**
 *
 * #174 で relaxed にも棄却エントリを足したので、今は経路ごとに読める:
 *
 * | 理由コード | 経路 | 「許容誤差」の実体 |
 * |---|---|---|
 * | `shoulders_not_near:{tolerance,cap,both}` | strict | `tolerancePct` |
 * | `relaxed_shoulders_not_near:{tolerance,cap,both}` | relaxed（`RELAXED_FACTORS` 末尾の段のみ） | `tolerancePct × factors.shoulder` |
 *
 * **この定数を動かす提案は、両方の `:cap` を見ること。** 上表のとおり relaxed の `:cap` は
 * 既定パスでも普通に出る（合成 704 + 実データ 96 = 800 ケースで 105 件）。
 *
 * ## 律速 ≠ 出力への影響力
 *
 * 「relaxed ではほぼ全時間足で本定数が律速する」は**比較としては正しいが、出力を動かすことを
 * 意味しない。** relaxed は strict が 1 件も検出しなかったときだけ走るフォールバック
 * （`detectHeadAndShoulders` の `if (!foundHS …)`）なので到達頻度が低く、到達しても
 * 肩の後ろに頭の突出・ネックライン水平度・先行トレンド・サイズ検査・構造ゲートが並ぶ。
 *
 * 800 ケース（合成 704 + 実データ 96）で本定数だけを振った ablation:
 *
 * | 本定数 | `data.patterns` |
 * |---|---|
 * | 0.15 / 0.10 に緩める | **917**（現行と同数。`relaxed_shoulders_not_near:cap` が消えるだけ） |
 * | **0.05（現行）** | **917** |
 * | 0.02 に締める | 902 |
 * | 0.01 に締める | 882 |
 *
 * **緩めても動かない / 締めると動く**という非対称。#167 の「肩を 5.5% まで緩めて増える検出は
 * 0 件」と同じ結論で、**「律速している = 重要な定数」と読み替えないこと。**
 *
 * ## もう 1 つの役割: 窓生成での「同水準の肩」判定
 *
 * `detect_hs.ts` の `outerShoulderOk`（`enumerateHsWindows` から呼ばれる）でも使う。
 * こちらは**外側の脚にある肩が anchor の肩を「明確に」超えているか**の判定で、
 * **`tolerancePct` と AND を取らない単独の閾値**。同水準（本定数以内）なら「幅のある肩」の
 * 一部として窓を通す。詳細は `outerShoulderOk` のコメントを参照。
 *
 * ## {@link HS_NECKLINE_MAX_PCT} との違い
 *
 * あちらは許容誤差と AND を取らない**独立した固定閾値**で、常に 5% が実効値
 * （`tolerancePct` を動かしてもネックライン水平度は動かない。schema の `tolerancePct`
 * description が公開している契約でもある）。本定数は肩の判定では許容誤差と
 * `min` を取るので、**同じ 0.05 でも効き方が違う。**
 */
export const HS_SHOULDER_MAX_PCT = 0.05;

/**
 * H&S / IHS のネックライン構成点（p1, p3）同水準の構造上限。
 *
 * **`tolerancePct` と AND を取らない独立した固定閾値**で、常にこの値が実効値になる
 * （`validateHorizontalNeckline` の `maxPct` にそのまま渡る）。呼び出し側が
 * `tolerancePct` を動かしてもネックラインの水平度要求は動かない——schema の
 * `tolerancePct` description が「ネックライン水平度は本パラメータに依存しない固定閾値」
 * として公開している契約。
 *
 * 肩側の {@link HS_SHOULDER_MAX_PCT} は同じ 0.05 でも肩の許容誤差と `min` を取る
 * ため効き方が違う（その許容誤差自体も strict と relaxed で式が違う）。**混同しないこと。**
 */
export const HS_NECKLINE_MAX_PCT = 0.05;

/**
 * 反転パターンのサイズ検査の下限。**パターン高さ**（構成点の高安の全振幅）と、
 * **戻りの深さ**（山と山に挟まれた谷 / 谷と谷に挟まれた山の押し）にそれぞれ掛かる。
 *
 * 元は `detect_doubles.ts` のローカル定数だった。double だけがサイズ検査を持ち、
 * `detect_triples.ts` / `detect_hs.ts` には相当する検査が 1 つも無かったため、
 * **double なら弾かれる小ささの形が triple / H&S では通っていた**（issue #138 欠陥 2-2）。
 * BTC/JPY 1時間足で高さ 1.66% のレンジ往復が `triple_top` と `triple_bottom` に
 * 同時に化けたのがこれ。値を揃えるために、定数と検査本体をここへ引き上げた。
 *
 * **時間足別の実効値は `config.ts` の `getSizeThresholdsForTf` が持つ（issue #152）。**
 * 本定数は **1day 相当の基準値**で、同関数のアンカー（1day / 1week / 1month / 未知の
 * 時間足のフォールバック）としてそのまま使われる。検出器から直接参照してはならない——
 * `tf` を知っている層（`detect_patterns.ts`）で 1 回だけ解決し、`DetectContext.sizeThresholds`
 * 経由で配る。
 */
export const MIN_PATTERN_HEIGHT_PCT = 0.03;

/**
 * {@link MIN_PATTERN_HEIGHT_PCT} と対。谷 / 山 1 つあたりの戻りの深さの下限。
 *
 * 時間足別の実効値と本定数の位置づけは {@link MIN_PATTERN_HEIGHT_PCT} の docstring を参照。
 */
export const MIN_DEPTH_PCT = 0.05;

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

/**
 * サイズ検査の下限 2 つ。**どちらも下限で、小さいほど緩い。**
 *
 * 実値は時間足別（`config.ts` の `getSizeThresholdsForTf`。issue #152）。1day 相当の
 * 基準値が {@link MIN_PATTERN_HEIGHT_PCT} / {@link MIN_DEPTH_PCT}。
 */
export interface SizeThresholds {
	/** パターン高さ（構成点の高安の全振幅）の下限 */
	heightPct: number;
	/** 谷 / 山 1 つあたりの戻りの深さの下限 */
	depthPct: number;
}

/**
 * サイズ検査の不合格理由コード。`detect_doubles.ts` が既に debug candidates へ
 * 載せている 3 コードと同じ命名で、種別をまたいで同じ意味を持つ。
 */
export type PatternSizeRejectReason =
	/** パターン高さ（構成点の全振幅）が {@link SizeThresholds.heightPct} 未満 */
	| 'pattern_too_small'
	/** top: 山に挟まれた谷の押しが {@link SizeThresholds.depthPct} 未満 */
	| 'valley_too_shallow'
	/** bottom: 谷に挟まれた山の戻りが {@link SizeThresholds.depthPct} 未満 */
	| 'peak_too_shallow';

/**
 * 主構成点の水準ばらつき（`price` 基準）と、パターン高さ（`extremePrice` 基準）の実測値。
 *
 * **分子と分母で価格基準が違うのは意図的**（issue #138）。それぞれ既存の慣行に合わせている:
 *
 * | | 基準 | 合わせた既存実装 |
 * |---|---|---|
 * | 分子（水準ばらつき） | `Pivot.price`（終値） | 同水準判定（`near` / `isSameLevel`）。#131 / #132 の「水準同一性は終値」 |
 * | 分母（パターン高さ） | `Pivot.extremePrice`（高安） | {@link validatePatternSize}。同じく #131 / #132 の「値幅は高安」 |
 *
 * `extremePrice` 基準の全振幅は `price` 基準の全振幅**以上**（山は `high >= close`、
 * 谷は `low <= close`）なので、**比は保守的に（小さめに）出る**＝この比を上限として使う
 * 検査は棄却が控えめになる。安全側に倒すための選択で、逆（分母を `price`）にすると
 * ヒゲの分だけ棄却が増える。
 */
export interface LevelSpreadMetrics {
	/** 主構成点の `price` の max - min（絶対額） */
	spreadAbs: number;
	/** 同、価格水準に対する比。分母は主構成点の最大値（`relDev` と同じく `Math.max(1, …)` でクランプ） */
	spreadPct: number;
	/** 全構成点の `extremePrice` の max - min（絶対額）。構成点が欠けていれば `null` */
	heightAbs: number | null;
	/** 同、価格水準に対する比。分母は {@link validatePatternSize} と同じ `Math.max(1, hi)` */
	heightPct: number | null;
	/** `spreadAbs / heightAbs`。高さが 0 か構成点欠損なら `null` */
	spreadRatio: number | null;
}

/**
 * 主構成点の水準ばらつきをパターン高さで正規化した比を測る（issue #138）。
 *
 * `mainPoints` は同水準であるべき点（triple なら 3 山 / 3 谷）、`allPoints` は
 * パターン全体の構成点（triple なら 5 点）。`allPoints` に欠損（`null`）が混じる場合は
 * 高さを測れないので `heightAbs` / `heightPct` / `spreadRatio` を `null` にして
 * **ばらつきだけを返す**（棄却理由の details 用。呼び出し側が高さの確定前に呼べる）。
 */
export function levelSpreadMetrics(
	mainPoints: ReadonlyArray<Pick<Pivot, 'price'>>,
	allPoints: ReadonlyArray<Pick<Pivot, 'extremePrice'> | null | undefined>,
): LevelSpreadMetrics {
	const levels = mainPoints.map((p) => p.price);
	const spreadAbs = Math.max(...levels) - Math.min(...levels);
	const spreadPct = spreadAbs / Math.max(1, Math.max(...levels));

	const extremes = allPoints.map((p) => p?.extremePrice);
	const complete = extremes.every((v): v is number => Number.isFinite(v));
	if (!complete) return { spreadAbs, spreadPct, heightAbs: null, heightPct: null, spreadRatio: null };

	const hi = Math.max(...extremes);
	const lo = Math.min(...extremes);
	const heightAbs = hi - lo;
	return {
		spreadAbs,
		spreadPct,
		heightAbs,
		heightPct: heightAbs / Math.max(1, hi),
		spreadRatio: heightAbs > 0 ? spreadAbs / heightAbs : null,
	};
}

/**
 * 主構成点の水準ばらつきの、**パターン高さに対する**上限（issue #138）。
 *
 * ## なぜ価格水準の % では足りないのか
 *
 * 同水準判定（`near` / `tolerancePct`）は `|a-b| / max(a,b)` を見るので、**パターン自身の
 * 高さと無関係**。issue #138 の実例（BTC/JPY 1時間足）では許容幅がパターン高さの 3 倍あり、
 * 3 山が高さの 68% ばらついて単調に切り下がっていても「同水準」を通った。
 *
 * ## 0.5 の意味
 *
 * **本定数は triple と double が共有する**（double は #178 項目 4。同じ量を同じ意味で測るので
 * 検出器ごとに別の値を持たない。理由コードの語彙だけ {@link validateLevelDiff} が分けている）。
 * 以下は導入時の triple の説明だが、`3 山` を `2 山` に読み替えれば double にもそのまま当たる。
 *
 * `spreadRatio = 主構成点のばらつき / パターン高さ`。top なら
 * `高さ = 最高の山 - 最安の谷 = ばらつき + 最低の山からネックラインまでの押し` なので、
 * **`spreadRatio > 0.5` は「山の水準帯が、その山から谷までの押しより厚い」**を意味する。
 * 水準帯が押しより厚い形は、水平なレジスタンスに 3 回当たった形として読めない
 * （目視すれば単なる下降線 / 頭の突出した H&S）。#131 の「構造として成立しない形は
 * 減点ではなく hard reject」の系列。
 *
 * ## 時間足別テーブルを持たない理由
 *
 * **パターン自身の高さで正規化しているので、ボラティリティの水準に依らない。**
 * `getSizeThresholdsForTf`（#152）が時間足別なのは、あちらが価格水準の % を絶対的な下限として
 * 使っており ATR に対する難易度が時間足間で揃わなかったため。本比は無次元なのでその問題が無い。
 *
 * ## `tolerancePct` との関係
 *
 * **独立した AND 条件**で、`tolerancePct` の意味も既定値も変えない（#152 で
 * 「`getDefaultToleranceForTf` は触らない」と決めた理由がそのまま当てはまる）。
 * 実効的な水準ばらつきの上限は `min(tolerancePct × 価格水準, 本定数 × パターン高さ)`。
 */
export const MAX_LEVEL_SPREAD_RATIO = 0.5;

/**
 * 主構成点の水準ばらつきがパターン高さに対して過大な場合の理由コード。
 * {@link PatternSizeRejectReason} と同じく side ごとに別コードにしてある。
 */
export type PatternLevelSpreadRejectReason =
	/** top: 3 山（主構成点）のばらつきが {@link MAX_LEVEL_SPREAD_RATIO} × パターン高さを超える */
	| 'peak_spread_vs_height_excess'
	/** bottom: 3 谷（主構成点）のばらつきが同上 */
	| 'valley_spread_vs_height_excess';

/**
 * 高さ相対の同水準検査（issue #138）。不合格理由 or `null` を返す。
 *
 * **`metrics.spreadRatio` が `null`（高さを測れない / 高さ 0）のときは `null` を返す**——
 * 判定材料が無い候補を落とすと、この検査が意図していない理由で検出が減る。
 *
 * **呼び出しは各検出経路の「既存の棄却検査をすべて通過した後」に置くこと。**
 * 理由は {@link validatePatternSize} の docstring と同じ（固有の理由コードを持つ候補の
 * `reason` を横取りしない）。本検査は構造ゲート（`validateReversalStructure`）よりも後に置く
 * ——サイズ検査より後、というだけでは構造ゲートの理由を横取りしてしまう。
 */
export function validateLevelSpread(
	side: ReversalSide,
	metrics: LevelSpreadMetrics,
	maxRatio: number = MAX_LEVEL_SPREAD_RATIO,
): PatternLevelSpreadRejectReason | null {
	if (!exceedsLevelSpread(metrics, maxRatio)) return null;
	return side === 'top' ? 'peak_spread_vs_height_excess' : 'valley_spread_vs_height_excess';
}

/**
 * 主構成点**2 点**の水準の差がパターン高さに対して過大な場合の理由コード（issue #178 項目 4）。
 *
 * **{@link PatternLevelSpreadRejectReason} と語彙を分けてある。** 測っている量は同じ
 * `spreadRatio` だが、`view=debug` の集計が **`▼ reason 横断合計`（type を畳んで reason だけで
 * 合算する行。issue #193 / PR #194）** を出すため、流用すると **triple の「3 点のばらつき」と
 * double の「2 点の差」が横断合計行で 1 つの数字に潰れる**。type 別行では区別できるが、
 * 横断合計では区別できない。名前も `spread`（ばらつき）と `diff`（差）で対比させてある。
 */
export type PatternLevelDiffRejectReason =
	/** top: 2 山（主構成点）の差が {@link MAX_LEVEL_SPREAD_RATIO} × パターン高さを超える */
	| 'peaks_diff_vs_height_excess'
	/** bottom: 2 谷（主構成点）の差が同上 */
	| 'valleys_diff_vs_height_excess';

/**
 * 高さ相対の同水準検査の、**主構成点が 2 点の検出器（double）向け**（issue #178 項目 4）。
 *
 * 判定式は {@link validateLevelSpread} と同一（{@link exceedsLevelSpread}）で、返す理由コードの
 * 語彙だけが違う。分けた理由は {@link PatternLevelDiffRejectReason} の docstring を参照。
 *
 * ## 閾値は triple と同じ {@link MAX_LEVEL_SPREAD_RATIO}（0.5）
 *
 * `spreadRatio` は無次元なので時間足別テーブルを持たない、という
 * {@link MAX_LEVEL_SPREAD_RATIO} の理由が double にもそのまま当てはまる。double では
 * さらに強い根拠がある——**主構成点が全構成点に含まれる**ので
 * `spreadAbs <= heightAbs` が構造上成立し、`spreadRatio` の上界は**時間足に依らず 1.0**。
 * 「`DOUBLE_LEVEL_MAX_PCT`（固定 3%）÷ `getSizeThresholdsForTf().heightPct`（時間足別）」で
 * 出る比（`1hour` で 4.8）は**到達不能**で、時間足別化の根拠にならない
 * （#178 項目 4 の実測: サイズ検査を通過した 191 構造で `spreadRatio > 1` は 0 件、max 0.951）。
 *
 * ## 呼び出し位置
 *
 * {@link validateLevelSpread} と同じ——「既存の棄却検査をすべて通過した後」。double では
 * 構造ゲート（`applyStructuralGate`）**と triple 再分類判定（`checkPostPivotInvalidation`）の
 * 両方より後**に置く。前に置くと `reclassified_as_triple_top` を横取りする。
 */
export function validateLevelDiff(
	side: ReversalSide,
	metrics: LevelSpreadMetrics,
	maxRatio: number = MAX_LEVEL_SPREAD_RATIO,
): PatternLevelDiffRejectReason | null {
	if (!exceedsLevelSpread(metrics, maxRatio)) return null;
	return side === 'top' ? 'peaks_diff_vs_height_excess' : 'valleys_diff_vs_height_excess';
}

/**
 * {@link validateLevelSpread} / {@link validateLevelDiff} が共有する判定。
 *
 * **`metrics.spreadRatio` が `null`（高さを測れない / 高さ 0）のときは `false` を返す**——
 * 判定材料が無い候補を落とすと、この検査が意図していない理由で検出が減る。
 */
function exceedsLevelSpread(metrics: LevelSpreadMetrics, maxRatio: number): boolean {
	if (metrics.spreadRatio === null || !Number.isFinite(metrics.spreadRatio)) return false;
	return metrics.spreadRatio > maxRatio;
}

/**
 * 同水準判定で落ちた候補の診断値（issue #138）。`view=debug` の `details` に載せる。
 *
 * `spreadPct` は価格水準基準（= `near` / `tolerancePct` が見ている量）、`heightPct` は
 * パターン高さの価格水準比、`spreadRatio` が**両者の比**——「主構成点のばらつきがパターン自身の
 * 高さの何割か」を読むための値で、issue #138 の実例では 0.68 だった。
 *
 * `levelTolerancePct` は **その経路の同水準判定が実際に使った許容誤差**（複数のゲートが同じ量を
 * 見ている経路ではその `min`）。生のパラメータ値をエコーするフィールドではないので、名前を
 * `tolerancePct` にしない。
 *
 * `allPoints` に構成点が欠けている（`null`）候補では高さを測れないので
 * `heightAbs` / `heightPct` / `spreadRatio` は `null` になり、content にも出ない。
 */
export function levelSpreadDetailsFrom(m: LevelSpreadMetrics, levelTolerancePct: number): Record<string, unknown> {
	return {
		spreadAbs: m.spreadAbs,
		spreadPct: m.spreadPct,
		heightAbs: m.heightAbs,
		heightPct: m.heightPct,
		spreadRatio: m.spreadRatio,
		levelTolerancePct,
	};
}

/**
 * 反転パターンのサイズ検査（issue #138 欠陥 2-2）。不合格理由 or `null` を返す。
 *
 * `points` は**構成点を時系列順に並べた交互列**で、両端が主構成点（`side='top'`
 * なら山、`'bottom'` なら谷）であること。triple なら 5 点（山-谷-山-谷-山）、
 * H&S なら 5 点（左肩-谷-頭-谷-右肩）を渡す。
 *
 * 2 つの検査は `detect_doubles.ts` の `validateTopSize` / `validateBottomSize` と同型:
 *
 * - **パターン高さ**: 全構成点の最大 - 最小。issue #138 が実例の高さを
 *   「12,734,408 - 12,526,411 ≈ 1.66%」と全振幅で測ったのに合わせている
 * - **戻りの深さ**: 内側の点それぞれを、**その両隣の平均**と比べる。double の
 *   `peakAvg = (a + c) / 2`（谷を挟む 2 山の平均）を構成点が増えた場合へ素直に
 *   延長したもので、3 点の場合は double の式そのものに一致する。頭を含めた全体
 *   平均にしないのは、H&S で頭が平均を押し上げて肩-ネックライン間の押しが
 *   浅くても通ってしまうのを避けるため
 *
 * 価格基準は `Pivot.extremePrice`（高安）。**値幅の評価だから**で、
 * #131 / #132 の結論（値幅系は `extremePrice`、水準同一性とライン系は終値）の
 * 横展開。`detect_doubles.ts` の `validateTopSize` の docstring も参照。
 *
 * **呼び出しは各検出経路の「既存の棄却検査をすべて通過した後」に置くこと。** 前に置くと、
 * 既に固有の理由コードを持つ候補の `reason` を横取りして `view=debug` の診断が変わる
 * （実際、先に置いた版では `forming_neckline_not_horizontal` を検査していた既存テストが
 * `valley_too_shallow` に化けて落ちた）。最後に置けば **「これまで accepted だった候補だけを
 * 落とす」ことが位置から保証される**。
 *
 * 形成中パターンの暫定構成点（3 点目 / 暫定右肩）は極値判定を通っていないので、
 * `{ extremePrice: 現在足の終値 }` を渡す（既存の形成中 H&S の暫定右肩と同じ扱い）。
 *
 * **`thresholds` は引数で受ける（issue #152）。** 時間足別の値になったが、本ファイルは
 * 純粋関数のみで `DetectContext` を知らないので、解決は `tf` を知っている
 * `detect_patterns.ts` で 1 回だけ行い `DetectContext.sizeThresholds` で配る。
 * ここでモジュール定数を直接読むと時間足別の値が効かない。
 */
export function validatePatternSize(
	side: ReversalSide,
	points: ReadonlyArray<Pick<Pivot, 'extremePrice'>>,
	thresholds: SizeThresholds,
): PatternSizeRejectReason | null {
	const prices = points.map((p) => p.extremePrice);
	if (prices.length < 3 || prices.some((v) => !Number.isFinite(v))) return null;

	const hi = Math.max(...prices);
	const lo = Math.min(...prices);
	if ((hi - lo) / Math.max(1, hi) < thresholds.heightPct) return 'pattern_too_small';

	const shallow: PatternSizeRejectReason = side === 'top' ? 'valley_too_shallow' : 'peak_too_shallow';
	for (let i = 1; i < prices.length - 1; i += 2) {
		const flankAvg = (prices[i - 1] + prices[i + 1]) / 2;
		const depthPct =
			side === 'top' ? (flankAvg - prices[i]) / Math.max(1, flankAvg) : (prices[i] - flankAvg) / Math.max(1, flankAvg);
		if (depthPct < thresholds.depthPct) return shallow;
	}
	return null;
}

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
