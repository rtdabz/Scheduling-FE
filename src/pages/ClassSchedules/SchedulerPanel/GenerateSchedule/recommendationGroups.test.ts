import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  APPLY_ALL_RECOMMENDATION_ID,
  combineRecommendations,
  describeOption,
  groupRecommendations,
} from "./recommendationGroups";
import { isApplicableRecommendation, type GenerationAdjustment, type GenerationAttempt, type GenerationRecommendation } from "./yearLevelGenerationFailure";

const adjustment = (overrides: Partial<GenerationAdjustment> = {}): GenerationAdjustment => ({
  type: "clear_pattern",
  section_id: 1,
  course_id: 5,
  value: null,
  section_name: "BSIT 1A",
  course_code: "GEC 1",
  ...overrides,
});

const recommendation = (
  id: string,
  adjustments: GenerationAdjustment[],
  overrides: Partial<GenerationRecommendation> = {},
): GenerationRecommendation => ({
  id,
  title: id,
  detected_cause: "cause",
  suggested_adjustment: "",
  section_id: adjustments[0]?.section_id ?? null,
  section_name: adjustments[0]?.section_name ?? null,
  course_id: adjustments[0]?.course_id ?? null,
  course_code: adjustments[0]?.course_code ?? null,
  impact: "medium",
  adjustments,
  status: "active",
  resolved: false,
  ...overrides,
});

describe("server selection contract and stored-run compatibility", () => {
  const fixture = JSON.parse(readFileSync("../backend/tests/Fixtures/GenerationSelectionCases.json", "utf8")) as {
    attempts: Pick<GenerationAttempt, "strategy" | "outcome">[];
    cases: (Pick<GenerationRecommendation, "id" | "impact" | "adjustments" | "status"> & { expected: NonNullable<GenerationRecommendation["selection"]> })[];
    active_order: string[];
  };

  it.each([true, false])("uses the shared expected order with selection metadata: %s", (withSelection) => {
    const options = fixture.cases.map(({ expected, ...option }) => recommendation(option.id, option.adjustments, {
      ...option, selection: withSelection ? expected : undefined,
    }));
    const attempts = fixture.attempts.map((attempt) => ({ ...attempt, label: "", description: "", section_id: null,
      section_name: null, iterations: 0, search_limit_reached: false }));
    const grouped = groupRecommendations(options, withSelection ? [] : attempts);
    expect(grouped.groups[0].options.map((option) => option.recommendation.id)).toEqual(fixture.active_order);
    options.forEach((option, index) => expect(isApplicableRecommendation(option)).toBe(fixture.cases[index].expected.applicable));
    expect(grouped.groups[0].options.find((option) => option.recommendation.id === "strategy-tried")?.triedAlone).toBe(true);
  });

  it("honors server priority and guidance even when local impact would choose differently", () => {
    const preferred = recommendation("preferred", [adjustment()], { impact: "high",
      selection: { contract_version: 1, priority: 0, tried_alone: false, applicable: true } });
    const other = recommendation("other", [adjustment({ type: "disable_minor_split" })], { impact: "low",
      selection: { contract_version: 1, priority: 2, tried_alone: false, applicable: true } });
    const guidance = recommendation("guidance", [adjustment({ type: "enable_hybrid_split" })], {
      selection: { contract_version: 1, priority: -1, tried_alone: false, applicable: false } });
    const result = groupRecommendations([other, guidance, preferred]);
    expect(result.groups[0].options.map((option) => option.recommendation.id)).toEqual(["preferred", "other"]);
    expect(result.manual).toHaveLength(1);
    expect(isApplicableRecommendation({ ...preferred, adjustments: [adjustment({ type: "future_operation" })] })).toBe(false);
  });

  it("uses the legacy adapter for an unknown selection contract version", () => {
    const future = recommendation("future", [adjustment()], { impact: "high",
      selection: { contract_version: 99, priority: -1, tried_alone: true, applicable: false } });
    const old = recommendation("old", [adjustment({ type: "disable_minor_split" })], { impact: "low" });
    expect(groupRecommendations([future, old]).groups[0].options.map((option) => option.recommendation.id)).toEqual(["old", "future"]);
    expect(describeOption(future).triedAlone).toBe(false);
  });
});

