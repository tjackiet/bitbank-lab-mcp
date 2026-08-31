/**
 * patterns/config.ts - 時間軸に応じたパラメータ設定
 *
 * パターン検出で使用するデフォルトパラメータを時間軸ごとに提供する。
 */

import { MIN_DEPTH_PCT, MIN_PATTERN_HEIGHT_PCT, type SizeThresholds } from './structural.js';

/** パターンごとの最小整合度（閾値） */
export const MIN_CONFIDENCE: Record<string, number> = {
	triple_top: 0.7,
	triple_bottom: 0.7,
	double_top: 0.65,
	double_bottom: 0.65,
	head_and_shoulders: 0.7,
	inverse_head_and_shoulders: 0.7,
};

/** スキーマのデフォルト値（サーバ側で埋められる値） */
export const SCHEMA_DEFAULTS = {
	swingDepth: 7,
	minBarsBetweenSwings: 5,
	tolerancePct: 0.04,
} as const;

/**
 * 時間軸に応じたスイング検出パラメータを返す
 */
export function getDefaultParamsForTf(tf: string): { swingDepth: number; minBarsBetweenSwings: number } {
	const t = String(tf);
	// 期待動作（例）の目安に基づくデフォルト
	if (t === '1hour') return { swingDepth: 3, minBarsBetweenSwings: 2 };
	if (t === '4hour') return { swingDepth: 5, minBarsBetweenSwings: 3 };
	if (t === '8hour') return { swingDepth: 5, minBarsBetweenSwings: 3 };
	if (t === '12hour') return { swingDepth: 5, minBarsBetweenSwings: 3 };
	if (t === '1day') return { swingDepth: 6, minBarsBetweenSwings: 4 };
	if (t === '1week') return { swingDepth: 7, minBarsBetweenSwings: 5 };
	if (t === '1month') return { swingDepth: 8, minBarsBetweenSwings: 6 };
	// 分足はやや緩め（ノイズ多めのため最小幅は確保）
	if (t === '30min') return { swingDepth: 3, minBarsBetweenSwings: 2 };
	if (t === '15min') return { swingDepth: 3, minBarsBetweenSwings: 2 };
	if (t === '5min') return { swingDepth: 2, minBarsBetweenSwings: 1 };
	if (t === '1min') return { swingDepth: 2, minBarsBetweenSwings: 1 };
	// フォールバック（日足相当）
	return { swingDepth: 6, minBarsBetweenSwings: 4 };
}

/**
 * 時間軸に応じた許容誤差（tolerancePct）を返す
 */
export function getDefaultToleranceForTf(tf: string): number {
	const t = String(tf);
	if (t === '1hour' || t === '4hour') return 0.05; // 5%
	if (t === '8hour' || t === '12hour') return 0.045; // 4.5%
	if (t === '15min' || t === '30min') return 0.06; // 6%
	if (t === '1week') return 0.035; // 3.5%
	if (t === '1month') return 0.03; // 3.0%
	return 0.04; // 1day 他
}

