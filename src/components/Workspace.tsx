import type { WorkspaceActions } from "../types/actions";
export function Workspace({ actions }: { actions: WorkspaceActions }) {
  return (
    <>
      <main id="main">
        <div id="grid"></div>
        <section id="empty" aria-labelledby="empty-title">
          <span className="hero">
            <span className="float">
              <img src="favicon.svg" alt="" />
            </span>
          </span>
          <h1 id="empty-title">Twitch grid</h1>
          <p data-i18n="">
            Ta grille est vide. Trois gestes et tes streams sont côte à côte.
          </p>
          <ol className="start">
            <li>
              <b>1</b>
              <h2 data-i18n="">Trouve une chaîne</h2>
              <span data-i18n="">
                Dans la liste : tes follows, ou une recherche par pseudo ou lien
                Twitch.
              </span>
            </li>
            <li>
              <b>2</b>
              <h2 data-i18n="">Ajoute-la à la grille</h2>
              <span data-i18n="">
                Un clic sur une chaîne en direct ouvre son lecteur ici.
              </span>
            </li>
            <li>
              <b>3</b>
              <h2 data-i18n="">Passe en spotlight, choisis le son</h2>
              <span data-i18n="">
                Clique une vidéo pour l’agrandir. Le son la suit, les autres se
                taisent.
              </span>
            </li>
          </ol>
          <button
            id="guest"
            onClick={() => actions.findStreamer?.()}
            data-i18n="Rechercher un streamer"
          >
            Rechercher un streamer
          </button>
          <span className="links">
            <button
              id="top"
              onClick={() => actions.connect?.()}
              className="link"
              data-i18n="Connecter Twitch"
            >
              Connecter Twitch
            </button>
            <button
              id="show-landing"
              onClick={() => actions.showLanding?.()}
              className="link"
              type="button"
              data-i18n=""
            >
              Revoir la présentation
            </button>
          </span>
          <a
            className="gh"
            href="https://github.com/Moinax/twitch-grid"
            target="_blank"
            rel="noopener"
          >
            <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span>
              <b>★</b> <span data-i18n="Star sur GitHub">Star sur GitHub</span>
            </span>
          </a>
        </section>
        <button
          id="update"
          type="button"
          hidden
          onClick={() => location.reload()}
          data-i18n="Nouvelle version, clique pour recharger"
        >
          Nouvelle version, clique pour recharger
        </button>
        <div
          id="live-notifications"
          role="region"
          aria-label="Nouveaux streams en direct"
          data-i18n-aria-label="Nouveaux streams en direct"
          aria-live="polite"
          aria-relevant="additions"
        ></div>
      </main>
    </>
  );
}
