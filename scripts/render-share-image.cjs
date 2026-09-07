const { chromium } = require('@playwright/test');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function render() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(__dirname, 'share-card.html')).href);
    await page.evaluate(() => document.fonts.ready);
    const output = path.join(__dirname, '../assets/share-card.png');
    await mkdir(path.dirname(output), { recursive: true });
    await page.screenshot({ path: output });
    console.log(output);
  } finally {
    await browser.close();
  }
}

render().catch(error => { console.error(error); process.exitCode = 1; });
