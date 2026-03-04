'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { generateAllModes } = require('./modeGenerator');

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

function makeNode(id, changeType = 'modified') {
  return { id, type: 'function', module: `src/${id}.js`, changeType };
}

function makeGraph({ changedNodes = [], allNodes = null, subgraph = null } = {}) {
  const nodes = allNodes ?? changedNodes;
  const defaultSubgraph = subgraph ?? { nodes, edges: [] };
  return {
    getChangedNodes: () => changedNodes,
    extractChangedSubgraph: (_maxDepth) => defaultSubgraph
  };
}

function makeLlmClient(responsesByCall) {
  let callCount = 0;
  return {
    complete: async ({ system, user, jsonMode }) => {
      const response = responsesByCall[callCount] ?? responsesByCall[responsesByCall.length - 1];
      callCount++;
      if (response instanceof Error) throw response;
      return response;
    }
  };
}

const SAMPLE_METADATA = {
  prTitle: 'Test PR',
  prDescription: 'A test pull request',
  repositoryFullName: 'org/repo',
  files: [{ filename: 'src/foo.js', status: 'modified' }],
  lineStats: { additions: 10, deletions: 5 },
  changedFunctionCandidates: []
};

// ---------------------------------------------------------------------------
// 変更ノードなしのケース
// ---------------------------------------------------------------------------

describe('generateAllModes - 変更ノードなし', () => {
  it('changedNodes が空の場合、全モードが success: false を返す', async () => {
    const graph = makeGraph({ changedNodes: [] });
    const llmClient = makeLlmClient([]);

    const result = await generateAllModes({ graph, metadata: SAMPLE_METADATA, llmClient });

    assert.equal(result.workflowChange.success, false);
    assert.equal(result.impactMap.success, false);
    assert.equal(result.dataLineage.success, false);
    assert.equal(result.architectureCompliance.success, false);
    assert.equal(result.intentContext.success, false);

    // 全モードが同じ理由を返す
    assert.match(result.workflowChange.error, /変更ノードが存在しない/);
  });
});

// ---------------------------------------------------------------------------
// 正常系: 5モード全て成功
// ---------------------------------------------------------------------------

describe('generateAllModes - 正常系', () => {
  it('5モード全て success: true を返す', async () => {
    const changedNodes = [makeNode('foo'), makeNode('bar')];
    const graph = makeGraph({ changedNodes });

    const validResponses = [
      JSON.stringify({ mermaid: 'graph LR; A-->B', summary: 'flow', highlights: [] }),
      JSON.stringify({ impactNodes: [], edges: [], summary: 'impact', highRiskAreas: [] }),
      JSON.stringify({ lineage: [], sideEffects: [], summary: 'lineage', mermaid: '' }),
      JSON.stringify({ layers: [], violations: [], summary: 'arch', overallCompliance: 'compliant' }),
      JSON.stringify({ intentCategory: 'feature', mainPurpose: 'test', implementationSummary: 'impl', alignmentScore: 90, unrelatedChanges: [], concerns: [], reviewFocus: [] })
    ];

    const llmClient = makeLlmClient(validResponses);
    const result = await generateAllModes({ graph, metadata: SAMPLE_METADATA, llmClient });

    assert.equal(result.workflowChange.success, true);
    assert.equal(result.impactMap.success, true);
    assert.equal(result.dataLineage.success, true);
    assert.equal(result.architectureCompliance.success, true);
    assert.equal(result.intentContext.success, true);
  });

  it('workflowChange の data に mermaid が含まれる', async () => {
    const changedNodes = [makeNode('foo')];
    const graph = makeGraph({ changedNodes });

    const responses = [
      JSON.stringify({ mermaid: 'graph LR; A-->B', summary: 'flow', highlights: ['changed A'] }),
      JSON.stringify({ impactNodes: [], edges: [], summary: '', highRiskAreas: [] }),
      JSON.stringify({ lineage: [], sideEffects: [], summary: '', mermaid: '' }),
      JSON.stringify({ layers: [], violations: [], summary: '', overallCompliance: 'compliant' }),
      JSON.stringify({ intentCategory: 'unknown', mainPurpose: '', implementationSummary: '', alignmentScore: 50, unrelatedChanges: [], concerns: [], reviewFocus: [] })
    ];

    const llmClient = makeLlmClient(responses);
    const result = await generateAllModes({ graph, metadata: SAMPLE_METADATA, llmClient });

    assert.equal(result.workflowChange.data.mermaid, 'graph LR; A-->B');
    assert.deepEqual(result.workflowChange.data.highlights, ['changed A']);
  });
});

