import { createElement, useEffect, useLayoutEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getStoredUser } from "../lib/storedUser";
import TaskGuideRunner from "../onboarding/TaskGuideRunner";
import type { TaskGuideOutcome, TaskGuideStep, TourAction } from "../onboarding/taskGuide";
import "../styles/onboarding.css";

export interface WorkflowGuideStep {
  element: string;
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left" | "center";
  align?: "start" | "center" | "end";
  id?: string;
  action?: TourAction;
  taskHint?: string;
  navigateTo?: string;
  waitFor?: string;
  waitTimeoutMs?: number;
  skipIfMissing?: boolean;
  validate?: (element: Element) => boolean;
  isSatisfied?: () => boolean;
}

interface UseWorkflowGuideOptions {
  id: string;
  isReady: boolean;
  steps: WorkflowGuideStep[] | (() => WorkflowGuideStep[]);
  mission?: string;
  variant?: string;
}

export function useWorkflowGuide(options: UseWorkflowGuideOptions) {
  const { id } = options;
  const latest = useRef(options);
  const pendingStart = useRef(false);
  const startRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    latest.current = options;
    if (pendingStart.current && options.isReady) {
      pendingStart.current = false;
      startRef.current?.();
    }
  });

  useEffect(() => {
    let root: Root | null = null;
    let host: HTMLElement | null = null;
    let mounted = true;
    let runId = 0;

    const start = () => {
      if (!mounted) return;
      const snapshot = latest.current;
      pendingStart.current = !snapshot.isReady;
      const declaredSteps = typeof snapshot.steps === "function" ? snapshot.steps() : snapshot.steps;
      const steps: TaskGuideStep[] = declaredSteps.map((step, index) => ({
        id: step.id ?? "step-" + (index + 1),
        target: step.element,
        action: step.action ?? "complete",
        title: step.title.replace(/^\s*\d+\s*[.)-]?\s*/, ""),
        text: step.description,
        taskHint: step.taskHint,
        navigateTo: step.navigateTo,
        waitFor: step.waitFor,
        waitTimeoutMs: step.waitTimeoutMs,
        validate: step.validate,
        isSatisfied: step.isSatisfied,
        skipIfMissing: step.skipIfMissing,
        side: step.side,
        align: step.align,
      }));
      if (!host) {
        host = document.createElement("div");
        host.dataset.wicarsGuideRoot = id;
        document.body.appendChild(host);
        root = createRoot(host);
      }
      const user = getStoredUser();
      const userKey = user?.id ?? user?.email;
      const variant = snapshot.variant ?? "default";
      const currentRun = ++runId;
      root!.render(createElement(TaskGuideRunner, {
        key: currentRun,
        tourId: "workflow:" + id,
        mission: snapshot.mission ?? "Workflow guide",
        steps,
        unavailableReason: snapshot.isReady ? undefined : "This page is still loading. Your guide will open when it is ready. You can retry or exit help.",
        onRestart: start,
        onFinish: (outcome: TaskGuideOutcome) => {
          if (!mounted || currentRun !== runId) return;
          pendingStart.current = false;
          const currentUser = getStoredUser();
          if (outcome !== "aborted" && userKey != null && (currentUser?.id ?? currentUser?.email) === userKey) {
            try {
              localStorage.setItem("wicars_workflow_guide_v4_" + id + "_" + userKey + "_" + variant, JSON.stringify({
                version: 4, variant, outcome, updatedAt: new Date().toISOString(),
              }));
            } catch {
              // Help remains usable when browser storage is unavailable.
            }
          }
          root?.render(null);
        },
      }));
    };

    const eventName = "restart-workflow-guide:" + id;
    startRef.current = start;
    window.addEventListener(eventName, start);
    return () => {
      mounted = false;
      pendingStart.current = false;
      startRef.current = null;
      runId += 1;
      window.removeEventListener(eventName, start);
      const activeRoot = root;
      const activeHost = host;
      queueMicrotask(() => {
        activeRoot?.unmount();
        activeHost?.remove();
      });
    };
  }, [id]);
}
