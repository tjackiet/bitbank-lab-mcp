/**
 * detectPatternsHandler のビュー別フォーマッタ
 * debug / summary / full / detailed の4モードを分離
 *
 * 表示日付の TZ:
 * - すべての日付表示は呼び出し側が渡す `tz` 引数で整形する（既定 'Asia/Tokyo'）。
 * - 構造化データ（PatternEntry.range / structureRange / precedingTrend / confirmation.date 等）は
 *   後方互換のため UTC ISO 文字列のまま不変。
 */
import { formatDateInTz } from '../../lib/datetime.js';
import { formatFixed, formatInt, formatPctFromRatio, formatRounded } from '../../lib/formatter.js';
import { toStructured } from '../../lib/result.js';
import type { Pivot } from '../../tools/patterns/swing.js';
import type { PatternEntry } from '../../tools/patterns/types.js';
import type { McpResponse } from '../tool-definition.js';

/** デバッグスイング情報 */
interface SwingDebug {
	kind: string;
	idx: number;
	price: number;
	isoTime?: string;
}

/**
 * デバッグ候補エントリ。
 *
 * `status` / `breakoutDirection` は `CandDebugEntry`（`tools/patterns/types.ts`）が元から持つが、
 * **検出器によって置き場所が 2 系統に割れている**:
 * - top-level: `detect_wedges` の形成中パス、`detect_hs` の形成中成功エントリ（#155）
 * - `details` 配下: `detect_triangles` / `detect_pennants`（`details.status` / `details.breakout.direction`）
 *
 * 読む側（`candLines`）で両方を 1 回だけ解決する。置き場所の統一は検出器 6 ファイルに
 * 手が入るため別件（issue #160「やらないこと」）。
 */
interface CandidateDebug {
	type: string;
	accepted: boolean;
	reason?: string;
	status?: string;
	/** ブレイク方向。未ブレイクの候補では `null` が入りうる（`CandDebugEntry` と同じ形）。 */
	breakoutDirection?: string | null;
	indices?: number[];
	points?: Array<{ role: string; idx: number; price: number }>;
	details?: Record<string, unknown>;
}

/** パターン検出メタデータ */
interface PatternMeta {
	debug?: {
		swings?: SwingDebug[];
		candidates?: CandidateDebug[];
		/**
		 * cap トリムの申告（issue #180）。**`detect_patterns` の出力では常に埋まる**が、
		 * ハンドラを直接呼ぶ経路（テスト等）では欠けうるので optional。
		 * 欠損は「トリムが無かった」ではなく「件数が分からない」なので、表示側では
		 * 「省略なし」と書かずに行ごと落とす。
		 */
		candidatesTotal?: number;
		candidatesOmitted?: number;
		swingsTotal?: number;
		swingsOmitted?: number;
	};
	effective_params?: { tolerancePct?: number };
	[key: string]: unknown;
}

/**
 * flag / pennant 系パターンに付与される検証メタデータ。
 * `PatternEntry` には optional フィールドとして既に定義されているが、
 * view ハンドラからは `unknown` 経由のキャストでアクセスするためここでも形を保持する。
 */
interface FlagFamilyViewFields {
	poleStartDate?: string;
	poleEndDate?: string;
	poleChangePct?: number;
	poleBars?: number;
	poleATRMult?: number;
	flagUpperSlope?: number;
	flagLowerSlope?: number;
	spreadAvg?: number;
	spreadStability?: number;
	expectedBreakoutDirection?: 'up' | 'down';
}

/** パターン検出結果（res パラメータ用） */
interface PatternResult {
	ok?: boolean;
	data?: { patterns?: PatternEntry[]; overlays?: unknown };
	meta?: Record<string, unknown>;
	summary?: string;
	[key: string]: unknown;
}

/** fmtPointList 用のポイント */
interface IndexedPoint {
	index: number;
	price: number;
}

// ── helpers ──

const toTs = (s?: string): number => {
	try {
		return s ? Date.parse(s) : NaN;
	} catch {
		return NaN;
	}
};

const fmtPointList = (arr: unknown): string =>
	Array.isArray(arr) ? arr.map((p: IndexedPoint) => `[${p.index}:${formatRounded(p.price)}]`).join(', ') : 'n/a';

