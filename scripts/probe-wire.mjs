/**
 * PROBE ONLY (probe/meta-visibility) — マージしない。
 *
 * 生 JSON-RPC over stdio でサーバーを起動し、`tools/call get_ticker` の応答を
 * **サーバーが stdout へ書いたバイト列そのまま**表示する。
 *
 * Inspector の UI ではなく raw で見る理由:
 * Desktop 側でマーカーが見えなかったとき「仕込み忘れ」「SDK / UI 層が落とした」
 * 「ホストがモデルへ渡さなかった」を切り分けるには、wire 上の生バイトが必要。
 *
 * 使い方:
 *   node scripts/probe-wire.mjs
 *
 * 期待する出力: A / B / C が各 1 回、互いに素なチャネルに載っていること。
 * （上流 API が 403 等で不通でも、handler は ok/fail を問わずマーカーを付けるので判定できる）
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const tsxBin = require.resolve('tsx/cli');

const MARKERS = ['PROBE-A-4471', 'PROBE-B-8123', 'PROBE-C-9350'];

const child = spawn(process.execPath, [tsxBin, resolve(repoRoot, 'src/server.ts')], {
	cwd: repoRoot,
	stdio: ['pipe', 'pipe', 'pipe'],
	env: { ...process.env, LOG_LEVEL: 'error' },
});

const send = (obj) => child.stdin.write(`${JSON.stringify(obj)}\n`);

let stderr = '';
child.stderr.on('data', (c) => {
	stderr += c.toString('utf8');
});

let buf = '';
child.stdout.on('data', (chunk) => {
	buf += chunk.toString('utf8');
	let idx;
	while ((idx = buf.indexOf('\n')) !== -1) {
		const line = buf.slice(0, idx).trim();
		buf = buf.slice(idx + 1);
		if (!line) continue;
		let msg;
		try {
			msg = JSON.parse(line);
		} catch {
			continue;
		}
		if (msg.id === 1) {
			send({ jsonrpc: '2.0', method: 'notifications/initialized' });
			send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_ticker', arguments: { pair: 'btc_jpy' } } });
		}
		if (msg.id === 2) report(line, msg.result);
	}
});

function report(line, r) {
	console.log('=== RAW WIRE LINE (tools/call response) ===');
	console.log(line);
	console.log('=== END RAW ===\n');

	const text = String(r?.content?.[0]?.text ?? '');
	const sc = JSON.stringify(r?.structuredContent ?? null);
	const meta = JSON.stringify(r?._meta ?? null);

	console.log('occurrences on the wire (each must be exactly 1):');
	for (const m of MARKERS) console.log(`  ${m}: ${line.split(m).length - 1}`);

	console.log('\nchannel placement (all must be true):');
	console.log(`  content[0].text has A : ${text.includes(MARKERS[0])}`);
	console.log(`  structuredContent has B: ${sc.includes(MARKERS[1])}`);
	console.log(`  result._meta has C    : ${meta.includes(MARKERS[2])}`);
	console.log(`  result._meta raw      : ${meta}`);

	console.log('\ncross-channel leak (all must be false — 重複すると計測が無意味):');
	console.log(`  content has B or C     : ${/PROBE-B-8123|PROBE-C-9350/.test(text)}`);
	console.log(`  structuredContent A/C  : ${/PROBE-A-4471|PROBE-C-9350/.test(sc)}`);
	console.log(`  _meta has A or B       : ${/PROBE-A-4471|PROBE-B-8123/.test(meta)}`);

	const okAll =
		MARKERS.every((m) => line.split(m).length - 1 === 1) &&
		text.includes(MARKERS[0]) &&
		sc.includes(MARKERS[1]) &&
		meta.includes(MARKERS[2]) &&
		!/PROBE-B-8123|PROBE-C-9350/.test(text) &&
		!/PROBE-A-4471|PROBE-C-9350/.test(sc) &&
		!/PROBE-A-4471|PROBE-B-8123/.test(meta);

	console.log(`\n${okAll ? 'WIRE OK — 3 チャネルに互いに素で載っている' : 'WIRE NG — 計測前に修正が必要'}`);
	child.kill();
	process.exit(okAll ? 0 : 1);
}

send({
	jsonrpc: '2.0',
	id: 1,
	method: 'initialize',
	params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'probe-wire', version: '0.0.0' } },
});

setTimeout(() => {
	console.error('TIMEOUT waiting for tools/call response.\nstderr:\n', stderr);
	child.kill();
	process.exit(1);
}, 45000);
