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
      "Room BA 201 is unavailable on Mon 7:00 AM–10:00 AM. It is booked by CIT for PATH FIT 2 (BSIT 1I) from 7:00 AM–9:00 AM. Please choose another time or room."
    );
  });

  it("degrades to plain wording when details are missing", () => {
    expect(roomConflictMessage(null, { day: "Tuesday", start: "8:00", end: "9:00" }, { start: "08:30", end: "09:30" })).toBe(
      "The selected room is unavailable on Tue 8:00 AM–9:00 AM. It is booked for another class from 8:30 AM–9:30 AM. Please choose another time or room."
    );
  });

  it("follows the same structure for other conflict types", () => {
    expect(instructorConflictMessage("Ana Cruz", { day: "Wednesday", start: "13:00", end: "14:30" }, booking)).toBe(
      "Instructor Ana Cruz is unavailable on Wed 1:00 PM–2:30 PM. They are already teaching PATH FIT 2 (BSIT 1I) for CIT from 7:00 AM–9:00 AM. Please choose another time or instructor."
    );
    expect(sectionConflictMessage("BSIT 1I", { day: "Monday", start: "08:00", end: "09:00" }, booking)).toBe(
      "Section BSIT 1I is unavailable on Mon 8:00 AM–9:00 AM. It already has PATH FIT 2 from 7:00 AM–9:00 AM. Please choose another time."
    );
  });

  it("normalizes clock strings", () => {
    expect(conflictTime("7:05")).toBe("7:05 AM");
    expect(conflictTime("13:30:00")).toBe("1:30 PM");
  });
});
