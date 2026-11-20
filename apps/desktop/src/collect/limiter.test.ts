import { describe, expect, it } from "vite-plus/test";

import { Blocked, type Clock, type LimitFile, Limiter, type Policy } from "./limiter.ts";

const fakeClock = () => {
  let t = Date.UTC(2026, 10, 20, 9, 0);
  const waits: Array<number> = [];
  const clock: Clock = {
    now: () => t,
    random: () => 0.5,
    day: (ms) => new Date(ms).toISOString().slice(0, 10),
    sleep: async (ms) => {
      waits.push(ms);
      t += ms;
    },
  };
  return { clock, waits, advance: (ms: number) => (t += ms) };
};

const policy: Policy = { burst: 2, refillMs: 10_000, jitterMs: [1_000, 3_000], dailyCap: 4 };
const policies = { threads: policy, ig: policy, fb: policy, x: policy };

describe("Limiter", () => {
  it("spaces requests with jitter once the burst is spent", async () => {
    const { clock, waits } = fakeClock();
    const l = new Limiter({}, () => {}, clock, policies);
    await l.take("x");
    await l.take("x");
    await l.take("x");
    // Two from the burst (jitter only), then about one refill interval minus what the jitter already gave back.
    expect(waits[0]).toBe(2_000);
    expect(waits[1]).toBe(2_000);
    expect(waits[2]).toBeGreaterThan(5_000);
  });

  it("stops at the daily cap and starts again the next day", async () => {
    const { clock, advance } = fakeClock();
    const saved: Array<LimitFile> = [];
    const l = new Limiter({}, (f) => saved.push(f), clock, policies);
    for (let i = 0; i < 4; i++) await l.take("ig");
    await expect(l.take("ig")).rejects.toBeInstanceOf(Blocked);
    expect(saved.at(-1)?.ig?.used).toBe(4);
    advance(24 * 3_600_000);
    await expect(l.take("ig")).resolves.toBeUndefined();
  });

  it("keeps a pause across restarts until it ends or the user resumes", async () => {
    const { clock, advance } = fakeClock();
    let file: LimitFile = {};
    const a = new Limiter({}, (f) => (file = f), clock, policies);
    a.pause("fb", 3_600_000, "checkpoint");
    const b = new Limiter(file, () => {}, clock, policies);
    expect(b.blockedReason("fb")).toBe("checkpoint");
    expect(b.views().find((v) => v.id === "fb")?.pausedUntil).not.toBeNull();
    b.resume("fb");
    expect(b.blockedReason("fb")).toBeNull();
    a.pause("x", 1_000, "429");
    advance(2_000);
    expect(a.blockedReason("x")).toBeNull();
  });
});
