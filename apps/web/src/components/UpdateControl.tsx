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
export function UpdateButton() {
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
        "flex size-6 cursor-pointer items-center justify-center rounded-md text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground disabled:cursor-default disabled:hover:bg-transparent [&>svg]:size-3.5",
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

/** Replaces the status line once an update is downloaded: one click installs it and reopens Loud. */
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
      className="flex h-8 w-full cursor-pointer items-center justify-center rounded-[var(--control-radius)] bg-primary text-primary-foreground hover:bg-primary/90 [&>svg]:size-4"
    >
      <RotateCcw />
    </button>
  ) : (
    <button
      type="button"
      onClick={() => void install()}
      title={t("updates.restartTitle")}
      className="flex h-7 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-primary px-3 font-medium text-primary-foreground text-xs hover:bg-primary/90 [&>svg]:size-3.5"
    >
      <RotateCcw />
      {label}
    </button>
  );
}
