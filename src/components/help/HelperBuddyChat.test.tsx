import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import HelperBuddyChat from './HelperBuddyChat';

afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });

it('clears old schedule feedback and cancels a pending reply when schedules are reset', () => {
  vi.useFakeTimers();
  render(<MemoryRouter><HelperBuddyChat /></MemoryRouter>);
  act(() => {
    window.dispatchEvent(new CustomEvent('show-helper-buddy', {
      detail: { text: 'The Dean returned the old schedule.', status: 'rejected', type: 'rejected', open: true },
    }));
  });
  expect(screen.getByText('The Dean returned the old schedule.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: "Why can't I submit?" }));
  act(() => {
    window.dispatchEvent(new CustomEvent('schedule-workspace-reset'));
    vi.advanceTimersByTime(2000);
  });
  expect(screen.queryByRole('textbox', { name: 'Ask TCC Scheduling Buddy' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Move or open TCC Scheduling Buddy' }));
  expect(screen.getByText('Hello. I can help you with the next step in the scheduling system.')).toBeTruthy();
  expect(screen.queryByText('The Dean returned the old schedule.')).toBeNull();
  expect(screen.queryByText("Why can't I submit?", { selector: 'p' })).toBeNull();
});
