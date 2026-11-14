import { afterEach, describe, expect, it, vi } from 'vitest';
import api from './api';
import { changedResetPreview, confirmScheduleReset, previewScheduleReset, resetConfirmationSummary, type ScheduleResetPreview } from './scheduleReset';

const preview = (overrides: Partial<ScheduleResetPreview['counts']> = {}): ScheduleResetPreview => ({
  semester: { id: 4, academic_year: '2026-2027', semester: '1st' },
  sections: [{ id: 11, name: 'BSIT 1A', year_level: 1, schedules: 3 }, { id: 12, name: 'BSIT 1B', year_level: 1, schedules: 1 }],
  counts: { schedules: 4, classes: 3, meeting_splits: 2, archived_meeting_splits: 1, instructor_assignments: 1, cross_department_instructor_assignments: 0, ...overrides },
  token: 'a'.repeat(64),
});

afterEach(() => vi.restoreAllMocks());

describe('schedule reset client', () => {
  it('sends only the semester and selected sections, then the reviewed token', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: preview() });
    await previewScheduleReset(4, [11, 12]);
    expect(post).toHaveBeenLastCalledWith('/schedules/reset/preview', { semester_id: 4, section_ids: [11, 12] });
    await confirmScheduleReset(preview());
    expect(post).toHaveBeenLastCalledWith('/schedules/reset', { semester_id: 4, section_ids: [11, 12], expected_token: 'a'.repeat(64) });
    expect(post.mock.calls.some(([url]) => String(url).includes('/schedules/batch'))).toBe(false);
  });

  it('summarizes the semester, section count, server counts, and cross-department releases', () => {
    const summary = resetConfirmationSummary(preview({ cross_department_instructor_assignments: 1 }));
    expect(summary.message).toBe('You are about to reset 3 classes across 2 sections for the 1st Semester, AY 2026-2027. This action cannot be undone.');
    expect(summary.crossDepartmentNote).toContain('another department will be released');
    expect(summary.changedNote).toBeNull();
    expect(resetConfirmationSummary(preview()).crossDepartmentNote).toBeNull();
    expect(resetConfirmationSummary(preview(), true).changedNote).toMatch(/^The schedules changed since you reviewed them/);
  });

  it('recognizes only a 409 changed-target response as a refreshed review', () => {
    const refreshed = preview({ schedules: 5 });
    expect(changedResetPreview({ response: { status: 409, data: { code: 'reset_target_changed', preview: refreshed } } })).toBe(refreshed);
    expect(changedResetPreview({ response: { status: 422, data: { code: 'reset_protected' } } })).toBeNull();
    expect(changedResetPreview({ response: { status: 409, data: { code: 'reset_busy' } } })).toBeNull();
    expect(changedResetPreview(new Error('network'))).toBeNull();
  });
});
