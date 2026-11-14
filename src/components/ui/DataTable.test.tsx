import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPortal } from 'react-dom';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from './DataTable';
import { useDataTable } from './useDataTable';

afterEach(() => cleanup());

interface Item { id: number; name: string }

function Harness({ onRowClick, onView }: { onRowClick: (item: Item) => void; onView: (item: Item) => void }) {
  const columns: ColumnDef<Item>[] = [
    { id: 'name', header: 'Name', cell: ({ row }) => row.original.name },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <>
          <button type="button" onClick={() => onView(row.original)}>View {row.original.name}</button>
          <input type="checkbox" aria-label={`Select ${row.original.name}`} onChange={() => undefined} />
          {createPortal(<p>Portaled {row.original.name}</p>, document.body)}
        </>
      ),
    },
  ];
  const table = useDataTable({ data: [{ id: 1, name: 'Alpha' }], columns, pageSize: false });
  return <DataTable table={table} onRowClick={onRowClick} ariaLabel="Items" />;
}

describe('DataTable row click', () => {
  it('opens the row from any plain cell and from the keyboard', () => {
    const onRowClick = vi.fn();
    render(<Harness onRowClick={onRowClick} onView={vi.fn()} />);

    fireEvent.click(screen.getByText('Alpha'));
    expect(onRowClick).toHaveBeenCalledWith({ id: 1, name: 'Alpha' });

    const row = screen.getByText('Alpha').closest('tr')!;
    expect(row.className).toContain('cursor-pointer');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it('leaves buttons, form controls and portaled content to their own handlers', () => {
    const onRowClick = vi.fn();
    const onView = vi.fn();
    render(<Harness onRowClick={onRowClick} onView={onView} />);

    fireEvent.click(screen.getByRole('button', { name: 'View Alpha' }));
    expect(onView).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
    fireEvent.click(screen.getByText('Portaled Alpha'));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
