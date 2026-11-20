// Bundles the main process and the preload script to CommonJS for Electron. Workspace packages are inlined; only
// electron itself stays external.
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: true,
  external: ["electron"],
  logLevel: "info",
};

// ESM dependencies (the Agent SDK) read import.meta.url at load; CommonJS has no import.meta, so give it this file's.
// Not for the preload: it runs sandboxed, without Node's require.
const node = {
  ...common,
  define: { "import.meta.url": "__loudImportMetaUrl" },
  banner: { js: 'const __loudImportMetaUrl = require("node:url").pathToFileURL(__filename).href;' },
};

await Promise.all([
  build({ ...node, entryPoints: ["src/main.ts"], outfile: "dist-electron/main.cjs" }),
  build({ ...common, entryPoints: ["src/preload.ts"], outfile: "dist-electron/preload.cjs" }),
  build({ ...node, entryPoints: ["src/demo/cli.ts"], outfile: "dist-electron/demo.cjs" }),
  // The agent's tool server: run by the agent CLI with ELECTRON_RUN_AS_NODE, so it must not touch Electron.
  build({ ...node, entryPoints: ["src/agent/mcpMain.ts"], outfile: "dist-electron/mcp.cjs" }),
]);

// The window and tray icon (src/app/appIcon.ts).
mkdirSync("dist-electron", { recursive: true });
copyFileSync("resources/icon.png", "dist-electron/icon.png");
