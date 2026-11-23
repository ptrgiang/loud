// The posting window: one BrowserWindow with two views side by side — the draft's contents on the left (our own
// dashboard pane, so copy buttons work), the platform's composer on the right in that platform's logged-in session.
// Loud still never posts; it only puts the pieces next to each other so nothing has to be juggled between windows.
import { APP_ORIGIN } from "../brand.ts";
import { composerUrl } from "@loud/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Electron from "electron";
import * as NodePath from "node:path";

import { readDrafts } from "../agent/drafts.ts";
import { windowIcon } from "../app/appIcon.ts";
import { AppPaths } from "../app/AppPaths.ts";
import { EventBus } from "../app/EventBus.ts";
import { readJson, writeJson } from "../data/files.ts";
import { PLATFORMS, platformForUrl } from "./PlatformCatalog.ts";
import { Platforms } from "./Platforms.ts";

export interface PosterShape {
  readonly open: (id: string) => Effect.Effect<void, Error>;
  /** The pane's drag handle reports a width; clamped and kept in window.json for next time. */
  readonly setPane: (width: number) => void;
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
      let win: Electron.BrowserWindow | null = null;
      let pane: Electron.WebContentsView | null = null;
      let web: Electron.WebContentsView | null = null;
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
          platforms.session(draft.channel); // wires UA, permission denials and the login watcher
          const paneUrl = `${APP_ORIGIN}/#post/${draft.id}`;
          const target = composerUrl(draft.channel, draft.text);

          if (win && !win.isDestroyed() && pane && web) {
            void pane.webContents.loadURL(paneUrl);
            void web.webContents.loadURL(target);
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
          const webView = new Electron.WebContentsView({
            webPreferences: {
              partition: p.partition,
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
              spellcheck: false,
            },
          });
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
          // Same rules as a platform window: same-site popups stay in this profile, anything else leaves.
          webView.webContents.setWindowOpenHandler(({ url: target }) => {
            if (platformForUrl(target) === draft.channel) {
              return {
                action: "allow",
                overrideBrowserWindowOptions: {
                  ...windowIcon(),
                  autoHideMenuBar: true,
                  webPreferences: { partition: p.partition, sandbox: true },
                },
              };
            }
            if (/^https?:\/\//.test(target)) void Electron.shell.openExternal(target);
            return { action: "deny" };
          });
          // This window's own page is never loaded — only its two views are — so ready-to-show would never
          // fire. Show it now; each pane paints when its page lands.
          w.show();
          w.on("closed", () => {
            win = null;
            pane = null;
            web = null;
            ipcFrames.delete(paneFrame);
            Effect.runFork(events.detach(paneWc));
          });
          win = w;
          pane = paneView;
          web = webView;
          layout();
          void paneView.webContents.loadURL(paneUrl);
          void webView.webContents.loadURL(target);
        });

      return Poster.of({ open, setPane });
    }),
  );