/**
 * 時間軸に応じたサイズ検査の下限（パターン高さ / 戻りの深さ）を返す（issue #152）。
 *
 * `structural.ts` の {@link MIN_PATTERN_HEIGHT_PCT} / {@link MIN_DEPTH_PCT} は時間足に
 * 依らない固定パーセンテージだったため、**ボラティリティに対する難易度が時間足間で
 * まったく揃っていなかった**。ATR で正規化すると BTC/JPY で:
 *
 * | | 1day（ATR 2.75%） | 1hour（ATR 0.57%） |
 * |---|---|---|
 * | `MIN_DEPTH_PCT = 5%` | 1.82 ATR | **8.77 ATR** |
 * | `MIN_PATTERN_HEIGHT_PCT = 3%` | 1.09 ATR | **5.26 ATR** |
 *
 * 結果として 1hour では H&S が実質的に検出不能で（`limit=365` / `headProminencePct=0.01`
 * でも 0 件）、棄却理由の 39% がサイズ検査（`valley_too_shallow` / `peak_too_shallow`）だった。
 *
 * **設計上の約束が 3 つある。**
 *
 * 1. **実行時に ATR へ連動させない。** 値の導出にだけ ATR を使い、テーブルは凍結する。
 *    閾値が実データ（＝`limit`）の関数になると #154 の「窓を広げたのに検出が減る」を
 *    再導入する（#154 / PR #156 の結論。`getTriangleWindowSize` 等と同じく静的テーブル）。
 * 2. **アンカーは 1day で、現行値を据え置く。** `MIN_PATTERN_HEIGHT_PCT = 3%` /
 *    `MIN_DEPTH_PCT = 5%` がそのまま 1day の値になる。両方とも下限なので、下位時間足を
 *    緩める変更は**単調に検出が増えるか不変**にしかならない。
 * 3. **種別ごとに分けない。** double / triple / H&S が同じ値を共有する（#139 の共通化。
 *    値が割れていたせいで BTC/JPY 1時間足の高さ 1.66% のレンジ往復が `triple_top` と
 *    `triple_bottom` に同時に化けた）。時間足依存にするだけで、共有は維持する。
 *
 * ## 導出
 *
 * 1day を 1.0 とした ATR 比を各時間足に掛ける。**1day 以上は現行値のまま据え置く**
 * （1week / 1month はボラが 1day より大きいので √t を適用すると**締まる**方向になり、
 * 「緩める方向のみ」という本変更の前提に反する）。
 *
 * | 時間足 | ATR 比 | 由来 | `heightPct` | `depthPct` |
 * |---|---|---|---|---|
 * | `1min` | 0.0264 | √t 推定 | 0.08% | 0.13% |
 * | `5min` | 0.0589 | √t 推定 | 0.18% | 0.29% |
 * | `15min` | 0.1021 | √t 推定 | 0.31% | 0.51% |
 * | `30min` | 0.1443 | √t 推定 | 0.43% | 0.72% |
 * | `1hour` | 0.2073 | **実測**（ATR 0.57% / 2.75%） | **0.62%** | **1.04%** |
 * | `4hour` | 0.4082 | **√t 推定**（未実測） | **1.22%** | **2.04%** |
 * | `8hour` | 0.5774 | √t 推定 | 1.73% | 2.89% |
 * | `12hour` | 0.7071 | √t 推定 | 2.12% | 3.54% |
 * | `1day` | 1.0 | **実測**（アンカー） | **3%（据え置き）** | **5%（据え置き）** |
 * | `1week` / `1month` | — | 据え置き | 3% | 5% |
 *
 * **`4hour` は実測ではない。** BTC/JPY の 4hour ATR は測っておらず、1day の 2.75% から
 * √t で `2.75 / √6 = 1.12%` と推定した値を使っている（比にすると `1/√6 = 0.4082`）。
 * `1hour` の 0.57% は実測で、√t 整合も取れている（`0.57 × √24 = 2.79 ≈ 2.75`）。
 * 4hour の ATR を実測したら比を差し替えること。
 *
 * `1min` / `5min` / `15min` / `30min` / `8hour` / `12hour` も同じ √t 規則で導出した推定値。
 * 現行値のまま据え置く案もあったが、**据え置くとこれらの時間足には issue #152 の欠陥が
 * そのまま残る**（1hour より短い足はさらに ATR 比が小さいので、5% はより極端に厳しい）。
 * 下限を下げるだけなので検出は単調に増える方向にしか動かない。
 */
