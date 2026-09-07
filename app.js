const $ = s => document.querySelector(s);
const list = $('#list'), grid = $('#grid');
const tiles = new Map();   // twitch login -> { el, player, bar }
let streamers = [], focused = null, order = [], dragging = null, allPaused = false, restored = false;

// everything needed to come back to the same screen: tile order, zoom, global pause, sidebar, per-tile mute
// with the player's controls hidden, mute can only change through our button: t.muted is the intent, never read back
// from the iframe (the autoplay policy forces mute on until the first click, and that must not clobber the saved state)
function save() { if (!restored) return; writeStored('tg.layout', { order, focused, allPaused, collapsed: document.body.classList.contains('collapsed'), muted: Object.fromEntries([...tiles].map(([k, t]) => [k, t.muted])), pinned: Object.fromEntries([...tiles].map(([k, t]) => [k, t.pinned])), volume: Object.fromEntries([...tiles].map(([k, t]) => [k, t.volume])), paused: Object.fromEntries([...tiles].map(([k, t]) => [k, t.paused])) }); }
function restore() {
  const st = readStored('tg.layout', {});
  for (const login of (Array.isArray(st.order) ? [...new Set(st.order)].filter(validLogin) : [])) { const s = streamers.find(x => x.twitch === login) || channel({ twitch: login }); if (s) add(s, st.muted?.[login] ?? true, st.volume?.[login] ?? 0.5, !!st.paused?.[login], !!st.pinned?.[login]); }
  focused = tiles.has(st.focused) ? st.focused : null;
  allPaused = !!st.allPaused;
  $('#playall').textContent = allPaused ? '▶\uFE0E' : '⏸\uFE0E';
  document.body.classList.toggle('collapsed', st.collapsed ?? innerWidth <= 700);
  layout();
  tick();   // right away, not at the first second: a click that lands before it hits the page instead of the video
}

// a tile plays only while it is in the viewport and the global toggle is not paused
function fit(p) {
  const f = p.firstElementChild;
  if (!f) return;
  const s = Math.min(p.clientWidth / f.offsetWidth, p.clientHeight / f.offsetHeight);   // offsetWidth ignores the transform
  f.style.transform = `translate(${(p.clientWidth - f.offsetWidth * s) / 2}px, ${(p.clientHeight - f.offsetHeight * s) / 2}px) scale(${s})`;
}
const ro = new ResizeObserver(es => es.forEach(e => fit(e.target)));
// the player tracks its own viewability and refuses to start under half visible, whatever play() says: below that
// a tile shows "scroll" instead of a spinner that would never end. ponytail: 0.5 mirrors the player's bar, raise if a
// half-visible tile still spins
const io = new IntersectionObserver(es => es.forEach(e => { const t = tiles.get(e.target.dataset.login); if (t) { t.visible = e.intersectionRatio >= 0.5; sync(t); mark(t); } }), { root: grid, threshold: 0.5 });
// a relayout flickers visibility for a frame or two: let it settle before touching the player
// a fullscreen tile leaves the grid's box, so the observer reports it hidden while it fills the screen; a tile with
// its sound on keeps playing wherever it is, the sound is the point
const onScreen = t => t.visible || !t.muted || document.fullscreenElement === t.el;
// Firefox refuses an audible (re)start in an iframe that was never clicked, and the player then sits paused for good:
// start muted, always allowed, and the watchdog gives the sound back once it plays (no restart in that)
function start(t) { if (!t.muted && t.player.getPlayerState().playback !== 'Playing') t.player.setMuted(true); t.player.play(); t.nudgedAt = Date.now(); }
function sync(t) { clearTimeout(t.timer); t.timer = setTimeout(() => { if (allPaused || t.paused || !onScreen(t)) t.player.pause(); else start(t); }, 400); }
// the player also pauses on its own during some reflows: whatever should be playing gets nudged back every second
function watchdog(t) {
  if (!t.ready) return;
  // isPaused() is false in the Ready/Idle states the player drops into after a resize, so go by the playback state.
  // A live stream takes seconds to (re)start and a play() during that restarts it: nudge at most every 5s
  const st = t.player.getPlayerState().playback;
  if (!allPaused && !t.paused && onScreen(t) && !t.el.classList.contains('offline') && st !== 'Playing' && st !== 'Buffering' && Date.now() - (t.nudgedAt || 0) > 5000) {
    // a play() the player swallowed (seen after a window resize) leaves it stuck until a click inside it: the second
    // nudge pauses first, which is what that click does, then plays again once the teardown had its second
    if (t.nudged) { t.player.pause(); setTimeout(() => { if (t.el.isConnected && !allPaused && !t.paused && onScreen(t)) start(t); }, 1000); } else start(t);
    t.nudged = true;
  } else if (st === 'Playing') t.nudged = false;
  if (activated && st === 'Playing' && t.player.getMuted() !== t.muted) t.player.setMuted(t.muted);   // keeps the intent applied once sound is allowed
  mark(t);
}
// loader shown while a tile that should play is not playing: deliberate pauses show Twitch's own frame instead
function mark(t) {
  if (!t.ready) return;
  const st = t.player.getPlayerState();
  const want = !allPaused && !t.paused && onScreen(t), playing = st.playback === 'Playing';
  t.el.classList.toggle('loading', want && !playing);
  t.el.classList.toggle('partial', !allPaused && !t.paused && !t.visible && !playing);   // on screen but not enough for the player to start
  t.since = want && !playing ? t.since || Date.now() : 0;
}

