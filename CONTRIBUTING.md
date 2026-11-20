# Contributing to Loud

## Questions, bugs and ideas

Use GitHub Discussions on this repository: ask a question, report a bug or suggest an idea in the open, where others can add to it.

When a platform changes its pages and a number stops showing up, say which platform, which number, and what you see instead. Don't attach screenshots of your account or exported data; describe it, or reproduce it with the demo data.

## Contributing code from a fork

We don't run an inbound review queue on this repository: issues and pull requests are closed here. Code contributions come in a different way:

1. **Fork the repo** and open the pull request on _your own_ fork.
2. **Email [hello@trysometh.ing](mailto:hello@trysometh.ing)** with a link to it.
3. We review it, and if we want it, **we merge it on our side** as a single commit that credits you with a `Co-authored-by:` trailer (your GitHub noreply address works).

We read every submission, but we can't promise a reply to each one or a timeline. Security reports go through [SECURITY.md](SECURITY.md), never email or public posts.

Your PR is held to the same bar as anything maintainers write. At minimum:

- **Visual evidence for anything a user can see**: before/after screenshots in light and dark, taken with demo data. PRs that only touch documentation are exempt.
- **QA steps** someone else can follow to verify the change.
- **Test results**: `pnpm typecheck`, `pnpm test` and `pnpm build`. Add or update tests for behavior changes.
- **What / Why / Before-After / Test results** in the description (see the [PR template](.github/PULL_REQUEST_TEMPLATE.md)), and a self-review comment on your own diff.
- **An AI disclosure** naming the specific model used, or "none", after a `---` separator.

Explain the reasoning, not just the change. For bug fixes, identify the root cause and how the invalid state occurred.

## Ground rules

- **Local first.** A user's sessions and data stay on their computer. Loud talks to the platforms the user connected and to nothing else, unless the user turns on a feature that says where its data goes.
- **Accounts come first.** Collection stays within the rate limits and stops at a checkpoint or captcha. A collector that gets accounts restricted is a bug, however much data it gets.
- **Read, don't post,** until scheduled posting lands through the platforms' official APIs.
- **No fabricated data,** and no third-party media or real accounts in screenshots.
- **No secrets or personal data** in code, commits or PRs.

See [AGENTS.md](AGENTS.md) for code conventions that apply to people and coding agents alike.

## License

By sending us a contribution you agree it is licensed under the [MIT License](LICENSE). The Loud and Try Something names and logos are covered separately by [TRADEMARK.md](TRADEMARK.md).
