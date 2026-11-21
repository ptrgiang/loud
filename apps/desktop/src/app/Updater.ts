// App updates through electron-updater and GitHub Releases. Nothing is asked of GitHub until the user turns checking on
// in Settings or presses Check now; a found update downloads in the background and installs only on the user's word.
import type { UpdateStatus } from "@loud/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Electron from "electron";
import { autoUpdater } from "electron-updater";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { stampNow } from "../agent/drafts.ts";
import { SettingsStore } from "../settings/SettingsStore.ts";
import { EventBus } from "./EventBus.ts";

export interface UpdaterShape {
  readonly status: Effect.Effect<UpdateStatus>;
  readonly check: Effect.Effect<UpdateStatus>;
  readonly install: Effect.Effect<void>;
  /** Re-arm the timer after the setting changed. */
  readonly reschedule: Effect.Effect<void>;
}

export class Updater extends Context.Service<Updater, UpdaterShape>()(
  "@loud/desktop/app/Updater",
) {}

const EVERY_MS = 6 * 3_600_000;
const FIRST_MS = 30_000;

export const layer = Layer.effect(
  Updater,
  Effect.gen(function* () {
    const settings = yield* SettingsStore;
    const events = yield* EventBus;
    // electron-builder writes app-update.yml only when the build has somewhere to publish to.
    const unsupported = !Electron.app.isPackaged
      ? "Running from source: updates work in the installed app only."
      : !NodeFS.existsSync(NodePath.join(process.resourcesPath, "app-update.yml"))
        ? "This build has no update channel."
        : null;
    const supported = unsupported === null;

    let status: UpdateStatus = {
      supported,
      state: "idle",
      version: null,
      progress: null,
      error: unsupported,
      checkedAt: null,
    };
    const set = (patch: Partial<UpdateStatus>) => {
      status = { ...status, ...patch };
      Effect.runFork(events.publish({ type: "updates", status }));
    };

    if (supported) {
      autoUpdater.logger = null;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.on("checking-for-update", () => set({ state: "checking", error: null }));
      autoUpdater.on("update-not-available", () =>
        set({ state: "none", checkedAt: stampNow(new Date()) }),
      );
      autoUpdater.on("update-available", (info) =>
        set({
          state: "downloading",
          version: info.version,
          progress: 0,
          checkedAt: stampNow(new Date()),
        }),
      );
      autoUpdater.on("download-progress", (p) => set({ progress: Math.round(p.percent) }));
      autoUpdater.on("update-downloaded", (info) =>
        set({ state: "ready", version: info.version, progress: 100 }),
      );
      autoUpdater.on("error", (e) => set({ state: "error", error: e.message.split("\n")[0]! }));
    }

    const runCheck = () => {
      if (!supported || status.state === "checking" || status.state === "downloading") return;
      // A failed check is reported through the "error" event; the promise would only repeat it.
      autoUpdater.checkForUpdates().catch(() => {});
    };

    let timer: NodeJS.Timeout | undefined;
    const arm = (s: { check: boolean }, first: boolean) => {
      clearTimeout(timer);
      timer = undefined;
      if (!supported || !s.check) return;
      timer = setTimeout(
        () => {
          runCheck();
          arm(s, false);
        },
        first ? FIRST_MS : EVERY_MS,
      );
      timer.unref();
    };
    arm((yield* settings.get).updates, true);

    return Updater.of({
      status: Effect.sync(() => status),
      check: Effect.sync(() => {
        runCheck();
        return status;
      }),
      install: Effect.sync(() => {
        // Silent, then relaunch: the NSIS wizard (oneClick is off for the first install) is for first installs only.
        // It is the running version that decides this, so the update into this build still shows the wizard once.
        if (supported && status.state === "ready") autoUpdater.quitAndInstall(true, true);
      }),
      reschedule: Effect.map(settings.get, (s) => arm(s.updates, true)),
    });
  }),
);
