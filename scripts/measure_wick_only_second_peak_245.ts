/**
 * issue #245 Phase 1: **「ヒゲだけの山2（谷2）」が accepted に混ざるか**を実測する。
 * **検出器・`structural.ts`・`config.ts`・ベースラインは 1 行も変更しない**（計測とドキュメントだけ）。
 *
 * ## 問題設定（コードの事実）
 *
 * 反転系の検出器は**混合基準**で判定している（`swing.ts` の `Pivot` docstring が単一ソース）:
 *
 * | 何を | 使う価格 |
 * |---|---|
 * | 極値判定（この足がスイングか） | `high` / `low` |
 * | 同水準判定・ネックライン（構造比較） | **終値**（`Pivot.price`） |
 * | パターン高さ（値幅の評価） | `high` / `low`（`Pivot.extremePrice`） |
 *
 * この帰結として、**山2 の高値だけが山1 に届いていて終値はネックラインのすぐ上**という形が
 * 通る。`double_top` なら「終値で見ると山が無い（ネックラインに張り付いている）のに、
 * 高値だけが山1 と同水準」で、目視では 2 山目に見えない。
 *
 * ## 発端の形は #242 で既に落ちている
 *
 * issue 本文の実データ D（`double_top 329-334-338` = `limit=72` 窓の 41-46-50）は、
 * 山2 の後に再上昇して H ピボットを作ってから割っているので **#242 の経路ゲート
 * （`peak_after_last_pivot`）で `invalid`**（`tests/patterns/breakout-path-double.test.ts`）。
 * したがって本 Phase の問いは 1 つだけ:
 *
 * > **「ヒゲだけの山2（谷2）の直後に、再上昇せずそのまま割る形」が accepted に混ざるか。**
 * > **混ざるならそれは正当な failed retest か、呼べない形か。**
 *
 * この形は経路ゲートでは落ちない（山2 とブレイクの間にピボットが無い）。
 *
 * ## 量の定義（double。`pivots = [a, b, c]`、`c` が山2 / 谷2）
 *
 * - `heightAbs` = `levelSpreadMetrics([a, c], [a, b, c]).heightAbs`（高安基準。`structural.ts`）
 * - **`closeGap`** = top: `(c.price − b.price) / heightAbs` / bottom: `(b.price − c.price) / heightAbs`
 *   山2 の**終値**がネックライン（= `b.price`）からどれだけ離れているか。**0 に近いほど
 *   「終値では山が無い」。**
 * - **`wickShare`** = top: `(c.extremePrice − c.price) / heightAbs` / bottom: 符号反転
 *   山2 のヒゲがパターン高さの何割か。
 *
 * 分子は終値と高安の**差**で、分母は高安。混合基準そのものを 2 つのスカラーに写している。
 *
 * ### 自己検算
 *
 * 発端の形（実データ D の `limit=72` 窓 / `swingDepth: 6` / `double_top` 41-46-50）で
 * `closeGap` = 21,651 / 219,423 = **0.099**、`wickShare` = 160,755 / 219,423 = **0.733**。
 * {@link SELF_CHECK} がこれを毎回検算し、ずれたらその場で例外になる（§0）。
 *
 * ## ハーネス
 *
 * **検出器内のフックも `tools/patterns/` の展開も無い。** 見るのは
 * `detect_patterns` が返す `data.patterns` 相当の集合だけ（#243 の計測と同じ流儀。
 * accepted な出力に混ざるかを問うているので、内部の候補を数えても材料にならない）。
 * 縮小段は {@link runPipeline} が本体（`tools/detect_patterns.ts`）と同じ順序で再現する。
 *
 * ## コーパス
 *
 * `scripts/measure_forming_triple_level_spread_178.ts` の `buildCorpus` に倣う——
 * 標準 800（合成 704 + 実データ A 96）＋ 実データ B / C / D 各 96 ＋ ローリング窓 3,672 × 3
 * = **12,104 ケース**。**プールしない**（#219）。実体は絶対時刻で畳む（実データ B / C / D は
 * 同じ 1 時間足履歴の重なる窓なので、系列別に数えると同じ値動きを 3 回数える）。
 *
 * `includeForming` / `includeInvalid` は**全ケースで true**——`near_completion` は
 * `includeForming` が要り（#270）、§2 の「その後」の追跡は `invalid` / `expired` を見るため。
 * 178 が固定窓で回していたオプション 8 通りは本 Phase では回さない（本スクリプトは
 * ライフサイクル絞り込みの**手前**の集合を見ないので、8 通りは同じ候補を 8 回数えるだけ）。
 * ケース数の単位を 178 と揃えるため**ケースの並びは同じまま**にしてある。
 *
 * **注意**: `scripts/measure_forming_double_asymmetry_262.ts` / `_268.ts` は削除済み経路を
 * アンカーにしているので `--strip-ref` 無しでは動かない。ハーネスを流用していないのはそのため。
 *
 * ## 使い方
 *
 * ```bash
 * npx tsx scripts/measure_wick_only_second_peak_245.ts
 * npx tsx scripts/measure_wick_only_second_peak_245.ts --json /tmp/245.json
 * npx tsx scripts/measure_wick_only_second_peak_245.ts --no-rolling   # 短時間確認用
 * ```
 */

import { writeFileSync } from 'node:fs';
import { nowIso } from '../lib/datetime.js';
import { buildBtcJpy2026Candles } from '../tests/fixtures/btc_jpy_1day_2026.js';
import { buildBtcJpy1hour202608Candles } from '../tests/fixtures/btc_jpy_1hour_2026_08.js';
import { buildBtcJpy1hour202609Candles } from '../tests/fixtures/btc_jpy_1hour_2026_09.js';
import {
	BTC_JPY_1HOUR_2026_09_05_ISSUE_WINDOW,
	buildBtcJpy1hour20260905Candles,
} from '../tests/fixtures/btc_jpy_1hour_2026_09_05.js';
import * as synth from '../tests/fixtures/synthetic_pattern_candles.js';
import { getHsShoulderMaxPctForTf, getSizeThresholdsForTf, resolveParams } from '../tools/patterns/config.js';
import { detectDoubles } from '../tools/patterns/detect_doubles.js';
import { detectHeadAndShoulders, necklineAt } from '../tools/patterns/detect_hs.js';
import { detectPennantsFlags } from '../tools/patterns/detect_pennants.js';
import { detectTriangles } from '../tools/patterns/detect_triangles.js';
import { detectTriples } from '../tools/patterns/detect_triples.js';
import { detectWedges } from '../tools/patterns/detect_wedges.js';
import { globalDedup } from '../tools/patterns/helpers.js';
import { excludeTriplesSharingHsMainPoints } from '../tools/patterns/mutual-exclusion.js';
import { linearRegressionWithR2, near as nearFn, pct as pctFn } from '../tools/patterns/regression.js';
import {
	DOUBLE_LEVEL_MAX_PCT,
	HS_SHOULDER_MAX_PCT,
	isSameLevel,
	levelSpreadMetrics,
	MAX_LEVEL_SPREAD_RATIO,
	validateLevelDiff,
	validateMainPointsAgainstNecklineAt,
	validateMainPointsNecklineSide,
} from '../tools/patterns/structural.js';
import { type Candle, detectSwingPoints, filterPeaks, filterValleys, type Pivot } from '../tools/patterns/swing.js';
import type { CandDebugEntry, DeduplicablePattern, DetectContext } from '../tools/patterns/types.js';

// ── 検出器のローカル定数の写し（本物と一致することを毎ケース検算する） ──

/**
 * `detect_doubles.ts` の `BREAKOUT_BUFFER_PCT` / `MAX_BARS_FROM_EXTREMUM` の写し。
 *
 * 本物は module-local な `const` で export されていない。**本 Phase は検出器を触らない**
 * （issue #245「やらないこと」）ので export を足さず写しで済ませているが、写しがずれると
 * §2 の「その後」の判定が黙って変わるので {@link countBreakoutFormulaMismatch} が
 * **本物の出力を神託にして**毎ケース検算する（`completed` な double の
 * `breakoutBarIndex` と、写しで再導出した最初のブレイク足が一致するか）。
 */
const BREAKOUT_BUFFER_PCT = 0.015;
/** 同上。`findBreakoutIdx` が第2構成点から突破を探す本数。 */
const MAX_BARS_FROM_EXTREMUM = 20;

/**
 * §3 の目視判定で「割った後すぐ戻している」とみなす本数。
 *
 * **これは計測用の判定基準で、検出器のどこにも存在しない。** ブレイク足の翌足から
 * この本数のうちに終値がネックライン水準へ戻れば「すぐ戻している」とする。
 * ブレイク判定側には検出器と同じ ±1.5% バッファを掛ける（= 検出器が「割った」と認める事象）が、
 * 戻り側にはバッファを掛けない——バッファの中は検出器が「まだ割っていない」と見る帯なので、
 * そこへ戻ってきた時点で突破は維持されていない。
 */
const QUICK_RECOVERY_BARS = 3;

