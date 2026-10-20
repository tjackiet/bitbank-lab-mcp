// /depth 由来の価格を出力する全経路でここを共有する（経路ごとに丸めが違うと複数ツールのクロスチェックで mid が乖離する）。計算には丸め前の生 mid を使い、出力直前に丸める。

export function isJpyPair(pair: string): boolean {
	return pair.endsWith('_jpy');
}

export function roundPrice(value: number, jpyPair: boolean): number {
	return jpyPair ? Math.round(value) : Number(value.toFixed(2));
}
