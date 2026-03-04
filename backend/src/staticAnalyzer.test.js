const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { analyzeStaticGraph } = require("./staticAnalyzer");

function makeMockClient(nodes, edges) {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                tool_calls: [
                  {
                    function: {
                      name: "report_graph",
                      arguments: JSON.stringify({ nodes, edges })
                    }
                  }
                ]
              }
            }
          ]
        })
      }
    }
  };
}

const JS_PATCH = `@@ -1,5 +1,8 @@
+import { helper } from './utils.js';
+
 function processData(input) {
-  return input;
+  const result = helper(input);
+  return result;
 }`;

const TS_PATCH = `@@ -1,6 +1,10 @@
+import { Service } from './service';
+
 class DataProcessor {
+  constructor(private service: Service) {}
+
   process(data: unknown): string {
-    return String(data);
+    return this.service.transform(data);
   }
 }`;

const RUBY_PATCH = `@@ -1,5 +1,9 @@
+require_relative 'helper'
+
 def process_data(input)
-  input.to_s
+  result = Helper.new.transform(input)
+  result
 end`;

const CSHARP_PATCH = `@@ -1,8 +1,12 @@
+using MyApp.Services;
+
 public class DataProcessor
 {
+  private readonly IService _service;
+
   public string Process(string input)
   {
-    return input;
+    return _service.Transform(input);
   }
 }`;

function makeMetadata(filename, patch, status = "modified") {
  return {
    repositoryFullName: "org/repo",
    prNumber: 1,
    prTitle: "Test PR",
    prDescription: "Test description",
    files: [{ filename, status, patch, additions: 4, deletions: 1, changes: 5 }],
    changedFunctionCandidates: []
  };
}

describe("analyzeStaticGraph", () => {
  it("正常系: 有効なノードとエッジを返す", async () => {
    const expectedNodes = [
      { id: "src/parser.js", type: "file", module: "src/parser.js", changeType: "modified" },
      {
        id: "src/parser.js::processData",
        type: "function",
        module: "src/parser.js",
        changeType: "modified"
      }
    ];
    const expectedEdges = [
      { from: "src/parser.js::processData", to: "src/utils.js::helper", type: "call" }
    ];
    const mockClient = makeMockClient(expectedNodes, expectedEdges);

    const result = await analyzeStaticGraph({
      metadata: makeMetadata("src/parser.js", JS_PATCH),
      _client: mockClient
    });

    assert.ok(result.analyzedAt);
    assert.equal(result.repositoryFullName, "org/repo");
    assert.equal(result.prNumber, 1);
    assert.deepEqual(result.nodes, expectedNodes);
    assert.deepEqual(result.edges, expectedEdges);
  });

  it("report_graph ツールが呼ばれない場合はエラーをスローする", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ finish_reason: "stop", message: { tool_calls: [] } }]
          })
        }
      }
    };

    await assert.rejects(
      () =>
        analyzeStaticGraph({ metadata: makeMetadata("src/x.js", JS_PATCH), _client: mockClient }),
      /report_graph.*was not called/
    );
  });

  it("空のノード/エッジでもクラッシュしない", async () => {
    const mockClient = makeMockClient([], []);

    const result = await analyzeStaticGraph({
      metadata: makeMetadata("src/empty.js", ""),
      _client: mockClient
    });

    assert.deepEqual(result.nodes, []);
    assert.deepEqual(result.edges, []);
  });

  it("JavaScript差分でクラッシュしない", async () => {
    const mockClient = makeMockClient([], []);
    await assert.doesNotReject(() =>
      analyzeStaticGraph({
        metadata: makeMetadata("src/processor.js", JS_PATCH),
        _client: mockClient
      })
    );
  });

  it("TypeScript差分でクラッシュしない", async () => {
    const mockClient = makeMockClient([], []);
    await assert.doesNotReject(() =>
      analyzeStaticGraph({
        metadata: makeMetadata("src/processor.ts", TS_PATCH),
        _client: mockClient
      })
    );
  });

  it("Ruby差分でクラッシュしない", async () => {
    const mockClient = makeMockClient([], []);
    await assert.doesNotReject(() =>
      analyzeStaticGraph({
        metadata: makeMetadata("lib/processor.rb", RUBY_PATCH),
        _client: mockClient
      })
    );
  });

  it("C#差分でクラッシュしない", async () => {
    const mockClient = makeMockClient([], []);
    await assert.doesNotReject(() =>
      analyzeStaticGraph({
        metadata: makeMetadata("src/DataProcessor.cs", CSHARP_PATCH),
        _client: mockClient
      })
    );
  });

  it("MAX_FILES(20件)を超えるファイルがあってもクラッシュしない", async () => {
    const mockClient = makeMockClient([], []);
    const manyFiles = Array.from({ length: 30 }, (_, i) => ({
      filename: `src/file${i}.js`,
      status: "modified",
      patch: JS_PATCH,
      additions: 1,
      deletions: 1,
      changes: 2
    }));
    const metadata = {
      repositoryFullName: "org/repo",
      prNumber: 99,
      prTitle: "Large PR",
      prDescription: "",
      files: manyFiles,
      changedFunctionCandidates: []
    };

    await assert.doesNotReject(() =>
      analyzeStaticGraph({ metadata, _client: mockClient })
    );
  });
});
