// One function per platform: what to open, what to read from it, how to merge with what is stored. Each writes the
// collector files described in docs/data-format.md; the build turns them into hub.json.
import type { ChannelFile, ChannelId, CollectedListenItem, CollectedPost } from "@loud/contracts";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { formatStamp, parseStamp, wallClock } from "../build/time.ts";
import type { PageReader } from "./PageReader.ts";
import {
  fbFollowers,
  fbIsProfileChange,
  fbRows,
  igInfoOwned,
  igInsights,
  igMediaId,
  igMediaInfo,
  igProfile,
  igScheduled,
  igSearch,
  type ListenRow,
  mergePosts,
  type Queued,
  type Row,
  threadsPostNumbers,
  threadsProfile,
  threadsScheduled,
  threadsSearch,
  xAccount,
  xFollowers,
  xListen,
  xRow,
  xScheduled,
  xTweets,
} from "./parse.ts";
import { countFromText, get, num, text, walk } from "./json.ts";

export interface CollectInput {
  readonly id: ChannelId;
  readonly handle: string;
  /** Facebook only: the Page's asset id in Business Suite. */
  readonly assetId: string | undefined;
  readonly timezone: string;
  /** The settings' start date: nothing before it is kept. */
  readonly since: string;
  /** Read posts from here on; older stored posts keep their numbers. */
  readonly scanFrom: string;
  /** Scroll far enough back to reach the start date, not only the rescan window. */
  readonly full: boolean;
  readonly old: ChannelFile | null;
  readonly reader: PageReader;
  readonly progress: (detail: string, count: number) => void;
}

/** Posts to re-read per run at most: the rest keep their stored numbers until the next one. */
const MAX_POST_PAGES = 40;
const IG_APP_ID = "936619743392459";

const nowStamp = (tz: string) => wallClock(new Date(), tz);

/**
 * The list has gone far enough back when its last two rows are older than the window. Only the tail counts: pinned
 * posts sit at the top however old they are, and counting them stopped the scroll before the newest posts were read.
 */
export const pastWindow = (rows: ReadonlyArray<{ posted?: string | undefined }>, from: string) => {
  const tail = rows.slice(-2);
  return tail.length === 2 && tail.every((r) => !!r.posted && r.posted < from);
};

/**
 * Rows from the first page and every scroll, kept together. Each read sees only what the page holds at that moment:
 * Threads drops the profile's embedded first page (the newest posts) from the document once it has rendered, so
 * reading only the latest state lost exactly the newest posts.
 */
export async function scrollFor<T extends { id: string; posted?: string | undefined }>(
  reader: Pick<PageReader, "more">,
  read: (objs: ReadonlyArray<unknown>) => Array<T>,
  capture: RegExp,
  first: ReadonlyArray<unknown>,
  from: string,
  maxScrolls: number,
): Promise<Array<T>> {
  const seen = new Map<string, T>();
  // A later read of the same post has fresher numbers; the Map keeps its first position in the list.
  const add = (rows: ReadonlyArray<T>) => {
    for (const r of rows) seen.set(r.id, { ...seen.get(r.id), ...r });
  };
  const fresh = (rows: ReadonlyArray<T>) => rows.filter((r) => !seen.has(r.id)).length;
  add(read(first));
  let still = 0;
  for (let i = 0; i < maxScrolls && !pastWindow([...seen.values()], from) && still < 3; i++) {
    const page = await reader.more({
      capture,
      timeoutMs: 6_000,
      until: (objs) => fresh(read(objs)) > 0,
    });
    const rows = read(page.objs);
    still = fresh(rows) === 0 ? still + 1 : 0;
    add(rows);
  }
  return [...seen.values()];
}

interface ReadPlan {
  /** Stored posts that stay: all of them, unless the list proved some are not the account's. */
  readonly old: ReadonlyArray<CollectedPost>;
  /** Posts whose own page is read this run. */
  readonly read: ReadonlyArray<Row>;
  /** New posts past the per-run cap: stored with the list's numbers, read on a later run. */
  readonly listedOnly: ReadonlyArray<Row>;
}

