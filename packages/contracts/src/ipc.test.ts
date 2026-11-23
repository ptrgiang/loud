import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { IpcMethods } from "./ipc.ts";

describe("post.publish", () => {
  const decode = Schema.decodeUnknownSync(IpcMethods["post.publish"].input);

  it("accepts a bare id", () => {
    expect(decode({ id: "d1" })).toEqual({ id: "d1" });
  });

  it("accepts id + schedule", () => {
    expect(decode({ id: "d1", schedule: "2026-11-25T09:00:00.000Z" })).toEqual({
      id: "d1",
      schedule: "2026-11-25T09:00:00.000Z",
    });
  });

  it("rejects missing id and bad schedule type", () => {
    expect(() => decode({})).toThrow();
    expect(() => decode({ id: "d1", schedule: 7 })).toThrow();
  });
});
