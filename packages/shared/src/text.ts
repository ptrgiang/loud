// How long a post is as each platform counts it. X weighs a link as 23 and wide characters (CJK, most emoji) as 2;
// the others count characters.
import type { ChannelId } from "@loud/contracts";

const URL_RE = /https?:\/\/\S+/g;

/** X's narrow ranges (weight 1); everything else weighs 2. */
const narrow = (cp: number) =>
  cp <= 0x10ff ||
  (cp >= 0x2000 && cp <= 0x200d) ||
  (cp >= 0x2010 && cp <= 0x201f) ||
  (cp >= 0x2032 && cp <= 0x2037);

export function postLength(text: string, channel: ChannelId): number {
  if (channel !== "x") return [...text].length;
  let n = 0;
  const rest = text.replace(URL_RE, () => {
    n += 23;
    return "";
  });
  for (const ch of rest) n += narrow(ch.codePointAt(0) ?? 0) ? 1 : 2;
  return n;
}
