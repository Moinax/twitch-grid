import { translations } from "./translations";

import type { Preferences } from "../types/domain";
let stored: Partial<Preferences>;
try {
  stored = JSON.parse(localStorage.getItem("tg.preferences") || "{}") || {};
} catch {
  stored = {};
}
const preferenceValues = {
  language: ["fr", "en", "nl"],
  player: ["embed", "custom"],
  theme: ["system", "light", "dark"],
};
const preferences: Preferences = {
  player: stored.player === "custom" ? "custom" : "embed",
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
function setPreference(key: keyof Preferences, value: string) {
  if (!preferenceValues[key]?.includes(value)) return;
  if (key === "language")
    preferences.language = value as Preferences["language"];
  else if (key === "player")
    preferences.player = value as Preferences["player"];
  else preferences.theme = value as Preferences["theme"];
  try {
    localStorage.setItem("tg.preferences", JSON.stringify(preferences));
  } catch {
    /* Preferences still work for this visit. */
  }
  applyPreferences();
  dispatchEvent(new Event("preferenceschange"));
}

export { preferences, tr, translateTree, relocalizeMessage, setPreference };
