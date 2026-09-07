/* Browser-side Twitch access. Guest searches go through our server; no secret reaches this file. */
const numberFormat = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
const validLogin = value => typeof value === 'string' && /^[a-z0-9_]{1,25}$/.test(value);
function readStored(key, fallback, storage = localStorage) {
  try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeStored(key, value, storage = localStorage) {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function channel(data) {
  const twitch = String(data.twitch || data.broadcaster_login || data.login || '').toLowerCase();
  return { twitch, display: data.display || data.broadcaster_name || data.display_name || twitch,
    profileUrl: /^https:\/\//.test(data.profileUrl || data.profile_image_url || data.thumbnail_url || '')
      ? (data.profileUrl || data.profile_image_url || data.thumbnail_url) : 'favicon.svg',
    online: data.online ?? data.is_live ?? null, game: data.game || data.game_name || '', title: data.title || '',
    viewersAmount: { number: data.viewer_count || 0, formatted: data.viewer_count == null ? '' : numberFormat.format(data.viewer_count) } };
}
class TwitchLibrary {
  constructor(clientId) { this.clientId = clientId; this.token = ''; this.user = null; this.profiles = new Map(); this.generation = 0; }
  async validate(token = this.token) {
    const generation = this.generation;
    const response = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${token}` }, signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error(response.status === 401 ? 'La session Twitch a expiré. Reconnecte-toi.' : 'Impossible de vérifier la connexion Twitch.');
    const user = await response.json();
    if (user.client_id !== this.clientId || !user.user_id || !user.scopes?.includes('user:read:follows')) {
      throw new Error('La connexion Twitch ne permet pas de lire les follows. Reconnecte-toi.');
    }
    if (generation !== this.generation) return null;
    this.token = token; this.user = user;
    writeStored('tg.session', token, sessionStorage);
    return user;
  }
  async connect() {
    const state = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
    if (!writeStored('tg.oauth', { state, at: Date.now() }, sessionStorage)) throw new Error('Autorise le stockage de session dans ton navigateur pour connecter Twitch.');
    const params = new URLSearchParams({ client_id: this.clientId, response_type: 'token',
      redirect_uri: location.origin, scope: 'user:read:follows', state });
    location.assign('https://id.twitch.tv/oauth2/authorize?' + params);
  }
  async resume() {
    const hash = new URLSearchParams(location.hash.slice(1));
    const query = new URLSearchParams(location.search);
    if (hash.has('access_token') || hash.has('error') || query.has('error')) {
      const params = hash.has('access_token') || hash.has('error') ? hash : query;
      history.replaceState(null, '', location.pathname);
      const pending = readStored('tg.oauth', null, sessionStorage);
      sessionStorage.removeItem('tg.oauth');
      if (params.get('error') === 'redirect_mismatch') throw new Error('La connexion Twitch n’est pas configurée pour cette adresse. L’adresse de retour doit être ajoutée dans les réglages de l’application Twitch.');
      if (!pending || params.get('state') !== pending.state || Date.now() - pending.at > 600000) throw new Error('Cette connexion Twitch n’est plus valide. Recommence depuis le bouton de connexion.');
      if (params.has('error')) throw new Error('Connexion Twitch annulée. Tu peux utiliser les favoris.');
      await this.validate(params.get('access_token'));
    } else {
      const token = readStored('tg.session', '', sessionStorage);
      if (token) await this.validate(token);
    }
  }
  disconnect() {
    this.generation++; this.token = ''; this.user = null;
    sessionStorage.removeItem('tg.session');
    sessionStorage.removeItem('tg.oauth');
  }
  async get(endpoint, params, signal) {
    const response = await fetch(`https://api.twitch.tv/helix/${endpoint}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${this.token}`, 'Client-Id': this.clientId }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000)
    });
    if (!response.ok) {
      const error = new Error(response.status === 401 ? 'La session Twitch a expiré. Reconnecte-toi.' : response.status === 429 ? 'Twitch reçoit trop de requêtes. Réessaie dans une minute.' : 'Twitch est indisponible pour le moment. Réessaie dans un instant.');
      error.status = response.status; throw error;
    }
    return response.json();
  }
  async follows() {
    const result = []; let after = '';
    do {
      const page = await this.get('channels/followed', { user_id: this.user.user_id, first: '100', ...(after ? { after } : {}) });
      result.push(...page.data.map(channel)); after = page.pagination?.cursor || '';
    } while (after);
    const missing = result.filter(s => !this.profiles.has(s.twitch)).map(s => s.twitch);
    for (let i = 0; i < missing.length; i += 100) {
      const page = await this.get('users', missing.slice(i, i + 100).map(login => ['login', login]));
      for (const user of page.data) this.profiles.set(user.login.toLowerCase(), channel(user));
    }
    return result.map(s => ({ ...s, profileUrl: this.profiles.get(s.twitch)?.profileUrl || s.profileUrl }));
  }
  async live(logins) {
    const result = new Map();
    for (let i = 0; i < logins.length; i += 100) {
      const batch = logins.slice(i, i + 100);
      if (this.user) {
        const page = await this.get('streams', [['first', '100'], ...batch.map(login => ['user_login', login])]);
        for (const stream of page.data) result.set(stream.user_login.toLowerCase(), stream);
      } else {
        const page = await this.guest(batch.map(login => ['login', login]));
        for (const stream of page.data) if (stream.is_live) result.set(stream.broadcaster_login, stream);
      }
    }
    return result;
  }
  async search(query, signal) {
    if (this.user) {
      const page = await this.get('search/channels', { query, first: '30' }, signal);
      return page.data.map(channel);
    }
    const page = await this.guest({ q: query }, signal);
    return page.data.map(channel);
  }
  async guest(params, signal) {
    const response = await fetch('/api/search?' + new URLSearchParams(params), {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      const error = new Error(response.status === 429 ? 'Trop de recherches. Réessaie dans une minute.' : 'La recherche Twitch est indisponible pour le moment. Tu peux ajouter un pseudo directement.');
      // A server credential error must never disconnect a visitor's Twitch session.
      error.status = response.status === 401 ? 502 : response.status;
      throw error;
    }
    return response.json();
  }
}
