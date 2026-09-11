// Experimental anonymous playback. Helix does not expose live media URLs.
// The web client ID and persisted query are public, as used by Streamlink.
// Twitch's playlist hosts refuse any Origin outside their own list, so a deployed page cannot fetch
// the variant playlists itself: they are rewritten through this endpoint, which sends no Origin.
// Media segments come from the CDN with an open CORS policy and keep going straight to the browser.
const clients = new Map();
const PLAYLIST_HOST = /^[a-z0-9-]+\.playlist\.ttvnw\.net$/;
module.exports = async function stream(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (status, error) => res.status(status).json({ error });
  const send = body => {
    if (!body.startsWith('#EXTM3U')) return fail(502, 'INVALID_PLAYLIST');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.end(body);
  };
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return fail(405, 'METHOD_NOT_ALLOWED');
  }
  const params = new URL(req.url, 'http://localhost').searchParams;
  const variant = params.get('playlist');
  const channel = params.get('channel');
  if (!variant && (!channel || !/^[a-zA-Z0-9_]{1,25}$/.test(channel))) return fail(400, 'INVALID_CHANNEL');
  const now = Date.now();
  for (const [key, entry] of clients) if (entry.until <= now) clients.delete(key);
  // behind a proxy the socket address is the proxy's own: count against the client it forwards for
  const client = req.headers?.['x-real-ip'] || String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress || 'unknown';
  // a playing tile reloads its variant playlist every few seconds; the token path stays rare
  const key = (variant ? 'playlist ' : 'channel ') + client;
  const limit = variant ? 600 : 120;
  const entry = clients.get(key) || { count: 0, until: now + 60000 };
  if (entry.count >= limit || (!clients.has(key) && clients.size >= 10000)) return fail(429, 'RATE_LIMITED');
  entry.count++;
  clients.set(key, entry);
  try {
    if (variant) {
      let target;
      try { target = new URL(variant); } catch { return fail(400, 'INVALID_PLAYLIST_URL'); }
      if (target.protocol !== 'https:' || !PLAYLIST_HOST.test(target.hostname)) return fail(400, 'INVALID_PLAYLIST_URL');
      const media = await fetch(target, { signal: AbortSignal.timeout(8000) });
      if (!media.ok) return fail(media.status === 404 ? 404 : 502, media.status === 404 ? 'STREAM_OFFLINE' : 'PLAYBACK_ACCESS_DENIED');
      return send(await media.text());
    }
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
    const path = req.url.split('?')[0];
    // only the variant lines are bare URLs; session data keeps its own quoted values
    return send((await playlist.text()).replace(/^https:\/\/\S+$/gm, line => `${path}?playlist=${encodeURIComponent(line)}`));
  } catch {
    return fail(502, 'STREAM_UNAVAILABLE');
  }
};
