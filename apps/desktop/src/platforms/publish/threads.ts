// Threads: the posting window opens threads.com, the driver opens the full composer itself — the intent dialog has
// no media slot, reply-audience, topic or community controls. Labels are localized, so matching is on words.
import type { Draft } from "@loud/contracts";
import * as Electron from "electron";

import {
  armRequest,
  attachFiles,
  checkpointCheck,
  evalIn,
  insertTextFallback,
  pace,
  typeText,
  verifyText,
  waitFor,
  waitGone,
} from "./common.ts";

const DIALOG = '[role="dialog"]';
const EDITOR = '[role="dialog"] [contenteditable="true"], [role="dialog"] textarea';
const FILE = '[role="dialog"] input[type="file"]';
const UPLOADING = '[role="progressbar"], [aria-label*="pload"]';

/** The home page's compose affordance: the "+" nav button or the "Start a thread" bar. */
const clickCompose = (wc: Electron.WebContents) =>
  evalIn<boolean>(
    wc,
    `(()=>{
const re=/(create|compose|new thread|start a thread|what's new|tạo|viết|créer|crear|erstellen)/i;
const el=[...document.querySelectorAll('[role="button"],button,[aria-label]')]
  .find(b=>re.test(b.getAttribute("aria-label")||"")||re.test((b.innerText||"").trim()));
if(!el)return false;el.click();return true})()`,
  );

/** The dialog's Post control is a role=button whose label is just the word "Post" (localized). */
const clickPost = (wc: Electron.WebContents) =>
  evalIn<boolean>(
    wc,
    `(()=>{const d=[...document.querySelectorAll('[role="dialog"]')].filter(x=>x.offsetParent!==null).find(x=>x.querySelector('[contenteditable="true"],textarea'));if(!d)return false;
const re=/^(post|đăng|publier|publicar|posten|postar|poste)$/i;
const el=[...d.querySelectorAll('[role="button"],button')].find(b=>re.test((b.innerText||b.textContent||"").trim()));
if(!el)return false;el.click();return true})()`,
  );

/** The composer's own "Community or topic" search box sits beside the username — type a name, then pick
 * the suggestion listbox's match so the post carries the real entity, not a caption hashtag. */
const pickSlot = async (wc: Electron.WebContents, name: string) => {
  const SLOT = '[role="dialog"] input[type="search"]';
  if (!(await waitFor(wc, SLOT, 4_000))) return false;
  const typed = (await typeText(wc, SLOT, name)) || (await insertTextFallback(wc, SLOT, name));
  if (!typed) return false;
  await pace();
  return await evalIn<boolean>(
    wc,
    `(()=>{const want=${JSON.stringify(name.toLowerCase())};
const opts=[...document.querySelectorAll('[role="option"],[role="listbox"] li,[role="menu"] li')]
  .filter(e=>e.offsetParent!==null);
const el=opts.find(e=>{const t=(e.innerText||"").trim().toLowerCase();
return t===want||t.includes(want)})??opts[0];
if(!el)return false;el.click();return true})()`,
  );
};

/** "Add to thread" appends a second editor in the same dialog — the draft's first comment goes there. */
const addThread = async (wc: Electron.WebContents, comment: string) => {
  const open = await evalIn<boolean>(
    wc,
    `(()=>{const d=[...document.querySelectorAll('[role="dialog"]')].filter(x=>x.offsetParent!==null).find(x=>x.querySelector('[contenteditable="true"],textarea'));if(!d)return false;
const re=/(add to thread|thêm vào thread|ajouter au thread|añadir al hilo|thread hinzufügen)/i;
const el=[...d.querySelectorAll('[role="button"],button,[aria-label]')]
  .find(b=>re.test(b.getAttribute("aria-label")||"")||re.test((b.innerText||"").trim()));
if(!el)return false;el.click();return true})()`,
  );
  if (!open) return false;
  await pace();
  const EDITORS = '[role="dialog"] [contenteditable="true"], [role="dialog"] textarea';
  // A second editor means the thread slot opened — the comment goes in the last one.
  const count = await evalIn<number>(
    wc,
    `[...document.querySelectorAll(${JSON.stringify(EDITORS)})].filter(e=>e.offsetParent!==null).length`,
  );
  if (!count || count < 2) return false;
  return (
    (await typeText(wc, EDITORS, comment, "last")) ||
    (await evalIn<boolean>(
      wc,
      `(()=>{const els=[...document.querySelectorAll(${JSON.stringify(EDITORS)})];const el=els[els.length-1];if(!el)return false;
el.focus();
if(el.tagName==="TEXTAREA"){const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set;set.call(el,${JSON.stringify(comment)})}else{el.textContent=${JSON.stringify(comment)}}
el.dispatchEvent(new InputEvent("input",{bubbles:true,data:${JSON.stringify(comment)}}));
return true})()`,
    ))
  );
};

