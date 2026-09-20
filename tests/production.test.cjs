const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApiServer } = require('../production.cjs');

test('production HTTP adapter preserves routing, validation and playlist rewriting', async t => {
  const server = createApiServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = (path, options) => fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
  assert.deepEqual(await (await request('/healthz')).json(), { ok: true });
  assert.equal((await request('/.env.local')).status, 404);
  assert.equal((await request('/api/stream/extra')).status, 404);
  assert.equal((await request('/api/stream?channel=abc', { method: 'POST' })).status, 405);
  assert.equal((await request('/api/search?q=a')).status, 400);
  const nativeFetch = global.fetch;
  t.after(() => { global.fetch = nativeFetch; });
  global.fetch = (url, options) => {
    if (String(url).startsWith('http://127.0.0.1:')) return nativeFetch(url, options);
    if (String(url).includes('gql.twitch.tv')) return Promise.resolve(Response.json({
      data: { streamPlaybackAccessToken: { value: 'token', signature: 'signature' } },
    }));
    return Promise.resolve(new Response('#EXTM3U\nhttps://euc13.playlist.ttvnw.net/v1/playlist/test.m3u8\n'));
  };
  const response = await request('/api/stream?channel=example');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /\/api\/stream\?playlist=https%3A/);
});
