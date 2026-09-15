const { test, expect } = require("@playwright/test");
const path = require("node:path");

const MEDIA = (name) =>
  `#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-VERSION:3\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:2,\n/test-media.ts?${name}\n`;

// A live stream errors often. hls.js unpins the chosen level on any level error unless
// preserveManualLevelOnError is set, and the tile silently goes back to adapting.
test("a pinned level survives a level playlist error", async ({ page }) => {
  let lowFails = false;
  await page.addInitScript(() => {
    localStorage.setItem(
      "tg.preferences",
      JSON.stringify({ player: "custom", language: "en" }),
    );
    sessionStorage.setItem("tg.landing", "true");
  });
  await page.route("https://player.twitch.tv/js/embed/v1.js", (r) => r.abort());
  await page.route("**/config.json", (r) =>
    r.fulfill({ json: { twitchClientId: "" } }),
  );
  await page.route("**/api/search?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        data: params.has("login")
          ? params
              .getAll("login")
              .map((login) => ({ broadcaster_login: login, is_live: true }))
          : [],
      },
    });
  });
  await page.route("**/api/stream?**", (r) =>
    r.fulfill({
      contentType: "application/vnd.apple.mpegurl",
      body:
        "#EXTM3U\n" +
        '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=320x180,CODECS="avc1.42c00d"\n/high.m3u8\n' +
        '#EXT-X-STREAM-INF:BANDWIDTH=200000,RESOLUTION=160x90,CODECS="avc1.42c00d"\n/low.m3u8\n',
    }),
  );
  await page.route("**/high.m3u8", (r) =>
    r.fulfill({
      contentType: "application/vnd.apple.mpegurl",
      body: MEDIA("high"),
    }),
  );
  await page.route("**/low.m3u8", (r) =>
    lowFails
      ? r.fulfill({ status: 404, body: "gone" })
      : r.fulfill({
          contentType: "application/vnd.apple.mpegurl",
          body: MEDIA("low"),
        }),
  );
  await page.route("**/test-media.ts*", (r) =>
    r.fulfill({
      contentType: "video/mp2t",
      path: path.join(__dirname, "media/playback.ts"),
    }),
  );
  await page.goto("/");
  await page.waitForFunction(() => typeof add === "function" && restored);
  await page.evaluate(() =>
    add({
      twitch: "example",
      display: "Example",
      online: true,
      profileUrl: "",
      previewUrl: "",
      offlineUrl: "",
      title: "",
      game: "",
      viewersAmount: { number: 0, formatted: "" },
    }),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => tiles.get("example").player?.hls?.levels?.length ?? 0,
      ),
    )
    .toBe(2);
  await page.evaluate(() => tiles.get("example").player.setQuality("90p"));
  const state = () =>
    page.evaluate(() => {
      const hls = tiles.get("example").player.hls;
      return { manual: hls.manualLevel, auto: hls.autoLevelEnabled };
    });
  expect(await state()).toEqual({ manual: 0, auto: false });
  await page.evaluate(() => {
    window.levelErrors = 0;
    const hls = tiles.get("example").player.hls;
    hls.on("hlsError", (_, d) => {
      if (
        d.details.includes("levelLoadError") ||
        d.details.includes("LoadError")
      )
        window.levelErrors++;
    });
  });
  lowFails = true;
  await expect
    .poll(() => page.evaluate(() => window.levelErrors), { timeout: 30000 })
    .toBeGreaterThan(0);
  await page.waitForTimeout(2000);
  expect(await state()).toEqual({ manual: 0, auto: false });
  await expect(page.locator("#grid .custom-quality summary")).toHaveText("90p");
});
