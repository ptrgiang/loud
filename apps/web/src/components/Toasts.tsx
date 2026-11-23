import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useEffect } from "react";

import { useT } from "~/i18n";
import { dismiss, toast, useToasts } from "~/lib/toast";
import { cn } from "~/lib/utils";
import { useLoud } from "~/store";

export function Toasts() {
  const t = useT();
  const list = useToasts((s) => s.list);
  const error = useLoud((s) => s.error);

  // Every failed call sets the store's error; it is shown here instead of a bar over the page.
  useEffect(() => {
    if (!error) return;
    toast("error", error);
    useLoud.setState({ error: null });
  }, [error]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {list.map((item) => (
        <div
          key={item.id}
          role={item.kind === "error" ? "alert" : "status"}
          className="pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-popover px-3 py-2.5 text-popover-foreground text-sm shadow-lg/8"
        >
          {item.kind === "error" ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-error-foreground" />
          ) : (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-foreground" />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 break-words",
              item.kind === "error" && "text-error-foreground",
            )}
          >
            {item.text}
          </span>
          <button
            type="button"
            aria-label={t("common.dismiss")}
            onClick={() => dismiss(item.id)}
            className="cursor-pointer rounded text-muted-foreground hover:text-foreground [&>svg]:size-3.5"
          >
            <X />
          </button>
        </div>
      ))}
    </div>
  );
}
