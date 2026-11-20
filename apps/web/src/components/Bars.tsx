import { Fragment } from "react";

import type { Bucket } from "~/lib/analytics";
import { fmt } from "~/lib/format";

const chColor = (channel?: string) =>
  channel ? `var(--ch-${channel})` : "var(--muted-foreground)";

/** A thin bar for a value inside a table cell, scaled to the column's max. */
export function InlineBar({
  value,
  max,
  channel,
}: {
  value: number;
  max: number;
  channel?: string;
}) {
  return (
    <span className="block h-1.5 min-w-8 flex-1 rounded-full bg-muted">
      <span
        className="block h-full rounded-full"
        style={{
          width: `${Math.max(0, Math.min(100, (100 * value) / Math.max(max, 1e-9)))}%`,
          background: chColor(channel),
        }}
      />
    </span>
  );
}

/** Median views per bucket, one row each. */
export function BucketBars({
  rows,
  channel,
}: {
  rows: ReadonlyArray<Bucket>;
  channel?: string | undefined;
}) {
  const max = Math.max(1, ...rows.map((r) => r.median ?? 0));
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 text-xs">
      {rows.map((r) => (
        <Fragment key={r.label}>
          <span className="text-muted-foreground tabular-nums">{r.label}</span>
          <span className="h-2 rounded-r-sm bg-muted/60">
            {r.n > 0 && (
              <span
                className="block h-full rounded-r-sm"
                style={{ width: `${(100 * (r.median ?? 0)) / max}%`, background: chColor(channel) }}
              />
            )}
          </span>
          <span className="text-right tabular-nums">
            {r.n ? (
              <>
                <span className="font-semibold">{fmt(Math.round(r.median ?? 0))}</span>{" "}
                <span className="text-muted-foreground">{r.n} posts</span>
              </>
            ) : (
              <span className="text-muted-foreground">none</span>
            )}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

/** Parts of one whole, as a thin segmented bar. Colour follows the channel; the title gives the numbers. */
export function ShareBar({
  parts,
}: {
  parts: ReadonlyArray<{ id: string; label: string; value: number }>;
}) {
  const shown = parts.filter((p) => p.value > 0);
  return (
    <span
      className="flex h-2 min-w-16 gap-0.5 overflow-hidden rounded-full"
      title={shown.map((p) => `${p.label} ${fmt(p.value)}`).join(" · ")}
    >
      {shown.map((p) => (
        <span
          key={p.id}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ flex: p.value, background: chColor(p.id) }}
        />
      ))}
    </span>
  );
}
