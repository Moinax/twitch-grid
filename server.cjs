const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const search = require('./api/search.js');
const port = Number(process.argv[2] || 8765);
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'], '/library.js': ['library.js', 'text/javascript'],
  '/config.json': ['config.json', 'application/json'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  res.status = code => { res.statusCode = code; return res; };
  res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
  if (pathname === '/api/search') return search(req, res);
  if (!files[pathname]) { res.statusCode = 404; return res.end('Not found'); }
  const [file, type] = files[pathname];
  try {
    const body = await fs.readFile(path.join(__dirname, file));
    res.setHeader('Content-Type', type + '; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  } catch { res.statusCode = 500; res.end('Unable to read file'); }
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}`));
