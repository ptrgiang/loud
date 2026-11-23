import { Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";
import { call } from "~/lib/loud";
import { toast } from "~/lib/toast";
import { useLoud } from "~/store";

/** Fills the empty data folder with the fictional demo so a new install can see every view. */
export function TryDemo() {
  const t = useT();
  const demo = useLoud((s) => s.info?.demo ?? false);
  const [busy, setBusy] = useState(false);
  if (demo) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          useLoud.setState({ info: await call("data.loadDemo", {}) });
          toast("done", t("set.demoLoaded"));
        } catch (e) {
          useLoud.setState({ error: e instanceof Error ? e.message : String(e) });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Sparkles />
      {t("nodata.tryDemo")}
    </Button>
  );
}
