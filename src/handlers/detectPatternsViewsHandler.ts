// 構造化データ（range / confirmation.date 等）の日付は後方互換のため UTC ISO のまま。表示だけを tz で整形する。
import { formatDateOrTimeInTz } from '../../lib/datetime.js';
import { formatFixed, formatInt, formatPctFromRatio, formatRounded } from '../../lib/formatter.js';
import { toStructured } from '../../lib/result.js';
import { BREAKOUT_AGAINST_EXPECTATION, levelSpreadMetrics } from '../../tools/patterns/structural.js';
import { formatStructureGateSkipLine, formatTriplePositionLines } from '../../tools/patterns/structure-diagnostics.js';
import type { Pivot } from '../../tools/patterns/swing.js';
import { formatTargetProgressLine } from '../../tools/patterns/target-reach.js';
import type { PatternEntry } from '../../tools/patterns/types.js';
import type { McpResponse } from '../tool-definition.js';

interface SwingDebug {
	kind: string;
	idx: number;
	price: number;
	isoTime?: string;
}

/** status / breakoutDirection の置き場所は検出器によって top-level と details 配下に割れているので、読む側（candLines）で 1 回だけ解決する（#160）。 */
interface CandidateDebug {
	type: string;
	accepted: boolean;
	reason?: string;
	status?: string;
	breakoutDirection?: string | null;
	indices?: number[];
	points?: Array<{ role: string; idx: number; price: number }>;
	details?: Record<string, unknown>;
}

interface PatternMeta {
	debug?: {
		swings?: SwingDebug[];
		candidates?: CandidateDebug[];
		/** 欠損は「トリムが無かった」ではなく「件数が分からない」なので、表示側では行ごと落とす（#180）。 */
		candidatesTotal?: number;
		candidatesOmitted?: number;
		swingsTotal?: number;
		swingsOmitted?: number;
	};
	effective_params?: EffectiveParams;
	reduction?: ReductionCounts;
	[key: string]: unknown;
}

/** src/schema/patterns.ts の ReductionSchema と対。 */
interface ReductionCounts {
	detected: number;
	reversalHistoryExcluded?: number;
	dedupMerged: number;
	currentFiltered: number;
	lifecycleExcluded: number;
	/** 減るのは triple_* だけ（#218）。 */
	tripleHsExcluded: number;
	/** 0 なら tripleHsExcluded の 0 は「比較対象が無かった」の意味。waterfall の等式には入らない（#224）。 */
	tripleHsCandidateCount: number;
	output: number;
}

/** src/schema/patterns.ts の EffectiveParamsSchema と対。 */
interface EffectiveParam {
	value: number;
	source: 'auto' | 'explicit';
}

/** 入力値ではなく解決後の実効値（#182 の sentinel 置換適用済み）。 */
interface EffectiveParams {
	swingDepth?: EffectiveParam;
	minBarsBetweenSwings?: EffectiveParam;
	tolerancePct?: EffectiveParam;
	headProminencePct?: EffectiveParam;
}

interface PatternResult {
	ok?: boolean;
	data?: { patterns?: PatternEntry[]; overlays?: unknown };
	meta?: Record<string, unknown>;
	summary?: string;
	[key: string]: unknown;
}

interface IndexedPoint {
	index: number;
	price: number;
}

const toTs = (s?: string): number => {
	try {
		return s ? Date.parse(s) : NaN;
	} catch {
		return NaN;
	}
};

const fmtPointList = (arr: unknown): string =>
	Array.isArray(arr) ? arr.map((p: IndexedPoint) => `[${p.index}:${formatRounded(p.price)}]`).join(', ') : 'n/a';

/** キーの昇順比較。`localeCompare` は ICU の有無で並びが揺れるので使わない（並びはテストで固定する）。 */
const byKeyAsc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const GENERIC_DETAILS_MAX_FIELDS = 16;
const GENERIC_DETAILS_MAX_JSON = 160;

export function buildTypeSummary(pats: PatternEntry[]): string {
	const byType = pats.reduce(
		(m: Record<string, number>, p: PatternEntry) => {
			const k = String(p?.type || 'unknown');
			m[k] = (m[k] || 0) + 1;
			return m;
		},
		{} as Record<string, number>,
	);
	return Object.entries(byType)
		.map(([k, v]) => `${k}×${v}`)
		.join(', ');
}

/** tests/view-content-superset.test.ts が定型要素の抽出に使うので、変えるなら向こうも直す。 */
export const EFFECTIVE_PARAMS_LABEL = '実効パラメータ（入力値ではない）';

/** schema / meta の宣言順と揃える。 */
const EFFECTIVE_PARAM_ORDER = ['swingDepth', 'minBarsBetweenSwings', 'tolerancePct', 'headProminencePct'] as const;

// 常に出す（行が無いことを LLM に推論させない）。effective_params が無ければ空文字を返し、入力値で代用しない（#184）。
export function buildEffectiveParamsLine(meta: PatternMeta | undefined, type: string): string {
	const eff = meta?.effective_params;
	if (!eff) return '';
	const parts: string[] = [];
	let hasAuto = false;
	for (const key of EFFECTIVE_PARAM_ORDER) {
		const entry = eff[key];
		if (!entry || !Number.isFinite(entry.value)) continue;
		const auto = entry.source !== 'explicit';
		if (auto) hasAuto = true;
		parts.push(`${key}=${entry.value}(${auto ? 'auto' : '指定'})`);
	}
	if (parts.length === 0) return '';
	// auto が 1 つも無い呼び出しでは置換が起きていないので注記ごと落とす。
	const note = hasAuto ? ` ※auto=${type} の時間軸オート値（スキーマ既定値 7/5/0.04 の明示指定も auto）` : '';
	return `${EFFECTIVE_PARAMS_LABEL}: ${parts.join(' / ')}${note}`;
}

export const DETECTION_ROUTE_LABEL = '検出経路';

// relaxed が 0 件でも行を出す。行が無いことを「relaxed なし」と LLM に推論させない（#191）。
export function buildDetectionRouteLine(pats: PatternEntry[]): string {
	if (!Array.isArray(pats) || pats.length === 0) return '';
	const byTag = new Map<string, number>();
	for (const p of pats) {
		const tag = typeof p?._fallback === 'string' ? p._fallback.trim() : '';
		if (!tag) continue;
		byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
	}
	const relaxed = [...byTag.values()].reduce((sum, n) => sum + n, 0);
	if (relaxed === 0) {
		return `${DETECTION_ROUTE_LABEL}: 全 ${formatInt(pats.length)} 件とも strict（relaxed フォールバック由来は 0 件）`;
	}
	const breakdown = [...byTag.entries()]
		.sort((a, b) => b[1] - a[1] || byKeyAsc(a[0], b[0]))
		.map(([tag, n]) => `${tag}×${formatInt(n)}`)
		.join(', ');
	return (
		`${DETECTION_ROUTE_LABEL}: strict ${formatInt(pats.length - relaxed)} 件 / relaxed フォールバック由来 ${formatInt(relaxed)} 件` +
		`（${breakdown}）※該当パターンは見出し行の末尾に同じ値が [ ] 付きで出る（summary はパターン行を出さないので件数のみ）`
	);
}

export const REDUCTION_LABEL = '検出内訳';
export const TRIPLE_HS_NO_CANDIDATE_NOTE = '（比較対象 H&S 無し）';

