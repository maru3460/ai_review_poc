# ai_review_poc

PR構造可視化レビュー支援ツールのPoC実験リポジトリ。

## ディレクトリ構成

- `backend/`: Webhook受信や解析ジョブ起動を担当するAPI側の土台
- `frontend/`: 可視化UIを配信するWeb側の土台

## 前提

- Node.js 20 以上

## ローカル起動手順

1. Backend環境変数を設定

```bash
cp backend/.env.example backend/.env
set -a; source backend/.env; set +a
npm --prefix backend start
```

2. Frontend環境変数を設定

```bash
cp frontend/.env.example frontend/.env
set -a; source frontend/.env; set +a
npm --prefix frontend start
```

3. 動作確認

```bash
curl http://localhost:3001/health
curl http://localhost:3000/health
```

## 環境変数方針

- 必須環境変数が未設定の場合、起動時に明示エラーを表示して終了する
- サンプル値は各`.env.example`を参照する

### Backend必須環境変数

- `GITHUB_APP_ID`
- `GITHUB_TOKEN`
- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_BOT_LOGIN`
- `BACKEND_PORT`

### Backend任意環境変数

- `GITHUB_API_BASE_URL`（デフォルト: `https://api.github.com`）

## GitHub Webhook（タスク2）

- 受信エンドポイント: `POST /webhooks/github`
- 起動対象イベント:
  - `pull_request` の `opened` / `synchronize`
  - `issue_comment` の `created` かつPRコメント内で `@GITHUB_BOT_LOGIN` へのmentionあり
- 非対象イベントはジョブ起動しない
- 同一`X-GitHub-Delivery`は重複起動しない（1回のみ）

### 動作確認例

1. Backendを起動する
2. 署名付きでWebhookを送る

```bash
payload='{"action":"opened","pull_request":{"number":1},"repository":{"full_name":"org/repo"},"sender":{"login":"alice"}}'
sig="sha256=$(printf '%s' "$payload" | openssl dgst -sha256 -hmac "$GITHUB_WEBHOOK_SECRET" -hex | sed 's/^.* //')"
curl -i http://localhost:3001/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: delivery-1" \
  -H "X-Hub-Signature-256: $sig" \
  -d "$payload"
```

3. キュー確認（PoC用）

```bash
curl http://localhost:3001/jobs
```

## PRメタ情報・差分取得（タスク3）

- Webhookで起動したジョブごとにGitHub APIから次を収集する
  - 変更ファイル一覧
  - 追加/削除行数
  - 変更関数候補一覧（差分hunk/変更行から抽出）
  - PRタイトル/説明
- 成功時はJSONを保存する
  - `backend/data/pr-metadata/<owner__repo>/pr-<number>.json`
- 失敗時は失敗理由JSONを保存する
  - `backend/data/pr-metadata/<owner__repo>/pr-<number>.failure.json`

## ログ方針（PoC）

- ログレベルは `startup` / `info` / `warn` / `error` を基本に運用する
- 機密情報（シークレット、トークン、個人情報）はログ出力しない
- 起動時はポート番号とサービス名のみを出力する
- エラー時は原因特定に必要なメッセージを1行で記録する
