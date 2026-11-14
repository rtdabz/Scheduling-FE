import { describe, expect, it, vi } from "vitest";
import api from "../../../../lib/api";
import {
  applyDraftOptions,
  componentRequiredDaysContext,
  componentRequiredDaysPayload,
  fetchDraftReview,
  optionsClash,
  pickBestOptions,
  type DraftIssue,
  type DraftOption,
} from "./draftReview";
import type { ApiScheduleRecord } from "../types";

vi.mock("../../../../lib/api", () => ({ default: { post: vi.fn() } }));

describe("draft complete-group recommendations", () => {
  it("passes request-local run details back to draft review", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { issues: [] } });
    const rule = { day_count: 3, meeting_days: ["Tuesday", "Wednesday", "Thursday"] };
    await fetchDraftReview({ semesterId: 1, departmentId: 2, sectionIds: [3], rows: [], preferredDays: null,
      unplaced: [{ section_id: 3, section_name: "IT 1A", course_id: 4, course_code: "IT 101", reason: "No complete run",
        consecutive_rule: rule, meetings: [{ duration_slots: 8, meeting_type: null, modes: ["on-site"] }] }],
    });
    expect(vi.mocked(api.post).mock.calls.at(-1)?.[1]).toMatchObject({ unplaced: [{ consecutive_rule: rule }] });
  });

  it("stages every reviewed meeting and preserves unrelated classes", () => {
    const row = (courseId: number, day: string): ApiScheduleRecord => ({
      id: `${courseId}-${day}`, status: "draft",
      semester_id: 1, department_id: 2, section_id: 3, course_id: courseId, day,
      start_time: "08:30", end_time: "10:00", mode: "on-site", room_id: 5,
      preferred_pattern: "consecutive:3", split_group_id: `group-${courseId}`,
    });
    const before = [row(4, "Monday"), row(4, "Tuesday"), row(4, "Wednesday"), row(6, "Friday")];
    const reviewed = [row(4, "Tuesday"), row(4, "Wednesday"), row(4, "Thursday")];
    const option: DraftOption = { id: "3:4:1", rank: 1, score: 80, summary: "Complete run", reasons: [], rows: reviewed };
    const result = applyDraftOptions(before, [option]);
    expect(result).toEqual([before[3], ...reviewed]);
    expect(before).toHaveLength(4);
    expect(result.slice(1)).toEqual(option.rows);
  });
});

describe("Lecture and Laboratory Required Days context", () => {
  it("sends the run's component days to review, and nothing when there are none", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { issues: [] } });
    const request = { semesterId: 1, departmentId: 2, sectionIds: [3], rows: [], preferredDays: null, unplaced: [] };

    await fetchDraftReview({ ...request, componentRequiredDays: { "3": { "4": { lecture: "Monday", laboratory: "Thursday" } } } });
    expect(vi.mocked(api.post).mock.calls.at(-1)?.[1]).toMatchObject({
      section_configs: [{ section_id: 3, component_required_days_by_course_id: { 4: { lecture: "Monday", laboratory: "Thursday" } } }],
    });

    await fetchDraftReview(request);
    expect(vi.mocked(api.post).mock.calls.at(-1)?.[1]).not.toHaveProperty("section_configs");
  });

  it("drops automatic components and excluded courses from a request", () => {
    expect(componentRequiredDaysPayload(
      { "4": { lecture: "Monday", laboratory: "" }, "5": { lecture: "" }, "6": { laboratory: "Friday" } },
      (courseId) => courseId !== "6",
    )).toEqual({ 4: { lecture: "Monday" } });
    expect(componentRequiredDaysContext({ "3": { "5": {} } })).toEqual({});
    expect(componentRequiredDaysContext(null)).toEqual({});
  });
});

describe("draft option selection with shared online slots", () => {
  const online = (sectionId: number, courseId: number, extra: Partial<ApiScheduleRecord> = {}): ApiScheduleRecord => ({
    id: `${sectionId}-${courseId}`, status: "draft",
    semester_id: 1, department_id: 2, section_id: sectionId, course_id: courseId, day: "Monday",
    start_time: "08:00", end_time: "09:30", mode: "online", room_id: null, ...extra,
  });
  const option = (id: string, rows: ApiScheduleRecord[]): DraftOption => ({ id, rank: 1, score: 80, summary: "", reasons: [], rows });
  const issue = (key: string, options: DraftOption[]): DraftIssue => ({
    key, kind: "unplaced", section_id: 0, section_name: "", course_id: 4, course_code: "IT 101", course_name: "", problems: [], options,
  });

  it("lets other sections take the same online course at the same time", () => {
    expect(optionsClash(option("a", [online(3, 4)]), option("b", [online(5, 4)]))).toBe(false);

    const picks = pickBestOptions([
      issue("3:4", [option("3:4:1", [online(3, 4)])]),
      issue("5:4", [option("5:4:1", [online(5, 4)]), option("5:4:2", [online(5, 4, { day: "Tuesday" })])]),
    ]);
    expect(picks).toEqual({ "3:4": "3:4:1", "5:4": "5:4:1" });
  });

  it("still keeps a section or instructor from being double-booked online", () => {
    expect(optionsClash(option("a", [online(3, 4)]), option("b", [online(3, 6)]))).toBe(true);
    expect(optionsClash(
      option("a", [online(3, 4, { faculty_id: 9 })]),
      option("b", [online(5, 4, { faculty_id: 9 })]),
    )).toBe(true);

    const picks = pickBestOptions([
      issue("3:4", [option("3:4:1", [online(3, 4, { faculty_id: 9 })])]),
      issue("5:4", [option("5:4:1", [online(5, 4, { faculty_id: 9 })]), option("5:4:2", [online(5, 4, { faculty_id: 9, day: "Tuesday" })])]),
    ]);
    expect(picks).toEqual({ "3:4": "3:4:1", "5:4": "5:4:2" });
  });
});
