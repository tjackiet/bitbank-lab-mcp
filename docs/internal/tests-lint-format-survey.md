# tests/ の lint / format 穴 — 実測レポートと方針提案

計測日: 2026-08-25 / oxlint 1.71.0・biome 2.5.1（lockfile 実体）/ 対象ブランチ `claude/tests-lint-format-survey-h6dcmw`

計測はすべて read-only、または「適用 → 計測 → `git checkout` で破棄」。**リポジトリのコードは 1 行も変更していない**（本ドキュメントの追加のみ）。

---

## 0. 結論（先に）

| 問い | 答え |
|---|---|
| tests/ に lint / format の穴はあるか | **format の穴は無い。0 件。** lint も既定ルールでは 0 件 |
| やる価値はあるか | **ある。ただし依頼文が想定した作業とは別物。** 段階分割も除外リストも要らない |
| 最優先で直すべきもの | **`oxlint` の CI ゲートが警告で落ちない**（src/ も tests/ も素通り）。tests/ の件数問題ではない |
| 副産物 | **今まさに何も検証していないテストが 7 件**見つかった（§5） |

依頼文の前提「**tests/ は lint も format もされたことがない**」は **CI に限れば正しく、リポジトリ全体としては誤り**。理由は §3。

---

## 1. 実測（依頼された 2 コマンド）

対象: `tests/` = **196 個の `.ts`**（うち `*.test.ts` が 186）+ `.json` 4 個 = biome が数える 200 ファイル。
（`tests/chaos/` と `tests/private/security.test.ts` は `.gitignore` 済みで作業ツリーに存在しない。）

> 依頼文の「116 ファイル」は型検査 PR 群（#98〜#113）当時の数。現在は 196 に増えている。

### 1-1. `npx oxlint tests/`

```
総件数 0 件 / exit 0
クリーン 196 / 196 ファイル
```

内訳表は無い（1 件も出ない）。**既定ルールセットでは tests/ は完全にクリーン。**

### 1-2. `npx biome check --no-errors-on-unmatched tests/`

```
総件数 68 件（warning 67 + info 1）/ exit 0
```

3 つの関心事に分けて計測し直した結果:

| 関心事 | コマンド | 件数 |
|---|---|---|
| **format** | `biome format tests/` | **0 件** |
| **assist（import 整列）** | `biome check --linter-enabled=false --formatter-enabled=false` | **0 件** |
| **lint** | `biome lint tests/` | 68 件 |

**ルール別内訳**

| ルール | 件数 | 重大度 |
|---|---|---|
| `lint/style/noNonNullAssertion` | 67 | warning |
| `lint/complexity/useLiteralKeys` | 1 | info |

**ファイル別内訳**（15 ファイルのみ。181 / 196 は既にクリーン）

| ファイル | 件数 |
|---|---|
| `tests/analyze_sma_snapshot.test.ts` | 12 |
| `tests/patterns/structural.test.ts` | 9 |
| `tests/build_market_signal_handler_text.test.ts` | 9 |
| `tests/render_depth_svg.test.ts` | 6 |
| `tests/analyze_ichimoku_snapshot.test.ts` | 6 |
| `tests/private/preview_order.test.ts` | 5 |
| `tests/get_candles.test.ts` | 4 |
| `tests/private/request-state.test.ts` | 3 |
| `tests/analyze_fibonacci.test.ts` | 3 |
| `tests/analyze_ema_snapshot.test.ts` | 3 |
| （残り 5 ファイル） | 各 1〜2 |

**偏りは無い。** 型検査のとき（1 ファイルで 62%）と違い、最大でも 12 件 = 全体の 18%。
**したがって「除外リストを敷いて大物を隔離する」設計は今回は成立しない**（隔離すべき大物が無い）。

### 1-3. 比較用: 現行 CI 対象ディレクトリの状態

`npx biome check src/ tools/ lib/` → **11 warning + 1 info、exit 0**
（`noNonNullAssertion` 6・`useOptionalChain` 5・`useTemplate` 1）

