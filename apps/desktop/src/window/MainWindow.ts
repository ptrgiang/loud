import * as Effect from "effect/Effect";
import * as Electron from "electron";
import * as NodePath from "node:path";

import { windowIcon } from "../app/appIcon.ts";
import { APP_ORIGIN, BRAND } from "../brand.ts";

export interface MainWindowOptions {
  readonly openLink: (url: string) => void;
}

export const create = (options: MainWindowOptions) =>
  Effect.sync(() => {
    const dark = Electron.nativeTheme.shouldUseDarkColors;
    const w = new Electron.BrowserWindow({
      ...windowIcon(),
      width: 1320,
      height: 880,
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
    w.once("ready-to-show", () => w.show());

    void w.loadURL(`${APP_ORIGIN}/`);
    return w;
  });
