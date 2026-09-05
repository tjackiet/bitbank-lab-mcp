# 完成済み H&S の右肩の取り方と探索窓の実測（issue #249 Phase 1）

`scripts/measure_hs_shoulder_window_249.ts` の出力をそのまま貼ったもの（§8 以降）に、
目視判定（§5）と Phase 2 への推奨（§6）を足したメモ。**検出器のソースは 1 行も変更していない。**

母集団は 2 つ。**計測 1 / 3 は #242 実装後の作業ツリー**（今の状態で右肩を取り直したらどうなるか）、
**計測 2 は #242 実装前の `b49a08e`**（ゲートで消える前のバー数分布）。

## 1. 読み方

- **「取り直した右肩」の定義**: #242 の経路ゲート（`peak_after_last_pivot` /
  `trough_after_last_pivot`）で落ちた候補について、**最終構成点とブレイク足の間にある同種ピボットの
  うち最もブレイクに近いもの**。issue 本文の「教科書的にはネックラインを割る直前の山」を機械的な
  規則にしたもので、形 A なら 274 → **289**、形 B なら 289 → **313** になる（issue 本文の指定と一致）。
  頭・谷1・谷2 は据え置きで右肩だけを差し替えた 5 点を「取り直した 5 点」と呼ぶ。
- **窓** = `enumerateHsWindows`（`detect_hs.ts`）が strict 経路に渡す候補 5 点。
  ここに現れない 5 点は `view=debug` の candidates にも出ない（棄却されたのではなく、
  そもそも候補になっていない）。
- **構造** = `(系列, 時間足, type, 元の構成点 idx, 取り直した右肩)` で畳んだ単位。
  オプション 8 通りと、同じピボット列を生む `swingDepth` の重複を除く。
- 計測 2 / 3 の分布は `(系列, 時間足, type, 構成点 idx, ブレイク idx)` で畳む。
- 「時間足」は**パラメータ組の名前で再サンプリングではない**（#211 / #216 / #242 / #243 と同じ
  コーパスの組み方）。`btc_jpy_1day_2026` を `1hour` のパラメータで走らせた行が出るのはそのため。
- コーパスは **プールしない**（#219）。標準 800 / 実データ B / C / D を別表で見る。

## 2. 結論（計測結果の要約。対策の決定は含まない）

| # | 結論 |
|---|---|
| 1 | **論点 1 は「あり」。ただし律速は肩の同水準判定でも `headProminencePct` でもなく、窓生成の谷2 の取り方。** 実データ C / D で右肩を取り直した 5 点は **`head_and_shoulders` の全 20 構造すべてが窓にならない**（C 20 / 20、D 20 / 20）。原因は `extremeBetween`——右肩を後ろへずらすと「頭と右肩の間の最安値の谷」も一緒に動くので、谷2 が別の点に差し替わる |
| 2 | **形 A の右肩を 289 に取り直すと、生成される窓は `212-220-228-285-289` = 形 B そのもの。** 谷2 が 235（12,452,249）→ 285（12,358,272）に動くため。**2 構造は独立ではなく、形 A の「正しい右肩」の読みが形 B**。そして形 B は #242 のゲート（offender 300）で `invalid` |
| 3 | **形 B の右肩を 313 に取り直すと谷2 が 285 → 297（12,234,364）に動き、accepted にはならない。** 落ち方は左肩によって 2 通り: 構造ゲートの **`no_neckline_cross_before_peak1`**（#242 のゲートより手前。左肩 212 / 208 / 198 / 139）と、**ブレイクが見つからず `near_completion`**（左肩 134 / 83 / 65 / 57 / 19 / 11 / 4）。後者はネックライン水準が谷2 = 297 の 12,234,364 まで下がり、317 の終値 12,144,136 でも 1.5% バッファ（12,050,849）に届かないため |
| 4 | **relaxed 経路は救わない。** 取り直した 5 点が `pivots` 上で連続する構造は **0 / 78**（全コーパス）。relaxed は連続 5 点しか組まない。そもそも strict が候補を 1 件でも作った時点で relaxed は走らない（`detectHeadAndShoulders` の `found`） |
| 5 | **取り直しが成立するかは値動き依存。** 標準コーパス 10 / 10、実データ B 10 / 12 は取り直した 5 点がそのまま窓になり、多くが `completed` で accepted になる（例: 実データ B `242-245-249-265-276`）。成立しないのは **下落局面**——右肩を後ろへずらす区間に必ずより深い谷が入るので、谷2 も一緒に動く。実データ C / D の該当区間はどれもこれ |
| 6 | **`HS_BREAKOUT_MAX_BARS = 30` は 1 時間足の完成済み H&S にとって長い。** #242 前の実データ C / D で、完成済み `head_and_shoulders` の右肩 → ブレイクは **1hour で min 20 / p50 28 / max 28**、4hour で **全 5 構造が 28**。上限 30 の 93% に中央値が乗っている。同じコーパスの `inverse_head_and_shoulders` は p50 8 / max 9 で、**上限近くに張り付いているのは完成済み H&S だけ** |
| 7 | **「右肩とブレイクの間の同種ピボット数」は分布として偏っている。** #242 前の実データ C / D の完成済み H&S は 1hour で 0 個が 0 件・2 個が 14 件・3 個以上が 1 件、4hour も全件 2 個以上。逆 H&S は 1hour で 0 個が 10〜11 件と対照的。**#242 のゲートで H&S だけが全滅したのは、右肩からブレイクまで 28 本もあれば同種ピボットが 2 つできるから** |
| 8 | **完成済み経路に全長上限が無いことは実データで効いている（論点 3）。** #242 前の実データ C / D で左肩 → 右肩は 1hour max 285 本（≒ 12 日）・4hour max 285 本。forming 経路の `getHsFormingBarParams(tf).maxBars`（1hour 146 / 4hour 180）を **1hour で 8 / 15 構造、4hour で 5 / 5 構造が超過**。超過しているのは**全部が形 B 側**（右肩 289 / 308）で、形 A（左肩 → 右肩 62 本）は上限内 |
| 9 | **#242 後、実データ B / C / D の 1hour で accepted な完成済み H&S は 0 件**（逆 H&S は B 14 / C 10 / D 11 構造が残り、右肩 → ブレイクは max 9 本）。ただし合成 fixture の `completed_hs` は右肩 → ブレイク 3 本で通るので、**検出器として死んでいるわけではない**。「1 時間足の完成済み H&S は事実上検出されない」は**実データ 3 系列の範囲で正しい**記述 |
| 10 | **目視では実データ C / D の 1hour に H&S と呼べる形は無い**（§5）。形 A / 形 B / 取り直した候補いずれも「呼べない」。天井（8/25 の 12,851,000 と 8/28 の 12,839,153）は 2 山の double top で、その間の最高値は両山より低い。8/30 以降は切り下がる高値の連続 |
| 11 | **triple には同じ症状が出ていない。** #242 前の実データ C / D の完成済み triple は最終構成点 → ブレイクが `triple_bottom` 8 本 / `triple_top` 15 本で、`MAX_BARS_FROM_EXTREMUM = 20` への張り付きは 0。間の同種ピボットも `triple_bottom` は 0 個。**`MAX_BARS_FROM_EXTREMUM = 20` の見直しを支える材料は本計測には無い** |

## 3. issue 本文の 2 構造の現状（実データ D / 1hour / swingDepth=auto）

構成点の価格（`price` は終値基準。`swing.ts` の格納規約）:

