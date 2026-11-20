import { IPC_EVENT_CHANNEL, type IpcEvent } from "@loud/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Electron from "electron";

export interface EventBusShape {
  /** The dashboard's contents; events go nowhere until a window is attached. */
  readonly attach: (target: Electron.WebContents | null) => Effect.Effect<void>;
  readonly publish: (event: IpcEvent) => Effect.Effect<void>;
}

export class EventBus extends Context.Service<EventBus, EventBusShape>()(
  "@loud/desktop/app/EventBus",
) {}

export const make = (): EventBusShape => {
  let target: Electron.WebContents | null = null;
  return {
    attach: (next) => Effect.sync(() => void (target = next)),
    publish: (event) =>
      Effect.sync(() => {
        if (target && !target.isDestroyed()) target.send(IPC_EVENT_CHANNEL, event);
      }),
  };
};

export const layer = Layer.sync(EventBus, make);
