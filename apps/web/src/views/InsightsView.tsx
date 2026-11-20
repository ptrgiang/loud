import { CHANNEL_NAMES, type ChannelId, type Hub, type Post } from "@loud/contracts";
import { ArrowDown, ArrowUp, ChartNoAxesColumn } from "lucide-react";
import { Fragment, useMemo } from "react";

import { BucketBars, InlineBar } from "~/components/Bars";
import { Card, ViewBody } from "~/components/Card";
import { TipRow, useChartTip, useWidth } from "~/components/ChartTip";
import { NoData } from "~/components/NoData";
import { ChannelDot, ChannelTag, Empty, PageHeader } from "~/components/PageHeader";
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
  const b = (s: string) => <span className="font-semibold">{s}</span>;
  switch (c.kind) {
    case "concentration":
      return (
        <>
          One post holds {b(`${dec(100 * c.share, 0)}%`)} of the views of {c.posts} posts. The
          median is {b(fmt(c.median))}.
        </>
      );
    case "timing":
      return (
        <>
          Posts at {b(blockLabel(c.block))} have a median of {b(fmt(Math.round(c.median)))},{" "}
          {dec(c.ratio)}× the channel median ({c.posts} posts).
        </>
      );
    case "content":
      return (
        <>
          Posts that {c.says}: median {b(fmt(Math.round(c.lift.withMedian ?? 0)))} vs{" "}
          {b(fmt(Math.round(c.lift.withoutMedian ?? 0)))} (×{dec(c.lift.ratio)}; {c.lift.withN} vs{" "}
          {c.lift.withoutN} posts).
        </>
      );
  }
}

const CALLOUT_KIND = {
  concentration: "Concentration",
  timing: "Timing",
  content: "Content",
} as const;

