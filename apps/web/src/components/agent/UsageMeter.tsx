import { Popover } from "@base-ui/react/popover";
import { AGENT_VENDORS, type AgentProviderId, type AgentUsage } from "@loud/contracts";
import { Gauge, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";
import { cn } from "~/lib/utils";
import { useWork } from "~/workStore";

const level = (pct: number) => (pct >= 95 ? "critical" : pct >= 80 ? "warning" : "ok");

type T = ReturnType<typeof useT>;

/** "in 3h 20m", "in 2d", the way a limit's reset reads at a glance. */
export function resetsIn(t: T, iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const min = Math.round((Date.parse(iso) - now) / 60_000);
  if (!Number.isFinite(min)) return null;
  if (min <= 0) return t("agentUsage.resetting");
  if (min < 60) return t("agentUsage.resetsM", { n: min });
  const h = Math.floor(min / 60);
  if (h < 48)
    return min % 60 ? t("agentUsage.resetsHM", { h, m: min % 60 }) : t("agentUsage.resetsH", { h });
  return t("agentUsage.resetsD", { d: Math.round(h / 24) });
}

const ago = (t: T, iso: string | null) => {
  if (!iso) return t("agentUsage.notChecked");
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return min < 1
    ? t("agentUsage.justNow")
    : min < 60
      ? t("agentUsage.agoM", { n: min })
      : t("agentUsage.agoH", { h: Math.round(min / 60) });
};

function Provider({ u }: { u: AgentUsage }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-xs">{AGENT_VENDORS[u.provider].name}</span>
        <span className="text-2xs text-muted-foreground">
          {u.plan ? `${u.plan[0]!.toUpperCase()}${u.plan.slice(1)} · ` : ""}
          {ago(t, u.checkedAt)}
        </span>
      </div>
      {u.windows.length ? (
        u.windows.map((w) => {
          const l = level(w.usedPercent);
          const reset = resetsIn(t, w.resetsAt);
          return (
            <div key={w.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span>{w.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {t("agentUsage.pctUsed", { pct: Math.round(w.usedPercent) })}
                  {reset ? ` · ${reset}` : ""}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    l === "critical"
                      ? "bg-destructive"
                      : l === "warning"
                        ? "bg-warning"
                        : "bg-foreground/60",
                  )}
                  style={{ width: `${Math.max(2, w.usedPercent)}%` }}
                />
              </div>
            </div>
          );
        })
      ) : (
        <p className="text-muted-foreground text-xs">{u.note}</p>
      )}
    </div>
  );
}

/** The plan limits of the CLI this chat runs on, in the composer like T3 Code; the popover shows both CLIs. */
export function UsageMeter({ provider }: { provider: AgentProviderId }) {
  const t = useT();
  const usage = useWork((s) => s.agentUsage);
  const load = useWork((s) => s.loadAgentUsage);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => void load(false), [load]);

  const mine = usage.find((u) => u.provider === provider);
  const top = mine?.windows.reduce(
    (a, w) => (w.usedPercent > a.usedPercent ? w : a),
    mine.windows[0]!,
  );
  const l = top ? level(top.usedPercent) : "ok";
  const refresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <Button
            type="button"
            size="xs"
            variant="ghost-muted"
            aria-label={t("agentUsage.title")}
            className={cn(
              "tabular-nums",
              l === "critical" && "text-error-foreground",
              l === "warning" && "text-warning-foreground",
            )}
          />
        }
      >
        <Gauge />
        {top ? `${Math.round(top.usedPercent)}%` : t("agentUsage.fallback")}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" align="end" sideOffset={8} className="z-50">
          <Popover.Popup className="flex w-80 flex-col gap-4 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg/8 outline-none">
            <div className="flex items-center justify-between gap-3">
              <Popover.Title className="font-medium text-sm">{t("agentUsage.title")}</Popover.Title>
              <Button
                size="xs"
                variant="ghost-muted"
                disabled={refreshing}
                onClick={() => void refresh()}
              >
                <RefreshCw className={cn(refreshing && "animate-spin")} />
                {t("agentUsage.checkNow")}
              </Button>
            </div>
            {usage.length ? (
              [...usage]
                .sort((a) => (a.provider === provider ? -1 : 1))
                .map((u) => <Provider key={u.provider} u={u} />)
            ) : (
              <p className="text-muted-foreground text-xs">{t("agentUsage.checking")}</p>
            )}
            <Popover.Description className="text-2xs text-muted-foreground leading-relaxed">
              {t("agentUsage.note")}
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
