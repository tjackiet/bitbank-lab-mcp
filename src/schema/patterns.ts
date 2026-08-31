import { z } from 'zod';
import {
	BaseMetaSchema,
	BasePairInputSchema,
	CandleTypeEnum,
	FailResultSchema,
	toolResultSchema,
	VIEW_CONTRACT_NOTE,
} from './base.js';

// === Pattern Detection ===
/**
 * 出力 type — 検出結果として返される確定方向付きのパターン種別。
 * 'flag' / 'pennant' / 'triangle' のような umbrella alias は含めない。
 * 出力スキーマ・visualization_hints・debug.candidates.type に使用。
 */
const PATTERN_OUTPUT_TYPES = [
	'double_top',
	'double_bottom',
	'triple_top',
	'triple_bottom',
	'head_and_shoulders',
	'inverse_head_and_shoulders',
	'triangle_ascending',
	'triangle_descending',
	'triangle_symmetrical',
	'falling_wedge',
	'rising_wedge',
	'bull_flag',
	'bear_flag',
	'bull_pennant',
	'bear_pennant',
] as const;

/**
 * 入力フィルタ専用のエイリアス。これらは出力 type としては返されず、
 * リクエスト側で「方向不問でまとめて検出したい」場合のショートカット。
 * - 'flag'     → bull_flag + bear_flag
 * - 'pennant'  → bull_pennant + bear_pennant
 * - 'triangle' → triangle_ascending + triangle_descending + triangle_symmetrical
 */
const PATTERN_FILTER_ALIASES = ['flag', 'pennant', 'triangle'] as const;

export const PatternTypeEnum = z.enum(PATTERN_OUTPUT_TYPES);

/**
 * 入力フィルタ用 enum — 出力 type に加えて legacy umbrella alias も受け付ける。
 * DetectPatternsInputSchema.patterns と debug.candidates.type で使用。
 */
export const PatternFilterEnum = z.enum([...PATTERN_OUTPUT_TYPES, ...PATTERN_FILTER_ALIASES]);