function Callouts({ hub }: { hub: Hub }) {
  const list = callouts(hub);
  if (!list.length) return null;
  return (
    <Card
      title="What the numbers say"
      hint="Recomputed on every build. Shown only for a difference of 1.5× or more, with at least 3 posts in each group."
    >
      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
        {list.map((c) => (
          <div key={`${c.channel}:${c.kind}`} className="rounded-lg bg-muted px-3 py-2.5 text-sm">
            <div className="mb-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
              <ChannelDot id={c.channel} />
              {CHANNEL_NAMES[c.channel]} · {CALLOUT_KIND[c.kind]}
            </div>
            <CalloutText c={c} />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---- Views per post: one dot per post on a log axis ----

const ROW_H = 52;
const LEFT = 84;

function ViewsPerPost({ rows }: { rows: BySettled }) {
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
        <svg
          width={W}
          height={H}
          role="img"
          aria-label="Views per post by channel, log scale"
          className="block"
        >
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
                      <div className="mb-1">{short(p.text, 120) || "(no text)"}</div>
                      <TipRow value={fmt(p.views)} label="Views" />
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
  ["likes", "Likes"],
  ["replies", "Replies"],
  ["reposts", "Reposts"],
  ["shares", "Shares"],
  ["saves", "Saves"],
  ["follows", "Follows"],
] as const;

function Rates({ rows }: { rows: BySettled }) {
  const values = rows.map(([id, l]) => [id, RATES.map(([k]) => ratePer1k(l, k))] as const);
  const max = RATES.map((_, i) => Math.max(1e-4, ...values.map(([, v]) => v[i] ?? 0)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="py-2 pr-3 text-left font-medium">Per 1,000 views</th>
            {rows.map(([id, l]) => (
              <th key={id} className="px-2 py-2 text-left font-medium">
                <ChannelTag id={id} />
                <div className="font-normal text-2xs">{l.length} posts</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {RATES.map(([k, label], i) => (
            <tr key={k}>
              <td className="py-2 pr-3">{label}</td>
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
              <td
                className="py-2 pr-3"
                title="Views per unique viewer: above 1 means people watch again"
              >
                Rewatch (views/viewer)
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
                        title="Nothing posted in this slot"
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
                      <TipRow value={fmt(Math.round(x.median ?? 0))} label="Median views" />
                      <TipRow
                        value={x.n}
                        label={x.n < 2 ? "Posts (too few to compare)" : "Posts"}
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
                      <div className="text-3xs opacity-75">{x.n} posts</div>
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
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="py-2 pr-3 text-left font-medium">Post feature</th>
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
                      too few ({r.withN}/{r.withoutN})
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
                      <Arrow className="size-3" aria-label={up ? "more" : "fewer"} />×{dec(r.ratio)}
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
  const all = posts.filter((p) => p.channel === "x" && isNum(p.views) && (p.age_h ?? 0) >= 24);
  if (!all.length) return <div className="text-muted-foreground text-sm">No X data yet.</div>;
  const own = all.filter(isOwn);
  const replies = all.filter((p) => !isOwn(p));
  const share = (100 * sumOf(replies, "views")) / Math.max(1, sumOf(all, "views"));
  return (
    <>
      <BucketBars
        channel="x"
        rows={[
          { label: `Posts (${own.length})`, ...group(own) },
          { label: `Replies (${replies.length})`, ...group(replies) },
        ]}
      />
      <p className="mt-3 text-muted-foreground text-xs">
        Total views: posts {fmt(sumOf(own, "views"))} · replies {fmt(sumOf(replies, "views"))}.
        Replies bring {dec(share, 0)}% of your X views.
      </p>
    </>
  );
}

// ---- Cadence: one cell per day since the first post ----

function Cadence({ hub, channels }: { hub: Hub; channels: ReadonlyArray<ChannelId> }) {
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
                  <div className="text-3xs text-muted-foreground">{off} days off</div>
                </th>
                {cells.map((c, i) => {
                  const day = days[i]!;
                  if (!c.n)
                    return (
                      <td
                        key={day}
                        className="h-8 min-w-6 rounded-sm bg-muted/50"
                        title={`${dayLabel(parseStamp(day))}: no post`}
                      />
                    );
                  const v = Math.max(0.08, c.v / max);
                  const content = (
                    <>
                      <div className="mb-1 text-muted-foreground">
                        {CHANNEL_NAMES[id]} · {dayLabel(parseStamp(day))}
                      </div>
                      <TipRow value={fmt(c.v)} label="Views" />
                      <TipRow value={c.n} label="Posts" />
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
  if (!hub) return <NoData title="Insights" icon={ChartNoAxesColumn} />;
  if (!rows.length) {
    return (
      <>
        <PageHeader title="Insights" />
        <Empty icon={<ChartNoAxesColumn />} title="No settled posts yet">
          Insights compare posts at least a day old. Check back tomorrow.
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
        title="Insights"
        description="Your own posts at least a day old, since newer ones are still collecting views. Medians, not averages."
      />
      <ViewBody wide>
        <Callouts hub={hub} />
        <div className="grid grid-cols-1 gap-4 @6xl:grid-cols-12">
          <Card
            className="@6xl:col-span-7"
            title="Views per post"
            hint="One dot per post, log scale. The dark tick is the median. Hover for the post; click to open it."
          >
            <ViewsPerPost rows={rows} />
          </Card>
          <Card
            className="@6xl:col-span-5"
            title="Engagement rates"
            hint="Bars compare channels within a row. A dash means the platform does not report it."
          >
            <Rates rows={rows} />
          </Card>
          <Card
            className="@6xl:col-span-7"
            title="Posting hour → median views"
            hint={`${hub.timezone ?? "Local"} time, 3-hour slots. Shade is scaled per channel; single-post cells stay pale.`}
          >
            <Heat rows={rows} cols={BLOCKS} colLabel={blockLabel} keyOf={blockOf} />
          </Card>
          <Card className="@6xl:col-span-5" title="Day of week" hint="Read it like the hour table.">
            <Heat rows={rows} cols={WEEK_ORDER} colLabel={(d) => WEEKDAYS[d]} keyOf={weekdayOf} />
          </Card>
          <Card
            className="@6xl:col-span-7"
            title="Content features → views"
            hint="Median views with the feature vs without. Needs 3 posts on each side; correlation, not causation."
          >
            <Features rows={rows} />
          </Card>
          <Card
            className="@6xl:col-span-5"
            title="X: posts vs replies"
            hint="Median views, items a day old or more."
          >
            <XReplies posts={hub.posts} />
          </Card>
          <Card
            className="@6xl:col-span-5"
            title="Video length → median views"
            hint={by.fb ? "Instagram and Facebook." : "Instagram."}
          >
            {videos.length ? (
              <BucketBars
                rows={buckets(videos, (p) => p.dur, DURATION_EDGES, " s")}
                channel={videos.every((p) => p.channel === "ig") ? "ig" : undefined}
              />
            ) : (
              <div className="text-muted-foreground text-sm">No video lengths yet.</div>
            )}
          </Card>
          <Card
            className="@6xl:col-span-7"
            title="Text length → median views"
            hint="Hashtags and credit lines count too."
          >
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
              <div className="text-muted-foreground text-sm">Nothing yet.</div>
            )}
          </Card>
        </div>
        <Card
          title="Posting cadence"
          hint="The number is posts that day; shade is that day's views, scaled per channel. Hover for the numbers. Your posts are in Posts."
        >
          <Cadence hub={hub} channels={rows.map(([id]) => id)} />
        </Card>
      </ViewBody>
    </>
  );
}
