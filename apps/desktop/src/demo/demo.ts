// Fictional data for trying Loud without connecting anything, and for screenshots and tests. A made-up product,
// "Acme Forms", posting on four channels for ten weeks, plus listening results by made-up people. Dates are relative
// to now, so the demo always looks current. Never written over a folder that holds real collected data.
import type {
  ChannelFile,
  ChannelId,
  CollectedListenItem,
  CollectedPost,
  ListenFile,
  Proposals,
} from "@loud/contracts";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { buildFolder } from "../build/Builder.ts";
import { formatStamp, parseStamp, wallClock } from "../build/time.ts";
import { DEMO_MARKER, type DemoMarker, readJson, writeJson } from "../data/files.ts";

export const DEMO_TIMEZONE = "America/New_York";
const DAYS = 70;
const H = 3_600_000;

/** Small, seedable PRNG (mulberry32), so a seed gives the same demo every time. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    random: next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    uniform: (lo: number, hi: number) => lo + next() * (hi - lo),
    pick: <T>(items: ReadonlyArray<T>): T => items[Math.floor(next() * items.length)]!,
    sample: <T>(items: ReadonlyArray<T>, n: number): Array<T> => {
      const pool = [...items];
      return Array.from({ length: n }, () => pool.splice(Math.floor(next() * pool.length), 1)[0]!);
    },
    gauss: (mu: number, sigma: number) => {
      const u = 1 - next();
      const v = next();
      return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}
type Rng = ReturnType<typeof rng>;

const TOPICS: ReadonlyArray<readonly [string, string]> = [
  ["I rewrote the form renderer", "and first paint went from {a}ms to {b}ms"],
  ["Week {w} of building Acme Forms in public", "{n} signups, {m} paying, {r} churned"],
  ["Shipped conditional logic today", "it took {d} days, not the 2 I planned"],
  ["The feature nobody asked for", "got used by {p}% of new accounts in a week"],
  ["Cold email vs. posting every day", "after {w} weeks: {n} vs {m} signups"],
  ["I deleted the onboarding checklist", "and activation went up {p}%"],
  ["Pricing page experiment", "removing the free tier cut signups by {p}% but doubled trials"],
  ["A bug report that turned into a feature", "and {n} people upvoted it"],
  ["Spent the weekend on SEO", "{n} new pages, {m} visits so far"],
  ["Your first 100 users", "came from {n} replies, not from launch day"],
  ["Open-sourced the form validator", "{n} stars in {d} days"],
];
const PLAIN: ReadonlyArray<readonly [string, string]> = [
  ["Nobody reads your landing page", "they read the first line and the screenshot"],
  ["Tiny change, big result", "the submit button now says what happens next"],
  ["How I pick what to build next", "the support inbox, sorted by how angry people are"],
  ["What I'd do differently if I started today", "talk to users before writing code"],
  ["Marketing is part of the product", "if nobody finds it, it doesn't exist"],
  ["I keep building instead of posting", "so this is me posting"],
  ["The best feedback came from a cancelled account", "they told me exactly why"],
];
const TAILS_Q = [
  "What would you try next?",
  "Have you seen the same?",
  "Which one would you pick?",
  "Am I wrong here?",
];
const TAGS = ["#buildinpublic", "#indiehackers", "#saas", "#nocode"];
const IG_FORMATS = ["before/after", "screen recording", "talking head", "carousel"];
const X_REPLIES = [
  "Same here. What fixed it for us was talking to users first.",
  "This is the part nobody writes about. Thanks for sharing the numbers.",
  "We tried that: signups went up, activation went down.",
];

export const DEMO_KEYWORDS: Record<string, ReadonlyArray<string>> = {
  threads: ["form builder", "typeform alternative", "landing page feedback"],
  ig: ["#buildinpublic", "#indiehackers"],
  fb_video: ["how to get first customers"],
  x: ["typeform alternative", '"form builder" pricing', "first 100 users"],
};
const LISTEN_CHANNEL: Record<string, ChannelId> = {
  threads: "threads",
  ig: "ig",
  fb_video: "fb",
  x: "x",
};
const PAINS = [
  "Why does every form builder charge per response? I run a tiny newsletter and the bill is silly.",
  "Looking for a typeform alternative that doesn't break on mobile. Suggestions?",
  "I launched on three directories and got 12 visits. Where do people actually find early users?",
  "Can someone roast my landing page? I've rewritten the headline five times.",
  "Built a SaaS for 8 months, 0 customers. I think I skipped the marketing part entirely.",
  "Is posting every day on X worth it when you have 150 followers?",
  "Our signup form converts at 2%. What's a normal number?",
  "Conditional logic in forms is always either too simple or a nightmare. Is there a middle ground?",
  "How do you write about your product without sounding like an ad?",
  "Spent the weekend building, Monday I realised nobody knows it exists. Again.",
  "Tips for a first launch? Product Hunt or not?",
  "What tools do you use to collect feedback from users inside the app?",
];
const AUTHORS = [
  "Maya Chen",
  "Jonas Berg",
  "Priya Natarajan",
  "Leo Martins",
  "Ava Kowalski",
  "Sam Okafor",
  "Noor Haddad",
  "Elena Rossi",
  "Kenji Sato",
  "Lucas Meyer",
  "Zoe Laurent",
  "Omar Farouk",
];

interface Features {
  readonly question: boolean;
  readonly number: boolean;
  readonly tags: boolean;
  readonly long: boolean;
}

function postText(r: Rng, f: Features): string {
  const [head, tail] = r.pick(f.number ? TOPICS : PLAIN);
  const vals: Record<string, number> = {
    a: r.int(600, 1400),
    b: r.int(90, 300),
    w: r.int(3, 14),
    n: r.int(12, 240),
    m: r.int(2, 40),
    r: r.int(0, 5),
    d: r.int(3, 9),
    p: r.int(8, 41),
  };
  const fill = (s: string) => s.replace(/\{(\w)\}/g, (_, k: string) => String(vals[k]));
  let t = `${fill(head)}: ${fill(tail)}.`;
  if (f.long) {
    t +=
      "\n\nHere's the longer version. I tried the obvious fix first and it made things worse, so I went back to what " +
      "users actually said in the support inbox. Three of them described the same problem in different words. That " +
      "was the real feature request.";
  }
  if (f.question) t += `\n\n${r.pick(TAILS_Q)}`;
  if (f.tags) t += `\n\n${r.sample(TAGS, 2).join(" ")}`;
  return t;
}

const WEEKDAY_LIFT = [0.75, 0.9, 1.25, 1.2, 1.05, 0.85, 0.7]; // Sun..Sat

function views(r: Rng, base: number, at: number, f: Features, ageH: number): number {
  const d = new Date(at);
  const hour = d.getUTCHours();
  let m = base;
  m *= f.question ? 1.6 : 1;
  m *= f.number ? 1.3 : 1;
  m *= f.tags ? 0.8 : 1;
  m *= WEEKDAY_LIFT[d.getUTCDay()]!;
  m *= hour >= 15 && hour < 21 ? 1.35 : hour < 9 ? 0.75 : 1;
  m *= Math.exp(r.gauss(0, 0.55));
  if (r.random() < 0.04) m *= r.uniform(5, 12); // the occasional breakout
  m *= Math.min(1, 0.35 + (0.65 * ageH) / 48); // young posts are still collecting views
  return Math.max(3, Math.trunc(m));
}

interface Spec {
  readonly base: number;
  readonly perDay: number;
  readonly followers: readonly [number, number];
  readonly rates: Partial<Record<"likes" | "replies" | "reposts" | "shares" | "saves", number>>;
}

const SPECS: Record<ChannelId, Spec> = {
  threads: {
    base: 900,
    perDay: 0.8,
    followers: [310, 520],
    rates: { likes: 0.035, replies: 0.012, reposts: 0.004 },
  },
  ig: {
    base: 320,
    perDay: 1.4,
    followers: [80, 240],
    rates: { likes: 0.05, replies: 0.006, shares: 0.01, saves: 0.012 },
  },
  fb: {
    base: 180,
    perDay: 0.35,
    followers: [40, 75],
    rates: { likes: 0.03, replies: 0.004, shares: 0.006 },
  },
  x: {
    base: 140,
    perDay: 1.1,
    followers: [120, 210],
    rates: { likes: 0.03, replies: 0.01, reposts: 0.006 },
  },
};
const HOURS = [8, 10, 12, 13, 15, 16, 17, 18, 19, 20, 21];

function channel(r: Rng, id: ChannelId, now: number): ChannelFile {
  const spec = SPECS[id];
  const posts: Array<CollectedPost> = [];
  let i = 0;
  const today = Math.floor(now / (24 * H)) * 24 * H;
  for (let d = DAYS; d >= 0; d--) {
    const day = today - d * 24 * H;
    let n = 0;
    for (let k = 0; k < 3; k++) {
      if (r.random() < (spec.perDay / 3) * (d > DAYS - 20 && id === "fb" ? 0.4 : 1)) n++;
    }
    if (id === "threads" && d <= 3) n = 0; // a gap the audit should notice
    for (let k = 0; k < n; k++) {
      const at = day + r.pick(HOURS) * H + r.int(0, 59) * 60_000;
      if (at > now - 30 * 60_000) continue;
      const ageH = (now - at) / H;
      const f: Features = {
        question: r.random() < 0.45,
        number: r.random() < 0.55,
        tags: (id === "ig" || id === "x") && r.random() < 0.4,
        long: (id === "threads" || id === "fb") && r.random() < 0.3,
      };
      const v = views(r, spec.base, at, f, ageH);
      i++;
      const p: Record<string, unknown> = {
        id: `demo-${id}-${i}`,
        url: `https://example.com/demo/${id}/${i}`,
        posted: formatStamp(at),
        text: postText(r, f),
        views: v,
        likes: Math.trunc(
          v * (spec.rates.likes ?? 0) * r.uniform(0.5, 1.6) * (f.question ? 1.4 : 1),
        ),
      };
      for (const key of ["replies", "reposts", "shares", "saves"] as const) {
        const rate = spec.rates[key];
        if (rate !== undefined) {
          p[key] = Math.trunc(
            v * rate * r.uniform(0.3, 1.8) * (key === "replies" && f.question ? 2.2 : 1),
          );
        }
      }
      if (id === "threads" || id === "ig") p.follows = Math.trunc(v * r.uniform(0.0005, 0.004));
      if (id === "ig") {
        p.kind = "reel";
        p.format = r.pick(IG_FORMATS);
        p.dur = r.int(7, 45);
        if (p.format === "screen recording") p.saves = Math.trunc((p.saves as number) * 2.5);
      } else {
        p.kind = "post";
      }
      posts.push(p as unknown as CollectedPost);
    }
    if (id === "x") {
      // Replies to other people: X counts them; the dashboard keeps them apart.
      for (let k = r.int(0, 3); k > 0; k--) {
        const at = day + r.int(9, 22) * H + r.int(0, 59) * 60_000;
        if (at >= now) continue;
        i++;
        const v = Math.trunc(r.uniform(15, 140));
        posts.push({
          id: `demo-x-${i}`,
          url: `https://example.com/demo/x/${i}`,
          posted: formatStamp(at),
          text: r.pick(X_REPLIES),
          views: v,
          likes: Math.trunc(v * 0.04),
          replies: r.int(0, 2),
          reposts: 0,
          kind: "reply",
        });
      }
    }
  }
  const nowStamp = formatStamp(now);
  if (id === "ig") {
    const q: Features = { question: true, number: true, tags: true, long: false };
    return {
      collected: nowStamp,
      followers: spec.followers[1],
      posts,
      scheduled: [5, 29, 53, 77].map((h) => ({
        when: formatStamp(now + h * H),
        text: postText(r, q),
      })),
      scheduled_known: true,
    };
  }
  return {
    collected: nowStamp,
    followers: spec.followers[1],
    posts,
    scheduled: [],
    scheduled_known: id !== "threads",
    // Fictional data still shows the wider X limit.
    ...(id === "x" ? { premium: true } : {}),
  };
}

function listening(r: Rng, now: number): ListenFile {
  const items: Array<CollectedListenItem> = [];
  for (const [key, queries] of Object.entries(DEMO_KEYWORDS)) {
    for (const query of queries) {
      for (let j = r.int(6, 12); j > 0; j--) {
        const at = now - r.uniform(2, 24 * 20) * H;
        const v = Math.trunc(Math.exp(r.gauss(7, 1.3)));
        items.push({
          channel: LISTEN_CHANNEL[key]!,
          query,
          url: `https://example.com/demo/listen/${key}/${items.length}`,
          author: r.pick(AUTHORS),
          posted: formatStamp(at),
          text: r.pick(PAINS),
          lang: "en",
          views: key === "threads" ? null : v,
          likes: Math.trunc(v * r.uniform(0.01, 0.06)),
          replies: Math.trunc(v * r.uniform(0.002, 0.02)),
          reposts: Math.trunc(v * r.uniform(0, 0.005)),
        });
      }
    }
  }
  return { collected: formatStamp(now), items };
}

const PROPOSALS: Omit<Proposals, "written" | "data_built"> = {
  summary:
    "Threads brings the most views per post but has had no post for a few days and nothing scheduled. Posts that " +
    "end with a question beat the rest on every channel. Instagram is booked for three days; screen recordings get " +
    "saved the most.",
  audit: [
    "Threads: posts ending with a question get about 1.6x the median views of those without.",
    "Instagram: screen recordings are saved about 2.5x more per 1k views than other formats.",
    "X: replies to other people's posts bring more profile visits than original posts this week.",
  ],
  items: [
    {
      channel: "threads",
      title: "The onboarding checklist I deleted",
      when: "Today, 17:30",
      format: "Text, 3 short paragraphs",
      hook: "I deleted our onboarding checklist and activation went up. Here's what replaced it.",
      outline:
        "1. The checklist and why it felt right\n2. What the session recordings showed\n3. The one-screen replacement\n4. Ask: what did you remove that helped?",
      why: "Number + question is the best-performing combination on Threads. Fills the posting gap.",
      evidence: [
        { label: "Best Threads post this month", url: "https://example.com/demo/threads/1" },
      ],
    },
    {
      channel: "x",
      title: "Reply to people asking for a typeform alternative",
      when: "Today, any time",
      format: "3 replies",
      hook: "We built Acme Forms for exactly this: per-form pricing, not per-response.",
      outline:
        "1. Open Listening, filter keyword 'typeform alternative'\n2. Reply to the 3 most recent with a real answer first, link last",
      why: "12 questions in the listening results this week; replies drive profile visits on X.",
      evidence: [],
    },
    {
      channel: "ig",
      title: "Screen recording: build a form in 20 seconds",
      when: "Thu, 18:00",
      format: "Reel, screen recording, voice-over",
      hook: "This form took 20 seconds. Watch.",
      outline: "1. Empty page\n2. Add three fields\n3. Turn on logic\n4. Share link",
      why: "Screen recordings are the most saved format.",
      evidence: [],
    },
  ],
  stop: ["Hashtag blocks on X: posts with them get fewer views."],
};

const CHANNELS: ReadonlyArray<ChannelId> = ["threads", "ig", "fb", "x"];

/** True when the folder holds files a collector or a person wrote, not a demo: never overwrite those. */
export function holdsRealData(dir: string): boolean {
  if (readJson<DemoMarker>(NodePath.join(dir, DEMO_MARKER))?.demo) return false;
  return [...CHANNELS.map((c) => `${c}.json`), "listen.json", "hub.json", "proposals.json"].some(
    (f) => NodeFS.existsSync(NodePath.join(dir, f)),
  );
}

