import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { deleteCollected, exportAll } from "./lifecycle.ts";

const dirs: Array<string> = [];
const tmp = () => {
  const d = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "loud-life-"));
  dirs.push(d);
  return d;
};

afterEach(() => {
  for (const d of dirs.splice(0)) NodeFS.rmSync(d, { recursive: true, force: true });
});

const put = (dir: string, name: string, text = "{}") => {
  const file = NodePath.join(dir, name);
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(file, text);
};

describe("exportAll", () => {
  it("copies the data folder but skips earlier exports and temp files", () => {
    const data = tmp();
    put(data, "hub.json");
    put(data, "drafts.json");
    put(data, "history/2026-11-01.json");
    put(data, "exports/old.txt");
    put(data, "hub.json.1234.tmp");
    const dir = exportAll(data);
    expect(NodePath.dirname(dir)).toBe(NodePath.join(data, "exports"));
    expect(NodeFS.existsSync(NodePath.join(dir, "hub.json"))).toBe(true);
    expect(NodeFS.existsSync(NodePath.join(dir, "history", "2026-11-01.json"))).toBe(true);
    expect(NodeFS.existsSync(NodePath.join(dir, "exports"))).toBe(false);
    expect(NodeFS.existsSync(NodePath.join(dir, "hub.json.1234.tmp"))).toBe(false);
  });
});

describe("deleteCollected", () => {
  it("removes collected data but keeps drafts, their images and the demo marker", () => {
    const data = tmp();
    for (const name of [
      "threads.json",
      "listen.json",
      "state.json",
      "hub.json",
      "proposals.json",
      "drafts.json",
      "loud-demo.json",
    ])
      put(data, name);
    put(data, "history/2026-11-01.json");
    put(data, "drafts/d1/aabbccddeeff0011.png", "x");
    put(data, "exports/posts.csv", "a,b");
    expect(deleteCollected(data)).toBe(true);
    for (const gone of [
      "threads.json",
      "listen.json",
      "state.json",
      "hub.json",
      "proposals.json",
      "history",
      "exports",
    ])
      expect(NodeFS.existsSync(NodePath.join(data, gone))).toBe(false);
    for (const kept of ["drafts.json", "loud-demo.json", "drafts/d1/aabbccddeeff0011.png"])
      expect(NodeFS.existsSync(NodePath.join(data, kept))).toBe(true);
  });

  it("says false when there was nothing to remove", () => {
    expect(deleteCollected(tmp())).toBe(false);
  });
});
