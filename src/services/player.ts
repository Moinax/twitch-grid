import type Hls from "hls.js";
import type { TwitchPlayer, PlayerConstructor } from "../types/player";
import { preferences, tr } from "./preferences";

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
  private source: string;
  private retry = document.createElement("button");

  constructor(element: HTMLElement, options: Options) {
    const video = this.video;
    video.className = "custom-video";
    video.playsInline = true;
    video.muted = options.muted;
    video.controls = options.controls;
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
    element.append(video, this.retry);
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
        if (event === "error") {
          this.fail();
          return;
        }
        if (event === "playing") this.retry.hidden = true;
        this.emit(event);
      });
    }
    void this.load(options.autoplay);
  }
  private fail() {
    if (this.destroyed) return;
    this.failed = true;
    this.hls?.stopLoad();
    this.retry.textContent = tr("Flux indisponible. Réessayer");
    this.retry.hidden = false;
    this.emit("error");
  }
  private async load(autoplay: boolean) {
    this.retry.hidden = true;
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
      const hls = (this.hls = new Hls({
        lowLatencyMode: true,
        backBufferLength: 15,
        maxBufferLength: 20,
      }));
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        this.fail();
      });
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
    this.video.controls = value;
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
    this.hls?.destroy();
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.video.remove();
    this.retry.remove();
  }
}

export function playerConstructor(): PlayerConstructor | undefined {
  return preferences.player === "custom" ? CustomPlayer : window.Twitch?.Player;
}
