# Architecture

Loud is four packages in one pnpm workspace.

```
apps/web  ──window.loud.invoke──▶  preload  ──ipc "loud:invoke"──▶  apps/desktop
   ▲                                                                     │
   └──ipc "loud:event" (platforms | data | settings | drafts | agent | collect | updates)──┘
              both sides speak packages/contracts; both compute with packages/shared
```

## Desktop (`apps/desktop`)

The Electron main process, written as Effect services. Each service is a `Context.Service` with a `layer` beside it; `src/main.ts` composes the layers and runs the program once Electron is ready.

| Service         | Job                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `AppPaths`      | Where things live: the profile (`userData`, or `LOUD_HOME`), the data folder (`LOUD_DATA`), the built dashboard.                          |
| `SettingsStore` | `settings.json`: time zone, start date, platforms, keywords, collection, agent and update settings. Decoded against the contract; atomic. |
| `Platforms`     | One persistent session per platform. Login windows, auth-cookie watch, account id, handle detection, profile cleared on disconnect.       |
| `DataStore`     | Reads `hub.json`, `proposals.json`, `history/`; tells the dashboard when they or `drafts.json` change.                                    |
| `Builder`       | Turns the collected files into `hub.json` (the analytics in `packages/shared`).                                                           |
| `Collector`     | Runs the collectors one platform at a time behind the rate limiter, writes `<channel>.json`, `listen.json`, `state.json`, then builds.    |
| `Agent`         | One conversation through Claude Code or Codex, with Loud's tools served over MCP. Off by default.                                         |
| `Updater`       | electron-updater against GitHub Releases. Checks only when the user turned it on or pressed Check now; installs only when asked.          |
| `EventBus`      | Pushes events to the dashboard window.                                                                                                    |

`AppProtocol` serves `apps/web/dist` at `loud://app` with a strict CSP. `IpcHandlers` is the only entry from the dashboard: it checks that the caller is the main window's own frame, decodes the input against the method's schema, and runs the handler.

### Platform sessions

Each platform gets a partition, `persist:loud-<platform>`, so its cookies and storage stay apart from the dashboard and from the other platforms. A session is prepared once: the user agent loses its Electron and app tokens, and every permission request is denied. Login is detected from the platform's auth cookie (`sessionid` for Threads and Instagram, `c_user` for Facebook, `auth_token` for X); Loud never handles a password.

Sign-in popups from the same platform open in the same partition; links to anywhere else go to the system browser.

After a login, and at start for any connected account still missing it, the collector reads who is logged in from the platform's own home page in a hidden window (`collect/detect.ts`): the username next to the cookie's account id on Threads and Instagram, the profile link on X. On Facebook it lists every Page the account manages (Business Suite's Pages, plus the managed-Pages list for Pages outside that portfolio), picks the Page when there is only one, and otherwise lets the user choose in Connections. It never overwrites what the user typed, and a failed look-up waits 30 minutes before the next try.

The tray (`AppTray`) offers Open, Collect now and Quit. With "keep running in the tray" on, closing the window leaves the app and its collection timer running.

### Collection

A collector opens the platform's own pages in a hidden window on that platform's session and listens through the Chrome DevTools protocol (`webContents.debugger`) for the answers those pages fetch for themselves. Loud does not forge or sign requests; the one it makes itself (Instagram media info, as the web app asks for it) goes through `session.fetch` with the same cookies. Parsers in `collect/parse.ts` find numbers by the shape of the objects around them rather than by fixed paths, and leave a number out when it is not there.

Every page load and request first takes a token from `Limiter` (`collect/limiter.ts`): a small burst, then one request per few seconds with random jitter, and a daily cap per platform. A 429 pauses that platform for 6 hours. A redirect to a login, checkpoint or captcha page pauses it for 24 hours and stops the run; the pause holds across restarts (`limits.json` in the profile) until it ends or the user clears it in Settings after dealing with the platform. A run re-reads the last 7 days of posts; old posts keep their last numbers.

Collection refuses to run on a data folder that holds the demo.

### Agent

The agent runs through a CLI the user already has and is signed in to, so Loud holds no model key:

- **Claude Code** through `@anthropic-ai/claude-agent-sdk`, handed the user's own `claude` executable. Built-in tools are off (`tools: []`); only `mcp__loud__*` is allowed; the user's MCP servers, settings and IDE connection are not loaded.
- **Codex** through `codex exec --json`, with the user's config and rules ignored, shell, browser, apps, plugins and web search disabled, a read-only sandbox, and only the `loud` MCP server.

Both reach the same tools (`agent/tools.ts`) through a stdio MCP server (`agent/mcp.ts`, bundled as `dist-electron/mcp.cjs`), started with Loud's own executable in Node mode (`ELECTRON_RUN_AS_NODE`). The server sees the data folder and a context file with the enabled channels, keywords and playbook; nothing else. Tools read the built data and listening results (marked as untrusted text) and write only `proposals.json` and `drafts.json`. The conversation is kept in `agent-chat.json` in the profile until the user starts a new chat.

## Shared (`packages/shared`)

The analytics (settled posts, medians, engagement per 1k views, feature lift, timing blocks, cadence), time stamps, and post length per channel (X counts a link as 23 and wide characters as 2). Used by the desktop build, the agent's tools and the dashboard, so all three agree.

## Dashboard (`apps/web`)

React with Tailwind v4 and Base UI, styled after T3 Code. Data views read from one zustand store (`src/store.ts`); the agent, drafts, collection and updates live in a second (`src/workStore.ts`) because they change on their own, more often. Both call the desktop through `src/lib/loud.ts` and follow desktop events. Views are chosen from the URL hash. Agent answers are rendered from parsed Markdown (`lib/markdown.ts`), never as HTML.

## Contracts (`packages/contracts`)

Effect Schema definitions for settings, platform views and every IPC method's input and output. `bridge.ts` holds the channel names and the `LoudBridge` type with no runtime imports, so the preload bundle stays tiny.

The built data (`hub.json` and friends) is described with plain TypeScript types in `hub.ts`; see [data-format.md](data-format.md).

## Packaging

`apps/desktop/electron-builder.yml`. Everything the app runs is bundled into `dist-electron` by esbuild, so no `node_modules` ship; the dashboard goes to `resources/web`, and `mcp.cjs` is unpacked from the asar so a Node-mode process can read it. Fuses: Run-as-Node stays on (the agent's MCP server needs it); Node options, inspector flags and loading code outside the asar are off; cookie encryption and asar integrity are on. Releases: [releasing.md](releasing.md).

## Next

- **Storage**: SQLite for posts and history once the JSON files outgrow themselves.
- **Scheduled posting** through the platforms' official APIs.
