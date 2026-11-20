import {
  CHANNEL_NAMES,
  type ChannelId,
  type Keywords,
  LISTEN_KEYS,
  type ListenItem,
} from "@loud/contracts";
import { Ear, MessageCircleQuestion, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { InlineBar, ShareBar } from "~/components/Bars";
import { Card, ViewBody } from "~/components/Card";
import { type Column, DataTable, sortRows } from "~/components/DataTable";
import { ChannelFilter, FilterBar, PostText, SearchBox } from "~/components/Filters";
import { NoData } from "~/components/NoData";
import { ChannelDot, ChannelTag, PageHeader } from "~/components/PageHeader";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Textarea } from "~/components/ui/textarea";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { CHANNEL_ORDER, channelsOf, keywordRows, queriesOf, topAuthors } from "~/lib/analytics";
import { call } from "~/lib/loud";
import { compact, dayLabel, fmt, isNum, parseStamp, relative, short } from "~/lib/format";
import { cn } from "~/lib/utils";
import { useLoud } from "~/store";
import { patchView, useViewState } from "~/viewState";
import { useWork } from "~/workStore";
import { ListenNow } from "~/components/ListenNow";

/** The table shows the top rows of the current sort; the rest stay a filter away. */
const MAX_ROWS = 300;

const SOURCE: Record<ChannelId, string> = {
  threads: "Threads search",
  ig: "Instagram hashtags or words",
  fb: "Facebook video search",
  x: "X search (operators work)",
};

const langName = (l: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(l) ?? l;
  } catch {
    return l;
  }
};

