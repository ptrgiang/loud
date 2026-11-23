import { readJson, writeJson } from "../data/files.ts";
import * as Effect from "effect/Effect";
import * as Electron from "electron";
import * as NodePath from "node:path";

import { windowIcon } from "../app/appIcon.ts";
import { APP_ORIGIN, BRAND } from "../brand.ts";

export interface MainWindowOptions {
  readonly openLink: (url: string) => void;
  /** Where window.json lives — the profile dir, so bounds and maximized survive updates. */
  readonly home: string;
}

interface SavedWindow {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly maximized?: boolean;
  /** The posting window's pane width, kept here too — merge on write so neither side clobbers the other. */
  readonly paneWidth?: number;
}

const stateFile = (home: string) => NodePath.join(home, "window.json");

/** Saved bounds only apply if some display can still show them — monitors come and go. */
const onScreen = (s: SavedWindow): boolean => {
  if (typeof s.x !== "number" || typeof s.y !== "number") return false;
  const { x, y } = s;
  const w = s.width ?? 0;
  const h = s.height ?? 0;
  return Electron.screen
    .getAllDisplays()
    .some(
      (d) =>
        x + w > d.workArea.x &&
        x < d.workArea.x + d.workArea.width &&
        y + h > d.workArea.y &&
        y < d.workArea.y + d.workArea.height,
    );
};

export const create = (options: MainWindowOptions) =>
  Effect.sync(() => {
    const saved = readJson<SavedWindow>(stateFile(options.home)) ?? {};
    const size = {
      width: Math.max(960, saved.width ?? 1320),
      height: Math.max(600, saved.height ?? 880),
    };
    const dark = Electron.nativeTheme.shouldUseDarkColors;
    const w = new Electron.BrowserWindow({
      ...windowIcon(),
      ...size,
      // Without a surviving position the window centers itself.
      ...(onScreen(saved) ? { x: saved.x, y: saved.y } : {}),
      minWidth: 960,
      minHeight: 600,
      title: BRAND.name,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: dark ? "#000000" : "#fcfcfc",
      webPreferences: {
        preload: NodePath.join(__dirname, "preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
      },
    });

    w.once("ready-to-show", () => {
      if (saved.maximized) w.maximize();
      w.show();
    });
    // "close" still has valid bounds; at "closed" they are already gone. getNormalBounds holds the real
    // size even when the window leaves maximized — that is what the next open should restore.
    w.on("close", () => {
      writeJson(stateFile(options.home), {
        ...readJson<SavedWindow>(stateFile(options.home)),
        ...w.getNormalBounds(),
        maximized: w.isMaximized() || w.isFullScreen(),
      });
    });

    // The dashboard never navigates away from itself; links leave through openLink.
    w.webContents.on("will-navigate", (event, url) => {
      if (url.startsWith(`${APP_ORIGIN}/`)) return;
      event.preventDefault();
      options.openLink(url);
    });
    w.webContents.setWindowOpenHandler(({ url }) => {
      options.openLink(url);
      return { action: "deny" };
    });
    w.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
      callback(false),
    );

    void w.loadURL(`${APP_ORIGIN}/`);
    return w;
  });
