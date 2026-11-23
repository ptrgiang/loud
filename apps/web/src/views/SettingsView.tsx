import { AGENT_VENDORS, type AgentProviderView } from "@loud/contracts";
import {
  Download,
  ExternalLink,
  FileClock,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";

import { Card } from "~/components/Card";
import { PageHeader } from "~/components/PageHeader";
import { openUsagePage, ReportPreview } from "~/components/UsageReports";
import { toast } from "~/lib/toast";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { LOCALES, useLocale, useT, type Locale } from "~/i18n";
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
  children?: React.ReactNode;
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

/** Client preference like the theme: localStorage, no IPC. */
function LocaleSelect() {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  return (
    <Row label={t("set.locale")} hint={t("set.locale.hint")}>
      <select
        className="h-8 w-40 rounded-md border border-input bg-background px-2 text-sm sm:h-7"
        value={locale}
        aria-label={t("set.locale")}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        {Object.entries(LOCALES).map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </Row>
  );
}

function General() {
  const t = useT();
  const info = useLoud((s) => s.info);
  // Keyed on the stored value so the field shows it once collection settings have loaded.
  const rescan = useWork((s) => s.collection?.rescanDays);
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
    <Card title={t("set.general")}>
      <div className="divide-y">
        <LocaleSelect />
        <Row label={t("set.timezone")} hint={t("set.timezone.hint")}>
          <Input
            size="sm"
            className="w-56"
            value={tz}
            aria-label={t("set.timezone")}
            onValueChange={setTz}
            onBlur={() => tz !== info.timezone && void save({ timezone: tz })}
          />
        </Row>
        <Row label={t("set.countFrom")} hint={t("set.countFrom.hint")}>
          <Input
            size="sm"
            className="w-40"
            type="date"
            value={since}
            aria-label={t("set.countFrom")}
            onValueChange={setSince}
            onBlur={() => since !== info.since && void save({ since })}
          />
        </Row>
        <Rescan key={rescan ?? "loading"} />
      </div>
    </Card>
  );
}

/** After the first read, each run reads only the recent posts again; older ones keep their numbers. */
function Rescan() {
  const t = useT();
  const collection = useWork((s) => s.collection);
  const configure = useWork((s) => s.configureCollection);
  const start = useWork((s) => s.startCollect);
  const running = useWork((s) => s.collect?.running ?? false);
  const demo = useLoud((s) => s.info?.demo ?? false);
  const [days, setDays] = useState(String(collection?.rescanDays ?? 7));
  if (!collection) return null;
  return (
    <Row label={t("set.rescan")} hint={t("set.rescan.hint", { n: collection.rescanDays })}>
      <Input
        size="sm"
        className="w-16"
        type="number"
        min={1}
        max={60}
        value={days}
        aria-label={t("set.daysAria")}
        onValueChange={setDays}
        onBlur={() => void configure({ rescanDays: Number(days) || 7 })}
      />
      <span className="text-muted-foreground text-xs">{t("set.days")}</span>
      <Button
        size="sm"
        variant="outline"
        disabled={demo || running}
        onClick={() => void start({ full: true })}
      >
        {t("set.rescanAll")}
      </Button>
    </Row>
  );
}

/** The timer only: collecting now, per platform and pausing are in Connections. */
function Collection() {
  const t = useT();
  const collect = useWork((s) => s.collect);
  const collection = useWork((s) => s.collection);
  const configure = useWork((s) => s.configureCollection);
  const demo = useLoud((s) => s.info?.demo ?? false);
  const [every, setEvery] = useState(String(collection?.everyHours ?? 12));
  if (!collection) return null;

  return (
    <Card title={t("set.collection")}>
      <div className="divide-y">
        {demo && <p className="py-3 text-muted-foreground text-xs">{t("set.demoOff")}</p>}
        <Row
          label={t("set.autoCollect")}
          hint={
            collection.auto && collect?.next
              ? t("set.autoCollect.next", {
                  at: new Date(collect.next).toLocaleString(),
                })
              : t("set.autoCollect.off")
          }
        >
          <Switch
            checked={collection.auto}
            disabled={demo}
            onCheckedChange={(auto) => void configure({ auto })}
          />
        </Row>
        <Row label={t("set.every")} hint={t("set.every.hint")}>
          <Input
            size="sm"
            className="w-20"
            type="number"
            min={3}
            max={168}
            value={every}
            aria-label={t("set.everyAria")}
            onValueChange={setEvery}
            onBlur={() => void configure({ everyHours: Number(every) || 12 })}
          />
          <span className="text-muted-foreground text-xs">{t("set.hours")}</span>
        </Row>
        <Row label={t("set.tray")} hint={t("set.tray.hint")}>
          <Switch
            checked={collection.keepInTray}
            onCheckedChange={(keepInTray) => void configure({ keepInTray })}
          />
        </Row>
        <Row label={t("set.login")} hint={t("set.login.hint")}>
          <Switch
            checked={collection.launchAtLogin}
            aria-label={t("set.login")}
            onCheckedChange={(launchAtLogin) => void configure({ launchAtLogin })}
          />
        </Row>
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
  const t = useT();
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
          {p.name}{" "}
          <span className="font-normal text-muted-foreground">
            {t("set.byVendor", { vendor: p.vendor })}
          </span>
        </div>
        <div className="truncate text-2xs text-muted-foreground">
          {p.available ? `${p.version ?? ""} · ${p.detail}` : p.detail}
        </div>
      </div>
      {p.available ? (
        <Badge variant="success">{t("set.found")}</Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          {t("set.notFound")}
        </Badge>
      )}
    </button>
  );
}

function AgentSettingsCard() {
  const t = useT();
  const settings = useWork((s) => s.agentSettings);
  const providers = useWork((s) => s.providers);
  const configure = useWork((s) => s.configureAgent);
  const os = useLoud((s) => s.info?.os);
  const [playbook, setPlaybook] = useState(settings?.playbook ?? "");
  if (!settings) return null;
  const current = providers.find((p) => p.id === settings.provider);
  const vendor = AGENT_VENDORS[settings.provider];

  return (
    <Card title={t("set.agent")}>
      <div className="divide-y">
        <Row
          label={t("set.useAgent")}
          hint={t("set.useAgent.hint", { vendor: vendor.vendor, name: vendor.name })}
        >
          <Switch
            checked={settings.enabled}
            disabled={!current?.available}
            onCheckedChange={(enabled) => void configure({ enabled })}
          />
        </Row>
        <div className="flex flex-col gap-2 py-3">
          <div className="font-medium text-sm">{t("set.provider")}</div>
          <div className="text-muted-foreground text-xs">{t("set.provider.hint")}</div>
          {providers.map((p) => (
            <ProviderOption
              key={p.id}
              p={p}
              selected={p.id === settings.provider}
              onSelect={() => void configure({ provider: p.id, model: "", effort: "" })}
            />
          ))}
        </div>
        {settings.provider === "claude" && os === "win32" && (
          <div className="flex gap-2.5 rounded-lg bg-warning/8 px-3 py-2.5 text-xs leading-relaxed dark:bg-warning/16">
            <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning-foreground" />
            <p>{t("set.claudeWarn")}</p>
          </div>
        )}
        <div className="flex flex-col gap-2 py-3">
          <div className="font-medium text-sm">{t("set.playbook")}</div>
          <div className="text-muted-foreground text-xs">{t("set.playbook.hint")}</div>
          <Textarea
            rows={5}
            value={playbook}
            aria-label={t("set.playbook")}
            placeholder={t("set.playbook.placeholder")}
            onChange={(e) => setPlaybook(e.target.value)}
            onBlur={() => playbook !== settings.playbook && void configure({ playbook })}
          />
        </div>
        <div className="flex gap-2 py-3 text-muted-foreground text-xs leading-relaxed">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <p>{t("set.agentPrivacy")}</p>
        </div>
      </div>
    </Card>
  );
}

function DataCard() {
  const t = useT();
  const hub = useLoud((s) => s.hub);
  const demo = useLoud((s) => s.info?.demo ?? false);
  const [file, setFile] = useState<string | null>(null);
  const [dir, setDir] = useState<string | null>(null);
  const [diag, setDiag] = useState<string | null>(null);
  // Two clicks: the first arms the delete, the second does it. A moment of intent before data goes.
  const [sure, setSure] = useState(false);
  const err = (e: unknown) =>
    useLoud.setState({ error: e instanceof Error ? e.message : String(e) });
  const demoCall = async (method: "data.loadDemo" | "data.leaveDemo") => {
    try {
      useLoud.setState({ info: await call(method, {}) });
      toast("done", t(method === "data.loadDemo" ? "set.demoLoaded" : "set.demoRemoved"));
    } catch (e) {
      err(e);
    }
  };
  return (
    <Card title={t("set.data")}>
      <div className="divide-y">
        {(demo || !hub) && (
          <Row label={t("set.demo")} hint={t("set.demo.hint")}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void demoCall(demo ? "data.leaveDemo" : "data.loadDemo")}
            >
              {demo ? t("set.demoRemove") : t("set.demoLoad")}
            </Button>
          </Row>
        )}
        <Row label={t("set.exportPosts")} hint={file ?? t("set.exportPosts.hint")}>
          <Button
            size="sm"
            variant="outline"
            disabled={!hub}
            onClick={async () => {
              try {
                setFile((await call("data.exportPosts", {})).file);
              } catch (e) {
                err(e);
              }
            }}
          >
            <Download />
            {t("set.exportCsv")}
          </Button>
        </Row>
        <Row label={t("set.exportAll")} hint={dir ?? t("set.exportAll.hint")}>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                setDir((await call("data.exportAll", {})).dir);
              } catch (e) {
                err(e);
              }
            }}
          >
            <FolderOpen />
            {t("set.exportAllBtn")}
          </Button>
        </Row>
        <Row label={t("set.diag")} hint={diag ?? t("set.diag.hint")}>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                setDiag((await call("app.diagnostics", {})).file);
              } catch (e) {
                err(e);
              }
            }}
          >
            <FileClock />
            {t("set.export")}
          </Button>
        </Row>
        <Row label={t("set.deleteData")} hint={t("set.deleteData.hint")}>
          <Button
            size="sm"
            variant={sure ? "destructive" : "outline"}
            onClick={async () => {
              if (!sure) {
                setSure(true);
                setTimeout(() => setSure(false), 4000);
                return;
              }
              setSure(false);
              try {
                await call("data.deleteAll", {});
                await useLoud.getState().load();
              } catch (e) {
                err(e);
              }
            }}
          >
            <Trash2 />
            {sure ? t("set.deleteSure") : t("set.delete")}
          </Button>
        </Row>
      </div>
    </Card>
  );
}

