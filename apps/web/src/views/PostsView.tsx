import { CHANNEL_NAMES, type Post } from "@loud/contracts";
import { Rows3 } from "lucide-react";
import { useMemo } from "react";

import { ViewBody } from "~/components/Card";
import { type Column, DataTable, sortRows } from "~/components/DataTable";
import { ChannelFilter, FilterBar, PostText, SearchBox, Segmented } from "~/components/Filters";
import { NoData } from "~/components/NoData";
import { ChannelTag, PageHeader } from "~/components/PageHeader";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { channelsOf } from "~/lib/analytics";
import { dec, fmt, isNum, short, stampLabel } from "~/lib/format";
import { useLoud } from "~/store";
import { patchView, useViewState } from "~/viewState";

const COUNTS = ["likes", "replies", "reposts", "shares", "saves", "follows"] as const;
const LABEL: Record<(typeof COUNTS)[number], string> = {
  likes: "Likes",
  replies: "Replies",
  reposts: "Reposts",
  shares: "Shares",
  saves: "Saves",
  follows: "Follows",
};

/** Built outside the view: cells are render functions, not components. */
function postColumns(medians: Readonly<Record<string, number | null>>): Array<Column<Post>> {
  return [
    {
      key: "posted",
      label: "Posted",
      sortValue: (p) => p.posted,
      cell: (p) => (
        <span className="text-muted-foreground tabular-nums">{stampLabel(p.posted)}</span>
      ),
    },
    {
      key: "channel",
      label: "Channel",
      sortValue: (p) => p.channel,
      cell: (p) => (
        <div className="flex flex-col items-start gap-1">
          <ChannelTag id={p.channel} />
          {p.kind === "reply" && (
            <Badge variant="outline" size="sm" className="text-muted-foreground">
              reply
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "text",
      label: "Post",
      className: "w-full min-w-64 whitespace-normal",
      cell: (p) => (
        <PostText url={p.url} text={short(p.text, 220) || "(no text)"} className="line-clamp-2" />
      ),
    },
    {
      key: "views",
      label: "Views",
      numeric: true,
      sortValue: (p) => p.views,
      cell: (p) => {
        const m = medians[p.channel];
        const x = m && isNum(p.views) && p.kind !== "reply" ? p.views / m : 0;
        return (
          <span className="inline-flex items-center gap-1.5">
            {x >= 3 && (
              <Badge variant="success" size="sm" title={`${dec(x)}× the channel median`}>
                ×{Math.floor(x)}
              </Badge>
            )}
            <span className="font-semibold">{fmt(p.views)}</span>
          </span>
        );
      },
    },
    ...COUNTS.map<Column<Post>>((k) => ({
      key: k,
      label: LABEL[k],
      numeric: true,
      sortValue: (p) => p[k],
      cell: (p) => fmt(p[k]),
    })),
    {
      key: "eng",
      label: "Eng. %",
      numeric: true,
      sortValue: (p) => p.eng,
      cell: (p) => (isNum(p.eng) ? `${dec(p.eng)}%` : "–"),
    },
  ];
}

export function PostsView() {
  const hub = useLoud((s) => s.hub);
  const f = useViewState((s) => s.posts);

  const medians = useMemo(
    () => Object.fromEntries((hub?.channels ?? []).map((c) => [c.id, c.median_views_14d])),
    [hub],
  );

  const rows = useMemo(() => {
    if (!hub) return [];
    const q = f.q.trim().toLowerCase();
    const maxAge = f.days === "all" ? Infinity : Number(f.days) * 24;
    return hub.posts.filter(
      (p) =>
        (!f.channel || p.channel === f.channel) &&
        (f.replies || p.kind !== "reply") &&
        (p.age_h == null || p.age_h <= maxAge) &&
        (!q || (p.text ?? "").toLowerCase().includes(q)),
    );
  }, [hub, f.channel, f.days, f.replies, f.q]);

  const columns = useMemo<ReadonlyArray<Column<Post>>>(() => {
    const all = postColumns(medians);
    // A count no platform reports for these rows is a column of dashes: leave it out.
    return all.filter(
      (c) => !c.numeric || c.key === "views" || rows.some((p) => isNum(p[c.key as keyof Post])),
    );
  }, [rows, medians]);

  if (!hub) return <NoData title="Posts" icon={Rows3} />;

  const sorted = sortRows(rows, columns, f.sort);
  const views = rows.reduce((t, p) => t + (p.views ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Posts"
        description={`Since ${hub.since ?? "the start date"}, ${hub.timezone ?? "local"} time. ×3 beat the channel's median views three times or more.`}
      />
      <ViewBody wide>
        <FilterBar>
          <ChannelFilter
            value={f.channel}
            channels={channelsOf(hub)}
            names={CHANNEL_NAMES}
            onChange={(channel) => patchView("posts", { channel })}
          />
          <Segmented
            label="Age"
            value={f.days}
            onChange={(days) => patchView("posts", { days })}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "all", label: "All" },
            ]}
          />
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Checkbox
              checked={f.replies}
              onCheckedChange={(replies) => patchView("posts", { replies })}
            />
            Include replies
          </label>
          <SearchBox
            value={f.q}
            onChange={(q) => patchView("posts", { q })}
            placeholder="Search posts"
          />
          <span className="ml-auto text-muted-foreground text-xs tabular-nums">
            {fmt(rows.length)} posts · {fmt(views)} views
          </span>
        </FilterBar>
        <div className="rounded-xl border bg-card shadow-xs/5">
          {sorted.length ? (
            <DataTable
              rows={sorted}
              columns={columns}
              sort={f.sort}
              onSort={(sort) => patchView("posts", { sort })}
              rowKey={(p) => `${p.channel}:${p.id}`}
            />
          ) : (
            <div className="py-10 text-center text-muted-foreground text-sm">
              Nothing matches these filters.
            </div>
          )}
        </div>
      </ViewBody>
    </>
  );
}
