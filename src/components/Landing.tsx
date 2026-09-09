import { LandingDemo } from "./LandingDemo";
import type { WorkspaceActions } from "../types/actions";
export function Landing({ actions }: { actions: WorkspaceActions }) {
  return (
    <>
      <section
        id="landing"
        aria-label="Présentation de Twitch grid"
        data-i18n-aria-label=""
      >
        <a className="skip" href="#landing-main" data-i18n="">
          Aller au contenu
        </a>
        <nav className="island" aria-label="Navigation" data-i18n-aria-label="">
          <a className="brand" href="#landing-main" aria-current="page">
            <img src="favicon.svg" width="24" height="24" alt="" />
            <b>Twitch grid</b>
          </a>
          <a className="anchor" href="#features" data-i18n="">
            Fonctionnalités
          </a>
          <a className="anchor" href="#how" data-i18n="">
            Comment ça marche
          </a>
          <a className="anchor" href="#faq" data-i18n="">
            Questions
          </a>
          <select
            id="landing-language"
            onChange={(e) => actions.setLanguage?.(e.currentTarget.value)}
            aria-label="Langue"
            data-i18n-aria-label=""
          >
            <option value="fr">FR</option>
            <option value="en">EN</option>
            <option value="nl">NL</option>
          </select>
          <button
            className="landing-connect"
            onClick={() => actions.connect?.()}
            type="button"
            data-i18n=""
          >
            Connecter Twitch
          </button>
        </nav>
        <div id="landing-main" tabIndex={-1}>
          <header className="hero">
            <p className="eyebrow" data-i18n="">
              Gratuit · Open source · Sans installation
            </p>
            <h1>
              <span data-i18n="">Tous tes streams.</span>
              <br />
              <span data-i18n="">Un seul écran.</span>
            </h1>
            <p className="lead" data-i18n="">
              Retrouve tes follows Twitch, compose ta grille et choisis quel
              stream a le son. Sans compte si tu préfères : tout reste dans ton
              navigateur.
            </p>
            <div className="cta">
              <button
                id="landing-connect"
                className="landing-connect"
                onClick={() => actions.connect?.()}
                type="button"
                data-i18n=""
              >
                Connecter Twitch
              </button>
              <button
                id="landing-guest"
                className="landing-guest"
                onClick={() => actions.continueGuest?.()}
                type="button"
                data-i18n=""
              >
                Continuer sans compte
              </button>
            </div>
            <p className="proof" data-i18n="">
              Code public sous licence MIT. Ta session Twitch et tes grilles
              restent dans ton navigateur.
            </p>
            <LandingDemo />
          </header>

          <section className="block rise" aria-labelledby="why-title">
            <h2 id="why-title" data-i18n="">
              Twitch, sans jongler entre les onglets
            </h2>
            <div className="cards">
              <article className="card">
                <span className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4M3.5 3.5a12 12 0 0 0 0 17M20.5 3.5a12 12 0 0 1 0 17" />
                  </svg>
                </span>
                <h3 data-i18n="">Tes directs d’abord</h3>
                <p data-i18n="">
                  Les chaînes en direct passent en tête de liste, statut vérifié
                  toutes les 30 secondes. Un clic, et le stream rejoint la
                  grille ; un stream terminé la quitte tout seul après une
                  minute.
                </p>
              </article>
              <article className="card">
                <span className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
                  </svg>
                </span>
                <h3 data-i18n="">Un seul son à la fois</h3>
                <p data-i18n="">
                  Le stream en spotlight a le son, les autres restent muets.
                  Épingle le son d’une tuile pour le garder quand le spotlight
                  change.
                </p>
              </article>
              <article className="card">
                <span className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <path d="M17 21v-8H7v8M7 3v5h8" />
                  </svg>
                </span>
                <h3 data-i18n="">Une grille qui se souvient</h3>
                <p data-i18n="">
                  Son épinglé, grilles nommées, chat et disposition : tout est
                  enregistré dans ton navigateur et revient tel quel.
                </p>
              </article>
            </div>
          </section>

          <section
            className="tagline"
            aria-label="Twitch grid en une phrase"
            data-i18n-aria-label=""
          >
            <p
              className="reveal"
              data-reveal-key="Un stream en spotlight, les autres sous la main. Le son que tu choisis, la grille qui s’en souvient."
            />
          </section>

          <section
            id="features"
            className="block rise"
            aria-labelledby="features-title"
          >
            <h2 id="features-title" data-i18n="">
              Tout ce qui rend Twitch plus pratique au quotidien
            </h2>
            <p className="sub" data-i18n="">
              Chaque fonction existe pour une situation concrète : une soirée à
              plusieurs streams, un tournoi, une veille pendant le travail.
            </p>
            <div className="cards">
              <article className="card">
                <span className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
                  </svg>
                </span>
                <h3 data-i18n="">Follows en direct</h3>
                <p data-i18n="">
                  Connecte Twitch : tes chaînes suivies apparaissent, directs en
                  premier, rafraîchies toutes les 30 secondes.
                </p>
              </article>
              <article className="card">
                <span className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
                  </svg>
                </span>
                <h3 data-i18n="">Favoris sans compte</h3>
                <p data-i18n="">
                  Cherche un pseudo ou colle un lien Twitch. La liste reste dans
                  ce navigateur.
                </p>
              </article>
              <article className="card">
                <span className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="m10 9 5 3-5 3z" />
                  </svg>
                </span>
                <h3 data-i18n="">Spotlight</h3>
                <p data-i18n="">
                  Passe un stream en spotlight : grand, avec le son et le
                  lecteur Twitch complet. Toute autre tuile assez large reçoit
                  aussi le lecteur complet.
                </p>
              </article>
              <article className="card">
                <span className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M11 5 6 9H2v6h4l5 4zM19 5a10 10 0 0 1 0 14" />
                    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  </svg>
                </span>
                <h3 data-i18n="">Son en trois états</h3>
                <p data-i18n="">
                  Muet ou allumé, sur chaque tuile. Le spotlight allume le son
                  et le rend en repartant. Un bouton coupe tout, un autre met
                  tout en pause.
                </p>
              </article>
              <article className="card">
                <span className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                </span>
                <h3 data-i18n="">Notifications de direct</h3>
                <p data-i18n="">
                  Quand une chaîne suivie démarre, une notification l’ajoute à
                  la grille en un clic.
                </p>
              </article>
              <article className="card">
                <span className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </span>
                <h3 data-i18n="">Grilles nommées</h3>
                <p data-i18n="">
                  Enregistre plusieurs dispositions : soirée, tournoi, veille.
                  Change de grille sans recharger la page.
                </p>
              </article>
              <article className="card">
                <span className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="9" cy="7" r="3" />
                    <path d="M2 21v-3a7 7 0 0 1 14 0v3M16 4a3 3 0 0 1 0 6M19 14a5 5 0 0 1 3 4v3" />
                  </svg>
                </span>
                <h3 data-i18n="">Collaborations</h3>
                <p data-i18n="">
                  Le chat partagé Twitch révèle les partenaires d’un stream.
                  Ajoute tous les participants en direct d’un coup.
                </p>
              </article>
              <article className="card">
                <span className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </span>
                <h3 data-i18n="">Chat intégré</h3>
                <p data-i18n="">
                  Le chat s’ouvre à côté de toute tuile assez large : auto,
                  haut, bas, gauche ou droite, mémorisé par stream.
                </p>
              </article>
              <article className="card">
                <span className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                </span>
                <h3 data-i18n="">Grille verrouillée</h3>
                <p data-i18n="">
                  Verrouille la grille pour qu’aucun stream ne s’ajoute par
                  erreur. Un stream terminé quitte la grille après une minute.
                </p>
              </article>
              <article className="card">
                <span className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                </span>
                <h3 data-i18n="">Agrandir</h3>
                <p data-i18n="">
                  Étends le stream en spotlight à toute la fenêtre du
                  navigateur. Échap pour revenir.
                </p>
              </article>
              <article className="card">
                <span className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
                  </svg>
                </span>
                <h3 data-i18n="">Trois langues, deux thèmes</h3>
                <p data-i18n="">
                  Français, anglais, néerlandais. Clair, sombre ou selon le
                  système, sans recharger les vidéos.
                </p>
              </article>
              <article className="card">
                <span className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </span>
                <h3 data-i18n="">Sidebar en rail</h3>
                <p data-i18n="">
                  Repliée, la liste devient un rail d’avatars, chaînes hors
                  ligne estompées. Le survol ouvre un aperçu du stream avec son
                  titre et sa catégorie.
                </p>
              </article>
            </div>
          </section>

          <section id="how" className="block rise" aria-labelledby="how-title">
            <h2 id="how-title" data-i18n="">
              Trois gestes, et tout est en place
            </h2>
            <ol className="steps">
              <li>
                <b>1</b>
                <h3 data-i18n="">Connecte Twitch, ou cherche un pseudo</h3>
                <p data-i18n="">
                  Le bouton ouvre Twitch et ramène tes follows. Sans compte, la
                  recherche suffit.
                </p>
              </li>
              <li>
                <b>2</b>
                <h3 data-i18n="">Remplis la grille</h3>
                <p data-i18n="">
                  Clique les chaînes en direct dans la liste. Glisse les tuiles
                  pour les ranger.
                </p>
              </li>
              <li>
                <b>3</b>
                <h3 data-i18n="">Choisis le spotlight et le son</h3>
                <p data-i18n="">
                  Passe une vidéo en spotlight. Le son la suit, le reste se
                  tait.
                </p>
              </li>
            </ol>
          </section>

          <section
            id="privacy"
            className="block rise"
            aria-labelledby="privacy-title"
          >
            <h2 id="privacy-title" data-i18n="">
              Rien à installer, rien à créer
            </h2>
            <p className="sub" data-i18n="">
              Twitch grid est une page web. Elle demande le minimum et garde
              tout chez toi.
            </p>
            <ul className="checks">
              <li data-i18n="">
                Pas de compte à créer : la connexion passe par Twitch, avec la
                seule permission de lire tes follows.
              </li>
              <li data-i18n="">
                La session reste dans l’onglet et disparaît à sa fermeture.
              </li>
              <li data-i18n="">
                Tes follows et tes grilles ne sont jamais publiés ni partagés.
              </li>
              <li data-i18n="">
                Le code est public sous licence MIT. Tu peux le lire, le
                modifier ou l’héberger de ton côté.
              </li>
            </ul>
          </section>

          <section id="faq" className="block rise" aria-labelledby="faq-title">
            <h2 id="faq-title" data-i18n="">
              Questions fréquentes
            </h2>
            <div className="faq">
              <details className="qa">
                <summary data-i18n="">Faut-il un compte Twitch ?</summary>
                <p data-i18n="">
                  Non. Sans compte, tu cherches un streamer par pseudo ou lien
                  et il rejoint tes favoris, gardés dans ce navigateur. Avec un
                  compte, tes follows apparaissent directement.
                </p>
              </details>
              <details className="qa">
                <summary data-i18n="">
                  Que voit Twitch grid de mon compte ?
                </summary>
                <p data-i18n="">
                  Uniquement la liste des chaînes que tu suis. Le jeton reste
                  dans l’onglet et disparaît à sa fermeture ; rien n’est copié
                  sur un serveur.
                </p>
              </details>
              <details className="qa">
                <summary data-i18n="">
                  Combien de streams en même temps ?
                </summary>
                <p data-i18n="">
                  Il n’y a pas de limite fixée. Chaque tuile est un lecteur
                  Twitch officiel, donc la limite vient de ton écran et de ta
                  connexion.
                </p>
              </details>
              <details className="qa">
                <summary data-i18n="">
                  Pourquoi le son est coupé après un rechargement ?
                </summary>
                <p data-i18n="">
                  Les navigateurs bloquent le son tant que tu n’as pas touché la
                  page. Un écran te demande un clic, rend le son prévu par ta
                  grille et ne revient plus pendant la visite.
                </p>
              </details>
              <details className="qa">
                <summary data-i18n="">
                  Où sont enregistrées mes grilles ?
                </summary>
                <p data-i18n="">
                  Dans le stockage local de ton navigateur, séparément pour le
                  mode connecté et le mode sans compte. Change de navigateur et
                  tu repars de zéro.
                </p>
              </details>
              <details className="qa">
                <summary data-i18n="">
                  Comment sont détectées les collaborations ?
                </summary>
                <p data-i18n="">
                  Grâce aux sessions de chat partagé de Twitch. Une
                  collaboration qui n’utilise pas cette fonction n’est pas
                  détectée.
                </p>
              </details>
              <details className="qa">
                <summary data-i18n="">Ça marche sur mobile ?</summary>
                <p data-i18n="">
                  Oui. La liste se replie, le chat passe sous la vidéo et les
                  grilles restent accessibles. Un grand écran reste plus
                  confortable pour plusieurs streams.
                </p>
              </details>
              <details className="qa">
                <summary data-i18n="">
                  Pourquoi certaines tuiles ont le lecteur Twitch complet et
                  d’autres non ?
                </summary>
                <p data-i18n="">
                  Dès qu’une tuile est assez large, elle reçoit le lecteur
                  complet et, plus large encore, son chat. Réduis la fenêtre et
                  elle repasse aux commandes simplifiées, sans rien perdre.
                </p>
              </details>
              <details className="qa">
                <summary data-i18n="">C’est gratuit ?</summary>
                <p data-i18n="">
                  Oui, sans publicité ni version payante. Le code est public
                  sous licence MIT ; tu peux aussi l’héberger de ton côté.
                </p>
              </details>
            </div>
          </section>

          <section className="block final rise" aria-labelledby="final-title">
            <h2 id="final-title" data-i18n="">
              Prêt à voir tes streams côte à côte ?
            </h2>
            <p className="sub" data-i18n="">
              Connecte Twitch pour retrouver tes follows, ou commence tout de
              suite sans compte.
            </p>
            <div className="cta">
              <button
                className="landing-connect"
                onClick={() => actions.connect?.()}
                type="button"
                data-i18n=""
              >
                Connecter Twitch
              </button>
              <button
                className="landing-guest"
                onClick={() => actions.continueGuest?.()}
                type="button"
                data-i18n=""
              >
                Continuer sans compte
              </button>
            </div>
          </section>

          <footer className="foot">
            <a className="brand" href="#landing-main">
              <img src="favicon.svg" width="20" height="20" alt="" />
              <b>Twitch grid</b>
            </a>
            <nav aria-label="Liens" data-i18n-aria-label="">
              <a
                href="https://github.com/Moinax/twitch-grid"
                target="_blank"
                rel="noopener"
              >
                GitHub
              </a>
              <a
                href="https://github.com/Moinax/twitch-grid/blob/main/LICENSE"
                target="_blank"
                rel="noopener"
                data-i18n=""
              >
                Licence MIT
              </a>
              <a href="#privacy" data-i18n="">
                Confidentialité
              </a>
            </nav>
            <p className="legal" data-i18n="">
              Twitch est une marque de Twitch Interactive, Inc. Twitch grid est
              un projet indépendant, sans lien avec Twitch.
            </p>
          </footer>
        </div>
      </section>
    </>
  );
}
