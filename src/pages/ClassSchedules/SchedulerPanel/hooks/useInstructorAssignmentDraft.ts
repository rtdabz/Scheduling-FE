import { useMemo } from "react";
import { useServerDraft } from "./useServerDraft";

export type { DraftSaveState } from "./useServerDraft";

export interface DraftAssignment {
  key: string;
  faculty_id: string;
  schedule_ids: number[];
}

export interface InstructorAssignmentDraftPayload {
  step: number;
  faculty_id: string | null;
  year_level: string | null;
  course_id: string | null;
  assignments: DraftAssignment[];
}

export interface DraftScope {
  semesterId: number;
  departmentId: number;
  /**
   * Which list this is: Schedule Management's ("schedule", the default) or a Cross-Department
   * Assignments list for one offering department ("cross_department:{id}"). Separate lists
   * keep restoring one from dropping the classes queued in another.
   */
  context?: "schedule" | `cross_department:${number}`;
}

/** Auto-saved Assign Instructors list; the server scopes it to the user's own department. */
export function useInstructorAssignmentDraft(scope: DraftScope | null, isOpen: boolean) {
  const semesterId = scope?.semesterId ?? null;
  const context = scope?.context ?? null;
  const params = useMemo((): Record<string, number | string> | null => {
    if (semesterId === null) return null;
    return context === null ? { semester_id: semesterId } : { semester_id: semesterId, context };
  }, [semesterId, context]);

  return useServerDraft<InstructorAssignmentDraftPayload>("/instructor-assignment-draft", params, isOpen);
}
