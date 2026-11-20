import { CHANNEL_IDS, CHANNEL_NAMES, type ChannelId, type ProposalItem } from "@loud/contracts";
import { Check, Clock, Copy, Lightbulb } from "lucide-react";
import { useState } from "react";

import { Card, ViewBody } from "~/components/Card";
import { ChannelFilter, PostText } from "~/components/Filters";
import { FlagList } from "~/components/Flags";
import { Empty, PageHeader, ChannelTag } from "~/components/PageHeader";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { relative } from "~/lib/format";
import { useLoud } from "~/store";
import { patchView, useViewState } from "~/viewState";

function CopyButton({ text }: { text: string }) {
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
      aria-label="Copy opening line"
    >
      {state === "done" ? <Check /> : <Copy />}
      {state === "done" ? "Copied" : state === "failed" ? "Could not copy" : "Copy"}
    </Button>
  );
}

export function ProposalCard({ p }: { p: ProposalItem }) {
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
            <span className="text-2xs text-muted-foreground">Opening line</span>
            <CopyButton text={p.hook} />
          </div>
          <p className="text-sm">{p.hook}</p>
        </div>
      )}
      {p.outline && (
        <details className="group text-sm">
          <summary className="cursor-pointer text-muted-foreground text-xs hover:text-foreground">
            Outline
          </summary>
          <p className="mt-1.5 whitespace-pre-line">{p.outline}</p>
        </details>
      )}
      {p.why && (
        <p className="text-sm">
          <span className="font-medium">Why: </span>
          <span className="text-muted-foreground">{p.why}</span>
        </p>
      )}
      {!!p.evidence?.length && (
        <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 border-t pt-2.5 text-xs">
          <span className="text-muted-foreground">Based on</span>
          {p.evidence.map((e) => (
            <PostText key={e.url + e.label} url={e.url} text={e.label} />
          ))}
        </div>
      )}
    </article>
  );
}

export function ProposalsView() {
  const proposals = useLoud((s) => s.proposals);
  const channel = useViewState((s) => s.proposals.channel);

  if (!proposals) {
    return (
      <>
        <PageHeader title="Proposals" />
        <Empty icon={<Lightbulb />} title="No proposals yet">
          The agent writes proposals from your numbers. It is coming over from the old dashboard.
        </Empty>
      </>
    );
  }

  const items = proposals.items;
  const counts: Partial<Record<ChannelId | "all", number>> = { all: items.length };
  for (const p of items) counts[p.channel] = (counts[p.channel] ?? 0) + 1;
  const shown = items.filter((p) => !channel || p.channel === channel);
  const stop = proposals.stop ?? [];

  return (
    <>
      <PageHeader
        title="Proposals"
        description={`Written ${relative(proposals.written)}. Drafts only: you approve and post every one.`}
      />
      <ViewBody>
        {proposals.summary && (
          <Card>
            <p className="text-sm">{proposals.summary}</p>
          </Card>
        )}
        <ChannelFilter
          value={channel}
          channels={CHANNEL_IDS.filter((id) => counts[id])}
          names={CHANNEL_NAMES}
          counts={counts}
          onChange={(channel) => patchView("proposals", { channel })}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <ProposalCard key={`${p.channel}:${p.title}`} p={p} />
          ))}
        </div>
        {stop.length > 0 && (
          <Card title="Stop or do less" bodyClassName="px-0 pb-0">
            <FlagList flags={stop.map((text) => ({ level: "warn", text }))} />
          </Card>
        )}
      </ViewBody>
    </>
  );
}
