const $ = s => document.querySelector(s);
const list = $('#list'), grid = $('#grid');
const tiles = new Map();   // twitch login -> { el, player, bar }
let streamers = [], focused = null, locked = false, mutedAll = null, expanded = null, order = [], dragging = null, allPaused = false, restored = false, layoutMode = null;
const collaborations = new Map();
const collaborationIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 4a3 3 0 0 1 0 6M19 14a5 5 0 0 1 3 4v3"/></svg>';

// everything needed to come back to the same screen: tile order, zoom, global pause, sidebar, per-tile mute
// Small tiles use our controls; the spotlight also reads changes made in the native Twitch player.
let gridStore = null, liveLayoutToRestore = null;
function isLiveGrid() { return gridStore?.activeId === 'live-follows'; }
// null keeps the automatic grid's size-dependent default; booleans are manual choices.
function tilePaused(t) { return t.paused ?? (isLiveGrid() && tiles.size >= 9); }
function hoverPlayback(t) {
  if (t.hoverSuppressed || tiles.size === 1 || t.el.dataset.login === focused || t.el.dataset.login === expanded) return false;
  return t.hovered && t.channel.online !== false && (allPaused || tilePaused(t));
}
function wantsPlayback(t) { return !document.hidden && !document.body.classList.contains('landing') && $('#audio-overlay').hidden && !showPoster(t) && (!allPaused && !tilePaused(t) || hoverPlayback(t)) && onScreen(t); }
function syncLiveGrid() {
  if (!restored || !isLiveGrid()) return;
  for (const login of liveNotifications.keys()) dismissLiveNotification(login);
  if (liveLayoutToRestore && !lastFollows) return; // Wait for the first verified list before restoring saved settings.
  const live = follows.filter(s => s.online);
  batching = true;
  if (liveLayoutToRestore) {
    const snapshot = liveLayoutToRestore;
    const byLogin = new Map(live.map(s => [s.twitch, s]));
    for (const login of Array.isArray(snapshot.order) ? [...new Set(snapshot.order)] : []) {
      if (byLogin.has(login)) restoreChannel(byLogin.get(login), snapshot, true);
    }
    focused = tiles.has(snapshot.focused) ? snapshot.focused : null;
    liveLayoutToRestore = null;
  }
  for (const s of live) if (!tiles.has(s.twitch)) add(s, true, 0.5, null, false, 'auto', true);
  batching = false;
  for (const login of [...tiles.keys()]) if (!follows.some(s => s.twitch === login)) remove(login, true, true);
  layout(); renderList();
}
// the global button reads as paused when it was pressed, or when every tile ended up paused on its own
function gridPaused() { const live = [...tiles.values()].filter(t => t.channel.online !== false); return allPaused || (live.length > 0 && live.every(tilePaused)); }
function paintPlayAll() { $('#playall').setAttribute('aria-pressed', String(gridPaused())); }
function currentLayout() {
  return { order: [...order], focused, locked, mutedAll, allPaused,
    channels: order.map(login => { const {twitch,display,profileUrl,previewUrl,offlineUrl}=tiles.get(login).channel; return {twitch,display,profileUrl,previewUrl,offlineUrl}; }),
    collapsed: document.body.classList.contains('collapsed'),
    ...Object.fromEntries(['muted','spotlightMuted','volume','paused','chatOpen','chatPosition'].map(key => [key,Object.fromEntries([...tiles].map(([login,t]) => [login,t[key]]))])) };
}
function save() {
  if (!restored || isLiveGrid() && liveLayoutToRestore) return;
  paintPlayAll();
  const snapshot = currentLayout();
  writeStored('tg.layout.' + layoutMode, snapshot);
  if (gridStore && !gridStore.save(snapshot)) notice(tr('Impossible d’enregistrer dans ce navigateur.'));
  renderGridLauncher();
}
function saveCurrentLayout() {
  tiles.forEach(readNativeControls);
  save();
}
function restoreChannel(s, snapshot, automatic = false) {
  const login = s.twitch;
  // Older layouts stored chat settings once for the entire grid.
  const perTile = value => value && typeof value === 'object' ? value[login] : value;
  const position = perTile(snapshot.chatPosition);
  const chatPosition = position === 'below' ? 'bottom' : ['auto', 'top', 'bottom', 'left', 'right'].includes(position) ? position : 'auto';
  const paused = snapshot.paused?.[login];
  add(s, !!mutedAll || (snapshot.muted?.[login] ?? true), snapshot.volume?.[login] ?? 0.5,
    typeof paused === 'boolean' ? paused : automatic ? null : false,
    perTile(snapshot.chatOpen) === true, chatPosition, automatic);
  if (tiles.has(login)) tiles.get(login).waitingForStatus = s.online == null;
  const before = snapshot.spotlightMuted?.[login];
  if (typeof before === 'boolean' && tiles.has(login)) tiles.get(login).spotlightMuted = before;   // what the spotlight gives back on the way out
}
function restore() {
  if (!layoutMode || restored || !window.Twitch?.Player) return;
  const st = gridStore?.active.layout || readStored('tg.layout.' + layoutMode, {});
  const savedChannels = Array.isArray(st.channels) ? st.channels : [];
  allPaused = !!st.allPaused;
  mutedAll = Array.isArray(st.mutedAll) ? st.mutedAll.filter(validLogin) : null;   // a global mute outranks whatever the tiles saved
  batching = true;
  liveLayoutToRestore = isLiveGrid() ? structuredClone(st) : null;
  for (const login of (!isLiveGrid() && Array.isArray(st.order) ? [...new Set(st.order)].filter(validLogin) : [])) {
    const s = streamers.find(x => x.twitch === login) || channel(savedChannels.find(x => x?.twitch === login) || { twitch: login });
    if (s) restoreChannel(s, st);
  }
  batching = false;
  focused = tiles.has(st.focused) ? st.focused : null;
  locked = isLiveGrid() || st.locked === true;
  paintMuteAll();
  paintPlayAll();
  document.body.classList.toggle('collapsed', st.collapsed ?? innerWidth <= 700);
  layout();
  tick();   // right away, not at the first second: a click that lands before it hits the page instead of the video
  restored = true;
  syncLiveGrid();
  syncChat();
  refreshCollaborations();
  save();
  // A late SDK load can restore channels after the initial status request has finished.
  queueMicrotask(() => { if ([...tiles.values()].some(t => t.waitingForStatus)) refresh(); });
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
  // Grid cells can have fractional dimensions. clientWidth/clientHeight round up and can clip the iframe.
  const box = p.getBoundingClientRect();
  const width = Math.min(box.width, box.height * 16 / 9), height = width * 9 / 16;
  const bounds = { width: width + 'px', height: height + 'px', left: (box.width - width) / 2 + 'px', top: (box.height - height) / 2 + 'px' };
  const poster = p.querySelector('.stream-poster');
  if (poster) Object.assign(poster.style, bounds);
  const frame = p.querySelector('iframe');
  if (!frame) return;
  if (document.fullscreenElement === frame) {
    for (const property of ['width', 'height', 'left', 'top']) frame.style.removeProperty(property);
    frame.style.transform = 'none';
  } else Object.assign(frame.style, bounds, {transform:'none'});
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
function start(t) {
  if (!t.ready || !wantsPlayback(t)) return;
  const wasPreviewing = t.previewing;
  t.previewing = hoverPlayback(t);
  if (t.previewing || !t.muted && t.player.getPlayerState().playback !== 'Playing') applyMuted(t, true);
  else if (wasPreviewing && activated) applyMuted(t, t.muted);
  t.commandedPlay = t.player.getPlayerState().playback !== 'Playing';
  t.player.play(); t.nudgedAt = Date.now();
}
function sync(t) {
  mark(t);
  clearTimeout(t.timer);
  if (showPoster(t)) { releasePlayer(t); return; }
  t.timer = setTimeout(() => {
    if (!t.el.isConnected) return;
    if (showPoster(t)) { releasePlayer(t); return; }
    if (!t.player) mountPlayer(t, !!t.controls);
    if (!t.ready) return;
    if (wantsPlayback(t)) start(t);
    else {
      t.player.pause();
      if (t.previewing) t.nativeAudio = {muted:t.player.getMuted(),volume:t.player.getVolume()};
      t.previewing = false;
    }
  }, 400);
}
// the player also pauses on its own during some reflows: whatever should be playing gets nudged back every second
function watchdog(t) {
  if (!t.ready) return;
  if (t.controls) { readNativeControls(t); mark(t); return; }
  if (t.playbackBlocked) { mark(t); return; }
  // isPaused() is false in the Ready/Idle states the player drops into after a resize, so go by the playback state.
  // A live stream takes seconds to (re)start and a play() during that restarts it: nudge at most every 5s
  const st = t.player.getPlayerState().playback;
  if (wantsPlayback(t) && !t.el.classList.contains('offline') && st !== 'Playing' && st !== 'Buffering' && Date.now() - (t.nudgedAt || 0) > 5000) {
    // a play() the player swallowed (seen after a window resize) leaves it stuck until a click inside it: the second
    // nudge pauses first, which is what that click does, then plays again once the teardown had its second
    if (t.nudged) { const current = t.player; t.player.pause(); setTimeout(() => { if (t.player === current && t.el.isConnected && wantsPlayback(t)) start(t); }, 1000); } else start(t);
    t.nudged = true;
  } else if (st === 'Playing') t.nudged = false;
  if (activated && st === 'Playing' && t.player.getMuted() !== (hoverPlayback(t) || t.muted)) applyMuted(t, t.muted);   // keeps the intent applied once sound is allowed
  mark(t);
}
// Deliberate pauses show a thumbnail; loading feedback sits beneath the iframe.
function mark(t) {
  // Paused tiles keep a still image; only an active hover gets the preview loading status.
  const paused = allPaused || tilePaused(t);
  t.el.classList.toggle('paused', paused);
  const state = t.ready ? t.player.getPlayerState().playback : '', playing = state === 'Playing';
  const offline = t.channel.online === false || t.el.classList.contains('offline');   // known from the status, or reported by the player
  // Ready for a while yet not starting, or refused outright: the loader gives way to a play button, and the click goes
  // to the embed, whose own gesture is what Twitch wants before it plays. An offline channel has nothing to start.
  const stalled = !offline && t.ready && !playing && state !== 'Buffering' && wantsPlayback(t) && (t.playbackBlocked || t.playbackError || Date.now() - (t.readyAt || Date.now()) > 8000);
  t.el.classList.toggle('stalled', stalled);
  if (playing) t.hasPlayed = true;
  // Keep the still until playback, beneath the embed.
  t.cover.classList.toggle('gone', !offline && !showPoster(t) && (playing || t.hasPlayed));   // a class, so the still fades instead of vanishing
  t.el.classList.toggle('player-ready', t.ready);
  // An offline channel shows its avatar and status over its banner, or over the dark tile when it has none.
  t.cover.classList.toggle('offline', offline);
  t.previewStatus.hidden = !(offline || !t.hasPlayed && (hoverPlayback(t) || (t.waitingForStatus || wantsPlayback(t))));
  t.previewStatus.querySelector('span').textContent = tr(offline ? 'Hors ligne' : t.playbackError || t.playbackBlocked ? 'Aperçu indisponible' : 'Chargement de l’aperçu…');
  t.el.classList.toggle('loading', !paused && !offline && onScreen(t) && !playing);   // the offline overlay replaces the loader
  t.el.classList.toggle('partial', !paused && !seen(t) && !playing);
  let status = t.bar.querySelector('.playback-status');
  if (!status) {
    status = document.createElement('span'); status.className = 'playback-status'; status.setAttribute('role', 'status');
    t.bar.querySelector('b').after(status);
  }
  if (status) {
    status.hidden = offline || playing || !wantsPlayback(t);
    status.classList.toggle('blocked', stalled);
    status.textContent = stalled ? '!' : '';
    status.title = tr(stalled ? 'Cliquer dans le lecteur pour réessayer' : 'Chargement du lecteur…');
    status.setAttribute('aria-label', status.title);
  }
  updateAudioOverlay();
  paintSound(t);
}

let audioOverlayFocus = null;
function updateAudioOverlay() {
  const overlay = $('#audio-overlay');
  const needed = !activated && !allPaused && !mutedAll && [...tiles.values()].some(t =>   // a global mute wants silence, not a prompt
    !tilePaused(t) && !t.muted && t.volume > 0 && t.channel.online !== false &&
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
const preview = $('#preview'), previewMessage = preview.querySelector('.preview-message'), previewVideo = preview.querySelector('.player'), previewPoster = preview.querySelector('.stream-poster');
previewPoster.onerror = () => { previewPoster.hidden = true; };
let previewRow = null, previewOnline = null, previewPlayer = null, previewReady = false, previewNudgedAt = 0, previewTimer, previewCloseTimer, previewLoadTimer;
// the embed does not always emit its playing event, and like the tiles it can sit in Ready until nudged with a play():
// poll the playback state every tick, nudge at most every 5s, and fade the overlay out once it plays
function markPreview() {
  if (preview.hidden || !previewPlayer || !previewReady || document.hidden) return;
  const st = previewPlayer.getPlayerState().playback;
  if (st === 'Playing') { clearTimeout(previewLoadTimer); preview.classList.add('playing'); preview.classList.remove('preview-failed'); previewMessage.hidden = true; return; }
  if (st !== 'Buffering' && Date.now() - previewNudgedAt > 5000) { previewPlayer.play(); previewNudgedAt = Date.now(); }
}
// The card fades out over its still: the player goes at once, the box waits for the transition before it leaves the page.
let previewFadeTimer;
function hidePreview() {
  clearTimeout(previewTimer);
  clearTimeout(previewCloseTimer);
  clearTimeout(previewLoadTimer);
  previewRow?.removeAttribute('aria-describedby');
  previewRow = null;
  preview.classList.remove('in');
  const player = previewPlayer;
  previewPlayer = null; previewReady = false;
  player?.destroy();
  previewVideo.replaceChildren();
  clearTimeout(previewFadeTimer);
  previewFadeTimer = setTimeout(() => {
    if (preview.classList.contains('in')) return;   // shown again meanwhile
    preview.hidden = true;
    preview.classList.remove('playing','player-ready','preview-failed');
    previewMessage.hidden = true;
  }, 250);
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
  const src = previewImageURL(s);
  if (previewPoster.getAttribute('src') !== src) { previewPoster.hidden = !src; if (src) previewPoster.src = src; else previewPoster.removeAttribute('src'); }
  row.setAttribute('aria-describedby', 'preview');
  const status = preview.querySelector('.status'), message = status.querySelector('span');
  status.querySelector('img').src = s.profileUrl;
  message.textContent = tr('Chargement de l’aperçu…');
  status.hidden = false;
  preview.classList.remove('playing','player-ready','preview-failed');
  previewMessage.hidden = true;
  clearTimeout(previewFadeTimer);
  preview.hidden = false;
  positionPreview();
  void preview.offsetWidth;   // commit the hidden state so the entrance transitions
  preview.classList.add('in');
  if (!window.Twitch?.Player) { message.textContent = tr('Aperçu indisponible'); return; }
  previewTimer = setTimeout(loadPreview, 300);
}
function loadPreview() {
  const s = streamers.find(s => s.twitch === previewRow?.dataset.login);
  if (!s || s.online === false || !previewRow.isConnected || preview.hidden || document.hidden || previewPlayer) return;
  const status = preview.querySelector('.status'), message = status.querySelector('span');
  const player = new Twitch.Player(previewVideo, { channel: s.twitch, parent: [location.hostname], width: 640, height: 360, autoplay: false, muted: true, controls: false });
  previewPlayer = player; previewNudgedAt = Date.now();
  const frame = previewVideo.querySelector('iframe');
  frame.tabIndex = -1;
  frame.title = tr('Aperçu de {name}', {name:s.display});
  fit(previewVideo);
  const current = () => previewPlayer === player && !preview.hidden;
  player.addEventListener(Twitch.Player.READY, () => {
    if (!current()) return;
    previewReady = true; preview.classList.add('player-ready');
    previewMessage.textContent = tr('Chargement de l’aperçu…'); previewMessage.hidden = false;
    player.setMuted(true); player.setVolume(0);
    // Leave time for the browser to report the now-uncovered iframe as visible.
    previewTimer = setTimeout(() => { if (current()) { player.play(); previewNudgedAt = Date.now(); markPreview(); } }, 400);
  });
  player.addEventListener(Twitch.Player.PLAYING, () => { if (current()) markPreview(); });   // the overlay fades out in CSS
  for (const event of ['offline', 'playbackBlocked', 'error']) player.addEventListener(event, () => {
    if (!current()) return;
    if (event === 'offline') { hidePreview(); return; }
    clearTimeout(previewLoadTimer);
    preview.classList.remove('playing');
    preview.classList.add('preview-failed');
    status.hidden = false;
    message.textContent = tr('Aperçu indisponible');
    previewMessage.textContent = message.textContent; previewMessage.hidden = false;
  });
  previewLoadTimer = setTimeout(() => {
    if (!current()) return;
    message.textContent = tr('L’aperçu tarde à démarrer');
    previewMessage.textContent = message.textContent; previewMessage.hidden = false;
  }, 12000);
}
// A pointer sweeping down the list should not flash a card per row: the first card waits, then follows the pointer at once.
function queuePreview(row) {
  clearTimeout(previewCloseTimer);
  if (previewRow === row && !preview.hidden) { resumePreview(); return; }
  const open = preview.classList.contains('in');
  hidePreview();
  if (open) showPreview(row);
  else { clearTimeout(previewTimer); previewTimer = setTimeout(() => showPreview(list.querySelector(`[data-login="${CSS.escape(row.dataset.login)}"]`) || row), 250); }   // the list may have re-rendered meanwhile
}
function leavePreview() { clearTimeout(previewTimer); clearTimeout(previewCloseTimer); previewCloseTimer = setTimeout(hidePreview, 180); }
function resumePreview() {
  clearTimeout(previewCloseTimer);
  if (preview.hidden) return;
  clearTimeout(previewTimer);
  if (!previewPlayer) previewTimer = setTimeout(loadPreview, 300);
  else if (previewReady) {
    const player = previewPlayer;
    previewTimer = setTimeout(() => {
      if (previewPlayer === player && !preview.hidden && !document.hidden) { player.play(); previewNudgedAt = Date.now(); }
    }, 400);
  }
}
preview.onpointerenter = resumePreview;
preview.onpointerleave = leavePreview;
list.addEventListener('scroll', hidePreview, { passive: true });
addEventListener('resize', hidePreview);
addEventListener('blur', hidePreview);
document.addEventListener('visibilitychange', () => { if (document.hidden) hidePreview(); });

// Sidebar and Twitch account integration.
function toggle(s) {
  // the sidebar fills the grid; a spotlight hands its place to the stream clicked
  if (focused && focused !== s.twitch) { if (tiles.has(s.twitch) || add(s)) focus(s.twitch); }
  else if (tiles.has(s.twitch)) { if (isLiveGrid()) focus(s.twitch); else remove(s.twitch); }
  else add(s);
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
    if (!tiles.has(login) || (!isLiveGrid() && (locked || focused === login))) return;
    if (!isLiveGrid() && !t.el.classList.contains('offline') && t.ready && t.player.getPlayerState().playback === 'Playing') return;   // a stale status against a player that plays
    remove(login, true, true); save();
    notice(tr('{name} est hors ligne, la tuile a été retirée.', { name: t.channel.display }));
  }, 60000);
}
function updateTileInfo(t, s) {
  const hadPoster = t.channel && showPoster(t);
  t.channel = s;
  if (typeof s.online === 'boolean') t.waitingForStatus = false;
  if (s.online === true) t.el.classList.remove('offline');
  updatePoster(t);
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
  if (t.cover) { t.ppIcon(); mark(t); }   // the offline overlay and the play button follow the status
  if (tiles.get(s.twitch) === t && hadPoster !== showPoster(t)) sync(t);
}

function add(s, muted = true, volume = 0.5, paused = false, chatOpen = false, chatPosition = 'auto', automatic = false) {
  if (tiles.has(s.twitch)) return true;
  if (locked && restored && !automatic) { notice(tr('Grille verrouillée : déverrouille-la pour ajouter un stream.')); return false; }
  if (!window.Twitch?.Player) { notice(tr('Le lecteur Twitch est indisponible. Recharge la page pour réessayer.')); return false; }
  const el = document.createElement('div');
  el.className = 'tile loading';
  el.dataset.login = s.twitch;
  el.innerHTML = `<div class="bar"><img class="stream-avatar" alt="" draggable="false"><b>${escapeHTML(s.display)}</b><div class="stream-info" hidden><span class="stream-category"></span><span class="stream-title"></span></div><span class="viewers"></span><button title="Afficher le chat" data-i18n-title="Afficher le chat" aria-label="Afficher le chat" data-i18n-aria-label="Afficher le chat" aria-expanded="false" class="chat-toggle"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg></button><details class="chat-options" hidden><summary title="Options du chat" data-i18n-title="Options du chat" aria-label="Options du chat" data-i18n-aria-label="Options du chat"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div class="chat-menu"><label><span data-i18n="Position du chat">Position du chat</span><select aria-label="Position du chat" data-i18n-aria-label="Position du chat"><option value="auto" data-i18n="Auto">Auto</option><option value="top" data-i18n="Top">Top</option><option value="bottom" data-i18n="Bottom">Bottom</option><option value="left" data-i18n="Left">Left</option><option value="right" data-i18n="Right">Right</option></select></label><a target="_blank" rel="noopener" data-i18n="Ouvrir sur Twitch ↗">Ouvrir sur Twitch ↗</a></div></details><button title="Play/pause" data-i18n-title="Play/pause" aria-label="Play/pause" data-i18n-aria-label="Play/pause" aria-pressed="false" class="pp"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="pause"><path d="M8 5v14M16 5v14"/></g><g class="play"><path d="M7 4v16l13-8z" fill="currentColor"/></g></svg></button><span class="snd-wrap"><button title="Son" data-i18n-title="Son" class="snd"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><g class="on"><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></g><g class="off"><path d="m23 9-6 6"/><path d="m17 9 6 6"/></g></svg></button><div class="volume"><input type="range" min="0" max="1" step="0.05" title="Volume" data-i18n-title="Volume" aria-label="Volume" data-i18n-aria-label="Volume"></div></span><button title="Spotlight" data-i18n-title="Spotlight" aria-pressed="false" class="spotlight"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="12" height="14" rx="1"/><rect x="17" y="5" width="4" height="6" rx="1"/><rect x="17" y="13" width="4" height="6" rx="1"/></svg></button><button title="Agrandir dans la fenêtre" data-i18n-title="Agrandir dans la fenêtre" class="fs"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g class="enter"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></g><g class="exit"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></g></svg></button><button title="Retirer" data-i18n-title="Retirer" class="close"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="tile-body"><div class="player"></div><section class="chat" hidden></section></div>`;
  const drop = document.createElement('div');
  drop.className = 'drop';
  drop.dataset.i18n = 'Déposer ici';
  drop.textContent = 'Drop here';
  el.append(drop);
  const [snd, spot, fs, close] = ['.snd', '.spotlight', '.fs', '.close'].map(selector => el.querySelector(selector));
  spot.onclick = e => { e.stopPropagation(); focus(s.twitch); };
  fs.onclick = e => { e.stopPropagation(); setExpanded(expanded === s.twitch ? null : s.twitch); };
  fs.title = tr('Agrandir dans la fenêtre');
  fs.setAttribute('aria-label', fs.title);
  fs.setAttribute('aria-pressed', 'false');
  const pp = el.querySelector('.pp'), vol = el.querySelector('.volume input'), volumeBox = el.querySelector('.volume');
  // An offline channel has nothing to play or pause: its button steps aside, and the global button leaves it alone.
  const ppIcon = () => { const paused = allPaused || tilePaused(t), offline = t.channel.online === false; pp.setAttribute('aria-pressed', String(paused)); pp.setAttribute('aria-disabled', String(offline)); pp.title = tr(offline ? 'Hors ligne' : paused ? 'Lecture' : 'Pause'); pp.setAttribute('aria-label', pp.title); };
  pp.onclick = e => { e.stopPropagation(); if (t.channel.online === false) return; if (allPaused || tilePaused(t)) resumeTile(t); else { t.paused = true; t.hoverSuppressed = true; } ppIcon(); sync(t); mark(t); save(); };
  vol.value = volume;
  vol.oninput = () => { t.volume = +vol.value; t.player?.setVolume(t.volume); setMuted(t, t.volume === 0); save(); };
  // one button, two states: a sound turned on here stays on until turned off here
  snd.onclick = e => { e.stopPropagation(); if (mutedAll) return; setMuted(t, !playerMuted(t)); save(); };
  const bar = el.querySelector('.bar');
  // A click on a paused still resumes it. The spotlight belongs to its header button alone.
  el.querySelector('.player').onclick = () => { if (allPaused || tilePaused(t)) { resumeTile(t); sync(t); save(); } };
  // The bar drags to reorder; a press on the volume slider must move the thumb, not the tile: the bar stops being
  // draggable while the pointer is on the slider, whatever the browser makes of a drag started inside an input.
  volumeBox.ondragstart = e => { e.preventDefault(); e.stopPropagation(); };
  volumeBox.onpointerenter = () => { bar.draggable = false; };
  volumeBox.onpointerleave = () => { bar.draggable = canDrag(s.twitch); };
  // Capture the pointer before it crosses an iframe. Native cross-document drops
  // are unreliable; the release position determines the destination instead.
  bar.ondragstart = e => e.preventDefault();
  bar.onpointerdown = e => {
    if (e.button !== 0 || !e.isPrimary || !canDrag(s.twitch) || e.target.closest('button, a, input, select, summary, .volume')) return;
    finishDrag();
    e.preventDefault();
    dragPointer = {bar, id:e.pointerId, login:s.twitch, startX:e.clientX, startY:e.clientY, x:e.clientX, y:e.clientY};
    bar.setPointerCapture(e.pointerId);
  };
  bar.onlostpointercapture = e => { if (dragPointer?.id === e.pointerId) finishDrag(); };
  close.disabled = isLiveGrid();
  close.onclick = e => { e.stopPropagation(); if (isLiveGrid()) return; remove(s.twitch); renderList(); };
  translateTree(el);
  grid.append(el);
  const t = { el, bar, visible: true, muted, volume, paused, chatOpen, chatPosition, ready: false, ppIcon, body: el.querySelector('.tile-body'), chat: el.querySelector('.chat'), chatOptions: el.querySelector('.chat-options') };
  el.addEventListener('mouseenter', () => { t.hovered = true; sync(t); });
  el.addEventListener('mouseleave', () => { t.hovered = false; t.hoverSuppressed = false; sync(t); });
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
  // Animate the header, never an ancestor of a live iframe: opacity blocks Twitch autoplay.
  if (restored && !matchMedia('(prefers-reduced-motion: reduce)').matches) bar.animate(
    [{opacity:0,transform:'translateY(-4px)'},{opacity:1,transform:'none'}], {duration:300,easing:'cubic-bezier(0.32, 0.72, 0, 1)'});
  return true;
}

function resumeTile(t) {
  if (allPaused) {
    tiles.forEach(other => { if (other !== t && other.channel.online !== false) { other.paused = true; other.ppIcon(); } });
    allPaused = false;
  }
  t.paused = false; t.ppIcon(); paintPlayAll();
}
// a still image instead of an idle iframe: paused without a hover
function showPoster(t) { return (t.channel.online === false || t.waitingForStatus) || (allPaused || tilePaused(t)) && !hoverPlayback(t); }
function previewImageURL(s) {
  if (s.online === false) return s.offlineUrl || '';   // the banner the channel set for its offline screen, when it has one
  const url = s.previewUrl || `https://static-cdn.jtvnw.net/previews-ttv/live_user_${s.twitch}-{width}x{height}.jpg`;
  return url.replace('{width}', '640').replace('{height}', '360') + (url.includes('?') ? '&' : '?') + 'v=' + Math.floor(Date.now() / 60000);
}
function updatePoster(t) {
  if (!t.cover) {
    t.cover = document.createElement('div'); t.cover.className = 'preview-cover';
    t.cover.innerHTML = '<img class="stream-poster" alt="" decoding="async" loading="lazy"><div class="preview-status" hidden><i class="preview-avatar"><img alt=""></i><span></span></div>';
    t.poster = t.cover.querySelector('.stream-poster');
    t.previewStatus = t.cover.querySelector('.preview-status');
    t.poster.onerror = () => { t.poster.hidden = true; };
  }
  t.previewStatus.querySelector('img').src = t.channel.profileUrl;
  if (!t.poster.isConnected || t.cover.classList.contains('gone') || document.hidden) return;
  const src = previewImageURL(t.channel);
  if (t.poster.getAttribute('src') === src) return;
  t.poster.hidden = !src;
  if (src) t.poster.src = src; else t.poster.removeAttribute('src');
  t.el.querySelector('.player').style.backgroundImage = src ? `url(${JSON.stringify(src)})` : '';
}
function releasePlayer(t) {
  readNativeControls(t);
  if (t.ready && t.controls) t.quality = t.player.getQuality?.();
  if (t.ready && t.controls) t.quality = t.player.getQuality?.();
  const player = t.player;
  // Invalidate callbacks before destroying the iframe, including delayed READY events.
  t.player = null; t.ready = false; t.previewing = false; t.hasPlayed = false;
  clearTimeout(t.timer);
  player?.destroy();
  const container = t.el.querySelector('.player');
  t.cover.classList.remove('gone');
  if (container.firstElementChild !== t.cover) container.replaceChildren(t.cover);
  t.el.classList.add('poster-only');
  updatePoster(t);
  fit(container);
  mark(t);
}

// Twitch only accepts the controls option when creating an embed. Recreate the changed
// tile, preserving its settings; all other iframes keep playing.
function mountPlayer(t, controls) {
  t.el.classList.toggle('full-player', controls);
  if (showPoster(t)) {
    releasePlayer(t);
    t.controls = controls; t.el.classList.toggle('full-player', controls); return;
  }
  if (t.player && t.controls === controls) return;
  readNativeControls(t);
  if (t.ready && t.controls) t.quality = t.player.getQuality?.();
  clearTimeout(t.timer);
  const previousPlayer = t.player; t.player = null; t.ready = false;
  previousPlayer?.destroy();
  const container = t.el.querySelector('.player');
  const embed = document.createElement('div'); embed.className = 'player-embed';
  t.cover.classList.remove('gone');
  // Keep the cover where it is: moving it in the DOM would restart the loading ring mid-turn.
  if (t.cover.parentElement === container) { for (const el of [...container.children]) if (el !== t.cover) el.remove(); container.prepend(embed); }
  else container.replaceChildren(embed, t.cover);
  updatePoster(t);
  t.el.classList.remove('poster-only');
  t.ready = false; t.controls = controls; t.hasPlayed = false;
  t.nativeAudio = null; t.pendingMute = null; t.nudged = false;
  t.playbackBlocked = false; t.playbackError = false;
  t.el.classList.remove('offline', 'partial');
  t.el.classList.toggle('loading', !allPaused && !tilePaused(t));
  t.commandedPlay = wantsPlayback(t);
  const player = new Twitch.Player(embed, {
    channel: t.el.dataset.login, parent: [location.hostname], width: '100%', height: '100%',
    muted: true, autoplay: false, controls
  });
  t.player = player;
  // The cover is outside Twitch's mount node, so iframe initialization cannot remove it.
  container.querySelector('iframe').title = tr('Stream de {name}', {name:t.channel.display});
  fit(container);   // Size the iframe before READY so it fits the tile from the first frame.
  const current = () => t.player === player && t.el.isConnected;
  player.addEventListener(Twitch.Player.READY, () => {
    if (!current()) return;
    t.ready = true; t.readyAt = Date.now();
    mark(t);
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
    if (event === 'offline') {
      updateTileInfo(t, { ...t.channel, online: false });
      sync(t);
      return;
    }
    if (event === 'playbackBlocked') t.playbackBlocked = true;
    if (event === 'playing' || event === 'offline' || event === 'error') t.playbackBlocked = false;
    if (event === 'error') t.playbackError = true;
    if (event === 'playing' || event === 'online') t.playbackError = false;
    if (event === 'playing') {
      t.hasPlayed = true;
      if (activated) applyMuted(t, t.muted);
    }
    if (controls && !hoverPlayback(t) && !(event === 'pause' && (allPaused || tilePaused(t))) && (t.hasPlayed || (event === 'play' && t.ready))) {
      if (event === 'pause' && !allPaused && onScreen(t) && !t.playbackBlocked) {
        // Firefox answers an unmute in a frame never clicked by pausing the media: blocked playback, not a pause the viewer chose
        if (Date.now() - (t.unmutedAt || 0) < 1000) t.playbackBlocked = true;
        else { t.paused = true; t.hoverSuppressed = true; }
      }
      if (event === 'play' && !t.commandedPlay) {
        t.paused = false;
        // A native Play resumes this stream even after the global pause.
        if (allPaused) {
          tiles.forEach(other => { if (other !== t && other.channel.online !== false) { other.paused = true; other.ppIcon(); } });
          allPaused = false; paintPlayAll();
        }
      }
      t.ppIcon(); save();
    }
    if (event === 'play') t.commandedPlay = false;
    if (event === 'pause' && showPoster(t)) sync(t);
    mark(t);
  });
}
function applyMuted(t, value) {
  value = !activated || hoverPlayback(t) || value;
  t.pendingMute = { value, at: Date.now() };
  if (!value) t.unmutedAt = Date.now();
  t.player.setMuted(value);
  paintSound(t);
}
function readNativeControls(t) {
  if (!t.controls || !t.ready || !t.hasPlayed || t.previewing) return;
  const audio = { muted: t.player.getMuted(), volume: t.player.getVolume() };
  let changed = false;
  if (t.pendingMute) {
    if (audio.muted === t.pendingMute.value || Date.now() - t.pendingMute.at > 2000) t.pendingMute = null;
  } else if (t.nativeAudio && audio.muted !== t.nativeAudio.muted) {
    if (mutedAll && !audio.muted) { setMuted(t, false); return; }   // silenced again: the global mute holds
    t.muted = audio.muted;
    changed = true;
  }
  if (t.nativeAudio && audio.volume !== t.nativeAudio.volume && Number.isFinite(audio.volume)) {
    t.volume = audio.volume; changed = true;
    t.el.querySelector('.volume input').value = t.volume;
  }
  t.nativeAudio = audio;
  if (changed) { paint(t); save(); }
}

const exitingTiles = new Set();
function animateRemoval(t) {
  if (!restored || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rect = t.el.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) return;
  // Only animate a static copy: destroy the real player and update membership immediately.
  const copy = t.el.cloneNode(true);
  copy.removeAttribute('data-login'); copy.removeAttribute('style');
  copy.classList.add('tile-exit'); copy.inert = true; copy.setAttribute('aria-hidden','true');
  copy.querySelectorAll('iframe, .chat, .volume, .load, .chat-menu, .collaboration-menu').forEach(el=>el.remove());
  copy.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  copy.querySelector('.tile-body').removeAttribute('data-chat-position');
  copy.querySelector('.player').replaceChildren(t.poster.cloneNode());
  Object.assign(copy.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',zIndex:'20',pointerEvents:'none'});
  document.body.append(copy); exitingTiles.add(copy);
  const finish = () => { copy.remove(); exitingTiles.delete(copy); };
  copy.animate([{opacity:1,transform:'none'},{opacity:0,transform:'scale(.97)'}],{duration:250,easing:'cubic-bezier(0.32, 0.72, 0, 1)'}).finished.then(finish,finish);
}

function remove(login, updateLayout = true, automatic = false) {
  if (!tiles.has(login) || (isLiveGrid() && !automatic)) return;
  if (updateLayout) animateRemoval(tiles.get(login));
  if (expanded === login) setExpanded(null);
  const player = tiles.get(login).player; tiles.get(login).player = null;
  player?.destroy();
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
  for (const copy of exitingTiles) { copy.getAnimations().forEach(animation=>animation.cancel()); copy.remove(); }
  exitingTiles.clear();
  for (const login of [...tiles.keys()]) remove(login, false, true);
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
  if (!m && t.volume === 0) {
    t.volume = 0.5;
    t.el.querySelector('.volume input').value = t.volume;
    t.player?.setVolume(t.volume);
  }
  t.muted = m; if (t.ready) applyMuted(t, m); paint(t);
}
function paint(t) {
  const spot = t.el.querySelector('.spotlight'), front = focused === t.el.dataset.login;
  spot.title = tr(front ? 'Revenir à la grille' : 'Spotlight'); spot.setAttribute('aria-label', spot.title); spot.setAttribute('aria-pressed', String(front));
  paintSound(t);
}
// Saved intent survives reloads; the icon reports whether the current player is actually unmuted.
function playerMuted(t) { return !activated || !t.ready || t.player.getMuted() || t.player.getVolume() === 0; }
function paintSound(t) {
  const muted = playerMuted(t), sound = muted ? 'muted' : 'on';
  t.el.classList.toggle('loud', !muted);
  // Under the global mute the sound controls step aside; aria-disabled keeps the hover, so the tooltip can say why.
  for (const button of t.el.querySelectorAll('.snd')) {
    button.title = tr(mutedAll ? 'Son coupé globalement' : muted ? 'Allumer le son' : 'Couper le son');
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-disabled', String(!!mutedAll));
    button.dataset.sound = sound;
  }
  t.el.querySelector('.volume input').disabled = !!mutedAll;
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
// The spotlight turns its sound on and, on the way out, gives back the state the tile had before. Other tiles keep theirs.
function focus(login) {
  if (expanded) setExpanded(null);
  if (tiles.size < 2) return;
  const prev = focused && tiles.get(focused);
  if (prev) {
    readNativeControls(prev);
    if (typeof prev.spotlightMuted === 'boolean') setMuted(prev, prev.spotlightMuted);
    prev.spotlightMuted = undefined;
  }
  focused = focused === login ? null : login;
  if (focused) { const t = tiles.get(focused); t.spotlightMuted = mutedAll ? mutedAll.includes(focused) ? false : true : t.muted; setMuted(t, false); }   // the intent counts under a global mute
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
  if (n < 2 && focused) { const t = tiles.get(focused); if (t && typeof t.spotlightMuted === 'boolean') { setMuted(t, t.spotlightMuted); t.spotlightMuted = undefined; } focused = null; }
  const frontOrder = focused ? [focused] : [], front = login => frontOrder.includes(login), count = frontOrder.length;
  const split = count > 0 && count < n;   // the spotlight beside a column of small ones
  if (expanded && n > 1 && !front(expanded)) setExpanded(null);
  grid.classList.toggle('single', n === 1);
  grid.classList.toggle('focused', split);
  for (const [login, t] of tiles) {
    t.el.classList.toggle('big', front(login));
    t.el.style.order = front(login) ? frontOrder.indexOf(login) : order.indexOf(login);
    t.ppIcon();
    t.bar.querySelector('.close').disabled = isLiveGrid();
    sync(t);
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
      grid.style.setProperty('--cols', sideCols);
      grid.style.setProperty('--side', wide ? '30vw' : '22vw');
      grid.style.removeProperty('--tile-h');
      grid.style.gridTemplateColumns = '';
      grid.style.gridTemplateRows = `repeat(${Math.max(Math.ceil((n - count) / sideCols), 1)}, var(--tile-h))`;
    }
    // The grid's reserved front cell excludes the scrollbar. Using the outer grid width overlaps side players.
    w = parseFloat(getComputedStyle(grid, '::before').width);
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
    grid.style.gridTemplateRows = `repeat(${rows}, calc((100% - ${2 * (rows - 1)}px) / ${rows}))`;   // the gaps come out of the rows, or the last one scrolls by 2px
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
  tiles.forEach(paint);
}
$('#muteall').onclick = () => {
  tiles.forEach(readNativeControls);
  if (mutedAll) { const loud = mutedAll; mutedAll = null; for (const login of loud) if (tiles.has(login)) setMuted(tiles.get(login), false); }
  else { const loud = [...tiles].filter(([, t]) => !t.muted).map(([login]) => login); tiles.forEach(t => setMuted(t, true)); mutedAll = loud; }
  paintMuteAll(); save();
};
$('#playall').onclick = () => {
  // A quick shortcut, not a lock like the global mute: pause stops every tile, play resumes every tile, and each
  // tile's own button can override it afterwards.
  allPaused = !gridPaused();
  tiles.forEach(t => { if (!allPaused && t.channel.online !== false) t.paused = false; if (allPaused) t.hoverSuppressed = !!t.hovered; t.ppIcon(); });
  paintPlayAll(); tiles.forEach(sync); save();
};
let unloading = false;
onpagehide = () => { unloading = true; saveCurrentLayout(); };
// Keep accessible labels while suppressing tooltips that would cover Twitch players.
function stashTitle(el) {
  if (!el.hasAttribute('title')) return;
  el.dataset.tip = el.getAttribute('title');
  if (el.matches('button, summary, input, select, a') && (!el.hasAttribute('aria-label') || el.dataset.tipLabel === 'true')) {
    el.setAttribute('aria-label', el.dataset.tip);
    el.dataset.tipLabel = 'true';
  }
  el.removeAttribute('title');
}
function syncTooltipTitles(root = document) {
  const selector = '[title]:not(iframe)';
  if (root.matches?.(selector)) stashTitle(root);
  for (const el of root.querySelectorAll(selector)) stashTitle(el);
}
new MutationObserver(records => {
  for (const record of records) {
    if (record.type === 'childList') {
      for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) syncTooltipTitles(node);
    } else if (record.target.tagName !== 'IFRAME') stashTitle(record.target);
  }
}).observe(document.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:['title']});
addEventListener('preferenceschange', () => syncTooltipTitles());
syncTooltipTitles();
onpageshow = () => { unloading = false; };
function tick() {
  // An iframe can gain focus without a window blur, including after a reload.
  if (document.activeElement?.tagName === 'IFRAME') { closeTileMenus(); if (!activated) activate(); }
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
function push() { tiles.forEach(t => { if (!t.ready || !wantsPlayback(t) || (t.controls && t.hasPlayed && !t.playbackBlocked && (t.muted || !t.player.getMuted()))) return; applyMuted(t, t.muted); sync(t); }); }
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
let dragPointer = null, dragScrollFrame = null;
function dragTarget(x, y) {
  const tile = document.elementFromPoint(x, y)?.closest('#grid > .tile');
  return tile && canDrop(tile.dataset.login) ? tile : null;
}
function createDragGhost() {
  const ghost = document.createElement('div');
  ghost.className = 'tile drag-ghost';
  ghost.inert = true;
  ghost.setAttribute('aria-hidden', 'true');
  const header = dragPointer.bar.cloneNode(true);
  header.draggable = false;
  for (const el of [header, ...header.querySelectorAll('*')]) {
    for (const name of ['id', 'title', 'data-tip']) el.removeAttribute(name);
  }
  for (const control of header.querySelectorAll('button, details, .snd-wrap, .stream-info, .viewers')) control.remove();
  const tile = tiles.get(dragPointer.login), preview = document.createElement('div');
  preview.className = 'drag-preview';
  const poster = document.createElement('img'), src = previewImageURL(tile.channel);
  poster.className = 'drag-poster'; poster.alt = '';
  if (src) poster.src = src;
  else poster.hidden = true;
  const fallback = document.createElement('div');
  fallback.className = 'drag-preview-status';
  const avatar = document.createElement('img'); avatar.src = tile.channel.profileUrl; avatar.alt = '';
  fallback.append(avatar);
  if (tile.channel.online === false) {
    const label = document.createElement('span'); label.textContent = tr('Hors ligne'); fallback.append(label);
  }
  fallback.hidden = !!src && tile.channel.online !== false;
  poster.onerror = () => { poster.hidden = true; fallback.hidden = false; };
  preview.append(poster, fallback);
  ghost.append(header, preview);
  ghost.style.width = Math.min(dragPointer.bar.getBoundingClientRect().width * .55, 200, innerWidth - 16) + 'px';
  document.body.append(ghost);
  dragPointer.ghost = ghost;
}
function positionDragGhost() {
  const ghost = dragPointer.ghost;
  const width = ghost.offsetWidth, height = ghost.offsetHeight;
  const spotlight = focused && tiles.get(focused)?.el.getBoundingClientRect();
  const candidates = [[14,14], [14,-height-14], [-width-14,14], [-width-14,-height-14]].map(([dx,dy]) => {
    const x = Math.max(8, Math.min(dragPointer.x + dx, innerWidth - width - 8));
    const y = Math.max(8, Math.min(dragPointer.y + dy, innerHeight - height - 8));
    const overlap = spotlight ? Math.max(0, Math.min(x + width + 8, spotlight.right) - Math.max(x - 8, spotlight.left)) * Math.max(0, Math.min(y + height + 8, spotlight.bottom) - Math.max(y - 8, spotlight.top)) : 0;
    return {x, y, overlap};
  });
  // Prefer the lower right, but keep the miniature off the spotlight when possible.
  const {x, y} = candidates.reduce((best, next) => next.overlap < best.overlap ? next : best);
  ghost.style.transform = `translate(${x}px, ${y}px)`;
}
function highlightDrop() {
  const target = dragTarget(dragPointer.x, dragPointer.y);
  for (const t of tiles.values()) t.el.classList.toggle('over', t.el === target);
}
function scrollDrag() {
  if (!dragPointer || !dragging) return;
  const {x, y} = dragPointer, box = grid.getBoundingClientRect();
  const target = document.elementFromPoint(x, y)?.closest('.tile');
  if (x >= box.left && x < box.right && !target?.classList.contains('big')) {
    const speed = y < box.top + 32 ? -12 : y > box.bottom - 32 ? 12 : 0;
    if (speed && y >= box.top && y <= box.bottom) { grid.scrollTop += speed; highlightDrop(); }
  }
  dragScrollFrame = requestAnimationFrame(scrollDrag);
}
function finishDrag() {
  const pointer = dragPointer;
  dragPointer = null;
  pointer?.ghost?.remove();
  dragging = null;
  cancelAnimationFrame(dragScrollFrame);
  dragScrollFrame = null;
  if (pointer?.bar.hasPointerCapture(pointer.id)) pointer.bar.releasePointerCapture(pointer.id);
  document.body.classList.remove('dragging');
  document.querySelectorAll('.tile.over, .tile.drop-target, .tile.dragged').forEach(t => t.classList.remove('over', 'drop-target', 'dragged'));
}
addEventListener('pointermove', e => {
  if (!dragPointer || e.pointerId !== dragPointer.id) return;
  if (!(e.buttons & 1)) { finishDrag(); return; }
  dragPointer.x = e.clientX; dragPointer.y = e.clientY;
  if (!dragging) {
    if (Math.hypot(e.clientX - dragPointer.startX, e.clientY - dragPointer.startY) < 5) return;
    dragging = dragPointer.login;
    createDragGhost();
    document.body.classList.add('dragging');
    for (const [login, t] of tiles) { t.el.classList.toggle('drop-target', canDrop(login)); t.el.classList.toggle('dragged', login === dragging); }
    dragScrollFrame = requestAnimationFrame(scrollDrag);
  }
  positionDragGhost();
  highlightDrop();
});
addEventListener('pointerup', e => {
  if (!dragPointer || e.pointerId !== dragPointer.id) return;
  const from = dragging, to = from && dragTarget(e.clientX, e.clientY)?.dataset.login;
  finishDrag();
  if (to && tiles.has(from)) move(from, to);
});
addEventListener('pointercancel', e => { if (dragPointer?.id === e.pointerId) finishDrag(); });
addEventListener('blur', finishDrag);
new ResizeObserver(() => { if (restored) { resizing = true; layout(); resizing = false; } }).observe(grid);   // window resizes and sidebar toggles both change the grid box
grid.addEventListener('scroll', () => closeTileMenus(), { passive: true });
document.onfullscreenchange = () => tiles.forEach(t => { fit(t.el.querySelector('.player')); sync(t); });
document.onkeydown = e => { if (e.key === 'Escape') { if (dragPointer) { e.preventDefault(); finishDrag(); return; } if (closeTileMenus(true)) { e.preventDefault(); return; } if (expanded) setExpanded(null); else if (previewRow) hidePreview(); else if (focused) focus(focused); } };
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
  // The stream joins the grid, nothing more: no spotlight, no sound, and the pauses stay as they are.
  if (!tiles.has(login)) add(s);
  const t = tiles.get(login);
  if (!t) return;
  if (expanded) setExpanded(null);   // an expanded tile would hide the newcomer
  if (innerWidth <= 700) document.body.classList.add('collapsed');
  dismissLiveNotification(login);
  renderList(); save();
  t.el.scrollIntoView({ block: 'nearest' });
  t.bar.querySelector('.spotlight').focus({ preventScroll: true });
}
function updateLiveNotifications(channels) {
  pruneLiveNotifications(channels);
  for (const s of channels) {
    if (!isLiveGrid() && s.online && lastLiveStatus.get(s.twitch) === false && !liveNotifications.has(s.twitch)) {
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
  // Placeholder rows while the first follows or a search are on their way; a status still unknown pulses in its row.
  const pending = searching || (connected && !lastFollows && refreshInFlight);
  const rowHeight = 44;   // avatar 28px plus the channel button's padding: the loading rows fill the list down to the fold
  const skeleton = Array.from({ length: pending ? Math.max(2, Math.ceil((list.clientHeight || 600) / rowHeight) - rows.length) : 0 }, () => {
    const li = document.createElement('li'); li.className = 'skeleton'; li.setAttribute('aria-hidden', 'true');
    li.innerHTML = '<span class="channel"><i></i><span class="n"><b></b><small></small></span></span>';
    return li;
  });
  list.replaceChildren(...rows.map(s => {
    const li = document.createElement('li'); li.dataset.login = s.twitch;
    li.className = (s.online === true ? 'live' : s.online === false ? 'off' : '') + (tiles.has(s.twitch) ? ' on' : '') + (s.online == null && refreshInFlight ? ' pending' : '');
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
    li.querySelector('.g').textContent = [s.online === false ? tr('Hors ligne') : '', s.game].filter(Boolean).join(' · ') || tr('Chaîne Twitch');
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
  }), ...skeleton);
  if (previewRow) {
    const row = [...list.children].find(li => li.dataset.login === previewRow.dataset.login);
    const s = streamers.find(s => s.twitch === previewRow.dataset.login);
    if (!row || !s || (!preview.hidden && s.online !== previewOnline)) hidePreview();
    else { previewRow = row; if (!preview.hidden) { row.setAttribute('aria-describedby', 'preview'); previewInfo(s); positionPreview(); } }
  }
  if (keyboardLogin) [...list.children].find(li => li.dataset.login === keyboardLogin)?.querySelector(keyboardFavorite ? '.favorite' : '.channel').focus({ preventScroll: true });
  $('#list-empty').hidden = rows.length > 0 || pending || (!q && !connected);
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
  if (!lastFollows || streamers.some(s => s.online == null)) renderList();   // show the rows as loading
  try {
    let nextChannels = connected ? follows : favorites;
    const reloadFollows = connected && Date.now() - lastFollows > 60000;
    if (reloadFollows) nextChannels = await library.follows();
    const logins = [...new Set([...nextChannels, ...order.map(twitch => ({ twitch }))].map(s => s.twitch))];
    const live = await library.live(logins);
    if (version !== accountVersion) return;
    const update = s => channel({ ...s, profileUrl: library.profiles.get(s.twitch)?.profileUrl || s.profileUrl, offlineUrl: library.profiles.get(s.twitch)?.offlineUrl || s.offlineUrl || '', online: live.has(s.twitch), previewUrl: (connected ? live.get(s.twitch)?.thumbnail_url : live.get(s.twitch)?.preview_url) || s.previewUrl || '', game: live.get(s.twitch)?.game_name || '', title: live.get(s.twitch)?.title || '', viewer_count: live.get(s.twitch)?.viewer_count ?? 0 });
    if (connected) follows = nextChannels.map(update);
    else favorites = favorites.map(s => logins.includes(s.twitch) ? update(s) : s);
    results = results.map(s => logins.includes(s.twitch) ? update(s) : s);
    if (reloadFollows) lastFollows = Date.now();
    rebuild(); if (connected || $('#notice').textContent === tr(statusUnavailable)) notice();
    for (const [login, t] of tiles) if (logins.includes(login)) updateTileInfo(t, update(t.channel));
    syncLiveGrid();
    updateLiveNotifications(connected ? follows : favorites);
    refreshCollaborations();
  } catch (error) {
    if (version === accountVersion) {
      if (connected) handleError(error);
      else notice(statusUnavailable);
    }
  } finally {
    refreshInFlight = false;
    if (version === accountVersion) for (const t of tiles.values()) if (t.waitingForStatus) {
      // A failed lookup leaves the status unknown; let Twitch try instead of waiting forever.
      t.waitingForStatus = false;
      sync(t);
    }
    if (version === accountVersion && (!lastFollows || streamers.some(s => s.online == null))) renderList();   // loading rows step aside
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
function refreshPosters() {
  if (document.hidden) return;
  for (const t of tiles.values()) if (t.poster?.isConnected) updatePoster(t);
}
setInterval(refreshPosters, 60000);
setInterval(() => { if (!document.hidden) refresh(); }, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { tiles.forEach(sync); refreshPosters(); refresh(); }
});
setInterval(async () => {
  if (!library?.user) return;
  try { await library.validate(); } catch (error) { disconnect(false); notice(error.message); }
}, 3600000);
