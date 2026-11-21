import {
  CHANNEL_IDS,
  CHANNEL_LIMITS,
  CHANNEL_NAMES,
  type ChannelId,
  type Draft,
  DRAFT_IMAGES_MAX,
} from "@loud/contracts";
import { postLength } from "@loud/shared/text";
import {
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  ImagePlus,
  Images,
  NotebookPen,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Segmented } from "~/components/Filters";
import { ChannelDot, ChannelTag, Empty, PageHeader } from "~/components/PageHeader";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { call } from "~/lib/loud";
import { toast } from "~/lib/toast";
import { cn } from "~/lib/utils";
import { useLoud } from "~/store";
import { useWork } from "~/workStore";

/** Where the user posts it themselves. X and Threads take the text in their own share intent. */
const composer = (id: ChannelId, text: string) =>
  ({
    x: `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
    threads: `https://www.threads.com/intent/post?text=${encodeURIComponent(text)}`,
    ig: "https://www.instagram.com/",
    fb: "https://business.facebook.com/latest/composer",
  })[id];

const ASKS: ReadonlyArray<{ label: string; ask: (d: EditorDraft) => string }> = [
  {
    label: "Tighten",
    ask: (d) =>
      `Tighten this ${CHANNEL_NAMES[d.channel]} draft: keep the meaning, cut every word that does not earn its place, stay under ${CHANNEL_LIMITS[d.channel]} characters. Save it with save_draft${d.id ? ` using id ${d.id}` : ""}.\n\n${d.text}`,
  },
  {
    label: "3 opening lines",
    ask: (d) =>
      `Write three different opening lines for this ${CHANNEL_NAMES[d.channel]} draft, based on what has worked in my data. Show them; do not save.\n\n${d.text}`,
  },
  {
    label: "Adapt for other channels",
    ask: (d) =>
      `Adapt this ${CHANNEL_NAMES[d.channel]} draft for my other enabled channels, each in that channel's style and limit, and save each as a draft.\n\n${d.text}`,
  },
];

/** Only Codex has an image tool; Claude Code is asked for a description instead. */
const imageAsk = (d: EditorDraft, canMake: boolean) =>
  canMake
    ? `Make one image for this ${CHANNEL_NAMES[d.channel]} post, in the style of my best posts. Attach it with save_draft${d.id ? ` using id ${d.id} and the same text` : ""}.\n\n${d.text}`
    : `Describe the image this ${CHANNEL_NAMES[d.channel]} post should carry (what it shows, any text on it, the format), so I can make it. Do not save.\n\n${d.text}`;

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

const say = (e: unknown) => toast("error", e instanceof Error ? e.message : String(e));

