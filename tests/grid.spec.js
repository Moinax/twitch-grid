const { test, expect } = require('@playwright/test');
const { mockPlayer } = require('./fixtures.cjs');
async function setup(page, connected = false, landing = false) {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  if (!landing) await page.addInitScript(() => sessionStorage.setItem('tg.landing', 'true'));
  await page.route('https://player.twitch.tv/js/embed/v1.js', r => r.fulfill({ contentType: 'text/javascript', body: mockPlayer }));
  await page.route('**/api/search?**', route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has('collaboration')) return route.fulfill({json:{data:[]}});
    if (params.has('login')) return route.fulfill({json:{data:params.getAll('login').map(login => ({broadcaster_login:login,is_live:true}))}});
    const login = params.get('q').toLowerCase();
    return route.fulfill({json:{data:[{broadcaster_login:login,display_name:login,is_live:true,game_name:'',thumbnail_url:''}]}});
  });
  await page.route('**/config.json', r => r.fulfill({ json: { twitchClientId: connected ? 'test-client' : '' } }));
  await page.route('**/_vercel/**', r => r.fulfill({ body: '' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '' }));
  return errors;
}
async function readyPlayers(page) {
  await expect.poll(() => page.evaluate(() => restored && !refreshInFlight && [...tiles.values()].every(t => showPoster(t) || t.ready))).toBe(true);
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
  await page.locator('#grid [data-login="zerator"] .spotlight').click();
  await expect(page.locator('#grid [data-login="zerator"]')).toHaveClass(/big.*loud|loud.*big/);
  await page.locator('#playall').click();
  await page.reload();
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  await expect(page.locator('#grid [data-login="zerator"]')).toHaveClass(/big/);
  await expect(page.locator('#playall')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#list [data-login="zerator"] .favorite').click();
  await expect(page.locator('#list li')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  await expect(page.locator('#list li')).toHaveCount(1);
  await page.locator('#grid .big .spotlight').click();
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
  await page.locator('#grid [data-login="found"] .spotlight').click();
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
      paused:{guesttwo:true}
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
  await page.locator('#grid [data-login="live"] .spotlight').click();
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
  await expect(page.locator('#grid [data-login="altair"]')).toHaveClass(/poster-only/);
  await expect(page.locator('#grid [data-login="altair"] iframe')).toHaveCount(0);
  expect(await page.evaluate(() => tiles.get('altair').paused)).toBe(true);
  expect(errors).toEqual([]);
});
for (const [index, position] of ['navigation', 'hero', 'footer'].entries()) test(`landing ${position} connects on the first click after configuration loads`, async ({ page }) => {
  const errors = await setup(page, true, true);
  await api(page);
  let config;
  const holdConfig = route => { config = route; };
  await page.route('**/config.json', holdConfig);
  await page.route('https://id.twitch.tv/oauth2/authorize?**', route => route.fulfill({body:'Twitch authorization'}));
  await page.goto('/');
  const button = page.locator('#landing .landing-connect').nth(index);
  await expect(button).toBeDisabled();
  await expect.poll(() => !!config).toBe(true);
  await config.fulfill({json:{twitchClientId:'test-client'}});
  await page.unroute('**/config.json', holdConfig);
  await expect(button).toBeEnabled();
  const origin = new URL(page.url()).origin;
  await button.click();
  await page.waitForURL('https://id.twitch.tv/oauth2/authorize?**', {timeout:5000});
  const authorization = new URL(page.url()).searchParams;
  expect(authorization.get('redirect_uri')).toBe(origin);
  const state = authorization.get('state');
  expect(state).toBeTruthy();
  await page.goto(`${authorization.get('redirect_uri')}/#access_token=fake-token&state=${state}`);
  await expect(page.locator('#disconnect')).toBeVisible();
  await expect(page.locator('#landing')).toBeHidden();
  await expect(page.locator('#list .channel')).toHaveCount(2);
  expect(errors).toEqual([]);
});
test('Twitch login still opens when the player script fails', async ({ page }) => {
  await setup(page, true, true);
  await page.route('https://player.twitch.tv/js/embed/v1.js', r => r.abort());
  await page.route('https://id.twitch.tv/oauth2/authorize?**', r => r.fulfill({body:'Twitch authorization'}));
  await page.goto('/');
  await expect(page.locator('#landing')).toBeVisible();
  await page.locator('#landing-connect').click();
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
  await expect(page.locator('[data-login="live"] .g')).toHaveText('Art');
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
  const errors = await setup(page, false, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#landing')).toBeVisible();
  await expect(page.locator('#landing-connect')).toBeHidden();
  await page.locator('#landing-guest').click();
  await expect(page.locator('#landing')).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/collapsed/);
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
  await expect(one.locator('.volume')).toBeHidden();
  await expect(one.locator('.spotlight')).toBeHidden();
  await expect(one.locator('.close')).toBeVisible();
  await expect(one.locator('.fs')).toBeVisible();
  await expect(page.locator('#grid')).not.toHaveClass(/focused/);
  expect(await one.locator('.player').evaluate(el => getComputedStyle(el, '::after').content)).toBe('none');
  await page.clock.runFor(2500);
  await page.evaluate(() => { window.singlePlayer = tiles.get('one').player; });
  await one.locator('.bar b').click();
  expect(await page.evaluate(() => tiles.get('one').player === window.singlePlayer)).toBe(true);
  const bounds = await one.boundingBox(), gridBounds = await page.locator('#grid').boundingBox();
  expect(bounds.width).toBeCloseTo(gridBounds.width, 0);
  await page.evaluate(() => { const p = tiles.get('one').player; p.setVolume(0.25); p.setMuted(true); p.setQuality('720p60'); p.pause(); });
  await page.locator('#list [data-login="two"] .channel').click();
  await expect(page.locator('#grid iframe[data-controls="false"]')).toHaveCount(1);
  await expect(one).toHaveClass(/poster-only/);
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => ({ paused:tiles.get('one').paused, volume:tiles.get('one').volume, muted:tiles.get('one').muted })))
    .toEqual({paused:true,volume:0.25,muted:true});
  await page.locator('#grid [data-login="two"] .close').click();
  await expect(one).toHaveClass(/full-player/);
  await page.locator('#q').hover();
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => ({ paused:tiles.get('one').paused, quality:tiles.get('one').quality })))
    .toEqual({paused:true,quality:'720p60'});
  await page.reload();
  await expect(one).toHaveClass(/poster-only/);
  await one.locator('.player').click({position:{x:12,y:12}});
  await page.clock.runFor(1000);
  await expect(one.locator('iframe')).toHaveAttribute('data-controls', 'true');
  await expect(page.locator('#grid')).not.toHaveClass(/focused/);
  await one.locator('.close').click();
  await expect(page.locator('#grid .tile')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('removing the second tile clears a saved spotlight without recreating the remaining full player', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem('tg.layout.guest', JSON.stringify({order:['one','two'],focused:'one'})));
  await page.goto('/'); await readyPlayers(page);
  await expect(page.locator('#grid')).toHaveClass(/focused/);
  await page.evaluate(() => { window.singlePlayer = tiles.get('one').player; });
  await page.locator('#grid [data-login="two"] .close').click();
  await expect(page.locator('#grid')).not.toHaveClass(/focused/);
  await expect(page.locator('#grid .spotlight')).toBeHidden();
  expect(await page.evaluate(() => tiles.get('one').player === window.singlePlayer)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')).focused)).toBeNull();
});
test('the spotlight button and a click on a small tile bring one stream in front with the sound', async ({ page }) => {
  const errors = await setup(page); await page.goto('/');
  for (const login of ['one', 'two', 'three']) { await favorite(page, login); await page.locator(`#list [data-login="${login}"] .channel`).click(); }
  const one = page.locator('#grid [data-login="one"]'), two = page.locator('#grid [data-login="two"]'), three = page.locator('#grid [data-login="three"]');
  await expect(page.locator('#grid')).not.toHaveClass(/focused/);
  await expect(page.locator('#grid .tile iframe[data-controls="false"]')).toHaveCount(3);
  await three.locator('.spotlight').click();
  await expect(three.locator('iframe')).toHaveAttribute('data-controls', 'true');
  await expect(two.locator('iframe')).toHaveAttribute('data-controls', 'false');
  await expect(page.locator('#grid')).toHaveClass(/focused/);
  await expect(three.locator('.spotlight')).toHaveAttribute('aria-pressed', 'true');
  await expect(three.locator('.spotlight')).toHaveAttribute('aria-label', 'Revenir à la grille');
  await expect(one.locator('.spotlight')).toHaveAttribute('aria-label', 'Spotlight');
  expect(await page.evaluate(() => ({ focused, muted: [...tiles.values()].map(t => t.muted) }))).toEqual({ focused: 'three', muted: [true, true, false] });
  // the spotlight keeps its remove button; the button in its bar brings it back to the grid
  await expect(three.locator('.close')).toBeVisible();
  await three.locator('.spotlight').click();
  expect(await page.evaluate(() => ({ focused, muted: [...tiles.values()].map(t => t.muted) }))).toEqual({ focused: null, muted: [true, true, true] });
  await expect(page.locator('#grid')).not.toHaveClass(/focused/);
  // the button also brings a small tile in front; another tile replaces it, and the sound follows
  await one.locator('.spotlight').click();
  expect(await page.evaluate(() => focused)).toBe('one');
  await two.locator('.spotlight').click();
  await expect(two.locator('iframe')).toHaveAttribute('data-controls', 'true');
  await expect(one.locator('iframe')).toHaveAttribute('data-controls', 'false');
  expect(await page.evaluate(() => ({ focused, muted: [...tiles.values()].map(t => t.muted) }))).toEqual({ focused: 'two', muted: [true, false, true] });
  // a stream from the sidebar takes the spotlight's place
  await favorite(page, 'four'); await page.locator('#list [data-login="four"] .channel').click();
  expect(await page.evaluate(() => focused)).toBe('four');
  await expect(page.locator('#grid [data-login="four"] iframe')).toHaveAttribute('data-controls', 'true');
  // Escape drops the spotlight once the sidebar preview is out of the way
  await page.locator('#q').focus(); await expect.poll(() => page.evaluate(() => previewRow)).toBeNull();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => ({ focused, muted: [...tiles.values()].map(t => t.muted) }))).toEqual({ focused: null, muted: [true, true, true, true] });
  await expect(page.locator('#grid .tile iframe[data-controls="false"]')).toHaveCount(4);
  // removing the spotlight itself clears the front
  await one.locator('.spotlight').click();
  await one.locator('.close').click();
  expect(await page.evaluate(() => ({ focused, count: tiles.size }))).toEqual({ focused: null, count: 3 });
  expect(errors).toEqual([]);
});
test('tiles drag onto any other tile: sliding within the grid order, or taking the spotlight when dropped on it', async ({ page }) => {
  const errors = await setup(page);
  await page.addInitScript(() => localStorage.setItem('tg.layout.guest', JSON.stringify({ order: ['one', 'two', 'three', 'four'], focused: 'one' })));
  await page.goto('/');
  const tile = login => page.locator(`#grid [data-login="${login}"]`);
  const state = () => page.evaluate(() => ({ order, focused }));
  expect(await page.evaluate(() => [...tiles].map(([login, t]) => [login, t.bar.draggable]))).toEqual([['one', false], ['two', true], ['three', true], ['four', true]]);
  await expect(tile('one').locator('.bar')).toHaveCSS('cursor', 'default');
  await expect(tile('two').locator('.bar')).toHaveCSS('cursor', 'grab');
  // Only the hovered destination shows a drop overlay.
  const source = await tile('two').locator('.bar').boundingBox(), target = await tile('four').boundingBox();
  await page.mouse.move(source.x+12,source.y+16);
  await page.mouse.down();
  await page.mouse.move(source.x+28,source.y+16,{steps:4});
  await expect(page.locator('body')).toHaveClass(/dragging/);
  await expect(page.locator('#grid .drop:visible')).toHaveCount(0);
  await expect(tile('two')).toHaveCSS('opacity','1');
  await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:8});
  await expect(tile('four')).toHaveClass(/over/);
  await expect(tile('four').locator('.drop')).toBeVisible();
  await expect(page.locator('#grid .drop:visible')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.drop-target')).toHaveCount(0);
  // the tile slides: after the target going down, before it going up
  await tile('two').locator('.bar').dragTo(tile('four'));
  expect(await state()).toEqual({ order: ['one', 'three', 'four', 'two'], focused: 'one' });
  await tile('two').locator('.bar').dragTo(tile('three'));
  expect(await state()).toEqual({ order: ['one', 'two', 'three', 'four'], focused: 'one' });
  await tile('four').locator('.bar').dragTo(tile('one'));   // dropped on the spotlight: four takes it with the sound, one goes back to its place in the grid
  expect(await state()).toEqual({ order: ['one', 'two', 'three', 'four'], focused: 'four' });
  expect(await page.evaluate(() => [...tiles.values()].map(t => t.muted))).toEqual([true, true, true, false]);
  await expect(tile('four').locator('.player iframe')).toHaveAttribute('data-controls', 'true');
  await expect(tile('one').locator('.player iframe')).toHaveAttribute('data-controls', 'false');
  expect(await page.evaluate(() => Object.fromEntries([...tiles].map(([login, t]) => [login, +t.el.style.order])))).toEqual({ one: 0, two: 1, three: 2, four: 0 });
  expect(errors).toEqual([]);
});
test(`drops over cross-origin stalled players reorder tiles and change spotlight`, async ({page}) => {
  const errors = await setup(page);
  await page.setViewportSize({width:1700,height:1100});
  await page.route('https://player.twitch.tv/js/embed/v1.js', r => r.fulfill({contentType:'text/javascript',body:mockPlayer.replace('el.appendChild(this.frame);', "this.frame.src = 'https://player.twitch.tv/?drag-target=1'; el.appendChild(this.frame);")}));
  await page.route('https://player.twitch.tv/?drag-target=1', r => r.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#222;color:white">Player</body>'}));
  await page.route('**/api/search?**', r => r.fulfill({json:{data:['one','two','three','four'].map(broadcaster_login => ({broadcaster_login,is_live:true}))}}));
  await page.addInitScript(() => {
    localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one','two','three','four'],focused:'one'}));
  });
  await page.goto('/');
  const tile = login => page.locator(`#grid [data-login="${login}"]`);
  await expect.poll(() => page.evaluate(() => [...tiles.values()].every(t => t.hasPlayed))).toBe(true);
  for (const login of ['one','four']) {
    await expect(tile(login).frameLocator('.player iframe').locator('body')).toHaveText('Player');
    await page.evaluate(login => { const t=tiles.get(login); t.player.paused=true; t.player.emit('playbackBlocked'); }, login);
    await expect(tile(login)).toHaveClass(/stalled/);
    await expect(tile(login).locator('.player iframe')).toHaveCSS('pointer-events','auto');
  }
  async function dropOverPlayer(from, to) {
    const source = await tile(from).locator('.bar').boundingBox(), target = await tile(to).locator('.player').boundingBox();
    await page.mouse.move(source.x+12,source.y+16);
    await page.mouse.down();
    // Cross the threshold before moving over the embedded document.
    await page.mouse.move(source.x+28,source.y+16,{steps:4});
    await expect(page.locator('body')).toHaveClass(/dragging/);
    await expect(page.locator('#grid .drop:visible')).toHaveCount(0);
    await expect(tile(from)).toHaveCSS('opacity','1');
    await expect(page.locator('.drag-ghost')).toBeVisible();
    await expect(page.locator('.drag-ghost .bar > b')).toHaveText(await tile(from).locator('.bar > b').innerText());
    await expect(page.locator('.drag-ghost iframe')).toHaveCount(0);
    await expect(page.locator('.drag-ghost .drag-poster')).toHaveAttribute('src',new RegExp('live_user_' + from));
    const miniature = await page.locator('.drag-ghost').boundingBox(), preview = await page.locator('.drag-preview').boundingBox();
    expect(miniature.width).toBeLessThanOrEqual(200);
    expect(preview.width / preview.height).toBeCloseTo(16/9, 1);
    const spotlight = await page.locator('#grid .tile.big').boundingBox();
    expect(miniature.x).toBeGreaterThanOrEqual(spotlight.x + spotlight.width);

    await expect(tile(to).locator('.player iframe')).toHaveCSS('pointer-events','none');
    await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:8});
    await expect(tile(to).locator('.drop')).toBeVisible();
    await expect(page.locator('#grid .drop:visible')).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator('#grid .drop:visible')).toHaveCount(0);
    await expect(page.locator('.drag-ghost')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => dragging)).toBe(null);
    await expect(page.locator('body')).not.toHaveClass(/dragging/);
  }
  await dropOverPlayer('two','four');
  expect(await page.evaluate(() => order)).toEqual(['one','three','four','two']);
  await expect(tile('four').locator('.player iframe')).toHaveCSS('pointer-events','auto');
  await dropOverPlayer('two','three');
  expect(await page.evaluate(() => order)).toEqual(['one','two','three','four']);
  await dropOverPlayer('four','one');
  expect(await page.evaluate(() => focused)).toBe('four');
  await dropOverPlayer('one','four');
  expect(await page.evaluate(() => focused)).toBe('one');
  await dropOverPlayer('three','four');
  expect(await page.evaluate(() => order)).toEqual(['one','two','four','three']);
  await dropOverPlayer('two','one');
  expect(await page.evaluate(() => focused)).toBe('two');
  await dropOverPlayer('three','four');
  expect(await page.evaluate(() => ({dragging,order}))).toEqual({dragging:null,order:['one','two','three','four']});
  await expect(page.locator('.over, .drop-target, .dragged')).toHaveCount(0);
  await dropOverPlayer('four','three');
  expect(await page.evaluate(() => order)).toEqual(['one','two','four','three']);
  // Cancelling a drag must leave the spotlight and the next drop intact.
  const source = await tile('four').locator('.bar').boundingBox();
  await page.mouse.move(source.x+12,source.y+16);
  await page.mouse.down();
  await page.mouse.move(source.x+28,source.y+16,{steps:4});
  await expect(page.locator('body')).toHaveClass(/dragging/);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await page.evaluate(() => focused)).toBe('two');
  await expect(page.locator('body')).not.toHaveClass(/dragging/);
  await dropOverPlayer('four','three');
  expect(await page.evaluate(() => order)).toEqual(['one','two','three','four']);
  await expect(page.locator('body')).not.toHaveClass(/dragging/);
  await expect(page.locator('.drop-target')).toHaveCount(0);
  await expect(tile('two').locator('.player iframe')).toHaveCSS('pointer-events','auto');
  await expect(page.locator('#grid .drop:visible')).toHaveCount(0);
  // Releasing over the sidebar cancels; the next drag still crosses the iframe.
  const outsideSource = await tile('four').locator('.bar').boundingBox();
  await page.mouse.move(outsideSource.x+12,outsideSource.y+16);
  await page.mouse.down();
  await page.mouse.move(20,200,{steps:8});
  await page.mouse.up();
  expect(await page.evaluate(() => ({dragging,order}))).toEqual({dragging:null,order:['one','two','three','four']});
  await dropOverPlayer('four','three');
  expect(await page.evaluate(() => order)).toEqual(['one','two','four','three']);
  expect(errors).toEqual([]);
});

