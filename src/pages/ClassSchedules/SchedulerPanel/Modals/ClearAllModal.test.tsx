import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClearAllModal from './ClearAllModal';
import type { SectionDoneCandidate } from '../types';

afterEach(cleanup);
const candidate = (id: string, isReady = true): SectionDoneCandidate => ({
  sectionId: id, sectionName: `BSIT 1${id}`, yearLevel: 1, requiredSubjects: 1, plottedSubjects: 1,
  scheduleIds: [Number(id)], isReady, blockedReason: isReady ? '' : 'Locked for approval',
});
const props = () => ({
  sectionClearCandidates: [candidate('1'), candidate('2'), candidate('3', false)],
  isClearAllModalOpen: true, isClearingAll: false, selectedSectionId: '1',
  activeSemesterText: '1st Semester AY 2026-2027', confirmClearAll: vi.fn(), cancelClearAll: vi.fn(),
});

describe('Clear schedules checklist', () => {
  it('selects only the open section initially and waits for explicit confirmation', () => {
    const input = props();
    render(<ClearAllModal {...input} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /BSIT 12/ }));
    expect(input.confirmClearAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear 2 Sections' }));
    expect(input.confirmClearAll).toHaveBeenCalledWith(['1', '2']);
    expect(screen.getByText(/cannot be restored from the Archive/)).toBeTruthy();
  });

  it('selects only eligible sections and disables confirmation when nothing is selected', () => {
    const input = props();
    render(<ClearAllModal {...input} />);
    expect((screen.getByRole('button', { name: /BSIT 13/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all available sections' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear 2 Sections' }));
    expect(input.confirmClearAll).toHaveBeenCalledWith(['1', '2']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Deselect all sections' }));
    expect((screen.getByRole('button', { name: 'Clear Sections' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('blocks dismissal and selection while clearing', () => {
    const input = props();
    render(<ClearAllModal {...input} isClearingAll />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(input.cancelClearAll).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /BSIT 12/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Clearing\.\.\./ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('resets selection when reopened', () => {
    const input = props();
    const { rerender } = render(<ClearAllModal {...input} />);
    fireEvent.click(screen.getByRole('button', { name: /BSIT 12/ }));
    rerender(<ClearAllModal {...input} isClearAllModalOpen={false} />);
    rerender(<ClearAllModal {...input} />);
    expect(screen.getByRole('button', { name: 'Clear 1 Section' })).toBeTruthy();
  });
});
