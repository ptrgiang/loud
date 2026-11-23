@CONTRIBUTING.md

# Working in this repository

These conventions apply to people and coding agents alike.

## Shape of the code

- pnpm workspace. `apps/desktop` is the Electron main process, `apps/web` is the dashboard (React), `packages/contracts` holds the Effect Schema types for everything that crosses between them.
- Desktop code is Effect services: `class X extends Context.Service<X, Shape>()("@loud/desktop/<path>/X")`, built by a `layer` in the same file and composed in `src/main.ts`. Electron APIs are called inside services, not from `main.ts`.
- The dashboard reaches the desktop only through `window.loud.invoke(method, input)`. A new call means a new entry in `IpcMethods` (contracts) and a handler in `apps/desktop/src/ipc/IpcHandlers.ts`; the input is decoded against its schema before the handler runs.
- Each platform has its own persistent session (`persist:loud-<platform>`). Requests to a platform go through that session only, never through Node's `fetch` or a shared session.
- The dashboard is served from `loud://app` with a CSP that blocks remote scripts, frames and connections. Do not loosen it; do not load anything from a CDN.
- UI follows T3 Code's look: zinc tokens in `apps/web/src/index.css`, Base UI primitives with `cva` variants in `components/ui`, `cn()` from `~/lib/utils`, lucide icons. Use the tokens (`bg-card`, `text-muted-foreground`, `border`), not raw colours. Channel colours are `--ch-<id>`.
- Imports carry `.ts` extensions in desktop and contracts code, and Effect modules are imported as namespaces (`import * as Effect from "effect/Effect"`).

## Comments

Write for a colleague who already knows the codebase: the non-obvious why, ordering constraints, and traps. Don't restate the code or narrate how a bug was found. If a comment runs past about three lines, cut it.

## Before you call something done

- `pnpm typecheck`, `pnpm test` and `pnpm build`.
- For anything a user can see, run the app and look at it: `LOUD_HOME=<scratch dir> LOUD_SHOT=.shots/x.png pnpm --filter @loud/desktop start` saves a screenshot. Use demo data (`LOUD_DATA`), never a real account.
- Never claim something works against a platform unless it ran against that platform. A posting or collection change ships only after a real-account run that worked, with the evidence (screenshots, the post's URL) kept in the ignored `.shots/` — fix and verify first, tag and release second.

## Before you commit

- Review what is staged (`git status`, `git diff --cached --stat`), not just what you meant to change.
- Screenshots, logs, exports and scratch scripts stay outside the repo, or in the ignored `.shots/`. Images and other binaries are committed only under `docs/assets/` or `apps/*/public/`.
- `pnpm check:repo` must pass. It blocks unexpected top-level paths, misplaced binaries, files over 256 KB, collected data, credential-shaped strings and personal email addresses. CI runs it too.
- Enable the hook once per clone: `git config core.hooksPath .githooks`. Put private terms (names, handles, hosts) in `.git/info/forbidden-words`, one per line; it is never committed.
- A new top-level file or folder means updating the allowlist in `scripts/check-repo.mjs` on purpose, in the same change.

## Never

- Commit collected data, `settings.json`, browser profiles, cookies, HAR files or screenshots of a real account.
- Send a user's data anywhere but the platform it came from, unless the user turned that feature on and the UI says where it goes.
- Ask for or store a platform password. Login happens on the platform's own page.
- Add collection that ignores the rate limits, or retries through a checkpoint or captcha.
- Fabricate numbers: demo data is clearly fictional (Acme Forms) and labelled as demo.
- Submit a post or schedule without the confirm click in the posting pane — the
  draft is always read back from disk and the composer text verified before any click.
  A scheduled post is the one timed exception: the schedule confirm already says
  Loud opens the window and clicks Post at that time, and that is the consent.
- Retry a publish through a checkpoint or captcha — abort and leave the window for the user.
- Send a post anywhere the session isn't logged into already, or fabricate a post
  in the data: the collector reads what the platform reports on the next run.
