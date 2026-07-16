'use strict';

// Local dev server only. Mirrors the request/response shape Vercel's Node
// runtime provides (req.body pre-parsed as JSON, res.status().json() helpers)
// so the same api/*.js handlers run unchanged here and in production.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4100;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

const routes = {
  '/api/segments': require('../api/segments'),
  '/api/deepdive': require('../api/deepdive'),
  '/api/generate': require('../api/generate'),
  '/api/auth': require('../api/auth'),
  '/api/admin': require('../api/admin'),
  '/api/enrich': require('../api/enrich'),
  '/api/revise': require('../api/revise'),
  '/api/order': require('../api/order'),
  '/api/check-payment': require('../api/check-payment'),
  '/api/webhook': require('../api/webhook'),
};

function withHelpers(res) {
  res.status = function status(code) {
    res.statusCode = code;
    return res;
  };
  res.json = function json(obj) {
    const body = JSON.stringify(obj);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(body);
    return res;
  };
  res.send = function send(body) {
    res.end(body);
    return res;
  };
  return res;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  const handler = routes[urlPath];
  if (handler) {
    withHelpers(res);
    try {
      req.body = await readBody(req);
    } catch (e) {
      res.status(400).json({ ok: false, message: e.message });
      return;
    }
    try {
      await handler(req, res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.status(500).json({ ok: false, message: e.message || 'Internal error' });
    }
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Brand strategy assistant running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('CẢNH BÁO: chưa có biến môi trường ANTHROPIC_API_KEY -- /api/segments và /api/deepdive sẽ lỗi.');
  }
});
