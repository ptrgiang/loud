// Typed access to the desktop process. Inside Loud the preload script provides `window.loud`; in a plain browser
// (`vp dev`) there is no desktop, and every call says so instead of failing silently.
import type { IpcEvent, IpcInput, IpcMethod, IpcOutput, LoudBridge } from "@loud/contracts";

declare global {
  interface Window {
    readonly loud?: LoudBridge;
  }
}

export const inDesktop = () => window.loud !== undefined;

export class LoudError extends Error {
  override readonly name = "LoudError";
}

export async function call<M extends IpcMethod>(
  method: M,
  input: IpcInput<M>,
): Promise<IpcOutput<M>> {
  if (!window.loud) throw new LoudError("Open this page in the Loud app.");
  const result = await window.loud.invoke(method, input);
  if (!result.ok) throw new LoudError(result.error);
  return result.value;
}

export function onEvent(listener: (event: IpcEvent) => void): () => void {
  return window.loud?.onEvent(listener) ?? (() => {});
}