// currentFiltered だけは 0 のとき省く（無効時も確定的に 0 を返すので曖昧さが無い）。他の段は 0 でも省かない。件数は再集計しない（#200）。
export function buildReductionLine(meta: PatternMeta | undefined): string {
	const r = meta?.reduction;
	if (!r) return '';
	const {
		detected,
		reversalHistoryExcluded,
		dedupMerged,
		currentFiltered,
		lifecycleExcluded,
		tripleHsExcluded,
		tripleHsCandidateCount,
		output,
	} = r;
	if (![detected, dedupMerged, currentFiltered, lifecycleExcluded, tripleHsExcluded, output].every(Number.isFinite))
		return '';
	const parts = [`検出 ${formatInt(detected)}件`];
	if (Number.isFinite(reversalHistoryExcluded)) {
		parts.push(`反転履歴不足 -${formatInt(reversalHistoryExcluded as number)}`);
	}
	parts.push(`重複統合 -${formatInt(dedupMerged)}`);
	if (currentFiltered > 0) parts.push(`現在時点フィルタ -${formatInt(currentFiltered)}`);
	// tripleHsCandidateCount が無い古い meta では注記を出さない。無いことを「比較対象無し」と読ませない。
	const hsNote = tripleHsCandidateCount === 0 ? TRIPLE_HS_NO_CANDIDATE_NOTE : '';
	parts.push(
		`ライフサイクル除外 -${formatInt(lifecycleExcluded)}`,
		`triple×H&S排他 -${formatInt(tripleHsExcluded)}${hsNote}`,
		`出力 ${formatInt(output)}件`,
	);
	return `${REDUCTION_LABEL}: ${parts.join(' → ')}`;
}

function formatCandidateDetails(c: CandidateDebug): string {
	if (!c.details) return '\n   details: none';
	const d: Record<string, unknown> = c.details;
	const reason = String(c?.reason ?? '');

	if (reason === 'type_classification_failed') {
		return (
			`\n   failureReason: ${d?.failureReason || 'n/a'}` +
			`\n   slopes: hi=${formatFixed(d?.slopeHigh)} lo=${formatFixed(d?.slopeLow)}` +
			`\n   slopeRatio: ${Number.isFinite(Number(d?.slopeRatio)) ? Number(d.slopeRatio).toFixed(3) : 'n/a'}`
		);
	}

	if (reason === 'probe_window') {
		return (
			`\n   upper.slope: ${formatFixed(d?.slopeHigh)}` +
			`\n   lower.slope: ${formatFixed(d?.slopeLow)}` +
			`\n   priceRange: ${formatRounded(d?.priceRange)}` +
			`\n   barsSpan: ${formatInt(d?.barsSpan)}` +
			`\n   minMeaningfulSlope: ${formatFixed(d?.minMeaningfulSlope)}` +
			`\n   highsIn: ${fmtPointList(d?.highsIn)}` +
			`\n   lowsIn: ${fmtPointList(d?.lowsIn)}`
		);
	}

	if (reason === 'declining_highs' || reason === 'declining_highs_probe') {
		return (
			`\n   ${reason === 'declining_highs' ? 'declining_highs: true' : 'declining_highs_probe: metrics'}` +
			`\n   highsIn.count: ${formatInt(d?.highsCount)}` +
			`\n   1st half avg: ${formatRounded(d?.firstAvg)}` +
			`\n   2nd half avg: ${formatRounded(d?.secondAvg)}` +
			`\n   ratio: ${formatPctFromRatio(d?.ratio)}`
		);
	}

	if (reason === 'rising_probe') {
		return (
			`\n   r2: hi=${Number.isFinite(Number(d?.r2High)) ? Number(d.r2High).toFixed(3) : 'n/a'}, lo=${Number.isFinite(Number(d?.r2Low)) ? Number(d.r2Low).toFixed(3) : 'n/a'}` +
			`\n   slopes: hi=${Number.isFinite(Number(d?.slopeHigh)) ? Number(d.slopeHigh).toFixed(6) : 'n/a'} lo=${Number.isFinite(Number(d?.slopeLow)) ? Number(d.slopeLow).toFixed(6) : 'n/a'}` +
			`\n   slopeRatioLH: ${Number.isFinite(Number(d?.slopeRatioLH)) ? Number(d.slopeRatioLH).toFixed(3) : 'n/a'}` +
			`\n   priceRange: ${formatRounded(d?.priceRange)}, barsSpan: ${formatInt(d?.barsSpan)}` +
			`\n   minMeaningfulSlope: ${Number.isFinite(Number(d?.minMeaningfulSlope)) ? Number(d.minMeaningfulSlope).toFixed(6) : 'n/a'}` +
			`\n   highsIn: ${fmtPointList(d?.highsIn)}` +
			`\n   lowsIn: ${fmtPointList(d?.lowsIn)}` +
			`\n   declining_highs metrics: firstAvg=${formatRounded(d?.firstAvg)}, secondAvg=${formatRounded(d?.secondAvg)}, ratio=${formatPctFromRatio(d?.ratio)}`
		);
	}

	if (reason === 'post_filter_rising_highs_not_declining') {
		return (
			`\n   post_filter: rising highs not declining` +
			`\n   highsIn.count: ${formatInt(d?.highsCount)}` +
			`\n   1st half avg: ${formatRounded(d?.firstAvg)}` +
			`\n   2nd half avg: ${formatRounded(d?.secondAvg)}` +
			`\n   ratio: ${formatPctFromRatio(d?.ratio)}`
		);
	}

	if (reason === 'post_filter_falling_lows_not_rising') {
		return (
			`\n   post_filter: falling lows not rising` +
			`\n   lowsIn.count: ${formatInt(d?.lowsCount)}` +
			`\n   1st half avg: ${formatRounded(d?.firstAvg)}` +
			`\n   2nd half avg: ${formatRounded(d?.secondAvg)}` +
			`\n   ratio: ${formatPctFromRatio(d?.ratio)}`
		);
	}

	const flagReasons = new Set([
		'detected',
		'classification_failed',
		'spread_invalid',
		'broadening_channel',
		'spread_unstable',
		'slope_same_as_pole',
		'symmetric_convergence',
		'parallel_counter_trend',
		'insufficient_consolidation_swings',
		'trendline_span_too_short',
		'poor_trendline_fit',
		'consolidation_too_wide',
		'dedup_summary',
	]);
	if (flagReasons.has(reason)) {
		const lines: string[] = [];
		if (d?.poleATRMult != null || d?.polePerBarImpulse != null || d?.poleChangePct != null) {
			const poleAtr = d?.poleATRMult != null ? Number(d.poleATRMult).toFixed(2) : 'n/a';
			const poleImpulse = d?.polePerBarImpulse != null ? Number(d.polePerBarImpulse).toFixed(2) : 'n/a';
			const polePct = d?.poleChangePct != null ? `${(Number(d.poleChangePct) * 100).toFixed(1)}%` : 'n/a';
			const poleBars = d?.poleBars != null ? `${formatInt(d.poleBars)}本` : 'n/a';
			const poleDir = d?.poleDirection ? `(${d.poleDirection})` : '';
			lines.push(
				`   pole: atrMult=${poleAtr}, perBarImpulse=${poleImpulse}, change=${polePct}, bars=${poleBars} ${poleDir}`,
			);
		}
		if (d?.spreadAvg != null || d?.spreadStability != null || d?.spreadStart != null) {
			const spAvg = d?.spreadAvg != null ? formatRounded(d.spreadAvg) : 'n/a';
			const spStab = d?.spreadStability != null ? `${(Number(d.spreadStability) * 100).toFixed(0)}%` : 'n/a';
			const spStart = d?.spreadStart != null ? formatRounded(d.spreadStart) : null;
			const spEnd = d?.spreadEnd != null ? formatRounded(d.spreadEnd) : null;
			const seg = spStart && spEnd ? `, start→end=${spStart}→${spEnd}` : '';
			lines.push(`   spread: avg=${spAvg}, stability=${spStab}${seg}`);
		}
		if (d?.upperSlope != null || d?.lowerSlope != null) {
			const us = d?.upperSlope != null ? Number(d.upperSlope).toFixed(4) : 'n/a';
			const ls = d?.lowerSlope != null ? Number(d.lowerSlope).toFixed(4) : 'n/a';
			const conv = d?.convergenceRatio != null ? Number(d.convergenceRatio).toFixed(3) : 'n/a';
			lines.push(`   slopes: upper=${us}, lower=${ls}, convergenceRatio=${conv}`);
		}
		if (d?.r2Upper != null || d?.r2Lower != null) {
			const r2U = d?.r2Upper != null ? Number(d.r2Upper).toFixed(3) : 'n/a';
			const r2L = d?.r2Lower != null ? Number(d.r2Lower).toFixed(3) : 'n/a';
			lines.push(`   r2: upper=${r2U}, lower=${r2L}`);
		}
		if (d?.expectedBreakoutDirection) {
			lines.push(`   expectedBreakoutDirection: ${d.expectedBreakoutDirection}`);
		}
		if (reason === 'dedup_summary') {
			lines.push(
				`   dedup: before=${formatInt(d?.beforeDedup)}, after=${formatInt(d?.afterDedup)}, removed=${formatInt(d?.removed)}`,
			);
		}
		if (reason === 'insufficient_consolidation_swings' && (d?.highs != null || d?.lows != null)) {
			lines.push(`   swings: highs=${formatInt(d?.highs)}, lows=${formatInt(d?.lows)}`);
		}
		if (reason === 'trendline_span_too_short') {
			lines.push(
				`   spans: upper=${formatInt(d?.upperSpan)}/${formatInt(d?.consZoneWidth)} (${(Number(d?.upperRatio) * 100).toFixed(0)}%), lower=${formatInt(d?.lowerSpan)}/${formatInt(d?.consZoneWidth)} (${(Number(d?.lowerRatio) * 100).toFixed(0)}%), minRatio=${(Number(d?.minSpanRatio) * 100).toFixed(0)}%`,
			);
		}
		if (reason === 'consolidation_too_wide') {
			lines.push(
				`   geometry: consRange=${formatRounded(d?.consRange)}, poleRange=${formatRounded(d?.poleRange)}, ratio=${(Number(d?.ratio) * 100).toFixed(0)}%`,
			);
		}
		if (reason === 'detected' && d?.touchCount != null) {
			// status はここで出さない。置き場所ごとに別行が出ると同じ事実が 2 通りの書式で散るので、candLines の 1 箇所でヘッダ行へ出す（#160）。
			lines.push(`   touchCount: ${formatInt(d.touchCount)}, confidence: ${d?.confidence ?? 'n/a'}`);
		}
		return lines.length > 0 ? `\n${lines.join('\n')}` : '\n   details: (no fields)';
	}

	// details に入っている診断値をそのまま列挙する。決め打ちのフィールド名（spreadStart 等）は default に来る検出器に存在しない。
	return formatGenericDetails(d);
}

