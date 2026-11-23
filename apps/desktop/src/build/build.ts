// The build: merges what collectors wrote (<channel>.json, listen.json) into hub.json, the one file the dashboard
// reads, plus a daily snapshot for history/. Pure: the Builder service does the file work.
import {
  CHANNEL_NAMES,
  type ChannelFile,
  type ChannelId,
  type ChannelSummary,
  type Flag,
  type HistoryFile,
  type Hub,
  type ListenFile,
  type ListenItem,
  type Post,
  type Scheduled,
} from "@loud/contracts";

import { parseStamp } from "./time.ts";

export interface BuildInput {
  /** Wall-clock "YYYY-MM-DD HH:MM" in the configured zone. */
  readonly now: string;
  readonly since: string;
  readonly timezone: string;
  /** Enabled channels, in display order. */
  readonly channels: ReadonlyArray<ChannelId>;
  readonly files: Partial<Record<ChannelId, ChannelFile>>;
  readonly listen: ListenFile | null;
}

const ENG = ["likes", "replies", "reposts", "shares", "saves"] as const;
const H = 3_600_000;

const num = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

/** Likes + replies + reposts + shares + saves as a % of views, one decimal. */
export const engagement = (p: Pick<Post, (typeof ENG)[number] | "views">): number | null => {
  const v = num(p.views);
  if (!v) return null;
  const e = ENG.reduce((t, k) => t + num(p[k]), 0);
  return Math.round((1000 * e) / v) / 10;
};

