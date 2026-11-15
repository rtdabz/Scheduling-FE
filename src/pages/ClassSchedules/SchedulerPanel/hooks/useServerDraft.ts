import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import api from "../../../../lib/api";

/* eslint-disable react-hooks/set-state-in-effect */

export type DraftSaveState = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 700;
const RETRY_DELAYS_MS = [2000, 5000, 10000, 20000, 30000];

/**
 * Auto-saves a workflow's progress to the server and loads it back when the workflow opens.
 *
 * - Saves are debounced, sent one at a time, and carry an increasing revision; the server
 *   refuses older revisions, so a delayed or retried request never replaces newer progress.
 * - Failed saves retry with backoff; validation/permission errors stop and show "Save failed".
 * - Nothing is saved until the stored progress has loaded, so an empty form never overwrites it.
 * - The latest unsaved progress is flushed on close and, best effort, when the page is hidden
 *   or unloaded.
 *
 * `params` identify the draft (e.g. semester_id, department_id) and are sent with every call.
 */
export function useServerDraft<T>(endpoint: string, params: Record<string, number | string> | null, isOpen: boolean) {
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState<T | null>(null);
  const [saveState, setSaveState] = useState<DraftSaveState>("idle");
  const [loadAttempt, setLoadAttempt] = useState(0);

  const paramsKey = params ? JSON.stringify(params) : null;
  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; }, [params]);
  const sendRef = useRef<() => Promise<void>>(async () => undefined);
  const lastRevisionRef = useRef(0);
  const pendingRef = useRef<{ payload: T; revision: number } | null>(null);
  const savedRevisionRef = useRef(0);
  const inFlightRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const lastJsonRef = useRef<string | null>(null);

  // Revisions are time-based so saves from another tab or a later session still order correctly.
  const nextRevision = () => {
    lastRevisionRef.current = Math.max(Date.now(), lastRevisionRef.current + 1);
    return lastRevisionRef.current;
  };

  const clearTimers = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (retryRef.current) clearTimeout(retryRef.current);
    debounceRef.current = null;
    retryRef.current = null;
  };

  const send = useCallback(async (): Promise<void> => {
    const currentParams = paramsRef.current;
    const pending = pendingRef.current;
    if (!currentParams || !pending || inFlightRef.current) return;
    inFlightRef.current = true;
    setSaveState("saving");
    try {
      await api.put(endpoint, { ...currentParams, revision: pending.revision, payload: pending.payload });
      savedRevisionRef.current = Math.max(savedRevisionRef.current, pending.revision);
      attemptRef.current = 0;
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 409) {
        // A newer version is already stored (another tab or a later save): nothing is lost.
        savedRevisionRef.current = Math.max(savedRevisionRef.current, pending.revision);
        attemptRef.current = 0;
      } else {
        inFlightRef.current = false;
        setSaveState("error");
        // Validation or permission errors will not fix themselves; network and server errors retry.
        const retryable = status === undefined || status === 408 || status === 429 || status >= 500;
        if (retryable) {
          const delay = RETRY_DELAYS_MS[Math.min(attemptRef.current, RETRY_DELAYS_MS.length - 1)];
          attemptRef.current += 1;
          retryRef.current = setTimeout(() => { retryRef.current = null; void sendRef.current(); }, delay);
        }
        return;
      }
    }
    inFlightRef.current = false;
    const latest = pendingRef.current;
    if (latest && latest.revision > savedRevisionRef.current) {
      void sendRef.current();
      return;
    }
    pendingRef.current = null;
    setSaveState("saved");
  }, [endpoint]);
  useEffect(() => { sendRef.current = send; }, [send]);

  /** Queues the latest progress; identical progress is not re-sent. */
  const save = useCallback((payload: T) => {
    // Never save before the stored progress has been read: that would overwrite it.
    if (!paramsRef.current || !loaded || loadFailed) return;
    const json = JSON.stringify(payload);
    if (json === lastJsonRef.current) return;
    lastJsonRef.current = json;
    pendingRef.current = { payload, revision: nextRevision() };
    setSaveState("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (retryRef.current) return; // the scheduled retry sends the newest progress
      void sendRef.current();
    }, DEBOUNCE_MS);
  }, [loaded, loadFailed]);

  /** Sends any unsaved progress now (used when the workflow closes). */
  const flush = useCallback(() => {
    if (!pendingRef.current) return;
    clearTimers();
    attemptRef.current = 0;
    void sendRef.current();
  }, []);

  const retry = useCallback(() => {
    if (loadFailed) {
      setLoadAttempt((attempt) => attempt + 1);
      return;
    }
    if (!pendingRef.current) return;
    clearTimers();
    attemptRef.current = 0;
    void sendRef.current();
  }, [loadFailed]);

  /** Clears the stored progress once the work is applied; its revision keeps late saves from reviving it. */
  const clear = useCallback(async () => {
    const currentParams = paramsRef.current;
    clearTimers();
    pendingRef.current = null;
    lastJsonRef.current = null;
    setDraft(null);
    if (!currentParams) return;
    const revision = nextRevision();
    try {
      await api.delete(endpoint, { params: { ...currentParams, revision } });
      savedRevisionRef.current = revision;
    } catch {
      // The work itself is applied; a leftover draft is filtered when it is restored.
    }
    setSaveState("idle");
  }, [endpoint]);

  // Load the stored progress each time the workflow opens.
  useEffect(() => {
    if (!isOpen || !paramsKey) {
      setLoaded(false);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    setLoadFailed(false);
    // Any failure, even a synchronous one, counts as "could not load": the workflow still opens.
    Promise.resolve()
      .then(() => api.get<{ payload: T | null; revision: number }>(endpoint, { params: JSON.parse(paramsKey) }))
      .then((response) => {
        if (!response) throw new Error("No response");
        if (cancelled) return;
        const revision = Number(response.data.revision ?? 0);
        lastRevisionRef.current = Math.max(lastRevisionRef.current, revision);
        savedRevisionRef.current = Math.max(savedRevisionRef.current, revision);
        lastJsonRef.current = response.data.payload ? JSON.stringify(response.data.payload) : null;
        setDraft(response.data.payload ?? null);
        setSaveState(response.data.payload ? "saved" : "idle");
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setDraft(null);
        setLoadFailed(true);
        setSaveState("error");
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [endpoint, isOpen, paramsKey, loadAttempt]);

  // Best-effort save when the tab is hidden, refreshed or closed.
  useEffect(() => {
    const flushOnExit = () => {
      const currentParams = paramsRef.current;
      const pending = pendingRef.current;
      if (!currentParams || !pending || pending.revision <= savedRevisionRef.current) return;
      const token = localStorage.getItem("token") || sessionStorage.getItem("token");
      const base = String(api.defaults.baseURL ?? "/api").replace(/\/$/, "");
      try {
        void fetch(`${base}${endpoint}`, {
          method: "PUT",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ ...currentParams, revision: pending.revision, payload: pending.payload }),
        }).catch(() => undefined);
      } catch {
        // The page is going away; the debounced save may already have landed.
      }
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flushOnExit(); };
    window.addEventListener("pagehide", flushOnExit);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushOnExit);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [endpoint]);

  // Closing the workflow (unmount) sends any unsaved progress instead of dropping it.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    if (pendingRef.current && !retryRef.current) void sendRef.current();
  }, []);

  return { loaded, loadFailed, draft, saveState, save, flush, retry, clear };
}
