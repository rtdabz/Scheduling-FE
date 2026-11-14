import type { WorkflowGuideStep } from "../../../hooks/useWorkflowGuide";
import type { GenerationRunStatus } from "./hooks/useGenerationRun";

type BuilderGuideMode = "plotting" | "faculty-assignment" | "review";

interface BuilderGuideContext {
  hasProgram: boolean;
  hasSection: boolean;
  hasSections: boolean;
  canPlot: boolean;
  manualPlottingOpen: boolean;
  canGenerate: boolean;
  canAssign: boolean;
}

const sectionPicker = '#schedule-builder-section button[aria-haspopup="listbox"]';
const sectionSelected = () => Boolean(document.querySelector("#schedule-builder-section")?.getAttribute("data-selected-section-id"))
  && document.querySelector(sectionPicker)?.getAttribute("aria-expanded") === "false";

export function builderGuideSteps(mode: BuilderGuideMode, context: BuilderGuideContext): WorkflowGuideStep[] {
  if (!context.hasProgram) return [{
    id: "no-program", element: "#schedule-builder-unavailable", action: "complete",
    title: "An active program is needed", description: "This department has no active program. Add or request a program for the department, then return here to create sections and schedules. Help does not create one.",
  }];
  if (!context.hasSection) {
    if (!context.hasSections) return [{
      id: "no-sections", element: sectionPicker, action: "complete",
      title: "A section is needed", description: "No section is available in this view. Create or request an active section for your program, then return and open Help again.",
    }];
    return [
      {
        id: "open-section-picker", element: sectionPicker, action: "click",
        title: "Open the section picker", description: "Choose which section's timetable you want to view. Opening the picker does not select a section.",
        taskHint: "Open the section picker to continue.",
        isSatisfied: () => document.querySelector(sectionPicker)?.getAttribute("aria-expanded") === "true",
      },
      {
        id: "select-section", element: '#schedule-builder-section [role="listbox"]', action: "click",
        title: "Choose a section", description: "Select a section from this list. Its status determines the available scheduling actions. After selecting it, finish this guide and open Help again for that section's workflow.",
        taskHint: "Choose a section from the list.", isSatisfied: sectionSelected,
      },
    ];
  }

  const steps: WorkflowGuideStep[] = [
    { id: "selected-section", element: sectionPicker, action: "complete", title: "Check the selected section", description: "This section's timetable is already loaded. You can keep it selected. To change sections, finish or exit Help first, choose another section, then open Help again.", side: "bottom", align: "start" },
    { id: "workflow", element: "#schedule-builder-workflow", action: "complete", title: "Check the workflow status", description: "The current status controls which plotting, approval, and instructor actions are available. Help reviews those actions without submitting or changing the schedule." },
  ];
  if (mode === "plotting") {
    if (context.canGenerate) steps.push({
      id: "generator", element: "#schedule-builder-generate button", action: "complete", title: "Open the generator when ready",
      description: "Generate opens a separate year-level workflow. Finish or exit this guide before opening it, then use the generator's compass Help for its current stage. This guide does not resume automatically when you close the generator.",
    });
    if (context.canPlot) steps.push(
      {
        id: "open-manual-plotting", element: "#schedule-builder-course-bank-toggle", action: context.manualPlottingOpen ? "complete" : "click",
        title: context.manualPlottingOpen ? "Manual Plotting is open" : "Open Manual Plotting",
        description: context.manualPlottingOpen ? "The course panel is already open. Leave it open to review the available courses next." : "Open the course panel to see courses for the selected section. This changes only the panel visibility.",
        taskHint: "Open Manual Plotting to continue.",
        isSatisfied: context.manualPlottingOpen ? undefined : () => document.querySelector("#schedule-builder-course-bank-toggle")?.getAttribute("aria-pressed") === "true",
      },
      { id: "course-bank", element: "#schedule-builder-course-bank", action: "complete", title: "Review the courses to place", description: "After Help, select a course and an empty time, or drag the course onto the timetable. Review the placement dialog before saving; saving changes the real schedule.", side: "right" },
    );
  }
  if (mode === "faculty-assignment" && context.canAssign) steps.push({
    id: "assign-instructors", element: "#schedule-builder-auto-assign", action: "complete", title: "Review instructor assignment",
    description: "Assign opens the instructor suggestions workflow. Finish or exit Help first, review the suggestions, and deliberately apply assignments when ready. Help does not open that workflow or save instructor choices.",
  });
  steps.push(
    { id: "timetable", element: "#schedule-builder-timetable", action: "complete", title: "Review the timetable", description: context.canPlot ? "Check each class's time, room, and conflicts. Make schedule changes through the normal controls after Help." : "Review classes, rooms, instructors, and conflicts. Locked or submitted schedules remain protected by the existing workflow.", side: "top" },
    { id: "next-action", element: "#schedule-builder-next-step", action: "complete", title: "Check the next available action", description: "Read the status and prerequisites here. Submit, approve, recall, finalize, and other schedule actions require your normal deliberate action; finishing Help does not perform them." },
  );
  return steps;
}

export interface GeneratorGuideContext {
  stage: 1 | 2 | 3 | 4;
  runStatus: GenerationRunStatus;
  hasFailure: boolean;
  partial: boolean;
  hasPreview: boolean;
  settingsUnavailable: boolean;
  generationBlockedReason: string | null;
  saveBlockedReason: string | null;
}

