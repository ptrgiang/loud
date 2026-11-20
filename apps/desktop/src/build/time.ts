// Stamps are wall-clock "YYYY-MM-DD HH:MM" in the configured zone. Arithmetic treats them as UTC so that no host
// zone or daylight-saving shift sneaks in: two stamps an hour apart are always 3,600,000 ms apart here.

/** Milliseconds of a naive stamp read as UTC; null when it is not a stamp. */
export const parseStamp = (s: string | null | undefined): number | null => {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d):(\d\d))?/.exec(s ?? "");
  return m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0)) : null;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** The inverse of parseStamp. */
export const formatStamp = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/** What a wall clock in `timeZone` shows at `date`. Falls back to UTC for a zone this runtime does not know. */
export const wallClock = (date: Date, timeZone: string): string => {
  let parts: Array<Intl.DateTimeFormatPart>;
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
  } catch {
    return formatStamp(date.getTime());
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
};

/** A Unix time (seconds) as a stamp in `timeZone`. */
export const stampFromUnix = (seconds: number, timeZone: string) =>
  wallClock(new Date(seconds * 1000), timeZone);
