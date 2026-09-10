import { describe, expect, it } from "vitest";
import { buildSectionDoneCandidates } from "./sectionDoneCandidates";
import type { DepartmentSectionProgress, ScheduleItem } from "./types";

const progress = (
  overrides: Partial<DepartmentSectionProgress> & Pick<DepartmentSectionProgress, "sectionId">
): DepartmentSectionProgress => ({
  sectionName: `Section ${overrides.sectionId}`,
  yearLevel: 1,
  requiredCourses: 2,
  requiredSubjects: 2,
  plottedCourses: 2,
  plottedSubjects: 2,
  status: "draft",
  isDone: false,
  isSelected: false,
  assignedInstructorBlocks: 0,
  facultyAssignmentDone: false,
  ...overrides,
});

const scheduleRow = (id: number, sectionId: string, status: ScheduleItem["status"] = "draft"): ScheduleItem =>
  ({ id: String(id), sectionId, status }) as ScheduleItem;

describe("buildSectionDoneCandidates", () => {
  it("marks a fully plotted section ready and lists the rows that will be locked", () => {
    const [candidate] = buildSectionDoneCandidates(
      [progress({ sectionId: "a" })],
      [scheduleRow(1, "a"), scheduleRow(2, "a")]
    );

    expect(candidate.isReady).toBe(true);
    expect(candidate.scheduleIds).toEqual([1, 2]);
    expect(candidate.blockedReason).toBe("");
  });

  it("blocks a section that still has unplaced courses", () => {
    const [candidate] = buildSectionDoneCandidates(
      [progress({ sectionId: "a", requiredSubjects: 4, plottedSubjects: 3 })],
      [scheduleRow(1, "a")]
    );

    expect(candidate.isReady).toBe(false);
    expect(candidate.blockedReason).toBe("1 course still unplaced");
  });

  it("blocks a section with no schedule rows at all", () => {
    const [candidate] = buildSectionDoneCandidates(
      [progress({ sectionId: "a", plottedSubjects: 0, plottedCourses: 0 })],
      []
    );

    expect(candidate.isReady).toBe(false);
    expect(candidate.blockedReason).toBe("nothing plotted yet");
  });

  it("keeps sections that are already done or under approval out of the checklist", () => {
    const candidates = buildSectionDoneCandidates(
      [
        progress({ sectionId: "a", status: "completed" }),
        progress({ sectionId: "b", status: "submitted" }),
        progress({ sectionId: "c", status: "finalized" }),
        progress({ sectionId: "d", status: "revision" }),
      ],
      [scheduleRow(1, "d", "revision")]
    );

    expect(candidates.map((candidate) => candidate.sectionId)).toEqual(["d"]);
    expect(candidates[0].isReady).toBe(true);
  });

  it("never offers rows from another section or from a locked status", () => {
    const [candidate] = buildSectionDoneCandidates(
      [progress({ sectionId: "a" })],
      [scheduleRow(1, "a"), scheduleRow(2, "b"), scheduleRow(3, "a", "submitted")]
    );

    expect(candidate.scheduleIds).toEqual([1]);
  });

  it("treats a section with no required courses as ready once something is plotted", () => {
    const [candidate] = buildSectionDoneCandidates(
      [progress({ sectionId: "a", requiredSubjects: 0, requiredCourses: 0, plottedSubjects: 1 })],
      [scheduleRow(1, "a")]
    );

    expect(candidate.isReady).toBe(true);
  });
});
