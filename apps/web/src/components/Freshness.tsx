import type { Hub } from "@loud/contracts";

import { relative } from "~/lib/format";
import { useWork } from "~/workStore";

const at = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" });

/** When these numbers were made and when they will change: they are rebuilt after every collection, no other time. */
export function Freshness({ hub }: { hub: Hub }) {
  const collect = useWork((s) => s.collect);
  const auto = useWork((s) => s.collection?.auto ?? false);
  const next = collect?.running
    ? "collecting now"
    : auto && collect?.next
      ? `next collection ${at(collect.next)}`
      : "next when you collect (timer off)";
  return (
    <span title="Rebuilt after every collection, from what was collected">
      Updated {relative(hub.built)} · {next}
    </span>
  );
}
