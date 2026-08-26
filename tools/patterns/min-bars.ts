/**
 * patterns/min-bars.ts - 「時間足 × 検出器 → 最小要求バー数」の単一ソース
 *
 * `docs/tools.md` の「`limit` の実効下限」§2（日数閾値由来の下限）を、手書きの表ではなく
 * 各検出器の定数から導出する。閾値そのものは各検出器に置いたまま（値は変えない）、
 * **どの時間足でどれだけの窓が要るか**の計算だけをここに集約する。
 *
 * ## なぜ要るか
 *
 * #114 でスキャン窓が「直近 `limit` 本」に一致した結果、日数ベースの閾値が窓を超えると
 * **そのパターン種別だけが静かに 0 件になる**（issue #118）。閾値は 6 ファイルに散っていて、
 * 個々の組み合わせが到達可能かどうかを人手で追えない。ここで機械可読にしておけば、
 * 到達性を CI で固定でき、閾値を動かしたときに何が到達不能になるかが即座に分かる。
 *
 * ## 何を返すか / 返さないか
 *
 * 返すのは **日数閾値由来の下限**、つまり「その時間足で日数（または日数換算の窓サイズ）の
 * 条件が満たされうる最小のスキャン窓本数」。`docs/tools.md` §2 の表と同じ意味論で、
 * 以下は**含めない**:
 *
 * - スイング検出の構造的下限（前後 `swingDepth` 本の除外）
 *   → `patterns/scan-window.ts` の `assessScanWindow`（docs §1）が担当。二重に持たない。
 * - 時間足でスケールしない絶対ガード
 *   （`detect_pennants` / `detect_triangles` の `if (lastIdx < 15) return`、
 *   `detect_patterns.ts` の `candles.length < 20`）
 *   → いずれも 21 本以下の定数で、既定 `limit`（90）では効かない。
 *
 * ## 対象外の検出器
 *
 * - **完成済み double / triple / H&S**: 日数閾値を持たない（ピボット構造のみ）。
 * - **形成中 wedge**: `formingWindowMin` は下限に見えるが、`detect_wedges` は
 *   「最新に揃えた特別ウィンドウ」を `Math.max(0, lastIdx - size)` で clamp して必ず積むため、
 *   窓が足りなくても候補が消えない。ハードなゲートではないのでここでは扱わない。
 */

import { MIN_PATTERN_DAYS as DOUBLE_FORMING_MIN_DAYS } from './detect_doubles.js';
import { FORMING_MIN_DAYS as HS_FORMING_MIN_DAYS } from './detect_hs.js';
import { getFlagParams } from './detect_pennants.js';
import { getTriangleParams } from './detect_triangles.js';
import { FORMING_MIN_DAYS as TRIPLE_FORMING_MIN_DAYS } from './detect_triples.js';
import { getWedgeBarParams } from './detect_wedges.js';
import { barsPerDay, formingReversalDaysPerBar } from './helpers.js';

/**
 * 日数閾値を持つ検出器の識別子。
 *
 * `docs/tools.md` §2 の表が持つのは `forming_triple` / `completed_wedge` / `flag_pennant` の
 * 3 列だが、同じクラスの閾値を持つ `forming_double` / `forming_hs` / `triangle` も
 * ここでは併せて導出する（到達性テストの網羅性のため）。
 */
export const MIN_BARS_DETECTORS = [
	'forming_double',
	'forming_hs',
	'forming_triple',
	'completed_wedge',
	'triangle',
	'flag_pennant',
] as const;

export type MinBarsDetector = (typeof MIN_BARS_DETECTORS)[number];

/**
 * `Math.round(formationBars × daysPerBar) >= minDays` を満たせる最小のスキャン窓本数。
 *
 * 各検出器の形成中判定は `patternDays = Math.round(formationBars * daysPerBar)` を作り、
 * `patternDays < minDays` で弾く。`Math.round` は 0.5 を切り上げるので
 *
 *   `Math.round(x) >= minDays` ⟺ `x >= minDays - 0.5`
 *
 * であり、`formationBars >= (minDays - 0.5) × barsPerDay` が要る。`formationBars` は
 * 添字の差（`lastIdx - firstPivot.idx`）なので、窓としてはさらに 1 本必要。
 */