const REPLY_LABEL: Record<NonNullable<Draft["reply"]>, string> = {
  anyone: "^(anyone|everyone|bất kỳ ai|tất cả)",
  followers: "(follower|theo dõi|abonnés|seguidores|profiles you follow)",
  mentioned: "(mention|nhắc đến|mentionné|mencionados)",
};

/** "Post options" opens a menu whose first group is "Who can reply and quote". */
const setReply = async (wc: Electron.WebContents, reply: Draft["reply"]) => {
  if (!reply) return true;
  const open = await evalIn<boolean>(
    wc,
    `(()=>{const d=[...document.querySelectorAll('[role="dialog"]')].filter(x=>x.offsetParent!==null).find(x=>x.querySelector('[contenteditable="true"],textarea'));if(!d)return false;
const re=/(post options|options|reply|quote|tuỳ chọn|opciones|optionen|options de publication)/i;
const el=[...d.querySelectorAll('[role="button"],button,[aria-label]')]
  .find(b=>re.test(b.getAttribute("aria-label")||"")||re.test((b.innerText||"").trim()));
if(!el)return false;el.click();return true})()`,
  );
  if (!open) return false;
  await waitFor(wc, '[role="menu"], [role="listbox"], [role="group"]', 4_000);
  return await evalIn<boolean>(
    wc,
    `(()=>{
const re=/${REPLY_LABEL[reply]}/i;
const el=[...document.querySelectorAll('[role="menuitemradio"],[role="menuitem"],[role="option"],[role="button"],button')]
  .find(b=>re.test((b.innerText||"").trim()));
if(!el)return false;el.click();return true})()`,
  );
};

const TOTAL_MS = 60_000;

