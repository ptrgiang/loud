import { useState } from "react";
import type * as React from "react";

import { cn } from "~/lib/utils";

export function Card({
  title,
  hint,
  actions,
  tone,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  /** "flat" marks supporting content — notes and disclosures — so primary surfaces keep their lift. */
  tone?: "card" | "flat";
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-xl border bg-card",
        tone === "flat" ? "bg-card/60 shadow-none" : "shadow-xs/5",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
          <div className="min-w-0">
            {title && <h2 className="font-medium text-sm">{title}</h2>}
            {hint && <p className="mt-0.5 text-muted-foreground text-xs">{hint}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("min-w-0 px-4 pb-4", !title && !actions && "pt-4", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

/** The scrolling body every data view sits in. */
export function ViewBody({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="@container flex-1 overflow-y-auto">
      <div
        className={cn("mx-auto flex flex-col gap-4 px-6 py-6", wide ? "max-w-7xl" : "max-w-5xl")}
      >
        {children}
      </div>
    </div>
  );
}

/** A short line inside a card when there is nothing to show. */
export function Quiet({ children }: { children: React.ReactNode }) {
  return <div className="py-6 text-center text-muted-foreground text-sm">{children}</div>;
}

/** Text cut to a few lines; click to read all of it. */
export function ClampText({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
      className={cn(
        "cursor-pointer whitespace-pre-line text-left",
        !open && "line-clamp-3",
        className,
      )}
    >
      {text}
    </button>
  );
}
