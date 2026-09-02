/**
 * patterns/target-reach.ts — ブレイク後の target 到達判定（issue #210）
 *
 * `helpers.ts` から切り出したのは **`src/schema/patterns.ts` が閾値を読むため**。
 * `targetReachedPct` / `targetReached` の description は走査窓の本数・上限値・退化の閾値を
 * 名指しで説明するので、数値を description 側に書き写すと**振る舞いと宣言が黙ってずれる**。
 * `helpers.ts` ごと import すると dayjs / indicators までスキーマの依存に入るため、
 * 依存が `./types.js` の型だけで済むこの単位に分けてある。
 */

import type { CandleData } from './types.js';

// ---------------------------------------------------------------------------
// ブレイク後の target 到達判定（high/low ベース）
//
// 最終 close ベースだと、ブレイク後に一度 target を越えてから戻ったケースで
// 未到達扱いされてしまう。実際には「ブレイク後に target を越えたか」を見たいので、
// breakoutIdx 以降のローソク足を走査して extremum
// （下方ブレイクなら min low / 上方ブレイクなら max high）を取り、その値で進捗率を計算する。
//
// 入力:
//   - candles: 全ローソク足
//   - breakoutIdx: ブレイク確定足のインデックス（このバー以降を走査）
//   - breakoutPrice: ブレイク確定時の参照価格（通常は close）
//   - target: 想定ターゲット価格
//   - direction: 'up'  → breakoutIdx 以降の最高 high で評価
//                'down' → breakoutIdx 以降の最安 low で評価
//   - patternHeight: そのパターンが投影している値幅（分母の退化判定に使う）
//
// 戻り値:
//   - `{ kind: 'measured', … }` — 進捗を測れた
//   - `{ kind: 'omitted', … }` — 分母が退化していて測れない（呼び出し側が申告する）
//   - `undefined` — 入力不正 / 走査対象の足が無い
// ---------------------------------------------------------------------------

/**
 * ブレイク足から何本先まで target 到達を探すか（issue #210 (3)）。
 *
 * **上限が無いと `targetReached` / `targetReachedPct` が「いつ問い合わせたか」に依存する。**
 * 走査は元々 `candles.length` まで無制限だったので、同じ構造・同じブレイク足のパターンでも
 * 系列が伸びるほど extremum が更新されて値が動いた。実データ B（`btc_jpy` 1hour）で系列末尾を
 * 240 本 / 365 本に切り替えた実測:
 *
 * | パターン | 240 本で | 365 本で |
 * |---|---:|---:|
 * | `falling_wedge`（ブレイク 08-17T15:00Z） | 4,473% | 5,102% |
 * | `inverse_head_and_shoulders`（同 08-17T18:00Z） | 209,921% | 240,033% |
 * | `triangle_ascending`（target 10,387,692） | 1,507% | 1,719% |
 *
 * 実データ A（1day 90 本）では系列を 60 本 / 75 本で切ると `targetReached` **そのもの**が
 * false → true に反転した（`double_bottom` 8% → 330%、`triangle_symmetrical` 31% → 207%）。
 * #154（窓を広げたのに検出が減る）と同じ「同じ構造なのに窓次第で答えが変わる」欠陥だが、
 * **軸は窓の大きさではなく観測時点**——`limit`（＝先頭の切り詰め）では動かない（総当たりで差分 0）。
 *
 * **60 の根拠**（標準コーパス 896 ケース / `computeTargetReach` の生の呼び出し 5,000 行）:
 * 到達済み 2,576 行の「初到達までのバー数」は p50 = 12 / p75 = 37 / p95 = 52 / p99 = 72 で、
 * **60 本以内が 96.3%**。60 本にすると `targetReached` は構造単位 75 → 72 件（−3）しか動かない。
 * 90 本にすれば構造単位の増減は 0 になるが、90 本ぶんの先が揃う行が 29.4% しかなく
 * （60 本なら 39.5%）「値が固まるまでの待ち」が長くなるので採らない。
 *
 * **時間足別のテーブルにしない。** バー数のまま持つ（`HS_BREAKOUT_MAX_BARS` と同じ扱い）。
 * 時間足別テーブルの流用は #198 で事故になっている。
 */
export const TARGET_REACH_MAX_BARS = 60;

