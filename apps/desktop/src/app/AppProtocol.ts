// The dashboard is served from loud://app, not file:// or a localhost port: nothing else on the machine can reach it,
// and it gets a real origin for the CSP and the IPC sender check.
import * as Effect from "effect/Effect";
import * as Electron from "electron";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeUrl from "node:url";

import { BRAND } from "../brand.ts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// Everything comes from the app itself; no remote scripts, frames or connections. Tailwind writes inline styles.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** Must run before the app is ready. */
export const registerScheme = () =>
  Electron.protocol.registerSchemesAsPrivileged([
    {
      scheme: BRAND.scheme,
      privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true },
    },
  ]);

export const handle = (webRoot: string) =>
  Effect.sync(() => {
    const root = NodePath.resolve(webRoot);
    Electron.protocol.handle(BRAND.scheme, async (request) => {
      const url = new URL(request.url);
      if (url.host !== BRAND.host) return new Response("not found", { status: 404 });
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
      let file = NodePath.resolve(root, rel);
      if (file !== root && !file.startsWith(root + NodePath.sep)) {
        return new Response("not found", { status: 404 });
      }
      // Client-side routes fall back to the shell.
      if (!NodeFS.existsSync(file) || NodeFS.statSync(file).isDirectory()) {
        if (NodePath.extname(rel)) return new Response("not found", { status: 404 });
        file = NodePath.join(root, "index.html");
      }
      const response = await Electron.net.fetch(NodeUrl.pathToFileURL(file).toString());
      const headers = new Headers({
        "Content-Type": MIME[NodePath.extname(file).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      if (file.endsWith(".html")) headers.set("Content-Security-Policy", CSP);
      return new Response(response.body, { status: response.status, headers });
    });
  });
