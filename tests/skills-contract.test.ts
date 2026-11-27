import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	collectSkillPromptSections,
	extractPromptSection,
	GENERATED_PATH,
	renderGeneratedModule,
	SKILLS_DIR,
} from '../scripts/skill-prompts.js';
import { beginnerPrompts } from '../src/prompts/beginner.js';
import { intermediatePrompts } from '../src/prompts/intermediate.js';
import { reportPrompts } from '../src/prompts/reports.js';
import { DISCLAIMER_MARKET, DISCLAIMER_SHORT, VISUALIZER_OUTPUT_BLOCK } from '../src/prompts/shared.js';
import { SKILL_PROMPT_SECTIONS } from '../src/prompts/skill-sections.generated.js';
import { skillLinks } from './helpers/skill-links.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_ROOT = path.join(ROOT, SKILLS_DIR);
const SKILL_NAMES = fs
	.readdirSync(SKILLS_ROOT, { withFileTypes: true })
	.filter((d) => d.isDirectory() && fs.existsSync(path.join(SKILLS_ROOT, d.name, 'SKILL.md')))
	.map((d) => d.name);

function frontmatter(skill: string): string {
	const text = fs.readFileSync(path.join(SKILLS_ROOT, skill, 'SKILL.md'), 'utf8');
	return text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
}

function descriptionOf(fm: string): string {
	const block = fm.match(/^description:\s*\|\n((?:[ \t]+.*\n?)+)/m)?.[1];
	if (block) return block.replace(/^[ \t]+/gm, '').trim();
	return fm.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? '';
}

describe('Skill のフロントマター（Agent Skills の命名規則）', () => {
	it('skill が 1 つ以上ある', () => {
		expect(SKILL_NAMES.length).toBeGreaterThan(0);
	});

	for (const skill of SKILL_NAMES) {
		it(`${skill}: name がディレクトリ名と一致し、英小文字・数字・ハイフンで 64 文字以内`, () => {
			const name = frontmatter(skill)
				.match(/^name:\s*(.+)$/m)?.[1]
				?.trim();
			expect(name).toBe(skill);
			expect(skill).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(skill.length).toBeLessThanOrEqual(64);
		});

		it(`${skill}: description が空でなく 1024 文字以内`, () => {
			const description = descriptionOf(frontmatter(skill));
			expect(description.length).toBeGreaterThan(0);
			expect(description.length).toBeLessThanOrEqual(1024);
		});

		it(`${skill}: INDEX.md の一覧と .claude/skills のリンクにある`, () => {
			const index = fs.readFileSync(path.join(SKILLS_ROOT, 'INDEX.md'), 'utf8');
			expect(index).toContain(`(./${skill}/SKILL.md)`);
			const link = skillLinks(path.join(ROOT, '.claude/skills')).find((l) => l.name === skill);
			expect(link).toEqual({ name: skill, target: path.join(SKILLS_ROOT, skill) });
		});
	}
});

