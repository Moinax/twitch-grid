// Caddy serves dist; this loopback-only process owns the two Twitch API routes.
const { createServer } = require('node:http');
const search = require('./api/search.js');
const stream = require('./api/stream.js');

function createApiServer() {
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/healthz' && req.method === 'GET') return res.json({ ok: true });
      const handler = path === '/api/search' ? search : path === '/api/stream' ? stream : null;
      if (!handler) return res.status(404).json({ error: 'NOT_FOUND' });
      await handler(req, res);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'INTERNAL_ERROR' });
      else res.destroy();
    }
  });
}

if (require.main === module) {
  const server = createApiServer();
  server.listen(Number(process.env.PORT || 8766), '127.0.0.1');
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    server.close();
    setTimeout(() => process.exit(0), 10000).unref();
  });
}

module.exports = { createApiServer };
