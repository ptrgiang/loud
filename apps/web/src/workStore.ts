// State for the work surfaces: the agent conversation, drafts and collection. Kept apart from the data store because
// it changes on its own events (streamed agent text, collection progress) far more often than the data does.
import type {
  AgentChatSummary,
  AgentProviderView,
  AgentSelect,
  AgentSettings,
  AgentSettingsUpdate,
  AgentState,
  AgentUpload,
  AgentUsage,
  BudgetView,
  CollectionSettings,
  CollectionSettingsUpdate,
  CollectStart,
  CollectStatus,
  CollectStep,
  Draft,
  DraftInput,
  Keywords,
  StepState,
  UpdateSettings,
  UpdateStatus,
  UsageReport,
  UsageStatus,
} from "@loud/contracts";
import { create } from "zustand";

import { call } from "~/lib/loud";
import { useLoud } from "~/store";

interface WorkState {
  readonly agent: AgentState | null;
  readonly agentSettings: AgentSettings | null;
  readonly chats: ReadonlyArray<AgentChatSummary>;
  readonly agentUsage: ReadonlyArray<AgentUsage>;
  readonly providers: ReadonlyArray<AgentProviderView>;
  readonly drafts: ReadonlyArray<Draft>;
  readonly collect: CollectStatus | null;
  /** Each step's latest result this session, so collecting one platform keeps the others' last outcome on screen. */
  readonly lastSteps: Partial<Record<CollectStep, StepState>>;
  readonly collection: CollectionSettings | null;
  readonly budgets: ReadonlyArray<BudgetView>;
  readonly updates: UpdateStatus | null;
  readonly updateSettings: UpdateSettings | null;
  readonly usage: UsageStatus | null;
  readonly keywords: Keywords | null;

  readonly loadAgent: () => Promise<void>;
  readonly loadProviders: () => Promise<void>;
  readonly configureAgent: (update: AgentSettingsUpdate) => Promise<void>;
  readonly send: (text: string, files?: ReadonlyArray<AgentUpload>) => Promise<boolean>;
  /** A request from elsewhere in the app: in a new chat, then the Agent view. Settings when the agent is off. */
  readonly ask: (text: string) => Promise<void>;
  readonly selectAgent: (input: AgentSelect) => Promise<void>;
  readonly loadChats: () => Promise<void>;
  readonly openChat: (id: string) => Promise<void>;
  readonly deleteChat: (id: string) => Promise<void>;
  readonly loadAgentUsage: (refresh: boolean) => Promise<void>;
  readonly cancel: () => Promise<void>;
  readonly reset: () => Promise<void>;
  readonly loadDrafts: () => Promise<void>;
  readonly saveDraft: (input: DraftInput) => Promise<Draft | null>;
  readonly deleteDraft: (id: string) => Promise<void>;
  readonly loadCollect: () => Promise<void>;
  readonly startCollect: (input?: CollectStart) => Promise<void>;
  readonly cancelCollect: () => Promise<void>;
  readonly configureCollection: (update: CollectionSettingsUpdate) => Promise<void>;
  readonly resumePlatform: (id: BudgetView["id"]) => Promise<void>;
  readonly loadUpdates: () => Promise<void>;
  readonly configureUpdates: (update: UpdateSettings) => Promise<void>;
  readonly checkUpdates: () => Promise<void>;
  readonly installUpdate: () => Promise<void>;
  readonly loadUsage: () => Promise<void>;
  readonly loadKeywords: () => Promise<void>;
  readonly configureUsage: (share: boolean) => Promise<void>;
  readonly previewUsage: () => Promise<UsageReport | null>;
}

/** Errors go to the app's error bar, like every other failed call. */
const report = (error: unknown) =>
  useLoud.setState({ error: error instanceof Error ? error.message : String(error) });