| idx | kind | price | 日時（UTC） |
|---:|---|---:|---|
| 212 | H（左肩） | 12,533,028 | 2026-08-30T00:00 |
| 220 | L（谷1） | 12,503,787 | 2026-08-30T08:00 |
| 228 | H（頭） | 12,700,000 | 2026-08-30T16:00 |
| 235 | L（形 A の谷2） | 12,452,249 | 2026-08-30T23:00 |
| 274 | H（形 A の右肩） | 12,517,426 | 2026-09-01T14:00 |
| 283 | H | 12,416,308 | 2026-09-01T23:00 |
| 285 | L（形 B の谷2） | 12,358,272 | 2026-09-02T01:00 |
| 289 | H（形 B の右肩） | 12,428,578 | 2026-09-02T05:00 |
| — | ブレイク（形 A） | 12,262,832 | 2026-09-02T10:00（idx 294） |
| 297 | L | 12,234,364 | 2026-09-02T13:00 |
| 300 | H | 12,268,848 | 2026-09-02T16:00 |
| 313 | H | 12,260,000 | 2026-09-03T05:00 |
| — | ブレイク（形 B） | 12,144,136 | 2026-09-03T09:00（idx 317） |

| | 元の 5 点 | 状態 | 右肩を取り直すと | 生成される窓 | その窓の行方 |
|---|---|---|---|---|---|
| 形 A | `212-220-228-235-274` → 294 | `invalid`（`peak_after_last_pivot` / offender 283） | 274 → **289** | **`212-220-228-285-289`（= 形 B）** | `invalid`（`peak_after_last_pivot` / offender 300） |
| 形 B | `212-220-228-285-289` → 317 | `invalid`（`peak_after_last_pivot` / offender 300） | 289 → **313** | `212-220-228-297-313` | `no_neckline_cross_before_peak1`（構造ゲート） |

左肩を変えた別の組では 3 行目の行方が変わる（`83-85-94-297-313` などは構造ゲートを通るが
`near_completion`）。全 29 構造の明細は §8 の実データ D「計測 1」を参照。

**形 A → 形 B の畳み込みが本 issue の一番の発見。** issue 本文は形 A と形 B を「2 構造」として
並べているが、形 A の右肩を教科書どおりに取り直すと**形 B と同じ 5 点になる**。つまり
「早い右肩 + 長い探索窓」で拾われていた形 A は、正しく取り直した瞬間に形 B に吸収され、
その形 B もゲートで落ちる。**取り直しで新しい候補は 1 つも生まれない。**

## 4. 再現

```bash
npx tsx scripts/measure_hs_shoulder_window_249.ts
npx tsx scripts/measure_hs_shoulder_window_249.ts --json /tmp/249.json
npx tsx scripts/measure_hs_shoulder_window_249.ts --baseline-rev worktree
```

**実装後でもそのまま再現する。** 計測 2 のベースラインは検出器のソースを作業ツリーからではなく
`git show <rev>:tools/patterns/<file>` で読む（既定は `b49a08e` = PR #241 のマージ＝ #242 実装前の
`main`）。`tools/patterns/` を**ディレクトリごと**展開するので、`./reversal-gate.js` /
`./structural.js` も同じリビジョンから解決される（PR #250 のレビュー反映版と同じ流儀）。
ベースラインに #242 の本番ゲート（`checkBreakoutPath` / `applyPostBreakoutGates`）が入っていたら
**落ちる**——差分が常に 0 なのに数字だけ出る、という壊れ方を避けるため。

計測 1 は展開した複製の `detect_hs.ts` 末尾に `export { enumerateHsWindows, extremeBetween,
outerShoulderOk, HS_BREAKOUT_MAX_BARS, HS_MAX_SHOULDER_PAIRS };` を **1 行足すだけ**で、
関数本体は 1 文字も変えていない。窓生成を計測用に書き写すと「測った窓」と「実装の窓」がずれても
誰も気づかないため、**判定は本物を呼ぶ**。ずれていないことは 2 段で検算する:

1. 展開版の `detectHeadAndShoulders` が作業ツリーの本物と JSON 全キー一致すること（全 1088 ケース。§8 の 0 章）
2. 肩の組を分類する `classifyPair` の出力が、本物の `enumerateHsWindows` の窓列と**完全一致**すること
   （全ケース。1 件でも食い違えばスクリプトが例外で落ちる）

## 5. 目視判定（実データ C / D の 1 時間足）

判定は「H&S と呼べる」「呼べない」「判断保留」の 3 値。チャートは `render_chart_svg` に
フィクスチャのローソク足を流し（`analyze_indicators` をモック）、`overlays.ranges` /
`overlays.annotations` で構成点にマーカーを重ねて描いたもの。**独自の描画コードは書いていない**
（`.claude/rules/charting.md`）。描画用のハーネスは使い捨てでコミットしていない。

| 対象 | 判定 | 根拠 |
|---|---|---|
| 形 A `212-220-228-235-274` → 294（実データ D / 1hour） | **呼べない** | 頭 12,700,000 と両肩 12,533,028 / 12,517,426 の差は 1.3% / 1.4% しかない。そのうえ**頭と右肩の間に H245（12,562,240）・H255（12,598,466）・H265（12,659,390）の 3 つの山があり、いずれも両肩より高い**（H265 は頭との差 0.32%）。上部は 4 山のレンジで、頭が突出していない |
| 形 B `212-220-228-285-289` → 317（同上） | **呼べない** | 右肩とされる 289（12,428,578）は、頭からの下落が進んだ位置の戻り高値で、左肩（12,533,028）と 0.83% 差なのは偶然。形 A と同じく間に H245 / H255 / H265 という両肩より高い山を挟む。左肩 → ブレイクは 105 本（≒ 4.4 日）で、その間は H274 → H283 → H289 → H300 → H313 と高値を切り下げ続けている |
| 取り直した候補 `212-220-228-297-313` → ブレイク無し（同上） | **呼べない** | 右肩 313（12,260,000）は左肩より 2.2% 低く、谷1 220（12,503,787）よりも下。肩ではなく下落途中の戻り高値 |
| 実データ D / 1hour 全体（365 本） | **呼べない**（H&S は存在しない） | 天井は H94（8/25 02:00 / 12,851,000）と H165（8/28 01:00 / 12,839,153）の **2 山**で、間の谷は L131（8/26 15:00 / 12,449,981）。両山の差は 0.09%、谷は 3.0% 下で、形としては double top。**H&S ではない**——2 山の間の最高値は H155（12,799,028）で、両山より低い（H&S は中央が両肩より高いことが要件）。検出器側も内側の `double_top 155-158-165` と `triple_top 149-153-155-158-165` として拾っている。8/30 以降は 12.70M → 12.52M → 12.42M → 12.27M → 12.26M と高値を切り下げる下落で、3 山かつ中央が突出という形は無い |
| 実データ C / 1hour 全体（365 本） | **呼べない**（H&S は存在しない） | 実データ D と同じ値動きの別窓（D の idx + 19 = C の idx。#243 §5-4）。上の 2 山も同じ形で入っており、形 A / B は `231-239-247-254-293` → 313 と `231-239-247-304-308` → 336 として現れる |

**「0 件が正しい」**——実データ C / D の 1 時間足に、人が見て H&S と呼べる形は無い。
したがって #242 のゲートは実在する H&S を巻き添えにしていない。

## 6. Phase 2 への推奨（決定はしない）

### 推奨: **案 D（何もしない）を主、案 C（完成済みの全長上限）を次点**

