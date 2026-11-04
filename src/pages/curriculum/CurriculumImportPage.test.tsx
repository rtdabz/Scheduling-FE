import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ImportSettings, ValidationResult } from '../../lib/curriculumImport/types';

const { service } = vi.hoisted(() => ({
  service: { getSettings: vi.fn(), updateSettings: vi.fn(), validate: vi.fn(), commit: vi.fn() },
}));
vi.mock('../../services/curriculum/curriculumImportService', () => ({ curriculumImportService: service }));
vi.mock('../../lib/api', () => ({ default: { get: vi.fn(async () => ({ data: [{ id: 7, code: 'BSIT', name: 'Information Technology', department_id: 1 }] })) } }));
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }, confirm: vi.fn(async () => true) }),
}));
// PDF.js does not run in jsdom; the recorded TCC text items stand in for the real extraction.
vi.mock('../../lib/curriculumImport/adapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/curriculumImport/adapters')>();
  const { extractCurriculumLayout } = await import('../../lib/curriculumImport/pdfLayout');
  const { default: fixture } = await import('../../lib/curriculumImport/__fixtures__/tcc_bsit_pdf_text.json');
  return { ...actual, extractPdf: vi.fn(async () => extractCurriculumLayout(fixture.pages as never)) };
});

import fixture from '../../lib/curriculumImport/__fixtures__/tcc_bsit_pdf_text.json';
import { extractPdf } from '../../lib/curriculumImport/adapters';
import { extractCurriculumLayout } from '../../lib/curriculumImport/pdfLayout';
import CurriculumImportPage from './CurriculumImportPage';

const settings: ImportSettings = {
  department_id: 1, revision: 4, lecture_minutes_per_unit: 60, laboratory_minutes_per_unit: 180,
  slot_minutes: 30, max_minutes_per_unit: 600,
  can_manage: false, rules: [], overlaps: [],
};

const resolvedRow = (row_id: string, code: string, title: string, action: 'create' | 'reuse'): ValidationResult['rows'][number] => ({
  row_id, code, title, year_level: 1, semester: 1, lecture_units: 2, lab_units: 1, total_credits: 3, category: 'major',
  rule: { id: 1, match_kind: 'prefix', match_value: code.split(' ')[0], category: 'major' },
  catalog: action === 'reuse'
    ? { action, course_id: 40, course: { id: 40, code, title: 'Understanding  the self', lecture_units: 2, lab_units: 1, total_units: 3, category: 'major', status: 'active' } }
    : { action, course_id: null, course: null },
  scheduling_basis: 'weekly', total_hours: null, lecture_minutes: 120, laboratory_minutes: 180, weekly_contact_minutes: 300,
});

/** A server check of the two-course CSV: a notice always; an error when not valid. */
const validation = (valid: boolean): ValidationResult => ({
  valid,
  fingerprint: valid ? 'f'.repeat(64) : 'e'.repeat(64),
  settings_revision: 4,
  settings: { lecture_minutes_per_unit: 60, laboratory_minutes_per_unit: 180 },
  metadata: { code: 'BSIT-2026', program_id: null },
  counts: { errors: valid ? 0 : 1, notices: 1, warnings: 0 },
  issues: [
    ...(valid ? [] : [{ key: 'catalog_credit_mismatch:r1', code: 'catalog_credit_mismatch', severity: 'error' as const, row_id: 'r1', field: 'total_units', message: 'IT 101 already exists with other credits.' }]),
    { key: 'group_total_unreported:1-1', code: 'group_total_unreported', severity: 'notice', row_id: null, field: null, message: 'Year 1, First Semester has no printed total to cross-check.' },
  ],
  changes: [
    { row_id: 'r1', code: 'IT 101', field: 'title', original: 'Introduction to Computing', draft: null, imported: 'Intro to Computing', kind: 'correction', flags: [], formatting: false, note: null },
    { row_id: 'r2', code: 'GEC 1', field: 'title', original: 'Understanding the Self', draft: null, imported: 'Understanding  the self', kind: 'catalog', flags: [], formatting: true, note: 'Existing course reused unchanged: its catalog title is kept.' },
  ],
  rows: [resolvedRow('r1', 'IT 101', 'Intro to Computing', 'create'), resolvedRow('r2', 'GEC 1', 'Understanding the Self', 'reuse')],
  groups: [],
  totals: { calculated: { lec: 4, lab: 1, tu: 5 }, reported_sum: null, row_count: 2, populated_groups: 1 },
});

const csv = 'Year Level,Term,Course Code,Course Title,Lec Units,Lab Units,Total Units,Prerequisites\n1,First Semester,IT 101,Introduction to Computing,2,1,3,none\n1,First Semester,GEC 1,Understanding the Self,2,0,2,IT 101\n';

// jsdom's Blob lacks arrayBuffer(); browsers provide it.
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(this);
    });
  };
}

