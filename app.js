const $ = s => document.querySelector(s);
const list = $('#list'), grid = $('#grid');
const tiles = new Map();   // twitch login -> { el, player, bar }
let streamers = [], focused = null, locked = false, mutedAll = null, expanded = null, order = [], dragging = null, allPaused = false, restored = false, layoutMode = null;
const collaborations = new Map();
const collaborationIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 4a3 3 0 0 1 0 6M19 14a5 5 0 0 1 3 4v3"/></svg>';

// everything needed to come back to the same screen: tile order, zoom, global pause, sidebar, per-tile mute
// Small tiles use our controls; the spotlight also reads changes made in the native Twitch player.
let gridStore = null;
function paintPlayAll() { $('#playall').setAttribute('aria-pressed', String(allPaused)); }
function currentLayout() {
  return { order: [...order], focused, locked, mutedAll, allPaused,
    channels: order.map(login => { const {twitch,display,profileUrl}=tiles.get(login).channel; return {twitch,display,profileUrl}; }),
    collapsed: document.body.classList.contains('collapsed'),
    ...Object.fromEntries(['muted','pinned','volume','paused','chatOpen','chatPosition'].map(key => [key,Object.fromEntries([...tiles].map(([login,t]) => [login,t[key]]))])) };
}
function save() {
  if (!restored) return;
  const snapshot = currentLayout();
  writeStored('tg.layout.' + layoutMode, snapshot);
  if (gridStore && !gridStore.save(snapshot)) notice(tr('Impossible d’enregistrer dans ce navigateur.'));
  renderGridLauncher();
}
function saveCurrentLayout() {
  tiles.forEach(readNativeControls);
  save();
}
function restore() {
  if (!layoutMode || restored || !window.Twitch?.Player) return;
  const st = gridStore?.active.layout || readStored('tg.layout.' + layoutMode, {});
  const savedChannels = Array.isArray(st.channels) ? st.channels : [];
  allPaused = !!st.allPaused;
  // chat settings live per stream; older layouts stored one value for the whole grid
  const perTile = (value, login) => value && typeof value === 'object' ? value[login] : value;
  const chatPositionOf = value => value === 'below' ? 'bottom' : ['auto', 'top', 'bottom', 'left', 'right'].includes(value) ? value : 'auto';
  mutedAll = Array.isArray(st.mutedAll) ? st.mutedAll.filter(validLogin) : null;   // a global mute outranks whatever the tiles saved
  batching = true;
  for (const login of (Array.isArray(st.order) ? [...new Set(st.order)].filter(validLogin) : [])) { const s = streamers.find(x => x.twitch === login) || channel(savedChannels.find(x => x?.twitch === login) || { twitch: login }); if (s) add(s, !!mutedAll || (st.muted?.[login] ?? true), st.volume?.[login] ?? 0.5, !!st.paused?.[login], !!st.pinned?.[login], perTile(st.chatOpen, login) === true, chatPositionOf(perTile(st.chatPosition, login))); }
  batching = false;
  focused = tiles.has(st.focused) ? st.focused : null;
  locked = st.locked === true;
  paintMuteAll();
  paintPlayAll();
  document.body.classList.toggle('collapsed', st.collapsed ?? innerWidth <= 700);
  layout();
  tick();   // right away, not at the first second: a click that lands before it hits the page instead of the video
  restored = true;
  syncChat();
  refreshCollaborations();
  save();
}
function switchLayout(mode) {
  if (layoutMode === mode) { restore(); return; }
  saveCurrentLayout();
  restored = false;
  clearTiles();
  layoutMode = mode;
  const key = 'tg.layout.' + mode, legacy = readStored('tg.layout', null);
  if (legacy && writeStored(key, readStored(key, null) ?? legacy)) {
    try { localStorage.removeItem('tg.layout'); } catch { /* The in-memory layout remains usable. */ }
  }
  gridStore = new GridStore(mode);
  renderGridLauncher();
  allPaused = false; locked = false; mutedAll = null; paintMuteAll();
  paintPlayAll();
  layout();
  restore();
  tick();
}

function loadPlayer() {
  const script = document.createElement('script');
  script.src = 'https://player.twitch.tv/js/embed/v1.js';
  script.onload = restore;
  script.onerror = () => { if (!$('#notice').textContent) notice(tr('Le lecteur Twitch est indisponible. La connexion et la recherche restent accessibles.')); };
  document.head.append(script);
}

// a tile plays only while it is in the viewport and the global toggle is not paused
function fit(p) {
  const f = p.firstElementChild;
  if (!f) return;
  if (document.fullscreenElement === f) { f.style.transform = 'none'; return; }
  const s = Math.min(p.clientWidth / f.offsetWidth, p.clientHeight / f.offsetHeight);   // offsetWidth ignores the transform
  f.style.transform = `translate(${(p.clientWidth - f.offsetWidth * s) / 2}px, ${(p.clientHeight - f.offsetHeight * s) / 2}px) scale(${s})`;
}
const ro = new ResizeObserver(es => es.forEach(e => fit(e.target)));
const chatResize = new ResizeObserver(es => es.forEach(e => {
  const t = tiles.get(e.target.closest('.tile').dataset.login);
  if (t && !t.chat.hidden) layoutChat(t);
}));

function layoutChat(t) {
  const width = t.body.clientWidth, height = t.body.clientHeight, ratio = 16 / 9;
  if (!width || !height) return;
  // Widen the side chat into the video's unused horizontal space, up to 480px.
  const chatWidth = Math.min(480, Math.max(320, width - height * ratio), Math.max(0, width - 160));
  const minChatHeight = 420;
  const chatHeight = Math.min(minChatHeight, Math.max(0, height - 90));
  // Compare the rendered video size after reserving space for each possible chat position.
  const belowVideo = Math.min(width, (height - chatHeight) * ratio);
  const rightVideo = Math.min(width - chatWidth, height * ratio);
  const position = t.chatPosition === 'auto'
    ? (height - width / ratio >= minChatHeight || belowVideo + 24 >= rightVideo ? 'bottom' : 'right')
    : t.chatPosition;
  t.body.dataset.chatPosition = position;
  t.body.style.setProperty('--chat-width', chatWidth + 'px');
  t.body.style.setProperty('--video-height', Math.min(width / ratio, height - chatHeight) + 'px');
  fit(t.el.querySelector('.player'));
}
function syncChat() {
  for (const [login, t] of tiles) {
    const allowed = t.controls && t.chatFits, visible = restored && t.chatOpen && allowed;
    t.chat.hidden = !visible;
    t.chatOptions.hidden = !allowed;
    if (!allowed) t.chatOptions.open = false;
    t.chatOptions.querySelector('select').value = t.chatPosition;
    const button = t.bar.querySelector('.chat-toggle');
    button.hidden = !allowed;
    button.setAttribute('aria-expanded', String(visible));
    button.title = visible ? tr('Masquer le chat') : tr('Afficher le chat');
    button.setAttribute('aria-label', button.title);
    if (!visible) {
      t.chat.querySelector('iframe')?.remove();
      delete t.body.dataset.chatPosition;
      continue;
    }
    const chatSrc = `https://www.twitch.tv/embed/${login}/chat?parent=${encodeURIComponent(location.hostname)}` + (document.documentElement.dataset.theme === 'dark' ? '&darkpopout=1' : '');
    if (!t.chat.querySelector('iframe')) {
      const frame = document.createElement('iframe');
      frame.src = chatSrc;
      frame.title = tr('Chat de {name}', {name:t.channel.display});
      t.chat.append(frame);
    }
    if (t.chat.querySelector('iframe').src !== chatSrc) t.chat.querySelector('iframe').src = chatSrc;
    layoutChat(t);
  }
}
function closeTileMenus(returnFocus = false, except = null) {
  let closed = false;
  for (const menu of document.querySelectorAll('.chat-options[open], .collaboration[open], #grid-switcher[open]')) {
    if (menu === except) continue;
    menu.open = false;
    if (returnFocus) menu.querySelector('summary').focus();
    closed = true;
  }
  return closed;
}
addEventListener('pointerdown', e => closeTileMenus(false, e.target.closest('.chat-options, .collaboration, #grid-switcher')));

