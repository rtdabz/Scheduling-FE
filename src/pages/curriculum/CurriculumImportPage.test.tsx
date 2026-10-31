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

import CurriculumImportPage from './CurriculumImportPage';

const settings: ImportSettings = {
  department_id: 1, revision: 4, lecture_minutes_per_unit: 60, laboratory_minutes_per_unit: 180,
  slot_minutes: 30, max_minutes_per_unit: 600,
  can_manage: false, rules: [], overlaps: [],
};

const validation = (valid: boolean, acknowledged: boolean): ValidationResult => ({
  valid,
  fingerprint: valid ? 'f'.repeat(64) : 'e'.repeat(64),
  settings_revision: 4,
  settings: { lecture_minutes_per_unit: 60, laboratory_minutes_per_unit: 180 },
  metadata: { code: 'BSIT-2026', program_id: null },
  counts: { errors: 0, reviews: 1, reviews_open: acknowledged ? 0 : 1, warnings: 0 },
  issues: [{ key: 'group_total_unreported:1-1', code: 'group_total_unreported', severity: 'review', row_id: null, field: null, message: 'Year 1, First Semester has no printed total to cross-check.', acknowledged, reason: acknowledged ? 'Matches registrar copy' : null }],
  rows: [],
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
  it('requires fresh server validation with recorded reasons before committing', async () => {
    render(<MemoryRouter><CurriculumImportPage /></MemoryRouter>);
    await screen.findByRole('button', { name: /import settings/i });

    const input = document.getElementById('curriculum-import-file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([csv], 'bsit.csv', { type: 'text/csv' })] } });

    await screen.findByLabelText(/curriculum name/i);
    expect(screen.getByLabelText('Internal code').textContent).toBe('Assigned automatically');
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
    expect((screen.getByLabelText(/^program$/i) as HTMLSelectElement).value).toBe('');
    fireEvent.change(screen.getByLabelText(/curriculum name/i), { target: { value: 'BSIT 2026' } });
    fireEvent.change(screen.getByLabelText(/effective school year/i), { target: { value: '2026-2027' } });

    expect(screen.getByRole('button', { name: /Preview/ }).getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('button', { name: /Upload & extract.*completed/ })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Import\s*Validate and create/ }));
    service.validate.mockResolvedValueOnce(validation(false, false));
    fireEvent.click(screen.getByRole('button', { name: /^validate$/i }));
    await screen.findByLabelText(/Reason for accepting: Year 1, First Semester has no printed total/);

    const importButton = screen.getByRole('button', { name: /import curriculum/i }) as HTMLButtonElement;
    expect(importButton.disabled).toBe(true);
    expect(screen.getByLabelText('Assigned internal code').textContent).toBe('BSIT-2026');
    expect(service.validate.mock.calls[0][0].metadata).not.toHaveProperty('code');
    const sentRows = service.validate.mock.calls[0][0].rows;
    expect(sentRows.map((row: { code: string; semester: number }) => [row.code, row.semester])).toEqual([['IT 101', 1], ['GEC 1', 1]]);
    expect(sentRows.map((row: { prerequisites: string | null }) => row.prerequisites)).toEqual(['none', 'IT 101']);

    fireEvent.change(screen.getByPlaceholderText(/reason/i), { target: { value: 'Matches registrar copy' } });
    expect(screen.getByText(/draft changed after the last check/i)).toBeDefined();
    expect(importButton.disabled).toBe(true);

    service.validate.mockResolvedValueOnce(validation(true, true));
    fireEvent.click(screen.getByRole('button', { name: /^validate$/i }));
    await waitFor(() => expect((screen.getByRole('button', { name: /import curriculum/i }) as HTMLButtonElement).disabled).toBe(false));
    expect(service.validate.mock.calls[1][0].acknowledgements).toEqual({ 'group_total_unreported:1-1': 'Matches registrar copy' });

    service.commit.mockResolvedValueOnce({
      curriculum: { id: 12, name: 'BSIT 2026', code: 'BSIT-2026', cmo_number: null, cmo_series: null, program_id: null, effective_school_year: '2026-2027', status: 'deactivated' },
      import_id: 3, created_count: 2, reused_count: 0, rows: [], groups: [],
      totals: { calculated: { lec: 4, lab: 1, tu: 5 }, reported_sum: null, row_count: 2, populated_groups: 1 },
      acknowledged: {}, replayed: false,
    });
    fireEvent.click(screen.getByRole('button', { name: /import curriculum/i }));
    await screen.findByText('Curriculum imported');

    const committed = service.commit.mock.calls[0][0];
    expect(committed).toMatchObject({ fingerprint: 'f'.repeat(64), expected_settings_revision: 4, source: { format: 'csv', filename: 'bsit.csv' } });
    expect(committed.request_key).toMatch(/^[A-Za-z0-9-]{8,}$/);
    expect(committed.source.sha256).toMatch(/^[a-f0-9]{64}$/);
  // Drives the whole four-step flow; under a full parallel run it can exceed the default 5 s.
  }, 20_000);

  it('rejects unsupported formats without creating a draft', async () => {
    render(<MemoryRouter><CurriculumImportPage /></MemoryRouter>);
    const input = document.getElementById('curriculum-import-file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'old.xls')] } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/not supported/);
    expect(screen.queryByLabelText(/curriculum name/i)).toBeNull();
  });
});
