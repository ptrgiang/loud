// Collection: reading the user's own posts and listening results through each platform's logged-in session.
import * as Schema from "effect/Schema";

import { ChannelId } from "./channel.ts";

export const CollectionSettings = Schema.Struct({
  /** Collect on a timer while the app runs. Off until the user turns it on. */
  auto: Schema.Boolean,
  everyHours: Schema.Number,
  /** Closing the window leaves Loud in the tray so the timer keeps running. */
  keepInTray: Schema.Boolean,
  /** The installed app starts at login, so the timer is running before the window is opened. */
  launchAtLogin: Schema.Boolean,
  /** After the first read from the start date, each run reads again only the posts of the last this many days. */
  rescanDays: Schema.Number,
});
export type CollectionSettings = typeof CollectionSettings.Type;

export const CollectionSettingsUpdate = Schema.Struct({
  auto: Schema.optionalKey(Schema.Boolean),
  everyHours: Schema.optionalKey(Schema.Number),
  keepInTray: Schema.optionalKey(Schema.Boolean),
  launchAtLogin: Schema.optionalKey(Schema.Boolean),
  rescanDays: Schema.optionalKey(Schema.Number),
});
export type CollectionSettingsUpdate = typeof CollectionSettingsUpdate.Type;

export const COLLECT_STEPS = ["threads", "ig", "fb", "x", "listen"] as const;
export const CollectStep = Schema.Literals(COLLECT_STEPS);
export type CollectStep = typeof CollectStep.Type;

export const StepState = Schema.Struct({
  step: CollectStep,
  status: Schema.Literals(["waiting", "running", "done", "skipped", "failed", "stopped"]),
  /** One line for the user: what was read, or why it stopped. */
  detail: Schema.String,
  /** Posts or results read in this step. */
  count: Schema.Number,
});
export type StepState = typeof StepState.Type;

export const CollectStatus = Schema.Struct({
  running: Schema.Boolean,
  started: Schema.NullOr(Schema.String),
  finished: Schema.NullOr(Schema.String),
  steps: Schema.Array(StepState),
  /** When the timer will start the next run; null when auto collection is off. */
  next: Schema.NullOr(Schema.String),
});
export type CollectStatus = typeof CollectStatus.Type;

export const CollectStart = Schema.Struct({
  steps: Schema.optionalKey(Schema.Array(CollectStep)),
  /** Re-read everything since the start date, not only the recent window. */
  full: Schema.optionalKey(Schema.Boolean),
});
export type CollectStart = typeof CollectStart.Type;

/** What the rate limiter allows per platform; persisted so a restart does not reset the daily count. */
export const BudgetView = Schema.Struct({
  id: ChannelId,
  usedToday: Schema.Number,
  dailyCap: Schema.Number,
  /** Set after a 429 or a checkpoint: no requests to this platform before then. */
  pausedUntil: Schema.NullOr(Schema.String),
  /** Why it is paused, in words. */
  reason: Schema.NullOr(Schema.String),
  /** Consecutive runs that stored no posts at all; a high count can mean the platform changed. */
  emptyRuns: Schema.Number,
});
export type BudgetView = typeof BudgetView.Type;