describe('SKILL.md から Prompt 本文への埋め込み', () => {
	it(`${GENERATED_PATH} が SKILL.md と一致している（ずれたら npx tsx scripts/gen_skill_prompts.ts）`, () => {
		const committed = fs.readFileSync(path.join(ROOT, GENERATED_PATH), 'utf8');
		expect(committed).toBe(renderGeneratedModule(collectSkillPromptSections(ROOT)));
	});

	it('生成モジュールの値が SKILL.md の区間と一致する（バッククォート等のエスケープ漏れが無い）', () => {
		const expected = Object.fromEntries(collectSkillPromptSections(ROOT).map(({ skill, section }) => [skill, section]));
		expect({ ...SKILL_PROMPT_SECTIONS }).toEqual(expected);
	});

	// フローの免責事項は shared.ts に無い独自の文面で、Prompt にあった文面のまま残す。
	const DISCLAIMER_FLOW = `---
⚠️ 免責事項：この分析は参考情報であり、解釈には誤差が含まれる場合があります。
市況は刻々と変動するため、実際のトレード前には最新状況を再確認してください。
投資判断はご自身の責任でお願いします。`;

	// ポートフォリオは API キーが無いと公開一覧から外れるので、フィルタ前の定義から探す。
	const ALL_PROMPT_DEFS = [...reportPrompts, ...beginnerPrompts, ...intermediatePrompts];
	const BTC = { pair: 'btc_jpy', display: 'BTC/JPY', asset: 'BTC' };
	const ETH = { pair: 'eth_jpy', display: 'ETH/JPY', asset: 'ETH' };
	const cases = [
		{
			prompt: '中級：BTCのサポレジを分析して',
			skill: 'support-resistance-analysis',
			disclaimer: DISCLAIMER_MARKET,
			...BTC,
		},
		{ prompt: '中級：BTCのパターン分析をして', skill: 'chart-pattern-analysis', disclaimer: DISCLAIMER_SHORT, ...BTC },
		{ prompt: '中級：主要指標でBTCを分析して', skill: 'indicator-analysis', disclaimer: DISCLAIMER_MARKET, ...BTC },
		{ prompt: '中級：BTCのフロー分析をして', skill: 'order-flow-analysis', disclaimer: DISCLAIMER_FLOW, ...BTC },
		{ prompt: '🔰 BTCの価格を分析して', skill: 'beginner-price-analysis', disclaimer: DISCLAIMER_MARKET, ...BTC },
		{ prompt: '🔰 ETHの価格を分析して', skill: 'beginner-price-analysis', disclaimer: DISCLAIMER_MARKET, ...ETH },
		{ prompt: '🔰 今注目のコインは？', skill: 'trending-coins', disclaimer: DISCLAIMER_SHORT, ...BTC },
		{ prompt: '🌅 おはようレポート', skill: 'morning-report', disclaimer: DISCLAIMER_MARKET, ...BTC },
		{ prompt: '💼 ポートフォリオ分析レポート', skill: 'portfolio-report', disclaimer: DISCLAIMER_MARKET, ...BTC },
	] as const;

	for (const { prompt: promptName, skill, disclaimer, pair, display, asset } of cases) {
		describe(`Prompt: ${promptName}`, () => {
			const section = SKILL_PROMPT_SECTIONS[skill];
			const text = ALL_PROMPT_DEFS.find((p) => p.name === promptName)?.messages[0]?.content[0]?.text ?? '';

			it(`本文は ${skill} の区間の <pair> / <PAIR> / <ASSET> を ${pair} / ${display} / ${asset} に置き換えたもので、プレースホルダが残らない`, () => {
				expect(text).toContain(
					section.replaceAll('<pair>', pair).replaceAll('<PAIR>', display).replaceAll('<ASSET>', asset),
				);
				expect(text).not.toMatch(/<pair>|<PAIR>|<ASSET>/);
				expect(text.includes(`pair=${pair}`)).toBe(section.includes('pair=<pair>'));
			});

			it('Skill 側でもツール呼び出しはペアを固定しない', () => {
				expect(section).not.toMatch(/pair=(?!<pair>)/);
			});

			it('免責事項を Prompt と同じ文面で含む', () => {
				expect(section).toContain(disclaimer);
			});
		});
	}

	it.each([
		['試され'],
		['防衛中'],
		['疲弊'],
		['直近 7 日以内に崩壊'],
		['★を 1 段階下げ'],
		['取得範囲外（過去実績で評価）'],
		['必ず「📌 分析範囲について」から始める'],
		['content をそのまま使う'],
		['analyze_support_resistance(pair=<pair>, lookbackDays=90, topN=3)'],
	])('サポレジの区間に「%s」が残っている', (phrase) => {
		expect(SKILL_PROMPT_SECTIONS['support-resistance-analysis']).toContain(phrase);
	});

	it.each([
		['完成から 80 日超'],
		['ターゲット到達済み'],
		['完成から 40 日超'],
		['10% 超離れている'],
		['余裕が無い軸'],
		['limit=180'],
		['#127'],
		['render_candle_pattern_diagram'],
	])('パターンの区間に「%s」が残っている', (phrase) => {
		expect(SKILL_PROMPT_SECTIONS['chart-pattern-analysis']).toContain(phrase);
	});

	it.each([
		['analyze_indicators(pair=<pair>, type=1day, limit=200)'],
		['# 📊 <PAIR> 日足分析レポート'],
		['content の数値をそのまま使う'],
		['矛盾は明示'],
		['## 🎯 次の転換サイン'],
	])('主要指標の区間に「%s」が残っている', (phrase) => {
		expect(SKILL_PROMPT_SECTIONS['indicator-analysis']).toContain(phrase);
	});

	it.each([
		['get_flow_metrics(pair=<pair>, limit=300, bucketMs=60000, view=full, nonZeroOnly=true)'],
		['get_transactions(pair=<pair>, limit=200, view=full)'],
		['Aggressor Ratio（50% を基準）'],
		['Volume Spike（z > 2）'],
		['直近 1〜3 時間を重視'],
		['鮮度が足りない'],
		['📸 YYYY/MM/DD HH:MM:SS JST 時点'],
	])('フローの区間に「%s」が残っている', (phrase) => {
		expect(SKILL_PROMPT_SECTIONS['order-flow-analysis']).toContain(phrase);
	});

	it.each([
		['get_candles(pair=<pair>, type=1day, limit=90)'],
		['analyze_market_signal(pair=<pair>, type=1day)'],
		['analyze_indicators(pair=<pair>, type=1day, limit=50)'],
		['# 📊 <ASSET>分析レポート'],
		['わかりやすい言葉（正式名称）'],
		['RSI は値 ÷ 10 で 10 ブロック'],
		['+2% 以上 = 上昇、-2% 以下 = 下落'],
	])('初心者向け価格分析の区間に「%s」が残っている', (phrase) => {
		expect(SKILL_PROMPT_SECTIONS['beginner-price-analysis']).toContain(phrase);
	});

	it.each([
		['analyze_currency_strength(topN=10)` を 1 回だけ'],
		['get_ticker` / `get_tickers_jpy` は不要'],
		['スコア = 24h 変化率(40%) + RSI(30%) + SMA25 乖離(25%) + 出来高順位(5%)'],
		['¥ は使わない'],
	])('注目コインの区間に「%s」が残っている', (phrase) => {
		expect(SKILL_PROMPT_SECTIONS['trending-coins']).toContain(phrase);
	});

	it.each([
		['【ツール（この 3 つだけ。追加呼び出し禁止）】'],
		['**必ず並列で** 呼ぶ'],
		['前日比(24h) = get_ticker が算出済みの 24h変動'],
		['<svg><polyline>'],
		['render_chart_svg は使わない'],
		['close が 1 点だけのとき（n < 2）は x の除算ができないため、polyline を描かず'],
		['【出さないもの】'],
	])('おはようレポートの区間に「%s」が残っている', (phrase) => {
		expect(SKILL_PROMPT_SECTIONS['morning-report']).toContain(phrase);
	});

	it.each([
		['analyze_my_portfolio(include_pnl=true, include_technical=true, include_deposit_withdrawal=true)'],
		['monthly_equity_series'],
		['**同じ図の使い回し禁止。**'],
		['⚠️ 本レポートの数値は所得税計算に使用できません。'],
	])('ポートフォリオの区間に「%s」が残っている', (phrase) => {
		expect(SKILL_PROMPT_SECTIONS['portfolio-report']).toContain(phrase);
	});

	it.each([
		['morning-report'],
		['portfolio-report'],
	] as const)('%s の区間は Visualizer の出力指示を shared.ts と同じ文面で含む', (skill) => {
		expect(SKILL_PROMPT_SECTIONS[skill]).toContain(VISUALIZER_OUTPUT_BLOCK);
	});

	it.each([
		['API キーが設定されていないため、口座の情報は取得できません'],
		['残高や損益を推測したりしない'],
		['`BITBANK_API_KEY` と `BITBANK_API_SECRET` の両方'],
		['「出金」権限は付けない'],
		['チャットに貼らせない'],
	])('ポートフォリオの Skill（区間外）に API キーが無いときの指示「%s」がある', (phrase) => {
		const skillMd = fs.readFileSync(path.join(SKILLS_ROOT, 'portfolio-report', 'SKILL.md'), 'utf8');
		const outsideSection = skillMd.slice(0, skillMd.indexOf('<!-- prompt:start -->'));
		expect(outsideSection).toContain(phrase);
	});
});

