// Whole-folder export and the delete-everything action from Settings. Drafts, their images and the demo marker are
// the user's own files: export copies them, delete keeps them.
import { CHANNEL_IDS } from "@loud/contracts";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const EXPORTS = "exports";

const copyInto = (from: string, to: string) => {
  NodeFS.mkdirSync(to, { recursive: true });
  for (const entry of NodeFS.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === EXPORTS || entry.name.endsWith(".tmp")) continue;
    const src = NodePath.join(from, entry.name);
    const dst = NodePath.join(to, entry.name);
    if (entry.isDirectory()) copyInto(src, dst);
    else if (entry.isFile()) NodeFS.copyFileSync(src, dst);
  }
};

/** Copies the data folder into `exports/loud-data-<stamp>/` inside it and returns that path. */
export function exportAll(data: string): string {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const dir = NodePath.join(data, EXPORTS, `loud-data-${stamp}`);
  copyInto(data, dir);
  return dir;
}

/** What collection and the build wrote. Returns true when anything was removed. */
export function deleteCollected(data: string): boolean {
  let removed = false;
  const drop = (name: string) => {
    const p = NodePath.join(data, name);
    if (NodeFS.existsSync(p)) {
      NodeFS.rmSync(p, { recursive: true, force: true });
      removed = true;
    }
  };
  for (const id of CHANNEL_IDS) drop(`${id}.json`);
  for (const f of ["listen.json", "state.json", "hub.json", "proposals.json"]) drop(f);
  for (const d of ["history", EXPORTS]) drop(d);
  return removed;
}
