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

/** A beat between steps so the driver reads as a person, not a burst of same-tick DOM calls. */
export const pace = (ms = 0) =>
  new Promise((r) => setTimeout(r, ms + 300 + Math.floor(Math.random() * 700)));

/** Waits until `selector` has a visible match in the page; `false` on timeout. */
export const waitFor = async (
  wc: Electron.WebContents,
  selector: string,
  ms: number,
): Promise<boolean> => {
  const deadline = Date.now() + ms;
  const sel = JSON.stringify(selector);
  for (;;) {
    const found = await evalIn<boolean>(
      wc,
      `[...document.querySelectorAll(${sel})].some(e=>e.offsetParent!==null)`,
    );
    if (found) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
};

/** Waits until `selector` has no visible match — the composer closed or navigated away. */
export const waitGone = async (
  wc: Electron.WebContents,
  selector: string,
  ms: number,
): Promise<boolean> => {
  const deadline = Date.now() + ms;
  const sel = JSON.stringify(selector);
  for (;;) {
    const found = await evalIn<boolean>(
      wc,
      `[...document.querySelectorAll(${sel})].some(e=>e.offsetParent!==null)`,
    );
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

/** Reads the composer's text — contenteditable reads innerText, a textarea reads value. Hidden dialogs
 * linger in the DOM, so only the first *visible* match counts. */
export const composerText = (wc: Electron.WebContents, selector: string) =>
  evalIn<string>(
    wc,
    `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.offsetParent!==null);if(!el)return null;return el.tagName==="TEXTAREA"?el.value:(el.innerText??el.textContent??"")})()`,
  );

/** The guard that must pass before any Post click: the composer's text is the draft's text. */
export const verifyText = async (
  wc: Electron.WebContents,
  selector: string,
  draft: Draft,
  expected?: string | ReadonlyArray<string>,
): Promise<PublishResult | null> => {
  const text = await composerText(wc, selector);
  if (text === null)
    return fail("text", "the composer is not there; is the composer page still loading?");
  const squash = (s: string) => s.replace(/\s+/g, " ").trim();
  const want = expected ?? draft.text;
  const ok = (Array.isArray(want) ? want : [want]).some((w) => squash(text) === squash(w));
  if (!ok) return fail("text", "the composer text does not match the draft — finish it by hand");
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
  } catch {
    // Already attached — the commands still work.
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
    await dbg.sendCommand("DOM.focus", { nodeId: node.nodeId });
    await dbg.sendCommand("Input.insertText", { text });
    return true;
  } catch {
    return false;
  }
};

/** One whole-block insert — chunked inserts drift the caret between calls (a suggestion popup or a
 * second editor steals it) and the next chunk lands in the wrong place. */
export const typeText = async (
  wc: Electron.WebContents,
  selector: string,
  text: string,
  pick: "first" | "last" = "first",
): Promise<boolean> => {
  const dbg = wc.debugger;
  try {
    dbg.attach("1.3");
  } catch {
    // Already attached — the commands still work.
  }
  try {
    const doc = (await dbg.sendCommand("DOM.getDocument", { depth: 1 })) as {
      root: { nodeId: number };
    };
    // Hidden dialogs linger in the page's DOM and still match the selector — keep only nodes with a
    // box (getBoxModel throws/errors on display:none), then take the first or last visible match.
    const all = (await dbg.sendCommand("DOM.querySelectorAll", {
      nodeId: doc.root.nodeId,
      selector,
    })) as { nodeIds: Array<number> };
    const visible: Array<number> = [];
    for (const id of all.nodeIds) {
      try {
        await dbg.sendCommand("DOM.getBoxModel", { nodeId: id });
        visible.push(id);
      } catch {}
    }
    const nodeId = pick === "last" ? (visible[visible.length - 1] ?? 0) : (visible[0] ?? 0);
    if (!nodeId) return false;
    await dbg.sendCommand("DOM.focus", { nodeId });
    await dbg.sendCommand("Input.insertText", { text });
    return true;
  } catch {
    return false;
  }
};

/** Shifted symbols on a US layout — keyCode takes the base key, `modifiers` adds the shift. */
const SHIFT_KEYS: Record<string, string> = {
  "!": "1",
  "@": "2",
  "#": "3",
  $: "4",
  "%": "5",
  "^": "6",
  "&": "7",
  "*": "8",
  "(": "9",
  ")": "0",
  ":": ";",
  "<": ",",
  ">": ".",
  "?": "/",
  '"': "'",
  "{": "[",
  "}": "]",
  "|": "\\",
  "~": "`",
  _: "-",
  "+": "=",
};

/** Char → Electron accelerator keyCode + shift flag; null for characters no key produces (emoji, CJK, …). */
const keyOf = (ch: string): { code: string; shift: boolean } | null => {
  if (/[a-z]/.test(ch)) return { code: ch.toUpperCase(), shift: false };
  if (/[A-Z]/.test(ch)) return { code: ch, shift: true };
  if (/[0-9]/.test(ch)) return { code: ch, shift: false };
  if (ch === " ") return { code: "Space", shift: false };
  if (ch === "\n") return { code: "Enter", shift: false };
  if (SHIFT_KEYS[ch]) return { code: SHIFT_KEYS[ch], shift: true };
  if ("-=[]\\;',./`".includes(ch)) return { code: ch, shift: false };
  return null;
};

/**
 * Trusted typing: sendInputEvent goes through Electron's real input pipeline — keyDown/char/keyUp
 * land like keystrokes. Synthetic inserts (CDP insertText, execCommand, ClipboardEvent) fill the DOM
 * and the counter, but editors like Instagram's Lexical never commit them to the submitted payload.
 */
export const typeKeys = async (
  wc: Electron.WebContents,
  selector: string,
  text: string,
): Promise<boolean> => {
  const rect = await evalIn<{ x: number; y: number }>(
    wc,
    `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.offsetParent!==null);
if(!el)return null;const r=el.getBoundingClientRect();
return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+Math.min(12,r.height/2))}})()`,
  );
  if (!rect) return false;
  const keys = [...text].map(keyOf);
  if (keys.some((k) => k === null)) return false; // unmappable chars — caller falls back whole
  // A real click first — it focuses the editor the way a person's pointer does.
  for (const type of ["mouseDown", "mouseUp"] as const) {
    wc.sendInputEvent({
      type,
      x: rect.x,
      y: rect.y,
      button: "left",
      clickCount: 1,
    });
  }
  await pace(120);
  for (const key of keys) {
    const mods = key!.shift ? (["shift"] as const) : [];
    wc.sendInputEvent({ type: "keyDown", keyCode: key!.code, modifiers: [...mods] });
    wc.sendInputEvent({ type: "char", keyCode: key!.code, modifiers: [...mods] });
    wc.sendInputEvent({ type: "keyUp", keyCode: key!.code, modifiers: [...mods] });
    // Per-keystroke jitter — a fast typist, not a burst.
    await new Promise((r) => setTimeout(r, 35 + Math.floor(Math.random() * 80)));
  }
  return true;
};

/** Arms a request-stage pause on `pattern`; resolves with the paused request the moment it fires.
 * The caller rewrites postData (or not) then continues — the platform still signs and sends it. */
export const armRequest = async (
  wc: Electron.WebContents,
  pattern: string,
  ms: number,
): Promise<{
  paused: Promise<{ requestId: string; request: { url: string; postData?: string } }>;
  disarm: () => Promise<void>;
}> => {
  const dbg = wc.debugger;
  try {
    dbg.attach("1.3");
  } catch {
    // Already attached — the commands still work.
  }
  let onMessage: ((event: unknown, method: string, params: unknown) => void) | null = null;
  const paused = new Promise<{ requestId: string; request: { url: string; postData?: string } }>(
    (resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("the request never fired")), ms);
      onMessage = (_e: unknown, method: string, params: unknown) => {
        if (method === "Fetch.requestPaused") {
          clearTimeout(timer);
          resolve(params as { requestId: string; request: { url: string; postData?: string } });
        }
      };
      dbg.on("message", onMessage);
    },
  );
  await dbg.sendCommand("Fetch.enable", {
    patterns: [{ urlPattern: pattern, requestStage: "Request" }],
  });
  const disarm = async () => {
    if (onMessage) dbg.off("message", onMessage);
    try {
      await dbg.sendCommand("Fetch.disable", {});
    } catch {
      // Debugger may have detached mid-publish.
    }
  };
  return { paused, disarm };
};

