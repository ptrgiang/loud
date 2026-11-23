// The posting window: one BrowserWindow with two views side by side — the draft's contents on the left (our own
// dashboard pane, so copy buttons work), the platform's composer on the right in that platform's logged-in session.
// Loud still never posts; it only puts the pieces next to each other so nothing has to be juggled between windows.
import { APP_ORIGIN } from "../brand.ts";
import { composerUrl, type ChannelId } from "@loud/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Electron from "electron";
import * as NodePath from "node:path";

import { draftMediaPath, markDraftPosted, readDrafts, stampNow } from "../agent/drafts.ts";
import { windowIcon } from "../app/appIcon.ts";
import { AppPaths } from "../app/AppPaths.ts";
import { EventBus } from "../app/EventBus.ts";
import { Log } from "../app/Log.ts";
import { readJson, writeJson } from "../data/files.ts";
import { SettingsStore } from "../settings/SettingsStore.ts";
import { DRIVERS } from "./publish/index.ts";
import { evalIn, type PublishResult } from "./publish/common.ts";
import { PLATFORMS, platformForUrl } from "./PlatformCatalog.ts";
import { Platforms } from "./Platforms.ts";

export interface PosterShape {
  readonly open: (id: string) => Effect.Effect<void, Error>;
  /** The pane's drag handle reports a width; clamped and kept in window.json for next time. */
  readonly setPane: (width: number) => void;
  /** What the open composer's page supports right now — media slot and scheduling. */
  readonly capable: (id: string) => Effect.Effect<{ schedule: boolean; media: boolean }, Error>;
  /** Submits the draft in the open composer — after the pane's confirm click. */
  readonly publish: (id: string, schedule?: string) => Effect.Effect<PublishResult, Error>;
}

export class Poster extends Context.Service<Poster, PosterShape>()(
  "@loud/desktop/platforms/Poster",
) {}

const PANE_WIDTH = 380;
const PANE_MIN = 280;
const PANE_MAX = 640;

interface WindowState {
  readonly paneWidth?: number;
}

const stateFile = (home: string) => NodePath.join(home, "window.json");

