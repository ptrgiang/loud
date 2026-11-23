import { AGENT_VENDORS, type AgentAttachment, type AgentMessage } from "@loud/contracts";
import {
  Bot,
  Check,
  Copy,
  FileText,
  Loader,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Composer } from "~/components/agent/Composer";
import { Lightbox } from "~/components/agent/Lightbox";
import { Markdown } from "~/components/Markdown";
import { Empty, PageHeader } from "~/components/PageHeader";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useT, type MsgKey } from "~/i18n";
import { hm } from "~/lib/format";
import { call } from "~/lib/loud";
import { toast } from "~/lib/toast";
import { cn } from "~/lib/utils";
import { useLoud } from "~/store";
import { useWork } from "~/workStore";

const STARTERS: ReadonlyArray<MsgKey> = [
  "ag.starter.1",
  "ag.starter.2",
  "ag.starter.3",
  "ag.starter.4",
  "ag.starter.5",
];

/** The tool names, said the way a person would. */
const TOOL_WORDS: Record<string, MsgKey> = {
  get_overview: "ag.tool.get_overview",
  get_metrics: "ag.tool.get_metrics",
  list_posts: "ag.tool.list_posts",
  get_schedule: "ag.tool.get_schedule",
  search_listening: "ag.tool.search_listening",
  get_keywords: "ag.tool.get_keywords",
  get_playbook: "ag.tool.get_playbook",
  get_proposals: "ag.tool.get_proposals",
  save_proposals: "ag.tool.save_proposals",
  list_drafts: "ag.tool.list_drafts",
  save_draft: "ag.tool.save_draft",
  preview_images: "ag.tool.preview_images",
};

/** A saved image is read back from the profile when its chat opens; text files show as a chip. */
function Attachment({
  chatId,
  a,
  onImage,
}: {
  chatId: string | null;
  a: AgentAttachment;
  onImage?: (a: AgentAttachment) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (a.kind !== "image" || !chatId) return;
    let live = true;
    call("agent.attachment", { chatId, id: a.id }).then(
      (r) => live && setSrc(`data:${r.mime};base64,${r.data}`),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [chatId, a.id, a.kind]);
  if (a.kind === "image")
    return src ? (
      <button
        type="button"
        onClick={() => onImage?.(a)}
        className="cursor-zoom-in rounded-lg border transition-shadow hover:shadow-md"
        title={a.name}
      >
        <img src={src} alt={a.name} className="max-h-40 max-w-60 rounded-lg object-cover" />
      </button>
    ) : (
      <div className="size-20 rounded-lg border bg-muted" title={a.name} />
    );
  return (
    <span
      className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs"
      title={a.name}
    >
      <FileText className="size-3.5 text-muted-foreground" />
      <span className="max-w-48 truncate">{a.name}</span>
    </span>
  );
}

function Message({
  m,
  live,
  chatId,
  onImage,
}: {
  m: AgentMessage;
  live: boolean;
  chatId: string | null;
  onImage: (a: AgentAttachment) => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const stamp = (
    <span
      className="text-2xs text-muted-foreground opacity-0 transition-opacity group-hover/msg:opacity-100"
      title={m.at}
    >
      {hm(m.at)}
    </span>
  );
  if (m.role === "user")
    return (
      <div className="group/msg flex flex-col items-end gap-1.5">
        {m.attachments?.length ? (
          <div className="flex max-w-[80%] flex-wrap justify-end gap-1.5">
            {m.attachments.map((a) => (
              <Attachment key={a.id} chatId={chatId} a={a} onImage={onImage} />
            ))}
          </div>
        ) : null}
        {m.text && (
          <div className="max-w-[80%] whitespace-pre-wrap rounded-xl bg-secondary px-3.5 py-2 text-secondary-foreground text-sm">
            {m.text}
          </div>
        )}
        {stamp}
      </div>
    );
  const tools = [...new Set(m.tools)];
  return (
    <div className="group/msg flex flex-col gap-2">
      {tools.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
          <Wrench className="size-3.5" />
          {tools.map((tool) => (
            <Badge key={tool} variant="outline" className="font-normal text-muted-foreground">
              {TOOL_WORDS[tool] ? t(TOOL_WORDS[tool]) : tool}
            </Badge>
          ))}
          {live && <Loader className="size-3 animate-spin" />}
        </div>
      )}
      {m.text ? (
        <Markdown text={m.text} className="text-sm leading-relaxed" />
      ) : live ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader className="size-3.5 animate-spin" />
          {t("ag.working")}
        </div>
      ) : null}
      {m.attachments?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {m.attachments.map((a) => (
            <Attachment key={a.id} chatId={chatId} a={a} onImage={onImage} />
          ))}
        </div>
      ) : null}
      {m.error && (
        <div className="flex items-center gap-1.5 text-error-foreground text-xs">
          <TriangleAlert className="size-3.5" />
          {m.error === "stopped" ? t("ag.stopped") : m.error}
        </div>
      )}
      <div className="flex items-center gap-2">
        {stamp}
        {m.text && !live && (
          <button
            type="button"
            aria-label={t("ag.copyAnswer")}
            title={t("ag.copyAnswer")}
            onClick={() =>
              void navigator.clipboard.writeText(m.text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              })
            }
            className="cursor-pointer text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/msg:opacity-100 [&>svg]:size-3"
          >
            {copied ? <Check /> : <Copy />}
          </button>
        )}
      </div>
    </div>
  );
}

