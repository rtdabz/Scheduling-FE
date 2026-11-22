import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import Pager from './Pager';
import { usePagedItems } from './usePagedItems';

afterEach(() => cleanup());

const items = Array.from({ length: 30 }, (_, index) => index + 1);

describe('usePagedItems', () => {
  it('slices pages, clamps when the list shrinks, and resets when the key changes', () => {
    const { result, rerender } = renderHook(
      ({ list, key }: { list: number[]; key: string }) => usePagedItems(list, 12, key),
      { initialProps: { list: items, key: 'a' } },
    );
    expect(result.current.pageItems).toEqual(items.slice(0, 12));

    act(() => result.current.pagerProps.onPageChange(2));
    expect(result.current.pageItems).toEqual(items.slice(24));

    rerender({ list: items.slice(0, 15), key: 'a' });
    expect(result.current.pagerProps.pageIndex).toBe(1);
    expect(result.current.pageItems).toEqual(items.slice(12, 15));

    rerender({ list: items, key: 'b' });
    expect(result.current.pagerProps.pageIndex).toBe(0);

    act(() => result.current.pagerProps.onPageChange(1));
    act(() => result.current.pagerProps.onPageSizeChange(24));
    expect(result.current.pagerProps.pageIndex).toBe(0);
    expect(result.current.pageItems).toHaveLength(24);
  });
});

describe('Pager', () => {
  it('shows the range and moves between pages', () => {
    const changes: number[] = [];
    render(<Pager pageIndex={1} pageSize={12} total={30} totalLabel="rooms" onPageChange={(index) => changes.push(index)} onPageSizeChange={() => undefined} pageSizeOptions={[12, 24]} />);
    expect(screen.getByText('Page 2 of 3')).toBeTruthy();
    expect(screen.getByText('13-24')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Last page' }));
    expect(changes).toEqual([0, 2, 2]);
  });

  it('disables moving past either end', () => {
    render(<Pager pageIndex={0} pageSize={12} total={5} onPageChange={() => undefined} onPageSizeChange={() => undefined} />);
    expect((screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
