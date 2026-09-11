// Screenshots the real landing hero (copy, fonts, app mock) in English, laid out for a 1200 × 630 share card.
// The share tags in index.html are English too: crawlers never run the in-page language switch.
const { chromium } = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');

const port = 8768;
const card = `
  #landing .island, #landing .eyebrow, #landing .cta, #landing .proof, #landing .skip { display: none; }
  #landing, #landing * { animation: none !important; }
  #landing { overflow: hidden; }
  #landing .hero { padding: 56px 24px 0; }
  #landing .hero::before { mask-image: radial-gradient(70% 60% at 50% 30%, #000, transparent); -webkit-mask-image: radial-gradient(70% 60% at 50% 30%, #000, transparent); }
  #landing h1 { margin-top: 0; font-size: 72px; }
  #landing .lead { max-width: 880px; margin-top: 16px; font-size: 22px; line-height: 32px; }
  #landing .mock { margin-top: 40px; }
`;

async function render() {
  const server = spawn(process.execPath, ['server.cjs', String(port)], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  // Vite takes a moment to listen; wait for the port instead of racing it.
  for (let attempt = 0; ; attempt++) {
    try { await fetch(`http://localhost:${port}/`); break; } catch (error) {
      if (attempt === 100) throw error;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    await page.addInitScript(() => localStorage.setItem('tg.preferences', JSON.stringify({ language: 'en', theme: 'dark' })));
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: card });
    await page.evaluate(() => { document.body.classList.add('landing'); return document.fonts.ready; });
    const output = path.join(__dirname, '../public/assets/share-card.png');
    await page.screenshot({ path: output });
    console.log(output);
  } finally {
    await browser.close();
    server.kill();
  }
}

render().catch(error => { console.error(error); process.exitCode = 1; });
