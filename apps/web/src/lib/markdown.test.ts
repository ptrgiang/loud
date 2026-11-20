import { describe, expect, it } from "vite-plus/test";

import { blocks, inline } from "./markdown.ts";

describe("markdown", () => {
  it("reads bold, code, italics and http links only", () => {
    expect(inline("**When:** at `15:00`, *maybe*")).toEqual([
      { t: "b", c: [{ t: "text", v: "When:" }] },
      { t: "text", v: " at " },
      { t: "code", v: "15:00" },
      { t: "text", v: ", " },
      { t: "i", c: [{ t: "text", v: "maybe" }] },
    ]);
    expect(inline("[a](https://example.com/x)")).toEqual([
      { t: "link", href: "https://example.com/x", c: [{ t: "text", v: "a" }] },
    ]);
    expect(inline("[a](javascript:alert(1))")).toEqual([
      { t: "text", v: "[a](javascript:alert(1))" },
    ]);
  });

  it("splits paragraphs, lists, quotes and fences", () => {
    const md =
      "Intro line\nsame para\n\n- one\n- two\n\n1. first\n\n> quoted\n>\n> more\n\n```\nraw *x*\n```";
    expect(blocks(md).map((b) => b.t)).toEqual(["p", "ul", "ol", "quote", "pre"]);
    const quote = blocks("> a\n>\n> b")[0];
    expect(quote?.t === "quote" && quote.c.length).toBe(2);
  });
});
