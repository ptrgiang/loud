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
  PanelLeft,
  Plug,
  Rows3,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { CHANNEL_NAMES, type CollectStep } from "@loud/contracts";
import { useEffect } from "react";

import { useT, type MsgKey } from "~/i18n";
import { useTheme } from "~/lib/theme";
import { cn } from "~/lib/utils";
import { usePalette } from "~/components/CommandPalette";
import { LoudMark } from "~/components/LoudMark";
import { Badge } from "~/components/ui/badge";
import { RestartToUpdate, UpdateButton } from "~/components/UpdateControl";
import { useSidebar } from "~/lib/sidebar";
import { useLoud, type View } from "~/store";
import { useWork } from "~/workStore";

// Platform names are proper nouns and stay as-is; only the listening step is a translated word.
const STEP_NAME: Partial<Record<CollectStep, string>> = { ...CHANNEL_NAMES };

interface NavItem {
  readonly view: View;
  readonly label: MsgKey;
  readonly icon: LucideIcon;
}

const GROUPS: ReadonlyArray<{ readonly label: MsgKey; readonly items: ReadonlyArray<NavItem> }> = [
  {
    label: "nav.group.results",
    items: [
      { view: "overview", label: "nav.overview", icon: LayoutDashboard },
      { view: "posts", label: "nav.posts", icon: Rows3 },
      { view: "insights", label: "nav.insights", icon: ChartNoAxesColumn },
    ],
  },
  {
    label: "nav.group.next",
    items: [
      { view: "plan", label: "nav.plan", icon: CalendarClock },
      { view: "listening", label: "nav.listening", icon: Ear },
    ],
  },
  {
    label: "nav.group.write",
    items: [
      { view: "agent", label: "nav.agent", icon: Bot },
      { view: "drafts", label: "nav.drafts", icon: NotebookPen },
    ],
  },
];

function SidebarRow({
  item,
  active,
  collapsed,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onSelect: () => void;
}) {
  const t = useT();
  const Icon = item.icon;
  return (
    <button
      type="button"
      data-active={active}
      onClick={onSelect}
      title={collapsed ? t(item.label) : undefined}
      aria-label={collapsed ? t(item.label) : undefined}
      className={cn(
        "relative flex h-8 w-full cursor-pointer items-center gap-[var(--sidebar-control-gap)] overflow-hidden rounded-[var(--control-radius)] px-[var(--sidebar-row-content-inset)] py-1.5 text-left font-medium text-sidebar-muted-foreground/80 text-sm outline-hidden ring-ring transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset active:bg-sidebar-row-active",
        "data-[active=true]:bg-sidebar-row-selected data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-xs/5 dark:data-[active=true]:shadow-none",
        "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-[var(--sidebar-icon-color)] hover:[&>svg]:text-sidebar-foreground data-[active=true]:[&>svg]:text-sidebar-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute top-1/2 left-[3px] h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary"
        />
      )}
      <Icon />
      {!collapsed && <span className="truncate">{t(item.label)}</span>}
    </button>
  );
}

