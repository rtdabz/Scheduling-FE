import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarkSectionsDoneModal from "./MarkSectionsDoneModal";
import type { SectionDoneCandidate } from "../types";

afterEach(cleanup);

const candidate = (overrides: Partial<SectionDoneCandidate>): SectionDoneCandidate => ({
  sectionId: "a",
  sectionName: "BSIT 1A",
  yearLevel: 1,
  requiredSubjects: 6,
  plottedSubjects: 6,
  scheduleIds: [1, 2, 3],
  isReady: true,
  blockedReason: "",
  ...overrides,
});

describe("MarkSectionsDoneModal", () => {
  it("keeps the plotting wording by default", () => {
    render(<MarkSectionsDoneModal candidates={[candidate({})]} selectedSectionId="a" isMarking={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Mark sections done" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark 1 Done" })).toBeTruthy();
  });

  it("finalizes every pre-checked ready section in one go and leaves blocked ones out", () => {
    const onConfirm = vi.fn();
    render(
      <MarkSectionsDoneModal
        variant="finalize"
        candidates={[
          candidate({ sectionId: "a", sectionName: "BSIT 1A" }),
          candidate({ sectionId: "b", sectionName: "BSIT 1B" }),
          candidate({ sectionId: "c", sectionName: "BSIT 1C", isReady: false, plottedSubjects: 4, blockedReason: "2 meetings still need an instructor" }),
        ]}
        selectedSectionId="a"
        isMarking={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Finalize sections" })).toBeTruthy();
    expect(screen.getByText(/4\/6 classes have an instructor · 2 meetings still need an instructor/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Finalize 2" }));
    expect(onConfirm).toHaveBeenCalledWith(["a", "b"]);
  });

  it("pre-ticks only the open section for reassignment, so reopening every section takes a deliberate choice", () => {
    const onConfirm = vi.fn();
    render(
      <MarkSectionsDoneModal
        variant="reassign"
        candidates={[
          candidate({ sectionId: "a", sectionName: "BSIT 1A", requiredSubjects: 6, plottedSubjects: 6 }),
          candidate({ sectionId: "b", sectionName: "BSIT 1B" }),
        ]}
        selectedSectionId="b"
        isMarking={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Reassign sections" })).toBeTruthy();
    expect(screen.getAllByText(/6 classes finalized · 3 meetings will reopen for reassignment/)).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Reassign 1" }));
    expect(onConfirm).toHaveBeenCalledWith(["b"]);
  });
});
