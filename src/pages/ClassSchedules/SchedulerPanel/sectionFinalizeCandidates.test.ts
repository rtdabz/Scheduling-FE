import { describe, expect, it } from "vitest";
import { buildSectionFinalizeCandidates, buildSectionReassignCandidates } from "./sectionFinalizeCandidates";
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
  status: "faculty_assignment",
  isDone: false,
  isSelected: false,
  assignedInstructorBlocks: 0,
  facultyAssignmentDone: false,
  ...overrides,
});

const row = (id: number, sectionId: string, overrides: Partial<ScheduleItem> = {}): ScheduleItem =>
  ({
    id: String(id),
    sectionId,
    courseId: `c${id}`,
    courseCode: `IT ${id}`,
    status: "faculty_assignment",
    facultyId: "f1",
    mode: "on-site",
    roomId: "r1",
    laboratoryUnits: 0,
    meetingType: null,
    ...overrides,
  }) as ScheduleItem;

describe("buildSectionFinalizeCandidates", () => {
  it("offers a section whose every meeting has an instructor, with all of its rows", () => {
    const [candidate] = buildSectionFinalizeCandidates(
      [progress({ sectionId: "a" })],
      [row(1, "a"), row(2, "a", { courseId: "c1" }), row(3, "b")]
    );

    expect(candidate.isReady).toBe(true);
    expect(candidate.scheduleIds).toEqual([1, 2]);
    // Two meetings of one course are one class.
    expect(candidate.requiredSubjects).toBe(1);
    expect(candidate.plottedSubjects).toBe(1);
  });

  it("blocks a section with a meeting that has no instructor", () => {
    const [candidate] = buildSectionFinalizeCandidates(
      [progress({ sectionId: "a" })],
      [row(1, "a"), row(2, "a", { facultyId: null })]
    );

    expect(candidate.isReady).toBe(false);
    expect(candidate.plottedSubjects).toBe(1);
    expect(candidate.blockedReason).toBe("1 meeting still needs an instructor");
  });

  it("blocks a section with an on-site laboratory meeting still Room TBA", () => {
    const [candidate] = buildSectionFinalizeCandidates(
      [progress({ sectionId: "a" })],
      [row(1, "a", { roomId: "", laboratoryUnits: 1 })]
    );

    expect(candidate.isReady).toBe(false);
    expect(candidate.blockedReason).toBe("1 laboratory meeting still Room TBA");
  });

  it("does not count an online laboratory meeting without a room", () => {
    const [candidate] = buildSectionFinalizeCandidates(
      [progress({ sectionId: "a" })],
      [row(1, "a", { roomId: "", mode: "online", meetingType: "laboratory" })]
    );

    expect(candidate.isReady).toBe(true);
  });

  it("only lists sections in instructor assignment, including reassignment", () => {
    const candidates = buildSectionFinalizeCandidates(
      [
        progress({ sectionId: "a", status: "faculty_assignment" }),
        progress({ sectionId: "b", status: "reassignment" }),
        progress({ sectionId: "c", status: "finalized" }),
        progress({ sectionId: "d", status: "draft" }),
      ],
      [row(1, "a"), row(2, "b"), row(3, "c"), row(4, "d")]
    );

    expect(candidates.map((candidate) => candidate.sectionId)).toEqual(["a", "b"]);
  });
});

describe("buildSectionReassignCandidates", () => {
  it("lists only finalized sections, with their finalized rows", () => {
    const candidates = buildSectionReassignCandidates(
      [
        progress({ sectionId: "a", status: "finalized" }),
        progress({ sectionId: "b", status: "faculty_assignment" }),
      ],
      [
        row(1, "a", { status: "finalized" }),
        row(2, "a", { status: "finalized", courseId: "c1" }),
        row(3, "b"),
      ]
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].sectionId).toBe("a");
    expect(candidates[0].scheduleIds).toEqual([1, 2]);
    expect(candidates[0].requiredSubjects).toBe(1);
    expect(candidates[0].isReady).toBe(true);
  });
});
