const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Check the React templates, including the separately animated landing sentence.
test('landing and app copy is translated', async () => {
  const { translations } = await import('../src/services/translations.ts');
  const directory = path.join(__dirname, '../src/components');
  const source = fs.readdirSync(directory).filter(file => file.endsWith('.tsx')).map(file => fs.readFileSync(path.join(directory, file), 'utf8')).join('\n');
  const untranslated = new Set(['Twitch grid', 'GitHub', 'FR', 'EN', 'NL']);
  const missing = [];
  for (const [, attr, quoted, text] of source.matchAll(/data-(?:i18n(-[a-z-]+)?|reveal-key)="([^"]*)"[^>]*>(?:([^<]*)<)?/g)) {
    const key = quoted || (attr ? null : (text || '').replace(/\s+/g, ' ').trim());
    if (!key || untranslated.has(key)) continue;
    if (!translations[key] || translations[key].length !== 2) missing.push(key);
  }
  assert.deepEqual(missing, []);
});
