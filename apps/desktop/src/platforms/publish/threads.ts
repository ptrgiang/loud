// Threads: the intent URL opens a dialog with the text pre-filled; verify it, attach media, click the dialog's Post.
// The label is localized, so the driver matches on words, not a data attribute.
import type { Draft } from "@loud/contracts";
import * as Electron from "electron";

import { attachFiles, checkpointCheck, evalIn, verifyText, waitFor, waitGone } from "./common.ts";

const DIALOG = '[role="dialog"]';
const EDITOR = '[role="dialog"] [contenteditable="true"], [role="dialog"] textarea';
const FILE = '[role="dialog"] input[type="file"]';
const UPLOADING = '[role="progressbar"], [aria-label*="pload"]';

/** The dialog's Post control is a role=button whose label is just the word "Post" (localized). */
const clickPost = (wc: Electron.WebContents) =>
  evalIn<boolean>(
    wc,
    `(()=>{const d=document.querySelector('[role="dialog"]');if(!d)return false;
const re=/^(post|đăng|publier|publicar|posten|postar|poste)$/i;
const el=[...d.querySelectorAll('[role="button"],button')].find(b=>re.test((b.innerText||b.textContent||"").trim()));
if(!el)return false;el.click();return true})()`,
  );

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
      message: "Threads' quick composer cannot schedule.",
    } as const;

  const blocked = await checkpointCheck(wc);
  if (blocked) return blocked;

  if (!(await waitFor(wc, EDITOR, 12_000)))
    return { ok: false, stage: "composer", message: "the composer dialog did not appear" } as const;

  const bad = await verifyText(wc, EDITOR, draft);
  if (bad) return bad;

  if (mediaPaths.length) {
    if (!(await attachFiles(wc, FILE, mediaPaths)))
      return { ok: false, stage: "media", message: "the media input was not found" } as const;
    await waitGone(wc, UPLOADING, TOTAL_MS);
  }

  if (!(await clickPost(wc)))
    return {
      ok: false,
      stage: "post",
      message: "the Post button was not found in the dialog",
    } as const;

  const done = await waitGone(wc, DIALOG, 15_000);
  return done
    ? ({ ok: true, result: "posted" } as const)
    : ({ ok: false, stage: "confirm", message: "the dialog stayed open after Post" } as const);
};
