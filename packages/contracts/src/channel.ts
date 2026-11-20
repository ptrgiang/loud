import * as Schema from "effect/Schema";

export const CHANNEL_IDS = ["threads", "ig", "fb", "x"] as const;

export const ChannelId = Schema.Literals(CHANNEL_IDS);
export type ChannelId = typeof ChannelId.Type;

export const CHANNEL_NAMES: Record<ChannelId, string> = {
  threads: "Threads",
  ig: "Instagram",
  fb: "Facebook",
  x: "X",
};

/** Keys of the listening keyword lists. Facebook listens to video search, not posts. */
export const LISTEN_KEYS: Record<ChannelId, string> = {
  threads: "threads",
  ig: "ig",
  fb: "fb_video",
  x: "x",
};

/** Characters a post may hold, as the platform counts plain text. X counts any link as 23. */
export const CHANNEL_LIMITS: Record<ChannelId, number> = {
  threads: 500,
  ig: 2200,
  fb: 63206,
  x: 280,
};
