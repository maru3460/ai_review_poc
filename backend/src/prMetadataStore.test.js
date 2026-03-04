'use strict';

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const {
  savePullRequestMetadata,
  savePullRequestMetadataFailure,
  getPrMetadata,
  getPrMetadataFailure
} = require("./prMetadataStore");

const BASE_DIR = path.join(__dirname, "..", "data", "pr-metadata");

test("getPrMetadata: ファイルが存在する場合は正しいデータを返す", async () => {
  const repositoryFullName = `test-org/getPrMetadata-${Date.now()}`;
  const prNumber = 1;
  const metadata = {
    repositoryFullName,
    prNumber,
    headSha: "abc123",
    headRef: "main",
    prTitle: "Test PR",
    prDescription: "",
    prUrl: "",
    collectedAt: new Date().toISOString(),
    lineStats: { additions: 0, deletions: 0 },
    files: [],
    changedFunctionCandidates: []
  };

  await savePullRequestMetadata(metadata);

  const result = await getPrMetadata({ repositoryFullName, prNumber });
  assert.ok(result !== null);
  assert.equal(result.repositoryFullName, repositoryFullName);
  assert.equal(result.headSha, "abc123");

  // クリーンアップ
  const safeRepoName = repositoryFullName.replace(/\//g, "__");
  await fs.rm(path.join(BASE_DIR, safeRepoName), { recursive: true, force: true });
});

test("getPrMetadata: ファイルが存在しない場合は null を返す", async () => {
  const result = await getPrMetadata({
    repositoryFullName: "no-org/no-repo-getPrMetadata",
    prNumber: 99999
  });
  assert.equal(result, null);
});

test("getPrMetadata: パストラバーサル文字列で例外を投げる", async () => {
  await assert.rejects(
    () => getPrMetadata({ repositoryFullName: "..", prNumber: 1 }),
    /invalid output path/
  );
});

test("getPrMetadataFailure: ファイルが存在する場合は正しいデータを返す", async () => {
  const repositoryFullName = `test-org/getPrMetadataFailure-${Date.now()}`;
  const prNumber = 2;
  const error = new Error("GitHub API error");
  error.status = 404;

  await savePullRequestMetadataFailure({
    repositoryFullName,
    prNumber,
    deliveryId: "delivery-123",
    error
  });

  const result = await getPrMetadataFailure({ repositoryFullName, prNumber });
  assert.ok(result !== null);
  assert.equal(result.errorMessage, "GitHub API error");
  assert.equal(result.status, 404);

  // クリーンアップ
  const safeRepoName = repositoryFullName.replace(/\//g, "__");
  await fs.rm(path.join(BASE_DIR, safeRepoName), { recursive: true, force: true });
});

test("getPrMetadataFailure: ファイルが存在しない場合は null を返す", async () => {
  const result = await getPrMetadataFailure({
    repositoryFullName: "no-org/no-repo-getPrMetadataFailure",
    prNumber: 99999
  });
  assert.equal(result, null);
});