function Thumb({ id, name, index }: { id: string; name: string; index: number }) {
  const changeDraft = useWork((s) => s.changeDraft);
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
  const act = "bg-popover/90 text-popover-foreground shadow-sm hover:bg-popover";
  return (
    <figure className="group relative size-28 shrink-0 overflow-hidden rounded-lg border bg-muted">
      {src && <img src={src} alt={`Image ${index + 1}`} className="size-full object-contain" />}
      <span className="absolute top-1 left-1 rounded bg-popover/90 px-1 text-2xs tabular-nums">
        {index + 1}
      </span>
      <div className="absolute right-1 bottom-1 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Button
          size="icon-xs"
          variant="ghost"
          className={act}
          aria-label="Copy image"
          title="Copy the image, then paste it into the platform's composer"
          onClick={() =>
            void call("drafts.copyImage", { id, name }).then(
              () => toast("done", "Image copied"),
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
          aria-label="Show in folder"
          title="Show in folder"
          onClick={() => void call("drafts.showImage", { id, name }).catch(say)}
        >
          <FolderOpen />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className={act}
          aria-label="Remove image"
          title="Remove image"
          onClick={() => void changeDraft(() => call("drafts.removeImage", { id, name }))}
        >
          <X />
        </Button>
      </div>
    </figure>
  );
}

function DraftImages({ id }: { id: string | undefined }) {
  const images = useWork((s) => s.drafts.find((x) => x.id === id)?.images) ?? [];
  const changeDraft = useWork((s) => s.changeDraft);
  const input = useRef<HTMLInputElement>(null);
  const add = async (files: ReadonlyArray<File>) => {
    if (!id) return;
    for (const f of files) {
      const data = await readBase64(f);
      if (!(await changeDraft(() => call("drafts.addImage", { id, data })))) break;
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Images className="size-3.5" />
        Images
        <span className="tabular-nums">
          {images.length} / {DRAFT_IMAGES_MAX}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {id && images.map((name, i) => <Thumb key={name} id={id} name={name} index={i} />)}
        {images.length < DRAFT_IMAGES_MAX && (
          <button
            type="button"
            disabled={!id}
            title={id ? "Add images from this computer" : "Save the draft first"}
            onClick={() => input.current?.click()}
            className="flex size-28 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground text-xs hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 [&>svg]:size-4"
          >
            <ImagePlus />
            {id ? "Add image" : "Save first"}
          </button>
        )}
      </div>
      <input
        ref={input}
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
    </div>
  );
}

interface EditorDraft {
  readonly id: string | undefined;
  readonly channel: ChannelId;
  readonly text: string;
  readonly note: string;
}

const blank = (channel: ChannelId): EditorDraft => ({ id: undefined, channel, text: "", note: "" });

function Editor({ start, onSaved }: { start: EditorDraft; onSaved: (d: Draft) => void }) {
  const saveDraft = useWork((s) => s.saveDraft);
  const ask = useWork((s) => s.ask);
  const agentOn = useWork((s) => s.agentSettings?.enabled ?? false);
  const canMake = useWork((s) => s.agentSettings?.provider === "codex");
  const [d, setD] = useState(start);
  const [copied, setCopied] = useState(false);
  const length = postLength(d.text, d.channel);
  const limit = CHANNEL_LIMITS[d.channel];
  const over = length > limit;
  const dirty = d.text !== start.text || d.note !== start.note || d.channel !== start.channel;

  const save = async () => {
    const saved = await saveDraft({
      ...(d.id ? { id: d.id } : {}),
      channel: d.channel,
      text: d.text,
      note: d.note,
    });
    if (saved) {
      setD({ id: saved.id, channel: saved.channel, text: saved.text, note: saved.note });
      onSaved(saved);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Segmented<ChannelId>
          label="Channel"
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
        <span
          className={cn(
            "text-xs tabular-nums",
            over ? "text-error-foreground" : "text-muted-foreground",
          )}
        >
          {length.toLocaleString("en-US")} / {limit.toLocaleString("en-US")}
        </span>
      </div>
      <Textarea
        value={d.text}
        rows={12}
        placeholder={`Write the ${CHANNEL_NAMES[d.channel]} post…`}
        aria-label="Post text"
        aria-invalid={over || undefined}
        onChange={(e) => setD({ ...d, text: e.target.value })}
      />
      <Input
        size="sm"
        value={d.note}
        placeholder="Note to yourself: what this post is for"
        aria-label="Note"
        onValueChange={(note) => setD({ ...d, note })}
      />
      <DraftImages id={d.id} />
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" disabled={!d.text.trim() || !dirty} onClick={() => void save()}>
          Save draft
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!d.text.trim()}
          onClick={() =>
            void navigator.clipboard.writeText(d.text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            })
          }
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!d.text.trim() || over}
          onClick={() => void call("links.open", { url: composer(d.channel, d.text) })}
        >
          <ExternalLink />
          Open {CHANNEL_NAMES[d.channel]}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
        <Sparkles className="size-3.5 text-muted-foreground" />
        <span className="mr-1 text-muted-foreground text-xs">Ask the agent</span>
        {ASKS.map((a) => (
          <Button
            key={a.label}
            size="xs"
            variant="outline"
            disabled={!d.text.trim()}
            onClick={() => void ask(a.ask(d))}
          >
            {a.label}
          </Button>
        ))}
        <Button
          size="xs"
          variant="outline"
          disabled={!d.text.trim()}
          title={
            canMake
              ? "Codex makes the image and adds it to this draft"
              : "Claude Code cannot make images; it describes one"
          }
          onClick={() => void ask(imageAsk(d, canMake))}
        >
          {canMake ? "Make an image" : "Describe an image"}
        </Button>
        {!agentOn && (
          <span className="text-2xs text-muted-foreground">(turn the agent on in Settings)</span>
        )}
      </div>
      <p className="text-2xs text-muted-foreground">
        Loud never posts. Open the platform, paste or check the text, add the images (copy one, or
        show the folder) and post it yourself.
      </p>
    </div>
  );
}

export function DraftsView() {
  const drafts = useWork((s) => s.drafts);
  const loadDrafts = useWork((s) => s.loadDrafts);
  const loadAgent = useWork((s) => s.loadAgent);
  const deleteDraft = useWork((s) => s.deleteDraft);
  const first = useLoud((s) => s.info?.channels[0]?.id) ?? "threads";
  const [selected, setSelected] = useState<EditorDraft | null>(null);

  useEffect(() => {
    void loadDrafts();
    void loadAgent();
  }, [loadDrafts, loadAgent]);

  const current = selected ?? (drafts[0] ? { ...drafts[0] } : null);

  return (
    <>
      <PageHeader title="Drafts" description="Posts you are writing, kept on this computer.">
        {current && (
          <Button size="sm" variant="outline" onClick={() => setSelected(blank(first))}>
            <Plus />
            New draft
          </Button>
        )}
      </PageHeader>
      {!current ? (
        <Empty
          icon={<NotebookPen />}
          title="No drafts yet"
          action={
            <Button size="sm" onClick={() => setSelected(blank(first))}>
              <Plus />
              New draft
            </Button>
          }
        >
          Write one here, or ask the agent to write from your best posts.
        </Empty>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ul className="w-72 shrink-0 divide-y overflow-y-auto border-r">
            {drafts.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  data-active={current.id === d.id}
                  onClick={() => setSelected({ ...d })}
                  className="flex w-full cursor-pointer flex-col gap-1 px-4 py-3 text-left hover:bg-accent data-[active=true]:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <ChannelTag id={d.channel} />
                    {d.by === "agent" && <Badge variant="outline">agent</Badge>}
                  </div>
                  <div className="line-clamp-2 text-sm">{d.text || "(empty)"}</div>
                  <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                    {d.updated}
                    {d.images?.length ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Images className="size-3" />
                        {d.images.length}
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
                    variant="ghost-muted"
                    onClick={() => {
                      void deleteDraft(current.id!);
                      setSelected(null);
                    }}
                  >
                    <Trash2 />
                    Delete
                  </Button>
                </div>
              )}
              <Editor
                key={`${current.id ?? "new"}:${drafts.find((x) => x.id === current.id)?.updated ?? ""}`}
                start={current}
                onSaved={(d) => setSelected({ ...d })}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
