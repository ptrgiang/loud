import {
  CHANNEL_IDS,
  type ChannelId,
  LISTEN_KEYS,
  type Keywords,
  Settings,
  type PlatformSettings,
} from "@loud/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { AppPaths } from "../app/AppPaths.ts";

export const defaults = (): Settings => ({
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  since: new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10),
  platforms: Object.fromEntries(
    CHANNEL_IDS.map((id) => [id, { enabled: false, handle: "" } satisfies PlatformSettings]),
  ) as Settings["platforms"],
  keywords: Object.fromEntries(Object.values(LISTEN_KEYS).map((k) => [k, []])),
  agent: { enabled: false, provider: "claude", model: "", effort: "", playbook: "" },
  collection: {
    auto: false,
    everyHours: 12,
    keepInTray: false,
    launchAtLogin: false,
    rescanDays: 7,
  },
  updates: { check: false, channel: "latest" },
  usage: { share: null },
});

/** Trimmed, deduplicated, sorted lists for the known keys only. */
export const cleanKeywords = (kw: Keywords): Keywords =>
  Object.fromEntries(
    Object.values(LISTEN_KEYS).map((k) => [
      k,
      [...new Set((kw[k] ?? []).map((q) => q.trim()).filter(Boolean))].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      ),
    ]),
  );

const decode = Schema.decodeUnknownOption(Settings);

// A partial or older file still loads: it is laid over the defaults, then decoded as a whole.
export const parse = (raw: unknown): Settings => {
  const base = defaults();
  const o = raw && typeof raw === "object" ? (raw as Partial<Settings>) : {};
  const merged = {
    ...base,
    ...o,
    platforms: Object.fromEntries(
      CHANNEL_IDS.map((id) => [id, { ...base.platforms[id], ...o.platforms?.[id] }]),
    ),
    keywords: { ...base.keywords, ...o.keywords },
    agent: { ...base.agent, ...o.agent },
    collection: { ...base.collection, ...o.collection },
    updates: { ...base.updates, ...o.updates },
    usage: { ...base.usage, ...o.usage },
  };
  return Option.getOrElse(decode(merged), () => base);
};

export interface SettingsStoreShape {
  readonly get: Effect.Effect<Settings>;
  readonly update: (fn: (s: Settings) => Settings) => Effect.Effect<Settings>;
  readonly updatePlatform: (
    id: ChannelId,
    fn: (p: PlatformSettings) => PlatformSettings,
  ) => Effect.Effect<Settings>;
}

export class SettingsStore extends Context.Service<SettingsStore, SettingsStoreShape>()(
  "@loud/desktop/settings/SettingsStore",
) {}

export const layer = Layer.effect(
  SettingsStore,
  Effect.gen(function* () {
    const paths = yield* AppPaths;
    const file = NodePath.join(paths.home, "settings.json");
    let current = parse(
      yield* Effect.sync(() => {
        try {
          return JSON.parse(NodeFS.readFileSync(file, "utf8")) as unknown;
        } catch {
          return {};
        }
      }),
    );

    const write = (next: Settings) =>
      Effect.sync(() => {
        NodeFS.mkdirSync(paths.home, { recursive: true });
        // Write then rename: a crash mid-write must not leave a half file the next start decodes to defaults.
        NodeFS.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 1), "utf8");
        NodeFS.renameSync(`${file}.tmp`, file);
        current = next;
        return next;
      });

    const update = (fn: (s: Settings) => Settings) => write(parse(fn(current)));

    return SettingsStore.of({
      get: Effect.sync(() => current),
      update,
      updatePlatform: (id, fn) =>
        update((s) => ({ ...s, platforms: { ...s.platforms, [id]: fn(s.platforms[id]) } })),
    });
  }),
);
