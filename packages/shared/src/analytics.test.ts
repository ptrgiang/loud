import type { Hub, ListenItem, Post } from "@loud/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  blockOf,
  callouts,
  engPer1k,
  keywordRows,
  lift,
  median,
  ratePer1k,
  safeUrl,
  settled,
  topAuthors,
} from "./analytics.ts";

const post = (over: Partial<Post>): Post => ({
  channel: "threads",
  id: Math.random().toString(36),
  posted: "2026-11-10 15:30",
  kind: "post",
  views: 100,
  age_h: 48,
  ...over,
});

describe("settled posts", () => {
  it("leaves out replies, young posts and posts without views", () => {
    const keep = post({});
    const list = [
      keep,
      post({ kind: "reply" }),
      post({ age_h: 23 }),
      post({ views: null }),
      post({ channel: "x" }),
    ];
    expect(settled(list, "threads")).toEqual([keep]);
  });
});

describe("medians", () => {
  it("ignores unknowns and averages the middle pair", () => {
    expect(median([3, null, 1, undefined, 2, 10])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("rates", () => {
  it("counts engagement per 1k views over the group", () => {
    expect(
      engPer1k([post({ views: 1000, likes: 30, replies: 5 }), post({ views: 1000, saves: 5 })]),
    ).toBe(20);
    expect(engPer1k([post({ views: 0 })])).toBeNull();
  });

  it("uses only posts that report the count", () => {
    const list = [post({ views: 1000, follows: 4 }), post({ views: 9000 })];
    expect(ratePer1k(list, "follows")).toBe(4);
    expect(ratePer1k([post({})], "follows")).toBeNull();
  });
});

describe("feature lift", () => {
  const q = (views: number) => post({ text: "Why?", views });
  const n = (views: number) => post({ text: "Shipped.", views });

  it("needs three posts on each side", () => {
    expect(lift([q(300), q(300), n(100), n(100), n(100)], (t) => t.includes("?")).ratio).toBeNull();
  });

  it("compares medians", () => {
    const r = lift([q(300), q(300), q(900), n(100), n(100), n(200)], (t) => t.includes("?"));
    expect(r.ratio).toBe(3);
    expect([r.withN, r.withoutN]).toEqual([3, 3]);
  });
});

describe("timing", () => {
  it("puts posts in 3-hour blocks and skips date-only Facebook posts", () => {
    expect(blockOf(post({ posted: "2026-11-10 17:59" }))).toBe(15);
    expect(blockOf(post({ channel: "fb", posted: "2026-11-07 00:00" }))).toBeNull();
    expect(blockOf(post({ posted: "2026-11-07 00:00" }))).toBe(0);
  });
});

describe("callouts", () => {
  const hub = (posts: ReadonlyArray<Post>): Hub => ({
    built: "2026-11-20 09:00",
    channels: [
      {
        id: "threads",
        name: "Threads",
        posts_total: posts.length,
        posts_7d: 0,
        views_7d: 0,
        median_views_14d: null,
        last_post: "",
        scheduled: 0,
        scheduled_known: true,
        best_7d: null,
      },
    ],
    posts,
    scheduled: [],
    flags: [],
    listen: { items: [] },
  });

  it("names a post that holds most of the views", () => {
    const list = [post({ views: 5000 }), ...Array.from({ length: 6 }, () => post({ views: 100 }))];
    expect(callouts(hub(list)).map((c) => c.kind)).toContain("concentration");
  });

  it("stays quiet under six settled posts", () => {
    expect(callouts(hub([post({ views: 5000 }), post({})]))).toEqual([]);
  });
});

describe("listening", () => {
  const item = (over: Partial<ListenItem>): ListenItem => ({
    channel: "x",
    query: "form builder",
    ...over,
  });

  it("splits merged keywords and sums per keyword", () => {
    const rows = keywordRows([
      item({ query: "form builder, typeform alternative", views: 100, question: true }),
      item({ views: 50 }),
    ]);
    expect(rows.map((r) => [r.query, r.posts, r.views, r.questions])).toEqual([
      ["form builder", 2, 150, 1],
      ["typeform alternative", 1, 100, 1],
    ]);
  });

  it("leaves views unknown when no post found for a keyword has a count", () => {
    const [row] = keywordRows([
      item({ channel: "threads", views: null }),
      item({ channel: "threads" }),
    ]);
    expect(row?.views).toBeNull();
  });

  it("ranks authors by score", () => {
    const rows = topAuthors([
      item({ author: "a", score: 1 }),
      item({ author: "b", score: 5 }),
      item({ author: "a", score: 1, query: "other" }),
    ]);
    expect(rows.map((r) => [r.author, r.posts, r.queries.length])).toEqual([
      ["b", 1, 1],
      ["a", 2, 2],
    ]);
  });
});

describe("links", () => {
  it("links only the platforms' own pages", () => {
    expect(safeUrl("https://www.threads.com/@acme/post/1")).not.toBeNull();
    expect(safeUrl("https://example.com/demo/listen/threads/19")).toBeNull();
    expect(safeUrl("javascript:alert(1)")).toBeNull();
  });
});
