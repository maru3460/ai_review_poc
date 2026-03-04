const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildGraph } = require("./graphBuilder");

// サンプルノード
const FILE_A = { id: "src/a.js", type: "file", module: "src/a.js", changeType: "modified" };
const FILE_B = { id: "src/b.js", type: "file", module: "src/b.js", changeType: "unchanged" };
const FILE_C = { id: "src/c.js", type: "file", module: "src/c.js", changeType: "added" };
const FUNC_A1 = { id: "src/a.js::funcA1", type: "function", module: "src/a.js", changeType: "modified" };
const FUNC_B1 = { id: "src/b.js::funcB1", type: "function", module: "src/b.js", changeType: "unchanged" };
const CLASS_C = { id: "src/c.js::ClassC", type: "class", module: "src/c.js", changeType: "added" };

// サンプルエッジ
const EDGE_A_CALLS_B = { from: "src/a.js::funcA1", to: "src/b.js::funcB1", type: "call" };
const EDGE_A_IMPORTS_B = { from: "src/a.js", to: "src/b.js", type: "import" };
const EDGE_C_INHERITS_B = { from: "src/c.js::ClassC", to: "src/b.js::funcB1", type: "inherit" };

describe("buildGraph", () => {
  it("空のノード/エッジでクラッシュしない", () => {
    const graph = buildGraph({ nodes: [], edges: [] });
    assert.equal(graph.nodes.size, 0);
    assert.deepEqual(graph.edges, []);
  });

  it("nodes/edges を省略した場合でもクラッシュしない", () => {
    const graph = buildGraph({});
    assert.equal(graph.nodes.size, 0);
    assert.deepEqual(graph.edges, []);
  });

  it("ノードが id でインデックス化されている", () => {
    const graph = buildGraph({ nodes: [FILE_A, FILE_B], edges: [] });
    assert.equal(graph.nodes.size, 2);
    assert.deepEqual(graph.nodes.get("src/a.js"), FILE_A);
    assert.deepEqual(graph.nodes.get("src/b.js"), FILE_B);
  });
});

describe("getChangedNodes", () => {
  it("changeType が unchanged 以外のノードを返す", () => {
    const graph = buildGraph({
      nodes: [FILE_A, FILE_B, FILE_C, FUNC_A1, FUNC_B1, CLASS_C],
      edges: []
    });
    const changed = graph.getChangedNodes();
    const ids = changed.map((n) => n.id).sort();
    assert.deepEqual(ids, ["src/a.js", "src/a.js::funcA1", "src/c.js", "src/c.js::ClassC"]);
  });

  it("全ノードが unchanged の場合は空配列を返す", () => {
    const graph = buildGraph({ nodes: [FILE_B, FUNC_B1], edges: [] });
    assert.deepEqual(graph.getChangedNodes(), []);
  });

  it("全ノードが変更済みの場合は全ノードを返す", () => {
    const graph = buildGraph({ nodes: [FILE_A, FILE_C], edges: [] });
    assert.equal(graph.getChangedNodes().length, 2);
  });
});

describe("getNeighbors", () => {
  it("outEdge 方向の隣接ノードを返す", () => {
    const graph = buildGraph({
      nodes: [FILE_A, FUNC_A1, FILE_B, FUNC_B1],
      edges: [EDGE_A_CALLS_B]
    });
    const neighbors = graph.getNeighbors("src/a.js::funcA1");
    assert.equal(neighbors.length, 1);
    assert.deepEqual(neighbors[0].node, FUNC_B1);
    assert.deepEqual(neighbors[0].edge, EDGE_A_CALLS_B);
  });

  it("inEdge 方向の隣接ノードも返す（双方向）", () => {
    const graph = buildGraph({
      nodes: [FILE_A, FUNC_A1, FILE_B, FUNC_B1],
      edges: [EDGE_A_CALLS_B]
    });
    const neighbors = graph.getNeighbors("src/b.js::funcB1");
    assert.equal(neighbors.length, 1);
    assert.deepEqual(neighbors[0].node, FUNC_A1);
    assert.deepEqual(neighbors[0].edge, EDGE_A_CALLS_B);
  });

  it("エッジがないノードは空配列を返す", () => {
    const graph = buildGraph({ nodes: [FILE_A], edges: [] });
    assert.deepEqual(graph.getNeighbors("src/a.js"), []);
  });

  it("存在しないノード ID でも空配列を返す", () => {
    const graph = buildGraph({ nodes: [FILE_A], edges: [] });
    assert.deepEqual(graph.getNeighbors("nonexistent"), []);
  });

  it("複数エッジがある場合は全隣接を返す", () => {
    const graph = buildGraph({
      nodes: [FILE_A, FILE_B, FILE_C, FUNC_A1, FUNC_B1, CLASS_C],
      edges: [EDGE_A_IMPORTS_B, EDGE_C_INHERITS_B]
    });
    // src/b.js::funcB1 は EDGE_A_CALLS_B の to でも EDGE_C_INHERITS_B の to でもある
    const neighbors = graph.getNeighbors("src/b.js::funcB1");
    // inEdge: CLASS_C → FUNC_B1
    const ids = neighbors.map((n) => n.node.id);
    assert.ok(ids.includes("src/c.js::ClassC"));
  });
});

