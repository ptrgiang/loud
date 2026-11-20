// Adapted from T3 Code (MIT, https://github.com/pingdotgg/t3code).
import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

import { cn } from "~/lib/utils";

type InputProps = Omit<InputPrimitive.Props & React.RefAttributes<HTMLInputElement>, "size"> & {
  size?: "sm" | "compact" | "default";
  font?: "default" | "mono";
};

function Input({ className, size = "default", font = "default", ...props }: InputProps) {
  return (
    <span
      className={cn(
        "relative inline-flex w-full rounded-lg border border-input bg-background not-dark:bg-clip-padding text-base text-foreground shadow-xs/5 ring-ring/24 transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] not-has-disabled:not-has-focus-visible:before:shadow-[0_1px_--theme(--color-black/4%)] has-focus-visible:border-ring has-disabled:opacity-64 has-[:disabled,:focus-visible]:shadow-none has-focus-visible:ring-[3px] has-focus-visible:ring-inset sm:text-sm dark:bg-input/32 dark:not-has-disabled:not-has-focus-visible:before:shadow-[0_-1px_--theme(--color-white/6%)]",
        size === "compact" && "rounded-md before:rounded-[calc(var(--radius-md)-1px)]",
        font === "mono" && "font-mono tabular-nums",
        className,
      )}
      data-size={size}
      data-slot="input-control"
    >
      <InputPrimitive
        className={cn(
          "h-8.5 w-full min-w-0 rounded-[inherit] bg-transparent px-[calc(--spacing(3)-1px)] leading-8.5 outline-none placeholder:text-placeholder sm:h-7.5 sm:leading-7.5",
          size === "compact" &&
            "h-7 px-[calc(--spacing(2.5)-1px)] text-xs leading-7 sm:h-7 sm:leading-7",
          size === "sm" &&
            "h-7.5 px-[calc(--spacing(2.5)-1px)] leading-7.5 sm:h-6.5 sm:leading-6.5",
        )}
        data-slot="input"
        {...props}
      />
    </span>
  );
}

export { Input, type InputProps };