export const DetectPatternsInputSchema = BasePairInputSchema.extend({
	type: CandleTypeEnum.optional().default('1day'),
	limit: z
		.number()
		.int()
		.min(20)
		.max(365)
		.optional()
		.default(90)
		.describe(
			'スキャン窓の本数。**直近 limit 本がそのまま検出器に渡る**（指標 warmup 分は含まない）。\n' +
				'スイング検出で窓の前後 swingDepth 本ずつがピボット候補から外れるため、' +
				'時間足の既定 swingDepth に対して小さすぎると構造上ほぼ何も検出できない' +
				'（日足の既定 swingDepth=6 では 23 本未満）。その場合は data.warnings に ' +
				'`limit_too_small_for_timeframe` を載せ、content 先頭にも警告行を出す。\n' +
				'逆に既定の 90 は「いま形成中〜完成直後のパターンを見る」ための窓なので、' +
				'**過去のパターンの統計（data.statistics の成功率 / 平均リターン）や aftermath を調べる用途では上げる**' +
				'（上限 365）。view=summary / detailed の content 量はほぼ変わらず、増えるのは API 呼び出し回数。',
		),
	patterns: z
		.array(PatternFilterEnum)
		.optional()
		.describe(
			[
				'Patterns to detect. Recommended params (guideline):',
				'- double_top/double_bottom: default (swingDepth=7, tolerancePct=0.04, minBarsBetweenSwings=5)',
				'- triple_top/triple_bottom: tolerancePct≈0.05',
				'- triangle_*: tolerancePct≈0.06',
				'- pennant: swingDepth≈5, minBarsBetweenSwings≈3',
				'- head_and_shoulders/inverse_head_and_shoulders: shoulder-level tolerance is tolerancePct ' +
					'(same "bigger = looser" meaning as other types); to loosen how much the head must stand out ' +
					'above/below the shoulders, use headProminencePct instead (opposite direction: bigger = stricter).',
				"Aliases: 'flag' → bull_flag + bear_flag, 'pennant' → bull/bear pennant, 'triangle' → asc/desc/sym.",
			].join('\n'),
		),
	// Heuristics
	swingDepth: z.number().int().min(1).max(10).optional().default(7),
	tolerancePct: z
		.number()
		.min(0)
		.max(0.1)
		.optional()
		.default(0.04)
		.describe(
			'同水準判定の許容誤差。大きいほど判定が緩くなる。head_and_shoulders / inverse_head_and_shoulders では' +
				'肩の左右差の許容誤差にのみ使う（ネックライン水平度は本パラメータに依存しない固定閾値。' +
				'頭が肩よりどれだけ突出すべきかは' +
				'headProminencePct が別に持つ。issue #149——旧実装はここに頭の突出要求も相乗りしており、' +
				'肩では「大きいほど緩い」・頭では「大きいほど厳しい」が同じ値に同時にかかっていた）。',
		),
	minBarsBetweenSwings: z.number().int().min(1).max(30).optional().default(5),
	headProminencePct: z
		.number()
		.min(0)
		.max(0.1)
		.optional()
		.describe(
			'head_and_shoulders / inverse_head_and_shoulders 専用: 頭が両肩よりどれだけ突出していなければ' +
				'ならないかの最小要求率。**tolerancePct とは向きが逆で、大きいほど判定が厳しくなる**' +
				'（最小要求を引き上げるため）。緩めたい（=頭の突出要求を下げたい）ときは値を小さくする。\n' +
				'未指定時は tolerancePct と同じ時間軸オート値（1hour/4hour=0.05, 8hour/12hour=0.045, ' +
				'15min/30min=0.06, 1week=0.035, 1month=0.03, その他=0.04）を使う。tolerancePct を明示的に' +
				'変更しても本パラメータには影響しない（H&S の頭の判定は tolerancePct から完全に独立）。',
		),
	view: z
		.enum(['summary', 'detailed', 'full', 'debug'])
		.optional()
		.default('detailed')
		.describe(
			`${VIEW_CONTRACT_NOTE}\n` +
				'summary / detailed / full では、ヘッダ直下に 2 行が出る（**別の量なので混同しないこと**）:\n' +
				'  - `スキャン範囲: <先頭足> ~ <末尾足>（N本）` — 検出器に実際に渡した足のレンジ。' +
				'1day 未満の時間足では時刻まで表示する。構造化データは meta.scan。\n' +
				'  - `検出パターン分布期間: <最古 range.start> ~ <最新 range.end>（N日間）` — ' +
				'**検出されたパターンの分布**であってスキャン窓ではない（旧ラベル「検出対象期間」）。\n' +
				'- summary: ヘッダ ＋ 分類内訳 ＋ 直近30日/90日件数 ＋ 上記 2 行 ＋ 検討パターン。個々のパターンの詳細は content に出ない。\n' +
				'- detailed（既定）: 上位 5 件の詳細。6 件目以降は content に出ない。structuredContent に usage_example を**足す**。\n' +
				'- full: 全件の詳細（double_top / double_bottom では山谷 3 点の pivot 行も出る）。本ツールの最重量。\n' +
				'- debug（**階梯外**）: swings / candidates のみ。**検出パターンも上記 2 行も content に出ない**——出力を置換する view なので full の上位集合ではない。structuredContent に data.candidates を**足す**。\n' +
				'  candidates は `patterns` で要求した種別（エイリアスは展開して照合）に**絞って**返す。' +
				'`patterns` 未指定なら全種別。絞らないと cap（200件）を要求外の種別が食い潰し、' +
				'要求した種別の棄却理由が押し出される。\n' +
				'  `accepted:false` は候補生成の時点での棄却（例: `head_not_higher`。`includeInvalid` では拾えない）で、' +
				'`status` を持たない。`accepted:true` は**検出器が候補を組み立てた**ことを示すだけで、' +
				'`data.patterns` に残ったことは意味しない（形成中パスの成功エントリは `globalDedup` より前に積むため、' +
				'重複除去で最終出力から消えることがある）。エントリが持つ `status` / `breakoutDirection` も' +
				'**組み立てた時点の観測値**であって、その後 `status=invalid`/`expired` になったかどうかは' +
				'candidates からは分からない。それを見るには `data.patterns` 側を `includeInvalid=true` で見る' +
				'（区別は includeInvalid の説明を参照）。',
		),
	// New: relevance filter for "current-involved" long-term patterns
	requireCurrentInPattern: z.boolean().optional().default(false),
	currentRelevanceDays: z.number().int().min(1).max(365).optional().default(7),

	// Unified pattern lifecycle options
	includeForming: z.boolean().optional().default(false).describe('形成中パターンを含める'),
	includeCompleted: z.boolean().optional().default(true).describe('完成済みパターンを含める'),
	includeInvalid: z
		.boolean()
		.optional()
		.default(false)
		.describe(
			'無効化済み（`status=invalid`）および期限切れ（`status=expired`）のパターンを含める。' +
				'期限切れ = 第2構成点の確定から突破確認窓を過ぎてもネックラインを突破しなかった候補で、' +
				'既定ではノイズになるため出力されない。\n' +
				'**`true` にしても拾えるのは、一度パターンとして成立してから無効化された `status=invalid` / ' +
				'`expired` のものだけ。** `head_not_higher` / `shoulders_not_near:both` 等、構造要件を満たさず' +
				'**候補生成の時点で**落ちたものは `status` 自体を持たないため、`includeInvalid` では拾えない' +
				'（見るには `view=debug` の `data.candidates` を使う。`accepted:false` の `reason` に理由が入る）。',
		),
	tz: z
		.string()
		.optional()
		.default('Asia/Tokyo')
		.describe(
			'表示日時のタイムゾーン（既定: Asia/Tokyo）。get_candles の tz と揃える。' +
				'pattern の表示日時（期間 / 形成期間 / 文脈期間 / ブレイク確認 / 先行トレンド / pivot / スキャン範囲 / 検出パターン分布期間 等）に適用される。' +
				'構造化データ（data.patterns[*].range.start/end 等）は後方互換のため UTC ISO 文字列のまま不変。' +
				'空文字も Asia/Tokyo にフォールバック。',
		),
});

