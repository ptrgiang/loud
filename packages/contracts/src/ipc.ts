// Every call from the dashboard to the desktop process. The desktop decodes each input against these schemas before
// it acts, so the renderer cannot ask for anything that is not listed here.
import * as Schema from "effect/Schema";

import {
  AgentProviderView,
  AgentSettings,
  AgentSettingsUpdate,
  AgentState,
  Draft,
  DraftInput,
  AgentChatSummary,
  AgentSelect,
  AgentUpload,
  AgentUsage,
} from "./agent.ts";
import { ChannelId } from "./channel.ts";
import {
  BudgetView,
  CollectionSettings,
  CollectionSettingsUpdate,
  CollectStart,
  CollectStatus,
} from "./collect.ts";
import { PlatformUpdate, PlatformView } from "./platform.ts";
import { GeneralUpdate, Keywords, PostingSettings } from "./settings.ts";
import { UpdateSettings, UpdateStatus } from "./updates.ts";
import { UsageReport, UsageStatus } from "./usage.ts";

const None = Schema.Struct({});
const ById = Schema.Struct({ id: ChannelId });
const DraftImageRef = Schema.Struct({ id: Schema.String, name: Schema.String });

const Stamp = Schema.String;
const NumOrNull = Schema.NullOr(Schema.Number);
const metric = Schema.optional(NumOrNull);
const Post = Schema.Struct({
  channel: ChannelId,
  id: Schema.String,
  url: Schema.optional(Schema.String),
  posted: Schema.optional(Stamp),
  text: Schema.optional(Schema.String),
  kind: Schema.optional(Schema.Literals(["post", "reel", "reply"])),
  views: metric,
  likes: metric,
  replies: metric,
  reposts: metric,
  quotes: metric,
  shares: metric,
  saves: metric,
  follows: metric,
  reach: metric,
  viewers: metric,
  visits: metric,
  dur: metric,
  format: Schema.optional(Schema.String),
  age_h: metric,
  eng: metric,
  trend: Schema.optional(Schema.Array(NumOrNull)),
});
const ChannelSummary = Schema.Struct({
  id: ChannelId,
  name: Schema.String,
  collected: Schema.optional(Stamp),
  followers: metric,
  posts_total: Schema.Number,
  posts_7d: Schema.Number,
  views_7d: Schema.Number,
  median_views_14d: NumOrNull,
  last_post: Stamp,
  scheduled: Schema.Number,
  scheduled_known: Schema.Boolean,
  best_7d: Schema.NullOr(Post),
  premium: Schema.optional(Schema.Boolean),
});
const ListenItem = Schema.Struct({
  channel: ChannelId,
  query: Schema.String,
  url: Schema.optional(Schema.String),
  author: Schema.optional(Schema.String),
  posted: Schema.optional(Stamp),
  date_text: Schema.optional(Schema.String),
  text: Schema.optional(Schema.String),
  lang: Schema.optional(Schema.String),
  views: metric,
  likes: metric,
  replies: metric,
  reposts: metric,
  shares: metric,
  score: Schema.optional(Schema.Number),
  question: Schema.optional(Schema.Boolean),
  found: Schema.optional(Stamp),
});
const HubFile = Schema.Struct({
  built: Stamp,
  since: Schema.optional(Schema.String),
  timezone: Schema.optional(Schema.String),
  channels: Schema.Array(ChannelSummary),
  posts: Schema.Array(Post),
  scheduled: Schema.Array(
    Schema.Struct({ channel: ChannelId, when: Stamp, text: Schema.optional(Schema.String) }),
  ),
  flags: Schema.Array(
    Schema.Struct({
      level: Schema.Literals(["good", "warn", "info"]),
      text: Schema.String,
    }),
  ),
  listen: Schema.Struct({ collected: Schema.optional(Stamp), items: Schema.Array(ListenItem) }),
});
const ProposalsFile = Schema.Struct({
  written: Stamp,
  data_built: Schema.optional(Stamp),
  summary: Schema.String,
  audit: Schema.optional(Schema.Array(Schema.String)),
  items: Schema.Array(
    Schema.Struct({
      channel: ChannelId,
      title: Schema.String,
      when: Schema.String,
      format: Schema.optional(Schema.String),
      hook: Schema.String,
      outline: Schema.optional(Schema.String),
      why: Schema.String,
      evidence: Schema.optional(
        Schema.Array(Schema.Struct({ label: Schema.String, url: Schema.String })),
      ),
    }),
  ),
  stop: Schema.optional(Schema.Array(Schema.String)),
});
const Followers = Schema.Struct({ followers: metric });
const HistoryFile = Schema.Array(
  Schema.Struct({
    day: Schema.String,
    at: Schema.optional(Stamp),
    channels: Schema.Struct({
      threads: Schema.optional(Followers),
      ig: Schema.optional(Followers),
      fb: Schema.optional(Followers),
      x: Schema.optional(Followers),
    }),
  }),
);

