import { describe, expect, it } from 'vitest';
import { generatePatternDiagram, generateSupportResistanceDiagram } from '../../lib/pattern-diagrams.js';

// ── ヘルパー ──

const range = { start: '2026-01-10T00:00:00Z', end: '2026-02-15T00:00:00Z' };

function pivot(idx: number, price: number, kind: 'H' | 'L', date?: string) {
	return { idx, price, kind, date: date ?? `2026-01-${String(10 + idx).padStart(2, '0')}T00:00:00Z` };
}

describe('generatePatternDiagram', () => {
	// ── double_bottom ────────────────────────────────────

	it('double_bottom の SVG にネックライン・谷・山の情報を含む', () => {
		const result = generatePatternDiagram(
			'double_bottom',
			[pivot(0, 100, 'L'), pivot(5, 130, 'H'), pivot(10, 102, 'L')],
			{ price: 130 },
			range,
		);
		expect(result.svg).toContain('ダブルボトム');
		expect(result.svg).toContain('ネックライン');
		expect(result.svg).toContain('130');
		expect(result.svg).toContain('谷');
		expect(result.svg).toContain('山');
		expect(result.artifact.identifier).toContain('double_bottom');
		expect(result.artifact.title).toContain('ダブルボトム');
	});

	it('double_bottom isForming で stroke-dasharray が設定される', () => {
		const result = generatePatternDiagram(
			'double_bottom',
			[pivot(0, 100, 'L'), pivot(5, 130, 'H'), pivot(10, 102, 'L')],
			{ price: 130 },
			range,
			{ isForming: true },
		);
		expect(result.svg).toContain('stroke-dasharray="5,5"');
	});

	// ── double_top ───────────────────────────────────────

	it('double_top の SVG にネックライン・山・谷の情報を含む', () => {
		const result = generatePatternDiagram(
			'double_top',
			[pivot(0, 200, 'H'), pivot(5, 170, 'L'), pivot(10, 198, 'H')],
			{ price: 170 },
			range,
		);
		expect(result.svg).toContain('ダブルトップ');
		expect(result.svg).toContain('ネックライン');
		expect(result.svg).toContain('170');
		expect(result.svg).toContain('山');
		expect(result.svg).toContain('谷');
	});

	// ── inverse_head_and_shoulders ───────────────────────

	it('inverse_head_and_shoulders の SVG に左肩・山・谷・右肩を含む', () => {
		const result = generatePatternDiagram(
			'inverse_head_and_shoulders',
			[pivot(0, 100, 'L'), pivot(5, 130, 'H'), pivot(10, 80, 'L'), pivot(15, 135, 'H'), pivot(20, 105, 'L')],
			{ price: 132 },
			range,
		);
		expect(result.svg).toContain('逆ヘッドアンドショルダー');
		expect(result.svg).toContain('左肩');
		expect(result.svg).toContain('右肩');
		expect(result.svg).toContain('山1');
		expect(result.svg).toContain('山2');
		expect(result.svg).toContain('谷');
		expect(result.svg).toContain('ネックライン');
	});

	// ── head_and_shoulders ───────────────────────────────

	it('head_and_shoulders の SVG に左肩・谷・山・右肩を含む', () => {
		const result = generatePatternDiagram(
			'head_and_shoulders',
			[pivot(0, 150, 'H'), pivot(5, 100, 'L'), pivot(10, 180, 'H'), pivot(15, 105, 'L'), pivot(20, 145, 'H')],
			{ price: 102 },
			range,
		);
		expect(result.svg).toContain('ヘッドアンドショルダー');
		expect(result.svg).toContain('左肩');
		expect(result.svg).toContain('右肩');
		expect(result.svg).toContain('谷1');
		expect(result.svg).toContain('谷2');
		expect(result.svg).toContain('山');
	});

	// ── triple_bottom ────────────────────────────────────

	it('triple_bottom の SVG に谷1-3・山1-2・ネックラインを含む', () => {
		const result = generatePatternDiagram(
			'triple_bottom',
			[pivot(0, 100, 'L'), pivot(5, 130, 'H'), pivot(10, 102, 'L'), pivot(15, 128, 'H'), pivot(20, 101, 'L')],
			{ price: 129 },
			range,
		);
		expect(result.svg).toContain('トリプルボトム');
		expect(result.svg).toContain('谷1');
		expect(result.svg).toContain('谷2');
		expect(result.svg).toContain('谷3');
		expect(result.svg).toContain('山1');
		expect(result.svg).toContain('山2');
		expect(result.svg).toContain('ネックライン');
	});

	// ── triple_top ───────────────────────────────────────

	it('triple_top の SVG に山1-3・谷1-2・ネックラインを含む', () => {
		const result = generatePatternDiagram(
			'triple_top',
			[pivot(0, 200, 'H'), pivot(5, 170, 'L'), pivot(10, 198, 'H'), pivot(15, 172, 'L'), pivot(20, 201, 'H')],
			{ price: 171 },
			range,
		);
		expect(result.svg).toContain('トリプルトップ');
		expect(result.svg).toContain('山1');
		expect(result.svg).toContain('山2');
		expect(result.svg).toContain('山3');
		expect(result.svg).toContain('谷1');
		expect(result.svg).toContain('谷2');
	});

	// ── falling_wedge ────────────────────────────────────

	it('falling_wedge の SVG に収束点・上抜け期待を含む', () => {
		const result = generatePatternDiagram('falling_wedge', [pivot(0, 100, 'L')], { price: 100 }, range);
		expect(result.svg).toContain('フォーリングウェッジ');
		expect(result.svg).toContain('収束点');
		expect(result.svg).toContain('上抜け期待');
		expect(result.artifact.title).toContain('フォーリングウェッジ');
	});

	// ── rising_wedge ─────────────────────────────────────

	it('rising_wedge の SVG に収束点・下抜け期待を含む', () => {
		const result = generatePatternDiagram('rising_wedge', [pivot(0, 200, 'H')], { price: 200 }, range);
		expect(result.svg).toContain('ライジングウェッジ');
		expect(result.svg).toContain('収束点');
		expect(result.svg).toContain('下抜け期待');
	});

	// ── fallback ─────────────────────────────────────────

	it('未実装パターンはフォールバック SVG を返す', () => {
		const result = generatePatternDiagram('unknown_pattern', [pivot(0, 100, 'L')], { price: 100 }, range);
		expect(result.svg).toContain('準備中');
		expect(result.svg).toContain('unknown_pattern');
	});

	// ── artifact ─────────────────────────────────────────

	it('artifact に identifier と title を含む', () => {
		const result = generatePatternDiagram(
			'double_bottom',
			[pivot(0, 100, 'L'), pivot(5, 130, 'H'), pivot(10, 102, 'L')],
			{ price: 130 },
			range,
		);
		expect(result.artifact.identifier).toBe('double_bottom-diagram-2026-01-10');
		expect(result.artifact.title).toContain('ダブルボトム構造図');
	});

	// ── tz（issue #200 要件 F-2: UTC/JST 不一致の修正） ────

	describe('tz オプション', () => {
		// 2026-08-27T15:00:00Z は JST（+9h）で 2026-08-28T00:00:00+09:00 になる、
		// ちょうど暦日が変わる境界のピボット。旧実装（.utc() 固定）はここを 8/27 と表示していた
		// （issue #200 の具体例: 「1hour の 8/28 00:00 JST が構造図では 8/27」）。
		const boundaryRange = { start: '2026-08-27T15:00:00Z', end: '2026-08-28T15:00:00Z' };
		const boundaryPivots = [
			pivot(0, 100, 'L', '2026-08-27T15:00:00Z'),
			pivot(5, 130, 'H', '2026-08-28T02:00:00Z'),
			pivot(10, 102, 'L', '2026-08-28T15:00:00Z'),
		];

		it('tz=Asia/Tokyo を渡すと JST 暦日で表示される（UTC 前日 → JST 当日）', () => {
			const result = generatePatternDiagram('double_bottom', boundaryPivots, { price: 130 }, boundaryRange, {
				tz: 'Asia/Tokyo',
			});
			// タイトル: start は JST で 8/28、end は JST で 8/29
			expect(result.artifact.title).toContain('(8/28-8/29)');
			expect(result.svg).toContain('谷: 8/28');
			expect(result.svg).toContain('山: 8/28');
		});

		it('tz 未指定でも Asia/Tokyo 相当になる（呼び出し側 tz の既定値と同じ。#200）', () => {
			const withDefault = generatePatternDiagram('double_bottom', boundaryPivots, { price: 130 }, boundaryRange);
			const withExplicitJst = generatePatternDiagram('double_bottom', boundaryPivots, { price: 130 }, boundaryRange, {
				tz: 'Asia/Tokyo',
			});
			expect(withDefault.svg).toBe(withExplicitJst.svg);
			expect(withDefault.artifact.title).toBe(withExplicitJst.artifact.title);
		});

		it('tz=UTC を渡すと UTC 暦日のまま表示される（修正前の旧挙動と同じ結果を選べる）', () => {
			const result = generatePatternDiagram('double_bottom', boundaryPivots, { price: 130 }, boundaryRange, {
				tz: 'UTC',
			});
			expect(result.artifact.title).toContain('(8/27-8/28)');
			expect(result.svg).toContain('谷: 8/27');
		});

		it('artifact.identifier は tz を通さない（表示ではなく成果物 ID。issue #200: 触らないこと）', () => {
			const jst = generatePatternDiagram('double_bottom', boundaryPivots, { price: 130 }, boundaryRange, {
				tz: 'Asia/Tokyo',
			});
			const utc = generatePatternDiagram('double_bottom', boundaryPivots, { price: 130 }, boundaryRange, {
				tz: 'UTC',
			});
			// identifier は range.start の生 ISO を素通しした日付（8/27）のまま、tz で変わらない。
			expect(jst.artifact.identifier).toBe('double_bottom-diagram-2026-08-27');
			expect(utc.artifact.identifier).toBe('double_bottom-diagram-2026-08-27');
		});

		it('isForming と tz は独立して効く（tz を渡しても stroke-dasharray は変わらない）', () => {
			const result = generatePatternDiagram('double_bottom', boundaryPivots, { price: 130 }, boundaryRange, {
				isForming: true,
				tz: 'Asia/Tokyo',
			});
			expect(result.svg).toContain('stroke-dasharray="5,5"');
			expect(result.svg).toContain('谷: 8/28');
		});
	});

	// ── 日付なしピボット ─────────────────────────────────

	it('date が undefined のピボットでもクラッシュしない', () => {
		const result = generatePatternDiagram(
			'double_top',
			[
				{ idx: 0, price: 200, kind: 'H' as const },
				{ idx: 5, price: 170, kind: 'L' as const },
				{ idx: 10, price: 198, kind: 'H' as const },
			],
			{ price: 170 },
			range,
		);
		expect(result.svg).toContain('ダブルトップ');
	});
});

