// Channel names and the bridge shape, with no runtime imports: the preload script bundles this file alone.
import type { IpcEvent, IpcInput, IpcMethod, IpcOutput } from "./ipc.ts";

export const IPC_INVOKE_CHANNEL = "loud:invoke";
export const IPC_EVENT_CHANNEL = "loud:event";

export interface IpcResultOk<A> {
  readonly ok: true;
  readonly value: A;
}
export interface IpcResultError {
  readonly ok: false;
  readonly error: string;
}
export type IpcResult<A> = IpcResultOk<A> | IpcResultError;

/** The bridge the preload script exposes on `window.loud`. */
export interface LoudBridge {
  readonly invoke: <M extends IpcMethod>(
    method: M,
    input: IpcInput<M>,
  ) => Promise<IpcResult<IpcOutput<M>>>;
  readonly onEvent: (listener: (event: IpcEvent) => void) => () => void;
}
