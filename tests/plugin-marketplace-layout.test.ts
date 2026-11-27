/**
 * Claude Code / claude.ai 向け plugin の置き場所を固定する。
 *
 * marketplace の plugin `source` をリポジトリ直下（`"./"`）にしていた時期があり、npm 用の
 * `bin/bitbank-lab-mcp.js` まで plugin に含まれていた。Claude Code は通るが、claude.ai の
 * 組織同期（Claude Desktop / claude.ai への配布）は plugin の top-level `bin/` を拒否する
 * （`marketplace_sync_bin_directory_not_allowed`。https://claude.com/docs/plugins/org-sync）。
 * そのため plugin 本体は `plugins/<name>/` に分け、`source` はそのサブディレクトリを指す。
 *
 * 見ること:
 *   1. 各 plugin の `source` が `./` で始まるサブディレクトリで、リポジトリ直下ではない
 *   2. そのディレクトリに `.claude-plugin/plugin.json` があり、`name` がエントリ名と一致する
 *      （食い違うと `Plugin "<name>" not found in marketplace` になる）
 *   3. そのディレクトリに top-level `bin/` が無い
 *   4. `.claude/skills/` のシンボリックリンクが、移動後の skill（`SKILL.md`）を指している
 *      （core.symlinks=false で普通のファイルとして置かれたものは、git の mode が 120000 のときだけリンクとみなす）
 *   5. Cursor / Codex の manifest の `skills` が、移動後の skill の置き場所を指している（#408）
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GIT_SYMLINK_MODE, gitModeOf, skillLinks } from './helpers/skill-links.js';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type MarketplaceEntry = { name: string; source: unknown };

const ENTRIES = (
	JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, '.claude-plugin/marketplace.json'), 'utf8')) as {
		plugins: MarketplaceEntry[];
	}
).plugins;

describe('marketplace の plugin の置き場所', () => {
	it('plugin が 1 つ以上ある', () => {
		expect(ENTRIES.length).toBeGreaterThan(0);
	});

	for (const entry of ENTRIES) {
		describe(`plugin: ${entry.name}`, () => {
			const source = typeof entry.source === 'string' ? entry.source : '';
			const dir = path.resolve(PACKAGE_ROOT, source);

			it('source は ./ で始まるサブディレクトリで、リポジトリ直下ではない', () => {
				expect(source, 'source は相対パスの文字列にする').toMatch(/^\.\//);
				expect(
					dir,
					'リポジトリ直下を plugin にすると npm 用の bin/ が含まれ、claude.ai の組織同期で拒否される',
				).not.toBe(PACKAGE_ROOT);
				expect(dir.startsWith(PACKAGE_ROOT + path.sep), 'source がリポジトリの外を指している').toBe(true);
			});

			it('.claude-plugin/plugin.json があり、name がエントリ名と一致する', () => {
				const manifestPath = path.join(dir, '.claude-plugin/plugin.json');
				expect(fs.existsSync(manifestPath), `${source}/.claude-plugin/plugin.json が無い`).toBe(true);
				const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { name?: unknown };
				expect(manifest.name).toBe(entry.name);
			});

			it('top-level bin/ が無い（claude.ai の組織同期が拒否する）', () => {
				expect(fs.existsSync(path.join(dir, 'bin')), `${source}/bin が存在する`).toBe(false);
			});
		});
	}
});

// Codex は manifest に skills が無いと plugin 直下の skills/ だけを探す。直下には無いので、指定が欠けると Skill が 1 つも読み込まれない。
describe('Cursor / Codex の manifest の skills', () => {
	const claudeSkillDirs = ENTRIES.map((e) => path.resolve(PACKAGE_ROOT, String(e.source), 'skills'));

	for (const manifestRel of ['.cursor-plugin/plugin.json', '.codex-plugin/plugin.json']) {
		describe(`manifest: ${manifestRel}`, () => {
			const manifest = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, manifestRel), 'utf8')) as {
				skills?: unknown;
			};
			const raw = manifest.skills;
			const values = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];

			it('文字列か文字列の配列で、./ で始まり .. を含まない', () => {
				expect(values.length, `${manifestRel} に skills が無い`).toBeGreaterThan(0);
				for (const v of values) {
					expect(typeof v).toBe('string');
					expect(v, 'Codex は ./ で始まらないパスを無視する').toMatch(/^\.\/./);
					expect(String(v).split('/'), 'Codex は .. を含むパスを無視する').not.toContain('..');
				}
			});

			it('Claude Code の plugin と同じ skill の置き場所を指し、そこに SKILL.md のある skill がある', () => {
				const dirs = values.map((v) => path.resolve(PACKAGE_ROOT, String(v)));
				for (const expected of claudeSkillDirs) {
					expect(dirs, `${manifestRel} の skills が ${path.relative(PACKAGE_ROOT, expected)} を指していない`).toContain(
						expected,
					);
				}
				for (const dir of dirs) {
					const skills = fs
						.readdirSync(dir, { withFileTypes: true })
						.filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'SKILL.md')));
					expect(skills.length, `${path.relative(PACKAGE_ROOT, dir)} に SKILL.md のある skill が無い`).toBeGreaterThan(
						0,
					);
				}
			});
		});
	}
});

describe('.claude/skills のシンボリックリンク', () => {
	const skillsDir = path.join(PACKAGE_ROOT, '.claude/skills');
	const links = skillLinks(skillsDir);

	it('リンクが 1 つ以上ある', () => {
		expect(links.length).toBeGreaterThan(0);
	});

	for (const link of links) {
		it(`${link.name} が SKILL.md のある skill を指す symlink である`, () => {
			expect(link).not.toHaveProperty('problem');
			const target = 'target' in link ? link.target : '';
			expect(fs.existsSync(path.join(target, 'SKILL.md')), `.claude/skills/${link.name} のリンク切れ`).toBe(true);
		});
	}

	describe('普通のファイルの扱い（core.symlinks=false の checkout を模す）', () => {
		let tmp = '';
		beforeEach(() => {
			tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-links-'));
			fs.mkdirSync(path.join(tmp, 'real/skill-a'), { recursive: true });
			fs.writeFileSync(path.join(tmp, 'real/skill-a/SKILL.md'), '');
			fs.mkdirSync(path.join(tmp, 'links'));
			fs.writeFileSync(path.join(tmp, 'links/skill-a'), '../real/skill-a');
			fs.writeFileSync(path.join(tmp, 'links/.DS_Store'), '');
		});
		afterEach(() => {
			fs.rmSync(tmp, { recursive: true, force: true });
		});

		it('git が symlink（mode 120000）として持つファイルはリンク先をたどり、.DS_Store などの隠しファイルは数えない', () => {
			const links = skillLinks(path.join(tmp, 'links'), () => GIT_SYMLINK_MODE);
			expect(links).toEqual([{ name: 'skill-a', target: path.join(tmp, 'real/skill-a') }]);
		});

		it.each([
			['普通のファイルとして追跡（100644）', '100644', '100644'],
			['未追跡', undefined, '未追跡'],
		])('%s のファイルは、中身がリンク先のパスでもリンクとして扱わない', (_label, mode, shown) => {
			const links = skillLinks(path.join(tmp, 'links'), () => mode);
			expect(links).toHaveLength(1);
			expect(links[0]).not.toHaveProperty('target');
			expect(links[0]).toHaveProperty('problem', expect.stringContaining(`git の mode: ${shown}`));
		});

		it('本物の symlink は git の mode を見ずにたどる', () => {
			fs.rmSync(path.join(tmp, 'links/skill-a'));
			// Windows で権限なしに作れるのは junction だけで、junction は絶対パスしか指せない。
			fs.symlinkSync(path.join(tmp, 'real/skill-a'), path.join(tmp, 'links/skill-a'), 'junction');
			const links = skillLinks(path.join(tmp, 'links'), () => {
				throw new Error('symlink では git を呼ばない');
			});
			expect(links).toEqual([{ name: 'skill-a', target: path.join(tmp, 'real/skill-a') }]);
		});
	});

	it('gitModeOf はリポジトリの symlink に 120000、普通のファイルに 100644、未追跡に undefined を返す', () => {
		expect(gitModeOf(path.join(skillsDir, 'investment-onboarding'))).toBe(GIT_SYMLINK_MODE);
		expect(gitModeOf(path.join(PACKAGE_ROOT, 'CLAUDE.md'))).toBe('100644');
		expect(gitModeOf(path.join(PACKAGE_ROOT, 'no-such-file-for-test'))).toBeUndefined();
	});
});
