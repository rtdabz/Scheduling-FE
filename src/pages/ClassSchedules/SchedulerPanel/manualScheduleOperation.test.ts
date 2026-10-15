import { describe, expect, it } from "vitest";
import { resolveManualOperationStatus, validateManualMeetingRooms } from "./manualScheduleOperation";

describe("manual schedule operation status", () => {
  it("starts newly placed Major and Minor course rows as draft", () => {
    expect(resolveManualOperationStatus(undefined)).toBe("draft");
    expect(resolveManualOperationStatus(null)).toBe("draft");
  });

  it("preserves the workflow status when updating an existing row", () => {
    expect(resolveManualOperationStatus("revision")).toBe("revision");
  });
});

describe("manual meeting room validation", () => {
  const lab = { mode: "on-site" as const, roomId: "4", duration: 6, isLaboratory: true };
  const unused = { mode: "on-site" as const, roomId: "tba", duration: 0, isLaboratory: false };

  it("saves a single lab with a real room despite hidden second-meeting TBA state", () => {
    expect(validateManualMeetingRooms(lab, unused, null, false)).toBeNull();
    expect(validateManualMeetingRooms(lab, { ...unused, duration: 3 }, null, false)).toBeNull();
  });

  it("ignores an inactive second meeting for a run or zero-duration partner", () => {
    expect(validateManualMeetingRooms(lab, { ...unused, duration: 3 }, "days:0-2", true)).toBeNull();
    expect(validateManualMeetingRooms(lab, unused, "days:0-2", false)).toBeNull();
  });

  it("still rejects TBA for an active lecture in either position", () => {
    const lecture = { ...unused, duration: 3 };
    expect(validateManualMeetingRooms(lecture, lab, null, false)).toBe("Room TBA is allowed only for a laboratory meeting.");
    expect(validateManualMeetingRooms(lab, lecture, "days:0-2", false)).toBe("Room TBA is allowed only for a laboratory meeting.");
  });

  it("allows TBA for an active laboratory meeting", () => {
    const tbaLab = { ...lab, roomId: "tba" };
    expect(validateManualMeetingRooms(tbaLab, unused, null, false)).toBeNull();
    expect(validateManualMeetingRooms(lab, tbaLab, "days:0-2", false)).toBeNull();
  });

  it("requires rooms for both active on-site meetings", () => {
    expect(validateManualMeetingRooms({ ...lab, roomId: "" }, unused, null, false)).toBe("Please select a room for every on-site meeting.");
    expect(validateManualMeetingRooms(lab, { ...lab, roomId: "" }, "days:0-2", false)).toBe("Please select a room for every on-site meeting.");
  });

  it("does not apply the physical-room restriction to an online meeting", () => {
    expect(validateManualMeetingRooms(lab, { ...unused, duration: 3, mode: "online" }, "days:0-2", false)).toBeNull();
  });
});
