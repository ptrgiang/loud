// The one door from the dashboard into the desktop process. Every call names a method from the contracts, its input is
// decoded against that method's schema, and only the main window's own page may knock.
import {
  type AppInfo,
  CHANNEL_IDS,
  type Hub,
  IPC_INVOKE_CHANNEL,
  type IpcInput,
  type IpcMethod,
  IpcMethods,
  type IpcOutput,
  type IpcResult,
} from "@loud/contracts";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Electron from "electron";

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { Agent } from "../agent/Agent.ts";
import { deleteDraft, readDrafts, upsertDraft } from "../agent/tools.ts";
import { AppPaths } from "../app/AppPaths.ts";
import { EventBus } from "../app/EventBus.ts";
import { Updater } from "../app/Updater.ts";
import { Usage } from "../app/Usage.ts";
import { Builder } from "../build/Builder.ts";
import { Collector } from "../collect/Collector.ts";
import { APP_ORIGIN, BRAND } from "../brand.ts";
import { DataStore } from "../data/DataStore.ts";
import { postsCsv } from "../data/exportCsv.ts";
import { DEMO_MARKER } from "../data/files.ts";
import { assetIdFrom } from "../platforms/PlatformCatalog.ts";
import { Platforms } from "../platforms/Platforms.ts";
import { cleanKeywords, SettingsStore } from "../settings/SettingsStore.ts";

type Handlers = { readonly [M in IpcMethod]: (input: IpcInput<M>) => Effect.Effect<IpcOutput<M>> };

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isZone = (s: string) => {
  try {
    // Throws a RangeError for a zone this runtime does not know.
    return Boolean(new Intl.DateTimeFormat("en", { timeZone: s }).resolvedOptions().timeZone);
  } catch {
    return false;
  }
};

