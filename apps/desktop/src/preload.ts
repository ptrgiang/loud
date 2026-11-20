// Runs in the dashboard before its own scripts. It hands the page exactly two functions, nothing from Node or Electron.
import type { IpcEvent } from "@loud/contracts";
import { IPC_EVENT_CHANNEL, IPC_INVOKE_CHANNEL, type LoudBridge } from "@loud/contracts/bridge";
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

const bridge: LoudBridge = {
  invoke: (method, input) => ipcRenderer.invoke(IPC_INVOKE_CHANNEL, method, input),
  onEvent: (listener) => {
    const wrapped = (_event: IpcRendererEvent, payload: IpcEvent) => listener(payload);
    ipcRenderer.on(IPC_EVENT_CHANNEL, wrapped);
    return () => void ipcRenderer.removeListener(IPC_EVENT_CHANNEL, wrapped);
  },
};

contextBridge.exposeInMainWorld("loud", bridge);
