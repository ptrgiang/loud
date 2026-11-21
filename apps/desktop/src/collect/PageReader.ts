// Reads a platform the way the user would: a hidden window on that platform's own session loads the page, and the
// debugger copies the answers the page itself fetched. Nothing is replayed or signed by Loud, so a request is never
// shaped differently from the platform's own. Each load and each scroll takes a limiter token first.
import type { ChannelId } from "@loud/contracts";
import * as Electron from "electron";

import { embedded, parseLoose } from "./json.ts";
import { Blocked, CHECKPOINT_PAUSE_MS, type Limiter, RATE_LIMIT_PAUSE_MS } from "./limiter.ts";

/** Pages a platform sends a session to when it wants a login, a check or a captcha. */
export const CHECKPOINT_URL =
  /\/(accounts\/login|login(\.php)?|checkpoint|challenge|captcha|i\/flow\/login|account\/access|two_step_verification|auth_platform)(\/|\?|$)/i;

export const isCheckpoint = (requested: string, landed: string) => {
  const path = (u: string) => {
    try {
      const x = new URL(u);
      return x.pathname + x.search;
    } catch {
      return u;
    }
  };
  return CHECKPOINT_URL.test(path(landed)) && !CHECKPOINT_URL.test(path(requested));
};

export interface OpenOptions {
  /** Answers worth keeping: their URL matches this. */
  readonly capture: RegExp;
  /** Embedded JSON blocks that mention one of these keys are parsed too. */
  readonly embedKeys?: ReadonlyArray<string>;
  /** Stop waiting once the objects so far satisfy this. */
  readonly until?: (objs: ReadonlyArray<unknown>) => boolean;
  readonly timeoutMs?: number;
}

export interface Page {
  readonly url: string;
  readonly html: string;
  /** Embedded blocks, then captured answers, in arrival order. */
  readonly objs: ReadonlyArray<unknown>;
}

const POLL_MS = 300;
/** Revalidate each page itself: a cached profile would hide the newest posts. */
const NO_CACHE = ["Cache-Control: no-cache", "Pragma: no-cache", ""].join("\n");

export class PageReader {
  private win: Electron.BrowserWindow | null = null;
  private captured: Array<unknown> = [];
  private pending = new Map<string, string>();
  private capture: RegExp = /$^/;
  private limited = false;

  constructor(
    private readonly id: ChannelId,
    private readonly session: Electron.Session,
    private readonly limiter: Limiter,
    private readonly signal: AbortSignal,
  ) {}

  private window(): Electron.BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const w = new Electron.BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: { session: this.session, sandbox: true, backgroundThrottling: false },
    });
    w.webContents.setAudioMuted(true);
    w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    const dbg = w.webContents.debugger;
    dbg.attach("1.3");
    dbg.on("message", (_e, method, params: Record<string, unknown>) => {
      if (method === "Network.responseReceived") {
        const res = params.response as { url: string; status: number };
        if (res.status === 429) this.limited = true;
        if (this.capture.test(res.url) && res.status < 400)
          this.pending.set(String(params.requestId), res.url);
      } else if (method === "Network.loadingFinished") {
        const requestId = String(params.requestId);
        if (!this.pending.has(requestId)) return;
        this.pending.delete(requestId);
        dbg
          .sendCommand("Network.getResponseBody", { requestId })
          .then((r: { body: string; base64Encoded: boolean }) => {
            const body = r.base64Encoded ? Buffer.from(r.body, "base64").toString("utf8") : r.body;
            this.captured.push(...parseLoose(body));
          })
          .catch(() => {
            // the page dropped it; nothing to read
          });
      }
    });
    void dbg.sendCommand("Network.enable");
    this.win = w;
    return w;
  }

  private stop(kind: "limit" | "checkpoint", landed = ""): never {
    // Only the path: it says which wall it was (login, checkpoint, captcha) without any account detail.
    let where = "";
    try {
      where = landed ? ` (sent to ${new URL(landed).pathname})` : "";
    } catch {
      // not a URL
    }
    const why =
      kind === "limit"
        ? "the platform answered 429 (too many requests); paused for 6 hours"
        : `the platform asked for a login or a check${where}; open it from Connections, deal with it, then resume`;
    this.limiter.pause(this.id, kind === "limit" ? RATE_LIMIT_PAUSE_MS : CHECKPOINT_PAUSE_MS, why);
    throw new Blocked(this.id, why);
  }

  private check(requested: string) {
    if (this.limited) {
      this.limited = false;
      this.stop("limit");
    }
    const landed = this.win?.webContents.getURL() ?? "";
    if (isCheckpoint(requested, landed)) this.stop("checkpoint", landed);
  }

  private async settle(opts: OpenOptions, url: string): Promise<Page> {
    const deadline = Date.now() + (opts.timeoutMs ?? 12_000);
    const wc = this.window().webContents;
    let html = "";
    for (;;) {
      if (this.signal.aborted) throw new Error("stopped");
      this.check(url);
      html = String(
        await wc.executeJavaScript("document.documentElement.outerHTML").catch(() => ""),
      );
      const objs = [...(opts.embedKeys ?? []).flatMap((k) => embedded(html, k)), ...this.captured];
      if (!opts.until || opts.until(objs) || Date.now() > deadline)
        return { url: wc.getURL(), html, objs };
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  async open(url: string, opts: OpenOptions): Promise<Page> {
    await this.limiter.take(this.id, this.signal);
    const w = this.window();
    this.capture = opts.capture;
    this.captured = [];
    this.pending.clear();
    await w.loadURL(url, { extraHeaders: NO_CACHE }).catch((e: unknown) => {
      // A client-side redirect aborts the first load; the page still arrives.
      if (!String(e).includes("ERR_ABORTED")) throw e;
    });
    return this.settle(opts, url);
  }

  /** Scroll for more; keeps what was captured so far. */
  async more(opts: OpenOptions): Promise<Page> {
    await this.limiter.take(this.id, this.signal);
    const wc = this.window().webContents;
    await wc
      .executeJavaScript("window.scrollBy(0, document.body.scrollHeight)")
      .catch(() => undefined);
    return this.settle(opts, wc.getURL());
  }

  /** Runs a read-only expression in the page and returns its JSON result. */
  async evaluate<A>(expression: string): Promise<A | null> {
    try {
      return JSON.parse(String(await this.window().webContents.executeJavaScript(expression))) as A;
    } catch {
      return null;
    }
  }

  /** An API GET the logged-in page could make, through the same session and cookies. */
  async fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
    await this.limiter.take(this.id, this.signal);
    const r = await this.session.fetch(url, {
      headers: { Accept: "application/json", ...headers },
    });
    if (r.status === 429) this.stop("limit");
    if (isCheckpoint(url, r.url)) this.stop("checkpoint", r.url);
    if (!r.ok) return null;
    return r.json().catch(() => null);
  }

  close() {
    if (this.win && !this.win.isDestroyed()) {
      try {
        this.win.webContents.debugger.detach();
      } catch {
        // already detached
      }
      this.win.destroy();
    }
    this.win = null;
  }
}
