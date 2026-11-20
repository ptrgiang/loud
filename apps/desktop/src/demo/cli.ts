// `pnpm --filter @loud/desktop demo <folder>`: writes the fictional Acme Forms data set, then point LOUD_DATA at it.
import * as NodePath from "node:path";

import { generateDemo } from "./demo.ts";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: demo <folder>");
  process.exit(2);
}
try {
  const hub = generateDemo(NodePath.resolve(dir));
  console.log(
    `demo data in ${NodePath.resolve(dir)}: ${hub?.posts.length ?? 0} posts, built ${hub?.built ?? "–"}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
