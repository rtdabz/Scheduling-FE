import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DraftIssuesPanel from "./DraftIssuesPanel";
import { applyDraftOptions, stillUnplaced, type DraftIssue, type DraftOption } from "./draftReview";
import type { ApiScheduleRecord } from "../types";

const row = (sectionId: number, courseId: number, day: string): ApiScheduleRecord => ({
  id: `${sectionId}-${courseId}-${day}`,
  semester_id: 1,
  department_id: 1,
  section_id: sectionId,
  course_id: courseId,
  room_id: 5,
  day,
  start_time: "08:00",
  end_time: "09:30",
  mode: "on-site",
  status: "draft",
});

const option = (key: string, rank: number, rows: ApiScheduleRecord[]): DraftOption => ({
  id: `${key}:${rank}`,
  rank,
  score: 70 - rank,
  summary: `Option ${rank} for ${key}`,
  reasons: ["Within regular class hours"],
  rows,
});

const issue = (sectionId: number, courseId: number, code: string, options: DraftOption[]): DraftIssue => ({
  key: `${sectionId}:${courseId}`,
  kind: "conflict",
  section_id: sectionId,
  section_name: "IT 1A",
  course_id: courseId,
  course_code: code,
  course_name: "",
  problems: ["Section already has an overlapping class."],
  options,
});

afterEach(cleanup);

describe("draft review helpers", () => {
  it("replaces only the rows of the courses an option fixes", () => {
    const draft = [row(1, 10, "Monday"), row(1, 10, "Wednesday"), row(1, 11, "Monday")];
    const fixed = applyDraftOptions(draft, [option("1:11", 1, [row(1, 11, "Tuesday")])]);

    expect(fixed.filter((r) => r.course_id === 10)).toHaveLength(2);
    expect(fixed.filter((r) => r.course_id === 11).map((r) => r.day)).toEqual(["Tuesday"]);
  });

  it("treats an unplaced course as placed once the draft holds its rows", () => {
    const unplaced = [
      { section_id: 1, section_name: "IT 1A", course_id: 12, course_code: "GEC 1", reason: "", meetings: [] },
      { section_id: 1, section_name: "IT 1A", course_id: 13, course_code: "GEC 2", reason: "", meetings: [] },
    ];

    expect(stillUnplaced(unplaced, [row(1, 12, "Friday")]).map((c) => c.course_id)).toEqual([13]);
  });
});

describe("DraftIssuesPanel", () => {
  const issues = [
    issue(1, 10, "IT 101", [option("1:10", 1, [row(1, 10, "Tuesday")]), option("1:10", 2, [row(1, 10, "Friday")])]),
    issue(1, 11, "IT 102", [option("1:11", 1, [row(1, 11, "Thursday")]), option("1:11", 2, [row(1, 11, "Saturday")])]),
  ];

  it("collects one fix per course and applies them together", () => {
    const onApply = vi.fn();
    render(<DraftIssuesPanel issues={issues} reviewing={false} onApply={onApply} onRetry={vi.fn()} />);

    expect(Boolean(screen.getByText("2 courses need attention"))).toBeTruthy();
    const apply = screen.getByRole("button", { name: /Apply 0 approved changes/ });
    expect((apply as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Approve best for all/ }));
    fireEvent.click(screen.getByRole("button", { name: /Apply 2 approved changes/ }));

    expect(onApply).toHaveBeenCalledWith([issues[0].options[0], issues[1].options[0]]);
  });

  it("lets a course's fix be chosen individually", () => {
    const onApply = vi.fn();
    render(<DraftIssuesPanel issues={issues} reviewing={false} onApply={onApply} onRetry={vi.fn()} />);

    // The first course is open; pick its second option.
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[1]);
    fireEvent.click(screen.getByRole("button", { name: /Apply 1 approved change$/ }));

    expect(onApply).toHaveBeenCalledWith([issues[0].options[1]]);
  });

  it("drops a choice once a new review no longer reports its course", () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <DraftIssuesPanel issues={issues} reviewing={false} onApply={onApply} onRetry={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Approve best for all/ }));

    rerender(<DraftIssuesPanel issues={[issues[1]]} reviewing={false} onApply={onApply} onRetry={vi.fn()} />);

    expect(Boolean(screen.getByText("1 course needs attention"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Apply 1 approved change$/ }));
    expect(onApply).toHaveBeenCalledWith([issues[1].options[0]]);
  });

  it("groups courses by section and approves a whole section at once", () => {
    const onApply = vi.fn();
    const other = { ...issue(2, 12, "IT 103", [option("2:12", 1, [row(2, 12, "Monday")])]), section_name: "IT 1B" };
    render(<DraftIssuesPanel issues={[...issues, other]} reviewing={false} onApply={onApply} onRetry={vi.fn()} />);

    expect(Boolean(screen.getByRole("region", { name: "IT 1A courses" }))).toBeTruthy();
    expect(Boolean(screen.getByRole("region", { name: "IT 1B courses" }))).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Approve best for IT 1B" }));
    fireEvent.click(screen.getByRole("button", { name: /Apply 1 approved change$/ }));

    expect(onApply).toHaveBeenCalledWith([other.options[0]]);
  });

  it("never approves two courses into the same hour", () => {
    const onApply = vi.fn();
    // Both courses are offered Tuesday 8:00 first: the review checks each
    // against the draft alone, not against the other's approval.
    const shared = [
      issue(1, 10, "GEC 1", [option("1:10", 1, [row(1, 10, "Tuesday")]), option("1:10", 2, [row(1, 10, "Friday")])]),
      issue(1, 11, "GEE 1", [option("1:11", 1, [row(1, 11, "Tuesday")]), option("1:11", 2, [row(1, 11, "Saturday")])]),
    ];
    render(<DraftIssuesPanel issues={shared} reviewing={false} onApply={onApply} onRetry={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Approve best for all/ }));
    fireEvent.click(screen.getByRole("button", { name: /Apply 2 approved changes/ }));
    expect(onApply).toHaveBeenCalledWith([shared[0].options[0], shared[1].options[1]]);

    // Opened, the other course's Tuesday option says who holds it.
    fireEvent.click(screen.getByRole("button", { name: /GEE 1/ }));
    const taken = screen.getByRole("button", { name: "Taken by GEC 1" }) as HTMLButtonElement;
    expect(taken.disabled).toBe(true);
  });

  it("shows nothing once no course needs attention", () => {
    const { container } = render(
      <DraftIssuesPanel issues={[]} reviewing={false} onApply={vi.fn()} onRetry={vi.fn()} />,
    );

    expect(container.innerHTML).toBe("");
  });
});
