// State for the work surfaces: the agent conversation, drafts and collection. Kept apart from the data store because
// it changes on its own events (streamed agent text, collection progress) far more often than the data does.
import type {
  AgentProviderView,
  AgentSettings,
  AgentSettingsUpdate,
  AgentState,
  BudgetView,
  CollectionSettings,
  CollectionSettingsUpdate,
  CollectStart,
  CollectStatus,
  CollectStep,
  Draft,
  DraftInput,
  StepState,
  UpdateSettings,
  UpdateStatus,
} from "@loud/contracts";
import { create } from "zustand";

import { call } from "~/lib/loud";
import { useLoud } from "~/store";

interface WorkState {
  readonly agent: AgentState | null;
  readonly agentSettings: AgentSettings | null;
  readonly providers: ReadonlyArray<AgentProviderView>;
  readonly drafts: ReadonlyArray<Draft>;
  readonly collect: CollectStatus | null;
  /** Each step's latest result this session, so collecting one platform keeps the others' last outcome on screen. */
  readonly lastSteps: Partial<Record<CollectStep, StepState>>;
  readonly collection: CollectionSettings | null;
  readonly budgets: ReadonlyArray<BudgetView>;
  readonly updates: UpdateStatus | null;
  readonly updateSettings: UpdateSettings | null;

  readonly loadAgent: () => Promise<void>;
  readonly loadProviders: () => Promise<void>;
  readonly configureAgent: (update: AgentSettingsUpdate) => Promise<void>;
  readonly send: (text: string) => Promise<boolean>;
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
}

/** Errors go to the app's error bar, like every other failed call. */
const report = (error: unknown) =>
  useLoud.setState({ error: error instanceof Error ? error.message : String(error) });

export const useWork = create<WorkState>()((set) => ({
  agent: null,
  agentSettings: null,
  providers: [],
  drafts: [],
  collect: null,
  lastSteps: {},
  collection: null,
  budgets: [],
  updates: null,
  updateSettings: null,

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
    } catch (e) {
      report(e);
    }
  },
  send: async (text) => {
    try {
      set({ agent: await call("agent.send", { text }) });
      return true;
    } catch (e) {
      report(e);
      return false;
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
}));

/** Every collection status goes through here, from a call or an event. */
export function setCollect(collect: CollectStatus) {
  const lastSteps = { ...useWork.getState().lastSteps };
  for (const step of collect.steps) if (step.status !== "waiting") lastSteps[step.step] = step;
  useWork.setState({ collect, lastSteps });
}
