import { describe, expect, it } from "vitest";
import { INSTRUCTOR_ASSIGNABLE_STATUSES } from "./types";

describe("instructor assignment workflow statuses", () => {
  it("keeps reassignment available to instructor assignment workflows", () => {
    expect(INSTRUCTOR_ASSIGNABLE_STATUSES).toEqual([
      "approved",
      "faculty_assignment",
      "reassignment",
    ]);
  });
});