/**
 * 出力に現れるローソク足インデックス（`pivots[].idx` / `breakoutBarIndex` /
 * `confirmation.idx` / `meta.debug.*` の idx・indices）の基準を示す共通文言。
 *
 * 本ツールは `analyze_indicators` が返す配列から指標 warmup 分（`chart.meta.pastBuffer` 本）を
 * 落とした「スキャン窓」だけを検出器に渡す。インデックスはその**スキャン窓基準**であり、
 * warmup を含む `chart.candles` の添字ではない。両者は `pastBuffer` 本ずれる。
 */
const PATTERN_INDEX_NOTE =
	'**meta.scan が示すスキャン窓（= 直近 limit 本）を基準とした 0 始まりの位置**。' +
	'analyze_indicators の chart.candles は指標 warmup 分（chart.meta.pastBuffer 本）を先頭に含む' +
	'別配列なので、そちらへ直接添字として使わないこと（使うなら pastBuffer を足す）。' +
	'日時で突き合わせるなら range / date 等の ISO 文字列を使う。';

export const DetectedPatternSchema = z.object({
	type: PatternTypeEnum,
	confidence: z.number().min(0).max(1),
	/** 検出に使用した時間足（例: '1day', '4hour', '1week'） */
	timeframe: CandleTypeEnum.optional(),
	/** 人間可読な時間足ラベル（例: '日足', '4時間足', '週足'） */
	timeframeLabel: z.string().optional(),
	/**
	 * **この 1 件のパターンが占める期間**。スキャン窓でも入力データ範囲でもない。
	 * 全パターンを跨いだ分布は content の「検出パターン分布期間」行、
	 * 実際に走査した足の範囲は `meta.scan` を見ること。
	 */
	range: z.object({
		start: z
			.string()
			.describe(
				'このパターンの開始足。UTC ISO 文字列。' +
					'表示は呼び出し側 tz（既定 Asia/Tokyo）で整形される（後方互換のため値自体は不変）。',
			),
		end: z
			.string()
			.describe(
				'**このパターンが終わった足**であって、データ末尾でもスキャン窓の末尾でもない。' +
					'最新の range.end がスキャン窓の末尾より古いのは正常——「そこから先が走査されていない」ことを意味しない' +
					'（走査範囲は meta.scan を参照）。' +
					'ブレイク確認足まで含むことがあり、構成点だけで閉じた期間が必要なら structureRange を使う。' +
					'UTC ISO 文字列。表示は呼び出し側 tz（既定 Asia/Tokyo）で整形される（後方互換のため値自体は不変）。',
			),
	}),
	/**
	 * パターン構成点のみで張る期間（誤読防止のための追加フィールド）。
	 * double_top: peak1 → peak2 / double_bottom: valley1 → valley2 /
	 * H&S・inverse H&S: 左肩 → 右肩。range はブレイク確認日まで含むことがあるが
	 * こちらは構成点だけで閉じる。
	 */
	structureRange: z
		.object({
			start: z
				.string()
				.describe('UTC ISO 文字列。表示は呼び出し側 tz（既定 Asia/Tokyo）で整形される（後方互換のため値自体は不変）。'),
			end: z
				.string()
				.describe('UTC ISO 文字列。表示は呼び出し側 tz（既定 Asia/Tokyo）で整形される（後方互換のため値自体は不変）。'),
		})
		.optional(),
	/**
	 * 検出器自身が確認したブレイク（ネックライン突破等）。
	 * - double_top / double_bottom completed: type='neckline_breakout' を設定
	 * - H&S / inverse H&S: 検出器はネックラインブレイクを確認しないため type='not_confirmed'
	 * - forming パターン: type='not_confirmed'
	 *
	 * パターン検出後の事後分析（`aftermath.breakoutConfirmed`）とは別概念。
	 */
	confirmation: z
		.union([
			z.object({
				type: z.literal('neckline_breakout'),
				date: z.string(),
				idx: z.number().int().describe(`ブレイクを確認した足の位置。${PATTERN_INDEX_NOTE}`),
				price: z.number(),
			}),
			z.object({ type: z.literal('not_confirmed') }),
		])
		.optional(),
	/**
	 * 先行トレンド（パターン形成直前の lookback window のトレンド情報）。
	 * - start: lookback window 先頭の isoTime
	 * - end:   パターン構成開始点（startIdx）の isoTime
	 * - direction: 'up' / 'down' / 'sideways' / 'insufficient_data'
	 * - returnPct: priorReturn を百分率（小数2桁）に整形した値
	 */
	precedingTrend: z
		.object({
			start: z
				.string()
				.describe('UTC ISO 文字列。表示は呼び出し側 tz（既定 Asia/Tokyo）で整形される（後方互換のため値自体は不変）。'),
			end: z
				.string()
				.describe('UTC ISO 文字列。表示は呼び出し側 tz（既定 Asia/Tokyo）で整形される（後方互換のため値自体は不変）。'),
			direction: z.enum(['up', 'down', 'sideways', 'insufficient_data']),
			returnPct: z.number(),
			lookbackBars: z.number().int(),
		})
		.optional(),
	pivots: z
		.array(
			z.object({
				idx: z.number().int().describe(PATTERN_INDEX_NOTE),
				price: z
					.number()
					.describe(
						'構成点の価格。**極値判定に使った値ではない**（issue #125）。' +
							'ピボット由来の検出器（double / triple / H&S）はその足の**終値**を入れる' +
							'（ヒゲ 1 本で同水準判定・ネックラインが動くのを避けるため）。' +
							'判定に使った値そのものは `extremePrice` を見ること。',
					),
				kind: z.enum(['H', 'L']).describe('構成点の種別。H = 高値側（山）、L = 安値側（谷）。'),
				extremePrice: z
					.number()
					.describe(
						'極値判定に実際に使った値。kind=H なら `high`、kind=L なら `low`。' +
							'`price` との差がヒゲ分で、これを見れば報告値から判定を検算できる。' +
							'ただし triangle_* は独自の relaxed swing（`price` が最初から high / low）を使うため ' +
							'`price` と同値になる——同値であること自体が「終値を経由していない」という情報。',
					),
			}),
		)
		.optional()
		.describe(
			`パターン構成点の位置と価格。**price（終値）と extremePrice（極値判定に使った高安）は別の値。** ${PATTERN_INDEX_NOTE}`,
		),
	neckline: z
		.array(z.object({ x: z.number().int().optional(), y: z.number() }))
		.length(2)
		.optional(),
	// Optional: structure diagram (static SVG artifact to help beginners grok the pattern shape)
	structureDiagram: z
		.object({
			svg: z.string(),
			artifact: z.object({ identifier: z.string(), title: z.string() }),
		})
		.optional(),
	// 統合: パターンのステータス（形成中/完成度近し/完成済み/無効化/期限切れ）
	status: z
		.enum(['forming', 'near_completion', 'completed', 'invalid', 'expired'])
		.optional()
		.describe(
			'パターンの状態。' +
				'`forming` = 形成途上（まだネックライン突破の余地がある）。' +
				'`near_completion` = 突破目前。' +
				'`completed` = ネックライン突破を検出器が確認済み。' +
				'`invalid` = 構成点確定後に形が崩れて無効化された（理由は `invalidReason`）。' +
				'`expired` = **期限切れ**。第2構成点の確定から突破確認窓を過ぎてもネックラインを' +
				'突破しなかったもので、以後この候補が `completed` になることはない。' +
				'`invalid` と同義ではない——形が崩れたのではなく、成立する時間を使い切った状態。' +
				'既定では出力されず、`includeInvalid: true` で `invalid` と一緒に現れる。',
		),
	/** status='invalid' / 'expired' の理由コード（issue #126） */
	invalidReason: z
		.string()
		.optional()
		.describe(
			'`status` が `invalid` / `expired` になった理由コード。' +
				'`re_entered_trough_zone` = 第2構成点の確定後、ネックライン突破前に価格が' +
				'谷（山）ゾーンへ戻った。`forming_expired` = 突破確認窓を過ぎた。',
		),
	/**
	 * 整合度（confidence）のサブスコア。issue #126 で露出。
	 * 構造ゲートを通過した候補どうしの**形の良さの比較**にのみ使う値で、
	 * 構造的な妥当性そのものはゲート（hard reject）側が担保している。
	 */
	scoreComponents: z
		.object({
			symmetry: z.number().optional().describe('2 つの構成点（谷-谷 / 山-山）の同水準度。1 = 完全一致'),
			retracement: z
				.number()
				.optional()
				.describe('中間構成点の戻り率が許容帯の中央にどれだけ近いか。1 = 帯の中央、0 = 帯の端'),
			breakoutQuality: z
				.number()
				.optional()
				.describe(
					'ネックライン突破の質。突破足の終値がネックラインをパターン高さの何割ぶん' +
						'超えたかで測る。形成中パターンには付かない',
				),
			duration: z.number().optional().describe('パターンの形成期間スコア'),
		})
		.optional()
		.describe(
			'整合度の内訳。**ゲート通過を前提とした形状の良さ**であって、構造的妥当性の指標ではない' +
				'（構造ゲートは `confidence` に減点として現れず、通らなければそもそも出力されない）。',
		),
	/** 構造ゲート（issue #126）の計測値 */
	structureGate: z
		.object({
			retracementRatio: z
				.number()
				.optional()
				.describe(
					'先行値幅に対する中間構成点（ネックライン）の戻り率。' +
						'**高安（extremePrice）基準**で算出する——終値基準では許容帯の余裕が薄く、' +
						'ヒゲを含む実際の値幅と乖離するため。1.0 超は定義上そのパターンではない',
				),
			priorExtremeIdx: z
				.number()
				.int()
				.optional()
				.describe(`先行値幅の起点（第1構成点の直前のスイング極値）の位置。${PATTERN_INDEX_NOTE}`),
			priorExtremePrice: z.number().optional().describe('先行値幅の起点の極値（high / low）'),
			necklineCrossIdx: z
				.number()
				.int()
				.optional()
				.describe(
					'第1構成点より前にネックライン水準を**終値で**抜けたバーの位置。' +
						`この事象が無い候補は棄却される。${PATTERN_INDEX_NOTE}`,
				),
		})
		.optional()
		.describe('構造ゲートが実際に計測した値。棄却されなかった理由を呼び出し側が検算できるようにする。'),
	// 形成中パターン用フィールド
	apexDate: z.string().optional(), // アペックス（頂点）到達予定日
	daysToApex: z.number().int().optional(), // アペックスまでの日数
	completionPct: z.number().int().optional(), // 完成度（%）
	// 完成済みパターン用フィールド
	breakoutDate: z.string().optional(), // ブレイクアウト日
	breakoutBarIndex: z.number().int().optional().describe(`ブレイクアウトしたローソク足の位置。${PATTERN_INDEX_NOTE}`),
	daysSinceBreakout: z.number().int().optional(), // ブレイクアウトからの経過日数
	// ブレイク方向と結果
	breakoutDirection: z.enum(['up', 'down']).optional(), // ブレイク方向
	outcome: z.enum(['success', 'failure']).optional(), // パターン結果（期待通り=success, 逆方向=failure）
	// ターゲット価格（ブレイクアウト後の想定到達価格）
	breakoutTarget: z.number().optional(), // 想定ターゲット価格（円）
	targetMethod: z.enum(['flagpole_projection', 'pattern_height', 'neckline_projection']).optional(), // 計算根拠
	// ターゲットまでの進捗率（%）。全パターン共通でブレイク後の最安値/最高値（high/low）ベースで算出。
	// reached=true なら 100 以上にクランプ（オーバーシュート時の符号反転防止）、
	// reached=false なら 99 でキャップ（丸めで 100 にせり上がるのを防ぐ）。
	targetReachedPct: z.number().optional(),
	// ブレイク後の high/low ベース target 到達情報。double / triangle / wedge / pennant / flag /
	// H&S / 逆H&S すべてで付与される。最終 close ベースだと一度到達してから戻したケースを
	// 未到達扱いしてしまうため、extremum（up=最高 high / down=最安 low）で評価する。
	targetReached: z.boolean().optional(),
	targetReachedDate: z.string().optional(),
	targetReachedPrice: z.number().optional(),
	// 用語正規化ラベル（neckline フィールドが何を指すかをパターン種別ごとに明示）
	trendlineLabel: z.string().optional(),
	// ペナント用: フラッグポール（旗竿）情報
	poleDirection: z.enum(['up', 'down']).optional(), // フラッグポールの方向
	priorTrendDirection: z.enum(['bullish', 'bearish']).optional(), // 先行トレンド方向
	isTrendContinuation: z.boolean().optional(), // ブレイク方向が先行トレンドと一致しているか
	flagpoleHeight: z.number().optional(), // フラッグポールの値幅
	retracementRatio: z.number().optional(), // フラッグポールに対する戻し比率（0.38未満ならペナント的）
	// bull_flag / bear_flag / bull_pennant / bear_pennant の検証情報。
	// LLM がパターンの妥当性を即座に判断できるよう、pole の急騰/急落条件と
	// チャネル幾何（傾き・spread）を明示する。
	poleStartDate: z.string().optional(), // pole 開始日（UTC ISO）
	poleEndDate: z.string().optional(), // pole 終了日（UTC ISO）
	poleChangePct: z.number().optional(), // pole の価格変化率（0.15 = +15%）
	poleBars: z.number().int().optional(), // pole のバー数
	poleATRMult: z.number().optional(), // pole の magnitude / 局所 ATR
	flagUpperSlope: z.number().optional(), // チャネル上限ラインの傾き（価格/バー）
	flagLowerSlope: z.number().optional(), // チャネル下限ラインの傾き（価格/バー）
	spreadAvg: z.number().optional(), // チャネル幅の平均
	spreadStability: z.number().optional(), // チャネル幅の安定性（0-1, 1=完全に平行）
	expectedBreakoutDirection: z.enum(['up', 'down']).optional(), // 期待されるブレイク方向（pole 方向と同じ）
	aftermath: z
		.object({
			breakoutDate: z.string().nullable().optional(),
			breakoutConfirmed: z.boolean(),
			priceMove: z
				.object({
					days3: z.object({ return: z.number(), high: z.number(), low: z.number() }).nullable().optional(),
					days7: z.object({ return: z.number(), high: z.number(), low: z.number() }).nullable().optional(),
					days14: z.object({ return: z.number(), high: z.number(), low: z.number() }).nullable().optional(),
				})
				.optional(),
			targetReached: z.boolean(),
			theoreticalTarget: z.number().nullable().optional(),
			outcome: z.string(),
			// New: number of bars (days for 1day, weeks for 1week, etc.) to reach theoretical target (if reached within evaluation window)
			daysToTarget: z.number().int().nullable().optional(),
		})
		.optional(),
});

