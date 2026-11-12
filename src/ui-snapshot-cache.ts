// 一部ホストで ui/notifications/tool-result が iframe に配信されないので、get_ui_snapshot の pull 型 hydration 用に直近の応答を保持する。
// 保持するのはホストへ送信済みの応答だけだが、`_meta` は確認トークンを含みうるので getUiSnapshotMeta で別扱いにする。

import { log } from '../lib/logger.js';
import { deleteSharedRecord, readSharedRecord, writeSharedRecord } from './private/shared-confirm-state.js';

const SNAPSHOT_TTL_MS = 5 * 60_000;

interface SnapshotEntry {
	structuredContent: Record<string, unknown>;
	storedAt: number;
	meta?: Record<string, unknown>;
	/** スナップショットの保持期間はトークン TTL より長いので、この時刻を過ぎたら `meta` は返さない（使えない bearer 値を取得可能な場所に置かない）。 */
	metaExpiresAtMs?: number;
}

export interface SnapshotScope {
	sessionId?: string;
	nowMs?: number;
}

const snapshots = new Map<string, SnapshotEntry>();

/** 未設定の `sessionId` と空文字を同一キーに畳んでいる。HTTP トランスポートを足すと別クライアントが確認トークン入りの `_meta` を読み出せるので、同じ PR で「未設定は fail-closed」に変える（ADR-0007 判断事項 B、`tests/http-transport-tripwire.test.ts`）。 */
export function uiSnapshotKey(sessionId: string | undefined, resourceUri: string): string {
	return `${sessionId ?? ''}\0${resourceUri}`;
}

/** `meta` に確認トークンを含むときは `metaExpiresAtMs` も渡す（渡さないと `meta` はスナップショット TTL の間返り続ける）。 */
export function storeUiSnapshot(
	resourceUri: string,
	structuredContent: Record<string, unknown>,
	scope: SnapshotScope = {},
	meta?: Record<string, unknown>,
	metaExpiresAtMs?: number,
): void {
	const key = uiSnapshotKey(scope.sessionId, resourceUri);
	const entry: SnapshotEntry = {
		structuredContent,
		storedAt: scope.nowMs ?? Date.now(),
		...(meta ? { meta } : {}),
		...(metaExpiresAtMs != null ? { metaExpiresAtMs } : {}),
	};
	snapshots.set(key, entry);
	// 書けないと、カード側のプロセスは控えを読めずボタンが出ない（発注はされない側に倒れる）。原因を追えるよう記録だけ残す。
	if (!writeSharedRecord('snapshots', key, entry)) log('warn', { type: 'shared_snapshot_write_failed', resourceUri });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSnapshotEntry(value: unknown): SnapshotEntry | undefined {
	if (!isRecord(value) || !isRecord(value.structuredContent) || typeof value.storedAt !== 'number') return undefined;
	if (value.meta !== undefined && !isRecord(value.meta)) return undefined;
	if (value.metaExpiresAtMs !== undefined && typeof value.metaExpiresAtMs !== 'number') return undefined;
	return value as unknown as SnapshotEntry;
}

function clearedAtOf(value: unknown): number | undefined {
	return isRecord(value) && typeof value.clearedAt === 'number' ? value.clearedAt : undefined;
}

// 共有が無効ならファイル側は常に null で、従来どおりメモリだけを見る。
function readEntry(key: string): SnapshotEntry | undefined {
	const memory = snapshots.get(key);
	const raw = readSharedRecord('snapshots', key);
	// 発注後に別プロセスが消した控えを、このプロセスのメモリから復元させない（カードにボタンが出直す）。
	const clearedAt = clearedAtOf(raw);
	if (clearedAt != null) {
		if (memory && memory.storedAt <= clearedAt) snapshots.delete(key);
		return memory && memory.storedAt > clearedAt ? memory : undefined;
	}
	const shared = toSnapshotEntry(raw);
	if (!shared) return memory;
	if (!memory) return shared;
	return shared.storedAt > memory.storedAt ? shared : memory;
}

/** `_meta` にだけ短い期限と呼び出し側のゲート判定を課すため `getUiSnapshot` と分けている。呼び出し側は返す前に `isAppUiExecuteAllowed` を必ず確認すること（ここではゲート判定をしない）。 */
export function getUiSnapshotMeta(resourceUri: string, scope: SnapshotScope = {}): Record<string, unknown> | null {
	const key = uiSnapshotKey(scope.sessionId, resourceUri);
	const entry = readEntry(key);
	if (!entry?.meta) return null;
	const now = scope.nowMs ?? Date.now();
	// エントリの削除は getUiSnapshot に任せる（ここで消すと preview の再描画まで巻き添えになる）。
	if (now - entry.storedAt > SNAPSHOT_TTL_MS) return null;
	// トークンの期限切れ。entry は消さず `_meta` だけ落とす。
	if (entry.metaExpiresAtMs != null && now > entry.metaExpiresAtMs) return null;
	return entry.meta;
}

export function getUiSnapshot(resourceUri: string, scope: SnapshotScope = {}): Record<string, unknown> | null {
	const key = uiSnapshotKey(scope.sessionId, resourceUri);
	const entry = readEntry(key);
	if (!entry) return null;
	if ((scope.nowMs ?? Date.now()) - entry.storedAt > SNAPSHOT_TTL_MS) {
		snapshots.delete(key);
		deleteSharedRecord('snapshots', key);
		return null;
	}
	return entry.structuredContent;
}

export function clearUiSnapshot(resourceUri: string, scope: SnapshotScope = {}): void {
	const key = uiSnapshotKey(scope.sessionId, resourceUri);
	snapshots.delete(key);
	// ファイルを消すだけだと、控えをメモリに持つ別プロセスがそれを返し続けるので、消した時刻を残す。
	writeSharedRecord('snapshots', key, { clearedAt: scope.nowMs ?? Date.now() });
}

export function _resetUiSnapshots(): void {
	snapshots.clear();
}