test('a pointer drag scrolls the tile column and stops scrolling when cancelled', async ({page}) => {
  const errors = await setup(page);
  await page.setViewportSize({width:1280,height:720});
  await page.addInitScript(() => localStorage.setItem('tg.layout.guest', JSON.stringify({order:['one','two','three','four','five','six','seven','eight','nine','ten','eleven'],focused:'one'})));
  await page.goto('/');
  const source = await page.locator('#grid [data-login="two"] .bar').boundingBox();
  const box = await page.locator('#grid').boundingBox();
  await page.mouse.move(source.x+12,source.y+16);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width-30,box.y+box.height-10,{steps:8});
  await expect.poll(() => page.evaluate(() => grid.scrollTop)).toBeGreaterThan(100);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  const top = await page.evaluate(() => grid.scrollTop);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => ({top:grid.scrollTop,dragging,focused}))).toEqual({top,dragging:null,focused:'one'});
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
  await page.route('**/api/search?**', r => r.fulfill({ json: { data: ['one', 'two', 'three'].map(broadcaster_login => ({ broadcaster_login, is_live: true })) } }));   // live channels: offline ones would disable their play button
  await page.addInitScript(() => localStorage.setItem('tg.layout.guest', JSON.stringify({ order: ['one', 'two', 'three'], focused: 'one', muted: { one: false, two: false, three: true } })));
  await page.goto('/'); await page.locator('#audio-overlay').click();
  const button = page.locator('#muteall'), state = () => page.evaluate(() => ({ mutedAll, muted: [...tiles.values()].map(t => t.muted) }));
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveAttribute('aria-label','Réactiver le son');
  await page.mouse.move(0, 0);
  await expect(button).toHaveAttribute('aria-label', 'Réactiver le son');
  expect(await state()).toEqual({ mutedAll: ['one', 'two'], muted: [true, true, true] });
  // the tile sound controls step aside and say why; a click on them changes nothing
  const sound = page.locator('#grid [data-login="three"] .bar .snd');
  await expect(sound).toHaveAttribute('aria-disabled', 'true');
  await sound.hover();
  await expect(sound).toHaveAttribute('aria-label','Son coupé globalement');
  await sound.click({force:true});   // Playwright honours aria-disabled; force the click to prove it is inert
  expect(await state()).toEqual({ mutedAll: ['one', 'two'], muted: [true, true, true] });
  await expect(page.locator('#grid [data-login="three"] .volume input')).toBeDisabled();
  await page.mouse.move(0, 0);
  // the global mute outranks the spotlight: the tile coming to the front stays silent, the set follows the intent, and the others keep theirs
  await page.locator('#grid [data-login="three"] .spotlight').click();
  await expect(page.locator('#grid [data-login="three"]')).toHaveClass(/big/);
  expect(await state()).toEqual({ mutedAll: ['one', 'two', 'three'], muted: [true, true, true] });
  await expect.poll(() => page.evaluate(() => !tiles.get('three').player.paused)).toBe(true);   // silent in front still plays
  await page.locator('#grid [data-login="one"] .spotlight').click();   // three leaves and gives back its silence
  expect(await state()).toEqual({ mutedAll: ['one', 'two'], muted: [true, true, true] });
  await page.evaluate(() => { const p = tiles.get('one').player; p.setMuted(false); });   // a native unmute is silenced again
  await expect.poll(() => page.evaluate(() => tiles.get('one').player.getMuted())).toBe(true);
  await page.reload();   // the saved set survives a reload
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(await state()).toEqual({ mutedAll: ['one', 'two'], muted: [true, true, true] });
  // no audio prompt while the global mute holds, even if a tile saved itself audible in the meantime
  await page.evaluate(() => { const layout = JSON.parse(localStorage.getItem('tg.layout.guest')); layout.muted.one = false; localStorage.setItem('tg.layout.guest', JSON.stringify(layout)); });
  await page.reload();
  await expect(page.locator('#grid .tile')).toHaveCount(3);
  await expect(page.locator('#audio-overlay')).toBeHidden();
  expect(await state()).toEqual({ mutedAll: ['one', 'two'], muted: [true, true, true] });
  await button.click();   // the button itself is the gesture that allows the sound back
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(await state()).toEqual({ mutedAll: null, muted: [false, false, true] });
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
  await page.mouse.move(0, 0);
  await expect(lock).toHaveAttribute('aria-label', 'Déverrouiller la grille');
  await expect(two).toBeDisabled();
  await expect(two).toHaveAttribute('data-tip', 'Grille verrouillée');
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
test('volume opens on hover and keyboard adjustment enables and saves sound', async ({ page }) => {
  const errors = await setup(page);
  await page.route('**/api/search?**', r => r.fulfill({ json: { data: ['one', 'two'].map(broadcaster_login => ({ broadcaster_login, is_live: true })) } }));   // live channels: offline ones would disable their play button
  await page.addInitScript(() => {
    if (!localStorage.getItem('tg.layout.guest')) localStorage.setItem('tg.layout.guest', JSON.stringify({order:['one','two'],paused:{two:true}}));
  });
  await page.goto('/');
  const one=page.locator('#grid [data-login="one"]'),two=page.locator('#grid [data-login="two"]');
  const volume=one.locator('.volume input');
  await page.locator('#q').hover();
  await expect(one.locator('.volume')).toBeHidden();
  await expect(volume).toBeHidden();
  await one.hover();
  await expect(one.locator('.volume')).toBeHidden();   // the video itself shows no controls
  await one.locator('.bar .snd').hover();   // the volume hangs under the sound button
  await expect(volume).toBeVisible();
  await expect(two.locator('.volume input')).toBeHidden();
  // the header play button mirrors the tile: two is paused, a click resumes it
  await expect(one.locator('.bar .pp')).toHaveAttribute('aria-pressed','false');
  await expect(two.locator('.bar .pp')).toHaveAttribute('aria-pressed','true');
  await expect(two.locator('.bar .pp')).toHaveAttribute('aria-label','Lecture');
  await two.locator('.bar .pp').click();
  await expect(two.locator('.bar .pp')).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(() => tiles.get('two').paused)).toBe(false);
  await two.locator('.bar .pp').click();
  await expect(two.locator('.bar .pp')).toHaveAttribute('aria-pressed','true');
  await one.locator('.bar .snd').hover();
  await expect.poll(() => page.evaluate(() => !!tiles.get('one').ready)).toBe(true);
  await volume.focus();
  await volume.press('ArrowUp');
  await expect(volume).toHaveValue('0.55');
  await expect(one).toHaveClass(/loud/);
  await expect(one.locator('.bar .snd')).toHaveAttribute('data-sound','on');
  expect(await page.evaluate(() => {
    const t=tiles.get('one');
    return {muted:t.muted,playerMuted:t.player.getMuted(),volume:t.player.getVolume(),paused:t.paused,otherMuted:tiles.get('two').muted};
  })).toEqual({muted:false,playerMuted:false,volume:0.55,paused:false,otherMuted:true});
  await page.locator('#q').focus();
  await page.locator('#q').hover();
  await expect(one.locator('.volume')).toBeHidden();
  await expect(volume).toBeHidden();
  await one.locator('.bar .snd').focus();
  await expect(one.locator('.volume')).toBeHidden();
  await page.locator('#q').focus();
  await expect(one.locator('.volume')).toBeHidden();
  await one.locator('.bar .snd').hover();
  await expect(volume).toBeVisible();
  // a press on the slider moves the thumb, never the tile: the bar's drag is cancelled from inside the popover
  expect(await volume.evaluate(el=>{const e=new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()});el.dispatchEvent(e);return {cancelled:e.defaultPrevented,dragging};})).toEqual({cancelled:true,dragging:null});
  await page.reload();
  await expect(one.locator('.snd')).toHaveAttribute('data-sound','muted');
  await page.locator('#audio-overlay button').click();
  await expect(one).toHaveClass(/loud/);
  await expect(volume).toHaveValue('0.55');
  expect(errors).toEqual([]);
});
test(`zero volume mutes and unmute restores an audible level`, async ({page}) => {
  const errors = await setup(page);
  await page.route('**/api/search?**', r => r.fulfill({json:{data:['one','two'].map(broadcaster_login => ({broadcaster_login,is_live:true}))}}));
  await page.addInitScript(() => {
    if (!localStorage.getItem('tg.layout.guest')) localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one','two'],paused:{two:true}}));
  });
  await page.goto('/');
  const tile = page.locator('#grid [data-login="one"]'), sound = tile.locator('.snd'), volume = tile.locator('.volume input');
  const state = () => page.evaluate(() => {
    const t = tiles.get('one');
    return {muted:t.muted,volume:t.volume,playerMuted:t.player?.getMuted(),playerVolume:t.player?.getVolume()};
  });
  await expect.poll(() => page.evaluate(() => tiles.get('one')?.ready)).toBe(true);
  await sound.hover();
  await expect(volume).toBeVisible();
  await volume.press('Home');
  await expect(sound).toHaveAttribute('data-sound','muted');
  await expect.poll(state).toEqual({muted:true,volume:0,playerMuted:true,playerVolume:0});
  await sound.click();
  await expect(volume).toHaveValue('0.5');
  await expect.poll(state).toEqual({muted:false,volume:0.5,playerMuted:false,playerVolume:0.5});
  await volume.press('ArrowDown'); await volume.press('ArrowDown');
  await expect(volume).toHaveValue('0.4');
  await sound.click();
  await expect.poll(state).toEqual({muted:true,volume:0.4,playerMuted:true,playerVolume:0.4});
  await page.reload();
  await expect(sound).toHaveAttribute('data-sound','muted');
  await expect(volume).toHaveValue('0.4');
  await expect.poll(() => page.evaluate(() => tiles.get('one')?.ready)).toBe(true);
  await sound.click();
  await expect.poll(state).toEqual({muted:false,volume:0.4,playerMuted:false,playerVolume:0.4});
  await sound.hover(); await volume.press('Home');
  await page.reload();
  await expect(sound).toHaveAttribute('data-sound','muted');
  await expect(volume).toHaveValue('0');
  await sound.click();
  await expect(volume).toHaveValue('0.5');
  await expect.poll(state).toEqual({muted:false,volume:0.5,playerMuted:false,playerVolume:0.5});
  expect(errors).toEqual([]);
});

