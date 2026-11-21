import {
  Bot,
  CalendarClock,
  ChartNoAxesColumn,
  Ear,
  LayoutDashboard,
  Loader,
  type LucideIcon,
  Moon,
  NotebookPen,
  Plug,
  Rows3,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { CHANNEL_NAMES, type CollectStep } from "@loud/contracts";
import { useEffect } from "react";

import { useTheme } from "~/lib/theme";
import { cn } from "~/lib/utils";
import { usePalette } from "~/components/CommandPalette";
import { LoudMark } from "~/components/LoudMark";
import { RestartToUpdate, UpdateButton } from "~/components/UpdateControl";
import { useLoud, type View } from "~/store";
import { useWork } from "~/workStore";

const STEP_NAME: Record<CollectStep, string> = { ...CHANNEL_NAMES, listen: "listening" };

interface NavItem {
  readonly view: View;
  readonly label: string;
  readonly icon: LucideIcon;
}

const GROUPS: ReadonlyArray<{ readonly label: string; readonly items: ReadonlyArray<NavItem> }> = [
  {
    label: "Results",
    items: [
      { view: "overview", label: "Today", icon: LayoutDashboard },
      { view: "posts", label: "Posts", icon: Rows3 },
      { view: "insights", label: "Insights", icon: ChartNoAxesColumn },
    ],
  },
  {
    label: "Next",
    items: [
      { view: "plan", label: "Plan", icon: CalendarClock },
      { view: "listening", label: "Listening", icon: Ear },
    ],
  },
  {
    label: "Write",
    items: [
      { view: "drafts", label: "Drafts", icon: NotebookPen },
      { view: "agent", label: "Agent", icon: Bot },
    ],
  },
];

function SidebarRow({
  item,
  active,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      data-active={active}
      onClick={onSelect}
      className={cn(
        "flex h-8 w-full cursor-pointer items-center gap-[var(--sidebar-control-gap)] overflow-hidden rounded-[var(--control-radius)] px-[var(--sidebar-row-content-inset)] py-1.5 text-left font-medium text-sidebar-muted-foreground/80 text-sm outline-hidden ring-ring transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset active:bg-sidebar-row-active",
        "data-[active=true]:bg-sidebar-row-selected data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-xs/5 dark:data-[active=true]:shadow-none",
        "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-[var(--sidebar-icon-color)] hover:[&>svg]:text-sidebar-foreground data-[active=true]:[&>svg]:text-sidebar-foreground",
      )}
    >
      <Icon />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

export function AppSidebar() {
  const view = useLoud((s) => s.view);
  const go = useLoud((s) => s.go);
  const platforms = useLoud((s) => s.platforms);
  const connected = platforms.filter((p) => p.status === "connected").length;
  const dark = useTheme((s) => s.dark);
  const toggleTheme = useTheme((s) => s.toggle);
  const current = useWork((s) =>
    s.collect?.running ? (s.collect.steps.find((x) => x.status === "running")?.step ?? null) : null,
  );
  const loadCollect = useWork((s) => s.loadCollect);
  useEffect(() => void loadCollect(), [loadCollect]);

  return (
    <aside
      data-app-sidebar
      className="flex w-60 shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground"
    >
      <div className="flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-2 px-4">
        <LoudMark />
        <span className="font-semibold text-sm tracking-tight">Loud</span>
      </div>

      <div className="px-[var(--sidebar-content-inset)] pb-2">
        <button
          type="button"
          onClick={() => usePalette.getState().set(true)}
          className="flex h-8 w-full cursor-pointer items-center gap-[var(--sidebar-control-gap)] rounded-[var(--control-radius)] border border-sidebar-border px-[var(--sidebar-row-content-inset)] text-left text-sidebar-muted-foreground text-sm hover:bg-sidebar-row-hover hover:text-sidebar-foreground [&>svg]:size-4"
        >
          <Search />
          <span className="flex-1 truncate">Search</span>
          <kbd className="rounded border border-sidebar-border px-1 font-sans text-2xs">
            {navigator.platform.startsWith("Mac") ? "⌘K" : "Ctrl K"}
          </kbd>
        </button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[var(--sidebar-content-inset)] pt-1 pb-3">
        {GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <div className="px-[var(--sidebar-row-content-inset)] pb-1 font-medium text-2xs text-sidebar-muted-foreground uppercase tracking-wide">
              {group.label}
            </div>
            {group.items.map((item) => (
              <SidebarRow
                key={item.view}
                item={item}
                active={view === item.view}
                onSelect={() => go(item.view)}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-0.5 border-sidebar-border border-t px-[var(--sidebar-content-inset)] py-2">
        <SidebarRow
          item={{ view: "connections", label: "Connections", icon: Plug }}
          active={view === "connections"}
          onSelect={() => go("connections")}
        />
        <SidebarRow
          item={{ view: "settings", label: "Settings", icon: Settings }}
          active={view === "settings"}
          onSelect={() => go("settings")}
        />
        <div className="px-[var(--sidebar-row-content-inset)] pt-1 empty:hidden">
          <RestartToUpdate />
        </div>
        <div className="flex items-center justify-between gap-2 px-[var(--sidebar-row-content-inset)] pt-1">
          <button
            type="button"
            onClick={() => go("connections")}
            className="flex min-w-0 cursor-pointer items-center gap-1.5 text-2xs text-sidebar-muted-foreground tabular-nums hover:text-sidebar-foreground"
          >
            {current ? (
              <>
                <Loader className="size-3 shrink-0 animate-spin" />
                <span className="truncate">Collecting {STEP_NAME[current]}…</span>
              </>
            ) : (
              <span className="truncate">
                {connected} of {platforms.length || 4} connected
              </span>
            )}
          </button>
          <div className="flex items-center gap-0.5">
            <UpdateButton />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              className="flex size-6 cursor-pointer items-center justify-center rounded-md text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground [&>svg]:size-3.5"
            >
              {dark ? <Sun /> : <Moon />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
