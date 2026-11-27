import { SKILL_PROMPT_SECTIONS } from './skill-sections.generated.js';

export type SkillName = keyof typeof SKILL_PROMPT_SECTIONS;

export function userMessage(text: string) {
	return [{ role: 'user' as const, content: [{ type: 'text', text }] }];
}

export function skillPromptText(request: string, skill: SkillName, pair = 'btc_jpy'): string {
	const asset = pair.split('_')[0].toUpperCase();
	const section = SKILL_PROMPT_SECTIONS[skill]
		.replaceAll('<pair>', pair)
		.replaceAll('<PAIR>', `${asset}/JPY`)
		.replaceAll('<ASSET>', asset);
	return `${request}\n\n${section}`;
}
