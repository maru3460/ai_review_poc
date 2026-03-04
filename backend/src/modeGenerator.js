'use strict';

const {
  buildWorkflowChangePrompt,
  buildImpactMapPrompt,
  buildDataLineagePrompt,
  buildArchitectureCompliancePrompt,
  buildIntentContextPrompt
} = require('./promptBuilder');

/**
 * 1モードの生成を試みる。
 * JSON解析に失敗した場合や LLM エラーの場合は { success: false, error } を返す。
 *
 * @param {Function} buildPromptFn
 * @param {object} promptArgs
 * @param {{ complete: Function }} llmClient
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
async function generateMode(buildPromptFn, promptArgs, llmClient) {
  const { system, user } = buildPromptFn(promptArgs);
  const rawText = await llmClient.complete({ system, user, jsonMode: true });
  try {
    const data = JSON.parse(rawText);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 5モード全ての可視化データを並列生成する。
 * 各モードが失敗しても他のモードは続行し、失敗理由を記録する。
 *
 * @param {{ graph: object, metadata: object, llmClient: object }} params
 * @returns {Promise<object>} 5モード分の生成結果
 */
async function generateAllModes({ graph, metadata, llmClient }) {
  const changedNodes = graph.getChangedNodes();

  if (changedNodes.length === 0) {
    const error = '変更ノードが存在しないため、モード生成をスキップした';
    return {
      workflowChange: { success: false, error },
      impactMap: { success: false, error },
      dataLineage: { success: false, error },
      architectureCompliance: { success: false, error },
      intentContext: { success: false, error }
    };
  }

  const workflowSubgraph = graph.extractChangedSubgraph(3);
  const fullSubgraph = graph.extractChangedSubgraph();

  const results = await Promise.allSettled([
    generateMode(buildWorkflowChangePrompt, { subgraph: workflowSubgraph, metadata }, llmClient),
    generateMode(buildImpactMapPrompt, { subgraph: fullSubgraph, metadata }, llmClient),
    generateMode(buildDataLineagePrompt, { subgraph: fullSubgraph, metadata }, llmClient),
    generateMode(buildArchitectureCompliancePrompt, { subgraph: fullSubgraph, metadata }, llmClient),
    generateMode(buildIntentContextPrompt, { changedNodes, metadata }, llmClient)
  ]);

  function unwrap(result) {
    if (result.status === 'fulfilled') return result.value;
    return { success: false, error: result.reason?.message ?? String(result.reason) };
  }

  const [workflowChange, impactMap, dataLineage, architectureCompliance, intentContext] = results;

  return {
    workflowChange: unwrap(workflowChange),
    impactMap: unwrap(impactMap),
    dataLineage: unwrap(dataLineage),
    architectureCompliance: unwrap(architectureCompliance),
    intentContext: unwrap(intentContext)
  };
}

module.exports = { generateAllModes };
