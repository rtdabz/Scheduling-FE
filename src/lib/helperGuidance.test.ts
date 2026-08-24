import { describe, expect, it } from "vitest";
import { getHelperReply, type HelperContext } from "./helperGuidance";

const context = (overrides: Partial<HelperContext> = {}): HelperContext => ({
  role: "secretary",
  route: "/secretary/dashboard",
  ...overrides,
});

describe("getHelperReply", () => {
  it("guides a secretary to finish remaining draft sections", () => {
    const reply = getHelperReply("What should I do next?", context({ draftCount: 2 }));
    expect(reply.intent).toBe("next_step");
    expect(reply.text).toContain("2 remaining draft sections");
    expect(reply.action?.path).toBe("/secretary/schedules");
  });

  it("guides a program head to the correct role route", () => {
    const reply = getHelperReply("Help with a conflict", context({ role: "program_head" }));
    expect(reply.action?.path).toBe("/program_head/schedules");
  });

  it("guides a dean to the approval workspace", () => {
    const reply = getHelperReply("What should I do next?", context({ role: "dean" }));
    expect(reply.action?.path).toBe("/dean/schedules/approval");
  });

  it("moves approved schedules to instructor assignment", () => {
    const reply = getHelperReply("What is next?", context({ scheduleStatus: "approved" }));
    expect(reply.text).toContain("instructor assignment");
    expect(reply.action?.path).toBe("/secretary/instructor-assignment");
  });

  it("refuses coding and unrelated prompts", () => {
    expect(getHelperReply("Write a Laravel controller", context()).intent).toBe("unsupported");
    expect(getHelperReply("What is the capital of France?", context()).intent).toBe("unsupported");
  });
});
