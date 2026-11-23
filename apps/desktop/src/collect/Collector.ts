// Runs collection: each step reads one platform (or listening) through its own session, writes its file, and the
// build runs once at the end. One run at a time; a timer starts runs when the user turned auto collection on.
import {
  CHANNEL_IDS,
  type ChannelFile,
  type ChannelId,
  COLLECT_STEPS,
  type BudgetView,
  type CollectionSettings,
  type CollectStart,
  type CollectStatus,
  type CollectStep,
  type ListenFile,
  type ListenItem,
  LISTEN_KEYS,
  type StepState,
} from "@loud/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Electron from "electron";
import * as NodePath from "node:path";

import { AppPaths } from "../app/AppPaths.ts";
import { EventBus } from "../app/EventBus.ts";
import { Log } from "../app/Log.ts";
import { Usage } from "../app/Usage.ts";
import { Builder } from "../build/Builder.ts";
import { formatStamp, parseStamp, wallClock } from "../build/time.ts";
import { DEMO_MARKER, readJson, writeJson } from "../data/files.ts";
import { Platforms } from "../platforms/Platforms.ts";
import { SettingsStore } from "../settings/SettingsStore.ts";
import { COLLECTORS, listen } from "./collectors.ts";
import { detectAccount } from "./detect.ts";
import { Blocked, type LimitFile, Limiter } from "./limiter.ts";
import { PageReader } from "./PageReader.ts";

export interface CollectorShape {
  readonly status: Effect.Effect<CollectStatus>;
  readonly start: (input: CollectStart) => Effect.Effect<CollectStatus, Error>;
  readonly cancel: Effect.Effect<CollectStatus>;
  readonly budgets: Effect.Effect<ReadonlyArray<BudgetView>>;
  readonly resume: (id: ChannelId) => Effect.Effect<ReadonlyArray<BudgetView>>;
  /** Re-arm the timer after the collection settings changed. */
  readonly reschedule: Effect.Effect<void>;
  /** Read the handle (and Facebook's Pages) from the logged-in pages now. */
  readonly detect: (id: ChannelId) => Effect.Effect<void>;
}

export class Collector extends Context.Service<Collector, CollectorShape>()(
  "@loud/desktop/collect/Collector",
) {}

const MIN_EVERY_HOURS = 3;
/** A failed look-up is not retried sooner than this, however often the login cookie refreshes. */
const DETECT_RETRY_MS = 30 * 60_000;

/**
 * Raised when a collector changes what a full read stores, so platforms read before get one full read again.
 * 2: Threads and Facebook kept only the newest 40 posts of a full read; Instagram kept other accounts' reels.
 */
const FULL_READ: Partial<Record<ChannelId, number>> = { threads: 2, ig: 2, fb: 2 };

interface ScanState {
  readonly fullDone?: string;
  readonly version?: number;
  readonly lastScan?: string;
  /** Runs in a row that stored no posts. A growing count can mean the platform changed its pages. */
  readonly emptyRuns?: number;
}

const daysBefore = (stamp: string, days: number) => {
  const t = parseStamp(stamp);
  return t === null ? stamp.slice(0, 10) : formatStamp(t - days * 864e5).slice(0, 10);
};

