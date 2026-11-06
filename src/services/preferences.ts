import { translations } from "./translations";

import type { ChatPosition, Preferences } from "../types/domain";
let stored: Partial<Preferences>;
try {
  stored = JSON.parse(localStorage.getItem("tg.preferences") || "{}") || {};
} catch {
  stored = {};
}
const POSITIONS = ["auto", "top", "bottom", "left", "right"];
const preferenceValues = {
  language: ["fr", "en", "nl"],
  player: ["embed", "custom"],
  latency: ["stable", "low"],
  spotlightLatency: ["stable", "low"],
  spotlightChat: ["on", "off"],
  spotlightChatPosition: POSITIONS,
  listOrder: ["popular", "watched", "recent"],
  theme: ["system", "light", "dark"],
};
const storedFraction = (value: unknown) =>
  typeof value === "number" && value > 0 && value < 1 ? value : undefined;
const preferences: Preferences = {
  player: stored.player === "embed" ? "embed" : "custom",
  latency: stored.latency === "low" ? "low" : "stable",
  spotlightLatency: stored.spotlightLatency === "stable" ? "stable" : "low", // the stream in front is the one to follow live
  spotlightChat: stored.spotlightChat === "on" ? "on" : "off",
  spotlightChatPosition:
    stored.spotlightChatPosition &&
    preferenceValues.spotlightChatPosition.includes(
      stored.spotlightChatPosition,
    )
      ? stored.spotlightChatPosition
      : "auto",
  spotlightTiles:
    stored.spotlightTiles && POSITIONS.includes(stored.spotlightTiles)
      ? stored.spotlightTiles
      : "auto",
  spotlightTilesSize: {
    horizontal: storedFraction(stored.spotlightTilesSize?.horizontal),
    vertical: storedFraction(stored.spotlightTilesSize?.vertical),
  },
  listOrder:
    stored.listOrder && preferenceValues.listOrder.includes(stored.listOrder)
      ? stored.listOrder
      : "popular",
  language:
    stored.language && preferenceValues.language.includes(stored.language)
      ? stored.language
      : "fr",
  theme:
    stored.theme && preferenceValues.theme.includes(stored.theme)
      ? stored.theme
      : "system",
};
function tr(key: string, values: Record<string, string | number> = {}) {
  const text =
    preferences.language === "fr"
      ? key
      : translations[key]?.[preferences.language === "en" ? 0 : 1] || key;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    String(values[name] ?? match),
  );
}
function translateTree(root: ParentNode = document) {
  for (const attr of ["text", "title", "aria-label", "placeholder"]) {
    const data = "data-i18n" + (attr === "text" ? "" : "-" + attr);
    for (const node of root.querySelectorAll("[" + data + "]")) {
      const key =
        node.getAttribute(data) ||
        (attr === "text"
          ? (node.textContent || "").trim()
          : node.getAttribute(attr) || ""); // an empty data-i18n takes the initial French text as its key
      if (!node.getAttribute(data)) node.setAttribute(data, key);
      const value = tr(key);
      if (attr === "text") node.textContent = value;
      else node.setAttribute(attr, value);
    }
  }
}
function relocalizeMessage(value: string) {
  const key = Object.keys(translations).find(
    (key) => key === value || translations[key].includes(value),
  );
  return key ? tr(key) : value;
}
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
function applyPreferences() {
  document.documentElement.lang = preferences.language;
  document.documentElement.dataset.theme =
    preferences.theme === "system"
      ? systemTheme.matches
        ? "dark"
        : "light"
      : preferences.theme;
  document.documentElement.style.colorScheme =
    document.documentElement.dataset.theme!;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      document.documentElement.dataset.theme === "dark" ? "#181818" : "#f4f4f7",
    );
}
applyPreferences();
systemTheme.addEventListener("change", () => {
  if (preferences.theme === "system") {
    applyPreferences();
    dispatchEvent(new Event("preferenceschange"));
  }
});
function persistPreferences() {
  try {
    localStorage.setItem("tg.preferences", JSON.stringify(preferences));
  } catch {
    /* Preferences still work for this visit. */
  }
}
function setPreference(key: keyof typeof preferenceValues, value: string) {
  if (!preferenceValues[key]?.includes(value)) return;
  if (key === "language")
    preferences.language = value as Preferences["language"];
  else if (key === "player")
    preferences.player = value as Preferences["player"];
  else if (key === "latency")
    preferences.latency = value as Preferences["latency"];
  else if (key === "spotlightLatency")
    preferences.spotlightLatency = value as Preferences["latency"];
  else if (key === "spotlightChat")
    preferences.spotlightChat = value as Preferences["spotlightChat"];
  else if (key === "listOrder")
    preferences.listOrder = value as Preferences["listOrder"];
  else if (key === "spotlightChatPosition")
    preferences.spotlightChatPosition =
      value as Preferences["spotlightChatPosition"];
  else preferences.theme = value as Preferences["theme"];
  persistPreferences();
  applyPreferences();
  dispatchEvent(new Event("preferenceschange"));
}
// Where the small tiles sit beside the spotlight, and how much room that side gets: no fraction keeps the size saved for
// it, null hands it back. Auto hands every size back. It only moves tiles, so it skips the preferenceschange refresh: a
// drag of the divider lands here on every move.
function setSpotlightTiles(position: string, fraction?: number | null) {
  if (!POSITIONS.includes(position)) return;
  preferences.spotlightTiles = position as ChatPosition;
  if (position === "auto") preferences.spotlightTilesSize = {};
  else if (fraction !== undefined)
    preferences.spotlightTilesSize = {
      ...preferences.spotlightTilesSize,
      [position === "left" || position === "right" ? "horizontal" : "vertical"]:
        fraction ?? undefined,
    };
  persistPreferences();
}

export {
  preferences,
  tr,
  translateTree,
  relocalizeMessage,
  setPreference,
  setSpotlightTiles,
};