/** A real Enter — contenteditable editors split lines on the key event, not on "\n" in inserted text. */
const pressEnter = async (dbg: Electron.Debugger) => {
  for (const type of ["rawKeyDown", "keyUp"] as const) {
    await dbg.sendCommand("Input.dispatchKeyEvent", {
      type,
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      ...(type === "rawKeyDown" ? { text: "\r" } : {}),
    });
  }
};

/** Instagram's caption wants each line typed and lines split by real Enter presses. */
export const typeLines = async (
  wc: Electron.WebContents,
  selector: string,
  text: string,
): Promise<boolean> => {
  const dbg = wc.debugger;
  try {
    dbg.attach("1.3");
  } catch {
    // Already attached — the commands still work.
  }
  try {
    const doc = (await dbg.sendCommand("DOM.getDocument", { depth: 1 })) as {
      root: { nodeId: number };
    };
    const all = (await dbg.sendCommand("DOM.querySelectorAll", {
      nodeId: doc.root.nodeId,
      selector,
    })) as { nodeIds: Array<number> };
    let nodeId = 0;
    for (const id of all.nodeIds) {
      try {
        await dbg.sendCommand("DOM.getBoxModel", { nodeId: id });
        nodeId = id;
        break;
      } catch {}
    }
    if (!nodeId) return false;
    await dbg.sendCommand("DOM.focus", { nodeId });
    const lines = text.split("\n");
    for (const [i, line] of lines.entries()) {
      if (i > 0) await pressEnter(dbg);
      await dbg.sendCommand("Input.insertText", { text: line });
      await pace(0);
    }
    return true;
  } catch {
    return false;
  }
};