/**
 * §1-5 で「空白帯を根拠に閾値を置ける」と言うために最低限必要な**値動き**の数。
 *
 * **n がこれ未満のときは「最も広い空白帯」を非恣意性の根拠にしない。** 値動きが数個しかない
 * 列では隣接差が必ず大きく出るので、帯の広さは分布の谷ではなく標本の粗さを写しているだけ
 * （#214 の基準を満たさない）。判定はスクリプトに埋め、メモ側で言い換えないための定数。
 *
 * **数えるのは値動きで、延べや実体ではない。** 延べ / 実体は同じ値動きを時間足ラベル・窓・
 * `swingDepth` ごとに重複して数えるので、n を大きくしても独立な標本は増えない。
 */
const GAP_MIN_SAMPLES = 30;

// ── コーパス（#178 / #242 / #243 / #244 / #249 と同じ組み方） ──

type Group = 'synthetic' | 'realA' | 'realB' | 'realC' | 'realD';

interface Series {
	group: Group;
	name: string;
	candles: Candle[];
}

interface CaseSpec {
	series: Series;
	tf: string;
	swingDepth: number | undefined;
	/** ローリング窓の終端 idx（フル系列なら `candles.length - 1`）。 */
	windowEnd: number;
	/** ローリング窓か（集計を分けるため）。 */
	rolling: boolean;
}

const SYNTHETIC_BUILDERS: ReadonlyArray<readonly [string, () => Candle[]]> = [
	['completed_double_top', synth.buildCompletedDoubleTopCandles],
	['forming_double_bottom', synth.buildFormingDoubleBottomCandles],
	['descending_triangle_invalid', synth.buildDescendingTriangleInvalidBreakoutCandles],
	['rectangle_range', synth.buildRectangleRangeCandles],
	['rising_channel', synth.buildRisingChannelCandles],
	['bull_flag_failure', synth.buildBullFlagFailureCandles],
	['bull_pennant_success', synth.buildBullPennantSuccessCandles],
	['bull_pennant_failure', synth.buildBullPennantFailureCandles],
	['completed_triple_top', synth.buildCompletedTripleTopCandles],
	['forming_triple_bottom', synth.buildFormingTripleBottomCandles],
	['completed_hs', synth.buildCompletedHeadAndShouldersCandles],
	['forming_ihs', synth.buildFormingInverseHeadAndShouldersCandles],
	['forming_rising_wedge', synth.buildFormingRisingWedgeCandles],
	['completed_falling_wedge', synth.buildCompletedFallingWedgeCandles],
	['forming_ascending_triangle', synth.buildFormingAscendingTriangleCandles],
	['forming_symmetrical_triangle', synth.buildFormingSymmetricalTriangleCandles],
	['asymmetric_neckline_ihs', synth.buildAsymmetricNecklineIHSCandles],
	['asymmetric_neckline_hs', synth.buildAsymmetricNecklineHSCandles],
	['unequal_peaks_double_top', synth.buildUnequalPeaksDoubleTopCandles],
	['uptrend_fake_double_bottom', synth.buildUptrendThenFakeDoubleBottomCandles],
	['downtrend_fake_hs', synth.buildDowntrendThenFakeHSCandles],
	['unequal_valleys_double_bottom', synth.buildUnequalValleysDoubleBottomCandles],
];

/**
 * 178 の `OPTS8` に相当する枠。**本 Phase は 8 通りを回さず全部 true に固定する**
 * （理由はファイル冒頭の「コーパス」節）。ケース数の単位を 178 と揃えるため、
 * ケースの並び（時間足 × `swingDepth` × 8）そのものは残してある。
 */
const OPTS_SLOTS = 8;

/** 実データ系列 1 本ぶんのケース（時間足 3 種 × `swingDepth` 4 種 × 8 = 96）。 */
function realCases(series: Series): CaseSpec[] {
	const out: CaseSpec[] = [];
	const windowEnd = series.candles.length - 1;
	for (const tf of ['1day', '4hour', '1hour']) {
		for (const swingDepth of [undefined, 2, 3, 6]) {
			for (let s = 0; s < OPTS_SLOTS; s++) out.push({ series, tf, swingDepth, windowEnd, rolling: false });
		}
	}
	return out;
}

/** ローリング窓の最小の窓長（末尾 60 本から 1 本ずつ伸ばす）。 */
const ROLLING_MIN_BARS = 60;

/**
 * 実データ 1 系列のローリング窓ケース。窓は**先頭固定・終端を 1 本ずつ動かす**。
 *
 * 先頭固定にしてあるのでピボットの idx が窓をまたいで安定する——§2 の「その後どうなったか」の
 * 追跡が同じ構成点 idx で結べるのはこのため（178 §2 と同じ理由）。
 */
function rollingCases(series: Series): CaseSpec[] {
	const out: CaseSpec[] = [];
	for (let end = ROLLING_MIN_BARS - 1; end < series.candles.length; end++) {
		for (const tf of ['1day', '4hour', '1hour']) {
			for (const swingDepth of [undefined, 2, 3, 6])
				out.push({ series, tf, swingDepth, windowEnd: end, rolling: true });
		}
	}
	return out;
}

interface CorpusPart {
	label: string;
	cases: CaseSpec[];
}

/**
 * その `(系列, 時間足)` の組が**時間足別の結論に使える**か（#178 の注意）。
 *
 * 実データ B / C / D は実 1 時間足 365 本に `1day` / `4hour` / `1hour` の**ラベルを付け替えた**
 * ものなので、`1hour` 以外の行は独立系列ではない。標準コーパスの「実データ A 96」も
 * `btc_jpy_1day_2026` の同じ 90 本にラベルを付け替えたもので、こちらは `1day` だけが実データ。
 * 合成フィクスチャはどの時間足ラベルでも実データではない。
 */
const isTfAuthoritative = (group: Group, tf: string): boolean =>
	group === 'realB' || group === 'realC' || group === 'realD' ? tf === '1hour' : group === 'realA' && tf === '1day';

/** 標準コーパス 800 と実データ B / C / D、およびそれぞれのローリング窓。**プールしない**（#219）。 */
function buildCorpus(includeRolling: boolean): CorpusPart[] {
	const standard: CaseSpec[] = [];
	for (const [name, build] of SYNTHETIC_BUILDERS) {
		const series: Series = { group: 'synthetic', name, candles: build() };
		const windowEnd = series.candles.length - 1;
		for (const tf of ['1day', '1hour']) {
			for (const swingDepth of [2, 3]) {
				for (let s = 0; s < OPTS_SLOTS; s++) standard.push({ series, tf, swingDepth, windowEnd, rolling: false });
			}
		}
	}
	const realA: Series = { group: 'realA', name: 'btc_jpy_1day_2026', candles: buildBtcJpy2026Candles() as Candle[] };
	standard.push(...realCases(realA));

	const realB: Series = {
		group: 'realB',
		name: 'btc_jpy_1hour_2026_08',
		candles: buildBtcJpy1hour202608Candles() as Candle[],
	};
	const realC: Series = {
		group: 'realC',
		name: 'btc_jpy_1hour_2026_09',
		candles: buildBtcJpy1hour202609Candles() as Candle[],
	};
	// **実データ D は必須**（PR #260 の CodeRabbit 指摘。動的 import + catch にすると
	// コーパスが黙って縮んだまま正常終了する）。
	const realD: Series = {
		group: 'realD',
		name: 'btc_jpy_1hour_2026_09_05',
		candles: buildBtcJpy1hour20260905Candles() as Candle[],
	};

	const out: CorpusPart[] = [
		{ label: `標準コーパス ${standard.length}（合成 704 + 実データ A 96）`, cases: standard },
		{ label: '実データ B 96（`btc_jpy_1hour_2026_08`）', cases: realCases(realB) },
		{ label: '実データ C 96（`btc_jpy_1hour_2026_09`）', cases: realCases(realC) },
		{ label: '実データ D 96（`btc_jpy_1hour_2026_09_05`）', cases: realCases(realD) },
	];
	if (includeRolling) {
		for (const s of [realB, realC, realD]) {
			const cases = rollingCases(s);
			out.push({
				label:
					`ローリング窓 ${cases.length}（\`${s.name}\` の末尾 ${ROLLING_MIN_BARS}〜${s.candles.length} 本 ` +
					'× 時間足 3 × swingDepth 4）',
				cases,
			});
		}
	}
	return out;
}

// ── パイプライン（`detect_patterns.ts` の縮小段の再現） ──

/** `detect_patterns.ts` と同じ順序で `DetectContext` を組む。 */
function buildCtx(spec: CaseSpec, debugCandidates: CandDebugEntry[]): DetectContext {
	const candles = spec.series.candles.slice(0, spec.windowEnd + 1);
	const resolved = resolveParams(spec.tf, spec.swingDepth === undefined ? {} : { swingDepth: spec.swingDepth });
	const pivots = detectSwingPoints(candles, { swingDepth: resolved.swingDepth, strictPivots: true });
	return {
		candles,
		pivots,
		allPeaks: filterPeaks(pivots),
		allValleys: filterValleys(pivots),
		tolerancePct: resolved.tolerancePct,
		headProminencePct: resolved.headProminencePct,
		sizeThresholds: getSizeThresholdsForTf(spec.tf),
		hsShoulderMaxPct: getHsShoulderMaxPctForTf(spec.tf),
		minDist: resolved.minBarsBetweenSwings,
		want: new Set(),
		includeForming: true,
		debugCandidates,
		type: spec.tf,
		swingDepth: resolved.swingDepth,
		near: (a: number, b: number) => nearFn(a, b, resolved.tolerancePct),
		pct: pctFn,
		lrWithR2: linearRegressionWithR2,
		tz: 'Asia/Tokyo',
	};
}

