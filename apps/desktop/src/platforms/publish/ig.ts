// Instagram: the posting window opens instagram.com; the driver clicks the nav "Post" (the "+"), attaches media,
// steps Next through crop and filters, and sets the composer's switches by label. The caption never goes through
// the Lexical editor — synthetic input renders in the DOM but never reaches the model, so the configure request
// is paused with CDP Fetch at Share time and its caption field rewritten before it continues to the server.
import { CHANNEL_TOGGLES, type Draft } from "@loud/contracts";
import * as Electron from "electron";

import {
  armRequest,
  attachFiles,
  checkpointCheck,
  evalIn,
  focusWindow,
  pace,
  setToggle,
  waitFor,
} from "./common.ts";

const DIALOG = '[role="dialog"]';
const EDITOR = '[role="dialog"] [contenteditable="true"], [role="dialog"] textarea';
const FILE = '[role="dialog"] input[type="file"]';
const STEP_BTN = "[role=\"dialog\"] [role=\"button\"], [role=\"dialog\"] button";
const CONFIGURE = "*api/v1/media/configure/*";
const TOTAL_MS = 60_000;

/** The nav rail's "+" create menu holds a "Post" svg; its nearest clickable ancestor opens the dialog. */
const clickCreate = (wc: Electron.WebContents) =>
  evalIn<boolean>(
    wc,
    `(()=>{const svg=[...document.querySelectorAll('svg[aria-label]')].filter(e=>e.offsetParent!==null)
.find(e=>/^(post|create|new post|bài viết|đăng)$/i.test((e.getAttribute('aria-label')||'').trim()));
if(!svg)return false;
// The handler lives on the nav item, not the svg — click the nearest interactive ancestor.
let p=svg.closest('[role="button"],[role="link"],a,button,[tabindex]');
if(!p)p=svg.parentElement?.parentElement;
if(!p)return false;p.click();return true})()`,
  );

const clickStep = (wc: Electron.WebContents, re: string) =>
  evalIn<boolean>(
    wc,
    `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(STEP_BTN)})]
.filter(e=>e.offsetParent!==null)
.find(b=>${re}.test((b.innerText||b.getAttribute('aria-label')||'').trim()));
if(!el)return false;el.click();return true})()`,
  );

interface PausedRequest {
  requestId: string;
  request: { url: string; postData?: string };
}

