const test = require("node:test");
const assert = require("node:assert/strict");
const { collectPullRequestMetadata, extractChangedFunctionCandidates } = require("./prMetadataCollector");

test("extractChangedFunctionCandidates parses hunk and changed lines", () => {
  const files = [
    {
      filename: "src/math.js",
      patch: [
        "@@ -1,4 +1,4 @@ function add(a, b) {",
        "-function add(a, b) {",
        "+function add(a, b, c = 0) {",
        "@@ -10,3 +10,4 @@",
        "+const multiply = (a, b) => a * b;"
      ].join("\n")
    },
    {
      filename: "app/services/user.rb",
      patch: "@@ -20,4 +20,4 @@\n+def build_profile(user)\n+end"
    }
  ];

  const candidates = extractChangedFunctionCandidates(files);

  assert.deepEqual(candidates, [
    { filename: "src/math.js", functionName: "add" },
    { filename: "src/math.js", functionName: "multiply" },
    { filename: "app/services/user.rb", functionName: "build_profile" }
  ]);
});

test("collectPullRequestMetadata returns expected shape", async () => {
  const calls = [];
  const githubClient = {
    async get(path) {
      calls.push(path);
      if (path === "/repos/org/repo/pulls/10") {
        return {
          data: {
            title: "Improve parser",
            body: "This PR updates parsing logic.",
            html_url: "https://github.com/org/repo/pull/10",
            head: { sha: "abc123", ref: "feature/parser" }
          }
        };
      }
      if (path === "/repos/org/repo/pulls/10/files?per_page=100&page=1") {
        return {
          data: [
            {
              filename: "src/parser.ts",
              status: "modified",
              additions: 7,
              deletions: 3,
              changes: 10,
              patch: "@@ -1,4 +1,8 @@ export function parse(input: string) {\n+export function parse(input: string, strict = false) {"
            }
          ]
        };
      }
      throw new Error(`unexpected path: ${path}`);
    }
  };

  const result = await collectPullRequestMetadata({
    githubClient,
    repositoryFullName: "org/repo",
    prNumber: 10
  });

  assert.equal(result.repositoryFullName, "org/repo");
  assert.equal(result.prNumber, 10);
  assert.equal(result.headSha, "abc123");
  assert.equal(result.headRef, "feature/parser");
  assert.equal(result.prTitle, "Improve parser");
  assert.equal(result.prDescription, "This PR updates parsing logic.");
  assert.equal(result.lineStats.additions, 7);
  assert.equal(result.lineStats.deletions, 3);
  assert.deepEqual(result.changedFunctionCandidates, [
    { filename: "src/parser.ts", functionName: "parse" }
  ]);
  assert.deepEqual(calls, [
    "/repos/org/repo/pulls/10",
    "/repos/org/repo/pulls/10/files?per_page=100&page=1"
  ]);
});
