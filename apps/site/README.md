# loud.trysometh.ing

The project page: plain HTML and CSS in `public/`, no build step. Screens come from the fictional demo (Acme Forms), dark theme, taken with `LOUD_SHOT`; never from a real account.

`site.js` asks the GitHub API for the latest release and points the download buttons at the installer for the visitor's system. Without it, the buttons link to the release page.

To look at it locally, serve `public/` with any static server, for example `npx serve apps/site/public`.

It is published by the [Site workflow](../../.github/workflows/site.yml) to GitHub Pages, with `public/CNAME` for the domain. DNS: a `CNAME` record from `loud` to `<owner>.github.io`.
