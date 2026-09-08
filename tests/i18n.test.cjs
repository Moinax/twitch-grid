// Every data-i18n key in index.html has an English and a Dutch translation, so the landing and the app never fall back to French.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/../preferences.js', 'utf8');
const context = { localStorage: { getItem: () => null }, matchMedia: () => ({ matches: true, addEventListener() {} }), document: { documentElement: { style: {}, dataset: {} }, querySelector: () => null }, dispatchEvent() {} };
vm.runInNewContext(source + '\nthis.translations = translations;', context);
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const untranslated = new Set(['Twitch grid', 'GitHub', 'FR', 'EN', 'NL']);
test('landing and app copy is translated', () => {
  const missing = [];
  for (const [, attr, quoted, tag] of html.matchAll(/data-i18n(-[a-z-]+)?="([^"]*)"[^>]*>(?:([^<]*)<)?/g)) {
    const key = quoted || (attr ? null : (tag || '').trim());
    if (!key || untranslated.has(key)) continue;
    if (!context.translations[key] || context.translations[key].length !== 2) missing.push(key);
  }
  assert.deepStrictEqual(missing, []);
});
