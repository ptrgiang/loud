import { CHANNEL_IDS, CHANNEL_NAMES, type ChannelId, LISTEN_KEYS } from "@loud/contracts";
import { Ear, Loader, Pencil, Search, Square } from "lucide-react";
import { useEffect } from "react";

import { StepIcon } from "~/components/StepIcon";
import { Button } from "~/components/ui/button";
import { useLoud } from "~/store";
import { useWork } from "~/workStore";

const DEMO_BLOCK = "The demo data folder is never collected into";

/**
 * Where a listening run would search: the same rule as the collector (connected, included in runs, has keywords),
 * minus paused platforms, which would only stop at the limiter.
 */
function useListenPlan() {
  const keywords = useWork((s) => s.keywords);
  const load = useWork((s) => s.loadKeywords);
  const platforms = useLoud((s) => s.platforms);
  const budgets = useWork((s) => s.budgets);
  const demo = useLoud((s) => s.info?.demo ?? false);
  const running = useWork((s) => s.collect?.running ?? false);
  const listening = useWork(
    (s) => s.collect?.steps.some((x) => x.step === "listen" && x.status === "running") ?? false,
  );

  useEffect(() => {
    if (!keywords) void load();
  }, [keywords, load]);

  const counts = Object.fromEntries(
    CHANNEL_IDS.map((id) => [id, keywords?.[LISTEN_KEYS[id]]?.length ?? 0]),
  ) as Record<ChannelId, number>;
  const targets = CHANNEL_IDS.filter((id) => {
    const p = platforms.find((x) => x.id === id);
    const paused = Boolean(budgets.find((b) => b.id === id)?.pausedUntil);
    return p?.status === "connected" && p.enabled && !paused && counts[id] > 0;
  });
  const anyKeywords = CHANNEL_IDS.some((id) => counts[id] > 0);
  const blocked = demo
    ? DEMO_BLOCK
    : !keywords
      ? "Loading keywords"
      : !anyKeywords
        ? "Add keywords first"
        : !targets.length
          ? "No connected platform with keywords is included in runs"
          : null;

  return { counts, targets, blocked, running, listening: running && listening };
}

/** Searches the listening keywords now, on their own, without collecting the accounts. */
export function ListenNow({ variant = "default" }: { variant?: "default" | "outline" }) {
  const { targets, blocked, running, listening } = useListenPlan();
  const start = useWork((s) => s.startCollect);
  const cancel = useWork((s) => s.cancelCollect);

  if (listening)
    return (
      <Button size="sm" variant="outline" onClick={() => void cancel()}>
        <Square />
        Stop
      </Button>
    );
  return (
    <Button
      size="sm"
      variant={variant}
      disabled={running || blocked !== null}
      title={
        running
          ? "Collecting: wait for it to finish"
          : (blocked ?? `Search on ${targets.map((id) => CHANNEL_NAMES[id]).join(", ")}`)
      }
      onClick={() => void start({ steps: ["listen"] })}
    >
      <Search />
      Search now
    </Button>
  );
}

/** Listening's row in Connections, next to the platforms it searches with. */
export function ListeningRow() {
  const { counts, targets, blocked, listening } = useListenPlan();
  const last = useWork((s) => s.lastSteps.listen);
  const go = useLoud((s) => s.go);
  const total = targets.reduce((n, id) => n + counts[id], 0);
  const where = targets.map((id) => `${CHANNEL_NAMES[id]} ${counts[id]}`).join(", ");

  return (
    <div className="rounded-xl border bg-card px-4 py-4 shadow-xs/5">
      <div className="flex items-center gap-3">
        <Ear className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">Listening</span>
        {listening && (
          <span className="flex items-center gap-1.5 text-info-foreground text-xs">
            <Loader className="size-3.5 animate-spin" />
            Searching
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <ListenNow variant="outline" />
          <Button size="sm" variant="ghost-muted" onClick={() => go("listening")}>
            <Pencil />
            Keywords
          </Button>
        </div>
      </div>
      <div className="mt-1 ml-7 flex items-center justify-between gap-6 text-xs">
        <p className="text-muted-foreground">
          {blocked
            ? `${blocked}.`
            : `Searches ${total} keyword${total === 1 ? "" : "s"} with your sessions (${where}). Other people's posts, for reference; it uses the same daily request caps.`}
        </p>
        {last && (
          <span className="flex min-w-0 shrink items-center gap-1.5" title={last.detail}>
            <StepIcon status={last.status} />
            <span className="truncate">{last.detail || last.status}</span>
          </span>
        )}
      </div>
    </div>
  );
}
