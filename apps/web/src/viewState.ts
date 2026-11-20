// Filters and sort orders, kept while you move between views so coming back finds the same slice.
import type { ChannelId } from "@loud/contracts";
import { create } from "zustand";

import type { Sort } from "~/components/DataTable";

interface ViewState {
  readonly posts: {
    readonly channel: ChannelId | null;
    readonly days: "7" | "30" | "all";
    readonly replies: boolean;
    readonly q: string;
    readonly sort: Sort;
  };
  readonly listening: {
    readonly channel: ChannelId | null;
    readonly keyword: string | null;
    readonly lang: string | null;
    readonly questions: boolean;
    readonly q: string;
    readonly sort: Sort;
  };
  readonly proposals: { readonly channel: ChannelId | null };
}

export const useViewState = create<ViewState>()(() => ({
  posts: { channel: null, days: "30", replies: true, q: "", sort: { key: "posted", dir: -1 } },
  listening: {
    channel: null,
    keyword: null,
    lang: null,
    questions: false,
    q: "",
    sort: { key: "score", dir: -1 },
  },
  proposals: { channel: null },
}));

export const patchView = <K extends keyof ViewState>(key: K, patch: Partial<ViewState[K]>) =>
  useViewState.setState((s) => ({ [key]: { ...s[key], ...patch } }) as Partial<ViewState>);