describe("describeOption", () => {
  it("names each fix by what it changes", () => {
    const label = (id: string, overrides: Partial<GenerationAdjustment>) =>
      describeOption(recommendation(id, [adjustment(overrides)]));

    expect(label("recommend-hybrid-split-1-5", { type: "enable_hybrid_split" })).toMatchObject({
      label: "Hybrid Split",
      action: "Apply Hybrid Split",
    });
    // Online for a Split Session means both meetings.
    expect(label("recommend-online-split-1-5", { type: "set_delivery_mode", value: "online" })).toMatchObject({
      label: "Online (All)",
      action: "Apply Online (All)",
      effect: "Both meetings online, so no room is needed.",
    });
    expect(label("delivery-online", { type: "set_delivery_mode", value: "online" }).label).toBe("Online");
    expect(label("regular", { type: "disable_minor_split" }).action).toBe("Apply Regular");
    expect(label("pattern", { type: "set_pattern", value: "TTh" }).action).toBe("Apply TTh");
    expect(label("auto", { type: "clear_pattern" }).action).toBe("Apply Auto days");
    // Some fixes read better as a verb of their own.
    expect(label("day", { type: "add_preferred_day", course_id: 0, value: "Tuesday" }).action).toBe("Add Tuesday");
    expect(label("friday", { type: "enable_friday_saturday_split", course_id: 0 }).action).toBe("Allow Fri + Sat");
  });

  it("marks a fix the retry ladder already tried alone", () => {
    const tried = recommendation("strategy-clear_bottleneck_pattern", [adjustment()]);
    const attempt = (outcome: string) => ({
      strategy: "clear_bottleneck_pattern",
      label: "",
      description: "",
      outcome,
      section_id: 1,
      section_name: "BSIT 1A",
      iterations: 0,
      search_limit_reached: false,
    });

    expect(describeOption(tried, [attempt("failed")]).triedAlone).toBe(true);
    // Skipped for time is not tried.
    expect(describeOption(tried, [attempt("skipped_no_time")]).triedAlone).toBe(false);
  });

  it("counts the courses a section-wide fix changes", () => {
    const option = describeOption(recommendation("strategy-clear_section_patterns", [
      adjustment({ course_id: 5 }),
      adjustment({ course_id: 6 }),
    ]));

    expect(option.effect).toBe("The generator picks the two days. (2 courses)");
  });
});

describe("room-time options", () => {
  it("lists Hybrid Split and Online as choices of one fix, named by their own effect", () => {
    const acrossSections = (type: string, value: string | null) => [1, 2].flatMap((sectionId) =>
      [5, 6].map((courseId) => adjustment({ type, value, section_id: sectionId, course_id: courseId })));
    const hybrid = recommendation("room-capacity-hybrid_split", acrossSections("set_hybrid_split", null), {
      title: "Hybrid Split",
      suggested_adjustment: "GEC 1, GEC 2 meet once on campus and once online in every section: frees 12 room-slots (6 needed).",
    });
    const online = recommendation("room-capacity-online", acrossSections("set_delivery_mode", "online"), {
      title: "Online",
      suggested_adjustment: "GEC 1, GEC 2 meet online in every section: frees 24 room-slots (6 needed).",
    });

    const { groups } = groupRecommendations([hybrid, online]);

    expect(groups).toHaveLength(1);
    expect(groups[0].target).toBe("Free Room Time for This Year Level");
    expect(groups[0].options.map((option) => option.action)).toEqual(["Apply Hybrid Split", "Apply Online"]);
    // The effect names the courses; it is not suffixed with a class count.
    expect(groups[0].options[0].effect).toBe(hybrid.suggested_adjustment);
  });
});

