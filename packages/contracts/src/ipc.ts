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
import { GeneralUpdate, Keywords } from "./settings.ts";
import { UpdateSettings, UpdateStatus } from "./updates.ts";
import { UsageReport, UsageStatus } from "./usage.ts";

const None = Schema.Struct({});
const ById = Schema.Struct({ id: ChannelId });

export const AppInfo = Schema.Struct({
  name: Schema.String,
  tagline: Schema.String,
  version: Schema.String,
  demo: Schema.Boolean,
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
  "data.hub": { input: None, output: Schema.Unknown },
  "data.proposals": { input: None, output: Schema.Unknown },
  "data.history": { input: None, output: Schema.Unknown },
  "links.open": { input: Schema.Struct({ url: Schema.String }), output: Schema.Struct({}) },
  /** Writes a CSV of the posts into the data folder and shows it in the file manager. */
  "data.exportPosts": { input: None, output: Schema.Struct({ file: Schema.String }) },
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
