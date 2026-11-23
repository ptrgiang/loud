import { CHANNEL_IDS, CHANNEL_NAMES, type ChannelId, type Hub, type Post } from "@loud/contracts";
import { ArrowDown, ArrowUp, ChartNoAxesColumn } from "lucide-react";
import { Fragment, useMemo } from "react";

import { BucketBars, InlineBar } from "~/components/Bars";
import { Card, ViewBody } from "~/components/Card";
import { FlagList } from "~/components/Flags";
import { Freshness } from "~/components/Freshness";
import { TipRow, useChartTip, useWidth } from "~/components/ChartTip";
import { NoData } from "~/components/NoData";
import { ChannelDot, ChannelTag, Empty, PageHeader } from "~/components/PageHeader";
import { useT, type MsgKey } from "~/i18n";
import {
  BLOCKS,
  builtAt,
  blockLabel,
  blockOf,
  buckets,
  type Callout,
  callouts,
  channelsOf,
  daysSinceFirstPost,
  FEATURES,
  group,
  isOwn,
  lift,
  median,
  ratePer1k,
  rewatch,
  safeUrl,
  settled,
  sumOf,
  weekdayOf,
} from "~/lib/analytics";
import {
  axisTick,
  compact,
  dayLabel,
  dec,
  fmt,
  isNum,
  parseStamp,
  short,
  stampLabel,
  WEEKDAYS,
} from "~/lib/format";
import { cn } from "~/lib/utils";
import { useLoud } from "~/store";

type BySettled = ReadonlyArray<readonly [ChannelId, ReadonlyArray<Post>]>;

// ---- What the numbers say ----

function CalloutText({ c }: { c: Callout }) {
  const t = useT();
  // The numbers lose their bold here: the strings are whole sentences so translations stay natural.
  switch (c.kind) {
    case "concentration":
      return t("ins.callout.concentration", {
        pct: dec(100 * c.share, 0),
        posts: c.posts,
        median: fmt(c.median),
      });
    case "timing":
      return t("ins.callout.timing", {
        block: blockLabel(c.block),
        median: fmt(Math.round(c.median)),
        ratio: dec(c.ratio),
        posts: c.posts,
      });
    case "content":
      return t("ins.callout.content", {
        says: c.says,
        withM: fmt(Math.round(c.lift.withMedian ?? 0)),
        withoutM: fmt(Math.round(c.lift.withoutMedian ?? 0)),
        ratio: dec(c.lift.ratio),
        withN: c.lift.withN ?? 0,
        withoutN: c.lift.withoutN ?? 0,
      });
  }
}

const CALLOUT_KIND: Record<Callout["kind"], MsgKey> = {
  concentration: "ins.kind.concentration",
  timing: "ins.kind.timing",
  content: "ins.kind.content",
};

