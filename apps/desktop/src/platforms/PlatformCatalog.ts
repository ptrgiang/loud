import { CHANNEL_IDS, type ChannelId } from "@loud/contracts";

export interface PlatformDefinition {
  readonly id: ChannelId;
  readonly name: string;
  /** Each platform gets its own persistent browser profile, so one login never leaks into another site. */
  readonly partition: string;
  readonly loginUrl: string;
  readonly homeUrl: string;
  readonly cookieUrl: string;
  /** Present only while logged in. */
  readonly authCookie: string;
  /** Holds the account id. */
  readonly idCookie: string;
  readonly hosts: ReadonlyArray<string>;
}

export const PLATFORMS: Record<ChannelId, PlatformDefinition> = {
  threads: {
    id: "threads",
    name: "Threads",
    partition: "persist:loud-threads",
    loginUrl: "https://www.threads.com/login",
    homeUrl: "https://www.threads.com/",
    cookieUrl: "https://www.threads.com",
    authCookie: "sessionid",
    idCookie: "ds_user_id",
    hosts: ["threads.com", "threads.net"],
  },
  ig: {
    id: "ig",
    name: "Instagram",
    partition: "persist:loud-instagram",
    loginUrl: "https://www.instagram.com/accounts/login/",
    homeUrl: "https://www.instagram.com/",
    cookieUrl: "https://www.instagram.com",
    authCookie: "sessionid",
    idCookie: "ds_user_id",
    hosts: ["instagram.com"],
  },
  fb: {
    id: "fb",
    name: "Facebook",
    partition: "persist:loud-facebook",
    loginUrl: "https://www.facebook.com/login/",
    homeUrl: "https://business.facebook.com/latest/home",
    cookieUrl: "https://www.facebook.com",
    authCookie: "c_user",
    idCookie: "c_user",
    hosts: ["facebook.com", "fb.com"],
  },
  x: {
    id: "x",
    name: "X",
    partition: "persist:loud-x",
    loginUrl: "https://x.com/i/flow/login",
    homeUrl: "https://x.com/home",
    cookieUrl: "https://x.com",
    authCookie: "auth_token",
    idCookie: "twid",
    hosts: ["x.com", "twitter.com"],
  },
};

export const platformForUrl = (raw: string): ChannelId | null => {
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    return (
      CHANNEL_IDS.find((id) =>
        PLATFORMS[id].hosts.some((d) => host === d || host.endsWith(`.${d}`)),
      ) ?? null
    );
  } catch {
    return null;
  }
};

/** X stores the account id as `u=123` (URL-encoded); the others store it bare. */
export const accountIdFromCookie = (id: ChannelId, value: string): string =>
  id === "x" ? decodeURIComponent(value).replace(/^u=/, "") : value;

// The default user agent names Electron and the app; some sites send that to a bot check. Chromium's own is fine.
export const plainChromeUserAgent = (ua: string): string =>
  ua.replace(/\s+Electron\/\S+/, "").replace(/\s+(?:loud|Loud|@loud\/desktop)\/\S+/, "");

/** A Business Suite asset id, typed as-is or pasted inside a Business Suite link (…?asset_id=123…). */
export const assetIdFrom = (raw: string): string =>
  /[?&]asset_id=(\d+)/.exec(raw)?.[1] ?? raw.replace(/\D/g, "");
