// Builds the text file "Export diagnostics" writes: enough to debug a broken collection run or a failed update
// without the user pasting anything private. Handles, account ids, page names, keywords and the playbook are
// redacted — the file is meant to be sent to a person.
import type { BudgetView, CollectStatus, Settings } from "@loud/contracts";

export interface DiagnosticsInput {
  readonly version: string;
  readonly os: string;
  readonly arch: string;
  readonly packaged: boolean;
  readonly demo: boolean;
  readonly settings: Settings;
  readonly collect: CollectStatus;
  readonly budgets: ReadonlyArray<BudgetView>;
  readonly log: ReadonlyArray<string>;
}

/** Handles, ids and anything the user typed become markers; everything else stays readable. */
const redactSettings = (s: Settings): unknown => ({
  timezone: s.timezone,
  since: s.since,
  platforms: Object.fromEntries(
    Object.entries(s.platforms).map(([id, p]) => [
      id,
      {
        enabled: p.enabled,
        handle: p.handle ? "<redacted>" : "",
        ...(p.userId ? { userId: "<redacted>" } : {}),
        ...(p.assetId ? { assetId: "<redacted>" } : {}),
        ...(p.pages?.length
          ? { pages: p.pages.map(() => ({ id: "<redacted>", name: "<redacted>" })) }
          : {}),
        ...(p.connectedAt ? { connectedAt: p.connectedAt } : {}),
      },
    ]),
  ),
  keywords: Object.fromEntries(
    Object.entries(s.keywords).map(([k, v]) => [
      k,
      `${v.length} keyword${v.length === 1 ? "" : "s"}`,
    ]),
  ),
  agent: { ...s.agent, playbook: s.agent.playbook ? "<set>" : "" },
  collection: s.collection,
  updates: s.updates,
  usage: { share: s.usage.share },
});

export function buildDiagnostics(i: DiagnosticsInput): string {
  const section = (title: string, body: string) => `\n== ${title} ==\n${body}\n`;
  return [
    `Loud diagnostics ${new Date().toISOString()}`,
    `version ${i.version} · ${i.os}/${i.arch} · ${i.packaged ? "installed" : "from source"}${i.demo ? " · demo data" : ""}`,
    section("settings", JSON.stringify(redactSettings(i.settings), null, 2)),
    section("collection", JSON.stringify({ ...i.collect, budgets: i.budgets }, null, 2)),
    section("log", i.log.length ? i.log.join("\n") : "(empty)"),
  ].join("");
}