describe('extractPromptSection / renderGeneratedModule', () => {
	it('マーカーが無ければ undefined', () => {
		expect(extractPromptSection('# skill\n本文', 'x')).toBeUndefined();
	});

	it('片方だけ・逆順・重複・空はエラー', () => {
		expect(() => extractPromptSection('<!-- prompt:start -->\nA', 'x')).toThrow('1 組');
		expect(() => extractPromptSection('<!-- prompt:end -->\nA\n<!-- prompt:start -->', 'x')).toThrow('1 組');
		expect(() =>
			extractPromptSection('<!-- prompt:start -->A<!-- prompt:end -->\n<!-- prompt:start -->B<!-- prompt:end -->', 'x'),
		).toThrow('複数');
		expect(() => extractPromptSection('<!-- prompt:start -->\n \n<!-- prompt:end -->', 'x')).toThrow('空');
	});

	it('区間の前後の空白を落として取り出す', () => {
		expect(extractPromptSection('前\n<!-- prompt:start -->\n\n本文\n\n<!-- prompt:end -->\n後', 'x')).toBe('本文');
	});

	it('バッククォート・ドル波括弧・バックスラッシュをテンプレートリテラル内でエスケープする', () => {
		const out = renderGeneratedModule([{ skill: 'a-b', section: `\`x\` \${y} \\n` }]);
		expect(out).toContain(`\t'a-b': \`\\\`x\\\` \\\${y} \\\\n\`,`);
	});
});
