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
import { cn } from "~/lib/utils";
import { useLoud } from "~/store";
import { useWork } from "~/workStore";

const pausedText = (reason: string, until: string | null) => {
  const why = reason ? reason[0]!.toUpperCase() + reason.slice(1) : "Paused";
  const at = until
    ? new Date(until).toLocaleString(undefined, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  return at ? `${why}. Until ${at}.` : `${why}.`;
};

const DEMO_BLOCK = "The demo data folder is never collected into";

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
          placeholder="Page id, or a Business Suite link"
          onValueChange={setAssetId}
          onBlur={() => {
            if (assetId.trim() !== (p.assetId ?? ""))
              void updatePlatform({ id: p.id, assetId, handle: assetId });
          }}
          aria-label="Facebook Page id"
        />
        <ReloadButton p={p} label="Find the Pages again" />
      </div>
    );

  return (
    <div className="flex items-center gap-1">
      <select
        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm sm:h-7"
        value={p.assetId ?? ""}
        aria-label="Facebook Page"
        disabled={busy}
        onChange={(e) => {
          const id = e.target.value;
          if (id) void updatePlatform({ id: p.id, assetId: id, handle: id });
        }}
      >
        {!p.assetId && <option value="">Choose a Page ({pages.length})</option>}
        {p.assetId && !pages.some((x) => x.id === p.assetId) && (
          <option value={p.assetId}>Page {p.assetId}</option>
        )}
        {pages.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      <ReloadButton p={p} label="Find the Pages again" />
    </div>
  );
}

function HandleField({ p }: { p: PlatformView }) {
  const updatePlatform = useLoud((s) => s.updatePlatform);
  const [handle, setHandle] = useState(p.handle);
  return (
    <div className="flex items-center gap-1">
      <Input
        size="sm"
        value={handle}
        placeholder="Handle, not detected yet"
        onValueChange={setHandle}
        onBlur={() => {
          if (handle.trim() !== p.handle) void updatePlatform({ id: p.id, handle });
        }}
        aria-label={`${p.name} handle`}
      />
      {!p.handle && <ReloadButton p={p} label="Detect the handle" />}
    </div>
  );
}

function PlatformRow({ p }: { p: PlatformView }) {
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
  const blocked = demo
    ? DEMO_BLOCK
    : !p.enabled
      ? "Turn on Include in runs first"
      : paused
        ? "Paused: resume it first"
        : !ready
          ? p.id === "fb"
            ? "Choose the Page first"
            : "Waiting for the handle"
          : null;

  return (
    <li className="px-4 py-4">
      <div className="flex items-center gap-3">
        <ChannelDot id={p.id} className="size-2.5" />
        <span className="font-medium text-sm">{p.name}</span>
        {!connected ? (
          <Badge variant="outline" className="text-muted-foreground">
            Signed out
          </Badge>
        ) : reading ? (
          <Badge variant="info">
            <Loader className="animate-spin" />
            Collecting
          </Badge>
        ) : paused ? (
          <Badge variant="warning">Paused</Badge>
        ) : (
          <Badge variant="success">Connected</Badge>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {connected ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={running || busy || blocked !== null}
                title={blocked ?? `Read ${p.name} now`}
                onClick={() => void start({ steps: [p.id] })}
              >
                <Play />
                Collect now
              </Button>
              <Button
                size="sm"
                variant="ghost-muted"
                disabled={busy}
                onClick={() => void openBrowser(p.id)}
              >
                <ExternalLink />
                Open
              </Button>
              <Button
                size="icon-sm"
                variant="ghost-muted"
                disabled={busy || reading}
                aria-label={`Disconnect ${p.name}`}
                title="Disconnect: log out and clear this profile"
                onClick={() => void disconnect(p.id)}
              >
                <LogOut />
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => void connect(p.id)}>
              {busy ? <Loader className="animate-spin" /> : <Plug />}
              Connect
            </Button>
          )}
        </div>
      </div>

      {connected ? (
        <div className="mt-3 ml-5.5 grid grid-cols-[minmax(0,20rem)_auto_minmax(0,1fr)] items-center gap-x-6">
          {p.id === "fb" ? <PagePicker p={p} /> : <HandleField p={p} />}
          <label
            className="flex items-center gap-2 text-muted-foreground text-xs"
            title="Off: Collect all and the timer skip this platform"
          >
            <Switch
              size="sm"
              checked={p.enabled}
              disabled={busy}
              onCheckedChange={(enabled) => void updatePlatform({ id: p.id, enabled })}
            />
            Include in runs
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
                {budget.usedToday} of {budget.dailyCap} requests today
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-1 ml-5.5 text-muted-foreground text-xs">
          You log in on {p.name}'s own page; the handle is read afterwards.
        </p>
      )}

      {connected && paused && (
        <div className="mt-3 ml-5.5 flex items-start gap-2.5 rounded-lg bg-warning/8 px-3 py-2.5 text-xs dark:bg-warning/16">
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning-foreground" />
          <p className="min-w-0 flex-1 leading-relaxed">
            {pausedText(budget?.reason ?? "", budget?.pausedUntil ?? null)}
          </p>
          <Button size="xs" variant="outline" onClick={() => void resume(p.id)}>
            Resume
          </Button>
        </div>
      )}
    </li>
  );
}

function CollectAll() {
  const running = useWork((s) => s.collect?.running ?? false);
  const start = useWork((s) => s.startCollect);
  const cancel = useWork((s) => s.cancelCollect);
  const demo = useLoud((s) => s.info?.demo ?? false);
  const anyConnected = useLoud((s) => s.platforms.some((p) => p.status === "connected"));
  if (running)
    return (
      <Button size="sm" variant="outline" onClick={() => void cancel()}>
        <Square />
        Stop
      </Button>
    );
  return (
    <Button
      size="sm"
      disabled={demo || !anyConnected}
      title={demo ? DEMO_BLOCK : "Every platform with Collect on, then listening"}
      onClick={() => void start()}
    >
      <Play />
      Collect all
    </Button>
  );
}

export function ConnectionsView() {
  const platforms = useLoud((s) => s.platforms);

  return (
    <>
      <PageHeader title="Connections" description="Log in once; Loud reads with that session.">
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
            <p>
              Each platform gets its own browser profile inside Loud. You log in on the platform's
              own page, so Loud never sees your password. Sessions, posts and numbers stay on this
              computer, and Loud talks only to the platform itself. Disconnect clears that profile.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
