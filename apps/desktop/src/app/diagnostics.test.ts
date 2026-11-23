import type { Settings } from "@loud/contracts";
import { describe, expect, it } from "vite-plus/test";

import { defaults } from "../settings/SettingsStore.ts";
import { buildDiagnostics } from "./diagnostics.ts";

const settings = (): Settings => ({
  ...defaults(),
  platforms: {
    ...defaults().platforms,
    threads: { enabled: true, handle: "acme-secret", userId: "42" },
    ig: { enabled: false, handle: "" },
    fb: { enabled: true, handle: "acme", assetId: "99", pages: [{ id: "99", name: "Acme" }] },
    x: { enabled: false, handle: "" },
  },
  keywords: { threads: ["my keyword"], ig: [], fb: [], x: [] },
  agent: { enabled: true, provider: "claude", model: "", effort: "", playbook: "be nice" },
});

describe("buildDiagnostics", () => {
  it("redacts handles, ids, page names, keywords and the playbook", () => {
    const text = buildDiagnostics({
      version: "1.0.0",
      os: "win32",
      arch: "x64",
      packaged: true,
      demo: false,
      settings: settings(),
      collect: { running: false, started: null, finished: null, steps: [], next: null },
      budgets: [],
      log: ["2026-11-21 info start"],
    });
    for (const secret of ["acme-secret", "my keyword", "be nice", '"42"', '"99"', '"Acme"'])
      expect(text).not.toContain(secret);
    expect(text).toContain("<redacted>");
    expect(text).toContain("1 keyword");
    expect(text).toContain("<set>");
    expect(text).toContain("2026-11-21 info start");
  });
});
