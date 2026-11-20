// The numbers behind Insights, Posts and Listening. Conventions carried over from the Python version, so the agent
// and the dashboard agree:
//   settled   your own post (not a reply), at least 24h old, with a view count: younger posts are still collecting
//   medians   never means, so one breakout post does not move a baseline
//   lift      median views with a feature vs without, only when each side has at least MIN_SIDE posts
import type { ChannelId, Hub, ListenItem, Post } from "@loud/contracts";

import { isNum, parseStamp, ymd } from "./stamp.ts";

/** Stack and legend order: the categorical slots the channel colours were validated in. */
export const CHANNEL_ORDER: ReadonlyArray<ChannelId> = ["fb", "ig", "threads", "x"];

export const MIN_SIDE = 3;
export const SETTLED_H = 24;

export const median = (values: ReadonlyArray<number | null | undefined>): number | null => {
  const s = values.filter(isNum).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export const sumOf = <T>(list: ReadonlyArray<T>, key: keyof T) =>
  list.reduce((t, p) => {
    const v = p[key];
    return t + (isNum(v) ? v : 0);
  }, 0);

export const isOwn = (p: Post) => p.kind !== "reply";

export const settled = (posts: ReadonlyArray<Post>, channel?: ChannelId) =>
  posts.filter(
    (p) =>
      isOwn(p) &&
      isNum(p.views) &&
      (p.age_h ?? 0) >= SETTLED_H &&
      (!channel || p.channel === channel),
  );

/** Channels present in the hub, in stack order. */
export const channelsOf = (hub: Hub) =>
  CHANNEL_ORDER.filter((id) => hub.channels.some((c) => c.id === id));

export const ENG_KEYS = ["likes", "replies", "reposts", "shares", "saves"] as const;

/** Interactions per 1,000 views over a group of posts (summed, so big posts weigh more). */
export const engPer1k = (list: ReadonlyArray<Post>): number | null => {
  const v = sumOf(list, "views");
  return v ? (1000 * ENG_KEYS.reduce((t, k) => t + sumOf(list, k), 0)) / v : null;
};

/** One count per 1,000 views, over the posts where the platform reports that count. */
export const ratePer1k = (list: ReadonlyArray<Post>, key: keyof Post): number | null => {
  const withKey = list.filter((p) => isNum(p[key]));
  const v = sumOf(withKey, "views");
  return withKey.length && v ? (1000 * sumOf(withKey, key)) / v : null;
};

/** Views per unique viewer: above 1 means people watch again. */
export const rewatch = (list: ReadonlyArray<Post>): number | null => {
  const l = list.filter((p) => isNum(p.viewers) && p.viewers > 0);
  return l.length ? sumOf(l, "views") / sumOf(l, "viewers") : null;
};

export const firstLine = (t: string) => t.split("\n").find((l) => l.trim()) ?? "";

export interface Feature {
  readonly label: string;
  /** Completes "Posts that …". */
  readonly says: string;
  readonly test: (text: string) => boolean;
}

export const FEATURES: ReadonlyArray<Feature> = [
  { label: "Asks a question (?)", says: "ask a question", test: (t) => t.includes("?") },
  {
    label: "Asks for comments",
    says: "ask for comments",
    test: (t) => /comment|reply|👇|let me know|tell me/i.test(t),
  },
  {
    label: "Number in first line",
    says: "have a number in the first line",
    test: (t) => /\d/.test(firstLine(t)),
  },
  {
    label: "First line ≤ 60 chars",
    says: "open with a line of 60 chars or less",
    test: (t) => firstLine(t).trim().length <= 60,
  },
  { label: "Has a link", says: "include a link", test: (t) => /https?:\/\//i.test(t) },
  { label: "Has hashtags", says: "use hashtags", test: (t) => /#[\p{L}\p{N}_]/u.test(t) },
];

export interface Lift {
  readonly withN: number;
  readonly withoutN: number;
  readonly withMedian: number | null;
  readonly withoutMedian: number | null;
  /** With / without; null when either side has fewer than MIN_SIDE posts. */
  readonly ratio: number | null;
}

export const lift = (list: ReadonlyArray<Post>, test: (text: string) => boolean): Lift => {
  const yes = list.filter((p) => test(p.text ?? ""));
  const no = list.filter((p) => !test(p.text ?? ""));
  const a = median(yes.map((p) => p.views));
  const b = median(no.map((p) => p.views));
  return {
    withN: yes.length,
    withoutN: no.length,
    withMedian: a,
    withoutMedian: b,
    ratio: yes.length >= MIN_SIDE && no.length >= MIN_SIDE && a !== null && b ? a / b : null,
  };
};

/** Start hours of the 3-hour blocks. */
export const BLOCKS = [0, 3, 6, 9, 12, 15, 18, 21] as const;
export const blockLabel = (b: number) =>
  `${String(b).padStart(2, "0")}–${String(b + 3).padStart(2, "0")}`;

/** Older Facebook posts carry only a date, read as 00:00: no usable hour. */
export const hasHour = (p: Post) =>
  !(p.channel === "fb" && (p.posted ?? "").slice(11, 16) === "00:00");

export const blockOf = (p: Post): number | null => {
  const h = Number((p.posted ?? "").slice(11, 13));
  return p.posted && hasHour(p) && Number.isInteger(h) ? Math.floor(h / 3) * 3 : null;
};

export const weekdayOf = (p: Post): number | null => parseStamp(p.posted)?.getDay() ?? null;

export interface Group {
  readonly n: number;
  readonly median: number | null;
}

export const group = (list: ReadonlyArray<Post>): Group => ({
  n: list.length,
  median: median(list.map((p) => p.views)),
});

export interface Bucket extends Group {
  readonly label: string;
}

export const buckets = (
  list: ReadonlyArray<Post>,
  value: (p: Post) => number | null | undefined,
  edges: ReadonlyArray<readonly [number, number]>,
  unit: string,
): ReadonlyArray<Bucket> =>
  edges.map(([a, b]) => ({
    label: b === Infinity ? `≥ ${a}${unit}` : `${a}–${b}${unit}`,
    ...group(
      list.filter((p) => {
        const v = value(p);
        return isNum(v) && v >= a && v < b;
      }),
    ),
  }));

export type Callout =
  | {
      readonly channel: ChannelId;
      readonly kind: "concentration";
      readonly share: number;
      readonly posts: number;
      readonly median: number | null;
    }
  | {
      readonly channel: ChannelId;
      readonly kind: "timing";
      readonly block: number;
      readonly median: number;
      readonly ratio: number;
      readonly posts: number;
    }
  | {
      readonly channel: ChannelId;
      readonly kind: "content";
      readonly says: string;
      readonly lift: Lift;
    };

/** Differences worth saying out loud: 1.5x or more, with enough posts on each side. */
export function callouts(hub: Hub): ReadonlyArray<Callout> {
  const out: Array<Callout> = [];
  for (const id of channelsOf(hub)) {
    const list = settled(hub.posts, id);
    if (list.length < 6) continue;
    const m = median(list.map((p) => p.views));
    const views = list.map((p) => p.views ?? 0).sort((a, b) => b - a);
    const total = views.reduce((a, b) => a + b, 0);
    if (total && views[0]! / total >= 0.4) {
      out.push({
        channel: id,
        kind: "concentration",
        share: views[0]! / total,
        posts: list.length,
        median: m,
      });
    }
    const best = BLOCKS.map((b) => ({ b, ...group(list.filter((p) => blockOf(p) === b)) }))
      .filter((x) => x.n >= MIN_SIDE && x.median !== null)
      .sort((a, b) => b.median! - a.median!)[0];
    if (best && m && best.median! >= 1.5 * m) {
      out.push({
        channel: id,
        kind: "timing",
        block: best.b,
        median: best.median!,
        ratio: best.median! / m,
        posts: best.n,
      });
    }
    const feature = FEATURES.map((f) => ({ says: f.says, lift: lift(list, f.test) }))
      .filter((x) => x.lift.ratio !== null && (x.lift.ratio >= 1.5 || x.lift.ratio <= 1 / 1.5))
      .sort((a, b) => Math.abs(Math.log(b.lift.ratio!)) - Math.abs(Math.log(a.lift.ratio!)))[0];
    if (feature) out.push({ channel: id, kind: "content", ...feature });
  }
  return out;
}

/** Every day from the first own post to `now`, as YYYY-MM-DD. */
export function daysSinceFirstPost(posts: ReadonlyArray<Post>, now: Date): ReadonlyArray<string> {
  const first = posts
    .filter(isOwn)
    .map((p) => (p.posted ?? "").slice(0, 10))
    .filter(Boolean)
    .sort()[0];
  const start = parseStamp(first);
  if (!start) return [];
  const days: Array<string> = [];
  for (let d = start; d <= now; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    days.push(ymd(d));
  }
  return days;
}

// ---- Listening ----

/** A post found by several keywords carries them all, comma-separated. */
export const queriesOf = (item: ListenItem) =>
  item.query
    .split(",")
    .map((q) => q.trim())
    .filter(Boolean);

export interface KeywordRow {
  readonly query: string;
  readonly posts: number;
  /** Null when no post found for it has a view count (Threads shows none on other people's posts). */
  readonly views: number | null;
  readonly medianLikes: number | null;
  readonly questions: number;
  readonly byChannel: Partial<Record<ChannelId, number>>;
}

export function keywordRows(items: ReadonlyArray<ListenItem>): ReadonlyArray<KeywordRow> {
  const by = new Map<string, Array<ListenItem>>();
  for (const i of items) for (const q of queriesOf(i)) by.set(q, [...(by.get(q) ?? []), i]);
  return [...by]
    .map(([query, list]) => {
      const byChannel: Partial<Record<ChannelId, number>> = {};
      for (const i of list) byChannel[i.channel] = (byChannel[i.channel] ?? 0) + 1;
      return {
        query,
        posts: list.length,
        views: list.some((i) => isNum(i.views)) ? sumOf(list, "views") : null,
        medianLikes: median(list.map((i) => i.likes)),
        questions: list.filter((i) => i.question).length,
        byChannel,
      };
    })
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || b.posts - a.posts);
}

export interface AuthorRow {
  readonly channel: ChannelId;
  readonly author: string;
  readonly posts: number;
  readonly views: number;
  readonly likes: number;
  readonly score: number;
  readonly queries: ReadonlyArray<string>;
}

export function topAuthors(items: ReadonlyArray<ListenItem>, n = 12): ReadonlyArray<AuthorRow> {
  const by = new Map<string, { row: Omit<AuthorRow, "queries">; queries: Set<string> }>();
  for (const i of items) {
    if (!i.author) continue;
    const key = `${i.channel}|${i.author}`;
    const cur = by.get(key) ?? {
      row: { channel: i.channel, author: i.author, posts: 0, views: 0, likes: 0, score: 0 },
      queries: new Set<string>(),
    };
    cur.row = {
      ...cur.row,
      posts: cur.row.posts + 1,
      views: cur.row.views + (i.views ?? 0),
      likes: cur.row.likes + (i.likes ?? 0),
      score: cur.row.score + (i.score ?? 0),
    };
    for (const q of queriesOf(i)) cur.queries.add(q);
    by.set(key, cur);
  }
  return [...by.values()]
    .map(({ row, queries }) => ({ ...row, queries: [...queries] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

// ---- Links ----

const PLATFORM_URL =
  /^https:\/\/(www\.)?(threads\.com|threads\.net|instagram\.com|x\.com|twitter\.com|facebook\.com)\//;

/** Only the platforms' own pages are linked: listening holds strangers' posts. */
export const safeUrl = (u: string | undefined) => (u && PLATFORM_URL.test(u) ? u : null);

/** "Now" for every age and window is the build time, so the numbers agree with what the build measured. */
export const builtAt = (hub: Hub) => parseStamp(hub.built) ?? new Date();

// ---- Overview ----

/** Days between a post and `now`; null without a stamp. */
export const daysAgo = (p: Post, now: Date): number | null => {
  const d = parseStamp(p.posted);
  return d ? (now.getTime() - d.getTime()) / 864e5 : null;
};

/** Own posts published in [from, to) days ago. */
export const postsBetween = (posts: ReadonlyArray<Post>, now: Date, from: number, to: number) =>
  posts.filter((p) => {
    const d = daysAgo(p, now);
    return isOwn(p) && isNum(p.views) && d !== null && d >= from && d < to;
  });

export interface DayViews {
  readonly date: Date;
  readonly key: string;
  readonly views: Partial<Record<ChannelId, number>>;
  readonly posts: Partial<Record<ChannelId, number>>;
}

/** Today's total views of the own posts published on each of the last `n` days, oldest first. */
export function viewsByPublishDay(
  posts: ReadonlyArray<Post>,
  now: Date,
  n = 14,
): ReadonlyArray<DayViews> {
  const days = Array.from({ length: n }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i));
    return {
      date,
      key: ymd(date),
      views: {} as Record<string, number>,
      posts: {} as Record<string, number>,
    };
  });
  const index = new Map(days.map((d, i) => [d.key, i]));
  for (const p of posts) {
    if (!isOwn(p)) continue;
    const i = index.get((p.posted ?? "").slice(0, 10));
    if (i === undefined) continue;
    const d = days[i]!;
    d.views[p.channel] = (d.views[p.channel] ?? 0) + (p.views ?? 0);
    d.posts[p.channel] = (d.posts[p.channel] ?? 0) + 1;
  }
  return days;
}

export interface Rising {
  readonly post: Post;
  /** Views over the channel's settled median. */
  readonly ratio: number;
  readonly median: number;
}

/** Own posts under 72h old, against the median of the channel's settled posts. */
export function rising(posts: ReadonlyArray<Post>, n = 6): ReadonlyArray<Rising> {
  const medians = new Map<ChannelId, number | null>();
  const medianOf = (id: ChannelId) => {
    if (!medians.has(id)) medians.set(id, median(settled(posts, id).map((p) => p.views)));
    return medians.get(id) ?? null;
  };
  return posts
    .filter((p) => isOwn(p) && isNum(p.views) && (p.age_h ?? 99) < 72)
    .flatMap((post) => {
      const m = medianOf(post.channel);
      return m ? [{ post, ratio: (post.views ?? 0) / m, median: m }] : [];
    })
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, n);
}

/** Clean axis maximum: 1, 2, 2.5 or 5 times a power of ten. */
export const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const e = 10 ** Math.floor(Math.log10(v));
  const f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
};
