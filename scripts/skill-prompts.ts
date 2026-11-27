import fs from 'node:fs';
import path from 'node:path';

export const SKILLS_DIR = 'plugins/bitbank-lab-mcp/skills';
export const GENERATED_PATH = 'src/prompts/skill-sections.generated.ts';

const START = '<!-- prompt:start -->';
const END = '<!-- prompt:end -->';

export function extractPromptSection(markdown: string, label: string): string | undefined {
	const start = markdown.indexOf(START);
	const end = markdown.indexOf(END);
	if (start < 0 && end < 0) return undefined;
	if (start < 0 || end < 0 || end < start) {
		throw new Error(`${label}: ${START} と ${END} は 1 組で、start が先に来る必要がある`);
	}
	if (markdown.indexOf(START, start + 1) >= 0 || markdown.indexOf(END, end + 1) >= 0) {
		throw new Error(`${label}: ${START} / ${END} が複数ある`);
	}
	const section = markdown.slice(start + START.length, end).trim();
	if (section === '') throw new Error(`${label}: ${START} 〜 ${END} が空`);
	return section;
}

export function collectSkillPromptSections(rootDir: string): Array<{ skill: string; section: string }> {
	const skillsDir = path.join(rootDir, SKILLS_DIR);
	return fs
		.readdirSync(skillsDir, { withFileTypes: true })
		.filter((d) => d.isDirectory() && fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md')))
		.map((d) => d.name)
		.sort()
		.flatMap((skill) => {
			const markdown = fs.readFileSync(path.join(skillsDir, skill, 'SKILL.md'), 'utf8');
			const section = extractPromptSection(markdown, `${skill}/SKILL.md`);
			return section === undefined ? [] : [{ skill, section }];
		});
}

function toTemplateLiteral(text: string): string {
	return `\`${text.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${')}\``;
}

export function renderGeneratedModule(sections: ReadonlyArray<{ skill: string; section: string }>): string {
	const entries = sections.map(({ skill, section }) => `\t'${skill}': ${toTemplateLiteral(section)},`);
	return [
		`// Generated from ${SKILLS_DIR}/*/SKILL.md by \`npx tsx scripts/gen_skill_prompts.ts\`. Edit the SKILL.md, not this file.`,
		'export const SKILL_PROMPT_SECTIONS = {',
		...entries,
		'} as const;',
		'',
	].join('\n');
}
