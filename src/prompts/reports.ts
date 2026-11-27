import { VISUALIZER_MODE_ARG } from './shared.js';
import { skillPromptText, userMessage } from './skill-prompt.js';
import { PromptCategory, type PromptDef, PromptLevel } from './types.js';

export const reportPrompts: PromptDef[] = [
	{
		name: '🌅 おはようレポート',
		description:
			'今朝の BTC/JPY をサッと把握する軽量レポート（価格＋前日比(24h)・ミニスパークライン・地合い1行）。Visualizer（デフォルト）または HTML 出力。',
		arguments: [VISUALIZER_MODE_ARG],
		messages: userMessage(
			skillPromptText('今朝の BTC/JPY を「なんとなく把握」する軽量レポートを作成してください。', 'morning-report'),
		),
		metadata: {
			level: PromptLevel.INTERMEDIATE,
			category: PromptCategory.ANALYSIS,
			estimatedTime: '15秒',
			tags: ['intermediate', 'btc', 'overnight', 'lightweight', 'visual', 'visualizer', 'html'],
		},
	},
	{
		name: '💼 ポートフォリオ分析レポート',
		description:
			'口座の保有資産・月初比/年初比の資産増減・構成比・テクニカル分析を Visualizer（デフォルト）または HTML で視覚化。Private API 要。',
		arguments: [VISUALIZER_MODE_ARG],
		requiresPrivateApi: true,
		messages: userMessage(skillPromptText('私の bitbank 口座の資産状況を視覚化してください。', 'portfolio-report')),
		metadata: {
			level: PromptLevel.INTERMEDIATE,
			category: PromptCategory.ANALYSIS,
			estimatedTime: '30秒',
			prerequisites: ['Private API キーの設定'],
			tags: ['intermediate', 'portfolio', 'pnl', 'private-api', 'visual', 'visualizer', 'html'],
		},
	},
];
