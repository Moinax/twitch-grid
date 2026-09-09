import type { WorkspaceActions } from "../types/actions";
export function GridDialog({ actions }: { actions: WorkspaceActions }) {
  return (
    <>
      <dialog
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            e.currentTarget.close();
        }}
        id="grids-dialog"
        aria-labelledby="grids-title"
      >
        <div className="dialog-heading">
          <h2 id="grids-title" data-i18n="Grilles">
            Grilles
          </h2>
          <button
            type="button"
            data-close-dialog=""
            onClick={(e) => e.currentTarget.closest("dialog")?.close()}
            aria-label="Fermer"
            data-i18n-aria-label="Fermer"
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
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div id="grids-overview">
          <div id="saved-grids"></div>
          <div className="dialog-actions">
            <button
              type="button"
              id="grid-save-copy"
              onClick={() => actions.copyGrid?.()}
              data-i18n="Enregistrer sous…"
            >
              Enregistrer sous…
            </button>
            <button
              type="button"
              id="grid-new"
              onClick={() => actions.newGrid?.()}
              data-i18n="Grille vierge"
            >
              Grille vierge
            </button>
          </div>
        </div>
        <form
          id="grid-form"
          onSubmit={(e) => actions.submitGridForm?.(e)}
          hidden
        >
          <h3 id="grid-form-title"></h3>
          <label id="grid-name-label">
            <span data-i18n="Nom de la grille">Nom de la grille</span>
            <input
              id="grid-name"
              onInput={() => actions.clearGridError?.()}
              maxLength={80}
              autoComplete="off"
            />
          </label>
          <p
            id="grid-delete-description"
            hidden
            data-i18n="Les autres grilles et tes favoris seront conservés."
          >
            Les autres grilles et tes favoris seront conservés.
          </p>
          <p id="grid-form-error" role="alert"></p>
          <div className="dialog-actions">
            <button
              type="button"
              id="grid-form-cancel"
              onClick={() => actions.cancelGridForm?.()}
              data-i18n="Annuler"
            >
              Annuler
            </button>
            <button type="submit" id="grid-form-submit"></button>
          </div>
        </form>
      </dialog>
    </>
  );
}