/** ipcFrames is the IPC door's guest list: only frames we created ourselves (main window, this pane) may call. */
export const layer = (ipcFrames: Set<Electron.WebFrameMain>) =>
  Layer.effect(
    Poster,
    Effect.gen(function* () {
      const paths = yield* AppPaths;
      const platforms = yield* Platforms;
      const events = yield* EventBus;
      const settings = yield* SettingsStore;
      const log = yield* Log;
      let win: Electron.BrowserWindow | null = null;
      let pane: Electron.WebContentsView | null = null;
      let web: Electron.WebContentsView | null = null;
      /** Which platform session `web` was built with — a view can't switch partitions, so a new channel rebuilds it. */
      let webChannel: ChannelId | null = null;
      /** Which draft the window is posting — publish refuses anything else. */
      let openDraft: string | null = null;
      /** One publish at a time; a second confirm gets refused instead of two clicks. */
      let publishing = false;
      let paneWidth = readJson<WindowState>(stateFile(paths.home))?.paneWidth ?? PANE_WIDTH;

      const layout = () => {
        if (!win || win.isDestroyed() || !pane || !web) return;
        const b = win.getContentBounds();
        pane.setBounds({ x: 0, y: 0, width: paneWidth, height: b.height });
        web.setBounds({
          x: paneWidth,
          y: 0,
          width: Math.max(0, b.width - paneWidth),
          height: b.height,
        });
      };

      const setPane = (width: number) => {
        if (!Number.isFinite(width)) return;
        paneWidth = Math.round(Math.min(PANE_MAX, Math.max(PANE_MIN, width)));
        layout();
        writeJson(stateFile(paths.home), {
          ...readJson<WindowState>(stateFile(paths.home)),
          paneWidth,
        });
      };

      const open = (id: string) =>
        Effect.gen(function* () {
          const draft = readDrafts(paths.data).find((d) => d.id === id);
          if (!draft) return yield* Effect.fail(new Error("That draft is gone."));
          const p = PLATFORMS[draft.channel];
          // A disconnected platform would open a logged-out composer that looks ready but cannot post.
          if ((yield* platforms.view(draft.channel)).status !== "connected")
            return yield* Effect.fail(new Error(`Connect ${p.name} first.`));
          platforms.session(draft.channel); // wires UA, permission denials and the login watcher
          const paneUrl = `${APP_ORIGIN}/#post/${draft.id}`;
          const target = composerUrl(draft.channel, draft.text);

          const makeWeb = (channel: ChannelId) => {
            const view = new Electron.WebContentsView({
              webPreferences: {
                partition: PLATFORMS[channel].partition,
                sandbox: true,
                contextIsolation: true,
                nodeIntegration: false,
                spellcheck: false,
              },
            });
            // Same rules as a platform window: same-site popups stay in this profile, anything else leaves.
            view.webContents.setWindowOpenHandler(({ url: target }) => {
              if (platformForUrl(target) === channel) {
                return {
                  action: "allow",
                  overrideBrowserWindowOptions: {
                    ...windowIcon(),
                    autoHideMenuBar: true,
                    webPreferences: {
                      partition: PLATFORMS[channel].partition,
                      sandbox: true,
                    },
                  },
                };
              }
              if (/^https?:\/\//.test(target)) void Electron.shell.openExternal(target);
              return { action: "deny" };
            });
            return view;
          };

          if (win && !win.isDestroyed() && pane && web) {
            if (webChannel !== draft.channel) {
              // Partitions are fixed at creation: drop the other platform's view and build this one's.
              win.contentView.removeChildView(web);
              web.webContents.close();
              web = makeWeb(draft.channel);
              win.contentView.addChildView(web);
              webChannel = draft.channel;
              layout();
            }
            openDraft = draft.id;
            void pane.webContents.loadURL(paneUrl);
            void web.webContents.loadURL(target);
            win.setTitle(`Post to ${p.name}`);
            win.focus();
            return;
          }

          const w = new Electron.BrowserWindow({
            ...windowIcon(),
            width: 1440,
            height: 900,
            minWidth: 800,
            minHeight: 480,
            title: `Post to ${p.name}`,
            autoHideMenuBar: true,
            show: false,
            backgroundColor: "#ffffff",
          });
          const paneView = new Electron.WebContentsView({
            webPreferences: {
              preload: NodePath.join(__dirname, "preload.cjs"),
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
              spellcheck: false,
            },
          });
          const webView = makeWeb(draft.channel);
          webChannel = draft.channel;
          w.contentView.addChildView(paneView);
          w.contentView.addChildView(webView);
          w.on("resize", layout);

          // Grab these before "closed" fires: after destroy, .webContents throws.
          const paneWc = paneView.webContents;
          const paneFrame = paneWc.mainFrame;
          ipcFrames.add(paneFrame);
          Effect.runFork(events.attach(paneWc));

          // The pane is our own page: it may not leave loud://; outside links go to the system browser.
          paneWc.on("will-navigate", (event, url) => {
            if (url.startsWith(`${APP_ORIGIN}/`)) return;
            event.preventDefault();
            Effect.runFork(platforms.openLink(url));
          });
          paneWc.setWindowOpenHandler(({ url }) => {
            Effect.runFork(platforms.openLink(url));
            return { action: "deny" };
          });
          // This window's own page is never loaded — only its two views are — so ready-to-show would never
          // fire. Show it now; each pane paints when its page lands.
          w.show();
          w.on("closed", () => {
            win = null;
            pane = null;
            web = null;
            webChannel = null;
            openDraft = null;
            publishing = false;
            ipcFrames.delete(paneFrame);
            Effect.runFork(events.detach(paneWc));
          });
          win = w;
          pane = paneView;
          web = webView;
          openDraft = draft.id;
          layout();
          void paneView.webContents.loadURL(paneUrl);
          void webView.webContents.loadURL(target);
        });

      /** Everything that must be true before the composer is touched. */
      const preconditions = (id: string) =>
        Effect.gen(function* () {
          const draft = readDrafts(paths.data).find((d) => d.id === id);
          if (!draft) return yield* Effect.fail(new Error("That draft is gone."));
          const s = yield* settings.get;
          if (!s.posting.auto)
            return yield* Effect.fail(
              new Error("Posting automation is off — turn it on in Settings."),
            );
          const p = PLATFORMS[draft.channel];
          if ((yield* platforms.view(draft.channel)).status !== "connected")
            return yield* Effect.fail(new Error(`Connect ${p.name} first.`));
          const driver = DRIVERS[draft.channel];
          if (!driver)
            return yield* Effect.fail(
              new Error(`${p.name} posts by hand for now — automation comes later.`),
            );
          if (!win || win.isDestroyed() || !web || openDraft !== id)
            return yield* Effect.fail(new Error("The posting window is not open."));
          return { draft, driver, wc: web.webContents };
        });

      const capable = (id: string) =>
        Effect.gen(function* () {
          const checked = yield* preconditions(id).pipe(Effect.catch(() => Effect.succeed(null)));
          if (!checked) return { schedule: false, media: false };
          const { driver, wc } = checked;
          const probe = (sel: string) =>
            Effect.promise(
              async () =>
                (await evalIn<boolean>(wc, `!!document.querySelector(${JSON.stringify(sel)})`)) ??
                false,
            );
          return {
            // Scheduling is Loud's own clock now — any channel with a driver can schedule.
            schedule: true,
            media: yield* probe(driver.fileSelector),
          };
        });

      const publish = (id: string, schedule?: string) =>
        Effect.gen(function* () {
          if (publishing)
            return yield* Effect.fail(new Error("A post is already going out — wait for it."));
          const { draft, driver, wc } = yield* preconditions(id);
          // A schedule request only sets Loud's clock — the Scheduler loop fires it when due.
          if (schedule) {
            markDraftPosted(paths.data, id, { scheduledAt: schedule });
            yield* events.publish({ type: "drafts" });
            log.info(`scheduled draft ${id} for ${schedule}`);
            const scheduled: PublishResult = { ok: true, result: "scheduled" };
            return scheduled;
          }
          const mediaPaths = [...(draft.images ?? []), ...(draft.videos ?? [])].map((name) =>
            draftMediaPath(paths.data, id, name),
          );
          publishing = true;
          try {
            const result = yield* Effect.promise(() => driver.publish(wc, draft, mediaPaths));
            if (!result.ok) return result;
            markDraftPosted(paths.data, id, { posted: stampNow(new Date()) });
            yield* events.publish({ type: "drafts" });
            log.info(`posted draft ${id} to ${draft.channel}`);
            return result;
          } finally {
            publishing = false;
          }
        });

      return Poster.of({ open, setPane, capable, publish });
    }),
  );