function KeywordEditor({
  channels,
  onClose,
}: {
  channels: ReadonlyArray<ChannelId>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");

  useEffect(() => {
    call("keywords.get", {}).then(
      (kw) => setDraft(Object.fromEntries(Object.entries(kw).map(([k, v]) => [k, v.join("\n")]))),
      (e: unknown) => setState(e instanceof Error ? e.message : String(e)),
    );
  }, []);

  const save = async () => {
    if (!draft) return;
    setState("saving");
    try {
      const current = await call("keywords.get", {});
      const next: Keywords = {
        ...current,
        ...Object.fromEntries(
          Object.entries(draft).map(([k, v]) => [
            k,
            v
              .split("\n")
              .map((x) => x.trim())
              .filter(Boolean),
          ]),
        ),
      };
      await call("keywords.set", next);
      void useWork.getState().loadKeywords();
      setState("saved");
    } catch (e) {
      setState(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card
      title="Listening keywords"
      hint="One per line. They apply from the next search."
      actions={
        <Button size="xs" variant="ghost-muted" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {channels.map((id) => (
          <label key={id} className="flex flex-col gap-1.5 text-xs">
            <span className="flex items-center gap-2">
              <ChannelTag id={id} />
              <span className="text-muted-foreground">{SOURCE[id]}</span>
            </span>
            <Textarea
              rows={6}
              spellCheck={false}
              disabled={!draft}
              value={draft?.[LISTEN_KEYS[id]] ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                setDraft((d) => ({ ...d, [LISTEN_KEYS[id]]: value }));
                setState("idle");
              }}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" disabled={!draft || state === "saving"} onClick={() => void save()}>
          Save
        </Button>
        <span className="text-muted-foreground text-xs">
          {state === "saved" ? "Saved." : state === "idle" || state === "saving" ? "" : state}
        </span>
      </div>
    </Card>
  );
}

/** Built outside the view: cells are render functions, not components. */
function listenColumns(): ReadonlyArray<Column<ListenItem>> {
  const num = (
    key: "views" | "likes" | "replies" | "reposts" | "shares",
    label: string,
  ): Column<ListenItem> => ({
    key,
    label,
    numeric: true,
    sortValue: (i) => i[key],
    cell: (i) => <span title={fmt(i[key])}>{compact(i[key])}</span>,
  });
  return [
    {
      key: "channel",
      label: "Channel",
      sortValue: (i) => i.channel,
      cell: (i) => (
        <div className="flex flex-col items-start gap-1">
          <ChannelTag id={i.channel} label={i.channel === "fb" ? "FB video" : undefined} />
          {i.question && (
            <Badge variant="info" size="sm">
              asks
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "query",
      label: "Keyword",
      sortValue: (i) => i.query,
      cell: (i) => (
        <div className="flex max-w-40 flex-wrap gap-1">
          {queriesOf(i).map((q) => (
            <Badge key={q} variant="secondary" size="sm">
              {q}
            </Badge>
          ))}
        </div>
      ),
    },
    { key: "author", label: "Author", sortValue: (i) => i.author, cell: (i) => i.author ?? "–" },
    {
      key: "posted",
      label: "Date",
      sortValue: (i) => i.posted,
      cell: (i) => (
        <span className="text-muted-foreground tabular-nums" title={i.date_text ?? i.posted}>
          {i.posted ? dayLabel(parseStamp(i.posted)) : "–"}
        </span>
      ),
    },
    {
      key: "text",
      label: "Post",
      className: "w-full min-w-64 whitespace-normal",
      cell: (i) => (
        <PostText url={i.url} text={short(i.text, 240) || "(no text)"} className="line-clamp-2" />
      ),
    },
    num("views", "Views"),
    num("likes", "Likes"),
    num("replies", "Replies"),
    num("reposts", "Reposts"),
    num("shares", "Shares"),
    {
      key: "score",
      label: "Score",
      numeric: true,
      sortValue: (i) => i.score,
      cell: (i) => compact(i.score === undefined ? null : Math.round(i.score)),
    },
  ];
}
const LISTEN_COLUMNS = listenColumns();

export function ListeningView() {
  const hub = useLoud((s) => s.hub);
  const f = useViewState((s) => s.listening);
  const [editing, setEditing] = useState(false);
  const items = hub?.listen.items ?? [];

  const keywords = useMemo(() => keywordRows(items), [items]);
  const authors = useMemo(() => topAuthors(items), [items]);
  const langs = useMemo(
    () => [...new Set(items.map((i) => i.lang).filter((l): l is string => !!l))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const t = f.q.trim().toLowerCase();
    return items.filter(
      (i) =>
        (!f.channel || i.channel === f.channel) &&
        (!f.keyword || queriesOf(i).includes(f.keyword)) &&
        (!f.questions || i.question) &&
        (!f.lang || i.lang === f.lang) &&
        (!t ||
          (i.text ?? "").toLowerCase().includes(t) ||
          (i.author ?? "").toLowerCase().includes(t)),
    );
  }, [items, f.channel, f.keyword, f.questions, f.lang, f.q]);

  const columns = useMemo<ReadonlyArray<Column<ListenItem>>>(() => {
    const all = LISTEN_COLUMNS;
    return all.filter(
      (c) =>
        !c.numeric ||
        c.key === "score" ||
        filtered.some((i) => isNum(i[c.key as keyof ListenItem])),
    );
  }, [filtered]);

  if (!hub) return <NoData title="Listening" icon={Ear} />;

  const channels = channelsOf(hub);
  const sorted = sortRows(filtered, columns, f.sort);
  const rows = sorted.slice(0, MAX_ROWS);
  const maxViews = Math.max(1, ...keywords.map((k) => k.views ?? 0));
  const setKeyword = (keyword: string | null) => patchView("listening", { keyword });

  return (
    <>
      <PageHeader
        title="Listening"
        description={`Read ${relative(hub.listen.collected)}. Other people's posts, for reference only. Threads shows no view counts on them.`}
      >
        <Button size="sm" variant="outline" onClick={() => setEditing((e) => !e)}>
          <Pencil />
          Edit keywords
        </Button>
        <ListenNow />
      </PageHeader>
      <ViewBody wide>
        {editing && <KeywordEditor channels={channels} onClose={() => setEditing(false)} />}
        {items.length === 0 ? (
          <Card>
            <div className="py-6 text-center text-muted-foreground text-sm">
              No listening results yet. Add keywords, then Search now.
            </div>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 @5xl:grid-cols-12">
              <Card
                className="@5xl:col-span-7"
                title="Keywords"
                hint="By total views (Threads has none, so it ranks low). Click a row to filter the table."
              >
                <div className="max-h-90 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-2 text-left font-medium">Keyword</th>
                        <th className="px-2 py-2 text-left font-medium">Channels</th>
                        <th className="px-2 py-2 text-right font-medium">Posts</th>
                        <th className="px-2 py-2 text-left font-medium">Total views</th>
                        <th className="px-2 py-2 text-right font-medium">Med. likes</th>
                        <th
                          className="py-2 pl-2 text-right font-medium"
                          title="Posts asking a question: a chance to help"
                        >
                          Questions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {keywords.map((k) => (
                        <tr
                          key={k.query}
                          onClick={() => setKeyword(f.keyword === k.query ? null : k.query)}
                          className={cn(
                            "cursor-pointer hover:bg-muted/50",
                            f.keyword === k.query && "bg-muted",
                          )}
                        >
                          <td className="py-2 pr-2">
                            <Badge variant="secondary" size="sm">
                              {k.query}
                            </Badge>
                          </td>
                          <td className="px-2 py-2">
                            <ShareBar
                              parts={CHANNEL_ORDER.map((id) => ({
                                id,
                                label: CHANNEL_NAMES[id],
                                value: k.byChannel[id] ?? 0,
                              }))}
                            />
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{k.posts}</td>
                          <td className="min-w-36 px-2 py-2">
                            <span className="flex items-center gap-2">
                              {k.views !== null && <InlineBar value={k.views} max={maxViews} />}
                              <span className="w-12 text-right tabular-nums">
                                {compact(k.views)}
                              </span>
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {compact(k.medianLikes === null ? null : Math.round(k.medianLikes))}
                          </td>
                          <td className="py-2 pl-2 text-right tabular-nums">
                            {k.questions || "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card
                className="@5xl:col-span-5"
                title="Top authors"
                hint="By the engagement score of the posts found."
              >
                <div className="max-h-90 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b text-muted-foreground">
                        <th className="w-6 py-2" />
                        <th className="py-2 text-left font-medium">Author</th>
                        <th className="px-2 py-2 text-right font-medium">Posts</th>
                        <th className="px-2 py-2 text-right font-medium">Views</th>
                        <th className="py-2 pl-2 text-right font-medium">Likes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {authors.map((a, i) => (
                        <tr key={`${a.channel}|${a.author}`}>
                          <td className="py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                          <td className="py-2">
                            <span className="flex items-center gap-2">
                              <ChannelDot id={a.channel} />
                              <span className="font-medium">{a.author}</span>
                            </span>
                            <div className="text-2xs text-muted-foreground">
                              {a.queries.slice(0, 3).join(", ")}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{a.posts}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {a.views ? compact(a.views) : "–"}
                          </td>
                          <td className="py-2 pl-2 text-right tabular-nums">{compact(a.likes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            <ToggleGroup
              variant="pill"
              aria-label="Keyword"
              className="flex-wrap"
              value={[f.keyword ?? ""]}
              onValueChange={(v) => setKeyword(v[0] ? v[0] : null)}
            >
              <Toggle value="" size="xs">
                All keywords{" "}
                <span className="text-muted-foreground tabular-nums">{items.length}</span>
              </Toggle>
              {keywords.map((k) => (
                <Toggle key={k.query} value={k.query} size="xs">
                  {k.query} <span className="text-muted-foreground tabular-nums">{k.posts}</span>
                </Toggle>
              ))}
            </ToggleGroup>

            <FilterBar>
              <ChannelFilter
                value={f.channel}
                channels={channels}
                names={{ ...CHANNEL_NAMES, fb: "FB video" }}
                onChange={(channel) => patchView("listening", { channel })}
              />
              {langs.length > 1 && (
                <ToggleGroup
                  aria-label="Language"
                  value={[f.lang ?? ""]}
                  onValueChange={(v) =>
                    v[0] !== undefined && patchView("listening", { lang: v[0] || null })
                  }
                >
                  <Toggle value="">All languages</Toggle>
                  {langs.map((l) => (
                    <Toggle key={l} value={l}>
                      {langName(l)}
                    </Toggle>
                  ))}
                </ToggleGroup>
              )}
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={f.questions}
                  onCheckedChange={(questions) => patchView("listening", { questions })}
                />
                <MessageCircleQuestion className="size-3.5 text-muted-foreground" aria-hidden />
                Questions only
              </label>
              <SearchBox
                value={f.q}
                onChange={(q) => patchView("listening", { q })}
                placeholder="Search posts or authors"
              />
              <span className="ml-auto text-muted-foreground text-xs tabular-nums">
                {sorted.length > rows.length
                  ? `${rows.length} of ${fmt(sorted.length)} posts`
                  : `${fmt(sorted.length)} posts`}
              </span>
            </FilterBar>

            <div className="rounded-xl border bg-card shadow-xs/5">
              {rows.length ? (
                <DataTable
                  rows={rows}
                  columns={columns}
                  sort={f.sort}
                  onSort={(sort) => patchView("listening", { sort })}
                  rowKey={(i) => i.url ?? `${i.channel}:${i.author ?? ""}:${i.text ?? ""}`}
                />
              ) : (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  Nothing matches these filters.
                </div>
              )}
            </div>
          </>
        )}
      </ViewBody>
    </>
  );
}
