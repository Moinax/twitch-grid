import type { WorkspaceActions } from "../types/actions";
export function Sidebar({ actions }: { actions: WorkspaceActions }) {
  return (
    <>
      <aside id="side">
        <header>
          <div className="row">
            <img src="favicon.svg" width="20" height="20" alt="" />
            <b>Twitch grid</b>
            <div id="ctl">
              <button
                id="connect"
                onClick={() => actions.connect?.()}
                title="Connecter Twitch"
                data-i18n-title="Connecter Twitch"
                aria-label="Connecter Twitch"
                data-i18n-aria-label="Connecter Twitch"
                hidden
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  aria-hidden="true"
                >
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6V1.714h14.571Z" />
                </svg>
              </button>
              <button
                id="disconnect"
                onClick={() => actions.disconnect?.()}
                title="Déconnecter Twitch"
                data-i18n-title="Déconnecter Twitch"
                aria-label="Déconnecter Twitch"
                data-i18n-aria-label="Déconnecter Twitch"
                hidden
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              </button>
              <a
                href="https://github.com/Moinax/twitch-grid"
                target="_blank"
                rel="noopener"
                title="Mettre une étoile sur GitHub"
                data-i18n-title="Mettre une étoile sur GitHub"
              >
                <svg viewBox="0 0 16 16" width="15" height="15">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                </svg>
              </a>
              <button
                id="grids-shortcut"
                onClick={() => actions.openGrids?.()}
                className="workspace-shortcut"
                title="Grilles"
                data-i18n-title="Grilles"
                aria-label="Grilles"
                data-i18n-aria-label="Grilles"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
              <button
                id="playall"
                onClick={() => actions.togglePlayback?.()}
                title="Play/pause tous les streams"
                data-i18n-title="Play/pause tous les streams"
                aria-label="Play/pause tous les streams"
                data-i18n-aria-label="Play/pause tous les streams"
                aria-pressed="false"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <g className="pause">
                    <path d="M8 5v14M16 5v14" />
                  </g>
                  <g className="play">
                    <path d="M7 4v16l13-8z" fill="currentColor" />
                  </g>
                </svg>
              </button>
              <button
                id="muteall"
                onClick={() => actions.toggleMute?.()}
                title="Couper tous les sons"
                data-i18n-title="Couper tous les sons"
                aria-label="Couper tous les sons"
                data-i18n-aria-label="Couper tous les sons"
                aria-pressed="false"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M11 5 6 9H2v6h4l5 4z" />
                  <g className="on">
                    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                    <path d="M19 5a10 10 0 0 1 0 14" />
                  </g>
                  <g className="off">
                    <path d="m23 9-6 6" />
                    <path d="m17 9 6 6" />
                  </g>
                </svg>
              </button>
              <button
                id="toggle"
                onClick={() => actions.toggleSidebar?.()}
                title="Afficher/masquer la liste"
                data-i18n-title="Afficher/masquer la liste"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path className="in" d="m15 18-6-6 6-6" />
                  <path className="out" d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
          <div id="workspace-controls">
            <details
              id="grid-switcher"
              onToggle={(e) => actions.toggleGridMenu?.(e.currentTarget)}
            >
              <summary
                title="Changer de grille"
                data-i18n-title="Changer de grille"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                <span id="current-grid-name">Grille par défaut</span>
                <svg
                  className="chevron"
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <div className="grid-menu">
                <div id="grid-menu-list"></div>
                <button
                  id="grids-open"
                  onClick={() => actions.openGridManager?.()}
                  type="button"
                  data-i18n="Gérer les grilles…"
                >
                  Gérer les grilles…
                </button>
              </div>
            </details>
            <button
              id="grid-clear"
              onClick={() => actions.clearGrid?.()}
              type="button"
              title="Vider la grille"
              data-i18n-title="Vider la grille"
              aria-label="Vider la grille"
              data-i18n-aria-label="Vider la grille"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="m9 9 6 6M15 9l-6 6" />
              </svg>
            </button>
            <button
              id="grid-lock"
              onClick={() => actions.toggleLock?.()}
              type="button"
              aria-pressed="false"
              title="Verrouiller la grille"
              data-i18n-title="Verrouiller la grille"
              aria-label="Verrouiller la grille"
              data-i18n-aria-label="Verrouiller la grille"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path className="open" d="M8 11V7a4 4 0 0 1 7.7-1.5" />
                <path className="closed" d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </button>
          </div>
          <div className="search-field">
            <input
              id="q"
              onInput={() => actions.searchInput?.()}
              onKeyDown={(e) => actions.searchKey?.(e)}
              type="search"
              aria-label="Rechercher un streamer"
              data-i18n-aria-label="Rechercher un streamer"
              placeholder="Rechercher un streamer…"
              data-i18n-placeholder="Rechercher un streamer…"
              autoComplete="off"
              maxLength={100}
            />
            <button
              id="clear-search"
              onClick={() => actions.clearSearch?.()}
              type="button"
              aria-label="Effacer la recherche"
              data-i18n-aria-label="Effacer la recherche"
              title="Effacer la recherche"
              data-i18n-title="Effacer la recherche"
              hidden
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div id="search-actions" hidden>
            <button
              id="add-login"
              onClick={() => actions.addLogin?.()}
              className="action"
            ></button>
          </div>
          <p id="search-state" role="status" aria-live="polite" hidden></p>
          <p id="notice" role="status" aria-live="polite"></p>
        </header>
        <ul
          id="list"
          aria-label="Streamers"
          data-i18n-aria-label="Streamers"
        ></ul>
        <p id="list-empty"></p>
        <footer>
          <div id="preferences">
            <label
              className="player-preference"
              title="Lecteur vidéo"
              data-i18n-title="Lecteur vidéo"
            >
              <select
                id="player-setting"
                aria-label="Lecteur vidéo"
                data-i18n-aria-label="Lecteur vidéo"
                onChange={(e) => actions.setPlayer?.(e.currentTarget.value)}
              >
                <option value="embed" data-i18n="">
                  Embed Twitch
                </option>
                <option value="custom" data-i18n="">
                  Lecteur custom
                </option>
              </select>
            </label>
            <label title="Langue" data-i18n-title="Langue">
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
              </svg>
              <select
                id="language-setting"
                onChange={(e) => actions.setLanguage?.(e.currentTarget.value)}
                aria-label="Langue"
                data-i18n-aria-label="Langue"
              >
                <option value="fr">FR</option>
                <option value="en">EN</option>
                <option value="nl">NL</option>
              </select>
            </label>
            <label title="Thème" data-i18n-title="Thème">
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path
                  d="M12 3v18A9 9 0 0 0 12 3z"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
              <select
                id="theme-setting"
                onChange={(e) => actions.setTheme?.(e.currentTarget.value)}
                aria-label="Thème"
                data-i18n-aria-label="Thème"
              >
                <option value="system">Auto</option>
                <option value="light" data-i18n="Clair">
                  Clair
                </option>
                <option value="dark" data-i18n="Sombre">
                  Sombre
                </option>
              </select>
            </label>
          </div>
        </footer>
      </aside>
    </>
  );
}
