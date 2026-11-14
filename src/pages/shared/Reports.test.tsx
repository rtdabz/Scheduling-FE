import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDataCache } from '../../lib/dataCache';
import Reports from './Reports';
import { fetchReportData, fetchReportsOverview, type ReportsOverview } from '../../lib/reports';
import { mapInitialData } from '../ClassSchedules/SchedulerPanel/hooks/initialDataMapper';
import { buildRoomUtilizationPdf } from '../../lib/roomUtilizationPdf';
import api from '../../lib/api';

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast }) }));
vi.mock('../../lib/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/reports')>()),
  fetchReportsOverview: vi.fn(),
  fetchReportData: vi.fn(),
}));
vi.mock('../ClassSchedules/SchedulerPanel/PrintSchedule', () => ({ default: () => <div>Schedule PDF opened</div> }));
vi.mock('../ClassSchedules/SchedulerPanel/TeachingLoad', () => ({ default: () => <div>Teaching load PDF opened</div> }));
const { pdfPreview } = vi.hoisted(() => ({ pdfPreview: { show: vi.fn(async () => {}), close: vi.fn() } }));
vi.mock('../../lib/pdfPreview', () => ({ openPdfPreview: () => pdfPreview }));
vi.mock('../../lib/roomUtilizationPdf', () => ({
  buildRoomUtilizationPdf: vi.fn(async () => new Blob(['room-pdf'])),
  getRoomUtilizationPdfFilename: () => 'room.pdf',
}));

const currentTerm = { id: 5, academic_year: '2026-2027', semester: '1st', is_active: true };
const pastTerm = { id: 4, academic_year: '2025-2026', semester: '2nd', is_active: false };

