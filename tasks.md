# PR構造可視化レビュー支援ツール タスク分解（PoC）

## 方針

- `requirements.md`のPoCスコープに限定して、実装順でタスク化する
- 各タスクは「目的」「成果物」「完了条件（DoD）」を持たせる
- 依存関係を明示し、並行可能なものを分ける

## マイルストーン

1. 基盤構築（PR連携と解析ジョブ起動）
1.5. CDパイプライン構築（Railway デプロイ + スモークテスト）
2. 解析基盤（差分取得・静的解析・グラフ化）
3. AI生成基盤（モード別構造化出力）
4. 可視化UI（3ペイン + モード切替 + 詳細表示）
5. 品質確認（性能・精度・UX・成功基準評価）

## タスク一覧

### 進捗チェック

- [x] 1. プロジェクト初期化
- [x] 2. GitHub App連携と起動トリガー実装
- [x] 3. PRメタ情報・差分取得
- [x] CD-1. Railway最小構成デプロイ（Backend + Frontend + Redis）
- [x] CD-2. CDパイプライン実装（mainブランチトリガー）
- [x] CD-3. デプロイ後スモークテスト実装（/health疎通確認）
- [x] 4. 静的解析パイプライン（PoC）
- [x] 5. 依存グラフ/呼び出しグラフ生成
- [x] 6. LLM入力整形レイヤ
- [x] 7. モード別生成ロジック（5モード）
- [x] 8. 可視化ページAPI
- [x] 9. 3ペインUI実装
- [x] 10. モード切替UX実装
- [ ] 11. ノード詳細連動（コード断片 + AI解説）
- [x] 12. PRコメント投稿
- [ ] 13. 性能計測と最適化（PoC範囲）
- [ ] 14. 精度検証（PoC許容70%）
- [ ] 15. 成功基準評価とデモ準備

### 1. プロジェクト初期化

- 目的: PoC実装の土台を作る
- 成果物:
  - Backend/Frontendのディレクトリ構成
  - 実行方法README（ローカル起動手順）
  - 共通設定（環境変数定義、ログ方針）
- DoD:
  - ローカルでBackend/Frontendが起動できる
  - 必須環境変数が未設定時に明示的なエラーを返す
- 依存: なし

### 2. GitHub App連携と起動トリガー実装

- 目的: PR作成/更新、Bot mentionで解析ジョブを起動する
- 成果物:
  - Webhook受信エンドポイント
  - PRイベント判定ロジック（open/synchronize + mention）
  - ジョブキュー投入（簡易キューで可）
- DoD:
  - 対象イベント受信でジョブが1回だけ起動する
  - 非対象イベントでは起動しない
- 依存: 1

### 3. PRメタ情報・差分取得

- 目的: 可視化に必要なPR入力データを収集する
- 成果物:
  - 変更ファイル一覧取得
  - 追加/削除行数取得
  - 変更関数候補一覧（差分起点）
  - PRタイトル/説明取得
- DoD:
  - 1つのPRに対してJSONで取得結果を保存できる
  - APIエラー時にリトライまたは失敗理由を記録する
- 依存: 2

### CD-1. Railway最小構成デプロイ（Backend + Frontend + Redis）

- 目的: 検証環境の土台を整備する
- 成果物:
  - RailwayプロジェクトにBackend/Frontend/Redisのサービス設定
  - 各サービスのデプロイ成功確認（`/health` レスポンス）
  - 必要な環境変数の設定（Railwayダッシュボード上）
- DoD:
  - `https://<railway-url>/health` へのリクエストが200を返す
  - Frontend URLがブラウザで開ける
  - RedisへのBackend接続をログで確認できる
- 依存: 1

### CD-2. CDパイプライン実装（mainブランチトリガー）

- 目的: mainブランチ更新で自動デプロイされる仕組みを作る
- 成果物:
  - GitHub Actionsワークフロー（mainブランチプッシュトリガー、デプロイステータス通知）
  - デプロイ完了をGitHub Checks で確認できる設定
- DoD:
  - mainブランチへのマージで自動デプロイが起動する
  - GitHub上でデプロイステータスを確認できる
- 依存: CD-1

### CD-3. デプロイ後スモークテスト実装（/health疎通確認）

