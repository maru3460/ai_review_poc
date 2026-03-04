'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { validateEnv } = require('./config');

let config;

try {
  config = validateEnv();
} catch (error) {
  console.error(`[config-error] ${error.message}`);
  process.exit(1);
}

const DIST_DIR = path.join(__dirname, '..', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  const urlPath = (req.url || '/').split('?')[0];
  const ext = path.extname(urlPath);

  if (ext) {
    // 拡張子ありはアセットファイルとして処理
    const filePath = path.join(DIST_DIR, urlPath);
    // パストラバーサル防止
    if (!filePath.startsWith(DIST_DIR + path.sep) && filePath !== DIST_DIR) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    serveFile(res, filePath);
  } else {
    // SPAフォールバック: index.htmlを返す
    serveFile(res, path.join(DIST_DIR, 'index.html'));
  }
});

server.listen(config.port, () => {
  console.log(`[startup] frontend listening on port ${config.port}`);
});
