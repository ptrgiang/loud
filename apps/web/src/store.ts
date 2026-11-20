import type {
  AppInfo,
  ChannelId,
  HistoryDay,
  Hub,
  PlatformUpdate,
  PlatformView,
  Proposals,
} from "@loud/contracts";
import { create } from "zustand";

import { call, onEvent } from "~/lib/loud";
// The work store reads this one too; both only touch each other inside functions, so the cycle is safe.
import { setCollect, useWork } from "~/workStore";

export const VIEWS = [
  "overview",
  "insights",
  "proposals",
  "schedule",
  "posts",
  "audit",
  "listening",
  "agent",
  "drafts",
  "connections",
  "settings",
] as const;
export type View = (typeof VIEWS)[number];

const viewFromHash = (): View => {
  const h = location.hash.replace(/^#\/?/, "");
  return (VIEWS as ReadonlyArray<string>).includes(h) ? (h as View) : "overview";
};

interface LoudState {
  readonly view: View;
  readonly info: AppInfo | null;
  readonly platforms: ReadonlyArray<PlatformView>;
  readonly hub: Hub | null;
  readonly proposals: Proposals | null;
  /** Daily snapshots, oldest first. */
  readonly history: ReadonlyArray<HistoryDay>;
  readonly loaded: boolean;
  readonly error: string | null;
  /** Platform ids with a call in flight, so their buttons can wait. */
  readonly busy: ReadonlySet<ChannelId>;

  readonly go: (view: View) => void;
  readonly load: () => Promise<void>;
  readonly loadPlatforms: () => Promise<void>;
  readonly connect: (id: ChannelId) => Promise<void>;
  readonly disconnect: (id: ChannelId) => Promise<void>;
  readonly openBrowser: (id: ChannelId) => Promise<void>;
  readonly updatePlatform: (update: PlatformUpdate) => Promise<void>;
  /** Read the handle and Facebook's Pages again from the logged-in pages. */
  readonly detectPlatform: (id: ChannelId) => Promise<void>;
}

export const useLoud = create<LoudState>()((set) => {
  const withBusy = async (id: ChannelId, work: () => Promise<void>) => {
    set((s) => ({ busy: new Set(s.busy).add(id) }));
    try {
      await work();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set((s) => {
        const busy = new Set(s.busy);
        busy.delete(id);
        return { busy };
      });
    }
  };
  const replace = (view: PlatformView) =>
    set((s) => ({ platforms: s.platforms.map((p) => (p.id === view.id ? view : p)) }));

  return {
    view: viewFromHash(),
    info: null,
    platforms: [],
    hub: null,
    proposals: null,
    history: [],
    loaded: false,
    error: null,
    busy: new Set(),

    go: (view) => {
      if (location.hash !== `#/${view}`) location.hash = `/${view}`;
      set({ view });
    },
    load: async () => {
      try {
        const [info, platforms, hub, proposals, history] = await Promise.all([
          call("app.info", {}),
          call("platforms.list", {}),
          call("data.hub", {}),
          call("data.proposals", {}),
          call("data.history", {}),
        ]);
        set({
          info,
          platforms,
          hub: (hub as Hub | null) ?? null,
          proposals: (proposals as Proposals | null) ?? null,
          history: Array.isArray(history) ? (history as ReadonlyArray<HistoryDay>) : [],
          loaded: true,
          error: null,
        });
      } catch (error) {
        set({ loaded: true, error: error instanceof Error ? error.message : String(error) });
      }
    },
    loadPlatforms: async () => {
      const [info, platforms] = await Promise.all([
        call("app.info", {}),
        call("platforms.list", {}),
      ]);
      set({ info, platforms });
    },
    connect: (id) => withBusy(id, async () => replace(await call("platforms.connect", { id }))),
    disconnect: (id) =>
      withBusy(id, async () => replace(await call("platforms.disconnect", { id }))),
    openBrowser: (id) =>
      withBusy(id, async () => void (await call("platforms.openBrowser", { id }))),
    updatePlatform: (update) =>
      withBusy(update.id, async () => {
        replace(await call("platforms.update", update));
        set({ info: await call("app.info", {}) });
      }),
    detectPlatform: (id) =>
      withBusy(id, async () => replace(await call("platforms.detect", { id }))),
  } satisfies LoudState;
});

// Keep the store in step with the desktop and the address bar.
let wired = false;
export function wireStore() {
  if (wired) return;
  wired = true;
  window.addEventListener("hashchange", () => useLoud.setState({ view: viewFromHash() }));
  onEvent((event) => {
    const { load, loadPlatforms } = useLoud.getState();
    if (event.type === "agent") useWork.setState({ agent: event.state });
    else if (event.type === "collect") {
      setCollect(event.status);
      if (!event.status.running) void useWork.getState().loadCollect();
    } else if (event.type === "drafts") void useWork.getState().loadDrafts();
    else if (event.type === "updates") useWork.setState({ updates: event.status });
    else if (event.type === "usage") useWork.setState({ usage: event.status });
    else if (event.type === "data") void load();
    else void loadPlatforms();
  });
}
