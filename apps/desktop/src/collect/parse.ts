// Per-platform parsers: captured JSON (embedded in a page, or answers the page fetched) to Loud's post and listening
// rows. Pure, so they are tested against fictional fixtures; docs/platform-notes.md maps where each field lives.
import type { CollectedListenItem, CollectedPost } from "@loud/contracts";

import { stampFromUnix, wallClock } from "../build/time.ts";
import { countFromText, get, isObj, num, text, walk } from "./json.ts";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
export type Row = Mutable<CollectedPost>;
export type ListenRow = Mutable<CollectedListenItem>;

/** Leave unknown numbers out instead of writing 0 (zero means "measured, none"). */
const put = <K extends keyof Row>(row: Row, key: K, v: Row[K] | null | undefined) => {
  if (v !== null && v !== undefined) row[key] = v;
};

// ---- Threads ----

/** Ids come as strings or numbers depending on the answer. */
const idText = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export interface ThreadsProfile {
  readonly posts: Array<Row>;
  readonly followers: number | null;
}

const threadsPost = (p: Record<string, unknown>, tz: string) => {
  const info = isObj(p.text_post_app_info) ? p.text_post_app_info : {};
  return {
    code: text(p.code),
    user: text(get(p, "user", "username")),
    userId: idText(get(p, "user", "pk")) || idText(get(p, "user", "id")),
    posted: num(p.taken_at) !== null ? stampFromUnix(num(p.taken_at)!, tz) : "",
    text: text(get(p, "caption", "text")).slice(0, 600),
    likes: num(p.like_count),
    replies: num(info.direct_reply_count),
    reposts: num(info.repost_count),
    shares: num(info.reshare_count),
    quotes: num(info.quote_count),
  };
};

/** Root posts of `handle` from the profile page's embedded JSON and the answers it loads while scrolling. */
export function threadsProfile(
  objs: ReadonlyArray<unknown>,
  handle: string,
  tz: string,
): ThreadsProfile {
  const u = walk(
    objs,
    (o) =>
      text(o.username).toLowerCase() === handle.toLowerCase() && num(o.follower_count) !== null,
  )[0];
  const ownerId = u ? idText(u.pk) || idText(u.id) : "";
  // A post's user can arrive as an id only; it is the handle's when that id is the profile's.
  const mine = (r: ReturnType<typeof threadsPost>) =>
    r.user ? r.user.toLowerCase() === handle.toLowerCase() : ownerId !== "" && r.userId === ownerId;
  const posts = new Map<string, Row>();
  for (const t of walk(objs, (o) => Array.isArray(o.thread_items))) {
    const first = (t.thread_items as Array<unknown>)[0];
    const p = get(first, "post");
    if (!isObj(p)) continue;
    const r = threadsPost(p, tz);
    if (!r.code || !mine(r) || posts.has(r.code)) continue;
    const row: Row = {
      id: r.code,
      url: `https://www.threads.com/@${handle}/post/${r.code}`,
      posted: r.posted,
      text: r.text,
      kind: "post",
    };
    put(row, "likes", r.likes);
    put(row, "replies", r.replies);
    put(row, "reposts", r.reposts);
    put(row, "shares", r.shares);
    put(row, "quotes", r.quotes);
    posts.set(r.code, row);
  }
  return { posts: [...posts.values()], followers: u ? num(u.follower_count) : null };
}

const firstNum = (objs: ReadonlyArray<unknown>, key: string) => {
  const o = walk(objs, (x) => num(x[key]) !== null)[0];
  return o ? num(o[key]) : null;
};

/** A post page: views and insights (only shown to the author) plus fresh counts. */
export function threadsPostNumbers(objs: ReadonlyArray<unknown>, code: string): Partial<Row> {
  const p = walk(objs, (o) => o.code === code && num(o.like_count) !== null)[0];
  const info = isObj(p?.text_post_app_info) ? p.text_post_app_info : {};
  const out: Row = { id: code };
  put(out, "views", firstNum(objs, "impression_count"));
  put(out, "reach", firstNum(objs, "reach_count"));
  put(out, "follows", firstNum(objs, "num_media_follows"));
  put(out, "visits", firstNum(objs, "profile_visit_count"));
  put(out, "likes", num(p?.like_count));
  put(out, "replies", num(info.direct_reply_count));
  put(out, "reposts", num(info.repost_count));
  put(out, "shares", num(info.reshare_count));
  put(out, "quotes", num(info.quote_count));
  const { id: _id, ...rest } = out;
  return rest;
}

