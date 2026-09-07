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
    const login = new URL(route.request().url()).searchParams.get('q').toLowerCase();
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
  await expect(page.locator('#list-empty')).toContainText('premier favori');
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
  await page.addInitScript(() => { localStorage.setItem('tg.layout', '{broken'); localStorage.setItem('tg.favorites', JSON.stringify([{ twitch: 'safe', display: '<img src=x onerror=alert(1)>' }, { twitch: '<script>' }])); });
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
  await expect(page.locator('#account')).toContainText('moinax');
  expect(page.url()).not.toContain('access_token');
  await expect(page.locator('#list li')).toHaveCount(2);
  await expect(page.locator('#list li').first()).toHaveAttribute('data-login', 'live');
  await expect(page.locator('[data-login="offline"] .g')).toHaveText('Hors ligne');
  await page.locator('#q').fill('found');
  await expect(page.locator('#list [data-login="found"]')).toBeVisible();
  await expect(page.locator('#list .favorite:visible')).toHaveCount(0);
  await expect(page.locator('#add-login')).toBeHidden();
  await expect(page.locator('#source-label')).toHaveText('Follows');
  await expect(page.locator('#side')).not.toContainText('Favoris');
  await page.locator('#list [data-login="found"] .channel').click();
  await page.locator('#disconnect').click();
  await expect(page.locator('#source-label')).toHaveText('Favoris');
  expect(await page.evaluate(() => sessionStorage.getItem('tg.session'))).toBeNull();
  await page.locator('#q').fill('');
  await expect(page.locator('#list li')).toHaveCount(1);
  await expect(page.locator('#list li')).toHaveAttribute('data-login', 'saved');
  await expect(page.locator('#list .favorite')).toBeVisible();
  expect(errors).toEqual([]);
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
test('mobile sidebar opens for search and closes when a stream is selected', async ({ page }) => {
  const errors = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/collapsed/);
  await page.locator('#top').click();
  await expect(page.locator('#q')).toBeFocused();
  await favorite(page, 'zerator');
  await page.locator('#list .channel').click();
  await expect(page.locator('body')).toHaveClass(/collapsed/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
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
  await page.locator('#grid .bar b').click();
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
  await expect(page.locator('#grid .ctl input')).toHaveValue('0.25');
  expect(await page.evaluate(() => tiles.get('one').player.paused)).toBe(true);
  await page.locator('#grid .bar b').click(); await page.clock.runFor(1000);
  expect(await page.evaluate(() => tiles.get('one').player.getQuality())).toBe('720p60');
  expect(errors).toEqual([]);
});
test('native Play resumes a spotlight restored in a paused state', async ({ page }) => {
  await setup(page); await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('tg.layout', JSON.stringify({order:['one','two'],focused:'one',allPaused:true,paused:{one:true}})));
  await page.goto('/'); await page.clock.runFor(1000);
  await page.evaluate(() => tiles.get('one').player.play());
  await page.clock.runFor(6000);
  expect(await page.evaluate(() => ({ allPaused, one:tiles.get('one').paused, two:tiles.get('two').paused, playing:!tiles.get('one').player.paused })))
    .toEqual({allPaused:false,one:false,two:true,playing:true});
});
test('empty page offers Twitch first and remembers the choice to continue without an account', async ({ page }) => {
  const errors = await setup(page, true);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('#top')).toHaveText('Connecter Twitch');
  await expect(page.locator('#top')).toBeEnabled();
  await expect(page.locator('#guest')).toBeVisible();
  await page.locator('#guest').click();
  await expect(page.locator('#top')).toHaveText('Ajouter un streamer');
  await expect(page.locator('#guest')).toBeHidden();
  await expect(page.locator('#q')).toBeFocused();
  await page.reload();
  await expect(page.locator('#top')).toHaveText('Ajouter un streamer');
  await expect(page.locator('#guest')).toBeHidden();
  const icon = page.getByRole('button', {name:'Connecter Twitch', exact:true});
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
  await expect(page.locator('#source-label')).toHaveText('Favoris');
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
