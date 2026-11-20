// Stamps are "YYYY-MM-DD HH:MM" wall-clock time in the configured zone. Shared code reads them as local Dates: the
// weekday and hour come out as written whatever the host zone, which is all the analytics need.

export const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export const parseStamp = (s: string | null | undefined): Date | null => {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d):(\d\d))?/.exec(s ?? "");
  return m ? new Date(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0)) : null;
};

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
