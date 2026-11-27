import { SKILL_PROMPT_SECTIONS } from './skill-sections.generated.js';
import { PromptCategory, type PromptDef, PromptLevel } from './types.js';

function userMessage(text: string) {
	return [{ role: 'user' as const, content: [{ type: 'text', text }] }];
}

function skillPromptText(request: string, skill: keyof typeof SKILL_PROMPT_SECTIONS): string {
	const section = SKILL_PROMPT_SECTIONS[skill].replaceAll('<pair>', 'btc_jpy').replaceAll('<PAIR>', 'BTC/JPY');
	return `${request}\n\n${section}`;
}

export const intermediatePrompts: PromptDef[] = [
	{
		name: '中級：主要指標でBTCを分析して',
		description: '中級者向け：RSI/MACD/ボリンジャーバンド/一目均衡表/移動平均線を一括取得して総合的に分析',
		messages: userMessage(skillPromptText('代表的な指標を使ってBTCを分析して', 'indicator-analysis')),
		metadata: {
			level: PromptLevel.INTERMEDIATE,
			category: PromptCategory.ANALYSIS,
			estimatedTime: '1分',
			tags: ['intermediate', 'indicators', 'comprehensive', 'rsi', 'macd', 'bb', 'ichimoku', 'sma'],
		},
	},
	{
		name: '中級：BTCのフロー分析をして',
		description: '中級者向け：直近の売買フロー（CVD/aggressor ratio）からマーケットの方向性を分析',
		messages: userMessage(skillPromptText('BTCのフロー分析をやって', 'order-flow-analysis')),
		metadata: {
			level: PromptLevel.INTERMEDIATE,
			category: PromptCategory.ANALYSIS,
			estimatedTime: '1分',
			tags: ['intermediate', 'flow', 'cvd', 'volume', 'transactions', 'short-term'],
		},
	},
	{
		name: '中級：BTCのパターン分析をして',
		description: '中級者向け：短期（1〜3本足）から中長期（大型パターン）まで、複数の時間軸でパターンを検出',
		messages: userMessage(skillPromptText('BTCのチャートパターン分析', 'chart-pattern-analysis')),
		metadata: {
			level: PromptLevel.INTERMEDIATE,
			category: PromptCategory.ANALYSIS,
			estimatedTime: '1分',
			tags: ['intermediate', 'patterns', 'chart-patterns'],
		},
	},
	{
		name: '中級：BTCのサポレジを分析して',
		description: '中級者向け：過去の反応×板の厚み×直近の攻防から、価格帯の強弱を統合的に分析',
		messages: userMessage(skillPromptText('BTCのサポート・レジスタンスを分析して', 'support-resistance-analysis')),
		metadata: {
			level: PromptLevel.INTERMEDIATE,
			category: PromptCategory.ANALYSIS,
			estimatedTime: '1-2分',
			tags: ['intermediate', 'support', 'resistance', 'price-levels', 'orderbook', 'candles', 'comprehensive'],
		},
	},
];
