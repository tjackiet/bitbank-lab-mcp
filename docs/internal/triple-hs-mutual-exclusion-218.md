# triple × H&S の型間排他（issue #218 Phase 2・実測ログ）

[issue #218](https://github.com/tjackiet/bitbank-lab-mcp/issues/218) Phase 2 として、

> `triple_*` と H&S 系が主構成点を 2 点以上共有していたら、triple 側を落とす。

を実装した。**閾値を 1 つも導入していない**（深さ比の値も、共有点の割合も持たない）。
本ログは実装後の実測。判断の根拠と却下案は [Phase 1 のログ](./triple-depth-ratio-218.md)。

## なぜ深さ比の hard gate を採らなかったか（Phase 1 の結論の引き写し）

- 価格系列上 **13 構造**しかなく、その上で閾値を選んでも 13 件に合わせただけになる
- accepted プールの空白帯 9 本は**母集団が薄すぎてどこで切っても空白に当たる**ための見かけ
- 空白帯を支えているのはサイズ検査 / ネックライン傾き / 構造ゲート / `validateLevelSpread` で、
  **いずれも深さ比を見ていない別の理由で動く定数**——#215 と同じ壊れ方をする
- #210 の分母ガード（0.15）を移植しても **no-op**

Phase 1 で確かな根拠があるのは**二重出力 18 ペア**だけなので、そこだけを直した。

## 規則（実装は `tools/patterns/mutual-exclusion.ts`）

```text
H&S は headProminencePct のゲートを通過している
  = 中央の構成点が両隣と明確に違うことが既に検証済み
triple の前提は「3 点が同水準」
  = 中央が突出していないこと
```

同じ点集合が両方を満たすなら、**中央が突出しているという検証済みの証拠がある側**が正しい。

**これは得点による勝ち負けではない。** 実測で落ちた 2 構造はどちらも
**triple の `confidence` のほうが高い**（1hour で 0.81 vs 0.74 / 0.90 vs 0.80、30min で 0.82 vs 0.78）。
`globalDedup` のような `statusScore` → `confidence` の比較に委ねると **triple が勝って残る**——
本件が `globalDedup` の `categoryMap` ではなく独立した段である理由の 1 つ。

### 主構成点の取り方（位置ではなく `kind`）

| type | `pivots` | 主構成点 | 完成済みの位置 |
|---|---|---|---|
| `triple_*` | `[a, b, c]` | 3 点すべて | `[0] [1] [2]` |
| H&S 系 | `[p0, p1, p2, p3, p4]` | 左肩・頭・右肩（`p1` / `p3` はネックラインの定義点） | `[0] [2] [4]` |

**位置の決め打ちは形成中経路で壊れる。** 形成中 H&S は 4 点（左肩 H / 頭 H / 戻り谷 L / 暫定右肩 H。
`detect_hs.ts` の `formingHsForHead`）で、`[0] [2] [4]` は**戻り谷と `undefined` を拾う**。
形成中 triple は 2 点しかない。`pivots` から type の向きに一致する `kind` を取れば、
完成済みでは上表の位置と一致し、形成中でも意味が保たれる（Phase 1 の計測と同じ取り方）。

### スコープ

- **`triple_*` × H&S 系のみ。** Phase 1 が測ったのはこのペアだけ。
- `double_*` × H&S 系は**未計測なので触らない**。`MAIN_POINT_KIND` に `double_*` を載せていないので、
  ペアの列挙に足すだけでは動き出さない。
- 根拠は**実際に出力される H&S だけ**。`patterns: ['triple_bottom']` のように種別を絞ると
  H&S 検出器が走らないので排他も起きない（仕様。詳細はモジュール冒頭）。

## 計測条件

| 項目 | 値 |
|---|---|
| 計測日 | 2026-09-03 |
| コーパス | **標準コーパス 800**（合成 704 = fixture 22 件 × オプション 8 通り × 時間足 2 種 × `swingDepth` 2 種、実データ A 96 = `tests/fixtures/btc_jpy_1day_2026.ts` × 時間足 3 種 × `swingDepth` 4 種 × オプション 8 通り）**＋ 実データ B 96**（`tests/fixtures/btc_jpy_1hour_2026_08.ts` × 同上）= **896**、**＋ 補助スイープ 44**（実データ B × 全 11 時間足 × `swingDepth` 4 種）= **940 ケース**。#205 / #213 / #216 / #219 / Phase 1 と同じ組み方 |
| ハーネス | **`detect_patterns` をツールとして呼ぶ**（`analyze_indicators` のみ mock）。Phase 1 は検出器を直接呼ぶ組み方だったが、本 issue は `data.patterns` に届いた集合そのものが対象なのでツール層で測る |
| view | `data.patterns` は `view` で変わらないため **`view=full` と同値** |
| 錨 | ネイティブ時間足サブセット（実データ B × `1hour` 32 ケース + 実データ A × `1day` 36 ケース） |

### ハーネスの検算

既存の実測ログと突き合わせて先に検算した。**全項目一致**:

| 出典 | 項目 | 記載値 | 本ハーネス |
|---|---|---:|---:|
| #213 | 940 ケースの `data.patterns` 合計 | 1,968 | **1,968** |
| #213 | 同 `head_and_shoulders` / `inverse_head_and_shoulders` | 166 / 162 | **166 / 162** |
| #207 | コーパス層 896 の `triple_top` / `triple_bottom` | 88 / 92 | **88 / 92** |
| 本リポジトリ | 実データ B `1hour` 既定の `data.patterns`（回帰ベースライン） | 14 件 | **14 件（全フィールド一致）** |

## 1. 検証 1: type 別の増減

**`triple_bottom` だけが減る。他の 13 type は 940 ケース全件で 1 件も動かない。**

| type | before | after | 差 |
|---|---:|---:|---:|
| `triple_bottom` | 108 | **83** | **−25** |
| `triple_top` | 112 | 112 | 0 |
| `head_and_shoulders` | 166 | 166 | 0 |
| `inverse_head_and_shoulders` | 162 | 162 | 0 |
| `double_top` / `double_bottom` | 40 / 88 | 40 / 88 | 0 / 0 |
| `rising_wedge` / `falling_wedge` | 216 / 264 | 216 / 264 | 0 / 0 |
| `triangle_ascending` / `_descending` / `_symmetrical` | 392 / 188 / 168 | 同左 | 0 |
| `bull_flag` / `bull_pennant` / `bear_pennant` | 8 / 40 / 16 | 同左 | 0 |
| **合計** | **1,968** | **1,943** | **−25** |

`triple_top` が 1 件も減らないのは、**共有 2 点以上のペアが 1 組も出力に届いていない**ため
（Phase 1 付録 A の #11 `triple_top 219-223-232` ↔ `head_and_shoulders 219-220-223-230-245` は
共有 2 点だが、この H&S 側が `data.patterns` に出ていないので根拠にならない）。
「triple を一律に厳しくする」変更ではないことがここに出ている。

### 1-2. 層別

| 層 | ケース数 | `data.patterns` 合計 | 差分 |
|---|---:|---|---|
| 合成 704 | 704 | 304 → 304 | **なし**（合成 fixture では triple と H&S が主構成点を共有する形が出ない。Phase 1 §3 と同じ） |
| 実データ A 96 | 96 | 368 → 368 | **なし**（実データ A は完成済み triple が 1 件も出ない） |
| 実データ B 96 | 96 | 788 → 776 | `triple_bottom` 60 → 48（**−12**） |
| 補助スイープ 44 | 44 | 508 → 495 | `triple_bottom` 16 → 3（**−13**） |
| **ネイティブ錨**（realB × `1hour` + realA × `1day`） | 68 | 522 → 507 | `triple_bottom` 55 → 40（**−15**） |

除外の時間足別内訳（延べ 25）: `1hour` 15 / `15min` 3 / `30min` 3 / `1min` 2 / `5min` 2。

## 2. 検証 2: 落ちた triple の全件明細

延べ **25** / 構造単位 `(系列, tf, type, 構成点 idx)` **10** / **価格系列上は 2 構造**。
**全件が実データ B**（Phase 1 §3 の「18 ペアすべてが実データ B」と整合）。

### 構造 1 — `triple_bottom` 242-249-272（issue #218 本文の実例）

| | 値 |
|---|---|
| range | `2026-08-22T22:00Z` 〜 `2026-08-24T12:00Z` |
| 3 主構成点 | idx **242 / 249 / 272**（すべて谷。`status=completed`） |
| 共有した H&S | `inverse_head_and_shoulders` 構成点 **230-232-249-265-272**（主構成点 = 左肩 230 / 頭 249 / 右肩 272） |
| **共有点** | **249・272 の 2 点** |
| `confidence`（triple / H&S） | 0.81 / 0.74（`1hour`）、0.80 / 0.86（`1min`）、0.80 / 0.84（`5min`）、0.82 / 0.81（`15min`）、0.82 / 0.78（`30min`） |
| 延べ | 16 件（`1hour` 10 / `15min` 2 / `30min` 2 / `1min` 1 / `5min` 1） |
| Phase 1 の深さ比 | 2.66（**実装では計算していない**。対応確認のため引用） |

### 構造 2 — `triple_bottom` 230-249-272

| | 値 |
|---|---|
| range | `2026-08-22T10:00Z` 〜 `2026-08-24T12:00Z` |
| 3 主構成点 | idx **230 / 249 / 272**（すべて谷。`status=completed`） |
| 共有した H&S | `inverse_head_and_shoulders` 構成点 **230-236-249-265-272**（主構成点 = 左肩 230 / 頭 249 / 右肩 272） |
| **共有点** | **230・249・272 の 3 点（全部）** |
| `confidence`（triple / H&S） | 0.90 / 0.80（`1hour`）、0.89 / 0.92（`1min`）、0.89 / 0.90（`5min`）、0.90 / 0.87（`15min`）、0.90 / 0.84（`30min`） |
| 延べ | 9 件（`1hour` 5 / `15min` 1 / `30min` 1 / `1min` 1 / `5min` 1） |
| Phase 1 の深さ比 | 2.40 |

**2 構造とも同じ 3 谷（230 / 249 / 272）を主構成点にする逆 H&S に当たっている**——中間 2 点
（232 vs 236）だけが違う別候補で、`globalDedup` はこれを 1 件に統合したうえで triple と共存させていた。

**落ちた triple は 25 件とも `status=completed`。** 形成中 triple は主構成点が 2 点しかないので
2 点共有＝全点共有になるが、本コーパスでは 1 件も該当しない（形成中 triple が H&S と共有したのは
1 点のみのペアが 3 組。下表 §3 の「共有 1 点」に含まれる）。

### 2-2. Phase 1 の 18 ペアのうち何組が `data.patterns` に届いていたか

`globalDedup` 後に共存する (triple, H&S) ペアのうち、**両方が `data.patterns` に届いていたもの**:

| 共有点数 | before 延べ | before 構造単位 | after 延べ | Phase 1 付録 A の「うち両方 `data.patterns`（延べ）」 |
|---:|---:|---:|---:|---:|
| 1 | 20 | 8 | **20（据置）** | 10 |
| 2 | 16 | 5 | **0** | 16 |
| 3 | 9 | 5 | **0** | 9 |
| **合計** | **45** | **18** | **20** | **35** |

- **共有 2 点以上の二重出力は 25 件すべて解消**し、**共有 1 点の 20 件は 1 件も触っていない。**
- 共有 2 点 / 3 点の延べ件数（16 / 9）は **Phase 1 付録 A と全桁一致**。
- **共有 1 点だけ数え方が違う**（本ログ 20 / Phase 1 10）。Phase 1 は母集団を
  「完成済み 4 経路」に限っており**形成中 triple を除外している**のに対し、本ログは
  `data.patterns` に届いた全 triple を数えているため。形成中 triple を除くと
  `(305,313)` 4 件 + `(294,308)` 2 件 + `(294,308)` 4 件 = 10 件が落ち、**Phase 1 の 10 と一致する。**
- **⚠️ Phase 1 付録 A の「出」列は `1hour` 行（#1 / #6）が誤り。** 付録 A は
  `realB|1hour` の 2 ペアを「どちらも `data.patterns` に届いていない（—/—）」と記録しているが、
  リポジトリの回帰ベースライン（`tests/fixtures/detect_patterns_1hour_data_patterns_baseline.json`）は
  **両方を含んでいる**。issue #218 の受け入れ条件そのものが「`1hour` の `triple_bottom`
  242-249-272 が落ちること」なので、届いていなければ受け入れ条件が成立しない。
  付録 A の**延べ件数の列（16 / 9）とも矛盾している**（`1hour` を除くと 16 / 9 に届かない）ので、
  誤っているのは行ごとの「出」フラグのほうと判断した。

## 3. 検証 3: 受け入れ条件

実データ B `1hour`（既定オプション）:

```text
before: 14 件  … triple_bottom 242-249-272（conf 0.81）を含む
after : 13 件  … 上記 1 件だけが消え、残り 13 件は全フィールド不変
```

```text
検出内訳: 検出 62件 → 重複統合 -44 → ライフサイクル除外 -4 → triple×H&S排他 -1 → 出力 13件
```

落ちた理由は `view=debug` から追える（**cap トリムで押し出されない**。§5）:

```text
92. ❌ triple_bottom [excluded_by_hs_main_point_overlap] indices=[242,249,272]
   main@242:12,219,869, main@249:12,075,755, main@272:12,213,097
   tripleMainIdxs: [242,249,272]
   sharedCount: 2
   matches: [{"hsType":"inverse_head_and_shoulders","hsMainIdxs":[230,249,272],"sharedIdxs":[249,272]}]
```

**H&S 側は 1 件も落ちていない**（`head_and_shoulders` 2 件 / `inverse_head_and_shoulders` 2 件は据え置き）。
`triple_top` 219-223-232 が残るのは、その主構成点が出力に残る 2 件の `head_and_shoulders`
（主構成点 265-294-322 / 204-294-322）と**1 点も共有しない**ため。

## 4. 置く位置（ライフサイクル絞り込みの**後**）

```text
tools/detect_patterns.ts
  globalDedup
  requireCurrentInPattern
  ライフサイクル絞り込み（includeForming / includeCompleted / includeInvalid）
★ triple × H&S 排他          ← ここ
  meta.reduction の組み立て
```

先に置くと、triple を落とした後で根拠にした H&S がライフサイクル絞り込みで消え、
**どちらも残らない**組み合わせが作れてしまう。後に置けば「実際に出力される H&S」だけが根拠になる。

回帰は `tests/detect_patterns_triple_hs_exclusion.test.ts` が
**8 通りのライフサイクル組み合わせすべて**で「落とした triple の `matches` が、同じ応答の
`data.patterns` に実在する H&S を指している」ことで固定する。

本コーパスでは 25 件とも triple / H&S の**両方が `completed`** なので、
ライフサイクル絞り込みが両者を分ける実例は出ていない（順序の要件はテストで固定してある）。

## 5. `view=debug` の cap トリムとの相互作用（実装上の追加判断）

新しい棄却理由は**パイプラインの最後に push される**ので、`debug.candidates` の cap（200 件）に対して
`[...accepted, ...rejected]` の順で切ると**必ず押し出される**——実測で実データ B の `1hour` は
候補 **1,994 件**（うち 1,794 件が押し出し）で、最初の実装では 25 件とも `view=debug` に
1 件も残らなかった。

そこで `tools/detect_patterns.ts` のトリムを `[...accepted, ...本段の棄却, ...検出器の棄却]` に変えた。
**本段の棄却は「accepted になった候補が output に居ない理由」であって検出器の棄却理由ではない**
ので、accepted と同じ優先度に置く。#180 の「押し出しは棄却理由から始まる」という方針は維持している
（押し出されるのは検出器の棄却理由のまま）。

変更後、**25 件の除外すべてが `view=debug` に残る**（`meta.reduction.tripleHsExcluded` の合計 25 と一致）。
この入れ替えで `data.patterns` は 1 件も変わらない（940 ケース全件で deep-equal を確認）。

## 6. 申告（#200 の契約）

新しい縮小段なので `meta.reduction` と `検出内訳:` 行に反映した。

- `ReductionSchema`（`src/schema/patterns.ts`）に `tripleHsExcluded` を宣言
  （**宣言しないと `parse()` が黙って剥がす**——#155 / #160 / #184 / #189 / #199 で 5 回踏んだ欠陥）
- waterfall の不変条件を
  `detected = dedupMerged + currentFiltered + lifecycleExcluded + tripleHsExcluded + output` に更新。
  `tests/detect_patterns_meta_schema_parity.test.ts` が実データで固定する
- `検出内訳:` 行に `triple×H&S排他 -N` を追加。**0 でも省かない**
  （`重複統合` / `ライフサイクル除外` と同じ扱い。常に走る段なので 0 は
  「排他したが 1 件も該当しなかった」を意味し、省くとその事実が読めなくなる）

## 7. 更新したベースライン

`tests/fixtures/detect_patterns_1hour_data_patterns_baseline.json` を 14 件 → **13 件**に更新した
（`triple_bottom` 242-249-272 の 1 件を削除しただけの純減。他 13 件は全フィールド不変）。
**本ベースラインで初めて件数が動いた更新**なので、
`tests/detect_patterns_data_patterns_regression.test.ts` の更新履歴表に 1 行足してある（#207 のルール）。

## 8. 併走の制約

**#211 / #216 とは独立。** triple のネックラインは水平スカラー（`nlAvg`）で `necklineAt` を通らない。
本変更はネックラインを一切参照しない（主構成点の `idx` しか見ない）ので、
どちらの issue が先に入っても衝突しない。
