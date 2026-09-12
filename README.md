# Twitch grid

Watch several Twitch streams on one screen, arrange their tiles, put one in spotlight, and choose the sound for each stream.

Site: https://twitch.moinax.com

## Development

Use Node.js 24 or newer and pnpm.

```sh
pnpm install
pnpm dev
```

Open http://localhost:8765. Vite serves the React app and the local search endpoint. Twitch embeds require an HTTP hostname; opening the HTML as a local file does not work.

```sh
pnpm check          # Strict TypeScript and server syntax checks
pnpm build          # Validates and builds the app into dist
pnpm preview        # Serves the production build and local search endpoint
pnpm test:server    # API behavior and translation coverage
pnpm test           # Browser behavior tests
pnpm format         # Formats frontend source and Vite configuration
```

Install Chromium once with `pnpm exec playwright install chromium`. Browser tests run headlessly in separate profiles. They simulate Twitch's API and player SDK; real playback and account authorization still require Twitch.

## Code structure

The frontend uses React, strict TypeScript, and Tailwind CSS, built with Vite.

- `src/components` contains the landing page, sidebar, tile controls, previews, grid lists, collaboration participants, notifications, and dialogs. Views receive typed commands and channel data.
- `src/controllers/workspace.tsx` coordinates the grid, account, playback, persistence, and browser events. Preview playback, video sizing, resource cleanup, tooltips, and deployment checks have separate controllers.
- `src/services` contains Twitch API access, named-grid storage, preferences, and translations.
- `src/types` defines channels, saved layouts, commands, and the Twitch player interface.
- `src/styles` groups Tailwind styles by application area. The original reset, colors, dimensions, animations, and responsive rules are retained. Tailwind Preflight is intentionally omitted because it changes native buttons, dialogs, and typography.
- `public` contains the public Twitch client configuration, favicon, and share image.
- `api/search.js` remains the server-only search function, shared by local development and Vercel.

One React root owns the interface. A small external view store uses React portals to render into stable tile and list containers. Twitch owns its iframe mount nodes. Reordering changes CSS order without moving those nodes, and expanding a tile leaves its player in place. The workspace disposes timers, observers, subscriptions, and players when its mount is released.

The browser tests can inspect player state through an adapter enabled only by `VITE_TEST_API=true`. Production builds omit that adapter. Existing local-storage keys and saved-layout formats remain compatible.

## Channels and accounts

Without an account, search by Twitch username or URL in the sidebar. Results show an avatar, category, and live status. The star saves a favorite in this browser. If search is unavailable, direct addition by username remains available.

Connecting Twitch replaces favorites with the visitor's follows. All follows pages are loaded, live channels appear first, and search remains available. Disconnecting restores the local favorites. Favorites and follows stay separate.

Guest and connected modes each retain their own grid collection and active grid. Switching account mode saves the current layout and restores the other mode's layout. Tiles retain their order, pause, volume, mute, spotlight audio intent, and chat settings.

The Twitch session stays in the browser's local storage until the visitor signs out. OAuth state is checked before accepting a token. Sessions are validated at startup and hourly; expired sessions return to guest mode with a reconnect message. Each visitor reads their own follows, which are never published to other visitors.

## Landing and empty workspace

Visitors with no session, favorites, or open tiles see the full-window introduction. Its primary action connects Twitch. Continuing without an account opens the sidebar and focuses search; that choice lasts for the current tab only. The language selector shares the app's preference.

An empty grid shows the three-step introduction to searching, adding a stream, and using spotlight. Search opens the sidebar and focuses its input. Visitors can reopen the landing page from this panel even when they already have favorites.

## Grids and preferences

The sidebar footer offers French, English, and Dutch, plus system, light, and dark themes. Preferences apply immediately and persist across account modes. Changing them does not recreate video players. Twitch controls and chat keep Twitch's own localization.

The grid selector opens saved layouts. Save as creates a named copy without interrupting playback; a blank grid starts empty. Grids can be opened, renamed, or deleted with confirmation. Removing the last grid creates an empty default grid. Existing installations migrate their earlier single layout into the default grid automatically.

The connected mode also has a locked Live follows grid. New live follows join automatically and start playing unless the viewer has saved an explicit pause choice. A channel that ends leaves after a minute. Order, sound, volume, and pause settings survive reloads.

