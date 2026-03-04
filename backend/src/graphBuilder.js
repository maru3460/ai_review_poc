'use strict';

/**
 * staticAnalyzer が生成した Node[] + Edge[] からトラバーサル可能なグラフを構築する。
 *
 * @param {{ nodes: Array, edges: Array }} analysis - staticAnalyzer の出力（または同形式のオブジェクト）
 * @returns {Graph}
 */
function buildGraph({ nodes = [], edges = [] }) {
  // ノードを id でインデックス化
  const nodeMap = new Map();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // エッジを from/to でインデックス化
  const outEdges = new Map(); // nodeId → Edge[]
  const inEdges = new Map();  // nodeId → Edge[]

  for (const edge of edges) {
    if (!outEdges.has(edge.from)) outEdges.set(edge.from, []);
    outEdges.get(edge.from).push(edge);

    if (!inEdges.has(edge.to)) inEdges.set(edge.to, []);
    inEdges.get(edge.to).push(edge);
  }

  /**
   * changeType が 'unchanged' でないノードを返す
   * @returns {Node[]}
   */
  function getChangedNodes() {
    return [...nodeMap.values()].filter((n) => n.changeType !== 'unchanged');
  }

  /**
   * 指定ノードの隣接ノードと接続エッジを双方向で返す
   * @param {string} nodeId
   * @returns {{ node: Node, edge: Edge }[]}
   */
  function getNeighbors(nodeId) {
    const result = [];

    for (const edge of outEdges.get(nodeId) || []) {
      if (nodeMap.has(edge.to)) {
        result.push({ node: nodeMap.get(edge.to), edge });
      }
    }

    for (const edge of inEdges.get(nodeId) || []) {
      if (nodeMap.has(edge.from)) {
        result.push({ node: nodeMap.get(edge.from), edge });
      }
    }

    return result;
  }

  /**
   * 指定ノード起点で BFS し、maxDepth ホップ以内の部分グラフを返す（双方向）。
   * maxDepth=3 は Workflow Change モードの3階層制限に対応する。
   *
   * @param {string} startNodeId
   * @param {number} [maxDepth=Infinity]
   * @returns {{ nodes: Node[], edges: Edge[] }}
   */
  function extractSubgraph(startNodeId, maxDepth = Infinity) {
    if (!nodeMap.has(startNodeId)) {
      return { nodes: [], edges: [] };
    }

    const visitedNodes = new Set([startNodeId]);
    const visitedEdgeKeys = new Set();
    const queue = [{ nodeId: startNodeId, depth: 0 }];

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift();
      if (depth >= maxDepth) continue;

      const adjacent = [
        ...(outEdges.get(nodeId) || []),
        ...(inEdges.get(nodeId) || [])
      ];

      for (const edge of adjacent) {
        const neighborId = edge.from === nodeId ? edge.to : edge.from;
        const edgeKey = `${edge.from}\x00${edge.to}\x00${edge.type}`;
        visitedEdgeKeys.add(edgeKey);

        if (!visitedNodes.has(neighborId)) {
          visitedNodes.add(neighborId);
          queue.push({ nodeId: neighborId, depth: depth + 1 });
        }
      }
    }

    const resultNodes = [...visitedNodes]
      .filter((id) => nodeMap.has(id))
      .map((id) => nodeMap.get(id));

    const resultEdges = edges.filter((e) =>
      visitedEdgeKeys.has(`${e.from}\x00${e.to}\x00${e.type}`)
    );

    return { nodes: resultNodes, edges: resultEdges };
  }

  /**
   * 変更ノード全起点の部分グラフを統合して返す
   * @param {number} [maxDepth=Infinity]
   * @returns {{ nodes: Node[], edges: Edge[] }}
   */
  function extractChangedSubgraph(maxDepth = Infinity) {
    const allNodes = new Map();
    const allEdges = new Map();

    for (const node of getChangedNodes()) {
      const { nodes: subNodes, edges: subEdges } = extractSubgraph(node.id, maxDepth);
      for (const n of subNodes) allNodes.set(n.id, n);
      for (const e of subEdges) {
        allEdges.set(`${e.from}\x00${e.to}\x00${e.type}`, e);
      }
    }

    return {
      nodes: [...allNodes.values()],
      edges: [...allEdges.values()]
    };
  }

  return {
    /** @type {Map<string, Node>} ノードマップ（id → Node） */
    nodes: nodeMap,
    /** @type {Edge[]} 全エッジ */
    edges,
    getChangedNodes,
    getNeighbors,
    extractSubgraph,
    extractChangedSubgraph
  };
}

module.exports = { buildGraph };
