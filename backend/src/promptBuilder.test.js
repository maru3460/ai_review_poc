const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildWorkflowChangePrompt,
  buildImpactMapPrompt,
  buildDataLineagePrompt,
  buildArchitectureCompliancePrompt,
  buildIntentContextPrompt,
  truncateGraph,
  truncateText
} = require('./promptBuilder');

// テスト用サンプルデータ
const SAMPLE_METADATA = {
  repositoryFullName: 'org/repo',
  prNumber: 1,
  prTitle: 'Add payment processing',
  prDescription: 'Implements Stripe payment flow with webhook support',
  prUrl: 'https://github.com/org/repo/pull/1',
  lineStats: { additions: 120, deletions: 30 },
  files: [
    { filename: 'src/payment.js', status: 'added', additions: 80, deletions: 0, changes: 80 },
    { filename: 'src/webhook.js', status: 'modified', additions: 40, deletions: 30, changes: 70 }
  ],
  changedFunctionCandidates: [
    { filename: 'src/payment.js', functionName: 'processPayment' },
    { filename: 'src/webhook.js', functionName: 'handleWebhook' }
  ]
};

const SAMPLE_NODES = [
  { id: 'src/payment.js', type: 'file', module: 'src/payment.js', changeType: 'added' },
  { id: 'src/payment.js::processPayment', type: 'function', module: 'src/payment.js', changeType: 'added' },
  { id: 'src/webhook.js', type: 'file', module: 'src/webhook.js', changeType: 'modified' },
  { id: 'src/webhook.js::handleWebhook', type: 'function', module: 'src/webhook.js', changeType: 'modified' },
  { id: 'src/db.js', type: 'file', module: 'src/db.js', changeType: 'unchanged' }
];

const SAMPLE_EDGES = [
  { from: 'src/payment.js::processPayment', to: 'src/db.js', type: 'import' },
  { from: 'src/webhook.js::handleWebhook', to: 'src/payment.js::processPayment', type: 'call' }
];

const SAMPLE_SUBGRAPH = { nodes: SAMPLE_NODES, edges: SAMPLE_EDGES };

// ---------------------------------------------------------------------------
// truncateText
// ---------------------------------------------------------------------------
describe('truncateText', () => {
  it('maxChars 以下の文字列はそのまま返す', () => {
    assert.equal(truncateText('hello', 100), 'hello');
  });

  it('maxChars を超えた場合は切り詰めて省略メッセージを付ける', () => {
    const result = truncateText('abcdef', 3);
    assert.equal(result, 'abc...(3文字省略)');
  });

  it('null/undefined は空文字を返す', () => {
    assert.equal(truncateText(null, 100), '');
    assert.equal(truncateText(undefined, 100), '');
  });
});

// ---------------------------------------------------------------------------
// truncateGraph
// ---------------------------------------------------------------------------
describe('truncateGraph', () => {
  it('maxNodes 以下の場合はそのまま返す', () => {
    const { nodes, edges, truncated } = truncateGraph(SAMPLE_NODES, SAMPLE_EDGES);
    assert.equal(nodes.length, SAMPLE_NODES.length);
    assert.equal(edges.length, SAMPLE_EDGES.length);
    assert.equal(truncated, false);
  });

  it('maxNodes を超えた場合は変更ノードを優先して切り詰める', () => {
    const manyNodes = [
      ...SAMPLE_NODES,
      ...Array.from({ length: 60 }, (_, i) => ({
        id: `src/unchanged${i}.js`,
        type: 'file',
        module: `src/unchanged${i}.js`,
        changeType: 'unchanged'
      }))
    ];
    const { nodes, truncated } = truncateGraph(manyNodes, [], { maxNodes: 5 });

    assert.equal(nodes.length, 5);
    assert.equal(truncated, true);

    // 変更ノードが先頭に来ているか確認
    const changedNodes = nodes.filter((n) => n.changeType !== 'unchanged');
    assert.ok(changedNodes.length > 0);
  });

  it('ノード外のエッジは除外される', () => {
    const limitedNodes = SAMPLE_NODES.slice(0, 2); // src/payment.js と processPayment のみ
    const { edges } = truncateGraph(limitedNodes, SAMPLE_EDGES);

    // 両端のノードが含まれているエッジだけが残るはず
    for (const edge of edges) {
      const nodeIds = new Set(limitedNodes.map((n) => n.id));
      assert.ok(nodeIds.has(edge.from) && nodeIds.has(edge.to));
    }
  });

  it('空のノードとエッジでクラッシュしない', () => {
    const { nodes, edges, truncated } = truncateGraph([], []);
    assert.equal(nodes.length, 0);
    assert.equal(edges.length, 0);
    assert.equal(truncated, false);
  });
});

// ---------------------------------------------------------------------------
// buildWorkflowChangePrompt
// ---------------------------------------------------------------------------
describe('buildWorkflowChangePrompt', () => {
  it('system と user を返す', () => {
    const result = buildWorkflowChangePrompt({ subgraph: SAMPLE_SUBGRAPH, metadata: SAMPLE_METADATA });
    assert.ok(result.system);
    assert.ok(result.user);
    assert.equal(typeof result.system, 'string');
    assert.equal(typeof result.user, 'string');
  });

  it('PR タイトルが user プロンプトに含まれる', () => {
    const result = buildWorkflowChangePrompt({ subgraph: SAMPLE_SUBGRAPH, metadata: SAMPLE_METADATA });
    assert.ok(result.user.includes('Add payment processing'));
  });

  it('同一入力から同一出力を生成する（再現性）', () => {
    const r1 = buildWorkflowChangePrompt({ subgraph: SAMPLE_SUBGRAPH, metadata: SAMPLE_METADATA });
    const r2 = buildWorkflowChangePrompt({ subgraph: SAMPLE_SUBGRAPH, metadata: SAMPLE_METADATA });
    assert.equal(r1.system, r2.system);
    assert.equal(r1.user, r2.user);
  });

  it('空のサブグラフでクラッシュしない', () => {
    assert.doesNotThrow(() =>
      buildWorkflowChangePrompt({ subgraph: { nodes: [], edges: [] }, metadata: SAMPLE_METADATA })
    );
  });
});

