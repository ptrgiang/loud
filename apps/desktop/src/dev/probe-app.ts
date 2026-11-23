// Dev only: like probe.ts, but the login is Loud's own persisted partition, copied to a scratch userData first —
// LOUD_HOME points at the copy, LOUD_PROBE_ID the platform, LOUD_PROBE_URL the page to read. Prints only field paths
// and values of the handle's own user object; post text never leaves the page.
import * as Electron from "electron";
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";

import { Limiter } from "../collect/limiter.ts";
import { PageReader } from "../collect/PageReader.ts";
import { walk } from "../collect/json.ts";

const env = (k: string) => process.env[k] ?? "";
const fail = (why: string): never => {
  console.error(`[probe] ${why}`);
  Electron.app.exit(2);
  throw new Error(why);
};

/** Paths (dot-joined) whose name or siblings mention verification. */
function verifyPaths(o: Record<string, unknown>, prefix = ""): Array<string> {
  const out: Array<string> = [];
  for (const [k, v] of Object.entries(o)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (/verif|blue|badge|premium|is_business|affiliat/i.test(k))
      out.push(`${p}=${JSON.stringify(v)}`);
    else if (v && typeof v === "object" && !Array.isArray(v))
      out.push(...verifyPaths(v as Record<string, unknown>, p));
  }
  return out;
}

/** screen_name under any key name, anywhere inside the object. */
function hasScreenName(o: Record<string, unknown>, handle: string): boolean {
  const stack: Array<unknown> = [o];
  while (stack.length) {
    const cur = stack.pop();
    if (cur && typeof cur === "object") {
      for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
        if (
          typeof v === "string" &&
          /screen_?name/i.test(k) &&
          v.toLowerCase() === handle.toLowerCase()
        )
          return true;
        if (v && typeof v === "object") stack.push(v);
      }
    }
  }
  return false;
}

async function main() {
  const id = env("LOUD_PROBE_ID") as "fb" | "ig" | "threads" | "x";
  const handle = env("LOUD_PROBE_HANDLE") || fail("set LOUD_PROBE_HANDLE");
  const url = env("LOUD_PROBE_URL") || `https://x.com/${handle}`;
  const out = NodePath.resolve(env("LOUD_PROBE_OUT") || fail("set LOUD_PROBE_OUT"));
  const repo = NodePath.resolve(__dirname, "../../..");
  if (out.startsWith(repo + NodePath.sep) || out === repo)
    fail("LOUD_PROBE_OUT must be outside the repository");
  NodeFs.mkdirSync(out, { recursive: true });

  const ses = Electron.session.fromPartition(`persist:loud-${id}`);
  const limiter = new Limiter({}, () => {});
  const reader = new PageReader(id, ses, limiter, new AbortController().signal);
  try {
    // /home only renders for a live session; logged out it bounces to the login flow.
    const home = await reader.open("https://x.com/home", {
      capture: /$^/,
      until: () => false,
      timeoutMs: 12_000,
    });
    console.log(`[probe] home landed: ${home.url}`);
    const wait = { capture: /./, embedKeys: [], until: () => false };
    let page = await reader.open(url, { ...wait, timeoutMs: 15_000 });
    for (let i = 0; i < 2; i++) page = await reader.more({ ...wait, timeoutMs: 6_000 });
    NodeFs.writeFileSync(NodePath.join(out, "page.html"), page.html);
    console.log(`[probe] url=${page.url} objs=${page.objs.length}`);
    for (const [i, o] of page.objs.entries()) {
      const keys = o && typeof o === "object" ? Object.keys(o as object).slice(0, 12) : [typeof o];
      console.log(`[probe] captured[${i}]: ${keys.join(",")}`);
    }

    const users = walk(page.objs, (o) => hasScreenName(o, handle));
    console.log(`[probe] objects mentioning ${handle}: ${users.length}`);
    for (const [i, u] of users.slice(0, 4).entries()) {
      const paths = verifyPaths(u);
      console.log(`[probe] obj[${i}] keys: ${Object.keys(u).slice(0, 25).join(",")}`);
      console.log(
        `[probe] obj[${i}] verification paths: ${paths.length ? paths.join(" ; ") : "none"}`,
      );
    }
    NodeFs.writeFileSync(
      NodePath.join(out, "user.json"),
      JSON.stringify(users[0] ?? null, null, 1),
    );
  } finally {
    reader.close();
  }
}

const home = env("LOUD_HOME");
if (home) Electron.app.setPath("userData", home);
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
