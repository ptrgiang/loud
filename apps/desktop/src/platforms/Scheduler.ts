// In-app scheduling: a draft's `scheduledAt` is Loud's own clock, not the platform's scheduler. Every minute the
// tick finds due drafts, opens the posting window and runs the publish — the post happens in a visible window.
// A draft that fails once this session is left for the user instead of being hammered.
import * as Effect from "effect/Effect";

import { readDrafts } from "../agent/drafts.ts";
import type { AppPathsShape } from "../app/AppPaths.ts";
import type { LogShape } from "../app/Log.ts";
import type { SettingsStoreShape } from "../settings/SettingsStore.ts";
import { PLATFORMS } from "./PlatformCatalog.ts";
import type { PlatformsShape } from "./Platforms.ts";
import type { PosterShape } from "./Poster.ts";

const TICK_MS = 60_000;

/** Reads due drafts once a minute; a failed draft is not retried until restart or a re-schedule. */
export const loop = (
  paths: AppPathsShape,
  poster: PosterShape,
  platforms: PlatformsShape,
  settings: SettingsStoreShape,
  log: LogShape,
) => {
  const tried = new Set<string>();
  const tick = Effect.gen(function* () {
    const s = yield* settings.get;
    if (!s.posting.auto) return;
    const now = Date.now();
    const due = readDrafts(paths.data).filter(
      (d) => d.scheduledAt && !d.posted && !tried.has(d.id) && Date.parse(d.scheduledAt) <= now,
    );
    for (const d of due) {
      tried.add(d.id);
      const p = PLATFORMS[d.channel];
      if ((yield* platforms.view(d.channel)).status !== "connected") {
        yield* Effect.sync(() => log.warn(`scheduled draft ${d.id}: ${p.name} is not connected`));
        continue;
      }
      // The window appearing on screen is the announcement; the pane shows the draft going out.
      yield* poster
        .open(d.id)
        .pipe(
          Effect.catch((e) =>
            Effect.sync(() => log.warn(`scheduled draft ${d.id}: open failed: ${e.message}`)),
          ),
        );
      yield* poster
        .publish(d.id)
        .pipe(
          Effect.catch((e) =>
            Effect.sync(() => log.warn(`scheduled draft ${d.id}: publish failed: ${e.message}`)),
          ),
        );
      yield* Effect.sync(() => log.info(`fired scheduled draft ${d.id} on ${d.channel}`));
    }
  });
  setInterval(() => {
    void Effect.runPromise(Effect.orDie(tick)).catch(() => undefined);
  }, TICK_MS);
};
