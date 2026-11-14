import { describe, expect, it } from "vitest";
import { loadSheetSignatories } from "./teachingLoadSignatories";
import type { ScheduleItem, ScheduleSignatories } from "./types";

const current = {
  preparedBy: "Paula Renamed",
  preparedTitle: "Program Head",
  verifiedBy: "Nadia Dean",
  vpaaName: "Nico Vpaa",
  presidentName: "Omar President",
  presidentTitle: "College President",
};

const recorded: ScheduleSignatories = {
  prepared: [{ program_id: 7, name: "Paula Head", title: "Program Head" }, { program_id: 8, name: "Other Head", title: "Program Head" }],
  reviewed: { name: "Diego Dean", title: "Dean" },
  recommended: { name: "Vera Vpaa", title: "Vice-President for Academic Affairs" },
  approved: { name: "Olivia President", title: "OIC-College President" },
  frozen: true,
};

const row = (signatories: ScheduleSignatories | null, status: ScheduleItem["status"] = "faculty_assignment"): ScheduleItem => ({ signatories, status } as ScheduleItem);

describe("loadSheetSignatories", () => {
  it("prints the officials recorded at approval, not the ones in office now", () => {
    expect(loadSheetSignatories([row(recorded), row(recorded)], 7, current)).toEqual({
      preparedBy: "Paula Head",
      preparedTitle: "Program Head",
      verifiedBy: "Diego Dean",
      vpaaName: "Vera Vpaa",
      presidentName: "Olivia President",
      presidentTitle: "OIC-College President",
    });
  });

  it("uses current officials for drafts and an empty load", () => {
    expect(loadSheetSignatories([row(null, "draft")], 7, current)).toEqual({ ...current, preparedBy: "Not recorded", preparedTitle: "Schedule preparer" });
    expect(loadSheetSignatories([], 7, current)).toEqual(current);
  });

  it("marks missing historical officials without borrowing the current officeholder", () => {
    const result = loadSheetSignatories([row(recorded), row(null)], 7, current);
    expect(result.vpaaName).toBe("Vera Vpaa / Not recorded");
    expect(result.presidentTitle).toBe("OIC-College President");
  });

  it("falls back to every recorded preparer when none prepared the instructor's program", () => {
    expect(loadSheetSignatories([row(recorded)], 99, current).preparedBy).toBe("Paula Head / Other Head");
  });
  it("keeps a deactivated draft creator instead of assigning a new officeholder", () => {
    const draft = { ...row(null, "draft"), creatorIdentity: { id: 17, name: "Former Director", role: "director" } };
    expect(loadSheetSignatories([draft], 7, current)).toMatchObject({ preparedBy: "Former Director", preparedTitle: "Department Director", vpaaName: current.vpaaName });
  });

  it("never appends current officials to a recorded revision", () => {
    expect(loadSheetSignatories([row(recorded, "revision")], 7, current).preparedBy).toBe("Paula Head");
  });

});
