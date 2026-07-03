'use client';

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onFirst: () => void;
  onLast: () => void;
  onPage: (p: number) => void;
}

export function Pagination({
  page, totalPages, totalItems, startIndex, endIndex,
  hasPrev, hasNext, onPrev, onNext, onFirst, onLast, onPage,
}: PaginationProps) {
  if (totalItems === 0) return null;

  // Build visible page number list (max 7 slots, with ellipsis)
  function getPages(): (number | '...')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  }

  const btnStyle = (active = false, disabled = false): React.CSSProperties => ({
    border: active ? '1.5px solid var(--accent, #cc0000)' : '1.5px solid var(--line, #e0e0e0)',
    background: active ? 'var(--accent, #cc0000)' : 'var(--surface, #fff)',
    color: active ? '#fff' : disabled ? 'var(--muted, #666)' : 'var(--text, #111)',
    borderRadius: 6,
    padding: '5px 10px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    fontSize: 13,
    fontWeight: active ? 700 : 400,
    minWidth: 34,
    minHeight: 34,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '12px 4px 4px',
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 13, color: 'var(--muted, #666)', whiteSpace: 'nowrap' }}>
        {startIndex}–{endIndex} of {totalItems.toLocaleString()}
      </span>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={btnStyle(false, !hasPrev)} disabled={!hasPrev} onClick={onFirst} title="First page">«</button>
        <button style={btnStyle(false, !hasPrev)} disabled={!hasPrev} onClick={onPrev} title="Previous page">‹</button>

        {getPages().map((p, i) =>
          p === '...'
            ? <span key={`ellipsis-${i}`} style={{ padding: '0 4px', color: 'var(--muted)', fontSize: 13 }}>…</span>
            : <button key={p} style={btnStyle(p === page)} onClick={() => onPage(p as number)}>{p}</button>
        )}

        <button style={btnStyle(false, !hasNext)} disabled={!hasNext} onClick={onNext} title="Next page">›</button>
        <button style={btnStyle(false, !hasNext)} disabled={!hasNext} onClick={onLast} title="Last page">»</button>
      </div>
    </div>
  );
}
