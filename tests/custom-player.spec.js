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
  await expect(page.locator("#grid .custom-spotlight")).toHaveAttribute(
    "data-tip",
    "Spotlight (SHIFT+CLICK)",
  );
  await expect(page.locator("#grid .custom-spotlight")).toHaveJSProperty(
    "hidden",
    false,
  ); // a lone tile can be the spotlight too
  await expect(page.locator("#grid .custom-fullscreen")).toHaveAttribute(
    "data-tip",
    "Fullscreen",
  );
  await expect(page.locator("[title]:not(iframe)")).toHaveCount(0); // the browser's own tooltip never shows
  await page.locator("#grid video").hover();
  await page.locator("#grid .custom-fullscreen").hover();
  await expect(page.locator("#tooltip")).toHaveText("Fullscreen");
  await expect(page.locator("#tooltip kbd")).toHaveCount(0);
  await expect(page.locator("#grid .custom-fullscreen")).not.toHaveAttribute(
    "title",
  ); // no native tooltip on top of ours
  await page.locator("#q").hover();
  await expect(page.locator("#tooltip")).toBeHidden();
  await expect(page.locator("#grid .custom-fullscreen")).not.toHaveAttribute(
    "title",
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
  // The bar rests as the rendered resolution; the pointer over the video unfolds the actions.
  const pill = page.locator("#grid .custom-quality summary");
  await expect(pill).toHaveText("90p");
  await expect(pill).toBeVisible();
  await expect(page.locator("#grid .custom-quality")).not.toHaveClass(/manual/);
  await expect(page.locator("#grid .custom-sound")).toBeHidden();
  await page.locator("#grid video").hover();
  await expect(page.locator("#grid .custom-sound")).toBeVisible();
  // The dropdown lists the levels and the latency, marking the current choice of each.
  await pill.click();
  await expect(
    page.locator('#grid .custom-levels [aria-checked="true"]'),
  ).toHaveText("Auto");
  await expect(
    page.locator('#grid .custom-latencies [aria-checked="true"]'),
  ).toHaveText("Stable");
  // the test playlist has a single level: only Auto to pick, and picking it closes the menu
  await expect(page.locator("#grid .custom-levels .custom-option")).toHaveText([
    "Auto",
  ]);
  await page.locator("#grid .custom-levels .custom-option").click();
  await expect(page.locator("#grid .custom-quality")).not.toHaveAttribute(
    "open",
  );
  await expect(page.locator("#grid .custom-quality")).not.toHaveClass(/manual/);
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
  await page.locator("#grid video").hover();
  await page.locator("#grid .custom-pp").click();
  await expect(page.locator("#grid video")).toHaveJSProperty("paused", true);
  await expect
    .poll(() => page.evaluate(() => tiles.get("example").paused))
    .toBe(true);
  await page.locator("#grid .custom-pp").click();
  await expect(page.locator("#grid video")).toHaveJSProperty("paused", false);
  await expect(page.locator("#grid .player")).toHaveCSS("cursor", "auto");
  // the global mute takes the bar's sound and volume away, and gives them back
  await page.locator("#muteall").click();
  await expect(page.locator("#grid .custom-sound")).toBeDisabled();
  await expect(page.locator("#grid .custom-volume")).toBeDisabled();
  await page.locator("#muteall").click();
  await expect(page.locator("#grid .custom-sound")).toBeEnabled();
  await expect(page.locator("#grid .custom-volume")).toBeEnabled();
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
test("latency settings retune custom players in place and the spotlight follows its own", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  const errors = await setup(page, "custom");
  await expect(page.locator("#latency-setting")).toHaveValue("stable");
  await expect(page.locator("#spotlight-latency-setting")).toHaveValue("low");
  await expect(page.locator("#latency-setting")).toBeEnabled();
  const config = (login) =>
    page.evaluate((login) => {
      const config = tiles.get(login).player?.hls?.config;
      if (!config) return null; // HLS still loading: the polls try again
      return {
        capLevelToPlayerSize: config.capLevelToPlayerSize,
        liveSyncDurationCount: config.liveSyncDurationCount,
        liveMaxLatencyDurationCount: config.liveMaxLatencyDurationCount,
        maxLiveSyncPlaybackRate: config.maxLiveSyncPlaybackRate,
      };
    }, login);
  const low = {
    capLevelToPlayerSize: true,
    liveSyncDurationCount: 2,
    liveMaxLatencyDurationCount: 4,
    maxLiveSyncPlaybackRate: 1.05,
  };
  await page.evaluate(() => {
    window.stableVideo = document.querySelector("#grid video");
  });
  await choose(page, "#latency-setting", "low");
  await expect.poll(() => config("example")).toEqual(low);
  // the same video keeps playing: the latency is retuned on the running player
  expect(
    await page.evaluate(
      () => stableVideo === document.querySelector("#grid video"),
    ),
  ).toBe(true);
  await page.locator("#grid .custom-quality summary").click();
  await expect(
    page.locator('#grid .custom-latencies [aria-checked="true"]'),
  ).toHaveText("Low");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("#latency-setting")).toHaveValue("low");
  // the stream brought in front takes the spotlight latency, and gives it back on leaving
  await choose(page, "#latency-setting", "stable");
  await choose(page, "#spotlight-latency-setting", "low");
  await page.evaluate(() =>
    add({
      ...tiles.get("example").channel,
      twitch: "second",
      display: "Second",
    }),
  );
  const first = page.locator('#grid [data-login="example"]');
  const hlsReady = () =>
    expect
      .poll(() =>
        page.evaluate(() =>
          [...tiles.values()].every((t) => t.ready && t.player?.hls),
        ),
      )
      .toBe(true);
  await hlsReady();
  expect((await config("example")).liveSyncDurationCount).not.toBe(2);
  // a small tile unmuted from its bar keeps its video and its sound through the spotlight and back
  await first.locator("video").hover();
  await first.locator(".custom-sound").click();
  await expect(first.locator("video")).toHaveJSProperty("muted", false);
  await page.evaluate(() => {
    window.roundTripVideo = document.querySelector(
      '#grid [data-login="example"] video',
    );
  });
  await first.locator(".custom-spotlight").click();
  await expect(first).toHaveClass(/big/);
  await expect.poll(() => config("example")).toEqual(low);
  expect((await config("second")).liveSyncDurationCount).not.toBe(2);
  await first.locator("video").hover();
  await first.locator(".custom-spotlight").click();
  await expect(first).not.toHaveClass(/big/);
  await expect
    .poll(async () => (await config("example")).liveSyncDurationCount)
    .not.toBe(2);
  expect(
    await page.evaluate(
      () =>
        roundTripVideo ===
        document.querySelector('#grid [data-login="example"] video'),
    ),
  ).toBe(true);
  await page.waitForTimeout(1500);
  await expect(first.locator("video")).toHaveJSProperty("muted", false);
  await choose(page, "#player-setting", "embed");
  await expect(page.locator("#latency-setting")).toBeDisabled();
  await expect(page.locator("#spotlight-latency-setting")).toBeDisabled();
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
      // the custom bar carries the tile's pause: the header no longer shows one
      if (pauseMode === "global") await page.locator("#playall").click();
      else {
        await tile.locator("video").hover();
        await tile.locator(".custom-pp").click();
      }
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
  await page.locator('#grid [data-login="example"] video').hover();
  await page.locator('#grid [data-login="example"] .custom-spotlight').hover();
  await expect(page.locator("#tooltip kbd")).toHaveText(["Shift", "Click"]);
  await page.locator("#soundfollow").hover();
  await expect(page.locator("#tooltip kbd")).toHaveText(["Shift"]);
  await page.locator("#playall").hover();
  await expect(page.locator("#tooltip kbd")).toHaveText(["Space"]);
  await page.locator("#muteall").hover();
  await expect(page.locator("#tooltip kbd")).toHaveText(["Shift", "M"]);
  // the avatar names its stream, and once the rail is collapsed it points at the Shift+click spotlight instead
  await page.route("**/api/search?q=**", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            broadcaster_login: "example",
            display_name: "Example",
            is_live: true,
          },
        ],
      },
    }),
  );
  await page.locator("#q").fill("example");
  await page.locator('#list [data-login="example"] .favorite').click();
  await page.locator("#q").fill("");
  // the row's tooltip names the Shift+click spotlight and sits to the right of the row, expanded or collapsed
  for (const collapsed of [false, true]) {
    if (collapsed) await page.locator("#toggle").click();
    await expect(page.locator("body")).toHaveClass(
      collapsed ? /collapsed/ : /^((?!collapsed).)*$/,
    );
    const row = page.locator('#list [data-login="example"] .channel');
    await page.mouse.move(900, 700); // the previous card is gone before the row gets its own
    await expect(page.locator("#tooltip")).toBeHidden();
    await row.hover();
    await expect(page.locator("#tooltip")).toBeVisible();
    await expect(page.locator("#tooltip span").first()).toHaveText("Spotlight");
    await expect(page.locator("#tooltip kbd")).toHaveText(["Shift", "Click"]);
    const tip = await page.locator("#tooltip").boundingBox(),
      box = await row.boundingBox();
    expect(tip.x).toBeGreaterThanOrEqual(box.x + box.width);
    expect(tip.y + tip.height).toBeGreaterThan(box.y);
    expect(tip.y).toBeLessThan(box.y + box.height);
    // Shift trades the tooltip for the preview card: pressed while the tip shows, or held while entering the row
    await page.keyboard.down("Shift");
    await expect(page.locator("#tooltip")).toBeHidden();
    await page.mouse.move(900, 700);
    await row.hover();
    await page.waitForTimeout(600);
    await expect(page.locator("#tooltip")).toBeHidden();
    await expect(page.locator("[title]:not(iframe)")).toHaveCount(0);
    await page.keyboard.up("Shift");
  }
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
  await expect(first.locator(".custom-quality summary")).toHaveText("Auto");
  await expect
    .poll(() => page.evaluate(() => [...tiles.values()].every((t) => t.ready)))
    .toBe(true);
  await expect
    .poll(() => first.locator("video").evaluate((video) => video.currentTime))
    .toBeGreaterThan(0);
  // the volume goes through the tile header, so the tile owns it before the player is swapped
  await page.evaluate(() => {
    const t = tiles.get("example");
    const input = t.bar.querySelector(".volume input");
    input.value = "0.3";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    t.player.setQuality("90p");
    window.otherLatencyPlayer = tiles.get("second").player;
  });
  await expect(first.locator("video")).toHaveJSProperty("volume", 0.3);
  const latency = (tile) =>
    tile.locator('.custom-latencies [aria-checked="true"]');
  const pick = async (tile, name) => {
    await tile.locator(".custom-quality summary").click();
    await tile
      .locator(".custom-latencies .custom-option", { hasText: name })
      .click();
  };
  await pick(first, "Low");
  await expect(latency(first)).toHaveText("Low");
  await expect(latency(second)).toHaveText("Stable");
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
  await expect(
    page.locator('#grid .custom-latencies [aria-checked="true"]', {
      hasText: "Low",
    }),
  ).toHaveCount(2);
  await pick(first, "Stable");
  await expect(latency(first)).toHaveText("Stable");
  await expect(latency(second)).toHaveText("Low");
  await choose(page, "#latency-setting", "stable");
  await expect(
    page.locator('#grid .custom-latencies [aria-checked="true"]', {
      hasText: "Stable",
    }),
  ).toHaveCount(2);
  expect(
    await page.evaluate(() =>
      [...tiles.values()].every((t) => t.latency === undefined),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("large tiles switch players independently and keep the return button after shrinking", async ({
  page,
}) => {
  await page.setViewportSize({ width: 3400, height: 2000 });
  const errors = await setup(page, "embed");
  await choose(page, "#player-setting", "custom");
  const tile = page.locator('#grid [data-login="example"]');
  const toggle = tile.locator(".player-toggle");
  // the custom bar's menu offers the switch, so the header keeps its shortcut for the embed only
  await expect(toggle).toBeHidden();
  await expect(tile.locator("video")).toHaveCount(1);
  await page.evaluate(() =>
    add({
      ...tiles.get("example").channel,
      twitch: "second",
      display: "Second",
    }),
  );
  await tile.locator("video").hover();
  await tile.locator(".custom-spotlight").click();
  await page.evaluate(() => {
    window.otherPlayer = tiles.get("second").player;
  });
  await page.evaluate(() => {
    const t = tiles.get("example");
    t.volume = 0.25;
    t.player.setVolume(0.25);
    t.player.setQuality("90p");
  });
  await tile.locator("video").hover();
  await tile.locator(".custom-quality summary").click();
  await tile
    .locator(".custom-players .custom-option", { hasText: "Twitch embed" })
    .click();
  await expect(tile.locator("iframe")).toHaveCount(1);
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => page.evaluate(() => tiles.get("example").player.getVolume()))
    .toBe(0.25);
  expect(
    await page.evaluate(() => tiles.get("example").player.getQuality()),
  ).toBe("auto");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("tg.preferences")).player,
    ),
  ).toBe("custom");
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(tile.locator("video")).toHaveCount(1);
  await expect(toggle).toBeHidden();
  expect(await page.evaluate(() => tiles.get("example").volume)).toBe(0.25);
  expect(
    await page.evaluate(
      () => tiles.get("second").player === window.otherPlayer,
    ),
  ).toBe(true);
  await choose(page, "#player-setting", "embed");
  expect(
    await page.evaluate(() =>
      [...tiles.values()].every((t) => t.playerMode === undefined),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("a small tile unmuted from its bar keeps its sound", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  const errors = await setup(page, "custom");
  await page.evaluate(() =>
    add({
      ...tiles.get("example").channel,
      twitch: "second",
      display: "Second",
    }),
  );
  const tile = page.locator('#grid [data-login="example"]');
  await expect(tile).not.toHaveClass(/full-player/);
  await expect
    .poll(() => tile.locator("video").evaluate((video) => video.currentTime))
    .toBeGreaterThan(0);
  await tile.locator("video").hover();
  await tile.locator(".custom-sound").click();
  await expect(tile.locator("video")).toHaveJSProperty("muted", false);
  // the watchdog ticks every second: the tile must have taken the unmute as its own, not undone it
  await page.waitForTimeout(2500);
  await expect(tile.locator("video")).toHaveJSProperty("muted", false);
  expect(await page.evaluate(() => tiles.get("example").muted)).toBe(false);
  expect(errors).toEqual([]);
});

test("player shortcut remains available on small tiles", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 950 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  try {
    await setup(page, "embed");
    const toggle = page.locator("#grid .player-toggle");
    await expect(toggle).toBeVisible();
    await page.setViewportSize({ width: 700, height: 1600 });
    await expect(toggle).toBeVisible();
  } finally {
    await context.close();
  }
});

