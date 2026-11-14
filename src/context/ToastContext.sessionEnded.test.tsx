import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearSessionEnded, markSessionEnded } from '../lib/sessionEnded';
import { ToastProvider, useToast } from './ToastContext';

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

describe('failure notices after the session ends', () => {
  afterEach(clearSessionEnded);

  it('shows notices while signed in', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => result.current.toast.error('Load Failed', 'Could not load rooms.'));
    expect(result.current.toasts).toHaveLength(1);
  });

  it('drops the notices of requests cut off by the session ending', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    markSessionEnded();
    act(() => {
      result.current.toast.error('Load Failed', 'Could not load rooms.');
      result.current.toast.warning('Not Saved', 'Try again.');
      result.current.toast.info('Heads Up', 'Something.');
    });
    expect(result.current.toasts).toHaveLength(0);
  });
});