export const DetectPatternsOutputSchema = z.union([
	z.object({
		ok: z.literal(true),
		summary: z.string(),
		data: z.object({
			patterns: z.array(DetectedPatternSchema),
			overlays: z
				.object({
					ranges: z
						.array(
							z.object({
								start: z.string(),
								end: z.string(),
								color: z.string().optional(),
								label: z.string().optional(),
							}),
						)
						.optional(),
					annotations: z.array(z.object({ isoTime: z.string(), text: z.string() })).optional(),
				})
				.optional(),
			warnings: z
				.array(
					z.object({
						type: z.string(),
						message: z.string(),
						suggestedParams: z.record(z.string(), z.any()).optional(),
					}),
				)
				.optional()
				.describe(
					'本ツール自身の検出層 warning（上流の meta.warning / meta.warnings とは別系統）。\n' +
						'- `limit_too_small_for_timeframe`: スキャン窓が時間足の swingDepth に対して狭すぎ、' +
						'構造上パターンを張れない。**この type だけは content 先頭にも警告行として出る**。\n' +
						'- `low_detection_count`: 検出数が 1 件以下。content には出ない（structuredContent のみ）。',
				),
			statistics: z
				.record(
					z.string(),
					z.object({
						detected: z.number().int(),
						withAftermath: z.number().int(),
						successRate: z.number().nullable(),
						avgReturn7d: z.number().nullable(),
						avgReturn14d: z.number().nullable(),
						medianReturn7d: z.number().nullable(),
					}),
				)
				.optional(),
		}),
		meta: z.object({
			pair: z.string(),
			type: CandleTypeEnum,
			count: z.number().int(),
			scan: z
				.object({
					start: z.string().describe('スキャンした先頭足の UTC ISO 文字列。'),
					end: z.string().describe('スキャンした末尾足の UTC ISO 文字列。'),
					bars: z.number().int().describe('検出器に渡した足の本数。'),
				})
				.optional()
				.describe(
					'検出器に実際に渡した足のレンジ。入力 limit（要求本数）でも ' +
						'data.patterns の range 分布でもなく、**スキャン窓そのもの**。' +
						'機械クライアントが「どこまで見たか」を検証できるようにするためのフィールドで、' +
						'content には「スキャン範囲」行として出る。isoTime が欠けている足しか無い場合は省略される。',
				),
			visualization_hints: z
				.object({
					preferred_style: z.enum(['candles', 'line']).optional(),
					highlight_patterns: z.array(PatternTypeEnum).optional(),
				})
				.optional(),
			debug: z
				.object({
					swings: z
						.array(
							z.object({
								idx: z.number().int().describe(PATTERN_INDEX_NOTE),
								price: z.number(),
								kind: z.enum(['H', 'L']),
								isoTime: z.string().optional(),
							}),
						)
						.optional(),
					candidates: z
						.array(
							z.object({
								// 候補ラベルは方向分類前の 'flag' / 'pennant' / 'triangle' を含むため filter enum を使う。
								type: PatternFilterEnum,
								accepted: z.boolean(),
								reason: z.string().optional(),
								// 候補が組み立てられた時点の status。形成中パスの成功エントリ（issue #155）が
								// 「完成済みとして採用された」と誤読されるのを防ぐための印で、`CandDebugEntry`
								// 側には元からあったが出力スキーマに無く **strip されていた**。
								status: z.string().optional(),
								// ブレイク方向。`CandDebugEntry` 側が `string | null`（未ブレイクの候補で `null`）
								// なので nullable。`PatternEntry.breakoutDirection`（:395）は `z.enum(['up','down'])`
								// だが**あちらは成立したパターンの確定値**で、こちらは候補時点の観測値。
								// 揃えて enum にすると `null` と将来の分類値で parse error になる。
								breakoutDirection: z.string().nullish(),
								indices: z.array(z.number().int()).optional().describe(PATTERN_INDEX_NOTE),
								points: z
									.array(
										z.object({
											role: z.string(),
											idx: z.number().int().describe(PATTERN_INDEX_NOTE),
											price: z.number(),
											isoTime: z.string().optional(),
										}),
									)
									.optional(),
								details: z.any().optional(),
							}),
						)
						.optional(),
				})
				.optional(),
			warning: z.string().optional(),
			warnings: z.array(z.string()).optional(),
		}),
	}),
	FailResultSchema,
]);

