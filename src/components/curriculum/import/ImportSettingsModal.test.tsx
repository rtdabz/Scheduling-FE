import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ImportSettings } from '../../../lib/curriculumImport/types';

const { service, confirm } = vi.hoisted(() => ({
  service: { updateSettings: vi.fn() },
  confirm: vi.fn(),
}));
vi.mock('../../../services/curriculum/curriculumImportService', () => ({ curriculumImportService: service }));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ confirm }) }));

import ImportSettingsModal from './ImportSettingsModal';

const settings = (overrides: Partial<ImportSettings> = {}): ImportSettings => ({
  department_id: 1, revision: 3, lecture_minutes_per_unit: 60, laboratory_minutes_per_unit: 180,
  slot_minutes: 30, max_minutes_per_unit: 600,
  can_manage: true,
  rules: [
    { id: 1, match_kind: 'prefix', match_value: 'IT', category: 'major', enabled: true, sample_matches: ['IT 101', 'IT 102'] },
    { id: 2, match_kind: 'prefix', match_value: 'GEC', category: 'minor', enabled: true, sample_matches: [] },
  ],
  overlaps: [],
  ...overrides,
});

const saveButton = () => screen.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('curriculum import settings modal', () => {
  it('shows each rate with its calculated hours and blocks rates off the scheduling grid', () => {
    render(<ImportSettingsModal settings={settings()} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByText(/Example: 2 lecture \+ 1 lab unit = 2 hours \+ 3 hours = 5 hours a week/)).toBeDefined();
    const lecture = screen.getByLabelText('Lecture') as HTMLInputElement;
    expect(lecture.value).toBe('60');
    expect(document.getElementById('lecture_minutes_per_unit-equivalent')?.textContent).toBe('= 1 hour per unit');
    expect(document.getElementById('laboratory_minutes_per_unit-equivalent')?.textContent).toBe('= 3 hours per unit');

    fireEvent.change(lecture, { target: { value: '75' } });
    expect(screen.getByText('Use steps of 30 minutes.')).toBeDefined();
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(lecture, { target: { value: '90' } });
    expect(document.getElementById('lecture_minutes_per_unit-equivalent')?.textContent).toBe('= 1.5 hours per unit');
    expect(screen.getAllByText("Recorded with each imported course. Scheduling uses the course's Total Hours.")).toHaveLength(2);
    expect(saveButton().disabled).toBe(false);
  });

  it('adds, edits, toggles, and deletes rules, confirming only for saved rules', async () => {
    const onSaved = vi.fn();
    service.updateSettings.mockResolvedValue(settings({ revision: 4 }));
    confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<ImportSettingsModal settings={settings()} onClose={vi.fn()} onSaved={onSaved} />);

    expect(screen.getByText('Matches IT 101, IT 102')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Add rule/ }));
    expect(screen.getByText('Enter a code or prefix.')).toBeDefined();
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Code or prefix for rule 3'), { target: { value: 'gec' } });
    expect(screen.getByText('Same as rule 2.')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Match type for rule 3'), { target: { value: 'exact' } });
    fireEvent.change(screen.getByLabelText('Code or prefix for rule 3'), { target: { value: 'PATH FIT 1' } });
    fireEvent.change(screen.getByLabelText('Classification for rule 3'), { target: { value: 'minor' } });
    expect(saveButton().disabled).toBe(false);

    const toggle = screen.getByRole('switch', { name: 'Rule 2 enabled' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.textContent).toContain('Disabled');

    fireEvent.click(screen.getByRole('button', { name: 'Delete rule 1, IT' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Code or prefix for rule 1')).toHaveProperty('value', 'IT');
    fireEvent.click(screen.getByRole('button', { name: 'Delete rule 1, IT' }));
    await waitFor(() => expect(screen.queryByText('Matches IT 101, IT 102')).toBeNull());
    expect(confirm.mock.calls[1][0]).toMatchObject({ title: 'Delete classification rule?', confirmLabel: 'Delete rule', variant: 'danger' });

    fireEvent.click(screen.getByRole('button', { name: /Add rule/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete rule 3' }));
    expect(confirm).toHaveBeenCalledTimes(2);

    fireEvent.click(saveButton());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(service.updateSettings).toHaveBeenCalledWith({
      expected_revision: 3,
      lecture_minutes_per_unit: 60,
      laboratory_minutes_per_unit: 180,
      rules: [
        { match_kind: 'prefix', match_value: 'GEC', category: 'minor', enabled: false },
        { match_kind: 'exact', match_value: 'PATH FIT 1', category: 'minor', enabled: true },
      ],
      acknowledge_overlaps: false,
    });
  });

  it('shows server validation messages against the right rule', async () => {
    service.updateSettings.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'The given data was invalid.', errors: { 'rules.1.match_value': ['The prefix rule "GEC" is listed more than once.'] } } },
    });
    render(<ImportSettingsModal settings={settings()} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(saveButton());
    expect(await screen.findByText('The prefix rule "GEC" is listed more than once.')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toBe('Check the highlighted fields.');
    expect(screen.getByLabelText('Code or prefix for rule 2').getAttribute('aria-invalid')).toBe('true');
  });

  it('is read-only for users who cannot manage settings', () => {
    const onClose = vi.fn();
    render(<ImportSettingsModal settings={settings({ can_manage: false })} onClose={onClose} onSaved={vi.fn()} />);
    expect(screen.getByText('Only the department secretary can change these settings.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add rule/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete rule/ })).toBeNull();
    expect((screen.getByLabelText('Lecture') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('switch', { name: 'Rule 1 enabled' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
