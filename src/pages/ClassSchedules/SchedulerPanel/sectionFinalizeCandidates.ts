import type { DepartmentSectionProgress, ScheduleItem, SectionDoneCandidate } from "./types";

/** Section statuses the Finalize action applies to: instructors are being assigned. */
export const SECTION_FINALIZE_ELIGIBLE_STATUSES: ScheduleItem["status"][] = [
  "approved",
  "faculty_assignment",
  "reassignment",
];

/** An on-site laboratory meeting still waiting for a room -- the server refuses to finalize it. */
const labRoomMissing = (schedule: ScheduleItem): boolean =>
  schedule.mode === "on-site"
  && !schedule.roomId
  && (schedule.meetingType === "laboratory" || Number(schedule.laboratoryUnits ?? 0) > 0);

/**
 * Builds the checklist behind the bulk Finalize modal: every section of the
 * department still in instructor assignment, the rows that would move to
 * "finalized", and why a section cannot be finalized yet.
 *
 * Mirrors the rules POST batch-status enforces for "finalized", so the modal
 * never offers a section the server would refuse:
 *
 * - the whole section is finalized together, so every one of its rows is sent;
 * - every meeting has an instructor;
 * - no on-site laboratory meeting is still Room TBA.
 *
 * The `requiredSubjects`/`plottedSubjects` pair reads here as classes and
 * classes that have an instructor for every meeting.
 */
export function buildSectionFinalizeCandidates(
  departmentSectionProgress: DepartmentSectionProgress[],
  schedules: ScheduleItem[]
): SectionDoneCandidate[] {
  const rowsBySection = new Map<string, ScheduleItem[]>();
  schedules.forEach((schedule) => {
    const rows = rowsBySection.get(schedule.sectionId) ?? [];
    rows.push(schedule);
    rowsBySection.set(schedule.sectionId, rows);
  });

  return departmentSectionProgress
    .filter((section) => SECTION_FINALIZE_ELIGIBLE_STATUSES.includes(section.status))
    .map((section) => {
      const rows = rowsBySection.get(section.sectionId) ?? [];
      const classes = new Map<string, ScheduleItem[]>();
      rows.forEach((row) => {
        const key = row.courseId || row.courseCode;
        classes.set(key, [...(classes.get(key) ?? []), row]);
      });
      const staffedClasses = [...classes.values()].filter((meetings) => meetings.every((meeting) => Boolean(meeting.facultyId))).length;
      const missingInstructors = rows.filter((row) => !row.facultyId).length;
      const missingLabRooms = rows.filter(labRoomMissing).length;
      const isReady = rows.length > 0 && missingInstructors === 0 && missingLabRooms === 0;

      return {
        sectionId: section.sectionId,
        sectionName: section.sectionName,
        yearLevel: section.yearLevel,
        requiredSubjects: classes.size,
        plottedSubjects: staffedClasses,
        scheduleIds: rows.map((row) => Number(row.id)),
        isReady,
        blockedReason: isReady
          ? ""
          : rows.length === 0
            ? "no classes scheduled"
            : missingInstructors > 0
              ? `${missingInstructors} meeting${missingInstructors === 1 ? " still needs" : "s still need"} an instructor`
              : `${missingLabRooms} laboratory meeting${missingLabRooms === 1 ? "" : "s"} still Room TBA`,
      };
    });
}

/**
 * Builds the checklist behind the bulk Reassignment modal: every finalized
 * section, with the rows that would reopen for instructor reassignment.
 *
 * The server only moves finalized rows to "reassignment", so each candidate
 * carries its finalized rows. There is nothing to be blocked on -- a finalized
 * section can always be reopened -- which is why the modal pre-checks only the
 * open section rather than every one.
 */
export function buildSectionReassignCandidates(
  departmentSectionProgress: DepartmentSectionProgress[],
  schedules: ScheduleItem[]
): SectionDoneCandidate[] {
  return departmentSectionProgress
    .filter((section) => section.status === "finalized")
    .map((section) => {
      const rows = schedules.filter((schedule) => schedule.sectionId === section.sectionId && schedule.status === "finalized");
      const classes = new Set(rows.map((row) => row.courseId || row.courseCode)).size;

      return {
        sectionId: section.sectionId,
        sectionName: section.sectionName,
        yearLevel: section.yearLevel,
        requiredSubjects: classes,
        plottedSubjects: classes,
        scheduleIds: rows.map((row) => Number(row.id)),
        isReady: rows.length > 0,
        blockedReason: rows.length > 0 ? "" : "no finalized classes",
      };
    });
}
