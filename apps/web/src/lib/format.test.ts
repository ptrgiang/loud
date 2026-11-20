import { describe, expect, it } from "vite-plus/test";

import { compact, fmt, parseStamp, relative } from "./format";

describe("numbers", () => {
  it("shows a dash for unknown, never zero", () => {
    expect(fmt(null)).toBe("–");
    expect(fmt(undefined)).toBe("–");
    expect(fmt(0)).toBe("0");
  });

  it("goes compact from 10k", () => {
    expect(compact(9_999)).toBe("9,999");
    expect(compact(12_345)).toBe("12.3K");
  });
});

describe("stamps", () => {
  it("reads wall-clock stamps", () => {
    expect(parseStamp("2026-11-20 09:30")?.getHours()).toBe(9);
    expect(parseStamp("nope")).toBeNull();
  });

  it("says how long ago", () => {
    const now = new Date(2026, 10, 20, 12, 0);
    expect(relative("2026-11-20 11:59", now)).toBe("just now");
    expect(relative("2026-11-20 10:00", now)).toBe("2h ago");
    expect(relative("2026-11-15 12:00", now)).toBe("5d ago");
  });
});
