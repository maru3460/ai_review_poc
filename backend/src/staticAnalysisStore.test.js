'use strict';

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const { getStaticAnalysis, saveStaticAnalysis } = require("./staticAnalysisStore");

const BASE_DIR = path.join(__dirname, "..", "data", "static-analysis");

test("getStaticAnalysis: ファイルが存在する場合は正しいデータを返す", async () => {
  const repositoryFullName = `test-org/getStaticAnalysis-${Date.now()}`;
  const prNumber = 1;
  const analysis = {
    repositoryFullName,
    prNumber,
    nodes: [{ id: "src/a.js::funcA", type: "function", module: "src/a.js" }],
    edges: []
  };

  await saveStaticAnalysis(analysis);

  const result = await getStaticAnalysis({ repositoryFullName, prNumber });
  assert.ok(result !== null);
  assert.equal(result.repositoryFullName, repositoryFullName);
  assert.deepEqual(result.nodes, analysis.nodes);

  // クリーンアップ
  const safeRepoName = repositoryFullName.replace(/\//g, "__");
  await fs.rm(path.join(BASE_DIR, safeRepoName), { recursive: true, force: true });
});

test("getStaticAnalysis: ファイルが存在しない場合は null を返す", async () => {
  const result = await getStaticAnalysis({
    repositoryFullName: "no-org/no-repo-getStaticAnalysis",
    prNumber: 99999
  });
  assert.equal(result, null);
});

test("getStaticAnalysis: パストラバーサル文字列で例外を投げる", async () => {
  await assert.rejects(
    () => getStaticAnalysis({ repositoryFullName: "..", prNumber: 1 }),
    /invalid output path/
  );
});