/** default ケースで details から列挙するフィールド数の上限（content 肥大の抑制）。 */
const GENERIC_DETAILS_MAX_FIELDS = 16;
/** ネストしたオブジェクト値を JSON 化するときの最大長。 */
const GENERIC_DETAILS_MAX_JSON = 160;

// ── shared ──

/**
 * 種別別件数集計
 * @param _tz 現状の集計ロジックでは TZ を使わないが、view formatter 群と signature を揃える。
 */
export function buildTypeSummary(pats: PatternEntry[], _tz: string = 'Asia/Tokyo'): string {
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

// ── debug view: candidate details ──

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

	// flag / pennant: pole 検証・チャネル幾何・spread 統計を構造化表示
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
		// Pole 検証結果
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
		// チャネル幾何 (spread)
		if (d?.spreadAvg != null || d?.spreadStability != null || d?.spreadStart != null) {
			const spAvg = d?.spreadAvg != null ? formatRounded(d.spreadAvg) : 'n/a';
			const spStab = d?.spreadStability != null ? `${(Number(d.spreadStability) * 100).toFixed(0)}%` : 'n/a';
			const spStart = d?.spreadStart != null ? formatRounded(d.spreadStart) : null;
			const spEnd = d?.spreadEnd != null ? formatRounded(d.spreadEnd) : null;
			const seg = spStart && spEnd ? `, start→end=${spStart}→${spEnd}` : '';
			lines.push(`   spread: avg=${spAvg}, stability=${spStab}${seg}`);
		}
		// 傾き
		if (d?.upperSlope != null || d?.lowerSlope != null) {
			const us = d?.upperSlope != null ? Number(d.upperSlope).toFixed(4) : 'n/a';
			const ls = d?.lowerSlope != null ? Number(d.lowerSlope).toFixed(4) : 'n/a';
			const conv = d?.convergenceRatio != null ? Number(d.convergenceRatio).toFixed(3) : 'n/a';
			lines.push(`   slopes: upper=${us}, lower=${ls}, convergenceRatio=${conv}`);
		}
		// R²
		if (d?.r2Upper != null || d?.r2Lower != null) {
			const r2U = d?.r2Upper != null ? Number(d.r2Upper).toFixed(3) : 'n/a';
			const r2L = d?.r2Lower != null ? Number(d.r2Lower).toFixed(3) : 'n/a';
			lines.push(`   r2: upper=${r2U}, lower=${r2L}`);
		}
		// 期待ブレイク方向
		if (d?.expectedBreakoutDirection) {
			lines.push(`   expectedBreakoutDirection: ${d.expectedBreakoutDirection}`);
		}
		// dedup_summary 特殊
		if (reason === 'dedup_summary') {
			lines.push(
				`   dedup: before=${formatInt(d?.beforeDedup)}, after=${formatInt(d?.afterDedup)}, removed=${formatInt(d?.removed)}`,
			);
		}
		// その他 reject 系の補足
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
			// `status` はここで出さない。triangle / pennant は `details.status` に、wedge / 形成中 H&S は
			// top-level に置いており、置き場所ごとに別行が出ると同じ事実が 2 通りの書式で散る。
			// 解決は `candLines` の 1 箇所に寄せてヘッダ行へ出す（issue #160）。
			lines.push(`   touchCount: ${formatInt(d.touchCount)}, confidence: ${d?.confidence ?? 'n/a'}`);
		}
		return lines.length > 0 ? `\n${lines.join('\n')}` : '\n   details: (no fields)';
	}

	// default: 専用フォーマッタを持たない reason（r2_below_threshold / insufficient_touches /
	// score_below_threshold / containment_violated 等、棄却理由の大半がここに来る）。
	//
	// 以前はここで `spreadStart` / `spreadEnd` / `hiSlope` / `loSlope` を決め打ちで読んでいたが、
	// **この 4 つを details に入れる検出器は 1 つも無い**（`spreadStart` を持つ reason は
	// すべて上の flagReasons 側で処理される）。結果、どの候補でも `spread: n/a` としか出ず、
	// 実際に入っている診断値（r2 / touches / score / ratio …）は 1 つも表示されていなかった。
	// 存在しないフィールドを名指しするのをやめ、details が実際に持つフィールドを列挙する。
	return formatGenericDetails(d);
}

