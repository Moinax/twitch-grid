const { test, expect } = require('@playwright/test');
const mockPlayer = `window.Twitch = { Player: class {
  static READY = 'ready'; static PLAYING = 'playing';
  constructor(el, options) { this.options = options; this.muted = true; this.paused = false;
    el.appendChild(document.createElement('iframe')); }
  addEventListener(event, callback) { if (event === 'ready') setTimeout(callback, 0); }
  getPlayerState() { return { playback: this.paused ? 'Paused' : 'Playing' }; }
  setMuted(value) { this.muted = value; } getMuted() { return this.muted; }
  setVolume() {} play() { this.paused = false; } pause() { this.paused = true; }
}};`;
async function setup(page, connected = false) {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://player.twitch.tv/js/embed/v1.js', r => r.fulfill({ contentType: 'text/javascript', body: mockPlayer }));
  await page.route('**/config.json', r => r.fulfill({ json: { twitchClientId: connected ? 'test-client' : '' } }));
  await page.route('**/_vercel/**', r => r.fulfill({ body: '' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '' }));
  return errors;
}
async function favorite(page, login) {
  await page.locator('#q').fill(login);
  await page.locator('#add-login').click();
  await expect(page.locator('#q')).toHaveValue('');
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
  await page.addInitScript(() => sessionStorage.setItem('tg.oauth', JSON.stringify({ state: 'expected', at: Date.now() })));
  await page.goto('/#access_token=fake-token&state=expected');
  await expect(page.locator('#account')).toContainText('moinax');
  expect(page.url()).not.toContain('access_token');
  await expect(page.locator('#list li')).toHaveCount(2);
  await expect(page.locator('#list li').first()).toHaveAttribute('data-login', 'live');
  await expect(page.locator('[data-login="offline"] .g')).toHaveText('Hors ligne');
  await page.locator('#q').fill('found');
  await expect(page.locator('#list [data-login="found"]')).toBeVisible();
  await page.locator('#list [data-login="found"] .favorite').click();
  await page.locator('#disconnect').click();
  await expect(page.locator('#follows-tab')).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem('tg.session'))).toBeNull();
  await page.locator('#q').fill('');
  await expect(page.locator('#list li')).toHaveCount(1);
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
