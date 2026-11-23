// The left pane of the posting window: everything in the draft, each with its own copy or show-in-folder button, so
// it can go straight into the composer open on the right. No sidebar, no chrome — it lives next to a web page.
import { CHANNEL_NAMES } from "@loud/contracts";
import { Check, Copy, FolderOpen, MessageSquarePlus, NotebookPen } from "lucide-react";
import { useEffect, useState } from "react";

import { ChannelTag } from "~/components/PageHeader";
import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";
import { call } from "~/lib/loud";
import { toast } from "~/lib/toast";
import { useWork } from "~/workStore";

const say = (e: unknown) => toast("error", e instanceof Error ? e.message : String(e));

function KitImage({ id, name, index }: { id: string; name: string; index: number }) {
  const t = useT();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    call("drafts.image", { id, name }).then(
      (r) => live && setSrc(`data:${r.mime};base64,${r.data}`),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [id, name]);
  return (
    <figure className="relative overflow-hidden rounded-lg border bg-muted">
      {src && (
        <img
          src={src}
          alt={t("drafts.imageAlt", { n: index + 1 })}
          className="max-h-48 w-full object-contain"
        />
      )}
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

export function PostKitView({ id }: { id: string }) {
  const t = useT();
  const drafts = useWork((s) => s.drafts);
  const loadDrafts = useWork((s) => s.loadDrafts);
  useEffect(() => void loadDrafts(), [loadDrafts]);
  const d = drafts.find((x) => x.id === id);

  if (!d)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-background p-6 text-center">
        <NotebookPen className="size-5 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">{t("post.gone")}</p>
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
      <p className="mt-auto text-2xs text-muted-foreground">{t("post.hint")}</p>
    </div>
  );
}
