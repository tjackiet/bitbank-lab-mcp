/**
 * private API の接続先（ADR-0008）。
 *
 * - 既定の経路で送る URL が 1 文字も変わっていないこと（文字列の完全一致で固定する）
 * - `origin` はループバックの origin だけを受け、それ以外は throw して既定へ戻さないこと
 * - 差し替えても署名と再試行の挙動が変わらないこと
 * - `setDefaultClient` は既定のクライアントが作られる前に 1 回だけ使えること
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BitbankPrivateClient, PrivateApiError } from '../../src/private/client.js';
import { createMockFetcher, jsonResponse, mockBitbankSuccess } from '../fixtures/private-api.js';

beforeEach(() => {
	process.env.BITBANK_API_KEY = 'test_key';
	process.env.BITBANK_API_SECRET = 'test_secret';
});

afterEach(() => {
	delete process.env.BITBANK_API_KEY;
	delete process.env.BITBANK_API_SECRET;
	vi.restoreAllMocks();
	vi.resetModules();
});

/** シングルトンを持ち越さないよう、毎回 client.ts を読み直す */
async function freshClientModule() {
	vi.resetModules();
	return import('../../src/private/client.js');
}

function okFetch() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(mockBitbankSuccess({})));
}

describe('既定の接続先（getDefaultClient）', () => {
	it('GET（クエリ無し）の URL は https://api.bitbank.cc + パス', async () => {
		const fetchSpy = okFetch();
		const { getDefaultClient } = await freshClientModule();

		await getDefaultClient().get('/v1/user/assets');

		expect(fetchSpy.mock.calls[0][0]).toBe('https://api.bitbank.cc/v1/user/assets');
	});

	it('GET（クエリ有り）の URL は https://api.bitbank.cc + パス + クエリ', async () => {
		const fetchSpy = okFetch();
		const { getDefaultClient } = await freshClientModule();

		await getDefaultClient().get('/v1/user/spot/active_orders', { pair: 'btc_jpy', count: '10' });

		expect(fetchSpy.mock.calls[0][0]).toBe('https://api.bitbank.cc/v1/user/spot/active_orders?pair=btc_jpy&count=10');
	});

	it('POST の URL は https://api.bitbank.cc + パス', async () => {
		const fetchSpy = okFetch();
		const { getDefaultClient } = await freshClientModule();

		await getDefaultClient().post('/v1/user/spot/order', { pair: 'btc_jpy' });

		expect(fetchSpy.mock.calls[0][0]).toBe('https://api.bitbank.cc/v1/user/spot/order');
	});
});

