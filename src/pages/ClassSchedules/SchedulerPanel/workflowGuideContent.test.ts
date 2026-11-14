import { afterEach, describe, expect, it } from "vitest";
import { builderGuideSteps, generatorGuideSteps, type GeneratorGuideContext } from "./workflowGuideContent";

afterEach(() => { document.body.innerHTML = ""; });

const builderContext = {
  hasProgram: true, hasSection: true, hasSections: true, canPlot: true,
  manualPlottingOpen: true, canGenerate: true, canAssign: true,
};
const generatorContext: GeneratorGuideContext = {
  stage: 1, runStatus: "idle", hasFailure: false, partial: false,
  hasPreview: false, settingsUnavailable: false, generationBlockedReason: null, saveBlockedReason: null,
};

describe("builder workflow Help", () => {
  it("accepts the selected section and open Manual Plotting panel without toggling either", () => {
    const steps = builderGuideSteps("plotting", builderContext);
    expect(steps.find((step) => step.id === "selected-section")?.action).toBe("complete");
    expect(steps.find((step) => step.id === "open-manual-plotting")?.action).toBe("complete");
    expect(steps.find((step) => step.id === "generator")?.action).toBe("complete");
  });

  it("requires Manual Plotting to become open rather than accepting an arbitrary toggle click", () => {
    document.body.innerHTML = '<button id="schedule-builder-course-bank-toggle" aria-pressed="false"></button>';
    const step = builderGuideSteps("plotting", { ...builderContext, manualPlottingOpen: false })
      .find((candidate) => candidate.id === "open-manual-plotting")!;
    expect(step.action).toBe("click");
    expect(step.isSatisfied?.()).toBe(false);
    document.querySelector("button")!.setAttribute("aria-pressed", "true");
    expect(step.isSatisfied?.()).toBe(true);
  });

  it("distinguishes opening the section picker from selecting and loading a section", () => {
    document.body.innerHTML = '<div id="schedule-builder-section"><button aria-haspopup="listbox" aria-expanded="false"></button></div>';
    const steps = builderGuideSteps("plotting", { ...builderContext, hasSection: false });
    expect(steps.map((step) => step.id)).toEqual(["open-section-picker", "select-section"]);
    const button = document.querySelector("button")!;
    button.setAttribute("aria-expanded", "true");
    expect(steps[0].isSatisfied?.()).toBe(true);
    expect(steps[1].isSatisfied?.()).toBe(false);
    document.querySelector("div")!.setAttribute("data-selected-section-id", "10");
    button.setAttribute("aria-expanded", "false");
    expect(steps[1].isSatisfied?.()).toBe(true);
  });

  it("explains missing prerequisites and never exposes plotting or assignment tasks to viewers", () => {
    const missingProgram = builderGuideSteps("plotting", { ...builderContext, hasProgram: false });
    expect(missingProgram.map((step) => step.id)).toEqual(["no-program"]);
    const noSections = builderGuideSteps("plotting", { ...builderContext, hasSection: false, hasSections: false });
    expect(noSections.map((step) => step.id)).toEqual(["no-sections"]);
    const viewer = builderGuideSteps("plotting", { ...builderContext, canPlot: false, canGenerate: false });
    expect(viewer.some((step) => step.id === "generator" || step.id === "course-bank")).toBe(false);
    const assignment = builderGuideSteps("faculty-assignment", builderContext);
    expect(assignment.every((step) => step.action === "complete")).toBe(true);
  });
});

describe("current-stage generator Help", () => {
  it("keeps all persistence and job operations review-only in every stage", () => {
    for (const stage of [1, 2, 3, 4] as const) {
      const steps = generatorGuideSteps({ ...generatorContext, stage });
      expect(steps.every((step) => step.action === "complete")).toBe(true);
      expect(steps.some((step) => step.waitTimeoutMs !== undefined)).toBe(false);
    }
  });

  it("stays within the current stage instead of replaying Configuration or waiting for future results", () => {
    const setup = generatorGuideSteps({ ...generatorContext, stage: 2 });
    expect(setup.some((step) => step.element === "#generator-setup-head")).toBe(true);
    expect(setup.some((step) => step.element === "#generator-curriculum-select")).toBe(false);
    expect(setup.some((step) => step.element === "#generator-save")).toBe(false);
    const summary = generatorGuideSteps({ ...generatorContext, stage: 4 });
    expect(summary.find((step) => step.id === "summary")?.description).toContain("cancelled or cleared");
    expect(summary.find((step) => step.id === "save")?.description).toContain("No Save click");
  });

  it("explains queued and running jobs and the deliberate cancellation boundary", () => {
    for (const runStatus of ["queued", "running"] as const) {
      const steps = generatorGuideSteps({ ...generatorContext, stage: 3, runStatus });
      expect(steps.map((step) => step.id)).toEqual(["stage-3", "run-status", "cancel-run"]);
      expect(steps.find((step) => step.id === "run-status")?.description).toMatch(/Closing/);
      expect(steps.find((step) => step.id === "cancel-run")?.description).toContain("requests the worker to stop");
    }
  });

  it("explains blocked and failed outcomes without targeting an absent Save control", () => {
    const blocked = generatorGuideSteps({ ...generatorContext, stage: 4, runStatus: "failed", hasFailure: true });
    expect(blocked.map((step) => step.id)).toEqual(["stage-4", "blocked-result"]);
    const failed = generatorGuideSteps({ ...generatorContext, stage: 4, runStatus: "failed" });
    expect(failed.map((step) => step.id)).toEqual(["stage-4", "failed-result"]);
    expect(failed[1].description).toContain("server-cancelled");
  });

  it("shows disabled prerequisites and explains partial and successful save effects", () => {
    const blocked = generatorGuideSteps({ ...generatorContext, stage: 3, generationBlockedReason: "Choose a curriculum." });
    expect(blocked.find((step) => step.id === "generate")?.description).toBe("Choose a curriculum.");
    expect(blocked.find((step) => step.id === "generate")?.element).toBe("#generator-generate");
    const partial = generatorGuideSteps({ ...generatorContext, stage: 4, runStatus: "completed", partial: true, hasPreview: true, saveBlockedReason: "Resolve the conflicting courses." });
    expect(partial.find((step) => step.id === "summary")?.description).toContain("unplaced courses");
    expect(partial.find((step) => step.id === "save")?.description).toBe("Resolve the conflicting courses.");
    const success = generatorGuideSteps({ ...generatorContext, stage: 4, runStatus: "completed", hasPreview: true });
    expect(success.find((step) => step.id === "save")?.description).toContain("instructor assignments");
    const settingsFailure = generatorGuideSteps({ ...generatorContext, settingsUnavailable: true });
    expect(settingsFailure.find((step) => step.id === "settings-unavailable")?.description).toContain("Close and reopen");
  });
});
