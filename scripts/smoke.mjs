// Boots the built app on a throwaway demo profile and asks it for a screenshot: proves main,
// preload and the dashboard bundle all load together. CI runs it on each OS after `pnpm build`;
// on Linux it needs a display, so the step wraps it in xvfb-run.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const app = join(root, "apps", "desktop");
const electron = join(
  app,
  "node_modules",
  "electron",
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron",
);
if (!existsSync(electron)) {
  console.error(
    "[smoke] no electron binary — run `pnpm --filter @loud/desktop exec install-electron` first",
  );
  process.exit(1);
}

const home = mkdtempSync(join(tmpdir(), "loud-smoke-"));
const shot = join(home, "shot.png");

const env = {
  ...process.env,
  LOUD_HOME: home,
  LOUD_DEMO: "1",
  LOUD_SHOT: shot,
  LOUD_SHOT_WAIT: "6000",
};
// Inherited CI or tool environments may set this; it would run the app as plain Node.
delete env.ELECTRON_RUN_AS_NODE;

const run = spawnSync(electron, [".", "--disable-gpu"], {
  cwd: app,
  env,
  encoding: "utf8",
  timeout: 180_000,
});

const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
try {
  if (run.error) throw run.error;
  if (!existsSync(shot)) {
    console.error(`[smoke] no screenshot. App output:\n${out}`);
    process.exit(1);
  }
  const line = out.split("\n").find((l) => l.includes("screenshot saved"));
  console.log(`[smoke] ok${line ? ` — ${line.trim()}` : ""}`);
} finally {
  rmSync(home, { recursive: true, force: true });
}
