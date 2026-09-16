import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Reports from './Reports';
import { fetchReportData, fetchReportsOverview, type ReportsOverview } from '../../lib/reports';

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), warning: vi.fn() } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast }) }));
vi.mock('../../lib/reports', () => ({ fetchReportsOverview: vi.fn(), fetchReportData: vi.fn() }));
vi.mock('../ClassSchedules/SchedulerPanel/PrintSchedule', () => ({ default: () => <div>Schedule PDF opened</div> }));
vi.mock('../ClassSchedules/SchedulerPanel/TeachingLoad', () => ({ default: () => <div>Teaching load PDF opened</div> }));

const overview: ReportsOverview = {
  active_semester: null,
  departments: [{
    id: 1, code: 'CIT', name: 'College of Information Technology', can_print_department: true,
    complete_section_count: 2, instructor_count: 3,
    programs: [
      { id: 11, code: 'BSIT', name: 'Information Technology', complete_section_count: 2, instructor_count: 3 },
      { id: 12, code: 'BSCS', name: 'Computer Science', complete_section_count: 0, instructor_count: 0 },
    ],
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchReportsOverview).mockResolvedValue(overview);
  vi.mocked(fetchReportData).mockResolvedValue({
    sections: [{ id: '1' }], schedules: [], departments: [], users: [], faculties: [], activeSemester: null,
  } as unknown as Awaited<ReturnType<typeof fetchReportData>>);
});
afterEach(cleanup);

describe('Reports directory', () => {
  it('searches program names and filters out unavailable PDFs without changing their scope', async () => {
    render(<Reports />);
    await screen.findByText('BSCS Class Schedule');
    const unavailable = screen.getByRole('button', { name: 'Open PDF: BSCS Class Schedule' }) as HTMLButtonElement;
    expect(unavailable.disabled).toBe(true);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Computer Science' } });
    expect(screen.queryByText('BSIT Class Schedule')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Available only' }));
    expect(screen.getByText('No matching reports')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('BSIT Class Schedule')).toBeTruthy();
    expect(screen.getByText('BSCS Class Schedule')).toBeTruthy();
  });

  it('opens the existing schedule PDF for the selected program', async () => {
    render(<Reports />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open PDF: BSIT Class Schedule' }));
    await screen.findByText('Schedule PDF opened');
    expect(fetchReportData).toHaveBeenCalledWith(1, 11);
  });

  it('switches report types with the keyboard and opens the whole-department teaching load', async () => {
    render(<Reports />);
    await screen.findByText('BSIT Class Schedule');
    fireEvent.keyDown(screen.getByRole('tab', { name: /Department Schedule/ }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Teaching Load/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Open PDF: All CIT Instructors Load' }));
    await screen.findByText('Teaching load PDF opened');
    expect(fetchReportData).toHaveBeenCalledWith(1, null);
  });

  it('keeps restricted program scopes and does not add a department export', async () => {
    vi.mocked(fetchReportsOverview).mockResolvedValue({ ...overview, departments: [{ ...overview.departments[0], can_print_department: false }] });
    render(<Reports />);
    await screen.findByText('BSIT Class Schedule');
    expect(screen.queryByRole('button', { name: /Open PDF: All CIT/ })).toBeNull();
  });

  it('offers recovery after a load failure and preserves the directory after a failed refresh', async () => {
    vi.mocked(fetchReportsOverview).mockRejectedValueOnce(new Error('offline'));
    render(<Reports />);
    expect((await screen.findByRole('alert')).textContent).toContain('could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('BSIT Class Schedule');
    expect(screen.queryByRole('alert')).toBeNull();
    vi.mocked(fetchReportsOverview).mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Previously loaded reports'));
    expect(screen.getByText('BSIT Class Schedule')).toBeTruthy();
  });
});