/**
 * `detect_patterns.ts` の縮小段を再現して `data.patterns` 相当を返す（#243 の `runPipeline` と同型）。
 *
 * 段の順序は本体と同じ: 検出 → `globalDedup` → ライフサイクル絞り込み →
 * `excludeTriplesSharingHsMainPoints`。**ライフサイクル絞り込みは
 * `includeForming` / `includeCompleted` / `includeInvalid` を全部 true にしているので恒等**
 * （それでも段として書いてあるのは、本体の並びから 1 段だけ抜けている状態を作らないため）。
 * `requireCurrentInPattern` は既定 off なので再現しない。`rankPatterns` は並べ替えるだけで
 * 集合を変えないため省く。
 */
function runPipeline(spec: CaseSpec): DeduplicablePattern[] {
	const debugCandidates: CandDebugEntry[] = [];
	const ctx = buildCtx(spec, debugCandidates);
	let patterns: DeduplicablePattern[] = [];
	patterns.push(...detectDoubles(ctx).patterns);
	patterns.push(...detectHeadAndShoulders(ctx).patterns);
	patterns.push(...detectTriangles(ctx).patterns);
	patterns.push(...detectWedges(ctx).patterns);
	patterns.push(...detectPennantsFlags(ctx).patterns);
	patterns.push(...detectTriples(ctx).patterns);
	patterns = globalDedup(patterns);
	return excludeTriplesSharingHsMainPoints(patterns).kept;
}

// ── パターンの解剖（型ごとの主構成点 / 末尾の主構成点 / ネックライン） ──

type Family = 'double' | 'triple' | 'hs';
type Side = 'top' | 'bottom';

const FAMILY_OF: Readonly<Record<string, { family: Family; side: Side }>> = {
	double_top: { family: 'double', side: 'top' },
	double_bottom: { family: 'double', side: 'bottom' },
	triple_top: { family: 'triple', side: 'top' },
	triple_bottom: { family: 'triple', side: 'bottom' },
	head_and_shoulders: { family: 'hs', side: 'top' },
	inverse_head_and_shoulders: { family: 'hs', side: 'bottom' },
};

/** accepted な status（`detect_patterns.ts` のライフサイクル分類の completed / forming バケット）。 */
const ACCEPTED_STATUSES = new Set(['completed', 'near_completion', 'forming']);

const statusOf = (p: DeduplicablePattern): string => String(p.status ?? 'completed');

interface Anatomy {
	family: Family;
	side: Side;
	/** 同水準であるべき点（double: 2 山 / triple: 3 山 / H&S: 両肩）。`kind` で取る。 */
	main: Pivot[];
	/** パターン全体の構成点（`heightAbs` の母集団）。 */
	all: Pivot[];
	/** 末尾の主構成点（double の山2 / triple の山3 / H&S の右肩 `p4`）。 */
	last: Pivot;
	/** 末尾の主構成点の位置でのネックライン水準。 */
	necklinePrice: number;
	/** ネックライン全体（H&S の線版ゲートを当てるため）。 */
	neckline: Array<{ x: number; y: number }>;
}

/**
 * `PatternEntry` から {@link Anatomy} を取り出す。読めない形は `null`（件数だけ数える）。
 *
 * **主構成点は位置ではなく `kind` で取る**（`detect_triples.ts` の `pivots` コメントの規約。
 * ネックライン定義点が主構成点の間に挟まっているため）。
 *
 * **`status: 'forming'` は呼び出し側が先に外す。** 形成中 triple / H&S の `pivots` には
 * 末尾の主構成点（山3 / 右肩）が**そもそも入っていない**（暫定値は最新足の終値で、
 * `extremePrice` も同じ値になるので `wickShare` が定義上 0 になる）。
 */
function anatomyOf(p: DeduplicablePattern): Anatomy | null {
	const meta = FAMILY_OF[String(p.type)];
	if (!meta) return null;
	const pivots = p.pivots;
	if (!Array.isArray(pivots) || pivots.length === 0) return null;
	const neckline = (p.neckline as Array<{ x: number; y: number }> | undefined) ?? [];
	if (neckline.length < 2) return null;

	const wantKind = meta.side === 'top' ? 'H' : 'L';
	const mainByKind = pivots.filter((v) => v.kind === wantKind);
	// H&S の主構成点は「両肩」なので、`kind` が一致する 3 点（左肩 / 頭 / 右肩）から頭を外す。
	// 頭は 3 点の中で最も外側（top なら extremePrice 最大）。5 点並びの p0 / p2 / p4 に一致する。
	const main = meta.family === 'hs' ? mainByKind.filter((v) => v.idx !== headIdxOf(mainByKind, meta.side)) : mainByKind;
	if (main.length < 2) return null;
	const expected = meta.family === 'double' ? 2 : meta.family === 'triple' ? 3 : 2;
	if (main.length !== expected) return null;
	const last = main[main.length - 1];
	const nl = necklineAt(neckline, last.idx);
	if (!Number.isFinite(nl)) return null;
	return { family: meta.family, side: meta.side, main, all: [...pivots], last, necklinePrice: nl, neckline };
}

/** H&S の頭の idx（`kind` が肩と同じ 3 点のうち最も外側）。 */
function headIdxOf(sameKind: readonly Pivot[], side: Side): number {
	let best = sameKind[0];
	for (const v of sameKind) {
		if (side === 'top' ? v.extremePrice > best.extremePrice : v.extremePrice < best.extremePrice) best = v;
	}
	return best.idx;
}

// ── 2 量 ──

interface Quantities {
	heightAbs: number;
	closeGap: number;
	wickShare: number;
}

/**
 * `closeGap` / `wickShare` を出す。`heightAbs` が `null` / 0 のときは `null`
 * （`exceedsLevelSpread` と同じ扱い——判定材料が無いものを 0 として数えない）。
 */
function quantitiesOf(a: Anatomy): Quantities | null {
	const { heightAbs } = levelSpreadMetrics(a.main, a.all);
	if (heightAbs === null || !(heightAbs > 0)) return null;
	const c = a.last;
	const closeGap = a.side === 'top' ? (c.price - a.necklinePrice) / heightAbs : (a.necklinePrice - c.price) / heightAbs;
	const wickShare = a.side === 'top' ? (c.extremePrice - c.price) / heightAbs : (c.price - c.extremePrice) / heightAbs;
	return { heightAbs, closeGap, wickShare };
}

// ── 記録 ──

/** accepted な 1 件ぶん（延べ 1 件）。 */
interface Rec {
	corpus: string;
	tfAuthoritative: boolean;
	series: string;
	group: Group;
	tf: string;
	sd: string;
	windowEnd: number;
	rolling: boolean;
	type: string;
	family: Family;
	side: Side;
	status: string;
	closeGap: number;
	wickShare: number;
	heightAbs: number;
	/** 主構成点 + 末尾の主構成点の実値（目視判定の材料）。 */
	pts: Array<{ role: string; idx: number; iso: string; price: number; extremePrice: number }>;
	necklinePrice: number;
	/** ブレイク足（`completed` なら検出器が申告した idx。未ブレイクなら −1）。 */
	breakoutIdx: number;
	/** 既存ゲートを静的に当てた結果（§5）。 */
	levelDiffReason: string | null;
	necklineSideReason: string | null;
	spreadRatio: number | null;
	/** 実体キー（時間足 + type + 主構成点の絶対時刻で畳む）。 */
	entity: string;
	/**
	 * 値動きキー（**時間足ラベルを落として** type + 主構成点の絶対時刻で畳む）。
	 *
	 * 実データ B / C / D と実データ A は同じローソク足に `1day` / `4hour` / `1hour` の
	 * ラベルを付け替えて回しているので、**同じ値動きが実体として 2〜3 回数えられる**
	 * （閾値が時間足別なので出力そのものは別物だが、目視で見る形は 1 つ）。
	 * #262 §8-1 の「13 実体は 10 の値動きに畳める」と同じ畳み方。
	 */
	motion: string;
	/** 構造キー（同じ系列 / 時間足 / `swingDepth` / 構成点 idx。§2 の追跡に使う）。 */
	struct: string;
}

const yen = (v: number): string => Math.round(v).toLocaleString('ja-JP');
const f3 = (v: number): string => v.toFixed(3);
/** Markdown のセル内で `|` が列区切りに化けるのを防ぐ（GFM。インラインコードの中でも解釈される）。 */
const mdCell = (v: string): string => v.replaceAll('|', '\\|');

/** ソート済み配列の分位点（空なら null）。178 / 268 と同じ式。 */
function quantile(sorted: readonly number[], p: number): number | null {
	if (sorted.length === 0) return null;
	return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? null;
}

/** min / p10 / p50 / p90 / max の 1 行（空なら「—」）。 */
function distCells(values: readonly number[]): string {
	if (values.length === 0) return '— | — | — | — | —';
	const s = [...values].sort((a, b) => a - b);
	return [
		f3(s[0]),
		f3(quantile(s, 0.1) as number),
		f3(quantile(s, 0.5) as number),
		f3(quantile(s, 0.9) as number),
		f3(s[s.length - 1]),
	].join(' | ');
}

