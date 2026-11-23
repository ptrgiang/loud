// Shared helpers for the publish drivers: everything runs in the composer's own page — `executeJavaScript` for DOM
// reads and clicks, the debugger's DOM.setFileInputFiles for media (the only reliable way to hand local files to an
// <input type=file>). Nothing is retried through a checkpoint; that word fails the run.
import type { Draft } from "@loud/contracts";
import * as Electron from "electron";

export type PublishResult =
  | {
      readonly ok: true;
      readonly result: "posted" | "scheduled";
      /** Draft extras the composer had no control for — posted anyway, named here. */
      readonly missing?: ReadonlyArray<string>;
    }
  | { readonly ok: false; readonly stage: string; readonly message: string };

const fail = (stage: string, message: string): PublishResult => ({ ok: false, stage, message });
export const ok = (result: "posted" | "scheduled"): PublishResult => ({ ok: true, result });

/** Runs a JS expression in the page; a thrown error becomes `null` — callers decide what missing means. */
export const evalIn = async <A>(wc: Electron.WebContents, js: string): Promise<A | null> => {
  try {
    return (await wc.executeJavaScript(js, true)) as A;
  } catch {
    return null;
  }
};

const POLL_MS = 250;

/** Waits until `selector` matches in the page; `false` on timeout. */
export const waitFor = async (
  wc: Electron.WebContents,
  selector: string,
  ms: number,
): Promise<boolean> => {
  const deadline = Date.now() + ms;
  const sel = JSON.stringify(selector);
  for (;;) {
    const found = await evalIn<boolean>(wc, `!!document.querySelector(${sel})`);
    if (found) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
};

/** Waits until `selector` stops matching — the composer closed or navigated away. */
export const waitGone = async (
  wc: Electron.WebContents,
  selector: string,
  ms: number,
): Promise<boolean> => {
  const deadline = Date.now() + ms;
  const sel = JSON.stringify(selector);
  for (;;) {
    const found = await evalIn<boolean>(wc, `!!document.querySelector(${sel})`);
    if (!found) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
};

/** Challenge wording only — a post's own text ("account suspended") must never trip this. */
const CHALLENGE =
  /(challenge_required|captcha_challenge|confirm your identity|verify your identity|prove your identity|unusual activity|are you a robot|complete the captcha)/i;
const CHALLENGE_URL =
  /\/(checkpoint|challenge|captcha|i\/flow\/login|accounts\/login|two_step_verification)(\/|\?|$)/i;

/** A login wall or captcha in the page means abort — the user deals with it themselves. */
export const checkpointCheck = async (wc: Electron.WebContents): Promise<PublishResult | null> => {
  const url = wc.getURL();
  if (CHALLENGE_URL.test(url)) return fail("checkpoint", `the platform asked for a check (${url})`);
  const seen = await evalIn<string>(
    wc,
    `(document.title||"")+"\\n"+(document.body?document.body.innerText.slice(0,4000):"")`,
  );
  if (seen && CHALLENGE.test(seen))
    return fail("checkpoint", "the platform asked for a check; open it yourself and deal with it");
  return null;
};

/**
 * DOM.setFileInputFiles is the only path that puts a local file into a page's file input — a pasted or dispatched
 * File cannot be fabricated from the main process.
 */
export const attachFiles = async (
  wc: Electron.WebContents,
  selector: string,
  files: ReadonlyArray<string>,
): Promise<boolean> => {
  const dbg = wc.debugger;
  try {
    dbg.attach("1.3");
  } catch {
    // Already attached (insertText got there first, or devtools is open) — the commands still work.
  }
  try {
    const doc = (await dbg.sendCommand("DOM.getDocument", { depth: 1 })) as {
      root: { nodeId: number };
    };
    const node = (await dbg.sendCommand("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector,
    })) as { nodeId: number };
    if (!node.nodeId) return false;
    await dbg.sendCommand("DOM.setFileInputFiles", {
      nodeId: node.nodeId,
      files: [...files],
    });
    return true;
  } catch {
    return false;
  }
};

/** Reads the composer's text — contenteditable reads innerText, a textarea reads value. */
export const composerText = (wc: Electron.WebContents, selector: string) =>
  evalIn<string>(
    wc,
    `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;return el.tagName==="TEXTAREA"?el.value:(el.innerText??el.textContent??"")})()`,
  );

/** The guard that must pass before any Post click: the composer's text is the draft's text. */
export const verifyText = async (
  wc: Electron.WebContents,
  selector: string,
  draft: Draft,
): Promise<PublishResult | null> => {
  const text = await composerText(wc, selector);
  if (text === null)
    return fail("text", "the composer is not there; is the composer page still loading?");
  const squash = (s: string) => s.replace(/\s+/g, " ").trim();
  if (squash(text) !== squash(draft.text))
    return fail("text", "the composer text does not match the draft — finish it by hand");
  return null;
};

/** A real click in the page — the composer's own handler receives it like the user's. */
export const click = (wc: Electron.WebContents, selector: string) =>
  evalIn<boolean>(
    wc,
    `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.click();return true})()`,
  );

/** Text goes in through CDP so React sees a native input event; the JS fallback forces the same. */
export const insertText = async (
  wc: Electron.WebContents,
  selector: string,
  text: string,
): Promise<boolean> => {
  const dbg = wc.debugger;
  try {
    dbg.attach("1.3");
    const doc = (await dbg.sendCommand("DOM.getDocument", { depth: 1 })) as {
      root: { nodeId: number };
    };
    const node = (await dbg.sendCommand("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector,
    })) as { nodeId: number };
    if (!node.nodeId) return false;
    await dbg.sendCommand("DOM.focus", { nodeId: node.nodeId });
    await dbg.sendCommand("Input.insertText", { text });
    return true;
  } catch {
    return false;
  }
};

/** Focused element gets text via native setters + an InputEvent when the debugger route fails. */
export const insertTextFallback = (wc: Electron.WebContents, selector: string, text: string) =>
  evalIn<boolean>(
    wc,
    `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;
el.focus();
if(el.tagName==="TEXTAREA"||el.tagName==="INPUT"){
  const proto=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  const set=Object.getOwnPropertyDescriptor(proto,"value").set;
  set.call(el,${JSON.stringify(text)});
}else{el.textContent=${JSON.stringify(text)}}
el.dispatchEvent(new InputEvent("input",{bubbles:true,data:${JSON.stringify(text)}}));
return true})()`,
  );
