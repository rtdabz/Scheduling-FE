import { describe, expect, it } from "vitest";
import {
  conflictTime,
  instructorConflictMessage,
  roomConflictMessage,
  sectionConflictMessage,
} from "./conflictMessages";

/** Must match the server's ConflictMessageTest word for word. */
describe("conflict messages", () => {
  const booking = { department: "CIT", course: "PATH FIT 2", section: "BSIT 1I", start: "07:00:00", end: "09:00:00" };

  it("uses the standard room wording", () => {
    expect(roomConflictMessage("BA 201", { day: "Monday", start: "07:00", end: "10:00" }, booking)).toBe(
      "Room BA 201 is unavailable on Mon 07:00–10:00. It is booked by CIT for PATH FIT 2 (BSIT 1I) from 07:00–09:00. Please choose another time or room."
    );
  });

  it("degrades to plain wording when details are missing", () => {
    expect(roomConflictMessage(null, { day: "Tuesday", start: "8:00", end: "9:00" }, { start: "08:30", end: "09:30" })).toBe(
      "The selected room is unavailable on Tue 08:00–09:00. It is booked for another class from 08:30–09:30. Please choose another time or room."
    );
  });

  it("follows the same structure for other conflict types", () => {
    expect(instructorConflictMessage("Ana Cruz", { day: "Wednesday", start: "13:00", end: "14:30" }, booking)).toBe(
      "Instructor Ana Cruz is unavailable on Wed 13:00–14:30. They are already teaching PATH FIT 2 (BSIT 1I) for CIT from 07:00–09:00. Please choose another time or instructor."
    );
    expect(sectionConflictMessage("BSIT 1I", { day: "Monday", start: "08:00", end: "09:00" }, booking)).toBe(
      "Section BSIT 1I is unavailable on Mon 08:00–09:00. It already has PATH FIT 2 from 07:00–09:00. Please choose another time."
    );
  });

  it("normalizes clock strings", () => {
    expect(conflictTime("7:05")).toBe("07:05");
    expect(conflictTime("13:30:00")).toBe("13:30");
  });
});
