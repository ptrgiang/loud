import {
  CHANNEL_IDS,
  CHANNEL_NAMES,
  type ChannelId,
  type Hub,
  type ProposalItem,
  type Scheduled,
} from "@loud/contracts";
import {
  CalendarClock,
  Check,
  Clock,
  Copy,
  NotebookPen,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";

import { Card, ClampText, ViewBody } from "~/components/Card";
import { ChannelFilter, PostText } from "~/components/Filters";
import { FlagList } from "~/components/Flags";
import { NoData } from "~/components/NoData";
import { ChannelTag, PageHeader } from "~/components/PageHeader";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";
import { builtAt, CHANNEL_ORDER } from "~/lib/analytics";
import { dayLabel, dec, hm, parseStamp, relative, until, ymd } from "~/lib/format";
import { toast } from "~/lib/toast";
import { cn } from "~/lib/utils";
import { useLoud } from "~/store";
import { patchView, useViewState } from "~/viewState";
import { useWork } from "~/workStore";

// ---- Proposals ----

function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1400);
  };
  return (
    <Button
      size="xs"
      variant="ghost-muted"
      onClick={() => void copy()}
      aria-label={t("plan.copyOpening")}
    >
      {state === "done" ? <Check /> : <Copy />}
      {state === "done"
        ? t("common.copied")
        : state === "failed"
          ? t("common.copyFailed")
          : t("common.copy")}
    </Button>
  );
}

const agentAsk = (p: ProposalItem) =>
  [
    `Write the ${CHANNEL_NAMES[p.channel]} post for this proposal, in my voice and within the channel's limit, and save it with save_draft.`,
    "",
    `Title: ${p.title}`,
    p.format && `Format: ${p.format}`,
    p.when && `When: ${p.when}`,
    p.hook && `Opening line: ${p.hook}`,
    p.outline && `Outline: ${p.outline}`,
    p.why && `Why: ${p.why}`,
  ]
    .filter((line) => line !== undefined && line !== "")
    .join("\n");

/** The two ways from an idea to a post: a draft to write yourself, or the agent writing it. */
export function ProposalActions({ p, size = "xs" }: { p: ProposalItem; size?: "xs" | "sm" }) {
  const t = useT();
  const saveDraft = useWork((s) => s.saveDraft);
  const ask = useWork((s) => s.ask);
  const go = useLoud((s) => s.go);
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button
        size={size}
        variant="outline"
        onClick={async () => {
          const saved = await saveDraft({ channel: p.channel, text: p.hook ?? "", note: p.title });
          if (saved) {
            toast("done", t("plan.draftSaved", { title: p.title }));
            go("drafts");
          }
        }}
      >
        <NotebookPen />
        {t("plan.draftIt")}
      </Button>
      <Button size={size} variant="outline" onClick={() => void ask(agentAsk(p))}>
        <Sparkles />
        {t("plan.writeWithAgent")}
      </Button>
    </div>
  );
}

function ProposalCard({ p }: { p: ProposalItem }) {
  const t = useT();
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs/5">
      <div className="flex items-center justify-between gap-2">
        <ChannelTag id={p.channel} />
        {p.when && (
          <Badge variant="outline" className="text-muted-foreground">
            <Clock />
            {p.when}
          </Badge>
        )}
      </div>
      <div>
        <h3 className="font-medium text-sm">{p.title}</h3>
        {p.format && <div className="mt-0.5 text-muted-foreground text-xs">{p.format}</div>}
      </div>
      {p.hook && (
        <div className="rounded-lg bg-muted px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs text-muted-foreground">{t("plan.openingLine")}</span>
            <CopyButton text={p.hook} />
          </div>
          <p className="text-sm">{p.hook}</p>
        </div>
      )}
      {p.outline && (
        <details className="group text-sm">
          <summary className="cursor-pointer text-muted-foreground text-xs hover:text-foreground">
            {t("plan.outline")}
          </summary>
          <p className="mt-1.5 whitespace-pre-line">{p.outline}</p>
        </details>
      )}
      {p.why && (
        <p className="text-sm">
          <span className="font-medium">{t("plan.why")}: </span>
          <span className="text-muted-foreground">{p.why}</span>
        </p>
      )}
      {!!p.evidence?.length && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">{t("plan.basedOn")}</span>
          {p.evidence.map((e) => (
            <PostText key={e.url + e.label} url={e.url} text={e.label} />
          ))}
        </div>
      )}
      <div className="mt-auto border-t pt-3">
        <ProposalActions p={p} />
      </div>
    </article>
  );
}

function Ideas() {
  const t = useT();
  const proposals = useLoud((s) => s.proposals);
  const channel = useViewState((s) => s.proposals.channel);
  const ask = useWork((s) => s.ask);

  if (!proposals?.items.length) {
    return (
      <Card title={t("plan.ideas")}>
        <div className="flex flex-col items-center gap-3 py-4 text-center text-muted-foreground text-sm">
          {t("plan.noIdeas")}
          <Button
            size="sm"
            onClick={() =>
              void ask(
                "Read my numbers and listening results, then propose this week's posts and save them with save_proposals.",
              )
            }
          >
            <Sparkles />
            {t("plan.askProposals")}
          </Button>
        </div>
      </Card>
    );
  }

  const items = proposals.items;
  const counts: Partial<Record<ChannelId | "all", number>> = { all: items.length };
  for (const p of items) counts[p.channel] = (counts[p.channel] ?? 0) + 1;
  const shown = items.filter((p) => !channel || p.channel === channel);
  const stop = proposals.stop ?? [];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium text-sm">
          {t("plan.ideas")}
          <span className="ml-2 font-normal text-muted-foreground text-xs">
            {t("plan.written", { when: relative(proposals.written) })}
          </span>
        </h2>
        <ChannelFilter
          value={channel}
          channels={CHANNEL_IDS.filter((id) => counts[id])}
          names={CHANNEL_NAMES}
          counts={counts}
          onChange={(channel) => patchView("proposals", { channel })}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
        {shown.map((p) => (
          <ProposalCard key={`${p.channel}:${p.title}`} p={p} />
        ))}
      </div>
      {stop.length > 0 && (
        <Card title={t("plan.stopLess")} bodyClassName="px-0 pb-0">
          <FlagList flags={stop.map((text) => ({ level: "warn", text }))} />
        </Card>
      )}
    </section>
  );
}

