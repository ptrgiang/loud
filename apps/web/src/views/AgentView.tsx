import { AGENT_VENDORS, type AgentMessage } from "@loud/contracts";
import { ArrowUp, Bot, RotateCcw, Settings2, Square, TriangleAlert, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Markdown } from "~/components/Markdown";
import { Empty, PageHeader } from "~/components/PageHeader";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
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

function Message({ m, live }: { m: AgentMessage; live: boolean }) {
  if (m.role === "user")
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-xl bg-secondary px-3.5 py-2 text-secondary-foreground text-sm">
          {m.text}
        </div>
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

export function AgentView() {
  const agent = useWork((s) => s.agent);
  const settings = useWork((s) => s.agentSettings);
  const loadAgent = useWork((s) => s.loadAgent);
  const send = useWork((s) => s.send);
  const cancel = useWork((s) => s.cancel);
  const reset = useWork((s) => s.reset);
  const go = useLoud((s) => s.go);
  const demo = useLoud((s) => s.info?.demo ?? false);
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => void loadAgent(), [loadAgent]);
  const count = agent?.messages.length ?? 0;
  const last = agent?.messages.at(-1)?.text.length ?? 0;
  // Follow the conversation as messages arrive and the answer streams in.
  useEffect(() => {
    if (count + last > 0) bottom.current?.scrollIntoView({ block: "end" });
  }, [count, last]);

  if (!settings) return null;
  const vendor = AGENT_VENDORS[settings.provider];

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

  const busy = agent?.busy ?? false;
  const submit = async (text: string) => {
    if (!text.trim() || busy) return;
    if (await send(text)) setDraft("");
  };

  return (
    <>
      <PageHeader
        title="Agent"
        description={`${vendor.name}${settings.model ? ` · ${settings.model}` : ""}`}
      >
        {agent?.costUsd != null && (
          <span className="text-muted-foreground text-xs tabular-nums">
            ≈ ${agent.costUsd.toFixed(2)} this chat
          </span>
        )}
        <Button size="sm" variant="ghost-muted" disabled={!count} onClick={() => void reset()}>
          <RotateCcw />
          New chat
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
            {count === 0 ? (
              <div className="flex flex-col gap-3 pt-6">
                <div className="font-medium text-sm">Ask about your channels</div>
                <div className="flex flex-col items-start gap-1.5">
                  {STARTERS.map((s) => (
                    <Button key={s} size="sm" variant="outline" onClick={() => void submit(s)}>
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
              agent?.messages.map((m, i) => (
                <Message key={m.id} m={m} live={busy && i === count - 1} />
              ))
            )}
            <div ref={bottom} />
          </div>
        </div>

        <div className="border-t bg-background">
          <form
            className="mx-auto flex max-w-3xl flex-col gap-2 px-6 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(draft);
            }}
          >
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                rows={2}
                placeholder="Ask, or tell it what to write…"
                aria-label="Message"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void submit(draft);
                  }
                }}
              />
              {busy ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Stop"
                  onClick={() => void cancel()}
                >
                  <Square />
                </Button>
              ) : (
                <Button type="submit" size="icon" aria-label="Send" disabled={!draft.trim()}>
                  <ArrowUp />
                </Button>
              )}
            </div>
            <p className="text-2xs text-muted-foreground">
              Sent to {vendor.vendor} through your {vendor.name} sign-in: your messages and what the
              agent reads from your data. It can only read Loud's data and write proposals and
              drafts; it cannot post.
            </p>
          </form>
        </div>
      </div>
    </>
  );
}
