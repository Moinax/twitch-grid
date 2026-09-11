import { playerConstructor } from "../services/player";
import type { WorkspaceActions } from "../types/actions";
import { WordReveal } from "../components/WordReveal";
import { watchForUpdates } from "./updates";
import { syncPlayerTooltips } from "./tooltips";
import { createPreviewController } from "./preview";
import { fit, layoutChat, nameFrame, previewImageURL } from "./videoLayout";
import { createLifecycle } from "./lifecycle";
import type {
  AccountMode,
  Channel,
  ChatPosition,
  Collaboration,
  GridAction,
  LayoutSnapshot,
  SavedGrid,
} from "../types/domain";
import type { Tile, DragPointer } from "../types/player";
import { HttpError } from "../services/library";
import { type WorkspaceViews } from "../components/render";
import { StreamTile } from "../components/StreamTile";
import { ChannelList } from "../components/ChannelList";
import { CollaborationParticipants } from "../components/CollaborationParticipants";
import { LiveNotification } from "../components/LiveNotification";
import { SavedGridList } from "../components/SavedGridList";
import {
  preferences,
  tr,
  translateTree,
  relocalizeMessage,
  setPreference,
} from "../services/preferences";
import {
  channel,
  readStored,
  writeStored,
  validLogin,
  TwitchLibrary,
  numberFormat,
  refreshNumberFormat,
} from "../services/library";
import { GridStore } from "../services/grids";

