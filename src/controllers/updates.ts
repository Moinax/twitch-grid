import type { createLifecycle } from "./lifecycle";

export function watchForUpdates(
  lifecycle: ReturnType<typeof createLifecycle>,
  onUpdate: () => void,
) {
  // Vite already updates development modules. Production HTML names hashed bundles.
  if (import.meta.env.DEV) return;
  let previous: string | undefined;
  lifecycle.setInterval(async () => {
    try {
      const parts = await Promise.all(
        ["/index.html", "/config.json"].map(async (path) => {
          const response = await fetch(path, {
            cache: "no-store",
            signal: lifecycle.signal,
          });
          if (!response.ok) throw new Error("Version check failed");
          return response.text();
        }),
      );
      const current = parts.join("\n");
      if (previous && current !== previous) onUpdate();
      previous = current;
    } catch {
      /* Keep playing when the version check is unavailable. */
    }
  }, 60000);
}
