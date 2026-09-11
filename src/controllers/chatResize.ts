import type { Tile } from "../types/player";
import { layoutChat } from "./videoLayout";

export function setupChatResize(tile: Tile, save: () => void) {
  const handle = tile.body.querySelector<HTMLElement>(".chat-resize")!;
  let drag:
    | {
        id: number;
        start: number;
        size: number;
        extent: number;
        position: string;
      }
    | undefined;
  const horizontal = (position: string) =>
    position === "left" || position === "right";
  const update = (position: string, fraction: number) => {
    tile.chatSize = {
      ...tile.chatSize,
      [horizontal(position) ? "horizontal" : "vertical"]: Math.min(
        0.9,
        Math.max(0.1, fraction),
      ),
    };
    layoutChat(tile);
  };
  handle.addEventListener("pointerdown", (event) => {
    const position = tile.body.dataset.chatPosition;
    if (event.button !== 0 || !position) return;
    event.preventDefault();
    const bounds = tile.body.getBoundingClientRect();
    const chat = tile.chat.getBoundingClientRect();
    drag = {
      id: event.pointerId,
      start: horizontal(position) ? event.clientX : event.clientY,
      size: horizontal(position) ? chat.width : chat.height,
      extent: horizontal(position) ? bounds.width : bounds.height,
      position,
    };
    handle.setPointerCapture(event.pointerId);
    handle.focus({ preventScroll: true });
    tile.body.classList.add("resizing-chat");
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (tile.body.dataset.chatPosition !== drag.position) {
      handle.releasePointerCapture(drag.id);
      return;
    }
    const coordinate = horizontal(drag.position)
      ? event.clientX
      : event.clientY;
    const sign = drag.position === "left" || drag.position === "top" ? 1 : -1;
    update(
      drag.position,
      (drag.size + sign * (coordinate - drag.start)) / drag.extent,
    );
  });
  handle.addEventListener("lostpointercapture", () => {
    if (!drag) return;
    drag = undefined;
    tile.body.classList.remove("resizing-chat");
    save();
  });
  handle.addEventListener("keydown", (event) => {
    const position = tile.body.dataset.chatPosition;
    if (!position) return;
    const keys = horizontal(position)
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
    const sign = position === "left" || position === "top" ? 1 : -1;
    const current = Number(handle.getAttribute("aria-valuenow")) / 100;
    update(
      position,
      event.key === "Home"
        ? 0.1
        : event.key === "End"
          ? 0.9
          : current + (event.key === keys[1] ? 0.02 : -0.02) * sign,
    );
    save();
  });
}
