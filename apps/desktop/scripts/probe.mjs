// Dev only: bundles src/dev/probe.ts and runs it in Electron with the session read from this process's stdin.
// Usage: huashu-chrome run --grant threads --profile Work -- node scripts/probe.mjs   (settings in LOUD_PROBE_* env)
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

await build({
  entryPoints: ["src/dev/probe.ts"],
  outfile: "dist-electron/probe.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  logLevel: "warning",
});
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const electron = createRequire(import.meta.url)("electron");
// Electron's main process cannot read a piped stdin on Windows, so the session goes in the child's environment.
const child = spawn(electron, ["dist-electron/probe.cjs"], {
  stdio: "inherit",
  env: { ...process.env, LOUD_PROBE_SESSION: Buffer.concat(chunks).toString("utf8") },
});
child.on("exit", (code) => process.exit(code ?? 1));