export const publish = async (
  wc: Electron.WebContents,
  draft: Draft,
  mediaPaths: ReadonlyArray<string>,
) => {
  const blocked = await checkpointCheck(wc);
  if (blocked) return blocked;

  // No pre-fill on the home page: the driver opens the dialog and types the text itself. Hidden dialogs
  // linger in the DOM and a cancelled composer keeps its text — count only visible ones, and clear any
  // stale composer before typing so the caption lands in a clean editor.
  const staleCount = await evalIn<number>(
    wc,
    `(()=>{const dlgs=[...document.querySelectorAll(${JSON.stringify(DIALOG)})].filter(d=>d.offsetParent!==null);
return dlgs.filter(d=>d.querySelector('[contenteditable="true"],textarea')).length})()`,
  );
  for (let i = 0; i < (staleCount ?? 0); i++) {
    await evalIn<boolean>(
      wc,
      `(()=>{const dlgs=[...document.querySelectorAll(${JSON.stringify(DIALOG)})].filter(d=>d.offsetParent!==null);
for(const d of dlgs){const ed=d.querySelector('[contenteditable="true"],textarea');
if(!ed)continue;
const b=[...d.querySelectorAll('[role="button"],button')].find(x=>/(cancel|hủy|annuler|cancelar)/i.test((x.innerText||"").trim()));
if(b)b.click();return true}
return false})()`,
    );
    await pace();
    // Cancel can raise a "Discard post?" confirm — take it, otherwise the stale editor stays.
    await evalIn<boolean>(
      wc,
      `(()=>{const dlgs=[...document.querySelectorAll(${JSON.stringify(DIALOG)})].filter(d=>d.offsetParent!==null);
for(const d of dlgs){if(d.querySelector('[contenteditable="true"],textarea'))continue;
const b=[...d.querySelectorAll('[role="button"],button')].find(x=>/(discard|delete|leave|xoá|xóa|bỏ)/i.test((x.innerText||"").trim()));
if(b)b.click();return true}
return false})()`,
    );
    await pace();
  }
  const dialogOpen = await evalIn<boolean>(
    wc,
    `(()=>{const dlgs=[...document.querySelectorAll(${JSON.stringify(DIALOG)})].filter(d=>d.offsetParent!==null);
return dlgs.some(d=>d.querySelector('[contenteditable="true"],textarea'))})()`,
  );
  if (!dialogOpen) {
    if (!(await clickCompose(wc)))
      return {
        ok: false,
        stage: "composer",
        message: "the compose control was not found",
      } as const;
  }

  if (!(await waitFor(wc, EDITOR, 12_000)))
    return { ok: false, stage: "composer", message: "the composer dialog did not appear" } as const;
  await pace();

  const inserted =
    (await typeText(wc, EDITOR, draft.text)) || (await insertTextFallback(wc, EDITOR, draft.text));
  if (!inserted)
    return { ok: false, stage: "text", message: "the caption field would not take text" } as const;

  const bad = await verifyText(wc, EDITOR, draft);
  if (bad) return bad;

  if (mediaPaths.length) {
    await pace();
    if (!(await attachFiles(wc, FILE, mediaPaths)))
      return { ok: false, stage: "media", message: "the media input was not found" } as const;
    await waitGone(wc, UPLOADING, TOTAL_MS);
  }

  // Extras the composer has no control for are reported, not blocking: the post still goes out and the pane
  // names what it could not set.
  const missing: Array<string> = [];
  await pace();
  if (draft.comment && !(await addThread(wc, draft.comment))) missing.push("comment");
  if (draft.community && !(await pickSlot(wc, draft.community))) missing.push("community");
  if (draft.reply && !(await setReply(wc, draft.reply)))
    return {
      ok: false,
      stage: "reply",
      message: "the reply-audience menu was not found",
    } as const;

  await pace();
  // Threads can leave the composer rendered after a chained post — the editor staying visible is not
  // proof it failed. Arm the configure request as the real confirm signal before the Post click.
  const { paused, disarm } = await armRequest(wc, "*configure_text_post_app*", TOTAL_MS);
  try {
    if (!(await clickPost(wc)))
      return {
        ok: false,
        stage: "post",
        message: "the Post button was not found in the dialog",
      } as const;

    let req: Awaited<typeof paused> | null | undefined;
    paused
      .then((r) => {
        req = r;
      })
      .catch(() => {});
    const fired = await Promise.race([
      paused.then(() => true).catch(() => false),
      evalIn<boolean>(
        wc,
        `(async()=>{const deadline=Date.now()+${TOTAL_MS};
const toast=/post|shared|published|đã đăng|publi/i;
for(;;){
  const ed=[...document.querySelectorAll(${JSON.stringify(EDITOR)})].some(e=>e.offsetParent!==null);
  if(!ed)return true;
  const t=[...document.querySelectorAll('[role="alert"],[data-testid="toast"]')]
    .some(e=>toast.test(e.innerText||""));
  if(t)return true;
  if(Date.now()>deadline)return false;
  await new Promise(r=>setTimeout(r,400))}})()`,
      ),
    ]);

    // Request paused — let it continue unchanged, the platform signs and sends it.
    if (req) await wc.debugger.sendCommand("Fetch.continueRequest", { requestId: req.requestId });
    return fired
      ? ({ ok: true, result: "posted", ...(missing.length ? { missing } : {}) } as const)
      : ({ ok: false, stage: "confirm", message: "the dialog stayed open after Post" } as const);
  } finally {
    await disarm();
  }
};
