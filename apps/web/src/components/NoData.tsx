import type { LucideIcon } from "lucide-react";
import { Plug } from "lucide-react";

import { Empty, PageHeader } from "~/components/PageHeader";
import { TryDemo } from "~/components/TryDemo";
import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";
import { useLoud } from "~/store";

/** What a data view shows before the first build. */
export function NoData({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  const t = useT();
  const go = useLoud((s) => s.go);
  const connected = useLoud((s) => s.platforms.some((p) => p.status === "connected"));
  return (
    <>
      <PageHeader title={title} />
      <Empty
        icon={<Icon />}
        title={t("nodata.title")}
        steps={connected ? undefined : [t("nodata.step1"), t("nodata.step2"), t("nodata.step3")]}
        action={
          !connected && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => go("connections")}>
                <Plug />
                {t("nodata.openConnections")}
              </Button>
              <TryDemo />
            </div>
          )
        }
      >
        {connected ? t("nodata.connected") : t("nodata.notConnected")}
      </Empty>
    </>
  );
}
