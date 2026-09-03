/**
 * patterns/target-reach.ts — ブレイク後の target 到達判定（issue #210）
 *
 * `helpers.ts` から切り出したのは **`src/schema/patterns.ts` が閾値を読むため**。
 * `targetReachedPct` / `targetReached` の description は走査窓の本数・上限値・退化の閾値を
 * 名指しで説明するので、数値を description 側に書き写すと**振る舞いと宣言が黙ってずれる**。
 * `helpers.ts` ごと import すると dayjs / indicators までスキーマの依存に入るため、
 * 依存が `./types.js` の型だけで済むこの単位に分けてある。
 */

// **型のみ**の import（出力から消えるので実行時の循環は生じない）。理由コードの単一ソースは
// Zod 側に置いてある——詳細は `TargetReachOmissionReason` の docstring。
import type { TargetProgressOmittedReason } from '../../src/schema/patterns.js';
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
// 戻り値（issue #224 症状 2 以降、**`undefined` を返さない**）:
//   - `{ kind: 'measured', … }` — 進捗を測れた
//   - `{ kind: 'omitted', reason }` — 測れなかった。**理由コードを必ず持つ**
//
// 「測れなかった」を `undefined` で表すと、呼び出し側が `targetReachFields(undefined)` →
// `{}` と畳んだ時点で理由が消え、content から進捗行ごと消える（#224 症状 2）。
// 戻り値型から `undefined` を外してあるので、**理由を書かない畳み方は typecheck を通らない。**
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

/**
 * 進捗を測れなかった理由（issue #210 で 1 コード、#224 症状 2 で 5 コード追加）。
 *
 * **`targetReachedPct` が出ない経路はここに列挙されたコードのどれかを必ず名乗る。**
 *
 * **単一ソースは `src/schema/patterns.ts` の `TargetProgressOmittedReasonEnum`**（Zod）で、
 * この型はそこから導出している。TypeScript のユニオンを別に持つと、型上は正しい理由を
 * 返しても Zod 側の宣言漏れで `parse()` が黙って剥がす——#155 / #160 / #184 / #189 / #199 で
 * **5 回起きている事故**なので、片方だけ足せない形にしてある。実行時の依存は
 * `src/schema/patterns.ts` → 本ファイル（閾値 3 定数）の一方向のままで、
 * 逆向きは `import type` のみ（出力から消える）。
 *
 * コードを足すときは Zod enum に足し、`TARGET_PROGRESS_OMISSION_NOTE` に content 文言を書く。
 * 文言の書き忘れは `Record<TargetReachOmissionReason, string>` が typecheck で落とす。
 *
 * ## 再問い合わせで答えが変わりうるか（3 通り。**混ぜない**）
 *
 * 消費側が知りたいのは「時間を置けば値が出るのか」なので、そこを取り違えさせない。
 *
 * | 区分 | コード | 意味 |
 * |---|---|---|
 * | **(i) 暫定** | `not_broken_out` / `no_bars_after_breakout` | **足が増えれば測れるようになりうる。** 形成中のパターンが後の足でネックラインを抜ければ進捗が出る |
 * | **(ii) 確定** | `no_target` / `invalid_breakout_price` / `degenerate_target_distance` | **その構造では変わらない。** 分母はブレイク価格と target だけで決まり、欠損したブレイク足は後から直らない |
 * | **(iii) 実装ギャップ** | `not_computed_by_detector` | 再問い合わせでは変わらないが、**将来のリリースで消える**（配線されたら進捗が出る） |
 *
 * 初版は (i) と (ii) をまとめて「データ条件 = 問い合わせ直しても変わらない」と書いていたが、
 * **`not_broken_out` は変わりうる**（PR #225 のレビュー指摘）。最多の経路をここで
 * 取り違えさせると、「もう一度呼んでも無駄」と読ませてしまう。
 *
 * ## 標準コーパス 940 ケースでの発生件数（構造単位。#224 症状 2 の実測）
 *
 * | reason | 生の行数 | 構造単位 | 内訳（構造単位） |
 * |---|---:|---:|---|
 * | `not_broken_out` | 2,625 | **547** | `head_and_shoulders` 266 / `inverse_head_and_shoulders` 245 / `triple_top` 9 / `double_bottom` 8 / `triple_bottom` 8 / `triangle_ascending` 4 / `rising_wedge` 3 / `falling_wedge` 2 / `triangle_symmetrical` 2 |
 * | `degenerate_target_distance` | 278 | 60 | `inverse_head_and_shoulders` 59 / `double_bottom` 1（#210 から不変） |
 * | `not_computed_by_detector` | 72 | 13 | `triple_bottom` 11 / `triple_top` 2 |
 * | `no_target` | 0 | **0** | — |
 * | `invalid_breakout_price` | 0 | **0** | — |
 * | `no_bars_after_breakout` | 0 | **0** | — |
 *
 * **下 3 つは本コーパスで 1 件も出ない。** それでもコードを置くのは、
 * `undefined` を返せなくした結果 **`computeTargetReach` と呼び出し側ガードのすべての早期
 * return が名前を要求される**からで、名前が無いとその経路だけがまた無言に戻る。
 * 到達性の見立て:
 *
 * - `no_target` — H&S 4 経路の `target === undefined || height === undefined` と
 *   `computeTargetReach` の `!Number.isFinite(target)`。`necklineProjectionTarget` が
 *   `undefined` を返すのは添字またはネックライン値が非有限のときだけで、検出器経由では
 *   ピボット添字が常に有限（`detect_hs.ts` の `necklineProjectionHeight` と同じ理由で
 *   **検出器経由では到達不能に近い**）。
 * - `invalid_breakout_price` — doubles 4 経路 / wedges 2 経路の `Number.isFinite(bp)` false。
 *   ブレイク足の `close` が欠損した系列でのみ起きるので、正常な OHLC では出ない。
 * - `no_bars_after_breakout` — `breakoutIdx >= candles.length` または走査窓に有限な
 *   high/low が 1 本も無い。検出器はブレイク足を系列内から取るので前者は起きず、
 *   後者は欠損足の系列でのみ起きる。
 *
 * **`degenerate_target_distance` の 60 構造は #210 から動いていない**（今回の変更は
 * `undefined` 経路に名前を付けただけで、判定を 1 つも変えていない）。
 *
 * 各コードの意味は Zod 側の `.describe()` が単一ソース（`src/schema/patterns.ts`）。
 * `not_computed_by_detector` の現在の対象は `detect_triples.ts` の完成済み 4 経路
 * （strict / relaxed × top / bottom）だけで、**配線は #224 のフォローアップとして別 issue で扱う**。
 */
