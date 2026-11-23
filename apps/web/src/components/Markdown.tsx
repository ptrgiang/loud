// A parsed answer never reorders, so position is each node's identity.
// oxlint-disable react/no-array-index-key
import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";

import { useT } from "~/i18n";
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

/** A fenced block — often the post itself — wrapped in a frame with a copy button. */
function Pre({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative">
      <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 pr-9 font-mono text-xs leading-relaxed">
        {text}
      </pre>
      <button
        type="button"
        aria-label={t("common.copy")}
        title={t("common.copy")}
        className="absolute top-1.5 right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 shadow-xs transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [&>svg]:size-3.5"
        onClick={() =>
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          })
        }
      >
        {copied ? <Check /> : <Copy />}
      </button>
    </div>
  );
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
      case "h": {
        const H = `h${Math.min(6, n.level + 1)}` as "h2" | "h3" | "h4" | "h5" | "h6";
        return (
          <H key={i} className={cn("font-semibold", n.level <= 2 && "text-base")}>
            <Spans c={n.c} />
          </H>
        );
      }
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
        return <Pre key={i} text={n.v} />;
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
