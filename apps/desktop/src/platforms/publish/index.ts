// Which channels a publish driver exists for. Instagram and Facebook arrive later; the pane hides the
// automation row on a channel with no driver.
import type { ChannelId, Draft } from "@loud/contracts";
import * as Electron from "electron";

import type { PublishResult } from "./common.ts";
import { publish as threads } from "./threads.ts";
import { publish as x } from "./x.ts";

export interface Driver {
  /** Composer's file input — the slot `DOM.setFileInputFiles` fills. */
  readonly fileSelector: string;
  readonly publish: (
    wc: Electron.WebContents,
    draft: Draft,
    mediaPaths: ReadonlyArray<string>,
  ) => Promise<PublishResult>;
}

export const DRIVERS: Partial<Record<ChannelId, Driver>> = {
  threads: {
    fileSelector: '[role="dialog"] input[type="file"]',
    publish: threads,
  },
  x: {
    fileSelector: 'input[data-testid="fileInput"]',
    publish: x,
  },
};
