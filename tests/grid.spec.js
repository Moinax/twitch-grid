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
  await page.locator('#grid [data-login="zerator"] .bar b').click();
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
  await page.locator('#grid [data-login="found"] .bar b').click();
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
  await page.locator('#grid [data-login="live"] .bar b').click();
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
  await expect(one.locator('.min')).toBeHidden();
  await expect(one.locator('.close')).toBeVisible();
  await expect(one.locator('.fs')).toBeVisible();
  await expect(page.locator('#grid')).not.toHaveClass(/focused/);
  expect(await one.locator('.player').evaluate(el => getComputedStyle(el, '::after').content)).toBe('none');
  await page.clock.runFor(2500);
  await page.evaluate(() => { window.singlePlayer = tiles.get('one').player; });
  await one.locator('.bar b').click();
  expect(await page.evaluate(() => tiles.get('one').player === window.singlePlayer && focused === null)).toBe(true);
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
  await expect(page.locator('#grid .min')).toBeHidden();
  expect(await page.evaluate(() => tiles.get('one').player === window.singlePlayer)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')).focused)).toBeNull();
});
test('spotlight shows full controls and preserves the other players when switching', async ({ page }) => {
  const errors = await setup(page); await page.goto('/');
  for (const login of ['one', 'two', 'three']) { await favorite(page, login); await page.locator(`#list [data-login="${login}"] .channel`).click(); }
  await page.evaluate(() => { window.untouchedPlayer = tiles.get('three').player; });
  await page.locator('#grid [data-login="one"] .bar b').click();
  await expect(page.locator('#grid .big iframe')).toHaveAttribute('data-controls', 'true');
  await expect(page.locator('#grid .big .ctl')).toBeHidden();
  await expect(page.locator('#grid [data-login="two"] iframe')).toHaveAttribute('data-controls', 'false');
  await page.locator('#grid [data-login="two"] .bar b').click();
  await expect(page.locator('#grid [data-login="one"] iframe')).toHaveAttribute('data-controls', 'false');
  await expect(page.locator('#grid [data-login="two"] iframe')).toHaveAttribute('data-controls', 'true');
  expect(await page.evaluate(() => tiles.get('three').player === window.untouchedPlayer)).toBe(true);
  await page.locator('#grid .big .min').click();
  await expect(page.locator('#grid .tile iframe[data-controls="false"]')).toHaveCount(3);
  await expect(page.locator('#grid [data-login="two"] .ctl')).toBeVisible();
  expect(errors).toEqual([]);
});
test('native pause, volume and mute survive the watchdog and returning to the grid', async ({ page }) => {
  const errors = await setup(page); await page.clock.install(); await page.goto('/');
  await favorite(page, 'one'); await page.locator('#list .channel').click();
  await favorite(page, 'two'); await page.locator('#list [data-login="two"] .channel').click();
  await page.locator('#grid [data-login="one"] .bar b').click();
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
  await page.locator('#grid [data-login="one"] .bar b').click(); await page.clock.runFor(1000);
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
  const focusedBefore = await page.evaluate(() => focused);
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
  expect(await tile.boundingBox()).toEqual(before);
  await button.click();
  await page.keyboard.press('Escape');
  await expect(tile).not.toHaveClass(/expanded/);
  expect(await page.evaluate(() => focused)).toBe(focusedBefore);
  expect(await page.locator('#side').evaluate(el=>el.inert)).toBe(false);
  expect(await page.evaluate(() => [...tiles.values()].every((t,i)=>t.player===window.expansionPlayers[i]))).toBe(true);
  expect(await page.evaluate(() => tiles.get('one').volume)).toBe(0.35);
  await button.click();
  if (single) await tile.locator('.close').click();
  else await tile.locator('.min').click();
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
