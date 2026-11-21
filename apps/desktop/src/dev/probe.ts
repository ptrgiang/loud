// Dev only: runs Loud's own collectors, or records what a page loads, against a login borrowed from a browser profile.
// The session comes as JSON (huashu-chrome `run --format json`, or a bare cookie array; scripts/probe.mjs passes it) in an
// in-memory partition that is dropped on exit. Output goes to LOUD_PROBE_OUT, which must be outside the repository:
// it holds real posts. See docs/probe.md.
import { CHANNEL_IDS, type ChannelId, type CollectedPost } from "@loud/contracts";
import * as Electron from "electron";
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";

import { wallClock } from "../build/time.ts";
import { COLLECTORS } from "../collect/collectors.ts";
import { Limiter } from "../collect/limiter.ts";
import { PageReader } from "../collect/PageReader.ts";

interface Cookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path?: string;
  readonly secure?: boolean;
  readonly httpOnly?: boolean;
  readonly session?: boolean;
  readonly expirationDate?: number;
  readonly sameSite?: string;
}

const env = (k: string) => process.env[k] ?? "";
const fail = (why: string): never => {
  console.error(`[probe] ${why}`);
  Electron.app.exit(2);
  throw new Error(why);
};

const SAME_SITE: Record<string, "unspecified" | "no_restriction" | "lax" | "strict"> = {
  no_restriction: "no_restriction",
  lax: "lax",
  strict: "strict",
};

async function loadSession(id: string) {
  const raw = JSON.parse(
    env("LOUD_PROBE_SESSION") || fail("no session: run through scripts/probe.mjs"),
  ) as { cookies?: Array<Cookie>; userAgent?: string } | Array<Cookie>;
  const cookies = Array.isArray(raw) ? raw : (raw.cookies ?? []);
  if (!cookies.length) fail("no cookies in the session");
  // "persist:" is left out on purpose: nothing of this login is written to disk.
  const ses = Electron.session.fromPartition(`probe-${id}-${process.pid}`);
  for (const c of cookies) {
    const host = c.domain.replace(/^\./, "");
    await ses.cookies
      .set({
        url: `https://${host}${c.path ?? "/"}`,
        name: c.name,
        value: c.value,
        ...(c.domain.startsWith(".") ? { domain: c.domain } : {}),
        path: c.path ?? "/",
        secure: c.secure ?? true,
        httpOnly: c.httpOnly ?? false,
        ...(c.session || !c.expirationDate ? {} : { expirationDate: c.expirationDate }),
        sameSite: SAME_SITE[c.sameSite ?? ""] ?? "unspecified",
      })
      .catch((e: unknown) => console.error(`[probe] cookie ${c.name} skipped: ${String(e)}`));
  }
  if (!Array.isArray(raw) && raw.userAgent) ses.setUserAgent(raw.userAgent);
  console.log(`[probe] ${cookies.length} cookies loaded into a memory-only session`);
  return ses;
}

/** Per-day counts and the newest stamp: enough to compare with the platform without printing any post. */
const summary = (posts: ReadonlyArray<CollectedPost>) => {
  const byDay: Record<string, number> = {};
  for (const p of posts) {
    const d = (p.posted ?? "?").slice(0, 10);
    byDay[d] = (byDay[d] ?? 0) + 1;
  }
  return {
    posts: posts.length,
    withViews: posts.filter((p) => p.views !== undefined).length,
    newest: posts[0]?.posted ?? null,
    byDay,
  };
};

async function main() {
  const out = NodePath.resolve(env("LOUD_PROBE_OUT") || fail("set LOUD_PROBE_OUT"));
  const repo = NodePath.resolve(__dirname, "../../..");
  if (out.startsWith(repo + NodePath.sep) || out === repo)
    fail("LOUD_PROBE_OUT must be outside the repository");
  NodeFs.mkdirSync(out, { recursive: true });
  const mode = env("LOUD_PROBE_MODE") || "collect";
  const id = env("LOUD_PROBE_PLATFORM") as ChannelId;
  if (!CHANNEL_IDS.includes(id))
    fail(`LOUD_PROBE_PLATFORM must be one of ${CHANNEL_IDS.join(", ")}`);
  const ses = await loadSession(id);
  const limiter = new Limiter({}, () => {});
  const reader = new PageReader(id, ses, limiter, new AbortController().signal);
  const tz = env("LOUD_PROBE_TZ") || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const write = (name: string, v: unknown) =>
    NodeFs.writeFileSync(NodePath.join(out, name), JSON.stringify(v, null, 1));

  try {
    if (mode === "collect") {
      const today = wallClock(new Date(), tz).slice(0, 10);
      const since = env("LOUD_PROBE_SINCE") || today;
      const scanFrom = env("LOUD_PROBE_SCAN_FROM") || since;
      const file = await COLLECTORS[id]({
        id,
        handle: env("LOUD_PROBE_HANDLE") || fail("set LOUD_PROBE_HANDLE"),
        assetId: env("LOUD_PROBE_ASSET") || undefined,
        timezone: tz,
        since,
        scanFrom,
        full: scanFrom === since,
        old: null,
        reader,
        progress: (detail) => console.log(`[probe] ${detail}`),
      });
      write(`${id}.json`, file);
      console.log(`[probe] result ${JSON.stringify(summary(file.posts))}`);
    } else if (mode === "page") {
      // Every JSON answer the page fetched while loading and scrolling, plus its embedded blocks, for reading later.
      const url = env("LOUD_PROBE_URL") || fail("set LOUD_PROBE_URL");
      const keys = env("LOUD_PROBE_KEYS").split(",").filter(Boolean);
      const scrolls = Number(env("LOUD_PROBE_SCROLLS") || 2);
      const capture = new RegExp(env("LOUD_PROBE_CAPTURE") || "graphql|/api/");
      // Never satisfied, so each step waits its full time for the page's answers.
      const wait = { capture, embedKeys: keys, until: () => false };
      let page = await reader.open(url, { ...wait, timeoutMs: 12_000 });
      for (let i = 0; i < scrolls; i++) page = await reader.more({ ...wait, timeoutMs: 6_000 });
      write("page.json", { url: page.url, objs: page.objs });
      NodeFs.writeFileSync(NodePath.join(out, "page.html"), page.html);
      console.log(`[probe] ${page.objs.length} objects`);
    } else fail(`unknown LOUD_PROBE_MODE ${mode}`);
  } finally {
    reader.close();
    await ses.clearStorageData().catch(() => undefined);
  }
}

Electron.app.on("window-all-closed", () => undefined);
void Electron.app.whenReady().then(() =>
  main().then(
    () => Electron.app.exit(0),
    (e: unknown) => {
      console.error(`[probe] ${e instanceof Error ? e.message : String(e)}`);
      Electron.app.exit(1);
    },
  ),
);
