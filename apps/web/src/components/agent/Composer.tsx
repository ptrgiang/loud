import { AGENT_LIMITS, type AgentUpload } from "@loud/contracts";
import { ArrowUp, FileText, Paperclip, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { EffortMenu, ModelMenu } from "~/components/agent/ModelMenu";
import { UsageMeter } from "~/components/agent/UsageMeter";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useWork } from "~/workStore";

const IMAGE = /^image\/(png|jpeg|gif|webp)$/;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|ya?ml|xml|html?|log)$/i;

interface Pending {
  readonly key: string;
  readonly file: File;
  readonly kind: "image" | "text";
  /** Object URL for an image's thumbnail. */
  readonly preview: string | null;
}

/** The same rule as the desktop's, so a refusal shows before anything is sent. */
function accept(file: File): { kind: "image" | "text" } | { error: string } {
  if (IMAGE.test(file.type))
    return file.size > AGENT_LIMITS.imageBytes
      ? { error: `${file.name} is over 5 MB` }
      : { kind: "image" };
  if (file.type.startsWith("text/") || file.type === "application/json" || TEXT_EXT.test(file.name))
    return file.size > AGENT_LIMITS.textBytes
      ? { error: `${file.name} is over 256 KB` }
      : { kind: "text" };
  return { error: `${file.name}: only images and text files can be attached` };
}

const toUpload = (file: File) =>
  new Promise<AgentUpload>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () =>
      resolve({
        name: file.name,
        mime: file.type,
        data: String(r.result).replace(/^data:[^,]*,/, ""),
      });
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

const size = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${Math.round(n / 1024)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;

export function Composer({ vendor }: { vendor: { name: string; vendor: string } }) {
  const agent = useWork((s) => s.agent);
  const providers = useWork((s) => s.providers);
  const send = useWork((s) => s.send);
  const cancel = useWork((s) => s.cancel);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<ReadonlyArray<Pending>>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const live = useRef(files);
  useEffect(() => {
    live.current = files;
  }, [files]);
  useEffect(
    () => () => live.current.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)),
    [],
  );
  const drop = (keep: (f: Pending) => boolean) => {
    for (const f of files) if (!keep(f) && f.preview) URL.revokeObjectURL(f.preview);
    setFiles(files.filter(keep));
  };
  // Grow with the text up to a limit, like T3 Code's composer.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    if (text) el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  if (!agent) return null;
  const busy = agent.busy;
  const provider = providers.find((p) => p.id === agent.provider);
  const model = provider?.models.find((m) => m.id === agent.model);
  const locked = agent.messages.length > 0;

  const add = (list: Iterable<File>) => {
    const next = [...files];
    for (const file of list) {
      if (next.length >= AGENT_LIMITS.files) {
        setProblem(`Attach at most ${AGENT_LIMITS.files} files.`);
        break;
      }
      const a = accept(file);
      if ("error" in a) {
        setProblem(a.error);
        continue;
      }
      if (a.kind === "image" && model && !model.images) {
        setProblem(`${model.label} does not take images.`);
        continue;
      }
      next.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        kind: a.kind,
        preview: a.kind === "image" ? URL.createObjectURL(file) : null,
      });
    }
    setFiles(next);
  };

  const submit = async () => {
    if (busy || (!text.trim() && !files.length)) return;
    setProblem(null);
    const uploads = await Promise.all(files.map((f) => toUpload(f.file)));
    if (await send(text, uploads)) {
      setText("");
      drop(() => false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5 px-6 pt-2 pb-4">
      <form
        className={cn(
          "flex flex-col rounded-2xl border bg-card shadow-xs/5 transition-colors focus-within:border-ring/48",
          dragging && "border-ring bg-accent/40",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
      >
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {files.map((f) => (
              <div
                key={f.key}
                className="group relative flex h-12 items-center gap-2 overflow-hidden rounded-lg border bg-background pr-2"
                title={`${f.file.name} · ${size(f.file.size)}`}
              >
                {f.preview ? (
                  <img src={f.preview} alt={f.file.name} className="size-12 object-cover" />
                ) : (
                  <>
                    <span className="flex size-12 items-center justify-center bg-muted">
                      <FileText className="size-4 text-muted-foreground" />
                    </span>
                    <span className="flex max-w-36 flex-col text-xs">
                      <span className="truncate">{f.file.name}</span>
                      <span className="text-2xs text-muted-foreground">{size(f.file.size)}</span>
                    </span>
                  </>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${f.file.name}`}
                  className="absolute top-1 right-1 flex size-4 cursor-pointer items-center justify-center rounded-full bg-foreground/80 text-background opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => drop((x) => x.key !== f.key)}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={area}
          value={text}
          rows={2}
          placeholder="Ask, or tell it what to write…"
          aria-label="Message"
          className="max-h-60 min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm outline-none placeholder:text-muted-foreground"
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const pasted = [...e.clipboardData.files];
            if (pasted.length) {
              e.preventDefault();
              add(pasted);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
        />

        <div className="flex items-center gap-1 px-2 pb-2">
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            accept="image/png,image/jpeg,image/gif,image/webp,.txt,.md,.csv,.tsv,.json,.yaml,.yml,.xml,.html,.log"
            onChange={(e) => {
              add(e.target.files ?? []);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost-muted"
            aria-label="Attach files"
            title="Attach images or text files (or paste, or drop them here)"
            disabled={busy}
            onClick={() => picker.current?.click()}
          >
            <Paperclip />
          </Button>
          <ModelMenu
            providers={providers}
            provider={agent.provider}
            model={agent.model}
            locked={locked}
            disabled={busy}
          />
          <EffortMenu efforts={model?.efforts ?? []} effort={agent.effort} disabled={busy} />
          <div className="ml-auto flex items-center gap-1">
            <UsageMeter provider={agent.provider} />
            {busy ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Stop"
                onClick={() => void cancel()}
              >
                <Square />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon-sm"
                aria-label="Send"
                disabled={!text.trim() && !files.length}
              >
                <ArrowUp />
              </Button>
            )}
          </div>
        </div>
      </form>
      <p
        className={cn("px-1 text-2xs", problem ? "text-error-foreground" : "text-muted-foreground")}
      >
        {problem ??
          `Sent to ${vendor.vendor} through your ${vendor.name} sign-in: your messages, attached files and what the agent reads from your data. It cannot post.`}
      </p>
    </div>
  );
}
