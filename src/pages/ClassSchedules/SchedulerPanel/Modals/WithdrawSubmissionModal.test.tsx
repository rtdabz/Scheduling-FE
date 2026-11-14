import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WithdrawSubmissionModal from './WithdrawSubmissionModal';
import type { DepartmentSectionProgress } from '../types';

afterEach(cleanup);

const section = (sectionId: string, status: DepartmentSectionProgress['status'] = 'submitted'): DepartmentSectionProgress => ({
  sectionId, sectionName: `BSIT ${sectionId}`, yearLevel: 1, status,
  requiredCourses: 6, requiredSubjects: 6, plottedCourses: 6, plottedSubjects: 6,
  isDone: true, isSelected: false, assignedInstructorBlocks: 1, facultyAssignmentDone: false,
});
const props = () => ({
  isOpen: true, sections: [section('1A'), section('1B'), section('1C', 'finalized')],
  selectedSectionId: '1A', withdrawalStage: 'dean_review' as const,
  isWithdrawing: false, onConfirm: vi.fn(), onCancel: vi.fn(),
});

describe('Recall section selection', () => {
  it('starts unchecked and recalls only a section the user explicitly selects', () => {
    const input = props();
    render(<WithdrawSubmissionModal {...input} />);
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
    expect((screen.getByRole('button', { name: 'Recall Selected' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/instructor assignment in the selected sections will be released/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /BSIT 1B/ }));
    expect(screen.getByText(/1 instructor assignment in the selected sections will be released/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Recall Selected' }));
    expect(input.onConfirm).toHaveBeenCalledWith(['1B']);
  });

  it('keeps explicit choices when section data or the open timetable section changes', () => {
    const input = props();
    const view = render(<WithdrawSubmissionModal {...input} />);
    fireEvent.click(screen.getByRole('button', { name: /BSIT 1B/ }));
    view.rerender(<WithdrawSubmissionModal {...input} sections={[...input.sections]} selectedSectionId="1C" />);
    fireEvent.click(screen.getByRole('button', { name: 'Recall Selected' }));
    expect(input.onConfirm).toHaveBeenCalledWith(['1B']);
  });

  it('opens unchecked again after closing, even when the current section is recallable', () => {
    const input = props();
    const view = render(<WithdrawSubmissionModal {...input} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all sections' }));
    view.rerender(<WithdrawSubmissionModal {...input} isOpen={false} />);
    view.rerender(<WithdrawSubmissionModal {...input} />);
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
    expect((screen.getByRole('button', { name: 'Recall Selected' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('never offers a VPAA-approved section for recall', () => {
    const input = props();
    render(<WithdrawSubmissionModal {...input} sections={[
      section('1A', 'approved_by_dean'),
      section('1B', 'approved'),
      section('1C', 'faculty_assignment'),
      section('1D', 'reassignment'),
      section('1E', 'finalized'),
    ]} />);
    expect(screen.getByRole('button', { name: /BSIT 1A/ })).toBeTruthy();
    for (const id of ['1B', '1C', '1D', '1E']) {
      expect(screen.queryByRole('button', { name: new RegExp(`BSIT ${id}`) })).toBeNull();
    }
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all sections' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recall Selected' }));
    expect(input.onConfirm).toHaveBeenCalledWith(['1A']);
  });

  it('does not submit stale choices or automatically pick another eligible section', () => {
    const input = props();
    const view = render(<WithdrawSubmissionModal {...input} />);
    fireEvent.click(screen.getByRole('button', { name: /BSIT 1A/ }));
    view.rerender(<WithdrawSubmissionModal {...input} sections={[section('1A', 'finalized'), section('1B')]} />);
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Recall Selected' }));
    expect(input.onConfirm).not.toHaveBeenCalled();
  });
});
