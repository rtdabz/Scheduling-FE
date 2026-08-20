import type { ReactElement } from 'react';
import { cloneElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InstructorWorkloadChart, { type InstructorWorkload } from './InstructorWorkloadChart';

// ResponsiveContainer measures its parent, and jsdom reports 0x0 — recharts then
// draws nothing at all. Give the chart a fixed box so the assertions below see
// real geometry.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 460, height: 240 } as Partial<Record<string, unknown>>),
  };
});

// The vitest config does not enable globals, so testing-library's automatic
// cleanup never registers and rendered rows would pile up across cases.
afterEach(cleanup);

const instructor = (over: Partial<InstructorWorkload> & { id: number }): InstructorWorkload => ({
  first_name: 'Grace',
  last_name: 'Hopper',
  assigned: 0,
  max: 21,
  ...over,
});

describe('InstructorWorkloadChart', () => {
  it('draws a track and a bar for every instructor, including those with nothing assigned', () => {
    const { container } = render(<InstructorWorkloadChart instructors={[
      instructor({ id: 1, first_name: 'Richie', last_name: 'Dadubo', assigned: 3 }),
      instructor({ id: 2, first_name: 'Margaret', last_name: 'Hamilton', assigned: 0 }),
      instructor({ id: 3, first_name: 'Grace', last_name: 'Hopper', assigned: 0, max: 0 }),
    ]}/>);

    // Regression: recharts drops a zero-value bar together with its background
    // track and label, so unassigned instructors used to render as a bare name.
    expect(container.querySelectorAll('.recharts-bar-background-rectangle')).toHaveLength(3);
    expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(3);
  });

  it('labels each row with the instructor and their assigned/max units', () => {
    const { getByText, getByTitle } = render(<InstructorWorkloadChart instructors={[
      instructor({ id: 1, first_name: 'Richie', last_name: 'Dadubo', assigned: 3, max: 21 }),
    ]}/>);

    expect(getByTitle('Richie Dadubo')).toBeTruthy();
    expect(getByText('3/21u')).toBeTruthy();
  });

  it('shows the photo when there is one and initials otherwise', () => {
    const { container, getByText } = render(<InstructorWorkloadChart instructors={[
      instructor({ id: 1, first_name: 'Richie', last_name: 'Dadubo', profile_picture: 'https://example.test/rd.png' }),
      instructor({ id: 2, first_name: 'Margaret', last_name: 'Hamilton', profile_picture: null }),
    ]}/>);

    // The tick reads its row by index; recharts never passes the datum itself,
    // which is what silently forced every avatar to initials before.
    const photos = container.querySelectorAll('img');
    expect(photos).toHaveLength(1);
    expect(photos[0].getAttribute('src')).toBe('https://example.test/rd.png');
    expect(getByText('MH')).toBeTruthy();
  });

  it('keeps every avatar on the same left edge regardless of name length', () => {
    const { container } = render(<InstructorWorkloadChart instructors={[
      instructor({ id: 1, first_name: 'Bo', last_name: 'Li' }),
      instructor({ id: 2, first_name: 'Margaret', last_name: 'Hamilton-Fitzgerald' }),
    ]}/>);

    const boxes = [...container.querySelectorAll('foreignObject')];
    expect(boxes).toHaveLength(2);
    const lefts = new Set(boxes.map(box => box.getAttribute('x')));
    expect(lefts.size).toBe(1);
  });

  it('caps an over-allocated instructor at the end of the track', () => {
    const { container, getByText } = render(<InstructorWorkloadChart instructors={[
      instructor({ id: 1, assigned: 30, max: 21 }),
    ]}/>);

    const [track] = container.querySelectorAll('.recharts-bar-background-rectangle');
    const [bar] = container.querySelectorAll('.recharts-bar-rectangle path, .recharts-bar-rectangle');
    expect(Number(bar.getAttribute('width') ?? track.getAttribute('width'))).toBeLessThanOrEqual(
      Number(track.getAttribute('width')),
    );
    expect(getByText('30/21u')).toBeTruthy();
  });

  it('renders an empty state rather than an empty chart', () => {
    const { container, getByText } = render(<InstructorWorkloadChart instructors={[]}/>);
    expect(getByText('No faculty available to this department.')).toBeTruthy();
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });
});
