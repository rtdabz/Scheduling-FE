import { describe, expect, it } from "vitest";
import { INSTRUCTOR_ASSIGNED_STATUSES } from "./constants";
import { classifyLoad } from "./teachingLoadRows";
import type { Faculty, ScheduleItem } from "./types";

describe("INSTRUCTOR_ASSIGNED_STATUSES", () => {
  it("matches SchedulingPolicy::INSTRUCTOR_ASSIGNED_STATUSES on the server", () => {
    expect([...INSTRUCTOR_ASSIGNED_STATUSES].sort()).toEqual(
      ["approved", "faculty_assignment", "finalized", "reassignment"],
    );
  });

  it("keeps a class under reassignment on the load sheet, so pro bono still reaches the Overload table", () => {
    // Basic Load 3, overload allowance 3: the third subject is pro bono. It is
    // under reassignment -- the case that used to vanish from the print.
    const schedules = [0, 1, 2].map((index) => ({
      id: String(index),
      courseId: `c${index}`,
      courseCode: `IT 10${index}`,
      sectionId: "s1",
      sectionName: "BSIT 1A",
      day: ["monday", "tuesday", "wednesday"][index],
      dayIndex: index,
      startTime: "07:00",
      endTime: "10:00",
      startSlot: 0,
      durationSlots: 6,
      totalUnits: 3,
      status: index === 2 ? "reassignment" : "faculty_assignment",
    })) as ScheduleItem[];
    const faculty = { id: "f1", name: "A B Cruz", requiredUnits: 3, overloadUnits: 3, probonoUnits: 3 } as Faculty;

    const printed = schedules.filter((schedule) => INSTRUCTOR_ASSIGNED_STATUSES.includes(schedule.status));
    const load = classifyLoad(faculty, printed);

    expect(load.overload.map((line) => [line.code, line.band])).toEqual([
      ["IT 101", "overload"],
      ["IT 102", "probono"],
    ]);
    expect(load.grandTotals.units).toBe(9);
  });
});
