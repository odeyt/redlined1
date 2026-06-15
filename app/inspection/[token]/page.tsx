'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const STATUS_COLOR: Record<string, string> = {
  Pass: '#4caf50', Attention: '#ff9800', Fail: '#f44336', 'N/A': '#888',
};
const STATUS_BG: Record<string, string> = {
  Pass: '#f0fdf4', Attention: '#fffbeb', Fail: '#fff5f5', 'N/A': '#f9f9f9',
};

interface InspectionItem {
  id: string; category: string; name: string;
  status: string; notes: string; photoUrl: string;
}

interface PageData {
  inspection: {
    inspection_number: string; vehicle: string; vin: string; mileage: number;
    technician: string; status: string; items: InspectionItem[];
    notes: string; customer_name: string; created_at: string; completed_at: string | null;
  };
  shopName: string; shopPhone: string; shopAddress: string; shopLogoUrl: string; shopEmail: string;
}

export default function InspectionSharePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/inspection-share?token=${token}`)
      .then(r => r.json())
      .then(j => {
        if (j.error) setError(j.error);
        else setData(j);
      })
      .catch(() => setError('Failed to load inspection.'));
  }, [token]);

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

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f4', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', paddingBottom: 40 }}>
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

        {/* Items needing attention callout */}
        {(failCount > 0 || attnCount > 0) && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>⚠️ Items Requiring Attention</div>
            {items.filter(i => i.status === 'Fail' || i.status === 'Attention').map(item => (
              <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', fontSize: 13 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[item.status], flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{item.name}</span>
                <span style={{ color: STATUS_COLOR[item.status], fontWeight: 700, fontSize: 12 }}>{item.status}</span>
                {item.notes && <span style={{ color: '#888', fontSize: 12 }}>— {item.notes}</span>}
              </div>
            ))}
          </div>
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

        {/* Footer contact */}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#aaa', paddingTop: 8 }}>
          {shopName}{shopPhone ? ` · ${shopPhone}` : ''}{shopEmail ? ` · ${shopEmail}` : ''}
          {shopAddress && <div style={{ marginTop: 2 }}>{shopAddress}</div>}
        </div>
      </div>
    </div>
  );
}
