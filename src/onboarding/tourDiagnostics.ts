/**
 * Opt-in instrumentation for guided tours.
 *
 * Answers two questions you cannot settle by watching the screen:
 *
 * 1. "Is the tooltip covering the thing it is describing?" — measured as the
 *    share of the spotlighted target the tooltip's own box sits on top of.
 * 2. "Is the tour what is making this feel slow?" — measured as long frames
 *    (>50ms, i.e. three dropped frames at 60Hz) counted only while a tour is
 *    running, plus how long each step waited for its target.
 *
 * Enable with either of:
 *   localStorage.setItem("wicars_tour_debug", "1")   // sticky
 *   ?tourDebug=1                                     // one page load
 *
 * Disabled is the default and costs one boolean check per call, so this stays
 * in the production bundle without measurable weight.
 */

const DEBUG_KEY = "wicars_tour_debug";
/** Three dropped frames at 60Hz: the threshold where jank becomes visible. */
const LONG_FRAME_MS = 50;

interface StepTiming {
  step: string;
  target: string;
  /** Milliseconds spent waiting for the target to become reachable. */
  waitMs: number;
  /** Share of the target's box the tooltip covers, as a percentage. */
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
    // Storage can throw in privacy modes; diagnostics simply stay off.
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

/**
 * Count only frames rendered while a tour is open. Comparing this run against
 * one with the tour closed is what separates "the tour is slow" from "this
 * screen is slow" — the same page, the same actions, one number.
 */
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

/**
 * How much of `target` the tooltip's box sits on top of. Joyride keeps the
 * target clickable, so overlap is not a functional break, but a tooltip
 * covering most of what a step is pointing at makes the step unreadable.
 */
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
  // The tooltip is not mounted yet on this tick; read it once it has painted.
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
