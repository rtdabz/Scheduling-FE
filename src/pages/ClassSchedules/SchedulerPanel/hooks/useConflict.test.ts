import { afterEach, describe, expect, it } from "vitest";
import { configureTimeGrid, resetTimeGrid } from "../../../../lib/timeGrid";
import {
  checkDayCategoryConstraint,
  checkFieldEveningWindow,
  checkRoomGrantWindow,
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