function viewers(s) { return s.viewersAmount.number; }

// One temporary, muted player; removing its iframe stops playback and network activity.
const preview = $('#preview'), previewVideo = preview.querySelector('.player');
let previewRow = null, previewOnline = null, previewTimer, previewCloseTimer, previewLoadTimer;
function hidePreview() {
  clearTimeout(previewTimer);
  clearTimeout(previewCloseTimer);
  clearTimeout(previewLoadTimer);
  previewRow?.removeAttribute('aria-describedby');
  previewRow = null;
  preview.hidden = true;
  previewVideo.replaceChildren();
}
function positionPreview() {
  if (!previewRow || preview.hidden) return;
  const r = previewRow.getBoundingClientRect(), edge = $('#side').getBoundingClientRect().right;
  preview.style.left = Math.max(8, Math.min(edge + 10, innerWidth - preview.offsetWidth - 8)) + 'px';
  preview.style.top = Math.max(8, Math.min(r.top, innerHeight - preview.offsetHeight - 8)) + 'px';
  fit(previewVideo);
}
function previewInfo(s) {
  preview.classList.toggle('live', s.online);
  preview.querySelector('.name').textContent = s.display;
  preview.querySelector('.badge').textContent = s.online === false ? 'Hors ligne' : s.online ? 'En direct · Muet' : 'Aperçu · Muet';
  preview.querySelector('.details').textContent = [s.game, s.online ? s.viewersAmount.formatted + ' viewers' : ''].filter(Boolean).join(' · ');
}
function showPreview(row) {
  const s = streamers.find(s => s.twitch === row.dataset.login);
  if (!s || !row.isConnected || document.hidden) return;
  previewRow = row;
  previewOnline = s.online;
  previewInfo(s);
  row.setAttribute('aria-describedby', 'preview');
  const status = preview.querySelector('.status'), message = status.querySelector('span');
  status.querySelector('img').src = s.profileUrl;
  message.textContent = s.online === false ? 'Ce streamer est hors ligne' : 'Chargement de l’aperçu…';
  status.hidden = false;
  preview.hidden = false;
  positionPreview();
  if (s.online === false) return;
  if (!window.Twitch?.Player) { message.textContent = 'Aperçu indisponible'; return; }
  const player = new Twitch.Player(previewVideo, { channel: s.twitch, parent: [location.hostname], width: 640, height: 360, autoplay: true, muted: true, controls: false });
  const frame = previewVideo.querySelector('iframe');
  frame.tabIndex = -1;
  frame.title = 'Aperçu de ' + s.display;
  fit(previewVideo);
  const current = () => previewVideo.firstElementChild === frame;
  player.addEventListener(Twitch.Player.READY, () => { if (current()) { player.setMuted(true); player.setVolume(0); } });
  player.addEventListener(Twitch.Player.PLAYING, () => { if (current()) { clearTimeout(previewLoadTimer); status.hidden = true; } });
  for (const event of ['offline', 'playbackBlocked', 'error']) player.addEventListener(event, () => {
    if (!current()) return;
    clearTimeout(previewLoadTimer);
    status.hidden = false;
    message.textContent = event === 'offline' ? 'Ce streamer est hors ligne' : 'Aperçu indisponible';
  });
  previewLoadTimer = setTimeout(() => { if (current()) message.textContent = 'L’aperçu tarde à démarrer'; }, 12000);
}
function queuePreview(row) {
  clearTimeout(previewCloseTimer);
  if (previewRow === row && !preview.hidden) return;
  hidePreview();
  previewRow = row;
  previewTimer = setTimeout(() => showPreview(previewRow), 300);
}
function leavePreview() { clearTimeout(previewTimer); clearTimeout(previewCloseTimer); previewCloseTimer = setTimeout(hidePreview, 180); }
preview.onpointerenter = () => clearTimeout(previewCloseTimer);
preview.onpointerleave = leavePreview;
list.addEventListener('scroll', hidePreview, { passive: true });
addEventListener('resize', hidePreview);
addEventListener('blur', hidePreview);
document.addEventListener('visibilitychange', () => { if (document.hidden) hidePreview(); });

