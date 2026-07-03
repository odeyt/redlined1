import { useState, useMemo } from 'react';

export interface PaginationOptions {
  pageSize?: number;
}

export interface PaginationResult<T> {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  pageItems: T[];
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  goToFirst: () => void;
  goToLast: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  startIndex: number;
  endIndex: number;
}

export function usePagination<T>(items: T[], options: PaginationOptions = {}): PaginationResult<T> {
  const { pageSize = 25 } = options;
  const [page, setPageState] = useState(1);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Clamp page to valid range when items change
  const clampedPage = Math.min(Math.max(1, page), totalPages);

  const pageItems = useMemo(() => {
    const start = (clampedPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, clampedPage, pageSize]);

  const startIndex = totalItems === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const endIndex = Math.min(clampedPage * pageSize, totalItems);

  function setPage(p: number) {
    setPageState(Math.min(Math.max(1, p), totalPages));
  }

  return {
    page: clampedPage,
    pageSize,
    totalPages,
    totalItems,
    pageItems,
    setPage,
    nextPage: () => setPage(clampedPage + 1),
    prevPage: () => setPage(clampedPage - 1),
    goToFirst: () => setPage(1),
    goToLast: () => setPage(totalPages),
    hasPrev: clampedPage > 1,
    hasNext: clampedPage < totalPages,
    startIndex,
    endIndex,
  };
}
