# Releasing

Development and use stay apart. Code changes here, run from source against a `Loud Dev` profile (or `LOUD_HOME`) with the demo data. Connecting real accounts happens only in an installed copy, whose profile (`%APPDATA%\Loud`, `~/Library/Application Support/Loud`, `~/.config/Loud`) a copy run from source never opens. That copy gets new versions from GitHub Releases, so what is tested with real accounts is what users install.

1. Set the version in `apps/desktop/package.json` and move the CHANGELOG's Unreleased entries under it.
2. Tag the commit `v<version>` and push the tag. The [Release workflow](../.github/workflows/release.yml) builds Windows (NSIS, x64 and arm64), macOS (dmg and zip, arm64 and x64) and Linux (AppImage), and uploads them with the updater's `latest*.yml` files to a **draft** GitHub Release.
3. Try the installers, then publish the draft (`gh release edit v<version> --draft=false`). Installed copies with update checks turned on see it within 6 hours, or at once with Check now in Settings.

The release goes to the repository the workflow runs in (`-c.publish.owner` and `-c.publish.repo`). A local build (`--publish never`) has no update channel, and the app says so in Settings.

## Signing

Unsigned builds work, but Windows SmartScreen and macOS Gatekeeper warn about them, and the macOS updater needs a signed app. Set these repository secrets to sign:

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
