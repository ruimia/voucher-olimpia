require('dotenv').config({ path: '.env.local' });

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3002;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ── API routes ─────────────────────────────────────────────
  if (req.url.startsWith('/api/')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204); res.end(); return;
    }

    const routeName = req.url.split('?')[0].replace('/api/', '');
    let handler;
    try {
      handler = require(`./api/${routeName}`);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API route not found' }));
      return;
    }

    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try { req.body = JSON.parse(body); } catch { req.body = {}; }
      res.setHeader('Content-Type', 'application/json');
      const mock = {
        status(code) { res.statusCode = code; return this; },
        json(data)   { res.end(JSON.stringify(data)); },
      };
      await handler(req, mock);
    });
    return;
  }

  // ── Arquivos estáticos ─────────────────────────────────────
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(__dirname, 'index.html'), (e, d) => {
        if (e) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(d);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`✓ Servidor local em http://localhost:${PORT}`);
});