Locking a grid prevents additions and keeps offline tiles in place. A clear button empties the current grid; it stays disabled while the grid is locked, on Live follows, and on an empty grid. The collapsed sidebar retains grid, clear and lock controls, playback and sound controls, the avatar rail, and account links. A highlighted avatar identifies a channel already in the grid; offline avatars are dimmed.

## Custom player

The sidebar includes Video player and Latency settings. The custom player is the default and renders both tiles and sidebar previews as HTML5 video with HLS.js; Twitch embed stays selectable. Stable latency preserves the current safety margin, while Low latency stays closer to the live edge and gently speeds up to catch up. Twitch's embed does not expose this choice, so the latency setting is disabled for it. These choices persist in this browser. Switching either one recreates active players while retaining tile order, volume, mute, pause, spotlight, and chat preferences.

The custom player uses the existing tile controls and, on larger tiles, draws its own bar in the site's theme instead of the browser's video controls: play and pause, sound with its volume slider, the quality list read from the HLS levels, and fullscreen, which takes the whole tile so its header stays reachable. The bar drives the video element, and the tile header reads the change back. Controls can change on resize without replacing the video. Pausing a custom player keeps its last frame and video element, including global pause. The usual dimmed overlay displays a centered Play button to resume the tile. Hovering a paused tile does not resume it. Tiles restored in a paused state keep a poster until first playback. HLS.js selects quality automatically until a level is chosen, caps automatic selection to the rendered video size, and reapplies a manually selected level once the levels are known. Failed playback offers a retry and a switch to the Twitch embed; the setting also allows it at any time.

With no iframe to cover, styled tooltips come back on every action, the player's own controls included. Under the Twitch embed they stay suppressed: that player pauses as soon as anything covers it.

`GET /api/stream?channel=…` obtains an anonymous playback token from Twitch GraphQL and retrieves the HLS master playlist from Usher. Twitch's playlist hosts answer 403 to any Origin outside their own list, which a deployed page cannot satisfy, so the master playlist comes back with its variant URLs rewritten to `GET /api/stream?playlist=…`. That form only accepts an HTTPS URL on `*.playlist.ttvnw.net` and sends no Origin upstream. Media segments carry an open CORS policy and keep loading straight from Twitch's CDN. No login token or application secret is sent to this endpoint. Responses are not cached, upstream calls have timeouts, and each client address is limited per minute and per server instance to 120 token requests and 600 playlist requests. No additional environment variables are required.