| 案 | 判断 | 根拠 |
|---|---|---|
| **A. 右肩の選び方に「ブレイクに最も近い同水準の肩を優先」を入れる** | **推奨しない（本計測で否定された）** | 実データ C / D では取り直した 5 点が**候補として組めない**（結論 1〜3）。列挙順や `globalDedup` の優先度をいじっても、**候補集合に無いものは選べない**。実装するなら `extremeBetween` による谷2 の取り方（#146 の「谷は区間の極値」という設計）まで変える必要があり、しかも取り直した窓は目視でも H&S ではない（§5）。**下落局面では「右肩だけを後ろへずらす」は原理的に成立しない**——ずらした区間に必ずより深い谷が入るから |
| **B. `HS_BREAKOUT_MAX_BARS` / `MAX_BARS_FROM_EXTREMUM` を時間足別にする** | **単独では利用者から見た変化が無い** | 1hour の窓を短くする（#242 後に残っている逆 H&S の実測 max 9 本を残すなら 12 本程度）と、#242 のゲートが落としているのと**同じ 20 構造**が「そもそも完成しない」に変わるだけ。理由コードが `peak_after_last_pivot` から `near_completion` へ移り、`view=debug` の診断は**むしろ悪くなる**（「なぜ落ちたか」が消える）。triple 側には見直しを支える材料が無い（結論 11） |
| **C. 完成済み経路にもパターン全長の上限を入れる** | **入れる価値がある（次点）** | forming にはある `getHsFormingBarParams(tf)` の上限が completed に無いのは**経路間の非対称そのもの**で、直す理由が「実データが示す」だけでなく「一貫性」にもある。実測でも 1hour 8 / 15・4hour 5 / 5 構造が超過（結論 8）。**ただし今日の出力は 1 件だけ変わる**——実データ B の `inverse_head_and_shoulders 3-9-42-147-154`（左肩 → 右肩 151 本 > 146）は #242 後も accepted で残っているので、上限を入れると消える。この 1 件を落としてよいかが判断のすべて |
| **D. 何もしない（`docs/tools.md` に記述）** | **推奨** | 目視で「実データ C / D の 1hour に H&S と呼べる形は無い」（§5）。**0 件は正しい**。書くべきことは「探索窓 30 本 + #242 の経路ゲートの組み合わせにより、1 時間足の完成済み H&S は右肩の直後に割った形しか通らない」——issue 本文が「それが意図なら文書化し」と書いている通り |

### 案 C を採るときに残る宿題

- 上限の値は `getHsFormingBarParams(tf)` をそのまま使うのか、完成済み用に別テーブルにするのか。
  forming の 21〜90 日は「形成中と呼べる期間」の根拠なので、完成済みに流用してよいかは別の議論（#152 の作法）
- 実データ B の 1 構造が消えることを固定するテストが要る
- **#242 のゲートで既に落ちている 20 構造には効かない**（今日の出力は変わらない）。
  ゲートを将来緩めたときに同じ形が戻ってこない保証、という位置づけになる

### 案 A を採るなら追加で必要な計測

- 谷2 の取り方を「頭と右肩の間の最安値」から変えた場合に、**標準コーパス 704 の合成 fixture で
  何が消えるか**。#146 の窓生成は「合成 704 ケースの `data.patterns` は完全一致」を条件に入れた変更なので、
  同じ基準で測る必要がある
- 取り直した窓が accepted になる系列（標準コーパス 10 / 実データ B 10）で、
  **取り直し前の候補と取り直し後の候補が両方出るのか、片方に畳まれるのか**。本計測は
  「取り直した窓がどうなるか」しか見ておらず、`globalDedup` の勝敗までは追っていない

## 7. #251（経路ゲートの深さ依存）との関係

**右肩の取り方に手を入れるなら #251 と同時に判断する必要がある。** 本計測の「取り直した右肩」は
「最終構成点とブレイク足の間にある**同種ピボット**のうち最もブレイクに近いもの」と定義したが、
これは #242 のゲート（`detectPivotBeforeBreakout`）が見ているのと**同じピボット列**である。
ピボット列は `swingDepth` の関数なので（#251 の指摘そのもの）、深さが変われば「取り直す先」も
変わる——実データ D の 1hour では `swingDepth=6` にすると H274 も H283 もピボットにならず、
**形 A 自体が候補として存在しなくなる**（§8 の実データ D 計測 1 で `swingDepth=6` の行が
形 B 側の `19-49-94-285-289` 1 件だけなのがこれ）。
案 A（右肩の優先順位）を実装すると、**「どの肩を右肩に選ぶか」という検出結果を決める判断が
`swingDepth` に依存する**ことになり、#251 の「同じ値動きで深さを変えると invalid / completed が
入れ替わる」という説明しにくさが、ゲートの可否だけでなく構成点そのものへ広がる。
一方 #251 の推奨（案 3 = 何もしない + `docs/tools.md` に明記）と本 issue の推奨（案 D）は
**どちらも「深さ依存を仕様として文書化する」に収束する**ので、両者を別々に決めても矛盾しない。
順序としては #251 を先に決め、その結論（深さ依存を仕様とするか、ゲート専用の浅い列を使うか）を
前提に本 issue の案 A / C を再検討するのが素直。

## 8. 計測スクリプトの出力（そのまま）

### 0. ハーネスと検算

| 項目 | 値 |
|---|---:|
| ベースラインのリビジョン（計測 2） | `b49a08e` |
| ケース数 | 1088 |
| **export を足した複製が本物と食い違ったケース** | **0** |
| `HS_BREAKOUT_MAX_BARS`（作業ツリー） | 30 |
| `HS_MAX_SHOULDER_PAIRS`（作業ツリー） | 5000 |

ベースラインと作業ツリーで差があるファイル: `detect_doubles.ts` , `detect_hs.ts` , `detect_triples.ts` , `reversal-gate.ts` , `structural.ts`

窓の列挙（`enumerateHsWindows`）と `classifyPair` の突き合わせは**全ケースで実行**しており、
1 件でも食い違えばスクリプトが例外で落ちる（ここまで到達している時点で一致している）。

### 標準コーパス 800（合成 704 + 実データ A 96）（800 ケース）

#### 計測 1: 右肩を「ブレイク直前の同種ピボット」に取り直した候補の行方（#242 後）

延べ 104 行 / 構造 10 件。

- 取り直した 5 点が**そのまま窓になる**: 10 / 10

