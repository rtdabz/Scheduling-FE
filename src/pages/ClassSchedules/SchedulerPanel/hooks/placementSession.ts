import type { DropContext } from "../types";

/**
 * Identity of one placement-modal session.
 *
 * The modal's init effect is keyed on this instead of on `dropContext` plus
 * `schedules`. `refreshSchedules()` runs after every save, relocate, delete and
 * faculty assignment, so keying the effect on `schedules` meant a background
 * refresh landing mid-edit re-derived every modal field and discarded whatever
 * the user had changed (audit finding #6).
 *
 * Two calls describing the same session must produce the same key, and opening a
 * different cell, a different course, or switching between create and edit must
 * produce a different one.
 */
export const buildPlacementSessionKey = (
  dropContext: DropContext | null,
  selectedSectionId: string,
): string | null => {
  if (!dropContext) return null;

  return [
    dropContext.subjectId ?? dropContext.courseId ?? "",
    dropContext.scheduleId ?? "new",
    dropContext.dayIndex,
    dropContext.startSlot,
    dropContext.isRescheduling ? "edit" : "create",
    selectedSectionId,
  ].join(":");
};
