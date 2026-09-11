// Experimental anonymous playback. Helix does not expose live media URLs.
// The web client ID and persisted query are public, as used by Streamlink.
const clients = new Map();
module.exports = async function stream(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (status, error) => res.status(status).json({ error });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return fail(405, 'METHOD_NOT_ALLOWED');
  }
  const channel = new URL(req.url, 'http://localhost').searchParams.get('channel');
  if (!channel || !/^[a-zA-Z0-9_]{1,25}$/.test(channel)) return fail(400, 'INVALID_CHANNEL');
  const now = Date.now();
  for (const [key, entry] of clients) if (entry.until <= now) clients.delete(key);
  const ip = req.socket?.remoteAddress || 'unknown';
  const entry = clients.get(ip) || { count: 0, until: now + 60000 };
  if (entry.count >= 120 || (!clients.has(ip) && clients.size >= 10000)) return fail(429, 'RATE_LIMITED');
  entry.count++;
  clients.set(ip, entry);
  try {
    const response = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationName: 'PlaybackAccessToken',
        variables: { isLive: true, login: channel.toLowerCase(), isVod: false, vodID: '', playerType: 'embed', platform: 'site' },
        extensions: { persistedQuery: { version: 1, sha256Hash: 'ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9' } } })
    });
    if (!response.ok) return fail(502, 'PLAYBACK_ACCESS_DENIED');
    const data = await response.json();
    const token = data?.data?.streamPlaybackAccessToken;
    if (data.errors || typeof token?.value !== 'string' || typeof token?.signature !== 'string') return fail(502, 'PLAYBACK_ACCESS_DENIED');
    const url = new URL(`https://usher.ttvnw.net/api/v2/channel/hls/${channel.toLowerCase()}.m3u8`);
    url.search = new URLSearchParams({ token: token.value, sig: token.signature, allow_source: 'true',
      allow_audio_only: 'true', platform: 'web', supported_codecs: 'h264', playlist_include_framerate: 'true' }).toString();
    const playlist = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!playlist.ok) return fail(playlist.status === 404 ? 404 : 502, playlist.status === 404 ? 'STREAM_OFFLINE' : 'PLAYBACK_ACCESS_DENIED');
    const body = await playlist.text();
    if (!body.startsWith('#EXTM3U')) return fail(502, 'INVALID_PLAYLIST');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.end(body);
  } catch {
    return fail(502, 'STREAM_UNAVAILABLE');
  }
};
