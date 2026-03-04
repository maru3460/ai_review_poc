'use strict';

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

// テスト用に BASE_DIR を tmp に向けるためモジュールをインジェクションできないが、
// saveModeResults / getModeResults を同一モジュールから呼ぶことで連携テストとする。
// ただし本番の BASE_DIR は固定なので、tmp ディレクトリに書き込んで
// 直接ファイルを作成し getModeResults を検証する方針でテストする。

const { getModeResults, saveModeResults } = require("./modeResultStore");

const BASE_DIR = path.join(__dirname, "..", "data", "mode-results");

test("getModeResults: ファイルが存在する場合は正しいデータを返す", async (t) => {
  const repositoryFullName = `test-org/getModeResults-${Date.now()}`;
  const prNumber = 1;
  const modes = { workflowChange: { success: true, data: { summary: "ok" } } };

  // saveModeResults でファイルを作成
  await saveModeResults({ repositoryFullName, prNumber, modes });

  const result = await getModeResults({ repositoryFullName, prNumber });
  assert.ok(result !== null);
  assert.deepEqual(result.modes, modes);
  assert.equal(result.repositoryFullName, repositoryFullName);

  // クリーンアップ
  const safeRepoName = repositoryFullName.replace(/\//g, "__");
  await fs.rm(path.join(BASE_DIR, safeRepoName), { recursive: true, force: true });
});

test("getModeResults: ファイルが存在しない場合は null を返す", async () => {
  const result = await getModeResults({
    repositoryFullName: "no-org/no-repo-getModeResults",
    prNumber: 99999
  });
  assert.equal(result, null);
});

test("getModeResults: パストラバーサル文字列で例外を投げる", async () => {
  await assert.rejects(
    () => getModeResults({ repositoryFullName: "..", prNumber: 1 }),
    /invalid output path/
  );
});
