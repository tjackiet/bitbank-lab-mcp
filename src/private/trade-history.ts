import { normalizePairCodes } from '../../lib/pair-code.js';
import type { BitbankPrivateClient } from './client.js';

const TRADE_HISTORY_PAGE_SIZE = 1000;
const MAX_PAGES = 10;

interface TradeRow {
	trade_id: number;
	pair: string;
	executed_at: number;
}

export interface FilteredTradeHistory<T> {
	trades: T[];
	isComplete: boolean;
	scanned: number;
	excluded: number;
}

// 約定履歴 API は現物と信用を混ぜて返し、分けるパラメータが無いので、絞った後の件数が limit に届くまで取り直す（#455）。
export async function fetchFilteredTradeHistory<T extends TradeRow>(
	client: BitbankPrivateClient,
	options: {
		baseParams: Record<string, string>;
		order: 'asc' | 'desc';
		limit: number;
		keep: (trade: T) => boolean;
	},
): Promise<FilteredTradeHistory<T>> {
	const { baseParams, order, limit, keep } = options;
	const kept: T[] = [];
	const seenIds = new Set<number>();
	let excluded = 0;
	const cursorKey: 'since' | 'end' = order === 'desc' ? 'end' : 'since';
	let cursor: string | undefined = baseParams[cursorKey];

	for (let page = 0; page < MAX_PAGES; page++) {
		// 1 ページ目は要求件数だけ取る。混在で足りなかったときだけ、続きを上限件数でまとめて取る。
		const pageSize = page === 0 ? Math.min(limit, TRADE_HISTORY_PAGE_SIZE) : TRADE_HISTORY_PAGE_SIZE;
		const params: Record<string, string> = {
			...baseParams,
			count: String(pageSize),
			order,
			...(cursor ? { [cursorKey]: cursor } : {}),
		};
		const raw = await client.get<{ trades: T[] }>('/v1/user/spot/trade_history', params);
		const batch = normalizePairCodes(raw.trades ?? []);
		for (const t of batch) {
			if (seenIds.has(t.trade_id)) continue;
			seenIds.add(t.trade_id);
			if (keep(t)) kept.push(t);
			else excluded++;
		}

		// 終了判定は絞る前の件数で行う。絞った後の件数では、反対側の約定が多いページで続きがあるのに打ち切る。
		const exhausted = batch.length < pageSize;
		if (exhausted || kept.length >= limit) {
			return {
				trades: kept.slice(0, limit),
				isComplete: exhausted && kept.length <= limit,
				scanned: seenIds.size,
				excluded,
			};
		}

		// 同じ時刻の行は次ページで取り直し、trade_id で重複を除く。
		const lastTs = batch[batch.length - 1]?.executed_at;
		if (!lastTs) break;
		const nextCursor = String(lastTs);
		if (nextCursor === cursor) break;
		cursor = nextCursor;
	}

	return { trades: kept.slice(0, limit), isComplete: false, scanned: seenIds.size, excluded };
}

// 打ち切ったときに「反対側の約定しか見つからなかった」のか「約定が無い」のかを LLM が区別できるようにする。
export function mixedHistoryNote(
	result: FilteredTradeHistory<unknown>,
	options: { kept: string; excluded: string; order: 'asc' | 'desc'; limit: number },
): string | null {
	const { kept, excluded, order, limit } = options;
	if (result.isComplete || result.excluded === 0 || result.trades.length >= limit) return null;
	const direction = order === 'desc' ? { word: '古い', param: 'end' } : { word: '新しい', param: 'since' };
	const found =
		result.trades.length === 0
			? `取得した約定 ${result.scanned}件はすべて${excluded}で、${kept}約定はありませんでした`
			: `取得した約定 ${result.scanned}件のうち ${result.excluded}件は${excluded}で、${kept}約定は ${result.trades.length}件でした`;
	return `※ ${found}（約定履歴 API は現物と信用を混ぜて返します）。これより${direction.word}約定は取得していません。続きは ${direction.param} で期間を指定して取得してください`;
}