beforeEach(() => {
  sessionStorage.setItem('user', JSON.stringify({ role: 'secretary', department_id: 1, permissions: ['curriculum.manage'] }));
  service.getSettings.mockResolvedValue(settings);
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('curriculum import page', () => {
  it('reviews the validated outcome and imports with one confirmation and no reasons', async () => {
    render(<MemoryRouter><CurriculumImportPage /></MemoryRouter>);
    await screen.findByRole('button', { name: /import settings/i });

    const input = document.getElementById('curriculum-import-file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([csv], 'bsit.csv', { type: 'text/csv' })] } });

    await screen.findByRole('button', { name: /^Curriculum details/ });
    // The details start closed; the summary beside the button shows the code.
    expect(screen.queryByLabelText(/curriculum name/i)).toBeNull();
    expect(screen.getByText('Assigned automatically')).toBeDefined();
    // The table is read-only until its single Edit button unlocks every row; Done locks it again.
    expect(screen.queryByLabelText('Code for r1')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Edit IT 101/ })).toBeNull();
    expect(screen.getByLabelText('2 lecture plus 1 laboratory equals 3 total units')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Edit table/ }));
    expect((screen.getByLabelText('Code for r1') as HTMLInputElement).value).toBe('IT 101');
    expect((screen.getByLabelText('Code for r2') as HTMLInputElement).value).toBe('GEC 1');
    fireEvent.change(screen.getByLabelText('Lecture units for r1'), { target: { value: '' } });
    expect(screen.getByText('Blank unit')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Done editing/ }));
    expect(screen.queryByLabelText('Code for r1')).toBeNull();
    expect(screen.getByLabelText('Has values to fix')).toBeDefined();
    expect(screen.getByLabelText('blank lecture plus 1 laboratory equals 3 total units')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Edit table/ }));
    fireEvent.change(screen.getByLabelText('Lecture units for r1'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Done editing/ }));
    expect(screen.getByLabelText('2 lecture plus 1 laboratory equals 3 total units')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^Curriculum details/ }));
    expect((screen.getByLabelText(/^program$/i) as HTMLSelectElement).value).toBe('');
    fireEvent.change(screen.getByLabelText(/curriculum name/i), { target: { value: 'BSIT 2026' } });
    fireEvent.change(screen.getByLabelText(/effective school year/i), { target: { value: '2026-2027' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByRole('button', { name: /Preview/ }).getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('button', { name: /Upload & extract.*completed/ })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Import\s*Review and confirm/ }));
    const counts = () => screen.getByTestId('issue-badges').textContent;
    expect(counts()).toBe('Not validated');
    expect(screen.getByText('Validate the whole draft to generate the review.')).toBeDefined();
    expect(screen.getByText('Import is blocked: validate the draft first.')).toBeDefined();
    service.validate.mockResolvedValueOnce(validation(false));
    fireEvent.click(screen.getByRole('button', { name: /^validate$/i }));
    // An error still blocks; results are summarised, not opened automatically.
    await waitFor(() => expect(counts()).toBe('1 error1 notice'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Import is blocked: 1 error to correct.')).toBeDefined();
    const confirm = () => screen.getByRole('button', { name: 'Confirm and import' }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    expect(confirm().getAttribute('aria-describedby')).toBe('import-blocker');
    expect(service.validate.mock.calls[0][0]).not.toHaveProperty('acknowledgements');
    expect(service.validate.mock.calls[0][0]).not.toHaveProperty('confirmed');
    expect(service.validate.mock.calls[0][0].metadata).not.toHaveProperty('code');
    const sentRows = service.validate.mock.calls[0][0].rows;
    expect(sentRows.map((row: { code: string; semester: number }) => [row.code, row.semester])).toEqual([['IT 101', 1], ['GEC 1', 1]]);
    expect(sentRows.map((row: { prerequisites: string | null }) => row.prerequisites)).toEqual(['none', 'IT 101']);

    // Notices are listed for the review; nothing asks for a reason or a per-item approval.
    fireEvent.click(screen.getByRole('button', { name: 'View issues' }));
    const results = screen.getByRole('dialog', { name: 'Validation results' });
    expect(results.textContent).toContain('Shown in the review');
    expect(results.textContent).not.toMatch(/reason|have a reason|accept/i);
    expect(results.querySelectorAll('input, [type="checkbox"]')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    service.validate.mockResolvedValueOnce(validation(true));
    fireEvent.click(screen.getByRole('button', { name: /^validate$/i }));
    await waitFor(() => expect(confirm().disabled).toBe(false));
    expect(counts()).toBe('1 noticeReady to review');
    expect(screen.queryByText(/Import is blocked/)).toBeNull();

    // The review is generated from the server's result: what is created, reused, changed, and noticed.
    expect(screen.getByRole('heading', { name: 'Review and import' })).toBeDefined();
    expect(screen.getByLabelText('Assigned internal code').textContent).toBe('BSIT-2026');
    const courses = screen.getByRole('region', { name: 'Courses' });
    expect(courses.textContent).toContain('2 courses: 1 new, 1 existing course reused unchanged');
    const table = screen.getByRole('table', { name: 'Changes from the document' });
    expect(Array.from(table.querySelectorAll('tbody tr'), (row) => Array.from(row.children, (cell) => cell.textContent?.replace(/^(Course|Field|Original|Will be imported):/, '')))).toEqual([
      ['IT 101', 'Title', 'Introduction to Computing', 'Intro to Computing'],
    ]);
    // A reused course's catalog title is kept, and a spacing-only difference sits under Information.
    const information = screen.getByRole('table', { name: 'Formatting-only differences' });
    expect(information.textContent).toContain('Existing course reused unchanged: its catalog title is kept.');
    expect(screen.getByRole('region', { name: 'Notices (1)' }).textContent).toContain('no printed total');
    expect(screen.queryByPlaceholderText(/reason/i)).toBeNull();

    // An edit after validation makes the review out of date and blocks the confirmation.
    fireEvent.click(screen.getByRole('button', { name: /^Preview/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Curriculum details/ }));
    fireEvent.change(screen.getByLabelText(/curriculum name/i), { target: { value: 'BSIT 2026 rev' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: /Import\s*Review and confirm/ }));
    expect(confirm().disabled).toBe(true);
    expect(screen.getByText(/The draft changed after the last check/)).toBeDefined();
    expect(screen.queryByRole('table', { name: 'Changes from the document' })).toBeNull();
    service.validate.mockResolvedValueOnce(validation(true));
    fireEvent.click(screen.getByRole('button', { name: /^validate$/i }));
    await waitFor(() => expect(confirm().disabled).toBe(false));

    service.commit.mockResolvedValueOnce({
      curriculum: { id: 12, name: 'BSIT 2026', code: 'BSIT-2026', cmo_number: null, cmo_series: null, program_id: null, effective_school_year: '2026-2027', status: 'deactivated' },
      import_id: 3, created_count: 2, reused_count: 0, rows: [], groups: [],
      totals: { calculated: { lec: 4, lab: 1, tu: 5 }, reported_sum: null, row_count: 2, populated_groups: 1 },
      confirmation: { user_id: 5, user_name: 'Registrar Reyes', confirmed_at: '2026-11-03T08:00:00+08:00', fingerprint: 'f'.repeat(64) },
      changes: validation(true).changes, notices: [], replayed: false,
    });
    fireEvent.click(confirm());
    await screen.findByText('Curriculum imported');
    expect(screen.getByText(/Confirmed by Registrar Reyes/)).toBeDefined();
    expect(screen.queryByText(/Reasons recorded/)).toBeNull();

    const committed = service.commit.mock.calls[0][0];
    expect(committed).toMatchObject({ fingerprint: 'f'.repeat(64), expected_settings_revision: 4, confirmed: true, source: { format: 'csv', filename: 'bsit.csv' } });
    expect(committed).not.toHaveProperty('acknowledgements');
    expect(committed.request_key).toMatch(/^[A-Za-z0-9-]{8,}$/);
    expect(committed.source.sha256).toMatch(/^[a-f0-9]{64}$/);
  // Drives the whole four-step flow; under a full parallel run it can exceed the default 5 s.
  }, 20_000);

  it('previews the 59-course PDF one term at a time while validating the whole draft', async () => {
    // jsdom lacks the layout APIs issue navigation uses in browsers.
    Element.prototype.scrollIntoView = vi.fn();
    window.matchMedia ??= vi.fn(() => ({ matches: false })) as never;
    globalThis.CSS ??= { escape: (value: string) => value } as never;
    render(<MemoryRouter><CurriculumImportPage /></MemoryRouter>);
    await screen.findByRole('button', { name: /import settings/i });
    const input = document.getElementById('curriculum-import-file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'tcc.pdf')] } });

    const firstYear = await screen.findByRole('tab', { name: /^First Year: 12 courses/ });
    const rowIds = () => [...document.querySelectorAll('[data-row-id]')].map((row) => row.getAttribute('data-row-id'));
    expect(firstYear.getAttribute('aria-selected')).toBe('true');
    const semester = () => screen.getByLabelText('Semester') as HTMLSelectElement;
    const option = (text: RegExp) => [...semester().options].find((candidate) => text.test(candidate.textContent ?? ''))!;
    expect(semester().value).toBe('1');
    expect(option(/^First semester \(6\)/).selected).toBe(true);
    expect(rowIds()).toHaveLength(6);
    expect(screen.queryByRole('tab', { name: /^Unassigned/ })).toBeNull();
    expect(screen.getByText('CMO-25-2015')).toBeDefined();
    expect(screen.getByText('Proposed')).toBeDefined();

    // One tab stop per row; arrows, Home and End select, skipping nothing that exists.
    firstYear.focus();
    fireEvent.keyDown(firstYear, { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^Second Year: 19 courses/);
    expect(screen.getByRole('tab', { name: /^Second Year/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(screen.getByRole('tab', { name: /^Fourth Year/ }).getAttribute('aria-selected')).toBe('true');
    expect(option(/^Summer \(not in source\)/).disabled).toBe(true);
    expect(option(/^First semester \(5\)/).selected).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(firstYear.getAttribute('aria-selected')).toBe('true');

    // Third Year, Second Semester keeps the printed-versus-calculated discrepancy visible.
    fireEvent.click(screen.getByRole('tab', { name: /^Third Year/ }));
    expect(option(/^Second semester \(10, printed total differs\)/)).toBeDefined();
    fireEvent.change(semester(), { target: { value: '2' } });
    expect(rowIds()).toHaveLength(10);
    expect(screen.getByText('30 units')).toBeDefined();
    expect(screen.getByText(/printed 27, differs/)).toBeDefined();

    // A correction survives switching tabs; the source value stays on record.
    const edited = rowIds()[0]!;
    fireEvent.click(screen.getByRole('button', { name: /Edit table/ }));
    const codeInput = screen.getByLabelText(`Code for ${edited}`) as HTMLInputElement;
    const original = codeInput.value;
    codeInput.focus();
    fireEvent.change(codeInput, { target: { value: 'IT 999' } });
    // Typing must not remount the cell under the cursor.
    expect(document.activeElement).toBe(codeInput);
    fireEvent.click(screen.getByRole('tab', { name: /^First Year/ }));
    fireEvent.click(screen.getByRole('tab', { name: /^Third Year/ }));
    fireEvent.change(semester(), { target: { value: '2' } });
    expect((screen.getByLabelText(`Code for ${edited}`) as HTMLInputElement).value).toBe('IT 999');
    fireEvent.click(screen.getByRole('button', { name: /Done editing/ }));

    // An error on another term is reachable from the whole-draft summary.
    const issueRow = 'r7';
    service.validate.mockResolvedValueOnce({
      ...validation(false),
      metadata: { code: 'CMO-25-2015-2', program_id: null },
      counts: { errors: 1, notices: 0, warnings: 0 },
      issues: [{ key: `catalog:${issueRow}`, code: 'catalog_mismatch', severity: 'error', row_id: issueRow, field: 'code', message: 'The catalog has this code with other units.' }],
    });
    fireEvent.click(screen.getByRole('button', { name: /^validate$/i }));
    await screen.findByText('CMO-25-2015-2');
    const sent = service.validate.mock.calls[0][0];
    expect(sent.rows).toHaveLength(59);
    expect(sent.rows.find((row: { row_id: string }) => row.row_id === edited)).toMatchObject({ code: 'IT 999', source: { code: original } });
    expect(screen.getByRole('tab', { name: /^First Year: 12 courses, 1 with errors/ })).toBeDefined();

    expect(screen.getByTestId('issue-counts').textContent).toBe('1 error');
    fireEvent.click(screen.getByRole('button', { name: /^Validation results/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Show course' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(semester().value).toBe('2');
    expect(screen.getByRole('heading', { name: 'First Year, Second Semester' })).toBeDefined();
    expect(rowIds()).toContain(issueRow);
    await waitFor(() => expect(document.activeElement?.closest('[data-row-id]')?.getAttribute('data-row-id')).toBe(issueRow));

    // A metadata edit after the check drops the confirmed code back to a proposal.
    fireEvent.click(screen.getByRole('button', { name: /^Curriculum details/ }));
    expect(screen.getByLabelText('Internal code').textContent).toBe('CMO-25-2015-2');
    expect(screen.getByText('Checked')).toBeDefined();
    fireEvent.change(screen.getByLabelText('CMO number'), { target: { value: '26' } });
    expect(screen.getByLabelText('Internal code').textContent).toBe('CMO-26-2015');
    expect(screen.queryByText('Checked')).toBeNull();
  }, 20_000);

  it('keeps unassigned and moved courses reachable and pairs the CMO fields', async () => {
    render(<MemoryRouter><CurriculumImportPage /></MemoryRouter>);
    await screen.findByRole('button', { name: /import settings/i });
    const rows = [
      '1,First Semester,IT 101,Introduction to Computing,2,1,3,none',
      '1,First Semester,GEC 1,Understanding the Self,2,0,2,',
      '1,Second Semester,IT 102,Programming,2,1,3,IT 101',
      ',First Semester,IT 103,Orphan Course,3,0,3,',
    ];
    const input = document.getElementById('curriculum-import-file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([`${csv.split('\n')[0]}\n${rows.join('\n')}\n`], 'mixed.csv', { type: 'text/csv' })] } });

    await screen.findByRole('tab', { name: /^First Year: 3 courses/ });
    const rowIds = () => [...document.querySelectorAll('[data-row-id]')].map((row) => row.getAttribute('data-row-id'));
    expect(rowIds()).toEqual(['r1', 'r2']);
    fireEvent.click(screen.getByRole('tab', { name: /^Unassigned: 1 courses/ }));
    expect(rowIds()).toEqual(['r4']);
    expect(screen.getByRole('heading', { name: 'Unassigned courses' })).toBeDefined();

    // Configure keeps the Unassigned view; returning keeps it too.
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Configure' }));
    expect(screen.getByRole('tab', { name: /^Unassigned/ }).getAttribute('aria-selected')).toBe('true');
    expect(rowIds()).toEqual(['r4']);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('tab', { name: /^Unassigned/ }).getAttribute('aria-selected')).toBe('true');

    // Placing the row announces where it went; the emptied tab stays until the reviewer leaves it.
    fireEvent.click(screen.getByRole('button', { name: /Edit table/ }));
    fireEvent.change(screen.getByLabelText('Year for r4'), { target: { value: '2' } });
    expect(screen.getAllByRole('status').some((status) => /IT 103 moved to Second Year, First Semester\./.test(status.textContent ?? ''))).toBe(true);
    expect(screen.getByRole('tab', { name: /^Unassigned: 0 courses/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Every course has a year and term.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Open Second Year, First Semester' }));
    expect(rowIds()).toEqual(['r4']);
    expect(screen.queryByRole('tab', { name: /^Unassigned/ })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /^First Year/ }));
    fireEvent.change(screen.getByLabelText('Term for r1'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Term for r2'), { target: { value: '2' } });
    expect(screen.getByText(/No courses in this term/)).toBeDefined();
    const semester = screen.getByLabelText('Semester') as HTMLSelectElement;
    expect(semester.value).toBe('1');
    expect([...semester.options].map((candidate) => candidate.textContent)).toEqual(['First semester (0)', 'Second semester (3)', 'Summer (not in source)']);

    fireEvent.click(screen.getByRole('button', { name: /View all courses/ }));
    expect(rowIds()).toEqual(['r1', 'r2', 'r3', 'r4']);
    fireEvent.click(screen.getByRole('button', { name: /Back to terms/ }));
    expect((screen.getByLabelText('Semester') as HTMLSelectElement).value).toBe('1');

    // Missing required details are flagged outside the closed dialog; Fix opens it at the field.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /Needs correction/ })).toBeDefined();
    fireEvent.click(screen.getAllByRole('button', { name: 'Fix' })[0]);
    expect(screen.getByRole('dialog', { name: 'Curriculum details' })).toBeDefined();
    expect(document.activeElement?.id).toBe('import-details-name');
    expect(document.activeElement?.getAttribute('aria-describedby')).toBe('import-details-name-error');
    fireEvent.change(screen.getByLabelText(/curriculum name/i), { target: { value: 'BSIT 2026' } });
    fireEvent.change(screen.getByLabelText(/effective school year/i), { target: { value: '2026-2027' } });
    expect(screen.getByLabelText('Internal code').textContent).toBe('Assigned automatically');
    expect(screen.queryByRole('button', { name: /Needs correction/ })).toBeNull();

    // Half a CMO is an error; Escape closes without losing anything, and Fix returns to the missing field.
    fireEvent.change(screen.getByLabelText('CMO number'), { target: { value: '25' } });
    expect(document.getElementById('import-details-cmo_series-error')?.textContent).toBe('Enter the CMO series too, or clear both CMO fields.');
    expect(screen.getByLabelText('Series').getAttribute('aria-invalid')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /Needs correction/ })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Fix' }));
    expect(document.activeElement?.id).toBe('import-details-cmo_series');
    expect((screen.getByLabelText('CMO number') as HTMLInputElement).value).toBe('25');
    expect((screen.getByLabelText(/curriculum name/i) as HTMLInputElement).value).toBe('BSIT 2026');
    fireEvent.change(screen.getByLabelText('Series'), { target: { value: '2015' } });
    expect(screen.getByLabelText('Internal code').textContent).toBe('CMO-25-2015');

    // The close button and the overlay keep edits too, and focus returns to the opener.
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    expect(screen.queryByRole('button', { name: /Needs correction/ })).toBeNull();
    expect(screen.getByText('CMO-25-2015')).toBeDefined();
    const opener = screen.getByRole('button', { name: /^Curriculum details/ });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    expect((screen.getByLabelText('Series') as HTMLInputElement).value).toBe('2015');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(document.activeElement).toBe(opener);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  }, 20_000);

  it('configures one term at a time, scoping filters and bulk edits to the visible rows', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    window.matchMedia ??= vi.fn(() => ({ matches: false })) as never;
    globalThis.CSS ??= { escape: (value: string) => value } as never;
    render(<MemoryRouter><CurriculumImportPage /></MemoryRouter>);
    await screen.findByRole('button', { name: /import settings/i });
    const rows = [
      '1,First Semester,IT 101,Introduction to Computing,2,1,3,',
      '1,First Semester,GEC 1,Understanding the Self,3,0,3,',
      '1,First Semester,NSTP 1,Civic Welfare Training,3,0,3,',
      '1,Second Semester,IT 102,Computer Programming,2,1,3,IT 101',
    ];
    const input = document.getElementById('curriculum-import-file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([`${csv.split('\n')[0]}\n${rows.join('\n')}\n`], 'configure.csv', { type: 'text/csv' })] } });
    await screen.findByRole('tab', { name: /^First Year: 4 courses/ });
    fireEvent.click(screen.getByRole('button', { name: /^Curriculum details/ }));
    fireEvent.change(screen.getByLabelText(/curriculum name/i), { target: { value: 'BSIT 2026' } });
    fireEvent.change(screen.getByLabelText(/effective school year/i), { target: { value: '2026-2027' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    const rowIds = () => [...document.querySelectorAll('[data-row-id]')].map((row) => row.getAttribute('data-row-id'));
    const semester = () => screen.getByLabelText('Semester') as HTMLSelectElement;
    const category = (code: string) => (screen.getByLabelText(`Category for ${code}`) as HTMLSelectElement).value;
    const resolvedRow = (row_id: string, code: string, semesterValue: 1 | 2, rule: 'major' | 'minor' | null) => ({
      row_id, code, title: code, year_level: 1, semester: semesterValue, lecture_units: 2, lab_units: 1, total_credits: 3, category: null,
      rule: rule && { id: 1, match_kind: 'prefix' as const, match_value: code.split(' ')[0], category: rule },
      catalog: { action: 'create' as const, course_id: null, course: null },
      scheduling_basis: 'weekly' as const, total_hours: null, lecture_minutes: 120, laboratory_minutes: 180, weekly_contact_minutes: 300,
    });
    service.validate.mockResolvedValueOnce({
      ...validation(false),
      counts: { errors: 1, notices: 0, warnings: 0 },
      issues: [{ key: 'unclassified:r4', code: 'unclassified', severity: 'error', row_id: 'r4', field: 'category', message: 'IT 102 matches no classification rule.' }],
      rows: [resolvedRow('r1', 'IT 101', 1, 'major'), resolvedRow('r2', 'GEC 1', 1, 'minor'), resolvedRow('r3', 'NSTP 1', 1, null), resolvedRow('r4', 'IT 102', 2, 'major')],
    });
    fireEvent.click(screen.getByRole('button', { name: /^validate$/i }));
    await waitFor(() => expect(service.validate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('issue-counts').textContent).toBe('1 error'));

    // Forward keeps the term; the rail is gone and the term's own status counts show.
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Configure' }));
    expect(screen.getByRole('heading', { name: 'Configure categories and class time' })).toBeDefined();
    expect(screen.queryByRole('navigation', { name: 'Curriculum terms' })).toBeNull();
    expect(semester().value).toBe('1');
    expect(rowIds()).toEqual(['r1', 'r2', 'r3']);
    expect(screen.getByRole('button', { name: /^All\s*3$/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /^By rule\s*2$/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /^Needs category\s*1$/ })).toBeDefined();
    expect(document.querySelector('[data-row-id="r1"]')?.textContent).toContain('2 h lec, 3 h lab');

    // A classification issue on a hidden term opens that term in Configure, clears the filter, and focuses its category.
    fireEvent.click(screen.getByRole('button', { name: /^By rule/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Validation results/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Show course' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Configure categories and class time' })).toBeDefined();
    expect(semester().value).toBe('2');
    expect(screen.getByRole('button', { name: /^All/ }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Category for IT 102'));
    fireEvent.change(semester(), { target: { value: '1' } });

    // Select all and bulk actions reach only the filtered, visible rows.
    fireEvent.click(screen.getByRole('button', { name: /^Needs category/ }));
    expect(rowIds()).toEqual(['r3']);
    fireEvent.click(screen.getByLabelText('Select all courses in this view'));
    expect(screen.getByText('1 selected')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Major' }));
    // The edit makes the check stale; the active filter stays visible rather than silently hiding rows.
    expect(screen.getByRole('button', { name: /^Needs category\s*0$/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    expect(category('NSTP 1')).toBe('major');
    expect(category('IT 101')).toBe('');
    expect(category('GEC 1')).toBe('');

    // Selections never survive a change of filter, term, or step.
    fireEvent.click(screen.getByLabelText('Select IT 101'));
    expect(screen.getByText('1 selected')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^Not checked/ }));
    expect(screen.getByText('Select courses to set their category together.')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Select IT 101'));
    fireEvent.change(semester(), { target: { value: '2' } });
    expect(screen.getByText('Select courses to set their category together.')).toBeDefined();
    expect(screen.getByRole('button', { name: /^All/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByLabelText('Category for IT 102'), { target: { value: 'minor' } });
    fireEvent.click(screen.getByLabelText('Select IT 102'));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(semester().value).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Configure' }));
    expect(screen.getByText('Select courses to set their category together.')).toBeDefined();
    expect(category('IT 102')).toBe('minor');

    // View all is kept across steps as an explicit choice.
    fireEvent.click(screen.getByRole('button', { name: /View all courses/ }));
    expect(rowIds()).toEqual(['r1', 'r2', 'r3', 'r4']);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(rowIds()).toEqual(['r1', 'r2', 'r3', 'r4']);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Configure' }));
    expect(screen.getByRole('button', { name: /Back to terms/ })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Back to terms/ }));
    expect(semester().value).toBe('2');

    // Validate from a single term still sends every row with its configured category.
    service.validate.mockResolvedValueOnce(validation(true));
    fireEvent.click(screen.getByRole('button', { name: /^validate$/i }));
    await waitFor(() => expect(service.validate).toHaveBeenCalledTimes(2));
    const sent = service.validate.mock.calls[1][0].rows.map((row: { row_id: string; category: string | null }) => [row.row_id, row.category]);
    expect(sent).toEqual([['r1', null], ['r2', null], ['r3', 'major'], ['r4', 'minor']]);
  }, 20_000);

  it('locks a program head to their program, with the details reachable from Configure', async () => {
    sessionStorage.setItem('user', JSON.stringify({ role: 'program_head', department_id: 1, program_id: 7, permissions: ['curriculum.manage'] }));
    render(<MemoryRouter><CurriculumImportPage /></MemoryRouter>);
    await screen.findByRole('button', { name: /import settings/i });
    const input = document.getElementById('curriculum-import-file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([csv], 'bsit.csv', { type: 'text/csv' })] } });
    await screen.findByRole('button', { name: /^Curriculum details/ });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Configure' }));
    expect(screen.getByRole('heading', { name: 'Configure categories and class time' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^Curriculum details/ }));
    const programSelect = screen.getByLabelText(/^program$/i) as HTMLSelectElement;
    expect(programSelect.value).toBe('7');
    expect(programSelect.disabled).toBe(true);
    expect(screen.getByText('Program heads import into their own program.')).toBeDefined();
  });

  it('lists local problems before validation and hands off to details or a term without stacking dialogs', async () => {
    render(<MemoryRouter><CurriculumImportPage /></MemoryRouter>);
    await screen.findByRole('button', { name: /import settings/i });
    const input = document.getElementById('curriculum-import-file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([csv], 'bsit.csv', { type: 'text/csv' })] } });
    await screen.findByRole('button', { name: /^Validation results/ });

    // Browser-found problems are counted once and never presented as a server check.
    const counts = () => screen.getByTestId('issue-counts').textContent;
    expect(counts()).toBe('2 errorsfound in your browser, not validated');
    fireEvent.click(screen.getByRole('button', { name: /^Validation results/ }));
    expect(screen.getByText('Not validated. The draft problems below were found in your browser.')).toBeDefined();
    expect(screen.getByRole('heading', { name: /Draft problems/ })).toBeDefined();
    expect(screen.queryByText('No issues found.')).toBeNull();

    // Metadata problems hand off to the details dialog: one dialog at a time, focus on the field.
    fireEvent.click(screen.getAllByRole('button', { name: 'Open curriculum details' })[0]);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Curriculum details' })).toBeDefined();
    expect(document.activeElement?.id).toBe('import-details-name');
    fireEvent.change(screen.getByLabelText(/curriculum name/i), { target: { value: 'BSIT 2026' } });
    fireEvent.change(screen.getByLabelText(/effective school year/i), { target: { value: '2026-2027' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(counts()).toBe('Not validated');

    // A term-level review without a course still leads somewhere: its term.
    service.validate.mockResolvedValueOnce({
      ...validation(false),
      issues: [{ key: 'group_total_unreported:1-2', code: 'group_total_unreported', severity: 'notice', row_id: null, field: null, message: 'Year 1, Second Semester has no printed total to cross-check.' }],
    });
    fireEvent.click(screen.getByRole('button', { name: /^validate$/i }));
    await waitFor(() => expect(counts()).toBe('1 noticeReady to review'));
    fireEvent.click(screen.getByRole('button', { name: /^Validation results/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Show term' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByLabelText('Semester') as HTMLSelectElement).value).toBe('2');
    await waitFor(() => expect(document.activeElement?.id).toBe('import-year-tab-1'));
  });

  it('keeps Import settings in the header as the only settings entry, read-only or editable', async () => {
    const { unmount } = render(<MemoryRouter><CurriculumImportPage /></MemoryRouter>);
    await screen.findByRole('button', { name: /import settings/i });
    const input = () => document.getElementById('curriculum-import-file') as HTMLInputElement;
    fireEvent.change(input(), { target: { files: [new File([csv], 'bsit.csv', { type: 'text/csv' })] } });
    await screen.findByRole('button', { name: /^Curriculum details/ });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Configure' }));
    expect(screen.getByRole('heading', { name: 'Configure categories and class time' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^(Edit|View) settings$/ })).toBeNull();
    expect(screen.queryByText('Classification rules')).toBeNull();

    // Without management rights the same button opens the settings read-only.
    fireEvent.click(screen.getByRole('button', { name: /import settings/i }));
    expect(screen.getByRole('dialog', { name: 'Curriculum import settings' })).toBeDefined();
    expect(screen.getByText('Only the department secretary can change these settings.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    unmount();

    // A manager saves from the same entry point, and the last check becomes out of date.
    service.getSettings.mockResolvedValue({ ...settings, can_manage: true });
    service.updateSettings.mockResolvedValue({ ...settings, can_manage: true, revision: 5 });
    render(<MemoryRouter><CurriculumImportPage /></MemoryRouter>);
    await screen.findByRole('button', { name: /import settings/i });
    fireEvent.change(input(), { target: { files: [new File([csv], 'bsit.csv', { type: 'text/csv' })] } });
    await screen.findByRole('button', { name: /^Curriculum details/ });
    fireEvent.click(screen.getByRole('button', { name: /^Curriculum details/ }));
    fireEvent.change(screen.getByLabelText(/curriculum name/i), { target: { value: 'BSIT 2026' } });
    fireEvent.change(screen.getByLabelText(/effective school year/i), { target: { value: '2026-2027' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    service.validate.mockResolvedValueOnce({ ...validation(true), issues: [], counts: { errors: 0, notices: 0, warnings: 0 } });
    fireEvent.click(screen.getByRole('button', { name: /^validate$/i }));
    await waitFor(() => expect(screen.getByTestId('issue-counts').textContent).toBe('Ready to review'));
    fireEvent.click(screen.getByRole('button', { name: /import settings/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(service.updateSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('issue-counts').textContent).toBe('Changed since last check'));
  });

  it('shows Step 4 errors and notices as separate badges in the heading button', async () => {
    render(<MemoryRouter><CurriculumImportPage /></MemoryRouter>);
    await screen.findByRole('button', { name: /import settings/i });
    const input = document.getElementById('curriculum-import-file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([csv], 'bsit.csv', { type: 'text/csv' })] } });
    fireEvent.click(await screen.findByRole('button', { name: /^Curriculum details/ }));
    fireEvent.change(screen.getByLabelText(/curriculum name/i), { target: { value: 'BSIT 2026' } });
    fireEvent.change(screen.getByLabelText(/effective school year/i), { target: { value: '2026-2027' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: /Import\s*Review and confirm/ }));

    // The heading holds the entry point; there is no separate banner or count line.
    expect(screen.queryByTestId('issue-counts')).toBeNull();
    expect(screen.getByRole('button', { name: 'Validation results: not validated' })).toBeDefined();

    const error = (row_id: string) => ({ key: `catalog_credit_mismatch:${row_id}`, code: 'catalog_credit_mismatch', severity: 'error' as const, row_id, field: 'code', message: `${row_id} differs from the catalog.` });
    const base = validation(true);
    service.validate.mockResolvedValueOnce({ ...base, valid: false, counts: { errors: 2, notices: 1, warnings: 0 }, issues: [error('r1'), error('r2'), ...base.issues] });
    fireEvent.click(screen.getByRole('button', { name: /^validate$/i }));
    const button = await screen.findByRole('button', { name: 'Validation results: 2 errors, 1 notice' });
    expect(button.tagName).toBe('BUTTON');
    expect(screen.getByText('2 errors').className).toContain('text-red-800');
    expect(screen.getByText('1 notice').className).toContain('bg-[#C9952A]');
    expect(screen.getByText('Import is blocked: 2 errors to correct.')).toBeDefined();
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Validation results' })).toBeDefined();
  });

  it('shows the red source note with its term, lets it be placed or added to, and sends notes for validation', async () => {
    render(<MemoryRouter><CurriculumImportPage /></MemoryRouter>);
    await screen.findByRole('button', { name: /import settings/i });
    const input = document.getElementById('curriculum-import-file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'tcc.pdf')] } });
    await screen.findByRole('tab', { name: /^First Year: 12 courses/ });
    const text = 'Note: Math prep(Pre-Calculus for NON-STEM(Algebra & Trigo) for GAS, HUMSS, ABM to be taken only';

    // Until the details are opened after upload, their button carries a "!".
    expect(screen.getByRole('button', { name: 'Curriculum details, not reviewed yet' })).toBeDefined();

    // The note shows with First Year in its printed colour, as document content rather than an error.
    const notes = screen.getByRole('region', { name: 'Notes for this view, from the document' });
    const red = Array.from(notes.querySelectorAll<HTMLElement>('span[style]')).find((span) => span.textContent === text)!;
    expect(red.style.color).toBe('rgb(192, 0, 0)');
    expect(notes.textContent).toContain('First Year:');
    fireEvent.click(screen.getByRole('tab', { name: /^Second Year/ }));
    expect(screen.queryByRole('region', { name: 'Notes for this view, from the document' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Curriculum details/ }));
    const dialog = screen.getByRole('dialog', { name: 'Curriculum details' });
    expect(dialog.textContent).toContain(`As printed: _______${text}`);
    expect((screen.getByLabelText('Placement of note 1') as HTMLSelectElement).value).toBe('year-1');
    fireEvent.change(screen.getByLabelText('Placement of note 1'), { target: { value: 'term-1-1' } });
    fireEvent.change(screen.getByLabelText(/Add a note the extractor could not read/), { target: { value: 'Bridging courses: see the scanned annex.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(dialog.textContent).toContain('Typed by the reviewer');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Curriculum details' })).toBeDefined();

    service.validate.mockResolvedValueOnce(validation(true));
    fireEvent.click(screen.getByRole('button', { name: /^validate$/i }));
    await waitFor(() => expect(service.validate).toHaveBeenCalledTimes(1));
    const sent = service.validate.mock.calls[0][0];
    expect(sent.rows).toHaveLength(59);
    expect(sent.notes).toEqual([
      { id: 'n1', source_text: `_______${text}`, text, runs: [{ length: [...text].length, color: '#C00000' }], scope: { level: 'term', year_level: 1, semester: 1 }, provenance: { kind: 'pdf', page: 1, bbox: expect.any(Array) }, flags: [] },
      { id: 'm1', source_text: null, text: 'Bridging courses: see the scanned annex.', runs: [{ length: 40, color: null }], scope: { level: 'curriculum' }, provenance: null, flags: ['manual'] },
    ]);
    expect(sent.metadata.notes).toEqual([text, 'Bridging courses: see the scanned annex.']);
  }, 20_000);

  it('asks what an unread part of the document holds, as a fact rather than a reason, and sends it', async () => {
    const real = extractCurriculumLayout(fixture.pages as never);
    vi.mocked(extractPdf).mockResolvedValueOnce({ ...real, unread: [{ reason: 'image', page: 1, bbox: [40, 400, 300, 460] }] });
    render(<MemoryRouter><CurriculumImportPage /></MemoryRouter>);
    await screen.findByRole('button', { name: /import settings/i });
    const input = document.getElementById('curriculum-import-file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'tcc.pdf')] } });
    await screen.findByText(/an image in the course area was not read/);

    fireEvent.click(screen.getByRole('button', { name: /^Curriculum details/ }));
    const choices = screen.getByRole('radiogroup', { name: 'What part 1 of the document holds' });
    expect(choices.querySelectorAll('input[type="radio"]')).toHaveLength(2);
    expect(screen.queryByPlaceholderText(/reason/i)).toBeNull();
    fireEvent.click(screen.getByLabelText('It holds no note'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    service.validate.mockResolvedValueOnce(validation(true));
    fireEvent.click(screen.getByRole('button', { name: /^validate$/i }));
    await waitFor(() => expect(service.validate).toHaveBeenCalledTimes(1));
    expect(service.validate.mock.calls[0][0].source.unread).toEqual([{ reason: 'image', page: 1, bbox: [40, 400, 300, 460], resolution: 'no_note' }]);
  });

  it('rejects unsupported formats without creating a draft', async () => {
    render(<MemoryRouter><CurriculumImportPage /></MemoryRouter>);
    const input = document.getElementById('curriculum-import-file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'old.xls')] } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/not supported/);
    expect(screen.queryByLabelText(/curriculum name/i)).toBeNull();
  });
});
