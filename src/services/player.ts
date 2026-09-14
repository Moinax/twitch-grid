import type Hls from "hls.js";
import type { Latency } from "../types/domain";
import type { TwitchPlayer, PlayerConstructor } from "../types/player";
import { preferences, setPreference, tr } from "./preferences";

type Options = ConstructorParameters<PlayerConstructor>[1];

export class CustomPlayer implements TwitchPlayer {
  static READY = "ready";
  static PLAYING = "playing";
  static GRACE = 10000; // ms a broken stream may take to come back before the retry shows
  static AUTO_ICON =
    '<svg class="icon-auto" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 4 1.6 4.4L15 10l-4.4 1.6L9 16l-1.6-4.4L3 10l4.4-1.6zM18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z"/></svg>';
  static MANUAL_ICON =
    '<svg class="icon-manual" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  readonly video = document.createElement("video");
  private hls: Hls | null = null;
  private listeners = new Map<string, (() => void)[]>();
  private destroyed = false;
  private failed = false;
  private playing = false;
  private quality = "auto";
  private qualityHeight = 0;
  private recoveryTimer?: ReturnType<typeof setTimeout>;
  private source: string;
  private latency: Latency;
  private retry = document.createElement("button");
  private error = document.createElement("div");
  private fallback = document.createElement("button");
  private bar = document.createElement("div");
  private qualityMenu = document.createElement("details");
  private qualityText = document.createElement("span");
  private levels = document.createElement("div");
  private latencies = document.createElement("div");
  private slider = document.createElement("input");
  private soundButton: HTMLButtonElement;
  private spotlightButton: HTMLButtonElement;

