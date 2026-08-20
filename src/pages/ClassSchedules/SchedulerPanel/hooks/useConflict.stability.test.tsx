import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useConflict } from "./useConflict";
import type { Department, Faculty, Room, ScheduleItem, Section, Subject } from "../types";

/**
 * Guards the fix for audit finding #11.
 *
 * GridCell (168 instances) and ScheduleCard are wrapped in React.memo, but the
 * conflict callbacks reaching them were plain arrow functions, so every parent
 * render produced new identities and memo never skipped anything. A pointer
 * moving across the grid updates `hoveredCell` once per cell, so the whole grid
 * was re-rendering on every step of a drag.
 *
 * Referential stability is the property memo depends on, so that is what is
 * asserted here — both directions: stable when inputs are unchanged, and
 * *rebuilt* when inputs change, which catches dependency lists that are too
 * narrow and would serve stale data.
 */

const rooms: Room[] = [
  { id: "1", name: "LEC1", departmentId: 2, roomType: "lecture", status: "available" },
];
const sections: Section[] = [
  { id: "10", name: "BSIT-1A", yearLevel: 1, semester: "1st", departmentId: 2, termId: 7, status: "active" },
];
const departments: Department[] = [
  { id: 2, department_name: "Info Tech", department_code: "IT" },
];
const subjects: Subject[] = [
  {
    id: "11", code: "IT101", name: "Intro", units: 3, lectureHours: 3, labHours: 0,
    category: "major", semester: "1st", departmentId: 2, categories: [],
    yearLevel: 1, roomTypeRequired: "lecture", status: "active",
  },
];
const faculties: Faculty[] = [
  { id: "5", name: "Ada Reyes", employmentType: "full-time", departmentId: 2, status: "active" },
];
const schedules: ScheduleItem[] = [];

const baseParams = {
  schedules,
  selectedSectionId: "10",
  dragSubjectId: null as string | null,
  draggedScheduleId: null as string | null,
  rooms,
  sections,
  departments,
  subjects,
  faculties,
  fieldCourseAssignmentEnabled: false,
  fieldCourseCodes: [] as string[],
};

describe("useConflict callback stability", () => {
  it("keeps callback identities across a re-render with unchanged inputs", () => {
    const { result, rerender } = renderHook((props) => useConflict(props), {
      initialProps: baseParams,
    });

    const first = {
      checkConflict: result.current.checkConflict,
      checkFacultyConflict: result.current.checkFacultyConflict,
      getDragOverConflict: result.current.getDragOverConflict,
      conflictedMap: result.current.conflictedMap,
    };

    rerender(baseParams);

    expect(result.current.checkConflict).toBe(first.checkConflict);
    expect(result.current.checkFacultyConflict).toBe(first.checkFacultyConflict);
    expect(result.current.getDragOverConflict).toBe(first.getDragOverConflict);
    expect(result.current.conflictedMap).toBe(first.conflictedMap);
  });

  it("keeps identities stable when only the hovered cell would have changed", () => {
    // hoveredCell is not an input to useConflict at all — this asserts that a
    // parent re-render driven by it cannot invalidate the callbacks.
    const { result, rerender } = renderHook((props) => useConflict(props), {
      initialProps: baseParams,
    });

    const before = result.current.getDragOverConflict;
    rerender({ ...baseParams });
    rerender({ ...baseParams });

    expect(result.current.getDragOverConflict).toBe(before);
  });

  it("rebuilds checkConflict when the schedules it reads change", () => {
    const { result, rerender } = renderHook((props) => useConflict(props), {
      initialProps: baseParams,
    });

    const before = result.current.checkConflict;
    rerender({ ...baseParams, schedules: [...schedules] });

    expect(result.current.checkConflict).not.toBe(before);
  });

  it.each([
    ["rooms", { rooms: [...rooms] }],
    ["subjects", { subjects: [...subjects] }],
    ["faculties", { faculties: [...faculties] }],
    ["departments", { departments: [...departments] }],
    ["sections", { sections: [...sections] }],
    ["fieldCourseCodes", { fieldCourseCodes: ["PATHFIT 1"] }],
    ["fieldCourseAssignmentEnabled", { fieldCourseAssignmentEnabled: true }],
  ])("rebuilds checkConflict when %s changes", (_label, override) => {
    const { result, rerender } = renderHook((props) => useConflict(props), {
      initialProps: baseParams,
    });

    const before = result.current.checkConflict;
    rerender({ ...baseParams, ...override });

    expect(result.current.checkConflict).not.toBe(before);
  });

  it("rebuilds getDragOverConflict when the dragged item changes", () => {
    const { result, rerender } = renderHook((props) => useConflict(props), {
      initialProps: baseParams,
    });

    const before = result.current.getDragOverConflict;
    rerender({ ...baseParams, dragSubjectId: "11" });

    expect(result.current.getDragOverConflict).not.toBe(before);
  });
});
