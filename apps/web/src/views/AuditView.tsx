import { CHANNEL_IDS, CHANNEL_NAMES, type ChannelId } from "@loud/contracts";
import { ClipboardCheck } from "lucide-react";

import { Card, Quiet, ViewBody } from "~/components/Card";
import { byLevel, FlagList } from "~/components/Flags";
import { NoData } from "~/components/NoData";
import { ChannelTag, PageHeader } from "~/components/PageHeader";
import { relative } from "~/lib/format";
import { useLoud } from "~/store";

/** "Threads: …" or "Instagram by format …" belongs to that channel. The name must stand alone, so "Xenial" is not X. */
export function noteChannel(note: string): { channel: ChannelId | null; body: string } {
  for (const id of CHANNEL_IDS) {
    const name = CHANNEL_NAMES[id];
    if (new RegExp(`^${name}(?![\\p{L}\\p{N}])`, "iu").test(note)) {
      const body = note.replace(new RegExp(`^${name}\\s*:\\s*`, "iu"), "");
      return { channel: id, body: body.charAt(0).toUpperCase() + body.slice(1) };
    }
  }
  return { channel: null, body: note };
}

export function AuditView() {
  const hub = useLoud((s) => s.hub);
  const proposals = useLoud((s) => s.proposals);
  if (!hub) return <NoData title="Audit" icon={ClipboardCheck} />;

  const notes = proposals?.audit ?? [];
  return (
    <>
      <PageHeader
        title="Audit"
        description="Automatic checks run on every build. Agent notes come with the proposals."
      />
      <ViewBody>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card
            title="Automatic"
            hint={`${hub.flags.length} from the build ${relative(hub.built)}`}
            bodyClassName="px-0 pb-0"
          >
            {hub.flags.length ? (
              <FlagList flags={byLevel(hub.flags)} />
            ) : (
              <Quiet>Nothing stands out.</Quiet>
            )}
          </Card>
          <Card
            title="Agent notes"
            hint={proposals ? `Written ${relative(proposals.written)}` : "None yet"}
            bodyClassName="px-0 pb-0"
          >
            {notes.length ? (
              <ul className="divide-y">
                {notes.map((note) => {
                  const { channel, body } = noteChannel(note);
                  return (
                    <li key={note} className="flex gap-3 px-4 py-2.5 text-sm">
                      <span className="w-24 shrink-0 pt-px">
                        {channel ? (
                          <ChannelTag id={channel} />
                        ) : (
                          <span className="text-muted-foreground text-xs">General</span>
                        )}
                      </span>
                      <span>{body}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Quiet>The agent has not written notes yet.</Quiet>
            )}
          </Card>
        </div>
      </ViewBody>
    </>
  );
}
