'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

interface Stage { id: string; label: string; icon: string; }
interface HistoryEntry { stage: string; label: string; icon: string; advancedAt: string; notifiedSms: boolean; notifiedEmail: boolean; }

interface PageData {
  job: { customer: string; vehicle: string; serviceType: string; repairStage: string; stageHistory: HistoryEntry[]; checkInDate: string; };
  stages: Stage[];
  shopName: string; shopPhone: string; shopAddress: string; shopLogoUrl: string; shopEmail: string;
}

const STAGE_DESCS: Record<string, string> = {
  checked_in:    'Your vehicle has been checked in and is in our queue.',
  inspecting:    'Our technician is performing a full vehicle inspection.',
  waiting_parts: 'Parts have been ordered and are on their way.',
  in_repair:     'Your vehicle is currently being repaired by our team.',
  quality_check: 'Repairs are complete. Final quality check in progress.',
  ready:         'Your vehicle is ready! Come pick it up anytime.',
};

export default function StatusPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pulse, setPulse] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/job-status?token=${token}`)
      .then(r => r.json())
      .then(j => {
        if (j.error) { setError(j.error); return; }
        setData(prev => {
          if (prev && prev.job.repairStage !== j.job.repairStage) setPulse(true);
          return j;
        });
        setLastUpdated(new Date());
      })
      .catch(() => setError('Failed to load status.'));
  }, [token]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (pulse) { const t = setTimeout(() => setPulse(false), 2000); return () => clearTimeout(t); }
  }, [pulse]);

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f4f4', fontFamily: 'sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', maxWidth: 380 }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>🔧</div>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Status Not Found</div>
        <div style={{ color: '#666', fontSize: 14 }}>{error}</div>
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f4f4', fontFamily: 'sans-serif' }}>
      <div style={{ color: '#666', fontSize: 15 }}>Loading status…</div>
    </div>
  );

  const { job, stages, shopName, shopPhone, shopAddress, shopLogoUrl, shopEmail } = data;
  const currentIdx = stages.findIndex(s => s.id === job.repairStage);
  const isReady = job.repairStage === 'ready';
  const currentStage = stages[currentIdx];
  const checkInDate = new Date(job.checkInDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', paddingBottom: 60 }}>

      {/* Header */}
      <div style={{ background: isReady ? '#1b5e20' : '#cc0000', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, transition: 'background 0.6s' }}>
        {shopLogoUrl && <img src={shopLogoUrl} alt="" style={{ height: 38, objectFit: 'contain', borderRadius: 6 }} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>{shopName}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Live Repair Status</div>
        </div>
        {lastUpdated && (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textAlign: 'right' }}>
            Updated<br />{lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px' }}>

        {/* Vehicle card */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', marginBottom: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Customer</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#111' }}>{job.customer}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Vehicle</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#333' }}>{job.vehicle}</div>
              <div style={{ fontSize: 12, color: '#888' }}>{job.serviceType}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Checked In</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{checkInDate}</div>
            </div>
          </div>
        </div>

        {/* Current status hero */}
        <div style={{
          background: isReady ? 'linear-gradient(135deg,#1b5e20,#2e7d32)' : 'linear-gradient(135deg,#b71c1c,#cc0000)',
          borderRadius: 16, padding: '28px 24px', marginBottom: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          animation: pulse ? 'pulse 0.4s ease' : undefined,
          transition: 'background 0.6s',
        }}>
          <style>{`@keyframes pulse{0%{transform:scale(1)}50%{transform:scale(1.02)}100%{transform:scale(1)}}`}</style>
          <div style={{ fontSize: 44, marginBottom: 8 }}>{currentStage?.icon ?? '🔧'}</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', marginBottom: 6 }}>{currentStage?.label ?? job.repairStage}</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>{STAGE_DESCS[job.repairStage] ?? ''}</div>
          {isReady && shopPhone && (
            <a href={`tel:${shopPhone}`} style={{ display: 'inline-block', marginTop: 16, background: '#fff', color: '#1b5e20', padding: '10px 22px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              📞 Call {shopName}
            </a>
          )}
        </div>

        {/* Progress tracker */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '20px 20px', marginBottom: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#777', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 18 }}>Repair Progress</div>

          {/* Progress bar */}
          <div style={{ position: 'relative', marginBottom: 24 }}>
            <div style={{ height: 4, background: '#eee', borderRadius: 4, margin: '0 0 0 12px' }}>
              <div style={{ height: '100%', background: isReady ? '#2e7d32' : '#cc0000', borderRadius: 4, width: `${(currentIdx / (stages.length - 1)) * 100}%`, transition: 'width 0.6s ease' }} />
            </div>
          </div>

          {/* Stage steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stages.map((stage, idx) => {
              const done = idx < currentIdx;
              const active = idx === currentIdx;
              const histEntry = job.stageHistory?.find(h => h.stage === stage.id);
              return (
                <div key={stage.id} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  {/* Circle */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: done ? '#2e7d32' : active ? (isReady ? '#2e7d32' : '#cc0000') : '#f0f0f0',
                    boxShadow: active ? `0 0 0 4px ${isReady ? '#a5d6a722' : '#cc000022'}` : 'none',
                    transition: 'all 0.4s',
                    fontSize: 16,
                  }}>
                    {done ? <span style={{ color: '#fff', fontSize: 16, fontWeight: 900 }}>✓</span>
                           : <span style={{ fontSize: 16 }}>{active ? stage.icon : <span style={{ color: '#bbb' }}>{stage.icon}</span>}</span>}
                  </div>
                  {/* Label */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: active ? 800 : done ? 600 : 400, color: active ? '#111' : done ? '#333' : '#aaa' }}>
                      {stage.label}
                    </div>
                    {histEntry && (
                      <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                        {new Date(histEntry.advancedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        {(histEntry.notifiedSms || histEntry.notifiedEmail) && (
                          <span style={{ marginLeft: 6, color: '#2196f3' }}>
                            {histEntry.notifiedSms ? '📱' : ''}{histEntry.notifiedEmail ? '✉️' : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {active && <div style={{ fontSize: 11, fontWeight: 700, color: isReady ? '#2e7d32' : '#cc0000', background: isReady ? '#e8f5e9' : '#fff5f5', padding: '3px 10px', borderRadius: 10 }}>NOW</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Auto-refresh notice */}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#bbb', marginBottom: 16 }}>
          🔄 This page refreshes automatically every 30 seconds
        </div>

        {/* Shop contact */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 6 }}>{shopName}</div>
          {shopAddress && <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{shopAddress}</div>}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            {shopPhone && <a href={`tel:${shopPhone}`} style={{ fontSize: 13, color: '#cc0000', fontWeight: 600, textDecoration: 'none' }}>📞 {shopPhone}</a>}
            {shopEmail && <a href={`mailto:${shopEmail}`} style={{ fontSize: 13, color: '#cc0000', fontWeight: 600, textDecoration: 'none' }}>✉️ {shopEmail}</a>}
          </div>
        </div>
      </div>
    </div>
  );
}
