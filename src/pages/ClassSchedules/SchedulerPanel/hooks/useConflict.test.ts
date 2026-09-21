import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { configureTimeGrid, resetTimeGrid } from "../../../../lib/timeGrid";
import {
  checkFieldEveningWindow,
  checkRoomGrantWindow,
  isFieldSubject,
  isLaboratorySubject,
  requiredRoomTypeForMeeting,
  getConflictedScheduleMap,
  resolveDeliveryMode,
  useConflict,
} from "./useConflict";
import type { Department, Room, ScheduleItem, Subject } from "../types";

/**
 * Guards the fix for audit finding #2: the client conflict engine must mirror
 * the server's day/category rules, so the placement modal stops reporting
 * "ready to be added" for placements the save rejects with a 422.
 *
 * Day indexes: 0 = Monday … 5 = Saturday, 6 = Sunday.
 */

const subject = (overrides: Partial<Subject> = {}): Subject => ({
  id: "1",
  code: "IT101",
  name: "Intro to Computing",
  units: 3,
  lectureHours: 3,
  labHours: 0,
  category: "major",
  semester: "1st",
  departmentId: 2,
  categories: [],
  yearLevel: 1,
  roomTypeRequired: "lecture",
  status: "active",
  ...overrides,
});

const departments: Department[] = [
  { id: 2, department_name: "Info Tech", department_code: "IT" },
  { id: 3, department_name: "Hospitality", department_code: "HM" },
];

const NO_FIELD_CODES = new Set<string>();

describe("isFieldSubject", () => {
  it("does not treat a Field category tag as a field course, matching the server", () => {
    expect(isFieldSubject(subject({ categories: [{ id: 1, name: "Field" }] }), false, NO_FIELD_CODES)).toBe(false);
  });

  it("treats roomTypeRequired=field as a field course", () => {
    expect(isFieldSubject(subject({ roomTypeRequired: "field" }), false, NO_FIELD_CODES)).toBe(true);
  });

  it("never treats a course as field by its NSTP/ROTC/CWTS name alone", () => {
    expect(isFieldSubject(subject({ code: "CWTS1" }), false, NO_FIELD_CODES)).toBe(false);
    expect(isFieldSubject(subject({ code: "CWTS1" }), true, new Set(["CWTS1"]))).toBe(true);
  });

  it("uses configured codes only when the setting is enabled", () => {
    const pathfit = subject({ code: "PATHFIT 1" });
    const codes = new Set(["PATHFIT 1"]);

    expect(isFieldSubject(pathfit, false, codes)).toBe(false);
    expect(isFieldSubject(pathfit, true, codes)).toBe(true);
  });

  it("normalizes whitespace and case when matching configured codes", () => {
    expect(isFieldSubject(subject({ code: "  pathfit   1 " }), true, new Set(["PATHFIT 1"]))).toBe(true);
  });
});

describe("day limits by course category", () => {
  /**
   * Field courses were Monday-Friday, minors Monday-Saturday, and a major's
   * Sunday had to be online — the last gated by a per-department switch. All
   * three rules are gone, so no day may be refused on the course's kind alone.
   */
  const dayIsAllowed = (course: Subject, dayIndex: number, roomId: string) => renderHook(() => useConflict({
    schedules: [],
    selectedSectionId: "10",
    dragSubjectId: null,
    draggedScheduleId: null,
    rooms: [
      { id: "5", name: "Room 101", departmentId: 2, roomType: "lecture", status: "available" },
      { id: "9", name: "Field", departmentId: null, roomType: "field", status: "available" },
    ],
    sections: [{ id: "10", name: "BSIT-1A", yearLevel: 1, semester: "1st", departmentId: 2, semesterId: 7, status: "active" }],
    departments,
    subjects: [course],
    faculties: [],
  })).result.current.checkConflict(course.id, "10", null, roomId, dayIndex, 2, 2);

  it.each([
    ["a field course", subject({ id: "20", code: "PATHFIT 1", roomTypeRequired: "field" }), "9"],
    ["a minor", subject({ id: "21", code: "GEC1", category: "minor" }), "5"],
    ["a major", subject({ id: "22", code: "IT101", category: "major" }), "5"],
  ])("allows %s on every day of the week", (_label, course, roomId) => {
    for (let dayIndex = 0; dayIndex <= 6; dayIndex += 1) {
      expect(dayIsAllowed(course, dayIndex, roomId), `day ${dayIndex}`).toBeNull();
    }
  });
});