つまり **src/ も lint 的にクリーンではない。** tests/ だけが汚いという構図ではない。

---

## 2. ⚠️ 最重要: 既存ゲートの半分は飾り

件数より先に報告すべき実測結果。

### 2-1. `oxlint` は警告では絶対に落ちない

oxlint の既定ルールは全て warning 相当で、**warning があっても exit 0**。実証:

```
oxlint <4 件の warning があるファイル>            → exit 0
oxlint --deny-warnings <同じファイル>             → exit 1
oxlint --max-warnings=0 <同じファイル>            → exit 1
```

`lib/datetime.ts` に `no-const-assign` / `no-cond-assign` / `no-constant-condition` / `no-debugger` を
一時的に注入して確認した:

```
npx oxlint src/ tools/ lib/
  → 4 件の warning を出力しつつ exit 0
```

**CI の「Lint (Oxlint)」ステップは現状どんな既定ルール違反でも落ちない。**
`lefthook.yml` の `lint:` も同じコマンドなので同様に落ちない。
この状態で対象に `tests/` を足しても、**何もしないゲートの守備範囲が広がるだけ**。

### 2-2. `biome check` の format 違反は本物のエラー

一方こちらは効いている。実証（format 違反を注入）:

```
biome check tests/_assertResult.ts → exit 1（"Found 1 error." / format ━━━）
```

**format 違反 = error（exit 1）、lint 違反 = warning（exit 0）。**
biome ゲートは format だけを守っており、lint 部分は素通り。

---

## 3. なぜ tests/ は既にクリーンなのか（依頼文の前提の訂正）

`lefthook.yml` の pre-commit:

```yaml
lint:
  run: npx oxlint {staged_files}
  glob: "*.ts"          # ← tests/ の除外なし
format-check:
  run: npx biome check --no-errors-on-unmatched {staged_files}
  glob: "*.ts"          # ← tests/ の除外なし
```

`banned-patterns` にだけ `exclude: "*.test.ts"` があり、lint / format-check には無い。
`biome.json` の `files.includes` も既に `tests/**` を含んでいる。

`git log`: `biome.json` と `lefthook.yml` は**同一コミット（2026-08-13, PR #42）で追加**されている。

→ **2026-08-13 以降に stage された全テストファイルは commit 時点で oxlint / biome check を通っている。**
format 違反が 0 件なのはこれが理由。

穴が残るのは次の 3 経路のみ:
1. CI（`src/ tools/ lib/` しか見ない）
2. `--no-verify` での commit
3. lefthook 未導入のコントリビュータ

実測 0 件が示すとおり、**実際にはこの 3 経路から漏れたものは 1 件も無い。**

---

## 4. 分類（依頼の 3 分類）

| 分類 | 内容 | 件数 |
|---|---|---|
| **実害あり** | 設定済みルールセットからは **0 件** | 0 |
| **テスト特有の書き方** | `noNonNullAssertion` 67 | 67 |
| **単なるスタイル** | format 0・import 順 0・`useLiteralKeys` 1 | 1 |

**自動修正で片付く範囲は実質ゼロ。** 「単なるスタイル」バケツが空なのが今回の特徴。

### 4-1. 自動修正の実測（適用 → 計測 → 破棄）

| pass | 変更ファイル | 変更行 | 残件数 |
|---|---|---|---|
| `biome check --write`（safe） | **0** | 0 | 68 |
| `biome check --write --unsafe` | 13 | 43 (+43/-43) | 24 |

### 4-2. ⚠️ `--unsafe` は偽グリーンを作る（実証済み）

`--unsafe` の 43 行はすべて `!` → `?.` の置換。このうち **5 行は「落ちるべきテスト」を「黙って通るテスト」に変える**。

