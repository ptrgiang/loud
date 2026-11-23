// Runs the build over the data folder: after a collection, on start, and when a setting that shapes the hub changes.
import {
  CHANNEL_IDS,
  type ChannelFile,
  type ChannelId,
  type Hub,
  type ListenFile,
} from "@loud/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { AppPaths } from "../app/AppPaths.ts";
import { EventBus } from "../app/EventBus.ts";
import { Log } from "../app/Log.ts";
import { DEMO_MARKER, type DemoMarker, readJson, writeJson } from "../data/files.ts";
import { SettingsStore } from "../settings/SettingsStore.ts";
import { build } from "./build.ts";
import { wallClock } from "./time.ts";

export interface BuilderShape {
  /** Null when nothing has been collected yet (no channel file and no listening file). */
  readonly build: Effect.Effect<Hub | null>;
}

export class Builder extends Context.Service<Builder, BuilderShape>()(
  "@loud/desktop/build/Builder",
) {}

export interface BuildSource {
  readonly data: string;
  readonly timezone: string;
  readonly since: string;
  readonly channels: ReadonlyArray<ChannelId>;
}

/** Daily snapshots older than this many days are pruned, so history/ stays bounded. */
const HISTORY_KEEP_DAYS = 400;

const pruneHistory = (dir: string, today: string) => {
  let names: Array<string>;
  try {
    names = NodeFS.readdirSync(dir);
  } catch {
    return;
  }
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - HISTORY_KEEP_DAYS * 864e5)
    .toISOString()
    .slice(0, 10);
  for (const name of names)
    if (name.endsWith(".json") && name.slice(0, 10) < cutoff)
      NodeFS.rmSync(NodePath.join(dir, name), { force: true });
};

/** Reads, builds and writes; returns null when there is nothing to build from. Usable outside Electron. */
export function buildFolder(src: BuildSource, now = new Date()): Hub | null {
  const files: Partial<Record<ChannelId, ChannelFile>> = {};
  for (const id of src.channels) {
    const f = readJson<ChannelFile>(NodePath.join(src.data, `${id}.json`));
    if (f && Array.isArray(f.posts)) files[id] = f;
  }
  const listen = readJson<ListenFile>(NodePath.join(src.data, "listen.json"));
  if (!Object.keys(files).length && !listen) return null;
  const stamp = wallClock(now, src.timezone);
  const { hub, history } = build({
    now: stamp,
    since: src.since,
    timezone: src.timezone,
    channels: src.channels,
    files,
    listen: listen && Array.isArray(listen.items) ? listen : null,
  });
  writeJson(NodePath.join(src.data, "hub.json"), hub);
  const day = stamp.slice(0, 10);
  writeJson(NodePath.join(src.data, "history", `${day}.json`), history);
  pruneHistory(NodePath.join(src.data, "history"), day);
  // Per-post numbers keyed by day, so each post's trend can be drawn later. Re-writes of the same day overwrite.
  for (const p of hub.posts) {
    const safe = p.id.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    if (!safe) continue;
    const file = NodePath.join(src.data, "history", "posts", `${p.channel}-${safe}.json`);
    const prev = readJson<Record<string, Record<string, number | null>>>(file) ?? {};
    writeJson(file, {
      ...prev,
      [day]: {
        views: p.views ?? null,
        likes: p.likes ?? null,
        replies: p.replies ?? null,
        reposts: p.reposts ?? null,
        quotes: p.quotes ?? null,
        shares: p.shares ?? null,
        saves: p.saves ?? null,
        eng: p.eng ?? null,
      },
    });
  }
  return hub;
}

export const layer = Layer.effect(
  Builder,
  Effect.gen(function* () {
    const paths = yield* AppPaths;
    const settings = yield* SettingsStore;
    const events = yield* EventBus;
    const log = yield* Log;

    const source = Effect.gen(function* () {
      // A demo folder carries its own zone and start date and shows every channel, whatever the settings say.
      const demo = readJson<DemoMarker>(NodePath.join(paths.data, DEMO_MARKER));
      if (demo?.demo)
        return {
          data: paths.data,
          timezone: demo.timezone,
          since: demo.since,
          channels: CHANNEL_IDS,
        };
      const s = yield* settings.get;
      return {
        data: paths.data,
        timezone: s.timezone,
        since: s.since,
        channels: CHANNEL_IDS.filter((id) => s.platforms[id].enabled),
      };
    });

    return Builder.of({
      build: Effect.gen(function* () {
        const src = yield* source;
        const hub = yield* Effect.try({
          try: () => buildFolder(src),
          catch: (error) => error,
        }).pipe(
          Effect.catch((error) =>
            Effect.as(
              Effect.sync(() =>
                log.warn(`build failed: ${error instanceof Error ? error.message : String(error)}`),
              ),
              null as Hub | null,
            ),
          ),
        );
        if (hub) yield* events.publish({ type: "data" });
        return hub;
      }),
    });
  }),
);
