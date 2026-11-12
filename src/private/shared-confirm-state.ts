// Claude Desktop はチャットのツール実行とカード（iframe）の要求を別々のサーバープロセスで受ける（ADR-0007 判断事項 D）。
// preview の控え・署名鍵に混ぜる乱数・使用済みトークンの印を、同じ OS ユーザーだけが読み書きできるフォルダで共有する。

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type SharedRecordKind = 'snapshots';

const SUBDIRS = ['snapshots', 'used'] as const;

const NONCE_PATTERN = /^[0-9a-f]{64}$/;

const PURGE_INTERVAL_MS = 60_000;

let activeDir: string | null = null;
let configuredDir: string | undefined;
let lastPurgeMs: number | undefined;

/** 署名鍵の乱数はプロセスの中で一度決めたら変えない（途中で変わると発行済みのトークンが検証できなくなる）。 */
const SHARED_NONCE_KEY = Symbol.for('bitbank-lab-mcp.sharedConfirmState.nonce');

function defaultDir(): string {
	return path.join(os.homedir(), '.bitbank-lab-mcp', 'confirm');
}

function errorCode(err: unknown): string | undefined {
	return (err as { code?: unknown } | null)?.code as string | undefined;
}

function hashName(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

// Windows はモードビットを持たず、ホームフォルダの ACL で本人に限られるので、所有者とモードの確認を省く。
function isPrivateDir(p: string): boolean {
	const st = fs.lstatSync(p);
	if (st.isSymbolicLink() || !st.isDirectory()) return false;
	if (process.platform === 'win32') return true;
	if (typeof process.getuid === 'function' && st.uid !== process.getuid()) return false;
	if ((st.mode & 0o077) === 0) return true;
	fs.chmodSync(p, 0o700);
	return (fs.lstatSync(p).mode & 0o077) === 0;
}

function isOwnRegularFile(p: string): boolean {
	const st = fs.lstatSync(p);
	if (st.isSymbolicLink() || !st.isFile()) return false;
	return process.platform === 'win32' || typeof process.getuid !== 'function' || st.uid === process.getuid();
}

export function enableSharedConfirmState(dir: string = configuredDir ?? defaultDir()): boolean {
	activeDir = null;
	try {
		fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
		if (!isPrivateDir(dir)) return false;
		for (const sub of SUBDIRS) {
			const p = path.join(dir, sub);
			fs.mkdirSync(p, { recursive: true, mode: 0o700 });
			if (!isPrivateDir(p)) return false;
		}
	} catch {
		return false;
	}
	activeDir = dir;
	return true;
}

export function disableSharedConfirmState(): void {
	activeDir = null;
	lastPurgeMs = undefined;
}

export function isSharedConfirmStateEnabled(): boolean {
	return activeDir != null;
}

/** E2E がサーバーを起動する前に、ホームではなく一時フォルダを使わせるため。本番の場所は変えられない。 */
export function _setSharedConfirmStateDirForTests(dir: string | undefined): void {
	configuredDir = dir;
}

function readNonceFile(file: string): string | null {
	try {
		if (!isOwnRegularFile(file)) return null;
		const value = fs.readFileSync(file, 'utf8');
		return NONCE_PATTERN.test(value) ? value : null;
	} catch {
		return null;
	}
}

// 一時ファイルに書いてから link で置くので、別プロセスが書きかけ（空）の値を読むことがない。link は既にあれば EEXIST で失敗する。
function createNonceFile(file: string): void {
	const tmp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
	fs.writeFileSync(tmp, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
	try {
		fs.linkSync(tmp, file);
	} catch (err) {
		if (errorCode(err) !== 'EEXIST') throw err;
	} finally {
		fs.rmSync(tmp, { force: true });
	}
}

export function sharedNonce(): string | null {
	if (activeDir == null) return null;
	const store = globalThis as unknown as Record<symbol, { dir: string; value: string | null } | undefined>;
	const cached = store[SHARED_NONCE_KEY];
	if (cached?.dir === activeDir) return cached.value;
	const file = path.join(activeDir, 'nonce');
	let value: string | null;
	try {
		if (!fs.existsSync(file)) createNonceFile(file);
		value = readNonceFile(file);
	} catch {
		value = null;
	}
	store[SHARED_NONCE_KEY] = { dir: activeDir, value };
	return value;
}

export function _forgetSharedNonce(): void {
	const store = globalThis as unknown as Record<symbol, unknown>;
	delete store[SHARED_NONCE_KEY];
}

function purgeUsedMarkers(dir: string, nowMs: number): void {
	if (lastPurgeMs != null && nowMs - lastPurgeMs < PURGE_INTERVAL_MS) return;
	lastPurgeMs = nowMs;
	const usedDir = path.join(dir, 'used');
	for (const name of fs.readdirSync(usedDir)) {
		const file = path.join(usedDir, name);
		try {
			const expiresAt = Number(fs.readFileSync(file, 'utf8'));
			if (!Number.isFinite(expiresAt) || nowMs > expiresAt) fs.rmSync(file, { force: true });
		} catch {
			// 別プロセスが同時に消した等。次の掃除で拾う。
		}
	}
}

export type SharedUseResult = 'recorded' | 'already_used' | 'unavailable' | 'disabled';

/** 排他作成（`wx`）で印を置くので、2 つのプロセスが同じトークンを同時に使っても片方しか recorded にならない。 */
export function recordSharedTokenUse(token: string, expiresAt: number, nowMs: number = Date.now()): SharedUseResult {
	if (activeDir == null) return 'disabled';
	try {
		purgeUsedMarkers(activeDir, nowMs);
	} catch {
		// 掃除の失敗で使用の記録まで止めない。
	}
	try {
		fs.writeFileSync(path.join(activeDir, 'used', hashName(token)), String(expiresAt), { mode: 0o600, flag: 'wx' });
		return 'recorded';
	} catch (err) {
		return errorCode(err) === 'EEXIST' ? 'already_used' : 'unavailable';
	}
}

function recordPath(kind: SharedRecordKind, key: string): string | null {
	return activeDir == null ? null : path.join(activeDir, kind, `${hashName(key)}.json`);
}

// rename で置き換えるので、読む側が書きかけの JSON を見ることがない。
export function writeSharedRecord(kind: SharedRecordKind, key: string, value: unknown): void {
	const file = recordPath(kind, key);
	if (file == null) return;
	const tmp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
	try {
		fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
		fs.renameSync(tmp, file);
	} catch {
		fs.rmSync(tmp, { force: true });
	}
}

export function readSharedRecord(kind: SharedRecordKind, key: string): unknown {
	const file = recordPath(kind, key);
	if (file == null) return null;
	try {
		if (!isOwnRegularFile(file)) return null;
		return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
	} catch {
		return null;
	}
}

export function deleteSharedRecord(kind: SharedRecordKind, key: string): void {
	const file = recordPath(kind, key);
	if (file == null) return;
	try {
		fs.rmSync(file, { force: true });
	} catch {
		// 消せなくても、読む側が期限と TTL で古い控えを捨てる。
	}
}
