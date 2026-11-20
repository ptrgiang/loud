import { emptyCollect } from "@loud/contracts";
import { describe, expect, it } from "vite-plus/test";

import { countDownloads, dayBefore, mergeCollect, parseReport } from "./usage.ts";

const report = () => ({
  v: 1,
  install: "6f1c2b0e-1d2c-4a3b-8c4d-5e6f7a8b9c0d",
  version: "0.1.1",
  os: "win32",
  arch: "x64",
  platforms: {
    threads: { connected: true, included: true },
    ig: { connected: false, included: false },
    fb: { connected: false, included: false },
    x: { connected: true, included: false },
  },
  collect: { ...emptyCollect(), threads: { runs: 3, done: 2, failed: 0, blocked: 1 } },
  agent: false,
  updateChecks: true,
});

describe("usage endpoint", () => {
  it("accepts the report the app sends", () => {
    expect(parseReport(JSON.stringify(report()))?.collect.threads.done).toBe(2);
  });

  it("refuses anything extra, malformed or implausible", () => {
    expect(parseReport(JSON.stringify({ ...report(), handle: "someone" }))).toBeNull();
    expect(
      parseReport(JSON.stringify({ ...report(), install: "made when you turn this on" })),
    ).toBeNull();
    expect(parseReport(JSON.stringify({ ...report(), version: "<script>" }))).toBeNull();
    const counts = report();
    counts.collect.x = { runs: 1, done: 5, failed: 0, blocked: 0 };
    expect(parseReport(JSON.stringify(counts))).toBeNull();
    counts.collect.x = { runs: 0.5, done: 0.5, failed: 0, blocked: 0 };
    expect(parseReport(JSON.stringify(counts))).toBeNull();
    expect(parseReport("{")).toBeNull();
    expect(parseReport(" ".repeat(5000))).toBeNull();
  });

  it("adds a second report of the day to the first", () => {
    const a = report().collect;
    expect(mergeCollect(a, a).threads).toEqual({ runs: 6, done: 4, failed: 0, blocked: 2 });
  });

  it("counts installers and update checks apart, and nothing else", () => {
    expect(
      countDownloads([
        { name: "Loud-0.1.0-x64-setup.exe", download_count: 5 },
        { name: "Loud-0.1.0-x64-setup.exe.blockmap", download_count: 9 },
        { name: "Loud-0.1.0-arm64.dmg", download_count: 2 },
        { name: "Loud-0.1.0-x86_64.AppImage", download_count: 1 },
        { name: "latest.yml", download_count: 40 },
        { name: "latest-mac.yml", download_count: 3 },
      ]),
    ).toEqual({ installers: 8, updateChecks: 43 });
  });

  it("counts back in UTC days", () => {
    expect(dayBefore(new Date("2026-11-21T01:00:00Z"), 6)).toBe("2026-11-15");
  });
});