describe("extractSubgraph", () => {
  it("存在しないノード ID は空のサブグラフを返す", () => {
    const graph = buildGraph({ nodes: [FILE_A], edges: [] });
    const sub = graph.extractSubgraph("nonexistent");
    assert.deepEqual(sub.nodes, []);
    assert.deepEqual(sub.edges, []);
  });

  it("エッジがない場合は開始ノードのみ返す", () => {
    const graph = buildGraph({ nodes: [FILE_A, FILE_B], edges: [] });
    const sub = graph.extractSubgraph("src/a.js");
    assert.equal(sub.nodes.length, 1);
    assert.deepEqual(sub.nodes[0], FILE_A);
    assert.deepEqual(sub.edges, []);
  });

  it("maxDepth=1 で直接隣接ノードのみを含む", () => {
    // A → B → C の連鎖
    const nodeA = { id: "A", type: "file", module: "A", changeType: "modified" };
    const nodeB = { id: "B", type: "file", module: "B", changeType: "unchanged" };
    const nodeC = { id: "C", type: "file", module: "C", changeType: "unchanged" };
    const edgeAB = { from: "A", to: "B", type: "import" };
    const edgeBC = { from: "B", to: "C", type: "import" };

    const graph = buildGraph({ nodes: [nodeA, nodeB, nodeC], edges: [edgeAB, edgeBC] });
    const sub = graph.extractSubgraph("A", 1);

    const ids = sub.nodes.map((n) => n.id).sort();
    assert.deepEqual(ids, ["A", "B"]);
    assert.equal(sub.edges.length, 1);
    assert.deepEqual(sub.edges[0], edgeAB);
  });

  it("maxDepth=3 で3ホップ以内のノードを含む", () => {
    // A → B → C → D → E (4ホップ)
    const makeNode = (id) => ({ id, type: "file", module: id, changeType: "unchanged" });
    const makeEdge = (from, to) => ({ from, to, type: "import" });
    const nodes = ["A", "B", "C", "D", "E"].map(makeNode);
    const edges = [
      makeEdge("A", "B"),
      makeEdge("B", "C"),
      makeEdge("C", "D"),
      makeEdge("D", "E")
    ];

    const graph = buildGraph({ nodes, edges });
    const sub = graph.extractSubgraph("A", 3);

    const ids = sub.nodes.map((n) => n.id).sort();
    // A(0) → B(1) → C(2) → D(3) まで含まれる（E は4ホップ目で除外）
    assert.deepEqual(ids, ["A", "B", "C", "D"]);
    assert.equal(sub.edges.length, 3);
  });

  it("Workflow 用 maxDepth=3 で正しく3階層に制限される", () => {
    // 変更ノード起点で3階層目まで展開
    const makeNode = (id, changeType = "unchanged") => ({ id, type: "function", module: id, changeType });
    const nodes = [
      makeNode("changed", "modified"),
      makeNode("level1"),
      makeNode("level2"),
      makeNode("level3"),
      makeNode("level4")
    ];
    const edges = [
      { from: "changed", to: "level1", type: "call" },
      { from: "level1", to: "level2", type: "call" },
      { from: "level2", to: "level3", type: "call" },
      { from: "level3", to: "level4", type: "call" }
    ];

    const graph = buildGraph({ nodes, edges });
    const sub = graph.extractSubgraph("changed", 3);

    const ids = sub.nodes.map((n) => n.id).sort();
    assert.ok(ids.includes("changed"), "起点ノード含む");
    assert.ok(ids.includes("level1"), "1ホップ含む");
    assert.ok(ids.includes("level2"), "2ホップ含む");
    assert.ok(ids.includes("level3"), "3ホップ含む");
    assert.ok(!ids.includes("level4"), "4ホップは除外");
  });

  it("サイクルがあっても無限ループしない", () => {
    // A → B → C → A のサイクル
    const nodeA = { id: "A", type: "file", module: "A", changeType: "modified" };
    const nodeB = { id: "B", type: "file", module: "B", changeType: "unchanged" };
    const nodeC = { id: "C", type: "file", module: "C", changeType: "unchanged" };
    const edges = [
      { from: "A", to: "B", type: "import" },
      { from: "B", to: "C", type: "import" },
      { from: "C", to: "A", type: "import" }
    ];

    const graph = buildGraph({ nodes: [nodeA, nodeB, nodeC], edges });
    // サイクルがあっても正常終了することを確認
    const sub = graph.extractSubgraph("A");
    assert.equal(sub.nodes.length, 3);
  });

  it("双方向トラバーサルで上流も下流も辿れる", () => {
    // upstream → target → downstream
    const upstream = { id: "upstream", type: "file", module: "upstream", changeType: "unchanged" };
    const target = { id: "target", type: "function", module: "target", changeType: "modified" };
    const downstream = { id: "downstream", type: "file", module: "downstream", changeType: "unchanged" };
    const edges = [
      { from: "upstream", to: "target", type: "call" },
      { from: "target", to: "downstream", type: "call" }
    ];

    const graph = buildGraph({ nodes: [upstream, target, downstream], edges });
    const sub = graph.extractSubgraph("target", 1);

    const ids = sub.nodes.map((n) => n.id).sort();
    assert.deepEqual(ids, ["downstream", "target", "upstream"]);
  });
});