/** details に載っている値を 1 行 1 フィールドで列挙する（default ケース用）。 */
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

/** details の 1 値を表示用に整形する。数値は桁を潰さず、オブジェクトは短縮 JSON にする。 */
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

/**
 * `details` 側に置かれたブレイク記録から方向を読む。系統は 2 つある。
 *
 * - `details.breakout` — triangle / pennant。未ブレイクは `breakout: null`
 * - `details.breakInfo` — wedge の完成済みパス（`reason: 'revamped_ok'`）。未ブレイクは `breakInfo: null`
 *
 * **キーが在ること自体が「この検出器が答えた」印**なので、先に見つかった系統で打ち切り、
 * 値が `null`（＝未ブレイク）でも次の系統へフォールバックしない。top-level の `null` を
 * 欠損と畳まないのと同じ理由で、畳むと「未ブレイクなのに方向がある」行が出る。
 * 検出器が違うので実際に両方を持つエントリは無いが、優先順を暗黙にしない。
 *
 * @returns 方向 / 答えはあるが方向が無いなら `null` / どちらのキーも無いなら `undefined`
 */
function breakDirectionFromDetails(details?: Record<string, unknown>): string | null | undefined {
	if (!details) return undefined;
	for (const key of ['breakout', 'breakInfo'] as const) {
		if (!(key in details)) continue;
		return (details[key] as { direction?: string | null } | null | undefined)?.direction ?? null;
	}
	return undefined;
}

/**
 * cap トリムの申告行（issue #180）。`【Swings】` / `【Candidates】` の見出しに連結する。
 *
 * 配列を黙って切り詰めると、受け取った 200 件が全件なのか一部なのか呼び出し側から判別できない。
 * **LLM は `structuredContent` を読まない**（`.claude/rules/tools.md`）ので、`meta.debug` に
 * 件数を足すだけでは目的を達しない。ここが唯一のチャネル。
 *
 * - `total` が数値でないとき（申告前の実装 / 手組みの meta）は**行ごと出さない**。
 *   件数が分からない状態で「省略なし」と書くと、まさに本 issue の嘘を再導入することになる。
 * - 省略 0 でも `省略なし` を明示する。`200 件` だけだと飽和しているのか偶然 200 なのか読めない。
 *
 * @param kept 実際に配列に入っている件数
 * @param total トリム前の総数（`meta.debug.*Total`）
 * @param omitted 申告された省略件数（`meta.debug.*Omitted`）。欠けていれば `total - kept` で補う
 * @param omittedNote 省略が起きているときだけ添える注記（何が落ちたのかの説明）
 */
function formatTrimNote(kept: number, total?: number, omitted?: number, omittedNote?: string): string {
	if (typeof total !== 'number' || !Number.isFinite(total)) return '';
	const dropped =
		typeof omitted === 'number' && Number.isFinite(omitted) ? Math.max(0, omitted) : Math.max(0, total - kept);
	const tail = dropped > 0 ? `${formatInt(dropped)} 件省略${omittedNote ? `。${omittedNote}` : ''}` : '省略なし';
	return ` ${formatInt(kept)} / 全 ${formatInt(total)} 件（${tail}）`;
}

