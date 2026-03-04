'use strict';

/**
 * Task 7 スモークテスト
 * サンプルの Node/Edge データを使って generateAllModes を実際の OpenAI API で動作確認する。
 */

// .env ファイルを手動で読み込む（dotenv 非依存）
const fs = require('node:fs');
const envPath = `${__dirname}/.env`;
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  });
}

const { buildGraph } = require('./src/graphBuilder');
const { generateAllModes } = require('./src/modeGenerator');
const { saveModeResults } = require('./src/modeResultStore');
const { createLlmClient } = require('./src/llmClient');

// サンプルの静的解析結果（analyzeStaticGraph の出力を模倣）
const SAMPLE_NODES = [
  { id: 'src/auth/login.js', type: 'file', module: 'src/auth/login.js', changeType: 'modified' },
  { id: 'src/auth/login.js::authenticate', type: 'function', module: 'src/auth/login.js', changeType: 'modified' },
  { id: 'src/auth/login.js::validateToken', type: 'function', module: 'src/auth/login.js', changeType: 'added' },
  { id: 'src/db/userRepository.js', type: 'file', module: 'src/db/userRepository.js', changeType: 'unchanged' },
  { id: 'src/db/userRepository.js::findUser', type: 'function', module: 'src/db/userRepository.js', changeType: 'unchanged' },
  { id: 'src/middleware/authMiddleware.js', type: 'file', module: 'src/middleware/authMiddleware.js', changeType: 'unchanged' }
];

const SAMPLE_EDGES = [
  { from: 'src/auth/login.js::authenticate', to: 'src/db/userRepository.js::findUser', type: 'call' },
  { from: 'src/auth/login.js::authenticate', to: 'src/auth/login.js::validateToken', type: 'call' },
  { from: 'src/auth/login.js', to: 'src/db/userRepository.js', type: 'import' },
  { from: 'src/middleware/authMiddleware.js', to: 'src/auth/login.js::authenticate', type: 'call' }
];

const SAMPLE_METADATA = {
  prTitle: 'feat: JWT トークン検証を authenticate に追加',
  prDescription: 'ログイン時に JWT トークンの有効期限と署名を検証する処理を追加した。既存の DB ルックアップは維持しつつ、validateToken 関数を新規追加している。',
  repositoryFullName: 'smoke-test/demo-repo',
  files: [
    { filename: 'src/auth/login.js', status: 'modified' },
    { filename: 'src/auth/login.js', status: 'added' }
  ],
  lineStats: { additions: 42, deletions: 8 },
  changedFunctionCandidates: [
    { name: 'authenticate', file: 'src/auth/login.js', line: 12 },
    { name: 'validateToken', file: 'src/auth/login.js', line: 35 }
  ]
};

async function main() {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    console.error('OPENAI_API_KEY が未設定なのだ。backend/.env に設定してほしいのだ。');
    process.exit(1);
  }

  console.log('=== Task 7 スモークテスト開始 ===\n');

  // Step 1: グラフ構築
  console.log('[1/3] グラフを構築中...');
  const graph = buildGraph({ nodes: SAMPLE_NODES, edges: SAMPLE_EDGES });
  const changedNodes = graph.getChangedNodes();
  console.log(`      変更ノード数: ${changedNodes.length}`);
  console.log(`      全ノード数: ${graph.nodes.size}`);
  console.log(`      全エッジ数: ${graph.edges.length}\n`);

  // Step 2: 5モード生成（OpenAI 実呼び出し）
  console.log('[2/3] 5モードを並列生成中（OpenAI API 呼び出し）...');
  const llmClient = createLlmClient({
    provider: 'openai',
    apiKey: openaiApiKey,
    model: process.env.LLM_MODEL || 'gpt-4o-mini'
  });

  const startMs = Date.now();
  const modes = await generateAllModes({ graph, metadata: SAMPLE_METADATA, llmClient });
  const elapsedMs = Date.now() - startMs;
  console.log(`      完了（${elapsedMs}ms）\n`);

  // 結果サマリー表示
  const modeNames = ['workflowChange', 'impactMap', 'dataLineage', 'architectureCompliance', 'intentContext'];
  for (const name of modeNames) {
    const mode = modes[name];
    if (mode.success) {
      const keys = Object.keys(mode.data).join(', ');
      console.log(`  ✓ ${name}: success  [keys: ${keys}]`);
    } else {
      console.log(`  ✗ ${name}: FAILED  [${mode.error}]`);
    }
  }
  console.log();

  // Step 3: ファイル保存
  console.log('[3/3] 結果をファイルに保存中...');
  const outputPath = await saveModeResults({
    repositoryFullName: SAMPLE_METADATA.repositoryFullName,
    prNumber: 999,
    modes
  });
  console.log(`      保存先: ${outputPath}\n`);

  // 各モードの主要フィールドをプレビュー
  console.log('=== 生成結果プレビュー ===\n');

  if (modes.workflowChange.success) {
    const d = modes.workflowChange.data;
    console.log('--- Workflow Change ---');
    console.log('summary:', d.summary);
    console.log('highlights:', d.highlights);
    console.log();
  }

  if (modes.impactMap.success) {
    const d = modes.impactMap.data;
    console.log('--- Impact Map ---');
    console.log('summary:', d.summary);
    console.log('highRiskAreas:', d.highRiskAreas);
    console.log('impactNodes count:', d.impactNodes?.length);
    console.log();
  }

  if (modes.dataLineage.success) {
    const d = modes.dataLineage.data;
    console.log('--- Data Lineage ---');
    console.log('summary:', d.summary);
    console.log('sideEffects:', d.sideEffects);
    console.log();
  }

  if (modes.architectureCompliance.success) {
    const d = modes.architectureCompliance.data;
    console.log('--- Architecture Compliance ---');
    console.log('summary:', d.summary);
    console.log('overallCompliance:', d.overallCompliance);
    console.log('violations count:', d.violations?.length);
    console.log();
  }

  if (modes.intentContext.success) {
    const d = modes.intentContext.data;
    console.log('--- Intent/Context ---');
    console.log('intentCategory:', d.intentCategory);
    console.log('mainPurpose:', d.mainPurpose);
    console.log('alignmentScore:', d.alignmentScore);
    console.log('reviewFocus:', d.reviewFocus);
    console.log();
  }

  console.log('=== スモークテスト完了 ===');
}

main().catch((err) => {
  console.error('スモークテスト失敗:', err);
  process.exit(1);
});
