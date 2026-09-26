// Scale only the custom video: layout can keep updating its dimensions independently.
export function enableVideoZoom(video: HTMLVideoElement) {
  const abort = new AbortController();
  const options = { passive: false, signal: abort.signal };
  let scale = 1;
  let distance = 0;
  let startScale = 1;
  let pinching = false;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let origin = { x: 0, y: 0 };
  const center = (touches: TouchList) => ({
    x: (touches[0].clientX + (touches[1]?.clientX ?? touches[0].clientX)) / 2,
    y: (touches[0].clientY + (touches[1]?.clientY ?? touches[0].clientY)) / 2,
  });
  const paint = () => {
    const frame = video.parentElement;
    if (!frame) return;
    const maxX = Math.max(
      0,
      (video.offsetWidth * scale - frame.clientWidth) / 2,
    );
    const maxY = Math.max(
      0,
      (video.offsetHeight * scale - frame.clientHeight) / 2,
    );
    x = Math.max(-maxX, Math.min(maxX, x));
    y = Math.max(-maxY, Math.min(maxY, y));
    video.style.scale = String(scale);
    video.style.translate = `${x}px ${y}px`;
  };
  const begin = (touches: TouchList) => {
    distance = touches.length === 2 ? gap(touches) : 0;
    startScale = scale;
    startX = x;
    startY = y;
    origin = center(touches);
  };
  const fullscreen = () =>
    !!document.fullscreenElement &&
    document.fullscreenElement === video.closest(".tile");
  const gap = (touches: TouchList) =>
    Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );
  const reset = () => {
    scale = startScale = 1;
    distance = 0;
    pinching = false;
    x = y = 0;
    video.style.removeProperty("scale");
    video.style.removeProperty("translate");
  };
  video.addEventListener(
    "touchstart",
    (event) => {
      if (!fullscreen() || event.touches.length > 2) return;
      if (event.touches.length !== 2 && scale === 1) return;
      event.preventDefault();
      pinching = true;
      begin(event.touches);
    },
    options,
  );
  video.addEventListener(
    "touchmove",
    (event) => {
      if (!fullscreen() || !pinching) return;
      event.preventDefault();
      if (!event.touches.length || event.touches.length > 2) return;
      if (event.touches.length === 2 && distance)
        scale = Math.min(
          4,
          Math.max(1, (startScale * gap(event.touches)) / distance),
        );
      const current = center(event.touches);
      const frame = video.parentElement!.getBoundingClientRect();
      const ratio = scale / startScale;
      // Keep the image point under the fingers fixed as the pinch moves and scales.
      x =
        current.x -
        origin.x +
        startX * ratio +
        (origin.x - frame.left - frame.width / 2) * (1 - ratio);
      y =
        current.y -
        origin.y +
        startY * ratio +
        (origin.y - frame.top - frame.height / 2) * (1 - ratio);
      paint();
    },
    options,
  );
  const end = (event: TouchEvent) => {
    if (!pinching) return;
    // A completed pinch must not become a click or double click on the player.
    event.preventDefault();
    distance = 0;
    if (!event.touches.length) pinching = false;
    else if (event.touches.length <= 2) begin(event.touches);
  };
  video.addEventListener("touchend", end, options);
  video.addEventListener("touchcancel", end, options);
  document.addEventListener("fullscreenchange", reset, {
    signal: abort.signal,
  });
  return () => {
    abort.abort();
    reset();
  };
}
