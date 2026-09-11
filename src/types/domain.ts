export type AccountMode = "guest" | "connected";
export type ChatPosition = "auto" | "top" | "bottom" | "left" | "right";
export type Language = "fr" | "en" | "nl";
export type Theme = "system" | "light" | "dark";
export type Latency = "stable" | "low";
export interface Preferences {
  language: Language;
  theme: Theme;
  player: "embed" | "custom";
  latency: Latency;
}
export interface Channel {
  twitch: string;
  display: string;
  profileUrl: string;
  previewUrl: string;
  offlineUrl: string;
  online: boolean | null;
  game: string;
  title: string;
  viewersAmount: { number: number; formatted: string };
}
export interface TwitchChannelData extends Partial<
  Omit<Channel, "viewersAmount">
> {
  id?: string;
  login?: string;
  user_login?: string;
  broadcaster_login?: string;
  broadcaster_name?: string;
  display_name?: string;
  profile_image_url?: string;
  thumbnail_url?: string;
  preview_url?: string;
  offline_image_url?: string;
  is_live?: boolean;
  game_name?: string;
  viewer_count?: number;
  participants?: { broadcaster_id: string }[];
}
export interface TwitchSession {
  client_id: string;
  user_id: string;
  login: string;
  scopes: string[];
}
export interface LayoutSnapshot {
  order?: string[];
  focused?: string | null;
  locked?: boolean;
  mutedAll?: string[] | null;
  allPaused?: boolean;
  channels?: Partial<Channel>[];
  collapsed?: boolean;
  muted?: Record<string, boolean>;
  spotlightMuted?: Record<string, boolean | undefined>;
  volume?: Record<string, number>;
  paused?: Record<string, boolean | null>;
  chatOpen?: Record<string, boolean> | boolean;
  chatPosition?:
    Record<string, ChatPosition | "below"> | ChatPosition | "below";
}
export interface SavedGrid {
  id: string;
  name: string | null;
  layout: LayoutSnapshot;
}
export interface Collaboration {
  checkedAt: number;
  participants: Channel[];
}
export interface GridAction {
  kind: "rename" | "delete" | "copy" | "new" | "collaboration";
  id: string | null;
  participants: Channel[];
  source: Channel | null;
}
