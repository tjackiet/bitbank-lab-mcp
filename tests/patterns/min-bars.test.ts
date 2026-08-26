/**
 * tests/patterns/min-bars.test.ts
 *
 * `patterns/min-bars.ts`（時間足 × 検出器 → 最小要求バー数）の契約テスト。
 *
 * 目的は 2 つ:
 *   1. 導出式が各検出器の実装と同じ意味論であること（境界の off-by-one を含む）
 *   2. `docs/tools.md` の「`limit` の実効下限」表が手書きのまま drift しないこと
 *
 * 2 は表を**実ファイルからパースして**突き合わせる。値を本ファイルに写経すると
 * 「テストと docs が両方古い」状態を作れてしまい、drift 検出にならない。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CandleTypeEnum } from '../../src/schema/base.js';
import { getDefaultParamsForTf } from '../../tools/patterns/config.js';
import { MIN_PATTERN_DAYS } from '../../tools/patterns/detect_doubles.js';
import { FORMING_MIN_DAYS as HS_FORMING_MIN_DAYS } from '../../tools/patterns/detect_hs.js';
import { getFlagParams } from '../../tools/patterns/detect_pennants.js';
import { getTriangleParams } from '../../tools/patterns/detect_triangles.js';
import { FORMING_MIN_DAYS as TRIPLE_FORMING_MIN_DAYS } from '../../tools/patterns/detect_triples.js';
import { getWedgeBarParams } from '../../tools/patterns/detect_wedges.js';
import { barsPerDay, formingReversalDaysPerBar } from '../../tools/patterns/helpers.js';
import {
	isDetectorReachable,
	MIN_BARS_DETECTORS,
	type MinBarsDetector,
	minBarsForDetector,
	minBarsTableForTf,
} from '../../tools/patterns/min-bars.js';
import { assessScanWindow } from '../../tools/patterns/scan-window.js';

const ALL_TIMEFRAMES = CandleTypeEnum.options;

// ── docs/tools.md のパース ────────────────────────

const DOCS_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../docs/tools.md');

/**
 * `docs/tools.md` の指定見出し直後にある最初の markdown テーブルを
 * 「1 列目のラベル → 残りのセル」の Map として返す。
 */
function parseMarkdownTable(marker: string): Map<string, string[]> {
	const doc = readFileSync(DOCS_PATH, 'utf8');
	const markerIdx = doc.indexOf(marker);
	expect(markerIdx, `docs/tools.md に目印 "${marker}" が見つからない`).toBeGreaterThanOrEqual(0);

	const lines = doc.slice(markerIdx).split('\n');
	const rows = new Map<string, string[]>();
	let started = false;
	for (const line of lines) {
		const isRow = line.trimStart().startsWith('|');
		if (!isRow) {
			if (started) break; // テーブルが終わった
			continue;
		}
		started = true;
		const cells = line
			.trim()
			.replace(/^\|/, '')
			.replace(/\|$/, '')
			.split('|')
			.map((c) => c.trim());
		// ヘッダ行と区切り行（---）は捨てる
		if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
		const [label, ...rest] = cells;
		rows.set(label, rest);
	}
	expect(rows.size, `"${marker}" の直後にテーブルが無い`).toBeGreaterThan(0);
	return rows;
}