function UpdatesCard() {
  const t = useT();
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
      ? t("upd.checking")
      : status.state === "downloading"
        ? t("upd.downloading", {
            version: status.version ?? t("upd.theUpdate"),
            pct: status.progress ?? 0,
          })
        : status.state === "ready"
          ? t("upd.ready", { version: status.version ?? "" })
          : status.state === "none"
            ? t("upd.none", { at: status.checkedAt ?? "" })
            : status.state === "error"
              ? t("upd.error", { error: status.error ?? "" })
              : t("upd.notChecked");

  return (
    <Card
      title={t("set.updates")}
      actions={
        status.state === "ready" ? (
          <Button size="sm" onClick={() => void install()}>
            <RotateCcw />
            {t("set.restart")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={!status.supported || busy}
            onClick={() => void check()}
          >
            <RefreshCw className={cn(busy && "animate-spin")} />
            {t("set.checkNow")}
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
          {t("set.versionLine", { version, line: line ?? "" })}
          {prefs.channel === "beta" && (
            <Badge variant="warning" size="sm" className="ml-2 align-middle">
              beta
            </Badge>
          )}
        </p>
        <Row label={t("set.checkUpdates")} hint={t("set.checkUpdates.hint")}>
          <Switch
            checked={prefs.check}
            aria-label={t("set.checkUpdates")}
            onCheckedChange={(check) => void configure({ ...prefs, check })}
          />
        </Row>
        <Row label={t("set.beta")} hint={t("set.beta.hint")}>
          <Switch
            checked={prefs.channel === "beta"}
            aria-label={t("set.beta")}
            onCheckedChange={(beta) =>
              void configure({ ...prefs, channel: beta ? "beta" : "latest" })
            }
          />
        </Row>
      </div>
    </Card>
  );
}

function UsageCard() {
  const t = useT();
  const usage = useWork((s) => s.usage);
  const configure = useWork((s) => s.configureUsage);
  if (!usage) return null;
  const line = !usage.available
    ? usage.reason
    : usage.share !== true
      ? t("usage.off")
      : usage.lastSent
        ? t("usage.lastSent", { at: new Date(usage.lastSent).toLocaleString() })
        : t("usage.first");

  return (
    <Card
      title={t("set.usage")}
      actions={
        <Button size="sm" variant="outline" onClick={openUsagePage}>
          {t("set.whatKept")}
        </Button>
      }
    >
      <div className="divide-y">
        <p className="pb-3 text-muted-foreground text-xs">{line}</p>
        <Row
          label={t("usage.share")}
          hint={t("set.shareUsage.hint", { host: new URL(usage.endpoint).host })}
        >
          <Switch
            checked={usage.share === true}
            disabled={!usage.available}
            aria-label={t("usage.share")}
            onCheckedChange={(share) => void configure(share)}
          />
        </Row>
        <ReportPreview className="pt-3" />
      </div>
    </Card>
  );
}

const LINKS = [
  { key: "set.about.website", url: "https://loud.trysometh.ing" },
  { key: "set.about.privacy", url: "https://loud.trysometh.ing/privacy.html" },
  { key: "set.about.source", url: "https://github.com/ptrgiang/loud" },
] as const;

function AboutCard() {
  const t = useT();
  const info = useLoud((s) => s.info);
  if (!info) return null;
  const open = (url: string) =>
    call("links.open", { url }).catch((e: unknown) =>
      useLoud.setState({ error: e instanceof Error ? e.message : String(e) }),
    );
  return (
    <Card title={t("set.about")}>
      <div className="divide-y">
        <Row
          label={`${info.name} ${info.version}`}
          hint={`${info.tagline} ${t("set.about.opensource")}`}
        />
        {LINKS.map((link) => (
          <Row key={link.key} label={t(link.key)} hint={link.url}>
            <Button size="sm" variant="outline" onClick={() => void open(link.url)}>
              <ExternalLink />
              {t("common.open")}
            </Button>
          </Row>
        ))}
      </div>
    </Card>
  );
}

export function SettingsView() {
  const t = useT();
  const loadCollect = useWork((s) => s.loadCollect);
  const loadAgent = useWork((s) => s.loadAgent);
  const loadProviders = useWork((s) => s.loadProviders);
  const loadUpdates = useWork((s) => s.loadUpdates);
  const loadUsage = useWork((s) => s.loadUsage);
  const ready = useWork((s) => s.collection !== null && s.agentSettings !== null);

  useEffect(() => {
    void loadCollect();
    void loadAgent();
    void loadProviders();
    void loadUpdates();
    void loadUsage();
  }, [loadCollect, loadAgent, loadProviders, loadUpdates, loadUsage]);

  return (
    <>
      <PageHeader title={t("nav.settings")} />
      <div className="flex-1 overflow-y-auto">
        {ready && (
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
            <General />
            <Collection />
            <AgentSettingsCard />
            <DataCard />
            <UpdatesCard />
            <UsageCard />
            <AboutCard />
          </div>
        )}
      </div>
    </>
  );
}
