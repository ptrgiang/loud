# Changelog

## Unreleased

## 0.1.11-beta.11 (2026-11-23)

- The Copy button on a draft's image puts the image on the clipboard — it errored before.
- The posting window no longer shows a logged-out composer when the previous draft was for another platform: each channel gets its own logged-in pane.
- The posting window refuses to open while its channel is disconnected, instead of landing on a logged-out composer.
- Changing the X account no longer carries the old account's Premium flag: the wider post limit applies only when the current account verified it.
- Usage checks on Claude Code and Codex send them the same trimmed environment a chat turn gets, not the whole process environment.
- `LOUD_DEBUG` refuses to write its account dump inside the repository, like `LOUD_PROBE_OUT` already does.
- Premium detection on X reads every captured response of a profile, not only the first.
- Handle rules now follow each platform: X drops dots and hyphens, Meta drops hyphens.
- A draft file that is too big is refused before its base64 inflates in memory.
- A run that stores posts without view counts is no longer counted as an "empty" run.
- The data the dashboard reads is checked against real shapes — a corrupt file is rejected instead of rendered weird.

## 0.1.11-beta.10 (2026-11-23)

- Premium detection on X checks every user object naming the handle, not just the first: a bare author ref without verification fields is "undecided" instead of a wrong "no", and an object carrying the flag wins.
- `LOUD_DEBUG=<dir>` writes `x-account.json` there on each X collect — the field paths and verification values of objects naming the handle — to pin down where the real payload keeps Premium.

## 0.1.11-beta.9 (2026-11-23)

- Loud now notices a Premium (blue check) or Verified Organization account on X and lets its drafts run to 25,000 characters; everyone else keeps 280.
- Each post shows a small view trend on the Posts page, drawn from the per-day numbers beta.8 started keeping.
- The agent keeps its API keys and provider settings: ANTHROPIC_*, OPENAI_*, CODEX_*, AWS_* and friends pass through to the CLI again.
- A pause inside listening (checkpoint, captcha) now raises the same OS notification a platform pause does.
- Listening results whose date can't be parsed now expire after two weeks instead of piling up forever.
- Threads' scheduled-post queue is tried in more languages, and Facebook dates understand Portuguese "sem".
- A post whose text mentions "account suspended" can no longer trigger a checkpoint pause.
- Building the dashboard data no longer rewrites every post's history file when nothing changed.
- README and the data-format doc match what beta.8 actually stores.

## 0.1.11-beta.8 (2026-11-23)

- Collection can't get stuck "running" anymore: a crash inside a run now always ends the run and re-arms the timer.
- Settings no longer flashes "Saved" when a value didn't take — an invalid timezone or start date says so.
- Switching to a different account on a platform re-reads the handle; Loud can no longer collect the old account's page silently.
- Delete all on the demo folder now leaves demo mode, so collection can run without an extra click.
- Facebook reads the whole published list instead of the first page, and drops posts deleted on Facebook and X when a re-scan proves they're gone.
- Threads' scheduled posts are read, so the Plan queue shows them instead of "queue not readable".
- Listening on Facebook keeps results whose date can't be parsed, and reads dates in more languages.
- A checkpoint or captcha that doesn't change the URL is still caught and pauses the platform for 24 hours.
- Handles reject characters that can't appear in a profile name.
- Two listening posts with identical text by different authors no longer merge into one.
- Pauses, checkpoints and ready-to-install updates now show an OS notification — you don't have to open the window to find out.
- Each post keeps its numbers over time, so views and engagement draw a trend instead of only the latest count.
- The dashboard opens in your system's language when English or Vietnamese matches; the theme gains a "system" option.
- The dashboard reloads faster on focus: daily history is read once and cached, not re-parsed every time.
- A crashed dashboard reloads itself instead of leaving a dead white window.
- Draft images load through the app's media route like videos do, and videos can seek.
- Connections no longer re-detects Facebook Pages every run when the Page was picked by hand.
- README and docs now say which platforms were checked against real accounts and which were not.

## 0.1.11-beta.7 (2026-11-23)

