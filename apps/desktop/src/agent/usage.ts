// What each CLI says about its signed-in account: plan limits and the models it offers. Asked without a prompt, so
// checking costs nothing: Claude Code answers over the Agent SDK's control channel, Codex over `codex app-server`.
import {
  query,
  type ModelInfo,
  type SDKControlGetUsageResponse,
  type SDKRateLimitInfo,
} from "@anthropic-ai/claude-agent-sdk";
import type { AgentModel, AgentProviderId, AgentUsage, AgentUsageWindow } from "@loud/contracts";
import * as NodeChild from "node:child_process";
import * as NodeReadline from "node:readline";

export interface Probe {
  readonly usage: AgentUsage;
  /** Null when the CLI did not list them; the built-in list stays. */
  readonly models: ReadonlyArray<AgentModel> | null;
}

const PROBE_MS = 20_000;
const SESSION_MINS = 5 * 60;
const WEEK_MINS = 7 * 24 * 60;

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const isoFromSeconds = (s: number | null | undefined) =>
  typeof s === "number" && Number.isFinite(s) && s > 0 ? new Date(s * 1000).toISOString() : null;
const isoFrom = (s: string | null | undefined) => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

export const unavailable = (
  provider: AgentProviderId,
  note: string,
  checkedAt: string | null = null,
): AgentUsage => ({ provider, checkedAt, plan: null, windows: [], note });

// ---- Claude Code ----

const CLAUDE_WINDOWS = {
  five_hour: "5-hour",
  seven_day: "Weekly",
  seven_day_opus: "Weekly · Opus",
  seven_day_sonnet: "Weekly · Sonnet",
} as const;