// Sidebar and Twitch account integration.
function toggle(s) {
  if (focused && focused !== s.twitch) {
    if (!tiles.has(s.twitch)) add(s);
    focus(s.twitch);
  } else {
    tiles.has(s.twitch) ? remove(s.twitch) : add(s);
  }
  if (innerWidth <= 700) { document.body.classList.add('collapsed'); save(); }
  renderList();
}

function add(s, muted = true, volume = 0.5, paused = false, pinned = false) {
  if (tiles.has(s.twitch)) return;
  if (!window.Twitch?.Player) { notice('Le lecteur Twitch est indisponible. Recharge la page pour réessayer.'); return; }
  const el = document.createElement('div');
  el.className = 'tile loading';
  el.dataset.login = s.twitch;
  el.innerHTML = `<div class="bar"><b>${escapeHTML(s.display)}</b><span>${escapeHTML(s.viewersAmount.formatted)}</span><button title="Son" class="snd"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><g class="on"><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></g><g class="off"><path d="m23 9-6 6"/><path d="m17 9 6 6"/></g></svg></button><button title="Revenir à la grille" class="min"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></svg></button><button title="Plein écran" class="fs"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g class="enter"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></g><g class="exit"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></g></svg></button><button title="Retirer" class="close">✕</button></div><div class="player"></div><div class="load"><i></i><b>${escapeHTML(s.display)}</b><small>Hors ligne</small><small class="more">Fais défiler pour lire</small></div><div class="ctl"><button title="Play/pause"></button><input type="range" min="0" max="1" step="0.05" title="Volume"><output></output></div>`;
  const [snd, min, fs, close] = el.querySelectorAll('button');
  min.onclick = e => { e.stopPropagation(); focus(s.twitch); };
  fs.onclick = e => { e.stopPropagation(); document.fullscreenElement === el ? document.exitFullscreen() : el.requestFullscreen(); };
  const pp = el.querySelector('.ctl button'), vol = el.querySelector('.ctl input'), pct = el.querySelector('.ctl output');
  const ppIcon = () => pp.textContent = t.paused ? '▶\uFE0E' : '⏸\uFE0E';
  pp.onclick = e => { e.stopPropagation(); t.paused = !t.paused; ppIcon(); sync(t); mark(t); save(); };
  vol.value = volume; pct.value = Math.round(volume * 100) + '%';
  vol.oninput = () => { t.volume = +vol.value; pct.value = Math.round(t.volume * 100) + '%'; player.setVolume(t.volume); save(); };
  // the button cycles muted → loud → pinned (loud, and stays so out of the spotlight) → muted
  snd.onclick = e => { e.stopPropagation(); if (t.muted) setMuted(t, false); else if (!t.pinned) t.pinned = true; else { t.pinned = false; setMuted(t, true); } paint(t); save(); };
  const bar = el.querySelector('.bar');
  bar.onclick = () => focus(s.twitch);
  el.querySelector('.player').onclick = () => { if (!el.classList.contains('big')) focus(s.twitch); };
  // ponytail: reorder via CSS `order` only — moving an iframe in the DOM reloads the player
  bar.draggable = true;
  bar.ondragstart = e => { dragging = s.twitch; document.body.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; };
  el.ondragover = e => { e.preventDefault(); el.classList.add('over'); };
  el.ondragleave = () => el.classList.remove('over');
  el.ondrop = e => { e.preventDefault(); move(dragging, s.twitch); };
  close.onclick = e => { e.stopPropagation(); remove(s.twitch); renderList(); };
  grid.append(el);
  // always born muted: with controls hidden, an unmuted player the autoplay policy blocks stalls on a play overlay
  // instead of self-muting — so start muted (always allowed) and apply the saved state once ready
  const player = new Twitch.Player(el.querySelector('.player'), { channel: s.twitch, parent: [location.hostname], width: '100%', height: '100%', muted: true, controls: false });
  const t = { el, player, bar, visible: true, muted, volume, paused, pinned, ready: false };
  tiles.set(s.twitch, t);
  ppIcon();
  player.addEventListener(Twitch.Player.READY, () => { t.ready = true; fit(el.querySelector('.player')); if (activated) player.setMuted(t.muted); player.setVolume(t.volume); sync(t); mark(t); });
  // the player's own events drive the loader instantly; the 1s loop is the backstop for whatever they miss
  for (const ev of ['playing', 'play', 'pause', 'ended', 'playbackBlocked', 'offline', 'online', 'error']) player.addEventListener(ev, () => {
    if (ev === 'offline' || ev === 'online') el.classList.toggle('offline', ev === 'offline');
    mark(t);
  });
  io.observe(el);
  ro.observe(el.querySelector('.player'));
  order.push(s.twitch);
  layout();
}