| 系列 / 時間足 / swingDepth | type | 元の 5 点 | ブレイク | 取り直した右肩 | 取り直した 5 点 | 窓か | 肩の組が実際に作る窓 | その窓の行方 |
|---|---|---|---:|---:|---|---|---|---|
| btc_jpy_1day_2026 / 4hour / 2 | inverse_head_and_shoulders | `20-24-27-53-66` | 83 | 80 | `20-24-27-53-80` | なる | `20-24-27-53-80` | accepted(prior_trend_insufficient_data) → accepted / status=completed |
| btc_jpy_1day_2026 / 4hour / 3 | inverse_head_and_shoulders | `20-24-27-53-66` | 83 | 77 | `20-24-27-53-77` | なる | `20-24-27-53-77` | accepted(prior_trend_insufficient_data) → re_entered_trough_zone / status=invalid |
| btc_jpy_1day_2026 / 4hour / 3 | inverse_head_and_shoulders | `13-17-27-53-66` | 83 | 77 | `13-17-27-53-77` | なる | `13-17-27-53-77` | accepted(prior_trend_insufficient_data) → accepted / status=completed |
| btc_jpy_1day_2026 / 1hour / auto | inverse_head_and_shoulders | `20-24-27-53-66` | 83 | 77 | `20-24-27-53-77` | なる | `20-24-27-53-77` | accepted(prior_trend_insufficient_data) → re_entered_trough_zone / status=invalid |
| btc_jpy_1day_2026 / 1hour / auto | inverse_head_and_shoulders | `13-17-27-53-66` | 83 | 77 | `13-17-27-53-77` | なる | `13-17-27-53-77` | accepted(prior_trend_insufficient_data) → accepted / status=completed |
| btc_jpy_1day_2026 / 1hour / auto | inverse_head_and_shoulders | `7-17-27-53-66` | 83 | 77 | `7-17-27-53-77` | なる | `7-17-27-53-77` | accepted(prior_trend_insufficient_data) → accepted / status=completed |
| btc_jpy_1day_2026 / 1hour / 2 | inverse_head_and_shoulders | `20-24-27-47-49` | 53 | 52 | `20-24-27-47-52` | なる | `20-24-27-47-52` | valleys_above_neckline |
| btc_jpy_1day_2026 / 1hour / 2 | inverse_head_and_shoulders | `20-24-27-53-66` | 83 | 80 | `20-24-27-53-80` | なる | `20-24-27-53-80` | accepted(prior_trend_insufficient_data) → accepted / status=completed |
| btc_jpy_1day_2026 / 1hour / 2 | inverse_head_and_shoulders | `7-17-27-53-66` | 83 | 80 | `7-17-27-53-80` | なる | `7-17-27-53-80` | accepted(prior_trend_insufficient_data) → accepted / status=completed |
| btc_jpy_1day_2026 / 1hour / 2 | inverse_head_and_shoulders | `7-17-27-53-77` | 83 | 80 | `7-17-27-53-80` | なる | `7-17-27-53-80` | accepted(prior_trend_insufficient_data) → accepted / status=completed |

relaxed 経路は `pivots` 上で**連続する 5 点**しか組まない。取り直した 5 点がその条件を満たす構造: 0 / 10。

#### 計測 2-a: #242 前に accepted だった完成済み H&S / 逆 H&S のバー数分布

最終構成点 → ブレイクのバー数（上限 30）。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | 上限張り付き |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| head_and_shoulders | 1day | 1 | 3 | 3 | 3 | 3 | 3 | 0 |
| head_and_shoulders | 1hour | 1 | 3 | 3 | 3 | 3 | 3 | 0 |
| inverse_head_and_shoulders | 1hour | 14 | 1 | 2 | 6 | 17 | 27 | 0 |
| inverse_head_and_shoulders | 4hour | 8 | 1 | 3 | 6 | 17 | 27 | 0 |

第1構成点 → 最終構成点のバー数（H&S なら左肩 → 右肩）。`forming maxBars` は形成中経路が課している上限。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | forming maxBars | 超過 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| head_and_shoulders | 1day | 1 | 18 | 18 | 18 | 18 | 18 | 99 | 0 |
| head_and_shoulders | 1hour | 1 | 18 | 18 | 18 | 18 | 18 | 146 | 0 |
| inverse_head_and_shoulders | 1hour | 14 | 8 | 32 | 53 | 60 | 73 | 146 | 0 |
| inverse_head_and_shoulders | 4hour | 8 | 25 | 36 | 53 | 57 | 64 | 180 | 0 |

最終構成点とブレイクの間の同種ピボット数。

| type | 時間足 | 0 | 1 | 2 | 3+ |
|---|---|---:|---:|---:|---:|
| head_and_shoulders | 1day | 1 | 0 | 0 | 0 |
| head_and_shoulders | 1hour | 1 | 0 | 0 | 0 |
| inverse_head_and_shoulders | 1hour | 9 | 4 | 0 | 1 |
| inverse_head_and_shoulders | 4hour | 4 | 2 | 1 | 1 |

#### 計測 2-b: 同じ表を triple（`MAX_BARS_FROM_EXTREMUM = 20`）で

最終構成点 → ブレイクのバー数（上限 20）。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | 上限張り付き |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| triple_top | 1day | 1 | 3 | 3 | 3 | 3 | 3 | 0 |
| triple_top | 1hour | 1 | 3 | 3 | 3 | 3 | 3 | 0 |

第1構成点 → 最終構成点のバー数（H&S なら左肩 → 右肩）。`forming maxBars` は形成中経路が課している上限。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | forming maxBars | 超過 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| triple_top | 1day | 1 | 18 | 18 | 18 | 18 | 18 | 99 | 0 |
| triple_top | 1hour | 1 | 18 | 18 | 18 | 18 | 18 | 146 | 0 |

最終構成点とブレイクの間の同種ピボット数。

| type | 時間足 | 0 | 1 | 2 | 3+ |
|---|---|---:|---:|---:|---:|
| triple_top | 1day | 1 | 0 | 0 | 0 |
| triple_top | 1hour | 1 | 0 | 0 | 0 |

#### 計測 3: #242 後に accepted で残っている完成済み H&S / 逆 H&S

最終構成点 → ブレイクのバー数（上限 30）。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | 上限張り付き |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| head_and_shoulders | 1day | 1 | 3 | 3 | 3 | 3 | 3 | 0 |
| head_and_shoulders | 1hour | 1 | 3 | 3 | 3 | 3 | 3 | 0 |
| inverse_head_and_shoulders | 1hour | 8 | 1 | 1 | 3 | 3 | 6 | 0 |
| inverse_head_and_shoulders | 4hour | 4 | 1 | 1 | 3 | 3 | 6 | 0 |

第1構成点 → 最終構成点のバー数（H&S なら左肩 → 右肩）。`forming maxBars` は形成中経路が課している上限。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | forming maxBars | 超過 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| head_and_shoulders | 1day | 1 | 18 | 18 | 18 | 18 | 18 | 99 | 0 |
| head_and_shoulders | 1hour | 1 | 18 | 18 | 18 | 18 | 18 | 146 | 0 |
| inverse_head_and_shoulders | 1hour | 8 | 8 | 32 | 60 | 64 | 73 | 146 | 0 |
| inverse_head_and_shoulders | 4hour | 4 | 25 | 32 | 60 | 60 | 64 | 180 | 0 |

最終構成点とブレイクの間の同種ピボット数。

| type | 時間足 | 0 | 1 | 2 | 3+ |
|---|---|---:|---:|---:|---:|
| head_and_shoulders | 1day | 1 | 0 | 0 | 0 |
| head_and_shoulders | 1hour | 1 | 0 | 0 | 0 |
| inverse_head_and_shoulders | 1hour | 8 | 0 | 0 | 0 |
| inverse_head_and_shoulders | 4hour | 4 | 0 | 0 | 0 |

### 実データ B 96（`btc_jpy_1hour_2026_08`）（96 ケース）

#### 計測 1: 右肩を「ブレイク直前の同種ピボット」に取り直した候補の行方（#242 後）

延べ 112 行 / 構造 12 件。

- 取り直した 5 点が**そのまま窓になる**: 10 / 12
- 窓にならない内訳:
  - 肩の組は窓になるが構成点が別物になる（谷2 を `extremeBetween` が別の点に取る） — 2 件