export function getSizeThresholdsForTf(tf: string): SizeThresholds {
	const t = String(tf);
	// 1day より短い足は ATR 比（1day = 1.0）で緩める。1hour のみ実測、他は √t 推定。
	if (t === '1min') return { heightPct: 0.0008, depthPct: 0.0013 };
	if (t === '5min') return { heightPct: 0.0018, depthPct: 0.0029 };
	if (t === '15min') return { heightPct: 0.0031, depthPct: 0.0051 };
	if (t === '30min') return { heightPct: 0.0043, depthPct: 0.0072 };
	if (t === '1hour') return { heightPct: 0.0062, depthPct: 0.0104 };
	if (t === '4hour') return { heightPct: 0.0122, depthPct: 0.0204 }; // 推定（4hour の ATR は未実測）
	if (t === '8hour') return { heightPct: 0.0173, depthPct: 0.0289 };
	if (t === '12hour') return { heightPct: 0.0212, depthPct: 0.0354 };
	// 1day / 1week / 1month / 未知の時間足: アンカーの現行値を据え置く
	return { heightPct: MIN_PATTERN_HEIGHT_PCT, depthPct: MIN_DEPTH_PCT };
}

/**
 * 時間軸に応じた収束係数を返す（三角形・ウェッジ用）
 */
export function getConvergenceFactorForTf(tf: string): number {
	const t = String(tf);
	if (t === '1hour' || t === '4hour' || t === '15min' || t === '30min') return 0.6;
	return 0.8; // default
}

/**
 * 時間軸に応じた三角形の係数を返す
 */
export function getTriangleCoeffForTf(tf: string): { flat: number; move: number } {
	const t = String(tf);
	if (t === '1hour' || t === '4hour') return { flat: 1.2, move: 0.8 };
	return { flat: 0.8, move: 1.2 };
}

/**
 * 時間軸に応じた最小フィット値を返す
 */
export function getMinFitForTf(tf: string): number {
	const t = String(tf);
	if (t === '1hour' || t === '4hour') return 0.6;
	if (t === '1day') return 0.7;
	return 0.75;
}

/**
 * 時間軸に応じた三角形のウィンドウサイズを返す
 */
export function getTriangleWindowSize(tf: string): number {
	const t = String(tf);
	// 長期: 大きなパターン
	if (t === '1month') return 30;
	if (t === '1week') return 40;
	// 中期
	if (t === '1day') return 50;
	// 短期
	if (t === '4hour') return 30;
	if (t === '1hour') return 40;
	if (t === '30min') return 30;
	if (t === '15min') return 30;
	return 20;
}

/**
 * パラメータの実効値がどこから来たか。
 *
 * - `explicit`: 呼び出し側が渡した値がそのまま効いた
 * - `auto`: 時間軸オート表（{@link getDefaultParamsForTf} / {@link getDefaultToleranceForTf}）から解決した
 *
 * **`auto` は「未指定」と「スキーマ既定値（= sentinel）を明示指定」を畳んでいる。**
 * `swingDepth=7` / `minBarsBetweenSwings=5` / `tolerancePct=0.04` には `.default()` が
 * 付いているため、`resolveParams` に届いた時点で両者は同一の値であり区別できない（#182 / #184）。
 * どちらでも実効値は同じなので、見せたいほう（実効値）は失われない。
 * 区別が要るなら `.default()` の除去（#182 案 B）が前提になる。
 */
export type ParamSource = 'auto' | 'explicit';

/** {@link resolveParams} が返す、パラメータごとの由来。 */
export interface ResolvedParamSources {
	swingDepth: ParamSource;
	tolerancePct: ParamSource;
	minBarsBetweenSwings: ParamSource;
	headProminencePct: ParamSource;
}

/**
 * オプションとスキーマデフォルトから実効パラメータを解決する。
 *
 * 実効値の**計算**は #184 でも一切変えていない（sentinel 置換のルールはそのまま）。
 * 変えたのは由来の申告だけで、旧 `autoScaled: boolean` を廃止し
 * パラメータごとの {@link ParamSource} に置き換えた（#184 欠陥 B / 案 B-2）。
 *
 * 旧 `autoScaled` は `swingDepth` / `minBarsBetweenSwings` が**どちらも未指定**のときだけ
 * `true` になる集約フラグだった。ところが MCP 経路では 3 パラメータとも `.default()` が
 * 埋まるため `opts.swingDepth` が `undefined` になる経路が存在せず、**常に `false`** を返していた
 * （`{"pair":"btc_jpy","type":"1hour"}` = 完全オートでも `false`）。
 * 集約フラグでは「どのパラメータが auto でどれが明示か」も表現できないため、
 * per-parameter の由来に作り直してある。
 */
