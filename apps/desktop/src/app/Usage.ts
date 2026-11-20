// Usage reports, only after the user said yes: one POST a day to the Loud site with the report the user can preview in
// Settings. Nothing is counted or sent before that answer; turning it off asks the server to delete what this install
// sent, then drops the install id and the counts.
import {
  type CollectStep,
  emptyCollect,
  type StepState,
  type StepTally,
  USAGE_ENDPOINT,
  type UsageReport,
  type UsageStatus,
} from "@loud/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Electron from "electron";
import * as NodeCrypto from "node:crypto";
import * as NodePath from "node:path";

import { DEMO_MARKER, type DemoMarker, readJson, writeJson } from "../data/files.ts";
import { Platforms } from "../platforms/Platforms.ts";
import { SettingsStore } from "../settings/SettingsStore.ts";
import { AppPaths } from "./AppPaths.ts";
import { EventBus } from "./EventBus.ts";
import { buildReport, tally, utcDay } from "./usageReport.ts";

export interface UsageShape {
  readonly status: Effect.Effect<UsageStatus>;
  readonly configure: (share: boolean) => Effect.Effect<UsageStatus>;
  readonly preview: Effect.Effect<UsageReport>;
  /** Counts a finished collection step, when sharing is on. */
  readonly record: (step: CollectStep, status: StepState["status"], detail: string) => void;
}

export class Usage extends Context.Service<Usage, UsageShape>()("@loud/desktop/app/Usage") {}

interface UsageFile {
  install: string | null;
  sentDay: string | null;
  lastSent: string | null;
  collect: Record<CollectStep, StepTally>;
}

const CHECK_MS = 3_600_000;
const FIRST_MS = 60_000;
const SEND_TIMEOUT_MS = 10_000;

export const layer = Layer.effect(
  Usage,
  Effect.gen(function* () {
    const paths = yield* AppPaths;
    const settings = yield* SettingsStore;
    const events = yield* EventBus;
    const platforms = yield* Platforms;
    const file = NodePath.join(paths.home, "usage.json");
    // LOUD_USAGE_URL points a copy run from source at a test server; otherwise only installed copies send.
    const endpoint = process.env.LOUD_USAGE_URL ?? USAGE_ENDPOINT;

    const fresh = (): UsageFile => ({
      install: null,
      sentDay: null,
      lastSent: null,
      collect: emptyCollect(),
    });
    let state: UsageFile = { ...fresh(), ...readJson<Partial<UsageFile>>(file) };
    state.collect = { ...emptyCollect(), ...state.collect };
    const save = () => writeJson(file, state);

    const unavailable = (): string | null => {
      if (!Electron.app.isPackaged && !process.env.LOUD_USAGE_URL)
        return "Running from source: usage reports are sent by the installed app only.";
      if (readJson<DemoMarker>(NodePath.join(paths.data, DEMO_MARKER))?.demo === true)
        return "This data folder holds the fictional demo, so nothing is sent.";
      return null;
    };
    const share = () => Effect.runSync(settings.get).usage.share;

    const status = (): UsageStatus => {
      const reason = unavailable();
      return {
        share: share(),
        available: reason === null,
        reason,
        endpoint,
        lastSent: state.lastSent,
      };
    };
    const publish = () => Effect.runFork(events.publish({ type: "usage", status: status() }));

    const report = async (): Promise<UsageReport> => {
      const s = Effect.runSync(settings.get);
      const views = await Effect.runPromise(platforms.list);
      return buildReport({
        install: state.install ?? "made when you turn this on",
        version: Electron.app.getVersion(),
        os: process.platform,
        arch: process.arch,
        platforms: views.map((v) => ({
          id: v.id,
          connected: v.status === "connected",
          included: v.enabled,
        })),
        collect: state.collect,
        agent: s.agent.enabled,
        updateChecks: s.updates.check,
      });
    };

    let sending = false;
    const send = async (force = false) => {
      if (sending || share() !== true || unavailable() !== null || !state.install) return;
      const today = utcDay(new Date());
      if (!force && state.sentDay === today) return;
      sending = true;
      try {
        const body = JSON.stringify(await report());
        const res = await Electron.net.fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        if (!res.ok) return;
        state = {
          ...state,
          sentDay: today,
          lastSent: new Date().toISOString(),
          collect: emptyCollect(),
        };
        save();
        publish();
      } catch {
        // offline or the site is down: the counts wait for the next try
      } finally {
        sending = false;
      }
    };

    setTimeout(() => void send(), FIRST_MS).unref();
    setInterval(() => void send(), CHECK_MS).unref();

    return Usage.of({
      status: Effect.sync(status),
      preview: Effect.promise(report),
      configure: (yes) =>
        Effect.gen(function* () {
          yield* settings.update((s) => ({ ...s, usage: { share: yes } }));
          if (!yes && state.install && unavailable() === null) {
            const gone = `${endpoint}/${state.install}`;
            // Best effort: offline, the server keeps what it had until its 400-day cleanup.
            void Electron.net
              .fetch(gone, { method: "DELETE", signal: AbortSignal.timeout(SEND_TIMEOUT_MS) })
              .catch(() => undefined);
          }
          // A new id each time sharing is turned on, so an earlier period cannot be linked to this one.
          state = yes ? { ...state, install: state.install ?? NodeCrypto.randomUUID() } : fresh();
          save();
          if (yes) yield* Effect.promise(() => send(true));
          publish();
          return status();
        }),
      record: (step, stepStatus, detail) => {
        if (share() !== true) return;
        state = { ...state, collect: tally(state.collect, step, stepStatus, detail) };
        save();
      },
    });
  }),
);