/**
 * Listed posts in the scan window first, then stored ones in the window the list no longer showed, then older
 * stored ones still without views, so a first read capped at MAX_POST_PAGES fills in over the next runs.
 */
export function readPlan(
  input: Pick<CollectInput, "since" | "scanFrom" | "old">,
  listed: ReadonlyArray<Row>,
): ReadPlan {
  const seen = new Set(listed.map((p) => p.id));
  // The list went back past the start date, so a stored post it did not show is deleted or was never the account's.
  const complete = pastWindow(listed, input.since);
  const old = (input.old?.posts ?? []).filter((p) => !complete || seen.has(p.id));
  const stored = new Set(old.map((p) => p.id));
  const read = [
    ...listed.filter((p) => (p.posted ?? "") >= input.scanFrom),
    ...old.filter((p) => (p.posted ?? "") >= input.scanFrom && !seen.has(p.id)),
    ...old.filter((p) => (p.posted ?? "") < input.scanFrom && p.views === undefined),
  ].slice(0, MAX_POST_PAGES) as Array<Row>;
  const reading = new Set(read.map((p) => p.id));
  const listedOnly = listed.filter(
    (p) => (p.posted ?? "") >= input.since && !reading.has(p.id) && !stored.has(p.id),
  );
  return { old, read, listedOnly };
}

const file = (
  input: CollectInput,
  plan: ReadPlan,
  fresh: ReadonlyArray<CollectedPost>,
  followers: number | null,
  scheduled: ReadonlyArray<Queued> | null,
  premium?: boolean | null,
): ChannelFile => ({
  collected: nowStamp(input.timezone),
  followers: followers ?? input.old?.followers ?? null,
  posts: mergePosts(plan.old, [...plan.listedOnly, ...fresh], input.since),
  scheduled: scheduled ?? [],
  scheduled_known: scheduled !== null,
  // A null detection must not wipe a tier already known.
  ...((premium ?? input.old?.premium) !== undefined
    ? { premium: premium ?? input.old!.premium }
    : {}),
});

// ---- Threads ----

const THREADS = "https://www.threads.com";
const META_GQL = /\/(api\/)?graphql/;

export async function collectThreads(input: CollectInput): Promise<ChannelFile> {
  const { reader, handle, timezone: tz } = input;
  const read = (objs: ReadonlyArray<unknown>) => threadsProfile(objs, handle, tz).posts;
  const first = await reader.open(`${THREADS}/@${handle}`, {
    capture: META_GQL,
    embedKeys: ["thread_items", "follower_count"],
    until: (objs) => read(objs).length > 0,
  });
  const followers = threadsProfile(first.objs, handle, tz).followers;
  const listed = await scrollFor(
    reader,
    read,
    META_GQL,
    first.objs,
    input.scanFrom,
    input.full ? 25 : 8,
  );
  const plan = readPlan(input, listed);
  const want = plan.read;
  input.progress(`profile read, ${want.length} posts to update`, 0);
  const fresh: Array<CollectedPost> = [];
  for (const p of want) {
    const page = await reader.open(`${THREADS}/@${handle}/post/${p.id}`, {
      capture: META_GQL,
      embedKeys: ["impression_count", "reach_count", `"code":"${p.id}"`],
      timeoutMs: 10_000,
      until: (objs) => threadsPostNumbers(objs, p.id).views !== undefined,
    });
    fresh.push({ ...p, ...threadsPostNumbers(page.objs, p.id) });
    input.progress(`${fresh.length} of ${want.length} posts`, fresh.length);
  }
  // The queue is the composer's Drafts dialog: open the composer, switch to Drafts, and its graphql answer is
  // captured like any other. If a click finds nothing the queue is left unknown, never "empty".
  const queue = await (async (): Promise<Array<Queued> | null> => {
    await reader.open(`${THREADS}/`, { capture: META_GQL, timeoutMs: 8_000 });
    const opened = await reader.evaluate<number>(
      `(()=>{const b=[...document.querySelectorAll('a,button')].find(x=>/new\\s*thread|create|compose|viết|đăng/i.test((x.getAttribute('aria-label')||'')+' '+(x.innerText||'')));if(!b)return 0;b.click();return 1})()`,
    );
    if (!opened) return null;
    await new Promise((r) => setTimeout(r, 700));
    await reader.evaluate<number>(
      `(()=>{const b=[...document.querySelectorAll('button,[role="tab"]')].find(x=>/^(drafts|bản nháp|brouillons|borradores|rascunhos|entwürfe)$/i.test((x.innerText||'').trim()));if(!b)return 0;b.click();return 1})()`,
    );
    const page = await reader.more({
      capture: META_GQL,
      timeoutMs: 8_000,
      until: (objs) => threadsScheduled(objs, tz) !== null,
    });
    return threadsScheduled(page.objs, tz);
  })().catch(() => null);
  return file(input, plan, fresh, followers, queue);
}

