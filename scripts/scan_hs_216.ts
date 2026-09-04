/**
 * scan_hs_216.ts — H&S / 逆H&S の strict 検出を探すスキャン（issue #216 の実害例収集用）
 *
 * `detect_patterns` を `patterns: [head_and_shoulders, inverse_head_and_shoulders]` /
 * `view=full` で、指定ペアを順に叩き、各ペアの `検出経路:` 行だけを出す。
 * **strict が 1 件以上あるペアで打ち切り**、そのペアの `content[0].text` を全文出す
 * （#216 の計算に要る pivot 明細行は `view=full` にしか出ない。detectPatternsViewsHandler.ts:1088）。
 *
 * 時間足は指定順に総当たりする（既定 1hour → 4hour → 1day）。
 * ある時間足で全ペア 0 件なら次の時間足へ落ちる。
 *
 * コードは変えない。読み取り専用の計測スクリプト。
 */

import { toolDef } from '../src/handlers/detectPatternsHandler.js';
import { DETECTION_ROUTE_LABEL } from '../src/handlers/detectPatternsViewsHandler.js';
import { DetectPatternsInputSchema } from '../src/schemas.js';
import { parseArgs, runCli } from './cli-utils.js';

const DEFAULT_PAIRS = ['eth_jpy', 'xrp_jpy', 'sol_jpy', 'doge_jpy', 'ltc_jpy', 'bcc_jpy'];
const DEFAULT_TYPES = ['1hour', '4hour', '1day'];

/**
 * content から `検出経路:` 行を取り出す。0 件検出のときは行そのものが出ない
 * （`buildDetectionRouteLine` が空文字を返す）ので null。
 */
function detectionRouteLine(text: string): string | null {
	const line = text.split('\n').find((l) => l.trimStart().startsWith(`${DETECTION_ROUTE_LABEL}:`));
	return line ? line.trim() : null;
}

/**
 * `検出経路:` 行から strict 件数を読む。行の書式は `buildDetectionRouteLine` の 2 分岐:
 *   1. `検出経路: 全 N 件とも strict（relaxed フォールバック由来は 0 件）`
 *   2. `検出経路: strict N 件 / relaxed フォールバック由来 M 件（…）`
 * どちらにも一致しなければ null（書式が変わった可能性があるので 0 と混同させない）。
 */
function strictCount(routeLine: string | null): number | null {
	if (!routeLine) return 0; // 行が無い = 0 件検出
	const all = routeLine.match(/全\s*([\d,]+)\s*件とも strict/);
	if (all) return Number(all[1].replace(/,/g, ''));
	const mixed = routeLine.match(/strict\s*([\d,]+)\s*件/);
	if (mixed) return Number(mixed[1].replace(/,/g, ''));
	return null;
}

async function main(): Promise<void> {
	const { flags } = parseArgs();
	const pairs = typeof flags.pairs === 'string' ? flags.pairs.split(',') : DEFAULT_PAIRS;
	const types = typeof flags.types === 'string' ? flags.types.split(',') : DEFAULT_TYPES;
	const limit = typeof flags.limit === 'string' ? Number(flags.limit) : undefined;

	for (const type of types) {
		console.log(`\n===== type=${type} =====`);
		for (const pair of pairs) {
			// **必ず Zod を通してから handler に渡す。** server.ts は inputSchema で parse してから
			// handler を呼ぶので、ここで直接呼ぶと既定値（limit=90 等）が入らない。
			// limit が undefined のままだとヘッダの `${limit ?? count}本から` が
			// パターン件数に化けて「3本から3件を検出」のような嘘の行が出る
			// （detectPatternsHandler.ts:103。スキャン自体は下流の既定で 90 本走るので気づきにくい）。
			const input = DetectPatternsInputSchema.parse({
				pair,
				type,
				...(limit == null ? {} : { limit }),
				patterns: ['head_and_shoulders', 'inverse_head_and_shoulders'],
				view: 'full',
			});
			const res = (await toolDef.handler(input as never)) as {
				ok?: boolean;
				content?: Array<{ type: string; text?: string }>;
				summary?: string;
			};

			const text = res?.content?.[0]?.text;
			if (typeof text !== 'string') {
				console.log(`${pair.padEnd(9)} ERROR: ${res?.summary ?? JSON.stringify(res)}`);
				continue;
			}

			const route = detectionRouteLine(text);
			console.log(`${pair.padEnd(9)} ${route ?? '検出経路: (行なし — 0 件検出)'}`);

			const strict = strictCount(route);
			if (strict == null) {
				console.log('  ※ 検出経路行の書式が想定外。件数を読めないので判定を保留し、続行する。');
				continue;
			}
			if (strict >= 1) {
				console.log(`\n----- HIT: ${pair} ${type}（strict ${strict} 件）content 全文 -----\n`);
				console.log(text);
				return;
			}
		}
	}
	console.log('\n全ペア・全時間足で strict 0 件。');
}

runCli(main);
