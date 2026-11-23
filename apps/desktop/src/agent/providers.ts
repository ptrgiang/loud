// The agent runs through a CLI the user already signed in to. Claude Code goes through the Agent SDK; Codex through
// `codex exec --json`. Either way it gets Loud's tools over the stdio MCP server, plus a shell and file tools that
// write only in the chat's workspace (where it draws images with code).
import {
  type EffortLevel,
  query,
  type SDKMessage,
  type SDKRateLimitInfo,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { AGENT_VENDORS, type AgentModel, type AgentProviderId } from "@loud/contracts";
import * as NodeChild from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeReadline from "node:readline";

import { SERVER_NAME } from "./mcp.ts";
import { TOOLS } from "./tools.ts";

export interface McpLaunch {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly env: Record<string, string>;
}

export interface Turn {
  readonly prompt: string;
  readonly system: string;
  readonly model: string;
  /** Empty: the model's default. */
  readonly effort: string;
  /** Saved on disk; Claude gets the bytes, Codex the path. */
  readonly images: ReadonlyArray<{ readonly path: string; readonly mime: string }>;
  /** The CLI's session id from the previous turn of this conversation. */
  readonly resume: string | null;
  readonly cwd: string;
  readonly mcp: McpLaunch;
  readonly signal: AbortSignal;
  readonly onText: (delta: string) => void;
  readonly onTool: (name: string) => void;
  readonly onRateLimit: (info: SDKRateLimitInfo) => void;
}

export interface TurnResult {
  readonly session: string | null;
  readonly costUsd: number | null;
  readonly error?: string;
}

export interface Provider {
  readonly id: AgentProviderId;
  readonly models: ReadonlyArray<AgentModel>;
  /** The CLI's path, or null when it is not installed. */
  readonly locate: () => string | null;
  readonly run: (exe: string, turn: Turn) => Promise<TurnResult>;
}

const TOOL_PREFIX = `mcp__${SERVER_NAME}__`;
const toolName = (n: string) => (n.startsWith(TOOL_PREFIX) ? n.slice(TOOL_PREFIX.length) : n);

// A turn that never ends would pin the chat forever: cut it at a day. Claude's SDK still gets maxTurns.
const TURN_LIMIT_MS = 24 * 3_600_000;

/** Only what a CLI needs to run, find its config and reach its servers — never the app's whole environment. */
export const agentEnv = (): NodeJS.ProcessEnv => {
  const names = [
    "PATH",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "SYSTEMROOT",
    "SYSTEMDRIVE",
    "TMP",
    "TEMP",
    "USER",
    "SHELL",
    "TERM",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TZ",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "SSL_CERT_FILE",
    "NODE_EXTRA_CA_CERTS",
    // Provider auth a CLI picks up from the environment; LOUD_* stays out on purpose.
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_BEDROCK_BASE_URL",
    "ANTHROPIC_SMALL_FAST_MODEL",
    "ANTHROPIC_VERTEX_PROJECT_ID",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_ORG_ID",
    "CODEX_HOME",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_REGION",
    "AWS_DEFAULT_REGION",
    "AWS_PROFILE",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "SSH_AUTH_SOCK",
    "DISPLAY",
    "XDG_RUNTIME_DIR",
    "NODE_OPTIONS",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
    "ProgramFiles",
    "COMSPEC",
    "PATHEXT",
    "PSModulePath",
    "NUMBER_OF_PROCESSORS",
    "PROCESSOR_ARCHITECTURE",
    "OS",
  ];
  const out: Record<string, string> = {};
  for (const k of names) {
    const v = process.env[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
};

/** First match on PATH (and the usual install folders), with Windows' executable extensions. */
export function findOnPath(name: string, extra: ReadonlyArray<string> = []): string | null {
  const dirs = [...(process.env.PATH ?? "").split(NodePath.delimiter), ...extra].filter(Boolean);
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").map((e) => e.toLowerCase())
      : [""];
  for (const dir of dirs)
    for (const ext of exts) {
      const file = NodePath.join(dir, name + ext);
      try {
        if (NodeFS.statSync(file).isFile()) return file;
      } catch {
        // not here
      }
    }
  return null;
}

const home = process.env.USERPROFILE ?? process.env.HOME ?? "";

/** Run `<exe> --version`; null when it does not answer. Never through a shell: arguments stay arguments. */
export function versionOf(exe: string): string | null {
  if (/\.(cmd|bat)$/i.test(exe)) return null;
  try {
    const out = NodeChild.execFileSync(exe, ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
    });
    return out.trim().split("\n")[0] ?? null;
  } catch {
    return null;
  }
}

const CLAUDE_TOOLS = ["Bash", "Read", "Glob", "Grep", "Edit", "Write"] as const;

const claude: Provider = {
  id: "claude",
  // Until Claude Code lists its own (see usage.ts), these aliases stand in.
  models: [
    { id: "", label: "Claude Code default", efforts: [], images: true },
    { id: "opus", label: "Opus", efforts: [], images: true },
    { id: "sonnet", label: "Sonnet", efforts: [], images: true },
    { id: "haiku", label: "Haiku", efforts: [], images: true },
  ],
  locate: () => findOnPath("claude", [NodePath.join(home, ".local", "bin")]),
  run: async (exe, turn) => {
    const abort = new AbortController();
    turn.signal.addEventListener("abort", () => abort.abort(), { once: true });
    // Images need the streaming input form; it stays open until the result so the CLI does not see the end of input
    // before it has answered.
    let answered: () => void = () => undefined;
    const done = new Promise<void>((resolve) => (answered = resolve));
    const message: SDKUserMessage = {
      type: "user",
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: [
          ...turn.images.map((i) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: i.mime as "image/png",
              data: NodeFS.readFileSync(i.path).toString("base64"),
            },
          })),
          { type: "text" as const, text: turn.prompt },
        ],
      },
    };
    const q = query({
      prompt: turn.images.length
        ? (async function* () {
            yield message;
            await done;
          })()
        : turn.prompt,
      options: {
        pathToClaudeCodeExecutable: exe,
        systemPrompt: turn.system,
        // A shell and file reads anywhere (the user may point at reference files); edits only in the workspace (cwd).
        // No web tools. Claude Code has no OS sandbox on Windows, so the shell itself is not confined.
        tools: [...CLAUDE_TOOLS],
        allowedTools: [
          "Bash",
          "Read",
          "Glob",
          "Grep",
          "Edit(./**)",
          "Write(./**)",
          ...TOOLS.map((t) => TOOL_PREFIX + t.name),
        ],
        permissionMode: "dontAsk",
        mcpServers: {
          [SERVER_NAME]: {
            type: "stdio",
            command: turn.mcp.command,
            args: [...turn.mcp.args],
            env: turn.mcp.env,
          },
        },
        strictMcpConfig: true,
        // The user's own settings, hooks and CLAUDE.md stay out of this agent.
        settingSources: [],
        includePartialMessages: true,
        maxTurns: 30,
        cwd: turn.cwd,
        abortController: abort,
        ...(turn.model ? { model: turn.model } : {}),
        ...(turn.effort ? { effort: turn.effort as EffortLevel } : {}),
        ...(turn.resume ? { resume: turn.resume } : {}),
        env: {
          // The agent inherits only what a CLI needs to run and authenticate — never the whole environment.
          ...agentEnv(),
          ELECTRON_RUN_AS_NODE: undefined,
          ENABLE_CLAUDEAI_MCP_SERVERS: "false",
          CLAUDE_CODE_AUTO_CONNECT_IDE: "0",
          CLAUDE_AGENT_SDK_CLIENT_APP: "loud",
        },
      },
    });
    let session: string | null = turn.resume;
    let costUsd: number | null = null;
    let error: string | undefined;
    let wrote = false;
    let gap = false;
    try {
      for await (const m of q as AsyncIterable<SDKMessage>) {
        if ("session_id" in m && typeof m.session_id === "string") session = m.session_id;
        if (m.type === "stream_event") {
          const ev = m.event;
          if (ev.type === "content_block_start" && ev.content_block.type === "text" && wrote)
            gap = true;
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            turn.onText((gap ? "\n\n" : "") + ev.delta.text);
            gap = false;
            wrote = true;
          }
        } else if (m.type === "assistant") {
          for (const b of m.message.content)
            if (b.type === "tool_use") turn.onTool(toolName(b.name));
          if (m.error) error = m.error.replaceAll("_", " ");
        } else if (m.type === "rate_limit_event") {
          turn.onRateLimit(m.rate_limit_info);
        } else if (m.type === "result") {
          answered();
          costUsd = m.total_cost_usd;
          if (m.subtype !== "success") error = m.subtype.replaceAll("_", " ");
          else if (m.is_error) error = m.result || "the agent stopped with an error";
        }
      }
    } catch (e) {
      if (!turn.signal.aborted) error = e instanceof Error ? e.message : String(e);
    } finally {
      answered();
    }
    return { session, costUsd, ...(error ? { error } : {}) };
  },
};

