// Fixtures are fictional and trimmed to the shapes docs/platform-notes.md describes.
import { describe, expect, it } from "vite-plus/test";

import { fbDate, fbPostCounts, pastWindow, readPlan, scrollFor } from "./collectors.ts";
import { embedded, parseLoose } from "./json.ts";
import { isCheckpoint } from "./PageReader.ts";
import {
  fbRows,
  igInfoOwned,
  igInsights,
  igMediaId,
  igProfile,
  igScheduled,
  mergePosts,
  threadsPostNumbers,
  threadsProfile,
  xScheduled,
  xTime,
  xTweets,
} from "./parse.ts";

const TZ = "UTC";

describe("json", () => {
  it("reads Meta's guarded and line-delimited answers", () => {
    expect(parseLoose('for (;;);{"a":1}')).toEqual([{ a: 1 }]);
    expect(parseLoose('{"a":1}\n{"b":2}\nnoise')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("parses only the embedded blocks that mention a key", () => {
    const html =
      '<script type="application/json">{"x":{"thread_items":[]}}</script><script type="application/json">{"y":1}</script>';
    expect(embedded(html, "thread_items")).toEqual([{ x: { thread_items: [] } }]);
  });
});

describe("Threads", () => {
  const post = (code: string, user: string, taken: number) => ({
    thread_items: [
      {
        post: {
          code,
          taken_at: taken,
          user: { username: user },
          like_count: 12,
          caption: { text: "Shipped conditional logic" },
          text_post_app_info: { direct_reply_count: 3, repost_count: 1, reshare_count: 0 },
        },
      },
    ],
  });

  it("keeps the handle's own root posts and the follower count", () => {
    const objs = [
      {
        data: {
          edges: [post("AAA", "acmeforms", 1_763_640_000), post("BBB", "someone", 1_763_640_000)],
        },
      },
      { user: { username: "acmeforms", follower_count: 520 } },
    ];
    const r = threadsProfile(objs, "acmeforms", TZ);
    expect(r.followers).toBe(520);
    expect(r.posts).toEqual([
      {
        id: "AAA",
        url: "https://www.threads.com/@acmeforms/post/AAA",
        posted: "2025-11-20 12:00",
        text: "Shipped conditional logic",
        kind: "post",
        likes: 12,
        replies: 3,
        reposts: 1,
        shares: 0,
      },
    ]);
  });

  it("takes a post whose user is only the profile's id", () => {
    const objs = [
      {
        edges: [
          { thread_items: [{ post: { code: "NEW", taken_at: 1_763_640_000, user: { pk: 42 } } }] },
        ],
      },
      {
        edges: [
          { thread_items: [{ post: { code: "OTHER", taken_at: 1_763_640_000, user: { pk: 7 } } }] },
        ],
      },
      { user: { username: "acmeforms", pk: "42", follower_count: 520 } },
    ];
    expect(threadsProfile(objs, "acmeforms", TZ).posts.map((p) => p.id)).toEqual(["NEW"]);
  });

  it("reads views and insights from a post page", () => {
    const objs = [
      { text_post_app_info: { impression_count: 1840 } },
      { reach_count: 1500, num_media_follows: 2, profile_visit_count: 20 },
      { code: "AAA", like_count: 61, text_post_app_info: { direct_reply_count: 12 } },
    ];
    expect(threadsPostNumbers(objs, "AAA")).toEqual({
      views: 1840,
      reach: 1500,
      follows: 2,
      visits: 20,
      likes: 61,
      replies: 12,
    });
  });
});

describe("Instagram", () => {
  it("turns a shortcode into the media id", () => {
    expect(igMediaId("B")).toBe("1");
    expect(igMediaId("BA")).toBe("64");
  });

  it("treats an empty insights result as unknown, not zero", () => {
    const objs = [
      {
        umapi_unified_total_content_views_count: { value: { results: [{ total_value: 900 }] } },
        umapi_saves_count: { value: { results: [] } },
      },
    ];
    expect(igInsights(objs)).toEqual({ views: 900 });
    expect(igInsights([{}])).toBeNull();
  });

  it("keeps the handle's own media and collabs, not suggested reels", () => {
    const media = (code: string, extra: object) => ({
      code,
      taken_at: 1_763_640_000,
      like_count: 4,
      media_type: 2,
      ...extra,
    });
    const objs = [
      {
        items: [
          media("OWN", { user: { username: "AcmeForms" } }),
          media("COLLAB", {
            user: { username: "friend" },
            coauthor_producers: [{ username: "acmeforms" }],
          }),
          media("SUGGESTED", { user: { username: "someone" }, owner: { username: "someone" } }),
          media("NOOWNER", {}),
        ],
      },
    ];
    expect(igProfile(objs, "acmeforms", TZ).map((r) => r.id)).toEqual(["OWN", "COLLAB"]);
    expect(igInfoOwned({ items: [{ user: { username: "someone" } }] }, "acmeforms")).toBe(false);
    expect(igInfoOwned({ items: [{ owner: { username: "acmeforms" } }] }, "acmeforms")).toBe(true);
    expect(igInfoOwned({ items: [{}] }, "acmeforms")).toBeNull();
  });

  it("tells an empty queue from an unreadable one", () => {
    expect(igScheduled([{ data: {} }], TZ)).toBeNull();
    expect(igScheduled([{ viewer: { all_scheduled_ig_content: [] } }], TZ)).toEqual([]);
  });
});

describe("Facebook", () => {
  it("reads Business Suite rows", () => {
    const objs = [
      {
        row_id: "111",
        header: {
          entity: {
            entity_info: { created_at: 1_763_640_000, title: "Demo reel", video: { id: "999" } },
          },
        },
        fields: {
          views: { renderer: { result: { value: 4200 } } },
          net_reactions: { renderer: { result: { value: 80 } } },
          date: { renderer: { is_scheduled: false } },
        },
      },
    ];
    const [r] = fbRows(objs, "AcmeForms", TZ);
    expect(r?.scheduled).toBe(false);
    expect(r?.row).toMatchObject({
      id: "111",
      url: "https://www.facebook.com/reel/999",
      kind: "reel",
      views: 4200,
      likes: 80,
    });
  });

  it("takes the post's own counts, the first match", () => {
    expect(
      fbPostCounts(
        '"reaction_count":{"count":7} "total_comment_count":2 "reaction_count":{"count":99}',
      ),
    ).toEqual({ likes: 7, replies: 2 });
  });

  it("reads Facebook's words for a date", () => {
    const now = new Date(Date.UTC(2026, 10, 20, 12, 0));
    expect(fbDate("3 hours ago", now, TZ)).toBe("2026-11-20 09:00");
    expect(fbDate("Yesterday at 9:12 AM", now, TZ)).toBe("2026-11-19 00:00");
    expect(fbDate("10 September", now, TZ)).toBe("2026-09-10 00:00");
    expect(fbDate("Dec 3", now, TZ)).toBe("2025-12-03 00:00");
    expect(fbDate("8 Mar 2024", now, TZ)).toBe("2024-03-08 00:00");
    expect(fbDate("whenever", now, TZ)).toBe("");
  });
});

describe("X", () => {
  it("reads X's time format in a zone", () => {
    expect(xTime("Wed Nov 19 15:19:00 +0000 2026", "Asia/Ho_Chi_Minh")).toBe("2026-11-19 22:19");
    expect(xTime("nope", TZ)).toBe("");
  });

  it("reads tweets, skipping reposts, and long-form text", () => {
    const tweet = (id: string, extra: object = {}) => ({
      rest_id: id,
      core: { user_results: { result: { core: { screen_name: "acmeforms" } } } },
      views: { count: "1200" },
      legacy: {
        created_at: "Wed Nov 19 15:19:00 +0000 2026",
        full_text: "short",
        favorite_count: 9,
        reply_count: 1,
        ...extra,
      },
    });
    const objs = [
      { a: tweet("1") },
      {
        b: { ...tweet("2"), note_tweet: { note_tweet_results: { result: { text: "long form" } } } },
      },
      { c: tweet("3", { retweeted_status_result: {} }) },
      { d: tweet("4", { in_reply_to_status_id_str: "1" }) },
    ];
    const t = xTweets(objs, TZ);
    expect(t.map((x) => [x.id, x.text, x.reply, x.views])).toEqual([
      ["1", "short", false, 1200],
      ["2", "long form", false, 1200],
      ["4", "short", true, 1200],
    ]);
  });

  it("reads the scheduled list", () => {
    const objs = [
      {
        viewer: {
          scheduled_tweet_list: [
            {
              scheduling_info: { execute_at: 1_763_726_400_000 },
              tweet_create_request: { status: "Queued" },
            },
          ],
        },
      },
    ];
    expect(xScheduled(objs, TZ)).toEqual([{ when: "2025-11-21 12:00", text: "Queued" }]);
    expect(xScheduled([{}], TZ)).toBeNull();
  });
});

describe("merge", () => {
  it("updates read posts, keeps the rest, drops posts before the start date", () => {
    const old = [
      { id: "a", posted: "2026-11-01 10:00", views: 5, likes: 1 },
      { id: "b", posted: "2026-11-02 10:00", views: 7 },
      { id: "z", posted: "2026-09-01 10:00", views: 1 },
    ];
    const fresh = [{ id: "a", posted: "2026-11-01 10:00", views: 50 }];
    expect(mergePosts(old, fresh, "2026-10-01")).toEqual([
      { id: "b", posted: "2026-11-02 10:00", views: 7 },
      { id: "a", posted: "2026-11-01 10:00", views: 50, likes: 1 },
    ]);
  });
});

describe("read plan", () => {
  const day = (n: number) =>
    `2026-${n < 31 ? "10" : "11"}-${String(n < 31 ? n : n - 30).padStart(2, "0")} 10:00`;
  const rows = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ id: `p${to - i}`, posted: day(to - i) }));

  it("stores every listed post of a full read, reading the newest 40", () => {
    // 50 posts from Oct 2 on, and two older ones that show the list went past the start date.
    const listed = [
      ...rows(2, 51),
      { id: "old1", posted: "2026-09-01 10:00" },
      { id: "old2", posted: "2026-09-02 10:00" },
    ];
    const plan = readPlan({ since: "2026-10-01", scanFrom: "2026-10-01", old: null }, listed);
    expect(plan.read).toHaveLength(40);
    expect(plan.read[0]!.id).toBe("p51");
    expect(plan.listedOnly.map((p) => p.id)).toEqual(rows(2, 11).map((p) => p.id));
  });

  it("does not stop at old pinned posts on top of the list", () => {
    const pinned = [{ posted: "2026-09-01 10:00" }, { posted: "2026-09-02 10:00" }];
    expect(pastWindow([...pinned, { posted: day(50) }], "2026-11-10")).toBe(false);
    expect(pastWindow([...pinned, { posted: day(50) }, ...pinned], "2026-11-10")).toBe(true);
  });

  it("keeps the first page's posts after the page has dropped them", async () => {
    // The newest posts are only in the first read; each scroll shows older ones and no longer the first page.
    const pages = [
      [
        { id: "p48", posted: day(48) },
        { id: "p47", posted: day(47) },
      ],
      [
        { id: "p40", posted: day(40) },
        { id: "p39", posted: day(39) },
      ],
    ];
    let n = 0;
    const reader = { more: async () => ({ url: "", html: "", objs: pages[n++] ?? [] }) };
    const rows = await scrollFor(
      reader,
      (objs) => objs as Array<{ id: string; posted: string }>,
      /x/,
      [
        { id: "p50", posted: day(50) },
        { id: "p49", posted: day(49) },
      ],
      day(41).slice(0, 10),
      5,
    );
    expect(rows.map((r) => r.id)).toEqual(["p50", "p49", "p48", "p47", "p40", "p39"]);
  });

  it("drops stored posts a complete list did not show", () => {
    const listed = [
      { id: "a", posted: day(5) },
      { id: "o1", posted: "2026-09-01 10:00" },
      { id: "o2", posted: "2026-09-02 10:00" },
    ];
    const old = {
      collected: "",
      followers: null,
      scheduled: [],
      scheduled_known: false,
      posts: [
        { id: "a", posted: day(5), views: 3 },
        { id: "x", posted: day(6), views: 9 },
      ],
    };
    const plan = readPlan({ since: "2026-10-01", scanFrom: "2026-10-01", old }, listed);
    expect(plan.old.map((p) => p.id)).toEqual(["a"]);
  });

  it("keeps stored posts when the list stopped early, and fills in missing views", () => {
    const listed = rows(40, 45);
    const old = {
      collected: "",
      followers: null,
      scheduled: [],
      scheduled_known: false,
      posts: [
        { id: "p10", posted: day(10) },
        { id: "p11", posted: day(11), views: 2 },
      ],
    };
    const plan = readPlan({ since: "2026-10-01", scanFrom: day(39).slice(0, 10), old }, listed);
    expect(plan.old).toHaveLength(2);
    expect(plan.read.map((p) => p.id)).toEqual([...listed.map((p) => p.id), "p10"]);
  });
});

describe("checkpoints", () => {
  it("spots a redirect to a login or check page, not a page that was asked for", () => {
    expect(
      isCheckpoint(
        "https://www.instagram.com/acme/",
        "https://www.instagram.com/accounts/login/?next=x",
      ),
    ).toBe(true);
    expect(isCheckpoint("https://x.com/acme", "https://x.com/account/access")).toBe(true);
    expect(
      isCheckpoint("https://www.facebook.com/x", "https://www.facebook.com/checkpoint/123"),
    ).toBe(true);
    expect(isCheckpoint("https://x.com/i/flow/login", "https://x.com/i/flow/login")).toBe(false);
    expect(isCheckpoint("https://x.com/acme", "https://x.com/acme")).toBe(false);
  });
});
