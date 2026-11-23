// Usage reports: one small report a day to loud.trysometh.ing, only after the user said yes. It says that an install was
// used and whether collecting worked on each platform; it never carries a handle, a post, a number or anything typed.
import * as Schema from "effect/Schema";

import { ChannelId } from "./channel.ts";
import { COLLECT_STEPS, CollectStep } from "./collect.ts";

export const USAGE_ENDPOINT = "https://loud.trysometh.ing/api/usage";
/** Lists every field, how long it is kept, and the totals it adds up to. */
export const USAGE_PAGE = "https://loud.trysometh.ing/privacy";

export const UsageSettings = Schema.Struct({
  /** Null until the user answers the first-run question; nothing is sent before a yes. */
  share: Schema.NullOr(Schema.Boolean),
});
export type UsageSettings = typeof UsageSettings.Type;

export const StepTally = Schema.Struct({
  runs: Schema.Number,
  done: Schema.Number,
  failed: Schema.Number,
  /** Stopped by a login check, captcha or rate limit. */
  blocked: Schema.Number,
});
export type StepTally = typeof StepTally.Type;

export const PlatformUse = Schema.Struct({
  connected: Schema.Boolean,
  /** Included in Collect all and the timer. */
  included: Schema.Boolean,
});
export type PlatformUse = typeof PlatformUse.Type;

/** Exactly what is sent. The server stores it per install and UTC day; the sender's IP is kept only hashed, for a few days, to cap abuse. */
export const UsageReport = Schema.Struct({
  v: Schema.Literal(1),
  /** Random, made on this computer when sharing is first turned on; tied to nothing else. */
  install: Schema.String,
  version: Schema.String,
  os: Schema.Literals(["win32", "darwin", "linux"]),
  arch: Schema.String,
  platforms: Schema.Record(ChannelId, PlatformUse),
  /** Collection steps since the last report. */
  collect: Schema.Record(CollectStep, StepTally),
  agent: Schema.Boolean,
  updateChecks: Schema.Boolean,
});
export type UsageReport = typeof UsageReport.Type;

export const UsageStatus = Schema.Struct({
  share: Schema.NullOr(Schema.Boolean),
  /** False from source or with the demo data; the reason says why. */
  available: Schema.Boolean,
  reason: Schema.NullOr(Schema.String),
  endpoint: Schema.String,
  lastSent: Schema.NullOr(Schema.String),
});
export type UsageStatus = typeof UsageStatus.Type;

export const emptyTally = (): StepTally => ({ runs: 0, done: 0, failed: 0, blocked: 0 });
export const emptyCollect = () =>
  Object.fromEntries(COLLECT_STEPS.map((s) => [s, emptyTally()])) as Record<CollectStep, StepTally>;