// ---- Instagram ----

const IG = "https://www.instagram.com";
const IG_ANSWERS = /\/(api\/graphql|graphql\/query|api\/v1\/)/;

export async function collectInstagram(input: CollectInput): Promise<ChannelFile> {
  const { reader, handle, timezone: tz } = input;
  const read = (objs: ReadonlyArray<unknown>) => igProfile(objs, handle, tz);
  const first = await reader.open(`${IG}/${handle}/`, {
    capture: IG_ANSWERS,
    embedKeys: ["taken_at", "follower_count"],
    until: (objs) => read(objs).length > 0,
  });
  const fo =
    /"follower_count":(\d+)/.exec(first.html) ??
    /"edge_followed_by":\{"count":(\d+)/.exec(first.html);
  const fromObjs = walk(
    first.objs,
    (o) => o.username === handle && num(o.follower_count) !== null,
  )[0];
  const followers = fromObjs ? num(fromObjs.follower_count) : fo ? countFromText(fo[1]!) : null;
  const listed = await scrollFor(
    reader,
    read,
    IG_ANSWERS,
    first.objs,
    input.scanFrom,
    input.full ? 15 : 5,
  );
  const plan = readPlan(input, listed);
  const want = plan.read;
  input.progress(`profile read, ${want.length} posts to update`, 0);
  const fresh: Array<CollectedPost> = [];
  // Stored by earlier versions, which did not check the owner: dropped once their info says they are someone else's.
  const foreign = new Set<string>();
  for (const p of want) {
    const mid = igMediaId(p.id);
    const body = await reader.fetchJson(`${IG}/api/v1/media/${mid}/info/`, {
      "X-IG-App-ID": IG_APP_ID,
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${IG}/`,
    });
    if (igInfoOwned(body, handle) === false) {
      foreign.add(p.id);
      continue;
    }
    const info = igMediaInfo(body);
    const page = await reader.open(`${IG}/insights/media/${mid}/`, {
      capture: IG_ANSWERS,
      timeoutMs: 10_000,
      until: (objs) => igInsights(objs) !== null,
    });
    const ins = igInsights(page.objs) ?? {};
    fresh.push({ ...p, ...info, ...ins, views: ins.views ?? info.views ?? p.views ?? null });
    input.progress(`${fresh.length} of ${want.length} posts`, fresh.length);
  }
  const queue = await reader.open(`${IG}/scheduled_content/`, {
    capture: IG_ANSWERS,
    timeoutMs: 10_000,
    until: (objs) => igScheduled(objs, tz) !== null,
  });
  const kept = { ...plan, old: plan.old.filter((p) => !foreign.has(p.id)) };
  return file(input, kept, fresh, followers, igScheduled(queue.objs, tz));
}

// ---- Facebook ----

const BUSINESS = "https://business.facebook.com/latest/posts";
const FB_ANSWERS = /\/api\/graphql/;

/** Reactions, comments and shares from a post's own page: the first match belongs to the post, not suggestions. */
export function fbPostCounts(html: string): Partial<Row> {
  const pick = (...res: Array<RegExp>) => {
    for (const re of res) {
      const m = re.exec(html);
      if (m) return Number(m[1]);
    }
    return undefined;
  };
  const out: Partial<Row> = {};
  const likes = pick(/"reaction_count":\{"count":(\d+)/, /"unified_reactors":\{"count":(\d+)/);
  const replies = pick(/"total_comment_count":(\d+)/, /"comments":\{"total_count":(\d+)/);
  const shares = pick(/"share_count":\{"count":(\d+)/);
  if (likes !== undefined) out.likes = likes;
  if (replies !== undefined) out.replies = replies;
  if (shares !== undefined) out.shares = shares;
  return out;
}

export async function collectFacebook(input: CollectInput): Promise<ChannelFile> {
  const { reader, handle: page, timezone: tz } = input;
  if (!input.assetId) throw new Error("choose the Page in Connections first");
  const profile = await reader.open(`https://www.facebook.com/${page}`, {
    capture: FB_ANSWERS,
    timeoutMs: 6_000,
  });
  const followers = fbFollowers(profile.html);
  const pub = await reader.open(`${BUSINESS}/published_posts?asset_id=${input.assetId}`, {
    capture: FB_ANSWERS,
    embedKeys: ["row_id"],
    until: (objs) => fbRows(objs, page, tz).length > 0,
  });
  // The published list paginates like every platform's: scroll until it has gone past the rescan window, so a full
  // read that reached the start date can drop stored posts Facebook no longer shows.
  const listed = await scrollFor(
    reader,
    (objs) =>
      fbRows(objs, page, tz)
        .filter((r) => !r.scheduled && !fbIsProfileChange(r.row.text ?? ""))
        .map((r) => r.row),
    FB_ANSWERS,
    pub.objs,
    input.scanFrom,
    input.full ? 12 : 3,
  );
  const plan = readPlan(input, listed);
  input.progress(`Business Suite read, ${plan.read.length} posts to update`, 0);
  const fresh: Array<CollectedPost> = [];
  for (const r of plan.read) {
    const post = await reader.open(r.url!, { capture: FB_ANSWERS, timeoutMs: 6_000 });
    fresh.push({ ...r, ...fbPostCounts(post.html) });
    input.progress(`${fresh.length} of ${plan.read.length} posts`, fresh.length);
  }
  const sched = await reader.open(`${BUSINESS}/scheduled_posts?asset_id=${input.assetId}`, {
    capture: FB_ANSWERS,
    embedKeys: ["row_id", "tofu_unified_table"],
    timeoutMs: 10_000,
  });
  const known = sched.html.includes("tofu_unified_table");
  const queue: Array<Queued> | null = known
    ? fbRows(sched.objs, page, tz).map((r) => ({
        when: r.row.posted ?? "",
        text: (r.row.text ?? "").slice(0, 400),
      }))
    : null;
  return file(input, plan, fresh, followers, queue);
}

// ---- X ----

const X = "https://x.com";
const X_ANSWERS = /\/i\/api\/graphql\//;

export async function collectX(input: CollectInput): Promise<ChannelFile> {
  const { reader, handle, timezone: tz } = input;
  const mine = (objs: ReadonlyArray<unknown>) =>
    xTweets(objs, tz).filter((t) => t.user.toLowerCase() === handle.toLowerCase());
  const tab = async (url: string, scrolls: number) => {
    const first = await reader.open(url, {
      capture: X_ANSWERS,
      until: (objs) => mine(objs).length > 0,
    });
    return {
      first,
      tweets: await scrollFor(reader, mine, X_ANSWERS, first.objs, input.scanFrom, scrolls),
    };
  };
  const posts = await tab(`${X}/${handle}`, input.full ? 15 : 3);
  const followers = xFollowers(posts.first.objs, handle);
  const replies = await tab(`${X}/${handle}/with_replies`, input.full ? 25 : 4);
  // Premium on the account itself — never a wider limit on guesswork.
  const premium = xAccount(posts.first.objs, handle) ?? xAccount(replies.first.objs, handle);
  if (process.env.LOUD_DEBUG) {
    // Where verification lives in a real payload: field paths and values of objects naming the handle, nothing else.
    const hits = walk(
      [...posts.first.objs, ...replies.first.objs],
      (o) =>
        (
          text(get(o, "core", "screen_name")) ||
          text(get(o, "legacy", "screen_name")) ||
          text(o.screen_name)
        ).toLowerCase() === handle.toLowerCase(),
    );
    const paths = (o: Record<string, unknown>, p = ""): Array<string> =>
      Object.entries(o).flatMap(([k, v]) =>
        /verif|blue|badge|premium|business|govern|is_business|affiliat|profession/i.test(k)
          ? [`${p}${k}=${JSON.stringify(v)}`]
          : v && typeof v === "object" && !Array.isArray(v)
            ? paths(v as Record<string, unknown>, `${p}${k}.`)
            : [],
      );
    const dump = hits.map((u) => ({ keys: Object.keys(u), flags: paths(u) }));
    NodeFS.mkdirSync(process.env.LOUD_DEBUG, { recursive: true });
    NodeFS.writeFileSync(
      NodePath.join(process.env.LOUD_DEBUG, "x-account.json"),
      JSON.stringify({ handle, premium, hits: hits.length, dump }, null, 1),
    );
  }
  const seen = new Map([...posts.tweets, ...replies.tweets].map((t) => [t.id, t]));
  const fresh = [...seen.values()]
    .filter((t) => t.posted && t.posted >= input.scanFrom)
    .map((t) => xRow(t, handle));
  input.progress(`${fresh.length} posts and replies`, fresh.length);
  const queue = await reader.open(`${X}/compose/post/unsent/scheduled`, {
    capture: X_ANSWERS,
    timeoutMs: 10_000,
    until: (objs) => xScheduled(objs, tz) !== null,
  });
  // With the list read past the start date, a stored post it did not show is gone — drop it.
  const plan = readPlan(
    input,
    [...seen.values()].map((t) => xRow(t, handle)),
  );
  return file(input, plan, fresh, followers, xScheduled(queue.objs, tz), premium);
}

export const COLLECTORS: Record<ChannelId, (input: CollectInput) => Promise<ChannelFile>> = {
  threads: collectThreads,
  ig: collectInstagram,
  fb: collectFacebook,
  x: collectX,
};

// ---- Listening ----

export interface ListenInput {
  readonly id: ChannelId;
  readonly queries: ReadonlyArray<string>;
  readonly timezone: string;
  readonly since: string;
  readonly reader: PageReader;
  readonly progress: (detail: string, count: number) => void;
}

/** Keywords per source per run, and results kept per keyword: listening is a sample, not a crawl. */
export const MAX_QUERIES = 8;
const PER_QUERY = 25;

/** Facebook's own words for a time ("3 hours ago", "Yesterday", "10 September", "8 Mar 2024") as a stamp. */
export function fbDate(s: string, now: Date, tz: string): string {
  // Strip accents once: "hôm qua"→"hom qua", "févr."→"fevr." — matching stays on plain letters.
  const t = s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "");
  const base = parseStamp(wallClock(now, tz)) ?? now.getTime();
  // "20 tháng 11" is a date, not "20 months ago" — the Vietnamese date pattern wins, so "thang" is not a month unit here.
  const viDate = /^(\d{1,2}) thang (\d{1,2})(?:,? (\d{4}))?/.exec(t);
  const rel = viDate
    ? null
    : /^(?:il y a |hace |ha |vor )?(\d+)\s*(m|min|mins|minute|minutes|minuto|minutos|minuten|phut|h|hr|hrs|hour|hours|gio|hora|horas|heure|heures|stunde|stunden|d|day|days|dia|dias|jour|jours|ngay|tag|tage|w|wk|wks|week|weeks|semana|semanas|semaine|semaines|tuan|woche|wochen|y|yr|yrs|year|years|ano|anos|an|jahr|mes|meses|mois|monat|monate|month|months|sem)\b/.exec(
        t,
      );
  if (rel) {
    const ms =
      {
        m: 60_000,
        min: 60_000,
        mins: 60_000,
        minute: 60_000,
        minutes: 60_000,
        minuto: 60_000,
        minutos: 60_000,
        minuten: 60_000,
        phut: 60_000,
        h: 3_600_000,
        hr: 3_600_000,
        hrs: 3_600_000,
        hour: 3_600_000,
        hours: 3_600_000,
        gio: 3_600_000,
        hora: 3_600_000,
        horas: 3_600_000,
        heure: 3_600_000,
        heures: 3_600_000,
        stunde: 3_600_000,
        stunden: 3_600_000,
        d: 864e5,
        day: 864e5,
        days: 864e5,
        dia: 864e5,
        dias: 864e5,
        jour: 864e5,
        jours: 864e5,
        ngay: 864e5,
        tag: 864e5,
        tage: 864e5,
        w: 7 * 864e5,
        wk: 7 * 864e5,
        wks: 7 * 864e5,
        week: 7 * 864e5,
        weeks: 7 * 864e5,
        semana: 7 * 864e5,
        semanas: 7 * 864e5,
        semaine: 7 * 864e5,
        semaines: 7 * 864e5,
        tuan: 7 * 864e5,
        woche: 7 * 864e5,
        wochen: 7 * 864e5,
        y: 365 * 864e5,
        yr: 365 * 864e5,
        yrs: 365 * 864e5,
        year: 365 * 864e5,
        years: 365 * 864e5,
        ano: 365 * 864e5,
        anos: 365 * 864e5,
        an: 365 * 864e5,
        jahr: 365 * 864e5,
        mes: 30 * 864e5,
        meses: 30 * 864e5,
        mois: 30 * 864e5,
        monat: 30 * 864e5,
        monate: 30 * 864e5,
        month: 30 * 864e5,
        months: 30 * 864e5,
        sem: 7 * 864e5,
        sems: 7 * 864e5,
      }[rel[2]!] ?? 0;
    if (ms) {
      const at = base - Number(rel[1]) * ms;
      // "2 days ago" points at the day; "5 minutes ago" keeps the clock.
      return ms >= 864e5 ? `${formatStamp(at).slice(0, 10)} 00:00` : formatStamp(at);
    }
  }
  if (/^(yesterday|ayer|hier|ontem|hom qua)\b/.test(t))
    return formatStamp(base - 864e5).slice(0, 10) + " 00:00";
  if (/^(today|hoy|heute|hoje|aujourd'hui|aujourdhui|hom nay)\b/.test(t) || t === "just now")
    return formatStamp(base);
  const MONTHS = new Map<string, number>();
  const names = [
    "jan ene janv",
    "feb fev fevr",
    "mar mars",
    "apr abr avr",
    "may mai mag",
    "jun juin",
    "jul juil",
    "aug ago aout",
    "sep set sept",
    "oct out okt",
    "nov",
    "dec dic dez des",
  ];
  names.forEach((list, i) => list.split(" ").forEach((m) => MONTHS.set(m, i)));
  // "20 tháng 11" in Vietnamese; "10 September" elsewhere.
  const dm = viDate ?? /^(\d{1,2}) ([a-z]{2,4})[a-z]*(?:,? (\d{4}))?/.exec(t);
  const md = /^([a-z]{3})[a-z]* (\d{1,2})(?:, (\d{4}))?/.exec(t) ?? null;
  const [day, mon, year] = dm ? [dm[1], dm[2], dm[3]] : md ? [md[2], md[1], md[3]] : [];
  let mi = -1;
  if (mon) {
    mi = /^\d{1,2}$/.test(mon)
      ? Number(mon) - 1
      : (MONTHS.get(mon.slice(0, 4)) ?? MONTHS.get(mon.slice(0, 3)) ?? -1);
  }
  if (!day || mi < 0 || mi > 11) return "";
  const y = year ? Number(year) : new Date(base).getUTCFullYear();
  let at = Date.UTC(y, mi, Number(day));
  if (!year && at > base) at = Date.UTC(y - 1, mi, Number(day));
  return formatStamp(at);
}

/** Video results on Facebook's search page, read from the page text (the answers carry no counts). */
const FB_VIDEOS = `JSON.stringify((()=>{const out={};
for(const a of document.querySelectorAll('a[href*="/watch/?"],a[href*="/reel/"],a[href*="/videos/"]')){
 const h=a.getAttribute('href')||'';const m=h.match(/[?&]v=(\\d+)/)||h.match(/\\/reel\\/(\\d+)/)||h.match(/\\/videos\\/(\\d+)/);if(!m)continue;
 let p=a;for(let k=0;k<12&&p&&!/ views/.test(p.innerText||'');k++)p=p.parentElement;if(!p)continue;
 const L=(p.innerText||'').split('\\n').map(s=>s.trim()).filter(Boolean);
 const vi=L.findIndex(l=>/ · [\\d.,]+[KM]? views$/.test(l));if(vi<0)continue;
 const mm=L[vi].match(/^(.*) · ([\\d.,]+[KM]?) views$/);
 const title=L.find(l=>!/ views$/.test(l)&&!/^\\d{1,2}:\\d{2}/.test(l)&&l.length>3)||'';
 if(!out[m[1]])out[m[1]]={id:m[1],title,page:L[vi-1]||'',date:mm[1],views:mm[2],reel:/\\/reel\\//.test(h)};
}
return Object.values(out)})())`;

interface FbVideo {
  readonly id: string;
  readonly title: string;
  readonly page: string;
  readonly date: string;
  readonly views: string;
  readonly reel: boolean;
}

async function searchOne(input: ListenInput, q: string): Promise<Array<ListenRow>> {
  const { reader, timezone: tz } = input;
  const enc = encodeURIComponent(q);
  switch (input.id) {
    case "threads": {
      const page = await reader.open(`${THREADS}/search?q=${enc}&serp_type=default&filter=recent`, {
        capture: META_GQL,
        embedKeys: ["searchResults"],
        until: (objs) => threadsSearch(objs, q, tz).length > 0,
      });
      return threadsSearch(page.objs, q, tz);
    }
    case "ig": {
      const page = await reader.open(`${IG}/explore/search/keyword/?q=${enc}`, {
        capture: IG_ANSWERS,
        until: (objs) => igSearch(objs, q, tz).length > 0,
      });
      return igSearch(page.objs, q, tz);
    }
    case "x": {
      const page = await reader.open(`${X}/search?q=${enc}&src=typed_query&f=live`, {
        capture: X_ANSWERS,
        until: (objs) => xTweets(objs, tz).length > 0,
      });
      return xTweets(page.objs, tz).map((t) => xListen(t, q));
    }
    case "fb": {
      await reader.open(`https://www.facebook.com/search/videos/?q=${enc}`, {
        capture: FB_ANSWERS,
        timeoutMs: 8_000,
      });
      const videos = (await reader.evaluate<Array<FbVideo>>(FB_VIDEOS)) ?? [];
      const now = new Date();
      return videos.map((v) => {
        const views = countFromText(v.views);
        return {
          channel: "fb",
          query: q,
          url: `https://www.facebook.com/${v.reel ? "reel/" : "watch/?v="}${v.id}`,
          author: v.page,
          posted: fbDate(v.date, now, tz),
          date_text: v.date,
          text: v.title.slice(0, 400),
          ...(views !== null ? { views } : {}),
        } satisfies ListenRow;
      });
    }
  }
}

export async function listen(input: ListenInput): Promise<Array<CollectedListenItem>> {
  const out: Array<CollectedListenItem> = [];
  for (const q of input.queries.slice(0, MAX_QUERIES)) {
    // An unparseable date keeps its result: dropping it silently loses the hit entirely.
    const rows = (await searchOne(input, q)).filter((r) => !r.posted || r.posted >= input.since);
    out.push(...rows.slice(0, PER_QUERY));
    input.progress(`"${q}": ${rows.length} results`, out.length);
  }
  return out;
}
