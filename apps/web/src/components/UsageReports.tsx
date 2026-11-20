import { Dialog } from "@base-ui/react/dialog";
import { USAGE_PAGE, type UsageReport } from "@loud/contracts";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { call } from "~/lib/loud";
import { cn } from "~/lib/utils";
import { useWork } from "~/workStore";

const SENT = [
  "Loud's version, your OS and processor type",
  "Which platforms are connected and included in runs",
  "How many collection runs worked, failed or stopped at a login check or rate limit",
  "Whether the agent and update checks are on",
  "A random install id, made on this computer",
];
const NEVER = [
  "Handles, page names, posts or any number from your accounts",
  "Anything you typed, drafts, or what the agent said",
  "Your IP address: the server does not store it",
];

export function openUsagePage() {
  void call("links.open", { url: USAGE_PAGE });
}

/** The report exactly as it would be sent now, fetched when opened so it reflects the current counts. */
export function ReportPreview({ className }: { className?: string }) {
  const preview = useWork((s) => s.previewUsage);
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<UsageReport | null>(null);
  useEffect(() => {
    if (open) void preview().then(setReport);
  }, [open, preview]);

  return (
    <div className={className}>
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        See the exact report
      </button>
      {open && (
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-[11px] text-muted-foreground leading-relaxed">
          {report ? JSON.stringify(report, null, 2) : "…"}
        </pre>
      )}
    </div>
  );
}

function List({ title, items }: { title: string; items: ReadonlyArray<string> }) {
  return (
    <div>
      <div className="font-medium text-xs">{title}</div>
      <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-muted-foreground text-xs leading-relaxed">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

/** Asked once, before anything is counted. Closing it without an answer asks again next launch. */
export function UsageQuestion() {
  const usage = useWork((s) => s.usage);
  const configure = useWork((s) => s.configureUsage);
  const [later, setLater] = useState(false);
  const open = !later && usage !== null && usage.available && usage.share === null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && setLater(true)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/32 backdrop-blur-[1px]" />
        <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-4rem)] w-[min(34rem,calc(100vw-2rem))] flex-col overflow-y-auto rounded-xl border bg-popover p-5 text-popover-foreground shadow-lg/8 outline-none">
          <Dialog.Title className="font-semibold text-base">Share usage with Loud?</Dialog.Title>
          <Dialog.Description className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
            If you agree, Loud sends one small report a day to loud.trysometh.ing. It tells us how
            many people use Loud and whether collecting still works on each platform, so we know
            what to fix first. The totals are public on the site.
          </Dialog.Description>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <List title="What is sent" items={SENT} />
            <List title="Never sent" items={NEVER} />
          </div>
          <ReportPreview className="mt-4" />
          <p className="mt-4 text-muted-foreground text-xs">
            Nothing is counted or sent unless you choose Share. You can change this any time in
            Settings.{" "}
            <button
              type="button"
              className="cursor-pointer text-foreground underline-offset-2 hover:underline"
              onClick={openUsagePage}
            >
              How the data is kept
            </button>
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => void configure(false)}>
              Don't share
            </Button>
            <Button onClick={() => void configure(true)}>Share usage</Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
