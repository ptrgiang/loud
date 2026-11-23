import { Dialog } from "@base-ui/react/dialog";
import {
  Bot,
  CalendarClock,
  ChartNoAxesColumn,
  CornerDownLeft,
  Ear,
  FlaskConical,
  History,
  LayoutDashboard,
  type LucideIcon,
  Moon,
  NotebookPen,
  Play,
  Plug,
  RefreshCw,
  Rows3,
  Search,
  Settings,
  Sparkles,
  Square,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";

import { useT, type MsgKey } from "~/i18n";
import { call } from "~/lib/loud";
import { useTheme } from "~/lib/theme";
import { toast } from "~/lib/toast";
import { cn } from "~/lib/utils";
import { useLoud, type View } from "~/store";
import { useWork } from "~/workStore";

interface Command {
  readonly id: string;
  readonly group: "palette.group.goto" | "palette.group.do";
  readonly label: MsgKey;
  readonly hint?: MsgKey;
  readonly icon: LucideIcon;
  readonly run: () => void;
}

export const usePalette = create<{
  readonly open: boolean;
  readonly set: (open: boolean) => void;
}>()((set) => ({ open: false, set: (open) => set({ open }) }));

const PAGES: ReadonlyArray<readonly [View, MsgKey, LucideIcon]> = [
  ["overview", "nav.overview", LayoutDashboard],
  ["posts", "nav.posts", Rows3],
  ["insights", "nav.insights", ChartNoAxesColumn],
  ["plan", "nav.plan", CalendarClock],
  ["listening", "nav.listening", Ear],
  ["drafts", "nav.drafts", NotebookPen],
  ["agent", "nav.agent", Bot],
  ["connections", "nav.connections", Plug],
  ["settings", "nav.settings", Settings],
];

function useCommands(): ReadonlyArray<Command> {
  const t = useT();
  const go = useLoud((s) => s.go);
  const demo = useLoud((s) => s.info?.demo ?? false);
  const connected = useLoud((s) => s.platforms.some((p) => p.status === "connected"));
  const running = useWork((s) => s.collect?.running ?? false);
  const start = useWork((s) => s.startCollect);
  const cancel = useWork((s) => s.cancelCollect);
  const check = useWork((s) => s.checkUpdates);
  const reset = useWork((s) => s.reset);
  const ask = useWork((s) => s.ask);
  const saveDraft = useWork((s) => s.saveDraft);
  const toggleTheme = useTheme((s) => s.toggle);
  const dark = useTheme((s) => s.dark);

  const hub = useLoud((s) => s.hub);
  const firstChannel = useLoud((s) => s.info?.channels[0]?.id) ?? "threads";

  return useMemo(() => {
    const canCollect = connected && !demo;
    const list: Array<Command> = PAGES.map(([view, label, icon]) => ({
      id: `go:${view}`,
      group: "palette.group.goto",
      label,
      icon,
      run: () => go(view),
    }));
    if (!demo && !hub)
      list.push({
        id: "demo",
        group: "palette.group.do",
        label: "nodata.tryDemo",
        icon: FlaskConical,
        run: () =>
          void call("data.loadDemo", {}).then(
            (info) => {
              useLoud.setState({ info });
              toast("done", t("set.demoLoaded"));
            },
            () => undefined,
          ),
      });
    if (running)
      list.push({
        id: "stop",
        group: "palette.group.do",
        label: "palette.stopCollect",
        icon: Square,
        run: () => void cancel(),
      });
    else if (canCollect) {
      list.push(
        {
          id: "collect",
          group: "palette.group.do",
          label: "palette.collectAll",
          hint: "palette.collectAll.hint",
          icon: Play,
          run: () => void start(),
        },
        {
          id: "listen",
          group: "palette.group.do",
          label: "palette.listenNow",
          icon: Search,
          run: () => void start({ steps: ["listen"] }),
        },
        {
          id: "full",
          group: "palette.group.do",
          label: "palette.readAll",
          hint: "palette.readAll.hint",
          icon: History,
          run: () => void start({ full: true }),
        },
      );
    }
    list.push(
      {
        id: "draft",
        group: "palette.group.do",
        label: "drafts.new",
        icon: NotebookPen,
        run: () =>
          void saveDraft({ channel: firstChannel, text: "", note: "", comment: "" }).then(
            () => go("drafts"),
            (e) => toast("error", e instanceof Error ? e.message : String(e)),
          ),
      },
      {
        id: "proposals",
        group: "palette.group.do",
        label: "palette.proposals",
        icon: Sparkles,
        run: () =>
          void ask(
            "Read my numbers and listening results, then propose this week's posts and save them with save_proposals.",
          ),
      },
      {
        id: "chat",
        group: "palette.group.do",
        label: "palette.newChat",
        icon: Bot,
        run: () => {
          go("agent");
          void reset();
        },
      },
      {
        id: "updates",
        group: "palette.group.do",
        label: "updates.check",
        icon: RefreshCw,
        run: () => void check(),
      },
      {
        id: "theme",
        group: "palette.group.do",
        label: dark ? "theme.light" : "theme.dark",
        icon: Moon,
        run: toggleTheme,
      },
    );
    return list;
  }, [
    t,
    go,
    demo,
    hub,
    connected,
    running,
    start,
    cancel,
    check,
    reset,
    ask,
    toggleTheme,
    dark,
    firstChannel,
    saveDraft,
  ]);
}

/** As in T3 Code: Ctrl+K (⌘K) jumps to a page or runs an action without hunting for its button. */
export function CommandPalette() {
  const t = useT();
  const open = usePalette((s) => s.open);
  const setOpen = usePalette((s) => s.set);
  const commands = useCommands();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!usePalette.getState().open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const q = query.trim().toLowerCase();
  // Substring first, then fuzzy (letters in order): "nc" finds "New chat", "ov" finds "Overview".
  const fuzzy = (s: string, needle: string) => {
    let i = 0;
    for (const c of needle) {
      i = s.indexOf(c, i);
      if (i < 0) return false;
      i++;
    }
    return true;
  };
  const shown = q
    ? commands
        .map((c) => {
          const s = `${t(c.label)} ${c.hint ? t(c.hint) : ""}`.toLowerCase();
          return { c, hit: s.includes(q) ? 0 : fuzzy(s, q) ? 1 : -1 };
        })
        .filter((x) => x.hit >= 0)
        .sort((a, b) => a.hit - b.hit)
        .map((x) => x.c)
    : commands;
  const current = Math.min(index, Math.max(0, shown.length - 1));

  const close = () => {
    setOpen(false);
    setQuery("");
    setIndex(0);
  };
  const run = (c: Command | undefined) => {
    if (!c) return;
    close();
    c.run();
  };

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [current]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/32 backdrop-blur-[1px]" />
        <Dialog.Popup className="-translate-x-1/2 fixed top-[14vh] left-1/2 z-50 flex w-[min(36rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg/8 outline-none">
          <Dialog.Title className="sr-only">{t("palette.title")}</Dialog.Title>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              placeholder={t("palette.placeholder")}
              aria-label={t("palette.searchLabel")}
              className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              onChange={(e) => {
                setQuery(e.target.value);
                setIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setIndex((current + 1) % Math.max(1, shown.length));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setIndex((current - 1 + shown.length) % Math.max(1, shown.length));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  run(shown[current]);
                }
              }}
            />
          </div>
          <div ref={listRef} className="max-h-[min(24rem,60vh)] overflow-y-auto p-1" role="listbox">
            {shown.length === 0 && (
              <div className="px-3 py-6 text-center text-muted-foreground text-sm">
                {t("palette.nothing")}
              </div>
            )}
            {shown.map((c, i) => {
              const Icon = c.icon;
              const heading = i === 0 || shown[i - 1]!.group !== c.group;
              return (
                <div key={c.id}>
                  {heading && (
                    <div className="px-2 pt-2 pb-1 text-2xs text-muted-foreground">
                      {t(c.group)}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === current}
                    data-index={i}
                    onMouseMove={() => setIndex(i)}
                    onClick={() => run(c)}
                    className={cn(
                      "flex w-full cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm",
                      i === current && "bg-accent",
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{t(c.label)}</span>
                    {c.hint && (
                      <span className="truncate text-muted-foreground text-xs">{t(c.hint)}</span>
                    )}
                    {i === current && (
                      <CornerDownLeft className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 border-t px-3 py-1.5 text-2xs text-muted-foreground">
            <span>{t("palette.hintNav")}</span>
            <span>{t("palette.hintRun")}</span>
            <span>{t("palette.hintClose")}</span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