export const publish = async (
  wc: Electron.WebContents,
  draft: Draft,
  mediaPaths: ReadonlyArray<string>,
) => {
  const blocked = await checkpointCheck(wc);
  if (blocked) return blocked;

  if (!mediaPaths.length)
    return {
      ok: false,
      stage: "media",
      message: "Instagram posts need an image or video — the composer cannot start without one",
    } as const;

  const dialogOpen = await evalIn<boolean>(
    wc,
    `(()=>{const dlgs=[...document.querySelectorAll(${JSON.stringify(DIALOG)})].filter(d=>d.offsetParent!==null);
return dlgs.some(d=>d.querySelector('input[type="file"]'))})()`,
  );
  if (!dialogOpen) {
    if (!(await clickCreate(wc)))
      return { ok: false, stage: "composer", message: "the create-post control was not found" } as const;
  }
  await pace();
  // The file input sits display:none behind "Select from computer" — existence, not visibility.
  const dialogReady = await (async () => {
    const deadline = Date.now() + 12_000;
    for (;;) {
      const has = await evalIn<boolean>(
        wc,
        `(()=>{const dlgs=[...document.querySelectorAll(${JSON.stringify(DIALOG)})].filter(d=>d.offsetParent!==null);
return dlgs.some(d=>d.querySelector('input[type="file"]'))})()`,
      );
      if (has) return true;
      if (Date.now() > deadline) return false;
      await new Promise((r) => setTimeout(r, 250));
    }
  })();
  if (!dialogReady)
    return { ok: false, stage: "composer", message: "the create dialog did not appear" } as const;

  await pace();
  if (!(await attachFiles(wc, FILE, mediaPaths)))
    return { ok: false, stage: "media", message: "the media input was not found" } as const;

  // Crop step then filters step — both just need their "Next".
  for (let i = 0; i < 2; i++) {
    await pace();
    if (!(await clickStep(wc, "/^(next|tiếp|suivant|siguiente|weiter)$/i")))
      return { ok: false, stage: "wizard", message: "the Next button was not found" } as const;
  }

  if (!(await waitFor(wc, EDITOR, 10_000)))
    return { ok: false, stage: "composer", message: "the caption step did not appear" } as const;

  // The composer's switches, each set by its label to the draft's choice.
  const toggles = CHANNEL_TOGGLES.ig;
  const missing: Array<string> = [];
  const opts = draft.options ?? {};
  for (const tg of toggles) {
    const want = opts[tg.key] ?? tg.on;
    await pace();
    const did = await setToggle(wc, `/${tg.label.replace(/\s+/g, "\\s+")}/i`, want);
    if (did === "missing" && want !== tg.on) missing.push(tg.key);
  }

  // IG's own Schedule needs the time ~20+ minutes out; the Scheduler firing at that time, or a draft
  // with no time, means share now instead — named in `missing` so the pane says what happened.
  const scheduleOn = opts.schedule ?? false;
  const at = draft.scheduledAt ? new Date(draft.scheduledAt) : null;
  const schedulable = scheduleOn && at !== null && at.getTime() - Date.now() > 20 * 60_000;
  if (scheduleOn && !schedulable) missing.push("schedule");

  const { paused, disarm } = await armRequest(wc, CONFIGURE, TOTAL_MS);
  try {
    focusWindow(wc);
    await pace();
    const submit = schedulable
      ? "/^(schedule|lên lịch)$/i"
      : "/^(share|chia sẻ|partager|compartir|teilen)$/i";
    if (!(await clickStep(wc, submit)))
      return { ok: false, stage: "post", message: "the Share button was not found" } as const;

    const req = await paused.catch(() => null);
    if (!req)
      return { ok: false, stage: "confirm", message: "the share request never fired" } as const;
    const body = req.request.postData ?? "";
    if (!/caption=/.test(body))
      return {
        ok: false,
        stage: "post",
        message: "the configure request had no caption field to fill",
      } as const;
    let next = body.replace(/caption=[^&]*/, `caption=${encodeURIComponent(draft.text)}`);
    if (schedulable && at !== null) {
      const secs = Math.floor(at.getTime() / 1000);
      next = /scheduled_publish_time=/.test(next)
        ? next.replace(/scheduled_publish_time=[^&]*/, `scheduled_publish_time=${secs}`)
        : `${next}&scheduled_publish_time=${secs}`;
    }
    await wc.debugger.sendCommand("Fetch.continueRequest", {
      requestId: req.requestId,
      postData: Buffer.from(next, "utf8").toString("base64"),
    });

    // Shared = the dialog closes, or flips to the "Your post has been shared" confirmation with a Done.
    const shared = await evalIn<boolean>(
      wc,
      `(async()=>{const deadline=Date.now()+${TOTAL_MS};
const shared=/post shared|has been shared|has been scheduled|đã chia sẻ|đã đăng|đã lên lịch/i;
const toast=/shared|published|scheduled|đã chia|đã đăng|publi/i;
for(;;){
  const dlgs=[...document.querySelectorAll(${JSON.stringify(DIALOG)})].filter(x=>x.offsetParent!==null);
  if(!dlgs.length)return true;
  if(dlgs.some(d=>shared.test(d.innerText||"")))return true;
  if([...document.querySelectorAll('[role="alert"],[data-testid="toast"]')]
    .some(e=>toast.test(e.innerText||"")))return true;
  if(Date.now()>deadline)return false;
  await new Promise(r=>setTimeout(r,400))}})()`,
    );
    if (!shared)
      return { ok: false, stage: "confirm", message: "no share confirmation appeared" } as const;
    await pace();
    await clickStep(wc, "/^(done|xong)$/i");
    return {
      ok: true,
      result: schedulable ? "scheduled" : "posted",
      ...(missing.length ? { missing } : {}),
    } as const;
  } finally {
    await disarm();
  }
};
