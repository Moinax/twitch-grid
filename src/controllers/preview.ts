import { playerConstructor } from "../services/player";
import type { Channel } from "../types/domain";
import type { TwitchPlayer } from "../types/player";
import type { createLifecycle } from "./lifecycle";
import { tr } from "../services/preferences";
import { fit, nameFrame, previewImageURL } from "./videoLayout";
interface PreviewOptions {
  element: HTMLElement;
  side: HTMLElement;
  list: HTMLElement;
  getChannels: () => Channel[];
  lifecycle: ReturnType<typeof createLifecycle>;
}
export function createPreviewController({
  element,
  side,
  list,
  getChannels,
  lifecycle,
}: PreviewOptions) {
  const { setTimeout } = lifecycle;
  const clearTimeout = (id: number | undefined) => window.clearTimeout(id);
  const preview = element,
    previewMessage = preview.querySelector<HTMLElement>(".preview-message")!,
    previewVideo = preview.querySelector<HTMLDivElement>(".player")!,
    previewPoster = preview.querySelector<HTMLImageElement>(".stream-poster")!;
  previewPoster.onerror = () => {
    previewPoster.hidden = true;
  };
  let previewRow: HTMLLIElement | null = null,
    previewOnline: boolean | null = null,
    previewPlayer: TwitchPlayer | null = null,
    previewReady = false,
    previewNudgedAt = 0,
    previewTimer: number | undefined,
    previewCloseTimer: number | undefined,
    previewLoadTimer: number | undefined;
  // the embed does not always emit its playing event, and like the tiles it can sit in Ready until nudged with a play():
  // poll the playback state every tick, nudge at most every 5s, and fade the overlay out once it plays
  function markPreview() {
    if (preview.hidden || !previewPlayer || !previewReady || document.hidden)
      return;
    const st = previewPlayer.getPlayerState().playback;
    if (st === "Playing") {
      clearTimeout(previewLoadTimer);
      preview.classList.add("playing");
      preview.classList.remove("preview-failed");
      previewMessage.hidden = true;
      return;
    }
    if (st !== "Buffering" && Date.now() - previewNudgedAt > 5000) {
      previewPlayer.play();
      previewNudgedAt = Date.now();
    }
  }
  // The card fades out over its still: the player goes at once, the box waits for the transition before it leaves the page.
  let previewFadeTimer: number | undefined;
  function hidePreview() {
    clearTimeout(previewTimer);
    clearTimeout(previewCloseTimer);
    clearTimeout(previewLoadTimer);
    previewRow?.removeAttribute("aria-describedby");
    previewRow = null;
    preview.classList.remove("in");
    const player = previewPlayer;
    previewPlayer = null;
    previewReady = false;
    player?.destroy();
    previewVideo.replaceChildren();
    clearTimeout(previewFadeTimer);
    previewFadeTimer = setTimeout(() => {
      if (preview.classList.contains("in")) return; // shown again meanwhile
      preview.hidden = true;
      preview.classList.remove("playing", "player-ready", "preview-failed");
      previewMessage.hidden = true;
    }, 250);
  }
  function positionPreview() {
    if (!previewRow || preview.hidden) return;
    const r = previewRow.getBoundingClientRect(),
      edge = side.getBoundingClientRect().right;
    preview.style.left =
      Math.max(8, Math.min(edge + 10, innerWidth - preview.offsetWidth - 8)) +
      "px";
    preview.style.top =
      Math.max(8, Math.min(r.top, innerHeight - preview.offsetHeight - 8)) +
      "px";
    fit(previewVideo);
  }
  function previewInfo(s: Channel) {
    preview.querySelector<HTMLElement>(".name")!.textContent = s.display;
    const game = s.online === false ? "" : s.game,
      title = s.online === false ? "" : s.title;
    const viewers =
      s.online && s.viewersAmount.formatted
        ? s.viewersAmount.formatted + " spectateurs"
        : "";
    for (const [selector, value] of [
      [".category", game],
      [".stream-title", title],
      [".viewers", viewers],
    ]) {
      const field = preview.querySelector<HTMLElement>(selector)!;
      field.textContent = value;
      field.hidden = !value;
      field.title = value;
    }
  }
  function showPreview(row: HTMLLIElement) {
    const s = getChannels().find((s) => s.twitch === row.dataset.login!);
    if (!s || s.online === false || !row.isConnected || document.hidden) {
      hidePreview();
      return;
    }
    previewRow = row;
    previewOnline = s.online;
    previewInfo(s);
    const src = previewImageURL(s);
    if (previewPoster.getAttribute("src") !== src) {
      previewPoster.hidden = !src;
      if (src) previewPoster.src = src;
      else previewPoster.removeAttribute("src");
    }
    row.setAttribute("aria-describedby", "preview");
    const status = preview.querySelector<HTMLElement>(".status")!,
      message = status.querySelector<HTMLElement>("span")!;
    status.querySelector<HTMLImageElement>("img")!.src = s.profileUrl;
    message.textContent = tr("Chargement de l’aperçu…");
    status.hidden = false;
    preview.classList.remove("playing", "player-ready", "preview-failed");
    previewMessage.hidden = true;
    clearTimeout(previewFadeTimer);
    preview.hidden = false;
    positionPreview();
    void preview.offsetWidth; // commit the hidden state so the entrance transitions
    preview.classList.add("in");
    if (!playerConstructor()) {
      message.textContent = tr("Aperçu indisponible");
      return;
    }
    previewTimer = setTimeout(loadPreview, 300);
  }
  function loadPreview() {
    const s = getChannels().find(
      (s) => s.twitch === previewRow?.dataset.login!,
    );
    if (
      !s ||
      s.online === false ||
      !previewRow?.isConnected ||
      preview.hidden ||
      document.hidden ||
      previewPlayer
    )
      return;
    const status = preview.querySelector<HTMLElement>(".status")!,
      message = status.querySelector<HTMLElement>("span")!;
    const player = new (playerConstructor()!)(previewVideo, {
      channel: s.twitch,
      parent: [location.hostname],
      width: 640,
      height: 360,
      autoplay: false,
      muted: true,
      controls: false,
    });
    previewPlayer = player;
    previewNudgedAt = Date.now();
    const frame = previewVideo.querySelector<
      HTMLIFrameElement | HTMLVideoElement
    >("iframe, video")!;
    frame.tabIndex = -1;
    nameFrame(frame, tr("Aperçu de {name}", { name: s.display }));
    fit(previewVideo);
    const current = () => previewPlayer === player && !preview.hidden;
    player.addEventListener(playerConstructor()!.READY, () => {
      if (!current()) return;
      previewReady = true;
      preview.classList.add("player-ready");
      previewMessage.textContent = tr("Chargement de l’aperçu…");
      previewMessage.hidden = false;
      player.setMuted(true);
      player.setVolume(0);
      // Leave time for the browser to report the now-uncovered iframe as visible.
      previewTimer = setTimeout(() => {
        if (current()) {
          player.play();
          previewNudgedAt = Date.now();
          markPreview();
        }
      }, 400);
    });
    player.addEventListener(playerConstructor()!.PLAYING, () => {
      if (current()) markPreview();
    }); // the overlay fades out in CSS
    for (const event of ["offline", "playbackBlocked", "error"])
      player.addEventListener(event, () => {
        if (!current()) return;
        if (event === "offline") {
          hidePreview();
          return;
        }
        clearTimeout(previewLoadTimer);
        preview.classList.remove("playing");
        preview.classList.add("preview-failed");
        status.hidden = false;
        message.textContent = tr("Aperçu indisponible");
        previewMessage.textContent = message.textContent;
        previewMessage.hidden = false;
      });
    previewLoadTimer = setTimeout(() => {
      if (!current()) return;
      message.textContent = tr("L’aperçu tarde à démarrer");
      previewMessage.textContent = message.textContent;
      previewMessage.hidden = false;
    }, 12000);
  }
  // A pointer sweeping down the list should not flash a card per row: the first card waits, then follows the pointer at once.
  function queuePreview(row: HTMLLIElement) {
    clearTimeout(previewCloseTimer);
    if (previewRow === row && !preview.hidden) {
      resumePreview();
      return;
    }
    const open = preview.classList.contains("in");
    hidePreview();
    if (open) showPreview(row);
    else {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(
        () =>
          showPreview(
            list.querySelector<HTMLLIElement>(
              `[data-login="${CSS.escape(row.dataset.login!)}"]`,
            ) || row,
          ),
        250,
      );
    } // the list may have re-rendered meanwhile
  }
  function leavePreview() {
    clearTimeout(previewTimer);
    clearTimeout(previewCloseTimer);
    previewCloseTimer = setTimeout(hidePreview, 180);
  }
  function resumePreview() {
    clearTimeout(previewCloseTimer);
    if (preview.hidden) return;
    clearTimeout(previewTimer);
    if (!previewPlayer) previewTimer = setTimeout(loadPreview, 300);
    else if (previewReady) {
      const player = previewPlayer;
      previewTimer = setTimeout(() => {
        if (previewPlayer === player && !preview.hidden && !document.hidden) {
          player.play();
          previewNudgedAt = Date.now();
        }
      }, 400);
    }
  }
  preview.onpointerenter = resumePreview;
  preview.onpointerleave = leavePreview;
  list.addEventListener("scroll", hidePreview, {
    passive: true,
    signal: lifecycle.signal,
  });
  lifecycle.addEventListener("resize", hidePreview);
  lifecycle.addEventListener("blur", hidePreview);
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) hidePreview();
    },
    { signal: lifecycle.signal },
  );

  // Sidebar and Twitch account integration.

  return {
    markPreview,
    hidePreview,
    positionPreview,
    previewInfo,
    queuePreview,
    leavePreview,
    get row() {
      return previewRow;
    },
    set row(value: HTMLLIElement | null) {
      previewRow = value;
    },
    get online() {
      return previewOnline;
    },
    get player() {
      return previewPlayer;
    },
    set player(value: TwitchPlayer | null) {
      previewPlayer = value;
    },
  };
}
