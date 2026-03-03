const http = require("node:http");
const net = require("node:net");
const { validateEnv } = require("./config");
const { InMemoryJobQueue } = require("./jobQueue");
const { verifySignature, isTargetEvent, buildJobFromPayload } = require("./githubWebhook");
const { createJobProcessor } = require("./jobProcessor");

let config;

try {
  config = validateEnv();
} catch (error) {
  console.error(`[config-error] ${error.message}`);
  process.exit(1);
}

const queue = new InMemoryJobQueue();
const processJob = createJobProcessor(config);

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.method === "GET" && req.url === "/jobs") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ count: queue.size(), jobs: queue.list() }));
    return;
  }

  if (req.method === "POST" && req.url === "/webhooks/github") {
    handleGithubWebhook(req, res);
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      service: "backend",
      message: "AI review PoC backend is running",
      githubAppId: config.githubAppId
    })
  );
});

function handleGithubWebhook(req, res) {
  const chunks = [];

  req.on("data", (chunk) => {
    chunks.push(chunk);
  });

  req.on("end", () => {
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