export function generatorGuideSteps(context: GeneratorGuideContext): WorkflowGuideStep[] {
  const { stage, runStatus, hasFailure, partial, hasPreview, settingsUnavailable, generationBlockedReason, saveBlockedReason } = context;
  const steps: WorkflowGuideStep[] = [{
    id: `stage-${stage}`, element: "#generator-progress", action: "complete", title: "Help for this generator stage",
    description: "This guide explains the stage currently open and preserves your draft. Continue, Generate, Save, and settings changes stay under your control. Timetable drafts are written only by Save; applying a curriculum or changing department settings can save separately.",
  }];
  const review = (id: string, element: string, title: string, description: string, skipIfMissing = false) => {
    steps.push({ id, element, title, description, action: "complete", skipIfMissing });
  };
  if (settingsUnavailable) review("settings-unavailable", "#generator-progress", "Scheduling rules are unavailable", "Department scheduling rules could not be loaded. Close and reopen the generator to retry before changing rules or generating a timetable. Help can still explain this view without changing your draft.");
  if (runStatus === "queued" || runStatus === "running") {
    review("run-status", "#generator-workspace", runStatus === "queued" ? "Waiting for the scheduling queue" : "Generation is running",
      runStatus === "queued" ? "The job is queued on the server and may wait before work begins. Closing this window keeps the job available through the generation status panel. No timetable has been saved." : "The server is placing classes and checking constraints. Closing this window does not stop the job. When it finishes, open the result to review the timetable; generation alone does not save it.");
    review("cancel-run", "#generator-cancel", "Cancel only when you intend to stop", "Cancel clears the active run from this view and requests the worker to stop at its next checkpoint. It does not save a timetable. This guide never cancels or launches a job.");
    return steps;
  }
  if (hasFailure) {
    review("blocked-result", "#generator-workspace", "Review why generation was blocked", "No saveable timetable was produced. Review the blocking constraints and recommended adjustments. Review Constraints returns to configuration; applying an adjustment or retrying can change settings or launch another job, so use those controls deliberately after Help.");
    return steps;
  }
  if (runStatus === "failed") {
    review("failed-result", "#generator-workspace", "Review the unsuccessful run", "Read the reported error before trying again. A failed or server-cancelled run has no saveable timetable. If you cancelled from this view, the run is cleared instead. Return to Configuration with the normal Back control, review prerequisites, then generate again when ready.");
    return steps;
  }
  if (stage === 1) {
    review("year-level", "#generator-year-level", "Check the year level", "The year level determines the section and course scope. A locked year level may require Selected sections for an eligible new section.");
    review("section-scope", "#generator-section-target", "Check which sections will be replaced", "Whole year level targets all its sections. Selected sections targets only the checked sections; other sections keep their classes. The replacement happens when you save a generated timetable.", true);
    review("curriculum", "#generator-curriculum-select", "Review the curriculum", "Every section in the year level needs a compatible curriculum. Applying a curriculum writes that assignment to the sections immediately, separately from saving a timetable. You do not need to apply or change it to finish Help.", true);
    review("preferred-days", "#generator-preferred-days", "Review days and department settings", "Preferred Days constrain this wizard's generation. The Split Days switch below them lets split courses also pair Friday with Saturday; it is kept in this browser. Sunday classes is a department setting saved when changed and may require Secretary, Director, or Program Head permission. Help does not toggle either switch or change any day.");
    review("continue-setup", "#generator-continue", "Continue when configuration is ready", generationBlockedReason ?? "Continue opens Setup Courses without launching generation. Finish Help first, then continue when ready. After a cancelled run, review these choices before starting another job.");
  } else if (stage === 2) {
    review("setup-courses", "#generator-setup-head", "Review included courses and their options", "Check the included courses and their delivery configuration. Configure exposes per-course options. Required Day, Consecutive Days, and field-course eligibility can save department settings immediately; Help never requires a change.");
    review("continue-review", "#generator-continue", "Continue to review when ready", generationBlockedReason ?? "Continue opens Review & Generate. It does not launch a job or save a timetable. Finish this stage's Help, then use Continue and reopen Help for the review stage.");
  } else if (stage === 3) {
    review("review-selections", "#generator-step-panel", "Review the scope and rules", "Check the selected sections, course plan, and rules. Course options and department settings may already be stored; a generated timetable has not been saved.");
    review("generate", "#generator-generate", generationBlockedReason ? "Resolve the generation prerequisite" : "Generate only when you are ready", generationBlockedReason ?? "Generate queues a server job. A queued or running job can continue after you close the window. Finish Help before choosing Generate; this guide never launches the job.");
  } else {
    review("summary", "#generator-workspace", hasPreview ? partial ? "Review the partial timetable" : "Review the generated timetable" : "No timetable is available to save",
      hasPreview ? partial ? "Some courses could not be placed. Review unplaced courses, conflicts, and recommended fixes. Saving an incomplete timetable may require confirmation; unplaced courses remain unscheduled and their existing classes in the replacement scope can be removed." : "Generation produced a preview. Check its classes, times, rooms, and any changes before saving. This result is not yet the working timetable." : "A cancelled or cleared run has no timetable preview. Use Back to review configuration or generate again through the normal controls. Help finishes here without waiting for a future result.");
    review("save", "#generator-save", "Review what Save will change", saveBlockedReason ?? (hasPreview ? "Save & View Timetable writes draft schedules and replaces the affected working classes in the selected scope. Existing instructor assignments on replaced classes can be removed; normal confirmations still apply. Finish Help before saving." : "Save is unavailable until there is a generated timetable. No Save click or generation run is required to finish Help."));
  }
  return steps;
}