describe("groupRecommendations", () => {
  const hybrid = recommendation("recommend-hybrid-split-1-5", [adjustment({ type: "enable_hybrid_split" })]);
  const online = recommendation("recommend-online-split-1-5", [adjustment({ type: "set_delivery_mode", value: "online" })]);
  const regular = recommendation("strategy-clear_bottleneck_balanced_split", [adjustment({ type: "disable_minor_split" })], { impact: "high" });

  it("puts alternatives for one class in one group, untried and least disruptive first", () => {
    const { groups } = groupRecommendations([regular, online, hybrid], [{
      strategy: "clear_bottleneck_balanced_split",
      label: "",
      description: "",
      outcome: "failed",
      section_id: 1,
      section_name: "BSIT 1A",
      iterations: 0,
      search_limit_reached: false,
    }]);

    expect(groups).toHaveLength(1);
    expect(groups[0].target).toBe("GEC 1 · BSIT 1A");
    expect(groups[0].options.map((option) => option.label)).toEqual(["Online (All)", "Hybrid Split", "Regular"]);
  });

  it("lists the bottleneck's class first and leaves its reason to the headline", () => {
    const other = recommendation("other", [adjustment({ section_id: 2, section_name: "BSIT 1B", course_id: 7, course_code: "GEC 2" })], {
      detected_cause: "GEC 2 is on a full pattern.",
    });
    const { groups } = groupRecommendations([other, hybrid], [], {
      section_id: 1,
      course_id: 5,
      detected_cause: "The headline.",
    });

    expect(groups.map((group) => group.target)).toEqual(["GEC 1 · BSIT 1A", "GEC 2 · BSIT 1B"]);
    expect(groups[0].reason).toBe("");
    expect(groups[1].reason).toBe("GEC 2 is on a full pattern.");
  });

  it("offers two fixes that make the same change once", () => {
    const section = recommendation("strategy-clear_section_patterns", [adjustment()]);
    const course = recommendation("strategy-clear_bottleneck_pattern", [adjustment()]);

    expect(groupRecommendations([section, course]).groups[0].options).toHaveLength(1);
  });

  it("merges the same advice repeated per section into one line", () => {
    const advice = (sectionId: number, sectionName: string) =>
      recommendation(`advice-${sectionId}`, [], {
        title: "Free up room-time",
        suggested_adjustment: "Delete stale drafts.",
        section_id: sectionId,
        section_name: sectionName,
      });

    const { groups, manual } = groupRecommendations([advice(1, "BSIT 1A"), advice(2, "BSIT 1B")]);

    expect(groups).toEqual([]);
    expect(manual).toHaveLength(1);
    expect(manual[0]).toMatchObject({ title: "Free up room-time", sectionNames: ["BSIT 1A", "BSIT 1B"] });
  });

  it("keeps resolved recommendations apart", () => {
    const { groups, resolved } = groupRecommendations([{ ...hybrid, resolved: true, status: "resolved" }]);

    expect(groups).toEqual([]);
    expect(resolved).toHaveLength(1);
  });
});

describe("combineRecommendations", () => {
  it("carries every chosen fix so conflicting selections can be rejected together", () => {
    const online = recommendation("recommend-online-split-1-5", [adjustment({ type: "set_delivery_mode", value: "online" })]);
    // A section-wide "Automatic mode" that also covers GEC 1 would undo it.
    const automatic = recommendation("strategy-clear_section_forced_modes", [
      adjustment({ type: "set_delivery_mode", value: "automatic" }),
      adjustment({ type: "set_delivery_mode", course_id: 6, value: "automatic" }),
    ]);
    const pattern = recommendation("strategy-clear_bottleneck_pattern", [adjustment({ type: "clear_pattern" })]);

    const combined = combineRecommendations([online, automatic, pattern]);

    expect(combined.id).toBe(APPLY_ALL_RECOMMENDATION_ID);
    expect(combined.title).toBe("3 recommendations");
    expect(combined.adjustments.map((item) => [item.type, item.course_id, item.value])).toEqual([
      ["set_delivery_mode", 5, "online"],
      ["set_delivery_mode", 5, "automatic"],
      ["set_delivery_mode", 6, "automatic"],
      // Days and delivery are separate decisions, so both land.
      ["clear_pattern", 5, null],
    ]);
  });
});
