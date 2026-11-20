import { CHANNEL_NAMES, type ChannelId } from "@loud/contracts";
import type * as React from "react";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex h-[var(--workspace-topbar-height)] shrink-0 items-center justify-between gap-4 border-b px-6">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="truncate font-semibold text-sm">{title}</h1>
        {description && <p className="truncate text-muted-foreground text-xs">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}

export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        {icon && (
          <div className="flex size-10 items-center justify-center rounded-lg border bg-card text-muted-foreground shadow-xs/5 [&>svg]:size-5">
            {icon}
          </div>
        )}
        <div className="font-medium text-sm">{title}</div>
        {children && <div className="text-muted-foreground text-sm">{children}</div>}
        {action}
      </div>
    </div>
  );
}

export function ChannelDot({ id, className }: { id: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${className ?? ""}`}
      style={{ background: `var(--ch-${id})` }}
    />
  );
}

export function ChannelTag({ id, label }: { id: string; label?: string | undefined }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <ChannelDot id={id} />
      <span>{label ?? CHANNEL_NAMES[id as ChannelId] ?? id}</span>
    </span>
  );
}