const inc = <K>(m: Map<K, number>, k: K, by = 1): void => {
	m.set(k, (m.get(k) ?? 0) + by);
};

// ── §2 の「その後」の追跡 ──

/**
 * ローリング窓での status の履歴。キーは {@link Rec.struct}、値は `windowEnd` 昇順の
 * `(windowEnd, status)`。
 */
type Timeline = Map<string, Array<{ windowEnd: number; status: string }>>;

/**
 * ある構造の「その後」。**同じ構成点が後続の窓でどの status になったか**を見る。
 *
 * 追跡できるのはローリング窓を持つ系列（実データ B / C / D）だけ。持たない母集団
 * （標準コーパス / 固定窓）では `'追跡なし'` を返す。
 */
function traceAfter(tl: Timeline, struct: string, fromWindowEnd: number): string {
	const hist = tl.get(struct);
	if (!hist) return '追跡なし（ローリング窓に無い）';
	const later = hist.filter((h) => h.windowEnd > fromWindowEnd);
	if (later.length === 0) return '窓の終端まで（後続の窓が無い）';
	const seen = new Map<string, number>();
	for (const h of later) inc(seen, h.status);
	const last = later[later.length - 1];
	return `${[...seen.entries()]
		.sort()
		.map(([s, n]) => `${s}×${n}`)
		.join(' / ')}（最終 \`${last.status}\` @end=${last.windowEnd}）`;
}

// ── §3 の目視判定 ──

type Verdict = '正当な failed retest' | '呼べない' | '保留';

interface Judgement {
	verdict: Verdict;
	basis: string;
	/** 山2 の高値が山1 の水準に届いているか（`isSameLevel` 高安基準）。 */
	extremeSameLevel: boolean;
	extremeRelDiff: number;
	/** 山2 の翌足以降で終値がネックラインを割った足（無ければ −1）。 */
	brokeIdx: number;
	/** ブレイク後 {@link QUICK_RECOVERY_BARS} 本以内に終値がネックライン水準へ戻ったか。 */
	quickRecovery: boolean;
	/**
	 * 山2 とブレイク足の間の**終値の最高値**（bottom は最安値）。区間が空なら `null`。
	 * これが山2 の終値を越えていれば「割る前に戻している」＝ #242 が見た「直接ではない」形。
	 */
	reboundClose: number | null;
	/** 同、「割る前に山2 の終値を越えて戻した」か。 */
	reboundBeforeBreak: boolean;
	/** 判定に使った走査終端（窓の終端 or 先読み終端）。 */
	scanEnd: number;
}

/**
 * 3 値判定（`正当な failed retest` / `呼べない` / `保留`）。
 *
 * **基準は #262 §8-2 と同じ流儀**——使う量は「構成点の終値・極値」と「区間の終値」だけで、
 * 検出器も閾値も通さない（`isSameLevel` と `DOUBLE_LEVEL_MAX_PCT` は検出器が
 * 終値に対して使っているのと**同じ関数・同じ定数を高安に当てている**だけ）。
 * 順に当てて、最初に当たったものを採る:
 *
 * 1. **山2 の高値が山1 の水準に届いていない**（`isSameLevel(a.extremePrice, c.extremePrice,
 *    DOUBLE_LEVEL_MAX_PCT)` が偽。ヒゲ込みでも同水準でない） → **呼べない**
 * 2. **割った後すぐ戻している**（ブレイク足の翌足から {@link QUICK_RECOVERY_BARS} 本以内に
 *    終値がネックライン水準へ復帰） → **呼べない**
 * 3. 上記に当たらず、**山2 の翌足以降で終値がネックラインを「直接」割っている** →
 *    **正当な failed retest**
 * 4. それ以外 → **保留**（4a: 割る前に山2 の終値を越えて戻している / 4b: 走査終端まで割っていない）
 *
 * ## 「直接割った」を何で測るか
 *
 * issue #245 の判定基準は「その足の翌足以降で終値がネックラインを割っている
 * （**#242 のゲートで見た「直接割った」形**）」と書かれている。#242 のゲート本体
 * （`detectPivotBeforeBreakout`）は**ピボット列**を入力に取るので `swingDepth` に依存し
 * （#251 案 3。仕様として固定されている）、目視判定の基準にそのまま使うと
 * 「同じ値動きが深さによって別の判定になる」ことになる。
 *
 * そこで本判定は**深さに依らない素の量**で「直接」を測る——**山2 の翌足からブレイク足の
 * 直前までの終値の最高値（bottom は最安値）が、山2 の終値を越えていないこと。**
 * 越えていれば「山2 を作った後にいったん山2 より高く引けてから割った」＝ #242 が
 * `peak_after_last_pivot` で落としたのと同じ値動きなので、**failed retest とは呼べず保留**にする。
 * 使う量は構成点の終値と区間の終値だけで、ピボット列も閾値も通さない。
 *
 * @param scanEnd 走査終端。窓の終端を渡すと**検出器が見た情報だけ**の判定になる。
 */
function judge(rec: Rec, candles: readonly Candle[], scanEnd: number): Judgement {
	const first = rec.pts[0];
	const last = rec.pts[rec.pts.length - 1];
	const extremeRelDiff =
		Math.abs(first.extremePrice - last.extremePrice) / Math.max(1, Math.max(first.extremePrice, last.extremePrice));
	const extremeSameLevel = isSameLevel(first.extremePrice, last.extremePrice, DOUBLE_LEVEL_MAX_PCT);

	const buf = rec.side === 'top' ? 1 - BREAKOUT_BUFFER_PCT : 1 + BREAKOUT_BUFFER_PCT;
	const trigger = rec.necklinePrice * buf;
	let brokeIdx = -1;
	const end = Math.min(scanEnd, last.idx + MAX_BARS_FROM_EXTREMUM);
	for (let k = last.idx + 1; k <= end; k++) {
		const close = Number(candles[k]?.close ?? NaN);
		if (!Number.isFinite(close)) continue;
		if (rec.side === 'top' ? close < trigger : close > trigger) {
			brokeIdx = k;
			break;
		}
	}
	let quickRecovery = false;
	if (brokeIdx >= 0) {
		const recEnd = Math.min(scanEnd, brokeIdx + QUICK_RECOVERY_BARS);
		for (let k = brokeIdx + 1; k <= recEnd; k++) {
			const close = Number(candles[k]?.close ?? NaN);
			if (!Number.isFinite(close)) continue;
			if (rec.side === 'top' ? close > rec.necklinePrice : close < rec.necklinePrice) {
				quickRecovery = true;
				break;
			}
		}
	}

	// 山2 とブレイク足の間の戻し（「直接割った」かの判定。docstring 参照）。
	let reboundClose: number | null = null;
	const reboundEnd = brokeIdx >= 0 ? brokeIdx - 1 : end;
	for (let k = last.idx + 1; k <= reboundEnd; k++) {
		const close = Number(candles[k]?.close ?? NaN);
		if (!Number.isFinite(close)) continue;
		if (reboundClose === null) reboundClose = close;
		else if (rec.side === 'top' ? close > reboundClose : close < reboundClose) reboundClose = close;
	}
	const reboundBeforeBreak =
		reboundClose !== null && (rec.side === 'top' ? reboundClose > last.price : reboundClose < last.price);

	const common = {
		extremeSameLevel,
		extremeRelDiff,
		brokeIdx,
		quickRecovery,
		reboundClose,
		reboundBeforeBreak,
		scanEnd,
	};
	if (!extremeSameLevel) {
		return {
			...common,
			verdict: '呼べない',
			basis: `基準 1（高安の相対差 ${(extremeRelDiff * 100).toFixed(3)}% > ${(DOUBLE_LEVEL_MAX_PCT * 100).toFixed(0)}%）`,
		};
	}
	if (quickRecovery) {
		return {
			...common,
			verdict: '呼べない',
			basis: `基準 2（idx ${brokeIdx} で割った後 ${QUICK_RECOVERY_BARS} 本以内に復帰）`,
		};
	}
	if (brokeIdx >= 0 && !reboundBeforeBreak) {
		return { ...common, verdict: '正当な failed retest', basis: `基準 3（idx ${brokeIdx} で直接割り、復帰なし）` };
	}
	if (brokeIdx >= 0) {
		return {
			...common,
			verdict: '保留',
			basis:
				`基準 4a（idx ${brokeIdx} で割ってはいるが、その前に終値 ${yen(reboundClose as number)} まで戻して` +
				`山2 の終値 ${yen(last.price)} を越えている = #242 が落とした値動きと同型）`,
		};
	}
	return { ...common, verdict: '保留', basis: '基準 4b（高安は同水準だが、走査終端までネックラインを割っていない）' };
}

// ── §0 の自己検算 ──

/**
 * issue #245 本文の発端の形。**実データ D の `limit=72` 窓 / `swingDepth: 6` / `1hour`** で
 * `double_top` 41-46-50 が `completed` として出る（`tests/patterns/breakout-path-double.test.ts`
 * の「swingDepth: 6 では同じ構成点の double_top が完成済みで accepted のまま残る」）。
 *
 * `closeGap` = 21,651 / 219,423 / `wickShare` = 160,755 / 219,423。
 */
