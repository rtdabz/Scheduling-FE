import { describe, expect, it } from "vitest";
import {
  changeBadgeLabel,
  changeBadgesByClass,
  classKey,
  resolveGenerationChanges,
  type GenerationChange,
} from "./generationChanges";

const change = (overrides: Partial<GenerationChange>): GenerationChange => ({
  kind: "lecture_moved_online",
  severity: "warning",
  title: "Lecture moved online",
  description: "",
  items: [{ section_id: 1, section_name: "BSIT 1A", course_id: 10, course_code: "GEC 1", detail: "Scheduled online" }],
  ...overrides,
});

describe("resolveGenerationChanges", () => {
  it("uses the server report when present, even when it is empty", () => {
    expect(
      resolveGenerationChanges({
        generation_changes: [],
        applied_strategy: { key: "alternate_pattern", label: "Alternate pattern", description: "", impact: "medium" },
        applied_adjustments: [{ type: "set_pattern", section_id: 1, course_id: 10, value: "TTh" }],
      }),
    ).toEqual([]);
  });

  it("rebuilds a report for runs stored before the server produced one", () => {
    const changes = resolveGenerationChanges({
      applied_strategy: { key: "alternate_pattern", label: "Alternate pattern", description: "Tried TTh.", impact: "medium" },
      applied_adjustments: [
        { type: "set_pattern", section_id: 1, course_id: 10, value: "TTh", section_name: "BSIT 1A", course_code: "GEC 1" },
        { type: "split_session_single_meeting_fallback", section_id: 2, course_id: 11, value: "single_meeting" },
      ],
    });

    expect(changes?.map((item) => item.kind)).toEqual(["preference_relaxed", "split_session_single_meeting"]);
    expect(changes?.[0].items[0].detail).toBe("pattern set to TTh");
    expect(changes?.[1].items[0].section_name).toBe("Section 2");
  });

  it("treats an older run without a report or adjustments as unknown, not unchanged", () => {
    expect(resolveGenerationChanges(null)).toBeNull();
    expect(resolveGenerationChanges({ applied_strategy: null, applied_adjustments: [] })).toBeNull();
  });
});

describe("changeBadgesByClass", () => {
  it("collects each kind once per class", () => {
    const online = change({});
    const tba = change({
      kind: "room_tba",
      items: [
        { section_id: 1, section_name: "BSIT 1A", course_id: 10, course_code: "GEC 1", detail: "Room TBA" },
        { section_id: 1, section_name: "BSIT 1A", course_id: 10, course_code: "GEC 1", detail: "Room TBA" },
      ],
    });

    const badges = changeBadgesByClass([online, tba]).get(classKey(1, 10)) ?? [];

    expect(badges.map(changeBadgeLabel)).toEqual(["Moved online", "Room TBA"]);
  });
});