/** Writes a complete demo folder and builds it. Refuses a folder with real data in it. */
export function generateDemo(dir: string, opts: { seed?: number; now?: Date } = {}) {
  if (holdsRealData(dir))
    throw new Error(`${dir} holds collected data; the demo goes in its own folder.`);
  const r = rng(opts.seed ?? 7);
  const now = parseStamp(wallClock(opts.now ?? new Date(), DEMO_TIMEZONE))!;
  const since = formatStamp(now - DAYS * 24 * H).slice(0, 10);
  NodeFS.mkdirSync(dir, { recursive: true });
  writeJson(NodePath.join(dir, DEMO_MARKER), {
    demo: true,
    timezone: DEMO_TIMEZONE,
    since,
  } satisfies DemoMarker);

  const followers: Record<string, readonly [number, number]> = {};
  for (const id of CHANNELS) {
    writeJson(NodePath.join(dir, `${id}.json`), channel(r, id, now));
    followers[id] = SPECS[id].followers;
  }
  writeJson(NodePath.join(dir, "listen.json"), listening(r, now));
  // Thirty days of follower snapshots, so the week-over-week delta has something to compare with.
  for (let k = 30; k >= 1; k--) {
    const day = formatStamp(now - k * 24 * H).slice(0, 10);
    const channels = Object.fromEntries(
      CHANNELS.map((id) => {
        const [lo, hi] = followers[id]!;
        return [id, { followers: Math.trunc(lo + (hi - lo) * ((30 - k) / 30) ** 1.3) }];
      }),
    );
    writeJson(NodePath.join(dir, "history", `${day}.json`), { at: `${day} 09:00`, channels });
  }
  const hub = buildFolder(
    { data: dir, timezone: DEMO_TIMEZONE, since, channels: CHANNELS },
    opts.now ?? new Date(),
  );
  writeJson(NodePath.join(dir, "proposals.json"), {
    ...PROPOSALS,
    written: hub?.built ?? formatStamp(now),
    data_built: hub?.built ?? formatStamp(now),
  } satisfies Proposals);
  return hub;
}
