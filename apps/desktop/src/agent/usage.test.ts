import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { chatStore, classify, titleOf, withTextFiles } from "./chats.ts";
import { applyClaudeEvent, claudeModels, claudeUsage, codexModels, codexUsage } from "./usage.ts";

const AT = "2026-11-21T00:00:00.000Z";

describe("plan limits", () => {
  it("reads Claude's windows and skips the empty ones", () => {
    const u = claudeUsage(
      {
        subscription_type: "pro",
        rate_limits_available: true,
        rate_limits: {
          five_hour: { utilization: 67, resets_at: "2026-11-20T20:39:59.824889+00:00" },
          seven_day: { utilization: 20, resets_at: "2026-11-26T11:59:59Z" },
          seven_day_opus: null,
        },
      },
      AT,
    );
    expect(u.plan).toBe("pro");
    expect(u.windows.map((w) => [w.label, w.usedPercent])).toEqual([
      ["5-hour", 67],
      ["Weekly", 20],
    ]);
    expect(u.windows[0]!.resetsAt).toBe("2026-11-20T20:39:59.824Z");
  });

  it("says why an API key has no limits", () => {
    const u = claudeUsage(
      { subscription_type: null, rate_limits_available: false, rate_limits: null },
      AT,
    );
    expect(u.windows).toEqual([]);
    expect(u.note).toMatch(/API key/);
  });

  it("updates one window from a rate-limit event (0-1 there)", () => {
    const base = claudeUsage(
      {
        subscription_type: "pro",
        rate_limits_available: true,
        rate_limits: { five_hour: { utilization: 10, resets_at: null } },
      },
      AT,
    );
    const next = applyClaudeEvent(base, {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.42,
      resetsAt: 1795486579,
    });
    expect(next.windows).toHaveLength(1);
    expect(next.windows[0]!.usedPercent).toBeCloseTo(42);
  });

  it("names Codex windows by their length, not their position", () => {
    const u = codexUsage(
      {
        planType: "plus",
        primary: { usedPercent: 79, windowDurationMins: 10080, resetsAt: 1795486579 },
        secondary: null,
      },
      AT,
    );
    expect(u.windows.map((w) => w.label)).toEqual(["Weekly"]);
    expect(codexUsage(null, AT).note).toMatch(/did not report/);
  });

  it("maps model lists, with the default as the empty id", () => {
    expect(
      claudeModels([
        { value: "default", displayName: "Default", description: "" },
        {
          value: "opus",
          displayName: "Opus 5.5",
          description: "",
          supportedEffortLevels: ["low", "max"],
        },
      ]).map((m) => [m.id, m.efforts.length]),
    ).toEqual([
      ["", 0],
      ["opus", 2],
    ]);
    const codex = codexModels([
      {
        model: "gpt-a",
        displayName: "A",
        hidden: false,
        isDefault: true,
        supportedReasoningEfforts: [{ reasoningEffort: "high" }],
        inputModalities: ["text"],
      },
      {
        model: "gpt-h",
        displayName: "H",
        hidden: true,
        isDefault: false,
        supportedReasoningEfforts: [],
      },
    ]);
    expect(codex.map((m) => m.id)).toEqual(["", "gpt-a"]);
    expect(codex[1]!.images).toBe(false);
  });
});

describe("chats", () => {
  it("titles a chat by its first question", () => {
    expect(titleOf("  what   worked\nbest?  ")).toBe("what worked best?");
    expect(titleOf("x".repeat(80))).toHaveLength(58);
    expect(titleOf("")).toBe("New chat");
  });

  it("takes images and text files within their limits, and nothing else", () => {
    expect(classify({ name: "a.png", mime: "image/png" }, 1000)).toEqual({ kind: "image" });
    expect(classify({ name: "posts.csv", mime: "" }, 1000)).toEqual({ kind: "text" });
    expect(classify({ name: "big.png", mime: "image/png" }, 6 * 1024 * 1024)).toHaveProperty(
      "error",
    );
    expect(classify({ name: "app.exe", mime: "application/octet-stream" }, 10)).toHaveProperty(
      "error",
    );
  });

  it("puts text files ahead of the question", () => {
    expect(withTextFiles("Sum it up", [{ name: "n.md", content: "# Notes" }])).toBe(
      '<attached_file name="n.md">\n# Notes\n</attached_file>\n\nSum it up',
    );
  });

  it("turns the single 0.1 conversation into the first saved chat", () => {
    const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "loud-chats-"));
    try {
      const legacy = NodePath.join(home, "agent-chat.json");
      NodeFS.writeFileSync(
        legacy,
        JSON.stringify({
          messages: [
            { id: "u1", role: "user", text: "Hello there", tools: [], at: "2026-11-20 10:00" },
          ],
          session: "s1",
          sessionProvider: "codex",
          costUsd: null,
        }),
      );
      const store = chatStore(home);
      store.migrate(legacy, "claude");
      const [first] = store.list();
      expect(first).toMatchObject({ title: "Hello there", provider: "codex", messages: 1 });
      expect(store.read(first!.id)?.session).toBe("s1");
      expect(NodeFS.existsSync(legacy)).toBe(false);
      store.remove(first!.id);
      expect(store.list()).toEqual([]);
    } finally {
      NodeFS.rmSync(home, { recursive: true, force: true });
    }
  });
});
