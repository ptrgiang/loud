// Fixtures are fictional.
import { describe, expect, it } from "vite-plus/test";

import { fbPages, usernameFor, usernameNear, xProfileHref } from "./detect.ts";

describe("detect", () => {
  it("takes the name next to the logged-in id, not anyone else's", () => {
    const objs = [
      { feed: [{ user: { pk: "999", username: "someone" } }] },
      { viewer: { user: { pk: "123", username: "acmeforms" } } },
    ];
    expect(usernameFor(objs, "123")).toBe("acmeforms");
    expect(usernameFor(objs, "555")).toBeNull();
    expect(usernameFor([{ rest_id: "77", core: { screen_name: "acme_x" } }], "77")).toBe("acme_x");
  });

  it("finds the name in inline script data", () => {
    const html =
      `..."user":{"username":"other"}...` + " ".repeat(500) + `{"id":"123","username":"acmeforms"}`;
    expect(usernameNear(html, "123")).toBe("acmeforms");
    expect(usernameNear(html, "12.*")).toBeNull();
  });

  it("reads X's profile link", () => {
    expect(xProfileHref("/acmeforms")).toBe("acmeforms");
    expect(xProfileHref("/i/flow/login")).toBeNull();
  });

  it("lists the Pages from Business Suite and the managed-Pages list, once each", () => {
    const suite = {
      localScopes: [
        {
          __typename: "BusinessScopingPageLocalScope",
          asset_id: "200",
          asset_type: "PAGE",
          name: "Acme Forms",
        },
        {
          __typename: "BusinessScopingPageLocalScope",
          asset_id: 100,
          asset_type: "PAGE",
          name: "Acme Labs",
        },
        {
          __typename: "BusinessScopingIGLocalScope",
          asset_id: "300",
          asset_type: "IG",
          name: "acme",
        },
      ],
    };
    const managed = {
      pages: [
        {
          id: "900",
          delegate_page_id: "200",
          name: "Acme Forms",
          can_manage_classic_page_in_pages_tab: true,
        },
        {
          id: "901",
          delegate_page_id: "400",
          name: "Acme Archive",
          can_manage_classic_page_in_pages_tab: true,
        },
        {
          id: "902",
          delegate_page_id: null,
          name: "A person",
          can_manage_classic_page_in_pages_tab: false,
        },
      ],
    };
    expect(fbPages([suite, managed])).toEqual([
      { id: "400", name: "Acme Archive" },
      { id: "200", name: "Acme Forms" },
      { id: "100", name: "Acme Labs" },
    ]);
  });
});
