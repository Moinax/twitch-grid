export function AudioPrompt() {
  return (
    <>
      <div
        id="audio-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audio-overlay-title"
        aria-describedby="audio-overlay-description"
        tabIndex={-1}
        hidden
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
        </svg>
        <h2 id="audio-overlay-title" data-i18n="Retrouver le son">
          Retrouver le son
        </h2>
        <p
          id="audio-overlay-description"
          data-i18n="Clique n’importe où ou appuie sur une touche pour réactiver le son de tes streams."
        >
          Clique n’importe où ou appuie sur une touche pour réactiver le son de
          tes streams.
        </p>
        <button type="button" data-i18n="Réactiver le son">
          Réactiver le son
        </button>
      </div>
    </>
  );
}
