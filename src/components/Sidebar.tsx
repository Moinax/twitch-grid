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
              <a
                className="github"
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
            id="soundfollow"
            type="button"
            onClick={() => actions.toggleSoundFollow?.()}
            aria-pressed="false"
            title="Son au survol (Shift)"
            data-i18n-title="Son au survol (Shift)"
            aria-label="Son au survol"
            data-i18n-aria-label="Son au survol"
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
              <path d="M14 4.1 12 6M5.1 8l-2.9-.8M6 12l-1.9 2M7.2 2.2 8 5.1" />
              <path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z" />
            </svg>
          </button>
          <button
            id="soundboard"
            type="button"
            popoverTarget="sound-board"
            title="Table de mixage"
            data-i18n-title="Table de mixage"
            aria-label="Table de mixage"
            data-i18n-aria-label="Table de mixage"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />
            </svg>
          </button>
          <button
            id="settings"
            type="button"
            onClick={() => actions.openSettings?.()}
            title="Réglages"
            data-i18n-title="Réglages"
            aria-label="Réglages"
            data-i18n-aria-label="Réglages"
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
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            id="connect"
            type="button"
            onClick={() => actions.connect?.()}
            title="Connecter Twitch"
            data-i18n-title="Connecter Twitch"
            aria-label="Connecter Twitch"
            data-i18n-aria-label="Connecter Twitch"
            hidden
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6V1.714h14.571Z" />
            </svg>
          </button>
          <button
            id="disconnect"
            type="button"
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
              <path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04" />
            </svg>
          </button>
        </footer>
      </aside>
    </>
  );
}
