import { describe, expect, it } from "vitest";
import { buildPlacementSessionKey } from "./placementSession";
import type { DropContext } from "../types";

/**
 * Guards the fix for audit finding #6: the placement-modal init effect keyed on
 * `schedules`, so a background refresh landing mid-edit reset every field the
 * user had touched. It is now keyed on the session identity below.
 */

const context = (overrides: Partial<DropContext> = {}): DropContext => ({
  courseId: "11",
  subjectId: "11",
  dayIndex: 0,
  startSlot: 2,
  isRescheduling: false,
  ...overrides,
});

describe("buildPlacementSessionKey", () => {
  it("returns null when no placement is open", () => {
    expect(buildPlacementSessionKey(null, "10")).toBeNull();
  });

  it("is stable for the same session", () => {
    const first = buildPlacementSessionKey(context(), "10");
    const second = buildPlacementSessionKey(context(), "10");

    expect(first).toBe(second);
  });

  it("is unaffected by anything outside the session identity", () => {
    // The effect must not re-run because schedules, rooms or faculties changed —
    // none of them feed the key.
    const before = buildPlacementSessionKey(context(), "10");
    const after = buildPlacementSessionKey({ ...context() }, "10");

    expect(after).toBe(before);
  });

  it.each([
    ["a different cell", context({ dayIndex: 3 }), "10"],
    ["a different start slot", context({ startSlot: 8 }), "10"],
    ["a different course", context({ subjectId: "12", courseId: "12" }), "10"],
    ["a different section", context(), "11"],
    ["switching to edit", context({ isRescheduling: true, scheduleId: "500" }), "10"],
  ])("changes for %s", (_label, next, sectionId) => {
    expect(buildPlacementSessionKey(next, sectionId))
      .not.toBe(buildPlacementSessionKey(context(), "10"));
  });

  it("distinguishes two edits of different schedules for the same course and cell", () => {
    const first = buildPlacementSessionKey(context({ isRescheduling: true, scheduleId: "500" }), "10");
    const second = buildPlacementSessionKey(context({ isRescheduling: true, scheduleId: "501" }), "10");

    expect(first).not.toBe(second);
  });

  it("falls back to courseId when subjectId is absent", () => {
    const withoutSubjectId = { ...context() } as DropContext;
    delete (withoutSubjectId as { subjectId?: string }).subjectId;

    expect(buildPlacementSessionKey(withoutSubjectId, "10")).toContain("11");
  });
});
