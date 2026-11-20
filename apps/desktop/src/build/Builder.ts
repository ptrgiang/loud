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
import * as NodePath from "node:path";

import { AppPaths } from "../app/AppPaths.ts";
import { EventBus } from "../app/EventBus.ts";
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
  writeJson(NodePath.join(src.data, "history", `${stamp.slice(0, 10)}.json`), history);
  return hub;
}

export const layer = Layer.effect(
  Builder,
  Effect.gen(function* () {
    const paths = yield* AppPaths;
    const settings = yield* SettingsStore;
    const events = yield* EventBus;

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
            Effect.as(Effect.logError("build failed", error), null as Hub | null),
          ),
        );
        if (hub) yield* events.publish({ type: "data" });
        return hub;
      }),
    });
  }),
);