  constructor(element: HTMLElement, options: Options) {
    this.latency = options.latency ?? preferences.latency;
    const video = this.video;
    video.className = "custom-video";
    video.playsInline = true;
    video.muted = options.muted;
    video.controls = false; // the themed bar below replaces the browser's own chrome
    video.preload = "none";
    this.source = `/api/stream?channel=${encodeURIComponent(options.channel)}`;
    this.retry.className = "custom-retry";
    this.retry.type = "button";
    this.retry.hidden = true;
    this.retry.addEventListener("click", (event) => {
      event.stopPropagation();
      if (this.failed) void this.load(true);
      else this.play();
    });
    // A stream this player cannot read may still play in the official embed: offer the switch.
    this.error.className = "custom-error";
    this.fallback.className = "custom-fallback";
    this.fallback.type = "button";
    this.fallback.hidden = true;
    this.fallback.dataset.i18n = "Utiliser le lecteur Twitch";
    this.fallback.textContent = tr("Utiliser le lecteur Twitch");
    this.fallback.addEventListener("click", (event) => {
      event.stopPropagation();
      setPreference("player", "embed");
    });
    this.error.append(this.retry, this.fallback);
    this.bar.className = "custom-controls paused";
    this.bar.addEventListener("click", (event) => event.stopPropagation()); // the player itself resumes on click
    this.bar.addEventListener("dblclick", (event) => event.stopPropagation());
    const label = (element: HTMLElement, key: string) => {
      element.title = tr(key);
      element.dataset.i18nTitle = key;
      element.setAttribute("aria-label", tr(key));
      element.dataset.i18nAriaLabel = key;
    };
    const button = (
      name: string,
      key: string,
      icon: string,
      onClick: () => void,
    ) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "custom-" + name;
      label(element, key);
      element.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`;
      element.addEventListener("click", onClick);
      return element;
    };
    // The tile keeps the last word on pause and sound: go through the media element, the watchdog reads it back.
    const playPause = button(
      "pp",
      "Play/pause",
      '<g class="pause"><path d="M8 5v14M16 5v14"/></g><g class="play"><path d="M7 4v16l13-8z" fill="currentColor"/></g>',
      () => (video.paused ? this.play() : this.pause()),
    );
    const sound = (this.soundButton = button(
      "sound",
      "Son",
      '<path d="M11 5 6 9H2v6h4l5 4z"/><g class="on"><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></g><g class="off"><path d="m23 9-6 6"/><path d="m17 9 6 6"/></g>',
      () => {
        this.setMuted(!video.muted);
        this.emit("volumechange"); // the viewer's hand on the bar: the tile takes it at once
      },
    ));
    this.slider.className = "custom-volume";
    this.slider.type = "range";
    this.slider.min = "0";
    this.slider.max = "1";
    this.slider.step = "0.05";
    label(this.slider, "Volume");
    this.slider.addEventListener("input", () => {
      this.setVolume(Number(this.slider.value));
      this.setMuted(Number(this.slider.value) === 0);
      this.emit("volumechange");
    });
    video.addEventListener("volumechange", () => this.paintSound());
    this.paintSound();
    // One dropdown for what the player alone knows: the rendered resolution, with the levels and the latency to choose from.
    this.qualityMenu.className = "custom-quality";
    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", tr("Résolution et latence")); // no title: a tooltip would sit on the open menu
    summary.dataset.i18nAriaLabel = "Résolution et latence";
    summary.innerHTML = CustomPlayer.AUTO_ICON + CustomPlayer.MANUAL_ICON;
    summary.append(this.qualityText);
    this.qualityText.textContent = tr("Auto");
    const menu = document.createElement("div");
    menu.className = "custom-menu";
    const heading = (key: string) => {
      const element = document.createElement("div");
      element.className = "custom-menu-heading";
      element.dataset.i18n = key;
      element.textContent = tr(key);
      return element;
    };
    this.levels.className = "custom-levels";
    this.latencies.className = "custom-latencies";
    const group = (...children: HTMLElement[]) => {
      const element = document.createElement("div");
      element.className = "custom-menu-group";
      element.append(...children);
      return element;
    };
    const players = document.createElement("div");
    players.className = "custom-players";
    for (const [value, key] of [
      ["custom", "Lecteur custom"],
      ["embed", "Embed Twitch"],
    ] as const) {
      const option = this.option(key, value === "custom");
      option.disabled = !options.onPlayerChange;
      option.addEventListener("click", () => {
        this.qualityMenu.open = false;
        if (value !== "custom") options.onPlayerChange?.(value);
      });
      players.append(option);
    }
    menu.append(
      group(heading("Résolution"), this.levels),
      group(heading("Latence"), this.latencies),
      group(heading("Lecteur vidéo"), players),
    );
    this.qualityMenu.append(summary, menu);
    // The tile clips its overflow, so the menu is fixed and placed by hand: below the badge when there is room, else above.
    this.qualityMenu.addEventListener("toggle", () => {
      if (!this.qualityMenu.open) return;
      const anchor = summary.getBoundingClientRect(),
        below = innerHeight - anchor.bottom - 18,
        above = anchor.top - 18,
        up = below < menu.scrollHeight && above > below;
      menu.classList.toggle("up", up);
      menu.style.maxHeight =
        Math.max(0, Math.min(360, up ? above : below)) + "px";
      menu.style.right = Math.max(12, innerWidth - anchor.right) + "px";
      menu.style.top = up ? "auto" : anchor.bottom + 6 + "px";
      menu.style.bottom = up ? innerHeight - anchor.top + 6 + "px" : "auto";
    });
    this.paintLevels([]);
    for (const [value, key] of [
      ["stable", "Stable"],
      ["low", "Faible"],
    ] as const) {
      const option = this.option(key, this.latency === value);
      option.dataset.latency = value;
      option.disabled = !options.onLatencyChange;
      option.addEventListener("click", () => {
        this.qualityMenu.open = false;
        if (value !== this.latency) options.onLatencyChange?.(value);
      });
      this.latencies.append(option);
    }
    video.addEventListener("resize", () =>
      this.paintQuality(video.videoHeight),
    );
    // The spotlight lives here too: the tile header keeps the rest.
    const spotlight = (this.spotlightButton = button(
      "spotlight",
      "Spotlight (SHIFT+CLICK)",
      '<rect x="3" y="5" width="12" height="14" rx="1"/><rect x="17" y="5" width="4" height="6" rx="1"/><rect x="17" y="13" width="4" height="6" rx="1"/>',
      () => options.onSpotlight?.(),
    ));
    spotlight.setAttribute("aria-pressed", "false");
    spotlight.hidden = !options.onSpotlight;
    // Fullscreen the whole tile, so its bar keeps offering the chat and the rest.
    const fullscreen = button(
      "fullscreen",
      "Plein écran",
      '<g class="enter"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></g><g class="exit"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></g>',
      () => this.toggleFullscreen(element),
    );
    // At rest only the resolution shows, and the sound icon while the sound is on; the pointer over the video
    // unfolds the rest of the bar around them.
    const fold = (...buttons: HTMLElement[]) => {
      const actions = document.createElement("span"),
        row = document.createElement("span");
      actions.className = "custom-actions";
      row.append(...buttons);
      actions.append(row);
      return actions;
    };
    this.bar.append(
      fold(playPause),
      sound,
      fold(this.slider, spotlight, fullscreen),
      this.qualityMenu,
    );
    element.append(video, this.error);
    // Above the pause overlay, which sits outside the embed's stacking context.
    (element.closest(".player") || element).append(this.bar);
    for (const event of [
      "play",
      "playing",
      "pause",
      "ended",
      "waiting",
      "error",
    ]) {
      video.addEventListener(event, () => {
        this.playing = event === "playing";
        this.bar.classList.toggle("paused", video.paused);
        if (event === "error") {
          this.fail();
          return;
        }
        if (event === "playing") {
          this.retry.hidden = this.fallback.hidden = true;
          clearTimeout(this.recoveryTimer);
          this.recoveryTimer = undefined;
        }
        this.emit(event);
      });
    }
    void this.load(options.autoplay);
  }
  private toggleFullscreen(element: HTMLElement) {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void (element.closest(".tile") || element).requestFullscreen();
  }
  private paintSound() {
    this.bar.classList.toggle(
      "muted",
      this.video.muted || this.video.volume === 0,
    );
    this.slider.value = String(this.video.muted ? 0 : this.video.volume);
  }
  private fail() {
    if (this.destroyed) return;
    this.failed = true;
    this.hls?.stopLoad();
    this.retry.textContent = tr("Flux indisponible. Réessayer");
    this.retry.hidden = false;
    this.fallback.hidden = false;
    this.emit("error");
  }
  private async load(autoplay: boolean) {
    this.retry.hidden = this.fallback.hidden = true;
    this.failed = false;
    clearTimeout(this.recoveryTimer);
    this.recoveryTimer = undefined;
    this.hls?.destroy();
    this.hls = null;
    let Hls: typeof import("hls.js").default;
    try {
      Hls = (await import("hls.js")).default;
    } catch {
      this.fail();
      return;
    }
    if (this.destroyed) return;
    const video = this.video;
    if (Hls.isSupported()) {
      const hls = (this.hls = new Hls({
        lowLatencyMode: true,
        capLevelToPlayerSize: true,
        backBufferLength: 15,
        maxBufferLength: 20,
        ...CustomPlayer.latencyConfig(this.latency),
      }));
      // A live stream hiccups: retry quietly behind the loader and only give up once it stays away.
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else hls.startLoad();
        this.recoveryTimer ??= setTimeout(() => {
          if (!this.playing) this.fail();
        }, CustomPlayer.GRACE);
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.paintLevels(
          [...new Set(hls.levels.map((level) => level.height))]
            .filter(Boolean)
            .sort((a, b) => b - a),
        );
        this.setQuality(this.quality); // a quality kept across a remount only lands once the levels are known
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) =>
        this.paintQuality(hls.levels[data.level]?.height),
      );
      hls.loadSource(this.source);
      hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = this.source;
    } else {
      this.fail();
    }
    queueMicrotask(() => {
      this.emit(CustomPlayer.READY);
      if (!this.failed && autoplay) this.play();
    });
  }
  private emit(event: string) {
    if (!this.destroyed)
      for (const callback of this.listeners.get(event) || []) callback();
  }
  private option(key: string, checked: boolean, icon = "") {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "custom-option";
    element.setAttribute("role", "menuitemradio");
    element.setAttribute("aria-checked", String(checked));
    const label = document.createElement("span");
    label.dataset.i18n = key;
    label.textContent = tr(key);
    element.innerHTML = icon;
    element.append(label);
    return element;
  }
  private paintLevels(heights: number[]) {
    this.levels.replaceChildren(
      ...["auto", ...heights.map((height) => `${height}p`)].map((value) => {
        const option = this.option(
          value === "auto" ? "Auto" : value,
          value === this.quality,
          value === "auto" ? CustomPlayer.AUTO_ICON : "", // the same sparkle as the badge, so the badge reads as auto
        );
        option.dataset.quality = value;
        option.addEventListener("click", () => {
          this.qualityMenu.open = false;
          this.setQuality(value);
        });
        return option;
      }),
    );
  }
  private paintQuality(height: number | undefined) {
    if (!height || height === this.qualityHeight) return;
    this.qualityHeight = height;
    this.qualityText.textContent = `${height}p`;
  }
  addEventListener(event: string, callback: () => void) {
    this.listeners.set(event, [...(this.listeners.get(event) || []), callback]);
  }
  getPlayerState() {
    return {
      playback: this.failed
        ? "Error"
        : this.playing
          ? "Playing"
          : this.video.paused
            ? "Paused"
            : "Buffering",
    };
  }
  setControls(_value: boolean) {
    /* the bar shows on every tile: folded to the resolution, unfolded under the pointer */
  }
  getLatency() {
    return this.latency;
  }
  // hls.js reads these on every latency check, so a tile changing role retunes its stream without a new player.
  // ponytail: stable names the hls.js defaults outright, so the count set here counts from the start; the playlist's
  // own hold-back is no longer consulted
  static latencyConfig(latency: Latency) {
    return latency === "low"
      ? {
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 4,
          maxLiveSyncPlaybackRate: 1.05,
        }
      : {
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: Infinity,
          maxLiveSyncPlaybackRate: 1,
        };
  }
  setLatency(latency: Latency) {
    this.latency = latency;
    for (const option of this.latencies.children)
      option.setAttribute(
        "aria-checked",
        String((option as HTMLElement).dataset.latency === latency),
      );
    if (this.hls)
      Object.assign(this.hls.config, CustomPlayer.latencyConfig(latency));
  }
  setSpotlight(front: boolean, available: boolean) {
    const key = front
      ? "Revenir à la grille (SHIFT+CLICK)"
      : "Spotlight (SHIFT+CLICK)";
    this.spotlightButton.title = tr(key);
    this.spotlightButton.dataset.i18nTitle = key;
    this.spotlightButton.setAttribute("aria-label", tr(key));
    this.spotlightButton.dataset.i18nAriaLabel = key;
    this.spotlightButton.setAttribute("aria-pressed", String(front));
    this.spotlightButton.hidden = !available;
  }
  setSoundLocked(button: boolean, slider: boolean) {
    this.soundButton.disabled = button;
    this.slider.disabled = slider;
  }
  setMuted(value: boolean) {
    this.video.muted = value;
  }
  getMuted() {
    return this.video.muted;
  }
  setVolume(value: number) {
    this.video.volume = Math.max(0, Math.min(1, value));
  }
  getVolume() {
    return this.video.volume;
  }
  setQuality(value: string) {
    this.quality = value;
    const known = [...this.levels.children].some(
      (option) => (option as HTMLElement).dataset.quality === value,
    );
    const shown = known ? value : "auto"; // levels not loaded yet, or gone from this stream
    for (const option of this.levels.children)
      option.setAttribute(
        "aria-checked",
        String((option as HTMLElement).dataset.quality === shown),
      );
    this.qualityMenu.classList.toggle("manual", shown !== "auto");
    if (!this.hls) return;
    this.hls.currentLevel =
      value === "auto"
        ? -1
        : this.hls.levels.findIndex((level) => `${level.height}p` === value);
  }
  getQuality() {
    return this.quality;
  }
  play() {
    if (this.destroyed || this.failed) return;
    void this.video.play().catch((error) => {
      if (this.destroyed) return;
      if (error.name === "NotAllowedError") {
        this.retry.textContent = tr("Démarrer la lecture");
        this.retry.hidden = false;
        this.emit("playbackBlocked");
      } else if (error.name !== "AbortError") this.fail();
    });
  }
  pause() {
    this.video.pause();
  }
  destroy() {
    this.destroyed = true;
    this.listeners.clear();
    clearTimeout(this.recoveryTimer);
    this.hls?.destroy();
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.video.remove();
    this.error.remove();
    this.bar.remove();
  }
}

export function playerConstructor(
  mode = preferences.player,
): PlayerConstructor | undefined {
  return mode === "custom" ? CustomPlayer : window.Twitch?.Player;
}
