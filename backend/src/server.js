const http = require("node:http");
const net = require("node:net");
const { validateEnv } = require("./config");
const { InMemoryJobQueue } = require("./jobQueue");
const { verifySignature, isTargetEvent, buildJobFromPayload } = require("./githubWebhook");
const { createJobProcessor } = require("./jobProcessor");
const { GithubClient } = require("./githubClient");
const { createLlmClient } = require("./llmClient");
const { getModeResults } = require("./modeResultStore");
const { getStaticAnalysis } = require("./staticAnalysisStore");
const { getPrMetadata, getPrMetadataFailure } = require("./prMetadataStore");

let config;

try {
  config = validateEnv();
} catch (error) {
  console.error(`[config-error] ${error.message}`);
  process.exit(1);
}

const queue = new InMemoryJobQueue();
const processJob = createJobProcessor(config);
const githubClient = new GithubClient({
  token: config.githubToken,
  apiBaseUrl: config.githubApiBaseUrl
});

// AI解説のインメモリキャッシュ（key: "owner/repo/prNumber::nodeId"）
const explanationCache = new Map();

// LLMクライアントのシングルトン（OPENAI_API_KEY が設定されている場合のみ生成）
let llmClient = null;
if (config.openaiApiKey) {
  llmClient = createLlmClient({
    provider: config.llmProvider,
    apiKey: config.openaiApiKey,
    model: config.llmModel
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.method === "POST" && req.url === "/webhooks/github") {
    handleGithubWebhook(req, res);
    return;
  }

  const parsedUrl = new URL(req.url, "http://localhost");
  const apiMatch = parsedUrl.pathname.match(
    /^\/api\/prs\/([^/]+)\/([^/]+)\/(\d+)\/(visualization|status|nodes\/explain|nodes)$/
  );
  if (req.method === "GET" && apiMatch) {
    const [, owner, repo, prNumber, endpoint] = apiMatch;
    handleVisualizationApi(req, res, {
      owner,
      repo,
      prNumber,
      endpoint,
      searchParams: parsedUrl.searchParams
    });
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ service: "backend", status: "running" }));
});

const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1MB

function handleGithubWebhook(req, res) {
  const chunks = [];
  let bodySize = 0;
  let destroyed = false;

  req.on("data", (chunk) => {
    bodySize += chunk.length;
    if (bodySize > MAX_BODY_SIZE) {
      if (!destroyed) {
        destroyed = true;
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "payload too large" }));
        req.destroy();
      }
      return;
    }
    chunks.push(chunk);
  });

  req.on("end", () => {
    if (destroyed) return;
    const rawBody = Buffer.concat(chunks);
    const signature = req.headers["x-hub-signature-256"];
    const event = req.headers["x-github-event"];
    const deliveryId = req.headers["x-github-delivery"];

    if (!event || !deliveryId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "missing required GitHub headers" }));
      return;
    }

    if (!verifySignature(rawBody, signature, config.githubWebhookSecret)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid webhook signature" }));
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON payload" }));
      return;
    }

    if (!isTargetEvent(event, payload, config.githubBotLogin)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ignored", reason: "non_target_event" }));
      return;
    }

    const job = buildJobFromPayload({ deliveryId, event, payload });
    const result = queue.enqueue(job);

    if (!result.enqueued) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ignored", reason: result.reason }));
      return;
    }

    console.log(
      `[info] queued analysis job delivery=${deliveryId} event=${event} action=${payload.action} repo=${job.repositoryFullName} pr=${job.prNumber}`
    );
    processJob(job)
      .then((result) => {
        console.log(
          `[info] collected pr metadata delivery=${deliveryId} repo=${job.repositoryFullName} pr=${job.prNumber} output=${result.outputPath}`
        );
      })
      .catch((error) => {
        console.error(
          `[error] failed to collect pr metadata delivery=${deliveryId} repo=${job.repositoryFullName} pr=${job.prNumber} reason=${error.message}`
        );
      });
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "queued", deliveryId }));
  });
}

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*"
};

