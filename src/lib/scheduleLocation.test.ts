import { describe, expect, it } from "vitest";
import { scheduleLocationLabel } from "./scheduleLocation";

describe("scheduleLocationLabel", () => {
  it("does not call a roomless online schedule Room TBA", () => {
    expect(scheduleLocationLabel("online")).toBe("Online");
  });

  it("keeps a roomless on-site laboratory as Room TBA", () => {
    expect(scheduleLocationLabel("on-site", null, "laboratory")).toBe("Room TBA");
  });

  it("uses physical room codes when assigned", () => {
    expect(scheduleLocationLabel("on-site", "CompLab1", "laboratory")).toBe("CompLab1");
  });

  it("recognizes virtual room metadata when mode is absent", () => {
    expect(scheduleLocationLabel(null, null, "online")).toBe("Online");
  });
});
