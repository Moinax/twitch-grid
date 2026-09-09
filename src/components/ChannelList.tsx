import type { Channel, Collaboration } from "../types/domain";
import { tr } from "../services/preferences";
import { CollaborationIcon } from "./CollaborationIcon";

interface Props {
  rows: Channel[];
  skeletonCount: number;
  connected: boolean;
  ready: boolean;
  locked: boolean;
  selected: Set<string>;
  favorites: Set<string>;
  refreshing: boolean;
  collaborations: Map<string, Collaboration>;
  onToggle: (channel: Channel) => void;
  onFavorite: (channel: Channel) => void;
  onPreview: (row: HTMLLIElement) => void;
  onLeavePreview: () => void;
}
function FavoriteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
    </svg>
  );
}
export function ChannelList(props: Props) {
  const {
    rows,
    skeletonCount,
    selected,
    favorites,
    collaborations,
    connected,
    ready,
    locked,
    refreshing,
    onToggle,
    onFavorite,
    onPreview,
    onLeavePreview,
  } = props;
  return (
    <>
      {rows.map((s) => {
        const present = selected.has(s.twitch),
          saved = favorites.has(s.twitch),
          blocked = locked && !present;
        const participants =
          s.online === false
            ? []
            : collaborations.get(s.twitch)?.participants || [];
        const collaborationLabel = tr("Collaboration : {names}", {
          names: participants.map((p) => p.display).join(", "),
        });
        const favoriteLabel = tr(
          saved
            ? "Retirer des favoris : {name}"
            : "Ajouter aux favoris : {name}",
          { name: s.display },
        );
        return (
          <li
            key={s.twitch}
            data-login={s.twitch}
            className={
              (s.online === true ? "live" : s.online === false ? "off" : "") +
              (present ? " on" : "") +
              (s.online == null && refreshing ? " pending" : "")
            }
            onPointerEnter={(e) => {
              if (e.pointerType !== "touch") onPreview(e.currentTarget);
            }}
            onPointerLeave={onLeavePreview}
          >
            <button
              className={"channel" + (blocked ? " blocked" : "")}
              disabled={!ready || blocked}
              title={blocked ? tr("Grille verrouillée") : ""}
              aria-label={tr(
                present ? "Afficher ou retirer {name}" : "Regarder {name}",
                { name: s.display },
              )}
              aria-pressed={present}
              onClick={() => onToggle(s)}
              onFocus={(e) => onPreview(e.currentTarget.closest("li")!)}
              onBlur={onLeavePreview}
            >
              <img alt="" loading="lazy" src={s.profileUrl} title={s.display} />
              <span className="n">
                <span className="name">{s.display}</span>
                {participants.some((p) => p.twitch !== s.twitch) && (
                  <span
                    className="collaboration-indicator"
                    title={collaborationLabel}
                    role="img"
                    aria-label={collaborationLabel}
                  >
                    <CollaborationIcon />
                  </span>
                )}
                <div className="g">
                  {[s.online === false ? tr("Hors ligne") : "", s.game]
                    .filter(Boolean)
                    .join(" · ") || tr("Chaîne Twitch")}
                </div>
              </span>
              <span className="v">
                {s.online ? s.viewersAmount.formatted || "LIVE" : ""}
              </span>
            </button>
            <button
              className="favorite"
              hidden={connected}
              title={favoriteLabel}
              aria-label={favoriteLabel}
              aria-pressed={saved}
              onClick={() => onFavorite(s)}
            >
              <FavoriteIcon />
            </button>
          </li>
        );
      })}
      {Array.from({ length: skeletonCount }, (_, i) => (
        <li key={"skeleton-" + i} className="skeleton" aria-hidden="true">
          <span className="channel">
            <i />
            <span className="n">
              <b />
              <small />
            </span>
          </span>
        </li>
      ))}
    </>
  );
}
