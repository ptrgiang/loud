// The in-app agent. It runs through a coding-agent CLI the user already signed in to (Claude Code or Codex), so Loud
// never holds a model key. Off until the user turns it on: what it reads leaves the computer for that vendor.
import * as Schema from "effect/Schema";

import { ChannelId } from "./channel.ts";

export const AGENT_PROVIDER_IDS = ["claude", "codex"] as const;
export const AgentProviderId = Schema.Literals(AGENT_PROVIDER_IDS);
export type AgentProviderId = typeof AgentProviderId.Type;

export const AGENT_VENDORS: Record<
  AgentProviderId,
  { readonly name: string; readonly vendor: string }
> = {
  claude: { name: "Claude Code", vendor: "Anthropic" },
  codex: { name: "Codex", vendor: "OpenAI" },
};

export const AgentSettings = Schema.Struct({
  enabled: Schema.Boolean,
  provider: AgentProviderId,
  /** Empty: the CLI's own default model. The default for new chats; each chat keeps its own. */
  model: Schema.String,
  /** Reasoning effort; empty: the model's default. */
  effort: Schema.String,
  /** The user's own rules for their channels; the agent follows them. */
  playbook: Schema.String,
});
export type AgentSettings = typeof AgentSettings.Type;

export const AgentSettingsUpdate = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  provider: Schema.optionalKey(AgentProviderId),
  model: Schema.optionalKey(Schema.String),
  effort: Schema.optionalKey(Schema.String),
  playbook: Schema.optionalKey(Schema.String),
});
export type AgentSettingsUpdate = typeof AgentSettingsUpdate.Type;

export const AgentModel = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  /** Reasoning efforts the model takes; empty when it has none to choose. */
  efforts: Schema.Array(Schema.String),
  /** Accepts images. */
  images: Schema.Boolean,
});
export type AgentModel = typeof AgentModel.Type;

export const AgentProviderView = Schema.Struct({
  id: AgentProviderId,
  name: Schema.String,
  vendor: Schema.String,
  /** The CLI was found and answered --version. */
  available: Schema.Boolean,
  version: Schema.optionalKey(Schema.String),
  /** Where the CLI is, or why it could not be used. */
  detail: Schema.String,
  models: Schema.Array(AgentModel),
});
export type AgentProviderView = typeof AgentProviderView.Type;

export const AgentAttachment = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  mime: Schema.String,
  size: Schema.Number,
  /** Images go to the model as images; text files are pasted into the message. */
  kind: Schema.Literals(["image", "text"]),
});
export type AgentAttachment = typeof AgentAttachment.Type;

/** A file the user attached in the composer, read in the dashboard. */
export const AgentUpload = Schema.Struct({
  name: Schema.String,
  mime: Schema.String,
  /** Base64. */
  data: Schema.String,
});
export type AgentUpload = typeof AgentUpload.Type;

export const AGENT_LIMITS = {
  files: 6,
  imageBytes: 5 * 1024 * 1024,
  textBytes: 256 * 1024,
} as const;

export const AgentMessage = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(["user", "assistant"]),
  text: Schema.String,
  attachments: Schema.optionalKey(Schema.Array(AgentAttachment)),
  /** Loud tools the agent called while writing this answer, in order. */
  tools: Schema.Array(Schema.String),
  at: Schema.String,
  error: Schema.optionalKey(Schema.String),
});
export type AgentMessage = typeof AgentMessage.Type;

/** One saved conversation in the history list. */
export const AgentChatSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  provider: AgentProviderId,
  updated: Schema.String,
  messages: Schema.Number,
});
export type AgentChatSummary = typeof AgentChatSummary.Type;

export const AgentState = Schema.Struct({
  busy: Schema.Boolean,
  /** The open chat; null for a new one nothing was sent in yet. */
  chatId: Schema.NullOr(Schema.String),
  /** Fixed once the chat has messages: a conversation cannot move to another CLI. */
  provider: AgentProviderId,
  model: Schema.String,
  effort: Schema.String,
  messages: Schema.Array(AgentMessage),
  /** Estimated spend of this conversation as the CLI reports it; null when it does not. */
  costUsd: Schema.NullOr(Schema.Number),
});
export type AgentState = typeof AgentState.Type;

export const AgentSelect = Schema.Struct({
  provider: Schema.optionalKey(AgentProviderId),
  model: Schema.optionalKey(Schema.String),
  effort: Schema.optionalKey(Schema.String),
});
export type AgentSelect = typeof AgentSelect.Type;

/** One plan limit, as the CLI reports it for the signed-in account. */
export const AgentUsageWindow = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  usedPercent: Schema.Number,
  resetsAt: Schema.NullOr(Schema.String),
});
export type AgentUsageWindow = typeof AgentUsageWindow.Type;

export const AgentUsage = Schema.Struct({
  provider: AgentProviderId,
  /** Null until the first check. */
  checkedAt: Schema.NullOr(Schema.String),
  plan: Schema.NullOr(Schema.String),
  windows: Schema.Array(AgentUsageWindow),
  /** Why there are no windows: not installed, an API key with no plan limits, or the check failed. */
  note: Schema.NullOr(Schema.String),
});
export type AgentUsage = typeof AgentUsage.Type;

// ---- Drafts: posts being written, kept in the data folder. Loud never posts them. ----

export const Draft = Schema.Struct({
  id: Schema.String,
  channel: ChannelId,
  text: Schema.String,
  /** What the post is for, or what the agent was asked. */
  note: Schema.String,
  by: Schema.Literals(["you", "agent"]),
  /** File names in the draft's own folder, in posting order. */
  images: Schema.optionalKey(Schema.Array(Schema.String)),
  created: Schema.String,
  updated: Schema.String,
});
export type Draft = typeof Draft.Type;

export const DraftInput = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  channel: ChannelId,
  text: Schema.String,
  note: Schema.optionalKey(Schema.String),
});
export type DraftInput = typeof DraftInput.Type;

/** Per draft. X takes 4 images a post; Threads and Instagram take 10 (Instagram as a carousel). */
export const DRAFT_IMAGES_MAX = 10;

export interface DraftsFile {
  readonly drafts: ReadonlyArray<Draft>;
}