export function AppSidebar() {
  const t = useT();
  const view = useLoud((s) => s.view);
  const go = useLoud((s) => s.go);
  const platforms = useLoud((s) => s.platforms);
  const version = useLoud((s) => s.info?.version ?? "");
  const demo = useLoud((s) => s.info?.demo ?? false);
  const connected = platforms.filter((p) => p.status === "connected").length;
  const dark = useTheme((s) => s.dark);
  const toggleTheme = useTheme((s) => s.toggle);
  const current = useWork((s) =>
    s.collect?.running ? (s.collect.steps.find((x) => x.status === "running")?.step ?? null) : null,
  );
  const loadCollect = useWork((s) => s.loadCollect);
  const collapsed = useSidebar((s) => s.collapsed);
  const toggleSidebar = useSidebar((s) => s.toggle);
  useEffect(() => void loadCollect(), [loadCollect]);

  const iconBtn =
    "flex size-7 cursor-pointer items-center justify-center rounded-md text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground [&>svg]:size-4";

  return (
    <aside
      data-app-sidebar
      className={cn(
        "flex shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-2",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        <span className="relative" title={demo && collapsed ? t("common.demo") : undefined}>
          <LoudMark />
          {demo && collapsed && (
            <span
              aria-hidden
              className="absolute -right-1 -bottom-0.5 size-2 rounded-full bg-warning-foreground"
            />
          )}
        </span>
        {!collapsed && (
          <>
            <span className="font-semibold text-sm tracking-tight">Loud</span>
            {demo && (
              <Badge variant="outline" size="sm" className="text-muted-foreground">
                {t("common.demo")}
              </Badge>
            )}
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={t("sidebar.collapse")}
              title={t("sidebar.collapse")}
              className={cn(iconBtn, "ml-auto")}
            >
              <PanelLeft />
            </button>
          </>
        )}
      </div>
      <div
        className={cn(
          collapsed ? "flex flex-col gap-0.5 px-1 pb-2" : "px-[var(--sidebar-content-inset)] pb-2",
        )}
      >
        {collapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={t("sidebar.expand")}
            title={t("sidebar.expand")}
            className="flex h-8 w-full cursor-pointer items-center justify-center rounded-[var(--control-radius)] text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground [&>svg]:size-4"
          >
            <PanelLeft />
          </button>
        )}
        <button
          type="button"
          onClick={() => usePalette.getState().set(true)}
          title={collapsed ? `${t("nav.search")} (Ctrl K)` : undefined}
          aria-label={collapsed ? `${t("nav.search")} (Ctrl K)` : undefined}
          className={cn(
            "flex h-8 cursor-pointer items-center gap-[var(--sidebar-control-gap)] rounded-[var(--control-radius)] text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground [&>svg]:size-4",
            collapsed
              ? "w-full justify-center"
              : "w-full border border-sidebar-border px-[var(--sidebar-row-content-inset)] text-left text-sm",
          )}
        >
          <Search />
          {!collapsed && (
            <>
              <span className="flex-1 truncate">{t("nav.search")}</span>
              <kbd className="rounded border border-sidebar-border px-1 font-sans text-2xs">
                {navigator.platform.startsWith("Mac") ? "⌘K" : "Ctrl K"}
              </kbd>
            </>
          )}
        </button>
      </div>

      <nav
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto pt-1 pb-3",
          collapsed ? "gap-1 px-1" : "gap-4 px-[var(--sidebar-content-inset)]",
        )}
      >
        {GROUPS.map((group, gi) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            {collapsed ? (
              gi > 0 && <div aria-hidden className="mx-1 mb-1 border-sidebar-border/60 border-t" />
            ) : (
              <div className="px-[var(--sidebar-row-content-inset)] pb-1 font-medium text-2xs text-sidebar-muted-foreground uppercase tracking-wide">
                {t(group.label)}
              </div>
            )}
            {group.items.map((item) => (
              <SidebarRow
                key={item.view}
                item={item}
                active={view === item.view}
                collapsed={collapsed}
                onSelect={() => go(item.view)}
              />
            ))}
          </div>
        ))}
      </nav>

      <div
        className={cn(
          "flex flex-col gap-0.5 border-sidebar-border border-t py-2",
          collapsed ? "items-center px-1" : "px-[var(--sidebar-content-inset)]",
        )}
      >
        <SidebarRow
          item={{ view: "connections", label: "nav.connections", icon: Plug }}
          active={view === "connections"}
          collapsed={collapsed}
          onSelect={() => go("connections")}
        />
        <SidebarRow
          item={{ view: "settings", label: "nav.settings", icon: Settings }}
          active={view === "settings"}
          collapsed={collapsed}
          onSelect={() => go("settings")}
        />
        {collapsed ? (
          // In the rail, status compresses to a spinning dot while collecting and a restart glyph when ready.
          <div className="flex flex-col items-center gap-0.5 pt-1">
            {current && (
              <button
                type="button"
                onClick={() => go("connections")}
                title={t("sidebar.collecting", {
                  name: STEP_NAME[current] ?? t("sidebar.step.listen"),
                })}
                aria-label={t("sidebar.collecting", {
                  name: STEP_NAME[current] ?? t("sidebar.step.listen"),
                })}
                className="flex h-8 w-full cursor-pointer items-center justify-center rounded-[var(--control-radius)] text-sidebar-muted-foreground hover:bg-sidebar-row-hover [&>svg]:size-4"
              >
                <Loader className="animate-spin" />
              </button>
            )}
            <RestartToUpdate compact />
            <UpdateButton rail />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={dark ? t("theme.light") : t("theme.dark")}
              title={dark ? t("theme.light") : t("theme.dark")}
              className="flex h-8 w-full cursor-pointer items-center justify-center rounded-[var(--control-radius)] text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground [&>svg]:size-4"
            >
              {dark ? <Sun /> : <Moon />}
            </button>
          </div>
        ) : (
          <>
            <div className="px-[var(--sidebar-row-content-inset)] pt-1 empty:hidden">
              <RestartToUpdate />
            </div>
            <div className="flex items-center justify-between gap-0.5 px-[var(--sidebar-row-content-inset)] pt-1">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => go("connections")}
                  className="flex min-w-0 cursor-pointer items-center gap-1.5 text-2xs text-sidebar-muted-foreground tabular-nums hover:text-sidebar-foreground"
                >
                  {current ? (
                    <>
                      <Loader className="size-3 shrink-0 animate-spin" />
                      <span className="truncate">
                        {t("sidebar.collecting", {
                          name: STEP_NAME[current] ?? t("sidebar.step.listen"),
                        })}
                      </span>
                    </>
                  ) : (
                    <span
                      className="truncate"
                      title={t("sidebar.connected", {
                        connected,
                        total: platforms.length || 4,
                      })}
                    >
                      {connected}/{platforms.length || 4}
                    </span>
                  )}
                </button>
                {version && !current && (
                  <span className="shrink-0 select-none text-2xs text-sidebar-muted-foreground/60">
                    v{version}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                <UpdateButton />
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={dark ? t("theme.light") : t("theme.dark")}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-md text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground [&>svg]:size-3.5"
                >
                  {dark ? <Sun /> : <Moon />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