const onlineSchedule = (id: string, courseId: string, sectionId = "10"): ScheduleItem => ({
  id,
  semesterId: 7,
  departmentId: 2,
  courseId,
  subjectId: courseId,
  courseCode: `C${courseId}`,
  courseName: `Course ${courseId}`,
  courseType: "major",
  lectureUnits: 3,
  laboratoryUnits: 0,
  totalUnits: 3,
  sectionName: "BSIT-1A",
  roomName: "Online",
  day: "Monday",
  startTime: "8 AM",
  endTime: "9:30 AM",
  mode: "online",
  facultyName: null,
  facultyId: null,
  status: "draft",
  dayIndex: 0,
  startSlot: 2,
  durationSlots: 3,
  sectionId,
  roomId: "online",
});

/**
 * section_online_limit was removed from the server; online balance is only a
 * soft solver target. The client kept a hard limit of five online courses per
 * section and refused a sixth that the save accepts.
 */
describe("online courses per section", () => {
  it("does not limit how many online courses a section may take", () => {
    // Five online courses on Monday morning; the sixth goes online on Tuesday.
    const fiveOnline = ["1", "2", "3", "4", "5"].map((courseId, index) =>
      onlineSchedule(String(100 + index), courseId));
    const sixth = subject({ id: "6", code: "IT106" });
    const { result } = renderHook(() => useConflict({
      schedules: fiveOnline,
      selectedSectionId: "10",
      dragSubjectId: null,
      draggedScheduleId: null,
      rooms: [{ id: "8", name: "Online", departmentId: null, roomType: "online", status: "available" }],
      sections: [{ id: "10", name: "BSIT-1A", yearLevel: 1, semester: "1st", departmentId: 2, semesterId: 7, status: "active" }],
      departments,
      subjects: [sixth],
      faculties: [],
    }));

    expect(result.current.checkConflict("6", "10", null, "online", 1, 2, 3)).toBeNull();
  });
});

/** Server rules class_duration and room_availability, mirrored in the browser. */
describe("class_duration and room_availability parity", () => {
  const sections = [{ id: "10", name: "BSIT-1A", yearLevel: 1 as const, semester: "1st" as const, departmentId: 2, semesterId: 7, status: "active" as const }];
  const lectureRoom = (status: Room["status"] = "available"): Room =>
    ({ id: "5", name: "Room 101", departmentId: 2, roomType: "lecture", status });
  const setup = (schedules: ScheduleItem[], rooms: Room[]) => renderHook(() => useConflict({
    schedules,
    selectedSectionId: "10",
    dragSubjectId: null,
    draggedScheduleId: null,
    rooms,
    sections,
    departments,
    subjects: [subject()],
    faculties: [],
  })).result.current;

  it("refuses a meeting that adds time past the course's weekly ceiling", () => {
    const placed = { ...onlineSchedule("100", "1"), durationSlots: 6, mode: "on-site" as const, roomId: "5" };
    const conflict = setup([placed], [lectureRoom()]).checkConflict("1", "10", null, "5", 1, 2, 3);
    expect(conflict?.message).toMatch(/would meet 4\.5 hours a week/);
  });

  it("allows replacing the existing meetings with the same total", () => {
    const placed = { ...onlineSchedule("100", "1"), durationSlots: 6, mode: "on-site" as const, roomId: "5" };
    expect(setup([placed], [lectureRoom()]).checkConflict("1", "10", null, "5", 1, 2, 6, "100")).toBeNull();
  });

  it("refuses a room that is not available for scheduling", () => {
    const conflict = setup([], [lectureRoom("not available")]).checkConflict("1", "10", null, "5", 1, 2, 6);
    expect(conflict?.message).toBe("Room Room 101 is not available for scheduling.");
  });
});

