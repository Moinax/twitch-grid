const { test, expect } = require('@playwright/test');
const mockPlayer = `window.Twitch = { Player: class {
  static READY = 'ready'; static PLAYING = 'playing';
  constructor(el, options) { this.options = options; this.muted = true; this.paused = true; this.volume = 0.5;
    this.listeners = {}; this.frame = document.createElement('iframe');
    this.frame.dataset.controls = String(options.controls); el.appendChild(this.frame); }
  addEventListener(event, callback) { (this.listeners[event] ||= []).push(callback);
    if (event === 'ready') setTimeout(() => { if (!this.destroyed) callback(); }, 0); }
  emit(event) { for (const callback of this.listeners[event] || []) callback(); }
  getPlayerState() { return { playback: this.paused ? 'Paused' : 'Playing' }; }
  setMuted(value) { this.muted = value; } getMuted() { return this.muted; }
  setVolume(value) { this.volume = value; } getVolume() { return this.volume; }
  setQuality(value) { this.quality = value; } getQuality() { return this.quality || 'auto'; }
  play() { if (this.paused) { this.paused = false; this.emit('play'); this.emit('playing'); } }
  pause() { if (!this.paused) { this.paused = true; this.emit('pause'); } }
  destroy() { this.destroyed = true; this.frame.remove(); this.listeners = {}; }
}};`;
async function setup(page, connected = false) {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://player.twitch.tv/js/embed/v1.js', r => r.fulfill({ contentType: 'text/javascript', body: mockPlayer }));
  await page.route('**/api/search?**', route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has('collaboration')) return route.fulfill({json:{data:[]}});
    if (params.has('login')) return route.fulfill({json:{data:params.getAll('login').map(login => ({broadcaster_login:login,is_live:false}))}});
    const login = params.get('q').toLowerCase();
    return route.fulfill({json:{data:[{broadcaster_login:login,display_name:login,is_live:false,game_name:'',thumbnail_url:''}]}});
  });
  await page.route('**/config.json', r => r.fulfill({ json: { twitchClientId: connected ? 'test-client' : '' } }));
  await page.route('**/_vercel/**', r => r.fulfill({ body: '' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '' }));
  return errors;
}
async function favorite(page, login) {
  await page.locator('#q').fill(login);
  const normalized = login.toLowerCase().replace(/^https?:\/\/(?:www\.)?twitch\.tv\//, '').replace(/\/$/, '');
  await page.locator(`#list [data-login="${normalized}"] .favorite`).click();
  await page.locator('#q').fill('');
}
test('favorites survive reload; grid, focus, sound and removal remain usable', async ({ page }) => {
  const errors = await setup(page); await page.goto('/');
  await expect(page.locator('#list-empty')).toBeHidden();
  await favorite(page, 'https://www.twitch.tv/ZeratoR/');
  await favorite(page, 'mistermv');
  await page.locator('[data-login="zerator"] .channel').click();
  await page.locator('[data-login="mistermv"] .channel').click();
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  await page.locator('#grid [data-login="zerator"] .player').click();
  await expect(page.locator('#grid [data-login="zerator"]')).toHaveClass(/big.*loud|loud.*big/);
  await page.locator('#playall').click();
  await page.reload();
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  await expect(page.locator('#grid [data-login="zerator"]')).toHaveClass(/big/);
  await expect(page.locator('#playall')).toHaveText('▶︎');
  await page.locator('#list [data-login="zerator"] .favorite').click();
  await expect(page.locator('#list li')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  await expect(page.locator('#list li')).toHaveCount(1);
  await page.locator('#grid .big .min').click();
  await page.locator('#grid [data-login="zerator"] .close').click();
  await expect(page.locator('#grid .tile')).toHaveCount(1);
  expect(errors).toEqual([]);
});
test('malformed storage and HTML in channel names do not break the app', async ({ page }) => {
  const errors = await setup(page);
  await page.addInitScript(() => { localStorage.setItem('tg.layout.guest', '{broken'); localStorage.setItem('tg.favorites', JSON.stringify([{ twitch: 'safe', display: '<img src=x onerror=alert(1)>' }, { twitch: '<script>' }])); });
  await page.goto('/');
  await expect(page.locator('#list .name')).toHaveText('<img src=x onerror=alert(1)>');
  await page.locator('#list .channel').click();
  await expect(page.locator('#grid .bar b')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#grid .bar b img')).toHaveCount(0);
  expect(errors).toEqual([]);
});
async function api(page) {
  await page.route('https://id.twitch.tv/oauth2/validate', r => r.fulfill({ json: { client_id: 'test-client', user_id: '42', login: 'moinax', scopes: ['user:read:follows'], expires_in: 3600 } }));
  await page.route('https://api.twitch.tv/helix/**', r => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith('/channels/followed')) return r.fulfill({ json: url.searchParams.has('after') ? { data: [{ broadcaster_login: 'offline', broadcaster_name: 'Offline' }], pagination: {} } : { data: [{ broadcaster_login: 'live', broadcaster_name: 'Live' }], pagination: { cursor: 'page2' } } });
    if (url.pathname.endsWith('/streams')) return r.fulfill({ json: { data: [{ user_login: 'live', game_name: 'Music', viewer_count: 1234 }] } });
    if (url.pathname.endsWith('/search/channels')) return r.fulfill({ json: { data: [{ broadcaster_login: 'found', display_name: 'Found', is_live: true, game_name: 'Art' }] } });
    return r.fulfill({ json: { data: [] } });
  });
}
test('OAuth callback validates state, loads every follows page, searches and disconnects', async ({ page }) => {
  const errors = await setup(page, true); await api(page);
  await page.addInitScript(() => { sessionStorage.setItem('tg.oauth', JSON.stringify({ state: 'expected', at: Date.now() })); localStorage.setItem('tg.favorites', JSON.stringify([{ twitch: 'saved' }])); });
  await page.goto('/#access_token=fake-token&state=expected');
  await expect(page.locator('#disconnect')).toBeVisible();
  await expect(page.locator('#connect')).toBeHidden();
  await expect(page.locator('#ctl #disconnect')).toBeVisible();
  expect(await page.locator('#disconnect').innerText()).toBe('');
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#top')).toBeHidden();
  await expect(page.locator('#guest')).toHaveText('Rechercher un streamer');
  expect(page.url()).not.toContain('access_token');
  await expect(page.locator('#list li')).toHaveCount(2);
  await expect(page.locator('#list li').first()).toHaveAttribute('data-login', 'live');
  await expect(page.locator('[data-login="offline"] .g')).toHaveText('Hors ligne');
  await page.locator('#q').fill('found');
  await expect(page.locator('#list [data-login="found"]')).toBeVisible();
  await expect(page.locator('#list .favorite:visible')).toHaveCount(0);
  await expect(page.locator('#add-login')).toBeHidden();
  await expect(page.locator('#side')).not.toContainText('Favoris');
  await page.locator('#list [data-login="found"] .channel').click();
  await page.locator('#clear-search').click();
  await page.locator('#list [data-login="live"] .channel').click();
  await page.locator('#grid [data-login="found"] .player').click();
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  await page.evaluate(() => { window.openPlayers = [...tiles.values()].map(t => t.player); });
  await page.locator('#toggle').click();
  await expect(page.locator('#disconnect')).toBeVisible();
  await page.locator('#disconnect').click();
  await expect(page.locator('#connect')).toBeVisible();
  await expect(page.locator('#disconnect')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.connected')).order)).toEqual(['found', 'live']);
  await expect(page.locator('#grid .tile')).toHaveCount(0);
  await expect(page.locator('#empty')).toBeVisible();
  expect(await page.evaluate(() => window.openPlayers.every(player => player.destroyed))).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')).order)).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem('tg.session'))).toBeNull();
  await page.locator('#q').fill('');
  await expect(page.locator('#list li')).toHaveCount(1);
  await expect(page.locator('#list li')).toHaveAttribute('data-login', 'saved');
  await expect(page.locator('#list .favorite')).toBeVisible();
  await page.reload();
  await expect(page.locator('#grid .tile')).toHaveCount(0);
  await expect(page.locator('#empty')).toBeVisible();
  expect(errors).toEqual([]);
});
test('disconnect before the player script loads restores guest tiles without changing the connected layout', async ({ page }) => {
  await setup(page, true); await api(page);
  await page.addInitScript(() => {
    sessionStorage.setItem('tg.session', JSON.stringify('valid'));
    localStorage.setItem('tg.layout.connected', JSON.stringify({order:['one','two'],focused:'one'}));
    localStorage.setItem('tg.layout.guest', JSON.stringify({order:['saved']}));
  });
  let pendingPlayer;
  await page.route('https://player.twitch.tv/js/embed/v1.js', r => { pendingPlayer = r; });
  await page.goto('/', {waitUntil:'domcontentloaded'});
  await page.locator('#disconnect').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.connected')).order)).toEqual(['one','two']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')).order)).toEqual(['saved']);
  await pendingPlayer.fulfill({contentType:'text/javascript',body:mockPlayer});
  await expect(page.locator('#grid .tile')).toHaveCount(1);
  await expect(page.locator('#grid .tile')).toHaveAttribute('data-login','saved');
});
test('guest and connected layouts restore their own tiles and settings across mode changes and reloads', async ({ page }) => {
  const errors = await setup(page, true); await api(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('tg.layout.guest')) localStorage.setItem('tg.layout.guest', JSON.stringify({
      order:['guesttwo','guestone'], focused:'guestone', allPaused:true, collapsed:false,
      muted:{guestone:false,guesttwo:true}, volume:{guestone:0.25,guesttwo:0.75},
      pinned:{guestone:true}, paused:{guesttwo:true}
    }));
  });
  await page.route('https://id.twitch.tv/oauth2/authorize?**', r => r.fulfill({body:'Twitch authorization'}));
  const connect = async () => {
    await page.locator('#connect').click();
    await page.waitForURL('https://id.twitch.tv/oauth2/authorize?**');
    const state = new URL(page.url()).searchParams.get('state');
    await page.goto('/#access_token=fake-token&state='+state);
    await expect(page.locator('#disconnect')).toBeVisible();
  };
  await page.goto('/');
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  const guest = await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')));
  await connect();
  await expect(page.locator('#grid .tile')).toHaveCount(0);
  await expect(page.locator('#empty')).toBeVisible();
  await page.locator('#list [data-login="live"] .channel').click();
  await page.locator('#list [data-login="offline"] .channel').click();
  await page.locator('#grid [data-login="live"] .player').click();
  await page.locator('#playall').click();
  await page.locator('#toggle').click();
  const connected = await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.connected')));
  expect(connected.order).toEqual(['live','offline']);
  expect(connected.focused).toBe('live');
  expect(connected.allPaused).toBe(true);
  expect(connected.collapsed).toBe(true);
  await page.locator('#disconnect').click();
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  await expect(page.locator('#grid .big')).toHaveAttribute('data-login','guestone');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')))).toEqual(guest);
  await page.reload();
  await expect(page.locator('#grid .big')).toHaveAttribute('data-login','guestone');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')))).toEqual(guest);
  await connect();
  await expect(page.locator('#grid .big')).toHaveAttribute('data-login','live');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.connected')))).toEqual(connected);
  await page.reload();
  await expect(page.locator('#grid .big')).toHaveAttribute('data-login','live');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.connected')))).toEqual(connected);
  expect(errors).toEqual([]);
});
test('layout restoration waits for Twitch session validation before choosing a mode', async ({ page }) => {
  await setup(page, true); await api(page);
  await page.addInitScript(() => {
    sessionStorage.setItem('tg.session', JSON.stringify('valid'));
    localStorage.setItem('tg.favorites', JSON.stringify([{twitch:'guest'}]));
    localStorage.setItem('tg.layout.guest', JSON.stringify({order:['guest']}));
    localStorage.setItem('tg.layout.connected', JSON.stringify({order:['live']}));
  });
  let validation;
  await page.route('https://id.twitch.tv/oauth2/validate', r => { validation = r; });
  await page.goto('/', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!window.Twitch?.Player);
  await expect(page.locator('#list .channel')).toBeDisabled();
  await expect(page.locator('#grid .tile')).toHaveCount(0);
  await validation.fulfill({json:{client_id:'test-client',user_id:'42',login:'moinax',scopes:['user:read:follows']}});
  await expect(page.locator('#grid .tile')).toHaveAttribute('data-login','live');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')).order)).toEqual(['guest']);
});
test('legacy layout migrates once into the active mode', async ({ page }) => {
  await setup(page, true); await api(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('tg.layout.connected')) {
      sessionStorage.setItem('tg.session', JSON.stringify('valid'));
      localStorage.setItem('tg.layout', JSON.stringify({order:['legacy']}));
    }
  });
  await page.goto('/');
  await expect(page.locator('#grid .tile')).toHaveAttribute('data-login','legacy');
  expect(await page.evaluate(() => localStorage.getItem('tg.layout'))).toBeNull();
  await page.locator('#disconnect').click();
  await expect(page.locator('#grid .tile')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.connected')).order)).toEqual(['legacy']);
});
test('OAuth rejects an unexpected state without using the token', async ({ page }) => {
  await setup(page, true);
  let validations = 0;
  await page.route('https://id.twitch.tv/oauth2/validate', r => { validations++; return r.abort(); });
  await page.goto('/#access_token=untrusted&state=wrong');
  await expect(page.locator('#notice')).toContainText('n’est plus valide');
  expect(page.url()).not.toContain('access_token');
  expect(validations).toBe(0);
});
test('Twitch redirect mismatch keeps favorites and the connection button usable', async ({ page }) => {
  await setup(page, true);
  await page.addInitScript(() => {
    localStorage.setItem('tg.favorites', JSON.stringify([{twitch:'altair'}]));
    localStorage.setItem('tg.guest', 'true');
    sessionStorage.setItem('tg.oauth', JSON.stringify({state:'expected',at:Date.now()}));
  });
  await page.route('https://id.twitch.tv/oauth2/authorize?**', r => r.fulfill({body:'Twitch authorization'}));
  await page.goto('/?error=redirect_mismatch&state=expected');
  await expect(page.locator('#notice')).toContainText('pas configurée pour cette adresse');
  expect(page.url()).not.toContain('error=');
  await expect(page.locator('#list [data-login="altair"]')).toBeVisible();
  await expect(page.locator('#connect')).toBeEnabled();
  await page.locator('#connect').click();
  await page.waitForURL('https://id.twitch.tv/oauth2/authorize?**');
  expect(new URL(page.url()).searchParams.get('redirect_uri')).toBe('http://localhost:8767');
});
test('a slow Twitch player script does not block account setup or overwrite the saved layout', async ({ page }) => {
  const errors = await setup(page, true);
  await page.addInitScript(() => {
    localStorage.setItem('tg.favorites', JSON.stringify([{twitch:'altair'}]));
    localStorage.setItem('tg.layout.guest', JSON.stringify({order:['altair'],paused:{altair:true}}));
  });
  let pendingPlayer;
  await page.route('https://player.twitch.tv/js/embed/v1.js', r => { pendingPlayer = r; });
  await page.goto('/', {waitUntil:'domcontentloaded'});
  await expect(page.locator('#top')).toBeEnabled();
  await expect(page.locator('#connect')).toBeVisible();
  await expect(page.locator('#list [data-login="altair"]')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')).order)).toEqual(['altair']);
  await pendingPlayer.fulfill({contentType:'text/javascript',body:mockPlayer});
  await expect(page.locator('#grid [data-login="altair"] iframe')).toBeVisible();
  expect(await page.evaluate(() => tiles.get('altair').paused)).toBe(true);
  expect(errors).toEqual([]);
});
test('Twitch login still opens when the player script fails', async ({ page }) => {
  await setup(page, true);
  await page.route('https://player.twitch.tv/js/embed/v1.js', r => r.abort());
  await page.route('https://id.twitch.tv/oauth2/authorize?**', r => r.fulfill({body:'Twitch authorization'}));
  await page.goto('/');
  await expect(page.locator('#notice')).toContainText('lecteur Twitch est indisponible');
  await page.locator('#top').click();
  await page.waitForURL('https://id.twitch.tv/oauth2/authorize?**');
});
test('expired sessions fall back to saved favorites', async ({ page }) => {
  await setup(page, true);
  await page.addInitScript(() => { sessionStorage.setItem('tg.session', JSON.stringify('expired')); localStorage.setItem('tg.favorites', JSON.stringify([{ twitch: 'saved' }])); });
  await page.route('https://id.twitch.tv/oauth2/validate', r => r.fulfill({ status: 401, json: {} }));
  await page.goto('/');
  await expect(page.locator('#notice')).toContainText('expiré');
  await expect(page.locator('#list [data-login="saved"]')).toBeVisible();
  await expect(page.locator('#connect')).toBeVisible();
});
test('follows and live status refresh after a minute', async ({ page }) => {
  await setup(page, true); await api(page);
  await page.addInitScript(() => sessionStorage.setItem('tg.session', JSON.stringify('valid')));
  await page.clock.install(); await page.goto('/');
  await expect(page.locator('#list li')).toHaveCount(2);
  await page.route('https://api.twitch.tv/helix/channels/followed?**', r => r.fulfill({ json: { data: [{ broadcaster_login: 'newfollow', broadcaster_name: 'NewFollow' }], pagination: {} } }));
  await page.clock.fastForward(91000);
  await expect(page.locator('#list li')).toHaveCount(1);
  await expect(page.locator('#list li')).toHaveAttribute('data-login', 'newfollow');
});
test('saved favorites load their status without login and refresh after a stream ends', async ({ page }) => {
  const errors = await setup(page);
  await page.addInitScript(() => localStorage.setItem('tg.favorites', JSON.stringify([
    { twitch: 'altair', display: 'Altair' }, { twitch: 'live', display: 'Live' }
  ])));
  let online = true;
  const batches = [];
  await page.route('**/api/search?login=**', route => {
    const logins = new URL(route.request().url()).searchParams.getAll('login');
    batches.push(logins);
    return route.fulfill({ json: { data: logins.map(login => ({ broadcaster_login: login,
      is_live: login === 'live' && online, game_name: login === 'live' && online ? 'Art' : '', viewer_count: 42 })) } });
  });
  await page.clock.install(); await page.goto('/');
  await expect(page.locator('[data-login="altair"] .g')).toHaveText('Hors ligne');
  await expect(page.locator('[data-login="altair"]')).toHaveClass(/off/);
  await expect(page.locator('[data-login="live"] .g')).toHaveText('En direct · Art');
  expect(batches).toEqual([['altair', 'live']]);
  online = false;
  await page.clock.fastForward(31000);
  await expect(page.locator('[data-login="live"] .g')).toHaveText('Hors ligne');
  await page.reload();
  await expect(page.locator('[data-login="altair"] .g')).toHaveText('Hors ligne');
  expect(errors).toEqual([]);
});
test('failed favorite status checks stay unknown and recover on the next refresh', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem('tg.favorites', JSON.stringify([{ twitch: 'altair' }])));
  await page.route('**/api/search?login=**', route => route.fulfill({ status: 503, json: { error: 'TWITCH_UNAVAILABLE' } }));
  await page.clock.install(); await page.goto('/');
  await expect(page.locator('#notice')).toContainText('Impossible d’actualiser');
  await expect(page.locator('[data-login="altair"]')).not.toHaveClass(/off/);
  await page.route('**/api/search?login=**', route => route.fulfill({ json: { data: [{ broadcaster_login: 'altair', is_live: false }] } }));
  await page.clock.fastForward(31000);
  await expect(page.locator('[data-login="altair"] .g')).toHaveText('Hors ligne');
  await expect(page.locator('#notice')).toBeEmpty();
});
test('mobile sidebar opens for search and closes when a stream is selected', async ({ page }) => {
  const errors = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/collapsed/);
  await page.locator('#guest').click();
  await expect(page.locator('#q')).toBeFocused();
  await favorite(page, 'zerator');
  await page.locator('#list .channel').click();
  await expect(page.locator('body')).toHaveClass(/collapsed/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});
