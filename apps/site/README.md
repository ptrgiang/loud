# loud.trysometh.ing

The project page: plain HTML and CSS in `public/`, no build step. Screens come from the fictional demo (Acme Forms), dark theme, taken with `LOUD_SHOT`; never from a real account.

`site.js` asks the GitHub API for the latest release and points the download buttons at the installer for the visitor's system. Without it, the buttons link to the release page.

It runs on Cloudflare as a Worker (`wrangler.jsonc`). Static files are served first; `src/worker.ts` answers `/api/*`:

- `POST /api/usage` takes the usage report the app sends after the user said yes. It is decoded against `UsageReport` from `@loud/contracts` with unknown keys refused, and stored in D1 (`loud-usage`) as one row per install id and UTC day. The IP address is never read; Worker logs are off.
- `DELETE /api/usage/<install>` is sent when the user turns sharing off.
- `GET /api/stats` gives the totals for the home page, cached for an hour.
- A daily cron deletes rows older than 400 days.

`public/privacy.html` lists every field. Change it, the schema and the app's Settings text together.

`public/_headers` sets the security headers. Deploying also creates the `loud.trysometh.ing` DNS record and certificate:

```sh
npx wrangler d1 migrations apply loud-usage --remote -c apps/site/wrangler.jsonc  # when migrations/ changed
npx wrangler deploy -c apps/site/wrangler.jsonc
```

To try it locally: `npx wrangler d1 migrations apply loud-usage --local`, then `npx wrangler dev` in `apps/site`, and point a copy run from source at it with `LOUD_USAGE_URL=http://127.0.0.1:8787/api/usage` (use a scratch `LOUD_HOME` and a data folder that is not the demo).
