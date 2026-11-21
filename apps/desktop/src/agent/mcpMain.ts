// Entry of dist-electron/mcp.cjs. Run by the agent CLI as a child process; never loads Electron.
import * as NodeFS from "node:fs";

import { type ServerContext, serve } from "./mcp.ts";

const data = process.env.LOUD_DATA;
if (!data) {
  process.stderr.write("LOUD_DATA is not set\n");
  process.exit(2);
}
let context: ServerContext = { channels: [], keywords: {}, playbook: "" };
try {
  const file = process.env.LOUD_AGENT_CONTEXT_FILE;
  if (file)
    context = {
      ...context,
      ...(JSON.parse(NodeFS.readFileSync(file, "utf8")) as Partial<ServerContext>),
    };
} catch {
  // An unreadable context leaves no channel enabled: saves are refused, reads still work.
}
serve(data, context);
