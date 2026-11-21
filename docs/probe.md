# Probe (development only)

`apps/desktop/scripts/probe.mjs` runs Loud's own collectors, or records what a page loads, with a login borrowed from
a browser profile instead of the app's. It is how a collector is checked against a real account without opening that
account in a copy of Loud run from source, and how a platform's internal answers are found for a new number.

The login comes as JSON on stdin: the output of `huashu-chrome run --format json` (cookies of one site from a Chrome
profile), or a bare array of cookies. It goes into an in-memory Electron session that is cleared on exit.

```sh
cd apps/desktop
# Run the Threads collector for the last 7 days, as a later run would.
LOUD_PROBE_OUT=<dir outside the repo> LOUD_PROBE_PLATFORM=threads LOUD_PROBE_HANDLE=<handle> \
LOUD_PROBE_SINCE=2026-09-21 LOUD_PROBE_SCAN_FROM=2026-11-14 \
  huashu-chrome run --grant threads --profile Work -- node "$PWD/scripts/probe.mjs"

# Record every JSON answer a page fetches while loading and scrolling, plus its embedded blocks.
LOUD_PROBE_OUT=<dir> LOUD_PROBE_PLATFORM=threads LOUD_PROBE_MODE=page LOUD_PROBE_URL=https://www.threads.com/@<handle> \
LOUD_PROBE_KEYS=thread_items LOUD_PROBE_SCROLLS=2 \
  huashu-chrome run --grant threads --profile Work -- node "$PWD/scripts/probe.mjs"
```

The console shows counts per day and the newest post, never post text. The files in `LOUD_PROBE_OUT` hold real posts:
the probe refuses a folder inside the repository, and they are never committed. Requests go through the same limiter
spacing as the app, but the daily count starts from zero, so keep probe runs small.

Known limit: Instagram treats a session copied from Chrome as logged out in Electron, so Instagram is checked in the
installed app instead.
