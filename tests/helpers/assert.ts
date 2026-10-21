// `expect(x).toBeDefined()` は TS の型を絞らず、`x!.foo` だと undefined のときの失敗がプロパティ参照になってどの値が欠けていたのか分からないので、絞り込みと診断（失敗時に値をメッセージに含める）を同時に満たすヘルパ。

export function assertDefined<T>(value: T, label: string): asserts value is NonNullable<T> {
	if (value === undefined || value === null) {
		throw new Error(`${label} is ${value === undefined ? 'undefined' : 'null'} (expected defined)`);
	}
}

export function requireDefined<T>(value: T, label: string): NonNullable<T> {
	assertDefined(value, label);
	return value;
}
