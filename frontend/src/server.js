const http = require("node:http");
const { validateEnv } = require("./config");

let config;

try {
  config = validateEnv();
} catch (error) {
  console.error(`[config-error] ${error.message}`);
  process.exit(1);
}

const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI Review PoC</title>
  </head>
  <body>
    <main>
      <h1>AI Review PoC Frontend</h1>
      <p>Backend: ${config.backendBaseUrl}</p>
    </main>
  </body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});

server.listen(config.port, () => {
  console.log(`[startup] frontend listening on port ${config.port}`);
});
