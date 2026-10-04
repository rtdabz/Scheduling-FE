import type { DropContext } from "../types";

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
