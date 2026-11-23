import type { Hub } from "@loud/contracts";

import { useLocale, useT } from "~/i18n";
import { relative } from "~/lib/format";
import { useWork } from "~/workStore";

const at = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale === "vi" ? "vi-VN" : "en-US", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** When these numbers were made and when they will change: they are rebuilt after every collection, no other time. */
export function Freshness({ hub }: { hub: Hub }) {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const collect = useWork((s) => s.collect);
  const auto = useWork((s) => s.collection?.auto ?? false);
  const next = collect?.running
    ? t("freshness.collecting")
    : auto && collect?.next
      ? t("freshness.nextAt", { at: at(collect.next, locale) })
      : t("freshness.nextManual");
  return (
    <span title={t("freshness.title")}>
      {t("freshness.updated", { when: relative(hub.built), next })}
    </span>
  );
}
