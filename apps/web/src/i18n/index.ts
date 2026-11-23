// Dashboard locale. Kept in localStorage like the theme: it is a client preference, not app data,
// so it does not go through settings IPC. `useT` subscribes a component so it re-renders on change;
// `t` is for code that runs outside React (stores firing toasts).
import { create } from "zustand";

import { en, type MsgKey } from "~/i18n/en";
import { vi } from "~/i18n/vi";

export type { MsgKey } from "~/i18n/en";

export const LOCALES = { en: "English", vi: "Tiếng Việt" } as const;
export type Locale = keyof typeof LOCALES;

const catalogs: Record<Locale, Record<MsgKey, string>> = { en, vi };

const stored = typeof localStorage === "undefined" ? null : localStorage.getItem("loud:locale");
const initial: Locale = stored === "vi" || stored === "en" ? stored : "en";

export const useLocale = create<{
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
}>()((set) => ({
  locale: initial,
  setLocale: (locale) => {
    localStorage.setItem("loud:locale", locale);
    set({ locale });
  },
}));

type Vars = Record<string, string | number>;

function render(catalog: Record<MsgKey, string>, key: MsgKey, vars?: Vars): string {
  let s = catalog[key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function useT() {
  const locale = useLocale((s) => s.locale);
  return (key: MsgKey, vars?: Vars) => render(catalogs[locale], key, vars);
}

export function t(key: MsgKey, vars?: Vars): string {
  return render(catalogs[useLocale.getState().locale], key, vars);
}