test('the sound button toggles muted and on; the spotlight turns the sound on and gives back the state it found', async ({ page }) => {
  const errors=await setup(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('tg.layout.guest')) localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one','two']}));
  });
  await page.goto('/');
  const tile=page.locator('#grid [data-login="one"]'),other=page.locator('#grid [data-login="two"]');
  const header=tile.locator('.bar .snd');
  const state=()=>page.evaluate(()=>({one:tiles.get('one').muted,two:tiles.get('two').muted}));
  await expect(header).toHaveAttribute('data-sound','muted');
  await expect(header).toHaveAttribute('aria-label','Allumer le son');
  await header.click();
  expect(await state()).toEqual({one:false,two:true});
  await expect(header).toHaveAttribute('data-sound','on');
  await expect(header).toHaveAttribute('aria-label','Couper le son');
  await header.click();
  expect(await state()).toEqual({one:true,two:true});
  await tile.locator('.spotlight').click();   // the spotlight turns its sound on
  expect(await state()).toEqual({one:false,two:true});
  await other.locator('.spotlight').click();   // two takes the spotlight: one gets back the silence it had, two comes on
  expect(await state()).toEqual({one:true,two:false});
  await header.click();   // one turns its sound on from the side: it stays on, whatever the spotlight does
  expect(await state()).toEqual({one:false,two:false});
  await tile.locator('.spotlight').click();   // one takes the spotlight already on; two gets back its silence
  expect(await state()).toEqual({one:false,two:true});
  await header.click();   // muted by hand in the spotlight
  expect(await state()).toEqual({one:true,two:true});
  await page.keyboard.press('Escape');   // leaving gives back what it found: on
  expect(await state()).toEqual({one:false,two:true});
  await page.reload();
  expect(await state()).toEqual({one:false,two:true});
  await expect(header).toHaveAttribute('data-sound','muted');
  await page.keyboard.press('Enter');
  await expect(header).toHaveAttribute('data-sound','on');
  expect(errors).toEqual([]);
});
test('native pause, volume and mute survive the watchdog and returning to the grid', async ({ page }) => {
  const errors = await setup(page); await page.clock.install(); await page.goto('/');
  await favorite(page, 'one'); await page.locator('#list .channel').click();
  await favorite(page, 'two'); await page.locator('#list [data-login="two"] .channel').click();
  await page.locator('#grid [data-login="one"] .spotlight').click();
  await page.clock.runFor(2500);
  await page.locator('#q').hover();
  await page.evaluate(() => {
    const player = tiles.get('one').player;
    player.setVolume(0.25); player.setMuted(true); player.setQuality('720p60'); player.pause();
  });
  await page.clock.runFor(6000);
  expect(await page.evaluate(() => {
    const t = tiles.get('one'); return { paused:t.paused, muted:t.muted, volume:t.volume, playing:!!t.player && !t.player.paused };
  })).toEqual({ paused:true, muted:true, volume:0.25, playing:false });
  await page.locator('#grid .big .spotlight').click();
  await page.locator('#q').hover();
  await page.clock.runFor(1000);
  await expect(page.locator('#grid [data-login="one"] .volume input')).toHaveValue('0.25');
  expect(await page.evaluate(() => tiles.get('one').player)).toBeNull();
  await page.locator('#grid [data-login="one"] .player').click({position:{x:12,y:12}}); await page.locator('#grid [data-login="one"] .spotlight').click(); await page.clock.runFor(2000);   // resume the still, then the spotlight brings the full player and its quality back
  expect(await page.evaluate(() => tiles.get('one').player.getQuality())).toBe('720p60');
  expect(errors).toEqual([]);
});
test('Play on a poster resumes a spotlight restored in a paused state', async ({ page }) => {
  await setup(page); await page.clock.install();
  await page.route('**/api/search?**', r => r.fulfill({ json: { data: [{ broadcaster_login: 'one', is_live: true }, { broadcaster_login: 'two', is_live: true }] } }));   // the global pause only spreads to live tiles
  await page.addInitScript(() => localStorage.setItem('tg.layout.guest', JSON.stringify({order:['one','two'],focused:'one',allPaused:true,paused:{one:true}})));
  await page.goto('/'); await page.clock.runFor(1000);
  await expect(page.locator('#grid iframe')).toHaveCount(0);
  await page.locator('#grid [data-login="one"] .player').click({position:{x:12,y:12}});
  await page.clock.runFor(6000);
  expect(await page.evaluate(() => ({ allPaused, one:tiles.get('one').paused, two:tiles.get('two').paused, playing:!tiles.get('one').player.paused })))
    .toEqual({allPaused:false,one:false,two:true,playing:true});
});
test('the landing covers the app until the visitor continues without an account, remembered for the tab only', async ({ page }) => {
  const errors = await setup(page, true, true);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('#landing')).toBeVisible();
  await expect(page.locator('#side')).toBeHidden();
  await expect(page.locator('#empty')).toBeHidden();
  await expect(page.locator('#landing-connect')).toBeEnabled();
  await page.locator('#landing .reveal').scrollIntoViewIfNeeded();
  await expect(page.locator('#landing .reveal span').first()).toHaveClass(/in/);
  await page.locator('#landing-main').scrollIntoViewIfNeeded();
  for (const id of ['features', 'how', 'faq', 'privacy']) await expect(page.locator('#' + id)).toHaveCount(1);
  await page.locator('#landing-guest').click();
  await expect(page.locator('#landing')).toBeHidden();
  await expect(page.locator('#q')).toBeFocused();
  await expect(page.locator('#empty')).toBeVisible();
  await page.locator('#toggle').click();   // on mobile the open sidebar covers the empty state
  await page.locator('#show-landing').click();
  await expect(page.locator('#landing')).toBeVisible();
  await page.locator('#landing-guest').click();
  await expect(page.locator('#landing')).toBeHidden();
  await expect(page.locator('#top')).toHaveText('Connecter Twitch');
  await expect(page.locator('#guest')).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem('tg.guest'), localStorage.getItem('tg.landing')])).toEqual([null, null]);
  await page.reload();
  await expect(page.locator('#landing')).toBeHidden();
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
  await expect(page.locator('#list [data-login="altair"] .g')).toHaveText('Art');
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
  await page.setViewportSize({width:1800,height:1000});
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
  await expect(small.locator('.stream-info')).toBeVisible();
  await small.locator('.player').hover({position:{x:12,y:12}});
  await expect(small.locator('.stream-info')).toBeVisible();
  await expect(small.locator('.stream-info')).toHaveCSS('backdrop-filter', 'none');
  await page.locator('#toggle').hover();
  await expect(small.locator('.stream-info')).toBeVisible();
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
  await expect.poll(() => page.evaluate(() => [...tiles.values()].every(t => t.ready || showPoster(t)))).toBe(true);
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
  await expect.poll(() => tile.boundingBox()).toEqual(before);   // pinned boxes follow the grid through a ResizeObserver
  await button.click();
  await page.keyboard.press('Escape');
  await expect(tile).not.toHaveClass(/expanded/);
  expect(await page.evaluate(() => focused)).toEqual(focusedBefore);
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
  await page.locator('.live-notification[data-login="newlive"] .watch').click();   // the stream joins the grid, nothing more
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  await expect(page.locator('#grid .big')).toHaveCount(0);
  expect(await page.evaluate(()=>({focused,paused:tiles.get('newlive').paused,muted:tiles.get('newlive').muted,allPaused})))
    .toEqual({focused:null,paused:false,muted:true,allPaused:true});
  await expect(page.locator('.live-notification')).toHaveCount(0);
  online.delete('newlive');
  await page.evaluate(()=>refresh());
  online.add('newlive');
  await page.evaluate(()=>refresh());
  await page.locator('#grid [data-login="already"] .spotlight').click();
  await page.locator('#grid .big .fs').click();
  await page.locator('.live-notification .watch').click();   // leaves the expanded view so the newcomer shows, keeps the spotlight
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  await expect(page.locator('#grid [data-login="already"]')).toHaveClass(/big/);
  await expect(page.locator('#grid [data-login="newlive"]')).not.toHaveClass(/big/);
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
  await page.setViewportSize({width:2560,height:1440});
  await page.route('**/api/search?**',r=>r.fulfill({json:{data:['one','two','muted','paused'].map(broadcaster_login=>({broadcaster_login,is_live:true}))}}));
  await page.addInitScript(()=>localStorage.setItem('tg.layout.guest',JSON.stringify({
    order:['one','two','muted','paused'],focused:'one',muted:{one:false,two:false,muted:true,paused:false},
    paused:{paused:true},volume:{one:0.3,two:0.7,muted:0.4,paused:0.6}
  })));
  await page.goto('/'); await expect.poll(() => page.evaluate(() => !refreshInFlight)).toBe(true); await page.clock.runFor(1200);
  const overlay=page.locator('#audio-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS('backdrop-filter','blur(14px)');
  expect(await overlay.boundingBox()).toEqual({x:0,y:0,...page.viewportSize()});
  await expect(page.locator('#grid .snd[data-sound="on"]')).toHaveCount(0);
  expect(await page.evaluate(() => tiles.get('one').muted)).toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')).muted.one)).toBe(false);
  await page.evaluate(()=>{window.audioPlayers=[...tiles.values()].map(t=>t.player);});
  if(gesture==='background') await page.mouse.click(4,4);
  else if(gesture==='button') await overlay.locator('button').click();
  else await page.keyboard.press('Space');
  await page.clock.runFor(2500);
  await expect(overlay).toBeHidden();
  await expect(page.locator('#grid .snd[data-sound="on"]')).toHaveCount(2);
  await expect(page.locator('#grid .load').first()).toBeHidden();
  expect(await page.evaluate(()=>[...tiles.values()].map(t=>t.player?({muted:t.player.getMuted(),volume:t.player.getVolume(),paused:t.player.paused}):null)))
    .toEqual([{muted:false,volume:0.3,paused:false},{muted:false,volume:0.7,paused:false},{muted:true,volume:0.4,paused:false},null]);
  expect(await page.evaluate(()=>focused)).toBe('one');
  expect(await page.evaluate(()=>[...tiles.values()].every((t,i)=>t.player===window.audioPlayers[i]))).toBe(true);
  await page.evaluate(()=>tiles.get('one').player.emit('playbackBlocked'));
  await page.clock.runFor(2500);
  await expect(overlay).toBeHidden();
  expect(errors).toEqual([]);
});

