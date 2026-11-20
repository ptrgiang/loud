## What

<!-- What does this change? -->

## Why

<!-- The problem being solved. For bug fixes: the root cause and how the invalid state occurred. -->

## Before / After

<!-- Required for anything a user can see: screenshots in light and dark, taken with demo data. Docs-only PRs may skip. -->

## QA steps

1.

## Test results

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`

## Checklist

- [ ] New IPC calls are declared in `IpcMethods` and their input is decoded
- [ ] Platform requests go through that platform's session and respect the rate limits
- [ ] No data leaves the computer except to the platform it came from
- [ ] No secrets, personal data, real accounts or unlicensed third-party media

---

AI disclosure: <!-- model(s) used, e.g. "Claude Opus 5.5", or "none" -->
