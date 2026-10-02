/**
 * 研究用の起動口の本体（ADR-0008）。
 *
 * private API の接続先を、ループバックに立てたモックや中継（プロキシ）へ差し替えてから
 * MCP サーバーを起動する。**`lab/` は npm の配布物にも Docker イメージにも入らない**
 * （`package.json` の `files` と `Dockerfile` の `COPY` に無い）。配布物の側にあるのは、
 * 外から有効にできない差し込み口（`BitbankPrivateClient` の `origin` と `setDefaultClient`）だけ。
 *
 * 副作用のある入口は `lab/start.ts`。こちらは依存を引数で受け取り、テストから import できる
 * （`tsconfig.json` の include に `lab/` は無いが、テストからの import で型検査の対象に入る）。
 */

import { getErrorMessage } from '../lib/error.js';
import { log } from '../lib/logger.js';
import { BitbankPrivateClient, setDefaultClient } from '../src/private/client.js';
import { isPrivateApiEnabled } from '../src/private/config.js';

export const ORIGIN_FLAG = '--private-api-origin';

/** 引数・設定の誤りで起動しないときの終了コード */
export const EXIT_USAGE = 2;

const PREFIX = '[bitbank-lab-mcp lab]';

const USAGE = `使い方: tsx lab/start.ts ${ORIGIN_FLAG}=<origin>
  <origin> はループバックの http(s) origin（例: http://127.0.0.1:14000）。詳細は lab/README.md
`;

/** 本番の接続先。このホストへの要求は、ここに挙げたパス（認証不要のペア情報）だけを通す */
const PRODUCTION_ORIGIN = 'https://api.bitbank.cc';
/** 完全一致で比べる（接頭辞にしない。`/v1/spot/` 配下の未知のパスも止める）。クエリは pathname に含まれない */
const PRODUCTION_PUBLIC_PATHS = new Set(['/v1/spot/pairs']);

export type ParsedLabArgs = { ok: true; origin: string } | { ok: false; error: string };

/**
 * 起動口の引数を読む。受け付けるのは `--private-api-origin=<origin>` か
 * `--private-api-origin <origin>` を 1 回だけ。未知の引数は弾く（打ち間違いを黙って無視しない）。
 *
 * origin の中身はここでは検査しない。検査は `BitbankPrivateClient` のコンストラクタ 1 か所に置く。
 */
export function parseLabArgs(argv: readonly string[]): ParsedLabArgs {
	let origin: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		let value: string | undefined;
		if (arg === ORIGIN_FLAG) {
			value = argv[i + 1];
			i++;
			if (value === undefined) return { ok: false, error: `${ORIGIN_FLAG} に値がありません` };
		} else if (arg.startsWith(`${ORIGIN_FLAG}=`)) {
			value = arg.slice(ORIGIN_FLAG.length + 1);
		} else {
			// 引数の中身は出さない。userinfo 付きの URL（`http://user:pass@…`）を
			// フラグ無しで渡したときに、パスワードが stderr に残るため
			return { ok: false, error: `未知の引数があります（受け付けるのは ${ORIGIN_FLAG} だけです）` };
		}
		if (origin !== undefined) return { ok: false, error: `${ORIGIN_FLAG} が 2 回以上指定されています` };
		origin = value;
	}
	if (origin === undefined) return { ok: false, error: `${ORIGIN_FLAG} の指定が必要です` };
	return { ok: true, origin };
}

/**
 * 本番の接続先へ向かう要求のうち、通してはいけないものか。
 * `https://api.bitbank.cc` へは `/v1/spot/pairs`（ペア情報。認証不要）だけを通し、それ以外
 * （`/v1/user/…` の private API と、将来足されうる未知のパス）は止める。
 */
export function isBlockedProductionUrl(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	return parsed.origin === PRODUCTION_ORIGIN && !PRODUCTION_PUBLIC_PATHS.has(parsed.pathname);
}

/**
 * 本番の private API へ向かう fetch を止める（実行時の遮断）。
 *
 * private API の要求はすべて既定のクライアントを通り、差し替え先へ行くはず。ここに来るのは
 * 既定のクライアントを迂回した要求だけで、それは差し替え先を迂回して本番へ直行する。
 * 静的な tripwire（`tests/private-api-origin-tripwire.test.ts`）を実行時に補う。
 */
export function guardProductionPrivateApi(fetchImpl: typeof fetch, onBlocked: (url: string) => void): typeof fetch {
	const guarded = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const url = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input);
		if (isBlockedProductionUrl(url)) {
			onBlocked(url);
			return Promise.reject(
				new Error(
					'研究用の起動口では、本番の private API（https://api.bitbank.cc）へは送りません。' +
						'既定のクライアントを経由していない要求です（ADR-0008）',
				),
			);
		}
		return fetchImpl(input, init);
	};
	return guarded as typeof fetch;
}

export interface LabDeps {
	argv: readonly string[];
	/** 警告とログの出力先。stdio トランスポートでは stdout が JSON-RPC そのものなので、必ず stderr を渡す */
	writeStderr: (message: string) => void;
	/** `src/server.ts` の動的 import。差し替えを終えてから呼ぶ */
	startServer: () => Promise<unknown>;
}

/**
 * 接続先を差し替えてからサーバーを起動する。引数・設定の誤りでは、サーバーを読み込む前に
 * `EXIT_USAGE` を返す。**黙って本番の接続先へ戻すことはしない。**
 */
export async function runLab(deps: LabDeps): Promise<number> {
	const parsed = parseLabArgs(deps.argv);
	if (!parsed.ok) {
		deps.writeStderr(`${PREFIX} ${parsed.error}\n${USAGE}`);
		return EXIT_USAGE;
	}

	// キーが無いと private ツールが登録されず、差し替えても何も起きない。
	// 「差し替えたつもりで何も効いていない」状態で実験を始めないよう、起動しない。
	if (!isPrivateApiEnabled()) {
		deps.writeStderr(
			`${PREFIX} BITBANK_API_KEY / BITBANK_API_SECRET が未設定のため private ツールが無効です。` +
				'起動しません（モックに向けるときはダミーの値を設定してください）\n',
		);
		return EXIT_USAGE;
	}

	let client: BitbankPrivateClient;
	try {
		client = new BitbankPrivateClient({ origin: parsed.origin });
	} catch (err) {
		deps.writeStderr(`${PREFIX} ${getErrorMessage(err)}\n${USAGE}`);
		return EXIT_USAGE;
	}

	// クライアントは構築時の fetch を束縛済み（送り先は差し替え先）。遮断は、それ以外の経路の fetch に効く。
	globalThis.fetch = guardProductionPrivateApi(globalThis.fetch, (url) => {
		deps.writeStderr(`${PREFIX} 本番の private API への要求を止めました: ${new URL(url).pathname}\n`);
	});
	setDefaultClient(client);

	deps.writeStderr(
		`${PREFIX} private API の接続先: ${parsed.origin}\n` +
			`${PREFIX} https://api.bitbank.cc への要求は /v1/spot/pairs（ペア情報）以外を止めます。公開 API（public.bitbank.cc）は本番のままです\n`,
	);
	log('warn', { type: 'private_api_origin_override', origin: parsed.origin });

	await deps.startServer();
	return 0;
}
