// The Loud tools as a stdio MCP server, so Claude Code and Codex reach them the same way. The desktop starts it with
// its own executable (ELECTRON_RUN_AS_NODE) and hands it the data folder and settings it may see; nothing else.
import { TOOLS, type ToolContext } from "./tools.ts";

export const SERVER_NAME = "loud";
const PROTOCOL = "2025-06-18";

interface Request {
  readonly jsonrpc?: string;
  readonly id?: string | number | null;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
}

/** One JSON-RPC message in, at most one out. Notifications (no id) get no answer. */
export function handle(msg: Request, ctx: ToolContext): object | null {
  const reply = (result: object) => ({ jsonrpc: "2.0", id: msg.id, result });
  const error = (code: number, message: string) => ({
    jsonrpc: "2.0",
    id: msg.id,
    error: { code, message },
  });
  if (msg.id === undefined || msg.id === null) return null;
  switch (msg.method) {
    case "initialize":
      return reply({
        protocolVersion:
          typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: "1" },
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return error(-32602, `Unknown tool: ${String(msg.params?.name)}`);
      const args = msg.params?.arguments;
      try {
        const out = tool.run(
          args && typeof args === "object" ? (args as Record<string, unknown>) : {},
          ctx,
        );
        return reply({
          content: [{ type: "text", text: out.text }],
          isError: out.isError ?? false,
        });
      } catch (e) {
        return reply({
          content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
          isError: true,
        });
      }
    }
    default:
      return error(-32601, `Method not found: ${String(msg.method)}`);
  }
}

/** What the desktop passes in LOUD_AGENT_CONTEXT. */
export interface ServerContext {
  readonly channels: ToolContext["channels"];
  readonly keywords: ToolContext["keywords"];
  readonly playbook: string;
  readonly imageRoots: ToolContext["imageRoots"];
}

export function serve(data: string, context: ServerContext) {
  const ctx: ToolContext = { data, ...context, now: () => new Date() };
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg: Request;
      try {
        msg = JSON.parse(line) as Request;
      } catch {
        process.stdout.write(
          `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`,
        );
        continue;
      }
      const out = handle(msg, ctx);
      if (out) process.stdout.write(`${JSON.stringify(out)}\n`);
    }
  });
  process.stdin.on("end", () => process.exit(0));
}
