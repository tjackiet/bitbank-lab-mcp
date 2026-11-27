import fs from 'node:fs';
import path from 'node:path';
import { collectSkillPromptSections, GENERATED_PATH, renderGeneratedModule } from './skill-prompts.js';

const outPath = path.join(process.cwd(), GENERATED_PATH);
fs.writeFileSync(outPath, renderGeneratedModule(collectSkillPromptSections(process.cwd())), 'utf8');
console.log(`Generated: ${GENERATED_PATH}`);