// === Candle Patterns (2-bar patterns: engulfing, harami, etc.) ===

export const CandlePatternTypeEnum = z.enum([
	// 2本足パターン (Phase 1-2)
	'bullish_engulfing',
	'bearish_engulfing',
	'bullish_harami',
	'bearish_harami',
	'tweezer_top',
	'tweezer_bottom',
	'dark_cloud_cover',
	'piercing_line',
	// 1本足パターン (Phase 3)
	'hammer',
	'shooting_star',
	'doji',
	// 3本足パターン (Phase 3)
	'morning_star',
	'evening_star',
	'three_white_soldiers',
	'three_black_crows',
]);

export const AnalyzeCandlePatternsInputSchema = z.object({
	pair: z.string().optional().default('btc_jpy'),
	timeframe: z.literal('1day').optional().default('1day'),
	// as_of: 主要パラメータ名（ISO形式 "2025-11-05" または YYYYMMDD "20251105" を受け付け）
	as_of: z
		.string()
		.optional()
		.describe('Date to analyze (ISO "2025-11-05" or YYYYMMDD "20251105"). If omitted, uses latest data.'),
	// date: 互換性のため残す（as_of が優先）
	date: z
		.string()
		.regex(/^\d{8}$/)
		.optional()
		.describe('DEPRECATED: Use as_of instead. YYYYMMDD format.'),
	window_days: z.number().int().min(3).max(10).optional().default(5),
	focus_last_n: z.number().int().min(2).max(5).optional().default(5),
	patterns: z
		.array(CandlePatternTypeEnum)
		.optional()
		.describe('Patterns to detect. If omitted, all patterns are checked.'),
	history_lookback_days: z.number().int().min(30).max(365).optional().default(180),
	history_horizons: z.array(z.number().int().min(1).max(10)).optional().default([1, 3, 5]),
	allow_partial_patterns: z.boolean().optional().default(true),
});

