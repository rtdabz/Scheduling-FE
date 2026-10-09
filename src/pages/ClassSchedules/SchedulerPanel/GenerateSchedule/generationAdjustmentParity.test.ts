import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyAdjustments, applyYearLevelAdjustments, type GenerationAdjustment } from "./yearLevelGenerationFailure";

type Config = {
  course_ids: number[];
  is_hybrid: boolean;
  selected_split_session_course_ids: number[];
  balanced_split_course_ids: number[];
  hybrid_split_course_ids: number[];
  preferred_patterns: Record<string, string>;
  delivery_modes_by_course_id: Record<string, string>;
  allowed_days: string[] | null;
  allow_friday_saturday_split: boolean;
};
const fixtures = JSON.parse(readFileSync("../backend/tests/Fixtures/GenerationAdjustmentCases.json", "utf8")) as {
  base: Config;
  cases: { name: string; initial: Partial<Config>; adjustments: GenerationAdjustment[]; expected: Partial<Config>; error: boolean }[];
};

describe("fixed server/frontend adjustment parity", () => {
  it.each(fixtures.cases)("$name", (fixture) => {
    const base = { ...fixtures.base, ...fixture.initial };
    const input = { "5": {
      courseIds: base.course_ids.map(String),
      splitCourseIds: base.selected_split_session_course_ids.map(String),
      gecSplitCourseIds: base.balanced_split_course_ids.map(String),
      hybridSplitCourseIds: base.hybrid_split_course_ids.map(String),
      gecSplitPatternsByCourseId: { ...base.preferred_patterns },
      modesByCourseId: { ...base.delivery_modes_by_course_id },
    } };
    const original = structuredClone(input);
    if (fixture.error) {
      expect(() => applyAdjustments(input, fixture.adjustments)).toThrow();
      expect(input).toEqual(original);
      return;
    }
    const { configs } = applyAdjustments(input, fixture.adjustments);
    const { settings } = applyYearLevelAdjustments({ preferredDays: base.allowed_days ?? [], allowFridaySaturdaySplit: base.allow_friday_saturday_split }, fixture.adjustments);
    const next = configs["5"];
    const actual = {
      ...base,
      is_hybrid: next.splitCourseIds.length > 0,
      selected_split_session_course_ids: next.splitCourseIds.map(Number),
      balanced_split_course_ids: next.gecSplitCourseIds.map(Number),
      hybrid_split_course_ids: next.hybridSplitCourseIds.map(Number),
      preferred_patterns: Object.fromEntries(Object.entries(next.gecSplitPatternsByCourseId).filter(([, pattern]) => pattern !== "auto")),
      delivery_modes_by_course_id: Object.fromEntries(Object.entries(next.modesByCourseId).filter(([, mode]) => mode !== "automatic")),
      allowed_days: settings.preferredDays.length === 0 || settings.preferredDays.length === 7 ? null : settings.preferredDays,
      allow_friday_saturday_split: settings.allowFridaySaturdaySplit,
    };
    expect(actual).toEqual({ ...base, ...fixture.expected });
    expect(input).toEqual(original);
  });
  it("requires year-level changes to cover every scoped section", () => {
    const config = { courseIds: ["11"], splitCourseIds: [], gecSplitCourseIds: ["11"], hybridSplitCourseIds: [], gecSplitPatternsByCourseId: {}, modesByCourseId: {} };
    const configs = { "5": config, "6": config };
    const change: GenerationAdjustment = { type: "add_preferred_day", section_id: 5, course_id: 0, value: "Tuesday" };
    expect(() => applyAdjustments(configs, [change])).toThrow("every configured section");
    expect(() => applyAdjustments(configs, [change, { ...change, section_id: 6 }])).not.toThrow();
    expect(() => applyAdjustments({ "5": config }, [{ ...change, course_id: 11 }])).toThrow("scope");
  });
});
