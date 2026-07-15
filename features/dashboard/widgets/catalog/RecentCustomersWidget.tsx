'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

interface RecentCustomer { id: string; name: string; phone: string }

export function RecentCustomersWidget({ onNav: nav }: WidgetProps) {
  const [customers, setCustomers] = useState<RecentCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('customers')
          .select('id, name, phone')
          .eq('shop_id', getShopId())
          .order('created_at', { ascending: false })
          .limit(5);
        setCustomers(data ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return null;

  return (
    <Panel title="Recent Customers" hint="Latest 5 customers added">
      {customers.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>No customers yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {customers.map(c => (
            <div key={c.id} onClick={() => nav('customers')} className="dash-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              <span style={{ color: 'var(--muted)' }}>{c.phone}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
