import type Hls from "hls.js";
import type { TwitchPlayer, PlayerConstructor } from "../types/player";
import { preferences, setPreference, tr } from "./preferences";

type Options = ConstructorParameters<PlayerConstructor>[1];

export class CustomPlayer implements TwitchPlayer {
  static READY = "ready";
  static PLAYING = "playing";
  readonly video = document.createElement("video");
  private hls: Hls | null = null;
  private listeners = new Map<string, (() => void)[]>();
  private destroyed = false;
  private failed = false;
  private playing = false;
  private quality = "auto";
  private qualityHeight = 0;
  private qualityTimer?: ReturnType<typeof setTimeout>;
  private source: string;
  private retry = document.createElement("button");
  private error = document.createElement("div");
  private fallback = document.createElement("button");
  private bar = document.createElement("div");
  private qualityBadge = document.createElement("span");
  private qualityText = document.createElement("span");
  private levels = document.createElement("select");
  private slider = document.createElement("input");

  constructor(element: HTMLElement, options: Options) {
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
    this.bar.hidden = !options.controls;
    this.bar.addEventListener("click", (event) => event.stopPropagation()); // the player itself resumes on click
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
    const sound = button(
      "sound",
      "Son",
      '<path d="M11 5 6 9H2v6h4l5 4z"/><g class="on"><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></g><g class="off"><path d="m23 9-6 6"/><path d="m17 9 6 6"/></g>',
      () => this.setMuted(!video.muted),
    );
    this.slider.className = "custom-volume";
    this.slider.type = "range";
    this.slider.min = "0";
    this.slider.max = "1";
    this.slider.step = "0.05";
    label(this.slider, "Volume");
    this.slider.addEventListener("input", () => {
      this.setVolume(Number(this.slider.value));
      this.setMuted(Number(this.slider.value) === 0);
    });
    video.addEventListener("volumechange", () => this.paintSound());
    this.paintSound();
    this.levels.className = "custom-quality";
    label(this.levels, "Qualité");
    this.levels.append(new Option(tr("Auto"), "auto"));
    this.levels.addEventListener("change", () =>
      this.setQuality(this.levels.value),
    );
    this.qualityBadge.className = "custom-quality-badge";
    this.qualityBadge.hidden = true;
    const lowLatency = preferences.latency === "low";
    const latencyIcon = document.createElement("span");
    latencyIcon.className = `custom-latency ${lowLatency ? "low" : "stable"}`;
    latencyIcon.title = tr(lowLatency ? "Faible latence" : "Latence stable");
    latencyIcon.setAttribute("aria-label", latencyIcon.title);
    latencyIcon.innerHTML = lowLatency
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 2-9 12h7l-1 8 9-12h-7z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    this.qualityBadge.append(latencyIcon, this.qualityText);
    video.addEventListener("resize", () =>
      this.paintQuality(video.videoHeight),
    );
    // Fullscreen the whole tile, so its bar keeps offering the chat, the spotlight and the rest.
    const fullscreen = button(
      "fullscreen",
      "Plein écran",
      '<g class="enter"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></g><g class="exit"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></g>',
      () => this.toggleFullscreen(element),
    );
    this.bar.append(playPause, sound, this.slider, this.levels, fullscreen);
    element.append(video, this.error);
    // Above the pause overlay, which sits outside the embed's stacking context.
    (element.closest(".player") || element).append(this.qualityBadge, this.bar);
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
        if (event === "playing")
          this.retry.hidden = this.fallback.hidden = true;
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
      const latencyConfig =
        preferences.latency === "low"
          ? {
              liveSyncDurationCount: 2,
              liveMaxLatencyDurationCount: 4,
              maxLiveSyncPlaybackRate: 1.05,
            }
          : {};
      const hls = (this.hls = new Hls({
        lowLatencyMode: true,
        capLevelToPlayerSize: true,
        backBufferLength: 15,
        maxBufferLength: 20,
        ...latencyConfig,
      }));
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        this.fail();
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.levels.replaceChildren(
          new Option(tr("Auto"), "auto"),
          ...[...hls.levels]
            .reverse()
            .map((level) => new Option(`${level.height}p`, `${level.height}p`)),
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
  private paintQuality(height: number | undefined) {
    if (!height || height === this.qualityHeight) return;
    this.qualityHeight = height;
    this.qualityText.textContent = `${height}p`;
    this.qualityBadge.hidden = false;
    this.qualityBadge.classList.add("visible");
    clearTimeout(this.qualityTimer);
    this.qualityTimer = setTimeout(
      () => this.qualityBadge.classList.remove("visible"),
      3000,
    );
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
  setControls(value: boolean) {
    this.bar.hidden = !value;
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
    this.levels.value = value;
    if (!this.levels.value) this.levels.value = "auto"; // levels not loaded yet, or gone from this stream
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
    clearTimeout(this.qualityTimer);
    this.hls?.destroy();
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.video.remove();
    this.error.remove();
    this.qualityBadge.remove();
    this.bar.remove();
  }
}

export function playerConstructor(): PlayerConstructor | undefined {
  return preferences.player === "custom" ? CustomPlayer : window.Twitch?.Player;
}
