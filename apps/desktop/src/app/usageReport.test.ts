import { emptyCollect, UsageReport } from "@loud/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { buildReport, outcome, tally, utcDay } from "./usageReport.ts";

describe("usage report", () => {
  it("counts a step by its status and a coarse reason", () => {
    expect(outcome("done", "34 posts")).toBe("done");
    expect(outcome("failed", "the platform asked for a login or a check")).toBe("blocked");
    expect(outcome("failed", "the platform answered 429 (too many requests)")).toBe("blocked");
    expect(outcome("failed", "could not read the profile")).toBe("failed");
    expect(outcome("skipped", "not connected")).toBeNull();
    expect(outcome("stopped", "stopped")).toBeNull();
  });

  it("adds to the right step and leaves the rest", () => {
    let c = emptyCollect();
    c = tally(c, "threads", "done", "12 posts");
    c = tally(c, "threads", "failed", "login wall");
    c = tally(c, "x", "skipped", "not connected");
    expect(c.threads).toEqual({ runs: 2, done: 1, failed: 0, blocked: 1 });
    expect(c.x).toEqual({ runs: 0, done: 0, failed: 0, blocked: 0 });
  });

  it("builds a report that matches the schema and carries no account detail", () => {
    const report = buildReport({
      install: "6f1c2b0e-0000-4000-8000-000000000000",
      version: "0.1.1",
      os: "win32",
      arch: "x64",
      platforms: [{ id: "threads", connected: true, included: true }],
      collect: emptyCollect(),
      agent: false,
      updateChecks: true,
    });
    expect(() => Schema.decodeUnknownSync(UsageReport)(report)).not.toThrow();
    expect(report.platforms.ig).toEqual({ connected: false, included: false });
    expect(Object.keys(report).sort()).toEqual(
      [
        "agent",
        "arch",
        "collect",
        "install",
        "os",
        "platforms",
        "updateChecks",
        "v",
        "version",
      ].sort(),
    );
  });

  it("counts days in UTC", () => {
    expect(utcDay(new Date("2026-11-20T23:30:00-05:00"))).toBe("2026-11-21");
  });
});