export function threadsSearch(
  objs: ReadonlyArray<unknown>,
  query: string,
  tz: string,
): Array<ListenRow> {
  const results = walk(objs, (o) => isObj(o.searchResults)).map((o) => o.searchResults);
  const out = new Map<string, ListenRow>();
  for (const t of walk(results, (o) => Array.isArray(o.thread_items))) {
    const p = get((t.thread_items as Array<unknown>)[0], "post");
    if (!isObj(p)) continue;
    const r = threadsPost(p, tz);
    if (!r.code || out.has(r.code)) continue;
    const row: ListenRow = {
      channel: "threads",
      query,
      url: `https://www.threads.com/@${r.user}/post/${r.code}`,
      author: r.user,
      posted: r.posted,
      text: r.text.slice(0, 400),
    };
    if (r.likes !== null) row.likes = r.likes;
    if (r.replies !== null) row.replies = r.replies;
    if (r.reposts !== null) row.reposts = r.reposts;
    if (r.shares !== null) row.shares = r.shares;
    out.set(r.code, row);
  }
  return [...out.values()];
}

// ---- Instagram ----

const A64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Shortcode to the numeric media id the APIs want. */
export const igMediaId = (code: string): string => {
  let n = 0n;
  for (const ch of code) n = n * 64n + BigInt(A64.indexOf(ch));
  return n.toString();
};

/** Usernames a media item belongs to: its author, owner and collab co-authors. */
const igOwners = (m: Record<string, unknown>): Array<string> => {
  const names = [text(get(m, "user", "username")), text(get(m, "owner", "username"))];
  const co = m.coauthor_producers;
  if (Array.isArray(co)) for (const c of co) names.push(text(get(c, "username")));
  return names.filter(Boolean).map((n) => n.toLowerCase());
};

/** True when the item is the handle's own or a collab it is part of; false for someone else's. */
export const igOwnedBy = (m: Record<string, unknown>, handle: string): boolean =>
  igOwners(m).includes(handle.toLowerCase());

/**
 * The handle's own posts. The profile page also loads suggested reels and other accounts' media with the same
 * shape, so an item without the handle among its owners is left out.
 */
export function igProfile(objs: ReadonlyArray<unknown>, handle: string, tz: string): Array<Row> {
  const out = new Map<string, Row>();
  for (const m of walk(
    objs,
    (o) => !!text(o.code) && num(o.taken_at) !== null && "like_count" in o,
  )) {
    const code = text(m.code);
    if (out.has(code) || !igOwnedBy(m, handle)) continue;
    const reel = num(m.media_type) === 2;
    const row: Row = {
      id: code,
      url: `https://www.instagram.com/${reel ? "reel" : "p"}/${code}/`,
      posted: stampFromUnix(num(m.taken_at)!, tz),
      text: text(get(m, "caption", "text")).slice(0, 600),
      kind: reel ? "reel" : "post",
    };
    put(row, "likes", num(m.like_count));
    put(row, "replies", num(m.comment_count));
    put(row, "views", num(m.play_count) ?? num(m.ig_play_count) ?? num(m.view_count));
    out.set(code, row);
  }
  return [...out.values()];
}

/** `/api/v1/media/{id}/info/`: null when the answer has no owner to check. */
export function igInfoOwned(body: unknown, handle: string): boolean | null {
  const m = get(body, "items");
  const it = Array.isArray(m) ? m[0] : undefined;
  if (!isObj(it) || !igOwners(it).length) return null;
  return igOwnedBy(it, handle);
}

/** `/api/v1/media/{id}/info/`. */
export function igMediaInfo(body: unknown): Partial<Row> {
  const m = get(body, "items");
  const it = Array.isArray(m) ? m[0] : undefined;
  if (!isObj(it)) return {};
  const out: Row = { id: "" };
  put(out, "views", num(it.play_count) ?? num(it.ig_play_count));
  put(out, "shares", num(it.reshare_count) ?? num(it.media_repost_count));
  put(out, "dur", num(it.video_duration));
  put(out, "likes", num(it.like_count));
  put(out, "replies", num(it.comment_count));
  const { id: _id, ...rest } = out;
  return rest;
}

const IG_INSIGHTS: ReadonlyArray<readonly [keyof Row, string]> = [
  ["views", "umapi_unified_total_content_views_count"],
  ["reach", "umapi_media_organic_account_reach_or_promoted_people_based_reach"],
  ["viewers", "umapi_content_meta_viewers_count"],
  ["saves", "umapi_saves_count"],
  ["shares", "umapi_reshares_count"],
  ["follows", "umapi_follows_from_impressions_count"],
  ["visits", "umapi_profile_views_from_impressions_count"],
];

/** The insights page's answer. Null when it is not there yet: `results: []` means "no result yet", not zero. */
export function igInsights(objs: ReadonlyArray<unknown>): Partial<Row> | null {
  const o = walk(objs, (x) => "umapi_unified_total_content_views_count" in x)[0];
  if (!o) return null;
  const out: Row = { id: "" };
  for (const [key, field] of IG_INSIGHTS) {
    const results = get(o, field, "value", "results");
    const first = Array.isArray(results) ? results[0] : undefined;
    put(out, key, num(get(first, "total_value")));
  }
  const { id: _id, ...rest } = out;
  return rest;
}

