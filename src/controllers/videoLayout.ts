import type { Tile } from "../types/player";
import type { Channel } from "../types/domain";

export function fit(p: HTMLElement) {
  // Grid cells can have fractional dimensions. clientWidth/clientHeight round up and can clip the iframe.
  const box = p.getBoundingClientRect();
  const width = Math.min(box.width, (box.height * 16) / 9),
    height = (width * 9) / 16;
  const bounds = {
    width: width + "px",
    height: height + "px",
    left: (box.width - width) / 2 + "px",
    top: (box.height - height) / 2 + "px",
  };
  const poster = p.querySelector<HTMLImageElement>(".stream-poster")!;
  if (poster) Object.assign(poster.style, bounds);
  // Keep the custom player's controls against the video, not the letterbox around it.
  const controls = p.querySelector<HTMLElement>(".custom-controls");
  if (controls)
    Object.assign(controls.style, {
      right: (box.width - width) / 2 + 10 + "px",
      bottom: (box.height - height) / 2 + 10 + "px",
    });
  const frame = p.querySelector<HTMLIFrameElement | HTMLVideoElement>(
    "iframe, video",
  )!;
  if (!frame) return;
  if (document.fullscreenElement === frame) {
    for (const property of ["width", "height", "left", "top"])
      frame.style.removeProperty(property);
    frame.style.transform = "none";
  } else Object.assign(frame.style, bounds, { transform: "none" });
}

export function layoutChat(t: Tile) {
  const width = t.body.clientWidth,
    height = t.body.clientHeight,
    ratio = 16 / 9;
  if (!width || !height) return;
  // Widen the side chat into the video's unused horizontal space, up to 480px.
  const chatWidth = Math.min(
    480,
    Math.max(320, width - height * ratio),
    Math.max(0, width - 160),
  );
  const minChatHeight = 420;
  const chatHeight = Math.min(minChatHeight, Math.max(0, height - 90));
  // Compare the rendered video size after reserving space for each possible chat position.
  const belowVideo = Math.min(width, (height - chatHeight) * ratio);
  const rightVideo = Math.min(width - chatWidth, height * ratio);
  const position =
    t.chatPosition === "auto"
      ? height - width / ratio >= minChatHeight || belowVideo + 24 >= rightVideo
        ? "bottom"
        : "right"
      : t.chatPosition;
  t.body.dataset.chatPosition = position;
  t.body.style.setProperty("--chat-width", chatWidth + "px");
  t.body.style.setProperty(
    "--video-height",
    Math.min(width / ratio, height - chatHeight) + "px",
  );
  fit(t.el.querySelector<HTMLDivElement>(".player")!);
}

export function previewImageURL(s: Channel) {
  if (s.online === false) return s.offlineUrl || ""; // the banner the channel set for its offline screen, when it has one
  const url =
    s.previewUrl ||
    `https://static-cdn.jtvnw.net/previews-ttv/live_user_${s.twitch}-{width}x{height}.jpg`;
  return (
    url.replace("{width}", "640").replace("{height}", "360") +
    (url.includes("?") ? "&" : "?") +
    "v=" +
    Math.floor(Date.now() / 60000)
  );
}
