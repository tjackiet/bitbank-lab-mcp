import { DISCLAIMER_MARKET, DISCLAIMER_SHORT } from './shared.js';
import { PromptCategory, type PromptDef, PromptLevel } from './types.js';

function userMessage(text: string) {
	return [{ role: 'user' as const, content: [{ type: 'text', text }] }];
}

function buildBeginnerPairPrompt(asset: 'BTC' | 'ETH', pair: 'btc_jpy' | 'eth_jpy'): PromptDef {
	const label = asset === 'BTC' ? 'ビットコイン' : 'イーサリアム';
	return {
		name: `🔰 ${asset}の価格を分析して`,
		description: `${label}の最近の価格動向とトレンドを初心者向けに分析`,
		messages: userMessage(`最近の${asset}の動きを初級者向けに分析してください。

【表現ルール】
1. 専門用語は「わかりやすい言葉（正式名称）」で併記（例: 加熱度（RSI））
2. 初出の指標には1行説明を添える
3. 数値だけでなく「意味」を説明する
4. 指標間の関係性・整合性を明示する
5. チャート不要、テキストのみ
6. ゲージは █░（RSIは値÷10で10ブロック）、絵文字で直感的に

【ツール（3つ）】
1) get_candles(pair="${pair}", type="1day", limit=90)
2) analyze_market_signal(pair="${pair}", type="1day")
3) analyze_indicators(pair="${pair}", type="1day", limit=50) — RSI推移（直近7日）

【出力】# 📊 ${asset}分析レポート

# Part 1: 市場の動き
## 📈 価格推移 — 現在価格、1週間/1ヶ月/3ヶ月の価格・変化率・判定（+2%以上=上昇、-2%以下=下落）
## 💰 取引の活発さ — 直近1週間出来高・前週比・判定と1行の意味

# Part 2: 3つの主要指標
## 総合スコア — 数値と -100〜+100 の簡易ゲージ
## 1️⃣ 加熱度（RSI）— 初出1行説明、現在値・ゲージ、直近7日（数値→矢印）、注意1行。ASCII折れ線は描かない
## 2️⃣ 移動平均線 — 初出1行、25/75/200の表と配置、今の状態・クロスがあれば記載
## 3️⃣ 一目均衡表 — 初出1行、雲の上/中/下・距離・厚さと意味（詳細ASCIIテンプレ不要）

# Part 3: 3指標の関係性 — 整合性表と総合解釈2-3行
# Part 4: 今後の注目ポイント — RSI40回復・短期線突破・雲への接近など2-3項目
# Part 5: まとめ — 一言結論、日足ベース・ニュース/出来高・長期視点の補足

${DISCLAIMER_MARKET}`),
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
		messages: userMessage(`今注目されているコインある？

【ツール】analyze_currency_strength(topN=10) を1回のみ。get_ticker / get_tickers_jpy は不要。

【抽出】強弱スコア上位3 / 24h上昇率トップ3 / 出来高トップ3 + 市場バイアス。個別の analyze_market_signal は不要。

【出力】
> スコア = 24h変化率(40%) + RSI(30%) + SMA25乖離(25%) + 出来高順位(5%)

## 最も強気な3銘柄 — 市場バイアス、各銘柄: スコア・価格・表（24h変化率/RSI/SMA乖離/出来高）
## 24時間上昇率トップ3 — 変化率を強調
## 取引量トップ3 — 出来高を強調

- 銘柄名は太字・円表記（¥不可）・セクション間に空行・チャート不要

${DISCLAIMER_SHORT}`),
		metadata: {
			level: PromptLevel.BEGINNER,
			category: PromptCategory.ANALYSIS,
			estimatedTime: '1分',
			tags: ['beginner', 'ranking', 'volume', 'attention', 'strength'],
		},
	},
];