export interface Queued {
  when: string;
  text: string;
}

/** Null when the answer that lists the queue never came: unknown, not empty. */
export function igScheduled(objs: ReadonlyArray<unknown>, tz: string): Array<Queued> | null {
  if (!walk(objs, (o) => "all_scheduled_ig_content" in o).length) return null;
  const seen = new Set<string>();
  const out: Array<Queued> = [];
  for (const o of walk(objs, (x) => num(x.scheduled_publish_time) !== null)) {
    const t = (text(o.caption_text) || text(get(o, "caption", "text"))).slice(0, 400);
    const key = `${String(o.scheduled_publish_time)}|${t.slice(0, 60)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ when: stampFromUnix(num(o.scheduled_publish_time)!, tz), text: t });
  }
  return out.sort((a, b) => a.when.localeCompare(b.when));
}

export function igSearch(
  objs: ReadonlyArray<unknown>,
  query: string,
  tz: string,
): Array<ListenRow> {
  const out = new Map<string, ListenRow>();
  for (const m of walk(
    objs,
    (o) => !!text(o.code) && num(o.taken_at) !== null && "like_count" in o && isObj(o.user),
  )) {
    const code = text(m.code);
    if (out.has(code)) continue;
    const row: ListenRow = {
      channel: "ig",
      query,
      url: `https://www.instagram.com/p/${code}/`,
      author: text(get(m, "user", "username")),
      posted: stampFromUnix(num(m.taken_at)!, tz),
      text: text(get(m, "caption", "text")).slice(0, 400),
    };
    const likes = num(m.like_count);
    const replies = num(m.comment_count);
    const views = num(m.play_count) ?? num(m.ig_play_count) ?? num(m.view_count);
    if (likes !== null) row.likes = likes;
    if (replies !== null) row.replies = replies;
    if (views !== null) row.views = views;
    out.set(code, row);
  }
  return [...out.values()];
}

// ---- Facebook (Meta Business Suite) ----

const cell = (fields: unknown, key: string): unknown => {
  const r = get(fields, key, "renderer");
  const v = get(r, "result", "value");
  return v !== undefined ? v : get(r, "date_time");
};

export interface FbRow {
  readonly row: Row;
  readonly scheduled: boolean;
}

/** Rows of Business Suite's content table (`tofu_unified_table`), on the Published or Scheduled page. */
export function fbRows(objs: ReadonlyArray<unknown>, page: string, tz: string): Array<FbRow> {
  const out = new Map<string, FbRow>();
  for (const r of walk(objs, (o) => !!text(o.row_id) && isObj(o.header) && isObj(o.fields))) {
    const id = text(r.row_id);
    if (out.has(id)) continue;
    const e = get(r, "header", "entity", "entity_info");
    const f = r.fields;
    const created = num(get(e, "created_at")) ?? num(cell(f, "date"));
    const video = text(get(e, "video", "id"));
    const owner = text(get(e, "owner", "entity_id")) || page;
    const row: Row = {
      id,
      url: video
        ? `https://www.facebook.com/reel/${video}`
        : `https://www.facebook.com/${owner}/posts/${id}`,
      posted: created !== null ? stampFromUnix(created, tz) : "",
      text: text(get(e, "title")).slice(0, 600),
      kind: video ? "reel" : "post",
    };
    put(row, "dur", num(get(e, "video_duration_in_sec")));
    put(row, "views", num(cell(f, "views")));
    put(row, "viewers", num(cell(f, "viewers")));
    put(row, "likes", num(cell(f, "net_reactions")));
    put(row, "replies", num(cell(f, "net_comments")));
    put(row, "shares", num(cell(f, "shares")));
    put(row, "saves", num(cell(f, "net_saves")));
    put(row, "follows", num(cell(f, "new_follows")));
    out.set(id, { row, scheduled: get(f, "date", "renderer", "is_scheduled") === true });
  }
  return [...out.values()];
}

/** Profile changes are posts too on Facebook; they are not the user's content. */
export const fbIsProfileChange = (t: string) =>
  /updated (their|the) (cover photo|profile picture)/i.test(t);

export function fbFollowers(html: string): number | null {
  const m = /"follower_count":(\d+)/.exec(html) ?? /([\d.,]+[KkMm]?) followers/.exec(html);
  return m ? countFromText(m[1]!) : null;
}

// ---- X ----

