import {
  CHANNEL_NAMES,
  type ChannelId,
  type ChannelSummary,
  type HistoryDay,
  type Hub,
} from "@loud/contracts";
import { ArrowDown, ArrowUp, LayoutDashboard, Plug, Table2, ChartColumn } from "lucide-react";
import type * as React from "react";
import { useMemo, useState } from "react";

import { ShareBar } from "~/components/Bars";
import { Card, Quiet, ViewBody } from "~/components/Card";
import { TipRow, useChartTip, useWidth } from "~/components/ChartTip";
import { PostText } from "~/components/Filters";
import { byLevel, FlagList } from "~/components/Flags";
import { ChannelDot, ChannelTag, Empty, PageHeader } from "~/components/PageHeader";
import { Button } from "~/components/ui/button";
import { CheckboxMark } from "~/components/ui/checkbox";
import {
  builtAt,
  CHANNEL_ORDER,
  type DayViews,
  engPer1k,
  isOwn,
  median,
  niceMax,
  postsBetween,
  rising,
  settled,
  sumOf,
  viewsByPublishDay,
} from "~/lib/analytics";
import {
  axisTick,
  compact,
  dayLabel,
  dec,
  fmt,
  hm,
  monthDay,
  parseStamp,
  relative,
  short,
  stampLabel,
  until,
  ymd,
} from "~/lib/format";
import { cn } from "~/lib/utils";
import { useLoud } from "~/store";
import { ProposalCard } from "~/views/ProposalsView";

// ---- KPI tiles ----

function Delta({
  cur,
  prev,
  unit = "",
}: {
  cur: number | null;
  prev: number | null;
  unit?: string;
}) {
  if (cur === null || prev === null || !prev) {
    return <div className="text-2xs text-muted-foreground">No previous week to compare</div>;
  }
  const change = (cur - prev) / prev;
  const up = change >= 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <div className="flex items-center gap-1 text-2xs">
      <span
        className={cn(
          "inline-flex items-center font-medium tabular-nums",
          up ? "text-success-foreground" : "text-destructive-foreground",
        )}
      >
        <Arrow className="size-3" aria-label={up ? "up" : "down"} />
        {dec(Math.abs(change) * 100, 0)}%
      </span>
      <span className="text-muted-foreground">
        vs previous 7 days ({Number.isInteger(prev) ? compact(prev) : dec(prev)}
        {unit})
      </span>
    </div>
  );
}

function Kpi({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-4 shadow-xs/5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-semibold text-2xl tracking-tight">{value}</div>
      {children}
    </section>
  );
}

/** Followers summed over the channels on the last snapshot at least 7 days old; null without one. */
export function followersWeekAgo(history: ReadonlyArray<HistoryDay>, now: Date): number | null {
  const target = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
  const day = history.findLast((h) => h.day <= target);
  if (!day || day.day === ymd(now)) return null;
  return Object.values(day.channels).reduce((t, c) => t + (c?.followers ?? 0), 0);
}

