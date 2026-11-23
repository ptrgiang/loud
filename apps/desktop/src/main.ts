import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Electron from "electron";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import * as Agent from "./agent/Agent.ts";
import * as AppPaths from "./app/AppPaths.ts";
import * as Log from "./app/Log.ts";
import * as AppProtocol from "./app/AppProtocol.ts";
import { createTray } from "./app/AppTray.ts";
import * as EventBus from "./app/EventBus.ts";
import * as Updater from "./app/Updater.ts";
import * as Usage from "./app/Usage.ts";
import { BRAND } from "./brand.ts";
import * as Builder from "./build/Builder.ts";
import * as Collector from "./collect/Collector.ts";
import * as DataStore from "./data/DataStore.ts";
import { DEMO_MARKER } from "./data/files.ts";
import { generateDemo, holdsRealData } from "./demo/demo.ts";
import * as IpcHandlers from "./ipc/IpcHandlers.ts";
import * as Platforms from "./platforms/Platforms.ts";
import * as Poster from "./platforms/Poster.ts";
import * as SettingsStore from "./settings/SettingsStore.ts";
import * as MainWindow from "./window/MainWindow.ts";

// Siblings in a merge do not see each other's services, so Log gets its own copy of AppPaths.
const BaseLayer = Layer.mergeAll(
  AppPaths.layer,
  EventBus.layer,
  Log.layer.pipe(Layer.provide(AppPaths.layer)),
);
const StoresLayer = Layer.mergeAll(SettingsStore.layer, DataStore.layer).pipe(
  Layer.provideMerge(BaseLayer),
);
// Frames Loud created itself that may call IPC: the main window's main frame, and posting panes.
const ipcFrames = new Set<Electron.WebFrameMain>();

const ServicesLayer = Layer.mergeAll(
  Platforms.layer,
  Builder.layer,
  Agent.layer,
  Updater.layer,
).pipe(Layer.provideMerge(StoresLayer));
const UsageLayer = Usage.layer.pipe(Layer.provideMerge(ServicesLayer));
// Poster's deps (Platforms included) come from the merged services, same as Collector's.
const MainLayer = Layer.mergeAll(Collector.layer, Poster.layer(ipcFrames)).pipe(
  Layer.provideMerge(UsageLayer),
);

// Dev only: LOUD_SHOT=<file.png> saves the dashboard once it settles, then quits. LOUD_SHOT_JS runs first (to open a
// view), LOUD_SHOT_WAIT sets the settle time in ms.
const screenshot = (w: Electron.BrowserWindow, file: string) => {
  const wait = Number(process.env.LOUD_SHOT_WAIT ?? 1500);
  w.webContents.once("did-finish-load", () => {
    setTimeout(async () => {
      try {
        if (process.env.LOUD_SHOT_JS) {
          const result: unknown = await w.webContents.executeJavaScript(process.env.LOUD_SHOT_JS);
          if (result !== undefined) console.log("[loud] script:", JSON.stringify(result));
        }
        await new Promise((r) => setTimeout(r, 600));
        // Extra windows (e.g. the posting window) get numbered shots next to the main one.
        const extra = Electron.BrowserWindow.getAllWindows().filter((x) => x !== w);
        const image = await w.webContents.capturePage();
        NodeFS.writeFileSync(file, image.toPNG());
        console.log(`[loud] screenshot saved: ${file}`);
        for (const [i, x] of extra.entries()) {
          // A view-only window's own page never loads — capture each child view instead.
          const views = x.contentView.children.filter(
            (view): view is Electron.WebContentsView => view instanceof Electron.WebContentsView,
          );
          for (const [v, view] of views.entries()) {
            const out = file.replace(/\.png$/, `-${i + 1}.${v + 1}.png`);
            NodeFS.writeFileSync(out, (await view.webContents.capturePage()).toPNG());
            console.log(`[loud] screenshot saved: ${out}`);
          }
        }
      } catch (error) {
        console.error("[loud] screenshot failed:", error);
        process.exitCode = 1;
      } finally {
        Electron.app.quit();
      }
    }, wait);
  });
};

