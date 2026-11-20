import type { LucideIcon } from "lucide-react";
import { Plug } from "lucide-react";

import { Empty, PageHeader } from "~/components/PageHeader";
import { Button } from "~/components/ui/button";
import { useLoud } from "~/store";

/** What a data view shows before the first build. */
export function NoData({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  const go = useLoud((s) => s.go);
  const connected = useLoud((s) => s.platforms.some((p) => p.status === "connected"));
  return (
    <>
      <PageHeader title={title} />
      <Empty
        icon={<Icon />}
        title="No data yet"
        action={
          !connected && (
            <Button size="sm" onClick={() => go("connections")}>
              <Plug />
              Open Connections
            </Button>
          )
        }
      >
        {connected
          ? "Numbers appear here after the first collection."
          : "Connect a platform first. Loud keeps the session and pulls your numbers."}
      </Empty>
    </>
  );
}