export function startWorkspace(
  views: WorkspaceViews,
  actions: WorkspaceActions,
) {
  const lifecycle = createLifecycle();
  const {
    setTimeout,
    setInterval,
    ResizeObserver,
    IntersectionObserver,
    addEventListener,
  } = lifecycle;
  function listenDocument<K extends keyof DocumentEventMap>(
    type: K,
    callback: (event: DocumentEventMap[K]) => void,
  ) {
    document.addEventListener(type, callback, { signal: lifecycle.signal });
  }
  const clearTimeout = (id: number | null | undefined) =>
    window.clearTimeout(id ?? undefined);
  function $<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Missing workspace element: ${selector}`);
    return element;
  }
  const list = $("#list"),
    grid = $("#grid");
  const tiles = new Map<string, Tile>(); // twitch login -> { el, player, bar }
  let streamers: Channel[] = [],
    focused: string | null = null,
    locked = false,
    mutedAll: string[] | null = null,
    expanded: string | null = null,
    order: string[] = [],
    dragging: string | null = null,
    allPaused = false,
    restored = false,
    layoutMode: AccountMode | null = null;
  const collaborations = new Map<string, Collaboration>();

  // everything needed to come back to the same screen: tile order, zoom, global pause, sidebar, per-tile mute
  // Small tiles use our controls; the spotlight also reads changes made in the native Twitch player.
  let gridStore: GridStore | null = null,
    liveLayoutToRestore: LayoutSnapshot | null = null;
  function isLiveGrid() {
    return gridStore?.activeId === "live-follows";
  }
  // null keeps the automatic grid's size-dependent default; booleans are manual choices.
  function tilePaused(t: Tile) {
    return t.paused ?? (isLiveGrid() && tiles.size >= 9);
  }
  function hoverPlayback(t: Tile) {
    if (
      preferences.player === "custom" ||
      t.nativeHold ||
      t.hoverSuppressed ||
      tiles.size === 1 ||
      t.el.dataset.login === focused ||
      t.el.dataset.login === expanded
    )
      return false;
    return (
      t.hovered && t.channel.online !== false && (allPaused || tilePaused(t))
    );
  }
  function wantsPlayback(t: Tile) {
    return (
      !document.hidden &&
      !document.body.classList.contains("landing") &&
      $("#audio-overlay").hidden &&
      !showPoster(t) &&
      ((!allPaused && !tilePaused(t)) || hoverPlayback(t)) &&
      onScreen(t)
    );
  }
  function syncLiveGrid() {
    if (!restored || !isLiveGrid()) return;
    for (const login of liveNotifications.keys())
      dismissLiveNotification(login);
    if (liveLayoutToRestore && !lastFollows) return; // Wait for the first verified list before restoring saved settings.
    const live = follows.filter((s) => s.online);
    batching = true;
    if (liveLayoutToRestore) {
      const snapshot = liveLayoutToRestore;
      const byLogin = new Map(live.map((s) => [s.twitch, s]));
      for (const login of Array.isArray(snapshot.order)
        ? [...new Set(snapshot.order)]
        : []) {
        if (byLogin.has(login))
          restoreChannel(byLogin.get(login)!, snapshot, true);
      }
      focused =
        snapshot.focused && tiles.has(snapshot.focused)
          ? snapshot.focused
          : null;
      liveLayoutToRestore = null;
    }
    for (const s of live)
      if (!tiles.has(s.twitch)) add(s, true, 0.5, null, false, "auto", true);
    batching = false;
    for (const login of [...tiles.keys()])
      if (!follows.some((s) => s.twitch === login)) remove(login, true, true);
    layout();
    renderList();
  }
  // the global button reads as paused when it was pressed, or when every tile ended up paused on its own
  function gridPaused() {
    const live = [...tiles.values()].filter((t) => t.channel.online !== false);
    return allPaused || (live.length > 0 && live.every(tilePaused));
  }
  function paintPlayAll() {
    $<HTMLButtonElement>("#playall").setAttribute(
      "aria-pressed",
      String(gridPaused()),
    );
  }
  function currentLayout() {
    return {
      order: [...order],
      focused,
      locked,
      mutedAll,
      allPaused,
      channels: order.map((login) => {
        const { twitch, display, profileUrl, previewUrl, offlineUrl } =
          tiles.get(login)!.channel;
        return { twitch, display, profileUrl, previewUrl, offlineUrl };
      }),
      collapsed: document.body.classList.contains("collapsed"),
      ...Object.fromEntries(
        (
          [
            "muted",
            "spotlightMuted",
            "volume",
            "paused",
            "chatOpen",
            "chatPosition",
          ] as const
        ).map((key) => [
          key,
          Object.fromEntries([...tiles].map(([login, t]) => [login, t[key]])),
        ]),
      ),
    };
  }
  function save() {
    if (!restored || (isLiveGrid() && liveLayoutToRestore)) return;
    paintPlayAll();
    const snapshot = currentLayout();
    writeStored("tg.layout." + layoutMode, snapshot);
    if (gridStore && !gridStore!.save(snapshot))
      notice(tr("Impossible d’enregistrer dans ce navigateur."));
    renderGridLauncher();
  }
  function saveCurrentLayout() {
    tiles.forEach(readNativeControls);
    save();
  }
  function restoreChannel(
    s: Channel,
    snapshot: LayoutSnapshot,
    automatic = false,
  ) {
    const login = s.twitch;
    // Older layouts stored chat settings once for the entire grid.
    const perTile = <T,>(value: T | Record<string, T>): T | undefined =>
      value && typeof value === "object"
        ? (value as Record<string, T>)[login]
        : (value as T);
    const position = perTile(snapshot.chatPosition);
    const chatPosition =
      position === "below"
        ? "bottom"
        : ["auto", "top", "bottom", "left", "right"].includes(position || "")
          ? (position as ChatPosition)
          : "auto";
    const paused = snapshot.paused?.[login];
    add(
      s,
      !!mutedAll || (snapshot.muted?.[login] ?? true),
      snapshot.volume?.[login] ?? 0.5,
      typeof paused === "boolean" ? paused : automatic ? null : false,
      perTile(snapshot.chatOpen) === true,
      chatPosition,
      automatic,
    );
    if (tiles.has(login)) tiles.get(login)!.waitingForStatus = s.online == null;
    const before = snapshot.spotlightMuted?.[login];
    if (typeof before === "boolean" && tiles.has(login))
      tiles.get(login)!.spotlightMuted = before; // what the spotlight gives back on the way out
  }
  function restore() {
    if (!layoutMode || restored || !playerConstructor()) return;
    const st =
      gridStore?.active.layout ||
      readStored<LayoutSnapshot>("tg.layout." + layoutMode, {});
    const savedChannels = Array.isArray(st.channels) ? st.channels : [];
    allPaused = !!st.allPaused;
    mutedAll = Array.isArray(st.mutedAll)
      ? st.mutedAll.filter(validLogin)
      : null; // a global mute outranks whatever the tiles saved
    batching = true;
    liveLayoutToRestore = isLiveGrid() ? structuredClone(st) : null;
    for (const login of !isLiveGrid() && Array.isArray(st.order)
      ? [...new Set(st.order)].filter(validLogin)
      : []) {
      const s =
        streamers.find((x) => x.twitch === login) ||
        channel(
          savedChannels.find((x) => x?.twitch === login) || { twitch: login },
        );
      if (s) restoreChannel(s, st);
    }
    batching = false;
    focused = st.focused && tiles.has(st.focused) ? st.focused : null;
    locked = isLiveGrid() || st.locked === true;
    paintMuteAll();
    paintPlayAll();
    document.body.classList.toggle(
      "collapsed",
      st.collapsed ?? innerWidth <= 700,
    );
    layout();
    tick(); // right away, not at the first second: a click that lands before it hits the page instead of the video
    restored = true;
    syncLiveGrid();
    syncChat();
    refreshCollaborations();
    save();
    // A late SDK load can restore channels after the initial status request has finished.
    queueMicrotask(() => {
      if ([...tiles.values()].some((t) => t.waitingForStatus)) refresh();
    });
  }
  function switchLayout(mode: AccountMode) {
    if (layoutMode === mode) {
      restore();
      return;
    }
    saveCurrentLayout();
    restored = false;
    clearTiles();
    layoutMode = mode;
    const key = "tg.layout." + mode,
      legacy = readStored<LayoutSnapshot | null>("tg.layout", null);
    if (legacy && writeStored(key, readStored(key, null) ?? legacy)) {
      try {
        localStorage.removeItem("tg.layout");
      } catch {
        /* The in-memory layout remains usable. */
      }
    }
    gridStore = new GridStore(mode);
    renderGridLauncher();
    allPaused = false;
    locked = false;
    mutedAll = null;
    paintMuteAll();
    paintPlayAll();
    layout();
    restore();
    tick();
  }

  function loadPlayer() {
    const script = document.createElement("script");
    script.src = "https://player.twitch.tv/js/embed/v1.js";
    script.onload = () => {
      restore();
      for (const t of tiles.values()) sync(t);
    };
    script.onerror = () => {
      if (preferences.player === "embed" && !$("#notice").textContent)
        notice(
          tr(
            "Le lecteur Twitch est indisponible. La connexion et la recherche restent accessibles.",
          ),
        );
    };
    document.head.append(script);
    lifecycle.signal.addEventListener("abort", () => {
      script.onload = null;
      script.onerror = null;
      script.remove();
    });
  }

  // a tile plays only while it is in the viewport and the global toggle is not paused
  const ro = new ResizeObserver((es) =>
    es.forEach((e) => fit(e.target as HTMLElement)),
  );
  const chatResize = new ResizeObserver((es) =>
    es.forEach((e) => {
      const t = tiles.get(
        (e.target as HTMLElement).closest<HTMLElement>(".tile")!.dataset.login!,
      );
      if (t && !t.chat.hidden) layoutChat(t);
    }),
  );

  function syncChat() {
    for (const [login, t] of tiles) {
      const allowed = t.controls && t.chatFits,
        visible = restored && t.chatOpen && allowed;
      t.chat.hidden = !visible;
      t.chatOptions.hidden = !allowed;
      if (!allowed) t.chatOptions.open = false;
      t.chatOptions.querySelector<HTMLSelectElement>("select")!.value =
        t.chatPosition;
      const button = t.bar.querySelector<HTMLButtonElement>(".chat-toggle")!;
      button.hidden = !allowed;
      button.setAttribute("aria-expanded", String(visible));
      button.title = visible ? tr("Masquer le chat") : tr("Afficher le chat");
      button.setAttribute("aria-label", button.title);
      if (!visible) {
        t.chat
          .querySelector<HTMLIFrameElement | HTMLVideoElement>("iframe, video")
          ?.remove();
        delete t.body.dataset.chatPosition;
        continue;
      }
      const chatSrc =
        `https://www.twitch.tv/embed/${login}/chat?parent=${encodeURIComponent(location.hostname)}` +
        (document.documentElement.dataset.theme === "dark"
          ? "&darkpopout=1"
          : "");
      if (
        !t.chat.querySelector<HTMLIFrameElement | HTMLVideoElement>(
          "iframe, video",
        )!
      ) {
        const frame = document.createElement("iframe");
        frame.src = chatSrc;
        frame.title = tr("Chat de {name}", { name: t.channel.display });
        t.chat.append(frame);
      }
      if (
        t.chat.querySelector<HTMLIFrameElement | HTMLVideoElement>(
          "iframe, video",
        )!.src !== chatSrc
      )
        t.chat.querySelector<HTMLIFrameElement | HTMLVideoElement>(
          "iframe, video",
        )!.src = chatSrc;
      layoutChat(t);
    }
  }
  function closeTileMenus(returnFocus = false, except: Element | null = null) {
    let closed = false;
    for (const menu of document.querySelectorAll<HTMLDetailsElement>(
      ".chat-options[open], .collaboration[open], #grid-switcher[open]",
    )) {
      if (menu === except) continue;
      menu.open = false;
      if (returnFocus) menu.querySelector<HTMLElement>("summary")!.focus();
      closed = true;
    }
    return closed;
  }
  addEventListener("pointerdown", (e) =>
    closeTileMenus(
      false,
      (e.target as Element).closest(
        ".chat-options, .collaboration, #grid-switcher",
      ),
    ),
  );

  function positionCollaborationMenu(t: Tile) {
    const anchor = t.collaboration
      .querySelector<HTMLElement>("summary")!
      .getBoundingClientRect();
    const menu = t.collaboration.querySelector<HTMLElement>(
      ".collaboration-menu",
    )!;
    const width = Math.min(320, innerWidth - 24);
    const below = innerHeight - anchor.bottom - 18;
    const above = below < 180 && anchor.top > below;
    const height = Math.max(0, Math.min(400, above ? anchor.top - 18 : below));
    menu.style.width = width + "px";
    menu.style.left =
      Math.max(12, Math.min(anchor.right - width, innerWidth - width - 12)) +
      "px";
    menu.style.maxHeight = height + "px";
    menu.style.top = above ? "auto" : anchor.bottom + 6 + "px";
    menu.style.bottom = above ? innerHeight - anchor.top + 6 + "px" : "auto";
  }
  function updateCollaborationButtons(t: Tile) {
    if (!t.collaboration) return;
    views.render(
      t.collaboration.querySelector<HTMLElement>(".collaboration-list")!,
      <CollaborationParticipants
        participants={t.participants}
        selected={new Set(tiles.keys())}
        locked={locked}
        onAdd={(s) => addCollaborators([s])}
      />,
    );
    t.collaboration.querySelector<HTMLButtonElement>(
      ".create-collaboration-grid",
    )!.disabled = !t.participants.some((s) => s.online);
    t.collaboration.querySelector<HTMLButtonElement>(
      ".add-collaboration",
    )!.disabled =
      locked || !t.participants.some((s) => s.online && !tiles.has(s.twitch));
  }
  function addCollaborators(participants: Channel[]) {
    const missing = participants.filter(
      (s) => s.online && !tiles.has(s.twitch),
    );
    if (!missing.length || locked) return;
    // Keep the existing single player in the spotlight when its partners are added.
    if (tiles.size === 1) focused = order[0];
    for (const participant of missing) add(participant);
    renderList();
    save();
  }
  function renderCollaboration(t: Tile, participants: Channel[]) {
    t.participants = [
      ...new Map(
        participants
          .filter((s) => validLogin(s.twitch))
          .map((s) => [s.twitch, s]),
      ).values(),
    ];
    const available = t.participants.some(
      (s) => s.twitch !== t.el.dataset.login!,
    );
    t.collaboration.hidden = !available;
    if (!available) t.collaboration.open = false;
    t.collaboration.querySelector<HTMLElement>(
      ".collaboration-count",
    )!.textContent = String(t.participants.length);
    t.collaboration.querySelector<HTMLElement>("summary")!.setAttribute(
      "aria-label",
      tr("Collaboration : {count} participants", {
        count: t.participants.length,
      }),
    );
    t.collaboration.querySelector<HTMLElement>(
      ".collaboration-heading",
    )!.textContent = tr("Collaboration : {count} participants", {
      count: t.participants.length,
    });
    const rows = t.collaboration.querySelector<HTMLElement>(
      ".collaboration-list",
    )!;
    const focusedLogin = rows.contains(document.activeElement)
      ? document.activeElement?.closest<HTMLElement>(".collaboration-row")
          ?.dataset.participant
      : null;
    updateCollaborationButtons(t);
    if (focusedLogin)
      rows
        .querySelector<HTMLElement>(
          `[data-participant="${focusedLogin}"] button:not(:disabled)`,
        )
        ?.focus({ preventScroll: true });
  }
  function setupCollaboration(t: Tile) {
    const menu = t.collaboration;
    translateTree(menu);
    menu.onclick = (e) => e.stopPropagation();
    menu.ondragstart = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    menu.ontoggle = () => {
      if (menu.open) {
        closeTileMenus(false, menu);
        positionCollaborationMenu(t);
      }
    };
    menu.querySelector<HTMLButtonElement>(
      ".create-collaboration-grid",
    )!.onclick = () =>
      openGridForm("collaboration", null, t.participants, t.channel);
    menu.querySelector<HTMLButtonElement>(".add-collaboration")!.onclick = () =>
      addCollaborators(t.participants);
  }
  let collaborationRefreshInFlight = false;
  async function refreshCollaborations() {
    if (
      lifecycle.disposed ||
      !restored ||
      !library ||
      collaborationRefreshInFlight ||
      document.hidden
    )
      return;
    const candidates = new Map(
      [...streamers, ...[...tiles.values()].map((t) => t.channel)].map((s) => [
        s.twitch,
        s,
      ]),
    );
    const queue = [...candidates.values()]
      .filter(
        (s) =>
          (s.online || (tiles.has(s.twitch) && s.online !== false)) &&
          (!collaborations.has(s.twitch) ||
            Date.now() - collaborations.get(s.twitch)!.checkedAt >= 60000),
      )
      .map((s) => s.twitch);
    if (!queue.length) return;
    collaborationRefreshInFlight = true;
    const version = accountVersion;
    try {
      await Promise.all(
        Array.from({ length: Math.min(3, queue.length) }, async () => {
          while (queue.length && version === accountVersion) {
            const login = queue.shift()!;
            let participants: Channel[];
            try {
              participants = await library.collaboration(login);
            } catch {
              participants = [];
            }
            if (version !== accountVersion) return;
            participants = [
              ...new Map(
                participants
                  .filter((s) => validLogin(s.twitch))
                  .map((s) => [s.twitch, s]),
              ).values(),
            ];
            collaborations.set(login, { checkedAt: Date.now(), participants });
            const t = tiles.get(login)!;
            if (t)
              renderCollaboration(
                t,
                t.channel.online === false ? [] : participants,
              );
            renderList();
          }
        }),
      );
    } finally {
      collaborationRefreshInFlight = false;
      for (const [login, result] of collaborations)
        if (!candidates.has(login) && Date.now() - result.checkedAt > 300000)
          collaborations.delete(login);
      // Channels added during the requests also need their first check.
      refreshCollaborations();
    }
  }
  // the player tracks its own viewability and refuses to start under half visible, whatever play() says: below that
  // a tile shows "scroll" instead of a spinner that would never end. ponytail: 0.5 mirrors the player's bar, raise if a
  // half-visible tile still spins
  const io = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        const t = tiles.get((e.target as HTMLElement).dataset.login!)!;
        if (t) {
          t.visible = e.intersectionRatio >= 0.5;
          sync(t);
          mark(t);
        }
      }),
    { root: grid, threshold: 0.5 },
  );
  // a relayout flickers visibility for a frame or two: let it settle before touching the player
  // Expanded and front tiles sit fixed over the grid's box, outside its containing block, so the observer never sees
  // them: they are on screen by construction. A tile with its sound on keeps playing wherever it is, the sound is the point
  const inFullscreen = (t: Tile) =>
    !!document.fullscreenElement && t.el.contains(document.fullscreenElement);
  const seen = (t: Tile) =>
    inFullscreen(t) ||
    t.visible ||
    t.el.classList.contains("big") ||
    expanded === t.el.dataset.login!;
  const onScreen = (t: Tile) => seen(t) || !t.muted;
  // Firefox refuses an audible (re)start in an iframe that was never clicked, and the player then sits paused for good:
  // start muted, always allowed, and the watchdog gives the sound back once it plays (no restart in that)
  function start(t: Tile) {
    if (!t.ready || !wantsPlayback(t)) return;
    const wasPreviewing = t.previewing;
    t.previewing = hoverPlayback(t);
    if (
      t.previewing ||
      (!t.muted && t.player!.getPlayerState().playback !== "Playing")
    )
      applyMuted(t, true);
    else if (wasPreviewing && activated) applyMuted(t, t.muted);
    t.commandedPlay = t.player!.getPlayerState().playback !== "Playing";
    t.player!.play();
    t.nudgedAt = Date.now();
  }
  function sync(t: Tile) {
    mark(t);
    clearTimeout(t.timer);
    if (showPoster(t)) {
      releasePlayer(t);
      return;
    }
    t.timer = setTimeout(() => {
      if (!t.el.isConnected) return;
      if (showPoster(t)) {
        releasePlayer(t);
        return;
      }
      if (!t.player) mountPlayer(t, !!t.controls);
      if (!t.ready) return;
      if (wantsPlayback(t)) start(t);
      else {
        t.player!.pause();
        if (t.previewing)
          t.nativeAudio = {
            muted: t.player!.getMuted(),
            volume: t.player!.getVolume(),
          };
        t.previewing = false;
      }
    }, 400);
  }
  // the player also pauses on its own during some reflows: whatever should be playing gets nudged back every second
  function watchdog(t: Tile) {
    if (!t.ready) return;
    const playingNow = t.player!.getPlayerState().playback === "Playing";
    if (playingNow && !t.wasPlaying && activated) {
      applyMuted(t, t.muted);
      t.player!.setVolume(t.volume);
      t.nativeAudio = { muted: t.muted, volume: t.volume };
    }
    t.wasPlaying = playingNow;
    if (t.controls) {
      readNativeControls(t);
      mark(t);
      return;
    }
    if (t.playbackBlocked) {
      mark(t);
      return;
    }
    // isPaused() is false in the Ready/Idle states the player drops into after a resize, so go by the playback state.
    // A live stream takes seconds to (re)start and a play() during that restarts it: nudge at most every 5s
    const st = t.player!.getPlayerState().playback;
    if (
      wantsPlayback(t) &&
      !t.el.classList.contains("offline") &&
      st !== "Playing" &&
      st !== "Buffering" &&
      Date.now() - (t.nudgedAt || 0) > 5000
    ) {
      // a play() the player swallowed (seen after a window resize) leaves it stuck until a click inside it: the second
      // nudge pauses first, which is what that click does, then plays again once the teardown had its second
      if (t.nudged) {
        const current = t.player;
        t.player!.pause();
        setTimeout(() => {
          if (t.player === current && t.el.isConnected && wantsPlayback(t))
            start(t);
        }, 1000);
      } else start(t);
      t.nudged = true;
    } else if (st === "Playing") t.nudged = false;
    if (
      activated &&
      st === "Playing" &&
      t.player!.getMuted() !== (hoverPlayback(t) || t.muted)
    )
      applyMuted(t, t.muted); // keeps the intent applied once sound is allowed
    mark(t);
  }
  // Deliberate pauses show a thumbnail; loading feedback sits beneath the iframe.
  function mark(t: Tile) {
    // Paused tiles keep a still image; only an active hover gets the preview loading status.
    const paused = allPaused || tilePaused(t);
    t.el.classList.toggle("paused", paused);
    const state = t.ready ? t.player!.getPlayerState().playback : "",
      playing = state === "Playing";
    const offline =
      t.channel.online === false || t.el.classList.contains("offline"); // known from the status, or reported by the player
    // Ready for a while yet not starting, or refused outright: the loader gives way to a play button, and the click goes
    // to the embed, whose own gesture is what Twitch wants before it plays. An offline channel has nothing to start.
    const stalled =
      !offline &&
      t.ready &&
      !playing &&
      state !== "Buffering" &&
      wantsPlayback(t) &&
      (t.playbackBlocked ||
        t.playbackError ||
        Date.now() - (t.readyAt || Date.now()) > 8000);
    t.el.classList.toggle("stalled", stalled);
    if (playing) t.hasPlayed = true;
    const pauseOverlay =
      preferences.player === "custom" &&
      paused &&
      !playing &&
      !offline &&
      !t.waitingForStatus &&
      t.hasPlayed;
    t.cover.classList.toggle("pause-overlay", pauseOverlay);
    // Reuse the cover over the frozen video while a custom player is paused.
    t.cover.classList.toggle(
      "gone",
      !pauseOverlay && !offline && !showPoster(t) && (playing || t.hasPlayed),
    ); // a class, so the still fades instead of vanishing
    t.el.classList.toggle("player-ready", t.ready);
    // An offline channel shows its avatar and status over its banner, or over the dark tile when it has none.
    t.cover.classList.toggle("offline", offline);
    t.previewStatus.hidden = !(
      offline ||
      (!t.hasPlayed &&
        (hoverPlayback(t) || t.waitingForStatus || wantsPlayback(t)))
    );
    t.previewStatus.querySelector<HTMLElement>("span")!.textContent = tr(
      offline
        ? "Hors ligne"
        : t.playbackError || t.playbackBlocked
          ? "Aperçu indisponible"
          : "Chargement de l’aperçu…",
    );
    t.el.classList.toggle(
      "loading",
      !paused && !offline && onScreen(t) && !playing,
    ); // the offline overlay replaces the loader
    t.el.classList.toggle("partial", !paused && !seen(t) && !playing);
    const status = t.bar.querySelector<HTMLElement>(".playback-status")!;
    if (status) {
      status.hidden = offline || playing || !wantsPlayback(t);
      status.classList.toggle("blocked", stalled);
      status.textContent = stalled ? "!" : "";
      status.title = tr(
        stalled
          ? "Cliquer dans le lecteur pour réessayer"
          : "Chargement du lecteur…",
      );
      status.setAttribute("aria-label", status.title);
    }
    updateAudioOverlay();
    paintSound(t);
  }

  let audioOverlayFocus: HTMLElement | null = null;
  function updateAudioOverlay() {
    const overlay = $("#audio-overlay");
    const needed =
      !activated &&
      !allPaused &&
      !mutedAll &&
      [...tiles.values()].some(
        (t) =>
          // a global mute wants silence, not a prompt
          !tilePaused(t) &&
          !t.muted &&
          t.volume > 0 &&
          t.channel.online !== false &&
          !t.el.classList.contains("offline") &&
          !t.playbackError,
      );
    if (needed === !overlay.hidden) return;
    overlay.hidden = !needed;
    if (needed) {
      hidePreview();
      audioOverlayFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      overlay.focus({ preventScroll: true });
    } else if (overlay.contains(document.activeElement)) {
      if (audioOverlayFocus?.isConnected)
        audioOverlayFocus.focus({ preventScroll: true });
      else if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    }
  }

  function viewers(s: Channel) {
    return s.viewersAmount.number;
  }

  // One temporary, muted player; removing its iframe stops playback and network activity.
  const preview = $("#preview");
  const previewController = createPreviewController({
    element: preview,
    side: $("#side"),
    list,
    getChannels: () => streamers,
    lifecycle,
  });
  const {
    markPreview,
    hidePreview,
    positionPreview,
    previewInfo,
    queuePreview,
    leavePreview,
  } = previewController;
  function toggle(s: Channel) {
    if (tiles.has(s.twitch)) {
      if (isLiveGrid()) focus(s.twitch);
      else remove(s.twitch);
    } else add(s);
    if (innerWidth <= 700) {
      document.body.classList.add("collapsed");
      save();
    }
    renderList();
  }

  // A stream that ends leaves its tile a minute to come back; then the tile goes, unless it is the spotlight or the grid is locked.
  // Only a tile seen live can go: a channel added while offline waits for its stream.
  function trackOnline(t: Tile, online: boolean) {
    if (online) {
      t.wasOnline = true;
      clearTimeout(t.offlineTimer);
      t.offlineTimer = null;
      return;
    }
    if (!t.wasOnline || t.offlineTimer) return;
    t.offlineTimer = setTimeout(() => {
      t.offlineTimer = null;
      const login = t.el.dataset.login!;
      if (!tiles.has(login) || (!isLiveGrid() && (locked || focused === login)))
        return;
      if (
        !isLiveGrid() &&
        !t.el.classList.contains("offline") &&
        t.ready &&
        t.player!.getPlayerState().playback === "Playing"
      )
        return; // a stale status against a player that plays
      remove(login, true, true);
      save();
      notice(
        tr("{name} est hors ligne, la tuile a été retirée.", {
          name: t.channel.display,
        }),
      );
    }, 60000);
  }
  function updateTileInfo(t: Tile, s: Channel) {
    const hadPoster = t.channel && showPoster(t);
    t.channel = s;
    if (typeof s.online === "boolean") t.waitingForStatus = false;
    if (s.online === true) t.el.classList.remove("offline");
    updatePoster(t);
    if (typeof s.online === "boolean") trackOnline(t, s.online);
    renderCollaboration(
      t,
      s.online === false
        ? []
        : collaborations.get(s.twitch)?.participants || [],
    );
    t.bar.querySelector<HTMLImageElement>(".stream-avatar")!.src = s.profileUrl;
    t.bar.querySelector<HTMLElement>(".viewers")!.textContent =
      s.online === false ? tr("Hors ligne") : s.viewersAmount.formatted;
    const info = t.bar.querySelector<HTMLElement>(".stream-info")!;
    const game = s.online === false ? "" : s.game,
      title = s.online === false ? "" : s.title;
    info.hidden = !game && !title;
    info.title = [game, title].filter(Boolean).join(" · ");
    for (const [selector, value] of [
      [".stream-category", game],
      [".stream-title", title],
    ]) {
      const field = info.querySelector<HTMLElement>(selector)!;
      field.textContent = value;
      field.hidden = !value;
    }
    if (t.cover) {
      t.ppIcon();
      mark(t);
    } // the offline overlay and the play button follow the status
    if (tiles.get(s.twitch)! === t && hadPoster !== showPoster(t)) sync(t);
  }

  function add(
    s: Channel,
    muted = true,
    volume = 0.5,
    paused: boolean | null = false,
    chatOpen = false,
    chatPosition: ChatPosition = "auto",
    automatic = false,
  ) {
    if (tiles.has(s.twitch)) return true;
    if (locked && restored && !automatic) {
      notice(
        tr("Grille verrouillée : déverrouille-la pour ajouter un stream."),
      );
      return false;
    }
    if (!playerConstructor()) {
      notice(
        tr(
          "Le lecteur Twitch est indisponible. Recharge la page pour réessayer.",
        ),
      );
      return false;
    }
    const el = document.createElement("div");
    el.className = "tile loading";
    el.dataset.login = s.twitch;
    let clickTimer: ReturnType<typeof setTimeout> | undefined;
    const togglePause = () => {
      if (t.channel.online === false) return;
      t.nativeHold = false;
      if (allPaused || tilePaused(t)) resumeTile(t);
      else {
        t.paused = true;
        t.hoverSuppressed = true;
      }
      ppIcon();
      sync(t);
      // sync() waits 400ms for the layout to settle before touching the player: fine to start
      // playing, far too slow to stop, the stream keeps running and sounding under the overlay.
      if (t.player && t.ready && !wantsPlayback(t)) t.player.pause();
      mark(t);
      save();
    };
    views.render(
      el,
      <StreamTile
        display={s.display}
        onSpotlight={() => focus(s.twitch)}
        onExpand={() => setExpanded(expanded === s.twitch ? null : s.twitch)}
        onPause={togglePause}
        onPlayerClick={() => {
          clearTimeout(clickTimer);
          // A paused embed is torn down and remounted, so there it is worth waiting out a possible
          // double click. The custom player only pauses its video: answer the click at once.
          if (preferences.player === "custom") togglePause();
          else clickTimer = setTimeout(togglePause, 250);
        }}
        onPlayerFullscreen={() => {
          clearTimeout(clickTimer);
          if (document.fullscreenElement) void document.exitFullscreen();
          else void t.el.requestFullscreen();
        }}
        onVolume={(value) => {
          t.volume = value;
          t.player?.setVolume(value);
          setMuted(t, value === 0);
          save();
        }}
        onSound={() => {
          if (mutedAll) return;
          setMuted(t, !playerMuted(t));
          save();
        }}
        onResume={() => {
          if (allPaused || tilePaused(t)) {
            resumeTile(t);
            sync(t);
            save();
          }
        }}
        onRemove={() => {
          if (isLiveGrid()) return;
          remove(s.twitch);
          renderList();
        }}
        onChat={() => {
          t.chatOpen = !t.chatOpen;
          syncChat();
          save();
        }}
        onChatPosition={(position) => {
          t.chatPosition = position;
          t.chatOpen = true;
          t.chatOptions.open = false;
          syncChat();
          save();
        }}
        onChatMenu={(menu) => {
          if (menu.open) closeTileMenus(false, menu);
        }}
        onVolumeEnter={() => {
          bar.draggable = false;
        }}
        onVolumeLeave={() => {
          bar.draggable = canDrag(s.twitch);
        }}
        onPointerDown={(e) => {
          if (
            e.button !== 0 ||
            !e.isPrimary ||
            !canDrag(s.twitch) ||
            (e.target as Element).closest(
              "button, a, input, select, summary, .volume",
            )
          )
            return;
          finishDrag();
          e.preventDefault();
          dragPointer = {
            bar,
            id: e.pointerId,
            login: s.twitch,
            startX: e.clientX,
            startY: e.clientY,
            x: e.clientX,
            y: e.clientY,
          };
          bar.setPointerCapture(e.pointerId);
        }}
        onLostPointerCapture={(e) => {
          if (dragPointer?.id === e.pointerId) finishDrag();
        }}
      />,
    );
    const [fs, close] = [".fs", ".close"].map((selector) =>
      el.querySelector<HTMLButtonElement>(selector)!,
    );
    fs.title = tr("Agrandir dans la fenêtre");
    fs.setAttribute("aria-label", fs.title);
    fs.setAttribute("aria-pressed", "false");
    const pp = el.querySelector<HTMLButtonElement>(".pp")!,
      vol = el.querySelector<HTMLInputElement>(".volume input")!;
    // An offline channel has nothing to play or pause: its button steps aside, and the global button leaves it alone.
    const ppIcon = () => {
      const paused = allPaused || tilePaused(t),
        offline = t.channel.online === false;
      pp.setAttribute("aria-pressed", String(paused));
      pp.setAttribute("aria-disabled", String(offline));
      pp.title = tr(offline ? "Hors ligne" : paused ? "Lecture" : "Pause");
      pp.setAttribute("aria-label", pp.title);
    };
    vol.value = String(volume);
    // one button, two states: a sound turned on here stays on until turned off here
    const bar = el.querySelector<HTMLDivElement>(".bar")!;
    // A click on a paused still resumes it. The spotlight belongs to its header button alone.
    // The bar drags to reorder; a press on the volume slider must move the thumb, not the tile: the bar stops being
    // draggable while the pointer is on the slider, whatever the browser makes of a drag started inside an input.
    // Capture the pointer before it crosses an iframe. Native cross-document drops
    // are unreliable; the release position determines the destination instead.
    close.disabled = isLiveGrid();
    translateTree(el);
    grid.append(el);
    const t: Tile = {
      el,
      bar,
      collaboration: el.querySelector<HTMLDetailsElement>(".collaboration")!,
      participants: [],
      cover: el.querySelector<HTMLDivElement>(".preview-cover")!,
      poster: el.querySelector<HTMLImageElement>(".stream-poster")!,
      previewStatus: el.querySelector<HTMLDivElement>(".preview-status")!,
      channel: s,
      player: null,
      visible: true,
      muted,
      volume,
      paused,
      chatOpen,
      chatPosition,
      ready: false,
      ppIcon,
      body: el.querySelector<HTMLDivElement>(".tile-body")!,
      chat: el.querySelector<HTMLElement>(".chat")!,
      chatOptions: el.querySelector<HTMLDetailsElement>(".chat-options")!,
    };
    t.poster.onerror = () => {
      t.poster.hidden = true;
    };
    el.addEventListener("mouseenter", () => {
      t.hovered = true;
      sync(t);
    });
    el.addEventListener("mouseleave", () => {
      t.hovered = false;
      t.hoverSuppressed = false;
      sync(t);
    });
    t.chat.id = "chat-" + s.twitch;
    t.chat.setAttribute(
      "aria-label",
      tr("Chat de {name}", { name: s.display }),
    );
    const chatButton = bar.querySelector<HTMLButtonElement>(".chat-toggle")!;
    chatButton.setAttribute("aria-controls", t.chat.id);
    t.chatOptions.querySelector<HTMLAnchorElement>("a")!.href =
      `https://www.twitch.tv/popout/${s.twitch}/chat?popout=` +
      (document.documentElement.dataset.theme === "dark"
        ? "&darkpopout=1"
        : "");
    setupCollaboration(t);
    updateTileInfo(t, s);
    tiles.set(s.twitch, t);
    ppIcon();
    io.observe(el);
    ro.observe(el.querySelector<HTMLDivElement>(".player")!);
    chatResize.observe(t.body);
    order.push(s.twitch);
    layout();
    // Animate the header, never an ancestor of a live iframe: opacity blocks Twitch autoplay.
    if (restored && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      bar.animate(
        [
          { opacity: 0, transform: "translateY(-4px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 300, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
      );
    return true;
  }

  function resumeTile(t: Tile) {
    t.nativeHold = false;
    if (allPaused) {
      tiles.forEach((other) => {
        if (other !== t && other.channel.online !== false) {
          other.paused = true;
          other.ppIcon();
        }
      });
      allPaused = false;
    }
    t.paused = false;
    t.ppIcon();
    paintPlayAll();
  }
  // Paused embeds use posters; mounted custom players retain their last frame.
  function showPoster(t: Tile) {
    // Keep the native player and its session through pauses and fullscreen transitions.
    if (inFullscreen(t)) return false;
    return (
      t.channel.online === false ||
      t.waitingForStatus ||
      ((allPaused || tilePaused(t)) &&
        !(preferences.player === "custom" && t.player) &&
        !hoverPlayback(t) &&
        !(t.nativeHold && t.controls && !allPaused))
    );
  }
  function updatePoster(t: Tile) {
    t.previewStatus.querySelector<HTMLImageElement>("img")!.src =
      t.channel.profileUrl;
    if (
      !t.poster.isConnected ||
      t.cover.classList.contains("gone") ||
      document.hidden
    )
      return;
    const src = previewImageURL(t.channel);
    if (t.poster.getAttribute("src") === src) return;
    t.poster.hidden = !src;
    if (src) t.poster.src = src;
    else t.poster.removeAttribute("src");
    t.el.querySelector<HTMLDivElement>(".player")!.style.backgroundImage = src
      ? `url(${JSON.stringify(src)})`
      : "";
  }
  function releasePlayer(t: Tile) {
    t.nativeHold = false;
    readNativeControls(t);
    if (t.ready && t.controls) t.quality = t.player!.getQuality?.();
    const player = t.player;
    // Invalidate callbacks before destroying the iframe, including delayed READY events.
    t.player = null;
    t.ready = false;
    t.previewing = false;
    t.hasPlayed = false;
    clearTimeout(t.timer);
    player?.destroy();
    const container = t.el.querySelector<HTMLDivElement>(".player")!;
    t.cover.classList.remove("gone");
    if (container.firstElementChild !== t.cover)
      container.replaceChildren(t.cover);
    t.el.classList.add("poster-only");
    updatePoster(t);
    fit(container);
    mark(t);
  }

  // Twitch only accepts the controls option when creating an embed. Recreate the changed
  // tile, preserving its settings; all other iframes keep playing.
  function mountPlayer(t: Tile, controls: boolean) {
    // Removing a fullscreen iframe also forces the browser to exit fullscreen.
    if (t.player && inFullscreen(t)) return;
    if (!playerConstructor()) return;
    if (!controls) t.nativeHold = false;
    t.el.classList.toggle("full-player", controls);
    if (showPoster(t)) {
      releasePlayer(t);
      t.controls = controls;
      t.el.classList.toggle("full-player", controls);
      return;
    }
    if (t.player && t.controls === controls) return;
    if (t.player?.setControls) {
      t.player.setControls(controls);
      t.controls = controls;
      return;
    }
    readNativeControls(t);
    if (t.ready && t.controls) t.quality = t.player!.getQuality?.();
    clearTimeout(t.timer);
    const previousPlayer = t.player;
    t.player = null;
    t.ready = false;
    previousPlayer?.destroy();
    const container = t.el.querySelector<HTMLDivElement>(".player")!;
    const embed = document.createElement("div");
    embed.className = "player-embed";
    t.cover.classList.remove("gone");
    // Keep the cover where it is: moving it in the DOM would restart the loading ring mid-turn.
    if (t.cover.parentElement === container) {
      for (const el of [...container.children]) if (el !== t.cover) el.remove();
      container.prepend(embed);
    } else container.replaceChildren(embed, t.cover);
    updatePoster(t);
    t.el.classList.remove("poster-only");
    t.ready = false;
    t.controls = controls;
    t.hasPlayed = false;
    t.nativeAudio = null;
    t.pendingMute = null;
    t.nudged = false;
    t.wasPlaying = false;
    t.nativePaused = false;
    t.playbackBlocked = false;
    t.playbackError = false;
    t.el.classList.remove("offline", "partial");
    t.el.classList.toggle("loading", !allPaused && !tilePaused(t));
    t.commandedPlay = wantsPlayback(t);
    const player = new (playerConstructor()!)(embed, {
      channel: t.el.dataset.login!,
      parent: [location.hostname],
      width: "100%",
      height: "100%",
      muted: true,
      autoplay: false,
      controls,
    });
    t.player = player;
    // The cover is outside Twitch's mount node, so iframe initialization cannot remove it.
    nameFrame(
      container.querySelector<HTMLIFrameElement | HTMLVideoElement>(
        "iframe, video",
      )!,
      tr("Stream de {name}", { name: t.channel.display }),
    );
    fit(container); // Size the iframe before READY so it fits the tile from the first frame.
    const current = () => t.player === player && t.el.isConnected;
    player.addEventListener(playerConstructor()!.READY, () => {
      if (!current()) return;
      t.ready = true;
      t.readyAt = Date.now();
      mark(t);
      fit(container);
      player.setVolume(t.volume);
      t.nativeAudio = { muted: player.getMuted(), volume: t.volume };
      if (activated) applyMuted(t, t.muted);
      if (t.controls && t.quality) player.setQuality(t.quality);
      sync(t);
      mark(t);
    });
    for (const event of [
      "playing",
      "play",
      "pause",
      "ended",
      "playbackBlocked",
      "offline",
      "online",
      "error",
    ])
      player.addEventListener(event, () => {
        if (!current() || unloading) return; // a player torn down by the navigation is not a viewer pausing
        if (event === "offline" || event === "online")
          t.el.classList.toggle("offline", event === "offline");
        if (event === "offline" || event === "online" || event === "playing")
          trackOnline(t, event !== "offline");
        if (event === "offline") {
          updateTileInfo(t, { ...t.channel, online: false });
          sync(t);
          return;
        }
        if (event === "playbackBlocked") t.playbackBlocked = true;
        if (event === "playing" || event === "offline" || event === "error")
          t.playbackBlocked = false;
        if (event === "error") t.playbackError = true;
        if (event === "playing" || event === "online") t.playbackError = false;
        if (event === "playing") {
          t.hasPlayed = true;
          if (activated) applyMuted(t, t.muted);
        }
        if (
          t.controls &&
          !hoverPlayback(t) &&
          !(event === "pause" && (allPaused || tilePaused(t))) &&
          (t.hasPlayed || (event === "play" && t.ready))
        ) {
          if (
            event === "pause" &&
            !allPaused &&
            onScreen(t) &&
            !t.playbackBlocked
          ) {
            // Firefox answers an unmute in a frame never clicked by pausing the media: blocked playback, not a pause the viewer chose
            if (Date.now() - (t.unmutedAt || 0) < 1000)
              t.playbackBlocked = true;
            else {
              t.nativeHold = true;
              t.paused = true;
              t.hoverSuppressed = true;
            }
          }
          if (event === "play" && !t.commandedPlay) {
            t.nativeHold = false;
            t.paused = false;
            // A native Play resumes this stream even after the global pause.
            if (allPaused) {
              tiles.forEach((other) => {
                if (other !== t && other.channel.online !== false) {
                  other.paused = true;
                  other.ppIcon();
                }
              });
              allPaused = false;
              paintPlayAll();
            }
          }
          t.ppIcon();
          save();
        }
        if (event === "play") t.commandedPlay = false;
        if (event === "pause") t.nativePaused = true;
        else if (event === "play" || event === "playing")
          t.nativePaused = false;
        if (event === "pause" && showPoster(t)) sync(t);
        mark(t);
      });
  }
  function applyMuted(t: Tile, value: boolean) {
    value = !activated || hoverPlayback(t) || value;
    t.pendingMute = { value, at: Date.now() };
    if (!value) t.unmutedAt = Date.now();
    t.player!.setMuted(value);
    paintSound(t);
  }
  function readNativeControls(t: Tile) {
    if (
      !t.controls ||
      !t.ready ||
      !t.hasPlayed ||
      t.previewing ||
      (t.player!.getPlayerState().playback !== "Playing" && !t.nativePaused)
    )
      return;
    const audio = {
      muted: t.player!.getMuted(),
      volume: t.player!.getVolume(),
    };
    let changed = false;
    if (t.pendingMute) {
      if (
        audio.muted === t.pendingMute.value ||
        Date.now() - t.pendingMute.at > 2000
      )
        t.pendingMute = null;
    } else if (t.nativeAudio && audio.muted !== t.nativeAudio.muted) {
      if (mutedAll && !audio.muted) {
        setMuted(t, false);
        return;
      } // silenced again: the global mute holds
      t.muted = audio.muted;
      changed = true;
    }
    if (
      t.nativeAudio &&
      audio.volume !== t.nativeAudio.volume &&
      Number.isFinite(audio.volume)
    ) {
      t.volume = audio.volume;
      changed = true;
      t.el.querySelector<HTMLInputElement>(".volume input")!.value = String(
        t.volume,
      );
    }
    t.nativeAudio = audio;
    if (changed) {
      paint(t);
      save();
    }
  }

  const exitingTiles = new Set<HTMLElement>();
  function animateRemoval(t: Tile) {
    if (
      !restored ||
      document.hidden ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const rect = t.el.getBoundingClientRect();
    if (
      !rect.width ||
      !rect.height ||
      rect.bottom < 0 ||
      rect.top > innerHeight
    )
      return;
    // Only animate a static copy: destroy the real player and update membership immediately.
    const copy = t.el.cloneNode(true) as HTMLDivElement;
    copy.removeAttribute("data-login");
    copy.removeAttribute("style");
    copy.classList.add("tile-exit");
    copy.inert = true;
    copy.setAttribute("aria-hidden", "true");
    copy
      .querySelectorAll<HTMLElement>(
        "iframe, video, .chat, .volume, .load, .chat-menu, .collaboration-menu",
      )
      .forEach((el) => el.remove());
    copy
      .querySelectorAll<HTMLElement>("[id]")
      .forEach((el) => el.removeAttribute("id"));
    copy
      .querySelector<HTMLDivElement>(".tile-body")!
      .removeAttribute("data-chat-position");
    copy
      .querySelector<HTMLDivElement>(".player")!
      .replaceChildren(t.poster.cloneNode());
    Object.assign(copy.style, {
      position: "fixed",
      left: rect.left + "px",
      top: rect.top + "px",
      width: rect.width + "px",
      height: rect.height + "px",
      zIndex: "20",
      pointerEvents: "none",
    });
    document.body.append(copy);
    exitingTiles.add(copy);
    const finish = () => {
      copy.remove();
      exitingTiles.delete(copy);
    };
    copy
      .animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "scale(.97)" },
        ],
        { duration: 250, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
      )
      .finished.then(finish, finish);
  }

  function remove(login: string, updateLayout = true, automatic = false) {
    if (!tiles.has(login) || (isLiveGrid() && !automatic)) return;
    if (updateLayout) animateRemoval(tiles.get(login)!);
    if (expanded === login) setExpanded(null);
    const player = tiles.get(login)!.player;
    tiles.get(login)!.player = null;
    player?.destroy();
    clearTimeout(tiles.get(login)!.timer);
    clearTimeout(tiles.get(login)!.offlineTimer);
    ro.unobserve(
      tiles.get(login)!.el.querySelector<HTMLDivElement>(".player")!,
    );
    chatResize.unobserve(tiles.get(login)!.body);
    io.unobserve(tiles.get(login)!.el);
    const tile = tiles.get(login)!;
    views.remove(
      tile.collaboration.querySelector<HTMLElement>(".collaboration-list")!,
    );
    views.remove(tile.el);
    tile.el.remove();
    tiles.delete(login);
    order.splice(order.indexOf(login), 1);
    if (focused === login) focused = null;
    if (updateLayout) layout();
  }

  function clearTiles() {
    for (const copy of exitingTiles) {
      copy.getAnimations().forEach((animation) => animation.cancel());
      copy.remove();
    }
    exitingTiles.clear();
    for (const login of [...tiles.keys()]) remove(login, false, true);
    focused = null;
  }

  function move(from: string, to: string) {
    if (!from || from === to) return;
    if (to === focused) {
      focus(from);
      return;
    } // dropped on the spotlight: the tiles trade roles, the grid order stays
    // the tile slides to the target: the index taken before the removal lands it after the target when moving down, before it when moving up
    const i = order.indexOf(from),
      j = order.indexOf(to);
    order.splice(i, 1);
    order.splice(j, 0, from);
    layout();
  }

  // the global mute outranks every intent, and keeps track of the tiles that would have sound for its release
  function setMuted(t: Tile, m: boolean) {
    if (mutedAll) {
      const login = t.el.dataset.login!;
      mutedAll = m
        ? mutedAll.filter((l) => l !== login)
        : [...new Set([...mutedAll, login])];
      m = true;
    }
    if (!m && t.volume === 0) {
      t.volume = 0.5;
      t.el.querySelector<HTMLInputElement>(".volume input")!.value = String(
        t.volume,
      );
      t.player?.setVolume(t.volume);
    }
    t.muted = m;
    if (t.ready) applyMuted(t, m);
    paint(t);
  }
  function paint(t: Tile) {
    const spot = t.el.querySelector<HTMLButtonElement>(".spotlight")!,
      front = focused === t.el.dataset.login!;
    spot.title = tr(front ? "Revenir à la grille" : "Spotlight");
    spot.setAttribute("aria-label", spot.title);
    spot.setAttribute("aria-pressed", String(front));
    paintSound(t);
  }
  // Saved intent survives reloads; the icon reports whether the current player is actually unmuted.
  function playerMuted(t: Tile) {
    return (
      !activated ||
      !t.ready ||
      t.player!.getMuted() ||
      t.player!.getVolume() === 0
    );
  }
  function paintSound(t: Tile) {
    const muted = playerMuted(t),
      sound = muted ? "muted" : "on";
    t.el.classList.toggle("loud", !muted);
    // Under the global mute the sound controls step aside; aria-disabled keeps the hover, so the tooltip can say why.
    for (const button of t.el.querySelectorAll<HTMLElement>(".snd")) {
      button.title = tr(
        mutedAll
          ? "Son coupé globalement"
          : muted
            ? "Allumer le son"
            : "Couper le son",
      );
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-disabled", String(!!mutedAll));
      button.dataset.sound = sound;
    }
    t.el.querySelector<HTMLInputElement>(".volume input")!.disabled =
      !!mutedAll;
  }
  function setExpanded(login: string | null) {
    expanded = login;
    hidePreview();
    $("#side").inert = !!expanded;
    for (const [name, t] of tiles) {
      const active = name === expanded;
      t.el.classList.toggle("expanded", active);
      t.el.inert = !!expanded && !active;
      t.bar.draggable = !expanded && canDrag(name);
      const button = t.bar.querySelector<HTMLButtonElement>(".fs")!;
      button.title = active
        ? tr("Revenir à la disposition précédente")
        : tr("Agrandir dans la fenêtre");
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-pressed", String(active));
      fit(t.el.querySelector<HTMLDivElement>(".player")!);
      sync(t);
    }
    syncChat();
  }
  // The spotlight turns its sound on and, on the way out, gives back the state the tile had before. Other tiles keep theirs.
  function focus(login: string) {
    if (expanded) setExpanded(null);
    if (tiles.size < 2) return;
    const prev = focused && tiles.get(focused)!;
    if (prev) {
      readNativeControls(prev);
      if (typeof prev.spotlightMuted === "boolean")
        setMuted(prev, prev.spotlightMuted);
      prev.spotlightMuted = undefined;
    }
    focused = focused === login ? null : login;
    if (focused) {
      const t = tiles.get(focused)!;
      t.spotlightMuted = mutedAll
        ? mutedAll.includes(focused)
          ? false
          : true
        : t.muted;
      setMuted(t, false);
    } // the intent counts under a global mute
    layout();
  } // every tile but the spotlight drags, and any other tile takes the drop
  const canDrag = (login: string) =>
    tiles.size > 1 && login !== expanded && login !== focused;
  const canDrop = (login: string) => !!dragging && dragging !== login;

  // the column count whose cells hold the widest 16:9 video: two streams stack on a tall box, sit side by side on a wide one
  function columnsFor(count: number, w: number, h: number) {
    const bar =
      parseFloat(getComputedStyle(grid).getPropertyValue("--bar")) || 34;
    let cols = 1,
      best = 0;
    for (let c = 1; c <= count; c++) {
      const video = Math.min(
        w / c,
        ((h / Math.ceil(count / c) - bar) * 16) / 9,
      );
      if (video > best) {
        best = video;
        cols = c;
      }
    }
    return cols;
  }
  // the rendered video width that grants the full Twitch player, the tile width or the room under the video that grants the chat,
  // in pixels; the keep values hold what a tile already has so a window near the line does not flap
  const PLAYER_WIDTH = { enter: 640, keep: 560 },
    CHAT_WIDTH = { enter: 640, keep: 560 },
    CHAT_HEIGHT = { enter: 420, keep: 380 };
  let mountTimer: number | undefined,
    resizing = false,
    batching = false;
  function layout() {
    if (batching) return; // a restore adds every tile first and lays them out once
    renderLanding();
    const n = tiles.size;
    if (n < 2 && focused) {
      const t = tiles.get(focused)!;
      if (t && typeof t.spotlightMuted === "boolean") {
        setMuted(t, t.spotlightMuted);
        t.spotlightMuted = undefined;
      }
      focused = null;
    }
    const frontOrder = focused ? [focused] : [],
      front = (login: string) => frontOrder.includes(login),
      count = frontOrder.length;
    const split = count > 0 && count < n; // the spotlight beside a column of small ones
    if (expanded && n > 1 && !front(expanded)) setExpanded(null);
    grid.classList.toggle("single", n === 1);
    grid.classList.toggle("focused", split);
    for (const [login, t] of tiles) {
      t.el.classList.toggle("big", front(login));
      t.el.style.order = String(
        front(login) ? frontOrder.indexOf(login) : order.indexOf(login),
      );
      t.ppIcon();
      t.bar.querySelector<HTMLButtonElement>(".close")!.disabled = isLiveGrid();
      sync(t);
      t.bar.draggable = canDrag(login);
    }
    if (split) {
      // ponytail: front tiles leave the grid flow and are placed by hand in the box the small tiles leave them, since
      // wrapping them in their own grid would move the iframes and reload the players
      const box = grid.getBoundingClientRect(),
        bar =
          parseFloat(getComputedStyle(grid).getPropertyValue("--bar")) || 34;
      const below = box.height > box.width; // a portrait box keeps the small tiles in a strip under the front row instead of a column beside it
      grid.classList.toggle("below", below);
      let w = box.width,
        h = box.height;
      if (below) {
        const sideCols = Math.max(
            1,
            Math.round(box.width / (((innerHeight * 0.22 - bar) * 16) / 9)),
          ),
          tileH = ((box.width / sideCols) * 9) / 16 + bar;
        // the strip shows as many rows as the front row can spare without shrinking its videos
        const frontCols = columnsFor(count, w, box.height - tileH - 2),
          frontRows = Math.ceil(count / frontCols);
        const frontMin =
          frontRows *
            ((((w - 2 * (frontCols - 1)) / frontCols) * 9) / 16 + bar) +
          2 * (frontRows - 1);
        const stripRows = Math.max(
          1,
          Math.min(
            Math.ceil((n - count) / sideCols),
            Math.floor((box.height - frontMin) / (tileH + 2)),
          ),
        );
        h = box.height - stripRows * (tileH + 2);
        grid.style.setProperty("--cols", String(sideCols));
        grid.style.setProperty("--tile-h", tileH + "px");
        grid.style.gridTemplateColumns = `repeat(${sideCols}, 1fr)`;
        grid.style.gridTemplateRows = `${h}px repeat(${Math.max(Math.ceil((n - count) / sideCols), 1)}, var(--tile-h))`;
      } else {
        const wide = innerWidth / innerHeight > 2,
          sideCols = wide ? 2 : 1; // ultrawide → two side columns
        grid.style.setProperty("--cols", String(sideCols));
        grid.style.setProperty("--side", wide ? "30vw" : "22vw");
        grid.style.removeProperty("--tile-h");
        grid.style.gridTemplateColumns = "";
        grid.style.gridTemplateRows = `repeat(${Math.max(Math.ceil((n - count) / sideCols), 1)}, var(--tile-h))`;
      }
      // The grid's reserved front cell excludes the scrollbar. Using the outer grid width overlaps side players.
      w = parseFloat(getComputedStyle(grid, "::before").width);
      const cols = columnsFor(count, w, h),
        rows = Math.ceil(count / cols);
      const cw = (w - 2 * (cols - 1)) / cols,
        ch = (h - 2 * (rows - 1)) / rows;
      frontOrder.forEach((login, i) => {
        const style = tiles.get(login)!.el.style;
        style.setProperty("--x", box.left + (i % cols) * (cw + 2) + "px");
        style.setProperty(
          "--y",
          box.top + Math.floor(i / cols) * (ch + 2) + "px",
        );
        style.setProperty("--w", cw + "px");
        style.setProperty("--h", ch + "px");
      });
    } else {
      grid.classList.remove("below");
      grid.style.removeProperty("--tile-h");
      for (const t of tiles.values())
        for (const name of ["--x", "--y", "--w", "--h"])
          t.el.style.removeProperty(name);
      const cols = columnsFor(
          n,
          grid.clientWidth || innerWidth,
          grid.clientHeight || innerHeight,
        ),
        rows = Math.ceil(n / cols) || 1;
      grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      grid.style.gridTemplateRows = `repeat(${rows}, calc((100% - ${2 * (rows - 1)}px) / ${rows}))`; // the gaps come out of the rows, or the last one scrolls by 2px
    }
    // The spotlight and a lone tile always get the full player. Any other tile gets it once wide enough, and its chat wider
    // still, measured on the tile with a margin either way so a window near the line does not flap. A first mount, a role
    // change and a tile leaving the front apply now; a change that only comes from a window resize waits for it to settle.
    const barHeight =
      parseFloat(getComputedStyle(grid).getPropertyValue("--bar")) || 34;
    let sizeChange = false;
    for (const [login, t] of tiles) {
      const w = t.el.clientWidth,
        h = t.el.clientHeight - barHeight,
        video = Math.min(w, (h * 16) / 9),
        spare = h - (w * 9) / 16;
      t.fits = t.sized
        ? video >= PLAYER_WIDTH.keep
        : video >= PLAYER_WIDTH.enter; // the margin protects a player earned by size, not one that came with a role
      t.chatFits = t.chatFits
        ? w >= CHAT_WIDTH.keep || spare >= CHAT_HEIGHT.keep
        : w >= CHAT_WIDTH.enter || spare >= CHAT_HEIGHT.enter;
      const byRole = n === 1 || front(login),
        want = byRole || t.fits;
      if (!t.player || byRole || (t.controls && !t.sized && !want))
        mountPlayer(t, want);
      else if (want !== t.controls) sizeChange = true;
      t.sized = !byRole && t.controls;
      fit(t.el.querySelector<HTMLDivElement>(".player")!);
      updateCollaborationButtons(t);
      paint(t);
      if (t.collaboration.open) positionCollaborationMenu(t);
    }
    clearTimeout(mountTimer);
    const applySizes = () => {
      for (const [login, t] of tiles)
        if (tiles.size > 1 && login !== focused && t.fits !== t.controls) {
          mountPlayer(t, !!t.fits);
          t.sized = t.controls;
          fit(t.el.querySelector<HTMLDivElement>(".player")!);
        }
      syncChat();
    };
    if (sizeChange) {
      if (resizing) mountTimer = setTimeout(applySizes, 300);
      else applySizes();
    } // only a window resize waits to settle
    syncChat();
    save();
    updateAudioOverlay();
    refreshCollaborations();
  }

  actions.toggleSidebar = () => {
    hidePreview();
    document.body.classList.toggle("collapsed");
    save();
  };
  // one button silences everything and gives the sound back to exactly the streams that had it
  function paintMuteAll() {
    const button = $<HTMLButtonElement>("#muteall");
    button.setAttribute("aria-pressed", String(!!mutedAll));
    button.title = tr(mutedAll ? "Réactiver le son" : "Couper tous les sons");
    button.setAttribute("aria-label", button.title);
    tiles.forEach(paint);
  }
  actions.toggleMute = () => {
    tiles.forEach(readNativeControls);
    if (mutedAll) {
      const loud = mutedAll;
      mutedAll = null;
      for (const login of loud)
        if (tiles.has(login)) setMuted(tiles.get(login)!, false);
    } else {
      const loud = [...tiles]
        .filter(([, t]) => !t.muted)
        .map(([login]) => login);
      tiles.forEach((t) => setMuted(t, true));
      mutedAll = loud;
    }
    paintMuteAll();
    save();
  };
  actions.togglePlayback = () => {
    // A quick shortcut, not a lock like the global mute: pause stops every tile, play resumes every tile, and each
    // tile's own button can override it afterwards.
    allPaused = !gridPaused();
    tiles.forEach((t) => {
      t.nativeHold = false;
      if (!allPaused && t.channel.online !== false) t.paused = false;
      if (allPaused) t.hoverSuppressed = !!t.hovered;
      t.ppIcon();
    });
    paintPlayAll();
    tiles.forEach(sync);
    save();
  };
  let unloading = false;
  addEventListener("pagehide", () => {
    unloading = true;
    saveCurrentLayout();
  });
  // Keep accessible labels while suppressing tooltips that would cover Twitch players.
  syncPlayerTooltips(lifecycle);
  addEventListener("pageshow", () => {
    unloading = false;
  });
  function tick() {
    // An iframe can gain focus without a window blur, including after a reload.
    if (document.activeElement?.tagName === "IFRAME") {
      closeTileMenus();
      if (!activated) activate();
    }
    tiles.forEach((t) => {
      watchdog(t);
      paint(t);
    });
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
  function push() {
    tiles.forEach((t) => {
      if (
        !t.ready ||
        !wantsPlayback(t) ||
        (t.controls &&
          t.hasPlayed &&
          !t.playbackBlocked &&
          (t.muted || !t.player!.getMuted()))
      )
        return;
      applyMuted(t, t.muted);
      sync(t);
    });
  }
  function activate() {
    activated = true;
    updateAudioOverlay();
    push();
  }
  addEventListener(
    "pointerdown",
    () => {
      if ($("#audio-overlay").hidden && !activated) activate();
    },
    { capture: true },
  );
  addEventListener(
    "click",
    (e) => {
      if (!$("#audio-overlay").hidden) {
        e.preventDefault();
        e.stopImmediatePropagation();
        activate();
      }
    },
    { capture: true },
  );
  addEventListener(
    "keydown",
    (e) => {
      if (!$("#audio-overlay").hidden) {
        e.preventDefault();
        e.stopImmediatePropagation();
        activate();
      } else if (!activated) activate();
    },
    { capture: true },
  );
  // a click on the video lands inside the iframe and never reaches this page: the only trace is the focus leaving for it
  // (Firefox fires blur before it moves activeElement to the iframe, hence the tick)
  addEventListener("blur", () =>
    setTimeout(() => {
      if (document.activeElement?.tagName === "IFRAME") {
        closeTileMenus();
        activate();
      }
    }),
  );
  let dragPointer: DragPointer | null = null,
    dragScrollFrame: number | null = null;
  function dragTarget(x: number, y: number) {
    const tile = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("#grid > .tile");
    return tile && canDrop(tile.dataset.login!) ? tile : null;
  }
  function createDragGhost() {
    if (!dragPointer) return;
    const ghost = document.createElement("div");
    ghost.className = "tile drag-ghost";
    ghost.inert = true;
    ghost.setAttribute("aria-hidden", "true");
    const header = dragPointer!.bar.cloneNode(true) as HTMLElement;
    header.draggable = false;
    for (const el of [header, ...header.querySelectorAll<HTMLElement>("*")]) {
      for (const name of ["id", "title", "data-tip"]) el.removeAttribute(name);
    }
    for (const control of header.querySelectorAll<HTMLElement>(
      "button, details, .snd-wrap, .stream-info, .viewers",
    ))
      control.remove();
    const tile = tiles.get(dragPointer.login)!,
      preview = document.createElement("div");
    preview.className = "drag-preview";
    const poster = document.createElement("img"),
      src = previewImageURL(tile.channel);
    poster.className = "drag-poster";
    poster.alt = "";
    if (src) poster.src = src;
    else poster.hidden = true;
    const fallback = document.createElement("div");
    fallback.className = "drag-preview-status";
    const avatar = document.createElement("img");
    avatar.src = tile.channel.profileUrl;
    avatar.alt = "";
    fallback.append(avatar);
    if (tile.channel.online === false) {
      const label = document.createElement("span");
      label.textContent = tr("Hors ligne");
      fallback.append(label);
    }
    fallback.hidden = !!src && tile.channel.online !== false;
    poster.onerror = () => {
      poster.hidden = true;
      fallback.hidden = false;
    };
    preview.append(poster, fallback);
    ghost.append(header, preview);
    ghost.style.width =
      Math.min(
        dragPointer.bar.getBoundingClientRect().width * 0.55,
        200,
        innerWidth - 16,
      ) + "px";
    document.body.append(ghost);
    dragPointer.ghost = ghost;
  }
  function positionDragGhost() {
    const pointer = dragPointer;
    if (!pointer?.ghost) return;
    const ghost = pointer.ghost;
    const width = ghost.offsetWidth,
      height = ghost.offsetHeight;
    const spotlight = focused && tiles.get(focused)?.el.getBoundingClientRect();
    const candidates = [
      [14, 14],
      [14, -height - 14],
      [-width - 14, 14],
      [-width - 14, -height - 14],
    ].map(([dx, dy]) => {
      const x = Math.max(8, Math.min(pointer.x + dx, innerWidth - width - 8));
      const y = Math.max(8, Math.min(pointer.y + dy, innerHeight - height - 8));
      const overlap = spotlight
        ? Math.max(
            0,
            Math.min(x + width + 8, spotlight.right) -
              Math.max(x - 8, spotlight.left),
          ) *
          Math.max(
            0,
            Math.min(y + height + 8, spotlight.bottom) -
              Math.max(y - 8, spotlight.top),
          )
        : 0;
      return { x, y, overlap };
    });
    // Prefer the lower right, but keep the miniature off the spotlight when possible.
    const { x, y } = candidates.reduce((best, next) =>
      next.overlap < best.overlap ? next : best,
    );
    ghost.style.transform = `translate(${x}px, ${y}px)`;
  }
  function highlightDrop() {
    if (!dragPointer) return;
    const target = dragTarget(dragPointer.x, dragPointer.y);
    for (const t of tiles.values())
      t.el.classList.toggle("over", t.el === target);
  }
  function scrollDrag() {
    if (!dragPointer || !dragging) return;
    const { x, y } = dragPointer,
      box = grid.getBoundingClientRect();
    const target = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>(".tile");
    if (x >= box.left && x < box.right && !target?.classList.contains("big")) {
      const speed = y < box.top + 32 ? -12 : y > box.bottom - 32 ? 12 : 0;
      if (speed && y >= box.top && y <= box.bottom) {
        grid.scrollTop += speed;
        highlightDrop();
      }
    }
    dragScrollFrame = requestAnimationFrame(scrollDrag);
  }
  function finishDrag() {
    const pointer = dragPointer;
    dragPointer = null;
    pointer?.ghost?.remove();
    dragging = null;
    if (dragScrollFrame !== null) cancelAnimationFrame(dragScrollFrame);
    dragScrollFrame = null;
    if (pointer?.bar.hasPointerCapture(pointer.id))
      pointer.bar.releasePointerCapture(pointer.id);
    document.body.classList.remove("dragging");
    document
      .querySelectorAll<HTMLElement>(
        ".tile.over, .tile.drop-target, .tile.dragged",
      )
      .forEach((t) => t.classList.remove("over", "drop-target", "dragged"));
  }
  addEventListener("pointermove", (e) => {
    if (!dragPointer || e.pointerId !== dragPointer.id) return;
    if (!(e.buttons & 1)) {
      finishDrag();
      return;
    }
    dragPointer.x = e.clientX;
    dragPointer.y = e.clientY;
    if (!dragging) {
      if (
        Math.hypot(
          e.clientX - dragPointer.startX,
          e.clientY - dragPointer.startY,
        ) < 5
      )
        return;
      dragging = dragPointer.login;
      createDragGhost();
      document.body.classList.add("dragging");
      for (const [login, t] of tiles) {
        t.el.classList.toggle("drop-target", canDrop(login));
        t.el.classList.toggle("dragged", login === dragging);
      }
      dragScrollFrame = requestAnimationFrame(scrollDrag);
    }
    positionDragGhost();
    highlightDrop();
  });
  addEventListener("pointerup", (e) => {
    if (!dragPointer || e.pointerId !== dragPointer.id) return;
    const from = dragging,
      to = from && dragTarget(e.clientX, e.clientY)?.dataset.login!;
    finishDrag();
    if (to && tiles.has(from)) move(from, to);
  });
  addEventListener("pointercancel", (e) => {
    if (dragPointer?.id === e.pointerId) finishDrag();
  });
  addEventListener("blur", finishDrag);
  new ResizeObserver(() => {
    if (restored) {
      resizing = true;
      layout();
      resizing = false;
    }
  }).observe(grid); // window resizes and sidebar toggles both change the grid box
  grid.addEventListener("scroll", () => closeTileMenus(), { passive: true });
  listenDocument("fullscreenchange", () =>
    tiles.forEach((t) => {
      fit(t.el.querySelector<HTMLDivElement>(".player")!);
      sync(t);
    }),
  );
  listenDocument("keydown", (e) => {
    if (e.key === "Escape") {
      if (dragPointer) {
        e.preventDefault();
        finishDrag();
        return;
      }
      if (closeTileMenus(true)) {
        e.preventDefault();
        return;
      }
      if (expanded) setExpanded(null);
      else if (previewController.row) hidePreview();
      else if (focused) focus(focused);
    }
  });
  watchForUpdates(lifecycle, () => {
    $("#update").hidden = false;
  });

  let library: TwitchLibrary,
    follows: Channel[] = [],
    results: Channel[] = [],
    searchVersion = 0,
    accountVersion = 0;
  let searching = false,
    refreshInFlight = false,
    lastFollows = 0,
    searchTimer: number | undefined,
    searchController: AbortController | undefined;
  let searchError = "";
  const lastLiveStatus = new Map<string, boolean | null>(),
    liveNotifications = new Map<string, HTMLDivElement>();
  function dismissLiveNotification(login: string) {
    const toast = liveNotifications.get(login);
    if (toast) {
      views.remove(toast);
      toast.remove();
    }
    liveNotifications.delete(login);
  }
  function pruneLiveNotifications(channels: Channel[]) {
    const logins = new Set(channels.map((s) => s.twitch));
    for (const login of lastLiveStatus.keys())
      if (!logins.has(login)) lastLiveStatus.delete(login);
    for (const login of liveNotifications.keys())
      if (!logins.has(login)) dismissLiveNotification(login);
  }
  function openLiveNotification(login: string) {
    const s = (library.user ? follows : favorites).find(
      (s) => s.twitch === login,
    );
    if (!s || s.online !== true) {
      dismissLiveNotification(login);
      return;
    }
    // The stream joins the grid, nothing more: no spotlight, no sound, and the pauses stay as they are.
    if (!tiles.has(login)) add(s);
    const t = tiles.get(login)!;
    if (!t) return;
    if (expanded) setExpanded(null); // an expanded tile would hide the newcomer
    if (innerWidth <= 700) document.body.classList.add("collapsed");
    dismissLiveNotification(login);
    renderList();
    save();
    t.el.scrollIntoView({ block: "nearest" });
    t.bar
      .querySelector<HTMLButtonElement>(".spotlight")!
      .focus({ preventScroll: true });
  }
  function updateLiveNotifications(channels: Channel[]) {
    pruneLiveNotifications(channels);
    for (const s of channels) {
      if (
        !isLiveGrid() &&
        s.online &&
        lastLiveStatus.get(s.twitch) === false &&
        !liveNotifications.has(s.twitch)
      ) {
        const toast = document.createElement("div");
        toast.className = "live-notification";
        toast.dataset.login = s.twitch;
        views.render(
          toast,
          <LiveNotification
            channel={s}
            onWatch={() => openLiveNotification(s.twitch)}
            onDismiss={() => dismissLiveNotification(s.twitch)}
          />,
        );
        liveNotifications.set(s.twitch, toast);
        $("#live-notifications").prepend(toast);
      }
      if (!s.online) dismissLiveNotification(s.twitch);
      lastLiveStatus.set(s.twitch, s.online);
    }
  }
  const statusUnavailable =
    "Impossible d’actualiser le statut des favoris. Nouvelle tentative dans 30 secondes.";
  let accountReady = false;
  const storedFavorites = readStored<Channel[]>("tg.favorites", []);
  let favorites = Array.isArray(storedFavorites)
    ? storedFavorites.filter((s) => s && validLogin(s.twitch)).map(channel)
    : [];
  favorites = [...new Map(favorites.map((s) => [s.twitch, s])).values()];
  function notice(message = "") {
    $("#notice").textContent = tr(message);
  }
  function saveFavorites() {
    if (
      !writeStored(
        "tg.favorites",
        favorites.map(({ twitch, display, profileUrl }) => ({
          twitch,
          display,
          profileUrl,
        })),
      )
    )
      notice(
        tr(
          "Le navigateur ne peut pas enregistrer les favoris. Ils seront perdus à la fermeture de la page.",
        ),
      );
  }
  function updateAccount() {
    const connected = !!library?.user;
    $<HTMLButtonElement>("#connect").hidden = connected;
    $<HTMLButtonElement>("#connect").disabled =
      !accountReady || !library?.clientId;
    $<HTMLButtonElement>("#disconnect").hidden = !connected;
  }
  function rebuild() {
    pruneLiveNotifications(library?.user ? follows : favorites);
    const merged = new Map(
      [...(library?.user ? follows : favorites), ...results].map((s) => [
        s.twitch,
        s,
      ]),
    );
    streamers = [...merged.values()];
    renderList();
    refreshCollaborations();
    for (const s of streamers) {
      const t = tiles.get(s.twitch)!;
      if (t) updateTileInfo(t, s);
    }
  }
  function toggleFavorite(s: Channel) {
    if (library?.user) return;
    if (favorites.some((f) => f.twitch === s.twitch))
      favorites = favorites.filter((f) => f.twitch !== s.twitch);
    else favorites.push(s);
    saveFavorites();
    rebuild();
    refresh();
  }
  function loginFromQuery(query: string) {
    const login = query
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/(?:www\.)?twitch\.tv\//, "")
      .replace(/^@/, "")
      .replace(/\/$/, "");
    return validLogin(login) ? login : "";
  }
  function renderList() {
    const q = $<HTMLInputElement>("#q").value.trim().toLowerCase();
    $("#clear-search").hidden = !$<HTMLInputElement>("#q").value;
    const connected = !!library?.user;
    const base = connected ? follows : favorites;
    const matches = base.filter(
      (s) => !q || s.display.toLowerCase().includes(q) || s.twitch.includes(q),
    );
    const rows = [
      ...new Map(
        [...matches, ...(q ? results : [])].map((s) => [s.twitch, s]),
      ).values(),
    ].sort(
      (a, b) =>
        Number(b.twitch === loginFromQuery(q)) -
          Number(a.twitch === loginFromQuery(q)) ||
        Number(b.online) - Number(a.online) ||
        viewers(b) - viewers(a) ||
        a.display.localeCompare(b.display),
    );
    list.classList.toggle("search-results", q.length >= 2);
    list.setAttribute("aria-busy", String(searching));
    const active = document.activeElement;
    const keyboardLogin = list.contains(active)
      ? active?.closest("li")?.dataset.login!
      : null;
    const keyboardFavorite = active?.classList.contains("favorite");
    // Placeholder rows while the first follows or a search are on their way; a status still unknown pulses in its row.
    const pending = searching || (connected && !lastFollows && refreshInFlight);
    const rowHeight = 44; // avatar 28px plus the channel button's padding: the loading rows fill the list down to the fold
    const skeletonCount = pending
      ? Math.max(
          2,
          Math.ceil((list.clientHeight || 600) / rowHeight) - rows.length,
        )
      : 0;
    views.render(
      list,
      <ChannelList
        rows={rows}
        skeletonCount={skeletonCount}
        connected={connected}
        ready={accountReady}
        locked={locked}
        selected={new Set(tiles.keys())}
        favorites={new Set(favorites.map((s) => s.twitch))}
        refreshing={refreshInFlight}
        collaborations={collaborations}
        onToggle={(s) => {
          hidePreview();
          toggle(s);
        }}
        onFavorite={toggleFavorite}
        onPreview={queuePreview}
        onLeavePreview={leavePreview}
      />,
    );
    if (previewController.row) {
      const row = [...list.querySelectorAll<HTMLLIElement>(":scope > li")].find(
        (li) => li.dataset.login === previewController.row!.dataset.login!,
      );
      const s = streamers.find(
        (s) => s.twitch === previewController.row!.dataset.login!,
      );
      if (
        !row ||
        !s ||
        (!preview.hidden && s.online !== previewController.online)
      )
        hidePreview();
      else {
        previewController.row = row;
        if (!preview.hidden) {
          row.setAttribute("aria-describedby", "preview");
          previewInfo(s);
          positionPreview();
        }
      }
    }
    if (keyboardLogin)
      [...list.querySelectorAll<HTMLLIElement>(":scope > li")]
        .find((li) => li.dataset.login === keyboardLogin)
        ?.querySelector<HTMLElement>(
          keyboardFavorite ? ".favorite" : ".channel",
        )
        ?.focus({ preventScroll: true });
    $("#list-empty").hidden = rows.length > 0 || pending || (!q && !connected);
    $("#list-empty").textContent = searching
      ? tr("Recherche en cours…")
      : q
        ? tr("Aucun résultat dans cette liste.")
        : connected
          ? tr("Tu ne suis encore aucune chaîne.")
          : "";
    $("#search-actions").hidden = !searchError || connected;
    $("#search-state").hidden = !q;
    $("#search-state").textContent = !q
      ? ""
      : q.length < 2
        ? tr("Saisis au moins 2 caractères.")
        : searching
          ? tr("Recherche sur Twitch…")
          : searchError ||
            (rows.length
              ? tr(
                  rows.length === 1
                    ? "{count} chaîne trouvée"
                    : "{count} chaînes trouvées",
                  { count: rows.length },
                )
              : tr("Aucune chaîne trouvée."));
    const login = loginFromQuery(q);
    $<HTMLButtonElement>("#add-login").hidden =
      connected ||
      !searchError ||
      !login ||
      favorites.some((s) => s.twitch === login);
    $<HTMLButtonElement>("#add-login").textContent = tr(
      "Ajouter {name} sans vérifier",
      { name: login },
    );
    renderEmpty();
  }
  function renderEmpty() {
    renderLanding();
    const connected = !!library?.user;
    $<HTMLButtonElement>("#top").hidden =
      connected || (accountReady && !library?.clientId);
    $<HTMLButtonElement>("#top").disabled = !accountReady;
    $("#empty p").textContent = connected
      ? tr(
          "Ta grille est vide. Tes follows sont dans la liste, les directs en premier.",
        )
      : tr("Ta grille est vide. Trois gestes et tes streams sont côte à côte.");
  }
  function findStreamer() {
    document.body.classList.remove("collapsed");
    $<HTMLInputElement>("#q").focus();
    save();
  }
  // The landing covers the app until the visitor connects, has favorites or open tiles, or continues without an account (remembered for this tab only).
  let landingWanted = false; // "Revoir la présentation" brings the landing back even with favorites or a dismissed visit
  function renderLanding() {
    const pending =
      !accountReady &&
      (readStored("tg.session", "", sessionStorage) ||
        readStored("tg.oauth", null, sessionStorage));
    const openTiles = restored
      ? order.length
      : readStored<LayoutSnapshot>("tg.layout.guest", {}).order?.length || 0;
    document.body.classList.toggle(
      "landing",
      landingWanted ||
        (!library?.user &&
          !pending &&
          !favorites.length &&
          !openTiles &&
          !readStored("tg.landing", false, sessionStorage)),
    );
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      "#landing .landing-connect",
    )) {
      button.hidden = accountReady && !library?.clientId;
      button.disabled = !accountReady;
    }
  }
  const landingObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          landingObserver.unobserve(entry.target);
        }
    },
    { rootMargin: "0px 0px -15% 0px" },
  );
  function splitReveal() {
    // one span per word so the tagline lights up word by word as it scrolls into view
    for (const el of document.querySelectorAll<HTMLElement>(
      "#landing .reveal",
    )) {
      views.render(el, <WordReveal text={tr(el.dataset.revealKey || "")} />);
      for (const word of el.children) landingObserver.observe(word);
    }
  }
  for (const el of document.querySelectorAll<HTMLElement>("#landing .rise"))
    landingObserver.observe(el);
  async function search() {
    searchController?.abort();
    const version = ++searchVersion,
      query = $<HTMLInputElement>("#q").value.trim();
    results = [];
    searchError = "";
    searching = query.length >= 2;
    rebuild();
    if (!searching) return;
    searchController = new AbortController();
    try {
      const found = await (library || new TwitchLibrary("")).search(
        loginFromQuery(query) || query,
        searchController.signal,
      );
      if (version !== searchVersion) return;
      results = found;
    } catch (cause) {
      const error =
        cause instanceof Error
          ? (cause as HttpError)
          : new HttpError(String(cause));
      if (version !== searchVersion || error.name === "AbortError") return;
      if (error.status === 401) handleError(error);
      else
        searchError = error.status
          ? error.message
          : tr(
              "La recherche Twitch est indisponible pour le moment. Tu peux ajouter un pseudo directement.",
            );
    } finally {
      if (version === searchVersion) {
        searching = false;
        rebuild();
      }
    }
  }

  function handleError(error: unknown) {
    const failure =
      error instanceof Error ? (error as HttpError) : new Error(String(error));
    if (failure instanceof HttpError && failure.status === 401)
      disconnect(false);
    notice(failure.message);
  }
  async function refresh() {
    if (!library || refreshInFlight || lifecycle.disposed) return;
    refreshInFlight = true;
    const version = accountVersion,
      connected = !!library.user;
    if (!lastFollows || streamers.some((s) => s.online == null)) renderList(); // show the rows as loading
    try {
      let nextChannels = connected ? follows : favorites;
      const reloadFollows = connected && Date.now() - lastFollows > 60000;
      if (reloadFollows) nextChannels = await library.follows();
      const logins = [
        ...new Set(
          [...nextChannels, ...order.map((twitch) => ({ twitch }))].map(
            (s) => s.twitch,
          ),
        ),
      ];
      const live = await library.live(logins);
      if (version !== accountVersion) return;
      const update = (s: Channel) =>
        channel({
          ...s,
          profileUrl:
            library.profiles.get(s.twitch)?.profileUrl || s.profileUrl,
          offlineUrl:
            library.profiles.get(s.twitch)?.offlineUrl || s.offlineUrl || "",
          online: live.has(s.twitch),
          previewUrl:
            (connected
              ? live.get(s.twitch)?.thumbnail_url
              : live.get(s.twitch)?.preview_url) ||
            s.previewUrl ||
            "",
          game: live.get(s.twitch)?.game_name || "",
          title: live.get(s.twitch)?.title || "",
          viewer_count: live.get(s.twitch)?.viewer_count ?? 0,
        });
      if (connected) follows = nextChannels.map(update);
      else
        favorites = favorites.map((s) =>
          logins.includes(s.twitch) ? update(s) : s,
        );
      results = results.map((s) => (logins.includes(s.twitch) ? update(s) : s));
      if (reloadFollows) lastFollows = Date.now();
      rebuild();
      if (connected || $("#notice").textContent === tr(statusUnavailable))
        notice();
      for (const [login, t] of tiles)
        if (logins.includes(login)) updateTileInfo(t, update(t.channel));
      syncLiveGrid();
      updateLiveNotifications(connected ? follows : favorites);
      refreshCollaborations();
    } catch (cause) {
      const error =
        cause instanceof Error
          ? (cause as HttpError)
          : new HttpError(String(cause));
      if (version === accountVersion) {
        if (connected) handleError(error);
        else notice(statusUnavailable);
      }
    } finally {
      refreshInFlight = false;
      if (version === accountVersion)
        for (const t of tiles.values())
          if (t.waitingForStatus) {
            // A failed lookup leaves the status unknown; let Twitch try instead of waiting forever.
            t.waitingForStatus = false;
            sync(t);
          }
      if (
        version === accountVersion &&
        (!lastFollows || streamers.some((s) => s.online == null))
      )
        renderList(); // loading rows step aside
      if (version !== accountVersion && !lifecycle.disposed) refresh();
    }
  }
  function disconnect(clearNotice = true) {
    lastLiveStatus.clear();
    for (const login of liveNotifications.keys())
      dismissLiveNotification(login);
    accountVersion++;
    searchVersion++;
    searching = false;
    clearTimeout(searchTimer);
    searchController?.abort();
    searchError = "";
    $<HTMLInputElement>("#q").value = "";
    hidePreview();
    library.disconnect();
    follows = [];
    results = [];
    lastFollows = 0;
    favorites = favorites.map((s) =>
      channel({
        twitch: s.twitch,
        display: s.display,
        profileUrl: s.profileUrl,
      }),
    );
    updateAccount();
    rebuild();
    switchLayout("guest");
    if (clearNotice) notice();
    refresh();
  }
  actions.searchInput = () => {
    clearTimeout(searchTimer);
    searchController?.abort();
    searchVersion++;
    results = [];
    searchError = "";
    searching = $<HTMLInputElement>("#q").value.trim().length >= 2;
    rebuild();
    searchTimer = setTimeout(search, 300);
  };
  actions.clearSearch = () => {
    $<HTMLInputElement>("#q").value = "";
    clearTimeout(searchTimer);
    search();
    $<HTMLInputElement>("#q").focus();
  };
  actions.addLogin = () => {
    const login = loginFromQuery($<HTMLInputElement>("#q").value);
    if (library?.user || !login || favorites.some((s) => s.twitch === login))
      return;
    favorites.push(channel({ twitch: login }));
    notice();
    saveFavorites();
    $<HTMLInputElement>("#q").value = "";
    search();
    refresh();
  };
  actions.searchKey = (e) => {
    if (e.key === "Enter" && !$<HTMLButtonElement>("#add-login").hidden)
      $<HTMLButtonElement>("#add-login").click();
  };
  actions.connect = () => {
    saveCurrentLayout();
    library.connect().catch(handleError);
  };
  actions.findStreamer = findStreamer;
  actions.continueGuest = () => {
    landingWanted = false;
    writeStored("tg.landing", true, sessionStorage);
    renderLanding();
    findStreamer();
  };
  actions.showLanding = () => {
    landingWanted = true;
    renderLanding();
    $("#landing").scrollTop = 0;
    $("#landing-main").focus({ preventScroll: true });
  };
  actions.disconnect = () => disconnect();
  async function init() {
    rebuild();
    loadPlayer();
    let config;
    try {
      const response = await fetch("/config.json", {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error();
      config = await response.json();
    } catch {
      notice(
        tr(
          "La connexion Twitch est indisponible. Les favoris restent accessibles.",
        ),
      );
    }
    if (lifecycle.disposed) return;
    library = new TwitchLibrary(config?.twitchClientId || "");
    try {
      if (library.clientId) await library.resume();
    } catch (cause) {
      const error =
        cause instanceof Error
          ? (cause as HttpError)
          : new HttpError(String(cause));
      library.disconnect();
      notice(error.message);
    }
    if (lifecycle.disposed) return;
    accountReady = true;
    updateAccount();
    rebuild();
    switchLayout(library.user ? "connected" : "guest");
    await refresh();
  }
  initWorkspace();
  addEventListener("preferenceschange", () => {
    $<HTMLSelectElement>("#landing-language").value = preferences.language;
    splitReveal();
  });
  $<HTMLSelectElement>("#landing-language").value = preferences.language;
  splitReveal();
  init().catch((error) => {
    if (!lifecycle.disposed) handleError(error);
  });
  function refreshPosters() {
    if (document.hidden) return;
    for (const t of tiles.values()) if (t.poster?.isConnected) updatePoster(t);
  }
  setInterval(refreshPosters, 60000);
  setInterval(() => {
    if (!document.hidden) refresh();
  }, 30000);
  listenDocument("visibilitychange", () => {
    if (!document.hidden) {
      tiles.forEach(sync);
      refreshPosters();
      refresh();
    }
  });
  setInterval(async () => {
    if (!library?.user) return;
    try {
      await library.validate();
    } catch (cause) {
      const error =
        cause instanceof Error
          ? (cause as HttpError)
          : new HttpError(String(cause));
      disconnect(false);
      notice(error.message);
    }
  }, 3600000);

  let gridAction: GridAction | null = null;
  function gridSummary(item: SavedGrid) {
    if (item.id === "live-follows") return tr("Grille dynamique");
    const count = item.layout.order?.length || 0;
    const text =
      item.id === gridStore!.activeId
        ? tr("Grille actuelle")
        : count
          ? tr(count === 1 ? "{count} tuile" : "{count} tuiles", { count })
          : tr("Aucune tuile");
    return item.layout.locked ? text + " · " + tr("verrouillée") : text;
  }
  function renderGridLauncher() {
    $("#current-grid-name").textContent = gridStore
      ? gridStore!.label()
      : tr("Grille par défaut");
    $<HTMLButtonElement>("#grid-clear").disabled =
      !restored || locked || isLiveGrid() || !tiles.size;
    const lock = $<HTMLButtonElement>("#grid-lock");
    lock.setAttribute("aria-pressed", String(locked));
    lock.disabled = !restored || isLiveGrid();
    lock.title = tr(
      locked ? "Déverrouiller la grille" : "Verrouiller la grille",
    );
    lock.setAttribute("aria-label", lock.title);
    const menu = $("#grid-menu-list");
    views.render(
      menu,
      <SavedGridList
        items={gridStore?.items || []}
        activeId={gridStore?.activeId}
        label={(item) => gridStore!.label(item)}
        summary={gridSummary}
        onOpen={(id) => {
          document.querySelector<HTMLDetailsElement>("#grid-switcher")!.open =
            false;
          switchNamedGrid(id);
        }}
      />,
    );
  }
  function nextGridName() {
    let n = gridStore!.items.length + 1;
    while (
      gridStore!.items.some(
        (item) =>
          gridStore!.label(item).toLocaleLowerCase() ===
          tr("Grille {n}", { n }).toLocaleLowerCase(),
      )
    )
      n++;
    return tr("Grille {n}", { n });
  }
  function renderSavedGrids() {
    const list = $("#saved-grids");
    views.render(
      list,
      <SavedGridList
        items={gridStore?.items || []}
        activeId={gridStore?.activeId}
        label={(item) => gridStore!.label(item)}
        summary={gridSummary}
        manage
        ready={restored}
        onOpen={(id) => {
          switchNamedGrid(id);
          document.querySelector<HTMLDialogElement>("#grids-dialog")!.close();
        }}
        onAction={openGridForm}
      />,
    );
    $<HTMLButtonElement>("#grid-save-copy").disabled = !restored;
    $<HTMLButtonElement>("#grid-new").disabled = !restored;
  }
  function openGrids() {
    saveCurrentLayout();
    gridAction = null;
    $("#grids-overview").hidden = false;
    $<HTMLFormElement>("#grid-form").hidden = true;
    renderSavedGrids();
    closeTileMenus();
    hidePreview();
    $<HTMLDialogElement>("#grids-dialog").showModal();
  }
  function switchNamedGrid(id: string) {
    if (!gridStore || gridStore!.activeId === id || !restored) return;
    saveCurrentLayout();
    restored = false;
    clearTiles();
    gridStore!.select(id);
    restore();
    renderList();
    refresh();
  }
  function openGridForm(
    kind: GridAction["kind"],
    id: string | null = null,
    participants: Channel[] = [],
    source: Channel | null = null,
  ) {
    gridAction = { kind, id, participants, source };
    const dialog = $<HTMLDialogElement>("#grids-dialog");
    $<HTMLFormElement>("#grid-form").dataset.kind = kind;
    const item = id ? gridStore!.items.find((item) => item.id === id) : null;
    const name = $<HTMLInputElement>("#grid-name");
    name.value = item
      ? gridStore!.label(item)
      : kind === "collaboration"
        ? tr("Collaboration · {name}", { name: source!.display })
        : kind === "copy"
          ? gridStore!.label()
          : nextGridName();
    $("#grids-overview").hidden = true;
    $<HTMLFormElement>("#grid-form").hidden = false;
    $("#grid-name-label").hidden = kind === "delete";
    name.disabled = kind === "delete";
    $("#grid-delete-description").hidden = kind !== "delete";
    $("#grid-form-error").textContent = "";
    name.removeAttribute("aria-invalid");
    updateGridFormLabels();
    closeTileMenus();
    hidePreview();
    if (!dialog.open) dialog.showModal();
    if (kind === "delete") $<HTMLButtonElement>("#grid-form-submit").focus();
    else {
      name.focus();
      name.select();
    }
  }
  function updateGridFormLabels() {
    if (!gridAction) return;
    const { kind, id } = gridAction;
    $("#grid-form-title").textContent =
      kind === "delete"
        ? tr("Supprimer « {name} » ?", {
            name: gridStore!.label(
              gridStore!.items.find((item) => item.id === id),
            ),
          })
        : tr(
            kind === "rename"
              ? "Renommer"
              : kind === "copy"
                ? "Enregistrer sous…"
                : "Nouvelle grille",
          );
    $<HTMLButtonElement>("#grid-form-submit").textContent = tr(
      kind === "delete"
        ? "Supprimer"
        : kind === "rename" || kind === "copy"
          ? "Enregistrer"
          : "Créer la grille",
    );
  }
  function submitGridForm(event: { preventDefault(): void }) {
    event.preventDefault();
    if (!gridAction || !restored) return;
    const { kind, id, participants, source } = gridAction,
      name = $<HTMLInputElement>("#grid-name").value.trim();
    if (
      kind !== "delete" &&
      (!name ||
        gridStore!.items.some(
          (item) =>
            item.id !== id &&
            gridStore!.label(item).toLocaleLowerCase() ===
              name.toLocaleLowerCase(),
        ))
    ) {
      $("#grid-form-error").textContent = tr(
        name
          ? "Choisis un nom différent pour cette grille."
          : "Donne un nom à cette grille.",
      );
      $<HTMLInputElement>("#grid-name").setAttribute("aria-invalid", "true");
      $<HTMLInputElement>("#grid-name").focus();
      return;
    }
    saveCurrentLayout();
    if (kind === "rename") gridStore!.rename(id!, name);
    else if (kind === "delete") {
      const deletingActive = gridStore!.activeId === id;
      if (deletingActive) {
        restored = false;
        clearTiles();
      }
      gridStore!.remove(id!);
      if (deletingActive) {
        restore();
        renderList();
        refresh();
      }
    } else if (kind === "copy") {
      gridStore!.create(name, currentLayout());
      save();
    } else {
      let snapshot: LayoutSnapshot = {
        order: [],
        collapsed: document.body.classList.contains("collapsed"),
      };
      if (kind === "collaboration") {
        const channels = [
          ...new Map(
            participants.filter((s) => s.online).map((s) => [s.twitch, s]),
          ).values(),
        ];
        const main =
          channels.find((s) => s.twitch === source!.twitch) || channels[0];
        // a multi-stream opens as a plain grid, everyone equal, only the source audible, and locked so nobody else joins by accident
        snapshot = {
          ...snapshot,
          order: channels.map((s) => s.twitch),
          channels,
          locked: true,
          muted: Object.fromEntries(
            channels.map((s) => [s.twitch, s !== main]),
          ),
        };
      }
      restored = false;
      clearTiles();
      gridStore!.create(name, snapshot);
      restore();
      renderList();
      refresh();
    }
    renderGridLauncher();
    gridAction = null;
    $<HTMLDialogElement>("#grids-dialog").close();
  }
  let currentPlayerMode = preferences.player;
  function refreshPreferences() {
    if (currentPlayerMode !== preferences.player) {
      currentPlayerMode = preferences.player;
      hidePreview();
      for (const t of tiles.values()) releasePlayer(t);
      if (playerConstructor()) {
        restore();
        layout();
        refresh();
      } else loadPlayer();
    }
    notice(relocalizeMessage($("#notice").textContent));
    searchError = relocalizeMessage(searchError);
    $("#grid-form-error").textContent = relocalizeMessage(
      $("#grid-form-error").textContent,
    );
    translateTree();
    renderGridLauncher();
    renderSavedGrids();
    updateGridFormLabels();
    refreshNumberFormat();
    for (const channels of [streamers, favorites, follows, results])
      for (const s of channels) {
        if (s.viewersAmount.formatted)
          s.viewersAmount.formatted = numberFormat.format(
            s.viewersAmount.number,
          );
      }
    updateAccount();
    rebuild();
    for (const t of tiles.values()) {
      paint(t);
      updateTileInfo(t, t.channel);
      t.chat.setAttribute(
        "aria-label",
        tr("Chat de {name}", { name: t.channel.display }),
      );
      const frame = t.el.querySelector<HTMLElement>(
        ".player iframe, .player video",
      );
      if (frame)
        nameFrame(frame, tr("Stream de {name}", { name: t.channel.display }));
      t.chat
        .querySelector<HTMLIFrameElement | HTMLVideoElement>("iframe, video")
        ?.setAttribute(
          "title",
          tr("Chat de {name}", { name: t.channel.display }),
        );
      const button = t.bar.querySelector<HTMLButtonElement>(".fs")!;
      button.title = tr(
        expanded === t.el.dataset.login
          ? "Revenir à la disposition précédente"
          : "Agrandir dans la fenêtre",
      );
      button.setAttribute("aria-label", button.title);
      t.chatOptions.querySelector<HTMLAnchorElement>("a")!.href =
        `https://www.twitch.tv/popout/${t.el.dataset.login!}/chat?popout=` +
        (document.documentElement.dataset.theme === "dark"
          ? "&darkpopout=1"
          : "");
    }
    for (const [login, toast] of liveNotifications) {
      const s = (library.user ? follows : favorites).find(
        (s) => s.twitch === login,
      );
      if (s)
        toast.querySelector<HTMLElement>("b")!.textContent = tr(
          "{name} est en direct",
          { name: s.display },
        );
    }
    syncChat();
    hidePreview();
    paintMuteAll();
    $<HTMLSelectElement>("#language-setting").value = preferences.language;
    $<HTMLSelectElement>("#theme-setting").value = preferences.theme;
    $<HTMLSelectElement>("#player-setting").value = preferences.player;
  }
  function initWorkspace() {
    translateTree();
    renderGridLauncher();
    actions.openGrids = openGrids;
    actions.openGridManager = () => {
      $<HTMLDetailsElement>("#grid-switcher").open = false;
      openGrids();
    };
    actions.toggleGridMenu = (menu) => {
      if (menu.open) {
        closeTileMenus(false, menu);
        hidePreview();
      }
    };
    actions.clearGrid = () => {
      if (!restored || locked || isLiveGrid() || !tiles.size) return;
      clearTiles();
      layout();
      renderList();
      save();
    };
    actions.toggleLock = () => {
      if (!restored || isLiveGrid()) return;
      locked = !locked;
      renderList();
      layout();
    };
    $<HTMLSelectElement>("#language-setting").value = preferences.language;
    $<HTMLSelectElement>("#theme-setting").value = preferences.theme;
    $<HTMLSelectElement>("#player-setting").value = preferences.player;
    actions.setLanguage = (value) => setPreference("language", value);
    actions.setPlayer = (value) => setPreference("player", value);
    actions.setTheme = (value) => setPreference("theme", value);
    actions.copyGrid = () => openGridForm("copy");
    actions.newGrid = () => openGridForm("new");
    actions.cancelGridForm = () => {
      gridAction = null;
      $<HTMLFormElement>("#grid-form").hidden = true;
      $("#grids-overview").hidden = false;
      renderSavedGrids();
    };
    actions.submitGridForm = submitGridForm;
    actions.clearGridError = () => {
      $<HTMLInputElement>("#grid-name").removeAttribute("aria-invalid");
      $("#grid-form-error").textContent = "";
    };
    addEventListener("preferenceschange", refreshPreferences);
  }

  if (import.meta.env.VITE_TEST_API === "true") {
    Object.defineProperties(window, {
      list: { configurable: true, get: () => list },
      grid: { configurable: true, get: () => grid },
      tiles: { configurable: true, get: () => tiles },
      focused: {
        configurable: true,
        get: () => focused,
        set: (value: typeof focused) => {
          focused = value;
        },
      },
      locked: {
        configurable: true,
        get: () => locked,
        set: (value: typeof locked) => {
          locked = value;
        },
      },
      mutedAll: {
        configurable: true,
        get: () => mutedAll,
        set: (value: typeof mutedAll) => {
          mutedAll = value;
        },
      },
      expanded: {
        configurable: true,
        get: () => expanded,
        set: (value: typeof expanded) => {
          expanded = value;
        },
      },
      order: {
        configurable: true,
        get: () => order,
        set: (value: typeof order) => {
          order = value;
        },
      },
      dragging: {
        configurable: true,
        get: () => dragging,
        set: (value: typeof dragging) => {
          dragging = value;
        },
      },
      allPaused: {
        configurable: true,
        get: () => allPaused,
        set: (value: typeof allPaused) => {
          allPaused = value;
        },
      },
      restored: {
        configurable: true,
        get: () => restored,
        set: (value: typeof restored) => {
          restored = value;
        },
      },
      layoutMode: {
        configurable: true,
        get: () => layoutMode,
        set: (value: typeof layoutMode) => {
          layoutMode = value;
        },
      },
      gridStore: {
        configurable: true,
        get: () => gridStore,
        set: (value: typeof gridStore) => {
          gridStore = value;
        },
      },
      collaborationRefreshInFlight: {
        configurable: true,
        get: () => collaborationRefreshInFlight,
        set: (value: typeof collaborationRefreshInFlight) => {
          collaborationRefreshInFlight = value;
        },
      },
      preview: { configurable: true, get: () => preview },
      previewRow: {
        configurable: true,
        get: () => previewController.row,
        set: (value: typeof previewController.row) => {
          previewController.row = value;
        },
      },
      previewPlayer: {
        configurable: true,
        get: () => previewController.player,
        set: (value: typeof previewController.player) => {
          previewController.player = value;
        },
      },
      follows: {
        configurable: true,
        get: () => follows,
        set: (value: typeof follows) => {
          follows = value;
        },
      },
      results: {
        configurable: true,
        get: () => results,
        set: (value: typeof results) => {
          results = value;
        },
      },
      refreshInFlight: {
        configurable: true,
        get: () => refreshInFlight,
        set: (value: typeof refreshInFlight) => {
          refreshInFlight = value;
        },
      },
      lastFollows: {
        configurable: true,
        get: () => lastFollows,
        set: (value: typeof lastFollows) => {
          lastFollows = value;
        },
      },
      lastLiveStatus: { configurable: true, get: () => lastLiveStatus },
      favorites: {
        configurable: true,
        get: () => favorites,
        set: (value: typeof favorites) => {
          favorites = value;
        },
      },
      tilePaused: { configurable: true, get: () => tilePaused },
      syncLiveGrid: { configurable: true, get: () => syncLiveGrid },
      currentLayout: { configurable: true, get: () => currentLayout },
      save: { configurable: true, get: () => save },
      restore: { configurable: true, get: () => restore },
      sync: { configurable: true, get: () => sync },
      watchdog: { configurable: true, get: () => watchdog },
      mark: { configurable: true, get: () => mark },
      updateAudioOverlay: { configurable: true, get: () => updateAudioOverlay },
      viewers: { configurable: true, get: () => viewers },
      queuePreview: { configurable: true, get: () => queuePreview },
      toggle: { configurable: true, get: () => toggle },
      trackOnline: { configurable: true, get: () => trackOnline },
      updateTileInfo: { configurable: true, get: () => updateTileInfo },
      add: { configurable: true, get: () => add },
      showPoster: { configurable: true, get: () => showPoster },
      remove: { configurable: true, get: () => remove },
      clearTiles: { configurable: true, get: () => clearTiles },
      move: { configurable: true, get: () => move },
      setMuted: { configurable: true, get: () => setMuted },
      playerMuted: { configurable: true, get: () => playerMuted },
      focus: { configurable: true, get: () => focus },
      layout: { configurable: true, get: () => layout },
      push: { configurable: true, get: () => push },
      updateLiveNotifications: {
        configurable: true,
        get: () => updateLiveNotifications,
      },
      notice: { configurable: true, get: () => notice },
      rebuild: { configurable: true, get: () => rebuild },
      search: { configurable: true, get: () => search },
      refresh: { configurable: true, get: () => refresh },
      disconnect: { configurable: true, get: () => disconnect },
      channel: { configurable: true, get: () => channel },
      preferences: { configurable: true, get: () => preferences },
      switchNamedGrid: { configurable: true, get: () => switchNamedGrid },
    });
  }
  return () => {
    unloading = true;
    accountVersion++;
    searchVersion++;
    searchController?.abort();
    finishDrag();
    hidePreview();
    clearTiles();
    lifecycle.dispose();
    views.dispose();
  };
}
