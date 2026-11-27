import { DISCLAIMER_MARKET } from './shared.js';
import { SKILL_PROMPT_SECTIONS } from './skill-sections.generated.js';
import { PromptCategory, type PromptDef, PromptLevel } from './types.js';

function userMessage(text: string) {
	return [{ role: 'user' as const, content: [{ type: 'text', text }] }];
}

const INDICATORS_TEXT = `代表的な指標を使ってBTCを分析して

【ツール】analyze_indicators(pair=btc_jpy, type=1day, limit=200)

【方針】総合判定→各指標横断→矛盾は明示→次の注目点を具体化。content の数値をそのまま使う。

【出力】Markdown見出しで区切る。補足は行頭「└」（前行行末にスペース2つで改行）。

# 📊 BTC/JPY 日足分析レポート
🔴/🟡/🟢 判定 + 現在価格（前日比）

## 📈 勢い指標
### RSI — 数値、█░ゲージ、初出1行説明、直近n日推移1行、転換サイン
### MACD — 数値、│中央の簡易バー（ヒストグラムの符号と強さ）、線・シグナル・ヒストグラム、状態・直近動き・転換サイン

## 📉 トレンド指標
### 移動平均線 — 25/75/200と乖離、配置（強気/弱気/混在）
### 一目均衡表 — 雲の上/中/下、距離・厚さ、三役の内訳3行、意味1行（大型ASCIIテンプレ不要）

## 📐 ボリンジャーバンド — ±2σ/中心、現在位置、バンド幅と状態

## 📍 重要な価格帯 — 現在価格中心の簡潔な縦リスト（BB±2σ、雲上下、SMA25/75/200）

## ⚖️ 指標の総合判断 — 矛盾時は短期vs中期を分けて説明、一致時は結論

## 🎯 次の転換サイン — 反発条件・下落継続条件

## 💡 まとめ — 2-3行

${DISCLAIMER_MARKET}`;

const PROMPT_PAIR = 'btc_jpy';

function skillPromptText(request: string, skill: keyof typeof SKILL_PROMPT_SECTIONS): string {
	return `${request}\n\n${SKILL_PROMPT_SECTIONS[skill].replaceAll('<pair>', PROMPT_PAIR)}`;
}

export const intermediatePrompts: PromptDef[] = [
	{
		name: '中級：主要指標でBTCを分析して',
		description: '中級者向け：RSI/MACD/ボリンジャーバンド/一目均衡表/移動平均線を一括取得して総合的に分析',
		messages: userMessage(INDICATORS_TEXT),
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
		messages: userMessage(`BTCのフロー分析をやって

【ツール】
1) get_flow_metrics(pair=btc_jpy, limit=300, bucketMs=60000, view=full, nonZeroOnly=true)
2) get_transactions(pair=btc_jpy, limit=200, view=full) — 必要時

【用途】デイトレ〜短期スイングの地合い確認。
        執行タイミング判断（数秒～数分の売買）には鮮度が不足するため非推奨。

【方針】CVDトレンド、Aggressor Ratio（50%基準）、Volume Spike（z>2）、直近1-3時間重視

【出力】冒頭に 📸 YYYY/MM/DD HH:MM:SS JST 時点
- 結論（買い/売り/拮抗）
- CVD推移
- スパイク（あれば）
- 価格との連動状況

---
⚠️ 免責事項：この分析は参考情報であり、解釈には誤差が含まれる場合があります。
市況は刻々と変動するため、実際のトレード前には最新状況を再確認してください。
投資判断はご自身の責任でお願いします。`),
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
