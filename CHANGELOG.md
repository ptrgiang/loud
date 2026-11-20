# Changelog

## Unreleased

## 0.1.1 (2026-11-21)

- Usage reports, off until you answer: on first launch Loud asks whether to send one small report a day to loud.trysometh.ing (version, OS, connected platforms, and how many collection runs worked, failed or hit a login check). Settings shows the exact report and can turn it off, which asks the server to delete what that install sent. Nothing is sent from source or with the demo data.
- loud.trysometh.ing: `/api/usage` and `/api/stats` on Cloudflare D1, an "In the open" section with the totals, and a privacy page listing every field.

## 0.1.0 (2026-11-20)

- Desktop app (Electron) with the dashboard served from `loud://app`.
- Connections: one persistent browser profile per platform, login detection from the session cookie, handle detection for Threads, Instagram and X, a Page picker for Facebook, disconnect clears the profile.
- Overview reads `hub.json` from the data folder and reloads when it changes.
- Insights, Posts, Audit, Proposals, Schedule and Listening, ported from the earlier dashboard: settled posts only, medians, engagement per 1k views, feature lift with at least 3 posts a side, 3-hour timing blocks and posting cadence. Listening keywords can be edited in the app.
- Ported from the earlier Python version: the data format and platform notes.
- Build in TypeScript: `hub.json` from the collected files, with the analytics shared between the desktop and the dashboard (`packages/shared`).
- Fictional demo data (Acme Forms): `LOUD_DEMO=1` or `pnpm --filter @loud/desktop demo <folder>`.
- Collectors for Threads, Instagram, Facebook Pages and X, plus listening, reading what the logged-in pages load in hidden windows. Rate limiter with jitter, daily caps, a 6-hour pause after a 429 and a 24-hour stop at any checkpoint or captcha, kept across restarts. Not yet run against the real platforms.
- Collect now, a timer (every 3 to 168 hours, off by default), and a tray icon that can keep Loud running with the window closed.
- Connections is where collection is run: Collect now per platform, Collect all, today's request count, the last result, and a pause notice with its end time and Resume (which also re-reads a missing handle). The sidebar shows which platform is being collected.
- Agent, off by default: Claude Code (through the Agent SDK) or Codex, signed in on the user's computer, with only Loud's tools over MCP. It reads the built data, proposes posts and writes drafts; it cannot post. The conversation survives a restart.
- Drafts: write per channel with a character count that matches each platform, copy, open the platform's composer, or ask the agent to tighten or adapt.
- Settings: time zone, start date, collection, agent, CSV export of posts, update checks.
- Installers with electron-builder and updates through GitHub Releases; update checks are off until the user turns them on.