function barsForFormationDays(minDays: number, barsPerDayValue: number): number {
	return Math.ceil((minDays - 0.5) * barsPerDayValue) + 1;
}

/**
 * その時間足でその検出器が候補を作りうる最小のスキャン窓本数を返す。
 *
 * 「この本数あれば検出できる」ではなく「これ未満だと日数閾値で構造的に 0 件」という下限。
 * 実効的な制約は `limit` そのものではなく `meta.scan.bars`（実際に走査した本数）。
 */
export function minBarsForDetector(tf: string, detector: MinBarsDetector): number {
	switch (detector) {
		// detect_doubles.ts: patternDays = Math.round(formationBars × 手書き daysPerBar)、
		// formationBars = lastIdx - leftPivot.idx。手書き daysPerBar は intraday / 1month が
		// 1 に落ちる（issue #118 問題 3）ので `formingReversalDaysPerBar` を使う。
		case 'forming_double':
			return barsForFormationDays(DOUBLE_FORMING_MIN_DAYS, 1 / formingReversalDaysPerBar(tf));

		// detect_hs.ts: 同上（閾値だけ 21 日）。
		case 'forming_hs':
			return barsForFormationDays(HS_FORMING_MIN_DAYS, 1 / formingReversalDaysPerBar(tf));

		// detect_triples.ts: こちらは helpers の `daysPerBar` を使っているので barsPerDay で換算する。
		case 'forming_triple':
			return barsForFormationDays(TRIPLE_FORMING_MIN_DAYS, barsPerDay(tf));

		// detect_wedges.ts: `generateWindows` は `start + size < totalBars` で回すので、
		// 最小サイズの窓が 1 つでも生成されるには `totalBars >= windowSizeMin + 1` が要る。
		case 'completed_wedge':
			return getWedgeBarParams(tf).windowSizeMin + 1;

		// detect_triangles.ts: `effectiveMax = Math.min(lastIdx - 5, maxWindowBars)` に対して
		// `minWindowBars <= effectiveMax` でないと windowSizes が空になる。
		// → `lastIdx >= minWindowBars + 5` → `bars >= minWindowBars + 6`。
		// `minWindowBars` は時間足でスケールしない定数（15）なので、値は全時間足で 21。
		case 'triangle':
			return getTriangleParams(tf).minWindowBars + 6;

		// detect_pennants.ts: スキャンループは `poleEnd = poleMinBars` から始まり
		// `poleEnd <= lastIdx - consMinBars` で回る。`poleEnd` は添字なので初回の反復に入るには
		// `bars >= poleMinBars + consMinBars + 1` が要る（旗竿と保ち合いの境界となる 1 本ぶん）。
		// forming_triple / completed_wedge の +1 と同じ性質の端点で、揃えて含める。
		case 'flag_pennant': {
			const { poleMinBars, consMinBars } = getFlagParams(tf);
			return poleMinBars + consMinBars + 1;
		}
	}
}

/** 1 時間足ぶんの全検出器の最小要求バー数。 */
export function minBarsTableForTf(tf: string): Record<MinBarsDetector, number> {
	const out = {} as Record<MinBarsDetector, number>;
	for (const d of MIN_BARS_DETECTORS) out[d] = minBarsForDetector(tf, d);
	return out;
}

/**
 * その検出器がそのスキャン窓で到達可能か（＝日数閾値が窓を超えていないか）。
 *
 * @param bars スキャン窓の本数（実効値は `meta.scan.bars`）
 */
export function isDetectorReachable(tf: string, detector: MinBarsDetector, bars: number): boolean {
	return minBarsForDetector(tf, detector) <= bars;
}
