# Security Policy

Loud holds logged-in sessions for its users' social accounts, so we take security reports seriously.

## Reporting a vulnerability

**Please don't open public issues for security problems.** Use GitHub's private reporting: **Security → Report a vulnerability** on this repository.

Include what you found, steps to reproduce, and the impact. Never include real session cookies, tokens or account data in a report.

## Scope

In scope: the code in this repository, for example:

- a page loaded in a platform window, or anything else that is not the dashboard, reaching the `loud:invoke` IPC channel;
- escaping the dashboard's CSP, or getting it to load remote code;
- session cookies or collected data leaving the computer, or leaking between platform profiles;
- path traversal through the `loud://` protocol or the data folder.

Out of scope: the social platforms themselves (report to them), Electron or Chromium bugs (report upstream), and attacks that need an attacker already running code as the user.

## Supported versions

Only the latest release and the `main` branch are supported.
