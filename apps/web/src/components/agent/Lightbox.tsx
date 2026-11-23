import type { AgentAttachment } from "@loud/contracts";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useT } from "~/i18n";
import { call } from "~/lib/loud";
import { cn } from "~/lib/utils";

/**
 * Full-screen viewer for a chat's images. Arrow keys move through the list; Esc or a backdrop click closes.
 */
export function Lightbox({
  chatId,
  images,
  index,
  onClose,
  onNav,
}: {
  chatId: string;
  images: ReadonlyArray<AgentAttachment>;
  index: number;
  onClose: () => void;
  onNav: (i: number) => void;
}) {
  const t = useT();
  const a = images[index] ?? images[0];
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!a) return;
    let live = true;
    call("agent.attachment", { chatId, id: a.id }).then(
      (r) => live && setSrc(`data:${r.mime};base64,${r.data}`),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [chatId, a]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onNav((index - 1 + images.length) % images.length);
      else if (e.key === "ArrowRight") onNav((index + 1) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onNav]);

  const navBtn =
    "flex size-9 cursor-pointer items-center justify-center rounded-full bg-popover/90 text-popover-foreground shadow-md transition-opacity hover:bg-popover disabled:opacity-30 [&>svg]:size-5";
  if (!a) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={a.name}
      className="fixed inset-0 z-50 flex flex-col bg-black/75 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3 text-sm text-popover-foreground">
          <span className="truncate">{a.name}</span>
          <span className="shrink-0 text-popover-foreground/70 text-xs tabular-nums">
            {index + 1} / {images.length}
          </span>
        </div>
        <button
          type="button"
          aria-label={t("common.close")}
          title={t("common.close")}
          className={cn(navBtn, "size-8 [&>svg]:size-4")}
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-6">
        {images.length > 1 && (
          <button
            type="button"
            aria-label={t("ag.prevImage")}
            title={t("ag.prevImage")}
            className={cn(navBtn, "absolute left-4")}
            onClick={(e) => {
              e.stopPropagation();
              onNav((index - 1 + images.length) % images.length);
            }}
          >
            <ChevronLeft />
          </button>
        )}
        {src ? (
          <img
            src={src}
            alt={a.name}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="size-24 animate-pulse rounded-lg bg-popover/40" />
        )}
        {images.length > 1 && (
          <button
            type="button"
            aria-label={t("ag.nextImage")}
            title={t("ag.nextImage")}
            className={cn(navBtn, "absolute right-4")}
            onClick={(e) => {
              e.stopPropagation();
              onNav((index + 1) % images.length);
            }}
          >
            <ChevronRight />
          </button>
        )}
      </div>
    </div>
  );
}
