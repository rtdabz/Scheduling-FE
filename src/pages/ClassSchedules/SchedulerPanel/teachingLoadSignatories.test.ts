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

  it("never joins a recorded block with a missing one", () => {
    const result = loadSheetSignatories([row(recorded), row(null)], 7, current);
    expect(result.vpaaName).toBe("Vera Vpaa");
    expect(result.presidentTitle).toBe("OIC-College President");
  });

  it("marks officials not recorded on submitted rows without borrowing the current officeholder", () => {
    expect(loadSheetSignatories([row(null)], 7, current)).toMatchObject({ verifiedBy: "Not recorded", vpaaName: "Not recorded", presidentName: "Not recorded" });
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

  describe("one official per line", () => {
    const home = 6;
    const lent = (signatories: ScheduleSignatories, departmentId: number) => ({ ...row(signatories), departmentId } as ScheduleItem);
    const older: ScheduleSignatories = {
      prepared: [{ program_id: 1, name: "Lender Secretary", title: "Program Head/Secretary" }],
      reviewed: { name: "Lender Dean", title: "Dean", acted_at: "2026-03-01T00:00:00Z" },
      recommended: { user_id: 11, name: "Former Vpaa", title: "Vice-President for Academic Affairs", acted_at: "2026-03-02T00:00:00Z" },
      approved: { name: "ATTY. FORMER PRESIDENT", title: "College President", acted_at: "2026-03-02T00:00:00Z" },
      frozen: true,
    };
    const newer: ScheduleSignatories = {
      prepared: [{ program_id: 1, name: "Home Secretary", title: "Program Head/Secretary" }],
      reviewed: { name: "Home Dean", title: "Dean", acted_at: "2026-09-01T00:00:00Z" },
      recommended: { user_id: 1, name: "Mark Vpaa, DM", title: "Vice-President for Academic Affairs", acted_at: "2026-09-02T00:00:00Z" },
      approved: { name: "DR. KHAREN JANE S. UNGAB", title: "College President-Designate", acted_at: "2026-09-02T00:00:00Z" },
      frozen: true,
    };
    const now = { ...current, vpaaName: "Mark Vpaa, DBM", vpaaUserId: 1, presidentName: "KHAREN JANE S. UNGAB, DM", presidentTitle: "College President-Designate" };

    it("leaves out the officials of a department that lent the instructor a class", () => {
      const result = loadSheetSignatories([lent(newer, home), lent(older, 5)], 1, now, home);
      expect(result).toEqual({
        preparedBy: "Home Secretary",
        preparedTitle: "Program Head/Secretary",
        verifiedBy: "Home Dean",
        vpaaName: "Mark Vpaa, DBM",
        presidentName: "KHAREN JANE S. UNGAB, DM",
        presidentTitle: "College President-Designate",
      });
    });

    it("signs with the newest block when the department's classes were approved on different submissions", () => {
      const result = loadSheetSignatories([lent(older, home), lent(newer, home)], 1, now, home);
      expect(result.verifiedBy).toBe("Home Dean");
      expect(result.vpaaName).toBe("Mark Vpaa, DBM");
      expect(result.presidentName).toBe("KHAREN JANE S. UNGAB, DM");
    });

    it("keeps a different past VPAA and President on an old load", () => {
      const result = loadSheetSignatories([lent(older, home)], 1, now, home);
      expect(result.vpaaName).toBe("Former Vpaa");
      expect(result.presidentName).toBe("ATTY. FORMER PRESIDENT");
    });

    it("uses the home department's current officials when every class is lent", () => {
      const { vpaaUserId: _id, ...expected } = now;
      expect(loadSheetSignatories([lent(older, 5)], 1, now, home)).toEqual(expected);
    });
  });
});