- Drafts: unsaved edits are saved before you switch drafts or start a new one — nothing typed is silently dropped. Deleting asks twice, the action bar stays pinned at the bottom, note and first comment fold into one section, images and videos accept drag-and-drop, and rows show relative times.
- Drafts can carry videos (up to 4, MP4/MOV/WebM) with previews in the editor and the posting window.
- Posting window: drag the right edge to widen or narrow the kit pane — Loud remembers the width. A deleted draft now offers a close button.
- Chat: rename a chat from its row or by double-clicking its title, timestamps appear on hover, and every answer has a copy button. Markdown headings render as real headings.
- Settings and Connections: every save-on-blur field flashes "Saved", and dropdowns match the rest of the UI.
- Identity: violet primary in place of plain blue, emptier states carry their section's colour, primary cards sit above flatter supporting surfaces.
- Sidebar: Ctrl+B (or Cmd+B) collapses it, a demo marker stays visible in the rail, keyboard users get a skip-to-content link, and listening keyword rows answer Enter.
- Each view loads its own bundle, so the app opens faster.

## 0.1.11-beta.6 (2026-11-23)

- Chat images open in a lightbox — click to view, arrow keys or on-screen buttons move through every image in the conversation, Esc or a backdrop click closes.
- The chat in progress shows a spinning marker on its row in the chat list and on the live reply's tool row; opening or starting another chat no longer waits for the run to finish.
- Sidebar: Agent above Drafts in the Write group.
- Drafts editor drops the Copy and open-in-browser buttons next to Post — Post is the single way out to the platform composer.

## 0.1.11-beta.5 (2026-11-23)

- Fix the posting window never appearing: it waited on `ready-to-show`, which never fires because the window's own page is never loaded — only its two views are. It shows directly now.
- The sidebar collapses to an icon rail (persisted): divider between nav groups, collecting status compresses to a spinning glyph, restart-to-update gets a compact icon variant, and a toggle button lives in the header.
- Chat polish: fenced blocks wrap instead of scrolling sideways and get a hover copy button; starter prompts are localized (EN + VI); the stream only auto-scrolls while you're near the bottom — scrolling up pins the view.

## 0.1.11-beta.4 (2026-11-23)

- Drafts get a Post button that opens a dedicated split window: the draft kit (caption, first comment, images, copy and show-in-folder buttons) on the left, the platform's own composer logged in on the right — no more switching between Loud and a browser.
- Drafts can carry a first comment to post right after publishing (link, hashtags), saved end to end and shown in the posting window.
- The agent no longer saves a draft or images after every chat turn — only when you ask. Images are shown first in the chat for approval before any lands in a draft.
- The window remembers its size, position and maximized state across updates and tray reopenings.

## 0.1.11-beta.3 (2026-11-23)

- A visual pass on the whole dashboard: page titles carry weight, rising bars use quiet channel tints instead of stacked saturated fills, the second proposal action shrinks to an icon, the active nav row shows a left accent, the sidebar footer stops truncating next to the version, and first-run pages show a numbered next-step checklist.

## 0.1.11-beta.2 (2026-11-23)

- The draft editor shows a "What works" strip for the chosen channel: the text features your own settled posts prove (1.5x median lift or more), checked live against the draft as you type, plus the posting block that outperforms. Nothing is hardcoded — it is measured on your numbers.
- Insights' feature table and content callouts now translate; the comments-prompt check also catches "cmt" and Vietnamese calls.

## 0.1.11-beta.1 (2026-11-23)

- A new install can try the fictional Acme Forms demo in one click — from any empty page, the command palette or Settings — without logging in. While the demo is loaded, a badge sits next to the logo and collection stays off; removing it takes the same click in Settings.
- Settings gains an About card: version, MIT license, and links to the website, privacy policy and source.
- The sidebar footer shows the running version.

## 0.1.11-beta.0 (2026-11-23)

- Switching the update channel or check settings checks for an update right away instead of waiting for the next scheduled look.
- Settings → Updates shows a beta badge while the beta channel is on.

## 0.1.10 (2026-11-23)

- The dashboard speaks English and Vietnamese, chosen in Settings → Language.

## 0.1.10-beta.0 (2026-11-23)

- Settings → Data can export the whole data folder, export a diagnostics file for a bug report (handles, keywords and the playbook are redacted), and delete all collected data. Drafts and settings stay.
- Loud writes a small rotating log in the profile folder: collection results, failed calls and update events. The diagnostics export includes the recent lines.
- Connections warns when a platform read no posts several runs in a row: the account may be quiet, or the platform changed and Loud needs an update.
- Updates can follow the beta channel, for trying a fix before a full release. Loud can also start at login so the collection timer is running before the window is opened.
- A Windows note in Settings says plainly that Claude Code runs its commands unsandboxed there; Codex is the sandboxed choice.
- CI now checks formatting and lint and runs on Windows and macOS, not only Linux.
- The dashboard no longer goes white on a render error, shows a loading skeleton first, and honours reduced motion.

