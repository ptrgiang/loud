# Releasing

Development and use stay apart. Code changes here, run from source against a `Loud Dev` profile (or `LOUD_HOME`) with the demo data. Connecting real accounts happens only in an installed copy, whose profile (`%APPDATA%\Loud`, `~/Library/Application Support/Loud`, `~/.config/Loud`) a copy run from source never opens. That copy gets new versions from GitHub Releases, so what is tested with real accounts is what users install.

1. Set the version in `apps/desktop/package.json` and move the CHANGELOG's Unreleased entries under it.
2. Tag the commit `v<version>` and push the tag. The [Release workflow](../.github/workflows/release.yml) builds Windows (NSIS, x64 and arm64), macOS (dmg and zip, arm64 and x64) and Linux (AppImage), and uploads them with the updater's `latest*.yml` files to a **draft** GitHub Release.
3. Try the installers, then publish the draft (`gh release edit v<version> --draft=false`). Installed copies with update checks turned on see it within 6 hours, or at once with Check now in Settings.

The release goes to the repository named in `apps/desktop/package.json` (`repository`), which is also where installed copies look for updates. A fork that releases its own builds changes it there.

## Beta channel

A tag with a prerelease suffix, `v<version>-beta.1`, produces `beta*.yml` feed files instead of `latest*.yml`. Installs with Beta channel on in Settings → Updates see it; everyone else does not. Use it to try a collector fix on a few machines before the release reaches all installs.

## Signing

Unsigned builds work, but Windows SmartScreen and macOS Gatekeeper warn about them, and the macOS updater needs a signed app. Set these repository secrets to sign:

### Without a certificate yet

- **Windows: SignPath issues free certificates to open-source projects** — Loud qualifies (MIT, public repo). A real CA cert wired into this workflow through their signing client; apply at signpath.io first.
- **Windows unsigned meanwhile**: SmartScreen warns once. `verifyUpdateCodeSignature` only checks installs that were signed, so unsigned→unsigned updates still land — leave it on; it protects signed builds later. Cheapest paid path: a Microsoft Store developer account (one-time fee), which also handles updates itself via an `appx` build.
- **macOS has no free path**: notarization needs the paid Developer Program, and an unsigned app's updater cannot install a new version, so unsigned mac builds update by downloading again. Users open it via right-click → Open or `xattr -dr com.apple.quarantine`. Consider not shipping macOS until the account exists.
- Never ship a self-signed certificate or install your own root CA on users' machines: AVs flag it and SmartScreen still warns.

| Secret                                                     | For                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`                     | Windows code-signing certificate (base64 `.pfx`) and password. |
| `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`                     | Developer ID Application certificate (base64 `.p12`).          |
| `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | App Store Connect API key, for notarization.                   |

Azure Trusted Signing works too: add `win.azureSignOptions` to `electron-builder.yml` and its `AZURE_*` variables.

## Locally

```sh
pnpm build
pnpm --filter @loud/desktop dist    # installers in apps/desktop/release, nothing uploaded
```

The icon is drawn in `apps/desktop/resources/icon.svg`; `icon.png` (1024×1024) is rendered from it, and electron-builder makes the `.ico` and `.icns` from that.
