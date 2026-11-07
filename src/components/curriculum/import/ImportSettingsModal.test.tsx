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
    { id: 1, match_value: 'IT', category: 'major', sample_matches: ['IT 101', 'IT 102'] },
    { id: 2, match_value: 'GEC', category: 'minor', sample_matches: [] },
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
  it('enters each rate in hours per unit, blocks rates off the scheduling grid, and saves minutes', async () => {
    service.updateSettings.mockResolvedValue(settings({ revision: 4 }));
    render(<ImportSettingsModal settings={settings()} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getAllByText('Hours per unit')).toHaveLength(2);
    expect(screen.queryByText('Minutes per unit')).toBeNull();
    expect(screen.getByText(/Example: 2 lecture \+ 1 lab unit = 2 hours \+ 3 hours = 5 hours a week/)).toBeDefined();
    const lecture = screen.getByLabelText('Lecture') as HTMLInputElement;
    expect(lecture.value).toBe('1');
    expect((screen.getByLabelText('Laboratory') as HTMLInputElement).value).toBe('3');

    fireEvent.change(lecture, { target: { value: '1.25' } });
    expect(screen.getByText('Use steps of 0.5 hour.')).toBeDefined();
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(lecture, { target: { value: '11' } });
    expect(screen.getByText('Use 0.5 to 10 hours.')).toBeDefined();

    fireEvent.change(lecture, { target: { value: '' } });
    expect(screen.getByText('Use 0.5 to 10 hours.')).toBeDefined();

    fireEvent.change(lecture, { target: { value: '1.5' } });
    expect(screen.getByText(/Example: 2 lecture \+ 1 lab unit = 3 hours \+ 3 hours = 6 hours a week/)).toBeDefined();
    expect(screen.getAllByText("Recorded with each imported course. Scheduling uses the course's Total Hours.")).toHaveLength(2);
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(saveButton());
    await waitFor(() => expect(service.updateSettings).toHaveBeenCalled());
    expect(service.updateSettings.mock.calls[0][0]).toMatchObject({ lecture_minutes_per_unit: 90, laboratory_minutes_per_unit: 180 });
  });

  it('adds, edits, and deletes prefix rules without a match type or status, confirming only for saved rules', async () => {
    const onSaved = vi.fn();
    service.updateSettings.mockResolvedValue(settings({ revision: 4 }));
    confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<ImportSettingsModal settings={settings()} onClose={vi.fn()} onSaved={onSaved} />);

    expect(screen.getByText('Matches IT 101, IT 102')).toBeDefined();
    expect(screen.queryByText('Match type')).toBeNull();
    expect(screen.queryByText('Status')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByLabelText(/Match type/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Add rule/ }));
    expect(screen.getByText('Enter a prefix.')).toBeDefined();
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Prefix for rule 3'), { target: { value: 'gec' } });
    expect(screen.getByText('Same as rule 2.')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Prefix for rule 3'), { target: { value: 'PATH FIT' } });
    fireEvent.change(screen.getByLabelText('Classification for rule 3'), { target: { value: 'minor' } });
    expect(saveButton().disabled).toBe(false);

    fireEvent.change(screen.getByLabelText('Classification for rule 2'), { target: { value: 'major' } });

    fireEvent.click(screen.getByRole('button', { name: 'Delete rule 1, IT' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Prefix for rule 1')).toHaveProperty('value', 'IT');
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
        { match_value: 'GEC', category: 'major' },
        { match_value: 'PATH FIT', category: 'minor' },
      ],
      acknowledge_overlaps: false,
    });
  });

  it('shows server validation messages against the right rule', async () => {
    service.updateSettings.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'The given data was invalid.', errors: { 'rules.1.match_value': ['The prefix "GEC" is listed more than once.'] } } },
    });
    render(<ImportSettingsModal settings={settings()} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(saveButton());
    expect(await screen.findByText('The prefix "GEC" is listed more than once.')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toBe('Check the highlighted fields.');
    expect(screen.getByLabelText('Prefix for rule 2').getAttribute('aria-invalid')).toBe('true');
  });

  it('is read-only for users who cannot manage settings', () => {
    const onClose = vi.fn();
    render(<ImportSettingsModal settings={settings({ can_manage: false })} onClose={onClose} onSaved={vi.fn()} />);
    expect(screen.getByText('Only the department secretary can change these settings.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add rule/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete rule/ })).toBeNull();
    expect((screen.getByLabelText('Lecture') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Prefix for rule 1') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