function positionCollaborationMenu(t) {
  const anchor = t.collaboration.querySelector('summary').getBoundingClientRect();
  const menu = t.collaboration.querySelector('.collaboration-menu');
  const width = Math.min(320, innerWidth - 24);
  const below = innerHeight - anchor.bottom - 18;
  const above = below < 180 && anchor.top > below;
  const height = Math.max(0, Math.min(400, above ? anchor.top - 18 : below));
  menu.style.width = width + 'px';
  menu.style.left = Math.max(12, Math.min(anchor.right - width, innerWidth - width - 12)) + 'px';
  menu.style.maxHeight = height + 'px';
  menu.style.top = above ? 'auto' : anchor.bottom + 6 + 'px';
  menu.style.bottom = above ? innerHeight - anchor.top + 6 + 'px' : 'auto';
}
function updateCollaborationButtons(t) {
  if (!t.collaboration) return;
  for (const row of t.collaboration.querySelectorAll('.collaboration-row')) {
    const participant = t.participants.find(s => s.twitch === row.dataset.participant);
    const present = tiles.has(participant.twitch);
    row.querySelector('small').textContent = present ? tr('Déjà dans la grille') : participant.online ? participant.game || tr('En direct') : tr('Hors ligne');
    const button = row.querySelector('button');
    button.disabled = present || !participant.online || locked;
    button.textContent = present ? tr('Ajouté') : tr('Ajouter');
  }
  t.collaboration.querySelector('.create-collaboration-grid').disabled = !t.participants.some(s => s.online);
  t.collaboration.querySelector('.add-collaboration').disabled = locked || !t.participants.some(s => s.online && !tiles.has(s.twitch));
}
function addCollaborators(t, participants) {
  const missing = participants.filter(s => s.online && !tiles.has(s.twitch));
  if (!missing.length || locked) return;
  // Keep the existing single player in the spotlight when its partners are added.
  if (tiles.size === 1) focused = order[0];
  for (const participant of missing) add(participant);
  renderList(); save();
}
function renderCollaboration(t, participants) {
  t.participants = [...new Map(participants.filter(s => validLogin(s.twitch)).map(s => [s.twitch, s])).values()];
  const available = t.participants.some(s => s.twitch !== t.el.dataset.login);
  t.collaboration.hidden = !available;
  if (!available) t.collaboration.open = false;
  t.collaboration.querySelector('.collaboration-count').textContent = t.participants.length;
  t.collaboration.querySelector('summary').setAttribute('aria-label', tr('Collaboration : {count} participants', {count:t.participants.length}));
  t.collaboration.querySelector('.collaboration-heading').textContent = tr('Collaboration : {count} participants', {count:t.participants.length});
  const rows = t.collaboration.querySelector('.collaboration-list');
  const focusedLogin = rows.contains(document.activeElement) ? document.activeElement.closest('.collaboration-row')?.dataset.participant : null;
  rows.replaceChildren(...t.participants.map(s => {
    const row = document.createElement('div');
    row.className = 'collaboration-row'; row.dataset.participant = s.twitch;
    row.innerHTML = '<img alt=""><div><span class="collaboration-name"></span><small></small></div><button type="button"></button>';
    row.querySelector('img').src = s.profileUrl;
    row.querySelector('.collaboration-name').textContent = s.display;
    row.querySelector('button').setAttribute('aria-label', tr('Ajouter {name}', {name:s.display}));
    row.querySelector('button').onclick = () => addCollaborators(t, [s]);
    return row;
  }));
  updateCollaborationButtons(t);
  if (focusedLogin) rows.querySelector(`[data-participant="${focusedLogin}"] button:not(:disabled)`)?.focus({ preventScroll: true });
}
function setupCollaboration(t) {
  const menu = document.createElement('details');
  menu.className = 'collaboration'; menu.hidden = true;
  menu.innerHTML = '<summary title="Participants à la collaboration" data-i18n-title="Participants à la collaboration">' + collaborationIcon + '<span class="collaboration-count"></span></summary><div class="collaboration-menu"><span class="collaboration-heading"></span><div class="collaboration-list"></div><button type="button" class="add-collaboration" data-i18n="Tout ajouter">Tout ajouter</button><button type="button" class="create-collaboration-grid" data-i18n="Créer une grille pour cette collaboration">Créer une grille pour cette collaboration</button></div>';
  t.collaboration = menu; t.participants = [];
  translateTree(menu);
  t.bar.querySelector('.viewers').before(menu);
  menu.onclick = e => e.stopPropagation();
  menu.ondragstart = e => { e.preventDefault(); e.stopPropagation(); };
  menu.ontoggle = () => { if (menu.open) { closeTileMenus(false, menu); positionCollaborationMenu(t); } };
  menu.querySelector('.create-collaboration-grid').onclick = () => openGridForm('collaboration', null, t.participants, t.channel);
  menu.querySelector('.add-collaboration').onclick = () => addCollaborators(t, t.participants);
}
let collaborationRefreshInFlight = false;
async function refreshCollaborations() {
  if (!restored || !library || collaborationRefreshInFlight || document.hidden) return;
  const candidates = new Map([...streamers, ...[...tiles.values()].map(t => t.channel)].map(s => [s.twitch, s]));
  const queue = [...candidates.values()].filter(s => (s.online || (tiles.has(s.twitch) && s.online !== false)) && (!collaborations.has(s.twitch) || Date.now() - collaborations.get(s.twitch).checkedAt >= 60000)).map(s => s.twitch);
  if (!queue.length) return;
  collaborationRefreshInFlight = true;
  const version = accountVersion;
  try {
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length && version === accountVersion) {
        const login = queue.shift();
        let participants;
        try { participants = await library.collaboration(login); }
        catch { participants = []; }
        if (version !== accountVersion) return;
        participants = [...new Map(participants.filter(s => validLogin(s.twitch)).map(s => [s.twitch, s])).values()];
        collaborations.set(login, { checkedAt: Date.now(), participants });
        const t = tiles.get(login);
        if (t) renderCollaboration(t, t.channel.online === false ? [] : participants);
        renderList();
      }
    }));
  } finally {
    collaborationRefreshInFlight = false;
    for (const [login, result] of collaborations) if (!candidates.has(login) && Date.now() - result.checkedAt > 300000) collaborations.delete(login);
    // Channels added during the requests also need their first check.
    refreshCollaborations();
  }
}
// the player tracks its own viewability and refuses to start under half visible, whatever play() says: below that
// a tile shows "scroll" instead of a spinner that would never end. ponytail: 0.5 mirrors the player's bar, raise if a
// half-visible tile still spins
const io = new IntersectionObserver(es => es.forEach(e => { const t = tiles.get(e.target.dataset.login); if (t) { t.visible = e.intersectionRatio >= 0.5; sync(t); mark(t); } }), { root: grid, threshold: 0.5 });
// a relayout flickers visibility for a frame or two: let it settle before touching the player
// Expanded and front tiles sit fixed over the grid's box, outside its containing block, so the observer never sees
// them: they are on screen by construction. A tile with its sound on keeps playing wherever it is, the sound is the point
const seen = t => t.visible || t.el.classList.contains('big') || expanded === t.el.dataset.login;
const onScreen = t => seen(t) || !t.muted;
// Firefox refuses an audible (re)start in an iframe that was never clicked, and the player then sits paused for good:
// start muted, always allowed, and the watchdog gives the sound back once it plays (no restart in that)
function start(t) { if (!t.ready) return; if (!t.muted && t.player.getPlayerState().playback !== 'Playing') applyMuted(t, true); t.player.play(); t.nudgedAt = Date.now(); }
function sync(t) { clearTimeout(t.timer); t.timer = setTimeout(() => { if (!t.ready || !t.el.isConnected) return; if (allPaused || t.paused || !onScreen(t)) t.player.pause(); else start(t); }, 400); }
// the player also pauses on its own during some reflows: whatever should be playing gets nudged back every second
function watchdog(t) {
  if (!t.ready) return;
  if (t.controls) { readNativeControls(t); mark(t); return; }
  if (t.playbackBlocked) { mark(t); return; }
  // isPaused() is false in the Ready/Idle states the player drops into after a resize, so go by the playback state.
  // A live stream takes seconds to (re)start and a play() during that restarts it: nudge at most every 5s
  const st = t.player.getPlayerState().playback;
  if (!allPaused && !t.paused && onScreen(t) && !t.el.classList.contains('offline') && st !== 'Playing' && st !== 'Buffering' && Date.now() - (t.nudgedAt || 0) > 5000) {
    // a play() the player swallowed (seen after a window resize) leaves it stuck until a click inside it: the second
    // nudge pauses first, which is what that click does, then plays again once the teardown had its second
    if (t.nudged) { const current = t.player; t.player.pause(); setTimeout(() => { if (t.player === current && t.el.isConnected && !allPaused && !t.paused && onScreen(t)) start(t); }, 1000); } else start(t);
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
  t.el.classList.toggle('partial', !allPaused && !t.paused && !seen(t) && !playing);   // on screen but not enough for the player to start
  updateAudioOverlay();
}

let audioOverlayFocus = null;
function updateAudioOverlay() {
  const overlay = $('#audio-overlay');
  const needed = !activated && !allPaused && !mutedAll && [...tiles.values()].some(t =>   // a global mute wants silence, not a prompt
    !t.paused && !t.muted && t.volume > 0 && t.channel.online !== false &&
    !t.el.classList.contains('offline') && !t.playbackError);
  if (needed === !overlay.hidden) return;
  overlay.hidden = !needed;
  if (needed) {
    hidePreview();
    audioOverlayFocus = document.activeElement;
    overlay.focus({ preventScroll: true });
  } else if (overlay.contains(document.activeElement)) {
    if (audioOverlayFocus?.isConnected) audioOverlayFocus.focus({ preventScroll: true });
    else document.activeElement.blur();
  }
}

function viewers(s) { return s.viewersAmount.number; }

// One temporary, muted player; removing its iframe stops playback and network activity.
const preview = $('#preview'), previewVideo = preview.querySelector('.player');
let previewRow = null, previewOnline = null, previewPlayer = null, previewNudgedAt = 0, previewTimer, previewCloseTimer, previewLoadTimer;
// the embed does not always emit its playing event, and like the tiles it can sit in Ready until nudged with a play():
// poll the playback state every tick, nudge at most every 5s, and fade the overlay out once it plays
function markPreview() {
  if (preview.hidden || !previewPlayer) return;
  const st = previewPlayer.getPlayerState().playback;
  if (st === 'Playing') { clearTimeout(previewLoadTimer); preview.classList.add('playing'); return; }
  if (st !== 'Buffering' && Date.now() - previewNudgedAt > 5000) { previewPlayer.play(); previewNudgedAt = Date.now(); }
}
function hidePreview() {
  clearTimeout(previewTimer);
  clearTimeout(previewCloseTimer);
  clearTimeout(previewLoadTimer);
  previewRow?.removeAttribute('aria-describedby');
  previewRow = null;
  preview.hidden = true;
  preview.classList.remove('playing');
  previewPlayer = null;
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
  preview.querySelector('.name').textContent = s.display;
  const game = s.online === false ? '' : s.game, title = s.online === false ? '' : s.title;
  const viewers = s.online && s.viewersAmount.formatted ? s.viewersAmount.formatted + ' spectateurs' : '';
  for (const [selector, value] of [['.category', game], ['.stream-title', title], ['.viewers', viewers]]) {
    const field = preview.querySelector(selector);
    field.textContent = value;
    field.hidden = !value;
    field.title = value;
  }
}
function showPreview(row) {
  const s = streamers.find(s => s.twitch === row.dataset.login);
  if (!s || s.online === false || !row.isConnected || document.hidden) { hidePreview(); return; }
  previewRow = row;
  previewOnline = s.online;
  previewInfo(s);
  row.setAttribute('aria-describedby', 'preview');
  const status = preview.querySelector('.status'), message = status.querySelector('span');
  status.querySelector('img').src = s.profileUrl;
  message.textContent = tr('Chargement de l’aperçu…');
  status.hidden = false;
  preview.classList.remove('playing');
  preview.hidden = false;
  positionPreview();
  if (!window.Twitch?.Player) { message.textContent = tr('Aperçu indisponible'); return; }
  const player = new Twitch.Player(previewVideo, { channel: s.twitch, parent: [location.hostname], width: 640, height: 360, autoplay: true, muted: true, controls: false });
  previewPlayer = player; previewNudgedAt = Date.now();
  const frame = previewVideo.querySelector('iframe');
  frame.tabIndex = -1;
  frame.title = tr('Aperçu de {name}', {name:s.display});
  fit(previewVideo);
  const current = () => previewVideo.firstElementChild === frame;
  player.addEventListener(Twitch.Player.READY, () => { if (current()) { player.setMuted(true); player.setVolume(0); } });
  player.addEventListener(Twitch.Player.PLAYING, () => { if (current()) markPreview(); });   // the overlay fades out in CSS
  for (const event of ['offline', 'playbackBlocked', 'error']) player.addEventListener(event, () => {
    if (!current()) return;
    if (event === 'offline') { hidePreview(); return; }
    clearTimeout(previewLoadTimer);
    preview.classList.remove('playing');
    status.hidden = false;
    message.textContent = tr('Aperçu indisponible');
  });
  previewLoadTimer = setTimeout(() => { if (current()) message.textContent = tr('L’aperçu tarde à démarrer'); }, 12000);
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
  // the sidebar fills the grid; a spotlight hands its place to the stream clicked
  if (focused && focused !== s.twitch) { if (tiles.has(s.twitch) || add(s)) focus(s.twitch); }
  else tiles.has(s.twitch) ? remove(s.twitch) : add(s);
  if (innerWidth <= 700) { document.body.classList.add('collapsed'); save(); }
  renderList();
}

// A stream that ends leaves its tile a minute to come back; then the tile goes, unless it is the spotlight or the grid is locked.
// Only a tile seen live can go: a channel added while offline waits for its stream.
function trackOnline(t, online) {
  if (online) { t.wasOnline = true; clearTimeout(t.offlineTimer); t.offlineTimer = null; return; }
  if (!t.wasOnline || t.offlineTimer) return;
  t.offlineTimer = setTimeout(() => {
    t.offlineTimer = null;
    const login = t.el.dataset.login;
    if (!tiles.has(login) || locked || focused === login) return;
    if (!t.el.classList.contains('offline') && t.ready && t.player.getPlayerState().playback === 'Playing') return;   // a stale status against a player that plays
    remove(login); save();
    notice(tr('{name} est hors ligne, la tuile a été retirée.', { name: t.channel.display }));
  }, 60000);
}
function updateTileInfo(t, s) {
  t.channel = s;
  if (typeof s.online === 'boolean') trackOnline(t, s.online);
  renderCollaboration(t, s.online === false ? [] : collaborations.get(s.twitch)?.participants || []);
  t.bar.querySelector('.stream-avatar').src = s.profileUrl;
  t.bar.querySelector('.viewers').textContent = s.online === false ? tr('Hors ligne') : s.viewersAmount.formatted;
  const info = t.bar.querySelector('.stream-info');
  const game = s.online === false ? '' : s.game, title = s.online === false ? '' : s.title;
  info.hidden = !game && !title;
  info.title = [game, title].filter(Boolean).join(' · ');
  for (const [selector, value] of [['.stream-category', game], ['.stream-title', title]]) {
    const field = info.querySelector(selector);
    field.textContent = value;
    field.hidden = !value;
  }
}

function add(s, muted = true, volume = 0.5, paused = false, pinned = false, chatOpen = false, chatPosition = 'auto') {
  if (tiles.has(s.twitch)) return true;
  if (locked && restored) { notice(tr('Grille verrouillée : déverrouille-la pour ajouter un stream.')); return false; }
  if (!window.Twitch?.Player) { notice(tr('Le lecteur Twitch est indisponible. Recharge la page pour réessayer.')); return false; }
  const el = document.createElement('div');
  el.className = 'tile loading';
  el.dataset.login = s.twitch;
  el.innerHTML = `<div class="bar"><img class="stream-avatar" alt="" draggable="false"><b>${escapeHTML(s.display)}</b><div class="stream-info" hidden><span class="stream-category"></span><span class="stream-title"></span></div><span class="viewers"></span><button title="Afficher le chat" data-i18n-title="Afficher le chat" aria-label="Afficher le chat" data-i18n-aria-label="Afficher le chat" aria-expanded="false" class="chat-toggle"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg></button><details class="chat-options" hidden><summary title="Options du chat" data-i18n-title="Options du chat" aria-label="Options du chat" data-i18n-aria-label="Options du chat"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div class="chat-menu"><label><span data-i18n="Position du chat">Position du chat</span><select aria-label="Position du chat" data-i18n-aria-label="Position du chat"><option value="auto" data-i18n="Auto">Auto</option><option value="top" data-i18n="Top">Top</option><option value="bottom" data-i18n="Bottom">Bottom</option><option value="left" data-i18n="Left">Left</option><option value="right" data-i18n="Right">Right</option></select></label><a target="_blank" rel="noopener" data-i18n="Ouvrir sur Twitch ↗">Ouvrir sur Twitch ↗</a></div></details><button title="Son" data-i18n-title="Son" class="snd"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><g class="on"><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></g><g class="off"><path d="m23 9-6 6"/><path d="m17 9 6 6"/></g><g class="pinned" transform="translate(11 -2) scale(.55)" stroke-width="3.5"><path d="M9 3h6M10 3v5l-3 4h10l-3-4V3M12 12v9"/></g></svg></button><button title="Spotlight" data-i18n-title="Spotlight" aria-pressed="false" class="spotlight"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="12" height="14" rx="1"/><rect x="17" y="5" width="4" height="6" rx="1"/><rect x="17" y="13" width="4" height="6" rx="1"/></svg></button><button title="Agrandir dans la fenêtre" data-i18n-title="Agrandir dans la fenêtre" class="fs"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g class="enter"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></g><g class="exit"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></g></svg></button><button title="Retirer" data-i18n-title="Retirer" class="close"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="tile-body"><div class="player"></div><section class="chat" hidden></section></div><div class="drop" data-i18n="Déposer ici">Déposer ici</div><div class="load"><i></i><b>${escapeHTML(s.display)}</b><small data-i18n="Hors ligne">Hors ligne</small><small class="more" data-i18n="Fais défiler pour lire">Fais défiler pour lire</small></div><div class="ctl"><button title="Play/pause" data-i18n-title="Play/pause"></button><input type="range" min="0" max="1" step="0.05" title="Volume" data-i18n-title="Volume"><output></output></div>`;
  const [snd, spot, fs, close] = ['.snd', '.spotlight', '.fs', '.close'].map(selector => el.querySelector(selector));
  spot.onclick = e => { e.stopPropagation(); focus(s.twitch); };
  fs.onclick = e => { e.stopPropagation(); setExpanded(expanded === s.twitch ? null : s.twitch); };
  fs.title = tr('Agrandir dans la fenêtre');
  fs.setAttribute('aria-label', fs.title);
  fs.setAttribute('aria-pressed', 'false');
  const pp = el.querySelector('.ctl button'), vol = el.querySelector('.ctl input'), pct = el.querySelector('.ctl output');
  const ppIcon = () => pp.textContent = t.paused ? '▶\uFE0E' : '⏸\uFE0E';
  pp.onclick = e => { e.stopPropagation(); t.paused = !t.paused; ppIcon(); sync(t); mark(t); save(); };
  vol.value = volume; pct.value = Math.round(volume * 100) + '%';
  vol.oninput = () => { t.volume = +vol.value; pct.value = Math.round(t.volume * 100) + '%'; t.player.setVolume(t.volume); setMuted(t, false); save(); };
  // one button cycles the three sound states: muted, on (until the spotlight moves), pinned (until changed here)
  snd.onclick = e => { e.stopPropagation(); if (t.muted) { t.pinned = false; setMuted(t, false); } else if (!t.pinned) { t.pinned = true; paint(t); } else { t.pinned = false; setMuted(t, true); } save(); };
  const volumeSound = snd.cloneNode(true);
  volumeSound.onclick = snd.onclick;
  vol.before(volumeSound);
  const bar = el.querySelector('.bar');
  el.querySelector('.player').onclick = () => { if (!el.classList.contains('big')) focus(s.twitch); };
  // ponytail: reorder via CSS `order` only — moving an iframe in the DOM reloads the player
  bar.ondragstart = e => {
    dragging = s.twitch; document.body.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
    for (const [login, t] of tiles) { t.el.classList.toggle('drop-target', canDrop(login)); t.el.classList.toggle('dragged', login === s.twitch); }
  };
  el.ondragover = e => { if (!canDrop(s.twitch)) return; e.preventDefault(); el.classList.add('over'); };
  el.ondragleave = e => { if (!el.contains(e.relatedTarget)) el.classList.remove('over'); };
  el.ondrop = e => { e.preventDefault(); if (canDrop(s.twitch)) move(dragging, s.twitch); };
  close.onclick = e => { e.stopPropagation(); remove(s.twitch); renderList(); };
  translateTree(el);
  grid.append(el);
  const t = { el, bar, visible: true, muted, volume, paused, pinned, chatOpen, chatPosition, ready: false, ppIcon, body: el.querySelector('.tile-body'), chat: el.querySelector('.chat'), chatOptions: el.querySelector('.chat-options') };
  t.chat.id = 'chat-' + s.twitch;
  t.chat.setAttribute('aria-label', tr('Chat de {name}', {name:s.display}));
  const chatButton = bar.querySelector('.chat-toggle');
  chatButton.setAttribute('aria-controls', t.chat.id);
  chatButton.onclick = e => { e.stopPropagation(); t.chatOpen = !t.chatOpen; syncChat(); save(); };
  t.chatOptions.onclick = e => e.stopPropagation();
  t.chatOptions.ontoggle = () => { if (t.chatOptions.open) closeTileMenus(false, t.chatOptions); };
  t.chatOptions.ondragstart = e => { e.preventDefault(); e.stopPropagation(); };
  t.chatOptions.querySelector('select').onchange = e => { t.chatPosition = e.target.value; t.chatOpen = true; t.chatOptions.open = false; syncChat(); save(); };   // choosing a place is asking for the chat
  t.chatOptions.querySelector('a').href = `https://www.twitch.tv/popout/${s.twitch}/chat?popout=` + (document.documentElement.dataset.theme === 'dark' ? '&darkpopout=1' : '');
  setupCollaboration(t);
  updateTileInfo(t, s);
  tiles.set(s.twitch, t);
  ppIcon();
  io.observe(el);
  ro.observe(el.querySelector('.player'));
  chatResize.observe(t.body);
  order.push(s.twitch);
  layout();
  return true;
}

// Twitch only accepts the controls option when creating an embed. Recreate the changed
// tile, preserving its settings; all other iframes keep playing.
function mountPlayer(t, controls) {
  if (t.player && t.controls === controls) return;
  readNativeControls(t);
  if (t.ready && t.controls) t.quality = t.player.getQuality?.();
  clearTimeout(t.timer);
  t.player?.destroy();
  const container = t.el.querySelector('.player');
  container.replaceChildren();
  t.ready = false; t.controls = controls; t.hasPlayed = false;
  t.el.classList.toggle('full-player', controls);
  t.nativeAudio = null; t.pendingMute = null; t.nudged = false;
  t.playbackBlocked = false; t.playbackError = false;
  t.el.classList.remove('offline', 'partial');
  t.el.classList.toggle('loading', !allPaused && !t.paused);
  const player = new Twitch.Player(container, {
    channel: t.el.dataset.login, parent: [location.hostname], width: '100%', height: '100%',
    muted: true, autoplay: !allPaused && !t.paused, controls
  });
  t.player = player;
  container.querySelector('iframe').title = tr('Stream de {name}', {name:t.channel.display});
  const current = () => t.player === player && t.el.isConnected;
  player.addEventListener(Twitch.Player.READY, () => {
    if (!current()) return;
    t.ready = true;
    fit(container);
    player.setVolume(t.volume);
    t.nativeAudio = { muted: player.getMuted(), volume: t.volume };
    if (activated) applyMuted(t, t.muted);
    if (controls && t.quality) player.setQuality(t.quality);
    sync(t); mark(t);
  });
  for (const event of ['playing', 'play', 'pause', 'ended', 'playbackBlocked', 'offline', 'online', 'error']) player.addEventListener(event, () => {
    if (!current() || unloading) return;   // a player torn down by the navigation is not a viewer pausing
    if (event === 'offline' || event === 'online') t.el.classList.toggle('offline', event === 'offline');
    if (event === 'offline' || event === 'online' || event === 'playing') trackOnline(t, event !== 'offline');
    if (event === 'playbackBlocked') t.playbackBlocked = true;
    if (event === 'playing' || event === 'offline' || event === 'error') t.playbackBlocked = false;
    if (event === 'error') t.playbackError = true;
    if (event === 'playing' || event === 'online') t.playbackError = false;
    if (event === 'playing' && !t.hasPlayed) {
      t.hasPlayed = true;
      if (activated) applyMuted(t, t.muted);
    }
    if (controls && (t.hasPlayed || (event === 'play' && t.ready))) {
      if (event === 'pause' && !allPaused && onScreen(t) && !t.playbackBlocked) {
        // Firefox answers an unmute in a frame never clicked by pausing the media: blocked playback, not a pause the viewer chose
        if (Date.now() - (t.unmutedAt || 0) < 1000) t.playbackBlocked = true;
        else t.paused = true;
      }
      if (event === 'play') {
        t.paused = false;
        // A native Play resumes this stream even after the global pause.
        if (allPaused) {
          tiles.forEach(other => { if (other !== t) { other.paused = true; other.ppIcon(); } });
          allPaused = false; paintPlayAll();
        }
      }
      t.ppIcon(); save();
    }
    mark(t);
  });
}
function applyMuted(t, value) {
  t.pendingMute = { value, at: Date.now() };
  if (!value) t.unmutedAt = Date.now();
  t.player.setMuted(value);
}
function readNativeControls(t) {
  if (!t.controls || !t.ready || !t.hasPlayed) return;
  const audio = { muted: t.player.getMuted(), volume: t.player.getVolume() };
  let changed = false;
  if (t.pendingMute) {
    if (audio.muted === t.pendingMute.value || Date.now() - t.pendingMute.at > 2000) t.pendingMute = null;
  } else if (t.nativeAudio && audio.muted !== t.nativeAudio.muted) {
    if (mutedAll && !audio.muted) { setMuted(t, false); return; }   // silenced again: the global mute holds
    t.muted = audio.muted;
    if (t.muted) t.pinned = false;
    changed = true;
  }
  if (t.nativeAudio && audio.volume !== t.nativeAudio.volume && Number.isFinite(audio.volume)) {
    t.volume = audio.volume; changed = true;
    t.el.querySelector('.ctl input').value = t.volume;
    t.el.querySelector('.ctl output').value = Math.round(t.volume * 100) + '%';
  }
  t.nativeAudio = audio;
  if (changed) { paint(t); save(); }
}

function remove(login, updateLayout = true) {
  if (expanded === login) setExpanded(null);
  tiles.get(login).player.destroy();
  clearTimeout(tiles.get(login).timer); clearTimeout(tiles.get(login).offlineTimer);
  ro.unobserve(tiles.get(login).el.querySelector('.player'));
  chatResize.unobserve(tiles.get(login).body);
  io.unobserve(tiles.get(login).el);
  tiles.get(login).el.remove();
  tiles.delete(login);
  order.splice(order.indexOf(login), 1);
  if (focused === login) focused = null;
  if (updateLayout) layout();
}

function clearTiles() {
  for (const login of [...tiles.keys()]) remove(login, false);
  focused = null;
}

function move(from, to) {
  if (!from || from === to) return;
  if (to === focused) { focus(from); return; }   // dropped on the spotlight: the tiles trade roles, the grid order stays
  // the tile slides to the target: the index taken before the removal lands it after the target when moving down, before it when moving up
  const i = order.indexOf(from), j = order.indexOf(to);
  order.splice(i, 1);
  order.splice(j, 0, from);
  layout();
}

// the global mute outranks every intent, and keeps track of the tiles that would have sound for its release
function setMuted(t, m) {
  if (mutedAll) {
    const login = t.el.dataset.login;
    mutedAll = m ? mutedAll.filter(l => l !== login) : [...new Set([...mutedAll, login])];
    m = true;
  }
  t.muted = m; if (t.ready) applyMuted(t, m); paint(t);
}
function paint(t) {
  t.el.classList.toggle('loud', !t.muted); t.el.classList.toggle('pin', t.pinned);
  const spot = t.el.querySelector('.spotlight'), front = focused === t.el.dataset.login;
  spot.title = tr(front ? 'Revenir à la grille' : 'Spotlight'); spot.setAttribute('aria-label', spot.title); spot.setAttribute('aria-pressed', String(front));
  const sound = t.muted ? 'muted' : t.pinned ? 'pinned' : 'on';
  for (const button of t.el.querySelectorAll('.snd')) {
    button.title = tr(sound === 'muted' ? 'Allumer le son' : sound === 'on' ? 'Épingler le son' : 'Couper le son');
    button.setAttribute('aria-label', button.title);
    button.dataset.sound = sound;
  }
}
function setExpanded(login) {
  expanded = login;
  hidePreview();
  $('#side').inert = !!expanded;
  for (const [name, t] of tiles) {
    const active = name === expanded;
    t.el.classList.toggle('expanded', active);
    t.el.inert = !!expanded && !active;
    t.bar.draggable = !expanded && canDrag(name);
    const button = t.bar.querySelector('.fs');
    button.title = active ? tr('Revenir à la disposition précédente') : tr('Agrandir dans la fenêtre');
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(active));
    fit(t.el.querySelector('.player'));
    sync(t);
  }
  syncChat();
}
// the spotlight brings the sound along and takes it from the tiles merely on; a pinned sound stays
function focus(login) {
  if (expanded) setExpanded(null);
  if (tiles.size < 2) return;
  const prev = focused;
  if (prev) readNativeControls(tiles.get(prev));
  focused = focused === login ? null : login;
  for (const [other, o] of tiles) if (other !== focused && !o.pinned && (mutedAll ? mutedAll.includes(other) : !o.muted)) setMuted(o, true);   // the intent counts under a global mute
  if (focused) setMuted(tiles.get(focused), false);
  layout();
}// every tile but the spotlight drags, and any other tile takes the drop
const canDrag = login => tiles.size > 1 && login !== expanded && login !== focused;
const canDrop = login => !!dragging && dragging !== login;

