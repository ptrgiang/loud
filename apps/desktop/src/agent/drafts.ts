// Drafts and their images, kept in the data folder: drafts.json, plus drafts/<id>/ for each draft's images. Shared by
// the agent's tools (in the MCP server's process) and the desktop's drafts handlers.
import {
  type ChannelId,
  type Draft,
  DRAFT_IMAGES_MAX,
  DRAFT_VIDEOS_MAX,
  type DraftsFile,
} from "@loud/contracts";
import { ymd } from "@loud/shared/stamp";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { readJson, writeJson } from "../data/files.ts";

export const stampNow = (d: Date) =>
  `${ymd(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const newId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const draftsFile = (data: string) => NodePath.join(data, "drafts.json");

export const readDrafts = (data: string): Array<Draft> => {
  const f = readJson<DraftsFile>(draftsFile(data));
  return Array.isArray(f?.drafts) ? [...f.drafts] : [];
};

const writeDrafts = (data: string, drafts: ReadonlyArray<Draft>) =>
  writeJson(draftsFile(data), { drafts } satisfies DraftsFile);

/** Insert or replace by id, newest first. Images are kept; they change only through the image functions. */
export function upsertDraft(
  data: string,
  input: {
    id?: string | undefined;
    channel: ChannelId;
    text: string;
    note?: string | undefined;
    comment?: string | undefined;
    topic?: string | undefined;
    reply?: Draft["reply"];
    community?: string | undefined;
  },
  by: Draft["by"],
  now: Date,
): Draft {
  const all = readDrafts(data);
  const at = stampNow(now);
  const prev = input.id ? all.find((d) => d.id === input.id) : undefined;
  const comment = input.comment ?? prev?.comment;
  // An explicit empty value clears a Threads extra that was set before; absent keeps it.
  const pick = (next: string | undefined, prev: string | undefined) =>
    next !== undefined ? next.trim() || undefined : prev;
  const topic = pick(input.topic, prev?.topic);
  const community = pick(input.community, prev?.community);
  const reply = input.reply !== undefined ? input.reply || undefined : prev?.reply;
  const draft: Draft = {
    id: prev?.id ?? newId(),
    channel: input.channel,
    text: input.text,
    note: input.note ?? prev?.note ?? "",
    ...(comment ? { comment } : {}),
    ...(topic ? { topic } : {}),
    ...(reply ? { reply } : {}),
    ...(community ? { community } : {}),
    by: prev?.by ?? by,
    ...(prev?.images?.length ? { images: prev.images } : {}),
    ...(prev?.videos?.length ? { videos: prev.videos } : {}),
    ...(prev?.posted ? { posted: prev.posted } : {}),
    ...(prev?.scheduledAt ? { scheduledAt: prev.scheduledAt } : {}),
    created: prev?.created ?? at,
    updated: at,
  };
  writeDrafts(data, [draft, ...all.filter((d) => d.id !== draft.id)]);
  return draft;
}

// Ids and names come back from the dashboard and end up in paths: only our own shapes pass.
const SAFE_ID = /^[a-z0-9]{4,40}$/;
const SAFE_NAME = /^[a-f0-9]{16}\.(png|jpg|webp|gif|mp4|mov|webm)$/;

const imageDir = (data: string, id: string) => {
  if (!SAFE_ID.test(id)) throw new Error("Not a draft id.");
  return NodePath.join(data, "drafts", id);
};

/** Stamps a draft as submitted through the composer — posted now, or scheduled for `scheduledAt`. */
export function markDraftPosted(
  data: string,
  id: string,
  result: { posted: string } | { scheduledAt: string },
): Draft {
  const all = readDrafts(data);
  const d = all.find((x) => x.id === id);
  if (!d) throw new Error("That draft is gone.");
  const next: Draft = { ...d, ...result };
  writeDrafts(
    data,
    all.map((x) => (x.id === id ? next : x)),
  );
  return next;
}

export function deleteDraft(data: string, id: string) {
  writeDrafts(
    data,
    readDrafts(data).filter((d) => d.id !== id),
  );
  if (SAFE_ID.test(id)) NodeFS.rmSync(imageDir(data, id), { recursive: true, force: true });
}

export const IMAGE_BYTES_MAX = 20 * 1024 * 1024;

export const IMAGE_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
} as const;
type ImageType = keyof typeof IMAGE_MIME;

/** By the file's first bytes, not its name: anything that is not one of these four is refused. */
export function sniffImage(b: Uint8Array): ImageType | null {
  const at = (i: number, ...xs: Array<number>) => xs.every((x, j) => b[i + j] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (at(0, 0xff, 0xd8, 0xff)) return "jpg";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "gif";
  return null;
}

/** Checks one image before anything is written; the error says why it was refused. */
export function checkImage(bytes: Uint8Array): { type: ImageType } | { error: string } {
  if (bytes.length > IMAGE_BYTES_MAX) return { error: "larger than 20 MB" };
  const type = sniffImage(bytes);
  return type ? { type } : { error: "not a PNG, JPEG, WebP or GIF image" };
}

export const VIDEO_BYTES_MAX = 256 * 1024 * 1024;

export const VIDEO_MIME = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
} as const;
type VideoType = keyof typeof VIDEO_MIME;

/** By the first bytes: webm/mkv's EBML header, or the ISOBMFF `ftyp` box mp4 and mov share. */
export function sniffVideo(b: Uint8Array): VideoType | null {
  const at = (i: number, ...xs: Array<number>) => xs.every((x, j) => b[i + j] === x);
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return "webm";
  const ftyp = at(4, 0x66, 0x74, 0x79, 0x70); // "ftyp"
  if (ftyp) return at(8, 0x71, 0x74) ? "mov" : "mp4"; // "qt" is QuickTime
  return null;
}

export function checkVideo(bytes: Uint8Array): { type: VideoType } | { error: string } {
  if (bytes.length > VIDEO_BYTES_MAX) return { error: "larger than 256 MB" };
  const type = sniffVideo(bytes);
  return type ? { type } : { error: "not an MP4, MOV or WebM video" };
}

function update(
  data: string,
  id: string,
  field: "images" | "videos",
  f: (names: Array<string>) => Array<string>,
): Draft {
  const all = readDrafts(data);
  const d = all.find((x) => x.id === id);
  if (!d) throw new Error("That draft is gone.");
  const names = f([...(d[field] ?? [])]);
  const { [field]: _old, ...rest } = d;
  const next: Draft = { ...rest, ...(names.length ? { [field]: names } : {}) };
  writeDrafts(
    data,
    all.map((x) => (x.id === id ? next : x)),
  );
  return next;
}

/** Named by content, so the same image twice is kept once. */
export function addDraftImages(data: string, id: string, list: ReadonlyArray<Uint8Array>): Draft {
  const checked = list.map((bytes) => ({ bytes, c: checkImage(bytes) }));
  const bad = checked.find((x) => "error" in x.c);
  if (bad && "error" in bad.c) throw new Error(`Image refused: ${bad.c.error}.`);
  const dir = imageDir(data, id);
  return update(data, id, "images", (images) => {
    const added = new Map<string, Uint8Array>();
    for (const { bytes, c } of checked) {
      if (!("type" in c)) continue;
      const hash = NodeCrypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16);
      const name = `${hash}.${c.type}`;
      if (!images.includes(name)) added.set(name, bytes);
    }
    // Checked before writing, so a refused batch leaves no stray files.
    if (images.length + added.size > DRAFT_IMAGES_MAX)
      throw new Error(`A draft holds at most ${DRAFT_IMAGES_MAX} images.`);
    if (added.size) NodeFS.mkdirSync(dir, { recursive: true });
    for (const [name, bytes] of added) NodeFS.writeFileSync(NodePath.join(dir, name), bytes);
    return [...images, ...added.keys()];
  });
}

/** Same pattern as images: content-named, checked before writing. */
export function addDraftVideos(data: string, id: string, list: ReadonlyArray<Uint8Array>): Draft {
  const checked = list.map((bytes) => ({ bytes, c: checkVideo(bytes) }));
  const bad = checked.find((x) => "error" in x.c);
  if (bad && "error" in bad.c) throw new Error(`Video refused: ${bad.c.error}.`);
  const dir = imageDir(data, id);
  return update(data, id, "videos", (videos) => {
    const added = new Map<string, Uint8Array>();
    for (const { bytes, c } of checked) {
      if (!("type" in c)) continue;
      const hash = NodeCrypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16);
      const name = `${hash}.${c.type}`;
      if (!videos.includes(name)) added.set(name, bytes);
    }
    if (videos.length + added.size > DRAFT_VIDEOS_MAX)
      throw new Error(`A draft holds at most ${DRAFT_VIDEOS_MAX} videos.`);
    if (added.size) NodeFS.mkdirSync(dir, { recursive: true });
    for (const [name, bytes] of added) NodeFS.writeFileSync(NodePath.join(dir, name), bytes);
    return [...videos, ...added.keys()];
  });
}

/** Reorders a draft's media to the given order — posting order on the platform follows it. Unknown names fall behind instead of being dropped. */
export function reorderDraftImages(data: string, id: string, names: ReadonlyArray<string>): Draft {
  return update(data, id, "images", (images) => {
    const next = names.filter((n) => SAFE_NAME.test(n) && images.includes(n));
    return [...next, ...images.filter((n) => !next.includes(n))];
  });
}

export function removeDraftImage(data: string, id: string, name: string): Draft {
  const file = draftMediaPath(data, id, name);
  const d = update(data, id, "images", (images) => images.filter((n) => n !== name));
  NodeFS.rmSync(file, { force: true });
  return d;
}

export function removeDraftVideo(data: string, id: string, name: string): Draft {
  const file = draftMediaPath(data, id, name);
  const d = update(data, id, "videos", (videos) => videos.filter((n) => n !== name));
  NodeFS.rmSync(file, { force: true });
  return d;
}

export function draftMediaPath(data: string, id: string, name: string): string {
  if (!SAFE_NAME.test(name)) throw new Error("Not a draft media file.");
  return NodePath.join(imageDir(data, id), name);
}

export function readDraftImage(data: string, id: string, name: string) {
  const bytes = NodeFS.readFileSync(draftMediaPath(data, id, name));
  return { mime: IMAGE_MIME[name.split(".").pop() as ImageType], bytes };
}

/** The mime of a draft media file by its extension — images and videos live side by side. */
export function draftMediaMime(name: string): string {
  const ext = name.split(".").pop() ?? "";
  return IMAGE_MIME[ext as ImageType] ?? VIDEO_MIME[ext as VideoType] ?? "application/octet-stream";
}

/** An image file the agent names by path, checked by its bytes; a string says why it was refused. */
export function readImageFile(file: string): Uint8Array | string {
  if (!NodePath.isAbsolute(file)) return `${file}: not an absolute path`;
  let size: number;
  try {
    const st = NodeFS.statSync(file);
    if (!st.isFile()) return `${file}: not a file`;
    size = st.size;
  } catch {
    return `${file}: no such file`;
  }
  if (size > IMAGE_BYTES_MAX) return `${file}: larger than 20 MB`;
  const bytes = NodeFS.readFileSync(file);
  const c = checkImage(bytes);
  return "error" in c ? `${file}: ${c.error}` : bytes;
}
