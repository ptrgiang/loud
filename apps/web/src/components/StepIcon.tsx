import type { StepState } from "@loud/contracts";
import { Check, CircleAlert, CircleDashed, Loader, X } from "lucide-react";

import { cn } from "~/lib/utils";

export function StepIcon({ status }: { status: StepState["status"] }) {
  const cls = "size-3.5 shrink-0";
  if (status === "running") return <Loader className={cn(cls, "animate-spin")} />;
  if (status === "done") return <Check className={cn(cls, "text-success-foreground")} />;
  if (status === "failed") return <CircleAlert className={cn(cls, "text-error-foreground")} />;
  if (status === "stopped") return <X className={cn(cls, "text-muted-foreground")} />;
  return <CircleDashed className={cn(cls, "text-muted-foreground")} />;
}