function formatGenericDetails(d: Record<string, unknown>): string {
	const entries = Object.entries(d).filter(([, v]) => v != null);
	if (entries.length === 0) return '\n   details: (no fields)';
	const shown = entries.slice(0, GENERIC_DETAILS_MAX_FIELDS);
	const lines = shown.map(([k, v]) => `   ${k}: ${formatDetailValue(v)}`);
	if (entries.length > shown.length) {
		lines.push(`   … 他 ${entries.length - shown.length} フィールド（structuredContent.data.candidates 参照）`);
	}
	return `\n${lines.join('\n')}`;
}

function formatDetailValue(v: unknown): string {
	if (typeof v === 'number') {
		if (!Number.isFinite(v)) return String(v);
		if (Number.isInteger(v)) return String(v);
		// 価格帯の値（数百万円）を toFixed(6) で出すと読めないので、大きい値だけ丸める。
		return Math.abs(v) >= 1000 ? formatRounded(v) : String(Number(v.toFixed(6)));
	}
	if (typeof v === 'string' || typeof v === 'boolean') return String(v);
	try {
		const json = JSON.stringify(v);
		if (typeof json !== 'string') return String(v);
		return json.length > GENERIC_DETAILS_MAX_JSON ? `${json.slice(0, GENERIC_DETAILS_MAX_JSON)}…` : json;
	} catch {
		return String(v);
	}
}

// キーが在れば値が null でも次の系統へフォールバックしない。畳むと「未ブレイクなのに方向がある」行が出る。
function breakDirectionFromDetails(details?: Record<string, unknown>): string | null | undefined {
	if (!details) return undefined;
	for (const key of ['breakout', 'breakInfo'] as const) {
		if (!(key in details)) continue;
		return (details[key] as { direction?: string | null } | null | undefined)?.direction ?? null;
	}
	return undefined;
}

// total が数値でないときは行ごと出さない（件数不明で「省略なし」と書かない）。省略 0 でも「省略なし」を明示する（#180）。
function formatTrimNote(kept: number, total?: number, omitted?: number, omittedNote?: string): string {
	const trim = resolveTrimCounts(kept, total, omitted);
	if (!trim) return '';
	const tail =
		trim.dropped > 0 ? `${formatInt(trim.dropped)} 件省略${omittedNote ? `。${omittedNote}` : ''}` : '省略なし';
	return ` ${formatInt(kept)} / 全 ${formatInt(trim.total)} 件（${tail}）`;
}

// formatTrimNote と formatRejectionSummary の単一ソース。別々に計算すると見出しと集計が食い違う（#191）。
function resolveTrimCounts(kept: number, total?: number, omitted?: number): { total: number; dropped: number } | null {
	if (typeof total !== 'number' || !Number.isFinite(total)) return null;
	const dropped =
		typeof omitted === 'number' && Number.isFinite(omitted) ? Math.max(0, omitted) : Math.max(0, total - kept);
	return { total, dropped };
}

/** tests/detectPatternsViewsHandler.test.ts / tests/view-content-superset.test.ts が抽出に使うので、変えるならテスト側も直す。 */
export const CANDIDATE_BREAKDOWN_LABEL = '▼ 候補の内訳';
export const REJECTION_SUMMARY_LABEL = '▼ 棄却理由の内訳';
/** REJECTION_SUMMARY_LABEL と接頭辞が重ならない語にしてある（テストが startsWith で 2 つの見出しを抽出する）。 */
export const REJECTION_CROSS_TOTAL_LABEL = '▼ reason 横断合計';

/** 超過分は残余行 1 本に畳み、合計は必ず一致させる。 */
const REJECTION_SUMMARY_MAX_TYPES = 20;
/** type 行と横断合計行の両方に同じ上限を掛ける。 */
const REJECTION_SUMMARY_MAX_REASONS = 10;

