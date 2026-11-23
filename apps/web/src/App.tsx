import type * as React from "react";
import { lazy, Suspense, useEffect, useState } from "react";

import { AppSidebar } from "~/components/AppSidebar";
import { CommandPalette } from "~/components/CommandPalette";
import { Toasts } from "~/components/Toasts";
import { Empty } from "~/components/PageHeader";
import { UsageQuestion } from "~/components/UsageReports";
import { useT } from "~/i18n";
import { inDesktop } from "~/lib/loud";
import { useSidebar } from "~/lib/sidebar";
import { useLoud, type View, wireStore } from "~/store";
import { PostKitView } from "~/views/PostKitView";
import { useWork } from "~/workStore";

// Each view is its own chunk: the app opens on whatever you look at first instead of parsing all of them.
const VIEW: Record<View, React.LazyExoticComponent<() => React.ReactNode>> = {
  overview: lazy(() => import("~/views/OverviewView").then((m) => ({ default: m.OverviewView }))),
  insights: lazy(() => import("~/views/InsightsView").then((m) => ({ default: m.InsightsView }))),
  plan: lazy(() => import("~/views/PlanView").then((m) => ({ default: m.PlanView }))),
  posts: lazy(() => import("~/views/PostsView").then((m) => ({ default: m.PostsView }))),
  listening: lazy(() =>
    import("~/views/ListeningView").then((m) => ({ default: m.ListeningView })),
  ),
  agent: lazy(() => import("~/views/AgentView").then((m) => ({ default: m.AgentView }))),
  drafts: lazy(() => import("~/views/DraftsView").then((m) => ({ default: m.DraftsView }))),
  connections: lazy(() =>
    import("~/views/ConnectionsView").then((m) => ({ default: m.ConnectionsView })),
  ),
  settings: lazy(() =>
    import("~/views/SettingsView").then((m) => ({ default: m.SettingsView })),
  ),
};

/** Matches a loaded page's shape: top bar, a card row, then a wide surface. */
function Skeleton() {
  return (
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
  );
}

function Current({ view }: { view: View }) {
  const Component = VIEW[view];
  return (
    <Suspense fallback={<Skeleton />}>
      <Component />
    </Suspense>
  );
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
    // Ctrl/Cmd+B collapses the sidebar — the convention editors and IDEs share.
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        useSidebar.getState().toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // The posting window's pane loads loud://app#post/<id> — a bare kit, none of the app's chrome. Reactive
  // because setting the hash after mount doesn't re-render this component by itself.
  const [postId, setPostId] = useState(() => /^#\/?post\/([a-z0-9]+)/.exec(location.hash)?.[1]);
  useEffect(() => {
    const onHash = () => setPostId(/^#\/?post\/([a-z0-9]+)/.exec(location.hash)?.[1]);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  if (postId) {
    return (
      <div className="h-full">
        <PostKitView id={postId} />
        <Toasts />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <a
        href="#loud-main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("loud-main")?.focus();
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:border focus:bg-popover focus:px-3 focus:py-1.5 focus:text-sm"
      >
        {t("app.skipToContent")}
      </a>
      <AppSidebar />
      <main id="loud-main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col bg-background outline-none">
        {!loaded ? (
          <Skeleton />
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