describe("resolveDeliveryMode", () => {
  const rooms: Room[] = [
    { id: "1", name: "LEC1", departmentId: 2, roomType: "lecture", status: "available" },
    { id: "2", name: "ONLINE", departmentId: null, roomType: "online", status: "available" },
    { id: "3", name: "FIELD", departmentId: null, roomType: "field", status: "available" },
  ];

  it.each([
    ["online", "online"],
    ["field", "field"],
    ["1", "on-site"],
    ["2", "online"],
    ["3", "field"],
    ["", "on-site"],
    ["unknown", "on-site"],
  ])("maps room id %s to mode %s", (roomId, expected) => {
    expect(resolveDeliveryMode(roomId, rooms)).toBe(expected);
  });
});

/**
 * Mirrors LaboratoryRoomRequirementParityTest on the server. An unsplit course
 * with a laboratory component must land in a laboratory room even when its
 * `roomTypeRequired` column says "lecture" — the client used to read that column
 * on its own and offered a plain classroom the save then rejected.
 */
describe("isLaboratorySubject", () => {
  it("detects a laboratory component from lab hours", () => {
    expect(isLaboratorySubject(subject({ labHours: 3, roomTypeRequired: "lecture" }))).toBe(true);
  });

  it("detects a Laboratory course category", () => {
    expect(isLaboratorySubject(subject({ labHours: 0, categories: [{ id: 1, name: "Laboratory" }] }))).toBe(true);
  });

  it("detects roomTypeRequired=laboratory", () => {
    expect(isLaboratorySubject(subject({ labHours: 0, roomTypeRequired: "laboratory" }))).toBe(true);
  });

  it("is false for a lecture-only course", () => {
    expect(isLaboratorySubject(subject({ lectureHours: 3, labHours: 0 }))).toBe(false);
  });

  it("is false for no course", () => {
    expect(isLaboratorySubject(undefined)).toBe(false);
  });
});

describe("requiredRoomTypeForMeeting", () => {
  it("requires a laboratory room for an unsplit lecture-plus-lab course", () => {
    expect(requiredRoomTypeForMeeting(subject({ lectureHours: 2, labHours: 3, roomTypeRequired: "lecture" })))
      .toBe("laboratory");
  });

  it("requires a laboratory room for a lab-only course", () => {
    expect(requiredRoomTypeForMeeting(subject({ lectureHours: 0, labHours: 3, roomTypeRequired: "lecture" })))
      .toBe("laboratory");
  });

  it("keeps lecture for a course with no laboratory component", () => {
    expect(requiredRoomTypeForMeeting(subject({ lectureHours: 3, labHours: 0, roomTypeRequired: "lecture" })))
      .toBe("lecture");
  });

  it("lets an explicit meeting type win, so a split lecture meeting stays in a lecture room", () => {
    const labCourse = subject({ lectureHours: 2, labHours: 3, roomTypeRequired: "lecture" });

    expect(requiredRoomTypeForMeeting(labCourse, "lecture")).toBe("lecture");
    expect(requiredRoomTypeForMeeting(labCourse, "laboratory")).toBe("laboratory");
  });

  it("passes field courses through unchanged", () => {
    expect(requiredRoomTypeForMeeting(subject({ labHours: 0, roomTypeRequired: "field" }))).toBe("field");
  });

  it("returns null for no course", () => {
    expect(requiredRoomTypeForMeeting(undefined)).toBeNull();
  });
});

/**
 * The field is open ground: any number of classes, from any department, may
 * share it at once. RoomAvailabilityRule::booking never reports a field clash,
 * so the board must not either.
 */
describe("shared field room", () => {
  const fieldRoom: Room = {
    id: "9", name: "FIELD", departmentId: null, roomType: "field", status: "available",
  };
  const lectureRoom: Room = {
    id: "5", name: "LEC 101", departmentId: 2, roomType: "lecture", status: "available",
  };
  const rooms = [fieldRoom, lectureRoom];

  const placed = (id: string, sectionId: string, roomId: string, mode: ScheduleItem["mode"]): ScheduleItem => ({
    ...onlineSchedule(id, id, sectionId),
    departmentId: 2,
    mode,
    roomId,
    roomName: roomId,
  });

  it("never reports concurrent field classes as a room conflict", () => {
    const existing = ["1", "2", "3", "4"].map((id) => placed(id, `1${id}`, "9", "field"));

    expect(Object.keys(getConflictedScheduleMap(existing, [], rooms, []))).toEqual([]);
  });

  it("still reports two classes in one lecture room", () => {
    const existing = [placed("1", "10", "5", "on-site"), placed("2", "11", "5", "on-site")];
    const conflictMap = getConflictedScheduleMap(existing, [], rooms, []);

    expect(conflictMap["1"]?.conflictType).toBe("room");
    expect(conflictMap["2"]?.conflictType).toBe("room");
  });
});

