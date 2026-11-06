import type { Tile } from "../types/player";
import { layoutChat } from "./videoLayout";

const isHorizontal = (position: string) =>
  position === "left" || position === "right";

const DRAG_THRESHOLD = 3; // a press that barely moves is a click, not a resize

// A panel docked on one side of a box, resized by dragging its edge or with the arrows; Home and End jump to the
// handle's aria-valuemin and aria-valuemax.
export function setupResizeHandle(
  handle: HTMLElement,
  {
    position,
    measure,
    resize,
    dragging,
    save,
  }: {
    position: () => string | undefined;
    measure: (position: string) => { size: number; extent: number };
    resize: (position: string, fraction: number, pointer: boolean) => void;
    dragging: (active: boolean) => void;
    save: () => void;
  },
) {
  let drag:
    | {
        id: number;
        start: number;
        size: number;
        extent: number;
        position: string;
        moved: boolean;
      }
    | undefined;
  handle.addEventListener("pointerdown", (event) => {
    const side = position();
    if (event.button !== 0 || !side) return;
    event.preventDefault();
    drag = {
      id: event.pointerId,
      start: isHorizontal(side) ? event.clientX : event.clientY,
      position: side,
      moved: false,
      ...measure(side),
    };
    handle.setPointerCapture(event.pointerId);
    handle.focus({ preventScroll: true });
    dragging(true);
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (position() !== drag.position) {
      handle.releasePointerCapture(drag.id);
      return;
    }
    const coordinate = isHorizontal(drag.position)
      ? event.clientX
      : event.clientY;
    if (!drag.moved && Math.abs(coordinate - drag.start) < DRAG_THRESHOLD)
      return;
    drag.moved = true;
    const sign = drag.position === "left" || drag.position === "top" ? 1 : -1;
    resize(
      drag.position,
      (drag.size + sign * (coordinate - drag.start)) / drag.extent,
      true,
    );
  });
  handle.addEventListener("lostpointercapture", () => {
    if (!drag) return;
    drag = undefined;
    dragging(false);
    save();
  });
  handle.addEventListener("keydown", (event) => {
    const side = position();
    if (!side) return;
    const keys = isHorizontal(side)
      ? ["ArrowLeft", "ArrowRight"]
      : ["ArrowUp", "ArrowDown"];
    if (
      !keys.includes(event.key) &&
      event.key !== "Home" &&
      event.key !== "End"
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const sign = side === "left" || side === "top" ? 1 : -1;
    const percent = (name: string) => Number(handle.getAttribute(name)) / 100;
    resize(
      side,
      event.key === "Home"
        ? percent("aria-valuemin")
        : event.key === "End"
          ? percent("aria-valuemax")
          : percent("aria-valuenow") +
            (event.key === keys[1] ? 0.02 : -0.02) * sign,
      false,
    );
    save();
  });
}

export function setupChatResize(tile: Tile, save: () => void) {
  setupResizeHandle(tile.body.querySelector<HTMLElement>(".chat-resize")!, {
    position: () => tile.body.dataset.chatPosition,
    measure: (position) => {
      const bounds = tile.body.getBoundingClientRect();
      const chat = tile.chat.getBoundingClientRect();
      return isHorizontal(position)
        ? { size: chat.width, extent: bounds.width }
        : { size: chat.height, extent: bounds.height };
    },
    resize: (position, fraction) => {
      tile.chatSize = {
        ...tile.chatSize,
        [isHorizontal(position) ? "horizontal" : "vertical"]: Math.min(
          0.9,
          Math.max(0.1, fraction),
        ),
      };
      layoutChat(tile);
    },
    dragging: (active) => tile.body.classList.toggle("resizing-chat", active),
    save,
  });
}
