// Attention-weighted minutes per channel, halved every HALF_LIFE of not watching: a habit fades on its own instead of
// pinning a channel to the top forever. A credit is worth less than a minute when the tile only had a corner of the grid.
export interface WatchEntry {
  score: number;
  at: number;
}
// Picked by feel: raise it if the list forgets channels you still watch weekly, lower it if it clings to old ones.
export const HALF_LIFE = 14 * 86400000;
export function decayed(entry: WatchEntry | undefined, now = Date.now()) {
  if (!Number.isFinite(entry?.score) || !Number.isFinite(entry?.at)) return 0;
  return entry!.score * 0.5 ** (Math.max(0, now - entry!.at) / HALF_LIFE);
}
export function credit(
  entries: Record<string, WatchEntry>,
  logins: Iterable<string>,
  minutes = 1,
  now = Date.now(),
) {
  for (const login of logins)
    entries[login] = { score: decayed(entries[login], now) + minutes, at: now };
  // Almost nothing left of a decayed habit: forget it rather than carry it around. The floor stays well under the
  // smallest credit a caller can make, or a channel watched only in a weighted corner would be dropped as fast as it grows.
  for (const login of Object.keys(entries))
    if (decayed(entries[login], now) < 0.05) delete entries[login];
  return entries;
}
