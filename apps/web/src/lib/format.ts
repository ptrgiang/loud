import { isNum, parseStamp, ymd } from "@loud/shared/stamp";

export { isNum, parseStamp, ymd };

const NF = new Intl.NumberFormat("en-US");
const NC = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Whole numbers with separators; a dash when unknown. */
export const fmt = (n: number | null | undefined) => (isNum(n) ? NF.format(n) : "–");

/** Compact from 10k up (12.3K), exact below. */
export const compact = (n: number | null | undefined) =>
  isNum(n) ? (Math.abs(n) >= 10_000 ? NC.format(n) : NF.format(n)) : "–";

export const relative = (s: string | undefined, now = new Date()): string => {
  const d = parseStamp(s);
  if (!d) return s || "–";
  const min = (now.getTime() - d.getTime()) / 60_000;
  if (min < 2) return "just now";
  if (min < 60) return `${Math.round(min)}m ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)}h ago`;
  return `${Math.round(min / 1440)}d ago`;
};

export const relativeIso = (iso: string | undefined): string => {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/** Up to `digits` decimals, no trailing zeros. */
export const dec = (n: number | null | undefined, digits = 1) =>
  isNum(n) ? n.toLocaleString("en-US", { maximumFractionDigits: digits }) : "–";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS = WD;

/** "Fri, Nov 20". */
export const dayLabel = (d: Date | null) =>
  d ? `${WD[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}` : "–";

/** "11/20". */
export const monthDay = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

/** The HH:MM of a stamp. */
export const hm = (s: string | undefined) => (s ?? "").slice(11, 16);

/** "Fri, Nov 20 15:30". */
export const stampLabel = (s: string | undefined) => {
  const d = parseStamp(s);
  return d ? `${dayLabel(d)} ${hm(s)}`.trim() : s || "–";
};

/** Whitespace collapsed, cut at `n` characters. */
export const short = (s: string | undefined, n = 140) => {
  const t = String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** Past or future, against `now`: "in 3 h", "2 days ago". */
export const until = (s: string | undefined, now: Date) => {
  const d = parseStamp(s);
  if (!d) return s || "–";
  const h = (d.getTime() - now.getTime()) / 3_600_000;
  const a = Math.abs(h);
  const t =
    a < 1
      ? `${Math.max(1, Math.round(a * 60))} min`
      : a < 48
        ? `${Math.round(a)} h`
        : `${Math.round(a / 24)} days`;
  return h >= 0 ? `in ${t}` : `${t} ago`;
};

/** Axis ticks share one style: compact on an axis that reaches 10,000, in full below it. */
export const axisTick = (v: number, axisMax: number) =>
  axisMax >= 10_000 ? NC.format(v) : NF.format(v);
