import { useMemo, useState } from 'react';

/**
 * Client-side paging for a plain array shown as a grid, returning props for `<Pager>`.
 * Returns to the first page whenever `resetKey` changes (for example, a different building is opened).
 */
export function usePagedItems<T>(items: T[], initialPageSize = 12, resetKey?: unknown) {
  const [page, setPage] = useState({ key: resetKey, index: 0 });
  const [pageSize, setPageSize] = useState(initialPageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const requested = page.key === resetKey ? page.index : 0;
  const pageIndex = Math.min(requested, pageCount - 1);

  const pageItems = useMemo(
    () => items.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize),
    [items, pageIndex, pageSize],
  );

  return {
    pageItems,
    pagerProps: {
      pageIndex,
      pageSize,
      total: items.length,
      onPageChange: (index: number) => setPage({ key: resetKey, index }),
      onPageSizeChange: (size: number) => { setPageSize(size); setPage({ key: resetKey, index: 0 }); },
    },
  };
}
