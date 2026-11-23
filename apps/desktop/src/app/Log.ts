// One append-only log in the profile, for debugging in the field where a console cannot be read: collection results,
// IPC failures, update events. Rotates at 512 KB and keeps three generations (loud.log.1..3). Never log post text,
// handles or attachments — the diagnostics export hands these lines to whoever the user sends them to.
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { AppPaths } from "./AppPaths.ts";

export interface LogShape {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  /** The newest lines of the log, oldest first. */
  readonly tail: (lines: number) => Effect.Effect<ReadonlyArray<string>>;
  readonly file: string;
}

export class Log extends Context.Service<Log, LogShape>()("@loud/desktop/app/Log") {}

const MAX_BYTES = 512 * 1024;

export const layer = Layer.effect(
  Log,
  Effect.gen(function* () {
    const paths = yield* AppPaths;
    const file = NodePath.join(paths.home, "logs", "loud.log");

    const write = (level: "info" | "warn", message: string) => {
      try {
        NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
        if (NodeFS.statSync(file).size > MAX_BYTES) {
          // loud.log.3 is dropped; 2→3, 1→2, current→1.
          for (let i = 3; i >= 1; i--) NodeFS.renameSync(`${file}.${i}`, `${file}.${i + 1}`);
          NodeFS.renameSync(file, `${file}.1`);
          NodeFS.rmSync(`${file}.4`, { force: true });
        }
      } catch {
        // No file yet, or rotation failed; the line can still be appended or dropped.
      }
      try {
        const line = `${new Date().toISOString()} ${level} ${message.split("\n").join(" | ")}\n`;
        NodeFS.appendFileSync(file, line, "utf8");
      } catch {
        // Logging never breaks the app.
      }
    };

    return Log.of({
      info: (message) => write("info", message),
      warn: (message) => write("warn", message),
      tail: (lines) =>
        Effect.sync(() => {
          try {
            return NodeFS.readFileSync(file, "utf8").split("\n").filter(Boolean).slice(-lines);
          } catch {
            return [];
          }
        }),
      file,
    });
  }),
);
