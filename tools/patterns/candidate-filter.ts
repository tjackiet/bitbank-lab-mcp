/**
 * patterns/candidate-filter.ts - `debug.candidates` を入力 `patterns` フィルタで絞る
 *
 * ## なぜ要るか（issue #124）
 *
 * 全検出器が `want` を**分類・出力の時点**で参照しており、**走査に入る時点**では見ていない。
 * 候補（`debugCandidates`）は走査中に無条件で push されるため、`patterns=['double_bottom']`
 * を指定しても candidates には falling_wedge / rising_wedge が並び、
 * `detect_patterns.ts` の cap=200 トリム（accepted 優先 → rejected）で
 * **要求した種別の棄却理由が押し出される**。
 *
 * 各検出器の走査自体を `want` で早期スキップすれば計算量も減るが、6 ファイルに手を入れる
 * ことになり「検出結果ゼロ変更」の保証が難しい。ここでは**出力直前に 1 箇所で絞る**。
 *
 * ## ラベルの被覆は入力エイリアスと一致しない
 *
 * candidate の `type` は「その候補がどの種別になりえたか」を表すラベルで、
 * **方向・形状の分類前に積まれるものがある**。とくに `detect_pennants` は分類前の棄却を
 * すべて `type: 'flag'` で積むため、このラベルは flag だけでなく pennant も覆う。
 * 入力エイリアス（schema の `PATTERN_FILTER_ALIASES`）の `'flag' → bull_flag + bear_flag`
 * とは別物なので、2 つの写像を分けて持つ。
 *
 * ## 既知のギャップ
 *
 * `detect_triangles` / `detect_wedges` は分類前の棄却を具体型 `triangle_symmetrical` で
 * 積んでいる（umbrella ラベルを使っていない）。そのため
 * `patterns=['triangle_ascending']` ではそれらが落ちる。ラベル側を `'triangle'` に直すのが
 * 筋だが、**`patterns` 未指定時の candidates 出力が変わる**ため本モジュールでは救わない。
 */

/**
 * 入力 `patterns` のエイリアス → 具体 type。
 * `src/schema/patterns.ts` の `PATTERN_FILTER_ALIASES` のコメントと 1:1 で対応する。
 */
export const INPUT_ALIAS_EXPANSION: Readonly<Record<string, readonly string[]>> = {
	flag: ['bull_flag', 'bear_flag'],
	pennant: ['bull_pennant', 'bear_pennant'],
	triangle: ['triangle_ascending', 'triangle_descending', 'triangle_symmetrical'],
};

/**
 * candidate の `type` ラベルが実際に覆う具体 type。
 * ここに無いラベルは自分自身だけを覆う。
 */
export const CANDIDATE_LABEL_COVERAGE: Readonly<Record<string, readonly string[]>> = {
	// detect_pennants は方向・形状の分類前の棄却をすべてこのラベルで積む（flag / pennant 両方）。
	flag: ['bull_flag', 'bear_flag', 'bull_pennant', 'bear_pennant'],
	pennant: ['bull_pennant', 'bear_pennant'],
	triangle: ['triangle_ascending', 'triangle_descending', 'triangle_symmetrical'],
};

/** `want`（入力 `patterns`）を具体 type の集合に展開する。 */
export function expandWantedTypes(want: ReadonlySet<string>): Set<string> {
	const out = new Set<string>();
	for (const w of want) {
		for (const t of INPUT_ALIAS_EXPANSION[w] ?? [w]) out.add(t);
	}
	return out;
}

/** candidate ラベルが覆う具体 type。未知のラベルは自分自身のみ。 */
export function candidateLabelCoverage(type: string): readonly string[] {
	return CANDIDATE_LABEL_COVERAGE[type] ?? [type];
}

/**
 * `debug.candidates` を `want` で絞る。
 *
 * `want` が空（= `patterns` 未指定 = 全種別）のときは絞らない。
 * このとき返す配列の中身は入力と完全に同一で、順序も保つ。
 *
 * @param candidates 各検出器が push した候補
 * @param want 入力 `patterns`（エイリアス含む）。空 = 全種別
 */
export function filterCandidatesByWant<T extends { type: string }>(
	candidates: readonly T[],
	want: ReadonlySet<string>,
): T[] {
	if (!Array.isArray(candidates)) return [];
	if (want.size === 0) return [...candidates];
	const wanted = expandWantedTypes(want);
	return candidates.filter((c) => candidateLabelCoverage(String(c?.type)).some((t) => wanted.has(t)));
}