async function handleVisualizationApi(req, res, { owner, repo, prNumber, endpoint, searchParams }) {
  const repositoryFullName = `${owner}/${repo}`;

  try {
    if (endpoint === "visualization") {
      const [modeResults, prMetadata] = await Promise.all([
        getModeResults({ repositoryFullName, prNumber }),
        getPrMetadata({ repositoryFullName, prNumber })
      ]);

      if (modeResults === null) {
        res.writeHead(404, CORS_HEADERS);
        res.end(JSON.stringify({ error: "not_ready" }));
        return;
      }
      if (prMetadata === null) {
        res.writeHead(404, CORS_HEADERS);
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }

      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify({ prMetadata, modes: modeResults.modes }));
      return;
    }

    if (endpoint === "status") {
      const [modeResults, prMetadata, prMetadataFailure] = await Promise.all([
        getModeResults({ repositoryFullName, prNumber }),
        getPrMetadata({ repositoryFullName, prNumber }),
        getPrMetadataFailure({ repositoryFullName, prNumber })
      ]);

      if (modeResults !== null) {
        res.writeHead(200, CORS_HEADERS);
        res.end(JSON.stringify({ status: "completed" }));
        return;
      }
      if (prMetadata !== null) {
        res.writeHead(200, CORS_HEADERS);
        res.end(JSON.stringify({ status: "processing" }));
        return;
      }
      if (prMetadataFailure !== null) {
        res.writeHead(200, CORS_HEADERS);
        res.end(JSON.stringify({ status: "failed", reason: prMetadataFailure.errorMessage }));
        return;
      }
      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify({ status: "not_found" }));
      return;
    }

    if (endpoint === "nodes") {
      const nodeId = searchParams.get("id");
      const [staticAnalysis, modeResults, prMetadata] = await Promise.all([
        getStaticAnalysis({ repositoryFullName, prNumber }),
        getModeResults({ repositoryFullName, prNumber }),
        getPrMetadata({ repositoryFullName, prNumber })
      ]);

      if (!staticAnalysis) {
        res.writeHead(404, CORS_HEADERS);
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }

      const nodes = staticAnalysis.nodes || [];
      const edges = staticAnalysis.edges || [];
      const targetNode = nodes.find((n) => n.id === nodeId);

      if (!targetNode) {
        res.writeHead(404, CORS_HEADERS);
        res.end(JSON.stringify({ error: "node_not_found" }));
        return;
      }

      const neighbors = edges
        .filter((e) => e.from === nodeId || e.to === nodeId)
        .map((e) => {
          const neighborId = e.from === nodeId ? e.to : e.from;
          const neighborNode = nodes.find((n) => n.id === neighborId) || { id: neighborId };
          return { node: neighborNode, edge: e };
        });

      let riskLevel = null;
      let riskReason = null;
      if (modeResults && modeResults.modes && modeResults.modes.impactMap) {
        const impactNodes = modeResults.modes.impactMap.data?.impactNodes || [];
        const impactNode = impactNodes.find((n) => n.id === nodeId);
        if (impactNode) {
          riskLevel = impactNode.riskLevel || null;
          riskReason = impactNode.riskReason || null;
        }
      }

      let fileContent = null;
      if (prMetadata && prMetadata.headSha && targetNode.module) {
        const { owner: repoOwner, repo: repoName } = splitOwnerRepo(repositoryFullName);
        try {
          const contentRes = await githubClient.get(
            `/repos/${repoOwner}/${repoName}/contents/${targetNode.module}?ref=${prMetadata.headSha}`
          );
          if (contentRes.data && contentRes.data.content) {
            fileContent = Buffer.from(contentRes.data.content, "base64").toString("utf8");
          }
        } catch {
          // GitHub API エラー時はfileContentをnullのまま返す
        }
      }

      let codeSnippet = null;
      if (fileContent) {
        if (nodeId.includes("::")) {
          const symbolName = nodeId.split("::").slice(1).join("::");
          codeSnippet = extractSymbolSnippet(fileContent, symbolName);
        } else {
          // ファイルノードは先頭3000文字を断片として返す
          codeSnippet = fileContent.slice(0, 3000);
        }
      }

      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify({ node: targetNode, neighbors, riskLevel, riskReason, fileContent, codeSnippet }));
      return;
    }

    if (endpoint === "nodes/explain") {
      const nodeId = searchParams.get("id");
      const cacheKey = `${repositoryFullName}/${prNumber}::${nodeId}`;

      if (explanationCache.has(cacheKey)) {
        res.writeHead(200, CORS_HEADERS);
        res.end(JSON.stringify({ aiExplanation: explanationCache.get(cacheKey) }));
        return;
      }

      const [staticAnalysis, prMetadata] = await Promise.all([
        getStaticAnalysis({ repositoryFullName, prNumber }),
        getPrMetadata({ repositoryFullName, prNumber })
      ]);

      if (!staticAnalysis) {
        res.writeHead(404, CORS_HEADERS);
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }

      const nodes = staticAnalysis.nodes || [];
      const targetNode = nodes.find((n) => n.id === nodeId);

      if (!targetNode) {
        res.writeHead(404, CORS_HEADERS);
        res.end(JSON.stringify({ error: "node_not_found" }));
        return;
      }

      // コード断片を取得してLLMへ渡す
      let codeSnippet = null;
      if (prMetadata && prMetadata.headSha && targetNode.module) {
        const { owner: repoOwner, repo: repoName } = splitOwnerRepo(repositoryFullName);
        try {
          const contentRes = await githubClient.get(
            `/repos/${repoOwner}/${repoName}/contents/${targetNode.module}?ref=${prMetadata.headSha}`
          );
          if (contentRes.data && contentRes.data.content) {
            const fileContent = Buffer.from(contentRes.data.content, "base64").toString("utf8");
            if (nodeId.includes("::")) {
              const symbolName = nodeId.split("::").slice(1).join("::");
              codeSnippet = extractSymbolSnippet(fileContent, symbolName);
            } else {
              codeSnippet = fileContent.slice(0, 3000);
            }
          }
        } catch {
          // GitHub API エラー時はcodeSnippetをnullのまま
        }
      }

      let aiExplanation = null;
      if (llmClient && codeSnippet) {
        try {
          const systemPrompt = "あなたはコードレビュー支援AIです。与えられたコードを3行以内で簡潔に日本語で解説してください。";
          const userPrompt = `以下のコードを3行で説明してください:\n\n${codeSnippet.slice(0, 2000)}`;
          aiExplanation = await llmClient.complete({ system: systemPrompt, user: userPrompt });
          explanationCache.set(cacheKey, aiExplanation);
        } catch {
          // LLM エラー時はaiExplanationをnullのまま返す
        }
      }

      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify({ aiExplanation }));
      return;
    }
  } catch (err) {
    console.error(`[error] visualization api error: ${err.message}`);
    res.writeHead(500, CORS_HEADERS);
    res.end(JSON.stringify({ error: "internal_error" }));
  }
}

