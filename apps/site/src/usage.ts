// The plain-data side of usage reports: what the server accepts and the public totals it adds up to.
import {
  CHANNEL_IDS,
  type ChannelId,
  COLLECT_STEPS,
  type CollectStep,
  emptyCollect,
  type StepTally,
  UsageReport,
} from "@loud/contracts";
import * as Schema from "effect/Schema";

export const MAX_BODY = 4096;
/** A day's tally above this is not a real install collecting within the rate limits. */
const MAX_COUNT = 1000;

const decode = Schema.decodeUnknownSync(UsageReport, { onExcessProperty: "error" });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,4}(-[0-9a-z.]{1,20})?$/;
const ARCH = /^[a-z0-9]{1,12}$/;

/** The report if it is exactly the shape the app sends, else null. Unknown keys are refused, not dropped. */
export function parseReport(body: string): UsageReport | null {
  if (body.length > MAX_BODY) return null;
  let report: UsageReport;
  try {
    report = decode(JSON.parse(body));
  } catch {
    return null;
  }
  if (!UUID.test(report.install) || !VERSION.test(report.version) || !ARCH.test(report.arch))
    return null;
  for (const t of Object.values(report.collect)) {
    const counts = [t.runs, t.done, t.failed, t.blocked];
    if (!counts.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_COUNT)) return null;
    if (t.done + t.failed + t.blocked !== t.runs) return null;
  }
  return report;
}

export function mergeCollect(
  a: Record<CollectStep, StepTally>,
  b: Record<CollectStep, StepTally>,
): Record<CollectStep, StepTally> {
  const out = emptyCollect();
  for (const step of COLLECT_STEPS) {
    const x = a[step];
    const y = b[step];
    out[step] = {
      runs: x.runs + y.runs,
      done: x.done + y.done,
      failed: x.failed + y.failed,
      blocked: x.blocked + y.blocked,
    };
  }
  return out;
}

export interface ReleaseAsset {
  readonly name: string;
  readonly download_count: number;
}

/**
 * Installers are also what the Windows updater downloads, so they count updates too. The latest*.yml files are
 * fetched by every installed copy with update checks on, at start and every 6 hours.
 */
export function countDownloads(assets: ReadonlyArray<ReleaseAsset>) {
  let installers = 0;
  let updateChecks = 0;
  for (const a of assets) {
    if (/^latest(-mac|-linux)?\.yml$/.test(a.name)) updateChecks += a.download_count;
    else if (/(-setup\.exe|\.dmg|\.AppImage)$/.test(a.name)) installers += a.download_count;
  }
  return { installers, updateChecks };
}

export interface Stats {
  readonly generated: string;
  readonly active: { readonly days7: number; readonly days30: number };
  readonly daily: ReadonlyArray<{ readonly day: string; readonly installs: number }>;
  readonly versions: ReadonlyArray<{ readonly version: string; readonly installs: number }>;
  readonly os: ReadonlyArray<{ readonly os: string; readonly installs: number }>;
  readonly platforms: Record<ChannelId, number>;
  readonly collect: Record<CollectStep, StepTally>;
  readonly downloads: { readonly installers: number; readonly updateChecks: number } | null;
}

export const emptyPlatforms = () =>
  Object.fromEntries(CHANNEL_IDS.map((id) => [id, 0])) as Record<ChannelId, number>;

/** The UTC day `days` before `from`, as the server stores days. */
export const dayBefore = (from: Date, days: number) =>
  new Date(from.getTime() - days * 86_400_000).toISOString().slice(0, 10);