describe("extractChangedSubgraph", () => {
  it("変更ノードがない場合は空のサブグラフを返す", () => {
    const graph = buildGraph({ nodes: [FILE_B, FUNC_B1], edges: [] });
    const sub = graph.extractChangedSubgraph();
    assert.deepEqual(sub.nodes, []);
    assert.deepEqual(sub.edges, []);
  });

  it("複数の変更ノード起点のサブグラフを統合する", () => {
    // nodeA (modified) → nodeB ← nodeC (added)
    const nodeA = { id: "A", type: "file", module: "A", changeType: "modified" };
    const nodeB = { id: "B", type: "file", module: "B", changeType: "unchanged" };
    const nodeC = { id: "C", type: "file", module: "C", changeType: "added" };
    const edges = [
      { from: "A", to: "B", type: "import" },
      { from: "C", to: "B", type: "import" }
    ];

    const graph = buildGraph({ nodes: [nodeA, nodeB, nodeC], edges });
    const sub = graph.extractChangedSubgraph();

    const ids = sub.nodes.map((n) => n.id).sort();
    // A と C は changed、B は両方から到達可能
    assert.deepEqual(ids, ["A", "B", "C"]);
    assert.equal(sub.edges.length, 2);
  });

  it("maxDepth=1 で直接隣接のみに制限される", () => {
    // A (modified) → B → C
    const nodeA = { id: "A", type: "file", module: "A", changeType: "modified" };
    const nodeB = { id: "B", type: "file", module: "B", changeType: "unchanged" };
    const nodeC = { id: "C", type: "file", module: "C", changeType: "unchanged" };
    const edges = [
      { from: "A", to: "B", type: "import" },
      { from: "B", to: "C", type: "import" }
    ];

    const graph = buildGraph({ nodes: [nodeA, nodeB, nodeC], edges });
    const sub = graph.extractChangedSubgraph(1);

    const ids = sub.nodes.map((n) => n.id).sort();
    assert.deepEqual(ids, ["A", "B"]);
    assert.equal(sub.edges.length, 1);
  });

  it("重複ノード/エッジを排除して統合する", () => {
    // A (modified) と B (modified) が共通のノード C を参照
    const nodeA = { id: "A", type: "file", module: "A", changeType: "modified" };
    const nodeB = { id: "B", type: "file", module: "B", changeType: "modified" };
    const nodeC = { id: "C", type: "file", module: "C", changeType: "unchanged" };
    const edges = [
      { from: "A", to: "C", type: "import" },
      { from: "B", to: "C", type: "import" }
    ];

    const graph = buildGraph({ nodes: [nodeA, nodeB, nodeC], edges });
    const sub = graph.extractChangedSubgraph();

    // C が重複して含まれないことを確認
    const cNodes = sub.nodes.filter((n) => n.id === "C");
    assert.equal(cNodes.length, 1);
    assert.equal(sub.nodes.length, 3);
  });
});
