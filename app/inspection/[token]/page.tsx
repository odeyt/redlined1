'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const STATUS_COLOR: Record<string, string> = {
  Pass: '#4caf50', Attention: '#ff9800', Fail: '#f44336', 'N/A': '#888',
};

interface InspectionItem {
  id: string; category: string; name: string;
  status: string; notes: string; photoUrl: string;
}

interface CustomerApproval {
  approvedBy: string; approvedAt: string; decision: string;
  approvedItems: string[]; declinedItems: string[]; customerMessage: string;
}

interface PageData {
  inspection: {
    inspection_number: string; vehicle: string; vin: string; mileage: number;
    technician: string; status: string; items: InspectionItem[];
    notes: string; customer_name: string; created_at: string;
    completed_at: string | null; customer_approval: CustomerApproval | null;
  };
  shopName: string; shopPhone: string; shopAddress: string;
  shopLogoUrl: string; shopEmail: string;
}

export default function InspectionSharePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState('');

  // Approval state
  const [itemDecisions, setItemDecisions] = useState<Record<string, 'approved' | 'declined'>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerMessage, setCustomerMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ decision: string; newStatus: string } | null>(null);

  useEffect(() => {
    fetch(`/api/inspection-share?token=${token}`)
      .then(r => r.json())
      .then(j => {
        if (j.error) { setError(j.error); return; }
        setData(j);
        // Pre-fill name from customer record
        if (j.inspection?.customer_name) setCustomerName(j.inspection.customer_name);
        // If already approved, mark submitted
        if (j.inspection?.customer_approval?.approvedAt) {
          setSubmitted(true);
          setSubmitResult({
            decision: j.inspection.customer_approval.decision,
            newStatus: j.inspection.status,
          });
        }
      })
      .catch(() => setError('Failed to load inspection.'));
  }, [token]);

  async function handleSubmitApproval() {
    if (!customerName.trim()) { setSubmitError('Please enter your name to confirm your decision.'); return; }
    const actionItems = data!.inspection.items.filter(i => i.status === 'Fail' || i.status === 'Attention');
    const undecided = actionItems.filter(i => !itemDecisions[i.id]);
    if (undecided.length > 0) { setSubmitError('Please approve or decline every highlighted item before submitting.'); return; }

    setSubmitting(true); setSubmitError('');
    try {
      const approvedItems = Object.entries(itemDecisions).filter(([, v]) => v === 'approved').map(([k]) => k);
      const declinedItems = Object.entries(itemDecisions).filter(([, v]) => v === 'declined').map(([k]) => k);
      const res = await fetch('/api/inspection-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, approvedBy: customerName.trim(), approvedItems, declinedItems, customerMessage }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSubmitted(true);
      setSubmitResult(json);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Submission failed. Please try again.');
    } finally { setSubmitting(false); }
  }

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f4f4', fontFamily: 'sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Inspection Not Found</div>
        <div style={{ color: '#666', fontSize: 14 }}>{error}</div>
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f4f4', fontFamily: 'sans-serif' }}>
      <div style={{ color: '#666' }}>Loading inspection…</div>
    </div>
  );

  const { inspection: ins, shopName, shopPhone, shopAddress, shopLogoUrl, shopEmail } = data;
  const items: InspectionItem[] = ins.items ?? [];
  const failCount = items.filter(i => i.status === 'Fail').length;
  const attnCount = items.filter(i => i.status === 'Attention').length;
  const passCount = items.filter(i => i.status === 'Pass').length;
  const categories = [...new Set(items.map(i => i.category))];
  const dateStr = new Date(ins.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const actionItems = items.filter(i => i.status === 'Fail' || i.status === 'Attention');
  const existingApproval = ins.customer_approval;

  const decisionLabel = (d: string) =>
    d === 'approved' ? 'All repairs approved ✓' :
    d === 'partial'  ? 'Some repairs approved' :
    'All repairs declined';

  const decisionColor = (d: string) =>
    d === 'approved' ? '#2e7d32' : d === 'partial' ? '#e65100' : '#c62828';

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f4', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', paddingBottom: 60 }}>

      {/* Header */}
      <div style={{ background: '#cc0000', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
        {shopLogoUrl && <img src={shopLogoUrl} alt="Logo" style={{ height: 40, objectFit: 'contain', borderRadius: 6 }} />}
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{shopName}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>Digital Vehicle Inspection</div>
        </div>
        <button onClick={() => window.print()}
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          🖨 Print
        </button>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px' }}>

        {/* Inspection info card */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px 22px', marginBottom: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Inspection</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#111' }}>{ins.inspection_number}</div>
              <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{ins.customer_name}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vehicle</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#333' }}>{ins.vehicle}</div>
              {ins.vin && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>VIN: {ins.vin}</div>}
              {ins.mileage > 0 && <div style={{ fontSize: 11, color: '#888' }}>{Number(ins.mileage).toLocaleString()} mi</div>}
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Date</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{dateStr}</div>
              {ins.technician && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Tech: {ins.technician}</div>}
            </div>
          </div>
        </div>

        {/* Summary badges */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Fail', count: failCount, color: '#f44336', bg: '#fff5f5', border: '#fecaca' },
            { label: 'Attention', count: attnCount, color: '#ff9800', bg: '#fffbeb', border: '#fde68a' },
            { label: 'Pass', count: passCount, color: '#4caf50', bg: '#f0fdf4', border: '#bbf7d0' },
          ].map(({ label, count, color, bg, border }) => (
            <div key={label} style={{ textAlign: 'center', background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '16px 8px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 30, fontWeight: 900, color }}>{count}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── APPROVAL SECTION ─────────────────────────────────────────── */}
        {actionItems.length > 0 && (
          submitted || existingApproval ? (
            /* Already approved — confirmation banner */
            <div style={{ background: '#fff', borderRadius: 12, padding: '24px 22px', marginBottom: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', borderTop: `4px solid ${decisionColor(existingApproval?.decision ?? submitResult?.decision ?? 'approved')}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 36 }}>{(existingApproval?.decision ?? submitResult?.decision) === 'declined' ? '🚫' : '✅'}</div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: decisionColor(existingApproval?.decision ?? submitResult?.decision ?? 'approved') }}>
                    {decisionLabel(existingApproval?.decision ?? submitResult?.decision ?? 'approved')}
                  </div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                    Submitted by <strong>{existingApproval?.approvedBy}</strong> · {new Date(existingApproval?.approvedAt ?? '').toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
              </div>
              {(existingApproval?.approvedItems?.length ?? 0) > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#2e7d32', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Approved for Repair</div>
                  {(existingApproval?.approvedItems ?? []).map(id => {
                    const item = items.find(i => i.id === id);
                    return item ? <div key={id} style={{ fontSize: 13, color: '#333', padding: '2px 0' }}>✓ {item.name}</div> : null;
                  })}
                </div>
              )}
              {(existingApproval?.declinedItems?.length ?? 0) > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#c62828', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Declined</div>
                  {(existingApproval?.declinedItems ?? []).map(id => {
                    const item = items.find(i => i.id === id);
                    return item ? <div key={id} style={{ fontSize: 13, color: '#555', padding: '2px 0' }}>✗ {item.name}</div> : null;
                  })}
                </div>
              )}
              {existingApproval?.customerMessage && (
                <div style={{ marginTop: 8, padding: '10px 14px', background: '#f8f8f8', borderRadius: 8, fontSize: 13, color: '#444', fontStyle: 'italic' }}>
                  "{existingApproval.customerMessage}"
                </div>
              )}
              <div style={{ marginTop: 12, fontSize: 12, color: '#aaa' }}>Your response has been sent to {shopName}. They will contact you to confirm next steps.</div>
            </div>
          ) : (
            /* Approval form */
            <div style={{ background: '#fff', borderRadius: 12, padding: '24px 22px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.1)', border: '2px solid #cc0000' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#111', marginBottom: 4 }}>⚠️ Action Required</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
                Review the items below and approve or decline each repair. Your response is sent directly to {shopName}.
              </div>

              {/* Per-item decisions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {actionItems.map(item => {
                  const decision = itemDecisions[item.id];
                  return (
                    <div key={item.id} style={{
                      borderRadius: 10, border: `1px solid ${decision === 'approved' ? '#86efac' : decision === 'declined' ? '#fca5a5' : '#e0e0e0'}`,
                      background: decision === 'approved' ? '#f0fdf4' : decision === 'declined' ? '#fff5f5' : '#fafafa',
                      padding: '14px 16px', transition: 'all 0.15s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_COLOR[item.status], flexShrink: 0, marginTop: 4 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{item.name}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[item.status], textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.status}</div>
                          {item.notes && <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{item.notes}</div>}
                          {item.photoUrl && (
                            <a href={item.photoUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6 }}>
                              <img src={item.photoUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
                            </a>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => setItemDecisions(d => ({ ...d, [item.id]: 'approved' }))}
                          style={{
                            flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                            border: `2px solid ${decision === 'approved' ? '#16a34a' : '#d1d5db'}`,
                            background: decision === 'approved' ? '#16a34a' : '#fff',
                            color: decision === 'approved' ? '#fff' : '#555',
                            transition: 'all 0.15s',
                          }}>
                          ✓ Approve Repair
                        </button>
                        <button
                          onClick={() => setItemDecisions(d => ({ ...d, [item.id]: 'declined' }))}
                          style={{
                            flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                            border: `2px solid ${decision === 'declined' ? '#dc2626' : '#d1d5db'}`,
                            background: decision === 'declined' ? '#dc2626' : '#fff',
                            color: decision === 'declined' ? '#fff' : '#555',
                            transition: 'all 0.15s',
                          }}>
                          ✗ Not Now
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Message to shop */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>Message to Shop (optional)</label>
                <textarea
                  value={customerMessage}
                  onChange={e => setCustomerMessage(e.target.value)}
                  placeholder="e.g. Please call me before starting the brake work."
                  rows={2}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, color: '#333', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              {/* Name / e-signature */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>Your Full Name <span style={{ color: '#cc0000' }}>*</span> <span style={{ fontWeight: 400, color: '#aaa' }}>(serves as your digital signature)</span></label>
                <input
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Type your full name"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '2px solid #d1d5db', fontSize: 15, color: '#111', boxSizing: 'border-box', fontFamily: 'Georgia, serif' }}
                />
              </div>

              {submitError && (
                <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#c62828', marginBottom: 12 }}>
                  {submitError}
                </div>
              )}

              <button
                onClick={handleSubmitApproval}
                disabled={submitting}
                style={{
                  width: '100%', padding: '15px 0', borderRadius: 10, background: submitting ? '#999' : '#cc0000',
                  color: '#fff', fontSize: 16, fontWeight: 800, border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.02em',
                }}>
                {submitting ? 'Submitting…' : 'Submit My Decision →'}
              </button>
              <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 8 }}>
                Your response is legally binding and timestamped. You can contact {shopName} to change your decision.
              </div>
            </div>
          )
        )}

        {/* Full checklist */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px 22px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#111', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Full Inspection Results</div>
          {categories.map(cat => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em', paddingBottom: 6, borderBottom: '1px solid #eee', marginBottom: 6 }}>{cat}</div>
              {items.filter(i => i.category === cat).map(item => (
                <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[item.status] ?? '#888', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: '#333' }}>{item.name}</span>
                  {item.notes && <span style={{ fontSize: 12, color: '#888' }}>{item.notes}</span>}
                  <span style={{ fontSize: 12, fontWeight: 800, color: STATUS_COLOR[item.status] ?? '#888', minWidth: 60, textAlign: 'right' }}>{item.status}</span>
                  {item.photoUrl && (
                    <a href={item.photoUrl} target="_blank" rel="noreferrer">
                      <img src={item.photoUrl} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {ins.notes && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Technician Notes</div>
            <div style={{ fontSize: 13, color: '#444' }}>{ins.notes}</div>
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: 12, color: '#aaa', paddingTop: 8 }}>
          {shopName}{shopPhone ? ` · ${shopPhone}` : ''}{shopEmail ? ` · ${shopEmail}` : ''}
          {shopAddress && <div style={{ marginTop: 2 }}>{shopAddress}</div>}
        </div>
      </div>
    </div>
  );
}
