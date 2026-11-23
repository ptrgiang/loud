import {
  CHANNEL_IDS,
  CHANNEL_LIMITS,
  X_PREMIUM_LIMIT,
  CHANNEL_NAMES,
  type ChannelId,
  type Draft,
  DRAFT_IMAGES_MAX,
  DRAFT_VIDEOS_MAX,
} from "@loud/contracts";
import { postLength } from "@loud/shared/text";
import {
  Check,
  Copy,
  ExternalLink,
  Film,
  FolderOpen,
  ImagePlus,
  Images,
  Minus,
  NotebookPen,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { Segmented } from "~/components/Filters";
import { ChannelDot, ChannelTag, Empty, PageHeader } from "~/components/PageHeader";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useT, type MsgKey } from "~/i18n";
import {
  BLOCKS,
  blockLabel,
  blockOf,
  FEATURES,
  group,
  lift,
  median,
  MIN_SIDE,
  settled,
} from "~/lib/analytics";
import { FEATURE_LABEL } from "~/lib/features";
import { dec, fmt, relative } from "~/lib/format";
import { call } from "~/lib/loud";
import { toast } from "~/lib/toast";
import { cn } from "~/lib/utils";
import { useLoud } from "~/store";
import { useWork } from "~/workStore";

// The labels are UI; the asks stay English because they are prompts for the agent, not prose for the user.
const ASKS: ReadonlyArray<{ label: MsgKey; ask: (d: EditorDraft, limit: number) => string }> = [
  {
    label: "drafts.ask.tighten",
    ask: (d, limit) =>
      `Tighten this ${CHANNEL_NAMES[d.channel]} draft: keep the meaning, cut every word that does not earn its place, stay under ${limit} characters. Save it with save_draft${d.id ? ` using id ${d.id}` : ""}.\n\n${d.text}`,
  },
  {
    label: "drafts.ask.hooks",
    ask: (d) =>
      `Write three different opening lines for this ${CHANNEL_NAMES[d.channel]} draft, based on what has worked in my data. Show them; do not save.\n\n${d.text}`,
  },
  {
    label: "drafts.ask.adapt",
    ask: (d) =>
      `Adapt this ${CHANNEL_NAMES[d.channel]} draft for my other enabled channels, each in that channel's style and limit, and save each as a draft.\n\n${d.text}`,
  },
];

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

const say = (e: unknown) => toast("error", e instanceof Error ? e.message : String(e));

function Thumb({
  id,
  name,
  index,
  onMove,
}: {
  id: string;
  name: string;
  index: number;
  onMove: (name: string, before: string) => void;
}) {
  const t = useT();
  const changeDraft = useWork((s) => s.changeDraft);
  const act = "bg-popover/90 text-popover-foreground shadow-sm hover:bg-popover";
  return (
    <figure
      draggable
      title={t("drafts.dragOrder")}
      onDragStart={(e) => e.dataTransfer.setData("application/x-loud-image", name)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const n = e.dataTransfer.getData("application/x-loud-image");
        if (n && n !== name) {
          e.preventDefault();
          e.stopPropagation();
          onMove(n, name);
        }
      }}
      className="group relative size-28 shrink-0 cursor-grab overflow-hidden rounded-lg border bg-muted"
    >
      <img
        src={`${location.origin}/media/${id}/${name}`}
        alt={t("drafts.imageAlt", { n: index + 1 })}
        loading="lazy"
        className="size-full object-contain"
      />
      <span className="absolute top-1 left-1 rounded bg-popover/90 px-1 text-2xs tabular-nums">
        {index + 1}
      </span>
      <div className="absolute right-1 bottom-1 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Button
          size="icon-xs"
          variant="ghost"
          className={act}
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
          className={act}
          aria-label={t("drafts.showFolder")}
          title={t("drafts.showFolder")}
          onClick={() => void call("drafts.showImage", { id, name }).catch(say)}
        >
          <FolderOpen />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className={act}
          aria-label={t("drafts.removeImage")}
          title={t("drafts.removeImage")}
          onClick={() => void changeDraft(() => call("drafts.removeImage", { id, name }))}
        >
          <X />
        </Button>
      </div>
    </figure>
  );
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm)$/i;

