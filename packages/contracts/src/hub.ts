// Shapes of the built data the dashboard reads. Collectors write per-channel files; the build step merges them into
// a Hub. These are types only: the data is produced and consumed inside the app, so it is not decoded at runtime.
import type { ChannelId } from "./channel.ts";

/** "YYYY-MM-DD HH:MM", wall-clock time in the configured zone. */
export type Stamp = string;

export interface Post {
  readonly channel: ChannelId;
  readonly id: string;
  readonly url?: string;
  readonly posted?: Stamp;
  readonly text?: string;
  /** `reply` posts are kept apart from your own posts in every metric. */
  readonly kind?: "post" | "reel" | "reply";
  readonly views?: number | null;
  readonly likes?: number | null;
  readonly replies?: number | null;
  readonly reposts?: number | null;
  readonly quotes?: number | null;
  readonly shares?: number | null;
  readonly saves?: number | null;
  readonly follows?: number | null;
  readonly reach?: number | null;
  readonly viewers?: number | null;
  readonly visits?: number | null;
  /** Video length in seconds. */
  readonly dur?: number | null;
  readonly format?: string;
  /** Hours since posted, at build time. */
  readonly age_h?: number | null;
  /** Engagement as a % of views. */
  readonly eng?: number | null;
  /** Views per day over the last 30 days, oldest first. */
  readonly trend?: ReadonlyArray<number | null>;
}

export interface ChannelSummary {
  readonly id: ChannelId;
  readonly name: string;
  readonly collected?: Stamp;
  readonly followers?: number | null;
  readonly posts_total: number;
  readonly posts_7d: number;
  readonly views_7d: number;
  readonly median_views_14d: number | null;
  readonly last_post: Stamp;
  readonly scheduled: number;
  readonly scheduled_known: boolean;
  readonly best_7d: Post | null;
  /** The account has a paid tier — X Premium widens the post limit. */
  readonly premium?: boolean;
}

export interface Scheduled {
  readonly channel: ChannelId;
  readonly when: Stamp;
  readonly text?: string;
}

export interface Flag {
  readonly level: "good" | "warn" | "info";
  readonly text: string;
}

export interface ListenItem {
  readonly channel: ChannelId;
  readonly query: string;
  readonly url?: string;
  readonly author?: string;
  readonly posted?: Stamp;
  readonly date_text?: string;
  readonly text?: string;
  readonly lang?: string;
  readonly views?: number | null;
  readonly likes?: number | null;
  readonly replies?: number | null;
  readonly reposts?: number | null;
  readonly shares?: number | null;
  readonly score?: number;
  readonly question?: boolean;
  /** Day the collector first saw it — undated results expire by this, not `posted`. */
  readonly found?: Stamp;
}

export interface Hub {
  readonly built: Stamp;
  readonly since?: string;
  readonly timezone?: string;
  readonly channels: ReadonlyArray<ChannelSummary>;
  readonly posts: ReadonlyArray<Post>;
  readonly scheduled: ReadonlyArray<Scheduled>;
  readonly flags: ReadonlyArray<Flag>;
  readonly listen: { readonly collected?: Stamp; readonly items: ReadonlyArray<ListenItem> };
}

export interface ProposalItem {
  readonly channel: ChannelId;
  readonly title: string;
  readonly when: string;
  readonly format?: string;
  readonly hook: string;
  readonly outline?: string;
  readonly why: string;
  readonly evidence?: ReadonlyArray<{ readonly label: string; readonly url: string }>;
}

export interface Proposals {
  readonly written: Stamp;
  readonly data_built?: Stamp;
  readonly summary: string;
  readonly audit?: ReadonlyArray<string>;
  readonly items: ReadonlyArray<ProposalItem>;
  readonly stop?: ReadonlyArray<string>;
}

export interface HistoryDay {
  readonly day: string;
  readonly at?: Stamp;
  readonly channels: Partial<Record<ChannelId, { readonly followers?: number | null }>>;
}

// ---- What collectors write (docs/data-format.md); the build reads these and writes the Hub ----

export type CollectedPost = Omit<Post, "channel" | "age_h" | "eng">;

export interface ChannelFile {
  readonly collected?: Stamp;
  readonly followers?: number | null;
  readonly posts: ReadonlyArray<CollectedPost>;
  readonly scheduled?: ReadonlyArray<{ readonly when: Stamp; readonly text?: string }>;
  /** False when the queue could not be read: "nothing scheduled" is then not claimed. */
  readonly scheduled_known?: boolean;
  /** Paid tier, when the platform exposes it (X Premium widens the post limit). */
  readonly premium?: boolean;
  /** The account these numbers belong to — `premium` is reused only while it matches. */
  readonly handle?: string;
}

export type CollectedListenItem = Omit<ListenItem, "score" | "question">;

export interface ListenFile {
  readonly collected?: Stamp;
  readonly items: ReadonlyArray<CollectedListenItem>;
}

/** history/<day>.json */
export interface HistoryFile {
  readonly at: Stamp;
  readonly channels: Partial<
    Record<
      ChannelId,
      {
        readonly followers?: number | null;
        readonly posts_total: number;
        readonly posts_7d: number;
        readonly views_7d: number;
        readonly median_views_14d: number | null;
        readonly scheduled: number;
      }
    >
  >;
}
