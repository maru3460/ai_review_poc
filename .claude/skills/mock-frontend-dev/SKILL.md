---
name: mock-frontend-dev
description: >
  このプロジェクト（ai_review_poc）でモックデータを使ってフロントエンドをローカル開発するための手順スキル。
  フロントエンドのUI変更・スタイル調整・コンポーネント開発をしたいとき、実際のGitHub APIなしにバックエンドとフロントエンドをローカル起動する方法を提供する。
  「フロントいじりたい」「モック起動して」「ローカルで確認したい」「UIを確認したい」「デザイン変更を見たい」といった状況で必ずこのスキルを使うこと。
  backend/data/ はgitignoreされているため、クローン直後は必ずモックデータを手動で作成する必要がある。
---

# モックでフロントエンドをローカル開発するスキル

## 重要な前提

- `backend/data/` と `.env` 系はすべて **gitignore 済み** → クローン後は必ず作成が必要
- `dotenv` が未インストールのため `npm start` では `.env` が読まれない
- `GITHUB_APP_ID` が空だとサーバーが即終了する（`backend/src/config.js` の必須チェック）

## セットアップ（初回 or データが消えたとき）

プロジェクトルートからスクリプトを実行する：

```bash
bash .claude/skills/mock-frontend-dev/scripts/setup_mock.sh
```

スクリプトが行うこと：
- `backend/data/pr-metadata/smoke-test__demo-repo/pr-999.json` を作成
- `backend/data/mode-results/smoke-test__demo-repo/pr-999.json` を作成
- `backend/.env`・`frontend/.env` が存在しない場合に作成（ダミー値入り）

モックデータのテンプレートは `assets/` に入っている。

## 起動手順

### バックエンド

```bash
cd backend
env $(cat .env | grep -v "^#" | xargs) node src/server.js &
```

起動確認：
```bash
curl http://localhost:3001/health
# → {"status":"ok"}
```

### フロントエンド

```bash
cd frontend
npm run dev
```

### アクセス

```
http://localhost:5174/prs/smoke-test/demo-repo/999
```

※ ポート 5173 が使用中なら Vite が自動で 5174 に切り替える。

## モックデータを編集してUIをテストする

`backend/data/` 以下の JSON を直接編集してバックエンドを再起動すれば反映される。フロントは HMR で自動更新。

よくある編集パターン：
- **リスクレベルを変える** → `mode-results` の `impactNodes[].riskLevel` を `"high"` / `"medium"` / `"low"` で変更
- **ファイル数を増やす** → `pr-metadata` の `files` 配列にエントリを追加
- **Mermaid 図を変える** → `mode-results` の `mermaid` フィールドを編集（`\n` で改行）
- **エラー状態を再現する** → `mode-results` のモードの `success` を `false` にする

バックエンド再起動：
```bash
pkill -f "node src/server.js"
cd backend && env $(cat .env | grep -v "^#" | xargs) node src/server.js &
```

## ファイル構成

| ファイル | 役割 |
|---|---|
| `scripts/setup_mock.sh` | モック環境を一括セットアップ |
| `assets/pr-metadata.json` | PR メタ情報のテンプレート |
| `assets/mode-results.json` | 可視化モードデータのテンプレート |
