// The tray icon: lets Loud keep collecting on its timer with the window closed (when the user chose that).
import * as Electron from "electron";

import { appIcon } from "./appIcon.ts";

import { BRAND } from "../brand.ts";

/** The app icon; on macOS a filled circle as a template image (black on transparent), which the menu bar expects. */
function icon(): Electron.NativeImage {
  const app = process.platform === "darwin" ? null : appIcon();
  if (app) return app.resize({ width: 32, height: 32, quality: "best" });
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  const mac = process.platform === "darwin";
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
      const a = Math.max(0, Math.min(1, 12.5 - d));
      const i = (y * size + x) * 4;
      // BGRA
      const v = mac ? 0 : 0xf4;
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
      buf[i + 3] = Math.round(a * 255);
    }
  const img = Electron.nativeImage.createFromBitmap(buf, {
    width: size,
    height: size,
    scaleFactor: 2,
  });
  if (mac) img.setTemplateImage(true);
  return img;
}

export interface TrayActions {
  readonly open: () => void;
  readonly collect: () => void;
  readonly quit: () => void;
}

export function createTray(actions: TrayActions): Electron.Tray {
  const tray = new Electron.Tray(icon());
  tray.setToolTip(BRAND.name);
  tray.setContextMenu(
    Electron.Menu.buildFromTemplate([
      { label: `Open ${BRAND.name}`, click: actions.open },
      { label: "Collect now", click: actions.collect },
      { type: "separator" },
      { label: `Quit ${BRAND.name}`, click: actions.quit },
    ]),
  );
  tray.on("click", actions.open);
  return tray;
}