- 目的: デプロイした検証環境が正常起動しているかを自動確認する
- 成果物:
  - スモークテストスクリプト（Backend/Frontend の `/health` 疎通確認）
  - GitHub Actionsへの組み込み（デプロイ後に自動実行）
  - テスト結果のPR可視化
- DoD:
  - デプロイ後にスモークテストが自動実行される
  - 成功/失敗がPR上に表示される
  - 失敗時に原因追跡できるログが残る
- 依存: CD-2

### 4. 静的解析パイプライン（PoC）

- 目的: PR差分からシンボルと依存関係を抽出する
- 実装アプローチ: Claude API（`@anthropic-ai/sdk`）に差分を渡し、`tool_use` で構造化JSON（Node/Edge）を生成
- 成果物:
  - `staticAnalyzer.js`（Claude API呼び出し・tool_use解析）
  - `staticAnalysisStore.js`（`data/static-analysis/<repo>/pr-N.json` に保存）
  - `ANTHROPIC_API_KEY` 未設定時のスキップ対応
  - 入力: PR差分（patch文字列）+ タイトル/説明
  - 出力: `Node[]` / `Edge[]`（最小データモデル）
- DoD:
  - `Node`/`Edge`最小データモデルで出力できる
  - 4言語（JS/TS/Ruby/C#）のサンプル差分でクラッシュしない
- 依存: 3

### 5. 依存グラフ/呼び出しグラフ生成

- 目的: モード表示の元となる構造データを構築する
- 成果物:
  - file/function/classノード生成
  - call/import/inheritエッジ生成
  - 変更起点サブグラフ抽出
- DoD:
  - 変更ノード起点で隣接ノードを辿れる
  - Workflow用3階層制限オプションが機能する
- 依存: 4

### 6. LLM入力整形レイヤ

- 目的: 5モード可視化向けに差分・グラフ・メタ情報をLLMへ渡す入力を構築する
  - ※タスク4の `staticAnalyzer.js` はグラフ抽出専用。本タスクは可視化モード生成向けの整形を担当する。
- 成果物:
  - モード別プロンプトビルダー（Node/Edgeグラフ + PRメタ情報を組み合わせる）
  - トークン超過時の要約/切り詰め戦略
  - モデル抽象化インターフェース（将来的なモデル差し替え対応）
- DoD:
  - 同一入力から再現性のある構造化リクエストを生成できる
  - モデル切替（Claude/GPT/Gemini想定）が設定で可能
- 依存: 3,5

### 7. モード別生成ロジック（5モード）

- 目的: 各視点のJSON/Mermaidを生成する
- 成果物:
  - Workflow Change生成器
  - Impact Map生成器
  - Data Lineage生成器
  - Architecture Compliance生成器
  - Intent/Context生成器
- DoD:
  - 各モードで最低1つの可視化データを返す
  - 不足データ時に「生成不可理由」を返却する
- 依存: 6

### 8. 可視化ページAPI

- 目的: Frontendが参照する統合データを提供する
- 成果物:
  - PR単位の可視化結果保存
  - モード別取得API
  - ノード詳細API（コード断片 + AI解説）
- DoD:
  - PR ID指定で5モード分データを取得できる
  - ノードクリック向け詳細レスポンスが返る
- 依存: 7

### 9. 3ペインUI実装

- 目的: 要件の基本画面構成を実現する
- 成果物:
  - 左: 変更ファイルツリー
  - 中央: 可視化キャンバス（ズーム/パン）
  - 右: 3行要約・レビュー観点・リスク注釈
- DoD:
  - 主要ブラウザで3ペインレイアウトが崩れない
  - 中央キャンバスが操作可能
- 依存: 8

### 10. モード切替UX実装

- 目的: 同一PRを別視点で即時比較できるようにする
- 成果物:
  - タブ切替UI
  - モード切替時の状態管理
  - 共通ハイライト仕様（追加/削除/修正）
- DoD:
  - タブ切替で1秒以内に表示更新（ローカル計測）
  - 5モードの切替が破綻なく動作する
- 依存: 9

### 11. ノード詳細連動（コード断片 + AI解説）

- 目的: 図からレビュー文脈へ即アクセスできるようにする
- 成果物:
  - ノードクリックイベント処理
  - 該当コード断片表示
  - AI解説表示（要点3行）
