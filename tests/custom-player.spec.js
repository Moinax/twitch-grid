const { test, expect } = require("@playwright/test");
const { mockPlayer, choose } = require("./fixtures.cjs");
const path = require("node:path");
async function setup(page, player = "embed", fail = false) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((player) => {
    if (!localStorage.getItem("tg.preferences"))
      localStorage.setItem(
        "tg.preferences",
        JSON.stringify(
          player ? { player, language: "en" } : { language: "en" },
        ),
      );
    sessionStorage.setItem("tg.landing", "true");
  }, player);
  await page.route("https://player.twitch.tv/js/embed/v1.js", (route) =>
    player === "custom"
      ? route.abort()
      : route.fulfill({ contentType: "text/javascript", body: mockPlayer }),
  );
  await page.route("**/config.json", (route) =>
    route.fulfill({ json: { twitchClientId: "" } }),
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
  await page.route("**/api/stream?**", (route) =>
    fail
      ? route.fulfill({
          status: 502,
          json: { error: "PLAYBACK_ACCESS_DENIED" },
        })
      : route.fulfill({
          contentType: "application/vnd.apple.mpegurl",
          body: "#EXTM3U\n#EXT-X-TARGETDURATION:20\n#EXT-X-VERSION:3\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:20,\nhttp://localhost:8767/test-media.ts\n#EXT-X-ENDLIST\n",
        }),
  );
  await page.route("**/test-media.ts", (route) =>
    route.fulfill({
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
  return errors;
}
test("switches between embed and HLS while preserving tile settings", async ({
  page,
}) => {
  const errors = await setup(page);
  await expect(page.locator("#grid iframe")).toHaveCount(1);
  await expect(page.locator("[title]:not(iframe)")).toHaveCount(0); // no tooltip can cover the embed
  await page.evaluate(() => {
    tiles.get("example").volume = 0.3;
  });
  await choose(page, "#player-setting", "custom");
  await expect(page.locator("#grid iframe")).toHaveCount(0);
  await expect
    .poll(() =>
      page.locator("#grid video").evaluate((video) => video.currentTime),
    )
    .toBeGreaterThan(0);
  await expect(page.locator("#grid video")).toHaveJSProperty("volume", 0.3);
  // With no iframe to cover, the styled tooltips come back on every action, the player's own included.
  await expect(page.locator("#grid .tile .spotlight")).toHaveAttribute(
    "title",
    "Spotlight (SHIFT+CLICK)",
  );
  await expect(page.locator("#grid .custom-fullscreen")).toHaveAttribute(
    "title",
    "Fullscreen",
  );
  await expect(page.locator("#grid .tile [data-tip]")).toHaveCount(0);
  await page.locator("#grid .custom-fullscreen").hover();
  await expect(page.locator("#tooltip")).toHaveText("Fullscreen");
  await expect(page.locator("#tooltip kbd")).toHaveCount(0);
  await expect(page.locator("#grid .custom-fullscreen")).not.toHaveAttribute(
    "title",
  ); // no native tooltip on top of ours
  await page.locator("#q").hover();
  await expect(page.locator("#tooltip")).toBeHidden();
  await expect(page.locator("#grid .custom-fullscreen")).toHaveAttribute(
    "title",
    "Fullscreen",
  );
  // the video is named for assistive tech, not with a title that would hang a tooltip over the stream
  await expect(page.locator("#grid video")).toHaveAttribute(
    "aria-label",
    "Stream by Example",
  );
  await expect(page.locator("#grid video")).not.toHaveAttribute("title");
  await page.locator("#grid video").hover();
  await page.waitForTimeout(700);
  await expect(page.locator("#tooltip")).toBeHidden();
  await page.evaluate(() => {
    window.originalVideo = document.querySelector("#grid video");
  });
  await choose(page, "#theme-setting", "light");
  expect(
    await page.evaluate(
      () => originalVideo === document.querySelector("#grid video"),
    ),
  ).toBe(true);
  await choose(page, "#player-setting", "embed");
  await expect(page.locator("#grid video")).toHaveCount(0);
  await expect(page.locator("#grid iframe")).toHaveCount(1);
  expect(await page.evaluate(() => tiles.get("example").volume)).toBe(0.3);
  await expect(page.locator("[title]:not(iframe)")).toHaveCount(0);
  await expect(page.locator("#grid .tile .spotlight")).toHaveAttribute(
    "data-tip",
    "Spotlight (SHIFT+CLICK)",
  );
  expect(errors).toEqual([]);
});
test("custom mode starts without the Twitch SDK and survives reload", async ({
  page,
}) => {
  const errors = await setup(page, "custom");
  await expect
    .poll(() =>
      page.locator("#grid video").evaluate((video) => video.currentTime),
    )
    .toBeGreaterThan(0);
  // The themed bar replaces the browser chrome and fullscreens the tile, so its own bar stays reachable.
  await expect(page.locator("#grid video")).toHaveJSProperty("controls", false);
  await expect(page.locator("#grid .custom-quality")).toHaveValue("auto");
  await expect(page.locator("#grid .custom-quality-badge")).toHaveText("90p");
  await expect(page.locator("#grid .custom-quality-badge")).toHaveClass(
    /visible/,
  );
  await expect(page.locator("#grid .custom-latency.stable")).toHaveAttribute(
    "title",
    "Stable latency: switch to low latency",
  );
  await expect(page.locator("#grid .custom-quality-badge")).not.toHaveClass(
    /visible/,
    { timeout: 4000 },
  );
  await page.locator("#grid .tile").hover();
  await expect(page.locator("#grid .custom-quality-badge")).toHaveCSS(
    "opacity",
    "1",
  );
  // Its play, sound and volume drive the media element, and the tile reads the change back.
  await expect
    .poll(() => page.evaluate(() => tiles.get("example").wasPlaying))
    .toBe(true);
  await page.locator("#grid .custom-sound").click();
  await expect
    .poll(() => page.evaluate(() => tiles.get("example").muted))
    .toBe(false);
  await page.locator("#grid .custom-volume").fill("0.4");
  await expect
    .poll(() => page.evaluate(() => tiles.get("example").volume))
    .toBe(0.4);
  await page.locator("#grid .custom-pp").click();
  await expect(page.locator("#grid video")).toHaveJSProperty("paused", true);
  await expect
    .poll(() => page.evaluate(() => tiles.get("example").paused))
    .toBe(true);
  await page.locator("#grid .custom-pp").click();
  await expect(page.locator("#grid video")).toHaveJSProperty("paused", false);
  await expect(page.locator("#grid .player")).toHaveCSS("cursor", "auto");
  // A click on the video leaves playback alone; a double click fullscreens the tile.
  await page.locator("#grid video").click();
  await expect(page.locator("#grid video")).toHaveJSProperty("paused", false);
  await page.locator("#grid video").dblclick();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.className))
    .toContain("tile");
  await expect(page.locator("#grid video")).toHaveJSProperty("paused", false);
  await page.locator("#grid .custom-fullscreen").click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
  await page.reload();
  await expect(page.locator("#player-setting")).toHaveValue("custom");
  await expect(page.locator("#grid video")).toHaveCount(1);
  await expect(page.locator("#grid iframe")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("a visit with no saved choice gets the custom player", async ({
  page,
}) => {
  const errors = await setup(page, null);
  await expect(page.locator("#player-setting")).toHaveValue("custom");
  await expect(page.locator("#grid video")).toHaveCount(1);
  await expect(page.locator("#grid iframe")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("low latency persists and remounts custom players with a tighter live target", async ({
  page,
}) => {
  const errors = await setup(page, "custom");
  await expect(page.locator("#latency-setting")).toHaveValue("stable");
  await expect(page.locator("#latency-setting")).toBeEnabled();
  await page.evaluate(() => {
    window.stableVideo = document.querySelector("#grid video");
  });
  await choose(page, "#latency-setting", "low");
  await expect(page.locator("#grid .custom-latency.low")).toHaveAttribute(
    "title",
    "Low latency: switch to stable",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => stableVideo !== document.querySelector("#grid video"),
      ),
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => Boolean(tiles.get("example").player.hls)))
    .toBe(true);
  expect(
    await page.evaluate(() => {
      const config = tiles.get("example").player.hls.config;
      return {
        capLevelToPlayerSize: config.capLevelToPlayerSize,
        liveSyncDurationCount: config.liveSyncDurationCount,
        liveMaxLatencyDurationCount: config.liveMaxLatencyDurationCount,
        maxLiveSyncPlaybackRate: config.maxLiveSyncPlaybackRate,
      };
    }),
  ).toEqual({
    capLevelToPlayerSize: true,
    liveSyncDurationCount: 2,
    liveMaxLatencyDurationCount: 4,
    maxLiveSyncPlaybackRate: 1.05,
  });
  await page.reload();
  await expect(page.locator("#latency-setting")).toHaveValue("low");
  await choose(page, "#player-setting", "embed");
  await expect(page.locator("#latency-setting")).toBeDisabled();
  expect(errors).toEqual([]);
});
test("failed HLS playback offers a retry and a switch back to the embed", async ({
  page,
}) => {
  const errors = await setup(page, "embed", true);
  await choose(page, "#player-setting", "custom");
  await expect(page.locator(".custom-retry")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".custom-retry")).toHaveText(
    "Stream unavailable. Retry",
  );
  // the failure itself offers the official player, no trip to the settings
  await expect(page.locator(".custom-fallback")).toHaveText(
    "Use the Twitch player",
  );
  await page.locator(".custom-fallback").click();
  await expect(page.locator("#player-setting")).toHaveValue("embed");
  await expect(page.locator("#grid iframe")).toHaveCount(1);
  await expect(page.locator(".custom-retry")).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const pauseMode of ["tile", "global", "native"]) {
  test(`custom ${pauseMode} pause retains the video and last frame until resumed`, async ({
    page,
  }) => {
    const errors = await setup(page, "custom");
    const tile = page.locator('#grid [data-login="example"]');
    const video = tile.locator("video");
    await expect
      .poll(() => video.evaluate((video) => video.currentTime))
      .toBeGreaterThan(0);
    await page.evaluate(() => {
      window.retainedVideo = document.querySelector("#grid video");
    });
    if (pauseMode === "native") {
      await video.evaluate((video) => video.pause());
    } else {
      // Small tiles must also stay paused when hovered.
      await page.setViewportSize({ width: 900, height: 720 });
      await page.evaluate(() =>
        add({
          twitch: "second",
          display: "Second",
          online: true,
          profileUrl: "",
          previewUrl: "",
          offlineUrl: "",
          title: "",
          game: "",
          viewersAmount: { number: 0, formatted: "" },
        }),
      );
      await page
        .locator(
          pauseMode === "global"
            ? "#playall"
            : '#grid [data-login="example"] .pp',
        )
        .click();
    }
    await expect(video).toHaveJSProperty("paused", true);
    const pausedAt = await video.evaluate((video) => video.currentTime);
    await tile.locator(".player").hover();
    // Span a watchdog tick to catch unintended hover or background resumption.
    await page.waitForTimeout(1200);
    expect(
      await page.evaluate(
        () =>
          retainedVideo ===
          document.querySelector('#grid [data-login="example"] video'),
      ),
    ).toBe(true);
    await expect(video).toHaveJSProperty("paused", true);
    await expect(video).toHaveJSProperty("currentTime", pausedAt);
    await expect(tile).not.toHaveClass(/poster-only/);
    await expect(tile.locator(".preview-cover")).toHaveClass(/pause-overlay/);
    await expect(tile.locator(".stream-poster")).toBeHidden();
    const playButton = tile
      .locator(".preview-cover")
      .getByRole("button", { name: "Play", exact: true });
    await expect(playButton).toBeVisible();
    if (pauseMode === "native") {
      await playButton.focus();
      await page.keyboard.press("Enter");
    } else await playButton.click();
    await expect(playButton).toBeHidden();
    await expect
      .poll(() => video.evaluate((video) => video.currentTime))
      .toBeGreaterThan(pausedAt);
    expect(
      await page.evaluate(
        () =>
          retainedVideo ===
          document.querySelector('#grid [data-login="example"] video'),
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("shortcut tooltips render keycaps and the collapsed toggle stays above GitHub", async ({
  page,
}) => {
  const errors = await setup(page, "custom");
  await page.evaluate(() =>
    add({
      ...tiles.get("example").channel,
      twitch: "second",
      display: "Second",
    }),
  );
  await page.locator('#grid [data-login="example"] .spotlight').hover();
  await expect(page.locator("#tooltip kbd")).toHaveText(["Shift", "Click"]);
  await page.locator("#soundfollow").hover();
  await expect(page.locator("#tooltip kbd")).toHaveText(["Shift"]);
  await page.locator("#playall").hover();
  await expect(page.locator("#tooltip kbd")).toHaveText(["Space"]);
  await page.locator("#muteall").hover();
  await expect(page.locator("#tooltip kbd")).toHaveText(["Shift", "M"]);
  await page.locator("#toggle").click();
  await expect(page.locator("body")).toHaveClass(/collapsed/);
  const toggle = await page.locator("#toggle").boundingBox();
  const github = await page.locator("#ctl .github").boundingBox();
  expect(toggle.y + toggle.height).toBeLessThanOrEqual(github.y);
  await page.locator("#toggle").click();
  await expect(page.locator("body")).not.toHaveClass(/collapsed/);
  expect(errors).toEqual([]);
});

test("tile latency switches independently and global settings replace overrides", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  const errors = await setup(page, "custom");
  await page.evaluate(() =>
    add({
      ...tiles.get("example").channel,
      twitch: "second",
      display: "Second",
    }),
  );
  const first = page.locator('#grid [data-login="example"]');
  const second = page.locator('#grid [data-login="second"]');
  await expect(first.locator(".custom-quality")).toHaveValue("auto");
  await expect
    .poll(() => page.evaluate(() => [...tiles.values()].every((t) => t.ready)))
    .toBe(true);
  await expect
    .poll(() => first.locator("video").evaluate((video) => video.currentTime))
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    const t = tiles.get("example");
    t.player.setVolume(0.3);
    t.player.setQuality("90p");
    window.otherLatencyPlayer = tiles.get("second").player;
  });
  await first.locator(".custom-latency").click();
  await expect(first.locator(".custom-latency")).toHaveClass(/low/);
  await expect(second.locator(".custom-latency")).toHaveClass(/stable/);
  await expect(first.locator("video")).toHaveJSProperty("volume", 0.3);
  expect(
    await page.evaluate(() => tiles.get("example").player.getQuality()),
  ).toBe("90p");
  await expect
    .poll(() =>
      page.evaluate(
        () => tiles.get("example").player?.hls?.config.liveSyncDurationCount,
      ),
    )
    .toBe(2);
  expect(
    await page.evaluate(
      () => tiles.get("second").player === window.otherLatencyPlayer,
    ),
  ).toBe(true);
  await expect(page.locator("#latency-setting")).toHaveValue("stable");
  await choose(page, "#latency-setting", "low");
  await expect(page.locator("#grid .custom-latency.low")).toHaveCount(2);
  await first.locator(".custom-latency").click();
  await expect(first.locator(".custom-latency")).toHaveClass(/stable/);
  await expect(second.locator(".custom-latency")).toHaveClass(/low/);
  await choose(page, "#latency-setting", "stable");
  await expect(page.locator("#grid .custom-latency.stable")).toHaveCount(2);
  expect(
    await page.evaluate(() =>
      [...tiles.values()].every((t) => t.latency === undefined),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
