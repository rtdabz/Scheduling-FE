import { describe, expect, it } from "vitest";
import {
  checkDayCategoryConstraint,
  checkSectionOnlineLimit,
  isFieldSubject,
  isLaboratorySubject,
  isNstpSubject,
  requiredRoomTypeForMeeting,
  getConflictedScheduleMap,
  resolveDeliveryMode,
} from "./useConflict";
import type { Department, Room, ScheduleItem, Subject } from "../types";

/**
 * Guards the fix for audit finding #2: the client conflict engine must mirror
 * RuleEngine::checkDayCategoryConstraint and ::checkSectionOnlineLimit, so the
 * placement modal stops reporting "ready to be added" for placements the save
 * rejects with a 422.
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
  { id: 3, department_name: "Hospitality", department_code: "HM", sunday_online_only_enabled: false },
];

const NO_FIELD_CODES = new Set<string>();

const dayCheck = (
  s: Subject | undefined,
  dayIndex: number,
  mode: Parameters<typeof checkDayCategoryConstraint>[2] = "on-site",
  departmentId: number | null = 2,
  fieldEnabled = false,
  codes: Set<string> = NO_FIELD_CODES,
) => checkDayCategoryConstraint(s, dayIndex, mode, departmentId, departments, fieldEnabled, codes);

describe("isNstpSubject", () => {
  it.each(["NSTP1", "ROTC 1", "CWTS2", "LTS1"])("detects %s by code", (code) => {
    expect(isNstpSubject(subject({ code }))).toBe(true);
  });

  it("detects NSTP by course name", () => {
    expect(isNstpSubject(subject({ code: "GE9", name: "National Service Training (NSTP)" }))).toBe(true);
  });

  it("does not flag ordinary courses", () => {
    expect(isNstpSubject(subject())).toBe(false);
  });
});

describe("isFieldSubject", () => {
  it("treats a Field category as a field course", () => {
    expect(isFieldSubject(subject({ categories: [{ id: 1, name: "Field" }] }), false, NO_FIELD_CODES)).toBe(true);
  });

  it("treats roomTypeRequired=field as a field course", () => {
    expect(isFieldSubject(subject({ roomTypeRequired: "field" }), false, NO_FIELD_CODES)).toBe(true);
  });

  it("treats NSTP as a field course", () => {
    expect(isFieldSubject(subject({ code: "CWTS1" }), false, NO_FIELD_CODES)).toBe(true);
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

describe("checkDayCategoryConstraint", () => {
  it("allows NSTP on every day including Sunday", () => {
    const nstp = subject({ code: "NSTP1" });
    for (let dayIndex = 0; dayIndex <= 6; dayIndex += 1) {
      expect(dayCheck(nstp, dayIndex)).toBeNull();
    }
  });

  it("restricts non-NSTP field courses to Monday through Friday", () => {
    const pathfit = subject({ code: "PATHFIT 1" });
    const codes = new Set(["PATHFIT 1"]);

    for (let dayIndex = 0; dayIndex <= 4; dayIndex += 1) {
      expect(dayCheck(pathfit, dayIndex, "on-site", 2, true, codes)).toBeNull();
    }
    expect(dayCheck(pathfit, 5, "on-site", 2, true, codes)?.message).toMatch(/Monday through Friday/);
    expect(dayCheck(pathfit, 6, "on-site", 2, true, codes)?.message).toMatch(/Monday through Friday/);
  });

  it("restricts minor courses to Monday through Saturday", () => {
    const gec = subject({ code: "GEC1", category: "minor" });

    for (let dayIndex = 0; dayIndex <= 5; dayIndex += 1) {
      expect(dayCheck(gec, dayIndex)).toBeNull();
    }
    expect(dayCheck(gec, 6)?.message).toMatch(/Monday through Saturday/);
  });

  it("requires online delivery for majors on Sunday", () => {
    const major = subject();

    expect(dayCheck(major, 6, "on-site")?.message).toMatch(/Sunday must use online/);
    expect(dayCheck(major, 6, "field")?.message).toMatch(/Sunday must use online/);
    expect(dayCheck(major, 6, "online")).toBeNull();
  });

  it("allows on-site majors on Sunday when the department disables the rule", () => {
    expect(dayCheck(subject(), 6, "on-site", 3)).toBeNull();
  });

  it("defaults the Sunday rule to enabled for an unknown department", () => {
    expect(dayCheck(subject(), 6, "on-site", 999)?.message).toMatch(/Sunday must use online/);
  });

  it("allows majors Monday through Saturday", () => {
    for (let dayIndex = 0; dayIndex <= 5; dayIndex += 1) {
      expect(dayCheck(subject(), dayIndex)).toBeNull();
    }
  });

  it("returns null when the course is unknown", () => {
    expect(dayCheck(undefined, 6)).toBeNull();
  });
});

const onlineSchedule = (id: string, courseId: string, sectionId = "10"): ScheduleItem => ({
  id,
  termId: 7,
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

describe("checkSectionOnlineLimit", () => {
  const fiveOnline = ["1", "2", "3", "4", "5"].map((courseId, index) =>
    onlineSchedule(String(100 + index), courseId));

  it("allows a sixth online meeting of an already-online course set below the limit", () => {
    const fourOnline = fiveOnline.slice(0, 4);
    expect(checkSectionOnlineLimit(fourOnline, "10", [])).toBeNull();
  });

  it("blocks a new online course once the section has five distinct online courses", () => {
    expect(checkSectionOnlineLimit(fiveOnline, "10", [])?.message).toMatch(/already has 5 online courses/);
  });

  it("counts distinct courses, not meetings", () => {
    const manyMeetingsFewCourses = [
      onlineSchedule("200", "1"),
      onlineSchedule("201", "1"),
      onlineSchedule("202", "2"),
      onlineSchedule("203", "2"),
      onlineSchedule("204", "3"),
    ];
    expect(checkSectionOnlineLimit(manyMeetingsFewCourses, "10", [])).toBeNull();
  });

  it("ignores online classes belonging to other sections", () => {
    const otherSection = fiveOnline.map((item, index) =>
      onlineSchedule(String(300 + index), item.courseId, "99"));
    expect(checkSectionOnlineLimit(otherSection, "10", [])).toBeNull();
  });

  it("skips the check when the schedule being edited is already online", () => {
    expect(checkSectionOnlineLimit(fiveOnline, "10", ["100"])).toBeNull();
  });

  it("still blocks when the excluded schedule is not online", () => {
    const withOnsite = [...fiveOnline, { ...onlineSchedule("999", "6"), mode: "on-site" as const }];
    expect(checkSectionOnlineLimit(withOnsite, "10", ["999"])?.message).toMatch(/maximum allowed/);
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
 * Guards the fix for audit finding #39: the client fell back to the room's own
 * `maxConcurrentClasses` (usually 1) for shared online/field rooms, while
 * DepartmentResourceSlotLimitService falls back to 3 — so the browser reported a
 * capacity conflict the server would have accepted.
 */
