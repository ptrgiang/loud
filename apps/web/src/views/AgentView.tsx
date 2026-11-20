import { AGENT_VENDORS, type AgentAttachment, type AgentMessage } from "@loud/contracts";
import { Bot, FileText, Plus, Settings2, Trash2, TriangleAlert, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Composer } from "~/components/agent/Composer";
import { Markdown } from "~/components/Markdown";
import { Empty, PageHeader } from "~/components/PageHeader";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { call } from "~/lib/loud";
import { cn } from "~/lib/utils";
import { useLoud } from "~/store";
import { useWork } from "~/workStore";

const STARTERS = [
  "What worked best in the last two weeks, and why?",
  "When should I post on each channel?",
  "What are people asking about in the listening results?",
  "Propose five posts for next week and save them to Proposals.",
  "Turn my best Threads post into an X post and save it as a draft.",
];

/** The tool names, said the way a person would. */
const TOOL_WORDS: Record<string, string> = {
  get_overview: "overview",
  get_metrics: "metrics",
  list_posts: "posts",
  get_schedule: "schedule",
  search_listening: "listening",
  get_keywords: "keywords",
  get_playbook: "playbook",
  get_proposals: "proposals",
  save_proposals: "saved proposals",
  list_drafts: "drafts",
  save_draft: "saved a draft",
};

/** A saved image is read back from the profile when its chat opens; text files show as a chip. */
function Attachment({ chatId, a }: { chatId: string | null; a: AgentAttachment }) {
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
      <img
        src={src}
        alt={a.name}
        title={a.name}
        className="max-h-40 max-w-60 rounded-lg border object-cover"
      />
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

function Message({ m, live, chatId }: { m: AgentMessage; live: boolean; chatId: string | null }) {
  if (m.role === "user")
    return (
      <div className="flex flex-col items-end gap-1.5">
        {m.attachments?.length ? (
          <div className="flex max-w-[80%] flex-wrap justify-end gap-1.5">
            {m.attachments.map((a) => (
              <Attachment key={a.id} chatId={chatId} a={a} />
            ))}
          </div>
        ) : null}
        {m.text && (
          <div className="max-w-[80%] whitespace-pre-wrap rounded-xl bg-secondary px-3.5 py-2 text-secondary-foreground text-sm">
            {m.text}
          </div>
        )}
      </div>
    );
  const tools = [...new Set(m.tools)];
  return (
    <div className="flex flex-col gap-2">
      {tools.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
          <Wrench className="size-3.5" />
          {tools.map((t) => (
            <Badge key={t} variant="outline" className="font-normal text-muted-foreground">
              {TOOL_WORDS[t] ?? t}
            </Badge>
          ))}
        </div>
      )}
      {m.text ? (
        <Markdown text={m.text} className="text-sm leading-relaxed" />
      ) : live ? (
        <div className="text-muted-foreground text-sm">Reading your data…</div>
      ) : null}
      {m.error && (
        <div className="flex items-center gap-1.5 text-error-foreground text-xs">
          <TriangleAlert className="size-3.5" />
          {m.error === "stopped" ? "Stopped." : m.error}
        </div>
      )}
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
  const chats = useWork((s) => s.chats);
  const agent = useWork((s) => s.agent);
  const load = useWork((s) => s.loadChats);
  const open = useWork((s) => s.openChat);
  const remove = useWork((s) => s.deleteChat);
  const reset = useWork((s) => s.reset);
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(null), 3000);
    return () => clearTimeout(t);
  }, [confirm]);
  const busy = agent?.busy ?? false;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r">
      <div className="p-2">
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start"
          disabled={busy || agent?.chatId === null}
          onClick={() => void reset()}
        >
          <Plus />
          New chat
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label="Chats">
        {chats.length === 0 ? (
          <p className="px-2 py-3 text-muted-foreground text-xs">
            Your chats are kept here, on this computer.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {chats.map((c) => {
              const on = c.id === agent?.chatId;
              return (
                <li key={c.id} className="group relative">
                  <button
                    type="button"
                    disabled={busy && !on}
                    className={cn(
                      "flex w-full cursor-pointer flex-col gap-0.5 rounded-lg px-2.5 py-2 pr-8 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-64",
                      on ? "bg-accent" : "hover:bg-accent/60",
                    )}
                    onClick={() => !on && void open(c.id)}
                  >
                    <span className="truncate text-sm">{c.title}</span>
                    <span className="text-2xs text-muted-foreground">
                      {AGENT_VENDORS[c.provider].name} · {when(c.updated)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={
                      confirm === c.id ? `Confirm: delete ${c.title}` : `Delete ${c.title}`
                    }
                    title={confirm === c.id ? "Click again to delete" : "Delete chat"}
                    disabled={busy && on}
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
  const agent = useWork((s) => s.agent);
  const settings = useWork((s) => s.agentSettings);
  const chats = useWork((s) => s.chats);
  const loadAgent = useWork((s) => s.loadAgent);
  const loadProviders = useWork((s) => s.loadProviders);
  const send = useWork((s) => s.send);
  const go = useLoud((s) => s.go);
  const demo = useLoud((s) => s.info?.demo ?? false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadAgent();
    void loadProviders();
  }, [loadAgent, loadProviders]);
  const count = agent?.messages.length ?? 0;
  const last = agent?.messages.at(-1)?.text.length ?? 0;
  // Follow the conversation as messages arrive and the answer streams in.
  useEffect(() => {
    if (count + last > 0) bottom.current?.scrollIntoView({ block: "end" });
  }, [count, last, agent?.chatId]);

  if (!settings || !agent) return null;
  const vendor = AGENT_VENDORS[agent.provider];

  if (!settings.enabled)
    return (
      <>
        <PageHeader title="Agent" />
        <Empty
          icon={<Bot />}
          title="The agent is off"
          action={
            <Button size="sm" onClick={() => go("settings")}>
              <Settings2 />
              Set it up
            </Button>
          }
        >
          It reads your numbers and listening results, proposes posts and writes drafts. It runs
          through {AGENT_VENDORS.claude.name} or {AGENT_VENDORS.codex.name}, signed in on this
          computer, so what it reads is sent to that company. Nothing is sent until you turn it on.
        </Empty>
      </>
    );

  const busy = agent.busy;
  const title = chats.find((c) => c.id === agent.chatId)?.title ?? "New chat";

  return (
    <>
      <PageHeader title="Agent" description={title}>
        {agent.costUsd != null && (
          <span
            className="text-muted-foreground text-xs tabular-nums"
            title="As the CLI reports it"
          >
            ≈ ${agent.costUsd.toFixed(2)} this chat
          </span>
        )}
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        <ChatList />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
              {count === 0 ? (
                <div className="flex flex-col gap-3 pt-6">
                  <div className="font-medium text-sm">Ask about your channels</div>
                  <div className="flex flex-col items-start gap-1.5">
                    {STARTERS.map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void send(s)}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                  {demo && (
                    <p className="text-muted-foreground text-xs">
                      This is the fictional demo (Acme Forms): the agent will answer from made-up
                      numbers.
                    </p>
                  )}
                </div>
              ) : (
                agent.messages.map((m, i) => (
                  <Message key={m.id} m={m} chatId={agent.chatId} live={busy && i === count - 1} />
                ))
              )}
              <div ref={bottom} />
            </div>
          </div>
          <Composer vendor={vendor} />
        </div>
      </div>
    </>
  );
}
