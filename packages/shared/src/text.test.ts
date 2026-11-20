import { describe, expect, it } from "vite-plus/test";

import { postLength } from "./text.ts";

describe("postLength", () => {
  it("counts characters, not UTF-16 units", () => {
    expect(postLength("héllo 👋", "threads")).toBe(7);
  });

  it("weighs links and wide characters on X", () => {
    expect(postLength("see https://example.com/a/very/long/path ok", "x")).toBe(4 + 23 + 3);
    expect(postLength("日本", "x")).toBe(4);
    expect(postLength("👋", "x")).toBe(2);
  });
});
