// loud.trysometh.ing: static pages from ./public, plus the usage endpoint the app posts to (only after the user said
// yes) and the public totals. Assets are matched before this runs, so it only sees /api/* and missing pages.
import {
  CHANNEL_IDS,
  COLLECT_STEPS,
  type CollectStep,
  emptyCollect,
  type StepTally,
} from "@loud/contracts";

import type { Env, ExecutionContext } from "./cloudflare.ts";
import {
  countDownloads,
  dayBefore,
  emptyPlatforms,
  MAX_BODY,
  mergeCollect,
  parseReport,
  type ReleaseAsset,
  type Stats,
} from "./usage.ts";

const RELEASES = "https://api.github.com/repos/ptrgiang/loud/releases?per_page=100";
const STATS_TTL = 3600;
/** Rows older than this are deleted by the daily cron. */
const KEEP_DAYS = 400;
const TALLY_KEYS = ["runs", "done", "failed", "blocked"] as const;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });

async function receive(request: Request, env: Env): Promise<Response> {
  const length = Number(request.headers.get("Content-Length") ?? 0);
  if (length > MAX_BODY) return json({ error: "too large" }, 413);
  const report = parseReport(await request.text());
  if (!report) return json({ error: "not a usage report" }, 400);
  const day = new Date().toISOString().slice(0, 10);

  // A second report on the same day (sharing turned off and on, or a retry) adds its counts to the first.
  const prior = await env.DB.prepare("SELECT collect FROM reports WHERE install = ?1 AND day = ?2")
    .bind(report.install, day)
    .first<{ collect: string }>();
  const collect = prior
    ? mergeCollect(JSON.parse(prior.collect) as Record<CollectStep, StepTally>, report.collect)
    : report.collect;
  await env.DB.prepare(
    `INSERT INTO reports (install, day, version, os, arch, agent, update_checks, platforms, collect)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
     ON CONFLICT (install, day) DO UPDATE SET version = ?3, os = ?4, arch = ?5, agent = ?6,
       update_checks = ?7, platforms = ?8, collect = ?9`,
  )
    .bind(
      report.install,
      day,
      report.version,
      report.os,
      report.arch,
      report.agent ? 1 : 0,
      report.updateChecks ? 1 : 0,
      JSON.stringify(report.platforms),
      JSON.stringify(collect),
    )
    .run();
  return json({ ok: true });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Turning sharing off in the app deletes what that install sent. */
async function forget(install: string, env: Env): Promise<Response> {
  if (!UUID.test(install)) return json({ error: "not an install id" }, 400);
  await env.DB.prepare("DELETE FROM reports WHERE install = ?1").bind(install).run();
  return json({ ok: true });
}

async function downloads(): Promise<Stats["downloads"]> {
  try {
    const res = await fetch(RELEASES, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "loud-site" },
    });
    if (!res.ok) return null;
    const releases = (await res.json()) as ReadonlyArray<{ assets: ReadonlyArray<ReleaseAsset> }>;
    return countDownloads(releases.flatMap((r) => r.assets));
  } catch {
    return null;
  }
}

async function stats(env: Env): Promise<Stats> {
  const now = new Date();
  const d7 = dayBefore(now, 6);
  const d30 = dayBefore(now, 29);
  const latest = `WITH latest AS (
      SELECT r.* FROM reports r
      JOIN (SELECT install, MAX(day) AS d FROM reports WHERE day >= ?1 GROUP BY install) m
        ON r.install = m.install AND r.day = m.d)`;
  const connected = CHANNEL_IDS.map(
    (id) => `SUM(json_extract(platforms, '$.${id}.connected')) AS ${id}`,
  ).join(", ");
  const tallies = COLLECT_STEPS.flatMap((step) =>
    TALLY_KEYS.map((k) => `SUM(json_extract(collect, '$.${step}.${k}')) AS ${step}_${k}`),
  ).join(", ");
  const db = env.DB;
  const [active, daily, versions, os, platforms, collects] = await db.batch<
    Record<string, string | number | null>
  >([
    db
      .prepare(
        "SELECT COUNT(DISTINCT CASE WHEN day >= ?1 THEN install END) AS days7, COUNT(DISTINCT install) AS days30 FROM reports WHERE day >= ?2",
      )
      .bind(d7, d30),
    db
      .prepare(
        "SELECT day, COUNT(*) AS installs FROM reports WHERE day >= ?1 GROUP BY day ORDER BY day",
      )
      .bind(d30),
    db
      .prepare(
        `${latest} SELECT version, COUNT(*) AS installs FROM latest GROUP BY version ORDER BY installs DESC`,
      )
      .bind(d30),
    db
      .prepare(
        `${latest} SELECT os, COUNT(*) AS installs FROM latest GROUP BY os ORDER BY installs DESC`,
      )
      .bind(d30),
    db.prepare(`${latest} SELECT ${connected} FROM latest`).bind(d30),
    db.prepare(`SELECT ${tallies} FROM reports WHERE day >= ?1`).bind(d30),
  ]);

  const counts = emptyPlatforms();
  const row = platforms?.results[0];
  for (const id of CHANNEL_IDS) counts[id] = Number(row?.[id] ?? 0);
  const collect = emptyCollect();
  const sums = collects?.results[0];
  for (const step of COLLECT_STEPS)
    collect[step] = Object.fromEntries(
      TALLY_KEYS.map((k) => [k, Number(sums?.[`${step}_${k}`] ?? 0)]),
    ) as StepTally;

  return {
    generated: now.toISOString(),
    active: {
      days7: Number(active?.results[0]?.days7 ?? 0),
      days30: Number(active?.results[0]?.days30 ?? 0),
    },
    daily: (daily?.results ?? []).map((r) => ({
      day: String(r.day),
      installs: Number(r.installs),
    })),
    versions: (versions?.results ?? []).map((r) => ({
      version: String(r.version),
      installs: Number(r.installs),
    })),
    os: (os?.results ?? []).map((r) => ({ os: String(r.os), installs: Number(r.installs) })),
    platforms: counts,
    collect,
    downloads: await downloads(),
  };
}

async function cachedStats(request: Request, env: Env, ctx: ExecutionContext) {
  const key = new Request(new URL("/api/stats", request.url).toString());
  const hit = await caches.default.match(key);
  if (hit) return hit;
  const res = json(await stats(env), 200, { "Cache-Control": `public, max-age=${STATS_TTL}` });
  ctx.waitUntil(caches.default.put(key, res.clone()));
  return res;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/usage") {
      if (request.method !== "POST") return json({ error: "POST only" }, 405, { Allow: "POST" });
      return receive(request, env);
    }
    const install = /^\/api\/usage\/([^/]+)$/.exec(pathname)?.[1];
    if (install) {
      if (request.method !== "DELETE")
        return json({ error: "DELETE only" }, 405, { Allow: "DELETE" });
      return forget(install, env);
    }
    if (pathname === "/api/stats") {
      if (request.method !== "GET") return json({ error: "GET only" }, 405, { Allow: "GET" });
      return cachedStats(request, env, ctx);
    }
    if (pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await env.DB.prepare("DELETE FROM reports WHERE day < ?1")
      .bind(dayBefore(new Date(), KEEP_DAYS))
      .run();
  },
};
