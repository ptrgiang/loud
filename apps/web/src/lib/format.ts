import { isNum, parseStamp, ymd } from "@loud/shared/stamp";

import { t, useLocale } from "~/i18n";

export { isNum, parseStamp, ymd };

/** The Intl tag of the dashboard's chosen language — read at call time so non-React callers stay right. */
const tag = () => (useLocale.getState().locale === "vi" ? "vi-VN" : "en-US");

const cached = new Map<string, Intl.NumberFormat>();
const nf = (opts?: Intl.NumberFormatOptions) => {
  const key = `${tag()}|${JSON.stringify(opts ?? null)}`;
  let f = cached.get(key);
  if (!f) cached.set(key, (f = new Intl.NumberFormat(tag(), opts)));
  return f;
};

const dates = new Map<string, Intl.DateTimeFormat>();
const df = (opts: Intl.DateTimeFormatOptions) => {
  const key = `${tag()}|${JSON.stringify(opts)}`;
  let f = dates.get(key);
  if (!f) dates.set(key, (f = new Intl.DateTimeFormat(tag(), opts)));
  return f;
};

/** Whole numbers with separators; a dash when unknown. */
export const fmt = (n: number | null | undefined) => (isNum(n) ? nf().format(n) : "–");

/** Compact from 10k up (12.3K), exact below. */
export const compact = (n: number | null | undefined) =>
  isNum(n)
    ? Math.abs(n) >= 10_000
      ? nf({ notation: "compact", maximumFractionDigits: 1 }).format(n)
      : nf().format(n)
    : "–";

export const relative = (s: string | undefined, now = new Date()): string => {
  const d = parseStamp(s);
  if (!d) return s || "–";
  const min = (now.getTime() - d.getTime()) / 60_000;
  if (min < 2) return t("time.justNow");
  if (min < 60) return t("time.mAgo", { n: Math.round(min) });
  if (min < 48 * 60) return t("time.hAgo", { n: Math.round(min / 60) });
  return t("time.dAgo", { n: Math.round(min / 1440) });
};

export const relativeIso = (iso: string | undefined): string => {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return df({ month: "short", day: "numeric", year: "numeric" }).format(d);
};

/** Up to `digits` decimals, no trailing zeros. */
export const dec = (n: number | null | undefined, digits = 1) =>
  isNum(n) ? n.toLocaleString(tag(), { maximumFractionDigits: digits }) : "–";

/** Short weekday of a JS day index, in the dashboard's language (0 = Sunday). */
export const weekday = (d: number) => df({ weekday: "short" }).format(new Date(2024, 0, 7 + d));

/** "Fri, Nov 20" — or the same idea in Vietnamese. */
export const dayLabel = (d: Date | null) =>
  d ? df({ weekday: "short", month: "short", day: "numeric" }).format(d) : "–";

/** Numeric month/day in the locale's order: 11/20 in English, 20/11 in Vietnamese. */
export const monthDay = (d: Date) => df({ month: "numeric", day: "numeric" }).format(d);

/** The HH:MM of a stamp. */
export const hm = (s: string | undefined) => (s ?? "").slice(11, 16);

/** "Fri, Nov 20 15:30". */
export const stampLabel = (s: string | undefined) => {
  const d = parseStamp(s);
  return d ? `${dayLabel(d)} ${hm(s)}`.trim() : s || "–";
};

/** "Nov 20, 2026, 3:30 PM" — full date and time in the dashboard's language. */
export const dateTime = (d: Date | string) =>
  df({ dateStyle: "medium", timeStyle: "short" }).format(d instanceof Date ? d : new Date(d));

/** "15:30" — just the clock, in the dashboard's language. */
export const clock = (d: Date) => df({ hour: "2-digit", minute: "2-digit" }).format(d);

/** "Fri, 15:30" — weekday plus clock for a pause that ends soon. */
export const weekdayTime = (d: Date) =>
  df({ weekday: "short", hour: "2-digit", minute: "2-digit" }).format(d);

/** Whitespace collapsed, cut at `n` characters. */
export const short = (s: string | undefined, n = 140) => {
  const str = String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return str.length > n ? `${str.slice(0, n)}…` : str;
};

/** Past or future, against `now`: "in 3 h", "2 days ago". */
export const until = (s: string | undefined, now: Date) => {
  const d = parseStamp(s);
  if (!d) return s || "–";
  const h = (d.getTime() - now.getTime()) / 3_600_000;
  const a = Math.abs(h);
  const min = Math.max(1, Math.round(a * 60));
  return h >= 0
    ? a < 1
      ? t("time.inMin", { n: min })
      : a < 48
        ? t("time.inH", { n: Math.round(a) })
        : t("time.inD", { n: Math.round(a / 24) })
    : a < 1
      ? t("time.minAgo", { n: min })
      : a < 48
        ? t("time.hAgoL", { n: Math.round(a) })
        : t("time.dAgoL", { n: Math.round(a / 24) });
};

/** Axis ticks share one style: compact on an axis that reaches 10,000, in full below it. */
export const axisTick = (v: number, axisMax: number) =>
  axisMax >= 10_000
    ? nf({ notation: "compact", maximumFractionDigits: 1 }).format(v)
    : nf().format(v);
