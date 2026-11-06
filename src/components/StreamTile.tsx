import { CollaborationMenu } from "./CollaborationMenu";
import { StreamPoster } from "./StreamPoster";
import type { MouseEvent, PointerEventHandler } from "react";
import type { ChatPosition } from "../types/domain";
const TILE_POSITIONS: [ChatPosition, string, number[] | null][] = [
  ["top", "Top", [0, 0, 36, 8]],
  ["left", "Left", [0, 0, 11, 24]],
  ["auto", "Auto", null],
  ["right", "Right", [25, 0, 11, 24]],
  ["bottom", "Bottom", [0, 16, 36, 8]],
];
interface Props {
  display: string;
  onSpotlight: () => void;
  onExpand: () => void;
  onPause: () => void;
  onPlayerToggle: () => void;
  onPlayerFullscreen: () => void;
  onVolume: (value: number) => void;
  onSound: () => void;
  onResume: () => void;
  onPlayerClick: (event: MouseEvent<HTMLDivElement>) => void;
  onRemove: () => void;
  onChat: () => void;
  onChatPosition: (position: ChatPosition) => void;
  onTileMenu: (menu: HTMLDetailsElement) => void;
  onTilesPosition: (position: ChatPosition) => void;
  onTilesSizeReset: () => void;
  onVolumeEnter: () => void;
  onVolumeLeave: () => void;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onLostPointerCapture: PointerEventHandler<HTMLDivElement>;
}

