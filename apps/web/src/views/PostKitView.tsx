// The left pane of the posting window: everything in the draft, each with its own copy or show-in-folder button, so
// it can go straight into the composer open on the right. No sidebar, no chrome — it lives next to a web page.
import { CHANNEL_NAMES, type Draft } from "@loud/contracts";
import { Dialog } from "@base-ui/react/dialog";
import {
  CalendarClock,
  Check,
  Copy,
  Film,
  FolderOpen,
  Loader2,
  MessageSquarePlus,
  NotebookPen,
  Send,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ChannelTag } from "~/components/PageHeader";
import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";
import { call } from "~/lib/loud";
import { cn } from "~/lib/utils";
import { toast } from "~/lib/toast";
import { useWork } from "~/workStore";

const say = (e: unknown) => toast("error", e instanceof Error ? e.message : String(e));

function KitImage({ id, name, index }: { id: string; name: string; index: number }) {
  const t = useT();
  return (
    <figure className="relative overflow-hidden rounded-lg border bg-muted">
      <img
        src={`${location.origin}/media/${id}/${name}`}
        alt={t("drafts.imageAlt", { n: index + 1 })}
        loading="lazy"
        className="max-h-48 w-full object-contain"
      />
      <div className="absolute right-1 bottom-1 flex gap-1">
        <Button
          size="icon-xs"
          variant="ghost"
          className="bg-popover/90 shadow-sm hover:bg-popover"
          aria-label={t("drafts.copyImage")}
          title={t("drafts.copyImageTitle")}
          onClick={() =>
            void call("drafts.copyImage", { id, name }).then(
              () => toast("done", t("drafts.imageCopied")),
              say,
            )
          }
        >
          <Copy />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className="bg-popover/90 shadow-sm hover:bg-popover"
          aria-label={t("drafts.showFolder")}
          title={t("drafts.showFolder")}
          onClick={() => void call("drafts.showImage", { id, name }).catch(say)}
        >
          <FolderOpen />
        </Button>
      </div>
    </figure>
  );
}

/** One labelled block of the draft — caption or comment — with its own copy button. */
function Block({ label, icon, text }: { label: string; icon: React.ReactNode; text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-2xs uppercase tracking-wide">
          {icon}
          {label}
        </span>
        <Button
          size="xs"
          variant="outline"
          onClick={() =>
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            })
          }
        >
          {copied ? <Check /> : <Copy />}
          {copied ? t("common.copied") : t("common.copy")}
        </Button>
      </div>
      <div className="rounded-lg border bg-card px-3 py-2.5 text-sm whitespace-pre-wrap">
        {text}
      </div>
    </section>
  );
}

/** The right edge of the pane doubles as the split's drag handle: the poster clamps and applies the width. */
function DragHandle() {
  const t = useT();
  const last = useRef(0);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("post.resize")}
      title={t("post.resize")}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        const now = performance.now();
        if (now - last.current < 40) return;
        last.current = now;
        void call("post.paneWidth", { width: e.clientX }).catch(() => undefined);
      }}
      onPointerUp={() => setDragging(false)}
      className={cn(
        "fixed inset-y-0 right-0 z-10 w-2 cursor-col-resize border-border border-l bg-transparent transition-colors hover:bg-primary/10",
        dragging && "bg-primary/15",
      )}
    />
  );
}