export const layer = Layer.effect(
  Collector,
  Effect.gen(function* () {
    const paths = yield* AppPaths;
    const settings = yield* SettingsStore;
    const platforms = yield* Platforms;
    const usage = yield* Usage;
    const builder = yield* Builder;
    const events = yield* EventBus;
    const log = yield* Log;

    const limitsFile = NodePath.join(paths.home, "limits.json");
    const limiter = new Limiter(readJson<LimitFile>(limitsFile) ?? {}, (f) =>
      writeJson(limitsFile, f),
    );
    const stateFile = NodePath.join(paths.data, "state.json");

    /** Limiter budgets plus the parser-health count each platform's state file keeps. */
    const budgets = () => {
      const scan = readJson<Partial<Record<ChannelId, ScanState>>>(stateFile) ?? {};
      return limiter.views().map((v) => ({ ...v, emptyRuns: scan[v.id]?.emptyRuns ?? 0 }));
    };

    // The OS starts the installed app at login; from source that would register the dev Electron binary.
    const applyLoginItem = (c: CollectionSettings) => {
      if (!Electron.app.isPackaged) return;
      try {
        Electron.app.setLoginItemSettings({ openAtLogin: c.launchAtLogin });
      } catch {
        // A platform without login items: collection still works from the tray.
      }
    };

    let status: CollectStatus = {
      running: false,
      started: null,
      finished: null,
      steps: [],
      next: null,
    };
    let abort: AbortController | null = null;
    let timer: NodeJS.Timeout | undefined;

    const publish = () => Effect.runFork(events.publish({ type: "collect", status }));
    const setStep = (step: CollectStep, patch: Partial<StepState>) => {
      status = {
        ...status,
        steps: status.steps.map((s) => (s.step === step ? { ...s, ...patch } : s)),
      };
      publish();
    };

    const stamp = () => wallClock(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);

    const missing = (id: ChannelId) => {
      const p = Effect.runSync(settings.get).platforms[id];
      // The Pages list is only needed to offer a Page pick; once one is chosen, detect stops running every collect.
      return !p.handle || (id === "fb" && !p.assetId && !p.pages?.length);
    };
    const detecting = new Map<ChannelId, Promise<void>>();
    const lastTry = new Map<ChannelId, number>();
    // Fills in the handle (and Facebook's asset id) from the logged-in pages. Never overwrites what the user typed.
    // `force` skips the retry wait; `again` also reads when nothing is missing (the user asked for a fresh list).
    const detect = (id: ChannelId, force = false, again = false): Promise<void> => {
      const running = detecting.get(id);
      if (running) return running;
      if (!again && !missing(id)) return Promise.resolve();
      if (!force && Date.now() - (lastTry.get(id) ?? 0) < DETECT_RETRY_MS) return Promise.resolve();
      lastTry.set(id, Date.now());
      const reader = new PageReader(
        id,
        platforms.session(id),
        limiter,
        new AbortController().signal,
      );
      const job = (async () => {
        try {
          const userId = Effect.runSync(settings.get).platforms[id].userId;
          const found = await detectAccount(id, userId, reader);
          if (!found.handle && !found.assetId && !found.pages?.length) return;
          await Effect.runPromise(
            settings.updatePlatform(id, (p) => ({
              ...p,
              handle: p.handle || found.handle || "",
              ...(p.assetId || !found.assetId ? {} : { assetId: found.assetId }),
              ...(found.pages?.length ? { pages: found.pages } : {}),
            })),
          );
          await Effect.runPromise(events.publish({ type: "platforms" }));
        } catch {
          // A checkpoint already paused the platform in the limiter; anything else leaves the fields for the user.
        } finally {
          reader.close();
          detecting.delete(id);
        }
      })();
      detecting.set(id, job);
      return job;
    };

    const runStep = async (step: CollectStep, full: boolean, signal: AbortSignal) => {
      const s = Effect.runSync(settings.get);
      const tz = s.timezone;
      const targets: ReadonlyArray<ChannelId> = step === "listen" ? CHANNEL_IDS : [step];
      const ready: Array<ChannelId> = [];
      for (const id of targets) {
        if (!s.platforms[id].enabled) continue;
        const view = await Effect.runPromise(platforms.view(id));
        if (view.status === "connected") ready.push(id);
      }
      if (!ready.length) return setStep(step, { status: "skipped", detail: "not connected" });

      if (step === "listen") {
        const old = readJson<ListenFile>(NodePath.join(paths.data, "listen.json"));
        const collectedDay = wallClock(new Date(), tz).slice(0, 10);
        // Two posts sharing text but from different authors are different posts.
        const keyOf = (i: ListenItem) => i.url ?? `${i.channel}${i.author}${i.text}`;
        const kept = new Map((old?.items ?? []).map((i) => [keyOf(i), i]));
        let count = 0;
        const notes: Array<string> = [];
        for (const id of ready) {
          const queries = s.keywords[LISTEN_KEYS[id]] ?? [];
          if (!queries.length) continue;
          const reader = new PageReader(id, platforms.session(id), limiter, signal);
          try {
            const rows = await listen({
              id,
              queries,
              timezone: tz,
              since: s.since,
              reader,
              progress: (detail, n) =>
                setStep(step, { detail: `${id}: ${detail}`, count: count + n }),
            });
            for (const r of rows) {
              // Undated results expire by first-seen day, not by a date the parser never found.
              kept.set(keyOf(r), r.posted ? r : { ...r, found: collectedDay });
            }
            count += rows.length;
          } catch (e) {
            if (e instanceof Blocked || signal.aborted)
              notes.push(`${id}: ${e instanceof Error ? e.message : e}`);
            else notes.push(`${id} failed: ${e instanceof Error ? e.message : String(e)}`);
            // The same pause a platform step raises: an OS notice so it is not missed.
            if (e instanceof Blocked) {
              try {
                new Electron.Notification({
                  title: `Loud paused ${id}`,
                  body: e.message,
                }).show();
              } catch {
                // No display server: the pause still shows in the app.
              }
            }
          } finally {
            reader.close();
          }
          if (signal.aborted) break;
        }
        writeJson(NodePath.join(paths.data, "listen.json"), {
          collected: wallClock(new Date(), tz),
          // A date the parser can't read shouldn't cost the result — keep it for two weeks, not forever.
          items: [...kept.values()].filter((i) =>
            i.posted
              ? i.posted >= s.since
              : (i.found ?? collectedDay) >= daysBefore(collectedDay, 14),
          ),
        } satisfies ListenFile);
        return setStep(step, {
          status: signal.aborted ? "stopped" : notes.length && !count ? "failed" : "done",
          detail: notes.join("; ") || `${count} results`,
          count,
        });
      }

      const id = step;
      if (missing(id)) {
        setStep(step, { detail: "reading the account name" });
        await detect(id, true);
      }
      const p = Effect.runSync(settings.get).platforms[id];
      if (id === "fb" && !p.assetId)
        return setStep(step, { status: "skipped", detail: "choose the Page in Connections first" });
      if (!p.handle)
        return setStep(step, { status: "skipped", detail: "set the handle in Connections first" });
      const scan = readJson<Partial<Record<ChannelId, ScanState>>>(stateFile) ?? {};
      const version = FULL_READ[id] ?? 1;
      const fullRun = full || !scan[id]?.fullDone || (scan[id]?.version ?? 1) < version;
      const now = wallClock(new Date(), tz);
      // Later runs re-read only the last few days (a setting); older posts keep their numbers.
      const scanFrom = fullRun
        ? s.since
        : [s.since, daysBefore(now, s.collection.rescanDays)].sort().at(-1)!;
      const out = NodePath.join(paths.data, `${id}.json`);
      const reader = new PageReader(id, platforms.session(id), limiter, signal);
      try {
        const written = await COLLECTORS[id]({
          id,
          handle: p.handle,
          assetId: p.assetId,
          timezone: tz,
          since: s.since,
          scanFrom,
          full: fullRun,
          old: readJson<ChannelFile>(out),
          reader,
          progress: (detail, count) => setStep(step, { detail, count }),
        });
        writeJson(out, written);
        // Only a truly empty profile counts toward a stuck run: posts present but views missing is a parser gap,
        // not an empty account — retrying can't fill numbers the page never had.
        const emptyRuns = written.posts.length === 0 ? (scan[id]?.emptyRuns ?? 0) + 1 : 0;
        writeJson(stateFile, {
          ...scan,
          [id]: {
            ...scan[id],
            lastScan: now,
            emptyRuns,
            ...(fullRun ? { fullDone: now, version } : {}),
          },
        });
        setStep(step, {
          status: "done",
          // The newest post says at a glance whether the latest ones were read.
          detail: `${written.posts.length} posts stored${written.posts[0]?.posted ? `, newest ${written.posts[0].posted}` : ""}${written.scheduled_known ? "" : "; queue not readable"}`,
        });
      } catch (e) {
        setStep(step, {
          status: signal.aborted ? "stopped" : "failed",
          detail: e instanceof Error ? e.message : String(e),
        });
        // A pause is easy to miss with the window closed; the OS says it.
        if (e instanceof Blocked) {
          try {
            new Electron.Notification({ title: `Loud paused ${id}`, body: e.message }).show();
          } catch {
            // No display server: the pause still shows in the app.
          }
        }
      } finally {
        reader.close();
      }
    };

    const nextRun = (c: CollectionSettings, from: number) =>
      c.auto ? from + Math.max(MIN_EVERY_HOURS, c.everyHours) * 3_600_000 : null;

    const arm = (from = Date.now()) => {
      clearTimeout(timer);
      const c = Effect.runSync(settings.get).collection;
      const at = nextRun(c, from);
      status = { ...status, next: at === null ? null : new Date(at).toISOString() };
      if (at !== null)
        timer = setTimeout(
          () => Effect.runFork(Effect.ignore(start({}))),
          Math.max(60_000, at - Date.now()),
        );
      timer?.unref();
      publish();
    };

    const start = (input: CollectStart) =>
      Effect.gen(function* () {
        if (abort) return status;
        if (readJson(NodePath.join(paths.data, DEMO_MARKER)))
          return yield* Effect.fail(
            new Error(
              "This data folder holds the fictional demo; collecting would mix real numbers into it.",
            ),
          );
        const steps = input.steps?.length ? [...new Set(input.steps)] : [...COLLECT_STEPS];
        const ctl = new AbortController();
        abort = ctl;
        status = {
          ...status,
          running: true,
          started: stamp(),
          finished: null,
          steps: steps.map((step) => ({ step, status: "waiting", detail: "", count: 0 })),
        };
        publish();
        log.info(`collect run started: ${steps.join(", ")}`);
        yield* Effect.forkDetach(
          Effect.promise(async () => {
            try {
              for (const step of steps) {
                if (ctl.signal.aborted) {
                  setStep(step, { status: "stopped", detail: "stopped" });
                  continue;
                }
                setStep(step, { status: "running", detail: "starting" });
                await runStep(step, input.full ?? false, ctl.signal).catch((e: unknown) =>
                  setStep(step, {
                    status: "failed",
                    detail: e instanceof Error ? e.message : String(e),
                  }),
                );
                const ended = status.steps.find((s) => s.step === step);
                if (ended) {
                  usage.record(step, ended.status, ended.detail);
                  (ended.status === "failed" ? log.warn : log.info)(
                    `collect ${step}: ${ended.status}${ended.detail ? ` — ${ended.detail}` : ""}`,
                  );
                }
              }
              await Effect.runPromise(builder.build);
            } finally {
              // Whatever ended the run — a defect in a step or in the build counts too: mark it done and re-arm.
              abort = null;
              status = { ...status, running: false, finished: stamp() };
              arm();
            }
          }),
        );
        return status;
      });

    yield* Effect.sync(() => {
      applyLoginItem(Effect.runSync(settings.get).collection);
      arm();
    });

    // Accounts connected before, or whose look-up failed last time: try once now, one platform after another.
    platforms.onLogin((id) => void detect(id));
    const startup = setTimeout(() => {
      void (async () => {
        for (const v of await Effect.runPromise(platforms.list))
          if (v.status === "connected" && v.enabled) await detect(v.id, true);
      })();
    }, 5_000);
    startup.unref();

    return Collector.of({
      status: Effect.sync(() => status),
      start,
      cancel: Effect.sync(() => {
        abort?.abort();
        return status;
      }),
      budgets: Effect.sync(budgets),
      resume: (id) =>
        Effect.sync(() => {
          limiter.resume(id);
          // A pause may have cut a detection short; the user just cleared the wall, so read again now.
          void detect(id, true);
          return budgets();
        }),
      reschedule: Effect.sync(() => {
        applyLoginItem(Effect.runSync(settings.get).collection);
        arm();
      }),
      detect: (id) => Effect.promise(() => detect(id, true, true)),
    });
  }),
);