// ---------------------------------------------------------------------------
// 部分失敗: 一部のモードが失敗しても他は続行する
// ---------------------------------------------------------------------------

describe('generateAllModes - 部分失敗', () => {
  it('LLM エラーが1つあっても他の4モードは成功する', async () => {
    const changedNodes = [makeNode('foo')];
    const graph = makeGraph({ changedNodes });

    // workflowChange だけエラーにする（1番目の呼び出し）
    const responses = [
      new Error('LLM API failed'),
      JSON.stringify({ impactNodes: [], edges: [], summary: 'ok', highRiskAreas: [] }),
      JSON.stringify({ lineage: [], sideEffects: [], summary: 'ok', mermaid: '' }),
      JSON.stringify({ layers: [], violations: [], summary: 'ok', overallCompliance: 'compliant' }),
      JSON.stringify({ intentCategory: 'feature', mainPurpose: 'ok', implementationSummary: 'ok', alignmentScore: 80, unrelatedChanges: [], concerns: [], reviewFocus: [] })
    ];

    const llmClient = makeLlmClient(responses);
    const result = await generateAllModes({ graph, metadata: SAMPLE_METADATA, llmClient });

    assert.equal(result.workflowChange.success, false);
    assert.match(result.workflowChange.error, /LLM API failed/);
    assert.equal(result.impactMap.success, true);
    assert.equal(result.dataLineage.success, true);
    assert.equal(result.architectureCompliance.success, true);
    assert.equal(result.intentContext.success, true);
  });

  it('JSON 解析失敗は success: false + error を返す', async () => {
    const changedNodes = [makeNode('foo')];
    const graph = makeGraph({ changedNodes });

    // 不正な JSON を返す
    const responses = [
      'this is not json',
      JSON.stringify({ impactNodes: [], edges: [], summary: 'ok', highRiskAreas: [] }),
      JSON.stringify({ lineage: [], sideEffects: [], summary: 'ok', mermaid: '' }),
      JSON.stringify({ layers: [], violations: [], summary: 'ok', overallCompliance: 'compliant' }),
      JSON.stringify({ intentCategory: 'feature', mainPurpose: 'ok', implementationSummary: 'ok', alignmentScore: 80, unrelatedChanges: [], concerns: [], reviewFocus: [] })
    ];

    const llmClient = makeLlmClient(responses);
    const result = await generateAllModes({ graph, metadata: SAMPLE_METADATA, llmClient });

    assert.equal(result.workflowChange.success, false);
    assert.ok(result.workflowChange.error);
    assert.equal(result.impactMap.success, true);
  });

  it('全モードが失敗した場合、全て success: false を返す', async () => {
    const changedNodes = [makeNode('foo')];
    const graph = makeGraph({ changedNodes });

    const llmClient = makeLlmClient([new Error('network error')]);
    const result = await generateAllModes({ graph, metadata: SAMPLE_METADATA, llmClient });

    assert.equal(result.workflowChange.success, false);
    assert.equal(result.impactMap.success, false);
    assert.equal(result.dataLineage.success, false);
    assert.equal(result.architectureCompliance.success, false);
    assert.equal(result.intentContext.success, false);
  });
});

// ---------------------------------------------------------------------------
// Workflow Change のサブグラフは maxDepth=3 で取得される
// ---------------------------------------------------------------------------

describe('generateAllModes - サブグラフ取得', () => {
  it('workflowChange には maxDepth=3 のサブグラフが渡される', async () => {
    const changedNodes = [makeNode('foo')];
    const depthLog = [];

    const graph = {
      getChangedNodes: () => changedNodes,
      extractChangedSubgraph: (maxDepth) => {
        depthLog.push(maxDepth);
        return { nodes: changedNodes, edges: [] };
      }
    };

    const responses = Array(5).fill(
      JSON.stringify({ mermaid: '', summary: '', highlights: [] })
    );
    const llmClient = makeLlmClient(responses);

    await generateAllModes({ graph, metadata: SAMPLE_METADATA, llmClient });

    // 最初の呼び出しが maxDepth=3（workflowChange 用）
    assert.equal(depthLog[0], 3);
    // 2番目以降は depth 指定なし（undefined）
    assert.equal(depthLog[1], undefined);
  });
});
