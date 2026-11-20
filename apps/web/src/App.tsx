import { X } from "lucide-react";
import type * as React from "react";
import { useEffect } from "react";

import { AppSidebar } from "~/components/AppSidebar";
import { Empty } from "~/components/PageHeader";
import { Button } from "~/components/ui/button";
import { inDesktop } from "~/lib/loud";
import { useLoud, type View, wireStore } from "~/store";
import { AgentView } from "~/views/AgentView";
import { AuditView } from "~/views/AuditView";
import { ConnectionsView } from "~/views/ConnectionsView";
import { DraftsView } from "~/views/DraftsView";
import { InsightsView } from "~/views/InsightsView";
import { ListeningView } from "~/views/ListeningView";
import { OverviewView } from "~/views/OverviewView";
import { PostsView } from "~/views/PostsView";
import { ProposalsView } from "~/views/ProposalsView";
import { ScheduleView } from "~/views/ScheduleView";
import { SettingsView } from "~/views/SettingsView";

const VIEW: Record<View, () => React.ReactNode> = {
  overview: OverviewView,
  insights: InsightsView,
  proposals: ProposalsView,
  schedule: ScheduleView,
  posts: PostsView,
  audit: AuditView,
  listening: ListeningView,
  agent: AgentView,
  drafts: DraftsView,
  connections: ConnectionsView,
  settings: SettingsView,
};

function ErrorBar() {
  const error = useLoud((s) => s.error);
  if (!error) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b bg-error/8 px-6 py-2 text-error-foreground text-xs">
      <span>{error}</span>
      <Button
        size="icon-xs"
        variant="ghost-muted"
        aria-label="Dismiss"
        onClick={() => useLoud.setState({ error: null })}
      >
        <X />
      </Button>
    </div>
  );
}

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
    // Settings or a login may have changed while the window was in the background.
    const onFocus = () => void useLoud.getState().load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <div className="flex h-full">
      <AppSidebar />
      <main className="flex min-w-0 flex-1 flex-col bg-background">
        <ErrorBar />
        {!loaded ? null : !inDesktop() ? (
          <Empty title="Loud runs as a desktop app">
            Start it with pnpm dev from the repository.
          </Empty>
        ) : (
          <Current view={view} />
        )}
      </main>
    </div>
  );
}
