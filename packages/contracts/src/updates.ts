// App updates. Checking asks GitHub Releases for a newer version, so it is off until the user turns it on.
import * as Schema from "effect/Schema";

export const UpdateSettings = Schema.Struct({
  /** Check at start and every few hours, and download in the background. Installs only when the user says so. */
  check: Schema.Boolean,
  /** "latest" follows released versions; "beta" also sees prerelease builds. */
  channel: Schema.Literals(["latest", "beta"]),
});
export type UpdateSettings = typeof UpdateSettings.Type;

export const UpdateStatus = Schema.Struct({
  /** False when running from source: updates work in the installed app only. */
  supported: Schema.Boolean,
  state: Schema.Literals(["idle", "checking", "none", "downloading", "ready", "error"]),
  /** The newer version, once one is found. */
  version: Schema.NullOr(Schema.String),
  /** 0..100 while downloading. */
  progress: Schema.NullOr(Schema.Number),
  error: Schema.NullOr(Schema.String),
  checkedAt: Schema.NullOr(Schema.String),
});
export type UpdateStatus = typeof UpdateStatus.Type;
