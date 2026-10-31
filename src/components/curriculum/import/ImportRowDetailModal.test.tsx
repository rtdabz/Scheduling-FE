import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import ImportRowDetailModal from './ImportRowDetailModal';
import type { DraftRow } from '../../../lib/curriculumImport/types';

vi.mock('../../../lib/curriculumImport/pdfSource', () => ({ renderPdfCrop: vi.fn(() => Promise.resolve()) }));

const row = (overrides: Partial<DraftRow> = {}): DraftRow => ({
  row_id: 'r2',
  year_level: 1,
  semester: 2,
  code: 'IT 105',
  title: 'Computer Programming 2',
  lecture_units: 2,
  lab_units: 1,
  total_units: 3,
  category: null,
  scheduling_basis: null,
  total_hours: null,
  prerequisites: 'IT102/IT103',
  code_suggestion: null,
  source: {
    code: 'IT 105', title: 'Computer Programming 2', lec: 2, lab: 1, tu: 3, prerequisites: 'IT102/IT103', raw: ['IT 105'],
    provenance: { kind: 'csv', record: 3 }, flags: [],
  },
  ...overrides,
});

function Harness({ initial }: { initial: DraftRow }) {
  const [current, setCurrent] = useState(initial);
  return (
    <ImportRowDetailModal
      row={current}
      issues={[]}
      bytes={null}
      onClose={vi.fn()}
      onChange={(_, patch) => setCurrent((previous) => ({ ...previous, ...patch }))}
    />
  );
}

const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;

afterEach(cleanup);

describe('edit course modal', () => {
  it('recalculates the total from lecture and laboratory, and still reports a typed mismatch', () => {
    render(<Harness initial={row()} />);
    expect(screen.queryAllByText('Edited')).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('Laboratory units'), { target: { value: '2' } });
    expect(value('Total units')).toBe('4');
    expect(screen.getByText('Edited')).toBeDefined();
    expect(screen.getByText('doc 1')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Total units'), { target: { value: '5' } });
    expect(screen.getByText('Lecture + laboratory is 4, but the total is 5.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Set total to 4' }));
    expect(value('Total units')).toBe('4');

    fireEvent.change(screen.getByLabelText('Lecture units'), { target: { value: '' } });
    expect(value('Total units')).toBe('4');
    expect(screen.getByText(/A blank unit is not zero/)).toBeDefined();
    expect(screen.getByText(/Still needed: blank units/)).toBeDefined();
  });

  it('places the course in any term, including Summer', () => {
    render(<Harness initial={row()} />);
    fireEvent.change(screen.getByLabelText('Term'), { target: { value: '3' } });
    expect((screen.getByLabelText('Term') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Summer');
    fireEvent.change(screen.getByLabelText('Year level'), { target: { value: '2' } });
    expect((screen.getByLabelText('Year level') as HTMLSelectElement).value).toBe('2');
  });

  it('shows document values next to edited fields', () => {
    render(<Harness initial={row({ code: 'I1 125', source: { ...row().source, code: 'I1 125' }, code_suggestion: 'IT 125' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use IT 125' }));
    expect(value('Course code')).toBe('IT 125');
    expect(screen.getByText('Document: I1 125')).toBeDefined();
    expect(screen.getByText('Edited')).toBeDefined();
  });

  it('keeps the exact prerequisite text editable without asking for a classification', () => {
    render(<Harness initial={row()} />);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Changes apply as you type');
    expect(value('As written in the curriculum')).toBe('IT102/IT103');

    fireEvent.change(screen.getByLabelText('As written in the curriculum'), { target: { value: 'IT 102/IT 103' } });
    expect(value('As written in the curriculum')).toBe('IT 102/IT 103');
    expect(screen.getByText('Document: IT102/IT103')).toBeDefined();
    expect(screen.getByText('Edited')).toBeDefined();
    expect(screen.getByRole('status').textContent).toContain('Changes apply as you type');

    fireEvent.click(screen.getByRole('button', { name: 'Use document text' }));
    expect(value('As written in the curriculum')).toBe('IT102/IT103');
    expect(screen.queryByText('Edited')).toBeNull();
  });

  it('treats a missing prerequisite as none without blocking', () => {
    render(<Harness initial={row({ prerequisites: null, source: { ...row().source, prerequisites: null } })} />);
    expect(value('As written in the curriculum')).toBe('');
    expect(screen.getByText('Document: none given')).toBeDefined();
    expect(screen.getByRole('status').textContent).toContain('Changes apply as you type');
  });

  it('explains a missing page image instead of failing silently', () => {
    render(<Harness initial={row({ source: { ...row().source, provenance: { kind: 'pdf', page: 1, bbox: [0, 0, 10, 10] } } })} />);
    expect(screen.getByRole('note').textContent).toContain('because the file is no longer loaded');
    expect(screen.getByText('2 + 1 = 3')).toBeDefined();
  });
});
