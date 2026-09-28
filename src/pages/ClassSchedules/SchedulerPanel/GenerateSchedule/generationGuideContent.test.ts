import { describe, expect, it } from "vitest";
import {
  GENERATION_GUIDE,
  GUIDE_CHAPTER_FOR_STEP,
  searchGuide,
} from "./generationGuideContent";

describe("Generation Guide", () => {
  it("opens a real chapter for every wizard step", () => {
    const ids = new Set(GENERATION_GUIDE.map((chapter) => chapter.id));
    for (const id of Object.values(GUIDE_CHAPTER_FOR_STEP)) expect(ids.has(id)).toBe(true);
  });

  it("finds entries matching every word, grouped by chapter", () => {
    const results = searchGuide("required day");
    const terms = results.flatMap((result) => result.entries.map((entry) => entry.term));
    expect(terms).toContain("Required Day");
    expect(searchGuide("  ")).toEqual([]);
    expect(searchGuide("zzz-nothing")).toEqual([]);
  });
});
