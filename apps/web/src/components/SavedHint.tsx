// Silent saves (blur-on-leave inputs, pickers) get a brief "Saved" so the user can tell the write landed.
import { useEffect, useState } from "react";
import type * as React from "react";

import { useT } from "~/i18n";

export function useSaveFlash(): [React.ReactNode, () => void] {
  const t = useT();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const id = setTimeout(() => setOn(false), 1600);
    return () => clearTimeout(id);
  }, [on]);
  return [
    on ? (
      <span className="shrink-0 text-2xs text-success-foreground">{t("common.saved")}</span>
    ) : null,
    () => setOn(true),
  ];
}
