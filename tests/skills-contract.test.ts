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
import { DISCLAIMER_MARKET, DISCLAIMER_SHORT } from '../src/prompts/shared.js';
import { SKILL_PROMPT_SECTIONS } from '../src/prompts/skill-sections.generated.js';
import { prompts } from '../src/prompts.js';
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

	const cases = [
		{ prompt: '中級：BTCのサポレジを分析して', skill: 'support-resistance-analysis', disclaimer: DISCLAIMER_MARKET },
		{ prompt: '中級：BTCのパターン分析をして', skill: 'chart-pattern-analysis', disclaimer: DISCLAIMER_SHORT },
	] as const;

	for (const { prompt: promptName, skill, disclaimer } of cases) {
		describe(`Prompt: ${promptName}`, () => {
			const section = SKILL_PROMPT_SECTIONS[skill];
			const text = prompts.find((p) => p.name === promptName)?.messages[0]?.content[0]?.text ?? '';

			it(`本文は ${skill} の区間を btc_jpy に置き換えたもので、<pair> が残らない`, () => {
				expect(text).toContain(section.replaceAll('<pair>', 'btc_jpy'));
				expect(text).not.toContain('<pair>');
				expect(text).toContain('pair=btc_jpy');
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
