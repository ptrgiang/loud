// Light or dark, shared by the sidebar toggle and the command palette. theme.js sets it before first paint.
import { create } from "zustand";

export const useTheme = create<{ readonly dark: boolean; readonly toggle: () => void }>()(
  (set) => ({
    dark: document.documentElement.classList.contains("dark"),
    toggle: () =>
      set((s) => {
        const dark = !s.dark;
        document.documentElement.classList.toggle("dark", dark);
        localStorage.setItem("loud:theme", dark ? "dark" : "light");
        return { dark };
      }),
  }),
);
