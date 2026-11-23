import type { ChannelId } from "@loud/contracts";
import { Search } from "lucide-react";
import type * as React from "react";

import { ChannelDot } from "~/components/PageHeader";
import { Input } from "~/components/ui/input";
import { useT } from "~/i18n";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { safeUrl } from "~/lib/analytics";
import { call } from "~/lib/loud";
import { toast } from "~/lib/toast";
import { cn } from "~/lib/utils";

const say = (e: unknown) => toast("error", e instanceof Error ? e.message : String(e));

/** The one row of filters above a view's content. */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2.5">{children}</div>;
}

/** Single choice; clicking the pressed option keeps it. */
export function Segmented<V extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: V;
  options: ReadonlyArray<{ value: V; label: React.ReactNode }>;
  onChange: (value: V) => void;
  label: string;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const v = next[0] as V | undefined;
        if (v !== undefined) onChange(v);
      }}
    >
      {options.map((o) => (
        <Toggle key={o.value} value={o.value}>
          {o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

const ALL = "all";

/** "All" plus one option per channel, each with its dot. */
export function ChannelFilter({
  value,
  channels,
  names,
  counts,
  onChange,
}: {
  value: ChannelId | null;
  channels: ReadonlyArray<ChannelId>;
  names: Record<ChannelId, string>;
  counts?: Partial<Record<ChannelId | "all", number>>;
  onChange: (value: ChannelId | null) => void;
}) {
  const t = useT();
  const count = (k: ChannelId | "all") =>
    counts?.[k] !== undefined && (
      <span className="text-muted-foreground tabular-nums">{counts[k]}</span>
    );
  return (
    <Segmented<string>
      label={t("filters.channel")}
      value={value ?? ALL}
      onChange={(v) => onChange(v === ALL ? null : (v as ChannelId))}
      options={[
        {
          value: ALL,
          label: (
            <>
              {t("common.all")} {count("all")}
            </>
          ),
        },
        ...channels.map((id) => ({
          value: id,
          label: (
            <span className="inline-flex items-center gap-1.5">
              <ChannelDot id={id} />
              {names[id]} {count(id)}
            </span>
          ),
        })),
      ]}
    />
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-56">
      <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 text-muted-foreground" />
      <Input
        size="sm"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onValueChange={(v) => onChange(v)}
        className="[&_input]:pl-7.5"
      />
    </div>
  );
}

/** Post text that opens the post, when it lives on a platform's own domain; plain text otherwise. */
export function PostText({
  url,
  text,
  className,
}: {
  url: string | undefined;
  text: string;
  className?: string;
}) {
  const href = safeUrl(url);
  if (!href) return <span className={className}>{text}</span>;
  return (
    <button
      type="button"
      onClick={() => void call("links.open", { url: href }).catch(say)}
      className={cn(
        "cursor-pointer text-left underline-offset-2 hover:underline focus-visible:underline",
        className,
      )}
    >
      {text}
    </button>
  );
}
