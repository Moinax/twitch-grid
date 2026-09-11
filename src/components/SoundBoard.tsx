import type { WorkspaceActions } from "../types/actions";
import { tr } from "../services/preferences";

// A light-dismiss popover beside the sidebar: the streams stay visible and audible while the levels change.
export function SoundBoardPanel({ actions }: { actions: WorkspaceActions }) {
  return (
    <div
      id="sound-board"
      popover="auto"
      role="dialog"
      aria-labelledby="sound-board-title"
      onToggle={(e) => actions.toggleSoundBoard?.(e.newState === "open")}
    >
      <div className="dialog-heading">
        <h2 id="sound-board-title" data-i18n="Table de mixage">
          Table de mixage
        </h2>
        <button
          type="button"
          popoverTarget="sound-board"
          popoverTargetAction="hide"
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
      <div id="sound-board-list"></div>
    </div>
  );
}

export interface SoundRow {
  login: string;
  display: string;
  profileUrl: string;
  sound: "muted" | "on";
  label: string;
  volume: number;
}
export function SoundBoard({
  rows,
  locked,
  onSound,
  onVolume,
}: {
  rows: SoundRow[];
  locked: boolean; // the global mute or the sound follow holds the intents
  onSound: (login: string) => void;
  onVolume: (login: string, value: number) => void;
}) {
  if (!rows.length)
    return (
      <p className="sound-board-empty">{tr("Aucun stream dans la grille.")}</p>
    );
  return (
    <>
      {rows.map((row) => (
        <div
          className="sound-row"
          key={row.login}
          data-login={row.login}
          role="group"
          aria-label={row.display}
        >
          <img src={row.profileUrl} alt="" width={24} height={24} />
          <b>{row.display}</b>
          <button
            type="button"
            className="snd"
            data-sound={row.sound}
            title={row.label}
            aria-label={row.label}
            aria-disabled={locked}
            onClick={() => onSound(row.login)}
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
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={row.volume}
            disabled={locked}
            aria-label={tr("Volume")}
            onChange={(e) => onVolume(row.login, Number(e.currentTarget.value))}
          />
        </div>
      ))}
    </>
  );
}
