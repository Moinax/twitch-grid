import type { Channel } from "../types/domain";
import { tr } from "../services/preferences";
export function LiveNotification({
  channel,
  onWatch,
  onDismiss,
}: {
  channel: Channel;
  onWatch: () => void;
  onDismiss: () => void;
}) {
  return (
    <>
      <button className="watch" onClick={onWatch}>
        <img alt="" src={channel.profileUrl} />
        <span>
          <b>{tr("{name} est en direct", { name: channel.display })}</b>
          <small data-i18n="Afficher dans la grille">
            {tr("Afficher dans la grille")}
          </small>
        </span>
      </button>
      <button
        className="dismiss"
        aria-label={tr("Fermer la notification")}
        data-i18n-aria-label="Fermer la notification"
        onClick={onDismiss}
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
    </>
  );
}