// ---- Queue ----

/** Two posts on one channel closer than this compete for the same audience. */
const MIN_GAP_H = 2;

interface Slot {
  readonly item: Scheduled;
  readonly gapH: number | null;
}

/** Queue by day from today, at least a week, through the last queued post. */
export function scheduleBoard(items: ReadonlyArray<Scheduled>, now: Date) {
  const sorted = [...items].sort((a, b) => (a.when > b.when ? 1 : -1));
  const prev = new Map<ChannelId, Date>();
  const slots: Array<Slot> = sorted.map((item) => {
    const t = parseStamp(item.when);
    const p = prev.get(item.channel);
    if (t) prev.set(item.channel, t);
    return { item, gapH: p && t ? (t.getTime() - p.getTime()) / 3_600_000 : null };
  });
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last = parseStamp(sorted.at(-1)?.when) ?? start;
  const days: Array<{ date: Date; key: string; slots: Array<Slot> }> = [];
  for (
    let d = start;
    d <= last || days.length < 7;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    const key = ymd(d);
    days.push({ date: d, key, slots: slots.filter((s) => s.item.when.startsWith(key)) });
  }
  return { days, total: sorted.length, last };
}

function Queue({ hub }: { hub: Hub }) {
  const t = useT();
  const now = builtAt(hub);
  const { days, total, last } = scheduleBoard(hub.scheduled, now);
  const today = ymd(now);
  // "Nothing queued" and "could not read the queue" are different: only claim the first when the collector saw it.
  const empty = hub.channels
    .filter((c) => c.scheduled_known && !c.scheduled)
    .map((c) => CHANNEL_NAMES[c.id]);
  const unknown = hub.channels.filter((c) => !c.scheduled_known).map((c) => CHANNEL_NAMES[c.id]);
  const perChannel = CHANNEL_ORDER.map(
    (id) => [id, hub.scheduled.filter((s) => s.channel === id).length] as const,
  ).filter(([, n]) => n);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium text-sm">
        {t("plan.queue")}
        <span className="ml-2 font-normal text-muted-foreground text-xs">
          {total
            ? t("plan.queueTotal", {
                total,
                day: dayLabel(last),
                per: perChannel.map(([id, n]) => `${CHANNEL_NAMES[id]} ${n}`).join(", "),
              })
            : t("plan.nothingScheduled")}
        </span>
      </h2>
      {(empty.length > 0 || unknown.length > 0) && (
        <div className="rounded-xl border bg-card shadow-xs/5">
          <FlagList
            flags={[
              ...(empty.length
                ? [
                    {
                      level: "warn" as const,
                      text: t("plan.emptyOn", { names: empty.join(", ") }),
                    },
                  ]
                : []),
              ...(unknown.length
                ? [
                    {
                      level: "info" as const,
                      text: t("plan.queueUnreadable", { names: unknown.join(", ") }),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      )}
      {total > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {days.map((d) => (
            <section
              key={d.key}
              className={cn(
                "flex w-56 shrink-0 flex-col gap-2 rounded-xl border bg-card p-2.5 shadow-xs/5",
                d.key === today && "border-primary/40",
              )}
            >
              <h3 className="flex items-baseline justify-between px-1 font-medium text-xs">
                {d.key === today ? t("common.today") : dayLabel(d.date)}
                {d.slots.length > 0 && (
                  <span className="font-normal text-muted-foreground">
                    {d.slots.length} {d.slots.length > 1 ? t("plan.postMany") : t("plan.postOne")}
                  </span>
                )}
              </h3>
              {d.slots.length ? (
                d.slots.map(({ item, gapH }) => (
                  <div
                    key={`${item.channel}:${item.when}:${item.text ?? ""}`}
                    className="rounded-lg border bg-background p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm tabular-nums">{hm(item.when)}</span>
                      <ChannelTag id={item.channel} />
                    </div>
                    <div className="mt-0.5 text-2xs text-muted-foreground">
                      {until(item.when, now)}
                    </div>
                    {gapH !== null && gapH < MIN_GAP_H && (
                      <div className="mt-1.5 flex items-center gap-1 text-2xs text-warning-foreground">
                        <TriangleAlert className="size-3" aria-hidden />
                        {t("plan.gapWarn", {
                          gap: dec(gapH),
                          name: CHANNEL_NAMES[item.channel],
                        })}
                      </div>
                    )}
                    <ClampText text={item.text || t("posts.noText")} className="mt-1.5 text-xs" />
                  </div>
                ))
              ) : (
                <div className="px-1 py-3 text-muted-foreground text-xs">{t("plan.empty")}</div>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

/** What to post next: the agent's ideas, then what is already queued on each platform. */
export function PlanView() {
  const t = useT();
  const hub = useLoud((s) => s.hub);
  if (!hub) return <NoData title={t("nav.plan")} icon={CalendarClock} />;
  return (
    <>
      <PageHeader title={t("nav.plan")} description={t("plan.description")} />
      <ViewBody wide>
        <Ideas />
        <Queue hub={hub} />
      </ViewBody>
    </>
  );
}
