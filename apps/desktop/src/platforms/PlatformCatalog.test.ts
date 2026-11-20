import { describe, expect, it } from "vite-plus/test";

import {
  accountIdFromCookie,
  assetIdFrom,
  plainChromeUserAgent,
  platformForUrl,
} from "./PlatformCatalog.ts";

describe("platformForUrl", () => {
  it("maps each platform's hosts, with and without www", () => {
    expect(platformForUrl("https://www.threads.com/@someone/post/1")).toBe("threads");
    expect(platformForUrl("https://threads.net/@someone")).toBe("threads");
    expect(platformForUrl("https://www.instagram.com/p/abc/")).toBe("ig");
    expect(platformForUrl("https://business.facebook.com/latest/home")).toBe("fb");
    expect(platformForUrl("https://twitter.com/someone")).toBe("x");
  });

  it("does not match lookalike hosts or garbage", () => {
    expect(platformForUrl("https://notinstagram.com/")).toBeNull();
    expect(platformForUrl("https://instagram.com.evil.example/")).toBeNull();
    expect(platformForUrl("not a url")).toBeNull();
  });
});

describe("accountIdFromCookie", () => {
  it("unwraps X's encoded u= prefix and leaves the others alone", () => {
    expect(accountIdFromCookie("x", "u%3D12345")).toBe("12345");
    expect(accountIdFromCookie("ig", "67890")).toBe("67890");
  });
});

describe("plainChromeUserAgent", () => {
  it("drops the Electron and app tokens", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Loud/0.1.0 Chrome/140.0.0.0 Electron/45.4.1 Safari/537.36";
    expect(plainChromeUserAgent(ua)).toBe(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    );
  });
});

describe("assetIdFrom", () => {
  it("takes the id from a Business Suite link or from what was typed", () => {
    expect(
      assetIdFrom("https://business.facebook.com/latest/home?asset_id=1234567890&nav_ref=x"),
    ).toBe("1234567890");
    expect(assetIdFrom(" 1234567890 ")).toBe("1234567890");
    expect(assetIdFrom("")).toBe("");
  });
});
