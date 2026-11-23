// Light, dark or "system" (follows the OS and flips when it does). theme.js sets it before first paint.
import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

const mq = typeof matchMedia === "undefined" ? null : matchMedia("(prefers-color-scheme: dark)");

const readMode = (): ThemeMode => {
  const stored = typeof localStorage === "undefined" ? null : localStorage.getItem("loud:theme");
  return stored === "light" || stored === "dark" ? stored : "system";
};

const darkFor = (mode: ThemeMode) =>
  mode === "dark" || (mode === "system" && (mq?.matches ?? false));

const apply = (mode: ThemeMode) => {
  const dark = darkFor(mode);
  document.documentElement.classList.toggle("dark", dark);
  return dark;
};

const initial = readMode();
export const useTheme = create<{
  readonly mode: ThemeMode;
  readonly dark: boolean;
  readonly setMode: (mode: ThemeMode) => void;
  readonly toggle: () => void;
}>()((set) => ({
  mode: initial,
  dark: darkFor(initial),
  setMode: (mode) => {
    localStorage.setItem("loud:theme", mode);
    set({ mode, dark: apply(mode) });
  },
  toggle: () =>
    set((s) => {
      const mode: ThemeMode = s.dark ? "light" : "dark";
      localStorage.setItem("loud:theme", mode);
      return { mode, dark: apply(mode) };
    }),
}));

mq?.addEventListener("change", () => {
  const s = useTheme.getState();
  if (s.mode === "system") useTheme.setState({ dark: apply("system") });
});
