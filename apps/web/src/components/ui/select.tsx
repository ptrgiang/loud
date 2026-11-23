// A native <select> dressed like the other controls: same border, height and focus ring, one chevron on the right.
// Native keeps keyboard and screen-reader behaviour for free.
import { ChevronDown } from "lucide-react";
import type * as React from "react";

import { cn } from "~/lib/utils";

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative inline-flex w-full items-center">
      <select
        className={cn(
          "h-8 w-full min-w-0 cursor-pointer appearance-none rounded-md border border-input bg-background pr-7 pl-2.5 text-sm shadow-xs/5 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24 disabled:cursor-not-allowed disabled:opacity-64 sm:h-7",
          className,
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground"
      />
    </span>
  );
}