```diff
- expect(res.data.smas!['5'].slopePctPerDay).toBeUndefined();
+ expect(res.data.smas?.['5'].slopePctPerDay).toBeUndefined();   // smas 未定義でも PASS

- expect(res.data.keyPoints!.today).not.toBeNull();              // ×4 件
+ expect(res.data.keyPoints?.today).not.toBeNull();              // keyPoints 未定義でも PASS
```

`?.` が式全体を `undefined` に短絡するため、`toBeUndefined()` / `.not.toBeNull()` が**成立してしまう**。
`!` 版なら TypeError で落ちる。実際に vitest で両方を走らせて確認済み（2 test とも green = 挙動の差を確認）。

→ **`tests/` に `biome check --write --unsafe` を流してはいけない。**
残り 38 行（`toBe` / `toBeGreaterThan` / `toEqual` 等）は undefined でも失敗するので安全だが、
安全な行だけを選別する手段が無いため、一括適用は不可。

---

## 5. 副産物: 今まさに何も検証していないテストが 7 件

既定ルールが 0 件だったので、**より強いルールセットで tests/ を測り直した**。
oxlint の vitest プラグイン（既定 off）を有効化すると 702 件。その中の
`no-conditional-expect`（156 件）を追跡した結果、実害が出た。

追跡手順:
1. `no-conditional-expect` 156 件を構文で分類 → `try/catch` 由来 50・`if`/`for` 由来 106
2. `try/catch` は `expect.fail('should throw')` でガードされた正しい書き方（`tests/private/client.test.ts` ほか）。専用スキャンで**未ガードは実質 0 件**を確認
3. `for` ループを除外し、**assertion が `if` の中にしか無いテスト**を抽出 → 14 件
4. 14 件の `if` 条件を「偽なら throw する」よう一時的に書き換えて vitest を実行

**結果: 7 件が現時点で assertion を 1 つも実行していない。**

| ファイル:行 | テスト名 | 偽になっているガード |
|---|---|---|
| `tests/patterns/detect_hs.test.ts:359` | strict 不検出 → relaxed H&S (x1.6) でフォールバック検出 | `hs.length > 0` |
| `tests/patterns/detect_hs.test.ts:371` | strict 不検出 → relaxed Inverse H&S でフォールバック検出 | `ihs.length > 0` |
| `tests/detect_doubles.test.ts:288` | 通常判定で不検出 → relaxed (x1.3) で検出 | `dt.length > 0` |
| `tests/detect_doubles.test.ts:300` | relaxed fallback でダブルボトムを検出 | `db.length > 0` |
| `tests/patterns/detect_wedges.test.ts:251` | breakout が検出された場合、breakoutTarget と targetMethod が設定される | `withTarget.length > 0` |
| `tests/analyze_ichimoku_snapshot.test.ts:198` | toolDef.handler: テキスト content を返す | `res.content` |
| `tests/analyze_bb_snapshot.test.ts:1262` | percentile > 80 → high volatility phase signal | `hasHighVol` |

典型形:

```ts
it('strict 不検出 → relaxed H&S (x1.6) でフォールバック検出', () => {
  const hs = result.patterns.filter((p) => p.type === 'head_and_shoulders');
  if (hs.length > 0) {                       // ← 今は常に false
    expect(hs[0]?._fallback).toMatch(/relaxed_hs/);
  }
});
```

**上の 4 件はテスト名が「検出される」と宣言しているのに、検出が 0 件でも green。**
フォールバック検出が完全に壊れても CI は通る。型検査のときの
「`FailResult` に存在しないフィールドを渡すモック」と同種の偽グリーンで、深刻度はこちらの方が高い。

`tests/analyze_ichimoku_snapshot.test.ts:198` の補足:
`toolDef.handler` は `analyzeIchimokuSnapshot(...)` の `Result` をそのまま返しており `content` を組み立てていないため、
`res.content` は常に `undefined`。ただし **42 個の tool ファイルのうち `content[]` を明示的に組むのは 18 個**で、
残りは `toToolResult` 任せというのが現状の実装方針。**production 側が誤りかどうかは別途の判断**が要る。
**確実なのは「このテストは何も検証していない」ことだけ。**

