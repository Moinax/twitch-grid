import type { Channel, ChatPosition } from "./domain";
export interface TwitchPlayer {
  addEventListener(event: string, callback: () => void): void;
  getPlayerState(): { playback: string };
  setMuted(value: boolean): void;
  getMuted(): boolean;
  setVolume(value: number): void;
  getVolume(): number;
  setQuality(value: string): void;
  getQuality?(): string;
  setControls?(value: boolean): void;
  play(): void;
  pause(): void;
  destroy(): void;
}
export interface PlayerConstructor {
  new (
    element: HTMLElement,
    options: {
      channel: string;
      parent: string[];
      width: number | string;
      height: number | string;
      muted: boolean;
      autoplay: boolean;
      controls: boolean;
    },
  ): TwitchPlayer;
  READY: string;
  PLAYING: string;
}
declare global {
  interface WindowEventMap {
    preferenceschange: Event;
  }
  interface Window {
    Twitch?: { Player: PlayerConstructor };
  }
}
export interface Tile {
  el: HTMLDivElement;
  bar: HTMLDivElement;
  body: HTMLDivElement;
  channel: Channel;
  chat: HTMLElement;
  chatOptions: HTMLDetailsElement;
  collaboration: HTMLDetailsElement;
  participants: Channel[];
  cover: HTMLDivElement;
  poster: HTMLImageElement;
  previewStatus: HTMLDivElement;
  player: TwitchPlayer | null;
  ppIcon: () => void;
  visible: boolean;
  muted: boolean;
  volume: number;
  paused: boolean | null;
  chatOpen: boolean;
  chatPosition: ChatPosition;
  ready: boolean;
  timer?: number | null;
  offlineTimer?: number | null;
  chatFits?: boolean;
  controls?: boolean;
  fits?: boolean;
  sized?: boolean;
  commandedPlay?: boolean;
  hasPlayed?: boolean;
  hoverSuppressed?: boolean;
  hovered?: boolean;
  nativeHold?: boolean;
  nativePaused?: boolean;
  wasPlaying?: boolean;
  nativeAudio?: { muted: boolean; volume: number } | null;
  pendingMute?: { value: boolean; at: number } | null;
  nudged?: boolean;
  nudgedAt?: number;
  playbackBlocked?: boolean;
  playbackError?: boolean;
  previewing?: boolean;
  quality?: string;
  readyAt?: number;
  spotlightMuted?: boolean;
  unmutedAt?: number;
  waitingForStatus?: boolean;
  wasOnline?: boolean;
}
export interface DragPointer {
  bar: HTMLElement;
  id: number;
  login: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  ghost?: HTMLDivElement;
}