function remove(login) {
  clearTimeout(tiles.get(login).timer);
  ro.unobserve(tiles.get(login).el.querySelector('.player'));
  io.unobserve(tiles.get(login).el);
  tiles.get(login).el.remove();
  tiles.delete(login);
  order.splice(order.indexOf(login), 1);
  if (focused === login) focused = null;
  layout();
}

function move(from, to) {
  if (!from || from === to) return;
  order.splice(order.indexOf(from), 1);
  order.splice(order.indexOf(to), 0, from);
  layout();
}

function setMuted(t, m) { t.muted = m; t.player.setMuted(m); paint(t); }
function paint(t) { t.el.classList.toggle('loud', !t.muted); t.el.classList.toggle('pin', t.pinned); }
// the spotlight brings the sound along; leaving it gives it back unless the button pinned it
function focus(login) {
  const prev = focused;
  focused = focused === login ? null : login;
  if (prev && prev !== focused && !tiles.get(prev).pinned) setMuted(tiles.get(prev), true);
  if (focused) setMuted(tiles.get(focused), false);
  layout();
}

function layout() {
  const n = tiles.size;
  grid.classList.toggle('focused', !!focused);
  for (const [login, t] of tiles) {
    const f = t.el.querySelector('iframe'), w = f?.offsetWidth;
    t.el.classList.toggle('big', login === focused);
    t.el.style.order = order.indexOf(login);
    // a player that grows switches quality, which restarts its media: Firefox refuses that restart audible unless
    // this very iframe was clicked once, and the tile hangs until it is. Restart muted, allowed anywhere; the
    // watchdog gives the sound back once it plays, which unmuting a playing media does without a restart
    if (!t.muted && t.ready && f && f.offsetWidth > w) t.player.setMuted(true);
  }
  if (focused) {
    const wide = innerWidth / innerHeight > 2;   // ultrawide → two side columns
    grid.style.setProperty('--cols', wide ? 2 : 1);
    grid.style.setProperty('--side', wide ? '30vw' : '22vw');
    grid.style.gridTemplateColumns = '';
    grid.style.gridTemplateRows = `repeat(${Math.max(Math.ceil((n - 1) / (wide ? 2 : 1)), 1)}, var(--tile-h))`;
  } else {
    const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols) || 1;
    grid.style.gridTemplateColumns = `repeat(${cols || 1}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, ${100 / rows}vh)`;
  }
  save();
}

