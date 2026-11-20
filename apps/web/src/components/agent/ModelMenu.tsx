import { Menu } from "@base-ui/react/menu";
import type { AgentModel, AgentProviderId, AgentProviderView } from "@loud/contracts";
import { Brain, Check, ChevronDown } from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useWork } from "~/workStore";

const popup =
  "max-h-[min(28rem,var(--available-height))] min-w-56 overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg/8 outline-none";
const item =
  "flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-disabled:opacity-48 data-highlighted:bg-accent";

export const modelLabel = (models: ReadonlyArray<AgentModel>, id: string) =>
  models.find((m) => m.id === id)?.label ?? (id || "Default");

/** Provider and model in one menu, as in T3 Code's composer. A chat that has started keeps its CLI. */
export function ModelMenu({
  providers,
  provider,
  model,
  locked,
  disabled,
}: {
  providers: ReadonlyArray<AgentProviderView>;
  provider: AgentProviderId;
  model: string;
  /** The chat has messages: only models of its own CLI can be picked. */
  locked: boolean;
  disabled: boolean;
}) {
  const select = useWork((s) => s.selectAgent);
  const current = providers.find((p) => p.id === provider);
  const label = `${current?.name ?? provider} · ${modelLabel(current?.models ?? [], model)}`;

  return (
    <Menu.Root>
      <Menu.Trigger
        disabled={disabled}
        render={<Button type="button" size="xs" variant="ghost-muted" className="max-w-64" />}
      >
        <span className="truncate">{label}</span>
        <ChevronDown />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={8} className="z-50">
          <Menu.Popup className={popup}>
            {[...providers]
              .sort((a) => (a.id === provider ? -1 : 1))
              .map((p) => {
                const off = !p.available || (locked && p.id !== provider);
                return (
                  <Menu.Group key={p.id}>
                    <Menu.GroupLabel className="flex items-baseline justify-between gap-3 px-2 pt-2 pb-1 text-muted-foreground text-xs">
                      <span>{p.name}</span>
                      {!p.available ? (
                        <span className="text-2xs">not installed</span>
                      ) : locked && p.id !== provider ? (
                        <span className="text-2xs">new chat to switch</span>
                      ) : null}
                    </Menu.GroupLabel>
                    {p.models.map((m) => {
                      const on = p.id === provider && m.id === model;
                      return (
                        <Menu.Item
                          key={m.id || "default"}
                          disabled={off}
                          className={item}
                          onClick={() => void select({ provider: p.id, model: m.id })}
                        >
                          <Check className={cn("size-3.5", !on && "invisible")} />
                          {m.label}
                        </Menu.Item>
                      );
                    })}
                  </Menu.Group>
                );
              })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function EffortMenu({
  efforts,
  effort,
  disabled,
}: {
  efforts: ReadonlyArray<string>;
  effort: string;
  disabled: boolean;
}) {
  const select = useWork((s) => s.selectAgent);
  if (!efforts.length) return null;
  const options = ["", ...efforts];
  return (
    <Menu.Root>
      <Menu.Trigger
        disabled={disabled}
        render={<Button type="button" size="xs" variant="ghost-muted" aria-label="Effort" />}
      >
        <Brain />
        {effort || "Default"}
        <ChevronDown />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={8} className="z-50">
          <Menu.Popup className={popup}>
            <Menu.Group>
              <Menu.GroupLabel className="px-2 pt-2 pb-1 text-muted-foreground text-xs">
                Reasoning effort
              </Menu.GroupLabel>
              {options.map((e) => (
                <Menu.Item
                  key={e || "default"}
                  className={item}
                  onClick={() => void select({ effort: e })}
                >
                  <Check className={cn("size-3.5", e !== effort && "invisible")} />
                  {e || "Model default"}
                </Menu.Item>
              ))}
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
