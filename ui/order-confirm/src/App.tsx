// トークンは `_meta` からしか読まない。`content` / `structuredContent` には載っておらず、それが「LLM には見えないがこの iframe には見える」という認可の根拠になっている（ADR-0007）。

import {
	App as McpApp,
	applyDocumentTheme,
	applyHostFonts,
	applyHostStyleVariables,
	getDocumentTheme,
} from '@modelcontextprotocol/ext-apps';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type SnapshotHydrationPhase, startSnapshotHydration } from '../../../src/mcp-apps-hydration.js';
import { type ConfirmationMetaPayload, readConfirmationMeta } from '../../../src/mcp-apps-meta.js';

type Side = 'buy' | 'sell';
type OrderType = 'limit' | 'market' | 'stop' | 'stop_limit';
type PositionSide = 'long' | 'short';

/** 暗号資産の最大小数桁数（bitbank の表示慣行に合わせる） */
const CRYPTO_MAX_FRACTION_DIGITS = 8;
const JPY_MAX_FRACTION_DIGITS = 0;
/** create_order 呼び出しの timeout（ms）。サーバー側のツール timeout 60s より少し短く設定 */
const CREATE_ORDER_TIMEOUT_MS = 45_000;
const CONNECT_TIMEOUT_MS = 7_000;
/** この UI が対応する MCP Apps リソース URI（get_ui_snapshot の取得キー） */
const RESOURCE_URI = 'ui://order/confirm.html';
const SNAPSHOT_TIMEOUT_MS = 10_000;

interface PreviewArgs {
	pair: string;
	amount: string;
	side: Side;
	type: OrderType;
	price?: string;
	trigger_price?: string;
	post_only?: boolean;
	position_side?: PositionSide;
}

interface PreviewResultData {
	preview: PreviewArgs;
}

interface PreviewResult {
	ok: boolean;
	summary?: string;
	data?: PreviewResultData;
	meta?: { action?: string };
}

type Status = 'idle' | 'submitting' | 'success' | 'error' | 'cancelled' | 'expired';

/** 送信後の終端状態。ボタンを引っ込めて二重発注を防ぐ。 */
const TERMINAL_STATUSES: ReadonlySet<Status> = new Set<Status>(['success', 'cancelled', 'expired']);

function formatPair(pair: string): string {
	return pair.toUpperCase().replace('_', '/');
}

function formatAmount(value: string): string {
	const n = Number(value);
	if (!Number.isFinite(n)) return value;
	return n.toLocaleString('ja-JP', { maximumFractionDigits: CRYPTO_MAX_FRACTION_DIGITS });
}

function formatPrice(value: string | undefined, isJpy: boolean): string {
	if (!value) return '—';
	const n = Number(value);
	if (!Number.isFinite(n)) return value;
	if (isJpy) return `¥${n.toLocaleString('ja-JP', { maximumFractionDigits: JPY_MAX_FRACTION_DIGITS })}`;
	return n.toLocaleString('ja-JP', { maximumFractionDigits: CRYPTO_MAX_FRACTION_DIGITS });
}

function estimateTotal(preview: PreviewArgs): string | null {
	if (!preview.price) return null;
	const p = Number(preview.price);
	const a = Number(preview.amount);
	if (!Number.isFinite(p) || !Number.isFinite(a)) return null;
	const isJpy = preview.pair.includes('jpy');
	const total = p * a;
	if (isJpy) return `¥${total.toLocaleString('ja-JP', { maximumFractionDigits: JPY_MAX_FRACTION_DIGITS })}`;
	return total.toLocaleString('ja-JP', { maximumFractionDigits: CRYPTO_MAX_FRACTION_DIGITS });
}

function sideLabel(side: Side, positionSide?: PositionSide): { text: string; className: string } {
	const base = side === 'buy' ? '買い' : '売り';
	const cls = side === 'buy' ? 'side-buy' : 'side-sell';
	if (!positionSide) return { text: base, className: cls };
	const posLabel = positionSide === 'long' ? 'ロング' : 'ショート';
	const isOpen = (side === 'buy' && positionSide === 'long') || (side === 'sell' && positionSide === 'short');
	return { text: `${base}（信用${isOpen ? '新規' : '決済'}・${posLabel}）`, className: cls };
}

