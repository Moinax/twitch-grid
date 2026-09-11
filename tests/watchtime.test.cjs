const test = require('node:test');
const assert = require('node:assert/strict');

const day = 86400000;

test('watch time halves over a half-life and keeps adding up', async () => {
  const { credit, decayed, HALF_LIFE } = await import('../src/services/watchtime.ts');
  const now = Date.UTC(2026, 0, 1);
  const entries = credit({}, ['alice'], 60, now);
  assert.equal(decayed(entries.alice, now), 60);
  assert.ok(Math.abs(decayed(entries.alice, now + HALF_LIFE) - 30) < 1e-9);
  credit(entries, ['alice'], 10, now + HALF_LIFE);
  assert.ok(Math.abs(decayed(entries.alice, now + HALF_LIFE) - 40) < 1e-9);
});

test('a steady watcher outranks a bigger but stale habit', async () => {
  const { credit, decayed } = await import('../src/services/watchtime.ts');
  const now = Date.UTC(2026, 0, 1);
  const entries = credit({}, ['stale'], 600, now - 90 * day);
  credit(entries, ['steady'], 30, now);
  assert.ok(decayed(entries.steady, now) > decayed(entries.stale, now));
});

test('a weighted credit smaller than the prune floor still accumulates', async () => {
  const { credit, decayed } = await import('../src/services/watchtime.ts');
  let now = Date.UTC(2026, 0, 1), entries = {};
  for (let i = 0; i < 4; i++) { credit(entries, ['coin'], 0.25, now); now += 60000; }
  assert.ok(Math.abs(decayed(entries.coin, now) - 1) < 1e-3); // four muted minutes are worth one attentive one
});

test('faded entries are dropped and garbage never scores', async () => {
  const { credit, decayed } = await import('../src/services/watchtime.ts');
  const now = Date.UTC(2026, 0, 1);
  const entries = credit({ old: { score: 1, at: now - 365 * day } }, ['fresh'], 1, now);
  assert.deepEqual(Object.keys(entries), ['fresh']);
  assert.equal(decayed(undefined, now), 0);
  assert.equal(decayed({ score: 'lots', at: now }, now), 0);
  assert.equal(decayed({ score: 5, at: now + day }, now), 5); // a clock that jumped back must not inflate
});