function Video({ id, name }: { id: string; name: string }) {
  const t = useT();
  const changeDraft = useWork((s) => s.changeDraft);
  const act = "bg-popover/90 text-popover-foreground shadow-sm hover:bg-popover";
  return (
    <figure className="group relative w-56 shrink-0 overflow-hidden rounded-lg border bg-muted">
      <video
        controls
        preload="metadata"
        src={`${location.origin}/media/${id}/${name}`}
        className="h-28 w-full object-contain"
      />
      <div className="absolute right-1 bottom-1 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Button
          size="icon-xs"
          variant="ghost"
          className={act}
          aria-label={t("drafts.showFolder")}
          title={t("drafts.showFolder")}
          onClick={() => void call("drafts.showImage", { id, name }).catch(say)}
        >
          <FolderOpen />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className={act}
          aria-label={t("drafts.removeVideo")}
          title={t("drafts.removeVideo")}
          onClick={() => void changeDraft(() => call("drafts.removeVideo", { id, name }))}
        >
          <X />
        </Button>
      </div>
    </figure>
  );
}

function DraftMedia({ id }: { id: string | undefined }) {
  const t = useT();
  const draft = useWork((s) => s.drafts.find((x) => x.id === id));
  const images = draft?.images ?? [];
  const videos = draft?.videos ?? [];
  const changeDraft = useWork((s) => s.changeDraft);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const add = async (files: ReadonlyArray<File>) => {
    if (!id) return;
    for (const f of files) {
      const video = f.type.startsWith("video/") || VIDEO_EXT.test(f.name);
      if (!video && !f.type.startsWith("image/") && !IMAGE_EXT.test(f.name)) {
        toast("error", t("drafts.mediaRefused", { name: f.name }));
        continue;
      }
      const data = await readBase64(f);
      const ok = await changeDraft(() =>
        call(video ? "drafts.addVideo" : "drafts.addImage", { id, data }),
      );
      if (!ok) break;
    }
  };

  const drop = (e: React.DragEvent) => {
    // A thumb being dragged carries its own type; only real files land in the draft.
    if (e.dataTransfer.types.includes("application/x-loud-image")) return;
    e.preventDefault();
    setOver(false);
    void add([...e.dataTransfer.files]);
  };

  /** Moves `name` in front of `before` — the order this draft posts its images in. */
  const move = (name: string, before: string) => {
    if (!id) return;
    const next = images.filter((n) => n !== name);
    const at = next.indexOf(before);
    next.splice(at < 0 ? next.length : at, 0, name);
    void changeDraft(() => call("drafts.reorderImages", { id, names: next }));
  };

  const addClass =
    "flex size-28 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground text-xs hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 [&>svg]:size-4";

  return (
    <div
      className="flex flex-col gap-2"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Images className="size-3.5" />
        {t("drafts.media")}
        <span className="tabular-nums">
          {images.length} / {DRAFT_IMAGES_MAX}
          {videos.length ? ` · ${videos.length} / ${DRAFT_VIDEOS_MAX}` : ""}
        </span>
      </div>
      <div
        className={cn(
          "flex flex-wrap gap-2 rounded-lg",
          over && "outline-2 outline-ring/50 outline-dashed",
        )}
      >
        {id &&
          images.map((name, i) => <Thumb key={name} id={id} name={name} index={i} onMove={move} />)}
        {id && videos.map((name) => <Video key={name} id={id} name={name} />)}
        {images.length < DRAFT_IMAGES_MAX && (
          <button
            type="button"
            disabled={!id}
            title={id ? t("drafts.addFromComputer") : t("drafts.saveFirstTitle")}
            onClick={() => imageInput.current?.click()}
            className={addClass}
          >
            <ImagePlus />
            {id ? t("drafts.addImage") : t("drafts.saveFirst")}
          </button>
        )}
        {videos.length < DRAFT_VIDEOS_MAX && (
          <button
            type="button"
            disabled={!id}
            title={id ? t("drafts.addFromComputer") : t("drafts.saveFirstTitle")}
            onClick={() => videoInput.current?.click()}
            className={addClass}
          >
            <Film />
            {id ? t("drafts.addVideo") : t("drafts.saveFirst")}
          </button>
        )}
      </div>
      <input
        ref={imageInput}
        type="file"
        multiple
        hidden
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          void add(files);
        }}
      />
      <input
        ref={videoInput}
        type="file"
        multiple
        hidden
        accept="video/mp4,video/quicktime,video/webm"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          void add(files);
        }}
      />
    </div>
  );
}

