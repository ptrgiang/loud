import type { Flag } from "@loud/contracts";
import { Info, ThumbsUp, TriangleAlert } from "lucide-react";

import { useT } from "~/i18n";

const ICON = { warn: TriangleAlert, good: ThumbsUp, info: Info } as const;
const TONE = {
  warn: "text-warning-foreground",
  good: "text-success-foreground",
  info: "text-muted-foreground",
} as const;
const WORD = { warn: "flags.warn", good: "flags.good", info: "flags.info" } as const;
const ORDER = { warn: 0, good: 1, info: 2 } as const;

export const byLevel = (flags: ReadonlyArray<Flag>) =>
  [...flags].sort((a, b) => ORDER[a.level] - ORDER[b.level]);

/** Status rows: the icon and the word carry the level, never the colour alone. */
export function FlagList({ flags }: { flags: ReadonlyArray<Flag> }) {
  const t = useT();
  return (
    <ul className="divide-y">
      {flags.map((f) => {
        const Icon = ICON[f.level];
        return (
          <li key={`${f.level}:${f.text}`} className="flex gap-2.5 px-4 py-2.5 text-sm">
            <Icon className={`mt-0.5 size-4 shrink-0 ${TONE[f.level]}`} aria-hidden />
            <span>
              <span
                className={`mr-1.5 font-medium text-2xs uppercase tracking-wide ${TONE[f.level]}`}
              >
                {t(WORD[f.level])}
              </span>
              {f.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
