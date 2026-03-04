'use strict';

// 各モードのプロンプトに含める最大文字数・件数の定数
const MAX_NODES = 50;
const MAX_EDGES = 100;
const MAX_DESCRIPTION_CHARS = 500;
const MAX_FUNCTION_CANDIDATES = 20;

/**
 * ノード・エッジ配列を文字数上限に収まるよう切り詰める。
 * 変更ノード（changeType !== 'unchanged'）を優先して残す。
 *
 * @param {Array} nodes
 * @param {Array} edges
 * @param {{ maxNodes?: number, maxEdges?: number }} [opts]
 * @returns {{ nodes: Array, edges: Array, truncated: boolean }}
 */
function truncateGraph(nodes, edges, { maxNodes = MAX_NODES, maxEdges = MAX_EDGES } = {}) {
  let truncated = false;

  let selectedNodes = nodes;
  if (nodes.length > maxNodes) {
    // 変更ノードを優先して先頭に並べる
    const changed = nodes.filter((n) => n.changeType !== 'unchanged');
    const unchanged = nodes.filter((n) => n.changeType === 'unchanged');
    selectedNodes = [...changed, ...unchanged].slice(0, maxNodes);
    truncated = true;
  }

  const nodeIds = new Set(selectedNodes.map((n) => n.id));

  let selectedEdges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
  // ノード truncation でエッジが減った場合もフラグを立てる
  if (selectedEdges.length < edges.length) {
    truncated = true;
  }
  if (selectedEdges.length > maxEdges) {
    selectedEdges = selectedEdges.slice(0, maxEdges);
    truncated = true;
  }

  return { nodes: selectedNodes, edges: selectedEdges, truncated };
}

/**
 * 文字列を maxChars 文字に切り詰める。
 *
 * @param {string} text
 * @param {number} maxChars
 * @returns {string}
 */
function truncateText(text, maxChars) {
  if (!text || text.length <= maxChars) return text || '';
  return text.slice(0, maxChars) + `...(${text.length - maxChars}文字省略)`;
}

/**
 * グラフをプロンプト向けのコンパクトな JSON 文字列に変換する。
 *
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {string}
 */
function serializeGraph(nodes, edges) {
  return JSON.stringify({ nodes, edges }, null, 2);
}

// ---------------------------------------------------------------------------
// 5モード別プロンプトビルダー
// ---------------------------------------------------------------------------

/**
 * Workflow Change モード
 * - 呼び出しツリーを最大3階層で表示するフローチャート/シーケンス図を生成するためのプロンプト
 *
 * @param {{ subgraph: { nodes: Array, edges: Array }, metadata: object }} params
 * @returns {{ system: string, user: string }}
 */
function buildWorkflowChangePrompt({ subgraph, metadata }) {
  const { nodes, edges, truncated } = truncateGraph(subgraph.nodes, subgraph.edges);
  const description = truncateText(metadata.prDescription, MAX_DESCRIPTION_CHARS);
  const truncatedNote = truncated ? '\n(Note: graph was truncated to fit context limits)' : '';

  const system = `You are a code review assistant specialized in visualizing workflow changes in pull requests.
Analyze the provided code structure graph and generate a Mermaid flowchart that shows the workflow before and after the changes.
Highlight added/removed/modified steps and branching changes.
Return a JSON object with this structure:
{
  "mermaid": "<mermaid flowchart or sequence diagram as a string>",
  "summary": "<1-2 sentence summary of workflow changes>",
  "highlights": ["<key change 1>", "<key change 2>", ...]
}`;

  const user = `PR Title: ${metadata.prTitle}
PR Description: ${description || '(none)'}
Files changed: ${metadata.files.length} (additions: ${metadata.lineStats.additions}, deletions: ${metadata.lineStats.deletions})

Code Structure Graph (max 3 hops from changed nodes):${truncatedNote}
${serializeGraph(nodes, edges)}

Generate a Mermaid flowchart or sequence diagram showing the workflow changes.`;

  return { system, user };
}

/**
 * Impact Map モード
 * - 変更ノード起点の依存ネットワークと影響範囲を生成するためのプロンプト
 *
 * @param {{ subgraph: { nodes: Array, edges: Array }, metadata: object }} params
 * @returns {{ system: string, user: string }}
 */
function buildImpactMapPrompt({ subgraph, metadata }) {
  const { nodes, edges, truncated } = truncateGraph(subgraph.nodes, subgraph.edges);
  const truncatedNote = truncated ? '\n(Note: graph was truncated to fit context limits)' : '';

  const system = `You are a code review assistant specialized in impact analysis.
Analyze the provided code structure graph and identify the impact of the changes.
For each changed node, assess the blast radius and risk level.
Return a JSON object with this structure:
{
  "impactNodes": [
    {
      "id": "<node id>",
      "label": "<display name>",
      "changeType": "<added|removed|modified|unchanged>",
      "riskLevel": "<high|medium|low>",
      "riskReason": "<brief reason>",
      "distance": <hops from nearest changed node>
    }
  ],
  "edges": [{ "from": "<id>", "to": "<id>", "type": "<call|import|inherit>" }],
  "summary": "<overall impact summary>",
  "highRiskAreas": ["<area 1>", ...]
}`;

  const user = `PR Title: ${metadata.prTitle}
Files changed: ${metadata.files.length} (additions: ${metadata.lineStats.additions}, deletions: ${metadata.lineStats.deletions})

Code Structure Graph (full changed subgraph):${truncatedNote}
${serializeGraph(nodes, edges)}

Analyze the impact and risk of these changes.`;

  return { system, user };
}