### 5-1. 逆に「無かった」ことが確認できたもの

いずれもルールが実際に発火することをプローブで確認した上での 0 件。

| 検査 | 結果 |
|---|---|
| `vitest/no-focused-tests`（`.only` の消し忘れ） | **0 件** |
| `vitest/no-disabled-tests` / `biome noSkippedTests`（`.skip`） | **0 件** |
| `vitest/valid-expect`（matcher の無い `expect(x);`） | **0 件** |
| `biome nursery/noFloatingPromises`（await 漏れ） | **0 件** |
| 未ガードの `try/catch` + catch 内 assertion | **0 件** |
| 常に真の条件（`no-constant-condition` 等 correctness 系） | **0 件** |

### 5-2. 誤検知だったもの（ルールを鵜呑みにしない根拠）

| ルール | 件数 | 誤検知の理由 |
|---|---|---|
| `vitest/valid-expect`「Expect takes at most 1 argument」 | 44 | **Vitest の `expect(value, message)`**（第 2 引数 = 失敗時メッセージ）。ルールが Jest 準拠。ループ内でラベルを付ける**良い書き方**が誤検知されている |
| `vitest/valid-expect`「Async assertions must be awaited」 | 3 | `const a = expect(p).rejects.toThrow(); await vi.runAllTimersAsync(); await a;` — fake timer 併用時に**必須**のパターン |
| `vitest/expect-expect` | 59 | `assertOk` / `assertFail` 等の自作ヘルパ（中で `expect` を呼ぶ）。`assertFunctionNames` 設定で解消 |
| `biome suspicious/noMisplacedAssertion` | 35 | 同上。全 35 件が名前付き assertion ヘルパ関数の内部 |

---

## 6. 方針提案

### 6-1. やる価値はあるか → **ある。ただし小さい 1 PR。段階分割は不要**

- format を tests/ に広げる: **差分 0・リスク 0**。CI と pre-commit の乖離を閉じるだけの価値はある（`--no-verify` と lefthook 未導入者への保険）
- oxlint 既定を tests/ に広げる: **差分 0**。ただし §2-1 のとおり**単体ではほぼ無価値**
- **本命は `--deny-warnings`。** src/ tools/ lib/ でも tests/ でも**今日時点で 0 件**なので、追加コスト無しで飾りのゲートを本物にできる

**ベースライン除外リスト方式は不要。** 型検査（325 件 / 27 ファイル / 1 ファイルに 62% 集中）と違い、
今回は**負債がゼロ**なので、除外リストを敷く対象が存在しない。7 PR ではなく 1 PR で足りる。

### 6-2. format 先行か lint 先行か → **format に作業は無いので同時**

format 違反 0 件・import 順 0 件のため、「format 先行で差分を落としてから lint」という順序の意味が無い。
CI の対象ディレクトリ拡張 + `--deny-warnings` を**同じ PR**で入れるのが最小手数。

### 6-3. lint ルールの扱い（緩めるものは 1 件ずつ根拠を書く）

**方針: 既定ルールは一切緩めない。** 緩和は vitest プラグインを新規に入れる場合のみで、
その場合も「テストだから」ではなく**そのルールがこのリポジトリで誤検知する具体的な理由**を根拠にする。

