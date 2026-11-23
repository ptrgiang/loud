import { CHANNEL_IDS, CHANNEL_NAMES, type ChannelId, LISTEN_KEYS } from "@loud/contracts";
import { Search, Square } from "lucide-react";
import { useEffect } from "react";

import { Button } from "~/components/ui/button";
import { useT, type MsgKey } from "~/i18n";
import { useLoud } from "~/store";
import { useWork } from "~/workStore";

const DEMO_BLOCK: MsgKey = "listen.demoBlock";

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
  const blocked: MsgKey | null = demo
    ? DEMO_BLOCK
    : !keywords
      ? "listen.loading"
      : !anyKeywords
        ? "listen.addKeywords"
        : !targets.length
          ? "listen.noTargets"
          : null;

  return { counts, targets, blocked, running, listening: running && listening };
}

/** Searches the listening keywords now, on their own, without collecting the accounts. */
export function ListenNow({ variant = "default" }: { variant?: "default" | "outline" }) {
  const t = useT();
  const { targets, blocked, running, listening } = useListenPlan();
  const start = useWork((s) => s.startCollect);
  const cancel = useWork((s) => s.cancelCollect);

  if (listening)
    return (
      <Button size="sm" variant="outline" onClick={() => void cancel()}>
        <Square />
        {t("common.stop")}
      </Button>
    );
  return (
    <Button
      size="sm"
      variant={variant}
      disabled={running || blocked !== null}
      title={
        running
          ? t("listen.waitRunning")
          : blocked
            ? t(blocked)
            : t("listen.searchOn", {
                names: targets.map((id) => CHANNEL_NAMES[id]).join(", "),
              })
      }
      onClick={() => void start({ steps: ["listen"] })}
    >
      <Search />
      {t("listen.searchNow")}
    </Button>
  );
}