/** What the channel's own settled posts say works: top feature lifts plus the best posting block. */
function ChannelPatterns({ channel, text }: { channel: ChannelId; text: string }) {
  const t = useT();
  const hub = useLoud((s) => s.hub);
  const list = useMemo(() => (hub ? settled(hub.posts, channel) : []), [hub, channel]);

  const feats = useMemo(
    () =>
      FEATURES.map((f) => ({ f, r: lift(list, f.test) }))
        .filter((x) => x.r.ratio !== null && x.r.ratio >= 1.5)
        .sort((a, b) => b.r.ratio! - a.r.ratio!)
        .slice(0, 3),
    [list],
  );
  const timing = useMemo(() => {
    const m = median(list.map((p) => p.views));
    if (m === null) return null;
    return (
      BLOCKS.map((b) => ({ b, ...group(list.filter((p) => blockOf(p) === b)) }))
        .filter((x) => x.n >= MIN_SIDE && x.median !== null && x.median >= 1.5 * m)
        .sort((a, b) => b.median! - a.median!)[0] ?? null
    );
  }, [list]);

  if (list.length < 2 * MIN_SIDE || (!feats.length && !timing)) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground"
      title={t("drafts.works.hint")}
    >
      <span className="inline-flex items-center gap-1 font-medium">
        <TrendingUp className="size-3" />
        {t("drafts.works", { name: CHANNEL_NAMES[channel] })}
      </span>
      {feats.map(({ f, r }) => (
        <span key={f.key} className="inline-flex items-center gap-1">
          {f.test(text) ? (
            <Check className="size-3 text-success-foreground" />
          ) : (
            <Minus className="size-3 opacity-50" />
          )}
          {t(FEATURE_LABEL[f.key])}
          <span className="font-semibold text-foreground tabular-nums">×{dec(r.ratio)}</span>
        </span>
      ))}
      {timing && (
        <span>
          {t("drafts.works.time", {
            block: blockLabel(timing.b),
            ratio: dec(timing.median! / (median(list.map((p) => p.views)) ?? 1)),
          })}
        </span>
      )}
    </div>
  );
}

interface EditorDraft {
  readonly id: string | undefined;
  readonly channel: ChannelId;
  readonly text: string;
  readonly note: string;
  readonly comment: string;
}

const blank = (channel: ChannelId): EditorDraft => ({
  id: undefined,
  channel,
  text: "",
  note: "",
  comment: "",
});

/** Lets the parent persist unsaved edits before switching drafts — nothing typed is dropped silently. */
export interface EditorHandle {
  readonly flush: () => Promise<void>;
}