/**
 * `targetReachedPct` の分母 `|target − breakoutPrice|` が、そのパターンが投影している値幅
 * （パターン高さ）に対してこの比を下回ったら **target 進捗系フィールドを出さない**（issue #210 (2)）。
 *
 * 分母が潰れるのは **ネックラインから投影する検出器（H&S / doubles）だけ**。
 * triangles / wedges / pennants / flags は `breakoutTarget = ブレイク価格 ± patternHeight` なので
 * `targetDistance ≡ patternHeight` になり、構造上ここには掛からない（標準コーパスの実測でも
 * 比は 0.9844〜1.0103 = `Math.round` の丸めぶんしか動かない）。H&S / doubles は
 * ブレイク足がネックラインから値幅ぶん走っていると分母だけが潰れ、比が 0.0033 まで落ちる。
 *
 * **閾値は高さ相対（無次元）にする。** 価格相対にすると時間足別テーブルが要る
 * （`MAX_LEVEL_SPREAD_RATIO` が同じ理由で無次元を選んでいる。#198 も参照）。
 *
 * **0.15 の根拠**（標準コーパス 896 ケース、H&S / doubles の 1,512 行）:
 * 比の分布は p50 = 0.49 で、下側は 0.0033 / 0.0068 / 0.0121 / 0.0955 / 0.1012 / 0.1059 / 0.1379 と
 * 続き 0.2027 に飛ぶ。閾値を上げていくと **0.12 が膝**で、そこで H&S / doubles に残る
 * `targetReachedPct` の最大値が 13,928% → 817% に落ちる（0.15 でも 0.25 でも同じ 817%）。
 * 0.15 は膝のすぐ上の丸い値で、除外は 144 行（全 5,000 行の 2.9%）/ 構造単位 7 件。
 *
 * 意味としては「**ブレイク足の終値が既に想定値幅の 85% 以上を走り終えている**」状態で、
 * 残り 15% の消化を『ターゲット到達』と名乗らせない、ということ。
 */
export const MIN_TARGET_DISTANCE_HEIGHT_RATIO = 0.15;

/**
 * `targetReachedPct` の上限（issue #210 (1)）。**この値ちょうどは「以上」を意味する。**
 *
 * `MIN_TARGET_DISTANCE_HEIGHT_RATIO` と `TARGET_REACH_MAX_BARS` を入れた後の標準コーパスでは
 * 最大 1,572%（`falling_wedge`。比は 1.0 なので**本当に高さの 15 倍動いた**行）で、
 * 上限に当たるのは 32 行 / 構造単位 1 件。本質的な対策ではなく、
 * 上の 2 つをすり抜けた場合の安全網として置く。
 */
export const TARGET_REACHED_PCT_CAP = 999;

/** 進捗を測れたケース。 */
export interface TargetReachInfo {
	kind: 'measured';
	targetReachedPct: number;
	targetReached: boolean;
	targetReachedDate?: string;
	targetReachedPrice: number;
}

/** 分母が退化していて進捗を測れないケース。**黙って落とさず呼び出し側が申告する。** */
export interface TargetReachOmitted {
	kind: 'omitted';
	reason: 'degenerate_target_distance';
}

export type TargetReachResult = TargetReachInfo | TargetReachOmitted;

