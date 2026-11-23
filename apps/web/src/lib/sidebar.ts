// Full sidebar or icon rail, persisted across restarts — like the theme toggle.
import { create } from "zustand";

export const useSidebar = create<{
  readonly collapsed: boolean;
  readonly toggle: () => void;
}>()((set) => ({
  collapsed: localStorage.getItem("loud:sidebar") === "rail",
  toggle: () =>
    set((s) => {
      const collapsed = !s.collapsed;
      localStorage.setItem("loud:sidebar", collapsed ? "rail" : "full");
      return { collapsed };
    }),
}));