/** get_usage percentages are 0-100. */
export function claudeUsage(
  response: Pick<
    SDKControlGetUsageResponse,
    "rate_limits_available" | "rate_limits" | "subscription_type"
  >,
  checkedAt: string,
): AgentUsage {
  const plan = response.subscription_type ?? null;
  if (!response.rate_limits_available || !response.rate_limits)
    return {
      ...unavailable(
        "claude",
        "No plan limits: Claude Code is signed in with an API key.",
        checkedAt,
      ),
      plan,
    };
  const windows: Array<AgentUsageWindow> = [];
  for (const [id, label] of Object.entries(CLAUDE_WINDOWS)) {
    const w = response.rate_limits[id as keyof typeof CLAUDE_WINDOWS];
    if (!w || typeof w.utilization !== "number") continue;
    windows.push({ id, label, usedPercent: clamp(w.utilization), resetsAt: isoFrom(w.resets_at) });
  }
  const scoped = (response.rate_limits as { model_scoped?: unknown }).model_scoped;
  if (Array.isArray(scoped))
    for (const s of scoped as ReadonlyArray<Record<string, unknown>>) {
      if (typeof s.display_name !== "string" || typeof s.utilization !== "number") continue;
      windows.push({
        id: `seven_day_${s.display_name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
        label: `Weekly · ${s.display_name}`,
        usedPercent: clamp(s.utilization),
        resetsAt: isoFrom(typeof s.resets_at === "string" ? s.resets_at : null),
      });
    }
  return { provider: "claude", checkedAt, plan, windows, note: null };
}

/** Rate-limit events during a turn carry 0-1 utilization for one window. */
export function applyClaudeEvent(usage: AgentUsage, info: SDKRateLimitInfo): AgentUsage {
  const id = info.rateLimitType;
  if (!id || typeof info.utilization !== "number" || !(id in CLAUDE_WINDOWS)) return usage;
  const window: AgentUsageWindow = {
    id,
    label: CLAUDE_WINDOWS[id as keyof typeof CLAUDE_WINDOWS],
    usedPercent: clamp(info.utilization * 100),
    resetsAt: isoFromSeconds(info.resetsAt),
  };
  const rest = usage.windows.filter((w) => w.id !== id);
  return {
    ...usage,
    checkedAt: new Date().toISOString(),
    windows: [...rest, window].sort(
      (a, b) =>
        Object.keys(CLAUDE_WINDOWS).indexOf(a.id) - Object.keys(CLAUDE_WINDOWS).indexOf(b.id),
    ),
    note: null,
  };
}

/** "default" means no --model, which Loud stores as the empty id. */
export function claudeModels(models: ReadonlyArray<ModelInfo>): ReadonlyArray<AgentModel> {
  return models.map((m) => ({
    id: m.value === "default" ? "" : m.value,
    label: m.displayName,
    efforts: [...(m.supportedEffortLevels ?? [])],
    images: true,
  }));
}

export async function probeClaude(exe: string): Promise<Probe> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PROBE_MS);
  try {
    const q = query({
      // Never yields, so nothing reaches the API: the CLI starts and answers control requests only.
      // oxlint-disable-next-line require-yield
      prompt: (async function* () {
        await new Promise<void>((resolve) =>
          abort.signal.addEventListener("abort", () => resolve(), { once: true }),
        );
      })(),
      options: {
        pathToClaudeCodeExecutable: exe,
        abortController: abort,
        persistSession: false,
        settingSources: [],
        tools: [],
        allowedTools: [],
        mcpServers: {},
        strictMcpConfig: true,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: undefined,
          ENABLE_CLAUDEAI_MCP_SERVERS: "false",
          CLAUDE_CODE_AUTO_CONNECT_IDE: "0",
          CLAUDE_AGENT_SDK_CLIENT_APP: "loud",
        },
      },
    });
    await q.initializationResult();
    const [usage, models] = await Promise.all([
      q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }),
      q.supportedModels().catch(() => null),
    ]);
    return {
      usage: claudeUsage(usage, new Date().toISOString()),
      models: models?.length ? claudeModels(models) : null,
    };
  } catch (e) {
    return {
      usage: unavailable(
        "claude",
        `Could not ask Claude Code: ${e instanceof Error ? e.message : String(e)}`,
        new Date().toISOString(),
      ),
      models: null,
    };
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}

// ---- Codex ----

interface CodexWindow {
  readonly usedPercent: number;
  readonly resetsAt?: number | null;
  readonly windowDurationMins?: number | null;
}

export interface CodexSnapshot {
  readonly limitId?: string | null;
  readonly planType?: string | null;
  readonly primary?: CodexWindow | null;
  readonly secondary?: CodexWindow | null;
}

const minsLabel = (mins: number) =>
  mins >= 28 * 24 * 60 ? "Monthly" : mins >= WEEK_MINS ? "Weekly" : `${Math.round(mins / 60)}-hour`;

/** primary and secondary are positions, not kinds: the duration says which window each one is. */
export function codexUsage(snapshot: CodexSnapshot | null, checkedAt: string): AgentUsage {
  if (!snapshot)
    return unavailable("codex", "Codex did not report plan limits for this sign-in.", checkedAt);
  const monthly = snapshot.planType === "free" || snapshot.planType === "go";
  const windows: Array<AgentUsageWindow> = [];
  for (const [id, w, fallback] of [
    ["primary", snapshot.primary, monthly ? 30 * 24 * 60 : SESSION_MINS],
    ["secondary", snapshot.secondary, WEEK_MINS],
  ] as const) {
    if (!w || !Number.isFinite(w.usedPercent)) continue;
    windows.push({
      id,
      label: minsLabel(typeof w.windowDurationMins === "number" ? w.windowDurationMins : fallback),
      usedPercent: clamp(w.usedPercent),
      resetsAt: isoFromSeconds(w.resetsAt),
    });
  }
  return {
    provider: "codex",
    checkedAt,
    plan: snapshot.planType ?? null,
    windows,
    note: windows.length ? null : "Codex did not report plan limits for this sign-in.",
  };
}

export interface CodexModel {
  readonly model: string;
  readonly displayName: string;
  readonly hidden: boolean;
  readonly isDefault: boolean;
  readonly supportedReasoningEfforts: ReadonlyArray<{ readonly reasoningEffort: string }>;
  readonly inputModalities?: ReadonlyArray<string>;
}

export function codexModels(models: ReadonlyArray<CodexModel>): ReadonlyArray<AgentModel> {
  const shown = models.filter((m) => !m.hidden);
  const def = shown.find((m) => m.isDefault);
  return [
    {
      id: "",
      label: def ? `Default (${def.displayName})` : "Codex default",
      efforts: def ? def.supportedReasoningEfforts.map((e) => e.reasoningEffort) : [],
      images: def?.inputModalities?.includes("image") ?? true,
    },
    ...shown.map((m) => ({
      id: m.model,
      label: m.displayName,
      efforts: m.supportedReasoningEfforts.map((e) => e.reasoningEffort),
      images: m.inputModalities?.includes("image") ?? true,
    })),
  ];
}

/** One short JSON-RPC session with `codex app-server`: initialize, then ask for limits and models. */
export function probeCodex(exe: string): Promise<Probe> {
  return new Promise((resolve) => {
    const checkedAt = () => new Date().toISOString();
    const child = NodeChild.spawn(exe, ["app-server"], {
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    });
    let next = 0;
    const pending = new Map<number, (m: Record<string, unknown>) => void>();
    const request = (method: string, params: unknown) =>
      new Promise<Record<string, unknown>>((done) => {
        const id = ++next;
        pending.set(id, done);
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      });
    let finished = false;
    const finish = (probe: Probe) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill();
      resolve(probe);
    };
    const fail = (why: string) =>
      finish({
        usage: unavailable("codex", `Could not ask Codex: ${why}`, checkedAt()),
        models: null,
      });
    const timer = setTimeout(() => fail("it did not answer in time"), PROBE_MS);
    child.stderr.resume();
    child.on("error", (e) => fail(e.message));
    child.on("close", () => fail("it closed"));
    NodeReadline.createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const m = JSON.parse(line) as Record<string, unknown>;
        if (typeof m.id === "number") pending.get(m.id)?.(m);
      } catch {
        // not a protocol line
      }
    });

    void (async () => {
      const init = await request("initialize", {
        clientInfo: { name: "loud", title: "Loud", version: "1" },
        capabilities: { experimentalApi: true, optOutNotificationMethods: null },
      });
      if (init.error) return fail(String((init.error as { message?: unknown }).message ?? "init"));
      child.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
      const [limits, models] = await Promise.all([
        request("account/rateLimits/read", null),
        request("model/list", {}),
      ]);
      const snapshot =
        (limits.result as { rateLimits?: CodexSnapshot } | undefined)?.rateLimits ?? null;
      const list = (models.result as { data?: ReadonlyArray<CodexModel> } | undefined)?.data;
      finish({
        usage: limits.error
          ? unavailable("codex", "Codex did not report plan limits for this sign-in.", checkedAt())
          : codexUsage(snapshot, checkedAt()),
        models: list?.length ? codexModels(list) : null,
      });
    })();
  });
}
