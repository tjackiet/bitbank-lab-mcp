export interface RegressionPoint {
	idx: number;
	price: number;
}

export interface XYPoint {
	x: number;
	y: number;
}

export interface LinearRegressionResult {
	slope: number;
	intercept: number;
}

export interface LinearRegressionWithR2Result extends LinearRegressionResult {
	r2: number;
	valueAt: (x: number) => number;
}

export function linearRegression(points: RegressionPoint[]): LinearRegressionResult {
	const n = points.length;
	if (!n) return { slope: 0, intercept: 0 };

	let sumX = 0,
		sumY = 0,
		sumXY = 0,
		sumX2 = 0;
	for (const p of points) {
		sumX += p.idx;
		sumY += p.price;
		sumXY += p.idx * p.price;
		sumX2 += p.idx * p.idx;
	}

	const denom = n * sumX2 - sumX * sumX || 1;
	const slope = (n * sumXY - sumX * sumY) / denom;
	const intercept = (sumY - slope * sumX) / n;

	return { slope, intercept };
}

export function trendlineFit(points: RegressionPoint[], line: LinearRegressionResult): number {
	if (!points.length) return 0;

	let sumDev = 0;
	for (const p of points) {
		const expected = line.slope * p.idx + line.intercept;
		const dev = Math.abs(p.price - expected) / Math.max(1e-12, p.price);
		sumDev += dev;
	}

	const avgDev = sumDev / points.length;
	return Math.max(0, Math.min(1, 1 - avgDev));
}

export function linearRegressionWithR2(points: XYPoint[]): LinearRegressionWithR2Result {
	const n = points.length;
	if (n < 2) {
		return {
			slope: 0,
			intercept: 0,
			r2: 0,
			valueAt: (_x: number) => 0,
		};
	}

	let sumX = 0,
		sumY = 0,
		sumXY = 0,
		sumX2 = 0;
	for (const p of points) {
		sumX += p.x;
		sumY += p.y;
		sumXY += p.x * p.y;
		sumX2 += p.x * p.x;
	}

	const denom = n * sumX2 - sumX * sumX || 1;
	const slope = (n * sumXY - sumX * sumY) / denom;
	const intercept = (sumY - slope * sumX) / n;

	const meanY = sumY / n;
	let ssTot = 0,
		ssRes = 0;
	for (const p of points) {
		const yHat = slope * p.x + intercept;
		ssTot += (p.y - meanY) * (p.y - meanY);
		ssRes += (p.y - yHat) * (p.y - yHat);
	}
	const r2 = ssTot <= 0 ? 0 : Math.max(0, Math.min(1, 1 - ssRes / ssTot));

	const valueAt = (x: number) => slope * x + intercept;

	return { slope, intercept, r2, valueAt };
}

export function near(a: number, b: number, tolerancePct: number): boolean {
	return Math.abs(a - b) <= Math.max(a, b) * tolerancePct;
}

export function pct(a: number, b: number): number {
	return (b - a) / (a === 0 ? 1 : a);
}

export function clamp01(x: number): number {
	return Math.max(0, Math.min(1, x));
}

export function relDev(a: number, b: number): number {
	return Math.abs(a - b) / Math.max(1, Math.max(a, b));
}

export function marginFromRelDev(rd: number, tol: number): number {
	return clamp01(1 - rd / Math.max(1e-12, tol));
}
