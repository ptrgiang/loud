import type { PlatformView } from "@loud/contracts";
import {
  ExternalLink,
  Loader,
  LogOut,
  Play,
  Plug,
  RefreshCw,
  ShieldCheck,
  Square,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";

import { ChannelDot, PageHeader } from "~/components/PageHeader";
import { StepIcon } from "~/components/StepIcon";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { useT, type MsgKey } from "~/i18n";
import { cn } from "~/lib/utils";
import { useLoud } from "~/store";
import { useWork } from "~/workStore";

type T = ReturnType<typeof useT>;

const pausedText = (t: T, reason: string, until: string | null) => {
  const why = reason ? reason[0]!.toUpperCase() + reason.slice(1) : t("conn.paused");
  const at = until
    ? new Date(until).toLocaleString(undefined, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  return at ? t("conn.pausedUntil", { why, at }) : t("conn.pausedReason", { why });
};

function ReloadButton({ p, label }: { p: PlatformView; label: string }) {
  const busy = useLoud((s) => s.busy.has(p.id));
  const detect = useLoud((s) => s.detectPlatform);
  return (
    <Button
      size="icon-sm"
      variant="ghost-muted"
      disabled={busy}
      aria-label={label}
      title={label}
      onClick={() => void detect(p.id)}
    >
      <RefreshCw className={cn(busy && "animate-spin")} />
    </Button>
  );
}

/** Facebook: which Page Loud reads. The list comes from Business Suite and the Pages the account manages. */
function PagePicker({ p }: { p: PlatformView }) {
  const t = useT();
  const busy = useLoud((s) => s.busy.has(p.id));
  const updatePlatform = useLoud((s) => s.updatePlatform);
  const [assetId, setAssetId] = useState(p.assetId ?? "");
  const pages = p.pages ?? [];

  if (!pages.length)
    return (
      <div className="flex items-center gap-1">
        <Input
          size="sm"
          value={assetId}
          placeholder={t("conn.pagePlaceholder")}
          onValueChange={setAssetId}
          onBlur={() => {
            if (assetId.trim() !== (p.assetId ?? ""))
              void updatePlatform({ id: p.id, assetId, handle: assetId });
          }}
          aria-label={t("conn.pageAria")}
        />
        <ReloadButton p={p} label={t("conn.findPages")} />
      </div>
    );

  return (
    <div className="flex items-center gap-1">
      <select
        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm sm:h-7"
        value={p.assetId ?? ""}
        aria-label={t("conn.pageSelectAria")}
        disabled={busy}
        onChange={(e) => {
          const id = e.target.value;
          if (id) void updatePlatform({ id: p.id, assetId: id, handle: id });
        }}
      >
        {!p.assetId && <option value="">{t("conn.choosePage", { n: pages.length })}</option>}
        {p.assetId && !pages.some((x) => x.id === p.assetId) && (
          <option value={p.assetId}>{t("conn.pageId", { id: p.assetId })}</option>
        )}
        {pages.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      <ReloadButton p={p} label={t("conn.findPages")} />
    </div>
  );
}

function HandleField({ p }: { p: PlatformView }) {
  const t = useT();
  const updatePlatform = useLoud((s) => s.updatePlatform);
  const [handle, setHandle] = useState(p.handle);
  return (
    <div className="flex items-center gap-1">
      <Input
        size="sm"
        value={handle}
        placeholder={t("conn.handlePlaceholder")}
        onValueChange={setHandle}
        onBlur={() => {
          if (handle.trim() !== p.handle) void updatePlatform({ id: p.id, handle });
        }}
        aria-label={t("conn.handleAria", { name: p.name })}
      />
      {!p.handle && <ReloadButton p={p} label={t("conn.detectHandle")} />}
    </div>
  );
}

function PlatformRow({ p }: { p: PlatformView }) {
  const t = useT();
  const busy = useLoud((s) => s.busy.has(p.id));
  const demo = useLoud((s) => s.info?.demo ?? false);
  const connect = useLoud((s) => s.connect);
  const disconnect = useLoud((s) => s.disconnect);
  const openBrowser = useLoud((s) => s.openBrowser);
  const updatePlatform = useLoud((s) => s.updatePlatform);
  const running = useWork((s) => s.collect?.running ?? false);
  const last = useWork((s) => s.lastSteps[p.id]);
  const budget = useWork((s) => s.budgets.find((b) => b.id === p.id));
  const start = useWork((s) => s.startCollect);
  const resume = useWork((s) => s.resumePlatform);
  const connected = p.status === "connected";
  const paused = Boolean(budget?.pausedUntil);
  const reading = running && last?.status === "running";
  const ready = p.id === "fb" ? Boolean(p.assetId) : Boolean(p.handle);
  const blocked: MsgKey | null = demo
    ? "listen.demoBlock"
    : !p.enabled
      ? "conn.enableFirst"
      : paused
        ? "conn.resumeFirst"
        : !ready
          ? p.id === "fb"
            ? "conn.choosePageFirst"
            : "conn.waitHandle"
          : null;

  return (
    <li className="px-4 py-4">
      <div className="flex items-center gap-3">
        <ChannelDot id={p.id} className="size-2.5" />
        <span className="font-medium text-sm">{p.name}</span>
        {!connected ? (
          <Badge variant="outline" className="text-muted-foreground">
            {t("conn.signedOut")}
          </Badge>
        ) : reading ? (
          <Badge variant="info">
            <Loader className="animate-spin" />
            {t("conn.collecting")}
          </Badge>
        ) : paused ? (
          <Badge variant="warning">{t("conn.paused")}</Badge>
        ) : (
          <Badge variant="success">{t("conn.connected")}</Badge>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {connected ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={running || busy || blocked !== null}
                title={blocked ? t(blocked) : t("conn.readNow", { name: p.name })}
                onClick={() => void start({ steps: [p.id] })}
              >
                <Play />
                {t("conn.collectNow")}
              </Button>
              <Button
                size="sm"
                variant="ghost-muted"
                disabled={busy}
                onClick={() => void openBrowser(p.id)}
              >
                <ExternalLink />
                {t("common.open")}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost-muted"
                disabled={busy || reading}
                aria-label={t("conn.disconnectAria", { name: p.name })}
                title={t("conn.disconnectTitle")}
                onClick={() => void disconnect(p.id)}
              >
                <LogOut />
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => void connect(p.id)}>
              {busy ? <Loader className="animate-spin" /> : <Plug />}
              {t("conn.connect")}
            </Button>
          )}
        </div>
      </div>

      {connected ? (
        <div className="mt-3 ml-5.5 grid grid-cols-[minmax(0,20rem)_auto_minmax(0,1fr)] items-center gap-x-6">
          {p.id === "fb" ? <PagePicker p={p} /> : <HandleField p={p} />}
          <label
            className="flex items-center gap-2 text-muted-foreground text-xs"
            title={t("conn.includeTitle")}
          >
            <Switch
              size="sm"
              checked={p.enabled}
              disabled={busy}
              onCheckedChange={(enabled) => void updatePlatform({ id: p.id, enabled })}
            />
            {t("conn.include")}
          </label>
          <div className="flex min-w-0 flex-col items-end gap-0.5 text-xs">
            {last && (
              <span className="flex max-w-full items-center gap-1.5" title={last.detail}>
                <StepIcon status={last.status} />
                <span className="truncate">{last.detail || last.status}</span>
              </span>
            )}
            {budget && (
              <span className="text-muted-foreground tabular-nums">
                {t("conn.budget", { used: budget.usedToday, cap: budget.dailyCap })}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-1 ml-5.5 text-muted-foreground text-xs">
          {t("conn.loginNote", { name: p.name })}
        </p>
      )}

      {connected && paused && (
        <div className="mt-3 ml-5.5 flex items-start gap-2.5 rounded-lg bg-warning/8 px-3 py-2.5 text-xs dark:bg-warning/16">
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning-foreground" />
          <p className="min-w-0 flex-1 leading-relaxed">
            {pausedText(t, budget?.reason ?? "", budget?.pausedUntil ?? null)}
          </p>
          <Button size="xs" variant="outline" onClick={() => void resume(p.id)}>
            {t("conn.resume")}
          </Button>
        </div>
      )}

      {connected && !paused && (budget?.emptyRuns ?? 0) >= 2 && (
        <div className="mt-3 ml-5.5 flex items-start gap-2.5 rounded-lg bg-warning/8 px-3 py-2.5 text-xs dark:bg-warning/16">
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning-foreground" />
          <p className="min-w-0 flex-1 leading-relaxed">
            {t("conn.emptyRuns", { n: budget!.emptyRuns, name: p.name })}
          </p>
        </div>
      )}
    </li>
  );
}

function CollectAll() {
  const t = useT();
  const running = useWork((s) => s.collect?.running ?? false);
  const start = useWork((s) => s.startCollect);
  const cancel = useWork((s) => s.cancelCollect);
  const demo = useLoud((s) => s.info?.demo ?? false);
  const anyConnected = useLoud((s) => s.platforms.some((p) => p.status === "connected"));
  if (running)
    return (
      <Button size="sm" variant="outline" onClick={() => void cancel()}>
        <Square />
        {t("common.stop")}
      </Button>
    );
  return (
    <Button
      size="sm"
      disabled={demo || !anyConnected}
      title={demo ? t("listen.demoBlock") : t("palette.collectAll.hint")}
      onClick={() => void start()}
    >
      <Play />
      {t("palette.collectAll")}
    </Button>
  );
}

export function ConnectionsView() {
  const t = useT();
  const platforms = useLoud((s) => s.platforms);

  return (
    <>
      <PageHeader title={t("nav.connections")} description={t("conn.description")}>
        <CollectAll />
      </PageHeader>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-6">
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs/5">
            {platforms.map((p) => (
              <PlatformRow
                key={`${p.id}:${p.handle}:${p.assetId ?? ""}:${p.pages?.length ?? 0}`}
                p={p}
              />
            ))}
          </ul>

          <div className="flex gap-3 rounded-xl border border-dashed px-4 py-3.5 text-muted-foreground text-xs leading-relaxed">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <p>{t("conn.privacy")}</p>
          </div>
        </div>
      </div>
    </>
  );
}