| 系列 / 時間足 / swingDepth | type | 元の 5 点 | ブレイク | 取り直した右肩 | 取り直した 5 点 | 窓か | 肩の組が実際に作る窓 | その窓の行方 |
|---|---|---|---:|---:|---|---|---|---|
| btc_jpy_1hour_2026_08 / 1hour / auto | inverse_head_and_shoulders | `3-9-42-118-137` | 162 | 154 | `3-9-42-118-154` | ならない（谷2 が別の点） | `3-9-42-147-154` | accepted(prior_trend_insufficient_data) → accepted / status=completed |
| btc_jpy_1hour_2026_08 / 1hour / 2 | inverse_head_and_shoulders | `242-245-249-265-272` | 280 | 276 | `242-245-249-265-276` | なる | `242-245-249-265-276` | accepted / status=completed |
| btc_jpy_1hour_2026_08 / 1hour / 2 | inverse_head_and_shoulders | `230-239-249-265-272` | 280 | 276 | `230-239-249-265-276` | なる | `230-239-249-265-276` | accepted / status=completed |
| btc_jpy_1hour_2026_08 / 1hour / 2 | inverse_head_and_shoulders | `242-245-249-283-285` | 294 | 291 | `242-245-249-283-291` | なる | `242-245-249-283-291` | accepted / status=completed |
| btc_jpy_1hour_2026_08 / 1hour / 2 | inverse_head_and_shoulders | `225-239-249-265-272` | 280 | 276 | `225-239-249-265-276` | なる | `225-239-249-265-276` | accepted / status=completed |
| btc_jpy_1hour_2026_08 / 1hour / 2 | inverse_head_and_shoulders | `242-245-249-283-288` | 294 | 291 | `242-245-249-283-291` | なる | `242-245-249-283-291` | accepted / status=completed |
| btc_jpy_1hour_2026_08 / 1hour / 2 | inverse_head_and_shoulders | `230-239-249-283-285` | 294 | 291 | `230-239-249-283-291` | なる | `230-239-249-283-291` | accepted / status=completed |
| btc_jpy_1hour_2026_08 / 1hour / 2 | inverse_head_and_shoulders | `230-239-249-283-288` | 294 | 291 | `230-239-249-283-291` | なる | `230-239-249-283-291` | accepted / status=completed |
| btc_jpy_1hour_2026_08 / 1hour / 2 | inverse_head_and_shoulders | `20-26-42-106-109` | 118 | 113 | `20-26-42-106-113` | なる | `20-26-42-106-113` | accepted(prior_trend_insufficient_data) → peak_too_shallow |
| btc_jpy_1hour_2026_08 / 1hour / 2 | inverse_head_and_shoulders | `15-18-42-106-109` | 118 | 113 | `15-18-42-106-113` | なる | `15-18-42-106-113` | accepted(prior_trend_insufficient_data) → peak_too_shallow |
| btc_jpy_1hour_2026_08 / 1hour / 2 | inverse_head_and_shoulders | `3-9-42-106-109` | 118 | 113 | `3-9-42-106-113` | なる | `3-9-42-106-113` | accepted(prior_trend_insufficient_data) → peak_too_shallow |
| btc_jpy_1hour_2026_08 / 1hour / 2 | inverse_head_and_shoulders | `3-9-42-118-134` | 162 | 154 | `3-9-42-118-154` | ならない（谷2 が別の点） | `3-9-42-147-154` | accepted(prior_trend_insufficient_data) → accepted / status=completed |

relaxed 経路は `pivots` 上で**連続する 5 点**しか組まない。取り直した 5 点がその条件を満たす構造: 0 / 12。

#### 計測 2-a: #242 前に accepted だった完成済み H&S / 逆 H&S のバー数分布

最終構成点 → ブレイクのバー数（上限 30）。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | 上限張り付き |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| inverse_head_and_shoulders | 1hour | 21 | 3 | 6 | 8 | 9 | 28 | 0 |

第1構成点 → 最終構成点のバー数（H&S なら左肩 → 右肩）。`forming maxBars` は形成中経路が課している上限。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | forming maxBars | 超過 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| inverse_head_and_shoulders | 1hour | 21 | 30 | 43 | 51 | 89 | 151 | 146 | 1 |

最終構成点とブレイクの間の同種ピボット数。

| type | 時間足 | 0 | 1 | 2 | 3+ |
|---|---|---:|---:|---:|---:|
| inverse_head_and_shoulders | 1hour | 14 | 5 | 2 | 0 |

#### 計測 2-b: 同じ表を triple（`MAX_BARS_FROM_EXTREMUM = 20`）で

最終構成点 → ブレイクのバー数（上限 20）。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | 上限張り付き |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| triple_bottom | 1hour | 2 | 8 | 8 | 8 | 8 | 8 | 0 |

第1構成点 → 最終構成点のバー数（H&S なら左肩 → 右肩）。`forming maxBars` は形成中経路が課している上限。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | forming maxBars | 超過 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| triple_bottom | 1hour | 2 | 30 | 30 | 42 | 42 | 42 | 146 | 0 |

最終構成点とブレイクの間の同種ピボット数。

| type | 時間足 | 0 | 1 | 2 | 3+ |
|---|---|---:|---:|---:|---:|
| triple_bottom | 1hour | 2 | 0 | 0 | 0 |

#### 計測 3: #242 後に accepted で残っている完成済み H&S / 逆 H&S

最終構成点 → ブレイクのバー数（上限 30）。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | 上限張り付き |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| inverse_head_and_shoulders | 1hour | 14 | 3 | 4 | 8 | 9 | 9 | 0 |

第1構成点 → 最終構成点のバー数（H&S なら左肩 → 右肩）。`forming maxBars` は形成中経路が課している上限。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | forming maxBars | 超過 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| inverse_head_and_shoulders | 1hour | 14 | 30 | 42 | 51 | 89 | 151 | 146 | 1 |

最終構成点とブレイクの間の同種ピボット数。

| type | 時間足 | 0 | 1 | 2 | 3+ |
|---|---|---:|---:|---:|---:|
| inverse_head_and_shoulders | 1hour | 14 | 0 | 0 | 0 |

### 実データ C 96（`btc_jpy_1hour_2026_09`）（96 ケース）

#### 計測 1: 右肩を「ブレイク直前の同種ピボット」に取り直した候補の行方（#242 後）

延べ 488 行 / 構造 27 件。

- 取り直した 5 点が**そのまま窓になる**: 7 / 27
- 窓にならない内訳:
  - 肩の組は窓になるが構成点が別物になる（谷2 を `extremeBetween` が別の点に取る） — 20 件