/** `` `1min` / `5min` `` のような 1 列目ラベルから時間足を取り出す。 */
function timeframesFromLabel(label: string): string[] {
	return [...label.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

// ── 1. 導出式の意味論 ─────────────────────────────

describe('minBarsForDetector — 導出式', () => {
	it('全時間足 × 全検出器で正の整数を返す', () => {
		for (const tf of ALL_TIMEFRAMES) {
			for (const detector of MIN_BARS_DETECTORS) {
				const bars = minBarsForDetector(tf, detector);
				expect(Number.isInteger(bars), `${tf} × ${detector} が整数でない: ${bars}`).toBe(true);
				expect(bars, `${tf} × ${detector}`).toBeGreaterThan(0);
			}
		}
	});

	it('未知の時間足は barsPerDay と同じく 1day 相当にフォールバックする', () => {
		for (const detector of MIN_BARS_DETECTORS) {
			expect(minBarsForDetector('7hour', detector), detector).toBe(minBarsForDetector('1day', detector));
		}
	});

	it('minBarsTableForTf は全検出器を漏れなく含む', () => {
		const table = minBarsTableForTf('1day');
		expect(Object.keys(table).sort()).toEqual([...MIN_BARS_DETECTORS].sort());
		for (const detector of MIN_BARS_DETECTORS) {
			expect(table[detector]).toBe(minBarsForDetector('1day', detector));
		}
	});

	describe('形成中の反転パターン — Math.round の境界', () => {
		// detect_doubles / detect_hs は手書きの daysPerBar、detect_triples は helpers の
		// daysPerBar を使う。どちらも patternDays = Math.round(formationBars × daysPerBar)。
		const cases: Array<{ detector: MinBarsDetector; minDays: number; dpb: (tf: string) => number }> = [
			{ detector: 'forming_double', minDays: MIN_PATTERN_DAYS, dpb: formingReversalDaysPerBar },
			{ detector: 'forming_hs', minDays: HS_FORMING_MIN_DAYS, dpb: formingReversalDaysPerBar },
			{ detector: 'forming_triple', minDays: TRIPLE_FORMING_MIN_DAYS, dpb: (tf) => 1 / barsPerDay(tf) },
		];

		for (const { detector, minDays, dpb } of cases) {
			it(`${detector}: 導出値ちょうどで閾値を満たし、1 本足りないと満たさない`, () => {
				for (const tf of ALL_TIMEFRAMES) {
					const bars = minBarsForDetector(tf, detector);
					// 窓が bars 本のとき、取りうる最大の formationBars は bars - 1（添字差）。
					const patternDaysAt = (windowBars: number) => Math.round((windowBars - 1) * dpb(tf));
					expect(patternDaysAt(bars), `${tf} × ${detector}`).toBeGreaterThanOrEqual(minDays);
					expect(patternDaysAt(bars - 1), `${tf} × ${detector}（1 本不足）`).toBeLessThan(minDays);
				}
			});
		}
	});

	it('completed_wedge: generateWindows が窓を 1 つ生成できる最小本数（windowSizeMin + 1）', () => {
		for (const tf of ALL_TIMEFRAMES) {
			const { windowSizeMin } = getWedgeBarParams(tf);
			const bars = minBarsForDetector(tf, 'completed_wedge');
			// generateWindows は `start + size < totalBars` で回すので `size < totalBars` が要る
			expect(windowSizeMin, `${tf}`).toBeLessThan(bars);
			expect(windowSizeMin, `${tf}（1 本余分でない）`).toBeGreaterThanOrEqual(bars - 1);
		}
	});

	it('triangle: windowSizes が空にならない最小本数（全時間足で同値）', () => {
		for (const tf of ALL_TIMEFRAMES) {
			const { minWindowBars } = getTriangleParams(tf);
			const bars = minBarsForDetector(tf, 'triangle');
			// effectiveMax = min(lastIdx - 5, maxWindowBars) に対して minWindowBars <= effectiveMax
			expect(minWindowBars, `${tf}`).toBeLessThanOrEqual(bars - 1 - 5);
			expect(minWindowBars, `${tf}（1 本余分でない）`).toBeGreaterThan(bars - 2 - 5);
		}
		// minWindowBars は時間足でスケールしない定数なので、値は全時間足で一致する
		const distinct = new Set(ALL_TIMEFRAMES.map((tf) => minBarsForDetector(tf, 'triangle')));
		expect([...distinct]).toEqual([21]);
	});

	it('flag_pennant: スキャンループの初回反復に入れる最小本数', () => {
		for (const tf of ALL_TIMEFRAMES) {
			const { poleMinBars, consMinBars } = getFlagParams(tf);
			const bars = minBarsForDetector(tf, 'flag_pennant');
			// ループは `poleEnd = poleMinBars` から `poleEnd <= lastIdx - consMinBars` で回る
			const lastIdxAt = (windowBars: number) => windowBars - 1;
			expect(poleMinBars, `${tf}`).toBeLessThanOrEqual(lastIdxAt(bars) - consMinBars);
			expect(poleMinBars, `${tf}（1 本不足）`).toBeGreaterThan(lastIdxAt(bars - 1) - consMinBars);
		}
	});

	it('isDetectorReachable は最小要求バー数ちょうどで true、1 本足りないと false', () => {
		for (const tf of ALL_TIMEFRAMES) {
			for (const detector of MIN_BARS_DETECTORS) {
				const bars = minBarsForDetector(tf, detector);
				expect(isDetectorReachable(tf, detector, bars), `${tf} × ${detector}`).toBe(true);
				expect(isDetectorReachable(tf, detector, bars - 1), `${tf} × ${detector}（1 本不足）`).toBe(false);
			}
		}
	});
});

// ── 2. docs/tools.md との突き合わせ ───────────────

describe('docs/tools.md 「`limit` の実効下限」表との一致', () => {
	it('§1 構造的下限の表が assessScanWindow / getDefaultParamsForTf と一致する', () => {
		const rows = parseMarkdownTable('**1. 構造的下限（警告あり）**');
		const covered: string[] = [];

		for (const [label, cells] of rows) {
			const tfs = timeframesFromLabel(label);
			if (!tfs.length) continue; // ヘッダ行
			const [docDepth, docMin] = cells.map((c) => Number(c));
			for (const tf of tfs) {
				const { swingDepth, minBarsBetweenSwings } = getDefaultParamsForTf(tf);
				expect(swingDepth, `docs §1: ${tf} の既定 swingDepth`).toBe(docDepth);
				expect(
					assessScanWindow(0, swingDepth, minBarsBetweenSwings).minViableLimit,
					`docs §1: ${tf} の構造的下限`,
				).toBe(docMin);
				covered.push(tf);
			}
		}
		// 表が時間足を取りこぼしていないこと（新しい時間足を足したら落ちる）
		expect(covered.sort()).toEqual([...ALL_TIMEFRAMES].sort());
	});

	it('§2 日数閾値由来の下限の表が minBarsForDetector と一致する', () => {
		const rows = parseMarkdownTable('**2. 日数閾値由来の下限（警告なし）**');

		// 表の列順 → 検出器キー。ヘッダ行から機械的に対応づけ、列の入れ替えでも落ちるようにする。
		const headerCells = rows.get('時間足');
		expect(headerCells, 'docs §2: ヘッダ行が「時間足」で始まっていない').toBeDefined();
		const columnToDetector: Record<string, MinBarsDetector> = {
			'forming triple（21日）': 'forming_triple',
			'完成済み wedge（25日窓）': 'completed_wedge',
			'flag / pennant（最小 1+2日）': 'flag_pennant',
		};
		const detectorsByColumn = (headerCells as string[]).map((h) => {
			const detector = columnToDetector[h];
			expect(detector, `docs §2: 未知の列見出し "${h}"`).toBeDefined();
			return detector;
		});

		const covered: string[] = [];
		for (const [label, cells] of rows) {
			const tfs = timeframesFromLabel(label);
			if (!tfs.length) continue; // ヘッダ行
			expect(cells.length, `docs §2: ${label} の列数`).toBe(detectorsByColumn.length);
			for (const tf of tfs) {
				detectorsByColumn.forEach((detector, i) => {
					expect(minBarsForDetector(tf, detector), `docs §2: ${tf} × ${detector}`).toBe(Number(cells[i]));
				});
				covered.push(tf);
			}
		}
		expect(covered.sort()).toEqual([...ALL_TIMEFRAMES].sort());
	});
});
