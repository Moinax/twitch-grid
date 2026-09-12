// Only public channel metadata leaves this endpoint. Twitch credentials stay on the server.
let token, tokenRequest;
const cache = new Map(), pending = new Map(), clients = new Map();
const ttl = 60000;
let retryAt = 0;
class SearchError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
async function accessToken() {
  if (token && token.expiresAt > Date.now() + 60000) return token.value;
  if (!tokenRequest) tokenRequest = (async () => {
    const response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      body: new URLSearchParams({ client_id: process.env.TWITCH_SEARCH_CLIENT_ID,
        client_secret: process.env.TWITCH_SEARCH_CLIENT_SECRET, grant_type: 'client_credentials' })
    });
    if (!response.ok) throw new SearchError(503, 'SEARCH_UNAVAILABLE');
    const data = await response.json();
    if (!data.access_token || !Number.isFinite(data.expires_in)) throw new SearchError(502, 'TWITCH_UNAVAILABLE');
    token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return token.value;
  })().finally(() => { tokenRequest = null; });
  return tokenRequest;
}
async function helix(endpoint, params, retry = true) {
  const value = await accessToken();
  const response = await fetch('https://api.twitch.tv/helix/' + endpoint + '?' + new URLSearchParams(params), {
    headers: { Authorization: 'Bearer ' + value, 'Client-Id': process.env.TWITCH_SEARCH_CLIENT_ID },
    signal: AbortSignal.timeout(8000)
  });
  if (response.status === 401 && retry) {
    if (token?.value === value) token = null;
    return helix(endpoint, params, false);
  }
  if (response.status === 429) {
    retryAt = Math.max(Date.now() + 1000, Math.min(Date.now() + 60000, Number(response.headers.get('Ratelimit-Reset')) * 1000 || Date.now() + 60000));
    throw new SearchError(429, 'SEARCH_BUSY');
  }
  if (!response.ok) throw new SearchError(502, 'TWITCH_UNAVAILABLE');
  const data = await response.json();
  if (!Array.isArray(data.data)) throw new SearchError(502, 'TWITCH_UNAVAILABLE');
  return data.data;
}
async function channels(query) {
  const [matches, exact] = await Promise.all([
    helix('search/channels', { query, first: '30' }),
    /^[a-z0-9_]{1,25}$/i.test(query) ? helix('users', { login: query.toLowerCase() }) : []
  ]);
  const results = new Map(matches.map(s => [s.broadcaster_login, {
    broadcaster_login: s.broadcaster_login, display_name: s.display_name,
    thumbnail_url: s.thumbnail_url, is_live: s.is_live, game_name: s.game_name, title: s.title || '',
    started_at: s.started_at || ''
  }]));
  // Search Channels omits channels inactive for six months. Check their streams separately.
  const missing = exact.filter(user => !results.has(user.login));
  const live = missing.length ? await streams(missing.map(user => user.login)) : new Map();
  for (const user of missing) results.set(user.login, userChannel(user, live.get(user.login)));
  return { data: [...results.values()] };
}
async function streams(logins) {
  const data = await helix('streams', [['first', '100'], ...logins.map(login => ['user_login', login])]);
  return new Map(data.map(stream => [stream.user_login.toLowerCase(), stream]));
}
function userChannel(user, stream) {
  return { broadcaster_login: user.login, display_name: user.display_name,
    thumbnail_url: user.profile_image_url, preview_url: stream?.thumbnail_url || '', offline_image_url: user.offline_image_url || '', is_live: !!stream,
    game_name: stream?.game_name || '', title: stream?.title || '', viewer_count: stream?.viewer_count || 0,
    started_at: stream?.started_at || '' };
}
async function lookup(logins) {
  const [users, live] = await Promise.all([
    helix('users', logins.map(login => ['login', login])), streams(logins)
  ]);
  return { data: users.map(user => userChannel(user, live.get(user.login))) };
}
async function collaboration(login) {
  const [broadcaster] = await helix('users', { login });
  if (!broadcaster) return { data: [] };
  const [session] = await helix('shared_chat/session', { broadcaster_id: broadcaster.id });
  if (!session) return { data: [] };
  const ids = [...new Set(session.participants.map(p => p.broadcaster_id))];
  const data = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const [users, live] = await Promise.all([
      helix('users', batch.map(id => ['id', id])),
      helix('streams', [['first', '100'], ...batch.map(id => ['user_id', id])])
    ]);
    const streamsByLogin = new Map(live.map(s => [s.user_login, s]));
    data.push(...users.map(user => userChannel(user, streamsByLogin.get(user.login))));
  }
  return { data };
}
module.exports = async function search(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); }
  const params = new URL(req.url, 'https://twitch.moinax.com').searchParams;
  const query = params.get('q')?.trim();
  const logins = params.getAll('login').map(login => login.toLowerCase());
  const exact = params.has('login');
  const collaborative = params.has('collaboration');
  const collaborationLogin = params.get('collaboration')?.toLowerCase();
  const invalid = collaborative
    ? exact || params.has('q') || params.getAll('collaboration').length !== 1 || !/^[a-z0-9_]{1,25}$/.test(collaborationLogin)
    : exact
    ? params.has('q') || logins.length > 100 || logins.some(login => !/^[a-z0-9_]{1,25}$/.test(login))
    : !query || query.length < 2 || query.length > 100 || /[\x00-\x1f]/.test(query);
  if (invalid) return res.status(400).json({ error: 'INVALID_QUERY' });
  if (!process.env.TWITCH_SEARCH_CLIENT_ID || !process.env.TWITCH_SEARCH_CLIENT_SECRET) return res.status(503).json({ error: 'SEARCH_UNAVAILABLE' });
  const names = [...new Set(logins)].sort();
  const key = collaborative ? 'collaboration:' + collaborationLogin : exact ? 'logins:' + names.join(',') : 'query:' + query.toLowerCase(), now = Date.now();
  const respond = data => {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    res.setHeader('Vercel-CDN-Cache-Control', 'max-age=60');
    return res.status(200).json(data);
  };
  if (cache.get(key)?.expiresAt > now) return respond(cache.get(key).data);
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  for (const [client, value] of clients) if (value.resetAt <= now) clients.delete(client);
  if (!clients.has(ip)) {
    if (clients.size >= 1000) clients.delete(clients.keys().next().value);
    clients.set(ip, { count: 0, resetAt: now + ttl });
  }
  if (++clients.get(ip).count > 60 || retryAt > now) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'SEARCH_BUSY' });
  }
  try {
    if (!pending.has(key)) pending.set(key, (collaborative ? collaboration(collaborationLogin) : exact ? lookup(names) : channels(query)).finally(() => pending.delete(key)));
    const data = await pending.get(key);
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(key, { data, expiresAt: Date.now() + ttl });
    return respond(data);
  } catch (error) {
    if (error.status === 429) res.setHeader('Retry-After', '60');
    return res.status(error.status || 502).json({ error: error.code || 'TWITCH_UNAVAILABLE' });
  }
};
