# MCP Prompts 設計方針

## 役割

- **Prompts**: ユーザーが選ぶ固定ワークフロー（ツール順・出力骨格・品質ガードレール）
- **Tools**: API・計算・`content` へのデータ充足
- **Visualizer**: おはよう / ポートフォリオは「取得 → Visualizer で可視化」。UI 詳細は Prompt に書かない

## 初級（🔰）

- やさしい言葉 + 初出指標の 1 行説明は維持
- 冗長な ASCII テンプレ・穴埋め表は削る

## 中級

- サポレジ: 「試され/崩壊」表現ルール・板 ±5% 制約を高密度で維持
- 主要指標: `analyze_indicators` 1 本。出力例・MACD パターン表は持たない

## 実装

- `src/prompts/` に分割（`beginner.ts`, `intermediate.ts`, `reports.ts`, `shared.ts`）
- `src/prompts.ts` は re-export のみ

## 変更時

Desktop で回帰: サポレジ（表現）、おはよう・ポートフォリオ（Visualizer）、初級 BTC（トーン）
