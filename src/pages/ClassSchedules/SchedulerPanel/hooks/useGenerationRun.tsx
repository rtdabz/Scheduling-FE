import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import api from "../../../../lib/api";
import { getConnectionStatus } from "../../../../lib/connectionStatus";
import type { ApiScheduleRecord } from "../types";
import {
  parseYearLevelFailurePayload,
  type AppliedStrategy,
  type GenerationAdjustment,
  type GenerationRecommendation,
  type YearLevelGenerationFailure,
} from "../GenerateSchedule/yearLevelGenerationFailure";
import type { GenerationChange } from "../GenerateSchedule/generationChanges";

/**
 * Year-level generation runs on a queue worker and regularly outlives the
 * modal that started it. Ownership of the run therefore lives here, above the
 * generator, so closing the panel or reloading the page never orphans work
 * that is still in flight.
 */

export type GenerationRunStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type GenerationResult = {
  schedules?: ApiScheduleRecord[];
  applied_strategy?: AppliedStrategy | null;
  applied_adjustments?: GenerationAdjustment[];
  generation_changes?: GenerationChange[];
  recommendations?: GenerationRecommendation[];
};

type GenerationRunRecord = {
  run_id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | string;
  year_level?: number | string | null;
  result?: GenerationResult | Record<string, unknown> | null;
  error_message?: string | null;
  started_at?: string | null;
  created_at?: string | null;
};

export type GenerationRunMeta = {
  yearLevel: number;
  sectionCount: number;
};

type GenerationRunSnapshot = {
  status: GenerationRunStatus;
  runId: string | null;
  meta: GenerationRunMeta | null;
  queuedAtMs: number | null;
  serverStartedAt: string | null;
  result: GenerationResult | null;
  failure: YearLevelGenerationFailure | null;
  errorMessage: string | null;
};

const POLL_INTERVAL_MS = 1500;
// On a slow link a status check can take longer than the interval itself, so
// back off rather than keep the connection busy. A hidden tab needs no live
// progress; it catches up the moment it is shown again.
const SLOW_POLL_INTERVAL_MS = 5000;
const HIDDEN_POLL_INTERVAL_MS = 10_000;

const pollDelayMs = (): number => {
  if (document.visibilityState === "hidden") return HIDDEN_POLL_INTERVAL_MS;
  return getConnectionStatus().quality === "online" ? POLL_INTERVAL_MS : SLOW_POLL_INTERVAL_MS;
};
// The queue worker not running is the most common reason a run never starts,
// and it is not a generation failure. Surface it as its own hint well before
// the server expires the run at its queue-wait limit.
const WORKER_STALL_HINT_MS = 20_000;

const idleSnapshot: GenerationRunSnapshot = {
  status: "idle",
  runId: null,
  meta: null,
  queuedAtMs: null,
  serverStartedAt: null,
  result: null,
  failure: null,
  errorMessage: null,
};

const isActiveStatus = (status: GenerationRunStatus) =>
  status === "queued" || status === "running";

const storageKeyFor = (departmentId: number | null, semesterId: number | null) =>
  `wicars.generation-run.${departmentId ?? "none"}.${semesterId ?? "none"}`;

type GenerationRunContextValue = GenerationRunSnapshot & {
  isActive: boolean;
  /** Result is ready but the user has not opened it yet. */
  hasUnreviewedResult: boolean;
  elapsedMs: number;
  workerStalled: boolean;
  start: (payload: unknown, meta: GenerationRunMeta) => Promise<void>;
  markReviewed: () => void;
  /** Stop waiting locally without telling the server. */
  clear: () => void;
  /** Stop the run itself: the worker unwinds at its next checkpoint. */
  cancel: () => Promise<void>;
};

const GenerationRunContext = createContext<GenerationRunContextValue | null>(
  null,
);