describe('origin オプション', () => {
	it.each([
		'http://127.0.0.1:14000',
		'http://[::1]:14000',
		'http://localhost:14000',
		'https://localhost:14443',
		'http://127.0.0.1',
	])('%s → origin + パスへ送る', async (origin) => {
		const fetcher = createMockFetcher([jsonResponse(mockBitbankSuccess({})), jsonResponse(mockBitbankSuccess({}))]);
		const client = new BitbankPrivateClient({ origin, fetcher });

		await client.get('/v1/user/spot/active_orders', { pair: 'btc_jpy' });
		await client.post('/v1/user/spot/order', { pair: 'btc_jpy' });

		expect(fetcher.calls.map((c) => c.url)).toEqual([
			`${origin}/v1/user/spot/active_orders?pair=btc_jpy`,
			`${origin}/v1/user/spot/order`,
		]);
	});

	it.each([
		['空文字', ''],
		['前後の空白', ' http://127.0.0.1:14000'],
		['末尾の /', 'http://127.0.0.1:14000/'],
		['パスの接頭辞', 'http://127.0.0.1:14000/v1'],
		['パスの接頭辞（DCL 風）', 'http://127.0.0.1:14000/dcl'],
		['クエリ', 'http://127.0.0.1:14000?x=1'],
		['フラグメント', 'http://127.0.0.1:14000#f'],
		['userinfo', 'http://user:pass@127.0.0.1:14000'],
		['大文字', 'HTTP://LOCALHOST:14000'],
		['省略形の IPv4', 'http://127.1:14000'],
		['16 進の IPv4', 'http://0x7f000001:14000'],
		['既定ポートの明示', 'https://localhost:443'],
		['127.0.0.1 以外の 127/8', 'http://127.0.0.2:14000'],
		['0.0.0.0', 'http://0.0.0.0:14000'],
		['IPv4 射影 IPv6', 'http://[::ffff:127.0.0.1]:14000'],
		['末尾ドットの localhost', 'http://localhost.:14000'],
		['localhost のサブドメイン', 'http://evil.localhost:14000'],
		['本番の origin（差し替えでは受けない）', 'https://api.bitbank.cc'],
		['遠隔ホスト', 'https://example.com'],
		['プライベート IP', 'http://192.168.0.10:14000'],
		['http(s) 以外', 'ftp://127.0.0.1'],
		['URL でない', 'not a url'],
	])('%s → throw し、送信しない', (_label, origin) => {
		const fetcher = createMockFetcher([]);
		expect(() => new BitbankPrivateClient({ origin, fetcher })).toThrow(/ループバック/);
		expect(fetcher.calls).toHaveLength(0);
	});

	it('null は既定に戻さず throw する（`??` / `||` で既定へ畳まない）', () => {
		expect(() => new BitbankPrivateClient({ origin: null as unknown as string })).toThrow(/ループバック/);
	});

	it('エラーメッセージに入力値を含めない（userinfo の秘密を残さない）', () => {
		let message = '';
		try {
			new BitbankPrivateClient({ origin: 'http://user:s3cr3t@127.0.0.1:14000' });
		} catch (err) {
			message = (err as Error).message;
		}
		expect(message).not.toBe('');
		expect(message).not.toContain('s3cr3t');
	});

	it('署名は origin に依存しない（同じ時刻・同じパスなら既定と同じヘッダー）', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
		const viaDefault = createMockFetcher([jsonResponse(mockBitbankSuccess({})), jsonResponse(mockBitbankSuccess({}))]);
		const viaLab = createMockFetcher([jsonResponse(mockBitbankSuccess({})), jsonResponse(mockBitbankSuccess({}))]);
		const defaultClient = new BitbankPrivateClient({ fetcher: viaDefault });
		const labClient = new BitbankPrivateClient({ origin: 'http://127.0.0.1:14000', fetcher: viaLab });

		for (const client of [defaultClient, labClient]) {
			await client.get('/v1/user/spot/active_orders', { pair: 'btc_jpy' });
			await client.post('/v1/user/spot/order', { pair: 'btc_jpy', side: 'buy' });
		}

		expect(viaLab.calls.map((c) => c.init.headers)).toEqual(viaDefault.calls.map((c) => c.init.headers));
		expect(viaLab.calls.map((c) => c.init.body)).toEqual(viaDefault.calls.map((c) => c.init.body));
	});

	it('差し替えても POST は 5xx で再試行しない（二重発注の防止）', async () => {
		const fetcher = createMockFetcher([new Response('', { status: 503 }), new Response('', { status: 503 })]);
		const client = new BitbankPrivateClient({ origin: 'http://127.0.0.1:14000', fetcher, maxRetries: 2 });

		await expect(client.post('/v1/user/spot/order', { pair: 'btc_jpy' })).rejects.toBeInstanceOf(PrivateApiError);
		expect(fetcher.calls).toHaveLength(1);
	});

	it('差し替えても GET は 429 で Retry-After に従って再試行する', async () => {
		const fetcher = createMockFetcher([
			new Response('', { status: 429, headers: { 'Retry-After': '0' } }),
			jsonResponse(mockBitbankSuccess({ ok: true })),
		]);
		const client = new BitbankPrivateClient({ origin: 'http://127.0.0.1:14000', fetcher, maxRetries: 1 });

		await expect(client.get('/v1/user/assets')).resolves.toEqual({ ok: true });
		expect(fetcher.calls.map((c) => c.url)).toEqual([
			'http://127.0.0.1:14000/v1/user/assets',
			'http://127.0.0.1:14000/v1/user/assets',
		]);
	});
});

describe('setDefaultClient', () => {
	it('既定のクライアントが作られる前なら差し替えられ、以後の private API は差し替え先へ行く', async () => {
		const { BitbankPrivateClient: Client, getDefaultClient, setDefaultClient } = await freshClientModule();
		const fetcher = createMockFetcher([jsonResponse(mockBitbankSuccess({}))]);
		const lab = new Client({ origin: 'http://127.0.0.1:14000', fetcher });

		setDefaultClient(lab);
		await getDefaultClient().get('/v1/user/assets');

		expect(getDefaultClient()).toBe(lab);
		expect(fetcher.calls[0].url).toBe('http://127.0.0.1:14000/v1/user/assets');
	});

	it('既定のクライアントが作られた後は throw する（送り先を途中で変えない）', async () => {
		const { BitbankPrivateClient: Client, getDefaultClient, setDefaultClient } = await freshClientModule();
		const first = getDefaultClient();

		expect(() => setDefaultClient(new Client({ origin: 'http://127.0.0.1:14000' }))).toThrow(/既に初期化/);
		expect(getDefaultClient()).toBe(first);
	});

	it('2 回目の差し替えは throw する', async () => {
		const { BitbankPrivateClient: Client, getDefaultClient, setDefaultClient } = await freshClientModule();
		const lab = new Client({ origin: 'http://127.0.0.1:14000' });
		setDefaultClient(lab);

		expect(() => setDefaultClient(new Client({ origin: 'http://[::1]:14000' }))).toThrow(/既に初期化/);
		expect(getDefaultClient()).toBe(lab);
	});
});