const HistoryHorizonStatsSchema = z.object({
	avg_return: z.number(),
	win_rate: z.number(),
	sample: z.number().int(),
});

const HistoryStatsSchema = z.object({
	lookback_days: z.number().int(),
	occurrences: z.number().int(),
	horizons: z.record(z.string(), HistoryHorizonStatsSchema),
});

const LocalContextSchema = z.object({
	trend_before: z.enum(['up', 'down', 'neutral']),
	volatility_level: z.enum(['low', 'medium', 'high']),
});

const DetectedCandlePatternSchema = z.object({
	pattern: CandlePatternTypeEnum,
	pattern_jp: z.string(),
	direction: z.enum(['bullish', 'bearish', 'neutral']),
	strength: z.number().min(0).max(1),
	candle_range_index: z.tuple([z.number().int(), z.number().int()]),
	uses_partial_candle: z.boolean(),
	status: z.enum(['confirmed', 'forming']),
	local_context: LocalContextSchema,
	history_stats: HistoryStatsSchema.nullable(),
});

const WindowCandleSchema = z.object({
	timestamp: z.string(),
	open: z.number(),
	high: z.number(),
	low: z.number(),
	close: z.number(),
	volume: z.number(),
	is_partial: z.boolean(),
});

export const AnalyzeCandlePatternsDataSchemaOut = z.object({
	pair: z.string(),
	timeframe: z.string(),
	snapshot_time: z.string(),
	window: z.object({
		from: z.string(),
		to: z.string(),
		candles: z
			.array(WindowCandleSchema)
			.describe(
				'CRITICAL: Array order is [oldest, ..., newest]. index 0 = most distant, index n-1 = latest (possibly partial).',
			),
	}),
	recent_patterns: z.array(DetectedCandlePatternSchema),
	summary: z.string(),
});

