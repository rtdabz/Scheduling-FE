import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SubmitApprovalModal from './SubmitApprovalModal';
import type { DepartmentSectionProgress } from '../types';

afterEach(cleanup);

const section = (sectionId: string, status: DepartmentSectionProgress['status'], isDone = true): DepartmentSectionProgress => ({
  sectionId, sectionName: `BSIT ${sectionId}`, yearLevel: 1,
  requiredCourses: 6, plottedCourses: isDone ? 6 : 4,
  requiredSubjects: 6, plottedSubjects: isDone ? 6 : 4,
  status, isDone, isSelected: false, assignedInstructorBlocks: 0, facultyAssignmentDone: false,
});

function props(): ComponentProps<typeof SubmitApprovalModal> {
  return {
    sections: [], isSubmitApprovalModalOpen: true, selectedSectionId: '1A', totalScheduled: 6, totalSubjects: 6,
    departmentSectionProgress: [section('1A', 'draft'), section('1B', 'finalized'), section('1C', 'approved_by_dean')],
    departmentTotalSections: 3, departmentDoneSections: 3, departmentReadyToSubmit: true,
    confirmSubmitForApproval: vi.fn(), cancelSubmitForApproval: vi.fn(),
  };
}

describe('SubmitApprovalModal', () => {
  it('distinguishes the revision cohort from protected sections and keeps the exact progress', () => {
    const input = props();
    render(<SubmitApprovalModal {...input} departmentDoneSections={2} />);
    expect(screen.getByText('1 section will be sent for review')).toBeTruthy();
    expect(screen.getByText('Will submit')).toBeTruthy();
    expect(screen.getByText('Finalized')).toBeTruthy();
    expect(screen.getByText('Unchanged')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2');
    const fill = screen.getByRole('progressbar').firstElementChild as HTMLElement;
    expect(parseFloat(fill.style.width)).toBeCloseTo(200 / 3);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Review Again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit to Dean' }));
    expect(input.confirmSubmitForApproval).toHaveBeenCalledOnce();
  });

  it('shows incomplete sections and prevents submission while the department is blocked', () => {
    const input = props();
    render(<SubmitApprovalModal {...input} departmentReadyToSubmit={false}
      departmentSectionProgress={[section('1A', 'draft', false)]} departmentTotalSections={1} departmentDoneSections={0} />);
    expect(screen.getByText('Not ready')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Submit to Dean' }));
    expect(input.confirmSubmitForApproval).not.toHaveBeenCalled();
  });

  it('prevents duplicate submit and every dismissal path during submission', () => {
    const input = props();
    render(<SubmitApprovalModal {...input} isSubmittingSchedule />);
    const dialog = screen.getByRole('alertdialog');
    for (const button of within(dialog).getAllByRole('button')) fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(dialog.parentElement!);
    expect(input.confirmSubmitForApproval).not.toHaveBeenCalled();
    expect(input.cancelSubmitForApproval).not.toHaveBeenCalled();
  });
});
