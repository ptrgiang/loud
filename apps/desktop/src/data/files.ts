import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

export const readJson = <A = unknown>(file: string): A | null => {
  try {
    return JSON.parse(NodeFS.readFileSync(file, "utf8")) as A;
  } catch {
    return null;
  }
};

/** Write then rename: a reader never sees half a file, and a crash leaves the old one in place. */
export const writeJson = (file: string, value: unknown) => {
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  NodeFS.writeFileSync(tmp, JSON.stringify(value, null, 1), "utf8");
  NodeFS.renameSync(tmp, file);
};

/** Marks a data folder as fictional demo data, with the zone and start date it was generated for. */
export const DEMO_MARKER = "loud-demo.json";

export interface DemoMarker {
  readonly demo: true;
  readonly timezone: string;
  readonly since: string;
}