/** The automation row: shown when the channel has a driver and posting.auto is on. Confirm happens here, not in the page. */
function AutoPost({ id, draft }: { id: string; draft: Draft }) {
  const t = useT();
  const [capable, setCapable] = useState<{ schedule: boolean; media: boolean } | null>(null);
  const [confirming, setConfirming] = useState<"now" | "schedule" | null>(null);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"posted" | "scheduled" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void call("post.capable", { id }).then(setCapable, () =>
      setCapable({ schedule: false, media: false }),
    );
  }, [id]);

  const run = async (schedule?: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await call("post.publish", { id, ...(schedule ? { schedule } : {}) });
      setDone(r.result);
      const suffix = r.missing?.length ? ` ${t("post.missing", { list: r.missing.join(", ") })}` : "";
      toast("done", t(r.result === "posted" ? "post.postedDone" : "post.scheduledDone") + suffix);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      say(e);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  if (done)
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-success/40 bg-success/8 px-3 py-2.5">
        <span className="text-sm text-success-foreground">
          {done === "posted" ? t("post.postedDone") : t("post.scheduledDone")}
        </span>
        <Button size="xs" variant="outline" onClick={() => window.close()}>
          {t("post.close")}
        </Button>
      </div>
    );

  const mediaCount = (draft.images?.length ?? 0) + (draft.videos?.length ?? 0);

  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <span className="font-medium text-muted-foreground text-2xs uppercase tracking-wide">
        {t("post.auto")}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => setConfirming("now")}>
          {busy ? <Loader2 className="animate-spin" /> : <Send />}
          {t("post.publishNow")}
        </Button>
        {capable?.schedule && (
          <>
            <input
              type="datetime-local"
              value={when}
              aria-label={t("post.scheduleAt")}
              onChange={(e) => setWhen(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !when}
              onClick={() => setConfirming("schedule")}
            >
              <CalendarClock />
              {t("post.schedule")}
            </Button>
          </>
        )}
      </div>
      <Dialog.Root open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/32 backdrop-blur-[1px]" />
          <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-popover p-5 text-popover-foreground shadow-lg/8 outline-none">
            <Dialog.Title className="font-semibold text-base">
              {confirming === "schedule" ? t("post.confirmSchedule") : t("post.confirmTitle")}
            </Dialog.Title>
            <Dialog.Description
              render={<div />}
              className="mt-1.5 text-muted-foreground text-sm leading-relaxed"
            >
              <div className="flex flex-col gap-2">
                <p className="line-clamp-3 whitespace-pre-wrap rounded-md border bg-card p-2 text-foreground text-xs">
                  {draft.text}
                </p>
                <p>
                  {confirming === "schedule"
                    ? t("post.confirmScheduleBody", {
                        at: when ? new Date(when).toLocaleString() : "",
                        name: CHANNEL_NAMES[draft.channel],
                      })
                    : t("post.confirmBody", {
                        name: CHANNEL_NAMES[draft.channel],
                        media: mediaCount ? t("post.confirmMedia", { n: mediaCount }) : "",
                      })}
                </p>
                {(draft.topic || draft.reply || draft.community) && (
                  <p className="text-2xs">
                    {[
                      draft.topic && t("drafts.extrasTopic", { topic: draft.topic }),
                      draft.reply === "followers" && t("drafts.replyFollowers"),
                      draft.reply === "mentioned" && t("drafts.replyMentioned"),
                      draft.community && t("drafts.extrasCommunity", { name: draft.community }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirming(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(
                    confirming === "schedule" && when ? new Date(when).toISOString() : undefined,
                  )
                }
              >
                {busy ? <Loader2 className="animate-spin" /> : <Send />}
                {confirming === "schedule" ? t("post.schedule") : t("post.publishNow")}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      {error && <p className="text-2xs text-error-foreground">{error}</p>}
    </section>
  );
}

export function PostKitView({ id }: { id: string }) {
  const t = useT();
  const drafts = useWork((s) => s.drafts);
  const loadDrafts = useWork((s) => s.loadDrafts);
  const [auto, setAuto] = useState<boolean | null>(null);
  useEffect(() => void loadDrafts(), [loadDrafts]);
  useEffect(() => {
    void call("posting.settings", {}).then(
      (s) => setAuto(s.auto),
      () => setAuto(false),
    );
  }, []);
  const d = drafts.find((x) => x.id === id);

  if (!d)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <NotebookPen className="size-5 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">{t("post.gone")}</p>
        <Button size="sm" variant="outline" onClick={() => window.close()}>
          {t("post.close")}
        </Button>
      </div>
    );

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto bg-background p-4">
      <header className="flex items-center justify-between gap-2">
        <ChannelTag id={d.channel} />
        <span className="font-semibold text-sm">
          {t("post.title", { name: CHANNEL_NAMES[d.channel] })}
        </span>
      </header>
      {d.note && <p className="text-muted-foreground text-2xs">{d.note}</p>}
      <Block label={t("post.caption")} icon={<NotebookPen className="size-3" />} text={d.text} />
      {d.comment && (
        <Block
          label={t("post.comment")}
          icon={<MessageSquarePlus className="size-3" />}
          text={d.comment}
        />
      )}
      {d.images?.length ? (
        <section className="flex flex-col gap-1.5">
          <span className="font-medium text-muted-foreground text-2xs uppercase tracking-wide">
            {t("drafts.images")} · {d.images.length}
          </span>
          {d.images.map((name, i) => (
            <KitImage key={name} id={d.id} name={name} index={i} />
          ))}
        </section>
      ) : null}
      {d.videos?.length ? (
        <section className="flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-2xs uppercase tracking-wide">
            <Film className="size-3" />
            {t("drafts.videos")} · {d.videos.length}
          </span>
          {d.videos.map((name) => (
            <figure key={name} className="relative overflow-hidden rounded-lg border bg-muted">
              <video
                controls
                preload="metadata"
                src={`${location.origin}/media/${d.id}/${name}`}
                className="max-h-48 w-full object-contain"
              />
              <div className="absolute right-1 bottom-1">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="bg-popover/90 shadow-sm hover:bg-popover"
                  aria-label={t("drafts.showFolder")}
                  title={t("drafts.showFolder")}
                  onClick={() => void call("drafts.showImage", { id: d.id, name }).catch(say)}
                >
                  <FolderOpen />
                </Button>
              </div>
            </figure>
          ))}
        </section>
      ) : null}
      {auto === true && !d.posted && !d.scheduledAt && <AutoPost id={id} draft={d} />}
      <p className="mt-auto text-2xs text-muted-foreground">{t("post.hint")}</p>
      <DragHandle />
    </div>
  );
}
