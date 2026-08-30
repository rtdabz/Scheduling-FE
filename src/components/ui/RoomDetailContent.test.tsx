import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RoomDetailContent from './RoomDetailContent';

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
          term_id: 9,
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