// type:reason の 2 軸で数え、reason 単独の横断合計を足す。出さないと LLM が手集計して外す（#191, #193）。
function formatRejectionSummary(cands: CandidateDebug[], total?: number, omitted?: number): string[] {
	if (cands.length === 0) return [];
	const accepted = cands.filter((c) => c.accepted).length;
	const rejected = cands.length - accepted;
	const trim = resolveTrimCounts(cands.length, total, omitted);
	const censored = !!trim && trim.dropped > 0;

	const scope = !trim
		? `受け取った ${formatInt(cands.length)} 件`
		: censored
			? `表示 ${formatInt(cands.length)} 件`
			: `全 ${formatInt(cands.length)} 件`;
	const scopeNote = !trim
		? '（総数の申告が無いため cap 省略の有無は不明。この集計は受け取った分のみ）'
		: censored
			? `（全 ${formatInt(trim.total)} 件のうち ${formatInt(trim.dropped)} 件は cap で省略されており、**この集計に入っていない**）`
			: '（cap 省略なし＝全候補の内訳）';
	const lines = [
		`${CANDIDATE_BREAKDOWN_LABEL}: ${scope} = accepted ${formatInt(accepted)} 件 + rejected ${formatInt(rejected)} 件${scopeNote}`,
	];

	if (rejected === 0) {
		// 「棄却が 0 件」と「集計を出していない」を区別できるように、行ごと落とさず明示する。
		lines.push(`${REJECTION_SUMMARY_LABEL}: なし（rejected 0 件）`);
		return lines;
	}

	const byType = new Map<string, { count: number; reasons: Map<string, number> }>();
	// type 行とは独立に全 rejected から数えるので、type 行が残余に畳まれても横断合計は rejected と一致し続ける。
	const byReason = new Map<string, number>();
	for (const c of cands) {
		if (c.accepted) continue;
		const type = String(c.type || 'unknown');
		// 理由なしの棄却も数から落とさない（落とすと行の合計が rejected と合わなくなる）。
		const reason = c.reason ? String(c.reason) : '(reason なし)';
		const entry = byType.get(type) ?? { count: 0, reasons: new Map<string, number>() };
		entry.count += 1;
		entry.reasons.set(reason, (entry.reasons.get(reason) ?? 0) + 1);
		byType.set(type, entry);
		byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
	}
	const sortedTypes = [...byType.entries()].sort((a, b) => b[1].count - a[1].count || byKeyAsc(a[0], b[0]));
	const shownTypes = sortedTypes.slice(0, REJECTION_SUMMARY_MAX_TYPES);
	const restTypes = sortedTypes.slice(REJECTION_SUMMARY_MAX_TYPES);

	lines.push(
		`${REJECTION_SUMMARY_LABEL}（type 別 → reason 別。合計は上の rejected ${formatInt(rejected)} 件と一致する${
			censored ? `。**全 ${formatInt(trim.total)} 件の内訳ではない**` : ''
		}）`,
	);
	for (const [type, entry] of shownTypes) {
		lines.push(`   - ${type} ${formatInt(entry.count)} 件: ${formatReasonParts(entry.reasons)}`);
	}
	if (restTypes.length > 0) {
		const restCount = restTypes.reduce((sum, [, entry]) => sum + entry.count, 0);
		lines.push(`   - （他 ${formatInt(restTypes.length)} 種別）${formatInt(restCount)} 件`);
	}

	// type が 1 種別しかないときは出さない（type 行がそのまま横断合計になる）。
	if (byType.size > 1) {
		lines.push(
			`${REJECTION_CROSS_TOTAL_LABEL}（type を跨いで reason だけで合算。同じ reason でも type ごとに意味が違いうるので帰属は上の type 別行で見る。合計は上の rejected ${formatInt(
				rejected,
			)} 件と一致する${censored ? `。**全 ${formatInt(trim.total)} 件の内訳ではない**` : ''}）`,
		);
		lines.push(`   - ${formatReasonParts(byReason)}`);
	}
	return lines;
}

// type 行と横断合計行で共有する。畳み方が 2 通りあると、どちらかだけ合計が合わなくなる。
function formatReasonParts(reasons: ReadonlyMap<string, number>): string {
	const sorted = [...reasons.entries()].sort((a, b) => b[1] - a[1] || byKeyAsc(a[0], b[0]));
	const parts = sorted.slice(0, REJECTION_SUMMARY_MAX_REASONS).map(([reason, n]) => `${reason} ${formatInt(n)}`);
	const rest = sorted.slice(REJECTION_SUMMARY_MAX_REASONS);
	if (rest.length > 0) {
		const restCount = rest.reduce((sum, [, n]) => sum + n, 0);
		parts.push(`他 ${formatInt(rest.length)} 種 ${formatInt(restCount)}`);
	}
	return parts.join(' / ');
}

export function formatDebugView(
	hdr: string,
	meta: PatternMeta,
	_pats: PatternEntry[],
	res: PatternResult,
	tz: string = 'Asia/Tokyo',
	// 新しい表示行は末尾に足す。positional 呼び出しがテストだけで 30 箇所超あり、先頭寄りに入れると黙ってずれる。
	effectiveParamsLine: string = '',
	type: string = '1day',
): McpResponse {
	const swings: SwingDebug[] = Array.isArray(meta?.debug?.swings) ? meta.debug.swings : [];
	const cands: CandidateDebug[] = Array.isArray(meta?.debug?.candidates) ? meta.debug.candidates : [];
	const reductionLine = buildReductionLine(meta);

	const swingLines = swings.map((s) => {
		// intraday では時刻まで出す（#200）。1hour 等は 24 本が同じ日付ラベルに潰れる。
		const dateStr = s.isoTime ? toDateOrTime(s.isoTime, tz, type) : 'n/a';
		return `- ${s.kind} idx=${s.idx} price=${Math.round(Number(s.price)).toLocaleString('ja-JP')} (${dateStr})`;
	});

	const candLines = cands.map((c, i: number) => {
		const tag = c.accepted ? '✅' : '❌';
		const reason = c.accepted ? (c.reason ? ` (${c.reason})` : '') : c.reason ? ` [${c.reason}]` : '';
		// ここが status / breakoutDirection の唯一の解決点（formatCandidateDetails 側では出さない）。
		const status = c.status ?? (c.details?.status as string | undefined);
		// null は「未ブレイクと判定した」という答えなので、?? ではなくキーの有無だけで分岐する。
		const dir = c.breakoutDirection !== undefined ? c.breakoutDirection : breakDirectionFromDetails(c.details);
		const statusStr = status ? ` status=${status}` : '';
		// 方向が無いときは null と書いても情報が増えないので行ごと出さない。
		const dirStr = dir ? ` breakoutDirection=${dir}` : '';
		const pts = Array.isArray(c.points)
			? c.points.map((p) => `${p.role}@${p.idx}:${Math.round(Number(p.price)).toLocaleString('ja-JP')}`).join(', ')
			: '';
		const indices = Array.isArray(c.indices) ? ` indices=[${c.indices.join(',')}]` : '';
		const detailsStr = formatCandidateDetails(c);
		return `${i + 1}. ${tag} ${c.type}${reason}${statusStr}${dirStr}${indices}${pts ? `\n   ${pts}` : ''}${detailsStr}`;
	});

	// swings は先頭から残すので落ちるのは直近側で、candidates とは落ちる側が逆になる（#180）。
	const swingsNote = formatTrimNote(
		swings.length,
		meta?.debug?.swingsTotal,
		meta?.debug?.swingsOmitted,
		'先頭から残すため省略分はすべて直近側のスイング',
	);
	// accepted が cap を超えると accepted も押し出されるので、返した配列に rejected が残っているかで文言を分ける（過小申告はするが嘘はつかない）。
	const keptHasRejected = cands.some((c) => !c.accepted);
	const candsNote = formatTrimNote(
		cands.length,
		meta?.debug?.candidatesTotal,
		meta?.debug?.candidatesOmitted,
		keptHasRejected
			? 'accepted は全件残っているため省略分はすべて棄却理由'
			: 'accepted が cap を埋めており省略分に accepted も含まれうる',
	);

	const text = [
		hdr,
		// 階梯外の view だが、診断が目的である以上ここでこそ実効値が要る（#184 決定事項 3）。
		...(effectiveParamsLine ? [effectiveParamsLine] : []),
		...(reductionLine ? [reductionLine] : []),
		'',
		`【Swings】${swingsNote}`,
		swingLines.length ? swingLines.join('\n') : 'なし',
		'',
		`【Candidates】${candsNote}`,
		// 列挙より前に置く。長いリストを読み切る前に全体像が要る。
		...formatRejectionSummary(cands, meta?.debug?.candidatesTotal, meta?.debug?.candidatesOmitted),
		// ✅ の status は候補を組み立てた時点のもので、その後 invalid / expired になったかは candidates からは分からない。
		'❌ = 候補段階の棄却（status なし。理由は [reason]。includeInvalid では拾えない）',
		'✅ の status = 候補を組み立てた時点の状態。成立後に invalid/expired になったかは data.patterns 側で見る',
		candLines.length
			? candLines.join('\n')
			: // 候補ゼロは「この窓でどの検出器も候補を組めなかった」の意。
				'なし（この窓では要求種別の候補が 1 つも組まれていない。candidates は入力 patterns で絞り込まれる）',
	].join('\n');

	try {
		return {
			content: [{ type: 'text', text }],
			structuredContent: {
				data: { ...res?.data, candidates: cands },
				meta: res?.meta ?? {},
				ok: res?.ok ?? true,
				summary: res?.summary ?? hdr,
			} as Record<string, unknown>,
		};
	} catch {
		return { content: [{ type: 'text', text }], structuredContent: toStructured(res) };
	}
}