| 系列 / 時間足 / swingDepth | type | 元の 5 点 | ブレイク | 取り直した右肩 | 取り直した 5 点 | 窓か | 肩の組が実際に作る窓 | その窓の行方 |
|---|---|---|---:|---:|---|---|---|---|
| btc_jpy_1hour_2026_09 / 4hour / auto | head_and_shoulders | `84-91-113-304-308` | 336 | 332 | `84-91-113-304-332` | ならない（谷2 が別の点） | `84-91-113-316-332` | accepted / status=near_completion |
| btc_jpy_1hour_2026_09 / 4hour / auto | head_and_shoulders | `76-91-113-304-308` | 336 | 332 | `76-91-113-304-332` | ならない（谷2 が別の点） | `76-91-113-316-332` | accepted / status=near_completion |
| btc_jpy_1hour_2026_09 / 4hour / auto | head_and_shoulders | `38-68-113-304-308` | 336 | 332 | `38-68-113-304-332` | ならない（谷2 が別の点） | `38-68-113-316-332` | accepted / status=near_completion |
| btc_jpy_1hour_2026_09 / 4hour / auto | head_and_shoulders | `23-68-113-304-308` | 336 | 332 | `23-68-113-304-332` | ならない（谷2 が別の点） | `23-68-113-316-332` | accepted(prior_trend_insufficient_data) → accepted / status=near_completion |
| btc_jpy_1hour_2026_09 / 4hour / 2 | head_and_shoulders | `30-68-113-304-308` | 336 | 332 | `30-68-113-304-332` | ならない（谷2 が別の点） | `30-68-113-316-332` | accepted / status=near_completion |
| btc_jpy_1hour_2026_09 / 1hour / auto | head_and_shoulders | `231-239-247-254-293` | 313 | 308 | `231-239-247-254-308` | ならない（谷2 が別の点） | `231-239-247-304-308` | peak_after_last_pivot / status=invalid |
| btc_jpy_1hour_2026_09 / 1hour / auto | head_and_shoulders | `227-239-247-254-293` | 313 | 308 | `227-239-247-254-308` | ならない（谷2 が別の点） | `227-239-247-304-308` | peak_after_last_pivot / status=invalid |
| btc_jpy_1hour_2026_09 / 1hour / auto | head_and_shoulders | `231-239-247-304-308` | 336 | 332 | `231-239-247-304-332` | ならない（谷2 が別の点） | `231-239-247-316-332` | no_neckline_cross_before_peak1 |
| btc_jpy_1hour_2026_09 / 1hour / auto | head_and_shoulders | `217-219-247-254-293` | 313 | 308 | `217-219-247-254-308` | ならない（谷2 が別の点） | `217-219-247-304-308` | peak_after_last_pivot / status=invalid |
| btc_jpy_1hour_2026_09 / 1hour / auto | head_and_shoulders | `227-239-247-304-308` | 336 | 332 | `227-239-247-304-332` | ならない（谷2 が別の点） | `227-239-247-316-332` | no_neckline_cross_before_peak1 |
| btc_jpy_1hour_2026_09 / 1hour / auto | head_and_shoulders | `207-213-247-254-293` | 313 | 308 | `207-213-247-254-308` | ならない（谷2 が別の点） | `207-213-247-304-308` | no_neckline_cross_before_peak1 |
| btc_jpy_1hour_2026_09 / 1hour / auto | head_and_shoulders | `217-219-247-304-308` | 336 | 332 | `217-219-247-304-332` | ならない（谷2 が別の点） | `217-219-247-316-332` | no_neckline_cross_before_peak1 |
| btc_jpy_1hour_2026_09 / 1hour / auto | head_and_shoulders | `158-160-184-304-308` | 336 | 332 | `158-160-184-304-332` | ならない（谷2 が別の点） | `158-160-184-316-332` | no_neckline_cross_before_peak1 |
| btc_jpy_1hour_2026_09 / 1hour / auto | head_and_shoulders | `102-104-113-304-308` | 336 | 332 | `102-104-113-304-332` | ならない（谷2 が別の点） | `102-104-113-316-332` | accepted / status=near_completion |
| btc_jpy_1hour_2026_09 / 1hour / auto | head_and_shoulders | `84-91-113-304-308` | 336 | 332 | `84-91-113-304-332` | ならない（谷2 が別の点） | `84-91-113-316-332` | accepted / status=near_completion |
| btc_jpy_1hour_2026_09 / 1hour / auto | head_and_shoulders | `76-91-113-304-308` | 336 | 332 | `76-91-113-304-332` | ならない（谷2 が別の点） | `76-91-113-316-332` | accepted / status=near_completion |
| btc_jpy_1hour_2026_09 / 1hour / auto | head_and_shoulders | `30-68-113-304-308` | 336 | 332 | `30-68-113-304-332` | ならない（谷2 が別の点） | `30-68-113-316-332` | accepted / status=near_completion |
| btc_jpy_1hour_2026_09 / 1hour / auto | head_and_shoulders | `23-68-113-304-308` | 336 | 332 | `23-68-113-304-332` | ならない（谷2 が別の点） | `23-68-113-316-332` | accepted(prior_trend_insufficient_data) → accepted / status=near_completion |
| btc_jpy_1hour_2026_09 / 1hour / 2 | inverse_head_and_shoulders | `61-64-68-84-91` | 99 | 95 | `61-64-68-84-95` | なる | `61-64-68-84-95` | accepted / status=completed |
| btc_jpy_1hour_2026_09 / 1hour / 2 | inverse_head_and_shoulders | `49-58-68-84-91` | 99 | 95 | `49-58-68-84-95` | なる | `49-58-68-84-95` | accepted / status=completed |
| btc_jpy_1hour_2026_09 / 1hour / 2 | inverse_head_and_shoulders | `61-64-68-102-104` | 113 | 110 | `61-64-68-102-110` | なる | `61-64-68-102-110` | accepted / status=completed |
| btc_jpy_1hour_2026_09 / 1hour / 2 | inverse_head_and_shoulders | `44-58-68-84-91` | 99 | 95 | `44-58-68-84-95` | なる | `44-58-68-84-95` | accepted / status=completed |
| btc_jpy_1hour_2026_09 / 1hour / 2 | inverse_head_and_shoulders | `61-64-68-102-107` | 113 | 110 | `61-64-68-102-110` | なる | `61-64-68-102-110` | accepted / status=completed |
| btc_jpy_1hour_2026_09 / 1hour / 2 | inverse_head_and_shoulders | `49-58-68-102-104` | 113 | 110 | `49-58-68-102-110` | なる | `49-58-68-102-110` | accepted / status=completed |
| btc_jpy_1hour_2026_09 / 1hour / 2 | inverse_head_and_shoulders | `49-58-68-102-107` | 113 | 110 | `49-58-68-102-110` | なる | `49-58-68-102-110` | accepted / status=completed |
| btc_jpy_1hour_2026_09 / 1hour / 2 | head_and_shoulders | `153-155-184-304-308` | 336 | 332 | `153-155-184-304-332` | ならない（谷2 が別の点） | `153-155-184-316-332` | accepted / status=near_completion |
| btc_jpy_1hour_2026_09 / 1hour / 6 | head_and_shoulders | `38-68-113-304-308` | 336 | 332 | `38-68-113-304-332` | ならない（谷2 が別の点） | `38-68-113-316-332` | accepted / status=near_completion |

relaxed 経路は `pivots` 上で**連続する 5 点**しか組まない。取り直した 5 点がその条件を満たす構造: 0 / 27。

#### 計測 2-a: #242 前に accepted だった完成済み H&S / 逆 H&S のバー数分布

最終構成点 → ブレイクのバー数（上限 30）。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | 上限張り付き |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| head_and_shoulders | 1hour | 15 | 20 | 28 | 28 | 28 | 28 | 0 |
| head_and_shoulders | 4hour | 5 | 28 | 28 | 28 | 28 | 28 | 0 |
| inverse_head_and_shoulders | 1hour | 15 | 3 | 4 | 8 | 8 | 9 | 0 |

第1構成点 → 最終構成点のバー数（H&S なら左肩 → 右肩）。`forming maxBars` は形成中経路が課している上限。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | forming maxBars | 超過 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| head_and_shoulders | 1hour | 15 | 62 | 81 | 150 | 232 | 285 | 146 | 8 |
| head_and_shoulders | 4hour | 5 | 224 | 232 | 270 | 278 | 285 | 180 | 5 |
| inverse_head_and_shoulders | 1hour | 15 | 30 | 42 | 46 | 55 | 61 | 146 | 0 |