const SELF_CHECK = {
	pivotIdxs: [41, 46, 50] as const,
	heightAbs: 219_423,
	closeGap: 21_651 / 219_423,
	wickShare: 160_755 / 219_423,
} as const;

interface SelfCheckOut {
	status: string;
	heightAbs: number;
	closeGap: number;
	wickShare: number;
	pts: Rec['pts'];
}

/** {@link SELF_CHECK} を再現する。食い違えばその場で例外（数字を 1 つも出す前に落とす）。 */
function runSelfCheck(): SelfCheckOut {
	const { start, end } = BTC_JPY_1HOUR_2026_09_05_ISSUE_WINDOW;
	const series: Series = {
		group: 'realD',
		name: `btc_jpy_1hour_2026_09_05[${start}:${end}]`,
		candles: buildBtcJpy1hour20260905Candles().slice(start, end) as Candle[],
	};
	const spec: CaseSpec = { series, tf: '1hour', swingDepth: 6, windowEnd: series.candles.length - 1, rolling: false };
	const hit = runPipeline(spec).find(
		(p) => p.type === 'double_top' && (p.pivots ?? []).map((v) => v.idx).join('-') === SELF_CHECK.pivotIdxs.join('-'),
	);
	if (!hit) throw new Error('自己検算: 発端の形（double_top 41-46-50）が出ない。窓 / swingDepth を確認すること。');
	const a = anatomyOf(hit);
	if (!a) throw new Error('自己検算: 発端の形の解剖に失敗した。');
	const q = quantitiesOf(a);
	if (!q) throw new Error('自己検算: 発端の形の heightAbs が測れない。');
	const close = (v: number, want: number, eps: number, name: string): void => {
		if (Math.abs(v - want) > eps) throw new Error(`自己検算: ${name} が ${v} で、期待値 ${want} と食い違う。`);
	};
	close(q.heightAbs, SELF_CHECK.heightAbs, 0.5, 'heightAbs');
	close(q.closeGap, SELF_CHECK.closeGap, 1e-6, 'closeGap');
	close(q.wickShare, SELF_CHECK.wickShare, 1e-6, 'wickShare');
	return {
		status: statusOf(hit),
		heightAbs: q.heightAbs,
		closeGap: q.closeGap,
		wickShare: q.wickShare,
		pts: ptsOf(a, series.candles),
	};
}

/** 主構成点の絶対時刻を並べた文字列（実体キー / 値動きキーの共通部分）。 */
const mainIso = (pts: Rec['pts']): string =>
	pts
		.filter((x) => x.role !== 'ネックライン定義点')
		.map((x) => x.iso)
		.join('-');

function ptsOf(a: Anatomy, candles: readonly Candle[]): Rec['pts'] {
	const roleOf = (i: number, n: number): string => {
		if (a.family === 'hs') return i === 0 ? '左肩' : '右肩';
		const kind = a.side === 'top' ? '山' : '谷';
		return `${kind}${i + 1}${i === n - 1 ? '（末尾）' : ''}`;
	};
	const out: Rec['pts'] = a.main.map((v, i) => ({
		role: roleOf(i, a.main.length),
		idx: v.idx,
		iso: String(candles[v.idx]?.isoTime ?? `#${v.idx}`),
		price: v.price,
		extremePrice: v.extremePrice,
	}));
	// ネックライン定義点（double の谷 / triple の 2 点 / H&S の 2 谷）も出す——
	// `closeGap` の分母と分子を出力から検算できるようにするため。
	for (const v of a.all) {
		if (a.main.some((m) => m.idx === v.idx)) continue;
		out.push({
			role: 'ネックライン定義点',
			idx: v.idx,
			iso: String(candles[v.idx]?.isoTime ?? `#${v.idx}`),
			price: v.price,
			extremePrice: v.extremePrice,
		});
	}
	return out.sort((x, y) => x.idx - y.idx);
}

/**
 * 写した `BREAKOUT_BUFFER_PCT` / `MAX_BARS_FROM_EXTREMUM` が本物とずれていないかを、
 * **本物の出力を神託にして**検算する。
 *
 * `completed` な double は `breakoutBarIndex` を申告している。同じ構成点・同じネックラインに
 * 写しの式を当てて最初のブレイク足を再導出し、一致しなければ写しがずれている。
 *
 * @returns 食い違った件数（0 が正常）
 */
function countBreakoutFormulaMismatch(p: DeduplicablePattern, a: Anatomy, candles: readonly Candle[]): number {
	if (a.family !== 'double') return 0;
	const declared = p.breakoutBarIndex;
	if (typeof declared !== 'number') return 0;
	const buf = a.side === 'top' ? 1 - BREAKOUT_BUFFER_PCT : 1 + BREAKOUT_BUFFER_PCT;
	const trigger = a.necklinePrice * buf;
	const end = Math.min(a.last.idx + MAX_BARS_FROM_EXTREMUM + 1, candles.length);
	for (let k = a.last.idx + 1; k < end; k++) {
		const close = Number(candles[k]?.close ?? NaN);
		if (!Number.isFinite(close)) continue;
		if (a.side === 'top' ? close < trigger : close > trigger) return k === declared ? 0 : 1;
	}
	return 1;
}

// ── 仮の閾値 ──

/**
 * §2 の仮置きの閾値。**分布を見て空白帯があればそこに合わせる**という指定なので、
 * ここは仮置きのままにしてある（結論は §2 の空白帯の実測で述べる）。
 */
const HIT_CLOSE_GAP_MAX = 0.2;
const HIT_WICK_SHARE_MIN = 0.5;

const isHit = (r: Rec): boolean => r.closeGap <= HIT_CLOSE_GAP_MAX && r.wickShare >= HIT_WICK_SHARE_MIN;

/**
 * ソート済みの値列で**最も広い空白帯**（隣接する値の差が最大の区間）を返す。
 *
 * #214 の基準（閾値の非恣意性は空白帯で主張する）に当てるための素の計算で、
 * 空白帯が無ければ（値が 2 つ未満 / 差が 0）`null`。
 */
function widestGap(values: readonly number[]): { lo: number; hi: number; width: number } | null {
	const s = [...values].sort((a, b) => a - b);
	if (s.length < 2) return null;
	let best: { lo: number; hi: number; width: number } | null = null;
	for (let i = 1; i < s.length; i++) {
		const width = s[i] - s[i - 1];
		if (width > 0 && (best === null || width > best.width)) best = { lo: s[i - 1], hi: s[i], width };
	}
	return best;
}