function typeLabel(type: OrderType): string {
	switch (type) {
		case 'limit':
			return '指値';
		case 'market':
			return '成行';
		case 'stop':
			return '逆指値';
		case 'stop_limit':
			return '逆指値指値';
	}
}

export function App() {
	const [preview, setPreview] = useState<PreviewArgs | null>(null);
	// MCP Apps 実行経路が有効なときだけ `_meta` から入る。null ならボタンを描画しない。
	const [confirmation, setConfirmation] = useState<ConfirmationMetaPayload | null>(null);
	const [status, setStatus] = useState<Status>('idle');
	const [message, setMessage] = useState<string>('');
	const [orderId, setOrderId] = useState<number | null>(null);
	const appRef = useRef<McpApp | null>(null);
	// ontoolresult は useEffect([]) 内で作られ preview state がマウント時の値に固定される（stale closure）ので、受領済みかの判定は ref で行う。
	const hasPreviewRef = useRef(false);
	// 無言の「待機中…」で固まらせず、どの段階（ui/initialize / tool-result 配信）で止まっているかを表示するための状態。
	const [connState, setConnState] = useState<'connecting' | 'connected' | 'failed'>('connecting');
	const [hydrationPhase, setHydrationPhase] = useState<SnapshotHydrationPhase>('waiting');

	useEffect(() => {
		const mcpApp = new McpApp({ name: 'bitbank-order-confirm', version: '0.1.0' });
		appRef.current = mcpApp;

		// 他ツールの結果で state をリセットしないよう、`ok` かつ `data.preview` を持つ結果だけを取り込む（ツール名は見ていない）。
		const applyPreviewResult = (structured: PreviewResult | undefined, meta: unknown) => {
			if (structured?.ok && structured.data?.preview) {
				hasPreviewRef.current = true;
				setHydrationPhase('waiting');
				setPreview(structured.data.preview);
				setConfirmation(readConfirmationMeta(meta) ?? null);
				setStatus('idle');
				setMessage('');
				return;
			}
			// preview 未受領の iframe に ok:false が来たら、その summary をエラーとして描画する（「待機中…」のまま固まらせない）。
			if (structured?.ok === false && !hasPreviewRef.current) {
				setStatus('error');
				setMessage(structured.summary ?? '注文プレビューに失敗しました。');
			}
		};

		mcpApp.ontoolresult = (params) => {
			applyPreviewResult(params?.structuredContent as PreviewResult | undefined, params?._meta);
		};

		mcpApp.onhostcontextchanged = (ctx) => {
			if (ctx.theme) applyDocumentTheme(ctx.theme);
			if (ctx.styles) applyHostStyleVariables(ctx.styles);
			if (ctx.fontCss) applyHostFonts(ctx.fontCss);
		};

		const connectTimeoutId = setTimeout(() => {
			setConnState((s) => (s === 'connecting' ? 'failed' : s));
		}, CONNECT_TIMEOUT_MS);
		let stopHydration: (() => void) | undefined;
		// connect() が pending のままアンマウントされると .then() は cleanup の後に走るので、破棄済みなら hydration を開始しない（#29）。
		let disposed = false;

		mcpApp
			.connect()
			.then(() => {
				clearTimeout(connectTimeoutId);
				setConnState('connected');
				const ctx = mcpApp.getHostContext();
				applyDocumentTheme(ctx?.theme ?? getDocumentTheme());
				if (ctx?.styles) applyHostStyleVariables(ctx.styles);
				if (ctx?.fontCss) applyHostFonts(ctx.fontCss);
				if (disposed) return;
				// 一部ホストは ui/notifications/tool-result を配信しないので、get_ui_snapshot から直近の preview 応答を取得して復元する。
				stopHydration = startSnapshotHydration({
					fetchSnapshot: () =>
						mcpApp.callServerTool(
							{ name: 'get_ui_snapshot', arguments: { resource_uri: RESOURCE_URI } },
							{ timeout: SNAPSHOT_TIMEOUT_MS },
						),
					isHydrated: () => hasPreviewRef.current,
					apply: (result) => {
						// get_ui_snapshot も同じ `_meta` 契約でトークンを返す（有効化ゲートはサーバー側で再判定される）。
						const snapshot = result as { structuredContent?: unknown; _meta?: unknown };
						applyPreviewResult(snapshot.structuredContent as PreviewResult | undefined, snapshot._meta);
						// 取り込めなかったら失敗として throw する。resolve したまま終わるとリトライも failed 表示も起きず「復元中」のまま固まる（#29）。
						if (!hasPreviewRef.current) {
							throw new Error('snapshot did not contain a usable preview');
						}
					},
					onPhase: setHydrationPhase,
				});
			})
			.catch(() => {
				clearTimeout(connectTimeoutId);
				setConnState('failed');
			});

		return () => {
			disposed = true;
			clearTimeout(connectTimeoutId);
			stopHydration?.();
			const current = appRef.current;
			appRef.current = null;
			void current?.close().catch(() => {
				// close 自体の失敗は無視（既に切断済み等）
			});
		};
	}, []);

	const isJpy = useMemo(() => (preview ? preview.pair.includes('jpy') : false), [preview]);

	const handleConfirm = async () => {
		if (!preview || !confirmation) return;
		// クライアント側の期限チェックは UX のため。認可上の期限判定はサーバーの validateToken が行う。
		if (Date.now() > confirmation.expires_at) {
			setStatus('expired');
			setMessage('確認の有効期限が切れました。もう一度 preview_order を実行してください。');
			return;
		}
		const app = appRef.current;
		if (!app) {
			setStatus('error');
			setMessage('ホストに接続していません。');
			return;
		}
		setStatus('submitting');
		setMessage('');
		try {
			const args: Record<string, unknown> = {
				pair: preview.pair,
				amount: preview.amount,
				side: preview.side,
				type: preview.type,
				confirmation_token: confirmation.confirmation_token,
				token_expires_at: confirmation.expires_at,
			};
			// preview と同じパラメータで呼ぶ。1 つでも違うとサーバー側の HMAC 検証が token_invalid で落ちる（ユーザーが見ていない内容を発注させないための束縛）。
			if (preview.price) args.price = preview.price;
			if (preview.trigger_price) args.trigger_price = preview.trigger_price;
			if (preview.post_only != null) args.post_only = preview.post_only;
			if (preview.position_side) args.position_side = preview.position_side;

			const result = await app.callServerTool(
				{ name: 'create_order', arguments: args },
				{ timeout: CREATE_ORDER_TIMEOUT_MS },
			);
			if (result.isError) {
				const text = result.content?.find((c) => c.type === 'text')?.text ?? '注文に失敗しました';
				setStatus('error');
				setMessage(text);
				return;
			}
			const structured = result.structuredContent as
				| { ok?: boolean; summary?: string; data?: { order?: { order_id?: number } } }
				| undefined;
			if (structured?.ok === false) {
				setStatus('error');
				setMessage(structured.summary ?? '注文に失敗しました');
				return;
			}
			setStatus('success');
			setMessage(structured?.summary ?? '注文を受け付けました');
			setOrderId(structured?.data?.order?.order_id ?? null);
		} catch (err) {
			setStatus('error');
			setMessage(err instanceof Error ? err.message : '注文中に予期しないエラーが発生しました');
		}
	};

	const handleCancel = () => {
		setStatus('cancelled');
		setMessage('この注文はキャンセルされました。');
	};

	if (!preview) {
		if (status === 'error') {
			return (
				<div className="app">
					<div className="card">
						<div className="status status-error" role="alert" aria-live="assertive" aria-atomic="true">
							❌ {message}
						</div>
					</div>
				</div>
			);
		}
		const waitingText =
			connState === 'failed'
				? 'ホストとの MCP Apps 接続（ui/initialize）を確立できませんでした。このホストでは確認 UI を利用できません。プレビュー内容はチャット本文を参照してください。'
				: hydrationPhase === 'failed'
					? 'スナップショットから復元できませんでした。内容はチャット本文で確認できます。'
					: hydrationPhase === 'restoring'
						? 'ホストからツール結果（ui/notifications/tool-result）が届かないため、スナップショットからの復元を試みています。表示されない場合はプレビュー内容をチャット本文で確認してください。'
						: 'preview_order の結果を待機中…';
		return (
			<div className="app">
				<div className="card">
					<p className="muted">{waitingText}</p>
				</div>
			</div>
		);
	}

	const side = sideLabel(preview.side, preview.position_side);
	const total = estimateTotal(preview);
	const isTerminal = TERMINAL_STATUSES.has(status);

	return (
		<div className="app">
			<div className="card">
				<h1 className="title">
					<span className="title-icon" aria-hidden="true">
						📋
					</span>
					注文確認
				</h1>

				<div className="row">
					<span className="row-label">通貨ペア</span>
					<span className="row-value">{formatPair(preview.pair)}</span>
				</div>
				<div className="row">
					<span className="row-label">売買方向</span>
					<span className={`row-value ${side.className}`}>{side.text}</span>
				</div>
				<div className="row">
					<span className="row-label">注文タイプ</span>
					<span className="row-value">{typeLabel(preview.type)}</span>
				</div>
				<div className="row">
					<span className="row-label">数量</span>
					<span className="row-value">{formatAmount(preview.amount)}</span>
				</div>
				<div className="row">
					<span className="row-label">価格</span>
					<span className="row-value">
						{preview.type === 'market' ? '成行' : formatPrice(preview.price, isJpy)}
					</span>
				</div>
				{preview.trigger_price && (
					<div className="row">
						<span className="row-label">トリガー価格</span>
						<span className="row-value">{formatPrice(preview.trigger_price, isJpy)}</span>
					</div>
				)}
				{total && (
					<div className="row">
						<span className="row-label">合計概算</span>
						<span className="row-value">{total}</span>
					</div>
				)}
				{preview.post_only && (
					<div className="row">
						<span className="row-label">Post Only</span>
						<span className="row-value">有効</span>
					</div>
				)}

				{preview.position_side && (
					<div className="warn">⚠️ 信用取引です。損失が保証金を超える可能性があります。</div>
				)}

				{status === 'success' && (
					<div className="status status-success" role="status" aria-live="polite" aria-atomic="true">
						✅ {message}
						{orderId != null && (
							<>
								<br />
								注文ID: {orderId}
							</>
						)}
					</div>
				)}
				{status === 'error' && (
					<div className="status status-error" role="alert" aria-live="assertive" aria-atomic="true">
						❌ {message}
					</div>
				)}
				{status === 'cancelled' && (
					<div className="status status-cancelled" role="status" aria-live="polite" aria-atomic="true">
						{message}
					</div>
				)}
				{status === 'expired' && (
					<div className="status status-error" role="alert" aria-live="assertive" aria-atomic="true">
						⏰ {message}
					</div>
				)}

				{!isTerminal && confirmation != null && (
					<div className="actions">
						<button
							type="button"
							className="btn btn-secondary"
							onClick={handleCancel}
							disabled={status === 'submitting'}
						>
							キャンセル
						</button>
						<button
							type="button"
							className="btn btn-primary"
							onClick={handleConfirm}
							disabled={status === 'submitting'}
						>
							{status === 'submitting' ? '送信中…' : '注文を確定する'}
						</button>
					</div>
				)}

				{!isTerminal && confirmation == null && (
					<div className="warn">
						この iframe はプレビュー表示のみです。実際の発注は、確認ダイアログに対応したクライアントで同じ操作を行うか、bitbank
						アプリ/ウェブで同じ内容を手動発注してください。
					</div>
				)}
			</div>
		</div>
	);
}
