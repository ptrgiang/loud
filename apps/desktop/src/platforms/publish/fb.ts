// Facebook: the posting window opens the Meta Business Suite composer — the text field is a contenteditable
// combobox that takes a real paste, media sits behind "Add photo/video", the switches are labelled inputs, and
// submit is "Publish". The window comes forward before the submit click — backgrounded dialogs stall.
import { CHANNEL_TOGGLES, type Draft } from "@loud/contracts";
import * as Electron from "electron";

import {
  attachFiles,
  checkpointCheck,
  evalIn,
  focusWindow,
  insertTextFallback,
  insertNative,
  pace,
  pasteImage,
  pasteText,
  setToggle,
  verifyText,
  waitFor,
} from "./common.ts";

const EDITOR = '[role="combobox"][contenteditable="true"], [contenteditable="true"][role="textbox"]';
const FILE = 'input[type="file"]';

const clickBtn = (wc: Electron.WebContents, re: string) =>
  evalIn<boolean>(
    wc,
    `(()=>{const el=[...document.querySelectorAll('[role="button"],button')]
.filter(e=>e.offsetParent!==null)
.find(b=>${re}.test((b.innerText||b.getAttribute('aria-label')||'').trim()));
if(!el)return false;el.click();return true})()`,
  );

const TOTAL_MS = 60_000;

export const publish = async (
  wc: Electron.WebContents,
  draft: Draft,
  mediaPaths: ReadonlyArray<string>,
) => {
  const blocked = await checkpointCheck(wc);
  if (blocked) return blocked;

  if (!(await waitFor(wc, EDITOR, 15_000)))
    return { ok: false, stage: "composer", message: "the composer did not appear" } as const;
  await pace();

  // ClipboardEvent paste first — the proven human path — then the native inserter as backup.
  const inserted =
    (await pasteText(wc, EDITOR, draft.text)) ||
    (await insertNative(wc, EDITOR, draft.text)) ||
    (await insertTextFallback(wc, EDITOR, draft.text));
  if (!inserted)
    return { ok: false, stage: "text", message: "the caption field would not take text" } as const;

  const bad = await verifyText(wc, EDITOR, draft);
  if (bad) return bad;

  // The composer's switches, each set by its label to the draft's choice.
  const missing: Array<string> = [];
  if (mediaPaths.length) {
    await pace();
    const first = mediaPaths[0];
    const viaInput = await clickBtn(wc, "/(add photo|add photo\\/video|thêm ảnh|ajouter)/i");
    if (viaInput) {
      // The file input may be display:none — wait for existence, not visibility.
      await evalIn<boolean>(
        wc,
        `(async()=>{const deadline=Date.now()+6000;
for(;;){
  if(document.querySelector(${JSON.stringify(FILE)}))return true;
  if(Date.now()>deadline)return false;
  await new Promise(r=>setTimeout(r,250))}})()`,
      );
      await attachFiles(wc, FILE, mediaPaths);
    }
    // Business Suite's picker is a native dialog a driver can't answer — fall back to a real
    // clipboard paste, which the composer accepts like a dropped screenshot.
    const attached = await evalIn<boolean>(
      wc,
      `[...document.querySelectorAll('img')].some(i=>i.offsetParent!==null&&(i.src||'').startsWith('blob:'))`,
    );
    if (!attached && first && /\.(png|jpe?g|gif|webp)$/i.test(first)) {
      await pasteImage(wc, EDITOR, first);
    }
    const ok = await evalIn<boolean>(
      wc,
      `[...document.querySelectorAll('img')].some(i=>i.offsetParent!==null&&(i.src||'').startsWith('blob:'))`,
    );
    if (!ok) missing.push("media");
    // Upload finishes before Publish — watch for progress to clear.
    await evalIn<boolean>(
      wc,
      `(async()=>{const deadline=Date.now()+${TOTAL_MS};
for(;;){
  const p=[...document.querySelectorAll('[role="progressbar"],[aria-label*="pload"],[aria-label*="processing"]')]
    .some(e=>e.offsetParent!==null);
  if(!p)return true;
  if(Date.now()>deadline)return true;
  await new Promise(r=>setTimeout(r,500))}})()`,
    );
  }

  const opts = draft.options ?? {};
  for (const tg of CHANNEL_TOGGLES.fb) {
    const want = opts[tg.key] ?? tg.on;
    await pace();
    const did = await setToggle(wc, `/${tg.label.replace(/\s+/g, "\\s+")}/i`, want);
    if (did === "missing" && want !== tg.on) missing.push(tg.key);
  }

  focusWindow(wc);
  await pace();
  if (!(await clickBtn(wc, "/^(publish|đăng|publier|publicar|veröffentlichen|schedule)$/i")))
    return { ok: false, stage: "post", message: "the Publish button was not found" } as const;

  // Published = the composer flips to the "more posts?" upsell, the editor leaves, or a toast confirms.
  const confirmed = await evalIn<boolean>(
    wc,
    `(async()=>{const deadline=Date.now()+${TOTAL_MS};
const done=/more posts that you want to publish|schedule another post|maybe later|published|posted|scheduled|đã đăng|đã chia/i;
for(;;){
  const dlgs=[...document.querySelectorAll('[role="dialog"]')].filter(x=>x.offsetParent!==null);
  if(dlgs.some(d=>done.test(d.innerText||"")))return true;
  const ed=[...document.querySelectorAll(${JSON.stringify(EDITOR)})].some(e=>e.offsetParent!==null);
  if(!ed)return true;
  const t=[...document.querySelectorAll('[role="alert"]')].some(e=>done.test(e.innerText||""));
  if(t)return true;
  if(Date.now()>deadline)return false;
  await new Promise(r=>setTimeout(r,400))}})()`,
  );
  if (!confirmed)
    return { ok: false, stage: "confirm", message: "the composer stayed open after Publish" } as const;
  await pace();
  await clickBtn(wc, "/^(maybe later|để sau|close)$/i");
  return { ok: true, result: "posted", ...(missing.length ? { missing } : {}) } as const;
};