export const useWork = create<WorkState>()((set, get) => ({
  agent: null,
  agentSettings: null,
  chats: [],
  agentUsage: [],
  providers: [],
  drafts: [],
  collect: null,
  lastSteps: {},
  collection: null,
  budgets: [],
  updates: null,
  updateSettings: null,
  usage: null,
  keywords: null,

  loadAgent: async () => {
    try {
      const [agent, agentSettings] = await Promise.all([
        call("agent.state", {}),
        call("agent.settings", {}),
      ]);
      set({ agent, agentSettings });
    } catch (e) {
      report(e);
    }
  },
  loadProviders: async () => {
    try {
      set({ providers: await call("agent.providers", {}) });
    } catch (e) {
      report(e);
    }
  },
  configureAgent: async (update) => {
    try {
      set({ agentSettings: await call("agent.configure", update) });
      // A new chat takes its provider and model from these settings.
      set({ agent: await call("agent.state", {}) });
    } catch (e) {
      report(e);
    }
  },
  send: async (text, files = []) => {
    try {
      set({ agent: await call("agent.send", { text, files: [...files] }) });
      return true;
    } catch (e) {
      report(e);
      return false;
    }
  },
  ask: async (text) => {
    const go = useLoud.getState().go;
    if (!get().agentSettings) await get().loadAgent();
    if (!get().agentSettings?.enabled) return go("settings");
    if (get().agent?.busy) {
      go("agent");
      return report("The agent is still answering. Stop it or wait, then try again.");
    }
    if (get().agent?.messages.length) await get().reset();
    if (await get().send(text)) go("agent");
  },
  selectAgent: async (input) => {
    try {
      const agent = await call("agent.select", input);
      set({ agent, agentSettings: await call("agent.settings", {}) });
    } catch (e) {
      report(e);
    }
  },
  loadChats: async () => {
    try {
      set({ chats: await call("agent.chats", {}) });
    } catch (e) {
      report(e);
    }
  },
  openChat: async (id) => {
    try {
      set({ agent: await call("agent.open", { id }) });
    } catch (e) {
      report(e);
    }
  },
  deleteChat: async (id) => {
    try {
      set({ agent: await call("agent.delete", { id }) });
    } catch (e) {
      report(e);
    }
  },
  loadAgentUsage: async (refresh) => {
    try {
      set({ agentUsage: await call("agent.usage", { refresh }) });
    } catch (e) {
      report(e);
    }
  },
  cancel: async () => {
    try {
      set({ agent: await call("agent.cancel", {}) });
    } catch (e) {
      report(e);
    }
  },
  reset: async () => {
    try {
      set({ agent: await call("agent.reset", {}) });
    } catch (e) {
      report(e);
    }
  },
  loadDrafts: async () => {
    try {
      set({ drafts: await call("drafts.list", {}) });
    } catch (e) {
      report(e);
    }
  },
  saveDraft: async (input) => {
    try {
      const d = await call("drafts.save", input);
      set((s) => ({ drafts: [d, ...s.drafts.filter((x) => x.id !== d.id)] }));
      return d;
    } catch (e) {
      report(e);
      return null;
    }
  },
  deleteDraft: async (id) => {
    try {
      await call("drafts.delete", { id });
      set((s) => ({ drafts: s.drafts.filter((d) => d.id !== id) }));
    } catch (e) {
      report(e);
    }
  },
  loadCollect: async () => {
    try {
      const [collect, collection, budgets] = await Promise.all([
        call("collect.status", {}),
        call("collect.settings", {}),
        call("collect.budgets", {}),
      ]);
      set({ collection, budgets });
      setCollect(collect);
    } catch (e) {
      report(e);
    }
  },
  startCollect: async (input = {}) => {
    try {
      setCollect(await call("collect.start", input));
    } catch (e) {
      report(e);
    }
  },
  cancelCollect: async () => {
    try {
      setCollect(await call("collect.cancel", {}));
    } catch (e) {
      report(e);
    }
  },
  configureCollection: async (update) => {
    try {
      set({ collection: await call("collect.configure", update) });
      setCollect(await call("collect.status", {}));
    } catch (e) {
      report(e);
    }
  },
  resumePlatform: async (id) => {
    try {
      set({ budgets: await call("collect.resume", { id }) });
    } catch (e) {
      report(e);
    }
  },
  loadUpdates: async () => {
    try {
      const [updates, updateSettings] = await Promise.all([
        call("updates.status", {}),
        call("updates.settings", {}),
      ]);
      set({ updates, updateSettings });
    } catch (e) {
      report(e);
    }
  },
  configureUpdates: async (update) => {
    try {
      set({ updateSettings: await call("updates.configure", update) });
    } catch (e) {
      report(e);
    }
  },
  checkUpdates: async () => {
    try {
      set({ updates: await call("updates.check", {}) });
    } catch (e) {
      report(e);
    }
  },
  installUpdate: async () => {
    try {
      await call("updates.install", {});
    } catch (e) {
      report(e);
    }
  },
  loadKeywords: async () => {
    try {
      set({ keywords: await call("keywords.get", {}) });
    } catch (e) {
      report(e);
    }
  },
  loadUsage: async () => {
    try {
      set({ usage: await call("usage.status", {}) });
    } catch (e) {
      report(e);
    }
  },
  configureUsage: async (share) => {
    try {
      set({ usage: await call("usage.configure", { share }) });
    } catch (e) {
      report(e);
    }
  },
  previewUsage: async () => {
    try {
      return await call("usage.preview", {});
    } catch (e) {
      report(e);
      return null;
    }
  },
}));

/** Every collection status goes through here, from a call or an event. */
export function setCollect(collect: CollectStatus) {
  const lastSteps = { ...useWork.getState().lastSteps };
  for (const step of collect.steps) if (step.status !== "waiting") lastSteps[step.step] = step;
  useWork.setState({ collect, lastSteps });
}
