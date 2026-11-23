import { IPC_EVENT_CHANNEL, type IpcEvent } from "@loud/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Electron from "electron";

export interface EventBusShape {
  /** A dashboard page that wants events (main window, a posting pane). Events go nowhere until one is attached. */
  readonly attach: (target: Electron.WebContents) => Effect.Effect<void>;
  readonly detach: (target: Electron.WebContents) => Effect.Effect<void>;
  readonly publish: (event: IpcEvent) => Effect.Effect<void>;
}

export class EventBus extends Context.Service<EventBus, EventBusShape>()(
  "@loud/desktop/app/EventBus",
) {}

export const make = (): EventBusShape => {
  const targets = new Set<Electron.WebContents>();
  return {
    attach: (target) => Effect.sync(() => void targets.add(target)),
    detach: (target) => Effect.sync(() => void targets.delete(target)),
    publish: (event) =>
      Effect.sync(() => {
        for (const target of targets)
          if (!target.isDestroyed()) target.send(IPC_EVENT_CHANNEL, event);
      }),
  };
};

export const layer = Layer.sync(EventBus, make);
