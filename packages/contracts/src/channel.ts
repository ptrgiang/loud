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

/** X Premium (blue check, Business or Government verified) posts run to 25,000. */
export const X_PREMIUM_LIMIT = 25_000;

/** Where the user posts it themselves. X takes the text in its share intent; Threads opens its home (the intent dialog has no media, reply or community controls); Instagram and Facebook open the composer. */
export const composerUrl = (id: ChannelId, text: string): string =>
  ({
    x: `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
    threads: "https://www.threads.com/",
    ig: "https://www.instagram.com/",
    fb: "https://business.facebook.com/latest/composer",
  })[id];