function buildIdxToIso(meta: PatternMeta): Record<number, string> {
	const map: Record<number, string> = {};
	try {
		const swings = meta?.debug?.swings;
		if (Array.isArray(swings)) {
			for (const s of swings) {
				const i = Number(s?.idx);
				const t = String(s?.isoTime || '');
				if (Number.isFinite(i) && t) map[i] = t;
			}
		}
	} catch {
		/* noop */
	}
	return map;
}

function toDateOrTime(iso: string | undefined, tz: string, type: string): string {
	// 判定は lib/datetime.ts が単一ソース。ここは 'n/a' フォールバックを足すだけ。
	return formatDateOrTimeInTz(iso, tz, type) ?? 'n/a';
}

function buildPeriodLines(p: PatternEntry, legacyRange: string, tz: string, type: string): string[] {
	const hasNew = !!(p?.structureRange || p?.confirmation || p?.precedingTrend);
	if (!hasNew) return [`   - 期間: ${legacyRange}`];

	const lines: string[] = [];

	const ctxStart = p.precedingTrend?.start ?? p.structureRange?.start ?? p.range?.start;
	const confirmedDate = p.confirmation?.type === 'neckline_breakout' ? p.confirmation.date : undefined;
	const ctxEnd = confirmedDate ?? p.structureRange?.end ?? p.range?.end;
	if (ctxStart && ctxEnd) {
		const suffix = confirmedDate
			? '（先行トレンド〜ブレイク確認日）'
			: p.precedingTrend
				? '（先行トレンド〜構成終了）'
				: '';
		lines.push(`   - 文脈期間: ${toDateOrTime(ctxStart, tz, type)} ~ ${toDateOrTime(ctxEnd, tz, type)}${suffix}`);
	}

	if (p.structureRange) {
		lines.push(
			`   - 形成期間: ${toDateOrTime(p.structureRange.start, tz, type)} ~ ${toDateOrTime(p.structureRange.end, tz, type)}（構成点）`,
		);
	}

	if (p.confirmation?.type === 'neckline_breakout') {
		const priceStr = Number.isFinite(p.confirmation.price)
			? `${Math.round(p.confirmation.price).toLocaleString('ja-JP')}円`
			: 'n/a';
		lines.push(`   - ブレイク確認: ${toDateOrTime(p.confirmation.date, tz, type)}（${priceStr}）`);
	} else if (p.confirmation?.type === 'not_confirmed') {
		lines.push('   - ブレイク確認: なし（検出器ではネックライン突破を確認していません）');
	}

	if (p.precedingTrend) {
		const dirJa: Record<string, string> = {
			up: '上昇',
			down: '下降',
			sideways: '横ばい',
			insufficient_data: 'データ不足',
		};
		const t = p.precedingTrend;
		const sign = t.returnPct > 0 ? '+' : '';
		lines.push(
			`   - 先行トレンド: ${toDateOrTime(t.start, tz, type)} ~ ${toDateOrTime(t.end, tz, type)}（${dirJa[t.direction] || t.direction}、${sign}${t.returnPct}%、lookback=${t.lookbackBars}本）`,
		);
	}

	return lines.length > 0 ? lines : [`   - 期間: ${legacyRange}`];
}

// 判定は高安・報告値は終値なので両方を出す。片方だけだと出力から判定を検算できない（#125）。
function formatPivotPrices(pv: Pivot): string {
	const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
	const close = Number(pv?.price);
	const extreme = Number(pv?.extremePrice);
	const basisLabel = pv?.kind === 'L' ? '安値' : '高値';
	if (!Number.isFinite(close)) return 'n/a';
	if (!Number.isFinite(extreme)) return `(${yen(close)})`;
	if (Math.round(close) === Math.round(extreme)) return `${basisLabel} ${yen(extreme)}（判定は${basisLabel}基準）`;
	return `終値 ${yen(close)} / ${basisLabel} ${yen(extreme)}（判定は${basisLabel}基準）`;
}

// 極値は高安・同水準は終値の混合基準なので、ヒゲだけの山2 を読み手が知る手段としてこの行を出す。分母は levelSpreadMetrics を使い、表示層で式を写さない（#245）。
function formatSecondExtremePositionLine(p: PatternEntry): string | null {
	const side = p?.type === 'double_top' ? 'top' : p?.type === 'double_bottom' ? 'bottom' : null;
	if (!side) return null;
	const pivots = p?.pivots;
	// >= 3 ではなく === 3。点数が変わったら b がネックライン定義点だという前提から検算し直す。
	if (!Array.isArray(pivots) || pivots.length !== 3) return null;
	const [a, b, c] = pivots;
	if (!a || !b || !c) return null;
	const necklinePrice = Number(b.price);
	const close = Number(c.price);
	const extreme = Number(c.extremePrice);
	if (!Number.isFinite(necklinePrice) || !Number.isFinite(close) || !Number.isFinite(extreme)) return null;
	const { heightAbs } = levelSpreadMetrics([a, c], [a, b, c]);
	if (heightAbs === null || !(heightAbs > 0)) return null;
	// 符号は価格の向き（+ が上）に固定する。closeGap の向きで符号を付けると種別で意味が反転する。
	const gapByPrice = (close - necklinePrice) / heightAbs;
	const wickShare = side === 'top' ? (extreme - close) / heightAbs : (close - extreme) / heightAbs;
	const label = side === 'top' ? '山2' : '谷2';
	// `formatPctFromRatio` は負値にだけ符号を付けるので、正のときだけ `+` を補う。
	const sign = gapByPrice > 0 ? '+' : '';
	return `   - ${label} の位置: 終値はネックラインの ${sign}${formatPctFromRatio(gapByPrice)}（パターン高さ比）/ ヒゲ ${formatPctFromRatio(wickShare)}`;
}

// kind から役割を導出しない（形成中 H&S は左肩と頭が同じ kind）。形成中 H&S の 4 点は完成版 5 点の先頭 4 点ではないので、点数ごとに別エントリを置く（#234）。
const PIVOT_ROLE_LABELS: Readonly<Record<string, readonly string[]>> = {
	'triple_top:5': ['山1', '谷1', '山2', '谷2', '山3'],
	'triple_top:4': ['山1', '谷1', '山2', '谷2'],
	'triple_bottom:5': ['谷1', '山1', '谷2', '山2', '谷3'],
	'triple_bottom:4': ['谷1', '山1', '谷2', '山2'],
	'head_and_shoulders:5': ['左肩', '谷1', '頭', '谷2', '右肩'],
	'head_and_shoulders:4': ['左肩', '頭', '谷（頭後）', '右肩(暫定)'],
	'inverse_head_and_shoulders:5': ['左肩', '山1', '頭', '山2', '右肩'],
	'inverse_head_and_shoulders:4': ['左肩', '頭', '山（頭後）', '右肩(暫定)'],
};

