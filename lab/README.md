# lab/ — 研究用の起動口

**研究・検証専用。** private API の接続先を、同じマシンに立てたモックや委譲を制御する層（DCL）へ
差し替えてから MCP サーバーを起動する。判断の経緯は [ADR-0008](../docs/adr/0008-private-api-origin-lab-entry.md)。

- `lab/` は npm の配布物にも Docker イメージにも入らない。`npx bitbank-lab-mcp` では使えない。
  リポジトリを checkout して起動する（再現のため、タグか commit SHA を固定する）
- 環境変数・`.env`・設定ファイルからは接続先を変えられない。変わるのはこの起動口を使ったときだけ

## 何が差し替わるか

| 通信 | 接続先 |
|---|---|
| private API（`/v1/user/…`。資産・注文・取消・履歴など） | **`--private-api-origin` で指定した origin** |
| 公開 API（`https://public.bitbank.cc`。ticker・板・ローソク足など） | 本番のまま |
| ペア情報（`https://api.bitbank.cc/v1/spot/pairs`。認証不要） | 本番のまま（取れなくても preview / create は警告を出して続行する） |
| 上記以外で `https://api.bitbank.cc` へ向かう要求 | **止める**（既定のクライアントを迂回した要求。本番統合確認では DCL の迂回にあたる） |

## 指定できる origin

ループバックの http(s) origin だけ。`http://127.0.0.1:14000` のように **scheme・ホスト・ポートだけ**を書く。

- ホストは `127.0.0.1` / `[::1]` / `localhost` のいずれか（`localhost` は hosts ファイルに依存するので `127.0.0.1` を勧める）
- パス・末尾の `/`・クエリ・userinfo は付けられない。GET の署名は「パス + クエリ」に対して作られるため、
  パスの接頭辞を付けると署名したパスと送るパスがずれる。DCL は受け取ったパスをそのまま転送する前提
- 不正な値・未指定・キー未設定のときは、サーバーを起動せずに終了コード 2 で終わる。本番の接続先へは戻さない
- 差し替え先がリダイレクトを返しても従わない（要求は失敗する）。DCL は転送先を返すのではなく、自分で中継する

## 起動のしかた

```bash
npm ci
BITBANK_API_KEY=dummy BITBANK_API_SECRET=dummy \
  node_modules/.bin/tsx lab/start.ts --private-api-origin=http://127.0.0.1:14000
```

Claude Desktop などのホスト設定の例（パスは絶対パスにする。ホストが起動するときの cwd は `/` になりうる）:

```json
{
  "mcpServers": {
    "bitbank-lab": {
      "command": "/abs/path/to/bitbank-lab-mcp/node_modules/.bin/tsx",
      "args": [
        "/abs/path/to/bitbank-lab-mcp/lab/start.ts",
        "--private-api-origin=http://127.0.0.1:14000"
      ],
      "env": {
        "BITBANK_API_KEY": "dummy",
        "BITBANK_API_SECRET": "dummy",
        "LOG_LEVEL": "info",
        "NO_COLOR": "1"
      }
    }
  }
}
```

起動すると stderr に接続先が出る（stdout は MCP のプロトコルが使うので何も出さない）。
`logs/YYYY-MM-DD.jsonl` にも `private_api_origin_override` として残る。

## 注意

- **モックに向けるときはダミーのキーを使う。** [bitbank-lab-mock](https://github.com/tjackiet/bitbank-lab-mock) は
  認証ヘッダを検証しない（同 README の「無いもの」節）。本物のキーを向けない
- モックが実装していないエンドポイント（信用・入出金など）は、モックが `20003` を返し、MCP では
  「API キーが見つかりません」と表示される（モックの `docs/fidelity.md`「封筒に包まれない応答」節）。キーの問題ではない
- 差し替え先が返す応答（残高・注文の状態）は、本物の bitbank の応答として扱われる
- 署名は ACCESS-TIME-WINDOW 方式（既定 5 秒）で、要求ごとに一意な値を含まない。差し替え先が受け取った要求を
  そのまま本番へ転送する構成では、転送は時間窓の内に 1 回だけにする（再送すると二重発注になりうる）
- 確認トークン（preview → 実行の 2 段階確認）はこれまでどおり効く。差し替えは確認を外さない
