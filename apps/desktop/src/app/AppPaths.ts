import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Electron from "electron";
import * as NodePath from "node:path";

export interface AppPathsShape {
  /** settings.json and the browser profiles. LOUD_HOME moves it (tests, a second profile). */
  readonly home: string;
  /** What collectors read and the build writes. LOUD_DATA moves only this. */
  readonly data: string;
  /** The built dashboard (apps/web/dist). */
  readonly web: string;
}

export class AppPaths extends Context.Service<AppPaths, AppPathsShape>()(
  "@loud/desktop/app/AppPaths",
) {}

export const resolve = (): AppPathsShape => {
  const home = process.env.LOUD_HOME ?? Electron.app.getPath("userData");
  return {
    home,
    data: process.env.LOUD_DATA ?? NodePath.join(home, "data"),
    web: Electron.app.isPackaged
      ? NodePath.join(process.resourcesPath, "web")
      : NodePath.resolve(__dirname, "..", "..", "web", "dist"),
  };
};

export const layer = Layer.sync(AppPaths, resolve);