export type TargetReachOmissionReason = TargetProgressOmittedReason;

/** 進捗を測れないケース。**黙って落とさず呼び出し側が申告する。** */
export interface TargetReachOmitted {
	kind: 'omitted';
	reason: TargetReachOmissionReason;
}

export type TargetReachResult = TargetReachInfo | TargetReachOmitted;

/**
 * 呼び出し側のガード（ブレイク未確定 / target 未算出 等）で `computeTargetReach` を
 * そもそも呼ばないときに使う。**`undefined` の代わりにこれを返す**ことで、
 * 理由を書かない畳み方が型で潰れる。
 */
export function omittedTargetReach(reason: TargetReachOmissionReason): TargetReachOmitted {
	return { kind: 'omitted', reason };
}

export function computeTargetReach(
	candles: readonly CandleData[],
	breakoutIdx: number,
	breakoutPrice: number,
	target: number,
	direction: 'up' | 'down',
	patternHeight: number,
): TargetReachResult {
	// **入力不正も理由を名乗る**（#224 症状 2）。呼び出し側ガードの `invalid_breakout_price` /
	// `no_target` と同じコードに寄せてあるので、ガードの手前で落ちたか中で落ちたかで
	// 申告が変わらない。
	if (!Number.isFinite(breakoutPrice)) return omittedTargetReach('invalid_breakout_price');
	if (!Number.isFinite(target)) return omittedTargetReach('no_target');
	const targetDistance = Math.abs(target - breakoutPrice);
	const startIdx = Math.max(0, breakoutIdx);
	if (startIdx >= candles.length) return omittedTargetReach('no_bars_after_breakout');

	// 分母の退化ガード（#210 (2)）。**距離ゼロもここに含まれる**——
	// 以前は `targetDistance <= EPSILON` を「既に到達」として pct=100 で返していたが、
	// 「ブレイク時点で target と一致」は達成度が測れない状態そのものなので、
	// 比が小さいケースと分けて扱う理由が無い。`patternHeight` が正でない場合も
	// 比を判定できないので測らない（高さが出ない形は target 自体が出ない経路が大半）。
	if (!(patternHeight > 0) || targetDistance < patternHeight * MIN_TARGET_DISTANCE_HEIGHT_RATIO) {
		return omittedTargetReach('degenerate_target_distance');
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
	if (extremeIdx < 0 || !Number.isFinite(extremePrice)) return omittedTargetReach('no_bars_after_breakout');

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
 * 呼び出し側に同じ spread を書き写していたのを 1 箇所に寄せたもの。
 * **`omitted` を黙って `{}` に畳まない**——進捗が出ない理由を
 * `targetProgressOmittedReason` で申告する（#181 / #196 / #200 と同じ方針）。
 *
 * **引数から `undefined` を外してあるのは規約ではなく型で潰すため**（#224 症状 2）。
 * 以前は「ブレイクしていない」等のガードで `undefined` を渡せてしまい、
 * その 1 経路だけが理由を書かずに `{}` に畳んでいた（docstring は「畳まない」と宣言していた）。
 * ガードで呼ばない場合は `omittedTargetReach(reason)` を渡す。
 */
export function targetReachFields(reach: TargetReachResult): {
	targetReachedPct?: number;
	targetReached?: boolean;
	targetReachedDate?: string;
	targetReachedPrice?: number;
	targetProgressOmittedReason?: TargetReachOmissionReason;
} {
	if (reach.kind === 'omitted') return { targetProgressOmittedReason: reach.reason };
	return {
		targetReachedPct: reach.targetReachedPct,
		targetReached: reach.targetReached,
		...(reach.targetReachedDate ? { targetReachedDate: reach.targetReachedDate } : {}),
		targetReachedPrice: reach.targetReachedPrice,
	};
}

/**
 * 理由コード → content 1 行に出す日本語文言。
 *
 * **`Record<TargetReachOmissionReason, string>` にしてあるのは、コードを足したときに
 * 文言を書き忘れると typecheck が落ちるようにするため。** 文言を落とすと
 * `formatTargetProgressLine` が「理由はあるのに何も言わない」に戻る。
 * `degenerate_target_distance` の文言は #210 のまま——既存の content 契約を動かさない。
 */
const TARGET_PROGRESS_OMISSION_NOTE: Record<TargetReachOmissionReason, string> = {
	not_broken_out: '未ブレイクのため未算出',
	no_target: 'ターゲット価格またはパターン高さが算出できないため',
	invalid_breakout_price: 'ブレイク足の終値が取得できないため',
	no_bars_after_breakout: 'ブレイク足以降のローソク足が無いため',
	degenerate_target_distance: `ブレイク足が想定値幅の${Math.round((1 - MIN_TARGET_DISTANCE_HEIGHT_RATIO) * 100)}%以上を消化済みで、残り距離が短く進捗率が意味を持たないため`,
	// **他の 5 つと言い回しを分ける。** 他は「この構造では測れない」だが、これは
	// 「測っていない」——構造の性質ではなく検出器の未配線なので、算出していない側の言い方にする。
	not_computed_by_detector: 'この検出器がターゲット進捗を算出していないため。実装の未配線であり、構造の性質ではない',
};

/**
 * content テキストの「ターゲット進捗」行を組む（`tools/detect_patterns.ts` と
 * `src/handlers/detectPatternsViewsHandler.ts` の共通実装）。
 *
 * `content[0].text` が LLM への唯一のチャネルなので、**走査窓が有限であること**と
 * **上限に当たったこと / 出さなかったこと**をこの 1 行で言い切る。
 * 行そのものを返す（先頭の `\n` は呼び出し側が付ける）。
 *
 * **`targetProgressOmittedReason` があれば必ず 1 行返す**（#224 症状 2）。`null` を返すのは
 * 「進捗も理由も無い」＝ そもそも `computeTargetReach` の対象外だったときだけ。
 * 引数の型が `string` なのは `PatternEntry` を経由せず素の JSON を渡す消費者
 * （`detect_patterns.ts` の `SummaryPattern`）があるため。未知のコードが来ても
 * **黙らせない**——コードそのものを出す。
 */
export function formatTargetProgressLine(p: {
	targetReachedPct?: number;
	targetReached?: boolean;
	targetProgressOmittedReason?: string;
}): string | null {
	if (p.targetProgressOmittedReason) {
		const note =
			TARGET_PROGRESS_OMISSION_NOTE[p.targetProgressOmittedReason as TargetReachOmissionReason] ??
			p.targetProgressOmittedReason;
		return `   - ターゲット進捗: 出力なし（${note}）`;
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
