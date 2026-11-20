import { Popover } from "@base-ui/react/popover";
import { AGENT_VENDORS, type AgentProviderId, type AgentUsage } from "@loud/contracts";
import { Gauge, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useWork } from "~/workStore";

const level = (pct: number) => (pct >= 95 ? "critical" : pct >= 80 ? "warning" : "ok");

/** "in 3h 20m", "in 2d", the way a limit's reset reads at a glance. */
export function resetsIn(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const min = Math.round((Date.parse(iso) - now) / 60_000);
  if (!Number.isFinite(min)) return null;
  if (min <= 0) return "resetting now";
  if (min < 60) return `resets in ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `resets in ${h}h${min % 60 ? ` ${min % 60}m` : ""}`;
  return `resets in ${Math.round(h / 24)}d`;
}

const ago = (iso: string | null) => {
  if (!iso) return "not checked yet";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return min < 1
    ? "checked just now"
    : min < 60
      ? `checked ${min}m ago`
      : `checked ${Math.round(min / 60)}h ago`;
};

function Provider({ u }: { u: AgentUsage }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-xs">{AGENT_VENDORS[u.provider].name}</span>
        <span className="text-2xs text-muted-foreground">
          {u.plan ? `${u.plan[0]!.toUpperCase()}${u.plan.slice(1)} · ` : ""}
          {ago(u.checkedAt)}
        </span>
      </div>
      {u.windows.length ? (
        u.windows.map((w) => {
          const l = level(w.usedPercent);
          return (
            <div key={w.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span>{w.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {Math.round(w.usedPercent)}% used
                  {resetsIn(w.resetsAt) ? ` · ${resetsIn(w.resetsAt)}` : ""}
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
            aria-label="Plan usage"
            className={cn(
              "tabular-nums",
              l === "critical" && "text-error-foreground",
              l === "warning" && "text-warning-foreground",
            )}
          />
        }
      >
        <Gauge />
        {top ? `${Math.round(top.usedPercent)}%` : "Usage"}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" align="end" sideOffset={8} className="z-50">
          <Popover.Popup className="flex w-80 flex-col gap-4 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg/8 outline-none">
            <div className="flex items-center justify-between gap-3">
              <Popover.Title className="font-medium text-sm">Plan usage</Popover.Title>
              <Button
                size="xs"
                variant="ghost-muted"
                disabled={refreshing}
                onClick={() => void refresh()}
              >
                <RefreshCw className={cn(refreshing && "animate-spin")} />
                Check now
              </Button>
            </div>
            {usage.length ? (
              [...usage]
                .sort((a) => (a.provider === provider ? -1 : 1))
                .map((u) => <Provider key={u.provider} u={u} />)
            ) : (
              <p className="text-muted-foreground text-xs">Checking…</p>
            )}
            <Popover.Description className="text-2xs text-muted-foreground leading-relaxed">
              As each CLI reports it for the account signed in on this computer. Checking sends no
              message and uses none of the plan.
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
