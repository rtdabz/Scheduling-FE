import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import InstructorWorkloadChart, { type InstructorWorkload } from './InstructorWorkloadChart';

afterEach(cleanup);

const instructor = (over: Partial<InstructorWorkload> & { id: number }): InstructorWorkload => ({
  first_name: 'Grace',
  last_name: 'Hopper',
  assigned: 0,
  max: 21,
  ...over,
});

describe('InstructorWorkloadChart', () => {
  it('draws a bar for every instructor, including those with nothing assigned', () => {
    const { getAllByRole } = render(<InstructorWorkloadChart instructors={[
      instructor({ id: 1, first_name: 'Richie', last_name: 'Dadubo', assigned: 3 }),
      instructor({ id: 2, first_name: 'Margaret', last_name: 'Hamilton', assigned: 0 }),
      instructor({ id: 3, first_name: 'Grace', last_name: 'Hopper', assigned: 0, max: 0 }),
    ]}/>);

    const bars = getAllByRole('progressbar');
    expect(bars).toHaveLength(3);
    expect(bars.map((bar) => bar.getAttribute('aria-valuenow'))).toEqual(['14', '0', '0']);
  });

  it('labels each row with the instructor and their assigned/max units', () => {
    const { getByText, getByTitle } = render(<InstructorWorkloadChart instructors={[
      instructor({ id: 1, first_name: 'Richie', last_name: 'Dadubo', assigned: 3, max: 21 }),
    ]}/>);

    expect(getByTitle('Richie Dadubo')).toBeTruthy();
    expect(getByText('3/21 units')).toBeTruthy();
  });

  it('shows the photo when there is one and the default avatar otherwise', () => {
    const { container, getByLabelText } = render(<InstructorWorkloadChart instructors={[
      instructor({ id: 1, first_name: 'Richie', last_name: 'Dadubo', profile_picture: 'https://example.test/rd.png' }),
      instructor({ id: 2, first_name: 'Margaret', last_name: 'Hamilton', profile_picture: null }),
    ]}/>);

    const photos = container.querySelectorAll('img');
    expect(photos).toHaveLength(1);
    expect(photos[0].getAttribute('src')).toBe('https://example.test/rd.png');
    expect(getByLabelText('Profile photo')).toBeTruthy();
  });

  it('caps an over-allocated instructor at the end of the track', () => {
    const { getByRole, getByText } = render(<InstructorWorkloadChart instructors={[
      instructor({ id: 1, assigned: 30, max: 21 }),
    ]}/>);

    const bar = getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%');
    expect(getByText('30/21 units')).toBeTruthy();
  });

  it('renders an empty state rather than empty bars', () => {
    const { queryAllByRole, getByText } = render(<InstructorWorkloadChart instructors={[]}/>);
    expect(getByText('No instructors available to this department.')).toBeTruthy();
    expect(queryAllByRole('progressbar')).toHaveLength(0);
  });
});