// the column count whose cells hold the widest 16:9 video: two streams stack on a tall box, sit side by side on a wide one
function columnsFor(count, w, h) {
  const bar = parseFloat(getComputedStyle(grid).getPropertyValue('--bar')) || 34;
  let cols = 1, best = 0;
  for (let c = 1; c <= count; c++) {
    const video = Math.min(w / c, (h / Math.ceil(count / c) - bar) * 16 / 9);
    if (video > best) { best = video; cols = c; }
  }
  return cols;
}
// the rendered video width that grants the full Twitch player, the tile width or the room under the video that grants the chat,
// in pixels; the keep values hold what a tile already has so a window near the line does not flap
const PLAYER_WIDTH = { enter: 640, keep: 560 }, CHAT_WIDTH = { enter: 640, keep: 560 }, CHAT_HEIGHT = { enter: 420, keep: 380 };
let mountTimer, resizing = false, batching = false;
function layout() {
  if (batching) return;   // a restore adds every tile first and lays them out once
  renderLanding();
  const n = tiles.size;
  if (n < 2) focused = null;
  const frontOrder = focused ? [focused] : [], front = login => frontOrder.includes(login), count = frontOrder.length;
  const split = count > 0 && count < n;   // the spotlight beside a column of small ones
  if (expanded && n > 1 && !front(expanded)) setExpanded(null);
  grid.classList.toggle('single', n === 1);
  grid.classList.toggle('focused', split);
  for (const [login, t] of tiles) {
    t.el.classList.toggle('big', front(login));
    t.el.style.order = front(login) ? frontOrder.indexOf(login) : order.indexOf(login);
    t.bar.draggable = canDrag(login);
  }
  if (split) {
    // ponytail: front tiles leave the grid flow and are placed by hand in the box the small tiles leave them, since
    // wrapping them in their own grid would move the iframes and reload the players
    const box = grid.getBoundingClientRect(), bar = parseFloat(getComputedStyle(grid).getPropertyValue('--bar')) || 34;
    const below = box.height > box.width;   // a portrait box keeps the small tiles in a strip under the front row instead of a column beside it
    grid.classList.toggle('below', below);
    let w = box.width, h = box.height;
    if (below) {
      const sideCols = Math.max(1, Math.round(box.width / ((innerHeight * .22 - bar) * 16 / 9))), tileH = box.width / sideCols * 9 / 16 + bar;
      // the strip shows as many rows as the front row can spare without shrinking its videos
      const frontCols = columnsFor(count, w, box.height - tileH - 2), frontRows = Math.ceil(count / frontCols);
      const frontMin = frontRows * ((w - 2 * (frontCols - 1)) / frontCols * 9 / 16 + bar) + 2 * (frontRows - 1);
      const stripRows = Math.max(1, Math.min(Math.ceil((n - count) / sideCols), Math.floor((box.height - frontMin) / (tileH + 2))));
      h = box.height - stripRows * (tileH + 2);
      grid.style.setProperty('--cols', sideCols);
      grid.style.setProperty('--tile-h', tileH + 'px');
      grid.style.gridTemplateColumns = `repeat(${sideCols}, 1fr)`;
      grid.style.gridTemplateRows = `${h}px repeat(${Math.max(Math.ceil((n - count) / sideCols), 1)}, var(--tile-h))`;
    } else {
      const wide = innerWidth / innerHeight > 2, sideCols = wide ? 2 : 1;   // ultrawide → two side columns
      w = box.width - innerWidth * (wide ? .3 : .22) - 2;
      grid.style.setProperty('--cols', sideCols);
      grid.style.setProperty('--side', wide ? '30vw' : '22vw');
      grid.style.removeProperty('--tile-h');
      grid.style.gridTemplateColumns = '';
      grid.style.gridTemplateRows = `repeat(${Math.max(Math.ceil((n - count) / sideCols), 1)}, var(--tile-h))`;
    }
    const cols = columnsFor(count, w, h), rows = Math.ceil(count / cols);
    const cw = (w - 2 * (cols - 1)) / cols, ch = (h - 2 * (rows - 1)) / rows;
    frontOrder.forEach((login, i) => {
      const style = tiles.get(login).el.style;
      style.setProperty('--x', box.left + (i % cols) * (cw + 2) + 'px'); style.setProperty('--y', box.top + Math.floor(i / cols) * (ch + 2) + 'px');
      style.setProperty('--w', cw + 'px'); style.setProperty('--h', ch + 'px');
    });
  } else {
    grid.classList.remove('below'); grid.style.removeProperty('--tile-h');
    for (const t of tiles.values()) for (const name of ['--x', '--y', '--w', '--h']) t.el.style.removeProperty(name);
    const cols = columnsFor(n, grid.clientWidth || innerWidth, grid.clientHeight || innerHeight), rows = Math.ceil(n / cols) || 1;
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, ${100 / rows}vh)`;
  }
  // The spotlight and a lone tile always get the full player. Any other tile gets it once wide enough, and its chat wider
  // still, measured on the tile with a margin either way so a window near the line does not flap. A first mount, a role
  // change and a tile leaving the front apply now; a change that only comes from a window resize waits for it to settle.
  const barHeight = parseFloat(getComputedStyle(grid).getPropertyValue('--bar')) || 34;
  let sizeChange = false;
  for (const [login, t] of tiles) {
    const w = t.el.clientWidth, h = t.el.clientHeight - barHeight, video = Math.min(w, h * 16 / 9), spare = h - w * 9 / 16;
    t.fits = t.sized ? video >= PLAYER_WIDTH.keep : video >= PLAYER_WIDTH.enter;   // the margin protects a player earned by size, not one that came with a role
    t.chatFits = t.chatFits ? w >= CHAT_WIDTH.keep || spare >= CHAT_HEIGHT.keep : w >= CHAT_WIDTH.enter || spare >= CHAT_HEIGHT.enter;
    const byRole = n === 1 || front(login), want = byRole || t.fits;
    if (!t.player || byRole || (t.controls && !t.sized && !want)) mountPlayer(t, want);
    else if (want !== t.controls) sizeChange = true;
    t.sized = !byRole && t.controls;
    fit(t.el.querySelector('.player'));
    updateCollaborationButtons(t);
    paint(t);
    if (t.collaboration.open) positionCollaborationMenu(t);
  }
  clearTimeout(mountTimer);
  const applySizes = () => {
    for (const [login, t] of tiles) if (tiles.size > 1 && login !== focused && t.fits !== t.controls) { mountPlayer(t, t.fits); t.sized = t.controls; fit(t.el.querySelector('.player')); }
    syncChat();
  };
  if (sizeChange) { if (resizing) mountTimer = setTimeout(applySizes, 300); else applySizes(); }   // only a window resize waits to settle
  syncChat();
  save();
  updateAudioOverlay();
  refreshCollaborations();
}

$('#toggle').onclick = () => { hidePreview(); document.body.classList.toggle('collapsed'); save(); };
// one button silences everything and gives the sound back to exactly the streams that had it
function paintMuteAll() {
  const button = $('#muteall');
  button.setAttribute('aria-pressed', String(!!mutedAll));
  button.title = tr(mutedAll ? 'Réactiver le son' : 'Couper tous les sons'); button.setAttribute('aria-label', button.title);
}
$('#muteall').onclick = () => {
  tiles.forEach(readNativeControls);
  if (mutedAll) { const loud = mutedAll; mutedAll = null; for (const login of loud) if (tiles.has(login)) setMuted(tiles.get(login), false); }
  else { const loud = [...tiles].filter(([, t]) => !t.muted).map(([login]) => login); tiles.forEach(t => setMuted(t, true)); mutedAll = loud; }
  paintMuteAll(); save();
};
$('#playall').onclick = () => { allPaused = !allPaused; paintPlayAll(); tiles.forEach(t => { sync(t); mark(t); }); save(); };
let unloading = false;
onpagehide = () => { unloading = true; saveCurrentLayout(); };
// Tooltips: every title shows as a styled tooltip; the attribute moves aside while the pointer or the focus is on the element
// so the browser's own tooltip stays quiet, and comes back as soon as they leave.
const tooltip = $('#tooltip');
let tipTarget = null, tipTimer;
function stashTitle(el) { if (el.hasAttribute('title')) { el.dataset.tip = el.getAttribute('title'); el.removeAttribute('title'); } }
function showTip(el, delay) {
  hideTip();
  stashTitle(el);
  if (!el.dataset.tip) return;
  tipTarget = el;
  tipTimer = setTimeout(() => {
    if (tipTarget !== el || !el.isConnected) return;
    tooltip.textContent = el.dataset.tip; tooltip.hidden = false;
    const r = el.getBoundingClientRect(), w = tooltip.offsetWidth, h = tooltip.offsetHeight;
    const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    const y = r.bottom + h + 16 > innerHeight ? r.top - h - 8 : r.bottom + 8;
    tooltip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    tooltip.classList.add('in');
  }, delay);
}
function hideTip() {
  clearTimeout(tipTimer);
  if (tipTarget && tipTarget.dataset.tip !== undefined) { tipTarget.setAttribute('title', tipTarget.dataset.tip); delete tipTarget.dataset.tip; }
  tipTarget = null; tooltip.classList.remove('in'); tooltip.hidden = true;
}
const tipSource = target => { const el = target.closest?.('[title], [data-tip]'); return el && el.tagName !== 'IFRAME' ? el : null; };
document.addEventListener('pointerover', e => { const el = tipSource(e.target); if (el && el !== tipTarget && e.pointerType !== 'touch') showTip(el, 400); });
document.addEventListener('pointerout', e => { if (tipTarget && !tipTarget.contains(e.relatedTarget)) hideTip(); });
document.addEventListener('focusin', e => { const el = tipSource(e.target); if (el && el.matches(':focus-visible')) showTip(el, 0); });
document.addEventListener('focusout', () => { if (tipTarget && !tipTarget.matches(':hover')) hideTip(); });
document.addEventListener('dragstart', hideTip, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); }, true);
// a click often changes the title of the button under the pointer: keep it aside and refresh the tooltip
new MutationObserver(records => { for (const r of records) if (r.target === tipTarget && r.target.hasAttribute('title')) { stashTitle(r.target); tooltip.textContent = r.target.dataset.tip; } })
  .observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['title'] });
onpageshow = () => { unloading = false; };
function tick() {
  // after a reload the page itself has no focus, so a click in a player moves it there without the blur below: catch up
  if (!activated && document.activeElement?.tagName === 'IFRAME') activate();
  tiles.forEach(t => { watchdog(t); paint(t); });
  markPreview();
  updateAudioOverlay();
}
setInterval(tick, 1000);
// audible playback is refused until the user clicks the page, and an unmute attempted before that can leave the media
// paused with no way back: players stay muted until the first click, which then pushes every intent and re-plays
// Firefox grants audible playback only to the iframe that received the click, never from a click on the page around it:
// an unmute pushed after a page click pauses the player and every play() is refused until its own video is clicked.
// The first gesture restores the requested audio for every player, including players still loading.
let activated = false;
function push() { tiles.forEach(t => { if (!t.ready || allPaused || t.paused || (t.controls && t.hasPlayed && !t.playbackBlocked && (t.muted || !t.player.getMuted()))) return; applyMuted(t, t.muted); if (!allPaused && !t.muted && !t.paused) { t.player.play(); t.nudgedAt = Date.now(); } }); }
function activate() { activated = true; updateAudioOverlay(); push(); }
addEventListener('pointerdown', () => {
  if ($('#audio-overlay').hidden && !activated) activate();
}, { capture: true });
addEventListener('click', e => {
  if (!$('#audio-overlay').hidden) { e.preventDefault(); e.stopImmediatePropagation(); activate(); }
}, { capture: true });
addEventListener('keydown', e => {
  if (!$('#audio-overlay').hidden) { e.preventDefault(); e.stopImmediatePropagation(); activate(); }
  else if (!activated) activate();
}, { capture: true });
// a click on the video lands inside the iframe and never reaches this page: the only trace is the focus leaving for it
// (Firefox fires blur before it moves activeElement to the iframe, hence the tick)
addEventListener('blur', () => setTimeout(() => { if (document.activeElement?.tagName === 'IFRAME') { closeTileMenus(); activate(); } }));
document.ondragend = () => { dragging = null; document.body.classList.remove('dragging'); document.querySelectorAll('.tile.over, .tile.drop-target, .tile.dragged').forEach(t => t.classList.remove('over', 'drop-target', 'dragged')); };
new ResizeObserver(() => { if (restored) { resizing = true; layout(); resizing = false; } }).observe(grid);   // window resizes and sidebar toggles both change the grid box
grid.addEventListener('scroll', () => closeTileMenus(), { passive: true });
document.onfullscreenchange = () => tiles.forEach(t => { fit(t.el.querySelector('.player')); sync(t); });
document.onkeydown = e => { if (e.key === 'Escape') { if (closeTileMenus(true)) { e.preventDefault(); return; } if (expanded) setExpanded(null); else if (previewRow) hidePreview(); else if (focused) focus(focused); } };
// Check the static app files so a script-only deploy also offers a reload.
const dev = location.hostname === 'localhost';
let versionBody;
setInterval(async () => {
  try {
    const parts = await Promise.all(['/index.html', '/app.js', '/library.js', '/preferences.js', '/grids.js', '/workspace.js', '/config.json'].map(async path => {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      return response.text();
    }));
    const current = parts.join('\n');
    if (versionBody && current !== versionBody) dev ? location.reload() : $('#update').hidden = false;
    versionBody = current;
  } catch { /* Keep the players running when a version check fails. */ }
}, dev ? 3000 : 60000);

let library, follows = [], results = [], searchVersion = 0, accountVersion = 0;
let searching = false, refreshInFlight = false, lastFollows = 0, searchTimer, searchController;
let searchError = '';
const lastLiveStatus = new Map(), liveNotifications = new Map();
function dismissLiveNotification(login) {
  liveNotifications.get(login)?.remove();
  liveNotifications.delete(login);
}
function pruneLiveNotifications(channels) {
  const logins = new Set(channels.map(s => s.twitch));
  for (const login of lastLiveStatus.keys()) if (!logins.has(login)) lastLiveStatus.delete(login);
  for (const login of liveNotifications.keys()) if (!logins.has(login)) dismissLiveNotification(login);
}
function openLiveNotification(login) {
  const s = (library.user ? follows : favorites).find(s => s.twitch === login);
  if (!s || s.online !== true) { dismissLiveNotification(login); return; }
  if (!tiles.has(login)) add(s);
  const t = tiles.get(login);
  if (!t) return;
  if (expanded) setExpanded(null);
  if (tiles.size > 1 && focused !== login) focus(login);
  if (allPaused) {
    tiles.forEach(other => { if (other !== t) { other.paused = true; other.ppIcon(); } });
    allPaused = false; paintPlayAll();
  }
  t.paused = false; t.ppIcon(); setMuted(t, false); sync(t); mark(t);
  if (innerWidth <= 700) document.body.classList.add('collapsed');
  grid.scrollTop = 0;
  dismissLiveNotification(login);
  renderList(); save();
  t.bar.querySelector('.fs').focus({ preventScroll: true });
}
function updateLiveNotifications(channels) {
  pruneLiveNotifications(channels);
  for (const s of channels) {
    if (s.online && lastLiveStatus.get(s.twitch) === false && !liveNotifications.has(s.twitch)) {
      const toast = document.createElement('div');
      toast.className = 'live-notification'; toast.dataset.login = s.twitch;
      toast.innerHTML = '<button class="watch"><img alt=""><span><b></b><small data-i18n="Afficher dans la grille">Afficher dans la grille</small></span></button><button class="dismiss" aria-label="Fermer la notification" data-i18n-aria-label="Fermer la notification"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>';
      translateTree(toast);
      toast.querySelector('img').src = s.profileUrl;
      toast.querySelector('b').textContent = tr('{name} est en direct', {name:s.display});
      toast.querySelector('.watch').onclick = () => openLiveNotification(s.twitch);
      toast.querySelector('.dismiss').onclick = () => dismissLiveNotification(s.twitch);
      liveNotifications.set(s.twitch, toast);
      $('#live-notifications').prepend(toast);
    }
    if (!s.online) dismissLiveNotification(s.twitch);
    lastLiveStatus.set(s.twitch, s.online);
  }
}
const statusUnavailable = 'Impossible d’actualiser le statut des favoris. Nouvelle tentative dans 30 secondes.';
let accountReady = false;
const storedFavorites = readStored('tg.favorites', []);
let favorites = Array.isArray(storedFavorites) ? storedFavorites.filter(s => s && validLogin(s.twitch)).map(channel) : [];
favorites = [...new Map(favorites.map(s => [s.twitch, s])).values()];
function notice(message = '') { $('#notice').textContent = tr(message); }
function saveFavorites() {
  if (!writeStored('tg.favorites', favorites.map(({ twitch, display, profileUrl }) => ({ twitch, display, profileUrl })))) notice(tr('Le navigateur ne peut pas enregistrer les favoris. Ils seront perdus à la fermeture de la page.'));
}
function updateAccount() {
  const connected = !!library?.user;
  $('#connect').hidden = connected;
  $('#connect').disabled = !accountReady || !library?.clientId;
  $('#disconnect').hidden = !connected;
}
function rebuild() {
  pruneLiveNotifications(library?.user ? follows : favorites);
  const merged = new Map([...(library?.user ? follows : favorites), ...results].map(s => [s.twitch, s]));
  streamers = [...merged.values()];
  renderList();
  refreshCollaborations();
  for (const s of streamers) { const t = tiles.get(s.twitch); if (t) updateTileInfo(t, s); }
}
function toggleFavorite(s) {
  if (library?.user) return;
  if (favorites.some(f => f.twitch === s.twitch)) favorites = favorites.filter(f => f.twitch !== s.twitch);
  else favorites.push(s);
  saveFavorites(); rebuild(); refresh();
}
function loginFromQuery(query) {
  const login = query.trim().toLowerCase().replace(/^https?:\/\/(?:www\.)?twitch\.tv\//, '').replace(/^@/, '').replace(/\/$/, '');
  return validLogin(login) ? login : '';
}
function renderList() {
  const q = $('#q').value.trim().toLowerCase();
  $('#clear-search').hidden = !$('#q').value;
  const connected = !!library?.user;
  const base = connected ? follows : favorites;
  const matches = base.filter(s => !q || s.display.toLowerCase().includes(q) || s.twitch.includes(q));
  const rows = [...new Map([...matches, ...(q ? results : [])].map(s => [s.twitch, s])).values()]
    .sort((a, b) => Number(b.twitch === loginFromQuery(q)) - Number(a.twitch === loginFromQuery(q)) || Number(b.online) - Number(a.online) || viewers(b) - viewers(a) || a.display.localeCompare(b.display));
  list.classList.toggle('search-results', q.length >= 2);
  list.setAttribute('aria-busy', searching);
  const active = document.activeElement;
  const keyboardLogin = list.contains(active) ? active.closest('li')?.dataset.login : null;
  const keyboardFavorite = active?.classList.contains('favorite');
  list.replaceChildren(...rows.map(s => {
    const li = document.createElement('li'); li.dataset.login = s.twitch;
    li.className = (s.online === true ? 'live' : s.online === false ? 'off' : '') + (tiles.has(s.twitch) ? ' on' : '');
    li.innerHTML = '<button class="channel"><img alt="" loading="lazy"><span class="n"><span class="name"></span><div class="g"></div></span><span class="v"></span></button><button class="favorite"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg></button>';
    li.querySelector('img').src = s.profileUrl;
    li.querySelector('img').title = s.display;   // the collapsed rail shows only the avatar
    li.querySelector('.name').textContent = s.display;
    const participants = s.online === false ? [] : collaborations.get(s.twitch)?.participants || [];
    if (participants.some(p => p.twitch !== s.twitch)) {
      const indicator = document.createElement('span');
      indicator.className = 'collaboration-indicator';
      indicator.innerHTML = collaborationIcon;
      indicator.title = tr('Collaboration : {names}', {names:participants.map(p => p.display).join(', ')});
      indicator.setAttribute('role', 'img');
      indicator.setAttribute('aria-label', indicator.title);
      li.querySelector('.name').after(indicator);
    }
    li.querySelector('.g').textContent = [s.online === false ? tr('Hors ligne') : s.online ? tr('En direct') : '', s.game].filter(Boolean).join(' · ') || tr('Chaîne Twitch');
    li.querySelector('.v').textContent = s.online ? s.viewersAmount.formatted || 'LIVE' : '';
    const play = li.querySelector('.channel'), blocked = locked && !tiles.has(s.twitch);
    play.disabled = !accountReady || blocked;
    play.title = blocked ? tr('Grille verrouillée') : '';
    play.classList.toggle('blocked', blocked);
    play.setAttribute('aria-label', tr(tiles.has(s.twitch) ? 'Afficher ou retirer {name}' : 'Regarder {name}', {name:s.display}));
    play.setAttribute('aria-pressed', tiles.has(s.twitch));
    play.onclick = () => { hidePreview(); toggle(s); };
    const star = li.querySelector('.favorite'), saved = favorites.some(f => f.twitch === s.twitch);
    star.hidden = connected;
    star.title = tr(saved ? 'Retirer des favoris : {name}' : 'Ajouter aux favoris : {name}', {name:s.display});
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
  $('#list-empty').hidden = rows.length > 0 || (!q && !connected);
  $('#list-empty').textContent = searching ? tr('Recherche en cours…') : q ? tr('Aucun résultat dans cette liste.') : connected ? tr('Tu ne suis encore aucune chaîne.') : '';
  $('#search-actions').hidden = !searchError || connected;
  $('#search-state').hidden = !q;
  $('#search-state').textContent = !q ? '' : q.length < 2 ? tr('Saisis au moins 2 caractères.') : searching ? tr('Recherche sur Twitch…') : searchError || (rows.length ? tr(rows.length === 1 ? '{count} chaîne trouvée' : '{count} chaînes trouvées', {count:rows.length}) : tr('Aucune chaîne trouvée.'));
  const login = loginFromQuery(q);
  $('#add-login').hidden = connected || !searchError || !login || favorites.some(s => s.twitch === login);
  $('#add-login').textContent = tr('Ajouter {name} sans vérifier', {name:login});
  renderEmpty();
}
function renderEmpty() {
  renderLanding();
  const connected = !!library?.user;
  $('#top').hidden = connected || (accountReady && !library?.clientId);
  $('#top').disabled = !accountReady;
  $('#empty p').textContent = connected ? tr('Ta grille est vide. Tes follows sont dans la liste, les directs en premier.') : tr('Ta grille est vide. Trois gestes et tes streams sont côte à côte.');
}
function findStreamer() {
  document.body.classList.remove('collapsed');
  $('#q').focus();
  save();
}
// The landing covers the app until the visitor connects, has favorites or open tiles, or continues without an account (remembered for this tab only).
let landingWanted = false;   // "Revoir la présentation" brings the landing back even with favorites or a dismissed visit
function renderLanding() {
  const pending = !accountReady && (readStored('tg.session', '', sessionStorage) || readStored('tg.oauth', null, sessionStorage));
  const openTiles = restored ? order.length : (readStored('tg.layout.guest', {}).order?.length || 0);
  document.body.classList.toggle('landing', landingWanted || !library?.user && !pending && !favorites.length && !openTiles && !readStored('tg.landing', false, sessionStorage));
  for (const button of document.querySelectorAll('#landing .landing-connect')) { button.hidden = accountReady && !library?.clientId; button.disabled = !accountReady; }
}
const landingObserver = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('in'); landingObserver.unobserve(entry.target); }
}, { rootMargin: '0px 0px -15% 0px' });
function splitReveal() {   // one span per word so the tagline lights up word by word as it scrolls into view
  for (const el of document.querySelectorAll('#landing .reveal')) {
    el.innerHTML = el.textContent.trim().split(/\s+/).map((word, i) => `<span style="transition-delay:${i * 40}ms">${escapeHTML(word)}</span>`).join(' ');
    for (const word of el.children) landingObserver.observe(word);
  }
}
for (const el of document.querySelectorAll('#landing .rise')) landingObserver.observe(el);
async function search() {
  searchController?.abort();
  const version = ++searchVersion, query = $('#q').value.trim();
  results = []; searchError = ''; searching = query.length >= 2; rebuild();
  if (!searching) return;
  searchController = new AbortController();
  try {
    const found = await (library || new TwitchLibrary('')).search(loginFromQuery(query) || query, searchController.signal);
    if (version !== searchVersion) return;
    results = found;
  } catch (error) {
    if (version !== searchVersion || error.name === 'AbortError') return;
    if (error.status === 401) handleError(error);
    else searchError = error.status ? error.message : tr('La recherche Twitch est indisponible pour le moment. Tu peux ajouter un pseudo directement.');
  } finally { if (version === searchVersion) { searching = false; rebuild(); } }
}

function handleError(error) {
  if (error.status === 401) disconnect(false);
  notice(error.message);
}
async function refresh() {
  if (!library || refreshInFlight) return;
  refreshInFlight = true;
  const version = accountVersion, connected = !!library.user;
  try {
    let nextChannels = connected ? follows : favorites;
    const reloadFollows = connected && Date.now() - lastFollows > 60000;
    if (reloadFollows) nextChannels = await library.follows();
    const logins = [...new Set([...nextChannels, ...order.map(twitch => ({ twitch }))].map(s => s.twitch))];
    const live = await library.live(logins);
    if (version !== accountVersion) return;
    const update = s => channel({ ...s, profileUrl: library.profiles.get(s.twitch)?.profileUrl || s.profileUrl, online: live.has(s.twitch), game: live.get(s.twitch)?.game_name || '', title: live.get(s.twitch)?.title || '', viewer_count: live.get(s.twitch)?.viewer_count ?? 0 });
    if (connected) follows = nextChannels.map(update);
    else favorites = favorites.map(s => logins.includes(s.twitch) ? update(s) : s);
    results = results.map(s => logins.includes(s.twitch) ? update(s) : s);
    if (reloadFollows) lastFollows = Date.now();
    rebuild(); if (connected || $('#notice').textContent === tr(statusUnavailable)) notice();
    for (const [login, t] of tiles) if (logins.includes(login)) updateTileInfo(t, update(t.channel));
    updateLiveNotifications(connected ? follows : favorites);
    refreshCollaborations();
  } catch (error) {
    if (version === accountVersion) {
      if (connected) handleError(error);
      else notice(statusUnavailable);
    }
  } finally {
    refreshInFlight = false;
    if (version !== accountVersion) refresh();
  }
}
function disconnect(clearNotice = true) {
  lastLiveStatus.clear();
  for (const login of liveNotifications.keys()) dismissLiveNotification(login);
  accountVersion++; searchVersion++; searching = false;
  clearTimeout(searchTimer); searchController?.abort(); searchError = ''; $('#q').value = ''; hidePreview();
  library.disconnect(); follows = []; results = []; lastFollows = 0;
  favorites = favorites.map(s => channel({ twitch: s.twitch, display: s.display, profileUrl: s.profileUrl }));
  updateAccount(); rebuild(); switchLayout('guest'); if (clearNotice) notice(); refresh();
}
$('#q').oninput = () => {
  clearTimeout(searchTimer); searchController?.abort(); searchVersion++; results = []; searchError = ''; searching = $('#q').value.trim().length >= 2; rebuild();
  searchTimer = setTimeout(search, 300);
};
$('#clear-search').onclick = () => {
  $('#q').value = '';
  clearTimeout(searchTimer);
  search();
  $('#q').focus();
};
$('#add-login').onclick = () => {
  const login = loginFromQuery($('#q').value);
  if (library?.user || !login || favorites.some(s => s.twitch === login)) return;
  favorites.push(channel({ twitch: login }));
  notice(); saveFavorites();
  $('#q').value = '';
  search();
  refresh();
};
$('#q').onkeydown = e => { if (e.key === 'Enter' && !$('#add-login').hidden) $('#add-login').click(); };
$('#top').onclick = $('#connect').onclick = () => { saveCurrentLayout(); library.connect().catch(handleError); };
$('#guest').onclick = findStreamer;
for (const button of document.querySelectorAll('#landing .landing-connect')) button.onclick = $('#top').onclick;
for (const button of document.querySelectorAll('#landing .landing-guest')) button.onclick = () => { landingWanted = false; writeStored('tg.landing', true, sessionStorage); renderLanding(); findStreamer(); };
$('#show-landing').onclick = () => { landingWanted = true; renderLanding(); $('#landing').scrollTop = 0; $('#landing-main').focus({ preventScroll: true }); };
$('#landing-language').onchange = e => setPreference('language', e.target.value);
$('#disconnect').onclick = () => disconnect();
async function init() {
  rebuild(); loadPlayer();
  let config;
  try {
    const response = await fetch('/config.json', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error();
    config = await response.json();
  } catch { notice(tr('La connexion Twitch est indisponible. Les favoris restent accessibles.')); }
  library = new TwitchLibrary(config?.twitchClientId || '');
  try { if (library.clientId) await library.resume(); }
  catch (error) { library.disconnect(); notice(error.message); }
  accountReady = true;
  updateAccount(); rebuild(); switchLayout(library.user ? 'connected' : 'guest'); await refresh();
}
initWorkspace();
addEventListener('preferenceschange', () => { $('#landing-language').value = preferences.language; splitReveal(); });
$('#landing-language').value = preferences.language; splitReveal();
init().catch(handleError);
setInterval(() => { if (!document.hidden) refresh(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(async () => {
  if (!library?.user) return;
  try { await library.validate(); } catch (error) { disconnect(false); notice(error.message); }
}, 3600000);