| ルール | 判断 | 根拠 |
|---|---|---|
| oxlint 既定（correctness 系） | **そのまま有効** | tests/ で 0 件。緩める理由が無い |
| `biome style/noNonNullAssertion` | **現状維持（warning、tests/ 用の override を作らない）** | 67 件あるが、`--unsafe` 自動修正は §4-2 のとおり偽グリーンを作る。手作業で漸進的に直す。**tests/ だけ off にすると §4-2 の危険な `!` が検知対象から消える** |
| `vitest/no-focused-tests` | **error で新規有効化** | 現在 0 件。`.only` の消し忘れは他の全テストを黙って skip させる最悪の偽グリーン。0 件のうちに固定する価値が高い |
| `vitest/no-disabled-tests` | **error で新規有効化** | 現在 0 件。同上 |
| `vitest/no-standalone-expect` | **error で新規有効化** | 現在 0 件 |
| `vitest/expect-expect` | **error + `assertFunctionNames` 設定で有効化** | 素の状態では 59 件全部が誤検知だが、自作ヘルパ名を列挙すれば **0 件**になる。緩和ではなく**設定の正しい適用** |
| `vitest/valid-expect` | **off** | 47 件中 **真陽性 0**。44 件は Vitest の 2 引数 `expect` API（ルールが Jest 準拠で誤り）、3 件は fake timer の必須パターン。「テストだから緩める」のではなく**ルールが Vitest に対応していない**ため。oxlint 側が対応したら再評価する |
| `vitest/require-mock-type-parameters` | **off** | 362 件。`vi.fn<() => void>()` を強制する型付けの好みの問題。**tests/ は #98〜#113 で既に `tsc` の検査対象**なので、型安全性はコンパイラが担保済み。リンタから重ねて要求する必要が無い |
| `vitest/no-conditional-expect` | **off（ゲートにはしない）** | 156 件中 ~50 件は `expect.fail` でガードされた正しい `try/catch` idiom で、ルールはガードの有無を区別できない。ゲート化すると ~156 個の抑制コメントが必要。**ただしこのルールが §5 の 7 件を掘り当てた**ので、値は捨てず「§5 の 7 件を直す」形で回収する |
| `vitest/require-to-throw-message` | **off（別途スイープ）** | 77 件。`expect(() => schema.parse(bad)).toThrow()` が主。任意のエラー（テスト側の typo による TypeError 含む）で通るため偽グリーン面は実在するが軽微。ゲートではなく個別の棚卸し課題 |

上記を反映した `.oxlintrc.json` 案（**リポジトリには未追加。適用は方針決定後**）:

```json
{
  "plugins": ["vitest"],
  "rules": {
    "vitest/no-focused-tests": "error",
    "vitest/no-disabled-tests": "error",
    "vitest/no-standalone-expect": "error",
    "vitest/expect-expect": ["error", {
      "assertFunctionNames": [
        "expect", "assertOk", "assertFail",
        "assertOkQuality", "assertFailQuality",
        "assertOkStructure", "assertFailStructure",
        "assertDescriptionQuality", "assertRoundTrip",
        "expectSameStructuredContent", "expectSuperset", "expectSupersetOf",
        "expectCostFieldsSuppressed", "requireDefined", "definedAmount"
      ]
    }],
    "vitest/valid-expect": "off",
    "vitest/require-mock-type-parameters": "off",
    "vitest/no-conditional-expect": "off",
    "vitest/require-to-throw-message": "off",
    "vitest/valid-title": "off"
  }
}
```

**この設定での実測（検証済み）:**

```
oxlint -c .oxlintrc.json --deny-warnings tests/           → 0 件 / exit 0
oxlint -c .oxlintrc.json --deny-warnings src/ tools/ lib/ → 0 件 / exit 0
```

→ **負債ゼロで即日ラチェットとして機能する。**

### 6-4. 段階分割案

除外リストは不要なので、**依存関係だけで 3 段に割る**。

| 段 | 内容 | 差分 | 効果 |
|---|---|---|---|
| **PR 1** | CI / npm scripts の対象に `tests/` を追加 + `--deny-warnings` | 設定のみ（コード 0 行） | 飾りだったゲートが本物になる。tests/ が CI 対象に入る |
| **PR 2** | §5 の**偽グリーン 7 件を修正** | テスト 7 箇所 | 実害の回収。**単独で最も価値が高い** |
| **PR 3**（任意） | `.oxlintrc.json` 追加（vitest プラグイン curated） | 設定 1 ファイル | `.only` 消し忘れ等を 0 件のうちに固定 |