/** An image through the real clipboard paste — the composer's own paste handler attaches it like a user
 * pasting a screenshot. Returns true when a blob preview appears. */
export const pasteImage = async (
  wc: Electron.WebContents,
  selector: string,
  imagePath: string,
): Promise<boolean> => {
  const mime = /\.jpe?g$/i.test(imagePath) ? "image/jpeg" : "image/png";
  const ok = await evalIn<boolean>(
    wc,
    `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.offsetParent!==null);
if(!el)return false;el.focus();return true})()`,
  );
  if (!ok) return false;
  try {
    const bytes = await import("node:fs").then((m) => m.promises.readFile(imagePath));
    await Electron.clipboard.write([
      new Electron.ClipboardItem({ [mime]: new Blob([bytes], { type: mime }) }),
    ]);
    wc.paste();
  } catch {
    return false;
  }
  await pace(500);
  const pasted = await evalIn<boolean>(
    wc,
    `[...document.querySelectorAll('img')].some(i=>i.offsetParent!==null&&(i.src||'').startsWith('blob:'))`,
  );
  return pasted ?? false;
};

/** wc.insertText goes through Electron's native text-input path — a real insertion the editor's model commits. */
export const insertNative = async (
  wc: Electron.WebContents,
  selector: string,
  text: string,
): Promise<boolean> => {
  const ok = await evalIn<boolean>(
    wc,
    `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.offsetParent!==null);
if(!el)return false;el.focus();return true})()`,
  );
  if (!ok) return false;
  try {
    await wc.insertText(text);
    return true;
  } catch {
    return false;
  }
};

/** Facebook's composer takes text through a real paste — ClipboardEvent, like the human flow. */
export const pasteText = (wc: Electron.WebContents, selector: string, text: string) =>
  evalIn<boolean>(
    wc,
    `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.offsetParent!==null);
if(!el)return false;el.focus();
const dt=new DataTransfer();dt.setData('text/plain',${JSON.stringify(text)});
el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
return true})()`,
  );

/** Switch or checkbox by its own label: the composer's wording, not a position. Returns what it ended up doing. */
export const setToggle = async (
  wc: Electron.WebContents,
  labelRe: string,
  want: boolean,
): Promise<"set" | "already" | "missing"> => {
  const r = await evalIn<string>(
    wc,
    `(()=>{const re=${labelRe};
const els=[...document.querySelectorAll('[role="switch"],[role="checkbox"],input[type="checkbox"],[aria-checked]')]
.filter(e=>e.offsetParent!==null);
const el=els.find(e=>{
  const own=(e.getAttribute('aria-label')||'').trim();
  if(re.test(own))return true;
  let p=e.parentElement;
  for(let i=0;i<4&&p;i++,p=p.parentElement){
    const t=(p.innerText||'').trim();
    if(t&&t.length<80&&re.test(t))return true;
  }
  return false});
if(!el)return "missing";
const on=el.getAttribute('aria-checked')==='true'||el.checked===true;
if(on===${want})return "already";
el.click();return "set"})()`,
  );
  return r === "set" || r === "already" ? r : "missing";
};

/** Background windows stall composer dialogs — bring the posting window forward before the last clicks. */
export const focusWindow = (wc: Electron.WebContents) => {
  const win = Electron.BrowserWindow.fromWebContents(wc);
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  try {
    wc.focus();
  } catch {}
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
