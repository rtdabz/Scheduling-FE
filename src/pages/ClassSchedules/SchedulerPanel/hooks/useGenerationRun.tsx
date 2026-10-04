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
import type { UnplacedCourse } from "../GenerateSchedule/draftReview";

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
  status?: "complete" | "partial";
  message?: string;
  unplaced_courses?: UnplacedCourse[];
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
const SLOW_POLL_INTERVAL_MS = 5000;
const HIDDEN_POLL_INTERVAL_MS = 10_000;

const pollDelayMs = (): number => {
  if (document.visibilityState === "hidden") return HIDDEN_POLL_INTERVAL_MS;
  return getConnectionStatus().quality === "online" ? POLL_INTERVAL_MS : SLOW_POLL_INTERVAL_MS;
};
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
  hasUnreviewedResult: boolean;
  elapsedMs: number;
  workerStalled: boolean;
  start: (payload: unknown, meta: GenerationRunMeta) => Promise<void>;
  markReviewed: () => void;
  clear: () => void;
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
  const requestIdRef = useRef(0);
  const storageKey = storageKeyFor(departmentId, semesterId);

  const persistRunId = useCallback(
    (runId: string | null) => {
      try {
        if (runId) window.localStorage.setItem(storageKey, runId);
        else window.localStorage.removeItem(storageKey);
      } catch {
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
        failure: parseYearLevelFailurePayload(run.result),
        errorMessage: run.error_message ?? "Year-level generation failed.",
      }));
      return;
    }

    const interim = run.status === "running" ? parseYearLevelFailurePayload(run.result) : null;
    setSnapshot((current) => ({
      ...current,
      status: run.status === "running" ? "running" : "queued",
      serverStartedAt: run.started_at ?? null,
      failure: interim?.provisional ? interim : current.failure,
    }));
  }, []);

  const start = useCallback(
    async (payload: unknown, meta: GenerationRunMeta) => {
      const requestId = ++requestIdRef.current;
      const replacedRunId = isActiveStatus(snapshot.status) ? snapshot.runId : null;
      setReviewed(false);
      setSnapshot({
        ...idleSnapshot,
        status: "queued",
        meta,
        queuedAtMs: Date.now(),
      });

      try {
        if (replacedRunId) {
          persistRunId(null);
          await api
            .post(`/schedule-recommendations/generation-runs/${replacedRunId}/cancel`)
            .catch(() => undefined);
          if (requestIdRef.current !== requestId) return;
        }
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
    [persistRunId, snapshot.runId, snapshot.status],
  );

  const clear = useCallback(() => {
    requestIdRef.current += 1;
    persistRunId(null);
    setReviewed(true);
    setSnapshot(idleSnapshot);
  }, [persistRunId]);

  const cancel = useCallback(async () => {
    const runId = snapshot.runId;
    const wasActive = isActiveStatus(snapshot.status);
    clear();
    if (!runId || !wasActive) return;
    try {
      await api.post(`/schedule-recommendations/generation-runs/${runId}/cancel`);
    } catch {
    }
  }, [clear, snapshot.runId, snapshot.status]);

  const markReviewed = useCallback(() => setReviewed(true), []);

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
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, semesterId, storageKey]);

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

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || inFlight || cancelled || timer === 0) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, 0);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    timer = window.setTimeout(tick, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [applyRun, snapshot.runId, snapshot.status]);

  const active = isActiveStatus(snapshot.status);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNowMs(Date.now());
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