// ── main ──

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const jsonAt = argv.indexOf('--json');
	const jsonPath = jsonAt >= 0 ? (argv[jsonAt + 1] ?? null) : null;
	// **引数の検査は計測の前に置く。** `--json` にパスが続いていないと、以前は 12,104 ケースを
	// 回しきってから何も書かずに正常終了していた（22 分待って出力が無い）。次の要素が別のフラグの
	// ときも弾く——`--json --no-rolling` は `--no-rolling` という名前のファイルを作ってしまう。
	if (jsonAt >= 0 && (jsonPath === null || jsonPath.startsWith('--'))) {
		throw new Error(`--json には出力先パスが要る（受け取った値: ${jsonPath ?? 'なし'}）。`);
	}
	const includeRolling = !argv.includes('--no-rolling');

	// **数字を 1 つも出す前に**自己検算する。
	const selfCheck = runSelfCheck();

	const out: string[] = [];
	const say = (s = ''): void => {
		out.push(s);
	};

	const corpus = buildCorpus(includeRolling);
	/** 全 accepted（family 問わず）。 */
	const recs: Rec[] = [];
	/** 実体キー → 代表 1 件（最初に見たもの）。 */
	const entities = new Map<string, Rec>();
	/** ローリング窓の status 履歴（§2 の追跡）。 */
	const timeline: Timeline = new Map();
	/** 系列名 → ローソク足（§3 の判定で窓の外を先読みするため）。 */
	const seriesByName = new Map<string, Series>();

	let caseCount = 0;
	let breakoutMismatch = 0;
	let unreadable = 0;
	let heightUnmeasurable = 0;
	let formingSkipped = 0;
	const byType = new Map<string, number>();

	for (const part of corpus) {
		for (const spec of part.cases) {
			caseCount++;
			seriesByName.set(spec.series.name, spec.series);
			const candles = spec.series.candles.slice(0, spec.windowEnd + 1);
			const patterns = runPipeline(spec);
			const sd = String(spec.swingDepth ?? 'auto');

			for (const p of patterns) {
				const meta = FAMILY_OF[String(p.type)];
				if (!meta) continue;
				const status = statusOf(p);
				const idxs = (p.pivots ?? []).map((v) => v.idx).join('-');
				const struct = `${spec.series.name}|${spec.tf}|${sd}|${p.type}|${idxs}`;
				// **status の履歴はローリング窓の全 status を積む**（accepted に限らない）——
				// §2 の「その後」は `invalid` / `expired` に落ちたかを見るため。
				if (spec.rolling) {
					const hist = timeline.get(struct) ?? [];
					hist.push({ windowEnd: spec.windowEnd, status });
					timeline.set(struct, hist);
				}
				if (!ACCEPTED_STATUSES.has(status)) continue;
				inc(byType, `${p.type}|${status}`);
				// 形成中は末尾の主構成点が `pivots` に無い（`anatomyOf` の docstring）。
				if (status === 'forming') {
					formingSkipped++;
					continue;
				}
				const a = anatomyOf(p);
				if (!a) {
					unreadable++;
					continue;
				}
				breakoutMismatch += countBreakoutFormulaMismatch(p, a, candles);
				const q = quantitiesOf(a);
				if (!q) {
					heightUnmeasurable++;
					continue;
				}
				const pts = ptsOf(a, candles);
				const metrics = levelSpreadMetrics(a.main, a.all);
				const rec: Rec = {
					corpus: part.label,
					tfAuthoritative: isTfAuthoritative(spec.series.group, spec.tf),
					series: spec.series.name,
					group: spec.series.group,
					tf: spec.tf,
					sd,
					windowEnd: spec.windowEnd,
					rolling: spec.rolling,
					type: String(p.type),
					family: a.family,
					side: a.side,
					status,
					closeGap: q.closeGap,
					wickShare: q.wickShare,
					heightAbs: q.heightAbs,
					pts,
					necklinePrice: a.necklinePrice,
					breakoutIdx: typeof p.breakoutBarIndex === 'number' ? p.breakoutBarIndex : -1,
					// **既存ゲートを静的に当てる**（§5）。double は `validateLevelDiff` /
					// スカラー版のネックライン側検査、triple / H&S は当該経路が使う版に合わせる。
					levelDiffReason: a.family === 'hs' ? null : validateLevelDiff(a.side, metrics),
					necklineSideReason:
						a.family === 'hs'
							? validateMainPointsAgainstNecklineAt(a.side, a.main, (i) => necklineAt(a.neckline, i)).reason
							: validateMainPointsNecklineSide(a.side, a.main, a.necklinePrice).reason,
					spreadRatio: metrics.spreadRatio,
					entity: `${spec.tf}|${p.type}|${mainIso(pts)}`,
					motion: `${p.type}|${mainIso(pts)}`,
					struct,
				};
				recs.push(rec);
				if (!entities.has(rec.entity)) entities.set(rec.entity, rec);
			}
		}
	}

	// ── §0 検算 ──
	say('# issue #245 Phase 1: ヒゲだけの山2（谷2）が accepted に混ざるか');
	say();
	say(`生成: ${nowIso()}`);
	say();
	say('## 0. 検算');
	say();
	say(`- **ケース数**: ${caseCount}${includeRolling ? '' : '（`--no-rolling`）'}`);
	for (const part of corpus) say(`  - ${part.label}: ${part.cases.length}`);
	say(
		`- **写した検出器定数の検算**: \`completed\` な double の \`breakoutBarIndex\` と、` +
			`写しの \`BREAKOUT_BUFFER_PCT\` = ${BREAKOUT_BUFFER_PCT} / \`MAX_BARS_FROM_EXTREMUM\` = ` +
			`${MAX_BARS_FROM_EXTREMUM} で再導出した最初のブレイク足の食い違い: ` +
			`**${breakoutMismatch} 件**${breakoutMismatch === 0 ? '（正常）' : '（⚠️ 写しがずれている）'}`,
	);
	say(`- **解剖できなかった accepted**: ${unreadable} 件 / **\`heightAbs\` が測れなかった**: ${heightUnmeasurable} 件`);
	say(`- **\`status: 'forming'\` で除外**: ${formingSkipped} 件（末尾の主構成点が \`pivots\` に無い。§4 参照）`);
	say();
	say('### 0-1. 自己検算（issue #245 本文の発端の形）');
	say();
	say(
		'実データ D の `limit=72` 窓（`BTC_JPY_1HOUR_2026_09_05_ISSUE_WINDOW`）/ `1hour` / `swingDepth: 6` で ' +
			`\`double_top\` 41-46-50 が **\`${selfCheck.status}\`** として出る。`,
	);
	say();
	say('| 役割 | idx | UTC | 終値 | 高安 |');
	say('|---|---:|---|---:|---:|');
	for (const pt of selfCheck.pts) {
		say(`| ${pt.role} | ${pt.idx} | ${mdCell(pt.iso)} | ${yen(pt.price)} | ${yen(pt.extremePrice)} |`);
	}
	say();
	say(
		`\`heightAbs\` = **${yen(selfCheck.heightAbs)}** / \`closeGap\` = **${f3(selfCheck.closeGap)}** / ` +
			`\`wickShare\` = **${f3(selfCheck.wickShare)}**。` +
			`issue 本文の 0.099 / 0.733 と一致する（一致しなければ数字を出す前に例外になる）。`,
	);
	say();

	// ── §1 分布 ──
	const doubles = recs.filter((r) => r.family === 'double');
	const doubleEntities = [...entities.values()].filter((r) => r.family === 'double');
	// 値動き単位の代表 1 件（時間足ラベルを落として畳む。{@link Rec.motion}）。
	const doubleMotions = [...new Map(doubleEntities.map((r) => [r.motion, r])).values()];
	say('## 1. 分布（accepted な double）');
	say();
	say(
		'`closeGap`（山2 の終値がネックラインからパターン高さの何割離れているか）と ' +
			'`wickShare`（山2 のヒゲがパターン高さの何割か）。**延べ**は accepted な出力 1 件を 1 と数えたもの、' +
			'**実体**は絶対時刻（時間足 + type + 主構成点の ISO 時刻）で畳んだもの、' +
			'**値動き**は**時間足ラベルまで落として**（type + 主構成点の ISO 時刻）畳んだもの。' +
			'実データ B / C / D と実データ A は同じローソク足に時間足ラベルを付け替えて回しているので、' +
			'**目視で見る形の数を言うときは「値動き」を見る**（#262 §8-1 と同じ畳み方）。' +
			'実データ B / C / D 同士も同じ 1 時間足履歴の重なる窓なので、系列別に数えると同じ形を 3 回数える。',
	);
	say();
	say(
		`accepted な double: **延べ ${doubles.length} 件 / 実体 ${doubleEntities.length} 件 / ` +
			`値動き ${new Set(doubles.map((r) => r.motion)).size} 件**` +
			`（\`completed\` 延べ ${doubles.filter((r) => r.status === 'completed').length} / ` +
			`\`near_completion\` 延べ ${doubles.filter((r) => r.status === 'near_completion').length}）。`,
	);
	say();

	const distTable = (label: string, rows: Array<[string, Rec[]]>): void => {
		say(`### ${label}`);
		say();
		say(
			'| 区分 | 延べ | 実体 | 値動き | `closeGap` min | p10 | p50 | p90 | max | `wickShare` min | p10 | p50 | p90 | max |',
		);
		say('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
		for (const [name, rs] of rows) {
			const ents = new Set(rs.map((r) => r.entity)).size;
			const motions = new Set(rs.map((r) => r.motion)).size;
			say(
				`| ${name} | ${rs.length} | ${ents} | ${motions} | ${distCells(rs.map((r) => r.closeGap))} | ` +
					`${distCells(rs.map((r) => r.wickShare))} |`,
			);
		}
		say();
	};

	distTable('1-1. status 別 × side 別', [
		['`completed` / top', doubles.filter((r) => r.status === 'completed' && r.side === 'top')],
		['`completed` / bottom', doubles.filter((r) => r.status === 'completed' && r.side === 'bottom')],
		['`near_completion` / top', doubles.filter((r) => r.status === 'near_completion' && r.side === 'top')],
		['`near_completion` / bottom', doubles.filter((r) => r.status === 'near_completion' && r.side === 'bottom')],
		['合計', doubles],
	]);

	say('### 1-2. 時間足別（実 1hour 系列 + 実データ A の 1day のみ。合成と `tf` 付け替えは除く）');
	say();
	say(
		'`tf` ラベルではなく**ローソク足そのものが実データであるか**で絞ってある' +
			'（`isTfAuthoritative`。#178 の注意）。実データ B / C / D は実 1 時間足 365 本に ' +
			'`1day` / `4hour` / `1hour` のラベルを付け替えたもので、実データ A は実 1 日足 90 本。' +
			'**したがって `4hour` 行は構造的に常に 0**——実 4 時間足の系列がコーパスに無いので、' +
			'この行の 0 は「4 時間足では出ない」ではなく「4 時間足の母集団が無い」と読む。',
	);
	say();
	distTable(
		'1-2-1. 内訳',
		['1day', '4hour', '1hour'].map((tf) => [`\`${tf}\``, doubles.filter((r) => r.tfAuthoritative && r.tf === tf)]),
	);

	distTable(
		'1-3. 母集団別（プールしない。#219）',
		corpus.map((part) => [part.label, doubles.filter((r) => r.corpus === part.label)]),
	);

	// 実体単位の分布（代表 1 件で畳んだもの）。
	distTable('1-4. 実体単位 / 値動き単位（絶対時刻で畳んだ代表 1 件）', [
		['実体 / top', doubleEntities.filter((r) => r.side === 'top')],
		['実体 / bottom', doubleEntities.filter((r) => r.side === 'bottom')],
		['実体 / 合計', doubleEntities],
		['値動き / top', doubleMotions.filter((r) => r.side === 'top')],
		['値動き / bottom', doubleMotions.filter((r) => r.side === 'bottom')],
		['値動き / 合計', doubleMotions],
	]);

	// 空白帯（#214 の基準）。
	say('### 1-5. 空白帯（閾値の非恣意性を主張できるか。#214 の基準）');
	say();
	say(
		'値動き単位（および実体単位・延べ）の値を昇順に並べ、**隣接する値の差が最大の区間**を出す。' +
			'閾値を置くなら「空白帯の中」でなければ非恣意性は主張できない。' +
			'**空白帯が無ければ「無い」と書く**（差が 0 = 同値が連続するだけの列には帯が無い）。' +
			`さらに **n < ${GAP_MIN_SAMPLES} の列では帯を根拠にしない**——標本が数個しかない列では` +
			'隣接差が必ず大きく出るので、帯の広さは分布の谷ではなく標本の粗さを写しているだけで、' +
			'#214 の基準を満たさない。判定は「根拠に使えるか」列に出す。\n' +
			'\n' +
			'**判断は「値動き」行だけで行う。** 実体行・延べ行の n は**同じ値動きを時間足ラベル / 窓 / ' +
			'`swingDepth` ごとに重複して数えている**ので、n が大きくても独立な標本ではない' +
			'（同じ値が何度も並ぶだけなので隣接差の分布も変わらない）。実体行・延べ行は' +
			'「値動き行と同じ帯が出るか」の検算として置いてあるだけで、「根拠に使えるか」列は' +
			'**重複あり**と出す。',
	);
	say();
	say('| 量 | 対象 | n | 最も広い空白帯 | 幅 | 全幅に対する比 | 根拠に使えるか |');
	say('|---|---|---:|---|---:|---:|---|');
	for (const [name, pick] of [
		['`closeGap`', (r: Rec) => r.closeGap] as const,
		['`wickShare`', (r: Rec) => r.wickShare] as const,
	]) {
		for (const [label, rs, dedup] of [
			['値動き / top', doubleMotions.filter((r) => r.side === 'top'), true] as const,
			['値動き / bottom', doubleMotions.filter((r) => r.side === 'bottom'), true] as const,
			['値動き / 合計', doubleMotions, true] as const,
			['実体 / 合計', doubleEntities, false] as const,
			['延べ / 合計', doubles, false] as const,
		]) {
			const vals = rs.map(pick);
			const g = widestGap(vals);
			const span = vals.length > 0 ? Math.max(...vals) - Math.min(...vals) : 0;
			const usable = !dedup
				? '**重複あり**（判断は値動き行で）'
				: g === null
					? '**いいえ**（帯が無い）'
					: vals.length < GAP_MIN_SAMPLES
						? `**いいえ**（n < ${GAP_MIN_SAMPLES}）`
						: 'はい';
			say(
				`| ${name} | ${label} | ${vals.length} | ${g ? `${f3(g.lo)} 〜 ${f3(g.hi)}` : '**無い**'} | ` +
					`${g ? f3(g.width) : '—'} | ${g && span > 0 ? f3(g.width / span) : '—'} | ${usable} |`,
			);
		}
	}
	say();

	// ── §2 該当の列挙 ──
	const hits = doubles.filter(isHit);
	/** 実体キー → その実体の延べ全部（代表は「検出器が最も長く見た窓」で選ぶ）。 */
	const hitGroups = new Map<string, Rec[]>();
	for (const r of hits) {
		const g = hitGroups.get(r.entity) ?? [];
		g.push(r);
		hitGroups.set(r.entity, g);
	}
	/**
	 * 実体 1 件の代表。**`windowEnd` が最大の延べ**を採る——その実体が accepted のままでいた
	 * 窓のうち最も情報の多いものが、§3 の「検出器が見た情報だけの判定」の母材になる。
	 */
	const repOf = (g: readonly Rec[]): Rec => g.reduce((a, b) => (b.windowEnd > a.windowEnd ? b : a));

	say(
		'## 2. 仮の閾値での該当（`closeGap` ≤ ' +
			String(HIT_CLOSE_GAP_MAX) +
			' かつ `wickShare` ≥ ' +
			String(HIT_WICK_SHARE_MIN) +
			'）',
	);
	say();
	say(
		'閾値は**仮置き**（issue #245 の計測仕様どおり）。§1-5 の空白帯を見て動かすかを判断する。' +
			`該当: **延べ ${hits.length} 件 / 実体 ${hitGroups.size} 件 / ` +
			`値動き ${new Set(hits.map((r) => r.motion)).size} 件**。`,
	);
	say();
	if (hitGroups.size === 0) {
		say('**該当は 0 件。** 列挙するものが無い。');
		say();
	} else {
		say(
			'| # | 実体（時間足 / type / 主構成点の ISO 時刻） | 延べ | 代表（系列 / sd / 窓の終端） | status | ' +
				'`closeGap` | `wickShare` | `heightAbs` | ネックライン |',
		);
		say('|---:|---|---:|---|---|---:|---:|---:|---:|');
		let i = 0;
		for (const [ent, g] of hitGroups) {
			i++;
			const r = repOf(g);
			say(
				`| ${i} | \`${mdCell(ent)}\` | ${g.length} | ${r.series} / sd=${r.sd} / end=${r.windowEnd} | ` +
					`\`${[...new Set(g.map((x) => x.status))].sort().join('` / `')}\` | ` +
					`${f3(r.closeGap)} | ${f3(r.wickShare)} | ${yen(r.heightAbs)} | ${yen(r.necklinePrice)} |`,
			);
		}
		say();
		say(
			'**構成点と「その後」**（構成点は `btc_jpy` の絶対時刻で出す。オーナーが Claude Desktop / ' +
				'チャートで目視できるようにするため）。「その後」は**ローリング窓で同じ構成点が後続の窓で ' +
				'どの status になったか**で、構造キー（系列 / 時間足 / `swingDepth` / 構成点 idx）ごとに出す:',
		);
		say();
		for (const [ent, g] of hitGroups) {
			const r = repOf(g);
			say(
				`- \`${ent}\` — \`btc_jpy\` / \`${r.tf}\` / \`closeGap\` ${f3(r.closeGap)} / \`wickShare\` ${f3(r.wickShare)}`,
			);
			for (const p of r.pts) {
				say(`  - ${p.role}: idx ${p.idx} / ${p.iso} / 終値 ${yen(p.price)} / 高安 ${yen(p.extremePrice)}`);
			}
			// 同じ実体が複数の (系列, sd) で出ることがある（実データ B / C / D は重なる窓）。
			for (const struct of [...new Set(g.map((x) => x.struct))].sort()) {
				const origin = Math.min(...g.filter((x) => x.struct === struct).map((x) => x.windowEnd));
				// **箇条書きでは `mdCell` を通さない。** GFM が `\\|` を `|` に戻すのは表のセルの中だけで、
				// 表の外のコードスパンではバックスラッシュがそのまま表示される。
				say(
					`  - その後 \`${struct}\`（最初に accepted になった窓 end=${origin}）: ${traceAfter(timeline, struct, origin)}`,
				);
			}
		}
		say();
	}

	// ── §3 目視判定 ──
	say('## 3. 目視判定（3 値）');
	say();
	say(
		'基準（`judge` の docstring が単一ソース。順に当てて最初に当たったものを採る）:' +
			'\n\n' +
			'1. **山2 の高値が山1 の水準に届いていない**（`isSameLevel(山1.extremePrice, 山2.extremePrice, ' +
			`DOUBLE_LEVEL_MAX_PCT=${DOUBLE_LEVEL_MAX_PCT})\`` +
			' が偽。ヒゲ込みでも同水準でない） → **呼べない**\n' +
			`2. **割った後すぐ戻している**（ブレイク足の翌足から ${QUICK_RECOVERY_BARS} 本以内に終値がネックライン水準へ復帰） → **呼べない**\n` +
			'3. **山2 の翌足以降で終値がネックラインを「直接」割っている** → **正当な failed retest**\n' +
			'4. それ以外 → **保留**（4a: 割る前に山2 の終値を越えて戻している / 4b: 走査終端まで割っていない）\n' +
			'\n' +
			'**「直接」を山2 とブレイク足の間の終値の最高値で測る。** #242 のゲート本体は' +
			'ピボット列を入力に取るので `swingDepth` に依存し（#251 案 3。仕様として固定）、' +
			'目視判定の基準に使うと同じ値動きが深さで別判定になる。そこで深さに依らない素の量——' +
			'**山2 の翌足からブレイク足の直前までの終値の最高値（bottom は最安値）が山2 の終値を越えていないこと**' +
			'——を「直接」とした。越えていれば #242 が `peak_after_last_pivot` で落としたのと同じ値動きなので保留。\n' +
			'\n' +
			'使う量は構成点の終値・極値と区間の終値だけで、**独自描画は書いていない**（`.claude/rules/charting.md`）。' +
			'ブレイク判定には検出器と同じ ±1.5% バッファを掛ける（§0 で写しの一致を検算済み）。' +
			'走査終端は**代表の窓の終端**（= 検出器が見た情報だけ）。参考として系列の末尾まで先読みした' +
			'判定も併記する——**先読みは検出器に見えない情報**なので、決定の根拠にするときはその旨を明示すること。',
	);
	say();
	if (hitGroups.size === 0) {
		say('該当が **0 件**なので判定するものが無い。');
		say();
	} else {
		say(
			'| # | 実体 | status | `closeGap` | `wickShare` | 高安の相対差 | 割った足 | 割る前の戻し | 直後の復帰 | 判定 | 根拠 | 先読みした判定 |',
		);
		say('|---:|---|---|---:|---:|---:|---:|---|---|---|---|---|');
		const tally = new Map<string, number>();
		const tallyAhead = new Map<string, number>();
		const judged: Array<{ ent: string; rec: Rec; j: Judgement }> = [];
		let i = 0;
		for (const [ent, g] of hitGroups) {
			i++;
			const r = repOf(g);
			const candles = seriesByName.get(r.series)?.candles ?? [];
			const j = judge(r, candles, r.windowEnd);
			const ahead = judge(r, candles, candles.length - 1);
			inc(tally, j.verdict);
			inc(tallyAhead, ahead.verdict);
			judged.push({ ent, rec: r, j });
			say(
				`| ${i} | \`${mdCell(ent)}\` | \`${r.status}\` | ${f3(r.closeGap)} | ${f3(r.wickShare)} | ` +
					`${(j.extremeRelDiff * 100).toFixed(3)}% | ${j.brokeIdx >= 0 ? j.brokeIdx : '—'} | ` +
					`${j.reboundBeforeBreak ? `**✅ ${yen(j.reboundClose as number)}**` : '—'} | ` +
					`${j.quickRecovery ? '**✅ 戻した**' : '—'} | **${j.verdict}** | ${mdCell(j.basis)} | ` +
					`${ahead.verdict}（+${Math.max(0, candles.length - 1 - r.windowEnd)} 本） |`,
			);
		}
		say();
		say(
			`集計（代表の窓の終端まで）: ${[...tally.entries()]
				.sort()
				.map(([v, n]) => `**${v} ${n}**`)
				.join(' / ')}（計 ${hitGroups.size} 実体 / ${new Set(hits.map((r) => r.motion)).size} 値動き）`,
		);
		say(
			`集計（系列の末尾まで先読み。参考）: ${[...tallyAhead.entries()]
				.sort()
				.map(([v, n]) => `**${v} ${n}**`)
				.join(' / ')}`,
		);
		say();
		const held = judged.filter((x) => x.j.verdict === '保留');
		if (held.length > 0) {
			say('**「保留」の実体**（オーナーが Claude Desktop / チャートで目視するための日時付き一覧）:');
			say();
			for (const { ent, rec, j } of held) {
				say(
					`- \`${ent}\` — \`btc_jpy\` / \`${rec.tf}\` / ${rec.series} / sd=${rec.sd} / 窓の終端 idx ${rec.windowEnd} / ` +
						`根拠 ${j.basis}`,
				);
				for (const p of rec.pts) say(`  - ${p.role}: ${p.iso} / 終値 ${yen(p.price)} / 高安 ${yen(p.extremePrice)}`);
			}
			say();
		} else {
			say('「保留」の実体は **0 件**。');
			say();
		}
	}

	// ── §4 同族 ──
	say('## 4. 同族の検査（参考）');
	say();
	say(
		'triple の山3 / 谷3（`pivots` の主構成点の末尾）と H&S の右肩 `p4` について同じ 2 量を出す。' +
			'ネックラインは `necklineAt(neckline, 末尾の主構成点の idx)`（#211 のクランプ済み）。',
	);
	say();
	say(
		'⚠️ **H&S の値は参考扱い**（#178 項目 3）。`heightAbs` の端点は**頭と谷**で、' +
			'**肩は端点にならない**。したがって H&S の `closeGap` / `wickShare` は double / triple と' +
			'同じ意味の比ではなく、**同じ式を当てた参考値**にすぎない。' +
			'H&S に高さ相対の受け皿が無いという #178 項目 3 の結論はそのまま生きている。',
	);
	say();
	say(
		"⚠️ **`status: 'forming'` は除外してある。** 形成中 triple / H&S の `pivots` には末尾の" +
			'主構成点（山3 / 右肩）が入っておらず（`detect_triples.ts` / `detect_hs.ts` の `pivots` コメント）、' +
			'暫定値は最新足の終値で `extremePrice` も同値なので `wickShare` が定義上 0 になる。' +
			`除外した件数は §0 の ${formingSkipped} 件。`,
	);
	say();
	const famRows: Array<[string, Rec[]]> = [];
	for (const fam of ['double', 'triple', 'hs'] as Family[]) {
		for (const side of ['top', 'bottom'] as Side[]) {
			const rs = recs.filter((r) => r.family === fam && r.side === side);
			if (rs.length > 0) famRows.push([`${fam} / ${side}`, rs]);
		}
	}
	distTable('4-1. family × side（全 status。参考）', famRows);
	say('### 4-2. 該当（同じ仮の閾値）の family 別内訳');
	say();
	say('| family / side | accepted 延べ | accepted 実体 | accepted 値動き | 該当 延べ | 該当 実体 | 該当 値動き |');
	say('|---|---:|---:|---:|---:|---:|---:|');
	for (const [label, rs] of famRows) {
		const hs = rs.filter(isHit);
		say(
			`| ${label} | ${rs.length} | ${new Set(rs.map((r) => r.entity)).size} | ` +
				`${new Set(rs.map((r) => r.motion)).size} | ${hs.length} | ` +
				`${new Set(hs.map((r) => r.entity)).size} | ${new Set(hs.map((r) => r.motion)).size} |`,
		);
	}
	say();
	say('accepted な型 × status の内訳（`forming` 込み。§0 の除外件数の内訳）:');
	say();
	say('| type \\| status | 延べ |');
	say('|---|---:|');
	for (const [k, v] of [...byType.entries()].sort()) say(`| \`${mdCell(k)}\` | ${v} |`);
	say();

	// ── §5 既存ゲートとの重なり ──
	say('## 5. 既存ゲートとの重なり');
	say();
	say(
		'§2 の該当実体のうち、`validateLevelDiff`（高さ相対 0.5 = `MAX_LEVEL_SPREAD_RATIO` ' +
			`${MAX_LEVEL_SPREAD_RATIO}）や \`validateMainPointsNecklineSide\`（主構成点がネックラインの正しい側に` +
			'あるか）で**既に落ちているもの**が無いことを確認する。**accepted を母集団にしているので 0 のはず**で、' +
			'0 でなければ `near_completion` のゲート集合が完成済みと同じでない（#270）ということになる。',
	);
	say();
	say('| 対象 | n | `validateLevelDiff` が理由を返す | ネックライン側検査が理由を返す |');
	say('|---|---:|---:|---:|');
	for (const [label, rs] of [
		['accepted double 全部（延べ）', doubles] as const,
		['accepted double / `completed`', doubles.filter((r) => r.status === 'completed')] as const,
		['accepted double / `near_completion`', doubles.filter((r) => r.status === 'near_completion')] as const,
		['§2 の該当（延べ）', hits] as const,
		['accepted triple（延べ）', recs.filter((r) => r.family === 'triple')] as const,
		['accepted H&S（延べ）', recs.filter((r) => r.family === 'hs')] as const,
	]) {
		const ld = rs.filter((r) => r.levelDiffReason !== null).length;
		const ns = rs.filter((r) => r.necklineSideReason !== null).length;
		say(`| ${label} | ${rs.length} | ${ld}${ld === 0 ? '' : ' ⚠️'} | ${ns}${ns === 0 ? '' : ' ⚠️'} |`);
	}
	say();
	say(
		'**`closeGap` > 0 は `validateMainPointsNecklineSide` の帰結**——あのゲートは top で ' +
			'`necklinePrice − 山.price >= 0` を落とすので、`closeGap` = 0 以下の候補は accepted に入れない。' +
			'したがって「終値では山が完全に無い（ネックラインと同値か下）」形は既に弾かれている。' +
			'残っているのは**わずかに上**の帯で、その厚みが §1 の `closeGap` の下側の分布そのもの。',
	);
	say();
	say(
		`accepted double の \`spreadRatio\`（\`validateLevelDiff\` が見る量）: ` +
			`max ${doubles.length > 0 ? f3(Math.max(...doubles.map((r) => r.spreadRatio ?? 0))) : '—'}` +
			`（閾値 ${MAX_LEVEL_SPREAD_RATIO}）。H&S の肩の同水準上限は \`HS_SHOULDER_MAX_PCT\` = ${HS_SHOULDER_MAX_PCT}。`,
	);
	say();

	const text = out.join('\n');
	process.stdout.write(`${text}\n`);
	if (jsonPath) {
		writeFileSync(
			jsonPath,
			`${JSON.stringify(
				{
					generatedAt: nowIso(),
					caseCount,
					selfCheck,
					breakoutMismatch,
					counts: {
						accepted: recs.length,
						entities: entities.size,
						unreadable,
						heightUnmeasurable,
						formingSkipped,
					},
					thresholds: { closeGapMax: HIT_CLOSE_GAP_MAX, wickShareMin: HIT_WICK_SHARE_MIN },
					hits: [...hitGroups.entries()].map(([entity, g]) => ({ entity, count: g.length, recs: g })),
					doubleEntities,
					doubleMotions,
				},
				null,
				2,
			)}\n`,
		);
	}
}

main().catch((e) => {
	process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
	process.exit(1);
});
