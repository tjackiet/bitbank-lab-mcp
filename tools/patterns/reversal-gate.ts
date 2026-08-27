/**
 * patterns/reversal-gate.ts - 反転パターンの構造ゲートを検出器へ配線する層
 *
 * `structural.ts` の {@link validateReversalStructure} は純粋関数で、`debugCandidates` も
 * `PatternEntry` も知らない。本ファイルはその戻り値を **`view=debug` の棄却理由**と
 * **`PatternEntry.structureGate`** に変換するだけの薄い層で、判定ロジックは持たない。
 *
 * #131 は構造ゲートを `detect_doubles.ts` のローカル関数（`applyStructuralGate`）としてだけ
 * 配線し、「head_and_shoulders / triple への適用は本 PR では行っていない——検出件数への影響の
 * 確認が別途要るため」と明記して保留した（issue #138 欠陥 2-1）。本ファイルはその回収で、
 * triple / H&S の 12 経路が同じ形でゲートを呼べるようにしたもの。
 *
 * **`first` / `mid` は「`validatePatternSize` に渡す構成点列の先頭 2 点」と決めてある。**
 * double（谷1-山-谷2）では `first` が谷1、`mid` が山で自明だが、triple（谷1-山1-谷2-山2-谷3）と
 * H&S（左肩-谷1-頭-谷2-右肩）は構成点が 5 つあり自明ではない。先頭 2 点に固定した理由:
 *
 * - **`first` は「先行トレンドが終わった点」**。triple なら谷1 / 山1、H&S なら左肩で、
 *   どちらもパターンが始まる点そのもの。ここより手前に先行値幅を張る（issue #138 の
 *   「triple なら谷1 の手前か、H&S なら左肩の手前か」に対する答え）
 * - **`mid` は「先行トレンドに対する最初の戻り」**。戻り率は `first → mid` の 1 脚で測るもので、
 *   構成点が 5 つに増えても測る脚は変わらない。頭や第3構成点まで含めた全振幅で測ると
 *   「先行値幅に対する戻り」ではなく「パターン全体の大きさ」になり、別の量になる
 * - サイズ検査（{@link validatePatternSize}）と同じ配列の先頭 2 点なので、**構成点の取り方が
 *   経路ごとにずれない**。forming H&S のように先行谷が取れず 3 点（頭-戻り-右肩）に縮む経路でも、
 *   縮んだ配列の先頭 2 点が自動的に正しい `first` / `mid` になる
 *
 * ネックライン水準（`necklinePrice`）は **検出器がブレイク判定に使うのと同じ値**を呼び出し側が
 * 渡す（`ReversalStructureInput.necklinePrice` の docstring）。
 */
import { type ReversalSide, type ReversalStructureResult, validateReversalStructure } from './structural.js';
import type { Pivot } from './swing.js';
import type { CandDebugEntry, CandleData, PatternStructureGate } from './types.js';

export interface ReversalGateInput {
	candles: CandleData[];
	pivots: ReadonlyArray<Pivot>;
	side: ReversalSide;
	/** 構成点列の先頭（bottom なら谷1 / 左肩、top なら山1 / 左肩）。本ファイル冒頭の注記を参照 */
	first: Pivot;
	/** 構成点列の 2 点目（先行トレンドに対する最初の戻り）。同上 */
	mid: Pivot;
	/** 検出器がブレイク判定に使うのと同じネックライン水準 */
	necklinePrice: number;
	/** `view=debug` の candidate に載せるパターン種別 */
	type: string;
	/** 同 `indices`。各経路の既存の棄却 candidate と同じ並びを渡す */
	indices: number[];
	debugCandidates: CandDebugEntry[];
}

/**
 * 構造ゲートを適用し、不合格なら debug candidate を積んで `null` を返す。
 *
 * **スコアの減点ではなく hard reject。** 通らない形は整合度がいくら高くても検出結果に出さない。
 *
 * **呼び出しは各経路の「既存の棄却検査をすべて通過した後」に置くこと。** 前に置くと、既に固有の
 * 理由コードを持つ候補の `reason` を横取りして `view=debug` の診断が変わる
 * （{@link validatePatternSize} の docstring と同じ理由。実装上は同関数の直後に並べてある）。
 */
export function applyReversalGate(input: ReversalGateInput): ReversalStructureResult | null {
	const { candles, pivots, side, first, mid, necklinePrice, type, indices, debugCandidates } = input;
	const gate = validateReversalStructure({ candles, pivots, first, mid, necklinePrice, side });
	if (gate.ok) return gate;
	debugCandidates.push({
		type,
		accepted: false,
		reason: gate.reason,
		indices,
		details: {
			side,
			firstIdx: first.idx,
			midIdx: mid.idx,
			necklinePrice,
			...(gate.retracementRatio !== undefined ? { retracementRatio: gate.retracementRatio } : {}),
			...(gate.priorExtreme
				? { priorExtremeIdx: gate.priorExtreme.idx, priorExtremePrice: gate.priorExtreme.extremePrice }
				: {}),
		},
	});
	return null;
}

/** {@link ReversalStructureResult} → `PatternEntry.structureGate` */
export function buildStructureGate(gate: ReversalStructureResult): PatternStructureGate | undefined {
	const out: PatternStructureGate = {};
	if (gate.retracementRatio !== undefined) out.retracementRatio = Number(gate.retracementRatio.toFixed(4));
	if (gate.priorExtreme) {
		out.priorExtremeIdx = gate.priorExtreme.idx;
		out.priorExtremePrice = gate.priorExtreme.extremePrice;
	}
	if (gate.necklineCrossIdx !== undefined) out.necklineCrossIdx = gate.necklineCrossIdx;
	return Object.keys(out).length > 0 ? out : undefined;
}