最終構成点とブレイクの間の同種ピボット数。

| type | 時間足 | 0 | 1 | 2 | 3+ |
|---|---|---:|---:|---:|---:|
| head_and_shoulders | 1hour | 0 | 0 | 14 | 1 |
| head_and_shoulders | 4hour | 0 | 0 | 4 | 1 |
| inverse_head_and_shoulders | 1hour | 10 | 4 | 1 | 0 |

#### 計測 2-b: 同じ表を triple（`MAX_BARS_FROM_EXTREMUM = 20`）で

最終構成点 → ブレイクのバー数（上限 20）。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | 上限張り付き |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| triple_bottom | 1hour | 2 | 8 | 8 | 8 | 8 | 8 | 0 |
| triple_top | 1hour | 1 | 15 | 15 | 15 | 15 | 15 | 0 |

第1構成点 → 最終構成点のバー数（H&S なら左肩 → 右肩）。`forming maxBars` は形成中経路が課している上限。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | forming maxBars | 超過 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| triple_bottom | 1hour | 2 | 30 | 30 | 42 | 42 | 42 | 146 | 0 |
| triple_top | 1hour | 1 | 16 | 16 | 16 | 16 | 16 | 146 | 0 |

最終構成点とブレイクの間の同種ピボット数。

| type | 時間足 | 0 | 1 | 2 | 3+ |
|---|---|---:|---:|---:|---:|
| triple_bottom | 1hour | 2 | 0 | 0 | 0 |
| triple_top | 1hour | 0 | 0 | 1 | 0 |

#### 計測 3: #242 後に accepted で残っている完成済み H&S / 逆 H&S

最終構成点 → ブレイクのバー数（上限 30）。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | 上限張り付き |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| inverse_head_and_shoulders | 1hour | 10 | 3 | 4 | 8 | 8 | 9 | 0 |

第1構成点 → 最終構成点のバー数（H&S なら左肩 → 右肩）。`forming maxBars` は形成中経路が課している上限。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | forming maxBars | 超過 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| inverse_head_and_shoulders | 1hour | 10 | 30 | 42 | 46 | 51 | 61 | 146 | 0 |

最終構成点とブレイクの間の同種ピボット数。

| type | 時間足 | 0 | 1 | 2 | 3+ |
|---|---|---:|---:|---:|---:|
| inverse_head_and_shoulders | 1hour | 10 | 0 | 0 | 0 |

### 実データ D 96（`btc_jpy_1hour_2026_09_05`）（96 ケース）

#### 計測 1: 右肩を「ブレイク直前の同種ピボット」に取り直した候補の行方（#242 後）

延べ 480 行 / 構造 29 件。

- 取り直した 5 点が**そのまま窓になる**: 9 / 29
- 窓にならない内訳:
  - 肩の組は窓になるが構成点が別物になる（谷2 を `extremeBetween` が別の点に取る） — 20 件

| 系列 / 時間足 / swingDepth | type | 元の 5 点 | ブレイク | 取り直した右肩 | 取り直した 5 点 | 窓か | 肩の組が実際に作る窓 | その窓の行方 |
|---|---|---|---:|---:|---|---|---|---|
| btc_jpy_1hour_2026_09_05 / 4hour / auto | head_and_shoulders | `65-72-94-285-289` | 317 | 313 | `65-72-94-285-313` | ならない（谷2 が別の点） | `65-72-94-297-313` | accepted / status=near_completion |
| btc_jpy_1hour_2026_09_05 / 4hour / auto | head_and_shoulders | `57-72-94-285-289` | 317 | 313 | `57-72-94-285-313` | ならない（谷2 が別の点） | `57-72-94-297-313` | accepted / status=near_completion |
| btc_jpy_1hour_2026_09_05 / 4hour / auto | head_and_shoulders | `19-49-94-285-289` | 317 | 313 | `19-49-94-285-313` | ならない（谷2 が別の点） | `19-49-94-297-313` | accepted(prior_trend_insufficient_data) → accepted / status=near_completion |
| btc_jpy_1hour_2026_09_05 / 4hour / 2 | head_and_shoulders | `11-49-94-285-289` | 317 | 313 | `11-49-94-285-313` | ならない（谷2 が別の点） | `11-49-94-297-313` | accepted(prior_trend_insufficient_data) → accepted / status=near_completion |
| btc_jpy_1hour_2026_09_05 / 4hour / 2 | head_and_shoulders | `4-49-94-285-289` | 317 | 313 | `4-49-94-285-313` | ならない（谷2 が別の点） | `4-49-94-297-313` | accepted(prior_trend_insufficient_data) → accepted / status=near_completion |
| btc_jpy_1hour_2026_09_05 / 1hour / auto | head_and_shoulders | `212-220-228-235-274` | 294 | 289 | `212-220-228-235-289` | ならない（谷2 が別の点） | `212-220-228-285-289` | peak_after_last_pivot / status=invalid |
| btc_jpy_1hour_2026_09_05 / 1hour / auto | head_and_shoulders | `208-220-228-235-274` | 294 | 289 | `208-220-228-235-289` | ならない（谷2 が別の点） | `208-220-228-285-289` | peak_after_last_pivot / status=invalid |
| btc_jpy_1hour_2026_09_05 / 1hour / auto | head_and_shoulders | `212-220-228-285-289` | 317 | 313 | `212-220-228-285-313` | ならない（谷2 が別の点） | `212-220-228-297-313` | no_neckline_cross_before_peak1 |
| btc_jpy_1hour_2026_09_05 / 1hour / auto | head_and_shoulders | `198-200-228-235-274` | 294 | 289 | `198-200-228-235-289` | ならない（谷2 が別の点） | `198-200-228-285-289` | peak_after_last_pivot / status=invalid |
| btc_jpy_1hour_2026_09_05 / 1hour / auto | head_and_shoulders | `208-220-228-285-289` | 317 | 313 | `208-220-228-285-313` | ならない（谷2 が別の点） | `208-220-228-297-313` | no_neckline_cross_before_peak1 |
| btc_jpy_1hour_2026_09_05 / 1hour / auto | head_and_shoulders | `188-194-228-235-274` | 294 | 289 | `188-194-228-235-289` | ならない（谷2 が別の点） | `188-194-228-285-289` | no_neckline_cross_before_peak1 |
| btc_jpy_1hour_2026_09_05 / 1hour / auto | head_and_shoulders | `198-200-228-285-289` | 317 | 313 | `198-200-228-285-313` | ならない（谷2 が別の点） | `198-200-228-297-313` | no_neckline_cross_before_peak1 |
| btc_jpy_1hour_2026_09_05 / 1hour / auto | head_and_shoulders | `139-141-165-285-289` | 317 | 313 | `139-141-165-285-313` | ならない（谷2 が別の点） | `139-141-165-297-313` | no_neckline_cross_before_peak1 |
| btc_jpy_1hour_2026_09_05 / 1hour / auto | head_and_shoulders | `83-85-94-285-289` | 317 | 313 | `83-85-94-285-313` | ならない（谷2 が別の点） | `83-85-94-297-313` | accepted / status=near_completion |
| btc_jpy_1hour_2026_09_05 / 1hour / auto | head_and_shoulders | `65-72-94-285-289` | 317 | 313 | `65-72-94-285-313` | ならない（谷2 が別の点） | `65-72-94-297-313` | accepted / status=near_completion |
| btc_jpy_1hour_2026_09_05 / 1hour / auto | head_and_shoulders | `57-72-94-285-289` | 317 | 313 | `57-72-94-285-313` | ならない（谷2 が別の点） | `57-72-94-297-313` | accepted / status=near_completion |
| btc_jpy_1hour_2026_09_05 / 1hour / auto | head_and_shoulders | `11-49-94-285-289` | 317 | 313 | `11-49-94-285-313` | ならない（谷2 が別の点） | `11-49-94-297-313` | accepted(prior_trend_insufficient_data) → accepted / status=near_completion |
| btc_jpy_1hour_2026_09_05 / 1hour / auto | head_and_shoulders | `4-49-94-285-289` | 317 | 313 | `4-49-94-285-313` | ならない（谷2 が別の点） | `4-49-94-297-313` | accepted(prior_trend_insufficient_data) → accepted / status=near_completion |
| btc_jpy_1hour_2026_09_05 / 1hour / 2 | inverse_head_and_shoulders | `42-45-49-65-72` | 80 | 76 | `42-45-49-65-76` | なる | `42-45-49-65-76` | accepted / status=completed |
| btc_jpy_1hour_2026_09_05 / 1hour / 2 | inverse_head_and_shoulders | `30-39-49-65-72` | 80 | 76 | `30-39-49-65-76` | なる | `30-39-49-65-76` | accepted / status=completed |
| btc_jpy_1hour_2026_09_05 / 1hour / 2 | inverse_head_and_shoulders | `42-45-49-83-85` | 94 | 91 | `42-45-49-83-91` | なる | `42-45-49-83-91` | accepted / status=completed |
| btc_jpy_1hour_2026_09_05 / 1hour / 2 | inverse_head_and_shoulders | `25-39-49-65-72` | 80 | 76 | `25-39-49-65-76` | なる | `25-39-49-65-76` | accepted(prior_trend_insufficient_data) → accepted / status=completed |
| btc_jpy_1hour_2026_09_05 / 1hour / 2 | inverse_head_and_shoulders | `42-45-49-83-88` | 94 | 91 | `42-45-49-83-91` | なる | `42-45-49-83-91` | accepted / status=completed |
| btc_jpy_1hour_2026_09_05 / 1hour / 2 | inverse_head_and_shoulders | `30-39-49-83-85` | 94 | 91 | `30-39-49-83-91` | なる | `30-39-49-83-91` | accepted / status=completed |
| btc_jpy_1hour_2026_09_05 / 1hour / 2 | inverse_head_and_shoulders | `25-39-49-83-85` | 94 | 91 | `25-39-49-83-91` | なる | `25-39-49-83-91` | accepted(prior_trend_insufficient_data) → accepted / status=completed |
| btc_jpy_1hour_2026_09_05 / 1hour / 2 | inverse_head_and_shoulders | `30-39-49-83-88` | 94 | 91 | `30-39-49-83-91` | なる | `30-39-49-83-91` | accepted / status=completed |
| btc_jpy_1hour_2026_09_05 / 1hour / 2 | inverse_head_and_shoulders | `25-39-49-83-88` | 94 | 91 | `25-39-49-83-91` | なる | `25-39-49-83-91` | accepted(prior_trend_insufficient_data) → accepted / status=completed |
| btc_jpy_1hour_2026_09_05 / 1hour / 2 | head_and_shoulders | `134-136-165-285-289` | 317 | 313 | `134-136-165-285-313` | ならない（谷2 が別の点） | `134-136-165-297-313` | accepted / status=near_completion |
| btc_jpy_1hour_2026_09_05 / 1hour / 6 | head_and_shoulders | `19-49-94-285-289` | 317 | 313 | `19-49-94-285-313` | ならない（谷2 が別の点） | `19-49-94-297-313` | accepted(prior_trend_insufficient_data) → accepted / status=near_completion |

