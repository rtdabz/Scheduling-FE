import { queryVisible } from "./taskGuide";

const DEBUG_KEY = "wicars_tour_debug";
const LONG_FRAME_MS = 50;

interface StepTiming {
  step: string;
  target: string;
  waitMs: number;
  coversTargetPct: number | null;
  resolvedTarget: string | null;
  targetRect: { x: number; y: number; width: number; height: number } | null;
  tooltipRect: { x: number; y: number; width: number; height: number } | null;
}

let enabled: boolean | null = null;

export const tourDebugEnabled = (): boolean => {
  if (enabled !== null) return enabled;
  enabled = false;
  try {
    if (localStorage.getItem(DEBUG_KEY) === "1") enabled = true;
    else if (new URLSearchParams(window.location.search).get("tourDebug") === "1") enabled = true;
  } catch {
  }
  return enabled;
};

interface Session {
  tourId: string;
  startedAt: number;
  steps: StepTiming[];
  longFrames: number[];
  stopFrames: () => void;
  measurements: Set<number>;
}

let session: Session | null = null;

const watchFrames = (sink: number[]): (() => void) => {
  let raf = 0;
  let previous = performance.now();
  const tick = (now: number) => {
    const delta = now - previous;
    previous = now;
    if (delta > LONG_FRAME_MS) sink.push(Math.round(delta));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
};

export const beginTourDiagnostics = (tourId: string): void => {
  if (!tourDebugEnabled()) return;
  if (session) endTourDiagnostics("replaced");
  const longFrames: number[] = [];
  session = {
    tourId,
    startedAt: performance.now(),
    steps: [],
    longFrames,
    stopFrames: watchFrames(longFrames),
    measurements: new Set(),
  };
  console.info("[tour] %s started — diagnostics on", tourId);
};

const measureCoverage = (target: Element, timing: StepTiming): void => {
  const tooltip = document.querySelector("[data-wicars-task-tooltip]");
  if (!(tooltip instanceof HTMLElement)) return;
  const a = target.getBoundingClientRect();
  const b = tooltip.getBoundingClientRect();
  const area = a.width * a.height;
  if (area <= 0 || b.width <= 0 || b.height <= 0) return;
  timing.targetRect = { x: a.x, y: a.y, width: a.width, height: a.height };
  timing.tooltipRect = { x: b.x, y: b.y, width: b.width, height: b.height };
  const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  timing.coversTargetPct = Math.round(((overlapX * overlapY) / area) * 100);
};

export const recordTourStep = (step: string, targetSelector: string, waitMs: number, resolvedTarget?: HTMLElement): void => {
  if (!session) return;
  const active = session;
  const timing: StepTiming = {
    step,
    target: targetSelector,
    waitMs: Math.round(waitMs),
    coversTargetPct: null,
    resolvedTarget: null,
    targetRect: null,
    tooltipRect: null,
  };
  active.steps.push(timing);
  const afterFrame = (callback: () => void) => {
    const id = requestAnimationFrame(() => {
      active.measurements.delete(id);
      if (session === active) callback();
    });
    active.measurements.add(id);
  };
  afterFrame(() => afterFrame(() => {
    const element = resolvedTarget ? (resolvedTarget.isConnected ? resolvedTarget : null) : queryVisible(targetSelector);
    if (element) {
      timing.resolvedTarget = element.tagName.toLowerCase();
      measureCoverage(element, timing);
    }
    if (timing.waitMs > 1000) {
      console.warn("[tour] step %s waited %dms for %s", step, timing.waitMs, targetSelector);
    }
    if ((timing.coversTargetPct ?? 0) > 50) {
      console.warn(
        "[tour] step %s tooltip covers %d%% of %s",
        step, timing.coversTargetPct, targetSelector,
      );
    }
    if (timing.coversTargetPct === null) console.warn("[tour] step %s placement measurement unavailable", step);
  }));
};

export const endTourDiagnostics = (outcome: string, tourId?: string): void => {
  if (!session || (tourId !== undefined && session.tourId !== tourId)) return;
  const { tourId: owner, startedAt, steps, longFrames, stopFrames, measurements } = session;
  session = null;
  stopFrames();
  measurements.forEach((id) => cancelAnimationFrame(id));
  const elapsed = Math.round(performance.now() - startedAt);
  const worst = longFrames.length ? Math.max(...longFrames) : 0;
  const total = longFrames.reduce((sum, frame) => sum + frame, 0);
  console.info(
    "[tour] %s ended (%s) after %dms — %d long frames, worst %dms, %dms stalled in total",
    owner, outcome, elapsed, longFrames.length, worst, total,
  );
  console.table(steps);
};