/**
 * Data Lineage モード
 * - データの流れと副作用を可視化するためのプロンプト
 *
 * @param {{ subgraph: { nodes: Array, edges: Array }, metadata: object }} params
 * @returns {{ system: string, user: string }}
 */
function buildDataLineagePrompt({ subgraph, metadata }) {
  const { nodes, edges, truncated } = truncateGraph(subgraph.nodes, subgraph.edges);
  const description = truncateText(metadata.prDescription, MAX_DESCRIPTION_CHARS);
  const truncatedNote = truncated ? '\n(Note: graph was truncated to fit context limits)' : '';

  const system = `You are a code review assistant specialized in data flow analysis.
Analyze the provided code structure graph and trace how data flows from inputs (API calls, requests) to outputs (database, UI).
Identify side effects and data transformations in the changed code.
Return a JSON object with this structure:
{
  "lineage": [
    {
      "from": "<source node id>",
      "to": "<destination node id>",
      "dataDescription": "<what data flows here>",
      "hasSideEffect": <true|false>
    }
  ],
  "sideEffects": ["<side effect description>", ...],
  "summary": "<data flow summary>",
  "mermaid": "<optional Mermaid flowchart of data flow>"
}`;

  const user = `PR Title: ${metadata.prTitle}
PR Description: ${description || '(none)'}

Code Structure Graph:${truncatedNote}
${serializeGraph(nodes, edges)}

Trace the data flow and identify side effects in these changes.`;

  return { system, user };
}

/**
 * Architecture Compliance モード
 * - レイヤ構造の整合性チェックをするためのプロンプト
 *
 * @param {{ subgraph: { nodes: Array, edges: Array }, metadata: object }} params
 * @returns {{ system: string, user: string }}
 */
function buildArchitectureCompliancePrompt({ subgraph, metadata }) {
  const { nodes, edges, truncated } = truncateGraph(subgraph.nodes, subgraph.edges);
  const truncatedNote = truncated ? '\n(Note: graph was truncated to fit context limits)' : '';

  const system = `You are a code review assistant specialized in architecture compliance checking.
Analyze the provided code structure graph and check if the changes respect architectural layer boundaries.
Identify cross-layer dependencies, reverse dependencies, and new dependencies introduced by the changes.
Return a JSON object with this structure:
{
  "layers": [
    {
      "name": "<layer name (e.g. presentation, business, data)>",
      "nodes": ["<node id>", ...]
    }
  ],
  "violations": [
    {
      "from": "<node id>",
      "to": "<node id>",
      "violationType": "<cross-layer|reverse-dependency|new-dependency>",
      "description": "<why this is a violation>"
    }
  ],
  "summary": "<architecture compliance summary>",
  "overallCompliance": "<compliant|warning|violation>"
}`;

  const user = `PR Title: ${metadata.prTitle}
Repository: ${metadata.repositoryFullName}
Files changed: ${metadata.files.length}
Changed files: ${metadata.files.slice(0, 20).map((f) => f.filename).join(', ')}

Code Structure Graph:${truncatedNote}
${serializeGraph(nodes, edges)}

Check the architectural compliance of these changes.`;

  return { system, user };
}

/**
 * Intent/Context モード
 * - PR の意図と実装の整合性を確認するためのプロンプト
 *
 * @param {{ changedNodes: Array, metadata: object }} params
 * @returns {{ system: string, user: string }}
 */
function buildIntentContextPrompt({ changedNodes, metadata }) {
  const selectedNodes = changedNodes.slice(0, MAX_NODES);
  const description = truncateText(metadata.prDescription, MAX_DESCRIPTION_CHARS);
  const candidates = (metadata.changedFunctionCandidates || []).slice(0, MAX_FUNCTION_CANDIDATES);

  const system = `You are a code review assistant specialized in understanding PR intent and context.
Analyze the PR description and the changed code symbols to verify alignment between intent and implementation.
Return a JSON object with this structure:
{
  "intentCategory": "<feature|bugfix|refactoring|performance|docs|test|chore|unknown>",
  "mainPurpose": "<1 sentence describing the primary goal>",
  "implementationSummary": "<what the code actually does>",
  "alignmentScore": <0-100>,
  "unrelatedChanges": ["<change that seems unrelated to stated intent>", ...],
  "concerns": ["<concern about intent vs implementation>", ...],
  "reviewFocus": ["<what reviewers should focus on>", ...]
}`;

  const user = `PR Title: ${metadata.prTitle}
PR Description: ${description || '(none)'}
Lines: +${metadata.lineStats.additions} -${metadata.lineStats.deletions}
Files changed: ${metadata.files.length}

Changed symbols:
${JSON.stringify(selectedNodes.map((n) => ({ id: n.id, type: n.type, changeType: n.changeType })), null, 2)}

Changed function candidates:
${JSON.stringify(candidates, null, 2)}

Analyze the intent and context of this PR.`;

  return { system, user };
}

module.exports = {
  buildWorkflowChangePrompt,
  buildImpactMapPrompt,
  buildDataLineagePrompt,
  buildArchitectureCompliancePrompt,
  buildIntentContextPrompt,
  truncateGraph,
  truncateText
};
