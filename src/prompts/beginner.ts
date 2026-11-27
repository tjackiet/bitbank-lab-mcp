import { skillPromptText, userMessage } from './skill-prompt.js';
import { PromptCategory, type PromptDef, PromptLevel } from './types.js';

function buildBeginnerPairPrompt(asset: 'BTC' | 'ETH', pair: 'btc_jpy' | 'eth_jpy'): PromptDef {
	const label = asset === 'BTC' ? 'ビットコイン' : 'イーサリアム';
	return {
		name: `🔰 ${asset}の価格を分析して`,
		description: `${label}の最近の価格動向とトレンドを初心者向けに分析`,
		messages: userMessage(
			skillPromptText(`最近の${asset}の動きを初級者向けに分析してください。`, 'beginner-price-analysis', pair),
		),
		metadata: {
			level: PromptLevel.BEGINNER,
			category: PromptCategory.ANALYSIS,
			estimatedTime: '30秒',
			tags: ['beginner', asset.toLowerCase(), 'trend', 'price'],
		},
	};
}

export const beginnerPrompts: PromptDef[] = [
	buildBeginnerPairPrompt('BTC', 'btc_jpy'),
	buildBeginnerPairPrompt('ETH', 'eth_jpy'),
	{
		name: '🔰 今注目のコインは？',
		description: '通貨強弱スコアと出来高・変化率から注目されている銘柄を抽出',
		messages: userMessage(skillPromptText('今注目されているコインある？', 'trending-coins')),
		metadata: {
			level: PromptLevel.BEGINNER,
			category: PromptCategory.ANALYSIS,
			estimatedTime: '1分',
			tags: ['beginner', 'ranking', 'volume', 'attention', 'strength'],
		},
	},
];