relaxed 経路は `pivots` 上で**連続する 5 点**しか組まない。取り直した 5 点がその条件を満たす構造: 0 / 29。

#### 計測 2-a: #242 前に accepted だった完成済み H&S / 逆 H&S のバー数分布

最終構成点 → ブレイクのバー数（上限 30）。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | 上限張り付き |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| head_and_shoulders | 1hour | 15 | 20 | 28 | 28 | 28 | 28 | 0 |
| head_and_shoulders | 4hour | 5 | 28 | 28 | 28 | 28 | 28 | 0 |
| inverse_head_and_shoulders | 1hour | 18 | 3 | 4 | 8 | 8 | 9 | 0 |

第1構成点 → 最終構成点のバー数（H&S なら左肩 → 右肩）。`forming maxBars` は形成中経路が課している上限。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | forming maxBars | 超過 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| head_and_shoulders | 1hour | 15 | 62 | 81 | 150 | 232 | 285 | 146 | 8 |
| head_and_shoulders | 4hour | 5 | 224 | 232 | 270 | 278 | 285 | 180 | 5 |
| inverse_head_and_shoulders | 1hour | 18 | 30 | 42 | 49 | 58 | 66 | 146 | 0 |

最終構成点とブレイクの間の同種ピボット数。

| type | 時間足 | 0 | 1 | 2 | 3+ |
|---|---|---:|---:|---:|---:|
| head_and_shoulders | 1hour | 0 | 0 | 14 | 1 |
| head_and_shoulders | 4hour | 0 | 0 | 3 | 2 |
| inverse_head_and_shoulders | 1hour | 11 | 5 | 2 | 0 |

#### 計測 2-b: 同じ表を triple（`MAX_BARS_FROM_EXTREMUM = 20`）で

最終構成点 → ブレイクのバー数（上限 20）。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | 上限張り付き |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| triple_bottom | 1hour | 2 | 8 | 8 | 8 | 8 | 8 | 0 |
| triple_top | 1hour | 1 | 15 | 15 | 15 | 15 | 15 | 0 |

第1構成点 → 最終構成点のバー数（H&S なら左肩 → 右肩）。`forming maxBars` は形成中経路が課している上限。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | forming maxBars | 超過 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| triple_bottom | 1hour | 2 | 30 | 30 | 42 | 42 | 42 | 146 | 0 |
| triple_top | 1hour | 1 | 16 | 16 | 16 | 16 | 16 | 146 | 0 |

最終構成点とブレイクの間の同種ピボット数。

| type | 時間足 | 0 | 1 | 2 | 3+ |
|---|---|---:|---:|---:|---:|
| triple_bottom | 1hour | 2 | 0 | 0 | 0 |
| triple_top | 1hour | 0 | 0 | 1 | 0 |

#### 計測 3: #242 後に accepted で残っている完成済み H&S / 逆 H&S

最終構成点 → ブレイクのバー数（上限 30）。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | 上限張り付き |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| inverse_head_and_shoulders | 1hour | 11 | 3 | 4 | 4 | 8 | 9 | 0 |

第1構成点 → 最終構成点のバー数（H&S なら左肩 → 右肩）。`forming maxBars` は形成中経路が課している上限。

| type | 時間足 | 構造 | min | p25 | p50 | p75 | max | forming maxBars | 超過 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| inverse_head_and_shoulders | 1hour | 11 | 30 | 42 | 46 | 55 | 66 | 146 | 0 |

最終構成点とブレイクの間の同種ピボット数。

| type | 時間足 | 0 | 1 | 2 | 3+ |
|---|---|---:|---:|---:|---:|
| inverse_head_and_shoulders | 1hour | 11 | 0 | 0 | 0 |

