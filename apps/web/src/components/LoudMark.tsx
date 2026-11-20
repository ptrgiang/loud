import { cn } from "~/lib/utils";

/** The Loud mark: an L sending out sound. Same drawing as apps/desktop/resources/icon.svg, in theme colours. */
export function LoudMark({ className }: { className?: string }) {
  return (
    <svg viewBox="100 100 824 824" aria-hidden className={cn("size-6", className)}>
      <rect x="100" y="100" width="824" height="824" rx="184" className="fill-foreground" />
      <g transform="translate(23 -8)" className="fill-background stroke-background">
        <rect x="245" y="300" width="112" height="465" rx="24" stroke="none" />
        <rect x="245" y="653" width="300" height="112" rx="24" stroke="none" />
        <g fill="none" strokeWidth="74" strokeLinecap="round">
          <path d="M580.6 586.0A215 215 0 0 0 424.0 429.4" />
          <path d="M697.0 557.0A335 335 0 0 0 453.0 313.0" strokeOpacity="0.55" />
        </g>
      </g>
    </svg>
  );
}