// double 2 型だけは点数で引かない。点数を鍵にすると pivots の構成が変わった瞬間に表示が黙って消える。
function pivotRoleLabels(type: string, pivotCount: number): readonly string[] | null {
	if (type === 'double_top') return ['山1', '谷', '山2'];
	if (type === 'double_bottom') return ['谷1', '山', '谷2'];
	return PIVOT_ROLE_LABELS[`${type}:${pivotCount}`] ?? null;
}

// last と zone を 1 つの表に同居させる（分けると片方だけ埋め忘れて混線した文が出る）。side='top' のゾーンは山側なので、理由コード名のまま「谷ゾーン」と書かない（#286）。
const REVERSAL_STATUS_WORDS: Readonly<Record<string, { last: string; zone: '山' | '谷' }>> = {
	double_top: { last: '山2', zone: '山' },
	double_bottom: { last: '谷2', zone: '谷' },
	triple_top: { last: '山3', zone: '山' },
	triple_bottom: { last: '谷3', zone: '谷' },
	head_and_shoulders: { last: '右肩', zone: '山' },
	inverse_head_and_shoulders: { last: '右肩', zone: '谷' },
};

const CONTINUATION_STATUS_TYPES: ReadonlySet<string> = new Set([
	'triangle_ascending',
	'triangle_descending',
	'triangle_symmetrical',
	'falling_wedge',
	'rising_wedge',
	'bull_flag',
	'bear_flag',
	'bull_pennant',
	'bear_pennant',
]);

const STATUS_JA: Readonly<Record<string, string>> = {
	forming: '形成中',
	near_completion: 'ほぼ完成',
	completed: '完成（ブレイクアウト確認済み）',
	invalid: '無効',
	expired: '期限切れ',
};

// 表に無いコードには日本語を当てない（#286）。新しい理由コードを検出器に足したらここにも足す（網羅はテストが固定している）。
function invalidReasonJa(reason: string, type: string): string | null {
	const words = REVERSAL_STATUS_WORDS[type];
	const last = words?.last ?? '最終構成点';
	switch (reason) {
		case 're_entered_trough_zone':
			// 種別が引けないときは方向を持たない言い回しに落とす（「山」「谷」を推測しない）。
			return words
				? `${last} の確定後、突破前に${words.zone}ゾーンへ戻った`
				: '最終構成点の確定後、突破前に最終構成点のゾーンへ戻った';
		case 'peak_after_last_pivot':
			return `${last} の後に別の山を作ってから割った`;
		case 'trough_after_last_pivot':
			return `${last} の後に別の谷を作ってから抜けた`;
		case 'forming_expired':
			return '突破確認窓を過ぎてもネックラインを突破しなかった';
		case BREAKOUT_AGAINST_EXPECTATION:
			// 継続系では words 由来の語（山2 / 谷3 / 右肩）を混ぜない。存在しない構造を名乗ることになる（#291）。
			return '期待と逆方向にブレイク';
		default:
			return null;
	}
}

// 同じ near_completion が系統で別の事実を指すので種別で分ける。
function nearCompletionJa(type: string): string {
	if (REVERSAL_STATUS_WORDS[type]) return 'ほぼ完成（構造成立・ネックライン未突破）';
	if (CONTINUATION_STATUS_TYPES.has(type)) return 'ほぼ完成（apex接近）';
	return 'ほぼ完成';
}

// invalidReason があれば必ずコードを併記する。structuredContent は LLM から見えないので、content に出さないと理由が届かない。
export function formatStatusLine(p: Pick<PatternEntry, 'status' | 'invalidReason' | 'type'>): string | null {
	const status = p?.status;
	if (!status) return null;
	const base = STATUS_JA[status];
	// 未知の status は生の値をそのまま出す（誤った日本語を当てない）。
	if (!base) return `   - 状態: ${status}`;

	const type = String(p?.type ?? '');
	if (status === 'near_completion') return `   - 状態: ${nearCompletionJa(type)}`;
	if (status === 'invalid' || status === 'expired') {
		const reason = p?.invalidReason;
		if (!reason) return `   - 状態: ${base}`;
		const ja = invalidReasonJa(reason, type);
		return `   - 状態: ${base}（${ja ? `${ja}: ` : ''}${reason}）`;
	}
	return `   - 状態: ${base}`;
}