function Kpis({ hub, history }: { hub: Hub; history: ReadonlyArray<HistoryDay> }) {
  const now = builtAt(hub);
  const cur = postsBetween(hub.posts, now, 0, 7);
  const prev = postsBetween(hub.posts, now, 7, 14);
  const by = new Map(hub.channels.map((c) => [c.id, c]));
  const share = (key: "followers" | "views_7d" | "posts_7d" | "scheduled") => (
    <div className="mt-auto pt-1">
      <ShareBar
        parts={CHANNEL_ORDER.filter((id) => by.has(id)).map((id) => ({
          id,
          label: CHANNEL_NAMES[id],
          value: by.get(id)?.[key] ?? 0,
        }))}
      />
    </div>
  );
  const followers = hub.channels.reduce((t, c) => t + (c.followers ?? 0), 0);
  const before = followersWeekAgo(history, now);
  const queued = hub.channels.reduce((t, c) => t + c.scheduled, 0);
  const emptyQueue = hub.channels.filter((c) => c.scheduled_known && !c.scheduled);

  return (
    <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-3 @6xl:grid-cols-6">
      <Kpi label="Followers" value={fmt(followers)}>
        {before !== null ? (
          <Delta cur={followers} prev={before} />
        ) : (
          <div className="text-2xs text-muted-foreground">No snapshot from a week ago yet</div>
        )}
        {share("followers")}
      </Kpi>
      <Kpi label="Views, 7 days" value={fmt(sumOf(cur, "views"))}>
        <Delta cur={sumOf(cur, "views")} prev={sumOf(prev, "views")} />
        {share("views_7d")}
      </Kpi>
      <Kpi label="Posts, 7 days" value={fmt(cur.length)}>
        <Delta cur={cur.length} prev={prev.length} />
        {share("posts_7d")}
      </Kpi>
      <Kpi label="Engagement per 1k views" value={dec(engPer1k(cur))}>
        <Delta cur={engPer1k(cur)} prev={engPer1k(prev)} />
        <div className="mt-auto text-2xs text-muted-foreground">
          Likes, replies, reposts, shares and saves
        </div>
      </Kpi>
      <Kpi label="Follows from posts" value={fmt(sumOf(cur, "follows"))}>
        <Delta cur={sumOf(cur, "follows")} prev={sumOf(prev, "follows")} />
        <div className="mt-auto text-2xs text-muted-foreground">Where the platform counts them</div>
      </Kpi>
      <Kpi label="Scheduled" value={fmt(queued)}>
        <div className="text-2xs text-muted-foreground">
          {emptyQueue.length
            ? `Nothing queued: ${emptyQueue.map((c) => CHANNEL_NAMES[c.id]).join(", ")}`
            : "Every readable queue has posts"}
        </div>
        {share("scheduled")}
      </Kpi>
    </div>
  );
}

// ---- Views by publish day: stacked columns ----

const PLOT_H = 240;
const BAR_MAX = 24;