export function StreamTile({
  display,
  onSpotlight,
  onExpand,
  onPause,
  onPlayerToggle,
  onPlayerFullscreen,
  onVolume,
  onSound,
  onResume,
  onPlayerClick,
  onRemove,
  onChat,
  onChatPosition,
  onTileMenu,
  onTilesPosition,
  onTilesSizeReset,
  onVolumeEnter,
  onVolumeLeave,
  onPointerDown,
  onLostPointerCapture,
}: Props) {
  return (
    <>
      <div
        className="bar"
        onDragStart={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onLostPointerCapture={onLostPointerCapture}
      >
        <img className="stream-avatar" alt="" draggable={false} />
        <b>{display}</b>
        <span className="playback-status" role="status" />
        <div className="stream-info" hidden>
          <span className="stream-category"></span>
          <span className="stream-title"></span>
        </div>
        <span className="viewers"></span>
        <div className="actions">
          <details className="collaboration" hidden>
            <CollaborationMenu />
          </details>
          <button
            title="Utiliser le lecteur Twitch"
            data-i18n-title="Utiliser le lecteur Twitch"
            aria-label="Utiliser le lecteur Twitch"
            data-i18n-aria-label="Utiliser le lecteur Twitch"
            aria-pressed="false"
            className="player-toggle"
            onClick={(e) => {
              e.stopPropagation();
              onPlayerToggle();
            }}
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
              <path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4" />
            </svg>
          </button>
          <button
            title="Afficher le chat"
            data-i18n-title="Afficher le chat"
            aria-label="Afficher le chat"
            data-i18n-aria-label="Afficher le chat"
            aria-expanded="false"
            className="chat-toggle"
            onClick={(e) => {
              e.stopPropagation();
              onChat();
            }}
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
              <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
            </svg>
          </button>
          <details
            className="chat-options"
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onToggle={(e) => onTileMenu(e.currentTarget)}
            hidden
          >
            <summary
              title="Options du chat"
              data-i18n-title="Options du chat"
              aria-label="Options du chat"
              data-i18n-aria-label="Options du chat"
            >
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div className="chat-menu">
              <label>
                <span data-i18n="Position du chat">Position du chat</span>
                <select
                  onChange={(e) =>
                    onChatPosition(e.currentTarget.value as ChatPosition)
                  }
                  aria-label="Position du chat"
                  data-i18n-aria-label="Position du chat"
                >
                  <option value="auto" data-i18n="Auto">
                    Auto
                  </option>
                  <option value="top" data-i18n="Top">
                    Top
                  </option>
                  <option value="bottom" data-i18n="Bottom">
                    Bottom
                  </option>
                  <option value="left" data-i18n="Left">
                    Left
                  </option>
                  <option value="right" data-i18n="Right">
                    Right
                  </option>
                </select>
              </label>
              <a target="_blank" rel="noopener" data-i18n="Ouvrir sur Twitch ↗">
                Ouvrir sur Twitch ↗
              </a>
            </div>
          </details>
          <details
            className="tiles-options"
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onToggle={(e) => onTileMenu(e.currentTarget)}
          >
            <summary
              title="Position des tuiles"
              data-i18n-title="Position des tuiles"
              aria-label="Position des tuiles"
              data-i18n-aria-label="Position des tuiles"
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
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 15h18M9 15v5M15 15v5" />
              </svg>
            </summary>
            <div className="chat-menu tiles-menu">
              <span data-i18n="Position des tuiles">Position des tuiles</span>
              <div className="tiles-picker">
                {TILE_POSITIONS.map(([position, label, zone]) => (
                  <button
                    key={position}
                    data-tiles-position={position}
                    title={label}
                    data-i18n-title={label}
                    aria-label={label}
                    data-i18n-aria-label={label}
                    aria-pressed="false"
                    style={{
                      gridArea: position === "auto" ? "center" : position,
                    }}
                    onClick={() => onTilesPosition(position)}
                  >
                    <svg
                      viewBox="0 0 36 24"
                      width="36"
                      height="24"
                      aria-hidden="true"
                    >
                      <rect
                        x=".5"
                        y=".5"
                        width="35"
                        height="23"
                        rx="2"
                        fill="none"
                        stroke="currentColor"
                        opacity=".55"
                      />
                      {zone ? (
                        <rect
                          x={zone[0]}
                          y={zone[1]}
                          width={zone[2]}
                          height={zone[3]}
                          fill="currentColor"
                          opacity=".75"
                        />
                      ) : (
                        <text
                          x="18"
                          y="16"
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="600"
                          fill="currentColor"
                        >
                          Auto
                        </text>
                      )}
                    </svg>
                  </button>
                ))}
              </div>
              <button
                className="tiles-size-reset"
                hidden
                data-i18n="Taille auto"
                onClick={onTilesSizeReset}
              >
                Taille auto
              </button>
            </div>
          </details>
          <button
            title="Play/pause"
            data-i18n-title="Play/pause"
            aria-label="Play/pause"
            data-i18n-aria-label="Play/pause"
            aria-pressed="false"
            className="pp"
            onClick={(e) => {
              e.stopPropagation();
              onPause();
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <g className="pause">
                <path d="M8 5v14M16 5v14" />
              </g>
              <g className="play">
                <path d="M7 4v16l13-8z" fill="currentColor" />
              </g>
            </svg>
          </button>
          <span className="snd-wrap">
            <button
              title="Son"
              data-i18n-title="Son"
              className="snd"
              onClick={(e) => {
                e.stopPropagation();
                onSound();
              }}
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
            <div
              className="volume"
              onDragStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onPointerEnter={onVolumeEnter}
              onPointerLeave={onVolumeLeave}
            >
              <input
                type="range"
                onInput={(e) => onVolume(Number(e.currentTarget.value))}
                min="0"
                max="1"
                step="0.05"
                title="Volume"
                data-i18n-title="Volume"
                aria-label="Volume"
                data-i18n-aria-label="Volume"
              />
            </div>
          </span>
          <button
            title="Spotlight (SHIFT+CLICK)"
            data-i18n-title="Spotlight (SHIFT+CLICK)"
            aria-pressed="false"
            className="spotlight"
            onClick={(e) => {
              e.stopPropagation();
              onSpotlight();
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            >
              <rect x="3" y="5" width="12" height="14" rx="1" />
              <rect x="17" y="5" width="4" height="6" rx="1" />
              <rect x="17" y="13" width="4" height="6" rx="1" />
            </svg>
          </button>
          <button
            title="Agrandir dans la fenêtre"
            data-i18n-title="Agrandir dans la fenêtre"
            className="fs"
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
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
            >
              <g className="enter">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </g>
              <g className="exit">
                <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
              </g>
            </svg>
          </button>
          <button
            title="Retirer"
            data-i18n-title="Retirer"
            className="close"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
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
        </div>
      </div>
      <div className="tile-body">
        <div
          className="player"
          onClickCapture={(event) => {
            if (event.shiftKey) {
              event.stopPropagation();
              onSpotlight();
            }
          }}
          onClick={onPlayerClick}
          onDoubleClick={onPlayerFullscreen}
        >
          <div className="preview-cover">
            <StreamPoster />
            <button
              className="pause-play"
              title="Lecture"
              data-i18n-title="Lecture"
              aria-label="Lecture"
              data-i18n-aria-label="Lecture"
              onClick={(event) => {
                event.stopPropagation();
                onResume();
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="30"
                height="30"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M7 4v16l13-8z" />
              </svg>
            </button>
          </div>
        </div>
        <section className="chat" hidden></section>
        <div
          className="chat-resize"
          role="separator"
          tabIndex={0}
          aria-label="Resize chat"
          data-i18n-aria-label="Resize chat"
          aria-valuemin={10}
          aria-valuemax={90}
        />
      </div>
      <div className="drop" data-i18n="Déposer ici">
        Drop here
      </div>
    </>
  );
}
