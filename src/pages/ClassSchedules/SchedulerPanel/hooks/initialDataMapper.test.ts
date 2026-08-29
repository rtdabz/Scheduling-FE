import { describe, expect, it } from "vitest";
import { generatedScheduleSectionId, mapApiScheduleToItem, mapInitialData, type InitialDataResponse } from "./initialDataMapper";
import type { ApiCourseRecord, ApiScheduleRecord } from "../types";

const course = (overrides: Partial<ApiCourseRecord> = {}): ApiCourseRecord => ({
  id: 10,
  course_code: "GEC 101",
  course_name: "Understanding the Self",
  units: 3,
  course_category: "minor",
  semester: "1st",
  department_id: 1,
  department: { department_code: "IT", department_name: "Information Technology" },
  year_level: 1,
  room_type_required: "lecture",
  status: "active",
  ...overrides
});

const payload = (courses: ApiCourseRecord[]): InitialDataResponse => ({
  active_term: null,
  rooms: [],
  courses,
  faculties: [],
  sections: [],
  schedules: [],
  departments: [],
  users: [],
  time_grid: null
});

const mapCourse = (record: ApiCourseRecord) =>
  mapInitialData(payload([record]), { isVpaa: true }).subjects[0];

describe("mapInitialData teaching college", () => {
  it("keeps a GEC subject with the college that owns it when nothing is delegated", () => {
    const subject = mapCourse(course());

    expect(subject.teachingDepartmentId).toBe(1);
    expect(subject.teachingDepartmentCode).toBe("IT");
  });

  it("prefers the delegated college over the owner", () => {
    // The requirement #3 case: IT owns GEC 101, CAS teaches it. The eligibility
    // check reads `teachingDepartmentId`, so the override has to land there or the
    // picker goes on offering IT staff.
    const subject = mapCourse(course({
      teaching_department_id: 3,
      teaching_department: { department_code: "CAS", department_name: "College of Arts and Sciences" }
    }));

    expect(subject.teachingDepartmentId).toBe(3);
    expect(subject.teachingDepartmentCode).toBe("CAS");
    expect(subject.teachingDepartmentName).toBe("College of Arts and Sciences");
    // The owner is still recorded — it is who offers the course, just not who teaches it.
    expect(subject.departmentId).toBe(1);
  });

  it("delegates a non-GEC minor that no college would otherwise teach", () => {
    const subject = mapCourse(course({
      course_code: "PATH FIT 1",
      department_id: null,
      department: null,
      teaching_department_id: 3,
      teaching_department: { department_code: "CAS", department_name: "College of Arts and Sciences" }
    }));

    expect(subject.teachingDepartmentId).toBe(3);
    expect(subject.teachingDepartmentCode).toBe("CAS");
  });

  it("leaves a shared minor open to every college with no delegation", () => {
    const subject = mapCourse(course({
      course_code: "PATH FIT 1",
      department_id: null,
      department: null
    }));

    expect(subject.teachingDepartmentId).toBeNull();
    expect(subject.teachingDepartmentCode).toBeUndefined();
  });

  it("carries no teaching college on a major", () => {
    // Majors are held to their own department and program instead, and the server
    // refuses to store an override on one.
    const subject = mapCourse(course({ course_code: "IT 101", course_category: "major" }));

    expect(subject.teachingDepartmentId).toBeNull();
  });
});

describe("generatedScheduleSectionId", () => {
  const schedule = (id: number, sectionId: number): ApiScheduleRecord => ({
    id,
    term_id: 1,
    department_id: 2,
    course_id: id + 20,
    section_id: sectionId,
    room_id: 3,
    day: "Monday",
    start_time: "07:00:00",
    end_time: "10:00:00",
    status: "draft",
  });
  const generated = [
    mapApiScheduleToItem(schedule(1, 10)),
    mapApiScheduleToItem(schedule(2, 11)),
  ];

  it("keeps a selected section included in the generated result", () => {
    expect(generatedScheduleSectionId("11", generated)).toBe("11");
  });

  it("selects the first generated section when the current timetable is outside the result", () => {
    expect(generatedScheduleSectionId("99", generated)).toBe("10");
  });
});
