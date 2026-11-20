import {
  AGENT_VENDORS,
  CHANNEL_NAMES,
  type AgentProviderView,
  type StepState,
} from "@loud/contracts";
import { Download, Play, RefreshCw, RotateCcw, ShieldCheck, Square } from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";

import { Card } from "~/components/Card";
import { PageHeader } from "~/components/PageHeader";
import { StepIcon } from "~/components/StepIcon";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { call } from "~/lib/loud";
import { cn } from "~/lib/utils";
import { useLoud } from "~/store";
import { useWork } from "~/workStore";

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="font-medium text-sm">{label}</div>
        {hint && <div className="mt-0.5 text-muted-foreground text-xs leading-relaxed">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function General() {
  const info = useLoud((s) => s.info);
  const [tz, setTz] = useState(info?.timezone ?? "");
  const [since, setSince] = useState(info?.since ?? "");
  if (!info) return null;
  const save = async (patch: { timezone?: string; since?: string }) => {
    try {
      useLoud.setState({ info: await call("settings.updateGeneral", patch) });
    } catch (e) {
      useLoud.setState({ error: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <Card title="General">
      <div className="divide-y">
        <Row label="Time zone" hint="Every time in the data is wall-clock time here.">
          <Input
            size="sm"
            className="w-56"
            value={tz}
            aria-label="Time zone"
            onValueChange={setTz}
            onBlur={() => tz !== info.timezone && void save({ timezone: tz })}
          />
        </Row>
        <Row label="Count from" hint="Posts before this day are ignored everywhere.">
          <Input
            size="sm"
            className="w-40"
            type="date"
            value={since}
            aria-label="Count from"
            onValueChange={setSince}
            onBlur={() => since !== info.since && void save({ since })}
          />
        </Row>
      </div>
    </Card>
  );
}

const STEP_LABEL: Record<StepState["step"], string> = { ...CHANNEL_NAMES, listen: "Listening" };

function Collection() {
  const collect = useWork((s) => s.collect);
  const collection = useWork((s) => s.collection);
  const budgets = useWork((s) => s.budgets);
  const start = useWork((s) => s.startCollect);
  const cancel = useWork((s) => s.cancelCollect);
  const configure = useWork((s) => s.configureCollection);
  const resume = useWork((s) => s.resumePlatform);
  const demo = useLoud((s) => s.info?.demo ?? false);
  const [every, setEvery] = useState(String(collection?.everyHours ?? 12));
  if (!collection) return null;

  return (
    <Card
      title="Collection"
      actions={
        collect?.running ? (
          <Button size="sm" variant="outline" onClick={() => void cancel()}>
            <Square />
            Stop
          </Button>
        ) : (
          <Button size="sm" disabled={demo} onClick={() => void start()}>
            <Play />
            Collect all
          </Button>
        )
      }
    >
      <div className="divide-y">
        {demo && (
          <p className="py-3 text-muted-foreground text-xs">
            This data folder holds the fictional demo, so collection is off here.
          </p>
        )}
        {collect && collect.steps.length > 0 && (
          <ul className="flex flex-col gap-1.5 py-3">
            {collect.steps.map((s) => (
              <li key={s.step} className="flex items-center gap-2 text-sm">
                <StepIcon status={s.status} />
                <span className="w-24 shrink-0">{STEP_LABEL[s.step]}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {s.detail || s.status}
                </span>
              </li>
            ))}
            {collect.finished && !collect.running && (
              <li className="text-2xs text-muted-foreground">
                Last run finished {collect.finished}
              </li>
            )}
          </ul>
        )}
        <Row
          label="Collect on a timer"
          hint={
            collection.auto && collect?.next
              ? `Next run ${new Date(collect.next).toLocaleString()}`
              : "Off: Loud collects only when you ask, here or per platform in Connections."
          }
        >
          <Switch
            checked={collection.auto}
            disabled={demo}
            onCheckedChange={(auto) => void configure({ auto })}
          />
        </Row>
        <Row label="Every" hint="At least 3 hours apart.">
          <Input
            size="sm"
            className="w-20"
            type="number"
            min={3}
            max={168}
            value={every}
            aria-label="Hours between runs"
            onValueChange={setEvery}
            onBlur={() => void configure({ everyHours: Number(every) || 12 })}
          />
          <span className="text-muted-foreground text-xs">hours</span>
        </Row>
        <Row
          label="Keep running in the tray"
          hint="Closing the window leaves Loud in the tray so the timer keeps going."
        >
          <Switch
            checked={collection.keepInTray}
            onCheckedChange={(keepInTray) => void configure({ keepInTray })}
          />
        </Row>
        <div className="py-3">
          <div className="mb-2 font-medium text-sm">Request budget today</div>
          <ul className="flex flex-col gap-1.5">
            {budgets.map((b) => (
              <li key={b.id} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0">{CHANNEL_NAMES[b.id]}</span>
                <span className="w-20 shrink-0 text-muted-foreground tabular-nums">
                  {b.usedToday} / {b.dailyCap}
                </span>
                {b.pausedUntil ? (
                  <>
                    <Badge variant="warning">Paused</Badge>
                    <span
                      className="min-w-0 flex-1 truncate text-muted-foreground"
                      title={b.reason ?? ""}
                    >
                      {b.reason}
                    </span>
                    <Button size="xs" variant="outline" onClick={() => void resume(b.id)}>
                      Resume
                    </Button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-2xs text-muted-foreground leading-relaxed">
            Requests are spaced out, capped per day, paused for hours after a "too many requests"
            answer, and stopped at any login check or captcha until you deal with it on the
            platform's own page.
          </p>
        </div>
      </div>
    </Card>
  );
}

function ProviderOption({
  p,
  selected,
  onSelect,
}: {
  p: AgentProviderView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!p.available}
      data-selected={selected}
      onClick={onSelect}
      className="flex w-full cursor-pointer items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-64 data-[selected=true]:border-ring data-[selected=true]:bg-accent"
    >
      <div className="min-w-0">
        <div className="font-medium text-sm">
          {p.name} <span className="font-normal text-muted-foreground">by {p.vendor}</span>
        </div>
        <div className="truncate text-2xs text-muted-foreground">
          {p.available ? `${p.version ?? ""} · ${p.detail}` : p.detail}
        </div>
      </div>
      {p.available ? (
        <Badge variant="success">Found</Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          Not found
        </Badge>
      )}
    </button>
  );
}

function AgentSettingsCard() {
  const settings = useWork((s) => s.agentSettings);
  const providers = useWork((s) => s.providers);
  const configure = useWork((s) => s.configureAgent);
  const [playbook, setPlaybook] = useState(settings?.playbook ?? "");
  if (!settings) return null;
  const current = providers.find((p) => p.id === settings.provider);
  const vendor = AGENT_VENDORS[settings.provider];

  return (
    <Card title="Agent">
      <div className="divide-y">
        <Row
          label="Use the agent"
          hint={
            <>
              Off by default. When on, your messages and the data the agent reads (your posts,
              numbers, drafts and listening results) are sent to <strong>{vendor.vendor}</strong>{" "}
              through your {vendor.name} sign-in on this computer. Loud stores no model key.
            </>
          }
        >
          <Switch
            checked={settings.enabled}
            disabled={!current?.available}
            onCheckedChange={(enabled) => void configure({ enabled })}
          />
        </Row>
        <div className="flex flex-col gap-2 py-3">
          <div className="font-medium text-sm">Provider</div>
          {providers.map((p) => (
            <ProviderOption
              key={p.id}
              p={p}
              selected={p.id === settings.provider}
              onSelect={() => void configure({ provider: p.id, model: "" })}
            />
          ))}
        </div>
        {current && current.models.length > 1 && (
          <Row label="Model">
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={settings.model}
              aria-label="Model"
              onChange={(e) => void configure({ model: e.target.value })}
            >
              {current.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Row>
        )}
        <div className="flex flex-col gap-2 py-3">
          <div className="font-medium text-sm">Playbook</div>
          <div className="text-muted-foreground text-xs">
            Your own rules for your channels: voice, topics, what never to post. The agent follows
            them.
          </div>
          <Textarea
            rows={5}
            value={playbook}
            aria-label="Playbook"
            placeholder="e.g. Plain words. One idea per post. Never mention competitors by name."
            onChange={(e) => setPlaybook(e.target.value)}
            onBlur={() => playbook !== settings.playbook && void configure({ playbook })}
          />
        </div>
        <div className="flex gap-2 py-3 text-muted-foreground text-xs leading-relaxed">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <p>
            The agent gets no shell, no file access and no web: only Loud's tools, which read the
            built data and write proposals and drafts. It cannot post, like or message anyone. Loud
            keeps the conversation on this computer until you start a new chat; Claude Code and
            Codex also keep their own session logs.
          </p>
        </div>
      </div>
    </Card>
  );
}

function DataCard() {
  const hub = useLoud((s) => s.hub);
  const [file, setFile] = useState<string | null>(null);
  return (
    <Card title="Data">
      <Row
        label="Export posts"
        hint={file ?? "A CSV of every post and its numbers, saved in the data folder."}
      >
        <Button
          size="sm"
          variant="outline"
          disabled={!hub}
          onClick={async () => {
            try {
              setFile((await call("data.exportPosts", {})).file);
            } catch (e) {
              useLoud.setState({ error: e instanceof Error ? e.message : String(e) });
            }
          }}
        >
          <Download />
          Export CSV
        </Button>
      </Row>
    </Card>
  );
}

function UpdatesCard() {
  const status = useWork((s) => s.updates);
  const prefs = useWork((s) => s.updateSettings);
  const configure = useWork((s) => s.configureUpdates);
  const check = useWork((s) => s.checkUpdates);
  const install = useWork((s) => s.installUpdate);
  const version = useLoud((s) => s.info?.version ?? "");
  if (!status || !prefs) return null;
  const busy = status.state === "checking" || status.state === "downloading";
  const line = !status.supported
    ? status.error
    : status.state === "checking"
      ? "Checking…"
      : status.state === "downloading"
        ? `Downloading ${status.version ?? "the update"}… ${status.progress ?? 0}%`
        : status.state === "ready"
          ? `${status.version} is ready. Restart to install it.`
          : status.state === "none"
            ? `Up to date. Checked ${status.checkedAt}.`
            : status.state === "error"
              ? `Could not check: ${status.error}`
              : "Not checked yet.";

  return (
    <Card
      title="Updates"
      actions={
        status.state === "ready" ? (
          <Button size="sm" onClick={() => void install()}>
            <RotateCcw />
            Restart and install
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={!status.supported || busy}
            onClick={() => void check()}
          >
            <RefreshCw className={cn(busy && "animate-spin")} />
            Check now
          </Button>
        )
      }
    >
      <div className="divide-y">
        <p
          className={cn(
            "pb-3 text-xs",
            status.state === "error" ? "text-error-foreground" : "text-muted-foreground",
          )}
        >
          Loud {version}. {line}
        </p>
        <Row
          label="Check for updates"
          hint="Asks GitHub Releases for a newer version at start and every 6 hours, and downloads it in the background. GitHub sees your IP address and Loud's version; none of your data is sent. Installing waits for you."
        >
          <Switch
            checked={prefs.check}
            aria-label="Check for updates"
            onCheckedChange={(check) => void configure({ check })}
          />
        </Row>
      </div>
    </Card>
  );
}

export function SettingsView() {
  const loadCollect = useWork((s) => s.loadCollect);
  const loadAgent = useWork((s) => s.loadAgent);
  const loadProviders = useWork((s) => s.loadProviders);
  const loadUpdates = useWork((s) => s.loadUpdates);
  const ready = useWork((s) => s.collection !== null && s.agentSettings !== null);

  useEffect(() => {
    void loadCollect();
    void loadAgent();
    void loadProviders();
    void loadUpdates();
  }, [loadCollect, loadAgent, loadProviders, loadUpdates]);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex-1 overflow-y-auto">
        {ready && (
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
            <General />
            <Collection />
            <AgentSettingsCard />
            <DataCard />
            <UpdatesCard />
          </div>
        )}
      </div>
    </>
  );
}
