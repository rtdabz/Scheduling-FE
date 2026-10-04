const DEBUG_KEY = "wicars_tour_debug";
const LONG_FRAME_MS = 50;

interface StepTiming {
  step: string;
  target: string;
  waitMs: number;
  coversTargetPct: number | null;
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
  session?.stopFrames();
  const longFrames: number[] = [];
  session = {
    tourId,
    startedAt: performance.now(),
    steps: [],
    longFrames,
    stopFrames: watchFrames(longFrames),
  };
  console.info("[tour] %s started — diagnostics on", tourId);
};

const measureCoverage = (target: Element): number | null => {
  const tooltip = document.querySelector(".react-joyride__tooltip");
  if (!(tooltip instanceof HTMLElement)) return null;
  const a = target.getBoundingClientRect();
  const b = tooltip.getBoundingClientRect();
  const area = a.width * a.height;
  if (area <= 0) return null;
  const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return Math.round(((overlapX * overlapY) / area) * 100);
};

export const recordTourStep = (step: string, targetSelector: string, waitMs: number): void => {
  if (!session) return;
  const timing: StepTiming = {
    step,
    target: targetSelector,
    waitMs: Math.round(waitMs),
    coversTargetPct: null,
  };
  session.steps.push(timing);
  requestAnimationFrame(() => {
    const element = document.querySelector(targetSelector);
    if (element) timing.coversTargetPct = measureCoverage(element);
    if (timing.waitMs > 1000) {
      console.warn("[tour] step %s waited %dms for %s", step, timing.waitMs, targetSelector);
    }
    if ((timing.coversTargetPct ?? 0) > 50) {
      console.warn(
        "[tour] step %s tooltip covers %d%% of %s",
        step, timing.coversTargetPct, targetSelector,
      );
    }
  });
};

export const endTourDiagnostics = (outcome: string): void => {
  if (!session) return;
  const { tourId, startedAt, steps, longFrames, stopFrames } = session;
  session = null;
  stopFrames();
  const elapsed = Math.round(performance.now() - startedAt);
  const worst = longFrames.length ? Math.max(...longFrames) : 0;
  const total = longFrames.reduce((sum, frame) => sum + frame, 0);
  console.info(
    "[tour] %s ended (%s) after %dms — %d long frames, worst %dms, %dms stalled in total",
    tourId, outcome, elapsed, longFrames.length, worst, total,
  );
  console.table(steps);
};
