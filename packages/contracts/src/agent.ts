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
  /** Empty: the CLI's own default model. */
  model: Schema.String,
  /** The user's own rules for their channels; the agent follows them. */
  playbook: Schema.String,
});
export type AgentSettings = typeof AgentSettings.Type;

export const AgentSettingsUpdate = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  provider: Schema.optionalKey(AgentProviderId),
  model: Schema.optionalKey(Schema.String),
  playbook: Schema.optionalKey(Schema.String),
});
export type AgentSettingsUpdate = typeof AgentSettingsUpdate.Type;

export const AgentModel = Schema.Struct({ id: Schema.String, label: Schema.String });
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

export const AgentMessage = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(["user", "assistant"]),
  text: Schema.String,
  /** Loud tools the agent called while writing this answer, in order. */
  tools: Schema.Array(Schema.String),
  at: Schema.String,
  error: Schema.optionalKey(Schema.String),
});
export type AgentMessage = typeof AgentMessage.Type;

export const AgentState = Schema.Struct({
  busy: Schema.Boolean,
  provider: AgentProviderId,
  messages: Schema.Array(AgentMessage),
  /** Estimated spend of this conversation as the CLI reports it; null when it does not. */
  costUsd: Schema.NullOr(Schema.Number),
});
export type AgentState = typeof AgentState.Type;

// ---- Drafts: posts being written, kept in the data folder. Loud never posts them. ----

export const Draft = Schema.Struct({
  id: Schema.String,
  channel: ChannelId,
  text: Schema.String,
  /** What the post is for, or what the agent was asked. */
  note: Schema.String,
  by: Schema.Literals(["you", "agent"]),
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

export interface DraftsFile {
  readonly drafts: ReadonlyArray<Draft>;
}
