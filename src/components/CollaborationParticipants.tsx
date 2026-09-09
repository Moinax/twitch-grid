import type { Channel } from "../types/domain";
import { tr } from "../services/preferences";
export function CollaborationParticipants({
  participants,
  selected,
  locked,
  onAdd,
}: {
  participants: Channel[];
  selected: Set<string>;
  locked: boolean;
  onAdd: (channel: Channel) => void;
}) {
  return (
    <>
      {participants.map((s) => {
        const present = selected.has(s.twitch);
        return (
          <div
            className="collaboration-row"
            data-participant={s.twitch}
            key={s.twitch}
          >
            <img alt="" src={s.profileUrl} />
            <div>
              <span className="collaboration-name">{s.display}</span>
              <small>
                {present
                  ? tr("Déjà dans la grille")
                  : s.online
                    ? s.game || tr("En direct")
                    : tr("Hors ligne")}
              </small>
            </div>
            <button
              type="button"
              aria-label={tr("Ajouter {name}", { name: s.display })}
              disabled={present || !s.online || locked}
              onClick={() => onAdd(s)}
            >
              {tr(present ? "Ajouté" : "Ajouter")}
            </button>
          </div>
        );
      })}
    </>
  );
}