export const AnalyzeCandlePatternsMetaSchemaOut = BaseMetaSchema.extend({
	timeframe: z.string(),
	as_of: z.string().nullable().describe('Original input value (ISO or YYYYMMDD)'),
	date: z.string().nullable().describe('YYYYMMDD normalized, null for latest'),
	window_days: z.number().int(),
	patterns_checked: z.array(CandlePatternTypeEnum),
	history_lookback_days: z.number().int(),
	history_horizons: z.array(z.number().int()),
	warning: z.string().optional(),
});

export const AnalyzeCandlePatternsOutputSchema = z.union([
	z.object({
		ok: z.literal(true),
		summary: z.string(),
		content: z.array(z.object({ type: z.literal('text'), text: z.string() })).optional(),
		data: AnalyzeCandlePatternsDataSchemaOut,
		meta: AnalyzeCandlePatternsMetaSchemaOut,
	}),
	FailResultSchema,
]);

// === Candle Pattern Diagram (2-bar pattern visualization) ===

const DiagramCandleSchema = z.object({
	date: z.string().describe('Display date e.g. "11/6(木)"'),
	open: z.number(),
	high: z.number(),
	low: z.number(),
	close: z.number(),
	type: z.enum(['bullish', 'bearish']),
	isPartial: z.boolean().optional(),
});