export function formatPatternLine(
	p: PatternEntry,
	idx: number,
	view: string,
	meta: PatternMeta,
	tz: string = 'Asia/Tokyo',
	type: string = '1day',
): string {
	const name = String(p?.type || 'unknown');
	const conf = p?.confidence != null ? Number(p.confidence).toFixed(2) : 'n/a';
	const range = p?.range ? `${toDateOrTime(p.range.start, tz, type)} ~ ${toDateOrTime(p.range.end, tz, type)}` : 'n/a';
	const periodLines = buildPeriodLines(p, range, tz, type);

	const confNum = Number(p?.confidence ?? NaN);
	let lowConfWarning: string | null = null;
	if (Number.isFinite(confNum) && confNum < 0.6) {
		lowConfWarning =
			confNum < 0.3
				? '   - ⚠️ 信頼度: 非常に低い（形状不十分・除外候補レベル、単独判断不可）'
				: '   - ⚠️ 信頼度: 低い（形状不十分・単独判断不可、他指標と必ず併用）';
	}

	let priceRange: string | null = null;
	if (Array.isArray(p?.pivots) && p.pivots.length) {
		const prices = p.pivots.map((v) => Number(v?.price)).filter(Number.isFinite);
		if (prices.length)
			priceRange = `${Math.min(...prices).toLocaleString('ja-JP')}円 - ${Math.max(...prices).toLocaleString('ja-JP')}円`;
	}

	let neckline: string | null = null;
	if (Array.isArray(p?.neckline) && p.neckline.length === 2) {
		const [a, b] = p.neckline;
		const y1 = Number(a?.y),
			y2 = Number(b?.y);
		if (Number.isFinite(y1) && Number.isFinite(y2)) {
			neckline =
				y1 === y2
					? `${y1.toLocaleString('ja-JP')}円（水平）`
					: `${y1.toLocaleString('ja-JP')}円 → ${y2.toLocaleString('ja-JP')}円`;
		}
	}

	const idxToIso = buildIdxToIso(meta);

	const pivotLines: string[] = [];
	if ((view === 'full' || view === 'debug') && Array.isArray(p?.pivots) && p.pivots.length >= 3) {
		const pivs = p.pivots;
		const roleLabels = pivotRoleLabels(String(p?.type ?? ''), pivs.length);
		// roleLabels.length で回す。点数と食い違ったまま添字で引くと別の役割のラベルを黙って貼る。
		if (roleLabels) {
			for (let i = 0; i < roleLabels.length; i++) {
				const pv = pivs[i];
				if (!pv) continue;
				const d = idxToIso[Number(pv.idx)] || '';
				const date = toDateOrTime(d || undefined, tz, type);
				pivotLines.push(`   - ${roleLabels[i]}: ${date} ${formatPivotPrices(pv)}`);
			}
		}
	}

	let breakoutLine: string | null = null;
	try {
		if ((view === 'full' || view === 'debug') && p?.breakout?.idx != null) {
			const bidx = Number(p.breakout.idx);
			const bpx = Number(p.breakout.price);
			const bIso = idxToIso[bidx];
			const bdate = bIso ? toDateOrTime(String(bIso), tz, type) : 'n/a';
			const bprice = Number.isFinite(bpx) ? Math.round(bpx).toLocaleString('ja-JP') : 'n/a';
			breakoutLine = `   - ブレイク: ${bdate} (${bprice}円)`;
		}
	} catch {
		/* ignore */
	}

	const statusLine = formatStatusLine(p);

	// pivots.length では判定しない（#224 で構成点を足したとき length 条件が黙って注記を消した）。status === 'forming' だけで判定する。
	let formingTripleNote: string | null = null;
	if ((p?.type === 'triple_top' || p?.type === 'triple_bottom') && p?.status === 'forming') {
		const role = p.type === 'triple_top' ? '3 山目' : '3 谷目';
		formingTripleNote = `   - 注: ${role}は現在価格を暫定（未確定）。2 確定ピボット + 現在価格で評価しているため、参考材料として扱う`;
	}

	let outcomeLine: string | null = null;
	try {
		if (p?.breakoutDirection && p?.outcome) {
			const directionJa = p.breakoutDirection === 'up' ? '上方' : '下方';
			const outcomeJa = p.outcome === 'success' ? '成功' : '失敗';
			const expectedDirMap: Record<string, string | undefined> = {
				falling_wedge: '上方',
				rising_wedge: '下方',
				triangle_ascending: '上方',
				triangle_descending: '下方',
				bull_flag: '上方',
				bear_flag: '下方',
				bull_pennant: '上方',
				bear_pennant: '下方',
			};
			const expectedDir = p.type ? expectedDirMap[p.type] : undefined;
			const meaningMap: Record<string, Record<string, string>> = {
				falling_wedge: { success: '強気転換', failure: '上方転換シナリオ無効化' },
				rising_wedge: { success: '弱気転換', failure: '下方転換シナリオ無効化' },
				triangle_ascending: { success: '上方ブレイク（強気）', failure: '下方ブレイク（弱気転換）' },
				triangle_descending: { success: '下方ブレイク（弱気）', failure: '上方ブレイク（強気転換）' },
				bull_flag: { success: 'トレンド継続（強気）', failure: 'ダマシ（弱気転換）' },
				bear_flag: { success: 'トレンド継続（弱気）', failure: 'ダマシ（強気転換）' },
				bull_pennant: { success: 'トレンド継続（強気）', failure: 'ダマシ（弱気転換）' },
				bear_pennant: { success: 'トレンド継続（弱気）', failure: 'ダマシ（強気転換）' },
			};
			const meaning = (p.type && p.outcome ? meaningMap[p.type]?.[p.outcome] : undefined) || `${directionJa}ブレイク`;
			let dirLine = `   - ブレイク方向: ${directionJa}ブレイク`;
			if (expectedDir) dirLine += `（本来は${expectedDir}ブレイクが期待されるパターン）`;
			outcomeLine = `${dirLine}\n   - パターン結果: ${outcomeJa}（${meaning}）`;
		}
	} catch {
		/* ignore */
	}

	let pennantLine: string | null = null;
	try {
		const isFlagFamily =
			p?.type === 'bull_flag' || p?.type === 'bear_flag' || p?.type === 'bull_pennant' || p?.type === 'bear_pennant';
		if (isFlagFamily) {
			const parts: string[] = [];
			if (p.poleDirection) parts.push(`フラッグポール方向: ${p.poleDirection === 'up' ? '上昇' : '下降'}`);
			if (p.priorTrendDirection)
				parts.push(
					`先行トレンド: ${p.priorTrendDirection === 'bullish' ? '強気（上昇トレンド）' : '弱気（下降トレンド）'}`,
				);
			if (p.flagpoleHeight != null)
				parts.push(`フラッグポール値幅: ${Math.round(Number(p.flagpoleHeight)).toLocaleString('ja-JP')}円`);
			if (p.poleStartDate && p.poleEndDate && p.poleChangePct != null) {
				const psd = toDateOrTime(p.poleStartDate, tz, type);
				const ped = toDateOrTime(p.poleEndDate, tz, type);
				const sign = p.poleChangePct >= 0 ? '+' : '';
				const pctStr = `${sign}${(p.poleChangePct * 100).toFixed(1)}%`;
				const barsStr = p.poleBars ? `, ${p.poleBars}本` : '';
				parts.push(`旗竿期間: ${psd} ~ ${ped}（${pctStr}${barsStr}）`);
			}
			if (p.poleATRMult != null) {
				parts.push(`旗竿 ATR 倍率: ${p.poleATRMult.toFixed(2)}x`);
			}
			if (p.flagUpperSlope != null && p.flagLowerSlope != null) {
				parts.push(`チャネル傾き: 上限=${p.flagUpperSlope.toFixed(2)}, 下限=${p.flagLowerSlope.toFixed(2)}（円/本）`);
			}
			if (p.spreadAvg != null && p.spreadStability != null) {
				const stabPct = (p.spreadStability * 100).toFixed(0);
				parts.push(`平均チャネル幅: ${Math.round(p.spreadAvg).toLocaleString('ja-JP')}円（平行度: ${stabPct}%）`);
			}
			if (p.expectedBreakoutDirection) {
				parts.push(`期待ブレイク方向: ${p.expectedBreakoutDirection === 'up' ? '上方' : '下方'}`);
			}
			if (p.retracementRatio != null) {
				const pctStr = (Number(p.retracementRatio) * 100).toFixed(0);
				parts.push(
					`戻し比率: ${pctStr}%${Number(p.retracementRatio) > 0.38 ? '（高め — トライアングル寄り）' : '（正常範囲）'}`,
				);
			}
			if (p.isTrendContinuation !== undefined)
				parts.push(`トレンド継続: ${p.isTrendContinuation ? 'はい（成功）' : 'いいえ（ダマシ）'}`);
			if (parts.length) pennantLine = parts.map((s) => `   - ${s}`).join('\n');
		}
	} catch {
		/* ignore */
	}

	let diagramBlock: string | null = null;
	try {
		if ((view === 'full' || view === 'detailed') && p?.structureDiagram?.svg) {
			const diagram = p.structureDiagram;
			const id = String(diagram?.artifact?.identifier || 'pattern-diagram');
			const title = String(diagram?.artifact?.title || 'パターン構造図');
			diagramBlock = [
				'--- Structure Diagram (SVG) ---',
				`identifier: ${id}`,
				`title: ${title}`,
				'type: image/svg+xml',
				'',
				String(diagram.svg),
			].join('\n');
		}
	} catch {
		/* noop */
	}

	// ターゲット行は breakoutTarget の有無で握り潰さない。no_target は breakoutTarget が必ず無いときの申告なので、価格行のガードに入れるとその経路だけが消える。
	let targetLine: string | null = null;
	const progressLine = formatTargetProgressLine(p, { formatDate: (iso) => toDateOrTime(iso, tz, type) });
	if (p?.breakoutTarget != null) {
		const methodJa: Record<string, string> = {
			flagpole_projection: 'フラッグポール値幅投影',
			pattern_height: 'パターン高さ投影',
			neckline_projection: 'ネックライン投影',
		};
		targetLine = `   - ターゲット価格: ${Math.round(Number(p.breakoutTarget)).toLocaleString('ja-JP')}円（${(p.targetMethod && methodJa[p.targetMethod]) || p.targetMethod}）`;
		if (progressLine) targetLine += `\n${progressLine}`;
	} else if (progressLine) {
		targetLine = progressLine;
	}

	// strict 由来には何も付けない。「印が無い = strict」は 検出経路: 行が件数で裏づける。
	const fallbackTag = typeof p?._fallback === 'string' && p._fallback.trim() ? ` [${p._fallback.trim()}]` : '';

	const lines = [
		`${idx + 1}. ${name} (パターン整合度: ${conf})${fallbackTag}`,
		lowConfWarning,
		...periodLines,
		statusLine,
		formingTripleNote,
		priceRange ? `   - 価格範囲: ${priceRange}` : null,
		...(pivotLines.length ? pivotLines : []),
		formatStructureGateSkipLine(p?.structureGate?.skipped),
		...formatTriplePositionLines(p?.type, p?.pivots),
		// view で分岐しない。軽い view でも「山2 がヒゲだけ」を LLM が読めるべきなので全 view に出す。
		formatSecondExtremePositionLine(p),
		neckline ? `   - ${p?.trendlineLabel || 'ネックライン'}: ${neckline}` : null,
		breakoutLine,
		outcomeLine,
		targetLine,
		pennantLine,
		diagramBlock,
	].filter(Boolean);
	return lines.join('\n');
}

