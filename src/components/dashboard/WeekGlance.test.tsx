import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WeekGlance } from './WeekGlance';

afterEach(cleanup);

const grid = { opening_time: '07:00', closing_time: '12:00' };

describe('WeekGlance', () => {
  it('counts a meeting in every hour it overlaps and names the busiest hour', () => {
    render(<WeekGlance grid={grid} meetings={[
      { day: 'Monday', start_time: '08:00:00', end_time: '10:00:00' },
      { day: 'Monday', start_time: '09:30:00', end_time: '11:00:00' },
      { day: 'Tuesday', start_time: '07:00:00', end_time: '08:00:00' },
    ]} />);
    expect(screen.getByTitle('Monday 9 AM: 2 meetings')).toBeTruthy();
    expect(screen.getByTitle('Monday 10 AM: 1 meeting')).toBeTruthy();
    // Ending exactly on the hour does not spill into the next one.
    expect(screen.getByTitle('Tuesday 8 AM: 0 meetings')).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('3 class meetings');
    expect(screen.getByText('Monday 9 AM')).toBeTruthy();
  });

  it('adds Sunday only when a meeting falls on it, and skips meetings without a time', () => {
    const { rerender } = render(<WeekGlance grid={grid} meetings={[{ day: 'Monday', start_time: '08:00', end_time: '09:00' }]} />);
    expect(screen.queryByText('Sun')).toBeNull();
    rerender(<WeekGlance grid={grid} meetings={[{ day: 'Sunday', start_time: '08:00', end_time: '09:00' }, { day: 'Monday', start_time: null, end_time: null }]} />);
    expect(screen.getByText('Sun')).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('1 class meetings');
  });

  it('says so when no meeting has a day and time yet', () => {
    render(<WeekGlance grid={grid} meetings={[{ day: null, start_time: null, end_time: null }]} />);
    expect(screen.getByText('No class meetings have a day and time yet.')).toBeTruthy();
  });
});
