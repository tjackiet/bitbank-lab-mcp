/**
 * 価格の丸め規約（ペア依存）を一元管理する。
 *
 * mid（中値）・bestBid/Ask・spread・depth 階段の price など /depth 由来の価格を
 * 出力・表示する全経路でここを共有し、「同一板 → 同一価格」を保証する。
 * 経路ごとに `toFixed(2)` / `Math.round` が食い違うと、LLM が複数ツールの結果を
 * クロスチェックした際に mid が乖離する（奇数 spread で顕著）。
 *
 * 内部の帯域・範囲・距離などの計算には丸め前の生 mid を使い、出力直前にここで丸める
 * （丸め誤差を集計に伝播させない）。
 */

/** JPY ペア（quote = JPY）かどうかを pair 名から判定する。 */
export function isJpyPair(pair: string): boolean {
	return pair.endsWith('_jpy');
}

/**
 * 価格を「JPY ペアなら整数（円未満は無意味）、それ以外は小数2桁」で丸める。
 *
 * @param value   丸める価格
 * @param jpyPair JPY ペアなら true（{@link isJpyPair} で判定）
 */
export function roundPrice(value: number, jpyPair: boolean): number {
	return jpyPair ? Math.round(value) : Number(value.toFixed(2));
}
