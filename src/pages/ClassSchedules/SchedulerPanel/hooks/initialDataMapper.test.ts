import { describe, expect, it } from "vitest";
import { mapInitialData } from "./initialDataMapper";
import type { InitialDataResponse } from "./initialDataMapper";

/**
 * Guards the fix for audit finding #3: the mount effect and refreshData() must
 * map /initial-data identically. The two used to keep hand-copied mappers that
 * had drifted apart.
 */

const term = {
  id: 7,
  academic_year: "2026-2027",
  semester: "1st" as const,
  is_active: true,
};

const baseResponse = (overrides: Partial<InitialDataResponse> = {}): InitialDataResponse => ({
  active_term: term,
  rooms: [],
  subjects: [],
  faculties: [],
  sections: [],
  schedules: [],
  departments: [],
  users: [],
  ...overrides,
});

describe("mapInitialData", () => {
  it("preserves part-time faculty availability windows", () => {
    const result = mapInitialData(
      baseResponse({
        faculties: [{
          id: 3,
          first_name: "Ada",
          last_name: "Reyes",
          employment_type: "part-time",
          availabilities: [
            { id: 1, faculty_id: 3, day_index: 1, start_time: "13:00", end_time: "17:00" },
          ],
        }],
      }),
      { isVpaa: false, userDepartmentId: 2 },
    );

    expect(result.faculties).toHaveLength(1);
    expect(result.faculties[0].availabilities).toEqual([
      { id: 1, faculty_id: 3, day_index: 1, start_time: "13:00", end_time: "17:00" },
    ]);
  });

  it("keeps sections from the active term and from a matching semester in the same academic year", () => {
    const result = mapInitialData(
      baseResponse({
        sections: [
          {
            id: 1,
            section_name: "BSIT-1A",
            year_level: "1",
            semester: "1st",
            department_id: 2,
            term_id: 7,
          },
          {
            id: 2,
            section_name: "BSIT-2A",
            year_level: "2",
            semester: "1st",
            department_id: 2,
            term_id: 0,
            term: { id: 0, academic_year: "2026-2027", semester: "1st", is_active: false },
          },
        ],
      }),
      { isVpaa: false, userDepartmentId: 2 },
    );

    expect(result.sections.map((s) => s.name)).toEqual(["BSIT-1A", "BSIT-2A"]);
  });

  it("drops sections from a different academic year that share the semester", () => {
    const result = mapInitialData(
      baseResponse({
        sections: [
          {
            id: 3,
            section_name: "BSIT-1A-OLD",
            year_level: "1",
            semester: "1st",
            department_id: 2,
            term_id: 0,
            term: { id: 0, academic_year: "2024-2025", semester: "1st", is_active: false },
          },
        ],
      }),
      { isVpaa: false, userDepartmentId: 2 },
    );

    expect(result.sections).toEqual([]);
  });

  it("drops sections with no term information at all", () => {
    const result = mapInitialData(
      baseResponse({
        sections: [{
          id: 4,
          section_name: "ORPHAN",
          year_level: "1",
          semester: "2nd",
          department_id: 2,
          term_id: 0,
        }],
      }),
      { isVpaa: false, userDepartmentId: 2 },
    );

    expect(result.sections).toEqual([]);
  });

  it("coerces string course hours and units to numbers", () => {
    const result = mapInitialData(
      baseResponse({
        // The API serializes decimal columns as strings; the mount effect always
        // coerced these, refreshData did not.
        courses: [{
          id: 11,
          course_code: "IT101",
          course_name: "Intro",
          units: "3",
          lecture_hours: "2",
          lab_hours: "1",
          course_category: "major",
          semester: "1st",
          department_id: 2,
          year_level: "1",
          room_type_required: "lecture",
        } as unknown as NonNullable<InitialDataResponse["courses"]>[number]],
      }),
      { isVpaa: false, userDepartmentId: 2 },
    );

    expect(result.subjects[0]).toMatchObject({ units: 3, lectureHours: 2, labHours: 1 });
  });

  it("scopes rooms to the user department but keeps shared rooms", () => {
    const rooms: InitialDataResponse["rooms"] = [
      { id: 1, room_code: "OWN", room_type: "lecture", status: "available", department_id: 2 },
      { id: 2, room_code: "SHARED", room_type: "lecture", status: "available", department_id: null },
      { id: 3, room_code: "OTHER", room_type: "lecture", status: "available", department_id: 9 },
    ];

    const scoped = mapInitialData(baseResponse({ rooms }), { isVpaa: false, userDepartmentId: 2 });
    expect(scoped.rooms.map((r) => r.name)).toEqual(["OWN", "SHARED"]);

    const vpaa = mapInitialData(baseResponse({ rooms }), { isVpaa: true, userDepartmentId: null });
    expect(vpaa.rooms.map((r) => r.name)).toEqual(["OWN", "SHARED", "OTHER"]);
  });

  it("keeps each room's own concurrency column instead of stamping one department's limit on it", () => {
    const result = mapInitialData(
      baseResponse({
        rooms: [
          { id: 1, room_code: "ONLINE", room_type: "online", status: "available", department_id: null, max_concurrent_classes: 1 },
          { id: 2, room_code: "FIELD", room_type: "field", status: "available", department_id: null, max_concurrent_classes: 1 },
          { id: 3, room_code: "LEC1", room_type: "lecture", status: "available", department_id: null, max_concurrent_classes: 1 },
        ],
        resource_slot_limits: { online: 5, field: 4 },
      }),
      { isVpaa: false, userDepartmentId: 2 },
    );

    // The requesting department's limits used to overwrite these, and then served
    // as the fallback capacity when judging another department's use of the same
    // shared room (audit finding #39). Per-department limits live on `departments`.
    const byName = Object.fromEntries(result.rooms.map((r) => [r.name, r.maxConcurrentClasses]));
    expect(byName).toEqual({ ONLINE: 1, FIELD: 1, LEC1: 1 });
  });

  it("keeps only schedules belonging to the active term", () => {
    const result = mapInitialData(
      baseResponse({
        schedules: [
          {
            id: 100, term_id: 7, department_id: 2, course_id: 11, section_id: 1, room_id: 3,
            day: "Monday", start_time: "08:00", end_time: "09:30", status: "draft",
          },
          {
            id: 101, term_id: 6, department_id: 2, course_id: 11, section_id: 1, room_id: 3,
            day: "Monday", start_time: "10:00", end_time: "11:00", status: "draft",
          },
        ],
      }),
      { isVpaa: false, userDepartmentId: 2 },
    );

    expect(result.schedules).toHaveLength(1);
    expect(result.schedules[0]).toMatchObject({
      id: "100",
      dayIndex: 0,
      startSlot: 2,
      durationSlots: 3,
    });
  });
});