const overview: ReportsOverview = {
  semester: currentTerm,
  terms: [currentTerm, pastTerm],
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
  clearDataCache();
  vi.clearAllMocks();
  vi.mocked(fetchReportsOverview).mockResolvedValue(overview);
  vi.mocked(fetchReportData).mockResolvedValue({
    sections: [{ id: '1' }], schedules: [], departments: [], users: [], faculties: [], activeSemester: null,
  } as unknown as Awaited<ReturnType<typeof fetchReportData>>);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Reports directory', () => {
  it.each([
    ['Room Utilization', 'CIT Room Utilization', 'SCI-101', 'Science Building', false, false],
    ['Room Utilization', 'CIT Room Utilization', 'SCI-101', 'Main Campus', true, false],
    ['Room Utilization', 'CIT Room Utilization', 'SCI-101', 'Science Building', false, true],
  ])('renders mapped %s data without a CSV export: %s / %s / %s / fallback=%s / unavailable=%s', async (tab, label, code, detail, fallback, unavailable) => {
    const data = mapInitialData({
      active_semester: null, faculties: [], departments: [], users: [], time_grid: null,
      rooms: [{ id: 1, room_code: 'SCI-101', building: 'Science Building', room_type: 'lecture', status: unavailable ? 'not available' : 'available', department_id: 1 }],
      courses: [{ id: 10, course_code: 'IT 101', course_name: 'Programming', units: 3, lecture_hours: 3, lab_hours: 0,
        course_category: 'major', semester: '1st', department_id: 1, year_level: 1, room_type_required: 'lecture' }],
      sections: [{ id: 1, section_name: 'BSIT 1A', year_level: 1, semester: '1st', semester_id: 1, department_id: 1 }],
      schedules: [{ id: 1, semester_id: 1, department_id: 1, course_id: 10, section_id: 1, room_id: 1, faculty_id: null,
        day: 'Monday', start_time: '07:00:00', end_time: '10:00:00', status: 'approved', mode: 'on-site',
        course: { course_code: 'IT 101', course_name: 'Programming', units: 3 },
        section: { section_name: 'BSIT 1A' }, room: { room_code: 'SCI-101' } }],
    }, { isVpaa: true });
    if (fallback) { data.rooms = []; data.subjects = []; }
    vi.mocked(fetchReportData).mockResolvedValue(data);
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(tab) }));
    fireEvent.click(screen.getByRole('button', { name: `Preview: ${label}` }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByRole('cell', { name: code })).toBeTruthy();
    expect(dialog.getByRole('cell', { name: detail })).toBeTruthy();
    const expectedStatus = unavailable ? 'Unavailable' : 'In Use';
    expect(dialog.queryByRole('columnheader', { name: 'Status' })).toBeNull();
    expect(dialog.queryByRole('cell', { name: expectedStatus })).toBeNull();
    expect(dialog.queryByRole('searchbox')).toBeNull();
    expect(dialog.queryByRole('button', { name: /Export CSV/ })).toBeNull();
    expect(screen.queryByRole('button', { name: `Export CSV: ${label}` })).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('lists one report per department covering every program beneath the report heading', async () => {
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');
    expect(screen.getByText('All programs: BSIT, BSCS')).toBeTruthy();
    expect(screen.queryByText('BSIT Class Schedule')).toBeNull();
    expect(screen.queryByText('BSCS Class Schedule')).toBeNull();
    const directory = within(screen.getByRole('tabpanel'));
    expect(directory.getByRole('heading', { name: 'Department Schedule reports' })).toBeTruthy();
    expect(directory.queryByRole('searchbox')).toBeNull();
    expect(directory.queryByRole('button', { name: 'Available only' })).toBeNull();
  });

  it('offers the PDF only from the preview and opens the whole-department schedule PDF there', async () => {
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');
    expect(screen.queryByRole('button', { name: /Open PDF/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Preview: CIT Class Schedule' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: /Generate PDF/ }));
    await screen.findByText('Schedule PDF opened');
    expect(fetchReportData).toHaveBeenCalledWith(1, null, 5);
  });

  it('switches report types with the keyboard and opens the whole-department teaching load', async () => {
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');
    fireEvent.keyDown(screen.getByRole('tab', { name: /Department Schedule/ }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Teaching Load/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Preview: CIT Instructors Load' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Generate PDF/ }));
    await screen.findByText('Teaching load PDF opened');
    expect(fetchReportData).toHaveBeenCalledWith(1, null, 5);
  });

  it('keeps restricted program scopes and does not add a department export', async () => {
    vi.mocked(fetchReportsOverview).mockResolvedValue({ ...overview, departments: [{ ...overview.departments[0], can_print_department: false }] });
    render(<Reports />);
    await screen.findByText('BSIT Class Schedule');
    expect(screen.getByText('BSCS Class Schedule')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Preview: CIT Class/ })).toBeNull();
  });

  it('offers recovery after a load failure and preserves the directory after a failed refresh', async () => {
    vi.mocked(fetchReportsOverview).mockRejectedValueOnce(new Error('offline'));
    render(<Reports />);
    expect((await screen.findByRole('alert')).textContent).toContain('could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('CIT Class Schedule');
    expect(screen.queryByRole('alert')).toBeNull();
    vi.mocked(fetchReportsOverview).mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Previously loaded reports'));
    expect(screen.getByText('CIT Class Schedule')).toBeTruthy();
  });

  it('opens and closes the detailed report modal with breakdown table', async () => {
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');
    const detailsBtn = screen.getByRole('button', { name: 'Preview: CIT Class Schedule' });
    fireEvent.click(detailsBtn);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(fetchReportData).toHaveBeenCalledWith(1, null, 5);

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('switches to the room utilization tab', async () => {
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');

    // Room tab
    fireEvent.click(screen.getByRole('tab', { name: /Room Utilization/ }));
    expect(await screen.findByText('CIT Room Utilization')).toBeTruthy();

    expect(screen.queryByRole('tab', { name: /Approval & Readiness/ })).toBeNull();
  });

  it('changes department schedule details by summary card', async () => {
    const data = mapInitialData({
      active_semester: null, rooms: [], faculties: [], sections: [], departments: [], users: [],
      schedules: [{
        id: 1, semester_id: 1, department_id: 1, course_id: 10, section_id: 1, room_id: 1, faculty_id: 1,
        day: 'Monday', start_time: '07:00:00', end_time: '09:00:00', status: 'approved', mode: 'on-site',
      }],
    }, { isVpaa: true });
    const meeting = data.schedules[0];
    data.schedules = [
      { ...meeting, id: '1', sectionName: 'BSIT 1A', courseCode: 'IT 101', facultyName: 'Alice Santos', roomName: 'SCI-101', day: 'Monday' },
      { ...meeting, id: '2', sectionName: 'BSIT 1A', courseCode: 'IT 102', facultyName: 'Alice Santos', roomName: 'SCI-101', day: 'Wednesday' },
      { ...meeting, id: '3', sectionName: 'BSCS 2B', courseCode: 'CS 201', facultyName: 'Bob Cruz', roomName: 'LAB-201', day: 'Tuesday' },
      { ...meeting, id: '4', sectionName: '', courseCode: 'GEN 100', facultyName: null, roomName: '', day: 'Friday' },
    ];
    vi.mocked(fetchReportData).mockResolvedValue(data);
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');
    fireEvent.click(screen.getByRole('button', { name: 'Preview: CIT Class Schedule' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.queryByRole('searchbox')).toBeNull();
    const classes = dialog.getByRole('button', { name: /Total 4 Classes Scheduled/, pressed: true });
    const sections = dialog.getByRole('button', { name: /Total 2 Active Sections/, pressed: false });
    const instructors = dialog.getByRole('button', { name: /Total 2 Instructors Teaching/, pressed: false });
    const rooms = dialog.getByRole('button', { name: /Total 2 Rooms Occupied/, pressed: false });
    for (const card of [classes, sections, instructors, rooms]) {
      expect(card.tagName).toBe('BUTTON');
      expect(card.getAttribute('aria-controls')).toBe('department-schedule-table');
    }
    expect(within(dialog.getByRole('table', { name: 'Classes Scheduled' })).getAllByRole('row')).toHaveLength(5);

    fireEvent.click(sections);
    expect(sections.getAttribute('aria-pressed')).toBe('true');
    expect(classes.getAttribute('aria-pressed')).toBe('false');
    const sectionTable = within(dialog.getByRole('table', { name: 'Active Sections' }));
    expect(sectionTable.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Section', 'Classes', 'Days']);
    expect(sectionTable.getAllByRole('row')).toHaveLength(3);
    const sectionRow = within(sectionTable.getByRole('cell', { name: 'BSIT 1A' }).closest('tr')!);
    expect(sectionRow.getByRole('cell', { name: '2' })).toBeTruthy();
    expect(sectionRow.getByRole('cell', { name: /Mon.*Wed/ })).toBeTruthy();
    expect(sections.textContent).toContain('Total 2');

    fireEvent.click(instructors);
    const instructorTable = within(dialog.getByRole('table', { name: 'Instructors Teaching' }));
    expect(instructorTable.getByRole('columnheader', { name: 'Instructor' })).toBeTruthy();
    expect(instructorTable.getAllByRole('row')).toHaveLength(3);
    expect(instructorTable.getByRole('cell', { name: 'Alice Santos' })).toBeTruthy();
    expect(instructorTable.getByRole('cell', { name: 'Bob Cruz' })).toBeTruthy();

    fireEvent.click(rooms);
    const roomTable = within(dialog.getByRole('table', { name: 'Rooms Occupied' }));
    expect(roomTable.getByRole('columnheader', { name: 'Room' })).toBeTruthy();
    expect(roomTable.getAllByRole('row')).toHaveLength(3);
    expect(roomTable.getByRole('cell', { name: 'SCI-101' })).toBeTruthy();
    expect(roomTable.getByRole('cell', { name: 'LAB-201' })).toBeTruthy();

    fireEvent.click(classes);
    const scheduleTable = dialog.getByRole('table', { name: 'Classes Scheduled' });
    expect(scheduleTable.id).toBe('department-schedule-table');
    expect(within(scheduleTable).getAllByRole('row')).toHaveLength(5);
    expect(within(scheduleTable).getByRole('columnheader', { name: 'Course Code & Title' })).toBeTruthy();
  });

  it('changes teaching load details by summary card with deload-aware overload and average ordering', async () => {
    const data = mapInitialData({
      active_semester: null, rooms: [], faculties: [], sections: [], schedules: [], departments: [], users: [],
    }, { isVpaa: true });
    data.faculties = [
      { id: '1', name: 'Alice Santos', assignedUnits: 15, maxUnits: 18, deloadUnits: 6 },
      { id: '2', name: 'Bob Cruz', assignedUnits: 6, maxUnits: 18 },
      { id: '3', name: 'Cara Reyes', assignedUnits: 0, maxUnits: 18 },
      { id: '4', name: 'Dana Lim', assignedUnits: 18, maxUnits: 18 },
    ];
    vi.mocked(fetchReportData).mockResolvedValue(data);
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');
    fireEvent.click(screen.getByRole('tab', { name: /Teaching Load/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview: CIT Instructors Load' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.queryByRole('searchbox')).toBeNull();
    const instructors = dialog.getByRole('button', { name: /Total 4 Instructors/, pressed: true });
    const assigned = dialog.getByRole('button', { name: /Total 39 Assigned Units/, pressed: false });
    const overloaded = dialog.getByRole('button', { name: /Total 1 Overloaded/, pressed: false });
    const average = dialog.getByRole('button', { name: /9.8 units Average Load/, pressed: false });
    for (const card of [instructors, assigned, overloaded, average]) {
      expect(card.tagName).toBe('BUTTON');
      expect(card.getAttribute('aria-controls')).toBe('teaching-load-table');
    }
    expect(within(dialog.getByRole('table', { name: 'Instructors' })).getAllByRole('row')).toHaveLength(5);

    fireEvent.click(assigned);
    expect(assigned.getAttribute('aria-pressed')).toBe('true');
    expect(instructors.getAttribute('aria-pressed')).toBe('false');
    const assignedTable = within(dialog.getByRole('table', { name: 'Assigned Units' }));
    expect(assignedTable.getAllByRole('row')).toHaveLength(4);
    expect(assignedTable.queryByRole('cell', { name: 'Cara Reyes' })).toBeNull();
    expect(assignedTable.getByRole('cell', { name: 'Bob Cruz' })).toBeTruthy();
    expect(assigned.textContent).toContain('Total 39');

    fireEvent.click(overloaded);
    expect(overloaded.getAttribute('aria-pressed')).toBe('true');
    const overloadedTable = within(dialog.getByRole('table', { name: 'Overloaded' }));
    expect(overloadedTable.getAllByRole('row')).toHaveLength(2);
    expect(overloadedTable.getByRole('cell', { name: 'Alice Santos' })).toBeTruthy();
    expect(overloadedTable.getByRole('cell', { name: '+3 overload' })).toBeTruthy();
    expect(overloadedTable.queryByRole('cell', { name: 'Dana Lim' })).toBeNull();
    expect(overloadedTable.queryByRole('cell', { name: 'Bob Cruz' })).toBeNull();

    fireEvent.click(average);
    const averageTable = within(dialog.getByRole('table', { name: 'Average Load' }));
    expect(averageTable.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent))
      .toEqual(['Dana Lim', 'Alice Santos', 'Bob Cruz', 'Cara Reyes']);
    expect(averageTable.getByRole('columnheader', { name: 'Assigned Units' })).toBeTruthy();

    fireEvent.click(instructors);
    const loadTable = dialog.getByRole('table', { name: 'Instructors' });
    expect(loadTable.id).toBe('teaching-load-table');
    expect(within(loadTable).getAllByRole('row')).toHaveLength(5);
  });

  describe('room utilization summary', () => {
    const emptyRoomData = () => mapInitialData({
      active_semester: null, rooms: [], faculties: [], sections: [], schedules: [], departments: [], users: [],
    }, { isVpaa: true });

    const openRoomReport = async () => {
      render(<Reports />);
      await screen.findByText('CIT Class Schedule');
      fireEvent.click(screen.getByRole('tab', { name: /Room Utilization/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Preview: CIT Room Utilization' }));
      return within(await screen.findByRole('dialog'));
    };

    it('opens a room utilization PDF listing every room in the summary with totals', async () => {
      vi.mocked(fetchReportData).mockResolvedValue({
        ...emptyRoomData(),
        roomSummary: {
          total_rooms: 2, total_laboratories: 1, unavailable_rooms: 1, requests: [],
          rooms: [
            { id: 1, room_code: 'SCI-101', building: 'Science Building', room_type: 'lecture', status: 'available', department_id: 1 },
            { id: 2, room_code: 'LAB-201', building: null, room_type: 'laboratory', status: 'not available', department_id: 1 },
          ],
        },
      });
      render(<Reports />);
      await screen.findByText('CIT Class Schedule');
      fireEvent.click(screen.getByRole('tab', { name: /Room Utilization/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Preview: CIT Room Utilization' }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Generate PDF/ }));
      await waitFor(() => expect(pdfPreview.show).toHaveBeenCalledWith(expect.any(Blob), 'room.pdf'));
      expect(vi.mocked(buildRoomUtilizationPdf).mock.calls[0][0]).toMatchObject({
        title: 'CIT Room Utilization',
        totals: { rooms: 2, laboratories: 1, unavailable: 1 },
        rows: [
          { code: 'SCI-101', building: 'Science Building', roomType: 'Lecture', scheduledClasses: 0, status: 'Available' },
          { code: 'LAB-201', building: 'Main Campus', roomType: 'Laboratory', scheduledClasses: 0, status: 'Unavailable' },
        ],
      });
    });

    it('drills into all rooms or laboratories including unused rooms and resets request details', async () => {
      const scheduledRoom = {
        id: 1, room_code: 'SCI-101', building: 'Science Building', room_type: 'lecture' as const,
        status: 'available' as const, department_id: 1,
      };
      vi.mocked(fetchReportData).mockResolvedValue({
        ...mapInitialData({
          active_semester: null, rooms: [scheduledRoom], faculties: [], sections: [], departments: [], users: [],
          schedules: [{
            id: 1, semester_id: 1, department_id: 1, course_id: 10, section_id: 1, room_id: 1, faculty_id: null,
            day: 'Monday', start_time: '07:00:00', end_time: '09:00:00', status: 'approved', mode: 'on-site',
            room: { room_code: 'SCI-101' },
          }],
        }, { isVpaa: true }),
        roomSummary: {
          total_rooms: 4, total_laboratories: 2, unavailable_rooms: 1, requests: [],
          rooms: [
            scheduledRoom,
            { id: 2, room_code: 'UNUSED-LECTURE', building: null, room_type: 'lecture', status: 'available', department_id: 1 },
            { id: 3, room_code: 'LAB-201', building: 'Science Building', room_type: 'laboratory', status: 'available', department_id: 1 },
            { id: 4, room_code: 'LAB-202', building: 'Science Building', room_type: 'laboratory', status: 'not available', department_id: 1 },
          ],
        },
      });
      const dialog = await openRoomReport();
      const totalRooms = dialog.getByRole('button', { name: /Total 4 Rooms/, pressed: false });
      const laboratories = dialog.getByRole('button', { name: /Total 2 Laboratory/, pressed: false });
      const table = dialog.getByRole('table', { name: 'Room utilization' });
      const initialRooms = within(table);
      expect(totalRooms.tagName).toBe('BUTTON');
      expect(laboratories.tagName).toBe('BUTTON');
      expect(totalRooms.getAttribute('aria-controls')).toBe(table.id);
      expect(laboratories.getAttribute('aria-controls')).toBe(table.id);
      expect(initialRooms.getAllByRole('row')).toHaveLength(2);
      expect(initialRooms.getByRole('cell', { name: 'SCI-101' })).toBeTruthy();
      expect(initialRooms.queryByRole('cell', { name: 'LAB-201' })).toBeNull();

      expect(dialog.queryByRole('searchbox')).toBeNull();
      const requestCard = dialog.getByRole('button', { name: /Total 0 Room Request/ });
      fireEvent.click(requestCard);
      fireEvent.click(within(dialog.getByRole('group', { name: 'Room request options' })).getByRole('button', { name: /^Requester/ }));
      expect(dialog.getByRole('table', { name: 'Requester requests' })).toBeTruthy();
      expect(dialog.queryByRole('table', { name: 'Room utilization' })).toBeNull();
      fireEvent.click(laboratories);
      const rooms = within(dialog.getByRole('table', { name: 'Room utilization' }));
      expect(laboratories.getAttribute('aria-pressed')).toBe('true');
      expect(totalRooms.getAttribute('aria-pressed')).toBe('false');
      expect(requestCard.getAttribute('aria-expanded')).toBe('false');
      expect(dialog.queryByRole('group', { name: 'Room request options' })).toBeNull();
      expect(dialog.queryByRole('table', { name: 'Requester requests' })).toBeNull();
      expect(rooms.getAllByRole('row')).toHaveLength(3);
      expect(rooms.getByRole('cell', { name: 'LAB-201' })).toBeTruthy();
      expect(rooms.getByRole('cell', { name: 'LAB-202' })).toBeTruthy();
      expect(rooms.queryByRole('cell', { name: 'Unavailable' })).toBeNull();
      expect(rooms.queryByRole('cell', { name: 'SCI-101' })).toBeNull();
      expect(rooms.queryByRole('cell', { name: 'UNUSED-LECTURE' })).toBeNull();

      fireEvent.click(totalRooms);
      expect(totalRooms.getAttribute('aria-pressed')).toBe('true');
      expect(laboratories.getAttribute('aria-pressed')).toBe('false');
      expect(rooms.getAllByRole('row')).toHaveLength(5);
      for (const code of ['SCI-101', 'UNUSED-LECTURE', 'LAB-201', 'LAB-202']) {
        expect(rooms.getByRole('cell', { name: code })).toBeTruthy();
      }
      expect(rooms.queryByRole('columnheader', { name: 'Status' })).toBeNull();

      const unavailableCard = dialog.getByRole('button', { name: /Total 1 Room\/Lab Unavailable/, pressed: false });
      fireEvent.click(unavailableCard);
      expect(unavailableCard.getAttribute('aria-pressed')).toBe('true');
      const unavailableRooms = within(dialog.getByRole('table', { name: 'Room utilization' }));
      expect(unavailableRooms.getByRole('columnheader', { name: 'Status' })).toBeTruthy();
      expect(unavailableRooms.getAllByRole('row')).toHaveLength(2);
      expect(unavailableRooms.getByRole('cell', { name: 'LAB-202' })).toBeTruthy();
      expect(unavailableRooms.getByRole('cell', { name: 'Unavailable' })).toBeTruthy();

      fireEvent.click(requestCard);
      const options = within(dialog.getByRole('group', { name: 'Room request options' }));
      expect(options.getByRole('button', { name: /^Requester/, pressed: false })).toBeTruthy();
      expect(options.getByRole('button', { name: /^Requestee/, pressed: false })).toBeTruthy();
      expect(dialog.queryByRole('table', { name: 'Requester requests' })).toBeNull();
    });

    it('shows inventory totals and separates outgoing and incoming request tables after selecting an option', async () => {
      vi.mocked(fetchReportData).mockResolvedValue({
        ...emptyRoomData(),
        roomSummary: {
          total_rooms: 12, total_laboratories: 3, unavailable_rooms: 2,
          requests: [
            {
              id: 9, direction: 'sent', owner_department: 'College of Business Administration',
              room_code: 'CBA-101', requester: 'College of Information Technology',
              requested_by: 'Jane Santos', status: 'pending',
              windows: [
                { day: 'Monday', start_time: '07:00:00', end_time: '09:00:00' },
                { day: 'Wednesday', start_time: '13:30:00', end_time: '15:00:00' },
              ],
            },
            {
              id: 10, direction: 'received', owner_department: 'College of Information Technology',
              room_code: 'CIT-202', requester: 'College of Business Administration',
              requested_by: 'Alex Cruz', status: 'approved',
              windows: [{ day: 'Tuesday', start_time: '10:00:00', end_time: '11:30:00' }],
            },
          ],
        },
      });
      const dialog = await openRoomReport();
      expect(dialog.getAllByText(/^(Rooms|Laboratory|Room Request|Room\/Lab Unavailable)$/).map((label) => label.textContent))
        .toEqual(['Rooms', 'Laboratory', 'Room Request', 'Room/Lab Unavailable']);
      for (const [label, value] of [['Rooms', 'Total 12'], ['Laboratory', 'Total 3'], ['Room/Lab Unavailable', 'Total 2']]) {
        expect(dialog.getByText(label).previousElementSibling?.textContent).toBe(value);
      }
      const requestCard = dialog.getByRole('button', { name: /Total 2 Room Request/ });
      expect(requestCard.getAttribute('aria-expanded')).toBe('false');
      expect(dialog.queryByRole('group', { name: 'Room request options' })).toBeNull();

      fireEvent.click(requestCard);
      expect(requestCard.getAttribute('aria-expanded')).toBe('true');
      const options = dialog.getByRole('group', { name: 'Room request options' });
      expect(requestCard.getAttribute('aria-controls')).toBe(options.id);
      expect(within(options).getAllByRole('button')).toHaveLength(2);
      expect(options.textContent).toBe('Requester1Requestee1');
      const choices = within(options);
      const requesterOption = choices.getByRole('button', { name: /^Requester/, pressed: false });
      const requestedByOption = choices.getByRole('button', { name: /^Requestee/, pressed: false });
      const requesterDescription = dialog.getByText('Sends a request');
      const requesteeDescription = dialog.getByText('Receives a request');
      for (const [button, caption] of [[requesterOption, 'Sends a request'], [requestedByOption, 'Receives a request']] as const) {
        const description = dialog.getByText(caption);
        expect(within(button).queryByText(caption)).toBeNull();
        expect(choices.queryByText(caption)).toBeNull();
        expect(description.tagName).toBe('P');
        expect(button.getAttribute('aria-describedby')).toBe(description.id);
        expect(description.classList.contains('invisible')).toBe(true);
      }
      expect(dialog.queryByRole('table', { name: 'Requester requests' })).toBeNull();
      expect(dialog.queryByRole('table', { name: 'Requestee requests' })).toBeNull();

      fireEvent.click(requesterOption);
      expect(requesterOption.getAttribute('aria-pressed')).toBe('true');
      expect(requestedByOption.getAttribute('aria-pressed')).toBe('false');
      expect(requesterDescription.classList.contains('invisible')).toBe(false);
      expect(requesteeDescription.classList.contains('invisible')).toBe(true);
      const outgoingRegion = dialog.getByRole('region', { name: 'Requester requests' });
      expect(requesterOption.getAttribute('aria-controls')).toBe(outgoingRegion.id);
      const outgoing = within(dialog.getByRole('table', { name: 'Requester requests' }));
      expect(outgoing.getAllByRole('columnheader').map((header) => header.textContent))
        .toEqual(['Room Owner', 'Room', 'Timeslot', 'Status']);
      expect(outgoing.getByRole('cell', { name: 'College of Business Administration' })).toBeTruthy();
      expect(outgoing.getByRole('cell', { name: 'CBA-101' })).toBeTruthy();
      expect(outgoing.getByText('Mon 7:00 AM – 9:00 AM')).toBeTruthy();
      expect(outgoing.getByText('Wed 1:30 PM – 3:00 PM')).toBeTruthy();
      expect(outgoing.getByRole('cell', { name: /pending/i })).toBeTruthy();
      expect(outgoing.queryByRole('cell', { name: 'CIT-202' })).toBeNull();

      fireEvent.click(requestedByOption);
      expect(requesterOption.getAttribute('aria-pressed')).toBe('false');
      expect(requestedByOption.getAttribute('aria-pressed')).toBe('true');
      expect(requesterDescription.classList.contains('invisible')).toBe(true);
      expect(requesteeDescription.classList.contains('invisible')).toBe(false);
      expect(dialog.queryByRole('region', { name: 'Requester requests' })).toBeNull();
      const incomingRegion = dialog.getByRole('region', { name: 'Requestee requests' });
      expect(requestedByOption.getAttribute('aria-controls')).toBe(incomingRegion.id);
      const incoming = within(dialog.getByRole('table', { name: 'Requestee requests' }));
      expect(incoming.getAllByRole('columnheader').map((header) => header.textContent))
        .toEqual(['Room', 'Timeslot', 'Status']);
      expect(incoming.getByRole('cell', { name: 'CIT-202' })).toBeTruthy();
      expect(incoming.getByText('Tue 10:00 AM – 11:30 AM')).toBeTruthy();
      expect(incoming.getByRole('cell', { name: /approved/i })).toBeTruthy();
      expect(incoming.queryByRole('cell', { name: 'CBA-101' })).toBeNull();
      expect(options.textContent).toBe('Requester1Requestee1');
      expect(choices.getAllByRole('button')).toHaveLength(2);

      fireEvent.click(requesterOption);
      expect(dialog.getByRole('table', { name: 'Requester requests' })).toBeTruthy();
      expect(dialog.queryByRole('table', { name: 'Requestee requests' })).toBeNull();
      fireEvent.click(requestCard);
      expect(requestCard.getAttribute('aria-expanded')).toBe('false');
      expect(dialog.queryByRole('group', { name: 'Room request options' })).toBeNull();
      expect(dialog.queryByRole('region', { name: 'Requester requests' })).toBeNull();
      expect(dialog.queryByRole('region', { name: 'Requestee requests' })).toBeNull();
    });

    it.each([
      [true, 'Total 0 Room Request'],
      [false, 'Total — Room Request'],
    ])('shows empty or missing request messages only after selecting an option with summary=%s', async (hasSummary, cardName) => {
      vi.mocked(fetchReportData).mockResolvedValue({
        ...emptyRoomData(),
        ...(hasSummary ? { roomSummary: { total_rooms: 0, total_laboratories: 0, unavailable_rooms: 0, requests: [] } } : {}),
      });
      const dialog = await openRoomReport();
      fireEvent.click(dialog.getByRole('button', { name: cardName }));
      const options = dialog.getByRole('group', { name: 'Room request options' });
      const choices = within(options);
      expect(choices.getAllByRole('button')).toHaveLength(2);
      expect(options.textContent).toBe('Requester0Requestee0');
      for (const [name, caption] of [[/^Requester/, 'Sends a request'], [/^Requestee/, 'Receives a request']] as const) {
        const button = choices.getByRole('button', { name });
        const description = dialog.getByText(caption);
        expect(within(button).queryByText(caption)).toBeNull();
        expect(choices.queryByText(caption)).toBeNull();
        expect(description.tagName).toBe('P');
        expect(button.getAttribute('aria-describedby')).toBe(description.id);
      }
      expect(dialog.queryByRole('region', { name: 'Requester requests' })).toBeNull();
      expect(dialog.queryByRole('region', { name: 'Requestee requests' })).toBeNull();
      expect(dialog.queryByText(/No (outgoing|incoming) room requests\.|Room request details are unavailable\./)).toBeNull();
      fireEvent.click(choices.getByRole('button', { name: /^Requester/, pressed: false }));
      const outgoing = within(dialog.getByRole('region', { name: 'Requester requests' }));
      expect(outgoing.getByText(hasSummary ? 'No outgoing room requests.' : 'Room request details are unavailable.')).toBeTruthy();
      fireEvent.click(choices.getByRole('button', { name: /^Requestee/, pressed: false }));
      expect(choices.getByRole('button', { name: /^Requestee/, pressed: true })).toBeTruthy();
      expect(dialog.queryByRole('region', { name: 'Requester requests' })).toBeNull();
      const incoming = within(dialog.getByRole('region', { name: 'Requestee requests' }));
      expect(incoming.getByText(hasSummary ? 'No incoming room requests.' : 'Room request details are unavailable.')).toBeTruthy();
      expect(options.textContent).toBe('Requester0Requestee0');
      expect(choices.getAllByRole('button')).toHaveLength(2);
    });
  });

  it('opens on the current approved term and scopes previews and counts to a chosen term', async () => {
    vi.mocked(fetchReportsOverview).mockImplementation(async (semesterId = null) => (
      semesterId === 4
        ? { ...overview, semester: pastTerm, departments: [{ ...overview.departments[0], complete_section_count: 0, instructor_count: 0 }] }
        : { ...overview, semester: semesterId === null ? null : currentTerm }
    ));
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');
    expect(fetchReportsOverview).toHaveBeenNthCalledWith(1, null);
    expect(fetchReportsOverview).toHaveBeenNthCalledWith(2, 5);
    const termSelect = screen.getByRole('combobox', { name: 'Academic term' }) as HTMLSelectElement;
    expect(termSelect.value).toBe('5');
    expect(Array.from(termSelect.options).map((option) => option.textContent))
      .toEqual(['1st Semester, AY 2026-2027 (current)', '2nd Semester, AY 2025-2026']);

    fireEvent.change(termSelect, { target: { value: '4' } });
    await waitFor(() => expect(screen.getByText('No section is fully VPAA-approved this term.')).toBeTruthy());
    expect(fetchReportsOverview).toHaveBeenLastCalledWith(4);
    expect(screen.queryByRole('button', { name: 'Preview: CIT Class Schedule' })).toBeNull();
    expect(screen.getByText('Not ready')).toBeTruthy();
  });

  it('shows the term, generation time and approval basis in the preview', async () => {
    vi.mocked(fetchReportData).mockResolvedValue({
      sections: [{ id: '1' }], schedules: [], departments: [], users: [], faculties: [], activeSemester: currentTerm,
    } as unknown as Awaited<ReturnType<typeof fetchReportData>>);
    render(<Reports />);
    fireEvent.click(await screen.findByRole('button', { name: 'Preview: CIT Class Schedule' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('1st Semester, AY 2026-2027')).toBeTruthy();
    expect(dialog.getByText('Generated')).toBeTruthy();
    expect(dialog.getByText('VPAA-approved records; signatories from approval history')).toBeTruthy();
  });

  it('marks room utilization ready from approved sections instead of inventing a room count', async () => {
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');
    fireEvent.click(screen.getByRole('tab', { name: /Room Utilization/ }));
    expect(await screen.findByText('From 2 approved sections')).toBeTruthy();
    expect(screen.queryByText(/^1 room/)).toBeNull();
  });

  it('explains that nothing can be generated before any term is approved', async () => {
    vi.mocked(fetchReportsOverview).mockResolvedValue({
      semester: null, terms: [],
      departments: [{ ...overview.departments[0], complete_section_count: 0, instructor_count: 0 }],
    });
    render(<Reports />);
    expect(await screen.findByText('No term has VPAA-approved schedules yet.')).toBeTruthy();
    expect((screen.getByRole('combobox', { name: 'Academic term' }) as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /^Preview:/ })).toBeNull();
    expect(fetchReportsOverview).toHaveBeenCalledTimes(1);
  });

  it('logs a room utilization PDF only after it is generated, with its term', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    vi.mocked(fetchReportData).mockResolvedValue({
      sections: [], schedules: [], departments: [], users: [], faculties: [], rooms: [], activeSemester: currentTerm,
    } as unknown as Awaited<ReturnType<typeof fetchReportData>>);
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');
    fireEvent.click(screen.getByRole('tab', { name: /Room Utilization/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview: CIT Room Utilization' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Generate PDF/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/reports/log-download', {
      report_type: 'room', department_id: 1, program_id: null, semester_id: 5,
    }));
    expect(vi.mocked(buildRoomUtilizationPdf).mock.calls[0][0]).toMatchObject({ academicYear: '2026-2027', semester: '1st' });
  });

  it('identifies each department by its uploaded logo, with a fallback when none exists', async () => {
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    vi.mocked(fetchReportsOverview).mockResolvedValue({
      ...overview,
      departments: [
        { ...overview.departments[0], logo },
        { ...overview.departments[0], id: 2, code: 'CBA', name: 'College of Business Administration', logo: null },
      ],
    });
    render(<Reports />);
    const image = await screen.findByRole('img', { name: 'College of Information Technology logo' });
    expect(image.getAttribute('src')).toBe(logo);
    expect(screen.getByRole('img', { name: 'College of Business Administration — no logo uploaded' })).toBeTruthy();
  });

  it('offers no CSV export and no curriculum report', async () => {
    render(<Reports />);
    await screen.findByText('CIT Class Schedule');
    expect(screen.queryByRole('button', { name: /Export CSV/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Curriculums & Courses/ })).toBeNull();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toHaveLength(3);
  });
});
