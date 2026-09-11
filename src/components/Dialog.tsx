import type { ReactNode } from "react";
// A modal dialog with the app's heading and close button; a click on the backdrop closes it.
export function Dialog({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
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
      id={id}
      aria-labelledby={id + "-title"}
    >
      <div className="dialog-heading">
        <h2 id={id + "-title"} data-i18n={title}>
          {title}
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
      {children}
    </dialog>
  );
}
