// Read side of the data folder: what the build wrote (hub.json), what the agent wrote (proposals.json, drafts.json) and the daily
// snapshots under history/. The dashboard only ever sees these through IPC, never the folder itself.
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { AppPaths } from "../app/AppPaths.ts";
import { EventBus } from "../app/EventBus.ts";

export interface DataStoreShape {
  readonly hub: Effect.Effect<unknown>;
  readonly proposals: Effect.Effect<unknown>;
  /** One row per day, oldest first: `{ day, ...snapshot }`. */
  readonly history: Effect.Effect<ReadonlyArray<unknown>>;
}

export class DataStore extends Context.Service<DataStore, DataStoreShape>()(
  "@loud/desktop/data/DataStore",
) {}

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(NodeFS.readFileSync(file, "utf8")) as unknown;
  } catch {
    return null;
  }
};

const WATCH_DEBOUNCE_MS = 400;

export const layer = Layer.effect(
  DataStore,
  Effect.gen(function* () {
    const paths = yield* AppPaths;
    const events = yield* EventBus;

    // Tell the dashboard to reload when a build or the agent rewrites a file. Writers rename into place, so a burst
    // of events arrives per write; one notice is enough.
    yield* Effect.sync(() => {
      try {
        NodeFS.mkdirSync(paths.data, { recursive: true });
        const timers: Partial<Record<"data" | "drafts", NodeJS.Timeout>> = {};
        const watcher = NodeFS.watch(paths.data, (_event, name) => {
          const type = name === "drafts.json" ? "drafts" : "data";
          if (name !== "hub.json" && name !== "proposals.json" && type !== "drafts") return;
          clearTimeout(timers[type]);
          timers[type] = setTimeout(
            () => Effect.runFork(events.publish({ type })),
            WATCH_DEBOUNCE_MS,
          );
        });
        watcher.unref();
      } catch {
        // No watching on this file system: the dashboard still reloads on focus.
      }
    });

    // Daily files are immutable once written; keep them parsed and re-read only what changed — focus reloads used to
    // re-parse hundreds of files every time.
    const dir = NodePath.join(paths.data, "history");
    const cache = new Map<string, { mtimeMs: number; row: object }>();

    return DataStore.of({
      hub: Effect.sync(() => readJson(NodePath.join(paths.data, "hub.json"))),
      proposals: Effect.sync(() => readJson(NodePath.join(paths.data, "proposals.json"))),
      history: Effect.sync(() => {
        let names: Array<string>;
        try {
          names = NodeFS.readdirSync(dir).filter((n) => n.endsWith(".json"));
        } catch {
          return [];
        }
        const live = new Set(names);
        for (const name of cache.keys()) if (!live.has(name)) cache.delete(name);
        return names.sort().flatMap((name) => {
          const file = NodePath.join(dir, name);
          const stat = NodeFS.statSync(file);
          const hit = cache.get(name);
          if (hit && hit.mtimeMs === stat.mtimeMs) return [{ day: name.slice(0, -5), ...hit.row }];
          const row = readJson(file);
          if (!row || typeof row !== "object") {
            cache.delete(name);
            return [];
          }
          cache.set(name, { mtimeMs: stat.mtimeMs, row });
          return [{ day: name.slice(0, -5), ...row }];
        });
      }),
    });
  }),
);