function ViewsByDay({
  days,
  channels,
}: {
  days: ReadonlyArray<DayViews>;
  channels: ReadonlyArray<ChannelId>;
}) {
  const [off, setOff] = useState<ReadonlySet<ChannelId>>(new Set());
  const [table, setTable] = useState(false);
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useChartTip();
  const on = channels.filter((id) => !off.has(id));
  const total = (d: DayViews) => on.reduce((t, id) => t + (d.views[id] ?? 0), 0);
  const toggle = (id: ChannelId) =>
    setOff((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const W = Math.max(300, width);
  const L = 44;
  const R = 8;
  const T = 20;
  const B = 24;
  const ih = PLOT_H - T - B;
  const cw = (W - L - R) / days.length;
  const bw = Math.min(BAR_MAX, cw * 0.62);
  const max = niceMax(Math.max(1, ...days.map(total)));
  const y = (v: number) => T + ih - (v / max) * ih;
  const every = cw < 34 ? 2 : 1;
  const peak = days.reduce((best, d, i) => (total(d) > total(days[best]!) ? i : best), 0);

  return (
    <Card
      title="Views by publish day"
      hint="14 days. Each column is today's total views of the posts published that day; replies left out."
      actions={
        <Button size="xs" variant="ghost-muted" onClick={() => setTable((t) => !t)}>
          {table ? <ChartColumn /> : <Table2 />}
          {table ? "Show chart" : "Show table"}
        </Button>
      }
    >
      <div className="mb-3 flex flex-wrap gap-3" role="group" aria-label="Channels in the chart">
        {channels.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={!off.has(id)}
            onClick={() => toggle(id)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 text-xs",
              off.has(id) && "text-muted-foreground",
            )}
          >
            <CheckboxMark checked={!off.has(id)} />
            <span
              aria-hidden
              className="size-2.5 rounded-xs"
              style={{ background: `var(--ch-${id})` }}
            />
            {CHANNEL_NAMES[id]}
          </button>
        ))}
      </div>
      {table ? (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-muted-foreground">
                <th className="py-2 text-left font-medium">Day</th>
                {on.map((id) => (
                  <th key={id} className="px-2 py-2 text-right font-medium">
                    {CHANNEL_NAMES[id]}
                  </th>
                ))}
                <th className="py-2 pl-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {days.toReversed().map((d) => (
                <tr key={d.key}>
                  <td className="py-1.5 text-muted-foreground">{dayLabel(d.date)}</td>
                  {on.map((id) => (
                    <td key={id} className="px-2 py-1.5 text-right tabular-nums">
                      {d.views[id] ? fmt(d.views[id]) : "–"}
                    </td>
                  ))}
                  <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">
                    {fmt(total(d))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="w-full">
          {width > 0 && (
            <svg
              width={W}
              height={PLOT_H}
              role="img"
              aria-label="Views by publish day, 14 days"
              className="block"
            >
              {[0, 1, 2, 3, 4].map((k) => {
                const v = (max / 4) * k;
                return (
                  <g key={k}>
                    <line
                      x1={L}
                      x2={W - R}
                      y1={y(v)}
                      y2={y(v)}
                      className={k ? "stroke-border" : "stroke-input"}
                    />
                    <text
                      x={L - 8}
                      y={y(v) + 3.5}
                      textAnchor="end"
                      className="fill-muted-foreground text-2xs tabular-nums"
                    >
                      {axisTick(v, max)}
                    </text>
                  </g>
                );
              })}
              {days.map((d, i) => {
                const cx = L + cw * i + cw / 2;
                const x0 = cx - bw / 2;
                const segs = on.filter((id) => (d.views[id] ?? 0) > 0);
                let base = T + ih;
                const shapes = segs.map((id, j) => {
                  const h = ((d.views[id] ?? 0) / max) * ih;
                  const top = base - h;
                  // 2px of surface between stacked segments; only the top segment gets the rounded data end.
                  const gap = j ? 2 : 0;
                  const hh = h - gap;
                  const last = j === segs.length - 1;
                  const r = last ? Math.min(4, hh, bw / 2) : 0;
                  const bottom = base - gap;
                  base = top;
                  if (hh < 0.6) return null;
                  return r > 0 ? (
                    <path
                      key={id}
                      fill={`var(--ch-${id})`}
                      d={`M${x0},${bottom} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${bottom} Z`}
                    />
                  ) : (
                    <rect key={id} x={x0} y={top} width={bw} height={hh} fill={`var(--ch-${id})`} />
                  );
                });
                const content = (
                  <>
                    <div className="mb-1 font-medium">{dayLabel(d.date)}</div>
                    {on.map((id) => (
                      <TipRow
                        key={id}
                        color={`var(--ch-${id})`}
                        label={`${CHANNEL_NAMES[id]} · ${d.posts[id] ?? 0} posts`}
                        value={d.views[id] ? fmt(d.views[id]) : "–"}
                      />
                    ))}
                    <div className="mt-1 border-t pt-1">
                      <TipRow label="Total" value={fmt(total(d))} />
                    </div>
                  </>
                );
                return (
                  <g key={d.key}>
                    {shapes}
                    {i % every === (days.length - 1) % every && (
                      <text
                        x={cx}
                        y={PLOT_H - 6}
                        textAnchor="middle"
                        className="fill-muted-foreground text-2xs tabular-nums"
                      >
                        {monthDay(d.date)}
                      </text>
                    )}
                    {i === peak && total(d) > 0 && (
                      <text
                        x={cx}
                        y={y(total(d)) - 6}
                        textAnchor="middle"
                        className="fill-foreground font-medium text-2xs tabular-nums"
                      >
                        {compact(total(d))}
                      </text>
                    )}
                    <rect
                      x={L + cw * i}
                      y={T}
                      width={cw}
                      height={ih}
                      fill="transparent"
                      className="hover:fill-foreground/4"
                      onPointerMove={(e) => tip.show(e, content)}
                      onPointerLeave={tip.hide}
                    />
                  </g>
                );
              })}
            </svg>
          )}
          {tip.node}
        </div>
      )}
    </Card>
  );
}

// ---- Rising now ----

