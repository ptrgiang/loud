import { Check, Download, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { useT } from "~/i18n";
import { relative } from "~/lib/format";
import { cn } from "~/lib/utils";
import { useWork } from "~/workStore";

const RING = 2 * Math.PI * 9;

/** The update's progress around the icon while it downloads. */
function Progress({ percent }: { percent: number }) {
  return (
    <span className="relative grid size-6 place-items-center">
      <svg aria-hidden className="absolute inset-0 size-full -rotate-90" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" fill="none" className="stroke-current/20" strokeWidth="1.5" />
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray={RING}
          strokeDashoffset={RING * (1 - Math.min(100, Math.max(0, percent)) / 100)}
        />
      </svg>
      <Download className="size-3" />
    </span>
  );
}

/**
 * As in T3 Code's sidebar: one small button checks for an update, shows the download, and turns into "Restart to
 * update" once it is ready. The full controls stay in Settings → Updates.
 */
export function UpdateButton({ rail }: { rail?: boolean }) {
  const t = useT();
  const status = useWork((s) => s.updates);
  const check = useWork((s) => s.checkUpdates);
  const loadUpdates = useWork((s) => s.loadUpdates);
  const [justChecked, setJustChecked] = useState(false);
  useEffect(() => void loadUpdates(), [loadUpdates]);

  // A tick for a moment after a check that found nothing, then back to the plain icon.
  const state = status?.state;
  const [last, setLast] = useState(state);
  if (last !== state) {
    setLast(state);
    if (last === "checking" && state === "none") setJustChecked(true);
  }
  useEffect(() => {
    if (!justChecked) return;
    const t = setTimeout(() => setJustChecked(false), 2500);
    return () => clearTimeout(t);
  }, [justChecked]);

  if (!status || state === "ready") return null;
  const title = !status.supported
    ? t("updates.unsupported")
    : state === "checking"
      ? t("updates.checking")
      : state === "downloading"
        ? t("updates.downloading", {
            version: status.version ?? t("updates.theUpdate"),
            percent: Math.round(status.progress ?? 0),
          })
        : state === "error"
          ? t("updates.failed", { error: status.error ?? t("updates.unknownError") })
          : state === "none"
            ? status.checkedAt
              ? t("updates.upToDateChecked", { when: relative(status.checkedAt) })
              : t("updates.upToDate")
            : t("updates.check");

  return (
    <button
      type="button"
      onClick={() => void check()}
      disabled={!status.supported || state === "checking" || state === "downloading"}
      aria-label={title}
      title={title}
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-md text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground disabled:cursor-default disabled:hover:bg-transparent [&>svg]:size-3.5",
        rail ? "h-8 w-full rounded-[var(--control-radius)] [&>svg]:size-4" : "size-6",
        state === "error" && "text-warning-foreground",
      )}
    >
      {state === "downloading" ? (
        <Progress percent={status.progress ?? 0} />
      ) : justChecked ? (
        <Check />
      ) : (
        <RefreshCw className={cn(state === "checking" && "animate-spin")} />
      )}
    </button>
  );
}

/**
 * Once an update is downloaded, a quiet row — same height and rhythm as the sidebar's other rows, marked by a
 * primary-tinted icon and label — instead of a solid pill that blips in and out.
 */
export function RestartToUpdate({ compact }: { compact?: boolean }) {
  const t = useT();
  const status = useWork((s) => s.updates);
  const install = useWork((s) => s.installUpdate);
  if (status?.state !== "ready") return null;
  const label = status.version
    ? t("updates.restartVersion", { version: status.version })
    : t("updates.restart");
  return compact ? (
    <button
      type="button"
      onClick={() => void install()}
      title={label}
      aria-label={label}
      className="flex h-8 w-full cursor-pointer items-center justify-center rounded-[var(--control-radius)] text-primary hover:bg-sidebar-row-hover [&>svg]:size-4"
    >
      <RotateCcw />
    </button>
  ) : (
    <button
      type="button"
      onClick={() => void install()}
      title={t("updates.restartTitle")}
      className="flex h-8 w-full cursor-pointer items-center gap-[var(--sidebar-control-gap)] rounded-[var(--control-radius)] border border-primary/25 bg-primary/8 px-[var(--sidebar-row-content-inset)] text-left font-medium text-primary text-sm hover:bg-primary/12 [&>svg]:size-4"
    >
      <RotateCcw />
      <span className="truncate">{label}</span>
    </button>
  );
}
