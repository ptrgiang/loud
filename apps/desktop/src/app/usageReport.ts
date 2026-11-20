// The parts of a usage report that are plain data, kept apart from Electron so they can be tested.
import {
  CHANNEL_IDS,
  type ChannelId,
  type CollectStep,
  type PlatformUse,
  type StepState,
  type StepTally,
  type UsageReport,
} from "@loud/contracts";

/** How a finished step counts. Only the status and a coarse reason leave the computer, never the step's text. */
export function outcome(status: StepState["status"], detail: string): keyof StepTally | null {
  if (status === "done") return "done";
  if (status === "failed")
    return /login|check|captcha|checkpoint|429|too many|paused/i.test(detail)
      ? "blocked"
      : "failed";
  return null;
}

export function tally(
  collect: Record<CollectStep, StepTally>,
  step: CollectStep,
  status: StepState["status"],
  detail: string,
): Record<CollectStep, StepTally> {
  const kind = outcome(status, detail);
  if (!kind) return collect;
  const t = collect[step];
  return { ...collect, [step]: { ...t, runs: t.runs + 1, [kind]: t[kind] + 1 } };
}

export interface ReportInput {
  readonly install: string;
  readonly version: string;
  readonly os: NodeJS.Platform;
  readonly arch: string;
  readonly platforms: ReadonlyArray<{ id: ChannelId; connected: boolean; included: boolean }>;
  readonly collect: Record<CollectStep, StepTally>;
  readonly agent: boolean;
  readonly updateChecks: boolean;
}

export function buildReport(input: ReportInput): UsageReport {
  const platforms = Object.fromEntries(
    CHANNEL_IDS.map((id) => {
      const p = input.platforms.find((x) => x.id === id);
      return [id, { connected: p?.connected ?? false, included: p?.included ?? false }];
    }),
  ) as Record<ChannelId, PlatformUse>;
  return {
    v: 1,
    install: input.install,
    version: input.version,
    os: input.os === "darwin" || input.os === "linux" ? input.os : "win32",
    arch: input.arch,
    platforms,
    collect: input.collect,
    agent: input.agent,
    updateChecks: input.updateChecks,
  };
}

/** UTC day, the unit the server counts in. */
export const utcDay = (d: Date) => d.toISOString().slice(0, 10);