// The spotlight is fixed while the strip scrolls underneath: its cell stays opaque so no tile crosses the letterbox
// around the video, and its header keeps the status and the actions against the right edge, offline included, where
// the stream info is gone and nothing else stretches.
test("the offline spotlight backs its letterbox and right-aligns its header", async ({
  page,
}) => {
  const errors = await setup(page, "custom");
  await page.setViewportSize({ width: 1280, height: 760 }); // a strip tall enough to leave black beside the spotlight
  await page.evaluate(() => {
    const base = tiles.get("example").channel;
    add({
      ...base,
      twitch: "off",
      display: "Offline",
      online: false,
      viewersAmount: { number: 0, formatted: "" },
    });
    for (let i = 0; i < 7; i++)
      add({ ...base, twitch: "live" + i, display: "Live" + i });
  });
  await page
    .locator('#grid [data-login="off"] .bar .spotlight')
    .evaluate((button) => button.click()); // the custom player hides the header's own spotlight
  await expect(page.locator("#grid .big")).toHaveAttribute("data-login", "off");
  const status = page.locator("#grid .big .viewers");
  await expect(status).not.toBeEmpty();
  const bar = await page.locator("#grid .big .bar").boundingBox(),
    viewers = await status.boundingBox(),
    actions = await page.locator("#grid .big .actions").boundingBox();
  expect(viewers.x + viewers.width + actions.width).toBeGreaterThan(
    bar.x + bar.width - 24,
  );
  const cover = await page.evaluate(() => {
    const style = getComputedStyle(grid, "::after"),
      big = document.querySelector("#grid .big").getBoundingClientRect(),
      box = grid.getBoundingClientRect();
    return {
      left: parseFloat(style.left),
      top: parseFloat(style.top),
      width: parseFloat(style.width),
      height: parseFloat(style.height),
      opaque: style.backgroundColor,
      big,
      box,
      scrolls: grid.scrollHeight > grid.clientHeight,
    };
  });
  expect(cover.scrolls).toBe(true);
  expect(cover.big.left - cover.box.left).toBeGreaterThan(8); // black on both sides, where the tiles used to show through
  expect(cover.left).toBeLessThanOrEqual(cover.big.left);
  expect(cover.left + cover.width).toBeGreaterThanOrEqual(cover.big.right);
  expect(cover.top).toBeLessThanOrEqual(cover.big.top);
  expect(cover.top + cover.height).toBeGreaterThanOrEqual(cover.big.bottom);
  expect(cover.opaque).toBe("rgb(24, 24, 24)");
  expect(errors).toEqual([]);
});
