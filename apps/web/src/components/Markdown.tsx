// A parsed answer never reorders, so position is each node's identity.
// oxlint-disable react/no-array-index-key
import { useMemo } from "react";

import { call } from "~/lib/loud";
import { type Block, blocks, type Inline } from "~/lib/markdown";
import { cn } from "~/lib/utils";

function Spans({ c }: { c: ReadonlyArray<Inline> }) {
  return c.map((n, i) => {
    switch (n.t) {
      case "text":
        return <span key={i}>{n.v}</span>;
      case "b":
        return (
          <strong key={i} className="font-semibold">
            <Spans c={n.c} />
          </strong>
        );
      case "i":
        return (
          <em key={i}>
            <Spans c={n.c} />
          </em>
        );
      case "code":
        return (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
            {n.v}
          </code>
        );
      case "link":
        return (
          <a
            key={i}
            href={n.href}
            title={n.href}
            className="text-primary underline-offset-2 hover:underline"
            onClick={(e) => {
              e.preventDefault();
              void call("links.open", { url: n.href });
            }}
          >
            <Spans c={n.c} />
          </a>
        );
    }
  });
}

function Blocks({ b }: { b: ReadonlyArray<Block> }) {
  return b.map((n, i) => {
    switch (n.t) {
      case "p":
        return (
          <p key={i} className="whitespace-pre-wrap">
            <Spans c={n.c} />
          </p>
        );
      case "h":
        return (
          <p key={i} className={cn("font-semibold", n.level <= 2 && "text-base")}>
            <Spans c={n.c} />
          </p>
        );
      case "ul":
      case "ol": {
        const List = n.t;
        return (
          <List
            key={i}
            className={cn("flex flex-col gap-1 pl-5", n.t === "ul" ? "list-disc" : "list-decimal")}
          >
            {n.items.map((it, j) => (
              <li key={j}>
                <Spans c={it} />
              </li>
            ))}
          </List>
        );
      }
      case "quote":
        return (
          <blockquote key={i} className="flex flex-col gap-2 border-l-2 pl-3 text-foreground/90">
            <Blocks b={n.c} />
          </blockquote>
        );
      case "pre":
        return (
          <pre key={i} className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs">
            {n.v}
          </pre>
        );
    }
  });
}

/** An agent's answer. Rendered from parsed data, never as HTML. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const parsed = useMemo(() => blocks(text), [text]);
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Blocks b={parsed} />
    </div>
  );
}
