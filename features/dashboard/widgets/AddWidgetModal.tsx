'use client';

import type { WidgetDefinition } from '@/lib/dashboardWidgets/types';

interface AddWidgetModalProps {
  widgets: WidgetDefinition[];
  onSelect: (widgetId: string) => void;
  onClose: () => void;
}

export function AddWidgetModal({ widgets, onSelect, onClose }: AddWidgetModalProps) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div style={{ background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Add Widget</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {widgets.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              All available widgets are already on your dashboard.
            </p>
          ) : widgets.map(w => (
            <button
              key={w.id}
              onClick={() => onSelect(w.id)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left' }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{w.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{w.category}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>+ Add</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
