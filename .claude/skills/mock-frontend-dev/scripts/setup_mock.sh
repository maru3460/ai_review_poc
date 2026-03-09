#!/bin/bash
# モック環境のセットアップスクリプト
# プロジェクトルートから実行すること: bash .claude/skills/mock-frontend-dev/scripts/setup_mock.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ASSETS_DIR="$SCRIPT_DIR/../assets"
DATA_DIR="backend/data"
MOCK_REPO="smoke-test__demo-repo"
PR_NUM="999"

echo "=== モックデータをセットアップするのだ ==="

# モックデータディレクトリを作成
mkdir -p "$DATA_DIR/mode-results/$MOCK_REPO"
mkdir -p "$DATA_DIR/pr-metadata/$MOCK_REPO"

# テンプレートをコピー
cp "$ASSETS_DIR/pr-metadata.json" "$DATA_DIR/pr-metadata/$MOCK_REPO/pr-$PR_NUM.json"
cp "$ASSETS_DIR/mode-results.json" "$DATA_DIR/mode-results/$MOCK_REPO/pr-$PR_NUM.json"

echo "✓ モックデータを作成したのだ"
echo "  - $DATA_DIR/pr-metadata/$MOCK_REPO/pr-$PR_NUM.json"
echo "  - $DATA_DIR/mode-results/$MOCK_REPO/pr-$PR_NUM.json"

# backend/.env がなければ作成
if [ ! -f backend/.env ]; then
  cat > backend/.env << 'EOF'
GITHUB_APP_ID=12345
GITHUB_TOKEN=dummy_token
GITHUB_WEBHOOK_SECRET=dummy_secret
GITHUB_BOT_LOGIN=dummy-bot
BACKEND_PORT=3001
EOF
  echo "✓ backend/.env を作成したのだ（ダミー値）"
else
  echo "✓ backend/.env は既に存在するのだ"
fi

# GITHUB_APP_ID が空でないか確認
APP_ID=$(grep "GITHUB_APP_ID" backend/.env | cut -d'=' -f2 | tr -d ' ')
if [ -z "$APP_ID" ]; then
  echo "⚠ GITHUB_APP_ID が空なのだ。backend/.env に GITHUB_APP_ID=12345 を設定してほしいのだ"
fi

# frontend/.env がなければ作成
if [ ! -f frontend/.env ]; then
  echo "VITE_BACKEND_BASE_URL=http://localhost:3001" > frontend/.env
  echo "✓ frontend/.env を作成したのだ"
else
  echo "✓ frontend/.env は既に存在するのだ"
fi

echo ""
echo "=== セットアップ完了なのだ ==="
echo ""
echo "次のステップ:"
echo "  1. バックエンド起動: cd backend && env \$(cat .env | grep -v '^#' | xargs) node src/server.js &"
echo "  2. 起動確認:         curl http://localhost:3001/health"
echo "  3. フロントエンド:   cd frontend && npm run dev"
echo "  4. アクセス:         http://localhost:5174/prs/smoke-test/demo-repo/999"