// ---------------------------------------------------------------------------
// buildImpactMapPrompt
// ---------------------------------------------------------------------------
describe('buildImpactMapPrompt', () => {
  it('system と user を返す', () => {
    const result = buildImpactMapPrompt({ subgraph: SAMPLE_SUBGRAPH, metadata: SAMPLE_METADATA });
    assert.ok(result.system);
    assert.ok(result.user);
  });

  it('同一入力から同一出力を生成する（再現性）', () => {
    const r1 = buildImpactMapPrompt({ subgraph: SAMPLE_SUBGRAPH, metadata: SAMPLE_METADATA });
    const r2 = buildImpactMapPrompt({ subgraph: SAMPLE_SUBGRAPH, metadata: SAMPLE_METADATA });
    assert.equal(r1.user, r2.user);
  });

  it('空のサブグラフでクラッシュしない', () => {
    assert.doesNotThrow(() =>
      buildImpactMapPrompt({ subgraph: { nodes: [], edges: [] }, metadata: SAMPLE_METADATA })
    );
  });
});

// ---------------------------------------------------------------------------
// buildDataLineagePrompt
// ---------------------------------------------------------------------------
describe('buildDataLineagePrompt', () => {
  it('system と user を返す', () => {
    const result = buildDataLineagePrompt({ subgraph: SAMPLE_SUBGRAPH, metadata: SAMPLE_METADATA });
    assert.ok(result.system);
    assert.ok(result.user);
  });

  it('同一入力から同一出力を生成する（再現性）', () => {
    const r1 = buildDataLineagePrompt({ subgraph: SAMPLE_SUBGRAPH, metadata: SAMPLE_METADATA });
    const r2 = buildDataLineagePrompt({ subgraph: SAMPLE_SUBGRAPH, metadata: SAMPLE_METADATA });
    assert.equal(r1.user, r2.user);
  });
});

// ---------------------------------------------------------------------------
// buildArchitectureCompliancePrompt
// ---------------------------------------------------------------------------
describe('buildArchitectureCompliancePrompt', () => {
  it('system と user を返す', () => {
    const result = buildArchitectureCompliancePrompt({ subgraph: SAMPLE_SUBGRAPH, metadata: SAMPLE_METADATA });
    assert.ok(result.system);
    assert.ok(result.user);
  });

  it('リポジトリ名が user プロンプトに含まれる', () => {
    const result = buildArchitectureCompliancePrompt({ subgraph: SAMPLE_SUBGRAPH, metadata: SAMPLE_METADATA });
    assert.ok(result.user.includes('org/repo'));
  });

  it('同一入力から同一出力を生成する（再現性）', () => {
    const r1 = buildArchitectureCompliancePrompt({ subgraph: SAMPLE_SUBGRAPH, metadata: SAMPLE_METADATA });
    const r2 = buildArchitectureCompliancePrompt({ subgraph: SAMPLE_SUBGRAPH, metadata: SAMPLE_METADATA });
    assert.equal(r1.user, r2.user);
  });
});

// ---------------------------------------------------------------------------
// buildIntentContextPrompt
// ---------------------------------------------------------------------------
describe('buildIntentContextPrompt', () => {
  const changedNodes = SAMPLE_NODES.filter((n) => n.changeType !== 'unchanged');

  it('system と user を返す', () => {
    const result = buildIntentContextPrompt({ changedNodes, metadata: SAMPLE_METADATA });
    assert.ok(result.system);
    assert.ok(result.user);
  });

  it('PR タイトルと説明が含まれる', () => {
    const result = buildIntentContextPrompt({ changedNodes, metadata: SAMPLE_METADATA });
    assert.ok(result.user.includes('Add payment processing'));
    assert.ok(result.user.includes('Stripe'));
  });

  it('changedFunctionCandidates が含まれる', () => {
    const result = buildIntentContextPrompt({ changedNodes, metadata: SAMPLE_METADATA });
    assert.ok(result.user.includes('processPayment'));
  });

  it('同一入力から同一出力を生成する（再現性）', () => {
    const r1 = buildIntentContextPrompt({ changedNodes, metadata: SAMPLE_METADATA });
    const r2 = buildIntentContextPrompt({ changedNodes, metadata: SAMPLE_METADATA });
    assert.equal(r1.user, r2.user);
  });

  it('空の changedNodes でクラッシュしない', () => {
    assert.doesNotThrow(() =>
      buildIntentContextPrompt({ changedNodes: [], metadata: SAMPLE_METADATA })
    );
  });

  it('changedFunctionCandidates が undefined でもクラッシュしない', () => {
    const metaWithoutCandidates = { ...SAMPLE_METADATA, changedFunctionCandidates: undefined };
    assert.doesNotThrow(() =>
      buildIntentContextPrompt({ changedNodes, metadata: metaWithoutCandidates })
    );
  });
});