function splitOwnerRepo(repositoryFullName) {
  const [owner, repo] = repositoryFullName.split("/");
  return { owner, repo };
}

/**
 * ファイル全文からシンボル（関数/クラス）のコード断片を抽出する。
 * シンボル名を含む定義行から始まり、インデントが元のレベルに戻るまでを返す。
 * 見つからない場合はnullを返す。
 *
 * @param {string} fileContent
 * @param {string} symbolName
 * @returns {string|null}
 */
function extractSymbolSnippet(fileContent, symbolName) {
  const lines = fileContent.split("\n");
  const definitionPattern = /\b(function|class|def|async\s+function|const\s+\w+\s*=|private|public|protected|static)\b/;

  const startIdx = lines.findIndex(
    (line) => line.includes(symbolName) && definitionPattern.test(line)
  );
  if (startIdx === -1) return null;

  const baseIndent = lines[startIdx].match(/^(\s*)/)[1].length;
  const MAX_LINES = 100;
  let endIdx = startIdx + 1;
  let foundBody = false;

  while (endIdx < lines.length && endIdx - startIdx < MAX_LINES) {
    const trimmed = lines[endIdx].trim();
    if (trimmed === "") { endIdx++; continue; }
    const indent = lines[endIdx].match(/^(\s*)/)[1].length;
    if (!foundBody && indent > baseIndent) { foundBody = true; }
    if (foundBody && indent <= baseIndent && trimmed !== "") {
      endIdx++; // 閉じ括弧行を含めて終了する
      break;
    }
    endIdx++;
  }

  return lines.slice(startIdx, endIdx).join("\n");
}

server.listen(config.port, () => {
  console.log(`[startup] backend listening on port ${config.port}`);
  if (config.redisUrl) {
    checkRedisConnection(config.redisUrl);
  } else {
    console.log("[startup] Redis: not configured (REDIS_URL unset), using in-memory queue");
  }
});

// Redis への TCP 疎通確認（ログのみ、失敗しても起動継続）
function checkRedisConnection(redisUrl) {
  let parsed;
  try {
    parsed = new URL(redisUrl);
  } catch {
    console.warn(`[startup] Redis: invalid REDIS_URL format, skipping connection check`);
    return;
  }

  const host = parsed.hostname;
  const port = Number(parsed.port) || 6379;
  const client = net.connect(port, host, () => {
    console.log(`[startup] Redis connection: OK (${host}:${port})`);
    client.destroy();
  });
  client.setTimeout(5000);
  client.on("timeout", () => {
    console.warn(`[startup] Redis connection: timeout (${host}:${port})`);
    client.destroy();
  });
  client.on("error", (err) => {
    console.warn(`[startup] Redis connection: failed (${host}:${port}) - ${err.message}`);
  });
}
