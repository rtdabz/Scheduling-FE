import { useEffect, useState } from 'react';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type Row,
  type SortingState,
} from '@tanstack/react-table';

export interface UseDataTableOptions<T> {
  data: T[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  /** Rows per page, or false for an unpaginated table (modals, short lists). */
  pageSize?: number | false;
  initialSorting?: SortingState;
  /** Free-text filter applied across every column that has an accessor. */
  globalFilter?: string;
  getRowId?: (row: T, index: number) => string;
  enableSorting?: boolean;
}

/**
 * The client-side table setup most WICARS screens need: sorting, an optional
 * global filter, and optional pagination, with state kept here so callers
 * only describe their columns.
 */
export function useDataTable<T>({
  data,
  columns,
  pageSize = 10,
  initialSorting = [],
  globalFilter,
  getRowId,
  enableSorting = true,
}: UseDataTableOptions<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSize === false ? Number.MAX_SAFE_INTEGER : pageSize,
  });
  const paginated = pageSize !== false;

  const table = useReactTable<T>({
    data,
    columns,
    state: {
      sorting,
      ...(paginated ? { pagination } : {}),
      ...(globalFilter !== undefined ? { globalFilter } : {}),
    },
    getRowId: getRowId as ((row: T, index: number, parent?: Row<T>) => string) | undefined,
    enableSorting,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    // Reloading after an edit must not throw the user back to page one;
    // the effect below only steps back when the current page empties.
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(globalFilter !== undefined ? { getFilteredRowModel: getFilteredRowModel() } : {}),
    ...(paginated ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  });

  const pageCount = paginated ? table.getPageCount() : 1;
  useEffect(() => {
    if (!paginated) return;
    // A narrower search or a deleted row can leave the page past the end.
    setPagination((current) => (
      current.pageIndex > 0 && current.pageIndex >= pageCount
        ? { ...current, pageIndex: Math.max(0, pageCount - 1) }
        : current
    ));
  }, [paginated, pageCount]);

  useEffect(() => {
    if (!paginated) return;
    setPagination((current) => (current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }));
  }, [paginated, globalFilter]);

  return table;
}
