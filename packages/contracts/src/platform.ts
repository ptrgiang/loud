import * as Schema from "effect/Schema";

import { ChannelId } from "./channel.ts";

export const PlatformStatus = Schema.Literals(["connected", "disconnected"]);
export type PlatformStatus = typeof PlatformStatus.Type;

/** A Facebook Page the account manages; `id` is its Business Suite asset id. */
export const FbPage = Schema.Struct({ id: Schema.String, name: Schema.String });
export type FbPage = typeof FbPage.Type;

export const PlatformView = Schema.Struct({
  id: ChannelId,
  name: Schema.String,
  status: PlatformStatus,
  enabled: Schema.Boolean,
  handle: Schema.String,
  userId: Schema.optionalKey(Schema.String),
  assetId: Schema.optionalKey(Schema.String),
  pages: Schema.optionalKey(Schema.Array(FbPage)),
  connectedAt: Schema.optionalKey(Schema.String),
});
export type PlatformView = typeof PlatformView.Type;

export const PlatformUpdate = Schema.Struct({
  id: ChannelId,
  enabled: Schema.optionalKey(Schema.Boolean),
  handle: Schema.optionalKey(Schema.String),
  assetId: Schema.optionalKey(Schema.String),
});
export type PlatformUpdate = typeof PlatformUpdate.Type;