describe("shared room capacity defaults", () => {
  const fieldRoom: Room = {
    id: "9", name: "FIELD", departmentId: null, roomType: "field",
    status: "available", maxConcurrentClasses: 1,
  };
  const rooms = [fieldRoom];

  const fieldSchedule = (id: string, courseId: string, sectionId: string, departmentId: number): ScheduleItem => ({
    ...onlineSchedule(id, courseId, sectionId),
    departmentId,
    mode: "field",
    roomId: "9",
    roomName: "Field",
  });

  it("treats an unconfigured department as allowing three concurrent classes", () => {
    const unconfigured: Department[] = [{ id: 2, department_name: "Info Tech", department_code: "IT" }];

    // Two already placed; a third is still within the server's default of 3.
    const existing = [fieldSchedule("1", "1", "10", 2), fieldSchedule("2", "2", "11", 2)];
    const conflictMap = getConflictedScheduleMap(existing, [], rooms, [], unconfigured);

    expect(Object.keys(conflictMap)).toEqual([]);
  });

  it("honours a configured limit below the default", () => {
    const configured: Department[] = [
      { id: 2, department_name: "Info Tech", department_code: "IT", field_slot_limit: 1 },
    ];

    const existing = [fieldSchedule("1", "1", "10", 2), fieldSchedule("2", "2", "11", 2)];
    const conflictMap = getConflictedScheduleMap(existing, [], rooms, [], configured);

    expect(Object.keys(conflictMap).length).toBeGreaterThan(0);
  });
});

/**
 * Guards the fix for audit finding #25: each pair is evaluated once, at the
 * first slot where the two schedules overlap, but the shared-room capacity check
 * was handed s1's *full* span. Concurrency was therefore measured across hours
 * where the pair does not overlap, so a short class could be reported as a room
 * conflict because of two other classes placed later in the day.
 */
describe("shared room capacity window", () => {
  const fieldRoom: Room = {
    id: "9", name: "FIELD", departmentId: null, roomType: "field",
    status: "available", maxConcurrentClasses: 1,
  };
  const rooms = [fieldRoom];
  const capacityTwo: Department[] = [
    { id: 2, department_name: "Info Tech", department_code: "IT", field_slot_limit: 2 },
  ];

  const span = (id: string, sectionId: string, startSlot: number, durationSlots: number): ScheduleItem => ({
    ...onlineSchedule(id, id, sectionId),
    departmentId: 2,
    mode: "field",
    roomId: "9",
    roomName: "Field",
    dayIndex: 0,
    startSlot,
    durationSlots,
  });

  it("measures concurrency over the pair's overlap, not the longer schedule's whole span", () => {
    // long spans the morning; short only overlaps it at slots 0-2, where the two
    // of them are exactly at the limit of 2. lateA and lateB genuinely exceed it
    // at slots 4-6, which is outside short's hours entirely.
    const long = span("long", "10", 0, 8);
    const short = span("short", "11", 0, 2);
    const lateA = span("lateA", "12", 4, 2);
    const lateB = span("lateB", "13", 4, 2);

    const conflictMap = getConflictedScheduleMap([long, short, lateA, lateB], [], rooms, [], capacityTwo);

    expect(conflictMap.short).toBeUndefined();
    expect(conflictMap.lateA?.conflictType).toBe("room");
    expect(conflictMap.lateB?.conflictType).toBe("room");
  });

  it("still reports a genuine overlap that exceeds the limit", () => {
    const first = span("first", "10", 0, 4);
    const second = span("second", "11", 0, 4);
    const third = span("third", "12", 0, 4);

    const conflictMap = getConflictedScheduleMap([first, second, third], [], rooms, [], capacityTwo);

    expect(conflictMap.first?.conflictType).toBe("room");
    expect(conflictMap.second?.conflictType).toBe("room");
    expect(conflictMap.third?.conflictType).toBe("room");
  });
});