function Editor({
  start,
  onSaved,
  ref,
}: {
  start: EditorDraft;
  onSaved: (d: Draft) => void;
  ref: React.Ref<EditorHandle>;
}) {
  const t = useT();
  const saveDraft = useWork((s) => s.saveDraft);
  const ask = useWork((s) => s.ask);
  const agentOn = useWork((s) => s.agentSettings?.enabled ?? false);
  const [d, setD] = useState(start);
  const hub = useLoud((s) => s.hub);
  const length = postLength(d.text, d.channel);
  const xPremium = d.channel === "x" && hub?.channels.find((c) => c.id === "x")?.premium === true;
  const limit = xPremium ? X_PREMIUM_LIMIT : CHANNEL_LIMITS[d.channel];
  const over = length > limit;
  const dirty =
    d.text !== start.text ||
    d.note !== start.note ||
    d.comment !== start.comment ||
    d.channel !== start.channel;

  const save = async (): Promise<Draft | null> => {
    const saved = await saveDraft({
      ...(d.id ? { id: d.id } : {}),
      channel: d.channel,
      text: d.text,
      note: d.note,
      // Always sent: "" is how the editor clears a comment that was set before.
      comment: d.comment.trim(),
    });
    if (saved) {
      setD({
        id: saved.id,
        channel: saved.channel,
        text: saved.text,
        note: saved.note,
        comment: saved.comment ?? "",
      });
      onSaved(saved);
    }
    return saved;
  };

  useImperativeHandle(
    ref,
    () => ({
      // Only a post with real text is worth keeping; an empty shell has nothing to lose.
      flush: async () => {
        if (dirty && d.text.trim()) await save();
      },
    }),
    [dirty, d, save],
  );

  /** Posting needs the draft on disk first: the window reads it by id. */
  const post = async () => {
    const id = dirty || !d.id ? (await save())?.id : d.id;
    if (id) void call("post.open", { id }).catch(say);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Segmented<ChannelId>
          label={t("filters.channel")}
          value={d.channel}
          options={CHANNEL_IDS.map((id) => ({
            value: id,
            label: (
              <span className="inline-flex items-center gap-1.5">
                <ChannelDot id={id} />
                {CHANNEL_NAMES[id]}
              </span>
            ),
          }))}
          onChange={(channel) => setD({ ...d, channel })}
        />
        <span className="flex items-baseline gap-1.5">
          {xPremium && (
            <span className="text-2xs text-muted-foreground">{t("drafts.premiumLimit")}</span>
          )}
          <span
            className={cn(
              "text-xs tabular-nums",
              over ? "text-error-foreground" : "text-muted-foreground",
            )}
          >
            {fmt(length)} / {fmt(limit)}
          </span>
        </span>
      </div>
      <ChannelPatterns channel={d.channel} text={d.text} />
      <Textarea
        value={d.text}
        rows={12}
        placeholder={t("drafts.placeholder", { name: CHANNEL_NAMES[d.channel] })}
        aria-label={t("drafts.textAria")}
        aria-invalid={over || undefined}
        onChange={(e) => setD({ ...d, text: e.target.value })}
      />
      <details className="group/extras rounded-lg">
        <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground [&::-webkit-details-marker]:hidden">
          <NotebookPen className="size-3.5" />
          {t("drafts.extras")}
          <span className="ml-auto group-open/extras:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="flex flex-col gap-2 pt-2">
          <Input
            size="sm"
            value={d.note}
            placeholder={t("drafts.notePlaceholder")}
            aria-label={t("drafts.noteAria")}
            onValueChange={(note) => setD({ ...d, note })}
          />
          <Textarea
            value={d.comment}
            rows={2}
            placeholder={t("drafts.commentPlaceholder")}
            aria-label={t("drafts.commentAria")}
            onChange={(e) => setD({ ...d, comment: e.target.value })}
          />
        </div>
      </details>
      <DraftMedia id={d.id} />
      <div className="sticky bottom-0 -mx-6 flex flex-col gap-3 border-t bg-background px-6 pt-3 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            disabled={!d.text.trim() || !dirty || over}
            title={over ? t("drafts.overLimit", { name: CHANNEL_NAMES[d.channel] }) : undefined}
            onClick={() => void save()}
          >
            {t("drafts.save")}
          </Button>
          <Button size="sm" disabled={!d.text.trim() || over} onClick={() => void post()}>
            <ExternalLink />
            {t("drafts.post", { name: CHANNEL_NAMES[d.channel] })}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Sparkles className="size-3.5 text-muted-foreground" />
          <span className="mr-1 text-muted-foreground text-xs">{t("drafts.askAgent")}</span>
          {ASKS.map((a) => (
            <Button
              key={a.label}
              size="xs"
              variant="outline"
              disabled={!d.text.trim()}
              onClick={() => void ask(a.ask(d, limit))}
            >
              {t(a.label)}
            </Button>
          ))}
          {!agentOn && (
            <span className="text-2xs text-muted-foreground">{t("drafts.agentOff")}</span>
          )}
        </div>
        <p className="text-2xs text-muted-foreground">{t("drafts.footer")}</p>
      </div>
    </div>
  );
}

