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
test('resolves the playback token and routes the variant playlists back through this endpoint', async () => {
  const playlist = '#EXTM3U\n#EXT-X-SESSION-DATA:DATA-ID="NODE",VALUE="https://node.example"\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\nhttps://euc13.playlist.ttvnw.net/v1/playlist/abc.m3u8\n';
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
  // Twitch's playlist hosts refuse the deployed Origin, so only the segment URLs stay direct
  assert.equal(res.body, '#EXTM3U\n#EXT-X-SESSION-DATA:DATA-ID="NODE",VALUE="https://node.example"\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\n/api/stream?playlist=https%3A%2F%2Feuc13.playlist.ttvnw.net%2Fv1%2Fplaylist%2Fabc.m3u8\n');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('proxies a Twitch variant playlist and refuses any other target', async () => {
  const media = '#EXTM3U\n#EXTINF:2,\nhttps://cdn.hls.ttvnw.net/segment.ts\n';
  let requested;
  global.fetch = async url => { requested = String(url); return new Response(media); };
  const res = await request('/api/stream?playlist=' + encodeURIComponent('https://euc13.playlist.ttvnw.net/v1/playlist/abc.m3u8'));
  assert.equal(requested, 'https://euc13.playlist.ttvnw.net/v1/playlist/abc.m3u8');
  assert.equal(res.body, media);   // segments carry an open CORS policy and need no proxy
  assert.equal(res.headers['Content-Type'], 'application/vnd.apple.mpegurl');
  global.fetch = () => { throw new Error('Unexpected request'); };
  for (const target of ['https://evil.example/internal', 'http://euc13.playlist.ttvnw.net/x.m3u8', 'not-a-url', 'https://playlist.ttvnw.net.evil.example/x'])
    assert.deepEqual((await request('/api/stream?playlist=' + encodeURIComponent(target))).body, { error: 'INVALID_PLAYLIST_URL' });
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