## 0.1.9 (2026-11-21)

- The agent makes images for drafts its own way: an image tool if it has one, or code it runs (an SVG, an HTML page, a script drawn to PNG). It then attaches the files to the draft. The Drafts page only holds and shows them; its "Make an image" button is gone.
- Each chat has its own workspace folder, where the agent runs commands and writes files. It may read files elsewhere that you point it to, as references. Codex runs commands in its sandbox: writes only in the workspace, no network. Claude Code has no sandbox on Windows, so its commands run as you; Settings says so. Deleting a chat deletes its workspace.
- A draft takes any PNG, JPEG, WebP or GIF file the agent names, checked by its contents.
- Chats from before this version start a new CLI session on their next message, carrying the conversation so far.

## 0.1.8 (2026-11-21)

- Drafts carry images. With Codex, the agent can make an image for a post and attach it to the draft ("Make an image" in Drafts, or ask in the chat); Claude Code describes the image instead. You can add your own, copy one to paste into the platform's composer, or show it in its folder. Images stay in the data folder next to the draft.
- X: followers are read again. The first answer X sends for a profile carries no counts; Loud now takes them from the one that does. Checked against a real account.
- Listening: "All keywords" showed nothing; it now shows every result. The scrollbar no longer covers the last column of the tables.
- Insights and Today say when the numbers were last built and when the next collection runs.

## 0.1.7 (2026-11-21)

- Threads missed its newest posts: they are only in the profile page's first, embedded batch, which Threads removes from the page once it has rendered, and Loud kept only what the page held after the last scroll. Every read is now kept. Checked against a real account: the newest posts are read again.
- Old pinned posts at the top no longer stop the scroll early: only the end of the list counts.
- Each platform's result line says the newest post it stored, so a missing one shows at a glance.
- Settings: "Later runs read again" sets how many recent days each run reads again (7 by default), under Count from, which the first read goes back to. Read everything again does a full read once.
- Sidebar, as in T3 Code: a button checks for updates and shows the download, then a Restart to update pill once it is ready. Search (Ctrl K) jumps to any page or runs an action: collect, search listening, read everything again, ask for proposals, new chat, theme.
- Errors and "collection finished" show as notes in the corner instead of a bar over the page.

## 0.1.5 (2026-11-21)

- Threads and Facebook: a first read now keeps every post since the start date. It used to keep only the newest 40; the rest are stored with the list's numbers and get their own page read over the next runs.
- Instagram: only the account's own posts and collabs are kept. The profile page also loads suggested reels from other accounts, and those were being stored as yours. Ones stored before are dropped on the next run.
- Threads, Instagram and Facebook do one full read again after this update, to fill in and clean up what earlier versions stored.
- Fewer places, one job each. Today (was Overview) puts a To do list first: the build's checks and the agent's next ideas. Plan joins Proposals and Schedule. Audit moved into Insights. Collecting is only in Connections, the search for listening only in Listening, and the model only in the chat.
- Every idea has Draft it (a draft with the opening line, opened in Drafts) and Write with agent (a new chat that writes and saves the draft).

## 0.1.4 (2026-11-21)

- Agent chats are saved: a history list beside the conversation, New chat keeps the old one, and each chat can be reopened or deleted. The single conversation of earlier versions becomes the first saved chat.
- The composer picks the CLI, model and reasoning effort, with the model lists read from Claude Code and Codex themselves. A chat keeps the CLI it started on; the choice is the default for new chats.
- Attach images and text files (button, paste or drop): images go to the model as images, text files are pasted into the message. They are kept with the chat in the profile.
- Plan usage in the composer, like T3 Code: the 5-hour and weekly limits of the signed-in Claude Code and Codex accounts, with reset times. Checking sends no message.

## 0.1.3 (2026-11-21)

- Updates install silently and reopen Loud; the Windows setup wizard is shown only on the first install. The update into 0.1.3 still shows it once, because the version doing the install decides.

## 0.1.2 (2026-11-21)

- Listening has its own Search now: a Listening row in Connections and a button on the Listening page search the keywords without collecting the accounts. It names why it is unavailable (no keywords, no connected platform included in runs, paused, or the demo).

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