This uses an undocumented playback mechanism, also used by [Streamlink](https://github.com/streamlink/streamlink/blob/master/src/streamlink/plugins/twitch.py). [Helix Get Streams](https://dev.twitch.tv/docs/api/reference/#get-streams) only provides stream metadata. Twitch can refuse playback or change its query, require client integrity, or change CDN CORS behavior. Anonymous playback does not inherit subscriptions or other account entitlements. Ads remain part of the supplied stream. Browser autoplay rules and codec support still apply; chat remains an iframe. The custom player does not remove all Twitch or browser constraints.

Validated with real Twitch playback in headless Chromium on this development machine. Deployment from a different IP and Safari native HLS still need verification. Browser tests use a small generated HLS media fixture to check playback and switching without depending on live channels.

## Playback, spotlight, and dragging

One tile uses the complete Twitch player and fills the grid. With multiple tiles, the spotlight button enlarges one stream and enables its sound. Leaving spotlight restores its previous audio intent. Each tile has playback and sound controls; its horizontal volume slider appears while hovering the sound control or slider. Global pause and mute remain separate from each tile's saved choices.

Other tiles gain the full player controls, Twitch's own or the custom player's bar, when their rendered video reaches 640 pixels wide. They retain them down to 560 pixels. Size-driven changes wait 300 milliseconds after resizing stops. Twitch accepts the controls option only at construction, so only players whose control mode changes are recreated, preserving their settings and quality.

Paused tiles release their embed and show a stream image. Hovering a small paused tile can start a muted preview, which is released on leaving. Single, spotlight, and expanded tiles stay paused until explicitly resumed. The header button pauses or resumes a player; clicking the player surface or the centered Play button only resumes it. A double click fullscreens the tile and turns its sound on. Leaving fullscreen restores the tile's previous sound state, while spotlight is controlled by its header button.

Video frames and placeholders remain centered at 16:9 without CSS scaling. Loading and offline placeholders sit below the embed. Offline channels show their configured banner and avatar without mounting a player; playback buttons do not start them. A stalled player exposes its status in the header and still accepts clicks in the native player.

Dragging a header reorders tiles without moving iframe nodes. Only the destination has a drop overlay. A compact still follows the pointer, avoiding spotlight when space allows; Escape cancels. Dropping onto spotlight exchanges the tiles' roles. Small tiles can still fall below Twitch's documented minimum embed dimensions.

The expand button fills the browser window without browser fullscreen, player recreation, or audio changes. Press it again or use Escape to restore the previous arrangement.

When a restored grid requests sound, an activation screen waits for a click or keypress before playback starts. It restores the saved sound, volume, and pause choices and appears only once per visit. Sound icons reflect the actual player's mute state, including a refused unmute. A browser-blocked pause is not saved as a deliberate user pause.

## Chat

Chat is available on a single tile, spotlight, and tiles wide enough to fit it. A tile qualifies at 640 pixels wide or with 420 pixels below its video, with lower thresholds to avoid flickering during resizing.

Choose Auto, Top, Bottom, Left, or Right. Selecting a position opens chat immediately. Auto uses space below the video when at least 420 pixels remain; otherwise it chooses the placement with the larger video. Side chat can expand from 320 to 480 pixels into unused vertical letterboxing.

Chat settings persist per tile and account mode. Repositioning an open chat keeps its iframe and video player mounted. The menu can also open chat on Twitch, which handles authorization to write messages.

## Status, previews, and collaborations

Visible pages refresh live status every 30 seconds and follows about every minute. Loading follows and searches show skeleton rows. Unknown favorite status pulses until resolved.

Hovering a live channel opens a still preview after a short delay, then a muted video preview. The card follows movement between rows and fades on leaving. Playback failures and slow previews show status outside the iframe.

A favorite or follow transitioning from offline to live triggers an in-page notification. Clicking it adds the stream with the grid's pause state, muted and without spotlight. Initial live channels do not trigger notifications. Notifications disappear when dismissed, when the channel goes offline or leaves the list, or when the account disconnects.

A playing channel that ends is removed after one minute unless it is spotlighted or the grid is locked. Returning live during that minute cancels removal. Channels initially added offline stay in place and wait for their stream.

Collaboration indicators use Twitch shared-chat sessions in both account modes. The menu lists participants and can add one or all live participants absent from the grid. Existing players and audio choices remain intact. A separate action creates a named, locked grid with all live participants at equal size and only the source channel audible. Collaborations without shared chat cannot be detected. Results are cached for one minute; failed lookups hide indicators until a later successful refresh.

## Twitch configuration

Create an application in the [Twitch developer console](https://dev.twitch.tv/console/apps). The visitor login application is Public and needs no client secret. Set its client ID in `public/config.json`, under `twitchClientId`. An empty ID disables login while keeping local favorites available.

Register the exact OAuth return addresses, including `http://localhost:8765` for local development and the production origin. The current production origin is `https://twitch.moinax.com`, without a trailing slash. Login uses Twitch's implicit OAuth flow with only `user:read:follows`.

Guest search uses a separate Confidential Twitch application. Set these server environment variables in `.env.local` for local development and in Vercel for deployment:

```dotenv
TWITCH_SEARCH_CLIENT_ID=your-confidential-client-id
TWITCH_SEARCH_CLIENT_SECRET=your-confidential-client-secret
```

The secret and app token stay on the server. The public login client ID remains separate. Restart local development after changing environment variables, and redeploy after changing Vercel configuration.

`GET /api/search?q=…` accepts 2 to 100 characters. It checks exact usernames with Get Users so channels omitted by Search Channels remain discoverable, then verifies live status with Get Streams. Repeated `login` parameters refresh up to 100 channels in one request. A `collaboration` parameter retrieves shared-chat participants.

The server caches successful results for one minute, shares concurrent requests, reuses its app token until expiration, and applies request limits. Errors are not cached and never expose credentials. The guest status cache can delay a live notification by one minute.

## Deployment and share image

Vercel builds with `pnpm build` and serves `dist`, as configured in `vercel.json`. The Node search function remains at `/api/search`. Configure the domain and server environment variables in Vercel.

Open Graph and Twitter metadata remain in the HTML entry point. They reference the committed 1200 × 630 image at `public/assets/share-card.png`. Regenerate it after changing the landing hero:

```sh
pnpm og:generate
```

The command starts a local server, captures the English landing hero in headless Chromium, and writes the image into `public/assets`.

## Origin and license

Adapted from [ZEvent grid](https://github.com/Moinax/zevent-grid), retaining its Git history. Event data and counters have been removed.

[MIT](LICENSE)
