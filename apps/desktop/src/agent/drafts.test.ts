import { mkdtempSync, rmSync } from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { markDraftPosted, readDrafts, unmarkDraft, upsertDraft } from "./drafts.ts";

const tmp = () => mkdtempSync(NodePath.join(NodeOS.tmpdir(), "loud-drafts-"));

describe("markDraftPosted", () => {
  it("stamps the draft and keeps it in the list", () => {
    const data = tmp();
    try {
      const d = upsertDraft(data, { channel: "x", text: "hi" }, "you", new Date());
      const stamped = markDraftPosted(data, d.id, { posted: "2026-11-23 14:00" });
      expect(stamped.posted).toBe("2026-11-23 14:00");
      const all = readDrafts(data);
      expect(all).toHaveLength(1);
      expect(all[0]?.posted).toBe("2026-11-23 14:00");
    } finally {
      rmSync(data, { recursive: true, force: true });
    }
  });

  it("marks scheduled without a posted stamp", () => {
    const data = tmp();
    try {
      const d = upsertDraft(data, { channel: "threads", text: "hi" }, "you", new Date());
      markDraftPosted(data, d.id, { scheduledAt: "2026-11-25 09:00" });
      const back = readDrafts(data)[0];
      expect(back?.scheduledAt).toBe("2026-11-25 09:00");
      expect(back?.posted).toBeUndefined();
    } finally {
      rmSync(data, { recursive: true, force: true });
    }
  });

  it("throws for a missing id", () => {
    const data = tmp();
    try {
      expect(() => markDraftPosted(data, "dzzz", { posted: "x" })).toThrow("gone");
    } finally {
      rmSync(data, { recursive: true, force: true });
    }
  });
});

describe("unmarkDraft", () => {
  it("clears both stamps so the draft can go out again", () => {
    const data = tmp();
    try {
      const d = upsertDraft(data, { channel: "x", text: "hi" }, "you", new Date());
      markDraftPosted(data, d.id, { posted: "2026-11-23 14:00" });
      markDraftPosted(data, d.id, { scheduledAt: "2026-11-25 09:00" });
      const back = unmarkDraft(data, d.id);
      expect(back.posted).toBeUndefined();
      expect(back.scheduledAt).toBeUndefined();
      const onDisk = readDrafts(data)[0];
      expect(onDisk?.posted).toBeUndefined();
      expect(onDisk?.scheduledAt).toBeUndefined();
    } finally {
      rmSync(data, { recursive: true, force: true });
    }
  });
});

describe("upsertDraft", () => {
  it("keeps posted and scheduledAt through later edits", () => {
    const data = tmp();
    try {
      const d = upsertDraft(data, { channel: "x", text: "a" }, "you", new Date());
      markDraftPosted(data, d.id, { posted: "2026-11-23 14:00" });
      const again = upsertDraft(data, { id: d.id, channel: "x", text: "b" }, "you", new Date());
      expect(again.posted).toBe("2026-11-23 14:00");
      expect(again.text).toBe("b");
    } finally {
      rmSync(data, { recursive: true, force: true });
    }
  });
});