/**
 * Mirrors OperatingHoursRule::fieldEveningWindow. The cut-off is the VPAA's
 * field end time (schedule_settings.field_end_time), not a hardcoded 5:00 PM.
 * Slot 0 is 7:00 AM on the default grid; slot 20 is 5:00 PM.
 */
describe("checkFieldEveningWindow", () => {
  afterEach(() => resetTimeGrid());

  it("lets a field placement end exactly at the default 5:00 PM", () => {
    expect(checkFieldEveningWindow(true, 20)).toBeNull();
  });

  it("refuses a field placement that runs past the field end time", () => {
    expect(checkFieldEveningWindow(true, 22)?.message).toMatch(/5:00 PM/);
  });

  it("follows the configured field end time", () => {
    configureTimeGrid({ opening_time: "07:00", closing_time: "20:30", field_end_time: "18:00" });

    expect(checkFieldEveningWindow(true, 22)).toBeNull();
    expect(checkFieldEveningWindow(true, 24)?.message).toMatch(/6:00 PM/);
  });

  it("ignores non-field placements", () => {
    expect(checkFieldEveningWindow(false, 26)).toBeNull();
  });
});

describe("checkRoomGrantWindow", () => {
  const borrowed: Room = {
    id: "40", name: "HM Lab", departmentId: 3, roomType: "laboratory", status: "available",
    grantWindows: [{ day: "Tuesday", start_time: "08:00", end_time: "12:00" }],
  };

  it("allows the department's own rooms at any time", () => {
    expect(checkRoomGrantWindow({ ...borrowed, grantWindows: undefined }, 0, 0, 6)).toBeNull();
  });

  it("allows a borrowed room inside its granted window", () => {
    expect(checkRoomGrantWindow(borrowed, 1, 2, 6)).toBeNull();
  });

  it("refuses a borrowed room outside its granted window", () => {
    expect(checkRoomGrantWindow(borrowed, 1, 6, 6)?.message).toMatch(/borrowed/);
    expect(checkRoomGrantWindow(borrowed, 0, 2, 6)?.conflictType).toBe("room");
  });
});

/**
 * Moving a placed class keeps its instructor, its Required Day and its
 * Split Session / Hybrid Split partner, so the move pre-check judges all three
 * before the save does (faculty_conflict, forced_course_day,
 * split_group_same_time / split_group_day_separation).
 */