export const install = (isMainFrame: (frame: Electron.WebFrameMain | null) => boolean) =>
  Effect.gen(function* () {
    const settings = yield* SettingsStore;
    const platforms = yield* Platforms;
    const data = yield* DataStore;
    const events = yield* EventBus;
    const paths = yield* AppPaths;
    const builder = yield* Builder;
    const agent = yield* Agent;
    const collector = yield* Collector;
    const updater = yield* Updater;
    const usage = yield* Usage;

    // The time zone, start date and enabled platforms shape the hub: rebuild in the background after they change.
    const rebuild = Effect.asVoid(Effect.forkDetach(builder.build));

    const appInfo = Effect.gen(function* () {
      const s = yield* settings.get;
      return {
        name: BRAND.name,
        tagline: BRAND.tagline,
        version: Electron.app.getVersion(),
        demo: NodeFS.existsSync(NodePath.join(paths.data, DEMO_MARKER)),
        timezone: s.timezone,
        since: s.since,
        channels: CHANNEL_IDS.filter((id) => s.platforms[id].enabled).map((id) => ({
          id,
          label: s.platforms[id].handle || id,
        })),
      } satisfies AppInfo;
    });

    const handlers: Handlers = {
      "app.info": () => appInfo,
      "settings.updateGeneral": (input) =>
        Effect.gen(function* () {
          yield* settings.update((s) => ({
            ...s,
            ...(input.timezone !== undefined && isZone(input.timezone)
              ? { timezone: input.timezone }
              : {}),
            ...(input.since !== undefined && isDate(input.since) ? { since: input.since } : {}),
          }));
          yield* events.publish({ type: "settings" });
          yield* rebuild;
          return yield* appInfo;
        }),
      "platforms.list": () => platforms.list,
      "platforms.connect": ({ id }) => platforms.connect(id),
      "platforms.disconnect": ({ id }) => platforms.disconnect(id),
      "platforms.openBrowser": ({ id }) => Effect.as(platforms.openBrowser(id), {}),
      "platforms.update": ({ id, ...patch }) =>
        Effect.gen(function* () {
          yield* settings.updatePlatform(id, (p) => ({
            ...p,
            ...patch,
            ...(patch.handle !== undefined
              ? { handle: patch.handle.trim().replace(/^@/, "") }
              : {}),
            ...(patch.assetId !== undefined ? { assetId: assetIdFrom(patch.assetId) } : {}),
          }));
          yield* events.publish({ type: "settings" });
          if (patch.enabled !== undefined) yield* rebuild;
          return yield* platforms.view(id);
        }),
      "platforms.detect": ({ id }) =>
        Effect.gen(function* () {
          yield* collector.detect(id);
          return yield* platforms.view(id);
        }),
      "keywords.get": () => Effect.map(settings.get, (s) => s.keywords),
      "keywords.set": (input) =>
        Effect.map(
          settings.update((s) => ({ ...s, keywords: cleanKeywords(input) })),
          (s) => s.keywords,
        ),
      "data.hub": () => data.hub,
      "data.proposals": () => data.proposals,
      "data.history": () => data.history,
      "links.open": ({ url }) => Effect.as(platforms.openLink(url), {}),
      "data.exportPosts": () =>
        Effect.gen(function* () {
          const hub = (yield* data.hub) as Hub | null;
          if (!hub) return yield* Effect.die(new Error("Nothing to export yet."));
          const file = NodePath.join(
            paths.data,
            "exports",
            `posts-${hub.built.replace(/\D/g, "").slice(0, 12)}.csv`,
          );
          yield* Effect.sync(() => {
            NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
            NodeFS.writeFileSync(file, postsCsv(hub), "utf8");
            Electron.shell.showItemInFolder(file);
          });
          return { file };
        }),
      "collect.status": () => collector.status,
      "collect.start": (input) => Effect.orDie(collector.start(input)),
      "collect.cancel": () => collector.cancel,
      "collect.budgets": () => collector.budgets,
      "collect.resume": ({ id }) => collector.resume(id),
      "collect.settings": () => Effect.map(settings.get, (s) => s.collection),
      "collect.configure": (input) =>
        Effect.gen(function* () {
          const s = yield* settings.update((s) => ({
            ...s,
            collection: {
              ...s.collection,
              ...input,
              ...(input.everyHours !== undefined
                ? { everyHours: Math.min(168, Math.max(3, Math.round(input.everyHours))) }
                : {}),
              ...(input.rescanDays !== undefined
                ? { rescanDays: Math.min(60, Math.max(1, Math.round(input.rescanDays))) }
                : {}),
            },
          }));
          yield* collector.reschedule;
          return s.collection;
        }),
      "agent.providers": () => agent.providers,
      "agent.settings": () => Effect.map(settings.get, (s) => s.agent),
      "agent.configure": (input) =>
        Effect.map(
          settings.update((s) => ({
            ...s,
            agent: {
              ...s.agent,
              ...input,
              ...(input.playbook !== undefined ? { playbook: input.playbook.slice(0, 8000) } : {}),
            },
          })),
          (s) => s.agent,
        ),
      "agent.state": () => agent.state,
      "agent.send": ({ text, files }) => Effect.orDie(agent.send(text, files)),
      "agent.cancel": () => agent.cancel,
      "agent.reset": () => Effect.orDie(agent.reset),
      "agent.select": (input) => Effect.orDie(agent.select(input)),
      "agent.chats": () => agent.chats,
      "agent.open": ({ id }) => Effect.orDie(agent.open(id)),
      "agent.delete": ({ id }) => Effect.orDie(agent.remove(id)),
      "agent.attachment": ({ chatId, id }) => Effect.orDie(agent.attachment(chatId, id)),
      "agent.usage": ({ refresh }) => agent.usage(refresh),
      "drafts.list": () => Effect.sync(() => readDrafts(paths.data)),
      "drafts.save": (input) =>
        Effect.sync(() =>
          upsertDraft(
            paths.data,
            { ...input, text: input.text.slice(0, 70_000) },
            "you",
            new Date(),
          ),
        ),
      "drafts.delete": ({ id }) =>
        Effect.as(
          Effect.sync(() => deleteDraft(paths.data, id)),
          {},
        ),
      "updates.settings": () => Effect.map(settings.get, (s) => s.updates),
      "updates.configure": (input) =>
        Effect.gen(function* () {
          const s = yield* settings.update((s) => ({ ...s, updates: { ...s.updates, ...input } }));
          yield* updater.reschedule;
          return s.updates;
        }),
      "updates.status": () => updater.status,
      "updates.check": () => updater.check,
      "updates.install": () => Effect.as(updater.install, {}),
      "usage.status": () => usage.status,
      "usage.configure": ({ share }) => usage.configure(share),
      "usage.preview": () => usage.preview,
    };

    const run = async (method: unknown, input: unknown): Promise<IpcResult<unknown>> => {
      if (typeof method !== "string" || !Object.hasOwn(IpcMethods, method)) {
        return { ok: false, error: `Unknown method: ${String(method)}` };
      }
      const m = method as IpcMethod;
      const decoded = Schema.decodeUnknownResult(IpcMethods[m].input)(input ?? {});
      if (Result.isFailure(decoded)) return { ok: false, error: decoded.failure.message };
      const handler = handlers[m] as (input: unknown) => Effect.Effect<unknown>;
      try {
        return { ok: true, value: await Effect.runPromise(handler(decoded.success)) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    yield* Effect.sync(() =>
      Electron.ipcMain.handle(IPC_INVOKE_CHANNEL, (event, method: unknown, input: unknown) => {
        if (
          !isMainFrame(event.senderFrame) ||
          !event.senderFrame?.url.startsWith(`${APP_ORIGIN}/`)
        ) {
          return { ok: false, error: "Forbidden" } satisfies IpcResult<never>;
        }
        return run(method, input);
      }),
    );
  });
