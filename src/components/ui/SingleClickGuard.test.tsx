import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SingleClickGuard from './SingleClickGuard';

afterEach(() => {
  vi.useRealTimers();
});

describe('SingleClickGuard', () => {
  it('blocks repeated button clicks until the lock expires', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const { getByRole } = render(
      <SingleClickGuard>
        <button onClick={onClick}>Save</button>
      </SingleClickGuard>,
    );
    const button = getByRole('button', { name: 'Save' });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-busy')).toBe('true');

    vi.advanceTimersByTime(800);
    expect(button.hasAttribute('aria-busy')).toBe(false);
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('allows controls explicitly marked as repeatable', () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <SingleClickGuard>
        <button data-repeatable-click onClick={onClick}>Next</button>
      </SingleClickGuard>,
    );
    const button = getByRole('button', { name: 'Next' });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