export function formatSummaryView(
	hdr: string,
	pats: PatternEntry[],
	periodBlock: string,
	typeSummary: string,
	patterns: string[] | undefined,
	includeForming: boolean | undefined,
	res: PatternResult,
	_tz: string = 'Asia/Tokyo',
	effectiveParamsLine: string = '',
): McpResponse {
	const now = Date.now();
	const within = (ms: number) =>
		pats.filter((p) => Number.isFinite(toTs(p?.range?.end)) && now - toTs(p.range?.end) <= ms).length;
	const in30 = within(30 * 86400000);
	const in90 = within(90 * 86400000);
	const formingHint = includeForming ? '' : '\n※形成中は includeForming=true を指定してください。';
	const routeLine = buildDetectionRouteLine(pats);
	const reductionLine = buildReductionLine(res?.meta as PatternMeta | undefined);
	const text = `${hdr}（${typeSummary || '分類なし'}、直近30日: ${in30}件、直近90日: ${in90}件）\n${periodBlock ? `${periodBlock}\n` : ''}${effectiveParamsLine ? `${effectiveParamsLine}\n` : ''}${routeLine ? `${routeLine}\n` : ''}${reductionLine ? `${reductionLine}\n` : ''}検討パターン: ${patterns?.length ? patterns.join(', ') : '既定セット'}${formingHint}\n詳細は structuredContent.data.patterns を参照。`;
	return { content: [{ type: 'text', text }], structuredContent: toStructured(res) };
}

export function formatFullView(
	hdr: string,
	pats: PatternEntry[],
	periodBlock: string,
	typeSummary: string,
	meta: PatternMeta,
	res: PatternResult,
	tz: string = 'Asia/Tokyo',
	effectiveParamsLine: string = '',
	type: string = '1day',
): McpResponse {
	const body = pats.map((p, i) => formatPatternLine(p, i, 'full', meta, tz, type)).join('\n\n');
	const overlayNote = res?.data?.overlays
		? '\n\nチャート連携: structuredContent.data.overlays を render_chart_svg.overlays に渡すと注釈/範囲を描画できます。'
		: '';
	const trustNote =
		'\n\nパターン整合度について（構成点の水準の揃い方・戻り率・ブレイク品質・期間から算出。軸の構成は種別で異なる）:\n  0.8以上 = 理想的な形状（教科書的パターン）\n  0.7-0.8 = 標準的な形状（他指標と併用推奨）\n  0.6-0.7 = やや不明瞭（慎重に判断）\n  0.6未満 = 形状不十分\n  ※ status=forming は最終構成点が未確定のため、整合度に関わらず「参考材料」として扱う';
	const routeLine = buildDetectionRouteLine(pats);
	const reductionLine = buildReductionLine(meta);
	const text = `${hdr}（${typeSummary || '分類なし'}）\n${periodBlock ? `${periodBlock}\n` : ''}${effectiveParamsLine ? `${effectiveParamsLine}\n` : ''}${routeLine ? `${routeLine}\n` : ''}${reductionLine ? `${reductionLine}\n` : ''}\n【検出パターン（全件）】\n${body}${overlayNote}${trustNote}`;
	return { content: [{ type: 'text', text }], structuredContent: toStructured(res) };
}

/** slice の件数とトリム申告行の閾値判定の両方が参照する。 */
const DETAILED_VIEW_PATTERN_LIMIT = 5;

export function formatDetailedView(
	hdr: string,
	pats: PatternEntry[],
	periodBlock: string,
	typeSummary: string,
	meta: PatternMeta,
	patterns: string[] | undefined,
	res: PatternResult,
	tz: string = 'Asia/Tokyo',
	effectiveParamsLine: string = '',
	type: string = '1day',
): McpResponse {
	const top = pats.slice(0, DETAILED_VIEW_PATTERN_LIMIT);
	const body = top.length ? top.map((p, i) => formatPatternLine(p, i, 'detailed', meta, tz, type)).join('\n\n') : '';
	// pats.length < 上限 のときは行ごと出さない（省略が起こり得ない）。ちょうど上限のときだけ cap で切られたかの区別がつかないので明示する（#196）。
	const patternsNote =
		pats.length >= DETAILED_VIEW_PATTERN_LIMIT
			? formatTrimNote(top.length, pats.length, undefined, '全件は view=full')
			: '';

	let none = '';
	if (!top.length) {
		const resSummary = String(res?.summary ?? '');
		if (resSummary === 'insufficient data') {
			none = `\n${resSummary}`;
		} else {
			// 入力値へフォールバックしない。実効値が無いときは数値を主張しない（#184）。
			const effTol = meta?.effective_params?.tolerancePct?.value;
			// 緩める / 締めるの基準は実効値。
			const loosenHint = Number.isFinite(effTol as number)
				? `・緩めるなら tolerancePct に実効値 ${effTol} より大きい値を指定してください（上限 0.1）。${effTol} 以下は締める方向です（スキーマ既定値 0.04 は sentinel なので時間軸オート値に戻ります）`
				: '・緩めるなら tolerancePct を実効値より大きい値に上げてください（上限 0.1。実効値は上の実効パラメータ行を参照）。スキーマ既定値 0.04 は sentinel なので時間軸オート値に置換されます';
			none = `\nパターンは検出されませんでした。\n・検討パターン: ${patterns?.length ? patterns.join(', ') : '既定セット'}\n${loosenHint}`;
		}
	}

	const overlayNote = res?.data?.overlays
		? '\n\nチャート連携: structuredContent.data.overlays を render_chart_svg.overlays に渡すと注釈/範囲を描画できます。'
		: '';
	const trustNote =
		'\n\nパターン整合度について（構成点の水準の揃い方・戻り率・ブレイク品質・期間から算出。軸の構成は種別で異なる）:\n  0.8以上 = 理想的な形状（教科書的パターン）\n  0.7-0.8 = 標準的な形状（他指標と併用推奨）\n  0.6-0.7 = やや不明瞭（慎重に判断）\n  0.6未満 = 形状不十分\n  ※ status=forming は最終構成点が未確定のため、整合度に関わらず「参考材料」として扱う';
	const usage = `\n\nusage_example:\n  step1: detect_patterns を実行\n  step2: structuredContent.data.overlays を取得\n  step3: render_chart_svg の overlays に渡す`;
	const routeLine = buildDetectionRouteLine(pats);
	const reductionLine = buildReductionLine(meta);
	const text = `${hdr}（${typeSummary || '分類なし'}）\n${periodBlock ? `${periodBlock}\n` : ''}${effectiveParamsLine ? `${effectiveParamsLine}\n` : ''}${routeLine ? `${routeLine}\n` : ''}${reductionLine ? `${reductionLine}\n` : ''}\n${top.length ? `【検出パターン】${patternsNote}\n${body}` : ''}${none}${overlayNote}${trustNote}${usage}`;
	return {
		content: [{ type: 'text', text }],
		structuredContent: {
			...res,
			usage_example: {
				step1: 'detect_patterns を実行',
				step2: 'data.overlays を取得',
				step3: 'render_chart_svg の overlays に渡す',
			},
		},
	};
}
