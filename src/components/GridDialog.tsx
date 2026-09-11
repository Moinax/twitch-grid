import type { WorkspaceActions } from "../types/actions";
import { Dialog } from "./Dialog";
export function GridDialog({ actions }: { actions: WorkspaceActions }) {
  return (
    <Dialog id="grids-dialog" title="Grilles">
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
      <form id="grid-form" onSubmit={(e) => actions.submitGridForm?.(e)} hidden>
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
    </Dialog>
  );
}
