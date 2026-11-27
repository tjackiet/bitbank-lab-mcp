import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type GitModeOf = (file: string) => string | undefined;

export type SkillLink = { name: string; target: string } | { name: string; problem: string };

export const GIT_SYMLINK_MODE = '120000';

export function gitModeOf(file: string): string | undefined {
	const res = spawnSync('git', ['ls-files', '--stage', '--', path.basename(file)], {
		cwd: path.dirname(file),
		encoding: 'utf8',
	});
	if (res.status !== 0) return undefined;
	return res.stdout.split(/\s/)[0] || undefined;
}

// core.symlinks=false の checkout では git が symlink をリンク先のパスを書いた普通のファイルとして置くので、普通のファイルは git の mode で symlink かを見分ける。
export function skillLinks(dir: string, modeOf: GitModeOf = gitModeOf): SkillLink[] {
	return fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((d) => !d.name.startsWith('.') && (d.isSymbolicLink() || d.isFile()))
		.map((d): SkillLink => {
			const link = path.join(dir, d.name);
			if (d.isSymbolicLink()) return { name: d.name, target: path.resolve(dir, fs.readlinkSync(link)) };
			const mode = modeOf(link);
			if (mode !== GIT_SYMLINK_MODE) {
				return {
					name: d.name,
					problem: `${d.name} は symlink ではなく普通のファイル（git の mode: ${mode ?? '未追跡、または git で確認できない'}）`,
				};
			}
			return { name: d.name, target: path.resolve(dir, fs.readFileSync(link, 'utf8').trim()) };
		});
}