function RisingNow({ hub }: { hub: Hub }) {
  const list = rising(hub.posts);
  const top = Math.max(1, ...list.map((r) => r.ratio));
  return (
    <Card
      title="Rising now"
      hint="Posts under 3 days old against the median of the channel's settled posts."
    >
      {list.length ? (
        <ul className="flex flex-col divide-y">
          {list.map(({ post: p, ratio, median: m }) => (
            <li
              key={`${p.channel}:${p.id}`}
              className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <ChannelDot id={p.channel} />
                  {CHANNEL_NAMES[p.channel]} · {dec(p.age_h, 0)} h
                </span>
                <span className="tabular-nums">
                  <span className="font-semibold text-foreground">{fmt(p.views)}</span> views ·{" "}
                  {dec((p.views ?? 0) / Math.max(1, p.age_h ?? 1), 0)}/h
                </span>
              </div>
              <PostText
                url={p.url}
                text={short(p.text, 110) || "(no text)"}
                className="line-clamp-2 text-xs"
              />
              <div className="flex items-center gap-2">
                <span className="h-1.5 flex-1 rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (100 * ratio) / top)}%`,
                      background: `var(--ch-${p.channel})`,
                    }}
                  />
                </span>
                <span className="text-2xs tabular-nums">
                  <span className="font-semibold">×{dec(ratio)}</span>{" "}
                  <span className="text-muted-foreground">of {compact(Math.round(m))}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Quiet>No new posts in the last 3 days.</Quiet>
      )}
    </Card>
  );
}

// ---- Channel cards ----

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <div className="font-semibold text-base tabular-nums tracking-tight">{value}</div>
      <div className="text-2xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ChannelCard({ c }: { c: ChannelSummary }) {
  const best = c.best_7d;
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs/5">
      <div className="flex items-center justify-between gap-2">
        <ChannelTag id={c.id} />
        <span className="text-2xs text-muted-foreground" title={c.collected}>
          {c.collected ? `Read ${relative(c.collected)}` : "Not read yet"}
        </span>
      </div>
      <div className="font-semibold text-2xl tracking-tight">
        {fmt(c.followers)}{" "}
        <span className="font-normal text-muted-foreground text-xs">followers</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="views 7d"
          value={compact(c.views_7d)}
          title={`${fmt(c.views_7d)} views in 7 days`}
        />
        <Stat label="posts 7d" value={fmt(c.posts_7d)} />
        <Stat
          label="median"
          value={compact(c.median_views_14d)}
          title="Median views of posts 1–14 days old"
        />
      </div>
      {best ? (
        <div className="rounded-lg bg-muted px-3 py-2 text-xs">
          <div className="mb-0.5 text-2xs text-muted-foreground">
            Best in 7 days ·{" "}
            <span className="font-semibold text-foreground">{fmt(best.views)}</span> views
            {c.median_views_14d && best.views
              ? ` · ×${dec(best.views / c.median_views_14d)} median`
              : ""}
          </div>
          <PostText
            url={best.url}
            text={short(best.text, 140) || "(no text)"}
            className="line-clamp-2"
          />
        </div>
      ) : (
        <div className="rounded-lg bg-muted px-3 py-2 text-muted-foreground text-xs">
          No posts in the last 7 days.
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 border-t pt-2.5 text-2xs text-muted-foreground">
        <span>Last post {c.last_post ? relative(c.last_post) : "–"}</span>
        <span>{c.scheduled_known ? `${c.scheduled} scheduled` : "Queue not read"}</span>
      </div>
    </section>
  );
}

// ---- Top posts, up next ----

function TopPosts({ hub }: { hub: Hub }) {
  const now = builtAt(hub);
  const top = [...postsBetween(hub.posts, now, 0, 7)]
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 8);
  const medians = new Map(
    CHANNEL_ORDER.map((id) => [id, median(settled(hub.posts, id).map((p) => p.views))] as const),
  );
  const go = useLoud((s) => s.go);
  return (
    <Card
      title="Top posts, 7 days"
      hint="×Med is how many times the channel's median views."
      actions={
        <Button size="xs" variant="ghost-muted" onClick={() => go("posts")}>
          All posts
        </Button>
      }
    >
      {top.length ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="w-5 py-2" />
              <th className="py-2 text-left font-medium">Post</th>
              <th className="px-2 py-2 text-right font-medium">Views</th>
              <th className="px-2 py-2 text-right font-medium">×Med</th>
              <th className="py-2 pl-2 text-right font-medium">Eng/1k</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {top.map((p, i) => {
              const m = medians.get(p.channel);
              return (
                <tr key={`${p.channel}:${p.id}`}>
                  <td className="py-2 align-top text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="py-2">
                    <PostText
                      url={p.url}
                      text={short(p.text, 120) || "(no text)"}
                      className="line-clamp-1"
                    />
                    <div className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
                      <ChannelDot id={p.channel} />
                      {CHANNEL_NAMES[p.channel]} · {stampLabel(p.posted)}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">
                    {fmt(p.views)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {m ? `×${dec((p.views ?? 0) / m)}` : "–"}
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums">{dec(engPer1k([p]))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <Quiet>No posts in the last 7 days.</Quiet>
      )}
    </Card>
  );
}

function UpNext({ hub }: { hub: Hub }) {
  const now = builtAt(hub);
  const go = useLoud((s) => s.go);
  const next = hub.scheduled
    .filter((s) => (parseStamp(s.when)?.getTime() ?? 0) >= now.getTime())
    .sort((a, b) => (a.when > b.when ? 1 : -1))
    .slice(0, 5);
  return (
    <Card
      title="Up next"
      actions={
        <Button size="xs" variant="ghost-muted" onClick={() => go("schedule")}>
          Schedule
        </Button>
      }
    >
      {next.length ? (
        <ul className="flex flex-col divide-y">
          {next.map((s) => (
            <li
              key={`${s.channel}:${s.when}:${s.text ?? ""}`}
              className="flex gap-3 py-2 first:pt-0 last:pb-0"
            >
              <div className="w-16 shrink-0">
                <div className="font-semibold text-sm tabular-nums">{hm(s.when)}</div>
                <div className="text-2xs text-muted-foreground">{dayLabel(parseStamp(s.when))}</div>
              </div>
              <div className="min-w-0 text-xs">
                <div className="mb-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <ChannelDot id={s.channel} />
                  {CHANNEL_NAMES[s.channel]} · {until(s.when, now)}
                </div>
                <div className="line-clamp-2">{short(s.text, 160)}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Quiet>Nothing scheduled.</Quiet>
      )}
    </Card>
  );
}

// ---- The view ----

export function OverviewView() {
  const hub = useLoud((s) => s.hub);
  const history = useLoud((s) => s.history);
  const proposals = useLoud((s) => s.proposals);
  const go = useLoud((s) => s.go);
  const connected = useLoud((s) => s.platforms.some((p) => p.status === "connected"));
  const days = useMemo(() => (hub ? viewsByPublishDay(hub.posts, builtAt(hub)) : []), [hub]);

  if (!hub) {
    return (
      <>
        <PageHeader title="Overview" />
        <Empty
          icon={<LayoutDashboard />}
          title={connected ? "No data yet" : "Connect a platform to start"}
          action={
            !connected && (
              <Button size="sm" onClick={() => go("connections")}>
                <Plug />
                Open Connections
              </Button>
            )
          }
        >
          {connected
            ? "Your accounts are connected. Numbers appear here after the first collection."
            : "Log in to Threads, Instagram, Facebook or X once. Loud keeps the session and pulls your numbers."}
        </Empty>
      </>
    );
  }

  const channels = CHANNEL_ORDER.filter((id) => hub.channels.some((c) => c.id === id));
  const ordered = channels.map((id) => hub.channels.find((c) => c.id === id)!);

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Built ${relative(hub.built)} · ${hub.channels.length} channels since ${hub.since ?? "the start date"}, ${hub.timezone ?? "local"} time`}
      />
      <ViewBody wide>
        {proposals?.summary && <p className="text-muted-foreground text-sm">{proposals.summary}</p>}
        <Kpis hub={hub} history={history} />
        <div className="grid grid-cols-1 gap-4 @5xl:grid-cols-3">
          <div className="@5xl:col-span-2">
            <ViewsByDay days={days} channels={channels} />
          </div>
          <RisingNow hub={hub} />
        </div>
        <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2 @6xl:grid-cols-4">
          {ordered.map((c) => (
            <ChannelCard key={c.id} c={c} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 @5xl:grid-cols-4">
          <div className="@5xl:col-span-2">
            <TopPosts hub={hub} />
          </div>
          <UpNext hub={hub} />
          <Card
            title="Worth a look"
            bodyClassName="px-0 pb-0"
            actions={
              <Button size="xs" variant="ghost-muted" onClick={() => go("audit")}>
                Audit
              </Button>
            }
          >
            {hub.flags.length ? (
              <FlagList flags={byLevel(hub.flags).slice(0, 4)} />
            ) : (
              <Quiet>Nothing stands out.</Quiet>
            )}
          </Card>
        </div>
        {proposals && proposals.items.length > 0 && (
          <>
            <div className="flex items-center justify-between pt-2">
              <h2 className="font-medium text-sm">Top proposals</h2>
              <Button size="xs" variant="ghost-muted" onClick={() => go("proposals")}>
                All proposals
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
              {proposals.items.slice(0, 3).map((p) => (
                <ProposalCard key={`${p.channel}:${p.title}`} p={p} />
              ))}
            </div>
          </>
        )}
        {!hub.posts.some(isOwn) && <Quiet>No posts read yet.</Quiet>}
      </ViewBody>
    </>
  );
}
