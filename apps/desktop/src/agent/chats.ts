// Saved conversations: one JSON file per chat under <home>/agent/chats, attachments beside them. All of it stays in the
// profile, never in the data folder, so exports and the agent's own tools never see it.
import {
  AGENT_LIMITS,
  type AgentAttachment,
  type AgentChatSummary,
  type AgentMessage,
  type AgentProviderId,
  type AgentUpload,
} from "@loud/contracts";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { readJson, writeJson } from "../data/files.ts";

export interface SavedChat {
  readonly id: string;
  readonly title: string;
  readonly provider: AgentProviderId;
  readonly model: string;
  readonly effort: string;
  /** ISO times; a message's own `at` is wall-clock for display. */
  readonly created: string;
  readonly updated: string;
  readonly messages: ReadonlyArray<AgentMessage>;
  /** The CLI's session, so the next turn continues the same conversation there. */
  readonly session: string | null;
  readonly costUsd: number | null;
}

const ID = /^[a-z0-9]{6,32}$/;
export const newId = () => NodeCrypto.randomBytes(8).toString("hex");

/** A chat's title: its first question, on one line. */
export function titleOf(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line || "New chat";
}

const IMAGE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|yaml|yml|xml|html?|log)$/i;

/** Which uploads Loud takes, and as what. Anything else is refused with the reason. */
export function classify(upload: Pick<AgentUpload, "name" | "mime">, bytes: number) {
  if (IMAGE.has(upload.mime)) {
    if (bytes > AGENT_LIMITS.imageBytes) return { error: `${upload.name} is over 5 MB` } as const;
    return { kind: "image" } as const;
  }
  if (
    upload.mime.startsWith("text/") ||
    upload.mime === "application/json" ||
    TEXT_EXT.test(upload.name)
  ) {
    if (bytes > AGENT_LIMITS.textBytes) return { error: `${upload.name} is over 256 KB` } as const;
    return { kind: "text" } as const;
  }
  return { error: `${upload.name}: only images and text files can be attached` } as const;
}

/** Text files go into the message itself, fenced, so either CLI reads them the same way. */
export function withTextFiles(
  text: string,
  files: ReadonlyArray<{ readonly name: string; readonly content: string }>,
): string {
  if (!files.length) return text;
  const blocks = files.map(
    (f) => `<attached_file name="${f.name.replaceAll('"', "'")}">\n${f.content}\n</attached_file>`,
  );
  return `${blocks.join("\n\n")}\n\n${text}`;
}

export function chatStore(home: string) {
  const root = NodePath.join(home, "agent");
  const chatsDir = NodePath.join(root, "chats");
  const filesDir = NodePath.join(root, "attachments");
  const chatFile = (id: string) => NodePath.join(chatsDir, `${id}.json`);

  const read = (id: string): SavedChat | null =>
    ID.test(id) ? readJson<SavedChat>(chatFile(id)) : null;

  const list = (): ReadonlyArray<AgentChatSummary> => {
    let names: Array<string> = [];
    try {
      names = NodeFS.readdirSync(chatsDir).filter((n) => n.endsWith(".json"));
    } catch {
      return [];
    }
    return names
      .flatMap((n) => {
        const c = read(n.slice(0, -5));
        return c
          ? [
              {
                id: c.id,
                title: c.title,
                provider: c.provider,
                updated: c.updated,
                messages: c.messages.length,
              },
            ]
          : [];
      })
      .sort((a, b) => b.updated.localeCompare(a.updated));
  };

  return {
    list,
    read,
    write: (chat: SavedChat) => writeJson(chatFile(chat.id), chat),
    remove: (id: string) => {
      if (!ID.test(id)) return;
      NodeFS.rmSync(chatFile(id), { force: true });
      NodeFS.rmSync(NodePath.join(filesDir, id), { recursive: true, force: true });
    },
    /** Saves an upload for a chat; the returned path is what the CLI is given for an image. */
    saveFile: (chatId: string, attachment: AgentAttachment, bytes: Buffer) => {
      const dir = NodePath.join(filesDir, chatId);
      NodeFS.mkdirSync(dir, { recursive: true });
      const ext = NodePath.extname(attachment.name)
        .replace(/[^.a-z0-9]/gi, "")
        .slice(0, 8);
      const file = NodePath.join(dir, `${attachment.id}${ext}`);
      NodeFS.writeFileSync(file, bytes);
      return file;
    },
    readFile: (chatId: string, attachmentId: string): Buffer | null => {
      if (!ID.test(chatId) || !ID.test(attachmentId)) return null;
      const dir = NodePath.join(filesDir, chatId);
      try {
        const name = NodeFS.readdirSync(dir).find(
          (n) => n.startsWith(`${attachmentId}.`) || n === attachmentId,
        );
        return name ? NodeFS.readFileSync(NodePath.join(dir, name)) : null;
      } catch {
        return null;
      }
    },
    /** The single conversation of 0.1.x becomes the first saved chat. */
    migrate: (legacyFile: string, provider: AgentProviderId) => {
      const old = readJson<{
        messages?: Array<AgentMessage>;
        session?: string | null;
        sessionProvider?: AgentProviderId | null;
        costUsd?: number | null;
      }>(legacyFile);
      if (!old) return;
      const messages = Array.isArray(old.messages) ? old.messages : [];
      if (messages.length) {
        const first = messages.find((m) => m.role === "user");
        const id = newId();
        const when = NodeFS.statSync(legacyFile).mtime.toISOString();
        writeJson(chatFile(id), {
          id,
          title: titleOf(first?.text ?? ""),
          provider: old.sessionProvider ?? provider,
          model: "",
          effort: "",
          created: when,
          updated: when,
          messages,
          session: old.session ?? null,
          costUsd: old.costUsd ?? null,
        } satisfies SavedChat);
      }
      NodeFS.rmSync(legacyFile, { force: true });
    },
  };
}

export type ChatStore = ReturnType<typeof chatStore>;
