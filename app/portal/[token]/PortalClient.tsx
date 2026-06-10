'use client';

import { useState } from 'react';
import { customerApproveEstimate, customerDeclineEstimate } from '@/services/portalService';
import type { PortalData, PortalEstimate, PortalInspection } from '@/services/portalService';

/* ── helpers ── */
const money   = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Paid: '#22c55e', Draft: '#94a3b8', Sent: '#3b82f6', Overdue: '#ef4444', Partial: '#f59e0b',
    Approved: '#22c55e', Declined: '#ef4444', Pending: '#f59e0b',
    Complete: '#22c55e', Closed: '#94a3b8', 'In Progress': '#3b82f6', Open: '#f59e0b',
  };
  const color = map[status] ?? '#94a3b8';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: color + '22', color, display: 'inline-block' }}>
      {status}
    </span>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{text}</div>
    </div>
  );
}

type Tab = 'overview' | 'vehicles' | 'invoices' | 'estimates' | 'inspections' | 'history';

export function PortalClient({ data }: { data: PortalData }) {
  const { customer, shop, vehicles, invoices, estimates, inspections, repairOrders } = data;

  const [tab, setTab]                   = useState<Tab>('overview');
  const [actioning, setActioning]       = useState<string | null>(null);
  const [actionMsg, setActionMsg]       = useState('');
  const [expandedEst,  setExpandedEst]  = useState<string | null>(null);
  const [expandedInsp, setExpandedInsp] = useState<string | null>(null);
  const [localEstimates, setLocalEstimates] = useState(estimates);

  const pendingEstimates   = localEstimates.filter(e => e.status === 'Sent' || e.status === 'Pending');
  const outstandingBalance = invoices.reduce((s, i) => s + i.balance, 0);
  const openROs            = repairOrders.filter(r => r.status !== 'Closed' && r.status !== 'Complete');
  const ACCENT             = '#cc0000';

  async function handleApprove(est: PortalEstimate) {
    setActioning(est.id);
    try {
      await customerApproveEstimate(est.id);
      setLocalEstimates(prev => prev.map(e => e.id === est.id ? { ...e, status: 'Approved' } : e));
      setActionMsg(`✅ Estimate ${est.estimateNumber} approved! The shop has been notified.`);
    } catch { setActionMsg('Something went wrong. Please contact the shop.'); }
    finally { setActioning(null); }
  }

  async function handleDecline(est: PortalEstimate) {
    setActioning(est.id);
    try {
      await customerDeclineEstimate(est.id);
      setLocalEstimates(prev => prev.map(e => e.id === est.id ? { ...e, status: 'Declined' } : e));
      setActionMsg(`Estimate ${est.estimateNumber} declined. The shop has been notified.`);
    } catch { setActionMsg('Something went wrong. Please contact the shop.'); }
    finally { setActioning(null); }
  }

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview',    label: '🏠 Overview' },
    { id: 'vehicles',    label: '🚗 Vehicles',    badge: vehicles.length || undefined },
    { id: 'invoices',    label: '🧾 Invoices',    badge: invoices.length  || undefined },
    { id: 'estimates',   label: '📋 Estimates',   badge: pendingEstimates.length || undefined },
    { id: 'inspections', label: '🔍 Inspections', badge: inspections.length || undefined },
    { id: 'history',     label: '🕐 History' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {actionMsg && (
        <div style={{ background: actionMsg.startsWith('✅') ? '#dcfce7' : '#fee2e2', color: actionMsg.startsWith('✅') ? '#16a34a' : '#dc2626', padding: '14px 20px', textAlign: 'center', fontSize: 14, fontWeight: 600, position: 'sticky', top: 0, zIndex: 100 }}>
          {actionMsg}
          <button style={{ marginLeft: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16 }} onClick={() => setActionMsg('')}>✕</button>
        </div>
      )}

      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 20px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {shop.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.logoUrl} alt={shop.name} style={{ height: 48, width: 'auto', objectFit: 'contain' }} />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: 10, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, flexShrink: 0 }}>
              {shop.name[0] ?? 'S'}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>{shop.name}</div>
            {shop.tagline && <div style={{ fontSize: 12, color: '#666' }}>{shop.tagline}</div>}
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#666' }}>
            {shop.phone && <div>📞 {shop.phone}</div>}
            {shop.email && <div>✉️ {shop.email}</div>}
          </div>
        </div>
      </header>

      {/* Welcome bar */}
      <div style={{ background: ACCENT, color: '#fff', padding: '14px 20px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Welcome back, {customer.name.split(' ')[0]}!</span>
            <span style={{ fontSize: 13, marginLeft: 12, opacity: 0.85 }}>Your personal service portal</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {outstandingBalance > 0 && (
              <div style={{ background: 'rgba(255,255,255,.15)', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                💳 Balance: {money(outstandingBalance)}
              </div>
            )}
            {pendingEstimates.length > 0 && (
              <div style={{ background: 'rgba(255,255,0,.2)', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                ⚡ {pendingEstimates.length} estimate{pendingEstimates.length > 1 ? 's' : ''} awaiting approval
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', overflowX: 'auto' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? ACCENT : '#666', borderBottom: tab === t.id ? `2px solid ${ACCENT}` : '2px solid transparent', whiteSpace: 'nowrap' }}
            >
              {t.label}
              {t.badge ? <span style={{ marginLeft: 5, background: t.id === 'estimates' ? '#f59e0b' : ACCENT, color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10 }}>{t.badge}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>

        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {pendingEstimates.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#92400e', marginBottom: 8 }}>
                  ⚡ {pendingEstimates.length} estimate{pendingEstimates.length > 1 ? 's' : ''} waiting for your approval
                </div>
                <div style={{ fontSize: 13, color: '#78350f', marginBottom: 12 }}>Review and approve or decline below.</div>
                <button onClick={() => setTab('estimates')} style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  Review Estimates →
                </button>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
              {[
                { icon: '🚗', label: 'Vehicles',      value: vehicles.length },
                { icon: '🧾', label: 'Invoices',      value: invoices.length },
                { icon: '⏳', label: 'Active ROs',    value: openROs.length },
                { icon: '🔍', label: 'Inspections',   value: inspections.length },
              ].map(c => (
                <div key={c.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 28 }}>{c.icon}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#111', lineHeight: 1.2 }}>{c.value}</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{c.label}</div>
                </div>
              ))}
            </div>

            {outstandingBalance > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>💳 Outstanding Balance</div>
                {invoices.filter(i => i.balance > 0).map(inv => (
                  <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{inv.invoiceNumber}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>{fmtDate(inv.date)}{inv.vehicle ? ` · ${inv.vehicle}` : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: ACCENT }}>{money(inv.balance)}</div>
                      <StatusPill status={inv.status} />
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 12, padding: 12, background: '#f9fafb', borderRadius: 8, textAlign: 'center', fontSize: 13, color: '#666' }}>
                  To pay, contact us at {shop.phone ? <strong>{shop.phone}</strong> : shop.email ? <strong>{shop.email}</strong> : 'the shop'}.
                </div>
              </div>
            )}

            {openROs.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>🔧 Active Repair Orders</div>
                {openROs.map(ro => (
                  <div key={ro.roNumber} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{ro.roNumber}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>{ro.vehicle}</div>
                      {ro.concern && <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>Concern: {ro.concern}</div>}
                    </div>
                    <StatusPill status={ro.status} />
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>📞 Contact Us</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14 }}>
                {shop.phone   && <a href={`tel:${shop.phone}`}     style={{ color: ACCENT, fontWeight: 600, textDecoration: 'none' }}>📞 {shop.phone}</a>}
                {shop.email   && <a href={`mailto:${shop.email}`}  style={{ color: ACCENT, fontWeight: 600, textDecoration: 'none' }}>✉️ {shop.email}</a>}
                {shop.address && <span style={{ color: '#555' }}>📍 {shop.address}</span>}
              </div>
            </div>
          </div>
        )}

        {/* VEHICLES */}
        {tab === 'vehicles' && (
          vehicles.length === 0 ? <EmptyState icon="🚗" text="No vehicles on file yet." /> :
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 14 }}>
            {vehicles.map(v => (
              <div key={v.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 28 }}>🚗</span>
                  <StatusPill status={v.status} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{v.year} {v.make} {v.model}</div>
                {v.color && <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{v.color}</div>}
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: '#888' }}>
                  {v.vin          && <div>VIN: <code style={{ fontSize: 11 }}>{v.vin}</code></div>}
                  {v.licensePlate && <div>Plate: <strong>{v.licensePlate}</strong></div>}
                  {v.mileage > 0  && <div>Mileage: <strong>{v.mileage.toLocaleString()} mi</strong></div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* INVOICES */}
        {tab === 'invoices' && (
          invoices.length === 0 ? <EmptyState icon="🧾" text="No invoices on file yet." /> :
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {invoices.map(inv => (
              <div key={inv.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{inv.invoiceNumber}</div>
                    <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{fmtDate(inv.date)}{inv.vehicle ? ` · ${inv.vehicle}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <StatusPill status={inv.status} />
                    <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{money(inv.total)}</div>
                  </div>
                </div>
                {inv.balance > 0 && (
                  <div style={{ marginTop: 10, padding: '8px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#991b1b' }}>Balance:</span>
                    <strong style={{ color: '#991b1b' }}>{money(inv.balance)}</strong>
                  </div>
                )}
                {inv.balance === 0 && inv.amountPaid > 0 && (
                  <div style={{ marginTop: 10, padding: '8px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#166534', fontWeight: 600 }}>
                    ✅ Paid in full — Thank you!
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ESTIMATES */}
        {tab === 'estimates' && (
          localEstimates.length === 0 ? <EmptyState icon="📋" text="No estimates on file." /> :
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {localEstimates.map(est => {
              const isPending  = est.status === 'Sent' || est.status === 'Pending';
              const isExpanded = expandedEst === est.id;
              return (
                <div key={est.id} style={{ background: '#fff', border: `1px solid ${isPending ? '#f59e0b' : '#e5e7eb'}`, borderRadius: 12, overflow: 'hidden' }}>
                  {isPending && <div style={{ background: '#fffbeb', padding: '8px 20px', fontSize: 12, fontWeight: 700, color: '#92400e' }}>⚡ Action required — please approve or decline</div>}
                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{est.estimateNumber}</div>
                        <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{fmtDate(est.date)}{est.vehicle ? ` · ${est.vehicle}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <StatusPill status={est.status} />
                        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{money(est.total)}</div>
                      </div>
                    </div>

                    {est.lineItems.length > 0 && (
                      <button onClick={() => setExpandedEst(isExpanded ? null : est.id)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: '#666', marginTop: 10 }}>
                        {isExpanded ? '▲ Hide details' : `▼ View ${est.lineItems.length} line item${est.lineItems.length > 1 ? 's' : ''}`}
                      </button>
                    )}

                    {isExpanded && (
                      <div style={{ marginTop: 12, border: '1px solid #f3f4f6', borderRadius: 8, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: '#f9fafb' }}>
                              {['Description', 'Qty', 'Price', 'Total'].map(h => (
                                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#999', textTransform: 'uppercase', fontWeight: 600 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {est.lineItems.map((li, i) => (
                              <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '8px 12px' }}>{li.description}</td>
                                <td style={{ padding: '8px 12px' }}>{li.qty}</td>
                                <td style={{ padding: '8px 12px' }}>{money(li.unitPrice)}</td>
                                <td style={{ padding: '8px 12px', fontWeight: 700 }}>{money(li.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {isPending && (
                      <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                        <button onClick={() => handleApprove(est)} disabled={actioning === est.id} style={{ flex: 1, padding: 12, background: '#22c55e', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: actioning ? 0.6 : 1 }}>
                          {actioning === est.id ? '…' : '✅ Approve'}
                        </button>
                        <button onClick={() => handleDecline(est)} disabled={actioning === est.id} style={{ flex: 1, padding: 12, background: '#fff', color: '#ef4444', border: '2px solid #ef4444', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: actioning ? 0.6 : 1 }}>
                          {actioning === est.id ? '…' : '✕ Decline'}
                        </button>
                      </div>
                    )}
                    {est.status === 'Approved' && (
                      <div style={{ marginTop: 12, padding: 10, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#166534', fontWeight: 600, textAlign: 'center' }}>
                        ✅ You approved this estimate — the shop will be in touch to schedule.
                      </div>
                    )}
                    {est.status === 'Declined' && (
                      <div style={{ marginTop: 12, padding: 10, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, color: '#991b1b', textAlign: 'center' }}>
                        This estimate was declined. Contact us to discuss options.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* INSPECTIONS */}
        {tab === 'inspections' && (
          inspections.length === 0 ? <EmptyState icon="🔍" text="No inspection reports on file." /> :
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {inspections.map((insp: PortalInspection) => {
              const isExpanded = expandedInsp === insp.id;
              const total = insp.passCount + insp.attentionCount + insp.failCount;
              const colorMap: Record<string, string> = { Pass: '#22c55e', Attention: '#f59e0b', Fail: '#ef4444', 'N/A': '#94a3b8' };
              return (
                <div key={insp.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{insp.inspectionNumber}</div>
                        <div style={{ fontSize: 13, color: '#666' }}>{fmtDate(insp.date)}{insp.vehicle ? ` · ${insp.vehicle}` : ''}</div>
                        {insp.technicianName && <div style={{ fontSize: 12, color: '#999' }}>Inspector: {insp.technicianName}</div>}
                      </div>
                      <StatusPill status={insp.status} />
                    </div>
                    {total > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 6 }}>
                          {insp.passCount > 0      && <div style={{ width: `${(insp.passCount / total) * 100}%`,      background: '#22c55e' }} />}
                          {insp.attentionCount > 0 && <div style={{ width: `${(insp.attentionCount / total) * 100}%`, background: '#f59e0b' }} />}
                          {insp.failCount > 0      && <div style={{ width: `${(insp.failCount / total) * 100}%`,      background: '#ef4444' }} />}
                        </div>
                        <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
                          {insp.passCount > 0      && <span style={{ color: '#16a34a' }}>✅ {insp.passCount} Pass</span>}
                          {insp.attentionCount > 0 && <span style={{ color: '#d97706' }}>⚠️ {insp.attentionCount} Attention</span>}
                          {insp.failCount > 0      && <span style={{ color: '#dc2626' }}>❌ {insp.failCount} Fail</span>}
                        </div>
                      </div>
                    )}
                    {insp.items.length > 0 && (
                      <button onClick={() => setExpandedInsp(isExpanded ? null : insp.id)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: '#666', marginTop: 12 }}>
                        {isExpanded ? '▲ Hide checklist' : '▼ View full checklist'}
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #f3f4f6' }}>
                      {[...new Set(insp.items.map(i => i.category))].map(cat => (
                        <div key={cat}>
                          <div style={{ padding: '8px 20px', background: '#f9fafb', fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.05em' }}>{cat}</div>
                          {insp.items.filter(i => i.category === cat).map((item, idx) => (
                            <div key={idx} style={{ padding: '10px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                              <span style={{ fontSize: 16, flexShrink: 0 }}>
                                {item.status === 'Pass' ? '✅' : item.status === 'Fail' ? '❌' : item.status === 'Attention' ? '⚠️' : '—'}
                              </span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</div>
                                {item.notes && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{item.notes}</div>}
                                {item.photoUrl && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={item.photoUrl} alt={item.name} style={{ marginTop: 8, width: 120, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />
                                )}
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: colorMap[item.status] ?? '#94a3b8', whiteSpace: 'nowrap' }}>{item.status}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* HISTORY */}
        {tab === 'history' && (
          repairOrders.length === 0 && invoices.length === 0
            ? <EmptyState icon="🕐" text="No service history yet." />
            : (
              <div style={{ position: 'relative', paddingLeft: 28 }}>
                <div style={{ position: 'absolute', left: 9, top: 0, bottom: 0, width: 2, background: '#e5e7eb' }} />
                {[
                  ...repairOrders.map(r => ({ date: r.date, type: 'ro'      as const, data: r })),
                  ...invoices.map(i =>     ({ date: i.date, type: 'invoice' as const, data: i })),
                ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                 .map((item, i) => (
                  <div key={i} style={{ marginBottom: 20, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: -20, top: 4, width: 12, height: 12, borderRadius: '50%', background: item.type === 'ro' ? '#3b82f6' : '#22c55e', border: '2px solid #fff', boxShadow: `0 0 0 2px ${item.type === 'ro' ? '#3b82f6' : '#22c55e'}` }} />
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px' }}>
                      {item.type === 'ro' && (() => {
                        const ro = item.data as typeof repairOrders[number];
                        return (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                              <div><span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700 }}>🔧 Repair Order</span><span style={{ fontSize: 13, fontWeight: 700, marginLeft: 10 }}>{ro.roNumber}</span></div>
                              <div style={{ fontSize: 12, color: '#888' }}>{fmtDate(ro.date)}</div>
                            </div>
                            {ro.vehicle && <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{ro.vehicle}</div>}
                            {ro.concern && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Concern: {ro.concern}</div>}
                            {ro.correction && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>✔ {ro.correction}</div>}
                            <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                              <StatusPill status={ro.status} />
                              <span style={{ fontSize: 13, color: '#888' }}>Total: <strong>{money(ro.total)}</strong></span>
                            </div>
                          </>
                        );
                      })()}
                      {item.type === 'invoice' && (() => {
                        const inv = item.data as typeof invoices[number];
                        return (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                              <div><span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>🧾 Invoice</span><span style={{ fontSize: 13, fontWeight: 700, marginLeft: 10 }}>{inv.invoiceNumber}</span></div>
                              <div style={{ fontSize: 12, color: '#888' }}>{fmtDate(inv.date)}</div>
                            </div>
                            {inv.vehicle && <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{inv.vehicle}</div>}
                            <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                              <StatusPill status={inv.status} />
                              <span style={{ fontSize: 13, color: '#888' }}>Total: <strong>{money(inv.total)}</strong></span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )
        )}
      </main>

      <footer style={{ textAlign: 'center', padding: '24px 20px', color: '#999', fontSize: 12, borderTop: '1px solid #e5e7eb', background: '#fff', marginTop: 40 }}>
        <div style={{ marginBottom: 4, fontWeight: 600, color: '#555' }}>{shop.name}</div>
        {shop.address && <div>{shop.address}</div>}
        <div style={{ marginTop: 8, color: '#ccc' }}>Powered by Redlined1 CRM · Your information is private and secure.</div>
      </footer>
    </div>
  );
}
