import { describe, expect, it } from "vitest";
import { SUBMISSION_MILESTONES, submissionProgress } from "./submissionStage";

describe("submissionProgress", () => {
  it("keeps a draft department at the first milestone", () => {
    expect(submissionProgress(0)).toEqual({ at: 0, done: 0, isReturned: false, isComplete: false });
  });

  it("treats ready-to-submit as still drafting, because nothing has been sent", () => {
    expect(submissionProgress(1)).toEqual({ at: 0, done: 0, isReturned: false, isComplete: false });
  });

  it("moves a submitted department past drafting", () => {
    expect(submissionProgress(2)).toEqual({ at: 1, done: 1, isReturned: false, isComplete: false });
  });

  it("sends a returned department back to drafting instead of forward", () => {
    const returned = submissionProgress(3);
    expect(returned.at).toBe(0);
    expect(returned.done).toBe(0);
    expect(returned.isReturned).toBe(true);
    // The bug this replaces: 'Returned by Dean' sat at index 3 of 6, one step
    // short of approval, with everything before it ticked.
    expect(returned.at).toBeLessThan(submissionProgress(2).at);
  });

  it("ticks drafting and submission once the Dean approves", () => {
    expect(submissionProgress(4)).toEqual({ at: 2, done: 2, isReturned: false, isComplete: false });
  });

  it("ticks every milestone once the VPAA approves", () => {
    expect(submissionProgress(5)).toEqual({
      at: SUBMISSION_MILESTONES.length - 1,
      done: SUBMISSION_MILESTONES.length,
      isReturned: false,
      isComplete: true,
    });
  });

  it("never reports more milestones done than exist", () => {
    SUBMISSION_MILESTONES.forEach((_, stage) => {
      expect(submissionProgress(stage).done).toBeLessThanOrEqual(SUBMISSION_MILESTONES.length);
    });
    expect(submissionProgress(5).done).toBe(SUBMISSION_MILESTONES.length);
  });

  it("clamps a stage index outside the list rather than reading past its end", () => {
    expect(submissionProgress(99)).toEqual(submissionProgress(5));
    expect(submissionProgress(-4)).toEqual(submissionProgress(0));
    expect(submissionProgress(Number.NaN)).toEqual(submissionProgress(0));
  });
});
