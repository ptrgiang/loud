# loud.trysometh.ing

The project page: plain HTML and CSS in `public/`, no build step. Screens come from the fictional demo (Acme Forms), dark theme, taken with `LOUD_SHOT`; never from a real account.

`site.js` asks the GitHub API for the latest release and points the download buttons at the installer for the visitor's system. Without it, the buttons link to the release page.

It runs on Cloudflare as a Worker with only static assets (`wrangler.jsonc`); `public/_headers` sets the security headers. Deploying also creates the `loud.trysometh.ing` DNS record and certificate:

```sh
npx wrangler deploy -c apps/site/wrangler.jsonc
```

To look at it locally: `npx wrangler dev -c apps/site/wrangler.jsonc`.