$('#toggle').onclick = () => { hidePreview(); document.body.classList.toggle('collapsed'); save(); };
$('#playall').onclick = () => { allPaused = !allPaused; $('#playall').textContent = allPaused ? '▶\uFE0E' : '⏸\uFE0E'; tiles.forEach(t => { sync(t); mark(t); }); save(); };
onpagehide = save;
function tick() {
  // after a reload the page itself has no focus, so a click in a player moves it there without the blur below: catch up
  if (!activated && document.activeElement?.tagName === 'IFRAME') activate();
  tiles.forEach(t => { watchdog(t); paint(t); }); const loud = [...tiles.values()].filter(t => !t.muted);
  const stuck = loud.some(t => t.since && Date.now() - t.since > 3000);   // a loud tile that should play and has not for 3s: the browser is waiting for a click in it
  $('#hint').hidden = !((!activated && loud.length) || stuck);
  document.body.classList.toggle('needclick', !$('#hint').hidden); }
setInterval(tick, 1000);
// audible playback is refused until the user clicks the page, and an unmute attempted before that can leave the media
// paused with no way back: players stay muted until the first click, which then pushes every intent and re-plays
// Firefox grants audible playback only to the iframe that received the click, never from a click on the page around it:
// an unmute pushed after a page click pauses the player and every play() is refused until its own video is clicked.
// So every click that lands in a player pushes the intents again, and the hint stays while a loud tile is not playing.
let activated = false;
function push() { tiles.forEach(t => { if (!t.ready) return; t.player.setMuted(t.muted); if (!t.muted && !t.paused) { t.player.play(); t.nudgedAt = Date.now(); } }); }
function activate() { activated = true; push(); }
addEventListener('pointerdown', () => activated || activate(), { capture: true });
addEventListener('keydown', () => activated || activate(), { capture: true });
// a click on the video lands inside the iframe and never reaches this page: the only trace is the focus leaving for it
// (Firefox fires blur before it moves activeElement to the iframe, hence the tick)
addEventListener('blur', () => setTimeout(() => { if (document.activeElement?.tagName === 'IFRAME') activate(); }));
document.ondragend = () => { dragging = null; document.body.classList.remove('dragging'); document.querySelectorAll('.tile.over').forEach(t => t.classList.remove('over')); };
onresize = layout;
document.onfullscreenchange = () => tiles.forEach(sync);
document.onkeydown = e => { if (e.key === 'Escape') { if (previewRow) hidePreview(); else if (focused) focus(focused); } };
// Check the static app files so a script-only deploy also offers a reload.
const dev = location.hostname === 'localhost';
let versionBody;
setInterval(async () => {
  try {
    const parts = await Promise.all(['/index.html', '/app.js', '/library.js', '/config.json'].map(async path => {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      return response.text();
    }));
    const current = parts.join('\n');
    if (versionBody && current !== versionBody) dev ? location.reload() : $('#update').hidden = false;
    versionBody = current;
  } catch { /* Keep the players running when a version check fails. */ }
}, dev ? 3000 : 60000);

