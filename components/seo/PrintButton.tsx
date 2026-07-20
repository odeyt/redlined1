'use client';

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{ background: 'var(--surface-soft, #f1f5f9)', border: '1px solid var(--line, #d1d5db)', padding: '10px 18px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
    >
      🖨 Print
    </button>
  );
}