**PR 2 は lint の話ではないので PR 1 を待つ必要が無い。優先度としてはこちらが先。**
PR 1 / PR 3 は「今後の再発防止」、PR 2 は「既にある穴の修理」。

§5 の 7 件の直し方は 2 通り。どちらを採るかは実装側の判断:
- **(a)** ガードを外して無条件 assertion にする（検出されないなら落ちるべき、というテスト名どおりの意味にする）
- **(b)** ガードの前に `expect(hs.length).toBeGreaterThan(0)` を足す（検出されること自体を先に検証する）

テスト名が「検出される」と言っている 4 件（`detect_hs` ×2・`detect_doubles` ×2）は **(b) が素直**。
ただし**現状 0 件しか検出されていないので、直すと赤になる**。
その赤が「テストの期待が間違っていた」のか「検出ロジックのデグレ」なのかの切り分けが PR 2 の本体になる。

### 6-5. 保護対象ファイルへの差分（人間による適用が必要）

`.claude/hooks/protect-config.sh` によりこのセッションからは編集できないため、差分のみ提示する。

**`package.json`**

```diff
-    "lint": "oxlint src/ tools/ lib/",
-    "lint:fix": "oxlint --fix src/ tools/ lib/",
-    "format": "biome format --write src/ tools/ lib/",
+    "lint": "oxlint --deny-warnings src/ tools/ lib/ tests/",
+    "lint:fix": "oxlint --fix src/ tools/ lib/ tests/",
+    "format": "biome format --write src/ tools/ lib/ tests/",
```

**`.github/workflows/ci.yml`**

```diff
       - name: Lint (Oxlint)
-        run: npx oxlint src/ tools/ lib/
+        run: npx oxlint --deny-warnings src/ tools/ lib/ tests/

       - name: Format check (Biome)
-        run: npx biome check --no-errors-on-unmatched src/ tools/ lib/
+        run: npx biome check --no-errors-on-unmatched src/ tools/ lib/ tests/
```

**`lefthook.yml`** — 変更不要（既に `*.ts` 全体が対象）。
ただし CI と揃えるなら `lint:` に `--deny-warnings` を足すのが望ましい:

```diff
     lint:
-      run: npx oxlint {staged_files}
+      run: npx oxlint --deny-warnings {staged_files}
```

**`biome.json`** — 変更不要（`files.includes` に既に `tests/**` がある）。
`tests/` 向けの `overrides` は**追加しない**（§6-3 の `noNonNullAssertion` の根拠による）。

> 注: 上記 `--deny-warnings` を入れると、`src/ tools/ lib/` 側の biome warning 11 件は
> **biome 側の話なので影響しない**（oxlint のフラグのため）。biome 側を厳格化する
> （`--error-on-warnings`）場合は src/ の 11 件 + tests/ の 67 件を先に片付ける必要があり、
> **本提案には含めない。**

---

## 7. 温度感への回答

依頼者所感「lint / format はスタイルの一貫性の問題で、放置しても偽グリーンは生まれない。優先度は低い」について:

**スタイル部分についてはそのとおりで、しかも既に片付いている**（format 0 件、import 順 0 件）。
その意味では「割に合わない」という見立ては正しく、**依頼された作業自体はほぼ空振り**。

ただし 2 点、想定と違った:

1. **偽グリーンは生まれていた。** ただし lint 違反としてではなく、
   *どの lint も既定では見ていない領域*（`if` ガード付き assertion）に 7 件（§5）。
   lint を強めた副作用として見つかった。
2. **lint ゲートそのものが機能していなかった**（§2-1）。tests/ を対象に足すかどうか以前の問題。

したがって推奨は「やらない」ではなく、**「依頼された作業（tests/ の件数消化）はやらなくていい。
代わりに §6-4 の PR 2（偽グリーン 7 件）を最優先、PR 1（`--deny-warnings`）をついでに」**。
どちらも小さく、後者は差分 0 行。
