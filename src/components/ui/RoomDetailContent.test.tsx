import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RoomDetailContent from './RoomDetailContent';
import type { RoomOccupancyBlock } from '../../lib/roomRequests';

afterEach(cleanup);

const grantState = vi.hoisted(() => ({ grants: [] as RoomOccupancyBlock[], error: false }));
vi.mock('../../hooks/useRoomGrants', () => ({
  useRoomGrants: () => ({ grants: grantState.grants, ready: true, error: grantState.error, stale: false, retry: () => undefined }),
}));

const lectureRoom = {
  id: 4,
  room_code: 'BA 201',
  building: 'BA',
  room_type: 'lecture' as const,
  status: 'available' as const,
  department_id: 2,
  department: { id: 2, department_name: 'Business Administration', department_code: 'CBA' },
};

const classAt = (id: number, day: 'Monday' | 'Tuesday', start: string, end: string, extra: Record<string, unknown> = {}) => ({
  id,
  semester_id: 2,
  section_id: id,
  course_id: id,
  faculty_id: null,
  room_id: 4,
  department_id: 6,
  day,
  start_time: `${start}:00`,
  end_time: `${end}:00`,
  mode: 'on-site',
  status: 'submitted',
  section: { id, section_name: `SEC ${id}` },
  course: { id, course_code: `GEC ${id}`, course_name: `Course ${id}`, course_category: 'minor' as const },
  faculty: null,
  ...extra,
});

const maskedAt = (id: number, day: 'Monday' | 'Tuesday', start: string, end: string) => classAt(id, day, start, end, {
  department_id: 2, section_id: null, course_id: null, is_masked: true, section: null, course: null,
});

const grant = (day: string, start: string, end: string): RoomOccupancyBlock => ({
  kind: 'grant', day, start_time: start, end_time: end, department_code: 'CAS', label: 'Lent to CAS',
});

describe('RoomDetailContent room request views', () => {
  beforeEach(() => {
    grantState.grants = [];
    grantState.error = false;
  });

  it('shows another department\'s class only as Occupied in the grid', () => {
    render(<RoomDetailContent isLoading={false} room={lectureRoom} initialViewMode="grid" schedules={[maskedAt(1, 'Tuesday', '10:00', '13:00')]} />);

    expect(screen.getByLabelText(/^Occupied, Tuesday 10:00 AM - 1:00 PM$/)).toBeTruthy();
    expect(screen.queryByText(/GEC/)).toBeNull();
    expect(screen.queryByText(/SEC 1/)).toBeNull();
  });

  it('never stacks a borrowed band on top of the borrower\'s own classes', () => {
    grantState.grants = [grant('Monday', '07:00', '10:00')];
    render(
      <RoomDetailContent
        isLoading={false}
        room={lectureRoom}
        initialViewMode="grid"
        schedules={[classAt(6, 'Monday', '07:00', '08:30')]}
      />,
    );

    expect(screen.getAllByText('GEC 6').length).toBeGreaterThan(0);
    // Only the unfilled remainder of the grant is drawn, beside the class card.
    expect(screen.getByLabelText(/^Borrowed by CAS, Monday 8:30 AM - 10:00 AM$/)).toBeTruthy();
    expect(screen.queryByLabelText(/Borrowed by CAS, Monday 7:00 AM/)).toBeNull();
  });

  it('lists only the free time that can be requested, and requests it', () => {
    grantState.grants = [grant('Monday', '07:00', '10:00')];
    const onRequestSlot = vi.fn();
    render(
      <RoomDetailContent
        isLoading={false}
        room={lectureRoom}
        initialViewMode="list"
        listMode="availability"
        onRequestSlot={onRequestSlot}
        schedules={[maskedAt(1, 'Monday', '13:00', '16:00'), maskedAt(2, 'Monday', '16:00', '19:30')]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Monday/ }));

    const list = screen.getByRole('list', { name: 'Available time slots on Monday' });
    const items = within(list).getAllByRole('listitem').map((item) => item.textContent ?? '');
    // 19:30-20:30 is only an hour, shorter than the 1.5-hour minimum request.
    expect(items).toHaveLength(1);
    expect(items[0]).toContain('10:00 AM - 1:00 PM');

    fireEvent.click(within(list).getByRole('button', { name: /Request Monday/ }));
    expect(onRequestSlot).toHaveBeenCalledWith({ day: 'Monday', start: '10:00', duration: 180 });
  });

  it('says so when a day has no available time', () => {
    render(
      <RoomDetailContent
        isLoading={false}
        room={lectureRoom}
        initialViewMode="list"
        listMode="availability"
        schedules={[maskedAt(1, 'Tuesday', '07:00', '20:30')]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Tuesday/ }));

    expect(screen.getByText('No available time slots')).toBeTruthy();
  });

  it('offers no free time while the owner awaits VPAA approval', () => {
    const message = "This room is not yet available for borrowing. The owning department's schedules are awaiting VPAA approval.";
    const onRequestSlot = vi.fn();
    render(
      <RoomDetailContent
        isLoading={false}
        room={lectureRoom}
        initialViewMode="list"
        listMode="availability"
        borrowingClosedMessage={message}
        onRequestSlot={onRequestSlot}
        schedules={[]}
      />,
    );

    expect(screen.queryByRole('list', { name: /Available time slots/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Request / })).toBeNull();
    expect(screen.getAllByText(message).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Grid View' }));
    expect(screen.queryByText('Available')).toBeNull();
  });

  it('refuses to claim free time while borrowed windows are unknown', () => {
    grantState.error = true;
    render(<RoomDetailContent isLoading={false} room={lectureRoom} initialViewMode="list" listMode="availability" schedules={[]} />);

    expect(screen.queryByRole('list', { name: /Available time slots/ })).toBeNull();
    expect(screen.getByText(/Available times cannot be shown/)).toBeTruthy();
  });
});

describe('RoomDetailContent grid view', () => {
  it('uses the scheduler Monday-first grid and schedule card', () => {
    const { container } = render(
      <RoomDetailContent
        isLoading={false}
        room={{
          id: 4,
          room_code: 'COMPLAB1',
          building: 'Building 4',
          room_type: 'laboratory',
          status: 'available',
          department_id: 7,
          department: { id: 7, department_name: 'College of Information Technology', department_code: 'CIT' },
        }}
        schedules={[{
          id: 10,
          semester_id: 9,
          section_id: 3,
          course_id: 12,
          faculty_id: 5,
          room_id: 4,
          department_id: 7,
          day: 'Monday',
          start_time: '07:00:00',
          end_time: '09:00:00',
          mode: 'on-site',
          meeting_type: 'laboratory',
          status: 'finalized',
          section: { id: 3, section_name: 'BSIT 4D' },
          course: {
            id: 12,
            course_code: 'IT 131',
            course_name: 'Systems Laboratory',
            course_category: 'major',
            units: 3,
            lecture_hours: 0,
            lab_hours: 3,
          },
          faculty: { id: 5, first_name: 'Donald', last_name: 'Knuth' },
        }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Grid View' }));

    const text = container.textContent ?? '';
    expect(text.indexOf('Monday')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Monday')).toBeLessThan(text.indexOf('Sunday'));
    expect(screen.getAllByText('IT 131').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Donald Knuth').length).toBeGreaterThan(0);
  });
});
