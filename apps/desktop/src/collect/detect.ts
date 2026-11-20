// Who is logged in, read from the platform's own pages, so the user does not have to type a handle. The account id
// comes from the session cookie; the handle is whatever name the page's data puts next to that same id.
import type { ChannelId } from "@loud/contracts";

import { get, text, walk } from "./json.ts";
import type { PageReader } from "./PageReader.ts";

const NAME = /^[A-Za-z0-9._]{1,30}$/;
const ID_KEYS = ["pk", "pk_id", "id", "id_str", "rest_id", "user_id"] as const;

const nameOf = (o: Record<string, unknown>) =>
  [
    text(o.username),
    text(o.screen_name),
    text(get(o, "legacy", "screen_name")),
    text(get(o, "core", "screen_name")),
  ].find((n) => NAME.test(n)) ?? null;

/** The username on an object in the page's data whose id is the logged-in account's. */
export function usernameFor(objs: ReadonlyArray<unknown>, userId: string): string | null {
  for (const o of walk(objs, (o) => ID_KEYS.some((k) => String(o[k] ?? "") === userId))) {
    const n = nameOf(o);
    if (n) return n;
  }
  return null;
}

/** The same, from raw HTML: Meta also inlines data in scripts that are not JSON blocks. */
export function usernameNear(html: string, userId: string): string | null {
  if (!/^\d+$/.test(userId)) return null;
  const id = new RegExp(`"(?:pk|pk_id|id|user_id)":"?${userId}"?[,}]`, "g");
  let best: { name: string; gap: number } | null = null;
  for (const m of html.matchAll(id)) {
    const at = m.index;
    const start = Math.max(0, at - 400);
    for (const u of html.slice(start, at + 400).matchAll(/"username":"([A-Za-z0-9._]{1,30})"/g)) {
      const gap = Math.abs(start + u.index - at);
      if (!best || gap < best.gap) best = { name: u[1]!, gap };
    }
  }
  return best?.name ?? null;
}

/** X's left bar links to the logged-in profile. */
export const xProfileHref = (href: string | null) => {
  const m = /^\/([A-Za-z0-9_]{1,15})$/.exec(href ?? "");
  return m ? m[1]! : null;
};

export interface FbPage {
  readonly id: string;
  readonly name: string;
}

/**
 * Every Page the account manages, by the id Business Suite takes as asset_id. Business Suite lists the Pages of its
 * portfolio (BusinessScopingPageLocalScope); facebook.com/pages also lists Pages outside it, where that same id is
 * `delegate_page_id` (`id` there is the Page's profile).
 */
export function fbPages(objs: ReadonlyArray<unknown>): Array<FbPage> {
  const out = new Map<string, string>();
  const add = (id: unknown, name: unknown) => {
    const i = String(id ?? "");
    if (/^\d+$/.test(i) && !out.has(i)) out.set(i, text(name) || i);
  };
  for (const o of walk(
    objs,
    (o) =>
      o.__typename === "BusinessScopingPageLocalScope" &&
      (!o.asset_type || o.asset_type === "PAGE"),
  ))
    add(o.asset_id, o.name);
  for (const o of walk(
    objs,
    (o) => "delegate_page_id" in o && "can_manage_classic_page_in_pages_tab" in o,
  ))
    add(o.delegate_page_id, o.name);
  return [...out].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export interface Detected {
  readonly handle?: string;
  readonly assetId?: string;
  /** Facebook: the Pages to choose from. */
  readonly pages?: ReadonlyArray<FbPage>;
}

const poll = async <A>(read: () => Promise<A | null>, tries: number): Promise<A | null> => {
  for (let i = 0; i < tries; i++) {
    const v = await read();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return null;
};

/** One page load per platform; two for Facebook (Business Suite and the list of managed Pages). */
export async function detectAccount(
  id: ChannelId,
  userId: string | undefined,
  reader: PageReader,
): Promise<Detected> {
  if (id === "threads" || id === "ig") {
    if (!userId) return {};
    const page = await reader.open(
      id === "ig" ? "https://www.instagram.com/" : "https://www.threads.com/",
      {
        capture: /\/(api\/)?graphql|\/api\/v1\//,
        embedKeys: [userId],
        until: (objs) => usernameFor(objs, userId) !== null,
        timeoutMs: 12_000,
      },
    );
    const handle = usernameFor(page.objs, userId) ?? usernameNear(page.html, userId);
    return handle ? { handle } : {};
  }
  if (id === "x") {
    const page = await reader.open("https://x.com/home", {
      capture: /\/i\/api\/graphql\//,
      ...(userId ? { until: (objs) => usernameFor(objs, userId) !== null } : {}),
      timeoutMs: 10_000,
    });
    const handle =
      (userId ? usernameFor(page.objs, userId) : null) ??
      (await poll(
        async () =>
          xProfileHref(
            await reader.evaluate<string>(
              `JSON.stringify(document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')?.getAttribute("href") ?? null)`,
            ),
          ),
        8,
      ));
    return handle ? { handle } : {};
  }
  // Facebook: the Pages the account manages. One Page is chosen for the user; several wait for the user's choice. The
  // Page id also works in facebook.com/<id>, which is all the collector needs from the "handle".
  const suite = await reader.open("https://business.facebook.com/latest/home", {
    capture: /\/api\/graphql\//,
    embedKeys: ["BusinessScopingPageLocalScope"],
    until: (objs) => fbPages(objs).length > 0,
    timeoutMs: 12_000,
  });
  const managed = await reader.open("https://www.facebook.com/pages/?category=your_pages", {
    capture: /\/api\/graphql\//,
    embedKeys: ["delegate_page_id"],
    until: (objs) => fbPages(objs).length > 0,
    timeoutMs: 12_000,
  });
  const pages = fbPages([...suite.objs, ...managed.objs]);
  const only = pages.length === 1 ? pages[0]!.id : null;
  return { pages, ...(only ? { assetId: only, handle: only } : {}) };
}