/** TOML basic string: JSON escaping is TOML's own — backslashes and quotes both survive. */
const tomlLiteral = (s: string) => JSON.stringify(s);

/** npm installs Codex behind a .cmd shim; the native binary it launches sits in a per-platform package beside it. */
export function codexBinary(found: string | null): string | null {
  if (!found || !/\.(cmd|bat)$/i.test(found)) return found;
  const pkg = NodePath.join(NodePath.dirname(found), "node_modules", "@openai", "codex");
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const triple = arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
  for (const base of [
    NodePath.join(pkg, "node_modules"),
    NodePath.join(NodePath.dirname(found), "node_modules"),
  ]) {
    const exe = NodePath.join(
      base,
      "@openai",
      `codex-win32-${arch}`,
      "vendor",
      triple,
      "bin",
      "codex.exe",
    );
    if (NodeFS.existsSync(exe)) return exe;
  }
  return found;
}

const codex: Provider = {
  id: "codex",
  models: [{ id: "", label: "Codex default", efforts: [], images: true }],
  locate: () => codexBinary(findOnPath("codex")),
  run: (exe, turn) =>
    new Promise<TurnResult>((resolve) => {
      const env = Object.entries(turn.mcp.env)
        .map(([k, v]) => `${k}=${tomlLiteral(v)}`)
        .join(", ");
      const args = [
        "exec",
        ...(turn.resume ? ["resume", turn.resume] : []),
        "--json",
        "--skip-git-repo-check",
        "--ignore-user-config",
        "--ignore-rules",
        // No browser, plugins or apps. The shell runs in Codex's sandbox: it reads anywhere, writes only in the
        // workspace (cwd) and has no network.
        ...["browser_use", "in_app_browser", "apps", "plugins"].flatMap((f) => ["--disable", f]),
        "-c",
        `sandbox_mode=${tomlLiteral("workspace-write")}`,
        // The elevated sandbox needs a one-time setup as administrator; this one works without it.
        ...(process.platform === "win32"
          ? ["-c", `windows.sandbox=${tomlLiteral("unelevated")}`]
          : []),
        "-c",
        `web_search=${tomlLiteral("disabled")}`,
        "-c",
        `mcp_servers.${SERVER_NAME}.command=${tomlLiteral(turn.mcp.command)}`,
        "-c",
        `mcp_servers.${SERVER_NAME}.args=[${turn.mcp.args.map(tomlLiteral).join(", ")}]`,
        "-c",
        `mcp_servers.${SERVER_NAME}.env={ ${env} }`,
        // Loud's tools only read the data folder or write drafts and proposals into it: no need to ask per call.
        "-c",
        `mcp_servers.${SERVER_NAME}.default_tools_approval_mode=${tomlLiteral("approve")}`,
        "-c",
        `approval_policy=${tomlLiteral("never")}`,
        ...(turn.resume ? [] : ["-C", turn.cwd]),
        ...(turn.model ? ["-m", turn.model] : []),
        ...(turn.effort ? ["-c", `model_reasoning_effort=${tomlLiteral(turn.effort)}`] : []),
        ...turn.images.flatMap((i) => ["-i", i.path]),
        // The prompt goes on stdin: it can be long and hold anything.
        "-",
      ];
      const child = NodeChild.spawn(exe, args, {
        cwd: turn.cwd,
        windowsHide: true,
        env: { ...agentEnv(), ELECTRON_RUN_AS_NODE: undefined },
      });
      // Codex exec has no system prompt option; a first turn carries the instructions ahead of the question.
      child.stdin.end(turn.resume ? turn.prompt : `${turn.system}\n\n---\n\n${turn.prompt}`);
      let session: string | null = turn.resume;
      let error: string | undefined;
      let wrote = false;
      let stderr = "";
      child.stderr.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-2000)));
      const kill = () => child.kill();
      turn.signal.addEventListener("abort", kill, { once: true });
      const cap = setTimeout(() => {
        error = "the turn hit the time limit";
        child.kill();
      }, TURN_LIMIT_MS);
      NodeReadline.createInterface({ input: child.stdout }).on("line", (line) => {
        let ev: Record<string, unknown>;
        try {
          ev = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }
        const item = (ev.item ?? {}) as Record<string, unknown>;
        if (ev.type === "thread.started" && typeof ev.thread_id === "string")
          session = ev.thread_id;
        else if (ev.type === "item.started" && item.type === "mcp_tool_call")
          turn.onTool(String(item.tool ?? ""));
        else if (ev.type === "item.completed" && item.type === "agent_message") {
          turn.onText((wrote ? "\n\n" : "") + String(item.text ?? ""));
          wrote = true;
        } else if (ev.type === "turn.failed")
          error = String(
            (ev.error as { message?: unknown } | undefined)?.message ?? "the turn failed",
          );
        else if (ev.type === "error") error = String(ev.message ?? "error");
      });
      child.on("error", (e) => (error = e.message));
      child.on("close", (code) => {
        clearTimeout(cap);
        turn.signal.removeEventListener("abort", kill);
        if (code && !error && !turn.signal.aborted)
          error = stderr.trim().split("\n").pop() || `codex exited with ${code}`;
        resolve({ session, costUsd: null, ...(error && !turn.signal.aborted ? { error } : {}) });
      });
    }),
};

export const PROVIDERS: Record<AgentProviderId, Provider> = { claude, codex };

export const vendorOf = (id: AgentProviderId) => AGENT_VENDORS[id];
