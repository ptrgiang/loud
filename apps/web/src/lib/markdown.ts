// The small part of Markdown the agents write: paragraphs, lists, quotes, headings, fences, and bold/italic/code/links
// inline. Parsed to plain data so nothing from a model's answer reaches the page as HTML.

export type Inline =
  | { readonly t: "text"; readonly v: string }
  | { readonly t: "b" | "i"; readonly c: ReadonlyArray<Inline> }
  | { readonly t: "code"; readonly v: string }
  | { readonly t: "link"; readonly href: string; readonly c: ReadonlyArray<Inline> };

export type Block =
  | { readonly t: "p"; readonly c: ReadonlyArray<Inline> }
  | { readonly t: "h"; readonly level: number; readonly c: ReadonlyArray<Inline> }
  | { readonly t: "ul" | "ol"; readonly items: ReadonlyArray<ReadonlyArray<Inline>> }
  | { readonly t: "quote"; readonly c: ReadonlyArray<Block> }
  | { readonly t: "pre"; readonly v: string };

const INLINE =
  /(\*\*([^*]+?)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|((?<![\w*])\*([^*\s][^*]*?)\*(?![\w*]))/;

export function inline(s: string): Array<Inline> {
  const out: Array<Inline> = [];
  let rest = s;
  for (;;) {
    const m = INLINE.exec(rest);
    if (!m) break;
    if (m.index > 0) out.push({ t: "text", v: rest.slice(0, m.index) });
    if (m[1]) out.push({ t: "b", c: inline(m[2]!) });
    else if (m[3]) out.push({ t: "code", v: m[4]! });
    else if (m[5]) out.push({ t: "link", href: m[7]!, c: inline(m[6]!) });
    else out.push({ t: "i", c: inline(m[9]!) });
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) out.push({ t: "text", v: rest });
  return out;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;

export function blocks(src: string): Array<Block> {
  const lines = src.replaceAll("\r\n", "\n").split("\n");
  const out: Array<Block> = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trimStart().startsWith("```")) {
      const body: Array<string> = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith("```")) body.push(lines[i++]!);
      i++;
      out.push({ t: "pre", v: body.join("\n") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      out.push({ t: "h", level: h[1]!.length, c: inline(h[2]!) });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: Array<string> = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!))
        body.push(lines[i++]!.replace(/^\s*>\s?/, ""));
      out.push({ t: "quote", c: blocks(body.join("\n")) });
      continue;
    }
    const start = i;
    for (const [re, t] of [
      [BULLET, "ul"],
      [NUMBER, "ol"],
    ] as const) {
      if (!re.test(line)) continue;
      const items: Array<Array<Inline>> = [];
      while (i < lines.length && re.test(lines[i]!)) items.push(inline(re.exec(lines[i++]!)![1]!));
      out.push({ t, items });
      break;
    }
    if (i === start) {
      const body: Array<string> = [];
      while (
        i < lines.length &&
        lines[i]!.trim() &&
        !/^\s*(>|```|#{1,6}\s)/.test(lines[i]!) &&
        !BULLET.test(lines[i]!) &&
        !NUMBER.test(lines[i]!)
      )
        body.push(lines[i++]!);
      out.push({ t: "p", c: inline(body.join("\n")) });
    }
  }
  return out;
}
