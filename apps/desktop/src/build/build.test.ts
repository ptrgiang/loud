import type { ChannelFile, ListenFile } from "@loud/contracts";
import { describe, expect, it } from "vite-plus/test";

import { build, engagement } from "./build.ts";
import { formatStamp, parseStamp, stampFromUnix, wallClock } from "./time.ts";

const NOW = "2026-11-20 12:00";

const file = (over: Partial<ChannelFile> = {}): ChannelFile => ({
  collected: NOW,
  followers: 100,
  posts: [],
  scheduled: [],
  ...over,
});

const base = { now: NOW, since: "2026-10-01", timezone: "UTC", listen: null };

describe("time", () => {
  it("round-trips stamps without the host zone", () => {
    expect(formatStamp(parseStamp("2026-03-29 02:30")!)).toBe("2026-03-29 02:30");
    expect(parseStamp("nope")).toBeNull();
  });

  it("reads a wall clock in a zone", () => {
    const at = new Date(Date.UTC(2026, 10, 20, 17, 5));
    expect(wallClock(at, "America/New_York")).toBe("2026-11-20 12:05");
    expect(wallClock(at, "Not/AZone")).toBe("2026-11-20 17:05");
    expect(stampFromUnix(at.getTime() / 1000, "Asia/Ho_Chi_Minh")).toBe("2026-11-21 00:05");
  });
});

describe("build", () => {
  it("adds age and engagement, and drops posts before the start date", () => {
    const { hub } = build({
      ...base,
      channels: ["threads"],
      files: {
        threads: file({
          posts: [
            { id: "1", posted: "2026-11-19 12:00", views: 1000, likes: 40, replies: 10 },
            { id: "0", posted: "2026-09-01 12:00", views: 5 },
          ],
        }),
      },
    });
    expect(hub.posts).toHaveLength(1);
    expect(hub.posts[0]).toMatchObject({ channel: "threads", age_h: 24, eng: 5 });
  });

  it("keeps replies out of the summary", () => {
    const { hub } = build({
      ...base,
      channels: ["x"],
      files: {
        x: file({
          posts: [
            { id: "1", posted: "2026-11-18 12:00", views: 100, kind: "post" },
            { id: "2", posted: "2026-11-18 13:00", views: 900, kind: "reply" },
          ],
        }),
      },
    });
    expect(hub.channels[0]).toMatchObject({ posts_7d: 1, views_7d: 100, median_views_14d: 100 });
    expect(hub.channels[0]?.best_7d?.id).toBe("1");
  });

  it("flags a gap only when the queue was read empty", () => {
    const posts = [{ id: "1", posted: "2026-11-10 12:00", views: 100 }];
    const known = build({ ...base, channels: ["threads"], files: { threads: file({ posts }) } });
    const unknown = build({
      ...base,
      channels: ["threads"],
      files: { threads: file({ posts, scheduled_known: false }) },
    });
    expect(known.hub.flags[0]?.text).toContain("nothing scheduled");
    expect(unknown.hub.flags[0]?.text).toContain("could not be read");
  });

  it("praises posts at 3x the median", () => {
    const posts = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `${i}`,
        posted: "2026-11-15 12:00",
        views: 100,
      })),
      { id: "big", posted: "2026-11-16 12:00", views: 1200, text: "The big one\nsecond line" },
    ];
    const { hub } = build({ ...base, channels: ["fb"], files: { fb: file({ posts }) } });
    expect(hub.flags.find((f) => f.level === "good")?.text).toBe(
      "Facebook: a post beat 3x the median (1,200 vs 100): The big one",
    );
  });

  it("merges listening results found by several keywords", () => {
    const listen: ListenFile = {
      collected: NOW,
      items: [
        {
          channel: "x",
          query: "a",
          url: "https://x.com/u/status/1",
          posted: "2026-11-19 10:00",
          likes: 1,
        },
        {
          channel: "x",
          query: "b",
          url: "https://x.com/u/status/1",
          posted: "2026-11-19 10:00",
          likes: 1,
        },
        {
          channel: "ig",
          query: "a",
          url: "https://instagram.com/p/1",
          posted: "2026-11-19 10:00",
          likes: 9,
        },
        {
          channel: "x",
          query: "a",
          url: "https://x.com/u/status/2",
          posted: "2026-01-01 10:00",
          text: "old?",
        },
      ],
    };
    const { hub } = build({ ...base, channels: ["x"], files: {}, listen });
    expect(hub.listen.items.map((i) => i.query)).toEqual(["a, b"]);
  });

  it("writes one history row per channel", () => {
    const { history } = build({ ...base, channels: ["ig"], files: { ig: file({ followers: 7 }) } });
    expect(history).toEqual({
      at: NOW,
      channels: {
        ig: {
          followers: 7,
          posts_total: 0,
          posts_7d: 0,
          views_7d: 0,
          median_views_14d: null,
          scheduled: 0,
        },
      },
    });
  });

  it("leaves engagement unknown without views", () => {
    expect(engagement({ views: 0, likes: 3 })).toBeNull();
  });
});