describe("checkMoveConflict", () => {
  const rooms: Room[] = [
    { id: "5", name: "LEC 101", departmentId: 2, roomType: "lecture", status: "available" },
    { id: "6", name: "LEC 102", departmentId: 2, roomType: "lecture", status: "available" },
    { id: "7", name: "LAB 201", departmentId: 2, roomType: "laboratory", status: "available" },
  ];
  const lecture = subject({ id: "1", code: "GEC 101", category: "minor", lectureHours: 3, labHours: 0 });
  const withLab = subject({ id: "2", code: "IT 102", lectureHours: 2, labHours: 1, roomTypeRequired: "laboratory" });

  const meeting = (overrides: Partial<ScheduleItem>): ScheduleItem => ({
    ...onlineSchedule(overrides.id ?? "1", "1"),
    mode: "on-site",
    roomId: "5",
    roomName: "LEC 101",
    ...overrides,
  });

  const moveCheck = (schedules: ScheduleItem[], forcedDayByCourseId: Record<string, number> = {}) =>
    renderHook(() => useConflict({
      schedules,
      selectedSectionId: "10",
      dragSubjectId: null,
      draggedScheduleId: null,
      rooms,
      sections: [{ id: "10", name: "BSIT-1A", yearLevel: 1, semester: "1st", departmentId: 2, semesterId: 7, status: "active" }],
      departments,
      subjects: [lecture, withLab],
      faculties: [{ id: "9", name: "Ada Reyes", employmentType: "full-time", departmentId: 2, status: "active" }],
      forcedDayByCourseId,
    })).result.current.checkMoveConflict;

  it("checks the class's own instructor at the new time", () => {
    const moving = meeting({ id: "1", facultyId: "9", dayIndex: 0, startSlot: 0 });
    const busy = meeting({ id: "2", courseId: "7", subjectId: "7", sectionId: "11", roomId: "6", facultyId: "9", dayIndex: 1, startSlot: 4 });

    expect(moveCheck([moving, busy])("1", 1, 4)?.conflictType).toBe("faculty");
    expect(moveCheck([moving, { ...busy, facultyId: "8" }])("1", 1, 4)).toBeNull();
  });

  it("keeps a class on its saved Required Day", () => {
    const moving = meeting({ id: "1", dayIndex: 0, startSlot: 0 });

    expect(moveCheck([moving], { 1: 0 })("1", 2, 4)?.message).toMatch(/Required Day: .* Monday/);
    expect(moveCheck([moving], { 1: 0 })("1", 0, 4)).toBeNull();
  });

  describe("a Split Session pair", () => {
    const monday = meeting({ id: "1", splitGroupId: "g", preferredPattern: "MW", dayIndex: 0, startSlot: 0 });
    const wednesday = meeting({ id: "2", splitGroupId: "g", preferredPattern: "MW", dayIndex: 2, startSlot: 0 });

    it("checks the partner at the new time on its own day", () => {
      const blocksWednesday = meeting({ id: "3", courseId: "7", subjectId: "7", sectionId: "11", dayIndex: 2, startSlot: 6 });

      const conflict = moveCheck([monday, wednesday, blocksWednesday])("1", 0, 6);
      expect(conflict?.conflictType).toBe("room");
      expect(conflict?.message).toMatch(/^Paired Wednesday meeting: Room conflict/);
      expect(moveCheck([monday, wednesday])("1", 0, 6)).toBeNull();
    });

    it("refuses moving a meeting onto its partner's day", () => {
      expect(moveCheck([monday, wednesday])("1", 2, 6)?.message).toMatch(/must be on different days/);
    });
  });

  describe("an Integrated pair, whose days:X-Y pattern only records where it sits", () => {
    // Monday laboratory + Tuesday online lecture, the shape the dialog writes.
    const laboratory = meeting({
      id: "1", splitGroupId: "g", preferredPattern: "days:0-1",
      dayIndex: 0, startSlot: 0, durationSlots: 6, isHybrid: true,
    });
    const lecture = meeting({
      id: "2", splitGroupId: "g", preferredPattern: "days:0-1",
      dayIndex: 1, startSlot: 8, durationSlots: 4, isHybrid: true, mode: "online", roomId: "online",
    });

    it("allows moving a meeting to an empty day outside the recorded pattern", () => {
      // Thursday holds nothing, so the move is legal — the drop rewrites the
      // pattern to days:0-3. Judged against the old pattern it was refused
      // with "Meeting pattern conflict" on a day with no class at all.
      expect(moveCheck([laboratory, lecture])("2", 3, 8)).toBeNull();
    });

    it("still refuses the day its partner already holds", () => {
      expect(moveCheck([laboratory, lecture])("2", 0, 8)?.message).toMatch(/must be on different days/);
    });

    it("still reports a real clash on the new day", () => {
      const busy = meeting({ id: "3", courseId: "7", subjectId: "7", dayIndex: 3, startSlot: 8 });

      expect(moveCheck([laboratory, lecture, busy])("2", 3, 8)?.conflictType).toBe("section");
    });
  });

  it("does not move the partner of a course with a laboratory", () => {
    // Integrated Hybrid: laboratory and lecture keep their own times.
    const lab = meeting({ id: "1", courseId: "2", subjectId: "2", splitGroupId: "h", isHybrid: true, roomId: "7", dayIndex: 0, startSlot: 0 });
    const onlineLecture = meeting({ id: "2", courseId: "2", subjectId: "2", splitGroupId: "h", isHybrid: true, mode: "online", roomId: "online", dayIndex: 2, startSlot: 0 });
    // The same section is busy on Wednesday at the new time: a clash only if
    // the lecture were (wrongly) carried along.
    const blocksWednesday = meeting({ id: "3", courseId: "7", subjectId: "7", mode: "online", roomId: "online", dayIndex: 2, startSlot: 6 });

    expect(moveCheck([lab, onlineLecture, blocksWednesday])("1", 0, 6)).toBeNull();
  });
});
