'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

interface RecentVehicle { id: string; label: string; plate: string }

export function RecentVehiclesWidget({ onNav: nav }: WidgetProps) {
  const [vehicles, setVehicles] = useState<RecentVehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('vehicles')
          .select('id, label, plate')
          .eq('shop_id', getShopId())
          .order('created_at', { ascending: false })
          .limit(5);
        setVehicles(data ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return null;

  return (
    <Panel title="Recent Vehicles" hint="Latest 5 vehicles added">
      {vehicles.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>No vehicles yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {vehicles.map(v => (
            <div key={v.id} onClick={() => nav('vehicles')} className="dash-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{v.label}</span>
              <span style={{ color: 'var(--muted)' }}>{v.plate}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