/** "Wed Nov 19 15:19:00 +0000 2026" as a stamp in `tz`. */
export function xTime(s: string, tz: string): string {
  const m = /^\w{3} (\w{3}) (\d{1,2}) (\d\d:\d\d:\d\d) ([+-]\d{4}) (\d{4})$/.exec(s);
  if (!m) return "";
  const d = new Date(`${m[1]} ${m[2]} ${m[5]} ${m[3]} GMT${m[4]}`);
  return Number.isNaN(d.getTime()) ? "" : wallClock(d, tz);
}

export interface Tweet {
  readonly id: string;
  readonly user: string;
  readonly posted: string;
  readonly text: string;
  readonly reply: boolean;
  readonly views: number | null;
  readonly likes: number | null;
  readonly replies: number | null;
  readonly reposts: number | null;
  readonly quotes: number | null;
  readonly saves: number | null;
}

export function xTweets(objs: ReadonlyArray<unknown>, tz: string): Array<Tweet> {
  const out = new Map<string, Tweet>();
  for (const t of walk(
    objs,
    (o) =>
      !!text(o.rest_id) &&
      isObj(o.legacy) &&
      !!text(o.legacy.created_at) &&
      "full_text" in o.legacy,
  )) {
    const L = t.legacy as Record<string, unknown>;
    if (L.retweeted_status_result) continue;
    const id = text(t.rest_id);
    if (out.has(id)) continue;
    const ur = get(t, "core", "user_results", "result");
    const user = text(get(ur, "core", "screen_name")) || text(get(ur, "legacy", "screen_name"));
    const note = text(get(t, "note_tweet", "note_tweet_results", "result", "text"));
    const views = get(t, "views", "count");
    out.set(id, {
      id,
      user,
      posted: xTime(text(L.created_at), tz),
      text: (note || text(L.full_text)).slice(0, 600),
      reply: !!text(L.in_reply_to_status_id_str),
      views: num(views),
      likes: num(L.favorite_count),
      replies: num(L.reply_count),
      reposts: num(L.retweet_count),
      quotes: num(L.quote_count),
      saves: num(L.bookmark_count),
    });
  }
  return [...out.values()];
}

export const xRow = (t: Tweet, handle: string): Row => {
  const row: Row = {
    id: t.id,
    url: `https://x.com/${handle}/status/${t.id}`,
    posted: t.posted,
    text: t.text,
    kind: t.reply ? "reply" : "post",
  };
  put(row, "views", t.views);
  put(row, "likes", t.likes);
  put(row, "replies", t.replies);
  put(row, "reposts", t.reposts);
  put(row, "quotes", t.quotes);
  put(row, "saves", t.saves);
  return row;
};

export function xFollowers(objs: ReadonlyArray<unknown>, handle: string): number | null {
  const u = walk(
    objs,
    (o) =>
      (
        text(get(o, "core", "screen_name")) || text(get(o, "legacy", "screen_name"))
      ).toLowerCase() === handle.toLowerCase(),
  )[0];
  return u
    ? (num(get(u, "legacy", "followers_count")) ?? num(get(u, "relationship_counts", "followers")))
    : null;
}

export function xScheduled(objs: ReadonlyArray<unknown>, tz: string): Array<Queued> | null {
  const list = walk(objs, (o) => Array.isArray(o.scheduled_tweet_list))[0];
  if (!list) return null;
  return (list.scheduled_tweet_list as Array<unknown>)
    .map((it) => {
      const at = num(get(it, "scheduling_info", "execute_at"));
      return {
        when: at === null ? "" : stampFromUnix(at > 1e11 ? at / 1000 : at, tz),
        text: text(get(it, "tweet_create_request", "status")).slice(0, 400),
      };
    })
    .sort((a, b) => a.when.localeCompare(b.when));
}

export const xListen = (t: Tweet, query: string): ListenRow => {
  const row: ListenRow = {
    channel: "x",
    query,
    url: `https://x.com/${t.user || "i"}/status/${t.id}`,
    author: t.user,
    posted: t.posted,
    text: t.text.slice(0, 400),
  };
  if (t.views !== null) row.views = t.views;
  if (t.likes !== null) row.likes = t.likes;
  if (t.replies !== null) row.replies = t.replies;
  if (t.reposts !== null) row.reposts = t.reposts;
  return row;
};

// ---- Merging ----

/** Fresh rows replace stored ones with the same id (fields merged); stored rows not read this time stay. */
export function mergePosts(
  old: ReadonlyArray<CollectedPost>,
  fresh: ReadonlyArray<CollectedPost>,
  since: string,
): Array<CollectedPost> {
  const by = new Map(old.map((p) => [p.id, p]));
  for (const p of fresh) by.set(p.id, { ...by.get(p.id), ...p });
  return [...by.values()]
    .filter((p) => !p.posted || p.posted >= since)
    .sort((a, b) => (b.posted ?? "").localeCompare(a.posted ?? ""));
}
