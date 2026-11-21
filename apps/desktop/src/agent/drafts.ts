// Drafts and their images, kept in the data folder: drafts.json, plus drafts/<id>/ for each draft's images. Shared by
// the agent's tools (in the MCP server's process) and the desktop's drafts handlers.
import { type ChannelId, type Draft, DRAFT_IMAGES_MAX, type DraftsFile } from "@loud/contracts";
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
  input: { id?: string | undefined; channel: ChannelId; text: string; note?: string | undefined },
  by: Draft["by"],
  now: Date,
): Draft {
  const all = readDrafts(data);
  const at = stampNow(now);
  const prev = input.id ? all.find((d) => d.id === input.id) : undefined;
  const draft: Draft = {
    id: prev?.id ?? newId(),
    channel: input.channel,
    text: input.text,
    note: input.note ?? prev?.note ?? "",
    by: prev?.by ?? by,
    ...(prev?.images?.length ? { images: prev.images } : {}),
    created: prev?.created ?? at,
    updated: at,
  };
  writeDrafts(data, [draft, ...all.filter((d) => d.id !== draft.id)]);
  return draft;
}

// Ids and names come back from the dashboard and end up in paths: only our own shapes pass.
const SAFE_ID = /^[a-z0-9]{4,40}$/;
const SAFE_NAME = /^[a-f0-9]{16}\.(png|jpg|webp|gif)$/;

const imageDir = (data: string, id: string) => {
  if (!SAFE_ID.test(id)) throw new Error("Not a draft id.");
  return NodePath.join(data, "drafts", id);
};

export function deleteDraft(data: string, id: string) {
  writeDrafts(
    data,
    readDrafts(data).filter((d) => d.id !== id),
  );
  if (SAFE_ID.test(id)) NodeFS.rmSync(imageDir(data, id), { recursive: true, force: true });
}

export const IMAGE_BYTES_MAX = 20 * 1024 * 1024;

const MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as const;
type ImageType = keyof typeof MIME;

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

function update(data: string, id: string, f: (images: Array<string>) => Array<string>): Draft {
  const all = readDrafts(data);
  const d = all.find((x) => x.id === id);
  if (!d) throw new Error("That draft is gone.");
  const images = f([...(d.images ?? [])]);
  const { images: _old, ...rest } = d;
  const next: Draft = { ...rest, ...(images.length ? { images } : {}) };
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
  return update(data, id, (images) => {
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

export function removeDraftImage(data: string, id: string, name: string): Draft {
  const file = draftImagePath(data, id, name);
  const d = update(data, id, (images) => images.filter((n) => n !== name));
  NodeFS.rmSync(file, { force: true });
  return d;
}

export function draftImagePath(data: string, id: string, name: string): string {
  if (!SAFE_NAME.test(name)) throw new Error("Not a draft image.");
  return NodePath.join(imageDir(data, id), name);
}

export function readDraftImage(data: string, id: string, name: string) {
  const bytes = NodeFS.readFileSync(draftImagePath(data, id, name));
  return { mime: MIME[name.split(".").pop() as ImageType], bytes };
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
