const { OpenAI } = require("openai");

const GRAPH_FUNCTION = {
  name: "report_graph",
  description: "Report nodes and edges extracted from the PR diff",
  parameters: {
    type: "object",
    required: ["nodes", "edges"],
    properties: {
      nodes: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "type", "module", "changeType"],
          properties: {
            id: {
              type: "string",
              description: "ファイルは 'filename'、関数/クラスは 'filename::symbolName' 形式"
            },
            type: { type: "string", enum: ["file", "function", "class"] },
            module: { type: "string", description: "所属ファイルパス" },
            changeType: {
              type: "string",
              enum: ["added", "removed", "modified", "unchanged"]
            }
          }
        }
      },
      edges: {
        type: "array",
        items: {
          type: "object",
          required: ["from", "to", "type"],
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            type: { type: "string", enum: ["call", "import", "inherit"] }
          }
        }
      }
    }
  }
};

const MAX_PATCH_CHARS = 3000;
const MAX_FILES = 20;

function buildPrompt(metadata) {
  const filesSummary = metadata.files
    .slice(0, MAX_FILES)
    .map((f) => {
      const patch = (f.patch || "").slice(0, MAX_PATCH_CHARS);
      return `### ${f.filename} (${f.status})\n${patch || "(no diff)"}`;
    })
    .join("\n\n");

  const remaining = metadata.files.length - MAX_FILES;
  const remainingNote = remaining > 0 ? `\n(他 ${remaining} ファイルは省略)` : "";

  return `You are analyzing a GitHub Pull Request to extract a code structure graph.

PR Title: ${metadata.prTitle}
PR Description: ${metadata.prDescription || "(none)"}

Changed Files (${metadata.files.length} total, showing up to ${MAX_FILES}):
${filesSummary}${remainingNote}

Analyze the diffs above and extract:
- Nodes: all significant files, functions, and classes visible in the diff
- Edges: call, import, and inherit relationships visible in the diff

For node IDs: use "filename" for files, "filename::symbolName" for functions/classes.
For changeType: "added" if only + lines, "removed" if only - lines, "modified" if both.

Use the report_graph function to return the result.`;
}

async function analyzeStaticGraph({ metadata, openaiApiKey, _client }) {
  const client = _client || new OpenAI({ apiKey: openaiApiKey });
  const prompt = buildPrompt(metadata);

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    tools: [{ type: "function", function: GRAPH_FUNCTION }],
    tool_choice: { type: "function", function: { name: "report_graph" } }
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.find(
    (tc) => tc.function.name === "report_graph"
  );

  if (!toolCall) {
    const finishReason = response.choices[0]?.finish_reason;
    throw new Error(`report_graph tool was not called (finish_reason: ${finishReason})`);
  }

  const { nodes, edges } = JSON.parse(toolCall.function.arguments);

  return {
    analyzedAt: new Date().toISOString(),
    repositoryFullName: metadata.repositoryFullName,
    prNumber: metadata.prNumber,
    nodes: nodes || [],
    edges: edges || []
  };
}

module.exports = { analyzeStaticGraph };
