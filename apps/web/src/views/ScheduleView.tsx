import { CHANNEL_NAMES, type ChannelId, type Scheduled } from "@loud/contracts";
import { CalendarClock, TriangleAlert } from "lucide-react";

import { ClampText, Quiet, ViewBody } from "~/components/Card";
import { FlagList } from "~/components/Flags";
import { NoData } from "~/components/NoData";
import { ChannelTag, PageHeader } from "~/components/PageHeader";
import { builtAt, CHANNEL_ORDER } from "~/lib/analytics";
import { dayLabel, dec, hm, parseStamp, until, ymd } from "~/lib/format";
import { cn } from "~/lib/utils";
import { useLoud } from "~/store";

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

export function ScheduleView() {
  const hub = useLoud((s) => s.hub);
  if (!hub) return <NoData title="Schedule" icon={CalendarClock} />;

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
    <>
      <PageHeader
        title="Schedule"
        description={
          total
            ? `${total} queued through ${dayLabel(last)}. ${perChannel.map(([id, n]) => `${CHANNEL_NAMES[id]} ${n}`).join(" · ")}`
            : "Nothing queued"
        }
      />
      <ViewBody wide>
        {(empty.length > 0 || unknown.length > 0) && (
          <div className="rounded-xl border bg-card shadow-xs/5">
            <FlagList
              flags={[
                ...(empty.length
                  ? [{ level: "warn" as const, text: `Nothing scheduled on ${empty.join(", ")}.` }]
                  : []),
                ...(unknown.length
                  ? [
                      {
                        level: "info" as const,
                        text: `Could not read the queue on ${unknown.join(", ")}.`,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        )}
        {total === 0 ? (
          <Quiet>Nothing scheduled.</Quiet>
        ) : (
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
                  {d.key === today ? "Today" : dayLabel(d.date)}
                  {d.slots.length > 0 && (
                    <span className="font-normal text-muted-foreground">
                      {d.slots.length} {d.slots.length > 1 ? "posts" : "post"}
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
                          {dec(gapH)} h after the previous {CHANNEL_NAMES[item.channel]} post
                        </div>
                      )}
                      <ClampText text={item.text || "(no text)"} className="mt-1.5 text-xs" />
                    </div>
                  ))
                ) : (
                  <div className="px-1 py-3 text-muted-foreground text-xs">Empty</div>
                )}
              </section>
            ))}
          </div>
        )}
      </ViewBody>
    </>
  );
}