- DoD:
  - 任意ノードで詳細パネル更新が可能
  - 取得失敗時のフォールバック表示がある
- 依存: 8,10

### 12. PRコメント投稿

- 目的: 生成結果URLをPR上で共有する
- 成果物:
  - 可視化ページURL生成
  - PRコメント投稿処理
  - 再実行時の更新方針（新規/上書き）
- DoD:
  - 自動起動/mention起動の両方でURL投稿できる
  - 投稿失敗時にリトライまたはログ記録できる
- 依存: 2,8

### 13. 性能計測と最適化（PoC範囲）

- 目的: 非機能要件（10秒/30秒）を満たす
- 成果物:
  - 計測スクリプト（初期表示時間、主要可視化時間）
  - ボトルネック分析メモ
  - 最低限の改善（キャッシュ/並列化/不要処理削減）
- DoD:
  - ~500ファイルで初期表示10秒以内
  - 典型PRで主要可視化30秒以内
- 依存: 11,12

### 14. 精度検証（PoC許容70%）

- 目的: 静的解析出力の実用性を確認する
- 成果物:
  - 検証用PRセット
  - 正解比較シート（ノード/エッジ）
  - 誤検出・漏れの傾向分析
- DoD:
  - 実用精度70%目安の達成可否を判断できる
  - 未達時の改善候補が整理される
- 依存: 4,5

### 15. 成功基準評価とデモ準備

- 目的: PoC完了判断に必要な材料を揃える
- 成果物:
  - レビュワー向け評価シナリオ
  - 定性フィードバック収集テンプレート
  - 成功基準3点の判定レポート
- DoD:
  - 「見え方の違い」「8割把握」「有用性実感」を評価できる
  - 次フェーズへの課題（拡張候補）が整理される
- 依存: 13,14

## 並行実行の目安

- 並行可能:
  - CD-1〜CD-3 は開発タスク（4〜）と並行して進められる
  - 4（静的解析）と9（UI骨組みモック）
  - 13（性能計測）と14（精度検証）
- 同期が必要:
  - 7は6完了後
  - 10/11は8/9完了後
  - CD-2はCD-1完了後、CD-3はCD-2完了後

## 受け入れチェックリスト（最終）

- 5モードが同一PRで切替表示できる
- ノードクリックでコード断片とAI解説が見られる
- PRイベント/mentionでURLがPRへ返る
- 非機能目標（10秒/30秒）を計測で示せる
- 成功基準に対する評価結果が残っている
- mainブランチマージ時に自動デプロイが開始される
- デプロイ後にスモークテストが自動実行される
- 失敗時に原因追跡できるログ/ステータスが残る

## 進捗メモ

