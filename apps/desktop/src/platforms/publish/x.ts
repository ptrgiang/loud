// X: the intent URL already carries the draft's text, so the driver verifies it, attaches media, and clicks Post.
// The intent dialog has no scheduler — post.capable reports schedule:false.
import type { Draft } from "@loud/contracts";
import * as Electron from "electron";

import {
  attachFiles,
  checkpointCheck,
  click,
  evalIn,
  verifyText,
  waitFor,
  waitGone,
} from "./common.ts";

const EDITOR = '[data-testid="tweetTextarea_0"], .public-DraftEditor-content';
const FILE = 'input[data-testid="fileInput"]';
const POST = '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]';
// Upload progress appears while media transfers; done uploading = ready to post.
const UPLOADING = '[role="progressbar"], [data-testid*="upload"], [aria-label*="pload"]';

const TOTAL_MS = 60_000;

export const publish = async (
  wc: Electron.WebContents,
  draft: Draft,
  mediaPaths: ReadonlyArray<string>,
  schedule?: string,
) => {
  if (schedule)
    return {
      ok: false,
      stage: "schedule",
      message: "X's quick composer cannot schedule.",
    } as const;

  const blocked = await checkpointCheck(wc);
  if (blocked) return blocked;

  if (!(await waitFor(wc, EDITOR, 12_000)))
    return { ok: false, stage: "composer", message: "the composer did not appear" } as const;

  const bad = await verifyText(wc, EDITOR, draft);
  if (bad) return bad;

  if (mediaPaths.length) {
    if (!(await attachFiles(wc, FILE, mediaPaths)))
      return { ok: false, stage: "media", message: "the media slot was not found" } as const;
    // Wait out the upload before Post; a half-attached file would post as text-only.
    await waitGone(wc, UPLOADING, TOTAL_MS);
    await waitFor(wc, POST, 5_000);
  }

  if (!(await click(wc, POST)))
    return { ok: false, stage: "post", message: "the Post button was not found" } as const;

  // Posted shows as a toast ("Your post was sent") or a navigation back; the intent editor staying
  // in the DOM is normal — it is not a failure.
  const posted = await evalIn<boolean>(
    wc,
    `(()=>new Promise(r=>{const d=Date.now()+15_000;
const check=()=>{const t=[...document.querySelectorAll('[role="alert"],[data-testid="toast"]')]
  .some(e=>/(post|tweet).*(sent|posted)/i.test(e.innerText||""));
if(t)return r(true);
if(!document.querySelector(${JSON.stringify(EDITOR)}))return r(true);
if(Date.now()>d)return r(false);setTimeout(check,400)};check()}))()`,
  );
  return posted
    ? ({ ok: true, result: "posted" } as const)
    : ({
        ok: false,
        stage: "confirm",
        message: "no posted toast and the composer stayed open",
      } as const);
};
