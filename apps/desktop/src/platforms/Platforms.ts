// Connections: one persistent browser profile per platform. The user logs in once in a real window; afterwards
// collectors read with that session. Loud never sees a password, only whether the session cookie exists.
import { CHANNEL_IDS, type ChannelId, type PlatformView } from "@loud/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Electron from "electron";

import { windowIcon } from "../app/appIcon.ts";
import { EventBus } from "../app/EventBus.ts";
import { SettingsStore } from "../settings/SettingsStore.ts";
import {
  accountIdFromCookie,
  PLATFORMS,
  plainChromeUserAgent,
  platformForUrl,
} from "./PlatformCatalog.ts";

export interface PlatformsShape {
  readonly session: (id: ChannelId) => Electron.Session;
  readonly list: Effect.Effect<ReadonlyArray<PlatformView>>;
  readonly view: (id: ChannelId) => Effect.Effect<PlatformView>;
  readonly connect: (id: ChannelId) => Effect.Effect<PlatformView>;
  readonly disconnect: (id: ChannelId) => Effect.Effect<PlatformView>;
  readonly openBrowser: (id: ChannelId, url?: string) => Effect.Effect<void>;
  /** Platform links open in that platform's window (already logged in); anything else in the system browser. */
  readonly openLink: (url: string) => Effect.Effect<void>;
  /** Called after a login lands, with the account id from the cookie, so the account's handle can be read. */
  readonly onLogin: (listener: (id: ChannelId) => void) => void;
}

export class Platforms extends Context.Service<Platforms, PlatformsShape>()(
  "@loud/desktop/platforms/Platforms",
) {}

const WINDOW_CLOSE_DELAY_MS = 2500;

export const layer = Layer.effect(
  Platforms,
  Effect.gen(function* () {
    const settings = yield* SettingsStore;
    const events = yield* EventBus;
    const prepared = new Set<ChannelId>();
    const windows = new Map<ChannelId, Electron.BrowserWindow>();
    const loginListeners: Array<(id: ChannelId) => void> = [];

    const cookie = async (id: ChannelId, name: string) => {
      const list = await session(id).cookies.get({ url: PLATFORMS[id].cookieUrl, name });
      return list.find((c) => !c.expirationDate || c.expirationDate * 1000 > Date.now())?.value;
    };

    const isConnected = (id: ChannelId) =>
      Effect.promise(async () => (await cookie(id, PLATFORMS[id].authCookie)) !== undefined);

    const view = (id: ChannelId) =>
      Effect.gen(function* () {
        const s = yield* settings.get;
        const connected = yield* isConnected(id);
        return {
          id,
          name: PLATFORMS[id].name,
          status: connected ? "connected" : "disconnected",
          ...s.platforms[id],
        } satisfies PlatformView;
      });

    // On a login change: remember the account id and enable on the first connect; the handle is read afterwards.
    const refresh = (id: ChannelId) =>
      Effect.gen(function* () {
        if (yield* isConnected(id)) {
          const raw = yield* Effect.promise(() => cookie(id, PLATFORMS[id].idCookie));
          const userId = raw ? accountIdFromCookie(id, raw) : undefined;
          yield* settings.updatePlatform(id, (p) => {
            // A different account on the same session: the stored handle and picked Page belong to the old one.
            const switched = userId !== undefined && p.userId !== undefined && userId !== p.userId;
            const {
              assetId: _assetId,
              pages: _pages,
              ...rest
            } = switched ? { ...p, handle: "" } : p;
            return {
              ...rest,
              enabled: p.connectedAt ? p.enabled : true,
              connectedAt: p.connectedAt ?? new Date().toISOString(),
              ...(userId ? { userId } : {}),
            };
          });
          for (const listener of loginListeners) listener(id);
        }
        yield* events.publish({ type: "platforms" });
      });

    function session(id: ChannelId): Electron.Session {
      const p = PLATFORMS[id];
      const s = Electron.session.fromPartition(p.partition);
      if (!prepared.has(id)) {
        prepared.add(id);
        s.setUserAgent(plainChromeUserAgent(s.getUserAgent()));
        // Platform pages get nothing: no camera, mic, location, notifications or clipboard reads.
        s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
        s.setPermissionCheckHandler(() => false);
        s.cookies.on("changed", (_event, c) => {
          if (c.name === p.authCookie) Effect.runFork(refresh(id));
        });
      }
      return s;
    }

    const openWindow = (id: ChannelId, url: string, title: string) => {
      const p = PLATFORMS[id];
      session(id);
      const existing = windows.get(id);
      if (existing && !existing.isDestroyed()) {
        void existing.loadURL(url);
        existing.focus();
        return existing;
      }
      const w = new Electron.BrowserWindow({
        ...windowIcon(),
        width: 1180,
        height: 860,
        title,
        autoHideMenuBar: true,
        backgroundColor: "#ffffff",
        webPreferences: {
          partition: p.partition,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          spellcheck: false,
        },
      });
      // Sign-in popups ("Continue with Instagram") stay in this profile; other sites go to the system browser.
      w.webContents.setWindowOpenHandler(({ url: target }) => {
        if (platformForUrl(target) === id) {
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
      w.on("page-title-updated", (event, pageTitle) => {
        event.preventDefault();
        w.setTitle(`${title} · ${pageTitle}`);
      });
      w.on("closed", () => {
        windows.delete(id);
        Effect.runFork(refresh(id));
      });
      windows.set(id, w);
      void w.loadURL(url);
      return w;
    };

    const connect = (id: ChannelId) =>
      Effect.gen(function* () {
        const p = PLATFORMS[id];
        if (yield* isConnected(id)) {
          openWindow(id, p.homeUrl, p.name);
          return yield* view(id);
        }
        const w = openWindow(id, p.loginUrl, `Connect ${p.name}`);
        const s = session(id);
        // Close the window soon after the login cookie lands, so the user is back in Loud without hunting for it.
        const onCookie = (_e: unknown, c: Electron.Cookie, _cause: string, removed: boolean) => {
          if (c.name !== p.authCookie || removed) return;
          s.cookies.removeListener("changed", onCookie);
          setTimeout(() => {
            if (!w.isDestroyed()) w.close();
          }, WINDOW_CLOSE_DELAY_MS);
        };
        s.cookies.on("changed", onCookie);
        w.once("closed", () => s.cookies.removeListener("changed", onCookie));
        return yield* view(id);
      });

    const disconnect = (id: ChannelId) =>
      Effect.gen(function* () {
        const s = session(id);
        windows.get(id)?.close();
        yield* Effect.promise(() => s.clearStorageData());
        yield* Effect.promise(() => s.clearCache());
        yield* settings.updatePlatform(id, (p) => ({ enabled: false, handle: p.handle }));
        yield* events.publish({ type: "platforms" });
        return yield* view(id);
      });

    return Platforms.of({
      session,
      list: Effect.forEach(CHANNEL_IDS, view),
      view,
      connect,
      disconnect,
      openBrowser: (id, url) =>
        Effect.sync(() => void openWindow(id, url ?? PLATFORMS[id].homeUrl, PLATFORMS[id].name)),
      openLink: (url) =>
        Effect.sync(() => {
          const id = platformForUrl(url);
          if (id) openWindow(id, url, PLATFORMS[id].name);
          else if (/^https?:\/\//.test(url)) void Electron.shell.openExternal(url);
        }),
      onLogin: (listener) => void loginListeners.push(listener),
    });
  }),
);
