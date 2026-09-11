const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/stream.js');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
async function request(url = '/api/stream?channel=example', method = 'GET') {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; }, end(body) { this.body = body; } };
  await handler({ url, method, socket: { remoteAddress: 'test' } }, res);
  return res;
}
test('rejects invalid channels and methods before contacting Twitch', async () => {
  global.fetch = () => { throw new Error('Unexpected request'); };
  assert.equal((await request('/api/stream?channel=../private')).statusCode, 400);
  assert.equal((await request('/api/stream?channel=example', 'POST')).statusCode, 405);
});
test('resolves the playback token and returns the unmodified master playlist', async () => {
  const playlist = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\nhttps://video.example/live.m3u8\n';
  global.fetch = async (url, options) => {
    if (String(url).includes('gql.twitch.tv')) {
      assert.equal(JSON.parse(options.body).variables.login, 'example');
      assert.equal(options.headers.Authorization, undefined);
      return Response.json({ data: { streamPlaybackAccessToken: { value: 'token', signature: 'signature' } } });
    }
    assert.equal(url.hostname, 'usher.ttvnw.net');
    assert.equal(url.searchParams.get('sig'), 'signature');
    return new Response(playlist);
  };
  const res = await request();
  assert.equal(res.body, playlist);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('access refusals stay errors and do not leak upstream data', async () => {
  global.fetch = async () => Response.json({ errors: [{ message: 'private upstream detail' }] });
  const res = await request();
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error: 'PLAYBACK_ACCESS_DENIED' });
});
test('reports offline streams and rejects invalid manifests', async () => {
  for (const [response, status] of [[new Response('', { status: 404 }), 404], [new Response('<html>'), 502]]) {
    global.fetch = async url => String(url).includes('gql.twitch.tv')
      ? Response.json({ data: { streamPlaybackAccessToken: { value: 't', signature: 's' } } }) : response;
    assert.equal((await request()).statusCode, status);
  }
});
test('network failures become a recoverable error', async () => {
  global.fetch = async () => { throw new Error('timeout'); };
  assert.deepEqual((await request()).body, { error: 'STREAM_UNAVAILABLE' });
});
