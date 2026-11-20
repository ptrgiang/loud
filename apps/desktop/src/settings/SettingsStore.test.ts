import { describe, expect, it } from "vite-plus/test";

import { cleanKeywords, parse } from "./SettingsStore.ts";

describe("parse", () => {
  it("falls back to defaults for anything that is not an object", () => {
    for (const raw of [null, 42, "x", []]) {
      const s = parse(raw);
      expect(s.platforms.threads).toEqual({ enabled: false, handle: "" });
      expect(Object.keys(s.platforms).sort()).toEqual(["fb", "ig", "threads", "x"]);
    }
  });

  it("lays a partial file over the defaults", () => {
    const s = parse({
      timezone: "Asia/Bangkok",
      platforms: { ig: { enabled: true, handle: "acme" } },
    });
    expect(s.timezone).toBe("Asia/Bangkok");
    expect(s.platforms.ig).toEqual({ enabled: true, handle: "acme" });
    expect(s.platforms.x).toEqual({ enabled: false, handle: "" });
  });

  it("rejects a file with the wrong types as a whole", () => {
    const s = parse({ timezone: 7 });
    expect(typeof s.timezone).toBe("string");
  });
});

describe("cleanKeywords", () => {
  it("trims, dedupes, sorts and keeps only known keys", () => {
    expect(cleanKeywords({ threads: [" b ", "a", "b", ""], nope: ["x"] })).toEqual({
      threads: ["a", "b"],
      ig: [],
      fb_video: [],
      x: [],
    });
  });
});
