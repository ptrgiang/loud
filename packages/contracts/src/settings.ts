import * as Schema from "effect/Schema";

import { AgentSettings } from "./agent.ts";
import { ChannelId } from "./channel.ts";
import { FbPage } from "./platform.ts";
import { CollectionSettings } from "./collect.ts";
import { UpdateSettings } from "./updates.ts";

export const PlatformSettings = Schema.Struct({
  enabled: Schema.Boolean,
  /** Without the @. For Facebook, the Page name. */
  handle: Schema.String,
  /** The logged-in account's id, read from its session cookie. */
  userId: Schema.optionalKey(Schema.String),
  /** Facebook only: the Page's asset id in Meta Business Suite. */
  assetId: Schema.optionalKey(Schema.String),
  /** Facebook only: the Pages found for the account, to choose from. */
  pages: Schema.optionalKey(Schema.Array(FbPage)),
  connectedAt: Schema.optionalKey(Schema.String),
});
export type PlatformSettings = typeof PlatformSettings.Type;

export const Keywords = Schema.Record(Schema.String, Schema.Array(Schema.String));
export type Keywords = typeof Keywords.Type;

export const Settings = Schema.Struct({
  /** IANA zone. Every stamp in the data is wall-clock time in it. */
  timezone: Schema.String,
  /** YYYY-MM-DD. Posts before this day are ignored everywhere. */
  since: Schema.String,
  platforms: Schema.Record(ChannelId, PlatformSettings),
  keywords: Keywords,
  agent: AgentSettings,
  collection: CollectionSettings,
  updates: UpdateSettings,
});
export type Settings = typeof Settings.Type;

export const GeneralUpdate = Schema.Struct({
  timezone: Schema.optionalKey(Schema.String),
  since: Schema.optionalKey(Schema.String),
});
export type GeneralUpdate = typeof GeneralUpdate.Type;
