const { test, expect } = require('@playwright/test');
const { mockPlayer } = require('./fixtures.cjs');
const path = require('node:path');
async function setup(page, player = 'embed', fail = false) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(player => {
    localStorage.setItem('tg.preferences', JSON.stringify({ player, language: 'en' }));
    sessionStorage.setItem('tg.landing', 'true');
  }, player);
  await page.route('https://player.twitch.tv/js/embed/v1.js', route => player === 'custom' ? route.abort() : route.fulfill({ contentType: 'text/javascript', body: mockPlayer }));
  await page.route('**/config.json', route => route.fulfill({ json: { twitchClientId: '' } }));
  await page.route('**/api/search?**', route => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: { data: params.has('login') ? params.getAll('login').map(login => ({ broadcaster_login: login, is_live: true })) : [] } });
  });
  await page.route('**/api/stream?**', route => fail
    ? route.fulfill({ status: 502, json: { error: 'PLAYBACK_ACCESS_DENIED' } })
    : route.fulfill({ contentType: 'application/vnd.apple.mpegurl', body: '#EXTM3U\n#EXT-X-TARGETDURATION:20\n#EXT-X-VERSION:3\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:20,\nhttp://localhost:8767/test-media.ts\n#EXT-X-ENDLIST\n' }));
  await page.route('**/test-media.ts', route => route.fulfill({ contentType: 'video/mp2t', path: path.join(__dirname, 'media/playback.ts') }));
  await page.goto('/');
  await page.waitForFunction(() => typeof add === 'function' && restored);
  await page.evaluate(() => add({ twitch: 'example', display: 'Example', online: true, profileUrl: '', previewUrl: '', offlineUrl: '', title: '', game: '', viewersAmount: { number: 0, formatted: '' } }));
  return errors;
}
test('switches between embed and HLS while preserving tile settings', async ({ page }) => {
  const errors = await setup(page);
  await expect(page.locator('#grid iframe')).toHaveCount(1);
  await page.evaluate(() => { tiles.get('example').volume = 0.3; });
  await page.selectOption('#player-setting', 'custom');
  await expect(page.locator('#grid iframe')).toHaveCount(0);
  await expect.poll(() => page.locator('#grid video').evaluate(video => video.currentTime)).toBeGreaterThan(0);
  await expect(page.locator('#grid video')).toHaveJSProperty('volume', 0.3);
  await page.evaluate(() => { window.originalVideo = document.querySelector('#grid video'); });
  await page.selectOption('#theme-setting', 'light');
  expect(await page.evaluate(() => originalVideo === document.querySelector('#grid video'))).toBe(true);
  await page.selectOption('#player-setting', 'embed');
  await expect(page.locator('#grid video')).toHaveCount(0);
  await expect(page.locator('#grid iframe')).toHaveCount(1);
  expect(await page.evaluate(() => tiles.get('example').volume)).toBe(0.3);
  expect(errors).toEqual([]);
});
test('custom mode starts without the Twitch SDK and survives reload', async ({ page }) => {
  const errors = await setup(page, 'custom');
  await expect.poll(() => page.locator('#grid video').evaluate(video => video.currentTime)).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('#player-setting')).toHaveValue('custom');
  await expect(page.locator('#grid video')).toHaveCount(1);
  await expect(page.locator('#grid iframe')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('failed HLS playback offers a retry and allows switching back to embed', async ({ page }) => {
  const errors = await setup(page, 'embed', true);
  await page.selectOption('#player-setting', 'custom');
  await expect(page.locator('.custom-retry')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.custom-retry')).toHaveText('Stream unavailable. Retry');
  await page.selectOption('#player-setting', 'embed');
  await expect(page.locator('#grid iframe')).toHaveCount(1);
  await expect(page.locator('.custom-retry')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const pauseMode of ['tile', 'global', 'native']) {
  test(`custom ${pauseMode} pause retains the video and last frame until resumed`, async ({ page }) => {
    const errors = await setup(page, 'custom');
    const tile = page.locator('#grid [data-login="example"]');
    const video = tile.locator('video');
    await expect.poll(() => video.evaluate(video => video.currentTime)).toBeGreaterThan(0);
    await page.evaluate(() => { window.retainedVideo = document.querySelector('#grid video'); });
    if (pauseMode === 'native') {
      await video.evaluate(video => video.pause());
    } else {
      // Small tiles must also stay paused when hovered.
      await page.setViewportSize({ width: 900, height: 720 });
      await page.evaluate(() => add({ twitch: 'second', display: 'Second', online: true, profileUrl: '', previewUrl: '', offlineUrl: '', title: '', game: '', viewersAmount: { number: 0, formatted: '' } }));
      await page.locator(pauseMode === 'global' ? '#playall' : '#grid [data-login="example"] .pp').click();
    }
    await expect(video).toHaveJSProperty('paused', true);
    const pausedAt = await video.evaluate(video => video.currentTime);
    await tile.locator('.player').hover();
    // Span a watchdog tick to catch unintended hover or background resumption.
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => retainedVideo === document.querySelector('#grid [data-login="example"] video'))).toBe(true);
    await expect(video).toHaveJSProperty('paused', true);
    await expect(video).toHaveJSProperty('currentTime', pausedAt);
    await expect(tile).not.toHaveClass(/poster-only/);
    await expect(tile.locator('.preview-cover')).toHaveClass(/pause-overlay/);
    await expect(tile.locator('.stream-poster')).toBeHidden();
    const playButton = tile.locator('.preview-cover').getByRole('button', { name: 'Play', exact: true });
    await expect(playButton).toBeVisible();
    if (pauseMode === 'native') {
      await playButton.focus();
      await page.keyboard.press('Enter');
    } else await playButton.click();
    await expect(playButton).toBeHidden();
    await expect.poll(() => video.evaluate(video => video.currentTime)).toBeGreaterThan(pausedAt);
    expect(await page.evaluate(() => retainedVideo === document.querySelector('#grid [data-login="example"] video'))).toBe(true);
    expect(errors).toEqual([]);
  });
}