export function formatDebugView(
	hdr: string,
	meta: PatternMeta,
	_pats: PatternEntry[],
	res: PatternResult,
	tz: string = 'Asia/Tokyo',
): McpResponse {
	const swings: SwingDebug[] = Array.isArray(meta?.debug?.swings) ? meta.debug.swings : [];
	const cands: CandidateDebug[] = Array.isArray(meta?.debug?.candidates) ? meta.debug.candidates : [];

	const swingLines = swings.map((s) => {
		// swing は日付のみで十分（任意の足の高安特定が用途）。時刻表示が必要なら toIsoWithTz に変更する。
		const dateStr = s.isoTime ? (formatDateInTz(Date.parse(s.isoTime), tz) ?? 'n/a') : 'n/a';
		return `- ${s.kind} idx=${s.idx} price=${Math.round(Number(s.price)).toLocaleString('ja-JP')} (${dateStr})`;
	});

	const candLines = cands.map((c, i: number) => {
		const tag = c.accepted ? '✅' : '❌';
		const reason = c.accepted ? (c.reason ? ` (${c.reason})` : '') : c.reason ? ` [${c.reason}]` : '';
		// status / breakoutDirection は検出器ごとに top-level と `details` に割れている（型注釈参照）。
		// **ここが唯一の解決点**。`formatCandidateDetails` 側では出さないので、書式は 1 通りに揃う。
		// `status` は `CandDebugEntry` 側が `string | undefined` で null を取らないため `??` でよい。
		const status = c.status ?? (c.details?.status as string | undefined);
		// `breakoutDirection` は `string | null` で、**`null` は「この検出器が未ブレイクと判定した」**
		// という値のある答え。`??` で書くと欠損と同じ扱いになり details 側に上書きされるので、
		// キーの有無（`undefined`）だけで分岐する。出力スキーマの `z.string().nullish()` は
		// 欠損と `null` を畳まないので、parse を通した後もこの区別は残る。
		const dir = c.breakoutDirection !== undefined ? c.breakoutDirection : breakDirectionFromDetails(c.details);
		const statusStr = status ? ` status=${status}` : '';
		// 未ブレイクは `null`（wedge 形成中）、`details.breakout: null`（triangle / pennant）、
		// `details.breakInfo: null`（wedge 完成済み）のいずれかで来る。
		// 「方向が無い」を `null` と書いても読み手に情報が増えないので、その場合は行ごと出さない。
		const dirStr = dir ? ` breakoutDirection=${dir}` : '';
		const pts = Array.isArray(c.points)
			? c.points.map((p) => `${p.role}@${p.idx}:${Math.round(Number(p.price)).toLocaleString('ja-JP')}`).join(', ')
			: '';
		const indices = Array.isArray(c.indices) ? ` indices=[${c.indices.join(',')}]` : '';
		const detailsStr = formatCandidateDetails(c);
		return `${i + 1}. ${tag} ${c.type}${reason}${statusStr}${dirStr}${indices}${pts ? `\n   ${pts}` : ''}${detailsStr}`;
	});

	// cap トリムの申告（#180）。見出しに直付けするのは、凡例の下に置くと候補行との間に
	// 埋もれるため。**`swings` は先頭から残す**ので落ちるのは直近側で、`candidates` とは
	// 落ちる側が逆になる（どちらを残すかの変更は #180 の対象外）。
	const swingsNote = formatTrimNote(
		swings.length,
		meta?.debug?.swingsTotal,
		meta?.debug?.swingsOmitted,
		'先頭から残すため省略分はすべて直近側のスイング',
	);
	const candsNote = formatTrimNote(
		cands.length,
		meta?.debug?.candidatesTotal,
		meta?.debug?.candidatesOmitted,
		'accepted 優先で残すため省略分はすべて棄却理由',
	);

	const text = [
		hdr,
		'',
		`【Swings】${swingsNote}`,
		swingLines.length ? swingLines.join('\n') : 'なし',
		'',
		`【Candidates】${candsNote}`,
		// ❌ は候補生成の時点での棄却で、status を持たないため includeInvalid では拾えない
		// （issue #149）。一度パターンとして成立してから無効化されたものは data.patterns 側で
		// status=invalid/expired として別に出る。
		// ✅ 側は #155 以降 status を持つ（形成中パスの成功エントリ等）が、これは**候補を組み立てた
		// 時点**の status であって、その後 invalid / expired になったかは candidates からは分からない。
		'❌ = 候補段階の棄却（status なし。理由は [reason]。includeInvalid では拾えない）',
		'✅ の status = 候補を組み立てた時点の状態。成立後に invalid/expired になったかは data.patterns 側で見る',
		candLines.length
			? candLines.join('\n')
			: // 候補ゼロは「この窓でどの検出器も候補を組めなかった」の意。
				// candidates は入力 `patterns` で絞られる（#124）ので、種別を指定して呼んだ場合は
				// 「他種別なら候補があったかもしれない」を読み手が区別できるよう明記する。
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

// ── pattern line formatter (shared by full / detailed) ──

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

/**
 * UTC ISO 文字列を、指定 tz の暦日 YYYY-MM-DD として整形する。
 * 値が空 / parse 失敗時は 'n/a' を返す。
 */
function toDateOnly(iso: string | undefined, tz: string): string {
	if (!iso) return 'n/a';
	const ms = Date.parse(iso);
	return formatDateInTz(ms, tz) ?? 'n/a';
}

/**
 * structureRange / confirmation / precedingTrend が揃っている場合に
 * 文脈期間 / 形成期間 / ブレイク確認 / 先行トレンド の行を組み立てる。
 * いずれも未設定の場合は legacy「期間」行をフォールバックとして返す。
 */
function buildPeriodLines(p: PatternEntry, legacyRange: string, tz: string): string[] {
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
		lines.push(`   - 文脈期間: ${toDateOnly(ctxStart, tz)} ~ ${toDateOnly(ctxEnd, tz)}${suffix}`);
	}

	if (p.structureRange) {
		lines.push(
			`   - 形成期間: ${toDateOnly(p.structureRange.start, tz)} ~ ${toDateOnly(p.structureRange.end, tz)}（構成点）`,
		);
	}

	if (p.confirmation?.type === 'neckline_breakout') {
		const priceStr = Number.isFinite(p.confirmation.price)
			? `${Math.round(p.confirmation.price).toLocaleString('ja-JP')}円`
			: 'n/a';
		lines.push(`   - ブレイク確認: ${toDateOnly(p.confirmation.date, tz)}（${priceStr}）`);
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
			`   - 先行トレンド: ${toDateOnly(t.start, tz)} ~ ${toDateOnly(t.end, tz)}（${dirJa[t.direction] || t.direction}、${sign}${t.returnPct}%、lookback=${t.lookbackBars}本）`,
		);
	}

	return lines.length > 0 ? lines : [`   - 期間: ${legacyRange}`];
}

