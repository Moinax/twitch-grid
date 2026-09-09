export function CollaborationMenu() {
  return (
    <>
      <summary
        title="Participants à la collaboration"
        data-i18n-title="Participants à la collaboration"
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="9" cy="7" r="3" />
          <path d="M2 21v-3a7 7 0 0 1 14 0v3M16 4a3 3 0 0 1 0 6M19 14a5 5 0 0 1 3 4v3" />
        </svg>
        <span className="collaboration-count"></span>
      </summary>
      <div className="collaboration-menu">
        <span className="collaboration-heading"></span>
        <div className="collaboration-list"></div>
        <button
          type="button"
          className="add-collaboration"
          data-i18n="Tout ajouter"
        >
          Tout ajouter
        </button>
        <button
          type="button"
          className="create-collaboration-grid"
          data-i18n="Créer une grille pour cette collaboration"
        >
          Créer une grille pour cette collaboration
        </button>
      </div>
    </>
  );
}
