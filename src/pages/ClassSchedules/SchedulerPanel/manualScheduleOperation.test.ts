import { describe, expect, it } from "vitest";
import { resolveManualOperationStatus } from "./manualScheduleOperation";

describe("manual schedule operation status", () => {
  it("starts newly placed Major and Minor course rows as draft", () => {
    expect(resolveManualOperationStatus(undefined)).toBe("draft");
    expect(resolveManualOperationStatus(null)).toBe("draft");
  });

  it("preserves the workflow status when updating an existing row", () => {
    expect(resolveManualOperationStatus("revision")).toBe("revision");
  });
});