test('the sound icon stays muted when the player refuses unmute without overwriting saved intent', async ({page}) => {
  const errors = await setup(page); await page.clock.install();
  await page.route('https://player.twitch.tv/js/embed/v1.js', r => r.fulfill({contentType:'text/javascript',body:mockPlayer.replace('setMuted(value) { this.muted = value; }','setMuted(value) { if (value || !window.refuseUnmute) this.muted = value; }')}));
  await page.route('**/api/search?**', r => r.fulfill({json:{data:[{broadcaster_login:'one',is_live:true}]}}));
  await page.addInitScript(() => {
    window.refuseUnmute = true;
    localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one'],muted:{one:false}}));
  });
  await page.goto('/'); await page.clock.runFor(1500);
  const sound = page.locator('#grid .snd'), overlay = page.locator('#audio-overlay');
  await expect(sound).toHaveAttribute('data-sound','muted');
  await overlay.locator('button').click(); await page.clock.runFor(3500);
  await expect(overlay).toBeHidden();
  await expect(sound).toHaveAttribute('data-sound','muted');
  await expect(sound).toHaveAttribute('aria-label','Allumer le son');
  expect(await page.evaluate(() => ({intent:tiles.get('one').muted,saved:JSON.parse(localStorage.getItem('tg.layout.guest')).muted.one}))).toEqual({intent:false,saved:false});
  await page.evaluate(() => { window.refuseUnmute = false; });
  await sound.click();
  await expect(sound).toHaveAttribute('data-sound','on');
  expect(await page.evaluate(() => tiles.get('one').muted)).toBe(false);
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
  await page.evaluate(()=>{allPaused=false;tiles.forEach(sync);updateAudioOverlay();});
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
  await page.goto('/'); await readyPlayers(page);
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
  await two.locator('.spotlight').click();   // the chat is a per-stream setting: two arrives with its own, closed
  await expect(page.locator('.chat iframe')).toHaveCount(0);
  await two.locator('.chat-toggle').click();
  await expect(page.locator('.chat iframe')).toHaveCount(1);
  await expect(two.locator('.chat iframe')).toHaveAttribute('src',/\/embed\/two\/chat/);
  await one.locator('.spotlight').click();   // one takes the spotlight with its own chat, two steps aside
  await expect(page.locator('.chat iframe')).toHaveCount(1);
  await expect(one.locator('.chat iframe')).toHaveAttribute('src',/\/embed\/one\/chat/);
  await one.locator('.spotlight').click();   // back to a plain grid: at 950px each, both tiles keep the full player and their own chat
  await expect(page.locator('#grid .player iframe[data-controls="true"]')).toHaveCount(2);
  await expect(page.locator('.chat iframe')).toHaveCount(2);
  await page.setViewportSize({width:1200,height:650});   // stacked 517px videos: simplified players, the chats fold away and remember they were open
  await expect(page.locator('.chat iframe')).toHaveCount(0);
  await one.locator('.spotlight').click();
  await expect(one.locator('.chat')).toBeVisible();
  await one.locator('.chat-toggle').click();
  await expect(page.locator('.chat iframe')).toHaveCount(0);
  await expect(one.locator('.chat-toggle')).toHaveAttribute('aria-expanded','false');
  await selectChatPosition(one,'left');   // choosing a place opens the chat there and closes the menu
  await expect(one.locator('.chat iframe')).toHaveCount(1);
  await expect(one.locator('.tile-body')).toHaveAttribute('data-chat-position','left');
  await expect(one.locator('.chat-toggle')).toHaveAttribute('aria-expanded','true');
  expect(await one.locator('.chat-options').evaluate(el => el.open)).toBe(false);
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
  await selectChatPosition(page.locator('#grid .tile'),'left');   // choosing a place opens the chat there and closes the menu
  await expect(page.locator('.chat iframe')).toHaveCount(1);
  await expect(options.locator('select')).toBeHidden();
  await expect(page.locator('.tile-body')).toHaveAttribute('data-chat-position','left');
  await page.locator('.chat-toggle').click();
  await expect(page.locator('.chat iframe')).toHaveCount(0);
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
  await page.mouse.move(0,0);
  await page.setViewportSize({width:1800,height:400});
  const bounds=await body.boundingBox();
  await expect.poll(async()=>{
    const footer=await body.evaluate(el=>parseFloat(getComputedStyle(el).paddingBottom));
    return Math.round((await chat.boundingBox()).height + footer + 90);
  }).toBe(Math.round(bounds.height));
  const panel=await chat.boundingBox();
  expect(panel.y+panel.height).toBeLessThanOrEqual(400);
  expect((await page.locator('#grid .player').boundingBox()).height).toBeGreaterThanOrEqual(90);
});

test('side chat expands into pillarboxing up to its maximum without shrinking the video',async({page})=>{
  await setup(page);await mockChat(page);
  await page.addInitScript(()=>localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one'],chatOpen:true})));
  await page.goto('/'); await readyPlayers(page);
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
  await page.route('**/api/search?**',r=>r.fulfill({json:{data:[{broadcaster_login:'guest',is_live:true,thumbnail_url:'https://example.com/avatar.png'}]}}));
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
    localStorage.setItem('tg.layout.'+(connected?'connected':'guest'),JSON.stringify({order:['live'],muted:{live:false},volume:{live:0.35}}));
  },connected);
  await page.goto('/'); await readyPlayers(page);
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
    muted:[...tiles.values()].map(t=>t.muted),volume:tiles.get('live').volume})))
    .toEqual({order:['live','partner','third'],focused:'live',chatOpen:false,samePlayer:true,muted:[false,true,true],volume:0.35});
  await expect(page.locator('.chat iframe')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('#grid [data-login="partner"] .close').click();
  await menu.locator('summary').click();
  await expect(menu.locator('[data-participant="partner"] button')).toBeEnabled();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tg.layout.'+layoutMode)).order)).toEqual(['live','third']);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tg.favorites')).map(s=>s.twitch))).toEqual(['live','sidebar']);
  await menu.locator('[data-participant="partner"] button').click();
  await expect(page.locator('#grid .tile')).toHaveCount(3);
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
  await page.setViewportSize({width:1600,height:1000});
  await page.addInitScript(()=>{
    if(!localStorage.getItem('tg.layout.guest'))localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one','two'],focused:'one',chatOpen:true,chatPosition:'left',volume:{one:0.25},paused:{two:true}}));
  });
  await page.goto('/'); await readyPlayers(page);
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
  expect(await page.evaluate(()=>({order,focused,locked,chatOpen:[...tiles.values()].some(t=>t.chatOpen),grids:gridStore.items.map(i=>i.layout.order)})))
    .toEqual({order:['live','partner','third'],focused:null,locked:true,chatOpen:false,grids:[['live'],['live','partner','third']]});
  // a multi-stream opens locked as a plain grid, everyone equal, only the source audible
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
test('the landing stays away for connected visitors, saved favorites and open tiles, and switches language', async ({ page }) => {
  const errors = await setup(page, true, true);
  await page.addInitScript(() => sessionStorage.setItem('tg.session', JSON.stringify('valid')));
  await api(page);
  await page.goto('/');
  await expect(page.locator('#disconnect')).toBeVisible();
  await expect(page.locator('#landing')).toBeHidden();
  await page.locator('#disconnect').click();
  await expect(page.locator('#landing')).toBeVisible();
  await page.locator('#landing-language').selectOption('en');
  await expect(page.locator('#landing h1')).toHaveText('All your streams.One screen.');
  await expect(page.locator('#landing .reveal')).toContainText('One stream up front');
  await page.locator('#landing-language').selectOption('fr');
  await expect(page.locator('#landing h1')).toHaveText('Tous tes streams.Un seul écran.');
  await page.evaluate(() => localStorage.setItem('tg.favorites', JSON.stringify([{ twitch: 'saved' }])));
  await page.reload();
  await expect(page.locator('#landing')).toBeHidden();
  await expect(page.locator('#empty')).toBeVisible();
  expect(errors).toEqual([]);
  // a fresh tab: the previous one saves its empty layout when it closes, and the landing memory lives per tab
  await page.close();
  const tab = await page.context().newPage(); await setup(tab, true, true);
  await tab.addInitScript(() => { localStorage.removeItem('tg.favorites'); localStorage.removeItem('tg.grids.guest'); localStorage.setItem('tg.layout.guest', JSON.stringify({ order: ['saved'] })); });
  await tab.goto('/');
  await expect(tab.locator('#landing')).toBeHidden();
  await expect(tab.locator('#grid .tile')).toHaveCount(1);
  await tab.locator('#grid .close').click();
  await expect(tab.locator('#landing')).toBeVisible();
});

