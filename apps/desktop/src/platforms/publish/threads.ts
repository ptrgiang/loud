// Threads: the posting window opens threads.com, the driver opens the full composer itself — the intent dialog has
// no media slot, reply-audience, topic or community controls. Labels are localized, so matching is on words.
import type { Draft } from "@loud/contracts";
import * as Electron from "electron";

import {
  attachFiles,
  checkpointCheck,
  evalIn,
  insertText,
  insertTextFallback,
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
    `(()=>{const d=document.querySelector('[role="dialog"]');if(!d)return false;
const re=/^(post|đăng|publier|publicar|posten|postar|poste)$/i;
const el=[...d.querySelectorAll('[role="button"],button')].find(b=>re.test((b.innerText||b.textContent||"").trim()));
if(!el)return false;el.click();return true})()`,
  );

/** "Add topic" opens a small field inside the dialog; typing then Enter sets it. Absent on builds that dropped topics. */
const addTopic = async (wc: Electron.WebContents, topic: string) => {
  const open = await evalIn<boolean>(
    wc,
    `(()=>{const d=document.querySelector('[role="dialog"]');if(!d)return false;
const re=/(add topic|thêm chủ đề|ajouter un sujet|agregar tema|thema hinzufügen|^topic)/i;
const el=[...d.querySelectorAll('[role="button"],button,[aria-label]')]
  .find(b=>re.test(b.getAttribute("aria-label")||"")||re.test((b.innerText||"").trim()));
if(!el)return false;el.click();return true})()`,
  );
  if (!open) return false;
  if (!(await waitFor(wc, '[role="dialog"] input[type="text"]', 4_000))) return false;
  return (
    (await insertText(wc, '[role="dialog"] input[type="text"]', topic)) ||
    (await insertTextFallback(wc, '[role="dialog"] input[type="text"]', topic))
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
    `(()=>{const d=document.querySelector('[role="dialog"]');if(!d)return false;
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

/** The community picker lists the account's communities by name — only builds with joined communities show it. */
const pickCommunity = async (wc: Electron.WebContents, name: string) => {
  const open = await evalIn<boolean>(
    wc,
    `(()=>{const d=document.querySelector('[role="dialog"]');if(!d)return false;
const re=/(community|communities|cộng đồng|communauté|comunidad)/i;
const el=[...d.querySelectorAll('[role="button"],button,[aria-label]')]
  .find(b=>re.test(b.getAttribute("aria-label")||"")||re.test((b.innerText||"").trim()));
if(!el)return false;el.click();return true})()`,
  );
  if (!open) return false;
  await waitFor(wc, '[role="menu"], [role="listbox"], [role="dialog"] [role="dialog"]', 4_000);
  return await evalIn<boolean>(
    wc,
    `(()=>{const want=${JSON.stringify(name.toLowerCase())};
const el=[...document.querySelectorAll('[role="menuitemradio"],[role="menuitem"],[role="option"],[role="button"],button,li')]
  .find(b=>(b.innerText||"").trim().toLowerCase()===want||(b.innerText||"").trim().toLowerCase().includes(want));
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

  // No pre-fill on the home page: the driver opens the dialog and types the text itself.
  if (!(await evalIn<boolean>(wc, `!!document.querySelector(${JSON.stringify(DIALOG)})`)))
    if (!(await clickCompose(wc)))
      return {
        ok: false,
        stage: "composer",
        message: "the compose control was not found",
      } as const;

  if (!(await waitFor(wc, EDITOR, 12_000)))
    return { ok: false, stage: "composer", message: "the composer dialog did not appear" } as const;

  const inserted =
    (await insertText(wc, EDITOR, draft.text)) ||
    (await insertTextFallback(wc, EDITOR, draft.text));
  if (!inserted)
    return { ok: false, stage: "text", message: "the caption field would not take text" } as const;

  const bad = await verifyText(wc, EDITOR, draft);
  if (bad) return bad;

  if (mediaPaths.length) {
    if (!(await attachFiles(wc, FILE, mediaPaths)))
      return { ok: false, stage: "media", message: "the media input was not found" } as const;
    await waitGone(wc, UPLOADING, TOTAL_MS);
  }

  // Extras the composer has no control for are reported, not blocking: the post still goes out and the pane
  // names what it could not set.
  const missing: Array<string> = [];
  if (draft.topic && !(await addTopic(wc, draft.topic))) missing.push("topic");
  if (draft.reply && !(await setReply(wc, draft.reply)))
    return {
      ok: false,
      stage: "reply",
      message: "the reply-audience menu was not found",
    } as const;
  if (draft.community && !(await pickCommunity(wc, draft.community))) missing.push("community");

  if (!(await clickPost(wc)))
    return {
      ok: false,
      stage: "post",
      message: "the Post button was not found in the dialog",
    } as const;

  // The home page keeps a hidden dialog in the DOM, so "[role=dialog] gone" is not the signal —
  // the composer editor disappearing or a posted toast is.
  const confirmed = await evalIn<boolean>(
    wc,
    `(async()=>{const deadline=Date.now()+${TOTAL_MS};
const toast=/post|shared|published|đã đăng|publi/i;
for(;;){
  if(!document.querySelector(${JSON.stringify(EDITOR)}))return true;
  const t=[...document.querySelectorAll('[role="alert"],[data-testid="toast"]')]
    .some(e=>toast.test(e.innerText||""));
  if(t)return true;
  if(Date.now()>deadline)return false;
  await new Promise(r=>setTimeout(r,400))}})()`,
  );
  return confirmed
    ? ({ ok: true, result: "posted", ...(missing.length ? { missing } : {}) } as const)
    : ({ ok: false, stage: "confirm", message: "the dialog stayed open after Post" } as const);
};
