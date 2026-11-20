// The posts as a spreadsheet, for the user's own use. Written into the data folder; never sent anywhere.
import type { Hub } from "@loud/contracts";

const COLUMNS = [
  "channel",
  "posted",
  "kind",
  "views",
  "likes",
  "replies",
  "reposts",
  "quotes",
  "shares",
  "saves",
  "follows",
  "reach",
  "eng",
  "url",
  "text",
] as const;

const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Quote anything with a separator, quote or line break; a leading =+-@ is defused so a spreadsheet never runs it.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

export function postsCsv(hub: Hub): string {
  const rows = [...hub.posts]
    .sort((a, b) => (b.posted ?? "").localeCompare(a.posted ?? ""))
    .map((p) => COLUMNS.map((c) => cell(p[c])).join(","));
  // The BOM makes Excel read UTF-8 (emoji, accents) correctly.
  return `﻿${COLUMNS.join(",")}\r\n${rows.join("\r\n")}\r\n`;
}