function Callouts({ hub }: { hub: Hub }) {
  const t = useT();
  const list = callouts(hub);
  if (!list.length) return null;
  return (
    <Card title={t("ins.callouts")} hint={t("ins.callouts.hint")}>
      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
        {list.map((c) => (
          <div key={`${c.channel}:${c.kind}`} className="rounded-lg bg-muted px-3 py-2.5 text-sm">
            <div className="mb-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
              <ChannelDot id={c.channel} />
              {CHANNEL_NAMES[c.channel]} · {t(CALLOUT_KIND[c.kind])}
            </div>
            <CalloutText c={c} />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---- Notes: the build's findings and the agent's ----

/** "Threads: …" or "Instagram by format …" belongs to that channel. The name must stand alone, so "Xenial" is not X. */
export function noteChannel(note: string): { channel: ChannelId | null; body: string } {
  for (const id of CHANNEL_IDS) {
    const name = CHANNEL_NAMES[id];
    if (new RegExp(`^${name}(?![\\p{L}\\p{N}])`, "iu").test(note)) {
      const body = note.replace(new RegExp(`^${name}\\s*:\\s*`, "iu"), "");
      return { channel: id, body: body.charAt(0).toUpperCase() + body.slice(1) };
    }
  }
  return { channel: null, body: note };
}

/** What went well and the agent's notes. Checks that need doing are on Today. */
function Notes({ hub }: { hub: Hub }) {
  const t = useT();
  const proposals = useLoud((s) => s.proposals);
  const notes = proposals?.audit ?? [];
  const flags = hub.flags.filter((f) => f.level !== "warn");
  if (!notes.length && !flags.length) return null;
  return (
    <div className="grid grid-cols-1 gap-4 @5xl:grid-cols-2">
      {flags.length > 0 && (
        <Card title={t("ins.workedWell")} hint={t("ins.workedWell.hint")} bodyClassName="px-0 pb-0">
          <FlagList flags={flags} />
        </Card>
      )}
      {notes.length > 0 && (
        <Card title={t("ins.agentNotes")} hint={t("ins.agentNotes.hint")} bodyClassName="px-0 pb-0">
          <ul className="divide-y">
            {notes.map((note) => {
              const { channel, body } = noteChannel(note);
              return (
                <li key={note} className="flex gap-3 px-4 py-2.5 text-sm">
                  <span className="w-24 shrink-0 pt-px">
                    {channel ? (
                      <ChannelTag id={channel} />
                    ) : (
                      <span className="text-muted-foreground text-xs">{t("ins.general")}</span>
                    )}
                  </span>
                  <span>{body}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ---- Views per post: one dot per post on a log axis ----

const ROW_H = 52;
const LEFT = 84;

function ViewsPerPost({ rows }: { rows: BySettled }) {
  const t = useT();
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useChartTip();
  const all = rows.flatMap(([, l]) => l.map((p) => Math.max(1, p.views ?? 1)));
  const lo = 10 ** Math.floor(Math.log10(Math.min(...all)));
  const hi = 10 ** Math.ceil(Math.log10(Math.max(10, ...all)));
  const W = Math.max(320, width);
  const T = 8;
  const B = 24;
  const R = 12;
  const H = T + B + ROW_H * rows.length;
  const x = (v: number) =>
    LEFT +
    ((Math.log10(Math.max(lo, v)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) *
      (W - LEFT - R);
  const ticks: Array<number> = [];
  for (let e = Math.log10(lo); e <= Math.log10(hi); e++)
    for (const m of [1, 3]) if (m * 10 ** e <= hi) ticks.push(m * 10 ** e);

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg width={W} height={H} role="img" aria-label={t("ins.chartAria")} className="block">
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={x(v)}
                x2={x(v)}
                y1={T}
                y2={H - B}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={x(v)}
                y={H - 7}
                textAnchor="middle"
                className="fill-muted-foreground text-2xs tabular-nums"
              >
                {axisTick(v, hi)}
              </text>
            </g>
          ))}
          {rows.map(([id, list], r) => {
            const cy = T + ROW_H * r + ROW_H / 2;
            const md = median(list.map((p) => p.views));
            return (
              <g key={id}>
                <text x={0} y={cy + 4} className="fill-foreground text-xs">
                  {CHANNEL_NAMES[id]}
                </text>
                {list.map((p, i) => {
                  // Deterministic jitter, so a re-render does not shuffle the dots.
                  const cy2 = cy + (((i * 37) % 21) - 10) * 1.3;
                  const cx = x(p.views ?? 1);
                  const href = safeUrl(p.url);
                  const content = (
                    <>
                      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                        <ChannelDot id={p.channel} />
                        {stampLabel(p.posted)}
                      </div>
                      <div className="mb-1">{short(p.text, 120) || t("posts.noText")}</div>
                      <TipRow value={fmt(p.views)} label={t("metric.views")} />
                    </>
                  );
                  return (
                    <g key={p.id}>
                      <circle
                        cx={cx}
                        cy={cy2}
                        r={4.5}
                        fill={`var(--ch-${id})`}
                        stroke="var(--card)"
                        strokeWidth={2}
                      />
                      <circle
                        cx={cx}
                        cy={cy2}
                        r={12}
                        fill="transparent"
                        tabIndex={-1}
                        className={cn(href && "cursor-pointer")}
                        onPointerMove={(e) => tip.show(e, content)}
                        onPointerLeave={tip.hide}
                        onClick={() =>
                          href && void window.loud?.invoke("links.open", { url: href })
                        }
                      />
                    </g>
                  );
                })}
                {md !== null && (
                  <line
                    x1={x(md)}
                    x2={x(md)}
                    y1={cy - 20}
                    y2={cy + 20}
                    className="pointer-events-none stroke-foreground"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                )}
              </g>
            );
          })}
        </svg>
      )}
      {tip.node}
    </div>
  );
}

// ---- Rates per 1k views ----

const RATES = [
  ["likes", "metric.likes"],
  ["replies", "metric.replies"],
  ["reposts", "metric.reposts"],
  ["shares", "metric.shares"],
  ["saves", "metric.saves"],
  ["follows", "metric.follows"],
] as const;

function Rates({ rows }: { rows: BySettled }) {
  const t = useT();
  const values = rows.map(([id, l]) => [id, RATES.map(([k]) => ratePer1k(l, k))] as const);
  const max = RATES.map((_, i) => Math.max(1e-4, ...values.map(([, v]) => v[i] ?? 0)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="py-2 pr-3 text-left font-medium">{t("ins.per1k")}</th>
            {rows.map(([id, l]) => (
              <th key={id} className="px-2 py-2 text-left font-medium">
                <ChannelTag id={id} />
                <div className="font-normal text-2xs">{t("bars.posts", { n: l.length })}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {RATES.map(([k, label], i) => (
            <tr key={k}>
              <td className="py-2 pr-3">{t(label)}</td>
              {values.map(([id, v]) => (
                <td key={id} className="px-2 py-2">
                  {v[i] === null ? (
                    <span className="text-muted-foreground">–</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <InlineBar value={v[i]!} max={max[i]!} channel={id} />
                      <span className="w-9 text-right tabular-nums">{dec(v[i])}</span>
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
          {rows.some(([, l]) => rewatch(l) !== null) && (
            <tr>
              <td className="py-2 pr-3" title={t("ins.rewatchTitle")}>
                {t("ins.rewatch")}
              </td>
              {rows.map(([id, l]) => {
                const r = rewatch(l);
                return (
                  <td key={id} className="px-2 py-2 tabular-nums">
                    {r ? `×${dec(r, 2)}` : <span className="text-muted-foreground">–</span>}
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---- Heatmaps: median views per slot, each row scaled to its own max ----

function Heat<K extends number>({
  rows,
  cols,
  colLabel,
  keyOf,
}: {
  rows: BySettled;
  cols: ReadonlyArray<K>;
  colLabel: (k: K) => string;
  keyOf: (p: Post) => number | null;
}) {
  const t = useT();
  const tip = useChartTip();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c} className="pb-1 font-normal text-2xs text-muted-foreground tabular-nums">
                {colLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([id, list]) => {
            const cells = cols.map((c) => group(list.filter((p) => keyOf(p) === c)));
            const max = Math.max(1, ...cells.filter((x) => x.n >= 2).map((x) => x.median ?? 0));
            return (
              <tr key={id}>
                <th className="pr-2 text-left font-normal">
                  <ChannelTag id={id} />
                </th>
                {cells.map((x, i) => {
                  const col = cols[i]!;
                  if (!x.n) {
                    return (
                      <td
                        key={col}
                        className="h-10 rounded-md bg-muted/50 text-center text-muted-foreground/60"
                        title={t("ins.emptySlot")}
                      >
                        ·
                      </td>
                    );
                  }
                  // Single-post cells stay pale: one post is not a pattern.
                  const v = x.n >= 2 ? (x.median ?? 0) / max : 0.08;
                  const content = (
                    <>
                      <div className="mb-1 text-muted-foreground">
                        {CHANNEL_NAMES[id]} · {colLabel(col)}
                      </div>
                      <TipRow value={fmt(Math.round(x.median ?? 0))} label={t("ins.medianViews")} />
                      <TipRow
                        value={x.n}
                        label={x.n < 2 ? t("ins.tooFewPosts") : t("common.posts")}
                      />
                    </>
                  );
                  return (
                    <td
                      key={col}
                      tabIndex={0}
                      onPointerMove={(e) => tip.show(e, content)}
                      onFocus={(e) => tip.show(e, content)}
                      onPointerLeave={tip.hide}
                      onBlur={tip.hide}
                      className={cn(
                        "h-10 min-w-11 rounded-md px-1 text-center outline-none hover:ring-2 hover:ring-foreground/20 focus-visible:ring-2 focus-visible:ring-ring",
                        v > 0.55 ? "text-white" : "text-foreground",
                      )}
                      style={{
                        background: `color-mix(in oklab, var(--ch-${id}) ${Math.round(10 + v * 90)}%, var(--card))`,
                      }}
                    >
                      <div className="font-semibold tabular-nums">
                        {compact(Math.round(x.median ?? 0))}
                      </div>
                      <div className="text-3xs opacity-75">{t("bars.posts", { n: x.n })}</div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {tip.node}
    </div>
  );
}

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

// ---- Content features ----

function Features({ rows }: { rows: BySettled }) {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="py-2 pr-3 text-left font-medium">{t("ins.postFeature")}</th>
            {rows.map(([id]) => (
              <th key={id} className="px-2 py-2 text-left font-medium">
                <ChannelTag id={id} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {FEATURES.map((f) => (
            <tr key={f.label}>
              <td className="py-2 pr-3">{f.label}</td>
              {rows.map(([id, list]) => {
                const r = lift(list, f.test);
                if (r.ratio === null) {
                  return (
                    <td key={id} className="px-2 py-2 text-2xs text-muted-foreground">
                      {t("ins.tooFew", { a: r.withN ?? 0, b: r.withoutN ?? 0 })}
                    </td>
                  );
                }
                const up = r.ratio >= 1;
                const Arrow = up ? ArrowUp : ArrowDown;
                return (
                  <td key={id} className="px-2 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 font-semibold tabular-nums",
                        up ? "text-success-foreground" : "text-destructive-foreground",
                      )}
                    >
                      <Arrow
                        className="size-3"
                        aria-label={up ? t("ins.arrow.more") : t("ins.arrow.fewer")}
                      />
                      ×{dec(r.ratio)}
                    </span>
                    <div className="text-2xs text-muted-foreground tabular-nums">
                      {compact(Math.round(r.withMedian ?? 0))} vs{" "}
                      {compact(Math.round(r.withoutMedian ?? 0))} · {r.withN}/{r.withoutN}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- X: posts vs replies ----

function XReplies({ posts }: { posts: ReadonlyArray<Post> }) {
  const t = useT();
  const all = posts.filter((p) => p.channel === "x" && isNum(p.views) && (p.age_h ?? 0) >= 24);
  if (!all.length) return <div className="text-muted-foreground text-sm">{t("ins.noX")}</div>;
  const own = all.filter(isOwn);
  const replies = all.filter((p) => !isOwn(p));
  const share = (100 * sumOf(replies, "views")) / Math.max(1, sumOf(all, "views"));
  return (
    <>
      <BucketBars
        channel="x"
        rows={[
          { label: t("ins.postsN", { n: own.length }), ...group(own) },
          { label: t("ins.repliesN", { n: replies.length }), ...group(replies) },
        ]}
      />
      <p className="mt-3 text-muted-foreground text-xs">
        {t("ins.xTotals", {
          posts: fmt(sumOf(own, "views")),
          replies: fmt(sumOf(replies, "views")),
          pct: dec(share, 0),
        })}
      </p>
    </>
  );
}

// ---- Cadence: one cell per day since the first post ----

function Cadence({ hub, channels }: { hub: Hub; channels: ReadonlyArray<ChannelId> }) {
  const t = useT();
  const tip = useChartTip();
  const now = builtAt(hub);
  const days = daysSinceFirstPost(hub.posts, now);
  const byDay = useMemo(() => {
    const m = new Map<string, { n: number; v: number }>();
    for (const p of hub.posts) {
      if (!isOwn(p) || !p.posted) continue;
      const k = `${p.channel}|${p.posted.slice(0, 10)}`;
      const cur = m.get(k) ?? { n: 0, v: 0 };
      m.set(k, { n: cur.n + 1, v: cur.v + (p.views ?? 0) });
    }
    return m;
  }, [hub]);
  if (!days.length) return null;
  return (
    <div className="overflow-x-auto">
      <table
        className="border-separate border-spacing-0.5 text-xs"
        style={{ minWidth: days.length * 26 + 110 }}
      >
        <thead>
          <tr>
            <th />
            {days.map((k) => {
              const d = parseStamp(k)!;
              return (
                <th
                  key={k}
                  title={dayLabel(d)}
                  className={cn(
                    "pb-1 font-normal text-3xs tabular-nums",
                    d.getDay() === 1 ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {d.getDate()}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {channels.map((id) => {
            const cells = days.map((k) => byDay.get(`${id}|${k}`) ?? { n: 0, v: 0 });
            const max = Math.max(1, ...cells.map((c) => c.v));
            const off = cells.filter((c) => !c.n).length;
            return (
              <tr key={id}>
                <th className="sticky left-0 z-10 bg-card pr-2 text-left font-normal">
                  <ChannelTag id={id} />
                  <div className="text-3xs text-muted-foreground">
                    {t("ins.daysOff", { n: off })}
                  </div>
                </th>
                {cells.map((c, i) => {
                  const day = days[i]!;
                  if (!c.n)
                    return (
                      <td
                        key={day}
                        className="h-8 min-w-6 rounded-sm bg-muted/50"
                        title={t("ins.noPost", { day: dayLabel(parseStamp(day)) })}
                      />
                    );
                  const v = Math.max(0.08, c.v / max);
                  const content = (
                    <>
                      <div className="mb-1 text-muted-foreground">
                        {CHANNEL_NAMES[id]} · {dayLabel(parseStamp(day))}
                      </div>
                      <TipRow value={fmt(c.v)} label={t("metric.views")} />
                      <TipRow value={c.n} label={t("common.posts")} />
                    </>
                  );
                  return (
                    <td
                      key={day}
                      onPointerMove={(e) => tip.show(e, content)}
                      onPointerLeave={tip.hide}
                      className={cn(
                        "h-8 min-w-6 rounded-sm text-center font-semibold tabular-nums hover:ring-2 hover:ring-foreground/20",
                        v > 0.55 ? "text-white" : "text-foreground",
                      )}
                      style={{
                        background: `color-mix(in oklab, var(--ch-${id}) ${Math.round(10 + v * 90)}%, var(--card))`,
                      }}
                    >
                      {c.n}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {tip.node}
    </div>
  );
}

// ---- The view ----

const DURATION_EDGES = [
  [0, 10],
  [10, 15],
  [15, 20],
  [20, 30],
  [30, Infinity],
] as const;
const LENGTH_EDGES = [
  [0, 120],
  [120, 240],
  [240, 400],
  [400, Infinity],
] as const;

export function InsightsView() {
  const t = useT();
  const hub = useLoud((s) => s.hub);
  const rows = useMemo<BySettled>(
    () =>
      hub
        ? channelsOf(hub)
            .map((id) => [id, settled(hub.posts, id)] as const)
            .filter(([, l]) => l.length)
        : [],
    [hub],
  );
  if (!hub) return <NoData title={t("nav.insights")} icon={ChartNoAxesColumn} />;
  if (!rows.length) {
    return (
      <>
        <PageHeader title={t("nav.insights")} />
        <Empty icon={<ChartNoAxesColumn />} title={t("ins.noSettled")}>
          {t("ins.noSettledBody")}
        </Empty>
      </>
    );
  }

  const by = Object.fromEntries(rows) as Partial<Record<ChannelId, ReadonlyArray<Post>>>;
  const videos = [...(by.ig ?? []), ...(by.fb ?? [])].filter((p) => isNum(p.dur));
  const textChannels = rows.filter(([id]) => id === "threads" || id === "x");

  return (
    <>
      <PageHeader
        title={t("nav.insights")}
        description={
          <>
            <Freshness hub={hub} />. {t("ins.descriptionTail")}
          </>
        }
      />
      <ViewBody wide>
        <Callouts hub={hub} />
        <Notes hub={hub} />
        <div className="grid grid-cols-1 gap-4 @6xl:grid-cols-12">
          <Card
            className="@6xl:col-span-7"
            title={t("ins.viewsPerPost")}
            hint={t("ins.viewsPerPost.hint")}
          >
            <ViewsPerPost rows={rows} />
          </Card>
          <Card className="@6xl:col-span-5" title={t("ins.engRates")} hint={t("ins.engRates.hint")}>
            <Rates rows={rows} />
          </Card>
          <Card
            className="@6xl:col-span-7"
            title={t("ins.hourHeat")}
            hint={t("ins.hourHeat.hint", { tz: hub.timezone ?? t("ins.localTz") })}
          >
            <Heat rows={rows} cols={BLOCKS} colLabel={blockLabel} keyOf={blockOf} />
          </Card>
          <Card
            className="@6xl:col-span-5"
            title={t("ins.dayOfWeek")}
            hint={t("ins.dayOfWeek.hint")}
          >
            <Heat rows={rows} cols={WEEK_ORDER} colLabel={(d) => WEEKDAYS[d]} keyOf={weekdayOf} />
          </Card>
          <Card className="@6xl:col-span-7" title={t("ins.features")} hint={t("ins.features.hint")}>
            <Features rows={rows} />
          </Card>
          <Card
            className="@6xl:col-span-5"
            title={t("ins.xPostsReplies")}
            hint={t("ins.xPostsReplies.hint")}
          >
            <XReplies posts={hub.posts} />
          </Card>
          <Card
            className="@6xl:col-span-5"
            title={t("ins.videoLen")}
            hint={by.fb ? t("ins.videoLen.igfb") : t("ins.videoLen.ig")}
          >
            {videos.length ? (
              <BucketBars
                rows={buckets(videos, (p) => p.dur, DURATION_EDGES, " s")}
                channel={videos.every((p) => p.channel === "ig") ? "ig" : undefined}
              />
            ) : (
              <div className="text-muted-foreground text-sm">{t("ins.noVideos")}</div>
            )}
          </Card>
          <Card className="@6xl:col-span-7" title={t("ins.textLen")} hint={t("ins.textLen.hint")}>
            {textChannels.length ? (
              <div className="flex flex-col gap-4">
                {textChannels.map(([id, list]) => (
                  <Fragment key={id}>
                    <ChannelTag id={id} />
                    <BucketBars
                      rows={buckets(list, (p) => (p.text ?? "").length, LENGTH_EDGES, " chars")}
                      channel={id}
                    />
                  </Fragment>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">{t("ins.nothingYet")}</div>
            )}
          </Card>
        </div>
        <Card title={t("ins.cadence")} hint={t("ins.cadence.hint")}>
          <Cadence hub={hub} channels={rows.map(([id]) => id)} />
        </Card>
      </ViewBody>
    </>
  );
}