export const AppInfo = Schema.Struct({
  name: Schema.String,
  tagline: Schema.String,
  version: Schema.String,
  demo: Schema.Boolean,
  os: Schema.Literals(["win32", "darwin", "linux"]),
  timezone: Schema.String,
  since: Schema.String,
  channels: Schema.Array(Schema.Struct({ id: ChannelId, label: Schema.String })),
});
export type AppInfo = typeof AppInfo.Type;

export const IpcMethods = {
  "app.info": { input: None, output: AppInfo },
  "settings.updateGeneral": { input: GeneralUpdate, output: AppInfo },
  "platforms.list": { input: None, output: Schema.Array(PlatformView) },
  "platforms.connect": { input: ById, output: PlatformView },
  "platforms.disconnect": { input: ById, output: PlatformView },
  "platforms.openBrowser": { input: ById, output: Schema.Struct({}) },
  "platforms.update": { input: PlatformUpdate, output: PlatformView },
  /** Read the handle (and Facebook's Pages) again from the logged-in pages. */
  "platforms.detect": { input: ById, output: PlatformView },
  "keywords.get": { input: None, output: Keywords },
  "keywords.set": { input: Keywords, output: Keywords },
  /** Built data files, as JSON. Null when the file is not there yet. */
  "data.hub": { input: None, output: Schema.NullOr(HubFile) },
  "data.proposals": { input: None, output: Schema.NullOr(ProposalsFile) },
  "data.history": { input: None, output: HistoryFile },
  "links.open": { input: Schema.Struct({ url: Schema.String }), output: Schema.Struct({}) },
  /** Writes a CSV of the posts into the data folder and shows it in the file manager. */
  "data.exportPosts": { input: None, output: Schema.Struct({ file: Schema.String }) },
  /** A copy of the whole data folder (minus earlier exports), shown in the file manager. */
  "data.exportAll": { input: None, output: Schema.Struct({ dir: Schema.String }) },
  /** Removes everything collection wrote: posts, numbers, listening, history and proposals. Drafts stay. */
  "data.deleteAll": { input: None, output: Schema.Struct({}) },
  /** Fills an empty data folder with the fictional demo (Acme Forms); refuses a folder with real data. */
  "data.loadDemo": { input: None, output: AppInfo },
  /** Removes the demo so collection can run: same files as deleteAll plus the demo marker. */
  "data.leaveDemo": { input: None, output: AppInfo },
  /** One text file for a bug report: version, settings without handles, collection state, recent log lines. */
  "app.diagnostics": { input: None, output: Schema.Struct({ file: Schema.String }) },
  "collect.status": { input: None, output: CollectStatus },
  "collect.start": { input: CollectStart, output: CollectStatus },
  "collect.cancel": { input: None, output: CollectStatus },
  "collect.budgets": { input: None, output: Schema.Array(BudgetView) },
  /** Clear a pause after the user dealt with a checkpoint on the platform's own page. */
  "collect.resume": { input: ById, output: Schema.Array(BudgetView) },
  "collect.settings": { input: None, output: CollectionSettings },
  "collect.configure": { input: CollectionSettingsUpdate, output: CollectionSettings },
  "agent.providers": { input: None, output: Schema.Array(AgentProviderView) },
  "agent.settings": { input: None, output: AgentSettings },
  "agent.configure": { input: AgentSettingsUpdate, output: AgentSettings },
  "agent.state": { input: None, output: AgentState },
  "agent.send": {
    input: Schema.Struct({ text: Schema.String, files: Schema.Array(AgentUpload) }),
    output: AgentState,
  },
  "agent.cancel": { input: None, output: AgentState },
  /** Starts a new chat; the open one stays in the history. */
  "agent.reset": { input: None, output: AgentState },
  "agent.select": { input: AgentSelect, output: AgentState },
  "agent.chats": { input: None, output: Schema.Array(AgentChatSummary) },
  "agent.open": { input: Schema.Struct({ id: Schema.String }), output: AgentState },
  "agent.delete": { input: Schema.Struct({ id: Schema.String }), output: AgentState },
  /** Renames a saved chat; the list refreshes through its event. */
  "agent.rename": {
    input: Schema.Struct({ id: Schema.String, title: Schema.String }),
    output: AgentState,
  },
  /** An attachment of a saved message, as base64, to show it again. */
  "agent.attachment": {
    input: Schema.Struct({ chatId: Schema.String, id: Schema.String }),
    output: Schema.Struct({ mime: Schema.String, data: Schema.String }),
  },
  /** Plan limits of each CLI's signed-in account; refresh asks the CLIs again. */
  "agent.usage": {
    input: Schema.Struct({ refresh: Schema.Boolean }),
    output: Schema.Array(AgentUsage),
  },
  "drafts.list": { input: None, output: Schema.Array(Draft) },
  "drafts.save": { input: DraftInput, output: Draft },
  "drafts.delete": { input: Schema.Struct({ id: Schema.String }), output: Schema.Struct({}) },
  /** Clears the posted/scheduled stamps so the draft can go out again (a deleted test post). */
  "drafts.unpost": { input: Schema.Struct({ id: Schema.String }), output: Draft },
  /** One image of a draft, as base64, to show it. Nothing calls it — media goes through /media/ — kept as internal API. */
  "drafts.image": {
    input: DraftImageRef,
    output: Schema.Struct({ mime: Schema.String, data: Schema.String }),
  },
  /** Adds an image the user picked (base64 of the file). */
  "drafts.addImage": {
    input: Schema.Struct({ id: Schema.String, data: Schema.String }),
    output: Draft,
  },
  "drafts.removeImage": { input: DraftImageRef, output: Draft },
  /** Reorders a draft's images; that order is the order the post attaches them. */
  "drafts.reorderImages": {
    input: Schema.Struct({ id: Schema.String, names: Schema.Array(Schema.String) }),
    output: Draft,
  },
  /** Adds a video the user picked (base64 of the file). */
  "drafts.addVideo": {
    input: Schema.Struct({ id: Schema.String, data: Schema.String }),
    output: Draft,
  },
  "drafts.removeVideo": { input: DraftImageRef, output: Draft },
  /** Puts the image on the clipboard, to paste into the platform's composer. */
  "drafts.copyImage": { input: DraftImageRef, output: Schema.Struct({}) },
  "drafts.showImage": { input: DraftImageRef, output: Schema.Struct({}) },
  /** Opens the posting window: the draft's contents on the left, the channel's composer on the right. */
  "post.open": { input: Schema.Struct({ id: Schema.String }), output: Schema.Struct({}) },
  /** Fills the open composer's media and submits or schedules the draft — after the pane's confirm. */
  "post.publish": {
    input: Schema.Struct({
      id: Schema.String,
      /** ISO wall-clock stamp; absent = post now. */
      schedule: Schema.optionalKey(Schema.String),
    }),
    output: Schema.Struct({ result: Schema.Literals(["posted", "scheduled"]) }),
  },
  /** What the composer can do right now (media slot, schedule support) — for the pane to hide what isn't there. */
  "post.capable": {
    input: Schema.Struct({ id: Schema.String }),
    output: Schema.Struct({
      schedule: Schema.Boolean,
      media: Schema.Boolean,
    }),
  },
  /** Posting settings — whether Loud may submit the composer after your confirm. */
  "posting.settings": { input: None, output: PostingSettings },
  "posting.configure": { input: PostingSettings, output: PostingSettings },
  /** The pane drag handle reports its width; the poster clamps and applies it. */
  "post.paneWidth": {
    input: Schema.Struct({ width: Schema.Number }),
    output: Schema.Struct({}),
  },
  "updates.settings": { input: None, output: UpdateSettings },
  "updates.configure": { input: UpdateSettings, output: UpdateSettings },
  "updates.status": { input: None, output: UpdateStatus },
  "updates.check": { input: None, output: UpdateStatus },
  /** Quits, installs the downloaded version and starts it again. */
  "updates.install": { input: None, output: Schema.Struct({}) },
  "usage.status": { input: None, output: UsageStatus },
  "usage.configure": { input: Schema.Struct({ share: Schema.Boolean }), output: UsageStatus },
  /** The report that would be sent now, to show before the user decides. */
  "usage.preview": { input: None, output: UsageReport },
} as const;

export type IpcMethod = keyof typeof IpcMethods;
export type IpcInput<M extends IpcMethod> = (typeof IpcMethods)[M]["input"]["Type"];
export type IpcOutput<M extends IpcMethod> = (typeof IpcMethods)[M]["output"]["Type"];

/** Pushed from the desktop when something the dashboard shows has changed. */
export const IpcEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literals(["platforms", "data", "settings", "drafts"]) }),
  Schema.Struct({ type: Schema.Literal("agent"), state: AgentState }),
  Schema.Struct({ type: Schema.Literal("agentChats"), chats: Schema.Array(AgentChatSummary) }),
  Schema.Struct({ type: Schema.Literal("agentUsage"), usage: Schema.Array(AgentUsage) }),
  Schema.Struct({ type: Schema.Literal("collect"), status: CollectStatus }),
  Schema.Struct({ type: Schema.Literal("updates"), status: UpdateStatus }),
  Schema.Struct({ type: Schema.Literal("usage"), status: UsageStatus }),
]);
export type IpcEvent = typeof IpcEvent.Type;