- 2026-03-02: タスク1「プロジェクト初期化」の成果物を追加（`backend/` と `frontend/` の起動土台、`.env.example`、`README.md`）
- 2026-03-02: タスク2「GitHub App連携と起動トリガー実装」のPoC実装を追加（`POST /webhooks/github`、イベント判定、簡易ジョブキュー、重複delivery抑止）
- 2026-03-03: 検証環境をRailwayに決定。`requirements.md` にCD要件（5.4節・非機能要件・技術スタック）を追加、`tasks.md` にCD-1〜CD-3タスクとマイルストーン1.5を追加、タスク2/8/9/10/11のDoDを更新
- 2026-03-03: CD-1〜CD-3のコード実装を完了。`PORT||BACKEND_PORT` フォールバック対応（config.js）、Redis TCP疎通確認ログ（server.js）、`backend/railway.toml`、`frontend/railway.toml`、`.github/workflows/cd.yml`（スモークテスト付きCDワークフロー）、`.gitignore` を整備。Railway ダッシュボード上の手動設定（サービス追加・環境変数設定・GitHub連携）は別途必要。
- 2026-03-03: タスク4「静的解析パイプライン」実装完了。Claude API（`@anthropic-ai/sdk`、`claude-haiku-4-5`）を使った差分解析でNode/Edgeグラフを生成する。`staticAnalyzer.js`（AI解析コア）、`staticAnalysisStore.js`（JSON保存）を新規作成。`jobProcessor.js`（静的解析ステップ追加）、`config.js`（`ANTHROPIC_API_KEY` オプション追加）、`.env.example` を更新。`ANTHROPIC_API_KEY` 未設定時はスキップして既存機能に影響なし。テスト19件全パス。
- 2026-03-04: タスク5「依存グラフ/呼び出しグラフ生成」実装完了。`graphBuilder.js`（BFSベースのトラバーサル）を新規作成。`buildGraph({ nodes, edges })` が `getChangedNodes` / `getNeighbors` / `extractSubgraph(startNodeId, maxDepth)` / `extractChangedSubgraph(maxDepth)` を持つグラフオブジェクトを返す。双方向トラバーサル対応、サイクル耐性あり、Workflow用maxDepth=3制限が機能する。`jobProcessor.js` に統合済み。テスト41件全パス。
- 2026-03-04: タスク6「LLM入力整形レイヤ」実装完了。`promptBuilder.js`（5モード別プロンプト生成純粋関数 + 文字数ベース切り詰めヘルパー）、`llmClient.js`（OpenAI実装済み・Claude未対応スタブ付きモデル抽象化インターフェース、temperature=0で再現性確保）を新規作成。`config.js`（`OPENAI_API_KEY`/`LLM_PROVIDER`/`LLM_MODEL`追加）、`.env.example`、`jobProcessor.js`（buildGraph戻り値保持）を更新。`openai`パッケージ追加。テスト76件全パス。
- 2026-03-04: タスク7「モード別生成ロジック（5モード）」実装完了。`modeGenerator.js`（5モード並列生成、`Promise.allSettled`で部分失敗吸収）、`modeResultStore.js`（`data/mode-results/<repo>/pr-N.json`に保存）を新規作成。`jobProcessor.js`（`buildGraph`→`generateAllModes`→`saveModeResults`の統合、プロバイダー対応のAPIキー選択）を更新。変更ノードが0件の場合は全モードで「生成不可理由」を返却。テスト83件全パス。
- 2026-03-04: タスク8「可視化ページAPI」実装完了。`server.js` に `/api/prs/:owner/:repo/:prNumber/visualization`（5モード統合データ）、`/status`（ジョブ進捗）、`/nodes`（ノード詳細・隣接ノード・リスク情報・ファイル内容）の3エンドポイントを実装。CORS対応済み。
- 2026-03-04: タスク9「3ペインUI実装」実装完了。Vite + React + react-router-dom + mermaid でフロントエンドを構築。`/prs/:owner/:repo/:prNumber` でPR可視化ページにアクセス。左ペイン（変更ファイルツリー）、中央ペイン（Mermaid図 + 5モードタブ + ズーム/パン）、右ペイン（3行要約・レビュー観点・リスク注釈）の3ペインレイアウトを実装。ポーリングによる処理待ち対応。`frontend/src/server.js` を静的ファイルサーバー（SPA fallback付き）に更新。`railway.toml` にビルドコマンドを追加。
- 2026-03-04: タスク10「モード切替UX実装」実装完了。`VisualizationPane.jsx` を修正。ZoomPanContainerをコントロールドコンポーネント化（transform/onTransformChangeをprops受け取り）、VisualizationPaneにモード別transforms状態を追加（タブ切替後もズーム位置が維持される）、impactMapToMermaidにclassDefによるchangeType色分け（added=緑/modified=橙/deleted=赤）を追加、モードタブにrole="tablist"/role="tab"とArrowLeft/ArrowRightキーボードナビゲーションを追加。onMouseDownをデルタベース方式に変更しドラッグ中の不要な関数再生成を解消。
- 2026-03-04: タスク12「PRコメント投稿」実装完了。`prCommentPoster.js`（可視化URLのPRコメント投稿、投稿失敗時はログ記録して継続）を新規作成。`githubClient.js`（`post()` メソッド追加、request()のbodyサポート追加、non-retryable GithubApiErrorの即座再throw修正）、`config.js`（`FRONTEND_URL` オプション追加）、`jobProcessor.js`（メタ情報収集完了後にコメント投稿、結果ログ記録）、`.env.example` を更新。`FRONTEND_URL` 未設定時はスキップ。自動起動/mention起動の両方で動作。テスト94件全パス。
