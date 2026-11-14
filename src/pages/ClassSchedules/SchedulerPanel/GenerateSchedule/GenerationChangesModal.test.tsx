import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GenerationChangesPanel from "./GenerationChangesPanel";
import { parseChangeDetail, type GenerationChange } from "./generationChanges";

const item = (section: number, course: string, detail: string) => ({
  section_id: section,
  section_name: `BSIT 3${String.fromCharCode(64 + section)}`,
  course_id: section * 100,
  course_code: course,
  detail,
});

const changes: GenerationChange[] = [
  {
    kind: "lecture_moved_online",
    severity: "warning",
    title: "Lecture moved online",
    description: "",
    status: "resolved",
    resolved: true,
    items: [item(2, "IT 127", "Scheduled online: no lecture room was available (Monday)")],
  },
  {
    kind: "room_tba",
    severity: "critical",
    title: "Room to be assigned",
    description: "These in-person classes still need a room.",
    items: Array.from({ length: 6 }, (_, i) => item(i + 1, `IT 12${i}`, "TBA (Tuesday)")),
  },
];

describe("parseChangeDetail", () => {
  it("separates result, reason and day", () => {
    expect(parseChangeDetail("Scheduled online: no lecture room was available (Monday)")).toEqual({
      result: "Scheduled online",
      reason: "no lecture room was available",
      day: "Monday",
    });
    expect(parseChangeDetail("TBA (Friday)")).toEqual({ result: "TBA", reason: null, day: "Friday" });
    expect(parseChangeDetail("Room TBA (Friday)")).toEqual({ result: "TBA", reason: null, day: "Friday" });
    expect(parseChangeDetail("Pattern set (MW)")).toEqual({ result: "Pattern set (MW)", reason: null, day: null });
  });
});

describe("GenerationChangesPanel", () => {
  it("opens one modal with categories, resolution details and searchable records", () => {
    const onFocusClass = vi.fn();
    render(<GenerationChangesPanel summary="Generated" changes={changes} onFocusClass={onFocusClass} />);

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /View Changes \(7\)/ }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("How this was resolved")).toBeTruthy();
    expect(within(dialog).getByText("no lecture room was available")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("tab", { name: /Room to be assigned/ }));
    expect(within(dialog).queryByText("How this was resolved")).toBeNull();
    expect(within(dialog).getByText("These in-person classes still need a room.")).toBeTruthy();

    fireEvent.change(within(dialog).getByRole("searchbox"), { target: { value: "IT 123" } });
    expect(within(dialog).getAllByRole("button", { name: /Show/ })).toHaveLength(1);

    fireEvent.click(within(dialog).getByRole("button", { name: /Show/ }));
    expect(onFocusClass).toHaveBeenCalledWith(expect.objectContaining({ course_code: "IT 123" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
