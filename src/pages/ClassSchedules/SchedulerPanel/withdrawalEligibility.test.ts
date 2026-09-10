import { describe, expect, it } from "vitest";
import { isDepartmentSectionWithdrawable } from "./constants";

describe("department withdrawal eligibility", () => {
  it.each([
    "submitted",
    "approved_by_dean",
    "conditionally_approved",
    "approved",
    "faculty_assignment",
  ] as const)("allows %s sections", (status) => {
    expect(isDepartmentSectionWithdrawable(status)).toBe(true);
  });

  it("allows reassignment after every instructor is cleared and the handoff is open", () => {
    expect(isDepartmentSectionWithdrawable("reassignment", 0, false)).toBe(true);
  });

  it("keeps reassignment protected while an instructor remains assigned", () => {
    expect(isDepartmentSectionWithdrawable("reassignment", 1, false)).toBe(false);
  });

  it("keeps reassignment protected after the instructor handoff is completed", () => {
    expect(isDepartmentSectionWithdrawable("reassignment", 0, true)).toBe(false);
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
