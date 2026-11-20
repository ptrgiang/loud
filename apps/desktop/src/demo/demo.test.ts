import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { generateDemo, holdsRealData, rng } from "./demo.ts";

const dirs: Array<string> = [];
const scratch = () => {
  const d = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "loud-demo-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) NodeFS.rmSync(d, { recursive: true, force: true });
});

describe("demo", () => {
  it("is the same for the same seed", () => {
    const a = rng(7);
    const b = rng(7);
    expect([a.random(), a.int(1, 9)]).toEqual([b.random(), b.int(1, 9)]);
  });

  it("writes a complete, built folder", () => {
    const dir = scratch();
    const hub = generateDemo(dir, { now: new Date(Date.UTC(2026, 10, 20, 14, 0)) });
    expect(hub?.channels.map((c) => c.id)).toEqual(["threads", "ig", "fb", "x"]);
    expect(hub?.posts.length).toBeGreaterThan(200);
    expect(hub?.listen.items.length).toBeGreaterThan(30);
    for (const f of ["hub.json", "proposals.json", "loud-demo.json", "listen.json"]) {
      expect(NodeFS.existsSync(NodePath.join(dir, f))).toBe(true);
    }
    expect(NodeFS.readdirSync(NodePath.join(dir, "history")).length).toBeGreaterThanOrEqual(30);
    // Fictional, and labelled so: no real platform links.
    expect(hub?.posts.every((p) => p.url?.startsWith("https://example.com/demo/"))).toBe(true);
  });

  it("never writes over collected data", () => {
    const dir = scratch();
    NodeFS.writeFileSync(NodePath.join(dir, "threads.json"), '{"posts":[]}');
    expect(holdsRealData(dir)).toBe(true);
    expect(() => generateDemo(dir)).toThrow(/collected data/);
  });

  it("may regenerate its own folder", () => {
    const dir = scratch();
    generateDemo(dir);
    expect(holdsRealData(dir)).toBe(false);
    expect(() => generateDemo(dir)).not.toThrow();
  });
});