test('one tile has native controls without spotlight and switches back after adding or removing a second', async ({ page }) => {
  const errors = await setup(page); await page.clock.install(); await page.goto('/');
  await favorite(page, 'one'); await favorite(page, 'two');
  await page.locator('#list [data-login="one"] .channel').click();
  const one = page.locator('#grid [data-login="one"]');
  await expect(one.locator('iframe')).toHaveAttribute('data-controls', 'true');
  await expect(one.locator('.ctl')).toBeHidden();
  await expect(one.locator('.spotlight')).toBeHidden();
  await expect(one.locator('.close')).toBeVisible();
  await expect(one.locator('.fs')).toBeVisible();
  await expect(page.locator('#grid')).not.toHaveClass(/focused/);
  expect(await one.locator('.player').evaluate(el => getComputedStyle(el, '::after').content)).toBe('none');
  await page.clock.runFor(2500);
  await page.evaluate(() => { window.singlePlayer = tiles.get('one').player; });
  await one.locator('.bar b').click();
  expect(await page.evaluate(() => tiles.get('one').player === window.singlePlayer && pins.length === 0)).toBe(true);
  const bounds = await one.boundingBox(), gridBounds = await page.locator('#grid').boundingBox();
  expect(bounds.width).toBeCloseTo(gridBounds.width, 0);
  await page.evaluate(() => { const p = tiles.get('one').player; p.pause(); p.setVolume(0.25); p.setMuted(true); p.setQuality('720p60'); });
  await page.locator('#list [data-login="two"] .channel').click();
  await expect(page.locator('#grid iframe[data-controls="false"]')).toHaveCount(2);
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => ({ paused:tiles.get('one').paused, volume:tiles.get('one').volume, muted:tiles.get('one').muted })))
    .toEqual({paused:true,volume:0.25,muted:true});
  await page.locator('#grid [data-login="two"] .close').click();
  await expect(one.locator('iframe')).toHaveAttribute('data-controls', 'true');
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => ({ paused:tiles.get('one').player.paused, quality:tiles.get('one').player.getQuality() })))
    .toEqual({paused:true,quality:'720p60'});
  await page.reload();
  await expect(one.locator('iframe')).toHaveAttribute('data-controls', 'true');
  await expect(page.locator('#grid')).not.toHaveClass(/focused/);
  await one.locator('.close').click();
  await expect(page.locator('#grid .tile')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('removing the second tile clears a saved spotlight without recreating the remaining full player', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem('tg.layout.guest', JSON.stringify({order:['one','two'],focused:'one'})));
  await page.goto('/');
  await expect(page.locator('#grid')).toHaveClass(/focused/);
  await page.evaluate(() => { window.singlePlayer = tiles.get('one').player; });
  await page.locator('#grid [data-login="two"] .close').click();
  await expect(page.locator('#grid')).not.toHaveClass(/focused/);
  await expect(page.locator('#grid .spotlight')).toBeHidden();
  expect(await page.evaluate(() => tiles.get('one').player === window.singlePlayer)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')).pins)).toEqual([]);
});
test('pins keep tiles in front beside a single spotlight, each with full controls', async ({ page }) => {
  const errors = await setup(page); await page.goto('/');
  for (const login of ['one', 'two', 'three']) { await favorite(page, login); await page.locator(`#list [data-login="${login}"] .channel`).click(); }
  const one = page.locator('#grid [data-login="one"]'), two = page.locator('#grid [data-login="two"]'), three = page.locator('#grid [data-login="three"]');
  // the sidebar fills a plain grid; a click on a tile makes it the spotlight
  await expect(page.locator('#grid')).not.toHaveClass(/focused/);
  await expect(page.locator('#grid .tile iframe[data-controls="false"]')).toHaveCount(3);
  await three.locator('.player').click();
  await expect(three.locator('iframe')).toHaveAttribute('data-controls', 'true');
  await expect(two.locator('iframe')).toHaveAttribute('data-controls', 'false');
  await expect(page.locator('#grid')).toHaveClass(/focused/);
  await expect(three.locator('.spotlight')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => ({ focused, pins, muted: [...tiles.values()].map(t => t.muted) }))).toEqual({ focused: 'three', pins: [], muted: [true, true, false] });
  const alone = await three.boundingBox();
  // pinning the spotlight frees it: the next side tile joins the pinned one in front, with the sound
  await three.locator('.spotlight').click();
  await expect(three.locator('.spotlight')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => ({ focused, pins }))).toEqual({ focused: null, pins: ['three'] });
  await page.evaluate(() => { window.pinnedPlayer = tiles.get('three').player; });
  await one.locator('.player').click();
  await expect(one.locator('iframe')).toHaveAttribute('data-controls', 'true');
  await expect(three.locator('iframe')).toHaveAttribute('data-controls', 'true');
  expect(await page.evaluate(() => ({ focused, pins, muted: [...tiles.values()].map(t => t.muted) }))).toEqual({ focused: 'one', pins: ['three'], muted: [false, true, false] });
  // the front tiles split the box left of the side column, the spotlight after the pinned ones; the small tile keeps its column
  const a = await three.boundingBox(), b = await one.boundingBox(), c = await two.boundingBox();
  expect(a.width).toBeCloseTo(alone.width, 0); expect(a.height + b.height).toBeLessThanOrEqual(alone.height);
  expect(b.y).toBeGreaterThan(a.y + a.height - 1); expect(c.x).toBeGreaterThan(a.x + a.width);
  // tiles in front trade the remove button for a way back to the grid, which drops the pin as well
  for (const tile of [one, three]) { await expect(tile.locator('.close')).toBeHidden(); await expect(tile.locator('.min')).toBeVisible(); }
  await expect(two.locator('.min')).toBeHidden(); await expect(two.locator('.close')).toBeVisible();
  await three.locator('.min').click();
  expect(await page.evaluate(() => ({ focused, pins, muted: tiles.get('three').muted }))).toEqual({ focused: 'one', pins: [], muted: true });
  await three.locator('.spotlight').click();
  await page.evaluate(() => { window.pinnedPlayer = tiles.get('three').player; });
  expect(await page.evaluate(() => ({ focused, pins }))).toEqual({ focused: 'one', pins: ['three'] });
  // another side tile replaces the unpinned spotlight, never the pinned one
  await two.locator('.player').click();
  await expect(two.locator('iframe')).toHaveAttribute('data-controls', 'true');
  await expect(one.locator('iframe')).toHaveAttribute('data-controls', 'false');
  expect(await page.evaluate(() => ({ focused, pins, muted: [...tiles.values()].map(t => t.muted) }))).toEqual({ focused: 'two', pins: ['three'], muted: [true, false, false] });
  // with pins in front, a stream from the sidebar joins the side
  await favorite(page, 'four'); await page.locator('#list [data-login="four"] .channel').click();
  const four = page.locator('#grid [data-login="four"]');
  await expect(four.locator('iframe')).toHaveAttribute('data-controls', 'false');
  expect(await page.evaluate(() => focused)).toBe('two');
  expect(await page.evaluate(() => tiles.get('three').player === window.pinnedPlayer)).toBe(true);
  // Escape drops the spotlight first, then the pins (once the sidebar preview is out of the way)
  await page.locator('#q').focus(); await expect.poll(() => page.evaluate(() => previewRow)).toBeNull();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => ({ focused, pins }))).toEqual({ focused: null, pins: ['three'] });
  expect((await three.boundingBox()).height).toBeCloseTo(alone.height, 0);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => ({ focused, pins, muted: [...tiles.values()].map(t => t.muted) }))).toEqual({ focused: null, pins: [], muted: [true, true, true, true] });
  await expect(page.locator('#grid')).not.toHaveClass(/focused/);
  await expect(page.locator('#grid .tile iframe[data-controls="false"]')).toHaveCount(4);
  // everyone pinned is a plain grid of full players; unpinning with a free spotlight keeps the tile in front
  for (const tile of [one, two, three, four]) await tile.locator('.spotlight').click();
  await expect(page.locator('#grid .tile iframe[data-controls="true"]')).toHaveCount(4);
  await expect(page.locator('#grid')).not.toHaveClass(/focused/);
  await four.locator('.spotlight').click();
  expect(await page.evaluate(() => ({ focused, pins }))).toEqual({ focused: 'four', pins: ['one', 'two', 'three'] });
  await expect(page.locator('#grid .tile iframe[data-controls="true"]')).toHaveCount(4);
  // unpinning with a spotlight already taken keeps the tile in front and sends the former spotlight aside
  await one.locator('.spotlight').click();
  expect(await page.evaluate(() => ({ focused, pins, muted: [...tiles.values()].map(t => t.muted) }))).toEqual({ focused: 'one', pins: ['two', 'three'], muted: [false, false, false, true] });
  await expect(four.locator('iframe')).toHaveAttribute('data-controls', 'false');
  await expect(one.locator('iframe')).toHaveAttribute('data-controls', 'true');
  expect(errors).toEqual([]);
});
test('tiles drag onto any other tile, sliding within a row and trading roles across rows', async ({ page }) => {
  const errors = await setup(page);
  await page.addInitScript(() => localStorage.setItem('tg.layout.guest', JSON.stringify({ order: ['one', 'two', 'three', 'four'], focused: 'one', pins: ['two', 'three'] })));
  await page.goto('/');
  const tile = login => page.locator(`#grid [data-login="${login}"]`);
  const state = () => page.evaluate(() => ({ order, focused, pins, muted: Object.fromEntries([...tiles].map(([login, t]) => [login, t.muted])) }));
  // the spotlight never drags; every other tile does, and its bar says so
  expect(await page.evaluate(() => [...tiles].map(([login, t]) => [login, t.bar.draggable]))).toEqual([['one', false], ['two', true], ['three', true], ['four', true]]);
  await expect(tile('one').locator('.bar')).toHaveCSS('cursor', 'default');
  await expect(tile('two').locator('.bar')).toHaveCSS('cursor', 'grab');
  // every other tile shows a drop zone, brighter under the cursor
  await page.evaluate(() => tiles.get('two').bar.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() })));
  await expect(page.locator('body')).toHaveClass(/dragging/);
  await expect(tile('one').locator('.drop')).toBeVisible(); await expect(tile('four').locator('.drop')).toHaveText('Déposer ici');
  await expect(tile('two').locator('.drop')).toBeHidden();
  await page.evaluate(() => tiles.get('four').el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })));
  await expect(tile('four')).toHaveClass(/over/);
  await page.evaluate(() => document.dispatchEvent(new DragEvent('dragend', { bubbles: true })));
  await expect(page.locator('.drop-target')).toHaveCount(0);
  // within a row the tile slides: after the target going down, before it going up; the pinned row has its own order
  await tile('three').locator('.bar').dragTo(tile('two'));
  expect(await state()).toMatchObject({ order: ['one', 'two', 'three', 'four'], pins: ['three', 'two'] });
  await tile('three').locator('.bar').dragTo(tile('two'));
  expect(await state()).toMatchObject({ order: ['one', 'two', 'three', 'four'], pins: ['two', 'three'] });
  await tile('four').locator('.bar').dragTo(tile('one'));   // the spotlight is not a side tile: this is a role swap, see below
  // across rows the dropped tile takes the slot and role of the one it replaces, the grid order never moves, the sound follows the front
  expect(await state()).toEqual({ order: ['one', 'two', 'three', 'four'], focused: 'four', pins: ['two', 'three'], muted: { one: true, two: true, three: true, four: false } });
  await favorite(page, 'five'); await page.locator('#list [data-login="five"] .channel').click();
  await tile('five').locator('.bar').dragTo(tile('two'));
  expect(await state()).toEqual({ order: ['one', 'two', 'three', 'four', 'five'], focused: 'four', pins: ['five', 'three'], muted: { one: true, two: true, three: true, four: false, five: false } });
  await expect(tile('five').locator('iframe')).toHaveAttribute('data-controls', 'true');
  await expect(tile('two').locator('iframe')).toHaveAttribute('data-controls', 'false');
  await tile('three').locator('.bar').dragTo(tile('four'));
  expect(await state()).toEqual({ order: ['one', 'two', 'three', 'four', 'five'], focused: 'three', pins: ['five', 'four'], muted: { one: true, two: true, three: true, four: false, five: false } });
  // with everything in front the grid shows the front order: the pins first, the spotlight last
  await tile('one').locator('.spotlight').click(); await tile('two').locator('.spotlight').click();
  await expect(page.locator('#grid')).not.toHaveClass(/focused/);
  expect(await page.evaluate(() => Object.fromEntries([...tiles].map(([login, t]) => [login, +t.el.style.order])))).toEqual({ five: 0, four: 1, one: 2, two: 3, three: 4 });
  expect((await state()).order).toEqual(['one', 'two', 'three', 'four', 'five']);
  expect(errors).toEqual([]);
});
test('a portrait grid keeps the small tiles in a strip under the front row', async ({ page }) => {
  const errors = await setup(page);
  await page.addInitScript(() => localStorage.setItem('tg.layout.guest', JSON.stringify({ order: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'], focused: 'one', collapsed: true })));
  await page.setViewportSize({ width: 640, height: 1100 });
  await page.goto('/');
  const one = page.locator('#grid [data-login="one"]'), two = page.locator('#grid [data-login="two"]'), three = page.locator('#grid [data-login="three"]');
  await expect(page.locator('#grid')).toHaveClass(/below/);
  const gridBox = await page.locator('#grid').boundingBox(), a = await one.boundingBox(), b = await two.boundingBox(), c = await three.boundingBox();
  expect(a.width).toBeCloseTo(gridBox.width, 0);
  expect(b.y).toBeGreaterThan(a.y + a.height - 1); expect(c.y).toBeCloseTo(b.y, 0); expect(c.x).toBeGreaterThan(b.x);
  expect(b.y + b.height).toBeLessThanOrEqual(gridBox.y + gridBox.height + 1);
  await expect(one.locator('iframe')).toHaveAttribute('data-controls', 'true');
  // a small tile scrolled under the front row stays underneath, frame included
  await page.evaluate(() => { grid.scrollTop = grid.scrollHeight; });
  expect(await page.evaluate(() => grid.scrollTop)).toBeGreaterThan(0);
  const point = { x: a.x + a.width / 2, y: a.y + a.height - 10 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).closest('.tile')?.dataset.login, point)).toBe('one');
  await page.evaluate(() => { grid.scrollTop = 0; });
  // back to a landscape box: the column returns
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('#grid')).not.toHaveClass(/below/);
  await expect.poll(async () => { const a = await one.boundingBox(), b = await two.boundingBox(); return b.x > a.x + a.width && b.y < a.y + 1; }).toBe(true);
  expect(errors).toEqual([]);
});
test('the mute-all button silences every stream and gives the sound back to those that had it', async ({ page }) => {
  const errors = await setup(page);
  await page.addInitScript(() => localStorage.setItem('tg.layout.guest', JSON.stringify({ order: ['one', 'two', 'three'], focused: 'one', muted: { one: false, two: false, three: true }, pinned: { two: true } })));
  await page.goto('/'); await page.locator('#audio-overlay').click();
  const button = page.locator('#muteall'), state = () => page.evaluate(() => ({ mutedAll, muted: [...tiles.values()].map(t => t.muted), pinned: tiles.get('two').pinned }));
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveAttribute('title', 'Réactiver le son');
  expect(await state()).toEqual({ mutedAll: ['one', 'two'], muted: [true, true, true], pinned: true });
  // the global mute outranks the spotlight: the tile coming to the front stays silent, the set follows the intent
  await page.locator('#grid [data-login="three"] .player').click();
  await expect(page.locator('#grid [data-login="three"]')).toHaveClass(/big/);
  expect(await state()).toEqual({ mutedAll: ['two', 'three'], muted: [true, true, true], pinned: true });
  await expect.poll(() => page.evaluate(() => !tiles.get('three').player.paused)).toBe(true);   // silent in front still plays
  await page.locator('#grid [data-login="one"] .player').click();
  expect(await state()).toEqual({ mutedAll: ['two', 'one'], muted: [true, true, true], pinned: true });
  await page.evaluate(() => { const p = tiles.get('one').player; p.setMuted(false); });   // a native unmute is silenced again
  await expect.poll(() => page.evaluate(() => tiles.get('one').player.getMuted())).toBe(true);
  await page.reload();   // the saved set survives a reload
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(await state()).toEqual({ mutedAll: ['two', 'one'], muted: [true, true, true], pinned: true });
  // no audio prompt while the global mute holds, even if a tile saved itself audible in the meantime
  await page.evaluate(() => { const layout = JSON.parse(localStorage.getItem('tg.layout.guest')); layout.muted.one = false; localStorage.setItem('tg.layout.guest', JSON.stringify(layout)); });
  await page.reload();
  await expect(page.locator('#grid .tile')).toHaveCount(3);
  await expect(page.locator('#audio-overlay')).toBeHidden();
  expect(await state()).toEqual({ mutedAll: ['two', 'one'], muted: [true, true, true], pinned: true });
  await button.click();   // the button itself is the gesture that allows the sound back
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(await state()).toEqual({ mutedAll: null, muted: [false, false, true], pinned: true });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')).mutedAll)).toBeNull();
  expect(errors).toEqual([]);
});
test('a locked grid refuses new streams until unlocked and remembers it', async ({ page }) => {
  const errors = await setup(page);
  await page.addInitScript(() => localStorage.setItem('tg.layout.guest', JSON.stringify({ order: ['one'] })));
  await page.goto('/'); await favorite(page, 'two');
  const lock = page.locator('#grid-lock'), two = page.locator('#list [data-login="two"] .channel');
  await expect(lock).toHaveAttribute('aria-pressed', 'false');
  await lock.click();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await expect(lock).toHaveAttribute('title', 'Déverrouiller la grille');
  await expect(two).toBeDisabled();
  await expect(two).toHaveAttribute('title', 'Grille verrouillée');
  expect(await page.evaluate(() => add({ twitch: 'two', display: 'Two', profileUrl: '' }))).toBe(false);
  await expect(page.locator('#grid .tile')).toHaveCount(1);
  await expect(page.locator('#notice')).toHaveText('Grille verrouillée : déverrouille-la pour ajouter un stream.');
  await page.reload();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await expect(two).toBeDisabled();
  await page.locator('#grid-switcher summary').click();
  await expect(page.locator('#grid-menu-list .open-grid small')).toHaveText('Grille actuelle · verrouillée');
  await page.keyboard.press('Escape');
  await lock.click();
  await expect(two).toBeEnabled();
  await two.click();
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')).locked)).toBe(false);
  expect(errors).toEqual([]);
});
test('tile controls appear on hover or keyboard focus and adjusting volume enables and saves sound', async ({ page }) => {
  const errors = await setup(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('tg.layout.guest')) localStorage.setItem('tg.layout.guest', JSON.stringify({order:['one','two'],paused:{one:true}}));
  });
  await page.goto('/');
  const one=page.locator('#grid [data-login="one"]'),two=page.locator('#grid [data-login="two"]');
  const volume=one.locator('.ctl input');
  await page.locator('#q').hover();
  await expect(one.locator('.ctl')).toBeHidden();
  await expect(volume).toBeHidden();
  await one.hover();
  await expect(one.locator('.ctl button').first()).toBeVisible();
  await expect(volume).toBeVisible();
  await expect(one.locator('.ctl output')).toBeVisible();
  await expect(two.locator('.ctl input')).toBeHidden();
  await volume.focus();
  await volume.press('ArrowRight');
  await expect(volume).toHaveValue('0.55');
  await expect(one).toHaveClass(/loud/);
  await expect(one.locator('.bar .snd')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(() => {
    const t=tiles.get('one');
    return {muted:t.muted,playerMuted:t.player.getMuted(),volume:t.player.getVolume(),paused:t.paused,otherMuted:tiles.get('two').muted,pins};
  })).toEqual({muted:false,playerMuted:false,volume:0.55,paused:true,otherMuted:true,pins:[]});
  await page.locator('#q').focus();
  await page.locator('#q').hover();
  await expect(one.locator('.ctl')).toBeHidden();
  await expect(volume).toBeHidden();
  await one.locator('.bar .snd').focus();
  await expect(one.locator('.ctl')).toBeVisible();
  await page.locator('#q').focus();
  await expect(one.locator('.ctl')).toBeHidden();
  await one.hover();
  await expect(volume).toBeVisible();
  await page.reload();
  await expect(one).toHaveClass(/loud/);
  await expect(volume).toHaveValue('0.55');
  expect(errors).toEqual([]);
});
test('sound buttons toggle pinning, while spotlight audio stays active until focus changes', async ({ page }) => {
  const errors=await setup(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('tg.layout.guest')) localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one','two']}));
  });
  await page.goto('/');
  const tile=page.locator('#grid [data-login="one"]'),other=page.locator('#grid [data-login="two"]');
  const header=tile.locator('.bar .snd'),sound=tile.locator('.ctl .snd');
  const state=()=>page.evaluate(()=>({muted:tiles.get('one').muted,pinned:tiles.get('one').pinned}));
  await tile.hover();
  await expect(sound).toHaveAttribute('aria-pressed','false');
  await sound.click();
  expect(await state()).toEqual({muted:false,pinned:true});
  await expect(header).toHaveAttribute('aria-pressed','true');
  await expect(sound).toHaveAttribute('aria-pressed','true');
  await header.click();
  expect(await state()).toEqual({muted:true,pinned:false});
  await expect(sound).toHaveAttribute('aria-pressed','false');
  await tile.locator('.player').click();
  expect(await state()).toEqual({muted:false,pinned:false});
  await header.click();
  expect(await state()).toEqual({muted:false,pinned:true});
  await other.locator('.player').click();   // two takes the spotlight; the pinned sound of one survives on the side
  expect(await state()).toEqual({muted:false,pinned:true});
  await header.click();
  expect(await state()).toEqual({muted:true,pinned:false});
  await tile.locator('.player').click();   // back in the spotlight: audible again, and two loses its sound
  expect(await state()).toEqual({muted:false,pinned:false});
  expect(await page.evaluate(()=>tiles.get('two').muted)).toBe(true);
  await page.keyboard.press('Escape');   // leaving without a pinned sound mutes it
  expect(await state()).toEqual({muted:true,pinned:false});
  await tile.hover();
  await sound.click();
  await page.reload();
  expect(await state()).toEqual({muted:false,pinned:true});
  await expect(header).toHaveAttribute('aria-pressed','true');
  expect(errors).toEqual([]);
});
test('native pause, volume and mute survive the watchdog and returning to the grid', async ({ page }) => {
  const errors = await setup(page); await page.clock.install(); await page.goto('/');
  await favorite(page, 'one'); await page.locator('#list .channel').click();
  await favorite(page, 'two'); await page.locator('#list [data-login="two"] .channel').click();
  await page.locator('#grid [data-login="one"] .player').click();
  await page.clock.runFor(2500);
  await page.evaluate(() => {
    const player = tiles.get('one').player;
    player.pause(); player.setVolume(0.25); player.setMuted(true); player.setQuality('720p60');
  });
  await page.clock.runFor(6000);
  expect(await page.evaluate(() => {
    const t = tiles.get('one'); return { paused:t.paused, muted:t.muted, volume:t.volume, playing:!t.player.paused };
  })).toEqual({ paused:true, muted:true, volume:0.25, playing:false });
  await page.locator('#grid .big .min').click();
  await page.clock.runFor(1000);
  await expect(page.locator('#grid [data-login="one"] .ctl input')).toHaveValue('0.25');
  expect(await page.evaluate(() => tiles.get('one').player.paused)).toBe(true);
  await page.locator('#grid [data-login="one"] .player').click(); await page.clock.runFor(1000);
  expect(await page.evaluate(() => tiles.get('one').player.getQuality())).toBe('720p60');
  expect(errors).toEqual([]);
});
test('native Play resumes a spotlight restored in a paused state', async ({ page }) => {
  await setup(page); await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('tg.layout.guest', JSON.stringify({order:['one','two'],focused:'one',allPaused:true,paused:{one:true}})));
  await page.goto('/'); await page.clock.runFor(1000);
  await page.evaluate(() => tiles.get('one').player.play());
  await page.clock.runFor(6000);
  expect(await page.evaluate(() => ({ allPaused, one:tiles.get('one').paused, two:tiles.get('two').paused, playing:!tiles.get('one').player.paused })))
    .toEqual({allPaused:false,one:false,two:true,playing:true});
});
test('continue without an account only focuses search and leaves the welcome unchanged', async ({ page }) => {
  const errors = await setup(page, true);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('#top')).toBeEnabled();
  const welcome = await page.locator('#empty').innerText();
  await page.locator('#guest').click();
  await expect(page.locator('#q')).toBeFocused();
  await expect(page.locator('#top')).toHaveText('Connecter Twitch');
  await expect(page.locator('#guest')).toBeVisible();
  expect(await page.locator('#empty').innerText()).toBe(welcome);
  expect(await page.evaluate(() => localStorage.getItem('tg.guest'))).toBeNull();
  await page.reload();
  await expect(page.locator('#top')).toHaveText('Connecter Twitch');
  await expect(page.locator('#guest')).toBeVisible();
  const icon = page.locator('#connect');
  await expect(icon).toBeVisible();
  const bounds = await icon.boundingBox();
  expect(bounds.width).toBeLessThanOrEqual(32);
  expect(bounds.height).toBeLessThanOrEqual(32);
  expect(await icon.innerText()).toBe('');
  await page.route('https://id.twitch.tv/oauth2/authorize?**', route => route.fulfill({body:'Twitch authorization'}));
  await icon.click();
  await page.waitForURL('https://id.twitch.tv/oauth2/authorize?**');
  const url = new URL(page.url());
  expect(url.searchParams.get('client_id')).toBe('test-client');
  expect(url.searchParams.get('scope')).toBe('user:read:follows');
  expect(errors).toEqual([]);
});
test('only open tiles hide the welcome, regardless of favorites or an old guest preference', async ({ page }) => {
  await setup(page, true);
  await page.addInitScript(() => {
    localStorage.setItem('tg.guest', 'true');
  });
  await page.goto('/');
  await expect(page.locator('#empty')).toBeVisible();
  await favorite(page, 'one');
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#top')).toHaveText('Connecter Twitch');
  await page.reload();
  await expect(page.locator('#empty')).toBeVisible();
  await page.locator('#list [data-login="one"] .channel').click();
  await expect(page.locator('#empty')).toBeHidden();
  await page.locator('#list [data-login="one"] .favorite').click();
  await expect(page.locator('#empty')).toBeHidden();
  await page.reload();
  await expect(page.locator('#grid .tile')).toHaveCount(1);
  await expect(page.locator('#empty')).toBeHidden();
  await page.locator('#grid .close').click();
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#top')).toBeEnabled();
  await expect(page.locator('#guest')).toBeVisible();
});
test('primary welcome action starts Twitch authorization', async ({ page }) => {
  await setup(page, true);
  await page.route('https://id.twitch.tv/oauth2/authorize?**', route => route.fulfill({body:'Twitch authorization'}));
  await page.goto('/');
  await page.locator('#top').click();
  await page.waitForURL('https://id.twitch.tv/oauth2/authorize?**');
  expect(new URL(page.url()).searchParams.get('scope')).toBe('user:read:follows');
});
test('guest search renders API results and saves a favorite without authentication', async ({page}) => {
  const errors=await setup(page,true); await page.goto('/'); await page.locator('#guest').click();
  await page.route('**/api/search?**', route=>route.fulfill({json:{data:[
    {broadcaster_login:'altair',display_name:'Altair',thumbnail_url:'https://example.com/altair.png',is_live:true,game_name:'Art'},
    {broadcaster_login:'altair_other',display_name:'Altair Other',thumbnail_url:'',is_live:false,game_name:'Music'}
  ]}}));
  await page.route('https://example.com/altair.png', route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
  await page.locator('#q').fill('altair');
  await expect(page.locator('#list li')).toHaveCount(2);
  await expect(page.locator('#list [data-login="altair"] .g')).toHaveText('En direct · Art');
  await expect(page.locator('#list [data-login="altair"] img')).toHaveAttribute('src','https://example.com/altair.png');
  await expect(page.getByText('Rechercher sur Twitch ↗')).toHaveCount(0);
  await expect(page.locator('#search-state')).toHaveText('2 chaînes trouvées');
  await page.locator('#list [data-login="altair"] .favorite').click();
  await expect(page.locator('#list [data-login="altair"] .favorite')).toHaveAttribute('aria-pressed','true');
  await page.locator('#q').fill(''); await page.reload();
  await expect(page.locator('#list .name')).toHaveText('Altair');
  expect(await page.evaluate(()=>sessionStorage.getItem('tg.session'))).toBeNull(); expect(errors).toEqual([]);
});
test('guest search handles empty results and an unavailable API with direct-add fallback', async ({page}) => {
  await setup(page); await page.goto('/');
  await page.route('**/api/search?**', route=>route.fulfill({json:{data:[]}}));
  await page.locator('#q').fill('noresults');
  await expect(page.locator('#search-state')).toHaveText('Aucune chaîne trouvée.');
  await expect(page.locator('#add-login')).toBeHidden();
  await page.route('**/api/search?**', route=>route.fulfill({status:503,json:{error:'SEARCH_UNAVAILABLE'}}));
  await page.locator('#q').fill('altair');
  await expect(page.locator('#search-state')).toContainText('indisponible');
  await page.locator('#add-login').click(); await expect(page.locator('#list .name')).toHaveText('altair');
});
test('a slow previous search never replaces the latest results', async ({page}) => {
  await setup(page); await page.goto('/');
  let release; const held=new Promise(resolve=>release=resolve);
  await page.route('**/api/search?**',async route=>{
    const query=new URL(route.request().url()).searchParams.get('q');
    if(query==='slow') await held;
    await route.fulfill({json:{data:[{broadcaster_login:query,display_name:query,is_live:false}]}}).catch(()=>{});
  });
  await page.locator('#q').fill('slow'); await page.waitForRequest('**/api/search?q=slow');
  await page.locator('#q').fill('latest');
  await expect(page.locator('#list .name')).toHaveText('latest');
  release(); await page.waitForTimeout(50);
  await expect(page.locator('#list .name')).toHaveText('latest');
});

for (const connected of [false, true]) test(`stream metadata follows focus, hover and refresh in ${connected ? 'connected' : 'guest'} mode`, async ({ page }) => {
  const errors = await setup(page, connected);
  if (connected) await api(page);
  let title = 'Une aventure <img src=x> & des surprises', game = 'Baldur’s Gate 3', online = true;
  const respond = route => route.fulfill({ json: { data: online ? ['one', 'two'].map(login => ({
    user_login: login, broadcaster_login: login, is_live: true, game_name: game, title, viewer_count: 42
  })) : [] } });
  if (connected) await page.route('https://api.twitch.tv/helix/streams?**', respond);
  else await page.route('**/api/search?**', respond);
  await page.addInitScript(connected => {
    if (connected) sessionStorage.setItem('tg.session', JSON.stringify('valid'));
    localStorage.setItem('tg.layout.' + (connected ? 'connected' : 'guest'), JSON.stringify({ order: ['one', 'two'], focused: 'one' }));
  }, connected);
  await page.goto('/');
  const big = page.locator('#grid [data-login="one"]'), small = page.locator('#grid [data-login="two"]');
  await expect(big).toHaveClass(/full-player/);
  await expect.poll(() => page.evaluate(() => refreshInFlight)).toBe(false);
  await page.evaluate(() => refresh());
  await expect(big.locator('.stream-category')).toHaveText(game);
  await expect(big.locator('.stream-title')).toHaveText(title);
  await expect(big.locator('.stream-info img')).toHaveCount(0);
  await expect(big.locator('.stream-info')).toBeVisible();
  await expect(small.locator('.stream-info')).toBeHidden();
  await small.locator('.player').hover();
  await expect(small.locator('.stream-info')).toBeVisible();
  await expect(small.locator('.stream-info')).toHaveCSS('backdrop-filter', 'blur(12px)');
  await page.locator('#toggle').hover();
  await expect(small.locator('.stream-info')).toBeHidden();
  await page.evaluate(() => { window.metadataPlayer = tiles.get('one').player; });
  title = 'Nouveau titre'; game = 'Just Chatting';
  await page.evaluate(() => refresh());
  await expect(big.locator('.stream-title')).toHaveText(title);
  await expect(big.locator('.stream-category')).toHaveText(game);
  expect(await page.evaluate(() => tiles.get('one').player === window.metadataPlayer)).toBe(true);
  await small.locator('.close').click();
  await expect(big).toHaveClass(/full-player/);
  await expect(big.locator('.stream-info')).toBeVisible();
  online = false;
  await page.evaluate(() => refresh());
  await expect(big.locator('.stream-info')).toBeHidden();
  await expect(big.locator('.viewers')).toHaveText('Hors ligne');
  expect(errors).toEqual([]);
});

for (const single of [true, false]) test(`expand ${single ? 'single' : 'focused'} player within viewport and restore layout`, async ({ page }) => {
  const errors = await setup(page);
  await page.addInitScript(single => localStorage.setItem('tg.layout.guest', JSON.stringify({
    order: single ? ['one'] : ['one', 'two'], focused: single ? null : 'one', muted: {one:true}, volume:{one:0.35}
  })), single);
  await page.goto('/');
  const tile = page.locator('#grid [data-login="one"]'), button = tile.locator('.fs');
  await expect(button).toBeVisible();
  await expect.poll(() => page.evaluate(() => [...tiles.values()].every(t => t.ready))).toBe(true);
  const before = await tile.boundingBox();
  const pinsBefore = await page.evaluate(() => pins);
  await page.evaluate(() => {
    window.expansionPlayers = [...tiles.values()].map(t => t.player);
    window.fullscreenCalls = 0;
    Element.prototype.requestFullscreen = () => { window.fullscreenCalls++; return Promise.resolve(); };
  });
  await button.click();
  await expect(tile).toHaveClass(/expanded/);
  await expect(button).toHaveAttribute('aria-pressed','true');
  expect(await tile.boundingBox()).toEqual({x:0,y:0,...page.viewportSize()});
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect(await page.evaluate(() => window.fullscreenCalls)).toBe(0);
  expect(await page.locator('#side').evaluate(el=>el.inert)).toBe(true);
  expect(await tile.locator('.bar').evaluate(el=>el.draggable)).toBe(false);
  await page.setViewportSize({width:1000,height:700});
  expect(await tile.boundingBox()).toEqual({x:0,y:0,width:1000,height:700});
  await button.click();
  await expect(tile).not.toHaveClass(/expanded/);
  await page.setViewportSize({width:1280,height:720});
  await expect.poll(() => tile.boundingBox()).toEqual(before);   // pinned boxes follow the grid through a ResizeObserver
  await button.click();
  await page.keyboard.press('Escape');
  await expect(tile).not.toHaveClass(/expanded/);
  expect(await page.evaluate(() => pins)).toEqual(pinsBefore);
  expect(await page.locator('#side').evaluate(el=>el.inert)).toBe(false);
  expect(await page.evaluate(() => [...tiles.values()].every((t,i)=>t.player===window.expansionPlayers[i]))).toBe(true);
  expect(await page.evaluate(() => tiles.get('one').volume)).toBe(0.35);
  await button.click();
  if (single) await tile.locator('.close').click();
  else await tile.locator('.spotlight').click();
  await expect(page.locator('.expanded')).toHaveCount(0);
  expect(await page.locator('#side').evaluate(el=>el.inert)).toBe(false);
  expect(errors).toEqual([]);
});

for (const connected of [false, true]) test(`live notifications track transitions and open streams in ${connected ? 'connected' : 'guest'} mode`, async ({ page }) => {
  const errors = await setup(page, connected);
  if (connected) await api(page);
  let roster = ['already', 'newlive', 'later'], online = new Set(['already']), failed = false;
  const statuses = route => route.fulfill(failed ? {status:503,json:{}} : {json:{data: [...online].map(login => ({
    user_login:login,broadcaster_login:login,is_live:true,game_name:'Art',title:'A new stream',viewer_count:42
  }))}});
  if (connected) {
    await page.route('https://api.twitch.tv/helix/channels/followed?**', route => route.fulfill({json:{
      data:roster.map(login=>({broadcaster_login:login,broadcaster_name:login})),pagination:{}
    }}));
    await page.route('https://api.twitch.tv/helix/streams?**', statuses);
  } else await page.route('**/api/search?**', statuses);
  await page.addInitScript(connected => {
    if (connected) sessionStorage.setItem('tg.session',JSON.stringify('valid'));
    localStorage.setItem('tg.favorites',JSON.stringify(['already','newlive','later'].map(twitch=>({twitch}))));
    localStorage.setItem('tg.layout.'+(connected?'connected':'guest'),JSON.stringify({order:['already'],allPaused:true}));
  }, connected);
  await page.goto('/');
  await expect(page.locator('#list [data-login="newlive"] .g')).toHaveText('Hors ligne');
  await expect(page.locator('.live-notification')).toHaveCount(0);
  online.add('newlive'); online.add('later');
  failed=true;
  await page.evaluate(()=>refresh());
  await expect(page.locator('.live-notification')).toHaveCount(0);
  failed=false;
  await page.evaluate(()=>refresh());
  await expect(page.locator('.live-notification')).toHaveCount(2);
  await page.evaluate(()=>refresh());
  await expect(page.locator('.live-notification')).toHaveCount(2);
  await page.locator('.live-notification[data-login="later"] .dismiss').click();
  await page.evaluate(()=>refresh());
  await expect(page.locator('.live-notification')).toHaveCount(1);
  await page.locator('.live-notification[data-login="newlive"] .watch').click();
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  await expect(page.locator('#grid [data-login="newlive"]')).toHaveClass(/big/);
  expect(await page.evaluate(()=>({paused:tiles.get('newlive').paused,muted:tiles.get('newlive').muted,otherPaused:tiles.get('already').paused,allPaused})))
    .toEqual({paused:false,muted:false,otherPaused:true,allPaused:false});
  await expect(page.locator('.live-notification')).toHaveCount(0);
  online.delete('newlive');
  await page.evaluate(()=>refresh());
  online.add('newlive');
  await page.evaluate(()=>refresh());
  await page.locator('#grid .big .fs').click();
  await page.locator('.live-notification .watch').click();
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  await expect(page.locator('#grid [data-login="newlive"]')).toHaveClass(/big/);
  await expect(page.locator('.expanded')).toHaveCount(0);
  online.delete('later'); await page.evaluate(()=>refresh());
  online.add('later'); await page.evaluate(()=>refresh());
  await expect(page.locator('.live-notification')).toHaveCount(1);
  if (connected) {
    roster=roster.filter(login=>login!=='later');
    await page.evaluate(()=>{lastFollows=0;return refresh();});
  } else await page.locator('#list [data-login="later"] .favorite').click();
  await expect(page.locator('.live-notification')).toHaveCount(0);
  if (connected) {
    online.delete('newlive'); await page.evaluate(()=>refresh());
    online.add('newlive'); await page.evaluate(()=>refresh());
    await expect(page.locator('.live-notification')).toHaveCount(1);
    await page.locator('#disconnect').click();
    await expect(page.locator('.live-notification')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});


for (const gesture of ['background', 'button', 'keyboard']) test(`reload audio overlay resumes all requested sounds with ${gesture}`, async ({ page }) => {
  const errors=await setup(page); await page.clock.install();
  await page.route('**/api/search?**',r=>r.fulfill({json:{data:['one','two','muted','paused'].map(broadcaster_login=>({broadcaster_login,is_live:true}))}}));
  await page.addInitScript(()=>localStorage.setItem('tg.layout.guest',JSON.stringify({
    order:['one','two','muted','paused'],focused:'one',muted:{one:false,two:false,muted:true,paused:false},
    paused:{paused:true},volume:{one:0.3,two:0.7,muted:0.4,paused:0.6},pinned:{two:true}
  })));
  await page.goto('/'); await page.clock.runFor(1200);
  const overlay=page.locator('#audio-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS('backdrop-filter','blur(14px)');
  expect(await overlay.boundingBox()).toEqual({x:0,y:0,...page.viewportSize()});
  await page.evaluate(()=>{window.audioPlayers=[...tiles.values()].map(t=>t.player);});
  if(gesture==='background') await page.mouse.click(4,4);
  else if(gesture==='button') await overlay.locator('button').click();
  else await page.keyboard.press('Space');
  await page.clock.runFor(2500);
  await expect(overlay).toBeHidden();
  expect(await page.evaluate(()=>[...tiles.values()].map(t=>({muted:t.player.getMuted(),volume:t.player.getVolume(),paused:t.player.paused}))))
    .toEqual([{muted:false,volume:0.3,paused:false},{muted:false,volume:0.7,paused:false},{muted:true,volume:0.4,paused:false},{muted:true,volume:0.6,paused:true}]);
  expect(await page.evaluate(()=>focused)).toBe('one');
  expect(await page.evaluate(()=>[...tiles.values()].every((t,i)=>t.player===window.audioPlayers[i]))).toBe(true);
  await page.evaluate(()=>tiles.get('one').player.emit('playbackBlocked'));
  await page.clock.runFor(2500);
  await expect(overlay).toBeHidden();
  expect(errors).toEqual([]);
});

test('audio overlay skips silent and paused layouts; gesture also unlocks players still loading',async({page})=>{
  await setup(page); await page.clock.install();
  await page.route('https://player.twitch.tv/js/embed/v1.js',r=>r.fulfill({contentType:'text/javascript',body:mockPlayer.replace('}, 0);','}, 2000);')}));
  await page.goto('/');
  const overlay=page.locator('#audio-overlay');
  await expect(overlay).toBeHidden();
  await page.evaluate(()=>add(channel({twitch:'one',online:true}),true));
  await expect(overlay).toBeHidden();
  await page.evaluate(()=>{const t=tiles.get('one');t.muted=false;t.paused=true;updateAudioOverlay();});
  await expect(overlay).toBeHidden();
  await page.evaluate(()=>{const t=tiles.get('one');t.paused=false;t.volume=0;updateAudioOverlay();});
  await expect(overlay).toBeHidden();
  await page.evaluate(()=>{const t=tiles.get('one');t.volume=0.5;allPaused=true;updateAudioOverlay();});
  await expect(overlay).toBeHidden();
  await page.evaluate(()=>{allPaused=false;updateAudioOverlay();});
  await expect(overlay).toBeVisible();
  expect(await page.evaluate(()=>tiles.get('one').ready)).toBe(false);
  await page.keyboard.press('Enter');
  await page.clock.runFor(4500);
  await expect(overlay).toBeHidden();
  expect(await page.evaluate(()=>({muted:tiles.get('one').player.getMuted(),paused:tiles.get('one').player.paused}))).toEqual({muted:false,paused:false});
  await expect(page.locator('.audio-help')).toHaveCount(0);
});

async function selectChatPosition(tile, position) {
  const options=tile.locator('.chat-options');
  if (!await options.evaluate(el=>el.open)) await options.locator('summary').click();
  await options.locator('select').selectOption(position);
}
async function mockChat(page) {
  await page.route('https://www.twitch.tv/embed/*/chat?**',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#18181b;color:#efeff1">Chat Twitch</body>'}));
}
test('chat uses vertical letterboxing, follows spotlight and preserves players when positioned or expanded',async({page})=>{
  const errors=await setup(page);await mockChat(page);
  await page.setViewportSize({width:1600,height:1000});
  await page.addInitScript(()=>localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one','two'],focused:'one'})));
  await page.goto('/');
  const one=page.locator('#grid [data-login="one"]'),two=page.locator('#grid [data-login="two"]');
  await expect(one.locator('.chat-toggle')).toBeVisible();
  await expect(two.locator('.chat-toggle')).toBeHidden();
  await expect(page.locator('.chat iframe')).toHaveCount(0);
  await page.evaluate(()=>{window.chatPlayers=[...tiles.values()].map(t=>t.player);});
  const videoBefore=await one.locator('.player iframe').boundingBox();
  await one.locator('.chat-toggle').click();
  await expect(one.locator('.tile-body')).toHaveAttribute('data-chat-position','bottom');
  await expect(one.locator('.chat iframe')).toHaveAttribute('src',/\/embed\/one\/chat\?parent=localhost&darkpopout=1/);
  const video=await one.locator('.player iframe').boundingBox();
  expect(video.width).toBeCloseTo(videoBefore.width,0);
  expect(video.height).toBeCloseTo(videoBefore.height,0);
  const chat=await one.locator('.chat').boundingBox();
  expect(chat.y).toBeCloseTo(video.y+video.height,0);
  expect(chat.height).toBeGreaterThanOrEqual(420);
  await page.evaluate(()=>{window.chatFrame=tiles.get('one').chat.querySelector('iframe');});
  await expect(one.locator('.chat-options select option')).toHaveText(['Auto','Top','Bottom','Left','Right']);
  for (const position of ['top','bottom','left','right']) {
    await selectChatPosition(one,position);
    await expect(one.locator('.tile-body')).toHaveAttribute('data-chat-position',position);
    const panel=await one.locator('.chat').boundingBox(),player=await one.locator('.player').boundingBox();
    if (position==='top') expect(panel.y+panel.height).toBeCloseTo(player.y,0);
    if (position==='bottom') expect(player.y+player.height).toBeCloseTo(panel.y,0);
    if (position==='left') expect(panel.x+panel.width).toBeCloseTo(player.x,0);
    if (position==='right') expect(player.x+player.width).toBeCloseTo(panel.x,0);
    const frame=await one.locator('.chat iframe').boundingBox();
    expect(frame.height).toBeGreaterThanOrEqual(panel.height-1);
    expect(await page.evaluate(()=>tiles.get('one').chat.querySelector('iframe')===window.chatFrame)).toBe(true);
    expect(await page.evaluate(()=>[...tiles.values()].every((t,i)=>t.player===window.chatPlayers[i]))).toBe(true);
  }
  expect(await page.evaluate(()=>tiles.get('one').chat.querySelector('iframe')===window.chatFrame)).toBe(true);
  await selectChatPosition(one,'auto');
  await page.setViewportSize({width:2200,height:700});
  await expect(one.locator('.tile-body')).toHaveAttribute('data-chat-position','right');
  await one.locator('.fs').click();
  await expect(one.locator('.chat')).toBeVisible();
  expect(await page.evaluate(()=>[...tiles.values()].every((t,i)=>t.player===window.chatPlayers[i]))).toBe(true);
  expect(await page.evaluate(()=>tiles.get('one').chat.querySelector('iframe')===window.chatFrame)).toBe(true);
  await one.locator('.fs').click();
  await two.locator('.player').click();   // the chat is a per-stream setting: two arrives with its own, closed
  await expect(page.locator('.chat iframe')).toHaveCount(0);
  await two.locator('.chat-toggle').click();
  await expect(page.locator('.chat iframe')).toHaveCount(1);
  await expect(two.locator('.chat iframe')).toHaveAttribute('src',/\/embed\/two\/chat/);
  await one.locator('.spotlight').click();   // a pinned tile carries its own chat beside the spotlight
  await expect(page.locator('.chat iframe')).toHaveCount(2);
  await one.locator('.spotlight').click();   // unpinned, one takes the spotlight and two steps aside
  await expect(page.locator('.chat iframe')).toHaveCount(1);
  await one.locator('.min').click();
  await expect(page.locator('.chat iframe')).toHaveCount(0);
  await one.locator('.player').click();
  await expect(one.locator('.chat')).toBeVisible();
  await one.locator('.chat-toggle').click();
  await expect(page.locator('.chat iframe')).toHaveCount(0);
  await expect(one.locator('.chat-toggle')).toHaveAttribute('aria-expanded','false');
  expect(errors).toEqual([]);
});

test('compact chat menu works with keyboard, outside clicks and a narrow viewport',async({page})=>{
  const errors=await setup(page);await mockChat(page);
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one'],chatOpen:true})));
  await page.goto('/');
  await page.locator('#grid .fs').click();
  const options=page.locator('.chat-options'),summary=options.locator('summary');
  await expect(options.locator('select')).toBeHidden();
  await summary.focus();await page.keyboard.press('Enter');
  await expect(options.locator('select')).toBeVisible();
  const menu=await options.locator('.chat-menu').boundingBox();
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x+menu.width).toBeLessThanOrEqual(390);
  await expect(options.locator('a')).toHaveAttribute('href','https://www.twitch.tv/popout/one/chat?popout=&darkpopout=1');
  await page.keyboard.press('Escape');
  await expect(options.locator('select')).toBeHidden();
  await expect(summary).toBeFocused();
  await expect(page.locator('#grid .tile')).toHaveClass(/expanded/);
  await summary.click();
  await page.frameLocator('.chat iframe').locator('body').click();
  await expect(options.locator('select')).toBeHidden();
  await summary.click();
  await page.locator('.chat-toggle').click();
  await expect(summary).toBeVisible();
  await expect(page.locator('.chat')).toBeHidden();
  await selectChatPosition(page.locator('#grid .tile'),'left');
  await expect(page.locator('.chat iframe')).toHaveCount(0);
  await page.locator('.chat-toggle').click();
  await expect(options.locator('select')).toBeHidden();
  await expect(page.locator('.tile-body')).toHaveAttribute('data-chat-position','left');
  expect(errors).toEqual([]);
});

test('chat reserves enough height for messages and Auto avoids a cramped bottom panel',async({page})=>{
  await setup(page);await mockChat(page);
  await page.setViewportSize({width:1800,height:1250});
  await page.addInitScript(()=>localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one'],chatOpen:true})));
  await page.goto('/');
  await page.locator('#grid .fs').click();
  const body=page.locator('#grid .tile-body'),chat=page.locator('#grid .chat');
  await expect(body).toHaveAttribute('data-chat-position','right');
  for (const position of ['top','bottom']) {
    await selectChatPosition(page.locator('#grid .tile'),position);
    await expect(body).toHaveAttribute('data-chat-position',position);
    await expect.poll(async()=>Math.round((await chat.boundingBox()).height)).toBe(420);
  }
  await page.setViewportSize({width:1800,height:400});
  const bounds=await body.boundingBox();
  await expect.poll(async()=>Math.round((await chat.boundingBox()).height)).toBe(Math.round(bounds.height-90));
  const panel=await chat.boundingBox();
  expect(panel.y+panel.height).toBeLessThanOrEqual(400);
  expect((await page.locator('#grid .player').boundingBox()).height).toBeGreaterThanOrEqual(90);
});

test('side chat expands into pillarboxing up to its maximum without shrinking the video',async({page})=>{
  await setup(page);await mockChat(page);
  await page.addInitScript(()=>localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one'],chatOpen:true})));
  await page.goto('/');
  await page.locator('#grid .fs').click();
  const chat=page.locator('#grid .chat'),body=page.locator('#grid .tile-body');
  await page.evaluate(()=>{window.savedVideo=tiles.get('one').player;window.savedChat=tiles.get('one').chat.querySelector('iframe');});
  for (const position of ['auto','left','right']) {
    await selectChatPosition(page.locator('#grid .tile'),position);
    for (const width of [1800,2200,1600]) {
      await page.setViewportSize({width,height:800});
      await expect(body).toHaveAttribute('data-chat-position',position==='auto'?'right':position);
      const bounds=await body.boundingBox(),videoWidth=bounds.height*16/9;
      const expected=width===2200?480:width===1600?320:bounds.width-videoWidth;
      await expect.poll(async()=>Math.round((await chat.boundingBox()).width)).toBe(Math.round(expected));
      if (width===1800) expect(expected).toBeGreaterThan(320);
      const video=await page.locator('#grid .player iframe').boundingBox();
      expect(video.width).toBeCloseTo(Math.min(videoWidth,bounds.width-320),0);
      expect(await page.evaluate(()=>tiles.get('one').player===window.savedVideo && tiles.get('one').chat.querySelector('iframe')===window.savedChat)).toBe(true);
    }
  }
});

test('chat layout is stored per mode, works with a single mobile tile, and avatars refresh',async({page})=>{
  const errors=await setup(page,true);await api(page);await mockChat(page);
  await page.route('**/api/search?**',r=>r.fulfill({json:{data:[{broadcaster_login:'guest',is_live:false,thumbnail_url:'https://example.com/avatar.png'}]}}));
  await page.route('https://example.com/avatar.png',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="9" cy="9" r="9" fill="purple"/></svg>'}));
  await page.addInitScript(()=>{
    sessionStorage.setItem('tg.session',JSON.stringify('valid'));
    if (!localStorage.getItem('tg.layout.connected')) localStorage.setItem('tg.layout.connected',JSON.stringify({order:['live'],chatOpen:true,chatPosition:'below'}));
    if (!localStorage.getItem('tg.layout.guest')) localStorage.setItem('tg.layout.guest',JSON.stringify({order:['guest'],chatOpen:true,chatPosition:'auto'}));
  });
  await page.goto('/');
  await expect(page.locator('.chat iframe')).toHaveAttribute('src',/\/embed\/live\/chat/);
  await expect(page.locator('.chat-options select')).toHaveValue('bottom');
  await selectChatPosition(page.locator('#grid .tile'),'top');
  await page.reload();
  await expect(page.locator('.chat-options select')).toHaveValue('top');
  await page.locator('#disconnect').click();
  await expect(page.locator('.chat iframe')).toHaveAttribute('src',/\/embed\/guest\/chat/);
  await expect(page.locator('.chat-options select')).toHaveValue('auto');
  await expect(page.locator('#grid .stream-avatar')).toHaveAttribute('src','https://example.com/avatar.png');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#toggle').click();
  await expect(page.locator('#grid .tile-body')).toHaveAttribute('data-chat-position','bottom');
  const video=await page.locator('#grid .player iframe').boundingBox(),chat=await page.locator('.chat').boundingBox();
  expect(chat.y).toBeCloseTo(video.y+video.height,0);
  expect(chat.x+chat.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tg.layout.connected')).chatPosition)).toEqual({live:'top'});
  await page.locator('#grid .close').click();
  await expect(page.locator('.chat iframe')).toHaveCount(0);
  expect(errors).toEqual([]);
});

async function collaborationFixture(page, connected) {
  const users = [
    {id:'1',login:'live',display_name:'Live'},
    {id:'2',login:'partner',display_name:'Partner'},
    {id:'3',login:'third',display_name:'Third <img src=x>'},
    {id:'4',login:'offline',display_name:'Offline'},
    {id:'5',login:'sidebar',display_name:'Sidebar'}
  ];
  const state = { active:true, fail:false, calls:0 };
  const members = login => !state.active ? [] : login==='sidebar' ? [users[4],users[1]] : ['live','partner','third'].includes(login) ? users.slice(0,4) : [];
  const card = u => ({broadcaster_login:u.login,display_name:u.display_name,is_live:u.login!=='offline',game_name:'Art',thumbnail_url:'favicon.svg',viewer_count:42});
  if (connected) {
    await api(page);
    await page.route('https://api.twitch.tv/helix/**',r=>{
      const url=new URL(r.request().url()),p=url.searchParams;
      if(url.pathname.endsWith('/channels/followed')) return r.fulfill({json:{data:[users[0],users[4]].map(card)}});
      if(url.pathname.endsWith('/users')) {
        const matches=users.filter(u=>p.getAll('login').includes(u.login)||p.getAll('id').includes(u.id));
        return r.fulfill({json:{data:matches}});
      }
      if(url.pathname.endsWith('/shared_chat/session')) {
        state.calls++;
        if(state.fail) return r.fulfill({status:503,json:{error:'unavailable'}});
        const login=users.find(u=>u.id===p.get('broadcaster_id'))?.login;
        const participants=members(login).map(u=>({broadcaster_id:u.id}));
        return r.fulfill({json:{data:participants.length?[{participants}]:[]}});
      }
      if(url.pathname.endsWith('/streams')) return r.fulfill({json:{data:users.filter(u=>u.login!=='offline'&&(p.getAll('user_id').includes(u.id)||p.getAll('user_login').includes(u.login))).map(u=>({user_id:u.id,user_login:u.login,game_name:'Art',viewer_count:42}))}});
      return r.fulfill({json:{data:[]}});
    });
  } else {
    await page.route('**/api/search?**',r=>{
      const p=new URL(r.request().url()).searchParams;
      if(p.has('collaboration')) {
        state.calls++;
        return state.fail?r.fulfill({status:503,json:{error:'unavailable'}}):r.fulfill({json:{data:members(p.get('collaboration')).map(card)}});
      }
      return r.fulfill({json:{data:users.filter(u=>p.getAll('login').includes(u.login)).map(card)}});
    });
  }
  return state;
}
for (const connected of [false,true]) test(`collaboration icons and participant additions preserve grid and audio in ${connected?'connected':'guest'} mode`,async({page})=>{
  const errors=await setup(page,connected);
  await collaborationFixture(page,connected);
  await page.addInitScript(connected=>{
    if(connected) sessionStorage.setItem('tg.session',JSON.stringify('valid'));
    localStorage.setItem('tg.favorites',JSON.stringify([{twitch:'live'},{twitch:'sidebar'}]));
    localStorage.setItem('tg.layout.'+(connected?'connected':'guest'),JSON.stringify({order:['live'],muted:{live:false},volume:{live:0.35},pinned:{live:true}}));
  },connected);
  await page.goto('/');
  await expect(page.locator('#list [data-login="sidebar"] .collaboration-indicator')).toBeVisible();
  const source=page.locator('#grid [data-login="live"]'),menu=source.locator('.collaboration');
  await expect(menu.locator('summary')).toBeVisible();
  await page.locator('#audio-overlay').click();
  await page.evaluate(()=>window.originalCollaborationPlayer=tiles.get('live').player);
  await menu.locator('summary').click();
  await expect(menu.locator('.collaboration-row')).toHaveCount(4);
  await expect(menu.locator('[data-participant="live"] button')).toBeDisabled();
  await expect(menu.locator('[data-participant="offline"] small')).toHaveText('Hors ligne');
  await expect(menu.locator('[data-participant="offline"] button')).toBeDisabled();
  await expect(menu.locator('[data-participant="third"] .collaboration-name')).toHaveText('Third <img src=x>');
  await expect(menu.locator('.collaboration-name img')).toHaveCount(0);
  await menu.locator('[data-participant="partner"] button').click();
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  await expect(menu.locator('[data-participant="partner"] small')).toHaveText('Déjà dans la grille');
  await expect(source).toHaveClass(/big/);
  await menu.locator('.add-collaboration').click();
  await expect(page.locator('#grid .tile')).toHaveCount(3);
  await expect(menu.locator('.add-collaboration')).toBeDisabled();
  expect(await page.evaluate(()=>({order,focused,chatOpen:tiles.get('live').chatOpen,samePlayer:tiles.get('live').player===window.originalCollaborationPlayer,
    muted:[...tiles.values()].map(t=>t.muted),volume:tiles.get('live').volume,pinned:tiles.get('live').pinned})))
    .toEqual({order:['live','partner','third'],focused:'live',chatOpen:false,samePlayer:true,muted:[false,true,true],volume:0.35,pinned:true});
  await expect(page.locator('.chat iframe')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('#grid [data-login="partner"] .close').click();
  await menu.locator('summary').click();
  await expect(menu.locator('[data-participant="partner"] button')).toBeEnabled();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tg.layout.'+layoutMode)).order)).toEqual(['live','third']);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tg.favorites')).map(s=>s.twitch))).toEqual(['live','sidebar']);
  expect(errors).toEqual([]);
});
test('collaboration menu fits mobile and disappears when sessions end or the API fails',async({page})=>{
  const errors=await setup(page,true);const state=await collaborationFixture(page,true);
  await page.clock.install();await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{
    sessionStorage.setItem('tg.session',JSON.stringify('valid'));
    localStorage.setItem('tg.layout.connected',JSON.stringify({order:['live']}));
  });
  await page.goto('/');
  const menu=page.locator('#grid .collaboration');
  await expect(menu.locator('summary')).toBeVisible();
  await menu.locator('summary').click();
  const bounds=await menu.locator('.collaboration-menu').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
  await page.waitForFunction(()=>!refreshInFlight && !collaborationRefreshInFlight);
  state.active=false;
  await page.clock.runFor(91000);
  await expect(menu).toBeHidden();
  await expect(page.locator('#list .collaboration-indicator')).toHaveCount(0);
  state.active=true;
  await page.clock.runFor(91000);
  await expect(menu).toBeVisible();
  state.fail=true;
  await page.clock.runFor(91000);
  await expect(menu).toBeHidden();
  await expect(page.locator('#disconnect')).toBeVisible();
  await expect(page.locator('#grid .tile')).toHaveCount(1);
  await expect(page.locator('#notice')).toHaveText('');
  expect(errors).toEqual([]);
});

async function nameGrid(page, name) {
  await page.locator('#grid-name').fill(name);
  await page.locator('#grid-form-submit').click();
  await expect(page.locator('#grids-dialog')).not.toBeVisible();
}
async function openGridManager(page) {
  if (await page.locator('#grid-switcher summary').isVisible()) { await page.locator('#grid-switcher summary').click(); await page.locator('#grids-open').click(); }
  else await page.locator('#grids-shortcut').click();
}
test('named grids migrate, copy without reloading players, rename, switch and delete safely',async({page})=>{
  const errors=await setup(page);await mockChat(page);
  await page.addInitScript(()=>{
    if(!localStorage.getItem('tg.layout.guest'))localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one','two'],focused:'one',chatOpen:true,chatPosition:'left',volume:{one:0.25},paused:{two:true}}));
  });
  await page.goto('/');
  await expect(page.locator('#current-grid-name')).toHaveText('Grille par défaut');
  await page.evaluate(()=>window.savedPlayers=[...tiles.values()].map(t=>t.player));
  await openGridManager(page);await page.locator('#grid-save-copy').click();
  await nameGrid(page,'Soirée <img src=x>');
  expect(await page.evaluate(()=>[...tiles.values()].every((t,i)=>t.player===window.savedPlayers[i]))).toBe(true);
  await expect(page.locator('#current-grid-name')).toHaveText('Soirée <img src=x>');
  await openGridManager(page);
  await expect(page.locator('#saved-grids strong img')).toHaveCount(0);
  await page.locator('.saved-grid').filter({hasText:'Soirée <img src=x>'}).locator('.rename-grid').click();
  await nameGrid(page,'Soirée');
  await openGridManager(page);await page.locator('#grid-new').click();
  await expect(page.locator('#grid-name')).toHaveValue('Grille 3');await nameGrid(page,'Travail');
  await expect(page.locator('#grid .tile')).toHaveCount(0);
  await expect(page.locator('#empty')).toBeVisible();
  await page.locator('#grid-switcher summary').click();
  await expect(page.locator('#grid-menu-list .open-grid')).toHaveCount(3);
  await page.locator('#grid-menu-list .open-grid').filter({hasText:'Soirée'}).click();
  await expect(page.locator('#grid-switcher')).not.toHaveAttribute('open','');
  await expect(page.locator('#grids-dialog')).not.toBeVisible();
  await expect(page.locator('#current-grid-name')).toHaveText('Soirée');
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  await page.locator('#grid-switcher summary').click();
  await page.locator('#grid-menu-list .open-grid').filter({hasText:'Travail'}).click();
  await expect(page.locator('#grid .tile')).toHaveCount(0);
  await openGridManager(page);await page.locator('.saved-grid').filter({hasText:'Soirée'}).locator('.open-grid').click();
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  expect(await page.evaluate(()=>({order,focused,chatOpen:tiles.get('one').chatOpen,chatPosition:tiles.get('one').chatPosition,volume:tiles.get('one').volume,paused:tiles.get('two').paused})))
    .toEqual({order:['one','two'],focused:'one',chatOpen:true,chatPosition:'left',volume:0.25,paused:true});
  await page.reload();await expect(page.locator('#current-grid-name')).toHaveText('Soirée');
  await openGridManager(page);await page.locator('.saved-grid').filter({hasText:'Soirée'}).locator('.delete-grid').click();
  await page.locator('#grid-form-cancel').click();await expect(page.locator('.saved-grid')).toHaveCount(3);
  await page.locator('.saved-grid').filter({hasText:'Soirée'}).locator('.delete-grid').click();await page.locator('#grid-form-submit').click();
  await expect(page.locator('#current-grid-name')).toHaveText('Grille par défaut');
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  await openGridManager(page);await expect(page.locator('.saved-grid')).toHaveCount(2);
  expect(errors).toEqual([]);
});
test('grids stay separate between modes and deleting the final grid creates a blank default',async({page})=>{
  const errors=await setup(page,true);await api(page);
  await page.addInitScript(()=>{
    sessionStorage.setItem('tg.session',JSON.stringify('valid'));
    if(!localStorage.getItem('tg.layout.connected'))localStorage.setItem('tg.layout.connected',JSON.stringify({order:['live']}));
    if(!localStorage.getItem('tg.layout.guest'))localStorage.setItem('tg.layout.guest',JSON.stringify({order:['guest']}));
  });
  await page.goto('/');await openGridManager(page);await page.locator('#grid-save-copy').click();await nameGrid(page,'Compte Twitch');
  await page.locator('#disconnect').click();await expect(page.locator('#current-grid-name')).toHaveText('Grille par défaut');
  await openGridManager(page);await expect(page.locator('.saved-grid')).toHaveCount(1);
  await page.locator('.delete-grid').click();await page.locator('#grid-form-submit').click();
  await expect(page.locator('#grid .tile')).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tg.grids.guest')).items.length)).toBe(1);
  await page.reload();await expect(page.locator('#current-grid-name')).toHaveText('Compte Twitch');
  await expect(page.locator('#grid .tile')).toHaveCount(1);
  expect(errors).toEqual([]);
});
test('a collaboration can open in its own named grid without changing the original',async({page})=>{
  const errors=await setup(page);await collaborationFixture(page,false);
  await page.addInitScript(()=>localStorage.setItem('tg.layout.guest',JSON.stringify({order:['live']})));
  await page.goto('/');await page.locator('#grid .collaboration summary').click();
  await page.locator('.create-collaboration-grid').click();await nameGrid(page,'Duo du soir');
  await expect(page.locator('#grid .tile')).toHaveCount(3);
  expect(await page.evaluate(()=>({order,pins,locked,chatOpen:[...tiles.values()].some(t=>t.chatOpen),grids:gridStore.items.map(i=>i.layout.order)})))
    .toEqual({order:['live','partner','third'],pins:['live','partner','third'],locked:true,chatOpen:false,grids:[['live'],['live','partner','third']]});
  // a multi-stream opens locked, with everyone pinned in a plain grid of full players and only the source audible
  await expect(page.locator('#grid .tile iframe[data-controls="true"]')).toHaveCount(3);
  await expect(page.locator('#grid')).not.toHaveClass(/focused/);
  await expect(page.locator('#grid-lock')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>add({twitch:'sidebar',display:'Sidebar',profileUrl:''}))).toBe(false);
  expect(await page.evaluate(()=>[...tiles.values()].map(t=>t.muted))).toEqual([false,true,true]);
  await openGridManager(page);await page.locator('.saved-grid').filter({hasText:'Grille par défaut'}).locator('.open-grid').click();
  await expect(page.locator('#grid .tile')).toHaveCount(1);
  expect(errors).toEqual([]);
});
test('language and theme changes persist without recreating video players',async({page})=>{
  const errors=await setup(page);await mockChat(page);
  await page.addInitScript(()=>{
    localStorage.setItem('tg.favorites',JSON.stringify([{twitch:'one',display:'Ajouter'}]));
    if(!localStorage.getItem('tg.layout.guest'))localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one'],chatOpen:true}));
  });
  await page.goto('/');await page.evaluate(()=>window.settingsPlayer=tiles.get('one').player);
  await page.locator('#language-setting').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('#q')).toHaveAttribute('placeholder','Find a streamer…');
  await expect(page.locator('#grid .bar > b')).toHaveText('Ajouter');
  await expect(page.locator('#current-grid-name')).toHaveText('Default grid');
  await page.locator('#language-setting').selectOption('nl');
  await expect(page.locator('#current-grid-name')).toHaveText('Standaardraster');
  await page.locator('#theme-setting').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.locator('.chat iframe')).not.toHaveAttribute('src',/darkpopout/);
  await page.locator('#theme-setting').selectOption('dark');
  await page.emulateMedia({colorScheme:'light'});
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.locator('#theme-setting').selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  expect(await page.evaluate(()=>tiles.get('one').player===window.settingsPlayer)).toBe(true);
  await page.keyboard.press('Escape');await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','nl');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.locator('#q')).toHaveAttribute('placeholder','Een streamer zoeken…');
  expect(errors).toEqual([]);
});
test('workspace controls work collapsed on mobile and dialogs keep focus without changing spotlight',async({page})=>{
  const errors=await setup(page);await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one','two'],focused:'one',collapsed:true})));
  await page.goto('/');await page.locator('#toggle').click();
  await expect(page.locator('#theme-setting')).toBeVisible();
  const box=await page.locator('#preferences').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
  await page.locator('#toggle').click();
  await expect(page.locator('#grid .big')).toHaveAttribute('data-login','one');
  await page.locator('#grids-shortcut').click();await expect(page.locator('#saved-grids .saved-grid')).toHaveCount(1);
  await page.locator('#grid-new').click();await nameGrid(page,'Mobile');
  await expect(page.locator('#grid .tile')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('hovering a live channel in the sidebar shows the floating preview', async ({ page }) => {
  const errors = await setup(page);
  await page.route('**/api/search?**', route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has('collaboration')) return route.fulfill({json:{data:[]}});
    const logins = params.has('login') ? params.getAll('login') : [params.get('q').toLowerCase()];
    return route.fulfill({json:{data:logins.map(login => ({broadcaster_login:login,display_name:login,is_live:true,game_name:'Art',thumbnail_url:'',viewer_count:12,title:'Titre'}))}});
  });
  await page.addInitScript(() => localStorage.setItem('tg.favorites', JSON.stringify([{twitch:'zerator',display:'ZeratoR'}])));
  await page.goto('/');
  await page.locator('#list [data-login="zerator"]').hover();
  await expect(page.locator('#preview')).toBeVisible();
  await expect(page.locator('#preview .name')).toHaveText(/zerator/i);
  await page.mouse.move(900, 700);
  await expect(page.locator('#preview')).toBeHidden();
  expect(errors).toEqual([]);
});
