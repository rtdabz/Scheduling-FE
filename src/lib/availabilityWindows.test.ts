import { describe, expect, it } from "vitest";
import { coveredContinuously } from "./availabilityWindows";

describe("coveredContinuously", () => {
  it("accepts a meeting inside a single window", () => {
    expect(coveredContinuously([[480, 720]], 540, 660)).toBe(true);
  });

  it("accepts a meeting spanning back-to-back windows, in any order", () => {
    expect(coveredContinuously([[600, 720], [480, 600]], 540, 660)).toBe(true);
  });

  it("refuses a meeting across a gap between windows", () => {
    expect(coveredContinuously([[480, 600], [630, 720]], 540, 660)).toBe(false);
  });

  it("refuses a meeting with no window at all", () => {
    expect(coveredContinuously([], 540, 660)).toBe(false);
  });

  it("refuses a meeting that starts before the first window", () => {
    expect(coveredContinuously([[480, 720]], 450, 540)).toBe(false);
  });
});
