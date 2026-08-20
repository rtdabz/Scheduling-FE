import { describe, expect, it } from "vitest";
import {
  applyAdjustments,
  describeAdjustment,
  parseYearLevelFailure,
  type AdjustableSectionConfig,
  type GenerationAdjustment,
} from "./yearLevelGenerationFailure";

const config = (overrides: Partial<AdjustableSectionConfig> = {}): AdjustableSectionConfig => ({
  splitCourseIds: ["21"],
  gecSplitCourseIds: ["11"],
  gecSplitPatternsByCourseId: { "11": "MW" },
  modesByCourseId: { "31": "on-site" },
  ...overrides,
});

const adjustment = (overrides: Partial<GenerationAdjustment> = {}): GenerationAdjustment => ({
  type: "set_pattern",
  section_id: 5,
  course_id: 11,
  value: "TTh",
  section_name: "IT 1A",
  course_code: "GEC 101",
  ...overrides,
});

describe("parseYearLevelFailure", () => {
  it("reads the structured diagnostic report", () => {
    const parsed = parseYearLevelFailure({
      response: {
        data: {
          error_code: "year_level_generation_failed",
          message: "No timetable found.",
          stage: "search",
          blocking_constraints: [],
          bottleneck: { type: "fixed_pattern", section_id: 5, section_name: "IT 1A", course_id: 11, course_code: "GEC 101", detected_cause: "cause", iterations: 12, search_limit_reached: true },
          attempts: [{ strategy: "baseline", label: "Original configuration", description: "", outcome: "failed", section_id: 5, section_name: "IT 1A", iterations: 12, search_limit_reached: true }],
          recommendations: [{ id: "strategy-alternate_pattern", title: "t", detected_cause: "c", suggested_adjustment: "s", section_id: 5, section_name: "IT 1A", course_id: 11, course_code: "GEC 101", impact: "medium", adjustments: [adjustment()] }],
        },
      },
    });

    expect(parsed?.stage).toBe("search");
    expect(parsed?.bottleneck?.course_code).toBe("GEC 101");
    expect(parsed?.recommendations).toHaveLength(1);
    expect(parsed?.attempts[0].outcome).toBe("failed");
  });

  it("defaults a recommendation with no adjustments array to an empty list", () => {
    const parsed = parseYearLevelFailure({
      response: {
        data: {
          error_code: "year_level_generation_failed",
          stage: "feasibility",
          recommendations: [{ id: "feasibility-0", title: "t" }],
        },
      },
    });

    expect(parsed?.recommendations[0].adjustments).toEqual([]);
    expect(parsed?.blockingConstraints).toEqual([]);
  });

  it("presents a preflight rejection as advisory blocking constraints", () => {
    const parsed = parseYearLevelFailure({
      response: {
        data: {
          error_code: "schedule_generation_preflight_failed",
          message: "No eligible laboratory room is available.",
          issues: [{
            code: "missing_laboratory_room",
            message: "No eligible laboratory room is available for IT.",
            suggested_action: "Assign an available laboratory room.",
            section_id: 5,
            section_name: "IT 1A",
            context: { room_type: "laboratory" },
          }],
        },
      },
    });

    expect(parsed?.stage).toBe("feasibility");
    expect(parsed?.blockingConstraints[0].code).toBe("missing_laboratory_room");
    expect(parsed?.recommendations[0].title).toBe("Provide an available laboratory room");
    // Nothing here can be auto-applied, so Apply & Retry must stay unavailable.
    expect(parsed?.recommendations[0].adjustments).toEqual([]);
  });

  it("ignores errors that are not this endpoint's diagnostic report", () => {
    expect(parseYearLevelFailure({ response: { data: { message: "Unauthenticated." } } })).toBeNull();
    expect(parseYearLevelFailure({ code: "ECONNABORTED" })).toBeNull();
    expect(parseYearLevelFailure(null)).toBeNull();
  });
});

describe("applyAdjustments", () => {
  it("switches a fixed pattern without touching other sections", () => {
    const configs = { "5": config(), "6": config() };
    const { configs: next, applied } = applyAdjustments(configs, [adjustment()]);

    expect(applied).toHaveLength(1);
    expect(next["5"].gecSplitPatternsByCourseId["11"]).toBe("TTh");
    expect(next["6"]).toBe(configs["6"]);
    expect(configs["5"].gecSplitPatternsByCourseId["11"]).toBe("MW");
  });

  it("maps clear_pattern to the automatic day choice", () => {
    const { configs: next, applied } = applyAdjustments({ "5": config() }, [adjustment({ type: "clear_pattern", value: null })]);

    expect(applied).toHaveLength(1);
    expect(next["5"].gecSplitPatternsByCourseId["11"]).toBe("auto");
  });

  it("removes a course from the lecture/lab split selection", () => {
    const { configs: next } = applyAdjustments({ "5": config() }, [
      adjustment({ type: "disable_lecture_lab_split", course_id: 21, value: null }),
    ]);

    expect(next["5"].splitCourseIds).toEqual([]);
  });

  it("returns a forced delivery mode to automatic", () => {
    const { configs: next } = applyAdjustments({ "5": config() }, [
      adjustment({ type: "set_delivery_mode", course_id: 31, value: "automatic" }),
    ]);

    expect(next["5"].modesByCourseId["31"]).toBe("automatic");
  });

  it("reports nothing applied for no-op, unknown, and missing-section adjustments", () => {
    const configs = { "5": config() };

    expect(applyAdjustments(configs, [adjustment({ value: "MW" })]).applied).toEqual([]);
    expect(applyAdjustments(configs, [adjustment({ type: "explode" })]).applied).toEqual([]);
    expect(applyAdjustments(configs, [adjustment({ section_id: 99 })]).applied).toEqual([]);
    expect(applyAdjustments(configs, [adjustment({ type: "disable_lecture_lab_split", course_id: 404 })]).applied).toEqual([]);
    expect(applyAdjustments(configs, [adjustment()]).configs).not.toBe(configs);
  });

  it("applies several adjustments across sections in one pass", () => {
    const { configs: next, applied } = applyAdjustments(
      { "5": config(), "6": config() },
      [adjustment(), adjustment({ section_id: 6, value: "TTh" })],
    );

    expect(applied).toHaveLength(2);
    expect(next["5"].gecSplitPatternsByCourseId["11"]).toBe("TTh");
    expect(next["6"].gecSplitPatternsByCourseId["11"]).toBe("TTh");
  });
});

describe("describeAdjustment", () => {
  it("names the section and course for each adjustment type", () => {
    expect(describeAdjustment(adjustment())).toBe("GEC 101 in IT 1A: pattern set to TTh");
    expect(describeAdjustment(adjustment({ type: "clear_pattern" }))).toBe("GEC 101 in IT 1A: pattern set to Automatic");
    expect(describeAdjustment(adjustment({ type: "disable_lecture_lab_split" }))).toBe("GEC 101 in IT 1A: lecture/lab split turned off");
    expect(describeAdjustment(adjustment({ type: "set_delivery_mode", value: "automatic" }))).toBe("GEC 101 in IT 1A: mode set to Automatic");
  });

  it("falls back to ids when the report carries no labels", () => {
    expect(describeAdjustment({ type: "set_pattern", section_id: 5, course_id: 11, value: "MW" }))
      .toBe("course 11 in section 5: pattern set to MW");
  });
});
