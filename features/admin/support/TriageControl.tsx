'use client';
/**
 * features/admin/support/TriageControl.tsx
 * The platform owner's real / test / spam control for one support ticket.
 *
 * This is convenience, not security: it only calls POST /api/admin/support/triage,
 * which authorizes the owner on the server. Nothing here decides who may mark a
 * ticket. Marking changes how the portal counts a ticket; the ticket, its messages
 * and its history are never touched, and any marking can be changed back.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { C } from '@/features/admin/shared/theme';
import type { SupportTriage } from '@/lib/admin/supportTriage';

const OPTIONS: Array<{ value: Exclude<SupportTriage, 'unreviewed'>; label: string; confirm?: string }> = [
  { value: 'real', label: 'Real' },
  { value: 'test', label: 'Test', confirm: 'Mark this ticket as TEST? It will be left out of the open, overdue and needs-attention counts. It is kept, and you can change it back.' },
  { value: 'spam', label: 'Spam', confirm: 'Mark this ticket as SPAM? It will be left out of the open, overdue and needs-attention counts. It is kept, and you can change it back.' },
];

export function TriageControl({ ticketId, current }: { ticketId: string; current: SupportTriage }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mark(triage: SupportTriage, confirmText?: string) {
    if (pending || triage === current) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/support/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, triage }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Could not save (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError('Could not save');
    } finally {
      setPending(false);
    }
  }

  return (
    <div data-testid={`triage-control-${ticketId}`} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {OPTIONS.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={current === o.value}
          disabled={pending}
          onClick={() => void mark(o.value, o.confirm)}
          style={{
            padding: '3px 8px', fontSize: 11, borderRadius: 6, cursor: pending ? 'default' : 'pointer',
            border: `1px solid ${current === o.value ? C.accent : C.border}`,
            background: current === o.value ? C.accent + '22' : 'transparent',
            color: current === o.value ? C.accent : C.muted,
          }}
        >
          {o.label}
        </button>
      ))}
      {current !== 'unreviewed' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => void mark('unreviewed')}
          style={{ padding: '3px 8px', fontSize: 11, borderRadius: 6, border: `1px dashed ${C.border}`, background: 'transparent', color: C.muted, cursor: pending ? 'default' : 'pointer' }}
        >
          Clear
        </button>
      )}
      {error && <span role="alert" data-testid="triage-error" style={{ fontSize: 11, color: C.danger }}>{error}</span>}
    </div>
  );
}