export function GenerationRunProvider({
  departmentId,
  semesterId,
  children,
}: {
  departmentId: number | null;
  semesterId: number | null;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<GenerationRunSnapshot>(idleSnapshot);
  const [reviewed, setReviewed] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Every queue submission supersedes the previous one: a stale poll response
  // must never overwrite the run the user is actually waiting on.
  const requestIdRef = useRef(0);
  const storageKey = storageKeyFor(departmentId, semesterId);

  const persistRunId = useCallback(
    (runId: string | null) => {
      try {
        if (runId) window.localStorage.setItem(storageKey, runId);
        else window.localStorage.removeItem(storageKey);
      } catch {
        // A browser with storage disabled still tracks the run in memory.
      }
    },
    [storageKey],
  );

  const applyRun = useCallback((run: GenerationRunRecord) => {
    if (run.status === "completed") {
      const result =
        run.result && typeof run.result === "object"
          ? (run.result as GenerationResult)
          : null;
      const schedules = Array.isArray(result?.schedules) ? result.schedules : [];
      if (schedules.length === 0) {
        setSnapshot((current) => ({
          ...current,
          status: "failed",
          result: null,
          failure: null,
          errorMessage:
            "Generation completed without a timetable. Please generate again.",
        }));
        return;
      }
      setSnapshot((current) => ({
        ...current,
        status: "completed",
        result,
        failure: null,
        errorMessage: null,
      }));
      return;
    }

    if (run.status === "failed" || run.status === "cancelled") {
      setSnapshot((current) => ({
        ...current,
        status: "failed",
        result: null,
        // A structured diagnostic drives the Recommended Adjustment panel; a
        // plain message is shown as text instead.
        failure: parseYearLevelFailurePayload(run.result),
        errorMessage: run.error_message ?? "Year-level generation failed.",
      }));
      return;
    }

    setSnapshot((current) => ({
      ...current,
      status: run.status === "running" ? "running" : "queued",
      serverStartedAt: run.started_at ?? null,
    }));
  }, []);

  const start = useCallback(
    async (payload: unknown, meta: GenerationRunMeta) => {
      const requestId = ++requestIdRef.current;
      setReviewed(false);
      setSnapshot({
        ...idleSnapshot,
        status: "queued",
        meta,
        queuedAtMs: Date.now(),
      });

      try {
        const queued = await api.post<{ run_id: string }>(
          "/schedule-recommendations/year-level-preview/queue",
          payload,
        );
        if (requestIdRef.current !== requestId) return;
        persistRunId(queued.data.run_id);
        setSnapshot((current) => ({ ...current, runId: queued.data.run_id }));
      } catch (error: unknown) {
        if (requestIdRef.current !== requestId) return;
        const apiError = error as {
          message?: string;
          response?: { status?: number; data?: { message?: string } };
        };
        setSnapshot((current) => ({
          ...current,
          status: "failed",
          failure: parseYearLevelFailurePayload(apiError.response?.data),
          errorMessage:
            apiError.response?.status === 401
              ? "Your session expired. Sign in again before generating schedules."
              : (apiError.response?.data?.message ??
                apiError.message ??
                "The generation request could not be queued."),
        }));
      }
    },
    [persistRunId],
  );

  const clear = useCallback(() => {
    requestIdRef.current += 1;
    persistRunId(null);
    setReviewed(true);
    setSnapshot(idleSnapshot);
  }, [persistRunId]);

  // Cancel locally first so the spinner and the poll stop immediately; the
  // request only has to reach the server eventually for the worker to notice.
  const cancel = useCallback(async () => {
    const runId = snapshot.runId;
    const wasActive = isActiveStatus(snapshot.status);
    clear();
    if (!runId || !wasActive) return;
    try {
      await api.post(`/schedule-recommendations/generation-runs/${runId}/cancel`);
    } catch {
      // A run the server never cancelled still expires on its own limits.
    }
  }, [clear, snapshot.runId, snapshot.status]);

  const markReviewed = useCallback(() => setReviewed(true), []);

  // Rehydrate after a reload or a return to the page. The stored id also
  // recovers a finished run whose result was never applied; the server lookup
  // is the fallback when this browser has no record of it.
  useEffect(() => {
    if (departmentId === null || semesterId === null) return;
    let cancelled = false;

    const adopt = (run: GenerationRunRecord) => {
      if (cancelled) return;
      requestIdRef.current += 1;
      persistRunId(run.run_id);
      setReviewed(false);
      setSnapshot({
        ...idleSnapshot,
        runId: run.run_id,
        status: "queued",
        meta: run.year_level
          ? { yearLevel: Number(run.year_level), sectionCount: 0 }
          : null,
        queuedAtMs: run.created_at
          ? new Date(run.created_at).getTime()
          : Date.now(),
      });
      applyRun(run);
    };

    const readStoredRunId = (): string | null => {
      try {
        return window.localStorage.getItem(storageKey);
      } catch {
        return null;
      }
    };

    const restore = async () => {
      const storedRunId = readStoredRunId();

      if (storedRunId) {
        try {
          const { data } = await api.get<GenerationRunRecord>(
            `/schedule-recommendations/generation-runs/${storedRunId}`,
          );
          adopt(data);
          return;
        } catch {
          persistRunId(null);
        }
      }

      try {
        const { data } = await api.get<{ run: GenerationRunRecord | null }>(
          "/schedule-recommendations/active-generation-run",
          { params: { department_id: departmentId, semester_id: semesterId } },
        );
        if (data.run) adopt(data.run);
      } catch {
        // No recoverable run; the panel simply starts idle.
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
    // Restoration is per department/semester context, not per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, semesterId, storageKey]);

  // Poll only while the run is genuinely in flight. There is no client-side
  // deadline: the server reconciles an orphaned run and reports it as failed.
  useEffect(() => {
    if (!snapshot.runId || !isActiveStatus(snapshot.status)) return;
    const requestId = requestIdRef.current;
    let cancelled = false;
    let inFlight = false;
    let timer = 0;

    const tick = async () => {
      timer = 0;
      inFlight = true;
      try {
        const { data } = await api.get<GenerationRunRecord>(
          `/schedule-recommendations/generation-runs/${snapshot.runId}`,
        );
        if (cancelled || requestIdRef.current !== requestId) return;
        applyRun(data);
      } catch (error: unknown) {
        if (cancelled || requestIdRef.current !== requestId) return;
        const apiError = error as { response?: { status?: number } };
        // A transient poll error should not kill a healthy run; only an
        // unrecoverable one stops the loop.
        if (apiError.response?.status === 404) {
          setSnapshot((current) => ({
            ...current,
            status: "failed",
            errorMessage: "This generation run is no longer available.",
          }));
          return;
        }
      } finally {
        inFlight = false;
      }
      if (!cancelled) timer = window.setTimeout(tick, pollDelayMs());
    };

    // Returning to the tab should show current progress, not wait out the
    // longer hidden-tab interval. Only a loop that is waiting for its next
    // tick is sped up; one that stopped (404, superseded) stays stopped.
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || inFlight || cancelled || timer === 0) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, 0);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Poll once straight away so a fast run is not held back by the interval.
    timer = window.setTimeout(tick, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [applyRun, snapshot.runId, snapshot.status]);

  // Elapsed time only ticks while something is running.
  const active = isActiveStatus(snapshot.status);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNowMs(Date.now());
    // The first tick is deferred so a restored run does not render a stale
    // elapsed time for a full second.
    const immediate = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(immediate);
      window.clearInterval(timer);
    };
  }, [active]);

  useEffect(() => {
    if (snapshot.status === "idle") persistRunId(null);
  }, [persistRunId, snapshot.status]);

  const elapsedMs = snapshot.queuedAtMs
    ? Math.max(0, nowMs - snapshot.queuedAtMs)
    : 0;

  const value = useMemo<GenerationRunContextValue>(
    () => ({
      ...snapshot,
      isActive: active,
      hasUnreviewedResult: snapshot.status === "completed" && !reviewed,
      elapsedMs,
      workerStalled:
        snapshot.status === "queued" &&
        snapshot.serverStartedAt === null &&
        elapsedMs > WORKER_STALL_HINT_MS,
      start,
      markReviewed,
      clear,
      cancel,
    }),
    [active, cancel, clear, elapsedMs, markReviewed, reviewed, snapshot, start],
  );

  return (
    <GenerationRunContext.Provider value={value}>
      {children}
    </GenerationRunContext.Provider>
  );
}

export function useGenerationRun(): GenerationRunContextValue {
  const value = useContext(GenerationRunContext);
  if (!value) {
    throw new Error(
      "useGenerationRun must be used inside a GenerationRunProvider.",
    );
  }

  return value;
}
