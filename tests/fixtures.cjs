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
// The preferences live in a modal: open it, pick, and close it so the page is usable again.
async function choose(page, id, value) {
  await page.locator('#settings').click();
  await page.selectOption(id, value);
  await page.keyboard.press('Escape');
  await page.locator('#settings-dialog').waitFor({ state: 'hidden' });
}
module.exports = { mockPlayer, choose };