let library, follows = [], results = [], source = 'favorites', searchVersion = 0, accountVersion = 0;
let searching = false, refreshInFlight = false, lastFollows = 0, searchTimer;
const storedFavorites = readStored('tg.favorites', []);
let favorites = Array.isArray(storedFavorites) ? storedFavorites.filter(s => s && validLogin(s.twitch)).map(channel) : [];
favorites = [...new Map(favorites.map(s => [s.twitch, s])).values()];
function notice(message = '') { $('#notice').textContent = message; }
function saveFavorites() {
  if (!writeStored('tg.favorites', favorites.map(({ twitch, display, profileUrl }) => ({ twitch, display, profileUrl })))) notice('Le navigateur ne peut pas enregistrer les favoris. Ils seront perdus à la fermeture de la page.');
}
function updateAccount() {
  const connected = !!library?.user;
  $('#connect').hidden = connected || !library?.clientId;
  $('#account').hidden = !connected;
  $('#account span').textContent = library?.user?.login || '';
  $('#follows-tab').hidden = !connected;
  $('#favorites-tab').setAttribute('aria-pressed', source === 'favorites');
  $('#follows-tab').setAttribute('aria-pressed', source === 'follows');
}
function rebuild() {
  const merged = new Map([...favorites, ...follows, ...results].map(s => [s.twitch, s]));
  streamers = [...merged.values()];
  renderList();
  for (const s of streamers) tiles.get(s.twitch)?.bar.querySelector('span').replaceChildren(s.online === false ? 'Hors ligne' : s.viewersAmount.formatted);
}
function toggleFavorite(s) {
  if (favorites.some(f => f.twitch === s.twitch)) favorites = favorites.filter(f => f.twitch !== s.twitch);
  else favorites.push(s);
  saveFavorites(); rebuild();
  if (library?.user) refresh();
}
function loginFromQuery(query) {
  const login = query.trim().toLowerCase().replace(/^https?:\/\/(?:www\.)?twitch\.tv\//, '').replace(/^@/, '').replace(/\/$/, '');
  return validLogin(login) ? login : '';
}
function renderList() {
  const q = $('#q').value.trim().toLowerCase();
  const base = source === 'follows' ? follows : favorites;
  const matches = base.filter(s => !q || s.display.toLowerCase().includes(q) || s.twitch.includes(q));
  const rows = [...new Map([...matches, ...(q ? results : [])].map(s => [s.twitch, s])).values()]
    .sort((a, b) => Number(b.online) - Number(a.online) || viewers(b) - viewers(a) || a.display.localeCompare(b.display));
  const active = document.activeElement;
  const keyboardLogin = list.contains(active) ? active.closest('li')?.dataset.login : null;
  const keyboardFavorite = active?.classList.contains('favorite');
  list.replaceChildren(...rows.map(s => {
    const li = document.createElement('li'); li.dataset.login = s.twitch;
    li.className = (s.online === true ? 'live' : s.online === false ? 'off' : '') + (tiles.has(s.twitch) ? ' on' : '');
    li.innerHTML = '<button class="channel"><img alt="" loading="lazy"><span class="n"><span class="name"></span><div class="g"></div></span><span class="v"></span></button><button class="favorite"></button>';
    li.querySelector('img').src = s.profileUrl;
    li.querySelector('.name').textContent = s.display;
    li.querySelector('.g').textContent = s.game || (s.online === false ? 'Hors ligne' : s.online ? 'En direct' : 'Chaîne Twitch');
    li.querySelector('.v').textContent = s.online ? s.viewersAmount.formatted : '';
    const play = li.querySelector('.channel');
    play.setAttribute('aria-label', (tiles.has(s.twitch) ? 'Afficher ou retirer ' : 'Regarder ') + s.display);
    play.setAttribute('aria-pressed', tiles.has(s.twitch));
    play.onclick = () => { hidePreview(); toggle(s); };
    const star = li.querySelector('.favorite'), saved = favorites.some(f => f.twitch === s.twitch);
    star.textContent = saved ? '★' : '☆';
    star.title = (saved ? 'Retirer des favoris : ' : 'Ajouter aux favoris : ') + s.display;
    star.setAttribute('aria-label', star.title); star.setAttribute('aria-pressed', saved);
    star.onclick = () => toggleFavorite(s);
    li.onpointerenter = e => { if (e.pointerType !== 'touch') queuePreview(li); };
    li.onpointerleave = leavePreview;
    play.onfocus = () => queuePreview(li); play.onblur = leavePreview;
    return li;
  }));
  if (previewRow) {
    const row = [...list.children].find(li => li.dataset.login === previewRow.dataset.login);
    const s = streamers.find(s => s.twitch === previewRow.dataset.login);
    if (!row || !s || (!preview.hidden && s.online !== previewOnline)) hidePreview();
    else { previewRow = row; if (!preview.hidden) { row.setAttribute('aria-describedby', 'preview'); previewInfo(s); positionPreview(); } }
  }
  if (keyboardLogin) [...list.children].find(li => li.dataset.login === keyboardLogin)?.querySelector(keyboardFavorite ? '.favorite' : '.channel').focus({ preventScroll: true });
  $('#list-empty').hidden = rows.length > 0;
  $('#list-empty').textContent = searching ? 'Recherche en cours…' : q ? 'Aucun résultat dans cette liste.' : source === 'follows' ? 'Tu ne suis encore aucune chaîne.' : 'Ajoute un premier favori avec son pseudo ou son lien Twitch.';
  $('#search-actions').hidden = !q;
  const login = loginFromQuery(q);
  $('#add-login').hidden = !login || favorites.some(s => s.twitch === login);
  $('#add-login').textContent = 'Ajouter ' + login + ' aux favoris';
  $('#twitch-search').href = 'https://www.twitch.tv/search?term=' + encodeURIComponent(q);
  $('#twitch-search').hidden = !!library?.user;
  $('#top').textContent = base.some(s => s.online) ? 'Lancer jusqu’à 4 favoris en direct'.replace('favoris', source === 'follows' ? 'follows' : 'favoris') : 'Ajouter un streamer';
}
async function search() {
  const version = ++searchVersion, query = $('#q').value.trim();
  results = []; searching = !!query && !!library?.user; rebuild();
  if (!searching) return;
  try {
    const found = await library.search(query);
    if (version !== searchVersion) return;
    results = found; notice();
  } catch (error) { if (version === searchVersion) handleError(error); }
  finally { if (version === searchVersion) { searching = false; rebuild(); } }
}
function handleError(error) {
  if (error.status === 401) disconnect(false);
  notice(error.message);
}
async function refresh() {
  if (!library?.user || refreshInFlight) return;
  refreshInFlight = true;
  const version = accountVersion;
  try {
    let nextFollows = follows;
    const reloadFollows = Date.now() - lastFollows > 60000;
    if (reloadFollows) nextFollows = await library.follows();
    const logins = [...new Set([...favorites, ...nextFollows, ...order.map(twitch => ({ twitch }))].map(s => s.twitch))];
    const live = await library.live(logins);
    if (version !== accountVersion) return;
    const update = s => channel({ ...s, online: live.has(s.twitch), game: live.get(s.twitch)?.game_name || '', viewer_count: live.get(s.twitch)?.viewer_count ?? 0 });
    follows = nextFollows.map(update); favorites = favorites.map(update);
    if (reloadFollows) lastFollows = Date.now();
    rebuild(); notice();
  } catch (error) { if (version === accountVersion) handleError(error); }
  finally { refreshInFlight = false; }
}
function disconnect(clearNotice = true) {
  accountVersion++; searchVersion++; searching = false;
  library.disconnect(); follows = []; results = []; source = 'favorites'; lastFollows = 0;
  favorites = favorites.map(s => channel({ twitch: s.twitch, display: s.display, profileUrl: s.profileUrl }));
  updateAccount(); rebuild(); if (clearNotice) notice();
}
$('#q').oninput = () => {
  clearTimeout(searchTimer); searchVersion++; results = []; searching = false; rebuild();
  searchTimer = setTimeout(search, 300);
};
$('#add-login').onclick = async () => {
  const login = loginFromQuery($('#q').value);
  if (!login || favorites.some(s => s.twitch === login)) return;
  $('#add-login').disabled = true;
  try {
    const s = library?.user ? await library.lookup(login) : channel({ twitch: login });
    if (!s) { notice('Ce pseudo ne correspond à aucune chaîne Twitch.'); return; }
    if (!favorites.some(f => f.twitch === login)) { favorites.push(s); saveFavorites(); }
    $('#q').value = ''; source = 'favorites'; notice(); updateAccount(); await search();
    if (library?.user) refresh();
  } catch (error) { handleError(error); }
  finally { $('#add-login').disabled = false; }
};
$('#q').onkeydown = e => { if (e.key === 'Enter' && !$('#add-login').hidden) $('#add-login').click(); };
for (const name of ['favorites', 'follows']) $('#' + name + '-tab').onclick = () => { source = name; updateAccount(); rebuild(); };
$('#top').onclick = () => {
  const live = (source === 'follows' ? follows : favorites).filter(s => s.online).slice(0, 4);
  if (live.length) { live.forEach(s => add(s)); renderList(); }
  else { document.body.classList.remove('collapsed'); $('#q').focus(); }
};
$('#connect').onclick = () => library.connect().catch(handleError);
$('#disconnect').onclick = () => disconnect();
async function init() {
  rebuild(); restored = true; restore();
  let config;
  try {
    const response = await fetch('/config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    config = await response.json();
  } catch { notice('La connexion Twitch est indisponible. Les favoris restent accessibles.'); }
  library = new TwitchLibrary(config?.twitchClientId || '');
  try { if (library.clientId) await library.resume(); }
  catch (error) { library.disconnect(); notice(error.message); }
  if (library.user) source = 'follows';
  updateAccount(); rebuild(); await refresh();
}
init().catch(handleError);
setInterval(() => { if (!document.hidden) refresh(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(async () => {
  if (!library?.user) return;
  try { await library.validate(); } catch (error) { disconnect(false); notice(error.message); }
}, 3600000);
