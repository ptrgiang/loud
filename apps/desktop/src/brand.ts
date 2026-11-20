/** The one place the product name lives on the desktop side. */
export const BRAND = {
  name: "Loud",
  /** Same as appId in electron-builder.yml: Windows groups the taskbar and notifications by it. */
  appId: "ing.trysometh.loud",
  tagline: "Try something loud.",
  /** Host of the loud:// protocol the dashboard is served from. */
  host: "app",
  scheme: "loud",
} as const;

export const APP_ORIGIN = `${BRAND.scheme}://${BRAND.host}`;