export function computeTargetReach(
	candles: readonly CandleData[],
	breakoutIdx: number,
	breakoutPrice: number,
	target: number,
	direction: 'up' | 'down',
	patternHeight: number,
): TargetReachResult | undefined {
	if (!Number.isFinite(breakoutPrice) || !Number.isFinite(target)) return undefined;
	const targetDistance = Math.abs(target - breakoutPrice);
	const startIdx = Math.max(0, breakoutIdx);
	if (startIdx >= candles.length) return undefined;

	// 分母の退化ガード（#210 (2)）。**距離ゼロもここに含まれる**——
	// 以前は `targetDistance <= EPSILON` を「既に到達」として pct=100 で返していたが、
	// 「ブレイク時点で target と一致」は達成度が測れない状態そのものなので、
	// 比が小さいケースと分けて扱う理由が無い。`patternHeight` が正でない場合も
	// 比を判定できないので測らない（高さが出ない形は target 自体が出ない経路が大半）。
	if (!(patternHeight > 0) || targetDistance < patternHeight * MIN_TARGET_DISTANCE_HEIGHT_RATIO) {
		return { kind: 'omitted', reason: 'degenerate_target_distance' };
	}

	// 走査はブレイク足から `TARGET_REACH_MAX_BARS` 本先まで（#210 (3)）。
	// 系列末尾までではないので、同じ構造には**問い合わせ時点に依らず同じ値**が出る
	// （ブレイクから上限本数ぶんの足が揃った後は不変。揃うまでは暫定値）。
	const lastIdx = Math.min(startIdx + TARGET_REACH_MAX_BARS, candles.length - 1);
	let extremePrice = direction === 'down' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
	let extremeIdx = -1;
	for (let i = startIdx; i <= lastIdx; i++) {
		const candle = candles[i];
		if (!candle) continue;
		if (direction === 'down') {
			const lo = Number(candle.low ?? NaN);
			if (!Number.isFinite(lo)) continue;
			if (lo < extremePrice) {
				extremePrice = lo;
				extremeIdx = i;
			}
		} else {
			const hi = Number(candle.high ?? NaN);
			if (!Number.isFinite(hi)) continue;
			if (hi > extremePrice) {
				extremePrice = hi;
				extremeIdx = i;
			}
		}
	}
	if (extremeIdx < 0 || !Number.isFinite(extremePrice)) return undefined;

	const targetReached = direction === 'down' ? extremePrice <= target : extremePrice >= target;
	// pct はブレイク価格から target 方向へどれだけ進んだかを 100% スケールで返す。
	// 分母を Math.abs にしておくことで、ブレイク足が既に target を越えていた場合の
	// 符号反転（reached=true なのに pct<0）を防ぐ。
	//
	// 丸めは reached/unreached で非対称にする:
	//   - reached=true:  round して [100, TARGET_REACHED_PCT_CAP] にクランプ
	//     （下側はオーバーシュート時の符号反転防止、上側は #210 (1) の安全網）
	//   - reached=false: floor して 99 にキャップ（99.6% などが 100 に丸まって
	//     下流の `pct >= 100` 判定を誤らせるのを防ぐ）
	const moveDistance = direction === 'down' ? breakoutPrice - extremePrice : extremePrice - breakoutPrice;
	const rawPct = (moveDistance / targetDistance) * 100;
	const targetReachedPct = targetReached
		? Math.min(TARGET_REACHED_PCT_CAP, Math.max(100, Math.round(rawPct)))
		: Math.min(99, Math.max(0, Math.floor(rawPct)));
	const targetReachedDate = candles[extremeIdx]?.isoTime;
	return {
		kind: 'measured',
		targetReachedPct,
		targetReached,
		...(targetReachedDate ? { targetReachedDate } : {}),
		targetReachedPrice: extremePrice,
	};
}

/**
 * `computeTargetReach` の結果を `PatternEntry` に載せるフィールドへ落とす。
 *
 * 12 箇所の呼び出し側に同じ spread を書き写していたのを 1 箇所に寄せたもの。
 * **`omitted` を黙って `{}` に畳まない**——進捗が出ない理由を
 * `targetProgressOmittedReason` で申告する（#181 / #196 / #200 と同じ方針）。
 */
export function targetReachFields(reach: TargetReachResult | undefined): {
	targetReachedPct?: number;
	targetReached?: boolean;
	targetReachedDate?: string;
	targetReachedPrice?: number;
	targetProgressOmittedReason?: 'degenerate_target_distance';
} {
	if (!reach) return {};
	if (reach.kind === 'omitted') return { targetProgressOmittedReason: reach.reason };
	return {
		targetReachedPct: reach.targetReachedPct,
		targetReached: reach.targetReached,
		...(reach.targetReachedDate ? { targetReachedDate: reach.targetReachedDate } : {}),
		targetReachedPrice: reach.targetReachedPrice,
	};
}

/**
 * content テキストの「ターゲット進捗」行を組む（`tools/detect_patterns.ts` と
 * `src/handlers/detectPatternsViewsHandler.ts` の共通実装）。
 *
 * `content[0].text` が LLM への唯一のチャネルなので、**走査窓が有限であること**と
 * **上限に当たったこと / 出さなかったこと**をこの 1 行で言い切る。
 * 行そのものを返す（先頭の `\n` は呼び出し側が付ける）。値が無ければ `null`。
 */
export function formatTargetProgressLine(p: {
	targetReachedPct?: number;
	targetReached?: boolean;
	targetProgressOmittedReason?: string;
}): string | null {
	if (p.targetProgressOmittedReason === 'degenerate_target_distance') {
		return `   - ターゲット進捗: 出力なし（ブレイク足が想定値幅の${Math.round((1 - MIN_TARGET_DISTANCE_HEIGHT_RATIO) * 100)}%以上を消化済みで、残り距離が短く進捗率が意味を持たないため）`;
	}
	if (p.targetReachedPct == null) return null;
	const pct = Number(p.targetReachedPct);
	const reached = pct >= 100;
	const value = reached && pct >= TARGET_REACHED_PCT_CAP ? `${TARGET_REACHED_PCT_CAP}%以上` : `${pct}%`;
	const verdict = reached
		? `ブレイク後${TARGET_REACH_MAX_BARS}本以内に到達`
		: `ブレイク後${TARGET_REACH_MAX_BARS}本以内は未到達`;
	return `   - ターゲット進捗: ${value}（${verdict}）`;
}
