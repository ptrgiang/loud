import type * as React from "react";
import { useEffect } from "react";

import { AppSidebar } from "~/components/AppSidebar";
import { CommandPalette } from "~/components/CommandPalette";
import { Toasts } from "~/components/Toasts";
import { Empty } from "~/components/PageHeader";
import { UsageQuestion } from "~/components/UsageReports";
import { inDesktop } from "~/lib/loud";
import { useLoud, type View, wireStore } from "~/store";
import { AgentView } from "~/views/AgentView";
import { ConnectionsView } from "~/views/ConnectionsView";
import { DraftsView } from "~/views/DraftsView";
import { InsightsView } from "~/views/InsightsView";
import { ListeningView } from "~/views/ListeningView";
import { OverviewView } from "~/views/OverviewView";
import { PlanView } from "~/views/PlanView";
import { PostsView } from "~/views/PostsView";
import { SettingsView } from "~/views/SettingsView";
import { useWork } from "~/workStore";

const VIEW: Record<View, () => React.ReactNode> = {
  overview: OverviewView,
  insights: InsightsView,
  plan: PlanView,
  posts: PostsView,
  listening: ListeningView,
  agent: AgentView,
  drafts: DraftsView,
  connections: ConnectionsView,
  settings: SettingsView,
};

function Current({ view }: { view: View }) {
  const Component = VIEW[view];
  return <Component />;
}

export function App() {
  const view = useLoud((s) => s.view);
  const loaded = useLoud((s) => s.loaded);

  useEffect(() => {
    wireStore();
    void useLoud.getState().load();
    if (inDesktop()) void useWork.getState().loadUsage();
    // Settings or a login may have changed while the window was in the background.
    const onFocus = () => void useLoud.getState().load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <div className="flex h-full">
      <AppSidebar />
      <main className="flex min-w-0 flex-1 flex-col bg-background">
        {!loaded ? null : !inDesktop() ? (
          <Empty title="Loud runs as a desktop app">
            Start it with pnpm dev from the repository.
          </Empty>
        ) : (
          <>
            <Current view={view} />
            <UsageQuestion />
            <CommandPalette />
          </>
        )}
      </main>
      <Toasts />
    </div>
  );
}
