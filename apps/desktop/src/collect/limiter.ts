// Accounts come first: every page load or API call to a platform takes a token here. A token bucket spaces requests
// out with jitter, a daily cap bounds a day, a 429 pauses the platform for hours, and a checkpoint or captcha stops it
// until the user has dealt with it on the platform's own page.
import { CHANNEL_IDS, type BudgetView, type ChannelId } from "@loud/contracts";

export interface Policy {
  /** Requests that may go out back to back after a quiet spell. */
  readonly burst: number;
  /** One token back every this many ms. */
  readonly refillMs: number;
  /** Extra random wait before each request, [min, max] ms. */
  readonly jitterMs: readonly [number, number];
  readonly dailyCap: number;
}

export const POLICIES: Record<ChannelId, Policy> = {
  threads: { burst: 3, refillMs: 6_000, jitterMs: [1_500, 4_000], dailyCap: 150 },
  ig: { burst: 2, refillMs: 9_000, jitterMs: [2_000, 5_000], dailyCap: 120 },
  fb: { burst: 2, refillMs: 9_000, jitterMs: [2_000, 5_000], dailyCap: 80 },
  x: { burst: 3, refillMs: 6_000, jitterMs: [1_500, 4_000], dailyCap: 150 },
};

export const RATE_LIMIT_PAUSE_MS = 6 * 3_600_000;
export const CHECKPOINT_PAUSE_MS = 24 * 3_600_000;

export interface LimitState {
  readonly day: string;
  readonly used: number;
  readonly pausedUntil: number | null;
  readonly reason: string | null;
}

export type LimitFile = Partial<Record<ChannelId, LimitState>>;

/** The platform said stop (429, login wall, checkpoint, captcha) or the day's budget is spent. */
export class Blocked extends Error {
  constructor(
    readonly channel: ChannelId,
    message: string,
  ) {
    super(message);
  }
}

export interface Clock {
  readonly now: () => number;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly random: () => number;
  /** Local calendar day of a time, for the daily cap. */
  readonly day: (ms: number) => string;
}

export const realClock: Clock = {
  now: () => Date.now(),
  random: Math.random,
  day: (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },
  sleep: (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error("stopped"));
      const t = setTimeout(resolve, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new Error("stopped"));
        },
        { once: true },
      );
    }),
};

export class Limiter {
  private readonly tokens = new Map<ChannelId, { n: number; at: number }>();
  private state: LimitFile;

  constructor(
    initial: LimitFile,
    private readonly save: (f: LimitFile) => void,
    private readonly clock: Clock = realClock,
    private readonly policies: Record<ChannelId, Policy> = POLICIES,
  ) {
    this.state = { ...initial };
  }

  private current(id: ChannelId): LimitState {
    const today = this.clock.day(this.clock.now());
    const s = this.state[id];
    if (!s) return { day: today, used: 0, pausedUntil: null, reason: null };
    const paused = s.pausedUntil !== null && s.pausedUntil > this.clock.now();
    return {
      day: today,
      used: s.day === today ? s.used : 0,
      pausedUntil: paused ? s.pausedUntil : null,
      reason: paused ? s.reason : null,
    };
  }

  private write(id: ChannelId, s: LimitState) {
    this.state = { ...this.state, [id]: s };
    this.save(this.state);
  }

  /** Why requests to this platform cannot go out now, or null. */
  blockedReason(id: ChannelId): string | null {
    const s = this.current(id);
    if (s.pausedUntil !== null) return s.reason ?? "paused";
    if (s.used >= this.policies[id].dailyCap)
      return `daily limit reached (${this.policies[id].dailyCap} requests); collection resumes tomorrow`;
    return null;
  }

  /** Waits for the next allowed slot, then counts one request. Throws Blocked when none is allowed today. */
  async take(id: ChannelId, signal?: AbortSignal): Promise<void> {
    const why = this.blockedReason(id);
    if (why) throw new Blocked(id, why);
    const p = this.policies[id];
    const now = this.clock.now();
    const b = this.tokens.get(id) ?? { n: p.burst, at: now };
    const n = Math.min(p.burst, b.n + (now - b.at) / p.refillMs);
    const wait = n >= 1 ? 0 : (1 - n) * p.refillMs;
    const [lo, hi] = p.jitterMs;
    const jitter = lo + this.clock.random() * (hi - lo);
    await this.clock.sleep(wait + jitter, signal);
    this.tokens.set(id, { n: Math.max(0, n + wait / p.refillMs - 1), at: this.clock.now() });
    const s = this.current(id);
    this.write(id, { ...s, used: s.used + 1 });
  }

  pause(id: ChannelId, ms: number, reason: string) {
    this.write(id, { ...this.current(id), pausedUntil: this.clock.now() + ms, reason });
  }

  /** The user dealt with it on the platform (solved the checkpoint, waited out the limit). */
  resume(id: ChannelId) {
    this.write(id, { ...this.current(id), pausedUntil: null, reason: null });
  }

  views(): Array<BudgetView> {
    return CHANNEL_IDS.map((id) => {
      const s = this.current(id);
      return {
        id,
        usedToday: s.used,
        dailyCap: this.policies[id].dailyCap,
        pausedUntil: s.pausedUntil === null ? null : new Date(s.pausedUntil).toISOString(),
        reason: s.reason,
      };
    });
  }
}