describe('generateSupportResistanceDiagram', () => {
	const supports = [
		{ price: 9500000, pctFromCurrent: -5, strength: 2, label: '第1サポート' },
		{ price: 9000000, pctFromCurrent: -10, strength: 1, label: '第2サポート' },
	];
	const resistances = [
		{ price: 10500000, pctFromCurrent: 5, strength: 3, label: '第1レジスタンス' },
		{ price: 11000000, pctFromCurrent: 10, strength: 1, label: '第2レジスタンス' },
	];

	it('SVG にサポート・レジスタンス・現在価格ラインを含む', () => {
		const result = generateSupportResistanceDiagram(10000000, supports, resistances);
		expect(result.svg).toContain('サポート・レジスタンス構造図');
		expect(result.svg).toContain('現在価格');
		expect(result.svg).toContain('第1サポート');
		expect(result.svg).toContain('第1レジスタンス');
		expect(result.svg).toContain('リスク距離');
	});

	it('artifact に identifier と title を含む', () => {
		const result = generateSupportResistanceDiagram(10000000, supports, resistances);
		expect(result.artifact.identifier).toContain('support-resistance-diagram');
		expect(result.artifact.title).toBe('サポート・レジスタンス構造図');
	});

	it('highlightNearestSupport で最寄りサポートの strokeWidth が太くなる', () => {
		const result = generateSupportResistanceDiagram(10000000, supports, resistances, {
			highlightNearestSupport: true,
		});
		// stroke-width="5" が含まれる（通常は strength+1）
		expect(result.svg).toContain('stroke-width="5"');
	});

	it('highlightNearestResistance で最寄りレジスタンスの strokeWidth が太くなる', () => {
		const result = generateSupportResistanceDiagram(10000000, supports, resistances, {
			highlightNearestResistance: true,
		});
		expect(result.svg).toContain('stroke-width="5"');
	});

	it('サポートが現在価格に非常に近い場合に警告を表示', () => {
		const closeSupports = [{ price: 9950000, pctFromCurrent: -0.5, strength: 2, label: '第1サポート' }];
		const result = generateSupportResistanceDiagram(10000000, closeSupports, resistances);
		expect(result.svg).toContain('非常に近い');
	});

	it('空のサポート・レジスタンスでもクラッシュしない', () => {
		const result = generateSupportResistanceDiagram(10000000, [], []);
		expect(result.svg).toContain('サポート・レジスタンス構造図');
		expect(result.svg).toContain('現在価格');
	});

	it('note 付きレベルで注記が SVG に含まれる', () => {
		const supWithNote = [{ price: 9500000, pctFromCurrent: -5, strength: 2, label: '第1サポート', note: '25日線付近' }];
		const result = generateSupportResistanceDiagram(10000000, supWithNote, resistances);
		expect(result.svg).toContain('25日線付近');
	});

	it('現在価格とサポートの間の距離に空白ラベルを表示', () => {
		// pctDiff > 2% → 空白表示
		const farSupports = [{ price: 9500000, pctFromCurrent: -5, strength: 2, label: '第1サポート' }];
		const result = generateSupportResistanceDiagram(10000000, farSupports, []);
		expect(result.svg).toContain('空白');
	});

	it('★表記が strength に応じて生成される', () => {
		const result = generateSupportResistanceDiagram(10000000, supports, resistances);
		// strength=3 → ★★★
		expect(result.svg).toContain('★★★');
		// strength=2 → ★★☆
		expect(result.svg).toContain('★★☆');
		// strength=1 → ★☆☆
		expect(result.svg).toContain('★☆☆');
	});
});