/**
 * pivot の価格を「報告値」と「判定に使った極値」の両方で出す（issue #125）。
 *
 * `price` は終値、極値判定は high / low で行われている（`tools/patterns/swing.ts`）。
 * 片方だけ出すと出力から判定を検算できず、実際に外部レビューが
 * 「終値基準で極値を取っている＝ピボット抽出器のバグ」と誤読した経緯がある。
 * 両方が同値のとき（triangle_* の relaxed swing、ヒゲの無い足）は 1 つにまとめて出す。
 */
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

export function formatPatternLine(
	p: PatternEntry,
	idx: number,
	view: string,
	meta: PatternMeta,
	tz: string = 'Asia/Tokyo',
): string {
	const name = String(p?.type || 'unknown');
	const conf = p?.confidence != null ? Number(p.confidence).toFixed(2) : 'n/a';
	// range.start/end は UTC ISO のまま構造化データに残す。表示のみ tz で整形する。
	const range = p?.range ? `${toDateOnly(p.range.start, tz)} ~ ${toDateOnly(p.range.end, tz)}` : 'n/a';
	const periodLines = buildPeriodLines(p, range, tz);

	// 低 confidence の警告ラベル。confidence < 0.6 は形状不十分、< 0.3 は除外候補レベル。
	// 「重要」「強いシグナル」「参考材料」扱いを防ぐため明示的に警告する。
	const confNum = Number(p?.confidence ?? NaN);
	let lowConfWarning: string | null = null;
	if (Number.isFinite(confNum) && confNum < 0.6) {
		lowConfWarning =
			confNum < 0.3
				? '   - ⚠️ 信頼度: 非常に低い（形状不十分・除外候補レベル、単独判断不可）'
				: '   - ⚠️ 信頼度: 低い（形状不十分・単独判断不可、他指標と必ず併用）';
	}

	// price range
	let priceRange: string | null = null;
	if (Array.isArray(p?.pivots) && p.pivots.length) {
		const prices = p.pivots.map((v) => Number(v?.price)).filter(Number.isFinite);
		if (prices.length)
			priceRange = `${Math.min(...prices).toLocaleString('ja-JP')}円 - ${Math.max(...prices).toLocaleString('ja-JP')}円`;
	}

	// neckline
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

	// pivot detail lines (full/debug + double_top/double_bottom)
	const pivotLines: string[] = [];
	if ((view === 'full' || view === 'debug') && Array.isArray(p?.pivots) && p.pivots.length >= 3) {
		const pivs = p.pivots;
		const roleLabels =
			p.type === 'double_top' ? ['山1', '谷', '山2'] : p.type === 'double_bottom' ? ['谷1', '山', '谷2'] : null;
		if (roleLabels) {
			for (let i = 0; i < 3; i++) {
				const pv = pivs[i];
				if (!pv) continue;
				const d = idxToIso[Number(pv.idx)] || '';
				const date = toDateOnly(d || undefined, tz);
				pivotLines.push(`   - ${roleLabels[i]}: ${date} ${formatPivotPrices(pv)}`);
			}
		}
	}

	// breakout
	let breakoutLine: string | null = null;
	try {
		if ((view === 'full' || view === 'debug') && p?.breakout?.idx != null) {
			const bidx = Number(p.breakout.idx);
			const bpx = Number(p.breakout.price);
			const bIso = idxToIso[bidx];
			const bdate = bIso ? toDateOnly(String(bIso), tz) : 'n/a';
			const bprice = Number.isFinite(bpx) ? Math.round(bpx).toLocaleString('ja-JP') : 'n/a';
			breakoutLine = `   - ブレイク: ${bdate} (${bprice}円)`;
		}
	} catch {
		/* ignore */
	}

	// status
	let statusLine: string | null = null;
	if (p?.status) {
		const statusJa: Record<string, string> = {
			completed: '完成（ブレイクアウト確認済み）',
			invalid: '無効（期待と逆方向にブレイク）',
			forming: '形成中',
			near_completion: 'ほぼ完成（apex接近）',
		};
		statusLine = `   - 状態: ${statusJa[p.status] || p.status}`;
	}

	// forming triple: 3 点目が確定していないことを LLM に明示する。
	// 2 確定ピボットだけで構成されているため、pivots 配列だけ見ると 3 山構造を勘違いされる。
	let formingTripleNote: string | null = null;
	if (
		(p?.type === 'triple_top' || p?.type === 'triple_bottom') &&
		p?.status === 'forming' &&
		Array.isArray(p?.pivots) &&
		p.pivots.length === 2
	) {
		const role = p.type === 'triple_top' ? '3 山目' : '3 谷目';
		formingTripleNote = `   - 注: ${role}は現在価格を暫定（未確定）。2 確定ピボット + 現在価格で評価しているため、参考材料として扱う`;
	}

	// breakout direction & outcome
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
				pennant: p.poleDirection === 'up' ? '上方' : p.poleDirection === 'down' ? '下方' : undefined,
				bull_flag: '上方',
				bear_flag: '下方',
				bull_pennant: '上方',
				bear_pennant: '下方',
			};
			const expectedDir = p.type ? expectedDirMap[p.type] : undefined;
			const meaningMap: Record<string, Record<string, string>> = {
				falling_wedge: { success: '強気転換', failure: '弱気継続' },
				rising_wedge: { success: '弱気転換', failure: '強気継続' },
				triangle_ascending: { success: '上方ブレイク（強気）', failure: '下方ブレイク（弱気転換）' },
				triangle_descending: { success: '下方ブレイク（弱気）', failure: '上方ブレイク（強気転換）' },
				pennant: {
					success: `トレンド継続（${p.poleDirection === 'up' ? '強気' : '弱気'}）`,
					failure: `ダマシ（${p.poleDirection === 'up' ? '弱気転換' : '強気転換'}）`,
				},
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

	// flag / pennant fields (legacy 'pennant' + bull/bear flag/pennant)
	let pennantLine: string | null = null;
	try {
		const isFlagFamily =
			p?.type === 'pennant' ||
			p?.type === 'flag' ||
			p?.type === 'bull_flag' ||
			p?.type === 'bear_flag' ||
			p?.type === 'bull_pennant' ||
			p?.type === 'bear_pennant';
		if (isFlagFamily) {
			const parts: string[] = [];
			if (p.poleDirection) parts.push(`フラッグポール方向: ${p.poleDirection === 'up' ? '上昇' : '下降'}`);
			if (p.priorTrendDirection)
				parts.push(
					`先行トレンド: ${p.priorTrendDirection === 'bullish' ? '強気（上昇トレンド）' : '弱気（下降トレンド）'}`,
				);
			if (p.flagpoleHeight != null)
				parts.push(`フラッグポール値幅: ${Math.round(Number(p.flagpoleHeight)).toLocaleString('ja-JP')}円`);
			// pole の検証情報（bull/bear flag/pennant 用の新規フィールド）
			const pAny = p as PatternEntry & FlagFamilyViewFields;
			if (pAny.poleStartDate && pAny.poleEndDate && pAny.poleChangePct != null) {
				const psd = toDateOnly(pAny.poleStartDate, tz);
				const ped = toDateOnly(pAny.poleEndDate, tz);
				const sign = pAny.poleChangePct >= 0 ? '+' : '';
				const pctStr = `${sign}${(pAny.poleChangePct * 100).toFixed(1)}%`;
				const barsStr = pAny.poleBars ? `, ${pAny.poleBars}本` : '';
				parts.push(`旗竿期間: ${psd} ~ ${ped}（${pctStr}${barsStr}）`);
			}
			if (pAny.poleATRMult != null) {
				parts.push(`旗竿 ATR 倍率: ${pAny.poleATRMult.toFixed(2)}x`);
			}
			if (pAny.flagUpperSlope != null && pAny.flagLowerSlope != null) {
				parts.push(
					`チャネル傾き: 上限=${pAny.flagUpperSlope.toFixed(2)}, 下限=${pAny.flagLowerSlope.toFixed(2)}（円/本）`,
				);
			}
			if (pAny.spreadAvg != null && pAny.spreadStability != null) {
				const stabPct = (pAny.spreadStability * 100).toFixed(0);
				parts.push(`平均チャネル幅: ${Math.round(pAny.spreadAvg).toLocaleString('ja-JP')}円（平行度: ${stabPct}%）`);
			}
			if (pAny.expectedBreakoutDirection) {
				parts.push(`期待ブレイク方向: ${pAny.expectedBreakoutDirection === 'up' ? '上方' : '下方'}`);
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

	// structure diagram
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

	// target price
	let targetLine: string | null = null;
	if (p?.breakoutTarget != null) {
		const methodJa: Record<string, string> = {
			flagpole_projection: 'フラッグポール値幅投影',
			pattern_height: 'パターン高さ投影',
			neckline_projection: 'ネックライン投影',
		};
		targetLine = `   - ターゲット価格: ${Math.round(Number(p.breakoutTarget)).toLocaleString('ja-JP')}円（${(p.targetMethod && methodJa[p.targetMethod]) || p.targetMethod}）`;
		if (p?.targetReachedPct != null) {
			targetLine += `\n   - ターゲット進捗: ${p.targetReachedPct}%${Number(p.targetReachedPct) >= 100 ? '（到達済み）' : ''}`;
		}
	}

	const lines = [
		`${idx + 1}. ${name} (パターン整合度: ${conf})`,
		lowConfWarning,
		...periodLines,
		statusLine,
		formingTripleNote,
		priceRange ? `   - 価格範囲: ${priceRange}` : null,
		...(pivotLines.length ? pivotLines : []),
		neckline ? `   - ${p?.trendlineLabel || 'ネックライン'}: ${neckline}` : null,
		breakoutLine,
		outcomeLine,
		targetLine,
		pennantLine,
		diagramBlock,
	].filter(Boolean);
	return lines.join('\n');
}

// ── summary view ──

export function formatSummaryView(
	hdr: string,
	pats: PatternEntry[],
	periodBlock: string,
	typeSummary: string,
	patterns: string[] | undefined,
	includeForming: boolean | undefined,
	res: PatternResult,
	_tz: string = 'Asia/Tokyo',
): McpResponse {
	const now = Date.now();
	const within = (ms: number) =>
		pats.filter((p) => Number.isFinite(toTs(p?.range?.end)) && now - toTs(p.range!.end) <= ms).length;
	const in30 = within(30 * 86400000);
	const in90 = within(90 * 86400000);
	const formingHint = includeForming ? '' : '\n※形成中は includeForming=true を指定してください。';
	const text = `${hdr}（${typeSummary || '分類なし'}、直近30日: ${in30}件、直近90日: ${in90}件）\n${periodBlock ? `${periodBlock}\n` : ''}検討パターン: ${patterns?.length ? patterns.join(', ') : '既定セット'}${formingHint}\n詳細は structuredContent.data.patterns を参照。`;
	return { content: [{ type: 'text', text }], structuredContent: toStructured(res) };
}

// ── full view ──

export function formatFullView(
	hdr: string,
	pats: PatternEntry[],
	periodBlock: string,
	typeSummary: string,
	meta: PatternMeta,
	res: PatternResult,
	tz: string = 'Asia/Tokyo',
): McpResponse {
	const body = pats.map((p, i) => formatPatternLine(p, i, 'full', meta, tz)).join('\n\n');
	const overlayNote = res?.data?.overlays
		? '\n\nチャート連携: structuredContent.data.overlays を render_chart_svg.overlays に渡すと注釈/範囲を描画できます。'
		: '';
	const trustNote =
		'\n\nパターン整合度について（形状一致度・対称性・期間から算出）:\n  0.8以上 = 理想的な形状（教科書的パターン）\n  0.7-0.8 = 標準的な形状（他指標と併用推奨）\n  0.6-0.7 = やや不明瞭（慎重に判断）\n  0.6未満 = 形状不十分\n  ※ status=forming は最終構成点が未確定のため、整合度に関わらず「参考材料」として扱う';
	const text = `${hdr}（${typeSummary || '分類なし'}）\n${periodBlock ? `${periodBlock}\n` : ''}\n【検出パターン（全件）】\n${body}${overlayNote}${trustNote}`;
	return { content: [{ type: 'text', text }], structuredContent: toStructured(res) };
}

// ── detailed view (default) ──

export function formatDetailedView(
	hdr: string,
	pats: PatternEntry[],
	periodBlock: string,
	typeSummary: string,
	meta: PatternMeta,
	tolerancePct: number | undefined,
	patterns: string[] | undefined,
	res: PatternResult,
	tz: string = 'Asia/Tokyo',
): McpResponse {
	const top = pats.slice(0, 5);
	const body = top.length ? top.map((p, i) => formatPatternLine(p, i, 'detailed', meta, tz)).join('\n\n') : '';

	let none = '';
	if (!top.length) {
		const resSummary = String(res?.summary ?? '');
		if (resSummary === 'insufficient data') {
			none = `\n${resSummary}`;
		} else {
			const effTol = meta?.effective_params?.tolerancePct ?? tolerancePct ?? 'default';
			none = `\nパターンは検出されませんでした（tolerancePct=${effTol}）。\n・検討パターン: ${patterns?.length ? patterns.join(', ') : '既定セット'}\n・必要に応じて tolerance を 0.03-0.06 に緩和してください`;
		}
	}

	const overlayNote = res?.data?.overlays
		? '\n\nチャート連携: structuredContent.data.overlays を render_chart_svg.overlays に渡すと注釈/範囲を描画できます。'
		: '';
	const trustNote =
		'\n\nパターン整合度について（形状一致度・対称性・期間から算出）:\n  0.8以上 = 理想的な形状（教科書的パターン）\n  0.7-0.8 = 標準的な形状（他指標と併用推奨）\n  0.6-0.7 = やや不明瞭（慎重に判断）\n  0.6未満 = 形状不十分\n  ※ status=forming は最終構成点が未確定のため、整合度に関わらず「参考材料」として扱う';
	const usage = `\n\nusage_example:\n  step1: detect_patterns を実行\n  step2: structuredContent.data.overlays を取得\n  step3: render_chart_svg の overlays に渡す`;
	const text = `${hdr}（${typeSummary || '分類なし'}）\n${periodBlock ? `${periodBlock}\n` : ''}\n${top.length ? `【検出パターン】\n${body}` : ''}${none}${overlayNote}${trustNote}${usage}`;
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
