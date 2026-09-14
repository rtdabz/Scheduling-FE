import { describe, expect, it } from "vitest";
import { isDepartmentSectionWithdrawable } from "./constants";

describe("department recall eligibility", () => {
  it.each([
    "submitted",
    "approved_by_dean",
    "conditionally_approved",
    "approved",
    "faculty_assignment",
  ] as const)("allows %s sections", (status) => {
    expect(isDepartmentSectionWithdrawable(status)).toBe(true);
  });

  // Recalling releases the section's instructors, so reassignment qualifies
  // whether or not instructors -- including a delegated college's -- remain.
  it.each([
    [0, false],
    [1, false],
    [0, true],
  ] as const)("allows reassignment with %i instructor blocks (handoff done: %s)", (blocks, done) => {
    expect(isDepartmentSectionWithdrawable("reassignment", blocks, done)).toBe(true);
  });

  it.each([
    "draft",
    "completed",
    "revision",
    "finalized",
  ] as const)("does not select %s sections for Withdraw All", (status) => {
    expect(isDepartmentSectionWithdrawable(status)).toBe(false);
  });
});