const program = Effect.gen(function* () {
  const paths = yield* AppPaths.AppPaths;
  const log = yield* Log.Log;
  const events = yield* EventBus.EventBus;
  const platforms = yield* Platforms.Platforms;
  const builder = yield* Builder.Builder;
  const settings = yield* SettingsStore.SettingsStore;
  const collector = yield* Collector.Collector;

  log.info(
    `start ${BRAND.name} ${Electron.app.getVersion()} ${process.platform}/${process.arch}${Electron.app.isPackaged ? "" : " (dev)"}`,
  );
  yield* AppProtocol.handle(paths.web);

  // LOUD_DEMO=1 fills an empty data folder with the fictional demo; a folder with collected data is left alone.
  if (
    process.env.LOUD_DEMO === "1" &&
    !holdsRealData(paths.data) &&
    !NodeFS.existsSync(NodePath.join(paths.data, DEMO_MARKER))
  ) {
    yield* Effect.sync(() => generateDemo(paths.data));
  }
  // Settings or the clock may have moved since the last build: ages and windows are relative to now.
  yield* Effect.forkDetach(builder.build);

  let main: Electron.BrowserWindow | null = null;
  const openLink = (url: string) => Effect.runFork(platforms.openLink(url));

  yield* IpcHandlers.install((frame) => frame !== null && ipcFrames.has(frame));

  const openMain = Effect.gen(function* () {
    if (main && !main.isDestroyed()) {
      if (main.isMinimized()) main.restore();
      main.focus();
      return;
    }
    const w = yield* MainWindow.create({ openLink, home: paths.home });
    main = w;
    // Grab these before "closed" fires: after destroy, w.webContents throws.
    const wc = w.webContents;
    const frame = wc.mainFrame;
    ipcFrames.add(frame);
    yield* events.attach(wc);
    w.on("closed", () => {
      main = null;
      ipcFrames.delete(frame);
      Effect.runFork(events.detach(wc));
    });
    if (process.env.LOUD_SHOT && !Electron.app.isPackaged) screenshot(w, process.env.LOUD_SHOT);
  });

  yield* openMain;
  Electron.app.on("second-instance", () => Effect.runFork(openMain));
  Electron.app.on("activate", () => Effect.runFork(openMain));

  // With "keep in tray" on, closing the window leaves Loud running so the collection timer keeps going.
  let quitting = false;
  const tray = createTray({
    open: () => Effect.runFork(openMain),
    collect: () => Effect.runFork(Effect.ignore(collector.start({}))),
    quit: () => {
      quitting = true;
      Electron.app.quit();
    },
  });
  Electron.app.on("before-quit", () => {
    quitting = true;
    tray.destroy();
  });
  Electron.app.on("window-all-closed", () => {
    const keep = Effect.runSync(settings.get).collection.keepInTray;
    if (!keep || quitting) Electron.app.quit();
  });
});

// LOUD_HOME moves everything, browser profiles included; it must be set before Electron touches the profile. A copy
// run from source never shares the installed app's profile, so development cannot touch real sessions or data.
const dev = !Electron.app.isPackaged;
if (process.env.LOUD_HOME) Electron.app.setPath("userData", process.env.LOUD_HOME);
else if (dev)
  Electron.app.setPath(
    "userData",
    NodePath.join(Electron.app.getPath("appData"), `${BRAND.name} Dev`),
  );
if (process.platform === "win32")
  Electron.app.setAppUserModelId(dev ? `${BRAND.appId}.dev` : BRAND.appId);
AppProtocol.registerScheme();

if (!Electron.app.requestSingleInstanceLock()) {
  Electron.app.quit();
} else {
  void Electron.app.whenReady().then(() =>
    Effect.runPromise(program.pipe(Effect.provide(MainLayer))).catch((error: unknown) => {
      console.error("[loud] failed to start:", error);
      Electron.app.exit(1);
    }),
  );
}
