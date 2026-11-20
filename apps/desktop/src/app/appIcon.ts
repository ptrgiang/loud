// The app icon for the window and tray. scripts/build.mjs copies resources/icon.png next to main.cjs; packaged builds
// also carry it in the executable, but Windows and Linux windows still want it set.
import * as Electron from "electron";
import * as NodePath from "node:path";

let cached: Electron.NativeImage | null | undefined;

export function appIcon(): Electron.NativeImage | null {
  if (cached === undefined) {
    const img = Electron.nativeImage.createFromPath(NodePath.join(__dirname, "icon.png"));
    cached = img.isEmpty() ? null : img;
  }
  return cached;
}

/** BrowserWindow options that set the icon where the OS takes it from the window (not macOS). */
export const windowIcon = (): { icon?: Electron.NativeImage } => {
  const icon = process.platform === "darwin" ? null : appIcon();
  return icon ? { icon } : {};
};