export function DraftsView() {
  const t = useT();
  const drafts = useWork((s) => s.drafts);
  const loadDrafts = useWork((s) => s.loadDrafts);
  const loadAgent = useWork((s) => s.loadAgent);
  const deleteDraft = useWork((s) => s.deleteDraft);
  const first = useLoud((s) => s.info?.channels[0]?.id) ?? "threads";
  const [selected, setSelected] = useState<EditorDraft | null>(null);
  const [sure, setSure] = useState(false);
  const editor = useRef<EditorHandle>(null);

  useEffect(() => {
    void loadDrafts();
    void loadAgent();
  }, [loadDrafts, loadAgent]);
  useEffect(() => {
    if (!sure) return;
    const id = setTimeout(() => setSure(false), 4000);
    return () => clearTimeout(id);
  }, [sure]);

  const asEditor = (d: Draft): EditorDraft => ({ ...d, comment: d.comment ?? "" });
  const current = selected ?? (drafts[0] ? asEditor(drafts[0]) : null);
  // Swapping the editor drops its state; save first so typing is never silently lost.
  const choose = async (next: EditorDraft) => {
    await editor.current?.flush();
    setSelected(next);
    setSure(false);
  };

  return (
    <>
      <PageHeader title={t("nav.drafts")} description={t("drafts.description")}>
        {current && (
          <Button size="sm" variant="outline" onClick={() => void choose(blank(first))}>
            <Plus />
            {t("drafts.new")}
          </Button>
        )}
      </PageHeader>
      {!current ? (
        <Empty
          icon={<NotebookPen />}
          accent="primary"
          title={t("drafts.empty")}
          action={
            <Button size="sm" onClick={() => void choose(blank(first))}>
              <Plus />
              {t("drafts.new")}
            </Button>
          }
        >
          {t("drafts.emptyHint")}
        </Empty>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ul className="w-72 shrink-0 divide-y overflow-y-auto border-r">
            {drafts.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  data-active={current.id === d.id}
                  onClick={() => current.id !== d.id && void choose(asEditor(d))}
                  className="flex w-full cursor-pointer flex-col gap-1 px-4 py-3 text-left hover:bg-accent data-[active=true]:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <ChannelTag id={d.channel} />
                    {d.by === "agent" && <Badge variant="outline">agent</Badge>}
                  </div>
                  <div className="line-clamp-2 text-sm">{d.text || t("drafts.emptyText")}</div>
                  <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                    {relative(d.updated)}
                    {d.images?.length ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Images className="size-3" />
                        {d.images.length}
                      </span>
                    ) : null}
                    {d.videos?.length ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Film className="size-3" />
                        {d.videos.length}
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-6">
              {current.id && (
                <div className="flex justify-end">
                  <Button
                    size="xs"
                    variant={sure ? "destructive" : "ghost-muted"}
                    onClick={async () => {
                      if (!sure) {
                        setSure(true);
                        return;
                      }
                      setSure(false);
                      await deleteDraft(current.id!);
                      setSelected(null);
                    }}
                  >
                    <Trash2 />
                    {sure ? t("drafts.deleteSure") : t("common.delete")}
                  </Button>
                </div>
              )}
              <Editor
                key={current.id ?? "new"}
                ref={editor}
                start={current}
                onSaved={(d) => setSelected(asEditor(d))}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