const DiagramPatternSchema = z.object({
	name: z.string().describe('Pattern name in Japanese e.g. "陽線包み線"'),
	nameEn: z.string().optional().describe('Pattern name in English e.g. "bullish_engulfing"'),
	confirmedDate: z.string().describe('Confirmed date e.g. "11/9(日)"'),
	involvedIndices: z.tuple([z.number().int().min(0), z.number().int().min(0)]).describe('[prevIndex, confirmedIndex]'),
	direction: z.enum(['bullish', 'bearish']).optional(),
});

export const RenderCandlePatternDiagramInputSchema = z.object({
	candles: z.array(DiagramCandleSchema).min(2).max(10).describe('Candle data array (oldest first)'),
	pattern: DiagramPatternSchema.optional().describe('Pattern to highlight'),
	title: z.string().optional().describe('Chart title (default: pattern name or "ローソク足チャート")'),
	theme: z.enum(['dark', 'light']).optional().default('dark'),
});

export const RenderCandlePatternDiagramDataSchemaOut = z.object({
	svg: z.string().optional(),
	filePath: z.string().optional(),
	url: z.string().optional(),
});

export const RenderCandlePatternDiagramMetaSchemaOut = z.object({
	width: z.number().int(),
	height: z.number().int(),
	candleCount: z.number().int(),
	patternName: z.string().nullable(),
});

export const RenderCandlePatternDiagramOutputSchema = toolResultSchema(
	RenderCandlePatternDiagramDataSchemaOut,
	RenderCandlePatternDiagramMetaSchemaOut,
);