const when = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** Saved chats, newest first, like T3 Code's thread list. Delete asks once more on the same button. */
function ChatList() {
  const t = useT();
  const chats = useWork((s) => s.chats);
  const agent = useWork((s) => s.agent);
  const load = useWork((s) => s.loadChats);
  const open = useWork((s) => s.openChat);
  const remove = useWork((s) => s.deleteChat);
  const reset = useWork((s) => s.reset);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!confirm) return;
    const timer = setTimeout(() => setConfirm(null), 3000);
    return () => clearTimeout(timer);
  }, [confirm]);

  const rename = async (id: string) => {
    const clean = title.trim();
    setRenaming(null);
    if (!clean) return;
    try {
      await call("agent.rename", { id, title: clean });
      void load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r">
      <div className="p-2">
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start"
          disabled={agent?.chatId === null}
          onClick={() => void reset()}
        >
          <Plus />
          {t("ag.newChat")}
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label={t("ag.chats")}>
        {chats.length === 0 ? (
          <p className="px-2 py-3 text-muted-foreground text-xs">{t("ag.chatsKept")}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {chats.map((c) => {
              const on = c.id === agent?.chatId;
              const running = c.id === agent?.runningChatId;
              return (
                <li key={c.id} className="group relative">
                  {renaming === c.id ? (
                    <input
                      autoFocus
                      value={title}
                      aria-label={t("ag.renameChat")}
                      className="w-full rounded-lg border border-ring bg-background px-2.5 py-2 text-sm outline-none ring-ring/24 focus-visible:ring-2"
                      onChange={(e) => setTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void rename(c.id);
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      onBlur={() => void rename(c.id)}
                    />
                  ) : (
                    <button
                      type="button"
                      className={cn(
                        "flex w-full cursor-pointer flex-col gap-0.5 rounded-lg px-2.5 py-2 pr-14 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-64",
                        on ? "bg-accent" : "hover:bg-accent/60",
                      )}
                      onClick={() => !on && void open(c.id)}
                      onDoubleClick={() => {
                        setTitle(c.title);
                        setRenaming(c.id);
                      }}
                    >
                      <span className="flex items-center gap-1.5 truncate text-sm">
                        {running && <Loader className="size-3 shrink-0 animate-spin" />}
                        <span className="truncate">{c.title}</span>
                      </span>
                      <span className="text-2xs text-muted-foreground">
                        {AGENT_VENDORS[c.provider].name} · {when(c.updated)}
                      </span>
                    </button>
                  )}
                  {renaming !== c.id && (
                    <>
                      <button
                        type="button"
                        aria-label={`${t("ag.renameChat")} ${c.title}`}
                        title={t("ag.renameChat")}
                        className="absolute top-2 right-8 flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                        onClick={() => {
                          setTitle(c.title);
                          setRenaming(c.id);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={
                          confirm === c.id
                            ? t("ag.confirmDelete", { title: c.title })
                            : `${t("common.delete")} ${c.title}`
                        }
                        title={
                          confirm === c.id ? t("ag.confirmDeleteTitle") : t("ag.deleteChat")
                        }
                        disabled={running}
                        className={cn(
                          "absolute top-2 right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
                          confirm === c.id &&
                            "bg-destructive/12 text-destructive-foreground opacity-100 hover:bg-destructive/16 hover:text-destructive-foreground",
                        )}
                        onClick={() => {
                          if (confirm === c.id) {
                            setConfirm(null);
                            void remove(c.id);
                          } else setConfirm(c.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}

export function AgentView() {
  const t = useT();
  const agent = useWork((s) => s.agent);
  const settings = useWork((s) => s.agentSettings);
  const chats = useWork((s) => s.chats);
  const loadAgent = useWork((s) => s.loadAgent);
  const loadProviders = useWork((s) => s.loadProviders);
  const send = useWork((s) => s.send);
  const go = useLoud((s) => s.go);
  const demo = useLoud((s) => s.info?.demo ?? false);
  const scroll = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const chatRef = useRef<string | null | undefined>(undefined);
  const [viewer, setViewer] = useState<number | null>(null);

  useEffect(() => {
    void loadAgent();
    void loadProviders();
  }, [loadAgent, loadProviders]);
  const count = agent?.messages.length ?? 0;
  const last = agent?.messages.at(-1)?.text.length ?? 0;
  const chatId = agent?.chatId ?? null;
  // Follow the stream only while the reader is already near the bottom — scrolling up pins the view.
  useEffect(() => {
    const el = scroll.current;
    if (!el || count + last === 0) return;
    const switched = chatId !== chatRef.current;
    chatRef.current = chatId;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (switched || near || count === 1) bottom.current?.scrollIntoView({ block: "end" });
  }, [count, last, chatId]);

  if (!settings || !agent) return null;
  const vendor = AGENT_VENDORS[agent.provider];

  if (!settings.enabled)
    return (
      <>
        <PageHeader title={t("nav.agent")} />
        <Empty
          icon={<Bot />}
          title={t("ag.off")}
          action={
            <Button size="sm" onClick={() => go("settings")}>
              <Settings2 />
              {t("ag.setUp")}
            </Button>
          }
        >
          {t("ag.offBody", {
            a: AGENT_VENDORS.claude.name,
            b: AGENT_VENDORS.codex.name,
          })}
        </Empty>
      </>
    );

  const busy = agent.busy;
  const title = chats.find((c) => c.id === agent.chatId)?.title ?? t("ag.newChat");
  // Every image in the conversation, in message order — the lightbox moves through them all.
  const images = agent.messages
    .flatMap((m) => m.attachments ?? [])
    .filter((a) => a.kind === "image");

  return (
    <>
      <PageHeader title={t("nav.agent")} description={title}>
        {agent.costUsd != null && (
          <span className="text-muted-foreground text-xs tabular-nums" title={t("ag.costTitle")}>
            {t("ag.cost", { cost: agent.costUsd.toFixed(2) })}
          </span>
        )}
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        <ChatList />
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scroll} className="flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
              {count === 0 ? (
                <div className="flex flex-col gap-3 pt-6">
                  <div className="font-medium text-sm">{t("ag.askAbout")}</div>
                  <div className="flex flex-col items-start gap-1.5">
                    {STARTERS.map((k) => (
                      <Button
                        key={k}
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void send(t(k))}
                      >
                        {t(k)}
                      </Button>
                    ))}
                  </div>
                  {demo && <p className="text-muted-foreground text-xs">{t("ag.demoNote")}</p>}
                </div>
              ) : (
                agent.messages.map((m, i) => (
                  <Message
                    key={m.id}
                    m={m}
                    chatId={agent.chatId}
                    live={busy && agent.chatId === agent.runningChatId && i === count - 1}
                    onImage={(a) => {
                      const at = images.findIndex((x) => x.id === a.id);
                      if (at >= 0) setViewer(at);
                    }}
                  />
                ))
              )}
              <div ref={bottom} />
            </div>
          </div>
          <Composer vendor={vendor} />
        </div>
      </div>
      {viewer !== null && agent.chatId && images[viewer] && (
        <Lightbox
          chatId={agent.chatId}
          images={images}
          index={viewer}
          onClose={() => setViewer(null)}
          onNav={setViewer}
        />
      )}
    </>
  );
}