export function resolveParams(
	tf: string,
	opts: Partial<{
		swingDepth: number;
		tolerancePct: number;
		minBarsBetweenSwings: number;
		headProminencePct: number;
	}>,
): {
	swingDepth: number;
	tolerancePct: number;
	minBarsBetweenSwings: number;
	headProminencePct: number;
	sources: ResolvedParamSources;
} {
	const auto = getDefaultParamsForTf(tf);
	const tolAuto = getDefaultToleranceForTf(tf);

	// swingDepth: スキーマ既定値(7)が来た場合は時間軸オートに置換
	// （`explicit` = 「有限値が来た」かつ「それが sentinel ではない」。旧実装の入れ子三項と同値で、
	//   由来の判定を実効値の判定と同じ 1 つの述語から導くために平坦化してある）
	const swingDepthExplicit =
		Number.isFinite(opts.swingDepth as number) && (opts.swingDepth as number) !== SCHEMA_DEFAULTS.swingDepth;
	const swingDepth = swingDepthExplicit ? (opts.swingDepth as number) : auto.swingDepth;

	// tolerancePct: スキーマ既定値(0.04)が来た場合は時間軸オートを採用
	// **述語は swingDepth と揃えない。** 旧実装が `typeof === 'number' && !Number.isNaN` で
	// 判定していたため、`Number.isFinite` に揃えると `Infinity` の扱いが変わる（実効値が動く）。
	const tolerancePctExplicit =
		typeof opts.tolerancePct === 'number' &&
		!Number.isNaN(opts.tolerancePct) &&
		opts.tolerancePct !== SCHEMA_DEFAULTS.tolerancePct;
	const tolerancePct = tolerancePctExplicit ? (opts.tolerancePct as number) : tolAuto;

	// minBarsBetweenSwings: 同様に既定値(5)なら時間軸オートに置換
	const minBarsExplicit =
		Number.isFinite(opts.minBarsBetweenSwings as number) &&
		(opts.minBarsBetweenSwings as number) !== SCHEMA_DEFAULTS.minBarsBetweenSwings;
	const minBarsBetweenSwings = minBarsExplicit ? (opts.minBarsBetweenSwings as number) : auto.minBarsBetweenSwings;

	// headProminencePct（H&S / 逆H&S の頭の最小突出率、issue #149）: スキーマに .default() を
	// 付けていないため、呼び出し側が省略すれば opts.headProminencePct は確実に undefined になる
	// （tolerancePct のような「スキーマ既定値と等しいか」の判定は不要）。未指定なら tolerancePct と
	// 同じ時間軸オート表（tolAuto）を採用する——これは新パラメータ切り出し前に tolerancePct が
	// 実質担っていた頭の判定閾値と数値上一致させ、既定値のままの挙動を変えないため。
	// **本パラメータの `auto` だけは「未指定」と同義**（sentinel 値との衝突が無い）。
	const headProminenceExplicit = typeof opts.headProminencePct === 'number' && !Number.isNaN(opts.headProminencePct);
	const headProminencePct = headProminenceExplicit ? (opts.headProminencePct as number) : tolAuto;

	return {
		swingDepth,
		tolerancePct,
		minBarsBetweenSwings,
		headProminencePct,
		sources: {
			swingDepth: swingDepthExplicit ? 'explicit' : 'auto',
			tolerancePct: tolerancePctExplicit ? 'explicit' : 'auto',
			minBarsBetweenSwings: minBarsExplicit ? 'explicit' : 'auto',
			headProminencePct: headProminenceExplicit ? 'explicit' : 'auto',
		},
	};
}
