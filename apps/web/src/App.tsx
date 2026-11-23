import type * as React from "react";
import { useEffect } from "react";

import { AppSidebar } from "~/components/AppSidebar";
import { CommandPalette } from "~/components/CommandPalette";
import { Toasts } from "~/components/Toasts";
import { Empty } from "~/components/PageHeader";
import { UsageQuestion } from "~/components/UsageReports";
import { useT } from "~/i18n";
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
  const t = useT();
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
        {!loaded ? (
          <div className="flex flex-col gap-4 p-6" aria-hidden>
            <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
            <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl border bg-card" />
              ))}
            </div>
            <div className="h-56 animate-pulse rounded-xl border bg-card" />
            <div className="h-32 animate-pulse rounded-xl border bg-card" />
          </div>
        ) : !inDesktop() ? (
          <Empty title={t("app.notDesktop.title")}>{t("app.notDesktop.body")}</Empty>
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