const median = (values: ReadonlyArray<number>) => {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const thousands = (n: number) => n.toLocaleString("en-US");

export function summarize(
  id: ChannelId,
  file: ChannelFile,
  posts: ReadonlyArray<Post>,
): ChannelSummary {
  const own = posts.filter((p) => p.kind !== "reply");
  const recent = own.filter((p) => p.age_h != null && p.age_h <= 24 * 7);
  const r14 = own
    .filter((p) => p.age_h != null && p.age_h >= 24 && p.age_h <= 24 * 14 && p.views != null)
    .map((p) => p.views as number);
  const m = median(r14);
  let best: Post | null = null;
  for (const p of recent) if (!best || num(p.views) > num(best.views)) best = p;
  return {
    id,
    name: CHANNEL_NAMES[id],
    ...(file.collected ? { collected: file.collected } : {}),
    followers: file.followers ?? null,
    posts_total: own.length,
    posts_7d: recent.length,
    views_7d: recent.reduce((t, p) => t + num(p.views), 0),
    median_views_14d: m === null ? null : Math.trunc(m),
    last_post: own.reduce((last, p) => (p.posted && p.posted > last ? p.posted : last), ""),
    scheduled: file.scheduled?.length ?? 0,
    scheduled_known: file.scheduled_known ?? true,
    best_7d: best,
    ...(file.premium !== undefined ? { premium: file.premium } : {}),
  };
}

/** Audit checks; `posts` are the channel's own posts (no replies). */
export function flags(
  id: ChannelId,
  s: ChannelSummary,
  posts: ReadonlyArray<Post>,
  nowMs: number,
): Array<Flag> {
  const out: Array<Flag> = [];
  const last = parseStamp(s.last_post);
  if (last !== null) {
    const gap = (nowMs - last) / (24 * H);
    if (gap > 2 && !s.scheduled) {
      out.push({
        level: "warn",
        text: s.scheduled_known
          ? `${s.name}: no new post for ${Math.round(gap)} days and nothing scheduled`
          : `${s.name}: no new post for ${Math.round(gap)} days (the queue could not be read)`,
      });
    }
  } else if (!posts.length) {
    out.push({ level: "warn", text: `${s.name}: no posts read yet` });
  }
  const med = s.median_views_14d;
  if (med) {
    const top = posts
      .filter(
        (p) => p.views && p.age_h && p.age_h >= 24 && p.age_h <= 24 * 14 && p.views >= 3 * med,
      )
      .sort((a, b) => num(b.views) - num(a.views))
      .slice(0, 3);
    for (const p of top) {
      const first = (p.text ?? "").trim().split("\n")[0]!.slice(0, 90);
      out.push({
        level: "good",
        text: `${s.name}: a post beat 3x the median (${thousands(num(p.views))} vs ${thousands(med)}): ${first}`,
      });
    }
  }
  if (id === "ig") {
    const window = posts.filter((p) => p.age_h && p.age_h >= 48 && p.age_h <= 24 * 10);
    const stuck = window.filter((p) => p.views != null && p.views < 200);
    if (window.length && stuck.length / window.length >= 0.5) {
      out.push({
        level: "info",
        text: `${s.name}: ${stuck.length} of ${window.length} reels aged 2–10 days stopped under 200 views`,
      });
    }
  }
  if (id === "x") {
    const r = posts.filter((p) => p.age_h && p.age_h <= 24 * 7);
    if (
      r.length &&
      r.reduce((t, p) => t + num(p.replies), 0) > r.reduce((t, p) => t + num(p.likes), 0)
    ) {
      const avg = r.reduce((t, p) => t + num(p.views), 0) / r.length;
      out.push({
        level: "info",
        text: `${s.name}: last 7 days drew more replies than likes; ${Math.round(avg)} views per post on average`,
      });
    }
  }
  return out;
}

/** Score, flag questions, then one row per post: a post found by several keywords lists them all. */
export function mergeListening(
  file: ListenFile | null,
  since: string,
  channels: ReadonlyArray<ChannelId>,
): Hub["listen"] {
  const on = new Set(channels);
  const items: Array<ListenItem> = (file?.items ?? [])
    .filter((i) => (i.posted ?? "") >= since && on.has(i.channel))
    .map((i) => ({
      ...i,
      score: num(i.likes) + 3 * num(i.replies) + 2 * num(i.reposts) + num(i.views) / 100,
      question: (i.text ?? "").includes("?"),
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const seen = new Map<string, { query: string }>();
  const uniq: Array<ListenItem> = [];
  for (const it of items) {
    const key = it.url || it.channel + (it.text ?? "").slice(0, 80);
    const prev = seen.get(key);
    if (prev) {
      if (!prev.query.split(", ").includes(it.query)) prev.query += `, ${it.query}`;
      continue;
    }
    const row = { ...it };
    seen.set(key, row);
    uniq.push(row);
  }
  return { ...(file?.collected ? { collected: file.collected } : {}), items: uniq };
}

export function build(input: BuildInput): { hub: Hub; history: HistoryFile } {
  const nowMs = parseStamp(input.now) ?? 0;
  const channels: Array<ChannelSummary> = [];
  const posts: Array<Post> = [];
  const scheduled: Array<Scheduled> = [];
  const allFlags: Array<Flag> = [];

  for (const id of input.channels) {
    const file = input.files[id] ?? { posts: [] };
    const list: Array<Post> = file.posts
      .filter((p) => !p.posted || p.posted >= input.since)
      .map((p) => {
        const t = parseStamp(p.posted);
        const withAge = { ...p, channel: id, age_h: t === null ? null : (nowMs - t) / H };
        return { ...withAge, eng: engagement(withAge) };
      });
    const s = summarize(id, file, list);
    channels.push(s);
    posts.push(...list);
    scheduled.push(...(file.scheduled ?? []).map((x) => ({ ...x, channel: id })));
    allFlags.push(
      ...flags(
        id,
        s,
        list.filter((p) => p.kind !== "reply"),
        nowMs,
      ),
    );
  }

  const hub: Hub = {
    built: input.now,
    since: input.since,
    timezone: input.timezone,
    channels,
    posts,
    scheduled,
    flags: allFlags,
    listen: mergeListening(input.listen, input.since, input.channels),
  };
  const history: HistoryFile = {
    at: input.now,
    channels: Object.fromEntries(
      channels.map((c) => [
        c.id,
        {
          followers: c.followers ?? null,
          posts_total: c.posts_total,
          posts_7d: c.posts_7d,
          views_7d: c.views_7d,
          median_views_14d: c.median_views_14d,
          scheduled: c.scheduled,
        },
      ]),
    ),
  };
  return { hub, history };
}
