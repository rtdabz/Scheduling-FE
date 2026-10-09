import { describe, expect, it, vi } from "vitest";
import api from "../../../../lib/api";
import { applyDraftOptions, fetchDraftReview, type DraftOption } from "./draftReview";
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
