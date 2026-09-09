import { Fragment } from "react";
import type { SavedGrid } from "../types/domain";
import { tr } from "../services/preferences";
interface Props {
  items: SavedGrid[];
  activeId?: string;
  label: (item: SavedGrid) => string;
  summary: (item: SavedGrid) => string;
  onOpen: (id: string) => void;
  manage?: boolean;
  ready?: boolean;
  onAction?: (kind: "rename" | "delete", id: string) => void;
}
export function SavedGridList({
  items,
  activeId,
  label,
  summary,
  onOpen,
  manage,
  ready,
  onAction,
}: Props) {
  return (
    <>
      {items.map((item) => {
        const open = (
          <button
            type="button"
            className="open-grid"
            data-grid-id={manage ? undefined : item.id}
            aria-current={item.id === activeId}
            title={manage ? tr("Ouvrir cette grille") : undefined}
            disabled={manage && !ready}
            onClick={() => onOpen(item.id)}
          >
            <i className="grid-mark" />
            <span>
              <strong>{label(item)}</strong>
              <small>{summary(item)}</small>
            </span>
          </button>
        );
        return manage ? (
          <div className="saved-grid" data-grid-id={item.id} key={item.id}>
            {open}
            {(["rename", "delete"] as const).map((action) => (
              <button
                key={action}
                type="button"
                className={action + "-grid icon-button"}
                title={tr(action === "rename" ? "Renommer" : "Supprimer")}
                aria-label={
                  tr(action === "rename" ? "Renommer" : "Supprimer") +
                  " " +
                  label(item)
                }
                disabled={!ready || item.id === "live-follows"}
                onClick={() => onAction?.(action, item.id)}
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
                  <path
                    d={
                      action === "rename"
                        ? "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"
                        : "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"
                    }
                  />
                </svg>
              </button>
            ))}
          </div>
        ) : (
          <Fragment key={item.id}>{open}</Fragment>
        );
      })}
    </>
  );
}
