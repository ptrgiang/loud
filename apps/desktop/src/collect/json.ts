// Finding the numbers in what platform pages load. Their JSON nests deep and shifts often, so parsers search by shape
// (an object with these keys) instead of following a fixed path.

type Obj = Record<string, unknown>;

export const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Every object under `root` (itself included) that `test` accepts, depth first. */
export function walk(root: unknown, test: (o: Obj) => boolean): Array<Obj> {
  const out: Array<Obj> = [];
  const stack: Array<unknown> = [root];
  const seen = new Set<unknown>();
  while (stack.length) {
    const v = stack.pop();
    if (typeof v !== "object" || v === null || seen.has(v)) continue;
    seen.add(v);
    if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i--) stack.push(v[i]);
      continue;
    }
    if (test(v as Obj)) out.push(v as Obj);
    const vals = Object.values(v as Obj);
    for (let i = vals.length - 1; i >= 0; i--) stack.push(vals[i]);
  }
  return out;
}

/** Meta answers come as one JSON, or one per line, sometimes behind `for (;;);`. */
export function parseLoose(body: string): Array<unknown> {
  const b = body.replace(/^\s*for \(;;\);/, "");
  try {
    return [JSON.parse(b)];
  } catch {
    return b
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("{"))
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as unknown];
        } catch {
          return [];
        }
      });
  }
}

/** Parsed `<script type="application/json">` blocks of a page that mention `key`. */
export function embedded(html: string, key: string): Array<unknown> {
  const out: Array<unknown> = [];
  for (const m of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    const s = m[1] ?? "";
    if (!s.includes(key)) continue;
    try {
      out.push(JSON.parse(s));
    } catch {
      // a block that is not JSON after all
    }
  }
  return out;
}

export const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && /^\d+$/.test(v)
      ? Number(v)
      : null;

export const text = (v: unknown): string => (typeof v === "string" ? v : "");

export const get = (o: unknown, ...path: Array<string>): unknown => {
  let v: unknown = o;
  for (const k of path) v = isObj(v) ? v[k] : undefined;
  return v;
};

/** "1,234", "12.5K", "3M" as shown on a page. */
export function countFromText(s: string): number | null {
  const m = /^([\d.,]+)\s*([KkMm]?)$/.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1]!.replaceAll(",", ""));
  if (!Number.isFinite(n)) return null;
  const mult = { k: 1e3, m: 1e6 }[m[2]!.toLowerCase() as "k" | "m"] ?? 1;
  return Math.round(n * mult);
}