test('a pause right after our own unmute counts as blocked playback, never as a saved pause', async ({ page }) => {
  const errors = await setup(page);
  await page.route('**/api/search?login=**', route => route.fulfill({ json: { data: new URL(route.request().url()).searchParams.getAll('login').map(login => ({ broadcaster_login: login, is_live: true, game_name: 'Art', viewer_count: 12 })) } }));   // offline channels never need the overlay
  await page.addInitScript(() => localStorage.setItem('tg.layout.guest', JSON.stringify({ order: ['one', 'two'], focused: 'one', muted: { one: false, two: true } })));
  await page.goto('/'); await readyPlayers(page);
  await expect(page.locator('#audio-overlay')).toBeVisible();
  await page.evaluate(() => { for (const t of tiles.values()) t.player?.play(); });
  await page.locator('#audio-overlay button').click();
  await expect(page.locator('#audio-overlay')).toBeHidden();
  await page.evaluate(() => tiles.get('one').player.emit('pause'));
  expect(await page.evaluate(() => ({ paused: tiles.get('one').paused, blocked: tiles.get('one').playbackBlocked }))).toEqual({ paused: false, blocked: true });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')).paused.one)).toBe(false);
  await page.evaluate(() => { tiles.get('one').player.emit('play'); tiles.get('one').player.emit('playing'); });
  expect(await page.evaluate(() => tiles.get('one').playbackBlocked)).toBe(false);
  await page.waitForTimeout(1100);
  await page.evaluate(() => tiles.get('one').player.emit('pause'));
  expect(await page.evaluate(() => tiles.get('one').paused)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')).paused.one)).toBe(true);
  expect(errors).toEqual([]);
});

test('a stream that ends takes its tile away after a minute unless pinned, locked or back online', async ({ page }) => {
  const errors = await setup(page); await page.clock.install();
  await page.setViewportSize({width:2560,height:1440});
  await page.addInitScript(() => localStorage.setItem('tg.layout.guest', JSON.stringify({ order: ['one', 'two', 'three', 'four'], focused: 'one' })));
  await page.goto('/'); await page.clock.runFor(1000);
  await expect(page.locator('#grid .tile')).toHaveCount(4);
  expect(await page.evaluate(() => [...tiles.values()].every(t => t.wasOnline))).toBe(true);
  await page.evaluate(() => { refreshInFlight = true; });   // the player events drive this test, not the status polling
  await page.evaluate(() => { for (const login of ['one', 'two', 'three', 'four']) tiles.get(login).player.emit('offline'); });
  await page.clock.runFor(30000);
  await page.evaluate(() => { const t=tiles.get('three');updateTileInfo(t,{...t.channel,online:true});sync(t); });
  await page.clock.runFor(31000);
  await expect(page.locator('#grid .tile')).toHaveCount(2);   // two and four are gone; the spotlight one stays, three came back
  expect(await page.evaluate(() => order)).toEqual(['one', 'three']);
  await expect(page.locator('#notice')).toContainText('four');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.layout.guest')).order)).toEqual(['one', 'three']);
  await page.locator('#grid-lock').click();
  await page.evaluate(() => { const t=tiles.get('three');updateTileInfo(t,{...t.channel,online:false});sync(t); });
  await page.clock.runFor(61000);
  await expect(page.locator('#grid .tile')).toHaveCount(2);   // a locked grid keeps its tiles
  await page.locator('#grid-lock').click();
  await page.evaluate(() => { const t=tiles.get('three');updateTileInfo(t,{...t.channel,online:false});sync(t); });   // unlocked: the next offline signal starts a new minute
  await page.clock.runFor(61000);
  await expect(page.locator('#grid .tile')).toHaveCount(1);
  expect(errors).toEqual([]);
});
test('wide enough videos get the full player and wide enough tiles the chat, with a margin and a settle delay on resizes', async ({ page }) => {
  const errors = await setup(page); await mockChat(page);
  await page.setViewportSize({ width: 1400, height: 720 });
  await page.addInitScript(() => localStorage.setItem('tg.layout.guest', JSON.stringify({ order: ['one', 'two'], collapsed: true, chatOpen: { one: true } })));
  await page.goto('/');
  const one = page.locator('#grid [data-login="one"]'), two = page.locator('#grid [data-login="two"]');
  // two tiles side by side across 1352px: 676px videos, full players without a spotlight
  await expect(page.locator('#grid .tile.full-player')).toHaveCount(2);
  await expect(page.locator('#grid')).not.toHaveClass(/focused/);
  // stacked at 1102px the videos shrink to 579px: under the entry line but above the keep line, the full players stay
  await page.setViewportSize({ width: 1150, height: 720 });
  await page.waitForTimeout(600);
  await expect(page.locator('#grid .tile.full-player')).toHaveCount(2);
  // 526px videos: the simplified players come back once the resize settles
  await page.setViewportSize({ width: 1100, height: 600 });
  await expect(page.locator('#grid .tile:not(.full-player)')).toHaveCount(2);
  await page.setViewportSize({ width: 1400, height: 720 });
  await expect(page.locator('#grid .tile.full-player')).toHaveCount(2);
  // the spotlight always has the full player and, at 696px wide, its chat
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('#toggle').click();
  await expect(page.locator('#grid .tile.full-player')).toHaveCount(2);   // stacked at 579px: kept by the margin
  await one.locator('.spotlight').click();
  await expect(one).toHaveClass(/full-player/);
  await expect(two).not.toHaveClass(/full-player/);
  await expect(two.locator('.player iframe')).toHaveAttribute('data-controls', 'false');
  await expect(one.locator('.chat-toggle')).toBeVisible();
  await expect(one.locator('.chat iframe')).toHaveCount(1);
  // a lone tile on a narrow window keeps the full player but loses the chat until the sidebar folds away
  await two.locator('.close').click();
  await page.setViewportSize({ width: 850, height: 600 });
  await expect(one).toHaveClass(/full-player/);
  await expect(one.locator('.chat-toggle')).toBeHidden();
  await expect(one.locator('.chat iframe')).toHaveCount(0);
  await page.locator('#toggle').click();
  await expect(one.locator('.chat-toggle')).toBeVisible();
  await expect(one.locator('.chat iframe')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('paused tiles preview muted on hover and retain their pause and audio intent', async ({ page }) => {
  const errors = await setup(page); await page.goto('/');
  await page.evaluate(() => { add(channel({twitch:'preview',online:true}), false, 0.5, true); add(channel({twitch:'other',online:false}),true,0.5,true); });
  const tile = page.locator('#grid [data-login="preview"]');
  await tile.hover();
  await expect.poll(() => page.evaluate(() => { const t=tiles.get('preview'); return [t.player?.paused,t.player?.muted,t.paused,t.muted]; })).toEqual([false,true,true,false]);
  await page.locator('#q').hover();
  await expect.poll(() => page.evaluate(() => tiles.get('preview').player)).toBeNull();
  await page.evaluate(() => { const t=tiles.get('preview'); t.paused=false; allPaused=true; sync(t); });
  await tile.hover();
  await expect.poll(() => page.evaluate(() => { const t=tiles.get('preview'); return [t.player?.paused,t.player?.muted,allPaused,t.paused]; })).toEqual([false,true,true,false]);
  await page.locator('#q').hover();
  await expect.poll(() => page.evaluate(() => tiles.get('preview').player)).toBeNull();
  expect(errors).toEqual([]);
});

test('live follows grid locks membership, pauses at nine and removes offline tiles after sixty seconds', async ({ page }) => {
  const errors = await setup(page,true); await api(page);
  await page.addInitScript(() => sessionStorage.setItem('tg.oauth', JSON.stringify({state:'expected',at:Date.now()})));
  await page.goto('/#access_token=fake-token&state=expected');
  await expect(page.locator('#disconnect')).toBeVisible();
  await expect(page.locator('#grid-menu-list [data-grid-id="live-follows"] small')).toHaveText('Grille dynamique');
  await page.evaluate(() => switchNamedGrid('live-follows'));
  await expect(page.locator('#grid .tile')).toHaveCount(1);
  await expect(page.locator('#grid-lock')).toBeDisabled();
  await expect(page.locator('#grid .close')).toBeDisabled();
  await page.locator('#list [data-login="live"] .channel').click();
  await expect(page.locator('#grid .tile')).toHaveCount(1);
  await page.evaluate(() => remove('live'));
  await expect(page.locator('#grid .tile')).toHaveCount(1);
  await page.evaluate(() => {
    follows=Array.from({length:9},(_,i)=>channel({twitch:'live'+i,online:true})); syncLiveGrid();
  });
  await expect(page.locator('#grid .tile')).toHaveCount(9);
  await expect.poll(() => page.evaluate(() => [...tiles.values()].every(t=>tilePaused(t) && !t.player))).toBe(true);
  await expect(page.locator('#playall')).toHaveAttribute('aria-pressed','true');
  await page.setViewportSize({width:2200,height:1500});
  await page.locator('#playall').click();
  await expect(page.locator('#playall')).toHaveAttribute('aria-pressed','false');
  await expect.poll(() => page.evaluate(() => [...tiles.values()].every(t=>!tilePaused(t) && t.player && !t.player.paused))).toBe(true);
  await page.locator('#playall').click();
  await expect(page.locator('#playall')).toHaveAttribute('aria-pressed','true');
  await expect.poll(() => page.evaluate(() => [...tiles.values()].every(t=>!t.player))).toBe(true);
  await page.locator('#playall').click();
  await expect.poll(() => page.evaluate(() => [...tiles.values()].every(t=>t.player && !t.player.paused))).toBe(true);
  await page.clock.install();
  await page.evaluate(() => {
    lastLiveStatus.set('live0',false); updateLiveNotifications(follows);
    const t=tiles.get('live0'); t.channel.online=false; trackOnline(t,false);
  });
  await expect(page.locator('.live-notification')).toHaveCount(0);
  // Keep network polling from replacing the fixture during the grace period.
  await page.evaluate(() => { refreshInFlight=true; });
  await page.clock.fastForward(59000);
  await expect(page.locator('#grid .tile')).toHaveCount(9);
  await page.clock.fastForward(1000);
  await expect(page.locator('#grid .tile')).toHaveCount(8);
  await expect.poll(() => page.evaluate(() => [...tiles.values()].every(t=>!tilePaused(t)))).toBe(true);
  await page.evaluate(() => switchNamedGrid('default'));
  await expect(page.locator('#grid .tile')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('paused tiles never flash a loader during readiness, buffering or hover previews', async ({ page }) => {
  await setup(page); await page.clock.install(); await page.goto('/');
  await page.evaluate(() => {
    add(channel({twitch:'one'}),true,0.5,true);
    add(channel({twitch:'two'}),true,0.5,true);
    for (const t of tiles.values()) {
      t.ready=false;
      t.el.classList.add('loading');
      mark(t);
    }
  });
  await expect(page.locator('#grid .loading')).toHaveCount(0);
  await expect(page.locator('#grid iframe')).toHaveCount(0);
  await page.locator('#grid [data-login="one"]').hover();
  await page.clock.runFor(1000);
  await page.evaluate(() => { tiles.get('one').player.getPlayerState=()=>({playback:'Buffering'}); });
  for (let i=0;i<4;i++) {
    await page.clock.runFor(3000);
    await expect(page.locator('#grid .loading')).toHaveCount(0);
  }
  await page.evaluate(() => {
    allPaused=true;
    for (const t of tiles.values()) { t.paused=false; sync(t); }
  });
  await page.clock.runFor(3000);
  await expect(page.locator('#grid .loading')).toHaveCount(0);
  await page.locator('#q').hover();
  await page.evaluate(() => { allPaused=false; tiles.forEach(sync); });
  await expect(page.locator('#grid .loading')).toHaveCount(2);
});

for (const connected of [false,true]) test(`paused ${connected?'automatic follows':'guest'} grid loads thumbnails without constructing players`, async ({page}) => {
  const errors=await setup(page,connected);
  const channels=Array.from({length:9},(_,i)=>({twitch:'poster'+i,display:'Poster '+i}));
  const thumbnail=login=>`https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-{width}x{height}.jpg`;
  await page.route('https://static-cdn.jtvnw.net/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#7040a0"/></svg>'}));
  await page.route('https://player.twitch.tv/js/embed/v1.js',r=>r.fulfill({contentType:'text/javascript',body:mockPlayer.replace('constructor(el, options) {','constructor(el, options) { (window.createdPlayers ||= []).push(this);')}));
  if(connected) {
    await api(page);
    await page.route('https://api.twitch.tv/helix/channels/followed?**',r=>r.fulfill({json:{data:channels.map(s=>({broadcaster_login:s.twitch,broadcaster_name:s.display})),pagination:{}}}));
    await page.route('https://api.twitch.tv/helix/streams?**',r=>r.fulfill({json:{data:channels.map(s=>({user_login:s.twitch,thumbnail_url:thumbnail(s.twitch),game_name:'Art',title:'Live painting'}))}}));
  } else {
    await page.route('**/api/search?login=**',r=>r.fulfill({json:{data:channels.map(s=>({broadcaster_login:s.twitch,is_live:true,thumbnail_url:'https://example.com/avatar.png',preview_url:thumbnail(s.twitch),game_name:'Art',title:'Live painting'}))}}));
  }
  await page.addInitScript(({connected,channels})=>{
    if(connected) {
      sessionStorage.setItem('tg.session',JSON.stringify('valid'));
      localStorage.setItem('tg.grids.connected',JSON.stringify({activeId:'live-follows',items:[{id:'default',layout:{order:[]}},{id:'live-follows',layout:{order:[],locked:true}}]}));
    } else {
      localStorage.setItem('tg.favorites',JSON.stringify(channels));
      localStorage.setItem('tg.layout.guest',JSON.stringify({order:channels.map(s=>s.twitch),allPaused:true,volume:{poster0:0.25}}));
    }
  },{connected,channels});
  await page.clock.install(); await page.goto('/');
  const first=page.locator('#grid [data-login="poster0"]');
  await expect(page.locator('#grid .stream-poster')).toHaveCount(9);
  await expect(first.locator('img.stream-poster')).toHaveAttribute('src',/live_user_poster0-640x360\.jpg\?v=\d+/);
  await expect.poll(()=>first.locator('img.stream-poster').evaluate(img=>img.naturalWidth)).toBe(640);
  await page.clock.runFor(3000);
  expect(await page.evaluate(()=>window.createdPlayers?.length || 0)).toBe(0);
  await expect(page.locator('#grid iframe')).toHaveCount(0);
  const original=await first.locator('img.stream-poster').getAttribute('src');
  await page.evaluate(()=>refresh());
  await expect(first.locator('img.stream-poster')).toHaveAttribute('src',new RegExp('^'+original.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/v=\d+$/,'v=\\d+')));   // same image; only the minute stamp may roll
  await first.hover(); await page.clock.runFor(1200);
  await expect(page.locator('#grid iframe')).toHaveCount(1);
  expect(await page.evaluate(()=>({muted:tiles.get('poster0').player.getMuted(),playing:!tiles.get('poster0').player.paused}))).toEqual({muted:true,playing:true});
  await page.locator('#q').hover(); await page.clock.runFor(1000);
  await expect(page.locator('#grid iframe')).toHaveCount(0);
  expect(await page.evaluate(()=>window.createdPlayers.every(p=>p.destroyed))).toBe(true);
  await page.evaluate(()=>{refreshInFlight=true;});
  await page.clock.fastForward(61000);
  await expect(first.locator('img.stream-poster')).not.toHaveAttribute('src',original);
  expect(await page.evaluate(()=>window.createdPlayers.length)).toBe(1);
  await page.locator('#playall').click(); await page.clock.runFor(1500);
  await expect(page.locator('#grid iframe')).toHaveCount(9);
  expect(await page.evaluate(()=>tiles.get('poster0').volume)).toBe(connected?0.5:0.25);
  await page.locator('#playall').click(); await page.clock.runFor(1000);
  await expect(page.locator('#grid iframe')).toHaveCount(0);
  expect(await page.evaluate(()=>window.createdPlayers.every(p=>p.destroyed))).toBe(true);
  expect(errors).toEqual([]);
});

test('leaving a hover before Twitch is ready discards the embed and its late callbacks',async({page})=>{
  const errors=await setup(page);
  await page.route('**/api/search?**',r=>r.fulfill({json:{data:[{broadcaster_login:'one',is_live:true}]}}));   // an offline channel would have nothing to preview
  await page.route('https://player.twitch.tv/js/embed/v1.js',r=>r.fulfill({contentType:'text/javascript',body:mockPlayer.replace('if (!this.destroyed) callback();','callback();').replace('}, 0);','}, 2000);')}));
  await page.addInitScript(()=>localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one','two'],allPaused:true})));
  await page.clock.install(); await page.goto('/');
  await expect(page.locator('#grid [data-login="one"].poster-only')).toHaveCount(1);
  await page.locator('#grid [data-login="one"]').hover(); await page.clock.runFor(500);
  await expect(page.locator('#grid iframe')).toHaveCount(1);
  await page.locator('#q').hover(); await page.clock.runFor(500);
  await expect(page.locator('#grid iframe')).toHaveCount(0);
  await page.clock.runFor(3000);
  expect(await page.evaluate(()=>({ready:tiles.get('one').ready,player:tiles.get('one').player,allPaused}))).toEqual({ready:false,player:null,allPaused:true});
  expect(errors).toEqual([]);
});

for (const reducedMotion of ['no-preference','reduce']) test(`tile animations preserve player lifecycle with motion ${reducedMotion}`,async({page})=>{
  const errors=await setup(page); await page.emulateMedia({reducedMotion}); await page.goto('/');
  await page.evaluate(()=>{
    add(channel({twitch:'one',online:true}));
    window.enterAnimations=tiles.get('one').bar.getAnimations().length;
  });
  expect(await page.evaluate(()=>window.enterAnimations)).toBe(reducedMotion==='reduce'?0:1);
  await expect.poll(()=>page.evaluate(()=>tiles.get('one').bar.getAnimations().length)).toBe(0);
  const result=await page.evaluate(()=>{
    const player=tiles.get('one').player;
    remove('one');
    return {destroyed:player.destroyed,tiles:tiles.size,exits:document.querySelectorAll('.tile-exit').length,exitFrames:document.querySelectorAll('.tile-exit iframe').length};
  });
  expect(result).toEqual({destroyed:true,tiles:0,exits:reducedMotion==='reduce'?0:1,exitFrames:0});
  await expect(page.locator('.tile-exit')).toHaveCount(0);
  // A grid switch must also clear any exit animation already in progress.
  await page.evaluate(()=>{add(channel({twitch:'two'}));remove('two');clearTiles();});
  await expect(page.locator('.tile-exit')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('preview image refresh sleeps in background tabs and catches up without loading a player',async({page})=>{
  const errors=await setup(page);
  await page.route('**/api/search?**',r=>r.fulfill({json:{data:[{broadcaster_login:'one',is_live:true}]}}));
  await page.addInitScript(()=>localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one'],allPaused:true})));
  await page.clock.install();await page.goto('/');
  const poster=page.locator('#grid .stream-poster');
  await expect(poster).toHaveAttribute('src',/live_user_one/);
  await page.evaluate(()=>{refreshInFlight=true;Object.defineProperty(document,'hidden',{configurable:true,value:true});});
  const original=await poster.getAttribute('src');   // read once the tab is hidden, so no minute stamp can roll in between
  await page.clock.fastForward(61000);
  await expect(poster).toHaveAttribute('src',original);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await expect(poster).not.toHaveAttribute('src',original);
  await expect(page.locator('#grid iframe')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test(`tile and sidebar loading covers follow the player`,async({page,browserName})=>{
  await page.addInitScript(() => localStorage.setItem('tg.preferences', JSON.stringify({theme:'light'})));
  const errors=await setup(page);
  // Simulate the SDK replacing its mount contents at READY, then buffering without a first frame.
  const bufferingPlayer=mockPlayer
    .replace('this.options = options;', 'this.host = el; this.options = options;')
    .replace('if (!this.destroyed) callback();', 'if (!this.destroyed) { this.host.replaceChildren(this.frame); callback(); }')
    .replace('}, 0);','}, 1000);')
    .replace("playback: this.paused ?", "playback: this.buffering ? 'Buffering' : this.paused ?")
    .replace(/play\(\) \{ if \(this.paused\) \{[^\n]+?\} \}/, 'play() { this.buffering = true; }');
  await page.route('https://player.twitch.tv/js/embed/v1.js',r=>r.fulfill({contentType:'text/javascript',body:bufferingPlayer}));
  await page.route('https://static-cdn.jtvnw.net/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#7040a0"/></svg>'}));
  await page.route('**/api/search?**',r=>r.fulfill({json:{data:[{broadcaster_login:'one',is_live:true,title:'Live painting',game_name:'Art'}]}}));
  await page.addInitScript(()=>{
    localStorage.setItem('tg.favorites',JSON.stringify([{twitch:'one'}]));
    localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one','two'],allPaused:true}));
  });
  await page.clock.install();await page.goto('/');
  const tile=page.locator('#grid [data-login="one"]'), cover=tile.locator('.preview-cover');
  await expect.poll(()=>cover.locator('.stream-poster').evaluate(img=>img.naturalWidth)).toBe(640);
  await page.clock.pauseAt((await page.evaluate(()=>Date.now())) + 1000);
  await expect(cover.locator('.preview-status')).toBeHidden();
  await tile.hover();
  await expect(cover.locator('.preview-status')).toBeVisible();
  await page.clock.runFor(500);
  await expect(tile.locator('.player-embed iframe')).toHaveCount(1);
  await expect(cover).toBeVisible();
  await expect(tile.locator('iframe')).toBeVisible();
  await page.clock.runFor(1500);
  {
    await expect(cover).toBeVisible();
    // Clicks reach the embed layer; simplified players delegate them to the tile.
    expect(await tile.locator('iframe').evaluate(frame => {
      const box=frame.getBoundingClientRect();
      return frame.parentElement.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));
    })).toBe(true);
    await expect(tile.locator('iframe')).toHaveCSS('color-scheme', 'normal');
    await expect(tile.locator('iframe')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(tile.locator('.player')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(tile.locator('.bar .playback-status')).toBeVisible();
    await expect(tile.locator('.load')).toBeHidden();
    await expect(tile.locator('iframe')).toHaveCSS('transform', 'none');
    await expect(tile.locator('iframe')).toBeVisible();
    if (browserName === 'chromium') expect(await tile.locator('iframe').evaluate(frame => new Promise(resolve => {
      const observer = new IntersectionObserver(([entry]) => { observer.disconnect(); resolve(entry.isVisible); }, {trackVisibility:true,delay:100});
      observer.observe(frame);
    }))).toBe(true);
  }
  await page.evaluate(()=>{const p=tiles.get('one').player;p.buffering=false;p.paused=false;p.emit('playing');});
  await expect(cover).toBeHidden();
  await page.locator('#q').hover();await page.clock.runFor(500);
  await expect(tile.locator('iframe')).toHaveCount(0);
  await expect(cover).toBeVisible();
  await expect(cover.locator('.preview-status')).toBeHidden();

  await page.locator('#list [data-login="one"]').hover();
  await page.clock.runFor(300);   // the card waits for the pointer to settle
  const sidebarCover=page.locator('#preview .preview-cover');
  await expect(sidebarCover.locator('.stream-poster')).toBeVisible();
  await expect(sidebarCover.locator('.status')).toHaveText('Chargement de l’aperçu…');
  await expect(page.locator('#preview iframe')).toHaveCount(0);
  await page.clock.runFor(350);
  await expect(page.locator('#preview iframe')).toHaveCount(1);
  await expect(sidebarCover).toBeVisible();
  await expect(page.locator('#preview iframe')).toBeVisible();
  await page.clock.runFor(1500);
  {
    await expect(sidebarCover).toBeVisible();
    await expect(page.locator('#preview .player')).toHaveCSS('z-index','2');
    await expect(page.locator('#preview .preview-message')).toHaveText('Chargement de l’aperçu…');
    await expect(page.locator('#preview iframe')).toHaveCSS('transform', 'none');
    await expect(page.locator('#preview iframe')).toBeVisible();
  }
  await expect(sidebarCover.locator('.stream-poster')).toHaveAttribute('src',await cover.locator('.stream-poster').getAttribute('src'));
  await page.evaluate(()=>{previewPlayer.buffering=false;previewPlayer.paused=false;previewPlayer.emit('playing');});
  await expect(page.locator('#preview')).toHaveClass(/playing/);
  await expect(sidebarCover).toBeHidden();
  await page.locator('#q').hover();await page.clock.runFor(500);
  await expect(page.locator('#preview')).toBeHidden();
  await expect(page.locator('#preview iframe')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const presentation of ['spotlight', 'single', 'expanded']) test(`pause stops the ${presentation} and keeps its still centered without overlays`, async ({page}) => {
  const errors = await setup(page);
  await page.setViewportSize({width:1100,height:1100});
  await page.route('**/api/search?login=**', r => r.fulfill({json:{data:['one','two'].map(login => ({broadcaster_login:login,is_live:true}))}}));
  await page.route('https://static-cdn.jtvnw.net/**', r => r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="purple"/></svg>'}));
  await page.addInitScript(presentation => {
    localStorage.setItem('tg.favorites', JSON.stringify([{twitch:'one'},{twitch:'two'}]));
    localStorage.setItem('tg.layout.guest', JSON.stringify({order:presentation === 'single' ? ['one'] : ['one','two'],
      focused:presentation === 'spotlight' ? 'one' : null, muted:{one:false,two:true}, volume:{one:0.3,two:0.7}}));
  }, presentation);
  await page.clock.install(); await page.goto('/');
  const tile = page.locator('#grid [data-login="one"]'), video = tile.locator('.player');
  await expect(video.locator('iframe')).toHaveCount(1);
  await page.locator('#audio-overlay button').click();
  await expect(page.locator('#audio-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(() => tiles.get('one').hasPlayed)).toBe(true);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  await page.evaluate(() => window.pausedPlayer = tiles.get('one').player);
  await page.locator('#playall').click();
  if (presentation === 'expanded') await tile.locator('.fs').click();
  // Return over the spotlight before the old 400ms sync delay could expire.
  await video.hover();
  await expect(video.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(() => window.pausedPlayer.destroyed)).toBe(true);
  await page.clock.runFor(2000);
  await expect(video.locator('iframe')).toHaveCount(0);
  await expect(tile.locator('.preview-status')).toBeHidden();
  await expect(tile.locator('.load')).toBeHidden();
  await expect(tile.locator('.play-hint')).toBeHidden();
  const poster = video.locator('.stream-poster');
  await expect(poster).toBeVisible();
  for (const size of [{width:1100,height:1100},{width:1500,height:800}]) {
    await page.setViewportSize(size); await page.clock.runFor(100);
    await expect(async () => {
      const {image,box} = await poster.evaluate(img => ({image:img.getBoundingClientRect().toJSON(),box:img.closest('.player').getBoundingClientRect().toJSON()}));
      expect(image.width / image.height).toBeCloseTo(16/9,2);
      expect(image.x + image.width / 2).toBeCloseTo(box.x + box.width / 2,0);
      expect(image.y + image.height / 2).toBeCloseTo(box.y + box.height / 2,0);
      expect(image.width).toBeLessThanOrEqual(box.width + 1);
      expect(image.height).toBeLessThanOrEqual(box.height + 1);
    }).toPass();
  }
  await video.click(); await page.clock.runFor(1500);
  await expect(video.locator('iframe')).toHaveCount(1);
  await expect(tile.locator('.preview-cover')).toBeHidden();
  expect(await page.evaluate(() => ({allPaused,paused:tiles.get('one').paused,muted:tiles.get('one').muted,volume:tiles.get('one').volume})))
    .toEqual({allPaused:false,paused:false,muted:false,volume:0.3});
  if (presentation !== 'single') await expect(page.locator('#grid [data-login="two"] .player iframe')).toHaveCount(0);
  await tile.locator('.pp').click(); await video.hover(); await page.clock.runFor(1500);
  await expect(video.locator('iframe')).toHaveCount(0);
  await tile.locator('.pp').click(); await page.clock.runFor(1500);
  // A pause issued by the native player must also remain paused under the pointer.
  await page.evaluate(() => { const t=tiles.get('one'); t.unmutedAt=0; t.player.pause(); });
  await page.clock.runFor(1500);
  await expect(video.locator('iframe')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('iframe stays centered at 16:9 and only resizes when its video area changes', async ({page}) => {
  const errors = await setup(page);
  await page.setViewportSize({width:1700,height:1400});
  await page.route('**/api/search?login=**', r => r.fulfill({json:{data:['one','two'].map(broadcaster_login => ({broadcaster_login,is_live:true}))}}));
  await page.route('https://www.twitch.tv/embed/*/chat?**', r => r.fulfill({body:'Chat'}));
  await page.addInitScript(() => {
    localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one','two'],focused:'one',muted:{one:true,two:true},paused:{two:true}}));
  });
  await page.goto('/');
  const tile = page.locator('#grid [data-login="one"]'), player = tile.locator('.player'), frame = player.locator('iframe');
  await expect.poll(() => page.evaluate(() => tiles.get('one')?.hasPlayed)).toBe(true);
  await page.evaluate(() => { window.originalFrame = tiles.get('one').el.querySelector('.player iframe'); });
  async function expectCentered() {
    await expect.poll(async () => {
      const f=await frame.boundingBox(),p=await player.boundingBox();
      return Math.abs(f.width/f.height - 16/9) + Math.abs(f.x+f.width/2-p.x-p.width/2) + Math.abs(f.y+f.height/2-p.y-p.height/2);
    }).toBeLessThan(1);
    const f=await frame.boundingBox(),p=await player.boundingBox();
    expect(f.width/f.height).toBeCloseTo(16/9,2);
    expect(f.width).toBeCloseTo(Math.min(p.width,p.height*16/9),0);
    expect(f.height).toBeLessThanOrEqual(p.height+1);
    await expect(frame).toHaveCSS('transform','none');
    return f;
  }
  const tall = await expectCentered();
  const before = await frame.evaluate(f => ({width:f.contentWindow.innerWidth,height:f.contentWindow.innerHeight}));
  await page.setViewportSize({width:1700,height:1100});
  await expect.poll(async () => (await frame.boundingBox()).y).not.toBe(tall.y);
  const shorter = await expectCentered();
  expect(shorter.width).toBe(tall.width); expect(shorter.height).toBe(tall.height);
  expect(shorter.y).not.toBe(tall.y);
  expect(await frame.evaluate(f => ({width:f.contentWindow.innerWidth,height:f.contentWindow.innerHeight}))).toEqual(before);
  await page.setViewportSize({width:1700,height:500});
  await expect.poll(async () => (await frame.boundingBox()).width).toBeLessThan(tall.width);
  const wide = await expectCentered();
  expect(wide.width).toBeLessThan(tall.width);
  await tile.locator('.chat-toggle').click();
  await expect(tile.locator('.chat iframe')).toHaveCount(1);
  await expectCentered();
  expect(await frame.evaluate(f => f === window.originalFrame)).toBe(true);
  await tile.locator('.chat-toggle').click();
  const playing = await expectCentered();
  await tile.locator('.pp').click();
  await expect(frame).toHaveCount(0);
  const poster = await player.locator('.stream-poster').boundingBox();
  expect(poster.x).toBeCloseTo(playing.x,0); expect(poster.y).toBeCloseTo(playing.y,0);
  expect(poster.width).toBeCloseTo(playing.width,0); expect(poster.height).toBeCloseTo(playing.height,0);
  expect(errors).toEqual([]);
});

test('side tiles remain fully visible at fractional sizes and resume after a global pause', async ({page, browserName}) => {
  const errors = await setup(page);
  await page.setViewportSize({width:1671,height:1100});
  await page.route('**/api/search?login=**', r => r.fulfill({json:{data:['one','two','three'].map(broadcaster_login => ({broadcaster_login,is_live:true}))}}));
  await page.addInitScript(() => {
    localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one','two','three'],focused:'one',muted:{one:true,two:true,three:true}}));
  });
  await page.goto('/');
  // Headless Chromium uses overlay scrollbars; reserve their width to also cover desktop scrollbars.
  await page.addStyleTag({content:'#grid { scrollbar-gutter: stable; }'});
  await page.evaluate(() => layout());
  const frames = page.locator('#grid .tile:not(.big) .player iframe');
  await expect(frames).toHaveCount(2);
  for (const width of [1671,1670,1707,1710]) {
    await page.setViewportSize({width,height:1100});
    await expect(async () => {
      for (const frame of await frames.all()) {
        const bounds = await frame.evaluate(f => {
          const iframe = f.getBoundingClientRect(), container = f.closest('.player').getBoundingClientRect();
          const spotlight = document.querySelector('#grid .tile.big').getBoundingClientRect();
          return {overflow:Math.max(container.left-iframe.left,container.top-iframe.top,iframe.right-container.right,iframe.bottom-container.bottom),overlap:spotlight.right-container.left,ratio:iframe.width/iframe.height};
        });
        expect(bounds.overflow).toBeLessThan(0.001);   // Firefox DOMRect arithmetic has floating-point noise.
        expect(bounds.overlap).toBeLessThanOrEqual(0);
        expect(bounds.ratio).toBeCloseTo(16/9,3);
      }
    }).toPass();
    if (browserName === 'chromium') for (const frame of await frames.all()) {
      expect(await frame.evaluate(f => new Promise(resolve => {
        const observer = new IntersectionObserver(([entry]) => { observer.disconnect(); resolve({visible:entry.isVisible,ratio:entry.intersectionRatio}); }, {trackVisibility:true,delay:100});
        observer.observe(f);
      }))).toEqual({visible:true,ratio:1});
    }
  }
  await page.locator('#playall').click();
  await expect(page.locator('#grid .player iframe')).toHaveCount(0);
  await page.locator('#playall').click();
  await expect.poll(() => page.evaluate(() => [...tiles.values()].every(t => t.hasPlayed && !tilePaused(t)))).toBe(true);
  await expect(frames).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('volume only opens on hover and tooltips cannot cover the player', async ({page, browserName}) => {
  const errors = await setup(page);
  await page.route('**/api/search?login=**', r => r.fulfill({json:{data:[{broadcaster_login:'one',is_live:true}]}}));
  await page.addInitScript(() => {
    localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one'],muted:{one:true}}));
  });
  await page.goto('/');
  const tile = page.locator('#grid .tile'), sound = tile.locator('.snd'), volume = tile.locator('.volume');
  await expect.poll(() => page.evaluate(() => tiles.get('one')?.hasPlayed)).toBe(true);
  await expect(page.locator('[title]:not(iframe)')).toHaveCount(0);
  await expect(tile.locator('iframe')).toHaveAttribute('title','Stream de one');
  await sound.hover(); await page.waitForTimeout(600);
  await expect(volume).toBeVisible();
  await expect(page.locator('#tooltip')).toBeHidden();
  await sound.click();
  await expect(sound).toHaveAttribute('aria-label','Couper le son');
  await expect(sound).not.toHaveAttribute('title');
  await volume.locator('input').hover();
  await expect(volume).toBeVisible();
  if (browserName === 'chromium') expect(await tile.locator('iframe').evaluate(frame => new Promise(resolve => {
    const observer = new IntersectionObserver(([entry]) => { observer.disconnect(); resolve(entry.isVisible); }, {trackVisibility:true,delay:100});
    observer.observe(frame);
  }))).toBe(true);
  await page.locator('#q').hover();
  await expect(sound).toBeFocused();
  await expect(volume).toBeHidden();
  await sound.focus();
  await expect(volume).toBeHidden();
  await expect(page.locator('#tooltip')).toBeHidden();
  await page.locator('#language-setting').selectOption('en');
  await expect(sound).toHaveAttribute('aria-label','Mute');
  await expect(page.locator('[title]:not(iframe)')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a brief sidebar hover shows a still image without loading an embed',async({page})=>{
  const errors=await setup(page);
  await page.route('**/api/search?**',r=>r.fulfill({json:{data:[{broadcaster_login:'one',is_live:true}]}}));
  await page.addInitScript(()=>localStorage.setItem('tg.favorites',JSON.stringify([{twitch:'one'}])));
  await page.clock.install();await page.goto('/');
  await expect(page.locator('#list .live')).toHaveCount(1);
  await page.clock.pauseAt((await page.evaluate(()=>Date.now())) + 1000);
  await page.locator('#list .live').hover();
  await page.clock.runFor(200);
  await expect(page.locator('#preview')).toBeHidden();   // a sweep across the row shows nothing
  await page.clock.runFor(100);
  await expect(page.locator('#preview')).toBeVisible();
  await expect(page.locator('#preview .stream-poster')).toHaveAttribute('src',/live_user_one/);
  await expect(page.locator('#preview iframe')).toHaveCount(0);
  await page.clock.runFor(100);await page.locator('#q').hover();await page.clock.runFor(500);
  await expect(page.locator('#preview')).toBeHidden();
  await expect(page.locator('#preview iframe')).toHaveCount(0);
  expect(errors).toEqual([]);
});

async function liveSetup(page, count=9) {
  await setup(page,true); await api(page);
  const data=Array.from({length:count},(_,i)=>({broadcaster_login:'live'+i,broadcaster_name:'Live '+i}));
  await page.route('https://api.twitch.tv/helix/channels/followed?**',r=>r.fulfill({json:{data,pagination:{}}}));
  await page.route('https://api.twitch.tv/helix/streams?**',r=>r.fulfill({json:{data:data.map(s=>({user_login:s.broadcaster_login}))}}));
  await page.addInitScript(()=>{
    sessionStorage.setItem('tg.session',JSON.stringify('valid'));
    localStorage.setItem('tg.grids.connected',JSON.stringify({activeId:'live-follows',items:[{id:'default',layout:{order:[]}},{id:'live-follows',layout:{order:[],locked:true}}]}));
  });
  await page.clock.install(); await page.goto('/');
  await expect(page.locator('#grid .tile')).toHaveCount(count);
  await page.evaluate(()=>{refreshInFlight=true;});
}
test('dynamic grid preserves manual settings on return',async({page})=>{
  await liveSetup(page);
  await page.locator('#playall').click(); await page.clock.runFor(1500);
  await page.evaluate(()=>{const t=tiles.get('live0');t.volume=.25;t.muted=false;move('live0','live2');save();window.before=currentLayout();switchNamedGrid('default');switchNamedGrid('live-follows');});
  await page.clock.runFor(1500);
  const result=await page.evaluate(()=>({before:{order:window.before.order,paused:window.before.paused.live0,volume:window.before.volume.live0,muted:window.before.muted.live0},after:{order,paused:tilePaused(tiles.get('live0')),volume:tiles.get('live0').volume,muted:tiles.get('live0').muted}}));
  expect(result.after).toEqual(result.before);
});
test('sidebar rapid return loads embed',async({page})=>{
  await setup(page); await page.clock.install();await page.goto('/');
  await page.evaluate(()=>{favorites=[channel({twitch:'live',online:true})];rebuild();});
  await page.locator('#list [data-login="live"]').hover();
  await page.clock.runFor(100);
  await page.mouse.move(900, 800);
  await page.clock.runFor(50);
  await page.locator('#list [data-login="live"]').hover();
  await page.clock.runFor(2000);
  await expect(page.locator('#preview iframe')).toHaveCount(1);
});
test('native player resumes after READY in hidden document',async({page})=>{
  await setup(page);await page.clock.install();await page.goto('/');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});add(channel({twitch:'live',online:true}));});
  await page.clock.runFor(1500);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.runFor(10000);
  expect(await page.evaluate(()=>tiles.get('live').player.paused)).toBe(false);
});
test('sidebar errors remain visible after READY',async({page})=>{
  await setup(page);await page.clock.install();await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>refreshInFlight)).toBe(false);   // a late rebuild would replace the hovered row
  await page.evaluate(()=>{favorites=[channel({twitch:'live',online:true})];rebuild();queuePreview(document.querySelector('#list [data-login="live"]'));});
  await page.clock.runFor(1000);
  await page.evaluate(()=>{previewPlayer.getPlayerState=()=>({playback:'Paused'});previewPlayer.emit('error');});
  await expect(page.locator('#preview .status')).toContainText('Aperçu indisponible');
  await expect(page.locator('#preview .preview-message')).toBeVisible();
});

test('live grid restores saved settings after a delayed first status fetch and excludes offline follows',async({page})=>{
  await setup(page,true);await api(page);
  await page.addInitScript(()=>{
    sessionStorage.setItem('tg.session',JSON.stringify('valid'));
    localStorage.setItem('tg.grids.connected',JSON.stringify({activeId:'live-follows',items:[{id:'live-follows',layout:{order:['offline','live'],volume:{live:.2},paused:{live:true},muted:{live:false},focused:'live'}}]}));
  });
  let respond;
  await page.route('https://api.twitch.tv/helix/streams?**',r=>{respond=()=>r.fulfill({json:{data:[{user_login:'live'}]}});});
  await page.goto('/');
  await expect.poll(()=>!!respond).toBe(true);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tg.grids.connected')).items[0].layout.volume.live)).toBe(.2);
  await respond();
  await expect(page.locator('#grid .tile')).toHaveCount(1);
  expect(await page.evaluate(()=>({order,volume:tiles.get('live').volume,paused:tiles.get('live').paused,muted:tiles.get('live').muted}))).toEqual({order:['live'],volume:.2,paused:true,muted:false});
});

test('a slow preview reports its timeout outside the iframe and clears it when playback recovers',async({page})=>{
  await setup(page);
  const buffering=mockPlayer.replace(/play\(\) \{ if \(this.paused\) \{[^\n]+?\} \}/,'play() {}');
  await page.route('https://player.twitch.tv/js/embed/v1.js',r=>r.fulfill({contentType:'text/javascript',body:buffering}));
  await page.clock.install();await page.goto('/');
  await page.evaluate(()=>{favorites=[channel({twitch:'live',online:true})];rebuild();queuePreview(document.querySelector('#list [data-login="live"]'));});
  await page.clock.runFor(13000);
  await expect(page.locator('#preview .preview-cover')).toBeVisible();
  await expect(page.locator('#preview .preview-message')).toHaveText('L’aperçu tarde à démarrer');
  await expect(page.locator('#preview .preview-message')).toBeVisible();
  await page.evaluate(()=>{previewPlayer.paused=false;previewPlayer.emit('playing');});
  await expect(page.locator('#preview .preview-message')).toBeHidden();
});


test('reload waits for status and never mounts confirmed offline channels', async ({page}) => {
  const errors = await setup(page);
  const banner = 'https://static-cdn.jtvnw.net/offline-banner.png', avatar = 'https://static-cdn.jtvnw.net/avatar.png';
  await page.route('https://static-cdn.jtvnw.net/**', r => r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="purple"/></svg>'}));
  await page.route('https://player.twitch.tv/js/embed/v1.js', r => r.fulfill({contentType:'text/javascript',body:mockPlayer.replace('this.options = options;', '(window.mountedChannels ||= []).push(options.channel); this.options = options;')}));
  let releaseStatus;
  const status = new Promise(resolve => { releaseStatus = resolve; });
  await page.route('**/api/search?login=**', async r => {
    await status;
    await r.fulfill({json:{data:[{broadcaster_login:'offline',is_live:false,offline_image_url:banner,thumbnail_url:avatar},{broadcaster_login:'live',is_live:true}]}});
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem('tg.layout.guest')) localStorage.setItem('tg.layout.guest',JSON.stringify({order:['offline','live'],muted:{offline:true,live:true}}));
  });
  await page.goto('/');
  await expect(page.locator('#grid .tile')).toHaveCount(2);
  await page.waitForTimeout(600);
  await expect(page.locator('#grid iframe')).toHaveCount(0);
  expect(await page.evaluate(() => window.mountedChannels || [])).toEqual([]);
  releaseStatus();
  const offline = page.locator('#grid [data-login="offline"]');
  await expect(offline.locator('.preview-status')).toBeVisible();
  await expect(offline.locator('.preview-status span')).toHaveText('Hors ligne');
  await expect(offline.locator('.preview-avatar img')).toHaveAttribute('src',avatar);
  await expect(offline.locator('.stream-poster')).toHaveAttribute('src',banner);
  await expect(page.locator('#grid [data-login="live"] iframe')).toHaveCount(1);
  expect(await page.evaluate(() => window.mountedChannels)).not.toContain('offline');
  await offline.hover(); await page.locator('#playall').click(); await page.locator('#playall').click();
  await page.reload();
  await expect(page.locator('#grid [data-login="live"] iframe')).toHaveCount(1);
  await expect(offline.locator('iframe')).toHaveCount(0);
  await expect(offline.locator('.preview-status')).toBeVisible();
  expect(await page.evaluate(() => window.mountedChannels)).not.toContain('offline');
  expect(errors).toEqual([]);
});

test('offline transitions release the embed and resume when the channel returns', async ({page}) => {
  const errors = await setup(page);
  let online = true;
  await page.route('**/api/search?login=**', r => r.fulfill({json:{data:[{broadcaster_login:'one',is_live:online,offline_image_url:'https://static-cdn.jtvnw.net/offline.png'}]}}));
  await page.addInitScript(() => {
    localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one'],locked:true,volume:{one:0.3},muted:{one:true}}));
  });
  await page.goto('/');
  const tile = page.locator('#grid .tile');
  await expect.poll(() => page.evaluate(() => tiles.get('one')?.hasPlayed)).toBe(true);
  await page.evaluate(() => { window.previousPlayer = tiles.get('one').player; previousPlayer.emit('offline'); });
  await expect(tile.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(() => previousPlayer.destroyed)).toBe(true);
  await expect(tile.locator('.preview-status')).toBeVisible();
  await expect(tile.locator('.preview-status span')).toHaveText('Hors ligne');
  await page.evaluate(() => refresh());
  await expect(tile.locator('iframe')).toHaveCount(1);
  online = false;
  await page.evaluate(() => refresh());
  await expect(tile.locator('iframe')).toHaveCount(0);
  // Going offline must not turn the user's playback preference into a manual pause.
  expect(await page.evaluate(() => ({paused:tiles.get('one').paused,volume:tiles.get('one').volume,muted:tiles.get('one').muted})))
    .toEqual({paused:false,volume:0.3,muted:true});
  online = true;
  await page.evaluate(() => refresh());
  await expect(tile.locator('iframe')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('failed status lookup lets the unknown channel try its embed', async ({page}) => {
  const errors = await setup(page);
  await page.route('**/api/search?login=**', r => r.fulfill({status:503,json:{error:'Unavailable'}}));
  await page.addInitScript(() => {
    localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one']}));
  });
  await page.goto('/');
  await expect(page.locator('#grid iframe')).toHaveCount(1);
  expect(await page.evaluate(() => tiles.get('one').channel.online)).toBe(null);
  expect(errors).toEqual([]);
});

test('offline tiles show the channel banner when it has one, or an offline overlay instead of a black box',async({page})=>{
  const errors=await setup(page);
  const banner='https://static-cdn.jtvnw.net/jtv_user_pictures/banner-channel_offline_image-1920x1080.png';
  await page.route('https://static-cdn.jtvnw.net/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#204060"/></svg>'}));
  await page.route('**/api/search?login=**',r=>r.fulfill({json:{data:[{broadcaster_login:'banner',is_live:false,offline_image_url:banner},{broadcaster_login:'bare',is_live:false}]}}));
  await page.addInitScript(()=>{
    localStorage.setItem('tg.favorites',JSON.stringify([{twitch:'banner'},{twitch:'bare'}]));
    localStorage.setItem('tg.layout.guest',JSON.stringify({order:['banner','bare'],allPaused:true}));
  });
  await page.goto('/');
  const withBanner=page.locator('#grid [data-login="banner"]'),bare=page.locator('#grid [data-login="bare"]');
  await expect(withBanner.locator('.stream-poster')).toHaveAttribute('src',banner);
  await expect(withBanner.locator('.preview-cover')).toHaveClass(/offline/);   // the status sits over the banner too
  await expect(withBanner.locator('.preview-status span:last-child')).toHaveText('Hors ligne');
  await expect(bare.locator('.stream-poster')).toBeHidden();
  await expect(bare.locator('.preview-cover')).toHaveClass(/offline/);
  await expect(bare.locator('.preview-status')).toBeVisible();
  await expect(bare.locator('.preview-status span:last-child')).toHaveText('Hors ligne');
  await expect(page.locator('#grid iframe')).toHaveCount(0);
  await withBanner.hover({position:{x:12,y:60}});   // no preview to load on an offline channel
  await page.waitForTimeout(700);
  await expect(page.locator('#grid iframe')).toHaveCount(0);
  await expect(withBanner.locator('.preview-status span:last-child')).toHaveText('Hors ligne');
  // a mounted player on an offline channel never turns into a play button
  await page.evaluate(()=>{ allPaused=false; tiles.forEach(t=>{ t.paused=false; sync(t); }); });
  await page.waitForTimeout(600);
  await page.evaluate(()=>{ for (const t of tiles.values()) { t.readyAt=Date.now()-20000; mark(t); } });
  await expect(page.locator('#grid .tile.stalled')).toHaveCount(0);
  await expect(withBanner.locator('.play-hint')).toHaveCount(0);
  // the play button of an offline tile steps aside, and the global button leaves the tile alone
  const play=withBanner.locator('.bar .pp');
  await expect(play).toHaveAttribute('aria-disabled','true');
  await expect(play).toHaveAttribute('aria-label','Hors ligne');
  await play.click({force:true});
  expect(await page.evaluate(()=>({allPaused,paused:tiles.get('banner').paused}))).toEqual({allPaused:false,paused:false});
  await page.locator('#playall').click();
  expect(await page.evaluate(()=>({allPaused,paused:tiles.get('banner').paused}))).toEqual({allPaused:true,paused:false});
  await expect(play).toHaveAttribute('aria-disabled','true');
  expect(errors).toEqual([]);
});

test('a stalled player exposes its native controls and keeps loading feedback in the header',async({page})=>{
  const errors=await setup(page);
  // READY, then play() leaves the player in Ready: nothing starts until a click inside the embed.
  const stuck=mockPlayer.replace(/play\(\) \{ if \(this.paused\) \{[^\n]+?\} \}/,'play() { this.attempts=(this.attempts||0)+1; }');
  await page.route('https://player.twitch.tv/js/embed/v1.js',r=>r.fulfill({contentType:'text/javascript',body:stuck}));
  await page.route('**/api/search?**',r=>r.fulfill({json:{data:[{broadcaster_login:'one',is_live:true},{broadcaster_login:'two',is_live:true}]}}));
  await page.addInitScript(()=>localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one','two']})));
  await page.clock.install();await page.goto('/');await page.clock.runFor(1000);
  const tile=page.locator('#grid [data-login="one"]'),loader=tile.locator('.load'),frame=tile.locator('.player iframe');
  await expect(tile).toHaveClass(/loading/);
  await expect(loader).toHaveCount(0);
  await expect(frame).toHaveCSS('pointer-events','none');
  await page.clock.runFor(9000);
  await expect(tile).toHaveClass(/stalled/);
  await expect(loader).toHaveCount(0);
  await expect(tile.locator('.play-hint')).toHaveCount(0);
  await expect(tile.locator('.playback-status')).toBeVisible();
  await expect(frame).toHaveCSS('pointer-events','auto');
  await expect(tile.locator('.preview-cover')).toBeVisible();
  // the gesture inside the embed starts it: the play button and the still fade away
  await page.evaluate(()=>{const p=tiles.get('one').player;p.paused=false;p.emit('play');p.emit('playing');});
  await page.clock.runFor(1000);
  await expect(tile).not.toHaveClass(/stalled/);
  await expect(tile.locator('.play-hint')).toHaveCount(0);
  await expect(tile.locator('.preview-cover')).toBeHidden();
  await expect(frame).toHaveCSS('pointer-events','none');
  expect(errors).toEqual([]);
});

test('the global play and pause button is a shortcut every tile can override',async({page})=>{
  const errors=await setup(page);
  await page.route('**/api/search?**',r=>r.fulfill({json:{data:[{broadcaster_login:'one',is_live:true},{broadcaster_login:'two',is_live:true}]}}));
  await page.addInitScript(()=>localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one','two'],paused:{two:true}})));
  await page.goto('/');
  const button=page.locator('#playall'),one=page.locator('#grid [data-login="one"] .bar .pp'),two=page.locator('#grid [data-login="two"] .bar .pp');
  const state=()=>page.evaluate(()=>({allPaused,one:allPaused||tilePaused(tiles.get('one')),two:allPaused||tilePaused(tiles.get('two'))}));   // what each tile effectively does
  await expect(button).toHaveAttribute('aria-pressed','false');
  await expect(one).toHaveAttribute('aria-pressed','false');
  await expect(two).toHaveAttribute('aria-pressed','true');
  await button.click();   // pause: every tile offers play
  await expect(button).toHaveAttribute('aria-pressed','true');
  await expect(one).toHaveAttribute('aria-pressed','true');
  await expect(two).toHaveAttribute('aria-pressed','true');
  expect(await state()).toEqual({allPaused:true,one:true,two:true});
  await one.click();   // a tile overrides the global pause on its own
  await expect(one).toHaveAttribute('aria-pressed','false');
  await expect(two).toHaveAttribute('aria-pressed','true');
  await expect(button).toHaveAttribute('aria-pressed','false');
  expect(await state()).toEqual({allPaused:false,one:false,two:true});
  await one.click();   // the last tile pausing itself reads as a paused grid
  await expect(button).toHaveAttribute('aria-pressed','true');
  await button.click();   // play: every tile resumes, the earlier individual pauses included
  await expect(button).toHaveAttribute('aria-pressed','false');
  await expect(one).toHaveAttribute('aria-pressed','false');
  await expect(two).toHaveAttribute('aria-pressed','false');
  expect(await state()).toEqual({allPaused:false,one:false,two:false});
  await two.click();   // a tile pauses itself under a playing grid
  await expect(two).toHaveAttribute('aria-pressed','true');
  await expect(button).toHaveAttribute('aria-pressed','false');
  expect(errors).toEqual([]);
});

for (const savedRendering of ['current','trial-1']) test(`saved ${savedRendering} preferences cannot select a retired renderer`, async ({page}) => {
  await setup(page);
  await page.addInitScript(savedRendering => localStorage.setItem('tg.preferences',JSON.stringify({playerRendering:savedRendering,language:'en',theme:'light'})), savedRendering);
  await page.addInitScript(() => localStorage.setItem('tg.layout.guest',JSON.stringify({order:['one']})));
  await page.goto('/');
  await expect(page.locator('#grid .player iframe')).toHaveCSS('transform','none');
  await expect(page.locator('#player-rendering-setting')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  expect(await page.evaluate(() => 'playerRendering' in preferences)).toBe(false);
});
